// Das Gelände deiner Endstation: Abschnitte zurückerobern, Hindernisse wegräumen,
// frei bauen (Wände, Türen, Fenster, Böden, Dächer) und einrichten.
// Reine Daten und Rechnungen, ohne Browser: läuft später genauso auf dem Server.
//
// Koordinaten: Felder (x, y) von 0 bis PLOT-1, 1 Feld = 1 m. y wächst nach Süden.
// Wände liegen auf den Kanten zwischen Feldern:
//   "h x,y" = waagerechte Kante oberhalb von Feld (x, y), von Ecke (x,y) bis (x+1,y)
//   "v x,y" = senkrechte Kante links von Feld (x, y), von Ecke (x,y) bis (x,y+1)

import { RESOURCE_ORDER } from './content';
import { FURNITURE, footprint, isJunk, type FurnitureId } from './furniture';
import { pickWeighted, randInt, rngFrom } from './rng';
import type { Inventory, JunkBag, PlacedItem, Plot, RejectReason, Resource, SpotKind } from './types';

export const PLOT = 72;
export const SECTION = 12;
export const SECTIONS = PLOT / SECTION;
/** Die vier Abschnitte in der Mitte sind von Anfang an frei (24 × 24 m). */
export const START_SECTIONS = ['2,2', '3,2', '2,3', '3,3'];

const RES: Resource[] = RESOURCE_ORDER;

// --- Schauplätze -------------------------------------------------------------------

export type SiteId = 'depot' | 'farm' | 'lake' | 'fuel' | 'allotment';

export interface SiteDef {
  name: string;
  where: string;
  desc: string;
  /** Zum Start wählbar. Alle anderen findet man draußen als Lageplan. */
  start: boolean;
  /** An welchen Fundstellen es den Lageplan gibt. */
  findAt: SpotKind[];
  obstacles: [ObstacleKind, number][];
}

export const SITES: Record<SiteId, SiteDef> = {
  depot: {
    name: 'Busdepot',
    where: 'Am Stadtrand',
    desc: 'Die alte Endhaltestelle der Linie 0. Viel Beton, viel Schrott, viel Platz.',
    start: true,
    findAt: ['stop'],
    obstacles: [['rubble', 3], ['debris', 3], ['wreck', 2], ['tires', 2], ['trash', 2], ['barrels', 1], ['bush', 1]],
  },
  farm: {
    name: 'Bauernhof',
    where: 'Draußen auf dem Land',
    desc: 'Weite Felder, eine eingefallene Scheune und endlich Ruhe. Hier wächst etwas.',
    start: true,
    findAt: ['well', 'shed'],
    obstacles: [['bush', 3], ['hay', 3], ['tree', 2], ['cart', 1], ['debris', 1], ['compost', 1], ['rock', 1]],
  },
  lake: {
    name: 'Seeufer',
    where: 'Am Waldrand',
    desc: 'Ein Steg, Kiefern und Wasser, so weit man schaut. Abends spiegelt sich das Feuer im See.',
    start: true,
    findAt: ['well', 'hide'],
    obstacles: [['tree', 4], ['rock', 3], ['bush', 2], ['driftwood', 2], ['deadTree', 1]],
  },
  fuel: {
    name: 'Tankstelle',
    where: 'An der Landstraße',
    desc: 'Das Vordach steht noch, die Zapfsäulen sind trocken. Platz genug für ein neues Leben.',
    start: false,
    findAt: ['fuel', 'car'],
    obstacles: [['wreck', 3], ['tires', 2], ['barrels', 2], ['debris', 2], ['rubble', 1], ['bush', 1]],
  },
  allotment: {
    name: 'Schrebergarten',
    where: 'Hinter der Siedlung',
    desc: 'Hecken, Lauben und Gartenzwerge. Ein kleines Paradies, das keiner mehr pflegt.',
    start: false,
    findAt: ['shed', 'parcel'],
    obstacles: [['bush', 4], ['tree', 2], ['compost', 2], ['deadTree', 1], ['debris', 1], ['trash', 1]],
  },
};
export const SITE_ORDER = Object.keys(SITES) as SiteId[];
/** Chance auf einen Lageplan, wenn es dort einen zu finden gibt. */
export const SITE_PLAN_CHANCE = { poi: 0.15, grid: 0.03 };

// --- Hindernisse -------------------------------------------------------------------

