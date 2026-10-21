// Die Umgebung rund um das Gelände, je nach Schauplatz: Betriebshof, Bauernhof, Seeufer,
// Tankstelle, Schrebergarten. Alles aus einfachen Formen und einmal verschmolzen.
// Weltkoordinaten: das Gelände liegt bei x, z zwischen -HALF und HALF (36 m). Süden ist +z.

import * as THREE from 'three';
import { PLOT, type SiteId } from '../core/building';
import { Assembler, bake, GLOW, LIT } from './bake';
import { add, blob, box, cone, cyl, mat, METAL, WOOD, WOOD_DARK } from './models';
import { buildBush, buildCarWreck, buildTree } from './structures';

type G = THREE.Group;
const HALF = PLOT / 2;
/** Das Gelände war früher 36 m groß; feste Plätze draußen rücken um so viel nach außen. */
const GROW = HALF - 18;
/** Punkt von früher nach außen schieben (nur, was außerhalb des alten Geländes lag). */
const o = (v: number) => (Math.abs(v) >= 18 ? v + Math.sign(v) * GROW : v);

function rnd(seed: number) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}
const pickC = (r: () => number, l: string[]) => l[Math.floor(r() * l.length)];

/** Liegt ein Punkt (mit Rand) auf dem Gelände? */
const onPlot = (x: number, z: number, m = 2) => Math.abs(x) < HALF + m && Math.abs(z) < HALF + m;

function put(parent: G, child: THREE.Object3D, x: number, z: number, ry = 0, y = 0) {
  child.position.set(x, y, z);
  child.rotation.y = ry;
  parent.add(child);
  return child;
}

// --- Bausteine -----------------------------------------------------------------------------

function house(w: number, d: number, h: number, wall: string, roof: string, broken: number, seed: number): G {
  const g = new THREE.Group();
  const r = rnd(seed);
  box(g, w, h, d, mat(wall), 0, 0, 0);
  // dunkle Fensterlöcher
  for (const side of [-1, 1]) {
    for (let x = -w / 2 + 1.2; x < w / 2 - 0.8; x += 1.8) {
      if (r() < 0.2) continue;
      box(g, 0.8, 1.0, 0.06, mat('#1f1e1c'), x, h * 0.45, side * (d / 2 + 0.01));
    }
  }
  // Satteldach (ein Teil eingestürzt)
  const rise = Math.min(w, d) * 0.35;
  const slope = Math.atan2(rise, d / 2);
  const len = Math.hypot(rise, d / 2) + 0.3;
  for (const s of [-1, 1]) {
    if (broken > 0 && s === 1 && r() < broken) continue;
    const p = box(g, w + 0.4, 0.14, len, mat(roof), 0, 0, 0);
    p.position.set(0, h + rise / 2, (s * d) / 4);
    p.rotation.x = s * slope;
  }
  // Giebel als Dreiecksprisma
  const gable = new THREE.CylinderGeometry(1, 1, w, 3, 1, false, Math.PI / 2);
  gable.rotateZ(Math.PI / 2);
  gable.scale(1, rise / 1.5, d / 2 / 0.866);
  gable.translate(0, h + rise / 3, 0);
  add(g, new THREE.Mesh(gable, mat(wall)));
  return g;
}

function ruinBlock(w: number, d: number, h: number, seed: number): G {
  const g = new THREE.Group();
  const r = rnd(seed);
  const wall = pickC(r, ['#5a5650', '#4f4b46', '#625d55', '#56524c']);
  box(g, w, h, d, mat(wall), 0, 0, 0);
  // abgebrochene Oberkante
  for (let i = 0; i < 4; i++) {
    const bw = w * (0.2 + r() * 0.4);
    box(g, bw, 1 + r() * 3, d * (0.4 + r() * 0.6), mat(wall), (r() - 0.5) * (w - bw), h, (r() - 0.5) * d * 0.4);
  }
  for (let y = 2; y < h - 1; y += 3)
    for (let x = -w / 2 + 1.5; x < w / 2 - 1; x += 2.5) {
      if (r() < 0.25) continue;
      box(g, 1.1, 1.4, 0.08, mat('#1c1b19'), x, y, d / 2 + 0.01);
      box(g, 1.1, 1.4, 0.08, mat('#1c1b19'), x, y, -d / 2 - 0.01);
    }
  return g;
}

