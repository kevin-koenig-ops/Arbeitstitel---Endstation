// Kampf als kurze Taktik, Runde für Runde.
//
// Jede Runde: 3 Kraft und 4 Karten auf der Hand. Karten kommen aus deiner Ausrüstung:
// Grundkarten (Faustschlag, Ausweichen, Tritt, Steinwurf), dazu Karten je heiler Waffe
// und Verbinden, wenn du Medizin dabeihast. Die Gegner zeigen vorher an, was sie vorhaben
// (Angriff mit Schaden, Ausholen, Heulen …). Wer vorne steht, kann zuschlagen; wer hinten
// steht, kommt erst nach vorne (außer dem Heuler, der bleibt hinten und ruft Verstärkung).
//
// Alles hier ist rein und vorhersagbar: gleicher Startwert, gleiche Züge, gleiches Ergebnis.
// Dadurch kann es später auch der Server nachrechnen.

import { BASE_DECK, CARDS, FOE_TACTICS, TACTICS, WEAPON_CARDS, type CardId, type IntentKind } from './content';
import { hashString } from './rng';
import type { FoeKind, Weapon, WeaponId } from './types';

export interface Intent {
  kind: IntentKind;
  dmg?: number;
}

export interface TFoe {
  id: number;
  kind: FoeKind;
  hp: number;
  maxHp: number;
  /** Abwehr (vom Wegducken), gilt bis zu seiner nächsten Aktion. */
  block: number;
  row: 'near' | 'far';
  /** Stelle im Muster seiner Absichten. */
  step: number;
  intent: Intent;
  stunned: boolean;
  /** Wie oft er schon geheult hat (Heuler rufen höchstens zweimal). */
  howls: number;
}

export interface TacticsState {
  /** Zustand des Zufalls (mulberry32). */
  rng: number;
  turn: number;
  hp: number;
  maxHp: number;
  energy: number;
  block: number;
  /** Bonus für den nächsten Wurf/Bolzen. */
  focus: number;
  /** Gepackt: nächste Runde 1 Kraft weniger. */
  grabbed: number;
  hand: CardId[];
  draw: CardId[];
  discard: CardId[];
  foes: TFoe[];
  nextId: number;
  medicine: number;
  usedMedicine: number;
  /** Abnutzung je Waffe in diesem Kampf. */
  wear: Partial<Record<WeaponId, number>>;
  /** Verbleibende Haltbarkeit je Waffe (die beste ihrer Art). */
  weaponDur: Partial<Record<WeaponId, number>>;
  kills: number;
  over: null | 'won' | 'lost' | 'fled';
}

export type TEvent =
  | { type: 'play'; card: CardId; target?: number }
  | { type: 'hit'; id: number; dmg: number; absorbed: number; kill: boolean }
  | { type: 'block'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'push'; id: number }
  | { type: 'stun'; id: number }
  | { type: 'focus'; amount: number }
  | { type: 'hurt'; by: number; dmg: number; absorbed: number }
  | { type: 'grabbed'; by: number }
  | { type: 'advance'; id: number }
  | { type: 'windup'; id: number }
  | { type: 'lurk'; id: number; block: number }
  | { type: 'summon'; by: number; id: number; kind: FoeKind }
  | { type: 'weaponBroke'; weapon: WeaponId }
  | { type: 'turn'; turn: number }
  | { type: 'denied'; reason: 'energy' | 'target' | 'medicine' | 'full' };

// --- Zufall --------------------------------------------------------------------------

