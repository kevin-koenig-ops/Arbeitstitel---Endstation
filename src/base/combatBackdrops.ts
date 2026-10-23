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
 * Wo im Bild der Boden liegt (Anteil der Bildhöhe von unten): Diese Linie steht im Spiel auf dem
 * 3D-Boden, alles darunter verschwindet dahinter. So passt auch ein Bild, dessen Häuser höher stehen.
 */
const GROUND: Record<string, number> = {
  // Kevins Dorfrand (23.10.): vorne Wiese, die Zäune stehen gut ein Fünftel über dem unteren Rand
  dorf: 0.21,
};
const DEFAULT_GROUND = 0.03;

export interface Backdrop {
  url: string;
  /** Anteil der Bildhöhe (von unten), der auf dem 3D-Boden steht. */
  ground: number;
}

/**
 * Das passende Bild: erst Gegend mit Jahreszeit, dann die Gegend allein, sonst das Dorf
 * (solange es erst wenige Bilder gibt). Ohne Bild: null.
 */
export function backdropFor(region: RegionId, season: Season): Backdrop | null {
  const s = BACKDROP_SEASON[season];
  for (const name of [`${BACKDROP_REGION[region]}-${s}`, BACKDROP_REGION[region], `dorf-${s}`, 'dorf']) {
    const url = BY_NAME.get(name);
    if (url) return { url, ground: GROUND[name] ?? GROUND[name.split('-')[0]] ?? DEFAULT_GROUND };
  }
  return null;
}
