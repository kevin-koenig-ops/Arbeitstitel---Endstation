// Texte für abgelehnte Aktionen, an einer Stelle gesammelt.

import type { RejectReason, SpotKind } from '../core/types';

export const REJECT_TEXT: Record<RejectReason, string> = {
  too_far: 'Zu weit weg. Geh näher ran.',
  cooldown: 'Hier ist gerade nichts mehr zu holen.',
  invalid_spot: 'Hier liegt nichts mehr. Die Fundstelle ist weitergewandert.',
  cost: 'Dafür fehlen dir Rohstoffe.',
  locked: 'Das ist noch nicht freigeschaltet.',
  already_built: 'Schon gebaut.',
  nothing: 'Hier gibt es gerade nichts.',
  guarded: 'Hier lauert etwas. Erst kämpfen, dann plündern.',
  not_guarded: 'Hier ist niemand mehr. Du kannst einfach durchsuchen.',
  exhausted: 'Du bist zu angeschlagen. Ruh dich aus oder nimm Medizin.',
  no_combat: 'Der Kampf ist schon vorbei.',
  no_medicine: 'Du hast keine Medizin.',
  full_health: 'Du bist schon fit.',
  blocked: 'Da ist kein Platz.',
  no_blueprint: 'Dafür fehlt dir noch der Bauplan.',
  not_found: 'Das gibt es hier nicht (mehr).',
  no_site: 'Such dir zuerst einen Schauplatz für dein Zuhause aus.',
  no_wall: 'Das geht nur an einer passenden Wand.',
  not_adjacent: 'Nur Abschnitte direkt neben deinem Gelände.',
  no_workbench: 'Dafür brauchst du zu Hause einen Werktisch.',
  queue_full: 'Der Werktisch ist voll. Hol erst etwas ab oder rüste ihn auf.',
  no_junk: 'Davon ist nichts im Lager.',
  only_one: 'Davon gibt es nur einen. Aufrüsten statt neu bauen.',
  max_level: 'Schon voll ausgebaut.',
  not_done: 'Das Ziel ist noch nicht erreicht.',
  no_radio: 'Dafür brauchst du zu Hause ein Funkgerät.',
  radio_quiet: 'Auf Kanal 4 rauscht es nur. Später nochmal reinhören.',
  no_stove: 'Dafür brauchst du zu Hause einen Holzofen.',
  no_gear: 'Das hast du noch nicht gefunden.',
};

/** Fundstellen in der Mehrzahl, für Hinweise wie "Zu finden in: Autos, Packstationen". */
export const SPOT_PLURAL: Partial<Record<SpotKind, string>> = {
  car: 'Autos',
  backpack: 'Rucksäcken',
  shed: 'Gartenlauben',
  container: 'Containern',
  hide: 'Hochsitzen',
  barrel: 'Fässern',
  parcel: 'Packstationen',
  market: 'Supermärkten',
  pharmacy: 'Apotheken',
  hardware: 'Baumärkten',
  fuel: 'Tankstellen',
  well: 'Brunnen',
  stop: 'Bushaltestellen',
};
