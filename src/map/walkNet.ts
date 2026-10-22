// Wegenetz für das Laufen per Tippen (Testmodus, später Reisescheine): Man kommt überall
// hin außer durch Häuser und Wasser. Auf Straßen und Wegen geht es am schnellsten, durch
// Gärten, Felder, Wald und Sumpf langsamer. Zwei Arten zu gehen:
//   schnell: die schnellste Strecke (meist über die Straßen)
//   leise:   eine Strecke durch Deckung (Wald, Hecken, Gärten, im Sommer das Korn)
// Außerdem rechnet es die Strecken der Trupps (Zufallsweg über die Wege, aus dem Startwert).
//
// Reine Rechnung ohne Karte und Browser: bekommt Linien und Flächen (Länge/Breite) und
// rechnet in Metern rund um einen Mittelpunkt. Dadurch lässt es sich testen.

import { TERRAIN } from '../core/content';
import { visibility } from '../core/terrain';
import type { LatLon, Season, TerrainKind } from '../core/types';

/** road = auf einem Weg, built = Gärten und Höfe, blocked = Haus, Wasser oder Sperrgebiet. */
export type Terrain = TerrainKind;
/** Schnell (Straßen) oder leise (Deckung). */
export type Gait = 'fast' | 'quiet';

type Ring = [number, number][];
type Poly = Ring[];

export interface WalkInput {
  center: LatLon;
  /** Begehbare Linien (Straßen, Gassen, Feld- und Waldwege), als [lon, lat]. */
  ways: Ring[];
  /** Häuser: da geht es nicht durch; drumherum ist Ort (Gärten, Höfe). */
  buildings: Poly[];
  /** Wasser: da geht es nicht durch. */
  water: Poly[];
  /** Flüsse, Bäche, Kanäle als Linien: queren nur über eine Brücke (also auf einem Weg). */
  waterLines?: Ring[];
  /** Bebaute Flächen (Wohn-, Gewerbe-, Industriegebiet): dort nur auf Wegen. */
  built: Poly[];
  /** Wald: abseits der Wege langsamer. */
  forest: Poly[];
  /** Äcker. */
  fields?: Poly[];
  /** Sumpf, Moor, Schilf. */
  wetland?: Poly[];
  /** Gesperrte Zonen (Sperrgebiet): da geht es nicht hinein. */
  noGo?: { center: LatLon; radiusM: number }[];
  /** Jahreszeit (für die leise Strecke: Korn versteckt nur im Sommer). */
  season?: Season;
  /** Gummistiefel: im Sumpf schneller. */
  wade?: boolean;
}

/** Tempo je Gelände (1 = auf dem Weg). */
export const SPEED: Record<Exclude<TerrainKind, 'blocked'>, number> = {
  road: TERRAIN.road.speed,
  built: TERRAIN.built.speed,
  open: TERRAIN.open.speed,
  field: TERRAIN.field.speed,
  forest: TERRAIN.forest.speed,
  wetland: TERRAIN.wetland.speed,
};
/** So nah an einer Linie gilt man als „auf dem Weg“. */
export const ON_WAY_M = 7;
/** So nah an Häusern gilt man als im Ort (Gärten, Höfe, Einfahrten). */
const NEAR_HOUSE_M = 16;

export interface Route {
  /** Punkte der Strecke, der erste ist der Start. */
  path: LatLon[];
  /** Tempo-Faktor je Abschnitt (path.length - 1 Einträge). */
  speeds: number[];
  /** Abschnitt geht quer durchs Gelände (für die Anzeige). */
  offroad: boolean[];
  /** Wo die Figur ankommt (im Ort: der nächste Punkt auf dem Weg statt der angetippten Stelle). */
  end: LatLon;
  /** Ankunft liegt nicht an der angetippten Stelle (dort kommt man nicht hin). */
  snapped: boolean;
}

