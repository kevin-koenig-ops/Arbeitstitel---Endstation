import { describe, expect, it } from 'vitest';
import type { FurnitureId } from '../src/core/furniture';
import { CACHE, CART, COOK, DIG, MAX_HEALTH, RADIO, TIER_PERKS } from '../src/core/content';
import { distanceM } from '../src/core/geo';
import { claimableGoals, GOALS, rankOf, visibleGoals } from '../src/core/progress';
import { applyAction, basePerks, cartOf, createPlayer, guardOf, placementProblem, readyAt, regenMs, searchRangeM, whereToFind, workbenchSlots } from '../src/core/rules';
import type { Action, Character, GameEvent, PlayerState, Spot } from '../src/core/types';
import { gridSpotsAround } from '../src/core/world';

const SEED = 'test-seed';
const HOME = { lat: 51.6, lon: 10.2 };
const HOUR = 3600_000;
const T0 = Date.UTC(2026, 9, 20, 12);
const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const ctx = (now = T0) => ({ now, worldSeed: SEED });
const act = (s: PlayerState, a: Action, now = T0) => applyAction(s, a, ctx(now));
const fresh = () => createPlayer('player-1', hero, T0);
const rich = (): PlayerState => ({ ...fresh(), inventory: { food: 50, water: 50, medicine: 5, wood: 500, metal: 500, stone: 500, cloth: 500, plastic: 500, glass: 500, glue: 500, screws: 500, electronics: 500 } });
const settled = () => act(rich(), { type: 'chooseSite', site: 'depot' }).state;
const free = (now = T0) => gridSpotsAround(SEED, HOME, 1500, now).filter((x) => !guardOf(SEED, x, now) && !cartOf(SEED, x, now));
const search = (s: PlayerState, spot: Spot, quality?: 'miss' | 'good' | 'perfect', now = T0) => act(s, { type: 'search', spot, at: spot.pos, accuracyM: 5, quality }, now);
const loot = (events: GameEvent[]) => events.find((e) => e.type === 'loot') as Extract<GameEvent, { type: 'loot' }>;
const total = (items: Partial<Record<string, number>>): number => Object.values(items).reduce<number>((a, b) => a + (b ?? 0), 0);

/** Freien Platz für ein Teil suchen (beachtet auch schon Aufgestelltes). */
function spotFor(s: PlayerState, kind: FurnitureId): { x: number; y: number } {
  for (let y = 24; y < 48; y++) for (let x = 24; x < 48; x++) if (!placementProblem(s, kind, x, y, 0)) return { x, y };
  throw new Error('kein Platz');
}
function place(s: PlayerState, kind: 'stove' | 'radioSet' | 'medCabinet' | 'workbench'): PlayerState {
  s = { ...s, blueprints: { ...s.blueprints, [kind]: T0 } };
  const { x, y } = spotFor(s, kind);
  const r = act(s, { type: 'place', kind, x, y, rot: 0 });
  expect(r.events[0].type).toBe('placed');
  return r.state;
}

describe('Zielleiste und Ruf', () => {
  it('zeigt die ersten Ziele und lässt fertige abholen', () => {
    const s = fresh();
    expect(visibleGoals(s).map((g) => g.goal.id)).toEqual(['search3', 'site', 'unpack']);
    expect(act(s, { type: 'claimGoal', goal: 'search3' }).events[0]).toEqual({ type: 'rejected', reason: 'not_done' });
    let st = s;
    for (const spot of free().slice(0, 3)) st = search(st, spot).state;
    expect(claimableGoals(st)).toBe(1);
    expect(visibleGoals(st)[0]).toMatchObject({ done: true, goal: { id: 'search3' } });
    const food = st.inventory.food;
    const r = act(st, { type: 'claimGoal', goal: 'search3' });
    expect(r.events[0]).toMatchObject({ type: 'goalClaimed', goal: 'search3' });
    expect(r.state.inventory.food).toBe(food + 1);
    expect(act(r.state, { type: 'claimGoal', goal: 'search3' }).events[0]).toEqual({ type: 'rejected', reason: 'already_built' });
    expect(visibleGoals(r.state).map((g) => g.goal.id)).not.toContain('search3');
  });

  it('jedes Ziel hat einen Titel, einen Tipp und eine Belohnung, keine doppelt', () => {
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    for (const g of GOALS) {
      expect(g.title.length).toBeGreaterThan(5);
      expect(g.hint.length).toBeGreaterThan(5);
      expect(total(g.reward)).toBeGreaterThan(0);
    }
  });

  it('der Streifer-Rang wächst mit dem, was man draußen schafft', () => {
    const s = fresh();
    expect(rankOf(s)).toMatchObject({ name: 'Neuling', index: 0 });
    const t = { ...s, stats: { ...s.stats, searches: 30 } };
    expect(rankOf(t).name).toBe('Sammler');
    expect(rankOf(t).next?.name).toBe('Späher');
  });

  it('Stufen des Zuhauses bringen Vorteile', () => {
    const s = settled();
    expect(basePerks(s)).toMatchObject({ slots: 0, rangeM: 0, luck: 0, lootFactor: 1 });
    expect(TIER_PERKS.length).toBeGreaterThanOrEqual(6);
    const range = searchRangeM(s);
    const regen = regenMs(s);
    // Viele Möbel aufstellen, bis die Gemütlichkeit hoch ist
    let st: PlayerState = { ...s, blueprints: { ...s.blueprints, bed: T0 } };
    for (let i = 0; i < 18; i++) {
      const { x, y } = spotFor(st, 'bed');
      st = act(st, { type: 'place', kind: 'bed', x, y, rot: 0 }).state;
    }
    const p = basePerks(st);
    expect(p.slots + p.rangeM + p.luck).toBeGreaterThan(0);
    expect(searchRangeM(st)).toBeGreaterThanOrEqual(range);
    expect(regenMs(st)).toBeLessThanOrEqual(regen);
    expect(workbenchSlots(st)).toBeGreaterThanOrEqual(workbenchSlots(s));
  });
});

