// Kampf als kurze Taktik, Runde für Runde.
//
// Jede Runde: 3 Kraft und 4 Karten auf der Hand. Karten kommen aus deiner Ausrüstung:
// Grundkarten (Faustschlag, Ausweichen, Tritt, Steinwurf), dazu Karten je heiler Waffe
// und Verbinden, wenn du Medizin dabeihast. Die Gegner zeigen vorher an, was sie vorhaben
// (Angriff mit Schaden, Ausholen, Heulen …). Wer vorne steht, kann zuschlagen; wer hinten
// steht, kommt erst nach vorne (außer dem Heuler, der bleibt hinten und ruft Verstärkung).
// Der Bleiche Wächter (nur nachts) starrt dich an, weicht ins Dunkel zurück und springt dich an.
// Wirte aus dem Bestiarium: Das Gewohnheitstier tut nichts, bis man es stört; der Leithammel
// treibt die anderen an; der Hüne lässt sich nicht wegtreten und wirft dich; der Schläfer schläft
// (Treffer doppelt) und überfällt dich beim Aufwachen; der Kalkkopf rammt und taumelt danach;
// der Erstarrte ist steif vor Kälte (Feuer taut ihn auf); der Hamsterer verteidigt seinen Haufen;
// der Brüller ruft und brüllt die anderen stark.
// Wilde Menschen (Welle 2): Der Verwilderte schießt aus dem Gebüsch und legt Schlingen; Wegelagerer
// kommen zu dritt (Schildträger vorn, Armbrustschütze hinten, Langfinger klaut Medizin); der
// Schrotter wirft Netz und Brandflasche; der Treiber der Kalkjünger lässt Wandler von der Kette;
// Deserteure halten den Schildwall, ihr Feldwebel führt; der Fieberkranke bittet um Medizin.
// Dazu kommen Einmal-Karten (Brandflasche, Granate …) und Fähigkeiten (Konter, Rundumschlag …,
// mit Stufen I–III; manche wirken von selbst). Einmal-Karten liegen nicht im Stapel, sondern in
// der Tasche (3 Plätze): Man kann sie jederzeit spielen, danach sind sie weg. Zustände der Gegner:
// Brennt (Schaden jede Runde), Geblendet (nächster Angriff geht daneben), Verlangsamt (kommt nicht
// nach vorn), Still (Heuler rufen niemanden).
//
// Alles hier ist rein und vorhersagbar: gleicher Startwert, gleiche Züge, gleiches Ergebnis.
// Dadurch kann es später auch der Server nachrechnen.

import { BASE_DECK, CARDS, cardAmmoKind, cardStat, DEVICES, FOE_RULES, FOE_TACTICS, gunAmmo, MAX_DEVICES, ONCE_CARRY, POUCH_SLOTS, STANCE, TACTICS, WEAPON_CARDS, WEAPONS, type CardId, type CardStat, type DeviceId, type IntentKind, type Stance } from './content';
import { hashString } from './rng';
import type { AmmoId, FoeKind, Opening, Weapon, WeaponId } from './types';

