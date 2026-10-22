// Fenster, Türen, Rolltore und Fensterbänder für die Häuser auf der Karte: Lage im Bildbogen
// haus-fenster.webp (gebaut von scripts/fenster.py, beides zusammen ändern) und wie groß sie in echt sind.

import type { FacadeKind } from './houseMesh';

const W = 1024;
const H = 1024;
const CW = 128;
const CH = 160;
const DH = 256;
const DOOR_Y = 3 * CH;
const LOW_Y = DOOR_Y + DH;
const GW = 256;
const SW = 512;
const SH = 96;

/** Bildkoordinaten [u0, v0, u1, v1] (v nach oben) eines Kästchens, etwas eingerückt. */
function rect(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  const i = 3;
  return [(x0 + i) / W, 1 - (y1 - i) / H, (x1 - i) / W, 1 - (y0 + i) / H];
}

export const windowUV = (i: number) => rect((i % 8) * CW, Math.floor(i / 8) * CH, (i % 8) * CW + CW, Math.floor(i / 8) * CH + CH);
export const doorUV = (i: number) => rect(i * CW, DOOR_Y, i * CW + CW, DOOR_Y + DH);
/** Rolltor: 0 grau, 1 rostig. */
export const gateUV = (i: number) => rect(i * GW, LOW_Y, i * GW + GW, LOW_Y + GW);
/** Fensterband der Hallen: 0 heil, 1 kaputt, 2 vernagelt. */
export const stripUV = (i: number) => rect(SW, LOW_Y + i * SH, SW + SW, LOW_Y + i * SH + SH);

/** Fenster je Fassade (aus Kevins Bildern) und ihre Größe in Metern (samt Fensterbank). Hallen haben Bänder. */
export const WINDOW_SETS: Partial<Record<FacadeKind, { ids: number[]; w: number; h: number }>> = {
  putz: { ids: [0, 1, 2, 3], w: 1.25, h: 1.5 },
  klinker: { ids: [4, 5, 6, 7], w: 1.25, h: 1.75 },
  fachwerk: { ids: [8, 9, 10, 11], w: 1.0, h: 1.3 },
  platte: { ids: [16, 17, 18, 19], w: 1.7, h: 1.1 },
  holz: { ids: [20, 21, 22, 23], w: 0.85, h: 0.9 },
};
export const BOARDED = [12, 13];
export const BROKEN = [14, 15];

/** Türen (aus Kevins Türbild): Wohnhaus, Scheune, vernagelt. */
export const DOORS = { house: [0, 1, 2, 3, 4, 7], barn: [5], boarded: [6] };
export const DOOR_W = 1.0;
export const DOOR_H = 2.3;
/** Rolltor: so breit und hoch (Meter). */
export const GATE_M = 3.6;
/** Ein Stück Fensterband (Meter). */
export const STRIP = { w: 5.4, h: 1.0 };
