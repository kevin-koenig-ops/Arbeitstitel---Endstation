import { describe, expect, it } from 'vitest';
import { distanceM, offsetM } from '../src/core/geo';
import type { LatLon } from '../src/core/types';
import { SPEED, WalkNet } from '../src/map/walkNet';

// Ein kleines Testdorf: zwei Straßen im L (Süd → Nord, dann nach Osten), ein Wohngebiet
// mit Haus in der Ecke, östlich davon ein Wald, ganz im Osten ein Feld.
const C: LatLon = { lat: 51.6, lon: 10.2 };
const at = (x: number, y: number): [number, number] => {
  const p = offsetM(C, x, y);
  return [p.lon, p.lat];
};
const rect = (x0: number, y0: number, x1: number, y1: number) => [[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]];

const net = new WalkNet({
  center: C,
  ways: [
    [at(0, -200), at(0, 0), at(0, 200)],
    [at(0, 200), at(200, 200)],
  ],
  buildings: [rect(40, 40, 60, 60)],
  water: [],
  built: [rect(5, -150, 150, 190)],
  forest: [rect(200, -150, 400, 150)],
});
const ll = (x: number, y: number) => offsetM(C, x, y);
const nearWay = (p: LatLon) => {
  // Abstand zu den beiden Straßen
  const q = { x: (p.lon - C.lon) * 111320 * Math.cos((C.lat * Math.PI) / 180), y: (p.lat - C.lat) * 111320 };
  const d1 = q.y >= -201 && q.y <= 201 ? Math.abs(q.x) : Infinity;
  const d2 = q.x >= -1 && q.x <= 201 ? Math.abs(q.y - 200) : Infinity;
  return Math.min(d1, d2);
};

describe('Wegenetz', () => {
  it('kennt das Gelände', () => {
    expect(net.terrainAt(ll(1, 50))).toBe('road');
    expect(net.terrainAt(ll(50, 50))).toBe('blocked');
    expect(net.terrainAt(ll(100, 0))).toBe('built');
    expect(net.terrainAt(ll(300, 0))).toBe('forest');
    expect(net.terrainAt(ll(500, 0))).toBe('open');
  });

  it('läuft im Ort über die Straßen ums Eck', () => {
    const r = net.route(ll(0, -100), ll(150, 200))!;
    expect(r).not.toBeNull();
    let len = 0;
    for (let i = 1; i < r.path.length; i++) len += distanceM(r.path[i - 1], r.path[i]);
    expect(len).toBeGreaterThan(440);
    for (const p of r.path) expect(nearWay(p)).toBeLessThan(2);
    expect(r.offroad.every((o) => !o)).toBe(true);
  });

  it('kommt auch in Gärten und Höfe (langsamer), aber nicht ins Haus', () => {
    const r = net.route(ll(0, -100), ll(100, 0))!;
    expect(r.snapped).toBe(false);
    expect(distanceM(r.end, ll(100, 0))).toBeLessThan(1);
    expect(r.speeds).toContain(SPEED.built);
    // Tipp aufs Haus: so nah wie möglich, auf dem Weg
    const h = net.route(ll(0, -100), ll(50, 50))!;
    expect(net.terrainAt(h.end)).not.toBe('blocked');
  });

  it('geht draußen quer durch den Wald, aber langsamer', () => {
    const r = net.route(ll(210, 190), ll(300, -100))!;
    expect(r.snapped).toBe(false);
    expect(distanceM(r.end, ll(300, -100))).toBeLessThan(1);
    expect(r.speeds).toContain(SPEED.forest);
    expect(r.offroad.some((o) => o)).toBe(true);
  });

  it('mit dem Joystick überall hin, nur nicht ins Haus', () => {
    const p = net.step(ll(0, 0), ll(10, 3));
    expect(distanceM(p, ll(10, 3))).toBeLessThan(0.01);
    const q = net.step(ll(300, 0), ll(305, 2));
    expect(distanceM(q, ll(305, 2))).toBeLessThan(0.01);
    const house = net.step(ll(38, 50), ll(42, 50));
    expect(distanceM(house, ll(38, 50))).toBeLessThan(0.01);
  });
});

describe('Wegenetz: raus aus dem Ort', () => {
  it('läuft über die Straße bis zum Ortsrand und dann quer zum Ziel', () => {
    // Start mitten im Ort, Ziel auf dem Feld hinter dem Wohngebiet (Norden)
    const r = net.route(ll(0, 0), ll(80, 260))!;
    expect(r).not.toBeNull();
    expect(r.snapped).toBe(false);
    expect(distanceM(r.end, ll(80, 260))).toBeLessThan(1);
    expect(r.offroad.some((o) => o)).toBe(true);
  });
});

