// Bewegtes Wetter über einem Bild (Startbild, Anmelden): ziehende Nebelschwaden und feiner Niesel.
// Der Nebel ist eine einmal gezeichnete, nahtlos kachelbare Textur, die per CSS seitwärts zieht.
// Bei reduzierter Bewegung bleibt alles stehen.

import { rngFrom } from '../core/rng';
import { h } from './dom';
import { Particles } from './game/dust';

let fogTexture: string | null = null;

/** Weiche Nebelwolken, links und rechts nahtlos aneinander passend. */
function makeFogTexture(): string {
  if (fogTexture) return fogTexture;
  const w = 1024;
  const hgt = 384;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    const ctx = c.getContext('2d')!;
    const r = rngFrom('nebel-textur');
    for (let i = 0; i < 70; i++) {
      const x = r() * w;
      // Unten dichter als oben: Nebel liegt auf der Straße
      const y = hgt * (0.35 + Math.pow(r(), 0.7) * 0.6);
      const rad = 60 + r() * 170;
      const a = 0.05 + r() * 0.09;
      // Jede Wolke auch um eine Breite versetzt zeichnen, damit die Kachel nahtlos ist
      for (const dx of [-w, 0, w]) {
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
        g.addColorStop(0, `rgba(226, 230, 232, ${a})`);
        g.addColorStop(1, 'rgba(226, 230, 232, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + dx, y, rad * 1.8, rad, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    fogTexture = c.toDataURL('image/png');
  } catch {
    fogTexture = '';
  }
  return fogTexture;
}

export interface WeatherLayer {
  el: HTMLElement;
  destroy(): void;
}

/** Nebel in drei Schichten (unterschiedlich schnell) und Niesel darüber. */
export function titleWeather(): WeatherLayer {
  const tex = makeFogTexture();
  const layer = (cls: string) => h('div', { class: `fog-layer ${cls}`, style: tex ? `background-image:url(${tex})` : '' });
  const rain = h('canvas', { class: 'title-rain' }) as HTMLCanvasElement;
  const el = h('div', { class: 'title-weather', 'aria-hidden': 'true' }, layer('l1'), layer('l2'), layer('l3'), rain);
  let particles: Particles | null = null;
  // Erst nach dem Einhängen messen, sonst ist die Fläche 0 × 0
  requestAnimationFrame(() => {
    particles = new Particles(rain);
    particles.setMode('drizzle');
  });
  return {
    el,
    destroy() {
      particles?.destroy();
    },
  };
}
