// Möbel und Deko für die Endstation, als Daten.
// Neue Teile kommen hier dazu; das 3D-Modell dazu steht in src/base/models.ts.
// Wände, Böden, Dächer und das Gelände stehen in building.ts.

import type { Inventory } from './types';

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
  | 'medCabinet'
  | 'bed'
  | 'workbench'
  | 'hammock'
  | 'kitchen'
  | 'campfire'
  | 'stove'
  | 'streetLamp'
  | 'solarPanel'
  | 'poster'
  | 'picture'
  | 'dartboard'
  | 'gnome'
  | 'washline'
  | 'rainBarrel'
  | 'flowerBed'
  | 'appleTree';

export type FurnitureCategory = 'moebel' | 'licht' | 'deko' | 'garten';

/**
 * Ebene eines Teils:
 * - floor: liegt am Boden (Teppich), darf unter Möbeln liegen, man läuft darüber
 * - object: steht im Weg
 * - wall: hängt an einer Wand (Rückseite des Feldes), braucht dort eine Wand
 */
export type FurnitureLayer = 'floor' | 'object' | 'wall';

export interface FurnitureDef {
  name: string;
  category: FurnitureCategory;
  /** Grundfläche in Feldern (Breite × Tiefe) in Grundstellung. */
  w: number;
  d: number;
  layer: FurnitureLayer;
  comfort: number;
  cost: Partial<Inventory>;
  /** Ohne Bauplan sofort baubar? */
  starter?: boolean;
  desc: string;
}

const M = (material: number, more: Partial<Inventory> = {}): Partial<Inventory> => ({ material, ...more });

