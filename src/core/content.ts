// Spielinhalte als reine Daten. Neue Fundorte, Gegenstände oder Ausbauten
// kommen hier dazu, ohne dass sich die Logik ändern muss.

import type { GearId, GearSlot, BackgroundId, CollectibleId, EnemyId, FoeKind, Inventory, KramId, Material, Quality, RegionId, Resource, SetId, SpotKind, Survival, TerrainKind, Weapon, WeaponId, WorldEventKind } from './types';

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

/**
 * Sichtweite auf der Karte (Meter, Tag, klare Sicht). Kleines (Pilze, Rucksäcke, Fässer,
 * Pakete, Verstecke) sieht man erst aus der Nähe: es taucht auf, wenn man herankommt.
 * Nachts und bei Nebel oder Staub kürzer, in offenen Gegenden und von Hügeln weiter.
 */
export const SIGHT = {
  baseM: 150,
  nightFactor: 0.65,
  fogFactor: 0.55,
  smallKinds: ['mushrooms', 'backpack', 'barrel', 'parcel', 'hide'] as readonly SpotKind[],
};

/** Hochsitze, Jagdhütten und Unterstände: so weit weg von Häusern und Siedlungen (Meter). */
export const WILD_SPOT_MIN_M = 150;

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
    kram: [['carBattery', 3], ['gasCan', 3], ['carRadio', 3], ['jack', 2], ['wiperBlades', 3], ['firstAidKit', 2], ['hubcap', 3], ['motorOil', 2], ['spareTire', 1], ['trafficCone', 1], ['toolbox', 1], ['cableReel', 1], ['tape', 1], ['sparkPlugs', 2], ['jumperCables', 2], ['sideMirror', 2], ['licensePlate', 2], ['warningTriangle', 2], ['antifreeze', 1], ['roadAtlas', 2], ['keyring', 1], ['dashCam', 2], ['airFreshener', 3], ['iceScraper', 2], ['towRope', 2], ['navi', 2], ['parkingDisc', 2], ['beadSeat', 1], ['emergencyBlanket', 1], ['cassetteTapes', 1], ['windshieldFluid', 1], ['oilFilter', 1], ['mudFlap', 1]],
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
      { res: 'medicine', min: 1, max: 1, chance: 0.1 },
      { res: 'plastic', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.65,
    kram: [['sneakers', 3], ['blanket', 2], ['flashlight', 2], ['tinCans', 2], ['brokenPhone', 2], ['thermos', 3], ['powerbank', 2], ['headphones', 3], ['umbrella', 2], ['firstAidKit', 1], ['radio', 1], ['tablet', 1], ['readingGlasses', 1], ['canOpener', 1], ['energyCans', 1], ['sunglasses', 1], ['walkman', 2], ['waterBottle', 2], ['keyring', 2], ['wallet', 2], ['compass', 1], ['pocketKnife', 1], ['harmonica', 1], ['playingCards', 1], ['leatherBelt', 1], ['raincoat', 1], ['diary', 2], ['lunchbox', 2], ['pencilCase', 2], ['waterFilter', 1], ['headlamp', 2], ['emergencyBlanket', 1], ['fitnessTracker', 1], ['bikeHelmet', 1], ['lostGlove', 1]],
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
    kram: [['toolbox', 2], ['screwBox', 2], ['fruitCrate', 2], ['hedgeShears', 3], ['gardenHose', 3], ['bikeLock', 2], ['bikeParts', 2], ['oilCan', 2], ['mousetrap', 2], ['bucket', 2], ['fertilizer', 1], ['superglue', 1], ['pan', 1], ['shovel', 3], ['wateringCan', 2], ['mowerEngine', 2], ['gardenGloves', 2], ['birdhouse', 2], ['clayPot', 2], ['chainsaw', 1], ['tarp', 1], ['rope', 2], ['paintCan', 1], ['nails', 2], ['padlock', 1], ['bricks', 1], ['solarLight', 1], ['pitchfork', 1], ['boneMeal', 1], ['tractorPart', 1], ['gardenGnome', 2], ['wheelbarrowWheel', 2], ['hatchet', 2], ['seedPackets', 2], ['grillGrate', 2], ['deckChair', 2], ['vise', 1], ['pondPump', 1], ['storageJars', 1], ['drillBits', 1], ['sandpaper', 1], ['measuringTape', 1]],
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
      { res: 'medicine', min: 1, max: 1, chance: 0.08 },
    ],
    kramChance: 0.7,
    kram: [['sneakers', 2], ['blanket', 3], ['leatherJacket', 2], ['handbag', 2], ['rubberBoots', 2], ['toaster', 2], ['hairDryer', 2], ['clothesIron', 2], ['alarmClock', 1], ['umbrella', 1], ['pan', 1], ['bottles', 1], ['mixer', 2], ['waffleIron', 2], ['cookingPot', 1], ['teapot', 2], ['picnicBasket', 1], ['cuckooClock', 1], ['sewingKit', 2], ['typewriter', 1], ['telephone', 2], ['vacuum', 2], ['boombox', 2], ['gameConsole', 1], ['tableLamp', 2], ['powerStrip', 1], ['candles', 1], ['magazines', 2], ['boardGame', 2], ['readingGlasses', 1], ['crutch', 1], ['clayPot', 1], ['sunglasses', 1], ['walkman', 1], ['wallet', 1], ['winterCoat', 3], ['workBoots', 2], ['leatherBelt', 2], ['raincoat', 1], ['gardenGnome', 1], ['blender', 2], ['microwave', 2], ['knittingBasket', 2], ['slideProjector', 1], ['snowGlobe', 2], ['photoAlbum', 2], ['vinylRecords', 2], ['recordPlayer', 1], ['cassetteTapes', 2], ['ashtray', 1], ['fondueSet', 2], ['yogaMat', 1], ['robotVacuum', 1], ['aluFoil', 1], ['storageJars', 2], ['pillOrganizer', 1], ['thermometer', 1], ['hearingAid', 1]],
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
    kram: [['tinCans', 2], ['thermos', 3], ['binoculars', 1], ['lantern', 2], ['blanket', 2], ['flashlight', 2], ['bottles', 1], ['schnapps', 1], ['birdhouse', 1], ['compass', 1], ['pocketKnife', 1], ['sleepingBag', 1], ['trailCam', 3], ['hatchet', 1], ['deerCall', 2], ['saltLick', 2], ['rangefinder', 2], ['hipFlask', 2], ['fireSteel', 1]],
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
    kram: [['bottles', 2], ['fruitCrate', 2], ['tinCans', 2], ['oilCan', 2], ['motorOil', 1], ['rubberBoots', 1], ['bucket', 2], ['fertilizer', 1], ['barbedWire', 1], ['gasBottle', 1], ['handPump', 1], ['milkCan', 2], ['horseshoe', 2], ['pitchfork', 2], ['boneMeal', 2], ['tractorPart', 2], ['siphonPump', 2], ['barrelTap', 2], ['pondPump', 2], ['cementBag', 1]],
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
      { res: 'medicine', min: 1, max: 1, chance: 0.18 },
      { res: 'electronics', min: 1, max: 1, chance: 0.35 },
      { res: 'glue', min: 1, max: 1, chance: 0.35 },
      { res: 'cloth', min: 1, max: 1, chance: 0.3 },
    ],
    kramChance: 0.8,
    kram: [['radio', 2], ['brokenPhone', 2], ['powerbank', 2], ['headphones', 2], ['speaker', 2], ['cordlessDrill', 1], ['kitchenScale', 2], ['kettle', 2], ['deskFan', 2], ['hairDryer', 2], ['alarmClock', 2], ['superglue', 1], ['tape', 1], ['flashlight', 1], ['toaster', 1], ['screwBox', 1], ['mixer', 2], ['cuckooClock', 1], ['sewingKit', 1], ['typewriter', 1], ['telephone', 1], ['vacuum', 1], ['boombox', 1], ['gameConsole', 2], ['laptop', 1], ['tablet', 1], ['tableLamp', 1], ['lightBulbs', 1], ['powerStrip', 1], ['batteries', 1], ['magazines', 1], ['boardGame', 1], ['pencilCase', 1], ['blender', 1], ['slideProjector', 1], ['vinylRecords', 1], ['recordPlayer', 1], ['smartSpeaker', 2], ['yogaMat', 2], ['airFryer', 2], ['ledStrip', 2], ['robotVacuum', 1], ['fitnessTracker', 1], ['bikeHelmet', 1]],
    collectibles: ['globe', 'typewriter', 'painting', 'teddy', 'rubberDuck', 'sewingMachine', 'wallClock', 'guitar'],
    mementoChance: 0.18,
  },
  // --- echte Orte aus der Karte (POI) ---
  // Pilze wachsen nur im Wald (die Karte blendet sie anderswo aus), im Herbst am meisten
  mushrooms: {
    names: ['Pilzstelle', 'Pilze am Baumstumpf', 'Hexenring', 'Moosiger Hang'],
    hint: 'Pilze zum Essen, ab und zu Heilkräuter',
    cooldownMin: 120,
    loot: [
      { res: 'food', min: 1, max: 3, chance: 1 },
      { res: 'medicine', min: 1, max: 1, chance: 0.06 },
    ],
    kramChance: 0,
    kram: [],
    collectibles: [],
    mementoChance: 0,
  },
  market: {
    names: ['Geplünderter Supermarkt', 'Dorfladen', 'Bäckerei mit Vorratskeller'],
    hint: 'Viel Nahrung und Wasser, dazu Kunststoff und Glas',
    cooldownMin: 180,
    loot: [
      { res: 'food', min: 2, max: 4, chance: 1 },
      { res: 'water', min: 1, max: 3, chance: 0.9 },
      { res: 'plastic', min: 1, max: 2, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.4 },
      { res: 'medicine', min: 1, max: 1, chance: 0.1 },
    ],
    kramChance: 0.55,
    kram: [['bottles', 3], ['fruitCrate', 2], ['tinCans', 2], ['coffeeMachine', 2], ['kettle', 2], ['schnapps', 2], ['cashRegister', 1], ['toaster', 1], ['pan', 1], ['waffleIron', 1], ['cookingPot', 2], ['teapot', 1], ['lightBulbs', 1], ['batteries', 2], ['candles', 1], ['shoppingCart', 2], ['canOpener', 1], ['glassCleaner', 2], ['cookingOil', 3], ['coolBox', 1], ['seedPackets', 1], ['snowGlobe', 1], ['priceGun', 2], ['shopBasket', 3], ['barcodeScanner', 2], ['aluFoil', 2], ['storageJars', 1]],
    collectibles: ['vase', 'rubberDuck'],
    mementoChance: 0.12,
  },
  pharmacy: {
    names: ['Apotheke', 'Arztpraxis', 'Notaufnahme'],
    hint: 'Medikamente und Verbandszeug',
    cooldownMin: 180,
    loot: [
      { res: 'medicine', min: 1, max: 2, chance: 1 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'plastic', min: 1, max: 1, chance: 0.5 },
      { res: 'glass', min: 1, max: 1, chance: 0.4 },
    ],
    kramChance: 0.5,
    kram: [['bloodPressure', 2], ['disinfectant', 3], ['firstAidKit', 2], ['hotWaterBottle', 2], ['bottles', 1], ['blanket', 1], ['readingGlasses', 1], ['gauze', 3], ['crutch', 1], ['pillOrganizer', 2], ['thermometer', 2], ['coldPack', 2], ['rollator', 1], ['hearingAid', 1], ['iodine', 2], ['stethoscope', 1], ['mortar', 2]],
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
    kram: [['toolbox', 3], ['tape', 2], ['screwBox', 3], ['superglue', 2], ['cableReel', 2], ['copperWire', 2], ['cordlessDrill', 2], ['gardenHose', 2], ['fertilizer', 1], ['mousetrap', 1], ['oilCan', 1], ['bucket', 1], ['carBattery', 1], ['gasCan', 1], ['lightBulbs', 2], ['powerStrip', 2], ['batteries', 1], ['shovel', 1], ['chainsaw', 1], ['tarp', 1], ['rope', 1], ['paintCan', 2], ['woodGlue', 3], ['nails', 3], ['padlock', 2], ['spiritLevel', 2], ['multimeter', 1], ['bricks', 1], ['workBoots', 1], ['hardHat', 1], ['emptyExtinguisher', 1], ['toolBag', 1], ['gasBottle', 1], ['wheelbarrowWheel', 1], ['vise', 2], ['cementBag', 2], ['ledStrip', 1], ['caulkGun', 2], ['drillBits', 2], ['cableTies', 2], ['pipeWrench', 2], ['insulationRoll', 2], ['sandpaper', 2], ['measuringTape', 2]],
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
    kram: [['gasCan', 3], ['motorOil', 3], ['carBattery', 2], ['wiperBlades', 2], ['schnapps', 1], ['bottles', 2], ['tinCans', 1], ['flashlight', 1], ['trafficCone', 1], ['batteries', 2], ['sparkPlugs', 1], ['jumperCables', 1], ['glassCleaner', 1], ['coolBox', 1], ['antifreeze', 2], ['roadAtlas', 1], ['energyCans', 2], ['sunglasses', 1], ['emptyExtinguisher', 1], ['jerrycan', 1], ['siphonPump', 1], ['barcodeScanner', 1], ['windshieldFluid', 2], ['lotteryTickets', 2], ['hotDogRoller', 1], ['motorcycleHelmet', 1], ['oilFilter', 2]],
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
    kram: [['bottles', 1], ['bucket', 2], ['rubberBoots', 1], ['wateringCan', 2], ['handPump', 3], ['milkCan', 1], ['barrelTap', 1], ['pipeWrench', 1], ['pulleyWheel', 2], ['tinCup', 2], ['wishingCoins', 3]],
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
    kram: [['trafficCone', 2], ['brokenPhone', 2], ['headphones', 2], ['umbrella', 2], ['sneakers', 1], ['flashlight', 1], ['thermos', 1], ['boombox', 1], ['magazines', 1], ['padlock', 1], ['licensePlate', 1], ['roadAtlas', 1], ['energyCans', 1], ['walkman', 1], ['waterBottle', 1], ['keyring', 1], ['wallet', 1], ['playingCards', 1], ['raincoat', 1], ['hardHat', 1], ['horseshoe', 1], ['lunchbox', 1], ['ashtray', 1], ['hipFlask', 1], ['rollator', 1], ['lotteryTickets', 1], ['timetablePoster', 3], ['ticketPrinter', 2], ['bikeHelmet', 1], ['lostGlove', 2], ['benchSlats', 2]],
    collectibles: ['phone', 'bike', 'teddy'],
    mementoChance: 0.2,
  },

  // --- besondere Orte: einmal pro Gegend (~1,5 km), mit Geschichte und seltener Beute ---
  heli: {
    names: ['Abgestürzter Hubschrauber', 'Hubschrauberwrack'],
    hint: 'Medizin, Elektronik, Metall aus dem Wrack',
    cooldownMin: 720,
    loot: [
      { res: 'medicine', min: 1, max: 2, chance: 0.8 },
      { res: 'electronics', min: 1, max: 3, chance: 0.85 },
      { res: 'metal', min: 2, max: 4, chance: 0.9 },
      { res: 'glass', min: 1, max: 2, chance: 0.5 },
      { res: 'screws', min: 1, max: 2, chance: 0.5 },
    ],
    kramChance: 0.9,
    kram: [['radio', 3], ['firstAidKit', 3], ['binoculars', 2], ['powerbank', 2], ['carBattery', 1], ['toolbox', 2], ['flashlight', 2], ['laptop', 1], ['gauze', 1], ['compass', 1], ['walkieTalkie', 2], ['flareGun', 2], ['emptyExtinguisher', 1], ['pilotHelmet', 2], ['flightRecorder', 1], ['emergencyBlanket', 1], ['stethoscope', 1], ['cockpitGauge', 2], ['pilotHeadset', 2], ['stretcher', 1]],
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
    kram: [['gasCan', 3], ['jack', 2], ['spareTire', 2], ['motorOil', 2], ['carBattery', 2], ['toolbox', 2], ['tinCans', 2], ['tarp', 1], ['bricks', 1], ['sparkPlugs', 1], ['jumperCables', 1], ['sideMirror', 1], ['licensePlate', 1], ['warningTriangle', 1], ['campStove', 1], ['messTin', 1], ['walkieTalkie', 1], ['flareGun', 1], ['ammoCrate', 2], ['rationPack', 2], ['hardHat', 1], ['toolBag', 1], ['jerrycan', 2], ['sandbag', 2], ['barbedWire', 1], ['camoNet', 2], ['dashCam', 1], ['towRope', 1], ['beadSeat', 1], ['rangefinder', 1], ['motorcycleHelmet', 1], ['fieldPhone', 2], ['seaBag', 2], ['mudFlap', 2], ['mapCase', 2], ['radioBattery', 2], ['cargoNet', 1]],
    collectibles: ['tv'],
    mementoChance: 0.05,
  },
  bunker: {
    names: ['Verriegelte Bunkertür', 'Alter Schutzbunker'],
    hint: 'Was am Eingang zurückblieb. Drinnen ist eine Rote Zone.',
    cooldownMin: 720,
    loot: [
      { res: 'medicine', min: 1, max: 2, chance: 0.6 },
      { res: 'food', min: 1, max: 2, chance: 0.7 },
      { res: 'water', min: 1, max: 2, chance: 0.7 },
      { res: 'electronics', min: 1, max: 2, chance: 0.5 },
      { res: 'metal', min: 1, max: 3, chance: 0.7 },
    ],
    kramChance: 0.85,
    kram: [['flashlight', 3], ['gasMask', 3], ['radio', 2], ['cableReel', 2], ['lantern', 2], ['firstAidKit', 2], ['tinCans', 1], ['laptop', 1], ['candles', 1], ['messTin', 1], ['walkieTalkie', 2], ['ammoCrate', 2], ['rationPack', 1], ['emptyExtinguisher', 1], ['relayBox', 1], ['sandbag', 1], ['barbedWire', 1], ['iodine', 1], ['fieldPhone', 1], ['mapCase', 1], ['geigerCounter', 2], ['airFilter', 2], ['ventFan', 2], ['guardLog', 2], ['bunkSprings', 2], ['circuitBoard', 1]],
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
    kram: [['blanket', 3], ['lantern', 3], ['thermos', 2], ['leatherJacket', 2], ['tinCans', 2], ['pan', 2], ['schnapps', 1], ['sneakers', 1], ['cookingPot', 2], ['picnicBasket', 2], ['candles', 2], ['tarp', 2], ['rope', 2], ['canOpener', 2], ['coolBox', 2], ['waterBottle', 1], ['pocketKnife', 1], ['harmonica', 1], ['playingCards', 1], ['sleepingBag', 2], ['campStove', 2], ['messTin', 2], ['solarLight', 1], ['camoNet', 1], ['gasBottle', 1], ['diary', 1], ['waterFilter', 1], ['headlamp', 1], ['grillGrate', 1], ['deckChair', 1], ['knittingBasket', 1], ['tinCup', 1], ['tentPegs', 3], ['washBasin', 2], ['fireSteel', 2], ['mosquitoNet', 2]],
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
    kram: [['cableReel', 3], ['copperWire', 3], ['carBattery', 2], ['radio', 2], ['speaker', 1], ['brokenPhone', 1], ['multimeter', 2], ['walkieTalkie', 2], ['toolBag', 2], ['relayBox', 2], ['cableTies', 1], ['radioBattery', 1], ['ventFan', 1], ['antennaCable', 2], ['aviationLight', 2], ['circuitBoard', 2]],
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
      { res: 'medicine', min: 1, max: 2, chance: 0.6 },
      { res: 'cloth', min: 1, max: 2, chance: 0.6 },
    ],
    kramChance: 0.85,
    kram: [['tinCans', 3], ['firstAidKit', 3], ['disinfectant', 2], ['powerbank', 2], ['blanket', 2], ['flashlight', 2], ['gauze', 2], ['sleepingBag', 1], ['flareGun', 1], ['rationPack', 2], ['waterFilter', 2], ['stretcher', 1], ['cargoNet', 2], ['gpsBeacon', 2]],
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
  // --- noch mehr Kram (150 Sorten wie bei Fallout) ---
  mixer: { name: 'Handmixer', desc: 'Zwei Rührbesen, keine Eier.', parts: { copper: 1, gears: 1, plastic: 1 }, minutes: 2 },
  waffleIron: { name: 'Waffeleisen', desc: 'Riecht immer noch nach Sonntag.', parts: { metal: 2, copper: 1 }, minutes: 2 },
  cookingPot: { name: 'Kochtopf', desc: 'Ohne Deckel. Der Deckel ist ja immer weg.', parts: { metal: 3 }, minutes: 2 },
  teapot: { name: 'Teekanne', desc: 'Ostfriesenmuster, ein Sprung im Henkel.', parts: { stone: 2 }, minutes: 2 },
  picnicBasket: { name: 'Picknickkorb', desc: 'Kariert. Natürlich kariert.', parts: { wood: 2, cloth: 1 }, minutes: 2 },
  cuckooClock: { name: 'Kuckucksuhr', desc: 'Der Kuckuck ist ausgezogen.', parts: { wood: 2, gears: 2, springs: 1 }, minutes: 4 },
  sewingKit: { name: 'Nähkästchen', desc: 'Fäden in allen Farben, verknotet zu einem.', parts: { cloth: 1, metal: 1, plastic: 1 }, minutes: 2 },
  typewriter: { name: 'Schreibmaschine', desc: 'Das ü klemmt.', parts: { metal: 3, springs: 2, gears: 1 }, minutes: 6 },
  telephone: { name: 'Wählscheibentelefon', desc: 'Wähl die 110. Es tutet nicht.', parts: { copper: 1, plastic: 2, springs: 1 }, minutes: 3 },
  vacuum: { name: 'Staubsauger', desc: 'Ganz viel Staub. Nur leider drin.', parts: { copper: 1, plastic: 2, rubber: 1 }, minutes: 4 },
  boombox: { name: 'Ghettoblaster', desc: 'Die Kassette heißt „Party 1997“.', parts: { electronics: 1, copper: 1, plastic: 2 }, minutes: 4 },
  gameConsole: { name: 'Spielkonsole', desc: 'Speicherstand: Level 7. Für immer.', parts: { electronics: 1, plastic: 1, copper: 1 }, minutes: 3 },
  laptop: { name: 'Laptop', desc: 'Das Passwort klebt unter der Tastatur.', parts: { electronics: 2, glass: 1, cells: 1, plastic: 1 }, minutes: 5 },
  tablet: { name: 'Tablet', desc: 'Der Bildschirm zeigt dich. In Schwarz.', parts: { electronics: 1, glass: 1, cells: 1 }, minutes: 3 },
  tableLamp: { name: 'Nachttischlampe', desc: 'Fransen am Schirm. Großmutter-Schick.', parts: { copper: 1, glass: 1, cloth: 1 }, minutes: 2 },
  lightBulbs: { name: 'Glühbirnen', desc: 'Drei von vier sind heil. Angeblich.', parts: { glass: 2, copper: 1 }, minutes: 1 },
  powerStrip: { name: 'Mehrfachsteckdose', desc: 'Sechs Steckplätze, null Strom.', parts: { copper: 1, plastic: 1 }, minutes: 1 },
  batteries: { name: 'Packung Batterien', desc: 'Zwei sind noch voll, zwei tun nur so.', parts: { cells: 2 }, minutes: 1 },
  candles: { name: 'Kerzenstummel', desc: 'Für den nächsten Stromausfall. Also für immer.', parts: { oil: 1 }, minutes: 1 },
  magazines: { name: 'Stapel Zeitschriften', desc: 'Die Fernsehzeitung von nächster Woche. Aus 2019.', parts: { cloth: 2 }, minutes: 1 },
  boardGame: { name: 'Brettspiel', desc: 'Die Würfel fehlen. Spannung pur.', parts: { wood: 1, plastic: 1 }, minutes: 2 },
  readingGlasses: { name: 'Lesebrille', desc: 'Plus 2,5. Die Welt bleibt unscharf.', parts: { glass: 1, metal: 1 }, minutes: 1 },
  gauze: { name: 'Mullbinden', desc: 'Steril verpackt. Wie in alten Zeiten.', parts: { cloth: 2, antiseptic: 1 }, minutes: 1 },
  crutch: { name: 'Krücke', desc: 'Eine. Die andere hat jemand gebraucht.', parts: { metal: 2, rubber: 1 }, minutes: 2 },
  shovel: { name: 'Spaten', desc: 'Vielleicht der aus dem Schuppen nebenan.', parts: { metal: 2, wood: 1 }, minutes: 2 },
  wateringCan: { name: 'Gießkanne', desc: 'Zink, mit Brause. Unkaputtbar.', parts: { metal: 2 }, minutes: 1 },
  mowerEngine: { name: 'Rasenmähermotor', desc: 'Der Rasen hat ihn überlebt.', parts: { metal: 2, gears: 1, oil: 1 }, minutes: 5 },
  gardenGloves: { name: 'Gartenhandschuhe', desc: 'Ein Daumen ist durch.', parts: { leather: 1, cloth: 1 }, minutes: 1 },
  birdhouse: { name: 'Vogelhaus', desc: 'Leer. Die Meisen sind umgezogen.', parts: { wood: 2 }, minutes: 2 },
  clayPot: { name: 'Tontopf', desc: 'Terrakotta, mit etwas Erde drin.', parts: { stone: 1 }, minutes: 1 },
  chainsaw: { name: 'Kettensäge', desc: 'Ohne Kette. Zum Glück.', parts: { metal: 2, gears: 1, oil: 1 }, minutes: 6 },
  tarp: { name: 'Plane', desc: 'Blau, wie alle Planen.', parts: { plastic: 2 }, minutes: 1 },
  rope: { name: 'Seil', desc: 'Zwanzig Meter, ordentlich aufgerollt.', parts: { cloth: 2 }, minutes: 1 },
  paintCan: { name: 'Farbeimer', desc: 'Ziegelrot. Für irgendeinen Zaun.', parts: { oil: 1, metal: 1 }, minutes: 1 },
  woodGlue: { name: 'Holzleim', desc: 'Klebt alles, nur nicht die Familie.', parts: { glue: 2, plastic: 1 }, minutes: 1 },
  nails: { name: 'Schachtel Nägel', desc: 'Krumme mitgezählt.', parts: { metal: 2 }, minutes: 1 },
  padlock: { name: 'Vorhängeschloss', desc: 'Ohne Schlüssel. Wie immer.', parts: { metal: 1, springs: 1 }, minutes: 1 },
  spiritLevel: { name: 'Wasserwaage', desc: 'Zeigt: Die Welt hängt schief.', parts: { metal: 1, glass: 1 }, minutes: 1 },
  multimeter: { name: 'Messgerät', desc: 'Misst null Volt. Überall.', parts: { electronics: 1, copper: 1, plastic: 1 }, minutes: 3 },
  bricks: { name: 'Ziegelsteine', desc: 'Drei Stück, einer zerbrochen.', parts: { stone: 2 }, minutes: 1 },
  sparkPlugs: { name: 'Zündkerzen', desc: 'Vier Stück, eine sogar sauber.', parts: { metal: 1, stone: 1 }, minutes: 1 },
  jumperCables: { name: 'Starthilfekabel', desc: 'Rot an Plus. Oder war es Schwarz?', parts: { copper: 2, rubber: 1 }, minutes: 2 },
  sideMirror: { name: 'Seitenspiegel', desc: 'Objekte im Spiegel sind näher, als sie scheinen.', parts: { glass: 1, plastic: 1 }, minutes: 1 },
  licensePlate: { name: 'Nummernschild', desc: 'Aus einem Landkreis, den es so nicht mehr gibt.', parts: { metal: 1 }, minutes: 1 },
  warningTriangle: { name: 'Warndreieck', desc: 'Achtung, Unfall. Seit sechs Jahren.', parts: { plastic: 1, glass: 1 }, minutes: 1 },
  shoppingCart: { name: 'Einkaufswagen', desc: 'Ein Rad eiert. Natürlich.', parts: { metal: 4, rubber: 1 }, minutes: 5 },
  canOpener: { name: 'Dosenöffner', desc: 'Das wertvollste Werkzeug der Welt.', parts: { metal: 1, gears: 1 }, minutes: 1 },
  glassCleaner: { name: 'Glasreiniger', desc: 'Streifenfrei. Die Welt nicht.', parts: { antiseptic: 1, plastic: 1 }, minutes: 1 },
  cookingOil: { name: 'Speiseöl', desc: 'Sonnenblume. Brennt auch prima.', parts: { oil: 2, plastic: 1 }, minutes: 1 },
  coolBox: { name: 'Kühlbox', desc: 'Riecht ganz leicht nach Grillwurst.', parts: { plastic: 2, metal: 1 }, minutes: 2 },
  antifreeze: { name: 'Frostschutzmittel', desc: 'Grün, giftig, riecht süß. Finger weg.', parts: { oil: 1, plastic: 1 }, minutes: 1 },
  roadAtlas: { name: 'Straßenatlas', desc: 'Mit Kringeln um Orte, die es noch gibt.', parts: { cloth: 2 }, minutes: 1 },
  energyCans: { name: 'Leere Energydosen', desc: 'Haben jemanden wach gehalten. Wie lange?', parts: { metal: 1 }, minutes: 1 },
  sunglasses: { name: 'Sonnenbrille', desc: 'Cool bleibt man trotzdem.', parts: { plastic: 1, glass: 1 }, minutes: 1 },
  walkman: { name: 'Walkman', desc: 'Kassette drin: Mixtape „Für S.“', parts: { electronics: 1, gears: 1, plastic: 1 }, minutes: 3 },
  waterBottle: { name: 'Trinkflasche', desc: 'Leer. Aber dicht.', parts: { metal: 1, plastic: 1 }, minutes: 1 },
  keyring: { name: 'Schlüsselbund', desc: 'Zu Türen, die jetzt alle offen stehen.', parts: { metal: 1 }, minutes: 1 },
  wallet: { name: 'Geldbörse', desc: 'Drin: zwanzig Euro, ein Foto, ein Pfandbon.', parts: { leather: 1 }, minutes: 1 },
  compass: { name: 'Kompass', desc: 'Zeigt nach Norden. Wenigstens einer.', parts: { glass: 1, metal: 1 }, minutes: 1 },
  pocketKnife: { name: 'Taschenmesser', desc: 'Mit Korkenzieher. Die Prioritäten stimmen.', parts: { metal: 2, springs: 1 }, minutes: 1 },
  harmonica: { name: 'Mundharmonika', desc: 'Spielt nur Blues.', parts: { metal: 1, wood: 1 }, minutes: 1 },
  playingCards: { name: 'Kartenspiel', desc: 'Das Herz-Ass fehlt.', parts: { plastic: 1 }, minutes: 1 },
  sleepingBag: { name: 'Schlafsack', desc: 'Riecht nach Lagerfeuer und nassem Hund.', parts: { cloth: 3 }, minutes: 2 },
  campStove: { name: 'Gaskocher', desc: 'Die Kartusche zischt noch.', parts: { metal: 2, oil: 1 }, minutes: 2 },
  messTin: { name: 'Kochgeschirr', desc: 'Grün, verbeult, unverwüstlich.', parts: { metal: 2 }, minutes: 1 },
  trailCam: { name: 'Wildkamera', desc: 'Letztes Bild: etwas Großes. Unscharf.', parts: { electronics: 1, cells: 1, plastic: 1 }, minutes: 3 },
  winterCoat: { name: 'Wintermantel', desc: 'Mit Pelzkragen. Hoffentlich nur Kunstpelz.', parts: { cloth: 3 }, minutes: 2 },
  workBoots: { name: 'Arbeitsschuhe', desc: 'Mit Stahlkappe. Kann nützlich sein.', parts: { leather: 2, rubber: 1 }, minutes: 2 },
  leatherBelt: { name: 'Ledergürtel', desc: 'Ein Loch weiter als früher.', parts: { leather: 1, metal: 1 }, minutes: 1 },
  raincoat: { name: 'Regenjacke', desc: 'Gelb wie ein Fischkutter.', parts: { plastic: 1, cloth: 1 }, minutes: 1 },
  walkieTalkie: { name: 'Handfunkgerät', desc: 'Rauschen auf Kanal 4.', parts: { electronics: 1, cells: 1, copper: 1 }, minutes: 3 },
  flareGun: { name: 'Signalpistole', desc: 'Leer. Der letzte Hilferuf ist raus.', parts: { metal: 2, springs: 1 }, minutes: 2 },
  ammoCrate: { name: 'Leere Munitionskiste', desc: 'Leer. Jemand war schneller.', parts: { metal: 3 }, minutes: 2 },
  rationPack: { name: 'EPa-Packung', desc: 'Nur noch das Kaugummi. Steinhart.', parts: { plastic: 1 }, minutes: 1 },
  hardHat: { name: 'Bauhelm', desc: 'Gelb, mit Namen drin: „Jürgen“.', parts: { plastic: 2 }, minutes: 1 },
  emptyExtinguisher: { name: 'Leerer Feuerlöscher', desc: 'Leer gesprüht. Gegen was?', parts: { metal: 3 }, minutes: 2 },
  toolBag: { name: 'Werkzeugtasche', desc: 'Ein Elektriker war hier.', parts: { leather: 1, metal: 1, screws: 1 }, minutes: 2 },
  solarLight: { name: 'Solarleuchte', desc: 'Leuchtet nachts noch. Ein bisschen.', parts: { cells: 1, glass: 1, plastic: 1 }, minutes: 2 },
  relayBox: { name: 'Schaltkasten', desc: 'Ein Kasten voller Blitz. Jetzt still.', parts: { electronics: 1, copper: 2, metal: 1 }, minutes: 4 },
  pilotHelmet: { name: 'Pilotenhelm', desc: 'Mit Sprechfunk. Ohne Pilot.', parts: { plastic: 2, glass: 1 }, minutes: 2 },
  flightRecorder: { name: 'Flugschreiber', desc: 'Orange, nicht schwarz. Was er gehört hat, bleibt drin.', parts: { electronics: 2, metal: 2 }, minutes: 6 },
  jerrycan: { name: 'Bundeswehrkanister', desc: 'Olivgrün. Fast voll.', parts: { oil: 2, metal: 1 }, minutes: 2 },
  sandbag: { name: 'Sandsack', desc: 'Hält Kugeln ab. Und den Rücken kaputt.', parts: { cloth: 1, stone: 2 }, minutes: 2 },
  barbedWire: { name: 'Stacheldraht', desc: 'Vorsicht. Wirklich.', parts: { metal: 2 }, minutes: 2 },
  camoNet: { name: 'Tarnnetz', desc: 'Versteckt alles, außer dem Geruch.', parts: { cloth: 2, plastic: 1 }, minutes: 2 },
  gasBottle: { name: 'Leere Gasflasche', desc: 'Der letzte Grillabend ist lange her.', parts: { metal: 3 }, minutes: 2 },
  handPump: { name: 'Alte Handpumpe', desc: 'Quietscht beim ersten Schwung.', parts: { metal: 3, rubber: 1 }, minutes: 4 },
  milkCan: { name: 'Milchkanne', desc: 'Vom Hof nebenan. Die Kühe sind weg.', parts: { metal: 2 }, minutes: 2 },
  horseshoe: { name: 'Hufeisen', desc: 'Bringt Glück. Damals hat es nicht gereicht.', parts: { metal: 1 }, minutes: 1 },
  pitchfork: { name: 'Mistgabel', desc: 'Für Heu. Und für alles andere.', parts: { metal: 2, wood: 1 }, minutes: 2 },
  boneMeal: { name: 'Knochenmehl', desc: 'Dünger aus der alten Welt. Riecht, wie er heißt.', parts: { phosphate: 1 }, minutes: 1 },
  tractorPart: { name: 'Traktorteil', desc: 'Für einen Deutz, den es nicht mehr gibt.', parts: { metal: 2, gears: 1 }, minutes: 3 },
  // --- Kram 151 bis 250 ---
  dashCam: { name: 'Dashcam', desc: 'Hat alles aufgenommen. Will man nicht sehen.', parts: { electronics: 1, glass: 1, plastic: 1 }, minutes: 2 },
  airFreshener: { name: 'Duftbaum', desc: 'Waldfrische. Riecht nach allem außer Wald.', parts: { cloth: 1 }, minutes: 1 },
  iceScraper: { name: 'Eiskratzer', desc: 'Mit Handschuh dran. Es war ein langer Winter.', parts: { plastic: 1, cloth: 1 }, minutes: 1 },
  towRope: { name: 'Abschleppseil', desc: 'Gelb, mit zwei Haken. Gezogen hat es keiner.', parts: { cloth: 1, metal: 1 }, minutes: 1 },
  navi: { name: 'Navi', desc: 'Bitte wenden. Bitte wenden. Bitte wenden.', parts: { electronics: 1, glass: 1, cells: 1 }, minutes: 2 },
  parkingDisc: { name: 'Parkscheibe', desc: 'Eingestellt auf halb drei. Für immer.', parts: { plastic: 1 }, minutes: 1 },
  beadSeat: { name: 'Kugelsitzauflage', desc: 'Massiert den Rücken. Vierhundert Holzkugeln, keine gleich.', parts: { wood: 2, cloth: 1 }, minutes: 2 },
  diary: { name: 'Tagebuch', desc: 'Die letzten Seiten sind leer. Man liest trotzdem weiter.', parts: { cloth: 1, leather: 1 }, minutes: 1 },
  lunchbox: { name: 'Brotdose', desc: 'Mit Namen drauf. Leer gegessen.', parts: { plastic: 2 }, minutes: 1 },
  pencilCase: { name: 'Federmäppchen', desc: 'Drei Buntstifte, alle braun.', parts: { plastic: 1, cloth: 1 }, minutes: 1 },
  waterFilter: { name: 'Wasserfilter-Strohhalm', desc: 'Macht Pfützen trinkbar. Sagt die Packung.', parts: { plastic: 1, antiseptic: 1 }, minutes: 1 },
  headlamp: { name: 'Stirnlampe', desc: 'Leuchtet genau dahin, wo du hinschaust. Leider.', parts: { cells: 1, plastic: 1, rubber: 1 }, minutes: 1 },
  emergencyBlanket: { name: 'Rettungsdecke', desc: 'Gold auf der einen Seite, Silber auf der anderen, kalt auf beiden.', parts: { plastic: 1 }, minutes: 1 },
  gardenGnome: { name: 'Gartenzwerg', desc: 'Lächelt. Immer. Das ist das Unheimliche.', parts: { stone: 2 }, minutes: 1 },
  wheelbarrowWheel: { name: 'Schubkarrenrad', desc: 'Platt. Aber rund ist es noch.', parts: { rubber: 2, metal: 1 }, minutes: 2 },
  hatchet: { name: 'Beil', desc: 'Stumpf genug zum Zerlegen, scharf genug für Respekt.', parts: { metal: 2, wood: 1 }, minutes: 2 },
  seedPackets: { name: 'Samentütchen', desc: 'Radieschen, Bohnen, Sonnenblumen. Die Zukunft in Papier.', parts: { cloth: 1 }, minutes: 1 },
  grillGrate: { name: 'Grillrost', desc: 'Mit Resten vom letzten Sommer.', parts: { metal: 2 }, minutes: 1 },
  deckChair: { name: 'Klappstuhl', desc: 'Klappt. Meistens zu.', parts: { metal: 1, cloth: 1, screws: 1 }, minutes: 2 },
  vise: { name: 'Schraubstock', desc: 'Hält fest. Hat es immer getan.', parts: { metal: 3, screws: 1 }, minutes: 4 },
  blender: { name: 'Standmixer', desc: 'Smoothies waren mal wichtig.', parts: { glass: 1, copper: 1, gears: 1 }, minutes: 3 },
  microwave: { name: 'Mikrowelle', desc: 'Pling. Ein letztes Mal.', parts: { metal: 2, glass: 1, copper: 1, electronics: 1 }, minutes: 4 },
  knittingBasket: { name: 'Strickkorb', desc: 'Ein halber Schal. Die andere Hälfte strickt keiner mehr.', parts: { cloth: 2, wood: 1 }, minutes: 1 },
  slideProjector: { name: 'Diaprojektor', desc: 'Urlaub 1987, Magazin 3. Spannend wie damals.', parts: { glass: 1, electronics: 1, metal: 1, gears: 1 }, minutes: 3 },
  snowGlobe: { name: 'Schneekugel', desc: 'Darin schneit es noch, wenn man schüttelt.', parts: { glass: 1, plastic: 1 }, minutes: 1 },
  photoAlbum: { name: 'Fotoalbum', desc: 'Fremde Gesichter auf Familienfesten. Alle lachen.', parts: { cloth: 1, leather: 1, glue: 1 }, minutes: 1 },
  vinylRecords: { name: 'Schallplatten', desc: 'Schlager, Schlager, eine Ausnahme.', parts: { plastic: 2 }, minutes: 1 },
  recordPlayer: { name: 'Plattenspieler', desc: 'Die Nadel ist noch da. Der Strom nicht.', parts: { electronics: 1, springs: 1, wood: 1, copper: 1 }, minutes: 4 },
  cassetteTapes: { name: 'Kassetten', desc: 'Mixtape „Für Sabine“. Gute Auswahl.', parts: { plastic: 2 }, minutes: 1 },
  ashtray: { name: 'Aschenbecher', desc: 'Kristall, schwer, voll. Ein Klassiker.', parts: { glass: 2 }, minutes: 1 },
  fondueSet: { name: 'Fondue-Set', desc: 'Sechs Gabeln in sechs Farben. Kein Käse.', parts: { metal: 2, oil: 1 }, minutes: 2 },
  deerCall: { name: 'Lockpfeife', desc: 'Klingt wie ein Reh. Sagt der Jäger.', parts: { wood: 1 }, minutes: 1 },
  saltLick: { name: 'Salzleckstein', desc: 'Die Rehe mochten ihn. Ziemlich abgeleckt.', parts: { stone: 2 }, minutes: 1 },
  rangefinder: { name: 'Entfernungsmesser', desc: 'Zeigt 312 Meter bis zu etwas. Was, sagt er nicht.', parts: { electronics: 1, glass: 1, cells: 1 }, minutes: 2 },
  hipFlask: { name: 'Flachmann', desc: 'Leer. Der Jäger hatte einen langen Winter.', parts: { metal: 1 }, minutes: 1 },
  siphonPump: { name: 'Umfüllpumpe', desc: 'Zum Umfüllen. Nicht zum Ansaugen mit dem Mund.', parts: { plastic: 1, rubber: 1 }, minutes: 1 },
  barrelTap: { name: 'Fasshahn', desc: 'Messing. Tropft nicht mehr.', parts: { copper: 1, metal: 1 }, minutes: 1 },
  pondPump: { name: 'Teichpumpe', desc: 'Die Goldfische sind ausgezogen.', parts: { copper: 1, plastic: 1, gears: 1 }, minutes: 2 },
  cementBag: { name: 'Zementsack', desc: 'Steinhart. Fertig gemischt hat ihn der Regen.', parts: { stone: 3 }, minutes: 2 },
  smartSpeaker: { name: 'Sprachassistent', desc: 'Sagt nichts mehr. Hört vielleicht noch zu.', parts: { electronics: 1, copper: 1, plastic: 1 }, minutes: 2 },
  yogaMat: { name: 'Yogamatte', desc: 'Rollt sich immer wieder ein. Wie ein Igel.', parts: { rubber: 2 }, minutes: 1 },
  airFryer: { name: 'Heißluftfritteuse', desc: 'Kam einen Tag zu spät.', parts: { metal: 1, plastic: 2, copper: 1, electronics: 1 }, minutes: 4 },
  ledStrip: { name: 'LED-Leiste', desc: 'Kann sechzehn Millionen Farben. Gerade keine.', parts: { copper: 1, plastic: 1, electronics: 1 }, minutes: 1 },
  robotVacuum: { name: 'Saugroboter', desc: 'Steht vor der Wand und wartet.', parts: { electronics: 1, cells: 1, plastic: 1, rubber: 1 }, minutes: 4 },
  fitnessTracker: { name: 'Fitnessarmband', desc: 'Letzter Eintrag: 23 000 Schritte. Persönlicher Rekord.', parts: { electronics: 1, rubber: 1, cells: 1 }, minutes: 1 },
  priceGun: { name: 'Preisauszeichner', desc: 'Etiketten für 0,99. Inflation gibt es hier nicht.', parts: { metal: 1, springs: 1, plastic: 1 }, minutes: 2 },
  shopBasket: { name: 'Einkaufskorb', desc: 'Rot, mit Griff, ohne Einkauf.', parts: { plastic: 2 }, minutes: 1 },
  barcodeScanner: { name: 'Kassenscanner', desc: 'Piep. Nichts. Piep. Nichts.', parts: { electronics: 1, glass: 1, copper: 1 }, minutes: 2 },
  aluFoil: { name: 'Alufolie', desc: 'Für Brote. Oder für Hüte, je nach Stimmung.', parts: { metal: 1 }, minutes: 1 },
  storageJars: { name: 'Einmachgläser', desc: 'Mit Gummiring. Oma wäre stolz.', parts: { glass: 2, rubber: 1 }, minutes: 1 },
  pillOrganizer: { name: 'Pillendose', desc: 'Montag bis Sonntag. Ab Donnerstag leer.', parts: { plastic: 1 }, minutes: 1 },
  thermometer: { name: 'Fieberthermometer', desc: '37,2. Seit Wochen.', parts: { glass: 1, electronics: 1 }, minutes: 1 },
  coldPack: { name: 'Kühlkompresse', desc: 'Kühlt nicht. Fühlt sich aber kalt an.', parts: { plastic: 1, antiseptic: 1 }, minutes: 1 },
  rollator: { name: 'Rollator', desc: 'Mit Körbchen und Klingel. Bremst links schlechter.', parts: { metal: 3, rubber: 2, screws: 1 }, minutes: 4 },
  hearingAid: { name: 'Hörgerät', desc: 'Hört Dinge, die man lieber nicht hört.', parts: { electronics: 1, cells: 1 }, minutes: 1 },
  iodine: { name: 'Jodtinktur', desc: 'Färbt alles braun und desinfiziert den Rest.', parts: { glass: 1, antiseptic: 2 }, minutes: 1 },
  stethoscope: { name: 'Stethoskop', desc: 'Man hört das eigene Herz. Ziemlich schnell.', parts: { rubber: 1, metal: 1, copper: 1 }, minutes: 2 },
  mortar: { name: 'Mörser und Stößel', desc: 'Für Kräuter. Endlich wieder gebraucht.', parts: { stone: 2 }, minutes: 1 },
  caulkGun: { name: 'Silikonpistole', desc: 'Mit einer halben Kartusche Weiß.', parts: { metal: 1, glue: 1 }, minutes: 1 },
  drillBits: { name: 'Bohrersatz', desc: 'Einer fehlt. Natürlich der Sechser.', parts: { metal: 2 }, minutes: 1 },
  cableTies: { name: 'Kabelbinder', desc: 'Halten die Welt zusammen. Ungefähr.', parts: { plastic: 2 }, minutes: 1 },
  pipeWrench: { name: 'Rohrzange', desc: 'Passt auf alles, was rund ist.', parts: { metal: 3 }, minutes: 2 },
  insulationRoll: { name: 'Dämmwolle', desc: 'Juckt. Wärmt aber.', parts: { glass: 2, cloth: 1 }, minutes: 2 },
  sandpaper: { name: 'Schleifpapier', desc: 'Körnung 80. Für grobe Zeiten.', parts: { stone: 1, glue: 1 }, minutes: 1 },
  measuringTape: { name: 'Maßband', desc: 'Fünf Meter. Schnellt zurück wie eine Peitsche.', parts: { metal: 1, springs: 1, plastic: 1 }, minutes: 1 },
  windshieldFluid: { name: 'Scheibenwischwasser', desc: 'Blau. Riecht nach Zitrone und Alkohol.', parts: { plastic: 1, antiseptic: 1 }, minutes: 1 },
  lotteryTickets: { name: 'Rubbellose', desc: 'Alle aufgerubbelt. Kein Gewinn. Passt.', parts: { cloth: 1 }, minutes: 1 },
  hotDogRoller: { name: 'Würstchengrill', desc: 'Rollen ohne Würstchen. Für immer.', parts: { metal: 2, copper: 1, gears: 1 }, minutes: 4 },
  motorcycleHelmet: { name: 'Motorradhelm', desc: 'Visier zerkratzt, Polster gut.', parts: { plastic: 2, cloth: 1 }, minutes: 2 },
  oilFilter: { name: 'Ölfilter', desc: 'Neu, eingeschweißt, nie verbaut.', parts: { metal: 1, oil: 1, cloth: 1 }, minutes: 1 },
  pulleyWheel: { name: 'Seilrolle', desc: 'Quietscht schon, wenn man sie ansieht.', parts: { metal: 2, gears: 1 }, minutes: 2 },
  tinCup: { name: 'Emaillebecher', desc: 'Hing an einer Kette am Brunnen. Die Kette hängt noch.', parts: { metal: 1 }, minutes: 1 },
  wishingCoins: { name: 'Brunnenmünzen', desc: 'Aus dem Brunnen gefischt. Die Wünsche gleich mit.', parts: { copper: 1, metal: 1 }, minutes: 1 },
  timetablePoster: { name: 'Fahrplanaushang', desc: 'Nächster Bus: 7:42. Seit Jahren.', parts: { plastic: 1, cloth: 1 }, minutes: 1 },
  ticketPrinter: { name: 'Fahrscheindrucker', desc: 'Druckt nichts mehr aus. Nicht mal Ausreden.', parts: { electronics: 1, gears: 1, metal: 1 }, minutes: 3 },
  bikeHelmet: { name: 'Fahrradhelm', desc: 'Kindergröße, mit Dinosauriern.', parts: { plastic: 1, cloth: 1 }, minutes: 1 },
  lostGlove: { name: 'Einzelner Handschuh', desc: 'Der andere wartet an einer anderen Haltestelle.', parts: { cloth: 1, leather: 1 }, minutes: 1 },
  benchSlats: { name: 'Bankbretter', desc: 'Mit eingeritzten Initialen: J + M.', parts: { wood: 2, screws: 1 }, minutes: 2 },
  cockpitGauge: { name: 'Cockpit-Anzeige', desc: 'Höhe: null. Stimmt.', parts: { glass: 1, electronics: 1, gears: 1 }, minutes: 3 },
  pilotHeadset: { name: 'Pilotenheadset', desc: 'Riecht nach Kerosin und Kaffee.', parts: { copper: 1, rubber: 1, electronics: 1 }, minutes: 2 },
  stretcher: { name: 'Klapptrage', desc: 'Orange, klappbar, nie benutzt.', parts: { metal: 2, cloth: 2 }, minutes: 3 },
  fieldPhone: { name: 'Feldtelefon', desc: 'Mit Kurbel. Am anderen Ende niemand.', parts: { copper: 2, electronics: 1, gears: 1 }, minutes: 3 },
  seaBag: { name: 'Seesack', desc: 'Namensschild: Hauptgefreiter Wenzel.', parts: { cloth: 2, leather: 1 }, minutes: 1 },
  mudFlap: { name: 'Schmutzfänger', desc: 'Vom Lastwagen. Mit Schlamm von weit weg.', parts: { rubber: 2 }, minutes: 1 },
  mapCase: { name: 'Kartentasche', desc: 'Mit Karte. Die Kreuze sind mit Bleistift.', parts: { leather: 1, plastic: 1, cloth: 1 }, minutes: 1 },
  radioBattery: { name: 'Funkgeräte-Akku', desc: 'Schwer wie ein Ziegel und fast so nützlich.', parts: { cells: 2, metal: 1 }, minutes: 2 },
  geigerCounter: { name: 'Geigerzähler', desc: 'Knackt leise. Lieber nicht genauer hinhören.', parts: { electronics: 1, glass: 1, cells: 1 }, minutes: 3 },
  airFilter: { name: 'Luftfilter', desc: 'Hat jahrelang die Luft gereinigt. Jetzt ist er müde.', parts: { cloth: 1, metal: 1, stone: 1 }, minutes: 2 },
  ventFan: { name: 'Lüfterrad', desc: 'Dreht sich, wenn man pustet.', parts: { metal: 2, copper: 1, gears: 1 }, minutes: 3 },
  guardLog: { name: 'Wachbuch', desc: 'Letzter Eintrag: „Alles ruhig.“', parts: { cloth: 1, leather: 1 }, minutes: 1 },
  bunkSprings: { name: 'Bettfedern', desc: 'Aus einem Stockbett. Knarren gibt es gratis dazu.', parts: { springs: 2, metal: 1 }, minutes: 2 },
  tentPegs: { name: 'Heringe', desc: 'Zwölf Stück, elf davon gerade.', parts: { metal: 1 }, minutes: 1 },
  washBasin: { name: 'Faltschüssel', desc: 'Zum Waschen, Spülen und Haareschneiden.', parts: { plastic: 1, rubber: 1 }, minutes: 1 },
  fireSteel: { name: 'Feuerstahl', desc: 'Funken auf Knopfdruck. Fast.', parts: { metal: 1, stone: 1 }, minutes: 1 },
  mosquitoNet: { name: 'Moskitonetz', desc: 'Die Mücken haben überlebt. Natürlich.', parts: { cloth: 1, plastic: 1 }, minutes: 1 },
  antennaCable: { name: 'Antennenkabel', desc: 'Koaxial, dick, schwer. Gut.', parts: { copper: 2, rubber: 1 }, minutes: 2 },
  aviationLight: { name: 'Flugwarnleuchte', desc: 'Blinkte jahrelang rot. Für niemanden.', parts: { glass: 1, copper: 1, electronics: 1 }, minutes: 3 },
  circuitBoard: { name: 'Platine', desc: 'Grün, mit hundert Lötpunkten. Jeder ein kleiner Schatz.', parts: { electronics: 2, copper: 1 }, minutes: 3 },
  cargoNet: { name: 'Ladenetz', desc: 'Hat die Kiste gehalten. Den Aufprall nicht.', parts: { cloth: 2, metal: 1 }, minutes: 2 },
  gpsBeacon: { name: 'Peilsender', desc: 'Piept noch. Wer hört zu?', parts: { electronics: 1, cells: 1, plastic: 1 }, minutes: 2 },
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
/** Pilzstellen: Chance pro Kachel und Runde, je Monat (Januar … Dezember). Im Herbst am meisten. */
export const MUSHROOM_CHANCE = [0.05, 0.05, 0.08, 0.12, 0.18, 0.25, 0.3, 0.4, 0.6, 0.65, 0.45, 0.1] as const;

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

