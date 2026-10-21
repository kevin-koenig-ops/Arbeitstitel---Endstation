// Der Ort deines Zuhauses. Liegt NUR auf diesem Gerät: nicht im Spielstand,
// nicht auf einem Server. Bau-Aktionen schicken deshalb auch keine Position mit.

import { distanceM } from '../core/geo';
import type { LatLon } from '../core/types';
import { readJson, removeKey, writeJson } from './storage';

export interface BasePlace {
  pos: LatLon;
  setAt: number;
}

const KEY = 'endstation.basePlace';
/** So nah musst du an deinem Zuhause sein, um zu bauen (GPS drinnen ist ungenau). */
export const BASE_RADIUS_M = 150;

export function getBasePlace(): BasePlace | null {
  return readJson<BasePlace>(KEY);
}

export function setBasePlace(pos: LatLon): BasePlace {
  const p = { pos, setAt: Date.now() };
  writeJson(KEY, p);
  return p;
}

export function clearBasePlace() {
  removeKey(KEY);
}

/** Bist du gerade zu Hause? */
export function atBase(place: BasePlace | null, pos: LatLon | null, accuracyM = 0): boolean {
  if (!place || !pos) return false;
  return distanceM(place.pos, pos) <= BASE_RADIUS_M + Math.min(accuracyM, 50);
}
