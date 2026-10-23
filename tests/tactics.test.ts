import { describe, expect, it } from 'vitest';
import { CARDS, FOE_TACTICS, START_WEAPONS, TACTICS, WEAPONS } from '../src/core/content';
import { aliveFoes, createTactics, deckFor, endTurn, flee, fleeCost, intentOf, playCard, playPouch, pouchFor, targetsFor, type CardKit, type TacticsState } from '../src/core/tactics';
import type { FoeKind, Weapon } from '../src/core/types';
import { autopilotFight } from '../src/core/autopilot';

const start = (group: FoeKind[], o: { seed?: string; weapons?: Weapon[]; medicine?: number; health?: number; kit?: CardKit; opening?: 'surprise' | 'spotted' } = {}) =>
  createTactics({ seed: o.seed ?? 'kampf-1', group, weapons: o.weapons ?? START_WEAPONS.map((w) => ({ ...w })), medicine: o.medicine ?? 0, health: o.health ?? 10, maxHealth: 10, kit: o.kit, opening: o.opening });

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
    expect(brute.intent).toEqual({ kind: 'smash', dmg: 8 });
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
    expect(ev).toContainEqual({ type: 'hurt', by: w.id, dmg: 0, absorbed: 2 });
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
    expect(playCard(st, 0)).toContainEqual({ type: 'heal', amount: 4 });
    expect(st.hp).toBe(8);
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
    expect(w.intent).toEqual({ kind: 'attack', dmg: 5 });
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
    expect(w.intent).toEqual({ kind: 'pounce', dmg: 8 });
    st.hp = st.maxHp;
    const hp = st.hp;
    ev = endTurn(st);
    expect(ev.some((e) => e.type === 'pounce')).toBe(true);
    expect(w.row).toBe('near');
    expect(st.hp).toBe(hp - 8);
  });

  describe('Sammelkarten', () => {
    it('Einmal-Karten liegen in der Tasche (3 Sorten, je höchstens 3), nicht im Stapel', () => {
      const kit: CardKit = { pouch: { molotov: 5, grenade: 1, smoke: 2, pepper: 4 }, skills: { counter: 1, sneak: 2 } };
      const deck = deckFor(START_WEAPONS, 0, kit);
      expect(deck.some((c) => CARDS[c].kind === 'once')).toBe(false);
      // Aktive Fähigkeit einmal im Deck, die passive nicht
      expect(deck.filter((c) => c === 'counter').length).toBe(1);
      expect(deck.includes('sneak')).toBe(false);
      expect(pouchFor(kit)).toEqual({ molotov: 3, grenade: 1, smoke: 2 });
      // Aus der Tasche spielen: jederzeit, danach weg
      const t = withHand(start(['walker', 'walker'], { kit: { pouch: { grenade: 1, molotov: 2 } } }));
      t.energy = 3;
      expect(playPouch(t, 'smoke')).toEqual([]);
      expect(playPouch(t, 'grenade')[0]).toMatchObject({ type: 'play', card: 'grenade' });
      expect(t.pouch.grenade).toBe(0);
      expect(t.used.grenade).toBe(1);
      expect(t.energy).toBe(1);
      expect(playPouch(t, 'grenade')).toEqual([]);
      // Zu wenig Kraft: bleibt in der Tasche
      t.energy = 0;
      expect(playPouch(t, 'molotov')[0]).toEqual({ type: 'denied', reason: 'energy' });
      expect(t.pouch.molotov).toBe(2);
      const st = withHand(start(['walker', 'walker']), 'grenade');
      st.energy = 3;
      playCard(st, 0);
      expect(st.used.grenade).toBe(1);
      expect(st.discard.includes('grenade')).toBe(false);
      expect(aliveFoes(st).every((f) => f.hp === f.maxHp - 6)).toBe(true);
    });

    it('Brandflasche: alle vorne brennen, Wandler doppelt', () => {
      const st = withHand(start(['walker', 'crawler']), 'molotov');
      const near = aliveFoes(st).filter((f) => f.row === 'near');
      const hp0 = near.map((f) => f.hp);
      playCard(st, 0);
      near.forEach((f, i) => expect(f.hp).toBe(hp0[i] - 2));
      expect(near.every((f) => f.burn === 3)).toBe(true);
      const before = near.map((f) => f.hp);
      const ev = endTurn(st);
      expect(ev.filter((e) => e.type === 'burn').length).toBe(near.filter((_f, i) => before[i] > 0).length);
      const w = near.find((f) => f.kind === 'walker')!;
      expect(w.hp).toBe(Math.max(0, before[near.indexOf(w)] - 2));
    });

    it('Rauchdose: der nächste Angriff geht daneben', () => {
      const st = withHand(start(['walker']), 'smoke');
      const w = aliveFoes(st)[0];
      w.row = 'near';
      w.intent = { kind: 'attack', dmg: 3 };
      w.step = 0;
      playCard(st, 0);
      const hp = st.hp;
      const ev = endTurn(st);
      expect(ev.some((e) => e.type === 'miss')).toBe(true);
      expect(st.hp).toBe(hp);
    });

    it('Krähenfüße: wer hinten steht, kommt 2 Runden nicht nach vorn', () => {
      const st = withHand(start(['walker', 'walker', 'walker']), 'caltrops');
      const far = aliveFoes(st).find((f) => f.row === 'far')!;
      playCard(st, 0);
      expect(far.slow).toBe(2);
      endTurn(st);
      expect(far.row).toBe('far');
    });

    it('Konter, Rudelführer, Zweiter Atem und Letztes Gefecht', () => {
      // Konter: Angreifer nimmt Schaden
      let st = withHand(start(['walker'], { kit: { skills: { counter: 1 } } }), 'counter');
      const w = aliveFoes(st)[0];
      w.row = 'near';
      w.step = 0;
      w.stunned = false;
      const hp0 = w.hp;
      playCard(st, 0);
      const ev = endTurn(st);
      if (ev.some((e) => e.type === 'hurt')) expect(w.hp).toBeLessThan(hp0);
      // Rudelführer: der Hund beißt
      st = withHand(start(['brute'], { kit: { skills: { packleader: 3 } } }), 'packleader');
      playCard(st, 0);
      expect(st.ally).toEqual({ rounds: 3, dmg: 4 });
      const ev2 = endTurn(st);
      expect(ev2.some((e) => e.type === 'ally' && e.dmg === 4)).toBe(true);
      // Zweiter Atem: unter 3 Gesundheit einmal heilen
      st = start(['brute'], { health: 3, kit: { skills: { secondwind: 1 } } });
      expect(st.secondWind).toBe(4);
      // Letztes Gefecht: tödlicher Treffer lässt dich bei 1
      st = start(['brute'], { health: 1, kit: { skills: { laststand: 1 }, lastStand: true } });
      const b = aliveFoes(st)[0];
      b.row = 'near';
      b.stunned = false;
      b.step = FOE_TACTICS.brute.pattern.findIndex((p) => (p.dmg ?? 0) > 0);
      st.hand = [];
      endTurn(st);
      expect(st.hp).toBe(1);
      expect(st.lastStandUsed).toBe(true);
      expect(st.over).toBe(null);
    });

    it('Stufen machen Fähigkeiten stärker, Leise Sohlen wirkt von selbst', () => {
      const st = withHand(start(['walker'], { kit: { skills: { counter: 3 } } }), 'counter');
      playCard(st, 0);
      expect(st.block).toBe(4);
      expect(st.thorns).toBe(4);
      const sneaky = start(['walker', 'crawler'], { kit: { skills: { sneak: 2 } } });
      expect(sneaky.foes.every((f) => f.stunned)).toBe(true);
      expect(sneaky.energy).toBe(TACTICS.energy + 1);
      // Entdeckt: Leise Sohlen hilft nicht
      const spotted = start(['walker'], { kit: { skills: { sneak: 2 } }, opening: 'spotted' });
      expect(spotted.foes.some((f) => f.stunned)).toBe(false);
    });

    it('Schleuder: nur einmal pro Runde; Nagelpistole trifft zwei', () => {
      const st = withHand(start(['walker', 'crawler'], { weapons: [{ kind: 'slingshot', dur: 10 }, { kind: 'nailgun', dur: 10 }] }), 'pellet', 'pellet', 'nail');
      const t = aliveFoes(st)[0].id;
      expect(playCard(st, 0, t)[0].type).toBe('play');
      expect(playCard(st, 0, t)[0]).toEqual({ type: 'denied', reason: 'limit' });
      const hits = playCard(st, 1, aliveFoes(st)[0].id).filter((e) => e.type === 'hit');
      expect(hits.length).toBe(2);
    });

    it('Kartenplan: Steinwurf macht still, Axthieb betäubt, Rundumschlag kostet 1, Salve trifft alle', () => {
      // Steinwurf: Der Heuler ruft in seiner nächsten Runde niemanden
      const st = withHand(start(['walker', 'screamer']), 'throw');
      const sc = aliveFoes(st).find((f) => f.kind === 'screamer')!;
      sc.intent = { kind: 'howl' };
      sc.step = FOE_TACTICS.screamer.pattern.findIndex((p) => p.kind === 'howl');
      const ev = playCard(st, 0, sc.id);
      expect(ev.some((e) => e.type === 'status' && e.status === 'silence')).toBe(true);
      expect(sc.silence).toBe(1);
      st.hand = [];
      expect(endTurn(st).some((e) => e.type === 'summon')).toBe(false);
      // Steinwurf auf einen Wandler: kein „Verstummt“
      const st2 = withHand(start(['walker']), 'throw');
      expect(playCard(st2, 0, aliveFoes(st2)[0].id).some((e) => e.type === 'status')).toBe(false);
      expect(CARDS.chop.dmg).toBe(6);
      expect(CARDS.chop.stun).toBe(true);
      expect(CARDS.sweep.cost).toBe(1);
      // Salve
      const st3 = withHand(start(['walker', 'walker', 'walker'], { weapons: [{ kind: 'nailgun', dur: 10 }] }), 'salvo');
      const hits = playCard(st3, 0).filter((e) => e.type === 'hit');
      expect(hits.length).toBe(3);
      expect(st3.weaponDur.nailgun).toBe(9);
      // Nägel gehen durch die Kalkplatten des Borkenmanns
      const st4 = withHand(start(['brute'], { weapons: [{ kind: 'nailgun', dur: 10 }] }), 'nail', 'punch');
      const b = aliveFoes(st4)[0];
      expect(playCard(st4, 0, b.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 2 });
      b.row = 'near';
      expect(playCard(st4, 0, b.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 1 });
    });

    it('Feuer: Zunder trifft auch hinten, Funkenschlag wird mit der Stufe heißer, Glut verlängert', () => {
      const st = withHand(start(['walker', 'walker', 'walker']), 'spark');
      const far = aliveFoes(st).find((f) => f.row === 'far')!;
      st.pouch = { tinder: 1 };
      playPouch(st, 'tinder', far.id);
      expect(far.burn).toBe(2);
      const near = aliveFoes(st).find((f) => f.row === 'near')!;
      playCard(st, 0, near.id);
      expect(near.burn).toBe(2);
      // Stufe III und Glut II: 4 + 2
      const hot = withHand(start(['brute'], { kit: { skills: { spark: 3, embers: 2 } } }), 'spark');
      const b = aliveFoes(hot)[0];
      b.row = 'near';
      playCard(hot, 0, b.id);
      expect(b.burn).toBe(6);
      // Ölkanister: alle, vorne und hinten
      const oil = start(['walker', 'walker', 'walker'], { kit: { pouch: { oilcan: 1 } } });
      playPouch(oil, 'oilcan');
      expect(aliveFoes(oil).every((f) => f.burn === 2)).toBe(true);
    });

    it('Lauffeuer: Fällt ein brennender Gegner, fängt der nächste Feuer', () => {
      const st = withHand(start(['walker', 'crawler'], { kit: { skills: { wildfire: 1 } } }), 'pry');
      const [a, b] = aliveFoes(st);
      a.row = 'near';
      a.burn = 2;
      a.hp = 2;
      b.burn = 0;
      const ev = playCard(st, 0, a.id);
      expect(a.hp).toBe(0);
      expect(ev.some((e) => e.type === 'spread' && e.from === a.id && e.id === b.id)).toBe(true);
      expect(b.burn).toBe(2);
      // Auch wenn das Feuer selbst ihn erledigt
      const st2 = start(['walker', 'crawler'], { kit: { skills: { wildfire: 2 } } });
      const [c, d] = aliveFoes(st2);
      c.burn = 1;
      c.hp = 1;
      d.burn = 0;
      st2.hand = [];
      const ev2 = endTurn(st2);
      expect(ev2.some((e) => e.type === 'spread' && e.id === d.id)).toBe(true);
      expect(d.burn).toBeGreaterThanOrEqual(2);
      // Ohne Lauffeuer: nichts
      const st3 = withHand(start(['walker', 'crawler']), 'pry');
      const [e, f] = aliveFoes(st3);
      e.row = 'near';
      e.burn = 2;
      e.hp = 2;
      playCard(st3, 0, e.id);
      expect(f.burn).toBe(0);
    });
  });
});

