// Höhenlinien aus den Höhenkacheln (wie auf einer Wanderkarte): alle 5 m eine dünne Linie,
// alle 25 m eine kräftigere mit Höhe in Metern. Gerechnet wird im Hintergrund (Web Worker)
// vom Zusatz maplibre-contour; die Karte bekommt daraus Vektorkacheln.

import maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';

let dem: InstanceType<typeof mlcontour.DemSource> | null = null;

/** Adresse der Höhenlinien-Kacheln (richtet beim ersten Aufruf alles ein). */
export function contourTiles(demUrl: string): string {
  if (!dem) {
    dem = new mlcontour.DemSource({ url: demUrl, encoding: 'terrarium', maxzoom: 15, worker: true, cacheSize: 100, timeoutMs: 10_000 });
    dem.setupMaplibre(maplibregl);
  }
  return dem.contourProtocolUrl({
    // Zoomstufe: [dünne Linie, kräftige Linie] in Metern
    thresholds: { 11: [100, 500], 12: [50, 250], 13: [25, 100], 14: [10, 50], 15: [5, 25] },
    contourLayer: 'contours',
    elevationKey: 'ele',
    levelKey: 'level',
    extent: 4096,
    buffer: 1,
  });
}
