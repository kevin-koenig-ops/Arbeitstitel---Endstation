// Charakterfenster: links Ausrüstung (Gesundheit, Waffen), in der Mitte die Figur,
// rechts der Rucksack als Fächer. Dazu das Fundbuch (Orte, Sammelstücke, Sets, Erinnerungen).

import {
  PLACE_WHERE,
  SPECIAL_KINDS,
  CARDS,
  COLLECTIBLE_ORDER,
  COLLECTIBLES,
  HEAL_AMOUNT,
  KRAM,
  KRAM_ORDER,
  MATERIAL_ORDER,
  MAX_HEALTH,
  MEMENTOS,
  RARITY,
  RESOURCES,
  SET_ORDER,
  SETS,
  SPOT_KINDS,
  SURVIVAL_ORDER,
  WEAPON_CARDS,
  WEAPON_ORDER,
  WEAPONS,
  type CardId,
} from '../../core/content';
import { deckFor } from '../../core/tactics';
import { blueprintName } from '../../core/building';
import { bestWeapon, collectiblePlaced, currentHealth, dayNumber, kramCount, packCount } from '../../core/rules';
import type { CollectibleId, KramId, PlayerState, SpotKind } from '../../core/types';
import type { App } from '../app';
import { clear, h, svgEl } from '../dom';
import { icon, resIcon, spotIcon } from '../icons';
import { REJECT_TEXT, SPOT_PLURAL } from '../texts';
import { exploredStats } from '../../core/explore';
import { costChips, itemsLine, partsChips, thingThumb } from './chips';

export type PackTab = 'pack' | 'book' | 'gear';

/** Wo man ein Sammelstück finden kann (höchstens zwei Orte). */
export function whereCollectible(id: CollectibleId): string {
  const places = (Object.keys(SPOT_KINDS) as SpotKind[])
    .filter((k) => SPOT_KINDS[k].collectibles.includes(id))
    .map((k) => SPOT_PLURAL[k])
    .filter(Boolean);
  return places.length ? `Zu finden in ${places.slice(0, 2).join(' oder ')}` : 'Irgendwo da draußen';
}

/** Eine Kram-Zeile: Bild, Name, Anzahl und was drinsteckt. */
export function kramRow(id: KramId, n: number, extra?: HTMLElement | null) {
  return h(
    'li',
    null,
    thingThumb(id, 48),
    h(
      'div',
      { class: 'junk-main' },
      h('b', null, KRAM[id].name, n > 1 ? h('span', { class: 'junk-n' }, ` ×${n}`) : null),
      h('small', null, KRAM[id].desc),
      h('span', { class: 'junk-parts' }, 'Enthält ', partsChips(id)),
    ),
    extra ?? null,
  );
}

