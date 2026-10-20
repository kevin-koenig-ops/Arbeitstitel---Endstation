// Bauteile als Low-Poly-Modelle: Wände, Zäune, Türen, Fenster, Böden, Dächer und Hindernisse.
// Jedes Modell sitzt mittig auf dem Ursprung. Wände liegen entlang x (von -0,5 bis 0,5).

import * as THREE from 'three';
import type { FloorId, ObstacleKind, OpeningId, RoofId, SiteId, WallId } from '../core/building';
import { add, blob, box, buildRubble, cone, cyl, mat, METAL, WOOD, WOOD_DARK } from './models';

export const WALL_H = 2.4;
export const WALL_T = 0.12;
export const CUT_H = 0.42;
export const FLOOR_H = 0.025;

type G = THREE.Group;

function rnd(seed: number) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function pickC(r: () => number, list: string[]) {
  return list[Math.floor(r() * list.length)];
}

// --- Wände -------------------------------------------------------------------------------

type Rect = [number, number, number, number]; // x0, x1, y0, y1

function hole(o: OpeningId | undefined): Rect | null {
  switch (o) {
    case 'door':
      return [-0.4, 0.4, 0, 2.05];
    case 'arch':
      return [-0.42, 0.42, 0, 2.1];
    case 'window':
      return [-0.34, 0.34, 0.95, 1.75];
    default:
      return null;
  }
}

/** Massive Teile der Wand (Rechteck minus Öffnung), auf die Höhe h gekappt. */
function solidRects(o: OpeningId | undefined, h: number): Rect[] {
  const hl = hole(o);
  const out: Rect[] = hl
    ? [
        [-0.5, hl[0], 0, WALL_H],
        [hl[1], 0.5, 0, WALL_H],
        [hl[0], hl[1], 0, hl[2]],
        [hl[0], hl[1], hl[3], WALL_H],
      ]
    : [[-0.5, 0.5, 0, WALL_H]];
  return out.map(([a, b, c, d]) => [a, b, c, Math.min(d, h)] as Rect).filter(([a, b, c, d]) => b - a > 0.001 && d - c > 0.001);
}

function slab(g: G, r: Rect, t: number, color: string, z = 0) {
  const [x0, x1, y0, y1] = r;
  return box(g, x1 - x0, y1 - y0, t, mat(color), (x0 + x1) / 2, y0, z);
}

function wallStyle(g: G, piece: WallId, rects: Rect[], variant: number) {
  const r = rnd(variant * 17 + piece.length * 3);
  if (piece === 'plankWall') {
    const boards = ['#8a6a45', '#7d6040', '#94734c', '#806344', '#735a3c'];
    for (const rc of rects) {
      slab(g, rc, WALL_T, '#4f3d2a');
      for (let y = rc[2]; y < rc[3] - 0.01; y += 0.3) {
        const top = Math.min(rc[3], y + 0.28);
        slab(g, [rc[0], rc[1], y, top], WALL_T + 0.025, pickC(r, boards));
      }
    }
    return;
  }
  if (piece === 'sheetWall') {
    const sheets = ['#77736b', '#6e6a62', '#827d73'];
    for (const rc of rects) {
      slab(g, rc, WALL_T, pickC(r, sheets));
      for (let x = rc[0] + 0.06; x < rc[1] - 0.03; x += 0.125) slab(g, [x, x + 0.035, rc[2], rc[3]], WALL_T + 0.035, '#8c877c');
      if (r() < 0.7 && rc[1] - rc[0] > 0.3 && rc[3] - rc[2] > 0.4) {
        const w = 0.15 + r() * 0.25;
        const x = rc[0] + r() * (rc[1] - rc[0] - w);
        const y = rc[2] + r() * Math.max(0, rc[3] - rc[2] - 0.4);
        slab(g, [x, x + w, y, Math.min(rc[3], y + 0.2 + r() * 0.4)], WALL_T + 0.045, '#8a5a3a');
      }
    }
    return;
  }
  if (piece === 'brickWall') {
    const bricks = ['#8f4a38', '#9a523e', '#844434', '#a05a44'];
    for (const rc of rects) {
      slab(g, rc, WALL_T, '#b2a594');
      for (let y = rc[2] + 0.012; y < rc[3] - 0.02; y += 0.12) slab(g, [rc[0], rc[1], y, Math.min(rc[3], y + 0.1)], WALL_T + 0.016, pickC(r, bricks));
      for (let i = 0; i < 3; i++) {
        const y = rc[2] + 0.012 + Math.floor(r() * ((rc[3] - rc[2]) / 0.12)) * 0.12;
        if (y + 0.1 > rc[3]) continue;
        const x = rc[0] + r() * Math.max(0, rc[1] - rc[0] - 0.24);
        slab(g, [x, Math.min(rc[1], x + 0.24), y, y + 0.1], WALL_T + 0.03, r() < 0.5 ? '#6e3a2c' : '#b26a50');
      }
    }
  }
}