/**
 * Porträts zum Aussuchen (statt einer Figur). Die gemalten Bilder liegen in
 * src/assets/portraits/portrait-<Nummer>.webp (ab 1). Fehlt ein Bild, zeigt das Spiel eine
 * einfache Zeichnung aus `look`. `look` bestimmt auch die Figur im Zuhause und im Kampf.
 */
export const PORTRAITS: readonly { who: string; look: { hair: number; color: number; skin: number } }[] = [
  { who: 'Frau, kurze dunkle Haare, olivgrüne Regenjacke', look: { hair: 0, color: 1, skin: 0 } },
  { who: 'Mann mit Bart und Mütze, braune Arbeitsjacke', look: { hair: 3, color: 0, skin: 1 } },
  { who: 'Junge Frau mit Zopf, roter Schal', look: { hair: 2, color: 3, skin: 3 } },
  { who: 'Älterer Mann, graue Haare, Brille', look: { hair: 0, color: 4, skin: 1 } },
  { who: 'Mann mit Locken, blauer Kapuzenpulli', look: { hair: 0, color: 2, skin: 3 } },
  { who: 'Frau mit Dutt und Strickjacke', look: { hair: 2, color: 4, skin: 0 } },
  { who: 'Frau mit Bob, grüner Parka', look: { hair: 1, color: 1, skin: 1 } },
  { who: 'Mann mit Glatze und Dreitagebart, geflickte Jacke', look: { hair: 3, color: 4, skin: 2 } },
];

