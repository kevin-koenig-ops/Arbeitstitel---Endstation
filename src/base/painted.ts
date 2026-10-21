// Stil „Gemalt“: weich schattierte Formen mit Pinselstruktur, Maserung, Rost und Gras,
// dazu ein Bild-Schritt mit feinen braunen Linien, weicher Verschattung in Ecken,
// Leuchten um Lampen und Feuer und einer warmen Farbstimmung.
//
// Die Oberflächen entstehen im Shader aus der Weltposition (keine Bilddateien nötig).
// Welche Art eine Fläche ist (Holz, Stein, Laub …), steht im Attribut `pat`
// (verschmolzene Meshes) oder in material.userData.pat (einzelne Meshes).

import * as THREE from 'three';

// --- Dieselbe Rauschfunktion für den Rechner (Grasbüschel passend zu den Grasflecken) ---
const fract = (x: number) => x - Math.floor(x);
function hash3(x: number, y: number, z: number): number {
  x = fract(x * 0.3183099 + 0.1) * 17;
  y = fract(y * 0.3183099 + 0.1) * 17;
  z = fract(z * 0.3183099 + 0.1) * 17;
  return fract(x * y * z * (x + y + z));
}
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const fx = s(x - ix);
  const fy = s(y - iy);
  const fz = s(z - iz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy), l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
function fbm3(x: number, y: number, z: number): number {
  return 0.5 * noise3(x, y, z) + 0.3 * noise3(x * 2.03 + 7.1, y * 2.03 + 7.1, z * 2.03 + 7.1) + 0.2 * noise3(x * 4.11 + 3.7, y * 4.11 + 3.7, z * 4.11 + 3.7);
}
/** Wie stark ein Bodenpunkt bewachsen ist (0..1), wie im Shader. */
export function grassiness(x: number, z: number): number {
  const v = fbm3(x * 0.12 + 5, 5, z * 0.12 + 5);
  const t = Math.min(1, Math.max(0, (v - 0.4) / 0.2));
  return t * t * (3 - 2 * t);
}

/** So viel heller leuchten Lampen und Flammen, damit nur sie ein Leuchten bekommen. */
const GLOW_BOOST = 3;

const NOISE = /* glsl */ `
varying vec3 vPaintPos;
varying vec3 vPaintNrm;
varying float vPaintPat;
float pHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float pNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(pHash(i), pHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(pHash(i + vec3(0.0, 1.0, 0.0)), pHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(pHash(i + vec3(0.0, 0.0, 1.0)), pHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(pHash(i + vec3(0.0, 1.0, 1.0)), pHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float pFbm(vec3 p) {
  return 0.5 * pNoise(p) + 0.3 * pNoise(p * 2.03 + 7.1) + 0.2 * pNoise(p * 4.11 + 3.7);
}
`;

const VERT_HEAD = /* glsl */ `
varying vec3 vPaintPos;
varying vec3 vPaintNrm;
varying float vPaintPat;
#ifdef PAINT_ATTR
attribute float pat;
#endif
`;

const VERT_BODY = /* glsl */ `
{
  vec4 pw = vec4(transformed, 1.0);
  vec3 pn = objectNormal;
  #ifdef USE_INSTANCING
  pw = instanceMatrix * pw;
  pn = mat3(instanceMatrix) * pn;
  #endif
  pw = modelMatrix * pw;
  vPaintPos = pw.xyz;
  vPaintNrm = normalize(mat3(modelMatrix) * pn);
  #ifdef PAINT_ATTR
  vPaintPat = pat;
  #else
  vPaintPat = PAINT_PAT;
  #endif
}
`;

