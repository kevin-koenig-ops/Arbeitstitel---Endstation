// Wo liegen Fundstellen? Zwei Quellen:
//
// 1. Grid: Die Welt ist in Kacheln (~190 m in Deutschland) aufgeteilt. Pro Kachel
//    entstehen aus (Welt-Seed + Kachel + Runde) 0–2 Fundstellen. Deterministisch, also
//    für alle Spieler gleich, und überall vorhanden, auch im kleinsten Dorf.
//    Jede Kachel würfelt etwa einmal am Tag neu („Runde“), aber jede zu ihrer eigenen
//    Uhrzeit: Die Gegend verändert sich nach und nach, nicht alles auf einen Schlag.
// 2. POI: Echte Orte aus OpenStreetMap (Supermarkt, Apotheke, Bushaltestelle …).
// 3. Besondere Orte: einmal pro Gegend (~1,5 km) ein Hubschrauberwrack, ein Konvoi,
//    eine Bunkertür … Fest aus dem Weltstartwert, nie an sensiblen Orten.

import { GRID_KIND_WEIGHTS, GRID_SPOT_ODDS, GRID_TURN, MUSHROOM_CHANCE, POI_KINDS, POI_NAMES, SPECIAL, SPECIAL_WEIGHTS, SPOT_KINDS } from './content';
import { distanceM, fromTile, toTile } from './geo';
import { pick, pickWeighted, rngFrom } from './rng';
import type { LatLon, Spot, SpotKind } from './types';

export const GRID_ZOOM = 17;

const TURN_MS = GRID_TURN.hours * 3_600_000;

/** Wann (0–1 einer Runde) die Kachel neu würfelt: für jede Kachel anders. */
function cellPhase(seed: string, x: number, y: number): number {
  return rngFrom(seed, 'runde', GRID_ZOOM, x, y)();
}

/** Die laufende Runde einer Kachel. */
function cellTurn(seed: string, x: number, y: number, now: number): number {
  return Math.floor(now / TURN_MS + cellPhase(seed, x, y));
}

/** Von wann bis wann eine Runde einer Kachel läuft. */
function turnSpan(seed: string, x: number, y: number, turn: number): { from: number; until: number } {
  const ph = cellPhase(seed, x, y);
  return { from: (turn - ph) * TURN_MS, until: (turn + 1 - ph) * TURN_MS };
}

function gridSpotsInCell(seed: string, x: number, y: number, turn: number): Spot[] {
  const r = rngFrom(seed, 'cell', GRID_ZOOM, x, y, turn);
  const roll = r();
  const count = roll < GRID_SPOT_ODDS.none ? 0 : roll < 1 - GRID_SPOT_ODDS.two ? 1 : 2;
  const spots: Spot[] = [];
  for (let i = 0; i < count; i++) {
    // 10 % Rand lassen, damit Fundstellen nicht auf Kachelgrenzen kleben.
    const fx = x + 0.1 + r() * 0.8;
    const fy = y + 0.1 + r() * 0.8;
    const kind = pickWeighted(r, GRID_KIND_WEIGHTS);
    spots.push({
      id: `g:${GRID_ZOOM}:${x}:${y}:${turn}:${i}`,
      kind,
      source: 'grid',
      pos: fromTile(fx, fy, GRID_ZOOM),
      name: pick(r, SPOT_KINDS[kind].names),
      // Hochsitze und Jagdhütten stehen draußen, nie im Ort (das prüft die Karte)
      ...(kind === 'hide' ? { biome: 'wild' as const } : {}),
    });
  }
  // Pilzstelle: eigener Würfel (ändert die übrigen Fundstellen nicht). Liegt nur im Wald,
  // das prüft die Karte. Wie oft, hängt vom Monat ab: im Herbst am meisten.
  const rp = rngFrom(seed, 'pilze', GRID_ZOOM, x, y, turn);
  const month = new Date(turnSpan(seed, x, y, turn).from).getUTCMonth();
  if (rp() < MUSHROOM_CHANCE[month]) {
    spots.push({
      id: `g:${GRID_ZOOM}:${x}:${y}:${turn}:${spots.length}`,
      kind: 'mushrooms',
      source: 'grid',
      pos: fromTile(x + 0.1 + rp() * 0.8, y + 0.1 + rp() * 0.8, GRID_ZOOM),
      name: pick(rp, SPOT_KINDS.mushrooms.names),
      biome: 'forest',
    });
  }
  return spots;
}

/** Alle Grid-Fundstellen im Umkreis, so wie sie gerade (now) liegen. */
export function gridSpotsAround(seed: string, center: LatLon, radiusM: number, now: number): Spot[] {
  const t = toTile(center, GRID_ZOOM);
  const cellM = 40075016 * Math.cos((center.lat * Math.PI) / 180) / 2 ** GRID_ZOOM;
  const span = Math.ceil(radiusM / cellM) + 1;
  const cx = Math.floor(t.x);
  const cy = Math.floor(t.y);
  const out: Spot[] = [];
  for (let x = cx - span; x <= cx + span; x++) {
    for (let y = cy - span; y <= cy + span; y++) {
      for (const s of gridSpotsInCell(seed, x, y, cellTurn(seed, x, y, now))) {
        if (distanceM(center, s.pos) <= radiusM) out.push(s);
      }
    }
  }
  return out;
}

