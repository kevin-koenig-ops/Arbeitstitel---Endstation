// Kern-Datentypen des Spiels.
import type { CardId, CardRarity } from './content';
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
export type Material =
  | 'wood'
  | 'metal'
  | 'stone'
  | 'cloth'
  | 'plastic'
  | 'glass'
  | 'rubber'
  | 'leather'
  | 'screws'
  | 'springs'
  | 'gears'
  | 'copper'
  | 'glue'
  | 'oil'
  | 'electronics'
  | 'cells'
  | 'antiseptic'
  | 'phosphate';
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
  | 'superglue'
  | 'carRadio'
  | 'jack'
  | 'wiperBlades'
  | 'firstAidKit'
  | 'hubcap'
  | 'motorOil'
  | 'spareTire'
  | 'thermos'
  | 'powerbank'
  | 'headphones'
  | 'umbrella'
  | 'hedgeShears'
  | 'gardenHose'
  | 'fertilizer'
  | 'bikeLock'
  | 'bikeParts'
  | 'oilCan'
  | 'mousetrap'
  | 'cordlessDrill'
  | 'copperWire'
  | 'bucket'
  | 'leatherJacket'
  | 'handbag'
  | 'rubberBoots'
  | 'alarmClock'
  | 'kitchenScale'
  | 'kettle'
  | 'speaker'
  | 'deskFan'
  | 'hairDryer'
  | 'clothesIron'
  | 'coffeeMachine'
  | 'schnapps'
  | 'cashRegister'
  | 'bloodPressure'
  | 'disinfectant'
  | 'hotWaterBottle'
  | 'binoculars'
  | 'lantern'
  | 'gasMask'
  | 'mixer'
  | 'waffleIron'
  | 'cookingPot'
  | 'teapot'
  | 'picnicBasket'
  | 'cuckooClock'
  | 'sewingKit'
  | 'typewriter'
  | 'telephone'
  | 'vacuum'
  | 'boombox'
  | 'gameConsole'
  | 'laptop'
  | 'tablet'
  | 'tableLamp'
  | 'lightBulbs'
  | 'powerStrip'
  | 'batteries'
  | 'candles'
  | 'magazines'
  | 'boardGame'
  | 'readingGlasses'
  | 'gauze'
  | 'crutch'
  | 'shovel'
  | 'wateringCan'
  | 'mowerEngine'
  | 'gardenGloves'
  | 'birdhouse'
  | 'clayPot'
  | 'chainsaw'
  | 'tarp'
  | 'rope'
  | 'paintCan'
  | 'woodGlue'
  | 'nails'
  | 'padlock'
  | 'spiritLevel'
  | 'multimeter'
  | 'bricks'
  | 'sparkPlugs'
  | 'jumperCables'
  | 'sideMirror'
  | 'licensePlate'
  | 'warningTriangle'
  | 'shoppingCart'
  | 'canOpener'
  | 'glassCleaner'
  | 'cookingOil'
  | 'coolBox'
  | 'antifreeze'
  | 'roadAtlas'
  | 'energyCans'
  | 'sunglasses'
  | 'walkman'
  | 'waterBottle'
  | 'keyring'
  | 'wallet'
  | 'compass'
  | 'pocketKnife'
  | 'harmonica'
  | 'playingCards'
  | 'sleepingBag'
  | 'campStove'
  | 'messTin'
  | 'trailCam'
  | 'winterCoat'
  | 'workBoots'
  | 'leatherBelt'
  | 'raincoat'
  | 'walkieTalkie'
  | 'flareGun'
  | 'ammoCrate'
  | 'rationPack'
  | 'hardHat'
  | 'emptyExtinguisher'
  | 'toolBag'
  | 'solarLight'
  | 'relayBox'
  | 'pilotHelmet'
  | 'flightRecorder'
  | 'jerrycan'
  | 'sandbag'
  | 'barbedWire'
  | 'camoNet'
  | 'gasBottle'
  | 'handPump'
  | 'milkCan'
  | 'horseshoe'
  | 'pitchfork'
  | 'boneMeal'
  | 'tractorPart'
  | 'dashCam'
  | 'airFreshener'
  | 'iceScraper'
  | 'towRope'
  | 'navi'
  | 'parkingDisc'
  | 'beadSeat'
  | 'diary'
  | 'lunchbox'
  | 'pencilCase'
  | 'waterFilter'
  | 'headlamp'
  | 'emergencyBlanket'
  | 'gardenGnome'
  | 'wheelbarrowWheel'
  | 'hatchet'
  | 'seedPackets'
  | 'grillGrate'
  | 'deckChair'
  | 'vise'
  | 'blender'
  | 'microwave'
  | 'knittingBasket'
  | 'slideProjector'
  | 'snowGlobe'
  | 'photoAlbum'
  | 'vinylRecords'
  | 'recordPlayer'
  | 'cassetteTapes'
  | 'ashtray'
  | 'fondueSet'
  | 'deerCall'
  | 'saltLick'
  | 'rangefinder'
  | 'hipFlask'
  | 'siphonPump'
  | 'barrelTap'
  | 'pondPump'
  | 'cementBag'
  | 'smartSpeaker'
  | 'yogaMat'
  | 'airFryer'
  | 'ledStrip'
  | 'robotVacuum'
  | 'fitnessTracker'
  | 'priceGun'
  | 'shopBasket'
  | 'barcodeScanner'
  | 'aluFoil'
  | 'storageJars'
  | 'pillOrganizer'
  | 'thermometer'
  | 'coldPack'
  | 'rollator'
  | 'hearingAid'
  | 'iodine'
  | 'stethoscope'
  | 'mortar'
  | 'caulkGun'
  | 'drillBits'
  | 'cableTies'
  | 'pipeWrench'
  | 'insulationRoll'
  | 'sandpaper'
  | 'measuringTape'
  | 'windshieldFluid'
  | 'lotteryTickets'
  | 'hotDogRoller'
  | 'motorcycleHelmet'
  | 'oilFilter'
  | 'pulleyWheel'
  | 'tinCup'
  | 'wishingCoins'
  | 'timetablePoster'
  | 'ticketPrinter'
  | 'bikeHelmet'
  | 'lostGlove'
  | 'benchSlats'
  | 'cockpitGauge'
  | 'pilotHeadset'
  | 'stretcher'
  | 'fieldPhone'
  | 'seaBag'
  | 'mudFlap'
  | 'mapCase'
  | 'radioBattery'
  | 'geigerCounter'
  | 'airFilter'
  | 'ventFan'
  | 'guardLog'
  | 'bunkSprings'
  | 'tentPegs'
  | 'washBasin'
  | 'fireSteel'
  | 'mosquitoNet'
  | 'antennaCable'
  | 'aviationLight'
  | 'circuitBoard'
  | 'cargoNet'
  | 'gpsBeacon';
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
  // Nur im Wald (die Karte filtert), wandert wie die Grid-Fundstellen
  | 'mushrooms'
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
  /** Liegt nur in diesem Gelände, sonst blendet die Karte die Fundstelle aus (wild: weit weg von Siedlungen). */
  biome?: 'forest' | 'wild';
}

