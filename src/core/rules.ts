// Die Spielregeln als reine Funktion: (Spielstand, Aktion, Zeit) -> (neuer Spielstand, Ereignisse).
//
// Keine Zugriffe auf Uhr, Speicher oder Netzwerk. Die Zeit kommt von außen (ctx.now).
// Im Einzelspieler ruft der Browser diese Funktion auf. Im Mehrspieler ruft der
// Server genau dieselbe Funktion auf. Dann kann niemand schummeln, weil der Server
// entscheidet, ob man nah genug dran war und was man findet.

import {
  ENEMIES,
  FOE_LOOT,
  BACKGROUNDS,
  BASE_SEARCH_RANGE_M,
  CACHE,
  CHAIN,
  NEW_PLACE_BONUS,
  TIER,
  TRACKS,
  CART,
  COLLECTIBLE_ORDER,
  COOK,
  RADIO,
  RADIO_LINES,
  ENEMY_WEIGHTS,
  FOE_TACTICS,
  NIGHT_ENEMY_WEIGHTS,
  WATCHER_LOOT,
  FIRST_MEMENTO,
  COLLECT_CHANCE,
  GUARD_CHANCE,
  GUARD_COLLECT_BONUS,
  GUARD_KRAM_BONUS,
  isMaterial,
  KRAM,
  GUARD_MEMENTO_BONUS,
  HEAL_AMOUNT,
  DIG,
  HEALTH_REGEN_MIN,
  LOOT_QUALITY,
  LUCK_COLLECT,
  LUCK_KRAM,
  TIER_PERKS,
  MAX_HEALTH,
  MEMENTOS,
  MIN_HEALTH_TO_FIGHT,
  EXPLORE_MAX_ACCURACY_M,
  NIGHT_GUARD_FACTOR,
  PERK_CHANCE,
  RESOURCE_ORDER,
  RETURN_BONUS_AFTER_H,
  SET_ORDER,
  SETS,
  SPOT_KINDS,
  START_INVENTORY,
  START_WEAPONS,
  START_GEAR,
  GEAR,
  GEAR_CHANCE,
  GEAR_ORDER,
  WEAPONS,
  WILD,
  WORKBENCH_LEVELS,
  PATROL,
  REGIONS,
  TACTICS,
  gearSum,
  CARDS,
  CARD_LOOT,
  AMMO,
  AMMO_LOOT,
  NOISE,
  LOOT,
  gunAmmo,
  cardStat,
  ONCE_CARDS,
  ONCE_CARRY,
  POUCH_SLOTS,
  SKILL_SLOTS,
  skillLevel,
  type CardId,
  type CardRarity,
} from './content';
import { inSightingRange, rewardOfRarity, sightingById, SIGHT } from './sightings';
import { ExploredView, revealAround, SECTOR_LEVELS, sectorOf } from './explore';
import {
  applyPlan,
  BLUEPRINT_CHANCE,
  COMFORT_TIERS,
  BLUEPRINT_SOURCES,
  canReclaim,
  comfortTier,
  furnitureMs,
  indexPlot,
  obstacleMs,
  pendingKeys,
  pieceMs,
  queueJob,
  sectionMs,
  unqueue,
  workbenchMs,
  isStarter,
  itemProblem,
  lineEdges,
  newPlot,
  OBSTACLES,
  PIECES,
  planAffordable,
  planDemolish,
  planOpening,
  planPaint,
  planWalls,
  plotComfort,
  reclaimCost,
  rectCells,
  roomEdges,
  cellKey,
  sectionKey,
  SITE_ORDER,
  SITE_PLAN_CHANCE,
  SITES,
  storeItem,
  type BlueprintId,
  type FloorId,
  type OpeningId,
  type PlotIndex,
  type RoofId,
  type SiteId,
  type WallId,
} from './building';
import { FURNITURE, isCollectible, type FurnitureId } from './furniture';
import { distanceM, offsetM } from './geo';
import { gridSpotsAround } from './world';
import { dayPhase } from './sun';
import { hashString, pickWeighted, randInt, rngFrom } from './rng';
import type {
  AmmoId,
  GearId,
  GearState,
  Action,
  ActionResult,
  Cache,
  Combat,
  RegionId,
  LatLon,
  Character,
  EnemyId,
  FoeKind,
  GameEvent,
  CollectibleId,
  Inventory,
  KramBag,
  KramId,
  Material,
  Plot,
  PlayerState,
  Quality,
  RejectReason,
  Resource,
  RuleContext,
  Spot,
  SpotKind,
  Weapon,
  WeaponId,
} from './types';
import { gridSpotAlive, resolveGridSpot, resolveSpecialSpot } from './world';
import { resolvePatrol } from './patrols';
import { resolveDropSpot, zonesAt } from './worldEvents';
import { GOALS } from './progress';

export const SCHEMA_VERSION = 22;

/** Startausrüstung: alles gefunden und angezogen. */
export function startGear(now: number): GearState {
  const gear: GearState = { owned: {}, worn: {} };
  for (const id of START_GEAR) {
    gear.owned[id] = now;
    gear.worn[GEAR[id].slot] = id;
  }
  return gear;
}
const HOUR = 3600_000;
/** Millisekunden pro Gesundheitspunkt (die Stufe des Zuhauses macht es schneller). */
export function regenMs(state: PlayerState): number {
  return basePerks(state).regenMin * 60_000;
}
const MAX_GPS_SLACK_M = 25;

export function createPlayer(playerId: string, character: Character, now: number): PlayerState {
  return {
    schema: SCHEMA_VERSION,
    playerId,
    createdAt: now,
    lastActiveAt: now,
    character,
    inventory: { ...START_INVENTORY },
    kram: {},
    pack: {},
    packKram: {},
    collectibles: {},
    sets: {},
    workshop: { level: 1, jobs: [] },
    spots: {},
    collection: {},
    returnBonus: false,
    health: MAX_HEALTH,
    healthAt: now,
    weapons: START_WEAPONS.map((w) => ({ ...w })),
    ammo: {},
    noise: [],
    gear: startGear(now),
    combat: null,
    explored: {},
    sectors: {},
    base: { active: null, plots: {}, found: {} },
    blueprints: {},
    stats: { searches: 0, kills: 0, unpacks: 0, dismantled: 0, crafted: 0, caches: 0, cooked: 0, mercy: 0 },
    goals: {},
    dig: null,
    seen: [],
    caches: [],
    radioAt: 0,
    fedUntil: 0,
    wildAt: 0,
    places: {},
    discovered: {},
    patrols: {},
    packCards: {},
    stash: {},
    book: {},
    sightings: {},
    pity: { rare: 0, legendary: 0 },
    loadout: { pouch: [], skills: [] },
  };
}

/**
 * Wie fremd ist die Gegend? 0 vertraut, 1 Neuland (dieser Sektor ist noch nicht erkundet),
 * 2 fernes Land (weit und breit kein erkundeter Sektor). Bewusst ohne den Ort des Zuhauses,
 * der bleibt auf dem Gerät. Ganz am Anfang (noch nichts erkundet) ist alles vertraut.
 */
export function regionTier(state: PlayerState, p: LatLon): 0 | 1 | 2 {
  const known = Object.entries(state.sectors).filter(([, lvl]) => lvl >= 1);
  if (!known.length) return 0;
  const here = sectorOf(p);
  if ((state.sectors[here.key] ?? 0) >= 1) return 0;
  let nearest = Infinity;
  for (const [k] of known) {
    const [sx, sy] = k.split(':').map(Number);
    nearest = Math.min(nearest, Math.max(Math.abs(sx - here.sx), Math.abs(sy - here.sy)));
  }
  return nearest > TIER.farSectors ? 2 : 1;
}

// --- Abfragen (auch für die Oberfläche) ------------------------------------------

export function searchRangeM(state: PlayerState): number {
  return BASE_SEARCH_RANGE_M + (BACKGROUNDS[state.character.background].rangeBonusM ?? 0) + basePerks(state).rangeM;
}

export function cooldownMs(spot: Spot): number {
  return SPOT_KINDS[spot.kind].cooldownMin * 60_000;
}

/** Wann ist die Fundstelle wieder durchsuchbar? 0 = jetzt. */
export function readyAt(state: PlayerState, spot: Spot): number {
  const last = state.spots[spot.id];
  return last ? last + cooldownMs(spot) : 0;
}

export function dayNumber(state: PlayerState, now: number): number {
  return Math.floor((now - state.createdAt) / (24 * HOUR)) + 1;
}

export function canAfford(inv: Inventory, cost: Partial<Inventory>): boolean {
  return RESOURCE_ORDER.every((r) => inv[r] >= (cost[r] ?? 0));
}

/** Gesundheit inklusive der Erholung seit dem letzten Stand. */
export function currentHealth(state: PlayerState, now: number): number {
  if (state.health >= MAX_HEALTH) return MAX_HEALTH;
  return Math.min(MAX_HEALTH, state.health + Math.floor((now - state.healthAt) / regenMs(state)));
}

/** Millisekunden bis zum nächsten Lebenspunkt (0 bei voller Gesundheit). */
export function nextHealthIn(state: PlayerState, now: number): number {
  if (currentHealth(state, now) >= MAX_HEALTH) return 0;
  const ms = regenMs(state);
  return ms - ((now - state.healthAt) % ms);
}

/** Die beste noch heile Waffe, oder null (dann Fäuste). */
export function bestWeapon(state: PlayerState): Weapon | null {
  return battleWeapons(state)[0] ?? null;
}

const RARITY_RANK: Record<string, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };

/** Die stärkste heile Waffe einer Art (Nahkampf oder Fernkampf); bei Gleichstand die seltenere, dann die heilere. */
export function strongestWeapon(state: PlayerState, range: 'melee' | 'ranged'): Weapon | null {
  let best: Weapon | null = null;
  const score = (w: Weapon) => {
    const def = WEAPONS[w.kind];
    // Schusswaffe ohne Munition: nur Kolbenschläge, also nur, wenn sonst nichts da ist
    const kinds = gunAmmo(w.kind);
    if (kinds.length && !kinds.some((a) => (state.ammo?.[a] ?? 0) > 0)) return 1;
    return def.dmg * 100 + (RARITY_RANK[def.rarity ?? ''] ?? 0) * 10;
  };
  for (const w of state.weapons) {
    if (w.dur <= 0 || WEAPONS[w.kind].range !== range) continue;
    if (!best || score(w) > score(best) || (score(w) === score(best) && w.dur > best.dur)) best = w;
  }
  return best;
}

/**
 * Die Waffen für den Kampf: eine für den Nahkampf, eine für den Fernkampf. Gewählt wird zu Hause;
 * ist die gewählte kaputt oder nicht gewählt, nimmt das Spiel die stärkste heile ihrer Art.
 */
export function battleWeapons(state: PlayerState): Weapon[] {
  const out: Weapon[] = [];
  for (const range of ['melee', 'ranged'] as const) {
    const want = state.loadout[range];
    const chosen = want && WEAPONS[want].range === range ? state.weapons.filter((w) => w.kind === want && w.dur > 0).sort((a, b) => b.dur - a.dur)[0] : undefined;
    const w = chosen ?? strongestWeapon(state, range);
    if (w) out.push(w);
  }
  return out;
}

export function guardWindow(spot: Spot, now: number): number {
  return Math.floor(now / cooldownMs(spot));
}

/**
 * Wird die Fundstelle gerade bewacht, und von wem? Deterministisch aus Welt-Seed,
 * Fundstelle und Zeitfenster, also für alle Spieler gleich.
 */
export function guardOf(seed: string, spot: Spot, now: number): EnemyId | null {
  // Pilze sammeln ist ruhig: tagsüber ist der Keim im Wald schwach
  if (spot.kind === 'mushrooms') return null;
  if (cartOf(seed, spot, now)) return null;
  const r = rngFrom(seed, 'wache', spot.id, guardWindow(spot, now));
  const night = dayPhase(spot.pos, now) === 'night';
  const chance = Math.min(0.75, GUARD_CHANCE[spot.source] * (night ? NIGHT_GUARD_FACTOR : 1));
  if (r() >= chance) return null;
  // Der Bleiche Wächter kommt nur nachts heraus
  return pickWeighted(r, night ? NIGHT_ENEMY_WEIGHTS : ENEMY_WEIGHTS);
}

