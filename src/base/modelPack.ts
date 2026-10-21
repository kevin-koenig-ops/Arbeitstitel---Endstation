// Modellpaket (Stilprobe, Fahrplan Punkt 15): fertige 3D-Modelle statt selbst gebauter Klötzchen.
//
// Hier steht an EINER Stelle, welche Datei welche Rolle spielt (Spielfigur, Wandler, Fass …).
// Ein anderes Paket nehmen: Dateien mit scripts/import-models.mjs nach src/assets/models/<paket>/
// holen und unten FILES, PLAYER, FOES und PROPS anpassen. Der Rest des Spiels fragt nur nach Rollen.
//
// Alles hier ist freiwillig: Ist das Paket in den Einstellungen aus oder noch nicht geladen,
// nehmen die Szenen ihre selbst gebauten Figuren und Teile.
//
// Aktuelles Paket: Quaternius „Zombie Apocalypse Kit“ (CC0, gemeinfrei).

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FoeKind } from '../core/content';
import type { Character, WeaponId } from '../core/types';
import { CharacterRig, type CharacterAction } from './character';
import { modelSet } from './modelChoice';
import { mat, PAT, type Pat } from './models';
import { ZombieRig, type ZombiePose } from './zombie';

// --- Die Liste -------------------------------------------------------------------------------

