// Bildrate begrenzen (Einstellungen → Grafik → Bildrate): 30, 60, 90 oder so viel der Bildschirm kann.
//
// Alles, was sich bewegt (Karte, Zuhause, Kampf, Wetter), fragt beim Browser mit
// requestAnimationFrame nach dem nächsten Bild. Das wird hier einmal für die ganze App
// ersetzt: Die Wünsche werden gesammelt und nur so oft bedient, wie die Grenze erlaubt.
// Weniger Bilder pro Sekunde heißt: Handy bleibt kühler, Akku hält länger.

import type { SettingsStore } from './settings';

let installed = false;

export function installFrameCap(settings: SettingsStore) {
  if (installed || typeof window === 'undefined' || !window.requestAnimationFrame) return;
  installed = true;
  const native = window.requestAnimationFrame.bind(window);
  let cap = settings.get().fpsCap;
  settings.onChange((s) => (cap = s.fpsCap));

  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let pending = false;
  let last = 0;

  const tick = (t: number) => {
    pending = false;
    if (!queue.size) return;
    const interval = cap > 0 ? 1000 / cap : 0;
    const elapsed = t - last;
    // Zu früh für das nächste Bild: einen Bildschirmtakt warten (2 ms Spielraum gegen Zittern)
    if (interval && elapsed < interval - 2) {
      schedule();
      return;
    }
    // Leichte Verspätung mitnehmen, damit es gleichmäßig bleibt (höchstens ein halbes Bild)
    last = interval ? t - Math.min(Math.max(elapsed - interval, 0), interval / 2) : t;
    const due = queue;
    queue = new Map();
    for (const cb of due.values()) {
      try {
        cb(t);
      } catch (err) {
        // Ein Fehler in einer Animation soll die anderen nicht anhalten
        setTimeout(() => {
          throw err;
        });
      }
    }
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    native(tick);
  };

  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    schedule();
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    queue.delete(id);
  };
}