/**
 * Steht hier gerade eine liegengebliebene Händlerkiste? Für alle Spieler gleich,
 * jeweils für ein Zeitfenster von ein paar Stunden. Gibt das Ende des Fensters zurück.
 */
export function cartOf(seed: string, spot: Spot, now: number): { until: number } | null {
  if (spot.kind === 'mushrooms') return null;
  const ms = CART.windowH * HOUR;
  const w = Math.floor(now / ms);
  const r = rngFrom(seed, 'karren', spot.id, w);
  return r() < CART.chance ? { until: (w + 1) * ms } : null;
}

/** Bist du gerade satt (Eintopf)? */
export function isFed(state: PlayerState, now: number): boolean {
  return state.fedUntil > now;
}

/** Steht so ein Teil fertig im Zuhause? (Im Bau zählt noch nicht.) */
export function hasItem(state: PlayerState, kind: FurnitureId): boolean {
  const plot = activePlot(state);
  if (!plot) return false;
  const pend = pendingKeys(plot);
  return plot.items.some((i) => i.kind === kind && !pend.has(`i:${i.uid}`));
}

/** Wann das Funkgerät wieder etwas Neues bringt (0 = jetzt). */
export function radioReadyIn(state: PlayerState, now: number): number {
  return Math.max(0, state.radioAt + RADIO.everyH * HOUR - now);
}

/** Wo man einen Rohstoff am ehesten findet (Fundstellen-Arten, beste zuerst). */
export function whereToFind(res: Resource): SpotKind[] {
  const score = (k: SpotKind) =>
    SPOT_KINDS[k].loot.filter((l) => l.res === res).reduce((n, l) => n + l.chance * (l.min + l.max) / 2, 0);
  return (Object.keys(SPOT_KINDS) as SpotKind[]).filter((k) => score(k) > 0).sort((a, b) => score(b) - score(a));
}

// --- Basis ---------------------------------------------------------------------------

export { comfortTier };

export function knowsBlueprint(state: PlayerState, id: BlueprintId): boolean {
  return isStarter(id) || !!state.blueprints[id];
}

/** Das Gelände am gerade bewohnten Schauplatz (oder null). */
export function activePlot(state: PlayerState): Plot | null {
  const a = state.base.active;
  return a ? (state.base.plots[a] ?? null) : null;
}

/** Übersicht über das aktive Gelände (Hindernisse, belegte Felder). */
export function plotIndexOf(state: PlayerState): PlotIndex | null {
  const plot = activePlot(state);
  return plot && state.base.active ? indexPlot(state.playerId, state.base.active, plot) : null;
}

/** Gemütlichkeit am aktiven Schauplatz. */
/** Stufe des Zuhauses (0 = Ruine … 6 = Oase), aus der Gemütlichkeit. */
export function baseTier(state: PlayerState): number {
  const c = comfort(state);
  let t = 0;
  COMFORT_TIERS.forEach(([min], i) => {
    if (c >= min) t = i;
  });
  return t;
}

/** Alles, was die bisher erreichten Stufen zusammen bringen. */
export function basePerks(state: PlayerState) {
  const out = { regenMin: HEALTH_REGEN_MIN, slots: 0, rangeM: 0, luck: 0, lootFactor: 1 };
  const t = baseTier(state);
  for (let i = 0; i <= t; i++) {
    const p = TIER_PERKS[i];
    if (!p) continue;
    if (p.regenMin) out.regenMin = Math.min(out.regenMin, p.regenMin);
    out.slots += p.slots ?? 0;
    out.rangeM += p.rangeM ?? 0;
    out.luck += p.luck ?? 0;
    if (p.lootFactor) out.lootFactor *= p.lootFactor;
  }
  return out;
}

/** Plätze am Werktisch (Ausbaustufe plus Stufe des Zuhauses). */
export function workbenchSlots(state: PlayerState): number {
  return workbenchLevel(state).slots + basePerks(state).slots;
}

export function comfort(state: PlayerState): number {
  const plot = activePlot(state);
  return plot ? plotComfort(plot).value : 0;
}

/** Darf ein Teil hier stehen? Gibt den Grund zurück, falls nicht. */
export function placementProblem(state: PlayerState, kind: FurnitureId, x: number, y: number, rot: number, ignoreUid?: number): RejectReason | null {
  const plot = activePlot(state);
  const idx = plotIndexOf(state);
  if (!plot || !idx) return 'no_site';
  return itemProblem(idx, plot, kind, x, y, rot, ignoreUid);
}

/** Welche Schauplätze stehen zur Wahl? (start = Erstwahl, found = gefunden, home = schon bewohnt) */
export function siteStatus(state: PlayerState, site: SiteId): 'home' | 'found' | 'start' | 'hidden' {
  if (state.base.plots[site]) return 'home';
  if (state.base.found[site]) return 'found';
  if (Object.keys(state.base.plots).length === 0 && SITES[site].start) return 'start';
  return 'hidden';
}

// --- Werktisch ----------------------------------------------------------------------

/** Steht am aktiven Schauplatz ein Werktisch? */
export function hasWorkbench(state: PlayerState): boolean {
  return hasItem(state, 'workbench');
}

/**
 * Fertige Baustellen abschließen (die Bauliste arbeitet in echter Zeit, auch ohne Spielen).
 * Läuft vor jeder Aktion; was fertig ist, wirkt ab dann.
 */
export function settleBuilds(state: PlayerState, now: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (const [site, plot] of Object.entries(state.base.plots) as [SiteId, Plot | undefined][]) {
    if (!plot?.jobs?.length) continue;
    while (plot.jobs.length && plot.jobs[0].endsAt <= now) {
      const j = plot.jobs.shift()!;
      for (const k of j.keys) {
        if (k.startsWith('s:')) {
          if (!plot.sections.includes(k.slice(2))) plot.sections.push(k.slice(2));
        } else if (k.startsWith('c:')) {
          if (!plot.cleared.includes(k.slice(2))) plot.cleared.push(k.slice(2));
        } else if (k === 'u:workbench') {
          state.workshop.level = Math.min(WORKBENCH_LEVELS.length, state.workshop.level + 1);
        }
      }
      events.push({ type: 'built', label: j.label, count: j.keys.length, site });
    }
    if (!plot.jobs.length) delete plot.jobs;
  }
  return events;
}

/** Wann das Nächste im Zuhause fertig wird (ms), oder null, wenn nichts im Bau ist. */
export function nextBuildDone(state: PlayerState): number | null {
  let t: number | null = null;
  for (const plot of Object.values(state.base.plots)) {
    const j = plot?.jobs?.[0];
    if (j && (t === null || j.endsAt < t)) t = j.endsAt;
  }
  return t;
}

export function workbenchLevel(state: PlayerState) {
  return WORKBENCH_LEVELS[Math.max(0, Math.min(WORKBENCH_LEVELS.length - 1, state.workshop.level - 1))];
}

/** Wie lange dauert das Zerlegen auf der aktuellen Stufe (Millisekunden)? */
export function dismantleMs(state: PlayerState, kram: KramId): number {
  return Math.round(KRAM[kram].minutes * 60_000 * workbenchLevel(state).speed);
}

/** Fertig Zerlegtes, das auf dem Werktisch zum Abholen bereitliegt. */
export function readyParts(state: PlayerState, now: number): { items: Partial<Inventory>; count: number } {
  const items: Partial<Inventory> = {};
  let count = 0;
  for (const job of state.workshop.jobs) {
    if (job.endsAt > now) continue;
    count++;
    for (const [k, v] of Object.entries(KRAM[job.kram].parts) as [Material, number][]) items[k] = (items[k] ?? 0) + v;
  }
  return { items, count };
}

// --- Rucksack, Lager, Sammelstücke --------------------------------------------------

export function kramCount(bag: KramBag): number {
  return Object.values(bag).reduce((a, b) => a + (b ?? 0), 0);
}

/** Wie viel steckt im Rucksack (Rohstoffe + Kram)? */
export function packCount(state: PlayerState): number {
  // Karten zählen nicht: Die passen in jede Jackentasche
  return Object.values(state.pack).reduce((a, b) => a + (b ?? 0), 0) + kramCount(state.packKram);
}

/** Anzahl Karten in einem Stapel (Rucksack oder Lager). */
export function cardCount(bag: Partial<Record<CardId, number>>): number {
  return Object.values(bag).reduce((a, b) => a + (b ?? 0), 0);
}

/** Stufe einer Fähigkeit (0 = hast du nicht). */
export function skillOf(state: PlayerState, id: CardId): number {
  return CARDS[id].kind === 'skill' ? skillLevel(state.book[id]?.n ?? 0, CARDS[id].rarity) : 0;
}

/** So viele Fähigkeiten gehen mit in den Kampf. Später mit Charakterstufen: ab Stufe 10 fünf, ab 20 sechs. */
export function skillSlots(_state: PlayerState): number {
  return SKILL_SLOTS;
}

/** Stufe einer Fähigkeit, die du zu Hause für den Kampf gewählt hast (0 = nicht dabei). */
export function equippedSkill(state: PlayerState, id: CardId): number {
  return state.loadout.skills.includes(id) ? skillOf(state, id) : 0;
}

/** Wie viele Einmal-Karten einer Sorte du hast (dabei und im Lager). */
export function onceOwned(state: PlayerState, id: CardId): number {
  return (state.packCards[id] ?? 0) + (state.stash[id] ?? 0);
}

/**
 * Die Tasche für den nächsten Kampf: erst die gewählten Sorten, freie Plätze füllen andere
 * Einmal-Karten, die du gerade dabeihast (unterwegs Gefundenes). Höchstens 3 Sorten, je 3.
 */
export function pouchKit(state: PlayerState): Partial<Record<CardId, number>> {
  const out: Partial<Record<CardId, number>> = {};
  const carried = (id: CardId) => state.packCards[id] ?? 0;
  const order = [...state.loadout.pouch, ...ONCE_CARDS.filter((id) => !state.loadout.pouch.includes(id))];
  for (const id of order) {
    if (Object.keys(out).length >= POUCH_SLOTS) break;
    if (CARDS[id]?.kind === 'once' && carried(id) > 0) out[id] = Math.min(ONCE_CARRY, carried(id));
  }
  return out;
}

/** Was du für den Kampf mitbringst: die Tasche und die gewählten Fähigkeiten mit Stufe. */
export function cardKit(state: PlayerState, now: number): { pouch: Partial<Record<CardId, number>>; skills: Partial<Record<CardId, number>>; lastStand: boolean } {
  const skills: Partial<Record<CardId, number>> = {};
  for (const id of state.loadout.skills) {
    const lvl = CARDS[id] ? skillOf(state, id) : 0;
    if (lvl) skills[id] = lvl;
  }
  return { pouch: pouchKit(state), skills, lastStand: !state.lastStandAt || now - state.lastStandAt >= 24 * HOUR };
}

/**
 * Neu bekommen: Ist noch ein Platz frei, kommt es gleich in die Tasche bzw. zu den Fähigkeiten.
 * Eine leere Sorte (keine mehr da) macht ihren Platz für die neue frei.
 */
function autoLoadout(state: PlayerState, card: CardId) {
  const def = CARDS[card];
  const lo = state.loadout;
  if (def.kind === 'once' && !lo.pouch.includes(card)) {
    if (lo.pouch.length >= POUCH_SLOTS) {
      const empty = lo.pouch.findIndex((id) => onceOwned(state, id) <= 0);
      if (empty >= 0) lo.pouch.splice(empty, 1);
    }
    if (lo.pouch.length < POUCH_SLOTS) lo.pouch.push(card);
  } else if (def.kind === 'skill' && !lo.skills.includes(card) && lo.skills.length < skillSlots(state)) lo.skills.push(card);
}

/** Ins Sammelbuch eintragen (Karte oder „w:Waffe“). Gibt die neue Anzahl zurück. */
function addToBook(state: PlayerState, key: string, now: number, shiny = false): number {
  const e = state.book[key] ?? { n: 0, at: now };
  e.n += 1;
  if (shiny) e.shiny = true;
  state.book[key] = e;
  return e.n;
}