export type ObstacleKind =
  | 'rubble'
  | 'debris'
  | 'wreck'
  | 'tires'
  | 'trash'
  | 'bush'
  | 'hay'
  | 'tree'
  | 'deadTree'
  | 'rock'
  | 'driftwood'
  | 'barrels'
  | 'compost'
  | 'cart';

export interface ObstacleDef {
  name: string;
  w: number;
  d: number;
  reward: Partial<Inventory>;
  /** Was man damit macht (Knopf-Beschriftung). */
  verb: string;
}

export const OBSTACLES: Record<ObstacleKind, ObstacleDef> = {
  rubble: { name: 'Schutthaufen', w: 2, d: 2, reward: { stone: 3 }, verb: 'Wegräumen' },
  debris: { name: 'Trümmer', w: 1, d: 1, reward: { stone: 1 }, verb: 'Wegräumen' },
  wreck: { name: 'Autowrack', w: 2, d: 4, reward: { metal: 4, glass: 1, plastic: 1, screws: 1 }, verb: 'Ausschlachten' },
  tires: { name: 'Reifenstapel', w: 1, d: 1, reward: { plastic: 2 }, verb: 'Wegrollen' },
  trash: { name: 'Müllsäcke', w: 2, d: 1, reward: { plastic: 1, cloth: 1 }, verb: 'Durchwühlen' },
  bush: { name: 'Gestrüpp', w: 1, d: 1, reward: { wood: 1 }, verb: 'Roden' },
  hay: { name: 'Heuballen', w: 1, d: 1, reward: { wood: 1 }, verb: 'Wegrollen' },
  tree: { name: 'Baum', w: 1, d: 1, reward: { wood: 3 }, verb: 'Fällen' },
  deadTree: { name: 'Toter Baum', w: 1, d: 1, reward: { wood: 2 }, verb: 'Fällen' },
  rock: { name: 'Felsbrocken', w: 1, d: 1, reward: { stone: 2 }, verb: 'Zerschlagen' },
  driftwood: { name: 'Treibholz', w: 2, d: 1, reward: { wood: 2 }, verb: 'Einsammeln' },
  barrels: { name: 'Alte Fässer', w: 1, d: 1, reward: { metal: 1, water: 1 }, verb: 'Leeren' },
  compost: { name: 'Komposthaufen', w: 1, d: 1, reward: { wood: 1, food: 1 }, verb: 'Umgraben' },
  cart: { name: 'Leiterwagen', w: 2, d: 1, reward: { wood: 2, metal: 1 }, verb: 'Zerlegen' },
};

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  d: number;
}

/** Hindernisse eines Abschnitts. Gleiche Eingabe -> gleiches Ergebnis. */
export function sectionObstacles(seed: string, site: SiteId, sx: number, sy: number): Obstacle[] {
  const r = rngFrom('gelaende', seed, site, sx, sy);
  const isStart = START_SECTIONS.includes(`${sx},${sy}`);
  const n = isStart ? 8 : randInt(r, 10, 14);
  const used = new Uint8Array(SECTION * SECTION);
  const out: Obstacle[] = [];
  for (let tries = 0; out.length < n && tries < 160; tries++) {
    const kind = pickWeighted(r, SITES[site].obstacles);
    const def = OBSTACLES[kind];
    const turn = def.w !== def.d && r() < 0.5;
    const w = turn ? def.d : def.w;
    const d = turn ? def.w : def.d;
    const lx = randInt(r, 0, SECTION - w);
    const ly = randInt(r, 0, SECTION - d);
    let free = true;
    for (let y = ly; y < ly + d && free; y++) for (let x = lx; x < lx + w; x++) if (used[y * SECTION + x]) free = false;
    if (!free) continue;
    for (let y = ly; y < ly + d; y++) for (let x = lx; x < lx + w; x++) used[y * SECTION + x] = 1;
    out.push({ id: `${sx},${sy}:${out.length}`, kind, x: sx * SECTION + lx, y: sy * SECTION + ly, w, d });
  }
  return out;
}

// --- Bauteile ----------------------------------------------------------------------

export type WallId = 'plankWall' | 'sheetWall' | 'brickWall' | 'chainFence' | 'picketFence';
export type OpeningId = 'door' | 'window' | 'arch' | 'gate';
export type FloorId = 'plankFloor' | 'concreteFloor' | 'gravelFloor' | 'tileFloor' | 'carpetFloor';
export type RoofId = 'tarpRoof' | 'sheetRoof' | 'tileRoof';
export type PieceId = WallId | OpeningId | FloorId | RoofId;
export type PieceGroup = 'wall' | 'fence' | 'opening' | 'floor' | 'roof';

