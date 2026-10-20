// Langsam treibende Staubflocken über der Karte. Bewusst sparsam: wenige Partikel,
// niedrige Auflösung, pausiert im Hintergrund und bei reduzierter Bewegung.

import { rngFrom } from '../../core/rng';
import { reducedMotion } from '../dom';

export function mountDust(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx || reducedMotion()) return () => {};
  const motes = Array.from({ length: 28 }, (_, i) => {
    const r = rngFrom('staub', i);
    return { x: r(), y: r(), size: 0.8 + r() * 1.8, vx: 0.004 + r() * 0.012, vy: -0.002 + r() * 0.004, phase: r() * 6, depth: 0.4 + r() * 0.6 };
  });
  let w = 0;
  let h = 0;
  let raf = 0;
  const resize = () => {
    w = canvas.width = canvas.clientWidth;
    h = canvas.height = canvas.clientHeight;
  };
  const frame = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      const x = (((m.x + (t / 1000) * m.vx) % 1) + 1) % 1;
      const y = (((m.y + (t / 1000) * m.vy + Math.sin(t / 2600 + m.phase) * 0.01) % 1) + 1) % 1;
      ctx.globalAlpha = (0.18 + 0.22 * Math.sin(t / 1100 + m.phase) ** 2) * m.depth;
      ctx.fillStyle = '#f2d6a2';
      ctx.beginPath();
      ctx.arc(x * w, y * h, m.size * m.depth, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  };
}