interface P {
  x: number;
  y: number;
}
interface Area {
  rings: P[][];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface Hit {
  x: number;
  y: number;
  seg: number;
  /** Anteil entlang des Abschnitts (0 = a, 1 = b) */
  t: number;
  d: number;
}

const CELL = 32;
const key = (cx: number, cy: number) => cx * 100003 + cy;

/** Einfacher Raster-Index für Rechtecke. */
class Grid<T> {
  private cells = new Map<number, T[]>();
  add(x0: number, y0: number, x1: number, y1: number, item: T) {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = key(cx, cy);
        const l = this.cells.get(k);
        if (l) l.push(item);
        else this.cells.set(k, [item]);
      }
  }
  at(x: number, y: number): T[] {
    return this.cells.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? [];
  }
  around(x: number, y: number, r: number): Set<T> {
    const out = new Set<T>();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) for (const it of this.cells.get(key(cx, cy)) ?? []) out.add(it);
    return out;
  }
}

function inRing(x: number, y: number, ring: P[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function inArea(x: number, y: number, a: Area): boolean {
  if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) return false;
  if (!inRing(x, y, a.rings[0])) return false;
  for (let i = 1; i < a.rings.length; i++) if (inRing(x, y, a.rings[i])) return false;
  return true;
}

/** Kleiner Min-Heap für die Wegsuche. */
class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, k: number) {
    const ids = this.ids;
    const ks = this.keys;
    let i = ids.length;
    ids.push(id);
    ks.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ks[p] <= k) break;
      ids[i] = ids[p];
      ks[i] = ks[p];
      i = p;
    }
    ids[i] = id;
    ks[i] = k;
  }
  pop(): number {
    const ids = this.ids;
    const ks = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastK = ks.pop()!;
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && ks[c + 1] < ks[c]) c++;
        if (ks[c] >= lastK) break;
        ids[i] = ids[c];
        ks[i] = ks[c];
        i = c;
      }
      ids[i] = lastId;
      ks[i] = lastK;
    }
    return top;
  }
}

export class WalkNet {
  readonly center: LatLon;
  private kx: number;
  private ky = 111320;
  private nodes: P[] = [];
  private adj: [number, number][][] = [];
  private segs: [number, number][] = [];
  private segGrid = new Grid<number>();
  private houses: Area[] = [];
  private houseGrid = new Grid<number>();
  private nearHouseGrid = new Grid<number>();
  private water: Area[] = [];
  private waterGrid = new Grid<number>();
  private built: Area[] = [];
  private builtGrid = new Grid<number>();
  private forest: Area[] = [];
  private forestGrid = new Grid<number>();
  private fields: Area[] = [];
  private fieldGrid = new Grid<number>();
  private wet: Area[] = [];
  private wetGrid = new Grid<number>();
  private wlines: [P, P][] = [];
  private wlineGrid = new Grid<number>();
  private zones: { x: number; y: number; r: number }[] = [];
  /** Zonen, in denen man gerade steht: aus denen darf man hinaus. */
  private skipZones = new Set<number>();
  private season: Season;
  private speed: Record<Exclude<TerrainKind, 'blocked'>, number>;

