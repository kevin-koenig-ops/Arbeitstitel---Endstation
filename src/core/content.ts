// Spielinhalte als reine Daten. Neue Fundorte, Gegenstände oder Ausbauten
// kommen hier dazu, ohne dass sich die Logik ändern muss.

import type { BackgroundId, CollectibleId, EnemyId, Inventory, KramId, Material, Quality, Resource, SetId, SpotKind, Survival, Weapon, WeaponId } from './types';

export const SURVIVAL_ORDER: Survival[] = ['food', 'water', 'medicine'];
/** Rohstoffe, grob von häufig nach selten. */
export const MATERIAL_ORDER: Material[] = ['wood', 'metal', 'stone', 'cloth', 'plastic', 'glass', 'glue', 'screws', 'electronics'];
export const RESOURCE_ORDER: Resource[] = [...SURVIVAL_ORDER, ...MATERIAL_ORDER];

export function isMaterial(r: Resource): r is Material {
  return (MATERIAL_ORDER as Resource[]).includes(r);
}

export const RESOURCES: Record<Resource, { name: string; where?: string }> = {
  food: { name: 'Nahrung' },
  water: { name: 'Wasser' },
  medicine: { name: 'Medizin' },
  wood: { name: 'Holz', where: 'Schuppen, Bäume, Baumarkt' },
  metal: { name: 'Metall', where: 'Autos, Schrott, Werkzeug' },
  stone: { name: 'Stein', where: 'Schutt und Felsen in der Endstation' },
  cloth: { name: 'Stoff', where: 'Rucksäcke, Kleidercontainer, Teddys' },
  plastic: { name: 'Kunststoff', where: 'Fast überall, besonders Pakete' },
  glass: { name: 'Glas', where: 'Flaschen, Spiegel, Fernseher' },
  glue: { name: 'Kleber', where: 'Baumarkt, Klebeband, Pakete' },
  screws: { name: 'Schrauben', where: 'Werkzeugkästen, Schuppen, Autos' },
  electronics: { name: 'Elektronik', where: 'Radios, Batterien, Fernseher' },
};

export function emptyInventory(): Inventory {
  return Object.fromEntries(RESOURCE_ORDER.map((r) => [r, 0])) as Inventory;
}

export const START_INVENTORY: Inventory = { ...emptyInventory(), food: 2, water: 2, wood: 3, metal: 2 };

/** Basis-Suchradius in Metern. GPS ist draußen meist auf 5–20 m genau. */
export const BASE_SEARCH_RANGE_M = 45;

/** Nach so vielen Stunden Pause gibt es den Rückkehr-Bonus. */
export const RETURN_BONUS_AFTER_H = 20;

interface LootRule {
  res: Resource;
  min: number;
  max: number;
  chance: number;
}

export interface SpotKindDef {
  names: string[];
  hint: string;
  cooldownMin: number;
  loot: LootRule[];
  /** Chance auf Kram und welcher hier liegt (mit Gewicht). */
  kramChance: number;
  kram: readonly (readonly [KramId, number])[];
  /** Welche Sammelstücke man hier finden kann (jedes nur einmal im Spiel). */
  collectibles: readonly CollectibleId[];
  mementoChance: number;
}