/** Eine gefundene Waffe: neu dazu, oder (hast du sie schon) wieder ganz heil. */
function gainWeapon(state: PlayerState, kind: WeaponId): boolean {
  // Eine gefundene Schusswaffe hat noch ein paar Schuss drin
  const def = WEAPONS[kind];
  if (def.ammo && def.loaded) state.ammo[def.ammo] = (state.ammo[def.ammo] ?? 0) + def.loaded;
  if (def.ammo2 && def.loaded2) state.ammo[def.ammo2] = (state.ammo[def.ammo2] ?? 0) + def.loaded2;
  const have = state.weapons.find((w) => w.kind === kind && w.dur > 0);
  if (have) {
    have.dur = Math.max(have.dur, WEAPONS[kind].dur);
    return true;
  }
  state.weapons.push({ kind, dur: WEAPONS[kind].dur });
  return false;
}

/** Sammelkarte oder Waffe bekommen: ins Sammelbuch, Einmal-Karten in den Rucksack, Waffen neu oder wieder heil. */
function grantCollectible(
  state: PlayerState,
  reward: { card?: CardId; weapon?: WeaponId },
  now: number,
  shiny: boolean,
): { card?: CardId; weapon?: WeaponId; repaired?: boolean; level?: number; levelUp?: boolean } | null {
  if (reward.weapon) {
    const repaired = gainWeapon(state, reward.weapon);
    addToBook(state, `w:${reward.weapon}`, now, shiny);
    return { weapon: reward.weapon, repaired };
  }
  if (!reward.card) return null;
  const card = reward.card;
  const before = skillOf(state, card);
  addToBook(state, card, now, shiny);
  if (CARDS[card].kind === 'once') state.packCards[card] = (state.packCards[card] ?? 0) + 1;
  autoLoadout(state, card);
  const level = skillOf(state, card) || undefined;
  return { card, level, levelUp: !!level && level > before && before > 0 };
}

/** Zu Hause: die Sorten der Tasche aus dem Lager wieder auf je 3 auffüllen. */
function refillPackCards(state: PlayerState) {
  for (const id of state.loadout.pouch) {
    const n = state.stash[id] ?? 0;
    const want = Math.max(0, ONCE_CARRY - (state.packCards[id] ?? 0));
    const take = Math.min(want, n ?? 0);
    if (!take) continue;
    state.packCards[id] = (state.packCards[id] ?? 0) + take;
    state.stash[id] = (n ?? 0) - take;
    if (!state.stash[id]) delete state.stash[id];
  }
}

/** Steht dieses Sammelstück schon irgendwo (an irgendeinem Schauplatz)? */
export function collectiblePlaced(state: PlayerState, id: CollectibleId): boolean {
  return Object.values(state.base.plots).some((p) => p?.items.some((i) => i.kind === id));
}

// --- Anlagen ------------------------------------------------------------------------

/** Was eine Anlage (Regentonne, Hochbeet) gerade zum Abholen hat. */
export function itemYield(it: { kind: FurnitureId; at?: number }, now: number): number {
  const prod = FURNITURE[it.kind]?.produces;
  if (!prod || it.at === undefined) return 0;
  return Math.max(0, Math.min(prod.cap, Math.floor((now - it.at) / (prod.everyH * HOUR))));
}

/** Alles, was im aktiven Zuhause zum Abholen bereitsteht. */
export function pendingHarvest(state: PlayerState, now: number): Partial<Inventory> {
  const out: Partial<Inventory> = {};
  for (const it of activePlot(state)?.items ?? []) {
    const n = itemYield(it, now);
    const prod = FURNITURE[it.kind].produces;
    if (n > 0 && prod) out[prod.res] = (out[prod.res] ?? 0) + n;
  }
  return out;
}

// --- Aktionen ----------------------------------------------------------------------

