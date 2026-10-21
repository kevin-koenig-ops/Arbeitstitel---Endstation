// Spielinhalte als reine Daten. Neue Fundorte, Gegenstände oder Ausbauten
// kommen hier dazu, ohne dass sich die Logik ändern muss.

import type { BackgroundId, CollectibleId, EnemyId, FoeKind, Inventory, KramId, Material, Quality, Resource, SetId, SpotKind, Survival, Weapon, WeaponId } from './types';

export const SURVIVAL_ORDER: Survival[] = ['food', 'water', 'medicine'];
/** Rohstoffe, grob von häufig nach selten. */
export const MATERIAL_ORDER: Material[] = [
  'wood',
  'metal',
  'stone',
  'cloth',
  'plastic',
  'glass',
  'rubber',
  'leather',
  'screws',
  'springs',
  'gears',
  'copper',
  'glue',
  'oil',
  'electronics',
  'cells',
  'antiseptic',
  'phosphate',
];
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
  stone: { name: 'Stein', where: 'Schutt und Felsen zu Hause' },
  cloth: { name: 'Stoff', where: 'Rucksäcke, Kleidercontainer, Teddys' },
  plastic: { name: 'Kunststoff', where: 'Fast überall, besonders Pakete' },
  glass: { name: 'Glas', where: 'Flaschen, Spiegel, Fernseher' },
  glue: { name: 'Kleber', where: 'Baumarkt, Klebeband, Pakete' },
  screws: { name: 'Schrauben', where: 'Werkzeugkästen, Schuppen, Autos' },
  electronics: { name: 'Elektronik', where: 'Radios, Handys, Registrierkassen' },
  // Bauteile wie bei Fallout: stecken vor allem in Kram, den man zu Hause zerlegt
  rubber: { name: 'Gummi', where: 'Reifen, Schuhe, Gartenschläuche' },
  leather: { name: 'Leder', where: 'Lederjacken, Handtaschen' },
  springs: { name: 'Federn', where: 'Toaster, Wecker, Fahrradschlösser' },
  gears: { name: 'Zahnräder', where: 'Wecker, Bohrmaschinen, Fahrradteile' },
  copper: { name: 'Kupfer', where: 'Kabel, Wasserkocher, Elektrogeräte' },
  oil: { name: 'Öl', where: 'Kanister, Motoröl, Lampen' },
  cells: { name: 'Batteriezellen', where: 'Autobatterien, Handys, Powerbanks' },
  antiseptic: { name: 'Desinfektionsmittel', where: 'Apotheke, Verbandskästen, Schnaps' },
  phosphate: { name: 'Phosphat', where: 'Düngersäcke im Schuppen und Baumarkt' },
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
      { res: 'metal', min: 1, max: 2, chance: 0.8 },
      { res: 'plastic', min: 1, max: 1, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.3 },
      { res: 'screws', min: 1, max: 1, chance: 0.25 },
      { res: 'water', min: 1, max: 1, chance: 0.25 },
      { res: 'food', min: 1, max: 1, chance: 0.15 },
    ],
    kramChance: 0.7,
    kram: [['carBattery', 3], ['gasCan', 3], ['carRadio', 3], ['jack', 2], ['wiperBlades', 3], ['firstAidKit', 2], ['hubcap', 3], ['motorOil', 2], ['spareTire', 1], ['trafficCone', 1], ['toolbox', 1], ['cableReel', 1], ['tape', 1]],
    collectibles: ['guitar', 'teddy'],
    mementoChance: 0.06,
  },
  backpack: {
    names: ['Zurückgelassener Rucksack', 'Reisetasche am Wegrand', 'Verlorener Schulranzen'],
    hint: 'Proviant, Wasser, Stoff, manchmal Verbandszeug',
    cooldownMin: 60,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.55 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'cloth', min: 1, max: 1, chance: 0.5 },
      { res: 'medicine', min: 1, max: 1, chance: 0.2 },
      { res: 'plastic', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.65,
    kram: [['sneakers', 3], ['blanket', 2], ['flashlight', 2], ['tinCans', 2], ['brokenPhone', 2], ['thermos', 3], ['powerbank', 2], ['headphones', 3], ['umbrella', 2], ['firstAidKit', 1], ['radio', 1]],
    collectibles: ['teddy', 'rubberDuck'],
    mementoChance: 0.1,
  },
  shed: {
    names: ['Gartenlaube', 'Geräteschuppen', 'Schrebergarten'],
    hint: 'Eingemachtes, Holz, Werkzeug, Schrauben',
    cooldownMin: 60,
    loot: [
      { res: 'wood', min: 2, max: 3, chance: 1 },
      { res: 'food', min: 1, max: 1, chance: 0.35 },
      { res: 'metal', min: 1, max: 1, chance: 0.4 },
      { res: 'screws', min: 1, max: 1, chance: 0.3 },
      { res: 'glue', min: 1, max: 1, chance: 0.2 },
    ],
    kramChance: 0.65,
    kram: [['toolbox', 2], ['screwBox', 2], ['fruitCrate', 2], ['hedgeShears', 3], ['gardenHose', 3], ['bikeLock', 2], ['bikeParts', 2], ['oilCan', 2], ['mousetrap', 2], ['bucket', 2], ['fertilizer', 1], ['superglue', 1], ['pan', 1]],
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
      { res: 'wood', min: 1, max: 1, chance: 0.3 },
      { res: 'medicine', min: 1, max: 1, chance: 0.15 },
    ],
    kramChance: 0.7,
    kram: [['sneakers', 2], ['blanket', 3], ['leatherJacket', 2], ['handbag', 2], ['rubberBoots', 2], ['toaster', 2], ['hairDryer', 2], ['clothesIron', 2], ['alarmClock', 1], ['umbrella', 1], ['pan', 1], ['bottles', 1]],
    collectibles: ['mirror', 'painting', 'tv', 'phone'],
    mementoChance: 0.05,
  },
  hide: {
    names: ['Hochsitz', 'Jagdhütte', 'Alter Unterstand'],
    hint: 'Dosen, Wasserflaschen, Bretter',
    cooldownMin: 60,
    loot: [
      { res: 'food', min: 1, max: 1, chance: 0.45 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'wood', min: 1, max: 3, chance: 0.85 },
      { res: 'cloth', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.5,
    kram: [['tinCans', 2], ['thermos', 3], ['binoculars', 1], ['lantern', 2], ['blanket', 2], ['flashlight', 2], ['bottles', 1], ['schnapps', 1]],
    collectibles: ['guitar'],
    mementoChance: 0.08,
  },
  barrel: {
    names: ['Regentonne', 'Wassertank', 'Volle Zisterne'],
    hint: 'Wasser, abgekocht trinkbar',
    cooldownMin: 60,
    loot: [
      { res: 'water', min: 1, max: 2, chance: 1 },
      { res: 'metal', min: 1, max: 1, chance: 0.3 },
      { res: 'wood', min: 1, max: 2, chance: 0.4 },
    ],
    kramChance: 0.35,
    kram: [['bottles', 2], ['fruitCrate', 2], ['tinCans', 2], ['oilCan', 2], ['motorOil', 1], ['rubberBoots', 1], ['bucket', 2], ['fertilizer', 1]],
    collectibles: [],
    mementoChance: 0.02,
  },
  parcel: {
    names: ['Packstation', 'Stapel Pakete', 'Liegengebliebener Paketwagen'],
    hint: 'Alles Mögliche. Selten, aber ergiebig.',
    cooldownMin: 90,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.5 },
      { res: 'plastic', min: 1, max: 2, chance: 0.6 },
      { res: 'medicine', min: 1, max: 1, chance: 0.35 },
      { res: 'electronics', min: 1, max: 1, chance: 0.35 },
      { res: 'glue', min: 1, max: 1, chance: 0.35 },
      { res: 'cloth', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.8,
    kram: [['radio', 2], ['brokenPhone', 2], ['powerbank', 2], ['headphones', 2], ['speaker', 2], ['cordlessDrill', 1], ['kitchenScale', 2], ['kettle', 2], ['deskFan', 2], ['hairDryer', 2], ['alarmClock', 2], ['superglue', 1], ['tape', 1], ['flashlight', 1], ['toaster', 1], ['screwBox', 1]],
    collectibles: ['globe', 'typewriter', 'painting', 'teddy', 'rubberDuck', 'sewingMachine', 'wallClock', 'guitar'],
    mementoChance: 0.18,
  },
  // --- echte Orte aus der Karte (POI) ---
  market: {
    names: ['Geplünderter Supermarkt', 'Dorfladen', 'Bäckerei mit Vorratskeller'],
    hint: 'Viel Nahrung und Wasser, dazu Kunststoff und Glas',
    cooldownMin: 180,
    loot: [
      { res: 'food', min: 2, max: 4, chance: 1 },
      { res: 'water', min: 1, max: 3, chance: 0.9 },
      { res: 'plastic', min: 1, max: 2, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.4 },
      { res: 'medicine', min: 1, max: 1, chance: 0.2 },
    ],
    kramChance: 0.55,
    kram: [['bottles', 3], ['fruitCrate', 2], ['tinCans', 2], ['coffeeMachine', 2], ['kettle', 2], ['schnapps', 2], ['cashRegister', 1], ['toaster', 1], ['pan', 1]],
    collectibles: ['vase', 'rubberDuck'],
    mementoChance: 0.12,
  },
  pharmacy: {
    names: ['Apotheke', 'Arztpraxis', 'Notaufnahme'],
    hint: 'Medikamente und Verbandszeug',
    cooldownMin: 180,
    loot: [
      { res: 'medicine', min: 1, max: 3, chance: 1 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'plastic', min: 1, max: 1, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.4 },
    ],
    kramChance: 0.5,
    kram: [['bloodPressure', 2], ['disinfectant', 3], ['firstAidKit', 2], ['hotWaterBottle', 2], ['bottles', 1], ['blanket', 1]],
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
    kramChance: 0.7,
    kram: [['toolbox', 3], ['tape', 2], ['screwBox', 3], ['superglue', 2], ['cableReel', 2], ['copperWire', 2], ['cordlessDrill', 2], ['gardenHose', 2], ['fertilizer', 1], ['mousetrap', 1], ['oilCan', 1], ['bucket', 1], ['carBattery', 1], ['gasCan', 1]],
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
    kramChance: 0.6,
    kram: [['gasCan', 3], ['motorOil', 3], ['carBattery', 2], ['wiperBlades', 2], ['schnapps', 1], ['bottles', 2], ['tinCans', 1], ['flashlight', 1], ['trafficCone', 1]],
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
    kramChance: 0.15,
    kram: [['bottles', 1], ['bucket', 2], ['rubberBoots', 1]],
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
      { res: 'stone', min: 1, max: 2, chance: 0.4 },
    ],
    kramChance: 0.5,
    kram: [['trafficCone', 2], ['brokenPhone', 2], ['headphones', 2], ['umbrella', 2], ['sneakers', 1], ['flashlight', 1], ['thermos', 1]],
    collectibles: ['phone', 'bike', 'teddy'],
    mementoChance: 0.2,
  },

  // --- besondere Orte: einmal pro Gegend (~1,5 km), mit Geschichte und seltener Beute ---
  heli: {
    names: ['Abgestürzter Hubschrauber', 'Hubschrauberwrack'],
    hint: 'Medizin, Elektronik, Metall aus dem Wrack',
    cooldownMin: 720,
    loot: [
      { res: 'medicine', min: 1, max: 3, chance: 0.9 },
      { res: 'electronics', min: 1, max: 3, chance: 0.85 },
      { res: 'metal', min: 2, max: 4, chance: 0.9 },
      { res: 'glass', min: 1, max: 2, chance: 0.5 },
      { res: 'screws', min: 1, max: 2, chance: 0.5 },
    ],
    kramChance: 0.9,
    kram: [['radio', 3], ['firstAidKit', 3], ['binoculars', 2], ['powerbank', 2], ['carBattery', 1], ['toolbox', 2], ['flashlight', 2]],
    collectibles: ['globe'],
    mementoChance: 0.05,
  },
  convoy: {
    names: ['Ausgebrannter Konvoi', 'Liegengebliebene Lastwagen'],
    hint: 'Vorräte und viel Metall von der Ladefläche',
    cooldownMin: 720,
    loot: [
      { res: 'metal', min: 3, max: 5, chance: 0.95 },
      { res: 'food', min: 1, max: 3, chance: 0.75 },
      { res: 'water', min: 1, max: 3, chance: 0.75 },
      { res: 'plastic', min: 1, max: 2, chance: 0.5 },
      { res: 'screws', min: 1, max: 2, chance: 0.5 },
    ],
    kramChance: 0.9,
    kram: [['gasCan', 3], ['jack', 2], ['spareTire', 2], ['motorOil', 2], ['carBattery', 2], ['toolbox', 2], ['tinCans', 2]],
    collectibles: ['tv'],
    mementoChance: 0.05,
  },
  bunker: {
    names: ['Verriegelte Bunkertür', 'Alter Schutzbunker'],
    hint: 'Was am Eingang zurückblieb. Drinnen ist eine Rote Zone.',
    cooldownMin: 720,
    loot: [
      { res: 'medicine', min: 1, max: 2, chance: 0.75 },
      { res: 'food', min: 1, max: 2, chance: 0.7 },
      { res: 'water', min: 1, max: 2, chance: 0.7 },
      { res: 'electronics', min: 1, max: 2, chance: 0.5 },
      { res: 'metal', min: 1, max: 3, chance: 0.7 },
    ],
    kramChance: 0.85,
    kram: [['flashlight', 3], ['gasMask', 3], ['radio', 2], ['cableReel', 2], ['lantern', 2], ['firstAidKit', 2], ['tinCans', 1]],
    collectibles: ['typewriter'],
    mementoChance: 0.05,
  },
  camp: {
    names: ['Verlassenes Zeltlager', 'Notlager im Wald'],
    hint: 'Stoff, Vorräte, Holz. Und vielleicht eine Spur, wohin sie gingen.',
    cooldownMin: 720,
    loot: [
      { res: 'cloth', min: 2, max: 4, chance: 0.9 },
      { res: 'food', min: 1, max: 3, chance: 0.7 },
      { res: 'water', min: 1, max: 2, chance: 0.6 },
      { res: 'wood', min: 2, max: 3, chance: 0.8 },
      { res: 'plastic', min: 1, max: 1, chance: 0.4 },
    ],
    kramChance: 0.9,
    kram: [['blanket', 3], ['lantern', 3], ['thermos', 2], ['leatherJacket', 2], ['tinCans', 2], ['pan', 2], ['schnapps', 1], ['sneakers', 1]],
    collectibles: ['guitar'],
    mementoChance: 0.05,
  },
  mast: {
    names: ['Funkmast', 'Alter Sendemast'],
    hint: 'Kabel, Elektronik, Metall. Von oben sieht man weit.',
    cooldownMin: 720,
    loot: [
      { res: 'electronics', min: 2, max: 4, chance: 0.95 },
      { res: 'metal', min: 2, max: 3, chance: 0.85 },
      { res: 'screws', min: 1, max: 2, chance: 0.6 },
      { res: 'plastic', min: 1, max: 1, chance: 0.4 },
    ],
    kramChance: 0.9,
    kram: [['cableReel', 3], ['copperWire', 3], ['carBattery', 2], ['radio', 2], ['speaker', 1], ['brokenPhone', 1]],
    collectibles: ['phone'],
    mementoChance: 0.05,
  },
  airdrop: {
    names: ['Abgeworfene Hilfslieferung', 'Kiste am Fallschirm'],
    hint: 'Vorräte und Medizin, wenn noch keiner da war',
    cooldownMin: 720,
    loot: [
      { res: 'food', min: 2, max: 4, chance: 0.95 },
      { res: 'water', min: 2, max: 4, chance: 0.95 },
      { res: 'medicine', min: 1, max: 2, chance: 0.7 },
      { res: 'cloth', min: 1, max: 2, chance: 0.6 },
    ],
    kramChance: 0.85,
    kram: [['tinCans', 3], ['firstAidKit', 3], ['disinfectant', 2], ['powerbank', 2], ['blanket', 2], ['flashlight', 2]],
    collectibles: ['teddy'],
    mementoChance: 0.05,
  },
};

