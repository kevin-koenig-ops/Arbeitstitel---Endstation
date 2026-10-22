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
  zone_closed: 'Sperrgebiet: Hier brennen Landstreifer eine Fiebergrube aus. Komm wieder, wenn der Rauch abgezogen ist.',
  need_filter: 'Staubsturm: Im Staub schlafen Keime. Ohne Staubmaske oder Gasmaske wühlst du hier nicht.',
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

/** Kurze Tipps auf den Ladebildschirmen. */
export const LOADING_TIPS: string[] = [
  'Wenn du mal Pause machst, verpasst du nichts. Dein Zuhause wartet auf dich.',
  'Die kleinen Fundstellen wandern etwa einmal am Tag weiter.',
  'Im Kampf: Tippe einen Gegner einmal an, dann treffen ihn alle deine Karten.',
  'Wandler sind bei Nebel, Regen und nachts zäher. In praller Sonne werden sie träge.',
  'Was im Rucksack ist, ist erst sicher, wenn du es zu Hause auspackst.',
  'Pilzstellen gibt es nur im Wald, im Herbst am meisten. Im echten Leben nie nach dem Spiel sammeln!',
  'Helm, Weste und Handschuhe geben dir zu Beginn jedes Kampfs Abwehr.',
  'Besondere Orte gibt es einmal pro Gegend. Ein Hubschrauber, ein Konvoi, ein Bunker …',
  'Zettel, Kreidezeichen und Funksprüche führen zu Verstecken.',
  'Trupps sehen nur, was vor ihnen liegt. Von hinten angeschlichen, setzen sie die erste Runde aus.',
  'Still stehen im Wald, in einer Hecke oder im Sommer im Korn: Dann bist du versteckt.',
  'Heuler sind fast blind, hören aber jeden Schritt. Turnschuhe sind leiser als Stiefel.',
  'Im Staubsturm nur mit Atemschutz suchen. Dafür sehen dich die Trupps kaum.',
  'Von einem Hügel aus siehst du Trupps schon von Weitem.',
  'Im Schnee hinterlässt du Spuren. Trupps, die sie finden, folgen dir.',
];
