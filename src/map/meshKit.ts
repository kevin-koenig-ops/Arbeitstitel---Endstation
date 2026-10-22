// Kleiner Baukasten für die 3D-Ebene der Karte (Häuser, Wahrzeichen): Dreiecke mit
// Bildkoordinaten und Farbton sammeln. Reine Rechnung ohne Browser.
// Koordinaten wie in map/treeLayer.ts: x = Osten, y = oben, z = Süden (Meter).

export type Pt = [number, number];
export type RGB = [number, number, number];
/** Ein Punkt im Raum: x Osten, y Norden, h Höhe. */
export type P3 = [number, number, number];
export type UV = [number, number];

export interface MeshData {
  pos: number[];
  uv: number[];
  col: number[];
}

export function emptyMesh(): MeshData {
  return { pos: [], uv: [], col: [] };
}

export function tri(m: MeshData, a: P3, b: P3, c: P3, ua: UV, ub: UV, uc: UV, col: RGB) {
  for (const p of [a, b, c]) m.pos.push(p[0], p[2], -p[1]);
  m.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  for (let i = 0; i < 3; i++) m.col.push(col[0], col[1], col[2]);
}

export function quad(m: MeshData, a: P3, b: P3, c: P3, d: P3, ua: UV, ub: UV, uc: UV, ud: UV, col: RGB) {
  tri(m, a, b, c, ua, ub, uc, col);
  tri(m, a, c, d, ua, uc, ud, col);
}

const Z: UV = [0, 0];

/** Einfarbiges Viereck (ohne Bild). */
export function flat(m: MeshData, a: P3, b: P3, c: P3, d: P3, col: RGB) {
  quad(m, a, b, c, d, Z, Z, Z, Z, col);
}

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Gedrehter Quader: Mitte (cx, cy), Länge entlang ang, Breite quer dazu, von z0 bis z1. */
export function block(m: MeshData, cx: number, cy: number, ang: number, len: number, wid: number, z0: number, z1: number, col: RGB, top: RGB = col, bottom = false) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const at = (a: number, b: number): Pt => [cx + a * c - b * s, cy + a * s + b * c];
  const p = [at(-len / 2, -wid / 2), at(len / 2, -wid / 2), at(len / 2, wid / 2), at(-len / 2, wid / 2)];
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    flat(m, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], col);
  }
  flat(m, [p[0][0], p[0][1], z1], [p[1][0], p[1][1], z1], [p[2][0], p[2][1], z1], [p[3][0], p[3][1], z1], top);
  if (bottom) flat(m, [p[0][0], p[0][1], z0], [p[1][0], p[1][1], z0], [p[2][0], p[2][1], z0], [p[3][0], p[3][1], z0], col);
}

/** Säule mit n Ecken (Rohre, Reifen, Becken). */
export function prism(m: MeshData, cx: number, cy: number, r: number, n: number, z0: number, z1: number, col: RGB, top: RGB = col) {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) pts.push([cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    flat(m, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], col);
    tri(m, [cx, cy, z1], [a[0], a[1], z1], [b[0], b[1], z1], Z, Z, Z, top);
  }
}

/** Schild mit Bild (u 0–1 von a nach b, v 0–1 von unten nach oben), senkrecht. */
export function signQuad(m: MeshData, a: Pt, b: Pt, z0: number, z1: number) {
  const w: RGB = [1, 1, 1];
  quad(m, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], [0, 0], [1, 0], [1, 1], [0, 1], w);
}
