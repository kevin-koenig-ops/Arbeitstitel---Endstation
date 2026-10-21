import type { App, Screen } from '../app';
import { artStyle } from '../art';
import { h } from '../dom';

export function introScreen(app: App): Screen {
  const name = app.backend.current()?.character.name ?? '';
  const el = h(
    'div',
    { class: 'screen intro has-art', style: artStyle('intro') },
    h(
      'div',
      { class: 'page narrow' },
      h('div', { class: 'sign' }, h('span', null, 'Tag 1')),
      h(
        'div',
        { class: 'intro-text' },
        h('p', null, `Die Linie 0 fährt schon lange nicht mehr, ${name}. Der alte Bus hat dich bis zur Endstation gebracht. Weiter geht es nicht, also bleibst du.`),
        h('p', null, 'Draußen liegt alles, was die Welt zurückgelassen hat. Pack deinen Rucksack, bau dir an der Endstation ein Zuhause und finde heraus, was passiert ist.'),
        h('p', { class: 'intro-calm' }, 'Niemand drängt dich. Dein Zuhause wartet, egal wie lange du weg bist.'),
      ),
      h(
        'ul',
        { class: 'intro-how' },
        h('li', null, h('b', null, 'Fundstellen'), ' leuchten auf der Karte. Geh hin, dann kannst du sie durchsuchen.'),
        h('li', null, h('b', null, 'Eckige Schilder'), ' sind echte Orte wie Supermärkte, Apotheken oder Haltestellen. Dort gibt es mehr.'),
        h('li', null, h('b', null, 'Dein Rucksack'), ' trägt, was du findest. Zu Hause packst du aus, dann liegt alles sicher im Lager.'),
        h('li', null, h('b', null, 'Die Endstation'), ' ist dein Zuhause. Räum auf, bau und stell auf, was du findest.'),
      ),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn wide', type: 'button', onclick: () => app.go('game') }, 'Aussteigen')),
    ),
  );
  return { el };
}
