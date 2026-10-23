// Charakterfenster: links Ausrüstung (Gesundheit, Plätze am Körper, Waffe), in der Mitte die Figur,
// rechts der Rucksack als Fächer. Dazu das Fundbuch (Orte, Sammelstücke, Sets, Erinnerungen).

import {
  PLACE_WHERE,
  SPECIAL_KINDS,
  CARDS,
  GEAR,
  GEAR_ORDER,
  GEAR_SLOTS,
  gearArmor,
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
  STYLE_HINT,
  STYLE_NAMES,
  STYLE_ORDER,
  type CardId,
  type CardStyle,
} from '../../core/content';
import { deckFor } from '../../core/tactics';
import { blueprintName } from '../../core/building';
import { battleWeapons, bestWeapon, collectiblePlaced, currentHealth, dayNumber, kramCount, packCount } from '../../core/rules';
import type { CollectibleId, GearId, GearSlot, KramId, PlayerState, SpotKind } from '../../core/types';
import type { App } from '../app';
import { clear, h, svgEl, type Child } from '../dom';
import { icon, resIcon, spotIcon } from '../icons';
import { REJECT_TEXT, SPOT_PLURAL } from '../texts';
import { exploredStats } from '../../core/explore';
import { costChips, itemsLine, partsChips, thingThumb } from './chips';
import { BOOK_ORDER, bookItem, CARD_ICON, cardFace, levelProgress, ROMAN, STYLE_ICON, styleMark, WEAPON_ICON, type BookKey } from '../cards';

