// Wahrzeichen auf der Karte: echte Läden, Apotheken, Supermärkte, Baumärkte, Werkstätten,
// Tankstellen, Haltestellen und Brunnen. Sie stehen auf ihrem echten Grundriss und bekommen
// die Teile, an denen man sie sofort erkennt: Schaufenster, Markise, Schild, Vordach,
// Einkaufswagen, Paletten, Rolltore, Zapfsäulen. Je Ort zwei, drei Varianten (Farben).
//
// Reine Rechnung ohne Browser. Die Schilder sind Bilder, die map/treeLayer.ts aus dem
// Schlüssel malt: "TEXT|Hintergrund|Schrift" oder "@A" (Apotheken-A), "@cross", "@H", "@fuel".

import { block, dist, emptyMesh, flat, prism, tri, type MeshData, type P3, type Pt, type RGB } from './meshKit';
import { CONCRETE, DOOR, frontWall, GREY, onWall, rgb, sign, SIGN_RATIO, WHITE, type Signs } from './landmarkKit';
import { HALL_AREA, hallShop, smallShop, type ShopCtx } from './shopLooks';

export type ShopKind = 'supermarket' | 'shop' | 'pharmacy' | 'doctor' | 'hardware' | 'garage';
export type PropKind = 'fuel' | 'stop' | 'well';
export type LandmarkKind = ShopKind | PropKind;

/** Kartenorte (OSM-Wert), die ein eigenes Aussehen bekommen, und was auf dem Schild steht. */
const LANDMARKS: Record<string, { kind: LandmarkKind; sign: string }> = {
  supermarket: { kind: 'supermarket', sign: 'MARKT' },
  convenience: { kind: 'shop', sign: 'KIOSK' },
  kiosk: { kind: 'shop', sign: 'KIOSK' },
  grocery: { kind: 'shop', sign: 'LEBENSMITTEL' },
  bakery: { kind: 'shop', sign: 'BÄCKEREI' },
  butcher: { kind: 'shop', sign: 'METZGEREI' },
  greengrocer: { kind: 'shop', sign: 'OBST & GEMÜSE' },
  deli: { kind: 'shop', sign: 'FEINKOST' },
  beverages: { kind: 'shop', sign: 'GETRÄNKE' },
  farm: { kind: 'shop', sign: 'HOFLADEN' },
  chemist: { kind: 'shop', sign: 'DROGERIE' },
  pharmacy: { kind: 'pharmacy', sign: 'APOTHEKE' },
  doctors: { kind: 'doctor', sign: 'ARZTPRAXIS' },
  dentist: { kind: 'doctor', sign: 'ZAHNARZT' },
  hardware: { kind: 'hardware', sign: 'EISENWAREN' },
  doityourself: { kind: 'hardware', sign: 'BAUMARKT' },
  garden_centre: { kind: 'hardware', sign: 'GARTENCENTER' },
  trade: { kind: 'hardware', sign: 'GROSSHANDEL' },
  car_repair: { kind: 'garage', sign: 'WERKSTATT' },
  car_parts: { kind: 'garage', sign: 'AUTOTEILE' },
  fuel: { kind: 'fuel', sign: 'TANKSTELLE' },
  bus_stop: { kind: 'stop', sign: '' },
  bus_station: { kind: 'stop', sign: '' },
  fountain: { kind: 'well', sign: '' },
  drinking_water: { kind: 'well', sign: '' },
  water_well: { kind: 'well', sign: '' },
  water_point: { kind: 'well', sign: '' },
};

/** Wie bei den Fundstellen: nur die genaue Art zählt (sonst wird jede Ladesäule eine Tankstelle). */
export function landmarkOf(cls?: string, subclass?: string): { kind: LandmarkKind; sign: string; sub: string } | null {
  const v = subclass || cls;
  return v && LANDMARKS[v] ? { ...LANDMARKS[v], sub: v } : null;
}

export const isShopKind = (k: LandmarkKind): k is ShopKind => k !== 'fuel' && k !== 'stop' && k !== 'well';
/** Große Hallen statt Laden im Wohnhaus. */
export const isHallKind = (k: LandmarkKind) => k === 'supermarket' || k === 'hardware' || k === 'garage';

export interface ShopSpec {
  kind: ShopKind;
  sign: string;
  /** Richtung Straße (Punkt in Metern): dorthin zeigt die Ladenfront. */
  toward: Pt;
  /** Farbvariante 0–2 */
  variant: number;
  /** Genaue Art aus den Kartendaten (bakery, butcher …): eigenes Aussehen je Art. */
  sub?: string;
  /** Eigene Halle (großer Grundriss) statt Laden im Erdgeschoss. */
  hall?: boolean;
}

export interface PropSpec {
  kind: PropKind;
  /** Mitte in Metern */
  p: Pt;
  /** Richtung der Straße (Bogenmaß); quer dazu steht man an der Straße */
  ang: number;
  /** Zur Straße hin: +1 oder -1 quer zur Richtung */
  side: number;
  variant: number;
  /** Genaue Art (fountain, water_well, bus_station …) */
  sub?: string;
}

export { frontWall, SIGN_RATIO, type Signs } from './landmarkKit';

