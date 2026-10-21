import { describe, expect, it } from 'vitest';
import { cellFree, type PlotIndex } from '../src/core/building';
import { emptyInventory, KRAM, SETS, WORKBENCH_LEVELS } from '../src/core/content';
import { gridSpotsAround } from '../src/core/world';
import { activePlot, applyAction, checkSets, createPlayer, dismantleMs, packCount, placementProblem, plotIndexOf, readyParts } from '../src/core/rules';
import { migrate } from '../src/core/save';
import type { Action, Character, PlayerState } from '../src/core/types';

const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const T0 = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const act = (s: PlayerState, a: Action, now = T0) => applyAction(s, a, { now, worldSeed: 'test-seed' });
const ev = (s: PlayerState, a: Action, now = T0) => act(s, a, now).events[0];

function freeRect(idx: PlotIndex, w: number, h: number, skip = 0): { x: number; y: number } {
  let n = 0;
  for (let y = 24; y + h <= 48; y++)
    for (let x = 24; x + w <= 48; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w; dx++) if (!cellFree(idx, x + dx, y + dy)) ok = false;
      if (ok && n++ >= skip) return { x, y };
    }
  throw new Error('kein Platz');
}

/** Wohnt im Depot, volles Lager, Kram und zwei Sammelstücke. */
function settled(): PlayerState {
  const s = createPlayer('p', hero, T0);
  for (const k of Object.keys(s.inventory) as (keyof typeof s.inventory)[]) s.inventory[k] = 50;
  s.kram = { toaster: 2, radio: 1, carBattery: 1, tinCans: 3 };
  s.collectibles = { teddy: T0, mirror: T0 };
  return act(s, { type: 'chooseSite', site: 'depot' }).state;
}

function withWorkbench(): PlayerState {
  const s = settled();
  const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
  return act(s, { type: 'place', kind: 'workbench', x, y, rot: 0 }).state;
}

describe('Rucksack und Lager', () => {
  it('unterwegs: Vorräte in die Taschen, Rohstoffe und Kram in den Rucksack, Sammelstücke nur einmal', () => {
    const spots = gridSpotsAround('test-seed', { lat: 51.3127, lon: 9.4797 }, 3000).filter((s) => s.kind === 'parcel' || s.kind === 'container');
    let s = createPlayer('p', hero, T0);
    const lager = { ...s.inventory };
    let kram = 0;
    const seen = new Set<string>();
    for (const spot of spots.slice(0, 60)) {
      const r = act(s, { type: 'search', spot, at: spot.pos, accuracyM: 5 });
      const e = r.events[0];
      if (e.type !== 'loot') continue;
      if (e.kram) kram++;
      if (e.collectible) {
        expect(seen.has(e.collectible)).toBe(false);
        seen.add(e.collectible);
      }
      s = r.state;
    }
    expect(kram).toBeGreaterThan(10);
    expect(seen.size).toBeGreaterThan(0);
    expect(Object.keys(s.collectibles).length).toBe(seen.size);
    // Rohstoffe liegen im Rucksack, das Lager zu Hause ist unverändert
    expect(s.inventory.wood).toBe(lager.wood);
    expect(s.inventory.metal).toBe(lager.metal);
    expect(packCount(s)).toBeGreaterThan(20);
    // Zu Hause auspacken
    const u = act(s, { type: 'unpack' });
    expect(u.events[0].type).toBe('unpacked');
    expect(u.state.pack).toEqual({});
    expect(u.state.packKram).toEqual({});
    expect(u.state.inventory.plastic).toBe(lager.plastic + (s.pack.plastic ?? 0));
    expect(Object.values(u.state.kram).reduce((a, b) => a + (b ?? 0), 0)).toBe(kram);
    expect(ev(u.state, { type: 'unpack' })).toEqual({ type: 'rejected', reason: 'nothing' });
  });

  it('eine Niederlage kostet nur etwas aus dem Rucksack, nie aus dem Lager', () => {
    const spot = gridSpotsAround('test-seed', { lat: 51.3127, lon: 9.4797 }, 1500)[0];
    const s = createPlayer('p', hero, T0);
    s.pack = { metal: 5, cloth: 3 };
    s.combat = { spot, enemy: 'walker', group: ['walker'], window: 1 };
    const l = act(s, { type: 'battleResult', outcome: 'lost', health: 0, kills: 0, usedMedicine: 0 });
    expect(l.events[0].type).toBe('combatLost');
    expect((l.state.pack.metal ?? 0) + (l.state.pack.cloth ?? 0)).toBeLessThan(8);
    expect(l.state.inventory).toEqual(s.inventory);
  });
});

