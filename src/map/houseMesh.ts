// Häuser auf der Karte als echte 3D-Häuser: Wände mit Fassadenbildern (die Fenster sitzen
// stockwerksgenau), Satteldächer mit Ziegeln, Zeltdächer, Flachdächer, Ruinen ohne Dach.
//
// Reine Rechnung ohne Browser: Aus dem Grundriss werden Dreiecke mit Bildkoordinaten und
// Farbtönen. Gezeichnet wird in map/treeLayer.ts. Koordinaten wie dort: x = Osten,
// y = oben, z = Süden (Meter um die Mitte der Detail-Ebene).

import { ShapeUtils, Vector2 } from 'three';

import { addProp, addShop, type PropSpec, type ShopSpec, type Signs } from './landmarks';
import { dist, emptyMesh, quad, tri, type MeshData, type P3, type Pt, type RGB } from './meshKit';

export type { Pt };

export type FacadeKind = 'putz' | 'klinker' | 'fachwerk';
export const FACADES: readonly FacadeKind[] = ['putz', 'klinker', 'fachwerk'];

export interface HouseSpec {
  /** Grundriss in Metern (x Osten, y Norden). */
  ring: Pt[];
  base: number;
  top: number;
  /** Fassadenbild, oder null: schlichte Wand in der Farbe tint (Schuppen, Garagen). */
  facade: FacadeKind | null;
  /** Farbton über dem Fassadenbild (1 = unverändert) bzw. Wandfarbe (sRGB, 0–1). */
  tint: RGB;
  state: 'intact' | 'burnt' | 'ruin';
  /** pitched: Sattel- oder Zeltdach, je nach Grundriss (sonst flach). */
  roof: 'pitched' | 'flat' | 'none';
  /** Farbton über den Dachziegeln. */
  roofTint: RGB;
  /** Farbe von Flachdächern. */
  flatColor: RGB;
  /** Dachneigung als Höhe pro Meter (0,7 ≈ 35°, 1 = 45°). */
  slope: number;
  chimney: boolean;
  /** Dunkler Sockel unten. */
  plinth: boolean;
  /** Zufallszahl 0–1 für Kleinigkeiten (Ruinenkanten, Schornstein). */
  seed: number;
  /** Winter: Schnee auf den Dächern. */
  snow?: boolean;
  /** Echter Laden, Apotheke, Supermarkt …: Ladenfront und Schild. */
  shop?: ShopSpec;
}

/** Ein Fassadenbild ist zwei Fenster breit und zwei Stockwerke hoch. */
export const FACADE_W = 6;
export const FLOOR_H = 2.9;
const FACADE_H = FLOOR_H * 2;
/** Das Erdgeschoss fängt etwas über dem Boden an (darunter der Sockel). */
export const GROUND_M = 0.5;
/** So viele Meter zeigt ein Dachziegelbild. */
const ROOF_M = 7;
/** Dachüberstand (Meter). */
const OVERHANG = 0.35;

const PLINTH: RGB = [0.42, 0.38, 0.34];
const CHIMNEY: RGB = [0.52, 0.36, 0.28];
const RUBBLE: RGB = [0.36, 0.33, 0.3];
/** Verschneite Ziegel: das Bild gedämpft, darüber hell (siehe treeLayer, „roofSnow“). */
const SNOW_TINT: RGB = [0.55, 0.54, 0.54];

export type MatKey = FacadeKind | 'roof' | 'roofSnow' | 'plain';
export type { MeshData };
export interface HouseMeshes {
  meshes: Record<MatKey, MeshData>;
  /** Weicher Schatten am Boden (nur Lage, ein Farbton). */
  shadow: number[];
  /** Schilder: je Bild ein Topf (Schlüssel siehe map/landmarks.ts). */
  signs: Signs;
}


function areaOf(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

function centroidOf(r: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of r) {
    x += p[0];
    y += p[1];
  }
  return [x / r.length, y / r.length];
}