/** Bewachte Fundstellen haben eher Kram. */
export const GUARD_KRAM_BONUS = 0.2;
/** Chance auf ein Sammelstück (wenn es hier noch eins zu finden gibt). */
export const COLLECT_CHANCE = { grid: 0.07, poi: 0.12, special: 0.2 };
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
  toaster: { name: 'Toaster', desc: 'Zwei Schlitze, null Toast.', parts: { metal: 2, springs: 1, copper: 1 }, minutes: 4 },
  toolbox: { name: 'Werkzeugkasten', desc: 'Schraubenschlüssel in allen Größen, nur nicht in der richtigen.', parts: { metal: 3, screws: 2 }, minutes: 6 },
  trafficCone: { name: 'Leitkegel', desc: 'Orange. Sehr orange.', parts: { plastic: 2, rubber: 1 }, minutes: 1 },
  bottles: { name: 'Flaschenkiste', desc: 'Leergut. Pfand gibt es keins mehr.', parts: { glass: 3, plastic: 1 }, minutes: 3 },
  carBattery: { name: 'Autobatterie', desc: 'Schwer und noch ein kleines bisschen geladen.', parts: { cells: 2, metal: 1, plastic: 1 }, minutes: 6 },
  gasCan: { name: 'Benzinkanister', desc: 'Ein Rest schwappt noch drin.', parts: { oil: 2, plastic: 1 }, minutes: 2 },
  tape: { name: 'Klebebandrollen', desc: 'Hält die Welt zusammen.', parts: { glue: 2, cloth: 1 }, minutes: 2 },
  sneakers: { name: 'Turnschuhe', desc: 'Kaum getragen. Leider zwei linke.', parts: { rubber: 2, cloth: 1 }, minutes: 2 },
  radio: { name: 'Kofferradio', desc: 'Rauscht nur noch. Oder?', parts: { electronics: 1, copper: 1, plastic: 1, screws: 1 }, minutes: 6 },
  tinCans: { name: 'Leere Konservendosen', desc: 'Ravioli, Ravioli, Erbsensuppe.', parts: { metal: 2 }, minutes: 1 },
  blanket: { name: 'Alte Wolldecke', desc: 'Kratzt, wärmt aber.', parts: { cloth: 3 }, minutes: 2 },
  flashlight: { name: 'Taschenlampe', desc: 'Die Birne ist hin, das Glas nicht.', parts: { glass: 1, cells: 1, plastic: 1 }, minutes: 3 },
  cableReel: { name: 'Kabeltrommel', desc: 'Fünfzig Meter Kupfer und ein Knoten.', parts: { copper: 3, plastic: 1, rubber: 1 }, minutes: 4 },
  screwBox: { name: 'Schachtel Schrauben', desc: 'Sortiert. Wer macht so was?', parts: { screws: 3 }, minutes: 1 },
  fruitCrate: { name: 'Obstkiste', desc: 'Riecht noch nach Äpfeln.', parts: { wood: 2 }, minutes: 1 },
  pan: { name: 'Bratpfanne', desc: 'Gusseisen. Taugt zur Not auch als Waffe.', parts: { metal: 3 }, minutes: 2 },
  brokenPhone: { name: 'Kaputtes Handy', desc: 'Der Akku ist leer. Für immer.', parts: { electronics: 1, glass: 1, cells: 1 }, minutes: 3 },
  superglue: { name: 'Sekundenkleber', desc: 'Zwei Tuben, eine ist noch zu.', parts: { glue: 1 }, minutes: 1 },
  // Auto und Tankstelle
  carRadio: { name: 'Autoradio', desc: 'Spielt nur noch eine Kassette. Immer dieselbe.', parts: { electronics: 1, copper: 1, plastic: 1 }, minutes: 4 },
  jack: { name: 'Wagenheber', desc: 'Hebt alles, nur nicht die Stimmung.', parts: { metal: 3, gears: 1 }, minutes: 4 },
  wiperBlades: { name: 'Scheibenwischer', desc: 'Wischen nichts mehr weg.', parts: { rubber: 1, metal: 1 }, minutes: 1 },
  firstAidKit: { name: 'Verbandskasten', desc: 'Abgelaufen 2019. Was heißt das heute schon.', parts: { antiseptic: 1, cloth: 2, plastic: 1 }, minutes: 2 },
  hubcap: { name: 'Radkappe', desc: 'Glänzt noch, als wäre nichts gewesen.', parts: { plastic: 2 }, minutes: 1 },
  motorOil: { name: 'Motoröl', desc: 'Fünf Liter, halb voll. Oder halb leer.', parts: { oil: 2, plastic: 1 }, minutes: 1 },
  spareTire: { name: 'Reservereifen', desc: 'Platt, aber Gummi ist Gummi.', parts: { rubber: 3, metal: 1 }, minutes: 4 },
  // Unterwegs verloren
  thermos: { name: 'Thermoskanne', desc: 'Der Kaffee darin ist kalt. Seit Jahren.', parts: { metal: 2, glass: 1 }, minutes: 2 },
  powerbank: { name: 'Powerbank', desc: 'Eine von vier Lampen blinkt noch.', parts: { cells: 2, electronics: 1, plastic: 1 }, minutes: 3 },
  headphones: { name: 'Kopfhörer', desc: 'Das Kabel ist verknotet. Wie immer.', parts: { copper: 1, plastic: 1 }, minutes: 2 },
  umbrella: { name: 'Regenschirm', desc: 'Geht nur noch zur Hälfte auf.', parts: { metal: 1, cloth: 1, springs: 1 }, minutes: 2 },
  // Schuppen, Garten, Baumarkt
  hedgeShears: { name: 'Heckenschere', desc: 'Die Hecken haben gewonnen.', parts: { metal: 3, springs: 1 }, minutes: 3 },
  gardenHose: { name: 'Gartenschlauch', desc: 'Zwanzig Meter, ein einziger Knoten.', parts: { rubber: 3 }, minutes: 2 },
  fertilizer: { name: 'Düngersack', desc: 'Halb voll. Früher billig, heute Gold.', parts: { phosphate: 2, plastic: 1 }, minutes: 2 },
  bikeLock: { name: 'Fahrradschloss', desc: 'Das Fahrrad ist weg, das Schloss nicht.', parts: { metal: 2, springs: 1 }, minutes: 2 },
  bikeParts: { name: 'Fahrradteile', desc: 'Kette, Ritzel, ein Schlauch. Ein halbes Fahrrad.', parts: { gears: 1, metal: 2, rubber: 1 }, minutes: 3 },
  oilCan: { name: 'Ölkännchen', desc: 'Quietscht selbst.', parts: { oil: 1, metal: 1 }, minutes: 1 },
  mousetrap: { name: 'Mausefalle', desc: 'Leer. Die Maus war schlauer.', parts: { wood: 1, springs: 1 }, minutes: 1 },
  cordlessDrill: { name: 'Akkubohrer', desc: 'Der Akku hat noch einen Funken.', parts: { cells: 1, gears: 2, copper: 1 }, minutes: 4 },
  copperWire: { name: 'Rolle Kupferdraht', desc: 'Glänzt wie ein kleiner Schatz.', parts: { copper: 3 }, minutes: 1 },
  bucket: { name: 'Zinkeimer', desc: 'Hat ein Loch. Ein kleines.', parts: { metal: 2 }, minutes: 1 },
  // Kleidercontainer
  leatherJacket: { name: 'Lederjacke', desc: 'Riecht nach Motorrad und Regen.', parts: { leather: 3 }, minutes: 3 },
  handbag: { name: 'Handtasche', desc: 'Drin: Taschentücher, ein Lippenstift, keine Antworten.', parts: { leather: 2, metal: 1 }, minutes: 2 },
  rubberBoots: { name: 'Gummistiefel', desc: 'Innen noch feucht.', parts: { rubber: 2, cloth: 1 }, minutes: 1 },
  // Haushalt und Pakete
  alarmClock: { name: 'Wecker', desc: 'Klingelt um 6:15. Für niemanden.', parts: { gears: 1, springs: 1, glass: 1 }, minutes: 2 },
  kitchenScale: { name: 'Küchenwaage', desc: 'Zeigt immer 300 Gramm.', parts: { springs: 1, glass: 1, metal: 1 }, minutes: 2 },
  kettle: { name: 'Wasserkocher', desc: 'Kalk wie in einer Tropfsteinhöhle.', parts: { copper: 1, plastic: 1, metal: 1 }, minutes: 2 },
  speaker: { name: 'Lautsprecherbox', desc: 'Der Akku reicht für ein letztes Lied.', parts: { copper: 1, cells: 1, electronics: 1, plastic: 1 }, minutes: 3 },
  deskFan: { name: 'Tischventilator', desc: 'Dreht sich, wenn man ihn anpustet.', parts: { copper: 1, gears: 1, plastic: 1 }, minutes: 3 },
  hairDryer: { name: 'Föhn', desc: 'Für Frisuren gibt es gerade wenig Bedarf.', parts: { copper: 1, plastic: 1 }, minutes: 2 },
  clothesIron: { name: 'Bügeleisen', desc: 'Schwer genug für alles.', parts: { metal: 2, copper: 1 }, minutes: 2 },
  // Supermarkt
  coffeeMachine: { name: 'Kaffeemaschine', desc: 'Ein Hauch von Montagmorgen.', parts: { copper: 1, glass: 1, plastic: 2 }, minutes: 3 },
  schnapps: { name: 'Flasche Korn', desc: 'Für Wunden. Natürlich nur für Wunden.', parts: { antiseptic: 1, glass: 1 }, minutes: 1 },
  cashRegister: { name: 'Registrierkasse', desc: 'Die Schublade klemmt. Leer ist sie trotzdem.', parts: { electronics: 1, metal: 2, springs: 1 }, minutes: 4 },
  // Apotheke
  bloodPressure: { name: 'Blutdruckmessgerät', desc: 'Zeigt bei dir gerade: hoch.', parts: { cells: 1, rubber: 1, plastic: 1 }, minutes: 2 },
  disinfectant: { name: 'Desinfektionsspray', desc: 'Riecht nach Wartezimmer.', parts: { antiseptic: 2, plastic: 1 }, minutes: 1 },
  hotWaterBottle: { name: 'Wärmflasche', desc: 'Mit Strickbezug. Von Oma, ganz sicher.', parts: { rubber: 2 }, minutes: 1 },
  // Besondere Orte
  binoculars: { name: 'Fernglas', desc: 'Man sieht weit. Leider auch, was kommt.', parts: { glass: 2, metal: 1, rubber: 1 }, minutes: 3 },
  lantern: { name: 'Petroleumlampe', desc: 'Altmodisch. Und plötzlich wieder modern.', parts: { oil: 1, glass: 1, metal: 1 }, minutes: 2 },
  gasMask: { name: 'Gasmaske', desc: 'Riecht nach Gummi und Angst.', parts: { rubber: 2, glass: 1 }, minutes: 2 },
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
  { name: 'Werktisch mit Schraubstock', slots: 5, speed: 0.75, cost: { wood: 4, metal: 3, screws: 3, glue: 1, gears: 1, oil: 1 } },
  { name: 'Werkstatt mit Akkuschrauber', slots: 8, speed: 0.5, cost: { metal: 5, screws: 4, glue: 2, electronics: 2, cells: 2, copper: 2 } },
];

