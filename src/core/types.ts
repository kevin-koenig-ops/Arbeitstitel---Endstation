// Kern-Datentypen des Spiels.
import type { FurnitureId } from './furniture';
import type { BlueprintId, FloorId, ObstacleKind, OpeningId, RoofId, SiteId, WallId } from './building';
export type { FurnitureId, SiteId };
//
// Wichtig für später (Mehrspieler): Alles in src/core ist reine Spiellogik ohne
// Browser-Abhängigkeiten. Derselbe Code kann später unverändert auf einem Server
// laufen und dort entscheiden, was ein Spieler findet.

/** Zum Überleben: wird verbraucht. */
export type Survival = 'food' | 'water' | 'medicine';
/** Rohstoffe: zum Bauen, Basteln und Aufrüsten. */
export type Material = 'wood' | 'metal' | 'stone' | 'cloth' | 'plastic' | 'glass' | 'glue' | 'screws' | 'electronics';
export type Resource = Survival | Material;
export type Inventory = Record<Resource, number>;

/** Kram: häufige Dinge von draußen, die man am Werktisch zu Rohstoffen zerlegt. */
export type KramId =
  | 'toaster'
  | 'toolbox'
  | 'trafficCone'
  | 'bottles'
  | 'carBattery'
  | 'gasCan'
  | 'tape'
  | 'sneakers'
  | 'radio'
  | 'tinCans'
  | 'blanket'
  | 'flashlight'
  | 'cableReel'
  | 'screwBox'
  | 'fruitCrate'
  | 'pan'
  | 'brokenPhone'
  | 'superglue';
export type KramBag = Partial<Record<KramId, number>>;

/** Sammelstücke: selten, jedes gibt es nur einmal. Fürs Fundbuch und zum Aufstellen. */
export type CollectibleId =
  | 'teddy'
  | 'wallClock'
  | 'tv'
  | 'phone'
  | 'typewriter'
  | 'guitar'
  | 'globe'
  | 'vase'
  | 'mirror'
  | 'bike'
  | 'rubberDuck'
  | 'painting'
  | 'sewingMachine';

/** Sammel-Sets im Fundbuch. */
export type SetId = 'wohnzimmer' | 'arbeitszimmer' | 'kinderzimmer' | 'gutestube';

/** Ein Auftrag am Werktisch: Kram wird bis endsAt zerlegt. */
export interface WorkshopJob {
  kram: KramId;
  endsAt: number;
}
export interface Workshop {
  /** Ausbaustufe des Werktischs (1–3). */
  level: number;
  /** Aufträge in Reihenfolge; fertige warten, bis man sie abholt. */
  jobs: WorkshopJob[];
}

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
  | 'stop'
  // Besondere Orte: einmal pro Gegend, fest aus dem Weltstartwert
  | 'heli'
  | 'convoy'
  | 'bunker'
  | 'camp'
  | 'mast'
  | 'airdrop';

export interface Spot {
  /** Stabile ID. Grid-Spots: "g:<zoom>:<x>:<y>:<i>", POI-Spots: "p:...", besondere Orte: "s:<x>:<y>:<k>" */
  id: string;
  kind: SpotKind;
  source: 'grid' | 'poi' | 'special';
  pos: LatLon;
  name: string;
}

export type BackgroundId = 'rescue' | 'workshop' | 'farm' | 'courier';

// --- Kampf ---------------------------------------------------------------------
export type EnemyId = 'walker' | 'crawler' | 'brute' | 'watcher';
export type WeaponId = 'crowbar' | 'bat' | 'crossbow';
/** Wie gut ein Geschicklichkeits-Moment lief (Mini-Spiel beim Durchsuchen). Kommt vom Client, wirkt nur begrenzt. */
export type Quality = 'miss' | 'good' | 'perfect';
/** Gegner im Kampf (der Heuler kommt nur im Kampf vor, nie als Wache). */
export type FoeKind = EnemyId | 'screamer';

