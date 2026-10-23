import { describe, expect, it } from 'vitest';
import { cellFree, type PlotIndex } from '../src/core/building';
import { CARDS, ONCE_CARDS, SKILL_CARDS, skillLevel, SKILL_SLOTS } from '../src/core/content';
import { applyAction, battleWeapons, cardKit, createPlayer, plotIndexOf, pouchKit, SCHEMA_VERSION, skillOf } from '../src/core/rules';
import { migrate } from '../src/core/save';
import { SIGHT, sightingById, sightingsNear, type Sighting } from '../src/core/sightings';
import { gridSpotsAround } from '../src/core/world';
import type { Action, Character, GameEvent, PlayerState } from '../src/core/types';

const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const T0 = Date.UTC(2026, 9, 22, 12);
const SEED = 'test-seed';
const HOME = { lat: 52.52, lon: 13.405 };
const act = (s: PlayerState, a: Action, now = T0) => applyAction(s, a, { now, worldSeed: SEED });
const ev = (s: PlayerState, a: Action, now = T0) => act(s, a, now).events[0];

function freeRect(idx: PlotIndex, w: number, h: number): { x: number; y: number } {
  for (let y = 24; y + h <= 48; y++)
    for (let x = 24; x + w <= 48; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w; dx++) if (!cellFree(idx, x + dx, y + dy)) ok = false;
      if (ok) return { x, y };
    }
  throw new Error('kein Platz');
}

function withWorkbench(): PlayerState {
  let s = createPlayer('p', hero, T0);
  for (const k of Object.keys(s.inventory) as (keyof typeof s.inventory)[]) s.inventory[k] = 50;
  s = act(s, { type: 'chooseSite', site: 'depot' }).state;
  const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
  return act(s, { type: 'place', kind: 'workbench', x, y, rot: 0 }).state;
}

/** Die erste Sichtung in der Nähe, die zur Bedingung passt (sucht notfalls in späteren Zeitfenstern). */
function findSighting(want: (s: Sighting) => boolean = () => true): { s: Sighting; at: number } {
  for (let k = 0; k < 400; k++) {
    const at = T0 + k * SIGHT.slotMs;
    const hit = sightingsNear(SEED, HOME, at, 3000).find(want);
    if (hit) return { s: hit, at };
  }
  throw new Error('keine Sichtung gefunden');
}

const claim = (st: PlayerState, s: Sighting, at: number, candidate = 0, pos = s.candidates[candidate]) =>
  act(st, { type: 'claimSighting', id: s.id, candidate, at: pos, accuracyM: 5 }, at);