  constructor(input: WalkInput) {
    this.center = input.center;
    this.kx = 111320 * Math.cos((input.center.lat * Math.PI) / 180);
    this.season = input.season ?? 'summer';
    this.speed = { ...SPEED, wetland: input.wade ? 0.6 : SPEED.wetland };
    // Wege: Punkte mit gleicher Lage (auf 1 m gerundet) werden ein Knoten
    const ids = new Map<string, number>();
    const node = (lon: number, lat: number) => {
      const p = this.toXY({ lat, lon });
      const k = `${Math.round(p.x)}|${Math.round(p.y)}`;
      let id = ids.get(k);
      if (id === undefined) {
        id = this.nodes.length;
        ids.set(k, id);
        this.nodes.push(p);
        this.adj.push([]);
      }
      return id;
    };
    for (const line of input.ways)
      for (let i = 1; i < line.length; i++) {
        const a = node(line[i - 1][0], line[i - 1][1]);
        const b = node(line[i][0], line[i][1]);
        if (a !== b) this.link(a, b);
      }
    // Kachelränder: fast gleiche Knoten verbinden
    const nodeGrid = new Grid<number>();
    this.nodes.forEach((p, i) => nodeGrid.add(p.x, p.y, p.x, p.y, i));
    this.nodes.forEach((p, i) => {
      for (const j of nodeGrid.around(p.x, p.y, 2.5)) {
        if (j <= i) continue;
        const d = Math.hypot(this.nodes[j].x - p.x, this.nodes[j].y - p.y);
        if (d <= 2.5 && !this.adj[i].some(([n]) => n === j)) this.link(i, j);
      }
    });
    const areas = (polys: Poly[], list: Area[], grid: Grid<number>, pad = 0, padGrid?: Grid<number>) => {
      for (const poly of polys) {
        if (!poly[0] || poly[0].length < 4) continue;
        const rings = poly.map((r) => r.map(([lon, lat]) => this.toXY({ lat, lon })));
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const p of rings[0]) {
          x0 = Math.min(x0, p.x);
          y0 = Math.min(y0, p.y);
          x1 = Math.max(x1, p.x);
          y1 = Math.max(y1, p.y);
        }
        const i = list.length;
        list.push({ rings, x0, y0, x1, y1 });
        grid.add(x0, y0, x1, y1, i);
        padGrid?.add(x0 - pad, y0 - pad, x1 + pad, y1 + pad, i);
      }
    };
    areas(input.buildings, this.houses, this.houseGrid, NEAR_HOUSE_M, this.nearHouseGrid);
    areas(input.water, this.water, this.waterGrid);
    areas(input.built, this.built, this.builtGrid);
    areas(input.forest, this.forest, this.forestGrid);
    areas(input.fields ?? [], this.fields, this.fieldGrid);
    areas(input.wetland ?? [], this.wet, this.wetGrid);
    for (const z of input.noGo ?? []) {
      const c = this.toXY(z.center);
      this.zones.push({ x: c.x, y: c.y, r: z.radiusM });
    }
    for (const line of input.waterLines ?? []) {
      for (let i = 1; i < line.length; i++) {
        const a = this.toXY({ lon: line[i - 1][0], lat: line[i - 1][1] });
        const b = this.toXY({ lon: line[i][0], lat: line[i][1] });
        const k = this.wlines.length;
        this.wlines.push([a, b]);
        this.wlineGrid.add(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), k);
      }
    }
  }

  /** Kreuzt die Strecke a→b einen Fluss oder Bach? */
  private crossesWater(a: P, b: P): boolean {
    if (!this.wlines.length) return false;
    const seen = new Set<number>();
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / CELL));
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n;
      const y = a.y + ((b.y - a.y) * i) / n;
      for (const k of this.wlineGrid.around(x, y, CELL)) {
        if (seen.has(k)) continue;
        seen.add(k);
        const [c, d] = this.wlines[k];
        if (segmentsCross(a, b, c, d)) return true;
      }
    }
    return false;
  }

  get wayCount() {
    return this.segs.length;
  }

  private link(a: number, b: number) {
    const pa = this.nodes[a];
    const pb = this.nodes[b];
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    this.adj[a].push([b, d]);
    this.adj[b].push([a, d]);
    const s = this.segs.length;
    this.segs.push([a, b]);
    this.segGrid.add(Math.min(pa.x, pb.x), Math.min(pa.y, pb.y), Math.max(pa.x, pb.x), Math.max(pa.y, pb.y), s);
  }

  toXY(p: LatLon): P {
    return { x: (p.lon - this.center.lon) * this.kx, y: (p.lat - this.center.lat) * this.ky };
  }

  toLatLon(p: P): LatLon {
    return { lat: this.center.lat + p.y / this.ky, lon: this.center.lon + p.x / this.kx };
  }

  /** Nächster Punkt auf einem Weg, höchstens maxM entfernt. */
  private nearest(p: P, maxM: number): Hit | null {
    let best: Hit | null = null;
    for (let r = CELL; ; r *= 2) {
      for (const s of this.segGrid.around(p.x, p.y, Math.min(r, maxM))) {
        const a = this.nodes[this.segs[s][0]];
        const b = this.nodes[this.segs[s][1]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= maxM && (!best || d < best.d)) best = { x, y, seg: s, t, d };
      }
      if (best || r >= maxM) return best;
    }
  }

  private any(grid: Grid<number>, list: Area[], p: P) {
    for (const i of grid.at(p.x, p.y)) if (inArea(p.x, p.y, list[i])) return true;
    return false;
  }

  private nearHouse(p: P) {
    for (const i of this.nearHouseGrid.at(p.x, p.y)) {
      const a = this.houses[i];
      const dx = Math.max(a.x0 - p.x, 0, p.x - a.x1);
      const dy = Math.max(a.y0 - p.y, 0, p.y - a.y1);
      if (dx * dx + dy * dy <= NEAR_HOUSE_M * NEAR_HOUSE_M) return true;
    }
    return false;
  }

  private inZone(p: P): boolean {
    for (let i = 0; i < this.zones.length; i++) {
      if (this.skipZones.has(i)) continue;
      const z = this.zones[i];
      if ((p.x - z.x) ** 2 + (p.y - z.y) ** 2 <= z.r * z.r) return true;
    }
    return false;
  }

  private terrainXY(p: P): Terrain {
    if (this.zones.length && this.inZone(p)) return 'blocked';
    const w = this.nearest(p, ON_WAY_M);
    if (w) return 'road';
    if (this.any(this.houseGrid, this.houses, p) || this.any(this.waterGrid, this.water, p)) return 'blocked';
    if (this.any(this.builtGrid, this.built, p) || this.nearHouse(p)) return 'built';
    if (this.any(this.forestGrid, this.forest, p)) return 'forest';
    if (this.any(this.wetGrid, this.wet, p)) return 'wetland';
    if (this.any(this.fieldGrid, this.fields, p)) return 'field';
    return 'open';
  }

  terrainAt(p: LatLon): Terrain {
    return this.terrainXY(this.toXY(p));
  }

  private speedOf(t: Terrain): number {
    return t === 'blocked' ? 0 : this.speed[t];
  }

  /** Tempo-Faktor an dieser Stelle. */
  speedAt(p: LatLon): number {
    return this.speedOf(this.terrainAt(p)) || this.speed.road;
  }

  /** Kosten pro Meter für die leise Strecke: Zeit mal „wie gut sieht man mich hier“. */
  private quietCost(t: Terrain): number {
    if (t === 'blocked') return Infinity;
    const v = visibility(t, this.season);
    return (1 / this.speed[t]) * (0.3 + 3 * v * v);
  }

  /** Quer durchs Gelände von a nach b: Zeit (Meter geteilt durch Tempo), oder Infinity, wenn Ort, Haus oder Wasser im Weg ist. */
  private freeLeg(a: P, b: P): { cost: number; pts: P[]; speeds: number[] } {
    if (this.crossesWater(a, b)) return { cost: Infinity, pts: [a], speeds: [] };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / 6));
    const pts: P[] = [a];
    const speeds: number[] = [];
    let cost = 0;
    let last = -1;
    for (let i = 1; i <= n; i++) {
      const m = { x: a.x + ((b.x - a.x) * (i - 0.5)) / n, y: a.y + ((b.y - a.y) * (i - 0.5)) / n };
      const t = this.terrainXY(m);
      if (t === 'blocked') return { cost: Infinity, pts, speeds };
      const v = this.speedOf(t);
      cost += len / n / v;
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      // Gleiches Gelände: Abschnitt verlängern statt neuen Punkt anzulegen
      if (v === last) pts[pts.length - 1] = p;
      else {
        pts.push(p);
        speeds.push(v);
        last = v;
      }
    }
    return { cost, pts, speeds };
  }

  /** Kürzester Weg über das Netz zwischen zwei Punkten auf Wegen. */
  private viaWays(A: Hit, B: Hit): { len: number; pts: P[] } | null {
    const pa = { x: A.x, y: A.y };
    const pb = { x: B.x, y: B.y };
    if (A.seg === B.seg) return { len: Math.hypot(pa.x - pb.x, pa.y - pb.y), pts: [pa, pb] };
    const n = this.nodes.length;
    const S = n;
    const E = n + 1;
    const [a0, a1] = this.segs[A.seg];
    const [b0, b1] = this.segs[B.seg];
    const lenA = Math.hypot(this.nodes[a1].x - this.nodes[a0].x, this.nodes[a1].y - this.nodes[a0].y);
    const lenB = Math.hypot(this.nodes[b1].x - this.nodes[b0].x, this.nodes[b1].y - this.nodes[b0].y);
    const endEdges = new Map<number, number>([
      [b0, lenB * B.t],
      [b1, lenB * (1 - B.t)],
    ]);
    const g = new Map<number, number>();
    const from = new Map<number, number>();
    const h = (i: number) => {
      const p = i === S ? pa : i === E ? pb : this.nodes[i];
      return Math.hypot(p.x - pb.x, p.y - pb.y);
    };
    const heap = new Heap();
    g.set(S, 0);
    heap.push(S, h(S));
    let steps = 0;
    while (heap.size && steps++ < 60000) {
      const u = heap.pop();
      if (u === E) break;
      const gu = g.get(u)!;
      const edges: [number, number][] = u === S ? [[a0, lenA * A.t], [a1, lenA * (1 - A.t)]] : this.adj[u];
      const extra: [number, number][] = u !== S && endEdges.has(u) ? [[E, endEdges.get(u)!]] : [];
      for (const [v, w] of edges.concat(extra)) {
        const ng = gu + w;
        if (ng < (g.get(v) ?? Infinity)) {
          g.set(v, ng);
          from.set(v, u);
          heap.push(v, ng + h(v));
        }
      }
    }
    if (!g.has(E)) return null;
    const pts: P[] = [];
    for (let c: number | undefined = E; c !== undefined; c = from.get(c)) pts.push(c === S ? pa : c === E ? pb : this.nodes[c]);
    pts.reverse();
    return { len: g.get(E)!, pts };
  }

  /** Kürzeste Wege vom Startpunkt zu allen Knoten (für den besten Absprung ins Gelände). */
  private viaExit(A: Hit, T: P): { cost: number; pts: P[]; speeds: number[]; off: boolean[] } | null {
    const n = this.nodes.length;
    const S = n;
    const [a0, a1] = this.segs[A.seg];
    const lenA = Math.hypot(this.nodes[a1].x - this.nodes[a0].x, this.nodes[a1].y - this.nodes[a0].y);
    const dist = new Map<number, number>([[S, 0]]);
    const prev = new Map<number, number>();
    const heap = new Heap();
    heap.push(S, 0);
    let steps = 0;
    while (heap.size && steps++ < 80000) {
      const u = heap.pop();
      const du = dist.get(u)!;
      const edges: [number, number][] = u === S ? [[a0, lenA * A.t], [a1, lenA * (1 - A.t)]] : this.adj[u];
      for (const [v, w] of edges) {
        const nd = du + w;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prev.set(v, u);
          heap.push(v, nd);
        }
      }
    }
    // Die nächsten erreichbaren Knoten beim Ziel durchprobieren
    const near: { i: number; d: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (!dist.has(i)) continue;
      const d = Math.hypot(this.nodes[i].x - T.x, this.nodes[i].y - T.y);
      if (d <= 600) near.push({ i, d });
    }
    near.sort((a, b) => a.d - b.d);
    let best: { cost: number; i: number; leg: { cost: number; pts: P[]; speeds: number[] } } | null = null;
    for (const { i } of near.slice(0, 40)) {
      const leg = this.freeLeg(this.nodes[i], T);
      const cost = dist.get(i)! + leg.cost;
      if (leg.cost < Infinity && (!best || cost < best.cost)) best = { cost, i, leg };
    }
    if (!best) return null;
    const way: P[] = [];
    for (let c: number | undefined = best.i; c !== undefined && c !== S; c = prev.get(c)) way.push(this.nodes[c]);
    way.push({ x: A.x, y: A.y });
    way.reverse();
    const pts = [...way, ...best.leg.pts.slice(1)];
    const speeds = [...way.slice(1).map(() => SPEED.road), ...best.leg.speeds];
    const off = [...way.slice(1).map(() => false), ...best.leg.speeds.map((v) => v !== SPEED.road)];
    return { cost: best.cost, pts, speeds, off };
  }

  /**
   * Strecke von hier zur angetippten Stelle.
   * fast: über Wege oder quer, was schneller ist. quiet: durch Deckung, auch wenn es länger dauert.
   */
  route(fromLL: LatLon, toLL: LatLon, gait: Gait = 'fast'): Route | null {
    const F = this.toXY(fromLL);
    // Steht man schon in einem Sperrgebiet, darf man hinaus
    this.skipZones.clear();
    this.zones.forEach((z, i) => {
      if ((F.x - z.x) ** 2 + (F.y - z.y) ** 2 <= z.r * z.r) this.skipZones.add(i);
    });
    try {
      if (gait === 'quiet') {
        const q = this.quietRoute(F, this.toXY(toLL));
        if (q) return q;
      }
      return this.fastRoute(F, this.toXY(toLL));
    } finally {
      this.skipZones.clear();
    }
  }

  private fastRoute(F: P, T: P): Route | null {
    const tTer = this.terrainXY(T);
    type Cand = { cost: number; pts: P[]; speeds: number[]; off: boolean[]; snapped: boolean };
    const cands: Cand[] = [];
    const reachable = tTer !== 'blocked';
    const road = this.speed.road;
    // 1. Direkt quer durchs Gelände
    if (reachable) {
      const leg = this.freeLeg(F, T);
      if (leg.cost < Infinity) cands.push({ cost: leg.cost, pts: leg.pts, speeds: leg.speeds, off: leg.speeds.map((v) => v !== road), snapped: false });
    }
    // 2. Über die Wege
    const A = this.nearest(F, 400);
    const B = this.nearest(T, 400);
    if (A && B) {
      const way = this.viaWays(A, B);
      if (way) {
        // Zum ersten Weg darf man immer (man steht ja schon irgendwo)
        const startLen = A.d;
        const pts: P[] = [F, ...way.pts];
        const speeds: number[] = [this.speed.built, ...way.pts.slice(1).map(() => road)];
        const off: boolean[] = [startLen > ON_WAY_M, ...way.pts.slice(1).map(() => false)];
        let cost = startLen / this.speed.built + way.len;
        let snapped = false;
        // Das letzte Stück quer zum Ziel (geht nicht, wenn das Ziel ein Haus oder Wasser ist)
        if (B.d > 1) {
          const leg = reachable ? this.freeLeg({ x: B.x, y: B.y }, T) : { cost: Infinity, pts: [], speeds: [] };
          if (leg.cost < Infinity) {
            pts.push(...leg.pts.slice(1));
            speeds.push(...leg.speeds);
            off.push(...leg.speeds.map((v) => v !== road));
            cost += leg.cost;
          } else snapped = B.d > ON_WAY_M;
        }
        cands.push({ cost, pts, speeds, off, snapped });
      }
    }
    // 3. Über die Wege so nah wie möglich heran, dann quer zum Ziel (z. B. ein Wrack draußen auf dem Feld)
    if (reachable && A && !cands.some((c) => !c.snapped && c.pts.length > 2)) {
      const ex = this.viaExit(A, T);
      if (ex) {
        const pts: P[] = [F, ...ex.pts];
        const speeds: number[] = [this.speed.built, ...ex.speeds];
        const off: boolean[] = [A.d > ON_WAY_M, ...ex.off];
        cands.push({ cost: A.d / this.speed.built + ex.cost, pts, speeds, off, snapped: false });
      }
    }
    if (!cands.length) return null;
    // Wer wirklich ankommt, gewinnt; sonst die schnellste Strecke
    cands.sort((a, b) => Number(a.snapped) - Number(b.snapped) || a.cost - b.cost);
    const best = cands[0];
    const path = best.pts.map((p) => this.toLatLon(p));
    return { path, speeds: best.speeds, offroad: best.off, end: path[path.length - 1], snapped: best.snapped };
  }

  /**
   * Leise Strecke: Suche auf einem Raster über das Gelände. Jede Zelle kostet Zeit mal
   * „wie gut sieht man mich hier“. Straßen und offene Wiesen sind teuer, Wald, Gärten und
   * (im Sommer) Korn billig. Danach wird die Zickzack-Linie geglättet.
   */
  private quietRoute(F: P, T: P): Route | null {
    const dist = Math.hypot(T.x - F.x, T.y - F.y);
    if (dist < 3) return null;
    const margin = 60 + dist * 0.3;
    const x0 = Math.min(F.x, T.x) - margin;
    const y0 = Math.min(F.y, T.y) - margin;
    const w = Math.max(F.x, T.x) + margin - x0;
    const hgt = Math.max(F.y, T.y) + margin - y0;
    const cell = Math.max(5, Math.sqrt((w * hgt) / 45000));
    const nx = Math.ceil(w / cell);
    const ny = Math.ceil(hgt / cell);
    const n = nx * ny;
    const KINDS: Terrain[] = ['road', 'built', 'open', 'field', 'forest', 'wetland', 'blocked'];
    const terr = new Int8Array(n).fill(-1);
    const center = (i: number): P => ({ x: x0 + ((i % nx) + 0.5) * cell, y: y0 + (Math.floor(i / nx) + 0.5) * cell });
    const kindOf = (i: number): Terrain => {
      if (terr[i] < 0) terr[i] = KINDS.indexOf(this.terrainXY(center(i)));
      return KINDS[terr[i]];
    };
    const idx = (p: P) => Math.max(0, Math.min(ny - 1, Math.floor((p.y - y0) / cell))) * nx + Math.max(0, Math.min(nx - 1, Math.floor((p.x - x0) / cell)));
    const S = idx(F);
    const E = idx(T);
    // Das Ziel selbst ist ein Haus oder Wasser: dann bringt die schnelle Strecke dich so nah wie möglich
    if (kindOf(E) === 'blocked') return null;
    const minCost = Math.min(...(['road', 'built', 'open', 'field', 'forest', 'wetland'] as Terrain[]).map((t) => this.quietCost(t)));
    const g = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const heap = new Heap();
    const ex = (i: number) => center(i).x;
    const ey = (i: number) => center(i).y;
    const hx = ex(E);
    const hy = ey(E);
    g[S] = 0;
    heap.push(S, 0);
    const DIRS = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    let steps = 0;
    while (heap.size && steps++ < 200000) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === E) break;
      const ux = u % nx;
      const uy = Math.floor(u / nx);
      const tu = kindOf(u);
      for (const [dx, dy] of DIRS) {
        const vx = ux + dx;
        const vy = uy + dy;
        if (vx < 0 || vy < 0 || vx >= nx || vy >= ny) continue;
        const v = vy * nx + vx;
        if (done[v]) continue;
        const tv = kindOf(v);
        if (tv === 'blocked' && v !== E) continue;
        // Über Bäche und Flüsse nur auf einem Weg (Brücke)
        if ((tu !== 'road' || tv !== 'road') && this.crossesWater(center(u), center(v))) continue;
        const len = cell * (dx && dy ? Math.SQRT2 : 1);
        const ng = g[u] + len * (this.quietCost(tv) + this.quietCost(tu)) * 0.5;
        if (ng < g[v]) {
          g[v] = ng;
          from[v] = u;
          heap.push(v, ng + Math.hypot(ex(v) - hx, ey(v) - hy) * minCost);
        }
      }
    }
    if (!isFinite(g[E])) return null;
    const cells: number[] = [];
    for (let c = E; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    const raw: P[] = [F, ...cells.slice(1, -1).map(center), T];
    // Glätten: so weit geradeaus, wie die Linie nicht durch teureres Gelände führt
    const worst = (a: number, b: number) => {
      let m = 0;
      for (let k = a; k <= b; k++) m = Math.max(m, this.quietCost(this.terrainXY(raw[k])));
      return m;
    };
    const lineOk = (a: P, b: P, limit: number) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const k = Math.max(1, Math.ceil(len / 4));
      for (let i = 1; i < k; i++) {
        const q = { x: a.x + ((b.x - a.x) * i) / k, y: a.y + ((b.y - a.y) * i) / k };
        if (this.quietCost(this.terrainXY(q)) > limit + 1e-9) return false;
      }
      return !this.crossesWater(a, b) || (this.terrainXY(a) === 'road' && this.terrainXY(b) === 'road');
    };
    const pts: P[] = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let j = Math.min(raw.length - 1, i + 1);
      for (let k = Math.min(raw.length - 1, i + 40); k > i + 1; k--) {
        if (lineOk(raw[i], raw[k], worst(i, k))) {
          j = k;
          break;
        }
      }
      pts.push(raw[j]);
      i = j;
    }
    // Tempo je Abschnitt (aus dem Gelände in der Mitte)
    const speeds: number[] = [];
    const off: boolean[] = [];
    for (let k = 1; k < pts.length; k++) {
      const t = this.terrainXY({ x: (pts[k - 1].x + pts[k].x) / 2, y: (pts[k - 1].y + pts[k].y) / 2 });
      const v = this.speedOf(t) || this.speed.built;
      speeds.push(v);
      off.push(t !== 'road');
    }
    const path = pts.map((p) => this.toLatLon(p));
    return { path, speeds, offroad: off, end: path[path.length - 1], snapped: false };
  }

  /**
   * Ein Schritt mit dem Joystick: überall hin außer durch Häuser, Wasser und Sperrgebiete.
   * Über Flüsse und Bäche nur auf einem Weg (Brücke).
   */
  step(fromLL: LatLon, toLL: LatLon): LatLon {
    const P0 = this.toXY(fromLL);
    const P1 = this.toXY(toLL);
    this.skipZones.clear();
    this.zones.forEach((z, i) => {
      if ((P0.x - z.x) ** 2 + (P0.y - z.y) ** 2 <= z.r * z.r) this.skipZones.add(i);
    });
    const t = this.terrainXY(P1);
    this.skipZones.clear();
    if (t !== 'road' && this.crossesWater(P0, P1)) return fromLL;
    if (t !== 'blocked') return toLL;
    // In ein Haus gelaufen: am Rand entlang rutschen geht nicht, also stehen bleiben
    return fromLL;
  }

  /**
   * Strecke eines Trupps: vom nächsten Weg am Startpunkt ein Zufallsweg über das Netz,
   * so lang wie verlangt. Gleicher Zufall, gleiche Wege, gleiche Strecke (für alle Spieler).
   * null, wenn in der Nähe kein Weg ist.
   */
  patrolPath(anchor: LatLon, lengthM: number, rnd: () => number): LatLon[] | null {
    const A = this.nearest(this.toXY(anchor), 250);
    if (!A) return null;
    const [a0, a1] = this.segs[A.seg];
    const pts: P[] = [{ x: A.x, y: A.y }];
    // Erste Richtung: zum einen oder anderen Ende des Abschnitts
    let prev = rnd() < 0.5 ? a0 : a1;
    let cur = prev === a0 ? a1 : a0;
    pts.push(this.nodes[cur]);
    let len = Math.hypot(this.nodes[cur].x - A.x, this.nodes[cur].y - A.y);
    let guard = 0;
    while (len < lengthM && guard++ < 400) {
      const here = this.nodes[cur];
      // Nach Richtung sortiert, damit die Reihenfolge der Kartendaten keine Rolle spielt
      const opts = this.adj[cur]
        .filter(([v]) => v !== prev)
        .map(([v, d]) => ({ v, d, ang: Math.atan2(this.nodes[v].y - here.y, this.nodes[v].x - here.x) }))
        .sort((p, q) => p.ang - q.ang);
      if (!opts.length) break;
      const nxt = opts[Math.floor(rnd() * opts.length)];
      prev = cur;
      cur = nxt.v;
      pts.push(this.nodes[cur]);
      len += nxt.d;
    }
    return pts.length > 1 ? pts.map((p) => this.toLatLon(p)) : null;
  }
}

/** Schneiden sich die Strecken ab und cd? */
function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}
