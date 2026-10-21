// Hauptmenü als Linienplan: jede Option ist eine Haltestelle.

import logoUrl from '../../assets/logo.svg';
import { GAME_TITLE, GAME_VERSION, IS_PREVIEW } from '../../config';
import { MEMENTOS } from '../../core/content';
import { dayNumber } from '../../core/rules';
import type { App, Screen } from '../app';
import { clear, h } from '../dom';
import { artStyle } from '../art';

export function menuScreen(app: App): Screen {
  // Platzhalter für das Bild im Hintergrund (links frei, rechts der Linienplan)
  const canvas = h('div', { class: 'menu-scene', 'aria-hidden': 'true' });
  const routeHost = h('nav', { class: 'menu-route', 'aria-label': 'Hauptmenü' });

  const stop = (label: string, sub: string | null, onclick: () => void, primary = false) =>
    h(
      'li',
      { class: primary ? 'primary' : '' },
      h('button', { type: 'button', onclick }, h('span', { class: 'stop-dot' }), h('span', { class: 'stop-text' }, label, sub ? h('small', null, sub) : null)),
    );

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
    items.push(stop('Neues Spiel', save ? null : 'Erstelle deine Figur', () => (save ? confirmNew() : app.go('character')), !save));
    items.push(stop('Einstellungen', null, () => app.go('settings')));
    routeHost.append(h('ol', { class: 'route' }, items));
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
          h('button', { class: 'btn danger', type: 'button', onclick: () => app.go('character') }, 'Neu starten'),
        ),
      ),
    );
  };

  const el = h(
    'div',
    { class: 'screen menu has-art', style: artStyle('menu') },
    h('header', { class: 'menu-head' }, h('img', { class: 'menu-logo', src: logoUrl, alt: GAME_TITLE })),
    canvas,
    routeHost,
    h('footer', { class: 'menu-foot' }, `Prototyp ${GAME_VERSION}${IS_PREVIEW ? ' · Vorschau' : ''} · Arbeitstitel`),
  );

  return {
    el,
    mount() {
      renderRoute();
    },
  };
}
