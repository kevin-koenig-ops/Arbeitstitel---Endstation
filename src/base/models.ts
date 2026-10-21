// Low-Poly-Modelle für das Zuhause, aus einfachen Formen gebaut.
// Maße in Metern. Jedes Modell steht mittig auf dem Ursprung; Breite entlang x,
// Tiefe entlang z (Rückseite bei -z), so wie die Grundfläche in furniture.ts.

import * as THREE from 'three';
import type { FurnitureId } from '../core/furniture';
import type { KramId } from '../core/types';
import { softBox } from './softBox';

export const WOOD = '#8a6a45';
export const WOOD_DARK = '#6b5034';
export const METAL = '#3b3f3a';

const mats = new Map<string, THREE.Material>();

/** Matte, flach schattierte Farbe (wird geteilt). */
export function mat(color: string, opts: { emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.opacity ?? ''}`;
  let m = mats.get(key);
  if (!m) {
    const params: THREE.MeshStandardMaterialParameters = { color, roughness: 0.88, metalness: 0.02, flatShading: true };
    if (opts.emissive) {
      params.emissive = new THREE.Color(opts.emissive);
      params.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    if (opts.transparent) {
      params.transparent = true;
      params.opacity = opts.opacity ?? 1;
    }
    m = new THREE.MeshStandardMaterial(params);
    mats.set(key, m);
  }
  return m;
}

/** Leuchtende Fläche ohne Licht-Berechnung (Flammen, Glühbirnen, Displays). */
export function glow(color: string) {
  const key = `glow|${color}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    m.userData.glow = true;
    mats.set(key, m);
  }
  return m;
}

type M = THREE.Material;

export function add(g: THREE.Object3D, mesh: THREE.Mesh, x = 0, y = 0, z = 0, ry = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** Quader; y ist die Unterkante. */
export function box(g: THREE.Object3D, w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0, ry = 0) {
  return add(g, new THREE.Mesh(softBox(w, h, d), m), x, y + h / 2, z, ry);
}

/** Feinere Polygone: Rundungen bekommen mehr Segmente (der Low-Poly-Stil bleibt). */
export const DETAIL = 1.6;
const segs = (n: number) => Math.max(n, Math.round(n * DETAIL));

/** Zylinder; y ist die Unterkante. */
export function cyl(g: THREE.Object3D, rTop: number, rBot: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 8) {
  return add(g, new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs(seg)), m), x, y + h / 2, z);
}

export function blob(g: THREE.Object3D, r: number, m: M, x: number, y: number, z: number) {
  const mesh = add(g, new THREE.Mesh(new THREE.IcosahedronGeometry(r, r > 0.12 ? 1 : 0), m), x, y, z);
  mesh.rotation.set(x * 3.1, y * 2.3, z * 1.7);
  return mesh;
}


/** Kegel (Flamme, Blatt, Hut); y ist die Unterkante. */
export function cone(g: THREE.Object3D, r: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 6) {
  return add(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, segs(seg)), m), x, y + h / 2, z);
}

/** Flamme, die flackert (wird nicht mit verschmolzen). */
function flame(g: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  const f1 = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.2 * s, 0.5 * s, 5), glow('#ff8a2a')), x, y + 0.25 * s, z);
  const f2 = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.32 * s, 5), glow('#ffd27a')), x + 0.05 * s, y + 0.16 * s, z + 0.03 * s);
  f1.castShadow = f2.castShadow = false;
  f1.name = f2.name = 'flame';
}

export interface LightSpec {
  color: string;
  intensity: number;
  distance: number;
  y: number;
  flicker?: boolean;
}

export interface Model {
  group: THREE.Group;
  light?: LightSpec;
}

