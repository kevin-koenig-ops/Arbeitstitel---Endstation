// Spielinhalte als reine Daten. Neue Fundorte, Gegenstände oder Ausbauten
// kommen hier dazu, ohne dass sich die Logik ändern muss.

import type { BackgroundId, EnemyId, Inventory, ModuleId, Quality, Resource, SpotKind, Weapon, WeaponId } from './types';

export const RESOURCE_ORDER: Resource[] = ['food', 'water', 'medicine', 'material'];

export const RESOURCES: Record<Resource, { name: string }> = {
  food: { name: 'Nahrung' },
  water: { name: 'Wasser' },
  medicine: { name: 'Medizin' },
  material: { name: 'Material' },
};

export const START_INVENTORY: Inventory = { food: 2, water: 2, medicine: 0, material: 3 };

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
  mementoChance: number;
}

export const SPOT_KINDS: Record<SpotKind, SpotKindDef> = {
  // --- überall verteilt (Grid) ---
  car: {
    names: ['Verlassenes Auto', 'Ausgebrannter Kombi', 'Liegengebliebener Lieferwagen', 'Auto mit offener Tür'],
    hint: 'Kofferraum, Handschuhfach, Werkzeug',
    cooldownMin: 60,
    loot: [
      { res: 'material', min: 1, max: 3, chance: 1 },
      { res: 'water', min: 1, max: 1, chance: 0.4 },
      { res: 'food', min: 1, max: 1, chance: 0.25 },
    ],
    mementoChance: 0.06,
  },
  backpack: {
    names: ['Zurückgelassener Rucksack', 'Reisetasche am Wegrand', 'Verlorener Schulranzen'],
    hint: 'Proviant, Wasser, manchmal Verbandszeug',
    cooldownMin: 60,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.7 },
      { res: 'water', min: 1, max: 2, chance: 0.6 },
      { res: 'medicine', min: 1, max: 1, chance: 0.3 },
    ],
    mementoChance: 0.1,
  },
  shed: {
    names: ['Gartenlaube', 'Geräteschuppen', 'Schrebergarten'],
    hint: 'Eingemachtes, Werkzeug, Bretter',
    cooldownMin: 60,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.6 },
      { res: 'material', min: 1, max: 2, chance: 0.7 },
    ],
    mementoChance: 0.06,
  },
  container: {
    names: ['Altkleidercontainer', 'Umgekippter Müllcontainer', 'Bauschuttmulde'],
    hint: 'Stoff, Schrott, mit Glück Verbandszeug',
    cooldownMin: 60,
    loot: [
      { res: 'material', min: 1, max: 2, chance: 0.8 },
      { res: 'medicine', min: 1, max: 1, chance: 0.35 },
    ],
    mementoChance: 0.05,
  },
  hide: {
    names: ['Hochsitz', 'Jagdhütte', 'Alter Unterstand'],
    hint: 'Dosen, Wasserflaschen',
    cooldownMin: 60,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.6 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
    ],
    mementoChance: 0.08,
  },
  barrel: {
    names: ['Regentonne', 'Wassertank', 'Volle Zisterne'],
    hint: 'Wasser, abgekocht trinkbar',
    cooldownMin: 60,
    loot: [{ res: 'water', min: 2, max: 3, chance: 1 }],
    mementoChance: 0.02,
  },
  parcel: {
    names: ['Packstation', 'Stapel Pakete', 'Liegengebliebener Paketwagen'],
    hint: 'Alles Mögliche. Selten, aber ergiebig.',
    cooldownMin: 90,
    loot: [
      { res: 'food', min: 1, max: 3, chance: 0.6 },
      { res: 'medicine', min: 1, max: 2, chance: 0.45 },
      { res: 'material', min: 2, max: 3, chance: 0.6 },
    ],
    mementoChance: 0.18,
  },
  // --- echte Orte aus der Karte (POI) ---
  market: {
    names: ['Geplünderter Supermarkt', 'Dorfladen', 'Bäckerei mit Vorratskeller'],
    hint: 'Viel Nahrung und Wasser',
    cooldownMin: 180,
    loot: [
      { res: 'food', min: 3, max: 5, chance: 1 },
      { res: 'water', min: 2, max: 4, chance: 0.9 },
      { res: 'medicine', min: 1, max: 1, chance: 0.2 },
    ],
    mementoChance: 0.12,
  },
  pharmacy: {
    names: ['Apotheke', 'Arztpraxis', 'Notaufnahme'],
    hint: 'Medikamente und Verbandszeug',
    cooldownMin: 180,
    loot: [
      { res: 'medicine', min: 2, max: 4, chance: 1 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
    ],
    mementoChance: 0.12,
  },
  hardware: {
    names: ['Baumarkt', 'Kfz-Werkstatt', 'Gartencenter'],
    hint: 'Jede Menge Material',
    cooldownMin: 180,
    loot: [
      { res: 'material', min: 4, max: 7, chance: 1 },
      { res: 'water', min: 1, max: 2, chance: 0.3 },
    ],
    mementoChance: 0.1,
  },
  fuel: {
    names: ['Tankstelle', 'Rasthof-Shop'],
    hint: 'Snacks, Getränke, Ersatzteile',
    cooldownMin: 180,
    loot: [
      { res: 'food', min: 1, max: 2, chance: 0.9 },
      { res: 'water', min: 1, max: 2, chance: 0.9 },
      { res: 'material', min: 1, max: 3, chance: 0.7 },
    ],
    mementoChance: 0.1,
  },
  well: {
    names: ['Trinkbrunnen', 'Alte Wasserpumpe', 'Dorfbrunnen'],
    hint: 'Sauberes Wasser',
    cooldownMin: 120,
    loot: [{ res: 'water', min: 3, max: 5, chance: 1 }],
    mementoChance: 0.04,
  },
  stop: {
    names: ['Bushaltestelle', 'Wartehäuschen'],
    hint: 'Wer hier gewartet hat, hat etwas zurückgelassen',
    cooldownMin: 120,
    loot: [
      { res: 'food', min: 1, max: 1, chance: 0.5 },
      { res: 'water', min: 1, max: 1, chance: 0.5 },
      { res: 'material', min: 1, max: 2, chance: 0.7 },
    ],
    mementoChance: 0.2,
  },
};

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
    perk: 'Findet öfter Material',
    story: 'In deiner Werkstatt lief jeder Motor wieder. Fast jeder.',
    bonusRes: 'material',
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

