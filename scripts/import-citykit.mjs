// Holt Fassaden-Bauteile aus dem Quaternius „Downtown City MegaKit“ (CC0) für die Karte.
//
//   node scripts/import-citykit.mjs "/Pfad/zu/Downtown City MegaKit[Standard]"
//
// - Nimmt nur die Wand-, Fenster-, Laden-, Tür- und Gesims-Teile aus der Liste unten.
// - Alle Teile kommen in EINE Datei (citykit.glb), die Texturen teilen sie sich.
// - Nur die Farbtexturen (512 px, JPEG), keine Normal- und Rauheitskarten: leicht fürs Handy.
// - Glas wird dunkel und undurchsichtig, „Fake Interior“ ein dunkler Raum dahinter.
// - Ergebnis: src/assets/models/quaternius-city/citykit.glb

import { copyFileSync, mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, mergeDocuments, prune, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const KIT = process.argv[2];
if (!KIT) {
  console.error('Bitte den Ordner des Downtown City MegaKit angeben.');
  process.exit(1);
}
const SRC = join(KIT, 'Exports', 'glTF (Godot)');
const TEX = join(KIT, 'Textures');
const OUT = new URL('../src/assets/models/quaternius-city/', import.meta.url).pathname;

/** Die Bauteile (alle 2 m breit und 3 m hoch, außer den Gesimsen: 1 m hoch). */
const PARTS = [
  'Brick_Plain_3',
  'Brick_Window_Trim_Single',
  'Brick_Window_Square_Single',
  'Brick_Window_Trim',
  'Brick_TopTrim',
  'Brick_BottomTrim',
  'Trim_Window',
  'Trim_Plain_3',
  'Trim_FirstFloor_Window_001',
  'Trim_FirstFloor_Wall',
  'Metal_FirstFloor_Window',
  'Metal_FirstFloor_Wall',
  'DoorFrame_Trim',
  'DoorFrame_Metal_Single',
  'Cornice_Brick_Center',
  'Cornice_Trim_Center',
  'Cornice_Metal_Center',
];
/** Farbtexturen, die wir behalten (verkleinert). */
const KEEP = ['T_RedBrick_BaseColor', 'T_Trim_BaseColor', 'T_MetalConcrete_BaseColor'];
const SIZE = 512;

// --- Texturen verkleinern (einfacher Kastenfilter) -------------------------------------------
function shrink(file) {
  const png = PNG.sync.read(readFileSync(file));
  const f = png.width / SIZE;
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = Math.floor(y * f); yy < Math.floor((y + 1) * f); yy++)
        for (let xx = Math.floor(x * f); xx < Math.floor((x + 1) * f); xx++) {
          const i = (yy * png.width + xx) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
          n++;
        }
      const o = (y * SIZE + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  return jpeg.encode({ data: out, width: SIZE, height: SIZE }, 82).data;
}

// Arbeitsordner: Teile + verkleinerte Texturen + Platzhalter für weggelassene Karten
const WORK = join(tmpdir(), 'endstation-citykit');
mkdirSync(WORK, { recursive: true });
const PIXEL = PNG.sync.write(Object.assign(new PNG({ width: 1, height: 1 }), { data: Buffer.from([128, 128, 255, 255]) }));
const jpgs = new Map();
for (const k of KEEP) jpgs.set(k, shrink(join(TEX, `${k}.png`)));
for (const p of PARTS) {
  copyFileSync(join(SRC, `${p}.gltf`), join(WORK, `${p}.gltf`));
  copyFileSync(join(SRC, `${p}.bin`), join(WORK, `${p}.bin`));
  const g = JSON.parse(readFileSync(join(SRC, `${p}.gltf`), 'utf8'));
  for (const img of g.images ?? []) if (!existsSync(join(WORK, img.uri))) writeFileSync(join(WORK, img.uri), PIXEL);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(join(WORK, `${PARTS[0]}.gltf`));
const root = doc.getRoot();
root.listScenes()[0].listChildren()[0].setName(PARTS[0]);
for (const p of PARTS.slice(1)) {
  const d = await io.read(join(WORK, `${p}.gltf`));
  d.getRoot().listScenes()[0].listChildren()[0].setName(p);
  mergeDocuments(doc, d);
}
// Alle Teile in eine Szene
const scene = root.listScenes()[0];
for (const s of root.listScenes().slice(1)) {
  for (const n of s.listChildren()) scene.addChild(n);
  s.dispose();
}

// Materialien vereinfachen
for (const m of root.listMaterials()) {
  const name = m.getName();
  m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
  m.setMetallicFactor(0).setRoughnessFactor(0.9);
  if (name === 'MI_Glass') m.setAlphaMode('OPAQUE').setBaseColorFactor([0.03, 0.035, 0.04, 1]).setRoughnessFactor(0.3);
  if (name.startsWith('MI_FakeInterior')) m.setBaseColorFactor([0.02, 0.018, 0.016, 1]);
  const tex = m.getBaseColorTexture();
  if (tex) {
    const key = tex.getName() || (tex.getURI() ?? '').replace(/\.png$/, '');
    const jpg = jpgs.get(key);
    if (jpg) tex.setImage(new Uint8Array(jpg)).setMimeType('image/jpeg').setURI(`${key}.jpg`);
  }
}
for (const t of root.listTextures()) if (t.getMimeType() !== 'image/jpeg') t.dispose();

await doc.transform(dedup(), prune(), weld(), unpartition(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }), prune());
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'citykit.glb'), await io.writeBinary(doc));
copyFileSync(join(KIT, 'License_Standard.txt'), join(OUT, 'LICENSE.txt'));
writeFileSync(
  join(OUT, 'HERKUNFT.md'),
  `# Quaternius – Downtown City MegaKit (Standard)\n\nLizenz: CC0 1.0 (gemeinfrei), siehe LICENSE.txt. Quelle: https://quaternius.com\n\nNur die Fassaden-Bauteile aus \`scripts/import-citykit.mjs\`, Farbtexturen auf 512 px verkleinert.\n`,
);
console.log(`citykit.glb: ${(statSync(join(OUT, 'citykit.glb')).size / 1024).toFixed(0)} KB, ${root.listMeshes().length} Formen, ${root.listTextures().length} Texturen`);