export type BackgroundId = 'rescue' | 'workshop' | 'farm' | 'courier';

// --- Kampf ---------------------------------------------------------------------
export type EnemyId = 'walker' | 'crawler' | 'brute' | 'watcher';
export type WeaponId = 'crowbar' | 'bat' | 'crossbow' | 'shovel' | 'axe' | 'golfclub' | 'slingshot' | 'nailgun';
/** Wie gut ein Geschicklichkeits-Moment lief (Mini-Spiel beim Durchsuchen). Kommt vom Client, wirkt nur begrenzt. */
export type Quality = 'miss' | 'good' | 'perfect';
/** Gegner im Kampf (der Heuler kommt nur im Kampf vor, nie als Wache). */
export type FoeKind = EnemyId | 'screamer';

/** Eintrag im Sammelbuch. */
export interface BookEntry {
  /** So oft gefunden (bei Fähigkeiten: daraus die Stufe). */
  n: number;
  /** Zuerst gefunden. */
  at: number;
  /** Eine leuchtende Fassung gefunden. */
  shiny?: boolean;
}

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
  /** Kampf gegen einen Trupp auf der Karte (seine Kennung). */
  patrol?: string;
  /** Wer wen zuerst gesehen hat: Überraschungsangriff von dir oder du wurdest entdeckt. */
  opening?: Opening;
}

