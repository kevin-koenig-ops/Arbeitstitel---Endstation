// Spielstände tragen eine Schema-Version. Ändert sich das Format, kommt hier eine
// Migration dazu, damit alte Spielstände weiter funktionieren (auch beim späteren
// Umzug vom Gerät in ein Konto).

import { SCHEMA_VERSION } from './rules';
import type { PlayerState } from './types';

export function migrate(raw: unknown): PlayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<PlayerState>;
  if (typeof s.schema !== 'number' || !s.playerId || !s.character) return null;
  // if (s.schema === 1) { ...auf Version 2 heben...; s.schema = 2; }
  if (s.schema !== SCHEMA_VERSION) return null;
  return s as PlayerState;
}
