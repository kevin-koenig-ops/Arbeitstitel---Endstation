import type { App, Screen } from '../app';
import { h } from '../dom';

export function introScreen(app: App): Screen {
  const name = app.backend.current()?.character.name ?? '';
  const el = h(
    'div',
    { class: 'screen intro' },
    h(
      'div',
      { class: 'page narrow' },
      h('div', { class: 'sign' }, h('span', null, 'Tag 1')),
      h(
        'div',
        { class: 'intro-text' },
        h('p', null, `Die Linie 0 fährt schon lange nicht mehr, ${name}. Der alte Bus stand wochenlang am Wendehammer. Jetzt springt er wieder an, wenn auch nur knapp.`),
        h('p', null, 'Draußen liegt alles, was die Welt zurückgelassen hat. Sammle Vorräte, bau den Bus aus und finde heraus, was passiert ist.'),
        h('p', { class: 'intro-calm' }, 'Niemand drängt dich. Der Bus wartet, egal wie lange du weg bist.'),
      ),
      h(
        'ul',
        { class: 'intro-how' },
        h('li', null, h('b', null, 'Fundstellen'), ' leuchten auf der Karte. Geh hin, dann kannst du sie durchsuchen.'),
        h('li', null, h('b', null, 'Eckige Schilder'), ' sind echte Orte wie Supermärkte, Apotheken oder Haltestellen. Dort gibt es mehr.'),
        h('li', null, h('b', null, 'Der Bus'), ' ist dein Zuhause. Bau ihn mit Material aus.'),
      ),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn wide', type: 'button', onclick: () => app.go('game') }, 'Aussteigen')),
    ),
  );
  return { el };
}
