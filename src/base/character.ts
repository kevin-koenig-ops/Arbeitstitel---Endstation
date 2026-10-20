// Die Spielfigur als Low-Poly-Modell: Frisur, Hautton und Jacke aus der Charaktererstellung.
// Wird überall gleich benutzt: Charaktererstellung, Karte und Endstation.
// Die Figur schaut nach +z, die Füße stehen auf y = 0. Maße in Metern (~1,75 m groß).

import * as THREE from 'three';
import { HAIR_COLOR, JACKET_COLORS, SKIN_TONES } from '../core/content';
import type { Character, WeaponId } from '../core/types';

type Look = Character['look'];

const mats = new Map<string, THREE.MeshStandardMaterial>();
function m(color: string, rough = 0.85): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}`;
  let mm = mats.get(key);
  if (!mm) {
    mm = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02, flatShading: true });
    mats.set(key, mm);
  }
  return mm;
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

function pivot(parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export type CharacterAction = 'swing' | 'power' | 'shove' | 'hurt' | 'bandage' | 'dodge';

const TROUSERS = '#3a3f4a';
const SHOES = '#2e241b';
const PACK = '#56603f';

export class CharacterRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private foreL!: THREE.Group;
  private foreR!: THREE.Group;
  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private phase = 0;
  private speed = 0;
  private waveT = -1;
  private action: { kind: CharacterAction; t: number; dur: number } | null = null;
  private held: THREE.Group | null = null;
  /** Aufladen (0..1) oder null: Waffe hoch über dem Kopf */
  charging: number | null = null;

  constructor(look: Look) {
    this.root.add(this.body);
    this.build(look);
  }

  private build(look: Look) {
    const jacket = JACKET_COLORS[look.color % JACKET_COLORS.length];
    const jacketDark = shade(jacket, 0.7);
    const skin = SKIN_TONES[(look.skin ?? 0) % SKIN_TONES.length];
    const b = this.body;

    // Beine (Drehpunkt an der Hüfte)
    for (const side of [-1, 1]) {
      const leg = pivot(b, side * 0.095, 0.86);
      part(leg, B(0.15, 0.5, 0.17), m(TROUSERS), 0, -0.25, 0);
      part(leg, B(0.14, 0.34, 0.15), m(shade(TROUSERS, 0.92)), 0, -0.64, 0);
      part(leg, B(0.15, 0.09, 0.27), m(SHOES), 0, -0.815, 0.045);
      if (side < 0) this.legL = leg;
      else this.legR = leg;
    }
    // Hüfte und Gürtel
    part(b, B(0.34, 0.16, 0.21), m(TROUSERS), 0, 0.93, 0);
    part(b, B(0.35, 0.04, 0.22), m('#2a2420'), 0, 1.0, 0);

    // Oberkörper (Drehpunkt an der Taille)
    const torso = pivot(b, 0, 1.0);
    this.torso = torso;
    const chest = part(torso, new THREE.CylinderGeometry(0.235, 0.195, 0.56, 4, 1), m(jacket), 0, 0.28, 0);
    chest.rotation.y = Math.PI / 4;
    chest.scale.set(1, 1, 0.62);
    part(torso, B(0.36, 0.1, 0.23), m(jacket), 0, 0.05, 0); // Jackensaum
    part(torso, B(0.24, 0.07, 0.21), m(jacketDark), 0, 0.56, -0.005); // Kragen
    part(torso, B(0.016, 0.46, 0.012), m(shade(jacket, 1.35)), 0, 0.28, 0.122); // Reißverschluss
    for (const side of [-1, 1]) part(torso, B(0.09, 0.08, 0.012), m(jacketDark), side * 0.085, 0.13, 0.122); // Taschen
    // Rucksack mit Riemen
    part(torso, B(0.28, 0.36, 0.14), m(PACK), 0, 0.32, -0.19);
    part(torso, B(0.22, 0.1, 0.03), m(shade(PACK, 0.8)), 0, 0.22, -0.27);
    const roll = part(torso, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), m('#7a6a52'), 0, 0.54, -0.19);
    roll.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) part(torso, B(0.04, 0.3, 0.012), m('#2a2420'), side * 0.09, 0.38, 0.122);

    // Hals und Kopf
    part(torso, new THREE.CylinderGeometry(0.05, 0.055, 0.09, 6), m(skin), 0, 0.6, 0);
    const head = pivot(torso, 0, 0.63);
    this.head = head;
    const skull = part(head, new THREE.IcosahedronGeometry(0.13, 2), m(skin, 0.75), 0, 0.13, 0.005);
    skull.scale.set(0.95, 1.08, 1.0);
    part(head, B(0.04, 0.055, 0.04), m(shade(skin, 0.9)), 0, 0.12, 0.13); // Nase
    part(head, B(0.06, 0.012, 0.01), m(shade(skin, 0.6)), 0, 0.068, 0.124); // Mund
    for (const side of [-1, 1]) {
      part(head, B(0.05, 0.014, 0.012), m(HAIR_COLOR), side * 0.047, 0.183, 0.124); // Augenbrauen
      part(head, B(0.028, 0.028, 0.012), m('#1d1a17'), side * 0.045, 0.148, 0.122); // Augen
      part(head, B(0.03, 0.05, 0.04), m(shade(skin, 0.92)), side * 0.127, 0.13, 0); // Ohren
    }
    this.buildHair(head, look, jacket);

    // Arme (Drehpunkt an der Schulter, Ellbogen dazwischen)
    for (const side of [-1, 1]) {
      const arm = pivot(torso, side * 0.205, 0.5);
      arm.rotation.z = side * 0.09;
      part(arm, B(0.105, 0.3, 0.115), m(jacket), 0, -0.15, 0);
      const fore = pivot(arm, 0, -0.3);
      part(fore, B(0.095, 0.25, 0.105), m(jacket), 0, -0.125, 0);
      part(fore, B(0.1, 0.035, 0.11), m(jacketDark), 0, -0.235, 0); // Bündchen
      part(fore, B(0.08, 0.09, 0.07), m(skin), 0, -0.3, 0.005);
      if (side < 0) {
        this.armL = arm;
        this.foreL = fore;
      } else {
        this.armR = arm;
        this.foreR = fore;
      }
    }
  }

  private buildHair(head: THREE.Group, look: Look, jacket: string) {
    const hair = m(HAIR_COLOR, 0.95);
    const cap = (r: number, mat: THREE.Material, tilt = -0.42, open = 0.6) => {
      const c = part(head, new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI * open), mat, 0, 0.14, -0.012);
      c.rotation.x = tilt;
      c.scale.set(0.98, 1.05, 1.04);
      return c;
    };
    switch (look.hair % 4) {
      case 0: // Kurz
        cap(0.142, hair);
        break;
      case 1: // Lang
        cap(0.145, hair);
        part(head, B(0.27, 0.3, 0.08), hair, 0, 0.03, -0.105);
        for (const side of [-1, 1]) part(head, B(0.05, 0.22, 0.13), hair, side * 0.125, 0.06, -0.03);
        break;
      case 2: {
        // Zopf
        cap(0.143, hair);
        let y = 0.17;
        for (let i = 0; i < 4; i++) {
          const s = 0.075 - i * 0.008;
          part(head, B(s, 0.08, s), hair, 0, y, -0.15 - i * 0.012);
          y -= 0.075;
        }
        part(head, B(0.06, 0.025, 0.06), m(jacket), 0, 0.2, -0.145);
        break;
      }
      default: {
        // Mütze
        const beanie = m(shade(jacket, 0.55), 0.95);
        cap(0.152, beanie, -0.12, 0.5);
        const band = part(head, new THREE.CylinderGeometry(0.156, 0.156, 0.06, 14), m(shade(jacket, 0.45), 0.95), 0, 0.165, -0.01);
        band.rotation.x = -0.12;
        part(head, new THREE.IcosahedronGeometry(0.045, 1), beanie, 0, 0.32, -0.035);
        part(head, B(0.27, 0.07, 0.08), hair, 0, 0.1, -0.11); // Haare unter der Mütze
      }
    }
  }

  /** Winken (z. B. nach dem Aufstellen eines Teils). */
  wave() {
    this.waveT = 0;
  }

  /** Waffe in die rechte Hand nehmen (null = Fäuste). */
  holdWeapon(kind: WeaponId | null) {
    if (this.held) {
      this.foreR.remove(this.held);
      this.held.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
      this.held = null;
    }
    if (!kind) return;
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m(color, 0.6));
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      mesh.castShadow = true;
      g.add(mesh);
    };
    if (kind === 'crowbar') {
      add(new THREE.BoxGeometry(0.035, 0.8, 0.035), '#6e2e22', 0, -0.25, 0.06);
      add(new THREE.BoxGeometry(0.035, 0.14, 0.035), '#6e2e22', 0, 0.16, 0.11, 0.9);
    } else if (kind === 'bat') {
      add(new THREE.CylinderGeometry(0.05, 0.025, 0.85, 10), '#8a6a45', 0, -0.22, 0.06);
      for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.11, 0.012, 0.012), '#9a9a94', 0, -0.4 - i * 0.05, 0.06, 0, i * 0.7);
    } else {
      add(new THREE.BoxGeometry(0.06, 0.06, 0.6), '#5a3f28', 0, -0.06, 0.2);
      add(new THREE.BoxGeometry(0.62, 0.035, 0.05), '#3b3f3a', 0, -0.06, 0.45);
      add(new THREE.BoxGeometry(0.6, 0.008, 0.008), '#d8d2c2', 0, -0.06, 0.42);
    }
    g.position.set(0, -0.32, 0);
    g.rotation.x = kind === 'crossbow' ? 1.4 : 1.2;
    this.foreR.add(g);
    this.held = g;
  }

  /** Eine Bewegung abspielen (Kampf). */
  play(kind: CharacterAction) {
    const dur = { swing: 0.32, power: 0.5, shove: 0.38, hurt: 0.3, bandage: 2, dodge: 0.45 }[kind];
    this.action = { kind, t: 0, dur };
  }

  /**
   * Animation fortschreiben.
   * @param t Zeit in Sekunden
   * @param dt Schritt in Sekunden
   * @param moving 0 = steht, 1 = läuft
   */
  update(t: number, dt: number, moving: number) {
    this.speed += (moving - this.speed) * Math.min(1, dt * 8);
    const sp = this.speed;
    this.phase += dt * 10 * sp;
    const s = Math.sin(this.phase);
    const breathe = Math.sin(t * 2.1) * (1 - sp);
    this.legL.rotation.x = s * 0.62 * sp;
    this.legR.rotation.x = -s * 0.62 * sp;
    this.armL.rotation.x = -s * 0.55 * sp + breathe * 0.03;
    this.armR.rotation.x = s * 0.55 * sp - breathe * 0.03;
    this.foreL.rotation.x = -0.25 - 0.35 * sp * (0.5 + 0.5 * Math.max(0, -s));
    this.foreR.rotation.x = -0.25 - 0.35 * sp * (0.5 + 0.5 * Math.max(0, s));
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.04 * sp;
    this.torso.rotation.y = s * 0.09 * sp;
    this.torso.rotation.x = 0.06 * sp;
    this.torso.scale.y = 1 + breathe * 0.012;
    // Im Stehen schaut die Figur sich ab und zu um
    const look = Math.sin(t * 0.43) * Math.sin(t * 0.17 + 1.3);
    this.head.rotation.y = look * 0.55 * (1 - sp);
    this.head.rotation.x = Math.sin(t * 0.31) * 0.05 * (1 - sp);
    // Kampfbewegungen über die Grundhaltung legen
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      switch (a.kind) {
        case 'swing':
          this.armR.rotation.x = k < 0.35 ? -2.7 * (k / 0.35) : -2.7 + 3.2 * ((k - 0.35) / 0.65);
          this.torso.rotation.y = k < 0.35 ? -0.4 * (k / 0.35) : 0.5 * Math.sin(((k - 0.35) / 0.65) * Math.PI);
          this.foreR.rotation.x = -0.6;
          break;
        case 'power':
          this.armR.rotation.x = k < 0.45 ? -3.0 * (k / 0.45) : -3.0 + 3.6 * ((k - 0.45) / 0.55);
          this.armL.rotation.x = this.armR.rotation.x * 0.8;
          this.torso.rotation.x = k < 0.45 ? -0.2 : 0.35 * Math.sin(((k - 0.45) / 0.55) * Math.PI);
          break;
        case 'shove':
          this.armL.rotation.x = this.armR.rotation.x = -1.5 * Math.sin(k * Math.PI);
          this.torso.rotation.x = 0.3 * Math.sin(k * Math.PI);
          break;
        case 'hurt':
          this.torso.rotation.x = -0.35 * Math.sin(k * Math.PI);
          this.head.rotation.x = -0.4 * Math.sin(k * Math.PI);
          break;
        case 'bandage':
          this.armL.rotation.x = this.armR.rotation.x = -0.9 + Math.sin(a.t * 12) * 0.1;
          this.foreL.rotation.x = this.foreR.rotation.x = -1.2;
          this.head.rotation.x = 0.4;
          break;
        case 'dodge':
          this.body.position.y = -0.25 * Math.sin(k * Math.PI);
          this.torso.rotation.x = 0.5 * Math.sin(k * Math.PI);
          break;
      }
      if (a.t >= a.dur) this.action = null;
    }
    if (this.charging !== null) {
      const k = Math.min(1, this.charging * 1.6);
      const tremble = this.charging >= 0.95 ? Math.sin(t * 60) * 0.04 : 0;
      this.armR.rotation.x = -2.7 * k + tremble;
      this.armL.rotation.x = -2.2 * k;
      this.torso.rotation.y = -0.45 * k;
      this.torso.rotation.x = -0.12 * k;
    }
    // Winken mit dem rechten Arm
    if (this.waveT >= 0) {
      this.waveT += dt;
      const k = Math.min(1, this.waveT * 4) * Math.min(1, Math.max(0, (1.6 - this.waveT) * 4));
      this.armR.rotation.x = -2.6 * k + this.armR.rotation.x * (1 - k);
      this.armR.rotation.z = 0.09 + 0.35 * k;
      this.foreR.rotation.z = Math.sin(this.waveT * 14) * 0.5 * k;
      if (this.waveT > 1.6) {
        this.waveT = -1;
        this.armR.rotation.z = 0.09;
        this.foreR.rotation.z = 0;
      }
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
  }
}

/** Weicher Schatten unter den Füßen (für Ansichten ohne Schattenwurf). */
export function blobShadow(radius = 0.42, opacity = 0.35): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(0,0,0,${opacity})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.005;
  return mesh;
}
