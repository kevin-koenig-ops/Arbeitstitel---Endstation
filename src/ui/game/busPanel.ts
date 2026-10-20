// Der Bus: Ausbau, Vorräte, Erinnerungsstücke.

import { MEMENTOS, MODULE_ORDER, MODULES, RESOURCE_ORDER, RESOURCES } from '../../core/content';
import { canAfford, dayNumber, moduleUnlocked, pendingHarvest } from '../../core/rules';
import type { Inventory, ModuleId } from '../../core/types';
import type { App } from '../app';
import { busSvg } from '../busArt';
import { clear, h, svgEl } from '../dom';
import { icon, resIcon } from '../icons';

type Tab = 'build' | 'stock' | 'memories';

export function costChips(cost: Partial<Inventory>, have?: Inventory) {
  return h(
    'span',
    { class: 'cost' },
    RESOURCE_ORDER.filter((r) => cost[r]).map((r) =>
      h('span', { class: 'cost-chip' + (have && have[r] < (cost[r] ?? 0) ? ' short' : ''), title: RESOURCES[r].name }, svgEl(resIcon(r, 15)), String(cost[r])),
    ),
  );
}

export function itemsLine(items: Partial<Inventory>) {
  return RESOURCE_ORDER.filter((r) => items[r])
    .map((r) => `${items[r]} ${RESOURCES[r].name}`)
    .join(', ');
}

export function openBusPanel(app: App, host: HTMLElement, onClose: () => void, onChanged: () => void) {
  let tab: Tab = 'build';
  const art = h('div', { class: 'bus-stage' });
  const harvestHost = h('div', { class: 'harvest-host' });
  const body = h('div', { class: 'bus-body' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });

  const tabBtn = (id: Tab, label: string) =>
    h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => ((tab = id), render()) }, label);
  tabs.append(tabBtn('build', 'Ausbau'), tabBtn('stock', 'Vorräte'), tabBtn('memories', 'Erinnerungen'));

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

  const stockView = () => {
    const s = app.backend.current()!;
    return h(
      'div',
      { class: 'stock' },
      h(
        'ul',
        { class: 'stock-list' },
        RESOURCE_ORDER.map((r) => h('li', null, svgEl(resIcon(r, 26)), h('span', { class: 'stock-name' }, RESOURCES[r].name), h('span', { class: 'stock-num' }, String(s.inventory[r])))),
      ),
      h(
        'dl',
        { class: 'stats' },
        h('dt', null, 'Unterwegs seit'),
        h('dd', null, `Tag ${dayNumber(s, app.backend.now())}`),
        h('dt', null, 'Durchsuchte Orte'),
        h('dd', null, String(s.stats.searches)),
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
