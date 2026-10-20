// Kartendetails in 3D: Bäume, abwechslungsreiche Häuser, Autowracks.
//
// Reine Funktion ohne Browser-Abhängigkeit: bekommt die Kartengeometrien
// (Gebäude, Wälder, Grünflächen, Straßen) und liefert extrudierbare Polygone.
// Alles ist deterministisch, damit ein Haus beim nächsten Aufbau gleich aussieht
// und Bäume nicht "springen", wenn sich der Ausschnitt verschiebt.

import { rngFrom, type Rng } from '../core/rng';
import type { LatLon } from '../core/types';

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
  roads: RawLine[];
}
export interface DecorPart {
  ring: Ring; // Längen/Breite
  base: number;
  top: number;
  color: string;
}
export interface DecorResult {
  parts: DecorPart[];
  counts: { buildings: number; trees: number; cars: number };
}

// --- Farben --------------------------------------------------------------------------
const WALLS = ['#6f675a', '#7b725f', '#5f5c56', '#6d4b3b', '#857d6c', '#55524a', '#6a5d4a', '#73685a'];
const SOOT = ['#2f2b27', '#38332d', '#332e29'];
const ROOFS = ['#7a4433', '#5b3a2f', '#3d3f43', '#4c5040', '#5c5248', '#6b3d2f'];
const FLAT_ROOF = ['#4f4c46', '#5a564e', '#47443f'];
// Überwiegend grün, ein paar kränkliche und herbstliche Kronen
const LEAF = ['#465230', '#3e4a2b', '#4b5a30', '#40502e', '#525a31', '#485830', '#5e5a33', '#6a5232'];
const CONIFER = ['#2f3b29', '#35422d', '#2a3424'];
const TRUNK = '#4a3a2b';
const DEAD = '#6a6157';
const CARS = ['#6e3f28', '#7a3a2e', '#3f4b57', '#8a857a', '#2f2b28', '#5a5a4e', '#4e5a4a'];
const CABIN = '#26272a';

const pick = <T>(r: Rng, a: readonly T[]) => a[Math.floor(r() * a.length)];

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
}

// --- Hauptfunktion ---------------------------------------------------------------------

export const DECOR_LIMITS = { trees: 4500, cars: 220 };

export function generateDecor(input: DecorInput, center: LatLon, radiusM: number): DecorResult {
  const P = new Proj(center);
  const parts: DecorPart[] = [];
  const add = (ring: Ring, base: number, top: number, color: string) =>
    parts.push({ ring: ring.map(P.toLL), base: Math.round(base * 10) / 10, top: Math.round(top * 10) / 10, color });
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
    add(ring, minH * k, wallTop, wall);
    if (minH > 0 || state !== 'intact') {
      // Ruine: ein stehengebliebener Mauerrest
      if (state === 'ruin' && area < 400 && r() < 0.6) add(scaleRing(ring, ring[0], 0.35), wallTop, wallTop + 1.6 + r() * 1.8, wall);
      continue;
    }
    const simple = ring.length <= 9 && inRing(c, ring);
    if (area > 450 || !simple) {
      add(scaleRing(ring, c, 0.93), wallTop, wallTop + 0.45, pick(r, FLAT_ROOF));
    } else {
      // Stufendach: zwei kleiner werdende Lagen, wirkt von oben wie ein Walmdach
      const roof = pick(r, ROOFS);
      const pitch = Math.min(3.2, 0.9 + Math.sqrt(area) * 0.18);
      add(scaleRing(ring, c, 0.8), wallTop, wallTop + pitch * 0.5, roof);
      add(scaleRing(ring, c, 0.48), wallTop + pitch * 0.5, wallTop + pitch, roof);
    }
  }

  // Bäume ------------------------------------------------------------------------
  // Raster in Grad (an einer gerundeten Breite ausgerichtet), damit Bäume stabil stehen.
  const latRef = Math.round(center.lat);
  const degLat = 1 / 111320;
  const degLon = 1 / (111320 * Math.cos((latRef * Math.PI) / 180));
  const trees: { p: Pt; key: string; forest: boolean }[] = [];
  const seenT = new Set<string>();

  const scatter = (polys: RawPolygon[], spacing: number, prob: number, tag: string, forest: boolean, ok?: (p: Pt) => boolean) => {
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
          if (!near(p) || !inPolygon(p, rings) || (ok && !ok(p))) continue;
          seenT.add(key);
          trees.push({ p, key, forest });
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
    for (const ring of bGrid.near(p)) {
      if (inRing(p, ring)) return false;
      for (let i = 0; i < ring.length - 1; i++) if (distToSeg(p, ring[i], ring[i + 1]) < 3.5) return false;
    }
    for (const [a, b] of roadGrid.near(p)) if (distToSeg(p, a, b) < 7) return false;
    return true;
  };

  const offPath = (p: Pt) => roadGrid.near(p).every(([a, b]) => distToSeg(p, a, b) >= 4);
  scatter(input.forests, 11, 0.86, 'w', true, offPath);
  scatter(input.greens, 22, 0.45, 'g', false, freeSpot);
  scatter(input.meadows, 42, 0.22, 'm', false, freeSpot);
  scatter(input.residential, 23, 0.42, 'r', false, freeSpot);

  if (trees.length > DECOR_LIMITS.trees) {
    trees.sort((a, b) => a.p[0] ** 2 + a.p[1] ** 2 - (b.p[0] ** 2 + b.p[1] ** 2));
    trees.length = DECOR_LIMITS.trees;
  }
  for (const t of trees) {
    const r = rngFrom('form', t.key);
    const [x, y] = t.p;
    const s = 0.8 + r() * 0.55;
    const rot = r() * Math.PI;
    const roll = r();
    if (roll < 0.12) {
      // abgestorbener Baum
      add(ngon(x, y, 0.42 * s, 5, rot), 0, 7 * s, DEAD);
      add(ngon(x + 0.6 * s, y + 0.2 * s, 0.25 * s, 5, rot), 4 * s, 5.2 * s, DEAD);
    } else if (roll < (t.forest ? 0.6 : 0.3)) {
      // Nadelbaum in drei Stufen
      const c = pick(r, CONIFER);
      add(ngon(x, y, 0.35 * s, 5, rot), 0, 1.8 * s, TRUNK);
      add(ngon(x, y, 2.8 * s, 7, rot), 1.6 * s, 5.8 * s, c);
      add(ngon(x, y, 1.9 * s, 7, rot + 0.5), 5.8 * s, 9.4 * s, c);
      add(ngon(x, y, 0.95 * s, 6, rot), 9.4 * s, 12.6 * s, c);
    } else {
      // Laubbaum
      const c = pick(r, LEAF);
      add(ngon(x, y, 0.4 * s, 5, rot), 0, 3 * s, TRUNK);
      add(ngon(x, y, 3.2 * s, 8, rot), 2.6 * s, 7.6 * s, c);
      add(ngon(x + 0.4 * s, y - 0.3 * s, 2 * s, 7, rot + 0.3), 7.6 * s, 9.2 * s, c);
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

  return { parts, counts: { buildings, trees: trees.length, cars } };
}
