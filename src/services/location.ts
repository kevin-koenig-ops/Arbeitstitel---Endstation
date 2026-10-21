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
  private path: LatLon[] = [];
  private speeds: number[] = [];
  private idx = 0;
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

  get position(): LatLon {
    return this.pos;
  }

  /** Was von der Strecke noch übrig ist, ab der Figur. */
  get remaining(): LatLon[] {
    return [this.pos, ...this.path.slice(this.idx)];
  }

  /** Index des Abschnitts, auf dem die Figur gerade läuft (für die Anzeige der Reststrecke). */
  get leg() {
    return this.idx;
  }

  /** Geradeaus hinlaufen. */
  walkTo(target: LatLon) {
    this.walkPath([this.pos, target], [1]);
  }

  /** Eine Strecke ablaufen (aus dem Wegenetz). speeds: Tempo-Faktor je Abschnitt (1 = auf dem Weg). */
  walkPath(path: LatLon[], speeds: number[]) {
    this.path = path.slice(1);
    this.speeds = speeds.slice();
    this.idx = 0;
    this.target = this.path[0] ?? null;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    if (this.target) this.raf = requestAnimationFrame(this.step);
  }

  /** Stehen bleiben (z. B. wenn etwas aus dem Unterholz kommt). */
  halt() {
    this.target = null;
    this.path = [];
    cancelAnimationFrame(this.raf);
  }

  /** Mit dem Joystick schieben: dx nach Osten, dy nach Norden (Meter). */
  nudge(dxM: number, dyM: number) {
    this.moveTo(offsetM(this.pos, dxM, dyM));
  }

  /** Direkt an eine Stelle setzen (Joystick mit Wegenetz). */
  moveTo(p: LatLon) {
    this.halt();
    this.pos = p;
    this.emit();
  }

  private step = (t: number) => {
    if (!this.target) return;
    const dt = Math.max(0, Math.min(0.1, (t - this.last) / 1000));
    this.last = t;
    // So viele Sekunden Laufzeit sind übrig; im Wald zählt jeder Meter mehr
    let time = dt;
    while (time > 0 && this.target) {
      const v = this.speed * (this.speeds[this.idx] ?? 1);
      const d = distanceM(this.pos, this.target);
      if (d <= v * time) {
        this.pos = this.target;
        time -= d / v;
        this.idx += 1;
        this.target = this.path[this.idx] ?? null;
      } else {
        const f = (v * time) / d;
        this.pos = {
          lat: this.pos.lat + (this.target.lat - this.pos.lat) * f,
          lon: this.pos.lon + (this.target.lon - this.pos.lon) * f,
        };
        time = 0;
      }
    }
    this.emit();
    if (this.target) this.raf = requestAnimationFrame(this.step);
  };

  private emit() {
    this.onFix?.({ pos: this.pos, accuracyM: 4, at: Date.now(), simulated: true });
  }
}
