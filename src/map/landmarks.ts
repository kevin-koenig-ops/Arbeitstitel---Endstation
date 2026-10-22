// Wahrzeichen auf der Karte: echte Läden, Apotheken, Supermärkte, Baumärkte, Werkstätten,
// Tankstellen, Haltestellen und Brunnen. Sie stehen auf ihrem echten Grundriss und bekommen
// die Teile, an denen man sie sofort erkennt: Schaufenster, Markise, Schild, Vordach,
// Einkaufswagen, Paletten, Rolltore, Zapfsäulen. Je Ort zwei, drei Varianten (Farben).
//
// Reine Rechnung ohne Browser. Die Schilder sind Bilder, die map/treeLayer.ts aus dem
// Schlüssel malt: "TEXT|Hintergrund|Schrift" oder "@A" (Apotheken-A), "@cross", "@H", "@fuel".

import { block, dist, emptyMesh, flat, prism, signQuad, type MeshData, type Pt, type RGB } from './meshKit';

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

export function landmarkOf(cls?: string, subclass?: string): { kind: LandmarkKind; sign: string } | null {
  for (const v of [subclass, cls]) if (v && LANDMARKS[v]) return LANDMARKS[v];
  return null;
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
}

/** Schilder: ein Topf je Bild. */
export type Signs = Record<string, MeshData>;

/** Seitenverhältnis der Text-Schilder (Breite : Höhe), so malt sie auch die Ebene. */
export const SIGN_RATIO = 5.5;

const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

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

const GLASS: RGB = [0.2, 0.27, 0.32];
const GLASS_HI: RGB = [0.34, 0.44, 0.5];
const FRAME: RGB = [0.56, 0.56, 0.54];
const DOOR: RGB = [0.14, 0.15, 0.17];
const KICK: RGB = [0.36, 0.34, 0.31];
const WHITE: RGB = [0.9, 0.9, 0.88];
const GREY: RGB = [0.55, 0.57, 0.58];
const CONCRETE: RGB = [0.66, 0.64, 0.6];

/** Die Wand, die am meisten zur Straße (toward) schaut: Ladenfront, Haustür. */
export function frontWall(ring: Pt[], toward: Pt) {
  let sa = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sa += a[0] * b[1] - b[0] * a[1];
  }
  const ccw = sa > 0;
  let best = { i: 0, score: -Infinity };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = dist(a, b);
    if (len < 2.5) continue;
    const ex = (b[0] - a[0]) / len;
    const ey = (b[1] - a[1]) / len;
    const nx = ccw ? ey : -ey;
    const ny = ccw ? -ex : ex;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const tx = toward[0] - mid[0];
    const ty = toward[1] - mid[1];
    const tl = Math.hypot(tx, ty) || 1;
    const score = (nx * tx + ny * ty) / tl + Math.min(len, 20) * 0.02 - tl * 0.004;
    if (score > best.score) best = { i, score };
  }
  const a = ring[best.i];
  const b = ring[(best.i + 1) % ring.length];
  const len = dist(a, b);
  const e: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Pt = ccw ? [e[1], -e[0]] : [-e[1], e[0]];
  /** Punkt an der Wand: t entlang, off nach außen. */
  const at = (t: number, off: number): Pt => [a[0] + e[0] * t + n[0] * off, a[1] + e[1] * t + n[1] * off];
  return { i: best.i, len, e, n, at, ang: Math.atan2(e[1], e[0]) };
}

/** Senkrechtes Rechteck vor der Wand, von t0 bis t1, Höhe z0 bis z1, off vor der Wand. */
function onWall(m: MeshData, f: ReturnType<typeof frontWall>, t0: number, t1: number, z0: number, z1: number, off: number, col: RGB) {
  const a = f.at(t0, off);
  const b = f.at(t1, off);
  flat(m, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], col);
}

function sign(signs: Signs, key: string, a: Pt, b: Pt, z0: number, z1: number) {
  const m = (signs[key] ??= emptyMesh());
  signQuad(m, a, b, z0, z1);
}

const textKey = (text: string, c: [string, string, string]) => `${text}|${c[0]}|${c[1]}`;

