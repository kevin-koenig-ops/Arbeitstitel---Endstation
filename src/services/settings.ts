import { IS_PREVIEW } from '../config';
import type { LatLon } from '../core/types';
import { readJson, writeJson } from './storage';

export interface Settings {
  /** Echte Karte (OpenStreetMap) oder das fiktive Demo-Dorf. */
  map: 'real' | 'demo';
  /** Echtes GPS oder Tippen-zum-Laufen. */
  location: 'gps' | 'sim';
  vibration: boolean;
  /** Letzter bekannter Standort, nur auf diesem Gerät gespeichert. */
  lastPos?: LatLon;
}

const KEY = 'endstation.settings';

const DEFAULTS: Settings = IS_PREVIEW
  ? { map: 'demo', location: 'sim', vibration: true }
  : { map: 'real', location: 'gps', vibration: true };

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