export type PackTab = 'pack' | 'book' | 'gear' | 'cards';

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
  let figureRo: ResizeObserver | null = null;
  const dropFigure = () => {
    figureRo?.disconnect();
    figureRo = null;
    figure?.dispose();
    figure = null;
  };

  const tabBtn = (id: PackTab, label: string) => h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => ((tab = id), render()) }, h('span', { class: 'tab-plate' }, label));
  tabs.append(tabBtn('pack', 'Charakter'), tabBtn('cards', 'Karten'), tabBtn('book', 'Fundbuch'));

  const render = () => {
    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === tab)));
    dropFigure();
    clear(body);
    panel.classList.toggle('wide', tab === 'pack');
    if (tab === 'pack') body.append(charView());
    if (tab === 'book') body.append(bookView());
    if (tab === 'cards') body.append(cardsView());
    body.scrollTop = 0;
    panel.scrollTop = 0;
  };

  // --- Charakterfenster: links Ausrüstung, Mitte Figur, rechts Rucksack ----------------
  const charView = () => {
    const s = app.backend.current()!;
    const now = app.backend.now();
    return h('div', { class: 'char' }, gearColumn(s, now), figureColumn(s, now), packColumn(s));
  };

  /** Nach einer Aktion: Meldung zeigen, Karte und Fenster neu zeichnen. */
  const dispatch = async (a: Parameters<typeof app.backend.dispatch>[0]) => {
    const res = await app.backend.dispatch(a);
    const ev = res.events[0];
    if (ev?.type === 'rejected') app.toast(REJECT_TEXT[ev.reason], 'warn');
    onChanged();
    render();
  };

  /** Links: das Ausrüstungsheft. Plätze rund um die Gliederpuppe, darunter Gesundheit und der gewählte Platz. */
  let gearSel: GearSlot | 'weapon' = 'weapon';
  const gearColumn = (s: PlayerState, now: number) => {
    const hp = currentHealth(s, now);
    const best = bestWeapon(s);
    const hpSegs = h('span', { class: 'hp-bar me-hp' });
    for (let i = 0; i < MAX_HEALTH; i++) hpSegs.append(h('span', { class: i < hp ? 'on' : '' }));
    const armor = gearArmor(s.gear.worn);
    const detail = h('div', { class: 'gear-detail' });
    const sheet = h('div', { class: 'gear-sheet', role: 'listbox', 'aria-label': 'Ausrüstungsplätze' });
    const slotName = (slot: GearSlot | 'weapon') => (slot === 'weapon' ? 'Waffe' : GEAR_SLOTS[slot].name);
    const wornName = (slot: GearSlot | 'weapon') => (slot === 'weapon' ? (best ? WEAPONS[best.kind].name : null) : s.gear.worn[slot] ? GEAR[s.gear.worn[slot]!].name : null);
    const paint = () => {
      clear(sheet);
      sheet.dataset.sel = gearSel;
      sheet.append(h('div', { class: 'gear-figure', 'aria-hidden': 'true', html: bodySketch() }), h('span', { class: 'gear-clip', 'aria-hidden': 'true', html: PAPERCLIP }));
      [SHEET_LEFT, SHEET_RIGHT].forEach((col, c) =>
        col.forEach((slot, row) => {
          const worn = wornName(slot);
          const on = gearSel === slot;
          sheet.append(
            h(
              'button',
              {
                class: 'gear-slot' + (worn ? '' : ' empty') + (on ? ' sel' : ''),
                type: 'button',
                role: 'option',
                'aria-selected': String(on),
                'aria-label': `${slotName(slot)}: ${worn ?? 'leer'}`,
                style: `grid-area:${row + 1} / ${c ? 3 : 1}`,
                onclick: () => {
                  gearSel = slot;
                  paint();
                },
              },
              h('small', null, slotName(slot)),
              svgEl(icon(SLOT_ICON[slot], 24), 'gear-ico'),
              worn ? h('b', null, worn) : null,
              on ? svgEl(icon('check', 15), 'gear-check') : null,
            ),
          );
        }),
      );
      clear(detail);
      const d = gearSel === 'weapon' ? weaponDetail(s) : slotDetail(s, gearSel);
      detail.append(h('h4', { class: 'gear-detail-head' }, slotName(gearSel)), ...d.cards);
      if (d.notes.length) detail.append(h('div', { class: 'char-memo' }, h('b', null, 'Notizen'), d.notes.map((n) => h('p', null, n))));
    };
    paint();
    return h(
      'section',
      { class: 'char-col char-gear', 'aria-label': 'Ausrüstung' },
      h(
        'div',
        { class: 'notebook' },
        h('h3', { class: 'char-head' }, 'Ausrüstung', armor ? h('small', { class: 'armor-chip' }, svgEl(icon('shield', 13)), ` Abwehr +${armor} im Kampf`) : null),
        sheet,
        h(
          'div',
          { class: 'char-health' },
          h(
            'div',
            { class: 'hp-head' },
            h('span', { class: 'hp-title' }, 'Gesundheit ', h('span', { class: 'hp-num' + (hp <= 3 ? ' low' : '') }, `(${hp}/${MAX_HEALTH})`)),
            hp >= MAX_HEALTH ? h('small', null, 'Du bist fit.') : null,
          ),
          h('span', { class: 'hp-frame' }, hpSegs),
          hp < MAX_HEALTH
            ? h(
                'button',
                {
                  class: 'btn small heal-btn',
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
            : null,
        ),
        detail,
      ),
    );
  };

  /** Was ein Teil kann. Was erst später zählt, steht grau mit „bald“ dabei. */
  const gearEffects = (id: GearId) => {
    const d = GEAR[id];
    const out: HTMLElement[] = [];
    if (d.armor) out.push(h('span', { class: 'gear-eff' }, svgEl(icon('shield', 12)), `Abwehr +${d.armor}`));
    if (d.warmth) out.push(h('span', { class: 'gear-eff later' }, `Wärme +${d.warmth}`, h('small', null, 'bald')));
    if (d.filter) out.push(h('span', { class: 'gear-eff later' }, d.filter > 1 ? 'Atemschutz, lange' : 'Atemschutz, kurz', h('small', null, 'bald')));
    if (d.packSlots) out.push(h('span', { class: 'gear-eff later' }, `${d.packSlots} Fächer`, h('small', null, 'bald')));
    return out.length ? h('span', { class: 'gear-effs' }, out) : null;
  };

  /** Ein Platz am Körper: was du dafür hast (Karten) und Hinweise (Notizzettel). */
  const slotDetail = (s: PlayerState, slot: GearSlot): { cards: HTMLElement[]; notes: Child[] } => {
    const have = GEAR_ORDER.filter((id) => GEAR[id].slot === slot && s.gear.owned[id]);
    const worn = s.gear.worn[slot];
    const missing = GEAR_ORDER.filter((id) => GEAR[id].slot === slot && !s.gear.owned[id]).length;
    const notes: Child[] = [];
    if (!have.length) notes.push('Noch nichts gefunden.');
    if (missing) notes.push(`Noch ${missing} ${missing === 1 ? 'Teil' : 'Teile'} für diesen Platz zu finden, beim Durchsuchen passender Orte.`);
    return {
      cards: have.length
        ? [
            h(
              'ul',
              { class: 'gear-opts' },
              have.map((id) =>
                h(
                  'li',
                  { class: 'gear-opt' + (worn === id ? ' on' : '') },
                  h('span', { class: 'gear-opt-text' }, h('b', null, GEAR[id].name, worn === id ? h('small', null, 'angezogen') : null), h('small', null, GEAR[id].desc), gearEffects(id)),
                  worn === id
                    ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => void dispatch({ type: 'unequip', slot }) }, 'Ablegen')
                    : h('button', { class: 'btn small', type: 'button', onclick: () => void dispatch({ type: 'equip', gear: id }) }, 'Anziehen'),
                ),
              ),
            ),
          ]
        : [],
      notes,
    };
  };

  const weaponDetail = (s: PlayerState): { cards: HTMLElement[]; notes: Child[] } => {
    const best = bestWeapon(s);
    const missing = WEAPON_ORDER.filter((w) => !s.weapons.some((x) => x.kind === w));
    const notes: Child[] = [];
    if (!s.weapons.length) notes.push('Keine Waffe. Du kämpfst mit Fäusten, Tritten und Steinen.');
    const fight = battleWeapons(s);
    notes.push([svgEl(icon('fist', 16)), ` Im Kampf${fight.length ? ` (${fight.map((w) => WEAPONS[w.kind].name).join(' und ')})` : ''}: `, cardLine(deckFor(fight, s.inventory.medicine))]);
    notes.push('Mit in den Kampf gehen eine Nahkampf- und eine Fernkampfwaffe. Welche, wählst du zu Hause im Lager; sonst nimmst du die stärkste.');
    if (missing.length) notes.push([svgEl(icon('wrench', 16)), ` Am Werktisch zu Hause: ${missing.map((w) => WEAPONS[w].name).join(', ')}`]);
    return {
      cards: s.weapons.length
        ? [
            h(
              'ul',
              { class: 'char-weapons' },
              s.weapons.map((w) => {
                const left = Math.min(100, (w.dur / WEAPONS[w.kind].dur) * 100);
                return h(
                  'li',
                  { class: 'char-weapon' + (w === best ? ' active' : '') },
                  h('span', { class: 'cw-name' }, WEAPONS[w.kind].name, w === best ? h('small', null, 'in der Hand') : null),
                  h(
                    'span',
                    { class: 'cw-wear', title: `Haltbarkeit ${w.dur} von ${WEAPONS[w.kind].dur}` },
                    svgEl(icon(WEAPON_ICON[w.kind], 22)),
                    h('span', { class: 'dur', role: 'meter', 'aria-label': 'Haltbarkeit', 'aria-valuemin': '0', 'aria-valuemax': String(WEAPONS[w.kind].dur), 'aria-valuenow': String(w.dur) }, h('span', { style: `width:${left}%` })),
                  ),
                  h('span', { class: 'cw-cards' }, cardLine(WEAPON_CARDS[w.kind])),
                );
              }),
            ),
          ]
        : [],
      notes,
    };
  };

  /** Mitte: deine Figur in 3D (zum Drehen) auf dem Sockel, mit der Waffe in der Hand. Darunter das Namensschild. */
  const figureColumn = (s: PlayerState, now: number) => {
    const stage = h(
      'div',
      { class: 'char-stage' },
      h('span', { class: 'char-glow', 'aria-hidden': 'true' }),
      h(
        'span',
        { class: 'char-sparks', 'aria-hidden': 'true' },
        // Funken: feste Pseudo-Zufallswerte, damit jedes Öffnen gleich aussieht
        Array.from({ length: 16 }, (_, i) => h('i', { style: `--x:${18 + ((i * 37) % 64)}%;--y:${10 + ((i * 23) % 50)}%;--d:-${((i * 1.37) % 7).toFixed(2)}s;--t:${6 + ((i * 7) % 5)}s;--s:${1.5 + (i % 3) * 0.75}px` })),
      ),
    );
    const best = bestWeapon(s);
    const ex = exploredStats(s.explored);
    void import('../../base/figureView')
      .then((fv) => {
        if (!stage.isConnected || tab !== 'pack') return;
        dropFigure();
        const f = new fv.FigureView({ mode: 'stage', width: Math.max(160, stage.clientWidth), height: Math.max(200, stage.clientHeight) });
        figure = f;
        f.setLook(s.character.look);
        f.holdWeapon(best?.kind ?? null);
        stage.append(f.canvas);
        f.start();
        // Wird das Fenster größer oder kleiner (Drehen, Fenstergröße), wächst die Bühne mit
        figureRo = new ResizeObserver(() => f.setSize(stage.clientWidth, stage.clientHeight));
        figureRo.observe(stage);
      })
      .catch(() => undefined);
    return h(
      'section',
      { class: 'char-col char-figure', 'aria-label': 'Deine Figur' },
      stage,
      h(
        'div',
        { class: 'char-plate' },
        h('p', { class: 'char-name' }, s.character.name),
        h('p', { class: 'char-sub' }, `Tag ${dayNumber(s, now)} • ${s.stats.searches} Orte • ${s.stats.kills} Gegner • ${ex.km2.toFixed(2).replace('.', ',')} km²`),
      ),
    );
  };

  /** Rechts: Vorräte und der Rucksack als Fächer; ein Fach antippen zeigt, was drinsteckt. */
  const packColumn = (s: PlayerState) => {
    const mats = MATERIAL_ORDER.filter((r) => (s.pack[r] ?? 0) > 0);
    const kram = KRAM_ORDER.filter((k) => (s.packKram[k] ?? 0) > 0);
    const detail = h('div', { class: 'char-detail', 'aria-live': 'polite' }, h('p', { class: 'char-note' }, mats.length || kram.length ? 'Tippe ein Fach an, um zu sehen, was es ist.' : 'Leer. Draußen findest du Kram und Rohstoffe: in Autos, Containern, Paketen und Schuppen.'));
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
    // Leere Fächer füllen das Raster auf: mindestens drei Reihen zu je vier
    const free = Math.max(12, Math.ceil(slots.length / 4) * 4) - slots.length;
    const empties = Array.from({ length: free }, () => h('span', { class: 'slot empty', 'aria-hidden': 'true' }));
    const lagerMats = MATERIAL_ORDER.reduce((a, r) => a + s.inventory[r], 0);
    const lagerKram = kramCount(s.kram);
    return h(
      'section',
      { class: 'char-col char-pack', 'aria-label': 'Rucksack' },
      h('h3', { class: 'char-head' }, 'Rucksack', h('small', null, `${slots.length} Fächer belegt · Vorräte immer dabei`)),
      h(
        'div',
        { class: 'pack-plate' },
        h(
          'ul',
          { class: 'char-survival' },
          SURVIVAL_ORDER.map((r) => h('li', { title: RESOURCES[r].name, 'aria-label': `${RESOURCES[r].name}: ${s.inventory[r]}`, 'data-res': r }, svgEl(resIcon(r, 26)), h('b', null, String(s.inventory[r])))),
        ),
        h('div', { class: 'slot-well' }, h('div', { class: 'slot-grid' }, slots, empties)),
        packCardsRow(s),
        h('div', { class: 'char-detail-wrap' }, detail),
        h('p', { class: 'char-note lager' }, svgEl(icon('home', 14)), ` Zu Hause im Lager: ${lagerMats} Rohstoffe${lagerKram ? `, ${lagerKram} Kram` : ''}. ${packCount(s) ? 'Zu Hause auspacken, dann ist alles sicher.' : ''}`),
      ),
    );
  };

  /** Einmal-Karten im Rucksack (zählen nicht als Fach, passen in jede Jackentasche). */
  const packCardsRow = (s: PlayerState) => {
    const ids = (Object.keys(s.packCards) as CardId[]).filter((k) => (s.packCards[k] ?? 0) > 0);
    if (!ids.length) return null;
    return h(
      'button',
      { class: 'pack-cards', type: 'button', title: 'Sammelbuch öffnen', onclick: () => ((tab = 'cards'), render()) },
      h('small', null, 'Karten dabei'),
      ids.map((k) => h('span', { class: `pc rar-${CARDS[k].rarity ?? 'common'}`, title: CARDS[k].name }, svgEl(icon(CARD_ICON[k], 16)), h('b', null, String(s.packCards[k])))),
    );
  };

  // --- Sammelbuch: Karten und Waffen ---------------------------------------------------
  let cardSel: BookKey | null = null;
  /** Sammelbuch nach Stil filtern (null = alle). */
  let styleSel: CardStyle | null = null;
  const cardsView = () => {
    const s = app.backend.current()!;
    const have = BOOK_ORDER.filter((k) => s.book[k]).length;
    const detail = h('div', { class: 'cbook-detail', 'aria-live': 'polite' });
    const count = (k: BookKey) => {
      if (k.startsWith('w:')) return 0;
      const id = k as CardId;
      return (s.packCards[id] ?? 0) + (s.stash[id] ?? 0);
    };
    const level = (k: BookKey) => (bookItem(k).kind === 'skill' ? levelProgress(s.book[k]?.n ?? 0, CARDS[k as CardId].rarity).level : 1);
    const showDetail = (k: BookKey) => {
      cardSel = k;
      for (const b of grid.querySelectorAll('.cbook-cell')) b.classList.toggle('sel', (b as HTMLElement).dataset.key === k);
      clear(detail);
      const it = bookItem(k);
      const e = s.book[k];
      if (!e) {
        detail.append(cardFace(k, { locked: true, big: true }), h('p', { class: 'char-note' }, `Noch nicht gefunden. Zu finden: ${it.where}. Und in Sichtungen, die auf der Karte auftauchen.`));
        return;
      }
      const lines: Child[] = [];
      if (it.kind === 'once') {
        const id = k as CardId;
        lines.push(`Dabei: ${s.packCards[id] ?? 0} · Im Lager: ${s.stash[id] ?? 0} · ${s.loadout.pouch.includes(id) ? 'In der Tasche' : 'Nicht in der Tasche'}`);
        lines.push('Im Kampf liegen Einmal-Karten in der Tasche: 3 Sorten, je bis zu 3 Stück, jederzeit spielbar. Welche Sorten, wählst du zu Hause im Lager. Gespielt sind sie weg, und wirst du niedergeschlagen, ist weg, was du dabeihattest.');
        if (CARDS[id].craft) lines.push(['Am Werktisch zu bauen: ', costChips(CARDS[id].craft!)]);
      } else if (it.kind === 'skill') {
        const p = levelProgress(e.n, CARDS[k as CardId].rarity);
        lines.push(`Stufe ${ROMAN[p.level]} · ${e.n} gefunden${p.next ? ` · Stufe ${ROMAN[p.level + 1]} ab ${p.next}` : ' · höchste Stufe'}`);
        const on = s.loadout.skills.includes(k as CardId);
        lines.push(
          on
            ? CARDS[k as CardId].passive
              ? 'Dabei: wirkt von selbst, in jedem Kampf.'
              : 'Dabei: liegt in jedem Kampf in deinem Stapel.'
            : 'Nicht dabei. Zu Hause im Lager wählst du 4 Fähigkeiten für den Kampf.',
        );
      } else {
        const w = it.weapon!;
        const own = s.weapons.find((x) => x.kind === w);
        lines.push(own ? `Haltbarkeit ${own.dur} von ${WEAPONS[w].dur}. Findest du sie nochmal, ist sie wieder wie neu.` : 'Kaputt gegangen. Findest du sie nochmal, hast du sie wieder.');
      }
      lines.push(`Fundorte: ${it.where}`);
      // Stil: Was passt dazu?
      if (it.style) {
        const mates = BOOK_ORDER.filter((x) => x !== k && bookItem(x).style === it.style).map((x) => (s.book[x] ? bookItem(x).name : null)).filter(Boolean);
        lines.push([styleMark(it.style, 'cbook-style', 13), ` Stil ${STYLE_NAMES[it.style]}: ${STYLE_HINT[it.style]}`, mates.length ? ` Passt gut zu: ${mates.join(', ')}.` : '']);
      } else lines.push('Ohne Stil: passt zu allem.');
      detail.append(cardFace(k, { level: level(k), shiny: e.shiny, big: true }), h('div', { class: 'cbook-lines' }, lines.map((l) => h('p', { class: 'char-note' }, l))));
    };
    const section = (title: string, keys: BookKey[]) =>
      h(
        'section',
        { class: 'cbook-sec' },
        h('h3', { class: 'stock-head' }, title, h('small', null, `${keys.filter((k) => s.book[k]).length} von ${keys.length}`)),
        h(
          'div',
          { class: 'cbook-grid' },
          keys.map((k) =>
            h(
              'button',
              { class: 'cbook-cell', type: 'button', 'data-key': k, 'aria-label': s.book[k] ? bookItem(k).name : 'Noch nicht gefunden', onclick: () => showDetail(k) },
              cardFace(k, { locked: !s.book[k], level: level(k), count: count(k), shiny: s.book[k]?.shiny }),
            ),
          ),
        ),
      );
    const shown = BOOK_ORDER.filter((k) => !styleSel || bookItem(k).style === styleSel);
    const once = shown.filter((k) => bookItem(k).kind === 'once');
    const weapons = shown.filter((k) => bookItem(k).kind === 'weapon');
    const skills = shown.filter((k) => bookItem(k).kind === 'skill');
    const grid = h('div', { class: 'cbook-main' }, once.length ? section('Einmal-Karten', once) : null, weapons.length ? section('Waffen zum Finden', weapons) : null, skills.length ? section('Fähigkeiten', skills) : null);
    // Filter nach Stil
    const filters = h(
      'div',
      { class: 'cbook-filters', role: 'tablist', 'aria-label': 'Nach Stil filtern' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(!styleSel), onclick: () => ((styleSel = null), render()) }, 'Alle'),
      STYLE_ORDER.map((st) =>
        h(
          'button',
          { type: 'button', role: 'tab', class: `st-${st}`, 'aria-selected': String(styleSel === st), title: STYLE_HINT[st], onclick: () => ((styleSel = st), render()) },
          svgEl(icon(STYLE_ICON[st], 14)),
          STYLE_NAMES[st],
        ),
      ),
    );
    const first = cardSel && shown.includes(cardSel) ? cardSel : (shown.find((k) => s.book[k]) ?? shown[0] ?? BOOK_ORDER[0]);
    const view = h(
      'div',
      { class: 'cbook' },
      h('p', { class: 'mem-count' }, `${have} von ${BOOK_ORDER.length} gesammelt. Alle 10 Minuten taucht in der Gegend etwas Neues auf: Achte auf Sichtungen auf der Karte.`),
      filters,
      h('div', { class: 'cbook-wrap' }, grid, detail),
    );
    showDetail(first);
    return view;
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
        h('button', { class: 'iconbtn pack-close', type: 'button', 'aria-label': 'Schließen', onclick: onClose }, svgEl(icon('close'))),
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

