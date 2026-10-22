// Pfeile am Bildschirmrand: Wohin geht es zu etwas, das man (noch) nicht sieht?
// Für Hinweise am Horizont (Rauch, Licht, Funksignal) und für Verstecke.
// Liegt das Ziel im Bild, sitzt der Hinweis direkt an seiner Stelle.

import type { Map as MLMap } from 'maplibre-gl';
import { bearingDeg, distanceM, formatDistance } from '../core/geo';
import type { LatLon } from '../core/types';
import { h, svgEl } from '../ui/dom';
import { icon } from '../ui/icons';

export interface PointerTarget {
  id: string;
  pos: LatLon;
  icon: string;
  /** Kurzer Text für Vorleser (z. B. „Rauch am Horizont“). */
  label: string;
  tone?: 'hint' | 'cache' | 'sight';
  /** Sichtungen: Farbe nach Seltenheit. */
  rarity?: string;
  /** Liegt das Ziel im Bild, zeigt die Karte es schon selbst: dann kein Pfeil. */
  hideInside?: boolean;
  onTap: () => void;
}

interface Item {
  t: PointerTarget;
  el: HTMLElement;
  arrow: HTMLElement;
  dist: HTMLElement;
}

/** Abstand zum Rand: oben die Anzeigen, unten die Knöpfe, rechts der Rucksack-Knopf. */
const INSET = { top: 86, bottom: 112, left: 34, right: 112 };

export class Pointers {
  private items = new Map<string, Item>();
  private player: LatLon | null = null;
  readonly host = h('div', { class: 'pointers', 'aria-hidden': 'false' });

  constructor(private map: MLMap) {
    map.on('move', () => this.update());
    map.on('resize', () => this.update());
  }

  setPlayer(p: LatLon) {
    this.player = p;
    this.update();
  }

  set(targets: PointerTarget[]) {
    const ids = new Set(targets.map((t) => t.id));
    for (const [id, it] of this.items)
      if (!ids.has(id)) {
        it.el.remove();
        this.items.delete(id);
      }
    for (const t of targets) {
      let it = this.items.get(t.id);
      if (!it) {
        const arrow = h('span', { class: 'ptr-arrow' });
        const dist = h('span', { class: 'ptr-dist' });
        const el = h('button', { class: 'ptr', type: 'button', 'data-tone': t.tone ?? 'hint', 'data-rarity': t.rarity ?? '' }, arrow, h('span', { class: 'ptr-icon' }, svgEl(icon(t.icon, 18)), h('i', null, '?')), dist);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          it?.t.onTap();
        });
        this.host.append(el);
        it = { t, el, arrow, dist };
        this.items.set(t.id, it);
      }
      it.t = t;
    }
    this.update();
  }

  private update() {
    if (!this.player || !this.items.size) return;
    const w = this.host.clientWidth || this.map.getContainer().clientWidth;
    const hgt = this.host.clientHeight || this.map.getContainer().clientHeight;
    const pp = this.map.project([this.player.lon, this.player.lat]);
    const bearing = this.map.getBearing();
    for (const it of this.items.values()) {
      const d = distanceM(this.player, it.t.pos);
      it.dist.textContent = formatDistance(d);
      it.el.setAttribute('aria-label', `${it.t.label}, ${formatDistance(d)}`);
      // Liegt das Ziel sichtbar im Bild? Dann direkt dort.
      const tp = this.map.project([it.t.pos.lon, it.t.pos.lat]);
      const inside = tp.x > INSET.left && tp.x < w - INSET.right && tp.y > INSET.top && tp.y < hgt - INSET.bottom && d < 1500;
      const ang = (((bearingDeg(this.player, it.t.pos) - bearing) % 360) + 360) % 360;
      const rad = (ang * Math.PI) / 180;
      let x: number;
      let y: number;
      if (inside) {
        x = tp.x;
        y = tp.y;
      } else {
        // Vom Spieler aus in Zielrichtung bis zum Rand (mit Abstand zu den Anzeigen)
        const dx = Math.sin(rad);
        const dy = -Math.cos(rad);
        const cx = Math.min(Math.max(pp.x, INSET.left), w - INSET.right);
        const cy = Math.min(Math.max(pp.y, INSET.top), hgt - INSET.bottom);
        const tx = dx > 0 ? (w - INSET.right - cx) / dx : dx < 0 ? (INSET.left - cx) / dx : Infinity;
        const ty = dy > 0 ? (hgt - INSET.bottom - cy) / dy : dy < 0 ? (INSET.top - cy) / dy : Infinity;
        const t = Math.min(tx, ty);
        x = cx + dx * t;
        y = cy + dy * t;
      }
      it.el.dataset.edge = inside ? '0' : '1';
      it.el.hidden = inside && !!it.t.hideInside;
      it.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      it.arrow.style.transform = `rotate(${Math.round(ang)}deg)`;
    }
  }

  destroy() {
    this.host.remove();
    this.items.clear();
  }
}