export function applyAction(prev: PlayerState, action: Action, ctx: RuleContext): ActionResult {
  const state: PlayerState = structuredClone(prev);
  const events: GameEvent[] = [];
  const reject = (reason: RejectReason): ActionResult => ({ state: prev, events: [{ type: 'rejected', reason }] });
  settleHealth(state, ctx.now);
  // Fertige Baustellen zuerst abschließen (zum Testen: alles sofort fertig). Ihre Meldungen
  // kommen ans Ende, damit die erste Meldung immer zur Aktion selbst gehört.
  const builtEvents = settleBuilds(state, ctx.instantBuild ? Infinity : ctx.now);

  switch (action.type) {
    case 'settle':
      break;

    case 'testFinishBuilds': {
      const done = settleBuilds(state, Infinity);
      if (!done.length) return reject('nothing');
      events.push(...done);
      break;
    }

    case 'session': {
      if (ctx.now - prev.lastActiveAt > RETURN_BONUS_AFTER_H * HOUR && !prev.returnBonus) {
        state.returnBonus = true;
        events.push({ type: 'returnBonus' });
      }
      break;
    }

    case 'search': {
      const spot = verifySpot(action.spot, ctx);
      if (!spot) return reject('invalid_spot');
      if (!inRange(state, spot, action.at, action.accuracyM)) return reject('too_far');
      if (readyAt(state, spot) > ctx.now) return reject('cooldown');
      const zoneSearch = zoneRule(state, spot.pos, ctx);
      if (zoneSearch) return reject(zoneSearch);
      if (guardOf(ctx.worldSeed, spot, ctx.now)) return reject('guarded');
      events.push(lootSpot(state, spot, ctx, { guarded: false, quality: action.quality ?? 'good' }), ...checkSets(state, ctx.now));
      startDig(state, spot, ctx);
      break;
    }

    case 'dig': {
      const d = state.dig;
      if (!d || d.until < ctx.now || d.round >= DIG.max) {
        state.dig = null;
        return reject('nothing');
      }
      if (!inRange(state, d.spot, action.at, action.accuracyM)) return reject('too_far');
      const night = dayPhase(d.spot.pos, ctx.now) === 'night';
      const limit = randInt(rngFrom(ctx.worldSeed, state.playerId, 'laerm', d.spot.id, d.window), DIG.limit[0], DIG.limit[1]) - (night ? 1 : 0);
      const r = rngFrom(ctx.worldSeed, state.playerId, 'wuehlen', d.spot.id, d.window, d.round);
      d.round += 1;
      d.noise += r() < DIG.loud ? 2 : 1;
      if (d.noise > limit) {
        // Zu laut: etwas kommt
        state.dig = null;
        const group: FoeKind[] = night && r() < 0.5 ? ['walker', 'crawler'] : r() < 0.4 ? ['walker', 'walker'] : ['walker'];
        state.combat = { spot: d.spot, enemy: 'walker', group, window: d.window, ambush: true };
        events.push({ type: 'ambush', group }, { type: 'combatStarted', enemy: 'walker' });
        break;
      }
      const def = SPOT_KINDS[d.spot.kind];
      const perks = basePerks(state);
      const items: Partial<Inventory> = {};
      const rolls = 1 + (r() < 0.5 ? 1 : 0);
      for (let i = 0; i < rolls; i++) {
        const rule = def.loot[Math.floor(r() * def.loot.length)];
        // Wasser und Essen auch beim Wühlen seltener
        if (lootChance(def.loot, rule) < rule.chance && r() > LOOT.foodWaterChance) continue;
        items[rule.res] = (items[rule.res] ?? 0) + lootAmount(rule.res, randInt(r, rule.min, rule.max), 0.6 * perks.lootFactor);
      }
      gain(state, items);
      let kram: KramId | undefined;
      if (def.kram.length && r() < DIG.kramChance + d.round * 0.04 + perks.luck * LUCK_KRAM) {
        kram = pickWeighted(r, def.kram);
        state.packKram[kram] = (state.packKram[kram] ?? 0) + 1;
      }
      let collectible: CollectibleId | undefined;
      const missingC = def.collectibles.filter((c) => !state.collectibles[c]);
      if (missingC.length && r() < DIG.collectChance * d.round + perks.luck * LUCK_COLLECT * 0.5) {
        collectible = missingC[Math.floor(r() * missingC.length)];
        state.collectibles[collectible] = ctx.now;
      }
      events.push({ type: 'dug', items, kram, collectible, round: d.round, noise: d.noise, left: DIG.max - d.round }, ...checkSets(state, ctx.now));
      if (d.round >= DIG.max) state.dig = null;
      break;
    }

    case 'stopDig': {
      state.dig = null;
      break;
    }

    case 'testFight': {
      const group = action.group.filter((k) => k in FOE_TACTICS).slice(0, 4);
      if (!group.length) return reject('nothing');
      const window = Math.floor(ctx.now / 60_000);
      const spot: Spot = { id: `w:test:${window}`, kind: 'hide', source: 'grid', pos: action.at, name: 'Testkampf' };
      state.dig = null;
      state.combat = { spot, enemy: leadEnemy(group), group, window, ambush: true, wild: true };
      events.push({ type: 'wild', group }, { type: 'combatStarted', enemy: leadEnemy(group) });
      break;
    }

    case 'roam': {
      // Quer durchs Unterholz: Manchmal kommt dir etwas entgegen. Nie, wenn du erschöpft bist,
      // nie direkt nach der letzten Begegnung. (Ob es wirklich Wald ist, prüft später der Server.)
      if (action.terrain !== 'forest' || state.combat || state.dig) break;
      if (state.health < MIN_HEALTH_TO_FIGHT || ctx.now - state.wildAt < WILD.cooldownMs) break;
      const meters = Math.max(0, Math.min(WILD.maxMeters, action.meters));
      const night = dayPhase(action.at, ctx.now) === 'night';
      const chance = 1 - Math.pow(1 - WILD.chancePer25m * (night ? WILD.nightFactor : 1), meters / 25);
      const window = Math.floor(ctx.now / 60_000);
      const r = rngFrom(ctx.worldSeed, state.playerId, 'unterholz', window, Math.round(action.at.lat * 4000), Math.round(action.at.lon * 4000));
      if (r() >= chance) break;
      const roll = r();
      // Nachts kann auch der Bleiche Wächter durchs Unterholz streifen
      // Dazu Kalkköpfe auf Waldwegen und Schläfer im Gras
      // Tagsüber auch mal ein Verwilderter, der hier sein Revier hat
      const group: FoeKind[] =
        night && roll < 0.25 ? ['watcher'] : roll < 0.12 ? ['brute'] : roll < 0.2 ? ['ramhead'] : roll < 0.26 ? ['sleeper'] : roll < 0.48 ? ['crawler', 'walker'] : !night && roll > 0.88 ? ['feral'] : night ? ['walker', 'walker'] : ['walker'];
      const spot: Spot = { id: `w:${window}`, kind: 'hide', source: 'grid', pos: action.at, name: 'Unterholz' };
      state.wildAt = ctx.now;
      state.dig = null;
      state.combat = { spot, enemy: leadEnemy(group), group, window, ambush: true, wild: true };
      events.push({ type: 'wild', group }, { type: 'combatStarted', enemy: leadEnemy(group) });
      break;
    }

    case 'patrolFight': {
      // Läuft schon ein Kampf mit diesem Trupp: einfach weiter.
      if (state.combat?.patrol === action.patrol) {
        events.push({ type: 'combatStarted', enemy: state.combat.enemy });
        break;
      }
      const night = dayPhase(action.at, ctx.now) === 'night';
      const region: RegionId = action.region in REGIONS ? action.region : 'village';
      // Den Trupp aus seiner Kennung neu berechnen: erfundene oder abgelaufene gibt es nicht
      const plan = resolvePatrol(ctx.worldSeed, action.patrol, ctx.now, night, region, !!action.frost, state.noise ?? []);
      if (state.combat || !plan || state.patrols[action.patrol]) return reject('nothing');
      // Man muss in der Nähe seiner Strecke sein (Strecke, Weg zum nächsten Pfad, Verfolgung)
      if (action.accuracyM > 120 || distanceM(action.at, plan.anchor) > plan.lengthM + PATROL.reachSlackM) return reject('too_far');
      if (state.health < MIN_HEALTH_TO_FIGHT) return reject('exhausted');
      if (ctx.now - state.wildAt < PATROL.cooldownMin * 60_000) return reject('cooldown');
      const group = plan.group;
      const window = Math.floor(ctx.now / 60_000);
      const spot: Spot = { id: `w:${action.patrol}`, kind: 'hide', source: 'grid', pos: action.at, name: group.length > 2 ? 'Horde' : 'Trupp' };
      const enemy = leadEnemy(group);
      state.wildAt = ctx.now;
      state.dig = null;
      state.combat = { spot, enemy, group, window, wild: true, patrol: action.patrol, opening: action.opening === 'surprise' ? 'surprise' : 'spotted' };
      events.push({ type: 'patrol', group, opening: state.combat.opening! }, { type: 'combatStarted', enemy });
      break;
    }

    case 'engage': {
      const spot = verifySpot(action.spot, ctx);
      if (!spot) return reject('invalid_spot');
      // Läuft schon ein Kampf an dieser Stelle: einfach weiter.
      if (state.combat?.spot.id === spot.id) {
        events.push({ type: 'combatStarted', enemy: state.combat.enemy });
        break;
      }
      if (!inRange(state, spot, action.at, action.accuracyM)) return reject('too_far');
      if (readyAt(state, spot) > ctx.now) return reject('cooldown');
      const zoneEngage = zoneRule(state, spot.pos, ctx);
      if (zoneEngage) return reject(zoneEngage);
      const enemy = guardOf(ctx.worldSeed, spot, ctx.now);
      if (!enemy) return reject('not_guarded');
      if (state.health < MIN_HEALTH_TO_FIGHT) return reject('exhausted');
      const window = guardWindow(spot, ctx.now);
      state.dig = null;
      state.combat = { spot, enemy, group: encounter(ctx.worldSeed, state.playerId, spot, window, enemy, dayPhase(spot.pos, ctx.now) === 'night'), window };
      events.push({ type: 'combatStarted', enemy });
      break;
    }

    case 'battleResult': {
      const c = state.combat;
      if (!c) return reject('no_combat');
      const used = Math.max(0, Math.min(Math.floor(action.usedMedicine), state.inventory.medicine));
      state.inventory.medicine -= used;
      // Verschossene Munition ist weg (nie mehr, als da war)
      for (const [a, n] of Object.entries(action.usedAmmo ?? {}) as [AmmoId, number][]) {
        if (!(a in AMMO) || !(n > 0)) continue;
        state.ammo[a] = Math.max(0, (state.ammo[a] ?? 0) - Math.floor(n));
      }
      // Laute Schüsse: Trupps aus der Gegend kommen zum Kampfort (nur auf der Karte, siehe patrols.ts)
      const shots = Math.max(0, Math.min(40, Math.floor(action.shots ?? 0)));
      state.noise = (state.noise ?? []).filter((n) => n.until > ctx.now);
      if (shots > 0) {
        state.noise.push({ id: `${Math.floor(ctx.now / 1000)}`, at: c.spot.pos, from: ctx.now, until: ctx.now + NOISE.minutes * 60_000, loud: shots });
        state.noise = state.noise.slice(-NOISE.keep);
      }
      // Mehr als vorher plus Verbinden geht nicht
      const cap = Math.min(MAX_HEALTH, state.health + used * HEAL_AMOUNT);
      const health = Math.max(0, Math.min(cap, Math.round(action.health)));
      state.combat = null;
      // Abnutzung: pro gespielter Waffenkarte (Taktik), sonst einmal pro Kampf
      let weaponBroke: Weapon['kind'] | undefined;
      const wear: Partial<Record<WeaponId, number>> = action.wear ?? {};
      if (!action.wear && action.outcome !== 'fled') {
        const w = bestWeapon(state);
        if (w) wear[w.kind] = 1;
      }
      for (const [kind, n] of Object.entries(wear) as [WeaponId, number][]) {
        const w = state.weapons.filter((x) => x.kind === kind).sort((a, b) => b.dur - a.dur)[0];
        if (!w) continue;
        // Negativ = geflickt (Panzertape), nie über neu hinaus
        w.dur = Math.min(WEAPONS[kind].dur, w.dur - Math.max(-18, Math.min(30, Math.floor(n))));
        if (w.dur <= 0) weaponBroke = kind;
      }
      state.weapons = state.weapons.filter((x) => x.dur > 0);
      // Werkzeugrolle: nach dem Kampf die Kampfwaffen flicken
      const roll = equippedSkill(state, 'toolroll');
      if (roll) for (const w of battleWeapons(state)) w.dur = Math.min(WEAPONS[w.kind].dur, w.dur + cardStat('toolroll', 'bonus', roll));
      // Ausgespielte Einmal-Karten sind weg (nie mehr, als im Rucksack waren)
      for (const [id, n] of Object.entries(action.used ?? {}) as [CardId, number][]) {
        if (!CARDS[id] || CARDS[id].kind !== 'once') continue;
        const left = Math.max(0, (state.packCards[id] ?? 0) - Math.max(0, Math.floor(n)));
        if (left) state.packCards[id] = left;
        else delete state.packCards[id];
      }
      // Letztes Gefecht hat gerettet: heute nicht noch einmal
      if (action.lastStand && equippedSkill(state, 'laststand') && cardKit(state, ctx.now).lastStand) state.lastStandAt = ctx.now;
      if (action.outcome === 'won') {
        // Mehr als die Gruppe (und was ein Heuler herbeiruft) kann man nicht erledigen
      const kills = Math.max(1, Math.min(c.patrol ? c.group.length + TACTICS.maxHowls : 6, Math.floor(action.kills)));
        state.health = Math.max(1, health);
        if (state.health < MAX_HEALTH) state.healthAt = ctx.now;
        state.stats.kills += kills;
        events.push({ type: 'combatWon', enemy: c.enemy, kills, weaponBroke });
        if (c.patrol) {
          state.patrols[c.patrol] = ctx.now;
          for (const [id, at] of Object.entries(state.patrols)) if (ctx.now - at > 2 * HOUR) delete state.patrols[id];
          const loot = patrolLoot(state, c, ctx, kills);
          if (c.group.includes('watcher')) watcherBonus(state, loot, ctx.now);
          scavengerBonus(state, loot, c.spot);
          events.push(loot, ...checkSets(state, ctx.now));
          break;
        }
        if (c.ambush) {
          // Überfall beim Wühlen: die Fundstelle ist schon leer, es gibt nur, was die Gegner dabeihatten
          const main = SPOT_KINDS[c.spot.kind].loot.find((l) => isMaterial(l.res))?.res ?? 'metal';
          const items: Partial<Inventory> = { [main]: kills };
          gain(state, items);
          const loot: Extract<GameEvent, { type: 'loot' }> = { type: 'loot', spotId: c.spot.id, items, bonus: false };
          if (c.group.includes('watcher')) watcherBonus(state, loot, ctx.now);
          // Im Wald: Wer den Verwilderten besiegt, findet sein Lager
          if (c.wild && c.group.includes('feral')) foeKram(state, c.group, rngFrom(ctx.worldSeed, state.playerId, 'lager', c.spot.id), loot, ['feral']);
          scavengerBonus(state, loot, c.spot);
          events.push(loot);
          break;
        }
        const loot = lootSpot(state, c.spot, ctx, { guarded: true, quality: 'good' });
        if (c.group.includes('watcher')) watcherBonus(state, loot, ctx.now);
        startDig(state, c.spot, ctx);
        loot.canDig = true;
        // Jeder weitere erledigte Gegner bringt etwas vom Haupt-Rohstoff der Fundstelle
        if (kills > 1) {
          const main = SPOT_KINDS[c.spot.kind].loot.find((l) => isMaterial(l.res))?.res ?? 'metal';
          loot.items[main] = (loot.items[main] ?? 0) + (kills - 1);
          gain(state, { [main]: kills - 1 });
        }
        scavengerBonus(state, loot, c.spot);
        events.push(loot, ...checkSets(state, ctx.now));
      } else if (action.outcome === 'spared' && c.group.includes('feverish') && used > 0) {
        // Eine gute Tat: Der Fieberkranke ist mit deiner Medizin gegangen und lässt dir etwas da
        state.health = Math.max(1, health);
        if (state.health < MAX_HEALTH) state.healthAt = ctx.now;
        state.stats.mercy = (state.stats.mercy ?? 0) + 1;
        if (c.patrol) state.patrols[c.patrol] = ctx.now;
        const loot: Extract<GameEvent, { type: 'loot' }> = { type: 'loot', spotId: c.spot.id, items: {}, bonus: false, mercy: true };
        foeKram(state, c.group, rngFrom(ctx.worldSeed, state.playerId, 'dank', c.patrol ?? c.spot.id), loot, ['feverish']);
        events.push(loot);
      } else if (action.outcome === 'lost') {
        // Niedergeschlagen: alles aus dem Rucksack ist weg. Lager zu Hause, Waffen und
        // Ausrüstung bleiben. Du kommst zu Hause wieder zu dir (das zeigt die Oberfläche).
        state.health = 0;
        state.healthAt = ctx.now;
        const dropped = { ...state.pack };
        const droppedKram = { ...state.packKram };
        const droppedCards = { ...state.packCards };
        state.pack = {};
        state.packKram = {};
        state.packCards = {};
        events.push({ type: 'combatLost', enemy: c.enemy, dropped, droppedKram, droppedCards, weaponBroke });
      } else {
        state.health = Math.max(1, health);
        if (state.health < MAX_HEALTH) state.healthAt = ctx.now;
        events.push({ type: 'fled', weaponBroke });
      }
      break;
    }

    case 'craft': {
      const def = WEAPONS[action.weapon];
      if (!hasWorkbench(state)) return reject('no_workbench');
      if (state.workshop.level < def.level) return reject('locked');
      if (!canAfford(state.inventory, def.cost)) return reject('cost');
      for (const r of RESOURCE_ORDER) state.inventory[r] -= def.cost[r] ?? 0;
      state.weapons.push({ kind: action.weapon, dur: def.dur });
      state.stats.crafted += 1;
      events.push({ type: 'crafted', weapon: action.weapon });
      break;
    }

    case 'craftCard': {
      // Einmal-Karten am Werktisch: Brandflasche, Rauchdose, Krähenfüße
      const def = CARDS[action.card];
      if (!def?.craft || def.kind !== 'once') return reject('locked');
      if (!hasWorkbench(state)) return reject('no_workbench');
      if (!canAfford(state.inventory, def.craft)) return reject('cost');
      for (const r of RESOURCE_ORDER) state.inventory[r] -= def.craft[r] ?? 0;
      state.stash[action.card] = (state.stash[action.card] ?? 0) + 1;
      addToBook(state, action.card, ctx.now);
      autoLoadout(state, action.card);
      refillPackCards(state);
      state.stats.crafted += 1;
      events.push({ type: 'crafted', card: action.card });
      break;
    }

    case 'claimSighting': {
      const s = sightingById(ctx.worldSeed, action.id);
      if (!s) return reject('not_found');
      if (ctx.now < s.from || ctx.now >= s.until) return reject('gone');
      if (state.sightings[s.id]) return reject('already');
      if (!inSightingRange(s, action.candidate, action.at, action.accuracyM)) return reject('too_far');
      // Glück mit Netz: lange nichts Seltenes? Dann jetzt (nur für dich, die anderen sehen dasselbe)
      state.pity.rare += 1;
      state.pity.legendary += 1;
      let reward: { card?: CardId; weapon?: WeaponId } = { card: s.card, weapon: s.weapon };
      let rarity: CardRarity = s.rarity;
      let pity = false;
      const want: CardRarity | null = state.pity.legendary >= SIGHT.pityLegendary && rarity !== 'legendary' ? 'legendary' : state.pity.rare >= SIGHT.pityRare && rarity === 'common' ? 'rare' : null;
      if (want) {
        const r = rngFrom(ctx.worldSeed, state.playerId, 'netz', s.id);
        const up = rewardOfRarity(want, r);
        reward = up.reward;
        rarity = up.rarity;
        pity = true;
      }
      if (rarity !== 'common') state.pity.rare = 0;
      if (rarity === 'legendary') state.pity.legendary = 0;
      state.sightings[s.id] = ctx.now;
      for (const [id, at] of Object.entries(state.sightings)) if (ctx.now - at > 2 * HOUR) delete state.sightings[id];
      const got = grantCollectible(state, reward, ctx.now, s.shiny);
      if (got) events.push({ type: 'sightingClaimed', id: s.id, ...got, rarity, shiny: s.shiny, pity });
      break;
    }

    case 'testGift': {
      // Nur zum Testen (Einstellungen → Testen): eine Sammelkarte oder Waffe geschenkt.
      // Ein Server lehnt das später ab.
      if (action.card && !CARDS[action.card]?.rarity) return reject('not_found');
      if (action.weapon && !WEAPONS[action.weapon]?.rarity) return reject('not_found');
      const got = grantCollectible(state, { card: action.card, weapon: action.weapon }, ctx.now, false);
      if (!got) return reject('nothing');
      events.push({ type: 'gifted', ...got });
      break;
    }

    case 'setLoadout': {
      // Nur zu Hause (die Oberfläche bietet es nur dort an). Was nicht in die Tasche kommt, bleibt im Lager.
      const uniq = (l: CardId[]) => [...new Set(l)];
      const pouch = action.pouch ? uniq(action.pouch) : state.loadout.pouch;
      const skills = action.skills ? uniq(action.skills) : state.loadout.skills;
      if (pouch.some((id) => CARDS[id]?.kind !== 'once' || !state.book[id])) return reject('not_found');
      if (skills.some((id) => CARDS[id]?.kind !== 'skill' || !skillOf(state, id))) return reject('not_found');
      if (pouch.length > POUCH_SLOTS || skills.length > skillSlots(state)) return reject('too_many');
      // Waffen: null = wieder automatisch die stärkste; sonst eine heile Waffe der passenden Art
      const weapon = (range: 'melee' | 'ranged'): WeaponId | undefined | false => {
        const v = action[range];
        if (v === undefined) return state.loadout[range];
        if (v === null) return undefined;
        return WEAPONS[v]?.range === range && state.weapons.some((w) => w.kind === v && w.dur > 0) ? v : false;
      };
      const melee = weapon('melee');
      const ranged = weapon('ranged');
      if (melee === false || ranged === false) return reject('not_found');
      state.loadout = { pouch, skills };
      if (melee) state.loadout.melee = melee;
      if (ranged) state.loadout.ranged = ranged;
      for (const [k, n] of Object.entries(state.packCards) as [CardId, number][]) state.stash[k] = (state.stash[k] ?? 0) + n;
      state.packCards = {};
      refillPackCards(state);
      events.push({ type: 'loadoutSet', pouch: [...pouch], skills: [...skills], ...(melee ? { melee } : {}), ...(ranged ? { ranged } : {}) });
      break;
    }

    case 'equip': {
      const def = GEAR[action.gear];
      if (!def || !state.gear.owned[action.gear]) return reject('no_gear');
      state.gear.worn[def.slot] = action.gear;
      events.push({ type: 'equipped', slot: def.slot, gear: action.gear });
      break;
    }

    case 'unequip': {
      if (!state.gear.worn[action.slot]) return { state: prev, events: [] };
      delete state.gear.worn[action.slot];
      events.push({ type: 'equipped', slot: action.slot, gear: null });
      break;
    }

    case 'heal': {
      if (state.inventory.medicine < 1) return reject('no_medicine');
      if (state.health >= MAX_HEALTH) return reject('full_health');
      const amount = Math.min(HEAL_AMOUNT, MAX_HEALTH - state.health);
      state.inventory.medicine -= 1;
      state.health += amount;
      events.push({ type: 'healed', amount });
      break;
    }

    case 'explore': {
      if (action.accuracyM > EXPLORE_MAX_ACCURACY_M) return { state: prev, events: [] };
      const res = revealAround(state.explored, action.at);
      if (!res.added) return { state: prev, events: [] };
      state.explored = res.explored;
      events.push({ type: 'explored', added: res.added });
      // Sektor-Meilensteine: einmalige Belohnung bei 25 % und 50 %
      const view = new ExploredView(state.explored);
      for (const key of res.sectors) {
        const [sx, sy] = key.split(':').map(Number);
        const pct = view.sectorProgress(sx, sy);
        const reached = state.sectors[key] ?? 0;
        for (let lvl = reached; lvl < SECTOR_LEVELS.length; lvl++) {
          if (pct < SECTOR_LEVELS[lvl].pct) break;
          state.sectors[key] = lvl + 1;
          const reward = SECTOR_LEVELS[lvl].reward;
          gain(state, reward);
          events.push({ type: 'sector', key, level: lvl + 1, reward });
        }
      }
      break;
    }

    case 'chooseSite': {
      const b = state.base;
      const site = action.site;
      if (!SITES[site]) return reject('not_found');
      const status = siteStatus(state, site);
      if (status === 'hidden') return reject('locked');
      const first = Object.keys(b.plots).length === 0;
      if (!b.plots[site]) b.plots[site] = newPlot();
      b.active = site;
      events.push({ type: 'siteChosen', site, first });
      break;
    }

    case 'reclaim': {
      const plot = activePlot(state);
      if (!plot) return reject('no_site');
      const key = sectionKey(action.sx, action.sy);
      if (plot.sections.includes(key)) return reject('nothing');
      if (pendingKeys(plot).has(`s:${key}`)) return reject('building');
      if (!canReclaim(plot, action.sx, action.sy)) return reject('not_adjacent');
      const cost = reclaimCost(plot);
      if (!canAfford(state.inventory, cost)) return reject('cost');
      for (const k of RESOURCE_ORDER) state.inventory[k] -= cost[k] ?? 0;
      if (ctx.instantBuild) plot.sections.push(key);
      else queueJob(plot, [`s:${key}`], sectionMs(plot), 'Abschnitt zurückerobern', ctx.now);
      events.push({ type: 'reclaimed', section: key, cost });
      break;
    }

    case 'clearObstacle': {
      const plot = activePlot(state);
      const idx = plotIndexOf(state);
      if (!plot || !idx) return reject('no_site');
      const o = idx.obstacles.find((x) => x.id === action.id);
      if (!o) return reject('not_found');
      if (pendingKeys(plot).has(`c:${o.id}`)) return reject('building');
      // Was dabei herausspringt, gibt es gleich; weg ist das Hindernis erst nach der Bauzeit
      const odef = OBSTACLES[o.kind];
      if (ctx.instantBuild) plot.cleared.push(o.id);
      else queueJob(plot, [`c:${o.id}`], obstacleMs(o.kind), `${odef.name} ${odef.verb.toLowerCase()}`, ctx.now);
      const reward = odef.reward;
      for (const k of RESOURCE_ORDER) state.inventory[k] += reward[k] ?? 0;
      events.push({ type: 'obstacleCleared', id: o.id, kind: o.kind, reward });
      break;
    }

    case 'place': {
      const def = FURNITURE[action.kind];
      if (!def) return reject('not_found');
      const plot = activePlot(state);
      if (!plot) return reject('no_site');
      if (!knowsBlueprint(state, action.kind)) return reject('no_blueprint');
      if (isCollectible(action.kind)) {
        if (!state.collectibles[action.kind]) return reject('no_junk');
        if (collectiblePlaced(state, action.kind)) return reject('only_one');
      }
      if (!canAfford(state.inventory, def.cost)) return reject('cost');
      const rot = ((action.rot % 4) + 4) % 4;
      const problem = placementProblem(state, action.kind, action.x, action.y, rot);
      if (problem) return reject(problem);
      for (const k of RESOURCE_ORDER) state.inventory[k] -= def.cost[k] ?? 0;
      const uid = plot.nextUid++;
      // Anlagen fangen erst an zu sammeln, wenn sie fertig gebaut sind
      const done = ctx.instantBuild ? ctx.now : queueJob(plot, [`i:${uid}`], furnitureMs(action.kind), def.name, ctx.now).endsAt;
      plot.items.push({ uid, kind: action.kind, x: action.x, y: action.y, rot, ...(def.produces ? { at: done } : {}) });
      events.push({ type: 'placed', uid, kind: action.kind });
      break;
    }

    case 'move': {
      const plot = activePlot(state);
      if (!plot) return reject('no_site');
      const it = plot.items.find((i) => i.uid === action.uid);
      if (!it) return reject('not_found');
      const rot = ((action.rot % 4) + 4) % 4;
      const problem = placementProblem(state, it.kind, action.x, action.y, rot, it.uid);
      if (problem) return reject(problem);
      it.x = action.x;
      it.y = action.y;
      it.rot = rot;
      events.push({ type: 'moved', uid: it.uid });
      break;
    }

    case 'store': {
      const plot = activePlot(state);
      if (!plot) return reject('no_site');
      const it = plot.items.find((i) => i.uid === action.uid);
      if (!it) return reject('not_found');
      // Einlagern gibt alles zurück: Umräumen soll nie etwas kosten.
      const refund = storeItem(state, it);
      // Was eine Anlage schon gesammelt hat, geht nicht verloren
      const ready = itemYield(it, ctx.now);
      const prod = FURNITURE[it.kind].produces;
      if (ready && prod) {
        state.inventory[prod.res] += ready;
        refund[prod.res] = (refund[prod.res] ?? 0) + ready;
      }
      plot.items = plot.items.filter((i) => i.uid !== it.uid);
      // War es noch im Bau: aus der Bauliste, der Rest rückt nach
      unqueue(plot, [`i:${it.uid}`], ctx.now);
      events.push({ type: 'stored', uid: it.uid, refund });
      break;
    }

    case 'buildWalls': {
      const plot = activePlot(state);
      const idx = plotIndexOf(state);
      if (!plot || !idx) return reject('no_site');
      const piece = action.piece;
      const def = PIECES[piece as WallId];
      if (!def || (def.group !== 'wall' && def.group !== 'fence')) return reject('not_found');
      if (!knowsBlueprint(state, piece)) return reject('no_blueprint');
      const edges = action.shape === 'room' ? roomEdges(action.x1, action.y1, action.x2, action.y2) : lineEdges(action.x1, action.y1, action.x2, action.y2);
      if (!edges.length) return reject('nothing');
      const plan = planWalls(idx, plot, piece, edges);
      if (plan.blocked.length) return reject('blocked');
      if (!plan.keys.length) return reject('nothing');
      if (!planAffordable(state.inventory, plan)) return reject('cost');
      // Andere Art (Wand -> Zaun): eine Öffnung im Bau fällt mit weg
      const lostOpenings = plan.keys.filter((k) => plot.walls[k] && PIECES[plot.walls[k].k].group !== def.group).map((k) => `o:${k}`);
      const stored = applyPlan(state, plot, plan, (k) => {
        const old = plot.walls[k];
        const keep = old && PIECES[old.k].group === def.group ? old.o : undefined;
        plot.walls[k] = keep ? { k: piece, o: keep } : { k: piece };
      });
      unqueue(plot, [...plan.keys.map((k) => `w:${k}`), ...lostOpenings, ...plan.store.map((u) => `i:${u}`)], ctx.now);
      if (!ctx.instantBuild) queueJob(plot, plan.keys.map((k) => `w:${k}`), pieceMs(piece), def.name, ctx.now);
      events.push({ type: 'constructed', layer: 'walls', count: plan.keys.length, cost: plan.cost, refund: sumInv(plan.refund, stored), stored: new Set(plan.store).size });
      break;
    }

    case 'setOpening': {
      const plot = activePlot(state);
      const idx = plotIndexOf(state);
      if (!plot || !idx) return reject('no_site');
      const piece = action.piece;
      const def = PIECES[piece as OpeningId];
      if (!def || def.group !== 'opening') return reject('not_found');
      if (!knowsBlueprint(state, piece)) return reject('no_blueprint');
      const edges = lineEdges(action.x1, action.y1, action.x2, action.y2);
      if (!edges.length) return reject('nothing');
      const plan = planOpening(idx, plot, piece, edges);
      if (plan.blocked.length) return reject('no_wall');
      if (!plan.keys.length) return reject('nothing');
      if (!planAffordable(state.inventory, plan)) return reject('cost');
      const stored = applyPlan(state, plot, plan, (k) => {
        plot.walls[k] = { ...plot.walls[k], o: piece };
      });
      unqueue(plot, [...plan.keys.map((k) => `o:${k}`), ...plan.store.map((u) => `i:${u}`)], ctx.now);
      if (!ctx.instantBuild) queueJob(plot, plan.keys.map((k) => `o:${k}`), pieceMs(piece), def.name, ctx.now);
      events.push({ type: 'constructed', layer: 'openings', count: plan.keys.length, cost: plan.cost, refund: sumInv(plan.refund, stored), stored: new Set(plan.store).size });
      break;
    }

    case 'paint': {
      const plot = activePlot(state);
      const idx = plotIndexOf(state);
      if (!plot || !idx) return reject('no_site');
      const piece = action.piece;
      const def = PIECES[piece];
      const group = action.layer === 'floors' ? 'floor' : 'roof';
      if (!def || def.group !== group) return reject('not_found');
      if (!knowsBlueprint(state, piece)) return reject('no_blueprint');
      // Hindernisse und gesperrte Felder werden einfach ausgelassen
      const plan = planPaint(idx, plot, action.layer, piece as FloorId | RoofId, rectCells(action.x1, action.y1, action.x2, action.y2));
      if (!plan.keys.length) return reject(plan.blocked.length ? 'blocked' : 'nothing');
      if (!planAffordable(state.inventory, plan)) return reject('cost');
      const layer = action.layer;
      applyPlan(state, plot, plan, (k) => {
        (plot[layer] as Record<string, string>)[k] = piece;
      });
      const pre = layer === 'floors' ? 'f:' : 'r:';
      unqueue(plot, plan.keys.map((k) => pre + k), ctx.now);
      if (!ctx.instantBuild) queueJob(plot, plan.keys.map((k) => pre + k), pieceMs(piece), def.name, ctx.now);
      events.push({ type: 'constructed', layer, count: plan.keys.length, cost: plan.cost, refund: plan.refund, stored: 0 });
      break;
    }

    case 'demolish': {
      const plot = activePlot(state);
      const idx = plotIndexOf(state);
      if (!plot || !idx) return reject('no_site');
      const { layer, shape, x1, y1, x2, y2 } = action;
      const keys =
        layer === 'walls' || layer === 'openings'
          ? shape === 'room'
            ? roomEdges(x1, y1, x2, y2)
            : lineEdges(x1, y1, x2, y2)
          : rectCells(x1, y1, x2, y2).map(([x, y]) => cellKey(x, y));
      const plan = planDemolish(idx, plot, layer, keys);
      if (!plan.keys.length) return reject('nothing');
      const stored = applyPlan(state, plot, plan, (k) => {
        if (layer === 'walls') delete plot.walls[k];
        else if (layer === 'openings') plot.walls[k] = { k: plot.walls[k].k };
        else delete plot[layer][k];
      });
      // Abreißen geht sofort; was noch im Bau war, fällt aus der Bauliste (Material kommt ganz zurück)
      const gone = plan.keys.flatMap((k) => (layer === 'walls' ? [`w:${k}`, `o:${k}`] : layer === 'openings' ? [`o:${k}`] : [`${layer === 'floors' ? 'f' : 'r'}:${k}`]));
      unqueue(plot, [...gone, ...plan.store.map((u) => `i:${u}`)], ctx.now);
      events.push({ type: 'demolished', layer, count: plan.keys.length, refund: sumInv(plan.refund, stored), stored: new Set(plan.store).size });
      break;
    }

    case 'dismantle': {
      if (!KRAM[action.kram]) return reject('not_found');
      if (!hasWorkbench(state)) return reject('no_workbench');
      if (!(state.kram[action.kram] ?? 0)) return reject('no_junk');
      const ws = state.workshop;
      if (ws.jobs.length >= workbenchSlots(state)) return reject('queue_full');
      // Der Werktisch arbeitet eins nach dem anderen ab, in echter Zeit
      const last = ws.jobs.length ? ws.jobs[ws.jobs.length - 1].endsAt : 0;
      const endsAt = Math.max(ctx.now, last) + dismantleMs(state, action.kram);
      takeKram(state.kram, action.kram);
      ws.jobs.push({ kram: action.kram, endsAt });
      events.push({ type: 'dismantleQueued', kram: action.kram, endsAt });
      break;
    }

    case 'collect': {
      if (!hasWorkbench(state)) return reject('no_workbench');
      const { items, count } = readyParts(state, ctx.now);
      if (!count) return reject('nothing');
      state.workshop.jobs = state.workshop.jobs.filter((j) => j.endsAt > ctx.now);
      for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;
      state.stats.dismantled += count;
      events.push({ type: 'collected', items, count });
      break;
    }

    case 'claimGoal': {
      const g = GOALS.find((x) => x.id === action.goal);
      if (!g) return reject('not_found');
      if (state.goals[g.id]) return reject('already_built');
      const p = g.progress(state);
      if (p.have < p.need) return reject('not_done');
      state.goals[g.id] = ctx.now;
      const items = { ...g.reward };
      for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;
      let blueprint: BlueprintId | undefined;
      if (g.blueprint && !state.blueprints[g.blueprint]) {
        blueprint = g.blueprint;
        state.blueprints[blueprint] = ctx.now;
      }
      events.push({ type: 'goalClaimed', goal: g.id, items, blueprint });
      break;
    }

    case 'openCache': {
      const c = state.caches.find((x) => x.id === action.id);
      if (!c) return reject('not_found');
      const slack = Math.min(Math.max(action.accuracyM, 0), 20);
      if (distanceM(action.at, c.spot.pos) > CACHE.digM + slack) return reject('too_far');
      state.caches = state.caches.filter((x) => x.id !== c.id);
      const r = rngFrom(ctx.worldSeed, state.playerId, 'versteck', c.id);
      const def = SPOT_KINDS[c.spot.kind];
      // Zettel-Kette: unterwegs liegt der nächste Zettel, am Ende das Beste
      const chainNext = c.chain && c.chain.step < c.chain.of;
      const chainDone = !!c.chain && !chainNext;
      const factor = chainDone ? CHAIN.finalFactor : CACHE.factor;
      const items: Partial<Inventory> = {};
      for (let i = 0; i < CACHE.rolls; i++) {
        const rule = def.loot[Math.floor(r() * def.loot.length)];
        items[rule.res] = (items[rule.res] ?? 0) + randInt(r, rule.min, rule.max) * factor;
      }
      gain(state, items);
      const kramList = def.kram.length ? def.kram : SPOT_KINDS.car.kram;
      const kram = pickWeighted(r, kramList);
      state.packKram[kram] = (state.packKram[kram] ?? 0) + 1;
      let collectible: CollectibleId | undefined;
      const missingC = COLLECTIBLE_ORDER.filter((x) => !state.collectibles[x]);
      if (missingC.length && (chainDone || r() < CACHE.collectChance)) {
        collectible = missingC[Math.floor(r() * missingC.length)];
        state.collectibles[collectible] = ctx.now;
      }
      let blueprint: BlueprintId | undefined;
      const unknown = [...new Set(Object.values(BLUEPRINT_SOURCES).flat())].filter((id) => !state.blueprints[id]);
      if (unknown.length && r() < CACHE.blueprintChance) {
        blueprint = unknown[Math.floor(r() * unknown.length)];
        state.blueprints[blueprint] = ctx.now;
      }
      state.stats.caches += 1;
      let next: string | undefined;
      if (chainNext && c.chain) {
        const rn = rngFrom(ctx.worldSeed, state.playerId, 'kette', c.id);
        next = makeCache(state, ctx, c.spot.pos, `Zettel aus dem Versteck (${c.chain.step}/${c.chain.of})`, 'note', rn, CHAIN.minM, CHAIN.maxM, { chain: { step: c.chain.step + 1, of: c.chain.of } })?.id;
      }
      events.push({ type: 'cacheOpened', id: c.id, items, kram, collectible, blueprint, next, chainDone: chainDone || undefined }, ...checkSets(state, ctx.now));
      break;
    }

    case 'listenRadio': {
      if (!hasItem(state, 'radioSet')) return reject('no_radio');
      if (radioReadyIn(state, ctx.now) > 0) return reject('radio_quiet');
      const n = Math.floor(state.radioAt / HOUR);
      const r = rngFrom(ctx.worldSeed, state.playerId, 'funk', n, Math.floor(ctx.now / HOUR));
      state.radioAt = ctx.now;
      const line = Math.floor(r() * RADIO_LINES.length);
      const cache = state.caches.length < CACHE.max ? makeCache(state, ctx, action.at, 'Funkspruch auf Kanal 4', 'radio', r, RADIO.minM, RADIO.maxM) : null;
      events.push({ type: 'radio', line, cache: cache?.id });
      break;
    }

    case 'cook': {
      if (!hasItem(state, 'stove')) return reject('no_stove');
      if (!canAfford(state.inventory, COOK.cost)) return reject('cost');
      for (const k of RESOURCE_ORDER) state.inventory[k] -= COOK.cost[k] ?? 0;
      const before = currentHealth(state, ctx.now);
      state.health = MAX_HEALTH;
      state.healthAt = ctx.now;
      state.fedUntil = ctx.now + COOK.fedH * HOUR;
      state.stats.cooked += 1;
      events.push({ type: 'cooked', until: state.fedUntil, healed: MAX_HEALTH - before });
      break;
    }

    case 'upgradeWorkbench': {
      if (!hasWorkbench(state)) return reject('no_workbench');
      const next = WORKBENCH_LEVELS[state.workshop.level];
      if (!next) return reject('max_level');
      const plot = activePlot(state);
      if (!plot) return reject('no_site');
      if (pendingKeys(plot).has('u:workbench')) return reject('building');
      if (!canAfford(state.inventory, next.cost)) return reject('cost');
      for (const k of RESOURCE_ORDER) state.inventory[k] -= next.cost[k] ?? 0;
      // Der Umbau braucht Zeit; bis dahin arbeitet der Tisch auf der alten Stufe weiter
      if (ctx.instantBuild) state.workshop.level += 1;
      else queueJob(plot, ['u:workbench'], workbenchMs(state.workshop.level), next.name, ctx.now);
      events.push({ type: 'workbenchUpgraded', level: state.workshop.level + (ctx.instantBuild ? 0 : 1) });
      break;
    }

    case 'harvest': {
      const plot = activePlot(state);
      if (!plot) return reject('no_site');
      const it = plot.items.find((i) => i.uid === action.uid);
      const prod = it ? FURNITURE[it.kind].produces : undefined;
      if (!it || !prod || it.at === undefined) return reject('not_found');
      const n = itemYield(it, ctx.now);
      if (n <= 0) return reject('nothing');
      // Volle Anlage: Uhr neu starten. Sonst den angefangenen Rest behalten.
      it.at = n >= prod.cap ? ctx.now : it.at + n * prod.everyH * HOUR;
      state.inventory[prod.res] += n;
      events.push({ type: 'harvested', items: { [prod.res]: n } });
      break;
    }

    case 'unpack': {
      // Karten, die nicht in die Tasche gehören, kommen beim Auspacken ins Lager
      const extraCards = (Object.entries(state.packCards) as [CardId, number][]).some(([id, n]) => n > 0 && (n > ONCE_CARRY || !state.loadout.pouch.includes(id)));
      if (!packCount(state) && !extraCards) return reject('nothing');
      const items = { ...state.pack };
      const kram = { ...state.packKram };
      const before = { ...state.packCards };
      for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;
      for (const [k, n] of Object.entries(kram) as [KramId, number][]) state.kram[k] = (state.kram[k] ?? 0) + n;
      // Einmal-Karten ins Lager, dann gleich wieder bis zu 3 je Sorte einpacken
      for (const [k, n] of Object.entries(before) as [CardId, number][]) state.stash[k] = (state.stash[k] ?? 0) + n;
      state.pack = {};
      state.packKram = {};
      state.packCards = {};
      refillPackCards(state);
      // Gemeldet wird nur, was wirklich im Lager geblieben ist
      const cards: Partial<Record<CardId, number>> = {};
      for (const [k, n] of Object.entries(before) as [CardId, number][]) if (n - (state.packCards[k] ?? 0) > 0) cards[k] = n - (state.packCards[k] ?? 0);
      state.stats.unpacks += 1;
      events.push({ type: 'unpacked', items, kram, cards: Object.keys(cards).length ? cards : undefined });
      break;
    }
  }

  state.lastActiveAt = ctx.now;
  events.push(...builtEvents);
  return { state, events };
}

