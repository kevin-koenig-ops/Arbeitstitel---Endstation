// Brücken als 3D-Modell: Fahrbahn mit leichtem Buckel, Seitenwände, Geländer, Pfeiler.
// Welche Wegstücke Brücken sind, steht in den Kartendaten (brunnel = bridge).
// Reine Rechnung ohne Browser (wie houseMesh.ts); gezeichnet wird in treeLayer.ts.

import { block, dist, quad, type MeshData, type Pt, type RGB } from './meshKit';

export type BridgeKind = 'major' | 'minor' | 'path' | 'rail';

export interface BridgeSpec {
  /** Verlauf in Metern (x Osten, y Norden). */
  path: Pt[];
  kind: BridgeKind;
}

/** Breite der Fahrbahn (Meter) je Wegart. */
const WIDTH: Record<BridgeKind, number> = { major: 9, minor: 6.5, path: 2.6, rail: 5 };
const DECK: Record<BridgeKind, RGB> = { major: [0.5, 0.49, 0.46], minor: [0.47, 0.46, 0.43], path: [0.5, 0.38, 0.26], rail: [0.44, 0.41, 0.37] };
const CONCRETE: RGB = [0.66, 0.64, 0.6];
const RAIL: RGB = [0.36, 0.32, 0.28];
const WOOD: RGB = [0.42, 0.31, 0.21];

/** Höhe der Fahrbahn an Stelle s (0 … L): ein flacher Buckel, an den Enden auf dem Boden. */
function heightAt(s: number, L: number, top: number): number {
  const t = (2 * s) / L - 1;
  return 0.06 + top * (1 - t * t);
}

