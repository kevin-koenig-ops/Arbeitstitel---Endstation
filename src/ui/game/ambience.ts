// Stimmung aus echter Tageszeit und echtem Wetter: Farben der Karte, Licht,
// Taschenlampe in der Nacht, Regen, Schnee, Nebel und Blitze.

import type { Map as MLMap } from 'maplibre-gl';
import { dayPhase, type DayPhase } from '../../core/sun';
import type { LatLon } from '../../core/types';
import type { App } from '../app';
import { fetchWeather, type WeatherKind } from '../../services/weather';
import type { Particles, ParticleMode } from './dust';

export interface Ambience {
  phase: DayPhase;
  weather: WeatherKind;
  tempC: number | null;
  /** Starker Wind (ab 40 km/h): übertönt Schritte. */
  windy: boolean;
  /** true, wenn Tageszeit oder Wetter über den Test-Schalter erzwungen sind */
  forced: boolean;
}

let current: Ambience = { phase: 'day', weather: 'clear', tempC: null, windy: false, forced: false };
/** Für Kampf und Karte: aktuelle Stimmung lesen. */
export const currentAmbience = () => current;

/**
 * Wie stark sind die Wandler gerade? (Lore: stärker bei Nebel, Regen und nachts, träge in praller Sonne.)
 * Wirkt im Kampf auf ihre Gesundheit. Im Testmodus (nur Optik) ohne Wirkung.
 */
export const walkerMood = (): 'strong' | 'weak' | null => {
  if (current.forced) return null;
  if (current.phase === 'night' || ['fog', 'rain', 'storm'].includes(current.weather)) return 'strong';
  if (current.phase === 'day' && current.weather === 'clear') return 'weak';
  return null;
};
/** Bei Nebel sieht man Wächter erst aus der Nähe. */
export const guardSightM = () => (current.weather === 'fog' ? 150 : Infinity);

export const PHASE_NAMES: Record<DayPhase, string> = { day: 'Tag', dusk: 'Dämmerung', night: 'Nacht' };
export const WEATHER_NAMES: Record<WeatherKind, string> = {
  clear: 'Klar',
  cloudy: 'Bewölkt',
  fog: 'Nebel',
  rain: 'Regen',
  snow: 'Schnee',
  storm: 'Gewitter',
};

export function ambienceEffects(a: Ambience): string {
  const parts: string[] = [];
  if (a.phase === 'night') parts.push('Nacht: mehr Wächter, dafür 30 % mehr Beute.');
  if (a.phase === 'dusk') parts.push('Dämmerung: Bald wird es Nacht, dann gibt es mehr Beute und mehr Gefahr.');
  if (a.phase === 'night' || ['fog', 'rain', 'storm'].includes(a.weather)) parts.push('Wandler sind jetzt zäher.');
  if (a.weather === 'rain') parts.push('Regen: Wandler mögen das.');
  if (a.weather === 'storm') parts.push('Gewitter: Donner übertönt deine Schritte, Trupps hören dich schlechter. Aber such dir in echt einen Unterschlupf!');
  if (a.windy && a.weather !== 'storm') parts.push('Sturm: Der Wind übertönt deine Schritte.');
  if (a.weather === 'snow') parts.push('Schnee: Alles ist still.');
  if (a.weather === 'fog') parts.push('Nebel: Wächter siehst du erst aus der Nähe.');
  if (a.phase === 'day' && a.weather === 'clear') parts.push('Pralle Sonne: Wandler sind träge. Ein guter Tag zum Plündern.');
  if (!parts.length) parts.push('Klare Sicht.');
  if (a.forced) parts.push('(Testmodus: nur Optik)');
  return parts.join(' ');
}