function doorFrame(g: G, hl: Rect, h: number, color: string) {
  const top = Math.min(hl[3], h);
  for (const x of [hl[0] - 0.03, hl[1] + 0.03]) slab(g, [x - 0.03, x + 0.03, 0, top], WALL_T + 0.05, color);
  if (hl[3] <= h) slab(g, [hl[0] - 0.06, hl[1] + 0.06, hl[3], Math.min(h, hl[3] + 0.08)], WALL_T + 0.05, color);
}

/** Eine Wand oder ein Zaun auf einer Kante, mit Öffnung, auf Höhe h gekappt. */
export function buildWall(piece: WallId, o: OpeningId | undefined, h: number, variant: number): G {
  const g = new THREE.Group();
  if (piece === 'chainFence' || piece === 'picketFence') return buildFence(g, piece, o, variant);
  wallStyle(g, piece, solidRects(o, h), variant);
  // Eckpfosten (decken die Stöße an Ecken ab)
  const post = piece === 'brickWall' ? '#7a3e30' : piece === 'sheetWall' ? '#5a5650' : '#5a4430';
  for (const x of [-0.5, 0.5]) box(g, 0.15, h, 0.15, mat(post), x, 0, 0);
  const hl = hole(o);
  if (!hl) return g;
  if (o === 'door') {
    doorFrame(g, hl, h, WOOD_DARK);
    const leafH = Math.min(2.0, h);
    const leaf = new THREE.Group();
    box(leaf, 0.78, leafH, 0.05, mat('#6b4a32'), 0.39, 0, 0);
    if (leafH > 1.2) {
      box(leaf, 0.6, 0.7, 0.07, mat('#5c3f2a'), 0.39, 1.15, 0);
      box(leaf, 0.6, 0.7, 0.07, mat('#5c3f2a'), 0.39, 0.25, 0);
      box(leaf, 0.06, 0.06, 0.12, mat('#c9a23a'), 0.7, 1.0, 0);
    }
    leaf.position.set(-0.39, 0, 0.03);
    leaf.rotation.y = 0.95;
    g.add(leaf);
  } else if (o === 'arch') {
    doorFrame(g, hl, h, '#4a4540');
  } else if (o === 'window' && h > hl[2]) {
    const top = Math.min(hl[3], h);
    slab(g, [hl[0] - 0.06, hl[1] + 0.06, hl[2] - 0.05, hl[2]], WALL_T + 0.12, '#8a8476');
    for (const x of [hl[0], hl[1]]) slab(g, [x - 0.035, x + 0.035, hl[2], top], WALL_T + 0.04, '#e0d8c4');
    if (top >= hl[3]) slab(g, [hl[0] - 0.035, hl[1] + 0.035, hl[3] - 0.035, hl[3]], WALL_T + 0.04, '#e0d8c4');
    slab(g, [-0.02, 0.02, hl[2], top], 0.05, '#e0d8c4');
    if (top > (hl[2] + hl[3]) / 2) slab(g, [hl[0], hl[1], (hl[2] + hl[3]) / 2 - 0.02, (hl[2] + hl[3]) / 2 + 0.02], 0.05, '#e0d8c4');
    // Glas (eine Scheibe ist manchmal kaputt) oder vernagelt
    if (variant % 3 === 2 && top >= hl[3]) {
      for (const s of [-1, 1]) {
        const b = box(g, 0.85, 0.12, 0.03, mat('#8a6a45'), 0, (hl[2] + hl[3]) / 2 - 0.06, s * 0.075);
        b.rotation.z = s * 0.55;
      }
    }
    const glass = mat('#7f98a0');
    if (variant % 3 !== 1) slab(g, [hl[0] + 0.03, -0.02, hl[2], top], 0.02, '#7f98a0');
    slab(g, [0.02, hl[1] - 0.03, hl[2], Math.min(top, (hl[2] + hl[3]) / 2)], 0.02, '#8aa2aa');
    void glass;
  }
  return g;
}

