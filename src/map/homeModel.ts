// Dein Zuhause als kleines 3D-Modell auf der Karte (nur für dich sichtbar). Es wächst mit der
// Gemütlichkeits-Stufe: Plane und Feuer, Zelt, Bretterbude, Hütte mit Blechdach, Garten,
// Veranda mit Solarzelle, zuletzt ein Windrad und ein Gewächshaus. Immer dabei: deine Fahne.
//
// Reine Rechnung ohne Browser, Mitte bei (0, 0), Meter. Gezeichnet in map/treeLayer.ts.

import { block, emptyMesh, flat, prism, quad, tri, type MeshData, type P3, type RGB } from './meshKit';

const WOOD: RGB = [0.52, 0.37, 0.24];
const WOOD_DARK: RGB = [0.36, 0.25, 0.16];
const TARP: RGB = [0.24, 0.42, 0.62];
const TENT: RGB = [0.86, 0.48, 0.18];
const TIN: RGB = [0.52, 0.56, 0.6];
const STONE: RGB = [0.56, 0.54, 0.5];
const FIRE: RGB = [1, 0.62, 0.18];
const GLOW: RGB = [1, 0.85, 0.45];
const GREEN: RGB = [0.36, 0.55, 0.26];
const SOIL: RGB = [0.36, 0.26, 0.18];
const FLAG: RGB = [1, 0.7, 0.18];
const SMOKE: RGB = [0.78, 0.77, 0.74];
const GLASS: RGB = [0.7, 0.84, 0.86];

export interface HomeMeshes {
  plain: MeshData;
  /** Ziegeldach (nur die großen Stufen) */
  roof: MeshData;
}

function campfire(m: MeshData, x: number, y: number) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    prism(m, x + Math.cos(a) * 0.55, y + Math.sin(a) * 0.55, 0.16, 5, 0, 0.16, STONE);
  }
  block(m, x, y, 0.5, 0.9, 0.16, 0.05, 0.2, WOOD_DARK);
  block(m, x, y, -0.6, 0.9, 0.16, 0.05, 0.2, WOOD_DARK);
  // Flammen als kleine Kegel
  for (const [dx, dy, h] of [
    [0, 0, 0.75],
    [0.15, 0.1, 0.5],
    [-0.12, 0.08, 0.55],
  ])
    cone(m, x + dx, y + dy, 0.18, 0.18, 0.18 + h, dx === 0 ? FIRE : GLOW);
}

function cone(m: MeshData, x: number, y: number, r: number, z0: number, z1: number, col: RGB) {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    tri(m, [x + Math.cos(a) * r, y + Math.sin(a) * r, z0], [x + Math.cos(b) * r, y + Math.sin(b) * r, z0], [x, y, z1], [0, 0], [0, 0], [0, 0], col);
  }
}

function crate(m: MeshData, x: number, y: number, s: number, rot: number) {
  block(m, x, y, rot, s, s, 0, s, [0.62, 0.46, 0.3], [0.7, 0.54, 0.36]);
}

/** Fahnenmast mit deiner Fahne: daran erkennst du dein Zuhause von Weitem. */
function flagpole(m: MeshData, x: number, y: number, h: number) {
  prism(m, x, y, 0.07, 6, 0, h, [0.3, 0.3, 0.3]);
  const f: P3[] = [
    [x, y, h - 0.1],
    [x + 1.5, y + 0.15, h - 0.35],
    [x + 1.5, y + 0.15, h - 1.15],
    [x, y, h - 0.95],
  ];
  flat(m, f[0], f[1], f[2], f[3], FLAG);
}

function smoke(m: MeshData, x: number, y: number, z: number) {
  for (let i = 0; i < 4; i++) prism(m, x + i * 0.25, y + i * 0.1, 0.22 + i * 0.1, 7, z + i * 0.55, z + i * 0.55 + 0.4, SMOKE);
}

