// Der Kampf in 3D: eine kleine Straßenecke, deine Figur vorne, die Gegner in zwei Reihen.
// Die Regeln (core/tactics.ts) entscheiden alles; diese Szene zeigt nur an, was passiert:
// Vorrücken, Zurückstoßen, Ausholen, Treffer, Würfe, Heulen.

import * as THREE from 'three';
import { FOE_TACTICS, type FoeKind } from '../core/content';
import type { DayPhase } from '../core/sun';
import type { Character, WeaponId } from '../core/types';
import { Assembler, bake, GLOW, LIT } from './bake';
import { CharacterRig, type CharacterAction } from './character';
import { box, buildRubble, cyl, mat } from './models';
import { buildBush, buildCarWreck, buildTree } from './structures';
import { ZombieRig } from './zombie';

const PHASES: Record<DayPhase, { hemi: [string, string, number]; sun: [string, number]; fog: string; exposure: number }> = {
  day: { hemi: ['#ffe9c8', '#5a5040', 1.1], sun: ['#ffe0b0', 2.4], fog: '#3a3328', exposure: 1 },
  dusk: { hemi: ['#e8b49a', '#3a2e2a', 0.85], sun: ['#ff9a62', 1.8], fog: '#2a1c18', exposure: 1 },
  night: { hemi: ['#5a6c9e', '#1c1f28', 1.0], sun: ['#a9bce6', 1.0], fog: '#0c0e14', exposure: 1.2 },
};

/** So zeigt die Oberfläche einen Gegner an (kann den Regeln kurz hinterherhinken, während Züge abgespielt werden). */
export interface ShownFoe {
  id: number;
  kind: FoeKind;
  row: 'near' | 'far';
  alive: boolean;
  stunned: boolean;
  /** Hat ausgeholt: als Nächstes kommt der schwere Schlag. */
  raised: boolean;
  /** Liegt und schläft (Schläfer) oder steht steif vor Kälte (Erstarrter). */
  still?: 'sleep' | 'frozen' | null;
  /** Nicht besiegt, sondern gegangen (davongerannt oder mit Medizin): läuft aus dem Bild. */
  gone?: boolean;
}

interface FoeView {
  rig: ZombieRig;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** kurzer Rückstoß nach einem Treffer */
  kick: THREE.Vector2;
  ring: THREE.Mesh;
  height: number;
  /** schneller hinrutschen (zurückgestoßen) */
  fast: number;
  alive: boolean;
  /** Geht weg (davongerannt oder verschont), statt umzufallen. */
  leaving: boolean;
}

interface Bit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

interface Shot {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
}

/**
 * Seitenansicht (wie bei Karten-Kampfspielen üblich): deine Figur links, die Gegner rechts.
 * „Vorne“ heißt: direkt bei dir, „hinten“: weiter rechts und etwas zurück.
 */
const PLAYER = { x: -2.8, z: 0.5 };
const ROW = { nearX: -0.6, gap: 1.75, farGap: 1.9, farZ: -1.3 };
/** Kamera: von vorn auf die Straße, leicht erhöht. */
const CAM = { x: 0.6, y: 3.4, back: 11.5, lookY: 1.1, lookZ: -0.2, fov: 34, fovTall: 52, off: 0.075 };
/**
 * Versuch: Schulterblick. Die Kamera steht hinter deiner Figur und schaut die Straße entlang,
 * die Gegner stehen dir gegenüber. Einschalten unter Einstellungen → Grafik → Kampfansicht.
 */
const SHOULDER_CAM = { x: PLAYER.x - 3.5, y: 2.2, z: PLAYER.z + 0.8, lookX: PLAYER.x + 6, lookY: 0.95, lookZ: PLAYER.z + 1.7, fov: 42, fovTall: 66, mid: 1.3, nearX: 3.8, nearGap: 3.1, farX: 7.8 };