// --- Helfer ---------------------------------------------------------------------------

/** Erholung seit healthAt in den Spielstand übernehmen. */
function settleHealth(state: PlayerState, now: number) {
  if (state.health >= MAX_HEALTH) {
    state.health = MAX_HEALTH;
    state.healthAt = now;
    return;
  }
  const ms = regenMs(state);
  const gained = Math.floor((now - state.healthAt) / ms);
  if (gained <= 0) return;
  state.health = Math.min(MAX_HEALTH, state.health + gained);
  state.healthAt = state.health >= MAX_HEALTH ? now : state.healthAt + gained * ms;
}

function inRange(state: PlayerState, spot: Spot, at: Spot['pos'], accuracyM: number) {
  const slack = Math.min(Math.max(accuracyM, 0), MAX_GPS_SLACK_M);
  return distanceM(at, spot.pos) <= searchRangeM(state) + slack;
}

function sumInv(a: Partial<Inventory>, b: Partial<Inventory>): Partial<Inventory> {
  const out: Partial<Inventory> = {};
  for (const k of RESOURCE_ORDER) {
    const v = (a[k] ?? 0) + (b[k] ?? 0);
    if (v) out[k] = v;
  }
  return out;
}

/** Beute für eine Fundstelle würfeln und gutschreiben. */
/**
 * Kurz-Kennung einer Fundstelle für die Erstfund-Liste. Wandernde Fundstellen zählen
 * pro Kachel: Wer einmal in der Ecke gesucht hat, kennt sie, auch wenn dort inzwischen
 * etwas anderes liegt.
 */