/** Welches Porträt gehört zu diesem Aussehen? (Alte Spielstände: das ähnlichste.) */
export function portraitIndex(look: { hair: number; color: number; skin: number; portrait?: number }): number {
  if (look.portrait !== undefined && look.portrait >= 0 && look.portrait < PORTRAITS.length) return look.portrait;
  let best = 0;
  let bestScore = -1;
  PORTRAITS.forEach((p, i) => {
    const score = (p.look.skin === look.skin ? 3 : 0) + (p.look.hair === look.hair ? 2 : 0) + (p.look.color === look.color ? 1 : 0);
    if (score > bestScore) (best = i), (bestScore = score);
  });
  return best;
}

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
/** Medizin heilt so viel, draußen wie im Kampf (Verbinden). Medizin ist knapp, jede zählt. */
export const HEAL_AMOUNT = 4;
export const HEAL_IN_COMBAT = 4;

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
  /** Nahkampf oder Fernkampf (trifft auch hinten). In den Kampf geht je eine davon. */
  range: 'melee' | 'ranged';
  dmg: number;
  dur: number;
  cost: Partial<Inventory>;
  /** Nötige Stufe des Werktischs. */
  level: number;
  desc: string;
  /** Nicht baubar, nur zu finden (Sammelwaffe): Seltenheit und wo. */
  rarity?: CardRarity;
  where?: string;
  art?: string;
}

