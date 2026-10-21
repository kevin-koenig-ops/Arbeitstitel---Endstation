// Startbild: gemaltes Bild mit bewegtem Nebel und Niesel, Logo, „Zum Starten berühren“.
// Wer schon angemeldet ist, kommt danach direkt ins Hauptmenü, sonst zur Anmeldung.
// Das erste Berühren schaltet am Handy auch Vollbild und Querformat ein (siehe app.ts).

import { GAME_VERSION } from '../../config';
import { signedIn } from '../../services/auth';
import type { App, Screen } from '../app';
import { artStyle } from '../art';
import { h } from '../dom';
import { logoEl } from '../logo';
import { titleWeather } from '../titleWeather';

const ACCOUNT_NAMES = { guest: 'Gast', google: 'Google', apple: 'Apple' } as const;

export function titleScreen(app: App): Screen {
  const weather = titleWeather();
  let done = false;
  const start = () => {
    if (done) return;
    done = true;
    app.go(signedIn() ? 'menu' : 'login');
  };
  const who = signedIn();
  const el = h(
    'div',
    { class: 'screen title', style: artStyle('title'), onclick: start, role: 'button', tabindex: '0', 'aria-label': 'Zum Starten berühren' },
    h('div', { class: 'title-art', 'aria-hidden': 'true' }),
    weather.el,
    h('div', { class: 'title-shade', 'aria-hidden': 'true' }),
    logoEl('title-logo'),
    h('p', { class: 'title-touch' }, 'Zum Starten berühren'),
    h('p', { class: 'title-foot' }, `${who ? `Angemeldet: ${ACCOUNT_NAMES[who]} · ` : ''}Prototyp ${GAME_VERSION}`),
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') start();
  };
  return {
    el,
    mount() {
      document.addEventListener('keydown', onKey);
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      weather.destroy();
    },
  };
}