// --- Ausrüstungsblatt -------------------------------------------------------------------

const SLOT_ICON: Record<GearSlot | 'weapon', string> = { head: 'gHead', face: 'gFace', body: 'cloth', hands: 'gHands', legs: 'gLegs', feet: 'gFeet', back: 'backpack', weapon: 'crowbar' };
/** Plätze am Blatt: links Kopf bis Hand (Waffe), rechts Rücken bis Füße. */
const SHEET_LEFT: (GearSlot | 'weapon')[] = ['head', 'face', 'body', 'weapon'];
const SHEET_RIGHT: (GearSlot | 'weapon')[] = ['back', 'hands', 'legs', 'feet'];

/** Strichzeichnung fürs Ausrüstungsblatt: eine Gliederpuppe (viewBox 0 0 88 240), dazu gestrichelte
 *  Linien zu den Plätzen. Die Linien laufen nach außen unter die Kacheln (Zeilenmitten bei 30, 90, 150, 210). */
const BODY_SKETCH = {
  mesh: 'M36.8 10Q44 11.6 51.2 10M34.6 14.5Q44 16.1 53.4 14.5M34 19Q44 20.6 54 19M34.6 23.5Q44 25.1 53.4 23.5M36.8 28Q44 29.6 51.2 28M44 6V32M44 6C39.5 9 38.5 15 38.5 19S39.5 29 44 32M44 6C48.5 9 49.5 15 49.5 19S48.5 29 44 32M26 62Q44 64.4 62 62M26.8 70Q44 72.4 61.2 70M27.4 78Q44 80.4 60.6 78M28 86Q44 88.4 60 86M28.6 94Q44 96.4 59.4 94M28 102Q44 104.4 60 102M27 110Q44 112.4 61 110M23.8 47Q44 50 64.2 47M27.8 116Q44 119.5 60.2 116M44 38V123.5M33.9 41C34 44.2 33.9 51.8 34.1 60C34.4 68.2 35.3 80.7 35.5 90C35.6 99.3 35.1 111.7 35 116M54.1 41C54 44.2 54.1 51.8 53.9 60C53.6 68.2 52.7 80.7 52.5 90C52.4 99.3 52.9 111.7 53 116M25.9 128Q34.7 129.6 43.6 128M44.4 128Q53.3 129.6 62.1 128M26.1 140Q34.3 141.6 42.4 140M45.6 140Q53.7 141.6 61.9 140M27.1 152Q34.4 153.6 41.8 152M46.2 152Q53.6 153.6 60.9 152M28.1 164Q34.6 165.6 41.1 164M46.9 164Q53.4 165.6 59.9 164M28.9 176Q34.7 177.6 40.6 176M47.4 176Q53.3 177.6 59.1 176M29.1 188Q34.7 189.6 40.3 188M47.7 188Q53.3 189.6 58.9 188M30 200Q35.1 201.6 40.2 200M47.8 200Q52.9 201.6 58 200M31.2 212Q35.8 213.6 40.3 212M47.7 212Q52.2 213.6 56.8 212M32 222Q36.3 223.6 40.5 222M47.5 222Q51.7 223.6 56 222M33.9 120C34 125 34.3 140.7 34.4 150C34.5 159.3 34.4 167.7 34.6 176C34.8 184.3 35.4 192 35.7 200C36 208 36.5 220 36.6 224M54.1 120C54 125 53.7 140.7 53.6 150C53.5 159.3 53.6 167.7 53.4 176C53.2 184.3 52.6 192 52.3 200C52 208 51.5 220 51.4 224M16.8 60Q21.1 61.2 25.3 60M62.7 60Q66.9 61.2 71.2 60M15.8 70Q19.7 71.2 23.6 70M64.4 70Q68.3 71.2 72.2 70M15 80Q18.7 81.2 22.4 80M65.6 80Q69.3 81.2 73 80M14 90Q17.5 91.2 21 90M67 90Q70.5 91.2 74 90M12.6 100Q16 101.2 19.4 100M68.6 100Q72 101.2 75.4 100M11.1 110Q14.5 111.2 17.9 110M70.1 110Q73.5 111.2 76.9 110M9.5 120Q13.1 121.2 16.7 120M71.3 120Q74.9 121.2 78.5 120M19.9 50C19.8 53.3 19.3 63.3 18.9 70C18.6 76.7 18.5 83.3 17.8 90C17 96.7 15.3 104 14.4 110C13.6 116 12.9 123.3 12.6 126M68.1 50C68.2 53.3 68.7 63.3 69.1 70C69.4 76.7 69.5 83.3 70.2 90C71 96.7 72.7 104 73.6 110C74.4 116 75.1 123.3 75.4 126',
  outline: 'M39 32C38.8 33.1 39.7 36.9 38 38.5C36.2 40.1 31.1 40.3 28.3 41.5C25.5 42.7 22.8 43.6 21 45.5C19.2 47.4 18.4 49.2 17.6 53C16.7 56.8 16.5 62.2 16 68C15.5 73.8 15 82 14.3 88C13.7 94 12.8 99.2 12.1 104C11.4 108.8 10.5 113.2 10 117C9.4 120.8 8.7 124.1 8.6 127C8.5 129.9 8.9 132.6 9.5 134.5C10.1 136.4 11.7 137.8 12.2 138.5C12.7 138.1 14.6 137.6 15.3 136C16 134.4 16.2 131.7 16.4 129C16.7 126.3 16.3 124.2 16.7 120C17 115.8 17.9 109.3 18.7 104C19.5 98.7 20.6 93.7 21.4 88C22.2 82.3 22.9 75 23.6 70C24.3 65 25.3 60 25.6 58C25.8 60 26.2 63.7 26.8 70C27.3 76.3 28.8 88.7 28.8 96C28.7 103.3 27.1 107.7 26.5 114C26 120.3 25.3 124.3 25.6 134C26 143.7 28.2 162.3 28.8 172C29.4 181.7 28.7 183.8 29.2 192C29.8 200.2 31.8 215 32.1 221C32.5 227 31.8 225.9 31.2 228C30.7 230.1 29.4 232.6 29 233.5C30.6 236 30.6 236 41.5 236L41.3 229C41.2 227.7 40.6 226.5 40.4 221C40.2 215.5 40.2 204.2 40.2 196C40.2 187.8 40.3 181.3 40.6 172C41 162.7 41.9 148.1 42.4 140C43 131.9 43.7 126.2 44 123.5M49 32C49.2 33.1 48.3 36.9 50 38.5C51.8 40.1 56.9 40.3 59.7 41.5C62.5 42.7 65.2 43.6 67 45.5C68.8 47.4 69.6 49.2 70.4 53C71.3 56.8 71.5 62.2 72 68C72.5 73.8 73 82 73.7 88C74.3 94 75.2 99.2 75.9 104C76.6 108.8 77.5 113.2 78 117C78.6 120.8 79.3 124.1 79.4 127C79.5 129.9 79.1 132.6 78.5 134.5C77.9 136.4 76.3 137.8 75.8 138.5C75.3 138.1 73.4 137.6 72.7 136C72 134.4 71.8 131.7 71.6 129C71.3 126.3 71.7 124.2 71.3 120C71 115.8 70.1 109.3 69.3 104C68.5 98.7 67.4 93.7 66.6 88C65.8 82.3 65.1 75 64.4 70C63.7 65 62.7 60 62.4 58C62.2 60 61.8 63.7 61.2 70C60.7 76.3 59.2 88.7 59.2 96C59.3 103.3 60.9 107.7 61.5 114C62 120.3 62.7 124.3 62.4 134C62 143.7 59.8 162.3 59.2 172C58.6 181.7 59.3 183.8 58.8 192C58.2 200.2 56.2 215 55.9 221C55.5 227 56.2 225.9 56.8 228C57.3 230.1 58.6 232.6 59 233.5C57.4 236 57.4 236 46.5 236L46.7 229C46.8 227.7 47.4 226.5 47.6 221C47.8 215.5 47.8 204.2 47.8 196C47.8 187.8 47.7 181.3 47.4 172C47 162.7 46.1 148.1 45.6 140C45 131.9 44.3 126.2 44 123.5M44 6C49.8 6 54 11.4 54 19S50 32 44 32 34 26.6 34 19 38.2 6 44 6Z',
  lines: {
    head: 'M-34 30L-10 30L-10 12L37.8 12',
    face: 'M-34 90L-3 90L-3 24L39.5 24',
    body: 'M-34 150L4.5 150L4.5 72L35 72',
    weapon: 'M-34 210L21 210L21 132L13.5 132',
    back: 'M122 30L80 30L80 47L64.2 47',
    hands: 'M122 90L85 90L85 131L74.6 131',
    legs: 'M122 150L66 150L66 160L53 160',
    feet: 'M122 210L63 210L63 230L53 230',
  } as Record<GearSlot | 'weapon', string>,
  dots: {
    head: [37.8, 12],
    face: [39.5, 24],
    body: [35, 72],
    weapon: [13.5, 132],
    back: [64.2, 47],
    hands: [74.6, 131],
    legs: [53, 160],
    feet: [53, 230],
  } as Record<GearSlot | 'weapon', [number, number]>,
};

