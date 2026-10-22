// Kartendetails in 3D: Bäume, abwechslungsreiche Häuser, Autowracks.
//
// Reine Funktion ohne Browser-Abhängigkeit: bekommt die Kartengeometrien
// (Gebäude, Wälder, Grünflächen, Straßen) und liefert extrudierbare Polygone.
// Alles ist deterministisch, damit ein Haus beim nächsten Aufbau gleich aussieht
// und Bäume nicht "springen", wenn sich der Ausschnitt verschiebt.

import { rngFrom, type Rng } from '../core/rng';
import type { LatLon } from '../core/types';
import type { FacadeKind, HouseSpec } from './houseMesh';
import { isHallKind, isShopKind, landmarkOf, type LandmarkKind, type PropKind, type PropSpec, type ShopKind } from './landmarks';

type Pt = [number, number];
type Ring = Pt[];

/** Polygon in Längen/Breite: erster Ring außen, weitere Ringe sind Löcher. */
export interface RawPolygon {
  rings: Ring[];
  height?: number;
  minHeight?: number;
}
export interface RawLine {
  coords: Ring;
  /** Fahrbahn (Autowracks möglich) oder nur Weg. */
  drivable: boolean;
}
export interface DecorInput {
  buildings: RawPolygon[];
  /** Wald: dicht bewachsen */
  forests: RawPolygon[];
  /** Parks, Friedhöfe, Dorfplätze: lockerer Baumbestand */
  greens: RawPolygon[];
  /** Wiesen: nur vereinzelte Bäume */
  meadows: RawPolygon[];
  /** Wohngebiete: Gartenbäume zwischen den Häusern */
  residential: RawPolygon[];
  /** Fels und Geröll: Steinbrocken */
  rocks?: RawPolygon[];
  /** Seen, Teiche und Flüsse (Flächen): dort wächst nichts */
  water?: RawPolygon[];
  /** Bäche und Flüsse als Linien: Ufer bleibt frei */
  waterways?: RawLine[];
  roads: RawLine[];
  /** Echte Orte (Läden, Tankstellen, Haltestellen, Brunnen) für die Wahrzeichen. */
  pois?: { lon: number; lat: number; cls?: string; subclass?: string }[];
}

/** Ein Baum, Busch oder Stein für die 3D-Ebene (map/treeLayer.ts). */
export interface TreeSpec {
  lon: number;
  lat: number;
  kind: TreeKind;
  /** Größe (1 = normal) */
  s: number;
  /** Drehung in Bogenmaß */
  rot: number;
  /** Farbe der Krone (bei Steinen: des Steins) */
  color: string;
}
export type TreeKind = 'leaf' | 'pine' | 'birch' | 'dead' | 'bush' | 'rock';

export interface DecorOptions {
  /** Bäume auch als Blöcke in die Extrusions-Ebene (falls die 3D-Ebene fehlt) */
  treeParts?: boolean;
  /** Häuser als 3D-Häuser mit Fassaden (map/houseMesh.ts) statt als einfarbige Blöcke */
  houseMeshes?: boolean;
  /** Monat 1–12 für Herbstlaub (aus der Oberfläche, nicht aus der Spiellogik) */
  month?: number;
}
export interface DecorPart {
  ring: Ring; // Längen/Breite
  base: number;
  top: number;
  color: string;
}
export interface DecorResult {
  parts: DecorPart[];
  trees: TreeSpec[];
  /** Nur mit houseMeshes: die Häuser für die 3D-Ebene (Meter um die Mitte). */
  houses: HouseSpec[];
  /** Nur mit houseMeshes: freistehende Wahrzeichen (Tankstelle, Haltestelle, Brunnen). */
  props: PropSpec[];
  counts: { buildings: number; trees: number; cars: number; street: number; gardens: number; forest: number; landmarks: number };
}

// --- Farben --------------------------------------------------------------------------
const WALLS = ['#b9ae98', '#c6baa1', '#a99e88', '#9c907b', '#a0634b', '#b7a58a', '#8f8676', '#c2b59b'];
const SOOT = ['#4a4440', '#56504a', '#4f4943'];
const ROOFS = ['#a24f38', '#8e4632', '#5e5b58', '#7a5a42', '#b0603f', '#6a6660'];
const FLAT_ROOF = ['#7d7a72', '#8a867c', '#73706a'];
/** 3D-Häuser: Farbtöne über den Fassadenbildern und Dachziegeln (1 = wie gemalt). */
const FACADE_TINTS: Record<FacadeKind, [number, number, number][]> = {
  putz: [
    [1, 1, 1],
    [1, 0.95, 0.88],
    [0.92, 0.94, 0.9],
    [0.96, 0.93, 0.9],
  ],
  klinker: [
    [1, 1, 1],
    [0.88, 0.86, 0.84],
  ],
  fachwerk: [
    [1, 1, 1],
    [0.95, 0.93, 0.9],
  ],
};
const ROOF_TINTS: [number, number, number][] = [
  [1, 1, 1],
  [1, 1, 1],
  [0.8, 0.7, 0.64],
  [0.52, 0.52, 0.55],
];
const SOOT_TINT: [number, number, number] = [0.42, 0.38, 0.35];
// Überwiegend grün, ein paar kränkliche und herbstliche Kronen
const LEAF = ['#5f7a3a', '#6b8540', '#58703a', '#7a8f45', '#64803c', '#708a42', '#8a8a3e', '#a8873a'];
const CONIFER = ['#3f5a35', '#4a6638', '#365232'];
const AUTUMN = ['#c08a3a', '#b8682e', '#a8873a', '#c9a43e', '#9a5a2e'];
const BIRCH = ['#8aa04a', '#9aab55', '#7f9645'];
const BUSH = ['#5f7a3a', '#6e8a44', '#557035', '#7a8a40'];
const STONE = ['#9a958a', '#8a857a', '#a8a296'];
const TRUNK = '#6a4f36';
const DEAD = '#8a7c6a';
/** Jahreszeiten: frisches Frühlingsgrün, kahle Äste und braune Büsche im Winter. */
const SPRING = ['#8fb054', '#9cbc5e', '#82a64c'];
const BARE = ['#7d6c58', '#74624f', '#86745e'];
const BARE_BIRCH = '#d6cfc0';
const BUSH_WINTER = ['#7a6a4e', '#6e6448', '#80704f'];
const CARS = ['#9a5a3a', '#8a4a3a', '#5a6a7a', '#a8a294', '#5a554e', '#7a7a62', '#6a7a5a'];
const CABIN = '#3a3c40';
const PLINTH = '#6a6256';
const CHIMNEY = ['#8a5a44', '#6a6460', '#9a6a52'];
const RUBBLE = ['#9a9282', '#8a8272', '#a39a88', '#7f786a'];
const POLE = '#6a5a46';
// Straßenmöbel, Gärten, Wald
const LAMP = '#5b5f5c';
const LAMP_HEAD = '#d9d2b8';
const BINS = ['#3b3f45', '#2f4a3a', '#6b4a2a', '#30506a'];
const SIGN = ['#c8c2b0', '#b8452e', '#2f5f8a', '#d8b030'];
const WOOD = ['#7a5a3a', '#8a6a45', '#6e5236'];
const PLASTIC = ['#c8c2b0', '#b5aa92', '#5a6a5a'];
const LAUNDRY = ['#d8d2c4', '#a8b8c8', '#c8a8a0', '#c8c088'];
const HEDGE = ['#4f6a35', '#56723a', '#48602f'];
const SOIL = '#5a4632';
const LOG = ['#6a5440', '#5e4a38', '#74604a'];

