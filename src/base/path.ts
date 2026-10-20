// Wegfindung für die Figur in der Endstation (A* auf dem Raster).
// Wände sperren, Türen, Durchgänge und Tore lassen durch.

import { cellIndex, hEdge, inPlot, PLOT, vEdge, type PlotIndex } from '../core/building';
import type { Plot } from '../core/types';

export function walkable(idx: PlotIndex, x: number, y: number): boolean {
  if (!inPlot(x, y)) return false;
  const i = cellIndex(x, y);
  return idx.unlocked[i] === 1 && idx.obstacleAt[i] < 0 && !idx.objectAt[i];
}

function open(plot: Plot, edge: string): boolean {
  const w = plot.walls[edge];
  return !w || w.o === 'door' || w.o === 'arch' || w.o === 'gate';
}

/** Darf man direkt von (x,y) nach (x+dx, y+dy) gehen (nur waagerecht/senkrecht)? */
function step(idx: PlotIndex, plot: Plot, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (!walkable(idx, nx, ny)) return false;
  if (dx === 1) return open(plot, vEdge(x + 1, y));
  if (dx === -1) return open(plot, vEdge(x, y));
  if (dy === 1) return open(plot, hEdge(x, y + 1));
  return open(plot, hEdge(x, y));
}

/** Kürzester Weg von Feld zu Feld (inklusive Start und Ziel) oder null. */
export function findPath(idx: PlotIndex, plot: Plot, from: [number, number], to: [number, number]): [number, number][] | null {
  if (!walkable(idx, to[0], to[1])) return null;
  const n = PLOT * PLOT;
  const g = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = cellIndex(from[0], from[1]);
  const goal = cellIndex(to[0], to[1]);
  const hf = (i: number) => {
    const x = i % PLOT;
    const y = (i - x) / PLOT;
    const dx = Math.abs(x - to[0]);
    const dy = Math.abs(y - to[1]);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  g[start] = 0;
  const open = new Map<number, number>([[start, hf(start)]]);
  while (open.size) {
    let cur = -1;
    let best = Infinity;
    for (const [i, f] of open)
      if (f < best) {
        best = f;
        cur = i;
      }
    if (cur === goal) break;
    open.delete(cur);
    closed[cur] = 1;
    const x = cur % PLOT;
    const y = (cur - x) / PLOT;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        let ok: boolean;
        if (dx && dy) {
          // Schräg nur, wenn beide Umwege frei sind (nicht durch Wandecken schlüpfen)
          ok = step(idx, plot, x, y, dx, 0) && step(idx, plot, x + dx, y, 0, dy) && step(idx, plot, x, y, 0, dy) && step(idx, plot, x, y + dy, dx, 0);
        } else ok = step(idx, plot, x, y, dx, dy);
        if (!ok) continue;
        const ni = cellIndex(x + dx, y + dy);
        if (closed[ni]) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          prev[ni] = cur;
          open.set(ni, ng + hf(ni));
        }
      }
  }
  if (prev[goal] < 0 && goal !== start) return null;
  const path: [number, number][] = [];
  for (let i = goal; i >= 0; i = prev[i]) {
    const x = i % PLOT;
    path.push([x, (i - x) / PLOT]);
    if (i === start) break;
  }
  return path.reverse();
}

/** Nächstes begehbares Feld bei (x, y). */
export function nearestWalkable(idx: PlotIndex, x: number, y: number): [number, number] | null {
  for (let r = 0; r < PLOT; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(idx, x + dx, y + dy)) return [x + dx, y + dy];
      }
  return null;
}
