import { describe, expect, it } from 'vitest';
import { distanceM } from '../src/core/geo';
import { DECOR_LIMITS, generateDecor, type DecorInput, type RawPolygon } from '../src/map/decor';
import world from '../src/map/demoWorld.json';

type F = { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } };
const feats = (world as unknown as { geojson: { features: F[] } }).geojson.features;
const polys = (layer: string, classes?: string[]): RawPolygon[] =>
  feats
    .filter((f) => f.properties._layer === layer && f.geometry.type === 'Polygon' && (!classes || classes.includes(String(f.properties.class))))
    .map((f) => ({ rings: f.geometry.coordinates as [number, number][][], height: f.properties.render_height as number | undefined }));

const input: DecorInput = {
  buildings: polys('building'),
  forests: polys('landcover', ['wood']),
  greens: polys('landuse', ['cemetery']),
  meadows: polys('landcover', ['grass']),
  residential: polys('landuse', ['residential']),
  roads: feats
    .filter((f) => f.properties._layer === 'transportation' && f.geometry.type === 'LineString')
    .map((f) => ({ coords: f.geometry.coordinates as [number, number][], drivable: !['path', 'track'].includes(String(f.properties.class)) })),
};
const center = (world as unknown as { start: { lat: number; lon: number } }).start;

describe('Kartendetails', () => {
  it('erzeugt Häuser, Bäume und Autowracks', () => {
    const t0 = performance.now();
    const res = generateDecor(input, center, 600);
    const ms = performance.now() - t0;
    expect(res.counts.buildings).toBeGreaterThan(100);
    expect(res.counts.trees).toBeGreaterThan(300);
    expect(res.counts.cars).toBeGreaterThan(5);
    expect(res.counts.trees).toBeLessThanOrEqual(DECOR_LIMITS.trees);
    expect(ms).toBeLessThan(1500);
    for (const p of res.parts) expect(p.top).toBeGreaterThan(p.base);
  });

  it('ist deterministisch und hängt nicht vom Ausschnitt ab', () => {
    const a = generateDecor(input, center, 300);
    const b = generateDecor(input, { lat: center.lat + 0.0004, lon: center.lon - 0.0003 }, 300);
    const key = (p: { ring: [number, number][]; color: string }) => `${p.ring[0][0].toFixed(6)}:${p.ring[0][1].toFixed(6)}:${p.color}`;
    const inner = (p: { ring: [number, number][] }) => distanceM(center, { lat: p.ring[0][1], lon: p.ring[0][0] }) < 150;
    const ka = new Set(a.parts.filter(inner).map(key));
    const kb = b.parts.filter(inner).map(key);
    const shared = kb.filter((k) => ka.has(k)).length;
    expect(shared / kb.length).toBeGreaterThan(0.97);
  });

  it('bleibt im Radius', () => {
    const res = generateDecor(input, center, 250);
    for (const p of res.parts) expect(distanceM(center, { lat: p.ring[0][1], lon: p.ring[0][0] })).toBeLessThan(330);
  });
});
