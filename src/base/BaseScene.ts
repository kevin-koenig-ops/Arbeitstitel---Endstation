// Die Endstation als 3D-Diorama: Wartehalle mit Schutt und Möbeln, draußen der Bus.
// Kamera schräg von oben, drehbar und zoombar. Wände auf der Kameraseite werden
// abgesenkt, damit man immer hineinsieht (wie bei Die Sims).

import * as THREE from 'three';
import { footprint, HALL_D, HALL_W, RUBBLE, type FurnitureId } from '../core/furniture';
import type { DayPhase } from '../core/sun';
import type { PlacedItem, PlayerState } from '../core/types';
import { box, buildBus, buildFurniture, buildRubble, cyl, mat, type LightSpec } from './models';

export type Pick = { type: 'item'; uid: number } | { type: 'rubble'; id: string } | { type: 'floor'; x: number; y: number } | null;

interface ItemView {
  item: PlacedItem;
  group: THREE.Group;
  light?: { spec: LightSpec; obj: THREE.PointLight };
}

const MAX_POINT_LIGHTS = 6;

const PHASES: Record<DayPhase, { hemi: [string, string, number]; sun: [string, number, [number, number, number]]; lamp: number; fire: number; exposure: number; bg: string; haze: string }> = {
  day: { hemi: ['#ffe9c8', '#5a5040', 1.15], sun: ['#ffe0b0', 2.6, [-8, 14, 6]], lamp: 0, fire: 0.5, exposure: 1.0, bg: 'radial-gradient(ellipse at 50% 40%, #4d4234 0%, #1d1914 70%)', haze: '#1d1914' },
  dusk: { hemi: ['#ffb08a', '#3a2e2a', 0.8], sun: ['#ff8a50', 2.0, [-14, 5, 4]], lamp: 0.75, fire: 0.9, exposure: 0.95, bg: 'radial-gradient(ellipse at 50% 35%, #5e3826 0%, #170f0d 72%)', haze: '#170f0d' },
  night: { hemi: ['#5a6c9e', '#1c1f28', 0.95], sun: ['#a9bce6', 1.1, [6, 12, -4]], lamp: 1, fire: 1, exposure: 1.15, bg: 'radial-gradient(ellipse at 50% 40%, #1b2438 0%, #07090f 72%)', haze: '#07090f' },
};