// Farben je Art und Variante: [Schild-Hintergrund, Schrift, Akzent (Markise, Band, Vordach)]
const PALETTE: Record<LandmarkKind, [string, string, string][]> = {
  supermarket: [
    ['#c8312a', '#ffffff', '#c8312a'],
    ['#2f7d3a', '#ffffff', '#2f7d3a'],
    ['#1f4f9a', '#ffd23a', '#1f4f9a'],
  ],
  shop: [
    ['#f1e6cf', '#5a2a1a', '#c8402e'],
    ['#2e5a3a', '#f3dc8a', '#3f7d4a'],
    ['#f1e6cf', '#22406e', '#3a66a8'],
  ],
  pharmacy: [
    ['#ffffff', '#c8102e', '#c8102e'],
    ['#ffffff', '#1f7a3e', '#2f9a4e'],
    ['#ffffff', '#c8102e', '#2f9a4e'],
  ],
  doctor: [
    ['#ffffff', '#1f4f9a', '#1f4f9a'],
    ['#ffffff', '#2a6a5a', '#2a6a5a'],
    ['#eef2f6', '#1f4f9a', '#1f4f9a'],
  ],
  hardware: [
    ['#e8742a', '#ffffff', '#e8742a'],
    ['#f2c230', '#222222', '#f2c230'],
    ['#2f7d3a', '#ffffff', '#e8742a'],
  ],
  garage: [
    ['#2a5aa8', '#ffffff', '#2a5aa8'],
    ['#d23a2a', '#ffffff', '#d23a2a'],
    ['#333a40', '#f2c230', '#f2c230'],
  ],
  fuel: [
    ['#d23a2a', '#ffffff', '#d23a2a'],
    ['#1f4f9a', '#ffd23a', '#1f4f9a'],
    ['#2f7d3a', '#ffffff', '#f2c230'],
  ],
  stop: [['#f2c230', '#1f7a3e', '#5b5f5c']],
  well: [['#ffffff', '#000000', '#8a857a']],
};

const pal = (k: LandmarkKind, v: number) => PALETTE[k][v % PALETTE[k].length];

/** Ladenfront, Schild und Kleinkram an einem Gebäude, je nach Art und Größe. top: Traufhöhe. */
export function addShop(shop: ShopSpec, ring: Pt[], top: number, plain: MeshData, signs: Signs) {
  const f = frontWall(ring, shop.toward);
  const c = pal(shop.kind, shop.variant);
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ctx: ShopCtx = { f, L: f.len, mid: f.len / 2, top, area: Math.abs(area) / 2, plain, signs, variant: shop.variant, c, accent: rgb(c[2]), text: shop.sign };
  const sub = shop.sub ?? DEFAULT_SUB[shop.kind];
  const hall = shop.hall ?? (isHallKind(shop.kind) && top > 4.2);
  if (hall) hallShop(sub, ctx);
  else smallShop(sub, ctx);
}

/** Alte Spielstände und Tests ohne genaue Art: so wie früher je Gruppe. */
const DEFAULT_SUB: Record<ShopKind, string> = { supermarket: 'supermarket', shop: 'grocery', pharmacy: 'pharmacy', doctor: 'doctors', hardware: 'doityourself', garage: 'car_repair' };

/** Wird dieser Laden eine eigene Halle? (Art und Grundfläche) */
export function shopIsHall(kind: ShopKind, sub: string | undefined, area: number): boolean {
  const need = HALL_AREA[sub ?? DEFAULT_SUB[kind]];
  return need !== undefined && area > need;
}