export const FURNITURE: Record<FurnitureId, FurnitureDef> = {
  // --- Möbel ---
  bench: { name: 'Wartebank', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 3, cost: M(3), starter: true, desc: 'Die alte Bank von der Haltestelle.' },
  mattress: { name: 'Matratze', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 4, cost: M(3), starter: true, desc: 'Besser als der Boden.' },
  table: { name: 'Holztisch', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 2, cost: M(3), starter: true, desc: 'Für Karten, Konserven und Kartenspiele.' },
  chair: { name: 'Stuhl', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 1, cost: M(2), starter: true, desc: 'Wackelt nur ein bisschen.' },
  workbench: { name: 'Werktisch', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 2, cost: M(4), starter: true, desc: 'Hier wird gesägt, geschraubt und geflickt.' },
  sofa: { name: 'Sofa', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 7, cost: M(8), desc: 'Durchgesessen und herrlich bequem.' },
  shelf: { name: 'Bücherregal', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 4, cost: M(5), desc: 'Geschichten für die Abende.' },
  busSeat: { name: 'Bus-Sitzreihe', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 4, cost: M(5), desc: 'Aus einem alten Gelenkbus ausgebaut.' },
  fridge: { name: 'Kühlschrank', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 3, cost: M(6), desc: 'Kühlt nicht, schließt aber gut.' },
  bed: { name: 'Doppelbett', category: 'moebel', w: 2, d: 2, layer: 'object', comfort: 9, cost: M(10), desc: 'Ein richtiges Bett. Mit Kissen. Wahnsinn.' },
  kitchen: { name: 'Küchenzeile', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 5, cost: M(7), desc: 'Spüle, Arbeitsplatte, Gewürzregal.' },
  hammock: { name: 'Hängematte', category: 'moebel', w: 3, d: 1, layer: 'object', comfort: 6, cost: M(5), desc: 'Zwischen zwei Pfosten. Schaukeln, bis die Sterne kommen.' },
  // --- Licht ---
  fireBarrel: { name: 'Feuertonne', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: M(3), starter: true, desc: 'Wärme und Licht für lange Abende.' },
  campfire: { name: 'Lagerfeuer', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: M(2), starter: true, desc: 'Ein Ring aus Steinen, ein paar Scheite. Mehr braucht es nicht.' },
  lamp: { name: 'Stehlampe', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: M(5), desc: 'Läuft mit einer Autobatterie.' },
  vending: { name: 'Getränkeautomat', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 5, cost: M(7), desc: 'Leuchtet noch. Leer ist er trotzdem.' },
  fairyLights: { name: 'Lichterkette', category: 'licht', w: 2, d: 1, layer: 'object', comfort: 6, cost: M(4), desc: 'Macht aus einer Ruine ein Zuhause.' },
  stove: { name: 'Holzofen', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 6, cost: M(7), desc: 'Gusseisen, mit Ofenrohr. Knistert so schön.' },
  streetLamp: { name: 'Straßenlaterne', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 3, cost: M(5), desc: 'Von der Hauptstraße abgeschraubt. Leuchtet wieder.' },
  // --- Deko ---
  crates: { name: 'Kistenstapel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 1, cost: M(2), starter: true, desc: 'Stauraum. Und Deko, irgendwie.' },
  rug: { name: 'Teppich', category: 'deko', w: 2, d: 2, layer: 'floor', comfort: 3, cost: M(2), starter: true, desc: 'Fast wie früher.' },
  poster: { name: 'Poster', category: 'deko', w: 1, d: 1, layer: 'wall', comfort: 2, cost: M(1), starter: true, desc: 'Ein Konzert, das nie stattfand. Hängt an einer Wand.' },
  washline: { name: 'Wäscheleine', category: 'deko', w: 2, d: 1, layer: 'object', comfort: 2, cost: M(2), starter: true, desc: 'Frische Wäsche. Ein Zeichen, dass hier jemand lebt.' },
  toolwall: { name: 'Werkzeugwand', category: 'deko', w: 2, d: 1, layer: 'object', comfort: 3, cost: M(6), desc: 'Jedes Werkzeug an seinem Platz.' },
  clock: { name: 'Bahnhofsuhr', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 5, cost: M(6), desc: 'Steht auf fünf vor zwölf. Für immer.' },
  timetable: { name: 'Fahrplantafel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 3, cost: M(3), desc: 'Linie 0: alle 10 Minuten. Früher.' },
  medCabinet: { name: 'Sanitätsschrank', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 3, cost: M(4, { medicine: 1 }), desc: 'Verbandszeug immer griffbereit.' },
  picture: { name: 'Familienfoto', category: 'deko', w: 1, d: 1, layer: 'wall', comfort: 4, cost: M(2), desc: 'Fremde Leute, die lachen. Trotzdem schön. Hängt an einer Wand.' },
  dartboard: { name: 'Dartscheibe', category: 'deko', w: 1, d: 1, layer: 'wall', comfort: 3, cost: M(2), desc: 'Drei Pfeile fehlen. Einer steckt noch. Hängt an einer Wand.' },
  gnome: { name: 'Gartenzwerg', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 2, cost: M(2), desc: 'Hat alles überlebt. Lächelt immer noch.' },
  solarPanel: { name: 'Solarpaneel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 2, cost: M(6), desc: 'Strom von der Sonne. Ein Stück Zukunft.' },
  // --- Garten ---
  plant: { name: 'Pflanzenkübel', category: 'garten', w: 1, d: 1, layer: 'object', comfort: 2, cost: M(1, { water: 1 }), starter: true, desc: 'Etwas Grünes zwischen dem Beton.' },
  rainBarrel: { name: 'Regentonne', category: 'garten', w: 1, d: 1, layer: 'object', comfort: 2, cost: M(3), starter: true, desc: 'Fängt auf, was vom Himmel kommt.' },
  flowerBed: { name: 'Blumenbeet', category: 'garten', w: 2, d: 1, layer: 'object', comfort: 3, cost: M(2, { water: 1 }), starter: true, desc: 'Ringelblumen und Kapuzinerkresse.' },
  raisedBed: { name: 'Hochbeet', category: 'garten', w: 2, d: 1, layer: 'object', comfort: 4, cost: M(5, { water: 2 }), desc: 'Kräuter und Tomaten.' },
  appleTree: { name: 'Apfelbäumchen', category: 'garten', w: 1, d: 1, layer: 'object', comfort: 5, cost: M(2, { water: 2, food: 1 }), desc: 'In ein paar Jahren gibt es Äpfel. Wenn alles gut geht.' },
};

export const FURNITURE_ORDER = Object.keys(FURNITURE) as FurnitureId[];
export const CATEGORY_NAMES: Record<FurnitureCategory, string> = { moebel: 'Möbel', licht: 'Licht', deko: 'Deko', garten: 'Garten' };

/** Grundfläche unter Berücksichtigung der Drehung. */
export function footprint(kind: FurnitureId, rot: number): { w: number; d: number } {
  const f = FURNITURE[kind];
  return rot % 2 === 0 ? { w: f.w, d: f.d } : { w: f.d, d: f.w };
}
