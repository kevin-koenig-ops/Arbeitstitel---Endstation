// Jede Ladenart sieht anders aus (Kevin 23.10.: „jedes bekannte Gebäude ein eigenes Modell“,
// „Apotheke anders als Praxis, Laden je nach Größe anders“). Kleine Läden sitzen im Erdgeschoss
// eines Hauses, große Grundrisse werden eine Halle. Hier stehen die Eigenheiten je Art:
// Schaufenster, Markise, Ausleger-Schild und was vor der Tür steht.
// Reine Rechnung ohne Browser.

import { CONCRETE, DOOR, FRAME, GLASS, GLASS_HI, GREY, KICK, onWall, sign, SIGN_RATIO, textKey, WHITE, type FrontWall, type Signs } from './landmarkKit';
import { block, emptyMesh, flat, prism, quad, type MeshData, type P3, type Pt, type RGB } from './meshKit';

export interface ShopCtx {
  f: FrontWall;
  /** Länge der Ladenfront (m) */
  L: number;
  mid: number;
  /** Traufhöhe */
  top: number;
  /** Grundfläche (m²) */
  area: number;
  plain: MeshData;
  signs: Signs;
  variant: number;
  /** Schild-Hintergrund, Schrift, Akzent */
  c: [string, string, string];
  accent: RGB;
  text: string;
}

const CREAM: RGB = [0.95, 0.93, 0.88];
const WOOD: RGB = [0.55, 0.38, 0.24];
const WOOD_DARK: RGB = [0.38, 0.26, 0.16];
const IRON: RGB = [0.18, 0.18, 0.19];
const BRASS: RGB = [0.74, 0.6, 0.3];
const LEAF: RGB = [0.3, 0.45, 0.22];
const LEAF_DARK: RGB = [0.22, 0.34, 0.17];

// --- Bausteine -------------------------------------------------------------------------

/** Schaufenster mit Sprossen, Sockel darunter. */
function shopWindow(x: ShopCtx, t0: number, t1: number, o: { glass?: RGB; frame?: RGB; kick?: RGB; z0?: number; z1?: number } = {}) {
  const z0 = o.z0 ?? 0.45;
  const z1 = o.z1 ?? 2.35;
  const { f, plain } = x;
  onWall(plain, f, t0, t1, 0, z0, 0.05, o.kick ?? KICK);
  onWall(plain, f, t0, t1, z0, z1, 0.05, o.glass ?? GLASS);
  onWall(plain, f, t0, t1, z1 - 0.4, z1, 0.055, GLASS_HI);
  const w = t1 - t0;
  const bays = Math.max(1, Math.round(w / 1.8));
  for (let k = 0; k <= bays; k++) {
    const t = t0 + (w * k) / bays;
    onWall(plain, f, t - 0.05, t + 0.05, z0, z1, 0.065, o.frame ?? FRAME);
  }
  onWall(plain, f, t0, t1, z1, z1 + 0.08, 0.065, o.frame ?? FRAME);
}

function door(x: ShopCtx, t: number, w = 1.1, col: RGB = DOOR, h = 2.3) {
  onWall(x.plain, x.f, t - w / 2, t + w / 2, 0, h, 0.07, col);
}

/** Markise schräg nach vorn: zwei Farben im Wechsel (b weglassen: einfarbig). */
function awning(x: ShopCtx, t0: number, t1: number, a: RGB, b: RGB | null = CREAM, depth = 1.35) {
  const { f, plain } = x;
  const w = t1 - t0;
  const n = b ? Math.max(2, Math.round(w / 0.55)) : 1;
  for (let k = 0; k < n; k++) {
    const col = b && k % 2 ? b : a;
    const ta = t0 + (w * k) / n;
    const tb = t0 + (w * (k + 1)) / n;
    const a0 = f.at(ta, 0.08);
    const b0 = f.at(tb, 0.08);
    const a1 = f.at(ta, depth);
    const b1 = f.at(tb, depth);
    flat(plain, [a0[0], a0[1], 2.78], [b0[0], b0[1], 2.78], [b1[0], b1[1], 2.38], [a1[0], a1[1], 2.38], col);
    flat(plain, [a1[0], a1[1], 2.38], [b1[0], b1[1], 2.38], [b1[0], b1[1], 2.15], [a1[0], a1[1], 2.15], col);
  }
}

/** Text-Schild flach an der Wand. */
function wallSign(x: ShopCtx, t: number, w: number, z: number, off = 0.09) {
  const sw = Math.min(w, 0.75 * SIGN_RATIO);
  const sh = sw / SIGN_RATIO;
  sign(x.signs, textKey(x.text, x.c), x.f.at(t - sw / 2, off), x.f.at(t + sw / 2, off), z, z + sh);
}

/** Ausleger: Arm aus der Wand, daran ein Schild mit Bild, quer zur Wand (beide Seiten). */
function bracket(x: ShopCtx, t: number, key: string, z = 3.0, size = 0.8, arm: RGB = IRON) {
  const { f, plain, signs } = x;
  const p = f.at(t, 0.25 + size * 0.55);
  block(plain, p[0], p[1], f.ang + Math.PI / 2, 0.5 + size * 0.6, 0.06, z + size + 0.05, z + size + 0.13, arm);
  for (const s of [-1, 1]) {
    const q0 = f.at(t + s * 0.03, 0.25 + size * 0.15);
    const q1 = f.at(t + s * 0.03, 0.25 + size * 0.95);
    sign(signs, key, s > 0 ? q0 : q1, s > 0 ? q1 : q0, z, z + size);
  }
}

