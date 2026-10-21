// Platzhalter-Logo: der Titel als Schrift, dazu ein kleines Echo-Zeichen (wie das App-Icon).
// Ein echtes Logo ersetzt später nur diese Funktion.

import { GAME_TITLE } from '../config';
import { h } from './dom';

export function logoEl(cls = ''): HTMLElement {
  return h(
    'div',
    { class: `logo ${cls}`.trim(), role: 'img', 'aria-label': GAME_TITLE },
    h('span', { class: 'logo-mark', 'aria-hidden': 'true' }),
    h('span', { class: 'logo-word', 'aria-hidden': 'true' }, GAME_TITLE),
    h('span', { class: 'logo-sub', 'aria-hidden': 'true' }, 'Arbeitstitel'),
  );
}
