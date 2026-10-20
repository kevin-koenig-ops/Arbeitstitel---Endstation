// Die Spielregeln als reine Funktion: (Spielstand, Aktion, Zeit) -> (neuer Spielstand, Ereignisse).
//
// Keine Zugriffe auf Uhr, Speicher oder Netzwerk. Die Zeit kommt von außen (ctx.now).
// Im Einzelspieler ruft der Browser diese Funktion auf. Im Mehrspieler ruft der
// Server genau dieselbe Funktion auf. Dann kann niemand schummeln, weil der Server
// entscheidet, ob man nah genug dran war und was man findet.

import {
  BACKGROUNDS,
  BASE_SEARCH_RANGE_M,
  FIRST_MEMENTO,
  MEMENTOS,
  MODULES,
  PERK_CHANCE,
  RESOURCE_ORDER,
  RETURN_BONUS_AFTER_H,
  SPOT_KINDS,
  START_INVENTORY,
} from './content';
import { distanceM } from './geo';
import { randInt, rngFrom } from './rng';
import type {
  Action,
  ActionResult,
  Character,
  GameEvent,
  Inventory,
  ModuleId,
  PlayerState,
  Resource,
  RuleContext,
  Spot,
} from './types';
import { resolveGridSpot } from './world';

export const SCHEMA_VERSION = 1;
const HOUR = 3600_000;
const MAX_GPS_SLACK_M = 25;

export function createPlayer(playerId: string, character: Character, now: number): PlayerState {
  return {
    schema: SCHEMA_VERSION,
    playerId,
    createdAt: now,
    lastActiveAt: now,
    character,
    inventory: { ...START_INVENTORY },
    bus: { modules: {} },
    spots: {},
    collection: {},
    returnBonus: false,
    stats: { searches: 0 },
  };
}

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

export function applyAction(prev: PlayerState, action: Action, ctx: RuleContext): ActionResult {
  const state: PlayerState = structuredClone(prev);
  const events: GameEvent[] = [];
  const reject = (reason: Extract<GameEvent, { type: 'rejected' }>['reason']): ActionResult => ({
    state: prev,
    events: [{ type: 'rejected', reason }],
  });

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
      const slack = Math.min(Math.max(action.accuracyM, 0), MAX_GPS_SLACK_M);
      if (distanceM(action.at, spot.pos) > searchRangeM(prev) + slack) return reject('too_far');
      if (readyAt(prev, spot) > ctx.now) return reject('cooldown');

      const def = SPOT_KINDS[spot.kind];
      const window = Math.floor(ctx.now / cooldownMs(spot));
      const r = rngFrom(ctx.worldSeed, prev.playerId, spot.id, window);
      const items: Partial<Inventory> = {};
      for (const rule of def.loot) {
        if (r() < rule.chance) items[rule.res] = (items[rule.res] ?? 0) + randInt(r, rule.min, rule.max);
      }
      // Nie ganz leer ausgehen.
      if (Object.keys(items).length === 0) {
        const fallback = def.loot[0];
        items[fallback.res] = fallback.min;
      }
      // Vorgeschichte
      let perk: Resource | undefined;
      const bonusRes = BACKGROUNDS[prev.character.background].bonusRes;
      if (bonusRes && r() < PERK_CHANCE) {
        items[bonusRes] = (items[bonusRes] ?? 0) + 1;
        perk = bonusRes;
      }
      // Werkbank
      if (prev.bus.modules.workbench && items.material) items.material += 1;
      // Rückkehr-Bonus
      const bonus = prev.returnBonus;
      if (bonus) for (const k of Object.keys(items) as Resource[]) items[k] = (items[k] ?? 0) * 2;

      for (const k of Object.keys(items) as Resource[]) state.inventory[k] += items[k] ?? 0;

      // Erinnerungsstück
      let memento: string | undefined;
      const missing = MEMENTOS.filter((m) => !prev.collection[m.id]);
      if (prev.stats.searches === 0 && !prev.collection[FIRST_MEMENTO]) memento = FIRST_MEMENTO;
      else if (missing.length && r() < def.mementoChance) memento = missing[Math.floor(r() * missing.length)].id;
      if (memento) state.collection[memento] = ctx.now;

      state.spots[spot.id] = ctx.now;
      state.returnBonus = false;
      state.stats.searches += 1;
      pruneSpots(state, ctx.now);
      events.push({ type: 'loot', spotId: spot.id, items, memento, bonus, perk });
      break;
    }

    case 'build': {
      const def = MODULES[action.module];
      if (prev.bus.modules[action.module]) return reject('already_built');
      if (!moduleUnlocked(prev, action.module)) return reject('locked');
      if (!canAfford(prev.inventory, def.cost)) return reject('cost');
      for (const r of RESOURCE_ORDER) state.inventory[r] -= def.cost[r] ?? 0;
      state.bus.modules[action.module] = { builtAt: ctx.now, lastHarvestAt: ctx.now };
      events.push({ type: 'built', module: action.module });
      break;
    }

    case 'harvest': {
      const items = pendingHarvest(prev, ctx.now);
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
