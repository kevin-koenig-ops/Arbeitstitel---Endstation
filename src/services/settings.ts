import type { LangCode } from '../ui/flags';
import { IS_PREVIEW } from '../config';
import type { DayPhase } from '../core/sun';
import type { LatLon } from '../core/types';
import type { WeatherKind } from './weather';
import { readJson, writeJson } from './storage';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Jahreszeit für die Optik: aus den Einstellungen oder aus dem Kalender. */
export function seasonOf(s: Pick<Settings, 'testSeason'>, now = new Date()): Season {
  if (s.testSeason !== 'auto') return s.testSeason;
  const m = now.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

/** Ein typischer Monat der Jahreszeit (für Laubfarben und Ähnliches). */
export function seasonMonth(season: Season, now = new Date()): number {
  const real = now.getMonth() + 1;
  const sameSeason = seasonOf({ testSeason: 'auto' }, now) === season;
  return sameSeason ? real : { spring: 4, summer: 7, autumn: 10, winter: 1 }[season];
}

export interface Settings {
  /** Echte Karte (OpenStreetMap) oder das fiktive Demo-Dorf. */
  map: 'real' | 'demo';
  /** Echtes GPS oder Tippen-zum-Laufen. */
  location: 'gps' | 'sim';
  vibration: boolean;
  /** Echtes Wetter abfragen (Position auf ~10 km gerundet). */
  realWeather: boolean;
  /** Zum Ausprobieren: Tageszeit und Wetter erzwingen (nur Optik). */
  testPhase: 'auto' | DayPhase;
  testWeather: 'auto' | WeatherKind;
  /** Zum Ausprobieren: Jahreszeit erzwingen (nur Optik). */
  testSeason: 'auto' | Season;
  /** Wie die Figur läuft: Antippen (wie bei Die Sims) oder Joystick mit Benutzen-Taste. */
  control: 'tap' | 'joystick';
  /** Beim Durchsuchen ein kurzes Geschicklichkeitsspiel (aus = immer „gut“). */
  lootGames: 'on' | 'off';
  /** Am Handy ins Vollbild wechseln und das Querformat festhalten (wo möglich). */
  fullscreen: boolean;
  /** Sprache der Oberfläche (bisher gibt es nur Deutsch). */
  language: LangCode;
  /** Wasser bewegt sich (Wellen, Glitzern). Aus spart etwas Akku. */
  waterMotion: boolean;
  /** Letzter bekannter Standort, nur auf diesem Gerät gespeichert. */
  lastPos?: LatLon;
}

const KEY = 'endstation.settings';

const COMMON = { vibration: true, realWeather: true, testPhase: 'auto', testWeather: 'auto', testSeason: 'auto', control: 'tap', lootGames: 'on', fullscreen: true, language: 'de', waterMotion: true } as const;
const DEFAULTS: Settings = IS_PREVIEW ? { ...COMMON, map: 'demo', location: 'sim' } : { ...COMMON, map: 'real', location: 'gps' };

export class SettingsStore {
  private value: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor() {
    this.value = { ...DEFAULTS, ...(readJson<Partial<Settings>>(KEY) ?? {}) };
    // In der Vorschau gibt es weder GPS noch Kartenserver.
    if (IS_PREVIEW) this.value = { ...this.value, map: 'demo', location: 'sim' };
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>) {
    this.value = { ...this.value, ...patch };
    writeJson(KEY, this.value);
    this.listeners.forEach((l) => l(this.value));
  }

  onChange(fn: (s: Settings) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
