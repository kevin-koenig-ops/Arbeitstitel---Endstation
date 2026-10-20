// Partikel über der Karte: Staub am Tag, Glut in der Nacht, Regen, Schnee.
// Bewusst sparsam gezeichnet; pausiert im Hintergrund und bei reduzierter Bewegung.

import { rngFrom } from '../../core/rng';
import { reducedMotion } from '../dom';

export type ParticleMode = 'dust' | 'embers' | 'rain' | 'storm' | 'snow' | 'none';

interface P {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  phase: number;
  depth: number;
}

const COUNTS: Record<ParticleMode, number> = { dust: 28, embers: 22, rain: 110, storm: 170, snow: 70, none: 0 };

export class Particles {
  private ctx: CanvasRenderingContext2D | null;
  private mode: ParticleMode = 'none';
  private parts: P[] = [];
  private raf = 0;
  private w = 0;
  private h = 0;
  private ro: ResizeObserver;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    document.addEventListener('visibilitychange', this.onVis);
    this.resize();
  }

  setMode(mode: ParticleMode) {
    if (reducedMotion()) mode = 'none';
    if (mode === this.mode) return;
    this.mode = mode;
    const r = rngFrom('partikel', mode);
    this.parts = Array.from({ length: COUNTS[mode] }, () => ({
      x: r(),
      y: r(),
      size: 0.6 + r() * 1.8,
      vx: r(),
      vy: r(),
      phase: r() * 6,
      depth: 0.35 + r() * 0.65,
    }));
    cancelAnimationFrame(this.raf);
    this.ctx?.clearRect(0, 0, this.w, this.h);
    if (this.parts.length) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private resize = () => {
    this.w = this.canvas.width = this.canvas.clientWidth;
    this.h = this.canvas.height = this.canvas.clientHeight;
  };

  private onVis = () => {
    cancelAnimationFrame(this.raf);
    if (document.visibilityState === 'visible' && this.parts.length) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private frame = (t: number) => {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    for (const p of this.parts) {
      switch (this.mode) {
        case 'dust':
        case 'embers': {
          p.x = (p.x + dt * (0.004 + p.vx * 0.012) + 1) % 1;
          p.y = (p.y + dt * (this.mode === 'embers' ? -0.012 - p.vy * 0.02 : -0.002 + p.vy * 0.004) + 1) % 1;
          const flicker = 0.5 + 0.5 * Math.sin(t / (this.mode === 'embers' ? 300 : 1100) + p.phase);
          ctx.globalAlpha = (this.mode === 'embers' ? 0.35 + 0.55 * flicker : 0.18 + 0.22 * flicker) * p.depth;
          ctx.fillStyle = this.mode === 'embers' ? '#ffae4a' : '#f2d6a2';
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, p.size * p.depth * (this.mode === 'embers' ? 1.1 : 1), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'rain':
        case 'storm': {
          const speed = this.mode === 'storm' ? 1.9 : 1.4;
          p.y += dt * speed * (0.7 + p.depth * 0.6);
          p.x += dt * (this.mode === 'storm' ? 0.35 : 0.12);
          if (p.y > 1.05) (p.y = -0.05), (p.x = (p.x + 0.37) % 1);
          if (p.x > 1) p.x -= 1;
          const len = (14 + p.depth * 18) * (this.mode === 'storm' ? 1.3 : 1);
          ctx.globalAlpha = 0.18 + p.depth * 0.3;
          ctx.strokeStyle = '#c9d4e0';
          ctx.lineWidth = 0.6 + p.depth * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x * w, p.y * h);
          ctx.lineTo(p.x * w - len * (this.mode === 'storm' ? 0.28 : 0.1), p.y * h - len);
          ctx.stroke();
          break;
        }
        case 'snow': {
          p.y += dt * (0.03 + p.depth * 0.05);
          p.x += dt * Math.sin(t / 1400 + p.phase) * 0.02;
          if (p.y > 1.02) (p.y = -0.02), (p.x = (p.x + 0.29) % 1);
          ctx.globalAlpha = 0.45 + p.depth * 0.45;
          ctx.fillStyle = '#f4f2ec';
          ctx.beginPath();
          ctx.arc(((p.x % 1) + 1) % 1 * w, p.y * h, 0.8 + p.size * p.depth, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    this.raf = requestAnimationFrame(this.frame);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