function parseGridId(id: string) {
  const m = /^g:(\d+):(-?\d+):(-?\d+):(-?\d+):(\d+)$/.exec(id);
  if (!m || Number(m[1]) !== GRID_ZOOM) return null;
  return { x: Number(m[2]), y: Number(m[3]), turn: Number(m[4]), i: Number(m[5]) };
}

/** Eine Grid-Fundstelle aus ihrer ID neu berechnen (zum Prüfen, ob sie echt ist). */
export function resolveGridSpot(seed: string, id: string): Spot | null {
  const g = parseGridId(id);
  if (!g) return null;
  return gridSpotsInCell(seed, g.x, g.y, g.turn)[g.i] ?? null;
}

/** Bis wann liegt diese Grid-Fundstelle (ohne Nachfrist)? null bei fremden IDs. */
export function gridSpotUntil(seed: string, id: string): number | null {
  const g = parseGridId(id);
  return g ? turnSpan(seed, g.x, g.y, g.turn).until : null;
}

/** Liegt die Grid-Fundstelle gerade (oder lief sie erst vor Kurzem ab)? */
export function gridSpotAlive(seed: string, id: string, now: number): boolean {
  const g = parseGridId(id);
  if (!g) return false;
  const span = turnSpan(seed, g.x, g.y, g.turn);
  const grace = GRID_TURN.graceMin * 60_000;
  return now >= span.from - grace && now < span.until + grace;
}

// --- Besondere Orte -----------------------------------------------------------------

/** Die möglichen Stellen eines besonderen Ortes in einer Gegend (die erste freie gilt). */
function specialCandidates(seed: string, x: number, y: number): Spot[] {
  const r = rngFrom(seed, 'besonders', SPECIAL.zoom, x, y);
  if (r() >= SPECIAL.chance) return [];
  const kind = pickWeighted(r, SPECIAL_WEIGHTS);
  const name = pick(r, SPOT_KINDS[kind].names);
  const out: Spot[] = [];
  for (let k = 0; k < SPECIAL.candidates; k++) {
    const fx = x + 0.15 + r() * 0.7;
    const fy = y + 0.15 + r() * 0.7;
    out.push({ id: `s:${x}:${y}:${k}`, kind, source: 'special', pos: fromTile(fx, fy, SPECIAL.zoom), name });
  }
  return out;
}

/** Besondere Orte im Umkreis. blocked: Stellen, an denen nichts liegen darf (dann die nächste Stelle). */
export function specialPlacesAround(seed: string, center: LatLon, radiusM: number, blocked?: (p: LatLon) => boolean): Spot[] {
  const t = toTile(center, SPECIAL.zoom);
  const cellM = (40075016 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** SPECIAL.zoom;
  const span = Math.ceil(radiusM / cellM) + 1;
  const out: Spot[] = [];
  for (let x = Math.floor(t.x) - span; x <= Math.floor(t.x) + span; x++)
    for (let y = Math.floor(t.y) - span; y <= Math.floor(t.y) + span; y++) {
      const s = specialCandidates(seed, x, y).find((c) => !blocked?.(c.pos));
      if (s && distanceM(center, s.pos) <= radiusM) out.push(s);
    }
  return out;
}

/** Einen besonderen Ort aus seiner ID neu berechnen (zum Prüfen, ob er echt ist). */
export function resolveSpecialSpot(seed: string, id: string): Spot | null {
  const m = /^s:(-?\d+):(-?\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return specialCandidates(seed, Number(m[1]), Number(m[2]))[Number(m[3])] ?? null;
}

// --- POIs -----------------------------------------------------------------------

/** Ein Ort aus den Kartendaten, so wie die Karte ihn liefert. */
export interface PoiCandidate {
  id?: string | number;
  pos: LatLon;
  cls?: string;
  subclass?: string;
}

/**
 * Welche Fundstelle ein Kartenort wird. Zählt nur die genaue Art (subclass), die Gruppe (class)
 * nur, wenn es keine gibt: In den echten Kartendaten ist z. B. „fuel“ die Gruppe für Tankstellen
 * und Ladesäulen, „grocery“ auch für Kaufhäuser und Wochenmärkte (Kevin 23.10.: Tankstellen, wo keine sind).
 */
export function classifyPoi(cls?: string, subclass?: string): SpotKind | null {
  const value = subclass || cls;
  if (!value) return null;
  for (const [kind, values] of POI_KINDS) if (values.includes(value)) return kind;
  return null;
}

/** Kartenorte in Fundstellen umwandeln; doppelte (z. B. beide Haltestellenseiten) zusammenfassen. */
export function poiSpots(_seed: string, candidates: PoiCandidate[]): Spot[] {
  const out: Spot[] = [];
  for (const c of candidates) {
    const kind = classifyPoi(c.cls, c.subclass);
    if (!kind) continue;
    if (out.some((s) => s.kind === kind && distanceM(s.pos, c.pos) < 35)) continue;
    const id = c.id !== undefined && c.id !== '' ? `p:${c.id}` : `p:${kind}:${c.pos.lat.toFixed(5)}:${c.pos.lon.toFixed(5)}`;
    const name =
      // Echte Orte heißen immer, was sie sind (Kevin 23.10.: „eine Apotheke soll immer eine Apotheke sein“)
      POI_NAMES[c.subclass || c.cls || ''] || SPOT_KINDS[kind].names[0];
    out.push({ id, kind, source: 'poi', pos: c.pos, name });
  }
  return out;
}