describe('Sammelkarten', () => {
  it('jede Fähigkeit und jede Einmal-Karte steht in ihrer Liste (Sammelbuch, Lager)', () => {
    for (const [id, c] of Object.entries(CARDS)) {
      if (c.kind === 'skill') expect(SKILL_CARDS, id).toContain(id);
      if (c.kind === 'once') expect(ONCE_CARDS, id).toContain(id);
    }
  });

  it('neue Spieler haben ein leeres Sammelbuch', () => {
    const s = createPlayer('p', hero, T0);
    expect(s.book).toEqual({});
    expect(s.packCards).toEqual({});
    expect(s.stash).toEqual({});
    expect(s.pity).toEqual({ rare: 0, legendary: 0 });
  });

  it('Fähigkeiten steigen mit Kopien: 1 → I, 4 → II, 10 → III', () => {
    expect([0, 1, 3, 4, 9, 10, 30].map((n) => skillLevel(n))).toEqual([0, 1, 1, 2, 2, 3, 3]);
    // Seltene Karten steigen mit weniger Doppelten auf, Legenden bis Stufe V
    expect([0, 1, 2, 3, 4, 5].map((n) => skillLevel(n, 'epic'))).toEqual([0, 1, 2, 2, 3, 3]);
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => skillLevel(n, 'legendary'))).toEqual([0, 1, 2, 3, 4, 5, 5]);
    const s = createPlayer('p', hero, T0);
    s.book.counter = { n: 4, at: T0 };
    expect(skillOf(s, 'counter')).toBe(2);
    // Nur was zu Hause gewählt ist, geht mit in den Kampf
    expect(cardKit(s, T0).skills).toEqual({});
    s.loadout.skills = ['counter'];
    expect(cardKit(s, T0).skills).toEqual({ counter: 2 });
  });

  it('Werktisch: Brandflasche bauen, landet im Lager und gleich im Rucksack (höchstens 3)', () => {
    let s = withWorkbench();
    const glass = s.inventory.glass;
    for (let i = 0; i < 4; i++) {
      const r = act(s, { type: 'craftCard', card: 'molotov' });
      expect(r.events[0]).toMatchObject({ type: 'crafted', card: 'molotov' });
      s = r.state;
    }
    expect(s.inventory.glass).toBe(glass - 4 * (CARDS.molotov.craft!.glass ?? 0));
    expect(s.packCards.molotov).toBe(3);
    expect(s.stash.molotov).toBe(1);
    expect(s.book.molotov.n).toBe(4);
    // Nicht baubar: Granate (gibt es nur draußen)
    expect(ev(s, { type: 'craftCard', card: 'grenade' })).toEqual({ type: 'rejected', reason: 'locked' });
  });

  it('ohne Werktisch keine Karten bauen', () => {
    const s = createPlayer('p', hero, T0);
    for (const k of Object.keys(s.inventory) as (keyof typeof s.inventory)[]) s.inventory[k] = 50;
    expect(ev(s, { type: 'craftCard', card: 'molotov' })).toEqual({ type: 'rejected', reason: 'no_workbench' });
  });

  it('Kampf: gespielte Einmal-Karten sind weg, bei Niederlage alle mitgenommenen', () => {
    const spot = gridSpotsAround(SEED, HOME, 400, T0)[0];
    let s = createPlayer('p', hero, T0);
    s.packCards = { molotov: 2, pepper: 1 };
    s.combat = { spot, enemy: 'walker', group: ['walker'], window: 0 };
    s = act(s, { type: 'battleResult', outcome: 'fled', health: 8, kills: 0, usedMedicine: 0, used: { molotov: 1, pepper: 5 } }).state;
    expect(s.packCards).toEqual({ molotov: 1 });
    s.combat = { spot, enemy: 'walker', group: ['walker'], window: 0 };
    const r = act(s, { type: 'battleResult', outcome: 'lost', health: 0, kills: 0, usedMedicine: 0 });
    expect(r.state.packCards).toEqual({});
    expect(r.events[0]).toMatchObject({ type: 'combatLost', droppedCards: { molotov: 1 } });
  });

  it('Letztes Gefecht: einmal am Tag', () => {
    const spot = gridSpotsAround(SEED, HOME, 400, T0)[0];
    let s = createPlayer('p', hero, T0);
    s.book.laststand = { n: 1, at: T0 };
    s.loadout.skills = ['laststand'];
    expect(cardKit(s, T0).lastStand).toBe(true);
    s.combat = { spot, enemy: 'walker', group: ['walker'], window: 0 };
    s = act(s, { type: 'battleResult', outcome: 'fled', health: 1, kills: 0, usedMedicine: 0, lastStand: true }).state;
    expect(cardKit(s, T0 + 3600_000).lastStand).toBe(false);
    expect(cardKit(s, T0 + 25 * 3600_000).lastStand).toBe(true);
  });

  it('Spielstand 15 bekommt ein leeres Sammelbuch', () => {
    const old = JSON.parse(JSON.stringify(createPlayer('p', hero, T0))) as Record<string, unknown>;
    old.schema = 15;
    for (const k of ['packCards', 'stash', 'book', 'sightings', 'pity']) delete old[k];
    const m = migrate(old)!;
    expect(m.schema).toBe(SCHEMA_VERSION);
    expect(m.book).toEqual({});
    expect(m.pity).toEqual({ rare: 0, legendary: 0 });
    expect(m.loadout).toEqual({ pouch: [], skills: [] });
  });

  it('Spielstand 16: Tasche und Fähigkeiten werden sinnvoll vorbelegt', () => {
    const old = JSON.parse(JSON.stringify(createPlayer('p', hero, T0))) as Record<string, unknown>;
    old.schema = 16;
    delete old.loadout;
    old.packCards = { molotov: 3, pepper: 1 };
    old.stash = { smoke: 5, lure: 2 };
    old.book = { molotov: { n: 3, at: T0 }, pepper: { n: 1, at: T0 }, smoke: { n: 5, at: T0 }, lure: { n: 2, at: T0 }, counter: { n: 4, at: T0 }, steady: { n: 1, at: T0 }, breath: { n: 1, at: T0 }, radio: { n: 1, at: T0 }, laststand: { n: 1, at: T0 } };
    const m = migrate(old)!;
    expect(m.loadout.pouch).toEqual(['smoke', 'molotov', 'lure']);
    expect(m.loadout.skills.length).toBe(SKILL_SLOTS);
    expect(m.loadout.skills.slice(0, 3)).toEqual(['laststand', 'radio', 'counter']);
  });
});