/** Kundenstopper: zwei schräge Tafeln mit Bild. */
function aFrame(x: ShopCtx, t: number, off: number, key: string, h = 1.0, w = 0.6) {
  const { f, signs } = x;
  const m = (signs[key] ??= emptyMesh());
  const e: Pt = [Math.cos(f.ang), Math.sin(f.ang)];
  const c = f.at(t, off);
  const lean = 0.28;
  for (const s of [-1, 1]) {
    // Fuß der Tafel s * lean quer zur Wand (n), oben in der Mitte
    const foot: Pt = [c[0] + f.n[0] * s * lean, c[1] + f.n[1] * s * lean];
    const a: P3 = [foot[0] - (e[0] * w) / 2, foot[1] - (e[1] * w) / 2, 0];
    const b: P3 = [foot[0] + (e[0] * w) / 2, foot[1] + (e[1] * w) / 2, 0];
    const d: P3 = [c[0] - (e[0] * w) / 2, c[1] - (e[1] * w) / 2, h];
    const cc: P3 = [c[0] + (e[0] * w) / 2, c[1] + (e[1] * w) / 2, h];
    if (s > 0) quad(m, a, b, cc, d, [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
    else quad(m, b, a, d, cc, [0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1]);
  }
}

/** Kistenstapel: n Säulen nebeneinander (entlang der Wand), je h Kisten hoch. */
function crates(x: ShopCtx, t: number, off: number, cols: number, h: number, colors: RGB[], seed = 0) {
  const { f, plain } = x;
  for (let i = 0; i < cols; i++) {
    const n = Math.max(1, h - ((i + seed) % 2));
    for (let k = 0; k < n; k++) {
      const col = colors[(i * 3 + k + seed) % colors.length];
      const p = f.at(t + i * 0.44, off);
      const dark: RGB = [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6];
      block(plain, p[0], p[1], f.ang, 0.4, 0.3, k * 0.28, k * 0.28 + 0.26, col, dark);
    }
  }
}

function bench(x: ShopCtx, t: number, off: number, len = 1.6) {
  const { f, plain } = x;
  const p = f.at(t, off);
  block(plain, p[0], p[1], f.ang, len, 0.4, 0.42, 0.5, WOOD);
  for (const s of [-1, 1]) {
    const q = f.at(t + s * (len / 2 - 0.15), off);
    block(plain, q[0], q[1], f.ang, 0.08, 0.36, 0, 0.42, IRON);
  }
}

/** Topfbäumchen: Kübel und eine runde Krone. */
function pottedTree(x: ShopCtx, t: number, off: number) {
  const p = x.f.at(t, off);
  prism(x.plain, p[0], p[1], 0.28, 8, 0, 0.5, [0.42, 0.4, 0.38]);
  prism(x.plain, p[0], p[1], 0.04, 6, 0.5, 1.1, WOOD_DARK);
  prism(x.plain, p[0], p[1], 0.3, 10, 1.05, 1.25, LEAF);
  prism(x.plain, p[0], p[1], 0.4, 10, 1.25, 1.6, LEAF, LEAF_DARK);
  prism(x.plain, p[0], p[1], 0.28, 10, 1.6, 1.8, LEAF_DARK);
}

/** Stehtisch oder Bistrotisch (rund, eine Säule). */
function roundTable(x: ShopCtx, t: number, off: number, h = 1.05, r = 0.35) {
  const p = x.f.at(t, off);
  prism(x.plain, p[0], p[1], 0.05, 6, 0, h, IRON);
  prism(x.plain, p[0], p[1], r, 10, h, h + 0.04, [0.82, 0.8, 0.76]);
}

function chair(x: ShopCtx, t: number, off: number) {
  const { f, plain } = x;
  const p = f.at(t, off);
  block(plain, p[0], p[1], f.ang, 0.42, 0.42, 0.44, 0.48, WOOD_DARK);
  const b = f.at(t, off + 0.2);
  block(plain, b[0], b[1], f.ang, 0.42, 0.05, 0.48, 0.9, WOOD_DARK);
  block(plain, p[0], p[1], f.ang, 0.36, 0.36, 0, 0.44, IRON);
}

/** Kachelsockel (Metzgerei): weiße Kacheln mit Fugen und einem roten Band. */
function tiles(x: ShopCtx, t0: number, t1: number, z1: number) {
  const { f, plain } = x;
  onWall(plain, f, t0, t1, 0, z1, 0.045, [0.9, 0.9, 0.88]);
  onWall(plain, f, t0, t1, z1 - 0.12, z1, 0.05, [0.72, 0.16, 0.14]);
  for (let z = 0.3; z < z1 - 0.15; z += 0.3) onWall(plain, f, t0, t1, z - 0.012, z + 0.012, 0.05, [0.66, 0.66, 0.64]);
  for (let t = t0 + 0.3; t < t1; t += 0.3) onWall(plain, f, t - 0.012, t + 0.012, 0, z1 - 0.12, 0.05, [0.66, 0.66, 0.64]);
}

/** Holzbretter über die ganze Front (Hofladen). */
function planks(x: ShopCtx, z1: number) {
  const { f, plain, L } = x;
  for (let t = 0.1, k = 0; t < L - 0.1; t += 0.32, k++) onWall(plain, f, t, Math.min(L - 0.1, t + 0.3), 0, z1, 0.04, k % 3 === 1 ? WOOD_DARK : k % 3 === 2 ? [0.5, 0.34, 0.21] : WOOD);
}

function strawBale(x: ShopCtx, t: number, off: number, z = 0) {
  const p = x.f.at(t, off);
  block(x.plain, p[0], p[1], x.f.ang, 1.1, 0.55, z, z + 0.48, [0.84, 0.72, 0.4], [0.9, 0.8, 0.5]);
}

function milkCan(x: ShopCtx, t: number, off: number) {
  const p = x.f.at(t, off);
  prism(x.plain, p[0], p[1], 0.2, 10, 0, 0.62, [0.7, 0.72, 0.72]);
  prism(x.plain, p[0], p[1], 0.12, 10, 0.62, 0.78, [0.62, 0.64, 0.64]);
  prism(x.plain, p[0], p[1], 0.15, 10, 0.78, 0.84, [0.55, 0.57, 0.57]);
}

/** Obst- und Gemüsestand: schräge Holzstufen mit bunten Kisten. */
function produceStand(x: ShopCtx, t: number, off: number, len: number, seed: number) {
  const { f, plain } = x;
  const fruit: RGB[] = [
    [0.78, 0.18, 0.14],
    [0.92, 0.55, 0.12],
    [0.5, 0.68, 0.2],
    [0.95, 0.82, 0.2],
    [0.42, 0.2, 0.36],
    [0.36, 0.55, 0.2],
  ];
  for (const [step, z] of [
    [0, 0.85],
    [0.45, 0.6],
  ] as [number, number][]) {
    const p = f.at(t, off + step);
    block(plain, p[0], p[1], f.ang, len, 0.45, 0, z, WOOD, WOOD_DARK);
    const n = Math.max(1, Math.floor(len / 0.5));
    for (let k = 0; k < n; k++) {
      const q = f.at(t - len / 2 + 0.25 + k * 0.5, off + step);
      block(plain, q[0], q[1], f.ang, 0.44, 0.38, z, z + 0.1, WOOD_DARK, fruit[(k + seed + (step ? 2 : 0)) % fruit.length]);
    }
  }
}

/** Zeitungsständer: Gestell mit bunten Heften. */
function newsStand(x: ShopCtx, t: number, off: number) {
  const { f, plain } = x;
  const p = f.at(t, off);
  block(plain, p[0], p[1], f.ang, 0.9, 0.35, 0, 1.3, GREY);
  const cols: RGB[] = [
    [0.85, 0.25, 0.2],
    [0.2, 0.4, 0.7],
    [0.95, 0.8, 0.25],
    [0.9, 0.9, 0.88],
  ];
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 3; k++) onWall(plain, { ...f, at: (tt, o) => f.at(tt, o + off + 0.18) }, t - 0.42 + k * 0.29, t - 0.18 + k * 0.29, 0.35 + row * 0.32, 0.6 + row * 0.32, 0, cols[(row + k) % cols.length]);
}

/** Verkaufsklappe (Kiosk): kleines Fenster mit Tresen, Klappe hochgestellt. */
function hatch(x: ShopCtx, t0: number, t1: number) {
  const { f, plain, accent } = x;
  onWall(plain, f, t0, t1, 0, 1.0, 0.05, KICK);
  onWall(plain, f, t0, t1, 1.0, 2.2, 0.05, [0.3, 0.28, 0.24]);
  const c = f.at((t0 + t1) / 2, 0.25);
  block(plain, c[0], c[1], f.ang, t1 - t0 + 0.2, 0.45, 1.0, 1.08, [0.7, 0.66, 0.6]);
  const a0 = f.at(t0 - 0.05, 0.06);
  const b0 = f.at(t1 + 0.05, 0.06);
  const a1 = f.at(t0 - 0.05, 0.95);
  const b1 = f.at(t1 + 0.05, 0.95);
  flat(plain, [a0[0], a0[1], 2.25], [b0[0], b0[1], 2.25], [b1[0], b1[1], 2.55], [a1[0], a1[1], 2.55], accent);
}

/** Messingschilder neben der Praxistür. */
function plaques(x: ShopCtx, t: number, n: number) {
  for (let k = 0; k < n; k++) onWall(x.plain, x.f, t, t + 0.36, 1.25 + k * 0.3, 1.5 + k * 0.3, 0.07, BRASS);
}

/** Rampe mit Geländer zur Tür (Praxis). */
function ramp(x: ShopCtx, tDoor: number, side: 1 | -1) {
  const { f, plain } = x;
  const len = 3.2;
  const tEnd = tDoor + side * (0.7 + len);
  const a0 = f.at(tDoor + side * 0.7, 0.07);
  const a1 = f.at(tDoor + side * 0.7, 1.3);
  const b0 = f.at(tEnd, 0.07);
  const b1 = f.at(tEnd, 1.3);
  flat(plain, [a0[0], a0[1], 0.3], [a1[0], a1[1], 0.3], [b1[0], b1[1], 0.02], [b0[0], b0[1], 0.02], CONCRETE);
  // Podest vor der Tür
  const p = f.at(tDoor, 0.7);
  block(plain, p[0], p[1], f.ang, 1.6, 1.25, 0, 0.3, CONCRETE);
  // Geländer außen
  for (let k = 0; k <= 3; k++) {
    const t = tDoor + side * (0.7 + (len * k) / 3);
    const q = f.at(t, 1.28);
    const z = 0.3 - (0.28 * k) / 3;
    block(plain, q[0], q[1], f.ang, 0.05, 0.05, z, z + 0.95, GREY);
  }
  const r0 = f.at(tDoor + side * 0.7, 1.28);
  const r1 = f.at(tEnd, 1.28);
  // Handlauf als schräges Band
  const nrm: Pt = [f.n[0] * 0.025, f.n[1] * 0.025];
  flat(
    plain,
    [r0[0] - nrm[0], r0[1] - nrm[1], 1.25],
    [r1[0] - nrm[0], r1[1] - nrm[1], 0.97],
    [r1[0] + nrm[0], r1[1] + nrm[1], 0.97],
    [r0[0] + nrm[0], r0[1] + nrm[1], 1.25],
    GREY,
  );
}

/** Schubkarre (Eisenwaren). */
function wheelbarrow(x: ShopCtx, t: number, off: number) {
  const { f, plain } = x;
  const p = f.at(t, off);
  block(plain, p[0], p[1], f.ang, 1.1, 0.62, 0.35, 0.62, [0.3, 0.5, 0.32], [0.22, 0.38, 0.24]);
  const w = f.at(t + 0.6, off);
  prism(plain, w[0], w[1], 0.2, 8, 0.05, 0.12, IRON);
  for (const s of [-1, 1]) {
    const h = f.at(t - 0.75, off + s * 0.25);
    block(plain, h[0], h[1], f.ang, 0.6, 0.05, 0.45, 0.5, WOOD);
  }
}

/** Leiter an der Wand. */
function ladder(x: ShopCtx, t: number, h: number) {
  const { f, plain } = x;
  for (const s of [-0.22, 0.22]) onWall(plain, f, t + s - 0.03, t + s + 0.03, 0, h, 0.14, [0.7, 0.68, 0.62]);
  for (let z = 0.3; z < h; z += 0.3) onWall(plain, f, t - 0.22, t + 0.22, z, z + 0.04, 0.15, [0.62, 0.6, 0.55]);
}

/** Eimer, ein paar übereinander. */
function buckets(x: ShopCtx, t: number, off: number, n: number, col: RGB) {
  const p = x.f.at(t, off);
  for (let k = 0; k < n; k++) prism(x.plain, p[0], p[1], 0.17, 8, k * 0.08, 0.3 + k * 0.08, col);
}

/** Palette mit Ladung (Säcke, Steine, Kartons, Wasser). */
function palletLoad(x: ShopCtx, t: number, off: number, load: RGB, h = 0.7) {
  const { f, plain } = x;
  const p = f.at(t, off);
  block(plain, p[0], p[1], f.ang, 1.2, 1.0, 0, 0.15, [0.62, 0.46, 0.3]);
  block(plain, p[0], p[1], f.ang, 1.1, 0.9, 0.15, 0.15 + h, load);
}

/** Reifenstapel. */
function tires(x: ShopCtx, t: number, off: number, n: number) {
  const p = x.f.at(t, off);
  for (let k = 0; k < n; k++) prism(x.plain, p[0], p[1], 0.36, 8, k * 0.24, k * 0.24 + 0.22, [0.14, 0.14, 0.15], [0.3, 0.3, 0.32]);
}

function oilDrum(x: ShopCtx, t: number, off: number, col: RGB) {
  const p = x.f.at(t, off);
  prism(x.plain, p[0], p[1], 0.3, 10, 0, 0.9, col, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7]);
}

