// Trupps: kleine Gruppen von Gegnern, die über echte Straßen und Wege ziehen.
//
// Pro Rasterzelle (Kachel Zoom 17, ~190 m) und Runde (30 Minuten) würfelt der
// Weltstartwert, ob dort ein Trupp unterwegs ist, wer dazugehört, wie schnell er läuft
// und wo seine Strecke beginnt. Die Strecke selbst (entlang der Wege) rechnet die Karte
// aus, ebenfalls nur aus dem Startwert. Alle Spieler sehen also dieselben Trupps.
//
// Die Kennung ist "t:<x>:<y>:<runde>" (Zelle und Runde), bei einer Horde
// "t:h:<ereignis>:<nr>:<runde>", bei einem Gewohnheitstier "t:g:<x>:<y>:<tag>". Die Gegend
// steht bewusst nicht darin: Wechselt sie, bleibt ein Trupp derselbe (und ein besiegter
// bleibt besiegt).
//
// Gewohnheitstiere laufen jeden Tag zur selben Sonnenzeit dieselbe Runde (gleicher Startpunkt,
// gleiche Strecke). Bei Frost sind manche Wandler erstarrt.

import { FOE_TIME, HABIT, NOISE, PATROL, REGIONS, WORLD_EVENT } from './content';
import { fromTile, offsetM, toTile, distanceM } from './geo';
import { pickWeighted, rngFrom } from './rng';
import type { FoeKind, LatLon, Noise, RegionId, WorldEvent } from './types';
import { eventCenter, resolveEvent } from './worldEvents';

const MIN = 60_000;
const WINDOW_MS = PATROL.windowMin * MIN;

export interface PatrolPlan {
  id: string;
  /** Wo die Strecke beginnt (die Karte sucht von hier den nächsten Weg). */
  anchor: LatLon;
  group: FoeKind[];
  /** Tempo in m/s. */
  speed: number;
  /** So lang ist die Strecke, die er hin und her läuft (Meter). */
  lengthM: number;
  from: number;
  until: number;
  /** Gehört zu einer Horde (Weltereignis). */
  horde?: boolean;
  /** Für die Strecke (sonst die Kennung): Gewohnheitstiere laufen jeden Tag dieselbe. */
  pathKey?: string;
  /** Kommt nachsehen: läuft vom Startpunkt zu diesem Ort (Schüsse waren zu hören). */
  target?: LatLon;
}

/**
 * Wer zu diesem Trupp gehört: passend zur Gegend, nachts manchmal der Bleiche Wächter allein.
 * Wilde Menschen nur zu ihrer Tageszeit (Wegelagerer tagsüber, Kalkjünger nachts).
 * frost: Bei Frost ist ein Teil der Wandler erstarrt.
 */
export function patrolGroup(seed: string, id: string, night: boolean, region: RegionId, frost = false): FoeKind[] {
  let g: FoeKind[];
  if (id.startsWith('t:g:')) return ['habit'];
  if (id.startsWith('t:h:')) {
    // Horde: drei zusammen, oft mit einem Heuler, der weitere herbeiruft
    const roll = rngFrom(seed, 'trupp-gruppe', id)();
    g = roll < 0.4 ? ['walker', 'walker', 'screamer'] : roll < 0.7 ? ['walker', 'walker', 'walker'] : ['crawler', 'walker', 'walker'];
  } else if (night && rngFrom(seed, 'trupp-waechter', id)() < PATROL.watcherChance) {
    // Eigener Zufall für den Wächter: Tag und Nacht ändern sonst die ganze Gruppe
    return ['watcher'];
  } else {
    g = [...pickWeighted(rngFrom(seed, 'trupp-gruppe', id), REGIONS[region].groups)];
    // Wegelagerer nur tagsüber, Kalkjünger nur nachts: sonst die häufigste Gruppe der Gegend
    if (g.some((k) => FOE_TIME[k] && FOE_TIME[k] !== (night ? 'night' : 'day'))) g = [...REGIONS[region].groups[0][0]];
  }
  if (!frost) return g;
  // Eigener Zufall für den Frost, damit sich sonst nichts ändert
  const r = rngFrom(seed, 'trupp-frost', id);
  return g.map((k) => (k === 'walker' && r() < PATROL.frostChance ? 'frozen' : k));
}

function plan(seed: string, id: string, anchor: LatLon, from: number, night: boolean, region: RegionId, horde = false, frost = false): PatrolPlan {
  const r = rngFrom(seed, 'trupp-plan', id);
  return {
    id,
    anchor,
    group: patrolGroup(seed, id, night, region, frost),
    speed: PATROL.speed[0] + r() * (PATROL.speed[1] - PATROL.speed[0]),
    lengthM: Math.round(PATROL.lengthM[0] + r() * (PATROL.lengthM[1] - PATROL.lengthM[0])),
    from,
    until: from + PATROL.lifeMin * MIN,
    horde,
  };
}