const FILTERS: Record<DayPhase, string> = {
  day: '',
  dusk: 'saturate(1.12) sepia(0.18) brightness(0.86) hue-rotate(-6deg)',
  night: 'brightness(0.58) saturate(0.55) contrast(1.08) hue-rotate(10deg)',
};
const WEATHER_FILTERS: Record<WeatherKind, string> = {
  clear: '',
  cloudy: 'saturate(0.85) brightness(0.95)',
  rain: 'saturate(0.75) brightness(0.88) contrast(1.05)',
  storm: 'saturate(0.65) brightness(0.78) contrast(1.1)',
  snow: 'saturate(0.6) brightness(1.12) contrast(0.95)',
  fog: 'saturate(0.7) brightness(1.02) contrast(0.85)',
};
const LIGHTS: Record<DayPhase, { color: string; intensity: number; position: [number, number, number] }> = {
  day: { color: '#ffd7a0', intensity: 0.42, position: [1.3, 210, 40] },
  dusk: { color: '#ff9a66', intensity: 0.5, position: [1.4, 250, 75] },
  night: { color: '#8fa6d6', intensity: 0.25, position: [1.5, 180, 30] },
};

export class AmbienceController {
  private pos: LatLon | null = null;
  private weather: { kind: WeatherKind; tempC: number | null; windKmh: number | null } | null = null;
  private weatherFor = '';
  private boltTimer = 0;
  private tick = 0;
  private unsub: () => void;
  private listeners = new Set<(a: Ambience) => void>();

  constructor(
    private app: App,
    private root: HTMLElement,
    private map: MLMap,
    private fogCanvas: HTMLCanvasElement | null,
    private particles: Particles,
    private bolt: HTMLElement,
  ) {
    this.unsub = app.settings.onChange(() => this.refresh());
    this.tick = window.setInterval(() => this.refresh(), 60_000);
  }

  onChange(fn: (a: Ambience) => void) {
    this.listeners.add(fn);
  }

  /** Position für Sonnenstand und Wetter setzen (bei jedem Standort-Update billig). */
  setPosition(p: LatLon) {
    const first = !this.pos;
    this.pos = p;
    if (first) this.refresh();
    const key = `${Math.round(p.lat * 10)},${Math.round(p.lon * 10)}`;
    if (key !== this.weatherFor && this.app.settings.get().realWeather) {
      this.weatherFor = key;
      void fetchWeather(p).then((w) => {
        if (w) this.weather = { kind: w.kind, tempC: w.tempC, windKmh: w.windKmh ?? null };
        this.refresh();
      });
    }
  }

  refresh() {
    const s = this.app.settings.get();
    const realPhase = this.pos ? dayPhase(this.pos, Date.now()) : 'day';
    const phase = s.testPhase === 'auto' ? realPhase : s.testPhase;
    const realWeather = s.realWeather && this.weather ? this.weather.kind : 'clear';
    const weather = s.testWeather === 'auto' ? realWeather : s.testWeather;
    current = {
      phase,
      weather,
      tempC: s.realWeather ? (this.weather?.tempC ?? null) : null,
      windy: s.realWeather && s.testWeather === 'auto' && (this.weather?.windKmh ?? 0) >= 40,
      forced: s.testPhase !== 'auto' || s.testWeather !== 'auto',
    };
    this.apply();
    this.listeners.forEach((l) => l(current));
  }

  private apply() {
    const { phase, weather } = current;
    this.root.dataset.phase = phase;
    this.root.dataset.weather = weather;
    const filter = [FILTERS[phase], WEATHER_FILTERS[weather]].filter(Boolean).join(' ') || 'none';
    this.map.getCanvas().style.filter = filter;
    if (this.fogCanvas) this.fogCanvas.style.filter = filter;
    try {
      this.map.setLight({ anchor: 'viewport', ...LIGHTS[phase] });
    } catch {
      /* Karte noch nicht bereit */
    }
    const mode: ParticleMode =
      weather === 'rain' ? 'rain' : weather === 'storm' ? 'storm' : weather === 'snow' ? 'snow' : weather === 'fog' ? 'none' : phase === 'night' ? 'embers' : 'dust';
    this.particles.setMode(mode);
    clearTimeout(this.boltTimer);
    if (weather === 'storm') this.scheduleBolt();
  }

  private scheduleBolt() {
    this.boltTimer = window.setTimeout(
      () => {
        this.bolt.classList.remove('on');
        void this.bolt.offsetWidth;
        this.bolt.classList.add('on');
        this.scheduleBolt();
      },
      6000 + Math.random() * 9000,
    );
  }

  destroy() {
    this.unsub();
    clearInterval(this.tick);
    clearTimeout(this.boltTimer);
  }
}