// --- Kleine Läden ------------------------------------------------------------------------

/** Laden im Erdgeschoss (oder ein kleiner eigener Bau), je nach Art. */
export function smallShop(sub: string, x: ShopCtx) {
  const { L, mid, f, plain, accent, variant: v } = x;
  const w = Math.min(L - 1.2, 9);
  const t0 = mid - w / 2;
  const t1 = mid + w / 2;
  const narrow = L < 7;

  switch (sub) {
    case 'bakery': {
      // Warmes Licht im Schaufenster, braun-weiße Markise, Brezel am Ausleger, Stehtisch
      shopWindow(x, t0, t1, { glass: [0.42, 0.33, 0.22], frame: [0.5, 0.34, 0.2] });
      door(x, mid, 1.1, [0.36, 0.22, 0.12]);
      awning(x, t0, t1, [0.55, 0.33, 0.18], [0.95, 0.9, 0.78]);
      wallSign(x, mid, w + 0.4, 2.82);
      bracket(x, Math.min(L - 0.4, t1 + 0.35), '@brezel', 2.95, 0.85);
      if (!narrow) roundTable(x, t0 + 0.9, 1.9);
      if (L > 11) bench(x, Math.min(L - 1.0, t1 + 0.2), 0.45, 1.4);
      return;
    }
    case 'butcher': {
      tiles(x, t0 - 0.2, t1 + 0.2, 0.95);
      shopWindow(x, t0, t1, { glass: [0.24, 0.3, 0.34], frame: WHITE, kick: [0.9, 0.9, 0.88], z0: 0.95 });
      door(x, mid, 1.1, [0.82, 0.82, 0.8]);
      awning(x, t0, t1, [0.72, 0.16, 0.14], CREAM);
      wallSign(x, mid, w + 0.4, 2.82);
      bracket(x, Math.min(L - 0.4, t1 + 0.35), '@schwein', 2.95, 0.8);
      return;
    }
    case 'kiosk':
    case 'convenience': {
      // Kleine Verkaufsklappe mit Tresen, daneben Zeitungen und ein Kundenstopper
      const hw = Math.min(w, narrow ? L - 1.6 : 2.6);
      hatch(x, mid - hw / 2, mid + hw / 2);
      if (!narrow) door(x, Math.min(L - 0.8, mid + hw / 2 + 1.0), 0.95);
      wallSign(x, mid, Math.max(hw + 0.6, 2.4), 2.62);
      newsStand(x, Math.max(0.7, mid - hw / 2 - 0.9), 0.5);
      aFrame(x, Math.min(L - 0.4, mid + hw / 2 + 1.2), 1.6, '@eis');
      return;
    }
    case 'greengrocer': {
      shopWindow(x, t0, t1);
      door(x, mid);
      awning(x, t0, t1, [0.24, 0.5, 0.26], CREAM, 1.7);
      wallSign(x, mid, w + 0.4, 2.82);
      const sl = Math.max(0.9, (w - 1.8) / 2 - 0.2);
      produceStand(x, t0 + sl / 2 + 0.1, 0.55, sl, v);
      produceStand(x, t1 - sl / 2 - 0.1, 0.55, sl, v + 3);
      return;
    }
    case 'deli': {
      // Dunkelgrüne Front mit Goldschrift, Bistrotisch, zwei Lorbeerbäumchen
      onWall(plain, f, t0 - 0.3, t1 + 0.3, 0, 2.85, 0.04, [0.16, 0.26, 0.2]);
      shopWindow(x, t0, t1, { frame: [0.12, 0.2, 0.15], kick: [0.12, 0.2, 0.15] });
      door(x, mid, 1.1, [0.12, 0.2, 0.15]);
      wallSign(x, mid, w + 0.4, 2.88);
      pottedTree(x, mid - 0.95, 0.45);
      pottedTree(x, mid + 0.95, 0.45);
      if (!narrow) {
        roundTable(x, t0 + 1.0, 1.4, 0.75, 0.3);
        chair(x, t0 + 0.45, 1.4);
        chair(x, t0 + 1.55, 1.4);
      }
      return;
    }
    case 'beverages': {
      shopWindow(x, t0, t1, { glass: [0.22, 0.3, 0.36] });
      door(x, mid);
      wallSign(x, mid, w + 0.4, 2.62);
      const cols: RGB[] = [
        [0.2, 0.4, 0.72],
        [0.74, 0.2, 0.16],
        [0.25, 0.55, 0.3],
        [0.9, 0.72, 0.18],
      ];
      crates(x, Math.max(0.5, t0 - 0.2), 0.45, 3, 4, cols, v);
      if (t1 + 1.6 < L) crates(x, t1 + 0.3, 0.45, 2, 5, cols, v + 1);
      return;
    }
    case 'farm': {
      // Hofladen: Holzfront, Tafel, Strohballen, Milchkanne, Kasse des Vertrauens
      planks(x, Math.min(x.top, 3.2));
      shopWindow(x, mid - Math.min(w, 2.6) / 2 - 1.0, mid - 0.9, { glass: [0.3, 0.28, 0.22], frame: WOOD_DARK, kick: WOOD_DARK });
      door(x, mid + 0.3, 1.3, WOOD_DARK);
      wallSign(x, mid, Math.min(w + 0.4, 3.6), 2.6);
      aFrame(x, Math.max(0.6, t0 + 0.3), 1.5, '@tafel', 1.05, 0.7);
      strawBale(x, Math.min(L - 0.8, t1 - 0.2), 0.55);
      strawBale(x, Math.min(L - 0.8, t1 - 0.2), 0.55, 0.48);
      milkCan(x, Math.min(L - 0.4, t1 + 0.6), 0.5);
      const bx = f.at(Math.min(L - 0.4, mid + 1.4), 0.9);
      block(plain, bx[0], bx[1], f.ang, 0.06, 0.06, 0, 1.0, WOOD_DARK);
      block(plain, bx[0], bx[1], f.ang, 0.3, 0.22, 1.0, 1.25, [0.5, 0.52, 0.5]);
      return;
    }
    case 'chemist': {
      // Drogerie: hell und modern, breite Glasfront, keine Markise, Blumenkübel
      const ww = Math.min(L - 0.8, 12);
      onWall(plain, f, mid - ww / 2 - 0.2, mid + ww / 2 + 0.2, 2.4, 2.9, 0.045, [0.94, 0.94, 0.92]);
      onWall(plain, f, mid - ww / 2 - 0.2, mid + ww / 2 + 0.2, 2.4, 2.5, 0.05, accent);
      shopWindow(x, mid - ww / 2, mid + ww / 2, { glass: [0.3, 0.38, 0.42], frame: WHITE, kick: [0.8, 0.8, 0.78], z0: 0.2 });
      door(x, mid, 1.8, [0.25, 0.32, 0.35]);
      wallSign(x, mid, ww, 2.95);
      for (const s of [-1, 1]) {
        const p = f.at(mid + s * 1.5, 0.55);
        block(plain, p[0], p[1], f.ang, 0.9, 0.45, 0, 0.5, [0.6, 0.6, 0.58]);
        block(plain, p[0], p[1], f.ang, 0.8, 0.38, 0.5, 0.72, LEAF, LEAF_DARK);
      }
      return;
    }
    case 'pharmacy': {
      shopWindow(x, t0, t1);
      door(x, mid);
      if (v === 2) awning(x, t0, t1, accent, CREAM);
      wallSign(x, mid, w + 0.4, 2.82);
      // Würfel-Schild mit A oder grünem Kreuz am Arm
      const t = Math.max(0.6, t0 - 0.1);
      const p = f.at(t, 0.95);
      block(plain, f.at(t, 0.3)[0], f.at(t, 0.3)[1], f.ang + Math.PI / 2, 0.6, 0.08, 3.42, 3.5, GREY);
      block(plain, p[0], p[1], f.ang, 0.12, 0.8, 3.0, 3.8, [0.95, 0.95, 0.95]);
      const key = v === 1 ? '@cross' : '@A';
      for (const s of [-1, 1]) {
        const q0 = f.at(t + s * 0.07, 0.55);
        const q1 = f.at(t + s * 0.07, 1.35);
        sign(x.signs, key, s > 0 ? q0 : q1, s > 0 ? q1 : q0, 3.0, 3.8);
      }
      // Notdienstklappe mit Klingel neben der Tür, eine Stufe davor
      onWall(plain, f, mid + 0.75, mid + 1.25, 1.0, 1.45, 0.07, [0.62, 0.62, 0.6]);
      onWall(plain, f, mid + 0.82, mid + 1.18, 1.06, 1.39, 0.08, [0.2, 0.22, 0.24]);
      onWall(plain, f, mid + 1.33, mid + 1.43, 1.15, 1.25, 0.08, [0.85, 0.15, 0.12]);
      const st = f.at(mid, 0.35);
      block(plain, st[0], st[1], f.ang, 1.7, 0.6, 0, 0.16, CONCRETE);
      return;
    }
    case 'doctors':
    case 'dentist': {
      // Praxis: keine Schaufenster, eine Haustür mit Messingschildern, Rampe mit Geländer
      const td = Math.max(1.2, Math.min(L - 1.2, mid - 1.2));
      onWall(plain, f, td - 0.7, td + 0.7, 0, 2.55, 0.05, [0.82, 0.8, 0.76]);
      door(x, td, 1.15, [0.22, 0.28, 0.34], 2.35);
      onWall(plain, f, td - 0.5, td + 0.5, 2.05, 2.3, 0.075, GLASS_HI);
      plaques(x, td + 0.75, sub === 'dentist' ? 2 : 3);
      wallSign(x, td, 2.6, 2.75);
      if (td + 4.4 < L) ramp(x, td, 1);
      else if (td - 4.4 > 0) ramp(x, td, -1);
      if (sub === 'dentist') bracket(x, Math.max(0.5, td - 0.95), '@zahn', 2.9, 0.65, GREY);
      return;
    }
    case 'hardware': {
      // Eisenwaren: Schaufenster, Schubkarre, Leitern an der Wand, Eimer
      shopWindow(x, t0, t1);
      door(x, mid);
      awning(x, t0, t1, accent, null, 1.0);
      wallSign(x, mid, w + 0.4, 2.82);
      if (t0 > 1.0) ladder(x, t0 - 0.5, 2.6);
      if (t0 > 1.8) ladder(x, t0 - 1.2, 2.2);
      wheelbarrow(x, Math.min(L - 0.8, t1 - 0.4), 1.2);
      buckets(x, mid + 1.2, 0.45, 3, [0.9, 0.45, 0.15]);
      return;
    }
    case 'car_parts': {
      shopWindow(x, t0, t1);
      door(x, mid);
      wallSign(x, mid, w + 0.4, 2.62);
      tires(x, Math.max(0.6, t0 - 0.1), 0.6, 5);
      tires(x, Math.max(0.6, t0 + 0.7), 0.6, 3);
      if (t1 + 0.6 < L) tires(x, t1 + 0.3, 0.6, 4);
      return;
    }
    default: {
      // Lebensmittel und alles andere: Schaufenster, Markise, Kisten an der Tür
      shopWindow(x, t0, t1);
      door(x, mid);
      awning(x, t0, t1, accent, CREAM);
      wallSign(x, mid, w + 0.4, 2.82);
      if (sub === 'grocery' || sub === 'supermarket')
        crates(
          x,
          Math.max(0.5, t0 - 0.1),
          0.45,
          2,
          2,
          [
            [0.62, 0.46, 0.3],
            [0.56, 0.42, 0.28],
          ],
          v,
        );
      if (sub === 'grocery') aFrame(x, mid + 1.4, 1.5, '@tafel');
    }
  }
}

