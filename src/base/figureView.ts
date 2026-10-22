// Die Spielfigur außerhalb des Zuhauses: als Porträt-Bild (Ausweis, Kopfzeile)
// und als kleine Live-Ansicht (Charaktererstellung, Spielerfigur auf der Karte).

import * as THREE from 'three';
import type { Character, WeaponId } from '../core/types';
import { blobShadow, CharacterRig } from './character';

type Look = Character['look'];

// --- Porträts -------------------------------------------------------------------------

let portraitRenderer: THREE.WebGLRenderer | null = null;
const portraitCache = new Map<string, string>();

/** Kopf und Schultern als Bild (PNG-Daten-URL), transparent. */
export function renderPortrait(look: Look, size = 128): string {
  const key = `${look.hair}|${look.color}|${look.skin}|${size}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  if (!portraitRenderer) {
    portraitRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    portraitRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  const r = portraitRenderer;
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff1d8', '#3a332a', 1.5));
  const key1 = new THREE.DirectionalLight('#ffe2b8', 2.4);
  key1.position.set(1.5, 2.5, 3);
  scene.add(key1);
  const rim = new THREE.DirectionalLight('#9fb4d8', 1.2);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);
  const rig = new CharacterRig(look);
  rig.update(0.6, 0, 0);
  rig.root.rotation.y = -0.32;
  scene.add(rig.root);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
  cam.position.set(0.12, 1.78, 1.5);
  cam.lookAt(0, 1.62, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  rig.dispose();
  portraitCache.set(key, url);
  return url;
}

// --- Sockel ---------------------------------------------------------------------------

/** Kleiner Zufall mit festem Startwert, damit der Sockel immer gleich aussieht. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rostiges Blech als kleine Textur: dunkles Metall mit Rostflecken und Kratzern. */
function rustTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = seeded(7);
  g.fillStyle = '#4b4846';
  g.fillRect(0, 0, 256, 256);
  // Rostflecken (weich, mehrere Schichten)
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 6 + rnd() * 38;
    const col = ['138,74,36', '166,90,42', '107,58,30', '186,112,58'][Math.floor(rnd() * 4)];
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${col},${0.35 + rnd() * 0.4})`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Körnung und helle Kratzer
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,180,0.08)';
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.strokeStyle = 'rgba(220,200,170,0.18)';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 16);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Sockel: runde, rostige Blechscheibe mit Rand, auf ein paar Steinen. Oberkante bei y = 0. */
function pedestal(): THREE.Group {
  const g = new THREE.Group();
  const tex = rustTexture();
  const rust = new THREE.MeshStandardMaterial({ map: tex, color: '#d9cfc4', roughness: 0.78, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ map: tex, color: '#8f8278', roughness: 0.85, metalness: 0.3 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.82, 0.12, 48), rust);
  top.position.y = -0.06;
  top.receiveShadow = true;
  g.add(top);
  // Aufgebogener Rand oben
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 8, 64), rust);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.004;
  g.add(lip);
  // Breiterer, dunklerer Fuß
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.9, 0.1, 48), dark);
  foot.position.y = -0.17;
  foot.receiveShadow = true;
  g.add(foot);
  // Steine rundherum
  const rnd = seeded(3);
  const stone = new THREE.MeshStandardMaterial({ color: '#6c7077', roughness: 0.95, flatShading: true });
  const geo = new THREE.DodecahedronGeometry(0.15, 0);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rnd() * 0.2;
    const r = 0.8 + rnd() * 0.08;
    const m = new THREE.Mesh(geo, stone);
    m.position.set(Math.cos(a) * r, -0.29 + rnd() * 0.04, Math.sin(a) * r);
    m.scale.set(1.1 + rnd() * 0.6, 0.55 + rnd() * 0.3, 0.9 + rnd() * 0.5);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(m);
  }
  return g;
}

// --- Live-Ansicht ---------------------------------------------------------------------

export interface FigureViewOpts {
  /** stage = groß mit Sockel (Charaktererstellung), marker = klein von schräg oben (Karte) */
  mode: 'stage' | 'marker';
  width: number;
  height: number;
}

export class FigureView {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rig: CharacterRig | null = null;
  private holder = new THREE.Group();
  private yaw = 0;
  private targetYaw = 0;
  private moving = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private dragging = false;