/** Freistehende Wahrzeichen: Tankstelle, Haltestelle, Brunnen. */
export function addProp(pr: PropSpec, plain: MeshData, signs: Signs) {
  const c = pal(pr.kind, pr.variant);
  const accent = rgb(c[2]);
  const ca = Math.cos(pr.ang);
  const sa = Math.sin(pr.ang);
  // a entlang der Straße, b quer dazu (positiv = weg von der Straße)
  const at = (a: number, b: number): Pt => [pr.p[0] + a * ca - b * pr.side * sa, pr.p[1] + a * sa + b * pr.side * ca];

  if (pr.kind === 'fuel') {
    const len = 11;
    const wid = 7;
    // Dach auf vier Säulen, rundherum ein farbiges Band
    block(plain, pr.p[0], pr.p[1], pr.ang, len, wid, 4.7, 5.35, accent, [0.88, 0.88, 0.86], true);
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        const q = at(a * (len / 2 - 1.2), b * (wid / 2 - 1));
        block(plain, q[0], q[1], pr.ang, 0.35, 0.35, 0, 4.7, WHITE);
      }
    // Zwei Zapfinseln mit je zwei Säulen
    for (const b of [-1.5, 1.5]) {
      const q = at(0, b);
      block(plain, q[0], q[1], pr.ang, 4.2, 0.9, 0, 0.15, CONCRETE);
      for (const a of [-1.1, 1.1]) {
        const s = at(a, b);
        block(plain, s[0], s[1], pr.ang, 0.55, 0.38, 0.15, 1.75, WHITE, accent);
        block(plain, s[0], s[1], pr.ang, 0.57, 0.4, 1.15, 1.45, accent);
      }
    }
    // Preismast an der Straße
    const m = at(len / 2 + 1.5, -wid / 2 - 1.5);
    block(plain, m[0], m[1], pr.ang, 0.3, 0.3, 0, 4.6, GREY);
    block(plain, m[0], m[1], pr.ang, 0.35, 1.7, 4.6, 7.3, accent);
    for (const s of [-1, 1]) {
      const q0 = at(len / 2 + 1.5 + s * 0.19, -wid / 2 - 1.5 - 0.8);
      const q1 = at(len / 2 + 1.5 + s * 0.19, -wid / 2 - 1.5 + 0.8);
      sign(signs, `@fuel|${c[0]}`, s > 0 ? q0 : q1, s > 0 ? q1 : q0, 4.7, 7.2);
    }
    // Kassenhäuschen hinter den Zapfsäulen, Glasfront zur Straße, Luft und Wasser an der Seite
    const kb = wid / 2 + 3.4;
    const k = at(0, kb);
    block(plain, k[0], k[1], pr.ang, 7, 4.4, 0, 3.1, [0.86, 0.86, 0.84], [0.62, 0.62, 0.6]);
    block(plain, k[0], k[1], pr.ang, 7.1, 4.5, 2.55, 3.0, accent);
    const fb = kb - 2.23;
    const g0 = at(-2.9, fb);
    const g1 = at(2.9, fb);
    flat(plain, [g0[0], g0[1], 0.35], [g1[0], g1[1], 0.35], [g1[0], g1[1], 2.4], [g0[0], g0[1], 2.4], [0.24, 0.32, 0.36]);
    const d0 = at(-0.6, fb - 0.02);
    const d1 = at(0.6, fb - 0.02);
    flat(plain, [d0[0], d0[1], 0], [d1[0], d1[1], 0], [d1[0], d1[1], 2.3], [d0[0], d0[1], 2.3], DOOR);
    const air = at(-len / 2 - 0.4, wid / 2 + 0.4);
    block(plain, air[0], air[1], pr.ang, 0.4, 0.3, 0, 1.4, [0.2, 0.38, 0.66], WHITE);
    return;
  }

  if (pr.kind === 'stop' && pr.sub === 'bus_station') {
    // Busbahnhof: Bussteig mit langer Überdachung, mehreren Bänken, Fahrplänen und zwei H-Schildern
    const n = 4;
    const L = n * 3.6;
    const kerb = at(0, 0.6);
    block(plain, kerb[0], kerb[1], pr.ang, L + 2, 3.2, 0, 0.16, CONCRETE, [0.6, 0.58, 0.54]);
    const roof = at(0, 0.8);
    block(plain, roof[0], roof[1], pr.ang, L, 2.8, 3.0, 3.18, [0.36, 0.38, 0.4], [0.46, 0.48, 0.5], true);
    for (let k = 0; k <= n; k++) {
      const q = at(-L / 2 + k * (L / n), 1.8);
      block(plain, q[0], q[1], pr.ang, 0.14, 0.14, 0.16, 3.0, [0.36, 0.38, 0.4]);
    }
    for (let k = 0; k < n; k++) {
      const a = -L / 2 + (k + 0.5) * (L / n);
      const b = at(a, 1.55);
      block(plain, b[0], b[1], pr.ang, 1.8, 0.4, 0.58, 0.66, [0.62, 0.46, 0.3]);
      if (k % 2 === 0) {
        // Fahrplan-Tafel an der Rückseite
        const t0 = at(a + 1.0, 1.95);
        const t1 = at(a + 1.7, 1.95);
        flat(plain, [t0[0], t0[1], 1.0], [t1[0], t1[1], 1.0], [t1[0], t1[1], 2.0], [t0[0], t0[1], 2.0], [0.9, 0.9, 0.86]);
      }
    }
    for (const e of [-1, 1]) {
      const pole = at(e * (L / 2 + 0.6), -0.6);
      block(plain, pole[0], pole[1], pr.ang, 0.08, 0.08, 0, 2.7, GREY);
      sign(signs, '@H', at(e * (L / 2 + 0.6) - 0.3, -0.6), at(e * (L / 2 + 0.6) + 0.3, -0.6), 2.2, 2.8);
    }
    return;
  }

  if (pr.kind === 'stop') {
    // Wartehäuschen: Dach, Rückwand aus Glas, Bank, Haltestellenschild
    block(plain, at(0, 0.2)[0], at(0, 0.2)[1], pr.ang, 3.4, 1.6, 2.3, 2.42, [0.36, 0.38, 0.4]);
    const w0 = at(-1.6, 0.9);
    const w1 = at(1.6, 0.9);
    flat(plain, [w0[0], w0[1], 0.1], [w1[0], w1[1], 0.1], [w1[0], w1[1], 2.3], [w0[0], w0[1], 2.3], [0.62, 0.72, 0.76]);
    for (const a of [-1.6, 1.6]) {
      const q = at(a, 0.9);
      block(plain, q[0], q[1], pr.ang, 0.1, 0.1, 0, 2.3, [0.36, 0.38, 0.4]);
      const s0 = at(a, 0.9);
      const s1 = at(a, -0.3);
      flat(plain, [s0[0], s0[1], 0.6], [s1[0], s1[1], 0.6], [s1[0], s1[1], 2.2], [s0[0], s0[1], 2.2], [0.66, 0.75, 0.79]);
    }
    const bench = at(0, 0.55);
    block(plain, bench[0], bench[1], pr.ang, 1.9, 0.4, 0.42, 0.5, [0.62, 0.46, 0.3]);
    const pole = at(-2.3, -0.4);
    block(plain, pole[0], pole[1], pr.ang, 0.08, 0.08, 0, 2.7, GREY);
    sign(signs, '@H', at(-2.6, -0.4), at(-2.0, -0.4), 2.2, 2.8);
    return;
  }

  const WATER: RGB = [0.3, 0.44, 0.52];
  const STONE_W: RGB = [0.62, 0.6, 0.56];
  const [x, y] = pr.p;
  if (pr.sub === 'drinking_water') {
    // Trinkbrunnen: schlanke Säule mit kleiner Schale, ein Gitter am Boden
    block(plain, x, y, pr.ang, 0.7, 0.7, 0, 0.04, [0.32, 0.33, 0.34]);
    prism(plain, x, y, 0.16, 10, 0.04, 1.0, [0.5, 0.54, 0.56]);
    prism(plain, x, y, 0.28, 10, 1.0, 1.1, [0.56, 0.6, 0.62], WATER);
    const sp = at(0.12, 0);
    block(plain, sp[0], sp[1], pr.ang, 0.22, 0.06, 1.18, 1.24, [0.4, 0.42, 0.44]);
    return;
  }
  if (pr.sub === 'water_well') {
    // Ziehbrunnen: runder Steinschacht, zwei Pfosten, kleines Dach, Kurbel und Eimer
    prism(plain, x, y, 0.95, 12, 0, 0.85, STONE_W, [0.1, 0.12, 0.14]);
    prism(plain, x, y, 1.02, 12, 0.85, 0.95, [0.56, 0.54, 0.5], [0.1, 0.12, 0.14]);
    const wood: RGB = [0.45, 0.31, 0.19];
    for (const a of [-1.05, 1.05]) {
      const q = at(a, 0);
      block(plain, q[0], q[1], pr.ang, 0.14, 0.14, 0, 2.15, wood);
    }
    const ax = at(0, 0);
    block(plain, ax[0], ax[1], pr.ang, 2.3, 0.08, 1.6, 1.68, [0.35, 0.33, 0.3]);
    const cr = at(1.25, 0);
    block(plain, cr[0], cr[1], pr.ang, 0.06, 0.4, 1.4, 1.68, [0.35, 0.33, 0.3]);
    prism(plain, ax[0], ax[1], 0.16, 8, 1.0, 1.3, [0.5, 0.36, 0.22]);
    // Satteldach über dem Schacht
    const roof: RGB = [0.48, 0.24, 0.18];
    for (const b of [-1, 1]) {
      const e0 = at(-1.3, b * 0.85);
      const e1 = at(1.3, b * 0.85);
      const r0 = at(-1.3, 0);
      const r1 = at(1.3, 0);
      flat(plain, [e0[0], e0[1], 2.05], [e1[0], e1[1], 2.05], [r1[0], r1[1], 2.65], [r0[0], r0[1], 2.65], roof);
    }
    return;
  }
  if (pr.sub === 'water_point') {
    // Schwengelpumpe: eiserne Säule auf einem Stein, Hebel, Ausguss über einem Trog
    const iron: RGB = [0.22, 0.26, 0.24];
    block(plain, x, y, pr.ang, 0.6, 0.6, 0, 0.3, STONE_W);
    prism(plain, x, y, 0.12, 8, 0.3, 1.3, iron);
    block(plain, x, y, pr.ang, 0.3, 0.3, 1.3, 1.5, iron);
    const lv = at(-0.45, 0);
    block(plain, lv[0], lv[1], pr.ang, 0.9, 0.06, 1.42, 1.5, iron);
    const sp = at(0.22, 0.12);
    block(plain, sp[0], sp[1], pr.ang + Math.PI / 2, 0.3, 0.08, 0.98, 1.06, iron);
    const tr = at(0.2, 0.75);
    block(plain, tr[0], tr[1], pr.ang, 1.2, 0.55, 0, 0.45, [0.56, 0.54, 0.5], WATER);
    return;
  }
  // Zierbrunnen (Marktbrunnen): achteckiges Becken, Säule mit Schale und Kugel obendrauf
  prism(plain, x, y, 1.4, 8, 0, 0.6, STONE_W, WATER);
  prism(plain, x, y, 0.25, 8, 0.6, 1.45, [0.66, 0.64, 0.6]);
  prism(plain, x, y, 0.75, 8, 1.45, 1.6, [0.6, 0.58, 0.54], WATER);
  prism(plain, x, y, 0.14, 8, 1.6, 2.15, [0.66, 0.64, 0.6]);
  prism(plain, x, y, 0.24, 8, 2.15, 2.4, [0.6, 0.58, 0.54]);
  const sp = at(0.3, 0);
  block(plain, sp[0], sp[1], pr.ang, 0.4, 0.1, 1.25, 1.35, [0.4, 0.38, 0.35]);
}

