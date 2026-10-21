// Gemalte Hintergrundbilder (von Kevin erzeugt, als WebP verkleinert in src/assets/art/).
// Ein Bild austauschen: Datei ersetzen, Name gleich lassen.

import battle from '../assets/art/heuler-tunnel.webp';
import character from '../assets/art/charakter-ausruestung.webp';
import home from '../assets/art/endstation-halle.webp';
import intro from '../assets/art/kleinstadt.webp';
import menu from '../assets/art/menu-lagerfeuer.webp';

export const ART = { menu, character, intro, battle, home } as const;
export type ArtId = keyof typeof ART;

/** Inline-Stil für ein Element mit der Klasse `has-art`. */
export function artStyle(id: ArtId): string {
  return `--art:url("${ART[id]}")`;
}
