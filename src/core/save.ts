// Spielstände tragen eine Schema-Version. Ändert sich das Format, kommt hier eine
// Migration dazu, damit alte Spielstände weiter funktionieren (auch beim späteren
// Umzug vom Gerät in ein Konto).

import { MAX_HEALTH, START_WEAPONS } from './content';
import { RUBBLE } from './furniture';
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
    s.base = { items: [], rubble: RUBBLE.map((r) => r.id), nextUid: 1 };
    s.blueprints = {};
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
