import type { LatLon } from './types';

const EARTH_R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Entfernung in Metern (Haversine). */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Punkt um dx Meter nach Osten und dy Meter nach Norden verschieben. */
export function offsetM(p: LatLon, dx: number, dy: number): LatLon {
  const lat = p.lat + (dy / EARTH_R) * (180 / Math.PI);
  const lon = p.lon + (dx / (EARTH_R * Math.cos(toRad(p.lat)))) * (180 / Math.PI);
  return { lat, lon };
}

/** Kachelkoordinaten (Web-Mercator), als Kommazahlen. */
export function toTile(p: LatLon, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((p.lon + 180) / 360) * n;
  const latR = toRad(p.lat);
  const y = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Kachelkoordinaten zurück in Längen/Breite. */
export function fromTile(x: number, y: number, z: number): LatLon {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
}

/** Kreis als Polygon-Ring [lon, lat][] für die Karte. */
export function circleRing(c: LatLon, radiusM: number, steps = 72): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p = offsetM(c, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    ring.push([p.lon, p.lat]);
  }
  return ring;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