/** Ohne Waffe kämpft man mit den Fäusten. */
export const FIST_DAMAGE = 1;

export const WEAPON_ORDER: WeaponId[] = ['crowbar', 'bat', 'crossbow'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  crowbar: { name: 'Brechstange', range: 'melee', dmg: 2, dur: 28, cost: { metal: 3 }, level: 1, art: 'brechstange', desc: 'Öffnet Türen und Schädel.' },
  bat: { name: 'Nagelschläger', range: 'melee', dmg: 3, dur: 32, cost: { wood: 3, metal: 2 }, level: 1, art: 'nagelschlaeger', desc: 'Ein Baseballschläger mit ein paar Nägeln.' },
  crossbow: { name: 'Armbrust', range: 'ranged', dmg: 4, dur: 24, cost: { wood: 3, metal: 2, springs: 2, screws: 2, glue: 1 }, level: 2, art: 'armbrust', desc: 'Leise und kräftig. Die Bolzen nutzen sich ab.' },
  // Nur zu finden (Fundorte und Sichtungen)
  shovel: { name: 'Spaten', range: 'melee', dmg: 3, dur: 30, cost: {}, level: 0, rarity: 'common', where: 'Kleingärten, Baumärkte, Schuppen', art: 'spaten', desc: 'Gräbt und stößt Gegner zurück.' },
  axe: { name: 'Axt', range: 'melee', dmg: 5, dur: 26, cost: {}, level: 0, rarity: 'rare', where: 'Scheunen, Hofläden, Baumärkte', art: 'axt', desc: 'Schwer und langsam, aber wer getroffen wird, bleibt liegen.' },
  golfclub: { name: 'Golfschläger', range: 'ranged', dmg: 3, dur: 24, cost: {}, level: 0, rarity: 'rare', where: 'Autos, Garagen, Sichtungen', art: 'golfschlaeger', desc: 'Reicht weit, trifft auch Gegner hinten.' },
  slingshot: { name: 'Schleuder', range: 'ranged', dmg: 2, dur: 30, cost: {}, level: 0, rarity: 'rare', where: 'Kioske, Rucksäcke, Sichtungen', art: 'schleuder', desc: 'Kostet keine Kraft, einmal pro Runde.' },
  lid: { name: 'Tonnendeckel', range: 'melee', dmg: 2, dur: 24, cost: {}, level: 0, rarity: 'common', where: 'Container, Haltestellen', art: 'tonnendeckel', desc: 'Verbeult, aber er hält. Mehr Schild als Waffe.' },
  extinguisher: { name: 'Feuerlöscher', range: 'melee', dmg: 3, dur: 22, cost: {}, level: 0, rarity: 'epic', where: 'Tankstellen, Werkstätten', art: 'feuerloescher', desc: 'Schwer genug zum Zuschlagen, und der Löschnebel blendet alle.' },
  machete: { name: 'Machete', range: 'melee', dmg: 3, dur: 26, cost: {}, level: 0, rarity: 'rare', where: 'Schuppen, Kleingärten, Baumärkte', art: 'machete', desc: 'Eigentlich für Brombeeren. Jeder Hieb gibt Schwung für den nächsten.' },
  sledgehammer: { name: 'Vorschlaghammer', range: 'melee', dmg: 8, dur: 20, cost: {}, level: 0, rarity: 'legendary', where: 'Sichtungen (Kisten und Wracks)', art: 'vorschlaghammer', desc: 'Schwer und langsam, aber jeder Treffer haut um.' },
  pitchfork: { name: 'Mistgabel', range: 'melee', dmg: 3, dur: 28, cost: {}, level: 0, rarity: 'common', where: 'Hofläden, Schuppen, Scheunen', art: 'mistgabel', desc: 'Hält dir die Meute vom Leib: stößt alle vorne zurück.' },
  bow: { name: 'Sportbogen', range: 'ranged', dmg: 5, dur: 24, cost: {}, level: 0, rarity: 'epic', where: 'Sichtungen (liegengebliebene Kisten)', art: 'sportbogen', desc: 'Leise und weit: Pfeile treffen überall, auf Abstand am stärksten.' },
  nailgun: { name: 'Nagelpistole', range: 'ranged', dmg: 2, dur: 24, cost: {}, level: 0, rarity: 'epic', where: 'Baumärkte, Werkstätten', art: 'nagelpistole', desc: 'Trifft zwei Gegner mit einem Druck, mit einer Salve sogar alle.' },
};
export const RANGE_NAMES: Record<WeaponDef['range'], string> = { melee: 'Nahkampf', ranged: 'Fernkampf' };
/** Waffen, die man nur findet (Sammelbuch). */
export const FOUND_WEAPONS: WeaponId[] = ['shovel', 'pitchfork', 'lid', 'axe', 'machete', 'golfclub', 'slingshot', 'nailgun', 'extinguisher', 'bow', 'sledgehammer'];