describe('Für den Kampf packen (Tasche und Fähigkeiten)', () => {
  it('Neues kommt von selbst in einen freien Platz', () => {
    let s = createPlayer('p', hero, T0);
    for (const card of ['molotov', 'smoke', 'pepper', 'grenade'] as const) s = act(s, { type: 'testGift', card }).state;
    expect(s.loadout.pouch).toEqual(['molotov', 'smoke', 'pepper']);
    for (const card of ['counter', 'steady', 'breath', 'spark', 'radio'] as const) s = act(s, { type: 'testGift', card }).state;
    expect(s.loadout.skills).toEqual(['counter', 'steady', 'breath', 'spark']);
    // Unterwegs Gefundenes füllt nur freie Taschenplätze
    expect(Object.keys(pouchKit(s))).toEqual(['molotov', 'smoke', 'pepper']);
    s.packCards.molotov = 0;
    expect(Object.keys(pouchKit(s))).toEqual(['smoke', 'pepper', 'grenade']);
  });

  it('wählen: höchstens 3 Sorten und 4 Fähigkeiten, nur was man hat', () => {
    let s = createPlayer('p', hero, T0);
    for (const card of ['molotov', 'smoke', 'pepper', 'grenade', 'counter', 'steady'] as const) s = act(s, { type: 'testGift', card }).state;
    expect(ev(s, { type: 'setLoadout', pouch: ['molotov', 'smoke', 'pepper', 'grenade'] })).toEqual({ type: 'rejected', reason: 'too_many' });
    expect(ev(s, { type: 'setLoadout', pouch: ['flare'] })).toEqual({ type: 'rejected', reason: 'not_found' });
    expect(ev(s, { type: 'setLoadout', skills: ['radio'] })).toEqual({ type: 'rejected', reason: 'not_found' });
    expect(ev(s, { type: 'setLoadout', skills: ['molotov'] })).toEqual({ type: 'rejected', reason: 'not_found' });
    const r = act(s, { type: 'setLoadout', pouch: ['grenade', 'molotov'], skills: ['steady'] });
    expect(r.events[0]).toEqual({ type: 'loadoutSet', pouch: ['grenade', 'molotov'], skills: ['steady'] });
    // Was nicht in die Tasche gehört, liegt jetzt im Lager
    expect(r.state.packCards).toEqual({ grenade: 1, molotov: 1 });
    expect(r.state.stash).toEqual({ smoke: 1, pepper: 1 });
    expect(cardKit(r.state, T0).skills).toEqual({ steady: 1 });
  });

  it('Auspacken: Sorten außerhalb der Tasche kommen ins Lager, die Tasche wird aufgefüllt', () => {
    let s = withWorkbench();
    s = act(s, { type: 'setLoadout', pouch: [] }).state;
    s.book.molotov = { n: 5, at: T0 };
    s.book.pepper = { n: 1, at: T0 };
    s.stash = { molotov: 4 };
    s.loadout.pouch = ['molotov'];
    s.packCards = { pepper: 1, molotov: 1 };
    const r = act(s, { type: 'unpack' });
    expect(r.events[0]).toMatchObject({ type: 'unpacked' });
    expect(r.state.packCards).toEqual({ molotov: 3 });
    expect(r.state.stash).toEqual({ molotov: 2, pepper: 1 });
  });

  it('Waffen: je eine für Nahkampf und Fernkampf, sonst die stärkste', () => {
    const s = createPlayer('p', hero, T0);
    s.weapons = [
      { kind: 'crowbar', dur: 20 },
      { kind: 'bat', dur: 30 },
      { kind: 'axe', dur: 5 },
      { kind: 'golfclub', dur: 10 },
      { kind: 'slingshot', dur: 30 },
    ];
    expect(battleWeapons(s).map((w) => w.kind)).toEqual(['axe', 'golfclub']);
    expect(ev(s, { type: 'setLoadout', ranged: 'crowbar' })).toEqual({ type: 'rejected', reason: 'not_found' });
    expect(ev(s, { type: 'setLoadout', melee: 'crossbow' })).toEqual({ type: 'rejected', reason: 'not_found' });
    let r = act(s, { type: 'setLoadout', melee: 'crowbar', ranged: 'slingshot' });
    expect(battleWeapons(r.state).map((w) => w.kind)).toEqual(['crowbar', 'slingshot']);
    // Gewählte kaputt: dann die stärkste ihrer Art
    r.state.weapons = r.state.weapons.filter((w) => w.kind !== 'crowbar');
    expect(battleWeapons(r.state).map((w) => w.kind)).toEqual(['axe', 'slingshot']);
    // null: wieder automatisch
    r = act(r.state, { type: 'setLoadout', ranged: null });
    expect(r.state.loadout.ranged).toBeUndefined();
    expect(battleWeapons(r.state).map((w) => w.kind)).toEqual(['axe', 'golfclub']);
    // Ohne Fernkampfwaffe: nur die Nahkampfwaffe
    const start = createPlayer('p', hero, T0);
    expect(battleWeapons(start).map((w) => w.kind)).toEqual(['crowbar']);
  });

  it('Plündererin wirkt nur, wenn man sie mitnimmt', () => {
    const spot = gridSpotsAround(SEED, HOME, 400, T0)[0];
    const fight = (st: PlayerState) => {
      const x = JSON.parse(JSON.stringify(st)) as PlayerState;
      x.combat = { spot, enemy: 'walker', group: ['walker'], window: 0, ambush: true };
      const e = act(x, { type: 'battleResult', outcome: 'won', health: 8, kills: 1, usedMedicine: 0 }).events.find((y) => y.type === 'loot') as Extract<GameEvent, { type: 'loot' }>;
      return Object.values(e.items).reduce((a, b) => a + (b ?? 0), 0);
    };
    const s = createPlayer('p', hero, T0);
    s.book.scavenger = { n: 1, at: T0 };
    const without = fight(s);
    s.loadout.skills = ['scavenger'];
    expect(fight(s)).toBe(without + 1);
  });
});