function next(st: TacticsState): number {
  let a = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  a = Math.imul(a ^ (a >>> 15), 1 | a);
  a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(st: TacticsState, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next(st) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Aufbau --------------------------------------------------------------------------

/** Die Karten, die du mit deiner Ausrüstung hast. */
export function deckFor(weapons: Weapon[], medicine: number): CardId[] {
  const deck: CardId[] = [...BASE_DECK];
  const kinds = new Set(weapons.filter((w) => w.dur > 0).map((w) => w.kind));
  for (const k of kinds) deck.push(...WEAPON_CARDS[k]);
  for (let i = 0; i < Math.min(TACTICS.maxBandages, medicine); i++) deck.push('bandage');
  return deck;
}

function makeFoe(st: TacticsState, kind: FoeKind, row: 'near' | 'far'): TFoe {
  const def = FOE_TACTICS[kind];
  const f: TFoe = { id: st.nextId++, kind, hp: def.hp, maxHp: def.hp, block: 0, row: def.stayBack ? 'far' : row, step: Math.floor(next(st) * def.pattern.length), intent: { kind: 'advance' }, stunned: false, howls: 0 };
  f.intent = intentOf(f);
  return f;
}

/** Was der Gegner als Nächstes tut (wird angezeigt). */
export function intentOf(f: TFoe): Intent {
  const def = FOE_TACTICS[f.kind];
  if (f.stunned) return { kind: 'stunned' };
  if (f.row === 'far' && !def.stayBack) return { kind: 'advance' };
  const p = def.pattern[f.step % def.pattern.length];
  if (p.kind === 'howl' && f.howls >= TACTICS.maxHowls) return { kind: 'attack', dmg: 1 };
  return { kind: p.kind, dmg: p.dmg };
}

/** mood: Wandler bei Nebel, Regen und nachts zäher, in praller Sonne träge (±2 Gesundheit). */
export function createTactics(o: { seed: string; group: FoeKind[]; weapons: Weapon[]; medicine: number; health: number; maxHealth: number; mood?: 'strong' | 'weak' | null }): TacticsState {
  const st: TacticsState = {
    rng: hashString(o.seed) >>> 0,
    turn: 0,
    hp: o.health,
    maxHp: o.maxHealth,
    energy: 0,
    block: 0,
    focus: 0,
    grabbed: 0,
    hand: [],
    draw: [],
    discard: [],
    foes: [],
    nextId: 1,
    medicine: o.medicine,
    usedMedicine: 0,
    wear: {},
    weaponDur: {},
    kills: 0,
    over: null,
  };
  for (const w of o.weapons) if (w.dur > 0) st.weaponDur[w.kind] = Math.max(st.weaponDur[w.kind] ?? 0, w.dur);
  st.draw = shuffle(st, deckFor(o.weapons, o.medicine));
  let near = 0;
  for (const kind of o.group.slice(0, TACTICS.maxFoes)) {
    const row = !FOE_TACTICS[kind].stayBack && near < 2 ? 'near' : 'far';
    if (row === 'near') near++;
    const f = makeFoe(st, kind, row);
    if (kind === 'walker' && o.mood) f.hp = f.maxHp = f.maxHp + (o.mood === 'strong' ? 2 : -2);
    st.foes.push(f);
  }
  startTurn(st, []);
  return st;
}

export function aliveFoes(st: TacticsState): TFoe[] {
  return st.foes.filter((f) => f.hp > 0);
}

export function foeById(st: TacticsState, id: number): TFoe | undefined {
  return st.foes.find((f) => f.id === id);
}

/** Darf diese Karte diesen Gegner treffen? (nah: nur Gegner vorne) */
export function canTarget(st: TacticsState, card: CardId, id: number): boolean {
  const f = foeById(st, id);
  if (!f || f.hp <= 0) return false;
  const t = CARDS[card].target;
  return t === 'any' || (t === 'near' && f.row === 'near');
}

/** Ziele für eine Karte (leer bei Karten auf dich selbst). */
export function targetsFor(st: TacticsState, card: CardId): TFoe[] {
  return CARDS[card].target === 'self' ? [] : aliveFoes(st).filter((f) => canTarget(st, card, f.id));
}

function drawCards(st: TacticsState, n: number) {
  for (let i = 0; i < n; i++) {
    if (!st.draw.length) {
      if (!st.discard.length) return;
      st.draw = shuffle(st, st.discard);
      st.discard = [];
    }
    st.hand.push(st.draw.pop()!);
  }
}

function startTurn(st: TacticsState, events: TEvent[]) {
  st.turn += 1;
  st.block = 0;
  st.energy = Math.max(1, TACTICS.energy - st.grabbed);
  st.grabbed = 0;
  drawCards(st, TACTICS.hand);
  for (const f of aliveFoes(st)) f.intent = intentOf(f);
  events.push({ type: 'turn', turn: st.turn });
}

function removeWeaponCards(st: TacticsState, w: WeaponId) {
  const drop = (l: CardId[]) => l.filter((c) => CARDS[c].weapon !== w);
  st.hand = drop(st.hand);
  st.draw = drop(st.draw);
  st.discard = drop(st.discard);
}

/** Schaden an einem Gegner: erst Rüstung, dann seine Abwehr. */
function damageFoe(st: TacticsState, f: TFoe, raw: number, events: TEvent[]) {
  const afterArmor = Math.max(raw > 0 ? 1 : 0, raw - FOE_TACTICS[f.kind].armor);
  const absorbed = Math.min(f.block, afterArmor);
  f.block -= absorbed;
  const dmg = afterArmor - absorbed;
  f.hp = Math.max(0, f.hp - dmg);
  const kill = f.hp === 0;
  if (kill) st.kills += 1;
  events.push({ type: 'hit', id: f.id, dmg, absorbed, kill });
}

// --- Züge ----------------------------------------------------------------------------

/** Eine Karte aus der Hand spielen (target: Gegner-id bei Angriffskarten). */
export function playCard(st: TacticsState, handIndex: number, target?: number): TEvent[] {
  const events: TEvent[] = [];
  if (st.over) return events;
  const card = st.hand[handIndex];
  if (!card) return events;
  const def = CARDS[card];
  if (st.energy < def.cost) return [{ type: 'denied', reason: 'energy' }];
  if (def.medicine && st.medicine < 1) return [{ type: 'denied', reason: 'medicine' }];
  if (def.heal && st.hp >= st.maxHp) return [{ type: 'denied', reason: 'full' }];
  let foe: TFoe | undefined;
  if (def.target !== 'self') {
    const options = targetsFor(st, card);
    foe = target !== undefined && canTarget(st, card, target) ? foeById(st, target) : options.length === 1 ? options[0] : undefined;
    if (!foe) return [{ type: 'denied', reason: 'target' }];
  }
  st.energy -= def.cost;
  st.hand.splice(handIndex, 1);
  st.discard.push(card);
  events.push({ type: 'play', card, target: foe?.id });

  if (foe && def.dmg) {
    let raw = def.dmg;
    if (def.target === 'any' && st.focus) {
      raw += st.focus;
      st.focus = 0;
    }
    damageFoe(st, foe, raw, events);
  }
  if (foe && foe.hp > 0 && def.push && foe.row === 'near') {
    foe.row = 'far';
    // Ausholen ist unterbrochen: er fängt sein Muster von vorne an
    const p = FOE_TACTICS[foe.kind].pattern[foe.step % FOE_TACTICS[foe.kind].pattern.length];
    if (p.kind === 'windup' || p.kind === 'smash') foe.step = 0;
    foe.intent = intentOf(foe);
    events.push({ type: 'push', id: foe.id });
  }
  if (foe && foe.hp > 0 && def.stun) {
    foe.stunned = true;
    foe.intent = intentOf(foe);
    events.push({ type: 'stun', id: foe.id });
  }
  if (def.block) {
    st.block += def.block;
    events.push({ type: 'block', amount: def.block });
  }
  if (def.heal) {
    st.medicine -= 1;
    st.usedMedicine += 1;
    const amount = Math.min(def.heal, st.maxHp - st.hp);
    st.hp += amount;
    events.push({ type: 'heal', amount });
  }
  if (def.focus) {
    st.focus += def.focus;
    events.push({ type: 'focus', amount: def.focus });
  }
  if (def.weapon) {
    const w = def.weapon;
    st.wear[w] = (st.wear[w] ?? 0) + 1;
    st.weaponDur[w] = (st.weaponDur[w] ?? 1) - 1;
    if ((st.weaponDur[w] ?? 0) <= 0) {
      removeWeaponCards(st, w);
      events.push({ type: 'weaponBroke', weapon: w });
    }
  }
  if (!aliveFoes(st).length) st.over = 'won';
  return events;
}

/** Runde beenden: die Gegner handeln, dann beginnt deine nächste Runde. */
export function endTurn(st: TacticsState): TEvent[] {
  const events: TEvent[] = [];
  if (st.over) return events;
  st.discard.push(...st.hand);
  st.hand = [];
  // Vorne zuerst, dann hinten
  const order = [...aliveFoes(st)].sort((a, b) => (a.row === b.row ? 0 : a.row === 'near' ? -1 : 1));
  for (const f of order) {
    if (f.hp <= 0 || st.over) continue;
    const intent = intentOf(f);
    f.block = 0;
    if (f.stunned) {
      f.stunned = false;
      continue;
    }
    if (intent.kind === 'advance') {
      if (aliveFoes(st).filter((x) => x.row === 'near').length < 3) {
        f.row = 'near';
        events.push({ type: 'advance', id: f.id });
      }
      continue;
    }
    const def = FOE_TACTICS[f.kind];
    f.step = (f.step + 1) % def.pattern.length;
    switch (intent.kind) {
      case 'attack':
      case 'smash':
      case 'grab': {
        const raw = intent.dmg ?? 0;
        const absorbed = Math.min(st.block, raw);
        st.block -= absorbed;
        const dmg = raw - absorbed;
        st.hp = Math.max(0, st.hp - dmg);
        events.push({ type: 'hurt', by: f.id, dmg, absorbed });
        if (intent.kind === 'grab') {
          st.grabbed = 1;
          events.push({ type: 'grabbed', by: f.id });
        }
        if (st.hp <= 0) st.over = 'lost';
        break;
      }
      case 'windup':
        events.push({ type: 'windup', id: f.id });
        break;
      case 'lurk':
        f.block = 2;
        events.push({ type: 'lurk', id: f.id, block: 2 });
        break;
      case 'howl':
        if (aliveFoes(st).length < TACTICS.maxFoes && f.howls < TACTICS.maxHowls) {
          f.howls += 1;
          const nf = makeFoe(st, 'walker', 'far');
          st.foes.push(nf);
          events.push({ type: 'summon', by: f.id, id: nf.id, kind: 'walker' });
        }
        break;
      default:
        break;
    }
  }
  if (!st.over) startTurn(st, events);
  return events;
}

export function flee(st: TacticsState) {
  if (!st.over) st.over = 'fled';
}
