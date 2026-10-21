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
  const d1 = q.y >= -200 && q.y <= 200 ? Math.abs(q.x) : Infinity;
  const d2 = q.x >= 0 && q.x <= 200 ? Math.abs(q.y - 200) : Infinity;
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

  it('bleibt bei einem Tipp in einen Garten auf der Straße stehen', () => {
    const r = net.route(ll(0, -100), ll(100, 0))!;
    expect(r.snapped).toBe(true);
    expect(nearWay(r.end)).toBeLessThan(2);
  });

  it('geht draußen quer durch den Wald, aber langsamer', () => {
    const r = net.route(ll(210, 190), ll(300, -100))!;
    expect(r.snapped).toBe(false);
    expect(distanceM(r.end, ll(300, -100))).toBeLessThan(1);
    expect(r.speeds).toContain(SPEED.forest);
    expect(r.offroad.some((o) => o)).toBe(true);
  });

  it('rutscht mit dem Joystick im Ort zurück auf die Straße', () => {
    const p = net.step(ll(0, 0), ll(10, 3));
    expect(nearWay(p)).toBeLessThan(1);
    // Draußen geht es frei
    const q = net.step(ll(300, 0), ll(305, 2));
    expect(distanceM(q, ll(305, 2))).toBeLessThan(0.01);
  });
});