export function spotKey(id: string): number {
  const cell = /^(g:\d+:-?\d+:-?\d+):-?\d+:\d+$/.exec(id);
  return hashString(cell ? cell[1] : id) % 4294967296;
}

/** Erster Besuch hier? (merkt ihn sich gleich) */
function firstVisit(state: PlayerState, id: string): boolean {
  const k = spotKey(id);
  if (state.seen.includes(k)) return false;
  state.seen.push(k);
  if (state.seen.length > 20000) state.seen.splice(0, state.seen.length - 20000);
  return true;
}

/** Nach dem Durchsuchen darf man ein paar Minuten weiter wühlen. */
function startDig(state: PlayerState, spot: Spot, ctx: RuleContext) {
  state.dig = { spot, round: 0, noise: 0, until: ctx.now + DIG.minutes * 60_000, window: guardWindow(spot, ctx.now) };
}

/** Wer bewacht eine Fundstelle mit? (immer gleich für dieselbe Wache) */
/** Besondere Beute vom Bleichen Wächter: Dinge aus den Kellern, beim ersten Mal sein Tagebuch. */
/** Fähigkeit „Plündererin“: nach einem Sieg pro Stufe ein Stück mehr vom Haupt-Rohstoff. */
function scavengerBonus(state: PlayerState, loot: Extract<GameEvent, { type: 'loot' }>, spot: Spot) {
  const lvl = equippedSkill(state, 'scavenger');
  if (!lvl) return;
  const main = SPOT_KINDS[spot.kind]?.loot.find((l) => isMaterial(l.res))?.res ?? 'metal';
  loot.items[main] = (loot.items[main] ?? 0) + lvl;
  gain(state, { [main]: lvl });
}

