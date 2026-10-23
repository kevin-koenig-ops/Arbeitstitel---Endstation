// Kleine Bausteine für Rohstoffe, Kram und Sammelstücke (Kosten-Chips, Zeilen, Vorschaubilder).

import { AMMO, AMMO_ORDER, gunAmmo, isMaterial, KRAM, KRAM_ORDER, RESOURCE_ORDER, RESOURCES } from '../../core/content';
import { whereToFind } from '../../core/rules';
import { SPOT_PLURAL } from '../texts';
import type { FurnitureId } from '../../core/furniture';
import type { AmmoId, Inventory, KramId, Resource, WeaponId } from '../../core/types';
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
  const list = thumbQueue.get(id) ?? [];
  list.push(el);
  thumbQueue.set(id, list);
  if (!thumbFlush) thumbFlush = window.setTimeout(() => void flushThumbs(), 0);
  return el;
}

// Alle Vorschaubilder eines Bildschirms auf einmal rendern (ein Zeichenbrett statt vieler)
const thumbQueue = new Map<KramId | FurnitureId, HTMLElement[]>();
let thumbFlush = 0;
async function flushThumbs() {
  thumbFlush = 0;
  const batch = new Map(thumbQueue);
  thumbQueue.clear();
  try {
    const { comicThumbnails } = await import('../../base/thumbs');
    const res = comicThumbnails([...batch.keys()]);
    for (const [id, els] of batch) {
      const src = res[`c:${id}`];
      if (!src) continue;
      for (const el of els) {
        clear(el);
        el.append(h('img', { src, alt: '' }));
      }
    }
  } catch {
    // Ohne Vorschaubilder bleibt das Symbol
  }
}

/** Was im Kram steckt (wie bei Fallout: vor dem Zerlegen sichtbar). */
export function partsChips(id: KramId) {
  return costChips(KRAM[id].parts);
}

/** „Dir fehlen 2 Glas. Glas gibt es oft in Autos und Paketschränken.“ */
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

/** "4 Pistolenpatronen, 2 Schrotpatronen" */
export function ammoLine(ammo: Partial<Record<AmmoId, number>>) {
  return AMMO_ORDER.filter((a) => (ammo[a] ?? 0) > 0)
    .map((a) => `${ammo[a]} ${AMMO[a].name}`)
    .join(', ');
}

/** Munition einer Waffe: "3 Patronen", "12 Kugeln", beim Drilling "Kugel 1 · Schrot 2"; null ohne Munition. */
export function gunAmmoText(kind: WeaponId, ammo: Partial<Record<AmmoId, number>>): string | null {
  const kinds = gunAmmo(kind);
  if (!kinds.length) return null;
  if (kinds.length > 1) return kinds.map((a) => `${AMMO[a].short} ${ammo[a] ?? 0}`).join(' · ');
  const a = kinds[0];
  const n = ammo[a] ?? 0;
  return `${n} ${n === 1 ? AMMO[a].one : AMMO[a].one === 'Kugel' ? 'Kugeln' : 'Patronen'}`;
}

/** "2 Kram" / "Toaster" / "Toaster, 2 × Konserven" */
export function kramLine(bag: Partial<Record<KramId, number>>) {
  return (Object.entries(bag) as [KramId, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => (n > 1 ? `${n} × ${KRAM[k].name}` : KRAM[k].name))
    .join(', ');
}
