// Weltereignisse: Staubsturm, Horde, Sperrgebiet, Hilfsabwurf.
//
// Pro Gegend (Kachel Zoom 14, ~1,5 km) und Runde (3 Stunden, weltweit gleich getaktet)
// würfelt der Weltstartwert, ob dort etwas passiert, wo und wie lange. Dadurch sehen alle
// Spieler dasselbe zur selben Zeit, auch ohne Server. Die Mitte liegt nie an heiklen Orten
// (Friedhof, Schule, Kirche, Krankenhaus, Privatgrund): blocked kommt aus den Kartendaten.

import { WORLD_EVENT, WORLD_EVENTS } from './content';
import { distanceM, fromTile, offsetM, toTile } from './geo';
import { pickWeighted, rngFrom } from './rng';
import type { LatLon, Spot, WorldEvent, WorldEventKind } from './types';

const HOUR = 3_600_000;
const WINDOW_MS = WORLD_EVENT.windowH * HOUR;
const KIND_WEIGHTS = Object.entries(WORLD_EVENTS).map(([k, d]) => [k as WorldEventKind, d.weight] as const);

/** Alle möglichen Fassungen des Ereignisses einer Gegend in einer Runde (eine pro möglicher Mitte). */
function eventCandidates(seed: string, x: number, y: number, win: number): WorldEvent[] {
  const r = rngFrom(seed, 'ereignis', x, y, win);
  if (r() >= WORLD_EVENT.chance) return [];
  const kind = pickWeighted(r, KIND_WEIGHTS);
  const def = WORLD_EVENTS[kind];
  const radiusM = Math.round(def.radiusM[0] + r() * (def.radiusM[1] - def.radiusM[0]));
  // Beginn irgendwann in der ersten Stunde der Runde
  const from = win * WINDOW_MS + Math.floor(r() * 60) * 60_000;
  const until = from + Math.round(def.durationMin[0] + r() * (def.durationMin[1] - def.durationMin[0])) * 60_000;
  const out: WorldEvent[] = [];
  for (let k = 0; k < WORLD_EVENT.candidates; k++) {
    const center = fromTile(x + 0.2 + r() * 0.6, y + 0.2 + r() * 0.6, WORLD_EVENT.zoom);
    out.push({ id: `x:${x}:${y}:${win}:${k}`, kind, center, radiusM, from, until });
  }
  return out;
}

/**
 * Das Ereignis einer Gegend in einer Runde (oder null): die erste mögliche Mitte, die nicht
 * an einem heiklen Ort liegt. dropBlocked: strengere Prüfung für Hilfsabwürfe (nie in Gärten,
 * auf Höfen oder Privatgrund). Die Nummer der Mitte steht in der Kennung.
 */
export function eventIn(seed: string, x: number, y: number, win: number, blocked?: (p: LatLon) => boolean, dropBlocked?: (p: LatLon) => boolean): WorldEvent | null {
  for (const ev of eventCandidates(seed, x, y, win)) {
    const bad = ev.kind === 'drop' ? (dropBlocked ?? blocked) : blocked;
    if (!bad?.(ev.center)) return ev;
  }
  return null;
}

/** Der Staubsturm zieht langsam weiter: Mitte zu diesem Zeitpunkt. */
export function eventCenter(ev: WorldEvent, now: number): LatLon {
  if (ev.kind !== 'dust') return ev.center;
  const r = rngFrom('staub-richtung', ev.id);
  const ang = r() * Math.PI * 2;
  // etwa 0,4 m/s, also gut 1,4 km in der Stunde – aber nie weiter als 600 m von der Mitte weg
  const t = Math.max(0, Math.min(now, ev.until) - ev.from) / 1000;
  const d = Math.min(600, t * 0.4);
  return offsetM(ev.center, Math.sin(ang) * d, Math.cos(ang) * d);
}

/** Alle Ereignisse, die gerade laufen (oder bald beginnen: soon in ms), im Umkreis. */
export function eventsAround(
  seed: string,
  center: LatLon,
  radiusM: number,
  now: number,
  blocked?: (p: LatLon) => boolean,
  soon = 0,
  dropBlocked?: (p: LatLon) => boolean,
): WorldEvent[] {
  const t = toTile(center, WORLD_EVENT.zoom);
  const cellM = (40075016 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** WORLD_EVENT.zoom;
  const span = Math.ceil(radiusM / cellM) + 1;
  const win = Math.floor(now / WINDOW_MS);
  const out: WorldEvent[] = [];
  for (let x = Math.floor(t.x) - span; x <= Math.floor(t.x) + span; x++)
    for (let y = Math.floor(t.y) - span; y <= Math.floor(t.y) + span; y++)
      for (const w of [win - 1, win, win + 1]) {
        const ev = eventIn(seed, x, y, w, blocked, dropBlocked);
        if (!ev || ev.until <= now || ev.from > now + soon) continue;
        if (distanceM(center, eventCenter(ev, now)) - ev.radiusM > radiusM) continue;
        out.push(ev);
      }
  return out;
}

/** Die Zonen, in denen dieser Punkt gerade liegt. */
export function zonesAt(seed: string, p: LatLon, now: number, blocked?: (p: LatLon) => boolean): WorldEvent[] {
  return eventsAround(seed, p, 0, now, blocked).filter((ev) => ev.radiusM > 0 && distanceM(p, eventCenter(ev, now)) <= ev.radiusM);
}

/** Ein Ereignis aus seiner Kennung neu berechnen (die Nummer der Mitte steht darin). */
export function resolveEvent(seed: string, id: string): WorldEvent | null {
  const m = /^x:(-?\d+):(-?\d+):(-?\d+):(\d+)$/.exec(id);
  if (!m) return null;
  const ev = eventCandidates(seed, Number(m[1]), Number(m[2]), Number(m[3]))[Number(m[4])];
  return ev && ev.id === id ? ev : null;
}

/** Die Kiste des Hilfsabwurfs als Fundstelle (Kennung "e:<Ereignis>"). */
export function dropSpot(ev: WorldEvent): Spot {
  return { id: `e:${ev.id}`, kind: 'airdrop', source: 'special', pos: ev.center, name: 'Hilfsabwurf' };
}

/** Die Kiste eines Hilfsabwurfs prüfen: gibt es sie, und liegt sie gerade noch da? */
export function resolveDropSpot(seed: string, id: string, now: number): Spot | null {
  if (!id.startsWith('e:')) return null;
  const ev = resolveEvent(seed, id.slice(2));
  if (!ev || ev.kind !== 'drop' || now < ev.from || now >= ev.until) return null;
  return dropSpot(ev);
}