export interface PieceDef {
  name: string;
  group: PieceGroup;
  cost: Partial<Inventory>;
  starter?: boolean;
  desc: string;
  /** Nur Öffnungen: in welche Art Wand sie passen. */
  fits?: 'wall' | 'fence';
}

export const PIECES: Record<PieceId, PieceDef> = {
  plankWall: { name: 'Bretterwand', group: 'wall', cost: { wood: 1 }, starter: true, desc: 'Alte Bretter, krumm genagelt. Hält.' },
  sheetWall: { name: 'Wellblechwand', group: 'wall', cost: { metal: 1 }, starter: true, desc: 'Laut bei Regen, aber dicht.' },
  brickWall: { name: 'Ziegelmauer', group: 'wall', cost: { stone: 2 }, desc: 'Stein auf Stein. Für die Ewigkeit.' },
  chainFence: { name: 'Maschendrahtzaun', group: 'fence', cost: { metal: 1 }, starter: true, desc: 'Zeigt, wo dein Gelände anfängt.' },
  picketFence: { name: 'Lattenzaun', group: 'fence', cost: { wood: 1 }, desc: 'Weiß gestrichen, fast wie im Bilderbuch.' },
  door: { name: 'Tür', group: 'opening', fits: 'wall', cost: { wood: 2 }, starter: true, desc: 'Damit man rein und raus kommt.' },
  window: { name: 'Fenster', group: 'opening', fits: 'wall', cost: { glass: 1, wood: 1 }, starter: true, desc: 'Licht rein, Blick raus.' },
  arch: { name: 'Durchgang', group: 'opening', fits: 'wall', cost: {}, starter: true, desc: 'Ein offenes Loch in der Wand, für Räume ohne Tür.' },
  gate: { name: 'Gartentor', group: 'opening', fits: 'fence', cost: { wood: 1, metal: 1 }, starter: true, desc: 'Ein Tor im Zaun.' },
  plankFloor: { name: 'Dielenboden', group: 'floor', cost: { wood: 1 }, starter: true, desc: 'Warm unter den Füßen.' },
  concreteFloor: { name: 'Betonplatten', group: 'floor', cost: { stone: 1 }, starter: true, desc: 'Grau, eben, unkaputtbar.' },
  gravelFloor: { name: 'Kiesweg', group: 'floor', cost: { stone: 1 }, starter: true, desc: 'Knirscht bei jedem Schritt.' },
  tileFloor: { name: 'Fliesen', group: 'floor', cost: { stone: 1, glue: 1 }, desc: 'Schachbrettmuster. Sehr schick.' },
  carpetFloor: { name: 'Teppichboden', group: 'floor', cost: { cloth: 1, glue: 1 }, desc: 'Weich, gemütlich, ein bisschen muffig.' },
  tarpRoof: { name: 'Plane', group: 'roof', cost: { plastic: 1 }, starter: true, desc: 'Hält den gröbsten Regen ab.' },
  sheetRoof: { name: 'Wellblechdach', group: 'roof', cost: { metal: 1 }, starter: true, desc: 'Prasselt herrlich, wenn es regnet.' },
  tileRoof: { name: 'Ziegeldach', group: 'roof', cost: { stone: 2 }, desc: 'Rote Ziegel. Ein richtiges Haus.' },
};
export const PIECE_ORDER = Object.keys(PIECES) as PieceId[];

// --- Baupläne ----------------------------------------------------------------------

export type BlueprintId = FurnitureId | PieceId;

/** Wo man welchen Bauplan findet. */
export const BLUEPRINT_SOURCES: Partial<Record<SpotKind, BlueprintId[]>> = {
  stop: ['clock', 'timetable', 'busSeat', 'streetLamp'],
  hardware: ['toolwall', 'lamp', 'raisedBed', 'stove', 'solarPanel', 'brickWall', 'tileFloor', 'tileRoof'],
  market: ['fridge', 'sofa', 'kitchen', 'carpetFloor'],
  pharmacy: ['medCabinet'],
  fuel: ['vending', 'streetLamp'],
  shed: ['fairyLights', 'shelf', 'gnome', 'appleTree', 'picketFence'],
  container: ['sofa', 'shelf', 'dartboard', 'bed'],
  parcel: ['fairyLights', 'lamp', 'picture', 'bed', 'carpetFloor'],
  hide: ['hammock'],
  backpack: ['picture'],
};
/** Chance auf einen Bauplan, wenn es dort noch einen zu finden gibt. */
export const BLUEPRINT_CHANCE = { poi: 0.3, grid: 0.08 };

