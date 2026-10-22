// Häuser auf der Karte als echte 3D-Häuser: Wände mit Fassadenbildern (die Fenster sitzen
// stockwerksgenau), Satteldächer mit Ziegeln, Zeltdächer, Flachdächer, Ruinen ohne Dach.
//
// Reine Rechnung ohne Browser: Aus dem Grundriss werden Dreiecke mit Bildkoordinaten und
// Farbtönen. Gezeichnet wird in map/treeLayer.ts. Koordinaten wie dort: x = Osten,
// y = oben, z = Süden (Meter um die Mitte der Detail-Ebene).

import { ShapeUtils, Vector2 } from 'three';

import { addProp, addShop, frontWall, isHallKind, type PropSpec, type ShopSpec, type Signs } from './landmarks';
import { BOARDED, BROKEN, DOOR_H, DOOR_W, DOORS, doorUV, WINDOW_SETS, windowUV } from './windows';
import { block, dist, emptyMesh, quad, tri, type MeshData, type P3, type Pt, type RGB } from './meshKit';

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
  /** Nächster Punkt an der Straße (Meter): dorthin zeigt die Haustür. */
  street?: Pt;
  /** Grundrisse der Häuser, die direkt anstoßen (dort gibt es keine Fenster). */
  neighbors?: Pt[][];
}

/** Ein Wandbild ist so breit (Meter) und zwei Stockwerke hoch. Fenster und Türen kommen extra. */
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

export type MatKey = FacadeKind | 'roof' | 'roofSnow' | 'plain' | 'win';
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

const vOf = (h: number) => (h - GROUND_M) / FACADE_H;

/** Alle Häuser zu Dreiecken (je Bild ein Topf, damit es nur wenige Zeichenaufrufe sind). */
export function buildHouses(list: HouseSpec[], props: PropSpec[] = []): HouseMeshes {
  const meshes: Record<MatKey, MeshData> = { putz: emptyMesh(), klinker: emptyMesh(), fachwerk: emptyMesh(), roof: emptyMesh(), roofSnow: emptyMesh(), plain: emptyMesh(), win: emptyMesh() };
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

  // Wände (Ruinen: unregelmäßige Oberkante, hier und da ein eingestürztes Stück).
  // Das Wandbild läuft um die Ecken herum weiter.
  const tops = ring.map(() => (h.state === 'ruin' ? h.base + (h.top - h.base) * (0.4 + 0.6 * rnd()) : h.top));
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = dist(a, b);
    const u0 = along / FACADE_W;
    const u1 = (along + len) / FACADE_W;
    along += len;
    if (h.state === 'ruin' && rnd() < 0.18) continue;
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

  // Fenster und Haustür (nicht bei Ruinen und nicht an großen Hallen mit Ladenfront)
  if (h.state !== 'ruin' && !(h.shop && isHallKind(h.shop.kind) && !h.facade)) openings(h, ring, M.win, M.plain, rnd);

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
    if (h.roof === 'pitched') done = gableRoof(h, ring, area, M, rnd) || hipRoof(h, ring, c, M);
    if (!done) flatRoof(h, ring, M);
  }

  // Weicher Schatten nach Nordosten (die Sonne steht im Südwesten)
  const len = Math.min(3.5, 0.35 * h.top);
  const sh = hull(ring.concat(ring.map(([x, y]): Pt => [x + len * 0.5, y + len * 0.86])));
  for (let i = 1; i + 1 < sh.length; i++) for (const p of [sh[0], sh[i], sh[i + 1]]) shadow.push(p[0], 0.04, -p[1]);
}

