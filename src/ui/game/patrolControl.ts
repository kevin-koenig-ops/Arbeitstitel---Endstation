// Trupps auf der Karte: laufen ihre Strecke, schauen in Laufrichtung (Sichtkegel), hören
// in der Nähe, und entdecken dich, wenn du zu lange im Blick bist. Wer still in Deckung
// steht (Wald, Hecken, Schilf, im Sommer das Korn), ist versteckt. Wer sich von hinten
// anschleicht, kann überraschend angreifen.
//
// Welche Trupps es gibt, wer dazugehört und wo ihre Strecke liegt, kommt aus dem
// Weltstartwert (core/patrols.ts, map/walkNet.ts). Hier wird nur bewegt, geschaut und angezeigt.

import { MIN_HEALTH_TO_FIGHT, PATROL, REGIONS, gearSum } from '../../core/content';
import { bearingDeg, distanceM, offsetM } from '../../core/geo';
import type { PatrolPlan } from '../../core/patrols';
import { currentHealth } from '../../core/rules';
import { rngFrom } from '../../core/rng';
import { dayPhase } from '../../core/sun';
import { canHide, hearRangeM, sightRangeM, type Conditions, type Exposure } from '../../core/terrain';
import type { LatLon, RegionId, Season, TerrainKind, WorldEvent } from '../../core/types';
import { eventCenter } from '../../core/worldEvents';
import type { GameMap, PatrolView } from '../../map/GameMap';
import type { WalkNet } from '../../map/walkNet';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { currentAmbience } from './ambience';

export interface LivePatrol {
  plan: PatrolPlan;
  path: { pts: LatLon[]; cum: number[]; total: number } | null;
  /** Mit diesem Wegenetz wurde die Strecke gesucht (bei einem neuen Netz nochmal versuchen). */
  netTried: WalkNet | null;
  pos: LatLon;
  heading: number;
  /** 0 = ahnungslos, 1 = entdeckt */
  awareness: number;
  /** Folgt dir bis zu diesem Zeitpunkt (entdeckt oder Spur im Schnee). */
  huntUntil: number;
  /** Wo er gerade ist, wenn er von seiner Strecke abweicht (Verfolgung). */
  free: LatLon | null;
  /** Hat dich in dieser Begegnung schon entdeckt. */
  spotted: boolean;
  /** Ist gerade auf der Karte zu sehen. */
  shown: boolean;
  distM: number;
}

export interface PatrolHost {
  app: App;
  map: () => GameMap | null;
  fix: () => Fix | null;
  isSim: () => boolean;
  /** Wegenetz am Spieler (für das Gelände, auf dem du stehst). */
  net: (p: LatLon) => WalkNet | null;
  /** Wegenetz für die Strecken der Trupps (an einem festen Raster ausgerichtet, damit alle dieselben sehen). */
  patrolNet: (p: LatLon) => WalkNet | null;
  sneaking: () => boolean;
  season: () => Season;
  region: () => RegionId;
  events: () => WorldEvent[];
  home: () => LatLon | null;
  /** Ein Kampf oder Fenster ist offen: niemand sucht dich. */
  busy: () => boolean;
  /** Von oben (Hügel) siehst du Trupps weiter (1 = normal). */
  viewBonus: () => number;
  /** Liegt Schnee (Spuren verraten dich)? */
  snowy: () => boolean;
  onSpotted: (p: LivePatrol) => void;
  onTrack: (p: LivePatrol) => void;
  /** Kein Trupp folgt dir mehr. quiet: ohne Meldung (z. B. du bist zu Hause angekommen). */
  onLost: (p: LivePatrol, quiet: boolean) => void;
  onHidden: (hidden: boolean) => void;
}

const TICK_MS = 200;

