// Untere Karte für eine Fundstelle: Infos, Durchsuchen, Fundbeleg.

import { BACKGROUNDS, MEMENTOS, RESOURCE_ORDER, RESOURCES, SPOT_KINDS } from '../../core/content';
import { distanceM, formatDistance } from '../../core/geo';
import { readyAt, searchRangeM } from '../../core/rules';
import type { GameEvent, LatLon, RejectReason, Spot } from '../../core/types';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { append, clear, h, reducedMotion, sleep, svgEl } from '../dom';
import { icon, resIcon, spotIcon } from '../icons';

const REJECT_TEXT: Record<RejectReason, string> = {
  too_far: 'Zu weit weg. Geh näher ran.',
  cooldown: 'Hier ist gerade nichts mehr zu holen.',
  invalid_spot: 'Diese Fundstelle gibt es nicht mehr.',
  cost: 'Dafür fehlen dir Vorräte.',
  locked: 'Das ist noch nicht freigeschaltet.',
  already_built: 'Schon gebaut.',
  nothing: 'Hier gibt es gerade nichts.',
};

export function formatWait(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} Min.`;
  const hrs = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hrs} Std. ${rest} Min.` : `${hrs} Std.`;
}

interface Ctx {
  app: App;
  host: HTMLElement;
  getSpot: (id: string) => Spot | undefined;
  getFix: () => Fix | null;
  isSim: () => boolean;
  walkTo: (p: LatLon) => void;
  onChanged: () => void;
}

export class SpotSheet {
  openId: string | null = null;
  private el: HTMLElement | null = null;
  private busy = false;

  constructor(private ctx: Ctx) {}

  open(id: string) {
    if (this.busy) return;
    this.openId = id;
    if (!this.el) {
      this.el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Fundstelle' });
      this.ctx.host.append(this.el);
    }
    this.render();
  }

  close() {
    if (this.busy) return;
    this.openId = null;
    this.el?.remove();
    this.el = null;
  }

  /** Bei neuem Standort aufrufen, damit Entfernung und Knopf aktuell bleiben. */
  refresh() {
    if (this.openId && !this.busy) this.render();
  }

  private render() {
    const { app } = this.ctx;
    const spot = this.openId ? this.ctx.getSpot(this.openId) : undefined;
    const state = app.backend.current();
    if (!this.el || !spot || !state) return this.close();
    const def = SPOT_KINDS[spot.kind];
    const fix = this.ctx.getFix();
    const now = app.backend.now();
    const dist = fix ? distanceM(fix.pos, spot.pos) : Infinity;
    const range = searchRangeM(state);
    const inRange = dist <= range;
    const wait = readyAt(state, spot) - now;

    let status: string;
    let button: HTMLElement;
    if (wait > 0) {
      status = 'Schon durchsucht';
      button = h('button', { class: 'btn wide', type: 'button', disabled: true }, svgEl(icon('clock', 18)), `Wieder voll in ${formatWait(wait)}`);
    } else if (inRange) {
      status = 'In Reichweite';
      button = h('button', { class: 'btn wide', type: 'button', onclick: () => this.search(spot) }, 'Durchsuchen');
    } else if (this.ctx.isSim()) {
      status = `${formatDistance(dist)} entfernt`;
      button = h('button', { class: 'btn wide', type: 'button', onclick: () => this.ctx.walkTo(spot.pos) }, 'Hinlaufen');
    } else {
      status = fix ? `${formatDistance(dist)} entfernt` : 'Warte auf GPS …';
      button = h('button', { class: 'btn wide', type: 'button', disabled: true }, fix ? `Noch ${formatDistance(Math.max(0, dist - range))} näher ran` : 'Kein Standort');
    }

    const likely = RESOURCE_ORDER.filter((r) => def.loot.some((l) => l.res === r));
    clear(this.el);
    this.el.append(
      h('button', { class: 'sheet-close iconbtn small', type: 'button', 'aria-label': 'Schließen', onclick: () => this.close() }, svgEl(icon('close', 18))),
      h(
        'div',
        { class: 'sheet-head' },
        h('span', { class: 'sheet-badge', 'data-source': spot.source }, svgEl(spotIcon(spot.kind, 26))),
        h(
          'div',
          null,
          h('div', { class: 'sheet-kicker' }, spot.source === 'poi' ? 'Ort aus der Karte' : 'Fundstelle'),
          h('h2', { class: 'sheet-title' }, spot.name),
        ),
      ),
      h('p', { class: 'sheet-hint' }, def.hint),
      h(
        'div',
        { class: 'sheet-meta' },
        h('span', { class: 'likely' }, likely.map((r) => h('span', { class: 'likely-chip', title: RESOURCES[r].name }, svgEl(resIcon(r, 16)), RESOURCES[r].name))),
        h('span', { class: 'sheet-status' + (inRange && wait <= 0 ? ' near' : '') }, status),
      ),
      button,
    );
  }

