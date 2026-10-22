// Charaktererstellung, gestaltet als Fahrgastausweis. Statt einer Figur suchst du dir ein Porträt aus.

import { BACKGROUNDS, PORTRAITS } from '../../core/content';
import type { BackgroundId, Character } from '../../core/types';
import type { App, Screen } from '../app';
import { clear, h, svgEl } from '../dom';
import { artStyle } from '../art';
import { icon } from '../icons';
import { faceEl, portraitLook } from '../portrait';

const NAMES = ['Kim', 'Alex', 'Robin', 'Sascha', 'Jo', 'Mika', 'Toni', 'Charlie', 'Luca', 'Sam'];

export function characterScreen(app: App): Screen {
  const first = Math.floor(Math.random() * PORTRAITS.length);
  const draft: Character = {
    name: '',
    look: portraitLook(first),
    background: 'workshop',
  };
  const placeholder = NAMES[Math.floor(Math.random() * NAMES.length)];

  const cardFace = h('div', { class: 'id-photo' });
  const cardName = h('div', { class: 'id-name' });
  const cardRole = h('div', { class: 'id-role' });
  const cardPerk = h('div', { class: 'id-perk' });

  const renderCard = () => {
    clear(cardFace);
    cardFace.append(faceEl(draft.look, 96));
    cardName.textContent = draft.name.trim() || placeholder;
    cardRole.textContent = BACKGROUNDS[draft.background].name;
    cardPerk.textContent = BACKGROUNDS[draft.background].perk;
  };

  const nameInput = h('input', {
    id: 'char-name',
    class: 'field',
    type: 'text',
    maxlength: '16',
    autocomplete: 'off',
    placeholder,
    oninput: () => {
      draft.name = nameInput.value;
      renderCard();
    },
  });

  // Porträts zum Antippen
  const portraitRow = h('div', { class: 'portrait-grid', role: 'radiogroup', 'aria-labelledby': 'lbl-portrait' });
  const paintPortraits = () => [...portraitRow.children].forEach((c, i) => c.setAttribute('aria-checked', String(i === draft.look.portrait)));
  PORTRAITS.forEach((p, i) => {
    portraitRow.append(
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: 'portrait-choice',
          'aria-label': p.who,
          title: p.who,
          onclick: () => {
            draft.look = portraitLook(i);
            paintPortraits();
            renderCard();
          },
        },
        faceEl(portraitLook(i), 64),
      ),
    );
  });
  paintPortraits();
  const bgIds = Object.keys(BACKGROUNDS) as BackgroundId[];
  const bgList = h('div', { class: 'bg-list', role: 'radiogroup', 'aria-labelledby': 'lbl-bg' });
  const paintBg = () => [...bgList.children].forEach((c, i) => c.setAttribute('aria-checked', String(bgIds[i] === draft.background)));
  for (const id of bgIds) {
    const b = BACKGROUNDS[id];
    bgList.append(
      h(
        'button',
        { type: 'button', role: 'radio', class: 'bg-card', onclick: () => ((draft.background = id), paintBg(), renderCard()) },
        h('span', { class: 'bg-name' }, b.name),
        h('span', { class: 'bg-perk' }, b.perk),
        h('span', { class: 'bg-story' }, b.story),
      ),
    );
  }
  paintBg();

  const start = async () => {
    const character: Character = { ...draft, name: draft.name.trim() || placeholder };
    await app.backend.newGame(character);
    app.go('intro');
  };

  const el = h(
    'div',
    { class: 'screen character has-art', style: artStyle('character') },
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'topbar' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Zurück', onclick: () => app.go('menu') }, svgEl(icon('back'))),
        h('h1', { class: 'sign-title' }, 'Wer bist du?'),
      ),
      h(
        'section',
        { class: 'id-card', 'aria-label': 'Vorschau' },
        h('div', { class: 'id-head' }, h('span', null, 'Ausweis'), h('span', null, 'Notausgabe')),
        h('div', { class: 'id-body' }, cardFace, h('div', { class: 'id-fields' }, h('small', null, 'Name'), cardName, h('small', null, 'Vorgeschichte'), cardRole, cardPerk)),
        h('div', { class: 'id-foot' }, 'Gültig bis auf Weiteres'),
      ),
      h('div', { class: 'field-group' }, h('label', { class: 'label', for: 'char-name' }, 'Name'), nameInput),
      h('div', { class: 'field-group' }, h('div', { class: 'label', id: 'lbl-portrait' }, 'Aussehen'), portraitRow),
      h('div', { class: 'field-group' }, h('div', { class: 'label', id: 'lbl-bg' }, 'Vorgeschichte'), bgList),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn wide', type: 'button', onclick: start }, 'Weiter')),
    ),
  );

  return {
    el,
    mount: () => renderCard(),
  };
}
