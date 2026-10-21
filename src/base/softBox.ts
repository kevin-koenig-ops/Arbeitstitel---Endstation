// Quader für Modelle. Im Stil „Gemalt“ mit abgerundeten Kanten: das nimmt den
// kantigen Polygon-Eindruck und gibt weiche Glanzkanten wie gemalt.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { graphicsStyle } from './gfxStyle';

/** round: Anteil der kleinsten Seite als Rundung; maxR: höchstens so viele Meter. */
export function softBox(w: number, h: number, d: number, round = 0.22, maxR = 0.045): THREE.BufferGeometry {
  if (graphicsStyle() === 'painted') {
    const r = Math.min(maxR, Math.min(w, h, d) * round);
    if (r >= 0.008) {
      const g = new RoundedBoxGeometry(w, h, d, 1, r);
      g.userData.round = true;
      return g;
    }
  }
  return new THREE.BoxGeometry(w, h, d);
}