export interface Weapon {
  kind: WeaponId;
  /** Verbleibende Schläge, bis die Waffe zerbricht. */
  dur: number;
}

export interface Combat {
  spot: Spot;
  /** Der Hauptgegner (Wache der Fundstelle). */
  enemy: EnemyId;
  /** Alle Gegner zu Beginn (Taktik-Kampf, siehe core/tactics.ts). */
  group: FoeKind[];
  /** Zeitfenster der Bewachung (für Beute und Zufall). */
  window: number;
  /** Beim Wühlen überrascht (dann gibt es keine Extra-Beute). */
  ambush?: boolean;
  /** Begegnung abseits der Wege im Wald (keine echte Fundstelle). */
  wild?: boolean;
}

/** Weiter wühlen nach dem Durchsuchen: mehr Beute, aber jedes Mal lauter. */
export interface DigState {
  spot: Spot;
  /** So oft schon gewühlt. */
  round: number;
  /** Lärm bisher. Wird er zu groß, kommt etwas. */
  noise: number;
  /** Bis wann man weiter wühlen darf. */
  until: number;
  window: number;
}

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
  /** Anlagen (Regentonne, Hochbeet): bis wann die Erträge abgeholt sind. */
  at?: number;
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

/** Dein Zuhause. Sein echter Ort steht NICHT hier, sondern nur auf dem Gerät. */
export interface BaseState {
  /** Gerade bewohnter Schauplatz (null = noch keiner gewählt). */
  active: SiteId | null;
  plots: Partial<Record<SiteId, Plot>>;
  /** Gefundene Lagepläne: Schauplatz -> Fundzeitpunkt. */
  found: Partial<Record<SiteId, number>>;
}


/** Kompletter Spielstand eines Spielers. Wird lokal gespeichert, später auf dem Server. */
export interface PlayerState {
  schema: number;
  playerId: string;
  createdAt: number;
  lastActiveAt: number;
  character: Character;
  /** Vorräte (Nahrung, Wasser, Medizin) und das Lager zu Hause (Rohstoffe). */
  inventory: Inventory;
  /** Kram im Lager zu Hause: id -> Anzahl. */
  kram: KramBag;
  /** Rucksack: was unterwegs gefunden wurde und noch nicht ausgepackt ist (nur Rohstoffe). */
  pack: Partial<Inventory>;
  /** Kram im Rucksack. */
  packKram: KramBag;
  /** Gefundene Sammelstücke: id -> Fundzeitpunkt. */
  collectibles: Partial<Record<CollectibleId, number>>;
  /** Vollständige Sets: id -> Zeitpunkt (Belohnung gab es dann). */
  sets: Partial<Record<SetId, number>>;
  /** Werktisch zu Hause (Zerlegen mit Wartezeit). */
  workshop: Workshop;
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
  /** Das Zuhause (Basis). Sein Ort steht NICHT hier, sondern nur auf dem Gerät. */
  base: BaseState;
  /** Gefundene Baupläne: id -> Fundzeitpunkt. */
  blueprints: Partial<Record<BlueprintId, number>>;
  stats: Stats;
  /** Abgeholte Ziele der Zielleiste: id -> Zeitpunkt. */
  goals: Partial<Record<GoalId, number>>;
  /** Weiter wühlen an der zuletzt durchsuchten Fundstelle, oder null. */
  dig: DigState | null;
  /** Schon einmal durchsuchte Fundstellen (Kurz-Kennungen), für den Erstfund-Bonus. */
  seen: number[];
  /** Offene Hinweise auf Verstecke (Zettel, Kreidezeichen, Funksprüche). */
  caches: Cache[];
  /** Wann zuletzt das Funkgerät etwas Neues gebracht hat. */
  radioAt: number;
  /** Bis wann du satt bist (Eintopf vom Holzofen): mehr Beute. */
  fedUntil: number;
  /** Letzte Begegnung im Unterholz (danach eine Weile Ruhe). */
  wildAt: number;
  /** Schon gefundene Ortstypen (fürs Fundbuch): Art -> Zeitpunkt. */
  places: Partial<Record<SpotKind, number>>;
  /** Entdeckte besondere Orte: ID -> Zeitpunkt. */
  discovered: Record<string, number>;
}

