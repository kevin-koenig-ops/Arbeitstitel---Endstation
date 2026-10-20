import { describe, expect, it } from 'vitest';
import {
  cellFree,
  findRooms,
  hEdge,
  indexPlot,
  newPlot,
  OBSTACLES,
  PLOT,
  plotComfort,
  reclaimCost,
  sectionObstacles,
  type PlotIndex,
} from '../src/core/building';
import { FURNITURE } from '../src/core/furniture';
import { activePlot, applyAction, comfortTier, createPlayer, knowsBlueprint, placementProblem, plotIndexOf } from '../src/core/rules';
import { migrate } from '../src/core/save';
import type { Action, Character, PlayerState, Spot } from '../src/core/types';

const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const T0 = Date.UTC(2026, 9, 20, 12);
const ctx = { now: T0, worldSeed: 'test-seed' };
const act = (s: PlayerState, a: Action) => applyAction(s, a, ctx);
const ev = (s: PlayerState, a: Action) => act(s, a).events[0];

/** Spieler mit gewähltem Busdepot und vollen Taschen. */
function settled(): PlayerState {
  const s = { ...createPlayer('p', hero, T0), inventory: { food: 50, water: 50, medicine: 5, material: 500 } };
  return act(s, { type: 'chooseSite', site: 'depot' }).state;
}

/** Freies Rechteck (w × h Felder) im Startbereich suchen. */
function freeRect(idx: PlotIndex, w: number, h: number): { x: number; y: number } {
  for (let y = 12; y + h <= 24; y++)
    for (let x = 12; x + w <= 24; x++) {
      let ok = true;
      for (let cy = y; cy < y + h && ok; cy++) for (let cx = x; cx < x + w; cx++) if (!cellFree(idx, cx, cy)) ok = false;
      if (ok) return { x, y };
    }
  throw new Error('kein Platz');
}

describe('Schauplätze', () => {
  it('zum Start nur wählbare Schauplätze, danach nur gefundene', () => {
    const s = createPlayer('p', hero, T0);
    expect(activePlot(s)).toBeNull();
    expect(ev(s, { type: 'chooseSite', site: 'fuel' })).toEqual({ type: 'rejected', reason: 'locked' });
    const res = act(s, { type: 'chooseSite', site: 'lake' });
    expect(res.events[0]).toEqual({ type: 'siteChosen', site: 'lake', first: true });
    expect(res.state.base.active).toBe('lake');
    expect(activePlot(res.state)?.sections).toHaveLength(4);
    // Die anderen Startplätze muss man jetzt auch erst finden
    expect(ev(res.state, { type: 'chooseSite', site: 'farm' })).toEqual({ type: 'rejected', reason: 'locked' });
    const found = { ...res.state, base: { ...res.state.base, found: { farm: T0 } } };
    const moved = act(found, { type: 'chooseSite', site: 'farm' }).state;
    expect(moved.base.active).toBe('farm');
    expect(Object.keys(moved.base.plots).sort()).toEqual(['farm', 'lake']);
  });

  it('Lagepläne gibt es an passenden Orten, erst wenn man irgendwo wohnt', () => {
    let s = settled();
    const fuel = (i: number): Spot => ({ id: `p:fuel:${i}`, kind: 'fuel', source: 'poi', pos: { lat: 51.3 + i * 0.01, lon: 9.5 }, name: 'Tankstelle' });
    let site: string | undefined;
    for (let i = 0; i < 80 && !site; i++) {
      const sp = fuel(i);
      const r = applyAction(s, { type: 'search', spot: sp, at: sp.pos, accuracyM: 5 }, { now: T0 + i * 86_400_000, worldSeed: 'w' + i });
      const loot = r.events.find((e) => e.type === 'loot');
      if (loot?.type === 'loot' && loot.site) site = loot.site;
      s = r.state;
    }
    expect(site).toBe('fuel');
    expect(s.base.found.fuel).toBeDefined();
  });
});

describe('Gelände', () => {
  it('Hindernisse sind fest und bringen beim Wegräumen etwas', () => {
    expect(sectionObstacles('p', 'depot', 2, 2)).toEqual(sectionObstacles('p', 'depot', 2, 2));
    let s = settled();
    const idx = plotIndexOf(s)!;
    expect(idx.obstacles.length).toBeGreaterThanOrEqual(8);
    const o = idx.obstacles[0];
    expect(placementProblem(s, 'chair', o.x, o.y, 0)).toBe('blocked');
    const before = s.inventory.material;
    s = act(s, { type: 'clearObstacle', id: o.id }).state;
    expect(s.inventory.material).toBe(before + (OBSTACLES[o.kind].reward.material ?? 0));
    expect(placementProblem(s, 'chair', o.x, o.y, 0)).toBeNull();
    expect(ev(s, { type: 'clearObstacle', id: o.id })).toEqual({ type: 'rejected', reason: 'not_found' });
  });

  it('Abschnitte zurückerobern: nur angrenzend, wird teurer', () => {
    let s = settled();
    expect(placementProblem(s, 'chair', 0, 0, 0)).toBe('blocked');
    expect(ev(s, { type: 'reclaim', sx: 0, sy: 0 })).toEqual({ type: 'rejected', reason: 'not_adjacent' });
    const c1 = reclaimCost(activePlot(s)!);
    s = act(s, { type: 'reclaim', sx: 1, sy: 2 }).state;
    expect(activePlot(s)!.sections).toContain('1,2');
    const c2 = reclaimCost(activePlot(s)!);
    expect(c2.material).toBeGreaterThan(c1.material ?? 0);
    expect(ev(s, { type: 'reclaim', sx: 0, sy: 2 }).type).toBe('reclaimed');
    const poor = { ...s, inventory: { food: 0, water: 0, medicine: 0, material: 0 } };
    expect(ev(poor, { type: 'reclaim', sx: 4, sy: 2 })).toEqual({ type: 'rejected', reason: 'cost' });
  });
});