function bodySketch(): string {
  const lines = (Object.keys(BODY_SKETCH.lines) as (GearSlot | 'weapon')[])
    .map((k) => `<path class="gb-lead" data-slot="${k}" d="${BODY_SKETCH.lines[k]}"/><circle class="gb-dot" data-slot="${k}" cx="${BODY_SKETCH.dots[k][0]}" cy="${BODY_SKETCH.dots[k][1]}" r="1.5"/>`)
    .join('');
  return `<svg viewBox="0 0 88 240" preserveAspectRatio="xMidYMid meet"><path class="gb-mesh" d="${BODY_SKETCH.mesh}"/><path class="gb-body" d="${BODY_SKETCH.outline}"/>${lines}</svg>`;
}

/** Büroklammer aus Draht (oben rechts am Blatt). */
const PAPERCLIP =
  '<svg viewBox="0 0 24 64" width="18" height="48"><path d="M8 50V12a6 6 0 0 1 12 0v40a8 8 0 0 1-16 0V18" fill="none" stroke="#7a4a2c" stroke-width="2.6" stroke-linecap="round"/><path d="M8 50V12a6 6 0 0 1 12 0v40a8 8 0 0 1-16 0V18" fill="none" stroke="#c98a5c" stroke-width="1" stroke-linecap="round" transform="translate(-.5 -.5)"/></svg>';
