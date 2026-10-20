// Texte für abgelehnte Aktionen, an einer Stelle gesammelt.

import type { RejectReason } from '../core/types';

export const REJECT_TEXT: Record<RejectReason, string> = {
  too_far: 'Zu weit weg. Geh näher ran.',
  cooldown: 'Hier ist gerade nichts mehr zu holen.',
  invalid_spot: 'Diese Fundstelle gibt es nicht mehr.',
  cost: 'Dafür fehlen dir Vorräte.',
  locked: 'Das ist noch nicht freigeschaltet.',
  already_built: 'Schon gebaut.',
  nothing: 'Hier gibt es gerade nichts.',
  guarded: 'Hier lauert etwas. Erst kämpfen, dann plündern.',
  not_guarded: 'Hier ist niemand mehr. Du kannst einfach durchsuchen.',
  exhausted: 'Du bist zu angeschlagen. Ruh dich aus oder nimm Medizin.',
  no_combat: 'Der Kampf ist schon vorbei.',
  no_medicine: 'Du hast keine Medizin.',
  full_health: 'Du bist schon fit.',
};