const FILES = import.meta.glob('../assets/models/quaternius-zombie/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const fileUrl = (name: string) => FILES[`../assets/models/quaternius-zombie/${name}.glb`];

/** Name eines Bewegungsablaufs, oder ein festgehaltenes Bild daraus (at = Anteil 0..1). */
type Clip = string | { name: string; at: number; speed?: number };

/** Spielfigur: je Frisur aus der Charaktererstellung ein Modell (Kurz, Lang, Zopf, Mütze). */
const PLAYER = {
  files: ['player-matt', 'player-lis', 'player-sam', 'player-shaun'],
  scale: 1.05,
  /** Das Teil in der Hand, an dessen Platz unsere eigenen Waffen kommen. */
  handItem: 'WoodenBat_Barbed',
  clips: {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    swing: 'Slash',
    fist: 'Punch',
    power: 'Stab',
    shove: 'Punch',
    hurt: 'HitReact',
    dodge: 'Duck',
    bandage: 'Yes',
    wave: 'Wave',
  },
};

interface FoeSpec {
  file: string;
  scale: number;
  clips: { idle: Clip; walk: Clip; windup: Clip; strike: Clip; hit: Clip | null; death: Clip; scream?: Clip };
  /** Bewegt sich flach am Boden (kein Umkippen beim Tod). */
  low?: boolean;
}

const FOES: Record<FoeKind, FoeSpec> = {
  walker: { file: 'walker', scale: 1.3, clips: { idle: 'Idle', walk: 'Walk', windup: 'Idle_Attack', strike: 'Punch', hit: 'HitReact', death: 'Death' } },
  crawler: {
    file: 'walker',
    scale: 1.25,
    low: true,
    clips: { idle: { name: 'Crawl', at: 0.3 }, walk: 'Crawl', windup: { name: 'Crawl', at: 0.65 }, strike: { name: 'Crawl', at: 0, speed: 2.4 }, hit: null, death: { name: 'Crawl', at: 0.1 } },
  },
  brute: { file: 'brute', scale: 1.45, clips: { idle: 'Idle', walk: 'Walk', windup: { name: 'Punch', at: 0.3 }, strike: 'Punch', hit: 'HitReact', death: 'Death' } },
  screamer: { file: 'screamer', scale: 1.15, clips: { idle: 'Idle', walk: 'Walk', windup: 'Idle_Attack', strike: 'Punch', hit: 'HitReact', death: 'Death', scream: 'Idle_Attack' } },
};

/** Kulissen-Teile: Rolle → Datei, Oberfläche für den Stil „Gemalt“, Größe. */
export const PROPS = {
  barrel: { file: 'barrel', pat: PAT.metal, scale: 1 },
  trashBag: { file: 'trashbag-1', pat: PAT.plain, scale: 1 },
  trashBags: { file: 'trashbag-2', pat: PAT.plain, scale: 1 },
  cone: { file: 'trafficcone-1', pat: PAT.plain, scale: 1 },
  barrierDrum: { file: 'trafficcone-2', pat: PAT.plain, scale: 1 },
  roadBarrier: { file: 'trafficbarrier-1', pat: PAT.wood, scale: 1 },
  roadBarrierLow: { file: 'trafficbarrier-2', pat: PAT.wood, scale: 1 },
  plasticBarrier: { file: 'plasticbarrier', pat: PAT.plain, scale: 1 },
  pallet: { file: 'pallet', pat: PAT.wood, scale: 1 },
  palletBroken: { file: 'pallet-broken', pat: PAT.wood, scale: 1 },
  tires: { file: 'wheels-stack', pat: PAT.plain, scale: 1 },
  tire: { file: 'wheel', pat: PAT.plain, scale: 1 },
  cinderBlock: { file: 'cinderblock', pat: PAT.stone, scale: 1 },
  couch: { file: 'couch', pat: PAT.plain, scale: 1 },
  crate: { file: 'chest', pat: PAT.wood, scale: 1 },
  pipes: { file: 'pipes', pat: PAT.metal, scale: 1 },
  containerRed: { file: 'container-red', pat: PAT.metal, scale: 1 },
  containerGreen: { file: 'container-green', pat: PAT.metal, scale: 1 },
  streetLight: { file: 'streetlights', pat: PAT.metal, scale: 0.85 },
  road: { file: 'street-straight', pat: PAT.stone, scale: 1 },
  roadCracked: { file: 'street-straight-crack1', pat: PAT.stone, scale: 1 },
  roadBroken: { file: 'street-straight-crack2', pat: PAT.stone, scale: 1 },
  pickup: { file: 'vehicle-pickup', pat: PAT.metal, scale: 0.9 },
  sportsCar: { file: 'vehicle-sports', pat: PAT.metal, scale: 0.85 },
  van: { file: 'vehicle-truck', pat: PAT.metal, scale: 0.9 },
} satisfies Record<string, { file: string; pat: Pat; scale: number }>;
export type PropId = keyof typeof PROPS;

export const PACK_INFO = { name: 'Quaternius – Zombie Apocalypse Kit', license: 'CC0 (gemeinfrei)' };

// --- Laden -----------------------------------------------------------------------------------

const loaded = new Map<string, GLTF>();
let loading: Promise<boolean> | null = null;

/** Lädt alle Dateien des Pakets einmal (danach sofort). false = hat nicht geklappt. */
export function loadPack(): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const names = Object.keys(FILES).map((k) => k.split('/').pop()!.replace(/\.glb$/, ''));
      await Promise.all(
        names.map(async (n) => {
          const g = await loader.loadAsync(fileUrl(n));
          prepare(g, n);
          loaded.set(n, g);
        }),
      );
      return true;
    })().catch((e) => {
      console.warn('Modellpaket nicht geladen', e);
      loading = null;
      return false;
    });
  }
  return loading;
}

/** Sollen die Szenen jetzt das Paket benutzen? (eingeschaltet und fertig geladen) */
export function usePack(): boolean {
  return modelSet() === 'pack' && loaded.size > 0;
}

/** Materialien vorbereiten: matt, Farben an den Ecken, keine leuchtenden Scheinwerfer. */
function prepare(g: GLTF, name: string) {
  const pat = Object.values(PROPS).find((p) => p.file === name)?.pat ?? PAT.plain;
  g.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats as THREE.MeshStandardMaterial[]) {
      m.roughness = 0.9;
      m.metalness = 0;
      m.emissive?.setRGB(0, 0, 0);
      m.emissiveIntensity = 0;
      m.userData.pat = pat;
    }
  });
}

