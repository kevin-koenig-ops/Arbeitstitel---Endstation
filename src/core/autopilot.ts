// Autopilot: spielt einen Kampf vernünftig zu Ende, wie ein ordentlicher, aber nicht perfekter
// Mensch. Gebraucht im Balancing-Labor (npm run balance) und später für Gruppen-Dungeons
// (wer lange nicht zieht, für den spielt der Autopilot vorsichtig).
//
// Rein und vorhersagbar wie der Kampf selbst: gleicher Kampf, gleiche Züge.

import { CARDS, FOE_RULES, FOE_TACTICS, STANCE, type CardId, type DeviceId } from './content';
import { aliveFoes, armorNow, endTurn, flee, HITS, lacksMedicine, playCard, playPouch, targetsFor, type TacticsState, type TFoe } from './tactics';

export interface AutopilotOptions {
  /** Einmal-Karten aus der Tasche: klug einsetzen, nur im Notfall oder nie. */
  pouch?: 'smart' | 'emergency' | 'never';
  /** Fliehen, wenn es so schlecht steht (Gesundheit höchstens so viel und Lebensgefahr). null = nie. */
  fleeAt?: number | null;
}

/** Wie viel Schaden kommt diese Runde auf dich zu (ohne deinen Schutz)? */
export function incoming(st: TacticsState): number {
  let n = 0;
  for (const f of aliveFoes(st)) {
    if (f.stunned || f.blind > 0) continue;
    const k = f.intent.kind;
    if (!HITS.includes(k)) continue;
    if (!(f.row === 'near' || k === 'pounce' || k === 'ambush' || FOE_TACTICS[f.kind].stayBack)) continue;
    let d = f.intent.dmg ?? 0;
    if (d > 0 && st.stance === 'calm') d = Math.max(0, d - STANCE.calmGuard);
    else if (d > 0 && st.stance === 'wrath') d += STANCE.wrathTaken;
    n += d;
  }
  return n;
}

const isHowler = (f: TFoe) => FOE_TACTICS[f.kind].pattern.some((p) => p.kind === 'howl');
/** Schwere angekündigte Schläge (Wuchtschlag, Rammstoß, Wurf des Hünen). */
const isBigHit = (f: TFoe) => f.intent.kind === 'smash' || f.intent.kind === 'ram' || f.intent.kind === 'hurl';
/** Was es bringt, ihn zu erledigen, für die anderen: der Leithammel treibt sie an, fällt er, setzen sie aus. */
const leaderValue = (st: TacticsState, f: TFoe) => (FOE_TACTICS[f.kind].scatter ? aliveFoes(st).filter((x) => x.id !== f.id).reduce((a, x) => a + 1 + (x.intent.dmg ?? 0), 0) : 0);

/** Schaden, der wirklich ankommt (Rüstung, Abwehr, Zielen). */
function effDmg(st: TacticsState, card: CardId, f: TFoe, first = true): number {
  const d = CARDS[card];
  let raw = d.dmg ?? 0;
  if (!raw) return 0;
  raw += Math.max(0, (st.levels[card] ?? 1) - 1) * (d.scale?.dmg ?? 0);
  if (first && d.target === 'any' && st.focus) raw += st.focus;
  if (d.vs && f.kind === d.vs.kind) raw += d.vs.dmg;
  if (d.farBonus && f.row === 'far') raw += d.farBonus;
  if (d.thrown) raw += st.pitcher;
  if (first) raw += st.momentum;
  if (first && st.stance === 'wrath') raw += STANCE.wrathDmg;
  if (first && d.weapon && st.overdrive) raw += st.overdrive.dmg;
  if (st.rage && st.hp <= 3) raw += st.rage;
  // Schlafend doppelt, erstarrt spröde
  if (f.sleep > 0) raw *= 2;
  if (f.frozen > 0) raw += FOE_RULES.brittle;
  const after = d.pierce ? raw : Math.max(1, raw - armorNow(f));
  return Math.max(0, after - f.block);
}

/** Wen träfe die Karte (Flächenkarten: alle passenden)? */
function hitList(st: TacticsState, card: CardId, target?: TFoe): TFoe[] {
  const d = CARDS[card];
  if (d.area) return aliveFoes(st).filter((f) => d.area === 'all' || f.row === d.area);
  return target ? [target] : [];
}

