// Gelände und Gegend: Wie gut man irgendwo zu sehen ist, wie weit Trupps sehen und hören,
// und welche Art Gegend rund um den Spieler liegt.
//
// Rein rechnerisch: Was an einer Stelle liegt (Wald, Acker, Häuser), liefert die Karte.
// Später kann ein Server dasselbe mit seinen eigenen Kartendaten prüfen.

import { CLIMATE, PATROL, REGIONS, TERRAIN } from './content';
import type { DayPhase } from './sun';
import type { FoeKind, RegionId, Season, Sky, TerrainKind } from './types';

/** Monat (1–12) -> Jahreszeit (Nordhalbkugel, meteorologisch). */
export function seasonFromMonth(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * Wie gut man hier zu sehen ist (1 = ganz offen, kleiner = Deckung).
 * Im Sommer versteckt das Korn, im Winter sind die Wälder kahl und man hebt sich vom Schnee ab.
 */
export function visibility(t: TerrainKind, season: Season): number {
  let v = TERRAIN[t].vis;
  if (t === 'field') v = season === 'summer' ? 0.38 : season === 'spring' ? 0.7 : 0.95;
  if (t === 'forest' && season === 'winter') v = 0.5;
  if (season === 'winter' && (t === 'open' || t === 'field' || t === 'road')) v *= 1.2;
  return v;
}

/** Bietet dieses Gelände Deckung zum Verstecken (still stehen)? */
export function canHide(t: TerrainKind, season: Season): boolean {
  return visibility(t, season) <= 0.55;
}

/** Bedingungen draußen, die für alle gleich sind. */
export interface Conditions {
  phase: DayPhase;
  sky: Sky;
  /** Starker Wind (übertönt Schritte). */
  windy?: boolean;
  region: RegionId;
  season: Season;
  /** Mitten in einem Staubsturm. */
  dust?: boolean;
}

/** Wie du gerade unterwegs bist. */
export interface Exposure {
  terrain: TerrainKind;
  /** Still in Deckung: versteckt. */
  hidden: boolean;
  /** Leise gehen (nur beim Laufen per Tippen). */
  sneaking: boolean;
  /** Lärm der Ausrüstung (Summe, z. B. −0,2 für Turnschuhe). */
  gearNoise: number;
}

/** Wie weit ein Trupp dich sieht (Meter, im Sichtkegel). */
export function sightRangeM(group: FoeKind[], c: Conditions, e: Exposure): number {
  let r = PATROL.sightM * REGIONS[c.region].sight;
  const watcher = group.includes('watcher');
  // Der Bleiche Wächter sieht im Dunkeln, alle anderen schlechter
  if (c.phase === 'night') r *= watcher ? 1.3 : 0.6;
  else if (c.phase === 'dusk') r *= watcher ? 1.1 : 0.8;
  if (c.sky === 'fog') r *= 0.55;
  else if (c.sky === 'rain' || c.sky === 'storm') r *= 0.8;
  else if (c.sky === 'snow') r *= 0.85;
  if (c.dust) r *= 0.45;
  r *= visibility(e.terrain, c.season);
  if (e.hidden) r *= PATROL.hiddenFactor;
  if (e.sneaking) r *= PATROL.sneakFactor;
  return Math.max(4, r);
}

/** Wie weit ein Trupp dich hört (Meter, rundherum). */
export function hearRangeM(group: FoeKind[], c: Conditions, e: Exposure): number {
  if (e.hidden) return 3;
  let r = group.includes('screamer') ? PATROL.screamerHearM : PATROL.hearM;
  r *= 1 + Math.max(-0.5, Math.min(0.6, e.gearNoise));
  // Im Herbst raschelt das Laub im Wald
  if (c.season === 'autumn' && e.terrain === 'forest') r *= 1.4;
  // Donner und Sturm übertönen Schritte
  if (c.sky === 'storm') r *= 0.5;
  else if (c.windy) r *= 0.6;
  else if (c.sky === 'rain') r *= 0.75;
  if (e.sneaking) r *= 0.5;
  return Math.max(2, r);
}

// --- Gegend ---------------------------------------------------------------------------

/** Was rund um den Spieler liegt (Anteile der Fläche, 0–1), aus den Kartendaten. */
export interface RegionStats {
  /** Von Häusern bedeckt. */
  buildings: number;
  /** Anzahl Häuser im Umkreis. */
  houses: number;
  forest: number;
  farm: number;
  water: number;
  sand: number;
  rock: number;
  ice: number;
  /** Höhenunterschied im Umkreis (Meter), null wenn unbekannt. */
  relief: number | null;
}

/** Welche Art Gegend ist das? Die Reihenfolge der Fragen ist Absicht (Besonderes zuerst). */
export function classifyRegion(s: RegionStats): RegionId {
  if (s.ice > 0.2) return 'snow';
  if (s.sand > 0.25 && s.buildings < 0.05) return 'desert';
  if ((s.relief !== null && s.relief > 140) || s.rock > 0.15) return 'mountain';
  if (s.buildings > 0.16 && s.houses > 350) return 'city';
  if (s.water > 0.2) return 'coast';
  if (s.buildings > 0.05 && s.houses > 120) return 'town';
  if (s.forest > 0.5) return 'wild';
  return 'village';
}

/** Ist es gerade so kalt, dass Wärme zählt? */
export function isCold(o: { tempC: number | null; region: RegionId; season: Season; phase: DayPhase }): boolean {
  if (REGIONS[o.region].cold) return true;
  if (o.tempC !== null) return o.tempC <= CLIMATE.coldC;
  return o.season === 'winter' && o.phase === 'night';
}

/** Ist es gerade so heiß, dass man Wasser braucht? */
export function isHot(o: { tempC: number | null; region: RegionId; phase: DayPhase }): boolean {
  if (o.tempC !== null && o.tempC >= CLIMATE.hotC) return true;
  return !!REGIONS[o.region].heat && o.phase === 'day';
}
