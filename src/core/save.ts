// Spielstände tragen eine Schema-Version. Ändert sich das Format, kommt hier eine
// Migration dazu, damit alte Spielstände weiter funktionieren (auch beim späteren
// Umzug vom Gerät in ein Konto).

import { cellIndex, PLOT, SECTION, sectionObstacles, START_SECTIONS, type SiteId } from './building';
import { MAX_HEALTH, RESOURCE_ORDER, START_WEAPONS } from './content';
import { FURNITURE, type FurnitureId } from './furniture';
import { SCHEMA_VERSION } from './rules';
import type { PlayerState } from './types';

type Raw = Record<string, unknown> & { schema?: number };

const MIGRATIONS: Record<number, (s: Raw) => void> = {
  // Version 1 -> 2: Kampf kam dazu (Gesundheit, Waffen, laufender Kampf, Statistik)
  1: (s) => {
    s.health = MAX_HEALTH;
    s.healthAt = s.lastActiveAt;
    s.weapons = START_WEAPONS.map((w) => ({ ...w }));
    s.combat = null;
    s.stats = { kills: 0, ...(s.stats as object) };
  },
  // Version 2 -> 3: Erkundung (Kartennebel) kam dazu
  2: (s) => {
    s.explored = {};
    s.sectors = {};
  },
  // Version 3 -> 4: Basisbau (Endstation) und Baupläne
  3: (s) => {
    s.base = { items: [], rubble: [], nextUid: 1 };
    s.blueprints = {};
  },
  // Version 4 -> 5: großes Gelände, freies Bauen, Schauplätze.
  // Die alte Wartehalle gibt es nicht mehr: aufgestellte Möbel gehen als Material zurück.
  4: (s) => {
    const old = s.base as { items?: { kind: string }[] } | undefined;
    const inv = s.inventory as Record<string, number>;
    for (const it of old?.items ?? []) {
      const def = FURNITURE[it.kind as FurnitureId];
      if (!def) continue;
      for (const [k, v] of Object.entries(def.cost)) inv[k] = (inv[k] ?? 0) + (v ?? 0);
    }
    s.base = { active: null, plots: {}, found: {} };
  },
  // Version 5 -> 6: „Material“ wird zu echten Rohstoffen (Holz, Metall, …),
  // dazu Fundstücke und der Werktisch. Altes Material wird halb Holz, halb Metall.
  5: (s) => {
    const inv = s.inventory as Record<string, number>;
    const m = Math.max(0, inv.material ?? 0);
    delete inv.material;
    for (const r of RESOURCE_ORDER) inv[r] = Math.max(0, inv[r] ?? 0);
    inv.wood += Math.ceil(m / 2);
    inv.metal += Math.floor(m / 2);
    s.junk = {};
    s.workshop = { level: 1, jobs: [] };
  },
  // Version 6 -> 7: Das Gelände ist doppelt so groß (72 × 72 m statt 36 × 36 m, Abschnitte 12 m).
  // Alles Gebaute rückt in die Mitte, frei Gewesenes bleibt frei und aufgeräumt.
  6: (s) => {
    const base = s.base as { plots: Record<string, OldPlot> };
    for (const [site, plot] of Object.entries(base.plots ?? {})) base.plots[site] = growPlot(String(s.playerId), site as SiteId, plot);
  },
};

interface OldPlot {
  sections: string[];
  cleared: string[];
  walls: Record<string, unknown>;
  floors: Record<string, unknown>;
  roofs: Record<string, unknown>;
  items: { x: number; y: number }[];
  nextUid: number;
}

/** Altes 36-m-Gelände in die Mitte des neuen 72-m-Geländes setzen. */
function growPlot(seed: string, site: SiteId, old: OldPlot): OldPlot {
  const OLD_SECTION = 6;
  const shift = (PLOT - 36) / 2;
  const moveKey = (k: string) => {
    const m = /^([hv]?)(\d+),(\d+)$/.exec(k);
    if (!m) return k;
    return `${m[1]}${Number(m[2]) + shift},${Number(m[3]) + shift}`;
  };
  const moveMap = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec ?? {}).map(([k, v]) => [moveKey(k), v]));
  // Welche Felder waren schon frei?
  const wasFree = new Uint8Array(PLOT * PLOT);
  const sections = new Set(START_SECTIONS);
  for (const key of old.sections ?? []) {
    const [sx, sy] = key.split(',').map(Number);
    for (let y = sy * OLD_SECTION; y < (sy + 1) * OLD_SECTION; y++) for (let x = sx * OLD_SECTION; x < (sx + 1) * OLD_SECTION; x++) wasFree[cellIndex(x + shift, y + shift)] = 1;
    sections.add(`${Math.floor((sx * OLD_SECTION + shift) / SECTION)},${Math.floor((sy * OLD_SECTION + shift) / SECTION)}`);
  }
  // Hindernisse dort, wo schon frei war, gelten als weggeräumt (sonst lägen sie unter Gebautem)
  const cleared: string[] = [];
  for (const key of sections) {
    const [sx, sy] = key.split(',').map(Number);
    for (const o of sectionObstacles(seed, site, sx, sy)) {
      let hit = false;
      for (let y = o.y; y < o.y + o.d && !hit; y++) for (let x = o.x; x < o.x + o.w; x++) if (wasFree[cellIndex(x, y)]) hit = true;
      if (hit) cleared.push(o.id);
    }
  }
  return {
    sections: [...sections],
    cleared,
    walls: moveMap(old.walls),
    floors: moveMap(old.floors),
    roofs: moveMap(old.roofs),
    items: (old.items ?? []).map((it) => ({ ...it, x: it.x + shift, y: it.y + shift })),
    nextUid: old.nextUid ?? 1,
  };
}

export function migrate(raw: unknown): PlayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Raw;
  if (typeof s.schema !== 'number' || !s.playerId || !s.character) return null;
  while (s.schema < SCHEMA_VERSION) {
    const step = MIGRATIONS[s.schema];
    if (!step) return null;
    step(s);
    s.schema += 1;
  }
  if (s.schema !== SCHEMA_VERSION) return null;
  return s as unknown as PlayerState;
}
