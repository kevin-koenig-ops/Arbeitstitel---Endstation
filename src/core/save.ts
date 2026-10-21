// Spielstände tragen eine Schema-Version. Ändert sich das Format, kommt hier eine
// Migration dazu, damit alte Spielstände weiter funktionieren (auch beim späteren
// Umzug vom Gerät in ein Konto).

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
};

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
