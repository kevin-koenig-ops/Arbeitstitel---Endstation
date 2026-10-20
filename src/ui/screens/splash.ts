// Startbildschirm mit Logo. Das Logo ist src/assets/logo.svg; einfach die Datei ersetzen.

import logoUrl from '../../assets/logo.svg';
import { GAME_TITLE } from '../../config';
import type { App, Screen } from '../app';
import { h, reducedMotion } from '../dom';

export function splashScreen(app: App): Screen {
  let timer = 0;
  let done = false;
  const next = () => {
    if (done) return;
    done = true;
    app.go('menu');
  };
  const el = h(
    'div',
    { class: 'screen splash', onclick: next },
    h('img', { class: 'splash-logo', src: logoUrl, alt: GAME_TITLE }),
    h('p', { class: 'splash-hint' }, 'Tippen zum Überspringen'),
  );
  return {
    el,
    mount() {
      timer = window.setTimeout(next, reducedMotion() ? 900 : 2400);
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}
