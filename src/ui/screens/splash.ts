// Startbildschirm mit Logo. Das Logo steht in src/ui/logo.ts.

import type { App, Screen } from '../app';
import { artStyle } from '../art';
import { h, reducedMotion } from '../dom';
import { logoEl } from '../logo';

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
    { class: 'screen splash has-art', style: artStyle('home'), onclick: next },
    logoEl('splash-logo'),
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
