import { describe, expect, it } from 'vitest';
import { emptyInventory, KRAM_ORDER } from '../src/core/content';
import { distanceM, offsetM } from '../src/core/geo';
import { activePlot, applyAction, createPlayer, currentHealth, guardOf, pendingHarvest, placementProblem, readyAt, SCHEMA_VERSION, searchRangeM } from '../src/core/rules';
import { migrate } from '../src/core/save';
import type { Character, PlayerState, Spot, WeaponId } from '../src/core/types';
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
    const a = gridSpotsAround(SEED, HOME, 500, T0);
    const b = gridSpotsAround(SEED, offsetM(HOME, 3, 2), 500, T0).filter((s) => distanceM(HOME, s.pos) <= 500);
    expect(a.length).toBeGreaterThan(5);
    expect(b.map((s) => s.id).sort()).toEqual(a.map((s) => s.id).sort());
  });

  it('kann Grid-Fundstellen aus der ID nachrechnen', () => {
    const [s] = gridSpotsAround(SEED, HOME, 400, T0);
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
  const spot = (now = T0): Spot =>
    gridSpotsAround(SEED, HOME, 600, now).find((s) => !guardOf(SEED, s, now) && !guardOf(SEED, s, readyAt({ ...fresh(), spots: { [s.id]: now } }, s)))!;

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
    const s = spot(T0 + 30 * HOUR);
    const back = applyAction(fresh(), { type: 'session' }, ctx(T0 + 30 * HOUR));
    expect(back.events).toEqual([{ type: 'returnBonus' }]);
    expect(back.state.inventory).toEqual(fresh().inventory);
    const r = applyAction(back.state, { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx(T0 + 30 * HOUR));
    const loot = r.events[0];
    expect(loot.type === 'loot' && loot.bonus).toBe(true);
    expect(r.state.returnBonus).toBe(false);
  });
});

describe('Anlagen zu Hause', () => {
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
    expect(m.schema).toBe(SCHEMA_VERSION);
    expect(m.base).toEqual({ active: null, plots: {}, found: {} });
    expect(m.explored).toEqual({});
    expect(m.health).toBe(10);
    expect(m.weapons[0].kind).toBe('crowbar');
    expect(m.combat).toBeNull();
    expect(m.stats).toEqual({ searches: 7, kills: 0, unpacks: 0, dismantled: 0, crafted: 0, caches: 0, cooked: 0 });
    expect(m.caches).toEqual([]);
    expect(m.dig).toBeNull();
    expect(m.seen).toEqual([]);
  });
});

describe('Kampf', () => {
  const guarded = (enemy?: string) =>
    gridSpotsAround(SEED, HOME, 1500, T0).find((s) => {
      const g = guardOf(SEED, s, T0);
      return g && (!enemy || g === enemy);
    })!;
  const engage = (state: PlayerState, s: Spot, now = T0) => applyAction(state, { type: 'engage', spot: s, at: s.pos, accuracyM: 5 }, ctx(now));
  const result = (state: PlayerState, outcome: 'won' | 'lost' | 'fled', o: { health?: number; kills?: number; wear?: Partial<Record<WeaponId, number>> } = {}) =>
    applyAction(state, { type: 'battleResult', outcome, health: o.health ?? state.health, kills: o.kills ?? 1, usedMedicine: 0, wear: o.wear }, ctx());

  it('bewachte Fundstellen kann man nicht einfach durchsuchen', () => {
    const s = guarded();
    expect(applyAction(fresh(), { type: 'search', spot: s, at: s.pos, accuracyM: 5 }, ctx()).events[0]).toEqual({ type: 'rejected', reason: 'guarded' });
    const free = gridSpotsAround(SEED, HOME, 600, T0).find((x) => !guardOf(SEED, x, T0))!;
    expect(engage(fresh(), free).events[0]).toEqual({ type: 'rejected', reason: 'not_guarded' });
  });

  it('eine Wache bringt immer dieselbe Gruppe mit', () => {
    const s = guarded();
    const a = engage(fresh(), s).state.combat!;
    const b = engage(fresh(), s).state.combat!;
    expect(a.group).toEqual(b.group);
    expect(a.group[0]).toBe(a.enemy);
    expect(a.group.length).toBeLessThanOrEqual(3);
  });

  it('gewinnt einen Kampf, bekommt mehr Beute und darf danach wühlen', () => {
    const s = guarded('walker');
    const st = engage(fresh(), s).state;
    const w = st.weapons[0];
    const r = result(st, 'won', { kills: 2, wear: { [w.kind]: 3 } });
    expect(r.state.combat).toBeNull();
    expect(r.events.map((e) => e.type).slice(0, 2)).toEqual(['combatWon', 'loot']);
    expect(r.state.stats.kills).toBe(2);
    expect(readyAt(r.state, s)).toBeGreaterThan(T0);
    expect(r.state.weapons[0].dur).toBe(w.dur - 3);
    expect(r.state.dig?.spot.id).toBe(s.id);
  });

  it('verliert man, ist alles aus dem Rucksack weg (Lager bleibt), und die Gesundheit kommt zurück', () => {
    const s = guarded('brute');
    let st: PlayerState = { ...fresh(), health: 2, pack: { metal: 4, cloth: 4 }, packKram: { [KRAM_ORDER[0]]: 2 } };
    const home = { ...st.inventory };
    st = engage(st, s).state;
    const r = result(st, 'lost', { health: 0 });
    expect(r.events[0]).toMatchObject({ type: 'combatLost', dropped: { metal: 4, cloth: 4 }, droppedKram: { [KRAM_ORDER[0]]: 2 } });
    expect(r.state.pack).toEqual({});
    expect(r.state.packKram).toEqual({});
    expect(r.state.inventory).toEqual(home);
    expect(r.state.health).toBe(0);
    expect(engage(r.state, s).events[0]).toEqual({ type: 'rejected', reason: 'exhausted' });
    expect(currentHealth(r.state, T0 + 3 * HOUR)).toBe(9);
  });

  it('Fliehen geht immer und kostet nichts', () => {
    const s = guarded();
    const st = engage(fresh(), s).state;
    const f = result(st, 'fled');
    expect(f.events).toEqual([{ type: 'fled', weaponBroke: undefined }]);
    expect(f.state.inventory).toEqual(fresh().inventory);
    expect(f.state.weapons).toEqual(fresh().weapons);
    expect(f.state.combat).toBeNull();
  });

  it('mit Medizin heilen', () => {
    const st: PlayerState = { ...fresh(), inventory: { ...emptyInventory(), medicine: 2 }, health: 5 };
    const healed = applyAction(st, { type: 'heal' }, ctx());
    expect(healed.state.health).toBe(9);
    expect(healed.state.inventory.medicine).toBe(1);
  });
});

