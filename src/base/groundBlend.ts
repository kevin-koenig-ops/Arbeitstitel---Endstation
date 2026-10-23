// Weiche Übergänge im Zuhause: Wo zwei Böden aneinanderstoßen (zurückerobert, verwildert,
// Gelände rund ums Grundstück), legt sich ein Streifen der Nachbartextur darüber und
// blendet langsam aus, etwa 1,5 m in jede Richtung. Wie die weichen Ränder auf der Karte.
//
// So geht es: Das Grundstück wird in halbe Meter geteilt. Für jede Ecke zählt, wie viel von
// jeder Bodenart im Umkreis liegt (0 bis 1). Auf jedem Stück, das selbst eine andere Art ist,
// wird die Nachbarart mit genau diesem Anteil als Deckkraft darübergelegt.

import * as THREE from 'three';
import { groundOverlayMaterial, groundUV, type GroundTex } from './groundTextures';

export interface BlendClass {
  /** Bodenbild (null: schlichte Farbe, wird nicht überblendet). */
  kind: GroundTex | null;
  /** Tönung wie beim normalen Boden. */
  tint: [number, number, number];
}

/** Stücke je Meter. */
const SUB = 2;
/** Breite des Übergangs in Stücken je Seite (3 = 1,5 m). */
const RAD = 3;

/**
 * Baut die Übergangs-Streifen. `classOf(x, y)` gibt für jedes Feld des Grundstücks die
 * Bodenart (Index in `classes`), außerhalb gilt `outer`.
 */
export function buildGroundBlend(opts: {
  plot: number;
  classes: BlendClass[];
  classOf: (x: number, y: number) => number;
  outer: number;
}): THREE.Mesh[] {
  const { plot, classes, classOf, outer } = opts;
  const half = plot / 2;
  // Rand ums Grundstück: so weit reicht der Übergang nach draußen, dazu Platz für den Umkreis
  const M = RAD * 2;
  const N = plot * SUB + 2 * M;
  const cls = new Int8Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const cx = Math.floor((i - M) / SUB);
      const cy = Math.floor((j - M) / SUB);
      cls[j * N + i] = cx < 0 || cy < 0 || cx >= plot || cy >= plot ? outer : classOf(cx, cy);
    }
  // Summen-Tabellen je Bodenart, damit jeder Umkreis nur vier Zugriffe kostet
  const S = N + 1;
  const sums = classes.map((_, c) => {
    const t = new Int32Array(S * S);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) t[(j + 1) * S + i + 1] = (cls[j * N + i] === c ? 1 : 0) + t[j * S + i + 1] + t[(j + 1) * S + i] - t[j * S + i];
    return t;
  });
  const area = (2 * RAD) ** 2;
  /** Anteil der Bodenart c rund um die Ecke (vi, vj). */
  const weight = (c: number, vi: number, vj: number) => {
    const t = sums[c];
    const i0 = vi - RAD;
    const j0 = vj - RAD;
    const i1 = vi + RAD;
    const j1 = vj + RAD;
    return (t[j1 * S + i1] - t[j0 * S + i1] - t[j1 * S + i0] + t[j0 * S + i0]) / area;
  };
  const world = (v: number) => (v - M) / SUB - half;
  // Auf dem Grundstück liegt der Boden auf 0, draußen 3 cm tiefer
  const yAt = (x: number, z: number) => (Math.abs(x) <= half && Math.abs(z) <= half ? 0 : -0.03);

  const meshes: THREE.Mesh[] = [];
  classes.forEach((cl, c) => {
    if (!cl.kind) return;
    const kind = cl.kind;
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    for (let j = RAD; j < N - RAD; j++)
      for (let i = RAD; i < N - RAD; i++) {
        if (cls[j * N + i] === c) continue;
        const w = [weight(c, i, j), weight(c, i + 1, j), weight(c, i, j + 1), weight(c, i + 1, j + 1)];
        if (Math.max(...w) < 0.02) continue;
        const corner = (k: number): [number, number, number] => {
          const vi = i + (k % 2);
          const vj = j + (k >> 1);
          return [world(vi), world(vj), w[k]];
        };
        for (const tri of [
          [0, 2, 1],
          [1, 2, 3],
        ]) {
          for (const k of tri) {
            const [x, z, a] = corner(k);
            pos.push(x, yAt(x, z), z);
            // Sanfter Verlauf statt gerader Rampe
            col.push(cl.tint[0], cl.tint[1], cl.tint[2], a * a * (3 - 2 * a));
            uv.push(...groundUV(kind, x, z));
          }
        }
      }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, groundOverlayMaterial(kind));
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    meshes.push(mesh);
  });
  return meshes;
}
