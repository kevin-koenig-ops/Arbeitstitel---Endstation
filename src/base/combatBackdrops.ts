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
  /** Kevins Bodenbilder von der Karte für die 3D-Straße und den Boden daneben (Kevin 24.10.). */
  floor?: Floor;
}

export interface Floor {
  /** Straßenstreifen quer zur Blickrichtung (Bild 1024 × 427, Ränder oben und unten). */
  road: string;
  /** Boden links und rechts der Straße, gekachelt. */
  grass: string;
}

const TEX = import.meta.glob<string>('../assets/textures/*.webp', { eager: true, import: 'default' });
const tex = (name: string): string | undefined => TEX[`../assets/textures/${name}.webp`];

/** Welche Straße zur Gegend passt: Hauptstraße in der Stadt, Feldweg in Wald und Bergen, sonst Nebenstraße. */
const FLOOR_ROAD: Record<RegionId, string> = {
  village: 'strasse-neben',
  town: 'strasse-haupt',
  city: 'strasse-haupt',
  wild: 'feldweg',
  mountain: 'feldweg',
  coast: 'strasse-neben',
  desert: 'strasse-neben',
  snow: 'strasse-neben',
};

/** Bodenbilder für den Kampf; im Schneeland immer Winter, in der Wüste Sand statt Wiese. */
export function floorFor(region: RegionId, season: Season): Floor | undefined {
  const s = region === 'snow' ? 'winter' : region === 'desert' ? 'sommer' : BACKDROP_SEASON[season];
  const road = tex(`${FLOOR_ROAD[region]}-${s}`) ?? tex(`strasse-neben-${s}`);
  const grass = (region === 'desert' ? tex('sand') : undefined) ?? tex(`wiese-${s}`);
  return road && grass ? { road, grass } : undefined;
}

/**
 * Das passende Bild: erst Gegend mit Jahreszeit, dann die Gegend allein, sonst das Dorf
 * (solange es erst wenige Bilder gibt). Ohne Bild: null.
 */
export function backdropFor(region: RegionId, season: Season): Backdrop | null {
  const s = BACKDROP_SEASON[season];
  for (const name of [`${BACKDROP_REGION[region]}-${s}`, BACKDROP_REGION[region], `dorf-${s}`, 'dorf']) {
    const url = BY_NAME.get(name);
    if (url) return { url, ground: GROUND[name] ?? GROUND[name.split('-')[0]] ?? DEFAULT_GROUND, floor: floorFor(region, season) };
  }
  return null;
}