/**
 * Grid-Fundstellen wandern: Jede Kachel würfelt etwa einmal pro Runde neu (Ort, Art, Anzahl),
 * jede zu ihrer eigenen Uhrzeit. Nachfrist: So lange lässt sich eine gerade abgelaufene
 * Fundstelle noch durchsuchen, damit sie einem nicht vor der Nase verschwindet.
 */
export const GRID_TURN = { hours: 24, graceMin: 20 };

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
  // Keine Krankenhäuser und Kliniken: echte sensible Orte bleiben außen vor
  ['pharmacy', ['pharmacy', 'chemist', 'doctors', 'dentist']],
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
  /** Gibt es nur von diesem Gegner oder an diesem besonderen Ort (nicht beim normalen Durchsuchen). */
  from?: EnemyId | SpotKind;
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
  { id: 'flightLog', title: 'Flugbuch', from: 'heli', text: 'Letzter Eintrag: „Evakuierung abgebrochen. Zu viele am Landeplatz. Wir drehen ab.“ Die Schrift wird am Ende krakelig.' },
  { id: 'waybill', title: 'Frachtbrief', from: 'convoy', text: 'Ladung: Elysis-Saatgut, 40 Paletten. Ziel: Sammelstelle Nord. Empfänger: unleserlich. Jemand hat „NICHT AUSSÄEN“ an den Rand geschrieben.' },
  { id: 'warningSign', title: 'Warnschild', from: 'bunker', text: '„Zutritt nur mit Atemschutz.“ Darunter, mit Kreide: „Nicht mal dann.“' },
  { id: 'nameList', title: 'Liste der Namen', from: 'camp', text: 'Zwölf Namen, sieben durchgestrichen. Ganz unten: „Wir gehen zum Wasser. Wartet nicht.“' },
  { id: 'broadcastPlan', title: 'Sendeplan', from: 'mast', text: 'Kanal 4, jeden Abend 20 Uhr. Daneben, unterstrichen: „Wer das hört: Ihr seid nicht allein.“' },
  { id: 'aidLeaflet', title: 'Beipackzettel', from: 'airdrop', text: '„Hilfsgüter des Westbunds. Nicht zum Weiterverkauf.“ Auf der Rückseite hat jemand eine Landkarte gezeichnet.' },
  { id: 'cellarDiary', title: 'Kellertagebuch', from: 'watcher', text: 'Tag 212 ohne Sonne. Meine Haut ist hell wie Papier, die Augen brennen schon bei Kerzenlicht. Oben ist es nicht sicher. Ich bleibe unten. Ich passe auf.' },
];