// --- Bus-Ausbau ----------------------------------------------------------------

export interface ModuleDef {
  name: string;
  desc: string;
  cost: Partial<Inventory>;
  requires: ModuleId[];
  produces?: { res: Resource; every_h: number; cap: number };
}

export const MODULE_ORDER: ModuleId[] = ['rainBarrel', 'workbench', 'roofGarden', 'medBay', 'radio'];

export const MODULES: Record<ModuleId, ModuleDef> = {
  rainBarrel: {
    name: 'Regenfass',
    desc: 'Sammelt Regenwasser: 1 Wasser alle 3 Stunden, bis zu 6.',
    cost: { material: 6 },
    requires: [],
    produces: { res: 'water', every_h: 3, cap: 6 },
  },
  workbench: {
    name: 'Werkbank',
    desc: '+1 Material bei jeder Suche, bei der du Material findest. Schaltet weiteren Ausbau frei.',
    cost: { material: 12 },
    requires: [],
  },
  roofGarden: {
    name: 'Dachgarten',
    desc: 'Kartoffeln und Bohnen auf dem Dach: 1 Nahrung alle 4 Stunden, bis zu 6.',
    cost: { material: 10, water: 4 },
    requires: ['workbench'],
    produces: { res: 'food', every_h: 4, cap: 6 },
  },
  medBay: {
    name: 'Sanitätsecke',
    desc: 'Eine Liege und ein Medizinschrank. Hier kannst du bald Verletzte versorgen.',
    cost: { material: 14, medicine: 3 },
    requires: ['workbench'],
  },
  radio: {
    name: 'Funkgerät',
    desc: 'Eine Antenne auf dem Dach. Empfängt bald Signale anderer Überlebender.',
    cost: { material: 20, medicine: 1 },
    requires: ['workbench'],
  },
};

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

/** Das allererste Fundstück, damit die Sammlung sofort startet. */
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
  requires?: ModuleId;
  desc: string;
}

/** Ohne Waffe kämpft man mit den Fäusten. */
export const FIST_DAMAGE = 1;

export const WEAPON_ORDER: WeaponId[] = ['crowbar', 'bat', 'crossbow'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  crowbar: { name: 'Brechstange', dmg: 2, dur: 14, cost: { material: 4 }, desc: 'Öffnet Türen und Schädel.' },
  bat: { name: 'Nagelschläger', dmg: 3, dur: 16, cost: { material: 8 }, requires: 'workbench', desc: 'Ein Baseballschläger mit ein paar Nägeln.' },
  crossbow: { name: 'Armbrust', dmg: 4, dur: 12, cost: { material: 14, medicine: 1 }, requires: 'workbench', desc: 'Leise und kräftig. Die Bolzen nutzen sich ab.' },
};

export const START_WEAPONS: Weapon[] = [{ kind: 'crowbar', dur: WEAPONS.crowbar.dur }];