describe('Looten', () => {
  it('Geschick zählt: daneben gibt weniger, perfekt mehr', () => {
    const spot = free()[0];
    const s = { ...fresh(), seen: [] };
    const miss = total(loot(search(s, spot, 'miss').events).items);
    const good = total(loot(search(s, spot, 'good').events).items);
    const perfect = total(loot(search(s, spot, 'perfect').events).items);
    expect(miss).toBeLessThanOrEqual(good);
    expect(perfect).toBeGreaterThanOrEqual(good);
    expect(loot(search(s, spot, 'perfect').events).quality).toBe('perfect');
  });

  it('beim ersten Besuch gibt es doppelt so viel', () => {
    const spot = free()[1];
    const first = search(fresh(), spot);
    expect(loot(first.events).first).toBe(true);
    // Später nochmal in derselben Ecke: kein Erstfund mehr, auch wenn dort jetzt etwas anderes liegt
    const cell = spot.id.split(':').slice(0, 4).join(':');
    const t = T0 + 48 * HOUR;
    const again = free(t).find((x) => x.id.startsWith(cell + ':'));
    const later = search(first.state, again ?? spot, 'good', again ? t : readyAt(first.state, spot));
    expect(loot(later.events).first).toBeUndefined();
  });

  it('weiter wühlen bringt kleine Funde, macht aber Lärm', () => {
    const spot = free()[2];
    let st = search(fresh(), spot).state;
    expect(st.dig?.spot.id).toBe(spot.id);
    const kinds: string[] = [];
    for (let i = 0; i < DIG.max && st.dig; i++) {
      const r = act(st, { type: 'dig', at: spot.pos, accuracyM: 5 });
      kinds.push(r.events[0].type);
      st = r.state;
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k) => k === 'dug' || k === 'ambush' || k === 'loot' || k === 'collectibleFound' || k === 'setComplete')).toBe(true);
    expect(st.dig).toBeNull();
    expect(act(st, { type: 'dig', at: spot.pos, accuracyM: 5 }).events[0]).toEqual({ type: 'rejected', reason: 'nothing' });
  });

  it('zu laut: ein Überfall startet einen Kampf', () => {
    // Irgendeine Fundstelle, an der es beim Wühlen kracht
    let found = false;
    for (const spot of free().slice(0, 40)) {
      let st = search(fresh(), spot).state;
      for (let i = 0; i < DIG.max && st.dig; i++) {
        const r = act(st, { type: 'dig', at: spot.pos, accuracyM: 5 });
        st = r.state;
        if (r.events[0].type === 'ambush') {
          expect(st.combat).toMatchObject({ ambush: true, spot: { id: spot.id } });
          expect(st.combat?.group.length).toBeGreaterThan(0);
          // Gewinnen bringt etwas, aber nicht die volle Beute nochmal
          const w = act(st, { type: 'battleResult', outcome: 'won', health: 8, kills: 1, usedMedicine: 0 });
          expect(w.events.map((e) => e.type)).toEqual(['combatWon', 'loot']);
          expect(w.state.dig).toBeNull();
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it('wühlen geht nur in der Nähe und nur kurz', () => {
    const spot = free()[3];
    const st = search(fresh(), spot).state;
    const far = { lat: spot.pos.lat + 0.01, lon: spot.pos.lon };
    expect(act(st, { type: 'dig', at: far, accuracyM: 5 }).events[0]).toEqual({ type: 'rejected', reason: 'too_far' });
    expect(act(st, { type: 'dig', at: spot.pos, accuracyM: 5 }, T0 + (DIG.minutes + 1) * 60_000).events[0]).toEqual({ type: 'rejected', reason: 'nothing' });
  });
});

describe('Draußen', () => {
  it('Händlerkisten: für alle gleich, ohne Wache, mit viel mehr Beute', () => {
    const spots = gridSpotsAround(SEED, HOME, 3000, T0);
    const carts = spots.filter((s) => cartOf(SEED, s, T0));
    expect(carts.length).toBeGreaterThan(spots.length * CART.chance * 0.4);
    expect(carts.length).toBeLessThan(spots.length * CART.chance * 2);
    const c = carts[0];
    expect(guardOf(SEED, c, T0)).toBeNull();
    expect(cartOf(SEED, c, T0)!.until).toBeGreaterThan(T0);
    const l = loot(search(fresh(), c).events);
    expect(l.cart).toBe(true);
    // Später ist die Kiste weg
    const later = cartOf(SEED, c, cartOf(SEED, c, T0)!.until + 1);
    expect(later === null || later.until > cartOf(SEED, c, T0)!.until).toBe(true);
  });

  it('Hinweise führen zu Verstecken, die man ausgraben kann', () => {
    // Fundstellen durchsuchen, bis ein Zettel dabei ist
    let st = fresh();
    let clue: string | undefined;
    for (const spot of free().slice(0, 120)) {
      const r = search(st, spot);
      st = r.state;
      clue = loot(r.events).clue;
      // Hier geht es um Zettel (Spuren haben eigene Tests)
      if (clue && st.caches.find((x) => x.id === clue)?.via === 'note') break;
      clue = undefined;
    }
    expect(clue).toBeDefined();
    const c = st.caches.find((x) => x.id === clue)!;
    expect(distanceM(c.fromPos, c.spot.pos)).toBeGreaterThanOrEqual(CACHE.minM);
    expect(distanceM(c.center, c.spot.pos)).toBeLessThan(CACHE.areaM);
    // Zu weit weg geht nicht, direkt dran schon
    expect(act(st, { type: 'openCache', id: c.id, at: c.center, accuracyM: 5 }).events[0].type).toBe(distanceM(c.center, c.spot.pos) <= CACHE.digM + 5 ? 'cacheOpened' : 'rejected');
    const open = act(st, { type: 'openCache', id: c.id, at: c.spot.pos, accuracyM: 5 });
    const e = open.events[0];
    expect(e.type).toBe('cacheOpened');
    if (e.type === 'cacheOpened') expect(total(e.items)).toBeGreaterThan(3);
    expect(open.state.caches.find((x) => x.id === c.id)).toBeUndefined();
    expect(open.state.stats.caches).toBe(1);
  });

  it('weiß, wo man welchen Rohstoff findet', () => {
    expect(whereToFind('glass').length).toBeGreaterThan(0);
    expect(whereToFind('medicine')[0]).toBe('pharmacy');
  });
});

describe('Anlagen', () => {
  it('Funkgerät: alle paar Stunden ein Funkspruch mit Hinweis', () => {
    let s = settled();
    expect(act(s, { type: 'listenRadio', at: HOME }).events[0]).toEqual({ type: 'rejected', reason: 'no_radio' });
    s = place(s, 'radioSet');
    const r = act(s, { type: 'listenRadio', at: HOME });
    expect(r.events[0]).toMatchObject({ type: 'radio' });
    const e = r.events[0];
    if (e.type === 'radio') expect(e.cache).toBeDefined();
    expect(r.state.caches[0].via).toBe('radio');
    expect(act(r.state, { type: 'listenRadio', at: HOME }, T0 + HOUR).events[0]).toEqual({ type: 'rejected', reason: 'radio_quiet' });
    expect(act(r.state, { type: 'listenRadio', at: HOME }, T0 + RADIO.everyH * HOUR).events[0].type).toBe('radio');
  });

  it('Holzofen: Eintopf heilt ganz und macht satt', () => {
    let s = settled();
    expect(act(s, { type: 'cook' }).events[0]).toEqual({ type: 'rejected', reason: 'no_stove' });
    s = place(s, 'stove');
    s = { ...s, health: 3, healthAt: T0 };
    const r = act(s, { type: 'cook' });
    expect(r.events[0]).toMatchObject({ type: 'cooked', until: T0 + COOK.fedH * HOUR });
    expect(r.state.health).toBe(MAX_HEALTH);
    expect(r.state.inventory.food).toBe(s.inventory.food - (COOK.cost.food ?? 0));
    // Satt: mehr Beute
    const spot = free()[5];
    expect(loot(search(r.state, spot).events).fed).toBe(true);
    const hungry = { ...s, inventory: { ...s.inventory, food: 0 } };
    expect(act(hungry, { type: 'cook' }).events[0]).toEqual({ type: 'rejected', reason: 'cost' });
  });

  it('Sanitätsschrank erzeugt Medizin', () => {
    const s = place(settled(), 'medCabinet');
    const it = s.base.plots[s.base.active!]!.items.find((i) => i.kind === 'medCabinet')!;
    const r = act(s, { type: 'harvest', uid: it.uid }, T0 + 9 * HOUR);
    expect(r.events[0]).toMatchObject({ type: 'harvested', items: { medicine: 1 } });
  });
});
