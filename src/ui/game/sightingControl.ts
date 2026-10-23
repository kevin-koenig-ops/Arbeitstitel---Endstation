// Sichtungen auf der Karte: Alle 10 Minuten taucht in der Gegend etwas auf (Notizbuch, Kiste,
// Notlazarett-Kiste, Konvoi-Wrack) und bleibt 18 bis 30 Minuten. Hingehen, antippen, Karte umdrehen.
//
// Wo genau: Jede Sichtung bringt mehrere mögliche Stellen mit. Genommen wird die erste, die an
// einem Weg liegt und an keinem heiklen Ort (Friedhof, Schule, Kirche, Krankenhaus, Gedenkstätte,
// in Häusern oder im Wasser). Nie auf Gleisen, Dächern oder Baustellen, nie in fremden Gärten.

import { WORLD_SEED } from '../../config';
import { RARITY_NAMES, type CardRarity } from '../../core/content';
import { bearingDeg, distanceM, formatDistance } from '../../core/geo';
import { SIGHT, SIGHTING_NAMES, sightingsNear, type Sighting } from '../../core/sightings';
import type { LatLon } from '../../core/types';
import { SIGHTING_ICON, type GameMap, type SightingMapView } from '../../map/GameMap';
import type { WalkNet } from '../../map/walkNet';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { h, svgEl } from '../dom';
import { icon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { showCardReveal } from './cardReveal';
import { compassWord, type Arrive } from './spotSheet';

const RANK: Record<CardRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** Funksprüche höchstens so oft (ms), damit nichts nervt. */
const RADIO_GAP = 150_000;

/** Ein Hinweis am Horizont (Rauch, Licht, Funksignal …), für die Radar-Liste. */
export interface RadarHint {
  id: string;
  pos: LatLon;
  icon: string;
  label: string;
}
/** Etwas, das die Karte kurz mit einem Pfeil zeigen soll. */
export interface RadarFocus {
  id: string;
  pos: LatLon;
  icon: string;
  label: string;
  rarity?: string;
  onTap?: () => void;
}
/** Nur Stellen so nah am Wegenetz prüfen (das reicht etwa 700 m weit). */
const CHECK_M = 620;

export class SightingControl {
  readonly chip: HTMLElement;
  /** Gewählte Stelle je Sichtung (nur gefundene; sonst später nochmal versuchen). */
  private chosen = new Map<string, number>();
  /** Wo nichts passt: nicht ständig neu prüfen. */
  private tried = new Map<string, number>();
  private live = new Map<string, { s: Sighting; idx: number; pos: LatLon; d: number }>();
  private announced = new Set<string>();
  private arrived = new Set<string>();
  private first = true;
  private sensitive: { at: number; fn: (p: LatLon, grid?: boolean) => boolean } | null = null;
  private busy = false;
  /** Liste hinter dem Radar-Knopf. */
  private pop: HTMLElement;
  /** Funkspruch-Karte oben (verschwindet nach ein paar Sekunden). */
  private radioEl: HTMLElement;
  private radioTimer = 0;
  private lastRadio = -Infinity;

  constructor(
    private o: {
      app: App;
      map: () => GameMap | null;
      fix: () => Fix | null;
      net: (p: LatLon) => WalkNet | null;
      isSim: () => boolean;
      walkTo: (p: LatLon, arrive?: Arrive) => void;
      host: HTMLElement;
      onChanged: () => void;
      /** Gerade ein Fenster offen (Kampf, Zuhause …)? Dann keine Meldungen. */
      quiet: () => boolean;
      /** Hinweise am Horizont (unentdeckte besondere Orte), für die Liste. */
      hints: () => RadarHint[];
      /** Kurz einen Pfeil zu etwas zeigen. */
      focus: (t: RadarFocus) => void;
    },
  ) {
    this.chip = h('button', { class: 'env-chip radar-chip', type: 'button', hidden: true, 'aria-haspopup': 'true', onclick: (e: Event) => (e.stopPropagation(), this.togglePop()) });
    this.pop = h('div', { class: 'radar-pop', role: 'dialog', 'aria-label': 'Funk-Radar', hidden: true });
    this.radioEl = h('button', { class: 'radio-msg', type: 'button', hidden: true });
    document.addEventListener('pointerdown', this.onDocDown, true);
  }

  /** Die Elemente für die Oberfläche (Liste und Funkspruch-Karte). */
  get els(): HTMLElement[] {
    return [this.pop, this.radioEl];
  }

  destroy() {
    document.removeEventListener('pointerdown', this.onDocDown, true);
    clearTimeout(this.radioTimer);
  }

  private onDocDown = (e: Event) => {
    if (this.pop.hidden) return;
    const t = e.target as Node;
    if (this.pop.contains(t) || this.chip.contains(t)) return;
    this.pop.hidden = true;
  };

  /**
   * Funkspruch: eine kleine Karte oben, antippen zeigt die Richtung.
   * Höchstens alle paar Minuten (force: trotzdem, z. B. wenn man angekommen ist).
   */
  radio(text: string, iconName: string, onTap: (() => void) | null, opts: { force?: boolean; tone?: string } = {}): boolean {
    const t = performance.now();
    if (this.o.quiet()) return false;
    if (!opts.force && t - this.lastRadio < RADIO_GAP) return false;
    this.lastRadio = t;
    clearTimeout(this.radioTimer);
    const el = this.radioEl;
    el.dataset.tone = opts.tone ?? '';
    el.replaceChildren(h('span', { class: 'radio-msg-ico' }, svgEl(icon(iconName, 18))), h('span', { class: 'radio-msg-text' }, h('small', null, 'Funkspruch'), text));
    if (onTap) el.append(h('span', { class: 'radio-msg-go' }, 'Zeigen'));
    el.onclick = () => {
      el.hidden = true;
      onTap?.();
    };
    el.hidden = false;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    this.radioTimer = window.setTimeout(() => (el.hidden = true), 9000);
    return true;
  }

  /** Was gerade zu sehen ist (zum Testen). */
  list() {
    return [...this.live.values()].map((v) => ({ id: v.s.id, pos: v.pos, kind: v.s.kind, rarity: v.s.rarity, d: Math.round(v.d), until: v.s.until }));
  }

  /** Neue Kartendaten: heikle Orte neu einlesen. */
  dataChanged() {
    this.sensitive = null;
    this.tried.clear();
  }

  private sensitiveFn(gm: GameMap) {
    const t = performance.now();
    if (!this.sensitive || t - this.sensitive.at > 30_000) this.sensitive = { at: t, fn: gm.sensitiveCheck() };
    return this.sensitive.fn;
  }

  /** Eine erlaubte Stelle für die Sichtung suchen (oder -1). */
  private pick(s: Sighting, gm: GameMap, here: LatLon): number {
    const known = this.chosen.get(s.id);
    if (known !== undefined) return known;
    const t = performance.now();
    if (t - (this.tried.get(s.id) ?? -Infinity) < 20_000) return -1;
    const net = this.o.net(here);
    const bad = this.sensitiveFn(gm);
    let checked = 0;
    for (let i = 0; i < s.candidates.length; i++) {
      const c = s.candidates[i];
      if (net && distanceM(net.center, c) > CHECK_M) continue;
      checked++;
      if (bad(c, true)) continue;
      // An einem Weg (Straße, Gehweg, Feldweg), nicht in Häusern oder im Wasser
      const ok = net?.wayCount ? net.terrainAt(c) === 'road' : !net || net.terrainAt(c) !== 'blocked';
      if (!ok) continue;
      this.chosen.set(s.id, i);
      return i;
    }
    // Alle geprüft und keine passt: diese Sichtung gibt es hier nicht
    if (checked === s.candidates.length) this.chosen.set(s.id, -1);
    else this.tried.set(s.id, t);
    return -1;
  }

  update() {
    const gm = this.o.map();
    const f = this.o.fix();
    const st = this.o.app.backend.current();
    if (!gm || !f || !st) return;
    const now = this.o.app.backend.now();
    const list = sightingsNear(WORLD_SEED, f.pos, now, SIGHT.radarM);
    this.live.clear();
    for (const s of list) {
      if (st.sightings[s.id]) continue;
      const idx = this.pick(s, gm, f.pos);
      if (idx < 0) continue;
      const pos = s.candidates[idx];
      const d = distanceM(f.pos, pos);
      if (d > SIGHT.radarM) continue;
      this.live.set(s.id, { s, idx, pos, d });
    }
    const reach = SIGHT.rangeM + Math.min(25, Math.max(0, f.accuracyM));
    const views: SightingMapView[] = [...this.live.values()].map((v) => ({
      id: v.s.id,
      pos: v.pos,
      kind: v.s.kind,
      rarity: v.s.rarity,
      minLeft: Math.ceil((v.s.until - now) / 60_000),
      near: v.d <= reach,
    }));
    gm.setSightings(views);
    this.renderChip();
    this.announce(views);
    // Alte Einträge aufräumen
    for (const id of this.chosen.keys()) if (!list.some((s) => s.id === id) && this.chosen.size > 200) this.chosen.delete(id);
  }

  /** Neue Sichtung in Hörweite: Funkspruch und kurzes Brummen. Angekommen: zum Einsammeln auffordern. */
  private announce(views: SightingMapView[]) {
    const fresh = views.filter((v) => !this.announced.has(v.id));
    for (const v of fresh) this.announced.add(v.id);
    const arrivedNow = views.filter((v) => v.near && !this.arrived.has(v.id));
    for (const v of arrivedNow) this.arrived.add(v.id);
    if (this.o.quiet()) return;
    if (arrivedNow.length) {
      this.vibrate([30, 40, 30]);
      this.o.app.toast('Du bist da! Tippe die Sichtung an, um sie einzusammeln.', 'good');
      return;
    }
    if (!fresh.length) return;
    // Beim Start nichts melden: Das Radar-Abzeichen oben zeigt, dass etwas da ist
    if (this.first) {
      this.first = false;
      return;
    }
    const best = fresh.sort((a, b) => RANK[b.rarity] - RANK[a.rarity])[0];
    const v = this.live.get(best.id);
    if (!v) return;
    const big = RANK[best.rarity] >= 2;
    const glow = best.rarity === 'legendary' ? ' Es glänzt golden!' : big ? ' Es glänzt violett!' : '';
    const where = formatDistance(v.d) + ' Richtung ' + compassWord(bearingDeg(this.o.fix()!.pos, v.pos));
    // Seltenes darf sich auch vordrängeln, Gewöhnliches wartet auf die nächste Lücke
    if (this.radio(SIGHTING_NAMES[v.s.kind] + ', ' + where + '.' + glow, SIGHTING_ICON[v.s.kind], () => this.focusSighting(v.s.id), { force: big, tone: best.rarity })) this.vibrate(big ? [60, 50, 60, 50, 120] : [40]);
  }

  private focusSighting(id: string) {
    const v = this.live.get(id);
    if (!v) return;
    this.o.focus({ id, pos: v.pos, icon: SIGHTING_ICON[v.s.kind], label: SIGHTING_NAMES[v.s.kind], rarity: v.s.rarity, onTap: () => void this.tap(id) });
  }

  private renderChip() {
    const n = this.live.size;
    const hints = this.o.hints().length;
    this.chip.hidden = n + hints === 0;
    if (n + hints === 0) {
      this.pop.hidden = true;
      return;
    }
    const best = n ? [...this.live.values()].reduce((a, b) => (RANK[b.s.rarity] > RANK[a.s.rarity] ? b : a)).s.rarity : '';
    this.chip.dataset.rarity = best;
    this.chip.replaceChildren(svgEl(icon('radar', 14)), n ? String(n) : '');
    this.chip.setAttribute('aria-label', `Funk-Radar: ${n} ${n === 1 ? 'Sichtung' : 'Sichtungen'}, ${hints} ${hints === 1 ? 'Hinweis' : 'Hinweise'} in der Nähe`);
    if (!this.pop.hidden) this.renderPop();
  }

  private togglePop() {
    if (!this.pop.hidden) {
      this.pop.hidden = true;
      return;
    }
    this.renderPop();
    this.pop.hidden = false;
  }

  /** Liste: Sichtungen (mit Restzeit) und Hinweise am Horizont. Antippen zeigt die Richtung. */
  private renderPop() {
    const f = this.o.fix();
    if (!f) return;
    const now = this.o.app.backend.now();
    const dir = (p: LatLon) => `${formatDistance(distanceM(f.pos, p))} ${compassWord(bearingDeg(f.pos, p))}`;
    const row = (ico: string, title: string, sub: string, rarity: string, go: () => void) =>
      h(
        'button',
        {
          class: 'radar-row',
          type: 'button',
          'data-rarity': rarity,
          onclick: () => {
            this.pop.hidden = true;
            go();
          },
        },
        h('span', { class: 'radar-row-ico' }, svgEl(icon(ico, 16))),
        h('span', { class: 'radar-row-text' }, h('b', null, title), h('small', null, sub)),
      );
    const sights = [...this.live.values()].sort((a, b) => a.d - b.d);
    const hints = this.o.hints();
    const parts: (HTMLElement | null)[] = [
      h('p', { class: 'radar-head' }, 'Funk-Radar'),
      sights.length ? h('p', { class: 'radar-sec' }, 'Sichtungen') : null,
      ...sights.map((v) =>
        row(SIGHTING_ICON[v.s.kind], SIGHTING_NAMES[v.s.kind], `${dir(v.pos)} · noch ${Math.max(1, Math.ceil((v.s.until - now) / 60_000))} Min.`, v.s.rarity, () => {
          this.focusSighting(v.s.id);
          if (this.o.isSim()) this.walkToSighting(v.s.id);
        }),
      ),
      hints.length ? h('p', { class: 'radar-sec' }, 'Am Horizont') : null,
      ...hints.map((x) =>
        row(x.icon, x.label, `${dir(x.pos)} · was es ist, siehst du vor Ort`, '', () => {
          this.o.focus({ id: x.id, pos: x.pos, icon: x.icon, label: x.label });
          if (this.o.isSim()) this.o.walkTo(x.pos);
        }),
      ),
      h('p', { class: 'radar-foot' }, 'Ab und zu taucht in der Gegend etwas Neues auf.'),
    ];
    this.pop.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  }

  /** Hinlaufen: Angekommen, wird die Sichtung gleich eingesammelt. */
  private walkToSighting(id: string) {
    const v = this.live.get(id);
    if (!v) return;
    this.o.walkTo(v.pos, { reachM: SIGHT.rangeM - 3, run: () => void this.tap(id) });
  }

  /** Sichtung angetippt: einsammeln, wenn nah genug, sonst Weg und Restzeit. */
  async tap(id: string) {
    const v = this.live.get(id);
    const f = this.o.fix();
    if (!v || !f || this.busy) return;
    const reach = SIGHT.rangeM + Math.min(25, Math.max(0, f.accuracyM));
    const d = distanceM(f.pos, v.pos);
    if (d > reach) {
      const min = Math.ceil((v.s.until - this.o.app.backend.now()) / 60_000);
      this.o.app.toast(`${SIGHTING_NAMES[v.s.kind]} (${RARITY_NAMES[v.s.rarity]}): ${formatDistance(d)} Richtung ${compassWord(bearingDeg(f.pos, v.pos))}, noch ${min} Min. Was drin ist, siehst du erst vor Ort.`);
      if (this.o.isSim()) this.walkToSighting(id);
      return;
    }
    this.busy = true;
    try {
      const res = await this.o.app.backend.dispatch({ type: 'claimSighting', id, candidate: v.idx, at: f.pos, accuracyM: f.accuracyM });
      const ev = res.events[0];
      if (ev?.type === 'sightingClaimed') {
        this.vibrate(RANK[ev.rarity] >= 2 ? [60, 40, 60, 40, 160] : [40, 30, 60]);
        this.live.delete(id);
        this.update();
        this.o.onChanged();
        showCardReveal(this.o.host, ev, res.state, WORLD_SEED, () => this.o.onChanged());
      } else if (ev?.type === 'rejected') {
        this.o.app.toast(REJECT_TEXT[ev.reason], 'warn');
        this.update();
      }
    } finally {
      this.busy = false;
    }
  }

  private vibrate(p: number | number[]) {
    try {
      if (this.o.app.settings.get().vibration) navigator.vibrate?.(p);
    } catch {
      /* nicht unterstützt */
    }
  }
}
