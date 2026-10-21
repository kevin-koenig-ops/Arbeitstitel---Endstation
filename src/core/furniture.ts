// Möbel und Deko für die Endstation, als Daten.
// Neue Teile kommen hier dazu; das 3D-Modell dazu steht in src/base/models.ts.
// Wände, Böden, Dächer und das Gelände stehen in building.ts.

import { COLLECTIBLE_ORDER, COLLECTIBLES } from './content';
import type { CollectibleId, Inventory, Survival } from './types';

/** Gebaute Möbel (mit Rohstoffen und teils Bauplan). */
export type BuiltFurnitureId =
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
  | 'radioSet'
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

/** Alles, was man aufstellen kann: gebaute Möbel und Sammelstücke von draußen. */
export type FurnitureId = BuiltFurnitureId | CollectibleId;

export type FurnitureCategory = 'moebel' | 'licht' | 'deko' | 'garten' | 'fund';

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
  /** Ein Sammelstück: kostet nichts, gibt es nur einmal und muss gefunden sein. */
  collectible?: boolean;
  /** Nützliche Anlage: gibt es nur einmal (aufrüsten statt mehrfach bauen). */
  unique?: boolean;
  /** Anlage, die von selbst etwas erzeugt (abholen in der Endstation). */
  produces?: { res: Survival; everyH: number; cap: number };
}

