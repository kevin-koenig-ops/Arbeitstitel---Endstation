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

// --- Kampf ---------------------------------------------------------------------
export type EnemyId = 'walker' | 'crawler' | 'brute';
export type WeaponId = 'crowbar' | 'bat' | 'crossbow';
/** Wie gut der Timing-Moment getroffen wurde. Kommt vom Client, wirkt nur begrenzt. */
export type Quality = 'miss' | 'good' | 'perfect';
export type CombatMove = 'strike' | 'dodge' | 'distract' | 'heal' | 'flee';

export interface Weapon {
  kind: WeaponId;
  /** Verbleibende Schläge, bis die Waffe zerbricht. */
  dur: number;
}

export interface Combat {
  spot: Spot;
  enemy: EnemyId;
  enemyHp: number;
  round: number;
  /** Nach gutem Ausweichen: der nächste Schlag sitzt besser. */
  opening: boolean;
  /** Zeitfenster der Bewachung (für Beute und Zufall). */
  window: number;
}
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
  /** Gesundheit; erholt sich von selbst (siehe healthAt). */
  health: number;
  /** Bis zu diesem Zeitpunkt ist die Erholung eingerechnet. */
  healthAt: number;
  weapons: Weapon[];
  /** Laufender Kampf oder null. Bleibt beim Neuladen erhalten. */
  combat: Combat | null;
  stats: { searches: number; kills: number };
}

// --- Aktionen: das Einzige, was der Client an die Spiellogik schickt ---------

export type Action =
  | { type: 'session' }
  | { type: 'search'; spot: Spot; at: LatLon; accuracyM: number }
  | { type: 'build'; module: ModuleId }
  | { type: 'harvest' }
  | { type: 'engage'; spot: Spot; at: LatLon; accuracyM: number }
  | { type: 'fight'; move: CombatMove; quality: Quality }
  | { type: 'craft'; weapon: WeaponId }
  | { type: 'heal' };

export type RejectReason =
  | 'too_far'
  | 'cooldown'
  | 'cost'
  | 'locked'
  | 'already_built'
  | 'invalid_spot'
  | 'nothing'
  | 'guarded'
  | 'not_guarded'
  | 'exhausted'
  | 'no_combat'
  | 'no_medicine'
  | 'full_health';

export type GameEvent =
  | { type: 'loot'; spotId: string; items: Partial<Inventory>; memento?: string; bonus: boolean; perk?: Resource }
  | { type: 'built'; module: ModuleId }
  | { type: 'harvested'; items: Partial<Inventory> }
  | { type: 'returnBonus' }
  | { type: 'combatStarted'; enemy: EnemyId }
  | {
      type: 'round';
      move: CombatMove;
      quality: Quality;
      dealt: number;
      taken: number;
      dodged: boolean;
      stunned: boolean;
      healed: number;
      weaponBroke?: WeaponId;
    }
  | { type: 'combatWon'; enemy: EnemyId }
  | { type: 'combatLost'; enemy: EnemyId; dropped: Partial<Inventory> }
  | { type: 'fled' }
  | { type: 'crafted'; weapon: WeaponId }
  | { type: 'healed'; amount: number }
  | { type: 'rejected'; reason: RejectReason };

export interface RuleContext {
  now: number;
  worldSeed: string;
}

export interface ActionResult {
  state: PlayerState;
  events: GameEvent[];
}