/**
 * Der Trupp einer Zelle in einer Runde, oder null. Ob es ihn gibt, hängt von der Gegend ab
 * (in der Stadt mehr), wo er läuft aber nicht: Der Zufall dafür ist für alle Gegenden gleich.
 */
function cellPatrol(seed: string, region: RegionId, x: number, y: number, win: number, night: boolean, frost = false): PatrolPlan | null {
  const r = rngFrom(seed, 'trupp', x, y, win);
  const chance = REGIONS[region].patrolChance + (night ? PATROL.nightExtra : 0);
  if (r() >= chance) return null;
  const anchor = fromTile(x + 0.15 + r() * 0.7, y + 0.15 + r() * 0.7, PATROL.zoom);
  // Nicht alle starten zur vollen halben Stunde
  const from = win * WINDOW_MS + Math.floor(r() * 5) * MIN;
  return plan(seed, `t:${x}:${y}:${win}`, anchor, from, night, region, false, frost);
}

const DAY_MS = 24 * 60 * MIN;
/** Sonnenzeit: so viel früher oder später als UTC ist es hier (ms, 4 Minuten je Längengrad). */
const solarOffset = (lon: number) => Math.round(lon * 4 * MIN);

/**
 * Das Gewohnheitstier einer Zelle (Zoom 16) an einem Tag, oder null. Wohnort, Startzeit
 * und Strecke hängen nur von der Zelle ab, sind also jeden Tag gleich.
 */
function habitPatrol(seed: string, region: RegionId, x: number, y: number, day: number): PatrolPlan | null {
  const chance = HABIT.chance[region] ?? 0;
  if (!chance) return null;
  const r = rngFrom(seed, 'gewohnheit', x, y);
  if (r() >= chance) return null;
  const anchor = fromTile(x + 0.2 + r() * 0.6, y + 0.2 + r() * 0.6, HABIT.zoom);
  const startMin = HABIT.startH[0] * 60 + Math.floor(r() * (((HABIT.startH[1] - HABIT.startH[0]) * 60) / 15)) * 15;
  const lengthM = Math.round(HABIT.lengthM[0] + r() * (HABIT.lengthM[1] - HABIT.lengthM[0]));
  const from = day * DAY_MS + startMin * MIN - solarOffset(anchor.lon);
  return {
    id: `t:g:${x}:${y}:${day}`,
    anchor,
    group: ['habit'],
    speed: HABIT.speed,
    lengthM,
    from,
    until: from + HABIT.durationMin * MIN,
    pathKey: `g:${x}:${y}`,
  };
}

/**
 * Lärm: Schüsse waren zu hören. Ein bis drei Trupps aus der Gegend kommen zum Kampfort und
 * suchen ihn ab, solange es frisch ist. Die Kennung "t:n:<lärm>:<nr>" lässt sich aus dem
 * gemerkten Lärm (Spielstand) wieder ausrechnen.
 */
function noisePatrols(seed: string, n: Noise, night: boolean, region: RegionId, frost = false): PatrolPlan[] {
  const count = Math.min(NOISE.maxPatrols, 1 + Math.floor(Math.max(0, n.loud - 1) / NOISE.shotsPerPatrol));
  const out: PatrolPlan[] = [];
  for (let k = 0; k < count; k++) {
    const id = `t:n:${n.id}:${k}`;
    const r = rngFrom(seed, 'laerm', id);
    const a = r() * Math.PI * 2;
    const d = NOISE.fromM[0] + r() * (NOISE.fromM[1] - NOISE.fromM[0]);
    const anchor = offsetM(n.at, Math.sin(a) * d, Math.cos(a) * d);
    out.push({
      id,
      anchor,
      group: patrolGroup(seed, id, night, region, frost),
      speed: NOISE.speed,
      lengthM: Math.round(d + 60),
      // Nicht alle auf einmal: der erste nach einer Minute, die anderen etwas später
      from: n.from + (1 + k * 2) * MIN,
      until: n.until,
      target: n.at,
    });
  }
  return out;
}

/** Welcher Tag (Sonnenzeit) ist hier gerade? */
function solarDay(now: number, lon: number): number {
  return Math.floor((now + solarOffset(lon)) / DAY_MS);
}

/** Ein Trupp einer Horde (k-ter, Runde win). */
function hordePatrol(seed: string, ev: WorldEvent, k: number, win: number, night: boolean): PatrolPlan {
  const id = `t:h:${ev.id}:${k}:${win}`;
  const r = rngFrom(seed, 'horde', id);
  const a = r() * Math.PI * 2;
  const d = Math.sqrt(r()) * ev.radiusM * 0.8;
  const c = eventCenter(ev, ev.from);
  const p = plan(seed, id, offsetM(c, Math.sin(a) * d, Math.cos(a) * d), Math.max(ev.from, win * WINDOW_MS), night, 'town', true);
  p.until = Math.min(ev.until, (win + 1) * WINDOW_MS);
  return p;
}

