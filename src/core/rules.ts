// Die Spielregeln als reine Funktion: (Spielstand, Aktion, Zeit) -> (neuer Spielstand, Ereignisse).
//
// Keine Zugriffe auf Uhr, Speicher oder Netzwerk. Die Zeit kommt von außen (ctx.now).
// Im Einzelspieler ruft der Browser diese Funktion auf. Im Mehrspieler ruft der
// Server genau dieselbe Funktion auf. Dann kann niemand schummeln, weil der Server
// entscheidet, ob man nah genug dran war und was man findet.

import {
  BACKGROUNDS,
  BASE_SEARCH_RANGE_M,
  CACHE,
  CART,
  COLLECTIBLE_ORDER,
  COOK,
  RADIO,
  RADIO_LINES,
  ENEMY_WEIGHTS,
  FIRST_MEMENTO,
  COLLECT_CHANCE,
  GUARD_CHANCE,
  GUARD_COLLECT_BONUS,
  GUARD_KRAM_BONUS,
  GUARD_LOOT_FACTOR,
  isMaterial,
  KRAM,
  GUARD_MEMENTO_BONUS,
  HEAL_AMOUNT,
  DIG,
  FIRST_FIND_FACTOR,
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
  NIGHT_LOOT_FACTOR,
  PERK_CHANCE,
  RESOURCE_ORDER,
  RETURN_BONUS_AFTER_H,
  SET_ORDER,
  SETS,
  SPOT_KINDS,
  START_INVENTORY,
  START_WEAPONS,
  WEAPONS,
  WORKBENCH_LEVELS,
} from './content';
import { ExploredView, revealAround, SECTOR_LEVELS } from './explore';
import {
  applyPlan,
  BLUEPRINT_CHANCE,
  COMFORT_TIERS,
  BLUEPRINT_SOURCES,
  canReclaim,
  comfortTier,
  indexPlot,
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
  Action,
  ActionResult,
  Cache,
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
import { resolveGridSpot } from './world';
import { GOALS } from './progress';

export const SCHEMA_VERSION = 9;
const HOUR = 3600_000;
/** Millisekunden pro Gesundheitspunkt (die Stufe der Endstation macht es schneller). */
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
    combat: null,
    explored: {},
    sectors: {},
    base: { active: null, plots: {}, found: {} },
    blueprints: {},
    stats: { searches: 0, kills: 0, unpacks: 0, dismantled: 0, crafted: 0, caches: 0, cooked: 0 },
    goals: {},
    dig: null,
    seen: [],
    caches: [],
    radioAt: 0,
    fedUntil: 0,
  };
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
  let best: Weapon | null = null;
  for (const w of state.weapons) if (w.dur > 0 && (!best || WEAPONS[w.kind].dmg > WEAPONS[best.kind].dmg)) best = w;
  return best;
}

export function guardWindow(spot: Spot, now: number): number {
  return Math.floor(now / cooldownMs(spot));
}

/**
 * Wird die Fundstelle gerade bewacht, und von wem? Deterministisch aus Welt-Seed,
 * Fundstelle und Zeitfenster, also für alle Spieler gleich.
 */
export function guardOf(seed: string, spot: Spot, now: number): EnemyId | null {
  if (cartOf(seed, spot, now)) return null;
  const r = rngFrom(seed, 'wache', spot.id, guardWindow(spot, now));
  const night = dayPhase(spot.pos, now) === 'night';
  const chance = Math.min(0.75, GUARD_CHANCE[spot.source] * (night ? NIGHT_GUARD_FACTOR : 1));
  if (r() >= chance) return null;
  return pickWeighted(r, ENEMY_WEIGHTS);
}

/**
 * Steht hier gerade eine liegengebliebene Händlerkiste? Für alle Spieler gleich,
 * jeweils für ein Zeitfenster von ein paar Stunden. Gibt das Ende des Fensters zurück.
 */
export function cartOf(seed: string, spot: Spot, now: number): { until: number } | null {
  const ms = CART.windowH * HOUR;
  const w = Math.floor(now / ms);
  const r = rngFrom(seed, 'karren', spot.id, w);
  return r() < CART.chance ? { until: (w + 1) * ms } : null;
}

/** Bist du gerade satt (Eintopf)? */
export function isFed(state: PlayerState, now: number): boolean {
  return state.fedUntil > now;
}

