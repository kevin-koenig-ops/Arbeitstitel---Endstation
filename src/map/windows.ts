// Fenster und Türen für die Häuser auf der Karte: Lage im Bildbogen haus-fenster.webp
// (gebaut von scripts/fenster.py, beides zusammen ändern) und wie groß sie in echt sind.

import type { FacadeKind } from './houseMesh';

const W = 1024;
const H = 576;
const CW = 128;
const CH = 160;
const DH = 256;

/** Bildkoordinaten [u0, v0, u1, v1] (v nach oben) eines Kästchens, etwas eingerückt. */
function rect(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  const i = 3;
  return [(x0 + i) / W, 1 - (y1 - i) / H, (x1 - i) / W, 1 - (y0 + i) / H];
}

export const windowUV = (i: number) => rect((i % 8) * CW, Math.floor(i / 8) * CH, (i % 8) * CW + CW, Math.floor(i / 8) * CH + CH);
export const doorUV = (i: number) => rect(i * CW, 2 * CH, i * CW + CW, 2 * CH + DH);

/** Fenster je Fassade (aus Kevins Bildern) und ihre Größe in Metern (samt Fensterbank). */
export const WINDOW_SETS: Record<FacadeKind, { ids: number[]; w: number; h: number }> = {
  putz: { ids: [0, 1, 2, 3], w: 1.25, h: 1.5 },
  klinker: { ids: [4, 5, 6, 7], w: 1.25, h: 1.75 },
  fachwerk: { ids: [8, 9, 10, 11], w: 1.0, h: 1.3 },
};
export const BOARDED = [12, 13];
export const BROKEN = [14, 15];

/** Türen: Wohnhaus, Scheune, vernagelt. */
export const DOORS = { house: [0, 1, 2, 3, 4, 7], barn: [5], boarded: [6] };
export const DOOR_W = 1.1;
export const DOOR_H = 2.25;
