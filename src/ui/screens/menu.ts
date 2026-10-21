// Hauptmenü: Logo, Hintergrundbild und eine schlichte Liste mit großen Knöpfen.

import { GAME_VERSION, IS_PREVIEW } from '../../config';
import { MEMENTOS } from '../../core/content';
import { dayNumber } from '../../core/rules';
import { signedIn, signOut } from '../../services/auth';
import type { App, Screen } from '../app';
import { clear, h } from '../dom';
import { artStyle } from '../art';
import { logoEl } from '../logo';

/** Ein Eintrag im Menü (auch im Pausenmenü benutzt). */
export function menuItem(label: string, sub: string | null, onclick: () => void, primary = false): HTMLElement {
  return h('li', { class: primary ? 'primary' : '' }, h('button', { type: 'button', onclick }, h('span', { class: 'item-text' }, label, sub ? h('small', null, sub) : null)));
}

export function menuScreen(app: App): Screen {
  // Platz für das Bild im Hintergrund (links frei, rechts das Menü)
  const canvas = h('div', { class: 'menu-scene', 'aria-hidden': 'true' });
  const routeHost = h('nav', { class: 'menu-nav', 'aria-label': 'Hauptmenü' });
  const stop = menuItem;

  const renderRoute = () => {
    clear(routeHost);
    const save = app.backend.current();
    const items: HTMLElement[] = [];
    if (save) {
      const found = Object.keys(save.collection).length;
      items.push(
        stop(
          'Weiterspielen',
          `${save.character.name} · Tag ${dayNumber(save, app.backend.now())} · ${found}/${MEMENTOS.length} Erinnerungen`,
          () => app.go('game'),
          true,
        ),
      );
    }
    items.push(stop('Neues Spiel', save ? null : 'Erstelle deine Figur', () => (save ? confirmNew() : app.go('unlocks')), !save));
    items.push(stop('Einstellungen', null, () => app.go('settings')));
    routeHost.append(h('ol', { class: 'menu-list' }, items));
  };

  const confirmNew = () => {
    const save = app.backend.current()!;
    clear(routeHost);
    routeHost.append(
      h(
        'div',
        { class: 'confirm' },
        h('p', { class: 'confirm-title' }, 'Neues Spiel starten?'),
        h('p', null, `Der Spielstand von ${save.character.name} (Tag ${dayNumber(save, app.backend.now())}) wird überschrieben.`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: renderRoute }, 'Abbrechen'),
          h('button', { class: 'btn danger', type: 'button', onclick: () => app.go('unlocks') }, 'Neu starten'),
        ),
      ),
    );
  };

  const el = h(
    'div',
    { class: 'screen menu has-art', style: artStyle('menu') },
    h('header', { class: 'menu-head' }, logoEl('menu-logo')),
    canvas,
    routeHost,
    h(
      'footer',
      { class: 'menu-foot' },
      `Prototyp ${GAME_VERSION}${IS_PREVIEW ? ' · Vorschau' : ''} · ${signedIn() === 'guest' || !signedIn() ? 'Gast' : 'Konto'} · `,
      h(
        'button',
        {
          class: 'link-btn',
          type: 'button',
          onclick: () => {
            signOut();
            app.go('title');
          },
        },
        'Abmelden',
      ),
    ),
  );

  return {
    el,
    mount() {
      renderRoute();
    },
  };
}