/**
 * Alle Trupps, die gerade im Umkreis unterwegs sind.
 * region: die Gegend um den Spieler; events: laufende Weltereignisse (Horden bringen mehr Trupps);
 * frost: es friert (manche Wandler sind erstarrt).
 */
export function patrolsAround(seed: string, center: LatLon, radiusM: number, now: number, region: RegionId, night: boolean, events: WorldEvent[] = [], frost = false, noise: Noise[] = []): PatrolPlan[] {
  const t = toTile(center, PATROL.zoom);
  const cellM = (40075016 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** PATROL.zoom;
  const span = Math.ceil(radiusM / cellM) + 1;
  const win = Math.floor(now / WINDOW_MS);
  const out: PatrolPlan[] = [];
  for (let x = Math.floor(t.x) - span; x <= Math.floor(t.x) + span; x++)
    for (let y = Math.floor(t.y) - span; y <= Math.floor(t.y) + span; y++)
      for (const w of [win - 1, win]) {
        const p = cellPatrol(seed, region, x, y, w, night, frost);
        if (p && p.from <= now && now < p.until && distanceM(center, p.anchor) <= radiusM + p.lengthM) out.push(p);
      }
  // Gewohnheitstiere: jeden Tag zur selben Zeit dieselbe Runde
  const tg = toTile(center, HABIT.zoom);
  const gspan = Math.ceil(radiusM / (cellM * 2)) + 1;
  const day = solarDay(now, center.lon);
  for (let x = Math.floor(tg.x) - gspan; x <= Math.floor(tg.x) + gspan; x++)
    for (let y = Math.floor(tg.y) - gspan; y <= Math.floor(tg.y) + gspan; y++)
      for (const d of [day - 1, day]) {
        const p = habitPatrol(seed, region, x, y, d);
        if (p && p.from <= now && now < p.until && distanceM(center, p.anchor) <= radiusM + p.lengthM) out.push(p);
      }
  // Horden: mehrere Trupps in der Zone, jede halbe Stunde neu verteilt
  for (const ev of events) {
    if (ev.kind !== 'horde' || now < ev.from || now >= ev.until) continue;
    if (distanceM(center, eventCenter(ev, now)) > radiusM + ev.radiusM) continue;
    for (let k = 0; k < WORLD_EVENT.hordePatrols; k++) {
      const p = hordePatrol(seed, ev, k, win, night);
      if (now < p.until) out.push(p);
    }
  }
  // Lärm: Trupps kommen nachsehen, wo geschossen wurde
  for (const n of noise) {
    if (now >= n.until || distanceM(center, n.at) > radiusM + NOISE.fromM[1]) continue;
    for (const p of noisePatrols(seed, n, night, region, frost)) if (p.from <= now && now < p.until) out.push(p);
  }
  return out;
}

/**
 * Einen Trupp aus seiner Kennung neu berechnen und prüfen, ob es ihn gerade gibt.
 * region: die Gegend, die das Gerät meldet (prüft später der Server mit eigenen Kartendaten).
 * Gibt null zurück bei erfundenen, abgelaufenen oder nicht passend geschriebenen Kennungen.
 */
export function resolvePatrol(seed: string, id: string, now: number, night: boolean, region: RegionId, frost = false, noise: Noise[] = []): PatrolPlan | null {
  const slack = 5 * MIN;
  const nm = /^t:n:(\d+):(\d+)$/.exec(id);
  if (nm) {
    const n = noise.find((x) => x.id === nm[1]);
    const p = n ? noisePatrols(seed, n, night, region, frost).find((x) => x.id === id) : undefined;
    if (!p || now < p.from || now >= p.until + slack) return null;
    return p;
  }
  const m = /^t:(-?\d+):(-?\d+):(-?\d+)$/.exec(id);
  if (m) {
    const p = cellPatrol(seed, region, Number(m[1]), Number(m[2]), Number(m[3]), night, frost);
    if (!p || p.id !== id || now < p.from || now >= p.until + slack) return null;
    return p;
  }
  const g = /^t:g:(-?\d+):(-?\d+):(-?\d+)$/.exec(id);
  if (g) {
    const p = habitPatrol(seed, region, Number(g[1]), Number(g[2]), Number(g[3]));
    if (!p || p.id !== id || now < p.from || now >= p.until + slack) return null;
    return p;
  }
  const h = /^t:h:(x:-?\d+:-?\d+:-?\d+:\d+):(\d+):(-?\d+)$/.exec(id);
  if (h) {
    const ev = resolveEvent(seed, h[1]);
    const k = Number(h[2]);
    if (!ev || ev.kind !== 'horde' || k >= WORLD_EVENT.hordePatrols) return null;
    const p = hordePatrol(seed, ev, k, Number(h[3]), night);
    if (p.id !== id || now < p.from || now >= p.until + slack) return null;
    return p;
  }
  return null;
}
