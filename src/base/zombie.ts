// Zombies als Low-Poly-Modelle mit Animationen: schlurfen, ausholen, zuschlagen,
// taumeln, kreischen, umfallen. Jeder Zombie hat eigene Materialien, damit er bei
// Treffern kurz weiß aufblitzen kann.

import * as THREE from 'three';
import type { FoeKind } from '../core/content';
import { softBox } from './softBox';

interface Look {
  skin: string;
  shirt: string;
  pants: string;
  scale: number;
  vest?: boolean;
  thin?: boolean;
}

const LOOKS: Record<FoeKind, Look> = {
  walker: { skin: '#8a9670', shirt: '#5a4a3a', pants: '#3a3f4a', scale: 1 },
  crawler: { skin: '#7f8a68', shirt: '#3a3530', pants: '#2e2a26', scale: 0.95 },
  brute: { skin: '#8a9a72', shirt: '#3a3f3a', pants: '#2f3440', scale: 1.32, vest: true },
  screamer: { skin: '#b0b49c', shirt: '#4a4250', pants: '#3a3440', scale: 1.02, thin: true },
};

export type ZombiePose = 'idle' | 'walk' | 'windup' | 'strike' | 'stagger' | 'scream' | 'dead';

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
  /** 0..1 Fortschritt beim Ausholen */
  windup = 0;
  private strikeT = 0;

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
    const w = L.thin ? 0.8 : 1;

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
    const eyes = new THREE.MeshBasicMaterial({ color: kind === 'screamer' ? '#ff6a4a' : '#e8d070' });
    for (const side of [-1, 1]) part(head, B(0.03, 0.02, 0.01), eyes, side * 0.045, 0.15, 0.125);
    part(head, B(kind === 'screamer' ? 0.07 : 0.06, kind === 'screamer' ? 0.07 : 0.03, 0.02), m('#1a0f0d'), 0, 0.06, 0.12);
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
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
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
    this.phase += dt * (moving ? (crawl ? 11 : 6) : 1.5);
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
    this.torso.rotation.x = lean;
    this.torso.rotation.z = Math.sin(this.phase * 0.5) * 0.08;
    this.head.rotation.x = headX;
    this.head.rotation.z = 0.25 + Math.sin(t * 1.3 + this.phase) * 0.06;
    this.armL.rotation.set(armX + s * 0.15, 0, armSpread);
    this.armR.rotation.set(armX - s * 0.15, 0, -armSpread);
    this.legL.rotation.x = s * legSwing;
    this.legR.rotation.x = -s * legSwing;
    this.body.position.y = bodyY + (moving ? Math.abs(Math.cos(this.phase)) * 0.04 : 0);
    this.body.rotation.z = moving ? Math.sin(this.phase) * 0.06 : 0;
    // Tot: nach hinten umkippen und langsam versinken
    if (p === 'dead') {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.45);
      this.root.rotation.x = -k * (Math.PI / 2) * 0.95;
      this.root.position.y = -Math.max(0, this.deadT - 2.2) * 0.4;
    }
    if (this.flashT > 0) this.flashT -= dt;
    const f = Math.max(0, this.flashT) / 0.12;
    for (const mm of this.mats) mm.emissive.setScalar(f * 0.9);
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const mm of this.mats) mm.dispose();
  }
}