function buildFence(g: G, piece: WallId, o: OpeningId | undefined, variant: number): G {
  const gate = o === 'gate';
  if (piece === 'chainFence') {
    const steel = '#8a8f88';
    for (const x of [-0.5, 0.5]) cyl(g, 0.035, 0.035, 1.75, mat('#6e746e'), x, 0, 0, 6);
    const panel = new THREE.Group();
    box(panel, 1.0, 0.04, 0.04, mat(steel), 0, 1.62, 0);
    box(panel, 1.0, 0.04, 0.04, mat(steel), 0, 0.08, 0);
    // Drahtgitter
    for (let y = 0.3; y < 1.6; y += 0.22) box(panel, 1.0, 0.012, 0.012, mat(steel), 0, y, 0).castShadow = false;
    for (let x = -0.375; x <= 0.38; x += 0.125) box(panel, 0.012, 1.52, 0.012, mat(steel), x, 0.1, 0).castShadow = false;
    if (variant % 3 === 1) box(panel, 0.3, 0.3, 0.02, mat('#8a5a3a'), 0.2, 0.9, 0.02);
    if (gate) {
      panel.position.set(-0.5, 0, 0);
      panel.children.forEach((c) => (c.position.x += 0.5));
      panel.rotation.y = 0.8;
    }
    g.add(panel);
    return g;
  }
  // Lattenzaun
  const white = ['#e8e2d0', '#ddd6c2', '#efe9da'];
  const r = rnd(variant * 7 + 3);
  for (const x of [-0.5, 0.5]) box(g, 0.1, 1.15, 0.1, mat('#cfc8b4'), x, 0, 0);
  const panel = new THREE.Group();
  for (const y of [0.3, 0.75]) box(panel, 1.0, 0.07, 0.04, mat('#d6cfba'), 0, y, -0.04);
  for (let i = 0; i < 7; i++) {
    const x = -0.43 + i * 0.143;
    const c = pickC(r, white);
    box(panel, 0.09, 0.95, 0.03, mat(c), x, 0, 0);
    const tip = box(panel, 0.064, 0.064, 0.03, mat(c), x, 0.92, 0);
    tip.rotation.z = Math.PI / 4;
  }
  if (gate) {
    panel.children.forEach((c) => (c.position.x += 0.5));
    panel.position.set(-0.5, 0, 0);
    panel.rotation.y = 0.8;
  }
  g.add(panel);
  return g;
}

// --- Böden und Dächer --------------------------------------------------------------------

