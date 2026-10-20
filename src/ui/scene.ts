// Stimmungsbild fürs Hauptmenü: Ruinen-Silhouetten im Smog, ein Bus mit leuchtender Anzeige.
// Prozedural auf Canvas gezeichnet, Staubflocken bewegen sich langsam.

import { rngFrom } from '../core/rng';
import { reducedMotion } from './dom';

export function mountScene(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let w = 0;
  let hgt = 0;
  let raf = 0;
  let still: HTMLCanvasElement | null = null;
  const dust = Array.from({ length: 46 }, (_, i) => {
    const r = rngFrom('dust', i);
    return { x: r(), y: r(), s: 0.6 + r() * 1.6, v: 0.004 + r() * 0.01, p: r() * 6 };
  });

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    hgt = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    still = paintStill(w, hgt, dpr);
  };

  const frame = (t: number) => {
    if (!still) return;
    ctx.clearRect(0, 0, w, hgt);
    ctx.drawImage(still, 0, 0, w, hgt);
    ctx.fillStyle = 'rgba(230, 210, 170, 0.5)';
    for (const d of dust) {
      const x = ((d.x + (t / 1000) * d.v) % 1) * w;
      const y = (d.y + Math.sin(t / 2200 + d.p) * 0.02) * hgt;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t / 900 + d.p);
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reducedMotion()) raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(() => {
    resize();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  });
  ro.observe(canvas);

  return () => {
    ro.disconnect();
    cancelAnimationFrame(raf);
  };
}

function paintStill(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const horizon = h * 0.7;

  // Himmel: Smog, tief stehende Sonne
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#141210');
  sky.addColorStop(0.55, '#2b231b');
  sky.addColorStop(1, '#6a4c2c');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.68, horizon - 8, 4, w * 0.68, horizon - 8, h * 0.55);
  sun.addColorStop(0, 'rgba(255, 196, 120, 0.55)');
  sun.addColorStop(0.08, 'rgba(255, 170, 90, 0.25)');
  sun.addColorStop(1, 'rgba(255, 150, 70, 0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);

  const r = rngFrom('skyline');
  // Ferne Stadt: Hochhäuser mit abgebrochenen Kanten, ein Kran
  g.fillStyle = '#3a2d22';
  let x = -10;
  while (x < w + 20) {
    const bw = 18 + r() * 40;
    const bh = h * (0.12 + r() * 0.22);
    const top = horizon - bh;
    g.beginPath();
    g.moveTo(x, horizon);
    g.lineTo(x, top + r() * 10);
    const steps = 2 + Math.floor(r() * 3);
    for (let i = 1; i <= steps; i++) g.lineTo(x + (bw * i) / steps, top + r() * (r() < 0.3 ? 30 : 8));
    g.lineTo(x + bw, horizon);
    g.fill();
    x += bw + r() * 14;
  }
  const kx = w * 0.22;
  g.strokeStyle = '#3a2d22';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(kx, horizon);
  g.lineTo(kx, horizon - h * 0.42);
  g.lineTo(kx + w * 0.16, horizon - h * 0.4);
  g.moveTo(kx - 18, horizon - h * 0.41);
  g.lineTo(kx, horizon - h * 0.42);
  g.moveTo(kx + w * 0.12, horizon - h * 0.4);
  g.lineTo(kx + w * 0.12, horizon - h * 0.3);
  g.stroke();

  // Dunst über der Stadt
  const haze = g.createLinearGradient(0, horizon - h * 0.25, 0, horizon);
  haze.addColorStop(0, 'rgba(106, 76, 44, 0)');
  haze.addColorStop(1, 'rgba(106, 76, 44, 0.55)');
  g.fillStyle = haze;
  g.fillRect(0, horizon - h * 0.25, w, h * 0.25);

  // Mittelgrund: Häuser mit Satteldach, einige eingestürzt, Bäume, Strommasten
  g.fillStyle = '#1f1a16';
  x = -20;
  const base = horizon + 6;
  while (x < w + 30) {
    if (r() < 0.35) {
      const tr = 10 + r() * 16;
      g.beginPath();
      g.arc(x + tr, base - tr * 1.6, tr, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + tr - 1.5, base - tr * 1.6, 3, tr * 1.6);
      x += tr * 2 + 4;
      continue;
    }
    const hw = 26 + r() * 30;
    const hh = 16 + r() * 18;
    const broken = r() < 0.35;
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x, base - hh);
    if (broken) {
      g.lineTo(x + hw * 0.3, base - hh - hw * 0.28);
      g.lineTo(x + hw * 0.45, base - hh - 2);
      g.lineTo(x + hw * 0.6, base - hh + 6);
    } else g.lineTo(x + hw / 2, base - hh - hw * 0.42);
    g.lineTo(x + hw, base - hh);
    g.lineTo(x + hw, base);
    g.fill();
    x += hw + 2 + r() * 12;
  }
  g.strokeStyle = '#1f1a16';
  g.lineWidth = 1.5;
  for (const px of [w * 0.1, w * 0.48, w * 0.86]) {
    g.beginPath();
    g.moveTo(px, base);
    g.lineTo(px, horizon - h * 0.2);
    g.moveTo(px - 9, horizon - h * 0.18);
    g.lineTo(px + 9, horizon - h * 0.18);
    g.stroke();
  }
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(w * 0.1 - 9, horizon - h * 0.18);
  g.quadraticCurveTo(w * 0.29, horizon - h * 0.12, w * 0.48 - 9, horizon - h * 0.18);
  g.moveTo(w * 0.48 + 9, horizon - h * 0.18);
  g.quadraticCurveTo(w * 0.67, horizon - h * 0.11, w * 0.86 + 9, horizon - h * 0.18);
  g.stroke();

  // Vordergrund
  g.fillStyle = '#12100e';
  g.fillRect(0, base, w, h - base);
  const road = g.createLinearGradient(0, base, 0, h);
  road.addColorStop(0, '#1a1714');
  road.addColorStop(1, '#0e0d0b');
  g.fillStyle = road;
  g.beginPath();
  g.moveTo(w * 0.42, base);
  g.lineTo(w * 0.58, base);
  g.lineTo(w * 1.1, h);
  g.lineTo(-w * 0.1, h);
  g.fill();

  // Der Bus
  const bw = Math.min(260, w * 0.62);
  const bh = bw * 0.36;
  const bx = w * 0.5 - bw * 0.42;
  const by = base + (h - base) * 0.35 - bh;
  g.fillStyle = '#0c0b0a';
  g.beginPath();
  g.ellipse(bx + bw / 2, by + bh + 4, bw * 0.55, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#171513';
  roundRect(g, bx, by, bw, bh, 8);
  g.fill();
  g.fillStyle = '#25211c';
  for (let i = 0; i < 6; i++) roundRect(g, bx + bw * 0.08 + i * bw * 0.125, by + bh * 0.16, bw * 0.105, bh * 0.38, 2), g.fill();
  // Zielanzeige leuchtet
  const sx = bx + bw * 0.82;
  const sy = by + bh * 0.1;
  g.fillStyle = 'rgba(255, 170, 40, 0.28)';
  g.beginPath();
  g.ellipse(sx + bw * 0.07, sy + 5, bw * 0.16, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffb22e';
  roundRect(g, sx, sy, bw * 0.14, 9, 2);
  g.fill();
  g.fillStyle = '#0c0b0a';
  for (const wx of [bx + bw * 0.2, bx + bw * 0.78]) {
    g.beginPath();
    g.arc(wx, by + bh, bh * 0.22, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