const pick = <T>(r: Rng, a: readonly T[]) => a[Math.floor(r() * a.length)];
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

// --- lokale Projektion in Metern ------------------------------------------------------
class Proj {
  kx: number;
  ky = 111320;
  constructor(public c: LatLon) {
    this.kx = 111320 * Math.cos((c.lat * Math.PI) / 180);
  }
  toM = ([lon, lat]: Pt): Pt => [(lon - this.c.lon) * this.kx, (lat - this.c.lat) * this.ky];
  toLL = ([x, y]: Pt): Pt => [this.c.lon + x / this.kx, this.c.lat + y / this.ky];
}

// --- Geometrie-Helfer ------------------------------------------------------------------
function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

function centroid(r: Ring): Pt {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f;
    y += (r[j][1] + r[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return r[0];
  return [x / (3 * a), y / (3 * a)];
}

function inRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(p: Pt, rings: Ring[]): boolean {
  if (!inRing(p, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(p, rings[i])) return false;
  return true;
}

function bbox(r: Ring) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of r) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function scaleRing(r: Ring, c: Pt, f: number): Ring {
  return r.map(([x, y]) => [c[0] + (x - c[0]) * f, c[1] + (y - c[1]) * f]);
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function ngon(x: number, y: number, r: number, n: number, rot: number): Ring {
  const out: Ring = [];
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return out;
}

function box(x: number, y: number, len: number, wid: number, ang: number, shift = 0): Ring {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const pts: Pt[] = [
    [-len / 2 + shift, -wid / 2],
    [len / 2 + shift, -wid / 2],
    [len / 2 + shift, wid / 2],
    [-len / 2 + shift, wid / 2],
    [-len / 2 + shift, -wid / 2],
  ];
  return pts.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}

/** Einfaches Raster für schnelle Nachbarschaftsabfragen. */
class Grid<T> {
  private cells = new Map<string, T[]>();
  constructor(private size: number) {}
  private key(cx: number, cy: number) {
    return `${cx}:${cy}`;
  }
  addBox(b: { x0: number; y0: number; x1: number; y1: number }, item: T) {
    for (let cx = Math.floor(b.x0 / this.size); cx <= Math.floor(b.x1 / this.size); cx++)
      for (let cy = Math.floor(b.y0 / this.size); cy <= Math.floor(b.y1 / this.size); cy++) {
        const k = this.key(cx, cy);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(item);
      }
  }
  near(p: Pt): T[] {
    return this.cells.get(this.key(Math.floor(p[0] / this.size), Math.floor(p[1] / this.size))) ?? [];
  }
  /** Alles aus den Zellen im Umkreis d (ohne Doppelte), unabhängig davon, wie das Raster liegt. */
  around(p: Pt, d: number): T[] {
    const out = new Set<T>();
    for (let cx = Math.floor((p[0] - d) / this.size); cx <= Math.floor((p[0] + d) / this.size); cx++)
      for (let cy = Math.floor((p[1] - d) / this.size); cy <= Math.floor((p[1] + d) / this.size); cy++)
        for (const it of this.cells.get(this.key(cx, cy)) ?? []) out.add(it);
    return [...out];
  }
}

// --- Hauptfunktion ---------------------------------------------------------------------

export const DECOR_LIMITS = { trees: 6000, cars: 220, poles: 260, street: 450, gardens: 600, forest: 350 };

export function generateDecor(input: DecorInput, center: LatLon, radiusM: number, opts: DecorOptions = {}): DecorResult {
  const P = new Proj(center);
  const parts: DecorPart[] = [];
  const add = (ring: Ring, base: number, top: number, color: string) => {
    const b = Math.round(base * 100) / 100;
    parts.push({ ring: ring.map(P.toLL), base: b, top: Math.max(b + 0.02, Math.round(top * 100) / 100), color });
  };
  const r2 = radiusM * radiusM;
  const near = (p: Pt, extra = 0) => p[0] * p[0] + p[1] * p[1] <= (radiusM + extra) ** 2;
  const toM = (rings: Ring[]) => rings.map((r) => r.map(P.toM));
  const roughlyNear = (rings: Ring[]) => {
    const b = bbox(rings[0].map(P.toM));
    const dx = Math.max(b.x0, 0, -b.x1);
    const dy = Math.max(b.y0, 0, -b.y1);
    return dx * dx + dy * dy <= r2;
  };

  // Gebäude ----------------------------------------------------------------------
  const seenB = new Set<string>();
  const bGrid = new Grid<Ring>(40);
  const houseSpecs: HouseSpec[] = [];
  const snowRoofs = opts.month !== undefined && (opts.month === 12 || opts.month <= 2);
  // Echte Orte: Läden kommen an ihr Gebäude, Tankstellen, Haltestellen und Brunnen frei dazu
  type Poi = { p: Pt; kind: LandmarkKind; sign: string; key: string; used: boolean };
  const shopPois = new Grid<Poi>(40);
  const propPois: Poi[] = [];
  if (opts.houseMeshes)
    for (const q of input.pois ?? []) {
      const def = landmarkOf(q.cls, q.subclass);
      if (!def) continue;
      const p = P.toM([q.lon, q.lat]);
      if (!near(p, 30)) continue;
      const poi: Poi = { p, kind: def.kind, sign: def.sign, key: `${q.lon.toFixed(5)}:${q.lat.toFixed(5)}`, used: false };
      if (isShopKind(def.kind)) shopPois.addBox({ x0: p[0], y0: p[1], x1: p[0], y1: p[1] }, poi);
      else propPois.push(poi);
    }
  /** Der Laden in diesem Gebäude (Punkt drin oder höchstens 8 m daneben). */
  const shopFor = (ring: Ring, c: Pt, rad: number): Poi | null => {
    let best: Poi | null = null;
    let bestD = 8;
    for (const q of shopPois.around(c, rad + 12)) {
      if (q.used) continue;
      if (inRing(q.p, ring)) return q;
      for (let i = 0; i < ring.length - 1; i++) {
        const d = distToSeg(q.p, ring[i], ring[i + 1]);
        if (d < bestD) (bestD = d), (best = q);
      }
    }
    return best;
  };
  /** Wohnhäuser (für Gärten): Mitte, ungefährer Radius, Schlüssel für den Zufall. */
  const houses: { c: Pt; rad: number; key: string }[] = [];
  let buildings = 0;
  for (const b of input.buildings) {
    if (!roughlyNear(b.rings)) continue;
    const ring = b.rings[0].map(P.toM);
    const area = Math.abs(ringArea(ring));
    if (area < 6) continue;
    const c = centroid(ring);
    if (!near(c)) continue;
    const ll = P.toLL(c);
    const key = `${ll[0].toFixed(5)}:${ll[1].toFixed(5)}`;
    if (seenB.has(key)) continue;
    seenB.add(key);
    bGrid.addBox(bbox(ring), ring);
    buildings++;

    const r = rngFrom('haus', key);
    const roll = r();
    const state = roll < 0.18 ? 'ruin' : roll < 0.28 ? 'burnt' : 'intact';
    const h0 = Math.min(40, Math.max(3, b.height ?? 6));
    const minH = b.minHeight ?? 0;
    const k = state === 'ruin' ? 0.4 + 0.25 * r() : state === 'burnt' ? 0.6 : 0.82 + 0.18 * r();
    const wallTop = Math.max(2.4, h0 * k);
    const wall = state === 'burnt' ? pick(r, SOOT) : pick(r, WALLS);
    const simple = ring.length <= 9 && inRing(c, ring);
    if (minH === 0 && simple && area >= 30 && area <= 280 && state !== 'ruin') houses.push({ c, rad: Math.sqrt(area / Math.PI), key });
    if (opts.houseMeshes) {
      const poi = minH === 0 ? shopFor(ring, c, Math.sqrt(area)) : null;
      if (poi) poi.used = true;
      const hs = houseSpec(ring, key, poi ? 'intact' : state, h0, minH * k, poi ? Math.max(3.4, h0 * 0.9) : wallTop, wall, simple, area);
      if (poi) dressShop(hs, poi.kind as ShopKind, poi.sign, poi.p, rngFrom('laden', poi.key)(), area, h0);
      if (snowRoofs) {
        hs.snow = true;
        hs.flatColor = [0.86, 0.88, 0.9];
      }
      houseSpecs.push(hs);
      // Schutt um Ruinen bleibt als Klötze
      if (state === 'ruin' && !poi) {
        const piles = 2 + Math.floor(r() * 4);
        for (let i = 0; i < piles; i++) {
          const v = ring[Math.floor(r() * (ring.length - 1))];
          const px = v[0] + (v[0] - c[0]) * (0.12 + r() * 0.2) + (r() - 0.5) * 2;
          const py = v[1] + (v[1] - c[1]) * (0.12 + r() * 0.2) + (r() - 0.5) * 2;
          add(ngon(px, py, 0.7 + r() * 1.1, 5, r() * 3), 0, 0.3 + r() * 0.7, pick(r, RUBBLE));
        }
      }
      continue;
    }
    add(ring, minH * k, wallTop, wall);
    // Sockel: dunkler Streifen unten, das Haus steht damit sichtbar auf dem Boden
    if (minH === 0 && simple && area < 450) add(scaleRing(ring, c, 1.04), 0, 0.55, PLINTH);
    if (minH > 0 || state !== 'intact') {
      if (state === 'ruin') {
        // Ruine: eine stehengebliebene Ecke und Schutt drumherum
        if (area < 400 && r() < 0.6) add(scaleRing(ring, ring[0], 0.35), wallTop, wallTop + 1.6 + r() * 1.8, wall);
        const piles = 2 + Math.floor(r() * 4);
        for (let i = 0; i < piles; i++) {
          const v = ring[Math.floor(r() * (ring.length - 1))];
          const px = v[0] + (v[0] - c[0]) * (0.12 + r() * 0.2) + (r() - 0.5) * 2;
          const py = v[1] + (v[1] - c[1]) * (0.12 + r() * 0.2) + (r() - 0.5) * 2;
          add(ngon(px, py, 0.7 + r() * 1.1, 5, r() * 3), 0, 0.3 + r() * 0.7, pick(r, RUBBLE));
        }
      }
      continue;
    }
    if (area > 450 || !simple) {
      add(scaleRing(ring, c, 0.93), wallTop, wallTop + 0.45, pick(r, FLAT_ROOF));
    } else {
      // Stufendach: zwei kleiner werdende Lagen, wirkt von oben wie ein Walmdach
      const roof = pick(r, ROOFS);
      const pitch = Math.min(3.2, 0.9 + Math.sqrt(area) * 0.18);
      add(scaleRing(ring, c, 0.8), wallTop, wallTop + pitch * 0.5, roof);
      add(scaleRing(ring, c, 0.48), wallTop + pitch * 0.5, wallTop + pitch, roof);
      // Schornstein bei gut der Hälfte der Häuser
      if (r() < 0.6) {
        const v = ring[Math.floor(r() * (ring.length - 1))];
        const ang = Math.atan2(ring[1][1] - ring[0][1], ring[1][0] - ring[0][0]);
        add(box(c[0] + (v[0] - c[0]) * 0.42, c[1] + (v[1] - c[1]) * 0.42, 0.8, 0.8, ang), wallTop, wallTop + pitch + 1.1, pick(r, CHIMNEY));
      }
    }
  }

  // Bäume ------------------------------------------------------------------------
  // Raster in Grad (an einer gerundeten Breite ausgerichtet), damit Bäume stabil stehen.
  const latRef = Math.round(center.lat);
  const degLat = 1 / 111320;
  const degLon = 1 / (111320 * Math.cos((latRef * Math.PI) / 180));
  type Where = 'forest' | 'green' | 'meadow' | 'yard' | 'bush' | 'rock';
  const trees: { p: Pt; key: string; forest: boolean; where: Where }[] = [];
  const seenT = new Set<string>();

  // Wasser: kein Baum im Teich, keiner mitten im Bach
  const waterAreas: { b: ReturnType<typeof bbox>; rings: Ring[] }[] = [];
  for (const w of input.water ?? []) {
    if (!roughlyNear(w.rings)) continue;
    const rings = toM(w.rings);
    waterAreas.push({ b: bbox(rings[0]), rings });
  }
  const streamGrid = new Grid<[Pt, Pt]>(40);
  for (const l of input.waterways ?? []) {
    const m = l.coords.map(P.toM);
    for (let i = 0; i < m.length - 1; i++) {
      const sb = bbox([m[i], m[i + 1]]);
      streamGrid.addBox({ x0: sb.x0 - 6, y0: sb.y0 - 6, x1: sb.x1 + 6, y1: sb.y1 + 6 }, [m[i], m[i + 1]]);
    }
  }
  const dry = (p: Pt) => {
    for (const w of waterAreas) {
      if (p[0] < w.b.x0 - 3 || p[0] > w.b.x1 + 3 || p[1] < w.b.y0 - 3 || p[1] > w.b.y1 + 3) continue;
      if (inPolygon(p, w.rings)) return false;
      for (const ring of w.rings) for (let i = 0; i < ring.length - 1; i++) if (distToSeg(p, ring[i], ring[i + 1]) < 2.5) return false;
    }
    for (const [a, b] of streamGrid.near(p)) if (distToSeg(p, a, b) < 4) return false;
    return true;
  };

  const scatter = (polys: RawPolygon[], spacing: number, prob: number, tag: string, where: Where, ok?: (p: Pt) => boolean) => {
    const forest = where === 'forest';
    const sLat = spacing * degLat;
    const sLon = spacing * degLon;
    for (const poly of polys) {
      if (!roughlyNear(poly.rings)) continue;
      const rings = toM(poly.rings);
      const llb = bbox(poly.rings[0]);
      for (let gx = Math.floor(llb.x0 / sLon); gx <= Math.ceil(llb.x1 / sLon); gx++) {
        for (let gy = Math.floor(llb.y0 / sLat); gy <= Math.ceil(llb.y1 / sLat); gy++) {
          const key = `${tag}:${gx}:${gy}`;
          if (seenT.has(key)) continue;
          const r = rngFrom('baum', key);
          if (r() > prob) continue;
          const lon = (gx + 0.1 + 0.8 * r()) * sLon;
          const lat = (gy + 0.1 + 0.8 * r()) * sLat;
          const p = P.toM([lon, lat]);
          if (!near(p) || !inPolygon(p, rings) || (ok && !ok(p)) || !dry(p)) continue;
          seenT.add(key);
          trees.push({ p, key, forest, where });
        }
      }
    }
  };

  // Für Gartenbäume: Abstand zu Häusern und Straßen halten
  const roadGrid = new Grid<[Pt, Pt]>(40);
  const roadsM: Ring[] = [];
  for (const l of input.roads) {
    if (l.coords.length < 2) continue;
    const m = l.coords.map(P.toM);
    const b = bbox(m);
    if (b.x0 > radiusM + 50 || b.x1 < -radiusM - 50 || b.y0 > radiusM + 50 || b.y1 < -radiusM - 50) continue;
    if (l.drivable) roadsM.push(m);
    for (let i = 0; i < m.length - 1; i++) {
      const sb = bbox([m[i], m[i + 1]]);
      roadGrid.addBox({ x0: sb.x0 - 8, y0: sb.y0 - 8, x1: sb.x1 + 8, y1: sb.y1 + 8 }, [m[i], m[i + 1]]);
    }
  }
  const freeSpot = (p: Pt) => {
    for (const ring of bGrid.around(p, 3.5)) {
      if (inRing(p, ring)) return false;
      for (let i = 0; i < ring.length - 1; i++) if (distToSeg(p, ring[i], ring[i + 1]) < 3.5) return false;
    }
    for (const [a, b] of roadGrid.near(p)) if (distToSeg(p, a, b) < 7) return false;
    return true;
  };

  const offPath = (p: Pt) => roadGrid.near(p).every(([a, b]) => distToSeg(p, a, b) >= 4);

  // Wahrzeichen: Ladenfront zur nächsten Straße, Tankstellen und Haltestellen an die Straße
  const nearestRoad = (p: Pt, maxD: number) => {
    let best: { pt: Pt; ang: number; d: number } | null = null;
    for (const [a, b] of roadGrid.around(p, maxD)) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      if (!l2) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      const pt: Pt = [a[0] + t * dx, a[1] + t * dy];
      const d = Math.hypot(p[0] - pt[0], p[1] - pt[1]);
      if (d <= maxD && (!best || d < best.d)) best = { pt, ang: Math.atan2(dy, dx), d };
    }
    return best;
  };
  for (const hs of houseSpecs) {
    const c = centroid(hs.ring);
    const road = nearestRoad(c, 60);
    // Haustür zur Straße
    if (road) hs.street = road.pt;
    if (hs.shop && road) hs.shop.toward = road.pt;
    // Anstoßende Nachbarn: dort keine Fenster
    const b = bbox(hs.ring);
    const near = bGrid.around(c, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 2).filter((r) => {
      if (r === hs.ring) return false;
      const o = bbox(r);
      return o.x0 < b.x1 + 0.8 && o.x1 > b.x0 - 0.8 && o.y0 < b.y1 + 0.8 && o.y1 > b.y0 - 0.8;
    });
    if (near.length) hs.neighbors = near;
  }
  const props: PropSpec[] = [];
  for (const q of propPois) {
    const variant = Math.floor(rngFrom('laden', q.key)() * 3);
    const road = nearestRoad(q.p, 45);
    let p: Pt = q.p;
    let ang = 0;
    let side = 1;
    if (road) {
      ang = road.ang;
      // Auf welcher Seite der Straße liegt der Ort?
      const cross = Math.cos(ang) * (q.p[1] - road.pt[1]) - Math.sin(ang) * (q.p[0] - road.pt[0]);
      side = cross >= 0 ? 1 : -1;
      const off = q.kind === 'fuel' ? Math.max(9, road.d) : q.kind === 'stop' ? 2.6 : road.d;
      p = [road.pt[0] - Math.sin(ang) * side * off, road.pt[1] + Math.cos(ang) * side * off];
    }
    if (q.kind === 'stop' && props.some((o) => o.kind === 'stop' && Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) < 12)) continue;
    // Nicht in ein Haus stellen
    if (bGrid.around(p, 4).some((ring) => inRing(p, ring))) {
      if (q.kind !== 'fuel') continue;
      p = q.p;
    }
    props.push({ kind: q.kind as PropKind, p, ang, side, variant });
  }
  scatter(input.forests, 10, 0.9, 'w', 'forest', offPath);
  scatter(input.greens, 22, 0.45, 'g', 'green', freeSpot);
  scatter(input.meadows, 42, 0.22, 'm', 'meadow', freeSpot);
  scatter(input.residential, 23, 0.42, 'r', 'yard', freeSpot);
  // Büsche: auf Wiesen, in Gärten und Parks, dazu Steinbrocken auf Fels und Geröll
  scatter(input.meadows, 19, 0.3, 'bm', 'bush', freeSpot);
  scatter(input.residential, 15, 0.22, 'br', 'bush', freeSpot);
  scatter(input.greens, 16, 0.3, 'bg', 'bush', freeSpot);
  scatter(input.forests, 13, 0.3, 'bf', 'bush', offPath);
  scatter(input.rocks ?? [], 9, 0.5, 'st', 'rock');
  // Findlinge: ab und zu ein großer Stein im Wald und auf der Wiese
  scatter(input.forests, 34, 0.3, 'fw', 'rock', offPath);
  scatter(input.meadows, 55, 0.18, 'fm', 'rock', freeSpot);

  if (trees.length > DECOR_LIMITS.trees) {
    trees.sort((a, b) => a.p[0] ** 2 + a.p[1] ** 2 - (b.p[0] ** 2 + b.p[1] ** 2));
    trees.length = DECOR_LIMITS.trees;
  }
  const autumn = opts.month !== undefined && opts.month >= 9 && opts.month <= 11;
  const winter = opts.month !== undefined && (opts.month === 12 || opts.month <= 2);
  const spring = opts.month !== undefined && opts.month >= 3 && opts.month <= 5;
  const specs: TreeSpec[] = [];
  for (const t of trees) {
    const r = rngFrom('form', t.key);
    const [x, y] = t.p;
    const s = (t.forest ? 0.95 : 0.8) + r() * 0.55;
    const rot = r() * Math.PI;
    const roll = r();
    const ll = P.toLL(t.p);
    const spec = (kind: TreeKind, color: string, size = s) => specs.push({ lon: ll[0], lat: ll[1], kind, s: Math.round(size * 100) / 100, rot: Math.round(rot * 100) / 100, color });
    if (t.where === 'bush') {
      spec('bush', pick(r, winter ? BUSH_WINTER : BUSH), 0.7 + r() * 0.6);
      continue;
    }
    if (t.where === 'rock') {
      spec('rock', pick(r, STONE), 0.5 + r() * 0.9);
      continue;
    }
    // Herbst: ein Teil der Laubbäume färbt sich
    const leaf = () => (autumn && r() < 0.4 ? pick(r, AUTUMN) : spring && r() < 0.6 ? pick(r, SPRING) : pick(r, LEAF));
    if (roll < 0.08) {
      // abgestorbener Baum
      spec('dead', DEAD);
      if (opts.treeParts) {
        add(ngon(x, y, 0.42 * s, 5, rot), 0, 7 * s, DEAD);
        add(ngon(x + 0.6 * s, y + 0.2 * s, 0.25 * s, 5, rot), 4 * s, 5.2 * s, DEAD);
      }
    } else if (roll < (t.forest ? 0.52 : 0.22)) {
      // Nadelbaum
      const c = pick(r, CONIFER);
      spec('pine', c);
      if (opts.treeParts) {
        add(ngon(x, y, 0.35 * s, 5, rot), 0, 1.8 * s, TRUNK);
        add(ngon(x, y, 2.8 * s, 7, rot), 1.6 * s, 5.8 * s, c);
        add(ngon(x, y, 1.9 * s, 7, rot + 0.5), 5.8 * s, 9.4 * s, c);
        add(ngon(x, y, 0.95 * s, 6, rot), 9.4 * s, 12.6 * s, c);
      }
    } else if (winter && roll >= (t.forest ? 0.52 : 0.22)) {
      // Winter: Laubbäume und Birken stehen kahl da (nur Äste)
      const birch = roll < (t.forest ? 0.62 : 0.36);
      const c = birch ? BARE_BIRCH : pick(r, BARE);
      spec('dead', c, birch ? s * 0.9 : s * 1.1);
      if (opts.treeParts) add(ngon(x, y, 0.4 * s, 5, rot), 0, 7 * s, c);
    } else if (roll < (t.forest ? 0.62 : 0.36)) {
      // Birke
      const c = autumn && r() < 0.5 ? '#d0b04a' : pick(r, BIRCH);
      spec('birch', c, s * 0.9);
      if (opts.treeParts) {
        add(ngon(x, y, 0.3 * s, 5, rot), 0, 3.4 * s, '#d8d2c2');
        add(ngon(x, y, 2.2 * s, 7, rot), 3 * s, 7.6 * s, c);
      }
    } else {
      // Laubbaum
      const c = leaf();
      spec('leaf', c);
      if (opts.treeParts) {
        add(ngon(x, y, 0.4 * s, 5, rot), 0, 3 * s, TRUNK);
        add(ngon(x, y, 3.2 * s, 8, rot), 2.6 * s, 7.6 * s, c);
        add(ngon(x + 0.4 * s, y - 0.3 * s, 2 * s, 7, rot + 0.3), 7.6 * s, 9.2 * s, c);
      }
    }
  }

  // Autowracks ----------------------------------------------------------------------
  const cellDeg = 85 * degLat;
  const cellDegLon = 85 * degLon;
  const best = new Map<string, { d: number; p: Pt; ang: number }>();
  for (const m of roadsM) {
    for (let i = 0; i < m.length - 1; i++) {
      const a = m[i];
      const b = m[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let t = 0; t < len; t += 12) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len];
        if (!near(p)) continue;
        const ll = P.toLL(p);
        const key = `${Math.floor(ll[0] / cellDegLon)}:${Math.floor(ll[1] / cellDeg)}`;
        const r = rngFrom('auto', key);
        if (r() > 0.38) continue;
        const target = P.toM([(Math.floor(ll[0] / cellDegLon) + r()) * cellDegLon, (Math.floor(ll[1] / cellDeg) + r()) * cellDeg]);
        const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
        const cur = best.get(key);
        if (!cur || d < cur.d) best.set(key, { d, p, ang });
      }
    }
  }
  let cars = 0;
  for (const [key, { p, ang }] of best) {
    if (cars >= DECOR_LIMITS.cars) break;
    const r = rngFrom('wrack', key);
    const crashed = r() < 0.22;
    const side = r() < 0.5 ? -1 : 1;
    const off = crashed ? (r() - 0.5) * 2 : side * (2.3 + r() * 1.1);
    const x = p[0] - Math.sin(ang) * off;
    const y = p[1] + Math.cos(ang) * off;
    const a = ang + (crashed ? (r() - 0.5) * 2.4 : (r() - 0.5) * 0.35) + (r() < 0.5 ? Math.PI : 0);
    const body = r() < 0.2 ? '#2f2b28' : pick(r, CARS);
    add(box(x, y, 4.3, 1.8, a), 0.25, 1.05, body);
    add(box(x, y, 2.2, 1.6, a, -0.25), 1.05, 1.55, r() < 0.3 ? body : CABIN);
    cars++;
  }

  // Strommasten ---------------------------------------------------------------------
  // Holzmasten am Straßenrand, etwa alle 45 m, wie in Dörfern und Vororten.
  const poleCell = 45;
  const poleBest = new Map<string, { d: number; p: Pt; ang: number }>();
  for (const m of roadsM) {
    for (let i = 0; i < m.length - 1; i++) {
      const a = m[i];
      const b = m[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let t = 0; t < len; t += 8) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len];
        if (!near(p)) continue;
        const ll = P.toLL(p);
        const gx = Math.floor(ll[0] / (poleCell * degLon));
        const gy = Math.floor(ll[1] / (poleCell * degLat));
        const key = `${gx}:${gy}`;
        const r = rngFrom('mast', key);
        if (r() > 0.55) continue;
        const target = P.toM([(gx + r()) * poleCell * degLon, (gy + r()) * poleCell * degLat]);
        const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
        const cur = poleBest.get(key);
        if (!cur || d < cur.d) poleBest.set(key, { d, p, ang });
      }
    }
  }
  let poles = 0;
  for (const [key, { p, ang }] of poleBest) {
    if (poles >= DECOR_LIMITS.poles) break;
    const r = rngFrom('mastform', key);
    const side = r() < 0.5 ? -1 : 1;
    const off = side * (5 + r());
    const x = p[0] - Math.sin(ang) * off;
    const y = p[1] + Math.cos(ang) * off;
    if (bGrid.near([x, y]).some((ring) => inRing([x, y], ring))) continue;
    const h = 7 + r() * 1.5;
    add(box(x, y, 0.3, 0.3, ang), 0, h, POLE);
    add(box(x, y, 0.22, 1.7, ang), h - 0.7, h - 0.45, POLE);
    poles++;
  }

  // Straßenmöbel im Ort ------------------------------------------------------------
  const houseWithin = (p: Pt, d: number) =>
    bGrid.around(p, d).some((ring) => {
      for (let i = 0; i < ring.length - 1; i++) if (distToSeg(p, ring[i], ring[i + 1]) < d) return true;
      return false;
    });
  // Laternen, Mülltonnen, Schilder, Bänke, Briefkästen, Container, Absperrungen:
  // nur an Straßen mit Häusern in der Nähe, je Rasterzelle höchstens eins.
  const furnCell = 18;
  const furnBest = new Map<string, { d: number; p: Pt; ang: number }>();
  for (const m of roadsM) {
    for (let i = 0; i < m.length - 1; i++) {
      const a = m[i];
      const b = m[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let t = 0; t < len; t += 6) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len];
        if (!near(p) || !houseWithin(p, 22)) continue;
        const ll = P.toLL(p);
        const gx = Math.floor(ll[0] / (furnCell * degLon));
        const gy = Math.floor(ll[1] / (furnCell * degLat));
        const key = `${gx}:${gy}`;
        const r = rngFrom('moebel', key);
        if (r() > 0.8) continue;
        const target = P.toM([(gx + r()) * furnCell * degLon, (gy + r()) * furnCell * degLat]);
        const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
        const cur = furnBest.get(key);
        if (!cur || d < cur.d) furnBest.set(key, { d, p, ang });
      }
    }
  }
  let street = 0;
  // Die nächsten zuerst, damit das Limit nicht zufällig in der Nähe etwas wegschneidet
  const furnList = [...furnBest].sort((a, b) => a[1].p[0] ** 2 + a[1].p[1] ** 2 - (b[1].p[0] ** 2 + b[1].p[1] ** 2));
  for (const [key, { p, ang }] of furnList) {
    if (street >= DECOR_LIMITS.street) break;
    const r = rngFrom('moebelform', key);
    const side = r() < 0.5 ? -1 : 1;
    const off = side * (4.3 + r() * 0.9);
    // nx/ny: Richtung von der Straße weg
    const nx = -Math.sin(ang) * side;
    const ny = Math.cos(ang) * side;
    const x = p[0] - Math.sin(ang) * off;
    const y = p[1] + Math.cos(ang) * off;
    if (bGrid.near([x, y]).some((ring) => inRing([x, y], ring))) continue;
    const roll = r();
    if (roll < 0.3) {
      // Laterne mit Arm zur Straße hin
      add(box(x, y, 0.18, 0.18, ang), 0, 5.2, LAMP);
      add(box(x - nx * 0.6, y - ny * 0.6, 1.3, 0.14, ang + Math.PI / 2), 5.0, 5.14, LAMP);
      add(box(x - nx * 1.15, y - ny * 1.15, 0.6, 0.32, ang), 4.8, 5.0, LAMP_HEAD);
    } else if (roll < 0.48) {
      // Mülltonnen, eine bis drei nebeneinander
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const bx = x + Math.cos(ang) * (k - (n - 1) / 2) * 0.75;
        const by = y + Math.sin(ang) * (k - (n - 1) / 2) * 0.75;
        const tilt = r() < 0.15 ? 1.2 : 0;
        add(box(bx, by, 0.6, 0.7, ang + tilt), 0, tilt ? 0.6 : 1.05, pick(r, BINS));
      }
    } else if (roll < 0.6) {
      // Verkehrsschild
      add(box(x, y, 0.08, 0.08, ang), 0, 2.3, LAMP);
      add(box(x, y, 0.7, 0.06, ang), 2.0, 2.65, pick(r, SIGN));
    } else if (roll < 0.7) {
      // Bank mit Lehne, Blick zur Straße
      add(box(x, y, 1.7, 0.45, ang), 0.42, 0.5, pick(r, WOOD));
      add(box(x + nx * 0.22, y + ny * 0.22, 1.7, 0.08, ang), 0.5, 0.9, pick(r, WOOD));
      add(box(x, y, 1.5, 0.3, ang), 0, 0.42, LAMP);
    } else if (roll < 0.76) {
      // gelber Briefkasten
      add(box(x, y, 0.1, 0.1, ang), 0, 0.9, LAMP);
      add(box(x, y, 0.42, 0.34, ang), 0.9, 1.5, '#d8b030');
    } else if (roll < 0.84) {
      // Container (Altglas, Kleider, Bauschutt)
      add(box(x + nx * 0.6, y + ny * 0.6, 1.9, 1.3, ang), 0, 1.45, pick(r, ['#5a6b4a', '#6e5a3a', '#4a5a6a', '#8a5a3a']));
    } else if (roll < 0.93) {
      // Absperrung aus Betonblöcken, manchmal mit Reifen
      for (let k = 0; k < 2; k++) add(box(x + Math.cos(ang) * (k - 0.5) * 2.5, y + Math.sin(ang) * (k - 0.5) * 2.5, 2.3, 0.6, ang + (r() - 0.5) * 0.3), 0, 0.85, pick(r, STONE));
      if (r() < 0.5) add(ngon(x + nx * 0.9, y + ny * 0.9, 0.38, 10, 0), 0, 0.5, '#2a2826');
    } else {
      // Bushaltestelle: Dach, Rückwand, Bank
      add(box(x + nx * 0.5, y + ny * 0.5, 3.2, 0.08, ang), 0, 2.3, '#8aa0a6');
      add(box(x, y, 3.4, 1.5, ang), 2.3, 2.42, '#5b5f5c');
      add(box(x + nx * 0.25, y + ny * 0.25, 1.8, 0.4, ang), 0.42, 0.5, LAMP);
    }
    street++;
  }

  // Gärten hinter und neben Wohnhäusern -----------------------------------------------
  // Nur wo Platz ist: nicht im Haus, nicht auf der Straße, nicht im Wasser.
  let gardens = 0;
  houses.sort((a, b) => a.c[0] ** 2 + a.c[1] ** 2 - (b.c[0] ** 2 + b.c[1] ** 2));
  for (const hs of houses) {
    if (gardens >= DECOR_LIMITS.gardens) break;
    const r = rngFrom('garten', hs.key);
    if (r() > 0.85) continue;
    const n = 2 + Math.floor(r() * 3);
    const placed: Pt[] = [];
    for (let i = 0; i < n * 3 && placed.length < n; i++) {
      const a = r() * Math.PI * 2;
      const dist = hs.rad + 3 + r() * 7;
      const p: Pt = [hs.c[0] + Math.cos(a) * dist, hs.c[1] + Math.sin(a) * dist];
      if (!near(p) || !freeSpot(p) || !dry(p) || placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3.5)) continue;
      placed.push(p);
      const [x, y] = p;
      // tangential = quer zur Richtung vom Haus weg (für Hecken und Zäune)
      const tan = a + Math.PI / 2;
      const roll = r();
      if (roll < 0.12) {
        // Gartenhaus
        add(box(x, y, 2.4, 2.0, tan), 0, 2.1, pick(r, WOOD));
        add(box(x, y, 2.8, 2.4, tan), 2.1, 2.45, pick(r, ['#5e5b58', '#5a6b4a', '#7a5a42']));
      } else if (roll < 0.27) {
        // Hochbeet mit Grünzeug
        add(box(x, y, 2.2, 1.0, tan), 0, 0.6, pick(r, WOOD));
        add(box(x, y, 2.0, 0.8, tan), 0.6, 0.64, SOIL);
        for (let k = 0; k < 3; k++) add(ngon(x + Math.cos(tan) * (k - 1) * 0.6, y + Math.sin(tan) * (k - 1) * 0.6, 0.22, 6, k), 0.64, 0.9, pick(r, BUSH));
      } else if (roll < 0.34) {
        // Trampolin
        for (let k = 0; k < 4; k++) add(box(x + Math.cos(k * 1.57) * 1.5, y + Math.sin(k * 1.57) * 1.5, 0.1, 0.1, 0), 0, 0.75, LAMP);
        add(ngon(x, y, 1.8, 14, 0), 0.75, 0.88, '#2f3a3a');
      } else if (roll < 0.41) {
        // Schaukel
        for (const k of [-1, 1]) add(box(x + Math.cos(tan) * k * 1.2, y + Math.sin(tan) * k * 1.2, 0.14, 0.9, tan), 0, 2.2, pick(r, WOOD));
        add(box(x, y, 2.6, 0.12, tan), 2.1, 2.24, pick(r, WOOD));
        add(box(x, y, 0.5, 0.2, tan), 0.5, 0.56, '#3a3c40');
      } else if (roll < 0.52) {
        // Gartentisch mit zwei Stühlen
        const c = pick(r, PLASTIC);
        add(box(x, y, 1.2, 0.8, tan), 0.7, 0.78, c);
        add(box(x, y, 0.15, 0.15, tan), 0, 0.7, c);
        for (const k of [-1, 1]) {
          const cx = x + Math.cos(tan) * k * 1.0;
          const cy = y + Math.sin(tan) * k * 1.0;
          add(box(cx, cy, 0.45, 0.45, tan), 0, 0.45, c);
          add(box(cx + Math.cos(tan) * k * 0.2, cy + Math.sin(tan) * k * 0.2, 0.08, 0.45, tan), 0.45, 0.9, c);
        }
      } else if (roll < 0.6) {
        // Regentonne
        add(ngon(x, y, 0.42, 9, 0), 0, 1.0, pick(r, ['#3a5a3a', '#30506a', '#4a4440']));
      } else if (roll < 0.67) {
        // Komposter
        add(box(x, y, 1.0, 1.0, tan), 0, 0.9, '#3a3f35');
      } else if (roll < 0.76) {
        // Wäscheleine mit Wäsche
        for (const k of [-1, 1]) add(box(x + Math.cos(tan) * k * 2, y + Math.sin(tan) * k * 2, 0.08, 0.08, tan), 0, 1.9, LAMP);
        add(box(x, y, 4, 0.04, tan), 1.85, 1.9, '#d8d2c4');
        for (let k = 0; k < 3; k++) add(box(x + Math.cos(tan) * (k - 1) * 1.1, y + Math.sin(tan) * (k - 1) * 1.1, 0.55, 0.05, tan), 1.2 + r() * 0.3, 1.85, pick(r, LAUNDRY));
      } else if (roll < 0.9) {
        // Hecke
        add(box(x, y, 4 + r() * 4, 0.8, tan), 0, 1.2 + r() * 0.5, pick(r, HEDGE));
      } else if (roll < 0.96) {
        // Gartenzaun
        add(box(x, y, 5 + r() * 3, 0.08, tan), 0, 1.0, pick(r, ['#8a7a62', '#c8c2b0', '#6e6a62']));
      } else {
        // Sandkasten
        add(box(x, y, 1.8, 1.8, tan), 0, 0.25, pick(r, WOOD));
        add(box(x, y, 1.6, 1.6, tan), 0.25, 0.27, '#d8c9a0');
      }
      gardens++;
    }
  }

  // Wald: liegende Stämme, Baumstümpfe, Reisighaufen ------------------------------------
  const fCell = 16;
  const fCands: { p: Pt; key: string }[] = [];
  const seenF = new Set<string>();
  for (const poly of input.forests) {
    if (!roughlyNear(poly.rings)) continue;
    const rings = toM(poly.rings);
    const llb = bbox(poly.rings[0]);
    for (let gx = Math.floor(llb.x0 / (fCell * degLon)); gx <= Math.ceil(llb.x1 / (fCell * degLon)); gx++) {
      for (let gy = Math.floor(llb.y0 / (fCell * degLat)); gy <= Math.ceil(llb.y1 / (fCell * degLat)); gy++) {
        const key = `${gx}:${gy}`;
        if (seenF.has(key)) continue;
        const r = rngFrom('waldboden', key);
        if (r() > 0.22) continue;
        const p = P.toM([(gx + 0.1 + 0.8 * r()) * fCell * degLon, (gy + 0.1 + 0.8 * r()) * fCell * degLat]);
        if (!near(p) || !inPolygon(p, rings) || !offPath(p) || !dry(p)) continue;
        seenF.add(key);
        fCands.push({ p, key });
      }
    }
  }
  fCands.sort((a, b) => a.p[0] ** 2 + a.p[1] ** 2 - (b.p[0] ** 2 + b.p[1] ** 2));
  const forest = Math.min(fCands.length, DECOR_LIMITS.forest);
  for (const { p, key } of fCands.slice(0, forest)) {
    const r = rngFrom('waldform', key);
    const [x, y] = p;
    const a = r() * Math.PI;
    const roll = r();
    if (roll < 0.45) {
      // liegender Stamm
      add(box(x, y, 3 + r() * 3, 0.5, a), 0, 0.5, pick(r, LOG));
    } else if (roll < 0.8) {
      // Baumstumpf
      add(ngon(x, y, 0.3 + r() * 0.2, 7, a), 0, 0.35 + r() * 0.3, pick(r, LOG));
    } else {
      // Reisighaufen
      for (let k = 0; k < 3; k++) add(box(x + (r() - 0.5), y + (r() - 0.5), 1.8, 0.12, a + (r() - 0.5) * 1.2), k * 0.1, k * 0.1 + 0.15, pick(r, LOG));
    }
  }

  const landmarks = houseSpecs.filter((h) => h.shop).length + props.length;
  return { parts, trees: specs, houses: houseSpecs, props, counts: { buildings, trees: trees.length, cars, street, gardens, forest, landmarks } };
}

