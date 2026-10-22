// Baut src/assets/models/natur.glb aus dem Quaternius „Stylized Nature MegaKit“ (CC0).
// Jedes Modell wird ein Knoten mit festem Namen, Fuß bei y = 0, mittig, auf Zielgröße in Metern.
// Aufruf: node scripts/natur-modelle.mjs <glTF-Ordner des Pakets> src/assets/models/natur.glb
// Braucht (nur dafür, nicht im Spiel): @gltf-transform/core, /extensions, /functions, meshoptimizer, sharp
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, unweld, weld, mergeDocuments, textureCompress, quantize, meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'node:path';

const [, , dir, out] = process.argv;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// Name im Spiel, Datei, Zielgröße: w = Breite (größere von x/z) oder h = Höhe, in Metern
const MODELS = [
  ['rock_1', 'Rock_Medium_1', { w: 2.0 }],
  ['rock_2', 'Rock_Medium_2', { w: 2.0 }],
  ['rock_3', 'Rock_Medium_3', { w: 2.0 }],
  ['fern', 'Fern_1', { w: 1.7 }],
  ['grass', 'Grass_Wispy_Tall', { h: 1.0 }],
  ['mushroom_1', 'Mushroom_Common', { w: 0.9 }],
  ['mushroom_2', 'Mushroom_Laetiporus', { w: 1.0 }],
];

/** Grenzen aus den wirklich benutzten Ecken (die gespeicherten Min/Max-Werte stimmen nicht immer). */
function realBounds(scene) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(idx ? idx.getScalar(i) : i, v);
        const w = [0, 1, 2].map((k) => m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], w[k]);
          max[k] = Math.max(max[k], w[k]);
        }
      }
    }
  });
  return { min, max };
}

const target = new (await import('@gltf-transform/core')).Document();
target.createBuffer();
const mainScene = target.createScene('natur');

for (const [key, file, size] of MODELS) {
  const doc = await io.read(path.join(dir, file + '.gltf'));
  // Unbenutzte Ecken entfernen (manche Dateien haben welche weit außerhalb, das verfälscht die Größe)
  await doc.transform(unweld(), weld());
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const b = realBounds(scene);
  const sx = b.max[0] - b.min[0];
  const sy = b.max[1] - b.min[1];
  const sz = b.max[2] - b.min[2];
  const s = size.w ? size.w / Math.max(sx, sz) : size.h / sy;
  const holder = doc.createNode(key).setScale([s, s, s]).setTranslation([(-(b.min[0] + b.max[0]) / 2) * s, -b.min[1] * s, (-(b.min[2] + b.max[2]) / 2) * s]);
  for (const n of scene.listChildren()) {
    scene.removeChild(n);
    holder.addChild(n);
  }
  scene.addChild(holder);
  const map = mergeDocuments(target, doc);
  const merged = map.get(scene);
  for (const n of merged.listChildren()) {
    merged.removeChild(n);
    mainScene.addChild(n);
  }
  merged.dispose();
  console.log(key, 'size', [sx, sy, sz].map((v) => (v * s).toFixed(2)).join(' x '));
}

// Alle Puffer zu einem zusammenlegen
const buffers = target.getRoot().listBuffers();
for (const buf of buffers.slice(1)) {
  for (const acc of target.getRoot().listAccessors()) if (acc.getBuffer() === buf) acc.setBuffer(buffers[0]);
  buf.dispose();
}
target.getRoot().setDefaultScene(mainScene);
// Blätter: Durchsichtige Pixel sind schwarz. In kleinen Mipmap-Stufen mischt sich das
// Schwarz ins Laub und Büsche werden fast schwarz. Deshalb die Blattfarbe nach außen
// ausbreiten und die Pixel minimal sichtbar lassen (Alpha 2), sonst wirft WebP die Farbe weg.
async function bleed(buf, size = 256) {
  // Erst verkleinern, dann ausbreiten (beim Verkleinern rechnet sharp mit Alpha und verliert die Farbe sonst wieder)
  const { data, info } = await sharp(Buffer.from(buf)).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let done = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) done[i] = data[i * 4 + 3] > 100 ? 1 : 0;
  for (let pass = 0; pass < 24; pass++) {
    const next = done.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (done[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!done[j]) continue;
          r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
        }
        if (!n) continue;
        data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n;
        next[i] = 1;
      }
    }
    done = next;
  }
  // Rest: Mittelwert aller Blätter
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 100) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; n++; }
  for (let i = 0; i < w * h; i++) {
    if (!done[i]) { data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; }
    if (data[i * 4 + 3] < 2) data[i * 4 + 3] = 2;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
for (const m of target.getRoot().listMaterials()) {
  if (m.getAlphaMode() !== 'MASK') continue;
  const tex = m.getBaseColorTexture();
  if (!tex || tex.getExtras().bled) continue;
  tex.setImage(await bleed(tex.getImage())).setMimeType('image/png').setExtras({ bled: true });
}

// Normal- und Rauheitsbilder brauchen wir nicht (die Karte nutzt einfaches Licht)
for (const m of target.getRoot().listMaterials()) {
  m.getNormalTexture()?.dispose();
  m.getMetallicRoughnessTexture()?.dispose();
}
await target.transform(
  dedup(),
  prune(),
  // Blätter verlustfrei (sonst wirft WebP die ausgebreitete Farbe unter den durchsichtigen Pixeln weg), dafür kleiner
  textureCompress({ encoder: sharp, targetFormat: 'webp', lossless: true, pattern: /Leaves|Flowers/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82, pattern: /Rocks|Grass|Mushrooms/ }),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(out, target);
let tris = 0;
for (const m of target.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
console.log('Dreiecke gesamt', tris, 'Bilder', target.getRoot().listTextures().map((t) => t.getURI() + ' ' + Math.round(t.getImage().byteLength / 1024) + 'KB').join(', '));
