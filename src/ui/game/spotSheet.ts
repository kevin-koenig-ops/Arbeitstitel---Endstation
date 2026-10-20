// Untere Karte für eine Fundstelle: Infos, Durchsuchen, Fundbeleg.

import { BACKGROUNDS, ENEMIES, HEALTH_REGEN_MIN, MEMENTOS, MIN_HEALTH_TO_FIGHT, RESOURCE_ORDER, RESOURCES, SPOT_KINDS } from '../../core/content';
import { distanceM, formatDistance } from '../../core/geo';
import { currentHealth, nextHealthIn, readyAt, searchRangeM } from '../../core/rules';
import type { GameEvent, LatLon, Spot } from '../../core/types';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { append, clear, h, reducedMotion, sleep, svgEl } from '../dom';
import { icon, resIcon, spotIcon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { FURNITURE } from '../../core/furniture';
import { enemySvg } from '../zombies';


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
  /** Kampf an einer bewachten Fundstelle beginnen. */
  onFight: (spot: Spot) => void;
}

export class SpotSheet {
  openId: string | null = null;
  private el: HTMLElement | null = null;
  private busy = false;
  /** Was die Karte gerade zeigt. Der Fundbeleg soll nicht von Updates überschrieben werden. */
  private mode: 'info' | 'receipt' = 'info';

  constructor(private ctx: Ctx) {}

  open(id: string) {
    if (this.busy) return;
    this.openId = id;
    this.mode = 'info';
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
    if (this.openId && !this.busy && this.mode === 'info') this.render();
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
    const guard = wait > 0 ? null : app.backend.guardFor(spot);
    const health = currentHealth(state, now);

    let status: string;
    let button: HTMLElement;
    if (wait > 0) {
      status = 'Schon durchsucht';
      button = h('button', { class: 'btn wide', type: 'button', disabled: true }, svgEl(icon('clock', 18)), `Wieder voll in ${formatWait(wait)}`);
    } else if (inRange && guard && health < MIN_HEALTH_TO_FIGHT) {
      status = 'In Reichweite';
      button = h('button', { class: 'btn wide', type: 'button', disabled: true }, `Zu angeschlagen · fit in ${formatWait(nextHealthIn(state, now) + (MIN_HEALTH_TO_FIGHT - health - 1) * HEALTH_REGEN_MIN * 60_000)}`);
    } else if (inRange && guard) {
      status = 'In Reichweite';
      button = h('button', { class: 'btn wide danger', type: 'button', onclick: () => this.ctx.onFight(spot) }, 'Kämpfen');
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
    append(this.el, [
      h('button', { class: 'sheet-close iconbtn small', type: 'button', 'aria-label': 'Schließen', onclick: () => this.close() }, svgEl(icon('close', 18))),
      h(
        'div',
        { class: 'sheet-head' },
        h('span', { class: 'sheet-badge', 'data-source': spot.source, 'data-guard': guard ? '1' : '0' }, svgEl(spotIcon(spot.kind, 26))),
        h(
          'div',
          null,
          h('div', { class: 'sheet-kicker' }, spot.source === 'poi' ? 'Ort aus der Karte' : 'Fundstelle'),
          h('h2', { class: 'sheet-title' }, spot.name),
        ),
      ),
      guard
        ? h(
            'div',
            { class: 'guard-box' },
            svgEl(enemySvg(guard), 'guard-art'),
            h(
              'div',
              null,
              h('div', { class: 'guard-title' }, `Bewacht von einem ${ENEMIES[guard].name}`),
              h('p', null, `${ENEMIES[guard].desc} Wer ihn erledigt, findet hier mehr.`),
            ),
          )
        : h('p', { class: 'sheet-hint' }, def.hint),
      h(
        'div',
        { class: 'sheet-meta' },
        h('span', { class: 'likely' }, likely.map((r) => h('span', { class: 'likely-chip', title: RESOURCES[r].name }, svgEl(resIcon(r, 16)), RESOURCES[r].name))),
        h('span', { class: 'sheet-status' + (inRange && wait <= 0 ? ' near' : '') }, status),
      ),
      button,
    ]);
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

  /** Fundbeleg zeigen (nach Durchsuchen oder nach gewonnenem Kampf). */
  showLoot(spot: Spot, ev: Extract<GameEvent, { type: 'loot' }>, note?: string) {
    this.openId = spot.id;
    if (!this.el) {
      this.el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Fundstelle' });
      this.ctx.host.append(this.el);
    }
    this.showReceipt(spot, ev, note);
  }

  private showReceipt(spot: Spot, ev: Extract<GameEvent, { type: 'loot' }>, note?: string) {
    this.mode = 'receipt';
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
        note ? h('p', { class: 'receipt-note' }, note) : null,
        ev.bonus ? h('p', { class: 'receipt-note' }, 'Rückkehr-Bonus: alles doppelt') : null,
        ev.night ? h('p', { class: 'receipt-note' }, 'Nachtbonus: 30 % mehr') : null,
        ev.blueprint ? h('p', { class: 'receipt-blueprint' }, svgEl(icon('blueprint', 18)), `Bauplan gefunden: ${FURNITURE[ev.blueprint].name}`) : null,
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