describe('Wegenetz: Wasser', () => {
  // Ein Bach von Süd nach Nord bei x = 300 (draußen auf dem Feld), eine Straße mit Brücke bei y = 0
  const wet = new WalkNet({
    center: C,
    ways: [[at(250, 0), at(350, 0)]],
    buildings: [],
    water: [],
    built: [],
    forest: [],
    waterLines: [[at(300, -300), at(300, 300)]],
  });

  it('geht nicht quer durch den Bach, sondern über die Brücke', () => {
    const r = wet.route(ll(260, 150), ll(340, 150))!;
    expect(r).not.toBeNull();
    // Der Weg führt über die Straße (y = 0), nicht direkt hinüber
    expect(r.path.some((p) => Math.abs((p.lat - C.lat) * 111320) < 2)).toBe(true);
    expect(distanceM(r.end, ll(340, 150))).toBeLessThan(1);
  });

  it('der Joystick bleibt am Ufer stehen', () => {
    const p = wet.step(ll(298, 150), ll(302, 150));
    expect(distanceM(p, ll(298, 150))).toBeLessThan(0.01);
    // Auf der Brücke geht es
    const q = wet.step(ll(298, 0), ll(302, 0));
    expect(distanceM(q, ll(302, 0))).toBeLessThan(0.01);
  });
});

describe('Wegenetz: schnell oder leise', () => {
  // Eine gerade Straße nach Norden (x = 0), daneben ein Waldstreifen (x = 30 bis 80).
  const g = new WalkNet({
    center: C,
    ways: [[at(0, -300), at(0, 300)]],
    buildings: [],
    water: [],
    built: [],
    forest: [rect(30, -260, 80, 260)],
    fields: [rect(-200, -300, -20, 300)],
    season: 'autumn',
  });
  const offWay = (p: LatLon) => Math.abs((p.lon - C.lon) * 111320 * Math.cos((C.lat * Math.PI) / 180));

  it('schnell geht über die Straße, leise durch den Wald', () => {
    const fast = g.route(ll(0, -250), ll(0, 250), 'fast')!;
    expect(fast.path.every((p) => offWay(p) < 2)).toBe(true);
    const quiet = g.route(ll(0, -250), ll(0, 250), 'quiet')!;
    expect(quiet).not.toBeNull();
    expect(distanceM(quiet.end, ll(0, 250))).toBeLessThan(1);
    // Ein großer Teil der Strecke liegt im Wald
    const inForest = quiet.path.filter((p) => g.terrainAt(p) === 'forest').length;
    expect(inForest).toBeGreaterThan(1);
    expect(quiet.speeds).toContain(SPEED.forest);
  });

  it('Sperrgebiete: hinein geht es nicht, hinaus schon', () => {
    const z = new WalkNet({ center: C, ways: [[at(0, -300), at(0, 300)]], buildings: [], water: [], built: [], forest: [], noGo: [{ center: ll(0, 0), radiusM: 60 }] });
    expect(z.terrainAt(ll(0, 0))).toBe('blocked');
    const around = z.route(ll(0, -150), ll(0, 150))!;
    expect(around.path.every((p) => distanceM(p, ll(0, 0)) > 55)).toBe(true);
    // Ziel auf der Straße mitten im Sperrgebiet: so nah wie möglich, aber nicht hinein
    const into = z.route(ll(0, -150), ll(0, 0))!;
    expect(into.path.every((p) => distanceM(p, ll(0, 0)) > 55)).toBe(true);
    const out = z.route(ll(0, 0), ll(0, -150))!;
    expect(distanceM(out.end, ll(0, -150))).toBeLessThan(1);
  });
});

describe('Wegenetz: Strecken der Trupps', () => {
  it('folgen den Wegen und sind bei gleichem Zufall gleich', () => {
    const mk = (seed: number) => {
      let a = seed;
      return () => ((a = (a * 16807) % 2147483647) / 2147483647);
    };
    const p1 = net.patrolPath(ll(5, 30), 300, mk(7))!;
    const p2 = net.patrolPath(ll(5, 30), 300, mk(7))!;
    expect(p1).toEqual(p2);
    expect(p1.length).toBeGreaterThan(1);
    for (const p of p1) expect(nearWay(p)).toBeLessThan(2);
    expect(net.patrolPath(ll(2000, 2000), 300, mk(1))).toBeNull();
  });
});
