// Die Spielregeln als reine Funktion: (Spielstand, Aktion, Zeit) -> (neuer Spielstand, Ereignisse).
//
// Keine Zugriffe auf Uhr, Speicher oder Netzwerk. Die Zeit kommt von außen (ctx.now).
// Im Einzelspieler ruft der Browser diese Funktion auf. Im Mehrspieler ruft der
// Server genau dieselbe Funktion auf. Dann kann niemand schummeln, weil der Server
// entscheidet, ob man nah genug dran war und was man findet.

import {
  BACKGROUNDS,
  BASE_SEARCH_RANGE_M,
  ENEMIES,
  ENEMY_WEIGHTS,
  FIRST_MEMENTO,
  FIST_DAMAGE,
  GUARD_CHANCE,
  GUARD_JUNK_BONUS,
  GUARD_LOOT_FACTOR,
  isMaterial,
  JUNK,
  GUARD_MEMENTO_BONUS,
  HEAL_AMOUNT,
  HEAL_IN_COMBAT,
  HEALTH_REGEN_MIN,
  MAX_HEALTH,
  MEMENTOS,
  MIN_HEALTH_TO_FIGHT,
  MODULES,
  EXPLORE_MAX_ACCURACY_M,
  NIGHT_GUARD_FACTOR,
  NIGHT_LOOT_FACTOR,
  PERK_CHANCE,
  QUALITY_FACTOR,
  RESOURCE_ORDER,
  RETURN_BONUS_AFTER_H,
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
import { FURNITURE, isJunk, type FurnitureId } from './furniture';
import { distanceM } from './geo';
import { dayPhase } from './sun';
import { pickWeighted, randInt, rngFrom } from './rng';
import type {
  Action,
  ActionResult,
  Character,
  EnemyId,
  GameEvent,
  Inventory,
  JunkId,
  Material,
  ModuleId,
  Plot,
  PlayerState,
  RejectReason,
  Resource,
  RuleContext,
  Spot,
  Weapon,
} from './types';
import { resolveGridSpot } from './world';

export const SCHEMA_VERSION = 7;
const HOUR = 3600_000;
const REGEN_MS = HEALTH_REGEN_MIN * 60_000;
const MAX_GPS_SLACK_M = 25;

export function createPlayer(playerId: string, character: Character, now: number): PlayerState {
  return {
    schema: SCHEMA_VERSION,
    playerId,
    createdAt: now,
    lastActiveAt: now,
    character,
    inventory: { ...START_INVENTORY },
    junk: {},
    workshop: { level: 1, jobs: [] },
    bus: { modules: {} },
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
    stats: { searches: 0, kills: 0 },
  };
}

// --- Abfragen (auch für die Oberfläche) ------------------------------------------

export function searchRangeM(state: PlayerState): number {
  return BASE_SEARCH_RANGE_M + (BACKGROUNDS[state.character.background].rangeBonusM ?? 0);
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

export function moduleUnlocked(state: PlayerState, id: ModuleId): boolean {
  return MODULES[id].requires.every((req) => !!state.bus.modules[req]);
}

/** Gesundheit inklusive der Erholung seit dem letzten Stand. */
export function currentHealth(state: PlayerState, now: number): number {
  if (state.health >= MAX_HEALTH) return MAX_HEALTH;
  return Math.min(MAX_HEALTH, state.health + Math.floor((now - state.healthAt) / REGEN_MS));
}

/** Millisekunden bis zum nächsten Lebenspunkt (0 bei voller Gesundheit). */
export function nextHealthIn(state: PlayerState, now: number): number {
  if (currentHealth(state, now) >= MAX_HEALTH) return 0;
  return REGEN_MS - ((now - state.healthAt) % REGEN_MS);
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
  const r = rngFrom(seed, 'wache', spot.id, guardWindow(spot, now));
  const night = dayPhase(spot.pos, now) === 'night';
  const chance = Math.min(0.75, GUARD_CHANCE[spot.source] * (night ? NIGHT_GUARD_FACTOR : 1));
  if (r() >= chance) return null;
  return pickWeighted(r, ENEMY_WEIGHTS);
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
export function dismantleMs(state: PlayerState, junk: JunkId): number {
  return Math.round(JUNK[junk].minutes * 60_000 * workbenchLevel(state).speed);
}

/** Fertig Zerlegtes, das auf dem Werktisch zum Abholen bereitliegt. */
export function readyParts(state: PlayerState, now: number): { items: Partial<Inventory>; count: number } {
  const items: Partial<Inventory> = {};
  let count = 0;
  for (const job of state.workshop.jobs) {
    if (job.endsAt > now) continue;
    count++;
    for (const [k, v] of Object.entries(JUNK[job.junk].parts) as [Material, number][]) items[k] = (items[k] ?? 0) + v;
  }
  return { items, count };
}

/** Wieviel liegt im Rucksack an Fundstücken? */
export function junkCount(state: PlayerState): number {
  return Object.values(state.junk).reduce((a, b) => a + (b ?? 0), 0);
}

/** Was liegt im Bus zum Abholen bereit (Regenfass, Dachgarten)? */
export function pendingHarvest(state: PlayerState, now: number): Partial<Inventory> {
  const out: Partial<Inventory> = {};
  for (const [id, built] of Object.entries(state.bus.modules)) {
    const prod = MODULES[id as ModuleId].produces;
    if (!prod || !built) continue;
    const units = Math.min(prod.cap, Math.floor((now - built.lastHarvestAt) / (prod.every_h * HOUR)));
    if (units > 0) out[prod.res] = (out[prod.res] ?? 0) + units;
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
      events.push(lootSpot(state, spot, ctx, false));
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
      state.combat = { spot, enemy, enemyHp: ENEMIES[enemy].hp, round: 0, opening: false, window: guardWindow(spot, ctx.now) };
      events.push({ type: 'combatStarted', enemy });
      break;
    }

    case 'fight': {
      const c = state.combat;
      if (!c) return reject('no_combat');
      const def = ENEMIES[c.enemy];
      const { move, quality } = action;
      if (move === 'flee') {
        state.combat = null;
        events.push({ type: 'fled' });
        break;
      }
      if (move === 'heal' && state.inventory.medicine < 1) return reject('no_medicine');
      if (move === 'distract' && state.inventory.metal < 1) return reject('cost');

      const r = rngFrom(ctx.worldSeed, state.playerId, 'kampf', c.spot.id, c.window, c.round);
      let dealt = 0;
      let dodged = false;
      let stunned = false;
      let healed = 0;
      let weaponBroke: Weapon['kind'] | undefined;

      if (move === 'strike') {
        const w = bestWeapon(state);
        const base = w ? WEAPONS[w.kind].dmg : FIST_DAMAGE;
        const raw = Math.round(base * QUALITY_FACTOR[quality] * (c.opening ? 1.5 : 1)) - def.armor;
        dealt = Math.max(quality === 'miss' ? 0 : 1, raw);
        c.opening = false;
        if (w) {
          w.dur -= 1;
          if (w.dur <= 0) {
            weaponBroke = w.kind;
            state.weapons = state.weapons.filter((x) => x.dur > 0);
          }
        }
      } else if (move === 'dodge') {
        dodged = quality !== 'miss';
        c.opening = quality === 'perfect' || (quality === 'good' && r() < 0.5);
      } else if (move === 'distract') {
        state.inventory.metal -= 1;
        stunned = quality !== 'miss';
      } else if (move === 'heal') {
        state.inventory.medicine -= 1;
        healed = Math.min(HEAL_IN_COMBAT, MAX_HEALTH - state.health);
        state.health += healed;
      }

      c.enemyHp = Math.max(0, c.enemyHp - dealt);
      const enemyAttacks = c.enemyHp > 0 && !dodged && !stunned;
      const taken = enemyAttacks ? randInt(r, def.dmg[0], def.dmg[1]) : 0;
      state.health = Math.max(0, state.health - taken);
      c.round += 1;
      events.push({ type: 'round', move, quality, dealt, taken, dodged, stunned, healed, weaponBroke });

      if (c.enemyHp <= 0) {
        state.combat = null;
        state.stats.kills += 1;
        events.push({ type: 'combatWon', enemy: c.enemy });
        events.push(lootSpot(state, c.spot, ctx, true));
      } else if (state.health <= 0) {
        state.combat = null;
        state.healthAt = ctx.now;
        const dropped = dropSome(state, r);
        events.push({ type: 'combatLost', enemy: c.enemy, dropped });
      }
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
      // Die Waffe nutzt sich pro Kampf ab (nicht pro Schlag)
      let weaponBroke: Weapon['kind'] | undefined;
      const w = action.outcome !== 'fled' ? bestWeapon(state) : null;
      if (w) {
        w.dur -= 1;
        if (w.dur <= 0) {
          weaponBroke = w.kind;
          state.weapons = state.weapons.filter((x) => x.dur > 0);
        }
      }
      if (action.outcome === 'won') {
        const kills = Math.max(1, Math.min(6, Math.floor(action.kills)));
        state.health = Math.max(1, health);
        if (state.health < MAX_HEALTH) state.healthAt = ctx.now;
        state.stats.kills += kills;
        events.push({ type: 'combatWon', enemy: c.enemy, kills, weaponBroke });
        const loot = lootSpot(state, c.spot, ctx, true);
        // Jeder weitere erledigte Gegner bringt etwas vom Haupt-Rohstoff der Fundstelle
        if (kills > 1) {
          const main = SPOT_KINDS[c.spot.kind].loot.find((l) => isMaterial(l.res))?.res ?? 'metal';
          loot.items[main] = (loot.items[main] ?? 0) + (kills - 1);
          state.inventory[main] += kills - 1;
        }
        events.push(loot);
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
      if (def.requires && !state.bus.modules[def.requires]) return reject('locked');
      if (!canAfford(state.inventory, def.cost)) return reject('cost');
      for (const r of RESOURCE_ORDER) state.inventory[r] -= def.cost[r] ?? 0;
      state.weapons.push({ kind: action.weapon, dur: def.dur });
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
          for (const k of RESOURCE_ORDER) state.inventory[k] += reward[k] ?? 0;
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
      const junk = isJunk(action.kind) ? action.kind : null;
      if (junk && !(state.junk[junk] ?? 0)) return reject('no_junk');
      if (!canAfford(state.inventory, def.cost)) return reject('cost');
      const rot = ((action.rot % 4) + 4) % 4;
      const problem = placementProblem(state, action.kind, action.x, action.y, rot);
      if (problem) return reject(problem);
      for (const k of RESOURCE_ORDER) state.inventory[k] -= def.cost[k] ?? 0;
      if (junk) takeJunk(state, junk);
      const uid = plot.nextUid++;
      plot.items.push({ uid, kind: action.kind, x: action.x, y: action.y, rot });
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
      plot.items = plot.items.filter((i) => i.uid !== it.uid);
      events.push({ type: 'stored', uid: it.uid, refund, junk: isJunk(it.kind) ? it.kind : undefined });
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
      if (!JUNK[action.junk]) return reject('not_found');
      if (!hasWorkbench(state)) return reject('no_workbench');
      if (!(state.junk[action.junk] ?? 0)) return reject('no_junk');
      const ws = state.workshop;
      if (ws.jobs.length >= workbenchLevel(state).slots) return reject('queue_full');
      // Der Werktisch arbeitet eins nach dem anderen ab, in echter Zeit
      const last = ws.jobs.length ? ws.jobs[ws.jobs.length - 1].endsAt : 0;
      const endsAt = Math.max(ctx.now, last) + dismantleMs(state, action.junk);
      takeJunk(state, action.junk);
      ws.jobs.push({ junk: action.junk, endsAt });
      events.push({ type: 'dismantleQueued', junk: action.junk, endsAt });
      break;
    }

    case 'collect': {
      if (!hasWorkbench(state)) return reject('no_workbench');
      const { items, count } = readyParts(state, ctx.now);
      if (!count) return reject('nothing');
      state.workshop.jobs = state.workshop.jobs.filter((j) => j.endsAt > ctx.now);
      for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;
      events.push({ type: 'collected', items, count });
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

    case 'build': {
      const def = MODULES[action.module];
      if (state.bus.modules[action.module]) return reject('already_built');
      if (!moduleUnlocked(state, action.module)) return reject('locked');
      if (!canAfford(state.inventory, def.cost)) return reject('cost');
      for (const r of RESOURCE_ORDER) state.inventory[r] -= def.cost[r] ?? 0;
      state.bus.modules[action.module] = { builtAt: ctx.now, lastHarvestAt: ctx.now };
      events.push({ type: 'built', module: action.module });
      break;
    }

    case 'harvest': {
      const items = pendingHarvest(state, ctx.now);
      if (Object.keys(items).length === 0) return reject('nothing');
      for (const [id, built] of Object.entries(state.bus.modules)) {
        const prod = MODULES[id as ModuleId].produces;
        if (!prod || !built) continue;
        const period = prod.every_h * HOUR;
        const units = Math.floor((ctx.now - built.lastHarvestAt) / period);
        if (units <= 0) continue;
        // Volles Lager: Uhr neu starten. Sonst den angefangenen Rest behalten.
        built.lastHarvestAt = units >= prod.cap ? ctx.now : built.lastHarvestAt + units * period;
      }
      for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;
      events.push({ type: 'harvested', items });
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
  const gained = Math.floor((now - state.healthAt) / REGEN_MS);
  if (gained <= 0) return;
  state.health = Math.min(MAX_HEALTH, state.health + gained);
  state.healthAt = state.health >= MAX_HEALTH ? now : state.healthAt + gained * REGEN_MS;
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
function lootSpot(state: PlayerState, spot: Spot, ctx: RuleContext, guarded: boolean): Extract<GameEvent, { type: 'loot' }> {
  const def = SPOT_KINDS[spot.kind];
  const r = rngFrom(ctx.worldSeed, state.playerId, spot.id, guardWindow(spot, ctx.now));
  const items: Partial<Inventory> = {};
  for (const rule of def.loot) {
    if (r() < rule.chance) items[rule.res] = (items[rule.res] ?? 0) + randInt(r, rule.min, rule.max);
  }
  // Nie ganz leer ausgehen.
  if (Object.keys(items).length === 0) items[def.loot[0].res] = def.loot[0].min;
  if (guarded) for (const k of Object.keys(items) as Resource[]) items[k] = Math.ceil((items[k] ?? 0) * GUARD_LOOT_FACTOR);
  const night = dayPhase(spot.pos, ctx.now) === 'night';
  if (night) for (const k of Object.keys(items) as Resource[]) items[k] = Math.ceil((items[k] ?? 0) * NIGHT_LOOT_FACTOR);
  // Vorgeschichte
  let perk: Resource | undefined;
  const bonusRes = BACKGROUNDS[state.character.background].bonusRes;
  if (bonusRes && r() < PERK_CHANCE) {
    items[bonusRes] = (items[bonusRes] ?? 0) + 1;
    perk = bonusRes;
  }
  // Werkbank im Bus: +1 vom ersten gefundenen Rohstoff
  const firstMat = (Object.keys(items) as Resource[]).find(isMaterial);
  if (state.bus.modules.workbench && firstMat) items[firstMat] = (items[firstMat] ?? 0) + 1;
  // Rückkehr-Bonus
  const bonus = state.returnBonus;
  if (bonus) for (const k of Object.keys(items) as Resource[]) items[k] = (items[k] ?? 0) * 2;

  for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;

  // Fundstück
  let junk: JunkId | undefined;
  if (def.junk.length && r() < Math.min(0.9, def.junkChance + (guarded ? GUARD_JUNK_BONUS : 0))) {
    junk = pickWeighted(r, def.junk);
    state.junk[junk] = (state.junk[junk] ?? 0) + 1;
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

  state.spots[spot.id] = ctx.now;
  state.returnBonus = false;
  state.stats.searches += 1;
  pruneSpots(state, ctx.now);
  return { type: 'loot', spotId: spot.id, items, junk, memento, bonus, perk, night, blueprint, site };
}

function takeJunk(state: PlayerState, junk: JunkId) {
  const n = (state.junk[junk] ?? 0) - 1;
  if (n > 0) state.junk[junk] = n;
  else delete state.junk[junk];
}

/** Bei einer Niederlage fällt etwas aus dem Rucksack. Nie viel, nie der Bus. */
function dropSome(state: PlayerState, r: () => number): Partial<Inventory> {
  const dropped: Partial<Inventory> = {};
  const have = RESOURCE_ORDER.filter((k) => state.inventory[k] > 0);
  for (let i = 0; i < 2 && have.length; i++) {
    const k = have.splice(Math.floor(r() * have.length), 1)[0];
    const n = Math.min(state.inventory[k], 1 + Math.floor(r() * 2));
    state.inventory[k] -= n;
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
