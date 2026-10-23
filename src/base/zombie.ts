// Zombies als Low-Poly-Modelle mit Animationen: schlurfen, ausholen, zuschlagen,
// taumeln, kreischen, umfallen. Jeder Zombie hat eigene Materialien, damit er bei
// Treffern kurz weiß aufblitzen kann.

import * as THREE from 'three';
import type { FoeKind } from '../core/content';
import { softBox } from './softBox';
import { loadFoeModel } from './foeModels';

interface Look {
  skin: string;
  shirt: string;
  pants: string;
  scale: number;
  vest?: boolean;
  thin?: boolean;
  /** Breiter gebaut (Hüne, Brüller). */
  wide?: number;
}

const LOOKS: Record<FoeKind, Look> = {
  walker: { skin: '#8a9670', shirt: '#5a4a3a', pants: '#3a3f4a', scale: 1 },
  crawler: { skin: '#7f8a68', shirt: '#3a3530', pants: '#2e2a26', scale: 0.95 },
  brute: { skin: '#8a9a72', shirt: '#3a3f3a', pants: '#2f3440', scale: 1.32, vest: true },
  screamer: { skin: '#b0b49c', shirt: '#4a4250', pants: '#3a3440', scale: 1.02, thin: true },
  // Ersatz, bis das echte Modell geladen ist: bleich und dürr
  watcher: { skin: '#ddd3c6', shirt: '#cfc5b8', pants: '#bdb2a4', scale: 1.0, thin: true },
  // Wirte aus dem Bestiarium (Klötzchen, bis es Modelle gibt)
  habit: { skin: '#9aa284', shirt: '#3e5570', pants: '#2c3440', scale: 1 },
  leader: { skin: '#8d9573', shirt: '#6a3a2a', pants: '#3a3a36', scale: 1.06 },
  giant: { skin: '#a29c80', shirt: '#4a5a6a', pants: '#3a4450', scale: 1.5, wide: 1.25 },
  sleeper: { skin: '#868e6c', shirt: '#4a4a3e', pants: '#34322c', scale: 1 },
  ramhead: { skin: '#8a9670', shirt: '#4e3e30', pants: '#363a40', scale: 1.04 },
  frozen: { skin: '#b9c6cc', shirt: '#56606a', pants: '#3c444c', scale: 1 },
  hoarder: { skin: '#8f9474', shirt: '#5a5236', pants: '#3a3428', scale: 0.96 },
  bellower: { skin: '#b4b49e', shirt: '#4a3e48', pants: '#36303a', scale: 1.14, wide: 1.2 },
};

export type ZombiePose = 'idle' | 'walk' | 'windup' | 'strike' | 'stagger' | 'scream' | 'dead' | 'sleep' | 'frozen';

