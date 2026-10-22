// Gesicht der Spielfigur: das gewählte gemalte Porträt (src/assets/portraits/), solange es
// das Bild noch nicht gibt, eine einfache Zeichnung (ui/avatar.ts).

import { PORTRAITS, portraitIndex } from '../core/content';
import type { Character } from '../core/types';
import { avatarSvg } from './avatar';
import { h, svgEl } from './dom';

type Look = Character['look'];

// Alle Porträtbilder, die es gibt (portrait-1.webp, portrait-2.webp …)
const FILES = import.meta.glob<string>('../assets/portraits/portrait-*.webp', { eager: true, import: 'default' });

/** Adresse des gemalten Bildes zu Porträt i (0-basiert), oder null. */
export function portraitUrl(i: number): string | null {
  return FILES[`../assets/portraits/portrait-${i + 1}.webp`] ?? null;
}

/** Aussehen eines Porträts (für die Zeichnung und die Figur im Zuhause). */
export function portraitLook(i: number): Look {
  return { ...PORTRAITS[i].look, portrait: i };
}

/** Früher wurden hier 3D-Porträts nachgeladen. Jetzt gibt es gemalte Bilder, nichts zu laden. */
export async function loadPortraits(): Promise<boolean> {
  return true;
}

export function faceEl(look: Look, size: number, cls?: string): HTMLElement {
  const i = portraitIndex(look);
  const url = portraitUrl(i);
  if (url) return h('span', { class: 'svg face-img' + (cls ? ' ' + cls : '') }, h('img', { src: url, alt: '', width: String(size), height: String(size), draggable: 'false' }));
  return svgEl(avatarSvg({ ...PORTRAITS[i].look, ...look }, size), cls);
}
