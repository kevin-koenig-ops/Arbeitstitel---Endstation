// Die Endstation in 3D: Gelände mit Umgebung, Hindernissen, Wänden, Böden, Dächern,
// Möbeln und deiner Figur. Kamera schräg von oben: ein Finger schiebt, zwei Finger
// zoomen, gedreht wird nur per Knopf (in 90°-Schritten).
// Wände vor einem Raum werden abgesenkt, damit man hineinsieht (wie bei Die Sims).

import * as THREE from 'three';
import { StyledRenderer } from './comic';
import { graphicsStyle } from './gfxStyle';
import { grassiness } from './painted';
import {
  cellIndex,
  cellKey,
  findRooms,
  inPlot,
  OBSTACLES,
  parseEdge,
  PIECES,
  PLOT,
  SECTION,
  type EdgeKey,
  type PlotIndex,
  type SiteId,
} from '../core/building';
import { footprint, type FurnitureId } from '../core/furniture';
import { hashString } from '../core/rng';
import type { DayPhase } from '../core/sun';
import type { Character, Plot } from '../core/types';
import type { WeatherKind } from '../services/weather';
import { Assembler, GLOW, LIT, placeMatrix, TemplateCache, type Template } from './bake';
import { CharacterRig } from './character';
import { buildEnvironment, type Environment } from './environment';
import { buildFurniture, PAT, type LightSpec } from './models';
import { findPath, nearestWalkable, walkable } from './path';
import { buildFloor, buildObstacle, buildRoof, buildRoofTrim, buildWall, CUT_H, WALL_H } from './structures';

const HALF = PLOT / 2;
const MAX_POINT_LIGHTS = 8;

export type WallView = 'cut' | 'full' | 'low';

export interface Hit {
  /** Bodenpunkt in Gelände-Metern (frei, auch außerhalb). */
  point: { x: number; y: number } | null;
  /** Feld auf dem Gelände (oder null). */
  cell: { x: number; y: number } | null;
  /** Nächste Rasterecke. */
  corner: { x: number; y: number } | null;
  /** Nächste Kante (getroffene Wand oder nah am Bodenpunkt). */
  edge: EdgeKey | null;
  wall: EdgeKey | null;
  item: number | null;
  obstacle: string | null;
  section: { sx: number; sy: number } | null;
  character: boolean;
}

export interface SceneData {
  seed: string;
  site: SiteId;
  plot: Plot;
  idx: PlotIndex;
}

const PHASES: Record<DayPhase, { hemi: [string, string, number]; sun: [string, number, [number, number, number]]; lamp: number; fire: number; exposure: number; haze: string }> = {
  day: { hemi: ['#ffe9c8', '#5a5040', 1.1], sun: ['#ffe0b0', 2.5, [-0.5, 0.85, 0.35]], lamp: 0, fire: 0.5, exposure: 1.0, haze: '#3a3328' },
  dusk: { hemi: ['#e8b49a', '#3a2e2a', 0.8], sun: ['#ff9a62', 1.8, [-0.85, 0.35, 0.3]], lamp: 0.75, fire: 0.9, exposure: 0.95, haze: '#2a1c18' },
  night: { hemi: ['#5a6c9e', '#1c1f28', 0.9], sun: ['#a9bce6', 0.9, [0.4, 0.8, -0.35]], lamp: 1, fire: 1, exposure: 1.15, haze: '#0c0e14' },
};

const PLOT_GROUND: Record<SiteId, string[]> = {
  depot: ['#6a665c', '#706b60', '#625e55', '#67635a'],
  farm: ['#7a7044', '#6f6a3e', '#827648', '#76703f'],
  lake: ['#55603a', '#5b663c', '#4f5a36', '#58623a'],
  fuel: ['#77736a', '#6e6a62', '#7d786e', '#726e65'],
  allotment: ['#62763c', '#6a7e40', '#5d6e38', '#667a3c'],
};

/** Licht im Stil „Gemalt“: wärmer, heller, mit hellem Dunst wie auf einem Gemälde. */
const PAINTED_PHASES: Record<DayPhase, { hemi: [string, string, number]; sun: [string, number, [number, number, number]]; exposure: number; haze: string }> = {
  day: { hemi: ['#fff0d6', '#8a7356', 1.55], sun: ['#ffd49a', 2.9, [-0.6, 0.72, 0.42]], exposure: 1.12, haze: '#c9aa84' },
  dusk: { hemi: ['#f2b88f', '#5a4038', 1.15], sun: ['#ff9452', 2.3, [-0.85, 0.33, 0.3]], exposure: 1.05, haze: '#8f5f4a' },
  night: { hemi: ['#6a7cb0', '#22252f', 1.05], sun: ['#a9bce6', 0.95, [0.4, 0.8, -0.35]], exposure: 1.2, haze: '#151a26' },
};

const W = (px: number) => px - HALF;
const hash = (s: string) => hashString(s);

function edgeWorld(e: EdgeKey): { x: number; z: number; ry: number } {
  const { o, x, y } = parseEdge(e);
  return o === 'h' ? { x: W(x + 0.5), z: W(y), ry: 0 } : { x: W(x), z: W(y + 0.5), ry: Math.PI / 2 };
}

export class BaseScene {
  readonly renderer: THREE.WebGLRenderer;
  private styled: StyledRenderer;
  private scene = new THREE.Scene();
  private haze = new THREE.Fog('#000000', 30, 90);
  private camera = new THREE.PerspectiveCamera(34, 1, 0.5, 500);
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private sunDir = new THREE.Vector3(-0.5, 0.85, 0.35).normalize();
  private ro: ResizeObserver;
  private cache = new TemplateCache();
  private lightSpecs = new Map<FurnitureId, LightSpec | undefined>();
  private raycaster = new THREE.Raycaster();
  private phase: DayPhase = 'day';
  private weather: WeatherKind = 'clear';
  private precip: { obj: THREE.LineSegments | THREE.Points; pos: Float32Array; speed: number; drift: number; len: number } | null = null;
  private flash = 0;

  // Gelände
  private data: SceneData | null = null;
  private env: Environment | null = null;
  private envSite: SiteId | null = null;
  private roomAt: Int16Array = new Int16Array(PLOT * PLOT).fill(-1);
  private layers: Record<'ground' | 'growth' | 'tufts' | 'obstacles' | 'floors' | 'walls' | 'roofs' | 'items', THREE.Object3D> = {
    ground: new THREE.Group(),
    tufts: new THREE.Group(),
    growth: new THREE.Group(),
    obstacles: new THREE.Group(),
    floors: new THREE.Group(),
    walls: new THREE.Group(),
    roofs: new THREE.Group(),
    items: new THREE.Group(),
  };
  private sig: Record<string, string> = {};
  private grid: THREE.LineSegments | null = null;
  private gridVisible = false;
  private flames: { mesh: THREE.Mesh; base: number; seed: number }[] = [];
  private lightSources: { pos: THREE.Vector3; spec: LightSpec; seed: number }[] = [];
  private lightPool: THREE.PointLight[] = [];
  private itemBoxes: { uid: number; box: THREE.Box3 }[] = [];
  private obstacleBoxes: { id: string; box: THREE.Box3 }[] = [];
  private wallBoxes: { edge: EdgeKey; box: THREE.Box3 }[] = [];
  private hiddenUid: number | null = null;
  private roofsVisible = false;
  private wallView: WallView = 'cut';

