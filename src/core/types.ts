// Kern-Datentypen des Spiels.
//
// Wichtig für später (Mehrspieler): Alles in src/core ist reine Spiellogik ohne
// Browser-Abhängigkeiten. Derselbe Code kann später unverändert auf einem Server
// laufen und dort entscheiden, was ein Spieler findet.

export type Resource = 'food' | 'water' | 'medicine' | 'material';
export type Inventory = Record<Resource, number>;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Art einer Fundstelle. "grid" = überall verteilt, "poi" = echter Ort aus der Karte. */
export type SpotKind =
  | 'car'
  | 'backpack'
  | 'shed'
  | 'container'
  | 'hide'
  | 'barrel'
  | 'parcel'
  | 'market'
  | 'pharmacy'
  | 'hardware'
  | 'fuel'
  | 'well'
  | 'stop';

export interface Spot {
  /** Stabile ID. Grid-Spots: "g:<zoom>:<x>:<y>:<i>", POI-Spots: "p:..." */
  id: string;
  kind: SpotKind;
  source: 'grid' | 'poi';
  pos: LatLon;
  name: string;
}

export type BackgroundId = 'rescue' | 'workshop' | 'farm' | 'courier';
export type ModuleId = 'rainBarrel' | 'workbench' | 'roofGarden' | 'medBay' | 'radio';

export interface Character {
  name: string;
  look: { hair: number; color: number; skin: number };
  background: BackgroundId;
}

export interface BuiltModule {
  builtAt: number;
  /** Zeitpunkt, bis zu dem die passive Produktion abgeholt wurde. */
  lastHarvestAt: number;
}

/** Kompletter Spielstand eines Spielers. Wird lokal gespeichert, später auf dem Server. */
export interface PlayerState {
  schema: number;
  playerId: string;
  createdAt: number;
  lastActiveAt: number;
  character: Character;
  inventory: Inventory;
  bus: { modules: Partial<Record<ModuleId, BuiltModule>> };
  /** Wann welche Fundstelle zuletzt durchsucht wurde (für die Abklingzeit). */
  spots: Record<string, number>;
  /** Gefundene Erinnerungsstücke: id -> Fundzeitpunkt. */
  collection: Record<string, number>;
  /** Nach einer Pause ist die nächste Suche doppelt so ergiebig. */
  returnBonus: boolean;
  stats: { searches: number };
}

// --- Aktionen: das Einzige, was der Client an die Spiellogik schickt ---------

export type Action =
  | { type: 'session' }
  | { type: 'search'; spot: Spot; at: LatLon; accuracyM: number }
  | { type: 'build'; module: ModuleId }
  | { type: 'harvest' };

export type RejectReason = 'too_far' | 'cooldown' | 'cost' | 'locked' | 'already_built' | 'invalid_spot' | 'nothing';

export type GameEvent =
  | { type: 'loot'; spotId: string; items: Partial<Inventory>; memento?: string; bonus: boolean; perk?: Resource }
  | { type: 'built'; module: ModuleId }
  | { type: 'harvested'; items: Partial<Inventory> }
  | { type: 'returnBonus' }
  | { type: 'rejected'; reason: RejectReason };

export interface RuleContext {
  now: number;
  worldSeed: string;
}

export interface ActionResult {
  state: PlayerState;
  events: GameEvent[];
}