/** Grundriss aufräumen: Endpunkt = Anfang weg, doppelte und fast gerade Punkte weg. */
export function cleanRing(ring: Pt[]): Pt[] {
  let r = ring.slice();
  if (r.length > 1 && dist(r[0], r[r.length - 1]) < 0.01) r.pop();
  r = r.filter((p, i) => dist(p, r[(i + 1) % r.length]) > 0.05);
  // Punkte auf einer Geraden zwischen ihren Nachbarn bringen nur kaputte Fensterreihen
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 0.02 * dist(a, b) * dist(b, c) + 1e-9) {
        r.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return r;
}

/** Kleinstes umschließendes Rechteck, ausgerichtet an einer Kante des Grundrisses. */
export function orientedBox(r: Pt[]) {
  let best = { area: Infinity, ang: 0, cx: 0, cy: 0, L: 0, W: 0 };
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of r) {
      const px = x * c + y * s;
      const py = -x * s + y * c;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area < best.area) {
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      best = { area, ang, cx: mx * c - my * s, cy: mx * s + my * c, L: x1 - x0, W: y1 - y0 };
    }
  }
  // Der First läuft entlang der längeren Seite
  if (best.W > best.L) best = { ...best, ang: best.ang + Math.PI / 2, L: best.W, W: best.L };
  return best;
}

function isConvex(r: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const c = r[(i + 2) % r.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-6) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

function triangulate(r: Pt[]): number[][] {
  try {
    return ShapeUtils.triangulateShape(
      r.map(([x, y]) => new Vector2(x, y)),
      [],
    );
  } catch {
    return [];
  }
}

/** Konvexe Hülle (für den Schatten). */
function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Kleiner Zufall aus einer Zahl (für Ruinenkanten), immer gleich für dasselbe Haus. */
function lcg(seed: number) {
  let s = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** u-Bereich einer Wand: ganze Fensterachsen, an den Ecken ein Stück glatte Wand. */
function wallU(len: number): [number, number] {
  if (len < 1.6) return [-len / 2 / FACADE_W, len / 2 / FACADE_W];
  const bays = Math.max(1, Math.round(len / 3));
  return [0, bays / 2];
}

const vOf = (h: number) => (h - GROUND_M) / FACADE_H;

/** Alle Häuser zu Dreiecken (je Bild ein Topf, damit es nur wenige Zeichenaufrufe sind). */
export function buildHouses(list: HouseSpec[], props: PropSpec[] = []): HouseMeshes {
  const meshes: Record<MatKey, MeshData> = { putz: emptyMesh(), klinker: emptyMesh(), fachwerk: emptyMesh(), roof: emptyMesh(), roofSnow: emptyMesh(), plain: emptyMesh() };
  const shadow: number[] = [];
  const signs: Signs = {};
  for (const h of list) {
    const ring = cleanRing(h.ring);
    if (ring.length < 3 || areaOf(ring) < 4) continue;
    buildOne(h, ring, meshes, shadow);
    if (h.shop) addShop(h.shop, ring, h.top, meshes.plain, signs);
  }
  for (const p of props) addProp(p, meshes.plain, signs);
  return { meshes, shadow, signs };
}

function buildOne(h: HouseSpec, ring: Pt[], M: Record<MatKey, MeshData>, shadow: number[]) {
  const wallMesh = h.facade ? M[h.facade] : M.plain;
  const n = ring.length;
  const c = centroidOf(ring);
  const area = areaOf(ring);
  const rnd = lcg(h.seed);

  // Wände (Ruinen: unregelmäßige Oberkante, hier und da ein eingestürztes Stück)
  const tops = ring.map(() => (h.state === 'ruin' ? h.base + (h.top - h.base) * (0.4 + 0.6 * rnd()) : h.top));
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (h.state === 'ruin' && rnd() < 0.18) continue;
    const len = dist(a, b);
    const [u0, u1] = h.facade ? wallU(len) : [0, len / FACADE_W];
    quad(
      wallMesh,
      [a[0], a[1], h.base],
      [b[0], b[1], h.base],
      [b[0], b[1], tops[(i + 1) % n]],
      [a[0], a[1], tops[i]],
      [u0, vOf(h.base)],
      [u1, vOf(h.base)],
      [u1, vOf(tops[(i + 1) % n])],
      [u0, vOf(tops[i])],
      h.tint,
    );
  }

  // Sockel: ein dunkler Streifen unten, etwas vorstehend
  if (h.plinth && h.base === 0) {
    const out = ring.map(([x, y]): Pt => {
      const d = Math.hypot(x - c[0], y - c[1]) || 1;
      return [x + ((x - c[0]) / d) * 0.06, y + ((y - c[1]) / d) * 0.06];
    });
    for (let i = 0; i < n; i++) {
      const a = out[i];
      const b = out[(i + 1) % n];
      quad(M.plain, [a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], 0.45], [a[0], a[1], 0.45], [0, 0], [0, 0], [0, 0], [0, 0], PLINTH);
    }
  }

  // Ohne Dach (ausgebrannt, Ruine): drinnen liegt Schutt
  if (h.roof === 'none') {
    for (const t of triangulate(ring)) {
      const [a, b, d] = t.map((i) => ring[i]);
      tri(M.plain, [a[0], a[1], h.base + 0.25], [b[0], b[1], h.base + 0.25], [d[0], d[1], h.base + 0.25], [0, 0], [0, 0], [0, 0], RUBBLE);
    }
  } else {
    let done = false;
    if (h.roof === 'pitched') done = gableRoof(h, ring, area, M) || hipRoof(h, ring, c, M);
    if (!done) flatRoof(h, ring, M);
  }

  // Weicher Schatten nach Nordosten (die Sonne steht im Südwesten)
  const len = Math.min(3.5, 0.35 * h.top);
  const sh = hull(ring.concat(ring.map(([x, y]): Pt => [x + len * 0.5, y + len * 0.86])));
  for (let i = 1; i + 1 < sh.length; i++) for (const p of [sh[0], sh[i], sh[i + 1]]) shadow.push(p[0], 0.04, -p[1]);
}