function watcherBonus(state: PlayerState, loot: Extract<GameEvent, { type: 'loot' }>, now: number) {
  gain(state, WATCHER_LOOT.items);
  for (const [k, v] of Object.entries(WATCHER_LOOT.items) as [Resource, number][]) loot.items[k] = (loot.items[k] ?? 0) + v;
  if (!loot.kram) {
    loot.kram = WATCHER_LOOT.kram;
    state.packKram[WATCHER_LOOT.kram] = (state.packKram[WATCHER_LOOT.kram] ?? 0) + 1;
  }
  if (!state.collection[WATCHER_LOOT.memento] && !loot.memento) {
    loot.memento = WATCHER_LOOT.memento;
    state.collection[WATCHER_LOOT.memento] = now;
  }
}

/** Der Haupt-Gegner einer Gruppe für Meldungen und Erinnerungsstücke (die Wirte zählen als Wandler). */
export function leadEnemy(group: FoeKind[]): EnemyId {
  return group.find((k): k is EnemyId => k in ENEMIES) ?? 'walker';
}

export function encounter(seed: string, playerId: string, spot: Spot, window: number, enemy: EnemyId, night: boolean): FoeKind[] {
  const r = rngFrom(seed, playerId, 'gruppe', spot.id, window);
  const g: FoeKind[] = [enemy];
  // Der Bleiche Wächter jagt allein
  if (enemy === 'watcher') return g;
  if (enemy === 'walker' && r() < (night ? 0.6 : 0.35)) g.push('walker');
  if (enemy === 'crawler' && r() < 0.6) g.push('crawler');
  if (enemy === 'brute' && r() < 0.4) g.push('walker');
  // Heuler sind eigentlich Stadtwesen, nur einzelne verirren sich aufs Land
  if (r() < (spot.source === 'poi' ? 0.15 : 0.05) + (night ? 0.1 : 0)) g.push('screamer');
  return g;
}

/** Wasser und Essen gibt es seltener, außer sie sind das Wichtigste des Ortes (erste Zeile, z. B. Brunnen). */
function lootChance(loot: readonly { res: Resource; chance: number }[], rule: { res: Resource; chance: number }): number {
  return (rule.res === 'food' || rule.res === 'water') && rule !== loot[0] ? rule.chance * LOOT.foodWaterChance : rule.chance;
}

/** Menge eines Rohstoffs: Grundmenge kleiner (Medizin nicht), mindestens 1. */
function lootAmount(res: Resource, n: number, factor = 1): number {
  return Math.max(1, Math.round(n * (res === 'medicine' ? 1 : LOOT.base) * factor));
}

function lootSpot(state: PlayerState, spot: Spot, ctx: RuleContext, o: { guarded: boolean; quality: Quality }): Extract<GameEvent, { type: 'loot' }> {
  const guarded = o.guarded;
  const def = SPOT_KINDS[spot.kind];
  const r = rngFrom(ctx.worldSeed, state.playerId, spot.id, guardWindow(spot, ctx.now));
  const perks = basePerks(state);
  const q = LOOT_QUALITY[o.quality] ?? LOOT_QUALITY.good;
  const tier = regionTier(state, spot.pos);
  const luck = q.luck + perks.luck + TIER.luck[tier];
  const first = firstVisit(state, spot.id);
  const items: Partial<Inventory> = {};
  for (const rule of def.loot) {
    if (r() < lootChance(def.loot, rule)) items[rule.res] = (items[rule.res] ?? 0) + randInt(r, rule.min, rule.max);
  }
  // Nie ganz leer ausgehen.
  if (Object.keys(items).length === 0) items[def.loot[0].res] = def.loot[0].min;
  const night = dayPhase(spot.pos, ctx.now) === 'night';
  const cart = !guarded && !!cartOf(ctx.worldSeed, spot, ctx.now);
  const fed = isFed(state, ctx.now);
  // Was die Menge noch verändert (Kevin 23.10.: keine Boni mehr für Erstfund, Nacht, Wache, Minispiel
  // und Neuland): nur noch Händlerkiste, satt (Eintopf) und die Oase zu Hause
  const factor = perks.lootFactor * (cart ? CART.lootFactor : 1) * (fed ? 1 + COOK.lootBonus : 1);
  for (const k of Object.keys(items) as Resource[]) items[k] = lootAmount(k, items[k] ?? 0, factor);
  // Vorgeschichte
  let perk: Resource | undefined;
  const bonusRes = BACKGROUNDS[state.character.background].bonusRes;
  if (bonusRes && r() < PERK_CHANCE) {
    items[bonusRes] = (items[bonusRes] ?? 0) + 1;
    perk = bonusRes;
  }
  // Rückkehr-Bonus
  const bonus = state.returnBonus;
  if (bonus) for (const k of Object.keys(items) as Resource[]) items[k] = (items[k] ?? 0) * 2;

  gain(state, items);

  // Kram (in den Rucksack)
  let kram: KramId | undefined;
  if (def.kram.length && r() < Math.min(0.95, def.kramChance + (guarded ? GUARD_KRAM_BONUS : 0) + (cart ? CART.kramBonus : 0) + luck * LUCK_KRAM)) {
    kram = pickWeighted(r, def.kram);
    state.packKram[kram] = (state.packKram[kram] ?? 0) + 1;
  }

  // Sammelstück (jedes nur einmal im Spiel)
  let collectible: CollectibleId | undefined;
  const missingC = def.collectibles.filter((c) => !state.collectibles[c]);
  const cChance = COLLECT_CHANCE[spot.source] + (guarded ? GUARD_COLLECT_BONUS : 0) + (cart ? CART.collectBonus : 0) + luck * LUCK_COLLECT;
  const rollC = r();
  if (missingC.length && rollC < cChance) {
    collectible = missingC[Math.floor(r() * missingC.length)];
    state.collectibles[collectible] = ctx.now;
  }

  // Erinnerungsstück
  let memento: string | undefined;
  const missing = MEMENTOS.filter((m) => !m.from && !state.collection[m.id]);
  const chance = def.mementoChance + (guarded ? GUARD_MEMENTO_BONUS : 0) + TIER.mementoBonus[tier];
  if (state.stats.searches === 0 && !state.collection[FIRST_MEMENTO]) memento = FIRST_MEMENTO;
  else if (missing.length && r() < chance) memento = missing[Math.floor(r() * missing.length)].id;
  if (memento) state.collection[memento] = ctx.now;

  // Bauplan
  let blueprint: BlueprintId | undefined;
  const sources = (BLUEPRINT_SOURCES[spot.kind] ?? []).filter((id) => !state.blueprints[id]);
  if (sources.length && r() < BLUEPRINT_CHANCE[spot.source]) {
    blueprint = sources[Math.floor(r() * sources.length)];
    state.blueprints[blueprint] = ctx.now;
  }

  // Ausrüstung (eigener Zufall, damit sich die übrige Beute nicht verschiebt)
  let gear: GearId | undefined;
  const rg = rngFrom(ctx.worldSeed, state.playerId, 'ausruestung', spot.id, guardWindow(spot, ctx.now));
  const gearCands = GEAR_ORDER.filter((id) => GEAR[id].findAt.includes(spot.kind) && !state.gear.owned[id]);
  if (gearCands.length && rg() < GEAR_CHANCE[spot.source]) {
    gear = gearCands[Math.floor(rg() * gearCands.length)];
    state.gear.owned[gear] = ctx.now;
  }

  // Sammelkarte oder gefundene Waffe (eigener Zufall). Bewachte Orte geben mehr her.
  let card: CardId | undefined;
  let foundWeapon: WeaponId | undefined;
  const rk = rngFrom(ctx.worldSeed, state.playerId, 'karten', spot.id, guardWindow(spot, ctx.now));
  for (const [what, p] of CARD_LOOT[spot.kind] ?? []) {
    if (rk() >= p * (guarded ? 1.5 : 1)) continue;
    if (what.startsWith('w:')) {
      foundWeapon = what.slice(2) as WeaponId;
      gainWeapon(state, foundWeapon);
      addToBook(state, what, ctx.now);
    } else {
      card = what as CardId;
      state.packCards[card] = (state.packCards[card] ?? 0) + 1;
      addToBook(state, card, ctx.now);
    }
    break;
  }

  // Munition (eigener Zufall, damit sich die übrige Beute nicht verschiebt). Bewachte Orte geben mehr her.
  const drop: Partial<Record<AmmoId, number>> = {};
  const ra = rngFrom(ctx.worldSeed, state.playerId, 'munition', spot.id, guardWindow(spot, ctx.now));
  for (const [a, p, min, max] of AMMO_LOOT[spot.kind] ?? []) {
    const hit = ra() < p * (guarded ? 1.5 : 1);
    const n = randInt(ra, min, max);
    if (hit) drop[a] = (drop[a] ?? 0) + n;
  }
  for (const [a, n] of Object.entries(drop) as [AmmoId, number][]) state.ammo[a] = (state.ammo[a] ?? 0) + n;
  // Zum Anzeigen: dazu die Schuss in einer gefundenen Schusswaffe (gainWeapon hat sie schon gutgeschrieben)
  const ammo: Partial<Record<AmmoId, number>> = { ...drop };
  const gunDef = foundWeapon ? WEAPONS[foundWeapon] : undefined;
  if (gunDef?.ammo && gunDef.loaded) ammo[gunDef.ammo] = (ammo[gunDef.ammo] ?? 0) + gunDef.loaded;
  if (gunDef?.ammo2 && gunDef.loaded2) ammo[gunDef.ammo2] = (ammo[gunDef.ammo2] ?? 0) + gunDef.loaded2;

  // Lageplan für einen neuen Schauplatz (erst, wenn man schon irgendwo wohnt)
  let site: SiteId | undefined;
  if (state.base.active) {
    const cands = SITE_ORDER.filter((id) => !state.base.plots[id] && !state.base.found[id] && SITES[id].findAt.includes(spot.kind));
    if (cands.length && r() < SITE_PLAN_CHANCE[spot.source]) {
      site = cands[Math.floor(r() * cands.length)];
      state.base.found[site] = ctx.now;
    }
  }

  // Neuer Ortstyp fürs Fundbuch: ein kleiner Bonus vom Haupt-Rohstoff
  const newKind = !state.places[spot.kind];
  if (newKind) {
    state.places[spot.kind] = ctx.now;
    const main = def.loot.find((l) => isMaterial(l.res))?.res ?? def.loot[0].res;
    items[main] = (items[main] ?? 0) + NEW_PLACE_BONUS;
    gain(state, { [main]: NEW_PLACE_BONUS });
  }

  // Besonderer Ort zum ersten Mal: sein Erinnerungsstück (gibt es nur hier)
  const discovery = spot.source === 'special' && !state.discovered[spot.id];
  if (discovery) {
    state.discovered[spot.id] = ctx.now;
    const own = MEMENTOS.find((m) => m.from === spot.kind && !state.collection[m.id]);
    if (own && !memento) {
      memento = own.id;
      state.collection[own.id] = ctx.now;
    }
  }

  // Hinweis auf ein Versteck (eigener Zufall, damit sich die übrige Beute nicht verschiebt)
  let clue: string | undefined;
  const rc = rngFrom(ctx.worldSeed, state.playerId, 'zettel', spot.id, guardWindow(spot, ctx.now));
  if (discovery && spot.kind === 'camp' && state.caches.length < CACHE.max) {
    // Im Zeltlager liegt immer eine Karte mit Kreuzen: der Anfang einer Kette
    clue = makeCache(state, ctx, spot.pos, spot.name, 'note', rc, CHAIN.minM, CHAIN.maxM, { chain: { step: 1, of: CHAIN.steps } })?.id;
  } else if (state.caches.length < CACHE.max && rc() < CACHE.clueChance + (first ? CACHE.firstBonus : 0) + (cart ? 0.1 : 0)) {
    const chain = rc() < CHAIN.share ? { step: 1, of: CHAIN.steps } : undefined;
    clue = makeCache(state, ctx, spot.pos, spot.name, 'note', rc, CACHE.minM, CACHE.maxM, { chain })?.id;
  } else if (state.caches.length < CACHE.max && rc() < (spot.kind === 'heli' || spot.kind === 'convoy' || spot.kind === 'camp' ? TRACKS.specialChance : TRACKS.chance)) {
    // Spuren auf dem Boden führen zu einem Versteck
    clue = makeCache(state, ctx, spot.pos, spot.name, 'tracks', rc, TRACKS.minM, TRACKS.maxM, { tracks: true })?.id;
  }

  state.spots[spot.id] = ctx.now;
  state.returnBonus = false;
  state.stats.searches += 1;
  pruneSpots(state, ctx.now);
  return {
    type: 'loot',
    spotId: spot.id,
    items,
    kram,
    collectible,
    memento,
    bonus,
    perk,
    night,
    blueprint,
    gear,
    site,
    card,
    weapon: foundWeapon,
    ammo: Object.keys(ammo).length ? ammo : undefined,
    quality: o.quality,
    first: first || undefined,
    canDig: !guarded || undefined,
    cart: cart || undefined,
    fed: fed || undefined,
    clue,
    newKind: newKind || undefined,
    discovery: discovery || undefined,
    tier: tier || undefined,
  };
}