/** Wie gut ist diese Karte gerade (grob: Schaden, Töten, Kontrolle) pro Kraft? */
function score(st: TacticsState, card: CardId, target?: TFoe): number {
  const d = CARDS[card];
  const foes = hitList(st, card, target);
  let v = 0;
  for (const f of foes) {
    const dmg = effDmg(st, card, f, f === foes[0]);
    v += Math.min(dmg, f.hp);
    if (dmg >= f.hp) v += 2 + (f.intent.dmg ?? 0) + leaderValue(st, f); // Erledigt: keine Gefahr mehr
    // Den Leithammel zuerst: jeder Treffer bringt ihn dem Fall näher
    if (FOE_TACTICS[f.kind].scatter) v += Math.min(dmg, f.hp) * 0.5;
    const threat = f.intent.dmg ?? 0;
    if (d.stun && !f.stunned && !f.steady) v += 1 + threat;
    if (d.stunIfWindup && !f.steady && (f.intent.kind === 'windup' || f.intent.kind === 'charge' || isBigHit(f))) v += 2 + threat;
    if ((d.push || d.interrupt) && f.row === 'near' && !FOE_TACTICS[f.kind].heavy && (isBigHit(f) || f.intent.kind === 'windup' || f.intent.kind === 'charge')) v += 4;
    // Wegstoßen lohnt, wenn danach Pfeile fliegen können
    if (d.push && f.row === 'near' && st.hand.some((c) => CARDS[c].farBonus)) v += 2;
    if (d.blind && threat) v += threat;
    // Feuer auf einen Erstarrten taut ihn auf und macht ihn wütend: lieber nicht
    if (d.burn) v += FOE_TACTICS[f.kind].frozen && !f.thawed ? -6 : Math.min(f.hp, (d.burn ?? 0) * (f.kind === 'walker' ? 2 : 1)) * 0.8;
    if (d.slow && f.row === 'far') v += 1.5;
    if (d.silence && isHowler(f) && (f.howls < 2 || f.intent.kind === 'roar')) v += 3;
  }
  // Schwung lohnt, wenn danach noch ein Angriff kommt
  const mom = (d.momentum ?? 0) + Math.max(0, (st.levels[card] ?? 1) - 1) * (d.scale?.momentum ?? 0);
  if (mom && st.energy - d.cost >= 1 && st.hand.some((c) => c !== card && CARDS[c].dmg && CARDS[c].cost <= st.energy - d.cost)) v += mom * 0.8;
  if (d.chain && target) {
    const other = aliveFoes(st).filter((x) => x.id !== target.id)[0];
    if (other) v += Math.min(effDmg(st, card, other, false), other.hp);
  }
  return v / Math.max(0.6, d.cost);
}

type PlayBase = { from: 'hand'; i: number; card: CardId } | { from: 'pouch'; card: CardId };
type Play = PlayBase & { target?: number };

function options(st: TacticsState, pouch: boolean): Play[] {
  const out: Play[] = [];
  const add = (p: PlayBase, card: CardId) => {
    const d = CARDS[card];
    if (d.cost > st.energy) return;
    if (d.perTurn && (st.turnPlays[card] ?? 0) >= d.perTurn) return;
    if (lacksMedicine(st, card)) return;
    if (d.target === 'self') out.push({ ...p });
    else for (const f of targetsFor(st, card)) out.push({ ...p, target: f.id });
  };
  st.hand.forEach((card, i) => add({ from: 'hand', i, card }, card));
  if (pouch) for (const [card, n] of Object.entries(st.pouch) as [CardId, number][]) if (n > 0) add({ from: 'pouch', card }, card);
  return out;
}

function play(st: TacticsState, p: Play): boolean {
  const ev = p.from === 'hand' ? playCard(st, p.i, p.target) : playPouch(st, p.card, p.target);
  return ev.length > 0 && ev[0].type !== 'denied';
}

