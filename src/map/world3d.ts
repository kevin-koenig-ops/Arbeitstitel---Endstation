// Die 3D-Welt auf der Karte: echte Häuser mit Fenstern und Dächern, Bäume, Autowracks,
// Laternen und Kram am Straßenrand. Läuft als eigene Ebene in MapLibre (three.js im selben Bild).
//
// - Häuser entstehen aus den echten Grundrissen. Fenster, Läden, Ruß und Dachziegel malt ein
//   kleiner Shader auf die Wände, so bleibt es für das Handy leicht (wenige Dreiecke).
// - Bäume, Autos und Kram werden je Sorte einmal gebaut und dann vielfach gezeichnet (Instancing).
// - Autos, Laternen und Kram kommen aus dem Modellpaket, wenn es an ist. Sonst eigene Formen.
//
// Was wo steht, entscheidet worldPlan.ts (ohne three.js).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { CustomLayerInterface, Map as MLMap } from 'maplibre-gl';
import cityKitUrl from '../assets/models/quaternius-city/citykit.glb?url';
import maplibregl from 'maplibre-gl';
import { bake, LIT, type Part } from '../base/bake';
import { hasProp, packProp, PROPS, type PropId } from '../base/modelPack';
import { buildCarWreck } from '../base/structures';
import type { DayPhase } from '../core/sun';
import type { PlanHouse, PlanThing, WorldPlan } from './worldPlan';

/** Art einer Fläche im Fassaden-Shader. */
const K = { wall: 0, burnt: 1, ruin: 2, roof: 3, flat: 4, plain: 5, gable: 6 } as const;

// --- Häuser als eine große Form ------------------------------------------------------------

class HouseBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  fac: number[] = [];
  fac2: number[] = [];
  private c = new THREE.Color();

  /**
   * Dreieck mit Fassaden-Koordinaten je Ecke (u entlang der Wand, v Höhe).
   * `face`: grobe Richtung, in die die Fläche zeigen soll; sonst wird die Reihenfolge umgedreht.
   */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: string, kind: number, seed: number, uv: [number, number][], len = 0, top = 0, face?: THREE.Vector3) {
    let nn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (face && nn.dot(face) < 0) {
      [b, c] = [c, b];
      uv = [uv[0], uv[2], uv[1]];
      nn = nn.negate();
    }
    this.c.set(color);
    for (const [i, p] of [a, b, c].entries()) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(nn.x, nn.y, nn.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.fac.push(uv[i][0], uv[i][1], seed, kind);
      this.fac2.push(len, top);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: string, kind: number, seed: number, uv: [number, number][], len = 0, top = 0, face?: THREE.Vector3) {
    this.tri(a, b, c, color, kind, seed, [uv[0], uv[1], uv[2]], len, top, face);
    this.tri(a, c, d, color, kind, seed, [uv[0], uv[2], uv[3]], len, top, face);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('fac', new THREE.Float32BufferAttribute(this.fac, 4));
    g.setAttribute('fac2', new THREE.Float32BufferAttribute(this.fac2, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** Kartenmeter (x Osten, y Norden) → three.js (x Osten, y oben, z Süden). */
const V = (x: number, y: number, h: number) => new THREE.Vector3(x, h, -y);

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function addHouse(B: HouseBuilder, h: PlanHouse, kitWalls = false) {
  const ring = h.ring;
  const n = ring.length;
  const flat = h.roof === 'flat';
  const top = h.wallTop + (flat ? 0.6 : 0);
  const kind = h.state === 'burnt' ? K.burnt : h.state === 'ruin' ? K.ruin : K.wall;
  // Wände
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    // nach außen (Grundriss gegen den Uhrzeigersinn: rechts der Kante)
    const out = new THREE.Vector3((b[1] - a[1]) / len, 0, (b[0] - a[0]) / len);
    if (h.state === 'ruin') {
      // Ruine: oben ausgefranst, in Stücken
      const parts = Math.max(1, Math.round(len / 1.3));
      for (let k = 0; k < parts; k++) {
        const t0 = k / parts;
        const t1 = (k + 1) / parts;
        const r = hash(h.seed + i * 17 + k * 3);
        const hh = h.base + (h.wallTop - h.base) * (0.25 + 0.75 * r);
        const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        const p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        B.quad(V(p0[0], p0[1], h.base), V(p1[0], p1[1], h.base), V(p1[0], p1[1], hh), V(p0[0], p0[1], hh), h.wall, kind, h.seed + i, [
          [t0 * len, h.base],
          [t1 * len, h.base],
          [t1 * len, hh],
          [t0 * len, hh],
        ], len, h.wallTop, out);
      }
      continue;
    }
    // Mit Stadt-Bausatz kommen die Wände aus Bauteilen (nur sehr kurze Stücke malt der Shader)
    if (kitWalls && len >= KIT_MIN_EDGE) continue;
    B.quad(V(a[0], a[1], h.base), V(b[0], b[1], h.base), V(b[0], b[1], top), V(a[0], a[1], top), h.wall, kind, h.seed + i, [
      [0, h.base],
      [len, h.base],
      [len, top],
      [0, top],
    ], len, h.wallTop, out);
  }
  if (h.roof === 'none') return;
  if (flat) {
    const contour = ring.map(([x, y]) => new THREE.Vector2(x, y));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const up = new THREE.Vector3(0, 1, 0);
    const y = h.wallTop + 0.05;
    for (const [i0, i1, i2] of faces) {
      const p = [ring[i0], ring[i1], ring[i2]];
      B.tri(V(p[0][0], p[0][1], y), V(p[1][0], p[1][1], y), V(p[2][0], p[2][1], y), h.roofColor, K.flat, h.seed, [
        [p[0][0], p[0][1]],
        [p[1][0], p[1][1]],
        [p[2][0], p[2][1]],
      ], 0, 0, up);
    }
    return;
  }
  const cx = ring.reduce((s, p) => s + p[0], 0) / n;
  const cy = ring.reduce((s, p) => s + p[1], 0) / n;
  const peak = h.wallTop + h.pitch;
  const over = 0.35;
  if (h.roof === 'gable') {
    // Rechteck in Firstrichtung ausmessen
    const ux = Math.cos(h.ridge);
    const uy = Math.sin(h.ridge);
    let u0 = Infinity;
    let u1 = -Infinity;
    let w0 = Infinity;
    let w1 = -Infinity;
    for (const [x, y] of ring) {
      const u = (x - cx) * ux + (y - cy) * uy;
      const w = -(x - cx) * uy + (y - cy) * ux;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      w0 = Math.min(w0, w);
      w1 = Math.max(w1, w);
    }
    const P = (u: number, w: number, z: number) => V(cx + u * ux - w * uy, cy + u * uy + w * ux, z);
    const wm = (w0 + w1) / 2;
    const half = (w1 - w0) / 2;
    const drop = (over / half) * h.pitch;
    const eave = h.wallTop - drop;
    // Zwei Dachflächen (mit Überstand)
    const UP = new THREE.Vector3(0, 1, 0);
    B.quad(P(u0 - over, w0 - over, eave), P(u1 + over, w0 - over, eave), P(u1 + over, wm, peak), P(u0 - over, wm, peak), h.roofColor, K.roof, h.seed, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ], 0, 0, UP);
    B.quad(P(u1 + over, w1 + over, eave), P(u0 - over, w1 + over, eave), P(u0 - over, wm, peak), P(u1 + over, wm, peak), h.roofColor, K.roof, h.seed, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ], 0, 0, UP);
    // Giebel an den Schmalseiten
    for (const u of [u0, u1]) {
      const a = P(u, w0, h.wallTop);
      const b = P(u, w1, h.wallTop);
      const c = P(u, wm, peak);
      const len = w1 - w0;
      // Giebel zeigt von der Hausmitte weg
      const face = new THREE.Vector3(ux * Math.sign(u), 0, -uy * Math.sign(u));
      B.tri(a, b, c, h.wall, K.gable, h.seed, [
        [0, h.wallTop],
        [len, h.wallTop],
        [len / 2, peak],
      ], len, peak, face);
    }
    return;
  }
  // Walm-/Zeltdach: jede Kante steigt zur Mitte an
  const apex = V(cx, cy, peak);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const out = (p: number[]) => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const l = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / l) * over, p[1] + (dy / l) * over];
    };
    const ea = out(a);
    const eb = out(b);
    const drop = h.pitch * (over / Math.max(2, Math.hypot(a[0] - cx, a[1] - cy)));
    B.tri(V(ea[0], ea[1], h.wallTop - drop), V(eb[0], eb[1], h.wallTop - drop), apex, h.roofColor, K.roof, h.seed, [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ], 0, 0, new THREE.Vector3(0, 1, 0));
  }
}

