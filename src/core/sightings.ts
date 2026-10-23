// Sichtungen: Alle 10 Minuten taucht hier und da etwas auf und bleibt eine Weile
// (Notizbuch eines Überlebenden, Kiste, Notlazarett-Kiste, Konvoi-Wrack). Darin liegt eine
// Sammelkarte oder eine Waffe, mit Seltenheit. Alle Spieler in der Gegend sehen dieselben
// Sichtungen (fester Weltstartwert, Zeitfenster und Kartenfeld), Freunde können sich Bescheid sagen.
//
// Wo genau: Jede Sichtung bringt mehrere mögliche Stellen mit. Die Karte nimmt die erste, die an
// einem Weg liegt und an keinem heiklen Ort (Friedhof, Schule, Kirche, Privatgrund …).
// Rein und vorhersagbar wie der Rest von core/.

import { CARDS, type CardId, type CardRarity } from './content';
import { distanceM } from './geo';
import { rngFrom } from './rng';
import type { LatLon, WeaponId } from './types';

export type SightingKind = 'notebook' | 'cache' | 'medkit' | 'convoy';

export interface Sighting {
  id: string;
  kind: SightingKind;
  /** Was drin ist: eine Karte oder eine Waffe. */
  card?: CardId;
  weapon?: WeaponId;
  rarity: CardRarity;
  /** Ganz selten eine leuchtende Fassung (gleiche Wirkung, nur schöner). */
  shiny: boolean;
  from: number;
  until: number;
  /** Mögliche Stellen (die erste passende gilt). */
  candidates: LatLon[];
}

export const SIGHT = {
  /** Alle 10 Minuten ein neuer Schwung (Kevin, 22.10.). */
  slotMs: 10 * 60_000,
  /** Größe eines Kartenfelds (Grad): etwa 500 × 500 m. */
  cellLat: 0.0045,
  cellLon: 0.0072,
  /** Chance auf eine Sichtung je Feld und Zeitfenster (Kevin 23.10.: weniger; im Umkreis von 500 m etwa alle 20 bis 25 Minuten eine). */
  chance: 0.15,
  /** So lange bleibt eine Sichtung (Minuten). */
  lifeMin: 18,
  lifeMax: 30,
  /** So nah muss man ran (Meter, dazu die GPS-Genauigkeit bis 25 m). */
  rangeM: 35,
  /** Funk-Radar: so weit hört man Sichtungen (Meter). */
  radarM: 500,
  candidates: 6,
  /** Glück mit Netz: spätestens nach so vielen Sichtungen etwas Seltenes bzw. Legendäres. */
  pityRare: 20,
  /** Kevin 23.10.: Legenden etwa einmal im Monat (bei einer Stunde am Tag). */
  pityLegendary: 130,
  shinyChance: 1 / 64,
};

const KIND_WEIGHTS: [SightingKind, number][] = [
  ['notebook', 40],
  ['cache', 30],
  ['medkit', 20],
  ['convoy', 10],
];

export const SIGHTING_NAMES: Record<SightingKind, string> = {
  notebook: 'Notizbuch eines Überlebenden',
  cache: 'Liegengebliebene Kiste',
  medkit: 'Notlazarett-Kiste',
  convoy: 'Konvoi-Wrack',
};

