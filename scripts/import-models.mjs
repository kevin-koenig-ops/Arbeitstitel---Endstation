// Holt ausgewählte Modelle aus einem Modellpaket ins Spiel (Stilprobe, Fahrplan Punkt 15).
//
//   node scripts/import-models.mjs "/Pfad/zum/Zombie Apocalypse Kit - March 2024"
//
// Was passiert:
//  - Nur die Modelle aus der Liste unten werden übernommen (nicht das ganze 200-MB-Paket).
//  - Die Farben kommen bei diesem Paket aus einem kleinen Farbfeld-Bild („Atlas“). Wir lesen
//    die Farbe für jede Ecke aus und speichern sie direkt am Modell. Dabei färben wir einige
//    Felder um (blassere Haut, verblasste Autos), damit es zur Lore passt. Danach braucht das
//    Spiel kein Bild mehr, und unsere Grafikstile (Comic, Gemalt) funktionieren wie bei allem anderen.
//  - Unbenutzte Animationen und Waffen fliegen raus, alles wird gepackt (meshopt, das Spiel entpackt es beim Laden).
//  - Ergebnis: kleine .glb-Dateien in src/assets/models/<paket>/
//
// Ein anderes Paket nehmen: neue Liste (PACK) mit gleichen Rollen anlegen und in
// src/base/modelPack.ts eintragen. Lizenz vorher prüfen!