function addRubble(B: HouseBuilder, p: [number, number], r: number, hh: number, color: string, seed: number) {
  const n = 5;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + seed;
    return [p[0] + Math.cos(a) * r * (0.7 + 0.3 * hash(seed + i)), p[1] + Math.sin(a) * r * (0.7 + 0.3 * hash(seed + i))];
  });
  const top = V(p[0], p[1], hh);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    B.tri(V(a[0], a[1], 0), V(b[0], b[1], 0), top, color, K.plain, seed, [
      [0, 0],
      [0, 0],
      [0, 0],
    ], 0, 0, new THREE.Vector3((a[0] + b[0]) / 2 - p[0], 0.5, -((a[1] + b[1]) / 2 - p[1])));
  }
}

// --- Fassaden-Material -----------------------------------------------------------------------

const FACADE_VERT_HEAD = /* glsl */ `
attribute vec4 fac;
attribute vec2 fac2;
varying vec4 vFac;
varying vec2 vFac2;
varying vec3 vWPos;
`;
const FACADE_VERT_BODY = /* glsl */ `
vFac = fac;
vFac2 = fac2;
vWPos = transformed;
`;
const FACADE_FRAG_HEAD = /* glsl */ `
uniform float uNight;
varying vec4 vFac;
varying vec2 vFac2;
varying vec3 vWPos;
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
const FACADE_FRAG_BODY = /* glsl */ `
float litWin = 0.0;
{
  float kind = floor(vFac.w + 0.5);
  float u = vFac.x;
  float v = vFac.y;
  float seed = vFac.z;
  float len = vFac2.x;
  float top = vFac2.y;
  vec3 c = diffuseColor.rgb;
  if (kind < 2.5 || kind > 5.5) {
    // Wand: unten Schmutz, senkrechte Regenspuren, etwas Fleckigkeit
    c *= 0.72 + 0.28 * smoothstep(0.0, 1.3, v);
    c *= 0.9 + 0.12 * fNoise(vec2(u * 1.7, v * 0.25 + seed));
    c *= 0.94 + 0.06 * fHash(vec2(floor(u * 3.0), seed));
    // Sockel
    c *= v < 0.45 ? 0.72 : 1.0;
    float fh = 3.0;
    float m = 0.7;
    float avail = len - 2.0 * m;
    float bays = max(1.0, floor(avail / 2.4));
    float bw = avail / bays;
    float uu = u - m;
    bool big = len > 9.0 && kind < 0.5;
    if (kind < 5.5 && avail > 1.2 && uu > 0.0 && uu < avail && v > 0.0) {
      vec2 cell = vec2(uu / bw, v / fh);
      vec2 f = fract(cell);
      vec2 id = floor(cell);
      // nur ganze Stockwerke unter der Dachkante
      if ((id.y + 1.0) * fh <= top + 0.35) {
        float h = fHash(id + vec2(seed * 0.37, seed * 0.11));
        bool ground = id.y < 0.5;
        vec2 lo = vec2(0.26, 0.3);
        vec2 hi = vec2(0.74, 0.8);
        bool door = ground && h > 0.82 && id.x == floor(bays * 0.5);
        if (ground && big) { lo = vec2(0.08, 0.12); hi = vec2(0.92, 0.78); }
        if (door) { lo = vec2(0.3, 0.0); hi = vec2(0.7, 0.72); }
        float inW = step(lo.x, f.x) * step(f.x, hi.x) * step(lo.y, f.y) * step(f.y, hi.y);
        float inF = step(lo.x - 0.05, f.x) * step(f.x, hi.x + 0.05) * step(lo.y - 0.07, f.y) * step(f.y, hi.y + 0.04);
        // Fensterbank und Rahmen etwas heller
        c = mix(c, c * 1.22, (inF - inW) * 0.9);
        if (inW > 0.5) {
          vec3 glass = mix(vec3(0.012, 0.016, 0.02), vec3(0.05, 0.06, 0.07), smoothstep(lo.y, hi.y, f.y));
          glass *= 0.85 + 0.3 * step(0.5, fract((f.x - f.y) * 3.0 + h));
          vec3 hole = vec3(0.006, 0.006, 0.006);
          vec3 board = vec3(0.16, 0.11, 0.06) * (0.7 + 0.4 * step(0.5, fract(f.y * 7.0 + h * 3.0)));
          vec3 w = glass;
          if (kind > 0.5) w = hole;
          else if (door) w = h > 0.9 ? board : vec3(0.05, 0.035, 0.022);
          else if (h < 0.2) w = hole;
          else if (h < 0.34) w = board;
          c = w;
          // Nachts: wenige erleuchtete Fenster (Überlebende)
          if (kind < 0.5 && !door && h > 0.965) litWin = uNight;
        }
        // Ruß über den Fenstern ausgebrannter Häuser
        if (kind > 0.5 && kind < 1.5 && f.x > lo.x && f.x < hi.x && f.y > hi.y) c *= mix(0.35, 1.0, smoothstep(hi.y, 1.0, f.y));
      }
      // Stockwerkskante
      if (kind < 0.5 && fract(v / fh) < 0.025 && v > 1.0) c *= 0.82;
    }
    if (kind > 1.5 && kind < 2.5) c *= 0.85;
  } else if (kind < 3.5) {
    // Ziegeldach: Reihen, einzelne Ziegel, Moos
    float row = fract(vWPos.y * 3.3);
    c *= 0.78 + 0.22 * smoothstep(0.0, 0.3, row);
    float t = fHash(floor(vec2(vWPos.x * 2.4 + floor(vWPos.y * 3.3) * 0.5, vWPos.z * 2.4)));
    c *= 0.88 + 0.22 * t;
    float moss = smoothstep(0.62, 0.88, fNoise(vWPos.xz * 0.7 + seed));
    c = mix(c, vec3(0.07, 0.09, 0.035), moss * 0.35);
  } else if (kind < 4.5) {
    // Flachdach: Kies, Pfützen, Flecken
    c *= 0.85 + 0.2 * fNoise(vWPos.xz * 1.3);
    c *= 0.9 + 0.1 * fHash(floor(vWPos.xz * 8.0));
    c = mix(c, c * 0.6, smoothstep(0.62, 0.7, fNoise(vWPos.xz * 0.22 + seed)) * 0.6);
  } else {
    c *= 0.85 + 0.25 * fNoise(vWPos.xz * 2.0);
  }
  diffuseColor.rgb = c;
}
`;

function facadeMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: false });
  const uniforms = { uNight: { value: 0 } };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${FACADE_VERT_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${FACADE_VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FACADE_FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FACADE_FRAG_BODY}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += litWin * vec3(1.0, 0.68, 0.32) * 1.6;`);
  };
  m.customProgramCacheKey = () => 'endstation-facade';
  return m;
}