const BUILT: Record<BuiltFurnitureId, FurnitureDef> = {
  // --- Möbel ---
  bench: { name: 'Wartebank', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 3, cost: { wood: 2, metal: 1 }, starter: true, desc: 'Die alte Bank von der Haltestelle.' },
  mattress: { name: 'Matratze', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 4, cost: { cloth: 3 }, starter: true, desc: 'Besser als der Boden.' },
  table: { name: 'Holztisch', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 2, cost: { wood: 3 }, starter: true, desc: 'Für Karten, Konserven und Kartenspiele.' },
  chair: { name: 'Stuhl', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 1, cost: { wood: 2 }, starter: true, desc: 'Wackelt nur ein bisschen.' },
  workbench: { name: 'Werktisch', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 2, cost: { wood: 3, metal: 2 }, starter: true, unique: true, desc: 'Zerlegt Kram in Rohstoffe, in echter Zeit, und baut Waffen. Gibt es nur einmal, lässt sich aufrüsten.' },
  sofa: { name: 'Sofa', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 7, cost: { wood: 2, cloth: 4, screws: 1 }, desc: 'Durchgesessen und herrlich bequem.' },
  shelf: { name: 'Bücherregal', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 4, cost: { wood: 4, screws: 1 }, desc: 'Geschichten für die Abende.' },
  busSeat: { name: 'Bus-Sitzreihe', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 4, cost: { metal: 2, cloth: 2, screws: 1 }, desc: 'Aus einem alten Gelenkbus ausgebaut.' },
  fridge: { name: 'Kühlschrank', category: 'moebel', w: 1, d: 1, layer: 'object', comfort: 3, cost: { metal: 3, plastic: 2 }, desc: 'Kühlt nicht, schließt aber gut.' },
  bed: { name: 'Doppelbett', category: 'moebel', w: 2, d: 2, layer: 'object', comfort: 9, cost: { wood: 5, cloth: 4, screws: 2 }, desc: 'Ein richtiges Bett. Mit Kissen. Wahnsinn.' },
  kitchen: { name: 'Küchenzeile', category: 'moebel', w: 2, d: 1, layer: 'object', comfort: 5, cost: { wood: 3, metal: 2, stone: 1, screws: 1 }, desc: 'Spüle, Arbeitsplatte, Gewürzregal.' },
  hammock: { name: 'Hängematte', category: 'moebel', w: 3, d: 1, layer: 'object', comfort: 6, cost: { cloth: 3, wood: 2 }, desc: 'Zwischen zwei Pfosten. Schaukeln, bis die Sterne kommen.' },
  // --- Licht ---
  fireBarrel: { name: 'Feuertonne', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: { metal: 2, wood: 1 }, starter: true, desc: 'Wärme und Licht für lange Abende.' },
  campfire: { name: 'Lagerfeuer', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: { stone: 2, wood: 1 }, starter: true, desc: 'Ein Ring aus Steinen, ein paar Scheite. Mehr braucht es nicht.' },
  lamp: { name: 'Stehlampe', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 4, cost: { metal: 1, glass: 1, electronics: 1, cloth: 1 }, desc: 'Läuft mit einer Autobatterie.' },
  vending: { name: 'Getränkeautomat', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 5, cost: { metal: 3, glass: 2, electronics: 2, plastic: 1 }, desc: 'Leuchtet noch. Leer ist er trotzdem.' },
  fairyLights: { name: 'Lichterkette', category: 'licht', w: 2, d: 1, layer: 'object', comfort: 6, cost: { electronics: 1, plastic: 1, glass: 1 }, desc: 'Macht aus einer Ruine ein Zuhause.' },
  stove: { name: 'Holzofen', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 6, cost: { metal: 4, stone: 1, screws: 1 }, unique: true, desc: 'Gusseisen, mit Ofenrohr. Kocht Eintopf: heilt dich ganz und macht 3 Stunden satt (mehr Beute).' },
  streetLamp: { name: 'Straßenlaterne', category: 'licht', w: 1, d: 1, layer: 'object', comfort: 3, cost: { metal: 3, glass: 1, electronics: 1 }, desc: 'Von der Hauptstraße abgeschraubt. Leuchtet wieder.' },
  // --- Deko ---
  crates: { name: 'Kistenstapel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 1, cost: { wood: 2 }, starter: true, desc: 'Stauraum. Und Deko, irgendwie.' },
  rug: { name: 'Teppich', category: 'deko', w: 2, d: 2, layer: 'floor', comfort: 3, cost: { cloth: 2 }, starter: true, desc: 'Fast wie früher.' },
  poster: { name: 'Poster', category: 'deko', w: 1, d: 1, layer: 'wall', comfort: 2, cost: { plastic: 1 }, starter: true, desc: 'Ein Konzert, das nie stattfand. Hängt an einer Wand.' },
  washline: { name: 'Wäscheleine', category: 'deko', w: 2, d: 1, layer: 'object', comfort: 2, cost: { wood: 1, cloth: 1 }, starter: true, desc: 'Frische Wäsche. Ein Zeichen, dass hier jemand lebt.' },
  toolwall: { name: 'Werkzeugwand', category: 'deko', w: 2, d: 1, layer: 'object', comfort: 3, cost: { wood: 2, metal: 2, screws: 2 }, desc: 'Jedes Werkzeug an seinem Platz.' },
  clock: { name: 'Bahnhofsuhr', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 5, cost: { metal: 2, glass: 1, electronics: 1 }, desc: 'Steht auf fünf vor zwölf. Für immer.' },
  timetable: { name: 'Fahrplantafel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 3, cost: { metal: 1, glass: 1 }, desc: 'Linie 0: alle 10 Minuten. Früher.' },
  medCabinet: { name: 'Sanitätsschrank', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 3, cost: { metal: 2, glass: 1, medicine: 1 }, unique: true, produces: { res: 'medicine', everyH: 8, cap: 2 }, desc: 'Verbandszeug immer griffbereit: 1 Medizin alle 8 Stunden, bis zu 2.' },
  radioSet: { name: 'Funkgerät', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 2, cost: { electronics: 3, metal: 2, screws: 2 }, unique: true, desc: 'Kurzwelle, Kanal 4. Alle 20 Stunden ein Funkspruch, manchmal mit einem Hinweis auf ein Versteck.' },
  picture: { name: 'Familienfoto', category: 'deko', w: 1, d: 1, layer: 'wall', comfort: 4, cost: { wood: 1, glass: 1 }, desc: 'Fremde Leute, die lachen. Trotzdem schön. Hängt an einer Wand.' },
  dartboard: { name: 'Dartscheibe', category: 'deko', w: 1, d: 1, layer: 'wall', comfort: 3, cost: { wood: 1, metal: 1 }, desc: 'Drei Pfeile fehlen. Einer steckt noch. Hängt an einer Wand.' },
  gnome: { name: 'Gartenzwerg', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 2, cost: { stone: 2 }, desc: 'Hat alles überlebt. Lächelt immer noch.' },
  solarPanel: { name: 'Solarpaneel', category: 'deko', w: 1, d: 1, layer: 'object', comfort: 2, cost: { glass: 2, electronics: 2, metal: 1 }, unique: true, desc: 'Strom von der Sonne. Ein Stück Zukunft.' },
  // --- Garten ---
  plant: { name: 'Pflanzenkübel', category: 'garten', w: 1, d: 1, layer: 'object', comfort: 2, cost: { stone: 1, water: 1 }, starter: true, desc: 'Etwas Grünes zwischen dem Beton.' },
  rainBarrel: { name: 'Regentonne', category: 'garten', w: 1, d: 1, layer: 'object', comfort: 2, cost: { plastic: 2, metal: 1 }, starter: true, unique: true, produces: { res: 'water', everyH: 3, cap: 6 }, desc: 'Fängt Regen auf: 1 Wasser alle 3 Stunden, bis zu 6.' },
  flowerBed: { name: 'Blumenbeet', category: 'garten', w: 2, d: 1, layer: 'object', comfort: 3, cost: { wood: 1, water: 1 }, starter: true, desc: 'Ringelblumen und Kapuzinerkresse.' },
  raisedBed: { name: 'Hochbeet', category: 'garten', w: 2, d: 1, layer: 'object', comfort: 4, cost: { wood: 4, water: 2 }, starter: true, unique: true, produces: { res: 'food', everyH: 4, cap: 6 }, desc: 'Kartoffeln, Bohnen, Kräuter: 1 Nahrung alle 4 Stunden, bis zu 6.' },
  appleTree: { name: 'Apfelbäumchen', category: 'garten', w: 1, d: 1, layer: 'object', comfort: 5, cost: { water: 2, food: 1 }, desc: 'In ein paar Jahren gibt es Äpfel. Wenn alles gut geht.' },
};

/** Sammelstücke als Deko: Werte kommen aus content.ts. */
const FOUND = Object.fromEntries(
  COLLECTIBLE_ORDER.map((id) => {
    const c = COLLECTIBLES[id];
    const def: FurnitureDef = { name: c.name, category: 'fund', w: c.w, d: c.d, layer: c.layer, comfort: c.comfort, cost: {}, starter: true, collectible: true, unique: true, desc: c.desc };
    return [id, def];
  }),
) as Record<CollectibleId, FurnitureDef>;

export const FURNITURE: Record<FurnitureId, FurnitureDef> = { ...BUILT, ...FOUND };

export const FURNITURE_ORDER = Object.keys(FURNITURE) as FurnitureId[];
export const CATEGORY_NAMES: Record<FurnitureCategory, string> = { moebel: 'Möbel', licht: 'Licht', deko: 'Deko', garten: 'Garten', fund: 'Sammelstücke' };

export function isCollectible(kind: FurnitureId): kind is CollectibleId {
  return !!FURNITURE[kind]?.collectible;
}

/** Grundfläche unter Berücksichtigung der Drehung. */
export function footprint(kind: FurnitureId, rot: number): { w: number; d: number } {
  const f = FURNITURE[kind];
  return rot % 2 === 0 ? { w: f.w, d: f.d } : { w: f.d, d: f.w };
}