describe('Sammelstücke', () => {
  it('nur gefundene, jedes nur einmal aufstellen; Einlagern behält sie', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 1, 2);
    const inv = { ...s.inventory };
    expect(ev(s, { type: 'place', kind: 'guitar', x, y, rot: 0 })).toEqual({ type: 'rejected', reason: 'no_junk' });
    s = act(s, { type: 'place', kind: 'teddy', x, y, rot: 0 }).state;
    expect(s.inventory).toEqual(inv); // kostet nichts
    expect(ev(s, { type: 'place', kind: 'teddy', x, y: y + 1, rot: 0 })).toEqual({ type: 'rejected', reason: 'only_one' });
    const uid = activePlot(s)!.items[0].uid;
    s = act(s, { type: 'store', uid }).state;
    expect(s.collectibles.teddy).toBe(T0);
    expect(act(s, { type: 'place', kind: 'teddy', x, y: y + 1, rot: 0 }).events[0].type).toBe('placed');
  });

  it('ein Spiegel an der Wand bleibt beim Abreißen im Besitz', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 3, 2);
    s = act(s, { type: 'buildWalls', piece: 'plankWall', shape: 'line', x1: x, y1: y + 1, x2: x + 3, y2: y + 1 }).state;
    s = act(s, { type: 'place', kind: 'mirror', x, y: y + 1, rot: 0 }).state;
    s = act(s, { type: 'demolish', layer: 'walls', shape: 'line', x1: x, y1: y + 1, x2: x + 3, y2: y + 1 }).state;
    expect(activePlot(s)!.items).toHaveLength(0);
    expect(s.collectibles.mirror).toBe(T0);
  });

  it('ein volles Set bringt einen Bauplan und Rohstoffe, aber nur einmal', () => {
    const s = createPlayer('p', hero, T0);
    for (const c of SETS.kinderzimmer.items) s.collectibles[c] = T0;
    const evs = checkSets(s, T0);
    expect(evs).toEqual([{ type: 'setCompleted', set: 'kinderzimmer', items: SETS.kinderzimmer.reward, blueprint: 'bed' }]);
    expect(s.blueprints.bed).toBe(T0);
    expect(s.inventory.cloth).toBe(SETS.kinderzimmer.reward.cloth);
    expect(checkSets(s, T0)).toEqual([]);
  });
});