export class ZombieRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private armL!: THREE.Group;
  private armR!: THREE.Group;
  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private mats: THREE.MeshStandardMaterial[] = [];
  private flashT = 0;
  private phase = Math.random() * 6;
  private deadT = 0;
  pose: ZombiePose = 'walk';
  /** Fertiges 3D-Modell statt Klötzchen (falls es eins gibt). */
  private model: THREE.Group | null = null;
  private disposed = false;
  /** 0..1 Fortschritt beim Ausholen */
  windup = 0;
  private strikeT = 0;
  /** 0..1: liegt (Schläfer), weich überblendet beim Aufwachen */
  private lieK = 0;

  constructor(readonly kind: FoeKind) {
    const L = LOOKS[kind];
    this.root.add(this.body);
    this.body.scale.setScalar(L.scale);
    const m = (c: string, rough = 0.9) => {
      const mm = new THREE.MeshStandardMaterial({ color: c, roughness: rough, flatShading: true, emissive: '#000000' });
      this.mats.push(mm);
      return mm;
    };
    const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const pivot = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const B = (w: number, h: number, d: number) => softBox(w, h, d, 0.4, 0.06);
    const skin = m(L.skin, 0.8);
    const w = (L.thin ? 0.8 : 1) * (L.wide ?? 1);

    for (const side of [-1, 1]) {
      const leg = pivot(this.body, side * 0.1, 0.84);
      part(leg, B(0.15 * w, 0.48, 0.16), m(L.pants), 0, -0.24, 0);
      part(leg, B(0.13 * w, 0.34, 0.14), m(L.pants), 0, -0.62, 0.02);
      part(leg, B(0.14, 0.08, 0.24), m('#2a2420'), 0, -0.8, 0.05);
      if (side < 0) this.legL = leg;
      else this.legR = leg;
    }
    part(this.body, B(0.34 * w, 0.16, 0.2), m(L.pants), 0, 0.9, 0);
    const torso = pivot(this.body, 0, 0.97);
    this.torso = torso;
    const chest = part(torso, new THREE.CylinderGeometry(0.24 * w, 0.2 * w, 0.56, 6, 1), m(L.shirt), 0, 0.28, 0);
    chest.scale.set(1, 1, 0.66);
    chest.rotation.y = Math.PI / 6;
    // Risse im Hemd: Haut schaut durch
    part(torso, B(0.1, 0.12, 0.02), skin, 0.06, 0.2, 0.135);
    part(torso, B(0.06, 0.16, 0.02), m('#4a1f1a'), -0.08, 0.34, 0.135);
    if (L.vest) {
      part(torso, B(0.44, 0.42, 0.3), m('#e07a1a', 0.7), 0, 0.3, 0);
      for (const y of [0.18, 0.36]) part(torso, B(0.45, 0.04, 0.31), m('#d8d8c8', 0.4), 0, y, 0);
    }
    part(torso, new THREE.CylinderGeometry(0.05, 0.055, 0.09, 8), skin, 0, 0.6, 0);
    const head = pivot(torso, 0, 0.63, 0.03);
    this.head = head;
    const skull = part(head, new THREE.IcosahedronGeometry(0.13, 1), skin, 0, 0.13, 0);
    skull.scale.set(0.95, 1.1, 1);
    const loud = kind === 'screamer' || kind === 'bellower';
    const eyes = new THREE.MeshBasicMaterial({ color: loud ? '#ff6a4a' : kind === 'frozen' ? '#bfe6ff' : '#e8d070' });
    for (const side of [-1, 1]) part(head, B(0.03, 0.02, 0.01), eyes, side * 0.045, 0.15, 0.125);
    part(head, B(loud ? 0.07 : 0.06, loud ? 0.07 : 0.03, 0.02), m('#1a0f0d'), 0, 0.06, 0.12);
    // ein paar Haarsträhnen
    part(head, B(0.2, 0.04, 0.18), m('#2a2620'), 0, 0.25, -0.02).rotation.z = 0.2;

    for (const side of [-1, 1]) {
      const arm = pivot(torso, side * 0.2 * w + side * 0.02, 0.5);
      const len = L.thin ? 1.25 : 1;
      part(arm, B(0.1, 0.3 * len, 0.11), m(L.shirt), 0, -0.15 * len, 0);
      part(arm, B(0.09, 0.27 * len, 0.1), skin, 0, -0.43 * len, 0);
      part(arm, B(0.09, 0.1, 0.07), skin, 0, -0.62 * len, 0.01);
      if (side < 0) this.armL = arm;
      else this.armR = arm;
    }
    // Blutige Tränenspuren unter den Augen (Lore: das Weinen)
    const tears = m('#5a1414', 0.9);
    for (const side of [-1, 1]) part(head, B(0.012, 0.05, 0.006), tears, side * 0.045, 0.115, 0.128);
    if (kind === 'brute') {
      // Kalkplatten auf Schultern, Rücken und Arm: das Kalzium aus den Knochen lagert sich unter der Haut ab
      const crust = m('#8f8c84', 1);
      for (const side of [-1, 1]) {
        const p1 = part(torso, B(0.2, 0.08, 0.22), crust, side * 0.2, 0.56, 0);
        p1.rotation.z = side * 0.35;
      }
      part(torso, B(0.36, 0.36, 0.06), crust, 0, 0.32, -0.16).rotation.x = 0.12;
      part(this.armL, B(0.13, 0.22, 0.13), crust, 0, -0.18, 0);
      part(head, B(0.12, 0.05, 0.1), crust, 0.04, 0.22, -0.03).rotation.z = -0.25;
    }
    this.addExtras(kind, head, torso, part, m, B);

    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
    void loadFoeModel(kind)
      ?.then((m) => this.useModel(m))
      .catch(() => undefined);
  }

  /** Was die Wirte aus dem Bestiarium ausmacht: Mütze und Tasche, Glocke, Kalkhelm, Rucksack, Raureif … */
  private addExtras(
    kind: FoeKind,
    head: THREE.Group,
    torso: THREE.Group,
    part: (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh,
    m: (c: string, rough?: number) => THREE.MeshStandardMaterial,
    B: (w: number, h: number, d: number) => THREE.BufferGeometry,
  ) {
    if (kind === 'habit') {
      // Gewohnheitstier: Schirmmütze und Umhängetasche, wie auf seiner alten Runde
      const cap = m('#2e4058');
      part(head, new THREE.CylinderGeometry(0.14, 0.14, 0.07, 10), cap, 0, 0.27, 0);
      part(head, B(0.16, 0.02, 0.1), cap, 0, 0.24, 0.12);
      part(torso, B(0.06, 0.62, 0.02), m('#3a2a1e'), 0.02, 0.32, 0.13).rotation.z = 0.6;
      part(torso, B(0.26, 0.22, 0.1), m('#5a3e26'), 0.24, 0.02, 0.06);
    } else if (kind === 'leader') {
      // Leithammel: eine alte Kuhglocke am Hals, ein roter Schal
      part(torso, new THREE.CylinderGeometry(0.035, 0.05, 0.08, 8), m('#b08a3a', 0.4), 0, 0.5, 0.15);
      part(torso, B(0.3, 0.07, 0.24), m('#9a2a22'), 0, 0.58, 0);
    } else if (kind === 'giant') {
      // Hüne: Latzhose, riesige Hände
      part(torso, B(0.36, 0.3, 0.27), m('#3c4c60'), 0, 0.18, 0);
      for (const arm of [this.armL, this.armR]) part(arm, B(0.16, 0.14, 0.12), m('#a29c80', 0.8), 0, -0.68, 0.01);
    } else if (kind === 'sleeper') {
      // Schläfer: Kapuze über dem Kopf
      part(head, B(0.3, 0.26, 0.28), m('#3e3e34'), 0, 0.15, -0.04);
    } else if (kind === 'ramhead') {
      // Kalkkopf: der Kalk wächst wie ein Helm über Stirn und Schädel
      const crust = m('#9a978e', 1);
      part(head, B(0.3, 0.14, 0.3), crust, 0, 0.24, 0);
      part(head, B(0.28, 0.06, 0.08), crust, 0, 0.2, 0.12);
      part(head, B(0.1, 0.1, 0.1), crust, 0.12, 0.28, -0.05).rotation.z = 0.4;
    } else if (kind === 'frozen') {
      // Erstarrter: Raureif auf Schultern, Kopf und Armen
      const frost = m('#e8f2f6', 0.5);
      for (const side of [-1, 1]) part(torso, B(0.18, 0.05, 0.2), frost, side * 0.18, 0.56, 0);
      part(head, B(0.2, 0.04, 0.18), frost, 0, 0.27, -0.01);
      part(this.armL, B(0.11, 0.08, 0.12), frost, 0, -0.08, 0);
      part(this.armR, B(0.11, 0.08, 0.12), frost, 0, -0.3, 0);
    } else if (kind === 'hoarder') {
      // Hamsterer: vollgestopfter Rucksack, Beutel hängen dran
      part(torso, B(0.42, 0.5, 0.26), m('#4a5a3a'), 0, 0.3, -0.24);
      part(torso, B(0.16, 0.16, 0.14), m('#7a6a4a'), -0.22, 0.08, -0.2);
      part(torso, B(0.14, 0.18, 0.12), m('#8a4a3a'), 0.22, 0.1, -0.18);
      part(torso, B(0.2, 0.08, 0.2), m('#3a3a3a'), 0, 0.6, -0.24);
    } else if (kind === 'bellower') {
      // Brüller: riesiger Brustkorb, geschwollener Hals
      part(torso, new THREE.SphereGeometry(0.24, 8, 6), m('#4a3e48'), 0, 0.32, 0.08).scale.set(1.2, 1, 0.9);
      part(torso, new THREE.CylinderGeometry(0.09, 0.11, 0.1, 8), m('#b4a89e', 0.8), 0, 0.6, 0.02);
    }
  }

  /** Das fertige Modell einsetzen: die Klötzchen-Teile verschwinden. */
  private useModel(m: THREE.Object3D) {
    if (this.disposed) return;
    for (const c of this.body.children) c.visible = false;
    this.model = new THREE.Group();
    this.model.add(m);
    this.body.add(this.model);
    m.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if ((o as THREE.Mesh).isMesh && mat && 'emissive' in mat) this.mats.push(mat);
    });
  }

  /** Kurz weiß aufblitzen (Treffer). */
  flash() {
    this.flashT = 0.12;
  }

  strike() {
    this.strikeT = 0.25;
  }

  update(t: number, dt: number, moving: boolean) {
    const crawl = this.kind === 'crawler';
    // Steif vor Kälte: keine Bewegung, kein Atmen
    const stiff = this.pose === 'frozen';
    this.phase += stiff ? 0 : dt * (moving ? (crawl ? 11 : 6) : 1.5);
    const s = Math.sin(this.phase);
    // Grundhaltung: gebückt, Arme nach vorn
    let lean = crawl ? 1.05 : 0.22;
    let armX = crawl ? -1.2 : -1.35;
    let armSpread = 0.1;
    let headX = crawl ? -0.9 : 0.15;
    let bodyY = crawl ? -0.38 : 0;
    let legSwing = moving ? (crawl ? 0.5 : 0.45) : 0.05;
    const p = this.pose;
    if (p === 'windup' || p === 'scream') {
      const k = this.windup;
      if (p === 'scream') {
        headX = -0.6 * k;
        armX = -0.4 - 0.4 * k;
        armSpread = 0.2 + 1.0 * k;
        lean = -0.15 * k;
      } else {
        armX = -1.35 - 1.3 * k;
        lean = 0.22 - 0.35 * k;
        armSpread = 0.1 + 0.15 * k;
      }
      legSwing = 0.03;
    }
    if (this.strikeT > 0) {
      this.strikeT -= dt;
      const k = Math.max(0, this.strikeT / 0.25);
      armX = -1.0 + 0.6 * (1 - k);
      lean = 0.55 * k + 0.2;
    }
    if (p === 'stagger') {
      lean = -0.35 + Math.sin(t * 18) * 0.05;
      armX = -0.4;
      armSpread = 0.5;
      legSwing = 0.1;
    }
    if (stiff) {
      // Erstarrt: Arme halb gehoben, alles steht still
      armX = -0.9;
      armSpread = 0.15;
      lean = 0.1;
      legSwing = 0;
    }
    // Schläfer: liegt auf der Seite, beim Aufwachen rappelt er sich auf
    this.lieK += ((p === 'sleep' ? 1 : 0) - this.lieK) * Math.min(1, dt * 4);
    if (this.lieK > 0.01) {
      armX = armX * (1 - this.lieK) - 0.2 * this.lieK;
      legSwing *= 1 - this.lieK;
    }
    this.torso.rotation.x = lean;
    this.torso.rotation.z = Math.sin(this.phase * 0.5) * 0.08;
    this.head.rotation.x = headX;
    this.head.rotation.z = 0.25 + Math.sin(t * 1.3 + this.phase) * 0.06;
    this.armL.rotation.set(armX + s * 0.15, 0, armSpread);
    this.armR.rotation.set(armX - s * 0.15, 0, -armSpread);
    this.legL.rotation.x = s * legSwing;
    this.legR.rotation.x = -s * legSwing;
    this.body.position.y = bodyY + (moving ? Math.abs(Math.cos(this.phase)) * 0.04 : 0) + this.lieK * 0.14;
    this.body.rotation.z = moving ? Math.sin(this.phase) * 0.06 : 0;
    // Liegen: nach hinten kippen (Kopf vom Spieler weg), so sieht die Kamera ihn von der Seite
    this.body.rotation.x = -this.lieK * 1.5;
    if (stiff) this.torso.rotation.z = 0;
    // Tot: nach hinten umkippen und langsam versinken
    if (p === 'dead') {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.45);
      this.root.rotation.x = -k * (Math.PI / 2) * 0.95;
      this.root.position.y = -Math.max(0, this.deadT - 2.2) * 0.4;
    }
    // Fertiges Modell ohne Gelenke: der ganze Körper atmet, beugt sich vor, springt, taumelt
    if (this.model) {
      const breathe = Math.sin(t * 2.1 + this.phase) * 0.012;
      let tilt = 0;
      let fwd = 0;
      if (p === 'windup' || p === 'scream') tilt = -0.25 * this.windup;
      if (this.strikeT > 0) {
        const k = Math.max(0, this.strikeT / 0.25);
        tilt = 0.3 * k;
        fwd = 0.45 * k;
      }
      if (p === 'stagger') tilt = -0.28 + Math.sin(t * 18) * 0.04;
      this.model.rotation.x = tilt;
      this.model.rotation.y = Math.sin(t * 0.7 + this.phase) * 0.12;
      this.model.position.z = fwd;
      this.model.scale.set(1, 1 + breathe, 1);
    }
    if (this.flashT > 0) this.flashT -= dt;
    const f = Math.max(0, this.flashT) / 0.12;
    for (const mm of this.mats) mm.emissive.setScalar(f * 0.9);
  }

  dispose() {
    this.disposed = true;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const mm of this.mats) mm.dispose();
  }
}
