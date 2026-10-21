// „Bitte kurz lesen“: kommt bei jedem neuen Spiel vor der Figur. Sagt ehrlich, dass vieles
// erst im Lauf des Spiels freigeschaltet wird (bewusst so), und macht Lust darauf.

import { GAME_TITLE } from '../../config';
import type { App, Screen } from '../app';
import { h, svgEl } from '../dom';
import { icon } from '../icons';

/** Was später dazukommt. Nur Dinge, die wirklich geplant sind (siehe docs/KONZEPT.md). */
const TEASERS: [icon: string, title: string, text: string][] = [
  ['sword', 'Raids', 'Jede Woche ein neues Nest, drei Schwierigkeiten und Beute, die es sonst nirgends gibt.'],
  ['mushrooms', 'Berufe', 'Werde Kräutersammler und bestimme echte Pilze und Pflanzen. Später Jäger und Angler.'],
  ['bunker', 'Rote Zonen', 'Bunker und verseuchte Orte, die immer tiefer führen. Wie weit traust du dich?'],
  ['home', 'Bewohner', 'Andere Überlebende ziehen bei dir ein und helfen mit. Und vielleicht ein Hund.'],
  ['signal', 'Kanal 4', 'Eine Stimme im Funk erzählt jede Woche weiter. Wer sendet da, und warum die Küste?'],
  ['eye', 'Legenden', 'Einmal im Jahr zeigt sich irgendwo ein Wesen, das kaum jemand je gesehen hat.'],
];

export function unlocksScreen(app: App): Screen {
  const el = h(
    'div',
    { class: 'screen unlocks' },
    h(
      'div',
      { class: 'page' },
      h('div', { class: 'sign' }, h('span', null, 'Bitte kurz lesen')),
      h(
        'p',
        { class: 'unlocks-lead' },
        `${GAME_TITLE} wächst mit dir. Am Anfang hast du einen Rucksack, eine Brechstange und ein Zuhause, das erst noch eins werden muss. `,
        h('b', null, 'Vieles schaltest du erst nach und nach frei.'),
        ' Das ist Absicht: So bleibt jeder Schritt etwas Neues, und nichts erschlägt dich am ersten Tag.',
      ),
      h('h2', { class: 'unlocks-head' }, 'Das wartet auf dich'),
      h(
        'ul',
        { class: 'unlock-grid' },
        TEASERS.map(([ic, title, text]) =>
          h(
            'li',
            { class: 'unlock-card' },
            h('span', { class: 'unlock-icon' }, svgEl(icon(ic))),
            h('span', { class: 'unlock-lock', 'aria-label': 'noch gesperrt' }, svgEl(icon('lock'))),
            h('b', null, title),
            h('span', null, text),
          ),
        ),
      ),
      h('p', { class: 'unlocks-calm' }, 'Und keine Sorge: Wenn du mal Pause machst, verpasst du nichts. Es wartet auf dich.'),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn wide', type: 'button', onclick: () => app.go('character') }, 'Verstanden, los geht’s')),
    ),
  );
  return { el };
}