const FRAG_BODY = /* glsl */ `
{
  vec3 P = vPaintPos;
  vec3 N = normalize(vPaintNrm);
  int kind = int(vPaintPat + 0.5);
  vec3 c = diffuseColor.rgb;
  float big = pFbm(P * 0.55);
  float fine = pNoise(P * 4.3);
  // Pinselstruktur: Helligkeit und Farbton wandern ein wenig
  c *= 0.9 + 0.2 * big + 0.08 * (fine - 0.5);
  c = mix(c, c * vec3(1.07, 1.0, 0.9), smoothstep(0.35, 0.75, big));
  if (kind == 1) {
    // Boden: Grasbüschel, Erdflecken, ab und zu eine Blüte
    vec3 G = vec3(P.x, 0.0, P.z);
    float tuft = pNoise(G * 2.6);
    float dirt = pFbm(G * 0.22);
    // Gras erobert den Boden zurück (in Flecken), dazwischen trockene Erde
    float grassy = smoothstep(0.4, 0.6, pFbm(G * 0.12 + 5.0));
    vec3 grass = mix(vec3(0.12, 0.18, 0.05), vec3(0.2, 0.21, 0.07), pNoise(G * 0.6)) * (0.75 + 0.6 * tuft);
    c = mix(c, grass, grassy * 0.85);
    c *= 0.8 + 0.32 * tuft;
    c = mix(c, c * vec3(1.15, 0.95, 0.75), smoothstep(0.55, 0.78, dirt) * 0.7);
    float green = c.g - max(c.r, c.b);
    vec3 cell = floor(G * 4.0);
    float h = pHash(cell + 13.0);
    vec2 fp = fract(G.xz * 4.0) - 0.5;
    float dotm = smoothstep(0.17, 0.09, length(fp)) * step(0.94, h) * step(0.0, green);
    vec3 flower = h > 0.98 ? vec3(0.95, 0.78, 0.25) : h > 0.96 ? vec3(0.9, 0.88, 0.82) : vec3(0.62, 0.42, 0.78);
    c = mix(c, flower * 0.75, dotm);
  } else if (kind == 2) {
    // Laub: Büschel, oben heller (die Sonne), unten dunkler
    float clump = pNoise(P * 3.2);
    float up = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
    // satteres, wärmeres Grün wie im Bilderbuch
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    c = max(vec3(0.0), mix(vec3(l), c, 1.35)) * vec3(1.08, 1.12, 0.78);
    c *= 0.72 + 0.46 * clump;
    c *= 0.8 + 0.5 * up;
    c = mix(c, c * vec3(1.25, 1.18, 0.65), smoothstep(0.55, 0.9, clump) * up);
  } else if (kind == 3) {
    // Holz: Maserung entlang der Bretter
    vec3 a = abs(N);
    float u = a.y > 0.6 ? P.z : P.y;
    float grain = sin(u * 42.0 + pNoise(P * vec3(1.4, 5.0, 1.4)) * 7.0);
    c *= 0.9 + 0.07 * grain + 0.1 * (fine - 0.5);
  } else if (kind == 4) {
    // Stein, Putz, Beton: Flecken, Schmutz von unten, Regenspuren
    float stain = pFbm(P * 0.9 + 3.0);
    c *= 0.84 + 0.26 * stain;
    c *= mix(0.74, 1.0, smoothstep(0.0, 1.4, P.y));
    if (abs(N.y) < 0.5) c *= 0.9 + 0.14 * pNoise(vec3(P.x * 7.0, P.y * 0.35, P.z * 7.0));
  } else if (kind == 5) {
    // Metall: Rostflecken
    float rust = pFbm(P * 1.6 + 9.0);
    c = mix(c, vec3(0.36, 0.15, 0.06) * (0.75 + 0.5 * fine), smoothstep(0.55, 0.8, rust) * 0.75);
  }
  diffuseColor.rgb = c;
}
`;

const painted = new WeakMap<THREE.Material, THREE.Material>();
const paintedAttr = new WeakMap<THREE.Material, THREE.Material>();
const fromPainted = new WeakMap<THREE.Material, THREE.Material>();

function paintStandard(s: THREE.MeshStandardMaterial, attr: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: s.vertexColors,
    map: s.map,
    roughness: 0.95,
    metalness: 0,
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
    depthWrite: s.depthWrite,
    depthTest: s.depthTest,
    alphaTest: s.alphaTest,
    emissiveIntensity: s.emissiveIntensity,
    flatShading: false,
  });
  // Dieselben Farb-Objekte: Änderungen (z. B. Treffer-Blitz) wirken in allen Stilen
  m.color = s.color;
  m.emissive = s.emissive;
  m.name = s.name;
  const pat = Number(s.userData?.pat ?? 0);
  m.defines = attr ? { PAINT_ATTR: '' } : { PAINT_PAT: `${pat.toFixed(1)}` };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${VERT_HEAD}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`).replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_BODY}`);
  };
  return m;
}