export class PatrolControl {
  private live = new Map<string, LivePatrol>();
  private timer = 0;
  private lastPlanAt = -Infinity;
  private lastPathTry = 0;
  private shownAny = true;
  /** Verfolgt dich gerade jemand? */
  get chased() {
    return this.chasers.size > 0;
  }
  private lastPlanPos: LatLon | null = null;
  private lastT = performance.now();
  private lastPos: LatLon | null = null;
  private stillSince = performance.now();
  private hidden = false;
  private trail: { p: LatLon; t: number }[] = [];
  /** Trupps, die dich entdeckt haben und dir folgen: Kennung -> seit wann weit genug weg (0 = nah). */
  private chasers = new Map<string, number>();
  private ticks = 0;
  private terrainAt: { pos: LatLon; terrain: TerrainKind } | null = null;
  /** Nur zum Testen: die Lage beim letzten Schritt. */
  private dbg: unknown = null;
  /** Warum dich gerade niemand sucht (oder null). */
  private calmWhy: 'home' | 'tired' | 'cooldown' | null = null;

  /** Warum dich die Trupps gerade in Ruhe lassen: Zuhause in der Nähe, erschöpft, gerade gekämpft. */
  get calmReason() {
    return this.calmWhy;
  }

  constructor(private host: PatrolHost) {
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    // Nur zum Testen: von außen ansehen
    try {
      if (localStorage.getItem('endstation.debug')) {
        const w = window as unknown as { __patrols?: unknown; __dbgCalm?: unknown };
        w.__patrols = () =>
          [...this.live.values()].map((p) => ({ id: p.plan.id, d: Math.round(p.distM), path: !!p.path, aw: p.awareness, shown: p.shown, group: p.plan.group, pos: p.pos }));
        w.__dbgCalm = () => this.dbg;
      }
    } catch {
      /* egal */
    }
  }

  destroy() {
    clearInterval(this.timer);
    this.host.map()?.setPatrols([]);
  }

  get isHidden() {
    return this.hidden;
  }

  get(id: string): LivePatrol | undefined {
    return this.live.get(id);
  }

  /** Nach einem Kampf: dieser Trupp ist erledigt oder hat dich in Ruhe gelassen. */
  release(id: string) {
    const p = this.live.get(id);
    if (p) {
      p.awareness = 0;
      p.huntUntil = 0;
      p.spotted = false;
    }
    this.chasers.delete(id);
  }

  /** Verfolgung beenden und Bescheid geben. */
  private drop(p: LivePatrol, quiet: boolean) {
    this.release(p.plan.id);
    this.host.onLost(p, quiet);
  }

  /** Die Lage am Spieler: Gelände und ob man gesehen wird. */
  exposure(): Exposure {
    const f = this.host.fix();
    const s = this.host.app.backend.current();
    let terrain: TerrainKind = 'open';
    if (f) {
      // Das Gelände nur neu bestimmen, wenn man sich bewegt hat
      if (this.terrainAt && distanceM(this.terrainAt.pos, f.pos) < 1) terrain = this.terrainAt.terrain;
      else {
        const net = this.host.net(f.pos);
        terrain = net?.wayCount ? net.terrainAt(f.pos) : 'open';
        this.terrainAt = { pos: f.pos, terrain };
      }
    }
    return {
      terrain: terrain === 'blocked' ? 'built' : terrain,
      hidden: this.hidden,
      sneaking: this.host.isSim() && this.host.sneaking(),
      gearNoise: s ? gearSum(s.gear.worn, 'noise') : 0,
    };
  }

  conditions(): Conditions {
    const a = currentAmbience();
    const f = this.host.fix();
    const now = this.host.app.backend.now();
    const dust = !!f && this.host.events().some((e) => e.kind === 'dust' && now >= e.from && now < e.until && distanceM(f.pos, eventCenter(e, now)) <= e.radiusM);
    return {
      phase: a.phase,
      sky: a.weather,
      windy: a.windy,
      region: this.host.region(),
      season: this.host.season(),
      dust,
    };
  }

