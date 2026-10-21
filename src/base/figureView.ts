// Die Spielfigur außerhalb der Endstation: als Porträt-Bild (Ausweis, Kopfzeile)
// und als kleine Live-Ansicht (Charaktererstellung, Spielerfigur auf der Karte).

import * as THREE from 'three';
import { StyledRenderer } from './comic';
import { graphicsStyle } from './gfxStyle';
import type { Character } from '../core/types';
import { blobShadow, CharacterRig } from './character';

type Look = Character['look'];

// --- Porträts -------------------------------------------------------------------------

let portraitRenderer: THREE.WebGLRenderer | null = null;
let portraitStyled: StyledRenderer | null = null;
const portraitCache = new Map<string, string>();

/** Kopf und Schultern als Bild (PNG-Daten-URL), transparent. */
export function renderPortrait(look: Look, size = 128): string {
  const key = `${look.hair}|${look.color}|${look.skin}|${size}|${graphicsStyle()}`;
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
  if (!portraitStyled) portraitStyled = new StyledRenderer(r, 1.6, false);
  portraitStyled.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  rig.dispose();
  portraitCache.set(key, url);
  return url;
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
  private styled: StyledRenderer;
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
    // Auf der Karte wird die Figur stark verkleinert: dort dickere Linien
    this.styled = new StyledRenderer(this.renderer, opts.mode === 'marker' ? 2 : 1.5, opts.mode !== 'marker');
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
    const rim = new THREE.DirectionalLight('#a9bce6', stage ? 1.6 : 0.8);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    this.scene.add(this.holder);

    if (stage) {
      this.camera = new THREE.PerspectiveCamera(28, opts.width / opts.height, 0.1, 30);
      this.camera.position.set(0, 1.3, 4.6);
      this.camera.lookAt(0, 0.92, 0);
      // Sockel: ein Stück Bahnsteig mit gelber Kante
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.76, 0.12, 10), new THREE.MeshStandardMaterial({ color: '#8a8476', roughness: 0.95, flatShading: true }));
      slab.position.y = -0.06;
      slab.receiveShadow = true;
      this.scene.add(slab);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.025, 4, 30), new THREE.MeshStandardMaterial({ color: '#c9a23a', roughness: 0.7, flatShading: true }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.002;
      this.scene.add(ring);
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderOnce();
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

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
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
    this.styled.render(this.scene, this.camera);
  }

  private renderOnce() {
    if (!this.rig) return;
    this.rig.update(performance.now() / 1000, 0, 0);
    this.holder.rotation.y = this.yaw;
    this.styled.render(this.scene, this.camera);
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
    this.styled.dispose();
    this.rig?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
