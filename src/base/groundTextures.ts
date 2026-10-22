// Gemalte Bodentexturen fürs Zuhause (dieselben Bilder wie auf der Karte).
//
// Die Bilder kacheln nahtlos. Die Böden bekommen UV-Koordinaten in Metern / TILE_M,
// die Vertex-Farbe dient nur noch als Tönung (heller, dunkler, verwildert).

import * as THREE from 'three';
import type { SiteId } from '../core/building';
import grundboden from '../assets/textures/grundboden.webp';
import hof from '../assets/textures/hof.webp';
import rasen from '../assets/textures/rasen.webp';
import schutt from '../assets/textures/schutt.webp';
import waldboden from '../assets/textures/waldboden.webp';
import wiese from '../assets/textures/wiese-sommer.webp';

export type GroundTex = 'grundboden' | 'hof' | 'rasen' | 'schutt' | 'wiese' | 'waldboden';

const URLS: Record<GroundTex, string> = { grundboden, hof, rasen, schutt, wiese, waldboden };

/** So viele Meter deckt ein Bild am Boden ab (Blumen etwa handgroß). */
export const TILE_M: Record<GroundTex, number> = { grundboden: 7, hof: 5, rasen: 6, schutt: 6, wiese: 7, waldboden: 4 };

/**
 * Tönung je Textur (linear, 1 = Bild unverändert). Etwas kühl und gedämpft, weil das
 * warme Sonnenlicht im Zuhause die Bilder sonst zu gelb und zu hell macht.
 */
export const TINT: Record<GroundTex, [number, number, number]> = {
  grundboden: [0.74, 0.78, 0.88],
  hof: [0.8, 0.84, 0.92],
  rasen: [0.76, 0.82, 0.88],
  schutt: [0.84, 0.86, 0.92],
  wiese: [0.74, 0.8, 0.86],
  waldboden: [0.78, 0.8, 0.88],
};

/**
 * Welcher Boden auf dem Grundstück liegt: `open` = zurückerobert, `wild` = noch verwildert.
 * null = kein Bild, dann bleiben die alten Farben.
 */
export const PLOT_TEX: Record<SiteId, { open: GroundTex | null; wild: GroundTex }> = {
  depot: { open: 'schutt', wild: 'grundboden' },
  farm: { open: 'hof', wild: 'wiese' },
  lake: { open: 'rasen', wild: 'wiese' },
  fuel: { open: 'schutt', wild: 'grundboden' },
  allotment: { open: 'rasen', wild: 'wiese' },
};

/** Boden rund um das Grundstück. */
export const OUTER_TEX: Record<SiteId, GroundTex> = {
  depot: 'grundboden',
  farm: 'wiese',
  lake: 'wiese',
  fuel: 'grundboden',
  allotment: 'wiese',
};

const materials = new Map<GroundTex, THREE.MeshStandardMaterial>();

/** Ein Material pro Textur, für alle Böden geteilt (wird nie weggeworfen). */
export function groundMaterial(kind: GroundTex): THREE.MeshStandardMaterial {
  let mat = materials.get(kind);
  if (!mat) {
    const map = new THREE.TextureLoader().load(URLS[kind]);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, metalness: 0 });
    // Bild etwas entsättigen: das warme Licht im Zuhause färbt sonst alles knallgelb
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, 0.55);',
      );
    };
    mat.customProgramCacheKey = () => 'boden-entsaettigt';
    materials.set(kind, mat);
  }
  return mat;
}

/** UV für einen Bodenpunkt in Metern. */
export function groundUV(kind: GroundTex, x: number, z: number): [number, number] {
  const t = TILE_M[kind];
  return [x / t, z / t];
}