/** Ein Haus für die 3D-Ebene: Fassade, Stockwerke, Dach. Zufall je Haus, immer gleich. */
function houseSpec(ring: Ring, key: string, state: 'intact' | 'burnt' | 'ruin', h0: number, base: number, wallTop: number, wall: string, simple: boolean, area: number): HouseSpec {
  const r = rngFrom('fassade', key);
  // Schuppen und Garagen bleiben schlicht (ohne Fenster)
  const small = area < 30;
  const f = r();
  const facade: FacadeKind | null = small ? null : f < 0.5 ? 'putz' : f < 0.78 ? 'klinker' : h0 > 12 ? 'putz' : 'fachwerk';
  // Fenster stockwerksgenau: die Wand endet zwischen zwei Fensterreihen
  let top = wallTop;
  if (facade && base === 0 && state !== 'ruin') top = 0.5 + Math.max(1, Math.round((wallTop - 0.5) / 2.9)) * 2.9;
  const tint = facade ? (state === 'burnt' ? SOOT_TINT : pick(r, FACADE_TINTS[facade])) : rgb(wall);
  const roof = state !== 'intact' ? 'none' : base > 0 || !simple || area > 450 ? 'flat' : small ? (r() < 0.5 ? 'flat' : 'pitched') : 'pitched';
  return {
    ring,
    base,
    top: Math.max(base + 0.5, top),
    facade,
    tint,
    state,
    roof,
    roofTint: pick(r, ROOF_TINTS),
    flatColor: rgb(pick(r, FLAT_ROOF)),
    slope: 0.7 + r() * 0.3,
    chimney: r() < 0.6,
    plinth: state !== 'ruin',
    seed: r(),
  };
}

/** Ladenbau: Halle (Supermarkt, Baumarkt, Werkstatt) oder Laden im Erdgeschoss eines Hauses. */
const HALL_TINTS: [number, number, number][] = [
  [0.8, 0.78, 0.74],
  [0.72, 0.74, 0.76],
  [0.82, 0.8, 0.7],
];
function dressShop(hs: HouseSpec, kind: ShopKind, sign: string, toward: Pt, rnd: number, area: number, h0: number) {
  const variant = Math.floor(rnd * 3);
  hs.shop = { kind, sign, toward, variant };
  hs.state = 'intact';
  hs.plinth = true;
  if (isHallKind(kind) && area > 150) {
    hs.facade = null;
    hs.tint = HALL_TINTS[variant];
    hs.roof = 'flat';
    hs.chimney = false;
    hs.top = Math.max(5.2, Math.min(9, h0 * 0.85));
  } else if (!hs.facade && area >= 30) {
    hs.facade = 'putz';
    hs.tint = [1, 1, 1];
  }
}
