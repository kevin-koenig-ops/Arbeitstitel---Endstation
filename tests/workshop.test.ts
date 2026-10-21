import { describe, expect, it } from 'vitest';
import { cellFree, type PlotIndex } from '../src/core/building';
import { JUNK, WORKBENCH_LEVELS } from '../src/core/content';
import { gridSpotsAround } from '../src/core/world';
import { activePlot, applyAction, createPlayer, dismantleMs, placementProblem, plotIndexOf, readyParts } from '../src/core/rules';
import type { Action, Character, PlayerState } from '../src/core/types';

const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const T0 = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const act = (s: PlayerState, a: Action, now = T0) => applyAction(s, a, { now, worldSeed: 'test-seed' });
const ev = (s: PlayerState, a: Action, now = T0) => act(s, a, now).events[0];

function freeRect(idx: PlotIndex, w: number, h: number, skip = 0): { x: number; y: number } {
  let n = 0;
  for (let y = 12; y + h <= 24; y++)
    for (let x = 12; x + w <= 24; x++) {
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w; dx++) if (!cellFree(idx, x + dx, y + dy)) ok = false;
      if (ok && n++ >= skip) return { x, y };
    }
  throw new Error('kein Platz');
}

/** Wohnt im Depot, volle Taschen, ein paar Fundstücke im Rucksack. */
function settled(): PlayerState {
  const s = createPlayer('p', hero, T0);
  for (const k of Object.keys(s.inventory) as (keyof typeof s.inventory)[]) s.inventory[k] = 50;
  s.junk = { teddy: 2, radio: 1, tv: 1, mirror: 1, rubberDuck: 3 };
  return act(s, { type: 'chooseSite', site: 'depot' }).state;
}

function withWorkbench(): PlayerState {
  const s = settled();
  const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
  return act(s, { type: 'place', kind: 'workbench', x, y, rot: 0 }).state;
}

describe('Fundstücke', () => {
  it('kommen beim Durchsuchen manchmal mit und landen im Rucksack', () => {
    const spots = gridSpotsAround('test-seed', { lat: 51.3127, lon: 9.4797 }, 2500).filter((s) => s.kind === 'parcel' || s.kind === 'container');
    let s = createPlayer('p', hero, T0);
    let found = 0;
    for (const spot of spots.slice(0, 40)) {
      const r = act(s, { type: 'search', spot, at: spot.pos, accuracyM: 5 });
      const e = r.events[0];
      if (e.type === 'loot' && e.junk) {
        found++;
        expect(r.state.junk[e.junk]).toBe((s.junk[e.junk] ?? 0) + 1);
      }
      if (e.type === 'loot') s = r.state;
    }
    expect(found).toBeGreaterThan(5);
  });

  it('lassen sich als Deko aufstellen und wieder einlagern', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 1, 1);
    const inv = { ...s.inventory };
    s = act(s, { type: 'place', kind: 'teddy', x, y, rot: 0 }).state;
    expect(s.junk.teddy).toBe(1);
    expect(s.inventory).toEqual(inv); // kostet keine Rohstoffe
    s = act(s, { type: 'place', kind: 'teddy', x: x, y: y + 1, rot: 0 }).state;
    expect(s.junk.teddy).toBeUndefined();
    expect(ev(s, { type: 'place', kind: 'teddy', x: 20, y: 20, rot: 0 })).toEqual({ type: 'rejected', reason: 'no_junk' });
    const uid = activePlot(s)!.items[0].uid;
    const r = act(s, { type: 'store', uid });
    expect(r.events[0]).toMatchObject({ type: 'stored', junk: 'teddy', refund: {} });
    expect(r.state.junk.teddy).toBe(1);
  });

  it('Spiegel an der Wand kommt beim Abreißen zurück in den Rucksack', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 3, 2);
    s = act(s, { type: 'buildWalls', piece: 'plankWall', shape: 'line', x1: x, y1: y + 1, x2: x + 3, y2: y + 1 }).state;
    s = act(s, { type: 'place', kind: 'mirror', x, y: y + 1, rot: 0 }).state;
    expect(s.junk.mirror).toBeUndefined();
    s = act(s, { type: 'demolish', layer: 'walls', shape: 'line', x1: x, y1: y + 1, x2: x + 3, y2: y + 1 }).state;
    expect(s.junk.mirror).toBe(1);
    expect(activePlot(s)!.items).toHaveLength(0);
  });
});

