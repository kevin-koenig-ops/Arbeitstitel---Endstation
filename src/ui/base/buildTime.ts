// Bauzeit in der Oberfläche: Zeiten lesbar schreiben, Baustellen finden.

import type { BuildJob, Plot } from '../../core/types';

/** Dauer: „40 s“, „4 Min.“, „1 Std. 30 Min.“ */
export function durationText(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} Min.`;
  const hrs = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hrs} Std. ${rest} Min.` : `${hrs} Std.`;
}

/** Restzeit: „noch 3 Min.“, „noch 40 s“, „fertig“ */
export function leftText(ms: number): string {
  if (ms <= 0) return 'fertig';
  if (ms < 60_000) return `noch ${Math.ceil(ms / 1000)} s`;
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `noch ${min} Min.`;
  const hrs = Math.floor(min / 60);
  return min % 60 ? `noch ${hrs} Std. ${min % 60} Min.` : `noch ${hrs} Std.`;
}

/** Die Baustelle, zu der ein Schlüssel gehört (z. B. "i:12"), oder null. */
export function jobOf(plot: Plot | null | undefined, key: string): BuildJob | null {
  return plot?.jobs?.find((j) => j.keys.includes(key)) ?? null;
}

/** Wie weit eine Baustelle ist (0 bis 1). */
export function jobProgress(j: BuildJob, now: number): number {
  return Math.min(1, Math.max(0, (now - j.startsAt) / Math.max(1, j.endsAt - j.startsAt)));
}