export const START_WEAPONS: Weapon[] = [{ kind: 'crowbar', dur: WEAPONS.crowbar.dur }];

// --- Ausrüstung am Körper ---------------------------------------------------------------
// Jedes Teil gibt es einmal. Gefunden wird es beim Durchsuchen, passend zum Ort.
// Wirkt schon: Abwehr (zu Beginn jedes Kampfs). Kommt später: Wärme (Winterwetter),
// Atemschutz (Rote Zonen), Rucksack-Fächer (Rucksack mit festen Fächern).

export const GEAR_SLOT_ORDER: GearSlot[] = ['head', 'face', 'body', 'hands', 'legs', 'feet', 'back'];
export const GEAR_SLOTS: Record<GearSlot, { name: string }> = {
  head: { name: 'Kopf' },
  face: { name: 'Gesicht' },
  body: { name: 'Körper' },
  hands: { name: 'Hände' },
  legs: { name: 'Beine' },
  feet: { name: 'Füße' },
  back: { name: 'Rücken' },
};

export interface GearDef {
  name: string;
  slot: GearSlot;
  desc: string;
  /** Abwehr zu Beginn jedes Kampfs (fängt die ersten Treffer ab). */
  armor?: number;
  /** Wärme gegen Kälte (zählt, sobald es Kälte gibt). */
  warmth?: number;
  /** Atemschutz: 1 = kurz, 2 = lange (für Rote Zonen, kommt später). */
  filter?: number;
  /** Fächer im Rucksack (zählt mit dem Rucksack-Limit). */
  packSlots?: number;
  /** Lauter oder leiser unterwegs (−0,2 = Trupps hören dich 20 % später). */
  noise?: number;
  /** Schneller im Sumpf und an Bächen (Gummistiefel). */
  wade?: boolean;
  /** Wo man es finden kann. */
  findAt: SpotKind[];
}

export const GEAR: Record<GearId, GearDef> = {
  beanie: { name: 'Wollmütze', slot: 'head', desc: 'Kratzt ein bisschen, hält aber warm.', warmth: 1, findAt: ['market', 'backpack', 'camp', 'parcel'] },
  bikeHelmet: { name: 'Fahrradhelm', slot: 'head', desc: 'Leicht, mit dem Aufkleber eines Sportvereins.', armor: 1, findAt: ['shed', 'car', 'stop'] },
  hardHat: { name: 'Bauhelm', slot: 'head', desc: 'Gelb, verkratzt, schwer. Hält einiges aus.', armor: 2, findAt: ['hardware', 'container'] },
  dustMask: { name: 'Staubmaske', slot: 'face', desc: 'Gegen Staub. Gegen das Weinen hilft sie nur kurz.', filter: 1, findAt: ['pharmacy', 'hardware', 'shed'] },
  safetyGoggles: { name: 'Schutzbrille', slot: 'face', desc: 'Schützt die Augen vor Splittern und Schnäbeln.', armor: 1, findAt: ['hardware', 'container', 'fuel'] },
  gasMask: { name: 'Gasmaske', slot: 'face', desc: 'Mit frischem Filter. Damit traut man sich nach unten.', filter: 2, findAt: ['bunker', 'convoy', 'heli'] },
  rainJacket: { name: 'Regenjacke', slot: 'body', desc: 'Raschelt bei jedem Schritt, aber du bleibst trocken.', warmth: 1, noise: 0.15, findAt: ['backpack', 'car', 'market'] },
  workJacket: { name: 'Arbeitsjacke', slot: 'body', desc: 'Dicker Stoff, viele Taschen, Ölflecken.', armor: 1, warmth: 1, findAt: ['hardware', 'container', 'fuel'] },
  protectiveVest: { name: 'Schutzweste', slot: 'body', desc: 'Aus einem liegengebliebenen Einsatzwagen. Schwer, aber sie hält.', armor: 2, findAt: ['convoy', 'heli', 'bunker'] },
  gardenGloves: { name: 'Gartenhandschuhe', slot: 'hands', desc: 'Grün mit Blümchen. Gut zum Wühlen.', findAt: ['shed', 'market'] },
  workGloves: { name: 'Arbeitshandschuhe', slot: 'hands', desc: 'Leder an den Fingern. Da rutscht nichts.', armor: 1, findAt: ['hardware', 'container', 'car'] },
  jeans: { name: 'Jeans', slot: 'legs', desc: 'Ausgeblichen, aber robust.', findAt: ['backpack', 'parcel', 'market'] },
  workTrousers: { name: 'Arbeitshose', slot: 'legs', desc: 'Mit Knieschonern. Man kniet ja oft.', warmth: 1, findAt: ['hardware', 'container'] },
  rainTrousers: { name: 'Regenhose', slot: 'legs', desc: 'Über die Hose gezogen, bei Nebel und Regen Gold wert.', warmth: 1, findAt: ['camp', 'backpack', 'shed'] },
  sneakers: { name: 'Turnschuhe', slot: 'feet', desc: 'Leise und leicht. Bei Regen nasse Füße.', noise: -0.2, findAt: ['backpack', 'parcel', 'market'] },
  workBoots: { name: 'Arbeitsstiefel', slot: 'feet', desc: 'Stahlkappen. Treten tut damit richtig weh.', armor: 1, noise: 0.1, findAt: ['hardware', 'container', 'convoy'] },
  rubberBoots: { name: 'Gummistiefel', slot: 'feet', desc: 'Für Gräben, Bäche und Sumpf.', warmth: 1, wade: true, findAt: ['shed', 'well', 'market'] },
  oldBackpack: { name: 'Alter Rucksack', slot: 'back', desc: 'Der, mit dem alles anfing. Ein Riemen ist geflickt.', packSlots: 12, findAt: [] },
  hikingPack: { name: 'Wanderrucksack', slot: 'back', desc: 'Mit Hüftgurt. Da passt deutlich mehr rein.', packSlots: 16, findAt: ['camp', 'car', 'backpack'] },
  armyPack: { name: 'Bundeswehr-Rucksack', slot: 'back', desc: 'Riesig, oliv, unverwüstlich.', packSlots: 20, findAt: ['convoy', 'bunker', 'airdrop'] },
};
export const GEAR_ORDER = Object.keys(GEAR) as GearId[];

/** Damit fängt jedes Spiel an (und angezogen). */
export const START_GEAR: GearId[] = ['beanie', 'rainJacket', 'jeans', 'sneakers', 'oldBackpack'];
/** Chance auf ein neues Teil beim Durchsuchen, je nach Art der Fundstelle. */
export const GEAR_CHANCE = { poi: 0.12, grid: 0.04, special: 0.35 };

/** Abwehr zu Kampfbeginn aus allem, was du trägst. */
export function gearArmor(worn: Partial<Record<GearSlot, GearId>>): number {
  return Object.values(worn).reduce((a, g) => a + (g ? (GEAR[g].armor ?? 0) : 0), 0);
}
/** Summe eines Werts über alles, was du trägst (Wärme, Atemschutz, Lärm). */
export function gearSum(worn: Partial<Record<GearSlot, GearId>>, key: 'warmth' | 'filter' | 'noise'): number {
  return Object.values(worn).reduce((a, g) => a + (g ? (GEAR[g][key] ?? 0) : 0), 0);
}

// --- Kampf: kurze Taktik mit Karten (Runde für Runde) ------------------------------

export type { FoeKind };
export type CardId =
  // Grundkarten und Waffenkarten
  | 'punch' | 'throw' | 'dodge' | 'kick' | 'pry' | 'swing' | 'homerun' | 'bolt' | 'aim' | 'bandage'
  | 'spade' | 'chop' | 'drive' | 'pellet' | 'nail' | 'salvo' | 'prong' | 'fend' | 'arrow' | 'drawbow' | 'cleave' | 'hack' | 'swath' | 'sledge' | 'heave' | 'lidup' | 'lidbash' | 'foam' | 'extbash'
  // Einmal-Karten (nach dem Ausspielen weg)
  | 'molotov' | 'smoke' | 'caltrops' | 'firecracker' | 'lure' | 'pepper' | 'tinder' | 'tripwire' | 'alarm' | 'dressing' | 'adrenaline' | 'flare' | 'oilcan' | 'painkiller' | 'flashbang' | 'fireworks' | 'grenade'
  // Fähigkeiten (dauerhaft, aus Sichtungen; mit Stufen)
  | 'counter' | 'steady' | 'breath' | 'spark' | 'pitcher' | 'followup' | 'headbutt' | 'cover' | 'roll' | 'sweep' | 'sneak' | 'scavenger' | 'embers' | 'trapper' | 'distract' | 'rage' | 'retaliate' | 'firstaid' | 'radio' | 'secondwind' | 'wildfire' | 'packleader' | 'laststand';

/** Grundkarte, Waffenkarte, Einmal-Karte oder Fähigkeit. */
export type CardKind = 'base' | 'weapon' | 'once' | 'skill';
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_NAMES: Record<CardRarity, string> = { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };

/** Zahlen einer Karte, die mit der Stufe wachsen (Fähigkeiten I–III). */
export type CardStat = 'dmg' | 'block' | 'heal' | 'focus' | 'draw' | 'thorns' | 'gain' | 'allyDmg' | 'burn' | 'slow' | 'bonus' | 'momentum';

export interface CardDef {
  name: string;
  kind: CardKind;
  /** Kostet so viel Kraft (pro Runde gibt es TACTICS.energy). */
  cost: number;
  /** near: ein Gegner vorne; far: einer hinten; any: irgendeiner; self: du selbst (oder alle, siehe area). */
  target: 'near' | 'far' | 'any' | 'self';
  /** Trifft mehrere ohne Zielwahl: alle vorne, alle hinten oder alle. */
  area?: 'near' | 'far' | 'all';
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
  /** Zustände: Brennt (Runden), Geblendet (verfehlt so oft), Verlangsamt (Runden), Still (Runden ohne Heulen). */
  burn?: number;
  blind?: number;
  slow?: number;
  silence?: number;
  /** Unterbricht das Ausholen (wie ein Tritt, ohne Wegstoßen). */
  interrupt?: boolean;
  /** So viele Karten ziehen. */
  draw?: number;
  /** So viel Kraft dazu. */
  gain?: number;
  /** Wer dich bis zu deiner nächsten Runde trifft, nimmt so viel Schaden. */
  thorns?: number;
  /** Ein Hund kämpft mit: so viele Runden, so viel Schaden pro Runde. */
  ally?: { rounds: number; dmg: number };
  /** Extra gegen eine Gegnerart (z. B. Licht gegen den Bleichen Wächter). */
  vs?: { kind: FoeKind; dmg: number; push?: boolean };
  /** Trifft danach noch einen zweiten Gegner. */
  chain?: boolean;
  /** Geht durch Rüstung (Nägel durch die Kalkplatten des Borkenmanns). */
  pierce?: boolean;
  /** Ein Wurf oder Pfeil (zählt für die Werferin). */
  thrown?: boolean;
  /** So viel mehr Schaden an Gegnern hinten (Pfeile fliegen auf Abstand am besten). */
  farBonus?: number;
  /** Falle mit so viel Schaden: Wer als Nächstes nach vorn kommt, stürzt (und setzt eine Runde aus). */
  trap?: number;
  /** Holt Gegner von hinten nach vorn (mit area: 'far' alle hinten). */
  pull?: boolean;
  /** Bonus einer Fähigkeit, die von selbst wirkt (Werferin, Fallensteller, Wut). */
  bonus?: number;
  /** Schwung: Dein nächster Angriff in dieser Runde macht so viel mehr Schaden. */
  momentum?: number;
  /** Betäubt nur, wenn der Gegner gerade ausholt (Kopfnuss). */
  stunIfWindup?: boolean;
  /** Höchstens so oft pro Runde. */
  perTurn?: number;
  /** Fähigkeit, die von selbst wirkt (kommt nicht ins Deck). */
  passive?: boolean;
  /** Pro Stufe über I wächst dieser Wert um so viel. */
  scale?: Partial<Record<CardStat, number>>;
  /** Nutzt diese Waffe ab (1 pro Karte). */
  weapon?: WeaponId;
  /** Verbraucht 1 Medizin. */
  medicine?: boolean;
  /** Sammelkarten: Seltenheit und wo man sie findet (Hinweis im Sammelbuch). */
  rarity?: CardRarity;
  where?: string;
  /** Einmal-Karten am Werktisch bauen. */
  craft?: Partial<Inventory>;
  /** Dateiname des Kartenbilds (src/assets/cards/karte-<art>.webp), sobald es eins gibt. */
  art?: string;
  desc: string;
}

