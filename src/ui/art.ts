// Gemalte Hintergrundbilder (von Kevin erzeugt, als WebP verkleinert in src/assets/art/,
// Originale in kunst/bilder/). Ein Bild austauschen: Datei ersetzen, Name gleich lassen.

import login from '../assets/art/anmelden.webp';
import character from '../assets/art/charakter.webp';
import menu from '../assets/art/hauptmenue.webp';
import battle from '../assets/art/kampf.webp';
import intro from '../assets/art/kleinstadt.webp';
import loadBach from '../assets/art/lade-bach.webp';
import loadBahnhof from '../assets/art/lade-bahnhof.webp';
import loadTankstelle from '../assets/art/lade-tankstelle.webp';
import loadWald from '../assets/art/lade-wald.webp';
import title from '../assets/art/titel.webp';
import home from '../assets/art/zuhause.webp';

export const ART = { title, login, menu, character, intro, battle, home, loadBach, loadBahnhof, loadTankstelle, loadWald } as const;
export type ArtId = keyof typeof ART;

/** Ladebildschirme: eines davon zufällig, solange Karte oder Zuhause laden. */
export const LOADING_ART: ArtId[] = ['loadBach', 'loadBahnhof', 'loadTankstelle', 'loadWald', 'login'];

/** Inline-Stil für ein Element mit der Klasse `has-art`. */
export function artStyle(id: ArtId): string {
  return `--art:url("${ART[id]}")`;
}