/** Für Tests: alle Teile eines Wahrzeichens als ein Topf. */
export function previewProp(pr: PropSpec): { plain: MeshData; signs: Signs } {
  const plain = emptyMesh();
  const signs: Signs = {};
  addProp(pr, plain, signs);
  return { plain, signs };
}


// --- Öffentliche Gebäude: Kirche, Polizei, Feuerwehr, Rathaus, Schule … -------------------
// Nur Optik. An diesen Orten gibt es nie Fundstellen, Sichtungen oder Kämpfe.

export type CivicKind = 'church' | 'police' | 'fire' | 'townhall' | 'school' | 'kita' | 'hospital' | 'library' | 'museum' | 'station' | 'post';

/** Kartenorte (OSM-Klasse oder -Wert) und was auf dem Schild steht. */
const CIVIC: Record<string, { kind: CivicKind; sign: string }> = {
  place_of_worship: { kind: 'church', sign: '' },
  police: { kind: 'police', sign: 'POLIZEI' },
  fire_station: { kind: 'fire', sign: 'FEUERWEHR' },
  town_hall: { kind: 'townhall', sign: 'RATHAUS' },
  school: { kind: 'school', sign: 'SCHULE' },
  college: { kind: 'school', sign: 'BERUFSSCHULE' },
  university: { kind: 'school', sign: 'HOCHSCHULE' },
  kindergarten: { kind: 'kita', sign: 'KITA' },
  hospital: { kind: 'hospital', sign: 'KRANKENHAUS' },
  library: { kind: 'library', sign: 'BÜCHEREI' },
  museum: { kind: 'museum', sign: 'MUSEUM' },
  station: { kind: 'station', sign: 'BAHNHOF' },
  halt: { kind: 'station', sign: 'BAHNHOF' },
  post_office: { kind: 'post', sign: 'POST' },
  post: { kind: 'post', sign: 'POST' },
};

export function civicOf(cls?: string, subclass?: string): { kind: CivicKind; sign: string } | null {
  for (const v of [subclass, cls]) if (v && CIVIC[v]) return CIVIC[v];
  return null;
}

export interface CivicSpec {
  kind: CivicKind;
  sign: string;
  /** Richtung Straße: dorthin zeigen Eingang und Schild. */
  toward: Pt;
  variant: number;
  /** Kirche: eigener Turm (wenn die Kartendaten keinen eigenen Turm haben). */
  tower?: boolean;
  /** Firsthöhe über dem Boden (für Dachreiter). */
  ridge: number;
  /** Nur ein Stück desselben Gebäudes (Kartenkacheln schneiden Grundrisse): gleiche Wand, kein zweites Schild. */
  part?: boolean;
}

// Schild: [Hintergrund, Schrift]
const CIVIC_SIGN: Record<CivicKind, [string, string]> = {
  church: ['#f1e6cf', '#3a2a1a'],
  police: ['#1f4f9a', '#ffffff'],
  fire: ['#c8312a', '#ffffff'],
  townhall: ['#f1e6cf', '#3a2a1a'],
  school: ['#2f5a8a', '#ffffff'],
  kita: ['#f2c230', '#2a4a7a'],
  hospital: ['#ffffff', '#c8312a'],
  library: ['#2e5a3a', '#f3dc8a'],
  museum: ['#f1e6cf', '#5a2a1a'],
  station: ['#1f4f9a', '#ffffff'],
  post: ['#f2c230', '#222222'],
};

