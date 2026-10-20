import { describe, expect, it } from 'vitest';
import { MODULES } from '../src/core/content';
import { distanceM, offsetM } from '../src/core/geo';
import { applyAction, createPlayer, pendingHarvest, readyAt, searchRangeM } from '../src/core/rules';
import { migrate } from '../src/core/save';
import type { Character, PlayerState, Spot } from '../src/core/types';
import { classifyPoi, gridSpotsAround, poiSpots, resolveGridSpot } from '../src/core/world';

const SEED = 'test-seed';
const HOME = { lat: 51.6, lon: 10.2 };
const HOUR = 3600_000;
const T0 = Date.UTC(2026, 9, 20, 12);
const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };

const fresh = (): PlayerState => createPlayer('player-1', hero, T0);
const ctx = (now = T0) => ({ now, worldSeed: SEED });

describe('Welt', () => {
  it('erzeugt für alle Spieler dieselben Fundstellen', () => {
    const a = gridSpotsAround(SEED, HOME, 500);
    const b = gridSpotsAround(SEED, offsetM(HOME, 3, 2), 500).filter((s) => distanceM(HOME, s.pos) <= 500);
    expect(a.length).toBeGreaterThan(5);
    expect(b.map((s) => s.id).sort()).toEqual(a.map((s) => s.id).sort());
  });

  it('kann Grid-Fundstellen aus der ID nachrechnen', () => {
    const [s] = gridSpotsAround(SEED, HOME, 400);
    expect(resolveGridSpot(SEED, s.id)).toEqual(s);
    expect(resolveGridSpot(SEED, 'g:17:1:2:9')).toBeNull();
  });

  it('erkennt echte Orte und fasst doppelte Haltestellen zusammen', () => {
    expect(classifyPoi('grocery', 'supermarket')).toBe('market');
    expect(classifyPoi('bus', 'bus_stop')).toBe('stop');
    expect(classifyPoi('cafe', 'cafe')).toBeNull();
    const spots = poiSpots(SEED, [
      { pos: HOME, cls: 'bus', subclass: 'bus_stop' },
      { pos: offsetM(HOME, 15, 0), cls: 'bus', subclass: 'bus_stop' },
      { pos: offsetM(HOME, 0, 80), cls: 'pharmacy', subclass: 'pharmacy', id: 42 },
    ]);
    expect(spots.map((s) => s.kind)).toEqual(['stop', 'pharmacy']);
    expect(spots[1].id).toBe('p:42');
    expect(spots[1].name).toBe('Apotheke');
  });
});

describe('Durchsuchen', () => {
  const spot = (): Spot => gridSpotsAround(SEED, HOME, 400)[0];

  it('gibt Beute, wenn man nah genug dran ist', () => {
    const s = spot();
    const { state, events } = applyAction(fresh(), { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx());
    expect(events[0].type).toBe('loot');
    expect(state.stats.searches).toBe(1);
    expect(state.collection.polaroid).toBe(T0); // erstes Fundstück ist garantiert
    const total = Object.values(state.inventory).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(Object.values(fresh().inventory).reduce((a, b) => a + b, 0));
  });

  it('lehnt ab, wenn man zu weit weg ist', () => {
    const s = spot();
    const far = offsetM(s.pos, searchRangeM(fresh()) + 30, 0);
    const { state, events } = applyAction(fresh(), { type: 'search', spot: s, at: far, accuracyM: 5 }, ctx());
    expect(events).toEqual([{ type: 'rejected', reason: 'too_far' }]);
    expect(state).toEqual(fresh());
  });

  it('rechnet GPS-Ungenauigkeit nur begrenzt an', () => {
    const s = spot();
    const at = offsetM(s.pos, searchRangeM(fresh()) + 20, 0);
    expect(applyAction(fresh(), { type: 'search', spot: s, at, accuracyM: 500 }, ctx()).events[0].type).toBe('loot');
    const tooFar = offsetM(s.pos, searchRangeM(fresh()) + 40, 0);
    expect(applyAction(fresh(), { type: 'search', spot: s, at: tooFar, accuracyM: 500 }, ctx()).events[0]).toEqual({
      type: 'rejected',
      reason: 'too_far',
    });
  });

  it('erkennt gefälschte Fundstellen', () => {
    const s = { ...spot(), kind: 'parcel' as const };
    const fake = s.kind === spot().kind ? { ...s, pos: offsetM(s.pos, 50, 0) } : s;
    const { events } = applyAction(fresh(), { type: 'search', spot: fake, at: fake.pos, accuracyM: 5 }, ctx());
    expect(events[0]).toEqual({ type: 'rejected', reason: 'invalid_spot' });
  });

  it('hat eine Abklingzeit pro Fundstelle', () => {
    const s = spot();
    const a = applyAction(fresh(), { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx()).state;
    expect(applyAction(a, { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx(T0 + 60_000)).events[0]).toEqual({
      type: 'rejected',
      reason: 'cooldown',
    });
    const later = readyAt(a, s);
    expect(applyAction(a, { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx(later)).events[0].type).toBe('loot');
  });

  it('verdoppelt die Beute nach einer Pause (ohne Strafe fürs Wegbleiben)', () => {
    const s = spot();
    const back = applyAction(fresh(), { type: 'session' }, ctx(T0 + 30 * HOUR));
    expect(back.events).toEqual([{ type: 'returnBonus' }]);
    expect(back.state.inventory).toEqual(fresh().inventory);
    const r = applyAction(back.state, { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx(T0 + 30 * HOUR));
    const loot = r.events[0];
    expect(loot.type === 'loot' && loot.bonus).toBe(true);
    expect(r.state.returnBonus).toBe(false);
  });
});

describe('Bus-Ausbau', () => {
  it('baut nur mit genug Material und in der richtigen Reihenfolge', () => {
    let s = fresh();
    expect(applyAction(s, { type: 'build', module: 'rainBarrel' }, ctx()).events[0]).toEqual({ type: 'rejected', reason: 'cost' });
    s = { ...s, inventory: { ...s.inventory, material: 40, water: 10, medicine: 5 } };
    expect(applyAction(s, { type: 'build', module: 'roofGarden' }, ctx()).events[0]).toEqual({ type: 'rejected', reason: 'locked' });
    s = applyAction(s, { type: 'build', module: 'workbench' }, ctx()).state;
    expect(s.inventory.material).toBe(40 - (MODULES.workbench.cost.material ?? 0));
    s = applyAction(s, { type: 'build', module: 'roofGarden' }, ctx()).state;
    expect(s.bus.modules.roofGarden).toBeDefined();
  });

  it('produziert passiv und behält den angefangenen Rest', () => {
    let s = fresh();
    s = { ...s, inventory: { ...s.inventory, material: 10 } };
    s = applyAction(s, { type: 'build', module: 'rainBarrel' }, ctx()).state;
    expect(pendingHarvest(s, T0 + 7 * HOUR)).toEqual({ water: 2 });
    const h = applyAction(s, { type: 'harvest' }, ctx(T0 + 7 * HOUR));
    expect(h.state.inventory.water).toBe(fresh().inventory.water + 2);
    expect(pendingHarvest(h.state, T0 + 9 * HOUR)).toEqual({ water: 1 }); // Rest von 1 h zählt mit
    expect(pendingHarvest(h.state, T0 + 100 * HOUR)).toEqual({ water: 6 }); // gedeckelt
  });
});

describe('Spielstand', () => {
  it('lädt gültige und verwirft kaputte Spielstände', () => {
    const s = fresh();
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(migrate({ foo: 1 })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});