  constructor(private opts: FigureViewOpts) {
    const stage = opts.mode === 'stage';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(opts.width, opts.height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = stage;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('figure-canvas');

    this.scene.add(new THREE.HemisphereLight('#ffeedd', '#3a332a', stage ? 1.2 : 1.6));
    const sun = new THREE.DirectionalLight('#ffe0b0', stage ? 2.6 : 2.2);
    sun.position.set(2, 4, 3);
    sun.castShadow = stage;
    sun.shadow.mapSize.set(512, 512);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -1.2;
    sc.right = sc.top = 1.2;
    this.scene.add(sun);
    // Auf dem Sockel: warmes Gegenlicht von hinten (wie ein Feuer hinter der Figur), sonst kühles Randlicht
    const rim = new THREE.DirectionalLight(stage ? '#ff9a4a' : '#a9bce6', stage ? 2.4 : 0.8);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    if (stage) {
      const rim2 = new THREE.DirectionalLight('#ffb45e', 1.6);
      rim2.position.set(3, 1.6, -2.6);
      this.scene.add(rim2);
    }
    this.scene.add(this.holder);

    if (stage) {
      this.camera = new THREE.PerspectiveCamera(28, opts.width / opts.height, 0.1, 30);
      this.frameStage();
      this.scene.add(pedestal());
      this.bindDrag();
      this.targetYaw = this.yaw = 0.35;
    } else {
      this.camera = new THREE.PerspectiveCamera(24, opts.width / opts.height, 0.1, 30);
      this.camera.position.set(0, 3.2, 3.7);
      this.camera.lookAt(0, 0.82, 0);
      this.scene.add(blobShadow(0.5, 0.45));
    }
  }

  /** Größe ändern (z. B. wenn der Platz im Layout wächst). */
  setSize(w: number, h: number) {
    if (w < 10 || h < 10) return;
    this.renderer.setSize(w, h);
    this.opts.width = w;
    this.opts.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.opts.mode === 'stage') this.frameStage();
    this.renderOnce();
  }

  /** Kamera so weit zurück, dass Figur und Sockel samt Steinen ganz ins Bild passen (auch schmal und hoch). */
  private frameStage() {
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * this.camera.aspect;
    // Sichtbarer Bereich: unten die Steine (y = -0,45), oben über dem Kopf (y = 2,0); Breite der Sockel samt Steinen
    const midY = 0.76;
    const dist = Math.max(1.24 / tanV, 1.08 / tanH);
    this.camera.position.set(0, midY + dist * 0.095, dist);
    this.camera.lookAt(0, midY, 0);
  }

  setLook(look: Look) {
    if (this.rig) {
      this.holder.remove(this.rig.root);
      this.rig.dispose();
    }
    this.rig = new CharacterRig(look);
    this.holder.add(this.rig.root);
    this.renderOnce();
  }

  /** Wo stehen die Füße im Bild? (0 = oben, 1 = unten) */
  anchorY(): number {
    const v = new THREE.Vector3(0, 0, 0).project(this.camera);
    return (1 - v.y) / 2;
  }

  /** Blickrichtung in Bildschirm-Koordinaten (0 = zur Kamera, im Uhrzeigersinn). */
  setYaw(rad: number) {
    this.targetYaw = rad;
  }

  /** 0 = steht, 1 = geht, 2 bis 3 = rennt. */
  setMoving(moving: number | boolean) {
    this.moving = Number(moving);
  }

  /** Wie hoch ist die Figur (Füße bis Scheitel) im Bild, in CSS-Pixeln? */
  figureHeightPx(): number {
    const feet = new THREE.Vector3(0, 0, 0).project(this.camera);
    const head = new THREE.Vector3(0, 1.9, 0).project(this.camera);
    return ((head.y - feet.y) / 2) * this.opts.height;
  }

  wave() {
    this.rig?.wave();
  }

  /** Waffe in die Hand (null = Fäuste). Nach setLook aufrufen. */
  holdWeapon(kind: WeaponId | null) {
    this.rig?.holdWeapon(kind);
    this.renderOnce();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      // Auf der Karte reichen wenige Bilder pro Sekunde, das schont den Akku
      const fps = this.opts.mode === 'marker' ? (this.moving > 0 ? 24 : 12) : 40;
      this.acc += dt;
      if (this.acc < 1 / fps) return;
      this.step(now / 1000, this.acc);
      this.acc = 0;
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private step(t: number, dt: number) {
    if (!this.rig) return;
    if (this.opts.mode === 'stage' && !this.dragging) this.targetYaw += dt * 0.25;
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 8);
    this.holder.rotation.y = this.yaw;
    this.rig.update(t, dt, this.moving);
    this.renderer.render(this.scene, this.camera);
  }

  private renderOnce() {
    if (!this.rig) return;
    this.rig.update(performance.now() / 1000, 0, 0);
    this.holder.rotation.y = this.yaw;
    this.renderer.render(this.scene, this.camera);
  }

  /** Auf dem Sockel kann man die Figur mit dem Finger drehen. */
  private bindDrag() {
    const el = this.canvas;
    let lastX = 0;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.targetYaw += (e.clientX - lastX) * 0.012;
      this.yaw = this.targetYaw;
      lastX = e.clientX;
    });
    const up = () => (this.dragging = false);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  dispose() {
    this.stop();
    this.rig?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
