// Echtes Wetter von Open-Meteo (kostenlos, ohne Schlüssel, Server in Europa).
// Datenschutz: Die Position wird vorher auf 0,1° gerundet (etwa 10 km), und das
// Ergebnis wird 20 Minuten zwischengespeichert.

import type { LatLon } from '../core/types';
import { readJson, writeJson } from './storage';

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export interface Weather {
  kind: WeatherKind;
  tempC: number | null;
  at: number;
}

const CACHE_KEY = 'endstation.weather';
const MAX_AGE = 20 * 60_000;

/** WMO-Wettercodes in unsere Wetterarten übersetzen. */
export function weatherFromCode(code: number): WeatherKind {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 2 || code === 3) return 'cloudy';
  return 'clear';
}

export async function fetchWeather(p: LatLon): Promise<Weather | null> {
  const lat = Math.round(p.lat * 10) / 10;
  const lon = Math.round(p.lon * 10) / 10;
  const key = `${lat},${lon}`;
  const cached = readJson<{ key: string; w: Weather }>(CACHE_KEY);
  if (cached && cached.key === key && Date.now() - cached.w.at < MAX_AGE) return cached.w;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    if (!json.current || typeof json.current.weather_code !== 'number') return null;
    const w: Weather = { kind: weatherFromCode(json.current.weather_code), tempC: json.current.temperature_2m ?? null, at: Date.now() };
    writeJson(CACHE_KEY, { key, w });
    return w;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
