// Fertige Natur-Modelle für die Karte: Steine, Farn, Gras und Pilze aus dem
// „Stylized Nature MegaKit“ von Quaternius (CC0, frei nutzbar, auch kommerziell).
// Zusammengestellt und verkleinert mit scripts/natur-modelle.mjs (ein Modell pro Knoten,
// Fuß bei y = 0, Größe in Metern).

import * as THREE from 'three';
import url from '../assets/models/natur.glb?url';

export interface ModelPart {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

/** Name im Modell (rock_1, fern, mushroom_2, …) → Teile, je Material eins. */
export type NatureModels = Map<string, ModelPart[]>;

/** Kompakt gespeicherte Werte (ganze Zahlen) in normale Kommazahlen umwandeln. */
function toFloat(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const n = attr.count;
  const size = attr.itemSize;
  const out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    out[i * size] = attr.getX(i);
    if (size > 1) out[i * size + 1] = attr.getY(i);
    if (size > 2) out[i * size + 2] = attr.getZ(i);
    if (size > 3) out[i * size + 3] = attr.getW(i);
  }
  return new THREE.BufferAttribute(out, size);
}

/**
 * Farn und Gras haben Normalen für besondere Shader; mit einfachem Licht werden sie fleckig
 * dunkel. Deshalb Normalen fast senkrecht nach oben: hell wie der Boden darunter.
 */
function foliageNormals(name: string, geo: THREE.BufferGeometry) {
  if (name !== 'fern' && name !== 'grass') return;
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) * 0.25, 1, pos.getZ(i) * 0.25).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  nrm.needsUpdate = true;
}

export async function loadNatureModels(): Promise<NatureModels> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const mats = new Map<THREE.Material, THREE.Material>();
  const out: NatureModels = new Map();
  for (const root of gltf.scene.children) {
    const parts: ModelPart[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', toFloat(mesh.geometry.getAttribute('position')));
      geo.setAttribute('normal', toFloat(mesh.geometry.getAttribute('normal')));
      geo.setAttribute('uv', toFloat(mesh.geometry.getAttribute('uv')));
      if (mesh.geometry.index) geo.setIndex(mesh.geometry.index.clone());
      // Knoten-Verschiebung und -Größe gleich in die Ecken einrechnen
      geo.applyMatrix4(mesh.matrixWorld);
      foliageNormals(root.name, geo);
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      let mat = mats.get(src);
      if (!mat) {
        // Einfaches Licht wie bei den anderen Bäumen; Blätter mit ausgeschnittenen Rändern
        // (etwas aufgehellt: die Bilder sind dunkler als die gemalte Karte)
        mat = new THREE.MeshLambertMaterial({ map: src.map, alphaTest: src.alphaTest > 0 ? src.alphaTest : 0, side: THREE.DoubleSide, color: new THREE.Color(1.3, 1.3, 1.3) });
        mats.set(src, mat);
      }
      parts.push({ geo, mat });
      mesh.geometry.dispose();
    });
    out.set(root.name, parts);
  }
  return out;
}