export function isPiece(id: BlueprintId): id is PieceId {
  return id in PIECES;
}

export function blueprintName(id: BlueprintId): string {
  return isPiece(id) ? PIECES[id].name : FURNITURE[id].name;
}

export function isStarter(id: BlueprintId): boolean {
  return !!(isPiece(id) ? PIECES[id].starter : FURNITURE[id].starter);
}

// --- Gelände -----------------------------------------------------------------------

export function newPlot(): Plot {
  return { sections: [...START_SECTIONS], cleared: [], walls: {}, floors: {}, roofs: {}, items: [], nextUid: 1 };
}

export const cellIndex = (x: number, y: number) => y * PLOT + x;
export const inPlot = (x: number, y: number) => x >= 0 && y >= 0 && x < PLOT && y < PLOT;
export const sectionKey = (sx: number, sy: number) => `${sx},${sy}`;
export const cellKey = (x: number, y: number) => `${x},${y}`;

export function sectionOf(x: number, y: number): string {
  return sectionKey(Math.floor(x / SECTION), Math.floor(y / SECTION));
}

/** Kosten für den nächsten Abschnitt: wird mit jedem Abschnitt etwas teurer. */
export function reclaimCost(plot: Plot): Partial<Inventory> {
  const k = Math.max(0, plot.sections.length - START_SECTIONS.length);
  return { wood: 8 + 3 * k, metal: 5 + 2 * k, food: 2 + Math.floor(k / 2) };
}

/** Darf dieser Abschnitt als Nächstes zurückerobert werden? */
export function canReclaim(plot: Plot, sx: number, sy: number): boolean {
  if (sx < 0 || sy < 0 || sx >= SECTIONS || sy >= SECTIONS) return false;
  if (plot.sections.includes(sectionKey(sx, sy))) return false;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => plot.sections.includes(sectionKey(sx + dx, sy + dy)));
}

// --- Kanten ------------------------------------------------------------------------

export type EdgeKey = string;
export const hEdge = (x: number, y: number): EdgeKey => `h${x},${y}`;
export const vEdge = (x: number, y: number): EdgeKey => `v${x},${y}`;

export function parseEdge(key: EdgeKey): { o: 'h' | 'v'; x: number; y: number } {
  const [x, y] = key.slice(1).split(',').map(Number);
  return { o: key[0] as 'h' | 'v', x, y };
}

export function validEdge(key: EdgeKey): boolean {
  const { o, x, y } = parseEdge(key);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  return o === 'h' ? x >= 0 && x < PLOT && y >= 0 && y <= PLOT : x >= 0 && x <= PLOT && y >= 0 && y < PLOT;
}

/** Die beiden Felder links/rechts bzw. oben/unten der Kante (null = außerhalb). */
export function edgeCells(key: EdgeKey): [[number, number] | null, [number, number] | null] {
  const { o, x, y } = parseEdge(key);
  const a: [number, number] = o === 'h' ? [x, y - 1] : [x - 1, y];
  const b: [number, number] = [x, y];
  return [inPlot(...a) ? a : null, inPlot(...b) ? b : null];
}

/** Rückseite eines Feldes je nach Drehung (dort hängt ein Wand-Teil). */
export function backEdge(x: number, y: number, rot: number): EdgeKey {
  switch (((rot % 4) + 4) % 4) {
    case 0:
      return hEdge(x, y);
    case 1:
      return vEdge(x + 1, y);
    case 2:
      return hEdge(x, y + 1);
    default:
      return vEdge(x, y);
  }
}

/** Kanten entlang einer geraden Linie von Ecke zu Ecke (sonst leer). */
export function lineEdges(x1: number, y1: number, x2: number, y2: number): EdgeKey[] {
  const out: EdgeKey[] = [];
  if (y1 === y2) for (let x = Math.min(x1, x2); x < Math.max(x1, x2); x++) out.push(hEdge(x, y1));
  else if (x1 === x2) for (let y = Math.min(y1, y2); y < Math.max(y1, y2); y++) out.push(vEdge(x1, y));
  return out;
}

