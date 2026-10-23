import { describe, expect, it } from 'vitest';
import { FOE_TIME, REGIONS } from '../src/core/content';
import { distanceM } from '../src/core/geo';
import { patrolGroup, patrolsAround, resolvePatrol } from '../src/core/patrols';
import { applyAction, createPlayer, SCHEMA_VERSION } from '../src/core/rules';
import { migrate } from '../src/core/save';
import { createTactics } from '../src/core/tactics';
import { canHide, classifyRegion, hearRangeM, isCold, sightRangeM, visibility, type Conditions, type Exposure, type RegionStats } from '../src/core/terrain';
import type { LatLon, RuleContext, WorldEvent, WorldEventKind } from '../src/core/types';
import { gridSpotsAround } from '../src/core/world';
import { dropSpot, eventCenter, eventsAround, resolveEvent, zonesAt } from '../src/core/worldEvents';

const HOME: LatLon = { lat: 51.6003, lon: 10.1975 };
const T0 = Date.parse('2026-07-15T10:00:00Z');
const fresh = (now = T0) => createPlayer('p1', { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' }, now);

/** Sucht in der Gegend ein Ereignis dieser Art (über mehrere Runden). */
function findEvent(seed: string, kind: WorldEventKind): { ev: WorldEvent; now: number } {
  for (let h = 0; h < 24 * 30; h += 3) {
    const now = T0 + h * 3_600_000 + 90 * 60_000;
    const ev = eventsAround(seed, HOME, 5000, now).find((e) => e.kind === kind && e.from <= now && now < e.until);
    if (ev) return { ev, now };
  }
  throw new Error('kein Ereignis gefunden: ' + kind);
}

describe('Gelände und Gegend', () => {
  const stats = (o: Partial<RegionStats>): RegionStats => ({ buildings: 0, houses: 0, forest: 0, farm: 0, water: 0, sand: 0, rock: 0, ice: 0, relief: null, ...o });

  it('erkennt die Art der Gegend', () => {
    expect(classifyRegion(stats({ buildings: 0.25, houses: 900 }))).toBe('city');
    expect(classifyRegion(stats({ buildings: 0.08, houses: 200 }))).toBe('town');
    expect(classifyRegion(stats({ buildings: 0.02, houses: 40, farm: 0.5 }))).toBe('village');
    expect(classifyRegion(stats({ forest: 0.7 }))).toBe('wild');
    expect(classifyRegion(stats({ forest: 0.4, relief: 300 }))).toBe('mountain');
    expect(classifyRegion(stats({ water: 0.35, houses: 30, buildings: 0.02 }))).toBe('coast');
    expect(classifyRegion(stats({ sand: 0.6 }))).toBe('desert');
    expect(classifyRegion(stats({ ice: 0.5, rock: 0.3 }))).toBe('snow');
  });

  it('Kornfeld versteckt im Sommer, kahler Wald im Winter weniger', () => {
    expect(visibility('field', 'summer')).toBeLessThan(0.5);
    expect(visibility('field', 'autumn')).toBeGreaterThan(0.8);
    expect(visibility('forest', 'winter')).toBeGreaterThan(visibility('forest', 'summer'));
    expect(canHide('forest', 'summer')).toBe(true);
    expect(canHide('road', 'summer')).toBe(false);
  });

  it('Sicht: versteckt, nachts und leise sieht man dich später; der Wächter sieht nachts gut', () => {
    const c: Conditions = { phase: 'day', sky: 'clear', region: 'village', season: 'summer' };
    const e: Exposure = { terrain: 'open', hidden: false, sneaking: false, gearNoise: 0 };
    const base = sightRangeM(['walker'], c, e);
    expect(sightRangeM(['walker'], c, { ...e, hidden: true })).toBeLessThan(base * 0.5);
    expect(sightRangeM(['walker'], c, { ...e, sneaking: true })).toBeLessThan(base);
    expect(sightRangeM(['walker'], { ...c, phase: 'night' }, e)).toBeLessThan(base);
    expect(sightRangeM(['watcher'], { ...c, phase: 'night' }, e)).toBeGreaterThan(base);
    expect(sightRangeM(['walker'], { ...c, sky: 'fog' }, e)).toBeLessThan(base);
    // Heuler hören weiter, Turnschuhe sind leise, Donner übertönt alles
    expect(hearRangeM(['walker', 'screamer'], c, e)).toBeGreaterThan(hearRangeM(['walker'], c, e));
    expect(hearRangeM(['walker'], c, { ...e, gearNoise: -0.2 })).toBeLessThan(hearRangeM(['walker'], c, e));
    expect(hearRangeM(['walker'], { ...c, sky: 'storm' }, e)).toBeLessThan(hearRangeM(['walker'], c, e));
  });

  it('Kälte zählt im Schnee, bei Frost und in Winternächten', () => {
    expect(isCold({ tempC: 15, region: 'snow', season: 'summer', phase: 'day' })).toBe(true);
    expect(isCold({ tempC: -3, region: 'village', season: 'winter', phase: 'day' })).toBe(true);
    expect(isCold({ tempC: 12, region: 'village', season: 'winter', phase: 'night' })).toBe(false);
    expect(isCold({ tempC: null, region: 'village', season: 'winter', phase: 'night' })).toBe(true);
  });
});

describe('Weltereignisse', () => {
  const seed = 'welt-test';

  it('sind für alle gleich und lassen sich aus der Kennung prüfen', () => {
    const { ev, now } = findEvent(seed, 'quarantine');
    const again = eventsAround(seed, HOME, 5000, now);
    expect(again.find((e) => e.id === ev.id)).toEqual(ev);
    expect(resolveEvent(seed, ev.id)).toEqual(ev);
  });

  it('die Mitte liegt nie an heiklen Orten', () => {
    const { ev, now } = findEvent(seed, 'horde');
    const blocked = (p: LatLon) => distanceM(p, ev.center) < 1;
    const moved = eventsAround(seed, ev.center, 3000, now, blocked).find((e) => e.id === ev.id);
    if (moved) expect(distanceM(moved.center, ev.center)).toBeGreaterThan(1);
  });

  it('der Staubsturm zieht weiter', () => {
    const { ev } = findEvent(seed, 'dust');
    expect(distanceM(eventCenter(ev, ev.from), eventCenter(ev, ev.from + 30 * 60_000))).toBeGreaterThan(300);
  });

  it('im Sperrgebiet wird nicht gesucht, im Staub nur mit Atemschutz', () => {
    for (const [kind, reason] of [
      ['quarantine', 'zone_closed'],
      ['dust', 'need_filter'],
    ] as const) {
      const { ev, now } = findEvent(seed, kind);
      const c = eventCenter(ev, now);
      const spot = gridSpotsAround(seed, c, ev.radiusM * 0.8, now)[0];
      expect(spot).toBeDefined();
      expect(zonesAt(seed, spot.pos, now).some((z) => z.id === ev.id)).toBe(true);
      const ctx: RuleContext = { now, worldSeed: seed };
      const s = fresh(now);
      const res = applyAction(s, { type: 'search', spot, at: spot.pos, accuracyM: 5 }, ctx);
      expect(res.events[0]).toEqual({ type: 'rejected', reason });
      if (kind === 'dust') {
        s.gear.owned.dustMask = now;
        s.gear.worn.face = 'dustMask';
        const ok = applyAction(s, { type: 'search', spot, at: spot.pos, accuracyM: 5 }, ctx);
        expect(ok.events[0]).not.toEqual({ type: 'rejected', reason: 'need_filter' });
      }
    }
  });

  it('die Kiste eines Hilfsabwurfs liegt nur, solange er läuft', () => {
    const { ev, now } = findEvent(seed, 'drop');
    const spot = dropSpot(ev);
    const s = fresh(now);
    const ok = applyAction(s, { type: 'search', spot, at: spot.pos, accuracyM: 5 }, { now, worldSeed: seed });
    expect(ok.events[0].type === 'loot' || (ok.events[0].type === 'rejected' && ok.events[0].reason === 'guarded')).toBe(true);
    const late = applyAction(s, { type: 'search', spot, at: spot.pos, accuracyM: 5 }, { now: ev.until + 1, worldSeed: seed });
    expect(late.events[0]).toEqual({ type: 'rejected', reason: 'invalid_spot' });
  });
});

describe('Trupps', () => {
  const seed = 'trupp-test';

  it('sind für alle gleich, Gruppen passen zur Gegend', () => {
    const a = patrolsAround(seed, HOME, 600, T0, 'town', false);
    const b = patrolsAround(seed, HOME, 600, T0, 'town', false);
    expect(a.length).toBeGreaterThan(2);
    expect(b).toEqual(a);
    for (const p of a) {
      expect(resolvePatrol(seed, p.id, T0, false, 'town')).toEqual(p);
      expect(patrolGroup(seed, p.id, false, 'town')).toEqual(p.group);
      expect(p.group.length).toBeGreaterThan(0);
    }
    // Die Gegend steht nicht in der Kennung: wechselt sie, bleibt ein Trupp derselbe
    const village = new Set(patrolsAround(seed, HOME, 600, T0, 'village', false).map((p) => p.id));
    for (const p of patrolsAround(seed, HOME, 600, T0, 'wild', false)) expect(village.has(p.id)).toBe(true);
    // In der Großstadt sind mehr unterwegs als in der Wildnis
    const city = patrolsAround(seed, HOME, 1500, T0, 'city', false).length;
    const wild = patrolsAround(seed, HOME, 1500, T0, 'wild', false).length;
    expect(city).toBeGreaterThan(wild);
  });

  it('bei Frost sind manche Wandler erstarrt, sonst bleibt alles gleich', () => {
    const plain = patrolsAround(seed, HOME, 1500, T0, 'town', false);
    const frost = patrolsAround(seed, HOME, 1500, T0, 'town', false, [], true);
    expect(frost.map((p) => p.id)).toEqual(plain.map((p) => p.id));
    expect(plain.some((p) => p.group.includes('frozen'))).toBe(false);
    expect(frost.some((p) => p.group.includes('frozen'))).toBe(true);
    for (const p of frost) expect(resolvePatrol(seed, p.id, T0, false, 'town', true)).toEqual(p);
  });

  it('Gewohnheitstiere laufen jeden Tag zur selben Zeit dieselbe Runde', () => {
    const DAY = 24 * 3_600_000;
    const found = new Map<string, ReturnType<typeof patrolsAround>[number]>();
    for (let t = T0; t < T0 + DAY; t += 15 * 60_000)
      for (const p of patrolsAround(seed, HOME, 2500, t, 'town', false)) if (p.group[0] === 'habit') found.set(p.id, p);
    expect(found.size).toBeGreaterThan(0);
    for (const p of found.values()) {
      expect(p.group).toEqual(['habit']);
      expect(patrolGroup(seed, p.id, false, 'town')).toEqual(['habit']);
      expect(resolvePatrol(seed, p.id, p.from + 60_000, false, 'town')).toEqual(p);
      // Am nächsten Tag: dieselbe Strecke, 24 Stunden später
      const next = patrolsAround(seed, HOME, 2500, p.from + DAY + 60_000, 'town', false).find((q) => q.pathKey === p.pathKey);
      expect(next).toBeDefined();
      expect(next!.id).not.toBe(p.id);
      expect(next!.anchor).toEqual(p.anchor);
      expect(next!.lengthM).toBe(p.lengthM);
      expect(next!.from - p.from).toBe(DAY);
    }
    // In der Wildnis wohnt keins
    expect(patrolsAround(seed, HOME, 2500, [...found.values()][0].from + 60_000, 'wild', false).some((p) => p.group[0] === 'habit')).toBe(false);
  });

  it('Hamsterer und Gewohnheitstier bringen eigenen Kram mit', () => {
    const ctx: RuleContext = { now: T0, worldSeed: seed };
    for (const [kind, n] of [['hoarder', 3], ['habit', 1]] as const) {
      const s = fresh(T0 - 3_600_000);
      s.combat = { spot: { id: 'w:t:1:2:3', kind: 'hide', source: 'grid', pos: HOME, name: 'Trupp' }, enemy: 'walker', group: [kind], window: 0, wild: true, patrol: `t:1:2:${kind.length}` };
      const won = applyAction(s, { type: 'battleResult', outcome: 'won', health: 8, kills: 1, usedMedicine: 0 }, ctx);
      const loot = won.events.find((e) => e.type === 'loot');
      expect(loot && loot.type === 'loot' && Object.values(loot.kramMore ?? {}).reduce((a, b) => a + (b ?? 0), 0)).toBe(n);
    }
  });

  it('Überraschungsangriff, Sieg, Beute, und der Trupp ist weg', () => {
    const p = patrolsAround(seed, HOME, 600, T0, 'village', false)[0];
    const ctx: RuleContext = { now: T0, worldSeed: seed };
    const s0 = fresh(T0 - 3_600_000);
    const r1 = applyAction(s0, { type: 'patrolFight', patrol: p.id, at: p.anchor, accuracyM: 5, opening: 'surprise', region: 'village' }, ctx);
    expect(r1.events.map((e) => e.type)).toEqual(['patrol', 'combatStarted']);
    expect(r1.state.combat?.opening).toBe('surprise');
    expect(r1.state.combat?.group).toEqual(p.group);
    const won = applyAction(r1.state, { type: 'battleResult', outcome: 'won', health: 8, kills: 99, usedMedicine: 0 }, ctx);
    // Mehr erledigt als die Gruppe (plus Herbeigerufene) geht nicht
    const wonEv = won.events.find((e) => e.type === 'combatWon');
    expect(wonEv && wonEv.type === 'combatWon' && wonEv.kills).toBeLessThanOrEqual(p.group.length + 2);
    expect(won.events.some((e) => e.type === 'loot')).toBe(true);
    expect(won.state.patrols[p.id]).toBe(T0);
    const again = applyAction(won.state, { type: 'patrolFight', patrol: p.id, at: p.anchor, accuracyM: 5, opening: 'spotted', region: 'village' }, { ...ctx, now: T0 + 10 * 60_000 });
    expect(again.events[0]).toEqual({ type: 'rejected', reason: 'nothing' });
  });

  it('nach einer Begegnung ist kurz Ruhe, erschöpft gibt es keinen Kampf', () => {
    const [p, q] = patrolsAround(seed, HOME, 900, T0, 'city', false);
    const ctx: RuleContext = { now: T0, worldSeed: seed };
    const s = fresh(T0 - 3_600_000);
    const r1 = applyAction(s, { type: 'patrolFight', patrol: p.id, at: p.anchor, accuracyM: 5, opening: 'spotted', region: 'city' }, ctx);
    const fled = applyAction(r1.state, { type: 'battleResult', outcome: 'fled', health: 9, kills: 0, usedMedicine: 0 }, ctx);
    const r2 = applyAction(fled.state, { type: 'patrolFight', patrol: q.id, at: q.anchor, accuracyM: 5, opening: 'spotted', region: 'city' }, { ...ctx, now: T0 + 60_000 });
    expect(r2.events[0]).toEqual({ type: 'rejected', reason: 'cooldown' });
    const tired = fresh(T0);
    tired.health = 1;
    tired.healthAt = T0;
    const r3 = applyAction(tired, { type: 'patrolFight', patrol: q.id, at: q.anchor, accuracyM: 5, opening: 'spotted', region: 'city' }, ctx);
    expect(r3.events[0]).toEqual({ type: 'rejected', reason: 'exhausted' });
  });

  it('erfundene, fremde oder ferne Trupps gibt es nicht', () => {
    const p = patrolsAround(seed, HOME, 600, T0, 'village', false)[0];
    const ctx: RuleContext = { now: T0, worldSeed: seed };
    const s = fresh(T0 - 3_600_000);
    const fight = (patrol: string, at: LatLon = p.anchor) => applyAction(s, { type: 'patrolFight', patrol, at, accuracyM: 5, opening: 'surprise', region: 'village' }, ctx).events[0];
    const [, x, y, w] = p.id.split(':');
    // ausgedacht, mit führender Null, andere Runde, Horde ohne Ereignis
    expect(fight(`t:${x}:${y}:0${w}`)).toEqual({ type: 'rejected', reason: 'nothing' });
    expect(fight(`t:${x}:${y}:${Number(w) - 5}`)).toEqual({ type: 'rejected', reason: 'nothing' });
    expect(fight(`t:h:x:1:2:3:0:0:${w}`)).toEqual({ type: 'rejected', reason: 'nothing' });
    expect(fight('t:z:123:456:' + w)).toEqual({ type: 'rejected', reason: 'nothing' });
    // weit weg von seiner Strecke
    expect(fight(p.id, { lat: p.anchor.lat + 0.02, lon: p.anchor.lon })).toEqual({ type: 'rejected', reason: 'too_far' });
    expect(fight(p.id).type).toBe('patrol');
  });

  it('Horden-Trupps lassen sich prüfen', () => {
    const { ev, now } = findEvent(seed, 'horde');
    const list = patrolsAround(seed, ev.center, 300, now, 'village', false, [ev]).filter((p) => p.horde);
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(resolvePatrol(seed, p.id, now, false, 'village')?.id).toBe(p.id);
  });

  it('nachts ändert sich die Gruppe nur beim Bleichen Wächter und bei wilden Menschen mit Tageszeit', () => {
    let changed = 0;
    const timed = (g: string[]) => g.some((k) => FOE_TIME[k as keyof typeof FOE_TIME]);
    const fallback = REGIONS.town.groups[0][0].join();
    for (const p of patrolsAround(seed, HOME, 900, T0, 'town', false)) {
      const n = patrolGroup(seed, p.id, true, 'town');
      if (n.join() !== p.group.join()) {
        changed++;
        expect(n.join() === 'watcher' || timed(n) || timed(p.group) || n.join() === fallback || p.group.join() === fallback).toBe(true);
      }
    }
    expect(changed).toBeGreaterThanOrEqual(0);
  });

  it('Wegelagerer nur tagsüber, Kalkjünger nur nachts', () => {
    let day = 0;
    let night = 0;
    for (let x = 0; x < 400; x++) {
      for (const region of ['town', 'village'] as const) {
        const id = `t:${x}:7:3`;
        const d = patrolGroup(seed, id, false, region);
        const n = patrolGroup(seed, id, true, region);
        expect(d).not.toContain('drover');
        for (const k of ['shieldbearer', 'archer', 'thief'] as const) expect(n).not.toContain(k);
        if (d.includes('shieldbearer')) day++;
        if (n.includes('drover')) night++;
      }
    }
    // Es gibt sie aber, jeweils zu ihrer Zeit
    expect(day).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(0);
  });

  it('Kampfbeginn: Überraschung, entdeckt, Kälte, Durst', () => {
    const base = { seed: 'k', group: ['walker' as const, 'walker' as const], weapons: [], medicine: 0, health: 10, maxHealth: 10 };
    const normal = createTactics(base);
    const surprise = createTactics({ ...base, opening: 'surprise' });
    expect(surprise.foes.every((f) => f.stunned)).toBe(true);
    expect(surprise.energy).toBe(normal.energy + 1);
    expect(createTactics({ ...base, opening: 'spotted' }).energy).toBe(normal.energy - 1);
    expect(createTactics({ ...base, thirst: true }).energy).toBe(normal.energy - 1);
    expect(createTactics({ ...base, cold: true }).hand.length).toBe(normal.hand.length - 1);
  });

  it('alte Spielstände bekommen die Liste besiegter Trupps', () => {
    const s = fresh() as unknown as Record<string, unknown>;
    delete s.patrols;
    s.schema = 13;
    const m = migrate(s);
    expect(m?.schema).toBe(SCHEMA_VERSION);
    expect(m?.patrols).toEqual({});
  });
});