export interface Intent {
  kind: IntentKind;
  dmg?: number;
  /** Abwehr, die er sich verschafft (Hamsterer auf seinem Haufen). */
  block?: number;
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
  /** Gerade aus der Betäubung erwacht: lässt sich bis zu seiner nächsten Aktion nicht erneut betäuben. */
  steady: boolean;
  /** Wie oft er schon geheult hat (Heuler rufen höchstens zweimal). */
  howls: number;
  /** Zustände: Brennt (Runden), Geblendet (verfehlt so oft), Verlangsamt (Runden), Still (Runden). */
  burn: number;
  blind: number;
  slow: number;
  silence: number;
  /** Gewohnheitstier: geht noch seiner Wege (bis ihn ein Treffer stört). */
  calm: boolean;
  /** Schläfer: schläft noch so viele Runden. */
  sleep: number;
  /** Schläfer: gerade aufgewacht, als Nächstes kommt der Überfall. */
  ambush: boolean;
  /** Erstarrter: noch so viele Runden steif vor Kälte. */
  frozen: number;
  /** Durch Feuer aufgetaut und wütend (schlägt härter). */
  thawed: boolean;
  /** Vom Brüller aufgestachelt: der nächste Angriff macht mehr. */
  roused: boolean;
  /** Fieberkranker: bittet noch so viele Runden um Medizin. */
  plead: number;
  /** Langfinger: so viel Medizin hat er dir abgenommen. */
  loot: number;
  /** Nicht mehr im Kampf, aber nicht besiegt: davongerannt oder mit Medizin gegangen. */
  gone: boolean;
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
  /** Munition je Sorte (Schusswaffen) und was davon verschossen ist. */
  ammo: Partial<Record<AmmoId, number>>;
  usedAmmo: Partial<Record<AmmoId, number>>;
  /** Laute Schüsse in diesem Kampf (auf der Karte kommen danach Trupps nachsehen). */
  shots: number;
  /** Abnutzung je Waffe in diesem Kampf. */
  wear: Partial<Record<WeaponId, number>>;
  /** Verbleibende Haltbarkeit je Waffe (die beste ihrer Art). */
  weaponDur: Partial<Record<WeaponId, number>>;
  kills: number;
  /** spared: Es gab nichts zu besiegen, nur Fieberkranke, die mit Medizin gegangen sind. */
  over: null | 'won' | 'lost' | 'fled' | 'spared';
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
  /** Zweiter Atem: so viel Heilung nach einer Runde der Gegner ganz ohne Schaden (0 = hast du nicht). */
  secondWind: number;
  secondWindUsed: boolean;
  /** Letztes Gefecht: heute noch verfügbar, und ob es in diesem Kampf ausgelöst hat. */
  lastStand: boolean;
  lastStandUsed: boolean;
  /** Glut: Alles, was du anzündest, brennt so viele Runden länger. */
  burnBonus: number;
  /** Lauffeuer: Fällt ein brennender Gegner, brennt der nächste so lange (0 = hast du nicht). */
  spread: number;
  /** Gelegte Fallen (Schaden je Falle); die erste trifft, wer als Nächstes nach vorn kommt. */
  traps: number[];
  /** Werferin: Würfe und Pfeile machen so viel mehr. */
  pitcher: number;
  /** Fallensteller: Verlangsamte nehmen so viel mehr, Fallen treffen so viel härter. */
  trapper: number;
  /** Schwung: Der nächste Angriff in dieser Runde macht so viel mehr (verfällt am Rundenende). */
  momentum: number;
  /** Wut: Bei höchstens 3 Gesundheit machen Angriffe so viel mehr (0 = hast du nicht). */
  rage: number;
  /** Zurückschlagen: Wer einen ganz abgefangenen Angriff macht, nimmt so viel Schaden. */
  retaliate: number;
  /** Erste Hilfe: Das erste Verbinden kostet keine Medizin und heilt so viel mehr (0 = hast du nicht). */
  firstAid: number;
  firstAidUsed: boolean;
  /** Geräte (Tüftler), die gerade stehen, mit restlichen Runden. */
  devices: { kind: DeviceId; rounds: number }[];
  /** Bastelkiste: Geräte laufen so viel länger. */
  tinkerBonus: number;
  /** Mit voller Wucht: der nächste Waffenschlag (Bonus, Haltbarkeit extra). */
  overdrive: { dmg: number; wear: number } | null;
  /** Letzter Schlag: Zerbricht die Waffe, trifft der Schlag doppelt. */
  lastStrike: boolean;
  /** Zielwasser: jeder so-und-sovielte Wurf trifft doppelt (0 = hast du nicht); Würfe bisher. */
  trueAim: number;
  throws: number;
  /** Haltung (Ruhe und Wut). */
  stance: Stance | null;
  /** Innere Ruhe: so viele Karten mehr, wenn ruhig. */
  innerCalm: number;
  /** Im Netz des Schrotters: diese Runde kein Ausweichen. */
  netted: number;
  /** Du brennst (Brandflasche): so viel Schaden am Ende deiner Runde, außer du löschst. */
  burning: number;
  /** So viele Fieberkranke sind mit Medizin gegangen. */
  spared: number;
  // --- Legenden ---
  /** Flammenwand: noch so viele Runden, so lange brennt, wer vorne zuschlägt oder nach vorn kommt. */
  flamewall: { rounds: number; burn: number } | null;
  /** Hinterhalt: Der Kampf begann aus dem Versteck (alle hinten, eine Falle liegt). */
  waylaid: boolean;
  /** Durchmarsch: je erledigtem Gegner 1 Kraft und so viele Karten (0 = hast du nicht). */
  onslaught: number;
  /** Zweites Leben: so oft flickst du eine zerbrochene Waffe sofort wieder zusammen. */
  secondLife: number;
  /** Fels in der Brandung: Bist du ruhig, macht kein Treffer mehr als so viel (0 = hast du nicht). */
  bulwark: number;
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
  | { type: 'momentum'; amount: number }
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
  /** Ein Schuss (left: Munition danach; loud: auf der Karte zu hören). */
  | { type: 'fired'; weapon: WeaponId; ammo: AmmoId; left: number; loud: boolean }
  /** Keine Munition mehr: ab jetzt Kolbenschläge. */
  | { type: 'outOfAmmo'; weapon: WeaponId; ammo: AmmoId }
  | { type: 'turn'; turn: number }
  | { type: 'burn'; id: number; dmg: number; kill: boolean }
  | { type: 'spread'; from: number; id: number }
  | { type: 'trap'; id: number }
  | { type: 'pulled'; id: number }
  | { type: 'trapSet'; count: number }
  | { type: 'deviceSet'; kind: DeviceId; rounds: number }
  | { type: 'device'; kind: DeviceId }
  | { type: 'overdrive'; amount: number }
  | { type: 'repair'; weapon: WeaponId; amount: number }
  | { type: 'stance'; stance: Stance }
  | { type: 'made'; card: CardId; n: number; to: 'hand' | 'draw' }
  | { type: 'status'; id: number; status: 'burn' | 'blind' | 'slow' | 'silence' | 'interrupt' | 'steady' }
  | { type: 'wake'; id: number }
  | { type: 'riled'; id: number }
  | { type: 'thaw'; id: number }
  | { type: 'scatter'; by: number }
  | { type: 'roar'; by: number }
  | { type: 'guard'; id: number; block: number }
  | { type: 'charge'; id: number }
  | { type: 'dazed'; by: number }
  | { type: 'miss'; id: number }
  | { type: 'ally'; id: number; dmg: number; kill: boolean }
  | { type: 'allyIn'; rounds: number }
  | { type: 'thorns'; id: number; dmg: number; kill: boolean }
  | { type: 'retaliate'; id: number; dmg: number; kill: boolean }
  | { type: 'draw'; n: number }
  | { type: 'gain'; amount: number }
  | { type: 'secondWind'; amount: number }
  | { type: 'lastStand' }
  // Wilde Menschen
  | { type: 'snared'; by: number }
  | { type: 'retreat'; id: number; hidden: boolean }
  | { type: 'shield'; id: number; block: number }
  | { type: 'aim'; id: number }
  | { type: 'flinch'; id: number }
  | { type: 'steal'; by: number }
  | { type: 'escape'; id: number; loot: number }
  | { type: 'recovered'; amount: number }
  | { type: 'netted'; by: number }
  | { type: 'light'; id: number }
  | { type: 'aflame'; by: number }
  | { type: 'scorched'; dmg: number }
  | { type: 'doused' }
  | { type: 'preach'; by: number }
  | { type: 'order'; by: number; block: number }
  | { type: 'despair'; id: number }
  | { type: 'mercy'; id: number }
  // Legenden
  | { type: 'flamewall'; rounds: number }
  | { type: 'reborn'; weapon: WeaponId; dur: number }
  | { type: 'hail'; n: number }
  | { type: 'denied'; reason: 'energy' | 'target' | 'medicine' | 'full' | 'limit' | 'netted' | 'ammo' };

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
  // Verbinden nur mit Medizin; mit Erster Hilfe ist eins immer dabei
  const bandages = Math.min(TACTICS.maxBandages, Math.max(medicine, (kit.skills?.firstaid ?? 0) > 0 ? 1 : 0));
  for (let i = 0; i < bandages; i++) deck.push('bandage');
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
  // Wer ein festes Muster mit Anlauf hat (Kalkkopf), beginnt immer vorn im Muster
  const start = def.pattern[0]?.kind === 'charge' ? 0 : Math.floor(next(st) * def.pattern.length);
  const f: TFoe = {
    id: st.nextId++,
    kind,
    hp: def.hp,
    maxHp: def.hp,
    block: 0,
    row: def.stayBack || def.startFar ? 'far' : row,
    step: start,
    intent: { kind: 'advance' },
    stunned: false,
    steady: false,
    howls: 0,
    burn: 0,
    blind: 0,
    slow: 0,
    silence: 0,
    calm: !!def.calm,
    sleep: def.sleeps ?? 0,
    ambush: false,
    frozen: def.frozen ?? 0,
    thawed: false,
    roused: false,
    plead: def.pleads ?? 0,
    loot: 0,
    gone: false,
  };
  f.intent = intentOf(f, st);
  return f;
}

/** Absichten, die dich treffen (Schaden). */
export const HITS: readonly IntentKind[] = ['attack', 'smash', 'grab', 'pounce', 'ram', 'hurl', 'ambush', 'sling', 'shot', 'thrust', 'firebomb'];
/** Angekündigte schwere Schläge (Ausholen, Anlauf, Brandflasche): lassen sich unterbrechen oder betäuben. */
const TELEGRAPHED: readonly IntentKind[] = ['windup', 'smash', 'charge', 'ram', 'hurl', 'light', 'firebomb'];
/** Was auch aus der zweiten Reihe geht (Schleuder, Schlinge, Speer), ohne erst nach vorn zu kommen. */
const REACH: readonly IntentKind[] = ['sling', 'snare', 'thrust', 'retreat'];
/** Wer zu den Wandlern zählt (Predigt des Treibers). */
const isWalkerKind = (k: FoeKind) => !FOE_TACTICS[k].human && k !== 'screamer' && k !== 'bellower';

