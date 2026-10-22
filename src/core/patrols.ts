// Trupps: kleine Gruppen von Gegnern, die über echte Straßen und Wege ziehen.
//
// Pro Rasterzelle (Kachel Zoom 17, ~190 m) und Runde (30 Minuten) würfelt der
// Weltstartwert, ob dort ein Trupp unterwegs ist, wer dazugehört, wie schnell er läuft
// und wo seine Strecke beginnt. Die Strecke selbst (entlang der Wege) rechnet die Karte
// aus, ebenfalls nur aus dem Startwert. Alle Spieler sehen also dieselben Trupps.
//
// Die Kennung enthält die Gegend: "t:<gegend>:<x>:<y>:<runde>" oder bei einer Horde
// "t:h:<ereignis>:<nr>". Daraus lässt sich die Gruppe jederzeit neu berechnen.

import { PATROL, REGIONS, WORLD_EVENT } from './content';
import { fromTile, offsetM, toTile, distanceM } from './geo';
import { pickWeighted, rngFrom } from './rng';
import type { FoeKind, LatLon, RegionId, WorldEvent } from './types';
import { eventCenter } from './worldEvents';

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
}

const REGION_CODE: Record<RegionId, string> = { city: 'c', town: 't', village: 'v', wild: 'w', mountain: 'm', coast: 'k', desert: 'd', snow: 's' };
const CODE_REGION = Object.fromEntries(Object.entries(REGION_CODE).map(([k, v]) => [v, k as RegionId])) as Record<string, RegionId>;

/** Wer zu diesem Trupp gehört (nachts manchmal der Bleiche Wächter allein). */
export function patrolGroup(seed: string, id: string, night: boolean): FoeKind[] {
  const r = rngFrom(seed, 'trupp-gruppe', id);
  if (id.startsWith('t:h:')) {
    // Horde: drei zusammen, oft mit einem Heuler, der weitere herbeiruft
    const roll = r();
    return roll < 0.4 ? ['walker', 'walker', 'screamer'] : roll < 0.7 ? ['walker', 'walker', 'walker'] : ['crawler', 'walker', 'walker'];
  }
  const region = CODE_REGION[id.split(':')[1]] ?? 'village';
  if (night && r() < PATROL.watcherChance) return ['watcher'];
  return [...pickWeighted(r, REGIONS[region].groups)];
}

function plan(seed: string, id: string, anchor: LatLon, from: number, night: boolean, horde = false): PatrolPlan {
  const r = rngFrom(seed, 'trupp-plan', id);
  return {
    id,
    anchor,
    group: patrolGroup(seed, id, night),
    speed: PATROL.speed[0] + r() * (PATROL.speed[1] - PATROL.speed[0]),
    lengthM: Math.round(PATROL.lengthM[0] + r() * (PATROL.lengthM[1] - PATROL.lengthM[0])),
    from,
    until: from + PATROL.lifeMin * MIN,
    horde,
  };
}

/** Der Trupp einer Zelle in einer Runde, oder null. */
function cellPatrol(seed: string, region: RegionId, x: number, y: number, win: number, night: boolean): PatrolPlan | null {
  const r = rngFrom(seed, 'trupp', x, y, win);
  const chance = REGIONS[region].patrolChance + (night ? PATROL.nightExtra : 0);
  if (r() >= chance) return null;
  const anchor = fromTile(x + 0.15 + r() * 0.7, y + 0.15 + r() * 0.7, PATROL.zoom);
  // Nicht alle starten zur vollen halben Stunde
  const from = win * WINDOW_MS + Math.floor(r() * 5) * MIN;
  return plan(seed, `t:${REGION_CODE[region]}:${x}:${y}:${win}`, anchor, from, night);
}

/**
 * Alle Trupps, die gerade im Umkreis unterwegs sind.
 * region: die Gegend um den Spieler; events: laufende Weltereignisse (Horden bringen mehr Trupps).
 */
export function patrolsAround(seed: string, center: LatLon, radiusM: number, now: number, region: RegionId, night: boolean, events: WorldEvent[] = []): PatrolPlan[] {
  const t = toTile(center, PATROL.zoom);
  const cellM = (40075016 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** PATROL.zoom;
  const span = Math.ceil(radiusM / cellM) + 1;
  const win = Math.floor(now / WINDOW_MS);
  const out: PatrolPlan[] = [];
  for (let x = Math.floor(t.x) - span; x <= Math.floor(t.x) + span; x++)
    for (let y = Math.floor(t.y) - span; y <= Math.floor(t.y) + span; y++)
      for (const w of [win - 1, win]) {
        const p = cellPatrol(seed, region, x, y, w, night);
        if (p && p.from <= now && now < p.until && distanceM(center, p.anchor) <= radiusM + p.lengthM) out.push(p);
      }
  // Horden: mehrere Trupps in der Zone, jede halbe Stunde neu verteilt
  for (const ev of events) {
    if (ev.kind !== 'horde' || now < ev.from || now >= ev.until) continue;
    const c = eventCenter(ev, now);
    if (distanceM(center, c) > radiusM + ev.radiusM) continue;
    for (let k = 0; k < WORLD_EVENT.hordePatrols; k++) {
      const id = `t:h:${ev.id}:${k}:${win}`;
      const r = rngFrom(seed, 'horde', id);
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * ev.radiusM * 0.8;
      const p = plan(seed, id, offsetM(c, Math.sin(a) * d, Math.cos(a) * d), Math.max(ev.from, win * WINDOW_MS), night, true);
      p.until = Math.min(ev.until, (win + 1) * WINDOW_MS);
      if (now < p.until) out.push(p);
    }
  }
  return out;
}

/** Läuft dieser Trupp gerade (zum Prüfen einer Kampf-Aktion)? */
export function patrolActive(id: string, now: number): boolean {
  const m = /^t:[a-z]:(-?\d+):(-?\d+):(-?\d+)$/.exec(id);
  if (m) {
    const from = Number(m[3]) * WINDOW_MS;
    return now >= from && now < from + (PATROL.lifeMin + 5) * MIN;
  }
  const h = /^t:h:x:-?\d+:-?\d+:-?\d+:\d+:(-?\d+)$/.exec(id);
  if (h) {
    const from = Number(h[1]) * WINDOW_MS;
    return now >= from - 5 * MIN && now < from + (PATROL.windowMin + 10) * MIN;
  }
  return false;
}