export const SPOT_KINDS: Record<SpotKind, SpotKindDef> = {
  // --- überall verteilt (Grid) ---
  car: {
    names: ['Verlassenes Auto', 'Ausgebrannter Kombi', 'Liegengebliebener Lieferwagen', 'Auto mit offener Tür'],
    hint: 'Metall, Kunststoff, Werkzeug im Kofferraum',
    cooldownMin: 60,
    loot: [
      { res: 'metal', min: 1, max: 2, chance: 1 },
      { res: 'plastic', min: 1, max: 1, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.3 },
      { res: 'screws', min: 1, max: 1, chance: 0.25 },
      { res: 'water', min: 1, max: 1, chance: 0.4 },
      { res: 'food', min: 1, max: 1, chance: 0.25 },
    ],
    kramChance: 0.4,
    kram: [['carBattery', 3], ['gasCan', 3], ['trafficCone', 2], ['toolbox', 2], ['radio', 2], ['cableReel', 1], ['tape', 1], ['brokenPhone', 1]],
    collectibles: ['guitar', 'teddy'],
    mementoChance: 0.06,
  },
  backpack: {
    names: ['Zurückgelassener Rucksack', 'Reisetasche am Wegrand', 'Verlorener Schulranzen'],
    hint: 'Proviant, Wasser, Stoff, manchmal Verbandszeug',
    cooldownMin: 60,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.7 },
      { res: 'water', min: 1, max: 2, chance: 0.6 },
      { res: 'cloth', min: 1, max: 1, chance: 0.5 },
      { res: 'medicine', min: 1, max: 1, chance: 0.3 },
      { res: 'plastic', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.4,
    kram: [['sneakers', 3], ['blanket', 2], ['flashlight', 2], ['tinCans', 2], ['brokenPhone', 2], ['radio', 1]],
    collectibles: ['teddy', 'rubberDuck'],
    mementoChance: 0.1,
  },
  shed: {
    names: ['Gartenlaube', 'Geräteschuppen', 'Schrebergarten'],
    hint: 'Eingemachtes, Holz, Werkzeug, Schrauben',
    cooldownMin: 60,
    loot: [
      { res: 'wood', min: 1, max: 2, chance: 0.85 },
      { res: 'food', min: 1, max: 2, chance: 0.6 },
      { res: 'metal', min: 1, max: 1, chance: 0.4 },
      { res: 'screws', min: 1, max: 1, chance: 0.3 },
      { res: 'glue', min: 1, max: 1, chance: 0.2 },
    ],
    kramChance: 0.35,
    kram: [['toolbox', 2], ['screwBox', 2], ['fruitCrate', 3], ['tinCans', 1], ['superglue', 1], ['pan', 1]],
    collectibles: ['wallClock', 'vase', 'bike', 'sewingMachine'],
    mementoChance: 0.06,
  },
  container: {
    names: ['Altkleidercontainer', 'Umgekippter Müllcontainer', 'Bauschuttmulde'],
    hint: 'Stoff, Kunststoff, Schrott, mit Glück Verbandszeug',
    cooldownMin: 60,
    loot: [
      { res: 'cloth', min: 1, max: 2, chance: 0.7 },
      { res: 'plastic', min: 1, max: 1, chance: 0.6 },
      { res: 'metal', min: 1, max: 1, chance: 0.4 },
      { res: 'stone', min: 1, max: 2, chance: 0.3 },
      { res: 'medicine', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.45,
    kram: [['sneakers', 2], ['blanket', 3], ['toaster', 2], ['bottles', 2], ['pan', 2], ['brokenPhone', 1], ['cableReel', 1]],
    collectibles: ['mirror', 'painting', 'tv', 'phone'],
    mementoChance: 0.05,
  },
  hide: {
    names: ['Hochsitz', 'Jagdhütte', 'Alter Unterstand'],
    hint: 'Dosen, Wasserflaschen, Bretter',
    cooldownMin: 60,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.6 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'wood', min: 1, max: 2, chance: 0.6 },
      { res: 'cloth', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.3,
    kram: [['tinCans', 3], ['bottles', 2], ['flashlight', 2], ['blanket', 1], ['radio', 1]],
    collectibles: ['guitar'],
    mementoChance: 0.08,
  },
  barrel: {
    names: ['Regentonne', 'Wassertank', 'Volle Zisterne'],
    hint: 'Wasser, abgekocht trinkbar',
    cooldownMin: 60,
    loot: [
      { res: 'water', min: 2, max: 3, chance: 1 },
      { res: 'metal', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.1,
    kram: [['bottles', 1], ['tinCans', 1]],
    collectibles: [],
    mementoChance: 0.02,
  },
  parcel: {
    names: ['Packstation', 'Stapel Pakete', 'Liegengebliebener Paketwagen'],
    hint: 'Alles Mögliche. Selten, aber ergiebig.',
    cooldownMin: 90,
    loot: [
      { res: 'food', min: 1, max: 3, chance: 0.6 },
      { res: 'plastic', min: 1, max: 2, chance: 0.6 },
      { res: 'medicine', min: 1, max: 2, chance: 0.45 },
      { res: 'electronics', min: 1, max: 1, chance: 0.35 },
      { res: 'glue', min: 1, max: 1, chance: 0.35 },
      { res: 'cloth', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.55,
    kram: [['radio', 2], ['brokenPhone', 2], ['cableReel', 2], ['superglue', 2], ['tape', 1], ['flashlight', 1], ['toaster', 1], ['screwBox', 1]],
    collectibles: ['globe', 'typewriter', 'painting', 'teddy', 'rubberDuck', 'sewingMachine', 'wallClock', 'guitar'],
    mementoChance: 0.18,
  },
  // --- echte Orte aus der Karte (POI) ---
  market: {
    names: ['Geplünderter Supermarkt', 'Dorfladen', 'Bäckerei mit Vorratskeller'],
    hint: 'Viel Nahrung und Wasser, dazu Kunststoff und Glas',
    cooldownMin: 180,
    loot: [
      { res: 'food', min: 3, max: 5, chance: 1 },
      { res: 'water', min: 2, max: 4, chance: 0.9 },
      { res: 'plastic', min: 1, max: 2, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.4 },
      { res: 'medicine', min: 1, max: 1, chance: 0.2 },
    ],
    kramChance: 0.3,
    kram: [['bottles', 3], ['tinCans', 3], ['pan', 1], ['toaster', 1]],
    collectibles: ['vase', 'rubberDuck'],
    mementoChance: 0.12,
  },
  pharmacy: {
    names: ['Apotheke', 'Arztpraxis', 'Notaufnahme'],
    hint: 'Medikamente und Verbandszeug',
    cooldownMin: 180,
    loot: [
      { res: 'medicine', min: 2, max: 4, chance: 1 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'plastic', min: 1, max: 1, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.4 },
    ],
    kramChance: 0.15,
    kram: [['bottles', 1], ['blanket', 1]],
    collectibles: [],
    mementoChance: 0.12,
  },
  hardware: {
    names: ['Baumarkt', 'Kfz-Werkstatt', 'Gartencenter'],
    hint: 'Holz, Metall, Schrauben, Kleber. Hier gibt es alles zum Bauen.',
    cooldownMin: 180,
    loot: [
      { res: 'wood', min: 2, max: 4, chance: 1 },
      { res: 'metal', min: 2, max: 3, chance: 0.9 },
      { res: 'screws', min: 1, max: 2, chance: 0.7 },
      { res: 'glue', min: 1, max: 2, chance: 0.6 },
      { res: 'stone', min: 1, max: 2, chance: 0.4 },
      { res: 'glass', min: 1, max: 1, chance: 0.3 },
      { res: 'water', min: 1, max: 2, chance: 0.3 },
    ],
    kramChance: 0.4,
    kram: [['toolbox', 3], ['tape', 3], ['screwBox', 3], ['superglue', 2], ['cableReel', 2], ['carBattery', 1], ['gasCan', 1]],
    collectibles: [],
    mementoChance: 0.1,
  },
  fuel: {
    names: ['Tankstelle', 'Rasthof-Shop'],
    hint: 'Snacks, Getränke, Ersatzteile',
    cooldownMin: 180,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.9 },
      { res: 'water', min: 1, max: 2, chance: 0.9 },
      { res: 'plastic', min: 1, max: 2, chance: 0.6 },
      { res: 'metal', min: 1, max: 1, chance: 0.5 },
      { res: 'electronics', min: 1, max: 1, chance: 0.2 },
    ],
    kramChance: 0.4,
    kram: [['gasCan', 3], ['carBattery', 2], ['bottles', 2], ['tinCans', 2], ['flashlight', 1], ['trafficCone', 1]],
    collectibles: [],
    mementoChance: 0.1,
  },
  well: {
    names: ['Trinkbrunnen', 'Alte Wasserpumpe', 'Dorfbrunnen'],
    hint: 'Sauberes Wasser',
    cooldownMin: 120,
    loot: [
      { res: 'water', min: 3, max: 5, chance: 1 },
      { res: 'stone', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.06,
    kram: [['bottles', 1]],
    collectibles: [],
    mementoChance: 0.04,
  },
  stop: {
    names: ['Bushaltestelle', 'Wartehäuschen'],
    hint: 'Wer hier gewartet hat, hat etwas zurückgelassen',
    cooldownMin: 120,
    loot: [
      { res: 'food', min: 1, max: 1, chance: 0.5 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'metal', min: 1, max: 1, chance: 0.5 },
      { res: 'plastic', min: 1, max: 1, chance: 0.4 },
      { res: 'glass', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.3,
    kram: [['trafficCone', 2], ['brokenPhone', 2], ['sneakers', 1], ['flashlight', 1]],
    collectibles: ['phone', 'bike', 'teddy'],
    mementoChance: 0.2,
  },
};

/** Bewachte Fundstellen haben eher Kram. */
export const GUARD_KRAM_BONUS = 0.2;
/** Chance auf ein Sammelstück (wenn es hier noch eins zu finden gibt). */
export const COLLECT_CHANCE = { grid: 0.07, poi: 0.12 };
export const GUARD_COLLECT_BONUS = 0.08;

// --- Kram (zum Zerlegen) -------------------------------------------------------------

export interface KramDef {
  name: string;
  desc: string;
  /** Was beim Zerlegen herauskommt (wie bei Fallout: man sieht es vorher). */
  parts: Partial<Record<Material, number>>;
  /** Minuten am Werktisch auf Stufe 1. */
  minutes: number;
}

export const KRAM: Record<KramId, KramDef> = {
  toaster: { name: 'Toaster', desc: 'Zwei Schlitze, null Toast.', parts: { metal: 2, electronics: 1 }, minutes: 4 },
  toolbox: { name: 'Werkzeugkasten', desc: 'Schraubenschlüssel in allen Größen, nur nicht in der richtigen.', parts: { metal: 2, screws: 3 }, minutes: 6 },
  trafficCone: { name: 'Leitkegel', desc: 'Orange. Sehr orange.', parts: { plastic: 2 }, minutes: 1 },
  bottles: { name: 'Flaschenkiste', desc: 'Leergut. Pfand gibt es keins mehr.', parts: { glass: 3, plastic: 1 }, minutes: 3 },
  carBattery: { name: 'Autobatterie', desc: 'Schwer und noch ein kleines bisschen geladen.', parts: { electronics: 2, metal: 1, plastic: 1 }, minutes: 6 },
  gasCan: { name: 'Benzinkanister', desc: 'Leer. Riecht aber noch.', parts: { plastic: 2 }, minutes: 2 },
  tape: { name: 'Klebebandrollen', desc: 'Hält die Welt zusammen.', parts: { glue: 2, plastic: 1 }, minutes: 2 },
  sneakers: { name: 'Turnschuhe', desc: 'Kaum getragen. Leider zwei linke.', parts: { cloth: 1, plastic: 1 }, minutes: 2 },
  radio: { name: 'Kofferradio', desc: 'Rauscht nur noch. Oder?', parts: { plastic: 2, electronics: 1, screws: 1 }, minutes: 6 },
  tinCans: { name: 'Leere Konservendosen', desc: 'Ravioli, Ravioli, Erbsensuppe.', parts: { metal: 2 }, minutes: 1 },
  blanket: { name: 'Alte Wolldecke', desc: 'Kratzt, wärmt aber.', parts: { cloth: 2 }, minutes: 2 },
  flashlight: { name: 'Taschenlampe', desc: 'Die Batterien sind hin, das Glas nicht.', parts: { plastic: 1, glass: 1, electronics: 1 }, minutes: 3 },
  cableReel: { name: 'Kabeltrommel', desc: 'Fünfzig Meter Kupfer und ein Knoten.', parts: { metal: 1, plastic: 1, electronics: 1 }, minutes: 4 },
  screwBox: { name: 'Schachtel Schrauben', desc: 'Sortiert. Wer macht so was?', parts: { screws: 3 }, minutes: 1 },
  fruitCrate: { name: 'Obstkiste', desc: 'Riecht noch nach Äpfeln.', parts: { wood: 2 }, minutes: 1 },
  pan: { name: 'Bratpfanne', desc: 'Gusseisen. Taugt zur Not auch als Waffe.', parts: { metal: 2 }, minutes: 2 },
  brokenPhone: { name: 'Kaputtes Handy', desc: 'Der Akku ist leer. Für immer.', parts: { electronics: 1, glass: 1, plastic: 1 }, minutes: 3 },
  superglue: { name: 'Sekundenkleber', desc: 'Zwei Tuben, eine ist noch zu.', parts: { glue: 1 }, minutes: 1 },
};
export const KRAM_ORDER = Object.keys(KRAM) as KramId[];

// --- Sammelstücke (einmalig, fürs Fundbuch) ----------------------------------------------

export interface CollectibleDef {
  name: string;
  desc: string;
  /** Als Deko: Grundfläche, Ebene (Boden oder Wand) und Gemütlichkeit. */
  w: number;
  d: number;
  layer: 'object' | 'wall';
  comfort: number;
}

export const COLLECTIBLES: Record<CollectibleId, CollectibleDef> = {
  teddy: { name: 'Teddybär', desc: 'Ein Ohr fehlt. Hat sicher jemanden getröstet.', w: 1, d: 1, layer: 'object', comfort: 4 },
  rubberDuck: { name: 'Quietscheente', desc: 'Quietscht noch. Wunderbar sinnlos.', w: 1, d: 1, layer: 'object', comfort: 3 },
  bike: { name: 'Fahrrad', desc: 'Platten vorne, Platten hinten.', w: 2, d: 1, layer: 'object', comfort: 3 },
  tv: { name: 'Röhrenfernseher', desc: 'Schwer wie ein Kühlschrank. Bild gibt es keins mehr.', w: 1, d: 1, layer: 'object', comfort: 4 },
  phone: { name: 'Wählscheibentelefon', desc: 'Niemand ruft mehr an. Hoffen kann man trotzdem.', w: 1, d: 1, layer: 'object', comfort: 3 },
  wallClock: { name: 'Wanduhr', desc: 'Tickt nicht mehr. Zeigt trotzdem eine schöne Zeit.', w: 1, d: 1, layer: 'wall', comfort: 4 },
  painting: { name: 'Ölgemälde', desc: 'Eine Landschaft mit Kühen. Irgendwer fand das schön.', w: 1, d: 1, layer: 'wall', comfort: 5 },
  typewriter: { name: 'Schreibmaschine', desc: 'Das Farbband ist trocken. Die Tasten klappern noch.', w: 1, d: 1, layer: 'object', comfort: 4 },
  globe: { name: 'Globus', desc: 'Die Grenzen darauf gibt es nicht mehr.', w: 1, d: 1, layer: 'object', comfort: 4 },
  sewingMachine: { name: 'Nähmaschine', desc: 'Mit Fußpedal. Läuft ganz ohne Strom.', w: 1, d: 1, layer: 'object', comfort: 4 },
  vase: { name: 'Blumenvase', desc: 'Ohne Blumen. Noch.', w: 1, d: 1, layer: 'object', comfort: 3 },
  mirror: { name: 'Spiegel', desc: 'Ein paar Sprünge. Du siehst müde aus.', w: 1, d: 1, layer: 'wall', comfort: 3 },
  guitar: { name: 'Gitarre', desc: 'Zwei Saiten fehlen. Für Lagerfeuerlieder reicht es.', w: 1, d: 1, layer: 'object', comfort: 6 },
};
export const COLLECTIBLE_ORDER = Object.keys(COLLECTIBLES) as CollectibleId[];

export interface SetDef {
  name: string;
  items: CollectibleId[];
  /** Belohnung, wenn das Set voll ist: ein Bauplan (falls noch unbekannt) und Rohstoffe ins Lager. */
  blueprint: 'sofa' | 'shelf' | 'bed' | 'lamp';
  reward: Partial<Inventory>;
}

export const SETS: Record<SetId, SetDef> = {
  kinderzimmer: { name: 'Kinderzimmer', items: ['teddy', 'rubberDuck', 'bike'], blueprint: 'bed', reward: { cloth: 4, wood: 4 } },
  wohnzimmer: { name: 'Wohnzimmer 1985', items: ['tv', 'phone', 'wallClock', 'painting'], blueprint: 'sofa', reward: { electronics: 3, screws: 3 } },
  arbeitszimmer: { name: 'Arbeitszimmer', items: ['typewriter', 'globe', 'sewingMachine'], blueprint: 'shelf', reward: { glue: 3, metal: 4 } },
  gutestube: { name: 'Gute Stube', items: ['vase', 'mirror', 'guitar'], blueprint: 'lamp', reward: { glass: 3, wood: 4 } },
};
export const SET_ORDER = Object.keys(SETS) as SetId[];

// --- Werktisch -----------------------------------------------------------------------

export interface WorkbenchLevel {
  /** Wie viel Kram gleichzeitig auf dem Tisch liegen dürfen (auch fertige). */
  slots: number;
  /** Faktor auf die Zerlegezeit. */
  speed: number;
  /** Kosten für diese Stufe (Stufe 1 ist der Werktisch selbst). */
  cost: Partial<Inventory>;
  name: string;
}

export const WORKBENCH_LEVELS: WorkbenchLevel[] = [
  { name: 'Werktisch', slots: 3, speed: 1, cost: {} },
  { name: 'Werktisch mit Schraubstock', slots: 5, speed: 0.75, cost: { wood: 4, metal: 4, screws: 3, glue: 2 } },
  { name: 'Werkstatt mit Akkuschrauber', slots: 8, speed: 0.5, cost: { metal: 6, screws: 5, glue: 3, electronics: 3 } },
];

/** Wie häufig welche Grid-Fundstelle vorkommt. */
export const GRID_KIND_WEIGHTS: readonly (readonly [SpotKind, number])[] = [
  ['car', 22],
  ['backpack', 18],
  ['shed', 16],
  ['barrel', 14],
  ['container', 12],
  ['hide', 10],
  ['parcel', 8],
];

/** OSM-Werte (class/subclass), die zu echten Fundorten werden. */
export const POI_KINDS: readonly (readonly [SpotKind, readonly string[]])[] = [
  ['market', ['supermarket', 'convenience', 'grocery', 'bakery', 'butcher', 'kiosk', 'greengrocer', 'deli', 'beverages', 'farm']],
  ['pharmacy', ['pharmacy', 'chemist', 'hospital', 'doctors', 'dentist', 'clinic']],
  ['hardware', ['hardware', 'doityourself', 'car_repair', 'car_parts', 'garden_centre', 'trade']],
  ['fuel', ['fuel']],
  ['well', ['drinking_water', 'water_point', 'water_well', 'fountain']],
  ['stop', ['bus_stop', 'bus_station', 'bus']],
];

/** Anzeigenamen für echte Orte, nach OSM-Wert. */
export const POI_NAMES: Record<string, string> = {
  supermarket: 'Geplünderter Supermarkt',
  convenience: 'Kiosk',
  kiosk: 'Kiosk',
  grocery: 'Lebensmittelladen',
  bakery: 'Bäckerei',
  butcher: 'Metzgerei',
  greengrocer: 'Gemüseladen',
  deli: 'Feinkostladen',
  beverages: 'Getränkemarkt',
  farm: 'Hofladen',
  pharmacy: 'Apotheke',
  chemist: 'Drogerie',
  hospital: 'Krankenhaus',
  doctors: 'Arztpraxis',
  dentist: 'Zahnarztpraxis',
  clinic: 'Klinik',
  hardware: 'Eisenwarenladen',
  doityourself: 'Baumarkt',
  car_repair: 'Kfz-Werkstatt',
  car_parts: 'Autoteile-Lager',
  garden_centre: 'Gartencenter',
  trade: 'Baustoffhandel',
  fuel: 'Tankstelle',
  drinking_water: 'Trinkbrunnen',
  water_point: 'Wasserstelle',
  water_well: 'Alte Wasserpumpe',
  fountain: 'Dorfbrunnen',
  bus_stop: 'Bushaltestelle',
  bus_station: 'Busbahnhof',
  bus: 'Bushaltestelle',
};

// --- Charakter ---------------------------------------------------------------

export interface BackgroundDef {
  name: string;
  perk: string;
  story: string;
  bonusRes?: Resource;
  rangeBonusM?: number;
}

export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  rescue: {
    name: 'Rettungsdienst',
    perk: 'Findet öfter Medizin',
    story: 'Zwölf Jahre im Rettungswagen. Du weißt, wo der Verbandskasten liegt.',
    bonusRes: 'medicine',
  },
  workshop: {
    name: 'Werkstatt',
    perk: 'Findet öfter Metall',
    story: 'In deiner Werkstatt lief jeder Motor wieder. Fast jeder.',
    bonusRes: 'metal',
  },
  farm: {
    name: 'Hof & Wald',
    perk: 'Findet öfter Nahrung',
    story: 'Du kennst jeden Feldweg und weißt, was im Wald wächst.',
    bonusRes: 'food',
  },
  courier: {
    name: 'Kurierdienst',
    perk: 'Größerer Suchradius (+20 m)',
    story: 'Hundert Haustüren am Tag. Du findest jede Abkürzung.',
    rangeBonusM: 20,
  },
};

/** Chance, dass die Vorgeschichte eine Einheit extra bringt. */
export const PERK_CHANCE = 0.4;

export const HAIR_STYLES = ['Kurz', 'Lang', 'Zopf', 'Mütze'] as const;
export const JACKET_COLORS = ['#7a5a3a', '#4f5d3a', '#3d4b5c', '#7d3b2c', '#8a8070'] as const;
export const SKIN_TONES = ['#e2b896', '#c18f6a', '#8d5f42', '#5c3d2b'] as const;
export const HAIR_COLOR = '#2a211a';

// --- Erinnerungsstücke (Sammelobjekte) ------------------------------------------

export interface MementoDef {
  id: string;
  title: string;
  text: string;
}

export const MEMENTOS: MementoDef[] = [
  { id: 'polaroid', title: 'Polaroid vom See', text: 'Vier Leute, ein Ruderboot, alle lachen. Hinten drauf: „Sommer, bevor alles anfing.“' },
  { id: 'timetable', title: 'Fahrplan Linie 7', text: 'Letzte Abfahrt 23:41. Jemand hat mit Kuli „nie angekommen“ danebengeschrieben.' },
  { id: 'drawing', title: 'Kinderzeichnung', text: 'Ein gelber Bus, ein Hund und sehr viel Sonne. Unterschrieben: Mila, 6.' },
  { id: 'tape', title: 'Kassette „Für die Fahrt“', text: 'Seite A ist zerkratzt. Seite B spielt noch drei Lieder.' },
  { id: 'keys', title: 'Schlüsselbund', text: 'Elf Schlüssel. An einem hängt ein Zettel: „Gartenhaus, falls was ist.“' },
  { id: 'list', title: 'Einkaufszettel', text: 'Milch, Batterien, Wasser, mehr Wasser, Mama anrufen.' },
  { id: 'radio', title: 'Zettel mit Frequenzen', text: 'Zahlen in roter Schrift. Ganz unten: „Kanal 4, jeden Abend um 20 Uhr.“' },
  { id: 'pennant', title: 'Wimpel vom Sportverein', text: 'Aufstieg in die Kreisliga, irgendwann. Die Goldschrift blättert ab.' },
  { id: 'letter', title: 'Brief ohne Marke', text: '„Wir sind Richtung Küste. Wenn du das liest, komm nach.“ Kein Absender.' },
  { id: 'dogtag', title: 'Hundemarke', text: '„Bruno. Bitte zurückbringen.“ Die Telefonnummer ist nicht mehr lesbar.' },
  { id: 'ticket', title: 'Konzertkarte', text: 'Reihe 3, Platz 12. Das Konzert wäre am Samstag gewesen.' },
  { id: 'clipping', title: 'Zeitungsausschnitt', text: 'Nur die Überschrift ist lesbar: „Behörden raten zur Ruhe“.' },
];

/** Das allererste Erinnerungsstück, damit die Sammlung sofort startet. */
export const FIRST_MEMENTO = 'polaroid';

// --- Kampf -------------------------------------------------------------------------

export const MAX_HEALTH = 10;
/** Alle so viele Minuten kommt 1 Lebenspunkt von selbst zurück. */
export const HEALTH_REGEN_MIN = 20;
/** Mit weniger Gesundheit fängt man keinen Kampf an. */
export const MIN_HEALTH_TO_FIGHT = 2;
/** Medizin heilt so viel, im Kampf etwas weniger (Verbinden unter Druck). */
export const HEAL_AMOUNT = 4;
export const HEAL_IN_COMBAT = 3;

export interface EnemyDef {
  name: string;
  hp: number;
  dmg: [number, number];
  /** Zieht pro Treffer so viel Schaden ab. */
  armor: number;
  /** Geschwindigkeit des Timing-Balkens (1 = normal). */
  speed: number;
  desc: string;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  walker: { name: 'Streuner', hp: 4, dmg: [1, 2], armor: 0, speed: 1, desc: 'Schlurft langsam, beißt aber zu.' },
  crawler: { name: 'Kriecher', hp: 3, dmg: [1, 2], armor: 0, speed: 1.45, desc: 'Flink und tief am Boden. Schwer zu erwischen.' },
  brute: { name: 'Brocken', hp: 6, dmg: [1, 3], armor: 1, speed: 0.85, desc: 'Groß, zäh und in Warnweste.' },
};

/** Welcher Gegner wie häufig eine Fundstelle bewacht. */
export const ENEMY_WEIGHTS: readonly (readonly [EnemyId, number])[] = [
  ['walker', 60],
  ['crawler', 25],
  ['brute', 15],
];

/** Anteil bewachter Fundstellen. */
export const GUARD_CHANCE = { grid: 0.25, poi: 0.4 };
/** Bewachte Fundstellen lohnen sich: mehr Beute, öfter Erinnerungsstücke. */
export const GUARD_LOOT_FACTOR = 1.5;
export const GUARD_MEMENTO_BONUS = 0.12;

export const QUALITY_FACTOR: Record<Quality, number> = { miss: 0.5, good: 1, perfect: 1.5 };

export interface WeaponDef {
  name: string;
  dmg: number;
  dur: number;
  cost: Partial<Inventory>;
  /** Nötige Stufe des Werktischs. */
  level: number;
  desc: string;
}

/** Ohne Waffe kämpft man mit den Fäusten. */
export const FIST_DAMAGE = 1;

export const WEAPON_ORDER: WeaponId[] = ['crowbar', 'bat', 'crossbow'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  crowbar: { name: 'Brechstange', dmg: 2, dur: 14, cost: { metal: 3 }, level: 1, desc: 'Öffnet Türen und Schädel.' },
  bat: { name: 'Nagelschläger', dmg: 3, dur: 16, cost: { wood: 3, metal: 2 }, level: 1, desc: 'Ein Baseballschläger mit ein paar Nägeln.' },
  crossbow: { name: 'Armbrust', dmg: 4, dur: 12, cost: { wood: 3, metal: 4, screws: 2, glue: 1 }, level: 2, desc: 'Leise und kräftig. Die Bolzen nutzen sich ab.' },
};

export const START_WEAPONS: Weapon[] = [{ kind: 'crowbar', dur: WEAPONS.crowbar.dur }];

// --- Kampf 2.0: Echtzeit mit Zielwahl (Werte in Kampf-Punkten, 10 pro Gesundheit) --------

export type FoeKind = EnemyId | 'screamer';

export interface FoeDef {
  name: string;
  hp: number;
  dmg: [number, number];
  armor: number;
  /** Meter pro Sekunde */
  speed: number;
  /** Angriffsreichweite in Metern */
  reach: number;
  /** Ausholen in Sekunden (so lange kann man ausweichen) */
  windup: number;
  /** Pause zwischen zwei Angriffen */
  interval: number;
  /** Hält Abstand (der Kreischer bleibt hinten) */
  keepDistance?: number;
  desc: string;
}

export const FOES: Record<FoeKind, FoeDef> = {
  walker: { name: 'Streuner', hp: 130, dmg: [7, 11], armor: 0, speed: 1.15, reach: 1.3, windup: 1.1, interval: 2.4, desc: 'Schlurft langsam, beißt aber zu.' },
  crawler: { name: 'Kriecher', hp: 90, dmg: [5, 8], armor: 0, speed: 2.3, reach: 1.1, windup: 0.75, interval: 1.8, desc: 'Flink und tief am Boden. Holt schnell aus.' },
  brute: { name: 'Brocken', hp: 240, dmg: [14, 20], armor: 5, speed: 0.85, reach: 1.7, windup: 1.6, interval: 3.0, desc: 'Groß, zäh und in Warnweste. Schlägt hart, aber langsam.' },
  screamer: { name: 'Kreischer', hp: 70, dmg: [5, 8], armor: 0, speed: 1.4, reach: 1.2, windup: 1.4, interval: 6.5, keepDistance: 6.5, desc: 'Bleibt hinten und ruft Verstärkung. Zuerst ausschalten!' },
};

/** Waffen im Echtzeitkampf. */
export const BATTLE_WEAPONS: Record<WeaponId | 'fists', { dmg: [number, number]; interval: number; reach: number; ranged?: boolean }> = {
  fists: { dmg: [7, 11], interval: 0.95, reach: 1.4 },
  crowbar: { dmg: [16, 22], interval: 1.05, reach: 1.6 },
  bat: { dmg: [24, 32], interval: 1.25, reach: 1.8 },
  crossbow: { dmg: [30, 38], interval: 1.6, reach: 11, ranged: true },
};

export type Ability = 'power' | 'dodge' | 'shove' | 'bandage';

export const ABILITIES: Record<Ability, { name: string; cd: number; desc: string; cost?: Partial<Inventory> }> = {
  power: { name: 'Wuchtschlag', cd: 7, desc: 'Doppelter Schaden, der Gegner taumelt und hört auf auszuholen.' },
  dodge: { name: 'Ausweichen', cd: 2.2, desc: 'Kurz unverwundbar. Kurz vor dem Treffer gibt es einen Konter!' },
  shove: { name: 'Stoß', cd: 10, desc: 'Stößt alle nahen Gegner zurück und unterbricht ihr Ausholen.' },
  bandage: { name: 'Verbinden', cd: 12, cost: { medicine: 1 }, desc: 'Heilt dich in zwei Sekunden um 35 (kostet 1 Medizin).' },
};
export const ABILITY_ORDER: Ability[] = ['power', 'dodge', 'shove', 'bandage'];

export const BATTLE = {
  /** Kampf-Punkte pro Gesundheitspunkt */
  hpPerHealth: 10,
  crit: 0.12,
  critMult: 1.6,
  counterMult: 2.2,
  powerMult: 2.1,
  /** So kurz vor dem Treffer gilt Ausweichen als perfekt */
  perfectWindow: 0.4,
  dodgeTime: 0.55,
  counterTime: 3,
  healAmount: 35,
  healTime: 2,
  maxSummons: 2,
  playerSpeed: 3.2,
  // Gesten-Steuerung
  /** Weite der Ausweichrolle in Metern */
  rollDistance: 1.6,
  /** Sekunden bis voll aufgeladen */
  chargeTime: 1.1,
  /** Voll aufgeladen: Schaden × (1 + chargeBonus) */
  chargeBonus: 1.6,
  /** Zeitfenster für die nächste Kombo-Stufe */
  comboWindow: 1.0,
  /** Der dritte Kombo-Schlag */
  comboFinisher: 1.6,
  /** Selbst getippte Schläge kommen schneller als automatische */
  manualSpeed: 0.75,
};

// --- Tageszeit ---------------------------------------------------------------------

/** Nachts bewachen mehr Zombies die Fundstellen ... */
export const NIGHT_GUARD_FACTOR = 1.6;
/** ... dafür gibt es mehr Beute. */
export const NIGHT_LOOT_FACTOR = 1.3;
/** GPS-Positionen, die ungenauer sind, decken keine Karte auf. */
export const EXPLORE_MAX_ACCURACY_M = 45;
