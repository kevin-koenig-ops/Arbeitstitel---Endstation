// Wahrzeichen auf der Karte: echte Läden, Apotheken, Supermärkte, Baumärkte, Werkstätten,
// Tankstellen, Haltestellen und Brunnen. Sie stehen auf ihrem echten Grundriss und bekommen
// die Teile, an denen man sie sofort erkennt: Schaufenster, Markise, Schild, Vordach,
// Einkaufswagen, Paletten, Rolltore, Zapfsäulen. Je Ort zwei, drei Varianten (Farben).
//
// Reine Rechnung ohne Browser. Die Schilder sind Bilder, die map/treeLayer.ts aus dem
// Schlüssel malt: "TEXT|Hintergrund|Schrift" oder "@A" (Apotheken-A), "@cross", "@H", "@fuel".

import { block, dist, emptyMesh, flat, prism, signQuad, tri, type MeshData, type P3, type Pt, type RGB } from './meshKit';

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
export function landmarkOf(cls?: string, subclass?: string): { kind: LandmarkKind; sign: string } | null {
  const v = subclass || cls;
  return v && LANDMARKS[v] ? LANDMARKS[v] : null;
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
      // Bahnsteigdach an der Seite zur Straße
      const cp = f.at(mid, 1.6);
      block(plain, cp[0], cp[1], f.ang, Math.min(L * 0.8, 14), 3.2, 3.2, 3.45, [0.36, 0.38, 0.4], [0.5, 0.52, 0.54], true);
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
    return;
  }
  // Bücherei und Rest: Schild über dem Eingang
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
