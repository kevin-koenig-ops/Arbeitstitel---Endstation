// Anmelden: vorerst nur als Gast. Google und Apple stehen als Platzhalter daneben
// (wer auf dem iPhone Google anbietet, muss laut App-Store-Regeln auch Apple anbieten).
// Die echten Knöpfe kommen mit der echten Anmeldung, dann auch mit den offiziellen Zeichen.

import { signIn } from '../../services/auth';
import type { App, Screen } from '../app';
import { artStyle } from '../art';
import { h } from '../dom';
import { logoEl } from '../logo';
import { titleWeather } from '../titleWeather';

export function loginScreen(app: App): Screen {
  const weather = titleWeather();
  const option = (label: string, sub: string, onclick: (() => void) | null, primary = false) =>
    h(
      'button',
      { class: `login-btn${primary ? ' primary' : ''}`, type: 'button', disabled: onclick ? undefined : 'true', onclick: onclick ?? undefined },
      h('span', { class: 'login-btn-text' }, label, h('small', null, sub)),
      onclick ? null : h('span', { class: 'login-soon' }, 'bald'),
    );
  const el = h(
    'div',
    { class: 'screen login', style: artStyle('title') },
    h('div', { class: 'title-art', 'aria-hidden': 'true' }),
    weather.el,
    h('div', { class: 'login-shade', 'aria-hidden': 'true' }),
    logoEl('login-logo'),
    h(
      'section',
      { class: 'login-panel', 'aria-labelledby': 'login-title' },
      h('h2', { id: 'login-title' }, 'Anmelden'),
      option(
        'Als Gast spielen',
        'Dein Spielstand bleibt auf diesem Gerät.',
        () => {
          signIn('guest');
          app.go('menu');
        },
        true,
      ),
      option('Mit Google anmelden', 'Spielstand auf allen Geräten', null),
      option('Mit Apple anmelden', 'Spielstand auf allen Geräten', null),
      h('button', { class: 'login-back', type: 'button', onclick: () => app.go('title') }, 'Zurück zum Startbild'),
    ),
  );
  return {
    el,
    destroy() {
      weather.destroy();
    },
  };
}