/** Satteldach über (fast) rechteckigen Häusern, mit Giebeln aus der Fassade. */
function gableRoof(h: HouseSpec, ring: Pt[], area: number, M: Record<MatKey, MeshData>): boolean {
  const box = orientedBox(ring);
  if (area / (box.L * box.W) < 0.82 || box.W < 2.5) return false;
  const ca = Math.cos(box.ang);
  const sa = Math.sin(box.ang);
  const at = (a: number, b: number, z: number): P3 => [box.cx + a * ca - b * sa, box.cy + a * sa + b * ca, z];
  const hl = box.L / 2;
  const hw = box.W / 2;
  const o = OVERHANG;
  const pitch = Math.min(5.5, hw * h.slope);
  const ridge = h.top + pitch;
  const eave = h.top - (pitch * o) / hw;
  const slopeLen = Math.hypot(hw + o, ridge - eave) / ROOF_M;
  const uA = (hl + o) * 2 / ROOF_M;
  const roofMesh = h.snow ? M.roofSnow : M.roof;
  const roofTint = h.snow ? SNOW_TINT : h.roofTint;
  for (const side of [-1, 1]) {
    quad(
      roofMesh,
      at(-hl - o, side * (hw + o), eave),
      at(hl + o, side * (hw + o), eave),
      at(hl + o, 0, ridge),
      at(-hl - o, 0, ridge),
      [0, 0],
      [uA, 0],
      [uA, slopeLen],
      [0, slopeLen],
      roofTint,
    );
  }
  // Giebel: Dreiecke über den Stirnseiten, mit derselben Fassade
  const wallMesh = h.facade ? M[h.facade] : M.plain;
  const [u0, u1] = h.facade ? wallU(box.W) : [0, box.W / FACADE_W];
  for (const end of [-1, 1]) {
    tri(wallMesh, at(end * hl, -hw, h.top), at(end * hl, hw, h.top), at(end * hl, 0, ridge), [u0, vOf(h.top)], [u1, vOf(h.top)], [(u0 + u1) / 2, vOf(ridge)], h.tint);
  }
  if (h.chimney) {
    const a = hl * 0.45 * (h.seed > 0.5 ? 1 : -1);
    const b = hw * 0.35;
    const z0 = h.top + pitch * (1 - b / hw) - 0.3;
    chimney(M.plain, at(a, b, 0), box.ang, z0, ridge + 0.9);
  }
  return true;
}