/** Hütte mit Satteldach: w breit (Ost-West), d tief, Wandhöhe wh. */
function cabin(M: HomeMeshes, cx: number, cy: number, w: number, d: number, wh: number, walls: RGB, roofCol: RGB | null, door: boolean) {
  const m = M.plain;
  block(m, cx, cy, 0, w, d, 0, wh, walls);
  // Satteldach: First Ost-West
  const pitch = d * 0.45;
  const o = 0.3;
  const eave = wh - 0.05;
  const r = roofCol ? m : M.roof;
  const col: RGB = roofCol ?? [1, 1, 1];
  for (const s of [-1, 1]) {
    const a: P3 = [cx - w / 2 - o, cy + s * (d / 2 + o), eave];
    const b: P3 = [cx + w / 2 + o, cy + s * (d / 2 + o), eave];
    const c: P3 = [cx + w / 2 + o, cy, wh + pitch];
    const dd: P3 = [cx - w / 2 - o, cy, wh + pitch];
    quad(r, a, b, c, dd, [0, 0], [(w + 2 * o) / 7, 0], [(w + 2 * o) / 7, (d / 2 + o) / 7], [0, (d / 2 + o) / 7], col);
  }
  for (const s of [-1, 1]) tri(m, [cx + (s * w) / 2, cy - d / 2, wh], [cx + (s * w) / 2, cy + d / 2, wh], [cx + (s * w) / 2, cy, wh + pitch], [0, 0], [0, 0], [0, 0], walls);
  if (door) {
    // Tür nach Süden, daneben ein warm leuchtendes Fenster
    flat(m, [cx - 0.45, cy - d / 2 - 0.03, 0], [cx + 0.45, cy - d / 2 - 0.03, 0], [cx + 0.45, cy - d / 2 - 0.03, 2], [cx - 0.45, cy - d / 2 - 0.03, 2], WOOD_DARK);
    flat(m, [cx + 1, cy - d / 2 - 0.03, 1], [cx + 1.8, cy - d / 2 - 0.03, 1], [cx + 1.8, cy - d / 2 - 0.03, 1.7], [cx + 1, cy - d / 2 - 0.03, 1.7], GLOW);
  }
  return wh + pitch;
}

