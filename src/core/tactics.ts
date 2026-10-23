// Kampf als kurze Taktik, Runde für Runde.
//
// Jede Runde: 3 Kraft und 4 Karten auf der Hand. Karten kommen aus deiner Ausrüstung:
// Grundkarten (Faustschlag, Ausweichen, Tritt, Steinwurf), dazu Karten je heiler Waffe
// und Verbinden, wenn du Medizin dabeihast. Die Gegner zeigen vorher an, was sie vorhaben
// (Angriff mit Schaden, Ausholen, Heulen …). Wer vorne steht, kann zuschlagen; wer hinten
// steht, kommt erst nach vorne (außer dem Heuler, der bleibt hinten und ruft Verstärkung).
// Der Bleiche Wächter (nur nachts) starrt dich an, weicht ins Dunkel zurück und springt dich an.
// Dazu kommen Einmal-Karten (Brandflasche, Granate …) und Fähigkeiten (Konter, Rundumschlag …,
// mit Stufen I–III; manche wirken von selbst). Einmal-Karten liegen nicht im Stapel, sondern in
// der Tasche (3 Plätze): Man kann sie jederzeit spielen, danach sind sie weg. Zustände der Gegner:
// Brennt (Schaden jede Runde), Geblendet (nächster Angriff geht daneben), Verlangsamt (kommt nicht
// nach vorn), Still (Heuler rufen niemanden).
//
// Alles hier ist rein und vorhersagbar: gleicher Startwert, gleiche Züge, gleiches Ergebnis.
// Dadurch kann es später auch der Server nachrechnen.

import { BASE_DECK, CARDS, cardStat, FOE_TACTICS, ONCE_CARRY, POUCH_SLOTS, TACTICS, WEAPON_CARDS, type CardId, type CardStat, type IntentKind } from './content';
import { hashString } from './rng';
import type { FoeKind, Opening, Weapon, WeaponId } from './types';

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
  /** Zustände: Brennt (Runden), Geblendet (verfehlt so oft), Verlangsamt (Runden), Still (Runden). */
  burn: number;
  blind: number;
  slow: number;
  silence: number;
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
  /** Angestarrt: nächste Runde 1 Karte weniger. */
  dazed: number;
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
  /** Konter: wer dich bis zu deiner nächsten Runde trifft, nimmt so viel Schaden. */
  thorns: number;
  /** Ein Hund kämpft mit (Rudelführer). */
  ally: { rounds: number; dmg: number } | null;
  /** Tasche: Einmal-Karten, die noch übrig sind (jederzeit spielbar, nicht im Stapel). */
  pouch: Partial<Record<CardId, number>>;
  /** Ausgespielte Einmal-Karten (die sind danach weg). */
  used: Partial<Record<CardId, number>>;
  /** Wie oft eine Karte diese Runde schon gespielt wurde (für „einmal pro Runde“). */
  turnPlays: Partial<Record<CardId, number>>;
  /** Stufe der Fähigkeiten (1–3). */
  levels: Partial<Record<CardId, number>>;
  /** Zweiter Atem: so viel Heilung, einmal pro Kampf (0 = hast du nicht). */
  secondWind: number;
  secondWindUsed: boolean;
  /** Letztes Gefecht: heute noch verfügbar, und ob es in diesem Kampf ausgelöst hat. */
  lastStand: boolean;
  lastStandUsed: boolean;
  /** Glut: Alles, was du anzündest, brennt so viele Runden länger. */
  burnBonus: number;
  /** Lauffeuer: Fällt ein brennender Gegner, brennt der nächste so lange (0 = hast du nicht). */
  spread: number;
}