/** Die vier Seiten eines Rechtecks zwischen zwei Ecken. */
export function roomEdges(x1: number, y1: number, x2: number, y2: number): EdgeKey[] {
  const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
  if (ax === bx || ay === by) return lineEdges(x1, y1, x2, y2);
  return [...lineEdges(ax, ay, bx, ay), ...lineEdges(ax, by, bx, by), ...lineEdges(ax, ay, ax, by), ...lineEdges(bx, ay, bx, by)];
}

/** Alle Felder in einem Rechteck (beide Ecken eingeschlossen). */
export function rectCells(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = Math.max(0, Math.min(y1, y2)); y <= Math.min(PLOT - 1, Math.max(y1, y2)); y++)
    for (let x = Math.max(0, Math.min(x1, x2)); x <= Math.min(PLOT - 1, Math.max(x1, x2)); x++) out.push([x, y]);
  return out;
}

// --- Übersicht über ein Gelände (für Regeln und Anzeige) ------------------------------

export interface PlotIndex {
  site: SiteId;
  /** Hindernisse in freien Abschnitten, die noch nicht weggeräumt sind. */
  obstacles: Obstacle[];
  unlocked: Uint8Array;
  /** Index in obstacles oder -1. */
  obstacleAt: Int16Array;
  /** uid des Möbels (Ebene "object") oder 0. */
  objectAt: Int32Array;
  /** uid des Bodenteils (Teppich) oder 0. */
  floorItemAt: Int32Array;
  /** Wand-Teile: "Kante|Feldindex" -> uid */
  wallItems: Map<string, number>;
}

export function indexPlot(seed: string, site: SiteId, plot: Plot): PlotIndex {
  const n = PLOT * PLOT;
  const unlocked = new Uint8Array(n);
  const obstacleAt = new Int16Array(n).fill(-1);
  const objectAt = new Int32Array(n);
  const floorItemAt = new Int32Array(n);
  const wallItems = new Map<string, number>();
  const cleared = new Set(plot.cleared);
  const obstacles: Obstacle[] = [];
  for (const key of plot.sections) {
    const [sx, sy] = key.split(',').map(Number);
    for (let y = sy * SECTION; y < (sy + 1) * SECTION; y++) for (let x = sx * SECTION; x < (sx + 1) * SECTION; x++) unlocked[cellIndex(x, y)] = 1;
    for (const o of sectionObstacles(seed, site, sx, sy)) {
      if (cleared.has(o.id)) continue;
      const i = obstacles.push(o) - 1;
      for (let y = o.y; y < o.y + o.d; y++) for (let x = o.x; x < o.x + o.w; x++) obstacleAt[cellIndex(x, y)] = i;
    }
  }
  for (const it of plot.items) {
    const def = FURNITURE[it.kind];
    if (def.layer === 'wall') {
      wallItems.set(`${backEdge(it.x, it.y, it.rot)}|${cellIndex(it.x, it.y)}`, it.uid);
      continue;
    }
    const f = footprint(it.kind, it.rot);
    const grid = def.layer === 'floor' ? floorItemAt : objectAt;
    for (let y = it.y; y < it.y + f.d; y++) for (let x = it.x; x < it.x + f.w; x++) if (inPlot(x, y)) grid[cellIndex(x, y)] = it.uid;
  }
  return { site, obstacles, unlocked, obstacleAt, objectAt, floorItemAt, wallItems };
}

/** Feld frei zum Bebauen (zurückerobert, kein Hindernis)? */
export function cellFree(idx: PlotIndex, x: number, y: number): boolean {
  if (!inPlot(x, y)) return false;
  const i = cellIndex(x, y);
  return idx.unlocked[i] === 1 && idx.obstacleAt[i] < 0;
}

/** Wand-Teile, die an dieser Kante hängen (auf beiden Seiten). */
export function itemsOnEdge(idx: PlotIndex, edge: EdgeKey): number[] {
  const out: number[] = [];
  for (const c of edgeCells(edge)) {
    if (!c) continue;
    const uid = idx.wallItems.get(`${edge}|${cellIndex(c[0], c[1])}`);
    if (uid) out.push(uid);
  }
  return out;
}

// --- Möbel platzieren ----------------------------------------------------------------