/** Legt ein Versteck an einer Fundstelle in der Umgebung an (oder null, wenn keine passt). */
function makeCache(
  state: PlayerState,
  ctx: RuleContext,
  around: LatLon,
  fromName: string,
  via: Cache['via'],
  r: () => number,
  minM: number,
  maxM: number,
  o: { chain?: Cache['chain']; tracks?: boolean } = {},
): Cache | null {
  const taken = new Set(state.caches.map((c) => c.spot.id));
  const cands = gridSpotsAround(ctx.worldSeed, around, maxM, ctx.now).filter((sp) => !taken.has(sp.id) && distanceM(around, sp.pos) >= minM && !ctx.blocked?.(sp.pos));
  if (!cands.length) return null;
  const spot = cands[Math.floor(r() * cands.length)];
  // Die Mitte des Suchkreises liegt daneben, das Versteck irgendwo darin
  const a = r() * Math.PI * 2;
  const d = CACHE.areaM * (0.25 + r() * 0.45);
  const cache: Cache = { id: `v:${spot.id}:${ctx.now}`, spot, center: offsetM(spot.pos, Math.cos(a) * d, Math.sin(a) * d), fromName, fromPos: around, at: ctx.now, via };
  if (o.chain) cache.chain = o.chain;
  if (o.tracks) {
    // Spuren: eine leicht wackelige Linie vom Fundort bis kurz vors Versteck, kleiner Suchkreis
    const end = offsetM(spot.pos, Math.cos(a) * TRACKS.areaM * 0.3, Math.sin(a) * TRACKS.areaM * 0.3);
    const kx = 111320 * Math.cos((around.lat * Math.PI) / 180);
    const dx = (end.lon - around.lon) * kx;
    const dy = (end.lat - around.lat) * 111320;
    const len = Math.hypot(dx, dy) || 1;
    const trail: LatLon[] = [around];
    for (let i = 1; i < 6; i++) {
      const f = i / 6;
      const side = (r() - 0.5) * Math.min(40, len * 0.15);
      trail.push(offsetM(around, dx * f + (-dy / len) * side, dy * f + (dx / len) * side));
    }
    trail.push(end);
    cache.trail = trail;
    cache.center = end;
    cache.areaM = TRACKS.areaM;
  }
  state.caches.push(cache);
  return cache;
}

/** Unterwegs Gefundenes: Vorräte gleich in die Taschen, Rohstoffe in den Rucksack. */
function gain(state: PlayerState, items: Partial<Inventory>) {
  for (const k of Object.keys(items) as Resource[]) {
    const n = items[k] ?? 0;
    if (!n) continue;
    if (isMaterial(k)) state.pack[k] = (state.pack[k] ?? 0) + n;
    else state.inventory[k] += n;
  }
}

/** Neu vollständige Sets belohnen: Bauplan (falls unbekannt) und Rohstoffe ins Lager. */
export function checkSets(state: PlayerState, now: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (const id of SET_ORDER) {
    const set = SETS[id];
    if (state.sets[id] || !set.items.every((c) => state.collectibles[c])) continue;
    state.sets[id] = now;
    let blueprint: BlueprintId | undefined;
    if (!knowsBlueprint(state, set.blueprint)) {
      blueprint = set.blueprint;
      state.blueprints[blueprint] = now;
    }
    for (const k of Object.keys(set.reward) as Resource[]) state.inventory[k] += set.reward[k] ?? 0;
    out.push({ type: 'setCompleted', set: id, items: { ...set.reward }, blueprint });
  }
  return out;
}

function takeKram(bag: KramBag, kram: KramId) {
  const n = (bag[kram] ?? 0) - 1;
  if (n > 0) bag[kram] = n;
  else delete bag[kram];
}

/** Bei einer Niederlage fällt etwas aus dem Rucksack. Nie viel, nie der Bus. */
/**
 * Grid-Fundstellen lassen sich aus ihrer ID nachrechnen, also prüfen wir sie.
 * POI-Fundstellen kommen aus den Kartendaten; im Mehrspieler prüft sie der Server
 * gegen seine eigene OSM-Liste.
 */
function verifySpot(spot: Spot, ctx: RuleContext): Spot | null {
  if (spot.source === 'special' && spot.id.startsWith('e:')) {
    const drop = resolveDropSpot(ctx.worldSeed, spot.id, ctx.now);
    if (!drop || distanceM(drop.pos, spot.pos) > 1) return null;
    return drop;
  }
  if (spot.source === 'special') {
    const real = resolveSpecialSpot(ctx.worldSeed, spot.id);
    if (!real || real.kind !== spot.kind || distanceM(real.pos, spot.pos) > 1) return null;
    return real;
  }
  if (spot.source === 'grid') {
    const real = resolveGridSpot(ctx.worldSeed, spot.id);
    if (!real || real.kind !== spot.kind || distanceM(real.pos, spot.pos) > 1) return null;
    // Längst weitergewandert? Dann liegt dort nichts mehr.
    if (!gridSpotAlive(ctx.worldSeed, spot.id, ctx.now)) return null;
    return real;
  }
  if (!spot.id.startsWith('p:') || !SPOT_KINDS[spot.kind]) return null;
  return spot;
}

/**
 * Liegt die Stelle in einer Zone, in der man gerade nicht suchen darf?
 * Sperrgebiet: gar nicht. Staubsturm: nur mit Atemschutz.
 */
function zoneRule(state: PlayerState, p: LatLon, ctx: RuleContext): RejectReason | null {
  for (const z of zonesAt(ctx.worldSeed, p, ctx.now, ctx.blocked)) {
    if (z.kind === 'quarantine') return 'zone_closed';
    if (z.kind === 'dust' && gearSum(state.gear.worn, 'filter') < 1) return 'need_filter';
  }
  return null;
}

/** Was ein besiegter Trupp dabeihatte: je Gegner etwas, manchmal Kram. */
function patrolLoot(state: PlayerState, c: Combat, ctx: RuleContext, kills: number): Extract<GameEvent, { type: 'loot' }> {
  const r = rngFrom(ctx.worldSeed, state.playerId, 'trupp-beute', c.patrol ?? c.spot.id);
  const items: Partial<Inventory> = {};
  for (let i = 0; i < Math.max(1, kills); i++) {
    const res = pickWeighted(r, PATROL.loot);
    items[res] = (items[res] ?? 0) + 1 + (r() < 0.4 ? 1 : 0);
  }
  gain(state, items);
  const loot: Extract<GameEvent, { type: 'loot' }> = { type: 'loot', spotId: c.spot.id, items, bonus: false };
  if (r() < PATROL.lootKramChance) {
    const kram = pickWeighted(r, PATROL.lootKram);
    state.packKram[kram] = (state.packKram[kram] ?? 0) + 1;
    loot.kram = kram;
  }
  foeKram(state, c.group, r, loot);
  return loot;
}

/**
 * Was Gegner mit eigener Beute dabeihaben: das Gewohnheitstier, was es früher dabeihatte; der
 * Hamsterer seinen Haufen; wilde Menschen, was in ihrem Lager liegt. only: nur diese Arten.
 */
function foeKram(state: PlayerState, group: FoeKind[], r: () => number, loot: Extract<GameEvent, { type: 'loot' }>, only?: FoeKind[]) {
  const extra: Partial<Record<KramId, number>> = { ...(loot.kramMore ?? {}) };
  for (const k of new Set(group)) {
    const fl = FOE_LOOT[k];
    if (!fl || (only && !only.includes(k))) continue;
    for (let i = 0; i < fl.n; i++) {
      const kram = pickWeighted(r, fl.kram);
      state.packKram[kram] = (state.packKram[kram] ?? 0) + 1;
      extra[kram] = (extra[kram] ?? 0) + 1;
    }
  }
  if (Object.keys(extra).length) loot.kramMore = extra;
}

function pruneSpots(state: PlayerState, now: number) {
  for (const [id, at] of Object.entries(state.spots)) if (now - at > 24 * HOUR) delete state.spots[id];
}
