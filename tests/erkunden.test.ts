import { describe, expect, it } from 'vitest';
import { CHAIN, GRID_TURN, MEMENTOS, SPECIAL, TRACKS } from '../src/core/content';
import { distanceM, offsetM } from '../src/core/geo';
import { applyAction, createPlayer, regionTier, spotKey } from '../src/core/rules';
import { sectorOf } from '../src/core/explore';
import type { Cache, Character, GameEvent, PlayerState, Spot } from '../src/core/types';
import { gridSpotAlive, gridSpotsAround, gridSpotUntil, resolveGridSpot, resolveSpecialSpot, specialPlacesAround } from '../src/core/world';

const SEED = 'erkunden-seed';
const HOME = { lat: 51.6, lon: 10.2 };
const T0 = Date.UTC(2026, 9, 20, 12);
const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const fresh = (): PlayerState => createPlayer('player-1', hero, T0);
const ctx = (now = T0) => ({ now, worldSeed: SEED });
const lootOf = (events: GameEvent[]) => events.find((e) => e.type === 'loot') as Extract<GameEvent, { type: 'loot' }>;

describe('Besondere Orte', () => {
  it('liegen etwa einmal pro Gegend, für alle gleich, und lassen sich prüfen', () => {
    const a = specialPlacesAround(SEED, HOME, 6000);
    const b = specialPlacesAround(SEED, offsetM(HOME, 20, 10), 6000).filter((s) => distanceM(HOME, s.pos) <= 6000);
    expect(a.length).toBeGreaterThan(10);
    expect(b.map((s) => s.id).sort()).toEqual(a.map((s) => s.id).sort());
    for (const s of a) expect(resolveSpecialSpot(SEED, s.id)).toEqual(s);
    expect(new Set(a.map((s) => s.kind)).size).toBeGreaterThan(3);
  });

  it('weichen gesperrten Stellen aus', () => {
    const all = specialPlacesAround(SEED, HOME, 4000);
    const first = all[0];
    const moved = specialPlacesAround(SEED, HOME, 4000, (p) => distanceM(p, first.pos) < 1).find((s) => s.id.split(':').slice(0, 3).join(':') === first.id.split(':').slice(0, 3).join(':'));
    if (moved) expect(moved.id).not.toBe(first.id);
  });

  it('beim ersten Besuch: Entdeckung, eigenes Erinnerungsstück, neuer Ortstyp', () => {
    const sp = specialPlacesAround(SEED, HOME, 6000).find((s) => s.kind !== 'camp')!;
    const r = applyAction(fresh(), { type: 'search', spot: sp, at: sp.pos, accuracyM: 5 }, ctx());
    const l = lootOf(r.events);
    if (!l) {
      // bewacht: dann erst kämpfen, das prüfen andere Tests
      expect(r.events[0].type).toBe('rejected');
      return;
    }
    expect(l.discovery).toBe(true);
    expect(l.newKind).toBe(true);
    const own = MEMENTOS.find((m) => m.from === sp.kind)!;
    expect(l.memento).toBe(own.id);
    expect(r.state.discovered[sp.id]).toBe(T0);
    expect(r.state.places[sp.kind]).toBe(T0);
  });

  it('gefälschte besondere Orte zählen nicht', () => {
    const sp = specialPlacesAround(SEED, HOME, 6000)[0];
    const fake: Spot = { ...sp, pos: offsetM(sp.pos, 300, 0) };
    expect(applyAction(fresh(), { type: 'search', spot: fake, at: fake.pos, accuracyM: 5 }, ctx()).events[0].type).toBe('rejected');
    expect(SPECIAL.chance).toBeGreaterThan(0);
  });
});

describe('Neuland', () => {
  it('ist am Anfang vertraut, danach zählt, wie fremd die Gegend ist', () => {
    const s = fresh();
    expect(regionTier(s, HOME)).toBe(0);
    s.sectors[sectorOf(HOME).key] = 1;
    expect(regionTier(s, HOME)).toBe(0);
    expect(regionTier(s, offsetM(HOME, 900, 0))).toBe(1);
    expect(regionTier(s, offsetM(HOME, 6000, 0))).toBe(2);
  });
});

