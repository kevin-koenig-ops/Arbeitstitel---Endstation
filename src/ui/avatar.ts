// Einfache Figur aus Formen: Frisur, Jackenfarbe, Hautton.

import { JACKET_COLORS } from '../core/content';
import type { Character } from '../core/types';

export const SKIN_TONES = ['#e2b896', '#c18f6a', '#8d5f42', '#5c3d2b'] as const;
const HAIR = '#2a211a';

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function avatarSvg(look: Character['look'], size = 64): string {
  const jacket = JACKET_COLORS[look.color % JACKET_COLORS.length];
  const skin = SKIN_TONES[(look.skin ?? 0) % SKIN_TONES.length];
  const dark = shade(jacket, 0.65);
  let back = '';
  let front = '';
  switch (look.hair % 4) {
    case 0: // Kurz
      front = `<path d="M21 27c0-8 5-12.5 11-12.5S43 19 43 27c-2-3.5-6-5-11-5s-9 1.5-11 5z" fill="${HAIR}"/>`;
      break;
    case 1: // Lang
      back = `<path d="M19 28c0-9 5.5-14 13-14s13 5 13 14v14H19z" fill="${HAIR}"/>`;
      front = `<path d="M21 27c0-8 5-12.5 11-12.5S43 19 43 27c-3-4-7-5.5-11-5.5S24 23 21 27z" fill="${HAIR}"/>`;
      break;
    case 2: // Zopf
      back = `<circle cx="32" cy="12.5" r="5" fill="${HAIR}"/>`;
      front = `<path d="M21 27c0-8 5-12.5 11-12.5S43 19 43 27c-2.5-3-6.5-4.5-11-4.5S23.5 24 21 27z" fill="${HAIR}"/>`;
      break;
    case 3: // Mütze
      front = `<path d="M20.5 26c0-8 5-12.5 11.5-12.5S43.5 18 43.5 26z" fill="${dark}"/><rect x="19.5" y="23.5" width="25" height="4.5" rx="2" fill="${shade(jacket, 0.5)}"/><circle cx="32" cy="12.5" r="2.6" fill="${dark}"/>`;
      break;
  }
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill="#24221e"/>
    ${back}
    <path d="M10 64c0-13 9-21 22-21s22 8 22 21z" fill="${jacket}"/>
    <path d="M24 44.5l8 9 8-9" fill="none" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M10 64c1-6 3-10 6-13M54 64c-1-6-3-10-6-13" stroke="${dark}" stroke-width="2" fill="none"/>
    <rect x="28" y="36" width="8" height="9" rx="3" fill="${shade(skin, 0.85)}"/>
    <ellipse cx="32" cy="28.5" rx="10.5" ry="12" fill="${skin}"/>
    <path d="M24 31.5c2.5 1.4 5 2 8 2s5.5-.6 8-2" stroke="${shade(skin, 0.8)}" stroke-width="1.4" fill="none" opacity=".7"/>
    ${front}
  </svg>`;
}