import { readFileSync, mkdirSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

const KIT = process.argv[2];
if (!KIT) {
  console.error('Bitte den Ordner des Modellpakets angeben.');
  process.exit(1);
}
const OUT = new URL('../src/assets/models/quaternius-zombie/', import.meta.url).pathname;

// --- Umfärben ------------------------------------------------------------------------------
// Der Atlas ist ein Raster aus 16×16-Pixel-Feldern. Schlüssel „Spalte,Zeile“ → neue Farbe.
const RECOLOR = {
  // Wandler (Zombie_Basic): wächsern-blasse Haut statt Comic-Grün, dunkle Ranken
  '1,6': '#9c9f88',
  '2,6': '#4f5a34',
  '5,6': '#5e2a24',
  '9,6': '#6e3c44',
  // Knochen (Zombie_Ribcage)
  '11,6': '#c9b996',
  // Borkenmann (Zombie_Arm): Borke statt Gelb
  '1,5': '#5e4a36',
  // Heuler (Zombie_Chubby): grau-fahl statt Blau, dunkle Zunge
  '1,7': '#8a8a80',
  '6,7': '#7a3a36',
  '5,7': '#b9b39a',
  // Lis: braune statt blaue Haare
  '2,2': '#4a3324',
  // Autos verblasst: gelber Sportwagen, blauer Pick-up, grüner Lieferwagen
  '0,28': '#8c7a4c',
  '4,28': '#8a3a32',
  '0,26': '#5c6f78',
  '3,27': '#6b7050',
  // Absperrung nicht so knallgelb
  '2,11': '#a88a32',
};
/** Allgemeine Stimmung: etwas weniger Farbe, ein Hauch Staub. */
const MOOD = { saturation: 0.8, dust: '#9a8c74', dustAmount: 0.06 };

// --- Was übernommen wird -------------------------------------------------------------------
const PLAYER_ANIMS = ['Idle', 'Walk', 'Run', 'Slash', 'Stab', 'Punch', 'HitReact', 'Duck', 'Death', 'Wave', 'Yes'];
const PLAYER_KEEP = ['WoodenBat_Barbed'];
const PACK = [
  // Figuren
  { out: 'player-matt', src: 'Characters/glTF/Characters_Matt.gltf', anims: PLAYER_ANIMS, weapons: PLAYER_KEEP },
  { out: 'player-lis', src: 'Characters/glTF/Characters_Lis.gltf', anims: PLAYER_ANIMS, weapons: PLAYER_KEEP },
  { out: 'player-sam', src: 'Characters/glTF/Characters_Sam.gltf', anims: PLAYER_ANIMS, weapons: PLAYER_KEEP },
  { out: 'player-shaun', src: 'Characters/glTF/Characters_Shaun.gltf', anims: PLAYER_ANIMS, weapons: PLAYER_KEEP },
  // Gegner
  { out: 'walker', src: 'Characters/glTF/Zombie_Basic.gltf', anims: ['Idle', 'Walk', 'Crawl', 'Punch', 'Idle_Attack', 'HitReact', 'Death', 'Run_Attack'] },
  { out: 'brute', src: 'Characters/glTF/Zombie_Arm.gltf', anims: ['Idle', 'Walk', 'Punch', 'HitReact', 'Death', 'Run_Attack', 'No'] },
  { out: 'screamer', src: 'Characters/glTF/Zombie_Chubby.gltf', anims: ['Idle', 'Walk', 'Punch', 'Idle_Attack', 'HitReact', 'Death', 'No', 'Yes'] },
  // Kulisse
  ...[
    'Barrel',
    'TrashBag_1',
    'TrashBag_2',
    'TrafficCone_1',
    'TrafficCone_2',
    'TrafficBarrier_1',
    'TrafficBarrier_2',
    'PlasticBarrier',
    'Pallet',
    'Pallet_Broken',
    'Wheels_Stack',
    'Wheel',
    'CinderBlock',
    'Couch',
    'Chest',
    'Pipes',
    'Container_Red',
    'Container_Green',
    'StreetLights',
    'Street_Straight',
    'Street_Straight_Crack1',
    'Street_Straight_Crack2',
  ].map((n) => ({ out: n.toLowerCase().replace(/_/g, '-'), src: `Environment/glTF/${n}.gltf` })),
  ...['Vehicle_Pickup', 'Vehicle_Sports', 'Vehicle_Truck'].map((n) => ({ out: n.toLowerCase().replace(/_/g, '-'), src: `Vehicles/glTF/${n}.gltf` })),
];

// --- Hilfen ---------------------------------------------------------------------------------
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const dust = hex(MOOD.dust);

function mood([r, g, b], keep) {
  if (keep) return [r, g, b];
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const s = MOOD.saturation;
  let o = [l + (r - l) * s, l + (g - l) * s, l + (b - l) * s];
  o = o.map((v, i) => v + (dust[i] - v) * MOOD.dustAmount);
  return o.map((v) => Math.max(0, Math.min(1, v)));
}

const pngCache = new Map();
function decode(image) {
  const key = image.length + ':' + image[100] + image[200] + image[300];
  let p = pngCache.get(key);
  if (!p) {
    p = PNG.sync.read(Buffer.from(image));
    pngCache.set(key, p);
  }
  return p;
}

/** Farbe aus dem Atlas an der Stelle (u, v), umgefärbt, in linearen Farbwerten 0..1. */
function sample(png, u, v) {
  const x = Math.min(png.width - 1, Math.max(0, Math.floor(u * png.width)));
  const y = Math.min(png.height - 1, Math.max(0, Math.floor(v * png.height)));
  const cell = `${Math.floor(x / 16)},${Math.floor(y / 16)}`;
  const i = (y * png.width + x) * 4;
  const src = [png.data[i] / 255, png.data[i + 1] / 255, png.data[i + 2] / 255];
  const white = src[0] > 0.97 && src[1] > 0.97 && src[2] > 0.97;
  const c = RECOLOR[cell] ? mood(hex(RECOLOR[cell]), false) : mood(src, white);
  return c.map(toLinear);
}

// --- Los -------------------------------------------------------------------------------------
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync(OUT, { recursive: true });
let total = 0;
for (const spec of PACK) {
  const doc = await io.read(join(KIT, spec.src));
  const root = doc.getRoot();

  // Waffen, die wir nicht brauchen, entfernen (hängen als eigene Teile an der Hand)
  if (spec.weapons) {
    const all = ['Axe', 'Guitar', 'Knife', 'Pistol', 'Rifle', 'Shotgun', 'SMG', 'Spear', 'WoodenBat_Barbed', 'WoodenBat_Saw'];
    for (const node of root.listNodes()) if (all.includes(node.getName()) && !spec.weapons.includes(node.getName())) node.dispose();
  }
  // Animationen ausdünnen
  for (const a of root.listAnimations()) {
    if (spec.anims?.includes(a.getName())) continue;
    // Spuren einzeln entfernen, sonst bleiben ihre Daten in der Datei
    for (const ch of a.listChannels()) ch.dispose();
    for (const smp of a.listSamplers()) smp.dispose();
    a.dispose();
  }
  // Spuren, die nichts bewegen (Knochen bleibt in Ruhelage), weglassen: spart viel Platz
  for (const a of root.listAnimations())
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode();
      const out = ch.getSampler()?.getOutput()?.getArray();
      const path = ch.getTargetPath();
      if (!node || !out || !['translation', 'rotation', 'scale'].includes(path)) continue;
      const rest = path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale();
      const k = rest.length;
      let still = true;
      for (let i = 0; i < out.length && still; i++) if (Math.abs(out[i] - rest[i % k]) > 1e-4) still = false;
      if (still) {
        const smp = ch.getSampler();
        ch.dispose();
        smp?.dispose();
      }
    }

  // Farben aus dem Atlas an die Ecken schreiben
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const tex = material?.getBaseColorTexture();
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!tex || !uv) continue;
      const png = decode(tex.getImage());
      const n = uv.getCount();
      const col = new Uint8Array(n * 4);
      const t = [0, 0];
      const f = material.getBaseColorFactor();
      for (let i = 0; i < n; i++) {
        uv.getElement(i, t);
        const c = sample(png, t[0], t[1]);
        col[i * 4] = Math.round(c[0] * f[0] * 255);
        col[i * 4 + 1] = Math.round(c[1] * f[1] * 255);
        col[i * 4 + 2] = Math.round(c[2] * f[2] * 255);
        col[i * 4 + 3] = 255;
      }
      const acc = doc.createAccessor().setType('VEC4').setArray(col).setNormalized(true).setBuffer(root.listBuffers()[0]);
      prim.setAttribute('COLOR_0', acc);
      prim.setAttribute('TEXCOORD_0', null);
    }
  for (const material of root.listMaterials()) {
    if (material.getBaseColorTexture()) {
      material.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]);
      material.setRoughnessFactor(0.9).setMetallicFactor(0);
    }
  }
  for (const tex of root.listTextures()) tex.dispose();

  await doc.transform(prune(), dedup(), weld(), resample(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }), prune());
  const file = join(OUT, `${spec.out}.glb`);
  writeFileSync(file, await io.writeBinary(doc));
  const kb = statSync(file).size / 1024;
  total += kb;
  console.log(`${spec.out.padEnd(24)} ${kb.toFixed(0).padStart(5)} KB`);
}
copyFileSync(join(KIT, 'License.txt'), join(OUT, 'LICENSE.txt'));
writeFileSync(
  join(OUT, 'HERKUNFT.md'),
  `# Quaternius – Zombie Apocalypse Kit (März 2024)\n\nLizenz: CC0 1.0 (gemeinfrei), siehe LICENSE.txt. Quelle: https://quaternius.com\n\nNur die benutzten Modelle, umgewandelt mit \`scripts/import-models.mjs\` (Farben an den Ecken, umgefärbt, verkleinert).\n`,
);
console.log(`Zusammen ${(total / 1024).toFixed(2)} MB in ${OUT}`);
void readFileSync;
