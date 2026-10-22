import { describe, expect, it } from 'vitest';
import { distanceM } from '../src/core/geo';
import { DECOR_LIMITS, generateDecor, type DecorInput, type RawPolygon } from '../src/map/decor';
import { joinBridges } from '../src/map/bridges';
import { buildHouses, FACADES, orientedBox, ROOF_KINDS, roofKey, type HouseMeshes, type HouseSpec } from '../src/map/houseMesh';
import world from '../src/map/demoWorld.json';

/** Alle Dachflächen zusammen (jede Dachart hat ihr eigenes Mesh). */
const roofPos = (m: HouseMeshes['meshes']) => ROOF_KINDS.flatMap((k) => m[roofKey(k)].pos);

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
    .map((f) => ({
      coords: f.geometry.coordinates as [number, number][],
      drivable: !['path', 'track'].includes(String(f.properties.class)),
      bridge: f.properties.brunnel === 'bridge' ? (['path', 'track'].includes(String(f.properties.class)) ? ('path' as const) : ('major' as const)) : undefined,
    })),
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
    expect(roofPos(meshes).length).toBeGreaterThan(0);
    expect(FACADES.reduce((n, f) => n + meshes[f].pos.length, 0)).toBeGreaterThan(0);
    expect(shadow.length % 9).toBe(0);
    // Immer gleich
    expect(JSON.stringify(roofPos(buildHouses(generateDecor(input, center, 400, { houseMeshes: true, month: 7 }).houses).meshes))).toBe(JSON.stringify(roofPos(meshes)));
    // Winter: Schnee auf den Dächern
    const w = buildHouses(generateDecor(input, center, 400, { houseMeshes: true, month: 1 }).houses);
    expect(roofPos(w.meshes).length).toBe(0);
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
    expect(meshes['roof-ziegel'].pos.length / 9).toBe(4);
    // First (höchster Punkt) 4 m über der Traufe (halbe Breite × Neigung 1)
    const ys = meshes['roof-ziegel'].pos.filter((_, i) => i % 3 === 1);
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
  it('Halle mit Fensterbändern und Rolltor, Plattenbau mit Fenstern mitten in den Platten', () => {
    const base: HouseSpec = {
      ring: [
        [0, 0],
        [30, 0],
        [30, 15],
        [0, 15],
      ],
      base: 0,
      top: 6.3,
      facade: 'halle',
      tint: [1, 1, 1],
      state: 'intact',
      roof: 'flat',
      roofTint: [1, 1, 1],
      flatKind: 'wellblech',
      flatColor: [0.5, 0.5, 0.5],
      slope: 0.25,
      chimney: false,
      plinth: false,
      seed: 0.5,
    };
    // Halle: Bänder aus 5,4-m-Stücken (je Langseite 4, je Stirnseite 2), über dem Tor fallen 2 weg
    const hall = buildHouses([{ ...base, street: [15, -10] }]).meshes;
    expect(hall.win.pos.length / 18).toBe(4 + 2 + 2 + 2 + 1);
    expect(hall['roof-wellblech'].pos.length).toBeGreaterThan(0);
    expect(hall.halle.pos.length).toBeGreaterThan(0);
    // Plattenbau: Fenster 1,7 m breit, Mitte bei 1,5 m + 3 m · k (das Wandbild hat 3-m-Platten)
    const pl = buildHouses([{ ...base, facade: 'platte', ring: [[0, 0], [12, 0], [12, 10], [0, 10]] }]).meshes;
    const south: number[] = [];
    for (let i = 0; i < pl.win.pos.length; i += 3) if (Math.abs(pl.win.pos[i + 2] - 0.03) < 1e-6) south.push(pl.win.pos[i]);
    expect(south.length).toBe(4 * 2 * 6);
    for (const x of south) expect([0.65, 2.35].some((v) => Math.abs((((x % 3) + 3) % 3) - v) < 1e-6)).toBe(true);
  });

  it('Brücken: aus den Kartendaten, an Kachelgrenzen wieder zusammengesetzt, mit Modell', () => {
    const res = generateDecor(input, center, 600, { houseMeshes: true, month: 7 });
    expect(res.bridges.length).toBe(2);
    expect(res.bridges.map((b) => b.kind).sort()).toEqual(['major', 'path']);
    const without = buildHouses(res.houses, res.props).meshes.plain.pos.length;
    const withB = buildHouses(res.houses, res.props, res.bridges).meshes.plain.pos.length;
    expect(withB).toBeGreaterThan(without + 9 * 40);
    // Eine Brücke in zwei Stücken (Kachelgrenze) wird wieder eine, doppelte Stücke fallen weg
    const a = { kind: 'minor' as const, path: [[0, 0], [10, 0]] as [number, number][] };
    const b = { kind: 'minor' as const, path: [[10, 0], [20, 2]] as [number, number][] };
    expect(joinBridges([a, b])).toEqual([{ kind: 'minor', path: [[0, 0], [10, 0], [20, 2]] }]);
    expect(joinBridges([a, { ...a }])).toHaveLength(1);
  });
});

describe('Bekannte Bauwerke (nur Optik)', () => {
  const pois = feats
    .filter((f) => f.properties._layer === 'poi')
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates as [number, number];
      return { lon, lat, cls: String(f.properties.class), subclass: String(f.properties.subclass) };
    });
  const full: DecorInput = { ...input, pois, cemeteries: polys('landuse', ['cemetery']) };

  it('Kirche, Feuerwehr, Polizei und Rathaus bekommen ihr eigenes Aussehen', () => {
    const res = generateDecor(full, center, 700, { houseMeshes: true });
    const kinds = res.houses.map((h) => h.civic?.kind).filter(Boolean);
    expect(kinds).toEqual(expect.arrayContaining(['church', 'fire', 'police', 'townhall', 'school']));
    // Der Turm neben der Kirche (eigenes Gebäude in den Kartendaten) bekommt die spitze Haube
    expect(res.houses.some((h) => h.spire)).toBe(true);
    expect(res.houses.find((h) => h.civic?.kind === 'church')!.civic!.tower).toBe(false);
    const m = buildHouses(res.houses, res.props, res.bridges, res.graveyards);
    expect(Object.keys(m.signs)).toEqual(expect.arrayContaining(['POLIZEI|#1f4f9a|#ffffff', 'FEUERWEHR|#c8312a|#ffffff', 'RATHAUS|#f1e6cf|#3a2a1a', '@clock']));
  });

  it('Friedhof: Mauer und Grabreihen, aber nichts in der Kirche', () => {
    const res = generateDecor(full, center, 700, { houseMeshes: true });
    expect(res.graveyards.length).toBe(1);
    const g = res.graveyards[0];
    expect(g.keepOut.length).toBeGreaterThan(0);
    const m = buildHouses([], [], [], res.graveyards);
    // Mauer plus einige hundert Gräber (je Grab mindestens ein Quader aus 30 Ecken)
    expect(m.meshes.plain.pos.length / 3).toBeGreaterThan(30 * 150);
  });

  it('Kirche ohne eigenen Turm in den Kartendaten: das Spiel baut einen', () => {
    const lonely = { ...full, buildings: full.buildings.filter((b) => (b.height ?? 0) < 25) };
    const res = generateDecor(lonely, center, 700, { houseMeshes: true });
    const church = res.houses.find((h) => h.civic?.kind === 'church')!;
    expect(church.civic!.tower).toBe(true);
    const m = buildHouses([church]);
    expect(Object.keys(m.signs)).toContain('@clock');
  });
});
