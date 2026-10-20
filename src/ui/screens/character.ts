// Charaktererstellung, gestaltet als Fahrgastausweis.

import { BACKGROUNDS, HAIR_STYLES, JACKET_COLORS } from '../../core/content';
import type { BackgroundId, Character } from '../../core/types';
import type { App, Screen } from '../app';
import { avatarSvg, SKIN_TONES } from '../avatar';
import { clear, h, svgEl } from '../dom';
import { icon } from '../icons';

const NAMES = ['Kim', 'Alex', 'Robin', 'Sascha', 'Jo', 'Mika', 'Toni', 'Charlie', 'Luca', 'Sam'];

export function characterScreen(app: App): Screen {
  const draft: Character = {
    name: '',
    look: { hair: 0, color: 0, skin: 1 },
    background: 'workshop',
  };
  const placeholder = NAMES[Math.floor(Math.random() * NAMES.length)];

  const cardFace = h('div', { class: 'id-photo' });
  // 3D-Figur (three.js wird nachgeladen, bis dahin die einfache Zeichnung)
  const stageEl = h('div', { class: 'figure-stage', role: 'img', 'aria-label': 'Deine Figur. Mit dem Finger drehen.' }, h('span', { class: 'figure-hint' }, 'Zum Drehen wischen'));
  let fv: typeof import('../../base/figureView') | null = null;
  let fig: import('../../base/figureView').FigureView | null = null;
  let destroyed = false;
  let ro: ResizeObserver | null = null;
  const hairImgs: HTMLElement[] = [];
  const portrait = (look: Character['look'], size: number) => {
    if (!fv) return svgEl(avatarSvg(look, size));
    try {
      return h('img', { src: fv.renderPortrait(look, size * 2), alt: '', width: String(size), height: String(size) });
    } catch {
      return svgEl(avatarSvg(look, size));
    }
  };
  const refreshHair = () =>
    hairImgs.forEach((slot, i) => {
      clear(slot);
      slot.append(portrait({ ...draft.look, hair: i }, 44));
    });
  const cardName = h('div', { class: 'id-name' });
  const cardRole = h('div', { class: 'id-role' });
  const cardPerk = h('div', { class: 'id-perk' });

  const renderCard = () => {
    clear(cardFace);
    cardFace.append(portrait(draft.look, 96));
    fig?.setLook(draft.look);
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

  const choiceRow = <T>(label: string, id: string, options: T[], render: (o: T, i: number) => HTMLElement, get: () => number, set: (i: number) => void) => {
    const row = h('div', { class: 'choices', role: 'radiogroup', 'aria-labelledby': id });
    const paint = () =>
      [...row.children].forEach((c, i) => {
        c.setAttribute('aria-checked', String(i === get()));
      });
    options.forEach((o, i) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'choice', onclick: () => (set(i), paint(), renderCard(), refreshHair()) }, render(o, i));
      row.append(b);
    });
    paint();
    return h('div', { class: 'field-group' }, h('div', { class: 'label', id }, label), row);
  };

  const hairRow = choiceRow(
    'Frisur',
    'lbl-hair',
    [...HAIR_STYLES],
    (name, i) => {
      const slot = h('span', { class: 'hair-face' }, svgEl(avatarSvg({ ...draft.look, hair: i }, 44)));
      hairImgs[i] = slot;
      return h('span', { class: 'choice-hair' }, slot, h('small', null, name));
    },
    () => draft.look.hair,
    (i) => (draft.look.hair = i),
  );
  const skinRow = choiceRow(
    'Hautton',
    'lbl-skin',
    [...SKIN_TONES],
    (c) => h('span', { class: 'swatch', style: `background:${c}` }),
    () => draft.look.skin,
    (i) => (draft.look.skin = i),
  );
  const colorRow = choiceRow(
    'Jacke',
    'lbl-color',
    [...JACKET_COLORS],
    (c) => h('span', { class: 'swatch', style: `background:${c}` }),
    () => draft.look.color,
    (i) => (draft.look.color = i),
  );

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
    { class: 'screen character' },
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'topbar' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Zurück', onclick: () => app.go('menu') }, svgEl(icon('back'))),
        h('h1', { class: 'sign-title' }, 'Wer bist du?'),
      ),
      stageEl,
      h(
        'section',
        { class: 'id-card', 'aria-label': 'Vorschau' },
        h('div', { class: 'id-head' }, h('span', null, 'Fahrgastausweis'), h('span', null, 'Linie 0')),
        h('div', { class: 'id-body' }, cardFace, h('div', { class: 'id-fields' }, h('small', null, 'Name'), cardName, h('small', null, 'Vorgeschichte'), cardRole, cardPerk)),
        h('div', { class: 'id-foot' }, 'Gültig bis auf Weiteres'),
      ),
      h('div', { class: 'field-group' }, h('label', { class: 'label', for: 'char-name' }, 'Name'), nameInput),
      hairRow,
      h('div', { class: 'two-col' }, skinRow, colorRow),
      h('div', { class: 'field-group' }, h('div', { class: 'label', id: 'lbl-bg' }, 'Vorgeschichte'), bgList),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn wide', type: 'button', onclick: start }, 'Einsteigen')),
    ),
  );

  const mount = async () => {
    renderCard();
    try {
      fv = await import('../../base/figureView');
    } catch {
      return;
    }
    if (destroyed) return;
    try {
      fig = new fv.FigureView({ mode: 'stage', width: Math.max(200, stageEl.clientWidth || 320), height: Math.max(200, stageEl.clientHeight || 300) });
      fig.setLook(draft.look);
      stageEl.prepend(fig.canvas);
      fig.start();
      const f = fig;
      ro = new ResizeObserver(() => f.setSize(stageEl.clientWidth, stageEl.clientHeight));
      ro.observe(stageEl);
    } catch {
      fig = null;
    }
    renderCard();
    refreshHair();
  };

  return {
    el,
    mount,
    destroy: () => {
      destroyed = true;
      ro?.disconnect();
      fig?.dispose();
    },
  };
}
