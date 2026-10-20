// Gesicht der Spielfigur: als Low-Poly-Porträt, sobald das 3D-Modul geladen ist,
// vorher als einfache Zeichnung.

import type { Character } from '../core/types';
import { avatarSvg } from './avatar';
import { h, svgEl } from './dom';

type Look = Character['look'];
let render: ((look: Look, size: number) => string) | null = null;

/** 3D-Porträts nachladen (three.js). */
export async function loadPortraits(): Promise<boolean> {
  if (render) return true;
  try {
    const m = await import('../base/figureView');
    render = m.renderPortrait;
    return true;
  } catch {
    return false;
  }
}

export function faceEl(look: Look, size: number, cls?: string): HTMLElement {
  if (render) {
    try {
      return h('span', { class: 'svg face-img' + (cls ? ' ' + cls : '') }, h('img', { src: render(look, size * 2), alt: '', width: String(size), height: String(size) }));
    } catch {
      // Zeichnung als Rückfall
    }
  }
  return svgEl(avatarSvg(look, size), cls);
}