// --- Vorlagen für Bäume, Autos, Kram ----------------------------------------------------------

function partGeometry(p: Part): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(p.nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Leichte Kartenbäume: Stamm und Krone getrennt (Krone wird je Baum eingefärbt). */
function treeGeometries() {
  const white = (g: THREE.BufferGeometry) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    const n = ng.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    // leichte Helligkeitsstufen: unten dunkler
    const pos = ng.getAttribute('position');
    ng.computeBoundingBox();
    const bb = ng.boundingBox!;
    for (let i = 0; i < n; i++) {
      const t = (pos.getY(i) - bb.min.y) / Math.max(0.01, bb.max.y - bb.min.y);
      const v = 0.72 + 0.4 * t;
      col.set([v, v, v], i * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return ng;
  };
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 5).translate(0, 1.6, 0);
  const leaf = new THREE.IcosahedronGeometry(2.9, 0).scale(1, 0.85, 1).translate(0, 5.6, 0);
  const leaf2 = new THREE.IcosahedronGeometry(2.0, 0).translate(1.2, 7.2, 0.6);
  const leafy = mergeSimple([leaf, leaf2]);
  const coneA = new THREE.ConeGeometry(2.6, 4.6, 7).translate(0, 4.2, 0);
  const coneB = new THREE.ConeGeometry(1.9, 3.8, 7).translate(0, 7.0, 0);
  const coneC = new THREE.ConeGeometry(1.1, 3.0, 7).translate(0, 9.6, 0);
  const conifer = mergeSimple([coneA, coneB, coneC]);
  const dead = mergeSimple([new THREE.CylinderGeometry(0.16, 0.36, 7, 5).translate(0, 3.5, 0), new THREE.CylinderGeometry(0.08, 0.14, 2.6, 4).rotateZ(0.9).translate(0.9, 5, 0), new THREE.CylinderGeometry(0.06, 0.12, 2.2, 4).rotateZ(-0.8).translate(-0.7, 4.2, 0)]);
  return { trunk: white(trunk), leafy: white(leafy), conifer: white(conifer), dead: white(dead) };
}

function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o);
    o += g.getAttribute('position').count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return out;
}