/** Satteldach über (fast) rechteckigen Häusern, mit Giebeln aus der Fassade. */
function gableRoof(h: HouseSpec, ring: Pt[], area: number, M: Record<MatKey, MeshData>, rnd: () => number): boolean {
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
  const u1 = box.W / FACADE_W;
  for (const end of [-1, 1]) {
    tri(wallMesh, at(end * hl, -hw, h.top), at(end * hl, hw, h.top), at(end * hl, 0, ridge), [0, vOf(h.top)], [u1, vOf(h.top)], [u1 / 2, vOf(ridge)], h.tint);
    // Kleines Dachbodenfenster im Giebel, wenn Platz ist und kein Nachbar davor steht
    if (h.facade && h.state !== 'ruin' && pitch >= 2.4) {
      const set = WINDOW_SETS[h.facade];
      const w = set.w * 0.75;
      const wh = set.h * 0.75;
      const z0 = h.top + 0.35;
      const fits = h.top + pitch * (1 - w / 2 / hw) > z0 + wh + 0.15;
      const outside = at(end * (hl + 0.6), 0, 0);
      if (fits && !blockedBy(h, [outside[0], outside[1]])) {
        const id = h.state === 'burnt' ? BROKEN[0] : set.ids[Math.floor(rnd() * set.ids.length)];
        const [ua, va, ub, vb] = windowUV(id);
        const off = end * (hl + 0.03);
        const p0 = at(off, -end * (w / 2), z0);
        const p1 = at(off, end * (w / 2), z0);
        quad(M.win, p0, p1, [p1[0], p1[1], z0 + wh], [p0[0], p0[1], z0 + wh], [ua, va], [ub, va], [ub, vb], [ua, vb], [1, 1, 1]);
      }
    }
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

function inRingPt(p: Pt, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Steht an dieser Stelle (knapp vor der Wand) schon ein anderes Haus? */
function blockedBy(h: HouseSpec, p: Pt): boolean {
  return !!h.neighbors?.some((r) => inRingPt(p, r));
}

/**
 * Fenster je Stockwerk, gleichmäßig über jede Wand verteilt, und eine Haustür zur Straße.
 * Keine Fenster, wo ein Nachbarhaus anstößt; im Erdgeschoss eines Ladens zur Straße auch nicht.
 */
function openings(h: HouseSpec, ring: Pt[], win: MeshData, plain: MeshData, rnd: () => number) {
  const set = h.facade ? WINDOW_SETS[h.facade] : { ...WINDOW_SETS.fachwerk, w: 0.85, h: 1.05 };
  const small = !h.facade;
  const main = set.ids[Math.floor(rnd() * set.ids.length)];
  const pickWindow = () => {
    if (h.state === 'burnt') return rnd() < 0.5 ? BROKEN[Math.floor(rnd() * 2)] : BOARDED[Math.floor(rnd() * 2)];
    const r = rnd();
    if (r < 0.06) return BOARDED[Math.floor(rnd() * 2)];
    if (r < 0.1) return BROKEN[Math.floor(rnd() * 2)];
    return rnd() < 0.65 ? main : set.ids[Math.floor(rnd() * set.ids.length)];
  };
  const groundZ = h.base === 0 ? GROUND_M : h.base + 0.3;
  const floors = small ? 1 : Math.max(1, Math.round((h.top - groundZ) / FLOOR_H));
  const spacing = h.facade === 'fachwerk' ? 2.3 : 2.6;
  const front = h.street ? frontWall(ring, h.street) : null;
  const shopFront = h.shop ? frontWall(ring, h.shop.toward).i : -1;
  let doorDone = !!h.shop || h.base > 0;
  // Haustür-Platz: Fensterachse an der Straßenwand, die am nächsten zur Mitte liegt
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = dist(a, b);
    if (len < 1.8) continue;
    const e: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // nach außen: die Seite, auf der die Mitte des Hauses nicht liegt
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let nrm: Pt = [e[1], -e[0]];
    if (inRingPt([mid[0] + nrm[0] * 0.3, mid[1] + nrm[1] * 0.3], ring)) nrm = [-e[1], e[0]];
    const slots = small ? (len >= 3 && rnd() < 0.5 ? 1 : 0) : Math.max(1, Math.floor((len - 0.6) / spacing));
    const isFront = front?.i === i;
    const doorSlot = isFront && !doorDone ? Math.floor((slots - 1) / 2) : -1;
    for (let k = 0; k < Math.max(slots, doorSlot >= 0 ? 1 : 0); k++) {
      const t = (len * (k + 0.5)) / Math.max(1, slots);
      const at = (dt: number, off: number): Pt => [a[0] + e[0] * (t + dt) + nrm[0] * off, a[1] + e[1] * (t + dt) + nrm[1] * off];
      if (blockedBy(h, at(0, 0.6))) continue;
      for (let f = 0; f < floors; f++) {
        if (f === 0 && k === doorSlot) {
          // Haustür mit Stufe, manchmal mit kleinem Vordach
          const id = h.state === 'burnt' ? DOORS.boarded[0] : small ? DOORS.barn[0] : DOORS.house[Math.floor(rnd() * DOORS.house.length)];
          const [ua, va, ub, vb] = doorUV(id);
          const p0 = at(-DOOR_W / 2, 0.035);
          const p1 = at(DOOR_W / 2, 0.035);
          const z0 = h.base + 0.18;
          quad(win, [p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z0 + DOOR_H], [p0[0], p0[1], z0 + DOOR_H], [ua, va], [ub, va], [ub, vb], [ua, vb], [1, 1, 1]);
          const st = at(0, 0.25);
          block(plain, st[0], st[1], Math.atan2(e[1], e[0]), 1.5, 0.5, h.base, h.base + 0.18, [0.62, 0.6, 0.56]);
          if (!small && rnd() < 0.5) {
            const cp = at(0, 0.45);
            block(plain, cp[0], cp[1], Math.atan2(e[1], e[0]), 1.7, 0.9, z0 + DOOR_H + 0.15, z0 + DOOR_H + 0.25, [0.4, 0.38, 0.36], [0.52, 0.5, 0.47]);
          }
          doorDone = true;
          continue;
        }
        if (f === 0 && i === shopFront) continue;
        if (k >= slots) continue;
        const z0 = groundZ + f * FLOOR_H + (small ? 0.9 : 0.7);
        const z1 = z0 + set.h;
        if (z1 > h.top - 0.2) continue;
        const [ua, va, ub, vb] = windowUV(pickWindow());
        const p0 = at(-set.w / 2, 0.03);
        const p1 = at(set.w / 2, 0.03);
        quad(win, [p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], [ua, va], [ub, va], [ub, vb], [ua, vb], [1, 1, 1]);
      }
    }
  }
}
