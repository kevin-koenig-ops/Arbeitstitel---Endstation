import { describe, expect, it } from 'vitest';
import { MODULES } from '../src/core/content';
import { distanceM, offsetM } from '../src/core/geo';
import { applyAction, createPlayer, currentHealth, guardOf, pendingHarvest, readyAt, searchRangeM } from '../src/core/rules';
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
  // Eine Fundstelle, die jetzt und nach Ablauf der Abklingzeit unbewacht ist
  const spot = (): Spot =>
    gridSpotsAround(SEED, HOME, 600).find((s) => !guardOf(SEED, s, T0) && !guardOf(SEED, s, readyAt({ ...fresh(), spots: { [s.id]: T0 } }, s)))!;

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

  it('hebt alte Spielstände (Version 1) auf die neue Version', () => {
    const { health, healthAt, weapons, combat, ...v1 } = fresh();
    void health, healthAt, weapons, combat;
    const old = { ...v1, schema: 1, stats: { searches: 7 } };
    const m = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(m.schema).toBe(3);
    expect(m.explored).toEqual({});
    expect(m.health).toBe(10);
    expect(m.weapons[0].kind).toBe('crowbar');
    expect(m.combat).toBeNull();
    expect(m.stats).toEqual({ searches: 7, kills: 0 });
  });
});

describe('Kampf', () => {
  const guarded = (enemy?: string) =>
    gridSpotsAround(SEED, HOME, 1500).find((s) => {
      const g = guardOf(SEED, s, T0);
      return g && (!enemy || g === enemy);
    })!;
  const engage = (state: PlayerState, s: Spot, now = T0) => applyAction(state, { type: 'engage', spot: s, at: s.pos, accuracyM: 5 }, ctx(now));
  const hit = (state: PlayerState, quality: 'miss' | 'good' | 'perfect' = 'good', move: 'strike' | 'dodge' | 'distract' | 'heal' | 'flee' = 'strike') =>
    applyAction(state, { type: 'fight', move, quality }, ctx());

  it('bewachte Fundstellen kann man nicht einfach durchsuchen', () => {
    const s = guarded();
    expect(applyAction(fresh(), { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx()).events[0]).toEqual({ type: 'rejected', reason: 'guarded' });
    const free = gridSpotsAround(SEED, HOME, 600).find((x) => !guardOf(SEED, x, T0))!;
    expect(engage(fresh(), free).events[0]).toEqual({ type: 'rejected', reason: 'not_guarded' });
  });

  it('gewinnt einen Kampf und bekommt mehr Beute', () => {
    const s = guarded('walker');
    let st = engage(fresh(), s).state;
    expect(st.combat?.enemyHp).toBe(4);
    let events: ReturnType<typeof hit>['events'] = [];
    for (let i = 0; i < 6 && st.combat; i++) ({ state: st, events } = hit(st, 'perfect'));
    expect(st.combat).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['round', 'combatWon', 'loot']);
    expect(st.stats.kills).toBe(1);
    expect(readyAt(st, s)).toBeGreaterThan(T0);
    expect(st.weapons[0].dur).toBeLessThan(14);
  });

  it('Ausweichen schützt, Ablenken kostet Material und betäubt', () => {
    const s = guarded();
    const st = engage(fresh(), s).state;
    const d = hit(st, 'perfect', 'dodge');
    const dr = d.events[0];
    expect(dr.type === 'round' && dr.taken).toBe(0);
    expect(d.state.combat?.opening).toBe(true);
    const x = hit(st, 'good', 'distract');
    const xr = x.events[0];
    expect(xr.type === 'round' && xr.stunned && xr.taken === 0).toBe(true);
    expect(x.state.inventory.material).toBe(st.inventory.material - 1);
  });

  it('verliert man, fällt nur etwas aus dem Rucksack, und die Gesundheit kommt zurück', () => {
    const s = guarded('brute');
    let st: PlayerState = { ...fresh(), health: 2, weapons: [] };
    st = engage(st, s).state;
    let events: ReturnType<typeof hit>['events'] = [];
    for (let i = 0; i < 10 && st.combat; i++) ({ state: st, events } = hit(st, 'miss'));
    const lost = events.find((e) => e.type === 'combatLost');
    expect(lost).toBeDefined();
    expect(st.health).toBe(0);
    expect(st.bus).toEqual(fresh().bus);
    expect(engage(st, s).events[0]).toEqual({ type: 'rejected', reason: 'exhausted' });
    expect(currentHealth(st, T0 + 3 * HOUR)).toBe(9);
  });

  it('Fliehen geht immer und kostet nichts', () => {
    const s = guarded();
    const st = engage(fresh(), s).state;
    const f = hit(st, 'miss', 'flee');
    expect(f.events).toEqual([{ type: 'fled' }]);
    expect(f.state.inventory).toEqual(fresh().inventory);
    expect(f.state.combat).toBeNull();
  });

  it('Waffen herstellen und mit Medizin heilen', () => {
    let st = { ...fresh(), inventory: { food: 0, water: 0, medicine: 2, material: 30 }, health: 5 };
    expect(applyAction(st, { type: 'craft', weapon: 'bat' }, ctx()).events[0]).toEqual({ type: 'rejected', reason: 'locked' });
    st = applyAction(st, { type: 'build', module: 'workbench' }, ctx()).state;
    st = applyAction(st, { type: 'craft', weapon: 'bat' }, ctx()).state;
    expect(st.weapons.map((w) => w.kind)).toEqual(['crowbar', 'bat']);
    const healed = applyAction(st, { type: 'heal' }, ctx());
    expect(healed.state.health).toBe(9);
    expect(healed.state.inventory.medicine).toBe(1);
  });
});
