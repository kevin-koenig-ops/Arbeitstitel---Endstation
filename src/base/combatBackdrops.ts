// Gemalte Hintergründe für den Kampf (Kevin 23.10.): ein Bild ganz hinten wie ein Bühnenbild,
// Boden, Figuren und ein paar Sachen davor bleiben 3D. Ohne Bild bleibt die 3D-Kulisse.
//
// Dateien: src/assets/kampf/kampf-<gegend>[-<jahreszeit>].webp, z. B. kampf-dorf.webp oder
// kampf-dorf-winter.webp. Aus Kevins Original (kunst/kampf/…) macht sie scripts/kampf-hintergrund.py.

import type { RegionId, Season } from '../core/types';

const FILES = import.meta.glob<string>('../assets/kampf/kampf-*.webp', { eager: true, import: 'default' });
const BY_NAME = new Map(Object.entries(FILES).map(([path, url]) => [path.replace(/^.*\/kampf-|\.webp$/g, ''), url]));

/** So heißen die Gegenden in den Dateinamen. */
export const BACKDROP_REGION: Record<RegionId, string> = {
  village: 'dorf',
  town: 'kleinstadt',
  city: 'stadt',
  wild: 'wald',
  mountain: 'berge',
  coast: 'kueste',
  desert: 'wueste',
  snow: 'schnee',
};

export const BACKDROP_SEASON: Record<Season, string> = { spring: 'fruehling', summer: 'sommer', autumn: 'herbst', winter: 'winter' };

/**
 * Das passende Bild: erst Gegend mit Jahreszeit, dann die Gegend allein, sonst das Dorf
 * (solange es erst wenige Bilder gibt). Ohne Bild: null.
 */
export function backdropUrl(region: RegionId, season: Season): string | null {
  const s = BACKDROP_SEASON[season];
  for (const name of [`${BACKDROP_REGION[region]}-${s}`, BACKDROP_REGION[region], `dorf-${s}`, 'dorf']) {
    const url = BY_NAME.get(name);
    if (url) return url;
  }
  return null;
}