/** Was der Gegner als Nächstes tut (wird angezeigt). st: für Wirkungen anderer (Leithammel). */
export function intentOf(f: TFoe, st?: TacticsState): Intent {
  let base = baseIntent(f);
  // Wilde Menschen: Was gerade nichts bringt, wird zum einfachen Schlag
  const others = st ? aliveFoes(st).filter((x) => x.id !== f.id) : [];
  if (base.kind === 'steal' && st && st.medicine <= 0) base = { kind: 'attack', dmg: 2 };
  else if (base.kind === 'escape' && f.loot <= 0) base = { kind: 'attack', dmg: 2 };
  else if (base.kind === 'unleash' && st && (f.howls >= FOE_RULES.unleash || aliveFoes(st).length >= TACTICS.maxFoes)) base = { kind: 'attack', dmg: 2 };
  else if (base.kind === 'preach' && st && !others.some((x) => isWalkerKind(x.kind))) base = { kind: 'attack', dmg: 2 };
  else if (base.kind === 'order' && st && !others.length) base = { kind: 'thrust', dmg: 2 };
  // Wilde Menschen, die sonst hinten bleiben: Allein kommen sie nach vorn (keiner mehr, hinter dem sie stehen)
  if (st && f.row === 'far' && FOE_TACTICS[f.kind].human && FOE_TACTICS[f.kind].stayBack && !others.length && base.kind !== 'stunned') return { kind: 'advance' };
  if (!base.dmg || !HITS.includes(base.kind)) return base;
  let dmg = base.dmg;
  if (f.thawed) dmg += FOE_RULES.thawed;
  if (f.roused) dmg += FOE_RULES.roused;
  // Leithammel: Solange er steht, schlagen die anderen härter
  if (st) for (const x of st.foes) if (x.id !== f.id && x.hp > 0) dmg += FOE_TACTICS[x.kind].aura ?? 0;
  return { ...base, dmg };
}

function baseIntent(f: TFoe): Intent {
  const def = FOE_TACTICS[f.kind];
  if (f.stunned) return { kind: 'stunned' };
  if (f.sleep > 0) return { kind: 'sleep' };
  if (f.frozen > 0) return { kind: 'frozen' };
  if (f.calm) return { kind: 'routine' };
  if (f.plead > 0) return { kind: 'plead' };
  // Aufgewacht: Überfall, notfalls mit einem Satz von hinten
  if (f.ambush) return { kind: 'ambush', dmg: def.ambush ?? 3 };
  const p = def.pattern[f.step % def.pattern.length];
  // Der Sprung kommt von hinten: dafür muss er nicht erst nach vorne
  if (f.row === 'far' && !def.stayBack && p.kind !== 'pounce' && !REACH.includes(p.kind)) return { kind: 'advance' };
  if (f.row === 'near' && p.kind === 'pounce') return { kind: 'attack', dmg: p.dmg };
  if (p.kind === 'howl' && f.howls >= TACTICS.maxHowls) return { kind: 'attack', dmg: 1 };
  return { kind: p.kind, dmg: p.dmg, block: p.block };
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
  /** Munition je Sorte (für Schusswaffen). */
  ammo?: Partial<Record<AmmoId, number>>;
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
    ammo: { ...(o.ammo ?? {}) },
    usedAmmo: {},
    shots: 0,
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
    traps: [],
    pitcher: lvl('pitcher') ? cardStat('pitcher', 'bonus', lvl('pitcher')) : 0,
    trapper: lvl('trapper') ? cardStat('trapper', 'bonus', lvl('trapper')) : 0,
    momentum: 0,
    rage: lvl('rage') ? cardStat('rage', 'bonus', lvl('rage')) : 0,
    retaliate: lvl('retaliate') ? cardStat('retaliate', 'bonus', lvl('retaliate')) : 0,
    firstAid: lvl('firstaid') ? cardStat('firstaid', 'bonus', lvl('firstaid')) : 0,
    firstAidUsed: false,
    devices: [],
    tinkerBonus: lvl('tinkerbox') ? cardStat('tinkerbox', 'bonus', lvl('tinkerbox')) : 0,
    overdrive: null,
    lastStrike: lvl('laststrike') > 0,
    trueAim: lvl('trueaim') ? Math.floor(cardStat('trueaim', 'bonus', lvl('trueaim'))) : 0,
    throws: 0,
    stance: null,
    innerCalm: lvl('innercalm') ? Math.floor(cardStat('innercalm', 'bonus', lvl('innercalm'))) : 0,
    netted: 0,
    burning: 0,
    spared: 0,
    flamewall: null,
    waylaid: false,
    onslaught: lvl('onslaught') ? Math.floor(cardStat('onslaught', 'draw', lvl('onslaught'))) : 0,
    secondLife: lvl('secondlife') ? Math.floor(cardStat('secondlife', 'bonus', lvl('secondlife'))) : 0,
    bulwark: lvl('bulwark') ? (lvl('bulwark') >= 4 ? 2 : 3) : 0,
  };
  for (const w of o.weapons) if (w.dur > 0) st.weaponDur[w.kind] = Math.max(st.weaponDur[w.kind] ?? 0, w.dur);
  st.draw = shuffle(st, deckFor(o.weapons, o.medicine, kit));
  // Schusswaffe ohne Munition: ihre Schüsse sind von Anfang an Kolbenschläge
  // (beim Drilling je Lauf: ohne Schrot bleibt der Kugellauf und umgekehrt)
  for (const w of Object.keys(st.weaponDur) as WeaponId[]) {
    for (const a of gunAmmo(w)) if (!((st.ammo[a] ?? 0) > 0)) emptyGun(st, w, a);
  }
  let near = 0;
  for (const kind of o.group.slice(0, TACTICS.maxFoes)) {
    const row = !FOE_TACTICS[kind].stayBack && !FOE_TACTICS[kind].startFar && near < 2 ? 'near' : 'far';
    if (row === 'near') near++;
    const f = makeFoe(st, kind, row);
    if (kind === 'walker' && o.mood) f.hp = f.maxHp = f.maxHp + (o.mood === 'strong' ? 2 : -2);
    st.foes.push(f);
  }
  // Flammenwand (Legende): Der Kampf beginnt hinter einer Wand aus Feuer, wer vorne steht, brennt
  if (lvl('flamewall')) {
    st.flamewall = { rounds: CARDS.flamewall.flamewall ?? 2, burn: cardStat('flamewall', 'burn', lvl('flamewall')) };
    // Erstarrte hält die Kälte: Die Wand taut sie nicht auf
    for (const f of st.foes) if (f.row === 'near' && f.frozen <= 0) setBurn(st, f, st.flamewall.burn, []);
  }
  // Fels in der Brandung (Legende): ruhig in den Kampf
  if (lvl('bulwark')) st.stance = 'calm';
  // Hinterhalt (Legende): Wer nicht entdeckt wurde, sucht sich den Ort aus. Alle fangen hinten an, eine Falle liegt
  if (lvl('waylay') && o.opening !== 'spotted') {
    for (const f of st.foes) f.row = 'far';
    st.traps.push(Math.floor(cardStat('waylay', 'bonus', lvl('waylay'))));
    st.waylaid = true;
  }
  startTurn(st, []);
  // Ausrüstung (Helm, Weste …): Abwehr in der ersten Runde
  st.block += Math.max(0, o.armor ?? 0);
  if (o.opening === 'surprise') {
    for (const f of st.foes) {
      f.stunned = true;
      f.intent = intentOf(f, st);
    }
    st.energy += 1;
  } else if (o.opening === 'spotted') st.energy = Math.max(1, st.energy - 1);
  // Leise Sohlen: Wer dich nicht entdeckt hat, fängt eine Runde später an (ab Stufe II: 1 Kraft mehr)
  if (lvl('sneak') && o.opening !== 'spotted') {
    for (const f of st.foes) {
      f.stunned = true;
      f.intent = intentOf(f, st);
    }
    if (lvl('sneak') >= 2) st.energy += 1;
  }
  if (o.thirst) st.energy = Math.max(1, st.energy - 1);
  if (o.cold && st.hand.length > 2) st.draw.push(st.hand.pop()!);
  return st;
}

/** Kann diese Gegnerart Hilfe rufen (Heuler)? Nur bei denen zählt „Still“. */
export function canHowl(kind: FoeKind): boolean {
  return FOE_TACTICS[kind].pattern.some((p) => p.kind === 'howl' || p.kind === 'preach' || p.kind === 'order');
}