  /** Strecke eines Trupps: Wegpunkte mit aufsummierter Länge. */
  private makePath(plan: PatrolPlan, net: WalkNet | null) {
    if (!net?.wayCount) return null;
    const r = rngFrom(this.host.app.backend.seed, 'trupp-weg', plan.id);
    const pts = net.patrolPath(plan.anchor, plan.lengthM, r);
    if (!pts || pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    return total > 5 ? { pts, cum, total } : null;
  }

  private pointAt(path: NonNullable<LivePatrol['path']>, s: number): LatLon {
    const d = Math.max(0, Math.min(path.total, s));
    let i = 1;
    while (i < path.cum.length - 1 && path.cum[i] < d) i++;
    const a = path.pts[i - 1];
    const b = path.pts[i];
    const seg = path.cum[i] - path.cum[i - 1] || 1;
    const t = (d - path.cum[i - 1]) / seg;
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
    };
  }

  /** Wo der Trupp nach seiner Strecke gerade ist (hin und her) und wohin er schaut. */
  private onPath(p: LivePatrol, now: number): { pos: LatLon; heading: number } {
    if (!p.path) {
      // Ohne Weg in der Nähe: steht und schaut sich langsam um
      return {
        pos: p.plan.anchor,
        heading: ((now / 1000) * 12 + p.plan.lengthM) % 360,
      };
    }
    const L = p.path.total;
    const s = (((now - p.plan.from) / 1000) * p.plan.speed) % (2 * L);
    const fwd = s <= L;
    const along = fwd ? s : 2 * L - s;
    const pos = this.pointAt(p.path, along);
    const ahead = this.pointAt(p.path, along + (fwd ? 2 : -2));
    const back = this.pointAt(p.path, along - (fwd ? 2 : -2));
    return { pos, heading: bearingDeg(back, ahead) };
  }

  private refreshPlans(pos: LatLon, now: number) {
    const s = this.host.app.backend.current();
    if (!s) return;
    const night = dayPhase(pos, now) === 'night';
    const plans = this.host.app.backend.patrolsNear(pos, 600, this.host.region(), night, this.host.events());
    const keep = new Set<string>();
    const net = this.host.patrolNet(pos);
    for (const plan of plans) {
      if (s.patrols[plan.id]) continue;
      keep.add(plan.id);
      let p = this.live.get(plan.id);
      if (!p) {
        p = {
          plan,
          path: null,
          netTried: null,
          pos: plan.anchor,
          heading: 0,
          awareness: 0,
          huntUntil: 0,
          free: null,
          spotted: false,
          shown: false,
          distM: Infinity,
        };
        this.live.set(plan.id, p);
      } else {
        // Gruppe kann sich ändern (nachts kommt der Bleiche Wächter); die Strecke bleibt
        const same = p.plan.anchor.lat === plan.anchor.lat && p.plan.anchor.lon === plan.anchor.lon && p.plan.lengthM === plan.lengthM;
        p.plan = plan;
        if (!same) {
          p.path = null;
          p.netTried = null;
        }
      }
      if (!p.path && p.netTried !== net) {
        p.netTried = net;
        p.path = this.makePath(plan, net);
      }
    }
    for (const [id, p] of this.live) {
      if (keep.has(id) || p.huntUntil >= now) continue;
      if (this.chasers.has(id)) this.drop(p, true);
      this.live.delete(id);
    }
  }

