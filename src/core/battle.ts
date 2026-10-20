// Kampf 2.0: Echtzeit mit Zielwahl (Tab-Targeting).
//
// Reine Simulation ohne Browser: (Kampfzustand, Zeitschritt, Eingaben) -> Ereignisse.
// Gleiche Eingaben zur gleichen Kampfzeit ergeben immer denselben Ablauf. So kann ein
// Server später einen Kampf aus der Eingabeliste nachrechnen und prüfen.
//
// Spielgefühl: Die Figur greift ihr Ziel automatisch an. Gegner holen sichtbar aus;
// wer kurz vor dem Treffer ausweicht, bekommt einen Konter. Dazu Wuchtschlag, Stoß
// und Verbinden mit Abklingzeiten. Der Kreischer ruft Verstärkung: zuerst ausschalten!

import { ABILITIES, BATTLE, BATTLE_WEAPONS, FOES, type Ability, type FoeKind } from './content';
import { hashString } from './rng';
import type { EnemyId, WeaponId } from './types';

export type FoeMode = 'enter' | 'chase' | 'windup' | 'recover' | 'stagger' | 'dead';

export interface Foe {
  id: number;
  kind: FoeKind;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  mode: FoeMode;
  /** Zeit im aktuellen Zustand */
  t: number;
  /** Zeit bis zum nächsten Angriff */
  cool: number;
  /** Winkel um die Spielfigur, auf dem der Gegner ankommt (damit sie sich verteilen) */
  slot: number;
}

export interface BattleState {
  t: number;
  rng: number;
  hp: number;
  maxHp: number;
  weapon: WeaponId | null;
  /** Position und Blickrichtung der Spielfigur */
  x: number;
  z: number;
  facing: number;
  /** Zeit bis zum nächsten automatischen Schlag */
  swing: number;
  target: number | null;
  cds: Record<Ability, number>;
  /** Unverwundbar (Ausweichen) */
  dodge: number;
  /** Nächster Treffer ist ein Konter */
  counter: number;
  /** Verbinden läuft noch so lange */
  healLeft: number;
  medicine: number;
  usedMedicine: number;
  foes: Foe[];
  nextId: number;
  summons: number;
  kills: number;
  perfects: number;
  over: null | 'won' | 'lost' | 'fled';
  /** Tempo der Zombies (Wetter) */
  foeSpeed: number;
}

export type BattleInput = { type: 'target'; id: number } | { type: 'ability'; ability: Ability } | { type: 'flee' };

export type BattleEvent =
  | { type: 'swing'; target: number }
  | { type: 'hit'; id: number; dmg: number; crit: boolean; counter: boolean; power: boolean; kill: boolean }
  | { type: 'hurt'; dmg: number; by: number }
  | { type: 'dodged'; by: number; perfect: boolean }
  | { type: 'dodge' }
  | { type: 'windup'; id: number }
  | { type: 'interrupt'; id: number }
  | { type: 'summon'; id: number; by: number }
  | { type: 'scream'; id: number }
  | { type: 'heal'; amount: number }
  | { type: 'bandage' }
  | { type: 'shove' }
  | { type: 'target'; id: number }
  | { type: 'denied'; ability: Ability; reason: 'cooldown' | 'no_target' | 'no_medicine' | 'full' }
  | { type: 'over'; outcome: 'won' | 'lost' | 'fled' };

// --- Zufall mit speicherbarem Zustand (mulberry32) ---------------------------------

