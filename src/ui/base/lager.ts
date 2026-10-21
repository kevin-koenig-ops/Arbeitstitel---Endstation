// Das Lager in der Endstation: hier liegt alles sicher. Rucksack auspacken,
// Rohstoffe und Kram ansehen, Kram zum Werktisch geben, Sammelstücke aufstellen.

import { COLLECTIBLE_ORDER, COLLECTIBLES, KRAM, KRAM_ORDER, MATERIAL_ORDER, RESOURCES } from '../../core/content';
import { collectiblePlaced, hasWorkbench, kramCount, packCount, workbenchSlots } from '../../core/rules';
import type { Action, CollectibleId, PlayerState } from '../../core/types';
import type { App } from '../app';
import { clear, h, svgEl } from '../dom';
import { icon, resIcon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { itemsLine, kramLine, thingThumb } from '../game/chips';
import { kramRow } from '../game/packPanel';

interface Opts {
  needHere: () => boolean;
  onChanged: () => void;
  onClose: () => void;
  /** Sammelstück aufstellen (schließt das Lager und startet das Hinstellen). */
  place: (id: CollectibleId) => void;
  openWorkshop: () => void;
}

/** Rucksack auspacken. Gibt eine kurze Meldung zurück oder null. */
export async function unpack(app: App): Promise<string | null> {
  const res = await app.backend.dispatch({ type: 'unpack' });
  const ev = res.events[0];
  if (ev.type !== 'unpacked') return null;
  return [itemsLine(ev.items), kramLine(ev.kram)].filter(Boolean).join(', ');
}

export function openLager(app: App, host: HTMLElement, opts: Opts): { el: HTMLElement; close: () => void } {
  const body = h('div', { class: 'ws-body' });
  const el = h(
    'aside',
    { class: 'workshop lager', role: 'dialog', 'aria-label': 'Lager' },
    h(
      'div',
      { class: 'ws-head' },
      h('div', { class: 'ws-title' }, svgEl(icon('home', 20)), h('b', null, 'Lager'), h('small', null, 'Hier ist alles sicher')),
      h('button', { class: 'iconbtn small', type: 'button', 'aria-label': 'Schließen', onclick: () => close() }, svgEl(icon('close', 18))),
    ),
    body,
  );
  host.append(el);

  const st = (): PlayerState => app.backend.current()!;
  const dispatch = async (a: Action) => {
    if (!opts.needHere()) return null;
    const res = await app.backend.dispatch(a);
    const rej = res.events.find((e) => e.type === 'rejected');
    if (rej && rej.type === 'rejected') {
      app.toast(REJECT_TEXT[rej.reason], 'warn');
      return null;
    }
    opts.onChanged();
    return res;
  };

  const render = () => {
    const s = st();
    clear(body);

    // --- Rucksack ---
    if (packCount(s)) {
      body.append(
        h(
          'div',
          { class: 'ws-upgrade lager-pack' },
          h('div', null, h('b', null, 'Im Rucksack'), h('small', null, [itemsLine(s.pack), kramLine(s.packKram)].filter(Boolean).join(', '))),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onclick: async () => {
                if (!opts.needHere()) return;
                const msg = await unpack(app);
                if (msg) app.toast(`Ausgepackt: ${msg}`, 'good');
                opts.onChanged();
                render();
              },
            },
            svgEl(icon('backpack', 16)),
            'Auspacken',
          ),
        ),
      );
    }

    // --- Rohstoffe ---
    body.append(h('h3', { class: 'ws-sec' }, 'Rohstoffe'));
    body.append(
      h(
        'ul',
        { class: 'lager-mats' },
        MATERIAL_ORDER.map((r) =>
          h('li', { class: s.inventory[r] ? '' : 'empty', title: RESOURCES[r].where ?? '' }, svgEl(resIcon(r, 20)), h('span', null, RESOURCES[r].name), h('b', null, String(s.inventory[r]))),
        ),
      ),
    );

    // --- Kram ---
    const owned = KRAM_ORDER.filter((k) => (s.kram[k] ?? 0) > 0);
    const bench = hasWorkbench(s);
    const full = s.workshop.jobs.length >= workbenchSlots(s);
    body.append(h('h3', { class: 'ws-sec' }, 'Kram', h('small', null, `${kramCount(s.kram)} Stück`)));
    if (!owned.length) body.append(h('p', { class: 'ws-empty' }, 'Kein Kram im Lager. Draußen findest du Toaster, Kanister, Radios und mehr.'));
    else
      body.append(
        h(
          'ul',
          { class: 'junk-list lager-kram' },
          owned.map((k) =>
            kramRow(
              k,
              s.kram[k] ?? 0,
              bench
                ? h(
                    'button',
                    {
                      class: 'btn small ghost',
                      type: 'button',
                      disabled: full,
                      title: full ? 'Der Werktisch ist voll' : '',
                      onclick: async () => {
                        if (await dispatch({ type: 'dismantle', kram: k })) app.toast(`${KRAM[k].name} liegt auf dem Werktisch.`);
                        render();
                      },
                    },
                    'Zerlegen',
                  )
                : null,
            ),
          ),
        ),
      );
    if (owned.length && !bench) body.append(h('p', { class: 'ws-empty' }, 'Stell einen Werktisch auf (Bauen, Einrichten), dann zerlegst du Kram in Rohstoffe.'));
    if (bench && s.workshop.jobs.length)
      body.append(h('button', { class: 'btn small ghost', type: 'button', onclick: () => opts.openWorkshop() }, svgEl(icon('wrench', 16)), 'Zum Werktisch'));

    // --- Sammelstücke ---
    const stored = COLLECTIBLE_ORDER.filter((c) => s.collectibles[c] && !collectiblePlaced(s, c));
    if (stored.length) {
      body.append(h('h3', { class: 'ws-sec' }, 'Sammelstücke', h('small', null, 'Noch nicht aufgestellt')));
      body.append(
        h(
          'ul',
          { class: 'lager-finds' },
          stored.map((c) =>
            h(
              'li',
              null,
              h(
                'button',
                { type: 'button', title: COLLECTIBLES[c].desc, onclick: () => opts.place(c) },
                thingThumb(c, 56),
                h('span', null, COLLECTIBLES[c].name),
                h('small', null, 'Aufstellen'),
              ),
            ),
          ),
        ),
      );
    }
  };

  const close = () => {
    el.remove();
    opts.onClose();
  };

  render();
  return { el, close };
}
