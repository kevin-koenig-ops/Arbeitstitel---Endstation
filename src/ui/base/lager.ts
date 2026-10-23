// Das Lager zu Hause: hier liegt alles sicher. Rucksack auspacken, für den Kampf packen
// (Tasche und Fähigkeiten), Rohstoffe und Kram ansehen, Kram zum Werktisch geben,
// Sammelstücke aufstellen.

import { CARDS, COLLECTIBLE_ORDER, COLLECTIBLES, KRAM, KRAM_ORDER, MATERIAL_ORDER, ONCE_CARDS, POUCH_SLOTS, RANGE_NAMES, RESOURCES, SKILL_CARDS, WEAPON_CARDS, WEAPONS, type CardId } from '../../core/content';
import { battleWeapons, collectiblePlaced, hasWorkbench, kramCount, onceOwned, packCount, skillOf, skillSlots, workbenchSlots } from '../../core/rules';
import type { WeaponId } from '../../core/types';
import type { Action, CollectibleId, PlayerState } from '../../core/types';
import { cardCounts, cardFace, WEAPON_ICON } from '../cards';
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

    // --- Für den Kampf: Tasche und Fähigkeiten ---
    loadoutSection(s);

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

  /** Antippen: mitnehmen oder hierlassen. Tasche 3 Sorten, Fähigkeiten 4. */
  const loadoutSection = (s: PlayerState) => {
    const lo = s.loadout;
    const once = ONCE_CARDS.filter((id) => onceOwned(s, id) > 0 || lo.pouch.includes(id));
    const skills = SKILL_CARDS.filter((id) => skillOf(s, id) > 0);
    const kinds = [...new Set(s.weapons.filter((w) => w.dur > 0).map((w) => w.kind))];
    if (!once.length && !skills.length && !kinds.length) return;
    const slots = skillSlots(s);
    const toggle = async (id: CardId) => {
      const isOnce = CARDS[id].kind === 'once';
      const list = isOnce ? lo.pouch : lo.skills;
      const max = isOnce ? POUCH_SLOTS : slots;
      const on = list.includes(id);
      if (!on && list.length >= max) {
        app.toast(isOnce ? `Die Tasche ist voll (${max} Sorten). Nimm erst eine heraus.` : `Alle ${max} Plätze sind belegt. Nimm erst eine Fähigkeit heraus.`, 'warn');
        return;
      }
      const next = on ? list.filter((x) => x !== id) : [...list, id];
      if (await dispatch(isOnce ? { type: 'setLoadout', pouch: next } : { type: 'setLoadout', skills: next })) render();
    };
    const grid = (ids: CardId[], chosen: CardId[]) =>
      h(
        'div',
        { class: 'cbook-grid loadout-grid' },
        ids.map((id) => {
          const on = chosen.includes(id);
          const isOnce = CARDS[id].kind === 'once';
          return h(
            'button',
            {
              class: `cbook-cell loadout-cell${on ? ' on' : ''}`,
              type: 'button',
              'aria-pressed': String(on),
              'aria-label': `${CARDS[id].name}: ${on ? 'dabei' : 'bleibt hier'}`,
              title: CARDS[id].desc,
              onclick: () => void toggle(id),
            },
            cardFace(id, isOnce ? { count: onceOwned(s, id) } : { level: skillOf(s, id) }),
            h('span', { class: 'loadout-mark' }, on ? 'Dabei' : 'Hier'),
          );
        }),
      );
    body.append(
      h('h3', { class: 'ws-sec' }, 'Für den Kampf', h('small', null, 'Antippen: mitnehmen oder hierlassen')),
    );
    // Waffen: je eine für Nahkampf und Fernkampf
    if (kinds.length) {
      const inFight = new Set(battleWeapons(s).map((w) => w.kind));
      const pick = async (range: 'melee' | 'ranged', kind: WeaponId) => {
        if (inFight.has(kind)) return;
        if (await dispatch(range === 'melee' ? { type: 'setLoadout', melee: kind } : { type: 'setLoadout', ranged: kind })) render();
      };
      body.append(h('h4', { class: 'loadout-head' }, 'Waffen', h('small', null, 'Je eine für vorne und für hinten')));
      for (const range of ['melee', 'ranged'] as const) {
        const list = kinds.filter((k) => WEAPONS[k].range === range);
        body.append(
          h(
            'div',
            { class: 'loadout-weapons' },
            h('small', { class: 'loadout-range' }, RANGE_NAMES[range]),
            list.length
              ? h('div', { class: 'loadout-weapon-list' }, list.map((k) => {
                  const on = inFight.has(k);
                  const dur = Math.max(...s.weapons.filter((w) => w.kind === k).map((w) => w.dur));
                  return h(
                    'button',
                    {
                      class: `loadout-weapon${on ? ' on' : ''}`,
                      type: 'button',
                      'aria-pressed': String(on),
                      title: `${WEAPONS[k].desc} Im Kampf: ${cardCounts(WEAPON_CARDS[k] ?? [])}.`,
                      onclick: () => void pick(range, k),
                    },
                    svgEl(icon(WEAPON_ICON[k], 20)),
                    h('span', null, h('b', null, WEAPONS[k].name), h('small', null, `${dur} Haltbarkeit`)),
                  );
                }))
              : h('span', { class: 'ws-empty' }, range === 'ranged' ? 'Noch keine. Bis dahin trifft dein Steinwurf auch hinten.' : 'Noch keine. Du kämpfst mit den Fäusten.'),
          ),
        );
      }
    }
    if (once.length)
      body.append(
        h('h4', { class: 'loadout-head' }, 'Tasche', h('small', null, `${lo.pouch.length} von ${POUCH_SLOTS} Sorten, je bis zu 3 Stück`)),
        grid(once, lo.pouch),
      );
    if (skills.length)
      body.append(
        h('h4', { class: 'loadout-head' }, 'Fähigkeiten', h('small', null, `${lo.skills.length} von ${slots} Plätzen`)),
        grid(skills, lo.skills),
      );
  };

  const close = () => {
    el.remove();
    opts.onClose();
  };

  render();
  return { el, close };
}
