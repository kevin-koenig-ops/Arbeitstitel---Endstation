// Lebendiges Wasser auf der Karte: Das Wassermuster hat mehrere Bilder, die wir langsam
// durchschalten. Wellen schaukeln, Lichtpunkte glitzern.
//
// Spart Akku: läuft nur, wenn Wasser im Bild ist, die App im Vordergrund liegt und das
// Gerät keine reduzierten Bewegungen wünscht. Etwa 6 Bilder pro Sekunde reichen dafür.

import type { Map as MlMap } from 'maplibre-gl';
import { waterFrames } from './patterns';

const FRAMES = 24;
/** Abstand zwischen zwei Bildern; ein ganzer Kreislauf dauert knapp 4 Sekunden. */
const STEP_MS = 160;
/** Weiter weg sieht man die Wellen ohnehin nicht. */
const MIN_ZOOM = 13;
/** So oft schauen wir höchstens nach, ob Wasser im Bild ist. */
const CHECK_MS = 1500;

export class WaterAnimation {
  private frames: ImageData[] | null | undefined;
  private frame = 0;
  private timer = 0;
  private lastCheck = 0;
  private waterInView = false;
  private readonly reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  constructor(private map: MlMap) {
    map.on('moveend', this.recheck);
    map.on('idle', this.maybeCheck);
    document.addEventListener('visibilitychange', this.update);
    this.reduced?.addEventListener?.('change', this.update);
    this.recheck();
  }

  private recheck = () => {
    this.lastCheck = performance.now();
    this.waterInView = this.map.getZoom() >= MIN_ZOOM && this.map.getLayer('water') !== undefined && this.map.queryRenderedFeatures({ layers: ['water'] }).length > 0;
    this.update();
  };

  private maybeCheck = () => {
    if (performance.now() - this.lastCheck > CHECK_MS) this.recheck();
  };

  private update = () => {
    const run = this.waterInView && !document.hidden && !this.reduced?.matches;
    if (run && !this.timer) {
      // Die Bilder erst malen, wenn sie gebraucht werden
      if (this.frames === undefined) this.frames = waterFrames(FRAMES);
      if (!this.frames) return;
      this.timer = window.setInterval(this.step, STEP_MS);
    } else if (!run && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  };

  private step = () => {
    if (!this.frames || !this.map.hasImage('pat-water')) return;
    this.frame = (this.frame + 1) % this.frames.length;
    this.map.updateImage('pat-water', this.frames[this.frame]);
    this.map.triggerRepaint();
  };

  destroy() {
    clearInterval(this.timer);
    this.timer = 0;
    this.map.off('moveend', this.recheck);
    this.map.off('idle', this.maybeCheck);
    document.removeEventListener('visibilitychange', this.update);
    this.reduced?.removeEventListener?.('change', this.update);
  }
}