describe('Unterholz', () => {
  const roam = (s: PlayerState, now: number, i: number) =>
    applyAction(s, { type: 'roam', at: offsetM(HOME, i * 25, 0), accuracyM: 5, meters: 25, terrain: 'forest' }, ctx(now));

  it('bringt quer durch den Wald manchmal eine Begegnung, danach ist Ruhe', () => {
    let s = fresh();
    let met = -1;
    for (let i = 0; i < 400 && met < 0; i++) {
      const r = roam(s, T0 + i * 61_000, i);
      s = r.state;
      if (r.events.some((e) => e.type === 'wild')) met = i;
    }
    expect(met).toBeGreaterThanOrEqual(0);
    expect(s.combat?.wild).toBe(true);
    expect(s.combat?.group.length).toBeGreaterThan(0);
    // Solange der Kampf läuft und kurz danach: keine neue Begegnung
    const again = roam({ ...s, combat: null }, T0 + met * 61_000 + 60_000, met + 1);
    expect(again.events.some((e) => e.type === 'wild')).toBe(false);
  });

  it('lässt Erschöpfte in Ruhe', () => {
    let s = { ...fresh(), health: 1, healthAt: T0 };
    let any = false;
    // Kurz hintereinander (keine Zeit zum Erholen), an vielen Stellen
    for (let i = 0; i < 200; i++) {
      const r = roam(s, T0 + i * 1000, i);
      s = r.state;
      any ||= r.events.some((e) => e.type === 'wild');
    }
    expect(any).toBe(false);
  });
});

describe('Bleicher Wächter', () => {
  it('bewacht Fundstellen nur nachts', () => {
    const spots = gridSpotsAround(SEED, HOME, 1500, T0);
    const day = Date.UTC(2026, 6, 1, 11);
    const night = Date.UTC(2026, 6, 1, 23);
    let atDay = 0;
    let atNight = 0;
    for (const sp of spots)
      for (let h = 0; h < 6; h++) {
        if (guardOf(SEED, sp, day + h * 600_000) === 'watcher') atDay++;
        if (guardOf(SEED, sp, night + h * 600_000) === 'watcher') atNight++;
      }
    expect(atDay).toBe(0);
    expect(atNight).toBeGreaterThan(0);
  });

  it('bringt besondere Beute und beim ersten Mal sein Tagebuch', () => {
    let s = fresh();
    s = applyAction(s, { type: 'testFight', at: HOME, group: ['watcher'] }, ctx()).state;
    expect(s.combat?.group).toEqual(['watcher']);
    const r = applyAction(s, { type: 'battleResult', outcome: 'won', health: 8, kills: 1, usedMedicine: 0 }, ctx());
    const loot = r.events.find((e) => e.type === 'loot');
    expect(loot && loot.type === 'loot' && loot.memento).toBe('cellarDiary');
    expect(loot && loot.type === 'loot' && loot.kram).toBe('flashlight');
    expect(r.state.collection.cellarDiary).toBeDefined();
    expect(r.state.inventory.medicine).toBeGreaterThan(s.inventory.medicine);
  });
});