/** Eine Runde lang Karten spielen (ohne „Runde beenden“). */
export function autopilotTurn(st: TacticsState, o: AutopilotOptions = {}): void {
  const pouchMode = o.pouch ?? 'smart';
  for (let guard = 0; guard < 16 && !st.over; guard++) {
    const foes = aliveFoes(st);
    const danger = incoming(st) - st.block;
    const risky = foes.length >= 2 || foes.some((f) => f.kind === 'brute' || f.kind === 'watcher' || f.kind === 'giant' || f.kind === 'ramhead') || st.hp <= 5;
    const usePouch = pouchMode === 'smart' ? risky : pouchMode === 'emergency' ? danger >= st.hp || st.hp <= 3 : false;
    const opts = options(st, usePouch);
    if (!opts.length) return;
    const get = (id?: number) => foes.find((f) => f.id === id);
    const pick = (list: Play[], val: (p: Play) => number): Play | null => {
      let best: Play | null = null;
      let bv = 0;
      for (const p of list) {
        // Einmal-Karten nur, wenn sie deutlich mehr bringen als eine Handkarte
        const v = val(p) * (p.from === 'pouch' ? 0.7 : 1);
        if (v > bv) {
          bv = v;
          best = p;
        }
      }
      return best;
    };
    // 1. Wuchtschlag oder Sprung abwenden
    const smasher = foes.find((f) => f.row === 'near' && isBigHit(f) && !f.stunned);
    if (smasher) {
      const heavy = !!FOE_TACTICS[smasher.kind].heavy;
      const p = pick(opts, (x) => {
        const d = CARDS[x.card];
        return (x.target === smasher.id && ((d.push && !heavy) || d.stun || d.interrupt || d.stunIfWindup)) || (d.area && (d.stun || d.interrupt)) ? 10 - d.cost : 0;
      });
      if (p && play(st, p)) continue;
    }
    // 2. Lebensgefahr: abwehren, heilen
    if (danger >= st.hp || (danger >= 4 && st.hp <= 6)) {
      const p = pick(opts, (x) => {
        const d = CARDS[x.card];
        const blk = (d.block ?? 0) + Math.max(0, (st.levels[x.card] ?? 1) - 1) * (d.scale?.block ?? 0);
        const heal = d.heal && !d.passive ? Math.min(d.heal, st.maxHp - st.hp) : 0;
        const blind = d.blind && d.area === 'all' ? danger : 0;
        const stun = d.stun && d.area === 'all' ? danger : 0;
        const kill = x.target !== undefined && get(x.target) && effDmg(st, x.card, get(x.target)!) >= get(x.target)!.hp ? get(x.target)!.intent.dmg ?? 0 : 0;
        return (Math.min(blk, danger) + heal + blind + stun + kill) / Math.max(0.6, d.cost);
      });
      if (p && play(st, p)) continue;
    }
    // 3. Heuler, die gleich rufen (oder brüllen): zum Schweigen bringen
    const howler = foes.find((f) => isHowler(f) && ((f.intent.kind === 'howl' && f.howls < 2) || f.intent.kind === 'roar') && f.silence <= 0);
    if (howler) {
      const p = pick(opts, (x) => (x.target === howler.id && (CARDS[x.card].dmg || CARDS[x.card].silence || CARDS[x.card].stun) ? 5 + effDmg(st, x.card, howler) : 0));
      if (p && play(st, p)) continue;
    }
    // 4. Zielen, wenn ein Fernangriff auf der Hand ist
    if (!st.focus && st.hand.some((c) => CARDS[c].target === 'any' && CARDS[c].dmg)) {
      const p = opts.find((x) => x.from === 'hand' && CARDS[x.card].focus && !CARDS[x.card].dmg);
      if (p && st.energy - CARDS[p.card].cost >= 1 && play(st, p)) continue;
    }
    // 5. Heilen, wenn es ruhig ist und viel fehlt
    if (st.hp <= st.maxHp - 4 && danger < 3) {
      const p = opts.find((x) => CARDS[x.card].heal && !CARDS[x.card].gain && x.from === 'hand');
      if (p && play(st, p)) continue;
    }
    // 6. Abwehr, wenn viel kommt
    if (danger >= 3) {
      const p = pick(opts, (x) => {
        const d = CARDS[x.card];
        const blk = (d.block ?? 0) + Math.max(0, (st.levels[x.card] ?? 1) - 1) * (d.scale?.block ?? 0);
        return blk && !d.dmg ? Math.min(blk, danger) / Math.max(0.6, d.cost) : 0;
      });
      if (p && (danger >= 5 || st.hp <= 6) && play(st, p)) continue;
    }
    // 6b. Falle legen, wenn hinten jemand gleich nach vorn kommt
    if (!st.traps.length && foes.some((f) => f.row === 'far' && f.slow <= 0 && !FOE_TACTICS[f.kind].stayBack)) {
      const p = opts.find((x) => CARDS[x.card].trap);
      if (p && play(st, p)) continue;
    }
    // 6c. Heuler hinten und Schläge auf der Hand: mit dem Wecker nach vorn holen
    const farHowler = foes.find((f) => f.row === 'far' && isHowler(f));
    if (farHowler && st.hand.some((c) => CARDS[c].target === 'near' && CARDS[c].dmg)) {
      const p = opts.find((x) => CARDS[x.card].pull);
      if (p && st.energy - CARDS[p.card].cost >= 1 && play(st, p)) continue;
    }
    // 6d. Tüftler: ein Gerät aufstellen, wenn es etwas bringt; Ladegerät, wenn Geräte stehen
    const wantDevice = (k: DeviceId) =>
      k === 'fence' ? foes.length >= 2 || foes.some((f) => f.kind === 'brute' || f.kind === 'watcher') : k === 'lamp' ? foes.some((f) => f.row === 'far' && !FOE_TACTICS[f.kind].stayBack) : foes.some((f) => isHowler(f) && f.howls < 2);
    const dev = opts.find((x) => {
      const dv = CARDS[x.card].device;
      return !!dv && !st.devices.some((d) => d.kind === dv.kind) && wantDevice(dv.kind);
    });
    if (dev && play(st, dev)) continue;
    const chg = opts.find((x) => CARDS[x.card].charge && st.devices.length > 0);
    if (chg && play(st, chg)) continue;
    // 6e. Kleinkram: Würfe auf die Hand holen; Zaunlatte früh in den Stapel
    const mk = opts.find((x) => CARDS[x.card].make?.to === 'hand' && !CARDS[x.card].area && (CARDS[x.card].cost === 0 || st.energy >= 2));
    if (mk && play(st, mk)) continue;
    const lath = opts.find((x) => CARDS[x.card].make?.to === 'draw' && st.turn <= 2);
    if (lath && play(st, lath)) continue;
    // 6f. Raubbau: fast kaputte Waffe flicken, volle Wucht vor einem Waffenschlag
    if (Object.values(st.weaponDur).some((d) => (d ?? 0) > 0 && (d ?? 0) <= 4)) {
      const rep = opts.find((x) => CARDS[x.card].repair);
      if (rep && play(st, rep)) continue;
    }
    if (!st.overdrive && st.hand.some((c) => CARDS[c].weapon && CARDS[c].dmg && CARDS[c].cost <= st.energy)) {
      const od = opts.find((x) => CARDS[x.card].overdrive);
      if (od && play(st, od)) continue;
    }
    // 6g. Haltung: aus der Ruhe heraus Kraft holen, rasend werden, wenn es sicher genug ist
    if (st.stance === 'calm' && danger < st.hp - 3) {
      const un = opts.find((x) => x.card === 'unleash');
      if (un && play(st, un)) continue;
    }
    if (st.stance !== 'wrath' && st.energy >= 2 && danger < st.hp - 4) {
      const fr = opts.find((x) => x.card === 'frenzy');
      if (fr && st.hand.some((c) => c !== 'frenzy' && CARDS[c].dmg) && play(st, fr)) continue;
    }
    // 7. Angreifen: das Beste pro Kraft
    const att = pick(opts, (x) => (CARDS[x.card].dmg || CARDS[x.card].burn || CARDS[x.card].stun || CARDS[x.card].blind || CARDS[x.card].slow || CARDS[x.card].momentum ? score(st, x.card, get(x.target)) : 0));
    if (att && play(st, att)) continue;
    // 8. Sonstiges: Karten ziehen, Hund, Kraft
    const misc = opts.find((x) => x.from === 'hand' && (CARDS[x.card].draw || CARDS[x.card].ally || CARDS[x.card].gain));
    if (misc && play(st, misc)) continue;
    // 9. Übrige Kraft in Abwehr stecken
    if (danger > 0) {
      const p = opts.find((x) => x.from === 'hand' && CARDS[x.card].block && !CARDS[x.card].dmg);
      if (p && play(st, p)) continue;
    }
    return;
  }
}

/** Einen ganzen Kampf spielen. */
export function autopilotFight(st: TacticsState, o: AutopilotOptions = {}, maxRounds = 40): void {
  for (let round = 0; round < maxRounds && !st.over; round++) {
    autopilotTurn(st, o);
    if (st.over) break;
    if (o.fleeAt != null && st.hp <= o.fleeAt && incoming(st) - st.block >= st.hp) {
      flee(st);
      break;
    }
    endTurn(st);
  }
  if (!st.over) flee(st);
}
