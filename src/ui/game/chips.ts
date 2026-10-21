// Kleine Bausteine für Rohstoffe und Fundstücke (Kosten-Chips, Zeilen, Vorschaubilder).

import { JUNK, RESOURCE_ORDER, RESOURCES } from '../../core/content';
import type { Inventory, JunkId } from '../../core/types';
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

/** Vorschaubilder für Fundstücke (3D, wird nachgeladen; bis dahin ein Symbol). */
export function junkThumb(id: JunkId, size = 48): HTMLElement {
  const el = h('span', { class: 'junk-thumb', style: `width:${size}px;height:${size}px` }, svgEl(icon('junk', Math.round(size * 0.5))));
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

/** Was ein Fundstück beim Zerlegen bringt, als kleine Rohstoff-Chips. */
export function partsChips(id: JunkId) {
  return costChips(JUNK[id].parts);
}

export function itemsLine(items: Partial<Inventory>) {
  return RESOURCE_ORDER.filter((r) => items[r])
    .map((r) => `${items[r]} ${RESOURCES[r].name}`)
    .join(', ');
}

