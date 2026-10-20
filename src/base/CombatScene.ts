// Kampf 2.0 in 3D: eine kleine Straßenecke, deine Figur, die Zombies.
// Die Simulation (core/battle.ts) entscheidet alles; diese Szene zeigt es nur an:
// Bewegungen, angekündigte Angriffe (roter Kreis), Treffer, Funken, Wackeln.

import * as THREE from 'three';
import { alive, windupLeft, type BattleEvent, type BattleState } from '../core/battle';
import { BATTLE, FOES } from '../core/content';
import type { DayPhase } from '../core/sun';
import type { Character, WeaponId } from '../core/types';
import { Assembler, bake, GLOW, LIT } from './bake';
import { CharacterRig } from './character';
import { box, buildRubble, cyl, mat } from './models';
import { buildBush, buildCarWreck, buildTree } from './structures';
import { ZombieRig } from './zombie';

const PHASES: Record<DayPhase, { hemi: [string, string, number]; sun: [string, number]; fog: string; exposure: number }> = {
  day: { hemi: ['#ffe9c8', '#5a5040', 1.1], sun: ['#ffe0b0', 2.4], fog: '#3a3328', exposure: 1 },
  dusk: { hemi: ['#e8b49a', '#3a2e2a', 0.85], sun: ['#ff9a62', 1.8], fog: '#2a1c18', exposure: 1 },
  night: { hemi: ['#5a6c9e', '#1c1f28', 1.0], sun: ['#a9bce6', 1.0], fog: '#0c0e14', exposure: 1.2 },
};

interface FoeView {
  rig: ZombieRig;
  /** kurzer Rückstoß nach einem Treffer */
  kick: THREE.Vector2;
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  height: number;
}

interface Bit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