const POLE_COLOR = '#4a3f33';

/** Vorlagen aus dem Modellpaket oder eigene Formen. Werden einmal gebaut und behalten. */
class Templates {
  private cache = new Map<string, { lit: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null } | null>();

  get(kind: string): { lit: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null } | null {
    const key = kind + (hasProp((kind in PROPS ? kind : 'barrel') as PropId) ? ':pack' : ':own');
    if (this.cache.has(key)) return this.cache.get(key)!;
    let obj: THREE.Object3D | null = null;
    if (kind in PROPS && hasProp(kind as PropId)) obj = packProp(kind as PropId);
    else if (kind === 'pickup' || kind === 'sportsCar' || kind === 'van') obj = buildCarWreck(kind.length);
    else if (kind === 'pole') {
      obj = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: POLE_COLOR });
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7.6, 0.28).translate(0, 3.8, 0), m);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, 0.2).translate(0, 7.1, 0), m);
      obj.add(p, arm);
    } else if (kind === 'streetLight') {
      obj = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: '#4a524a' });
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.6, 6).translate(0, 2.8, 0), m), new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 5.5, 0.75), m));
    }
    let t: { lit: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null } | null = null;
    if (obj) {
      const tpl = bake(obj);
      t = { lit: tpl.lit.pos.length ? partGeometry(tpl.lit) : null, glow: tpl.glow.pos.length ? partGeometry(tpl.glow) : null };
    }
    this.cache.set(key, t);
    return t;
  }
}


// --- Stadt-Bausatz (Quaternius Downtown City MegaKit) ------------------------------------------

/** Kürzere Wandstücke bekommen keine Bauteile. */
const KIT_MIN_EDGE = 1.4;
/** Nur Häuser in der Nähe bekommen Bauteile (sonst zu viel fürs Handy). */
const KIT_RADIUS = 130;
const KIT_MAX_HOUSES = 70;

interface KitPart {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

/** Die Bauteile, einmal geladen. */
export class CityKit {
  private constructor(readonly parts: Map<string, KitPart[]>) {}