export class BaseScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** Dunst am Rand: der Boden draußen verläuft weich in den Hintergrund */
  private haze = new THREE.Fog('#000000', 20, 40);
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private items = new Map<number, ItemView>();
  private rubble = new Map<string, THREE.Group>();
  private walls: { group: THREE.Group; upper: THREE.Object3D[]; normal: THREE.Vector2 }[] = [];
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private marker: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private az = 0.62;
  private el = 0.78;
  /** Zoom relativ zur Einpassung der ganzen Halle (1 = alles im Bild). */
  private zoomF = 0.86;
  private phase: DayPhase = 'day';
  private ro: ResizeObserver;

  /** Für die Oberfläche: Tippen und Ziehen. */
  onTap: (p: Pick) => void = () => {};
  onDragCell: ((x: number, z: number) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'base-canvas';
    host.append(this.renderer.domElement);

    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.buildHall();
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffb22e', transparent: true, opacity: 0.35, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindPointer();
    this.setPhase('day');
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // --- Aufbau der Halle --------------------------------------------------------------
  private buildHall() {
    const W = HALL_W;
    const D = HALL_D;
    // Außenboden
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ color: '#d8d0c0', roughness: 1, map: groundTexture(), flatShading: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.16;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.scene.fog = this.haze;

    // Bahnsteig und Bus
    const out = new THREE.Group();
    box(out, 1.7, 0.16, 12, mat('#8a8476'), W / 2 + 1.25, -0.16, 0);
    box(out, 0.12, 0.17, 12, mat('#c9a23a'), W / 2 + 2.05, -0.16, 0);
    const bus = buildBus();
    bus.position.set(W / 2 + 3.6, -0.16, 0.3);
    out.add(bus);
    // Ein paar Dinge draußen
    cyl(out, 0.06, 0.08, 3.6, mat('#3b3f3a'), -W / 2 - 1.2, -0.16, -D / 2 - 0.8, 6);
    box(out, 0.9, 0.12, 0.25, mat('#3b3f3a'), -W / 2 - 0.85, 3.3, -D / 2 - 0.8);
    for (const [x, z] of [[-W / 2 - 2, 2], [-1, D / 2 + 2.2], [3, -D / 2 - 2.5], [W / 2 + 1.3, D / 2 + 3]]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 5), mat('#5d6b3a'));
      tuft.position.set(x, 0.1, z);
      tuft.castShadow = true;
      out.add(tuft);
    }
    const rb = buildRubble(2, 1.5, 77);
    rb.position.set(-W / 2 - 2.2, -0.16, -1);
    out.add(rb);
    this.scene.add(out);

    // Fliesenboden
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, D), [
      mat('#5a5448'),
      mat('#5a5448'),
      new THREE.MeshStandardMaterial({ map: floorTexture(W, D), roughness: 0.95 }),
      mat('#5a5448'),
      mat('#5a5448'),
      mat('#5a5448'),
    ]);
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Wände: links, rechts (mit Tür zum Bahnsteig), hinten (mit Schild), vorne (mit Tür)
    this.addWall(D, new THREE.Vector2(-1, 0), -W / 2, 0, Math.PI / 2, false);
    this.addWall(D, new THREE.Vector2(1, 0), W / 2, 0, -Math.PI / 2, true);
    this.addWall(W, new THREE.Vector2(0, -1), 0, -D / 2, 0, false, true);
    this.addWall(W, new THREE.Vector2(0, 1), 0, D / 2, Math.PI, true);

  }

  /** Eine Wand entlang x (lokal), innen bei +z. */
  private addWall(length: number, normal: THREE.Vector2, x: number, z: number, ry: number, door: boolean, sign = false) {
    const g = new THREE.Group();
    const tile = mat('#6f7b6a');
    const trim = mat('#4a5248');
    const concrete = mat('#9a9385');
    const upper: THREE.Object3D[] = [];
    const t = 0.2;
    const doorW = 1.5;
    const segs: [number, number][] = door
      ? [
          [-length / 2, -doorW / 2],
          [doorW / 2, length / 2],
        ]
      : [[-length / 2, length / 2]];
    for (const [a, b] of segs) {
      box(g, b - a, 0.9, t, tile, (a + b) / 2, 0, 0);
      box(g, b - a, 0.08, t + 0.04, trim, (a + b) / 2, 0.9, 0);
    }
    // Obere Wand mit Fenstern: Pfeiler + Sturz + Glas
    const pillars = Math.max(2, Math.round(length / 1.6));
    for (let i = 0; i <= pillars; i++) {
      const px = -length / 2 + (length * i) / pillars;
      if (door && Math.abs(px) < doorW / 2 + 0.1) continue;
      upper.push(box(g, 0.3, 1.6, t, concrete, Math.max(-length / 2 + 0.15, Math.min(length / 2 - 0.15, px)), 0.98, 0));
    }
    if (door) for (const s of [-1, 1]) upper.push(box(g, 0.2, 2.2, t, concrete, s * (doorW / 2 + 0.1), 0, 0));
    upper.push(box(g, length, 0.45, t, concrete, 0, 2.58, 0));
    const glassMat = new THREE.MeshStandardMaterial({ color: '#9fb0b8', transparent: true, opacity: 0.28, roughness: 0.2 });
    for (let i = 0; i < pillars; i++) {
      const cx = -length / 2 + (length * (i + 0.5)) / pillars;
      if (door && Math.abs(cx) < doorW / 2 + 0.3) continue;
      if ((i * 7 + Math.round(length)) % 3 === 0) continue; // zerbrochene Scheibe
      const pane = new THREE.Mesh(new THREE.BoxGeometry(length / pillars - 0.3, 1.5, 0.04), glassMat);
      pane.position.set(cx, 1.75, 0);
      g.add(pane);
      upper.push(pane);
    }
    if (sign) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.62, 0.06), [mat('#111'), mat('#111'), mat('#111'), mat('#111'), new THREE.MeshBasicMaterial({ map: signTexture() }), mat('#111')]);
      s.position.set(0, 2.55, 0.14);
      g.add(s);
      upper.push(s);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.scene.add(g);
    this.walls.push({ group: g, upper, normal });
  }

  // --- Spielstand anzeigen -------------------------------------------------------------
  setState(state: PlayerState) {
    // Schutt
    for (const r of RUBBLE) {
      const present = state.base.rubble.includes(r.id);
      const g = this.rubble.get(r.id);
      if (present && !g) {
        const ng = buildRubble(r.w, r.d, r.x * 31 + r.y * 7);
        ng.position.set(r.x - HALL_W / 2 + r.w / 2, 0, r.y - HALL_D / 2 + r.d / 2);
        ng.userData.rubble = r.id;
        this.scene.add(ng);
        this.rubble.set(r.id, ng);
      } else if (!present && g) {
        this.scene.remove(g);
        this.rubble.delete(r.id);
      }
    }
    // Möbel
    const seen = new Set<number>();
    for (const it of state.base.items) {
      seen.add(it.uid);
      let v = this.items.get(it.uid);
      if (!v) {
        const m = buildFurniture(it.kind);
        m.group.userData.uid = it.uid;
        this.scene.add(m.group);
        v = { item: it, group: m.group };
        if (m.light) {
          const obj = new THREE.PointLight(m.light.color, 0, m.light.distance, 1.6);
          obj.position.y = m.light.y;
          m.group.add(obj);
          v.light = { spec: m.light, obj };
        }
        this.items.set(it.uid, v);
      }
      v.item = it;
      this.placeGroup(v.group, it.kind, it.x, it.y, it.rot);
    }
    for (const [uid, v] of this.items) {
      if (!seen.has(uid)) {
        this.scene.remove(v.group);
        this.items.delete(uid);
      }
    }
    this.applyLights();
  }

  private placeGroup(g: THREE.Object3D, kind: FurnitureId, x: number, y: number, rot: number) {
    const f = footprint(kind, rot);
    g.position.set(x - HALL_W / 2 + f.w / 2, 0, y - HALL_D / 2 + f.d / 2);
    g.rotation.y = -rot * (Math.PI / 2);
  }

  setPhase(phase: DayPhase) {
    this.phase = phase;
    const p = PHASES[phase];
    this.hemi.color.set(p.hemi[0]);
    this.hemi.groundColor.set(p.hemi[1]);
    this.hemi.intensity = p.hemi[2];
    this.sun.color.set(p.sun[0]);
    this.sun.intensity = p.sun[1];
    this.sun.position.set(...p.sun[2]);
    this.renderer.toneMappingExposure = p.exposure;
    this.host.style.background = p.bg;
    this.haze.color.set(p.haze);
    const bus = this.scene.getObjectByName('busSign') as THREE.Mesh | undefined;
    if (bus) (bus.material as THREE.MeshBasicMaterial).color.set(phase === 'day' ? '#c98a24' : '#ffb22e');
    this.applyLights();
  }

  private applyLights() {
    const p = PHASES[this.phase];
    let n = 0;
    for (const v of this.items.values()) {
      if (!v.light) continue;
      const on = n < MAX_POINT_LIGHTS;
      n++;
      const f = v.light.spec.flicker ? p.fire : p.lamp;
      v.light.obj.visible = on && f > 0;
      v.light.obj.intensity = v.light.spec.intensity * f;
    }
  }

  // --- Geist beim Platzieren, Markierung --------------------------------------------
  showGhost(kind: FurnitureId, x: number, y: number, rot: number, valid: boolean) {
    const key = `${kind}|${valid}`;
    if (this.ghostKey !== key) {
      this.hideGhost();
      const m = buildFurniture(kind);
      const gm = new THREE.MeshStandardMaterial({ color: valid ? '#a8e08a' : '#e8735a', transparent: true, opacity: 0.6, emissive: valid ? '#4a7a3a' : '#7a2a1a', emissiveIntensity: 0.6 });
      m.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).material = gm;
          o.castShadow = false;
        }
        if ((o as THREE.PointLight).isPointLight) o.visible = false;
      });
      this.ghost = m.group;
      this.ghostKey = key;
      this.scene.add(m.group);
    }
    this.placeGroup(this.ghost!, kind, x, y, rot);
    this.ghost!.position.y = 0.04;
    this.mark(kind, x, y, rot, valid ? '#a8e08a' : '#e8735a');
  }

  hideGhost() {
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = null;
    this.ghostKey = '';
    this.marker.visible = false;
  }

  /** Grundfläche farbig markieren (Auswahl oder Geist). */
  mark(kind: FurnitureId | null, x: number, y: number, rot: number, color = '#ffb22e', w?: number, d?: number) {
    const f = kind ? footprint(kind, rot) : { w: w ?? 1, d: d ?? 1 };
    this.marker.scale.set(f.w, f.d, 1);
    this.marker.position.set(x - HALL_W / 2 + f.w / 2, 0.015, y - HALL_D / 2 + f.d / 2);
    (this.marker.material as THREE.MeshBasicMaterial).color.set(color);
    this.marker.visible = true;
  }

  unmark() {
    this.marker.visible = false;
  }

  setItemHidden(uid: number, hidden: boolean) {
    const v = this.items.get(uid);
    if (v) v.group.visible = !hidden;
  }

  // --- Kamera ---------------------------------------------------------------------------
  rotate(delta: number) {
    this.az += delta;
  }

  zoom(factor: number) {
    this.zoomF = Math.min(1.3, Math.max(0.42, this.zoomF * factor));
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Bild etwas nach oben schieben: unten liegt die Bauleiste über der Szene
    this.camera.setViewOffset(w, h, 0, h * 0.07, w, h);
    this.camera.updateProjectionMatrix();
  }

  private updateCamera() {
    // Abstand so wählen, dass die ganze Halle ins Bild passt (auch hochkant)
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const R = 6.4;
    const r = Math.max(R / Math.tan(vfov / 2), R / Math.tan(hfov / 2)) * this.zoomF;
    this.camera.position.set(Math.sin(this.az) * Math.cos(this.el) * r, Math.sin(this.el) * r + 0.6, Math.cos(this.az) * Math.cos(this.el) * r);
    this.camera.lookAt(0.3, 0.4, 0);
    this.haze.near = r + 2;
    this.haze.far = r + 15;
    // Wände auf der Kameraseite absenken
    const dir = new THREE.Vector2(Math.sin(this.az), Math.cos(this.az));
    for (const w of this.walls) {
      const cut = w.normal.dot(dir) > 0.25;
      for (const o of w.upper) o.visible = !cut;
    }
  }

  // --- Eingabe --------------------------------------------------------------------------
  private toNdc(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }

  /** Bodenpunkt unter dem Finger (Weltkoordinaten x/z). */
  floorPoint(cx: number, cy: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.toNdc(cx, cy), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, p) ? p : null;
  }

  pick(cx: number, cy: number): Pick {
    this.raycaster.setFromCamera(this.toNdc(cx, cy), this.camera);
    const targets: THREE.Object3D[] = [...[...this.items.values()].map((v) => v.group), ...this.rubble.values()];
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.uid === undefined && o.userData.rubble === undefined) o = o.parent;
      if (o?.userData.uid !== undefined && o.visible) return { type: 'item', uid: o.userData.uid };
      if (o?.userData.rubble !== undefined) return { type: 'rubble', id: o.userData.rubble };
    }
    const p = this.floorPoint(cx, cy);
    if (p && Math.abs(p.x) < HALL_W / 2 && Math.abs(p.z) < HALL_D / 2) return { type: 'floor', x: Math.floor(p.x + HALL_W / 2), y: Math.floor(p.z + HALL_D / 2) };
    return null;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinch = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY, t: performance.now() };
        moved = false;
      }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.zoom(pinch / d);
        pinch = d;
        moved = true;
        return;
      }
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) moved = true;
      if (!moved) return;
      if (this.onDragCell) {
        const p = this.floorPoint(e.clientX, e.clientY);
        if (p) this.onDragCell(p.x + HALL_W / 2, p.z + HALL_D / 2);
      } else {
        this.az -= dx * 0.008;
        this.el = Math.min(1.25, Math.max(0.45, this.el + dy * 0.005));
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (pts.size === 0 && start && !moved && performance.now() - start.t < 500) this.onTap(this.pick(e.clientX, e.clientY));
      if (pts.size === 0) start = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1.08 : 0.92);
    }, { passive: false });
  }

  // --- Schleife -------------------------------------------------------------------------
  private frame(t: number) {
    this.updateCamera();
    // Feuer flackert
    for (const v of this.items.values()) {
      if (!v.light?.spec.flicker) continue;
      const f = PHASES[this.phase].fire;
      v.light.obj.intensity = v.light.spec.intensity * f * (0.82 + 0.18 * Math.sin(t / 90 + v.item.uid) * Math.sin(t / 37));
      v.group.traverse((o) => {
        if (o.name === 'flame') o.scale.y = 0.85 + 0.25 * Math.abs(Math.sin(t / 120 + o.id));
      });
    }
    if (this.ghost) this.ghost.position.y = 0.04 + Math.sin(t / 250) * 0.03;
    this.sun.target.position.set(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

// --- Texturen ------------------------------------------------------------------------------

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function floorTexture(W: number, D: number) {
  const px = 64;
  return canvasTex(W * px, D * px, (g) => {
    let s = 7;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let y = 0; y < D * 2; y++)
      for (let x = 0; x < W * 2; x++) {
        const v = 116 + Math.floor(r() * 14);
        g.fillStyle = `rgb(${v + 6},${v},${v - 12})`;
        g.fillRect((x * px) / 2, (y * px) / 2, px / 2, px / 2);
      }
    g.strokeStyle = 'rgba(40,36,30,0.55)';
    g.lineWidth = 2;
    for (let x = 0; x <= W * 2; x++) {
      g.beginPath();
      g.moveTo((x * px) / 2, 0);
      g.lineTo((x * px) / 2, D * px);
      g.stroke();
    }
    for (let y = 0; y <= D * 2; y++) {
      g.beginPath();
      g.moveTo(0, (y * px) / 2);
      g.lineTo(W * px, (y * px) / 2);
      g.stroke();
    }
    // Flecken und Risse
    for (let i = 0; i < 14; i++) {
      const x = r() * W * px;
      const y = r() * D * px;
      const rad = 20 + r() * 70;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(50,44,34,0.35)');
      grad.addColorStop(1, 'rgba(50,44,34,0)');
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.strokeStyle = 'rgba(30,26,22,0.6)';
    for (let i = 0; i < 6; i++) {
      let x = r() * W * px;
      let y = r() * D * px;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function groundTexture() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#4b4538';
    g.fillRect(0, 0, 256, 256);
    let s = 3;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(30,27,22,0.4)' : 'rgba(110,100,80,0.35)';
      g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(12, 12);
  return t;
}

function signTexture() {
  return canvasTex(840, 124, (g) => {
    g.fillStyle = '#0b0a09';
    g.fillRect(0, 0, 840, 124);
    for (let y = 6; y < 124; y += 8) for (let x = 6; x < 840; x += 8) {
      g.fillStyle = '#2a1e0c';
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.font = '900 78px Doto, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff9d1a';
    g.shadowBlur = 18;
    g.fillStyle = '#ffc35a';
    g.fillText('0  ENDSTATION', 420, 66);
  });
}

// --- Vorschaubilder für die Bauleiste ---------------------------------------------------

export function renderThumbnails(kinds: FurnitureId[], size = 112): Record<string, string> {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff1d8', '#4b4538', 1.4));
  const d = new THREE.DirectionalLight('#ffe0b0', 2.4);
  d.position.set(-3, 6, 4);
  scene.add(d);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const out: Record<string, string> = {};
  for (const k of kinds) {
    const m = buildFurniture(k);
    scene.add(m.group);
    const bb = new THREE.Box3().setFromObject(m.group);
    const c = bb.getCenter(new THREE.Vector3());
    const s = bb.getSize(new THREE.Vector3()).length();
    cam.position.set(c.x + s * 1.25, c.y + s * 1.05, c.z + s * 1.6);
    cam.lookAt(c);
    r.render(scene, cam);
    out[k] = r.domElement.toDataURL('image/png');
    scene.remove(m.group);
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
