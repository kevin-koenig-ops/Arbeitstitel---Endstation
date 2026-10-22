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
import type { GameMap, SightingMapView } from '../../map/GameMap';
import type { WalkNet } from '../../map/walkNet';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { h, svgEl } from '../dom';
import { icon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { showCardReveal } from './cardReveal';
import { compassWord } from './spotSheet';

const RANK: Record<CardRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
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

  constructor(
    private o: {
      app: App;
      map: () => GameMap | null;
      fix: () => Fix | null;
      net: (p: LatLon) => WalkNet | null;
      isSim: () => boolean;
      walkTo: (p: LatLon) => void;
      host: HTMLElement;
      onChanged: () => void;
      /** Gerade ein Fenster offen (Kampf, Zuhause …)? Dann keine Meldungen. */
      quiet: () => boolean;
    },
  ) {
    this.chip = h('button', { class: 'env-chip radar-chip', type: 'button', hidden: true, onclick: () => this.explain() });
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
    if (this.first) {
      this.first = false;
      const count = views.length === 1 ? 'eine Sichtung' : views.length + ' Sichtungen';
      this.o.app.toast(`Funk-Radar: ${count} in der Nähe.`);
      return;
    }
    const best = fresh.sort((a, b) => RANK[b.rarity] - RANK[a.rarity])[0];
    const v = this.live.get(best.id);
    if (!v) return;
    const big = RANK[best.rarity] >= 2;
    this.vibrate(big ? [60, 50, 60, 50, 120] : [40]);
    const glow = best.rarity === 'legendary' ? ' Es glänzt golden!' : big ? ' Es glänzt violett!' : '';
    const where = formatDistance(v.d) + ' Richtung ' + compassWord(bearingDeg(this.o.fix()!.pos, v.pos));
    this.o.app.toast('Funkspruch: ' + SIGHTING_NAMES[v.s.kind] + ', ' + where + '.' + glow, big ? 'good' : undefined);
  }

  private renderChip() {
    const n = this.live.size;
    this.chip.hidden = n === 0;
    if (!n) return;
    const best = [...this.live.values()].reduce((a, b) => (RANK[b.s.rarity] > RANK[a.s.rarity] ? b : a));
    this.chip.dataset.rarity = best.s.rarity;
    this.chip.replaceChildren(svgEl(icon('radar', 14)), String(n));
    this.chip.setAttribute('aria-label', `Funk-Radar: ${n} ${n === 1 ? 'Sichtung' : 'Sichtungen'} in der Nähe`);
  }

  private explain() {
    const f = this.o.fix();
    const near = [...this.live.values()].sort((a, b) => a.d - b.d)[0];
    if (!f || !near) return;
    const min = Math.ceil((near.s.until - this.o.app.backend.now()) / 60_000);
    this.o.app.toast(`Nächste Sichtung: ${SIGHTING_NAMES[near.s.kind]}, ${formatDistance(near.d)} Richtung ${compassWord(bearingDeg(f.pos, near.pos))}, noch ${min} Min. Alle 10 Minuten taucht in der Gegend etwas Neues auf.`);
    if (this.o.isSim()) this.o.walkTo(near.pos);
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
      if (this.o.isSim()) this.o.walkTo(v.pos);
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