export class TacticsScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.3, 120);
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private lantern = new THREE.PointLight('#ffc98a', 0, 8, 1.6);
  private player: CharacterRig;
  private foes = new Map<number, FoeView>();
  private bits: Bit[] = [];
  private shots: Shot[] = [];
  private bitGeo = new THREE.TetrahedronGeometry(0.06);
  private shake = 0;
  private lunge = 0;
  private dodge = 0;
  private shield: THREE.Mesh;
  private shieldT = 0;
  /** Kampfansicht: von der Seite (Standard) oder über die Schulter. */
  private readonly shoulder: boolean;
  private ro: ResizeObserver;
  private highlight = new Set<number>();
  private selected: number | null = null;
  /** Anvisierter Gegner: Karten treffen ihn, bis man wechselt. */
  private locked: number | null = null;

  constructor(
    private host: HTMLElement,
    look: Character['look'],
    weapon: WeaponId | null,
    phase: DayPhase,
    view: 'side' | 'shoulder' = 'side',
  ) {
    this.shoulder = view === 'shoulder';
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'battle-canvas';
    host.append(this.renderer.domElement);

    const p = PHASES[phase];
    this.scene.background = new THREE.Color(p.fog);
    this.scene.fog = new THREE.Fog(p.fog, 12, 34);
    this.hemi.color.set(p.hemi[0]);
    this.hemi.groundColor.set(p.hemi[1]);
    this.hemi.intensity = p.hemi[2];
    this.sun.color.set(p.sun[0]);
    this.sun.intensity = p.sun[1];
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -10;
    sc.right = sc.top = 10;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.position.set(-5, 14, 8);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.renderer.toneMappingExposure = p.exposure;
    this.lantern.intensity = phase === 'night' ? 4 : phase === 'dusk' ? 1.5 : 0;

    this.buildArena();

    this.player = new CharacterRig(look);
    this.player.holdWeapon(weapon);
    this.player.root.add(this.lantern);
    this.lantern.position.set(0.3, 1.6, 0.4);
    this.player.root.position.set(PLAYER.x, 0, PLAYER.z);
    this.player.root.rotation.y = Math.PI / 2;
    this.scene.add(this.player.root);

    // Schutzschild (Ausweichen): ein heller Bogen vor der Figur
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#9fd4ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shield.position.set(PLAYER.x, 0.02, PLAYER.z);
    this.shield.renderOrder = 4;
    this.shield.visible = false;
    this.scene.add(this.shield);

    this.placeCamera(0);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  // --- Schauplatz ----------------------------------------------------------------------------

  private buildArena() {
    // Boden: Straße von links nach rechts, dahinter Gehweg und Gras, alles leicht unregelmäßig getönt
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    let s = 11;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const step = 1;
    for (let z = -30; z < 14; z += step)
      for (let x = -30; x < 30; x += step) {
        const cz = z + step / 2;
        const road = Math.abs(cz) < 2.6;
        const walk = !road && Math.abs(cz) < 4.4;
        const base = road ? ['#4a4844', '#504d47', '#46443f'] : walk ? ['#8a857a', '#827d72', '#8f897d'] : ['#5f6638', '#566034', '#666a3c'];
        for (const tri of [
          [x, z, x, z + step, x + step, z],
          [x + step, z, x, z + step, x + step, z + step],
        ]) {
          c.set(base[Math.floor(r() * base.length)]);
          for (let i = 0; i < 6; i += 2) {
            pos.push(tri[i], 0, tri[i + 1]);
            col.push(c.r, c.g, c.b);
          }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, LIT);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Kulisse (vor allem hinter der Straße, damit nichts die Figuren verdeckt)
    const props = new THREE.Group();
    const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => {
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      props.add(o);
    };
    for (let x = -20; x < 20; x += 3) box(props, 1.6, 0.05, 0.18, mat('#d8d2c2'), x, 0.005, 0.05);
    for (const side of [-1, 1]) box(props, 44, 0.14, 0.25, mat('#6e6a62'), 0, 0, side * 2.7);
    put(buildCarWreck(2), -6.6, -3.5, Math.PI / 2 + 0.2);
    put(buildCarWreck(5), 7.4, -3.7, -Math.PI / 2 + 0.3);
    put(buildRubble(2, 2, 41), 4.6, -5.2);
    put(buildRubble(1.5, 1.5, 17), -9, 3.6);
    const barrel = new THREE.Group();
    cyl(barrel, 0.3, 0.3, 0.9, mat('#7a3b24'), 0, 0, 0, 10);
    put(barrel, -4.6, -3.4);
    const lamp = new THREE.Group();
    cyl(lamp, 0.07, 0.09, 4.6, mat('#4a524a'), 0, 0, 0, 6);
    box(lamp, 0.08, 0.08, 1.1, mat('#4a524a'), 0, 4.5, 0.5);
    put(lamp, 1.6, -3.3, 0);
    for (const [x, z, i] of [
      [-10, -7, 1],
      [9.5, -7.5, 2],
      [-2.5, -8, 3],
      [12, -6, 4],
      [-14, -9, 5],
      [5, -10, 6],
    ])
      put(i % 2 ? buildTree('scraggly', i, 1.1) : buildBush(i, 1.4), x, z, i);
    // Häuserruinen hinten
    for (let i = 0; i < 7; i++) {
      const ruin = new THREE.Group();
      const w = 6 + (i % 3) * 2;
      const h = 5 + ((i * 7) % 5) * 1.6;
      box(ruin, w, h, 5, mat(['#5a5650', '#4f4b46', '#625d55'][i % 3]), 0, 0, 0);
      box(ruin, w * 0.4, 1.5, 4, mat('#4f4b46'), -w * 0.2, h, 0);
      for (let y = 1.5; y < h - 1; y += 2.4) for (let x = -w / 2 + 1.2; x < w / 2 - 0.8; x += 2) box(ruin, 0.9, 1.2, 0.06, mat('#1c1b19'), x, y, 2.52);
      put(ruin, -21 + i * 7 + (i % 2) * 1.5, -13 - (i % 3) * 2.5, (i % 2 ? -1 : 1) * 0.12);
    }
    const t = bake(props);
    props.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    const lit = new Assembler();
    lit.add(t.lit, new THREE.Matrix4());
    const glow = new Assembler();
    glow.add(t.glow, new THREE.Matrix4());
    const lm = lit.mesh(LIT);
    if (lm) this.scene.add(lm);
    const gm = glow.mesh(GLOW, false);
    if (gm) this.scene.add(gm);
  }

  // --- Gegner ------------------------------------------------------------------------------

  private slotPos(list: ShownFoe[], f: ShownFoe): THREE.Vector3 {
    const near = list.filter((x) => x.alive && x.row === 'near').sort((a, b) => a.id - b.id);
    const far = list.filter((x) => x.alive && x.row === 'far').sort((a, b) => a.id - b.id);
    if (this.shoulder) {
      // Schulterblick: vorne nebeneinander vor dir, hinten weiter weg, leicht versetzt
      const c = SHOULDER_CAM;
      const isNear = f.row === 'near';
      const row = isNear ? near : far;
      const i = Math.max(0, row.findIndex((x) => x.id === f.id));
      const n = Math.max(1, row.length);
      // Seitlicher Platz, so wie er vorne im Bild erscheint. Hinten um eine halbe Lücke
      // versetzt, damit man zwischen den vorderen hindurch die hinteren sieht.
      // bei großen Gruppen enger zusammen, damit alle ins Bild passen
      const gap = c.nearGap * Math.min(1, 3 / Math.max(near.length, far.length, 1));
      let side = (i - (n - 1) / 2) * gap;
      if (!isNear && (near.length + n) % 2 === 0) side += gap / 2;
      const z = PLAYER.z + c.mid + side;
      if (isNear) return new THREE.Vector3(PLAYER.x + c.nearX + (i % 2) * 0.35, 0, z);
      // hinten: auf derselben Sichtlinie von der Kamera aus, nur weiter weg
      const k = (c.farX - (c.x - PLAYER.x)) / (c.nearX - (c.x - PLAYER.x));
      return new THREE.Vector3(PLAYER.x + c.farX + (i % 2) * 0.35, 0, c.z + (z - c.z) * k);
    }
    if (f.row === 'near') {
      const i = Math.max(0, near.findIndex((x) => x.id === f.id));
      return new THREE.Vector3(ROW.nearX + i * ROW.gap, 0, (i % 2) * 0.5);
    }
    const i = Math.max(0, far.findIndex((x) => x.id === f.id));
    const start = ROW.nearX + Math.max(1, near.length) * ROW.gap + ROW.farGap - ROW.gap;
    return new THREE.Vector3(start + i * ROW.gap, 0, ROW.farZ + (i % 2) * 0.45);
  }

  /** Gegner anlegen oder an ihre Plätze schicken. `enter`: kommt von hinten ins Bild. */
  setFoes(list: ShownFoe[], enter: number[] = []) {
    for (const f of list) {
      let v = this.foes.get(f.id);
      const target = f.alive ? this.slotPos(list, f) : (v?.target ?? this.slotPos(list, f));
      if (!v) {
        const rig = new ZombieRig(f.kind);
        this.scene.add(rig.root);
        const big = f.kind === 'giant' ? 1.55 : f.kind === 'brute' ? 1.3 : f.kind === 'screamer' || f.kind === 'bellower' ? 1.1 : 1;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.58 * big, 0.72 * big, 40), new THREE.MeshBasicMaterial({ color: '#ffb22e', transparent: true, opacity: 0, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 2;
        this.scene.add(ring);
        const start = enter.includes(f.id) ? target.clone().add(new THREE.Vector3(7, 0, -0.5)) : target.clone();
        v = { rig, pos: start, target: target.clone(), kick: new THREE.Vector2(), ring, height: f.kind === 'giant' ? 2.9 : f.kind === 'brute' ? 2.5 : f.kind === 'crawler' ? 1.1 : 2, fast: 0, alive: true, leaving: false };
        this.foes.set(f.id, v);
      }
      v.target.copy(target);
      if (v.alive && !f.alive) {
        if (f.gone) {
          // Geht weg: nach hinten aus dem Bild
          v.leaving = true;
          v.rig.pose = 'walk';
          v.target.copy(v.pos).add(new THREE.Vector3(9, 0, 3));
        } else v.rig.pose = 'dead';
      }
      v.alive = f.alive;
      if (f.alive)
        v.rig.pose = f.still === 'sleep' ? 'sleep' : f.still === 'frozen' ? 'frozen' : f.stunned ? 'stagger' : f.raised ? 'windup' : (f.kind === 'screamer' || f.kind === 'bellower') && v.rig.pose === 'scream' ? 'scream' : 'walk';
      v.rig.windup = f.raised ? 1 : 0;
    }
  }

  /** Anvisierten Gegner markieren (fester Kreis, auch ohne gewählte Karte). */
  setLocked(id: number | null) {
    this.locked = id;
  }

  /** Mögliche Ziele hervorheben (null = keine). */
  setTargets(ids: number[] | null, selected: number | null = null) {
    this.highlight = new Set(ids ?? []);
    this.selected = selected;
  }

  // --- Effekte -------------------------------------------------------------------------------

  private burst(x: number, y: number, z: number, n: number, colors: string[], speed = 3) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.bitGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.bits.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * speed * (0.4 + Math.random()), 2 + Math.random() * 3, Math.sin(a) * speed * (0.4 + Math.random())), life: 0.5 + Math.random() * 0.4 });
    }
  }

  /** Deine Figur bewegt sich (Schlag, Tritt, Verbinden …). */
  act(kind: CharacterAction, towards?: number) {
    this.player.play(kind);
    if (kind === 'swing' || kind === 'power' || kind === 'shove') this.lunge = 1;
    if (kind === 'dodge') this.dodge = 1;
    const v = towards !== undefined ? this.foes.get(towards) : undefined;
    if (v) this.player.root.rotation.y = Math.atan2(v.pos.x - this.player.root.position.x, v.pos.z - PLAYER.z);
  }

  /** Etwas fliegt auf einen Gegner (Stein oder Bolzen). */
  shoot(id: number, kind: 'stone' | 'bolt') {
    const v = this.foes.get(id);
    if (!v) return;
    this.player.play('swing');
    const mesh =
      kind === 'stone'
        ? new THREE.Mesh(new THREE.DodecahedronGeometry(0.11), new THREE.MeshLambertMaterial({ color: '#8a857a' }))
        : new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), new THREE.MeshBasicMaterial({ color: '#d8d2c2' }));
    const from = new THREE.Vector3(PLAYER.x + 0.3, 1.4, PLAYER.z);
    const to = v.pos.clone().add(new THREE.Vector3(0, v.height * 0.6, 0));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.shots.push({ mesh, from, to, t: 0, dur: kind === 'stone' ? 0.32 : 0.16, arc: kind === 'stone' ? 1.2 : 0.1 });
  }

  /** Treffer an einem Gegner. */
  hitFoe(id: number, dmg: number, kill: boolean, big = false) {
    const v = this.foes.get(id);
    if (!v) return;
    v.rig.flash();
    const k = big ? 0.6 : dmg >= 3 ? 0.4 : 0.22;
    v.kick.set(k, 0);
    const p = v.pos;
    // Wilde Menschen: kein Blut, nur Staub
    const human = !!FOE_TACTICS[v.rig.kind].human;
    this.burst(p.x, 1.2, p.z, big ? 14 : 7, dmg >= 4 ? ['#ffd27a', '#ffb22e', human ? '#8a857a' : '#5a1f1a'] : human ? ['#8a857a', '#6a6357', '#a8a090'] : ['#5a1f1a', '#3a3530', '#7a2a20']);
    if (kill) {
      this.burst(p.x, 0.8, p.z, 16, human ? ['#6a6357', '#8a857a', '#a8a090'] : ['#3a3530', '#5a1f1a', '#6a6357']);
      this.shake = Math.max(this.shake, 0.25);
    }
  }

  /** Abgewehrt: Funken am Schild. */
  blocked(by: number) {
    const v = this.foes.get(by);
    v?.rig.strike();
    this.shieldT = 0.6;
    this.burst(PLAYER.x + 0.6, 1.1, PLAYER.z, 10, ['#cfe9ff', '#9fd4ff', '#ffffff'], 2);
  }

  /** Du wirst getroffen. */
  hurt(by: number, dmg: number) {
    const v = this.foes.get(by);
    v?.rig.strike();
    if (v) v.kick.set(-0.5, 0);
    this.player.play('hurt');
    this.shake = Math.max(this.shake, Math.min(1, dmg / 6));
    this.burst(PLAYER.x, 1.3, PLAYER.z, 6 + dmg, ['#a83a2a', '#5a1f1a']);
  }

  shieldUp() {
    this.shieldT = 1.2;
    this.player.play('dodge');
  }

  heal() {
    this.player.play('bandage');
    this.burst(PLAYER.x, 1.4, PLAYER.z, 12, ['#9fe0a0', '#e8f6d0']);
  }

  focus() {
    this.burst(PLAYER.x, 1.6, PLAYER.z, 8, ['#ffe070', '#fff2b0'], 1.5);
  }

  /** Der Heuler schreit. */
  howl(id: number) {
    const v = this.foes.get(id);
    if (!v) return;
    v.rig.pose = 'scream';
    v.rig.windup = 1;
    this.burst(v.pos.x, 2, v.pos.z, 12, ['#e8e2d0', '#a8ae96'], 4);
    this.shake = Math.max(this.shake, 0.5);
    window.setTimeout(() => {
      if (v.alive && v.rig.pose === 'scream') {
        v.rig.pose = 'walk';
        v.rig.windup = 0;
      }
    }, 900);
  }

  /** Zurückgestoßen: schnell nach hinten rutschen. */
  pushed(id: number) {
    const v = this.foes.get(id);
    if (!v) return;
    v.fast = 1;
    v.rig.pose = 'stagger';
    this.burst(v.pos.x, 0.3, v.pos.z, 10, ['#8a857a', '#6a6357'], 4);
  }

  // --- Schleife -----------------------------------------------------------------------------

  update(t: number, dt: number) {
    // Figur: kurzer Ausfallschritt nach vorn, beim Ausweichen zur Seite
    this.lunge = Math.max(0, this.lunge - dt * 3.2);
    this.dodge = Math.max(0, this.dodge - dt * 2.4);
    const lx = Math.sin(this.lunge * Math.PI) * 0.8;
    this.player.root.position.set(PLAYER.x + lx - Math.sin(this.dodge * Math.PI) * 0.7, 0, PLAYER.z);
    // langsam wieder nach rechts zu den Gegnern schauen
    const ry = this.player.root.rotation.y;
    this.player.root.rotation.y = ry + (Math.PI / 2 - ry) * Math.min(1, dt * 2.5);
    this.player.update(t, dt, 0);
    const sm = this.shield.material as THREE.MeshBasicMaterial;
    this.shieldT = Math.max(0, this.shieldT - dt);
    sm.opacity = Math.min(0.35, this.shieldT * 0.6);
    // Unsichtbares ganz ausblenden (manche Nachbearbeitungen ignorieren die Deckkraft)
    this.shield.visible = this.shieldT > 0;
    this.shield.scale.setScalar(1 + (1 - Math.min(1, this.shieldT)) * 0.15);

    for (const [id, v] of this.foes) {
      const d = v.target.clone().sub(v.pos);
      const len = d.length();
      const speed = v.fast > 0 ? 9 : 2.6;
      v.fast = Math.max(0, v.fast - dt * 1.5);
      if (len > 0.01) v.pos.addScaledVector(d, Math.min(1, (speed * dt) / len));
      const moving = len > 0.08 && v.fast <= 0 && (v.alive || v.leaving);
      if (v.leaving) {
        // Weggehen: in Laufrichtung schauen, am Ziel verschwinden
        v.rig.root.rotation.y = Math.atan2(d.x, d.z);
        if (len < 0.15) v.rig.root.visible = false;
      }
      v.kick.multiplyScalar(Math.max(0, 1 - dt * 8));
      v.rig.root.position.set(v.pos.x + v.kick.x, 0, v.pos.z + v.kick.y);
      if (v.alive) {
        // zur Figur schauen
        v.rig.root.rotation.y = Math.atan2(PLAYER.x - v.pos.x, PLAYER.z - v.pos.z);
        if (v.rig.pose === 'stagger' && v.fast <= 0 && len < 0.05) v.rig.pose = 'walk';
      }
      v.rig.update(t, dt, moving);
      // Zielkreis: hervorgehoben = möglich (pulsiert), ausgewählt oder anvisiert = kräftig
      const rm = v.ring.material as THREE.MeshBasicMaterial;
      const lockedHere = this.locked === id;
      const on = v.alive && (this.highlight.has(id) || lockedHere);
      rm.opacity = on ? (this.selected === id || lockedHere ? 0.95 : 0.55 + 0.3 * Math.sin(t * 6)) : 0;
      v.ring.visible = on;
      v.ring.position.set(v.pos.x, 0.035, v.pos.z);
      v.ring.rotation.z = t * 1.2;
    }

    // Kamera mit etwas Wackeln
    const sh = this.shake;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.placeCamera(sh);

    // Würfe
    for (const s of this.shots) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.mesh.position.lerpVectors(s.from, s.to, k);
      s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
      s.mesh.lookAt(s.to);
      s.mesh.rotation.z += dt * 12;
    }
    for (const s of this.shots.filter((x) => x.t >= x.dur)) {
      this.scene.remove(s.mesh);
      const m = s.mesh as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.shots = this.shots.filter((x) => x.t < x.dur);

    // Funken und Splitter
    for (const bit of this.bits) {
      bit.life -= dt;
      bit.vel.y -= 9 * dt;
      bit.mesh.position.addScaledVector(bit.vel, dt);
      if (bit.mesh.position.y < 0.03) {
        bit.mesh.position.y = 0.03;
        bit.vel.multiplyScalar(0.4);
      }
      bit.mesh.rotation.x += dt * 8;
      bit.mesh.scale.setScalar(Math.max(0.01, Math.min(1, bit.life * 3)));
    }
    for (const bit of this.bits.filter((x) => x.life <= 0)) {
      this.scene.remove(bit.mesh);
      (bit.mesh.material as THREE.Material).dispose();
    }
    this.bits = this.bits.filter((x) => x.life > 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Bildschirmposition eines Punkts (für Absichten, Lebensbalken, Schadenszahlen). */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible: v.z < 1 };
  }

  /** Bildschirmposition über dem Kopf eines Gegners (oder der Figur bei id = -1). */
  anchor(id: number, above = 0.25): { x: number; y: number; visible: boolean } {
    if (id < 0) return this.project(this.player.root.position.x, 2 + above, this.player.root.position.z);
    const v = this.foes.get(id);
    if (!v) return { x: 0, y: 0, visible: false };
    return this.project(v.pos.x + v.kick.x, v.height + above, v.pos.z + v.kick.y);
  }

  /** Welcher (lebende) Gegner liegt unter dem Finger? */
  pickFoe(cx: number, cy: number): number | null {
    let best: number | null = null;
    let bd = Infinity;
    for (const [id, v] of this.foes) {
      if (!v.alive) continue;
      for (const y of [0.3, v.height * 0.5, v.height * 0.9]) {
        const p = this.project(v.pos.x, y, v.pos.z);
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
    }
    return bd < 70 ? best : null;
  }

  /** Nur zum Ausprobieren: Kamera einstellen. */
  /** Kamera setzen, mit etwas Wackeln (sh). */
  private placeCamera(sh: number) {
    const jx = (Math.random() - 0.5) * sh * 0.35;
    const jy = (Math.random() - 0.5) * sh * 0.25;
    if (this.shoulder) {
      const c = SHOULDER_CAM;
      this.camera.position.set(c.x, c.y + jy, c.z + jx);
      this.camera.lookAt(c.lookX, c.lookY, c.lookZ);
      return;
    }
    this.camera.position.set(CAM.x + jx, CAM.y + jy, CAM.back);
    this.camera.lookAt(CAM.x, CAM.lookY, CAM.lookZ);
  }

  tuneCamera(p: Partial<typeof CAM & typeof SHOULDER_CAM>) {
    Object.assign(this.shoulder ? SHOULDER_CAM : CAM, p);
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Hochkant: etwas mehr Blickwinkel, damit alle drei Plätze ins Bild passen
    const tall = w / h < 0.8;
    this.camera.fov = this.shoulder ? (tall ? SHOULDER_CAM.fovTall : SHOULDER_CAM.fov) : tall ? CAM.fovTall : CAM.fov;
    // Die Karten unten verdecken einen Teil: das Bild etwas nach oben schieben, damit Figur und Gegner frei stehen
    this.camera.setViewOffset(w, h, 0, h * CAM.off, w, h);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.ro.disconnect();
    for (const v of this.foes.values()) v.rig.dispose();
    this.player.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