/** Ladenfront, Schild und Kleinkram an einem Gebäude. top: Traufhöhe. */
export function addShop(shop: ShopSpec, ring: Pt[], top: number, plain: MeshData, signs: Signs) {
  const f = frontWall(ring, shop.toward);
  const c = pal(shop.kind, shop.variant);
  const accent = rgb(c[2]);
  const L = f.len;
  const mid = L / 2;
  const hall = isHallKind(shop.kind) && top > 4.2;

  if (!hall) {
    // Laden im Erdgeschoss: Schaufenster mit Tür, darüber Schild, oft eine Markise
    const w = Math.min(L - 1.2, 9);
    const t0 = mid - w / 2;
    const t1 = mid + w / 2;
    if (shop.kind !== 'doctor') {
      onWall(plain, f, t0, t1, 0, 0.45, 0.05, KICK);
      onWall(plain, f, t0, t1, 0.45, 2.35, 0.05, GLASS);
      onWall(plain, f, t0, t1, 1.95, 2.35, 0.055, GLASS_HI);
      const bays = Math.max(1, Math.round(w / 1.8));
      for (let k = 0; k <= bays; k++) {
        const t = t0 + (w * k) / bays;
        onWall(plain, f, t - 0.05, t + 0.05, 0.45, 2.35, 0.065, FRAME);
      }
    }
    onWall(plain, f, mid - 0.55, mid + 0.55, 0, 2.3, 0.07, DOOR);
    // Markise: Streifen in zwei Farben, schräg nach vorn
    if (shop.kind === 'shop' || (shop.kind === 'pharmacy' && shop.variant === 2)) {
      const n = Math.max(2, Math.round(w / 0.55));
      const stripe = (k: number): RGB => (k % 2 ? [0.95, 0.93, 0.88] : accent);
      for (let k = 0; k < n; k++) {
        const ta = t0 + (w * k) / n;
        const tb = t0 + (w * (k + 1)) / n;
        const a0 = f.at(ta, 0.08);
        const b0 = f.at(tb, 0.08);
        const a1 = f.at(ta, 1.35);
        const b1 = f.at(tb, 1.35);
        flat(plain, [a0[0], a0[1], 2.78], [b0[0], b0[1], 2.78], [b1[0], b1[1], 2.38], [a1[0], a1[1], 2.38], stripe(k));
        flat(plain, [a1[0], a1[1], 2.38], [b1[0], b1[1], 2.38], [b1[0], b1[1], 2.15], [a1[0], a1[1], 2.15], stripe(k));
      }
    }
    // Schild über der Tür
    const sw = Math.min(w + 0.4, 0.75 * SIGN_RATIO);
    const sh = sw / SIGN_RATIO;
    sign(signs, textKey(shop.sign, c), f.at(mid - sw / 2, 0.09), f.at(mid + sw / 2, 0.09), 2.82, 2.82 + sh);
    // Apotheke: Würfel-Schild an einem Arm, quer zur Wand
    if (shop.kind === 'pharmacy') {
      const t = Math.max(0.6, t0 - 0.1);
      const p = f.at(t, 0.95);
      const ang = f.ang;
      block(plain, f.at(t, 0.3)[0], f.at(t, 0.3)[1], ang + Math.PI / 2, 0.6, 0.08, 3.42, 3.5, GREY);
      block(plain, p[0], p[1], ang, 0.12, 0.8, 3.0, 3.8, [0.95, 0.95, 0.95]);
      const key = shop.variant === 1 ? '@cross' : '@A';
      // beide Seiten des Würfels (die Seiten quer zur Wand)
      for (const s of [-1, 1]) {
        const q0 = f.at(t + s * 0.07, 0.55);
        const q1 = f.at(t + s * 0.07, 1.35);
        sign(signs, key, s > 0 ? q0 : q1, s > 0 ? q1 : q0, 3.0, 3.8);
      }
    }
    return;
  }

  // Halle: großes Schild oben, Glasfront oder Rolltore, Kleinkram davor
  const sh = Math.min(1.3, Math.max(0.8, (top - 3.6) * 0.6));
  const zs = Math.max(3.7, top - sh - 0.35);
  const sw = Math.min(L * 0.7, sh * SIGN_RATIO);
  onWall(plain, f, mid - sw / 2 - 0.15, mid + sw / 2 + 0.15, zs - 0.15, zs + sh + 0.15, 0.08, accent);
  sign(signs, textKey(shop.sign, c), f.at(mid - sw / 2, 0.11), f.at(mid + sw / 2, 0.11), zs, zs + sh);

  if (shop.kind === 'garage') {
    const doors = Math.max(1, Math.min(3, Math.floor((L - 2) / 4.2)));
    for (let k = 0; k < doors; k++) {
      const t = mid + (k - (doors - 1) / 2) * 4.2;
      onWall(plain, f, t - 1.6, t + 1.6, 0, 3.2, 0.05, [0.62, 0.64, 0.65]);
      for (let s = 1; s < 8; s++) onWall(plain, f, t - 1.6, t + 1.6, s * 0.4 - 0.03, s * 0.4 + 0.03, 0.06, [0.42, 0.44, 0.45]);
    }
    // Reifenstapel neben dem Tor
    for (const [t, n] of [
      [mid - doors * 2.1 - 1.2, 5],
      [mid + doors * 2.1 + 1.2, 3],
    ] as [number, number][]) {
      if (t < 0.6 || t > L - 0.6) continue;
      const p = f.at(t, 1.1);
      for (let k = 0; k < n; k++) prism(plain, p[0], p[1], 0.36, 8, k * 0.24, k * 0.24 + 0.22, [0.14, 0.14, 0.15], [0.3, 0.3, 0.32]);
    }
    return;
  }

  // Supermarkt und Baumarkt: Glasfront mit Eingang
  const gw = shop.kind === 'supermarket' ? Math.min(L * 0.55, 16) : Math.min(L * 0.3, 7);
  onWall(plain, f, mid - gw / 2, mid + gw / 2, 0.15, 3.1, 0.05, GLASS);
  onWall(plain, f, mid - gw / 2, mid + gw / 2, 2.5, 3.1, 0.055, GLASS_HI);
  for (let k = 0, n = Math.max(1, Math.round(gw / 2)); k <= n; k++) onWall(plain, f, mid - gw / 2 + (gw * k) / n - 0.06, mid - gw / 2 + (gw * k) / n + 0.06, 0.15, 3.1, 0.065, FRAME);
  onWall(plain, f, mid - 1.2, mid + 1.2, 0, 2.6, 0.07, DOOR);

  if (shop.kind === 'supermarket') {
    // Vordach über dem Eingang, auf zwei Stützen
    const cw = Math.min(gw * 0.6, 9);
    const cp = f.at(mid, 1.5);
    block(plain, cp[0], cp[1], f.ang, cw, 3, 3.35, 3.6, accent, [0.85, 0.85, 0.83], true);
    for (const s of [-1, 1]) {
      const pp = f.at(mid + (s * cw) / 2 - s * 0.3, 2.7);
      block(plain, pp[0], pp[1], f.ang, 0.18, 0.18, 0, 3.35, WHITE);
    }
    // Einkaufswagen, ein paar in einer Reihe, einer verloren
    const n = 3 + shop.variant;
    for (let k = 0; k < n; k++) {
      const lost = k === n - 1;
      const p = f.at(mid + cw / 2 + 1.2 + (lost ? 3 : k * 0.35), lost ? 6.5 : 4.2);
      const ang = f.ang + Math.PI / 2 + (lost ? 0.7 : 0);
      block(plain, p[0], p[1], ang, 0.95, 0.58, 0.3, 0.92, [0.66, 0.7, 0.74], [0.5, 0.54, 0.58]);
      block(plain, p[0], p[1], ang, 0.9, 0.5, 0, 0.3, [0.25, 0.26, 0.28]);
    }
  } else {
    // Baumarkt: Paletten mit Säcken, Steinen und Kartons vor der Tür
    const loads: RGB[] = [
      [0.86, 0.8, 0.66],
      [0.7, 0.36, 0.26],
      [0.74, 0.6, 0.42],
      [0.6, 0.6, 0.58],
    ];
    for (let k = 0; k < 4; k++) {
      const t = mid + gw / 2 + 1.5 + k * 1.6;
      if (t > L - 0.5) break;
      const p = f.at(t, 2.2 + (k % 2) * 0.4);
      block(plain, p[0], p[1], f.ang, 1.2, 1.0, 0, 0.15, [0.62, 0.46, 0.3]);
      block(plain, p[0], p[1], f.ang, 1.1, 0.9, 0.15, 0.75 + (k % 3) * 0.2, loads[(k + shop.variant) % loads.length]);
    }
  }
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

  // Brunnen: achteckiges Becken mit Wasser, Säule mit Ausguss
  prism(plain, pr.p[0], pr.p[1], 1.4, 8, 0, 0.6, [0.62, 0.6, 0.56], [0.3, 0.44, 0.52]);
  prism(plain, pr.p[0], pr.p[1], 0.25, 8, 0.6, 1.8, [0.66, 0.64, 0.6]);
  prism(plain, pr.p[0], pr.p[1], 0.36, 8, 1.8, 1.95, [0.58, 0.56, 0.52]);
  const sp = at(0.3, 0);
  block(plain, sp[0], sp[1], pr.ang, 0.4, 0.1, 1.3, 1.4, [0.4, 0.38, 0.35]);
}

/** Für Tests: alle Teile eines Wahrzeichens als ein Topf. */
export function previewProp(pr: PropSpec): { plain: MeshData; signs: Signs } {
  const plain = emptyMesh();
  const signs: Signs = {};
  addProp(pr, plain, signs);
  return { plain, signs };
}