/** Das allererste Erinnerungsstück, damit die Sammlung sofort startet. */
export const FIRST_MEMENTO = 'polaroid';

// --- Kampf -------------------------------------------------------------------------

export const MAX_HEALTH = 10;
/** Alle so viele Minuten kommt 1 Lebenspunkt von selbst zurück. */
export const HEALTH_REGEN_MIN = 20;

// --- Fortschritt: was die Stufen des Zuhauses bringen ---------------------------

/** Wirkung je Stufe (Index wie COMFORT_TIERS: Ruine, Notlager, …, Oase). Wirkungen zählen ab ihrer Stufe dauerhaft. */
export interface TierPerk {
  desc: string;
  /** Minuten pro Gesundheitspunkt (ersetzt den bisherigen Wert). */
  regenMin?: number;
  /** Zusätzliche Plätze am Werktisch. */
  slots?: number;
  /** Zusätzlicher Suchradius in Metern. */
  rangeM?: number;
  /** Mehr Glück: höhere Chance auf Kram und Sammelstücke. */
  luck?: number;
  /** Mehr Beute (Faktor). */
  lootFactor?: number;
}

export const TIER_PERKS: TierPerk[] = [
  { desc: 'Noch nichts. Mach es dir gemütlich!' },
  { desc: 'Du erholst dich schneller: alle 15 statt 20 Minuten ein Gesundheitspunkt.', regenMin: 15 },
  { desc: '+1 Platz am Werktisch.', slots: 1 },
  { desc: 'Du siehst mehr: Suchradius +10 m.', rangeM: 10 },
  { desc: 'Mehr Glück: öfter Kram und Sammelstücke.', luck: 1 },
  { desc: 'Du erholst dich noch schneller: alle 10 Minuten ein Punkt.', regenMin: 10 },
  { desc: 'Oase: 25 % mehr Beute beim Durchsuchen.', lootFactor: 1.25 },
];
/** So viel mehr Chance pro Glücksstufe. */
export const LUCK_KRAM = 0.08;
export const LUCK_COLLECT = 0.04;

