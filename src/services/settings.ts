import { IS_PREVIEW } from '../config';
import type { DayPhase } from '../core/sun';
import type { LatLon } from '../core/types';
import type { WeatherKind } from './weather';
import { readJson, writeJson } from './storage';

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
  /** Wie die Figur läuft: Antippen (wie bei Die Sims) oder Joystick mit Benutzen-Taste. */
  control: 'tap' | 'joystick';
  /** Beim Durchsuchen ein kurzes Geschicklichkeitsspiel (aus = immer „gut“). */
  lootGames: 'on' | 'off';
  /** Am Handy ins Vollbild wechseln und das Querformat festhalten (wo möglich). */
  fullscreen: boolean;
  /** Grafikstil: kantige Polygone oder Comic (Cel-Shading mit Umrissen). */
  graphics: 'poly' | 'comic' | 'painted';
  /** Figuren und Kulisse: fertiges Modellpaket (Stilprobe) oder selbst gebaut. */
  models: 'pack' | 'own';
  /** Häuser auf der Karte: 3D mit Fassaden, mit Stadt-Bausatz (Quaternius) oder einfache Blöcke. */
  mapHouses: 'detail' | 'citykit' | 'simple';
  /** Letzter bekannter Standort, nur auf diesem Gerät gespeichert. */
  lastPos?: LatLon;
}

const KEY = 'endstation.settings';

const COMMON = { vibration: true, realWeather: true, testPhase: 'auto', testWeather: 'auto', control: 'tap', lootGames: 'on', fullscreen: true, graphics: 'poly', models: 'pack', mapHouses: 'detail' } as const;
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
