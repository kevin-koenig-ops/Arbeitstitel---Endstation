// Gemeinsame Bausteine für Läden und Wahrzeichen: Ladenfront finden, Flächen an die Wand
// setzen, Schilder. Reine Rechnung ohne Browser.

import { dist, emptyMesh, flat, signQuad, type MeshData, type Pt, type RGB } from './meshKit';

/** Schilder: ein Topf je Bild. */
export type Signs = Record<string, MeshData>;

/** Seitenverhältnis der Text-Schilder (Breite : Höhe), so malt sie auch die Ebene. */
export const SIGN_RATIO = 5.5;

export const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

export const GLASS: RGB = [0.2, 0.27, 0.32];
export const GLASS_HI: RGB = [0.34, 0.44, 0.5];
export const FRAME: RGB = [0.56, 0.56, 0.54];
export const DOOR: RGB = [0.14, 0.15, 0.17];
export const KICK: RGB = [0.36, 0.34, 0.31];
export const WHITE: RGB = [0.9, 0.9, 0.88];
export const GREY: RGB = [0.55, 0.57, 0.58];
export const CONCRETE: RGB = [0.66, 0.64, 0.6];

/** Die Wand, die am meisten zur Straße (toward) schaut: Ladenfront, Haustür. */
export type FrontWall = ReturnType<typeof frontWall>;

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
export function onWall(m: MeshData, f: FrontWall, t0: number, t1: number, z0: number, z1: number, off: number, col: RGB) {
  const a = f.at(t0, off);
  const b = f.at(t1, off);
  flat(m, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], col);
}

export function sign(signs: Signs, key: string, a: Pt, b: Pt, z0: number, z1: number) {
  const m = (signs[key] ??= emptyMesh());
  signQuad(m, a, b, z0, z1);
}

export const textKey = (text: string, c: [string, string, string]) => `${text}|${c[0]}|${c[1]}`;