// --- Hallen -----------------------------------------------------------------------------

/** Großes Schild oben an der Halle. */
function hallSign(x: ShopCtx) {
  const { f, plain, L, mid, top, accent } = x;
  const sh = Math.min(1.3, Math.max(0.8, (top - 3.6) * 0.6));
  const zs = Math.max(3.7, top - sh - 0.35);
  const sw = Math.min(L * 0.7, sh * SIGN_RATIO);
  onWall(plain, f, mid - sw / 2 - 0.15, mid + sw / 2 + 0.15, zs - 0.15, zs + sh + 0.15, 0.08, accent);
  sign(x.signs, textKey(x.text, x.c), f.at(mid - sw / 2, 0.11), f.at(mid + sw / 2, 0.11), zs, zs + sh);
}

function glassFront(x: ShopCtx, gw: number, light = false) {
  const { f, plain, mid } = x;
  const glass: RGB = light ? [0.32, 0.4, 0.44] : GLASS;
  onWall(plain, f, mid - gw / 2, mid + gw / 2, 0.15, 3.1, 0.05, glass);
  onWall(plain, f, mid - gw / 2, mid + gw / 2, 2.5, 3.1, 0.055, GLASS_HI);
  for (let k = 0, n = Math.max(1, Math.round(gw / 2)); k <= n; k++) onWall(plain, f, mid - gw / 2 + (gw * k) / n - 0.06, mid - gw / 2 + (gw * k) / n + 0.06, 0.15, 3.1, 0.065, light ? WHITE : FRAME);
  onWall(plain, f, mid - 1.2, mid + 1.2, 0, 2.6, 0.07, DOOR);
}

