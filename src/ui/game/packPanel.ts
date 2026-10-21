// Der Rucksack: was du dabeihast, dein Fundbuch (Sammelstücke, Sets, Erinnerungen)
// und deine Ausrüstung (Gesundheit, Waffen).

import {
  CARDS,
  COLLECTIBLE_ORDER,
  COLLECTIBLES,
  HEAL_AMOUNT,
  KRAM,
  KRAM_ORDER,
  MATERIAL_ORDER,
  MAX_HEALTH,
  MEMENTOS,
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
import { bestWeapon, collectiblePlaced, currentHealth, dayNumber, kramCount, nextHealthIn, packCount } from '../../core/rules';
import type { CollectibleId, KramId, SpotKind } from '../../core/types';
import type { App } from '../app';
import { clear, h, svgEl } from '../dom';
import { icon, resIcon } from '../icons';
import { REJECT_TEXT, SPOT_PLURAL } from '../texts';
import { exploredStats } from '../../core/explore';
import { formatWait } from './spotSheet';
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
  let tab: PackTab = startTab;
  const body = h('div', { class: 'pack-body' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });

  const tabBtn = (id: PackTab, label: string) => h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => ((tab = id), render()) }, label);
  tabs.append(tabBtn('pack', 'Rucksack'), tabBtn('book', 'Fundbuch'), tabBtn('gear', 'Ausrüstung'));

  const render = () => {
    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === tab)));
    clear(body);
    if (tab === 'pack') body.append(packView());
    if (tab === 'book') body.append(bookView());
    if (tab === 'gear') body.append(gearView());
    body.scrollTop = 0;
  };

  // --- Rucksack -----------------------------------------------------------------------
  const packView = () => {
    const s = app.backend.current()!;
    const mats = MATERIAL_ORDER.filter((r) => (s.pack[r] ?? 0) > 0);
    const kram = KRAM_ORDER.filter((k) => (s.packKram[k] ?? 0) > 0);
    const lagerMats = MATERIAL_ORDER.reduce((a, r) => a + s.inventory[r], 0);
    const lagerKram = kramCount(s.kram);
    return h(
      'div',
      { class: 'stock' },
      h('h3', { class: 'stock-head' }, 'Im Rucksack', h('small', null, packCount(s) ? 'Zu Hause auspacken, dann liegt es sicher im Lager' : '')),
      mats.length
        ? h(
            'ul',
            { class: 'stock-list mats' },
            mats.map((r) =>
              h('li', null, svgEl(resIcon(r, 24)), h('span', { class: 'stock-name' }, RESOURCES[r].name), h('span', { class: 'stock-num' }, String(s.pack[r]))),
            ),
          )
        : null,
      kram.length ? h('ul', { class: 'junk-list' }, kram.map((k) => kramRow(k, s.packKram[k] ?? 0))) : null,
      !mats.length && !kram.length
        ? h('p', { class: 'stock-empty' }, 'Leer. Draußen findest du Rohstoffe und Kram: in Autos, Containern, Packstationen und Schuppen.')
        : null,
      h('h3', { class: 'stock-head' }, 'Zum Überleben', h('small', null, 'Hast du immer dabei')),
      h(
        'ul',
        { class: 'stock-list survival' },
        SURVIVAL_ORDER.map((r) => h('li', { title: RESOURCES[r].name }, svgEl(resIcon(r, 26)), h('span', { class: 'stock-name' }, RESOURCES[r].name), h('span', { class: 'stock-num' }, String(s.inventory[r])))),
      ),
      h(
        'p',
        { class: 'stock-lager' },
        svgEl(icon('home', 16)),
        `Im Lager zu Hause: ${lagerMats} Rohstoffe${lagerKram ? `, ${lagerKram} Kram` : ''}. Nichts davon kann unterwegs verloren gehen.`,
      ),
      h(
        'dl',
        { class: 'stats' },
        h('dt', null, 'Unterwegs seit'),
        h('dd', null, `Tag ${dayNumber(s, app.backend.now())}`),
        h('dt', null, 'Durchsuchte Orte'),
        h('dd', null, String(s.stats.searches)),
        h('dt', null, 'Erledigte Gegner'),
        h('dd', null, String(s.stats.kills)),
        h('dt', null, 'Erkundete Fläche'),
        h('dd', null, `${exploredStats(s.explored).km2.toFixed(2).replace('.', ',')} km²`),
        h('dt', null, 'Sektoren erkundet / gesichert'),
        h('dd', null, `${Object.values(s.sectors).filter((l) => l >= 1).length} / ${Object.values(s.sectors).filter((l) => l >= 2).length}`),
      ),
    );
  };

  // --- Fundbuch -----------------------------------------------------------------------
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

  // --- Ausrüstung ---------------------------------------------------------------------
  const gearView = () => {
    const s = app.backend.current()!;
    const now = app.backend.now();
    const hp = currentHealth(s, now);
    const best = bestWeapon(s);
    const hpSegs = h('span', { class: 'hp-bar me-hp big' });
    for (let i = 0; i < MAX_HEALTH; i++) hpSegs.append(h('span', { class: i < hp ? 'on' : '' }));
    const missing = WEAPON_ORDER.filter((w) => !s.weapons.some((x) => x.kind === w));
    return h(
      'div',
      { class: 'gear' },
      h(
        'section',
        { class: 'gear-health' },
        h('div', { class: 'gear-row' }, h('span', { class: 'gear-label' }, 'Gesundheit'), h('b', null, `${hp} / ${MAX_HEALTH}`)),
        hpSegs,
        h('p', { class: 'mod-desc' }, hp < MAX_HEALTH ? `Erholt sich von selbst, nächster Punkt in ${formatWait(nextHealthIn(s, now))}` : 'Du bist fit.'),
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            disabled: hp >= MAX_HEALTH || s.inventory.medicine < 1,
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
        ),
      ),
      h('h3', { class: 'gear-head' }, 'Deine Waffen'),
      s.weapons.length
        ? h(
            'ul',
            { class: 'weapons' },
            s.weapons.map((w) =>
              h(
                'li',
                { class: 'weapon' + (w === best ? ' active' : '') },
                h('span', { class: 'mod-name' }, WEAPONS[w.kind].name),
                h('span', { class: 'weapon-dmg' }, cardLine(WEAPON_CARDS[w.kind])),
                h('span', { class: 'dur' }, h('span', { style: `width:${Math.min(100, (w.dur / WEAPONS[w.kind].dur) * 100)}%` })),
                h('span', { class: 'weapon-left' }, w === best ? `in der Hand · hält noch ${w.dur} Einsätze` : `hält noch ${w.dur} Einsätze`),
              ),
            ),
          )
        : h('p', { class: 'mod-desc' }, 'Keine Waffe. Du kämpfst mit Fäusten, Tritten und Steinen.'),
      h('h3', { class: 'gear-head' }, 'Deine Karten im Kampf'),
      h('p', { class: 'mod-desc' }, cardLine(deckFor(s.weapons, s.inventory.medicine))),
      h('p', { class: 'mod-desc small' }, 'Jede Waffe bringt eigene Karten mit, jede gespielte Waffenkarte nutzt die Waffe ein bisschen ab. Verbinden-Karten gibt es, solange du Medizin dabeihast.'),
      h(
        'p',
        { class: 'stock-lager' },
        svgEl(icon('wrench', 16)),
        missing.length
          ? `Neue Waffen baust du am Werktisch in deiner Endstation, zum Beispiel: ${missing.map((w) => WEAPONS[w].name).join(', ')}.`
          : 'Neue oder kaputte Waffen baust du am Werktisch in deiner Endstation.',
      ),
    );
  };

  const panel = h(
    'div',
    { class: 'overlay pack-panel', role: 'dialog', 'aria-label': 'Rucksack' },
    h(
      'div',
      { class: 'overlay-inner' },
      h(
        'header',
        { class: 'topbar' },
        h('h1', { class: 'sign-title' }, 'Rucksack'),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: onClose }, svgEl(icon('close'))),
      ),
      tabs,
      body,
    ),
  );
  host.append(panel);
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