  // Vorschau und Markierungen
  private ghost: THREE.Mesh | null = null;
  private ghostKey = '';
  private ghostMats = {
    ok: new THREE.MeshStandardMaterial({ color: '#a8e08a', transparent: true, opacity: 0.62, emissive: '#4a7a3a', emissiveIntensity: 0.6, flatShading: true, depthWrite: false }),
    bad: new THREE.MeshStandardMaterial({ color: '#e8735a', transparent: true, opacity: 0.62, emissive: '#7a2a1a', emissiveIntensity: 0.6, flatShading: true, depthWrite: false }),
  };
  private marker: THREE.Mesh;
  private previewEdges: THREE.InstancedMesh;
  private previewCells: THREE.InstancedMesh;
  private sectionMarks: THREE.InstancedMesh;

  // Figur
  private rig: CharacterRig | null = null;
  private lookKey = '';
  private charPos = new THREE.Vector2(HALF, HALF);
  private charHeading = 0;
  private charPath: [number, number][] = [];
  /** Kleine Laterne an der Figur, damit man sie nachts sieht. */
  private charLight = new THREE.PointLight('#ffc98a', 0, 7, 1.6);

  // Kamera
  private target = new THREE.Vector3(0, 0, 0);
  private dist = 34;
  private az = Math.PI / 4;
  private azTarget = Math.PI / 4;
  private el = 0.93;
  private quadrant = '';
  /** Anteil der Bildhöhe, um den die Szene nach oben rückt (unten liegt die Bauleiste). */
  viewShift = 0;
  /** Anteil der Bildbreite, um den die Szene nach links rückt (rechts liegt die Bauleiste). */
  viewShiftX = 0;
  /** Ziel der seitlichen Verschiebung: die Ansicht gleitet weich dorthin (Seitenleiste auf/zu). */
  private viewShiftXTarget = 0;
  /** Joystick: Richtung im Bildschirm (x rechts, y unten), Länge 0..1. */
  driveSource: (() => { x: number; y: number }) | null = null;
  /** Kamera folgt der Figur (beim Steuern mit dem Joystick). */
  followCharacter = false;
  /** Nach dem Verschieben der Ansicht folgt die Kamera erst wieder, wenn die Figur gesteuert wird. */
  private followPaused = false;

  /** Für die Oberfläche. */
  onTap: (hit: Hit) => void = () => {};
  /** Beim Aufsetzen eines Fingers: true = Werkzeug zieht (statt Ansicht schieben). */
  toolCapture: ((hit: Hit) => boolean) | null = null;
  onToolMove: (hit: Hit) => void = () => {};
  onToolEnd: (hit: Hit) => void = () => {};
  onToolCancel: () => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.styled = new StyledRenderer(this.renderer, 1.2);
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'base-canvas';
    host.append(this.renderer.domElement);