/** Darf ein Teil hier stehen? Gibt den Grund zurück, falls nicht. */
export function itemProblem(idx: PlotIndex, plot: Plot, kind: FurnitureId, x: number, y: number, rot: number, ignoreUid?: number): RejectReason | null {
  const def = FURNITURE[kind];
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 'blocked';
  // Nützliche Anlagen gibt es nur einmal (aufrüsten statt mehrfach bauen)
  if (def.unique && plot.items.some((i) => i.kind === kind && i.uid !== ignoreUid)) return 'only_one';
  const { w, d } = footprint(kind, rot);
  for (let cy = y; cy < y + d; cy++) for (let cx = x; cx < x + w; cx++) if (!cellFree(idx, cx, cy)) return 'blocked';
  if (def.layer === 'wall') {
    const edge = backEdge(x, y, rot);
    const wall = plot.walls[edge];
    if (!wall || PIECES[wall.k].group !== 'wall' || wall.o) return 'no_wall';
    const other = idx.wallItems.get(`${edge}|${cellIndex(x, y)}`);
    if (other && other !== ignoreUid) return 'blocked';
    return null;
  }
  const grid = def.layer === 'floor' ? idx.floorItemAt : idx.objectAt;
  for (let cy = y; cy < y + d; cy++)
    for (let cx = x; cx < x + w; cx++) {
      const uid = grid[cellIndex(cx, cy)];
      if (uid && uid !== ignoreUid) return 'blocked';
    }
  // Keine Wand mitten durch das Teil
  for (let cy = y; cy < y + d; cy++)
    for (let cx = x; cx < x + w; cx++) {
      if (cx > x && plot.walls[vEdge(cx, cy)]) return 'blocked';
      if (cy > y && plot.walls[hEdge(cx, cy)]) return 'blocked';
    }
  return null;
}

// --- Bauen und Abreißen --------------------------------------------------------------

export interface BuildPlan {
  /** Kanten oder Felder, die sich ändern. */
  keys: string[];
  /** Kanten oder Felder, an denen es nicht geht. */
  blocked: string[];
  cost: Partial<Inventory>;
  refund: Partial<Inventory>;
  /** Wand-Teile, die dabei eingelagert werden (Material zurück). */
  store: number[];
}

function addTo(target: Partial<Inventory>, add: Partial<Inventory>, f = 1) {
  for (const r of RES) if (add[r]) target[r] = (target[r] ?? 0) + (add[r] ?? 0) * f;
}

function emptyPlan(): BuildPlan {
  return { keys: [], blocked: [], cost: {}, refund: {}, store: [] };
}

/** Darf an dieser Kante eine Wand stehen? */
function edgeProblem(idx: PlotIndex, plot: Plot, edge: EdgeKey): boolean {
  if (!validEdge(edge)) return true;
  const [a, b] = edgeCells(edge);
  const open = (c: [number, number] | null) => !!c && idx.unlocked[cellIndex(c[0], c[1])] === 1;
  if (!open(a) && !open(b)) return true;
  if (a && b) {
    const ia = cellIndex(a[0], a[1]);
    const ib = cellIndex(b[0], b[1]);
    if (idx.obstacleAt[ia] >= 0 && idx.obstacleAt[ia] === idx.obstacleAt[ib]) return true;
    if (idx.objectAt[ia] && idx.objectAt[ia] === idx.objectAt[ib]) return true;
    if (idx.floorItemAt[ia] && idx.floorItemAt[ia] === idx.floorItemAt[ib]) return true;
  }
  void plot;
  return false;
}

export function planWalls(idx: PlotIndex, plot: Plot, piece: WallId, edges: EdgeKey[]): BuildPlan {
  const plan = emptyPlan();
  const def = PIECES[piece];
  for (const e of edges) {
    if (edgeProblem(idx, plot, e)) {
      plan.blocked.push(e);
      continue;
    }
    const old = plot.walls[e];
    if (old && old.k === piece) continue;
    plan.keys.push(e);
    addTo(plan.cost, def.cost);
    if (old) {
      addTo(plan.refund, PIECES[old.k].cost);
      // Gleiche Art (Wand -> Wand): Tür/Fenster bleiben drin.
      // Andere Art (Wand -> Zaun): Öffnung und Wand-Teile kommen ab.
      if (PIECES[old.k].group !== def.group) {
        if (old.o) addTo(plan.refund, PIECES[old.o].cost);
        plan.store.push(...itemsOnEdge(idx, e));
      }
    }
  }
  return plan;
}

