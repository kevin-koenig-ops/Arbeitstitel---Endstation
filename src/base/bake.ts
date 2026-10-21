// Viele kleine Teile zu wenigen großen Meshes verschmelzen.
// Handys schaffen wenige große Zeichenaufrufe viel besser als tausende kleine.
// Farben werden pro Ecke gespeichert, deshalb reicht ein gemeinsames Material.

import * as THREE from 'three';

export interface Part {
  pos: Float32Array;
  col: Float32Array;
  /** Normalen: rund bei runden Formen (Bäume, Fässer), sonst flach pro Fläche. */
  nrm: Float32Array;
  /** Oberflächenart je Ecke (für den Stil „Gemalt“), siehe PAT in models.ts. */
  pat: Float32Array;
}

export interface Template {
  lit: Part;
  glow: Part;
  /** Flackernde Flammen bleiben einzeln (sie bewegen sich). */
  flames: { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[];
  box: THREE.Box3;
}

/** Gemeinsame Materialien für alles Verschmolzene. */
export const LIT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02, flatShading: true });
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
GLOW.userData.glow = true;

/** Runde Formen behalten ihre weichen Normalen, eckige werden flach. */
function isRound(g: THREE.BufferGeometry): boolean {
  if (g.userData?.round) return true;
  const p = (g as unknown as { parameters?: Record<string, number> }).parameters ?? {};
  switch (g.type) {
    case 'IcosahedronGeometry':
    case 'DodecahedronGeometry':
    case 'OctahedronGeometry':
      return (p.detail ?? 0) > 0;
    case 'SphereGeometry':
    case 'TorusGeometry':
    case 'CapsuleGeometry':
    case 'RoundedBoxGeometry':
      return true;
    case 'CylinderGeometry':
    case 'ConeGeometry':
      return (p.radialSegments ?? 0) >= 7;
    default:
      return false;
  }
}

/** Eine Gruppe aus Meshes in eine Vorlage (Ecken + Farben) umwandeln. */
export function bake(group: THREE.Object3D): Template {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const lit = { pos: [] as number[], col: [] as number[], nrm: [] as number[], pat: [] as number[] };
  const glow = { pos: [] as number[], col: [] as number[], nrm: [] as number[], pat: [] as number[] };
  const n = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const flames: Template['flames'] = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mt = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    if (mesh.name === 'flame') {
      flames.push({ geo: mesh.geometry, mat, matrix: mt });
      return;
    }
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = g.getAttribute('position');
    const gn = isRound(mesh.geometry) ? g.getAttribute('normal') : null;
    nm.getNormalMatrix(mt);
    const pat = (mat.userData?.pat as number | undefined) ?? 0;
    let target = lit;
    color.copy(mat.color);
    if ((mat as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial) target = glow;
    else if (mat.emissive && mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0) {
      color.lerp(mat.emissive, 0.6);
      target = glow;
    }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mt);
      target.pos.push(v.x, v.y, v.z);
      target.col.push(color.r, color.g, color.b);
      target.pat.push(pat);
      box.expandByPoint(v);
      if (gn) {
        n.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
      } else {
        // Flache Normale des Dreiecks
        const t0 = i - (i % 3);
        a.fromBufferAttribute(p, t0).applyMatrix4(mt);
        b.fromBufferAttribute(p, t0 + 1).applyMatrix4(mt);
        c.fromBufferAttribute(p, t0 + 2).applyMatrix4(mt);
        n.subVectors(c, b).cross(a.sub(b)).normalize();
      }
      target.nrm.push(n.x, n.y, n.z);
    }
    if (g !== mesh.geometry) g.dispose();
  });
  const part = (x: typeof lit): Part => ({ pos: new Float32Array(x.pos), col: new Float32Array(x.col), nrm: new Float32Array(x.nrm), pat: new Float32Array(x.pat) });
  return {
    lit: part(lit),
    glow: part(glow),
    flames,
    box,
  };
}

/** Sammelt Vorlagen mit Position/Drehung und baut daraus ein einziges Mesh. */
export class Assembler {
  private parts: { p: Part; m: THREE.Matrix4 }[] = [];
  private count = 0;

  add(p: Part, m: THREE.Matrix4) {
    if (!p.pos.length) return;
    this.parts.push({ p, m });
    this.count += p.pos.length;
  }

  get empty() {
    return this.count === 0;
  }

  geometry(): THREE.BufferGeometry {
    const pos = new Float32Array(this.count);
    const col = new Float32Array(this.count);
    const nrm = new Float32Array(this.count);
    const pat = new Float32Array(this.count / 3);
    let o = 0;
    for (const { p, m } of this.parts) {
      const e = m.elements;
      const src = p.pos;
      const sn = p.nrm;
      for (let i = 0; i < src.length; i += 3) {
        const x = src[i];
        const y = src[i + 1];
        const z = src[i + 2];
        pos[o + i] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[o + i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[o + i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        // Drehung (mit gleichmäßiger Skalierung) auch auf die Normalen
        const nx = sn[i];
        const ny = sn[i + 1];
        const nz = sn[i + 2];
        const rx = e[0] * nx + e[4] * ny + e[8] * nz;
        const ry = e[1] * nx + e[5] * ny + e[9] * nz;
        const rz = e[2] * nx + e[6] * ny + e[10] * nz;
        const l = Math.hypot(rx, ry, rz) || 1;
        nrm[o + i] = rx / l;
        nrm[o + i + 1] = ry / l;
        nrm[o + i + 2] = rz / l;
      }
      col.set(p.col, o);
      pat.set(p.pat, o / 3);
      o += src.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('pat', new THREE.BufferAttribute(pat, 1));
    g.computeBoundingSphere();
    return g;
  }

  /** Fertiges Mesh (oder null, wenn leer). */
  mesh(mat: THREE.Material, shadows = true): THREE.Mesh | null {
    if (this.empty) return null;
    const mesh = new THREE.Mesh(this.geometry(), mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

/** Matrix für Position (Welt) und Drehung um y. */
export function placeMatrix(x: number, y: number, z: number, ry = 0, s = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(ry);
  if (s !== 1) m.scale(new THREE.Vector3(s, s, s));
  m.setPosition(x, y, z);
  return m;
}

/** Vorlagen-Speicher: jede Vorlage wird nur einmal gebaut. */
export class TemplateCache {
  private map = new Map<string, Template>();
  get(key: string, build: () => THREE.Object3D): Template {
    let t = this.map.get(key);
    if (!t) {
      const g = build();
      t = bake(g);
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name !== 'flame') mesh.geometry.dispose();
      });
      this.map.set(key, t);
    }
    return t;
  }
}
