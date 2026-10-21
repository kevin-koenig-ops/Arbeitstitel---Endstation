// Quader für Modelle.

import * as THREE from 'three';

/** Einfacher Quader (die Parameter für runde Kanten bleiben für spätere Stile). */
export function softBox(w: number, h: number, d: number, _round = 0.22, _maxR = 0.045): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}
