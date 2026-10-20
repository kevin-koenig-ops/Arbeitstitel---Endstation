import type { App, Screen } from '../app';
import { h, svgEl } from '../dom';
import { icon } from '../icons';
import { settingsPanel } from '../settingsPanel';

export function settingsScreen(app: App): Screen {
  const el = h(
    'div',
    { class: 'screen settings-screen' },
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'topbar' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Zurück', onclick: () => app.go('menu') }, svgEl(icon('back'))),
        h('h1', { class: 'sign-title' }, 'Einstellungen'),
      ),
      settingsPanel(app),
    ),
  );
  return { el };
}