function lampPost(): G {
  const g = new THREE.Group();
  cyl(g, 0.08, 0.1, 5, mat('#4a524a'), 0, 0, 0, 6);
  box(g, 0.1, 0.1, 1.2, mat('#4a524a'), 0, 4.9, 0.5);
  box(g, 0.3, 0.14, 0.5, mat('#3b3f3a'), 0, 4.8, 1.0);
  return g;
}

function fenceRun(g: G, x0: number, z0: number, x1: number, z1: number, kind: 'chain' | 'wood', seed: number, gaps = 0.2) {
  const r = rnd(seed);
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 2.5));
  const ang = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i < n; i++) {
    if (r() < gaps) continue;
    const t = (i + 0.5) / n;
    const seg = new THREE.Group();
    if (kind === 'chain') {
      cyl(seg, 0.04, 0.04, 1.8, mat('#6e746e'), 0, 0, -len / n / 2, 5);
      const mesh = box(seg, 0.03, 1.5, len / n, mat('#7a7f78'), 0, 0.15, 0);
      mesh.castShadow = false;
      if (r() < 0.3) mesh.rotation.x = (r() - 0.5) * 0.4;
    } else {
      box(seg, 0.12, 1.2, 0.12, mat(WOOD_DARK), 0, 0, -len / n / 2);
      for (const y of [0.4, 0.9]) box(seg, 0.06, 0.1, len / n, mat(WOOD), 0, y, 0);
    }
    put(g, seg, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, ang);
  }
}

function field(g: G, x0: number, z0: number, x1: number, z1: number, seed: number, crop: 'furrow' | 'wheat' | 'green') {
  const r = rnd(seed);
  const colors = crop === 'furrow' ? ['#5a4632', '#6b553a'] : crop === 'wheat' ? ['#a89050', '#b89c58'] : ['#5d7a42', '#4f6b3a'];
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const w = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const span = along ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
  const n = Math.floor(span / 1.2);
  for (let i = 0; i < n; i++) {
    const c = colors[i % 2];
    const off = Math.min(along ? z0 : x0, along ? z1 : x1) + i * 1.2 + 0.6;
    const hh = crop === 'wheat' ? 0.5 + r() * 0.1 : 0.12;
    if (along) box(g, w, hh, 0.8, mat(c), (x0 + x1) / 2, -0.05, off).castShadow = crop === 'wheat';
    else box(g, 0.8, hh, w, mat(c), off, -0.05, (z0 + z1) / 2).castShadow = crop === 'wheat';
  }
}

function busWreck(seed: number): G {
  const g = new THREE.Group();
  const r = rnd(seed);
  const body = pickC(r, ['#8a7a5a', '#7a6d55', '#6e5a40', '#5a5a52']);
  box(g, 2.5, 2.5, 11, mat(body), 0, 0.25, 0);
  box(g, 2.54, 0.9, 9.4, mat('#1f1e1c'), 0, 1.35, -0.2);
  box(g, 2.3, 0.08, 10.8, mat('#6a6458'), 0, 2.75, 0);
  for (let i = 0; i < 5; i++) box(g, 1.2 + r() * 1.5, 0.6 + r(), 0.06, mat('#8a5a3a'), (r() - 0.5) * 0.6, 0.4 + r() * 1.4, (r() - 0.5) * 9).position.x = (r() < 0.5 ? -1 : 1) * 1.28;
  for (const z of [-3.6, 3.6]) for (const x of [-1.2, 1.2]) {
    const w = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), mat('#161614')), x, 0.35, z);
    w.rotation.z = Math.PI / 2;
  }
  return g;
}

function shelter(): G {
  const g = new THREE.Group();
  for (const x of [-1.4, 1.4]) cyl(g, 0.06, 0.06, 2.5, mat(METAL), x, 0, -0.6, 6);
  box(g, 3.2, 0.1, 1.6, mat('#5a5e5c'), 0, 2.5, -0.2);
  box(g, 2.9, 1.6, 0.04, mat('#8fa2a8'), 0, 0.6, -0.65);
  box(g, 2.2, 0.08, 0.4, mat(WOOD), 0, 0.45, -0.4);
  cyl(g, 0.05, 0.05, 2.8, mat(METAL), 1.9, 0, 0, 6);
  const sign = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), mat('#2f6b3c')), 1.9, 2.75, 0);
  sign.rotation.x = Math.PI / 2;
  box(g, 0.32, 0.22, 0.05, mat('#e6c13a'), 1.9, 2.64, 0.02);
  return g;
}