/** Zeltdach über kleinen, eckigen (konvexen) Grundrissen. */
function hipRoof(h: HouseSpec, ring: Pt[], c: Pt, M: Record<MatKey, MeshData>): boolean {
  if (!isConvex(ring) || ring.length > 8) return false;
  const rad = ring.reduce((s, p) => s + dist(p, c), 0) / ring.length;
  const pitch = Math.min(4.5, rad * 0.75 * h.slope);
  const apex: P3 = [c[0], c[1], h.top + pitch];
  const eaveZ = h.top - (pitch * OVERHANG) / rad;
  const eaves = ring.map(([x, y]): Pt => {
    const d = Math.hypot(x - c[0], y - c[1]) || 1;
    return [x + ((x - c[0]) / d) * OVERHANG, y + ((y - c[1]) / d) * OVERHANG];
  });
  for (let i = 0; i < eaves.length; i++) {
    const a = eaves[i];
    const b = eaves[(i + 1) % eaves.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    const t = ((apex[0] - a[0]) * ex + (apex[1] - a[1]) * ey) / len;
    const d = Math.abs((apex[0] - a[0]) * ey - (apex[1] - a[1]) * ex) / len;
    const s = Math.hypot(d, apex[2] - eaveZ);
    tri(h.snow ? M.roofSnow : M.roof, [a[0], a[1], eaveZ], [b[0], b[1], eaveZ], apex, [0, 0], [len / ROOF_M, 0], [t / ROOF_M, s / ROOF_M], h.snow ? SNOW_TINT : h.roofTint);
  }
  if (h.chimney) chimney(M.plain, [c[0] + rad * 0.3, c[1] - rad * 0.2, 0], 0, h.top + pitch * 0.55 - 0.3, h.top + pitch + 0.7);
  return true;
}

/** Flachdach mit niedriger Brüstung. */
function flatRoof(h: HouseSpec, ring: Pt[], M: Record<MatKey, MeshData>) {
  for (const t of triangulate(ring)) {
    const [a, b, d] = t.map((i) => ring[i]);
    tri(M.plain, [a[0], a[1], h.top], [b[0], b[1], h.top], [d[0], d[1], h.top], [0, 0], [0, 0], [0, 0], h.flatColor);
  }
  if (h.base > 0 || areaOf(ring) < 40) return;
  const rim: RGB = [h.flatColor[0] * 0.85, h.flatColor[1] * 0.85, h.flatColor[2] * 0.85];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    quad(M.plain, [a[0], a[1], h.top], [b[0], b[1], h.top], [b[0], b[1], h.top + 0.35], [a[0], a[1], h.top + 0.35], [0, 0], [0, 0], [0, 0], [0, 0], rim);
  }
}

function chimney(m: MeshData, p: P3, ang: number, z0: number, z1: number) {
  const s = 0.38;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const corner = (a: number, b: number): Pt => [p[0] + a * ca - b * sa, p[1] + a * sa + b * ca];
  const cs = [corner(-s, -s), corner(s, -s), corner(s, s), corner(-s, s)];
  for (let i = 0; i < 4; i++) {
    const a = cs[i];
    const b = cs[(i + 1) % 4];
    quad(m, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], [0, 0], [0, 0], [0, 0], [0, 0], CHIMNEY);
  }
  quad(m, [cs[0][0], cs[0][1], z1], [cs[1][0], cs[1][1], z1], [cs[2][0], cs[2][1], z1], [cs[3][0], cs[3][1], z1], [0, 0], [0, 0], [0, 0], [0, 0], [0.25, 0.22, 0.2]);
}
