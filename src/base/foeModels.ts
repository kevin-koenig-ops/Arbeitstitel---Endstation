// Fertige 3D-Modelle für besondere Gegner (z. B. den Bleichen Wächter).
// Ohne Skelett: Bewegung kommt aus dem Code (Atmen, Vorspringen, Taumeln, Umfallen).
// Bis das Modell geladen ist, steht die einfache Klötzchen-Figur da.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FoeKind } from '../core/types';
import watcherUrl from '../assets/models/watcher.glb?url';

/** Datei und Größe in Metern (Füße bei 0, Blick nach +z). */
const MODELS: Partial<Record<FoeKind, { url: string; height: number }>> = {
  watcher: { url: watcherUrl, height: 1.8 },
};

const cache = new Map<string, Promise<THREE.Object3D>>();

export function hasFoeModel(kind: FoeKind): boolean {
  return !!MODELS[kind];
}

/** Lädt das Modell (einmal) und gibt eine eigene Kopie mit eigenen Materialien zurück. */
export function loadFoeModel(kind: FoeKind): Promise<THREE.Object3D> | null {
  const def = MODELS[kind];
  if (!def) return null;
  let p = cache.get(def.url);
  if (!p) {
    p = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(def.url)
      .then((g) => {
        const m = g.scene;
        // Auf die gewünschte Größe bringen, Füße auf den Boden, mittig
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const s = def.height / Math.max(0.001, size.y);
        m.scale.setScalar(s);
        const c = box.getCenter(new THREE.Vector3());
        m.position.set(-c.x * s, -box.min.y * s, -c.z * s);
        const holder = new THREE.Group();
        holder.add(m);
        return holder;
      });
    cache.set(def.url, p);
    // Fehlschlag nicht merken, damit ein neuer Versuch möglich ist
    p.catch(() => cache.delete(def.url));
  }
  return p.then((src) => {
    const copy = src.clone(true);
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = (mesh.material as THREE.Material).clone();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return copy;
  });
}
