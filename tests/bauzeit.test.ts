// Bauzeit im Zuhause (Kevin 23.10.: alles mit Bauzeit, läuft in echter Zeit weiter).
import { describe, expect, it } from 'vitest';
import { BUILD, cellFree, findRooms, furnitureMs, obstacleMs, pieceMs, plotComfort, reclaimCost, sectionMs, type PlotIndex } from '../src/core/building';
import { emptyInventory, MATERIAL_ORDER, WORKBENCH_LEVELS } from '../src/core/content';
import { activePlot, applyAction, createPlayer, hasItem, hasWorkbench, itemYield, nextBuildDone, placementProblem, plotIndexOf } from '../src/core/rules';
import type { Action, Character, PlayerState } from '../src/core/types';

const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const T0 = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const act = (s: PlayerState, a: Action, now = T0) => applyAction(s, a, { now, worldSeed: 'test-seed' });
const ev = (s: PlayerState, a: Action, now = T0) => act(s, a, now).events;

function settled(): PlayerState {
  const s = { ...createPlayer('p', hero, T0), inventory: { ...emptyInventory(), food: 50, water: 50, medicine: 5, ...Object.fromEntries(MATERIAL_ORDER.map((m) => [m, 500])) }, kram: { toaster: 2 } };
  return act(s, { type: 'chooseSite', site: 'depot' }).state;
}

function freeRect(idx: PlotIndex, w: number, h: number, skip = 0): { x: number; y: number } {
  let n = 0;
  for (let y = 24; y + h <= 48; y++)
    for (let x = 24; x + w <= 48; x++) {
      let ok = true;
      for (let cy = y; cy < y + h && ok; cy++) for (let cx = x; cx < x + w; cx++) if (!cellFree(idx, cx, cy)) ok = false;
      if (ok && n++ >= skip) return { x, y };
    }
  throw new Error('kein Platz');
}

