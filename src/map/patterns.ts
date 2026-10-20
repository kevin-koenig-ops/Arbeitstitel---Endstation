// Kartentexturen, zur Laufzeit auf ein Canvas gezeichnet (keine Bilddateien nötig).

import { rngFrom } from '../core/rng';

const PR = 2; // Pixeldichte der Muster

type Painter = (ctx: CanvasRenderingContext2D, s: number) => void;

function make(size: number, paint: Painter): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = size * PR;
  const ctx = c.getContext('2d')!;
  ctx.scale(PR, PR);
  paint(ctx, size);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** Etwas an allen Kanten wiederholen, damit das Muster nahtlos kachelt. */
function wrap(s: number, draw: (dx: number, dy: number) => void) {
  for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) draw(dx, dy);
}

const PAINTERS: Record<string, [number, Painter]> = {
  // Staubiger Boden mit Flecken und Splittern, liegt unter allem
  'pat-ground': [
    128,
    (ctx, s) => {
      ctx.fillStyle = '#4b4538';
      ctx.fillRect(0, 0, s, s);
      const r = rngFrom('ground');
      for (let i = 0; i < 26; i++) {
        const x = r() * s;
        const y = r() * s;
        const rad = 8 + r() * 26;
        const dark = r() < 0.6;
        wrap(s, (dx, dy) => {
          const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
          g.addColorStop(0, dark ? 'rgba(40, 36, 29, 0.28)' : 'rgba(96, 88, 70, 0.22)');
          g.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
        });
      }
      for (let i = 0; i < 90; i++) {
        const x = r() * s;
        const y = r() * s;
        ctx.fillStyle = r() < 0.5 ? 'rgba(30, 27, 22, 0.55)' : 'rgba(110, 100, 80, 0.45)';
        ctx.fillRect(x, y, 0.8 + r() * 1.4, 0.8 + r() * 1.2);
      }
    },
  ],
  'pat-forest': [
    56,
    (ctx, s) => {
      ctx.fillStyle = '#273020';
      ctx.fillRect(0, 0, s, s);
      const r = rngFrom('forest');
      const crowns = Array.from({ length: 11 }, () => ({ x: r() * s, y: r() * s, rad: 4 + r() * 5, dead: r() < 0.22 }));
      for (const c of crowns)
        wrap(s, (dx, dy) => {
          ctx.fillStyle = '#1b2116';
          ctx.beginPath();
          ctx.arc(c.x + dx + 1.5, c.y + dy + 2, c.rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = c.dead ? '#4a4231' : '#344029';
          ctx.beginPath();
          ctx.arc(c.x + dx, c.y + dy, c.rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = c.dead ? '#5a4f39' : '#3f4c30';
          ctx.beginPath();
          ctx.arc(c.x + dx - c.rad * 0.3, c.y + dy - c.rad * 0.3, c.rad * 0.45, 0, Math.PI * 2);
          ctx.fill();
        });
    },
  ],
  // Waldboden: Laub, Nadeln, Moos. Darauf stehen nah dran die 3D-Bäume.
  'pat-forest-floor': [
    64,
    (ctx, s) => {
      ctx.fillStyle = '#2b3122';
      ctx.fillRect(0, 0, s, s);
      const r = rngFrom('waldboden');
      for (let i = 0; i < 16; i++) {
        const x = r() * s;
        const y = r() * s;
        const rad = 5 + r() * 12;
        const col = r() < 0.5 ? 'rgba(52, 60, 38, 0.6)' : 'rgba(60, 50, 34, 0.45)';
        wrap(s, (dx, dy) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(90, 76, 50, 0.6)' : 'rgba(24, 28, 18, 0.6)';
        ctx.fillRect(r() * s, r() * s, 1 + r() * 1.5, 0.8 + r());
      }
    },
  ],
  'pat-farm': [
    24,
    (ctx, s) => {
      ctx.fillStyle = '#5b523e';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#4b4333';
      ctx.lineWidth = 1.6;
      for (let i = -s; i < s * 2; i += 6) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + s, s);
        ctx.stroke();
      }
    },
  ],
  'pat-grass': [
    32,
    (ctx, s) => {
      ctx.fillStyle = '#4c5034';
      ctx.fillRect(0, 0, s, s);
      const r = rngFrom('grass');
      ctx.strokeStyle = '#5c5d3c';
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const x = r() * s;
        const y = r() * s;
        wrap(s, (dx, dy) => {
          ctx.beginPath();
          ctx.moveTo(x + dx, y + dy);
          ctx.lineTo(x + dx - 1.5, y + dy - 3.5);
          ctx.moveTo(x + dx, y + dy);
          ctx.lineTo(x + dx + 1.5, y + dy - 3);
          ctx.stroke();
        });
      }
    },
  ],
  'pat-rubble': [
    28,
    (ctx, s) => {
      ctx.fillStyle = '#4d4136';
      ctx.fillRect(0, 0, s, s);
      const r = rngFrom('rubble');
      for (let i = 0; i < 18; i++) {
        const x = r() * s;
        const y = r() * s;
        const w = 1 + r() * 2.5;
        ctx.fillStyle = r() < 0.5 ? '#5a4b3c' : '#3f352c';
        wrap(s, (dx, dy) => ctx.fillRect(x + dx, y + dy, w, w * 0.7));
      }
    },
  ],
};

/** Für map.on('styleimagemissing'): liefert ein Muster, falls wir es kennen. */
export function patternImage(id: string): { data: ImageData; pixelRatio: number } | null {
  const p = PAINTERS[id];
  if (!p) return null;
  return { data: make(p[0], p[1]), pixelRatio: PR };
}