/** Was du an Sammelkarten mitbringst: Einmal-Karten in der Tasche (Anzahl) und Fähigkeiten (Stufe). */
export interface CardKit {
  pouch?: Partial<Record<CardId, number>>;
  skills?: Partial<Record<CardId, number>>;
  /** Letztes Gefecht ist heute noch frei. */
  lastStand?: boolean;
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
  | { type: 'stare'; by: number }
  | { type: 'fade'; id: number }
  | { type: 'pounce'; id: number }
  | { type: 'advance'; id: number }
  | { type: 'windup'; id: number }
  | { type: 'lurk'; id: number; block: number }
  | { type: 'summon'; by: number; id: number; kind: FoeKind }
  | { type: 'weaponBroke'; weapon: WeaponId }
  | { type: 'turn'; turn: number }
  | { type: 'burn'; id: number; dmg: number; kill: boolean }
  | { type: 'spread'; from: number; id: number }
  | { type: 'status'; id: number; status: 'burn' | 'blind' | 'slow' | 'silence' | 'interrupt' }
  | { type: 'miss'; id: number }
  | { type: 'ally'; id: number; dmg: number; kill: boolean }
  | { type: 'allyIn'; rounds: number }
  | { type: 'thorns'; id: number; dmg: number; kill: boolean }
  | { type: 'draw'; n: number }
  | { type: 'gain'; amount: number }
  | { type: 'secondWind'; amount: number }
  | { type: 'lastStand' }
  | { type: 'denied'; reason: 'energy' | 'target' | 'medicine' | 'full' | 'limit' };

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

/** Die Karten, die du mit deiner Ausrüstung hast (dazu aktive Fähigkeiten; Einmal-Karten liegen in der Tasche). */
export function deckFor(weapons: Weapon[], medicine: number, kit: CardKit = {}): CardId[] {
  const deck: CardId[] = [...BASE_DECK];
  const kinds = new Set(weapons.filter((w) => w.dur > 0).map((w) => w.kind));
  for (const k of kinds) deck.push(...WEAPON_CARDS[k]);
  for (let i = 0; i < Math.min(TACTICS.maxBandages, medicine); i++) deck.push('bandage');
  for (const [id, lvl] of Object.entries(kit.skills ?? {}) as [CardId, number][]) {
    if (CARDS[id]?.kind === 'skill' && !CARDS[id].passive && lvl > 0) deck.push(id);
  }
  return deck;
}

/** Die Tasche: höchstens 3 Sorten Einmal-Karten, je bis zu 3 Stück. */
export function pouchFor(kit: CardKit = {}): Partial<Record<CardId, number>> {
  const out: Partial<Record<CardId, number>> = {};
  let slots = 0;
  for (const [id, n] of Object.entries(kit.pouch ?? {}) as [CardId, number][]) {
    if (CARDS[id]?.kind !== 'once' || !(n > 0) || slots >= POUCH_SLOTS) continue;
    out[id] = Math.min(ONCE_CARRY, Math.floor(n));
    slots++;
  }
  return out;
}

function makeFoe(st: TacticsState, kind: FoeKind, row: 'near' | 'far'): TFoe {
  const def = FOE_TACTICS[kind];
  const f: TFoe = { id: st.nextId++, kind, hp: def.hp, maxHp: def.hp, block: 0, row: def.stayBack ? 'far' : row, step: Math.floor(next(st) * def.pattern.length), intent: { kind: 'advance' }, stunned: false, howls: 0, burn: 0, blind: 0, slow: 0, silence: 0 };
  f.intent = intentOf(f);
  return f;
}

/** Was der Gegner als Nächstes tut (wird angezeigt). */
export function intentOf(f: TFoe): Intent {
  const def = FOE_TACTICS[f.kind];
  if (f.stunned) return { kind: 'stunned' };
  const p = def.pattern[f.step % def.pattern.length];
  // Der Sprung kommt von hinten: dafür muss er nicht erst nach vorne
  if (f.row === 'far' && !def.stayBack && p.kind !== 'pounce') return { kind: 'advance' };
  if (f.row === 'near' && p.kind === 'pounce') return { kind: 'attack', dmg: p.dmg };
  if (p.kind === 'howl' && f.howls >= TACTICS.maxHowls) return { kind: 'attack', dmg: 1 };
  return { kind: p.kind, dmg: p.dmg };
}

/**
 * mood: Wandler bei Nebel, Regen und nachts zäher, in praller Sonne träge (±2 Gesundheit).
 * opening: Überraschungsangriff aus dem Versteck (Gegner setzen die erste Runde aus, du hast
 * 1 Kraft mehr) oder entdeckt worden (1 Kraft weniger in der ersten Runde).
 * cold: Kälte ohne warme Kleidung (erste Runde 1 Karte weniger).
 * thirst: Hitze ohne Wasser (erste Runde 1 Kraft weniger).
 */
export function createTactics(o: {
  seed: string;
  group: FoeKind[];
  weapons: Weapon[];
  medicine: number;
  health: number;
  maxHealth: number;
  mood?: 'strong' | 'weak' | null;
  armor?: number;
  opening?: Opening;
  cold?: boolean;
  thirst?: boolean;
  /** Einmal-Karten und Fähigkeiten, die du mitbringst. */
  kit?: CardKit;
}): TacticsState {
  const kit = o.kit ?? {};
  const lvl = (id: CardId) => kit.skills?.[id] ?? 0;
  const st: TacticsState = {
    rng: hashString(o.seed) >>> 0,
    turn: 0,
    hp: o.health,
    maxHp: o.maxHealth,
    energy: 0,
    block: 0,
    focus: 0,
    grabbed: 0,
    dazed: 0,
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
    thorns: 0,
    ally: null,
    pouch: pouchFor(kit),
    used: {},
    turnPlays: {},
    levels: { ...(kit.skills ?? {}) },
    secondWind: lvl('secondwind') ? cardStat('secondwind', 'heal', lvl('secondwind')) : 0,
    secondWindUsed: false,
    lastStand: !!kit.lastStand && lvl('laststand') > 0,
    lastStandUsed: false,
    burnBonus: lvl('embers') ? cardStat('embers', 'burn', lvl('embers')) : 0,
    spread: lvl('wildfire') ? cardStat('wildfire', 'burn', lvl('wildfire')) : 0,
  };
  for (const w of o.weapons) if (w.dur > 0) st.weaponDur[w.kind] = Math.max(st.weaponDur[w.kind] ?? 0, w.dur);
  st.draw = shuffle(st, deckFor(o.weapons, o.medicine, kit));
  let near = 0;
  for (const kind of o.group.slice(0, TACTICS.maxFoes)) {
    const row = !FOE_TACTICS[kind].stayBack && near < 2 ? 'near' : 'far';
    if (row === 'near') near++;
    const f = makeFoe(st, kind, row);
    if (kind === 'walker' && o.mood) f.hp = f.maxHp = f.maxHp + (o.mood === 'strong' ? 2 : -2);
    st.foes.push(f);
  }
  startTurn(st, []);
  // Ausrüstung (Helm, Weste …): Abwehr in der ersten Runde
  st.block += Math.max(0, o.armor ?? 0);
  if (o.opening === 'surprise') {
    for (const f of st.foes) {
      f.stunned = true;
      f.intent = intentOf(f);
    }
    st.energy += 1;
  } else if (o.opening === 'spotted') st.energy = Math.max(1, st.energy - 1);
  // Leise Sohlen: Wer dich nicht entdeckt hat, fängt eine Runde später an (ab Stufe II: 1 Kraft mehr)
  if (lvl('sneak') && o.opening !== 'spotted') {
    for (const f of st.foes) {
      f.stunned = true;
      f.intent = intentOf(f);
    }
    if (lvl('sneak') >= 2) st.energy += 1;
  }
  if (o.thirst) st.energy = Math.max(1, st.energy - 1);
  if (o.cold && st.hand.length > 2) st.draw.push(st.hand.pop()!);
  return st;
}

/** Kann diese Gegnerart Hilfe rufen (Heuler)? Nur bei denen zählt „Still“. */
export function canHowl(kind: FoeKind): boolean {
  return FOE_TACTICS[kind].pattern.some((p) => p.kind === 'howl');
}

export function aliveFoes(st: TacticsState): TFoe[] {
  return st.foes.filter((f) => f.hp > 0);
}

export function foeById(st: TacticsState, id: number): TFoe | undefined {
  return st.foes.find((f) => f.id === id);
}

/** Darf diese Karte diesen Gegner treffen? (nah: nur vorne; fern: nur hinten) */
export function canTarget(st: TacticsState, card: CardId, id: number): boolean {
  const f = foeById(st, id);
  if (!f || f.hp <= 0) return false;
  const t = CARDS[card].target;
  return t === 'any' || (t === 'near' && f.row === 'near') || (t === 'far' && f.row === 'far');
}

/** Wert einer Karte auf ihrer Stufe in diesem Kampf. */
function stat(st: TacticsState, card: CardId, s: CardStat): number {
  return cardStat(card, s, st.levels[card] ?? 1);
}

/** Wen eine Karte ohne Zielwahl trifft (alle vorne, hinten oder alle). */
function areaFoes(st: TacticsState, area: 'near' | 'far' | 'all'): TFoe[] {
  return aliveFoes(st).filter((f) => area === 'all' || f.row === area);
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
  st.thorns = 0;
  st.turnPlays = {};
  st.energy = Math.max(1, TACTICS.energy - st.grabbed);
  st.grabbed = 0;
  drawCards(st, Math.max(2, TACTICS.hand - st.dazed));
  st.dazed = 0;
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
  if (kill) spreadFire(st, f, events);
}

/** Anzünden: Brennt so viele Runden (Glut verlängert). */
function setBurn(st: TacticsState, f: TFoe, rounds: number, events: TEvent[]) {
  f.burn = Math.max(f.burn, rounds + st.burnBonus);
  events.push({ type: 'status', id: f.id, status: 'burn' });
}

/** Lauffeuer: Ein brennender Gegner fällt, der nächste fängt Feuer (vorne zuerst). */
function spreadFire(st: TacticsState, dead: TFoe, events: TEvent[]) {
  if (!st.spread || dead.burn <= 0) return;
  dead.burn = 0;
  const next = aliveFoes(st)
    .filter((x) => x.id !== dead.id)
    .sort((a, b) => (a.row === b.row ? a.id - b.id : a.row === 'near' ? -1 : 1))[0];
  if (!next) return;
  events.push({ type: 'spread', from: dead.id, id: next.id });
  setBurn(st, next, st.spread, events);
}

// --- Züge ----------------------------------------------------------------------------

/** Ausholen unterbrechen: Der Gegner fängt sein Muster von vorne an. */
function interrupt(f: TFoe) {
  const pattern = FOE_TACTICS[f.kind].pattern;
  const p = pattern[f.step % pattern.length];
  if (p.kind === 'windup' || p.kind === 'smash') f.step = 0;
  f.intent = intentOf(f);
}

/** Eine Karte aus der Hand spielen (target: Gegner-id bei Karten mit Zielwahl). */
export function playCard(st: TacticsState, handIndex: number, target?: number): TEvent[] {
  const card = st.hand[handIndex];
  if (st.over || !card) return [];
  return resolve(st, card, target, () => {
    st.hand.splice(handIndex, 1);
    // Einmal-Karten sind danach weg, alles andere kommt auf den Ablagestapel
    if (CARDS[card].kind === 'once') st.used[card] = (st.used[card] ?? 0) + 1;
    else st.discard.push(card);
  });
}

/** Eine Einmal-Karte aus der Tasche spielen (jederzeit, solange Kraft da ist). */
export function playPouch(st: TacticsState, card: CardId, target?: number): TEvent[] {
  if (st.over || !((st.pouch[card] ?? 0) > 0)) return [];
  return resolve(st, card, target, () => {
    st.pouch[card] = (st.pouch[card] ?? 0) - 1;
    st.used[card] = (st.used[card] ?? 0) + 1;
  });
}

/** Kann diese Karte gerade gespielt werden? (Kraft, Medizin, Ziel …) */
export function playable(st: TacticsState, card: CardId): boolean {
  const def = CARDS[card];
  return (
    def.cost <= st.energy &&
    (!def.medicine || st.medicine > 0) &&
    (!def.heal || !!def.gain || st.hp < st.maxHp) &&
    (!def.perTurn || (st.turnPlays[card] ?? 0) < def.perTurn) &&
    (def.target === 'self' ? !def.area || !!areaFoes(st, def.area).length || !!def.block || !!def.heal : targetsFor(st, card).length > 0)
  );
}

/** Die Wirkung einer Karte (take: nimmt sie aus Hand oder Tasche). */
function resolve(st: TacticsState, card: CardId, target: number | undefined, take: () => void): TEvent[] {
  const events: TEvent[] = [];
  const def = CARDS[card];
  if (st.energy < def.cost) return [{ type: 'denied', reason: 'energy' }];
  if (def.medicine && st.medicine < 1) return [{ type: 'denied', reason: 'medicine' }];
  if (def.heal && !def.gain && st.hp >= st.maxHp) return [{ type: 'denied', reason: 'full' }];
  if (def.perTurn && (st.turnPlays[card] ?? 0) >= def.perTurn) return [{ type: 'denied', reason: 'limit' }];
  let foe: TFoe | undefined;
  if (def.target !== 'self') {
    const options = targetsFor(st, card);
    foe = target !== undefined && canTarget(st, card, target) ? foeById(st, target) : options.length === 1 ? options[0] : undefined;
    if (!foe) return [{ type: 'denied', reason: 'target' }];
  }
  if (def.area && !areaFoes(st, def.area).length && !def.block && !def.heal) return [{ type: 'denied', reason: 'target' }];
  st.energy -= def.cost;
  take();
  st.turnPlays[card] = (st.turnPlays[card] ?? 0) + 1;
  events.push({ type: 'play', card, target: foe?.id });

  const targets = def.area ? areaFoes(st, def.area) : foe ? [foe] : [];
  let first = true;
  for (const f of targets) {
    let raw = stat(st, card, 'dmg');
    if (first && def.target === 'any' && raw && st.focus) {
      raw += st.focus;
      st.focus = 0;
    }
    if (def.vs && f.kind === def.vs.kind) raw += def.vs.dmg;
    if (raw > 0) damageFoe(st, f, raw, events);
    applyEffects(st, card, f, events);
    // Nagel: trifft noch einen zweiten
    if (first && def.chain) {
      const other = aliveFoes(st)
        .filter((x) => x.id !== f.id)
        .sort((x, y) => (x.row === y.row ? 0 : x.row === 'near' ? -1 : 1))[0];
      if (other) damageFoe(st, other, stat(st, card, 'dmg'), events);
    }
    first = false;
  }
  const block = stat(st, card, 'block');
  if (block) {
    st.block += block;
    events.push({ type: 'block', amount: block });
  }
  const heal = def.passive ? 0 : stat(st, card, 'heal');
  if (heal) {
    if (def.medicine) {
      st.medicine -= 1;
      st.usedMedicine += 1;
    }
    const amount = Math.min(heal, st.maxHp - st.hp);
    st.hp += amount;
    if (amount) events.push({ type: 'heal', amount });
  }
  const gain = stat(st, card, 'gain');
  if (gain) {
    st.energy += gain;
    events.push({ type: 'gain', amount: gain });
  }
  const draw = stat(st, card, 'draw');
  if (draw) {
    const before = st.hand.length;
    drawCards(st, draw);
    events.push({ type: 'draw', n: st.hand.length - before });
  }
  const focus = stat(st, card, 'focus');
  if (focus) {
    st.focus += focus;
    events.push({ type: 'focus', amount: focus });
  }
  const thorns = stat(st, card, 'thorns');
  if (thorns) st.thorns += thorns;
  if (def.ally) {
    st.ally = { rounds: def.ally.rounds, dmg: stat(st, card, 'allyDmg') };
    events.push({ type: 'allyIn', rounds: def.ally.rounds });
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

/** Was eine Karte am Gegner bewirkt (außer Schaden). */
function applyEffects(st: TacticsState, card: CardId, f: TFoe, events: TEvent[]) {
  if (f.hp <= 0) return;
  const def = CARDS[card];
  const pushIt = (def.push || (def.vs?.push && f.kind === def.vs.kind)) && f.row === 'near';
  if (pushIt) {
    f.row = 'far';
    interrupt(f);
    events.push({ type: 'push', id: f.id });
  }
  if (def.interrupt) {
    interrupt(f);
    events.push({ type: 'status', id: f.id, status: 'interrupt' });
  }
  if (def.stun) {
    f.stunned = true;
    f.intent = intentOf(f);
    events.push({ type: 'stun', id: f.id });
  }
  const burn = stat(st, card, 'burn');
  if (burn) setBurn(st, f, burn, events);
  if (def.blind) {
    f.blind += def.blind;
    events.push({ type: 'status', id: f.id, status: 'blind' });
  }
  if (def.slow) {
    f.slow = Math.max(f.slow, def.slow);
    events.push({ type: 'status', id: f.id, status: 'slow' });
  }
  if (def.silence) {
    f.silence = Math.max(f.silence, def.silence);
    // Gemeldet wird es nur bei denen, die heulen können
    if (canHowl(f.kind)) events.push({ type: 'status', id: f.id, status: 'silence' });
  }
}

/** Runde beenden: die Gegner handeln, dann beginnt deine nächste Runde. */
export function endTurn(st: TacticsState): TEvent[] {
  const events: TEvent[] = [];
  if (st.over) return events;
  st.discard.push(...st.hand);
  st.hand = [];
  // Der Hund (Rudelführer) beißt zu: den Schwächsten vorne, sonst irgendwen
  if (st.ally) {
    const t = [...aliveFoes(st)].sort((a, b) => (a.row === b.row ? a.hp - b.hp : a.row === 'near' ? -1 : 1))[0];
    if (t) {
      const before = st.kills;
      const extra: TEvent[] = [];
      damageFoe(st, t, st.ally.dmg, extra);
      events.push({ type: 'ally', id: t.id, dmg: st.ally.dmg, kill: st.kills > before }, ...extra.filter((e) => e.type !== 'hit'));
    }
    st.ally.rounds -= 1;
    if (st.ally.rounds <= 0) st.ally = null;
  }
  // Vorne zuerst, dann hinten
  const order = [...aliveFoes(st)].sort((a, b) => (a.row === b.row ? 0 : a.row === 'near' ? -1 : 1));
  for (const f of order) {
    if (f.hp <= 0 || st.over) continue;
    // Brennt: Schaden vor seinem Zug (Wandler brennen doppelt)
    if (f.burn > 0) {
      f.burn -= 1;
      const dmg = Math.min(f.hp, f.kind === 'walker' ? 2 : 1);
      f.hp -= dmg;
      const kill = f.hp <= 0;
      if (kill) st.kills += 1;
      events.push({ type: 'burn', id: f.id, dmg, kill });
      if (kill) {
        // Lauffeuer: Es brannte ja noch (die letzte Runde zählt mit)
        f.burn = Math.max(f.burn, 1);
        spreadFire(st, f, events);
        continue;
      }
    }
    const slowed = f.slow > 0;
    if (f.slow > 0) f.slow -= 1;
    const silenced = f.silence > 0;
    if (f.silence > 0) f.silence -= 1;
    const intent = intentOf(f);
    f.block = 0;
    if (f.stunned) {
      f.stunned = false;
      continue;
    }
    if (intent.kind === 'advance') {
      if (slowed) {
        events.push({ type: 'status', id: f.id, status: 'slow' });
        continue;
      }
      if (aliveFoes(st).filter((x) => x.row === 'near').length < 3) {
        f.row = 'near';
        events.push({ type: 'advance', id: f.id });
      }
      continue;
    }
    const def = FOE_TACTICS[f.kind];
    f.step = (f.step + 1) % def.pattern.length;
    switch (intent.kind) {
      case 'pounce':
      case 'attack':
      case 'smash':
      case 'grab': {
        if (intent.kind === 'pounce') {
          // Aus dem Dunkel nach vorne gesprungen, dann zugeschlagen
          f.row = 'near';
          events.push({ type: 'pounce', id: f.id });
        }
        // Geblendet: Der Angriff geht daneben
        if (f.blind > 0) {
          f.blind -= 1;
          events.push({ type: 'miss', id: f.id });
          break;
        }
        const raw = intent.dmg ?? 0;
        const absorbed = Math.min(st.block, raw);
        st.block -= absorbed;
        let dmg = raw - absorbed;
        // Letztes Gefecht: ein tödlicher Treffer lässt dich mit 1 stehen
        if (dmg >= st.hp && st.lastStand && !st.lastStandUsed) {
          dmg = st.hp - 1;
          st.lastStandUsed = true;
          events.push({ type: 'lastStand' });
        }
        st.hp = Math.max(0, st.hp - dmg);
        events.push({ type: 'hurt', by: f.id, dmg, absorbed });
        // Konter: wer zuschlägt, nimmt Schaden
        if (st.thorns > 0 && f.hp > 0) {
          const before = st.kills;
          const extra: TEvent[] = [];
          damageFoe(st, f, st.thorns, extra);
          events.push({ type: 'thorns', id: f.id, dmg: st.thorns, kill: st.kills > before }, ...extra.filter((e) => e.type !== 'hit'));
        }
        if (intent.kind === 'grab') {
          st.grabbed = 1;
          events.push({ type: 'grabbed', by: f.id });
        }
        // Zweiter Atem: einmal pro Kampf, wenn es knapp wird
        if (st.hp > 0 && st.hp < 3 && st.secondWind && !st.secondWindUsed) {
          st.secondWindUsed = true;
          const amount = Math.min(st.secondWind, st.maxHp - st.hp);
          st.hp += amount;
          events.push({ type: 'secondWind', amount });
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
      case 'stare':
        // Wie gelähmt: eine Karte und eine Kraft weniger
        st.dazed = 1;
        st.grabbed = 1;
        events.push({ type: 'stare', by: f.id });
        break;
      case 'fade':
        f.row = 'far';
        f.block = 2;
        events.push({ type: 'fade', id: f.id });
        break;
      case 'howl':
        if (silenced) {
          events.push({ type: 'status', id: f.id, status: 'silence' });
          break;
        }
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
  if (!st.over && !aliveFoes(st).length) st.over = 'won';
  if (!st.over) startTurn(st, events);
  return events;
}

export function flee(st: TacticsState) {
  if (!st.over) st.over = 'fled';
}
