// Erkundung: Die Welt ist in Zellen von ~50 m eingeteilt (Kartenkacheln Zoom 19).
// Wo du warst, wird die Zelle dauerhaft aufgedeckt.
//
// Speicherung: Zellen sind zu Blöcken (Zoom 13, je 64×64 Zellen, ~3 km) gebündelt
// und als Bitfeld abgelegt. Selbst viel Herumlaufen braucht so nur wenige Kilobyte.
// Sektoren (Zoom 15, je 16×16 Zellen, ~750 m) sind die Einheit für Fortschritt.

import { decodeBits, encodeBits, popcount } from './bits';
import { distanceM, fromTile, toTile } from './geo';
import type { Inventory, LatLon } from './types';

export const CELL_Z = 19;
export const CHUNK_Z = 13;
export const SECTOR_Z = 15;
const CHUNK_SIDE = 2 ** (CELL_Z - CHUNK_Z); // 64
const SECTOR_SIDE = 2 ** (CELL_Z - SECTOR_Z); // 16
export const CHUNK_BYTES = (CHUNK_SIDE * CHUNK_SIDE) / 8; // 512

/** So weit um dich herum wird beim Gehen dauerhaft aufgedeckt. */
export const REVEAL_RADIUS_M = 55;

export type Explored = Record<string, string>;

export interface SectorLevel {
  pct: number;
  name: string;
  reward: Partial<Inventory>;
}

export const SECTOR_LEVELS: SectorLevel[] = [
  { pct: 0.25, name: 'erkundet', reward: { wood: 2, metal: 1, food: 1 } },
  { pct: 0.5, name: 'gesichert', reward: { wood: 2, metal: 2, screws: 1, water: 2, medicine: 1 } },
];

export const chunkKey = (cx: number, cy: number) => `${cx}:${cy}`;
export const sectorKey = (sx: number, sy: number) => `${sx}:${sy}`;

/** Zellen-Koordinate eines Punktes. */
export function cellOf(p: LatLon): { x: number; y: number } {
  const t = toTile(p, CELL_Z);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

export function sectorOf(p: LatLon): { sx: number; sy: number; key: string } {
  const c = cellOf(p);
  const sx = Math.floor(c.x / SECTOR_SIDE);
  const sy = Math.floor(c.y / SECTOR_SIDE);
  return { sx, sy, key: sectorKey(sx, sy) };
}

/** Lesezugriff mit Zwischenspeicher für entpackte Blöcke. */
export class ExploredView {
  private cache = new Map<string, Uint8Array>();
  constructor(private data: Explored) {}

  chunk(cx: number, cy: number): Uint8Array | null {
    const k = chunkKey(cx, cy);
    let b = this.cache.get(k);
    if (!b) {
      const raw = this.data[k];
      if (!raw) return null;
      b = decodeBits(raw, CHUNK_BYTES);
      this.cache.set(k, b);
    }
    return b;
  }

  has(x: number, y: number): boolean {
    const b = this.chunk(Math.floor(x / CHUNK_SIDE), Math.floor(y / CHUNK_SIDE));
    if (!b) return false;
    const i = (y - Math.floor(y / CHUNK_SIDE) * CHUNK_SIDE) * CHUNK_SIDE + (x - Math.floor(x / CHUNK_SIDE) * CHUNK_SIDE);
    return (b[i >> 3] & (1 << (i & 7))) !== 0;
  }

  /** Anteil aufgedeckter Zellen im Sektor (0..1). */
  sectorProgress(sx: number, sy: number): number {
    let n = 0;
    for (let y = sy * SECTOR_SIDE; y < (sy + 1) * SECTOR_SIDE; y++)
      for (let x = sx * SECTOR_SIDE; x < (sx + 1) * SECTOR_SIDE; x++) if (this.has(x, y)) n++;
    return n / (SECTOR_SIDE * SECTOR_SIDE);
  }
}

/**
 * Zellen im Umkreis aufdecken. Gibt die neuen Daten (nur geänderte Blöcke ersetzt),
 * die Zahl neuer Zellen und die betroffenen Sektoren zurück.
 */
export function revealAround(data: Explored, p: LatLon, radiusM = REVEAL_RADIUS_M) {
  const next: Explored = { ...data };
  const dirty = new Map<string, Uint8Array>();
  const sectors = new Set<string>();
  const t = toTile(p, CELL_Z);
  const cellM = (40075016 * Math.cos((p.lat * Math.PI) / 180)) / 2 ** CELL_Z;
  const span = Math.ceil(radiusM / cellM) + 1;
  let added = 0;
  for (let dy = -span; dy <= span; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      const x = Math.floor(t.x) + dx;
      const y = Math.floor(t.y) + dy;
      if (distanceM(p, fromTile(x + 0.5, y + 0.5, CELL_Z)) > radiusM) continue;
      const cx = Math.floor(x / CHUNK_SIDE);
      const cy = Math.floor(y / CHUNK_SIDE);
      const k = chunkKey(cx, cy);
      let b = dirty.get(k);
      if (!b) {
        b = next[k] ? decodeBits(next[k], CHUNK_BYTES) : new Uint8Array(CHUNK_BYTES);
        dirty.set(k, b);
      }
      const i = (y - cy * CHUNK_SIDE) * CHUNK_SIDE + (x - cx * CHUNK_SIDE);
      if (b[i >> 3] & (1 << (i & 7))) continue;
      b[i >> 3] |= 1 << (i & 7);
      added++;
      sectors.add(sectorKey(Math.floor(x / SECTOR_SIDE), Math.floor(y / SECTOR_SIDE)));
    }
  }
  for (const [k, b] of dirty) next[k] = encodeBits(b);
  return { explored: added ? next : data, added, sectors: [...sectors] };
}

/** Gesamtfläche, die aufgedeckt ist. */
export function exploredStats(data: Explored): { cells: number; km2: number } {
  let cells = 0;
  let m2 = 0;
  for (const [k, raw] of Object.entries(data)) {
    const [cx, cy] = k.split(':').map(Number);
    const n = popcount(decodeBits(raw, CHUNK_BYTES));
    const lat = fromTile((cx + 0.5) * CHUNK_SIDE, (cy + 0.5) * CHUNK_SIDE, CELL_Z).lat;
    const side = (40075016 * Math.cos((lat * Math.PI) / 180)) / 2 ** CELL_Z;
    cells += n;
    m2 += n * side * side;
  }
  return { cells, km2: m2 / 1e6 };
}

export { CHUNK_SIDE, SECTOR_SIDE };