  static async load(): Promise<CityKit> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const g = await loader.loadAsync(cityKitUrl);
    const parts = new Map<string, KitPart[]>();
    const mats = new Map<THREE.Material, THREE.Material>();
    for (const node of g.scene.children) {
      node.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      const list: KitPart[] = [];
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
        const src = mesh.material as THREE.MeshStandardMaterial;
        let mat = mats.get(src);
        if (!mat) {
          const m = src.clone();
          m.side = THREE.FrontSide;
          // Kräftiges New-York-Rot etwas dämpfen, passt besser in die Endzeit
          if (m.name.includes('RedBrick')) m.color.multiplyScalar(0.82).multiply(new THREE.Color(1, 0.92, 0.86));
          mats.set(src, (mat = m));
        }
        list.push({ geo, mat });
      });
      parts.set(node.name, list);
    }
    return new CityKit(parts);
  }
}

interface KitInstance {
  part: string;
  m: THREE.Matrix4;
  c: THREE.Color;
}

/** Wände eines Hauses aus Bauteilen: Erdgeschoss, Stockwerke, oben ein Gesims. */
function kitHouse(h: PlanHouse, out: KitInstance[]) {
  const n = h.ring.length;
  const floors = Math.max(1, Math.min(8, Math.round((h.wallTop - h.base) / 3)));
  const sy = (h.wallTop - h.base) / (floors * 3);
  const style = hash(h.seed * 0.7) < 0.55 ? 'brick' : 'trim';
  const shop = h.area > 260;
  const flat = h.roof === 'flat' || h.roof === 'none';
  const tint = h.state === 'burnt' ? new THREE.Color(0.32, 0.3, 0.29) : new THREE.Color().setHSL(0.07, 0.08, 0.72 + 0.22 * hash(h.seed + 3));
  // Tür: Mitte der längsten Wand
  let door = 0;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const a = h.ring[i];
    const b = h.ring[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) {
      best = l;
      door = i;
    }
  }
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = h.ring[i];
    const b = h.ring[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < KIT_MIN_EDGE) continue;
    const slots = Math.max(1, Math.round(len / 2));
    const sx = len / (slots * 2);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    q.setFromAxisAngle(up, ang);
    for (let j = 0; j < slots; j++) {
      const t = (j + 0.5) / slots;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      for (let f = 0; f < floors; f++) {
        const r = hash(h.seed + i * 31 + j * 7 + f * 13);
        let part: string;
        if (f === 0) {
          if (i === door && j === Math.floor(slots / 2)) part = shop ? 'DoorFrame_Metal_Single' : 'DoorFrame_Trim';
          else if (shop) part = r < 0.65 ? 'Metal_FirstFloor_Window' : 'Metal_FirstFloor_Wall';
          else part = r < 0.35 ? 'Trim_FirstFloor_Window_001' : r < 0.7 ? 'Brick_Window_Square_Single' : style === 'brick' ? 'Brick_BottomTrim' : 'Trim_FirstFloor_Wall';
        } else if (style === 'brick') part = r < 0.62 ? 'Brick_Window_Trim_Single' : r < 0.78 ? 'Brick_Window_Trim' : f === floors - 1 && flat ? 'Brick_TopTrim' : 'Brick_Plain_3';
        else part = r < 0.7 ? 'Trim_Window' : 'Trim_Plain_3';
        out.push({ part, m: new THREE.Matrix4().compose(new THREE.Vector3(x, h.base + f * 3 * sy, -y), q, new THREE.Vector3(sx, sy, 1)), c: tint });
      }
      if (flat) {
        const cornice = shop ? 'Cornice_Metal_Center' : style === 'brick' ? 'Cornice_Brick_Center' : 'Cornice_Trim_Center';
        out.push({ part: cornice, m: new THREE.Matrix4().compose(new THREE.Vector3(x, h.wallTop - 0.4, -y), q, new THREE.Vector3(sx, 1, 1)), c: tint });
      }
    }
  }
}

// --- Die Ebene -------------------------------------------------------------------------------