describe('Bauzeit', () => {
  it('kleine Teile brauchen Minuten, ein Haus etwa eine halbe Stunde', () => {
    expect(pieceMs('plankWall')).toBe(40_000);
    expect(pieceMs('brickWall')).toBe(80_000);
    expect(pieceMs('door')).toBe(2 * MIN);
    expect(pieceMs('plankFloor')).toBe(20_000);
    expect(furnitureMs('chair')).toBe(4 * MIN);
    expect(furnitureMs('bed')).toBe(24 * MIN);
    // Sammelstücke aufstellen: eine Minute
    expect(furnitureMs('teddy')).toBe(BUILD.itemMinMin * MIN);
    // 4 × 4 Felder: 16 Wände, Tür, 16 Felder Boden und Dach
    const house = 16 * pieceMs('plankWall') + pieceMs('door') + 16 * pieceMs('plankFloor') + 16 * pieceMs('tarpRoof');
    expect(house / MIN).toBeGreaterThan(20);
    expect(house / MIN).toBeLessThan(40);
    expect(obstacleMs('rubble')).toBe(4 * MIN);
  });

  it('Möbel wirken erst, wenn sie fertig sind; danach von selbst', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
    const r = act(s, { type: 'place', kind: 'workbench', x, y, rot: 0 });
    s = r.state;
    expect(r.events[0]).toMatchObject({ type: 'placed' });
    const plot = activePlot(s)!;
    expect(plot.jobs).toHaveLength(1);
    expect(plot.jobs![0]).toMatchObject({ label: 'Werktisch', startsAt: T0, endsAt: T0 + furnitureMs('workbench') });
    // Im Bau: kein Werktisch, keine Gemütlichkeit
    expect(hasWorkbench(s)).toBe(false);
    expect(plotComfort(plot).value).toBe(0);
    expect(ev(s, { type: 'dismantle', kram: 'toaster' })[0]).toEqual({ type: 'rejected', reason: 'no_workbench' });
    expect(nextBuildDone(s)).toBe(T0 + furnitureMs('workbench'));
    // Später, irgendeine Aktion: fertig
    const done = act(s, { type: 'settle' }, T0 + furnitureMs('workbench'));
    expect(done.events).toContainEqual({ type: 'built', label: 'Werktisch', count: 1, site: 'depot' });
    expect(activePlot(done.state)!.jobs).toBeUndefined();
    expect(hasWorkbench(done.state)).toBe(true);
    expect(plotComfort(activePlot(done.state)!).value).toBe(2);
  });

  it('die Bauliste arbeitet eins nach dem anderen ab', () => {
    let s = settled();
    const idx = plotIndexOf(s)!;
    const a = freeRect(idx, 1, 1);
    const b = freeRect(idx, 1, 1, 3);
    s = act(s, { type: 'place', kind: 'chair', x: a.x, y: a.y, rot: 0 }).state;
    s = act(s, { type: 'place', kind: 'table', x: b.x, y: b.y, rot: 0 }, T0 + MIN).state;
    const [j1, j2] = activePlot(s)!.jobs!;
    expect(j1.endsAt).toBe(T0 + furnitureMs('chair'));
    expect(j2.startsAt).toBe(j1.endsAt);
    expect(j2.endsAt).toBe(j1.endsAt + furnitureMs('table'));
    // Den Stuhl wieder einlagern: alles zurück, der Tisch rückt vor (fängt jetzt an)
    const chair = activePlot(s)!.items.find((i) => i.kind === 'chair')!;
    const wood = s.inventory.wood;
    s = act(s, { type: 'store', uid: chair.uid }, T0 + 2 * MIN).state;
    expect(s.inventory.wood).toBe(wood + 2);
    const [only] = activePlot(s)!.jobs!;
    expect(only.label).toBe('Holztisch');
    expect(only.startsAt).toBe(T0 + 2 * MIN);
    expect(only.endsAt).toBe(T0 + 2 * MIN + furnitureMs('table'));
  });

  it('ein Raum zählt erst, wenn die Wände fertig sind; Abreißen gibt alles zurück', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 4, 4);
    const wood = s.inventory.wood;
    s = act(s, { type: 'buildWalls', piece: 'plankWall', shape: 'room', x1: x, y1: y, x2: x + 3, y2: y + 3 }).state;
    expect(s.inventory.wood).toBe(wood - 12);
    const job = activePlot(s)!.jobs![0];
    expect(job).toMatchObject({ label: 'Bretterwand', each: pieceMs('plankWall') });
    expect(job.keys).toHaveLength(12);
    expect(job.endsAt - job.startsAt).toBe(12 * pieceMs('plankWall'));
    expect(findRooms(activePlot(s)!).rooms).toHaveLength(0);
    // Mitten im Bau abreißen: Material ganz zurück, Bauliste leer
    const torn = act(s, { type: 'demolish', layer: 'walls', shape: 'room', x1: x, y1: y, x2: x + 3, y2: y + 3 }, T0 + MIN).state;
    expect(torn.inventory.wood).toBe(wood);
    expect(activePlot(torn)!.jobs).toBeUndefined();
    // Fertig gebaut: Raum erkannt
    const later = act(s, { type: 'settle' }, job.endsAt).state;
    expect(findRooms(activePlot(later)!).rooms).toHaveLength(1);
  });

  it('Abschnitt zurückerobern dauert; Hindernis: Material gleich, Platz erst danach', () => {
    let s = settled();
    const c1 = reclaimCost(activePlot(s)!);
    const t1 = sectionMs(activePlot(s)!);
    s = act(s, { type: 'reclaim', sx: 1, sy: 2 }).state;
    expect(activePlot(s)!.sections).not.toContain('1,2');
    // Der nächste kostet schon mehr und dauert länger; denselben nicht zweimal
    expect(reclaimCost(activePlot(s)!).wood).toBeGreaterThan(c1.wood ?? 0);
    expect(sectionMs(activePlot(s)!)).toBeGreaterThan(t1);
    expect(ev(s, { type: 'reclaim', sx: 1, sy: 2 })[0]).toEqual({ type: 'rejected', reason: 'building' });
    s = act(s, { type: 'settle' }, T0 + t1).state;
    expect(activePlot(s)!.sections).toContain('1,2');

    const o = plotIndexOf(s)!.obstacles[0];
    const before = s.inventory.stone + s.inventory.wood + s.inventory.metal + s.inventory.plastic;
    s = act(s, { type: 'clearObstacle', id: o.id }, T0 + t1).state;
    expect(s.inventory.stone + s.inventory.wood + s.inventory.metal + s.inventory.plastic).toBeGreaterThan(before);
    expect(placementProblem(s, 'chair', o.x, o.y, 0)).toBe('blocked');
    expect(ev(s, { type: 'clearObstacle', id: o.id }, T0 + t1)[0]).toEqual({ type: 'rejected', reason: 'building' });
    s = act(s, { type: 'settle' }, T0 + t1 + obstacleMs(o.kind)).state;
    expect(placementProblem(s, 'chair', o.x, o.y, 0)).toBeNull();
  });

  it('Anlagen sammeln erst ab fertig; Werktisch-Umbau braucht Zeit, der Tisch arbeitet weiter', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 1, 1);
    s = act(s, { type: 'place', kind: 'rainBarrel', x, y, rot: 0 }).state;
    const barrel = activePlot(s)!.items[0];
    const ready = T0 + furnitureMs('rainBarrel');
    expect(itemYield(barrel, ready + 2 * HOUR)).toBe(0);
    expect(itemYield(barrel, ready + 3 * HOUR)).toBe(1);

    const w = freeRect(plotIndexOf(s)!, 2, 1, 5);
    s = act(s, { type: 'place', kind: 'workbench', x: w.x, y: w.y, rot: 0 }).state;
    s = act(s, { type: 'testFinishBuilds' }).state;
    expect(hasItem(s, 'rainBarrel')).toBe(true);
    expect(hasWorkbench(s)).toBe(true);
    s = act(s, { type: 'upgradeWorkbench' }).state;
    expect(s.workshop.level).toBe(1);
    expect(ev(s, { type: 'upgradeWorkbench' })[0]).toEqual({ type: 'rejected', reason: 'building' });
    expect(act(s, { type: 'dismantle', kram: 'toaster' }).events[0].type).not.toBe('rejected');
    const r = act(s, { type: 'settle' }, T0 + 60 * MIN);
    expect(r.events).toContainEqual({ type: 'built', label: WORKBENCH_LEVELS[1].name, count: 1, site: 'depot' });
    expect(r.state.workshop.level).toBe(2);
  });

  it('zum Testen: alles sofort fertig', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 1, 1);
    s = act(s, { type: 'place', kind: 'chair', x, y, rot: 0 }).state;
    expect(ev(s, { type: 'testFinishBuilds' })).toContainEqual({ type: 'built', label: 'Stuhl', count: 1, site: 'depot' });
    expect(ev(act(s, { type: 'testFinishBuilds' }).state, { type: 'testFinishBuilds' })[0]).toEqual({ type: 'rejected', reason: 'nothing' });
  });
});