/** Rolltore (Werkstatt, Getränkemarkt). */
function rollerDoors(x: ShopCtx, n: number, w = 3.2, h = 3.2, col: RGB = [0.62, 0.64, 0.65], start?: number) {
  const { f, plain, mid } = x;
  for (let k = 0; k < n; k++) {
    const t = (start ?? mid - ((n - 1) / 2) * (w + 1)) + k * (w + 1);
    onWall(plain, f, t - w / 2, t + w / 2, 0, h, 0.05, col);
    for (let s = 1; s * 0.4 < h; s++) onWall(plain, f, t - w / 2, t + w / 2, s * 0.4 - 0.03, s * 0.4 + 0.03, 0.06, [col[0] * 0.68, col[1] * 0.68, col[2] * 0.68]);
  }
}

function cart(x: ShopCtx, p: Pt, ang: number) {
  block(x.plain, p[0], p[1], ang, 0.95, 0.58, 0.3, 0.92, [0.66, 0.7, 0.74], [0.5, 0.54, 0.58]);
  block(x.plain, p[0], p[1], ang, 0.9, 0.5, 0, 0.3, [0.25, 0.26, 0.28]);
}

/** Zaun um ein Rechteck vor der Halle (Gartenabteilung). */
function fenceArea(x: ShopCtx, ta: number, tb: number, o0: number, o1: number) {
  const { f, plain } = x;
  const post = (t: number, o: number) => {
    const p = f.at(t, o);
    block(plain, p[0], p[1], f.ang, 0.08, 0.08, 0, 1.8, [0.4, 0.42, 0.42]);
  };
  for (let t = ta; t <= tb + 0.01; t += 1.5) post(t, o1);
  for (let o = o0; o <= o1 + 0.01; o += 1.5) {
    post(ta, o);
    post(tb, o);
  }
  // Maschendraht als dunkle Bänder
  for (const z of [0.6, 1.2, 1.75]) {
    onWall(plain, { ...f, at: (t, o) => f.at(t, o + o1) }, ta, tb, z - 0.02, z + 0.02, 0, [0.36, 0.38, 0.38]);
  }
}