/** Alle Gegner sind weg: gewonnen, oder (nur Fieberkranke, die mit Medizin gegangen sind) verschont. */
function cleared(st: TacticsState): 'won' | 'spared' {
  return st.kills === 0 && st.spared > 0 ? 'spared' : 'won';
}

/**
 * Einem Fieberkranken Medizin geben: Er geht, der Kampf ist für ihn vorbei (eine gute Tat).
 * Kostet keine Kraft, nur eine Medizin. Geht auch, wenn er schon angreift.
 */
export function giveMedicine(st: TacticsState, id: number): TEvent[] {
  const f = foeById(st, id);
  if (st.over || !f || f.hp <= 0 || !FOE_TACTICS[f.kind].pleads) return [];
  if (st.medicine <= 0) return [{ type: 'denied', reason: 'medicine' }];
  st.medicine -= 1;
  st.usedMedicine += 1;
  f.hp = 0;
  f.gone = true;
  st.spared += 1;
  const events: TEvent[] = [{ type: 'mercy', id: f.id }];
  if (!aliveFoes(st).length) st.over = cleared(st);
  return events;
}

/** Kann man gerade jemandem Medizin geben? (der erste Fieberkranke, der noch da ist) */
export function mercyTarget(st: TacticsState): TFoe | undefined {
  if (st.over || st.medicine <= 0) return undefined;
  return aliveFoes(st).find((f) => FOE_TACTICS[f.kind].pleads);
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
  st.momentum = 0;
  st.turnPlays = {};
  st.energy = Math.max(1, TACTICS.energy - st.grabbed);
  st.grabbed = 0;
  // Innere Ruhe: ruhig ziehst du mehr
  drawCards(st, Math.max(2, TACTICS.hand - st.dazed) + (st.stance === 'calm' ? st.innerCalm : 0));
  st.dazed = 0;
  for (const f of aliveFoes(st)) f.intent = intentOf(f, st);
  events.push({ type: 'turn', turn: st.turn });
}

/** Munition alle: Jeder Schuss dieser Waffe wird zum Kolbenschlag (Anlegen bleibt). */
function emptyGun(st: TacticsState, w: WeaponId, a: AmmoId) {
  const swap = (l: CardId[]) => l.map((c): CardId => (CARDS[c].weapon === w && cardAmmoKind(c) === a ? 'buttstroke' : c));
  st.hand = swap(st.hand);
  st.draw = swap(st.draw);
  st.discard = swap(st.discard);
}

/** Reicht die Munition für diese Karte? (Karten ohne Munition: immer) */
export function hasAmmo(st: TacticsState, card: CardId): boolean {
  const a = cardAmmoKind(card);
  return !a || (st.ammo[a] ?? 0) >= (CARDS[card].ammo ?? 0);
}

function removeWeaponCards(st: TacticsState, w: WeaponId) {
  const drop = (l: CardId[]) => l.filter((c) => CARDS[c].weapon !== w);
  st.hand = drop(st.hand);
  st.draw = drop(st.draw);
  st.discard = drop(st.discard);
}

/** Rüstung gerade: Der Kalkkopf taumelt nach dem Rammen, dann hilft ihm sein Kalkhelm nicht. */
export function armorNow(f: TFoe): number {
  return f.intent.kind === 'reel' ? 0 : FOE_TACTICS[f.kind].armor;
}

/** Schaden an einem Gegner: erst Rüstung (außer pierce), dann seine Abwehr. */
function damageFoe(st: TacticsState, f: TFoe, raw: number, events: TEvent[], pierce = false) {
  // Fallensteller: Verlangsamte trifft es härter
  if (raw > 0 && f.slow > 0) raw += st.trapper;
  // Im Schlaf trifft es doppelt, steif vor Kälte ist er spröde
  if (raw > 0 && f.sleep > 0) raw *= 2;
  if (raw > 0 && f.frozen > 0) raw += FOE_RULES.brittle;
  const afterArmor = pierce ? raw : Math.max(raw > 0 ? 1 : 0, raw - armorNow(f));
  const absorbed = Math.min(f.block, afterArmor);
  f.block -= absorbed;
  const dmg = afterArmor - absorbed;
  f.hp = Math.max(0, f.hp - dmg);
  const kill = f.hp === 0;
  if (kill) st.kills += 1;
  events.push({ type: 'hit', id: f.id, dmg, absorbed, kill });
  if (kill) {
    // Den Langfinger erwischt: Er hat deine Medizin noch dabei
    if (f.loot > 0) {
      st.medicine += f.loot;
      st.usedMedicine = Math.max(0, st.usedMedicine - f.loot);
      events.push({ type: 'recovered', amount: f.loot });
      f.loot = 0;
    }
    spreadFire(st, f, events);
    scatterFrom(st, f, events);
    return;
  }
  if (raw <= 0) return;
  // Der Fieberkranke bittet nicht mehr, er wehrt sich
  if (f.plead > 0) {
    f.plead = 0;
    f.intent = intentOf(f, st);
    events.push({ type: 'despair', id: f.id });
  }
  // Der Schütze hat schon angelegt: Ein Treffer verzieht ihn, er muss neu anlegen
  if (f.intent.kind === 'shot') {
    const pattern = FOE_TACTICS[f.kind].pattern;
    f.step = Math.max(0, pattern.findIndex((x) => x.kind === 'aim'));
    f.intent = intentOf(f, st);
    events.push({ type: 'flinch', id: f.id });
  }
  // Wer schläft, wacht auf (und überfällt dich); wer seiner Wege ging, wird wütend
  if (f.sleep > 0) {
    f.sleep = 0;
    f.ambush = true;
    f.intent = intentOf(f, st);
    events.push({ type: 'wake', id: f.id });
  }
  if (f.calm) {
    f.calm = false;
    f.intent = intentOf(f, st);
    events.push({ type: 'riled', id: f.id });
  }
}

/** Leithammel gefallen: Die anderen laufen planlos auseinander (setzen eine Runde aus). */
function scatterFrom(st: TacticsState, dead: TFoe, events: TEvent[]) {
  if (!FOE_TACTICS[dead.kind].scatter) return;
  const rest = aliveFoes(st).filter((x) => x.id !== dead.id);
  if (!rest.length) return;
  events.push({ type: 'scatter', by: dead.id });
  for (const x of rest) {
    x.stunned = true;
    x.intent = intentOf(x, st);
    events.push({ type: 'stun', id: x.id });
  }
  // Ohne ihn schlagen die anderen nicht mehr härter
  for (const x of rest) x.intent = intentOf(x, st);
}

/**
 * Ein Gegner kommt nach vorn (von selbst, durch einen Sprung oder einen Wecker). Liegt eine Falle,
 * stürzt er: Schaden, und er setzt eine Runde aus. Gibt true zurück, wenn er gestürzt ist.
 */
function arriveNear(st: TacticsState, f: TFoe, events: TEvent[]): boolean {
  f.row = 'near';
  // Flammenwand: Wer nach vorn kommt, fängt Feuer
  if (st.flamewall && f.hp > 0 && f.frozen <= 0) setBurn(st, f, st.flamewall.burn, events);
  // Bewegungsmelder-Lampe: Wer nach vorn kommt, ist geblendet
  if (st.devices.some((d) => d.kind === 'lamp') && f.blind <= 0) {
    f.blind = 1;
    events.push({ type: 'device', kind: 'lamp' }, { type: 'status', id: f.id, status: 'blind' });
  }
  const dmg = st.traps.shift();
  if (dmg === undefined) return false;
  events.push({ type: 'trap', id: f.id });
  damageFoe(st, f, dmg + st.trapper, events);
  if (f.hp > 0 && !f.steady) {
    f.stunned = true;
    f.intent = intentOf(f, st);
    events.push({ type: 'stun', id: f.id });
  }
  return true;
}