export const CARDS: Record<CardId, CardDef> = {
  punch: { name: 'Faustschlag', kind: 'base', cost: 1, target: 'near', dmg: 2, art: 'faustschlag', desc: '2 Schaden an einem Gegner vorne.' },
  throw: { name: 'Steinwurf', kind: 'base', cost: 1, target: 'any', dmg: 1, silence: 1, thrown: true, art: 'steinwurf', desc: '1 Schaden, trifft auch Gegner hinten. Ein getroffener Heuler bleibt 1 Runde still.' },
  dodge: { name: 'Ausweichen', kind: 'base', cost: 1, target: 'self', block: 3, art: 'ausweichen', desc: 'Fängt 3 Schaden ab, bis zu deiner nächsten Runde.' },
  kick: { name: 'Tritt', kind: 'base', cost: 1, target: 'near', dmg: 1, push: true, art: 'tritt', desc: '1 Schaden. Stößt den Gegner nach hinten und unterbricht sein Ausholen.' },
  bandage: { name: 'Verbinden', kind: 'base', cost: 1, target: 'self', heal: HEAL_IN_COMBAT, medicine: true, art: 'verbinden', desc: `Heilt ${HEAL_IN_COMBAT} Gesundheit, kostet 1 Medizin.` },
  // Waffen
  pry: { name: 'Hebelhieb', kind: 'weapon', cost: 1, target: 'near', dmg: 3, weapon: 'crowbar', art: 'brechstange', desc: '3 Schaden mit der Brechstange.' },
  swing: { name: 'Schwinger', kind: 'weapon', cost: 1, target: 'near', dmg: 4, weapon: 'bat', art: 'nagelschlaeger', desc: '4 Schaden mit dem Nagelschläger.' },
  homerun: { name: 'Volltreffer', kind: 'weapon', cost: 2, target: 'near', dmg: 6, stun: true, weapon: 'bat', art: 'nagelschlaeger', desc: '6 Schaden, der Gegner setzt eine Runde aus.' },
  bolt: { name: 'Bolzen', kind: 'weapon', cost: 1, target: 'any', dmg: 3, weapon: 'crossbow', art: 'armbrust', desc: '3 Schaden, trifft auch Gegner hinten.' },
  aim: { name: 'Zielen', kind: 'weapon', cost: 0, target: 'self', focus: 3, art: 'armbrust', desc: 'Der nächste Bolzen oder Wurf macht 3 mehr Schaden.' },
  spade: { name: 'Spatenstich', kind: 'weapon', cost: 1, target: 'near', dmg: 3, push: true, weapon: 'shovel', art: 'spaten', desc: '3 Schaden und stößt zurück.' },
  chop: { name: 'Axthieb', kind: 'weapon', cost: 2, target: 'near', dmg: 6, stun: true, weapon: 'axe', art: 'axt', desc: '6 Schaden, der Gegner setzt eine Runde aus.' },
  drive: { name: 'Abschlag', kind: 'weapon', cost: 1, target: 'any', dmg: 3, weapon: 'golfclub', art: 'golfschlaeger', desc: '3 Schaden, trifft auch Gegner hinten.' },
  pellet: { name: 'Stahlkugel', kind: 'weapon', cost: 0, target: 'any', dmg: 2, perTurn: 1, weapon: 'slingshot', art: 'schleuder', desc: '2 Schaden ohne Kraft, trifft auch hinten. Einmal pro Runde.' },
  nail: { name: 'Nagel', kind: 'weapon', cost: 1, target: 'any', dmg: 2, chain: true, pierce: true, weapon: 'nailgun', art: 'nagelpistole', desc: '2 Schaden an einem Gegner und noch einem zweiten. Geht durch Rüstung.' },
  lidup: { name: 'Deckel hoch', kind: 'weapon', cost: 1, target: 'self', block: 4, weapon: 'lid', art: 'tonnendeckel', desc: 'Fängt 4 Schaden ab, bis zu deiner nächsten Runde.' },
  lidbash: { name: 'Deckelstoß', kind: 'weapon', cost: 1, target: 'near', dmg: 2, push: true, weapon: 'lid', art: 'tonnendeckel', desc: '2 Schaden und stößt zurück.' },
  foam: { name: 'Löschnebel', kind: 'weapon', cost: 2, target: 'self', area: 'all', blind: 1, weapon: 'extinguisher', art: 'feuerloescher', desc: 'Alle Gegner sind geblendet: Ihr nächster Angriff geht daneben.' },
  extbash: { name: 'Löscherhieb', kind: 'weapon', cost: 1, target: 'near', dmg: 3, push: true, weapon: 'extinguisher', art: 'feuerloescher', desc: '3 Schaden und stößt zurück.' },
  cleave: { name: 'Spalten', kind: 'weapon', cost: 1, target: 'near', dmg: 3, pierce: true, weapon: 'axe', art: 'axt', desc: '3 Schaden, geht durch Rüstung.' },
  hack: { name: 'Hieb', kind: 'weapon', cost: 1, target: 'near', dmg: 3, momentum: 2, weapon: 'machete', art: 'machete', desc: '3 Schaden vorne. Schwung: Dein nächster Angriff in dieser Runde macht 2 mehr.' },
  swath: { name: 'Schneise', kind: 'weapon', cost: 2, target: 'self', area: 'near', dmg: 3, weapon: 'machete', art: 'machete', desc: '3 Schaden an allen vorne.' },
  sledge: { name: 'Wuchtschlag', kind: 'weapon', cost: 2, target: 'near', dmg: 8, push: true, weapon: 'sledgehammer', art: 'vorschlaghammer', desc: '8 Schaden und stößt den Gegner zurück.' },
  heave: { name: 'Ausholen', kind: 'weapon', cost: 1, target: 'self', momentum: 3, art: 'vorschlaghammer', desc: 'Schwung: Dein nächster Angriff in dieser Runde macht 3 mehr.' },
  prong: { name: 'Gabelstich', kind: 'weapon', cost: 1, target: 'near', dmg: 3, weapon: 'pitchfork', art: 'mistgabel', desc: '3 Schaden an einem Gegner vorne.' },
  fend: { name: 'Auf Abstand', kind: 'weapon', cost: 1, target: 'self', area: 'near', push: true, weapon: 'pitchfork', art: 'mistgabel', desc: 'Stößt alle vorne zurück und unterbricht ihr Ausholen.' },
  arrow: { name: 'Pfeil', kind: 'weapon', cost: 1, target: 'any', dmg: 3, farBonus: 2, thrown: true, weapon: 'bow', art: 'sportbogen', desc: '3 Schaden, an Gegnern hinten sogar 5.' },
  drawbow: { name: 'Spannen', kind: 'weapon', cost: 0, target: 'self', focus: 2, art: 'sportbogen', desc: 'Der nächste Pfeil, Bolzen oder Wurf macht 2 mehr Schaden.' },
  salvo: { name: 'Salve', kind: 'weapon', cost: 1, target: 'self', area: 'all', dmg: 2, pierce: true, weapon: 'nailgun', art: 'nagelpistole', desc: '2 Schaden an allen Gegnern, vorne und hinten. Geht durch Rüstung.' },
  // Einmal-Karten
  molotov: { name: 'Brandflasche', kind: 'once', cost: 1, target: 'self', area: 'near', dmg: 2, burn: 3, rarity: 'common', where: 'Werktisch, Tankstellen, Autos', craft: { glass: 1, oil: 1, cloth: 1 }, art: 'brandflasche', desc: 'Alle vorne: 2 Schaden und Brennt.' },
  smoke: { name: 'Rauchdose', kind: 'once', cost: 1, target: 'self', area: 'all', blind: 1, rarity: 'common', where: 'Werktisch, Baumarkt', craft: { metal: 1, cloth: 1, phosphate: 1 }, art: 'rauchdose', desc: 'Alle Gegner sind Geblendet: Ihr nächster Angriff geht daneben.' },
  caltrops: { name: 'Krähenfüße', kind: 'once', cost: 1, target: 'self', area: 'far', slow: 2, rarity: 'common', where: 'Werktisch, Werkstätten, Schuppen', craft: { metal: 2, screws: 1 }, art: 'kraehenfuesse', desc: 'Alle hinten sind Verlangsamt: 2 Runden kommen sie nicht nach vorn.' },
  firecracker: { name: 'Böller', kind: 'once', cost: 1, target: 'self', area: 'all', interrupt: true, silence: 2, rarity: 'common', where: 'Kioske, Supermärkte', art: 'boeller', desc: 'Alle hören auf auszuholen, Heuler verstummen 2 Runden.' },
  lure: { name: 'Köderdose', kind: 'once', cost: 0, target: 'far', slow: 2, rarity: 'common', where: 'Supermärkte, Hofläden', art: 'koederdose', desc: 'Ein Gegner hinten frisst und kommt 2 Runden nicht nach vorn.' },
  pepper: { name: 'Pfefferspray', kind: 'once', cost: 1, target: 'near', dmg: 1, blind: 1, rarity: 'common', where: 'Drogerien, Apotheken', art: 'pfefferspray', desc: '1 Schaden, der Gegner ist Geblendet.' },
  tinder: { name: 'Zunder', kind: 'once', cost: 0, target: 'any', burn: 2, rarity: 'common', where: 'Werktisch, Schuppen, Zeltlager', craft: { wood: 1, cloth: 1 }, art: 'zunder', desc: 'Ein Gegner brennt 2 Runden. Trifft auch hinten.' },
  dressing: { name: 'Notverband', kind: 'once', cost: 0, target: 'self', heal: 4, rarity: 'rare', where: 'Notlazarett-Kisten, Apotheken', art: 'notverband', desc: 'Heilt 4, ohne Medizin.' },
  adrenaline: { name: 'Adrenalinspritze', kind: 'once', cost: 0, target: 'self', gain: 2, heal: 2, rarity: 'rare', where: 'Arztpraxen, Notlazarett-Kisten', art: 'adrenalin', desc: '2 Kraft mehr und 2 Gesundheit.' },
  flare: { name: 'Signalfackel', kind: 'once', cost: 0, target: 'any', blind: 1, vs: { kind: 'watcher', dmg: 2, push: true }, rarity: 'rare', where: 'Konvoi-Wracks, Haltestellen', art: 'signalfackel', desc: 'Ein Gegner ist Geblendet. Der Bleiche Wächter nimmt 2 Schaden und weicht zurück.' },
  tripwire: { name: 'Stolperdraht', kind: 'once', cost: 1, target: 'self', trap: 3, rarity: 'common', where: 'Werktisch, Baumärkte, Hochsitze', craft: { copper: 1, screws: 2 }, art: 'stolperdraht', desc: 'Falle: Wer als Nächstes nach vorn kommt, stürzt. 3 Schaden, und er setzt eine Runde aus.' },
  alarm: { name: 'Wecker', kind: 'once', cost: 1, target: 'self', area: 'far', pull: true, rarity: 'common', where: 'Pakete, Rucksäcke', art: 'wecker', desc: 'Alle hinten kommen sofort nach vorn, auch der Heuler.' },
  oilcan: { name: 'Ölkanister', kind: 'once', cost: 1, target: 'self', area: 'all', burn: 2, rarity: 'rare', where: 'Tankstellen, Fässer, Zeltlager', art: 'oelkanister', desc: 'Alle Gegner brennen 2 Runden, vorne und hinten.' },
  painkiller: { name: 'Schmerzmittel', kind: 'once', cost: 1, target: 'self', block: 6, rarity: 'rare', where: 'Apotheken, Notlazarett-Kisten', art: 'schmerzmittel', desc: 'Fängt 6 Schaden ab, bis zu deiner nächsten Runde.' },
  flashbang: { name: 'Blendgranate', kind: 'once', cost: 1, target: 'self', area: 'all', stun: true, rarity: 'epic', where: 'Konvoi-Wracks', art: 'blendgranate', desc: 'Alle Gegner setzen eine Runde aus.' },
  fireworks: { name: 'Feuerwerksbatterie', kind: 'once', cost: 1, target: 'self', area: 'all', dmg: 1, blind: 1, silence: 3, rarity: 'epic', where: 'Kioske, Zeltlager, Sichtungen', art: 'feuerwerk', desc: 'Alle Gegner: 1 Schaden und geblendet, Heuler verstummen 3 Runden.' },
  grenade: { name: 'Granate', kind: 'once', cost: 2, target: 'self', area: 'all', dmg: 6, rarity: 'legendary', where: 'Konvoi-Wracks, Hilfsabwürfe', art: 'granate', desc: '6 Schaden an allen Gegnern.' },
  // Fähigkeiten
  counter: { name: 'Konter', kind: 'skill', cost: 1, target: 'self', block: 2, thorns: 2, scale: { block: 1, thorns: 1 }, rarity: 'common', where: 'Notizbücher', art: 'konter', desc: 'Fängt 2 ab. Wer dich bis zur nächsten Runde trifft, nimmt 2 Schaden.' },
  steady: { name: 'Ruhige Hand', kind: 'skill', cost: 0, target: 'self', focus: 2, scale: { focus: 1 }, rarity: 'common', where: 'Notizbücher', art: 'ruhige-hand', desc: 'Der nächste Wurf oder Fernangriff macht 2 mehr Schaden.' },
  breath: { name: 'Atem holen', kind: 'skill', cost: 0, target: 'self', draw: 2, scale: { draw: 1 }, rarity: 'common', where: 'Notizbücher', art: 'atem-holen', desc: 'Ziehe 2 Karten.' },
  followup: { name: 'Nachsetzen', kind: 'skill', cost: 1, target: 'near', dmg: 2, momentum: 2, scale: { momentum: 1 }, rarity: 'common', where: 'Notizbücher', art: 'nachsetzen', desc: '2 Schaden vorne. Schwung: Dein nächster Angriff in dieser Runde macht 2 mehr.' },
  headbutt: { name: 'Kopfnuss', kind: 'skill', cost: 1, target: 'near', dmg: 1, stunIfWindup: true, scale: { dmg: 1 }, rarity: 'common', where: 'Notizbücher', art: 'kopfnuss', desc: '1 Schaden vorne. Holt der Gegner gerade aus, setzt er eine Runde aus.' },
  cover: { name: 'Deckung', kind: 'skill', cost: 0, target: 'self', block: 2, scale: { block: 1 }, rarity: 'common', where: 'Notizbücher', art: 'deckung', desc: 'Fängt 2 Schaden ab, kostet keine Kraft.' },
  roll: { name: 'Ausweichrolle', kind: 'skill', cost: 1, target: 'self', block: 3, draw: 1, scale: { block: 1 }, rarity: 'common', where: 'Notizbücher', art: 'ausweichrolle', desc: 'Fängt 3 Schaden ab, und du ziehst 1 Karte.' },
  sweep: { name: 'Rundumschlag', kind: 'skill', cost: 1, target: 'self', area: 'near', dmg: 2, scale: { dmg: 1 }, rarity: 'rare', where: 'Notizbücher, Alpha-Wandler', art: 'rundumschlag', desc: '2 Schaden an allen vorne.' },
  spark: { name: 'Funkenschlag', kind: 'skill', cost: 1, target: 'near', dmg: 1, burn: 2, scale: { burn: 1 }, rarity: 'common', where: 'Notizbücher', art: 'funkenschlag', desc: '1 Schaden vorne, der Gegner brennt 2 Runden.' },
  pitcher: { name: 'Werferin', kind: 'skill', cost: 0, target: 'self', passive: true, bonus: 1, scale: { bonus: 1 }, rarity: 'common', where: 'Notizbücher', art: 'werferin', desc: 'Wirkt von selbst: Steinwurf und Pfeil machen 1 Schaden mehr.' },
  sneak: { name: 'Leise Sohlen', kind: 'skill', cost: 0, target: 'self', passive: true, rarity: 'rare', where: 'Notizbücher (nachts häufiger)', art: 'leise-sohlen', desc: 'Wirkt von selbst: Wer dich nicht entdeckt hat, fängt eine Runde später an. Ab Stufe II hast du in der ersten Runde 1 Kraft mehr.' },
  scavenger: { name: 'Plündererin', kind: 'skill', cost: 0, target: 'self', passive: true, rarity: 'rare', where: 'Notizbücher, Händler', art: 'pluendererin', desc: 'Wirkt von selbst: Nach jedem Sieg ein Fund mehr (pro Stufe einer).' },
  embers: { name: 'Glut', kind: 'skill', cost: 0, target: 'self', passive: true, burn: 1, scale: { burn: 1 }, rarity: 'rare', where: 'Notizbücher', art: 'glut', desc: 'Wirkt von selbst: Alles, was du anzündest, brennt 1 Runde länger.' },
  trapper: { name: 'Fallensteller', kind: 'skill', cost: 0, target: 'self', passive: true, bonus: 1, scale: { bonus: 1 }, rarity: 'rare', where: 'Notizbücher', art: 'fallensteller', desc: 'Wirkt von selbst: Verlangsamte Gegner nehmen 1 Schaden mehr, und deine Fallen treffen härter.' },
  distract: { name: 'Ablenken', kind: 'skill', cost: 1, target: 'near', push: true, slow: 1, scale: { slow: 1 }, rarity: 'rare', where: 'Notizbücher', art: 'ablenken', desc: 'Ein Gegner vorne muss nach hinten und ist 1 Runde verlangsamt.' },
  rage: { name: 'Wut', kind: 'skill', cost: 0, target: 'self', passive: true, bonus: 2, scale: { bonus: 1 }, rarity: 'rare', where: 'Notizbücher', art: 'wut', desc: 'Wirkt von selbst: Hast du nur noch 3 Gesundheit oder weniger, machen deine Angriffe 2 mehr.' },
  retaliate: { name: 'Zurückschlagen', kind: 'skill', cost: 0, target: 'self', passive: true, bonus: 2, scale: { bonus: 1 }, rarity: 'rare', where: 'Notizbücher', art: 'zurueckschlagen', desc: 'Wirkt von selbst: Fängst du einen Angriff ganz ab, nimmt der Angreifer 2 Schaden.' },
  firstaid: { name: 'Erste Hilfe', kind: 'skill', cost: 0, target: 'self', passive: true, bonus: 2, scale: { bonus: 1 }, rarity: 'rare', where: 'Notizbücher, Notlazarett-Kisten', art: 'erste-hilfe', desc: 'Wirkt von selbst: Das erste Verbinden im Kampf kostet keine Medizin und heilt 2 mehr.' },
  radio: { name: 'Funker', kind: 'skill', cost: 1, target: 'any', stun: true, silence: 9, rarity: 'epic', where: 'Notizbücher (an hohen Punkten häufiger)', art: 'funker', desc: 'Ein Gegner verliert seine Runde. Ein Heuler ruft in diesem Kampf keine Hilfe mehr.' },
  secondwind: { name: 'Zweiter Atem', kind: 'skill', cost: 0, target: 'self', passive: true, heal: 4, scale: { heal: 2 }, rarity: 'epic', where: 'Alpha-Wandler', art: 'zweiter-atem', desc: 'Wirkt von selbst, einmal pro Kampf: Fällst du unter 3 Gesundheit, heilst du 4.' },
  wildfire: { name: 'Lauffeuer', kind: 'skill', cost: 0, target: 'self', passive: true, burn: 2, scale: { burn: 1 }, rarity: 'epic', where: 'Notizbücher', art: 'lauffeuer', desc: 'Wirkt von selbst: Fällt ein brennender Gegner, fängt der nächste Feuer und brennt 2 Runden.' },
  packleader: { name: 'Rudelführer', kind: 'skill', cost: 1, target: 'self', ally: { rounds: 3, dmg: 2 }, scale: { allyDmg: 1 }, rarity: 'legendary', where: 'Alpha-Wandler', art: 'rudelfuehrer', desc: 'Ein Hund kämpft 3 Runden mit und beißt jede Runde für 2 Schaden zu.' },
  laststand: { name: 'Letztes Gefecht', kind: 'skill', cost: 0, target: 'self', passive: true, rarity: 'legendary', where: 'Alpha-Wandler', art: 'letztes-gefecht', desc: 'Wirkt von selbst, einmal am Tag: Ein tödlicher Treffer lässt dich mit 1 Gesundheit stehen.' },
};