function laube(seed: number): G {
  const g = new THREE.Group();
  const r = rnd(seed);
  const wall = pickC(r, ['#7a9a8a', '#c9b88a', '#a86a5a', '#8a9ab0', '#b0a070']);
  const shed = house(3.2, 2.6, 2.1, wall, pickC(r, ['#5a4632', '#6e2e22', '#4a4a46']), 0.15, seed);
  g.add(shed);
  box(g, 0.8, 1.7, 0.06, mat(WOOD_DARK), 0.6, 0, 1.32);
  box(g, 0.7, 0.6, 0.06, mat('#3a4448'), -0.8, 1.0, 1.32);
  return g;
}

function scatter(r: () => number, n: number, rMin: number, rMax: number, ok: (x: number, z: number) => boolean, fn: (x: number, z: number, i: number) => void) {
  let placed = 0;
  for (let tries = 0; placed < n && tries < n * 8; tries++) {
    const a = r() * Math.PI * 2;
    const d = rMin + Math.sqrt(r()) * (rMax - rMin);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (onPlot(x, z, 3) || !ok(x, z)) continue;
    fn(x, z, placed++);
  }
}

// --- Boden draußen -------------------------------------------------------------------------

const OUTER: Record<SiteId, string[]> = {
  depot: ['#4f4c46', '#56524b', '#4a4741', '#5a564d'],
  farm: ['#6b7240', '#73793f', '#646b3c', '#7a7a44'],
  lake: ['#3f4a2e', '#46502f', '#4a4a30', '#424c30'],
  fuel: ['#66683f', '#6e6e44', '#5f633c', '#727048'],
  allotment: ['#5f7038', '#667a3c', '#5a6a36', '#6a7a40'],
};
const FAR: Partial<Record<SiteId, string[]>> = {
  depot: ['#5a5a3a', '#606238', '#4f5434'],
};

function hillHeight(x: number, z: number) {
  const d = Math.max(Math.abs(x), Math.abs(z)) - HALF - 10;
  if (d <= 0) return 0;
  const k = Math.min(1, d / 30);
  return k * (Math.sin(x * 0.07) * Math.cos(z * 0.05) * 1.6 + Math.sin(x * 0.023 + z * 0.031) * 2.4 + 1.2);
}