/** Wie ein Kampf mit einem Trupp beginnt. */
export type Opening = 'surprise' | 'spotted';

// --- Gelände, Gegenden, Weltereignisse -------------------------------------------

/** Untergrund an einer Stelle (aus den Kartendaten). blocked = Haus oder Wasser. */
export type TerrainKind = 'road' | 'built' | 'open' | 'field' | 'forest' | 'wetland' | 'blocked';
/** Jahreszeit (für Deckung im Kornfeld, kahle Wälder, Spuren im Schnee). */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** Wetter, wie es das Spiel kennt (echtes Wetter, grob eingeteilt). */
export type Sky = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
/** Art der Gegend rund um den Spieler (aus den Kartendaten). */
export type RegionId = 'city' | 'town' | 'village' | 'wild' | 'mountain' | 'coast' | 'desert' | 'snow';
/** Weltereignis: Staubsturm, Horde, Sperrgebiet, Hilfsabwurf. */
export type WorldEventKind = 'dust' | 'horde' | 'quarantine' | 'drop';

export interface WorldEvent {
  /** Stabile Kennung: "x:<x>:<y>:<fenster>" */
  id: string;
  kind: WorldEventKind;
  center: LatLon;
  /** Umkreis der Zone (0 beim Hilfsabwurf: dort liegt nur eine Kiste). */
  radiusM: number;
  from: number;
  until: number;
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
  /** Aussehen; portrait = gewähltes Porträt (Nummer in PORTRAITS). */
  look: { hair: number; color: number; skin: number; portrait?: number };
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
/** Plätze am Körper für Ausrüstung (die Waffe hat ihren eigenen Platz). */
export type GearSlot = 'head' | 'face' | 'body' | 'hands' | 'legs' | 'feet' | 'back';

export type GearId =
  | 'beanie'
  | 'bikeHelmet'
  | 'hardHat'
  | 'dustMask'
  | 'safetyGoggles'
  | 'gasMask'
  | 'rainJacket'
  | 'workJacket'
  | 'protectiveVest'
  | 'gardenGloves'
  | 'workGloves'
  | 'jeans'
  | 'workTrousers'
  | 'rainTrousers'
  | 'sneakers'
  | 'workBoots'
  | 'rubberBoots'
  | 'oldBackpack'
  | 'hikingPack'
  | 'armyPack';

export interface GearState {
  /** Gefundene Ausrüstung: id -> Fundzeitpunkt (jedes Teil gibt es einmal). */
  owned: Partial<Record<GearId, number>>;
  /** Was du gerade trägst: Platz -> Teil. */
  worn: Partial<Record<GearSlot, GearId>>;
}

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
  /** Einmal-Karten, die du dabeihast (Brandflasche, Granate …). In den Kampf kommt die Tasche: 3 Sorten, je bis zu 3. */
  packCards: Partial<Record<CardId, number>>;
  /** Einmal-Karten im Lager zu Hause. */
  stash: Partial<Record<CardId, number>>;
  /** Sammelbuch: alles, was du an Sammelkarten je gefunden hast (Karten-id oder „w:<Waffe>“). */
  book: Record<string, BookEntry>;
  /** Sichtungen, die du schon aufgehoben hast: id -> Zeitpunkt (alte fallen raus). */
  sightings: Record<string, number>;
  /** Glück mit Netz: Sichtungen seit dem letzten seltenen bzw. legendären Fund. */
  pity: { rare: number; legendary: number };
  /**
   * Zu Hause gewählt: welche Sorten in die Tasche kommen (3), welche Fähigkeiten mitgehen (4) und
   * welche Nahkampf- und Fernkampfwaffe (leer = automatisch die stärkste).
   */
  loadout: { pouch: CardId[]; skills: CardId[]; melee?: WeaponId; ranged?: WeaponId };
  /** Wann „Letztes Gefecht“ zuletzt gerettet hat (einmal am Tag). */
  lastStandAt?: number;
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
  /** Kleidung und Ausrüstung am Körper (Kopf, Gesicht, Oberkörper, Hände, Beine, Füße, Rücken). */
  gear: GearState;
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
  /** Besiegte Trupps (Kennung -> Zeitpunkt): Sie sind für ihre Runde verschwunden. */
  patrols: Record<string, number>;
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
  /** Kampf mit einem Trupp auf der Karte: du greifst aus dem Versteck an (surprise) oder er hat dich entdeckt (spotted). */
  | { type: 'patrolFight'; patrol: string; at: LatLon; accuracyM: number; opening: Opening; region: RegionId }
  /** Nur im Testmodus (Simulation): sofort ein Kampf gegen diese Gegner. Der Server nimmt das später nicht an. */
  | { type: 'testFight'; at: LatLon; group: FoeKind[] }
  /** Ertrag einer Anlage (Regentonne, Hochbeet) abholen. */
  | { type: 'harvest'; uid: number }
  /** Zu Hause: alles aus dem Rucksack ins Lager. */
  | { type: 'unpack' }
  | { type: 'engage'; spot: Spot; at: LatLon; accuracyM: number }
  /** Ergebnis eines Echtzeitkampfs (Kampf 2.0). Später prüft der Server es anhand der Eingaben nach. */
  | { type: 'battleResult'; outcome: 'won' | 'lost' | 'fled'; health: number; kills: number; usedMedicine: number; wear?: Partial<Record<WeaponId, number>>; used?: Partial<Record<CardId, number>>; lastStand?: boolean }
  | { type: 'craftCard'; card: CardId }
  | { type: 'claimSighting'; id: string; candidate: number; at: LatLon; accuracyM: number }
  /** Nur zum Testen: eine Sammelkarte oder Waffe bekommen. */
  | { type: 'testGift'; card?: CardId; weapon?: WeaponId }
  /** Zu Hause: Tasche und Fähigkeiten für den Kampf wählen. */
  | { type: 'setLoadout'; pouch?: CardId[]; skills?: CardId[]; melee?: WeaponId | null; ranged?: WeaponId | null }
  | { type: 'craft'; weapon: WeaponId }
  | { type: 'heal' }
  /** Ein Teil anziehen (ersetzt, was an diesem Platz war). */
  | { type: 'equip'; gear: GearId }
  /** Einen Platz frei machen. */
  | { type: 'unequip'; slot: GearSlot }
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
  | 'no_stove'
  | 'no_gear'
  | 'too_many'
  | 'zone_closed'
  | 'need_filter'
  | 'gone'
  | 'already';

export type GameEvent =
  | { type: 'loot'; spotId: string; items: Partial<Inventory>; card?: CardId; weapon?: WeaponId; kram?: KramId; collectible?: CollectibleId; memento?: string; bonus: boolean; perk?: Resource; night?: boolean; blueprint?: BlueprintId; gear?: GearId; site?: SiteId; quality?: Quality; first?: boolean; canDig?: boolean; cart?: boolean; fed?: boolean; clue?: string; newKind?: boolean; discovery?: boolean; tier?: number }
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
  | { type: 'patrol'; group: FoeKind[]; opening: Opening }
  | { type: 'combatWon'; enemy: EnemyId; kills?: number; weaponBroke?: WeaponId }
  | { type: 'combatLost'; enemy: EnemyId; dropped: Partial<Inventory>; droppedKram: KramBag; droppedCards?: Partial<Record<CardId, number>>; weaponBroke?: WeaponId }
  | { type: 'fled'; weaponBroke?: WeaponId }
  | { type: 'crafted'; weapon?: WeaponId; card?: CardId }
  | { type: 'sightingClaimed'; id: string; card?: CardId; weapon?: WeaponId; repaired?: boolean; rarity: CardRarity; shiny: boolean; level?: number; levelUp?: boolean; pity?: boolean }
  | { type: 'gifted'; card?: CardId; weapon?: WeaponId; repaired?: boolean; level?: number; levelUp?: boolean }
  | { type: 'loadoutSet'; pouch: CardId[]; skills: CardId[]; melee?: WeaponId; ranged?: WeaponId }
  | { type: 'healed'; amount: number }
  | { type: 'equipped'; slot: GearSlot; gear: GearId | null }
  | { type: 'dismantleQueued'; kram: KramId; endsAt: number }
  | { type: 'unpacked'; items: Partial<Inventory>; kram: KramBag; cards?: Partial<Record<CardId, number>> }
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