// --- Kulisse ---------------------------------------------------------------------------------

/** Ein Kulissen-Teil als neue Gruppe (teilt Formen und Materialien mit dem Original). Null = nicht geladen. */
export function packProp(id: PropId): THREE.Object3D | null {
  const spec = PROPS[id];
  const g = loaded.get(spec.file);
  if (!g) return null;
  const o = g.scene.clone(true);
  o.scale.setScalar(spec.scale);
  const holder = new THREE.Group();
  holder.add(o);
  return holder;
}

// --- Bewegungsabläufe ------------------------------------------------------------------------

/** Kleiner Helfer: eine Schleife als Grundbewegung, einzelne Bewegungen darüber, weich überblendet. */
class Motion {
  readonly mixer: THREE.AnimationMixer;
  private clips = new Map<string, THREE.AnimationClip>();
  private cur: THREE.AnimationAction | null = null;
  private base: Clip | null = null;
  private baseSpeed = 1;
  private busy = false;
  private final = false;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.clips.set(c.name, c);
    this.mixer.addEventListener('finished', (e) => {
      if (e.action !== this.cur || this.final) return;
      this.busy = false;
      if (this.base) this.go(this.base, { speed: this.baseSpeed, fade: 0.2 });
    });
  }

  private go(clip: Clip, o: { once?: boolean; speed?: number; fade?: number; restart?: boolean }): boolean {
    const name = typeof clip === 'string' ? clip : clip.name;
    const c = this.clips.get(name);
    if (!c) return false;
    const a = this.mixer.clipAction(c);
    const hold = typeof clip !== 'string' && !o.once;
    const same = a === this.cur;
    if (!same || o.restart || hold) {
      a.reset();
      if (typeof clip !== 'string') a.time = c.duration * clip.at;
    }
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    a.timeScale = (typeof clip !== 'string' ? (clip.speed ?? 1) : 1) * (o.speed ?? 1);
    a.paused = hold;
    a.play();
    if (!same) {
      a.setEffectiveWeight(1);
      if (this.cur) this.cur.crossFadeTo(a, o.fade ?? 0.15, false);
      else a.fadeIn(0.01);
      this.cur = a;
    }
    return true;
  }

  /** Grundbewegung (Schleife oder festgehaltenes Bild). Läuft gerade eine Einzelbewegung, kommt sie danach. */
  loop(clip: Clip, speed = 1) {
    if (this.final) return;
    const same = this.base !== null && JSON.stringify(this.base) === JSON.stringify(clip);
    this.base = clip;
    this.baseSpeed = speed;
    if (this.busy) return;
    if (same && this.cur) {
      if (typeof clip === 'string') this.cur.timeScale = speed;
      return;
    }
    this.go(clip, { speed });
  }

  /** Einmal abspielen, danach zurück zur Grundbewegung. */
  once(clip: Clip, speed = 1) {
    if (this.final) return;
    if (this.go(clip, { once: true, speed, fade: 0.08, restart: true })) this.busy = true;
  }

  /** Letzte Bewegung (Tod): bleibt danach liegen. */
  last(clip: Clip) {
    if (this.final) return;
    this.final = true;
    if (typeof clip === 'string') this.go(clip, { once: true, fade: 0.1, restart: true });
    else this.go(clip, { fade: 0.2 });
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  stop() {
    this.mixer.stopAllAction();
  }
}

function skinnedClone(file: string): { model: THREE.Object3D; clips: THREE.AnimationClip[] } | null {
  const g = loaded.get(file);
  if (!g) return null;
  const model = cloneSkinned(g.scene);
  model.traverse((o) => {
    // Beim Bewegen kann die Figur aus ihrer Ruhe-Hülle ragen: nie wegschneiden
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
  });
  return { model, clips: g.animations };
}