    this.scene.fog = this.haze;
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    for (const l of Object.values(this.layers)) this.scene.add(l);
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      const pl = new THREE.PointLight('#ffb070', 0, 8, 1.6);
      pl.visible = true;
      this.lightPool.push(pl);
      this.scene.add(pl);
    }

    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffb22e', transparent: true, opacity: 0.38, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 2;
    this.scene.add(this.marker);

    const pmat = () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
    this.previewEdges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pmat(), 4 * PLOT);
    this.previewCells = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pmat(), PLOT * PLOT);
    this.sectionMarks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pmat(), 36);
    for (const m of [this.previewEdges, this.previewCells, this.sectionMarks]) {
      m.count = 0;
      m.renderOrder = 3;
      m.frustumCulled = false;
      this.scene.add(m);
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindPointer();
    this.setPhase('day');
    let last = performance.now();
    this.renderer.setAnimationLoop((t) => {
      const dt = Math.max(0, Math.min(0.1, (t - last) / 1000));
      last = t;
      this.frame(t / 1000, dt);
    });
  }

  // --- Daten ---------------------------------------------------------------------------------

  setData(d: SceneData) {
    this.data = d;
    if (this.envSite !== d.site) {
      if (this.env) {
        this.scene.remove(this.env.group);
        this.env.dispose();
      }
      this.env = buildEnvironment(d.site);
      this.scene.add(this.env.group);
      this.envSite = d.site;
      this.sig = {};
    }
    this.roomAt = findRooms(d.plot).roomAt;
    const sections = [...d.plot.sections].sort().join(';');
    if (this.sig.ground !== sections + d.site) {
      this.sig.ground = sections + d.site;
      this.rebuildGround();
    }
    const obs = d.idx.obstacles.map((o) => o.id).join(';');
    if (this.sig.obstacles !== obs + d.site) {
      this.sig.obstacles = obs + d.site;
      this.rebuildObstacles();
    }
    const floors = JSON.stringify(d.plot.floors);
    if (this.sig.floors !== floors) {
      this.sig.floors = floors;
      this.rebuildFloors();
    }
    if (graphicsStyle() === 'painted') {
      const tufts = sections + obs + floors + d.plot.items.map((i) => `${i.kind}${i.x},${i.y},${i.rot}`).join(';');
      if (this.sig.tufts !== tufts) {
        this.sig.tufts = tufts;
        this.rebuildTufts();
      }
    }
    this.rebuildWalls();
    this.rebuildRoofs();
    this.rebuildItems();
    this.ensureCharacterPlaced();
  }

  setLook(look: Character['look']) {
    const key = `${look.hair}|${look.color}|${look.skin}`;
    if (key === this.lookKey) return;
    this.lookKey = key;
    if (this.rig) {
      this.scene.remove(this.rig.root);
      this.rig.dispose();
    }
    this.rig = new CharacterRig(look);
    this.scene.add(this.rig.root);
    this.charLight.position.set(0.25, 1.5, 0.3);
    this.rig.root.add(this.charLight);
  }

  setRoofsVisible(v: boolean) {
    this.roofsVisible = v;
    this.rebuildWalls();
    this.rebuildRoofs();
  }

  setWallView(v: WallView) {
    this.wallView = v;
    this.rebuildWalls();
  }

  setGridVisible(v: boolean) {
    this.gridVisible = v;
    if (this.grid) this.grid.visible = v;
  }

  /** Ein Möbelstück ausblenden (während es verschoben wird). */
  setHiddenItem(uid: number | null) {
    if (this.hiddenUid === uid) return;
    this.hiddenUid = uid;
    this.rebuildItems();
  }

  private clearLayer(l: THREE.Object3D) {
    for (const c of [...l.children]) {
      l.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry && !(m as unknown as { keepGeo?: boolean }).keepGeo) m.geometry.dispose();
      });
    }
  }

  private addMeshes(layer: THREE.Object3D, lit: Assembler, glow: Assembler, shadows = true) {
    const a = lit.mesh(LIT, shadows);
    if (a) layer.add(a);
    const b = glow.mesh(GLOW, false);
    if (b) layer.add(b);
  }

  // --- Boden und Bewuchs -----------------------------------------------------------------

  private rebuildGround() {
    const d = this.data!;
    this.clearLayer(this.layers.ground);
    this.clearLayer(this.layers.growth);
    const pal = PLOT_GROUND[d.site];
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const wild = new THREE.Color('#3a4426');
    // Gemalt: keine Kacheln, der Boden bekommt seine Struktur im Shader
    const painted = graphicsStyle() === 'painted';
    const avg = new THREE.Color(0, 0, 0);
    for (const s of pal) avg.add(new THREE.Color(s));
    avg.multiplyScalar(1 / pal.length);
    for (let y = 0; y < PLOT; y++)
      for (let x = 0; x < PLOT; x++) {
        const open = d.idx.unlocked[cellIndex(x, y)] === 1;
        const h = hash(`${x},${y}`);
        if (painted) c.copy(avg);
        else c.set(pal[h % pal.length]);
        if (!open) c.lerp(wild, 0.55).multiplyScalar(0.8);
        // Jedes Feld in 2 × 2 Stücke mit je zwei Dreiecken, leicht unterschiedlich getönt
        const x0 = W(x);
        const z0 = W(y);
        for (let q = 0; q < 4; q++) {
          const qx = x0 + (q % 2) * 0.5;
          const qz = z0 + Math.floor(q / 2) * 0.5;
          const tris = [
            [qx, qz, qx, qz + 0.5, qx + 0.5, qz],
            [qx + 0.5, qz, qx, qz + 0.5, qx + 0.5, qz + 0.5],
          ];
          tris.forEach((t, k) => {
            const f = painted ? 1 : 0.97 + (((h >> (q * 2 + k)) & 3) / 3) * 0.06;
            for (let i = 0; i < 6; i += 2) {
              pos.push(t[i], 0, t[i + 1]);
              col.push(c.r * f, c.g * f, c.b * f);
            }
          });
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('pat', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(PAT.ground), 1));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, LIT);
    ground.receiveShadow = true;
    this.layers.ground.add(ground);

    // Bewuchs auf noch nicht zurückeroberten Abschnitten
    const locked: [number, number][] = [];
    for (let sy = 0; sy < PLOT / SECTION; sy++)
      for (let sx = 0; sx < PLOT / SECTION; sx++) if (!d.plot.sections.includes(`${sx},${sy}`)) locked.push([sx, sy]);
    // Dichte pro Quadratmeter wie früher bei 6-m-Abschnitten
    const area = (SECTION / 6) ** 2;
    const perBush = Math.round(15 * area);
    const perGrass = Math.round(16 * area);
    const perJunk = Math.round((d.site === 'depot' || d.site === 'fuel' ? 6 : 3) * area);
    const mk = (geo: THREE.BufferGeometry, n: number, pat: number) => {
      const m = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 });
      m.userData.pat = pat;
      return new THREE.InstancedMesh(geo, m, Math.max(1, locked.length * n));
    };
    const bushes = mk(new THREE.IcosahedronGeometry(1, 1), perBush, PAT.leaf);
    const grass = mk(new THREE.ConeGeometry(0.12, 1, 5), perGrass, PAT.leaf);
    const junk = mk(new THREE.BoxGeometry(1, 1, 1), perJunk, PAT.stone);
    const greens = ['#3f5a34', '#4f6b3a', '#5d6b3a', '#46603a', '#6b6a3a', '#56603a'].map((s) => new THREE.Color(s));
    const dry = ['#7a7a44', '#8a8450', '#6b6a3a', '#8f8a5a'].map((s) => new THREE.Color(s));
    const urban = d.site === 'depot' || d.site === 'fuel';
    const junkC = (urban ? ['#6a6357', '#5a5246', '#7a5a3a', '#4a443c', '#6e5a48'] : ['#6e6a62', '#7a766e', '#5a4632', '#625e56']).map((s) => new THREE.Color(s));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let bi = 0;
    let gi = 0;
    let ji = 0;
    for (const [sx, sy] of locked) {
      let s = hash(`${d.site}${sx},${sy}`) % 233280 || 7;
      const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < perBush; i++) {
        const x = W(sx * SECTION + 0.3 + r() * (SECTION - 0.6));
        const z = W(sy * SECTION + 0.3 + r() * (SECTION - 0.6));
        const sc = 0.28 + r() * 0.42;
        e.set(r() * 3, r() * 3, r() * 3);
        m.compose(new THREE.Vector3(x, sc * 0.5, z), q.setFromEuler(e), new THREE.Vector3(sc, sc * (0.7 + r() * 0.5), sc));
        bushes.setMatrixAt(bi, m);
        bushes.setColorAt(bi++, greens[Math.floor(r() * greens.length)]);
      }
      for (let i = 0; i < perGrass; i++) {
        const x = W(sx * SECTION + r() * SECTION);
        const z = W(sy * SECTION + r() * SECTION);
        const hgt = 0.5 + r() * 0.8;
        e.set((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
        m.compose(new THREE.Vector3(x, hgt / 2, z), q.setFromEuler(e), new THREE.Vector3(1, hgt, 1));
        grass.setMatrixAt(gi, m);
        grass.setColorAt(gi++, dry[Math.floor(r() * dry.length)]);
      }
      for (let i = 0; i < perJunk; i++) {
        const x = W(sx * SECTION + 0.5 + r() * (SECTION - 1));
        const z = W(sy * SECTION + 0.5 + r() * (SECTION - 1));
        const w = 0.3 + r() * 0.8;
        const hgt = 0.15 + r() * 0.35;
        e.set((r() - 0.5) * 0.3, r() * 3, (r() - 0.5) * 0.3);
        m.compose(new THREE.Vector3(x, hgt / 2, z), q.setFromEuler(e), new THREE.Vector3(w, hgt, 0.3 + r() * 0.6));
        junk.setMatrixAt(ji, m);
        junk.setColorAt(ji++, junkC[Math.floor(r() * junkC.length)]);
      }
    }
    bushes.count = bi;
    grass.count = gi;
    junk.count = ji;
    for (const im of [bushes, grass, junk]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.layers.growth.add(im);
    }

    // Raster (nur auf freiem Gelände), wird beim Bauen eingeblendet
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
    }
    const lines: number[] = [];
    const y = 0.04;
    for (let cy = 0; cy < PLOT; cy++)
      for (let cx = 0; cx < PLOT; cx++) {
        if (d.idx.unlocked[cellIndex(cx, cy)] !== 1) continue;
        lines.push(W(cx), y, W(cy), W(cx + 1), y, W(cy));
        lines.push(W(cx), y, W(cy), W(cx), y, W(cy + 1));
        if (cx === PLOT - 1 || d.idx.unlocked[cellIndex(cx + 1, cy)] !== 1) lines.push(W(cx + 1), y, W(cy), W(cx + 1), y, W(cy + 1));
        if (cy === PLOT - 1 || d.idx.unlocked[cellIndex(cx, cy + 1)] !== 1) lines.push(W(cx), y, W(cy + 1), W(cx + 1), y, W(cy + 1));
      }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#f3e3b8', transparent: true, opacity: 0.22, depthWrite: false }));
    this.grid.visible = this.gridVisible;
    this.grid.renderOrder = 1;
    this.scene.add(this.grid);
  }

  // --- Hindernisse, Böden, Wände, Dächer, Möbel --------------------------------------------

  private rebuildObstacles() {
    const d = this.data!;
    this.clearLayer(this.layers.obstacles);
    this.obstacleBoxes = [];
    const lit = new Assembler();
    const glow = new Assembler();
    for (const o of d.idx.obstacles) {
      const variant = hash(o.id) % 4;
      const t = this.cache.get(`o:${o.kind}:${d.site}:${variant}`, () => buildObstacle(o.kind, d.site, variant));
      const turned = o.w !== OBSTACLES[o.kind].w;
      const ry = (turned ? Math.PI / 2 : 0) + (o.w === o.d ? (variant % 4) * (Math.PI / 2) : 0);
      const mm = placeMatrix(W(o.x + o.w / 2), 0, W(o.y + o.d / 2), ry);
      lit.add(t.lit, mm);
      glow.add(t.glow, mm);
      this.obstacleBoxes.push({ id: o.id, box: t.box.clone().applyMatrix4(mm) });
    }
    this.addMeshes(this.layers.obstacles, lit, glow);
  }

  /** Stil „Gemalt“: Grasbüschel und ein paar Blüten auf freiem Boden, dichter in den Grasflecken. */
  private rebuildTufts() {
    const d = this.data!;
    this.clearLayer(this.layers.tufts);
    const blocked = new Uint8Array(PLOT * PLOT);
    const block = (x: number, y: number, w: number, h: number) => {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < PLOT && y + dy < PLOT) blocked[cellIndex(x + dx, y + dy)] = 1;
    };
    for (const k of Object.keys(d.plot.floors)) {
      const [x, y] = k.split(',').map(Number);
      block(x, y, 1, 1);
    }
    for (const o of d.idx.obstacles) block(o.x, o.y, o.w, o.d);
    for (const it of d.plot.items) {
      const f = footprint(it.kind, it.rot);
      block(it.x, it.y, f.w, f.d);
    }
    const spots: { x: number; z: number; s: number; flower: number }[] = [];
    for (let y = 0; y < PLOT; y++)
      for (let x = 0; x < PLOT; x++) {
        const ci = cellIndex(x, y);
        if (d.idx.unlocked[ci] !== 1 || blocked[ci]) continue;
        const h = hash(`t${x},${y}`);
        const g = grassiness(W(x + 0.5), W(y + 0.5));
        const n = g > 0.7 ? 3 : g > 0.45 ? 1 : 0;
        for (let i = 0; i < n; i++) {
          const r1 = ((h >>> (i * 4)) & 15) / 15;
          const r2 = ((h >>> (i * 4 + 2)) & 15) / 15;
          spots.push({ x: W(x + 0.1 + r1 * 0.8), z: W(y + 0.1 + r2 * 0.8), s: 0.08 + ((h >>> (i + 3)) & 7) * 0.01, flower: (h >>> (i * 3 + 7)) % 9 });
        }
      }
    if (!spots.length) return;
    const leaf = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 });
    leaf.userData.pat = PAT.leaf;
    const tufts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaf, spots.length);
    const flowers = spots.filter((p) => p.flower < 2);
    const bloom = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
    const blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), bloom, Math.max(1, flowers.length));
    const greens = ['#3a5226', '#44602a', '#4e6a2c', '#3f5a24'].map((c) => new THREE.Color(c));
    const petals = ['#e8d36a', '#ece6da', '#c9a6e0'].map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, p.s * 0.2, p.z), q, new THREE.Vector3(p.s * 1.4, p.s * 0.6, p.s * 1.4));
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, greens[i % greens.length]);
    });
    flowers.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x + p.s * 0.4, p.s * 0.6, p.z), q, new THREE.Vector3(0.045, 0.035, 0.045));
      blooms.setMatrixAt(i, m);
      blooms.setColorAt(i, petals[i % petals.length]);
    });
    blooms.count = flowers.length;
    for (const im of [tufts, blooms]) {
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.layers.tufts.add(im);
    }
  }

  private rebuildFloors() {
    const d = this.data!;
    this.clearLayer(this.layers.floors);
    const lit = new Assembler();
    for (const [key, piece] of Object.entries(d.plot.floors)) {
      const [x, y] = key.split(',').map(Number);
      const variant = hash(key) % 3;
      const t = this.cache.get(`fl:${piece}:${variant}`, () => buildFloor(piece, variant));
      lit.add(t.lit, placeMatrix(W(x + 0.5), 0, W(y + 0.5)));
    }
    const mesh = lit.mesh(LIT, false);
    if (mesh) this.layers.floors.add(mesh);
  }

  private indoor(x: number, y: number): boolean {
    if (!inPlot(x, y) || !this.data) return false;
    const k = cellKey(x, y);
    return this.roomAt[cellIndex(x, y)] >= 0 || !!this.data.plot.floors[k] || !!this.data.plot.roofs[k];
  }

  /** Wird diese Wand gerade abgesenkt? */
  private isCut(e: EdgeKey): boolean {
    if (this.roofsVisible || this.wallView === 'full') return false;
    if (this.wallView === 'low') return true;
    const { o, x, y } = parseEdge(e);
    const sx = Math.sin(this.azTarget);
    const sz = Math.cos(this.azTarget);
    if (o === 'h') {
      if (sz > 0.2) return this.indoor(x, y - 1);
      if (sz < -0.2) return this.indoor(x, y);
      return false;
    }
    if (sx > 0.2) return this.indoor(x - 1, y);
    if (sx < -0.2) return this.indoor(x, y);
    return false;
  }

  private rebuildWalls() {
    const d = this.data;
    if (!d) return;
    this.clearLayer(this.layers.walls);
    this.wallBoxes = [];
    const lit = new Assembler();
    const glow = new Assembler();
    for (const [e, w] of Object.entries(d.plot.walls)) {
      const fence = PIECES[w.k].group === 'fence';
      const cut = !fence && this.isCut(e);
      const h = cut ? CUT_H : WALL_H;
      const variant = hash(e) % 3;
      const t = this.cache.get(`w:${w.k}:${w.o ?? ''}:${cut ? 1 : 0}:${variant}`, () => buildWall(w.k, w.o, h, variant));
      const p = edgeWorld(e);
      const mm = placeMatrix(p.x, 0, p.z, p.ry);
      lit.add(t.lit, mm);
      glow.add(t.glow, mm);
      const hb = fence ? 1.7 : h;
      const box = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.12), new THREE.Vector3(0.5, hb, 0.12)).applyMatrix4(mm);
      this.wallBoxes.push({ edge: e, box });
    }
    this.addMeshes(this.layers.walls, lit, glow);
  }

  private rebuildRoofs() {
    const d = this.data;
    if (!d) return;
    this.clearLayer(this.layers.roofs);
    if (!this.roofsVisible) return;
    const lit = new Assembler();
    const trim = this.cache.get('roofTrim', () => buildRoofTrim());
    for (const [key, piece] of Object.entries(d.plot.roofs)) {
      const [x, y] = key.split(',').map(Number);
      const variant = hash(key) % 3;
      const t = this.cache.get(`r:${piece}:${variant}`, () => buildRoof(piece, variant));
      lit.add(t.lit, placeMatrix(W(x + 0.5), 0, W(y + 0.5)));
      const sides: [number, number, number][] = [
        [0, -1, 0],
        [1, 0, -Math.PI / 2],
        [0, 1, Math.PI],
        [-1, 0, Math.PI / 2],
      ];
      for (const [dx, dy, ry] of sides) if (!d.plot.roofs[cellKey(x + dx, y + dy)]) lit.add(trim.lit, placeMatrix(W(x + 0.5), 0, W(y + 0.5), ry));
    }
    const mesh = lit.mesh(LIT);
    if (mesh) this.layers.roofs.add(mesh);
  }

  private furnitureTemplate(kind: FurnitureId): Template {
    return this.cache.get(`f:${kind}`, () => {
      const m = buildFurniture(kind);
      this.lightSpecs.set(kind, m.light);
      return m.group;
    });
  }

  private itemMatrix(kind: FurnitureId, x: number, y: number, rot: number): THREE.Matrix4 {
    const f = footprint(kind, rot);
    return placeMatrix(W(x + f.w / 2), 0.012, W(y + f.d / 2), -rot * (Math.PI / 2));
  }

  private rebuildItems() {
    const d = this.data;
    if (!d) return;
    this.clearLayer(this.layers.items);
    this.itemBoxes = [];
    this.flames = [];
    this.lightSources = [];
    const lit = new Assembler();
    const glow = new Assembler();
    for (const it of d.plot.items) {
      if (it.uid === this.hiddenUid) continue;
      const t = this.furnitureTemplate(it.kind);
      const mm = this.itemMatrix(it.kind, it.x, it.y, it.rot);
      lit.add(t.lit, mm);
      glow.add(t.glow, mm);
      this.itemBoxes.push({ uid: it.uid, box: t.box.clone().applyMatrix4(mm) });
      for (const f of t.flames) {
        const mesh = new THREE.Mesh(f.geo, f.mat);
        (mesh as unknown as { keepGeo: boolean }).keepGeo = true;
        new THREE.Matrix4().multiplyMatrices(mm, f.matrix).decompose(mesh.position, mesh.quaternion, mesh.scale);
        this.flames.push({ mesh, base: mesh.scale.y, seed: it.uid * 7 + this.flames.length });
        this.layers.items.add(mesh);
      }
      const spec = this.lightSpecs.get(it.kind);
      if (spec) {
        const pos = new THREE.Vector3(0, spec.y, 0).applyMatrix4(mm);
        this.lightSources.push({ pos, spec, seed: it.uid });
      }
    }
    this.addMeshes(this.layers.items, lit, glow);
  }

  // --- Licht ---------------------------------------------------------------------------------

  setPhase(phase: DayPhase) {
    this.phase = phase;
    this.host.dataset.phase = phase;
    this.applyAtmosphere();
  }

  /** Echtes Wetter auch zu Hause: Regen, Schnee, Nebel, Gewitter. */
  setWeather(w: WeatherKind) {
    this.weather = w;
    this.host.dataset.weather = w;
    if (this.precip) {
      this.scene.remove(this.precip.obj);
      this.precip.obj.geometry.dispose();
      this.precip = null;
    }
    if (w === 'rain' || w === 'storm' || w === 'snow') {
      const snow = w === 'snow';
      const n = snow ? 1400 : w === 'storm' ? 2600 : 1800;
      const len = snow ? 0 : 0.55;
      const pos = new Float32Array(n * (snow ? 3 : 6));
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 60;
        const y = Math.random() * 30;
        const z = (Math.random() - 0.5) * 60;
        if (snow) pos.set([x, y, z], i * 3);
        else pos.set([x, y, z, x + 0.08, y + len, z], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const obj = snow
        ? new THREE.Points(g, new THREE.PointsMaterial({ color: '#f4f6fa', size: 0.13, transparent: true, opacity: 0.9, depthWrite: false }))
        : new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b8c8d8', transparent: true, opacity: 0.45, depthWrite: false }));
      obj.frustumCulled = false;
      this.scene.add(obj);
      this.precip = { obj, pos, speed: snow ? 1.6 : w === 'storm' ? 19 : 14, drift: snow ? 0.6 : w === 'storm' ? 3 : 1.2, len };
    }
    this.applyAtmosphere();
  }

  private applyAtmosphere() {
    const p = graphicsStyle() === 'painted' ? { ...PHASES[this.phase], ...PAINTED_PHASES[this.phase] } : PHASES[this.phase];
    const w = this.weather;
    const sunF = { clear: 1, cloudy: 0.55, fog: 0.4, rain: 0.35, snow: 0.6, storm: 0.25 }[w];
    const hemiF = { clear: 1, cloudy: 0.95, fog: 1, rain: 0.85, snow: 1.08, storm: 0.75 }[w];
    this.hemi.color.set(p.hemi[0]);
    this.hemi.groundColor.set(p.hemi[1]);
    this.hemi.intensity = p.hemi[2] * hemiF;
    this.sun.color.set(p.sun[0]);
    this.sun.intensity = p.sun[1] * sunF;
    this.sunDir.set(...p.sun[2]).normalize();
    this.renderer.toneMappingExposure = p.exposure;
    this.charLight.intensity = this.phase === 'night' ? 3.2 : this.phase === 'dusk' ? 1.2 : 0;
    this.haze.color.set(w === 'fog' ? (this.phase === 'night' ? '#23262c' : '#7d7a72') : w === 'snow' && this.phase !== 'night' ? '#8a8c90' : p.haze);
  }

  private updateWeather(dt: number) {
    const pr = this.precip;
    if (pr) {
      const a = pr.pos;
      const stride = pr.len ? 6 : 3;
      const cx = this.target.x;
      const cz = this.target.z;
      for (let i = 0; i < a.length; i += stride) {
        a[i + 1] -= pr.speed * dt;
        a[i] += pr.drift * dt * (pr.len ? 1 : Math.sin(a[i + 1] * 0.7 + i));
        if (a[i + 1] < 0) {
          a[i + 1] += 30;
          a[i] = cx + (Math.random() - 0.5) * 60;
          a[i + 2] = cz + (Math.random() - 0.5) * 60;
        }
        if (pr.len) {
          a[i + 3] = a[i] + 0.06 * pr.drift;
          a[i + 4] = a[i + 1] + pr.len;
          a[i + 5] = a[i + 2];
        }
      }
      pr.obj.geometry.attributes.position.needsUpdate = true;
    }
    // Gewitter: ab und zu ein Blitz
    if (this.weather === 'storm') {
      if (this.flash <= 0 && Math.random() < dt * 0.12) this.flash = 0.35;
      if (this.flash > 0) {
        this.flash -= dt;
        const k = this.flash > 0.2 || (this.flash > 0.05 && this.flash < 0.12) ? 1 : 0;
        this.hemi.intensity = PHASES[this.phase].hemi[2] * 0.75 + k * 2.2;
      }
    }
  }

  private updateLights(t: number) {
    const p = PHASES[this.phase];
    const sorted = this.lightSources
      .map((l) => ({ l, d: l.pos.distanceToSquared(this.target) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_POINT_LIGHTS);
    this.lightPool.forEach((pl, i) => {
      const s = sorted[i]?.l;
      if (!s) {
        pl.intensity = 0;
        return;
      }
      const f = s.spec.flicker ? p.fire : p.lamp;
      pl.position.copy(s.pos);
      pl.color.set(s.spec.color);
      pl.distance = s.spec.distance;
      pl.intensity = s.spec.intensity * f * (s.spec.flicker ? 0.82 + 0.18 * Math.sin(t * 11 + s.seed) * Math.sin(t * 27) : 1);
    });
    for (const fl of this.flames) fl.mesh.scale.y = fl.base * (0.85 + 0.25 * Math.abs(Math.sin(t * 8 + fl.seed)));
  }

  // --- Vorschau ------------------------------------------------------------------------------

  /** Möbelstück als Geist (grün = passt, rot = geht nicht). */
  showGhost(kind: FurnitureId, x: number, y: number, rot: number, valid: boolean) {
    const key = kind;
    if (this.ghostKey !== key) {
      this.hideGhost();
      const t = this.furnitureTemplate(kind);
      const a = new Assembler();
      a.add(t.lit, new THREE.Matrix4());
      a.add(t.glow, new THREE.Matrix4());
      for (const f of t.flames) {
        const g = f.geo.index ? f.geo.toNonIndexed() : f.geo;
        const pos = (g.getAttribute('position').array as Float32Array).slice();
        const nrm = new Float32Array(pos.length);
        for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
        a.add({ pos, col: new Float32Array(pos.length).fill(1), nrm, pat: new Float32Array(pos.length / 3) }, f.matrix);
      }
      this.ghost = new THREE.Mesh(a.geometry(), this.ghostMats.ok);
      this.ghost.renderOrder = 4;
      this.ghostKey = key;
      this.scene.add(this.ghost);
    }
    const g = this.ghost!;
    g.material = valid ? this.ghostMats.ok : this.ghostMats.bad;
    this.itemMatrix(kind, x, y, rot).decompose(g.position, g.quaternion, g.scale);
    const f = footprint(kind, rot);
    this.mark(x, y, f.w, f.d, valid ? '#a8e08a' : '#e8735a');
  }

  hideGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.geometry.dispose();
    }
    this.ghost = null;
    this.ghostKey = '';
    this.marker.visible = false;
  }

  /** Rechteck auf dem Boden markieren (Felder). */
  mark(x: number, y: number, w: number, d: number, color = '#ffb22e') {
    this.marker.scale.set(w, d, 1);
    this.marker.position.set(W(x + w / 2), 0.05, W(y + d / 2));
    (this.marker.material as THREE.MeshBasicMaterial).color.set(color);
    this.marker.visible = true;
  }

  unmark() {
    this.marker.visible = false;
  }

  /** Kanten hervorheben (Wände planen, Türen setzen, abreißen). */
  showEdges(list: { edge: EdgeKey; color: string; h?: number }[]) {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const { edge, color, h } of list) {
      if (n >= this.previewEdges.instanceMatrix.count) break;
      const p = edgeWorld(edge);
      const hh = h ?? WALL_H;
      m.compose(new THREE.Vector3(p.x, hh / 2, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)), new THREE.Vector3(1.02, hh, 0.22));
      this.previewEdges.setMatrixAt(n, m);
      this.previewEdges.setColorAt(n++, c.set(color));
    }
    this.previewEdges.count = n;
    this.previewEdges.instanceMatrix.needsUpdate = true;
    if (this.previewEdges.instanceColor) this.previewEdges.instanceColor.needsUpdate = true;
  }

  /** Felder hervorheben (Böden, Dächer). y = Höhe der Platte. */
  showCells(list: { x: number; y: number; color: string }[], height = 0.06) {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const { x, y, color } of list) {
      m.compose(new THREE.Vector3(W(x + 0.5), height, W(y + 0.5)), new THREE.Quaternion(), new THREE.Vector3(0.94, 0.06, 0.94));
      this.previewCells.setMatrixAt(n, m);
      this.previewCells.setColorAt(n++, c.set(color));
    }
    this.previewCells.count = n;
    this.previewCells.instanceMatrix.needsUpdate = true;
    if (this.previewCells.instanceColor) this.previewCells.instanceColor.needsUpdate = true;
  }

  /** Abschnitte markieren (Gelände zurückerobern). */
  showSections(list: { sx: number; sy: number; color: string }[]) {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const { sx, sy, color } of list) {
      m.compose(new THREE.Vector3(W(sx * SECTION + SECTION / 2), 1.5, W(sy * SECTION + SECTION / 2)), new THREE.Quaternion(), new THREE.Vector3(SECTION - 0.2, 0.08, SECTION - 0.2));
      this.sectionMarks.setMatrixAt(n, m);
      this.sectionMarks.setColorAt(n++, c.set(color));
    }
    this.sectionMarks.count = n;
    this.sectionMarks.instanceMatrix.needsUpdate = true;
    if (this.sectionMarks.instanceColor) this.sectionMarks.instanceColor.needsUpdate = true;
  }

  clearPreview() {
    this.previewEdges.count = 0;
    this.previewCells.count = 0;
  }

  // --- Figur ---------------------------------------------------------------------------------

  private ensureCharacterPlaced() {
    const d = this.data;
    if (!d || !this.rig) return;
    const cx = Math.floor(this.charPos.x);
    const cy = Math.floor(this.charPos.y);
    if (walkable(d.idx, cx, cy)) return;
    const spot = nearestWalkable(d.idx, cx, cy) ?? nearestWalkable(d.idx, HALF, HALF);
    if (!spot) return;
    this.charPos.set(spot[0] + 0.5, spot[1] + 0.5);
    this.charPath = [];
  }

  /** Figur zu einem Feld laufen lassen. false = kein Weg dorthin. */
  walkTo(x: number, y: number): boolean {
    const d = this.data;
    if (!d || !this.rig) return false;
    const from: [number, number] = [Math.floor(this.charPos.x), Math.floor(this.charPos.y)];
    const path = findPath(d.idx, d.plot, from, [x, y]);
    if (!path) return false;
    this.charPath = path.slice(1);
    return true;
  }

  wave() {
    this.rig?.wave();
  }

  /** Wo steht die Figur (Feld)? */
  characterCell(): { x: number; y: number } {
    return { x: Math.floor(this.charPos.x), y: Math.floor(this.charPos.y) };
  }

  /** Was liegt direkt vor der Figur? (für die Benutzen-Taste) */
  findInteract(): { kind: 'obstacle'; id: string } | { kind: 'item'; uid: number } | null {
    const d = this.data;
    if (!d) return null;
    const px = this.charPos.x;
    const py = this.charPos.y;
    const fx = Math.sin(this.charHeading);
    const fy = Math.cos(this.charHeading);
    let best: { kind: 'obstacle'; id: string } | { kind: 'item'; uid: number } | null = null;
    let bestScore = Infinity;
    const consider = (x: number, y: number, w: number, dd: number, hit: typeof best) => {
      const cx = Math.max(x, Math.min(px, x + w));
      const cy = Math.max(y, Math.min(py, y + dd));
      const dist = Math.hypot(cx - px, cy - py);
      if (dist > 1.4) return;
      const dot = dist > 0.01 ? ((cx - px) * fx + (cy - py) * fy) / dist : 1;
      const score = dist - dot * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = hit;
      }
    };
    for (const o of d.idx.obstacles) consider(o.x, o.y, o.w, o.d, { kind: 'obstacle', id: o.id });
    for (const it of d.plot.items) {
      const f = footprint(it.kind, it.rot);
      consider(it.x, it.y, f.w, f.d, { kind: 'item', uid: it.uid });
    }
    return best;
  }

  /** Steuern mit dem Joystick: freie Bewegung mit Kollision an Wänden und Möbeln. */
  private updateDrive(dt: number): number {
    const v = this.driveSource?.();
    const d = this.data;
    if (!v || !d || (v.x === 0 && v.y === 0)) return 0;
    this.charPath = [];
    // Wer den Joystick bewegt, will der Figur wieder folgen
    this.followPaused = false;
    const fx = -Math.sin(this.az);
    const fz = -Math.cos(this.az);
    const rx = Math.cos(this.az);
    const rz = -Math.sin(this.az);
    const mx = rx * v.x - fx * v.y;
    const mz = rz * v.x - fz * v.y;
    const len = Math.hypot(v.x, v.y);
    const speed = 2.8 * len;
    const step = (dx: number, dy: number) => {
      const nx = this.charPos.x + dx;
      const ny = this.charPos.y + dy;
      const r = 0.24;
      const cx = Math.floor(this.charPos.x);
      const cy = Math.floor(this.charPos.y);
      const tx = Math.floor(nx + Math.sign(dx) * r);
      const ty = Math.floor(ny + Math.sign(dy) * r);
      if (tx !== cx || ty !== cy) {
        if (!walkable(d.idx, tx, ty)) return;
        const w = tx !== cx ? d.plot.walls[`v${Math.max(cx, tx)},${cy}`] : d.plot.walls[`h${cx},${Math.max(cy, ty)}`];
        if (w && w.o !== 'door' && w.o !== 'arch' && w.o !== 'gate') return;
      }
      this.charPos.set(nx, ny);
    };
    const n = Math.hypot(mx, mz) || 1;
    step(((mx / n) * speed * dt), 0);
    step(0, (mz / n) * speed * dt);
    const want = Math.atan2(mx, mz);
    let diff = want - this.charHeading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.charHeading += diff * Math.min(1, dt * 12);
    // Gangart passend zum Tempo (1 = gehen mit 1,7 m/s)
    return Math.max(0.5, speed / 1.7);
  }

  private updateCharacter(t: number, dt: number) {
    if (!this.rig) return;
    let moving = this.updateDrive(dt);
    if (this.charPath.length) {
      const [nx, ny] = this.charPath[0];
      const tx = nx + 0.5;
      const ty = ny + 0.5;
      const dx = tx - this.charPos.x;
      const dy = ty - this.charPos.y;
      const dist = Math.hypot(dx, dy);
      const step = 1.7 * dt;
      if (dist <= step) {
        this.charPos.set(tx, ty);
        this.charPath.shift();
      } else {
        this.charPos.x += (dx / dist) * step;
        this.charPos.y += (dy / dist) * step;
      }
      if (dist > 0.01) {
        const want = Math.atan2(dx, dy);
        let diff = want - this.charHeading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.charHeading += diff * Math.min(1, dt * 10);
      }
      moving = 1;
    }
    this.rig.update(t, dt, moving);
    const floorY = this.data?.plot.floors[cellKey(Math.floor(this.charPos.x), Math.floor(this.charPos.y))] ? 0.025 : 0;
    this.rig.root.position.set(W(this.charPos.x), floorY, W(this.charPos.y));
    this.rig.root.rotation.y = this.charHeading;
  }

  // --- Kamera --------------------------------------------------------------------------------

  /** Um 90° drehen (nur auf Wunsch, per Knopf). */
  rotateStep(dir: 1 | -1) {
    this.azTarget += dir * (Math.PI / 2);
  }

  zoomBy(f: number) {
    this.dist = Math.min(140, Math.max(8, this.dist * f));
  }

  /** Kamera auf einen Punkt (Gelände-Meter) richten. */
  focus(x: number, y: number, dist?: number) {
    this.target.set(W(x), 0, W(y));
    if (dist) this.dist = dist;
  }

  /** Ganzes freies Gelände ins Bild. */
  fitPlot() {
    const d = this.data;
    if (!d) return;
    let minX = PLOT;
    let minY = PLOT;
    let maxX = 0;
    let maxY = 0;
    for (const s of d.plot.sections) {
      const [sx, sy] = s.split(',').map(Number);
      minX = Math.min(minX, sx * SECTION);
      minY = Math.min(minY, sy * SECTION);
      maxX = Math.max(maxX, (sx + 1) * SECTION);
      maxY = Math.max(maxY, (sy + 1) * SECTION);
    }
    const size = Math.max(maxX - minX, maxY - minY);
    // Hochkant passt in der Breite wenig hinein: so weit weg, dass die Diagonale ins Bild passt
    const vfov = (this.camera.fov * Math.PI) / 180;
    const tanH = Math.tan(vfov / 2) * this.camera.aspect;
    const needW = size * 1.25;
    const distW = needW / (2 * tanH);
    const distV = (size * 1.3 * Math.sin(this.el)) / (2 * Math.tan(vfov / 2));
    this.focus((minX + maxX) / 2, (minY + maxY) / 2, Math.min(130, Math.max(12, distW, distV)));
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, w * this.viewShiftX, h * this.viewShift, w, h);
    this.camera.updateProjectionMatrix();
  }

  setViewShift(f: number, fx = this.viewShiftXTarget) {
    if (f === this.viewShift && fx === this.viewShiftXTarget) return;
    const jump = f !== this.viewShift;
    this.viewShift = f;
    this.viewShiftXTarget = fx;
    if (jump) {
      this.viewShiftX = fx;
      this.resize();
    }
  }

  private updateCamera(dt: number) {
    this.az += (this.azTarget - this.az) * Math.min(1, dt * 7);
    if (this.followCharacter && !this.followPaused && this.rig) {
      const k = Math.min(1, dt * 4);
      this.target.x += (W(this.charPos.x) - this.target.x) * k;
      this.target.z += (W(this.charPos.y) - this.target.z) * k;
    }
    const lim = HALF + 8;
    this.target.x = Math.max(-lim, Math.min(lim, this.target.x));
    this.target.z = Math.max(-lim, Math.min(lim, this.target.z));
    const r = this.dist;
    this.camera.position.set(
      this.target.x + Math.sin(this.az) * Math.cos(this.el) * r,
      this.target.y + Math.sin(this.el) * r,
      this.target.z + Math.cos(this.az) * Math.cos(this.el) * r,
    );
    this.camera.lookAt(this.target);
    if (this.weather === 'fog') {
      this.haze.near = r * 0.55;
      this.haze.far = r + 22;
    } else if (this.weather === 'snow' || this.weather === 'rain' || this.weather === 'storm') {
      this.haze.near = r + 4;
      this.haze.far = r + 55;
    } else {
      this.haze.near = r + 15;
      this.haze.far = r + 90;
    }
    // Schatten folgen dem Blick
    const ext = Math.min(46, Math.max(12, r * 0.62));
    const sc = this.sun.shadow.camera;
    if (sc.right !== ext) {
      sc.left = sc.bottom = -ext;
      sc.right = sc.top = ext;
      sc.near = 1;
      sc.far = 140;
      sc.updateProjectionMatrix();
    }
    this.sun.position.copy(this.target).addScaledVector(this.sunDir, 60);
    this.sun.target.position.copy(this.target);
    // Wände neu absenken, wenn sich die Blickrichtung geändert hat
    const quad = `${Math.round(Math.sin(this.azTarget) * 2)},${Math.round(Math.cos(this.azTarget) * 2)}`;
    if (quad !== this.quadrant) {
      this.quadrant = quad;
      this.rebuildWalls();
    }
  }

  /** Bildschirmposition eines Punkts auf dem Gelände (für Tests und Hinweise). */
  projectPoint(x: number, y: number, height = 0): { x: number; y: number } {
    const v = new THREE.Vector3(W(x), height, W(y)).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // --- Eingabe -------------------------------------------------------------------------------

  private toNdc(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }

  private groundAt(cx: number, cy: number, height = 0): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.toNdc(cx, cy), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), p) ? p : null;
  }

  pick(cx: number, cy: number): Hit {
    this.raycaster.setFromCamera(this.toNdc(cx, cy), this.camera);
    const ray = this.raycaster.ray;
    const tmp = new THREE.Vector3();
    let best = Infinity;
    let item: number | null = null;
    let obstacle: string | null = null;
    let wall: EdgeKey | null = null;
    let character = false;
    for (const b of this.itemBoxes)
      if (ray.intersectBox(b.box, tmp)) {
        const d = tmp.distanceTo(ray.origin);
        if (d < best) [best, item, obstacle, wall] = [d, b.uid, null, null];
      }
    for (const b of this.obstacleBoxes)
      if (ray.intersectBox(b.box, tmp)) {
        const d = tmp.distanceTo(ray.origin);
        if (d < best) [best, item, obstacle, wall] = [d, null, b.id, null];
      }
    for (const b of this.wallBoxes)
      if (ray.intersectBox(b.box, tmp)) {
        const d = tmp.distanceTo(ray.origin);
        if (d < best - 0.05) [best, item, obstacle, wall] = [d, null, null, b.edge];
      }
    if (this.rig) {
      const p = this.rig.root.position;
      const cb = new THREE.Box3(new THREE.Vector3(p.x - 0.35, 0, p.z - 0.35), new THREE.Vector3(p.x + 0.35, 1.9, p.z + 0.35));
      if (ray.intersectBox(cb, tmp) && tmp.distanceTo(ray.origin) < best) character = true;
    }
    const g = this.groundAt(cx, cy);
    const point = g ? { x: g.x + HALF, y: g.z + HALF } : null;
    const cell = point && inPlot(Math.floor(point.x), Math.floor(point.y)) ? { x: Math.floor(point.x), y: Math.floor(point.y) } : null;
    const corner = point ? { x: Math.max(0, Math.min(PLOT, Math.round(point.x))), y: Math.max(0, Math.min(PLOT, Math.round(point.y))) } : null;
    let edge: EdgeKey | null = wall;
    if (!edge && point) {
      // Nächste Kante in der Nähe des Bodenpunkts
      const fx = point.x - Math.floor(point.x);
      const fy = point.y - Math.floor(point.y);
      const dxe = Math.min(fx, 1 - fx);
      const dye = Math.min(fy, 1 - fy);
      if (Math.min(dxe, dye) < 0.3) {
        if (dye < dxe) edge = `h${Math.floor(point.x)},${Math.round(point.y)}`;
        else edge = `v${Math.round(point.x)},${Math.floor(point.y)}`;
      }
    }
    const section = cell ? { sx: Math.floor(cell.x / SECTION), sy: Math.floor(cell.y / SECTION) } : null;
    return { point, cell, corner, edge, wall, item, obstacle, section, character };
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let tool = false;
    let pinchD = 0;
    let mid: { x: number; y: number } | null = null;

    const panBy = (ax: number, ay: number, bx: number, by: number) => {
      const a = this.groundAt(ax, ay);
      const b = this.groundAt(bx, by);
      if (!a || !b) return;
      this.target.x += a.x - b.x;
      this.target.z += a.z - b.z;
    };

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY, t: performance.now() };
        moved = false;
        tool = !!this.toolCapture && this.toolCapture(this.pick(e.clientX, e.clientY));
      } else if (pts.size === 2) {
        if (tool) {
          tool = false;
          this.onToolCancel();
        }
        const [a, b] = [...pts.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        moved = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const now = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, now);
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinchD > 0) this.zoomBy(pinchD / d);
        if (mid) panBy(mid.x, mid.y, m.x, m.y);
        this.followPaused = true;
        pinchD = d;
        mid = m;
        return;
      }
      if (start && Math.hypot(now.x - start.x, now.y - start.y) > 9) moved = true;
      if (tool) {
        this.onToolMove(this.pick(now.x, now.y));
        return;
      }
      if (moved) {
        this.followPaused = true;
        panBy(prev.x, prev.y, now.x, now.y);
      }
    });
    const up = (e: PointerEvent) => {
      const had = pts.has(e.pointerId);
      pts.delete(e.pointerId);
      if (!had) return;
      if (pts.size < 2) {
        pinchD = 0;
        mid = null;
      }
      if (pts.size === 1) {
        // Nach dem Zoomen mit dem verbliebenen Finger weiterschieben, ohne Sprung
        const [p] = [...pts.values()];
        start = { x: p.x, y: p.y, t: 0 };
        moved = true;
      }
      if (pts.size === 0) {
        if (tool) {
          tool = false;
          if (e.type === 'pointercancel') this.onToolCancel();
          else this.onToolEnd(this.pick(e.clientX, e.clientY));
        } else if (start && !moved && performance.now() - start.t < 450) this.onTap(this.pick(e.clientX, e.clientY));
        start = null;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY > 0 ? 1.1 : 0.9);
      },
      { passive: false },
    );
  }

  // --- Schleife ------------------------------------------------------------------------------

  private frame(t: number, dt: number) {
    if (this.viewShiftX !== this.viewShiftXTarget) {
      const d = this.viewShiftXTarget - this.viewShiftX;
      this.viewShiftX = Math.abs(d) < 0.001 ? this.viewShiftXTarget : this.viewShiftX + d * Math.min(1, dt * 9);
      const w = this.host.clientWidth;
      const h = this.host.clientHeight;
      if (w && h) {
        this.camera.setViewOffset(w, h, w * this.viewShiftX, h * this.viewShift, w, h);
        this.camera.updateProjectionMatrix();
      }
    }
    this.updateCamera(dt);
    this.updateCharacter(t, dt);
    this.updateLights(t);
    this.updateWeather(dt);
    if (this.sectionMarks.count) (this.sectionMarks.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.14 * Math.sin(t * 3);
    this.styled.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    for (const l of Object.values(this.layers)) this.clearLayer(l);
    this.env?.dispose();
    this.rig?.dispose();
    this.precip?.obj.geometry.dispose();
    this.styled.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

// --- Vorschaubilder für die Bauleiste ---------------------------------------------------------

export interface ThumbJob {
  key: string;
  build: () => THREE.Object3D;
}

export function renderThumbnails(jobs: ThumbJob[], size = 112): Record<string, string> {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const styled = new StyledRenderer(r, 1.4, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff1d8', '#4b4538', 1.4));
  const d = new THREE.DirectionalLight('#ffe0b0', 2.4);
  d.position.set(-3, 6, 4);
  scene.add(d);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const out: Record<string, string> = {};
  for (const job of jobs) {
    const g = job.build();
    scene.add(g);
    const bb = new THREE.Box3().setFromObject(g);
    const c = bb.getCenter(new THREE.Vector3());
    const s = bb.getSize(new THREE.Vector3()).length();
    cam.position.set(c.x + s * 1.25, c.y + s * 1.05, c.z + s * 1.6);
    cam.lookAt(c);
    styled.render(scene, cam);
    out[job.key] = r.domElement.toDataURL('image/png');
    scene.remove(g);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
  styled.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}

