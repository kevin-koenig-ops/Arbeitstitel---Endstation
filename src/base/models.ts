// Low-Poly-Modelle für die Endstation, aus einfachen Formen gebaut.
// Maße in Metern. Jedes Modell steht mittig auf dem Ursprung; Breite entlang x,
// Tiefe entlang z (Rückseite bei -z), so wie die Grundfläche in furniture.ts.

import * as THREE from 'three';
import type { FurnitureId } from '../core/furniture';

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
  return add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y + h / 2, z, ry);
}

/** Zylinder; y ist die Unterkante. */
export function cyl(g: THREE.Object3D, rTop: number, rBot: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 8) {
  return add(g, new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m), x, y + h / 2, z);
}

export function blob(g: THREE.Object3D, r: number, m: M, x: number, y: number, z: number) {
  const mesh = add(g, new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m), x, y, z);
  mesh.rotation.set(x * 3.1, y * 2.3, z * 1.7);
  return mesh;
}

export const WOOD = '#8a6a45';
export const WOOD_DARK = '#6b5034';
export const METAL = '#3b3f3a';

/** Kegel (Flamme, Blatt, Hut); y ist die Unterkante. */
export function cone(g: THREE.Object3D, r: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 6) {
  return add(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m), x, y + h / 2, z);
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
    add(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow('#fff1c4')), 0, 1.42, 0).castShadow = false;
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
      if (i % 2) add(g, new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#b0472f')), x + 0.06, 0.74, 0.2);
    }
  },
  clock(g) {
    const green = mat('#2f4a3c');
    cyl(g, 0.16, 0.2, 0.08, green, 0, 0, 0, 8);
    cyl(g, 0.045, 0.045, 2.3, green, 0, 0.08, 0, 8);
    const body = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 20), green), 0, 2.55, 0);
    body.rotation.x = Math.PI / 2;
    for (const z of [-0.075, 0.075]) {
      const face = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.01, 20), mat('#efe9da')), 0, 2.55, z);
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
      if (i > 0 && i < N) add(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), glow(bulbs[i % bulbs.length])), x, y - 0.06, 0).castShadow = false;
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
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat('#b0472f')), x, y, z);
    blob(g, 0.2, mat('#3b2f22'), 0, 0.02, 0).scale.set(1.4, 0.25, 1.4);
  },
};

export function buildFurniture(kind: FurnitureId): Model {
  const group = new THREE.Group();
  const light = BUILDERS[kind](group) ?? undefined;
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

/** Der alte Bus, draußen geparkt. Länge entlang z. */
export function buildBus(): THREE.Group {
  const g = new THREE.Group();
  const ivory = mat('#b9ac8a');
  const lower = mat('#7a6d55');
  box(g, 2.5, 1.0, 10, lower, 0, 0.35, 0);
  box(g, 2.5, 1.7, 10, ivory, 0, 1.35, 0);
  box(g, 2.52, 0.12, 10.02, mat('#8f4b2b'), 0, 1.3, 0);
  box(g, 2.54, 0.85, 8.2, mat('#232421'), 0, 1.75, -0.6);
  box(g, 2.3, 0.08, 9.8, mat('#9c917a'), 0, 3.05, 0);
  for (const z of [-3.4, 3.3])
    for (const x of [-1.2, 1.2]) {
      const w = add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 12), mat('#161614')), x, 0.48, z);
      w.rotation.z = Math.PI / 2;
    }
  // Front mit Zielanzeige
  box(g, 2.2, 1.0, 0.04, mat('#1b1a17'), 0, 1.75, 5.0);
  const sign = add(g, new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 0.03), glow('#ffb22e')), 0, 2.72, 5.02);
  sign.name = 'busSign';
  box(g, 0.3, 0.16, 0.04, glow('#ffe6a8'), -0.85, 0.75, 5.02);
  box(g, 0.3, 0.16, 0.04, glow('#ffe6a8'), 0.85, 0.75, 5.02);
  return g;
}
