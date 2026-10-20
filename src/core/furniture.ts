// Die Endstation: Raster der Wartehalle, Möbel und Deko als Daten.
// Neue Teile kommen hier dazu; das 3D-Modell dazu steht in src/base/models.ts.

import type { Inventory, SpotKind } from './types';

/** Größe der Wartehalle in Rasterfeldern (1 Feld = 1 m). */
export const HALL_W = 9;
export const HALL_D = 7;

export type FurnitureId =
  | 'bench'
  | 'crates'
  | 'fireBarrel'
  | 'mattress'
  | 'rug'
  | 'plant'
  | 'table'
  | 'chair'
  | 'sofa'
  | 'shelf'
  | 'toolwall'
  | 'lamp'
  | 'raisedBed'
  | 'clock'
  | 'timetable'
  | 'vending'
  | 'fridge'
  | 'fairyLights'
  | 'busSeat'
  | 'medCabinet';

export type FurnitureCategory = 'moebel' | 'licht' | 'deko' | 'garten';

export interface FurnitureDef {
  name: string;
  category: FurnitureCategory;
  /** Grundfläche in Feldern (Breite × Tiefe) in Grundstellung. */
  w: number;
  d: number;
  /** Boden-Teile (Teppich) dürfen unter Möbeln liegen. */
  layer: 'floor' | 'object';
  comfort: number;
  cost: Partial<Inventory>;
  /** Ohne Bauplan sofort baubar? */
  starter?: boolean;
  desc: string;
}

export const FURNITURE: Record<FurnitureId, FurnitureDef> = {
  bench: { name: 'Wartebank', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 3, cost: { material: 3 }, starter: true, desc: 'Die alte Bank von der Haltestelle.' },
  crates: { name: 'Kistenstapel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 1, cost: { material: 2 }, starter: true, desc: 'Stauraum. Und Deko, irgendwie.' },
  fireBarrel: { name: 'Feuertonne', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: { material: 3 }, starter: true, desc: 'Wärme und Licht für lange Abende.' },
  mattress: { name: 'Matratze', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 4, cost: { material: 3 }, starter: true, desc: 'Besser als der Boden.' },
  rug: { name: 'Teppich', category: 'deko', w: 2, d: 2, layer: 'floor', comfort: 3, cost: { material: 2 }, starter: true, desc: 'Fast wie früher.' },
  plant: { name: 'Pflanzenkübel', category: 'garten', w: 1, d: 1, layer: 'object', comfort: 2, cost: { material: 1, water: 1 }, starter: true, desc: 'Etwas Grünes zwischen dem Beton.' },
  table: { name: 'Holztisch', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 2, cost: { material: 3 }, starter: true, desc: 'Für Karten, Konserven und Kartenspiele.' },
  chair: { name: 'Stuhl', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 1, cost: { material: 2 }, starter: true, desc: 'Wackelt nur ein bisschen.' },
  sofa: { name: 'Sofa', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 7, cost: { material: 8 }, desc: 'Durchgesessen und herrlich bequem.' },
  shelf: { name: 'Bücherregal', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 4, cost: { material: 5 }, desc: 'Geschichten für die Abende.' },
  toolwall: { name: 'Werkzeugwand', category: 'deko', w: 2, d: 1, layer: 'object', comfort: 3, cost: { material: 6 }, desc: 'Jedes Werkzeug an seinem Platz.' },
  lamp: { name: 'Stehlampe', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: { material: 5 }, desc: 'Läuft mit einer Autobatterie.' },
  raisedBed: { name: 'Hochbeet', category: 'garten', w: 2, d: 1, layer: 'object', comfort: 4, cost: { material: 5, water: 2 }, desc: 'Kräuter und Tomaten, drinnen.' },
  clock: { name: 'Bahnhofsuhr', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 5, cost: { material: 6 }, desc: 'Steht auf fünf vor zwölf. Für immer.' },
  timetable: { name: 'Fahrplantafel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 3, cost: { material: 3 }, desc: 'Linie 0: alle 10 Minuten. Früher.' },
  vending: { name: 'Getränkeautomat', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 5, cost: { material: 7 }, desc: 'Leuchtet noch. Leer ist er trotzdem.' },
  fridge: { name: 'Kühlschrank', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 3, cost: { material: 6 }, desc: 'Kühlt nicht, schließt aber gut.' },
  fairyLights: { name: 'Lichterkette', category: 'licht', w: 2, d: 1, layer: 'object', comfort: 6, cost: { material: 4 }, desc: 'Macht aus einer Ruine ein Zuhause.' },
  busSeat: { name: 'Bus-Sitzreihe', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 4, cost: { material: 5 }, desc: 'Aus einem alten Gelenkbus ausgebaut.' },
  medCabinet: { name: 'Sanitätsschrank', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 3, cost: { material: 4, medicine: 1 }, desc: 'Verbandszeug immer griffbereit.' },
};

export const FURNITURE_ORDER = Object.keys(FURNITURE) as FurnitureId[];
export const CATEGORY_NAMES: Record<FurnitureCategory, string> = { moebel: 'Möbel', licht: 'Licht', deko: 'Deko', garten: 'Garten' };

/** Wo man welchen Bauplan findet. */
export const BLUEPRINT_SOURCES: Partial<Record<SpotKind, FurnitureId[]>> = {
  stop: ['clock', 'timetable', 'busSeat'],
  hardware: ['toolwall', 'lamp', 'raisedBed'],
  market: ['fridge', 'sofa'],
  pharmacy: ['medCabinet'],
  fuel: ['vending'],
  shed: ['fairyLights', 'shelf'],
  container: ['sofa', 'shelf'],
  parcel: ['fairyLights', 'lamp'],
};
/** Chance auf einen Bauplan, wenn es dort noch einen zu finden gibt. */
export const BLUEPRINT_CHANCE = { poi: 0.3, grid: 0.08 };

/** Schutt am Anfang: muss erst weggeräumt werden. */
export const RUBBLE: { id: string; x: number; y: number; w: number; d: number }[] = [
  { id: 'r1', x: 1, y: 1, w: 2, d: 2 },
  { id: 'r2', x: 5, y: 3, w: 2, d: 1 },
  { id: 'r3', x: 3, y: 5, w: 1, d: 1 },
];
export const RUBBLE_REWARD: Partial<Inventory> = { material: 2 };

/** Gemütlichkeit: Bezeichnungen der Stufen. */
export const COMFORT_TIERS: [number, string][] = [
  [0, 'Ruine'],
  [8, 'Notlager'],
  [20, 'Unterschlupf'],
  [38, 'Zuhause'],
  [60, 'Gemütliches Zuhause'],
];

/** Grundfläche unter Berücksichtigung der Drehung. */
export function footprint(kind: FurnitureId, rot: number): { w: number; d: number } {
  const f = FURNITURE[kind];
  return rot % 2 === 0 ? { w: f.w, d: f.d } : { w: f.d, d: f.w };
}