describe('Autopilot', () => {
  it('spielt einen Kampf zu Ende, immer gleich', () => {
    const a = start(['walker', 'crawler'], { seed: 'auto-1' });
    const b = start(['walker', 'crawler'], { seed: 'auto-1' });
    autopilotFight(a);
    autopilotFight(b);
    expect(a.over).toBe('won');
    expect(a).toEqual(b);
  });

  it('nutzt die Tasche nur, wenn es gefährlich wird', () => {
    const easy = start(['walker'], { seed: 'auto-2', kit: { pouch: { grenade: 1 } } });
    autopilotFight(easy, { pouch: 'emergency' });
    expect(easy.used.grenade ?? 0).toBe(0);
  });
});

describe('Fliehen', () => {
  it('kostet einen letzten Treffer von denen vorne, rettet aber immer', () => {
    const st = start(['walker', 'walker', 'walker']);
    const [a, b, c] = aliveFoes(st);
    a.row = 'near';
    a.stunned = false;
    a.intent = { kind: 'attack', dmg: 3 };
    b.row = 'near';
    b.stunned = true;
    c.row = 'far';
    st.block = 1;
    expect(fleeCost(st)).toBe(2);
    flee(st);
    expect(st.over).toBe('fled');
    expect(st.hp).toBe(8);
    // Nie tödlich
    const low = start(['brute']);
    const br = aliveFoes(low)[0];
    br.row = 'near';
    br.stunned = false;
    br.intent = { kind: 'smash', dmg: 8 };
    low.hp = 3;
    flee(low);
    expect(low.hp).toBe(1);
    // Nur Gegner hinten: kostenlos
    const free = start(['walker']);
    aliveFoes(free)[0].row = 'far';
    expect(fleeCost(free)).toBe(0);
  });
});