// --- Streifer-Ruf: ein Rang für alles, was du draußen schaffst ---------------------

export const RANKS: { min: number; name: string }[] = [
  { min: 0, name: 'Neuling' },
  { min: 25, name: 'Sammler' },
  { min: 75, name: 'Späher' },
  { min: 175, name: 'Streifer' },
  { min: 350, name: 'Alter Streifer' },
  { min: 700, name: 'Legende' },
];
/** Ruf-Punkte pro Tat. */
export const RANK_POINTS = { search: 1, kill: 3, sector: 5, secured: 10, collectible: 8, set: 25, memento: 4, cache: 6 };
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
  walker: { name: 'Wandler', hp: 4, dmg: [1, 2], armor: 0, speed: 1, desc: 'Das Weinen hat ihn nicht getötet, nur ausgebrannt. Er zittert, folgt Wärme und Blut. Langsam, aber unermüdlich.' },
  crawler: { name: 'Kriecher', hp: 3, dmg: [1, 2], armor: 0, speed: 1.45, desc: 'Knochen wie Glas, flach am Boden. Flink und schwer zu erwischen.' },
  brute: { name: 'Borkenmann', hp: 6, dmg: [1, 3], armor: 1, speed: 0.85, desc: 'Graue Kalkplatten unter der Haut, hart wie Rinde, oft noch in Warnweste.' },
  watcher: { name: 'Bleicher Wächter', hp: 6, dmg: [2, 3], armor: 0, speed: 1.1, desc: 'Jahre ohne Tageslicht im Keller. Kommt nur nachts heraus und starrt, bis du dich nicht mehr rührst.' },
};

/** Welcher Gegner wie häufig eine Fundstelle bewacht. */
export const ENEMY_WEIGHTS: readonly (readonly [EnemyId, number])[] = [
  ['walker', 60],
  ['crawler', 25],
  ['brute', 15],
];
/** Dazu nachts: der Bleiche Wächter (tagsüber verkriecht er sich, Licht tut ihm weh). */
export const NIGHT_ENEMY_WEIGHTS: readonly (readonly [EnemyId, number])[] = [...ENEMY_WEIGHTS, ['watcher', 14]];

/** Was der Bleiche Wächter dabeihat: Dinge aus den Kellern, dazu einmalig sein Tagebuch. */
export const WATCHER_LOOT = { items: { medicine: 1, electronics: 2 } as Partial<Inventory>, kram: 'flashlight' as KramId, memento: 'cellarDiary' };

/** Anteil bewachter Fundstellen. */
export const GUARD_CHANCE = { grid: 0.25, poi: 0.4, special: 0.35 };
/** Bewachte Fundstellen lohnen sich: mehr Beute, öfter Erinnerungsstücke. */
export const GUARD_LOOT_FACTOR = 1.5;
export const GUARD_MEMENTO_BONUS = 0.12;

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
  crowbar: { name: 'Brechstange', dmg: 2, dur: 28, cost: { metal: 3 }, level: 1, desc: 'Öffnet Türen und Schädel.' },
  bat: { name: 'Nagelschläger', dmg: 3, dur: 32, cost: { wood: 3, metal: 2 }, level: 1, desc: 'Ein Baseballschläger mit ein paar Nägeln.' },
  crossbow: { name: 'Armbrust', dmg: 4, dur: 24, cost: { wood: 3, metal: 2, springs: 2, screws: 2, glue: 1 }, level: 2, desc: 'Leise und kräftig. Die Bolzen nutzen sich ab.' },
};

export const START_WEAPONS: Weapon[] = [{ kind: 'crowbar', dur: WEAPONS.crowbar.dur }];

// --- Kampf: kurze Taktik mit Karten (Runde für Runde) ------------------------------

