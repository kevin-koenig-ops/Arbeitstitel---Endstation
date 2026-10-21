import { describe, expect, it } from 'vitest';
import { CARDS, FOE_TACTICS, START_WEAPONS, TACTICS, WEAPONS } from '../src/core/content';
import { aliveFoes, createTactics, endTurn, flee, intentOf, playCard, targetsFor, type TacticsState } from '../src/core/tactics';
import type { FoeKind, Weapon } from '../src/core/types';

const start = (group: FoeKind[], o: { seed?: string; weapons?: Weapon[]; medicine?: number; health?: number } = {}) =>
  createTactics({ seed: o.seed ?? 'kampf-1', group, weapons: o.weapons ?? START_WEAPONS.map((w) => ({ ...w })), medicine: o.medicine ?? 0, health: o.health ?? 10, maxHealth: 10 });

/** Legt bestimmte Karten auf die Hand (für gezielte Tests). */
const withHand = (st: TacticsState, ...cards: (keyof typeof CARDS)[]) => {
  st.hand = [...cards];
  return st;
};

/** Ein einfacher, vernünftiger Spieler (für die Gleichgewichts-Prüfung). */
function autoPlay(st: TacticsState): void {
  const tryPlay = (pred: (c: keyof typeof CARDS) => boolean, pick: (c: keyof typeof CARDS) => number | undefined | null): boolean => {
    const i = st.hand.findIndex((c) => pred(c) && CARDS[c].cost <= st.energy && pick(c) !== null);
    if (i < 0) return false;
    const ev = playCard(st, i, pick(st.hand[i]) ?? undefined);
    return ev[0]?.type !== 'denied';
  };
  const incoming = () => aliveFoes(st).reduce((n, f) => n + (f.row === 'near' || f.kind === 'screamer' ? (f.intent.dmg ?? 0) : 0), 0);
  for (let round = 0; round < 40 && !st.over; round++) {
    for (let guard = 0; guard < 10 && !st.over; guard++) {
      const smasher = aliveFoes(st).find((f) => f.row === 'near' && f.intent.kind === 'smash');
      const screamer = aliveFoes(st).find((f) => f.kind === 'screamer');
      // 1. Schweren Schlag wegtreten
      if (smasher && tryPlay((c) => c === 'kick', () => smasher.id)) continue;
      // 2. Heuler zuerst
      if (screamer && tryPlay((c) => c === 'aim' && st.hand.includes('bolt'), () => undefined)) continue;
      if (screamer && tryPlay((c) => CARDS[c].target === 'any' && !!CARDS[c].dmg, () => screamer.id)) continue;
      // 3. Ausweichen bei viel Schaden
      if (incoming() - st.block >= 3 && tryPlay((c) => c === 'dodge', () => undefined)) continue;
      // 4. Verbinden
      if (st.hp <= st.maxHp - 3 && tryPlay((c) => c === 'bandage', () => undefined)) continue;
      // 5. Angreifen: stärkste Karte auf den schwächsten erreichbaren Gegner
      const attacks = st.hand
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => CARDS[c].dmg && CARDS[c].cost <= st.energy && targetsFor(st, c).length)
        .sort((a, b) => (CARDS[b.c].dmg ?? 0) / CARDS[b.c].cost - (CARDS[a.c].dmg ?? 0) / CARDS[a.c].cost);
      if (attacks.length) {
        const { c, i } = attacks[0];
        const t = [...targetsFor(st, c)].sort((a, b) => a.hp - b.hp)[0];
        if (playCard(st, i, t.id)[0]?.type !== 'denied') continue;
      }
      break;
    }
    if (!st.over) endTurn(st);
  }
}

