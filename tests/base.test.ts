import { describe, expect, it } from 'vitest';
import { FURNITURE, RUBBLE } from '../src/core/furniture';
import { applyAction, comfort, comfortTier, createPlayer, knowsBlueprint, placementProblem } from '../src/core/rules';
import type { Action, Character, PlayerState } from '../src/core/types';
import { gridSpotsAround, poiSpots } from '../src/core/world';

const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const T0 = Date.UTC(2026, 9, 20, 12);
const ctx = { now: T0, worldSeed: 'test-seed' };
const rich = (): PlayerState => ({ ...createPlayer('p', hero, T0), inventory: { food: 20, water: 20, medicine: 5, material: 100 } });
const act = (s: PlayerState, a: Action) => applyAction(s, a, ctx);

describe('Endstation', () => {
  it('Schutt wegräumen gibt Material und macht Platz', () => {
    let s = rich();
    const r = RUBBLE[0];
    expect(placementProblem(s, 'chair', r.x, r.y, 0)).toBe('blocked');
    const res = act(s, { type: 'clearRubble', id: r.id });
    expect(res.events[0].type).toBe('rubbleCleared');
    s = res.state;
    expect(s.inventory.material).toBe(102);
    expect(placementProblem(s, 'chair', r.x, r.y, 0)).toBeNull();
    expect(act(s, { type: 'clearRubble', id: r.id }).events[0]).toEqual({ type: 'rejected', reason: 'not_found' });
  });

  it('platziert, dreht, verschiebt und lagert ein (ohne Verlust)', () => {
    let s = rich();
    s = act(s, { type: 'place', kind: 'bench', x: 4, y: 0, rot: 0 }).state;
    expect(s.base.items).toHaveLength(1);
    expect(s.inventory.material).toBe(100 - (FURNITURE.bench.cost.material ?? 0));
    // Überlappung
    expect(act(s, { type: 'place', kind: 'chair', x: 5, y: 0, rot: 0 }).events[0]).toEqual({ type: 'rejected', reason: 'blocked' });
    // Teppich (Boden) darf unter Möbel
    expect(act(s, { type: 'place', kind: 'rug', x: 4, y: 0, rot: 0 }).events[0].type).toBe('placed');
    // Außerhalb der Halle
    expect(act(s, { type: 'place', kind: 'bench', x: 8, y: 6, rot: 0 }).events[0]).toEqual({ type: 'rejected', reason: 'blocked' });
    // Drehen: 2×1 wird 1×2
    const uid = s.base.items[0].uid;
    s = act(s, { type: 'move', uid, x: 8, y: 0, rot: 1 }).state;
    expect(s.base.items[0]).toMatchObject({ x: 8, y: 0, rot: 1 });
    s = act(s, { type: 'store', uid }).state;
    expect(s.base.items).toHaveLength(0);
    expect(s.inventory.material).toBe(100);
  });

  it('Teile ohne Bauplan sind gesperrt', () => {
    const s = rich();
    expect(knowsBlueprint(s, 'sofa')).toBe(false);
    expect(act(s, { type: 'place', kind: 'sofa', x: 4, y: 0, rot: 0 }).events[0]).toEqual({ type: 'rejected', reason: 'no_blueprint' });
    const withPlan = { ...s, blueprints: { sofa: T0 } };
    expect(act(withPlan, { type: 'place', kind: 'sofa', x: 4, y: 0, rot: 0 }).events[0].type).toBe('placed');
  });

  it('Gemütlichkeit zählt doppelte Teile nur halb', () => {
    let s = rich();
    s = act(s, { type: 'place', kind: 'fireBarrel', x: 4, y: 0, rot: 0 }).state;
    expect(comfort(s)).toBe(4);
    s = act(s, { type: 'place', kind: 'fireBarrel', x: 5, y: 0, rot: 0 }).state;
    expect(comfort(s)).toBe(6);
    expect(comfortTier(0).name).toBe('Ruine');
    expect(comfortTier(25)).toEqual({ name: 'Unterschlupf', next: 38 });
  });

  it('Baupläne findet man an passenden Orten', () => {
    let s = createPlayer('p', hero, T0);
    let found = 0;
    const stops = poiSpots('test-seed', gridSpotsAround('test-seed', { lat: 51.6, lon: 10.2 }, 3000).map((g, i) => ({ id: `s${i}`, pos: g.pos, cls: 'bus', subclass: 'bus_stop' })));
    for (const stop of stops.slice(0, 60)) {
      const r = applyAction(s, { type: 'search', spot: stop, at: stop.pos, accuracyM: 5 }, { now: T0 + 3_600_000 * 24 * 30, worldSeed: 'w' + stop.id });
      const loot = r.events.find((e) => e.type === 'loot');
      if (loot && loot.type === 'loot' && loot.blueprint) found++;
      s = r.state;
    }
    expect(found).toBeGreaterThan(0);
    expect(Object.keys(s.blueprints).every((k) => ['clock', 'timetable', 'busSeat'].includes(k))).toBe(true);
  });
});