const BUILDERS: Record<FurnitureId, (g: THREE.Group) => LightSpec | void> = {
  bench(g) {
    const frame = mat('#4f6b4f');
    for (const x of [-0.8, 0.8]) {
      box(g, 0.06, 0.45, 0.4, frame, x, 0, 0.05);
      box(g, 0.06, 0.9, 0.06, frame, x, 0, -0.17);
    }
    for (const z of [-0.08, 0.06, 0.2]) box(g, 1.8, 0.05, 0.11, mat(WOOD), 0, 0.45, z);
    for (const y of [0.6, 0.76]) box(g, 1.8, 0.11, 0.05, mat(WOOD), 0, y, -0.2);
  },
  crates(g) {
    box(g, 0.8, 0.6, 0.8, mat('#9b7b4f'), 0, 0, 0);
    box(g, 0.82, 0.06, 0.82, mat(WOOD_DARK), 0, 0.27, 0);
    box(g, 0.55, 0.45, 0.55, mat('#8a6b40'), 0.05, 0.6, -0.05, 0.4);
    box(g, 0.3, 0.25, 0.4, mat('#6e5a3a'), -0.2, 1.05, 0.05, -0.3);
  },
  fireBarrel(g) {
    cyl(g, 0.32, 0.3, 0.88, mat('#7a3b24'), 0, 0, 0, 10);
    for (const y of [0.2, 0.62]) cyl(g, 0.335, 0.335, 0.05, mat('#5a2a18'), 0, y, 0, 10);
    flame(g, 0, 0.86, 0);
    return { color: '#ff9a4a', intensity: 9, distance: 7, y: 1.3, flicker: true };
  },
  mattress(g) {
    box(g, 1.9, 0.22, 0.9, mat('#b9b2a0'), 0, 0, 0);
    box(g, 0.45, 0.12, 0.6, mat('#d8d2c2'), -0.68, 0.22, 0);
    box(g, 1.1, 0.06, 0.94, mat('#5d6b4a'), 0.38, 0.2, 0);
  },
  rug(g) {
    box(g, 1.9, 0.02, 1.9, mat('#7a2f2a'), 0, 0, 0).castShadow = false;
    box(g, 1.5, 0.025, 1.5, mat('#8f4a33'), 0, 0, 0).castShadow = false;
    box(g, 0.6, 0.03, 0.6, mat('#b08a4a'), 0, 0, 0, Math.PI / 4).castShadow = false;
  },
  plant(g) {
    cyl(g, 0.26, 0.2, 0.42, mat('#6b4a35'), 0, 0, 0, 8);
    blob(g, 0.3, mat('#4f6b3a'), 0, 0.68, 0);
    blob(g, 0.22, mat('#5d7a42'), 0.14, 0.92, 0.05);
    blob(g, 0.18, mat('#46603a'), -0.12, 0.86, -0.08);
  },
  table(g) {
    box(g, 0.9, 0.06, 0.9, mat(WOOD), 0, 0.72, 0);
    for (const x of [-0.38, 0.38]) for (const z of [-0.38, 0.38]) box(g, 0.06, 0.72, 0.06, mat(WOOD_DARK), x, 0, z);
    box(g, 0.2, 0.12, 0.14, mat('#a8a49a'), 0.15, 0.78, 0.1);
    cyl(g, 0.06, 0.06, 0.12, mat('#b0472f'), -0.2, 0.78, -0.12, 8);
  },
  chair(g) {
    box(g, 0.45, 0.05, 0.45, mat(WOOD), 0, 0.44, 0.05);
    for (const x of [-0.19, 0.19]) for (const z of [-0.14, 0.24]) box(g, 0.04, 0.44, 0.04, mat(WOOD_DARK), x, 0, z);
    box(g, 0.45, 0.5, 0.05, mat(WOOD), 0, 0.5, -0.17);
  },
  sofa(g) {
    const fabric = mat('#5d6b7a');
    box(g, 1.9, 0.38, 0.85, fabric, 0, 0.06, 0);
    for (const x of [-0.45, 0.45]) box(g, 0.86, 0.14, 0.62, mat('#6d7b8a'), x, 0.44, 0.08);
    box(g, 1.9, 0.52, 0.22, fabric, 0, 0.42, -0.32);
    for (const x of [-0.88, 0.88]) box(g, 0.18, 0.62, 0.85, fabric, x, 0.06, 0);
    box(g, 0.3, 0.02, 0.25, mat('#7a5a3a'), 0.5, 0.59, 0.1);
    for (const x of [-0.85, 0.85]) for (const z of [-0.35, 0.35]) box(g, 0.06, 0.06, 0.06, mat(METAL), x, 0, z);
  },
  shelf(g) {
    for (const x of [-0.43, 0.43]) box(g, 0.05, 1.8, 0.4, mat(WOOD_DARK), x, 0, 0);
    for (const y of [0.05, 0.5, 0.95, 1.4, 1.76]) box(g, 0.9, 0.04, 0.4, mat(WOOD), 0, y, 0);
    const colors = ['#7a3a2e', '#3f4b57', '#c9a23a', '#4f6b4f', '#8a857a', '#5a3a5a'];
    let i = 0;
    for (const y of [0.09, 0.54, 0.99]) {
      let x = -0.36;
      while (x < 0.33) {
        const w = 0.06 + ((i * 37) % 5) * 0.012;
        const h = 0.28 + ((i * 53) % 4) * 0.03;
        box(g, w, h, 0.26, mat(colors[i % colors.length]), x + w / 2, y, 0.02);
        x += w + 0.01;
        i++;
      }
    }
  },
  toolwall(g) {
    box(g, 1.8, 0.07, 0.6, mat(WOOD), 0, 0.85, 0.08);
    for (const x of [-0.82, 0.82]) for (const z of [-0.12, 0.3]) box(g, 0.06, 0.85, 0.06, mat(WOOD_DARK), x, 0, z);
    box(g, 1.8, 1.1, 0.05, mat('#7a6a52'), 0, 0.92, -0.27);
    const tool = mat('#9a9a94');
    box(g, 0.05, 0.4, 0.03, tool, -0.6, 1.3, -0.23);
    box(g, 0.2, 0.06, 0.03, tool, -0.6, 1.66, -0.23);
    box(g, 0.05, 0.35, 0.03, mat('#b0472f'), -0.3, 1.25, -0.23);
    box(g, 0.16, 0.08, 0.04, tool, -0.3, 1.58, -0.23);
    box(g, 0.5, 0.18, 0.02, tool, 0.2, 1.4, -0.23);
    box(g, 0.08, 0.3, 0.03, mat('#c4772e'), 0.62, 1.3, -0.23);
    box(g, 0.25, 0.14, 0.18, mat('#9b3d27'), 0.5, 0.92, 0.12);
    box(g, 0.12, 0.1, 0.25, mat(METAL), -0.4, 0.92, 0.1);
  },
  lamp(g) {
    cyl(g, 0.2, 0.22, 0.04, mat(METAL), 0, 0, 0, 10);
    cyl(g, 0.025, 0.025, 1.45, mat(METAL), 0, 0.04, 0, 6);
    const shade = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 0.32, 10, 1), mat('#c9a86a', { emissive: '#ffcf7a', emissiveIntensity: 0.6 })), 0, 1.5, 0);
    shade.castShadow = false;
    add(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow('#fff1c4')), 0, 1.42, 0).castShadow = false;
    return { color: '#ffd59a', intensity: 8, distance: 7, y: 1.4 };
  },
  raisedBed(g) {
    const wood = mat('#7a5a3a');
    box(g, 1.8, 0.6, 0.08, wood, 0, 0, -0.36);
    box(g, 1.8, 0.6, 0.08, wood, 0, 0, 0.36);
    box(g, 0.08, 0.6, 0.8, wood, -0.86, 0, 0);
    box(g, 0.08, 0.6, 0.8, wood, 0.86, 0, 0);
    box(g, 1.66, 0.04, 0.66, mat('#3b2f22'), 0, 0.54, 0);
    const leaf = mat('#5d7a42');
    for (let i = 0; i < 6; i++) {
      const x = -0.65 + i * 0.26;
      blob(g, 0.13 + (i % 2) * 0.04, leaf, x, 0.72, (i % 2 ? 0.12 : -0.12));
      if (i % 2) add(g, new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#b0472f')), x + 0.06, 0.74, 0.2);
    }
  },
  clock(g) {
    const green = mat('#2f4a3c');
    cyl(g, 0.16, 0.2, 0.08, green, 0, 0, 0, 8);
    cyl(g, 0.045, 0.045, 2.3, green, 0, 0.08, 0, 8);
    const body = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 28), green), 0, 2.55, 0);
    body.rotation.x = Math.PI / 2;
    for (const z of [-0.075, 0.075]) {
      const face = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.01, 28), mat('#efe9da')), 0, 2.55, z);
      face.rotation.x = Math.PI / 2;
      // Zeiger: fünf vor zwölf
      const s = Math.sign(z);
      box(g, 0.025, 0.24, 0.01, mat('#1a1a18'), 0, 2.55, z + s * 0.01);
      const m = box(g, 0.02, 0.17, 0.01, mat('#1a1a18'), -0.04, 2.52, z + s * 0.01);
      m.rotation.z = 0.5;
    }
  },
  timetable(g) {
    for (const x of [-0.36, 0.36]) box(g, 0.05, 1.7, 0.05, mat(METAL), x, 0, 0);
    box(g, 0.8, 0.95, 0.04, mat('#c9a23a'), 0, 0.7, 0.01);
    box(g, 0.68, 0.8, 0.02, mat('#e8e2d0'), 0, 0.77, 0.04);
    for (let i = 0; i < 6; i++) box(g, 0.5 - (i % 3) * 0.08, 0.025, 0.01, mat('#3a3833'), -0.02, 0.95 + i * 0.1, 0.055);
    const sign = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 18), mat('#2f6b3c')), 0, 1.95, 0);
    sign.rotation.x = Math.PI / 2;
    box(g, 0.05, 0.22, 0.02, mat('#e6c13a'), -0.06, 1.84, 0.02);
    box(g, 0.05, 0.22, 0.02, mat('#e6c13a'), 0.06, 1.84, 0.02);
    box(g, 0.14, 0.04, 0.02, mat('#e6c13a'), 0, 1.93, 0.02);
    box(g, 0.05, 0.3, 0.05, mat(METAL), 0, 1.65, -0.02);
  },
  vending(g) {
    box(g, 0.85, 1.8, 0.75, mat('#9b2f2a'), 0, 0, 0);
    const panel = add(g, new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.05, 0.02), glow('#ffdca8')), -0.08, 1.1, 0.38);
    panel.castShadow = false;
    for (let i = 0; i < 4; i++) box(g, 0.45, 0.02, 0.03, mat('#9b2f2a'), -0.08, 0.66 + i * 0.25, 0.39);
    box(g, 0.12, 0.5, 0.03, mat('#2a2826'), 0.3, 1.0, 0.38);
    box(g, 0.5, 0.12, 0.04, mat('#1d1c1a'), -0.05, 0.2, 0.37);
    return { color: '#ffd8a8', intensity: 4, distance: 5, y: 1.1 };
  },
  fridge(g) {
    box(g, 0.75, 1.75, 0.7, mat('#d8d2c2'), 0, 0, 0);
    box(g, 0.76, 0.02, 0.71, mat('#a8a294'), 0, 1.15, 0);
    box(g, 0.04, 0.35, 0.04, mat('#8a857a'), 0.28, 1.25, 0.37);
    box(g, 0.04, 0.25, 0.04, mat('#8a857a'), 0.28, 0.8, 0.37);
    box(g, 0.25, 0.18, 0.01, mat('#8a5a3a'), -0.15, 0.3, 0.355);
  },
  fairyLights(g) {
    for (const x of [-0.9, 0.9]) box(g, 0.06, 2.0, 0.06, mat(WOOD_DARK), x, 0, 0);
    const bulbs = ['#ffd27a', '#ff9a66', '#fff1c4', '#9fe0a0'];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -0.9 + 1.8 * t;
      const y = 1.95 - Math.sin(t * Math.PI) * 0.35;
      if (i < N) {
        const nx = -0.9 + 1.8 * ((i + 1) / N);
        const ny = 1.95 - Math.sin(((i + 1) / N) * Math.PI) * 0.35;
        const seg = add(g, new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(nx - x, ny - y), 0.012, 0.012), mat('#1d1c1a')), (x + nx) / 2, (y + ny) / 2, 0);
        seg.rotation.z = Math.atan2(ny - y, nx - x);
        seg.castShadow = false;
      }
      if (i > 0 && i < N) add(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow(bulbs[i % bulbs.length])), x, y - 0.06, 0).castShadow = false;
    }
    return { color: '#ffcf8a', intensity: 5, distance: 5, y: 1.6 };
  },
  busSeat(g) {
    const fabric = mat('#3f5a7a');
    for (const x of [-0.45, 0.45]) {
      box(g, 0.82, 0.12, 0.46, fabric, x, 0.42, 0.06);
      box(g, 0.82, 0.68, 0.1, fabric, x, 0.5, -0.17);
      box(g, 0.6, 0.12, 0.12, mat('#4a6688'), x, 1.1, -0.17);
    }
    box(g, 1.75, 0.06, 0.06, mat('#c4772e'), 0, 1.25, -0.2);
    for (const x of [-0.8, 0.8]) box(g, 0.05, 0.42, 0.4, mat(METAL), x, 0, 0.04);
    box(g, 1.7, 0.05, 0.05, mat(METAL), 0, 0.12, 0.04);
  },
  radioSet(g) {
    // Funkgerät auf einem kleinen Tisch, mit Antenne und Kopfhörern
    for (const x of [-0.26, 0.26]) for (const z of [-0.18, 0.18]) box(g, 0.05, 0.62, 0.05, mat(WOOD_DARK), x, 0, z);
    box(g, 0.66, 0.05, 0.48, mat(WOOD), 0, 0.62, 0);
    box(g, 0.48, 0.26, 0.28, mat('#3d4438'), 0, 0.67, -0.04);
    box(g, 0.44, 0.2, 0.01, mat('#2a2f28'), 0, 0.7, 0.105);
    for (const x of [-0.13, 0.0]) cyl(g, 0.035, 0.035, 0.03, mat('#c9c3b5'), x, 0.79, 0.11, 10).rotation.x = Math.PI / 2;
    box(g, 0.12, 0.05, 0.01, glow('#ffb43a'), 0.14, 0.82, 0.112).castShadow = false;
    cyl(g, 0.008, 0.008, 0.9, mat('#8a8a84'), 0.2, 0.93, -0.12, 5).rotation.z = -0.25;
    box(g, 0.14, 0.04, 0.1, mat('#1f1f1d'), -0.2, 0.67, 0.18);
    cyl(g, 0.05, 0.05, 0.03, mat('#2a2826'), 0, 0.68, 0.16, 10);
    return { color: '#ffb43a', intensity: 1.2, distance: 2.5, y: 0.85 };
  },
  medCabinet(g) {
    for (const x of [-0.3, 0.3]) box(g, 0.05, 0.5, 0.05, mat(METAL), x, 0, 0);
    box(g, 0.7, 1.1, 0.38, mat('#e8e4dc'), 0, 0.5, 0);
    box(g, 0.02, 1.0, 0.01, mat('#bdb7ab'), 0, 0.55, 0.195);
    box(g, 0.32, 0.09, 0.01, mat('#a63a2a'), 0, 1.05, 0.2);
    box(g, 0.09, 0.32, 0.01, mat('#a63a2a'), 0, 0.94, 0.2);
  },
  bed(g) {
    box(g, 1.9, 0.3, 1.9, mat(WOOD_DARK), 0, 0, 0);
    box(g, 1.8, 0.2, 1.8, mat('#d8d2c2'), 0, 0.3, 0.02);
    box(g, 1.9, 0.95, 0.1, mat(WOOD), 0, 0, -0.92);
    for (const x of [-0.45, 0.45]) box(g, 0.7, 0.12, 0.38, mat('#ece6d8'), x, 0.5, -0.62);
    box(g, 1.84, 0.1, 1.15, mat('#5d6b8a'), 0, 0.48, 0.34);
    box(g, 1.86, 0.06, 0.2, mat('#7a8aa8'), 0, 0.56, -0.18);
    for (const x of [-0.9, 0.9]) box(g, 0.08, 0.5, 0.08, mat(WOOD_DARK), x, 0, 0.9);
  },
  workbench(g) {
    box(g, 1.85, 0.08, 0.72, mat(WOOD), 0, 0.84, 0);
    for (const x of [-0.82, 0.82]) for (const z of [-0.28, 0.28]) box(g, 0.08, 0.84, 0.08, mat(WOOD_DARK), x, 0, z);
    box(g, 1.7, 0.04, 0.6, mat(WOOD_DARK), 0, 0.25, 0);
    box(g, 0.22, 0.14, 0.2, mat(METAL), -0.68, 0.92, 0.18);
    box(g, 0.5, 0.012, 0.16, mat('#b5b5ad'), 0.15, 0.93, 0.05, 0.3);
    box(g, 0.12, 0.03, 0.04, mat('#9b3d27'), 0.48, 0.93, 0.08, 0.3);
    box(g, 0.05, 0.03, 0.3, mat('#6e5a3a'), 0.6, 0.93, -0.15);
    box(g, 0.14, 0.06, 0.06, mat(METAL), 0.6, 0.94, -0.3);
    for (let i = 0; i < 3; i++) box(g, 0.35, 0.18, 0.4, mat(i % 2 ? '#7a5a3a' : '#8a6b40'), -0.5 + i * 0.5, 0.29, 0);
  },
  hammock(g) {
    for (const x of [-1.35, 1.35]) {
      box(g, 0.12, 1.7, 0.12, mat(WOOD_DARK), x, 0, 0);
      const st = box(g, 0.08, 0.9, 0.08, mat(WOOD_DARK), x - Math.sign(x) * 0.25, 0, 0);
      st.rotation.z = Math.sign(x) * 0.5;
    }
    const cols = ['#c4772e', '#e6d6b0', '#3f5a7a'];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const x0 = -1.25 + 2.5 * t0;
      const x1 = -1.25 + 2.5 * t1;
      const y0 = 1.45 - Math.sin(t0 * Math.PI) * 0.6;
      const y1 = 1.45 - Math.sin(t1 * Math.PI) * 0.6;
      const seg = add(g, new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.02, 0.04, 0.7), mat(cols[i % cols.length])), (x0 + x1) / 2, (y0 + y1) / 2, 0);
      seg.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    }
  },
  kitchen(g) {
    box(g, 1.9, 0.82, 0.62, mat('#d8cfb8'), 0, 0, -0.15);
    box(g, 1.96, 0.05, 0.68, mat(WOOD), 0, 0.82, -0.14);
    for (const x of [-0.62, 0, 0.62]) box(g, 0.56, 0.68, 0.01, mat('#c4b99e'), x, 0.08, 0.165);
    for (const x of [-0.62, 0, 0.62]) box(g, 0.14, 0.03, 0.03, mat(METAL), x, 0.66, 0.18);
    box(g, 0.55, 0.06, 0.42, mat('#5a5e5c'), 0.45, 0.83, -0.14);
    cyl(g, 0.02, 0.02, 0.28, mat('#9a9a94'), 0.45, 0.86, -0.38, 6);
    box(g, 1.6, 0.04, 0.24, mat(WOOD), 0, 1.45, -0.36);
    const jars = ['#b0472f', '#c9a23a', '#4f6b4f', '#e8e2d0', '#7a3a2e'];
    for (let i = 0; i < 6; i++) cyl(g, 0.05, 0.05, 0.14 + (i % 2) * 0.04, mat(jars[i % jars.length]), -0.65 + i * 0.26, 1.49, -0.36, 6);
    box(g, 0.3, 0.1, 0.2, mat('#3a3833'), -0.5, 0.87, -0.2);
  },
  campfire(g) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      blob(g, 0.1 + (i % 3) * 0.015, mat(i % 2 ? '#7a7062' : '#5a5246'), Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.36);
    }
    for (let i = 0; i < 4; i++) {
      const log = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 6), mat(i % 2 ? '#5a3f28' : '#6b4a2e')), 0, 0.12, 0);
      log.rotation.set(Math.PI / 2 - 0.35, (i / 4) * Math.PI * 2, 0);
    }
    box(g, 0.3, 0.02, 0.3, glow('#ff7a2a'), 0, 0.02, 0).castShadow = false;
    flame(g, 0, 0.08, 0, 0.9);
    return { color: '#ff9a4a', intensity: 8, distance: 7, y: 0.7, flicker: true };
  },
  stove(g) {
    for (const x of [-0.22, 0.22]) for (const z of [-0.18, 0.18]) box(g, 0.05, 0.14, 0.05, mat('#2a2826'), x, 0, z);
    box(g, 0.6, 0.62, 0.52, mat('#33312e'), 0, 0.14, 0);
    box(g, 0.64, 0.05, 0.56, mat('#4a4743'), 0, 0.76, 0);
    box(g, 0.3, 0.22, 0.02, glow('#ff8a3a'), 0, 0.3, 0.265).castShadow = false;
    box(g, 0.36, 0.03, 0.03, mat('#4a4743'), 0, 0.54, 0.27);
    cyl(g, 0.07, 0.07, 1.9, mat('#2a2826'), 0.12, 0.81, -0.12, 8);
    cyl(g, 0.085, 0.085, 0.06, mat('#4a4743'), 0.12, 1.3, -0.12, 8);
    box(g, 0.14, 0.18, 0.14, mat('#5a3a28'), -0.42, 0, 0.1);
    return { color: '#ff9a4a', intensity: 5, distance: 6, y: 0.5, flicker: true };
  },
  streetLamp(g) {
    cyl(g, 0.12, 0.14, 0.2, mat(METAL), 0, 0, 0, 8);
    cyl(g, 0.05, 0.065, 3.1, mat('#4a524a'), 0, 0.2, 0, 8);
    box(g, 0.06, 0.06, 0.75, mat('#4a524a'), 0, 3.2, 0.3);
    box(g, 0.3, 0.12, 0.45, mat('#3b3f3a'), 0, 3.12, 0.62);
    box(g, 0.24, 0.02, 0.36, glow('#fff1c4'), 0, 3.1, 0.62).castShadow = false;
    return { color: '#ffe2a8', intensity: 12, distance: 10, y: 2.9 };
  },
  solarPanel(g) {
    for (const x of [-0.35, 0.35]) {
      box(g, 0.05, 0.8, 0.05, mat(METAL), x, 0, 0.25);
      box(g, 0.05, 0.4, 0.05, mat(METAL), x, 0, -0.25);
    }
    const p = box(g, 0.9, 0.04, 0.95, mat('#24324a'), 0, 0.55, 0);
    p.rotation.x = 0.5;
    for (let i = -1; i <= 1; i++) {
      const l = box(g, 0.012, 0.045, 0.92, mat('#8fa2b8'), i * 0.22, 0.555, 0);
      l.rotation.x = 0.5;
    }
    box(g, 0.25, 0.18, 0.15, mat('#5a5e5c'), 0, 0, -0.2);
  },
  poster(g) {
    box(g, 0.62, 0.86, 0.02, mat('#e8dcc0'), 0, 1.1, -0.43);
    box(g, 0.5, 0.36, 0.012, mat('#b0472f'), 0, 1.5, -0.418);
    box(g, 0.34, 0.08, 0.012, mat('#2a2826'), 0, 1.3, -0.418);
    box(g, 0.44, 0.05, 0.012, mat('#3f5a7a'), 0, 1.2, -0.418);
    box(g, 0.2, 0.2, 0.014, mat('#e6c13a'), 0.1, 1.55, -0.414);
  },
  picture(g) {
    box(g, 0.56, 0.44, 0.04, mat(WOOD_DARK), 0, 1.3, -0.43);
    box(g, 0.46, 0.34, 0.012, mat('#c8c0a8'), 0, 1.35, -0.405);
    box(g, 0.46, 0.14, 0.013, mat('#7a9aa8'), 0, 1.55, -0.404);
    const people = ['#7d3b2c', '#3d4b5c', '#c9a23a'];
    people.forEach((c, i) => {
      const x = -0.13 + i * 0.13;
      box(g, 0.08, 0.13, 0.014, mat(c), x, 1.36, -0.402);
      box(g, 0.05, 0.05, 0.014, mat('#d9b08a'), x, 1.5, -0.402);
    });
  },
  dartboard(g) {
    const rings: [number, string][] = [
      [0.24, '#2a2420'],
      [0.21, '#e8dcc0'],
      [0.16, '#2a2826'],
      [0.11, '#b0472f'],
      [0.06, '#4f6b4f'],
      [0.025, '#b0472f'],
    ];
    rings.forEach(([r, c], i) => {
      const d = add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 16), mat(c)), 0, 1.6, -0.44 + i * 0.006);
      d.rotation.x = Math.PI / 2;
    });
    const dart = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), mat('#e6c13a')), 0.05, 1.63, -0.34);
    dart.rotation.x = Math.PI / 2;
  },
  gnome(g) {
    cyl(g, 0.1, 0.12, 0.05, mat('#7a7062'), 0, 0, 0, 8);
    cyl(g, 0.09, 0.11, 0.2, mat('#3f5a7a'), 0, 0.05, 0, 8);
    cyl(g, 0.11, 0.1, 0.06, mat('#5a3a28'), 0, 0.23, 0, 8);
    blob(g, 0.075, mat('#e2b896'), 0, 0.33, 0.01);
    cone(g, 0.07, 0.14, mat('#ece6d8'), 0, 0.2, 0.06, 6).rotation.x = Math.PI;
    cone(g, 0.085, 0.24, mat('#b0472f'), 0, 0.37, -0.01, 6);
    box(g, 0.03, 0.03, 0.03, mat('#c46a5a'), 0, 0.33, 0.08);
  },
  washline(g) {
    for (const x of [-0.9, 0.9]) {
      box(g, 0.07, 1.7, 0.07, mat(WOOD_DARK), x, 0, 0);
      box(g, 0.07, 0.07, 0.5, mat(WOOD_DARK), x, 1.62, 0);
    }
    for (const z of [-0.18, 0.18]) box(g, 1.8, 0.012, 0.012, mat('#d8d2c2'), 0, 1.66, z).castShadow = false;
    const clothes: [number, number, number, number, string][] = [
      [-0.55, -0.18, 0.4, 0.5, '#c4772e'],
      [-0.05, -0.18, 0.3, 0.35, '#e8e2d0'],
      [0.45, -0.18, 0.45, 0.6, '#3f5a7a'],
      [-0.3, 0.18, 0.5, 0.42, '#7d3b2c'],
      [0.35, 0.18, 0.28, 0.3, '#9fbf8a'],
    ];
    for (const [x, z, w, h, c] of clothes) box(g, w, h, 0.02, mat(c), x, 1.66 - h, z);
  },
  rainBarrel(g) {
    cyl(g, 0.34, 0.31, 0.9, mat('#3f6b5a'), 0, 0, 0, 10);
    for (const y of [0.22, 0.65]) cyl(g, 0.35, 0.35, 0.04, mat('#335a4a'), 0, y, 0, 10);
    cyl(g, 0.36, 0.36, 0.05, mat('#2c4a3d'), 0, 0.9, 0, 10);
    box(g, 0.06, 0.06, 0.1, mat(METAL), 0, 0.15, 0.34);
    cyl(g, 0.05, 0.05, 1.1, mat('#6e7470'), 0.22, 0.9, -0.22, 6);
  },
  flowerBed(g) {
    const wood = mat('#7a5a3a');
    box(g, 1.85, 0.25, 0.06, wood, 0, 0, -0.4);
    box(g, 1.85, 0.25, 0.06, wood, 0, 0, 0.4);
    box(g, 0.06, 0.25, 0.86, wood, -0.9, 0, 0);
    box(g, 0.06, 0.25, 0.86, wood, 0.9, 0, 0);
    box(g, 1.74, 0.04, 0.74, mat('#3b2f22'), 0, 0.2, 0);
    const petals = ['#e6c13a', '#c4772e', '#b0472f', '#8a5aa8', '#ece6d8'];
    for (let i = 0; i < 14; i++) {
      const x = -0.75 + (i % 7) * 0.25 + (i > 6 ? 0.12 : 0);
      const z = i > 6 ? 0.18 : -0.15;
      cyl(g, 0.012, 0.012, 0.2, mat('#4f6b3a'), x, 0.22, z, 4);
      blob(g, 0.06, mat(petals[i % petals.length]), x, 0.45, z);
      blob(g, 0.06, mat('#5d7a42'), x + 0.05, 0.28, z - 0.04);
    }
  },
  appleTree(g) {
    cyl(g, 0.06, 0.09, 1.2, mat('#5a3f28'), 0, 0, 0, 6);
    blob(g, 0.5, mat('#4f6b3a'), 0, 1.55, 0);
    blob(g, 0.36, mat('#5d7a42'), 0.3, 1.35, 0.15);
    blob(g, 0.34, mat('#46603a'), -0.28, 1.4, -0.12);
    for (const [x, y, z] of [[0.3, 1.2, 0.4], [-0.35, 1.3, 0.3], [0.1, 1.85, 0.35], [-0.2, 1.65, -0.4], [0.45, 1.5, -0.2]])
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#b0472f')), x, y, z);
    blob(g, 0.2, mat('#3b2f22'), 0, 0.02, 0).scale.set(1.4, 0.25, 1.4);
  },

  // --- Fundstücke von draußen (Deko) ---
  teddy(g) {
    const fur = mat('#a0743f');
    const light = mat('#c9a070');
    blob(g, 0.15, fur, 0, 0.16, 0);
    blob(g, 0.11, fur, 0, 0.4, 0.02);
    blob(g, 0.05, light, 0, 0.38, 0.11);
    blob(g, 0.018, mat('#1d1a17'), 0, 0.4, 0.155);
    for (const x of [-0.04, 0.04]) blob(g, 0.016, mat('#1d1a17'), x, 0.44, 0.115);
    blob(g, 0.045, fur, -0.08, 0.5, 0); // nur ein Ohr
    for (const x of [-0.08, 0.08]) blob(g, 0.06, fur, x, 0.06, 0.12);
    for (const x of [-0.15, 0.15]) blob(g, 0.055, fur, x, 0.2, 0.05);
    blob(g, 0.06, light, 0, 0.16, 0.11);
  },
  wallClock(g) {
    const face = (r: number, c: THREE.Material, z: number) => {
      const d = add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 20), c), 0, 1.6, z);
      d.rotation.x = Math.PI / 2;
    };
    face(0.22, mat(WOOD_DARK), -0.44);
    face(0.18, mat('#ece4cc'), -0.425);
    box(g, 0.015, 0.13, 0.01, mat('#1d1a17'), 0, 1.6, -0.405).rotation.z = 0.5;
    box(g, 0.015, 0.09, 0.01, mat('#1d1a17'), 0, 1.6, -0.403).rotation.z = -1.6;
    box(g, 0.08, 0.3, 0.03, mat(WOOD_DARK), 0, 1.15, -0.44);
    cyl(g, 0.04, 0.04, 0.012, mat('#c9a23a'), 0, 1.2, -0.42, 10).rotation.x = Math.PI / 2;
  },
  tv(g) {
    for (const x of [-0.25, 0.25]) for (const z of [-0.18, 0.18]) box(g, 0.04, 0.32, 0.04, mat(WOOD_DARK), x, 0, z);
    box(g, 0.6, 0.04, 0.44, mat(WOOD), 0, 0.32, 0);
    box(g, 0.58, 0.46, 0.46, mat('#4a443a'), 0, 0.36, -0.02);
    box(g, 0.46, 0.36, 0.02, mat('#24302f'), -0.04, 0.4, 0.21);
    box(g, 0.06, 0.04, 0.02, mat('#b8b4aa'), 0.23, 0.6, 0.215);
    box(g, 0.06, 0.04, 0.02, mat('#b8b4aa'), 0.23, 0.5, 0.215);
    for (const s of [-1, 1]) box(g, 0.01, 0.45, 0.01, mat('#a8a59c'), s * 0.08, 0.95, -0.05).rotation.z = s * -0.5;
  },
  phone(g) {
    cyl(g, 0.2, 0.2, 0.03, mat(WOOD), 0, 0.55, 0, 12);
    cyl(g, 0.03, 0.04, 0.55, mat(WOOD_DARK), 0, 0, 0, 8);
    cyl(g, 0.14, 0.16, 0.03, mat(WOOD_DARK), 0, 0, 0, 10);
    box(g, 0.2, 0.08, 0.2, mat('#8a2f24'), 0, 0.58, 0);
    const dial = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14), mat('#ece4cc')), 0, 0.655, 0.03);
    dial.rotation.x = -0.4;
    box(g, 0.24, 0.04, 0.06, mat('#8a2f24'), 0, 0.68, -0.07);
  },
  typewriter(g) {
    box(g, 0.5, 0.4, 0.4, mat('#9b7b4f'), 0, 0, 0);
    box(g, 0.52, 0.04, 0.42, mat(WOOD_DARK), 0, 0.18, 0);
    box(g, 0.36, 0.1, 0.28, mat('#2f3a35'), 0, 0.4, 0.02);
    for (let row = 0; row < 3; row++) box(g, 0.28, 0.015, 0.04, mat('#d8d2c2'), 0, 0.5 + row * 0.012, 0.1 - row * 0.05);
    cyl(g, 0.03, 0.03, 0.38, mat('#1d1d1b'), 0, 0.5, -0.08, 8).rotation.z = Math.PI / 2;
    box(g, 0.2, 0.18, 0.005, mat('#f2ede0'), 0, 0.53, -0.1).rotation.x = -0.2;
  },
  guitar(g) {
    const wood = mat('#b0702f');
    const tilt = new THREE.Group();
    tilt.rotation.z = 0.12;
    g.add(tilt);
    const disc = (r: number, y: number) => {
      const d = add(tilt, new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 18), wood), 0, y, 0);
      d.rotation.x = Math.PI / 2;
    };
    disc(0.19, 0.22);
    disc(0.15, 0.45);
    const hole = add(tilt, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12), mat('#1d1a17')), 0, 0.42, 0.046);
    hole.rotation.x = Math.PI / 2;
    box(tilt, 0.06, 0.55, 0.03, mat(WOOD_DARK), 0, 0.55, 0.01);
    box(tilt, 0.08, 0.14, 0.03, mat(WOOD_DARK), 0, 1.1, 0.01);
    box(tilt, 0.012, 0.75, 0.005, mat('#d8d2c2'), 0, 0.42, 0.05);
    box(g, 0.3, 0.04, 0.2, mat('#3b3f3a'), 0, 0, 0);
  },
  globe(g) {
    cyl(g, 0.16, 0.18, 0.04, mat(WOOD_DARK), 0, 0, 0, 10);
    cyl(g, 0.025, 0.03, 0.7, mat(WOOD_DARK), 0, 0.04, 0, 8);
    const ball = add(g, new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 2), mat('#3f6a8a')), 0, 0.95, 0);
    ball.rotation.z = 0.4;
    for (const [x, y, z, s] of [
      [0.1, 1.02, 0.14, 0.09],
      [-0.12, 0.92, 0.12, 0.07],
      [0.05, 0.85, -0.17, 0.08],
    ])
      blob(g, s, mat('#6b8a4a'), x, y, z);
    const arc = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 4, 20, Math.PI), mat('#c9a23a')), 0, 0.95, 0);
    arc.rotation.z = -Math.PI / 2 + 0.4;
  },
  vase(g) {
    const glass = mat('#5f8f8a', { transparent: true, opacity: 0.8 });
    cyl(g, 0.09, 0.07, 0.04, glass, 0, 0, 0, 10);
    cyl(g, 0.13, 0.09, 0.22, glass, 0, 0.04, 0, 10);
    cyl(g, 0.06, 0.13, 0.12, glass, 0, 0.26, 0, 10);
    cyl(g, 0.08, 0.06, 0.08, glass, 0, 0.38, 0, 10);
  },
  mirror(g) {
    box(g, 0.56, 0.86, 0.04, mat(WOOD), 0, 1.0, -0.44);
    box(g, 0.46, 0.76, 0.012, mat('#c9d6dc'), 0, 1.05, -0.415);
    box(g, 0.006, 0.4, 0.004, mat('#eef4f6'), 0.06, 1.25, -0.407).rotation.z = 0.6;
    box(g, 0.006, 0.22, 0.004, mat('#eef4f6'), -0.02, 1.15, -0.407).rotation.z = -0.4;
  },
  bike(g) {
    const frame = mat('#3f5a7a');
    for (const x of [-0.55, 0.55]) {
      const w = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 22), mat('#1d1d1b')), x, 0.34, 0);
      w.castShadow = true;
      cyl(g, 0.03, 0.03, 0.06, mat('#a8a59c'), x, 0.31, 0, 6).rotation.x = Math.PI / 2;
    }
    const bar = (x1: number, y1: number, x2: number, y2: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const b = box(g, len, 0.035, 0.035, frame, (x1 + x2) / 2, (y1 + y2) / 2 - 0.0175, 0);
      b.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    };
    bar(-0.55, 0.34, -0.05, 0.36);
    bar(-0.05, 0.36, 0.45, 0.78);
    bar(-0.05, 0.36, -0.15, 0.8);
    bar(-0.15, 0.78, 0.42, 0.78);
    bar(-0.55, 0.34, -0.15, 0.78);
    bar(0.55, 0.34, 0.45, 0.85);
    box(g, 0.22, 0.05, 0.1, mat('#1d1d1b'), -0.17, 0.82, 0);
    box(g, 0.04, 0.04, 0.5, mat('#1d1d1b'), 0.45, 0.88, 0);
  },
  rubberDuck(g) {
    cyl(g, 0.3, 0.26, 0.26, mat('#8a8f88'), 0, 0, 0, 14);
    cyl(g, 0.28, 0.28, 0.01, mat('#6f9ab0'), 0, 0.22, 0, 14);
    const y = mat('#f2c230');
    blob(g, 0.08, y, 0, 0.25, 0);
    blob(g, 0.05, y, 0.05, 0.34, 0);
    cone(g, 0.025, 0.06, mat('#e8792a'), 0.1, 0.33, 0, 5).rotation.z = -Math.PI / 2;
  },
  painting(g) {
    box(g, 0.76, 0.6, 0.05, mat('#a8853a'), 0, 1.2, -0.44);
    box(g, 0.64, 0.24, 0.012, mat('#9cb8c8'), 0, 1.48, -0.41);
    box(g, 0.64, 0.24, 0.012, mat('#6b8a4a'), 0, 1.26, -0.41);
    box(g, 0.1, 0.06, 0.008, mat('#ece6d8'), -0.1, 1.33, -0.402);
    box(g, 0.04, 0.03, 0.008, mat('#2a2826'), -0.08, 1.34, -0.399);
    box(g, 0.08, 0.05, 0.008, mat('#ece6d8'), 0.15, 1.31, -0.402);
  },
  sewingMachine(g) {
    const iron = mat('#2a2826');
    for (const x of [-0.26, 0.26]) box(g, 0.05, 0.72, 0.36, iron, x, 0, 0);
    box(g, 0.47, 0.05, 0.05, iron, 0, 0.12, 0.1);
    box(g, 0.64, 0.04, 0.42, mat(WOOD), 0, 0.72, 0);
    box(g, 0.38, 0.06, 0.16, iron, 0, 0.76, 0);
    box(g, 0.08, 0.2, 0.12, iron, 0.14, 0.82, 0);
    box(g, 0.3, 0.07, 0.1, iron, 0.0, 0.96, 0);
    box(g, 0.05, 0.12, 0.06, iron, -0.13, 0.86, 0);
    box(g, 0.2, 0.012, 0.012, mat('#c9a23a'), 0.02, 1.0, 0.051);
    cyl(g, 0.05, 0.05, 0.03, mat('#a8a59c'), 0.2, 0.92, 0, 10).rotation.x = Math.PI / 2;
  },
};