describe('Freies Bauen', () => {
  it('baut einen Raum mit Tür, Dach und Boden und erkennt ihn', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 4, 4);
    const m0 = s.inventory.material;
    // 3 × 3 Felder: Ecken (x,y) bis (x+3,y+3) = 12 Wandstücke
    const r = act(s, { type: 'buildWalls', piece: 'plankWall', shape: 'room', x1: x, y1: y, x2: x + 3, y2: y + 3 });
    expect(r.events[0]).toMatchObject({ type: 'constructed', layer: 'walls', count: 12 });
    s = r.state;
    expect(s.inventory.material).toBe(m0 - 12);
    // Nochmal dasselbe: nichts zu tun
    expect(ev(s, { type: 'buildWalls', piece: 'plankWall', shape: 'room', x1: x, y1: y, x2: x + 3, y2: y + 3 })).toEqual({ type: 'rejected', reason: 'nothing' });
    // Tür in die Südwand
    s = act(s, { type: 'setOpening', piece: 'door', x1: x + 1, y1: y + 3, x2: x + 2, y2: y + 3 }).state;
    expect(activePlot(s)!.walls[hEdge(x + 1, y + 3)]).toEqual({ k: 'plankWall', o: 'door' });
    // Tür ohne Wand geht nicht
    expect(ev(s, { type: 'setOpening', piece: 'door', x1: x + 1, y1: y + 1, x2: x + 2, y2: y + 1 })).toEqual({ type: 'rejected', reason: 'no_wall' });
    // Geschlossener Raum, aber noch ohne Dach
    let rooms = findRooms(activePlot(s)!).rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0].cells).toHaveLength(9);
    expect(rooms[0].roofed).toBe(false);
    s = act(s, { type: 'paint', layer: 'roofs', piece: 'sheetRoof', x1: x, y1: y, x2: x + 2, y2: y + 2 }).state;
    s = act(s, { type: 'paint', layer: 'floors', piece: 'plankFloor', x1: x, y1: y, x2: x + 2, y2: y + 2 }).state;
    rooms = findRooms(activePlot(s)!).rooms;
    expect(rooms[0]).toMatchObject({ roofed: true, floored: true });
    // Möbel drinnen zählen mehr
    const outside = plotComfort(activePlot(s)!).value;
    expect(outside).toBe(4); // Raum mit Dach (2) und Boden (2)
    s = act(s, { type: 'place', kind: 'fireBarrel', x: x + 1, y: y + 1, rot: 0 }).state;
    expect(plotComfort(activePlot(s)!).value).toBe(4 + 6);
    // Ein Durchgang nach draußen öffnet den Raum
    const opened = act(s, { type: 'setOpening', piece: 'arch', x1: x + 1, y1: y + 3, x2: x + 2, y2: y + 3 }).state;
    expect(findRooms(activePlot(opened)!).rooms).toHaveLength(0);
  });

  it('Wand-Teile brauchen eine Wand und kommen beim Abreißen ins Lager', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 3, 2);
    // Poster ohne Wand: geht nicht
    expect(placementProblem(s, 'poster', x, y + 1, 0)).toBe('no_wall');
    s = act(s, { type: 'buildWalls', piece: 'sheetWall', shape: 'line', x1: x, y1: y + 1, x2: x + 3, y2: y + 1 }).state;
    expect(placementProblem(s, 'poster', x, y + 1, 0)).toBeNull();
    // Auf der anderen Seite der Wand (Rückseite nach Süden) geht es auch
    expect(placementProblem(s, 'poster', x, y, 2)).toBeNull();
    s = act(s, { type: 'place', kind: 'poster', x, y: y + 1, rot: 0 }).state;
    expect(placementProblem(s, 'poster', x, y + 1, 0)).toBe('blocked');
    // Möbel quer durch eine Wand: nein
    expect(placementProblem(s, 'mattress', x, y, 1)).toBe('blocked');
    const m = s.inventory.material;
    const r = act(s, { type: 'demolish', layer: 'walls', shape: 'line', x1: x, y1: y + 1, x2: x + 3, y2: y + 1 });
    expect(r.events[0]).toMatchObject({ type: 'demolished', count: 3, stored: 1 });
    s = r.state;
    expect(s.inventory.material).toBe(m + 3 + (FURNITURE.poster.cost.material ?? 0));
    expect(activePlot(s)!.items).toHaveLength(0);
  });

  it('Wand durch ein Möbel oder ins Gesperrte geht nicht', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
    s = act(s, { type: 'place', kind: 'bench', x, y, rot: 0 }).state;
    expect(ev(s, { type: 'buildWalls', piece: 'plankWall', shape: 'line', x1: x + 1, y1: y, x2: x + 1, y2: y + 1 })).toEqual({ type: 'rejected', reason: 'blocked' });
    // Kante zwischen zwei gesperrten Feldern
    expect(ev(s, { type: 'buildWalls', piece: 'plankWall', shape: 'line', x1: 0, y1: 1, x2: 2, y2: 1 })).toEqual({ type: 'rejected', reason: 'blocked' });
    // Am Rand des freien Bereichs geht es (eine Seite frei)
    expect(ev(s, { type: 'buildWalls', piece: 'chainFence', shape: 'line', x1: 12, y1: 12, x2: 14, y2: 12 })).toMatchObject({ type: 'constructed' });
  });

  it('Wand aufwerten behält die Tür, Zaun nimmt sie weg', () => {
    let s = settled();
    const { x, y } = freeRect(plotIndexOf(s)!, 2, 2);
    s = act(s, { type: 'buildWalls', piece: 'plankWall', shape: 'line', x1: x, y1: y + 1, x2: x + 2, y2: y + 1 }).state;
    s = act(s, { type: 'setOpening', piece: 'window', x1: x, y1: y + 1, x2: x + 1, y2: y + 1 }).state;
    s = act(s, { type: 'buildWalls', piece: 'sheetWall', shape: 'line', x1: x, y1: y + 1, x2: x + 2, y2: y + 1 }).state;
    expect(activePlot(s)!.walls[hEdge(x, y + 1)]).toEqual({ k: 'sheetWall', o: 'window' });
    s = act(s, { type: 'buildWalls', piece: 'chainFence', shape: 'line', x1: x, y1: y + 1, x2: x + 2, y2: y + 1 }).state;
    expect(activePlot(s)!.walls[hEdge(x, y + 1)]).toEqual({ k: 'chainFence' });
  });

  it('Böden lassen Hindernisse aus, Abreißen gibt alles zurück', () => {
    let s = settled();
    const m = s.inventory.material;
    const r = act(s, { type: 'paint', layer: 'floors', piece: 'concreteFloor', x1: 12, y1: 12, x2: 23, y2: 23 });
    expect(r.events[0].type).toBe('constructed');
    s = r.state;
    const placed = Object.keys(activePlot(s)!.floors).length;
    expect(placed).toBeLessThan(144);
    expect(s.inventory.material).toBe(m - placed);
    s = act(s, { type: 'demolish', layer: 'floors', shape: 'rect', x1: 0, y1: 0, x2: PLOT - 1, y2: PLOT - 1 }).state;
    expect(s.inventory.material).toBe(m);
  });

  it('gesperrte Baupläne', () => {
    const s = settled();
    expect(knowsBlueprint(s, 'brickWall')).toBe(false);
    expect(knowsBlueprint(s, 'plankWall')).toBe(true);
    expect(ev(s, { type: 'paint', layer: 'roofs', piece: 'tileRoof', x1: 14, y1: 14, x2: 15, y2: 15 })).toEqual({ type: 'rejected', reason: 'no_blueprint' });
    expect(ev(s, { type: 'place', kind: 'sofa', x: 14, y: 14, rot: 0 })).toEqual({ type: 'rejected', reason: 'no_blueprint' });
  });

  it('Gemütlichkeit: doppelte Teile halb, Stufen', () => {
    let s = settled();
    const idx = indexPlot('p', 'depot', newPlot());
    void idx;
    const { x, y } = freeRect(plotIndexOf(s)!, 2, 1);
    s = act(s, { type: 'place', kind: 'fireBarrel', x, y, rot: 0 }).state;
    s = act(s, { type: 'place', kind: 'fireBarrel', x: x + 1, y, rot: 0 }).state;
    expect(plotComfort(activePlot(s)!).value).toBe(6);
    expect(comfortTier(0).name).toBe('Ruine');
    expect(comfortTier(30)).toEqual({ name: 'Unterschlupf', next: 45 });
  });
});

describe('Migration', () => {
  it('alte Wartehalle (Version 4) wird zu Material', () => {
    const old = {
      ...createPlayer('p', hero, T0),
      schema: 4,
      inventory: { food: 0, water: 0, medicine: 0, material: 1 },
      base: { items: [{ uid: 1, kind: 'sofa', x: 0, y: 0, rot: 0 }, { uid: 2, kind: 'plant', x: 2, y: 0, rot: 0 }], rubble: [], nextUid: 3 },
    };
    const s = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(s.schema).toBe(5);
    expect(s.base).toEqual({ active: null, plots: {}, found: {} });
    expect(s.inventory.material).toBe(1 + 8 + 1);
    expect(s.inventory.water).toBe(1);
  });
});