describe('Werktisch', () => {
  it('gibt es nur einmal', () => {
    const s = withWorkbench();
    const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
    expect(placementProblem(s, 'workbench', x, y, 0)).toBe('only_one');
    expect(ev(s, { type: 'place', kind: 'workbench', x, y, rot: 0 })).toEqual({ type: 'rejected', reason: 'only_one' });
    // Verschieben geht natürlich
    const it = activePlot(s)!.items[0];
    expect(placementProblem(s, 'workbench', x, y, 0, it.uid)).toBeNull();
  });

  it('ohne Werktisch wird nichts zerlegt', () => {
    expect(ev(settled(), { type: 'dismantle', junk: 'teddy' })).toEqual({ type: 'rejected', reason: 'no_workbench' });
  });

  it('zerlegt eins nach dem anderen in echter Zeit, Fertiges wartet', () => {
    let s = withWorkbench();
    const r1 = act(s, { type: 'dismantle', junk: 'teddy' });
    expect(r1.events[0]).toEqual({ type: 'dismantleQueued', junk: 'teddy', endsAt: T0 + JUNK.teddy.minutes * MIN });
    s = r1.state;
    expect(s.junk.teddy).toBe(1);
    s = act(s, { type: 'dismantle', junk: 'radio' }).state;
    expect(s.workshop.jobs[1].endsAt).toBe(T0 + (JUNK.teddy.minutes + JUNK.radio.minutes) * MIN);
    s = act(s, { type: 'dismantle', junk: 'rubberDuck' }).state;
    expect(ev(s, { type: 'dismantle', junk: 'rubberDuck' })).toEqual({ type: 'rejected', reason: 'queue_full' });
    expect(ev(s, { type: 'dismantle', junk: 'guitar' })).toMatchObject({ type: 'rejected' });
    // Noch nichts fertig
    expect(ev(s, { type: 'collect' })).toEqual({ type: 'rejected', reason: 'nothing' });
    // Nach dem Teddy: nur der ist fertig
    const t1 = T0 + JUNK.teddy.minutes * MIN;
    expect(readyParts(s, t1)).toEqual({ items: JUNK.teddy.parts, count: 1 });
    // Eine Woche später: alles wartet noch, nichts verdirbt
    const later = T0 + 7 * 24 * 60 * MIN;
    const c = act(s, { type: 'collect' }, later);
    expect(c.events[0]).toMatchObject({ type: 'collected', count: 3 });
    expect(c.state.inventory.cloth).toBe(50 + (JUNK.teddy.parts.cloth ?? 0));
    expect(c.state.inventory.electronics).toBe(50 + (JUNK.radio.parts.electronics ?? 0));
    expect(c.state.workshop.jobs).toEqual([]);
  });

  it('Abholen nimmt nur Fertiges, der Rest läuft weiter', () => {
    let s = withWorkbench();
    s = act(s, { type: 'dismantle', junk: 'rubberDuck' }).state;
    s = act(s, { type: 'dismantle', junk: 'tv' }).state;
    const c = act(s, { type: 'collect' }, T0 + 2 * MIN);
    expect(c.events[0]).toMatchObject({ type: 'collected', count: 1, items: { plastic: 1 } });
    expect(c.state.workshop.jobs.map((j) => j.junk)).toEqual(['tv']);
  });

  it('aufrüsten: mehr Platz und schneller, bis Stufe 3', () => {
    let s = withWorkbench();
    s = act(s, { type: 'upgradeWorkbench' }).state;
    expect(s.workshop.level).toBe(2);
    expect(dismantleMs(s, 'tv')).toBe(JUNK.tv.minutes * MIN * WORKBENCH_LEVELS[1].speed);
    s = act(s, { type: 'upgradeWorkbench' }).state;
    expect(s.workshop.level).toBe(3);
    expect(ev(s, { type: 'upgradeWorkbench' })).toEqual({ type: 'rejected', reason: 'max_level' });
    for (const j of ['teddy', 'teddy', 'radio', 'tv', 'mirror', 'rubberDuck'] as const) s = act(s, { type: 'dismantle', junk: j }).state;
    expect(s.workshop.jobs).toHaveLength(6);
  });
});