type Reward = { card: CardId } | { weapon: WeaponId };
/** Was in welcher Sichtung stecken kann, nach Seltenheit. */
const POOLS: Record<SightingKind, Partial<Record<CardRarity, Reward[]>>> = {
  notebook: {
    common: [{ card: 'counter' }, { card: 'steady' }, { card: 'breath' }, { card: 'spark' }, { card: 'pitcher' }, { card: 'followup' }, { card: 'headbutt' }, { card: 'cover' }, { card: 'roll' }, { card: 'pockets' }, { card: 'pickstones' }, { card: 'breathe' }, { card: 'grit' }, { card: 'fullforce' }, { card: 'charger' }],
    rare: [{ card: 'sweep' }, { card: 'sneak' }, { card: 'scavenger' }, { card: 'embers' }, { card: 'trapper' }, { card: 'distract' }, { card: 'rage' }, { card: 'retaliate' }, { card: 'firstaid' }, { card: 'tinkerbox' }, { card: 'toolroll' }, { card: 'trueaim' }, { card: 'unleash' }, { card: 'innercalm' }],
    epic: [{ card: 'radio' }, { card: 'wildfire' }, { card: 'laststrike' }, { card: 'frenzy' }],
    // Die Legenden: je Spielstil eine (dazu der Rudelführer)
    legendary: [{ card: 'packleader' }, { card: 'laststand' }, { card: 'flamewall' }, { card: 'waylay' }, { card: 'onslaught' }, { card: 'mower' }, { card: 'secondlife' }, { card: 'stonehail' }, { card: 'bulwark' }],
  },
  cache: {
    common: [{ card: 'molotov' }, { card: 'smoke' }, { card: 'caltrops' }, { card: 'firecracker' }, { card: 'lure' }, { card: 'tinder' }, { card: 'tripwire' }, { card: 'alarm' }, { card: 'lath' }, { card: 'marblesack' }, { card: 'motionlamp' }, { card: 'boombox' }, { weapon: 'shovel' }, { weapon: 'pitchfork' }, { weapon: 'lid' }, { weapon: 'pipewrench' }],
    rare: [{ weapon: 'axe' }, { weapon: 'golfclub' }, { weapon: 'slingshot' }, { weapon: 'machete' }, { card: 'oilcan' }, { card: 'tape' }, { card: 'fencer' }, { weapon: 'airrifle' }, { weapon: 'pistol' }],
    epic: [{ weapon: 'nailgun' }, { weapon: 'bow' }, { weapon: 'extinguisher' }, { card: 'fireworks' }, { weapon: 'revolver' }, { weapon: 'shotgun' }],
    legendary: [{ weapon: 'sledgehammer' }, { weapon: 'huntingrifle' }],
  },
  medkit: {
    common: [{ card: 'pepper' }],
    rare: [{ card: 'dressing' }, { card: 'adrenaline' }, { card: 'painkiller' }, { card: 'firstaid' }],
    epic: [{ card: 'secondwind' }],
  },
  convoy: {
    common: [{ card: 'molotov' }],
    rare: [{ card: 'flare' }, { weapon: 'pistol' }],
    epic: [{ card: 'flashbang' }, { card: 'grenade' }, { weapon: 'shotgun' }],
    legendary: [{ weapon: 'sledgehammer' }, { weapon: 'huntingrifle' }],
  },
};

const ORDER: CardRarity[] = ['common', 'rare', 'epic', 'legendary'];

/**
 * Seltenheit würfeln: 75 % gewöhnlich, 22 % selten, 2,5 % episch, 0,5 % legendär (Kevin 23.10.:
 * Legenden etwa einmal im Monat, Episches alle ein bis zwei Wochen, bei einer Stunde am Tag).
 */
export const RARITY_ODDS = { legendary: 0.005, epic: 0.03, rare: 0.25 };
function rollRarity(r: () => number): CardRarity {
  const x = r();
  return x < RARITY_ODDS.legendary ? 'legendary' : x < RARITY_ODDS.epic ? 'epic' : x < RARITY_ODDS.rare ? 'rare' : 'common';
}

/** Aus dem Topf der Sichtung: die gewünschte Seltenheit, sonst die nächst niedrigere, sonst höhere. */
export function rewardFor(kind: SightingKind, want: CardRarity, r: () => number): { reward: Reward; rarity: CardRarity } {
  const pool = POOLS[kind];
  const i0 = ORDER.indexOf(want);
  const tryOrder = [...ORDER.slice(0, i0 + 1).reverse(), ...ORDER.slice(i0 + 1)];
  for (const rar of tryOrder) {
    const list = pool[rar];
    if (list?.length) return { reward: list[Math.floor(r() * list.length)], rarity: rar };
  }
  return { reward: { card: 'molotov' }, rarity: 'common' };
}