export function buildFloor(piece: FloorId, variant: number): G {
  const g = new THREE.Group();
  const r = rnd(variant * 13 + piece.length);
  switch (piece) {
    case 'plankFloor': {
      box(g, 1, FLOOR_H - 0.005, 1, mat('#3f3122'), 0, 0, 0);
      const cols = ['#9a7a52', '#8a6a45', '#a5845a', '#93734b'];
      for (let i = 0; i < 4; i++) box(g, 1, FLOOR_H, 0.235, mat(pickC(r, cols)), 0, 0, -0.375 + i * 0.25);
      break;
    }
    case 'concreteFloor':
      box(g, 1, FLOOR_H - 0.006, 1, mat('#5a5650'), 0, 0, 0);
      box(g, 0.97, FLOOR_H, 0.97, mat(pickC(r, ['#9a958a', '#a39e92', '#8f8a80'])), 0, 0, 0);
      if (variant % 3 === 2) box(g, 0.5, FLOOR_H + 0.002, 0.02, mat('#6a665e'), 0.1, 0, 0.1, 0.6);
      break;
    case 'gravelFloor':
      box(g, 1, FLOOR_H, 1, mat(pickC(r, ['#a0957e', '#9a8f78', '#a89c84'])), 0, 0, 0);
      for (let i = 0; i < 6; i++) blob(g, 0.04 + r() * 0.03, mat(pickC(r, ['#7a7062', '#bdb29a', '#6a6458'])), (r() - 0.5) * 0.8, FLOOR_H, (r() - 0.5) * 0.8).scale.y = 0.4;
      break;
    case 'tileFloor':
      box(g, 1, FLOOR_H - 0.006, 1, mat('#6a645a'), 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const tx = i % 2;
        const tz = Math.floor(i / 2);
        box(g, 0.48, FLOOR_H, 0.48, mat((tx + tz) % 2 ? '#3f4a52' : '#e0d8c4'), -0.25 + tx * 0.5, 0, -0.25 + tz * 0.5);
      }
      break;
    case 'carpetFloor':
      box(g, 1, FLOOR_H, 1, mat(pickC(r, ['#7a3a3a', '#73363a', '#813f3c'])), 0, 0, 0);
      break;
  }
  return g;
}

export function buildRoof(piece: RoofId, variant: number): G {
  const g = new THREE.Group();
  const r = rnd(variant * 11 + piece.length);
  const y = WALL_H;
  switch (piece) {
    case 'tarpRoof':
      box(g, 1.02, 0.05, 1.02, mat(variant % 3 === 2 ? '#5a6b4a' : pickC(r, ['#3f6a82', '#46708a'])), 0, y, 0);
      box(g, 1.02, 0.015, 0.03, mat('#d8d2c2'), 0, y + 0.05, 0);
      break;
    case 'sheetRoof':
      box(g, 1.02, 0.05, 1.02, mat(pickC(r, ['#77736b', '#6e6a62'])), 0, y, 0);
      for (let x = -0.4; x <= 0.41; x += 0.2) box(g, 0.05, 0.035, 1.02, mat('#8c877c'), x, y + 0.05, 0);
      if (variant % 3 === 1) box(g, 0.4, 0.09, 0.35, mat('#8a5a3a'), (r() - 0.5) * 0.4, y + 0.01, (r() - 0.5) * 0.4);
      break;
    case 'tileRoof':
      box(g, 1.02, 0.05, 1.02, mat('#6e2e22'), 0, y, 0);
      for (let i = 0; i < 4; i++) box(g, 1.02, 0.05, 0.27, mat(pickC(r, ['#9a4030', '#8a3a2a', '#a54a36'])), 0, y + 0.03 + (i % 2) * 0.012, -0.375 + i * 0.25);
      break;
  }
  return g;
}

/** Abschlussleiste an einer offenen Dachkante (entlang x, außen bei -z). */
export function buildRoofTrim(): G {
  const g = new THREE.Group();
  box(g, 1.04, 0.16, 0.05, mat('#3a3530'), 0, WALL_H - 0.06, -0.5);
  return g;
}

// --- Hindernisse -------------------------------------------------------------------------

const TREE_SITES: Partial<Record<SiteId, 'pine' | 'leafy' | 'scraggly'>> = { lake: 'pine', farm: 'leafy', allotment: 'leafy', depot: 'scraggly', fuel: 'scraggly' };