export function addBridge(b: BridgeSpec, m: MeshData) {
  const path = b.path;
  if (path.length < 2) return;
  const lens = path.slice(1).map((p, i) => dist(path[i], p));
  const L = lens.reduce((a, c) => a + c, 0);
  if (L < 4) return;
  const w = WIDTH[b.kind];
  const top = Math.max(0.35, Math.min(2.2, L * 0.05));
  const wood = b.kind === 'path';
  const deckCol = DECK[b.kind];
  const sideCol = wood ? WOOD : CONCRETE;
  const railCol = wood ? WOOD : RAIL;
  const thick = wood ? 0.3 : 0.6;

  // In Stücke von höchstens 2,5 m teilen, damit der Buckel rund wird
  const pts: { p: Pt; s: number; dir: Pt }[] = [];
  let s0 = 0;
  for (let i = 0; i < lens.length; i++) {
    const a = path[i];
    const c = path[i + 1];
    const n = Math.max(1, Math.ceil(lens[i] / 2.5));
    const dir: Pt = [(c[0] - a[0]) / (lens[i] || 1), (c[1] - a[1]) / (lens[i] || 1)];
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      pts.push({ p: [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t], s: s0 + lens[i] * t, dir });
    }
    s0 += lens[i];
  }

  // Querrichtung je Punkt (gemittelt an Knicken)
  const side = pts.map((q, i) => {
    const d0 = pts[Math.max(0, i - 1)].dir;
    const d1 = q.dir;
    const dx = d0[0] + d1[0];
    const dy = d0[1] + d1[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l] as Pt;
  });
  const edge = (i: number, sgn: number, off = w / 2): Pt => [pts[i].p[0] + side[i][0] * off * sgn, pts[i].p[1] + side[i][1] * off * sgn];

  for (let i = 0; i < pts.length - 1; i++) {
    const h0 = heightAt(pts[i].s, L, top);
    const h1 = heightAt(pts[i + 1].s, L, top);
    const l0 = edge(i, 1);
    const r0 = edge(i, -1);
    const l1 = edge(i + 1, 1);
    const r1 = edge(i + 1, -1);
    // Fahrbahn
    quad(m, [r0[0], r0[1], h0], [r1[0], r1[1], h1], [l1[0], l1[1], h1], [l0[0], l0[1], h0], [0, 0], [0, 0], [0, 0], [0, 0], deckCol);
    // Seitenwände (unter der Fahrbahn) und Unterseite
    for (const [a, c] of [
      [l0, l1],
      [r1, r0],
    ] as [Pt, Pt][]) {
      const ha = a === l0 ? h0 : h1;
      const hc = c === l1 ? h1 : h0;
      quad(m, [a[0], a[1], Math.max(0, ha - thick)], [c[0], c[1], Math.max(0, hc - thick)], [c[0], c[1], hc], [a[0], a[1], ha], [0, 0], [0, 0], [0, 0], [0, 0], sideCol);
    }
    quad(m, [l0[0], l0[1], Math.max(0, h0 - thick)], [l1[0], l1[1], Math.max(0, h1 - thick)], [r1[0], r1[1], Math.max(0, h1 - thick)], [r0[0], r0[1], Math.max(0, h0 - thick)], [0, 0], [0, 0], [0, 0], [0, 0], sideCol);
    // Geländer: Handlauf als schmales Band auf beiden Seiten
    for (const sgn of [1, -1]) {
      const a = edge(i, sgn, w / 2 - 0.08);
      const c = edge(i + 1, sgn, w / 2 - 0.08);
      quad(m, [a[0], a[1], h0 + 0.95], [c[0], c[1], h1 + 0.95], [c[0], c[1], h1 + 1.05], [a[0], a[1], h0 + 1.05], [0, 0], [0, 0], [0, 0], [0, 0], railCol);
      if (!wood) quad(m, [a[0], a[1], h0 + 0.45], [c[0], c[1], h1 + 0.45], [c[0], c[1], h1 + 0.52], [a[0], a[1], h0 + 0.52], [0, 0], [0, 0], [0, 0], [0, 0], railCol);
    }
  }

  // Pfosten alle gut 2 m, Pfeiler unter hohen Stellen
  let nextPost = 0;
  let nextPier = L * 0.25;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    const h = heightAt(q.s, L, top);
    const ang = Math.atan2(q.dir[1], q.dir[0]);
    if (q.s >= nextPost) {
      nextPost = q.s + 2.2;
      for (const sgn of [1, -1]) {
        const e = edge(i, sgn, w / 2 - 0.08);
        block(m, e[0], e[1], ang, 0.14, 0.14, h, h + 1.05, railCol);
      }
    }
    if (q.s >= nextPier && q.s < L - 3 && h - thick > 0.5) {
      nextPier = q.s + Math.max(8, L * 0.25);
      block(m, q.p[0], q.p[1], ang, 0.9, w * 0.75, 0, h - thick, sideCol);
    }
  }
}

/**
 * Brückenstücke aus den Kartenkacheln zusammensetzen: Eine Brücke kann an einer Kachelgrenze
 * in zwei Teile zerfallen. Stoßen zwei Stücke derselben Art aneinander, werden sie eins.
 */
export function joinBridges(list: BridgeSpec[]): BridgeSpec[] {
  const out = list.map((b) => ({ kind: b.kind, path: [...b.path] }));
  const near = (a: Pt, c: Pt) => dist(a, c) < 0.8;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const c = out[j];
        if (a.kind !== c.kind) continue;
        const aS = a.path[0];
        const aE = a.path[a.path.length - 1];
        const cS = c.path[0];
        const cE = c.path[c.path.length - 1];
        let path: Pt[] | null = null;
        // Doppelt geliefertes Stück (gleiche Enden): einfach weglassen
        if ((near(aS, cS) && near(aE, cE)) || (near(aS, cE) && near(aE, cS))) path = a.path;
        else if (near(aE, cS)) path = [...a.path, ...c.path.slice(1)];
        else if (near(cE, aS)) path = [...c.path, ...a.path.slice(1)];
        else if (near(aE, cE)) path = [...a.path, ...c.path.slice(0, -1).reverse()];
        else if (near(aS, cS)) path = [...a.path.slice().reverse(), ...c.path.slice(1)];
        if (!path) continue;
        out[i] = { kind: a.kind, path };
        out.splice(j, 1);
        merged = true;
        break outer;
      }
  }
  return out;
}