export type { FoeKind };
export type CardId = 'punch' | 'throw' | 'dodge' | 'kick' | 'pry' | 'swing' | 'homerun' | 'bolt' | 'aim' | 'bandage';

export interface CardDef {
  name: string;
  /** Kostet so viel Kraft (pro Runde gibt es TACTICS.energy). */
  cost: number;
  /** near: ein Gegner vorne; any: auch hinten; self: du selbst. */
  target: 'near' | 'any' | 'self';
  dmg?: number;
  /** Fängt so viel Schaden ab (bis zu deiner nächsten Runde). */
  block?: number;
  heal?: number;
  /** Stößt den Gegner nach hinten und unterbricht sein Ausholen. */
  push?: boolean;
  /** Der Gegner setzt eine Runde aus. */
  stun?: boolean;
  /** Der nächste Wurf oder Bolzen macht so viel mehr Schaden. */
  focus?: number;
  /** Nutzt diese Waffe ab (1 pro Karte). */
  weapon?: WeaponId;
  /** Verbraucht 1 Medizin. */
  medicine?: boolean;
  desc: string;
}

export const CARDS: Record<CardId, CardDef> = {
  punch: { name: 'Faustschlag', cost: 1, target: 'near', dmg: 2, desc: '2 Schaden an einem Gegner vorne.' },
  throw: { name: 'Steinwurf', cost: 1, target: 'any', dmg: 1, desc: '1 Schaden, trifft auch Gegner hinten.' },
  dodge: { name: 'Ausweichen', cost: 1, target: 'self', block: 3, desc: 'Fängt 3 Schaden ab, bis zu deiner nächsten Runde.' },
  kick: { name: 'Tritt', cost: 1, target: 'near', dmg: 1, push: true, desc: '1 Schaden. Stößt den Gegner nach hinten und unterbricht sein Ausholen.' },
  pry: { name: 'Hebelhieb', cost: 1, target: 'near', dmg: 3, weapon: 'crowbar', desc: '3 Schaden mit der Brechstange.' },
  swing: { name: 'Schwinger', cost: 1, target: 'near', dmg: 4, weapon: 'bat', desc: '4 Schaden mit dem Nagelschläger.' },
  homerun: { name: 'Volltreffer', cost: 2, target: 'near', dmg: 6, stun: true, weapon: 'bat', desc: '6 Schaden, der Gegner setzt eine Runde aus.' },
  bolt: { name: 'Bolzen', cost: 1, target: 'any', dmg: 4, weapon: 'crossbow', desc: '4 Schaden, trifft auch Gegner hinten.' },
  aim: { name: 'Zielen', cost: 0, target: 'self', focus: 3, desc: 'Der nächste Bolzen oder Wurf macht 3 mehr Schaden.' },
  bandage: { name: 'Verbinden', cost: 1, target: 'self', heal: 3, medicine: true, desc: 'Heilt 3 Gesundheit, kostet 1 Medizin.' },
};

/** Grund-Karten, die man immer hat. */
export const BASE_DECK: CardId[] = ['punch', 'punch', 'punch', 'dodge', 'dodge', 'kick', 'throw', 'throw'];
/** Zusätzliche Karten pro heiler Waffe. */
export const WEAPON_CARDS: Record<WeaponId, CardId[]> = { crowbar: ['pry', 'pry', 'pry'], bat: ['swing', 'swing', 'homerun'], crossbow: ['bolt', 'bolt', 'aim'] };

export const TACTICS = {
  /** Kraft pro Runde */
  energy: 3,
  /** Karten auf der Hand */
  hand: 4,
  /** Höchstens so viele Verbinden-Karten (und nur, wenn genug Medizin da ist) */
  maxBandages: 2,
  /** Mehr Gegner gleichzeitig ruft der Heuler nicht herbei */
  maxFoes: 3,
  /** So oft heult ein Heuler höchstens */
  maxHowls: 2,
};

export type IntentKind = 'attack' | 'windup' | 'smash' | 'grab' | 'advance' | 'howl' | 'lurk' | 'stunned' | 'stare' | 'fade' | 'pounce';

export interface FoeTactic {
  name: string;
  hp: number;
  /** Zieht von jedem Treffer ab. */
  armor: number;
  /** Bleibt hinten (heult nur). */
  stayBack?: boolean;
  /** Was er der Reihe nach vorhat (beginnt an zufälliger Stelle). */
  pattern: { kind: IntentKind; dmg?: number }[];
  desc: string;
}

export const FOE_TACTICS: Record<FoeKind, FoeTactic> = {
  walker: {
    name: 'Wandler',
    hp: 8,
    armor: 0,
    pattern: [{ kind: 'attack', dmg: 2 }, { kind: 'attack', dmg: 3 }, { kind: 'grab', dmg: 1 }],
    desc: 'Das Weinen hat ihn ausgebrannt, nicht getötet. Langsam und unermüdlich. Packt er dich, hast du nächste Runde weniger Kraft.',
  },
  crawler: {
    name: 'Kriecher',
    hp: 5,
    armor: 0,
    pattern: [{ kind: 'attack', dmg: 3 }, { kind: 'lurk' }, { kind: 'attack', dmg: 3 }],
    desc: 'Knochen wie Glas, flach am Boden. Beißt schnell zu und duckt sich dann weg.',
  },
  brute: {
    name: 'Borkenmann',
    hp: 14,
    armor: 1,
    pattern: [{ kind: 'attack', dmg: 2 }, { kind: 'windup' }, { kind: 'smash', dmg: 6 }],
    desc: 'Kalkplatten wie eine Rüstung. Holt er aus, kommt ein schwerer Schlag: ausweichen oder wegtreten!',
  },
  screamer: {
    name: 'Heuler',
    hp: 3,
    armor: 0,
    stayBack: true,
    pattern: [{ kind: 'howl' }, { kind: 'attack', dmg: 1 }, { kind: 'attack', dmg: 1 }],
    desc: 'Bleibt hinten und heult. Das lockt weitere Wandler an. Zuerst ausschalten, mit Wurf oder Bolzen!',
  },
  watcher: {
    name: 'Bleicher Wächter',
    hp: 18,
    armor: 0,
    pattern: [{ kind: 'stare' }, { kind: 'attack', dmg: 4 }, { kind: 'fade' }, { kind: 'pounce', dmg: 6 }],
    desc: 'Nur nachts. Sein Blick lähmt: nächste Runde eine Karte und eine Kraft weniger. Dann weicht er ins Dunkel zurück und springt dich an. Solange er hinten lauert, treffen ihn nur Wurf und Bolzen; gegen den Sprung hilft Ausweichen.',
  },
};

// --- Durchsuchen: Geschick, Erstfund, Weiter wühlen --------------------------------

/** Wie gut das Mini-Spiel lief: so viel Beute und Glück. */
export const LOOT_QUALITY: Record<Quality, { factor: number; luck: number }> = {
  miss: { factor: 0.7, luck: 0 },
  good: { factor: 1, luck: 0 },
  perfect: { factor: 1.35, luck: 1 },
};
/** Eine Fundstelle zum allerersten Mal: doppelte Beute. */
export const FIRST_FIND_FACTOR = 2;