export function buildTree(kind: 'pine' | 'leafy' | 'scraggly', variant: number, scale = 1): G {
  const g = new THREE.Group();
  const r = rnd(variant * 31 + 5);
  if (kind === 'pine') {
    const h = (3.4 + r() * 1.6) * scale;
    cyl(g, 0.09 * scale, 0.14 * scale, h * 0.35, mat('#4a3626'), 0, 0, 0, 6);
    const greens = ['#2f4a34', '#35523a', '#2a4430', '#3b5a40'];
    for (let i = 0; i < 4; i++) {
      const rad = (1.05 - i * 0.22) * scale * (0.9 + r() * 0.2);
      cone(g, rad, h * 0.36, mat(pickC(r, greens)), 0, h * (0.22 + i * 0.19), 0, 7);
    }
  } else if (kind === 'leafy') {
    const h = (1.6 + r() * 0.6) * scale;
    cyl(g, 0.1 * scale, 0.16 * scale, h, mat('#5a3f28'), 0, 0, 0, 6);
    const greens = ['#4f6b3a', '#5d7a42', '#46603a', '#6b7f45'];
    blob(g, 1.0 * scale, mat(pickC(r, greens)), 0, h + 0.7 * scale, 0);
    blob(g, 0.7 * scale, mat(pickC(r, greens)), 0.55 * scale, h + 0.3 * scale, 0.2 * scale);
    blob(g, 0.65 * scale, mat(pickC(r, greens)), -0.5 * scale, h + 0.45 * scale, -0.3 * scale);
  } else {
    const h = (1.8 + r() * 0.5) * scale;
    const t = cyl(g, 0.07 * scale, 0.12 * scale, h, mat('#4f3d2c'), 0, 0, 0, 5);
    t.rotation.z = (r() - 0.5) * 0.2;
    const greens = ['#5a6338', '#6b6a3a', '#4f5a34'];
    blob(g, 0.6 * scale, mat(pickC(r, greens)), 0.1, h + 0.25 * scale, 0);
    blob(g, 0.45 * scale, mat(pickC(r, greens)), -0.35 * scale, h - 0.1 * scale, 0.2);
  }
  return g;
}

export function buildBush(variant: number, scale = 1): G {
  const g = new THREE.Group();
  const r = rnd(variant * 19 + 2);
  const greens = ['#4f6b3a', '#5d6b3a', '#46603a', '#6b6a3a', '#3f5a34'];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) blob(g, (0.22 + r() * 0.22) * scale, mat(pickC(r, greens)), (r() - 0.5) * 0.6 * scale, (0.2 + r() * 0.2) * scale, (r() - 0.5) * 0.6 * scale);
  return g;
}

export function buildCarWreck(variant: number): G {
  const g = new THREE.Group();
  const r = rnd(variant * 23 + 1);
  const paint = pickC(r, ['#7a3b2c', '#4a5a6a', '#8a7a5a', '#5a6b4a', '#6e6a62']);
  box(g, 1.75, 0.55, 3.9, mat(paint), 0, 0.22, 0);
  box(g, 1.55, 0.5, 1.9, mat(paint), 0, 0.77, -0.2);
  box(g, 1.57, 0.36, 1.7, mat('#22262a'), 0, 0.82, -0.2);
  box(g, 1.6, 0.06, 0.6, mat('#3a3833'), 0, 0.77, 1.15);
  for (const z of [-1.3, 1.3]) for (const x of [-0.85, 0.85]) {
    const w = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10), mat('#1b1a18')), x, 0.26, z);
    w.rotation.z = Math.PI / 2;
  }
  box(g, 0.8, 0.3, 0.6, mat('#8a5a3a'), (r() - 0.5) * 0.6, 0.62, 0.9 + r() * 0.6);
  box(g, 0.7, 0.2, 0.9, mat('#8a5a3a'), (r() - 0.5) * 0.6, 0.98, -0.4);
  box(g, 1.7, 0.18, 0.12, mat(METAL), 0, 0.2, 1.98);
  box(g, 1.7, 0.18, 0.12, mat(METAL), 0, 0.2, -1.98);
  return g;
}