function rand(b: BattleState): number {
  b.rng = (b.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(b.rng ^ (b.rng >>> 15), 1 | b.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (b: BattleState, [lo, hi]: [number, number]) => lo + Math.floor(rand(b) * (hi - lo + 1));

// --- Aufbau ------------------------------------------------------------------------

/** Wer zusammen mit dem Wächter auftaucht. */
function group(b: BattleState, guard: EnemyId): FoeKind[] {
  const r = rand(b);
  const out: FoeKind[] = [guard];
  if (guard === 'walker') out.push(...(r < 0.5 ? (['walker'] as FoeKind[]) : (['walker', 'crawler'] as FoeKind[])));
  else if (guard === 'crawler') out.push(...(r < 0.5 ? (['crawler'] as FoeKind[]) : (['walker', 'walker'] as FoeKind[])));
  else out.push(...(r < 0.5 ? (['walker'] as FoeKind[]) : (['walker', 'crawler'] as FoeKind[])));
  if (rand(b) < 0.35) out.push('screamer');
  return out;
}

function spawn(b: BattleState, kind: FoeKind, angle: number, dist: number): Foe {
  const def = FOES[kind];
  const f: Foe = {
    id: b.nextId++,
    kind,
    hp: def.hp,
    maxHp: def.hp,
    x: b.x + Math.sin(angle) * dist,
    z: b.z - Math.cos(angle) * dist,
    mode: 'enter',
    t: 0,
    cool: 0.6 + rand(b) * 1.2,
    slot: angle,
  };
  b.foes.push(f);
  return f;
}

export interface BattleSetup {
  /** Beliebiger Text, aus dem der Zufall entsteht (z. B. Seed + Spieler + Fundstelle + Zeitfenster) */
  seed: string;
  guard: EnemyId;
  weapon: WeaponId | null;
  /** Gesundheit 0–10 */
  health: number;
  maxHealth: number;
  medicine: number;
  /** Wetter: unter 1 sind Zombies träge (Regen, Schnee) */
  foeSpeed?: number;
}

export function createBattle(s: BattleSetup): BattleState {
  const b: BattleState = {
    t: 0,
    rng: hashString(s.seed) | 0,
    hp: s.health * BATTLE.hpPerHealth,
    maxHp: s.maxHealth * BATTLE.hpPerHealth,
    weapon: s.weapon,
    x: 0,
    z: 0,
    facing: 0,
    swing: 0.4,
    target: null,
    cds: { power: 0, dodge: 0, shove: 0, bandage: 0 },
    dodge: 0,
    counter: 0,
    healLeft: 0,
    medicine: s.medicine,
    usedMedicine: 0,
    foes: [],
    nextId: 1,
    summons: 0,
    kills: 0,
    perfects: 0,
    over: null,
    foeSpeed: s.foeSpeed ?? 1,
  };
  const kinds = group(b, s.guard);
  kinds.forEach((k, i) => {
    const spread = kinds.length > 1 ? (i / (kinds.length - 1) - 0.5) * 1.6 : 0;
    const dist = k === 'screamer' ? 10 : 7.5 + rand(b) * 1.5;
    spawn(b, k, spread + (rand(b) - 0.5) * 0.2, dist);
  });
  b.target = b.foes[0]?.id ?? null;
  return b;
}

// --- Abfragen ----------------------------------------------------------------------

export const alive = (b: BattleState) => b.foes.filter((f) => f.mode !== 'dead');
export const foeById = (b: BattleState, id: number | null) => (id === null ? undefined : b.foes.find((f) => f.id === id));
const dist = (b: BattleState, f: Foe) => Math.hypot(f.x - b.x, f.z - b.z);

function weaponStats(b: BattleState) {
  return BATTLE_WEAPONS[b.weapon ?? 'fists'];
}

/** Nächstes lebendes Ziel (oder das nächste nach dem aktuellen, wenn cycle). */
export function nextTarget(b: BattleState, cycle = false): number | null {
  const list = alive(b).sort((a, c) => dist(b, a) - dist(b, c));
  if (!list.length) return null;
  if (!cycle) return list[0].id;
  const i = list.findIndex((f) => f.id === b.target);
  return list[(i + 1) % list.length].id;
}

/** Wie lange holt dieser Gegner aus (bei Regen etwas länger)? */
export function windupTime(b: Pick<BattleState, 'foeSpeed'>, f: Foe): number {
  return FOES[f.kind].windup / b.foeSpeed;
}

/** Holt gerade ein Gegner aus, und wie lange noch bis zum Treffer? */
export function windupLeft(f: Foe, b?: Pick<BattleState, 'foeSpeed'>): number {
  return f.mode === 'windup' ? Math.max(0, FOES[f.kind].windup / (b?.foeSpeed ?? 1) - f.t) : Infinity;
}

// --- Schaden -----------------------------------------------------------------------

function damageFoe(b: BattleState, f: Foe, mult: number, power: boolean, out: BattleEvent[]) {
  const ws = weaponStats(b);
  const counter = b.counter > 0;
  const crit = counter || rand(b) < BATTLE.crit;
  let dmg = between(b, ws.dmg) * mult;
  if (counter) dmg *= BATTLE.counterMult;
  else if (crit) dmg *= BATTLE.critMult;
  dmg = Math.max(1, Math.round(dmg) - FOES[f.kind].armor);
  if (counter) b.counter = 0;
  f.hp = Math.max(0, f.hp - dmg);
  const kill = f.hp <= 0;
  out.push({ type: 'hit', id: f.id, dmg, crit, counter, power, kill });
  if (kill) {
    f.mode = 'dead';
    f.t = 0;
    b.kills += 1;
    if (b.target === f.id) {
      b.target = nextTarget(b);
      if (b.target !== null) out.push({ type: 'target', id: b.target });
    }
  } else if (power || counter) {
    if (f.mode === 'windup') out.push({ type: 'interrupt', id: f.id });
    f.mode = 'stagger';
    f.t = 0;
  }
}

// --- Eingaben ----------------------------------------------------------------------

function useAbility(b: BattleState, a: Ability, out: BattleEvent[]) {
  if (b.cds[a] > 0) return out.push({ type: 'denied', ability: a, reason: 'cooldown' });
  const tgt = foeById(b, b.target);
  switch (a) {
    case 'power': {
      if (!tgt || tgt.mode === 'dead' || dist(b, tgt) > weaponStats(b).reach + 0.4) return out.push({ type: 'denied', ability: a, reason: 'no_target' });
      out.push({ type: 'swing', target: tgt.id });
      damageFoe(b, tgt, BATTLE.powerMult, true, out);
      b.swing = Math.max(b.swing, 0.5);
      break;
    }
    case 'dodge': {
      // Perfekt: ein Gegner in der Nähe trifft gleich
      const soon = alive(b).filter((f) => windupLeft(f, b) <= BATTLE.perfectWindow && (dist(b, f) <= FOES[f.kind].reach + 0.8 || f.kind === 'screamer'));
      b.dodge = BATTLE.dodgeTime;
      out.push({ type: 'dodge' });
      if (soon.length) {
        b.counter = BATTLE.counterTime;
        b.perfects += 1;
        for (const f of soon) {
          out.push({ type: 'dodged', by: f.id, perfect: true });
          f.mode = 'recover';
          f.t = 0;
          f.cool = FOES[f.kind].interval;
        }
      }
      break;
    }
    case 'shove': {
      const near = alive(b).filter((f) => dist(b, f) <= 2.6);
      out.push({ type: 'shove' });
      for (const f of near) {
        if (f.mode === 'windup') out.push({ type: 'interrupt', id: f.id });
        const d = dist(b, f) || 1;
        f.x += ((f.x - b.x) / d) * 1.6;
        f.z += ((f.z - b.z) / d) * 1.6;
        f.mode = 'stagger';
        f.t = 0;
        f.cool = Math.max(f.cool, 1);
      }
      break;
    }
    case 'bandage': {
      if (b.medicine < 1) return out.push({ type: 'denied', ability: a, reason: 'no_medicine' });
      if (b.hp >= b.maxHp) return out.push({ type: 'denied', ability: a, reason: 'full' });
      b.medicine -= 1;
      b.usedMedicine += 1;
      b.healLeft = BATTLE.healTime;
      out.push({ type: 'bandage' });
      break;
    }
  }
  b.cds[a] = ABILITIES[a].cd;
}

// --- Ein Zeitschritt ---------------------------------------------------------------

export function stepBattle(b: BattleState, dt: number, inputs: BattleInput[] = []): BattleEvent[] {
  const out: BattleEvent[] = [];
  if (b.over) return out;
  for (const inp of inputs) {
    if (inp.type === 'flee') {
      b.over = 'fled';
      out.push({ type: 'over', outcome: 'fled' });
      return out;
    }
    if (inp.type === 'target') {
      const f = foeById(b, inp.id);
      if (f && f.mode !== 'dead') {
        b.target = f.id;
        out.push({ type: 'target', id: f.id });
      }
    } else useAbility(b, inp.ability, out);
  }
  b.t += dt;
  for (const k of Object.keys(b.cds) as Ability[]) b.cds[k] = Math.max(0, b.cds[k] - dt);
  b.dodge = Math.max(0, b.dodge - dt);
  b.counter = Math.max(0, b.counter - dt);

  // Verbinden: Heilung über zwei Sekunden verteilt
  if (b.healLeft > 0) {
    const step = Math.min(dt, b.healLeft);
    b.healLeft -= step;
    const amount = (BATTLE.healAmount * step) / BATTLE.healTime;
    const before = b.hp;
    b.hp = Math.min(b.maxHp, b.hp + amount);
    if (b.healLeft <= 0) out.push({ type: 'heal', amount: Math.round(BATTLE.healAmount) });
    void before;
  }

  // Spielfigur: zum Ziel gehen, dann automatisch zuschlagen
  if (b.target === null || foeById(b, b.target)?.mode === 'dead') {
    b.target = nextTarget(b);
    if (b.target !== null) out.push({ type: 'target', id: b.target });
  }
  const tgt = foeById(b, b.target);
  const ws = weaponStats(b);
  b.swing = Math.max(0, b.swing - dt);
  if (tgt) {
    const d = dist(b, tgt);
    b.facing = Math.atan2(tgt.x - b.x, -(tgt.z - b.z));
    if (d > ws.reach && b.dodge <= 0) {
      const stepM = Math.min(d - ws.reach * 0.9, BATTLE.playerSpeed * dt);
      b.x += ((tgt.x - b.x) / d) * stepM;
      b.z += ((tgt.z - b.z) / d) * stepM;
    } else if (b.swing <= 0 && d <= ws.reach + 0.2) {
      out.push({ type: 'swing', target: tgt.id });
      damageFoe(b, tgt, 1, false, out);
      b.swing = ws.interval;
    }
  }

  // Gegner
  for (const f of b.foes) {
    if (f.mode === 'dead') {
      f.t += dt;
      continue;
    }
    const def = FOES[f.kind];
    f.t += dt;
    f.cool -= dt;
    const d = dist(b, f);
    // Wohin? Bis auf Reichweite heran (der Kreischer bleibt auf Abstand)
    const want = def.keepDistance ?? def.reach * 0.9;
    const moveTo = () => {
      const angle = f.slot;
      const tx = b.x + Math.sin(angle) * want;
      const tz = b.z - Math.cos(angle) * want;
      const dx = tx - f.x;
      const dz = tz - f.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.05) {
        const s = Math.min(dd, def.speed * b.foeSpeed * dt);
        f.x += (dx / dd) * s;
        f.z += (dz / dd) * s;
      }
      // Abstand zu anderen Gegnern
      for (const o of b.foes) {
        if (o === f || o.mode === 'dead') continue;
        const ox = f.x - o.x;
        const oz = f.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od > 0 && od < 0.9) {
          f.x += (ox / od) * (0.9 - od) * 0.5;
          f.z += (oz / od) * (0.9 - od) * 0.5;
        }
      }
      // Slot langsam zur aktuellen Richtung ziehen, damit sie nicht um die Figur kreisen
      const cur = Math.atan2(f.x - b.x, -(f.z - b.z));
      let diff = cur - f.slot;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      f.slot += diff * Math.min(1, dt * 0.8);
    };
    switch (f.mode) {
      case 'enter':
      case 'chase': {
        moveTo();
        f.mode = 'chase';
        const ready = f.kind === 'screamer' ? f.cool <= 0 : d <= def.reach + 0.15 && f.cool <= 0;
        if (ready) {
          f.mode = 'windup';
          f.t = 0;
          out.push({ type: 'windup', id: f.id });
        }
        break;
      }
      case 'windup':
        if (f.t >= windupTime(b, f)) {
          f.mode = 'recover';
          f.t = 0;
          f.cool = def.interval;
          if (f.kind === 'screamer' && b.summons < BATTLE.maxSummons) {
            // Kreischen: Verstärkung kommt
            b.summons += 1;
            out.push({ type: 'scream', id: f.id });
            const n = spawn(b, rand(b) < 0.6 ? 'walker' : 'crawler', (rand(b) - 0.5) * 2.2, 9);
            out.push({ type: 'summon', id: n.id, by: f.id });
            break;
          }
          if (f.kind !== 'screamer' && d > def.reach + 0.6) break; // vorbei geschlagen
          if (b.dodge > 0) {
            out.push({ type: 'dodged', by: f.id, perfect: false });
            break;
          }
          const dmg = between(b, def.dmg);
          b.hp = Math.max(0, b.hp - dmg);
          out.push({ type: 'hurt', dmg, by: f.id });
        }
        break;
      case 'recover':
        if (f.t >= 0.6) {
          f.mode = 'chase';
          f.t = 0;
        }
        break;
      case 'stagger':
        if (f.t >= 1.1) {
          f.mode = 'chase';
          f.t = 0;
          f.cool = Math.max(f.cool, 0.6);
        }
        break;
    }
  }

  if (b.hp <= 0) {
    b.over = 'lost';
    out.push({ type: 'over', outcome: 'lost' });
  } else if (!alive(b).length) {
    b.over = 'won';
    out.push({ type: 'over', outcome: 'won' });
  }
  return out;
}

/** Für die Abrechnung: wie viel Gesundheit bleibt (0–10, aufgerundet). */
export function healthAfter(b: BattleState): number {
  return Math.ceil(b.hp / BATTLE.hpPerHealth - 1e-9);
}