/** Ein Gerät wirkt einmal (Weidezaun schlägt zu, Radio übertönt die Heuler). */
function deviceAct(st: TacticsState, kind: DeviceId, events: TEvent[]) {
  if (kind === 'fence') {
    const near = aliveFoes(st).filter((f) => f.row === 'near');
    if (!near.length) return;
    events.push({ type: 'device', kind });
    for (const f of near) damageFoe(st, f, DEVICES.fenceDmg, events);
  } else if (kind === 'mower') {
    // Fährt dem vordersten Gegner in die Beine und drängt ihn nach hinten (ist vorne keiner, dem nächsten hinten)
    const alive = aliveFoes(st);
    const t = alive.find((f) => f.row === 'near') ?? alive[0];
    if (!t) return;
    events.push({ type: 'device', kind });
    damageFoe(st, t, DEVICES.mowerDmg, events);
    if (t.hp > 0 && t.row === 'near' && !FOE_TACTICS[t.kind].heavy) {
      t.row = 'far';
      interrupt(st, t);
      events.push({ type: 'push', id: t.id });
    }
  } else if (kind === 'boombox') {
    const howlers = aliveFoes(st).filter((f) => canHowl(f.kind));
    if (!howlers.length) return;
    events.push({ type: 'device', kind });
    for (const f of howlers) {
      f.silence = Math.max(f.silence, 1);
      events.push({ type: 'status', id: f.id, status: 'silence' });
    }
  }
}

/** Haltung wechseln. Wer die Ruhe verlässt, bekommt Kraft. */
function setStance(st: TacticsState, stance: Stance, events: TEvent[]) {
  if (st.stance === stance) return;
  if (st.stance === 'calm') {
    st.energy += STANCE.calmLeaveGain;
    events.push({ type: 'gain', amount: STANCE.calmLeaveGain });
  }
  st.stance = stance;
  events.push({ type: 'stance', stance });
}