// --- Gegner ----------------------------------------------------------------------------------

/** Was die Kampfszene von einer Gegnerfigur braucht (eigene und Paket-Figuren gleich). */
export interface FoeRig {
  readonly root: THREE.Group;
  pose: ZombiePose;
  windup: number;
  flash(): void;
  strike(): void;
  update(t: number, dt: number, moving: boolean): void;
  dispose(): void;
}

class PackFoeRig implements FoeRig {
  readonly root = new THREE.Group();
  pose: ZombiePose = 'walk';
  windup = 0;
  private model: THREE.Object3D;
  private motion: Motion;
  private mats: THREE.MeshStandardMaterial[] = [];
  private flashT = 0;
  private shownPose: ZombiePose | null = null;
  private shownMoving = false;
  private deadT = 0;

  constructor(
    private spec: FoeSpec,
    src: { model: THREE.Object3D; clips: THREE.AnimationClip[] },
  ) {
    this.model = src.model;
    this.model.scale.setScalar(spec.scale);
    this.root.add(this.model);
    // Eigene Materialien je Gegner, damit nur der getroffene aufblitzt
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      m.emissive = new THREE.Color(0, 0, 0);
      m.emissiveIntensity = 1;
      mesh.material = m;
      this.mats.push(m);
    });
    this.motion = new Motion(this.model, src.clips);
    // Nicht alle im Gleichschritt
    this.motion.loop(spec.clips.walk);
    this.motion.update(Math.random() * 2);
  }

  flash() {
    this.flashT = 0.12;
  }

  strike() {
    this.motion.once(this.spec.clips.strike, 1.4);
  }

  update(_t: number, dt: number, moving: boolean) {
    const c = this.spec.clips;
    const p = this.pose;
    if (p !== this.shownPose || moving !== this.shownMoving) {
      if (p === 'dead') this.motion.last(c.death);
      else if (p === 'windup') this.motion.loop(c.windup);
      else if (p === 'scream') this.motion.loop(c.scream ?? c.windup);
      else if (p === 'stagger') {
        if (this.shownPose !== 'stagger' && c.hit) this.motion.once(c.hit);
        this.motion.loop(c.idle);
      } else this.motion.loop(moving ? c.walk : c.idle, moving ? 1.1 : 1);
      this.shownPose = p;
      this.shownMoving = moving;
    }
    this.motion.update(dt);
    if (p === 'dead') {
      this.deadT += dt;
      // Kriecher liegen schon: nur flach drücken. Danach langsam im Boden versinken.
      if (this.spec.low) this.model.rotation.z = Math.min(1, this.deadT * 3) * 0.5;
      this.model.position.y = -Math.max(0, this.deadT - 2.2) * 0.4;
    }
    if (this.flashT > 0) this.flashT -= dt;
    const f = Math.max(0, this.flashT) / 0.12;
    for (const m of this.mats) m.emissive.setScalar(f * 0.9);
  }

  dispose() {
    this.motion.stop();
    for (const m of this.mats) m.dispose();
  }
}

/** Gegnerfigur für den Kampf: aus dem Paket, sonst selbst gebaut. */
export function makeFoeRig(kind: FoeKind): FoeRig {
  if (usePack()) {
    const spec = FOES[kind];
    const src = skinnedClone(spec.file);
    if (src) return new PackFoeRig(spec, src);
  }
  return new ZombieRig(kind);
}

// --- Spielfigur ------------------------------------------------------------------------------

/** Was Kampf und Endstation von der Spielfigur brauchen. */
export interface PlayerRig {
  readonly root: THREE.Group;
  holdWeapon(kind: WeaponId | null): void;
  play(kind: CharacterAction): void;
  wave(): void;
  update(t: number, dt: number, moving: number): void;
  dispose(): void;
}