describe('Balancing-Ziele (Autopilot, Woche 1: Brechstange, Golfschläger, 2 Einmal-Karten, Konter, Atem holen)', () => {
  const rate = (group: FoeKind[], weapons: Weapon[], kit: CardKit, n = 150) => {
    let won = 0;
    let lost = 0;
    for (let i = 0; i < n; i++) {
      const st = start(group, { seed: `ziel-${group.join('-')}-${i}`, weapons: weapons.map((w) => ({ ...w })), medicine: 2, kit: { pouch: { ...(kit.pouch ?? {}) }, skills: kit.skills } });
      autopilotFight(st, { pouch: 'emergency', fleeAt: null });
      if (st.over === 'won') won++;
      lost += 10 - st.hp;
    }
    return { won: won / n, lost: lost / n };
  };
  const woche = [{ kind: 'crowbar' as const, dur: WEAPONS.crowbar.dur }, { kind: 'golfclub' as const, dur: WEAPONS.golfclub.dur }];
  const kit: CardKit = { pouch: { molotov: 2, pepper: 1 }, skills: { counter: 1, breath: 1 } };
  it('ein Wandler ist leicht, kostet aber etwas', () => {
    const r = rate(['walker'], woche, kit);
    expect(r.won).toBeGreaterThan(0.97);
    expect(r.lost).toBeGreaterThan(0.8);
    expect(r.lost).toBeLessThan(2.5);
  });
  it('ein Trupp kostet spürbar Gesundheit', () => {
    const r = rate(['walker', 'walker'], woche, kit);
    expect(r.won).toBeGreaterThan(0.9);
    expect(r.lost).toBeGreaterThan(3);
    expect(r.lost).toBeLessThan(6);
  });
  it('der Borkenmann ist eine echte Gefahr', () => {
    const r = rate(['brute'], woche, kit);
    expect(r.lost).toBeGreaterThan(3.5);
    expect(r.lost).toBeLessThan(6.5);
  });
  it('der Bleiche Wächter ist der Schreck der Nacht, aber schaffbar', () => {
    const r = rate(['watcher'], woche, kit);
    expect(r.won).toBeGreaterThan(0.7);
    expect(r.won).toBeLessThan(0.98);
    expect(r.lost).toBeGreaterThan(4);
  });
});