function outerGround(site: SiteId): THREE.Mesh {
  const r = rnd(site.length * 97);
  const size = 280;
  const step = 2;
  const n = Math.round(size / step);
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const near = OUTER[site];
  const far = FAR[site] ?? near;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x0 = -size / 2 + i * step;
      const z0 = -size / 2 + j * step;
      const x1 = x0 + step;
      const z1 = z0 + step;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (onPlot(cx, cz, -1.5)) continue;
      const pal = Math.max(Math.abs(cx), Math.abs(cz)) < HALF + 22 ? near : far;
      const y = (x: number, z: number) => hillHeight(x, z) - 0.03;
      for (const tri of [
        [x0, z0, x0, z1, x1, z0],
        [x1, z0, x0, z1, x1, z1],
      ]) {
        c.set(pickC(r, pal));
        for (let k = 0; k < 6; k += 2) {
          pos.push(tri[k], y(tri[k], tri[k + 1]), tri[k + 1]);
          col.push(c.r, c.g, c.b);
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, LIT);
  mesh.receiveShadow = true;
  return mesh;
}

// --- Schauplätze ---------------------------------------------------------------------------

function depot(g: G, r: () => number) {
  // Die große Halle im Norden
  const hall = new THREE.Group();
  const wall = '#6a665c';
  box(hall, 30, 6, 0.6, mat(wall), 0, 0, -5);
  for (const x of [-15, 15]) box(hall, 0.6, 6, 10, mat(wall), x, 0, 0);
  for (let i = 0; i <= 6; i++) box(hall, 1.2, 6, 0.8, mat('#5f5b52'), -15 + i * 5, 0, 5);
  box(hall, 30.6, 1.2, 0.9, mat('#5f5b52'), 0, 5.6, 5);
  box(hall, 28, 5, 0.1, mat('#1d1c1a'), 0, 0, 4.4);
  for (let i = 0; i < 6; i++) {
    if (i === 2 || i === 4) {
      const p = box(hall, 5, 0.15, 10.4, mat('#5a5e5c'), -12.5 + i * 5, 6.4, 0);
      p.rotation.z = (r() - 0.5) * 0.5;
      p.position.y = 3 + r() * 2;
      continue;
    }
    box(hall, 5, 0.15, 10.4, mat(i % 2 ? '#5a5e5c' : '#646862'), -12.5 + i * 5, 6.4, 0);
  }
  for (let i = 0; i <= 6; i++) box(hall, 0.2, 0.4, 10, mat('#3b3f3a'), -15 + i * 5, 6.2, 0);
  box(hall, 9, 1.2, 0.2, mat('#2a2826'), 0, 6.8, 5.3);
  put(g, hall, 0, -HALF - 11);
  // Busse im Osten
  for (let i = 0; i < 3; i++) put(g, busWreck(11 + i), HALF + 7 + i * 4, -4 + i * 1.5, (r() - 0.5) * 0.15);
  // Ruinen im Westen
  for (let i = 0; i < 7; i++) put(g, ruinBlock(8 + r() * 8, 8 + r() * 6, 8 + r() * 16, 40 + i), -HALF - 26 - r() * 30, -40 + i * 13 + r() * 4, (r() - 0.5) * 0.3);
  // Zufahrt und Laternen
  box(g, 7, 0.04, 60, mat('#3a3936'), 8, -0.03, HALF + 30).receiveShadow = true;
  for (let z = HALF + 4; z < HALF + 60; z += 4) box(g, 0.15, 0.045, 1.8, mat('#c9c4b4'), 8, -0.03, z);
  for (let z = HALF + 4; z < HALF + 50; z += 14) put(g, lampPost(), 12, z, -Math.PI / 2);
  put(g, shelter(), 14.5, HALF + 3.2, Math.PI);
  // Zaun außen herum (mit Lücken)
  const F = HALF + 6;
  fenceRun(g, -F, -F, F, -F, 'chain', 1);
  fenceRun(g, -F, -F, -F, F, 'chain', 2);
  fenceRun(g, F, -F, F, F, 'chain', 3);
  fenceRun(g, -F, F, 3, F, 'chain', 4);
  fenceRun(g, 13, F, F, F, 'chain', 5);
  scatter(r, 6, HALF + 8, HALF + 32, (x, z) => !(x > 3 && x < 14 && z > 0), (x, z, i) => put(g, buildCarWreck(i), x, z, r() * 6));
  scatter(r, 18, HALF + 4, HALF + 42, () => true, (x, z, i) => put(g, i % 3 ? buildBush(i) : buildTree('scraggly', i), x, z, r() * 6));
}

function farm(g: G, r: () => number) {
  put(g, house(14, 10, 4.5, '#8a3a2a', '#4a3a2a', 0.8, 3), o(-30), o(-26), 0.1);
  const silo = new THREE.Group();
  cyl(silo, 2.2, 2.2, 11, mat('#8a8a80'), 0, 0, 0, 12);
  cone(silo, 2.4, 2, mat('#6a6a60'), 0, 11, 0, 12);
  for (let y = 2; y < 11; y += 2.5) cyl(silo, 2.25, 2.25, 0.15, mat('#8a5a3a'), 0, y, 0, 12);
  put(g, silo, o(-18), o(-34));
  put(g, house(10, 8, 3.2, '#c9bca0', '#6e2e22', 0.4, 7), o(-36), 6, Math.PI / 2);
  // Felder
  field(g, HALF + 6, -50, HALF + 60, -6, 1, 'furrow');
  field(g, HALF + 6, -2, HALF + 60, 40, 2, 'wheat');
  field(g, -60, HALF + 6, -8, HALF + 50, 3, 'green');
  field(g, -10, -HALF - 60, 30, -HALF - 8, 4, 'furrow');
  fenceRun(g, HALF + 5, -50, HALF + 5, 40, 'wood', 6, 0.15);
  fenceRun(g, -60, HALF + 5, -8, HALF + 5, 'wood', 7, 0.15);
  // Windrad
  const pump = new THREE.Group();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(pump, 0.12, 9.2, 0.12, mat('#6e746e'), x * 0.7, 0, z * 0.7);
    leg.rotation.set(-z * 0.08, 0, x * 0.08);
  }
  for (let y = 1.5; y < 9; y += 2) box(pump, 1.6 - y * 0.1, 0.08, 0.08, mat('#6e746e'), 0, y, 0);
  for (let i = 0; i < 12; i++) {
    const blade = box(pump, 0.3, 1.6, 0.04, mat('#a8a49a'), 0, 0, 0);
    blade.position.set(Math.sin((i / 12) * Math.PI * 2) * 0.9, 9.6 + Math.cos((i / 12) * Math.PI * 2) * 0.9, 0.5);
    blade.rotation.z = -(i / 12) * Math.PI * 2;
  }
  box(pump, 0.1, 0.8, 1.6, mat('#a8a49a'), 0, 9.2, -0.6);
  put(g, pump, o(-26), 16);
  // Traktor
  const t = new THREE.Group();
  box(t, 1.4, 1.0, 2.4, mat('#8a3a2a'), 0, 0.6, 0.3);
  box(t, 1.2, 1.3, 1.2, mat('#7a3b2c'), 0, 1.4, -0.6);
  box(t, 1.22, 0.8, 1.0, mat('#1f1e1c'), 0, 1.75, -0.6);
  for (const s of [-1, 1]) {
    const w = add(t, new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 10), mat('#1b1a18')), s * 0.9, 0.75, -0.7);
    w.rotation.z = Math.PI / 2;
    const f = add(t, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), mat('#1b1a18')), s * 0.8, 0.42, 1.2);
    f.rotation.z = Math.PI / 2;
  }
  put(g, t, o(24), o(-24), 0.7);
  // Heuballen im Feld, Bäume an der Zufahrt
  for (let i = 0; i < 9; i++) {
    const hb = new THREE.Group();
    const c = add(hb, new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10), mat('#c9a85a')), 0, 0.7, 0);
    c.rotation.z = Math.PI / 2;
    put(g, hb, HALF + 12 + r() * 40, 4 + r() * 32, r() * 3);
  }
  box(g, 5, 0.04, 60, mat('#7a6a4a'), 8, -0.03, HALF + 30);
  for (let z = HALF + 4; z < HALF + 60; z += 6) {
    put(g, buildTree('leafy', z), 3.5, z, r() * 6);
    put(g, buildTree('leafy', z + 1), 12.5, z + 3, r() * 6);
  }
  scatter(r, 14, HALF + 6, HALF + 42, (x, z) => x < HALF + 4 && !(x > 2 && x < 14 && z > 0), (x, z, i) => put(g, i % 2 ? buildBush(i) : buildTree('leafy', i + 30), x, z, r() * 6));
}

