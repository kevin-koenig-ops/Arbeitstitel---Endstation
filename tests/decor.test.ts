import { describe, expect, it } from 'vitest';
import { distanceM } from '../src/core/geo';
import { DECOR_LIMITS, generateDecor, type DecorInput, type RawPolygon } from '../src/map/decor';
import { buildHouses, orientedBox, type HouseSpec } from '../src/map/houseMesh';
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

  it('baut 3D-Häuser mit Fassaden und Dächern', () => {
    const res = generateDecor(input, center, 400, { houseMeshes: true, month: 7 });
    expect(res.houses.length).toBeGreaterThan(40);
    const old = generateDecor(input, center, 400, { month: 7 });
    // Die Häuser kommen nicht mehr als Klötze in die Extrusions-Ebene
    expect(res.parts.length).toBeLessThan(old.parts.length - res.houses.length);
    const { meshes, shadow } = buildHouses(res.houses);
    for (const m of Object.values(meshes)) {
      expect(m.pos.length % 9).toBe(0);
      expect(m.uv.length).toBe((m.pos.length / 3) * 2);
      expect(m.col.length).toBe(m.pos.length);
      expect(m.pos.every(Number.isFinite) && m.uv.every(Number.isFinite)).toBe(true);
    }
    expect(meshes.roof.pos.length).toBeGreaterThan(0);
    expect(meshes.putz.pos.length + meshes.klinker.pos.length + meshes.fachwerk.pos.length).toBeGreaterThan(0);
    expect(shadow.length % 9).toBe(0);
    // Immer gleich
    expect(JSON.stringify(buildHouses(generateDecor(input, center, 400, { houseMeshes: true, month: 7 }).houses).meshes.roof.pos)).toBe(JSON.stringify(meshes.roof.pos));
    // Winter: Schnee auf den Dächern
    const w = buildHouses(generateDecor(input, center, 400, { houseMeshes: true, month: 1 }).houses);
    expect(w.meshes.roof.pos.length).toBe(0);
    expect(w.meshes.roofSnow.pos.length).toBeGreaterThan(0);
  });

  it('Satteldach: First entlang der langen Seite, Fenster stockwerksgenau', () => {
    const box = orientedBox([
      [0, 0],
      [4, 3],
      [1, 7],
      [-3, 4],
    ]);
    expect(box.L).toBeCloseTo(5, 5);
    expect(box.W).toBeCloseTo(5, 5);
    const house: HouseSpec = {
      ring: [
        [0, 0],
        [12, 0],
        [12, 8],
        [0, 8],
        [0, 0],
      ],
      base: 0,
      top: 6.3,
      facade: 'putz',
      tint: [1, 1, 1],
      state: 'intact',
      roof: 'pitched',
      roofTint: [1, 1, 1],
      flatColor: [0.5, 0.5, 0.5],
      slope: 1,
      chimney: false,
      plinth: true,
      seed: 0.3,
    };
    const { meshes } = buildHouses([house]);
    // 4 Wände + 2 Giebel = 10 Dreiecke Fassade, 2 Dachflächen = 4 Dreiecke
    expect(meshes.putz.pos.length / 9).toBe(10);
    expect(meshes.roof.pos.length / 9).toBe(4);
    // First (höchster Punkt) 4 m über der Traufe (halbe Breite × Neigung 1)
    const ys = meshes.roof.pos.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(10.3, 5);
    // Das Wandbild läuft um das Haus herum: 40 m Umfang = 40/6 Bildbreiten
    expect(Math.max(...meshes.putz.uv.filter((_, i) => i % 2 === 0))).toBeCloseTo(40 / 6, 5);
    // Fenster: 2 Stockwerke × (4 + 2) Achsen je Seite × 2 Seiten, dazu 2 Giebelfenster
    expect(meshes.win.pos.length / 18).toBe(26);
    // Mit Straße im Süden: eine Tür (statt eines Fensters), samt Stufe
    const withDoor = buildHouses([{ ...house, street: [6, -10] }]);
    expect(withDoor.meshes.win.pos.length / 18).toBe(26);
    expect(withDoor.meshes.plain.pos.length).toBeGreaterThan(meshes.plain.pos.length);
    // Ein Nachbar an der Ostwand: dort keine Fenster mehr
    const blocked = buildHouses([{ ...house, neighbors: [[[12, 0], [20, 0], [20, 8], [12, 8]]] }]);
    expect(blocked.meshes.win.pos.length / 18).toBe(26 - 4 - 1);
  });
});
