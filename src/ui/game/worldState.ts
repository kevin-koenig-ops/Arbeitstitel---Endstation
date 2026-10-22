// Was das Spiel gerade über die Umgebung des Spielers weiß: die Art der Gegend.
// Die Karte bestimmt sie (aus den Kartendaten), der Kampf liest sie (Kälte, Hitze).

import type { RegionId } from '../../core/types';

let region: RegionId = 'village';

export const currentRegion = (): RegionId => region;
export function setCurrentRegion(r: RegionId) {
  region = r;
}