export function buildObstacle(kind: ObstacleKind, site: SiteId, variant: number): G {
  const r = rnd(variant * 29 + kind.length * 7);
  switch (kind) {
    case 'rubble':
      return buildRubble(2, 2, 100 + variant * 7);
    case 'debris': {
      const g = buildRubble(1, 1, 300 + variant * 5);
      return g;
    }
    case 'wreck':
      return buildCarWreck(variant);
    case 'tires': {
      const g = new THREE.Group();
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        cyl(g, 0.34, 0.34, 0.2, mat('#1f1e1c'), (r() - 0.5) * 0.08, i * 0.2, (r() - 0.5) * 0.08, 12);
        cyl(g, 0.17, 0.17, 0.205, mat('#3a3833'), (r() - 0.5) * 0.02, i * 0.2, 0, 10);
      }
      return g;
    }
    case 'trash': {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const b = blob(g, 0.28 + r() * 0.08, mat(pickC(r, ['#1d1f1c', '#2a3a2c', '#26282a'])), -0.6 + i * 0.4, 0.22, (r() - 0.5) * 0.3);
        b.scale.y = 0.8;
      }
      box(g, 0.35, 0.25, 0.3, mat('#9b7b4f'), 0.35, 0, 0.15, 0.5);
      return g;
    }
    case 'bush':
      return buildBush(variant);
    case 'hay': {
      const g = new THREE.Group();
      const h = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.85, 10), mat(pickC(r, ['#c9a85a', '#b89a52', '#d4b468']))), 0, 0.45, 0);
      h.rotation.z = Math.PI / 2;
      const band = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 10), mat('#8a6a3a')), 0.15, 0.45, 0);
      band.rotation.z = Math.PI / 2;
      return g;
    }
    case 'tree':
      return buildTree(TREE_SITES[site] ?? 'leafy', variant, 0.9);
    case 'deadTree': {
      const g = new THREE.Group();
      cyl(g, 0.08, 0.15, 2.6, mat('#5a5046'), 0, 0, 0, 5);
      for (let i = 0; i < 4; i++) {
        const b = box(g, 0.05, 0.9, 0.05, mat('#5a5046'), 0, 1.3 + i * 0.3, 0);
        b.rotation.set((r() - 0.5) * 1.6, r() * 6, 0.6 + r() * 0.5);
      }
      return g;
    }
    case 'rock': {
      const g = new THREE.Group();
      blob(g, 0.4, mat(pickC(r, ['#7a766e', '#6a665e', '#85807a'])), 0, 0.2, 0).scale.set(1.2, 0.7, 1);
      blob(g, 0.22, mat('#6e6a62'), 0.3, 0.1, 0.2);
      return g;
    }
    case 'driftwood': {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const l = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6 + r() * 0.3, 6), mat(pickC(r, ['#a89a84', '#9a8c76', '#b5a892']))), (r() - 0.5) * 0.2, 0.1 + i * 0.06, -0.25 + i * 0.25);
        l.rotation.set(0, (r() - 0.5) * 0.4, Math.PI / 2);
      }
      return g;
    }
    case 'barrels': {
      const g = new THREE.Group();
      cyl(g, 0.28, 0.28, 0.85, mat(pickC(r, ['#7a3b24', '#3f5a7a', '#5a6b4a'])), -0.12, 0, -0.1, 10);
      cyl(g, 0.29, 0.29, 0.04, mat('#3a2a1e'), -0.12, 0.6, -0.1, 10);
      const b = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.8, 10), mat('#8a5a3a')), 0.15, 0.26, 0.22);
      b.rotation.set(0, 0.6, Math.PI / 2);
      return g;
    }
    case 'compost': {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        box(g, 0.9, 0.55, 0.05, mat(WOOD_DARK), 0, 0, s * 0.42);
        box(g, 0.05, 0.55, 0.9, mat(WOOD_DARK), s * 0.42, 0, 0);
      }
      blob(g, 0.4, mat('#4a3a26'), 0, 0.5, 0).scale.set(1, 0.6, 1);
      blob(g, 0.14, mat('#6b7f45'), 0.15, 0.68, 0.1);
      return g;
    }
    case 'cart': {
      const g = new THREE.Group();
      box(g, 1.5, 0.08, 0.75, mat(WOOD), 0, 0.5, 0);
      for (const s of [-1, 1]) box(g, 1.5, 0.3, 0.05, mat(WOOD_DARK), 0, 0.55, s * 0.36);
      for (const x of [-0.5, 0.5])
        for (const s of [-1, 1]) {
          const w = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10), mat('#4a3626')), x, 0.3, s * 0.42);
          w.rotation.x = Math.PI / 2;
        }
      const handle = box(g, 0.9, 0.05, 0.05, mat(WOOD_DARK), 1.1, 0.25, 0);
      handle.rotation.z = 0.5;
      return g;
    }
  }
}