const STONE: RGB = [0.72, 0.69, 0.62];
const STONE_DARK: RGB = [0.5, 0.48, 0.44];
const SLATE: RGB = [0.27, 0.29, 0.32];
const COPPER: RGB = [0.38, 0.56, 0.5];
const LOUVER: RGB = [0.16, 0.15, 0.14];
const RED_GATE: RGB = [0.74, 0.16, 0.12];

/** Pyramidendach über einem Quadrat (Turmspitze, Dachreiter). */
function pyramid(m: MeshData, cx: number, cy: number, ang: number, size: number, z0: number, h: number, col: RGB) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const r = size / 2;
  const at = (a: number, b: number): P3 => [cx + a * c - b * s, cy + a * s + b * c, z0];
  const p = [at(-r, -r), at(r, -r), at(r, r), at(-r, r)];
  const top: P3 = [cx, cy, z0 + h];
  for (let i = 0; i < 4; i++) tri(m, p[i], p[(i + 1) % 4], top, [0, 0], [0, 0], [0, 0], col);
}

/** Kreuz auf einer Turmspitze. */
function crossOn(m: MeshData, cx: number, cy: number, ang: number, z: number) {
  const col: RGB = [0.32, 0.3, 0.26];
  block(m, cx, cy, ang, 0.12, 0.12, z, z + 1.5, col);
  block(m, cx, cy, ang, 0.7, 0.12, z + 0.85, z + 0.97, col);
}

/** Kirchturm: quadratisch, oben Schallöffnungen und Uhr, darauf eine spitze Haube mit Kreuz. */
function churchTower(m: MeshData, signs: Signs, cx: number, cy: number, ang: number, size: number, height: number, variant: number) {
  block(m, cx, cy, ang, size, size, 0, height, STONE, STONE_DARK);
  // Gesims oben
  block(m, cx, cy, ang, size + 0.3, size + 0.3, height - 0.35, height, STONE_DARK);
  for (let k = 0; k < 4; k++) {
    const a = ang + (k * Math.PI) / 2;
    const ex = Math.cos(a);
    const ey = Math.sin(a);
    // Mitte der Seite, ein Stück vor der Wand
    const off = size / 2 + 0.04;
    const mx = cx - ey * off;
    const my = cy + ex * off;
    const w = size * 0.18;
    for (const d of [-1, 1]) {
      const a0: Pt = [mx + ex * (d * size * 0.18 - w / 2), my + ey * (d * size * 0.18 - w / 2)];
      const a1: Pt = [mx + ex * (d * size * 0.18 + w / 2), my + ey * (d * size * 0.18 + w / 2)];
      flat(m, [a0[0], a0[1], height - 2.6], [a1[0], a1[1], height - 2.6], [a1[0], a1[1], height - 0.8], [a0[0], a0[1], height - 0.8], LOUVER);
    }
    // Uhr unter den Schallöffnungen
    const r = Math.min(0.9, size * 0.2);
    const u0: Pt = [mx - ex * r - ey * 0.03, my - ey * r + ex * 0.03];
    const u1: Pt = [mx + ex * r - ey * 0.03, my + ey * r + ex * 0.03];
    sign(signs, '@clock', u0, u1, height - 3.1 - 2 * r, height - 3.1);
  }
  // Spitze Haube, Schiefer oder grünes Kupfer
  const spire = size * (variant % 2 ? 1.9 : 2.4);
  pyramid(m, cx, cy, ang, size + 0.2, height, spire, variant % 2 ? COPPER : SLATE);
  crossOn(m, cx, cy, ang, height + spire - 0.1);
}