// --- Spielstile: Karten, die gut zusammenarbeiten (Zeichen auf der Karte) -----------------
// Ein Stil ist nichts, was man „hat“: Man sammelt einzelne Karten und mischt frei. Karten eines
// Stils machen sich aber gegenseitig stärker. Ohne Stil: passt zu allem.

export type CardStyle = 'fire' | 'trap' | 'momentum' | 'guard' | 'pack';
export const STYLE_ORDER: CardStyle[] = ['fire', 'trap', 'momentum', 'guard', 'pack'];
export const STYLE_NAMES: Record<CardStyle, string> = { fire: 'Feuer', trap: 'Fallen und Abstand', momentum: 'Schwung', guard: 'Schutz', pack: 'Rudel' };
export const STYLE_HINT: Record<CardStyle, string> = {
  fire: 'Anzünden und brennen lassen. Stark gegen Wandler, schwach gegen den gepanzerten Borkenmann.',
  trap: 'Gegner auf Abstand halten, bremsen, in Fallen laufen lassen. Stark gegen Borkenmann und Wächter.',
  momentum: 'Ein Treffer lädt den nächsten auf. Schnelle, harte Kämpfe.',
  guard: 'Abfangen, zurückschlagen, durchhalten. Wenig Schaden, dafür längere Kämpfe.',
  pack: 'Ein Hund kämpft mit. Je länger er bleibt, desto besser.',
};

export const CARD_STYLE: Partial<Record<CardId, CardStyle>> = {
  // Feuer
  molotov: 'fire', tinder: 'fire', oilcan: 'fire', spark: 'fire', embers: 'fire', wildfire: 'fire',
  // Fallen und Abstand
  caltrops: 'trap', lure: 'trap', tripwire: 'trap', alarm: 'trap', steady: 'trap', pitcher: 'trap', sneak: 'trap', trapper: 'trap', distract: 'trap',
  // Schwung
  adrenaline: 'momentum', followup: 'momentum', sweep: 'momentum', rage: 'momentum',
  // Schutz
  smoke: 'guard', firecracker: 'guard', pepper: 'guard', dressing: 'guard', flare: 'guard', painkiller: 'guard', flashbang: 'guard', fireworks: 'guard',
  counter: 'guard', headbutt: 'guard', cover: 'guard', roll: 'guard', retaliate: 'guard', firstaid: 'guard', radio: 'guard', secondwind: 'guard', laststand: 'guard',
  // Rudel
  packleader: 'pack',
};
export const WEAPON_STYLE: Partial<Record<WeaponId, CardStyle>> = {
  bat: 'momentum', axe: 'momentum', machete: 'momentum', nailgun: 'momentum', sledgehammer: 'momentum',
  crossbow: 'trap', golfclub: 'trap', slingshot: 'trap', pitchfork: 'trap', bow: 'trap',
  shovel: 'guard', lid: 'guard', extinguisher: 'guard',
};

/** Stil einer Karte (Waffenkarten haben den Stil ihrer Waffe). */
export function styleOf(id: CardId): CardStyle | undefined {
  if (CARD_STYLE[id]) return CARD_STYLE[id];
  const w = CARDS[id]?.weapon ?? (Object.keys(WEAPON_CARDS) as WeaponId[]).find((k) => WEAPON_CARDS[k].includes(id));
  return w ? WEAPON_STYLE[w] : undefined;
}

/** Sammelkarten in der Reihenfolge des Sammelbuchs. */
export const ONCE_CARDS: CardId[] = ['molotov', 'smoke', 'caltrops', 'firecracker', 'lure', 'pepper', 'tinder', 'tripwire', 'alarm', 'dressing', 'adrenaline', 'flare', 'oilcan', 'painkiller', 'flashbang', 'fireworks', 'grenade'];
export const SKILL_CARDS: CardId[] = ['counter', 'steady', 'breath', 'spark', 'pitcher', 'followup', 'headbutt', 'cover', 'roll', 'sweep', 'sneak', 'scavenger', 'embers', 'trapper', 'distract', 'rage', 'retaliate', 'firstaid', 'radio', 'secondwind', 'wildfire', 'packleader', 'laststand'];
/** Höchstens so viele Einmal-Karten je Sorte stecken in der Tasche. */
export const ONCE_CARRY = 3;
/** Die Tasche für Einmal-Karten hat so viele Plätze (je Platz eine Sorte). */
export const POUCH_SLOTS = 3;
/** So viele Fähigkeiten nimmt man in den Kampf mit (zu Hause gewählt). */
export const SKILL_SLOTS = 4;
/** So viele gleiche Fähigkeiten braucht es insgesamt für Stufe II und III. */
export const SKILL_LEVELS = [1, 4, 10];
export const skillLevel = (copies: number): number => (copies >= SKILL_LEVELS[2] ? 3 : copies >= SKILL_LEVELS[1] ? 2 : copies >= 1 ? 1 : 0);

/** Wert einer Karte auf ihrer Stufe (1 = Grundwert). */
export function cardStat(id: CardId, stat: CardStat, level = 1): number {
  const c = CARDS[id];
  const base = stat === 'allyDmg' ? (c.ally?.dmg ?? 0) : ((c[stat] as number | undefined) ?? 0);
  return base + Math.max(0, level - 1) * (c.scale?.[stat] ?? 0);
}

/**
 * Sammelkarten und Waffen beim Durchsuchen: je Ortstyp, was es dort geben kann (mit Chance).
 * Höchstens eins pro Suche. „w:…“ ist eine Waffe.
 */
export const CARD_LOOT: Partial<Record<SpotKind, [CardId | `w:${WeaponId}`, number][]>> = {
  fuel: [['molotov', 0.22], ['oilcan', 0.06], ['flare', 0.03], ['w:extinguisher', 0.015]],
  car: [['molotov', 0.05], ['w:golfclub', 0.02], ['flare', 0.02]],
  hardware: [['smoke', 0.1], ['caltrops', 0.1], ['tripwire', 0.08], ['w:machete', 0.01], ['w:shovel', 0.05], ['w:axe', 0.03], ['w:nailgun', 0.015], ['w:extinguisher', 0.01]],
  market: [['lure', 0.12], ['firecracker', 0.08], ['fireworks', 0.01], ['w:slingshot', 0.015], ['w:pitchfork', 0.01]],
  pharmacy: [['pepper', 0.1], ['painkiller', 0.06], ['dressing', 0.05], ['adrenaline', 0.025]],
  shed: [['tinder', 0.08], ['caltrops', 0.05], ['w:shovel', 0.05], ['w:pitchfork', 0.04], ['w:axe', 0.02], ['w:machete', 0.015]],
  hide: [['tripwire', 0.06]],
  parcel: [['alarm', 0.08]],
  barrel: [['oilcan', 0.05]],
  camp: [['tinder', 0.2], ['oilcan', 0.06], ['fireworks', 0.02]],
  backpack: [['firecracker', 0.04], ['alarm', 0.04], ['dressing', 0.03], ['w:slingshot', 0.02]],
  container: [['pepper', 0.03], ['lure', 0.03], ['w:lid', 0.03]],
  stop: [['flare', 0.04], ['firecracker', 0.03], ['w:lid', 0.03]],
  convoy: [['flare', 0.35], ['flashbang', 0.12], ['grenade', 0.04]],
  heli: [['dressing', 0.2], ['painkiller', 0.1], ['adrenaline', 0.1], ['grenade', 0.03]],
  bunker: [['flashbang', 0.15], ['grenade', 0.05], ['adrenaline', 0.1]],
  airdrop: [['dressing', 0.25], ['adrenaline', 0.15], ['grenade', 0.05]],
};