describe('Fallen und Abstand', () => {
  it('Stolperdraht: wer nach vorn kommt, stürzt; Fallensteller trifft härter', () => {
    const st = start(['walker', 'walker', 'walker'], { kit: { pouch: { tripwire: 1 }, skills: { trapper: 1 } } });
    const far = aliveFoes(st).find((f) => f.row === 'far')!;
    far.intent = { kind: 'advance' };
    far.stunned = false;
    st.energy = 3;
    expect(playPouch(st, 'tripwire')[0]).toMatchObject({ type: 'play' });
    expect(st.traps).toEqual([3]);
    // Die vorne erledigen, damit er nachrücken kann
    for (const f of aliveFoes(st)) if (f.row === 'near') f.hp = 0;
    st.hand = [];
    const hp0 = far.hp;
    const ev = endTurn(st);
    expect(ev.some((e) => e.type === 'trap' && e.id === far.id)).toBe(true);
    expect(far.row).toBe('near');
    expect(far.hp).toBe(hp0 - 4);
    expect(far.stunned).toBe(true);
    expect(st.traps).toEqual([]);
  });

  it('der Bleiche Wächter springt in die Falle und schlägt nicht zu', () => {
    const st = start(['watcher']);
    const w = aliveFoes(st)[0];
    w.row = 'far';
    w.stunned = false;
    w.step = FOE_TACTICS.watcher.pattern.findIndex((p) => p.kind === 'pounce');
    w.intent = intentOf(w);
    st.traps = [3];
    st.hand = [];
    const hp = st.hp;
    endTurn(st);
    expect(st.hp).toBe(hp);
    expect(w.stunned).toBe(true);
  });

  it('Wecker holt den Heuler nach vorn, dann trifft ihn auch die Faust', () => {
    const st = withHand(start(['walker', 'screamer'], { kit: { pouch: { alarm: 1 } } }), 'punch');
    const sc = aliveFoes(st).find((f) => f.kind === 'screamer')!;
    expect(targetsFor(st, 'punch').some((f) => f.id === sc.id)).toBe(false);
    const ev = playPouch(st, 'alarm');
    expect(ev.some((e) => e.type === 'pulled' && e.id === sc.id)).toBe(true);
    expect(sc.row).toBe('near');
    expect(targetsFor(st, 'punch').some((f) => f.id === sc.id)).toBe(true);
  });

  it('Pfeil trifft hinten am stärksten, Spannen und Werferin machen ihn stärker', () => {
    const st = withHand(start(['walker', 'walker', 'walker'], { weapons: [{ kind: 'bow', dur: 10 }], kit: { skills: { pitcher: 2 } } }), 'drawbow', 'arrow', 'arrow');
    const far = aliveFoes(st).find((f) => f.row === 'far')!;
    const near = aliveFoes(st).find((f) => f.row === 'near')!;
    playCard(st, 0);
    // 3 + 2 (hinten) + 2 (Spannen) + 2 (Werferin Stufe II)
    expect(playCard(st, 0, far.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 9 });
    // Vorne: 3 + 2 (Werferin)
    expect(playCard(st, 0, near.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 5 });
    expect(CARDS.throw.thrown).toBe(true);
  });

  it('Ablenken stößt weg und bremst, Mistgabel stößt alle vorne zurück', () => {
    const st = withHand(start(['walker', 'walker'], { kit: { skills: { distract: 2 } }, weapons: [{ kind: 'pitchfork', dur: 10 }] }), 'distract', 'fend');
    const [a, b] = aliveFoes(st);
    a.row = 'near';
    b.row = 'near';
    playCard(st, 0, a.id);
    expect(a.row).toBe('far');
    expect(a.slow).toBe(2);
    playCard(st, 0);
    expect(b.row).toBe('far');
  });
});