/** Ein Versteck, auf das ein Hinweis zeigt. Es läuft nie ab. */
export interface Cache {
  id: string;
  /** Wo es wirklich liegt (eine Fundstelle der Welt). */
  spot: Spot;
  /** Mitte des Suchkreises auf der Karte (absichtlich ungenau). */
  center: LatLon;
  /** Wo der Hinweis gefunden wurde. */
  fromName: string;
  fromPos: LatLon;
  at: number;
  /** note: Zettel, radio: Funkspruch, tracks: Spuren auf dem Boden */
  via: 'note' | 'radio' | 'tracks';
  /** Teil einer Zettel-Kette (Schritt von insgesamt). */
  chain?: { step: number; of: number };
  /** Spuren: Linie vom Fundort bis zum Versteck. */
  trail?: LatLon[];
  /** Eigener Suchradius (Spuren führen genauer hin). */
  areaM?: number;
}

export interface Stats {
  searches: number;
  kills: number;
  /** Wie oft der Rucksack zu Hause ausgepackt wurde. */
  unpacks: number;
  /** Zerlegter Kram (abgeholt). */
  dismantled: number;
  /** Am Werktisch gebaute Waffen. */
  crafted: number;
  /** Ausgegrabene Verstecke. */
  caches: number;
  /** Gekochte Eintöpfe. */
  cooked: number;
}

/** Die Ziele der Zielleiste (Reihenfolge und Inhalt in core/progress.ts). */
export type GoalId =
  | 'search3'
  | 'site'
  | 'unpack'
  | 'clear3'
  | 'workbench'
  | 'dismantle'
  | 'room'
  | 'tier1'
  | 'collectible'
  | 'win'
  | 'sector'
  | 'barrel'
  | 'tier2'
  | 'weapon'
  | 'set'
  | 'tier3'
  | 'upgrade'
  | 'secure'
  | 'tier4'
  | 'collect6'
  | 'crossbow'
  | 'tier5'
  | 'allSets'
  | 'tier6'
  | 'cook'
  | 'cache';

// --- Aktionen: das Einzige, was der Client an die Spiellogik schickt ---------

export type Action =
  | { type: 'session' }
  | { type: 'search'; spot: Spot; at: LatLon; accuracyM: number; quality?: Quality }
  /** Nach dem Durchsuchen weiter wühlen (riskant). */
  | { type: 'dig'; at: LatLon; accuracyM: number }
  /** Aufhören zu wühlen. */
  | { type: 'stopDig' }
  /** Abseits der Wege unterwegs (Meter seit der letzten Meldung). Im Wald kann dir etwas begegnen. */
  | { type: 'roam'; at: LatLon; accuracyM: number; meters: number; terrain: 'forest' }
  /** Nur im Testmodus (Simulation): sofort ein Kampf gegen diese Gegner. Der Server nimmt das später nicht an. */
  | { type: 'testFight'; at: LatLon; group: FoeKind[] }
  /** Ertrag einer Anlage (Regentonne, Hochbeet) abholen. */
  | { type: 'harvest'; uid: number }
  /** Zu Hause: alles aus dem Rucksack ins Lager. */
  | { type: 'unpack' }
  | { type: 'engage'; spot: Spot; at: LatLon; accuracyM: number }
  /** Ergebnis eines Echtzeitkampfs (Kampf 2.0). Später prüft der Server es anhand der Eingaben nach. */
  | { type: 'battleResult'; outcome: 'won' | 'lost' | 'fled'; health: number; kills: number; usedMedicine: number; wear?: Partial<Record<WeaponId, number>> }
  | { type: 'craft'; weapon: WeaponId }
  | { type: 'heal' }
  | { type: 'explore'; at: LatLon; accuracyM: number }
  // Basis: bewusst ohne Position, damit der Ort des Zuhauses privat bleibt
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
  | { type: 'demolish'; layer: 'walls' | 'openings' | 'floors' | 'roofs'; shape: 'line' | 'room' | 'rect'; x1: number; y1: number; x2: number; y2: number }
  /** Kram aus dem Lager auf den Werktisch legen (wird mit Wartezeit zerlegt). */
  | { type: 'dismantle'; kram: KramId }
  /** Fertig Zerlegtes vom Werktisch nehmen. */
  | { type: 'collect' }
  /** Werktisch eine Stufe aufrüsten. */
  | { type: 'upgradeWorkbench' }
  /** Belohnung für ein erreichtes Ziel abholen. */
  | { type: 'claimGoal'; goal: GoalId }
  | { type: 'openCache'; id: string; at: LatLon; accuracyM: number }
  | { type: 'listenRadio'; at: LatLon }
  | { type: 'cook' };

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
  | 'not_adjacent'
  | 'no_workbench'
  | 'queue_full'
  | 'no_junk'
  | 'only_one'
  | 'max_level'
  | 'not_done'
  | 'no_radio'
  | 'radio_quiet'
  | 'no_stove';

