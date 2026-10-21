// Holt Möbel aus dem Quaternius „Ultimate House Interior Pack“ (CC0) für die Endstation.
//
// Das Paket gibt es (bei Poly Pizza) nur als FBX. Erst umwandeln, z. B. mit FBX2glTF
// (npm-Paket „fbx2gltf“):  FBX2glTF --binary --input Couch_Medium1.fbx --output glb/Couch_Medium1
// Dann:
//   node scripts/import-interior.mjs /pfad/zum/glb-ordner
//
// - Nur die Möbel aus der Liste unten.
// - Farben etwas gedämpft und staubig (wie beim Zombie-Kit), Lagen in die Form eingerechnet.
// - Ergebnis: src/assets/models/quaternius-interior/<name>.glb

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const SRC = process.argv[2];
if (!SRC) {
  console.error('Bitte den Ordner mit den umgewandelten .glb-Dateien angeben.');
  process.exit(1);
}
const OUT = new URL('../src/assets/models/quaternius-interior/', import.meta.url).pathname;

const PARTS = [
  'Couch_Medium1',
  'Bed_King',
  'Bed_Single',
  'Table_RoundSmall',
  'Chair_1',
  'Shelf_Small1',
  'Kitchen_Fridge',
  'Kitchen_Sink',
  'Kitchen_Oven_Large',
  'Light_Floor1',
  'Carpet_1',
  'Houseplant_4',
  'Drawer_1',
];
const MOOD = { saturation: 0.78, dust: [0.6, 0.55, 0.46], dustAmount: 0.08 };

const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function mood(lin) {
  const s = lin.slice(0, 3).map(toSrgb);
  const l = 0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2];
  const o = s.map((v, i) => {
    const sat = l + (v - l) * MOOD.saturation;
    return Math.max(0, Math.min(1, sat + (MOOD.dust[i] - sat) * MOOD.dustAmount));
  });
  return [...o.map(toLinear), lin[3] ?? 1];
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync(OUT, { recursive: true });
for (const p of PARTS) {
  const doc = await io.read(join(SRC, `${p}.glb`));
  for (const m of doc.getRoot().listMaterials()) {
    m.setBaseColorFactor(mood(m.getBaseColorFactor()));
    m.setMetallicFactor(0).setRoughnessFactor(0.9);
  }
  // Größe und Drehung (aus Blender: z oben, Zentimeter) in die Ecken einrechnen
  await doc.transform(flatten(), prune());
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const mtx = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      for (const [sem, isNormal] of [
        ['POSITION', false],
        ['NORMAL', true],
      ]) {
        const acc = prim.getAttribute(sem);
        if (!acc) continue;
        const v = [0, 0, 0];
        for (let i = 0; i < acc.getCount(); i++) {
          acc.getElement(i, v);
          const x = mtx[0] * v[0] + mtx[4] * v[1] + mtx[8] * v[2] + (isNormal ? 0 : mtx[12]);
          const y = mtx[1] * v[0] + mtx[5] * v[1] + mtx[9] * v[2] + (isNormal ? 0 : mtx[13]);
          const z = mtx[2] * v[0] + mtx[6] * v[1] + mtx[10] * v[2] + (isNormal ? 0 : mtx[14]);
          const l = isNormal ? Math.hypot(x, y, z) || 1 : 1;
          acc.setElement(i, [x / l, y / l, z / l]);
        }
      }
    }
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }), prune());
  const name = p.replace(/_/g, '-').toLowerCase();
  const file = join(OUT, `${name}.glb`);
  writeFileSync(file, await io.writeBinary(doc));
  console.log(`${name.padEnd(22)} ${(statSync(file).size / 1024).toFixed(0).padStart(4)} KB`);
}
writeFileSync(
  join(OUT, 'HERKUNFT.md'),
  `# Quaternius – Ultimate House Interior Pack\n\nLizenz: CC0 1.0 (gemeinfrei). Quelle: https://quaternius.com / https://poly.pizza\n\nNur die Möbel aus \`scripts/import-interior.mjs\` (aus FBX umgewandelt, Farben gedämpft).\n`,
);