class PackPlayerRig implements PlayerRig {
  readonly root = new THREE.Group();
  private model: THREE.Object3D;
  private motion: Motion;
  private handItem: THREE.Object3D | null = null;
  private held: THREE.Object3D | null = null;
  private weapon: WeaponId | null = null;

  constructor(src: { model: THREE.Object3D; clips: THREE.AnimationClip[] }) {
    this.model = src.model;
    this.model.scale.setScalar(PLAYER.scale);
    this.root.add(this.model);
    this.handItem = this.model.getObjectByName(PLAYER.handItem) ?? null;
    if (this.handItem) this.handItem.visible = false;
    this.motion = new Motion(this.model, src.clips);
    this.motion.loop(PLAYER.clips.idle);
  }

  holdWeapon(kind: WeaponId | null) {
    this.weapon = kind;
    if (this.held) {
      this.held.removeFromParent();
      this.held.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
      this.held = null;
    }
    if (!this.handItem) return;
    // Der Knüppel aus dem Paket passt; Brechstange und Armbrust bauen wir an seine Stelle
    this.handItem.visible = kind === 'bat';
    if (kind === 'crowbar' || kind === 'crossbow') {
      const g = buildHeld(kind);
      g.position.copy(this.handItem.position);
      g.quaternion.copy(this.handItem.quaternion);
      this.handItem.parent?.add(g);
      this.held = g;
    }
  }

  play(kind: CharacterAction) {
    const c = PLAYER.clips;
    switch (kind) {
      case 'swing':
        return this.motion.once(this.weapon ? c.swing : c.fist, 1.5);
      case 'power':
        return this.motion.once(this.weapon ? c.swing : c.power, 1.1);
      case 'shove':
        return this.motion.once(c.shove, 1.4);
      case 'hurt':
        return this.motion.once(c.hurt, 1.2);
      case 'dodge':
        return this.motion.once(c.dodge, 2.6);
      case 'bandage':
        return this.motion.once(c.bandage, 1);
    }
  }

  wave() {
    this.motion.once(PLAYER.clips.wave, 1.1);
  }

  update(_t: number, dt: number, moving: number) {
    const c = PLAYER.clips;
    if (moving < 0.1) this.motion.loop(c.idle);
    else if (moving < 1.6) this.motion.loop(c.walk, Math.max(0.7, Math.min(1.3, moving * 1.05)));
    else this.motion.loop(c.run, Math.min(1.3, moving / 2.2));
    this.motion.update(dt);
  }

  dispose() {
    this.motion.stop();
    this.held?.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  }
}

/** Brechstange und Armbrust, in der Lage des Knüppels (Griff am Ursprung, Spitze nach +z). */
function buildHeld(kind: 'crowbar' | 'crossbow'): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0) => {
    const mesh = new THREE.Mesh(geo, mat(color, { pat: PAT.metal }));
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    g.add(mesh);
  };
  if (kind === 'crowbar') {
    add(new THREE.BoxGeometry(0.045, 0.045, 0.95), '#6e2e22', 0, 0, 0.3);
    add(new THREE.BoxGeometry(0.045, 0.045, 0.16), '#6e2e22', 0, 0.06, 0.8, 0.9);
  } else {
    add(new THREE.BoxGeometry(0.07, 0.07, 0.62), '#5a3f28', 0, 0, 0.2);
    add(new THREE.BoxGeometry(0.66, 0.04, 0.05), '#3b3f3a', 0, 0, 0.47);
    add(new THREE.BoxGeometry(0.64, 0.01, 0.01), '#d8d2c2', 0, 0, 0.44);
  }
  return g;
}

/** Spielfigur: aus dem Paket (nach Frisur), sonst selbst gebaut. */
export function makePlayerRig(look: Character['look']): PlayerRig {
  if (usePack()) {
    const src = skinnedClone(PLAYER.files[Math.abs(look.hair) % PLAYER.files.length]);
    if (src) return new PackPlayerRig(src);
  }
  return new CharacterRig(look);
}