export function planOpening(idx: PlotIndex, plot: Plot, piece: OpeningId, edges: EdgeKey[]): BuildPlan {
  const plan = emptyPlan();
  const def = PIECES[piece];
  for (const e of edges) {
    const wall = plot.walls[e];
    if (!wall || PIECES[wall.k].group !== def.fits) {
      plan.blocked.push(e);
      continue;
    }
    if (wall.o === piece) continue;
    plan.keys.push(e);
    addTo(plan.cost, def.cost);
    if (wall.o) addTo(plan.refund, PIECES[wall.o].cost);
    plan.store.push(...itemsOnEdge(idx, e));
  }
  return plan;
}

export function planPaint(idx: PlotIndex, plot: Plot, layer: 'floors' | 'roofs', piece: FloorId | RoofId, cells: [number, number][]): BuildPlan {
  const plan = emptyPlan();
  const def = PIECES[piece];
  const map = plot[layer];
  for (const [x, y] of cells) {
    const key = cellKey(x, y);
    if (!cellFree(idx, x, y)) {
      plan.blocked.push(key);
      continue;
    }
    const old = map[key];
    if (old === piece) continue;
    plan.keys.push(key);
    addTo(plan.cost, def.cost);
    if (old) addTo(plan.refund, PIECES[old].cost);
  }
  return plan;
}

export function planDemolish(idx: PlotIndex, plot: Plot, layer: 'walls' | 'openings' | 'floors' | 'roofs', keys: string[]): BuildPlan {
  const plan = emptyPlan();
  for (const k of keys) {
    if (layer === 'walls' || layer === 'openings') {
      const w = plot.walls[k];
      if (!w || (layer === 'openings' && !w.o)) continue;
      plan.keys.push(k);
      if (layer === 'walls') {
        addTo(plan.refund, PIECES[w.k].cost);
        plan.store.push(...itemsOnEdge(idx, k));
      }
      if (w.o) addTo(plan.refund, PIECES[w.o].cost);
    } else {
      const old = plot[layer][k];
      if (!old) continue;
      plan.keys.push(k);
      addTo(plan.refund, PIECES[old].cost);
    }
  }
  return plan;
}

/** Reicht das Inventar (inklusive Rückerstattung) für den Plan? */
export function planAffordable(inv: Inventory, plan: BuildPlan): boolean {
  return RES.every((r) => inv[r] + (plan.refund[r] ?? 0) >= (plan.cost[r] ?? 0));
}

/** Ein aufgestelltes Teil zurück ins Lager: Rohstoffe zurück, Fundstücke wieder in den Rucksack. */
export function storeItem(bag: { inventory: Inventory; junk: JunkBag }, it: PlacedItem): Partial<Inventory> {
  if (isJunk(it.kind)) {
    bag.junk[it.kind] = (bag.junk[it.kind] ?? 0) + 1;
    return {};
  }
  const refund = FURNITURE[it.kind].cost;
  for (const r of RES) bag.inventory[r] += refund[r] ?? 0;
  return { ...refund };
}

/** Plan anwenden: Rohstoffe abziehen/gutschreiben, Teile einlagern. Gibt die Rückerstattung der eingelagerten Teile zurück. */
export function applyPlan(bag: { inventory: Inventory; junk: JunkBag }, plot: Plot, plan: BuildPlan, change: (key: string) => void): Partial<Inventory> {
  const storedRefund: Partial<Inventory> = {};
  for (const uid of new Set(plan.store)) {
    const it = plot.items.find((i) => i.uid === uid);
    if (!it) continue;
    addTo(storedRefund, storeItem(bag, it));
    plot.items = plot.items.filter((i) => i.uid !== uid);
  }
  const inv = bag.inventory;
  for (const r of RES) inv[r] += (plan.refund[r] ?? 0) - (plan.cost[r] ?? 0);
  for (const k of plan.keys) change(k);
  return storedRefund;
}

// --- Räume ---------------------------------------------------------------------------

export interface Room {
  cells: number[];
  /** Jedes Feld hat ein Dach. */
  roofed: boolean;
  /** Jedes Feld hat einen Boden. */
  floored: boolean;
}

