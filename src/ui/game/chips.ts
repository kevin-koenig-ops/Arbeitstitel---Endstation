// Kleine Bausteine für Rohstoffe, Kram und Sammelstücke (Kosten-Chips, Zeilen, Vorschaubilder).

import { KRAM, RESOURCE_ORDER, RESOURCES } from '../../core/content';
import type { FurnitureId } from '../../core/furniture';
import type { Inventory, KramId } from '../../core/types';
import { clear, h, svgEl } from '../dom';
import { icon, resIcon } from '../icons';

export function costChips(cost: Partial<Inventory>, have?: Inventory) {
  return h(
    'span',
    { class: 'cost' },
    RESOURCE_ORDER.filter((r) => cost[r]).map((r) =>
      h('span', { class: 'cost-chip' + (have && have[r] < (cost[r] ?? 0) ? ' short' : ''), title: RESOURCES[r].name }, svgEl(resIcon(r, 15)), String(cost[r])),
    ),
  );
}

/** Vorschaubild für Kram oder ein Sammelstück (3D, wird nachgeladen; bis dahin ein Symbol).
 *  silhouette: noch nicht gefunden, nur der Umriss. */
export function thingThumb(id: KramId | FurnitureId, size = 48, silhouette = false): HTMLElement {
  const el = h('span', { class: 'junk-thumb' + (silhouette ? ' silhouette' : ''), style: `width:${size}px;height:${size}px` }, svgEl(icon('junk', Math.round(size * 0.5))));
  void import('../../base/thumbs')
    .then(({ thumbnails }) => {
      const src = thumbnails([id], [])[`f:${id}`];
      if (src) {
        clear(el);
        el.append(h('img', { src, alt: '' }));
      }
    })
    .catch(() => undefined);
  return el;
}

/** Was im Kram steckt (wie bei Fallout: vor dem Zerlegen sichtbar). */
export function partsChips(id: KramId) {
  return costChips(KRAM[id].parts);
}

export function itemsLine(items: Partial<Inventory>) {
  return RESOURCE_ORDER.filter((r) => items[r])
    .map((r) => `${items[r]} ${RESOURCES[r].name}`)
    .join(', ');
}

/** "2 Kram" / "Toaster" / "Toaster, 2 × Konserven" */
export function kramLine(bag: Partial<Record<KramId, number>>) {
  return (Object.entries(bag) as [KramId, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => (n > 1 ? `${n} × ${KRAM[k].name}` : KRAM[k].name))
    .join(', ');
}
