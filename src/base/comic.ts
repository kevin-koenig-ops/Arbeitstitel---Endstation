// Comic-Look (Cel-Shading): flächige Farben in wenigen Stufen und dunkle Umrisslinien.
//
// Funktioniert für alle 3D-Szenen gleich:
// 1. Vor dem Zeichnen werden die normalen Materialien gegen Comic-Materialien getauscht
//    (und zurück, wenn man wieder auf Polygon stellt). Farben bleiben verknüpft,
//    damit Effekte wie das Aufblitzen weiter funktionieren.
// 2. Die Szene wird in ein Bild mit Tiefeninformation gezeichnet. Ein zweiter Schritt
//    zieht dort Linien, wo die Tiefe springt (Umrisse) oder die Farbe stark wechselt.

import * as THREE from 'three';
import { graphicsStyle } from './gfxStyle';

let gradient: THREE.DataTexture | null = null;

/** Drei Helligkeitsstufen für das direkte Licht: Schatten, Halbschatten, Licht. */
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([105, 175, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const toToon = new WeakMap<THREE.Material, THREE.MeshToonMaterial>();
const toStd = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();

function comicOf(s: THREE.MeshStandardMaterial): THREE.MeshToonMaterial {
  let t = toToon.get(s);
  if (!t) {
    t = new THREE.MeshToonMaterial({
      vertexColors: s.vertexColors,
      map: s.map,
      emissiveIntensity: s.emissiveIntensity,
      transparent: s.transparent,
      opacity: s.opacity,
      side: s.side,
      depthWrite: s.depthWrite,
      depthTest: s.depthTest,
      alphaTest: s.alphaTest,
      gradientMap: gradientMap(),
    });
    // Dieselben Farb-Objekte: Änderungen (z. B. Treffer-Blitz) wirken in beiden Stilen
    t.color = s.color;
    t.emissive = s.emissive;
    t.name = s.name;
    toToon.set(s, t);
    toStd.set(t, s);
  }
  // Zahlenwerte können sich zur Laufzeit ändern (Ausblenden, Leuchten)
  t.opacity = s.opacity;
  t.emissiveIntensity = s.emissiveIntensity;
  t.visible = s.visible;
  return t;
}

function swap(m: THREE.Material, comic: boolean): THREE.Material {
  if (comic) {
    if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return comicOf(m as THREE.MeshStandardMaterial);
    const s = toStd.get(m);
    if (s) comicOf(s);
    return m;
  }
  return toStd.get(m) ?? m;
}

/** Materialien der Szene auf den aktuellen Stil bringen. */
export function applyStyle(root: THREE.Object3D) {
  const comic = graphicsStyle() === 'comic';
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = mesh.material;
    if (Array.isArray(mats)) {
      let changed = false;
      const next = mats.map((m) => {
        const n = swap(m, comic);
        if (n !== m) changed = true;
        return n;
      });
      if (changed) mesh.material = next;
    } else {
      const n = swap(mats, comic);
      if (n !== mats) mesh.material = n;
    }
  });
}

// --- Umrisslinien ------------------------------------------------------------------

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
#include <packing>
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uThick;
uniform vec3 uInk;

// 1/Abstand ist auf Flächen im Bild gleichmäßig: Sprünge darin sind Kanten
float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (d >= 0.99999) return 0.0;
  return -1.0 / perspectiveDepthToViewZ(d, uNear, uFar);
}
float luma(vec3 c) { return sqrt(dot(c, vec3(0.299, 0.587, 0.114))); }

void main() {
  vec4 c = texture2D(tColor, vUv);
  vec2 ox = vec2(uTexel.x * uThick, 0.0);
  vec2 oy = vec2(0.0, uTexel.y * uThick);
  float w0 = invZ(vUv);
  float wl = invZ(vUv - ox);
  float wr = invZ(vUv + ox);
  float wd = invZ(vUv - oy);
  float wu = invZ(vUv + oy);
  float wmax = max(max(max(w0, wl), max(wr, wd)), wu);
  float lap = (abs(wl + wr - 2.0 * w0) + abs(wu + wd - 2.0 * w0)) / max(wmax, 1e-5);
  float eDepth = smoothstep(0.006, 0.02, lap);

  vec4 cl = texture2D(tColor, vUv - ox);
  vec4 cr = texture2D(tColor, vUv + ox);
  vec4 cd = texture2D(tColor, vUv - oy);
  vec4 cu = texture2D(tColor, vUv + oy);
  float dc = abs(luma(cl.rgb) - luma(cr.rgb)) + abs(luma(cu.rgb) - luma(cd.rgb));
  float eColor = smoothstep(0.16, 0.3, dc) * step(0.5, min(min(cl.a, cr.a), min(cu.a, cd.a)));

  float e = clamp(max(eDepth, eColor * 0.75), 0.0, 1.0);
  // Etwas kräftigere Farben wie im Zeichentrick
  vec3 col = c.rgb;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(vec3(0.0), mix(vec3(l), col, 1.18));
  col = mix(col, uInk * c.a, e);
  gl_FragColor = vec4(col, max(c.a, e));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Zeichnet eine Szene im Comic-Stil (mit Umrissen). */
export class ComicPost {
  private rt: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  /** thick: Linienbreite in CSS-Pixeln */
  constructor(
    private renderer: THREE.WebGLRenderer,
    private thick = 1.2,
  ) {
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(1, 1);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uThick: { value: 1 },
        uInk: { value: new THREE.Color('#1b130d') },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.NoBlending,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const h = Math.max(1, Math.floor(this.size.y));
    if (this.rt.width !== w || this.rt.height !== h) {
      this.rt.setSize(w, h);
      this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    }
    const u = this.material.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uThick.value = Math.max(1, this.thick * r.getPixelRatio());
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(prev);
    r.render(this.quadScene, this.quadCam);
  }

  dispose() {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}

/** Zeichnet im eingestellten Stil: Polygon direkt, Comic mit Umrissen. */
export class StyledRenderer {
  private post: ComicPost | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private thick = 1.2,
  ) {}

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    applyStyle(scene);
    if (graphicsStyle() === 'comic') {
      if (!this.post) this.post = new ComicPost(this.renderer, this.thick);
      this.post.render(scene, camera);
    } else this.renderer.render(scene, camera);
  }

  dispose() {
    this.post?.dispose();
    this.post = null;
  }
}
