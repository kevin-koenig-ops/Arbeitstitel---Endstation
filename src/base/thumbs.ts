// Vorschaubilder für die Bauleiste: Möbel und Bauteile.

import * as THREE from 'three';
import { PIECES, type FloorId, type OpeningId, type PieceId, type RoofId, type WallId } from '../core/building';
import type { FurnitureId } from '../core/furniture';
import { renderThumbnails, type ThumbJob } from './BaseScene';
import { buildFurniture } from './models';
import { buildFloor, buildRoof, buildWall, WALL_H } from './structures';
import { graphicsStyle } from './gfxStyle';

const caches: Record<string, Record<string, string>> = {};

function patch(build: (v: number) => THREE.Group, size = 2): THREE.Group {
  const g = new THREE.Group();
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++) {
      const t = build((x + z * 2) % 3);
      t.position.set(x - size / 2 + 0.5, 0, z - size / 2 + 0.5);
      g.add(t);
    }
  return g;
}

function pieceModel(id: PieceId): THREE.Object3D {
  const def = PIECES[id];
  switch (def.group) {
    case 'wall':
    case 'fence': {
      const g = new THREE.Group();
      for (const x of [-0.5, 0.5]) {
        const w = buildWall(id as WallId, undefined, WALL_H, x > 0 ? 1 : 0);
        w.position.x = x;
        g.add(w);
      }
      return g;
    }
    case 'opening':
      return buildWall(def.fits === 'fence' ? 'chainFence' : 'plankWall', id as OpeningId, WALL_H, 0);
    case 'floor':
      return patch((v) => buildFloor(id as FloorId, v));
    case 'roof': {
      const g = patch((v) => buildRoof(id as RoofId, v));
      g.position.y = -WALL_H;
      return g;
    }
  }
}

/** Fehlende Vorschaubilder rendern und alle zurückgeben (Schlüssel "f:kind" bzw. "p:id"). */
export function thumbnails(furniture: FurnitureId[], pieces: PieceId[]): Record<string, string> {
  const cache = (caches[graphicsStyle()] ??= {});
  const jobs: ThumbJob[] = [];
  for (const k of furniture) if (!cache[`f:${k}`]) jobs.push({ key: `f:${k}`, build: () => buildFurniture(k).group });
  for (const p of pieces) if (!cache[`p:${p}`]) jobs.push({ key: `p:${p}`, build: () => pieceModel(p) });
  if (jobs.length) {
    try {
      Object.assign(cache, renderThumbnails(jobs));
    } catch {
      // Ohne Vorschaubilder geht es auch
    }
  }
  return cache;
}