/** Blockiert diese Kante den Durchgang für Räume? Wände ja (auch mit Tür/Fenster), Durchgänge und Zäune nicht. */
function closes(plot: Plot, edge: EdgeKey): boolean {
  const w = plot.walls[edge];
  return !!w && PIECES[w.k].group === 'wall' && w.o !== 'arch';
}

/** Geschlossene Bereiche: rundum Wände, kein offener Weg nach draußen. */
export function findRooms(plot: Plot): { rooms: Room[]; roomAt: Int16Array } {
  const n = PLOT * PLOT;
  const comp = new Int32Array(n).fill(-1);
  const roomAt = new Int16Array(n).fill(-1);
  const rooms: Room[] = [];
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (comp[start] >= 0) continue;
    const cells: number[] = [];
    let open = false;
    const stack = [start];
    comp[start] = id;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const x = c % PLOT;
      const y = (c - x) / PLOT;
      const steps: [number, number, EdgeKey][] = [
        [x + 1, y, vEdge(x + 1, y)],
        [x - 1, y, vEdge(x, y)],
        [x, y + 1, hEdge(x, y + 1)],
        [x, y - 1, hEdge(x, y)],
      ];
      for (const [nx, ny, e] of steps) {
        if (closes(plot, e)) continue;
        if (!inPlot(nx, ny)) {
          open = true;
          continue;
        }
        const ni = cellIndex(nx, ny);
        if (comp[ni] < 0) {
          comp[ni] = id;
          stack.push(ni);
        }
      }
    }
    id++;
    if (open || cells.length > PLOT * PLOT / 2) continue;
    const key = (c: number) => cellKey(c % PLOT, Math.floor(c / PLOT));
    const room: Room = {
      cells,
      roofed: cells.every((c) => !!plot.roofs[key(c)]),
      floored: cells.every((c) => !!plot.floors[key(c)]),
    };
    for (const c of cells) roomAt[c] = rooms.length;
    rooms.push(room);
  }
  return { rooms, roomAt };
}

// --- Gemütlichkeit -------------------------------------------------------------------

export const ROOM_ITEM_FACTOR = 1.5;
export const ROOM_BONUS = 2;
export const ROOM_FLOOR_BONUS = 2;
const MAX_ROOMS_COUNTED = 12;

export const COMFORT_TIERS: [number, string][] = [
  [0, 'Ruine'],
  [10, 'Notlager'],
  [25, 'Unterschlupf'],
  [45, 'Zuhause'],
  [75, 'Gemütliches Zuhause'],
  [110, 'Schmuckstück'],
  [160, 'Oase'],
];

/**
 * Gemütlichkeit eines Geländes: jedes Teil zählt (doppelte nur halb),
 * in einem Raum mit Dach zählt es anderthalbfach. Dazu ein Bonus pro Raum.
 */
export function plotComfort(plot: Plot): { value: number; rooms: number } {
  const { rooms, roomAt } = findRooms(plot);
  const seen = new Set<FurnitureId>();
  let c = 0;
  for (const it of plot.items) {
    const def = FURNITURE[it.kind];
    let v = seen.has(it.kind) ? def.comfort / 2 : def.comfort;
    seen.add(it.kind);
    const r = inPlot(it.x, it.y) ? roomAt[cellIndex(it.x, it.y)] : -1;
    if (r >= 0 && rooms[r].roofed) v *= ROOM_ITEM_FACTOR;
    c += v;
  }
  const roofed = rooms.filter((r) => r.roofed);
  for (const r of roofed.slice(0, MAX_ROOMS_COUNTED)) c += ROOM_BONUS + (r.floored ? ROOM_FLOOR_BONUS : 0);
  return { value: Math.round(c), rooms: roofed.length };
}

export function comfortTier(value: number): { name: string; next: number | null } {
  let name = COMFORT_TIERS[0][1];
  let next: number | null = null;
  for (const [min, n] of COMFORT_TIERS) {
    if (value >= min) name = n;
    else if (next === null) next = min;
  }
  return { name, next };
}

/** Freie Zelle für ein Teil, möglichst nah an (cx, cy). */
export function nearestFree(idx: PlotIndex, plot: Plot, kind: FurnitureId, rot: number, cx: number, cy: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = 0; y < PLOT; y++)
    for (let x = 0; x < PLOT; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d >= bestD) continue;
      if (itemProblem(idx, plot, kind, x, y, rot)) continue;
      bestD = d;
      best = { x, y };
    }
  return best;
}

export type { PlacedItem };