/** Glück mit Netz: irgendeine Belohnung genau dieser Seltenheit (aus allen Töpfen). */
export function rewardOfRarity(want: CardRarity, r: () => number): { reward: Reward; rarity: CardRarity } {
  const all: Reward[] = [];
  for (const pool of Object.values(POOLS)) for (const x of pool[want] ?? []) if (!all.some((y) => JSON.stringify(y) === JSON.stringify(x))) all.push(x);
  if (!all.length) return rewardFor('notebook', want, r);
  return { reward: all[Math.floor(r() * all.length)], rarity: want };
}

function pickKind(r: () => number): SightingKind {
  let x = r() * KIND_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of KIND_WEIGHTS) if ((x -= w) < 0) return k;
  return 'notebook';
}

/** Die Sichtung eines Felds in einem Zeitfenster (oder null, wenn dort nichts ist). */
function sightingAt(seed: string, cx: number, cy: number, slot: number): Sighting | null {
  const r = rngFrom(seed, 'sichtung', cx, cy, slot);
  if (r() >= SIGHT.chance) return null;
  const kind = pickKind(r);
  const { reward, rarity } = rewardFor(kind, rollRarity(r), r);
  const from = slot * SIGHT.slotMs + Math.floor(r() * 4 * 60_000);
  const until = from + Math.round((SIGHT.lifeMin + r() * (SIGHT.lifeMax - SIGHT.lifeMin)) * 60_000);
  const shiny = r() < SIGHT.shinyChance;
  const candidates: LatLon[] = [];
  for (let i = 0; i < SIGHT.candidates; i++) {
    candidates.push({ lat: (cy + 0.1 + 0.8 * r()) * SIGHT.cellLat, lon: (cx + 0.1 + 0.8 * r()) * SIGHT.cellLon });
  }
  return { id: `v:${cx}:${cy}:${slot}`, kind, ...reward, rarity, shiny, from, until, candidates };
}

/** Alle Sichtungen, die jetzt im Umkreis sind (nach Entfernung der ersten Stelle). */
export function sightingsNear(seed: string, pos: LatLon, now: number, radiusM: number = SIGHT.radarM): Sighting[] {
  const slot = Math.floor(now / SIGHT.slotMs);
  const back = Math.ceil((SIGHT.lifeMax * 60_000) / SIGHT.slotMs);
  const cy0 = Math.floor(pos.lat / SIGHT.cellLat);
  const cx0 = Math.floor(pos.lon / SIGHT.cellLon);
  const ny = Math.ceil(radiusM / (SIGHT.cellLat * 111_320)) + 1;
  const nx = Math.ceil(radiusM / (SIGHT.cellLon * 111_320 * Math.cos((pos.lat * Math.PI) / 180))) + 1;
  const out: { s: Sighting; d: number }[] = [];
  for (let cy = cy0 - ny; cy <= cy0 + ny; cy++)
    for (let cx = cx0 - nx; cx <= cx0 + nx; cx++)
      for (let k = slot - back; k <= slot; k++) {
        const s = sightingAt(seed, cx, cy, k);
        if (!s || now < s.from || now >= s.until) continue;
        const d = distanceM(pos, s.candidates[0]);
        if (d <= radiusM + 400) out.push({ s, d });
      }
  return out.sort((a, b) => a.d - b.d).map((x) => x.s);
}

/** Eine Sichtung aus ihrer id nachrechnen (für die Prüfung beim Aufheben). */
export function sightingById(seed: string, id: string): Sighting | null {
  const m = /^v:(-?\d+):(-?\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return sightingAt(seed, Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Liegt der Spieler nah genug an dieser Stelle der Sichtung? */
export function inSightingRange(s: Sighting, candidate: number, at: LatLon, accuracyM: number): boolean {
  const p = s.candidates[candidate];
  if (!p) return false;
  return distanceM(p, at) <= SIGHT.rangeM + Math.min(25, Math.max(0, accuracyM));
}

/** Kurzer Name des Inhalts (für Anzeige und Tests). */
export function rewardName(s: Pick<Sighting, 'card' | 'weapon'>, weaponName: (w: WeaponId) => string): string {
  return s.card ? CARDS[s.card].name : s.weapon ? weaponName(s.weapon) : '';
}