describe('Sichtungen', () => {
  it('alle sehen dieselben Sichtungen (fester Weltstartwert)', () => {
    const a = sightingsNear(SEED, HOME, T0, 1500);
    const b = sightingsNear(SEED, HOME, T0, 1500);
    expect(a).toEqual(b);
    // Im Umkreis von 1,5 km ist praktisch immer etwas los
    expect(a.length).toBeGreaterThan(0);
    for (const s of a) {
      expect(T0).toBeGreaterThanOrEqual(s.from);
      expect(T0).toBeLessThan(s.until);
      expect(sightingById(SEED, s.id)).toEqual(s);
    }
  });

  it('einsammeln: nah genug, nur einmal, nur solange sie da ist', () => {
    const { s, at } = findSighting();
    const st = createPlayer('p', hero, T0);
    // Zu weit weg
    const far = { lat: s.candidates[0].lat + 0.002, lon: s.candidates[0].lon };
    expect(claim(st, s, at, 0, far).events[0]).toEqual({ type: 'rejected', reason: 'too_far' });
    // Dran
    const r = claim(st, s, at);
    const e = r.events[0] as Extract<GameEvent, { type: 'sightingClaimed' }>;
    expect(e.type).toBe('sightingClaimed');
    expect(!!e.card || !!e.weapon).toBe(true);
    const key = e.card ?? `w:${e.weapon}`;
    expect(r.state.book[key].n).toBe(1);
    // Zweimal geht nicht
    expect(claim(r.state, s, at).events[0]).toEqual({ type: 'rejected', reason: 'already' });
    // Vorbei
    expect(claim(st, s, s.until).events[0]).toEqual({ type: 'rejected', reason: 'gone' });
    // Ausgedachte Sichtung
    expect(ev(st, { type: 'claimSighting', id: 'v:1:2:3x', candidate: 0, at: HOME, accuracyM: 5 })).toEqual({ type: 'rejected', reason: 'not_found' });
  });

  it('eine Einmal-Karte aus einer Sichtung kommt in den Rucksack', () => {
    const { s, at } = findSighting((x) => !!x.card && CARDS[x.card].kind === 'once');
    const st = createPlayer('p', hero, T0);
    st.pity.rare = 0;
    const r = claim(st, s, at);
    const e = r.events[0] as Extract<GameEvent, { type: 'sightingClaimed' }>;
    if (e.card && CARDS[e.card].kind === 'once') expect(r.state.packCards[e.card]).toBe(1);
  });

  it('Glück mit Netz: nach 20 Sichtungen ohne Seltenes kommt etwas Seltenes', () => {
    const { s, at } = findSighting((x) => x.rarity === 'common');
    const st = createPlayer('p', hero, T0);
    st.pity.rare = SIGHT.pityRare - 1;
    const r = claim(st, s, at);
    const e = r.events[0] as Extract<GameEvent, { type: 'sightingClaimed' }>;
    expect(e.rarity).not.toBe('common');
    expect(e.pity).toBe(true);
    expect(r.state.pity.rare).toBe(0);
  });

  it('Glück mit Netz: nach 100 Sichtungen etwas Legendäres', () => {
    const { s, at } = findSighting((x) => x.rarity !== 'legendary');
    const st = createPlayer('p', hero, T0);
    st.pity.legendary = SIGHT.pityLegendary - 1;
    const r = claim(st, s, at);
    const e = r.events[0] as Extract<GameEvent, { type: 'sightingClaimed' }>;
    expect(e.rarity).toBe('legendary');
    expect(r.state.pity.legendary).toBe(0);
  });

  it('gefundene Waffe: neu dazu, oder die vorhandene wird wieder heil', () => {
    const { s, at } = findSighting((x) => !!x.weapon);
    const st = createPlayer('p', hero, T0);
    st.pity.rare = 0;
    const r1 = claim(st, s, at);
    const e1 = r1.events[0] as Extract<GameEvent, { type: 'sightingClaimed' }>;
    expect(e1.weapon).toBe(s.weapon);
    expect(e1.repaired).toBe(false);
    expect(r1.state.weapons.some((w) => w.kind === s.weapon)).toBe(true);
    // Abgenutzt, dann die gleiche Waffe nochmal finden
    const st2 = r1.state;
    st2.weapons.find((w) => w.kind === s.weapon)!.dur = 1;
    delete st2.sightings[s.id];
    const r2 = claim(st2, s, at);
    const e2 = r2.events[0] as Extract<GameEvent, { type: 'sightingClaimed' }>;
    expect(e2.repaired).toBe(true);
    expect(r2.state.weapons.filter((w) => w.kind === s.weapon).length).toBe(1);
    expect(r2.state.weapons.find((w) => w.kind === s.weapon)!.dur).toBeGreaterThan(1);
  });
});