  private async search(spot: Spot) {
    const { app } = this.ctx;
    const fix = this.ctx.getFix();
    if (!fix || !this.el) return;
    this.busy = true;
    clear(this.el);
    const bar = h('div', { class: 'progress-fill' });
    this.el.append(
      h(
        'div',
        { class: 'searching' },
        h('span', { class: 'sheet-badge', 'data-source': spot.source }, svgEl(spotIcon(spot.kind, 26))),
        h('div', { class: 'searching-text' }, `Durchsuche ${spot.name} …`),
        h('div', { class: 'progress' }, bar),
      ),
    );
    const ms = reducedMotion() ? 250 : 1300;
    bar.style.transitionDuration = `${ms}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('full')));
    const [res] = await Promise.all([app.backend.dispatch({ type: 'search', spot, at: fix.pos, accuracyM: fix.accuracyM }), sleep(ms)]);
    this.busy = false;
    const ev = res.events[0];
    if (ev.type === 'loot') {
      this.ctx.onChanged();
      this.showReceipt(spot, ev);
    } else if (ev.type === 'rejected') {
      app.toast(REJECT_TEXT[ev.reason], 'warn');
      this.render();
    }
  }

  private showReceipt(spot: Spot, ev: Extract<GameEvent, { type: 'loot' }>) {
    const state = this.ctx.app.backend.current()!;
    if (!this.el) return;
    const memento = ev.memento ? MEMENTOS.find((m) => m.id === ev.memento) : undefined;
    const time = new Date(this.ctx.app.backend.now()).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const perkBg = BACKGROUNDS[state.character.background];
    clear(this.el);
    append(this.el, [
      h(
        'div',
        { class: 'receipt' },
        h('div', { class: 'receipt-head' }, h('span', null, 'Fundbeleg'), h('span', null, `Nr. ${String(state.stats.searches).padStart(4, '0')} · ${time}`)),
        h('div', { class: 'receipt-place' }, spot.name),
        h(
          'ul',
          { class: 'receipt-items' },
          RESOURCE_ORDER.filter((r) => ev.items[r]).map((r, i) =>
            h('li', { style: `--i:${i}` }, svgEl(resIcon(r, 20)), h('span', { class: 'ri-name' }, RESOURCES[r].name), h('b', null, `+${ev.items[r]}`)),
          ),
        ),
        ev.perk ? h('p', { class: 'receipt-note' }, `${perkBg.name}: +1 ${RESOURCES[ev.perk].name} extra`) : null,
        ev.bonus ? h('p', { class: 'receipt-note' }, 'Rückkehr-Bonus: alles doppelt') : null,
      ),
      memento
        ? h(
            'div',
            { class: 'memento-card' },
            h('div', { class: 'memento-kicker' }, svgEl(icon('memento', 16)), 'Erinnerungsstück gefunden'),
            h('div', { class: 'memento-title' }, memento.title),
            h('p', { class: 'memento-text' }, memento.text),
          )
        : null,
      h('button', { class: 'btn wide', type: 'button', onclick: () => this.close() }, 'Einpacken'),
    ]);
  }
}
