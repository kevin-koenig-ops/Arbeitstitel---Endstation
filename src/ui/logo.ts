// Platzhalter-Logo: „Projekt“ klein darüber, „Heimweg“ groß darunter, dazu ein kleines
// Echo-Zeichen (wie das App-Icon). Ein echtes Logo ersetzt später nur diese Funktion.

import { GAME_TITLE, LOGO_PARTS } from '../config';
import { h } from './dom';

export function logoEl(cls = ''): HTMLElement {
  return h(
    'div',
    { class: `logo ${cls}`.trim(), role: 'img', 'aria-label': GAME_TITLE },
    h('span', { class: 'logo-mark', 'aria-hidden': 'true' }),
    h('span', { class: 'logo-kicker', 'aria-hidden': 'true' }, LOGO_PARTS.kicker),
    h('span', { class: 'logo-word', 'aria-hidden': 'true' }, LOGO_PARTS.word),
  );
}
