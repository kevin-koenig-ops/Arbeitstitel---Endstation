// Der Bus: Ausbau, Rucksack (Vorräte, Rohstoffe, Fundstücke), Erinnerungsstücke.

import {
  FIST_DAMAGE,
  HEAL_AMOUNT,
  JUNK,
  JUNK_ORDER,
  MATERIAL_ORDER,
  MAX_HEALTH,
  MEMENTOS,
  MODULE_ORDER,
  MODULES,
  RESOURCES,
  SURVIVAL_ORDER,
  WEAPON_ORDER,
  WEAPONS,
} from '../../core/content';
import { bestWeapon, canAfford, currentHealth, dayNumber, moduleUnlocked, nextHealthIn, pendingHarvest } from '../../core/rules';
import type { ModuleId } from '../../core/types';
import type { App } from '../app';
import { busSvg } from '../busArt';
import { clear, h, svgEl } from '../dom';
import { icon, resIcon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { exploredStats } from '../../core/explore';
import { formatWait } from './spotSheet';
import { costChips, itemsLine, junkThumb, partsChips } from './chips';

export { costChips, itemsLine, junkThumb, partsChips };

export type BusTab = 'build' | 'gear' | 'stock' | 'memories';
type Tab = BusTab;

export function openBusPanel(app: App, host: HTMLElement, onClose: () => void, onChanged: () => void, startTab: Tab = 'build') {
  let tab: Tab = startTab;
  const art = h('div', { class: 'bus-stage' });
  const harvestHost = h('div', { class: 'harvest-host' });
  const body = h('div', { class: 'bus-body' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });

  const tabBtn = (id: Tab, label: string) =>
    h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => ((tab = id), render()) }, label);
  tabs.append(tabBtn('build', 'Ausbau'), tabBtn('gear', 'Waffen'), tabBtn('stock', 'Rucksack'), tabBtn('memories', 'Funde'));

  const render = () => {
    const s = app.backend.current()!;
    const now = app.backend.now();
    clear(art);
    art.append(svgEl(busSvg(s.bus.modules)));

    clear(harvestHost);
    const pending = pendingHarvest(s, now);
    if (Object.keys(pending).length) {
      harvestHost.append(
        h(
          'button',
          {
            class: 'btn harvest',
            type: 'button',
            onclick: async () => {
              const res = await app.backend.dispatch({ type: 'harvest' });
              const ev = res.events[0];
              if (ev.type === 'harvested') app.toast(`Abgeholt: ${itemsLine(ev.items)}`, 'good');
              onChanged();
              render();
            },
          },
          `Abholen: ${itemsLine(pending)}`,
        ),
      );
    }

    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === tab)));
    clear(body);
    if (tab === 'build') body.append(buildList());
    if (tab === 'gear') body.append(gearView());
    if (tab === 'stock') body.append(stockView());
    if (tab === 'memories') body.append(memoryGrid());
  };

  const buildList = () => {
    const s = app.backend.current()!;
    return h(
      'ul',
      { class: 'modules' },
      MODULE_ORDER.map((id: ModuleId) => {
        const def = MODULES[id];
        const built = !!s.bus.modules[id];
        const unlocked = moduleUnlocked(s, id);
        const affordable = canAfford(s.inventory, def.cost);
        let action: HTMLElement;
        if (built) action = h('span', { class: 'mod-state good' }, svgEl(icon('check', 18)), 'Gebaut');
        else if (!unlocked)
          action = h('span', { class: 'mod-state' }, svgEl(icon('lock', 16)), `Braucht ${def.requires.map((r) => MODULES[r].name).join(', ')}`);
        else
          action = h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              disabled: !affordable,
              onclick: async () => {
                const res = await app.backend.dispatch({ type: 'build', module: id });
                if (res.events[0].type === 'built') app.toast(`${def.name} gebaut.`, 'good');
                onChanged();
                render();
              },
            },
            'Bauen',
          );
        return h(
          'li',
          { class: 'module' + (built ? ' built' : '') },
          h('div', { class: 'mod-main' }, h('div', { class: 'mod-name' }, def.name), h('p', { class: 'mod-desc' }, def.desc), built ? null : costChips(def.cost, s.inventory)),
          h('div', { class: 'mod-action' }, action),
        );
      }),
    );
  };

  const gearView = () => {
    const s = app.backend.current()!;
    const now = app.backend.now();
    const hp = currentHealth(s, now);
    const best = bestWeapon(s);
    const hpSegs = h('span', { class: 'hp-bar me-hp big' });
    for (let i = 0; i < MAX_HEALTH; i++) hpSegs.append(h('span', { class: i < hp ? 'on' : '' }));
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
                h('span', { class: 'weapon-dmg' }, `Schaden ${WEAPONS[w.kind].dmg}`),
                h('span', { class: 'dur' }, h('span', { style: `width:${(w.dur / WEAPONS[w.kind].dur) * 100}%` })),
                h('span', { class: 'weapon-left' }, w === best ? `in der Hand · ${w.dur} Schläge` : `${w.dur} Schläge`),
              ),
            ),
          )
        : h('p', { class: 'mod-desc' }, `Keine Waffe. Du kämpfst mit den Fäusten (Schaden ${FIST_DAMAGE}).`),
      h('h3', { class: 'gear-head' }, 'Herstellen'),
      h(
        'ul',
        { class: 'modules' },
        WEAPON_ORDER.map((id) => {
          const def = WEAPONS[id];
          const locked = def.requires && !s.bus.modules[def.requires];
          const action = locked
            ? h('span', { class: 'mod-state' }, svgEl(icon('lock', 16)), `Braucht ${MODULES[def.requires!].name}`)
            : h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  disabled: !canAfford(s.inventory, def.cost),
                  onclick: async () => {
                    const res = await app.backend.dispatch({ type: 'craft', weapon: id });
                    if (res.events[0].type === 'crafted') app.toast(`${def.name} hergestellt.`, 'good');
                    onChanged();
                    render();
                  },
                },
                'Bauen',
              );
          return h(
            'li',
            { class: 'module' },
            h(
              'div',
              { class: 'mod-main' },
              h('div', { class: 'mod-name' }, def.name),
              h('p', { class: 'mod-desc' }, `${def.desc} Schaden ${def.dmg}, hält ${def.dur} Schläge.`),
              costChips(def.cost, s.inventory),
            ),
            h('div', { class: 'mod-action' }, action),
          );
        }),
      ),
    );
  };

  const stockView = () => {
    const s = app.backend.current()!;
    const owned = JUNK_ORDER.filter((j) => (s.junk[j] ?? 0) > 0);
    return h(
      'div',
      { class: 'stock' },
      h('h3', { class: 'stock-head' }, 'Zum Überleben'),
      h(
        'ul',
        { class: 'stock-list' },
        SURVIVAL_ORDER.map((r) => h('li', null, svgEl(resIcon(r, 26)), h('span', { class: 'stock-name' }, RESOURCES[r].name), h('span', { class: 'stock-num' }, String(s.inventory[r])))),
      ),
      h('h3', { class: 'stock-head' }, 'Rohstoffe'),
      h(
        'ul',
        { class: 'stock-list mats' },
        MATERIAL_ORDER.map((r) =>
          h(
            'li',
            { class: s.inventory[r] ? '' : 'empty', title: RESOURCES[r].where ?? '' },
            svgEl(resIcon(r, 24)),
            h('span', { class: 'stock-name' }, RESOURCES[r].name, h('small', null, RESOURCES[r].where ?? '')),
            h('span', { class: 'stock-num' }, String(s.inventory[r])),
          ),
        ),
      ),
      h('h3', { class: 'stock-head' }, 'Fundstücke', h('small', null, 'In der Endstation aufstellen oder am Werktisch zerlegen')),
      owned.length
        ? h(
            'ul',
            { class: 'junk-list' },
            owned.map((j) =>
              h(
                'li',
                null,
                junkThumb(j, 52),
                h('div', { class: 'junk-main' }, h('b', null, JUNK[j].name, (s.junk[j] ?? 0) > 1 ? h('span', { class: 'junk-n' }, ` ×${s.junk[j]}`) : null), h('small', null, JUNK[j].desc), h('span', { class: 'junk-parts' }, 'Zerlegt: ', partsChips(j))),
              ),
            ),
          )
        : h('p', { class: 'stock-empty' }, 'Noch keine Fundstücke. Sie liegen draußen in Autos, Containern, Paketen und Schuppen.'),
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
        h('dt', null, 'Ausbauten'),
        h('dd', null, `${Object.keys(s.bus.modules).length} von ${MODULE_ORDER.length}`),
      ),
    );
  };

  const memoryGrid = () => {
    const s = app.backend.current()!;
    const found = MEMENTOS.filter((m) => s.collection[m.id]).length;
    return h(
      'div',
      null,
      h('p', { class: 'mem-count' }, `${found} von ${MEMENTOS.length} gefunden`),
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

  const panel = h(
    'div',
    { class: 'overlay bus-panel', role: 'dialog', 'aria-label': 'Dein Bus' },
    h(
      'div',
      { class: 'overlay-inner' },
      h(
        'header',
        { class: 'topbar' },
        h('h1', { class: 'sign-title' }, 'Dein Bus'),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: onClose }, svgEl(icon('close'))),
      ),
      art,
      harvestHost,
      tabs,
      body,
    ),
  );
  host.append(panel);
  render();
  return panel;
}