export function openPackPanel(app: App, host: HTMLElement, onClose: () => void, onChanged: () => void, startTab: PackTab = 'pack') {
  // Ausrüstung und Rucksack stehen jetzt zusammen im Charakterfenster
  let tab: PackTab = startTab === 'gear' ? 'pack' : startTab;
  const body = h('div', { class: 'pack-body' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  let figure: import('../../base/figureView').FigureView | null = null;
  const dropFigure = () => {
    figure?.dispose();
    figure = null;
  };

  const tabBtn = (id: PackTab, label: string) => h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => ((tab = id), render()) }, label);
  tabs.append(tabBtn('pack', 'Charakter'), tabBtn('book', 'Fundbuch'));

  const render = () => {
    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === tab)));
    dropFigure();
    clear(body);
    panel.classList.toggle('wide', tab === 'pack');
    if (tab === 'pack') body.append(charView());
    if (tab === 'book') body.append(bookView());
    body.scrollTop = 0;
  };

  // --- Charakterfenster: links Ausrüstung, Mitte Figur, rechts Rucksack ----------------
  const charView = () => {
    const s = app.backend.current()!;
    const now = app.backend.now();
    return h('div', { class: 'char' }, gearColumn(s, now), figureColumn(s, now), packColumn(s));
  };

  /** Links: Gesundheit, Waffen, Karten. */
  const gearColumn = (s: PlayerState, now: number) => {
    const hp = currentHealth(s, now);
    const best = bestWeapon(s);
    const hpSegs = h('span', { class: 'hp-bar me-hp' });
    for (let i = 0; i < MAX_HEALTH; i++) hpSegs.append(h('span', { class: i < hp ? 'on' : '' }));
    const missing = WEAPON_ORDER.filter((w) => !s.weapons.some((x) => x.kind === w));
    return h(
      'section',
      { class: 'char-col char-gear', 'aria-label': 'Ausrüstung' },
      h('h3', { class: 'char-head' }, 'Ausrüstung'),
      h(
        'div',
        { class: 'char-health' },
        h('div', { class: 'gear-row' }, h('span', null, 'Gesundheit'), h('b', null, `${hp} / ${MAX_HEALTH}`)),
        hpSegs,
        hp < MAX_HEALTH
          ? h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                disabled: s.inventory.medicine < 1,
                onclick: async () => {
                  const res = await app.backend.dispatch({ type: 'heal' });
                  const ev = res.events[0];
                  if (ev.type === 'healed') app.toast(`Verarztet: +${ev.amount} Gesundheit`, 'good');
                  else if (ev.type === 'rejected') app.toast(REJECT_TEXT[ev.reason], 'warn');
                  onChanged();
                  render();
                },
              },
              svgEl(resIcon('medicine', 16)),
              `Medizin nehmen (+${HEAL_AMOUNT})`,
            )
          : h('small', null, 'Du bist fit.'),
      ),
      s.weapons.length
        ? h(
            'ul',
            { class: 'char-weapons' },
            s.weapons.map((w) =>
              h(
                'li',
                { class: 'char-weapon' + (w === best ? ' active' : '') },
                h('span', { class: 'cw-name' }, WEAPONS[w.kind].name, w === best ? h('small', null, 'in der Hand') : null),
                h('span', { class: 'dur' }, h('span', { style: `width:${Math.min(100, (w.dur / WEAPONS[w.kind].dur) * 100)}%` })),
                h('span', { class: 'cw-cards' }, cardLine(WEAPON_CARDS[w.kind])),
              ),
            ),
          )
        : h('p', { class: 'char-note' }, 'Keine Waffe. Du kämpfst mit Fäusten, Tritten und Steinen.'),
      h('p', { class: 'char-note' }, svgEl(icon('sword', 14)), ' Im Kampf: ', cardLine(deckFor(s.weapons, s.inventory.medicine))),
      missing.length ? h('p', { class: 'char-note' }, svgEl(icon('wrench', 14)), ` Am Werktisch zu Hause: ${missing.map((w) => WEAPONS[w].name).join(', ')}`) : null,
    );
  };

  /** Mitte: deine Figur in 3D (zum Drehen), mit der Waffe in der Hand. */
  const figureColumn = (s: PlayerState, now: number) => {
    const stage = h('div', { class: 'char-stage' });
    const best = bestWeapon(s);
    const ex = exploredStats(s.explored);
    void import('../../base/figureView')
      .then((fv) => {
        if (!stage.isConnected || tab !== 'pack') return;
        dropFigure();
        figure = new fv.FigureView({ mode: 'stage', width: Math.max(160, stage.clientWidth), height: Math.max(200, stage.clientHeight) });
        figure.setLook(s.character.look);
        figure.holdWeapon(best?.kind ?? null);
        stage.append(figure.canvas);
        figure.start();
      })
      .catch(() => undefined);
    return h(
      'section',
      { class: 'char-col char-figure', 'aria-label': 'Deine Figur' },
      stage,
      h('p', { class: 'char-name' }, s.character.name),
      h('p', { class: 'char-sub' }, `Tag ${dayNumber(s, now)} · ${s.stats.searches} Orte · ${s.stats.kills} Gegner · ${ex.km2.toFixed(2).replace('.', ',')} km²`),
    );
  };

  /** Rechts: Vorräte und der Rucksack als Fächer; ein Fach antippen zeigt, was drinsteckt. */
  const packColumn = (s: PlayerState) => {
    const mats = MATERIAL_ORDER.filter((r) => (s.pack[r] ?? 0) > 0);
    const kram = KRAM_ORDER.filter((k) => (s.packKram[k] ?? 0) > 0);
    const detail = h('div', { class: 'char-detail' }, h('p', { class: 'char-note' }, mats.length || kram.length ? 'Tippe ein Fach an, um zu sehen, was es ist.' : 'Leer. Draußen findest du Kram und Rohstoffe: in Autos, Containern, Paketen und Schuppen.'));
    const slots: HTMLElement[] = [];
    const select = (el: HTMLElement, fill: () => HTMLElement[]) => {
      for (const x of slots) x.classList.remove('sel');
      el.classList.add('sel');
      clear(detail);
      detail.append(...fill());
    };
    for (const r of mats) {
      const el: HTMLElement = h(
        'button',
        { class: `slot rar-${RARITY[r]}`, type: 'button', title: RESOURCES[r].name, onclick: () => select(el, () => [h('b', null, RESOURCES[r].name), h('p', { class: 'char-note' }, RESOURCES[r].where ? `Findet man in: ${RESOURCES[r].where}` : 'Rohstoff zum Bauen.')]) },
        svgEl(resIcon(r, 26)),
        h('span', { class: 'slot-n' }, String(s.pack[r])),
      );
      slots.push(el);
    }
    for (const k of kram) {
      const el: HTMLElement = h(
        'button',
        { class: 'slot kram', type: 'button', title: KRAM[k].name, onclick: () => select(el, () => [h('b', null, KRAM[k].name), h('p', { class: 'char-note' }, KRAM[k].desc), h('span', { class: 'junk-parts' }, 'Enthält ', partsChips(k)), h('small', null, 'Zerlegen am Werktisch zu Hause')]) },
        thingThumb(k, 40),
        (s.packKram[k] ?? 0) > 1 ? h('span', { class: 'slot-n' }, String(s.packKram[k])) : null,
      );
      slots.push(el);
    }
    // Leere Fächer füllen das Raster auf (mindestens zwei Reihen)
    const free = Math.max(0, 12 - slots.length) + ((6 - ((slots.length + Math.max(0, 12 - slots.length)) % 6)) % 6);
    const empties = Array.from({ length: free }, () => h('span', { class: 'slot empty', 'aria-hidden': 'true' }));
    const lagerMats = MATERIAL_ORDER.reduce((a, r) => a + s.inventory[r], 0);
    const lagerKram = kramCount(s.kram);
    return h(
      'section',
      { class: 'char-col char-pack', 'aria-label': 'Rucksack' },
      h('h3', { class: 'char-head' }, 'Rucksack', h('small', null, `${slots.length} Fächer belegt · Vorräte immer dabei`)),
      h(
        'ul',
        { class: 'char-survival' },
        SURVIVAL_ORDER.map((r) => h('li', { title: RESOURCES[r].name, 'aria-label': `${RESOURCES[r].name}: ${s.inventory[r]}` }, svgEl(resIcon(r, 18)), h('b', null, String(s.inventory[r])))),
      ),
      h('div', { class: 'slot-grid' }, slots, empties),
      detail,
      h('p', { class: 'char-note lager' }, svgEl(icon('home', 14)), ` Zu Hause im Lager: ${lagerMats} Rohstoffe${lagerKram ? `, ${lagerKram} Kram` : ''}. ${packCount(s) ? 'Zu Hause auspacken, dann ist alles sicher.' : ''}`),
    );
  };

  // --- Fundbuch -----------------------------------------------------------------------
  /** Ortstypen: was du schon gefunden hast, und graue Umrisse mit Hinweis, wo es den Rest gibt. */
  const placesView = () => {
    const s = app.backend.current()!;
    const all = Object.keys(SPOT_KINDS) as SpotKind[];
    const normal = all.filter((k) => !SPECIAL_KINDS.includes(k));
    const have = all.filter((k) => s.places[k]).length;
    const specialFound = Object.keys(s.discovered).length;
    const tile = (k: SpotKind) => {
      const got = !!s.places[k];
      const name = SPOT_KINDS[k].names[0];
      return h(
        'li',
        { class: 'place' + (got ? ' got' : '') + (SPECIAL_KINDS.includes(k) ? ' special' : ''), title: got ? name : PLACE_WHERE[k] },
        h('span', { class: 'place-icon' }, svgEl(got ? spotIcon(k, 24) : icon('question', 24))),
        h('span', { class: 'place-name' }, got ? name : '???'),
        got ? null : h('small', null, PLACE_WHERE[k]),
      );
    };
    return h(
      'section',
      { class: 'places' },
      h('h3', { class: 'stock-head' }, 'Orte', h('small', null, `${have} von ${all.length} Ortstypen`)),
      h('ul', { class: 'place-grid' }, normal.map(tile)),
      h('h3', { class: 'stock-head' }, 'Besondere Orte', h('small', null, specialFound ? `${specialFound} entdeckt` : 'Achte auf Rauch, Licht und Funksignale')),
      h('ul', { class: 'place-grid' }, SPECIAL_KINDS.map(tile)),
    );
  };

  const bookView = () => {
    const s = app.backend.current()!;
    const found = COLLECTIBLE_ORDER.filter((c) => s.collectibles[c]).length;
    const memFound = MEMENTOS.filter((m) => s.collection[m.id]).length;
    const sets = SET_ORDER.map((id) => {
      const set = SETS[id];
      const have = set.items.filter((c) => s.collectibles[c]).length;
      const done = !!s.sets[id];
      return h(
        'section',
        { class: 'set-card' + (done ? ' done' : '') },
        h(
          'div',
          { class: 'set-head' },
          h('b', null, set.name),
          h('span', { class: 'set-count' }, done ? svgEl(icon('check', 16)) : null, `${have} / ${set.items.length}`),
        ),
        h(
          'ul',
          { class: 'set-items' },
          set.items.map((c) => {
            const got = !!s.collectibles[c];
            return h(
              'li',
              { class: got ? 'got' : '', title: got ? COLLECTIBLES[c].desc : whereCollectible(c) },
              thingThumb(c, 56, !got),
              h('span', { class: 'set-name' }, got ? COLLECTIBLES[c].name : '???'),
              h('small', null, got ? (collectiblePlaced(s, c) ? 'steht zu Hause' : 'im Lager') : whereCollectible(c)),
            );
          }),
        ),
        h(
          'p',
          { class: 'set-reward' },
          done ? 'Geschafft! ' : 'Komplett: ',
          `Bauplan ${blueprintName(set.blueprint)} + `,
          costChips(set.reward),
        ),
      );
    });
    return h(
      'div',
      { class: 'book' },
      h('p', { class: 'mem-count' }, `${found} von ${COLLECTIBLE_ORDER.length} Sammelstücken. Jedes gibt es nur einmal. Stell sie zu Hause auf, das macht es gemütlich.`),
      sets,
      placesView(),
      h('h3', { class: 'stock-head' }, 'Erinnerungsstücke', h('small', null, `${memFound} von ${MEMENTOS.length}`)),
      h(
        'ul',
        { class: 'mem-grid' },
        MEMENTOS.map((m) =>
          s.collection[m.id]
            ? h('li', { class: 'mem found' }, h('div', { class: 'mem-title' }, m.title), h('p', { class: 'mem-text' }, m.text))
            : h('li', { class: 'mem' }, h('div', { class: 'mem-title' }, '???'), h('p', { class: 'mem-text' }, 'Noch nicht gefunden')),
        ),
      ),
    );
  };

  const panel: HTMLElement = h(
    'div',
    { class: 'overlay pack-panel', role: 'dialog', 'aria-label': 'Charakter und Rucksack' },
    h(
      'div',
      { class: 'overlay-inner' },
      h(
        'header',
        { class: 'topbar pack-top' },
        tabs,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: onClose }, svgEl(icon('close'))),
      ),
      body,
    ),
  );
  host.append(panel);
  // Wird das Fenster entfernt (egal wie), die 3D-Figur freigeben
  const watch = new MutationObserver(() => {
    if (!panel.isConnected) {
      dropFigure();
      watch.disconnect();
    }
  });
  watch.observe(host, { childList: true });
  render();
  return panel;
}

export { itemsLine };

/** „3× Hebelhieb, 2× Ausweichen …“ */
function cardLine(cards: CardId[]): string {
  const n = new Map<CardId, number>();
  for (const c of cards) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n].map(([c, k]) => `${k}× ${CARDS[c].name}`).join(', ');
}