/** Tische mit Pflanzen in Töpfen (Gartencenter, Baumarkt). */
function plantTables(x: ShopCtx, ta: number, tb: number, off: number) {
  const { f, plain } = x;
  for (let t = ta; t + 1.6 <= tb; t += 2.2) {
    const p = f.at(t + 0.8, off);
    block(plain, p[0], p[1], f.ang, 1.6, 0.8, 0.7, 0.78, [0.5, 0.5, 0.48]);
    for (const s of [-1, 1]) {
      const q = f.at(t + 0.8 + s * 0.7, off);
      block(plain, q[0], q[1], f.ang, 0.06, 0.7, 0, 0.7, GREY);
    }
    for (let k = 0; k < 4; k++) {
      const q = f.at(t + 0.2 + k * 0.4, off + (k % 2 ? 0.15 : -0.15));
      prism(plain, q[0], q[1], 0.13, 6, 0.78, 0.95, [0.66, 0.36, 0.22]);
      prism(plain, q[0], q[1], 0.18, 7, 0.95, 1.2, k % 3 ? LEAF : [0.78, 0.36, 0.42], LEAF_DARK);
    }
  }
}

/** Gewächshaus-Raster auf allen Wänden (Gartencenter). */
export function greenhouseFrames(ring: Pt[], top: number, plain: MeshData) {
  const col: RGB = [0.86, 0.88, 0.86];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    const e: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // nach außen: hier reicht ein kleiner Abstand in beide Richtungen (Rahmen sind dünn)
    const n: Pt = [e[1] * 0.05, -e[0] * 0.05];
    for (let t = 0; t <= len + 0.01; t += 1.5) {
      const p: Pt = [a[0] + e[0] * Math.min(t, len), a[1] + e[1] * Math.min(t, len)];
      for (const s of [1, -1]) block(plain, p[0] + n[0] * s, p[1] + n[1] * s, Math.atan2(e[1], e[0]), 0.08, 0.04, 0, top, col);
    }
    for (const z of [0.6, top * 0.55, top - 0.05]) {
      for (const s of [1, -1]) {
        const p0: Pt = [a[0] + n[0] * s, a[1] + n[1] * s];
        const p1: Pt = [b[0] + n[0] * s, b[1] + n[1] * s];
        flat(plain, [p0[0], p0[1], z - 0.04], [p1[0], p1[1], z - 0.04], [p1[0], p1[1], z + 0.04], [p0[0], p0[1], z + 0.04], col);
      }
    }
  }
}

