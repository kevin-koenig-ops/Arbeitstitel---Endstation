// Kleine Bausteine für Rohstoffe, Kram und Sammelstücke (Kosten-Chips, Zeilen, Vorschaubilder).

import { isMaterial, KRAM, KRAM_ORDER, RESOURCE_ORDER, RESOURCES } from '../../core/content';
import { whereToFind } from '../../core/rules';
import { SPOT_PLURAL } from '../texts';
import type { FurnitureId } from '../../core/furniture';
import type { Inventory, KramId, Resource } from '../../core/types';
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

/** „Dir fehlen 2 Glas. Glas gibt es oft in Autos und Packstationen.“ */
export function missingText(cost: Partial<Inventory>, have: Inventory): string {
  const miss = RESOURCE_ORDER.filter((r) => (cost[r] ?? 0) > have[r]);
  if (!miss.length) return '';
  const list = miss.map((r) => `${(cost[r] ?? 0) - have[r]} ${RESOURCES[r].name}`).join(', ');
  const r = miss.find((x) => isMaterial(x)) ?? miss[0];
  const places = whereToFind(r)
    .map((k) => SPOT_PLURAL[k])
    .filter(Boolean)
    .slice(0, 2);
  if (places.length) return `Dir fehlen ${list}. ${RESOURCES[r].name} gibt es oft in ${places.join(' und ')}.`;
  // Bauteile wie Federn oder Kupfer stecken vor allem in Kram (wie bei Fallout)
  const inKram = kramWith(r).slice(0, 2).map((k) => KRAM[k].name);
  return `Dir fehlen ${list}.${inKram.length ? ` ${RESOURCES[r].name} steckt zum Beispiel in: ${inKram.join(', ')}.` : ''}`;
}

/** Welcher Kram enthält dieses Bauteil? (am meisten zuerst) */
export function kramWith(r: Resource) {
  return KRAM_ORDER.filter((k) => (KRAM[k].parts as Partial<Record<Resource, number>>)[r]).sort(
    (a, b) => ((KRAM[b].parts as Partial<Record<Resource, number>>)[r] ?? 0) - ((KRAM[a].parts as Partial<Record<Resource, number>>)[r] ?? 0),
  );
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