describe('Taktik-Kampf', () => {
  it('ist für denselben Kampf immer gleich', () => {
    const a = start(['walker', 'crawler']);
    const b = start(['walker', 'crawler']);
    expect(a).toEqual(b);
    expect(a.hand.length).toBe(TACTICS.hand);
    expect(a.energy).toBe(TACTICS.energy);
  });

  it('nahe Karten treffen nur vorne, Würfe auch hinten', () => {
    const st = withHand(start(['walker', 'screamer']), 'punch', 'throw');
    const screamer = st.foes.find((f) => f.kind === 'screamer')!;
    expect(screamer.row).toBe('far');
    expect(targetsFor(st, 'punch').map((f) => f.kind)).toEqual(['walker']);
    expect(playCard(st, 0, screamer.id)).toEqual([{ type: 'play', card: 'punch', target: st.foes[0].id }, expect.objectContaining({ type: 'hit', dmg: 2 })]);
    const ev = playCard(st, 0, screamer.id);
    expect(ev[1]).toMatchObject({ type: 'hit', id: screamer.id, dmg: 1 });
  });

  it('ohne Kraft keine Karte', () => {
    const st = withHand(start(['brute']), 'pry', 'pry', 'pry', 'pry');
    playCard(st, 0);
    playCard(st, 0);
    playCard(st, 0);
    expect(st.energy).toBe(0);
    expect(playCard(st, 0)).toEqual([{ type: 'denied', reason: 'energy' }]);
  });

  it('ein Tritt unterbricht das Ausholen des Borkenmanns', () => {
    const st = start(['brute']);
    const brute = st.foes[0];
    brute.step = FOE_TACTICS.brute.pattern.findIndex((p) => p.kind === 'windup') + 1; // als Nächstes: schwerer Schlag
    brute.intent = intentOf(brute);
    expect(brute.intent).toEqual({ kind: 'smash', dmg: 6 });
    withHand(st, 'kick');
    const ev = playCard(st, 0, brute.id);
    expect(ev.map((e) => e.type)).toEqual(['play', 'hit', 'push']);
    expect(brute.row).toBe('far');
    const hp = st.hp;
    endTurn(st);
    expect(st.hp).toBe(hp); // kommt erst wieder näher
    expect(brute.row).toBe('near');
  });

  it('Ausweichen fängt Schaden ab, Packen kostet Kraft', () => {
    const st = start(['walker']);
    const w = st.foes[0];
    w.step = FOE_TACTICS.walker.pattern.findIndex((p) => p.kind === 'grab');
    w.intent = intentOf(w);
    withHand(st, 'dodge');
    playCard(st, 0);
    const ev = endTurn(st);
    expect(ev).toContainEqual({ type: 'hurt', by: w.id, dmg: 0, absorbed: 1 });
    expect(ev).toContainEqual({ type: 'grabbed', by: w.id });
    expect(st.energy).toBe(TACTICS.energy - 1);
  });

  it('der Heuler ruft Wandler herbei', () => {
    const st = start(['screamer']);
    const s = st.foes[0];
    s.step = 0;
    s.intent = intentOf(s);
    const ev = endTurn(st);
    expect(ev.find((e) => e.type === 'summon')).toMatchObject({ kind: 'walker' });
    expect(aliveFoes(st).length).toBe(2);
  });

  it('Waffenkarten nutzen die Waffe ab, bis sie bricht', () => {
    const st = start(['brute'], { weapons: [{ kind: 'crowbar', dur: 1 }] });
    withHand(st, 'pry', 'punch');
    st.draw.push('pry');
    const ev = playCard(st, 0, st.foes[0].id);
    expect(ev).toContainEqual({ type: 'weaponBroke', weapon: 'crowbar' });
    expect(st.wear).toEqual({ crowbar: 1 });
    expect([...st.hand, ...st.draw, ...st.discard].filter((c) => c === 'pry').length).toBe(0); // die Brechstange ist weg
  });

  it('Verbinden braucht Medizin', () => {
    const st = start(['walker'], { medicine: 1, health: 4 });
    withHand(st, 'bandage', 'bandage');
    st.medicine = 1;
    expect(playCard(st, 0)).toContainEqual({ type: 'heal', amount: 3 });
    expect(st.hp).toBe(7);
    expect(playCard(st, 0)).toEqual([{ type: 'denied', reason: 'medicine' }]);
    expect(st.usedMedicine).toBe(1);
  });

  it('gewonnen, wenn alle Gegner liegen; Fliehen geht immer', () => {
    const st = start(['crawler']);
    st.foes[0].hp = 2;
    withHand(st, 'punch');
    playCard(st, 0);
    expect(st.over).toBe('won');
    expect(st.kills).toBe(1);
    const f = start(['brute', 'walker']);
    flee(f);
    expect(f.over).toBe('fled');
  });

  it('Gleichgewicht: mit der Brechstange sind normale Kämpfe gut zu schaffen', () => {
    const rate = (group: FoeKind[], weapons: Weapon[] = START_WEAPONS) => {
      let won = 0;
      let hpLeft = 0;
      for (let i = 0; i < 200; i++) {
        const st = start(group, { seed: `sim-${group.join('-')}-${i}`, weapons: weapons.map((w) => ({ ...w })), medicine: 1 });
        autoPlay(st);
        if (st.over === 'won') {
          won++;
          hpLeft += st.hp;
        }
      }
      return { won: won / 200, hp: won ? hpLeft / won : 0 };
    };
    expect(rate(['walker']).won).toBeGreaterThan(0.95);
    expect(rate(['crawler', 'crawler']).won).toBeGreaterThan(0.85);
    expect(rate(['walker', 'walker']).won).toBeGreaterThan(0.75);
    expect(rate(['brute']).won).toBeGreaterThan(0.6);
    // Der Bleiche Wächter ist eine echte Nacht-Herausforderung, aber schaffbar
    const w = rate(['watcher']);
    expect(w.won).toBeGreaterThan(0.45);
    expect(w.won).toBeLessThan(0.97);
    // Schwerer Brocken: mit Nagelschläger deutlich leichter
    const bat = [{ kind: 'bat' as const, dur: WEAPONS.bat.dur }];
    expect(rate(['brute', 'walker'], bat).won).toBeGreaterThan(rate(['brute', 'walker']).won - 0.05);
    // Ohne Waffe geht es auch, nur schwerer
    expect(rate(['walker'], []).won).toBeGreaterThan(0.6);
  });
});