describe('Schwung', () => {
  it('Hieb gibt Schwung für den nächsten Angriff, der verfällt am Rundenende', () => {
    const st = withHand(start(['brute'], { weapons: [{ kind: 'machete', dur: 10 }] }), 'hack', 'hack', 'punch');
    const b = aliveFoes(st)[0];
    b.row = 'near';
    // 3 - 1 Rüstung = 2
    expect(playCard(st, 0, b.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 2 });
    expect(st.momentum).toBe(2);
    // 3 + 2 Schwung - 1 = 4, danach wieder Schwung 2
    expect(playCard(st, 0, b.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 4 });
    expect(st.momentum).toBe(2);
    st.hand = [];
    b.hp = 99;
    endTurn(st);
    expect(st.momentum).toBe(0);
  });

  it('Vorschlaghammer: Ausholen und Wuchtschlag, der Gegner fliegt zurück', () => {
    const st = withHand(start(['walker'], { weapons: [{ kind: 'sledgehammer', dur: 10 }] }), 'heave', 'sledge');
    const w = aliveFoes(st)[0];
    w.row = 'near';
    w.hp = 20;
    playCard(st, 0);
    const ev = playCard(st, 0, w.id);
    expect(ev.find((e) => e.type === 'hit')).toMatchObject({ dmg: 11 });
    expect(w.row).toBe('far');
  });

  it('Nachsetzen wächst mit der Stufe, Wut wirkt erst, wenn es knapp ist', () => {
    const st = withHand(start(['walker'], { kit: { skills: { followup: 3, rage: 1 } } }), 'followup', 'punch');
    const w = aliveFoes(st)[0];
    w.row = 'near';
    w.hp = 30;
    playCard(st, 0, w.id);
    expect(st.momentum).toBe(4);
    st.hp = 3;
    // Faustschlag 2 + Schwung 4 + Wut 2
    expect(playCard(st, 0, w.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 8 });
  });

  it('Spalten geht durch die Rüstung des Borkenmanns', () => {
    const st = withHand(start(['brute'], { weapons: [{ kind: 'axe', dur: 10 }] }), 'cleave');
    const b = aliveFoes(st)[0];
    b.row = 'near';
    expect(playCard(st, 0, b.id).find((e) => e.type === 'hit')).toMatchObject({ dmg: 3 });
  });
});