function lake(g: G, r: () => number, extras: THREE.Object3D[]) {
  const shoreZ = -HALF - 5;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 140), new THREE.MeshStandardMaterial({ color: '#2f4a52', roughness: 0.22, metalness: 0.15, flatShading: true }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.12, shoreZ - 70);
  water.receiveShadow = true;
  water.name = 'water';
  extras.push(water);
  // Sandstrand mit unregelmäßiger Kante
  for (let x = -90; x < 90; x += 6) box(g, 6.4, 0.06, 4 + r() * 3, mat(pickC(r, ['#b8a882', '#ad9e7a', '#c2b28c'])), x + 3, -0.08, shoreZ - 0.5);
  // Steg
  const jetty = new THREE.Group();
  for (let z = 0; z < 16; z += 0.5) box(jetty, 1.8, 0.07, 0.42, mat(pickC(r, [WOOD, WOOD_DARK, '#94734c'])), 0, 0.25, -z);
  for (let z = 0; z < 16; z += 2) for (const x of [-0.8, 0.8]) cyl(jetty, 0.07, 0.07, 1.2, mat('#4a3626'), x, -0.9, -z, 6);
  put(g, jetty, -4, shoreZ + 1);
  // Bootswrack
  const boat = new THREE.Group();
  const hull = add(boat, new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.2, 8, 1, false, 0, Math.PI), mat('#5a6b7a')), 0, 0.05, 0);
  hull.rotation.set(Math.PI / 2, 0, Math.PI);
  put(g, boat, 10, shoreZ - 1.5, 0.4);
  // Schilf
  for (let i = 0; i < 40; i++) {
    const x = -60 + r() * 120;
    if (Math.abs(x + 4) < 3) continue;
    const reed = new THREE.Group();
    for (let k = 0; k < 5; k++) cone(reed, 0.05, 1.2 + r() * 0.6, mat(pickC(r, ['#7a7a44', '#8a8450', '#6b6a3a'])), (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6, 4);
    put(g, reed, x, shoreZ - 3 - r() * 2);
  }
  // Berge hinter dem See
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Group();
    cone(m, 22 + r() * 16, 18 + r() * 22, mat(pickC(r, ['#4a5662', '#52606a', '#465260'])), 0, -1, 0, 7);
    put(g, m, -100 + i * 26 + r() * 8, shoreZ - 110 - r() * 20, r() * 3);
  }
  // Wald
  scatter(r, 260, HALF + 3, HALF + 67, (x, z) => z > shoreZ + 4 && !(x > 3 && x < 14 && z > 0), (x, z, i) => put(g, buildTree('pine', i, 0.8 + r() * 0.6), x, z, r() * 6, hillHeight(x, z)));
  scatter(r, 30, HALF + 3, HALF + 32, (_x, z) => z > shoreZ + 2, (x, z, i) => {
    const rock = new THREE.Group();
    blob(rock, 0.5 + r() * 0.8, mat(pickC(r, ['#7a766e', '#6a665e'])), 0, 0.2, 0).scale.y = 0.6;
    put(g, rock, x, z, i);
  });
  box(g, 4, 0.04, 60, mat('#6a5a40'), 8, -0.03, HALF + 30);
  // Hütte
  const cabin = new THREE.Group();
  for (let y = 0; y < 2.6; y += 0.3) {
    const l1 = add(cabin, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.4, 6), mat(y % 0.6 < 0.3 ? '#6b4a2e' : '#5a3f28')), 0, y + 0.16, -2);
    l1.rotation.z = Math.PI / 2;
    const l2 = add(cabin, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.4, 6), mat('#6b4a2e')), 0, y + 0.16, 2);
    l2.rotation.z = Math.PI / 2;
    const l3 = add(cabin, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 6), mat('#5a3f28')), -3, y + 0.31, 0);
    l3.rotation.x = Math.PI / 2;
  }
  put(g, cabin, o(-30), -6, 0.3);
}