export class CombatScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.3, 120);
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private lantern = new THREE.PointLight('#ffc98a', 0, 8, 1.6);
  private player: CharacterRig;
  private foes = new Map<number, FoeView>();
  private targetRing: THREE.Mesh;
  private targetArrow: THREE.Mesh;
  private bits: Bit[] = [];
  private bitGeo = new THREE.TetrahedronGeometry(0.06);
  private shake = 0;
  private dodgeOffset = new THREE.Vector2();
  private camTarget = new THREE.Vector3();
  private ro: ResizeObserver;
  private lastPlayer = new THREE.Vector2();
  private chargeRing: THREE.Mesh;

  constructor(
    private host: HTMLElement,
    look: Character['look'],
    weapon: WeaponId | null,
    phase: DayPhase,
  ) {
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
    sc.left = sc.bottom = -12;
    sc.right = sc.top = 12;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.renderer.toneMappingExposure = p.exposure;
    this.lantern.intensity = phase === 'night' ? 4 : phase === 'dusk' ? 1.5 : 0;

    this.buildArena();

    this.player = new CharacterRig(look);
    this.player.holdWeapon(weapon);
    this.player.root.add(this.lantern);
    this.lantern.position.set(0.3, 1.6, 0.4);
    this.scene.add(this.player.root);

    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 40), new THREE.MeshBasicMaterial({ color: '#ffb22e', transparent: true, opacity: 0.9, depthWrite: false }));
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.renderOrder = 2;
    this.scene.add(this.targetRing);
    this.targetArrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4), new THREE.MeshBasicMaterial({ color: '#ffb22e' }));
    this.targetArrow.rotation.x = Math.PI;
    this.scene.add(this.targetArrow);

    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 48, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.chargeRing.renderOrder = 5;
    this.scene.add(this.chargeRing);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  // --- Schauplatz ----------------------------------------------------------------------------

  private buildArena() {
    // Boden: Straße mit Gehwegen, außen Gras, alles leicht unregelmäßig getönt
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    let s = 11;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const step = 1;
    for (let z = -26; z < 18; z += step)
      for (let x = -26; x < 26; x += step) {
        const cx = x + step / 2;
        const road = Math.abs(cx) < 4.5;
        const walk = !road && Math.abs(cx) < 7;
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

    // Kulisse
    const props = new THREE.Group();
    const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => {
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      props.add(o);
    };
    for (let z = -24; z < 16; z += 3) box(props, 0.18, 0.05, 1.6, mat('#d8d2c2'), 0, 0.005, z);
    for (const side of [-1, 1]) box(props, 0.25, 0.14, 44, mat('#6e6a62'), side * 4.6, 0, -4);
    put(buildCarWreck(2), -2.4, -11, 0.25);
    put(buildCarWreck(5), 3.2, 6.5, -0.4);
    put(buildRubble(2, 2, 41), 6.2, -6);
    put(buildRubble(1.5, 1.5, 17), -6.5, 2);
    const barrel = new THREE.Group();
    cyl(barrel, 0.3, 0.3, 0.9, mat('#7a3b24'), 0, 0, 0, 10);
    put(barrel, 5.2, 1.5);
    const lamp = new THREE.Group();
    cyl(lamp, 0.07, 0.09, 4.6, mat('#4a524a'), 0, 0, 0, 6);
    box(lamp, 0.08, 0.08, 1.1, mat('#4a524a'), 0, 4.5, 0.5);
    put(lamp, -5.4, -4, Math.PI / 2);
    for (const [x, z, i] of [
      [-9, -9, 1],
      [9.5, -12, 2],
      [-10, 5, 3],
      [10, 3, 4],
      [-8.5, -17, 5],
      [8, -19, 6],
    ])
      put(i % 2 ? buildTree('scraggly', i, 1.1) : buildBush(i, 1.4), x, z, i);
    // Häuserruinen hinten
    for (let i = 0; i < 6; i++) {
      const ruin = new THREE.Group();
      const w = 6 + (i % 3) * 2;
      const h = 5 + ((i * 7) % 5) * 1.6;
      box(ruin, w, h, 5, mat(['#5a5650', '#4f4b46', '#625d55'][i % 3]), 0, 0, 0);
      box(ruin, w * 0.4, 1.5, 4, mat('#4f4b46'), -w * 0.2, h, 0);
      for (let y = 1.5; y < h - 1; y += 2.4) for (let x = -w / 2 + 1.2; x < w / 2 - 0.8; x += 2) box(ruin, 0.9, 1.2, 0.06, mat('#1c1b19'), x, y, 2.52);
      put(ruin, (i % 2 ? 1 : -1) * (12 + (i % 3) * 2), -14 - Math.floor(i / 2) * 8, (i % 2 ? -1 : 1) * 0.3);
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

  // --- Anzeige des Kampfzustands -------------------------------------------------------------

  private foeView(id: number, kind: keyof typeof FOES): FoeView {
    let v = this.foes.get(id);
    if (v) return v;
    const rig = new ZombieRig(kind);
    this.scene.add(rig.root);
    const big = kind === 'brute' ? 1.3 : kind === 'screamer' ? 1.6 : 1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62 * big, 0.74 * big, 40), new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.62 * big, 40), new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    fill.renderOrder = 2;
    this.scene.add(ring, fill);
    v = { rig, ring, fill, kick: new THREE.Vector2(), height: kind === 'brute' ? 2.5 : kind === 'crawler' ? 1.1 : 2 };
    this.foes.set(id, v);
    return v;
  }

  /** Zustand übernehmen und alles bewegen. */
  sync(b: BattleState, t: number, dt: number) {
    // Spielfigur
    const moved = Math.hypot(b.x - this.lastPlayer.x, b.z - this.lastPlayer.y) > dt * 0.5;
    this.lastPlayer.set(b.x, b.z);
    this.dodgeOffset.multiplyScalar(Math.max(0, 1 - dt * 6));
    this.player.root.position.set(b.x + this.dodgeOffset.x, 0, b.z + this.dodgeOffset.y);
    const tgt = b.target !== null ? b.foes.find((f) => f.id === b.target) : undefined;
    if (tgt) this.player.root.rotation.y = Math.atan2(tgt.x - b.x, tgt.z - b.z);
    // Aufladen: Waffe hoch, Ring an den Füßen füllt sich
    const lvl = b.charge !== null ? Math.min(1, b.charge / BATTLE.chargeTime) : null;
    this.player.charging = lvl;
    const cm = this.chargeRing.material as THREE.MeshBasicMaterial;
    if (lvl !== null) {
      const full = lvl >= 0.95;
      this.chargeRing.geometry.dispose();
      // Weiß, außen um die Figur, damit man ihn nicht mit dem Zielkreis verwechselt
      this.chargeRing.geometry = new THREE.RingGeometry(0.9, 1.08, 56, 1, Math.PI / 2, Math.max(0.01, lvl * Math.PI * 2));
      this.chargeRing.position.set(b.x, 0.05, b.z);
      cm.color.set(full ? '#ffe070' : '#ffffff');
      cm.opacity = full ? 0.75 + 0.25 * Math.sin(t * 30) : 0.8;
    } else cm.opacity = 0;
    this.player.update(t, dt, moved ? 1 : 0);

    // Gegner
    for (const f of b.foes) {
      const v = this.foeView(f.id, f.kind);
      v.kick.multiplyScalar(Math.max(0, 1 - dt * 10));
      v.rig.root.position.x = f.x + v.kick.x;
      v.rig.root.position.z = f.z + v.kick.y;
      if (f.mode !== 'dead') v.rig.root.rotation.y = Math.atan2(b.x - f.x, b.z - f.z);
      const def = FOES[f.kind];
      v.rig.pose = f.mode === 'dead' ? 'dead' : f.mode === 'windup' ? (f.kind === 'screamer' ? 'scream' : 'windup') : f.mode === 'stagger' ? 'stagger' : 'walk';
      v.rig.windup = f.mode === 'windup' ? Math.min(1, f.t / (def.windup / b.foeSpeed)) : 0;
      const movingFoe = f.mode === 'chase' || f.mode === 'enter';
      v.rig.update(t, dt, movingFoe);
      // Ankündigung: roter Kreis füllt sich; kurz vor dem Treffer leuchtet er hell auf
      const left = windupLeft(f, b);
      const ringMat = v.ring.material as THREE.MeshBasicMaterial;
      const fillMat = v.fill.material as THREE.MeshBasicMaterial;
      v.ring.position.set(f.x, 0.03, f.z);
      v.fill.position.set(f.x, 0.025, f.z);
      if (f.mode === 'windup') {
        const k = Math.min(1, f.t / (def.windup / b.foeSpeed));
        const perfect = left <= BATTLE.perfectWindow;
        ringMat.color.set(perfect ? '#fff2b0' : '#ff3a2a');
        fillMat.color.set(perfect ? '#ffe070' : '#ff3a2a');
        ringMat.opacity = 0.95;
        fillMat.opacity = perfect ? 0.55 + 0.25 * Math.sin(t * 40) : 0.32;
        v.fill.scale.setScalar(Math.max(0.01, k));
        v.ring.scale.setScalar(perfect ? 1.08 + 0.05 * Math.sin(t * 40) : 1);
      } else {
        ringMat.opacity = fillMat.opacity = 0;
      }
    }

    // Ziel-Markierung
    if (tgt && tgt.mode !== 'dead') {
      const v = this.foes.get(tgt.id)!;
      this.targetRing.visible = this.targetArrow.visible = true;
      this.targetRing.position.set(tgt.x, 0.035, tgt.z);
      this.targetRing.rotation.z = t * 1.5;
      this.targetArrow.position.set(tgt.x, v.height + 0.35 + Math.sin(t * 5) * 0.08, tgt.z);
      this.targetArrow.rotation.y = t * 2;
    } else this.targetRing.visible = this.targetArrow.visible = false;

    // Kamera: hinter der Figur, Blick zwischen Figur und Ziel
    const look = new THREE.Vector3(b.x, 0.9, b.z);
    if (tgt && tgt.mode !== 'dead') look.lerp(new THREE.Vector3(tgt.x, 0.9, tgt.z), 0.35);
    this.camTarget.lerp(look, Math.min(1, dt * 3));
    if (this.camTarget.lengthSq() === 0) this.camTarget.copy(look);
    const sh = this.shake > 0 ? this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.camera.position.set(this.camTarget.x + (Math.random() - 0.5) * sh * 0.4, 7.4 + (Math.random() - 0.5) * sh * 0.3, this.camTarget.z + 8.6);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y - 0.6, this.camTarget.z - 2.2);
    this.sun.position.set(this.camTarget.x - 6, 14, this.camTarget.z + 5);
    this.sun.target.position.copy(this.camTarget);

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
    for (const bit of this.bits.filter((x) => x.life <= 0)) this.scene.remove(bit.mesh);
    this.bits = this.bits.filter((x) => x.life > 0);
  }

  private burst(x: number, y: number, z: number, n: number, colors: string[], speed = 3) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.bitGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.bits.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * speed * (0.4 + Math.random()), 2 + Math.random() * 3, Math.sin(a) * speed * (0.4 + Math.random())), life: 0.5 + Math.random() * 0.4 });
    }
  }

  /** Ereignisse der Simulation in Bewegung übersetzen. */
  handle(b: BattleState, events: BattleEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'swing':
          this.player.play('swing');
          break;
        case 'hit': {
          const f = b.foes.find((x) => x.id === e.id);
          const v = this.foes.get(e.id);
          if (!f || !v) break;
          v.rig.flash();
          {
            const dx = f.x - b.x;
            const dz = f.z - b.z;
            const d = Math.hypot(dx, dz) || 1;
            const k = e.power || e.counter ? 0.6 : e.crit ? 0.4 : 0.22;
            v.kick.set((dx / d) * k, (dz / d) * k);
          }
          if (e.power) this.player.play('power');
          this.burst(f.x, 1.2, f.z, e.crit ? 14 : 7, e.crit ? ['#ffd27a', '#ffb22e', '#5a1f1a'] : ['#5a1f1a', '#3a3530', '#7a2a20']);
          if (e.kill) this.burst(f.x, 0.8, f.z, 16, ['#3a3530', '#5a1f1a', '#6a6357']);
          break;
        }
        case 'hurt':
          this.player.play('hurt');
          this.shake = Math.max(this.shake, Math.min(1, e.dmg / 12));
          this.burst(b.x, 1.3, b.z, 6, ['#a83a2a', '#5a1f1a']);
          break;
        case 'dodge': {
          this.player.play('dodge');
          if (b.rollX || b.rollZ) break; // Die Rolle bewegt die Figur schon selbst
          // kleiner Hüpfer zur Seite
          const tgt = b.foes.find((x) => x.id === b.target);
          const dir = tgt ? Math.atan2(tgt.x - b.x, tgt.z - b.z) : 0;
          const side = Math.random() < 0.5 ? 1 : -1;
          this.dodgeOffset.set(Math.cos(dir) * 0.9 * side, -Math.sin(dir) * 0.9 * side);
          break;
        }
        case 'dodged': {
          const f = b.foes.find((x) => x.id === e.by);
          if (f && e.perfect) this.burst(b.x, 1, b.z, 10, ['#fff2b0', '#ffd27a']);
          const v = this.foes.get(e.by);
          v?.rig.strike();
          break;
        }
        case 'shove':
          this.player.play('shove');
          this.burst(b.x, 0.3, b.z, 12, ['#8a857a', '#6a6357'], 5);
          break;
        case 'heal':
          this.burst(b.x, 1.4, b.z, 10, ['#9fe0a0', '#e8f6d0']);
          break;
        case 'bandage':
          this.player.play('bandage');
          break;
        case 'scream': {
          const f = b.foes.find((x) => x.id === e.id);
          if (f) this.burst(f.x, 2, f.z, 10, ['#e8e2d0', '#a8ae96'], 4);
          this.shake = Math.max(this.shake, 0.5);
          break;
        }
        default:
          break;
      }
      if (e.type === 'hurt') {
        const v = this.foes.get(e.by);
        v?.rig.strike();
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Bildschirmposition eines Punkts (für Schadenszahlen und Lebensbalken). */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible: v.z < 1 };
  }

  foeHeight(id: number): number {
    return this.foes.get(id)?.height ?? 2;
  }

  /** Welcher Gegner liegt unter dem Finger? */
  pickFoe(b: BattleState, cx: number, cy: number): number | null {
    let best: number | null = null;
    let bd = Infinity;
    for (const f of alive(b)) {
      const h = this.foeHeight(f.id);
      for (const y of [0.3, h * 0.5, h * 0.9]) {
        const p = this.project(f.x, y, f.z);
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < bd) {
          bd = d;
          best = f.id;
        }
      }
    }
    return bd < 70 ? best : null;
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
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