export const DIG = {
  /** So oft darf man nach dem Durchsuchen weiter wühlen. */
  max: 3,
  /** So lange nach dem Durchsuchen (Minuten). */
  minutes: 5,
  /** Ab so viel Lärm kommt etwas (zufällig dazwischen, man kennt es nicht genau). */
  limit: [2, 4] as [number, number],
  /** Chance, dass ein Wühlen doppelt so laut ist. */
  loud: 0.35,
  kramChance: 0.28,
  collectChance: 0.03,
};

/** Abseits der Wege im Wald: Wandler, Kriecher, selten ein Borkenmann (siehe Lore). */
export const WILD = {
  /** Chance pro 25 m quer durchs Unterholz. */
  chancePer25m: 0.07,
  /** Nachts öfter. */
  nightFactor: 1.5,
  /** Danach so lange Ruhe. */
  cooldownMs: 4 * 60_000,
  /** Höchstens so viele Meter zählen pro Meldung (gegen Sprünge). */
  maxMeters: 60,
};

// --- Erkunden: besondere Orte, Neuland, Ketten, Spuren ------------------------------

/** Besondere Orte: einmal pro Gegend (Kachel Zoom 14, ~1,5 km), fest aus dem Weltstartwert. */
export const SPECIAL = {
  zoom: 14,
  /** Anteil der Gegenden mit einem besonderen Ort */
  chance: 0.8,
  /** So viele mögliche Stellen pro Gegend (die erste freie gilt, nie an sensiblen Orten) */
  candidates: 6,
  /** Bis zu dieser Entfernung sieht man am Horizont, dass da etwas ist */
  hintM: 3000,
  /** Ab hier zeigt die Karte das Fragezeichen an der echten Stelle */
  nearM: 250,
};
export const SPECIAL_KINDS: SpotKind[] = ['heli', 'convoy', 'bunker', 'camp', 'mast', 'airdrop'];
export const SPECIAL_WEIGHTS: readonly (readonly [SpotKind, number])[] = [
  ['heli', 12],
  ['convoy', 18],
  ['bunker', 14],
  ['camp', 22],
  ['mast', 16],
  ['airdrop', 18],
];
/** Was man von Weitem sieht, bevor man weiß, was es ist. */
export type HintKind = 'smoke' | 'light' | 'signal' | 'chute';
export const SPECIAL_HINT: Partial<Record<SpotKind, HintKind>> = { heli: 'smoke', convoy: 'smoke', bunker: 'light', camp: 'light', mast: 'signal', airdrop: 'chute' };
export const HINT_NAMES: Record<HintKind, string> = {
  smoke: 'Rauch am Horizont',
  light: 'Ein Licht in der Ferne',
  signal: 'Ein schwaches Funksignal',
  chute: 'Ein Fallschirm in den Bäumen',
};

/** Neuland: Wo du noch kaum warst, ist die Beute seltener und besser. Stufe 0 vertraut, 1 Neuland, 2 fernes Land. */
export const TIER = {
  names: ['Vertraut', 'Neuland', 'Fernes Land'],
  /** Fernes Land: kein erkundeter Sektor in dieser Entfernung (in Sektoren, je ~0,5 km) */
  farSectors: 5,
  luck: [0, 1, 2],
  lootFactor: [1, 1.1, 1.3],
  mementoBonus: [0, 0.02, 0.05],
};

/** Zettel-Ketten: ein Hinweis führt zum nächsten, am Ende wartet etwas Besonderes. */
export const CHAIN = {
  steps: 3,
  minM: 300,
  maxM: 700,
  /** Anteil der Zettel-Hinweise, die eine Kette beginnen */
  share: 0.3,
  finalFactor: 3,
};

/** Spuren auf dem Boden, die zu einem Versteck führen. */
export const TRACKS = {
  chance: 0.04,
  /** An Wracks und Lagern öfter */
  specialChance: 0.35,
  minM: 150,
  maxM: 350,
  areaM: 22,
};
export const TRACK_LINES = [
  'Eine Blutspur führt weg. Jemand hat sich hier weggeschleppt.',
  'Schleifspuren im Dreck, als hätte jemand etwas Schweres gezogen.',
  'Frische Fußspuren, eilig, immer in eine Richtung.',
  'Pfotenabdrücke, dazwischen ein verlorener Handschuh.',
];

/** Wo man welchen Ortstyp findet (fürs Fundbuch, solange er noch fehlt). */
export const PLACE_WHERE: Record<SpotKind, string> = {
  car: 'An Straßen und auf Parkplätzen',
  backpack: 'Überall, wo jemand es eilig hatte',
  shed: 'In Gärten und am Dorfrand',
  container: 'An Sammelstellen und Straßenecken',
  hide: 'Am Waldrand, mit Blick aufs Feld',
  barrel: 'Bei Höfen, Werkstätten und Baustellen',
  parcel: 'Vor Häusern und an Packstationen',
  market: 'Supermärkte und Läden in der Stadt',
  pharmacy: 'Apotheken und Drogerien',
  hardware: 'Baumärkte, Werkstätten, Gartencenter',
  fuel: 'Tankstellen an größeren Straßen',
  well: 'Brunnen und Wasserstellen, oft im Dorf',
  stop: 'Bushaltestellen, auch auf dem Land',
  heli: 'Einmal pro Gegend. Achte auf Rauch am Horizont.',
  convoy: 'Einmal pro Gegend. Achte auf Rauch am Horizont.',
  bunker: 'Einmal pro Gegend. Achte auf ein Licht in der Ferne.',
  camp: 'Einmal pro Gegend. Achte auf ein Licht in der Ferne.',
  mast: 'Einmal pro Gegend. Achte auf ein Funksignal.',
  airdrop: 'Einmal pro Gegend. Achte auf einen Fallschirm.',
};
/** Belohnung für einen neuen Ortstyp (Haupt-Rohstoff des Ortes). */
export const NEW_PLACE_BONUS = 2;