function fuel(g: G, r: () => number) {
  // Landstraße im Süden
  box(g, 220, 0.04, 8, mat('#3a3936'), 0, -0.03, HALF + 8).receiveShadow = true;
  for (let x = -100; x < 100; x += 5) box(g, 2.4, 0.045, 0.18, mat('#d8d2c2'), x, -0.03, HALF + 8);
  // Zapfsäulen mit Vordach im Westen
  const st = new THREE.Group();
  for (const [x, z] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) box(st, 0.5, 4.4, 0.5, mat('#d8d2c2'), x, 0, z);
  box(st, 13, 0.6, 9, mat('#e8e2d0'), 0, 4.4, 0);
  box(st, 13.1, 0.3, 9.1, mat('#b0472f'), 0, 4.55, 0);
  for (const z of [-1.6, 1.6]) {
    box(st, 3.5, 0.2, 1.2, mat('#8a8476'), 0, 0, z);
    for (const x of [-1, 1]) {
      box(st, 0.6, 1.6, 0.5, mat('#c9c4b4'), x, 0.2, z);
      box(st, 0.5, 0.4, 0.52, mat('#b0472f'), x, 1.4, z);
    }
  }
  put(g, st, -HALF - 12, 2);
  const shop = new THREE.Group();
  box(shop, 10, 3.6, 7, mat('#c9c4b4'), 0, 0, 0);
  box(shop, 8, 1.8, 0.08, mat('#1f1e1c'), 0, 0.6, 3.52);
  box(shop, 10.2, 0.8, 0.3, mat('#b0472f'), 0, 3.1, 3.6);
  put(g, shop, -HALF - 14, -12);
  // Preisschild
  const pylon = new THREE.Group();
  box(pylon, 0.5, 7, 0.5, mat('#8a8476'), 0, 0, 0);
  box(pylon, 2.4, 3, 0.4, mat('#e8e2d0'), 0, 6, 0);
  box(pylon, 2.4, 0.8, 0.42, mat('#b0472f'), 0, 8.2, 0);
  for (let i = 0; i < 3; i++) box(pylon, 1.8, 0.45, 0.44, mat('#2a2826'), 0, 6.3 + i * 0.85, 0);
  put(g, pylon, -HALF - 3, HALF + 4);
  // Wracks auf der Straße
  for (let i = 0; i < 4; i++) put(g, buildCarWreck(i + 7), -60 + i * 32 + r() * 10, HALF + 6 + r() * 4, Math.PI / 2 + (r() - 0.5) * 0.8);
  // Felder im Norden, Bäume, Strommasten
  field(g, -40, -HALF - 50, 40, -HALF - 8, 9, 'wheat');
  for (let x = -90; x < 90; x += 16) {
    const pole = new THREE.Group();
    cyl(pole, 0.12, 0.16, 8, mat('#5a4632'), 0, 0, 0, 6);
    box(pole, 2.2, 0.15, 0.15, mat('#5a4632'), 0, 7.4, 0);
    put(g, pole, x, HALF + 14);
  }
  scatter(r, 22, HALF + 14, HALF + 52, (x, z) => z > HALF + 13 || x > HALF + 4, (x, z, i) => put(g, i % 3 ? buildTree('scraggly', i) : buildBush(i), x, z, r() * 6));
}

