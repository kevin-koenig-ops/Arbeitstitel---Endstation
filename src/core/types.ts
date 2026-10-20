// Kern-Datentypen des Spiels.
import type { FurnitureId } from './furniture';
import type { BlueprintId, FloorId, ObstacleKind, OpeningId, RoofId, SiteId, WallId } from './building';
export type { FurnitureId, SiteId };
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

export interface PlacedItem {
  uid: number;
  kind: FurnitureId;
  x: number;
  y: number;
  /** Drehung in 90°-Schritten (0–3). */
  rot: number;
}

export interface WallPiece {
  k: WallId;
  /** Tür, Fenster, Durchgang oder Tor in dieser Wand. */
  o?: OpeningId;
}

/** Ein Gelände (pro Schauplatz eins). */
export interface Plot {
  /** Zurückeroberte Abschnitte "sx,sy". */
  sections: string[];
  /** Weggeräumte Hindernisse. */
  cleared: string[];
  /** Kante ("h3,4" / "v3,4") -> Wand. */
  walls: Record<string, WallPiece>;
  /** Feld "x,y" -> Boden. */
  floors: Record<string, FloorId>;
  /** Feld "x,y" -> Dach. */
  roofs: Record<string, RoofId>;
  items: PlacedItem[];
  nextUid: number;
}

/** Die Endstation. Ihr echter Ort steht NICHT hier, sondern nur auf dem Gerät. */
export interface BaseState {
  /** Gerade bewohnter Schauplatz (null = noch keiner gewählt). */
  active: SiteId | null;
  plots: Partial<Record<SiteId, Plot>>;
  /** Gefundene Lagepläne: Schauplatz -> Fundzeitpunkt. */
  found: Partial<Record<SiteId, number>>;
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
  /** Aufgedeckte Zellen, als Bitfelder pro Block (siehe core/explore.ts). */
  explored: Record<string, string>;
  /** Erreichte Stufe pro Sektor (1 = erkundet, 2 = gesichert). */
  sectors: Record<string, number>;
  /** Die Endstation (Basis). Ihr Ort steht NICHT hier, sondern nur auf dem Gerät. */
  base: BaseState;
  /** Gefundene Baupläne: id -> Fundzeitpunkt. */
  blueprints: Partial<Record<BlueprintId, number>>;
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
  /** Ergebnis eines Echtzeitkampfs (Kampf 2.0). Später prüft der Server es anhand der Eingaben nach. */
  | { type: 'battleResult'; outcome: 'won' | 'lost' | 'fled'; health: number; kills: number; usedMedicine: number }
  | { type: 'craft'; weapon: WeaponId }
  | { type: 'heal' }
  | { type: 'explore'; at: LatLon; accuracyM: number }
  // Basis: bewusst ohne Position, damit der Ort der Endstation privat bleibt
  | { type: 'chooseSite'; site: SiteId }
  | { type: 'reclaim'; sx: number; sy: number }
  | { type: 'clearObstacle'; id: string }
  | { type: 'place'; kind: FurnitureId; x: number; y: number; rot: number }
  | { type: 'move'; uid: number; x: number; y: number; rot: number }
  | { type: 'store'; uid: number }
  /** Wände/Zäune von Ecke zu Ecke: als Linie oder als Rechteck (Raum). */
  | { type: 'buildWalls'; piece: WallId; shape: 'line' | 'room'; x1: number; y1: number; x2: number; y2: number }
  /** Tür, Fenster usw. in vorhandene Wände entlang einer Linie. */
  | { type: 'setOpening'; piece: OpeningId; x1: number; y1: number; x2: number; y2: number }
  /** Böden oder Dächer in einem Rechteck (Felder). */
  | { type: 'paint'; layer: 'floors' | 'roofs'; piece: FloorId | RoofId; x1: number; y1: number; x2: number; y2: number }
  /** Abreißen: Wände/Öffnungen als Linie oder Rechteck (Ecken), Böden/Dächer als Rechteck (Felder). */
  | { type: 'demolish'; layer: 'walls' | 'openings' | 'floors' | 'roofs'; shape: 'line' | 'room' | 'rect'; x1: number; y1: number; x2: number; y2: number };

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
  | 'full_health'
  | 'blocked'
  | 'no_blueprint'
  | 'not_found'
  | 'no_site'
  | 'no_wall'
  | 'not_adjacent';

export type GameEvent =
  | { type: 'loot'; spotId: string; items: Partial<Inventory>; memento?: string; bonus: boolean; perk?: Resource; night?: boolean; blueprint?: BlueprintId; site?: SiteId }
  | { type: 'siteChosen'; site: SiteId; first: boolean }
  | { type: 'reclaimed'; section: string; cost: Partial<Inventory> }
  | { type: 'obstacleCleared'; id: string; kind: ObstacleKind; reward: Partial<Inventory> }
  | { type: 'placed'; uid: number; kind: FurnitureId }
  | { type: 'moved'; uid: number }
  | { type: 'stored'; uid: number; refund: Partial<Inventory> }
  | { type: 'constructed'; layer: 'walls' | 'openings' | 'floors' | 'roofs'; count: number; cost: Partial<Inventory>; refund: Partial<Inventory>; stored: number }
  | { type: 'demolished'; layer: 'walls' | 'openings' | 'floors' | 'roofs'; count: number; refund: Partial<Inventory>; stored: number }
  | { type: 'explored'; added: number }
  | { type: 'sector'; key: string; level: number; reward: Partial<Inventory> }
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
  | { type: 'combatWon'; enemy: EnemyId; kills?: number; weaponBroke?: WeaponId }
  | { type: 'combatLost'; enemy: EnemyId; dropped: Partial<Inventory>; weaponBroke?: WeaponId }
  | { type: 'fled'; weaponBroke?: WeaponId }
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