/** Große Läden als eigene Halle, je nach Art. */
export function hallShop(sub: string, x: ShopCtx) {
  const { f, plain, L, mid, top, accent, variant: v } = x;
  hallSign(x);

  switch (sub) {
    case 'car_repair':
    case 'car_parts': {
      const doors = Math.max(1, Math.min(3, Math.floor((L - 2) / 4.2)));
      rollerDoors(x, sub === 'car_parts' ? 1 : doors);
      tires(x, mid - doors * 2.1 - 1.2, 1.1, 5);
      tires(x, mid + doors * 2.1 + 1.2, 1.1, 3);
      if (sub === 'car_repair') {
        oilDrum(x, Math.min(L - 0.6, mid + doors * 2.1 + 2.2), 0.6, [0.2, 0.36, 0.6]);
        oilDrum(x, Math.min(L - 0.6, mid + doors * 2.1 + 2.9), 0.6, [0.72, 0.2, 0.14]);
      }
      return;
    }
    case 'trade': {
      // Großhandel: Laderampe mit Toren in Rampenhöhe, kleine Bürotür, Paletten
      const docks = Math.max(1, Math.min(4, Math.floor((L - 4) / 4.2)));
      const start = mid - ((docks - 1) / 2) * 4.2;
      const rp = f.at(mid, 1.25);
      block(plain, rp[0], rp[1], f.ang, docks * 4.2 + 0.6, 2.5, 0, 1.2, CONCRETE, [0.58, 0.56, 0.52]);
      for (let k = 0; k < docks; k++) {
        const t = start + k * 4.2;
        onWall(plain, f, t - 1.5, t + 1.5, 1.2, 4.2, 0.05, [0.26, 0.27, 0.28]);
        for (const s of [-1, 1]) onWall(plain, f, t + s * 1.65 - 0.12, t + s * 1.65 + 0.12, 0.6, 1.2, 2.55, [0.95, 0.78, 0.15]);
      }
      const od = Math.max(0.8, start - 4.2 / 2 - 1.2);
      if (od < mid - 2) onWall(plain, f, od - 0.5, od + 0.5, 0, 2.2, 0.07, DOOR);
      palletLoad(x, Math.min(L - 1, mid + docks * 2.1 + 1.4), 1.0, [0.74, 0.6, 0.42], 0.9);
      palletLoad(x, Math.min(L - 1, mid + docks * 2.1 + 1.4), 2.3, [0.6, 0.6, 0.58], 0.6);
      return;
    }
    case 'garden_centre': {
      // Gewächshaus: helle Glaswände mit Rahmen (setzt houseMesh), Pflanzentische, Säcke
      glassFront(x, Math.min(L * 0.3, 6), true);
      plantTables(x, 0.6, Math.max(0.6, mid - 3.5), 1.6);
      plantTables(x, Math.min(L, mid + 3.5), L - 0.6, 1.6);
      palletLoad(x, mid + 2.2, 3.2, [0.36, 0.26, 0.18], 0.55);
      return;
    }
    case 'beverages': {
      // Getränkemarkt als Halle: Rolltor fürs Leergut, Glas-Eingang, Kistenberge
      glassFront(x, Math.min(L * 0.25, 5));
      if (L > 14) rollerDoors(x, 1, 3.2, 3.2, [0.62, 0.64, 0.65], Math.min(L - 2.5, mid + 5));
      const cols: RGB[] = [
        [0.2, 0.4, 0.72],
        [0.74, 0.2, 0.16],
        [0.25, 0.55, 0.3],
        [0.9, 0.72, 0.18],
      ];
      crates(x, Math.max(0.6, mid - Math.min(L * 0.25, 5) / 2 - 3), 0.5, 5, 5, cols, v);
      palletLoad(x, Math.max(1, mid - Math.min(L * 0.25, 5) / 2 - 1.2), 2.2, [0.7, 0.82, 0.88], 1.0);
      return;
    }
    case 'chemist': {
      glassFront(x, Math.min(L * 0.5, 14), true);
      for (const s of [-1, 1]) {
        const p = f.at(mid + s * Math.min(L * 0.25 + 1, 8), 0.7);
        block(plain, p[0], p[1], f.ang, 1.0, 0.5, 0, 0.5, [0.6, 0.6, 0.58]);
        block(plain, p[0], p[1], f.ang, 0.9, 0.42, 0.5, 0.75, LEAF, LEAF_DARK);
      }
      return;
    }
    case 'farm': {
      // Großer Hofladen in der Scheune: breites Holztor, Strohballen, Kisten
      rollerDoors(x, 1, 4.2, Math.min(top - 0.4, 3.8), [0.5, 0.34, 0.2]);
      for (let k = 0; k < 3; k++) strawBale(x, Math.max(0.8, mid - 4 - k * 1.2), 0.7, 0);
      strawBale(x, Math.max(0.8, mid - 4.6), 0.7, 0.48);
      milkCan(x, Math.min(L - 0.6, mid + 3), 0.6);
      milkCan(x, Math.min(L - 0.6, mid + 3.5), 0.6);
      return;
    }
    case 'doityourself':
    case 'hardware': {
      // Baumarkt: Glasfront, Paletten, eingezäunte Gartenabteilung an einer Seite
      const gw = Math.min(L * 0.3, 7);
      glassFront(x, gw);
      const loads: RGB[] = [
        [0.86, 0.8, 0.66],
        [0.7, 0.36, 0.26],
        [0.74, 0.6, 0.42],
        [0.6, 0.6, 0.58],
      ];
      for (let k = 0; k < 3; k++) {
        const t = mid - gw / 2 - 1.5 - k * 1.6;
        if (t < 0.6) break;
        palletLoad(x, t, 2.2 + (k % 2) * 0.4, loads[(k + v) % loads.length], 0.6 + (k % 3) * 0.2);
      }
      const ga = mid + gw / 2 + 1.2;
      const gb = Math.min(L - 0.3, ga + Math.min(12, L * 0.3));
      if (sub === 'doityourself' && gb - ga > 3) {
        fenceArea(x, ga, gb, 0.3, 4.5);
        plantTables(x, ga + 0.3, gb - 0.3, 2.4);
      }
      return;
    }
    default: {
      // Supermarkt: klein ohne Vordach, groß mit Vordach, Wagenbox und mehr Wagen
      const big = x.area >= 700;
      const gw = Math.min(L * 0.55, big ? 16 : 9);
      glassFront(x, gw);
      if (big) {
        const cw = Math.min(gw * 0.6, 9);
        const cp = f.at(mid, 1.5);
        block(plain, cp[0], cp[1], f.ang, cw, 3, 3.35, 3.6, accent, [0.85, 0.85, 0.83], true);
        for (const s of [-1, 1]) {
          const pp = f.at(mid + (s * cw) / 2 - s * 0.3, 2.7);
          block(plain, pp[0], pp[1], f.ang, 0.18, 0.18, 0, 3.35, WHITE);
        }
        // Einkaufswagenbox: Dach auf Stützen, darunter eine Reihe Wagen
        const bt = Math.max(2, mid - cw / 2 - 4);
        const bp = f.at(bt, 4.5);
        block(plain, bp[0], bp[1], f.ang, 4.2, 1.6, 2.2, 2.32, [0.42, 0.44, 0.46], [0.5, 0.52, 0.54], true);
        for (const s of [-1, 1]) {
          const q = f.at(bt + s * 1.95, 4.5);
          block(plain, q[0], q[1], f.ang, 0.1, 0.1, 0, 2.2, GREY);
        }
        for (let k = 0; k < 5; k++) cart(x, f.at(bt - 1.6 + k * 0.38, 4.5), f.ang + Math.PI / 2);
      }
      const n = big ? 3 + v : 1 + (v % 2);
      for (let k = 0; k < n; k++) {
        const lost = k === n - 1;
        const p = f.at(mid + gw / 2 + 1.2 + (lost ? 3 : k * 0.35), lost ? 6.5 : 4.2);
        cart(x, p, f.ang + Math.PI / 2 + (lost ? 0.7 : 0));
      }
    }
  }
}

/** Gibt es hier ein eigenes Aussehen? (Für Tests.) */
export const SHOP_SUBS = ['bakery', 'butcher', 'kiosk', 'convenience', 'grocery', 'greengrocer', 'deli', 'beverages', 'farm', 'chemist', 'pharmacy', 'doctors', 'dentist', 'hardware', 'doityourself', 'garden_centre', 'trade', 'car_repair', 'car_parts', 'supermarket'];

/** Ab wie viel m² Grundfläche ein Laden eine eigene Halle wird. */
export const HALL_AREA: Record<string, number> = {
  supermarket: 150,
  doityourself: 150,
  garden_centre: 120,
  trade: 150,
  car_repair: 120,
  car_parts: 300,
  hardware: 400,
  beverages: 220,
  chemist: 300,
  farm: 300,
  grocery: 380,
};