describe('Bleicher Wächter', () => {
  it('starrt, schlägt zu, weicht ins Dunkel und springt dich an', () => {
    const st = start(['watcher']);
    const w = aliveFoes(st)[0];
    // Muster von vorne beginnen lassen
    w.step = 0;
    w.intent = intentOf(w);
    expect(w.intent.kind).toBe('stare');
    // Runde 1: Starren -> nächste Runde eine Karte weniger
    let ev = endTurn(st);
    expect(ev.some((e) => e.type === 'stare')).toBe(true);
    expect(st.hand.length).toBe(3);
    // Runde 2: Angriff
    expect(w.intent).toEqual({ kind: 'attack', dmg: 4 });
    endTurn(st);
    expect(st.hand.length).toBe(4);
    // Runde 3: ins Dunkel, dann hinten mit Abwehr
    expect(w.intent.kind).toBe('fade');
    ev = endTurn(st);
    expect(ev.some((e) => e.type === 'fade')).toBe(true);
    expect(w.row).toBe('far');
    // Hinten trifft ihn kein Nahkampf, nur Wurf und Bolzen
    expect(targetsFor(st, 'punch').length).toBe(0);
    expect(targetsFor(st, 'throw').length).toBe(1);
    // Runde 4: Sprung von hinten, mit vollem Schaden
    expect(w.intent).toEqual({ kind: 'pounce', dmg: 6 });
    const hp = st.hp;
    ev = endTurn(st);
    expect(ev.some((e) => e.type === 'pounce')).toBe(true);
    expect(w.row).toBe('near');
    expect(st.hp).toBe(hp - 6);
  });
});