/** Kleine Helfer für die vielen Kram-Modelle (nur Vorschaubilder). */
function kb(g: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, rz = 0, ry = 0) {
  const m = box(g, w, h, d, mat(color), x, y, z, ry);
  m.rotation.z = rz;
  return m;
}
/** Zylinder mit Mitte bei y, gedreht um x und z. */
function kc(g: THREE.Object3D, rT: number, rB: number, h: number, color: string, x: number, y: number, z: number, rx = 0, rz = 0) {
  const m = add(g, new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, 12), mat(color)), x, y, z);
  m.rotation.x = rx;
  m.rotation.z = rz;
  return m;
}
/** Ring (Schlauch, Henkel, Seil), Mitte bei y. */
function kt(g: THREE.Object3D, r: number, t: number, color: string, x: number, y: number, z: number, rx = Math.PI / 2, arc = Math.PI * 2) {
  const m = add(g, new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 18, arc), mat(color)), x, y, z);
  m.rotation.x = rx;
  return m;
}

/** Kram: nur für Vorschaubilder (Rucksack, Lager, Werktisch). Er wird nicht aufgestellt. */
const KRAM_BUILDERS: Record<KramId, (g: THREE.Group) => void> = {
  radio(g) {
    box(g, 0.42, 0.24, 0.14, mat('#3a4a3f'), 0, 0, 0);
    const sp = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 14), mat('#1d1d1b')), -0.09, 0.12, 0.07);
    sp.rotation.x = Math.PI / 2;
    box(g, 0.14, 0.05, 0.02, mat('#d8c99a'), 0.1, 0.15, 0.065);
    box(g, 0.3, 0.025, 0.03, mat('#1d1d1b'), 0, 0.26, 0);
    box(g, 0.012, 0.36, 0.012, mat('#a8a59c'), 0.17, 0.24, -0.03).rotation.z = -0.35;
  },
  toaster(g) {
    box(g, 0.3, 0.18, 0.17, mat('#b8b4aa'), 0, 0, 0);
    for (const z of [-0.04, 0.04]) box(g, 0.2, 0.012, 0.03, mat('#1d1d1b'), 0, 0.18, z);
    box(g, 0.03, 0.05, 0.02, mat('#1d1d1b'), 0.16, 0.08, 0);
    box(g, 0.08, 0.04, 0.2, mat('#d8c99a'), -0.02, 0.19, 0.0).rotation.z = 0.15;
  },
  toolbox(g) {
    const red = mat('#b0472f');
    box(g, 0.5, 0.22, 0.24, red, 0, 0, 0);
    box(g, 0.52, 0.03, 0.26, mat('#8a3424'), 0, 0.22, 0);
    for (const x of [-0.12, 0.12]) box(g, 0.03, 0.08, 0.03, mat('#3b3f3a'), x, 0.25, 0);
    box(g, 0.28, 0.025, 0.03, mat('#3b3f3a'), 0, 0.32, 0);
    box(g, 0.3, 0.02, 0.04, mat('#a8a59c'), 0.1, 0, 0.26, 0.5);
  },
  trafficCone(g) {
    box(g, 0.4, 0.04, 0.4, mat('#1d1d1b'), 0, 0, 0);
    const orange = mat('#e8792a');
    cyl(g, 0.03, 0.16, 0.6, orange, 0, 0.04, 0, 10);
    cyl(g, 0.105, 0.125, 0.08, mat('#ece6d8'), 0, 0.22, 0, 10);
    cyl(g, 0.06, 0.08, 0.07, mat('#ece6d8'), 0, 0.4, 0, 10);
  },
  bottles(g) {
    const crate = mat('#3f6a3f');
    box(g, 0.44, 0.28, 0.32, crate, 0, 0, 0);
    box(g, 0.46, 0.03, 0.34, mat('#355a35'), 0, 0.28, 0);
    const glass = [mat('#3f6a3a', { transparent: true, opacity: 0.85 }), mat('#7a4a22', { transparent: true, opacity: 0.85 })];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const x = -0.14 + i * 0.14;
        const z = -0.07 + j * 0.14;
        cyl(g, 0.035, 0.035, 0.12, glass[(i + j) % 2], x, 0.28, z, 8);
        cyl(g, 0.014, 0.03, 0.08, glass[(i + j) % 2], x, 0.4, z, 8);
      }
  },
  carBattery(g) {
    box(g, 0.34, 0.2, 0.18, mat('#1d1d1b'), 0, 0, 0);
    box(g, 0.34, 0.02, 0.18, mat('#3b3f3a'), 0, 0.2, 0);
    cyl(g, 0.02, 0.02, 0.04, mat('#b0472f'), -0.11, 0.22, 0, 6);
    cyl(g, 0.02, 0.02, 0.04, mat('#2a2826'), 0.11, 0.22, 0, 6);
    box(g, 0.12, 0.06, 0.005, mat('#e6c13a'), 0, 0.08, 0.092);
  },
  gasCan(g) {
    const red = mat('#9e2b20');
    box(g, 0.36, 0.46, 0.17, red, 0, 0, 0);
    box(g, 0.2, 0.04, 0.06, red, -0.06, 0.48, 0);
    box(g, 0.05, 0.06, 0.05, mat('#2a2826'), 0.13, 0.46, 0);
    box(g, 0.3, 0.03, 0.005, mat('#b8352a'), 0, 0.15, 0.087).rotation.z = 0.6;
    box(g, 0.3, 0.03, 0.005, mat('#b8352a'), 0, 0.15, 0.087).rotation.z = -0.6;
  },
  tape(g) {
    const roll = (x: number, y: number, z: number, c: string) => {
      const t = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 6, 16), mat(c)), x, y, z);
      t.rotation.x = Math.PI / 2;
    };
    roll(0, 0.035, 0, '#a8a59c');
    roll(0.02, 0.105, 0.01, '#a8a59c');
    roll(-0.01, 0.175, 0, '#b8935a');
    roll(0.2, 0.035, 0.1, '#5f6a7a');
  },
  sneakers(g) {
    const shoe = (x: number, z: number, ry: number) => {
      const s = new THREE.Group();
      s.position.set(x, 0, z);
      s.rotation.y = ry;
      g.add(s);
      box(s, 0.11, 0.03, 0.3, mat('#ece6d8'), 0, 0, 0);
      box(s, 0.1, 0.07, 0.22, mat('#ddd8cc'), 0, 0.03, -0.03);
      box(s, 0.1, 0.05, 0.1, mat('#ddd8cc'), 0, 0.03, 0.1);
      box(s, 0.102, 0.02, 0.18, mat('#b0472f'), 0, 0.05, -0.01);
    };
    shoe(-0.08, 0, 0.15);
    shoe(0.09, 0.03, 0.15); // ja, zwei linke
  },
  tinCans(g) {
    const tin = mat('#a8a59c');
    const labels = ['#b0472f', '#3f6a8a', '#c9a23a'];
    const can = (x: number, y: number, z: number, i: number) => {
      cyl(g, 0.06, 0.06, 0.13, tin, x, y, z, 10);
      cyl(g, 0.061, 0.061, 0.07, mat(labels[i % 3]), x, y + 0.03, z, 10);
    };
    can(-0.07, 0, 0, 0);
    can(0.07, 0, 0, 1);
    can(0, 0, 0.12, 2);
    can(0, 0.13, 0.04, 1);
  },
  blanket(g) {
    const a = mat('#7a4a3a');
    const b = mat('#c9b48a');
    for (let i = 0; i < 4; i++) box(g, 0.46, 0.05, 0.32, i % 2 ? b : a, 0, i * 0.05, 0, i * 0.04);
    for (const x of [-0.12, 0.12]) box(g, 0.04, 0.204, 0.322, b, x, 0, 0);
    box(g, 0.47, 0.04, 0.33, a, 0, 0.2, 0, 0.16);
  },
  flashlight(g) {
    const body = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 12), mat('#2f3a35')), -0.02, 0.04, 0);
    body.rotation.z = Math.PI / 2;
    const head = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.08, 12), mat('#2f3a35')), 0.14, 0.06, 0);
    head.rotation.z = Math.PI / 2;
    const lens = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.01, 12), glow('#fff2c0')), 0.185, 0.06, 0);
    lens.rotation.z = Math.PI / 2;
    box(g, 0.04, 0.02, 0.03, mat('#b0472f'), 0.02, 0.07, 0);
  },
  cableReel(g) {
    const frame = mat('#3b3f3a');
    for (const z of [-0.12, 0.12]) {
      const d = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18), frame), 0, 0.2, z);
      d.rotation.x = Math.PI / 2;
    }
    const core = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.21, 18), mat('#e8792a')), 0, 0.2, 0);
    core.rotation.x = Math.PI / 2;
    box(g, 0.1, 0.08, 0.06, mat('#1d1d1b'), 0, 0.38, 0);
    box(g, 0.04, 0.3, 0.04, frame, 0, 0, 0.17);
  },
  screwBox(g) {
    box(g, 0.34, 0.1, 0.22, mat('#3f6a8a'), 0, 0, 0);
    box(g, 0.32, 0.005, 0.2, mat('#2f4f6a'), 0, 0.1, 0);
    for (const x of [-0.056, 0.056]) box(g, 0.01, 0.1, 0.2, mat('#2f4f6a'), x, 0, 0);
    box(g, 0.32, 0.1, 0.01, mat('#2f4f6a'), 0, 0, 0);
    const steel = mat('#c9c6bc');
    for (let i = 0; i < 9; i++) cyl(g, 0.012, 0.012, 0.03, steel, -0.12 + (i % 3) * 0.11 + ((i * 7) % 3) * 0.01, 0.1, i < 5 ? -0.05 : 0.05, 6);
    box(g, 0.34, 0.012, 0.22, mat('#7aa0b8', { transparent: true, opacity: 0.5 }), 0, 0.2, -0.12).rotation.x = -1.1;
  },
  fruitCrate(g) {
    const w = mat('#b0894f');
    for (const y of [0, 0.1, 0.2]) {
      for (const z of [-0.15, 0.15]) box(g, 0.46, 0.06, 0.02, w, 0, y, z);
      for (const x of [-0.22, 0.22]) box(g, 0.02, 0.06, 0.3, w, x, y, 0);
    }
    box(g, 0.44, 0.02, 0.28, w, 0, 0, 0);
    for (const x of [-0.22, 0.22]) for (const z of [-0.15, 0.15]) box(g, 0.04, 0.28, 0.04, mat('#8a6a45'), x, 0, z);
    blob(g, 0.05, mat('#6b5034'), -0.1, 0.06, 0);
    blob(g, 0.05, mat('#8a6a45'), 0.08, 0.06, 0.05);
  },
  pan(g) {
    const iron = mat('#2a2826');
    cyl(g, 0.16, 0.14, 0.05, iron, 0, 0, 0, 16);
    cyl(g, 0.14, 0.14, 0.006, mat('#4a4844'), 0, 0.046, 0, 16);
    box(g, 0.24, 0.025, 0.04, iron, 0.26, 0.03, 0).rotation.z = 0.12;
    box(g, 0.12, 0.03, 0.045, mat(WOOD_DARK), 0.34, 0.04, 0).rotation.z = 0.12;
  },
  brokenPhone(g) {
    const p = new THREE.Group();
    p.rotation.x = -1.0;
    g.add(p);
    box(p, 0.09, 0.17, 0.012, mat('#1d1d1b'), 0, 0, 0);
    box(p, 0.08, 0.15, 0.002, mat('#24302f'), 0, 0.01, 0.006);
    const crack = mat('#a8b8c0');
    box(p, 0.002, 0.1, 0.002, crack, 0.01, 0.04, 0.008).rotation.z = 0.5;
    box(p, 0.002, 0.07, 0.002, crack, -0.01, 0.07, 0.008).rotation.z = -0.7;
    box(p, 0.002, 0.06, 0.002, crack, 0.02, 0.02, 0.008).rotation.z = 1.3;
    box(g, 0.14, 0.02, 0.1, mat('#5a5246'), 0, 0, 0.04);
  },
  superglue(g) {
    box(g, 0.14, 0.2, 0.01, mat('#e6c13a'), 0, 0, -0.03);
    box(g, 0.1, 0.05, 0.005, mat('#b0472f'), 0, 0.13, -0.022);
    const tube = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.12, 10), mat('#c9c6bc')), 0, 0.09, 0);
    tube.rotation.z = 0.2;
    cone(g, 0.016, 0.05, mat('#b0472f'), -0.014, 0.145, 0, 8).rotation.z = 0.2;
    box(g, 0.06, 0.01, 0.03, mat('#c9c6bc'), 0.014, 0.022, 0);
  },
  // --- Kram wie bei Fallout: viele Sorten, jede mit kleinem Modell fürs Vorschaubild ---
  carRadio(g) {
    box(g, 0.36, 0.1, 0.2, mat('#1d1d1b'), 0, 0, 0);
    box(g, 0.34, 0.07, 0.005, mat('#2f3a35'), 0, 0.015, 0.1);
    box(g, 0.12, 0.03, 0.006, glow('#7ad0b0'), -0.06, 0.04, 0.103);
    for (const x of [0.08, 0.13]) cyl(g, 0.018, 0.018, 0.02, mat('#a8a59c'), x, 0.04, 0.1, 8).rotation.x = Math.PI / 2;
    box(g, 0.1, 0.012, 0.004, mat('#a8a59c'), -0.06, 0.075, 0.103);
  },
  jack(g) {
    const steel = mat('#b0472f');
    box(g, 0.4, 0.04, 0.14, steel, 0, 0, 0);
    box(g, 0.05, 0.22, 0.05, steel, 0.08, 0.04, 0).rotation.z = 0.5;
    box(g, 0.05, 0.22, 0.05, steel, -0.04, 0.04, 0).rotation.z = -0.5;
    box(g, 0.14, 0.03, 0.08, mat('#3b3f3a'), 0.02, 0.22, 0);
    const rod = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), mat('#a8a59c')), 0.05, 0.14, 0);
    rod.rotation.z = Math.PI / 2;
  },
  wiperBlades(g) {
    for (const z of [-0.04, 0.04]) {
      box(g, 0.5, 0.015, 0.025, mat('#3b3f3a'), 0, 0.012, z, 0.05);
      box(g, 0.48, 0.012, 0.012, mat('#1d1d1b'), 0, 0, z, 0.05);
    }
  },
  firstAidKit(g) {
    box(g, 0.34, 0.12, 0.22, mat('#b0472f'), 0, 0, 0);
    box(g, 0.34, 0.03, 0.222, mat('#8a3424'), 0, 0.06, 0);
    box(g, 0.1, 0.03, 0.005, mat('#ece6d8'), 0, 0.045, 0.112);
    box(g, 0.03, 0.08, 0.005, mat('#ece6d8'), 0, 0.02, 0.112);
    box(g, 0.12, 0.02, 0.02, mat('#1d1d1b'), 0, 0.12, 0);
  },
  hubcap(g) {
    const c = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 20), mat('#c9c6bc')), 0, 0.12, 0);
    c.rotation.x = 1.2;
    const hub = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), mat('#8a8780')), 0, 0.135, 0.02);
    hub.rotation.x = 1.2;
  },
  motorOil(g) {
    box(g, 0.2, 0.3, 0.12, mat('#e6c13a'), 0, 0, 0);
    cyl(g, 0.03, 0.03, 0.05, mat('#1d1d1b'), 0.05, 0.3, 0, 10);
    box(g, 0.05, 0.12, 0.04, mat('#e6c13a'), -0.1, 0.14, 0);
    box(g, 0.16, 0.1, 0.005, mat('#1d1d1b'), 0, 0.08, 0.062);
  },
  spareTire(g) {
    const t = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.07, 10, 20), mat('#1d1d1b')), 0, 0.07, 0);
    t.rotation.x = Math.PI / 2;
    cyl(g, 0.12, 0.12, 0.06, mat('#8a8780'), 0, 0.04, 0, 14);
  },
  thermos(g) {
    cyl(g, 0.06, 0.06, 0.32, mat('#3f6a3f'), 0, 0, 0, 12);
    cyl(g, 0.065, 0.065, 0.08, mat('#a8a59c'), 0, 0.32, 0, 12);
    box(g, 0.03, 0.18, 0.02, mat('#2a2826'), 0.075, 0.08, 0);
  },
  powerbank(g) {
    box(g, 0.2, 0.03, 0.1, mat('#2a2826'), 0, 0, 0);
    for (let i = 0; i < 4; i++) box(g, 0.012, 0.004, 0.012, i === 0 ? glow('#7ad0b0') : mat('#4a4844'), -0.06 + i * 0.03, 0.03, 0.03);
    box(g, 0.24, 0.006, 0.012, mat('#ece6d8'), 0.12, 0.004, -0.02, 0.3);
  },
  headphones(g) {
    const band = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 16, Math.PI), mat('#2a2826')), 0, 0.1, 0);
    band.rotation.y = 0;
    for (const x of [-0.12, 0.12]) {
      const cup = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), mat('#3b3f3a')), x, 0.08, 0);
      cup.rotation.z = Math.PI / 2;
    }
  },
  umbrella(g) {
    const dome = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.12, 8), mat('#3f6a8a')), 0, 0.42, 0);
    dome.rotation.z = 0.35;
    cyl(g, 0.008, 0.008, 0.42, mat('#2a2826'), 0.02, 0.02, 0, 6);
    const hook = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 10, Math.PI), mat('#6b5034')), 0.05, 0.02, 0);
    hook.rotation.z = Math.PI;
  },
  hedgeShears(g) {
    for (const s of [-1, 1]) {
      box(g, 0.32, 0.015, 0.03, mat('#c9c6bc'), 0.12, 0.02, s * 0.02, s * 0.12);
      box(g, 0.24, 0.025, 0.035, mat('#b0472f'), -0.16, 0.02, s * 0.06, s * -0.2);
    }
  },
  gardenHose(g) {
    for (let i = 0; i < 3; i++) {
      const t = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.03, 0.022, 6, 18), mat('#3f7a3a')), 0, 0.022 + i * 0.04, 0);
      t.rotation.x = Math.PI / 2;
    }
    box(g, 0.06, 0.03, 0.04, mat('#e6c13a'), 0.17, 0.1, 0);
  },
  fertilizer(g) {
    box(g, 0.32, 0.36, 0.14, mat('#c9b48a'), 0, 0, 0);
    box(g, 0.3, 0.04, 0.12, mat('#b8a378'), 0, 0.36, 0);
    box(g, 0.2, 0.1, 0.005, mat('#3f6a3f'), 0, 0.16, 0.072);
    box(g, 0.08, 0.04, 0.006, mat('#e6c13a'), 0, 0.28, 0.072);
  },
  bikeLock(g) {
    const shackle = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 14, Math.PI), mat('#c9c6bc')), 0, 0.16, 0);
    shackle.rotation.z = 0;
    box(g, 0.2, 0.16, 0.08, mat('#2a2826'), 0, 0, 0);
    box(g, 0.04, 0.04, 0.005, mat('#a8a59c'), 0, 0.06, 0.041);
  },
  bikeParts(g) {
    const ring = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20), mat('#8a8780')), -0.08, 0.1, 0);
    ring.rotation.y = 0.3;
    const chain = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 4, 24), mat('#3b3f3a')), 0.04, 0.008, 0);
    chain.rotation.x = Math.PI / 2;
    const tube = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 18), mat('#1d1d1b')), 0.12, 0.02, 0.08);
    tube.rotation.x = Math.PI / 2;
  },
  oilCan(g) {
    cyl(g, 0.08, 0.08, 0.1, mat('#b0472f'), 0, 0, 0, 12);
    cone(g, 0.08, 0.06, mat('#b0472f'), 0, 0.1, 0, 12);
    const spout = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.012, 0.2, 6), mat('#a8a59c')), 0.06, 0.2, 0);
    spout.rotation.z = -0.9;
  },
  mousetrap(g) {
    box(g, 0.22, 0.02, 0.1, mat(WOOD), 0, 0, 0);
    box(g, 0.16, 0.006, 0.08, mat('#a8a59c'), 0.02, 0.02, 0);
    box(g, 0.004, 0.06, 0.08, mat('#a8a59c'), -0.06, 0.02, 0).rotation.z = 0.6;
    box(g, 0.03, 0.01, 0.03, mat('#e6c13a'), 0.06, 0.02, 0);
  },
  cordlessDrill(g) {
    box(g, 0.24, 0.08, 0.07, mat('#3f6a8a'), 0, 0.2, 0);
    box(g, 0.06, 0.18, 0.06, mat('#2a2826'), -0.04, 0.04, 0).rotation.z = 0.15;
    box(g, 0.12, 0.05, 0.1, mat('#2a2826'), -0.06, 0, 0);
    cyl(g, 0.01, 0.01, 0.12, mat('#c9c6bc'), 0.18, 0.235, 0, 6).rotation.z = Math.PI / 2;
  },
  copperWire(g) {
    const spool = mat('#3b3f3a');
    for (const z of [-0.07, 0.07]) {
      const d = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 16), spool), 0, 0.13, z);
      d.rotation.x = Math.PI / 2;
    }
    const core = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 16), mat('#c87a3a')), 0, 0.13, 0);
    core.rotation.x = Math.PI / 2;
  },
  bucket(g) {
    cyl(g, 0.14, 0.11, 0.24, mat('#a8a59c'), 0, 0, 0, 14);
    const handle = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.006, 4, 14, Math.PI), mat('#8a8780')), 0, 0.24, 0);
    handle.rotation.y = Math.PI / 2;
  },
  leatherJacket(g) {
    const l = mat('#5a3a26');
    box(g, 0.36, 0.06, 0.3, l, 0, 0, 0);
    box(g, 0.14, 0.05, 0.34, l, -0.22, 0, 0.02, 0.4);
    box(g, 0.14, 0.05, 0.34, l, 0.22, 0, 0.02, -0.4);
    box(g, 0.01, 0.062, 0.26, mat('#c9c6bc'), 0, 0, 0.01);
    box(g, 0.2, 0.04, 0.06, mat('#4a2e1e'), 0, 0.06, -0.13);
  },
  handbag(g) {
    box(g, 0.28, 0.18, 0.1, mat('#7a3a2a'), 0, 0, 0);
    box(g, 0.28, 0.05, 0.102, mat('#6a3022'), 0, 0.14, 0);
    const strap = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 4, 14, Math.PI), mat('#5a2a1e')), 0, 0.18, 0);
    strap.rotation.y = 0;
    box(g, 0.03, 0.02, 0.006, mat('#c9a23a'), 0, 0.13, 0.052);
  },
  rubberBoots(g) {
    const boot = (x: number) => {
      box(g, 0.1, 0.3, 0.1, mat('#3f6a3f'), x, 0.02, 0);
      box(g, 0.1, 0.07, 0.2, mat('#3f6a3f'), x, 0, 0.05);
      box(g, 0.102, 0.02, 0.202, mat('#2a2826'), x, 0, 0.05);
    };
    boot(-0.07);
    boot(0.07);
  },
  alarmClock(g) {
    const body = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16), mat('#b0472f')), 0, 0.12, 0);
    body.rotation.x = Math.PI / 2;
    const face = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.005, 16), mat('#ece6d8')), 0, 0.12, 0.031);
    face.rotation.x = Math.PI / 2;
    for (const x of [-0.06, 0.06]) blob(g, 0.035, mat('#c9c6bc'), x, 0.22, 0);
    for (const x of [-0.06, 0.06]) box(g, 0.012, 0.04, 0.012, mat('#2a2826'), x, 0, 0);
    box(g, 0.006, 0.06, 0.004, mat('#1d1d1b'), 0, 0.12, 0.035);
  },
  kitchenScale(g) {
    box(g, 0.2, 0.12, 0.18, mat('#ece6d8'), 0, 0, 0);
    const face = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 14), mat('#f4f0e4')), 0, 0.06, 0.091);
    face.rotation.x = Math.PI / 2;
    cyl(g, 0.12, 0.08, 0.05, mat('#a8a59c'), 0, 0.12, 0, 16);
  },
  kettle(g) {
    cyl(g, 0.09, 0.11, 0.2, mat('#c9c6bc'), 0, 0.02, 0, 14);
    cyl(g, 0.12, 0.12, 0.02, mat('#2a2826'), 0, 0, 0, 14);
    box(g, 0.03, 0.16, 0.04, mat('#2a2826'), -0.12, 0.05, 0);
    cone(g, 0.03, 0.06, mat('#c9c6bc'), 0.1, 0.16, 0, 6).rotation.z = -0.8;
  },
  speaker(g) {
    box(g, 0.26, 0.12, 0.1, mat('#2a2826'), 0, 0, 0);
    for (const x of [-0.07, 0.07]) {
      const c = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), mat('#4a4844')), x, 0.06, 0.05);
      c.rotation.x = Math.PI / 2;
    }
    box(g, 0.02, 0.006, 0.006, glow('#7ad0b0'), 0, 0.105, 0.05);
  },
  deskFan(g) {
    cyl(g, 0.08, 0.1, 0.03, mat('#ece6d8'), 0, 0, 0, 12);
    cyl(g, 0.015, 0.015, 0.16, mat('#ece6d8'), 0, 0.03, 0, 6);
    const cage = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 18), mat('#a8a59c')), 0, 0.26, 0.02);
    cage.rotation.y = 0;
    for (const r of [0, 2.1, 4.2]) box(g, 0.1, 0.04, 0.004, mat('#7aa0b8'), 0, 0.24, 0.02).rotation.z = r;
  },
  hairDryer(g) {
    const barrel = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 12), mat('#c86a8a')), 0.02, 0.2, 0);
    barrel.rotation.z = Math.PI / 2;
    box(g, 0.05, 0.16, 0.05, mat('#c86a8a'), -0.04, 0.04, 0).rotation.z = 0.25;
  },
  clothesIron(g) {
    const base = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.12, 0.05, 3), mat('#c9c6bc')), 0, 0.025, 0);
    base.rotation.y = Math.PI / 6;
    base.scale.set(1.4, 1, 0.8);
    box(g, 0.2, 0.06, 0.08, mat('#3f6a8a'), 0, 0.05, 0);
    box(g, 0.14, 0.03, 0.03, mat('#2a2826'), 0, 0.13, 0);
  },
  coffeeMachine(g) {
    box(g, 0.2, 0.04, 0.22, mat('#2a2826'), 0, 0, 0);
    box(g, 0.2, 0.34, 0.08, mat('#2a2826'), 0, 0, -0.07);
    box(g, 0.2, 0.06, 0.22, mat('#2a2826'), 0, 0.3, 0);
    cyl(g, 0.07, 0.07, 0.12, mat('#7aa0b8', { transparent: true, opacity: 0.6 }), 0, 0.04, 0.03, 12);
  },
  schnapps(g) {
    cyl(g, 0.05, 0.05, 0.2, mat('#d8e0d8', { transparent: true, opacity: 0.75 }), 0, 0, 0, 12);
    cyl(g, 0.018, 0.05, 0.08, mat('#d8e0d8', { transparent: true, opacity: 0.75 }), 0, 0.2, 0, 12);
    cyl(g, 0.02, 0.02, 0.03, mat('#b0472f'), 0, 0.28, 0, 8);
    cyl(g, 0.051, 0.051, 0.08, mat('#ece6d8'), 0, 0.06, 0, 12);
  },
  cashRegister(g) {
    box(g, 0.34, 0.1, 0.26, mat('#3b3f3a'), 0, 0, 0);
    box(g, 0.34, 0.12, 0.14, mat('#4a4844'), 0, 0.1, -0.05).rotation.x = -0.3;
    box(g, 0.14, 0.06, 0.04, mat('#2a2826'), 0, 0.22, -0.1);
    box(g, 0.1, 0.03, 0.005, glow('#7ad0b0'), 0, 0.235, -0.078);
  },
  bloodPressure(g) {
    box(g, 0.14, 0.05, 0.1, mat('#ece6d8'), 0, 0, 0);
    box(g, 0.08, 0.01, 0.04, mat('#24302f'), 0, 0.05, 0);
    const cuff = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.035, 6, 14), mat('#3f6a8a')), 0.2, 0.035, 0);
    cuff.rotation.x = Math.PI / 2;
  },
  disinfectant(g) {
    cyl(g, 0.045, 0.045, 0.22, mat('#ece6d8'), 0, 0, 0, 12);
    box(g, 0.06, 0.05, 0.04, mat('#3f6a8a'), 0, 0.22, 0);
    box(g, 0.05, 0.015, 0.02, mat('#3f6a8a'), 0.04, 0.25, 0);
    cyl(g, 0.046, 0.046, 0.07, mat('#3f6a8a'), 0, 0.06, 0, 12);
  },
  hotWaterBottle(g) {
    box(g, 0.2, 0.05, 0.28, mat('#a8473a'), 0, 0, 0);
    box(g, 0.06, 0.04, 0.06, mat('#8a3424'), 0, 0.01, -0.16);
    for (let i = 0; i < 4; i++) box(g, 0.19, 0.006, 0.01, mat('#c9b48a'), 0, 0.05, -0.08 + i * 0.05);
  },
  binoculars(g) {
    for (const x of [-0.05, 0.05]) {
      const t = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.16, 12), mat('#2a2826')), x, 0.05, 0);
      t.rotation.x = Math.PI / 2;
    }
    box(g, 0.06, 0.03, 0.05, mat('#3b3f3a'), 0, 0.07, 0);
  },
  lantern(g) {
    cyl(g, 0.08, 0.09, 0.05, mat('#b0472f'), 0, 0, 0, 12);
    cyl(g, 0.06, 0.06, 0.12, mat('#fff2c0', { transparent: true, opacity: 0.55 }), 0, 0.05, 0, 12);
    cone(g, 0.08, 0.05, mat('#b0472f'), 0, 0.17, 0, 12);
    const handle = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 4, 12, Math.PI), mat('#3b3f3a')), 0, 0.22, 0);
    handle.rotation.y = 0;
  },
  gasMask(g) {
    blob(g, 0.12, mat('#3f4a3a'), 0, 0.12, 0);
    for (const x of [-0.05, 0.05]) {
      const eye = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), mat('#7aa0b8', { transparent: true, opacity: 0.8 })), x, 0.15, 0.1);
      eye.rotation.x = Math.PI / 2;
    }
    const filter = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12), mat('#2a2826')), 0, 0.06, 0.13);
    filter.rotation.x = Math.PI / 2;
  },
  mixer(g) {
    kb(g, 0.24, 0.08, 0.08, '#ece6d8', 0, 0.12, 0, 0, 0);
    kb(g, 0.06, 0.12, 0.06, '#ece6d8', -0.08, 0, 0, 0, 0);
    kc(g, 0.008, 0.008, 0.12, '#a8a59c', 0.03, 0.06, 0, 0, 0);
    kc(g, 0.008, 0.008, 0.12, '#a8a59c', 0.07, 0.06, 0, 0, 0);
  },
  waffleIron(g) {
    kb(g, 0.28, 0.05, 0.26, '#2a2826', 0, 0, 0, 0, 0);
    kb(g, 0.28, 0.05, 0.26, '#3b3f3a', 0, 0.05, 0, 0, 0);
    kb(g, 0.08, 0.03, 0.04, '#2a2826', 0.17, 0.04, 0, 0, 0);
  },
  cookingPot(g) {
    kc(g, 0.13, 0.12, 0.14, '#a8a59c', 0, 0.07, 0, 0, 0);
    kb(g, 0.06, 0.02, 0.03, '#2a2826', 0.16, 0.1, 0, 0, 0);
    kb(g, 0.06, 0.02, 0.03, '#2a2826', -0.16, 0.1, 0, 0, 0);
  },
  teapot(g) {
    blob(g, 0.11, mat('#ece6d8'), 0, 0.11, 0);
    cone(g, 0.04, 0.05, mat('#ece6d8'), 0, 0.2, 0, 10);
    kc(g, 0.015, 0.025, 0.1, '#ece6d8', 0.12, 0.13, 0, 0, -0.8);
    kt(g, 0.05, 0.012, '#ece6d8', -0.11, 0.12, 0, 0, Math.PI);
  },
  picnicBasket(g) {
    kb(g, 0.3, 0.16, 0.2, '#b0894f', 0, 0, 0, 0, 0);
    kb(g, 0.32, 0.02, 0.22, '#b0472f', 0, 0.16, 0, 0, 0);
    kt(g, 0.1, 0.01, '#8a6a45', 0, 0.18, 0, 0, Math.PI);
  },
  cuckooClock(g) {
    kb(g, 0.2, 0.24, 0.08, '#6b5034', 0, 0.06, 0, 0, 0);
    kb(g, 0.15, 0.03, 0.1, '#4a3424', -0.06, 0.28, 0, 0.55, 0);
    kb(g, 0.15, 0.03, 0.1, '#4a3424', 0.06, 0.28, 0, -0.55, 0);
    kc(g, 0.05, 0.05, 0.01, '#ece6d8', 0, 0.18, 0.045, Math.PI / 2, 0);
    kc(g, 0.012, 0.012, 0.06, '#c9a23a', -0.04, 0.03, 0.02, 0, 0);
    kc(g, 0.012, 0.012, 0.06, '#c9a23a', 0.04, 0.03, 0.02, 0, 0);
  },
  sewingKit(g) {
    kb(g, 0.26, 0.1, 0.16, '#b0472f', 0, 0, 0, 0, 0);
    kb(g, 0.26, 0.02, 0.16, '#8a3424', 0, 0.1, 0, 0, 0);
    blob(g, 0.025, mat('#3f6a8a'), -0.05, 0.14, 0);
    blob(g, 0.025, mat('#e6c13a'), 0, 0.14, 0);
    blob(g, 0.025, mat('#3f6a3f'), 0.05, 0.14, 0);
  },
  typewriter(g) {
    kb(g, 0.34, 0.08, 0.26, '#3f4a3a', 0, 0, 0, 0, 0);
    kb(g, 0.34, 0.06, 0.12, '#3f4a3a', 0, 0.08, -0.06, 0, 0);
    kc(g, 0.03, 0.03, 0.38, '#1d1d1b', 0, 0.17, -0.08, 0, Math.PI / 2);
    kb(g, 0.28, 0.02, 0.1, '#d8d0b8', 0, 0.08, 0.07, 0, 0);
  },
  telephone(g) {
    kb(g, 0.22, 0.08, 0.18, '#b0472f', 0, 0, 0, 0, 0);
    kc(g, 0.06, 0.06, 0.01, '#ece6d8', 0, 0.085, 0.02, 0, 0);
    kb(g, 0.26, 0.04, 0.06, '#b0472f', 0, 0.1, -0.04, 0, 0);
  },
  vacuum(g) {
    kc(g, 0.09, 0.09, 0.3, '#e8792a', 0, 0.09, 0, 0, Math.PI / 2);
    kt(g, 0.12, 0.015, '#2a2826', 0.2, 0.1, 0, 0, Math.PI);
    kc(g, 0.012, 0.012, 0.4, '#a8a59c', -0.2, 0.2, 0, 0, 0.5);
  },
  boombox(g) {
    kb(g, 0.4, 0.2, 0.12, '#a8a59c', 0, 0, 0, 0, 0);
    kc(g, 0.06, 0.06, 0.01, '#2a2826', -0.12, 0.09, 0.06, Math.PI / 2, 0);
    kc(g, 0.06, 0.06, 0.01, '#2a2826', 0.12, 0.09, 0.06, Math.PI / 2, 0);
    kb(g, 0.12, 0.05, 0.005, '#24302f', 0, 0.12, 0.062, 0, 0);
    kb(g, 0.3, 0.02, 0.03, '#2a2826', 0, 0.22, 0, 0, 0);
  },
  gameConsole(g) {
    kb(g, 0.3, 0.06, 0.22, '#ece6d8', 0, 0, 0, 0, 0);
    kb(g, 0.12, 0.03, 0.08, '#2a2826', 0.2, 0, 0.12, 0, 0.4);
  },
  laptop(g) {
    kb(g, 0.34, 0.02, 0.24, '#3b3f3a', 0, 0, 0, 0, 0);
    kb(g, 0.34, 0.22, 0.015, '#3b3f3a', 0, 0.02, -0.12, 0, 0);
    kb(g, 0.3, 0.18, 0.004, '#24302f', 0, 0.04, -0.11, 0, 0);
  },
  tablet(g) {
    kb(g, 0.22, 0.015, 0.3, '#1d1d1b', 0, 0, 0, 0, 0);
    kb(g, 0.2, 0.004, 0.27, '#24302f', 0, 0.015, 0, 0, 0);
  },
  tableLamp(g) {
    kc(g, 0.06, 0.07, 0.02, '#c9a23a', 0, 0.01, 0, 0, 0);
    kc(g, 0.01, 0.01, 0.2, '#c9a23a', 0, 0.12, 0, 0, 0);
    kc(g, 0.06, 0.11, 0.12, '#e6d6b0', 0, 0.26, 0, 0, 0);
  },
  lightBulbs(g) {
    kb(g, 0.26, 0.1, 0.08, '#e6c13a', 0, 0, 0, 0, 0);
    blob(g, 0.04, mat('#fff2c0'), -0.06, 0.15, 0);
    blob(g, 0.04, mat('#fff2c0'), 0.03, 0.15, 0);
    kc(g, 0.018, 0.018, 0.03, '#c9c6bc', -0.06, 0.11, 0, 0, 0);
  },
  powerStrip(g) {
    kb(g, 0.34, 0.04, 0.07, '#ece6d8', 0, 0, 0, 0, 0);
    kb(g, 0.04, 0.006, 0.04, '#c9c6bc', -0.1, 0.04, 0, 0, 0);
    kb(g, 0.04, 0.006, 0.04, '#c9c6bc', 0, 0.04, 0, 0, 0);
    kb(g, 0.04, 0.006, 0.04, '#c9c6bc', 0.1, 0.04, 0, 0, 0);
    kc(g, 0.006, 0.006, 0.3, '#ece6d8', 0.3, 0.01, 0, 0, Math.PI / 2);
  },
  batteries(g) {
    kb(g, 0.16, 0.12, 0.005, '#3f6a8a', 0, 0, -0.02, 0, 0);
    kc(g, 0.014, 0.014, 0.05, '#2a2826', -0.045, 0.025, 0, 0, 0);
    kc(g, 0.014, 0.014, 0.05, '#2a2826', -0.015, 0.025, 0, 0, 0);
    kc(g, 0.014, 0.014, 0.05, '#2a2826', 0.015, 0.025, 0, 0, 0);
    kc(g, 0.014, 0.014, 0.05, '#2a2826', 0.045, 0.025, 0, 0, 0);
  },
  candles(g) {
    kc(g, 0.03, 0.03, 0.08, '#ece6d8', -0.05, 0.04, 0, 0, 0);
    kc(g, 0.03, 0.03, 0.05, '#ece6d8', 0.03, 0.025, 0.02, 0, 0);
    kc(g, 0.025, 0.025, 0.11, '#e6d6b0', 0, 0.055, -0.05, 0, 0);
    box(g, 0.01, 0.025, 0.01, glow('#ffc35a'), 0, 0.11, -0.05);
  },
  magazines(g) {
    kb(g, 0.22, 0.012, 0.28, '#b0472f', 0, 0, 0, 0, 0.1);
    kb(g, 0.22, 0.012, 0.28, '#3f6a8a', 0, 0.012, 0, 0, -0.15);
    kb(g, 0.22, 0.012, 0.28, '#ece6d8', 0, 0.024, 0, 0, 0.05);
    kb(g, 0.22, 0.012, 0.28, '#e6c13a', 0, 0.036, 0, 0, 0.2);
  },
  boardGame(g) {
    kb(g, 0.3, 0.05, 0.3, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.26, 0.006, 0.26, '#e6c13a', 0, 0.05, 0, 0, 0);
    blob(g, 0.02, mat('#b0472f'), 0.05, 0.07, 0.04);
  },
  readingGlasses(g) {
    kt(g, 0.035, 0.006, '#2a2826', -0.045, 0.04, 0, 0, Math.PI * 2);
    kt(g, 0.035, 0.006, '#2a2826', 0.045, 0.04, 0, 0, Math.PI * 2);
    kb(g, 0.03, 0.006, 0.006, '#2a2826', 0, 0.045, 0, 0, 0);
    kb(g, 0.004, 0.004, 0.12, '#2a2826', -0.08, 0.045, -0.06, 0, 0);
    kb(g, 0.004, 0.004, 0.12, '#2a2826', 0.08, 0.045, -0.06, 0, 0);
  },
  gauze(g) {
    kc(g, 0.04, 0.04, 0.07, '#f4f0e4', -0.06, 0.035, 0, 0, 0);
    kc(g, 0.04, 0.04, 0.07, '#f4f0e4', 0.03, 0.035, 0.02, 0, 0);
    kc(g, 0.04, 0.04, 0.07, '#f4f0e4', 0, 0.035, -0.07, 0, 0);
  },
  crutch(g) {
    kc(g, 0.012, 0.012, 0.5, '#a8a59c', 0, 0.25, 0, 0, 0);
    kb(g, 0.12, 0.03, 0.04, '#2a2826', 0, 0.47, 0, 0, 0);
    kc(g, 0.018, 0.018, 0.04, '#2a2826', 0, 0.02, 0, 0, 0);
  },
  shovel(g) {
    kc(g, 0.015, 0.015, 0.5, '#8a6a45', 0, 0.45, 0, 0, 0);
    kb(g, 0.16, 0.2, 0.02, '#a8a59c', 0, 0, 0, 0, 0);
    kb(g, 0.1, 0.03, 0.03, '#2a2826', 0, 0.7, 0, 0, 0);
  },
  wateringCan(g) {
    kc(g, 0.1, 0.1, 0.18, '#a8a59c', 0, 0.09, 0, 0, 0);
    kc(g, 0.012, 0.02, 0.22, '#a8a59c', 0.15, 0.14, 0, 0, -0.9);
    kt(g, 0.07, 0.01, '#a8a59c', -0.02, 0.2, 0, 0, Math.PI);
  },
  mowerEngine(g) {
    kb(g, 0.22, 0.14, 0.2, '#b0472f', 0, 0, 0, 0, 0);
    kc(g, 0.06, 0.06, 0.04, '#2a2826', 0, 0.16, 0, 0, 0);
    kb(g, 0.06, 0.04, 0.06, '#a8a59c', 0.12, 0.08, 0, 0, 0);
  },
  gardenGloves(g) {
    kb(g, 0.12, 0.02, 0.18, '#5a8a4a', -0.07, 0, 0, 0, 0.3);
    kb(g, 0.12, 0.02, 0.18, '#5a8a4a', 0.07, 0, 0, 0, -0.2);
    kb(g, 0.13, 0.021, 0.06, '#c9b48a', -0.08, 0, 0.08, 0, 0);
  },
  birdhouse(g) {
    kb(g, 0.16, 0.18, 0.16, '#8a6a45', 0, 0, 0, 0, 0);
    kb(g, 0.13, 0.02, 0.2, '#6b5034', -0.05, 0.19, 0, 0.6, 0);
    kb(g, 0.13, 0.02, 0.2, '#6b5034', 0.05, 0.19, 0, -0.6, 0);
    kc(g, 0.025, 0.025, 0.01, '#1d1d1b', 0, 0.11, 0.081, Math.PI / 2, 0);
  },
  clayPot(g) {
    kc(g, 0.1, 0.07, 0.14, '#b0603a', 0, 0.07, 0, 0, 0);
    kc(g, 0.105, 0.105, 0.03, '#a05530', 0, 0.14, 0, 0, 0);
    kc(g, 0.09, 0.09, 0.01, '#4a3424', 0, 0.152, 0, 0, 0);
  },
  chainsaw(g) {
    kb(g, 0.24, 0.14, 0.12, '#e8792a', 0, 0, 0, 0, 0);
    kb(g, 0.32, 0.03, 0.015, '#c9c6bc', 0.26, 0.05, 0, 0, 0);
    kt(g, 0.06, 0.012, '#2a2826', -0.02, 0.17, 0, 0, Math.PI);
  },
  tarp(g) {
    kb(g, 0.32, 0.08, 0.24, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.33, 0.02, 0.25, '#355a7a', 0, 0.08, 0, 0.05, 0);
  },
  rope(g) {
    kt(g, 0.12, 0.025, '#c9b48a', 0, 0.025, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.1, 0.025, '#c9b48a', 0, 0.07, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.08, 0.025, '#c9b48a', 0, 0.115, 0, Math.PI / 2, Math.PI * 2);
  },
  paintCan(g) {
    kc(g, 0.1, 0.1, 0.16, '#a8a59c', 0, 0.08, 0, 0, 0);
    kc(g, 0.101, 0.101, 0.08, '#b0472f', 0, 0.08, 0, 0, 0);
    kt(g, 0.09, 0.006, '#8a8780', 0, 0.16, 0, 0, Math.PI);
  },
  woodGlue(g) {
    kc(g, 0.04, 0.05, 0.16, '#ece6d8', 0, 0.08, 0, 0, 0);
    cone(g, 0.02, 0.05, mat('#ece6d8'), 0, 0.16, 0, 10);
    kc(g, 0.051, 0.051, 0.06, '#e6c13a', 0, 0.07, 0, 0, 0);
  },
  nails(g) {
    kb(g, 0.18, 0.06, 0.12, '#b0894f', 0, 0, 0, 0, 0);
    kc(g, 0.004, 0.004, 0.06, '#a8a59c', -0.04, 0.08, 0, 0, 0.3);
    kc(g, 0.004, 0.004, 0.06, '#a8a59c', 0.02, 0.08, 0.02, 0, -0.4);
  },
  padlock(g) {
    kb(g, 0.1, 0.1, 0.04, '#c9a23a', 0, 0, 0, 0, 0);
    kt(g, 0.035, 0.01, '#c9c6bc', 0, 0.1, 0, 0, Math.PI);
  },
  spiritLevel(g) {
    kb(g, 0.5, 0.04, 0.03, '#e6c13a', 0, 0, 0, 0, 0);
    box(g, 0.04, 0.02, 0.02, glow('#7ad0b0'), 0, 0.025, 0.006);
  },
  multimeter(g) {
    kb(g, 0.1, 0.03, 0.18, '#e6c13a', 0, 0, 0, 0, 0);
    kb(g, 0.07, 0.004, 0.05, '#24302f', 0, 0.03, -0.04, 0, 0);
    kc(g, 0.02, 0.02, 0.01, '#2a2826', 0, 0.035, 0.03, 0, 0);
  },
  bricks(g) {
    kb(g, 0.22, 0.07, 0.1, '#a0503a', 0, 0, 0, 0, 0);
    kb(g, 0.22, 0.07, 0.1, '#a0503a', 0.02, 0.07, 0.02, 0, 0.3);
    kb(g, 0.11, 0.07, 0.1, '#8a4030', 0.18, 0, 0.08, 0, 0);
  },
  sparkPlugs(g) {
    kc(g, 0.015, 0.015, 0.06, '#ece6d8', -0.05, 0.07, 0, 0, 0);
    kc(g, 0.012, 0.012, 0.04, '#a8a59c', -0.05, 0.02, 0, 0, 0);
    kc(g, 0.015, 0.015, 0.06, '#ece6d8', 0.02, 0.07, 0.02, 0, 0);
    kc(g, 0.012, 0.012, 0.04, '#a8a59c', 0.02, 0.02, 0.02, 0, 0);
  },
  jumperCables(g) {
    kt(g, 0.12, 0.012, '#b0472f', 0, 0.012, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.1, 0.012, '#2a2826', 0.02, 0.03, 0.02, Math.PI / 2, Math.PI * 2);
    kb(g, 0.06, 0.02, 0.03, '#b0472f', 0.14, 0, 0, 0, 0);
  },
  sideMirror(g) {
    kb(g, 0.2, 0.12, 0.08, '#2a2826', 0, 0, 0, 0, 0);
    kb(g, 0.18, 0.1, 0.004, '#9fb8c0', 0, 0.01, 0.041, 0, 0);
  },
  licensePlate(g) {
    kb(g, 0.4, 0.1, 0.01, '#ece6d8', 0, 0, 0, 0, 0);
    kb(g, 0.04, 0.08, 0.012, '#3f6a8a', -0.18, 0.01, 0, 0, 0);
    kb(g, 0.26, 0.03, 0.012, '#1d1d1b', 0.02, 0.035, 0, 0, 0);
  },
  warningTriangle(g) {
    kb(g, 0.3, 0.03, 0.02, '#b0472f', 0, 0, 0, 0, 0);
    kb(g, 0.3, 0.03, 0.02, '#b0472f', -0.075, 0.12, 0, 1.047, 0);
    kb(g, 0.3, 0.03, 0.02, '#b0472f', 0.075, 0.12, 0, -1.047, 0);
  },
  shoppingCart(g) {
    kb(g, 0.4, 0.24, 0.26, '#a8a59c', 0, 0.08, 0, 0, 0);
    kb(g, 0.36, 0.2, 0.22, '#6a6862', 0, 0.12, 0, 0, 0);
    kc(g, 0.03, 0.03, 0.02, '#2a2826', -0.16, 0.03, -0.1, Math.PI / 2, 0);
    kc(g, 0.03, 0.03, 0.02, '#2a2826', 0.16, 0.03, -0.1, Math.PI / 2, 0);
    kc(g, 0.03, 0.03, 0.02, '#2a2826', -0.16, 0.03, 0.1, Math.PI / 2, 0);
    kc(g, 0.03, 0.03, 0.02, '#2a2826', 0.16, 0.03, 0.1, Math.PI / 2, 0);
    kb(g, 0.04, 0.02, 0.3, '#b0472f', -0.22, 0.32, 0, 0, 0);
  },
  canOpener(g) {
    kb(g, 0.16, 0.02, 0.03, '#c9c6bc', 0, 0, 0, 0, 0);
    kb(g, 0.16, 0.02, 0.03, '#c9c6bc', 0, 0, 0.04, 0, 0.2);
    kc(g, 0.025, 0.025, 0.02, '#a8a59c', 0.08, 0.03, 0.02, 0, 0);
  },
  glassCleaner(g) {
    kc(g, 0.04, 0.045, 0.18, '#5ab0d8', 0, 0.09, 0, 0, 0);
    kb(g, 0.05, 0.05, 0.03, '#ece6d8', 0, 0.18, 0, 0, 0);
    kb(g, 0.04, 0.012, 0.02, '#ece6d8', 0.035, 0.21, 0, 0, 0);
  },
  cookingOil(g) {
    kc(g, 0.045, 0.05, 0.24, '#e6c13a', 0, 0.12, 0, 0, 0);
    kc(g, 0.025, 0.025, 0.03, '#3f6a3f', 0, 0.255, 0, 0, 0);
  },
  coolBox(g) {
    kb(g, 0.34, 0.18, 0.22, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.36, 0.04, 0.24, '#ece6d8', 0, 0.18, 0, 0, 0);
    kb(g, 0.2, 0.02, 0.03, '#ece6d8', 0, 0.22, 0, 0, 0);
  },
  antifreeze(g) {
    kb(g, 0.14, 0.22, 0.08, '#5ab05a', 0, 0, 0, 0, 0);
    kc(g, 0.025, 0.025, 0.03, '#2a2826', 0.03, 0.235, 0, 0, 0);
  },
  roadAtlas(g) {
    kb(g, 0.24, 0.03, 0.32, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.2, 0.031, 0.06, '#e6c13a', 0, 0, 0.08, 0, 0);
  },
  energyCans(g) {
    kc(g, 0.03, 0.03, 0.12, '#3f6a8a', -0.04, 0.06, 0, 0, 0);
    kc(g, 0.03, 0.03, 0.12, '#b0472f', 0.04, 0.06, 0.02, 0, 0);
    kc(g, 0.03, 0.03, 0.12, '#3f6a3f', 0, 0.03, 0.07, Math.PI / 2, 0);
  },
  sunglasses(g) {
    kb(g, 0.06, 0.04, 0.006, '#1d1d1b', -0.04, 0.02, 0, 0, 0);
    kb(g, 0.06, 0.04, 0.006, '#1d1d1b', 0.04, 0.02, 0, 0, 0);
    kb(g, 0.02, 0.008, 0.006, '#2a2826', 0, 0.05, 0, 0, 0);
    kb(g, 0.004, 0.004, 0.12, '#2a2826', -0.07, 0.05, -0.06, 0, 0);
    kb(g, 0.004, 0.004, 0.12, '#2a2826', 0.07, 0.05, -0.06, 0, 0);
  },
  walkman(g) {
    kb(g, 0.12, 0.16, 0.03, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.08, 0.05, 0.004, '#24302f', 0, 0.08, 0.016, 0, 0);
  },
  waterBottle(g) {
    kc(g, 0.035, 0.035, 0.22, '#a8a59c', 0, 0.11, 0, 0, 0);
    kc(g, 0.025, 0.025, 0.04, '#2a2826', 0, 0.24, 0, 0, 0);
  },
  keyring(g) {
    kt(g, 0.03, 0.005, '#c9c6bc', 0, 0.005, 0, Math.PI / 2, Math.PI * 2);
    kb(g, 0.06, 0.006, 0.015, '#c9a23a', 0.05, 0, 0, 0, 0.3);
    kb(g, 0.06, 0.006, 0.015, '#c9c6bc', 0.04, 0, 0.03, 0, -0.4);
  },
  wallet(g) {
    kb(g, 0.16, 0.025, 0.11, '#5a3a26', 0, 0, 0, 0, 0);
    kb(g, 0.1, 0.002, 0.06, '#c9b48a', 0.02, 0.026, 0, 0, 0);
  },
  compass(g) {
    kc(g, 0.06, 0.06, 0.02, '#a8a59c', 0, 0.01, 0, 0, 0);
    kc(g, 0.05, 0.05, 0.004, '#ece6d8', 0, 0.022, 0, 0, 0);
    kb(g, 0.004, 0.002, 0.07, '#b0472f', 0, 0.024, 0, 0, 0.4);
  },
  pocketKnife(g) {
    kb(g, 0.12, 0.025, 0.03, '#b0472f', 0, 0, 0, 0, 0);
    kb(g, 0.1, 0.006, 0.02, '#c9c6bc', 0.1, 0.01, 0, 0, 0.3);
  },
  harmonica(g) {
    kb(g, 0.14, 0.03, 0.04, '#c9c6bc', 0, 0, 0, 0, 0);
    kb(g, 0.14, 0.01, 0.04, '#8a6a45', 0, 0.01, 0, 0, 0);
  },
  playingCards(g) {
    kb(g, 0.08, 0.03, 0.11, '#b0472f', 0, 0, 0, 0, 0);
    kb(g, 0.07, 0.004, 0.1, '#ece6d8', 0.07, 0, 0.02, 0, 0.3);
  },
  sleepingBag(g) {
    kc(g, 0.11, 0.11, 0.32, '#3f6a3f', 0, 0.11, 0, 0, Math.PI / 2);
    kc(g, 0.111, 0.111, 0.04, '#2f5a2f', 0.08, 0.11, 0, 0, Math.PI / 2);
  },
  campStove(g) {
    kc(g, 0.07, 0.07, 0.1, '#3f6a8a', 0, 0.05, 0, 0, 0);
    kc(g, 0.08, 0.08, 0.01, '#2a2826', 0, 0.11, 0, 0, 0);
    kb(g, 0.16, 0.01, 0.01, '#a8a59c', 0, 0.115, 0, 0, 0);
    kb(g, 0.01, 0.01, 0.16, '#a8a59c', 0, 0.115, 0, 0, 0);
  },
  messTin(g) {
    kc(g, 0.1, 0.1, 0.08, '#4a5a3a', 0, 0.04, 0, 0, 0);
    kb(g, 0.12, 0.012, 0.03, '#4a5a3a', 0.15, 0.07, 0, 0, 0);
  },
  trailCam(g) {
    kb(g, 0.12, 0.16, 0.08, '#5a5a3a', 0, 0, 0, 0, 0);
    kc(g, 0.025, 0.025, 0.01, '#1d1d1b', 0, 0.1, 0.041, Math.PI / 2, 0);
    box(g, 0.01, 0.01, 0.01, glow('#e05a3a'), 0.035, 0.13, 0.041);
  },
  winterCoat(g) {
    kb(g, 0.38, 0.07, 0.32, '#4a5a6a', 0, 0, 0, 0, 0);
    kb(g, 0.38, 0.04, 0.08, '#c9b48a', 0, 0.07, -0.12, 0, 0);
  },
  workBoots(g) {
    kb(g, 0.1, 0.12, 0.2, '#6b5034', -0.06, 0.02, 0, 0, 0);
    kb(g, 0.1, 0.02, 0.2, '#1d1d1b', -0.06, 0, 0, 0, 0);
    kb(g, 0.1, 0.12, 0.2, '#6b5034', 0.06, 0.02, 0, 0, 0);
    kb(g, 0.1, 0.02, 0.2, '#1d1d1b', 0.06, 0, 0, 0, 0);
  },
  leatherBelt(g) {
    kt(g, 0.1, 0.012, '#5a3a26', 0, 0.012, 0, Math.PI / 2, Math.PI * 2);
    kb(g, 0.04, 0.03, 0.006, '#c9a23a', 0.1, 0, 0, 0, 0);
  },
  raincoat(g) {
    kb(g, 0.36, 0.06, 0.3, '#e6c13a', 0, 0, 0, 0, 0);
    kb(g, 0.12, 0.05, 0.12, '#d6b12a', 0, 0.06, -0.1, 0, 0);
  },
  walkieTalkie(g) {
    kb(g, 0.07, 0.18, 0.04, '#2a2826', 0, 0, 0, 0, 0);
    kc(g, 0.006, 0.006, 0.12, '#1d1d1b', 0.02, 0.24, 0, 0, 0);
    kb(g, 0.05, 0.04, 0.004, '#24302f', 0, 0.11, 0.021, 0, 0);
  },
  flareGun(g) {
    kb(g, 0.06, 0.12, 0.04, '#e8792a', 0, 0, 0, 0.2, 0);
    kc(g, 0.025, 0.025, 0.16, '#e8792a', 0.07, 0.14, 0, 0, Math.PI / 2);
  },
  ammoCrate(g) {
    kb(g, 0.3, 0.18, 0.14, '#4a5a3a', 0, 0, 0, 0, 0);
    kb(g, 0.12, 0.02, 0.03, '#2a2826', 0, 0.18, 0, 0, 0);
    kb(g, 0.08, 0.06, 0.005, '#c9c6bc', -0.08, 0.06, 0.072, 0, 0);
  },
  rationPack(g) {
    kb(g, 0.2, 0.06, 0.14, '#8a7a4a', 0, 0, 0, 0, 0);
    kb(g, 0.12, 0.002, 0.06, '#2a2826', 0, 0.061, 0, 0, 0);
  },
  hardHat(g) {
    blob(g, 0.12, mat('#e6c13a'), 0, 0.06, 0);
    kc(g, 0.15, 0.15, 0.015, '#e6c13a', 0, 0.01, 0, 0, 0);
  },
  emptyExtinguisher(g) {
    kc(g, 0.06, 0.06, 0.3, '#b0472f', 0, 0.15, 0, 0, 0);
    kb(g, 0.06, 0.04, 0.04, '#2a2826', 0, 0.3, 0, 0, 0);
    kc(g, 0.01, 0.012, 0.16, '#1d1d1b', 0.06, 0.22, 0, 0, -0.6);
  },
  toolBag(g) {
    kb(g, 0.3, 0.14, 0.14, '#5a3a26', 0, 0, 0, 0, 0);
    kt(g, 0.1, 0.012, '#4a2e1e', 0, 0.14, 0, 0, Math.PI);
    kb(g, 0.02, 0.1, 0.005, '#c9c6bc', 0.08, 0.1, 0.072, 0, 0);
  },
  solarLight(g) {
    kc(g, 0.006, 0.006, 0.24, '#2a2826', 0, 0.12, 0, 0, 0);
    kc(g, 0.04, 0.04, 0.06, '#d8e0d8', 0, 0.27, 0, 0, 0);
    kc(g, 0.05, 0.05, 0.01, '#24302f', 0, 0.305, 0, 0, 0);
  },
  relayBox(g) {
    kb(g, 0.24, 0.3, 0.12, '#8a8780', 0, 0, 0, 0, 0);
    kb(g, 0.06, 0.06, 0.005, '#e6c13a', 0, 0.2, 0.062, 0, 0);
    kb(g, 0.18, 0.004, 0.004, '#2a2826', 0, 0.08, 0.062, 0, 0);
  },
  pilotHelmet(g) {
    blob(g, 0.13, mat('#ece6d8'), 0, 0.12, 0);
    kb(g, 0.18, 0.06, 0.04, '#24302f', 0, 0.09, 0.1, 0, 0);
  },
  flightRecorder(g) {
    kb(g, 0.24, 0.16, 0.14, '#e8792a', 0, 0, 0, 0, 0);
    kc(g, 0.05, 0.05, 0.12, '#e8792a', 0, 0.08, 0.12, Math.PI / 2, 0);
    kb(g, 0.12, 0.03, 0.005, '#ece6d8', 0, 0.11, 0.071, 0, 0);
  },
  jerrycan(g) {
    kb(g, 0.34, 0.44, 0.16, '#4a5a3a', 0, 0, 0, 0, 0);
    kb(g, 0.18, 0.04, 0.06, '#4a5a3a', -0.06, 0.44, 0, 0, 0);
    kb(g, 0.05, 0.06, 0.05, '#2a2826', 0.12, 0.44, 0, 0, 0);
  },
  sandbag(g) {
    kb(g, 0.34, 0.1, 0.2, '#b8a378', 0, 0, 0, 0, 0);
    kb(g, 0.32, 0.1, 0.2, '#a89368', 0.02, 0.1, 0.01, 0, 0.2);
  },
  barbedWire(g) {
    kt(g, 0.14, 0.008, '#8a8780', 0, 0.02, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.12, 0.008, '#8a8780', 0.02, 0.05, 0.01, Math.PI / 2, Math.PI * 2);
  },
  camoNet(g) {
    kb(g, 0.36, 0.08, 0.26, '#4a5a3a', 0, 0, 0, 0, 0);
    kb(g, 0.34, 0.05, 0.24, '#5a6a3a', 0.01, 0.08, 0.01, 0, 0.15);
  },
  gasBottle(g) {
    kc(g, 0.08, 0.08, 0.3, '#b0472f', 0, 0.15, 0, 0, 0);
    blob(g, 0.08, mat('#b0472f'), 0, 0.3, 0);
    kc(g, 0.02, 0.02, 0.05, '#c9c6bc', 0, 0.39, 0, 0, 0);
  },
  handPump(g) {
    kc(g, 0.04, 0.04, 0.3, '#3f5a4a', 0, 0.15, 0, 0, 0);
    kc(g, 0.012, 0.012, 0.12, '#3f5a4a', 0.07, 0.24, 0, 0, Math.PI / 2);
    kc(g, 0.008, 0.008, 0.24, '#3f5a4a', -0.08, 0.36, 0, 0, -1.0);
  },
  milkCan(g) {
    kc(g, 0.1, 0.12, 0.26, '#a8a59c', 0, 0.13, 0, 0, 0);
    kc(g, 0.06, 0.1, 0.06, '#a8a59c', 0, 0.29, 0, 0, 0);
    kc(g, 0.065, 0.065, 0.03, '#a8a59c', 0, 0.335, 0, 0, 0);
  },
  horseshoe(g) {
    kt(g, 0.07, 0.015, '#6a6862', 0, 0.015, 0, Math.PI / 2, Math.PI * 1.4);
  },
  pitchfork(g) {
    kc(g, 0.012, 0.012, 0.6, '#8a6a45', 0, 0.02, 0, 0, Math.PI / 2);
    kb(g, 0.04, 0.01, 0.14, '#a8a59c', 0.3, 0.015, 0, 0, 0);
    kb(g, 0.14, 0.008, 0.008, '#a8a59c', 0.38, 0.015, -0.05, 0, 0);
    kb(g, 0.14, 0.008, 0.008, '#a8a59c', 0.38, 0.015, 0, 0, 0);
    kb(g, 0.14, 0.008, 0.008, '#a8a59c', 0.38, 0.015, 0.05, 0, 0);
  },
  boneMeal(g) {
    kb(g, 0.18, 0.22, 0.1, '#d8d0b8', 0, 0, 0, 0, 0);
    kb(g, 0.16, 0.04, 0.09, '#c8c0a8', 0, 0.22, 0, 0, 0);
    kb(g, 0.1, 0.06, 0.005, '#6b5034', 0, 0.08, 0.051, 0, 0);
  },
  tractorPart(g) {
    kc(g, 0.1, 0.1, 0.06, '#3f6a3f', 0, 0.1, 0, Math.PI / 2, 0);
    kc(g, 0.03, 0.03, 0.2, '#a8a59c', 0, 0.1, 0, Math.PI / 2, 0);
  },
  dashCam(g) {
    kb(g, 0.1, 0.06, 0.04, '#1d1d1b', 0, 0.02, 0, 0, 0);
    kc(g, 0.018, 0.018, 0.02, '#24302f', 0, 0.05, 0.025, Math.PI / 2, 0);
    kb(g, 0.03, 0.02, 0.02, '#2a2826', 0, 0, -0.01, 0, 0);
  },
  airFreshener(g) {
    cone(g, 0.07, 0.16, mat('#3f8a4a'), 0, 0.04, 0, 10);
    kb(g, 0.02, 0.04, 0.005, '#3f8a4a', 0, 0, 0, 0, 0);
    kc(g, 0.002, 0.002, 0.08, '#ece6d8', 0, 0.24, 0, 0, 0);
  },
  iceScraper(g) {
    kb(g, 0.12, 0.01, 0.1, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.06, 0.04, 0.12, '#1d1d1b', 0, 0, 0.1, 0, 0);
  },
  towRope(g) {
    kt(g, 0.1, 0.018, '#e6c13a', 0, 0.02, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.08, 0.018, '#e6c13a', 0, 0.055, 0, Math.PI / 2, Math.PI * 2);
    kb(g, 0.05, 0.02, 0.02, '#a8a59c', 0.12, 0, 0, 0, 0);
  },
  navi(g) {
    kb(g, 0.16, 0.1, 0.02, '#1d1d1b', 0, 0.02, 0, 0, 0);
    kb(g, 0.14, 0.08, 0.004, '#24302f', 0, 0.03, 0.012, 0, 0);
    kc(g, 0.03, 0.03, 0.02, '#1d1d1b', 0, 0.01, -0.02, 0, 0);
  },
  parkingDisc(g) {
    kb(g, 0.12, 0.004, 0.15, '#3f6a8a', 0, 0, 0, 0, 0);
    kc(g, 0.04, 0.04, 0.006, '#ece6d8', 0, 0.007, 0.02, 0, 0);
  },
  beadSeat(g) {
    blob(g, 0.02, mat('#8a6a45'), -0.08, 0.02, -0.15);
    blob(g, 0.02, mat('#8a6a45'), -0.08, 0.02, -0.1);
    blob(g, 0.02, mat('#8a6a45'), -0.08, 0.02, -0.05);
    blob(g, 0.02, mat('#8a6a45'), -0.08, 0.02, 0.0);
    blob(g, 0.02, mat('#8a6a45'), -0.08, 0.02, 0.05);
    blob(g, 0.02, mat('#8a6a45'), -0.08, 0.02, 0.1);
    blob(g, 0.02, mat('#8a6a45'), -0.08, 0.02, 0.15);
    blob(g, 0.02, mat('#8a6a45'), -0.04, 0.02, -0.15);
    blob(g, 0.02, mat('#8a6a45'), -0.04, 0.02, -0.1);
    blob(g, 0.02, mat('#8a6a45'), -0.04, 0.02, -0.05);
    blob(g, 0.02, mat('#8a6a45'), -0.04, 0.02, 0.0);
    blob(g, 0.02, mat('#8a6a45'), -0.04, 0.02, 0.05);
    blob(g, 0.02, mat('#8a6a45'), -0.04, 0.02, 0.1);
    blob(g, 0.02, mat('#8a6a45'), -0.04, 0.02, 0.15);
    blob(g, 0.02, mat('#8a6a45'), 0.0, 0.02, -0.15);
    blob(g, 0.02, mat('#8a6a45'), 0.0, 0.02, -0.1);
    blob(g, 0.02, mat('#8a6a45'), 0.0, 0.02, -0.05);
    blob(g, 0.02, mat('#8a6a45'), 0.0, 0.02, 0.0);
    blob(g, 0.02, mat('#8a6a45'), 0.0, 0.02, 0.05);
    blob(g, 0.02, mat('#8a6a45'), 0.0, 0.02, 0.1);
    blob(g, 0.02, mat('#8a6a45'), 0.0, 0.02, 0.15);
    blob(g, 0.02, mat('#8a6a45'), 0.04, 0.02, -0.15);
    blob(g, 0.02, mat('#8a6a45'), 0.04, 0.02, -0.1);
    blob(g, 0.02, mat('#8a6a45'), 0.04, 0.02, -0.05);
    blob(g, 0.02, mat('#8a6a45'), 0.04, 0.02, 0.0);
    blob(g, 0.02, mat('#8a6a45'), 0.04, 0.02, 0.05);
    blob(g, 0.02, mat('#8a6a45'), 0.04, 0.02, 0.1);
    blob(g, 0.02, mat('#8a6a45'), 0.04, 0.02, 0.15);
    blob(g, 0.02, mat('#8a6a45'), 0.08, 0.02, -0.15);
    blob(g, 0.02, mat('#8a6a45'), 0.08, 0.02, -0.1);
    blob(g, 0.02, mat('#8a6a45'), 0.08, 0.02, -0.05);
    blob(g, 0.02, mat('#8a6a45'), 0.08, 0.02, 0.0);
    blob(g, 0.02, mat('#8a6a45'), 0.08, 0.02, 0.05);
    blob(g, 0.02, mat('#8a6a45'), 0.08, 0.02, 0.1);
    blob(g, 0.02, mat('#8a6a45'), 0.08, 0.02, 0.15);
  },
  diary(g) {
    kb(g, 0.16, 0.03, 0.22, '#5a3a26', 0, 0, 0, 0, 0);
    kb(g, 0.15, 0.026, 0.21, '#ece6d8', 0.006, 0.002, 0, 0, 0);
    kb(g, 0.01, 0.002, 0.22, '#b0472f', -0.03, 0.03, 0, 0, 0);
  },
  lunchbox(g) {
    kb(g, 0.2, 0.07, 0.14, '#5a9a6a', 0, 0, 0, 0, 0);
    kb(g, 0.205, 0.02, 0.145, '#3f7a4f', 0, 0.07, 0, 0, 0);
  },
  pencilCase(g) {
    kb(g, 0.22, 0.06, 0.08, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.22, 0.006, 0.012, '#a8a59c', 0, 0.06, 0, 0, 0);
  },
  waterFilter(g) {
    kc(g, 0.018, 0.018, 0.24, '#3f6a8a', 0, 0.018, 0, 0, Math.PI / 2);
    kc(g, 0.012, 0.012, 0.04, '#2a2826', 0.14, 0.018, 0, 0, Math.PI / 2);
  },
  headlamp(g) {
    kt(g, 0.07, 0.012, '#2a2826', 0, 0.08, 0, 0, Math.PI * 2);
    kb(g, 0.06, 0.04, 0.03, '#e8792a', 0, 0.06, 0.07, 0, 0);
    kc(g, 0.015, 0.015, 0.006, '#fff2c0', 0, 0.08, 0.088, Math.PI / 2, 0);
  },
  emergencyBlanket(g) {
    kb(g, 0.2, 0.04, 0.14, '#c9a23a', 0, 0, 0, 0, 0);
    kb(g, 0.2, 0.006, 0.14, '#c8c8c0', 0, 0.04, 0, 0, 0);
  },
  gardenGnome(g) {
    kc(g, 0.06, 0.07, 0.12, '#3f6a8a', 0, 0.06, 0, 0, 0);
    blob(g, 0.045, mat('#e8c0a0'), 0, 0.15, 0);
    cone(g, 0.05, 0.12, mat('#b0472f'), 0, 0.17, 0, 10);
    blob(g, 0.035, mat('#ece6d8'), 0, 0.12, 0.035);
  },
  wheelbarrowWheel(g) {
    kt(g, 0.12, 0.04, '#1d1d1b', 0, 0.16, 0, 0, Math.PI * 2);
    kc(g, 0.05, 0.05, 0.06, '#b0472f', 0, 0.16, 0, Math.PI / 2, 0);
    kc(g, 0.01, 0.01, 0.18, '#a8a59c', 0, 0.16, 0, Math.PI / 2, 0);
  },
  hatchet(g) {
    kc(g, 0.014, 0.016, 0.32, '#8a6a45', 0, 0.05, 0, 0, Math.PI / 2);
    kb(g, 0.05, 0.12, 0.02, '#a8a59c', 0.15, 0, 0, 0, 0);
  },
  seedPackets(g) {
    kb(g, 0.1, 0.14, 0.006, '#e6c13a', -0.06, 0, 0, 0.15, 0);
    kb(g, 0.1, 0.14, 0.006, '#3f6a3f', 0.05, 0, 0.02, -0.1, 0);
    kb(g, 0.1, 0.14, 0.006, '#c87a3a', 0, 0, -0.03, 0.05, 0);
  },
  grillGrate(g) {
    kt(g, 0.16, 0.008, '#a8a59c', 0, 0.02, 0, Math.PI / 2, Math.PI * 2);
    kb(g, 0.3, 0.006, 0.006, '#a8a59c', 0, 0.017, -0.1, 0, 0);
    kb(g, 0.3, 0.006, 0.006, '#a8a59c', 0, 0.017, -0.05, 0, 0);
    kb(g, 0.3, 0.006, 0.006, '#a8a59c', 0, 0.017, 0.0, 0, 0);
    kb(g, 0.3, 0.006, 0.006, '#a8a59c', 0, 0.017, 0.05, 0, 0);
    kb(g, 0.3, 0.006, 0.006, '#a8a59c', 0, 0.017, 0.1, 0, 0);
  },
  deckChair(g) {
    kb(g, 0.24, 0.02, 0.24, '#a8a59c', 0, 0.2, 0, 0, 0);
    kb(g, 0.24, 0.28, 0.02, '#a8a59c', 0, 0.2, -0.12, 0, 0);
    kb(g, 0.22, 0.01, 0.22, '#3f6a8a', 0, 0.22, 0, 0, 0);
    kb(g, 0.02, 0.2, 0.02, '#a8a59c', -0.11, 0, 0.1, 0, 0);
    kb(g, 0.02, 0.2, 0.02, '#a8a59c', 0.11, 0, 0.1, 0, 0);
    kb(g, 0.02, 0.2, 0.02, '#a8a59c', -0.11, 0, -0.1, 0, 0);
    kb(g, 0.02, 0.2, 0.02, '#a8a59c', 0.11, 0, -0.1, 0, 0);
  },
  vise(g) {
    kb(g, 0.16, 0.04, 0.12, '#3f6a8a', 0, 0, 0, 0, 0);
    kb(g, 0.06, 0.1, 0.08, '#3f6a8a', -0.05, 0.04, 0, 0, 0);
    kb(g, 0.06, 0.1, 0.08, '#3f6a8a', 0.05, 0.04, 0, 0, 0);
    kc(g, 0.01, 0.01, 0.2, '#a8a59c', 0.12, 0.1, 0, 0, Math.PI / 2);
  },
  blender(g) {
    kb(g, 0.14, 0.1, 0.14, '#2a2826', 0, 0, 0, 0, 0);
    kc(g, 0.06, 0.05, 0.2, '#c8e0e8', 0, 0.2, 0, 0, 0);
    kc(g, 0.065, 0.065, 0.02, '#1d1d1b', 0, 0.31, 0, 0, 0);
  },
  microwave(g) {
    kb(g, 0.36, 0.2, 0.26, '#ece6d8', 0, 0, 0, 0, 0);
    kb(g, 0.22, 0.14, 0.005, '#24302f', -0.05, 0.03, 0.13, 0, 0);
    kb(g, 0.06, 0.14, 0.005, '#c9c6bc', 0.13, 0.03, 0.13, 0, 0);
  },
  knittingBasket(g) {
    kc(g, 0.13, 0.11, 0.12, '#b0894f', 0, 0.06, 0, 0, 0);
    blob(g, 0.04, mat('#b0472f'), -0.03, 0.12, 0.02);
    blob(g, 0.035, mat('#3f6a8a'), 0.04, 0.12, -0.02);
    kc(g, 0.004, 0.004, 0.22, '#8a6a45', 0, 0.16, 0, 0, 0.5);
  },
  slideProjector(g) {
    kb(g, 0.24, 0.12, 0.2, '#5a5a58', 0, 0, 0, 0, 0);
    kc(g, 0.035, 0.035, 0.08, '#1d1d1b', 0, 0.06, 0.13, Math.PI / 2, 0);
    kb(g, 0.2, 0.03, 0.06, '#3b3f3a', 0, 0.12, -0.04, 0, 0);
  },
  snowGlobe(g) {
    kc(g, 0.06, 0.07, 0.04, '#6b5034', 0, 0.02, 0, 0, 0);
    blob(g, 0.07, mat('#d8ecf0'), 0, 0.1, 0);
    cone(g, 0.025, 0.06, mat('#3f6a3f'), 0, 0.06, 0, 10);
  },
  photoAlbum(g) {
    kb(g, 0.24, 0.05, 0.2, '#6a3a2a', 0, 0, 0, 0, 0);
    kb(g, 0.23, 0.044, 0.19, '#ece6d8', 0.006, 0.003, 0, 0, 0);
    kb(g, 0.08, 0.002, 0.06, '#c9a23a', 0, 0.05, 0, 0, 0);
  },
  vinylRecords(g) {
    kb(g, 0.3, 0.3, 0.03, '#c87a3a', 0, 0, 0, 0, 0);
    kc(g, 0.14, 0.14, 0.006, '#1d1d1b', 0.04, 0.17, 0.02, Math.PI / 2, 0);
    kc(g, 0.04, 0.04, 0.008, '#b0472f', 0.04, 0.17, 0.022, Math.PI / 2, 0);
  },
  recordPlayer(g) {
    kb(g, 0.34, 0.08, 0.3, '#6b5034', 0, 0, 0, 0, 0);
    kc(g, 0.13, 0.13, 0.01, '#1d1d1b', -0.03, 0.085, 0, 0, 0);
    kc(g, 0.004, 0.004, 0.18, '#a8a59c', 0.12, 0.1, 0.04, 0, 1.2);
  },
  cassetteTapes(g) {
    kb(g, 0.1, 0.016, 0.065, '#2a2826', 0, 0, 0, 0, 0.2);
    kb(g, 0.1, 0.016, 0.065, '#c8c0a8', 0.01, 0.016, 0.01, 0, -0.1);
    kb(g, 0.1, 0.016, 0.065, '#b0472f', -0.01, 0.032, 0, 0, 0.3);
  },
  ashtray(g) {
    kc(g, 0.09, 0.07, 0.04, '#bcd8dc', 0, 0.02, 0, 0, 0);
    kc(g, 0.07, 0.06, 0.01, '#8aa8ac', 0, 0.04, 0, 0, 0);
  },
  fondueSet(g) {
    kc(g, 0.09, 0.07, 0.1, '#b0472f', 0, 0.12, 0, 0, 0);
    kc(g, 0.06, 0.06, 0.05, '#1d1d1b', 0, 0.025, 0, 0, 0);
    kc(g, 0.003, 0.003, 0.22, '#b0472f', -0.03, 0.2, 0, 0, -0.09);
    kc(g, 0.003, 0.003, 0.22, '#e6c13a', 0, 0.2, 0, 0, 0);
    kc(g, 0.003, 0.003, 0.22, '#3f6a8a', 0.03, 0.2, 0, 0, 0.09);
  },
  deerCall(g) {
    kc(g, 0.015, 0.012, 0.12, '#8a6a45', 0, 0.015, 0, 0, Math.PI / 2);
    kt(g, 0.02, 0.004, '#5a3a26', -0.07, 0.015, 0, 0, Math.PI * 2);
  },
  saltLick(g) {
    kb(g, 0.14, 0.1, 0.14, '#e8e0d8', 0, 0, 0, 0, 0);
    kc(g, 0.004, 0.004, 0.06, '#a8a59c', 0, 0.13, 0, 0, 0);
  },
  rangefinder(g) {
    kb(g, 0.1, 0.06, 0.04, '#4a5a3a', 0, 0, 0, 0, 0);
    kc(g, 0.018, 0.018, 0.02, '#24302f', -0.025, 0.03, 0.025, Math.PI / 2, 0);
    kc(g, 0.012, 0.012, 0.02, '#24302f', 0.025, 0.03, 0.025, Math.PI / 2, 0);
  },
  hipFlask(g) {
    kb(g, 0.1, 0.14, 0.03, '#a8a59c', 0, 0, 0, 0, 0);
    kc(g, 0.012, 0.012, 0.02, '#a8a59c', 0, 0.15, 0, 0, 0);
  },
  siphonPump(g) {
    kc(g, 0.025, 0.025, 0.12, '#e8792a', 0, 0.06, 0, 0, 0);
    kt(g, 0.08, 0.008, '#c8e0e8', 0.08, 0.1, 0, 0, Math.PI);
  },
  barrelTap(g) {
    kc(g, 0.02, 0.02, 0.08, '#c9a23a', 0, 0.04, 0, 0, Math.PI / 2);
    kb(g, 0.02, 0.06, 0.02, '#c9a23a', 0.02, 0.05, 0, 0, 0);
    kb(g, 0.06, 0.012, 0.012, '#b0472f', 0.02, 0.11, 0, 0, 0);
  },
  pondPump(g) {
    kb(g, 0.14, 0.1, 0.1, '#3f6a3f', 0, 0, 0, 0, 0);
    kc(g, 0.015, 0.015, 0.08, '#1d1d1b', 0, 0.14, 0, 0, 0);
  },
  cementBag(g) {
    kb(g, 0.3, 0.1, 0.2, '#c8c0b0', 0, 0, 0, 0.04, 0);
    kb(g, 0.12, 0.002, 0.08, '#b0472f', 0, 0.1, 0, 0, 0);
  },
  smartSpeaker(g) {
    kc(g, 0.05, 0.05, 0.14, '#2a2826', 0, 0.07, 0, 0, 0);
    box(g, 0.03, 0.006, 0.03, glow('#5ac8e0'), 0, 0.14, 0);
  },
  yogaMat(g) {
    kc(g, 0.05, 0.05, 0.4, '#8a5aa8', 0, 0.05, 0, 0, Math.PI / 2);
  },
  airFryer(g) {
    kb(g, 0.22, 0.26, 0.24, '#1d1d1b', 0, 0, 0, 0, 0);
    kb(g, 0.16, 0.1, 0.01, '#2a2826', 0, 0.04, 0.125, 0, 0);
    kb(g, 0.04, 0.02, 0.04, '#a8a59c', 0, 0.08, 0.14, 0, 0);
  },
  ledStrip(g) {
    kt(g, 0.08, 0.008, '#e8e8e0', 0, 0.01, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.06, 0.008, '#e8e8e0', 0, 0.025, 0, Math.PI / 2, Math.PI * 2);
    box(g, 0.02, 0.01, 0.02, glow('#5ac8e0'), 0.08, 0.01, 0);
  },
  robotVacuum(g) {
    kc(g, 0.15, 0.15, 0.04, '#2a2826', 0, 0.03, 0, 0, 0);
    kc(g, 0.03, 0.03, 0.01, '#a8a59c', 0, 0.055, 0.05, 0, 0);
    box(g, 0.01, 0.004, 0.01, glow('#5ae05a'), 0.05, 0.05, 0);
  },
  fitnessTracker(g) {
    kt(g, 0.04, 0.008, '#1d1d1b', 0, 0.04, 0, 0, Math.PI * 2);
    kb(g, 0.03, 0.012, 0.05, '#24302f', 0, 0.075, 0, 0, 0);
  },
  priceGun(g) {
    kb(g, 0.14, 0.08, 0.05, '#e8792a', 0, 0.06, 0, 0, 0);
    kb(g, 0.04, 0.08, 0.04, '#e8792a', -0.04, 0, 0, 0, 0);
    kc(g, 0.025, 0.025, 0.03, '#ece6d8', 0.04, 0.14, 0, Math.PI / 2, 0);
  },
  shopBasket(g) {
    kb(g, 0.3, 0.16, 0.2, '#b0472f', 0, 0, 0, 0, 0);
    kb(g, 0.26, 0.01, 0.16, '#8a3424', 0, 0.16, 0, 0, 0);
    kt(g, 0.1, 0.01, '#1d1d1b', 0, 0.18, 0, 0, Math.PI);
  },
  barcodeScanner(g) {
    kb(g, 0.06, 0.16, 0.05, '#1d1d1b', 0, 0, 0, 0.3, 0);
    kb(g, 0.08, 0.06, 0.06, '#1d1d1b', 0.04, 0.14, 0, 0, 0);
    box(g, 0.05, 0.04, 0.004, glow('#e05a3a'), 0.07, 0.15, 0.032);
  },
  aluFoil(g) {
    kb(g, 0.32, 0.05, 0.05, '#d8d8d0', 0, 0, 0, 0, 0);
    kc(g, 0.022, 0.022, 0.3, '#c8c8c8', 0, 0.025, 0.03, 0, Math.PI / 2);
  },
  storageJars(g) {
    kc(g, 0.05, 0.05, 0.12, '#c8e0d8', -0.06, 0.06, 0, 0, 0);
    kc(g, 0.05, 0.05, 0.12, '#c8e0d8', 0.06, 0.06, 0, 0, 0);
    kt(g, 0.05, 0.006, '#e8792a', -0.06, 0.12, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.05, 0.006, '#e8792a', 0.06, 0.12, 0, Math.PI / 2, Math.PI * 2);
  },
  pillOrganizer(g) {
    kb(g, 0.28, 0.03, 0.05, '#5a8ac8', 0, 0, 0, 0, 0);
    kb(g, 0.034, 0.006, 0.044, '#b0472f', -0.12, 0.03, 0, 0, 0);
    kb(g, 0.034, 0.006, 0.044, '#e8792a', -0.08, 0.03, 0, 0, 0);
    kb(g, 0.034, 0.006, 0.044, '#e6c13a', -0.04, 0.03, 0, 0, 0);
    kb(g, 0.034, 0.006, 0.044, '#3f6a3f', 0.0, 0.03, 0, 0, 0);
    kb(g, 0.034, 0.006, 0.044, '#3f6a8a', 0.04, 0.03, 0, 0, 0);
    kb(g, 0.034, 0.006, 0.044, '#8a5aa8', 0.08, 0.03, 0, 0, 0);
    kb(g, 0.034, 0.006, 0.044, '#ece6d8', 0.12, 0.03, 0, 0, 0);
  },
  thermometer(g) {
    kb(g, 0.03, 0.012, 0.14, '#ece6d8', 0, 0, 0, 0, 0);
    kb(g, 0.02, 0.003, 0.03, '#24302f', 0, 0.012, 0.03, 0, 0);
    kc(g, 0.006, 0.006, 0.02, '#a8a59c', 0, 0.006, -0.08, Math.PI / 2, 0);
  },
  coldPack(g) {
    kb(g, 0.16, 0.03, 0.12, '#7ab8e0', 0, 0, 0, 0, 0);
  },
  rollator(g) {
    kc(g, 0.01, 0.01, 0.45, '#a8a59c', -0.12, 0.25, -0.1, 0, 0);
    kc(g, 0.01, 0.01, 0.45, '#a8a59c', -0.12, 0.25, 0.1, 0, 0);
    kc(g, 0.01, 0.01, 0.45, '#a8a59c', 0.12, 0.25, -0.1, 0, 0);
    kc(g, 0.01, 0.01, 0.45, '#a8a59c', 0.12, 0.25, 0.1, 0, 0);
    kc(g, 0.03, 0.03, 0.02, '#1d1d1b', -0.12, 0.03, -0.1, 0, Math.PI / 2);
    kc(g, 0.03, 0.03, 0.02, '#1d1d1b', -0.12, 0.03, 0.1, 0, Math.PI / 2);
    kc(g, 0.03, 0.03, 0.02, '#1d1d1b', 0.12, 0.03, -0.1, 0, Math.PI / 2);
    kc(g, 0.03, 0.03, 0.02, '#1d1d1b', 0.12, 0.03, 0.1, 0, Math.PI / 2);
    kb(g, 0.24, 0.08, 0.16, '#2a2826', 0, 0.18, 0, 0, 0);
  },
  hearingAid(g) {
    kt(g, 0.025, 0.01, '#d8b8a0', 0, 0.03, 0, 0, Math.PI);
    blob(g, 0.012, mat('#d8b8a0'), 0.025, 0.012, 0);
  },
  iodine(g) {
    kc(g, 0.03, 0.03, 0.08, '#6a3a1a', 0, 0.04, 0, 0, 0);
    kc(g, 0.012, 0.012, 0.03, '#1d1d1b', 0, 0.095, 0, 0, 0);
  },
  stethoscope(g) {
    kt(g, 0.08, 0.008, '#1d1d1b', 0, 0.008, 0, Math.PI / 2, Math.PI * 2);
    kc(g, 0.025, 0.025, 0.012, '#a8a59c', 0.1, 0.006, 0.04, 0, 0);
    kt(g, 0.03, 0.005, '#a8a59c', -0.06, 0.006, -0.06, Math.PI / 2, Math.PI * 2);
  },
  mortar(g) {
    kc(g, 0.08, 0.06, 0.08, '#c8c0b0', 0, 0.04, 0, 0, 0);
    kc(g, 0.06, 0.06, 0.01, '#8a8478', 0, 0.081, 0, 0, 0);
    kc(g, 0.015, 0.02, 0.14, '#c8c0b0', 0.03, 0.12, 0, 0, -0.4);
  },
  caulkGun(g) {
    kc(g, 0.025, 0.025, 0.22, '#ece6d8', 0, 0.1, 0, 0, Math.PI / 2);
    kb(g, 0.03, 0.1, 0.03, '#3f6a8a', -0.09, 0, 0, 0, 0);
    kc(g, 0.004, 0.004, 0.26, '#a8a59c', 0, 0.135, 0, 0, Math.PI / 2);
  },
  drillBits(g) {
    kb(g, 0.2, 0.03, 0.1, '#3f6a8a', 0, 0, 0, 0, 0);
    kc(g, 0.004, 0.004, 0.07, '#a8a59c', -0.08, 0.04, 0, Math.PI / 2, 0);
    kc(g, 0.005, 0.005, 0.07, '#a8a59c', -0.055, 0.04, 0, Math.PI / 2, 0);
    kc(g, 0.006, 0.006, 0.07, '#a8a59c', -0.03, 0.04, 0, Math.PI / 2, 0);
    kc(g, 0.008, 0.008, 0.07, '#a8a59c', 0.02, 0.04, 0, Math.PI / 2, 0);
    kc(g, 0.009, 0.009, 0.07, '#a8a59c', 0.045, 0.04, 0, Math.PI / 2, 0);
    kc(g, 0.01, 0.01, 0.07, '#a8a59c', 0.07, 0.04, 0, Math.PI / 2, 0);
  },
  cableTies(g) {
    kt(g, 0.06, 0.006, '#1d1d1b', 0, 0.006, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.06, 0.006, '#1d1d1b', 0.03, 0.006, 0.02, Math.PI / 2, Math.PI * 2);
    kt(g, 0.06, 0.006, '#1d1d1b', -0.02, 0.006, 0.03, Math.PI / 2, Math.PI * 2);
    kb(g, 0.24, 0.02, 0.03, '#1d1d1b', 0.04, 0.01, -0.06, 0, 0);
  },
  pipeWrench(g) {
    kb(g, 0.3, 0.03, 0.03, '#b0472f', 0, 0, 0, 0, 0);
    kb(g, 0.06, 0.08, 0.03, '#a8a59c', 0.15, 0, 0, 0, 0);
    kb(g, 0.04, 0.02, 0.03, '#a8a59c', 0.12, 0.06, 0, 0, 0);
  },
  insulationRoll(g) {
    kc(g, 0.1, 0.1, 0.26, '#e6c13a', 0, 0.1, 0, 0, Math.PI / 2);
    kc(g, 0.103, 0.103, 0.12, '#e8e0c8', 0, 0.1, 0, 0, Math.PI / 2);
  },
  sandpaper(g) {
    kb(g, 0.2, 0.004, 0.14, '#c8a878', 0, 0, 0, 0, 0.1);
    kb(g, 0.2, 0.004, 0.14, '#a88858', 0, 0.004, 0, 0, -0.15);
    kb(g, 0.2, 0.004, 0.14, '#d8b888', 0, 0.008, 0, 0, 0.3);
  },
  measuringTape(g) {
    kb(g, 0.08, 0.08, 0.04, '#e6c13a', 0, 0, 0, 0, 0);
    kc(g, 0.02, 0.02, 0.045, '#1d1d1b', 0, 0.04, 0, Math.PI / 2, 0);
    kb(g, 0.12, 0.004, 0.02, '#e6c13a', 0.1, 0, 0, 0, 0);
  },
  windshieldFluid(g) {
    kb(g, 0.12, 0.24, 0.08, '#5ab0e0', 0, 0, 0, 0, 0);
    kc(g, 0.02, 0.02, 0.03, '#ece6d8', 0.03, 0.255, 0, 0, 0);
  },
  lotteryTickets(g) {
    kb(g, 0.1, 0.004, 0.06, '#e6c13a', 0.0, 0.0, 0.0, 0, 0.0);
    kb(g, 0.1, 0.004, 0.06, '#5ab07a', 0.02, 0.004, 0.01, 0, 0.4);
    kb(g, 0.1, 0.004, 0.06, '#b0472f', 0.04, 0.008, 0.02, 0, 0.8);
    kb(g, 0.1, 0.004, 0.06, '#3f6a8a', 0.06, 0.012, 0.03, 0, 1.2);
  },
  hotDogRoller(g) {
    kb(g, 0.34, 0.06, 0.24, '#a8a59c', 0, 0, 0, 0, 0);
    kc(g, 0.014, 0.014, 0.3, '#c9c6bc', 0, 0.074, -0.08, 0, Math.PI / 2);
    kc(g, 0.014, 0.014, 0.3, '#c9c6bc', 0, 0.074, -0.04, 0, Math.PI / 2);
    kc(g, 0.014, 0.014, 0.3, '#c9c6bc', 0, 0.074, 0.0, 0, Math.PI / 2);
    kc(g, 0.014, 0.014, 0.3, '#c9c6bc', 0, 0.074, 0.04, 0, Math.PI / 2);
    kc(g, 0.014, 0.014, 0.3, '#c9c6bc', 0, 0.074, 0.08, 0, Math.PI / 2);
  },
  motorcycleHelmet(g) {
    blob(g, 0.13, mat('#1d1d1b'), 0, 0.13, 0);
    kb(g, 0.18, 0.07, 0.02, '#24302f', 0, 0.12, 0.11, 0, 0);
  },
  oilFilter(g) {
    kc(g, 0.05, 0.05, 0.12, '#3f6a8a', 0, 0.06, 0, 0, 0);
    kc(g, 0.03, 0.03, 0.01, '#a8a59c', 0, 0.125, 0, 0, 0);
  },
  pulleyWheel(g) {
    kt(g, 0.1, 0.02, '#a8a59c', 0, 0.12, 0, 0, Math.PI * 2);
    kc(g, 0.03, 0.03, 0.05, '#2a2826', 0, 0.12, 0, Math.PI / 2, 0);
    kb(g, 0.03, 0.08, 0.06, '#a8a59c', 0, 0.22, 0, 0, 0);
  },
  tinCup(g) {
    kc(g, 0.04, 0.035, 0.08, '#e8e8e0', 0, 0.04, 0, 0, 0);
    kt(g, 0.025, 0.006, '#e8e8e0', 0.045, 0.045, 0, 0, Math.PI);
  },
  wishingCoins(g) {
    kc(g, 0.02, 0.02, 0.004, '#c87a3a', 0, 0.002, 0, 0, 0);
    kc(g, 0.02, 0.02, 0.004, '#c9a23a', 0.03, 0.006, 0.01, 0, 0);
    kc(g, 0.02, 0.02, 0.004, '#c87a3a', -0.02, 0.01, 0.03, 0, 0);
    kc(g, 0.02, 0.02, 0.004, '#c9c6bc', 0.01, 0.014, -0.03, 0, 0);
    kc(g, 0.02, 0.02, 0.004, '#c9a23a', 0.005, 0.018, 0.005, 0, 0);
  },
  timetablePoster(g) {
    kb(g, 0.3, 0.22, 0.01, '#ece6d8', 0, 0, 0, 0, 0);
    kb(g, 0.26, 0.03, 0.012, '#3f6a3f', 0, 0.18, 0, 0, 0);
    kb(g, 0.24, 0.006, 0.012, '#c9c6bc', 0, 0.04, 0, 0, 0);
    kb(g, 0.24, 0.006, 0.012, '#c9c6bc', 0, 0.07, 0, 0, 0);
    kb(g, 0.24, 0.006, 0.012, '#c9c6bc', 0, 0.1, 0, 0, 0);
    kb(g, 0.24, 0.006, 0.012, '#c9c6bc', 0, 0.13, 0, 0, 0);
  },
  ticketPrinter(g) {
    kb(g, 0.18, 0.12, 0.16, '#5a5a58', 0, 0, 0, 0, 0);
    kb(g, 0.1, 0.01, 0.004, '#ece6d8', 0, 0.06, 0.082, 0, 0);
  },
  bikeHelmet(g) {
    blob(g, 0.11, mat('#5ab07a'), 0, 0.07, 0);
    cone(g, 0.02, 0.04, mat('#e6c13a'), -0.04, 0.16, 0, 10);
    cone(g, 0.02, 0.04, mat('#e6c13a'), 0.02, 0.17, 0, 10);
  },
  lostGlove(g) {
    kb(g, 0.1, 0.025, 0.16, '#c87a3a', 0, 0, 0, 0, 0.3);
    kb(g, 0.03, 0.025, 0.06, '#c87a3a', -0.06, 0, 0.03, 0, 0.9);
  },
  benchSlats(g) {
    kb(g, 0.4, 0.025, 0.07, '#8a6a45', 0, 0, -0.08, 0, 0);
    kb(g, 0.4, 0.025, 0.07, '#8a6a45', 0, 0, 0, 0, 0);
    kb(g, 0.4, 0.025, 0.07, '#8a6a45', 0, 0.025, 0.04, 0, 0.1);
  },
  cockpitGauge(g) {
    kc(g, 0.07, 0.07, 0.04, '#1d1d1b', 0, 0.07, 0, Math.PI / 2, 0);
    kc(g, 0.06, 0.06, 0.005, '#ece6d8', 0, 0.07, 0.022, Math.PI / 2, 0);
    kb(g, 0.004, 0.05, 0.003, '#e8792a', 0, 0.06, 0.026, 0.7, 0);
  },
  pilotHeadset(g) {
    kt(g, 0.09, 0.012, '#2a2826', 0, 0.09, 0, 0, Math.PI);
    kc(g, 0.045, 0.045, 0.04, '#4a5a3a', -0.09, 0.08, 0, 0, Math.PI / 2);
    kc(g, 0.045, 0.045, 0.04, '#4a5a3a', 0.09, 0.08, 0, 0, Math.PI / 2);
  },
  stretcher(g) {
    kb(g, 0.5, 0.02, 0.18, '#e8792a', 0, 0.04, 0, 0, 0);
    kc(g, 0.01, 0.01, 0.6, '#a8a59c', 0, 0.05, 0.09, 0, Math.PI / 2);
    kc(g, 0.01, 0.01, 0.6, '#a8a59c', 0, 0.05, -0.09, 0, Math.PI / 2);
  },
  fieldPhone(g) {
    kb(g, 0.2, 0.12, 0.16, '#4a5a3a', 0, 0, 0, 0, 0);
    kc(g, 0.012, 0.012, 0.08, '#1d1d1b', 0.11, 0.07, 0, 0, Math.PI / 2);
    kb(g, 0.2, 0.03, 0.05, '#1d1d1b', 0, 0.12, -0.03, 0, 0);
  },
  seaBag(g) {
    kc(g, 0.1, 0.1, 0.32, '#4a5a3a', 0, 0.16, 0, 0, 0);
    kc(g, 0.04, 0.1, 0.04, '#4a5a3a', 0, 0.34, 0, 0, 0);
  },
  mudFlap(g) {
    kb(g, 0.26, 0.32, 0.012, '#1d1d1b', 0, 0, 0, 0, 0);
    kb(g, 0.18, 0.06, 0.013, '#a8a59c', 0, 0.2, 0.001, 0, 0);
  },
  mapCase(g) {
    kb(g, 0.24, 0.03, 0.3, '#5a3a26', 0, 0, 0, 0, 0);
    kb(g, 0.2, 0.002, 0.24, '#d8e0d0', 0, 0.03, 0, 0, 0);
  },
  radioBattery(g) {
    kb(g, 0.16, 0.22, 0.08, '#4a5a3a', 0, 0, 0, 0, 0);
    kb(g, 0.04, 0.02, 0.03, '#1d1d1b', -0.04, 0.22, 0, 0, 0);
    kb(g, 0.04, 0.02, 0.03, '#b0472f', 0.04, 0.22, 0, 0, 0);
  },
  geigerCounter(g) {
    kb(g, 0.2, 0.1, 0.1, '#e6c13a', 0, 0, 0, 0, 0);
    kc(g, 0.04, 0.04, 0.005, '#ece6d8', -0.04, 0.06, 0.051, Math.PI / 2, 0);
    kc(g, 0.015, 0.015, 0.16, '#2a2826', 0.18, 0.05, 0, 0, Math.PI / 2);
    kb(g, 0.1, 0.02, 0.02, '#1d1d1b', 0, 0.12, 0, 0, 0);
  },
  airFilter(g) {
    kb(g, 0.26, 0.26, 0.06, '#a8a59c', 0, 0, 0, 0, 0);
    kb(g, 0.22, 0.22, 0.062, '#4a4a44', 0, 0.02, 0, 0, 0);
  },
  ventFan(g) {
    kc(g, 0.14, 0.14, 0.04, '#a8a59c', 0, 0.14, 0, Math.PI / 2, 0);
    kb(g, 0.24, 0.03, 0.005, '#2a2826', 0, 0.125, 0.025, 0.6, 0);
    kb(g, 0.24, 0.03, 0.005, '#2a2826', 0, 0.125, 0.025, -0.6, 0);
    kc(g, 0.03, 0.03, 0.05, '#1d1d1b', 0, 0.14, 0.01, Math.PI / 2, 0);
  },
  guardLog(g) {
    kb(g, 0.16, 0.03, 0.22, '#4a5a3a', 0, 0, 0, 0, 0);
    kb(g, 0.15, 0.026, 0.21, '#ece6d8', 0.006, 0.002, 0, 0, 0);
    kb(g, 0.06, 0.03, 0.002, '#ece6d8', 0, 0.005, 0.111, 0, 0);
  },
  bunkSprings(g) {
    kt(g, 0.025, 0.005, '#a8a59c', -0.07, 0.01, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', -0.07, 0.03, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', -0.07, 0.05, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', -0.07, 0.07, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', -0.07, 0.09, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0, 0.01, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0, 0.03, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0, 0.05, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0, 0.07, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0, 0.09, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0.07, 0.01, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0.07, 0.03, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0.07, 0.05, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0.07, 0.07, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.025, 0.005, '#a8a59c', 0.07, 0.09, 0, Math.PI / 2, Math.PI * 2);
  },
  tentPegs(g) {
    kb(g, 0.012, 0.012, 0.2, '#a8a59c', -0.06, 0, 0, 0, -0.2);
    kb(g, 0.012, 0.012, 0.2, '#a8a59c', -0.03, 0, 0, 0, -0.1);
    kb(g, 0.012, 0.012, 0.2, '#a8a59c', 0.0, 0, 0, 0, 0.0);
    kb(g, 0.012, 0.012, 0.2, '#a8a59c', 0.03, 0, 0, 0, 0.1);
    kb(g, 0.012, 0.012, 0.2, '#a8a59c', 0.06, 0, 0, 0, 0.2);
  },
  washBasin(g) {
    kc(g, 0.16, 0.12, 0.06, '#3f6a8a', 0, 0.03, 0, 0, 0);
    kc(g, 0.14, 0.14, 0.005, '#2f5a7a', 0, 0.058, 0, 0, 0);
  },
  fireSteel(g) {
    kc(g, 0.012, 0.012, 0.12, '#2a2826', 0, 0.012, 0, 0, Math.PI / 2);
    kb(g, 0.05, 0.005, 0.03, '#a8a59c', 0.04, 0.02, 0.03, 0, 0);
    kc(g, 0.015, 0.015, 0.04, '#e8792a', -0.08, 0.012, 0, 0, Math.PI / 2);
  },
  mosquitoNet(g) {
    kc(g, 0.1, 0.12, 0.12, '#e8e8e0', 0, 0.06, 0, 0, 0);
    cone(g, 0.1, 0.08, mat('#e8e8e0'), 0, 0.12, 0, 10);
  },
  antennaCable(g) {
    kt(g, 0.1, 0.02, '#1d1d1b', 0, 0.02, 0, Math.PI / 2, Math.PI * 2);
    kt(g, 0.08, 0.02, '#1d1d1b', 0, 0.06, 0, Math.PI / 2, Math.PI * 2);
    kc(g, 0.012, 0.012, 0.04, '#c9a23a', 0.12, 0.02, 0, 0, Math.PI / 2);
  },
  aviationLight(g) {
    kc(g, 0.06, 0.07, 0.06, '#2a2826', 0, 0.03, 0, 0, 0);
    blob(g, 0.055, mat('#e05a3a'), 0, 0.09, 0);
    box(g, 0.02, 0.02, 0.02, glow('#ff6a4a'), 0, 0.11, 0);
  },
  circuitBoard(g) {
    kb(g, 0.2, 0.006, 0.14, '#2f6a3a', 0, 0, 0, 0, 0);
    kb(g, 0.04, 0.012, 0.04, '#1d1d1b', -0.04, 0.006, 0.02, 0, 0);
    kb(g, 0.03, 0.01, 0.02, '#1d1d1b', 0.05, 0.006, -0.03, 0, 0);
    kc(g, 0.01, 0.01, 0.02, '#c9a23a', 0.06, 0.016, 0.04, 0, 0);
  },
  cargoNet(g) {
    kb(g, 0.3, 0.06, 0.24, '#5a6a3a', 0, 0, 0, 0, 0);
    kt(g, 0.05, 0.008, '#3f4a2a', -0.08, 0.065, -0.06, Math.PI / 2, Math.PI * 2);
    kt(g, 0.05, 0.008, '#3f4a2a', -0.08, 0.065, 0.06, Math.PI / 2, Math.PI * 2);
    kt(g, 0.05, 0.008, '#3f4a2a', 0.08, 0.065, -0.06, Math.PI / 2, Math.PI * 2);
    kt(g, 0.05, 0.008, '#3f4a2a', 0.08, 0.065, 0.06, Math.PI / 2, Math.PI * 2);
  },
  gpsBeacon(g) {
    kb(g, 0.1, 0.14, 0.06, '#e8792a', 0, 0, 0, 0, 0);
    kc(g, 0.004, 0.004, 0.16, '#1d1d1b', 0.03, 0.22, 0, 0, 0);
    box(g, 0.02, 0.01, 0.02, glow('#5ae05a'), -0.02, 0.14, 0);
  },
};

export function buildFurniture(kind: FurnitureId | KramId): Model {
  const group = new THREE.Group();
  if (kind in KRAM_BUILDERS) {
    KRAM_BUILDERS[kind as KramId](group);
    return { group };
  }
  const light = BUILDERS[kind as FurnitureId](group) ?? undefined;
  return { group, light };
}

/** Schutthaufen. */
export function buildRubble(w: number, d: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#6a6357', '#5a5246', '#7a7062', '#4a443c'];
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const n = Math.round(5 + w * d * 3);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * (w - 0.3);
    const z = (r() - 0.5) * (d - 0.3);
    const size = 0.18 + r() * 0.3;
    if (r() < 0.5) blob(g, size, mat(colors[i % colors.length]), x, size * 0.6, z);
    else box(g, size * 2, size * 0.6, size * 1.2, mat(colors[(i + 1) % colors.length]), x, 0, z, r() * 3);
  }
  box(g, w * 0.7, 0.04, 0.12, mat('#7a5a3a'), 0, 0.2, 0, 0.4);
  return g;
}