function allotment(g: G, r: () => number) {
  const cell = 14;
  for (let gx = -5; gx <= 5; gx++)
    for (let gz = -5; gz <= 5; gz++) {
      if (Math.abs(gx) <= 1 && Math.abs(gz) <= 1) continue;
      const cx = gx * cell;
      const cz = gz * cell;
      if (onPlot(cx, cz, 4)) continue;
      const seed = (gx + 5) * 31 + (gz + 5) * 7;
      const rr = rnd(seed);
      const garden = new THREE.Group();
      // Hecke außen herum
      for (const s of [-1, 1]) {
        box(garden, cell - 2.2, 1.1 + rr() * 0.4, 0.8, mat(pickC(rr, ['#3f5a34', '#46603a'])), 0, 0, s * (cell / 2 - 1.2));
        box(garden, 0.8, 1.1 + rr() * 0.4, cell - 2.2, mat(pickC(rr, ['#3f5a34', '#46603a'])), s * (cell / 2 - 1.2), 0, 0);
      }
      put(garden, laube(seed), (rr() - 0.5) * 4, -2.5, (rr() - 0.5) * 0.4);
      for (let i = 0; i < 3; i++) {
        box(garden, 3, 0.35, 1, mat('#6b4a2e'), -2 + i * 2.2 - 1, 0, 3);
        for (let k = 0; k < 4; k++) blob(garden, 0.22, mat(pickC(rr, ['#5d7a42', '#6b7f45', '#c4772e'])), -3.2 + i * 2.2 + k * 0.7, 0.5, 3);
      }
      if (rr() < 0.7) put(garden, buildTree('leafy', seed, 0.7), 3.5, 1);
      put(g, garden, cx, cz);
    }
  // Kieswege
  for (const s of [-1, 1]) {
    box(g, 2, 0.03, 180, mat('#a0957e'), s * (HALF + 5), -0.02, 0);
    box(g, 180, 0.03, 2, mat('#a0957e'), 0, -0.02, s * (HALF + 5));
  }
  box(g, 3, 0.03, 40, mat('#a0957e'), 8, -0.02, HALF + 20);
  // Vereinsheim
  put(g, house(12, 8, 3.2, '#c9b88a', '#5a4632', 0.2, 77), -30, HALF + 12, 0);
  scatter(r, 10, HALF + 30, HALF + 52, () => true, (x, z, i) => put(g, buildTree('leafy', i + 50), x, z, r() * 6));
}

// --- Zusammenbauen -------------------------------------------------------------------------

export interface Environment {
  group: THREE.Group;
  dispose(): void;
}

export function buildEnvironment(site: SiteId): Environment {
  const r = rnd(site.length * 131 + site.charCodeAt(0));
  const g = new THREE.Group();
  const extras: THREE.Object3D[] = [];
  if (site === 'depot') depot(g, r);
  else if (site === 'farm') farm(g, r);
  else if (site === 'lake') lake(g, r, extras);
  else if (site === 'fuel') fuel(g, r);
  else allotment(g, r);

  const t = bake(g);
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  const out = new THREE.Group();
  const lit = new Assembler();
  lit.add(t.lit, new THREE.Matrix4());
  const glow = new Assembler();
  glow.add(t.glow, new THREE.Matrix4());
  const lm = lit.mesh(LIT);
  if (lm) out.add(lm);
  const gm = glow.mesh(GLOW, false);
  if (gm) out.add(gm);
  out.add(outerGround(site));
  for (const e of extras) out.add(e);
  return {
    group: out,
    dispose() {
      out.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    },
  };
}