export function hasItem(state: PlayerState, kind: FurnitureId): boolean {
  return !!activePlot(state)?.items.some((i) => i.kind === kind);
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
/** Stufe der Endstation (0 = Ruine … 6 = Oase), aus der Gemütlichkeit. */
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

/** Plätze am Werktisch (Ausbaustufe plus Stufe der Endstation). */
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
  return !!activePlot(state)?.items.some((i) => i.kind === 'workbench');
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
  return Object.values(state.pack).reduce((a, b) => a + (b ?? 0), 0) + kramCount(state.packKram);
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

/** Alles, was in der aktiven Endstation zum Abholen bereitsteht. */
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

  switch (action.type) {
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
        items[rule.res] = (items[rule.res] ?? 0) + Math.max(1, Math.round(randInt(r, rule.min, rule.max) * 0.6 * perks.lootFactor));
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
        w.dur -= Math.max(0, Math.min(30, Math.floor(n)));
        if (w.dur <= 0) weaponBroke = kind;
      }
      state.weapons = state.weapons.filter((x) => x.dur > 0);
      if (action.outcome === 'won') {
        const kills = Math.max(1, Math.min(6, Math.floor(action.kills)));
        state.health = Math.max(1, health);
        if (state.health < MAX_HEALTH) state.healthAt = ctx.now;
        state.stats.kills += kills;
        events.push({ type: 'combatWon', enemy: c.enemy, kills, weaponBroke });
        if (c.ambush) {
          // Überfall beim Wühlen: die Fundstelle ist schon leer, es gibt nur, was die Gegner dabeihatten
          const main = SPOT_KINDS[c.spot.kind].loot.find((l) => isMaterial(l.res))?.res ?? 'metal';
          const items: Partial<Inventory> = { [main]: kills };
          gain(state, items);
          events.push({ type: 'loot', spotId: c.spot.id, items, bonus: false });
          break;
        }
        const loot = lootSpot(state, c.spot, ctx, { guarded: true, quality: 'good' });
        startDig(state, c.spot, ctx);
        loot.canDig = true;
        // Jeder weitere erledigte Gegner bringt etwas vom Haupt-Rohstoff der Fundstelle
        if (kills > 1) {
          const main = SPOT_KINDS[c.spot.kind].loot.find((l) => isMaterial(l.res))?.res ?? 'metal';
          loot.items[main] = (loot.items[main] ?? 0) + (kills - 1);
          gain(state, { [main]: kills - 1 });
        }
        events.push(loot, ...checkSets(state, ctx.now));
      } else if (action.outcome === 'lost') {
        state.health = 0;
        state.healthAt = ctx.now;
        const r = rngFrom(ctx.worldSeed, state.playerId, 'niederlage', c.spot.id, c.window);
        events.push({ type: 'combatLost', enemy: c.enemy, dropped: dropSome(state, r), weaponBroke });
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
      if (!canReclaim(plot, action.sx, action.sy)) return reject('not_adjacent');
      const cost = reclaimCost(plot);
      if (!canAfford(state.inventory, cost)) return reject('cost');
      for (const k of RESOURCE_ORDER) state.inventory[k] -= cost[k] ?? 0;
      plot.sections.push(key);
      events.push({ type: 'reclaimed', section: key, cost });
      break;
    }

    case 'clearObstacle': {
      const plot = activePlot(state);
      const idx = plotIndexOf(state);
      if (!plot || !idx) return reject('no_site');
      const o = idx.obstacles.find((x) => x.id === action.id);
      if (!o) return reject('not_found');
      plot.cleared.push(o.id);
      const reward = OBSTACLES[o.kind].reward;
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
      plot.items.push({ uid, kind: action.kind, x: action.x, y: action.y, rot, ...(def.produces ? { at: ctx.now } : {}) });
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
      const stored = applyPlan(state, plot, plan, (k) => {
        const old = plot.walls[k];
        const keep = old && PIECES[old.k].group === def.group ? old.o : undefined;
        plot.walls[k] = keep ? { k: piece, o: keep } : { k: piece };
      });
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
      const items: Partial<Inventory> = {};
      for (let i = 0; i < CACHE.rolls; i++) {
        const rule = def.loot[Math.floor(r() * def.loot.length)];
        items[rule.res] = (items[rule.res] ?? 0) + randInt(r, rule.min, rule.max) * CACHE.factor;
      }
      gain(state, items);
      const kramList = def.kram.length ? def.kram : SPOT_KINDS.car.kram;
      const kram = pickWeighted(r, kramList);
      state.packKram[kram] = (state.packKram[kram] ?? 0) + 1;
      let collectible: CollectibleId | undefined;
      const missingC = COLLECTIBLE_ORDER.filter((x) => !state.collectibles[x]);
      if (missingC.length && r() < CACHE.collectChance) {
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
      events.push({ type: 'cacheOpened', id: c.id, items, kram, collectible, blueprint }, ...checkSets(state, ctx.now));
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
      if (!canAfford(state.inventory, next.cost)) return reject('cost');
      for (const k of RESOURCE_ORDER) state.inventory[k] -= next.cost[k] ?? 0;
      state.workshop.level += 1;
      events.push({ type: 'workbenchUpgraded', level: state.workshop.level });
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
      if (!packCount(state)) return reject('nothing');
      const items = { ...state.pack };
      const kram = { ...state.packKram };
      for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;
      for (const [k, n] of Object.entries(kram) as [KramId, number][]) state.kram[k] = (state.kram[k] ?? 0) + n;
      state.pack = {};
      state.packKram = {};
      state.stats.unpacks += 1;
      events.push({ type: 'unpacked', items, kram });
      break;
    }
  }

  state.lastActiveAt = ctx.now;
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
/** Kurz-Kennung einer Fundstelle für die Erstfund-Liste. */
export function spotKey(id: string): number {
  return hashString(id) % 4294967296;
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
export function encounter(seed: string, playerId: string, spot: Spot, window: number, enemy: EnemyId, night: boolean): FoeKind[] {
  const r = rngFrom(seed, playerId, 'gruppe', spot.id, window);
  const g: FoeKind[] = [enemy];
  if (enemy === 'walker' && r() < (night ? 0.6 : 0.35)) g.push('walker');
  if (enemy === 'crawler' && r() < 0.6) g.push('crawler');
  if (enemy === 'brute' && r() < 0.4) g.push('walker');
  // Heuler sind eigentlich Stadtwesen, nur einzelne verirren sich aufs Land
  if (r() < (spot.source === 'poi' ? 0.15 : 0.05) + (night ? 0.1 : 0)) g.push('screamer');
  return g;
}

function lootSpot(state: PlayerState, spot: Spot, ctx: RuleContext, o: { guarded: boolean; quality: Quality }): Extract<GameEvent, { type: 'loot' }> {
  const guarded = o.guarded;
  const def = SPOT_KINDS[spot.kind];
  const r = rngFrom(ctx.worldSeed, state.playerId, spot.id, guardWindow(spot, ctx.now));
  const perks = basePerks(state);
  const q = LOOT_QUALITY[o.quality] ?? LOOT_QUALITY.good;
  const luck = q.luck + perks.luck;
  const first = firstVisit(state, spot.id);
  const items: Partial<Inventory> = {};
  for (const rule of def.loot) {
    if (r() < rule.chance) items[rule.res] = (items[rule.res] ?? 0) + randInt(r, rule.min, rule.max);
  }
  // Nie ganz leer ausgehen.
  if (Object.keys(items).length === 0) items[def.loot[0].res] = def.loot[0].min;
  const night = dayPhase(spot.pos, ctx.now) === 'night';
  const cart = !guarded && !!cartOf(ctx.worldSeed, spot, ctx.now);
  const fed = isFed(state, ctx.now);
  // Alles, was die Menge verändert: Wache, Nacht, Geschick, Stufe der Endstation, Erstfund, Händlerkiste, satt
  const factor =
    (guarded ? GUARD_LOOT_FACTOR : 1) *
    (night ? NIGHT_LOOT_FACTOR : 1) *
    q.factor *
    perks.lootFactor *
    (first ? FIRST_FIND_FACTOR : 1) *
    (cart ? CART.lootFactor : 1) *
    (fed ? 1 + COOK.lootBonus : 1);
  for (const k of Object.keys(items) as Resource[]) items[k] = Math.max(1, Math.round((items[k] ?? 0) * factor));
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
  const missing = MEMENTOS.filter((m) => !state.collection[m.id]);
  const chance = def.mementoChance + (guarded ? GUARD_MEMENTO_BONUS : 0);
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

  // Lageplan für einen neuen Schauplatz (erst, wenn man schon irgendwo wohnt)
  let site: SiteId | undefined;
  if (state.base.active) {
    const cands = SITE_ORDER.filter((id) => !state.base.plots[id] && !state.base.found[id] && SITES[id].findAt.includes(spot.kind));
    if (cands.length && r() < SITE_PLAN_CHANCE[spot.source]) {
      site = cands[Math.floor(r() * cands.length)];
      state.base.found[site] = ctx.now;
    }
  }

  // Hinweis auf ein Versteck (eigener Zufall, damit sich die übrige Beute nicht verschiebt)
  let clue: string | undefined;
  const rc = rngFrom(ctx.worldSeed, state.playerId, 'zettel', spot.id, guardWindow(spot, ctx.now));
  if (state.caches.length < CACHE.max && rc() < CACHE.clueChance + (first ? CACHE.firstBonus : 0) + (cart ? 0.1 : 0)) {
    clue = makeCache(state, ctx, spot.pos, spot.name, 'note', rc, CACHE.minM, CACHE.maxM)?.id;
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
    site,
    quality: o.quality,
    first: first || undefined,
    canDig: !guarded || undefined,
    cart: cart || undefined,
    fed: fed || undefined,
    clue,
  };
}

/** Legt ein Versteck an einer Fundstelle in der Umgebung an (oder null, wenn keine passt). */
function makeCache(state: PlayerState, ctx: RuleContext, around: LatLon, fromName: string, via: Cache['via'], r: () => number, minM: number, maxM: number): Cache | null {
  const taken = new Set(state.caches.map((c) => c.spot.id));
  const cands = gridSpotsAround(ctx.worldSeed, around, maxM).filter((sp) => !taken.has(sp.id) && distanceM(around, sp.pos) >= minM && !ctx.blocked?.(sp.pos));
  if (!cands.length) return null;
  const spot = cands[Math.floor(r() * cands.length)];
  // Die Mitte des Suchkreises liegt daneben, das Versteck irgendwo darin
  const a = r() * Math.PI * 2;
  const d = CACHE.areaM * (0.25 + r() * 0.45);
  const cache: Cache = { id: `v:${spot.id}:${ctx.now}`, spot, center: offsetM(spot.pos, Math.cos(a) * d, Math.sin(a) * d), fromName, fromPos: around, at: ctx.now, via };
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
function dropSome(state: PlayerState, r: () => number): Partial<Inventory> {
  // Nur aus dem Rucksack, nie aus dem Lager zu Hause. Ist er leer, ein wenig Proviant.
  const dropped: Partial<Inventory> = {};
  const inPack = RESOURCE_ORDER.filter((k) => (state.pack[k] ?? 0) > 0);
  const have = inPack.length ? inPack : (['food', 'water'] as Resource[]).filter((k) => state.inventory[k] > 0);
  const bag = inPack.length ? state.pack : state.inventory;
  for (let i = 0; i < 2 && have.length; i++) {
    const k = have.splice(Math.floor(r() * have.length), 1)[0];
    const n = Math.min(bag[k] ?? 0, 1 + Math.floor(r() * 2));
    bag[k] = (bag[k] ?? 0) - n;
    if (bag === state.pack && !bag[k]) delete state.pack[k];
    dropped[k] = n;
  }
  return dropped;
}

/**
 * Grid-Fundstellen lassen sich aus ihrer ID nachrechnen, also prüfen wir sie.
 * POI-Fundstellen kommen aus den Kartendaten; im Mehrspieler prüft sie der Server
 * gegen seine eigene OSM-Liste.
 */
function verifySpot(spot: Spot, ctx: RuleContext): Spot | null {
  if (spot.source === 'grid') {
    const real = resolveGridSpot(ctx.worldSeed, spot.id);
    if (!real || real.kind !== spot.kind || distanceM(real.pos, spot.pos) > 1) return null;
    return real;
  }
  if (!spot.id.startsWith('p:') || !SPOT_KINDS[spot.kind]) return null;
  return spot;
}

function pruneSpots(state: PlayerState, now: number) {
  for (const [id, at] of Object.entries(state.spots)) if (now - at > 24 * HOUR) delete state.spots[id];
}