/** Ein Satz zur Stimmung beim Durchsuchen (fest pro Fundstelle). */
export const SPOT_STORIES: Record<SpotKind, string[]> = {
  car: ['Der Schlüssel steckt noch. Auf dem Beifahrersitz ein Kindersitz, leer.', 'Die Türen stehen offen, als wären alle gleichzeitig ausgestiegen.', 'Im Handschuhfach eine Straßenkarte, die Küste rot umkringelt.'],
  backpack: ['Ordentlich gepackt. Wer packt so ordentlich und lässt es dann liegen?', 'Ein Riemen ist gerissen. Daneben Fußspuren, die schnell wurden.'],
  shed: ['Werkzeug hängt noch sauber an der Wand. Nur der Spaten fehlt.', 'Es riecht nach Öl und altem Holz. Jemand hat hier gewohnt, eine Weile.'],
  container: ['Obendrauf liegt ein Kinderschuh. Nur einer.', 'Jemand hat „HIER NICHTS“ draufgeschrieben. Wer glaubt das schon.'],
  hide: ['Von hier oben sieht man das ganze Feld. Und das, was darüber zieht.', 'Eingeritzt ins Holz: Striche, sehr viele Striche.'],
  barrel: ['Ein Fass ist mit Kreide markiert: ein Kreuz, ein Pfeil.', 'Es tropft noch. Irgendwer war vor Kurzem hier.'],
  parcel: ['„Bitte beim Nachbarn abgeben.“ Der Nachbar ist auch nicht mehr da.', 'Das Paket ist aufgerissen, aber nicht ausgeräumt. Seltsam.'],
  market: ['Die Regale sind leer, nur die Kasse steht noch offen.', 'Ein Einkaufswagen voller Wasserflaschen, mitten im Gang stehen gelassen.', 'Über der Tür hängt noch „Wir haben für Sie geöffnet“.'],
  pharmacy: ['Hinter der Theke Zettel mit Namen und Dosierungen, säuberlich.', 'Die Glastür ist eingeschlagen, aber jemand hat danach aufgeräumt.'],
  hardware: ['Die Kettensägen fehlen alle. Die Gartenzwerge sind noch da.', 'Am Eingang ein Schild: „Nur Barzahlung“. Darunter: „Nur Tausch“.'],
  fuel: ['Der Zapfhahn hängt noch im Tank eines Autos ohne Fahrer.', 'An der Scheibe der Preis von damals. Man muss trotzdem lachen.'],
  well: ['Das Wasser ist klar. Jemand hat ein sauberes Glas daneben gestellt.', 'Am Rand frische Kreidezeichen: drei Striche, ein Haken.'],
  stop: ['Der Fahrplan ist zugeklebt mit Suchzetteln.', 'Auf der Bank liegt eine Thermoskanne, noch halb voll.'],
  heli: ['Die Rotorblätter stecken im Boden wie Messer. Die Kabine ist leer.', 'Auf dem Rumpf ein rotes Kreuz, halb abgebrannt.'],
  convoy: ['Sechs Lastwagen, Stoßstange an Stoßstange. Keiner ist weitergekommen.', 'Die Planen flattern. Auf einer steht „Hilfsgüter“.'],
  bunker: ['Die Tür ist von innen verriegelt. Manchmal klopft es.', 'Ein rotes Licht blinkt über dem Eingang, Tag und Nacht.'],
  camp: ['Die Feuerstelle ist kalt, die Zelte stehen noch. Niemand antwortet.', 'Wäsche hängt auf einer Leine zwischen zwei Bäumen.'],
  mast: ['Der Mast summt leise. Irgendwo läuft noch ein Generator.', 'Von oben hängt ein Kabel bis zum Boden, frisch geflickt.'],
  airdrop: ['Der Fallschirm hängt in den Bäumen, die Kiste ist aufgeplatzt.', 'Jemand hat schon versucht, die Kiste aufzustemmen, und aufgegeben.'],
};
/** Hinweis bei Tag: nachts ist es hier anders (mehr Beute, mehr Gefahr). */
export const NIGHT_HINT = 'Komm nachts wieder: Dann gibt es hier mehr zu holen, aber nicht ohne Gefahr.';

// --- Draußen: Händlerkisten und Verstecke -------------------------------------------

/** Liegengebliebene Händlerkarren: tauchen für ein Zeitfenster an einer Fundstelle auf (für alle gleich). */
export const CART = {
  /** Länge eines Zeitfensters (Stunden) */
  windowH: 2,
  /** Chance pro Fundstelle und Fenster (bei ~27 Fundstellen pro km² etwa eine pro 500 m Umkreis) */
  chance: 0.04,
  lootFactor: 2.5,
  kramBonus: 0.45,
  collectBonus: 0.12,
};

/** Verstecke: Ein Hinweis (Zettel, Kreidezeichen, Funkspruch) zeigt grob, wo etwas liegt. */
export const CACHE = {
  /** Chance auf einen Hinweis beim Durchsuchen (beim ersten Besuch etwas mehr) */
  clueChance: 0.06,
  firstBonus: 0.06,
  /** So viele offene Hinweise höchstens */
  max: 3,
  /** Entfernung vom Fundort des Hinweises (Meter) */
  minM: 180,
  maxM: 450,
  /** Radius des Suchkreises auf der Karte; das Versteck liegt irgendwo darin */
  areaM: 75,
  /** So nah muss man ran zum Ausgraben */
  digM: 18,
  rolls: 4,
  factor: 2,
  collectChance: 0.5,
  blueprintChance: 0.35,
};

/** Funkgerät zu Hause: alle paar Stunden ein Funkspruch, manchmal mit Hinweis. */
export const RADIO = {
  everyH: 20,
  /** Hinweise per Funk liegen etwas weiter weg */
  minM: 250,
  maxM: 600,
};

/** Was auf Kanal 4 so läuft. Nummer = Index (wird im Spielstand nicht gespeichert, nur im Ereignis). */
export const RADIO_LINES: string[] = [
  '„… Kanal 4, hier ist Haltestelle Nord. Wasser abkochen, auch wenn es klar aussieht …“',
  '„… wer einen aus dem Bautrupp sieht, mit Warnweste: Abstand halten. Das sind keine Leute mehr …“',
  '„… Nebel bis morgen früh. Bleibt drin, bei Nebel sind die Wandler wach …“',
  '„… an alle Landstreifer: Bei der alten Mühle wächst ein Nest. Wer helfen kann, kommt bei Tageslicht …“',
  '„… Tauschmarkt am Samstag. Bringt Schrauben und Batterien, Medizin gegen Saatgut …“',
  '„… hier ist die Küste. Wiederhole: hier ist die Küste. Fisch für alle, die es bis …“ Dann nur noch Rauschen.',
  '„… Keller sind tabu. Ich sag es nochmal: Keller sind tabu …“',
  '„… Kanal 4, Kanal 4, bitte melden …“ Niemand antwortet. Wie jeden Abend.',
  '„… hab was versteckt, für die, die nach uns kommen. Folgt den Kreidezeichen …“',
  '„… Heuler in der Tiefgarage am Markt. Leise sein, Licht aus, weitergehen …“',
  '„… wer im Hellen geht, kommt heim. Gute Nacht, Kanal 4 …“',
];

/** Holzofen: Eintopf kochen. Heilt ganz und macht ein paar Stunden satt (mehr Beute). */
export const COOK = {
  cost: { food: 2, water: 1, wood: 1 } as Partial<Inventory>,
  fedH: 3,
  lootBonus: 0.2,
};

/** Seltenheit für Farben und Glanz beim Fund. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
export const RARITY: Record<Resource, Rarity> = {
  food: 'common',
  water: 'common',
  wood: 'common',
  metal: 'common',
  stone: 'common',
  cloth: 'uncommon',
  plastic: 'uncommon',
  screws: 'uncommon',
  glass: 'uncommon',
  medicine: 'rare',
  glue: 'rare',
  electronics: 'rare',
  rubber: 'common',
  leather: 'uncommon',
  springs: 'uncommon',
  gears: 'uncommon',
  copper: 'uncommon',
  oil: 'uncommon',
  cells: 'rare',
  antiseptic: 'rare',
  phosphate: 'epic',
};

// --- Tageszeit ---------------------------------------------------------------------

/** Nachts bewachen mehr Zombies die Fundstellen ... */
export const NIGHT_GUARD_FACTOR = 1.6;
/** ... dafür gibt es mehr Beute. */
export const NIGHT_LOOT_FACTOR = 1.3;
/** GPS-Positionen, die ungenauer sind, decken keine Karte auf. */
export const EXPLORE_MAX_ACCURACY_M = 45;