describe('Ketten und Spuren', () => {
  const findCache = (pred: (c: Cache) => boolean) => {
    let st = fresh();
    for (const spot of gridSpotsAround(SEED, HOME, 2500, T0)) {
      st = applyAction(st, { type: 'search', spot, at: spot.pos, accuracyM: 5 }, ctx()).state;
      const c = st.caches.find(pred);
      if (c) return { st, c };
      if (st.caches.length >= 3) st = { ...st, caches: [] };
    }
    return null;
  };

  it('eine Zettel-Kette führt Schritt für Schritt zu einer großen Belohnung', () => {
    const found = findCache((c) => !!c.chain);
    expect(found).not.toBeNull();
    let { st, c } = found!;
    for (let step = 1; step <= CHAIN.steps; step++) {
      expect(c.chain?.step).toBe(step);
      const r = applyAction(st, { type: 'openCache', id: c.id, at: c.spot.pos, accuracyM: 5 }, ctx());
      const e = r.events[0];
      expect(e.type).toBe('cacheOpened');
      if (e.type !== 'cacheOpened') return;
      st = r.state;
      if (step < CHAIN.steps) {
        expect(e.next).toBeDefined();
        c = st.caches.find((x) => x.id === e.next)!;
        expect(distanceM(c.fromPos, c.spot.pos)).toBeGreaterThanOrEqual(CHAIN.minM);
      } else expect(e.chainDone).toBe(true);
    }
  });

  it('Spuren führen sichtbar und genau zum Versteck', () => {
    const found = findCache((c) => c.via === 'tracks');
    expect(found).not.toBeNull();
    const { c } = found!;
    expect(c.trail!.length).toBeGreaterThan(3);
    expect(distanceM(c.trail![c.trail!.length - 1], c.spot.pos)).toBeLessThan(TRACKS.areaM);
    expect(c.areaM).toBe(TRACKS.areaM);
  });
});

describe('Wandernde Fundstellen', () => {
  const HOUR = 3_600_000;
  const ids = (t: number) => new Set(gridSpotsAround(SEED, HOME, 1500, t).map((s) => s.id));
  const share = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length / a.size;

  it('würfeln nach und nach neu, nicht alle auf einmal', () => {
    const now = ids(T0);
    expect(share(now, ids(T0 + HOUR))).toBeGreaterThan(0.9);
    const half = share(now, ids(T0 + 12 * HOUR));
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    expect(share(now, ids(T0 + GRID_TURN.hours * HOUR))).toBe(0);
  });

  it('liegen nach der Runde woanders', () => {
    const a = gridSpotsAround(SEED, HOME, 1500, T0);
    const b = gridSpotsAround(SEED, HOME, 1500, T0 + GRID_TURN.hours * HOUR);
    const same = a.filter((s) => b.some((x) => distanceM(s.pos, x.pos) < 5));
    expect(same.length).toBeLessThan(a.length * 0.05);
  });

  it('lassen sich kurz nach dem Ablauf noch durchsuchen, später nicht mehr', () => {
    const s = gridSpotsAround(SEED, HOME, 1500, T0)[0];
    const until = gridSpotUntil(SEED, s.id)!;
    expect(until).toBeGreaterThan(T0);
    expect(resolveGridSpot(SEED, s.id)).toEqual(s);
    expect(gridSpotAlive(SEED, s.id, until + (GRID_TURN.graceMin - 1) * 60_000)).toBe(true);
    expect(gridSpotAlive(SEED, s.id, until + (GRID_TURN.graceMin + 1) * 60_000)).toBe(false);
    const st = createPlayer('p', hero, T0);
    const late = applyAction(st, { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, { now: until + 2 * HOUR, worldSeed: SEED });
    expect(late.events[0]).toEqual({ type: 'rejected', reason: 'invalid_spot' });
  });

  it('zählen beim Erstfund pro Ecke, nicht pro Runde', () => {
    expect(spotKey('g:17:100:200:5:0')).toBe(spotKey('g:17:100:200:6:1'));
    expect(spotKey('g:17:100:200:5:0')).not.toBe(spotKey('g:17:101:200:5:0'));
  });
});