export type GameEvent =
  | { type: 'loot'; spotId: string; items: Partial<Inventory>; kram?: KramId; collectible?: CollectibleId; memento?: string; bonus: boolean; perk?: Resource; night?: boolean; blueprint?: BlueprintId; site?: SiteId; quality?: Quality; first?: boolean; canDig?: boolean; cart?: boolean; fed?: boolean; clue?: string; newKind?: boolean; discovery?: boolean; tier?: number }
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
  | { type: 'harvested'; items: Partial<Inventory> }
  | { type: 'returnBonus' }
  | { type: 'combatStarted'; enemy: EnemyId }
  | { type: 'dug'; items: Partial<Inventory>; kram?: KramId; collectible?: CollectibleId; round: number; noise: number; left: number }
  | { type: 'ambush'; group: FoeKind[] }
  | { type: 'wild'; group: FoeKind[] }
  | { type: 'combatWon'; enemy: EnemyId; kills?: number; weaponBroke?: WeaponId }
  | { type: 'combatLost'; enemy: EnemyId; dropped: Partial<Inventory>; weaponBroke?: WeaponId }
  | { type: 'fled'; weaponBroke?: WeaponId }
  | { type: 'crafted'; weapon: WeaponId }
  | { type: 'healed'; amount: number }
  | { type: 'dismantleQueued'; kram: KramId; endsAt: number }
  | { type: 'unpacked'; items: Partial<Inventory>; kram: KramBag }
  | { type: 'setCompleted'; set: SetId; items: Partial<Inventory>; blueprint?: BlueprintId }
  | { type: 'collected'; items: Partial<Inventory>; count: number }
  | { type: 'workbenchUpgraded'; level: number }
  | { type: 'goalClaimed'; goal: GoalId; items: Partial<Inventory>; blueprint?: BlueprintId }
  | { type: 'cacheOpened'; id: string; items: Partial<Inventory>; kram?: KramId; collectible?: CollectibleId; blueprint?: BlueprintId; next?: string; chainDone?: boolean }
  | { type: 'radio'; line: number; cache?: string }
  | { type: 'cooked'; until: number; healed: number }
  | { type: 'rejected'; reason: RejectReason };

export interface RuleContext {
  now: number;
  worldSeed: string;
  /** Orte, an denen nichts liegen darf (Friedhöfe, Schulen, Gebäude …). Kommt aus den Kartendaten. */
  blocked?: (p: LatLon) => boolean;
}

export interface ActionResult {
  state: PlayerState;
  events: GameEvent[];
}