describe('Werktisch', () => {
  it('gibt es nur einmal', () => {
    const s = withWorkbench();
    const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
    expect(placementProblem(s, 'workbench', x, y, 0)).toBe('only_one');
    const it = activePlot(s)!.items[0];
    expect(placementProblem(s, 'workbench', x, y, 0, it.uid)).toBeNull();
  });

  it('ohne Werktisch wird nichts zerlegt', () => {
    expect(ev(settled(), { type: 'dismantle', kram: 'toaster' })).toEqual({ type: 'rejected', reason: 'no_workbench' });
  });

  it('zerlegt Kram aus dem Lager eins nach dem anderen, Fertiges wartet', () => {
    let s = withWorkbench();
    const r1 = act(s, { type: 'dismantle', kram: 'toaster' });
    expect(r1.events[0]).toEqual({ type: 'dismantleQueued', kram: 'toaster', endsAt: T0 + KRAM.toaster.minutes * MIN });
    s = r1.state;
    expect(s.kram.toaster).toBe(1);
    s = act(s, { type: 'dismantle', kram: 'radio' }).state;
    expect(s.workshop.jobs[1].endsAt).toBe(T0 + (KRAM.toaster.minutes + KRAM.radio.minutes) * MIN);
    s = act(s, { type: 'dismantle', kram: 'tinCans' }).state;
    expect(ev(s, { type: 'dismantle', kram: 'tinCans' })).toEqual({ type: 'rejected', reason: 'queue_full' });
    expect(ev(s, { type: 'dismantle', kram: 'pan' })).toMatchObject({ type: 'rejected' });
    expect(ev(s, { type: 'collect' })).toEqual({ type: 'rejected', reason: 'nothing' });
    expect(readyParts(s, T0 + KRAM.toaster.minutes * MIN)).toEqual({ items: KRAM.toaster.parts, count: 1 });
    const c = act(s, { type: 'collect' }, T0 + 7 * 24 * 60 * MIN);
    expect(c.events[0]).toMatchObject({ type: 'collected', count: 3 });
    expect(c.state.inventory.electronics).toBe(50 + 1 + 1);
    expect(c.state.workshop.jobs).toEqual([]);
  });

  it('aufrüsten: mehr Platz und schneller, bis Stufe 3', () => {
    let s = withWorkbench();
    s = act(s, { type: 'upgradeWorkbench' }).state;
    expect(dismantleMs(s, 'carBattery')).toBe(KRAM.carBattery.minutes * MIN * WORKBENCH_LEVELS[1].speed);
    s = act(s, { type: 'upgradeWorkbench' }).state;
    expect(ev(s, { type: 'upgradeWorkbench' })).toEqual({ type: 'rejected', reason: 'max_level' });
    for (const k of ['toaster', 'toaster', 'radio', 'carBattery', 'tinCans', 'tinCans'] as const) s = act(s, { type: 'dismantle', kram: k }).state;
    expect(s.workshop.jobs).toHaveLength(6);
  });
});

describe('Umzug auf Version 8', () => {
  it('Bus-Ausbauten werden zu Rohstoffen, Fundstücke zu Kram oder Sammelstücken', () => {
    const { kram, pack, packKram, collectibles, sets, ...rest } = createPlayer('p', hero, T0);
    void kram, pack, packKram, collectibles, sets;
    const old = {
      ...rest,
      schema: 7,
      inventory: emptyInventory(),
      bus: { modules: { rainBarrel: { builtAt: T0 - 10 * 3600_000, lastHarvestAt: T0 - 10 * 3600_000 } } },
      junk: { toaster: 2, teddy: 2, tv: 1 },
      workshop: { level: 1, jobs: [{ junk: 'radio', endsAt: T0 + MIN }, { junk: 'vase', endsAt: T0 + MIN }] },
      base: {
        active: 'depot',
        plots: { depot: { sections: ['2,2', '3,2', '2,3', '3,3'], cleared: [], walls: {}, floors: {}, roofs: {}, items: [{ uid: 1, kind: 'bottles', x: 30, y: 30, rot: 0 }, { uid: 2, kind: 'globe', x: 32, y: 30, rot: 0 }, { uid: 3, kind: 'rainBarrel', x: 34, y: 30, rot: 0 }], nextUid: 4 } },
        found: {},
      },
    };
    const s = migrate(JSON.parse(JSON.stringify({ ...old, lastActiveAt: T0 })))!;
    expect(s.schema).toBe(11);
    expect('bus' in s).toBe(false);
    // Regenfass: Kosten zurück (3 Metall, 2 Kunststoff) und 3 Wasser Ertrag
    expect(s.inventory.water).toBe(3);
    expect(s.kram).toEqual({ toaster: 2, bottles: 1 });
    // Die Vase lag schon auf dem Werktisch: sie wird zerlegt, gilt also nicht als gefunden
    expect(Object.keys(s.collectibles).sort()).toEqual(['globe', 'teddy', 'tv']);
    // Zweiter Teddy (2 Stoff, 1 Kunststoff) und die Vase in Arbeit (2 Glas) werden zu Rohstoffen
    expect(s.inventory.cloth).toBe(2);
    expect(s.inventory.glass).toBe(2);
    expect(s.inventory.metal).toBe(3);
    expect(s.workshop.jobs).toEqual([{ kram: 'radio', endsAt: T0 + MIN }]);
    const items = s.base.plots.depot!.items;
    expect(items.map((i) => i.kind)).toEqual(['globe', 'rainBarrel']);
    expect(items[1].at).toBe(T0);
  });
});
