import { describe, expect, it } from 'vitest';
import { ringArea } from '../src/map/decor';
import { planWorld } from '../src/map/worldPlan';

const C = { lat: 51.6, lon: 10.2 };
const kx = 111320 * Math.cos((C.lat * Math.PI) / 180);
const m2ll = (x: number, y: number): [number, number] => [C.lon + x / kx, C.lat + y / 111320];

/** Ein Haus 10 × 8 m (im Uhrzeigersinn angegeben) und eine Straße daneben. */
const input = {
  buildings: [{ rings: [[m2ll(0, 0), m2ll(0, 8), m2ll(10, 8), m2ll(10, 0), m2ll(0, 0)]], height: 7 }],
  forests: [],
  greens: [],
  meadows: [],
  residential: [],
  roads: [{ coords: [m2ll(-200, -12), m2ll(200, -12)], drivable: true }],
};

describe('3D-Welt auf der Karte', () => {
  it('plant Häuser mit Grundriss gegen den Uhrzeigersinn', () => {
    const plan = planWorld(input, C, 300);
    expect(plan.houses).toHaveLength(1);
    const h = plan.houses[0];
    // ringArea ist für „gegen den Uhrzeigersinn“ negativ
    expect(ringArea([...h.ring, h.ring[0]])).toBeLessThan(0);
    expect(h.wallTop).toBeGreaterThan(2.7);
    if (h.state === 'intact') expect(h.roof).toBe('gable');
  });

  it('ist deterministisch und setzt Dinge an die Straße', () => {
    const a = planWorld(input, C, 300);
    const b = planWorld(input, C, 300);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.cars.length + a.lamps.length + a.props.length + a.poles.length).toBeGreaterThan(0);
    // nichts steht im Haus
    for (const t of [...a.cars, ...a.props, ...a.lamps]) expect(t.p[0] > 0 && t.p[0] < 10 && t.p[1] > 0 && t.p[1] < 8).toBe(false);
  });
});