function paintGlow(s: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    vertexColors: s.vertexColors,
    map: s.map,
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
    depthWrite: s.depthWrite,
    depthTest: s.depthTest,
  });
  m.color = s.color.clone().multiplyScalar(GLOW_BOOST);
  return m;
}

/** Die gemalte Fassung eines Materials (oder das Material selbst, wenn es keine braucht). */
export function paintedOf(src: THREE.Material, hasPatAttr: boolean): THREE.Material {
  const std = src as THREE.MeshStandardMaterial;
  const basic = src as THREE.MeshBasicMaterial;
  if (std.isMeshStandardMaterial) {
    const cache = hasPatAttr ? paintedAttr : painted;
    let m = cache.get(src) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = paintStandard(std, hasPatAttr);
      cache.set(src, m);
      fromPainted.set(m, src);
    }
    // Zahlenwerte können sich zur Laufzeit ändern (Ausblenden, Leuchten)
    m.opacity = std.opacity;
    m.emissiveIntensity = std.emissiveIntensity;
    m.visible = std.visible;
    return m;
  }
  if (basic.isMeshBasicMaterial && src.userData?.glow) {
    let m = painted.get(src) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = paintGlow(basic);
      painted.set(src, m);
      fromPainted.set(m, src);
    }
    m.opacity = basic.opacity;
    m.visible = basic.visible;
    return m;
  }
  return src;
}

/** Zum gemalten Material das ursprüngliche (oder das Material selbst). */
export function unpainted(m: THREE.Material): THREE.Material {
  return fromPainted.get(m) ?? m;
}

// --- Bild-Schritt ----------------------------------------------------------------------

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(1.25, 2.4, l), 1.0);
}`;

const BLUR = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += (texture2D(tSrc, vUv + uDir * 1.4).rgb + texture2D(tSrc, vUv - uDir * 1.4).rgb) * 0.1946;
  s += (texture2D(tSrc, vUv + uDir * 3.2).rgb + texture2D(tSrc, vUv - uDir * 3.2).rgb) * 0.1216;
  s += (texture2D(tSrc, vUv + uDir * 5.2).rgb + texture2D(tSrc, vUv - uDir * 5.2).rgb) * 0.0541;
  s += (texture2D(tSrc, vUv + uDir * 7.4).rgb + texture2D(tSrc, vUv - uDir * 7.4).rgb) * 0.0162;
  gl_FragColor = vec4(s, 1.0);
}`;

const FINAL = /* glsl */ `
#include <packing>
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uThick;
uniform float uAo;
uniform float uFocal;
uniform float uVignette;
uniform vec3 uInk;

// 1/Abstand ist auf ebenen Flächen im Bild gleichmäßig: Knicke darin sind Ecken und Kanten
float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (d >= 0.99999) return 0.0;
  return -1.0 / perspectiveDepthToViewZ(d, uNear, uFar);
}
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec4 c = texture2D(tColor, vUv);
  float w0 = invZ(vUv);
  vec3 col = c.rgb;
  float edge = 0.0;
  if (w0 > 0.0) {
    // Feine Umrisse aus Tiefensprüngen
    vec2 ox = vec2(uTexel.x * uThick, 0.0);
    vec2 oy = vec2(0.0, uTexel.y * uThick);
    float wl = invZ(vUv - ox);
    float wr = invZ(vUv + ox);
    float wd = invZ(vUv - oy);
    float wu = invZ(vUv + oy);
    float wmax = max(max(max(w0, wl), max(wr, wd)), wu);
    float lap = (abs(wl + wr - 2.0 * w0) + abs(wu + wd - 2.0 * w0)) / max(wmax, 1e-5);
    edge = smoothstep(0.006, 0.022, lap);

    // Weiche Verschattung in Innenecken, leichte Aufhellung an Außenkanten
    float r = clamp(uAo * uFocal * w0, 2.0, 48.0);
    float occ = 0.0;
    float rim = 0.0;
    for (int i = 0; i < 4; i++) {
      float a = float(i) * 0.7854 + 0.39;
      vec2 o = vec2(cos(a), sin(a)) * r * uTexel;
      float wa = invZ(vUv + o);
      float wb = invZ(vUv - o);
      if (wa <= 0.0 || wb <= 0.0) continue;
      float rel = ((wa + wb) * 0.5 - w0) / w0;
      float win = 1.0 - smoothstep(0.06, 0.16, abs(rel));
      occ += clamp(rel * 55.0, 0.0, 1.0) * win;
      rim += clamp(-rel * 55.0, 0.0, 1.0) * win;
    }
    col *= 1.0 - 0.42 * occ / 4.0;
    col *= 1.0 + 0.1 * rim / 4.0;
  }
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  col = mix(col, uInk * c.a, edge * 0.8);
  col += bloom * 0.85;
  float bl = max(bloom.r, max(bloom.g, bloom.b));
  float alpha = clamp(max(c.a, max(edge * 0.8, bl)), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Warme Farbstimmung wie auf einem gemalten Bild
  vec3 g = gl_FragColor.rgb;
  float l = dot(g, vec3(0.299, 0.587, 0.114));
  g = max(vec3(0.0), mix(vec3(l), g, 1.12));
  g *= vec3(1.045, 1.0, 0.92);
  g += vec3(0.055, 0.032, 0.0) * (1.0 - l) * (1.0 - l);
  vec2 q = vUv - 0.5;
  g *= 1.0 - uVignette * dot(q, q) * 1.6;
  g += (rnd(gl_FragCoord.xy) - 0.5) * 0.022;
  gl_FragColor.rgb = clamp(g, 0.0, 1.0) * alpha;
}`;