/** Grund-Karten, die man immer hat. */
export const BASE_DECK: CardId[] = ['punch', 'punch', 'punch', 'dodge', 'dodge', 'kick', 'throw', 'throw'];
/** Zusätzliche Karten pro heiler Waffe. */
export const WEAPON_CARDS: Record<WeaponId, CardId[]> = {
  crowbar: ['pry', 'pry', 'pry'],
  bat: ['swing', 'swing', 'homerun'],
  crossbow: ['bolt', 'bolt', 'aim'],
  shovel: ['spade', 'spade', 'spade'],
  axe: ['chop', 'chop', 'cleave'],
  machete: ['hack', 'hack', 'swath'],
  lid: ['lidup', 'lidup', 'lidbash'],
  extinguisher: ['foam', 'extbash', 'extbash'],
  sledgehammer: ['sledge', 'sledge', 'heave'],
  golfclub: ['drive', 'drive'],
  slingshot: ['pellet', 'pellet', 'pellet'],
  nailgun: ['nail', 'nail', 'salvo'],
  pitchfork: ['prong', 'prong', 'fend'],
  bow: ['arrow', 'arrow', 'drawbow'],
};

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
    hp: 10,
    armor: 0,
    pattern: [{ kind: 'attack', dmg: 2 }, { kind: 'attack', dmg: 3 }, { kind: 'grab', dmg: 2 }],
    desc: 'Das Weinen hat ihn ausgebrannt, nicht getötet. Langsam und unermüdlich. Packt er dich, hast du nächste Runde weniger Kraft.',
  },
  crawler: {
    name: 'Kriecher',
    hp: 6,
    armor: 0,
    pattern: [{ kind: 'attack', dmg: 4 }, { kind: 'lurk' }, { kind: 'attack', dmg: 4 }],
    desc: 'Knochen wie Glas, flach am Boden. Beißt schnell zu und duckt sich dann weg.',
  },
  brute: {
    name: 'Borkenmann',
    hp: 16,
    armor: 1,
    pattern: [{ kind: 'attack', dmg: 3 }, { kind: 'windup' }, { kind: 'smash', dmg: 8 }],
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
    hp: 20,
    armor: 0,
    pattern: [{ kind: 'stare' }, { kind: 'attack', dmg: 5 }, { kind: 'fade' }, { kind: 'pounce', dmg: 8 }],
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

// --- Gelände: Deckung und Tempo ------------------------------------------------------
// Straßen sind schnell, aber man wird gesehen. Im Wald ist man langsam, aber versteckt.

export const TERRAIN: Record<TerrainKind, { name: string; vis: number; speed: number }> = {
  road: { name: 'Straße', vis: 1, speed: 1 },
  built: { name: 'Gärten und Höfe', vis: 0.6, speed: 0.65 },
  open: { name: 'Wiese', vis: 0.9, speed: 0.8 },
  field: { name: 'Acker', vis: 0.85, speed: 0.7 },
  forest: { name: 'Wald', vis: 0.32, speed: 0.45 },
  wetland: { name: 'Sumpf', vis: 0.5, speed: 0.35 },
  blocked: { name: 'Haus oder Wasser', vis: 0.6, speed: 0 },
};

// --- Gegenden ---------------------------------------------------------------------------
// Jede Gegend hat etwas, das dort leicht ist, und etwas, das dort schwer ist. Keine ist
// schlechter. Welche Kreaturen wo häufiger sind, folgt der Lore (Wandler in Wäldern und
// Dörfern, Heuler in Städten, Kriecher in Ruinen und Gräben, Borkenmänner in alten Wäldern).

export interface RegionDef {
  name: string;
  /** Kurz: was hier leicht und was schwer ist. */
  desc: string;
  /** Chance auf einen Trupp pro Rasterzelle und Runde. */
  patrolChance: number;
  /** Wie weit Trupps hier sehen (1 = normal). */
  sight: number;
  /** Wie weit du Trupps hier siehst (1 = normal; offene Gegenden mehr). */
  view: number;
  /** Gruppen, die hier unterwegs sind, mit Gewicht. */
  groups: readonly (readonly [FoeKind[], number])[];
  /** Hier ist es kalt (Wärme zählt) oder heiß (Wasser zählt). */
  cold?: boolean;
  heat?: boolean;
}

export const REGIONS: Record<RegionId, RegionDef> = {
  city: {
    name: 'Großstadt',
    desc: 'Ecken, Durchgänge und Hinterhöfe überall, aber viele Trupps, und Heuler hören jeden Schritt.',
    patrolChance: 0.95,
    sight: 0.85,
    view: 0.8,
    groups: [
      [['walker', 'walker', 'screamer'], 30],
      [['screamer', 'walker'], 20],
      [['walker', 'walker'], 20],
      [['crawler', 'crawler'], 15],
      [['brute', 'walker'], 15],
    ],
  },
  town: {
    name: 'Kleinstadt',
    desc: 'Viele Fundstellen und Gärten zum Verstecken, dafür mehr Trupps auf den Straßen.',
    patrolChance: 0.75,
    sight: 0.95,
    view: 0.9,
    groups: [
      [['walker'], 25],
      [['walker', 'walker'], 30],
      [['walker', 'screamer'], 15],
      [['crawler', 'walker'], 20],
      [['brute'], 10],
    ],
  },
  village: {
    name: 'Dorf und Felder',
    desc: 'Weite Sicht und ruhige Feldwege. Auf dem offenen Feld sieht man dich aber von Weitem. Hecken, Waldränder und im Sommer das Korn verstecken dich.',
    patrolChance: 0.55,
    sight: 1.15,
    view: 1.2,
    groups: [
      [['walker'], 35],
      [['walker', 'walker'], 30],
      [['crawler', 'walker'], 20],
      [['brute'], 15],
    ],
  },
  wild: {
    name: 'Wald und Wildnis',
    desc: 'Im Wald bist du kaum zu sehen, kommst aber nur langsam voran. Hier streifen Kriecher und Borkenmänner.',
    patrolChance: 0.4,
    sight: 0.9,
    view: 0.8,
    groups: [
      [['walker'], 25],
      [['crawler', 'crawler'], 25],
      [['crawler', 'walker'], 25],
      [['brute'], 25],
    ],
  },
  mountain: {
    name: 'Hügel und Berge',
    desc: 'Von oben siehst du weiter: mehr Karte, Trupps schon von Weitem. Oben sieht man aber auch dich.',
    patrolChance: 0.35,
    sight: 1.2,
    view: 1,
    groups: [
      [['crawler'], 25],
      [['crawler', 'crawler'], 25],
      [['brute'], 25],
      [['walker', 'crawler'], 25],
    ],
  },
  coast: {
    name: 'Küste und Seen',
    desc: 'Das Wasser schützt dir den Rücken, schneidet aber Wege ab. Schilf und Dünen geben Deckung.',
    patrolChance: 0.4,
    sight: 1.1,
    view: 1.2,
    groups: [
      [['walker'], 35],
      [['walker', 'walker'], 35],
      [['crawler', 'walker'], 30],
    ],
  },
  desert: {
    name: 'Wüste und Steppe',
    desc: 'Riesige offene Flächen: Du siehst Trupps schon von Weitem, sie dich aber auch. Tagsüber Hitze (Wasser dabeihaben).',
    patrolChance: 0.3,
    sight: 1.4,
    view: 1.5,
    heat: true,
    groups: [
      [['crawler'], 30],
      [['walker', 'walker'], 30],
      [['brute'], 20],
      [['crawler', 'crawler'], 20],
    ],
  },
  snow: {
    name: 'Schnee und Eis',
    desc: 'Weite weiße Flächen: Trupps siehst du früh. Aber es ist kalt (warme Kleidung zählt), und deine Spuren im Schnee verraten dich.',
    patrolChance: 0.3,
    sight: 1.2,
    view: 1.3,
    cold: true,
    groups: [
      [['walker'], 30],
      [['brute'], 30],
      [['walker', 'walker'], 40],
    ],
  },
};
export const REGION_ORDER = Object.keys(REGIONS) as RegionId[];

// --- Trupps -------------------------------------------------------------------------------
// Gegner ziehen in kleinen Gruppen über echte Straßen und Wege. Jeder Trupp hat einen
// Sichtkegel. Wer im Blick ist, wird nach kurzer Zeit entdeckt. Wer sich von hinten
// anschleicht, greift überraschend an (die Gegner setzen die erste Runde aus).

export const PATROL = {
  /** Rasterzelle für Trupps (Kachel-Zoom 17, ~190 m bei uns). */
  zoom: 17,
  /** So lange läuft ein Trupp seine Strecke (Minuten). */
  lifeMin: 35,
  /** Alle so viele Minuten startet eine neue Runde. */
  windowMin: 30,
  /** Tempo in m/s (gemächlich, Wandler sind langsam). */
  speed: [0.6, 1.0] as [number, number],
  /** Länge der Strecke, die er hin und her läuft (Meter). */
  lengthM: [260, 600] as [number, number],
  /** Grund-Sichtweite tagsüber bei klarem Wetter (Meter). */
  sightM: 34,
  /** Halber Öffnungswinkel des Sichtkegels (Grad). */
  coneDeg: 55,
  /** So nah hört er dich auf jeden Fall (Meter). */
  hearM: 9,
  /** Heuler jagen nach Gehör: so weit hören sie dich (Meter). */
  screamerHearM: 24,
  /** So lange (Sekunden) musst du im Blick sein, bis er dich entdeckt. */
  noticeS: 1.3,
  /** So lange still stehen in Deckung, dann bist du versteckt (Sekunden). */
  hideAfterS: 2.5,
  /** Versteckt: so viel von der Sichtweite bleibt. */
  hiddenFactor: 0.3,
  /** Leise gehen (Testmodus): so viel von Sicht und Lärm bleibt. */
  sneakFactor: 0.75,
  /** So nah musst du für einen Überraschungsangriff sein (Meter). */
  surpriseM: 30,
  /** Hat er dich entdeckt: so nah darf man auf „Kämpfen“ tippen (Meter). */
  fightM: 45,
  /** So weit weg (Meter, ein paar Sekunden lang) hast du ihn abgehängt. */
  escapeM: 70,
  /** So schnell verfolgt er dich (m/s, langsamer als zu Fuß). */
  chaseSpeed: 0.95,
  /** So lange folgt er dir, wenn er dich entdeckt hat (Sekunden), und so lange einer Spur im Schnee. */
  huntS: 90,
  trackHuntS: 120,
  /** Für die Regeln: so weit darf man vom Startpunkt seiner Strecke entfernt sein (Meter, zur Länge dazu). */
  reachSlackM: 350,
  /** Nach einer Begegnung so lange Ruhe (Minuten). */
  cooldownMin: 3,
  /** Rund ums Zuhause sucht dich kein Trupp (Meter). */
  homeSafeM: 150,
  /** So nah kommt kein Trupp an dein Zuhause heran (Meter): Wer dort entlangliefe, taucht gar nicht erst auf. */
  homeFreeM: 350,
  /** Nachts sind mehr Trupps unterwegs. */
  nightExtra: 0.15,
  /** Nachts zieht manchmal der Bleiche Wächter allein umher. */
  watcherChance: 0.2,
  /** So weit siehst du Trupps auf der Karte (Tag, klare Sicht). */
  showM: 170,
  /** Im Schnee: Spuren, die jünger sind, verraten dich (Minuten). */
  trackMin: 3,
  /** Was ein Trupp dabeihat (je Gegner etwas davon). */
  loot: [['cloth', 3], ['metal', 3], ['screws', 2], ['food', 2], ['water', 2], ['leather', 2], ['plastic', 2], ['medicine', 1]] as readonly (readonly [Resource, number])[],
  lootKramChance: 0.35,
  lootKram: [['tinCans', 3], ['flashlight', 2], ['radio', 1], ['tape', 2], ['bottles', 2], ['blanket', 1]] as readonly (readonly [KramId, number])[],
};

// --- Weltereignisse -----------------------------------------------------------------------
// Ab und zu passiert in einer Gegend (Kachel Zoom 14, ~1,5 km) etwas für ein paar Stunden.
// Alles kommt aus dem Weltstartwert: Alle Spieler sehen dasselbe zur selben Zeit.
// Verpassen kostet nichts. Nie an heiklen Orten (die Mitte liegt dort nie).

export interface WorldEventDef {
  name: string;
  /** Was es bedeutet (für den Hinweis). */
  desc: string;
  weight: number;
  /** Größe der Zone (Meter). 0: nur ein Punkt. */
  radiusM: [number, number];
  durationMin: [number, number];
}

export const WORLD_EVENTS: Record<WorldEventKind, WorldEventDef> = {
  dust: {
    name: 'Staubsturm',
    desc: 'Eine Staubwalze zieht durch. Im Staub schlafen Keime: Durchsuchen nur mit Atemschutz (Staubmaske oder Gasmaske). Dafür sehen dich die Trupps kaum.',
    weight: 3,
    radiusM: [260, 420],
    durationMin: [60, 150],
  },
  horde: {
    name: 'Horde',
    desc: 'Eine Horde zieht durch die Gegend: viele Trupps, größere Gruppen. Leise sein oder einen Bogen machen.',
    weight: 3,
    radiusM: [220, 330],
    durationMin: [60, 120],
  },
  quarantine: {
    name: 'Sperrgebiet',
    desc: 'Landstreifer brennen eine Fiebergrube aus. Die Gegend ist abgesperrt, bis der Rauch abzieht. Fundstellen darin sind so lange tabu.',
    weight: 2,
    radiusM: [140, 240],
    durationMin: [45, 120],
  },
  drop: {
    name: 'Hilfsabwurf',
    desc: 'Ein Versorgungspaket ist abgeworfen worden. Rotes Rauchzeichen zeigt, wo. Es liegt nur ein paar Stunden.',
    weight: 2,
    radiusM: [0, 0],
    durationMin: [90, 180],
  },
};
export const WORLD_EVENT = {
  zoom: 14,
  /** Runde in Stunden (weltweit gleich getaktet). */
  windowH: 3,
  /** Chance pro Gegend und Runde. */
  chance: 0.35,
  /** So viele mögliche Mitten (die erste, die nicht an einem heiklen Ort liegt, gilt). */
  candidates: 5,
  /** Bis zu dieser Entfernung erfährt man davon (Meter; weiter weg fehlen oft noch die Kartendaten). */
  newsM: 1200,
  /** So viele Trupps sind in einer Horde unterwegs. */
  hordePatrols: 4,
};

/** Kälte und Hitze im Kampf (echtes Wetter oder Gegend). */
export const CLIMATE = {
  /** Ab so kalt (°C) zählt Wärme. */
  coldC: 2,
  /** So viel Wärme brauchst du dann (Mütze + Regenjacke = 2). */
  warmthNeeded: 3,
  /** Ab so heiß (°C) brauchst du Wasser. */
  hotC: 28,
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
  mushrooms: 'Nur im Wald, im Herbst besonders oft',
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
  mushrooms: ['Hier ist es still. Nur Moos, Laub und der Geruch von Regen.', 'Jemand hat ein paar Pilze stehen lassen, die guten. Absicht?', 'Im Wald ist der Keim tagsüber schwach. Man atmet freier.'],
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
