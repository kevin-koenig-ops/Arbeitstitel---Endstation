import { describe, expect, it } from 'vitest';
import { emptyInventory } from '../src/core/content';
import { distanceM, offsetM } from '../src/core/geo';
import { activePlot, applyAction, createPlayer, currentHealth, guardOf, pendingHarvest, placementProblem, readyAt, searchRangeM } from '../src/core/rules';
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
    // Vorräte kommen gleich in die Taschen, Rohstoffe in den Rucksack
    const total = Object.values(state.inventory).reduce((a, b) => a + b, 0) + Object.values(state.pack).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeGreaterThan(Object.values(fresh().inventory).reduce((a, b) => a + b, 0));
    expect(state.inventory.wood).toBe(fresh().inventory.wood);
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

describe('Anlagen in der Endstation', () => {
  /** Im Depot wohnen, genug im Lager, eine Anlage aufstellen. */
  const withItem = (kind: 'rainBarrel' | 'workbench'): PlayerState => {
    let s: PlayerState = { ...fresh(), inventory: { ...emptyInventory(), wood: 40, metal: 40, plastic: 10, screws: 10, water: 2, medicine: 2 } };
    s = applyAction(s, { type: 'chooseSite', site: 'depot' }, ctx()).state;
    for (let y = 26; y < 46; y++)
      for (let x = 26; x < 46; x++)
        if (!placementProblem(s, kind, x, y, 0)) return applyAction(s, { type: 'place', kind, x, y, rot: 0 }, ctx()).state;
    throw new Error('kein Platz');
  };

  it('Regentonne sammelt von selbst und behält den angefangenen Rest', () => {
    const s = withItem('rainBarrel');
    const uid = activePlot(s)!.items[0].uid;
    expect(pendingHarvest(s, T0 + 7 * HOUR)).toEqual({ water: 2 });
    const h = applyAction(s, { type: 'harvest', uid }, ctx(T0 + 7 * HOUR));
    expect(h.state.inventory.water).toBe(s.inventory.water + 2);
    expect(pendingHarvest(h.state, T0 + 9 * HOUR)).toEqual({ water: 1 }); // Rest von 1 h zählt mit
    expect(pendingHarvest(h.state, T0 + 100 * HOUR)).toEqual({ water: 6 }); // gedeckelt
    expect(applyAction(h.state, { type: 'harvest', uid }, ctx(T0 + 7 * HOUR)).events[0]).toEqual({ type: 'rejected', reason: 'nothing' });
  });

  it('Einlagern verliert nichts: Gesammeltes kommt mit ins Lager', () => {
    const s = withItem('rainBarrel');
    const uid = activePlot(s)!.items[0].uid;
    const r = applyAction(s, { type: 'store', uid }, ctx(T0 + 7 * HOUR));
    expect(r.state.inventory.water).toBe(s.inventory.water + 2);
    expect(r.events[0]).toMatchObject({ type: 'stored', refund: { water: 2 } });
  });

  it('Waffen baut man am Werktisch, die Armbrust erst ab Stufe 2', () => {
    expect(applyAction(fresh(), { type: 'craft', weapon: 'bat' }, ctx()).events[0]).toEqual({ type: 'rejected', reason: 'no_workbench' });
    let s = withItem('workbench');
    s = applyAction(s, { type: 'craft', weapon: 'bat' }, ctx()).state;
    expect(s.weapons.map((w) => w.kind)).toEqual(['crowbar', 'bat']);
    expect(applyAction(s, { type: 'craft', weapon: 'crossbow' }, ctx()).events[0]).toEqual({ type: 'rejected', reason: 'locked' });
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
    expect(m.schema).toBe(8);
    expect(m.base).toEqual({ active: null, plots: {}, found: {} });
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

  it('Ausweichen schützt, Ablenken kostet Metall und betäubt', () => {
    const s = guarded();
    const st = engage(fresh(), s).state;
    const d = hit(st, 'perfect', 'dodge');
    const dr = d.events[0];
    expect(dr.type === 'round' && dr.taken).toBe(0);
    expect(d.state.combat?.opening).toBe(true);
    const x = hit(st, 'good', 'distract');
    const xr = x.events[0];
    expect(xr.type === 'round' && xr.stunned && xr.taken === 0).toBe(true);
    expect(x.state.inventory.metal).toBe(st.inventory.metal - 1);
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

  it('mit Medizin heilen', () => {
    const st: PlayerState = { ...fresh(), inventory: { ...emptyInventory(), medicine: 2 }, health: 5 };
    const healed = applyAction(st, { type: 'heal' }, ctx());
    expect(healed.state.health).toBe(9);
    expect(healed.state.inventory.medicine).toBe(1);
  });
});