/** Turmhaube für einen Kirchturm, den die Kartendaten schon als eigenes Gebäude haben. */
export function addSpire(ring: Pt[], top: number, plain: MeshData, variant: number) {
  // Achse aus der längsten Seite, Größe aus der Fläche
  let best = 0;
  let ang = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const l = dist(a, b);
    if (l > best) (best = l), (ang = Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  let cx = 0;
  let cy = 0;
  for (const p of ring) (cx += p[0]), (cy += p[1]);
  cx /= ring.length;
  cy /= ring.length;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const size = Math.sqrt(Math.abs(area) / 2);
  const spire = size * (variant % 2 ? 1.9 : 2.4);
  pyramid(plain, cx, cy, ang, size + 0.2, top, spire, variant % 2 ? COPPER : SLATE);
  crossOn(plain, cx, cy, ang, top + spire - 0.1);
}

/** Erscheinungsbild eines öffentlichen Gebäudes: Eingang, Schild und was es ausmacht. top: Traufhöhe. */
export function addCivic(cv: CivicSpec, ring: Pt[], top: number, plain: MeshData, signs: Signs) {
  if (cv.part) return;
  const f = frontWall(ring, cv.toward);
  const L = f.len;
  const mid = L / 2;
  const [bg, fg] = CIVIC_SIGN[cv.kind];
  const key = (t: string) => `${t}|${bg}|${fg}`;
  const signAbove = (z: number, maxW = 0.8 * SIGN_RATIO) => {
    const sw = Math.min(L - 1, maxW);
    const sh = sw / SIGN_RATIO;
    sign(signs, key(cv.sign), f.at(mid - sw / 2, 0.09), f.at(mid + sw / 2, 0.09), z, z + sh);
  };
  const door = (w: number, h: number) => {
    onWall(plain, f, mid - w / 2 - 0.15, mid + w / 2 + 0.15, 0, h + 0.15, 0.05, STONE_DARK);
    onWall(plain, f, mid - w / 2, mid + w / 2, 0, h, 0.07, DOOR);
  };

  if (cv.kind === 'church') {
    if (cv.tower) {
      // Turm vor der Giebelseite zur Straße, halb in der Wand
      const size = Math.max(3.6, Math.min(6.5, L * 0.42));
      const height = Math.max(16, cv.ridge + 7);
      const p = f.at(mid, size / 2 - 0.4);
      churchTower(plain, signs, p[0], p[1], f.ang, size, height, cv.variant);
      const d = f.at(mid, size - 0.35);
      const e: Pt = [Math.cos(f.ang), Math.sin(f.ang)];
      flat(plain, [d[0] - e[0] * 0.8, d[1] - e[1] * 0.8, 0], [d[0] + e[0] * 0.8, d[1] + e[1] * 0.8, 0], [d[0] + e[0] * 0.8, d[1] + e[1] * 0.8, 3.0], [d[0] - e[0] * 0.8, d[1] - e[1] * 0.8, 3.0], DOOR);
    } else door(1.8, 3.0);
    return;
  }

  if (cv.kind === 'fire') {
    // Große rote Tore für die Fahrzeuge, darüber das Schild, an der Ecke der Schlauchturm
    const gates = Math.max(1, Math.min(3, Math.floor((L - 2) / 4.6)));
    for (let k = 0; k < gates; k++) {
      const t = mid + (k - (gates - 1) / 2) * 4.6;
      onWall(plain, f, t - 1.9, t + 1.9, 0, 3.7, 0.05, RED_GATE);
      for (let s = 1; s < 9; s++) onWall(plain, f, t - 1.9, t + 1.9, s * 0.41 - 0.03, s * 0.41 + 0.03, 0.06, [0.55, 0.12, 0.1]);
    }
    signAbove(Math.min(top - 0.9, 4.1));
    const tw = 3.2;
    const tp = f.at(Math.min(L - tw / 2 - 0.2, L), -tw / 2 + 0.2);
    block(plain, tp[0], tp[1], f.ang, tw, tw, 0, Math.max(top + 7, 13), [0.78, 0.74, 0.66], [0.5, 0.48, 0.44]);
    block(plain, tp[0], tp[1], f.ang, tw + 0.4, tw + 0.4, Math.max(top + 7, 13), Math.max(top + 7, 13) + 0.5, [0.62, 0.2, 0.15]);
    return;
  }

  door(cv.kind === 'hospital' || cv.kind === 'station' ? 2.4 : 1.6, 2.5);

  if (cv.kind === 'police') {
    // Blau-weißes Band an der Front, blaue Lampe am Eingang
    onWall(plain, f, 0.2, L - 0.2, 2.95, 3.25, 0.06, [0.15, 0.32, 0.62]);
    onWall(plain, f, 0.2, L - 0.2, 3.25, 3.4, 0.06, [0.92, 0.92, 0.9]);
    signAbove(3.55);
    const lp = f.at(mid + 1.3, 0.25);
    block(plain, lp[0], lp[1], f.ang, 0.35, 0.3, 2.2, 2.6, [0.2, 0.4, 0.85]);
    return;
  }
  if (cv.kind === 'hospital') {
    // Vordach über der Einfahrt, großes Schild, blaues H
    const cp = f.at(mid, 2);
    block(plain, cp[0], cp[1], f.ang, Math.min(L * 0.5, 9), 4, 3.1, 3.4, [0.9, 0.9, 0.88], [0.8, 0.8, 0.78], true);
    for (const s of [-1, 1]) {
      const pp = f.at(mid + s * Math.min(L * 0.25, 4.5) - s * 0.3, 3.6);
      block(plain, pp[0], pp[1], f.ang, 0.22, 0.22, 0, 3.1, WHITE);
    }
    signAbove(Math.max(3.8, top - 1.4), 1.1 * SIGN_RATIO);
    const hp = Math.min(L - 1.2, mid + Math.min(L * 0.25, 4.5) + 1.6);
    sign(signs, '@hosp', f.at(hp - 0.6, 0.09), f.at(hp + 0.6, 0.09), 3.6, 4.8);
    return;
  }
  if (cv.kind === 'townhall' || cv.kind === 'school' || cv.kind === 'station') {
    signAbove(2.85);
    // Uhr an der Front
    sign(signs, '@clock', f.at(mid - 0.6, 0.09), f.at(mid + 0.6, 0.09), Math.max(4.2, top - 1.6), Math.max(4.2, top - 1.6) + 1.2);
    if (cv.kind === 'townhall') {
      // Dachreiter mit Haube auf dem First, Fahnenmast vor dem Eingang
      let cx = 0;
      let cy = 0;
      for (const p of ring) (cx += p[0]), (cy += p[1]);
      cx /= ring.length;
      cy /= ring.length;
      block(plain, cx, cy, f.ang, 1.8, 1.8, cv.ridge - 0.6, cv.ridge + 2.0, [0.86, 0.83, 0.76]);
      pyramid(plain, cx, cy, f.ang, 2.1, cv.ridge + 2.0, 2.4, COPPER);
      const fp = f.at(mid + 3, 3.5);
      block(plain, fp[0], fp[1], f.ang, 0.12, 0.12, 0, 7.5, GREY);
      const f0 = f.at(mid + 3.06, 3.5);
      const f1 = f.at(mid + 4.6, 3.5);
      flat(plain, [f0[0], f0[1], 6.3], [f1[0], f1[1], 6.4], [f1[0], f1[1], 7.3], [f0[0], f0[1], 7.4], [0.82, 0.78, 0.66]);
    }
    if (cv.kind === 'station') {
      // Bahnsteigdach an der Seite zur Straße, darunter Bank und Fahrkartenautomat, daneben Fahrräder
      const cw = Math.min(L * 0.8, 14);
      const cp = f.at(mid, 1.6);
      block(plain, cp[0], cp[1], f.ang, cw, 3.2, 3.2, 3.45, [0.36, 0.38, 0.4], [0.5, 0.52, 0.54], true);
      for (const s of [-1, 1]) {
        const pp = f.at(mid + s * (cw / 2 - 0.4), 2.9);
        block(plain, pp[0], pp[1], f.ang, 0.14, 0.14, 0, 3.2, [0.36, 0.38, 0.4]);
      }
      const bp = f.at(mid - 2.6, 1.0);
      block(plain, bp[0], bp[1], f.ang, 1.8, 0.42, 0.42, 0.5, [0.62, 0.46, 0.3]);
      const tm = f.at(mid + 2.2, 0.45);
      block(plain, tm[0], tm[1], f.ang, 0.7, 0.45, 0, 1.75, [0.72, 0.2, 0.16], [0.4, 0.4, 0.42]);
      onWall(plain, { ...f, at: (t, o) => f.at(t, o + 0.46) }, mid + 1.95, mid + 2.45, 1.05, 1.5, 0.23, [0.2, 0.24, 0.26]);
      for (let k = 0; k < 6; k++) {
        const t = mid + cw / 2 + 0.8 + k * 0.7;
        if (t > L - 0.3) break;
        const p = f.at(t, 1.2);
        block(plain, p[0], p[1], f.ang + Math.PI / 2, 0.9, 0.06, 0.3, 0.75, GREY);
      }
    }
    if (cv.kind === 'school') {
      // Fahrradständer neben dem Eingang
      for (let k = 0; k < 5; k++) {
        const t = mid + 2.2 + k * 0.7;
        if (t > L - 0.4) break;
        const p = f.at(t, 1.4);
        block(plain, p[0], p[1], f.ang + Math.PI / 2, 0.9, 0.06, 0.3, 0.75, GREY);
      }
    }
    return;
  }
  if (cv.kind === 'kita') {
    // Bunte Kacheln an der Front
    const cols: RGB[] = [
      [0.86, 0.32, 0.25],
      [0.95, 0.76, 0.2],
      [0.3, 0.55, 0.82],
      [0.4, 0.7, 0.36],
    ];
    for (let k = 0, t = 0.4; t + 0.9 < L - 0.4; k++, t += 1.1) if (Math.abs(t + 0.45 - mid) > 1.3) onWall(plain, f, t, t + 0.9, 0.9, 1.8, 0.05, cols[k % cols.length]);
    signAbove(2.85);
    // Niedriger Holzzaun vor dem Haus, eine Sandkiste
    for (let t = 0.4; t < L - 0.3; t += 1.2) {
      if (Math.abs(t - mid) < 1.2) continue;
      const p = f.at(t, 3.2);
      block(plain, p[0], p[1], f.ang, 0.08, 0.08, 0, 0.9, [0.55, 0.38, 0.24]);
    }
    onWall(plain, { ...f, at: (t, o) => f.at(t, o + 3.2) }, 0.4, mid - 1.2, 0.5, 0.62, 0, [0.6, 0.42, 0.26]);
    onWall(plain, { ...f, at: (t, o) => f.at(t, o + 3.2) }, mid + 1.2, L - 0.3, 0.5, 0.62, 0, [0.6, 0.42, 0.26]);
    if (L > 8) {
      const sb = f.at(Math.max(1.4, mid - 3), 1.8);
      block(plain, sb[0], sb[1], f.ang, 1.8, 1.6, 0, 0.28, [0.56, 0.4, 0.26], [0.86, 0.78, 0.6]);
    }
    return;
  }
  if (cv.kind === 'museum') {
    // Säulen und ein Giebeldreieck am Eingang
    const cols = 4;
    const w = Math.min(L - 1, 7);
    for (let k = 0; k < cols; k++) {
      const p = f.at(mid - w / 2 + (w * k) / (cols - 1), 1.3);
      prism(plain, p[0], p[1], 0.28, 8, 0, 4.2, [0.86, 0.84, 0.78]);
    }
    const a = f.at(mid - w / 2 - 0.4, 1.3);
    const b = f.at(mid + w / 2 + 0.4, 1.3);
    const c = f.at(mid, 1.3);
    block(plain, c[0], c[1], f.ang, w + 0.8, 2.8, 4.2, 4.6, [0.86, 0.84, 0.78]);
    tri(plain, [a[0], a[1], 4.6], [b[0], b[1], 4.6], [c[0], c[1], 6.0], [0, 0], [0, 0], [0, 0], [0.82, 0.8, 0.74]);
    signAbove(3.0);
    return;
  }
  if (cv.kind === 'post') {
    signAbove(2.85);
    const p = f.at(mid + 1.6, 0.6);
    block(plain, p[0], p[1], f.ang, 0.5, 0.4, 0.6, 1.4, [0.95, 0.76, 0.12]);
    block(plain, p[0], p[1], f.ang, 0.08, 0.08, 0, 0.6, GREY);
    // Schließfächer für Pakete an der Wand
    if (mid - 4 > 0.3) {
      onWall(plain, f, mid - 4, mid - 1.6, 0, 2.0, 0.28, [0.62, 0.64, 0.64]);
      for (let k = 1; k < 4; k++) onWall(plain, f, mid - 4 + k * 0.6 - 0.02, mid - 4 + k * 0.6 + 0.02, 0.1, 1.9, 0.3, [0.42, 0.44, 0.44]);
      for (const z of [0.6, 1.1, 1.5]) onWall(plain, f, mid - 4, mid - 1.6, z - 0.02, z + 0.02, 0.3, [0.42, 0.44, 0.44]);
    }
    return;
  }
  if (cv.kind === 'library') {
    // Bücherei: Rückgabekasten, Bank, Fahrradständer
    signAbove(2.85);
    const box = f.at(mid + 1.7, 0.45);
    block(plain, box[0], box[1], f.ang, 0.7, 0.55, 0, 1.15, [0.22, 0.36, 0.28], [0.18, 0.28, 0.22]);
    onWall(plain, { ...f, at: (t, o) => f.at(t, o + 0.73) }, mid + 1.45, mid + 1.95, 0.85, 0.92, 0, [0.08, 0.08, 0.08]);
    const bp = f.at(mid - 2.4, 1.1);
    block(plain, bp[0], bp[1], f.ang, 1.6, 0.4, 0.42, 0.5, [0.62, 0.46, 0.3]);
    for (let k = 0; k < 4; k++) {
      const t = mid + 2.8 + k * 0.7;
      if (t > L - 0.3) break;
      const p = f.at(t, 1.2);
      block(plain, p[0], p[1], f.ang + Math.PI / 2, 0.9, 0.06, 0.3, 0.75, GREY);
    }
    return;
  }
  // Der Rest: Schild über dem Eingang
  signAbove(2.85);
}

// --- Friedhof: niedrige Mauer mit Tor, Reihen von Grabsteinen und Kreuzen ----------------

export interface GraveyardSpec {
  ring: Pt[];
  /** Tor: Punkt am Rand (zur nächsten Straße), oder null. */
  gate: Pt | null;
  /** Gebäude auf dem Gelände (Kirche, Kapelle): dort keine Gräber. */
  keepOut: Pt[][];
  seed: number;
  /** Nur bis zu diesem Abstand von der Mitte der Details (Meter): große Friedhöfe werden nicht ganz gebaut. */
  maxR?: number;
}

const inPoly = (p: Pt, ring: Pt[]) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

export function addGraveyard(g: GraveyardSpec, plain: MeshData) {
  const ring = g.ring;
  let s = Math.floor(g.seed * 233280) || 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // Mauer rundherum, am Tor eine Lücke mit zwei Pfeilern
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = dist(a, b);
    if (len < 0.5) continue;
    if (g.maxR && Math.min(Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1])) > g.maxR + 40) continue;
    const e: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const ang = Math.atan2(e[1], e[0]);
    let parts: [number, number][] = [[0, len]];
    if (g.gate && segDist(g.gate, a, b) < 0.6) {
      const t = (g.gate[0] - a[0]) * e[0] + (g.gate[1] - a[1]) * e[1];
      parts = [
        [0, t - 1.6],
        [t + 1.6, len],
      ].filter(([x, y]) => y - x > 0.3) as [number, number][];
      for (const d of [-1.7, 1.7]) {
        const q: Pt = [a[0] + e[0] * (t + d), a[1] + e[1] * (t + d)];
        block(plain, q[0], q[1], ang, 0.5, 0.5, 0, 1.6, STONE, STONE_DARK);
      }
    }
    for (const [x, y] of parts) {
      const m: Pt = [a[0] + e[0] * ((x + y) / 2), a[1] + e[1] * ((x + y) / 2)];
      block(plain, m[0], m[1], ang, y - x, 0.35, 0, 1.1, STONE, STONE_DARK);
    }
  }
  // Reihen: ausgerichtet an der längsten Seite
  let best = 0;
  let ang = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const l = dist(a, b);
    if (l > best) (best = l), (ang = Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const loc = ring.map(([x, y]): Pt => [x * c + y * sn, -x * sn + y * c]);
  const x0 = Math.min(...loc.map((p) => p[0]));
  const x1 = Math.max(...loc.map((p) => p[0]));
  const y0 = Math.min(...loc.map((p) => p[1]));
  const y1 = Math.max(...loc.map((p) => p[1]));
  const STEP_X = 1.9;
  const STEP_Y = 3.6;
  const greys: RGB[] = [
    [0.6, 0.6, 0.58],
    [0.5, 0.5, 0.49],
    [0.68, 0.66, 0.62],
    [0.42, 0.42, 0.42],
    [0.56, 0.52, 0.48],
  ];
  let count = 0;
  let row = 0;
  for (let ly = y0 + 2.6; ly < y1 - 2 && count < 900; ly += STEP_Y, row++) {
    // Wege: jede vierte Reihe frei, dazu ein Längsweg alle 14 m
    if (row % 4 === 3) continue;
    for (let lx = x0 + 2.2; lx < x1 - 2 && count < 900; lx += STEP_X) {
      if (Math.abs(((lx - x0) % 14) - 7) < 1.3) continue;
      const p: Pt = [lx * c - ly * sn, lx * sn + ly * c];
      if (g.maxR && Math.hypot(p[0], p[1]) > g.maxR) continue;
      if (!inPoly(p, ring)) continue;
      let edge = Infinity;
      for (let i = 0; i < n; i++) edge = Math.min(edge, segDist(p, ring[i], ring[(i + 1) % n]));
      if (edge < 1.8) continue;
      if (g.keepOut.some((k) => inPoly(p, k) || k.some((_, i) => segDist(p, k[i], k[(i + 1) % k.length]) < 2.5))) continue;
      if (rnd() < 0.38) continue;
      count++;
      const col = greys[Math.floor(rnd() * greys.length)];
      const roll = rnd();
      const h = 0.65 + rnd() * 0.4;
      if (roll < 0.55) {
        // Grabstein, etwas schief nach all den Jahren
        block(plain, p[0], p[1], ang + (rnd() - 0.5) * 0.12, 0.7, 0.16, 0, h, col);
      } else if (roll < 0.78) {
        // Kreuz
        const cc: RGB = rnd() < 0.5 ? [0.36, 0.3, 0.24] : col;
        block(plain, p[0], p[1], ang, 0.12, 0.12, 0, h + 0.35, cc);
        block(plain, p[0], p[1], ang, 0.55, 0.12, h - 0.05, h + 0.07, cc);
      } else {
        // Stein mit Einfassung
        block(plain, p[0], p[1], ang, 0.8, 0.18, 0, h * 0.8, col);
      }
      // Einfassung vor dem Stein: Platte oder Efeu
      if (rnd() < 0.6) {
        const q: Pt = [p[0] - sn * 0.95, p[1] + c * 0.95];
        const ivy = rnd() < 0.45;
        block(plain, q[0], q[1], ang, 0.8, 1.6, 0, ivy ? 0.18 : 0.1, ivy ? [0.3, 0.42, 0.26] : [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9]);
      }
    }
  }
}