/** Zeichnet eine Szene im Stil „Gemalt“. */
export class PaintedPost {
  private rt: THREE.WebGLRenderTarget;
  private bloomA: THREE.WebGLRenderTarget;
  private bloomB: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bright: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private final: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  /** thick: Linienbreite in CSS-Pixeln; vignette: Rand abdunkeln (nicht bei Vorschaubildern). */
  constructor(
    private renderer: THREE.WebGLRenderer,
    private thick = 1,
    vignette = true,
  ) {
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(1, 1);
    const half = { type: THREE.HalfFloatType, depthBuffer: false };
    this.bloomA = new THREE.WebGLRenderTarget(1, 1, half);
    this.bloomB = new THREE.WebGLRenderTarget(1, 1, half);
    const base = { vertexShader: VERT, depthTest: false, depthWrite: false };
    this.bright = new THREE.ShaderMaterial({ ...base, fragmentShader: BRIGHT, uniforms: { tColor: { value: this.rt.texture } } });
    this.blur = new THREE.ShaderMaterial({ ...base, fragmentShader: BLUR, uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } } });
    this.final = new THREE.ShaderMaterial({
      ...base,
      fragmentShader: FINAL,
      transparent: true,
      blending: THREE.NoBlending,
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        tBloom: { value: this.bloomA.texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uThick: { value: 1 },
        uAo: { value: 0.45 },
        uFocal: { value: 1 },
        uVignette: { value: vignette ? 0.22 : 0 },
        uInk: { value: new THREE.Color('#3b2716') },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private pass(mat: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const h = Math.max(1, Math.floor(this.size.y));
    if (this.rt.width !== w || this.rt.height !== h) {
      this.rt.setSize(w, h);
      const hw = Math.max(1, Math.floor(w / 2));
      const hh = Math.max(1, Math.floor(h / 2));
      this.bloomA.setSize(hw, hh);
      this.bloomB.setSize(hw, hh);
      this.final.uniforms.uTexel.value.set(1 / w, 1 / h);
    }
    const u = this.final.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uThick.value = Math.max(1, this.thick * r.getPixelRatio());
    // Brennweite in Pixeln: so groß erscheint ein Meter in 1 m Abstand
    u.uFocal.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    // Leuchten: helle Stellen herauslösen und weichzeichnen (in halber Auflösung)
    this.pass(this.bright, this.bloomA);
    this.blur.uniforms.tSrc.value = this.bloomA.texture;
    this.blur.uniforms.uDir.value.set(1 / this.bloomA.width, 0);
    this.pass(this.blur, this.bloomB);
    this.blur.uniforms.tSrc.value = this.bloomB.texture;
    this.blur.uniforms.uDir.value.set(0, 1 / this.bloomA.height);
    this.pass(this.blur, this.bloomA);
    this.pass(this.final, prev);
  }

  dispose() {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
    this.bloomA.dispose();
    this.bloomB.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.final.dispose();
    this.quad.geometry.dispose();
  }
}
