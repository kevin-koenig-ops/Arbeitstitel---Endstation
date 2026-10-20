// Woher kommt der Standort? Drei Varianten mit derselben Schnittstelle:
//  - GpsLocation:       echtes GPS des Handys
//  - SimulatedLocation: Tippen auf die Karte, die Figur läuft hin (zum Testen drinnen)
//  - AnchoredLocation:  echtes GPS, aber auf das Demo-Gebiet verschoben. So kann man
//                       überall draußen durch das fiktive Demo-Dorf laufen.

import { distanceM, offsetM } from '../core/geo';
import type { LatLon } from '../core/types';

export interface Fix {
  pos: LatLon;
  accuracyM: number;
  at: number;
  simulated: boolean;
}

export type LocationErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export interface LocationProvider {
  readonly kind: 'gps' | 'sim';
  start(onFix: (f: Fix) => void, onError: (e: LocationErrorCode) => void): void;
  stop(): void;
}

export class GpsLocation implements LocationProvider {
  readonly kind = 'gps' as const;
  private watchId: number | null = null;

  start(onFix: (f: Fix) => void, onError: (e: LocationErrorCode) => void) {
    if (!('geolocation' in navigator)) {
      onError('unsupported');
      return;
    }
    try {
      this.watchId = navigator.geolocation.watchPosition(
        (p) =>
          onFix({
            pos: { lat: p.coords.latitude, lon: p.coords.longitude },
            accuracyM: p.coords.accuracy,
            at: p.timestamp,
            simulated: false,
          }),
        (err) => onError(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable'),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 },
      );
    } catch {
      onError('unsupported');
    }
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

export class AnchoredLocation implements LocationProvider {
  readonly kind = 'gps' as const;
  private origin: LatLon | null = null;

  constructor(
    private inner: LocationProvider,
    private anchor: LatLon,
  ) {}

  start(onFix: (f: Fix) => void, onError: (e: LocationErrorCode) => void) {
    this.inner.start((f) => {
      if (!this.origin) this.origin = f.pos;
      const dy = distanceM(this.origin, { lat: f.pos.lat, lon: this.origin.lon }) * Math.sign(f.pos.lat - this.origin.lat);
      const dx = distanceM(this.origin, { lat: this.origin.lat, lon: f.pos.lon }) * Math.sign(f.pos.lon - this.origin.lon);
      onFix({ ...f, pos: offsetM(this.anchor, dx, dy) });
    }, onError);
  }

  stop() {
    this.inner.stop();
  }
}

export class SimulatedLocation implements LocationProvider {
  readonly kind = 'sim' as const;
  private pos: LatLon;
  private target: LatLon | null = null;
  private onFix: ((f: Fix) => void) | null = null;
  private raf = 0;
  private last = 0;
  /** Meter pro Sekunde: zügiges Rennen. Schneller als zu Fuß, damit Testen nicht ewig dauert, aber noch glaubwürdig für die Figur. */
  speed = 6;

  constructor(start: LatLon) {
    this.pos = start;
  }

  start(onFix: (f: Fix) => void) {
    this.onFix = onFix;
    this.emit();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.onFix = null;
  }

  get moving() {
    return this.target !== null;
  }

  walkTo(target: LatLon) {
    this.target = target;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.step);
  }

  /** Mit dem Joystick schieben: dx nach Osten, dy nach Norden (Meter). */
  nudge(dxM: number, dyM: number) {
    this.target = null;
    cancelAnimationFrame(this.raf);
    this.pos = offsetM(this.pos, dxM, dyM);
    this.emit();
  }

  private step = (t: number) => {
    if (!this.target) return;
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    const d = distanceM(this.pos, this.target);
    const stepM = this.speed * dt;
    if (d <= stepM) {
      this.pos = this.target;
      this.target = null;
    } else {
      const f = stepM / d;
      this.pos = {
        lat: this.pos.lat + (this.target.lat - this.pos.lat) * f,
        lon: this.pos.lon + (this.target.lon - this.pos.lon) * f,
      };
    }
    this.emit();
    if (this.target) this.raf = requestAnimationFrame(this.step);
  };

  private emit() {
    this.onFix?.({ pos: this.pos, accuracyM: 4, at: Date.now(), simulated: true });
  }
}