  private tick() {
    const t = performance.now();
    const dt = Math.min(1, (t - this.lastT) / 1000);
    this.lastT = t;
    if (document.hidden) return;
    const gm = this.host.map();
    const f = this.host.fix();
    const s = this.host.app.backend.current();
    if (!gm || !f || !s) return;
    const now = this.host.app.backend.now();
    const here = f.pos;

    // Strecken neu planen: alle paar Sekunden oder nach einem Stück Weg
    if (t - this.lastPlanAt > 8000 || !this.lastPlanPos || distanceM(this.lastPlanPos, here) > 80) {
      this.lastPlanAt = t;
      this.lastPlanPos = here;
      this.refreshPlans(here, now);
    } else if (t - this.lastPathTry > 1000) {
      // Kartendaten kamen gerade erst: fehlende Strecken mit dem neuen Wegenetz nachholen
      this.lastPathTry = t;
      const net = this.host.patrolNet(here);
      if (net?.wayCount)
        for (const p of this.live.values())
          if (!p.path && p.netTried !== net) {
            p.netTried = net;
            p.path = this.makePath(p.plan, net);
          }
    }

    // Still stehen in Deckung = versteckt
    const moveTol = f.simulated ? 0.8 : 4;
    if (!this.lastPos || distanceM(this.lastPos, here) > moveTol) {
      this.lastPos = here;
      this.stillSince = t;
      if (!this.trail.length || distanceM(this.trail[this.trail.length - 1].p, here) > 5) this.trail.push({ p: here, t: now });
    }
    const trackMs = PATROL.trackMin * 60_000;
    while (this.trail.length && now - this.trail[0].t > trackMs) this.trail.shift();
    const exp0 = this.exposure();
    const season = this.host.season();
    const hiddenNow = t - this.stillSince > PATROL.hideAfterS * 1000 && canHide(exp0.terrain, season);
    if (hiddenNow !== this.hidden) {
      this.hidden = hiddenNow;
      this.host.onHidden(hiddenNow);
    }
    const exp = { ...exp0, hidden: this.hidden };
    const cond = this.conditions();
    const snowy = this.host.snowy();

    // Wer sucht dich gerade überhaupt? Ein Fenster oder Kampf ist offen: alles hält kurz an.
    // Beim Zuhause, erschöpft oder direkt nach einer Begegnung: niemand sucht dich, Verfolger geben auf.
    const home = this.host.home();
    const paused = this.host.busy() || !!s.combat;
    this.calmWhy =
      !!home && distanceM(home, here) < PATROL.homeSafeM ? 'home' : currentHealth(s, now) < MIN_HEALTH_TO_FIGHT ? 'tired' : now - s.wildAt < PATROL.cooldownMin * 60_000 ? 'cooldown' : null;
    const calm = paused || !!this.calmWhy;
    // Häuser werfen Sichtschatten (Wegenetz mit allen Häusern der Gegend)
    const los = this.host.patrolNet(here);
    const sightTo = (from: LatLon, bearing: number, maxM: number) => (los?.wayCount ? los.sightLimit(from, bearing, maxM) : maxM);
    if (calm && !paused) for (const id of [...this.chasers.keys()]) {
      const c = this.live.get(id);
      if (c) this.drop(c, true);
      else this.chasers.delete(id);
    }
    this.dbg = { calm, paused, exp, cond };
    const showM = PATROL.showM * REGIONS[cond.region].view * this.host.viewBonus() * (cond.phase === 'night' ? 0.65 : 1) * (cond.sky === 'fog' || cond.dust ? 0.55 : 1);
    const views: PatrolView[] = [];
    for (const p of this.live.values()) {
      if (s.patrols[p.plan.id] || now >= p.plan.until + (p.huntUntil > now ? 60_000 : 0)) continue;
      const path = this.onPath(p, now);
      const hunting = p.huntUntil > now;
      if (paused) {
        // steht still, solange ein Fenster offen ist
      } else if (hunting && !calm) {
        // Verfolgung: geradewegs auf dich zu
        const from = p.free ?? p.pos;
        const d = distanceM(from, here);
        const step = Math.min(d, PATROL.chaseSpeed * dt);
        const b = (bearingDeg(from, here) * Math.PI) / 180;
        p.free = d > 1 ? offsetM(from, Math.sin(b) * step, Math.cos(b) * step) : from;
        p.pos = p.free;
        p.heading = bearingDeg(p.pos, here);
      } else if (p.free) {
        // Zurück auf die eigene Strecke
        const d = distanceM(p.free, path.pos);
        if (d < 2) p.free = null;
        else {
          const step = Math.min(d, PATROL.speed[1] * dt * 1.5);
          const b = (bearingDeg(p.free, path.pos) * Math.PI) / 180;
          p.free = offsetM(p.free, Math.sin(b) * step, Math.cos(b) * step);
          p.heading = bearingDeg(p.free, path.pos);
        }
        p.pos = p.free ?? path.pos;
      } else {
        p.pos = path.pos;
        p.heading = path.heading;
      }
      const d = distanceM(p.pos, here);
      p.distM = d;
      const sight = sightRangeM(p.plan.group, cond, exp) * (hunting ? 1.6 : 1);
      const hear = hearRangeM(p.plan.group, cond, exp);

      if (!calm && d < 90) {
        const toMe = bearingDeg(p.pos, here);
        const diff = Math.abs(((((toMe - p.heading) % 360) + 540) % 360) - 180);
        // Im Blickfeld, nah genug und kein Haus dazwischen
        const inCone = diff <= PATROL.coneDeg && d <= sight && sightTo(p.pos, toMe, d) >= d - 1;
        const heard = d <= hear;
        if (inCone || heard) {
          const closeness = 1.6 - Math.min(1, d / Math.max(sight, hear, 1));
          p.awareness = Math.min(1, p.awareness + (dt / PATROL.noticeS) * closeness * (inCone ? 1 : 0.8));
        } else p.awareness = Math.max(0, p.awareness - dt * 0.35);
        // Im Schnee: frische Spuren verraten dich
        if (snowy && !hunting && !p.spotted && this.trail.some((q) => distanceM(q.p, p.pos) < 8)) {
          p.huntUntil = now + PATROL.trackHuntS * 1000;
          this.host.onTrack(p);
        }
        if (p.awareness >= 1 && !p.spotted) {
          p.spotted = true;
          p.huntUntil = now + PATROL.huntS * 1000;
          this.chasers.set(p.plan.id, 0);
          this.host.onSpotted(p);
        }
      } else if (!hunting) p.awareness = Math.max(0, p.awareness - dt * 0.35);

      const show = d <= showM || hunting || p.spotted;
      p.shown = show;
      if (show) {
        // Sichtkegel als Fächer aus Strahlen, die an Häusern enden
        const rays: number[] = [];
        for (let i = 0; i <= 16; i++) rays.push(sightTo(p.pos, p.heading - PATROL.coneDeg + (2 * PATROL.coneDeg * i) / 16, sight));
        views.push({
          id: p.plan.id,
          pos: p.pos,
          heading: p.heading,
          group: p.plan.group,
          sightM: sight,
          coneDeg: PATROL.coneDeg,
          rays,
          alert: p.spotted ? 1 : p.awareness,
          hunting: hunting || p.spotted,
          horde: p.plan.horde,
          calm: !!this.calmWhy,
        });
      }
    }

    // Weit genug weggegangen, oder er gibt auf? Dann hast du ihn abgehängt.
    if (!paused)
      for (const [id, farSince] of [...this.chasers]) {
        const c = this.live.get(id);
        if (!c) {
          this.chasers.delete(id);
          continue;
        }
        if (c.huntUntil <= now) this.drop(c, false);
        else if (c.distM > PATROL.escapeM) {
          if (!farSince) this.chasers.set(id, t);
          else if (t - farSince > 8000) this.drop(c, false);
        } else if (farSince) this.chasers.set(id, 0);
      }
    // Karte: etwa zweimal pro Sekunde reicht; nichts zu sehen und vorher auch nicht: gar nicht (spart Akku)
    this.ticks++;
    if ((views.length || this.shownAny) && (this.ticks % 2 === 0 || views.some((v) => v.alert > 0))) {
      gm.setPatrols(views);
      this.shownAny = views.length > 0;
    }
  }
}