/** Anzünden: Brennt so viele Runden (Glut verlängert). */
function setBurn(st: TacticsState, f: TFoe, rounds: number, events: TEvent[]) {
  f.burn = Math.max(f.burn, rounds + st.burnBonus);
  events.push({ type: 'status', id: f.id, status: 'burn' });
  // Erstarrter: Feuer taut ihn sofort auf und macht ihn wütend
  if (FOE_TACTICS[f.kind].frozen && !f.thawed && f.hp > 0) {
    f.frozen = 0;
    f.thawed = true;
    f.intent = intentOf(f, st);
    events.push({ type: 'thaw', id: f.id });
  }
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

/** Ausholen (oder Anlauf) unterbrechen: Der Gegner fängt sein Muster von vorne an. */
function interrupt(st: TacticsState, f: TFoe) {
  const pattern = FOE_TACTICS[f.kind].pattern;
  const p = pattern[f.step % pattern.length];
  if (TELEGRAPHED.includes(p.kind)) f.step = 0;
  f.intent = intentOf(f, st);
}

/** Eine Karte aus der Hand spielen (target: Gegner-id bei Karten mit Zielwahl). */
export function playCard(st: TacticsState, handIndex: number, target?: number): TEvent[] {
  const card = st.hand[handIndex];
  if (st.over || !card) return [];
  return resolve(st, card, target, () => {
    st.hand.splice(handIndex, 1);
    // Einmal-Karten und erzeugte Karten sind danach weg, alles andere kommt auf den Ablagestapel
    if (CARDS[card].kind === 'once') st.used[card] = (st.used[card] ?? 0) + 1;
    else if (CARDS[card].kind !== 'temp') st.discard.push(card);
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

/** Fehlt für diese Karte Medizin? (Erste Hilfe: das erste Verbinden ist frei) */
export function lacksMedicine(st: TacticsState, card: CardId): boolean {
  if (!CARDS[card].medicine || st.medicine > 0) return false;
  return !(st.firstAid && !st.firstAidUsed);
}

/** Kann diese Karte gerade gespielt werden? (Kraft, Medizin, Ziel …) */
export function playable(st: TacticsState, card: CardId): boolean {
  const def = CARDS[card];
  return (
    def.cost <= st.energy &&
    !lacksMedicine(st, card) &&
    (!def.heal || !!def.gain || st.hp < st.maxHp) &&
    (!def.perTurn || (st.turnPlays[card] ?? 0) < def.perTurn) &&
    !(st.netted > 0 && FOE_RULES.netBlocks.includes(card)) &&
    hasAmmo(st, card) &&
    (def.target === 'self' ? !def.area || !!areaFoes(st, def.area).length || !!def.block || !!def.heal : targetsFor(st, card).length > 0)
  );
}

/** Die Wirkung einer Karte (take: nimmt sie aus Hand oder Tasche). */
function resolve(st: TacticsState, card: CardId, target: number | undefined, take: () => void): TEvent[] {
  const events: TEvent[] = [];
  const def = CARDS[card];
  if (st.energy < def.cost) return [{ type: 'denied', reason: 'energy' }];
  if (def.repair && !Object.values(st.weaponDur).some((d) => (d ?? 0) > 0)) return [{ type: 'denied', reason: 'target' }];
  if (lacksMedicine(st, card)) return [{ type: 'denied', reason: 'medicine' }];
  if (def.heal && !def.gain && st.hp >= st.maxHp) return [{ type: 'denied', reason: 'full' }];
  if (def.perTurn && (st.turnPlays[card] ?? 0) >= def.perTurn) return [{ type: 'denied', reason: 'limit' }];
  if (st.netted > 0 && FOE_RULES.netBlocks.includes(card)) return [{ type: 'denied', reason: 'netted' }];
  if (!hasAmmo(st, card)) return [{ type: 'denied', reason: 'ammo' }];
  let foe: TFoe | undefined;
  if (def.target !== 'self') {
    const options = targetsFor(st, card);
    foe = target !== undefined && canTarget(st, card, target) ? foeById(st, target) : options.length === 1 ? options[0] : undefined;
    if (!foe) return [{ type: 'denied', reason: 'target' }];
  }
  if (def.area && !areaFoes(st, def.area).length && !def.block && !def.heal) return [{ type: 'denied', reason: 'target' }];
  st.energy -= def.cost;
  take();
  const killsBefore = st.kills;
  st.turnPlays[card] = (st.turnPlays[card] ?? 0) + 1;
  events.push({ type: 'play', card, target: foe?.id });
  // Schusswaffe: Munition verschießen; laut zählt für die Karte (Trupps kommen nachsehen)
  const gun = def.ammo && def.weapon ? def.weapon : null;
  const shell = cardAmmoKind(card);
  if (gun && shell && def.ammo) {
    st.ammo[shell] = (st.ammo[shell] ?? 0) - def.ammo;
    st.usedAmmo[shell] = (st.usedAmmo[shell] ?? 0) + def.ammo;
    if (WEAPONS[gun].loud) st.shots += def.ammo;
    events.push({ type: 'fired', weapon: gun, ammo: shell, left: st.ammo[shell] ?? 0, loud: !!WEAPONS[gun].loud });
    if ((st.ammo[shell] ?? 0) <= 0) {
      emptyGun(st, gun, shell);
      events.push({ type: 'outOfAmmo', weapon: gun, ammo: shell });
    }
  }
  // Du brennst: abrollen (Ausweichen) oder den Feuerlöscher nehmen
  if (st.burning > 0 && FOE_RULES.douse.includes(card)) {
    st.burning = 0;
    events.push({ type: 'doused' });
  }

  const targets = def.area ? areaFoes(st, def.area) : foe ? [foe] : [];
  // Mit voller Wucht: dieser Waffenschlag macht mehr und kostet extra Haltbarkeit
  let extraWear = 0;
  let overBonus = 0;
  if (def.weapon && (def.dmg ?? 0) > 0 && st.overdrive) {
    overBonus = st.overdrive.dmg;
    extraWear = st.overdrive.wear;
    st.overdrive = null;
  }
  // Letzter Schlag: Zerbricht die Waffe dabei, trifft er doppelt
  const breaking = !!def.weapon && st.lastStrike && (st.weaponDur[def.weapon] ?? 0) - 1 - extraWear <= 0;
  let first = true;
  for (const f of targets) {
    let raw = stat(st, card, 'dmg');
    if (first && raw) raw += overBonus;
    // Rasend: der Angriff macht mehr
    if (first && raw && st.stance === 'wrath') raw += STANCE.wrathDmg;
    if (raw && def.thrown) raw += st.pitcher;
    // Schwung aus dem letzten Schlag und Wut: auf den ersten Treffer dieses Angriffs
    if (first && raw && st.momentum) {
      raw += st.momentum;
      st.momentum = 0;
    }
    if (raw && st.rage && st.hp <= 3) raw += st.rage;
    if (raw && def.farBonus && f.row === 'far') raw += def.farBonus;
    // Zielen: für den nächsten Fernangriff (Wurf, Bolzen, Pfeil)
    if (first && (def.target === 'any' || def.target === 'far') && raw && st.focus) {
      raw += st.focus;
      st.focus = 0;
    }
    if (def.vs && f.kind === def.vs.kind) raw += def.vs.dmg;
    // Zielwasser: jeder soundsovielte Wurf doppelt
    if (first && raw && def.thrown) {
      st.throws += 1;
      if (st.trueAim && st.throws % st.trueAim === 0) raw *= 2;
    }
    if (first && raw && breaking) raw *= 2;
    if (raw > 0) damageFoe(st, f, raw, events, !!def.pierce);
    applyEffects(st, card, f, events);
    // Nagel: trifft noch einen zweiten
    if (first && def.chain) {
      const other = aliveFoes(st)
        .filter((x) => x.id !== f.id)
        .sort((x, y) => (x.row === y.row ? 0 : x.row === 'near' ? -1 : 1))[0];
      if (other) damageFoe(st, other, stat(st, card, 'dmg'), events, !!def.pierce);
    }
    first = false;
  }
  const block = stat(st, card, 'block');
  if (block) {
    st.block += block;
    events.push({ type: 'block', amount: block });
  }
  let heal = def.passive ? 0 : stat(st, card, 'heal');
  if (heal) {
    if (def.medicine && st.firstAid && !st.firstAidUsed) {
      // Erste Hilfe: ohne Medizin und kräftiger
      st.firstAidUsed = true;
      heal += st.firstAid;
    } else if (def.medicine) {
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
  const momentum = stat(st, card, 'momentum');
  if (momentum) {
    st.momentum += momentum;
    events.push({ type: 'momentum', amount: momentum });
  }
  const focus = stat(st, card, 'focus');
  if (focus) {
    st.focus += focus;
    events.push({ type: 'focus', amount: focus });
  }
  const thorns = stat(st, card, 'thorns');
  if (thorns) st.thorns += thorns;
  if (def.trap) {
    st.traps.push(def.trap);
    events.push({ type: 'trapSet', count: st.traps.length });
  }
  if (def.ally) {
    st.ally = { rounds: def.ally.rounds, dmg: stat(st, card, 'allyDmg') };
    events.push({ type: 'allyIn', rounds: def.ally.rounds });
  }
  // Karten erzeugen (Murmeln, Kiesel, Lattenhiebe)
  if (def.make) {
    const n = def.make.n + Math.floor(stat(st, card, 'bonus'));
    for (let i = 0; i < n; i++) {
      if (def.make.to === 'hand') {
        if (st.hand.length < 10) st.hand.push(def.make.card);
      } else st.draw.splice(Math.floor(next(st) * (st.draw.length + 1)), 0, def.make.card);
    }
    events.push({ type: 'made', card: def.make.card, n, to: def.make.to });
  }
  // Gerät aufstellen (höchstens 3; das älteste macht sonst Platz)
  if (def.device) {
    st.devices = st.devices.filter((d) => d.kind !== def.device!.kind);
    if (st.devices.length >= MAX_DEVICES) st.devices.shift();
    // Fähigkeiten mit Gerät (Mähroboter) laufen je Stufe eine Runde länger
    const rounds = def.device.rounds + st.tinkerBonus + (def.kind === 'skill' ? Math.max(0, (st.levels[card] ?? 1) - 1) : 0);
    st.devices.push({ kind: def.device.kind, rounds });
    events.push({ type: 'deviceSet', kind: def.device.kind, rounds });
  }
  // Ladegerät: alle Geräte wirken sofort (ab Stufe II laufen sie länger)
  if (def.charge) {
    const longer = Math.floor(stat(st, card, 'bonus'));
    for (const d of st.devices) {
      deviceAct(st, d.kind, events);
      d.rounds += longer;
    }
  }
  if (def.overdrive) {
    const amount = stat(st, card, 'bonus');
    st.overdrive = { dmg: amount, wear: def.overdrive };
    events.push({ type: 'overdrive', amount });
  }
  // Flicken: die Waffe, die es am nötigsten hat
  if (def.repair) {
    const w = (Object.keys(st.weaponDur) as WeaponId[]).filter((k) => (st.weaponDur[k] ?? 0) > 0).sort((a, b) => (st.weaponDur[a] ?? 0) - (st.weaponDur[b] ?? 0))[0];
    if (w) {
      st.weaponDur[w] = (st.weaponDur[w] ?? 0) + def.repair;
      st.wear[w] = (st.wear[w] ?? 0) - def.repair;
      events.push({ type: 'repair', weapon: w, amount: def.repair });
    }
  }
  if (def.stance) setStance(st, def.stance, events);
  // Flammenwand: ein paar Runden fängt Feuer, wer vorne zuschlägt oder nach vorn kommt
  if (def.flamewall) {
    st.flamewall = { rounds: def.flamewall, burn: stat(st, card, 'burn') };
    events.push({ type: 'flamewall', rounds: def.flamewall });
    // Wer schon vorne steht, brennt sofort
    for (const f of aliveFoes(st)) if (f.row === 'near') setBurn(st, f, st.flamewall.burn, events);
  }
  // Steinhagel: Jede andere Karte auf der Hand fliegt als Stein auf den Schwächsten
  if (def.hail) {
    const stones = st.hand.splice(0);
    for (const c of stones) if (!CARDS[c].ethereal && CARDS[c].kind !== 'temp') st.discard.push(c);
    events.push({ type: 'hail', n: stones.length });
    const each = Math.floor(stat(st, card, 'dmg')) + st.pitcher;
    for (let i = 0; i < stones.length; i++) {
      const t = [...aliveFoes(st)].sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
      if (!t) break;
      damageFoe(st, t, each, events);
    }
  }
  if (def.weapon) {
    const w = def.weapon;
    st.wear[w] = (st.wear[w] ?? 0) + 1 + extraWear;
    st.weaponDur[w] = (st.weaponDur[w] ?? 1) - 1 - extraWear;
    if ((st.weaponDur[w] ?? 0) <= 0) {
      if (st.secondLife > 0) {
        // Zweites Leben: aus den Trümmern sofort wieder zusammengeflickt (halbe Haltbarkeit)
        st.secondLife -= 1;
        const back = Math.max(1, Math.floor(WEAPONS[w].dur / 2));
        st.weaponDur[w] = back;
        st.wear[w] = (st.wear[w] ?? 0) - back;
        events.push({ type: 'reborn', weapon: w, dur: back });
      } else {
        removeWeaponCards(st, w);
        events.push({ type: 'weaponBroke', weapon: w });
      }
    }
  }
  // Durchmarsch: Wer einen Gegner erledigt, bekommt Kraft und Karten
  const newKills = st.kills - killsBefore;
  if (st.onslaught && newKills > 0 && aliveFoes(st).length) {
    st.energy += newKills;
    events.push({ type: 'gain', amount: newKills });
    const before = st.hand.length;
    drawCards(st, st.onslaught * newKills);
    events.push({ type: 'draw', n: st.hand.length - before });
  }
  if (!aliveFoes(st).length) st.over = cleared(st);
  return events;
}

/** Was eine Karte am Gegner bewirkt (außer Schaden). */
function applyEffects(st: TacticsState, card: CardId, f: TFoe, events: TEvent[]) {
  if (f.hp <= 0) return;
  const def = CARDS[card];
  // Der Hüne ist zu schwer: lässt sich weder wegtreten noch heranholen
  const heavy = !!FOE_TACTICS[f.kind].heavy;
  const pushIt = (def.push || (def.vs?.push && f.kind === def.vs.kind)) && f.row === 'near' && !heavy;
  if (pushIt) {
    f.row = 'far';
    interrupt(st, f);
    events.push({ type: 'push', id: f.id });
  }
  if (def.interrupt) {
    interrupt(st, f);
    events.push({ type: 'status', id: f.id, status: 'interrupt' });
  }
  // Wecker: von hinten nach vorn holen (Fallen lösen dabei aus)
  if (def.pull && f.row === 'far' && !heavy) {
    events.push({ type: 'pulled', id: f.id });
    arriveNear(st, f, events);
    if (f.hp > 0) f.intent = intentOf(f, st);
    if (f.hp <= 0) return;
  }
  // Kopfnuss: betäubt nur, wenn er gerade ausholt
  const stunNow = def.stun || (def.stunIfWindup && TELEGRAPHED.includes(f.intent.kind));
  if (stunNow) {
    // Niemand lässt sich zweimal hintereinander betäuben (sonst ginge es endlos)
    if (f.steady) events.push({ type: 'status', id: f.id, status: 'steady' });
    else {
      f.stunned = true;
      f.intent = intentOf(f, st);
      events.push({ type: 'stun', id: f.id });
    }
  }
  const burn = stat(st, card, 'burn');
  if (burn) setBurn(st, f, burn, events);
  if (def.blind) {
    f.blind += def.blind;
    events.push({ type: 'status', id: f.id, status: 'blind' });
  }
  const slow = stat(st, card, 'slow');
  if (slow) {
    f.slow = Math.max(f.slow, slow);
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
  // Murmeln und Kiesel, die keiner geworfen hat, sind weg
  st.discard.push(...st.hand.filter((c) => !CARDS[c].ethereal));
  st.hand = [];
  // Das Netz des Schrotters hielt nur diese Runde
  st.netted = 0;
  // Du brennst noch (nicht gelöscht): das tut weh, Abwehr hilft nicht
  if (st.burning > 0) {
    let dmg = Math.min(st.burning, st.hp);
    st.burning = 0;
    if (dmg >= st.hp && st.lastStand && !st.lastStandUsed) {
      dmg = st.hp - 1;
      st.lastStandUsed = true;
      events.push({ type: 'lastStand' });
    }
    st.hp -= dmg;
    events.push({ type: 'scorched', dmg });
    if (st.hp <= 0) {
      st.over = 'lost';
      return events;
    }
  }
  // Geräte wirken, dann läuft ihre Zeit ab
  for (const d of st.devices) deviceAct(st, d.kind, events);
  for (const d of st.devices) d.rounds -= 1;
  st.devices = st.devices.filter((d) => d.rounds > 0);
  if (!aliveFoes(st).length) {
    st.over = cleared(st);
    return events;
  }
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
  // Zweiter Atem: Merken, wie es vor dem Zug der Gegner stand
  const hpBefore = st.hp;
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
    const intent = intentOf(f, st);
    f.block = 0;
    if (f.stunned) {
      f.stunned = false;
      f.steady = true;
      continue;
    }
    f.steady = false;
    // Zustände statt Züge: schläft, steif vor Kälte, geht seiner Wege (das Muster läuft nicht weiter)
    if (intent.kind === 'sleep') {
      f.sleep -= 1;
      if (f.sleep <= 0) {
        f.ambush = true;
        events.push({ type: 'wake', id: f.id });
      }
      continue;
    }
    if (intent.kind === 'frozen') {
      f.frozen -= 1;
      continue;
    }
    if (intent.kind === 'routine') continue;
    // Fieberkranker: bittet um Medizin; bekommt er keine, wird er verzweifelt
    if (intent.kind === 'plead') {
      f.plead -= 1;
      if (f.plead <= 0) {
        f.intent = intentOf(f, st);
        events.push({ type: 'despair', id: f.id });
      }
      continue;
    }
    if (intent.kind === 'advance') {
      if (slowed) {
        events.push({ type: 'status', id: f.id, status: 'slow' });
        continue;
      }
      if (aliveFoes(st).filter((x) => x.row === 'near').length < 3) {
        events.push({ type: 'advance', id: f.id });
        arriveNear(st, f, events);
      }
      continue;
    }
    const def = FOE_TACTICS[f.kind];
    // Der Überfall nach dem Aufwachen gehört nicht zum Muster
    if (intent.kind === 'ambush') f.ambush = false;
    else f.step = (f.step + 1) % def.pattern.length;
    switch (intent.kind) {
      case 'pounce':
      case 'attack':
      case 'smash':
      case 'grab':
      case 'ram':
      case 'hurl':
      case 'ambush':
      case 'sling':
      case 'shot':
      case 'thrust':
      case 'firebomb': {
        if (intent.kind === 'pounce' || (intent.kind === 'ambush' && f.row === 'far')) {
          // Aus dem Dunkel (oder aus dem Gras) nach vorne gesprungen, dann zugeschlagen (in eine Falle gesprungen: nicht)
          events.push({ type: 'pounce', id: f.id });
          if (arriveNear(st, f, events)) break;
        }
        // Aufgestachelt vom Brüller: gilt für diesen einen Angriff
        f.roused = false;
        // Geblendet: Der Angriff geht daneben
        if (f.blind > 0) {
          f.blind -= 1;
          events.push({ type: 'miss', id: f.id });
          break;
        }
        // Haltung: ruhig fängt etwas ab, rasend tut es mehr weh
        let raw = intent.dmg ?? 0;
        if (raw > 0 && st.stance === 'calm') raw = Math.max(0, raw - STANCE.calmGuard);
        else if (raw > 0 && st.stance === 'wrath') raw += STANCE.wrathTaken;
        // Fels in der Brandung: ruhig macht kein Treffer mehr als so viel
        if (st.bulwark && st.stance === 'calm' && raw > st.bulwark) raw = st.bulwark;
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
        // Zurückschlagen: ganz abgefangen, also gleich zurück
        if (st.retaliate && raw > 0 && absorbed >= raw && f.hp > 0) {
          const before = st.kills;
          const extra: TEvent[] = [];
          damageFoe(st, f, st.retaliate, extra);
          events.push({ type: 'retaliate', id: f.id, dmg: st.retaliate, kill: st.kills > before }, ...extra.filter((e) => e.type !== 'hit'));
        }
        // Konter: wer zuschlägt, nimmt Schaden
        if (st.thorns > 0 && f.hp > 0) {
          const before = st.kills;
          const extra: TEvent[] = [];
          damageFoe(st, f, st.thorns, extra);
          events.push({ type: 'thorns', id: f.id, dmg: st.thorns, kill: st.kills > before }, ...extra.filter((e) => e.type !== 'hit'));
        }
        // Gepackt (oder vom Hünen geworfen): nächste Runde 1 Kraft weniger
        if (intent.kind === 'grab' || intent.kind === 'hurl') {
          st.grabbed = 1;
          events.push({ type: 'grabbed', by: f.id });
        }
        // Gerammt: benommen, nächste Runde eine Karte weniger
        if (intent.kind === 'ram') {
          st.dazed = 1;
          events.push({ type: 'dazed', by: f.id });
        }
        // Brandflasche: Du brennst (am Ende deiner Runde, außer du löschst)
        if (intent.kind === 'firebomb' && st.hp > 0) {
          st.burning = FOE_RULES.burning;
          events.push({ type: 'aflame', by: f.id });
        }
        // Flammenwand: Wer vorne zuschlägt, fängt Feuer
        if (st.flamewall && f.row === 'near' && f.hp > 0 && f.frozen <= 0) setBurn(st, f, st.flamewall.burn, events);
        if (st.hp <= 0) st.over = 'lost';
        break;
      }
      case 'windup':
        events.push({ type: 'windup', id: f.id });
        break;
      case 'charge':
        events.push({ type: 'charge', id: f.id });
        break;
      case 'reel':
        break;
      case 'guard':
        f.block = intent.block ?? 3;
        events.push({ type: 'guard', id: f.id, block: f.block });
        break;
      case 'roar': {
        if (silenced) {
          events.push({ type: 'status', id: f.id, status: 'silence' });
          break;
        }
        // Alle anderen schlagen beim nächsten Angriff härter
        for (const x of aliveFoes(st)) if (x.id !== f.id) x.roused = true;
        events.push({ type: 'roar', by: f.id });
        break;
      }
      case 'lurk':
        f.block = 2;
        events.push({ type: 'lurk', id: f.id, block: 2 });
        break;
      // --- Wilde Menschen ---
      case 'snare':
        st.grabbed = 1;
        events.push({ type: 'snared', by: f.id });
        break;
      case 'retreat': {
        // Zurück ins Dickicht (wer schon hinten ist, versteckt sich nur)
        const hidden = f.row === 'far';
        f.row = 'far';
        f.block = 2;
        events.push({ type: 'retreat', id: f.id, hidden });
        break;
      }
      case 'shield':
        f.block = intent.block ?? 3;
        events.push({ type: 'shield', id: f.id, block: f.block });
        break;
      case 'aim':
        events.push({ type: 'aim', id: f.id });
        break;
      case 'reload':
        break;
      case 'steal':
        if (st.medicine > 0) {
          st.medicine -= 1;
          st.usedMedicine += 1;
          f.loot += 1;
          events.push({ type: 'steal', by: f.id });
        }
        break;
      case 'escape':
        // Verlangsamt kommt er nicht weg
        if (slowed) {
          events.push({ type: 'status', id: f.id, status: 'slow' });
          break;
        }
        events.push({ type: 'escape', id: f.id, loot: f.loot });
        f.hp = 0;
        f.gone = true;
        break;
      case 'net':
        st.netted = 1;
        events.push({ type: 'netted', by: f.id });
        break;
      case 'light':
        events.push({ type: 'light', id: f.id });
        break;
      case 'unleash':
        if (aliveFoes(st).length < TACTICS.maxFoes && f.howls < FOE_RULES.unleash) {
          f.howls += 1;
          const nf = makeFoe(st, 'walker', 'far');
          st.foes.push(nf);
          events.push({ type: 'summon', by: f.id, id: nf.id, kind: 'walker' });
        }
        break;
      case 'preach':
        if (silenced) {
          events.push({ type: 'status', id: f.id, status: 'silence' });
          break;
        }
        for (const x of aliveFoes(st)) if (x.id !== f.id && isWalkerKind(x.kind)) x.roused = true;
        events.push({ type: 'preach', by: f.id });
        break;
      case 'order':
        if (silenced) {
          events.push({ type: 'status', id: f.id, status: 'silence' });
          break;
        }
        for (const x of aliveFoes(st)) if (x.id !== f.id) x.block = Math.max(x.block, FOE_RULES.order);
        events.push({ type: 'order', by: f.id, block: FOE_RULES.order });
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
  if (!st.over && !aliveFoes(st).length) st.over = cleared(st);
  // Zweiter Atem: eine Runde der Gegner ganz ohne Schaden überstanden, dann heilst du etwas
  if (!st.over && st.secondWind && st.hp === hpBefore && st.hp < st.maxHp) {
    const amount = Math.min(st.secondWind, st.maxHp - st.hp);
    st.hp += amount;
    events.push({ type: 'secondWind', amount });
  }
  // Die Flammenwand brennt herunter
  if (st.flamewall) {
    st.flamewall.rounds -= 1;
    if (st.flamewall.rounds <= 0) st.flamewall = null;
  }
  if (!st.over) startTurn(st, events);
  return events;
}

/**
 * Was Fliehen kostet: Wer vorne steht (nicht betäubt, nicht geblendet), schlägt beim Weglaufen
 * noch einmal zu, mit dem angezeigten Angriff oder sonst seinem leichtesten Schlag. Dein Schutz
 * fängt davon ab. Wer nur Gegner hinten hat, kommt frei davon.
 */
export function fleeHits(st: TacticsState): { id: number; dmg: number }[] {
  const out: { id: number; dmg: number }[] = [];
  for (const f of aliveFoes(st)) {
    if (f.row !== 'near' || f.stunned || f.blind > 0) continue;
    const k = f.intent.kind;
    const attacks = FOE_TACTICS[f.kind].pattern.filter((p) => (p.dmg ?? 0) > 0).map((p) => p.dmg!);
    // Wer schläft, steif ist oder seiner Wege geht, schlägt beim Weglaufen nicht zu
    if (k === 'sleep' || k === 'frozen' || k === 'routine' || k === 'plead') continue;
    const dmg = HITS.includes(k) && f.intent.dmg ? f.intent.dmg : attacks.length ? Math.min(...attacks) : 0;
    if (dmg > 0) out.push({ id: f.id, dmg });
  }
  return out;
}

/** So viel kostet Fliehen gerade (nach deinem Schutz). */
export function fleeCost(st: TacticsState): number {
  return Math.max(0, fleeHits(st).reduce((a, h) => a + h.dmg, 0) - st.block);
}

/**
 * Fliehen: geht immer und rettet dich (mindestens 1 Gesundheit bleibt), kostet aber einen letzten
 * Treffer. free: ohne Treffer (zum Beispiel, wenn der Kampf gar nicht erst laden konnte).
 */
export function flee(st: TacticsState, free = false): TEvent[] {
  const events: TEvent[] = [];
  if (st.over) return events;
  for (const h of free ? [] : fleeHits(st)) {
    const absorbed = Math.min(st.block, h.dmg);
    st.block -= absorbed;
    const dmg = Math.min(h.dmg - absorbed, Math.max(0, st.hp - 1));
    st.hp -= dmg;
    events.push({ type: 'hurt', by: h.id, dmg, absorbed });
  }
  st.over = 'fled';
  return events;
}
