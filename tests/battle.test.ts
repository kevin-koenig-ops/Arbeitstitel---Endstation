import { describe, expect, it } from 'vitest';
import { alive, createBattle, foeById, healthAfter, stepBattle, windupLeft, type BattleInput, type BattleState } from '../src/core/battle';
import { BATTLE } from '../src/core/content';
import { applyAction, createPlayer } from '../src/core/rules';
import type { Character, Spot } from '../src/core/types';

const DT = 1 / 30;

/** Ein Kampf mit einer einfachen Strategie: weicht perfekt aus, nutzt Wuchtschlag, Kreischer zuerst. */
function play(b: BattleState, smart: boolean, maxT = 240): { log: string[]; inputs: [number, BattleInput][] } {
  const log: string[] = [];
  const inputs: [number, BattleInput][] = [];
  while (!b.over && b.t < maxT) {
    const inp: BattleInput[] = [];
    if (smart) {
      const scream = alive(b).find((f) => f.kind === 'screamer');
      if (scream && b.target !== scream.id) inp.push({ type: 'target', id: scream.id });
      const danger = alive(b).some((f) => windupLeft(f) <= BATTLE.perfectWindow - 0.05);
      if (danger && b.cds.dodge <= 0) inp.push({ type: 'ability', ability: 'dodge' });
      else if (b.cds.power <= 0) inp.push({ type: 'ability', ability: 'power' });
      if (b.hp < 40 && b.cds.bandage <= 0 && b.medicine > 0) inp.push({ type: 'ability', ability: 'bandage' });
    }
    for (const i of inp) inputs.push([b.t, i]);
    for (const e of stepBattle(b, DT, inp)) log.push(e.type);
  }
  return { log, inputs };
}

const setup = (guard: 'walker' | 'crawler' | 'brute', seed = 'kampf-1') => ({ seed, guard, weapon: 'crowbar' as const, health: 10, maxHealth: 10, medicine: 2 });

describe('Kampf 2.0', () => {
  it('ist bei gleichen Eingaben immer gleich (nachrechenbar)', () => {
    const a = createBattle(setup('walker'));
    const { inputs } = play(a, true);
    const b = createBattle(setup('walker'));
    // Dieselben Eingaben zur selben Kampfzeit nachspielen
    let k = 0;
    while (!b.over && b.t < 240) {
      const inp: BattleInput[] = [];
      while (k < inputs.length && Math.abs(inputs[k][0] - b.t) < 1e-9) inp.push(inputs[k++][1]);
      stepBattle(b, DT, inp);
    }
    expect(b.over).toBe(a.over);
    expect(b.hp).toBe(a.hp);
    expect(b.kills).toBe(a.kills);
  });

  it('wer gut spielt, gewinnt meistens, auch gegen den Brocken', () => {
    let wins = 0;
    for (let i = 0; i < 12; i++) {
      const b = createBattle(setup(i % 3 === 0 ? 'brute' : i % 3 === 1 ? 'crawler' : 'walker', 'gut-' + i));
      play(b, true);
      if (b.over === 'won') wins++;
      expect(b.t).toBeLessThan(120);
    }
    expect(wins).toBeGreaterThanOrEqual(10);
  });

  it('wer nur draufhaut, verliert gegen Gruppen öfter', () => {
    let lost = 0;
    for (let i = 0; i < 12; i++) {
      const b = createBattle(setup('brute', 'passiv-' + i));
      play(b, false);
      if (b.over === 'lost') lost++;
    }
    expect(lost).toBeGreaterThanOrEqual(3);
  });

  it('perfektes Ausweichen gibt einen Konter, Kreischer rufen Verstärkung', () => {
    // Einen Kampf mit Kreischer finden
    let b: BattleState | null = null;
    for (let i = 0; i < 40 && !b; i++) {
      const c = createBattle(setup('walker', 'kreischer-' + i));
      if (c.foes.some((f) => f.kind === 'screamer')) b = c;
    }
    expect(b).not.toBeNull();
    const battle = b!;
    const before = battle.foes.length;
    let sawCounter = false;
    while (!battle.over && battle.t < 60) {
      const danger = alive(battle).some((f) => windupLeft(f) <= 0.3 && f.kind !== 'screamer');
      const ev = stepBattle(battle, DT, danger && battle.cds.dodge <= 0 ? [{ type: 'ability', ability: 'dodge' }] : []);
      if (ev.some((e) => e.type === 'hit' && e.counter)) sawCounter = true;
    }
    expect(battle.foes.length).toBeGreaterThan(before);
    expect(sawCounter).toBe(true);
  });

  it('Fliehen beendet den Kampf sofort', () => {
    const b = createBattle(setup('walker'));
    stepBattle(b, DT);
    const ev = stepBattle(b, DT, [{ type: 'flee' }]);
    expect(ev).toContainEqual({ type: 'over', outcome: 'fled' });
    expect(healthAfter(b)).toBe(10);
    expect(foeById(b, 1)).toBeDefined();
  });
});

describe('Kampfergebnis in den Regeln', () => {
  const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
  const T0 = Date.UTC(2026, 9, 20, 12);
  const spot: Spot = { id: 'p:test', kind: 'market', source: 'poi', pos: { lat: 51.3, lon: 9.5 }, name: 'Markt' };
  const fighting = () => {
    const s = createPlayer('p', hero, T0);
    s.inventory.medicine = 2;
    s.combat = { spot, enemy: 'walker', enemyHp: 4, round: 0, opening: false, window: 1 };
    return s;
  };

  it('Sieg: Beute, Gesundheit, Abnutzung', () => {
    const r = applyAction(fighting(), { type: 'battleResult', outcome: 'won', health: 6, kills: 3, usedMedicine: 1 }, { now: T0, worldSeed: 'w' });
    expect(r.events[0]).toMatchObject({ type: 'combatWon', kills: 3 });
    expect(r.events.some((e) => e.type === 'loot')).toBe(true);
    expect(r.state.health).toBe(6);
    expect(r.state.inventory.medicine).toBe(1);
    expect(r.state.weapons[0].dur).toBe(13);
    expect(r.state.combat).toBeNull();
  });

  it('mehr Gesundheit als möglich wird gekappt, Niederlage kostet nur etwas', () => {
    const r = applyAction(fighting(), { type: 'battleResult', outcome: 'won', health: 99, kills: 1, usedMedicine: 0 }, { now: T0, worldSeed: 'w' });
    expect(r.state.health).toBe(10);
    const l = applyAction(fighting(), { type: 'battleResult', outcome: 'lost', health: 0, kills: 0, usedMedicine: 0 }, { now: T0, worldSeed: 'w' });
    expect(l.events[0].type).toBe('combatLost');
    expect(l.state.health).toBe(0);
  });
});
