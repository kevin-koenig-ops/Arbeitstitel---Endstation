// Sonnenstand rein rechnerisch (vereinfachte NOAA-Formeln, Genauigkeit ~1°).
// Kein Netzwerk nötig, und der Server kann es später genauso berechnen.

import type { LatLon } from './types';

export type DayPhase = 'day' | 'dusk' | 'night';

const rad = Math.PI / 180;
const J2000 = 946728000000; // 2000-01-01 12:00 UTC

/** Höhe der Sonne über dem Horizont in Grad. */
export function sunElevation(p: LatLon, t: number): number {
  const d = (t - J2000) / 86400000;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmstH = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmstH * 15 + p.lon) * rad - ra;
  const lat = p.lat * rad;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) / rad;
}

/** Nacht unter -6° (bürgerliche Dämmerung vorbei), Tag ab 8°, dazwischen Dämmerung. */
export function dayPhase(p: LatLon, t: number): DayPhase {
  const el = sunElevation(p, t);
  if (el < -6) return 'night';
  if (el < 8) return 'dusk';
  return 'day';
}