/** Das Modell für eine Stufe (0 = Ruine … 6 = Oase). */
export function buildHome(tier: number): HomeMeshes {
  const M: HomeMeshes = { plain: emptyMesh(), roof: emptyMesh() };
  const m = M.plain;
  const t = Math.max(0, Math.min(6, Math.round(tier)));

  if (t <= 1) {
    if (t === 0) {
      // Plane als Wetterschutz, schräg an zwei Stangen
      flat(m, [-1.6, 1.2, 1.9], [1.6, 1.2, 1.9], [1.6, -0.8, 0.05], [-1.6, -0.8, 0.05], TARP);
      for (const x of [-1.6, 1.6]) prism(m, x, 1.2, 0.06, 5, 0, 1.9, WOOD);
    } else {
      // Zelt
      const tent: RGB = TENT;
      flat(m, [-1.4, -1.1, 0], [1.4, -1.1, 0], [1.4, 0, 1.6], [-1.4, 0, 1.6], tent);
      flat(m, [-1.4, 1.1, 0], [1.4, 1.1, 0], [1.4, 0, 1.6], [-1.4, 0, 1.6], [0.74, 0.4, 0.15]);
      tri(m, [1.4, -1.1, 0], [1.4, 1.1, 0], [1.4, 0, 1.6], [0, 0], [0, 0], [0, 0], [0.7, 0.38, 0.14]);
      tri(m, [-1.4, -1.1, 0], [-1.4, 1.1, 0], [-1.4, 0, 1.6], [0, 0], [0, 0], [0, 0], [0.35, 0.2, 0.1]);
      flagpole(m, 2.2, 1.6, 4.5);
    }
    campfire(m, 0.3, -2.4);
    crate(m, -2.2, -0.6, 0.6, 0.3);
    crate(m, -2.1, 0.2, 0.5, -0.2);
    return M;
  }

  if (t === 2) {
    // Bretterbude mit Plane als Dach, Lagerfeuer, Regentonne
    block(m, 0, 0.5, 0, 4, 3, 0, 2.2, WOOD, WOOD);
    flat(m, [-2.3, 2.3, 2.6], [2.3, 2.3, 2.6], [2.3, -1.3, 2.0], [-2.3, -1.3, 2.0], TARP);
    flat(m, [-0.45, -1.03, 0], [0.45, -1.03, 0], [0.45, -1.03, 1.9], [-0.45, -1.03, 1.9], WOOD_DARK);
    campfire(m, 1.2, -3.2);
    prism(m, 2.6, 0.2, 0.45, 8, 0, 1.0, [0.2, 0.36, 0.56]);
    crate(m, -2.8, -0.4, 0.6, 0.4);
    flagpole(m, -3, 2.4, 5);
    return M;
  }

  // Ab Stufe 3: Hütte mit Dach, Schornstein mit Rauch, Zaun
  const big = t >= 5;
  const w = big ? 7 : 5;
  const d = big ? 5 : 4;
  const ridge = cabin(M, 0, 0.5, w, d, big ? 3 : 2.6, big ? [0.66, 0.5, 0.34] : WOOD, t >= 4 ? null : TIN, true);
  prism(m, w / 2 - 1, 1.2, 0.3, 4, ridge - 1, ridge + 0.6, [0.5, 0.36, 0.28]);
  smoke(m, w / 2 - 1, 1.2, ridge + 0.8);
  // Zaun vorne
  for (let i = 0; i < 6; i++) block(m, -5 + i * 2, -4.5, 0, 0.12, 0.12, 0, 1.1, WOOD_DARK);
  block(m, 0, -4.5, 0, 10, 0.08, 0.7, 0.85, WOOD);
  prism(m, w / 2 + 1, -1, 0.45, 8, 0, 1.0, [0.2, 0.36, 0.56]);
  flagpole(m, -w / 2 - 1.5, 2.5, 6.5);

  if (t >= 4) {
    // Garten: Beete mit Gemüse, Bank, Laterne
    for (let i = 0; i < 3; i++) {
      block(m, -4 + i * 1.6, -3, 0, 1.2, 1.6, 0, 0.3, SOIL);
      for (let k = 0; k < 3; k++) prism(m, -4 + i * 1.6, -3.5 + k * 0.5, 0.2, 5, 0.3, 0.6, GREEN);
    }
    block(m, 3, -3, 0, 1.6, 0.45, 0.4, 0.5, WOOD);
    prism(m, 4.6, -3.8, 0.06, 5, 0, 2.2, [0.25, 0.25, 0.25]);
    block(m, 4.6, -3.8, 0, 0.3, 0.3, 2.2, 2.6, GLOW);
  }
  if (t >= 5) {
    // Veranda auf Pfosten, Solarzelle auf dem Dach, Blumenkästen
    block(m, 0, -2.6, 0, w, 1.6, 2.7, 2.85, WOOD_DARK, [0.45, 0.32, 0.2]);
    for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) block(m, x, -3.3, 0, 0.15, 0.15, 0, 2.7, WOOD_DARK);
    flat(m, [-2.4, -0.2, 3.35], [-0.6, -0.2, 3.35], [-0.6, 0.9, 3.95], [-2.4, 0.9, 3.95], [0.18, 0.24, 0.4]);
    for (const x of [-2.2, 1.6]) block(m, x, -1.55, 0, 1, 0.3, 0.9, 1.15, [0.75, 0.3, 0.25], [0.86, 0.4, 0.55]);
  }
  if (t >= 6) {
    // Windrad und Gewächshaus
    prism(m, 6.5, 3.5, 0.15, 6, 0, 9, [0.85, 0.85, 0.82]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      flat(m, [6.5, 3.2, 9], [6.5 + Math.cos(a) * 3.2, 3.2, 9 + Math.sin(a) * 3.2], [6.5 + Math.cos(a + 0.12) * 3.2, 3.2, 9 + Math.sin(a + 0.12) * 3.2], [6.5, 3.2, 9.05], [0.95, 0.95, 0.92]);
    }
    block(m, -6, 3.5, 0, 3, 2.2, 0, 2.2, GLASS, [0.8, 0.92, 0.94]);
  }
  return M;
}