export class World3D implements CustomLayerInterface {
  readonly id = 'world3d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map: MLMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private root = new THREE.Group();
  private hemi = new THREE.HemisphereLight('#f2ead8', '#6a5f4e', 2.3);
  private sun = new THREE.DirectionalLight('#fff0d6', 1.5);
  private facade = facadeMaterial();
  private trees = treeGeometries();
  private treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  private templates = new Templates();
  private kit: CityKit | null = null;
  private origin: maplibregl.MercatorCoordinate | null = null;
  private model = new THREE.Matrix4();
  private mvp = new THREE.Matrix4();
  /** Unter dieser Zoomstufe nicht zeichnen (dann gibt es die einfachen Blöcke). */
  minZoom = 15;
  stats = { houses: 0, trees: 0, cars: 0, props: 0, verts: 0, ms: 0 };
  /** Zum Prüfen: wie oft gezeichnet wurde */
  frames = 0;

  constructor() {
    this.scene.add(this.hemi, this.sun, this.sun.target, this.root);
    this.sun.position.set(-60, 100, 45);
  }

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
  }

  onRemove() {
    this.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, opts: unknown) {
    if (!this.renderer || !this.origin || !this.map) return;
    if (this.map.getZoom() < this.minZoom - 0.3) return;
    // MapLibre 5: Matrix für Mercator-Koordinaten (0..1) in defaultProjectionData
    const o = opts as { defaultProjectionData?: { mainMatrix: ArrayLike<number> }; modelViewProjectionMatrix?: ArrayLike<number> } & ArrayLike<number>;
    const m = o.defaultProjectionData?.mainMatrix ?? o.modelViewProjectionMatrix ?? o;
    this.mvp.fromArray(Array.from(m as ArrayLike<number>)).multiply(this.model);
    this.camera.projectionMatrix.copy(this.mvp);
    this.camera.projectionMatrixInverse.copy(this.mvp).invert();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  }

  /** Stadt-Bausatz an (geladen) oder aus (null). Danach setPlan erneut aufrufen. */
  setCityKit(kit: CityKit | null) {
    this.kit = kit;
  }

  /** Tageszeit: nachts dunkler, ein paar Fenster leuchten. */
  setPhase(phase: DayPhase) {
    const night = phase === 'night' ? 1 : phase === 'dusk' ? 0.35 : 0;
    this.facade.userData.uniforms.uNight.value = night;
    this.hemi.intensity = 2.3 - night * 1.1;
    this.sun.intensity = 1.5 - night * 1.0;
    this.sun.color.set(phase === 'dusk' ? '#ffb78a' : phase === 'night' ? '#9fb2e0' : '#fff0d6');
    this.map?.triggerRepaint();
  }

  private clear() {
    for (const o of [...this.root.children]) {
      this.root.remove(o);
      const mesh = o as THREE.Mesh;
      // Vorlagen (Bäume, Kram) bleiben, nur die Häuser sind jedes Mal neu
      if (mesh.userData.own) mesh.geometry.dispose();
      if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) (mesh as unknown as THREE.InstancedMesh).dispose();
    }
  }

  /** Neue Welt um eine Mitte aufbauen. */
  setPlan(plan: WorldPlan) {
    const t0 = performance.now();
    this.clear();
    this.origin = maplibregl.MercatorCoordinate.fromLngLat([plan.center.lon, plan.center.lat], 0);
    const s = this.origin.meterInMercatorCoordinateUnits();
    this.model
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z ?? 0)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    // Häuser (mit Stadt-Bausatz: die nächsten bekommen Wände aus Bauteilen)
    const kitSet = new Set<PlanHouse>();
    if (this.kit) {
      const cand = plan.houses
        .filter((h) => h.state !== 'ruin' && h.wallTop - h.base >= 2.6)
        .map((h) => ({ h, d: Math.hypot(h.ring[0][0], h.ring[0][1]) }))
        .filter((x) => x.d < KIT_RADIUS)
        .sort((a, b) => a.d - b.d)
        .slice(0, KIT_MAX_HOUSES);
      for (const c of cand) kitSet.add(c.h);
    }
    const B = new HouseBuilder();
    for (const h of plan.houses) addHouse(B, h, kitSet.has(h));
    plan.rubble.forEach((r, i) => addRubble(B, r.p, r.r, r.h, r.color, i * 7.3));
    const houses = new THREE.Mesh(B.geometry(), this.facade);
    houses.userData.own = true;
    houses.frustumCulled = false;
    this.root.add(houses);
    let verts = B.pos.length / 3;

    // Bauteile des Stadt-Bausatzes, je Teil und Material einmal gezeichnet
    if (this.kit && kitSet.size) {
      const inst: KitInstance[] = [];
      for (const h of kitSet) kitHouse(h, inst);
      const byPart = new Map<string, KitInstance[]>();
      for (const k of inst) {
        let l = byPart.get(k.part);
        if (!l) byPart.set(k.part, (l = []));
        l.push(k);
      }
      for (const [part, list] of byPart) {
        for (const p of this.kit.parts.get(part) ?? []) {
          const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
          im.frustumCulled = false;
          list.forEach((k, i) => {
            im.setMatrixAt(i, k.m);
            im.setColorAt(i, k.c);
          });
          this.root.add(im);
          verts += p.geo.getAttribute('position').count * list.length;
        }
      }
    }

    // Bäume
    const groups: Record<'leaf' | 'conifer' | 'dead', typeof plan.trees> = { leaf: [], conifer: [], dead: [] };
    for (const t of plan.trees) groups[t.kind].push(t);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const place = (p: [number, number], rot: number, k: number) => {
      q.setFromAxisAngle(up, rot);
      sc.setScalar(k);
      return mtx.compose(new THREE.Vector3(p[0], 0, -p[1]), q, sc);
    };
    const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.frustumCulled = false;
      this.root.add(im);
      verts += geo.getAttribute('position').count * n;
      return im;
    };
    const trunks = [...groups.leaf, ...groups.conifer];
    if (trunks.length) {
      const im = instanced(this.trees.trunk, this.treeMat, trunks.length);
      trunks.forEach((t, i) => {
        im.setMatrixAt(i, place(t.p, t.rot, t.s * (t.kind === 'conifer' ? 1.1 : 1)));
        im.setColorAt(i, col.set('#5a4532'));
      });
    }
    for (const kind of ['leaf', 'conifer', 'dead'] as const) {
      const list = groups[kind];
      if (!list.length) continue;
      const geo = kind === 'leaf' ? this.trees.leafy : kind === 'conifer' ? this.trees.conifer : this.trees.dead;
      const im = instanced(geo, this.treeMat, list.length);
      list.forEach((t, i) => {
        im.setMatrixAt(i, place(t.p, t.rot, t.s));
        im.setColorAt(i, col.set(kind === 'dead' ? '#6a6157' : t.color));
      });
    }

    // Autos, Laternen, Masten, Kram
    const things = [...plan.cars, ...plan.lamps, ...plan.poles, ...plan.props];
    const byKind = new Map<string, PlanThing[]>();
    for (const t of things) {
      let l = byKind.get(t.kind);
      if (!l) byKind.set(t.kind, (l = []));
      l.push(t);
    }
    let props = 0;
    for (const [kind, list] of byKind) {
      const tpl = this.templates.get(kind);
      if (!tpl) continue;
      // Kram ohne Modellpaket weglassen (eigene Formen gibt es nur für Autos, Laternen, Masten)
      if (!(kind in PROPS) && !['pole', 'streetLight', 'pickup', 'sportsCar', 'van'].includes(kind)) continue;
      for (const [geo, mat] of [
        [tpl.lit, LIT],
        [tpl.glow, null],
      ] as const) {
        if (!geo || !mat) continue;
        const im = instanced(geo, mat, list.length);
        list.forEach((t, i) => im.setMatrixAt(i, place(t.p, t.ang + Math.PI / 2, 1)));
      }
      if (kind in PROPS && !['pickup', 'sportsCar', 'van', 'streetLight'].includes(kind)) props += list.length;
    }
    this.stats = { houses: plan.houses.length, trees: plan.trees.length, cars: plan.cars.length, props, verts, ms: Math.round(performance.now() - t0) };
    this.map?.triggerRepaint();
  }
}
