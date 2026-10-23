// Schusswaffen (Kevin 23.10.): eigene Munition je Waffe, nur zu finden; laute Schüsse locken Trupps an.
import { describe, expect, it } from 'vitest';
import { NOISE, WEAPON_CARDS, WEAPONS, emptyInventory } from '../src/core/content';
import { patrolsAround } from '../src/core/patrols';
import { applyAction, battleWeapons, createPlayer, SCHEMA_VERSION } from '../src/core/rules';
import { migrate } from '../src/core/save';
import { createTactics, playCard, playable, type TacticsState } from '../src/core/tactics';
import type { AmmoId, Character, PlayerState, Weapon, WeaponId } from '../src/core/types';

const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };
const T0 = Date.UTC(2026, 9, 20, 12);
const AT = { lat: 51.6, lon: 10.2 };
const gun = (kind: WeaponId): Weapon => ({ kind, dur: WEAPONS[kind].dur });
const fight = (kind: WeaponId, ammo: Partial<Record<AmmoId, number>>) =>
  createTactics({ seed: 'schuss-1', group: ['walker', 'walker'], weapons: [gun('crowbar'), gun(kind)], medicine: 0, ammo, health: 10, maxHealth: 10 });
const withHand = (st: TacticsState, ...cards: TacticsState['hand']) => {
  st.hand = [...cards];
  st.energy = 3;
  return st;
};

describe('Schusswaffen im Kampf', () => {
  it('jede Schusswaffe hat eigene Munition und eigene Karten', () => {
    const ammo = new Set((['airrifle', 'pistol', 'revolver', 'shotgun', 'huntingrifle'] as WeaponId[]).map((w) => WEAPONS[w].ammo));
    expect(ammo.size).toBe(5);
    expect(WEAPON_CARDS.pistol).toEqual(['shot', 'shot', 'doubletap']);
    expect(WEAPONS.airrifle.loud).toBeFalsy();
    expect(WEAPONS.huntingrifle.rarity).toBe('legendary');
  });

  it('ein Schuss verschießt Munition und zählt als laut', () => {
    const st = withHand(fight('pistol', { pistol: 3 }), 'shot');
    const target = st.foes[0].id;
    const hp = st.foes[0].hp;
    const ev = playCard(st, 0, target);
    expect(ev).toContainEqual({ type: 'fired', weapon: 'pistol', left: 2, loud: true });
    expect(st.foes[0].hp).toBe(Math.max(0, hp - 5));
    expect(st.ammo.pistol).toBe(2);
    expect(st.usedAmmo.pistol).toBe(1);
    expect(st.shots).toBe(1);
  });

  it('reicht die Munition nicht, geht der Schuss nicht; ist sie alle, wird es ein Kolbenschlag', () => {
    const st = withHand(fight('pistol', { pistol: 1 }), 'doubletap', 'shot');
    expect(playable(st, 'doubletap')).toBe(false);
    expect(playCard(st, 0, st.foes[0].id)[0]).toEqual({ type: 'denied', reason: 'ammo' });
    const ev = playCard(st, 1, st.foes[0].id);
    expect(ev).toContainEqual({ type: 'outOfAmmo', weapon: 'pistol' });
    // Die übrigen Schüsse in Hand, Stapel und Ablage sind jetzt Kolbenschläge
    expect([...st.hand, ...st.draw, ...st.discard].filter((c) => c === 'shot' || c === 'doubletap')).toHaveLength(0);
    expect([...st.hand, ...st.draw, ...st.discard]).toContain('buttstroke');
  });

  it('ohne Munition gibt es von Anfang an nur Kolbenschläge; Anlegen bleibt', () => {
    const st = fight('huntingrifle', {});
    const all = [...st.hand, ...st.draw];
    expect(all).not.toContain('rifleshot');
    expect(all.filter((c) => c === 'buttstroke')).toHaveLength(2);
    expect(all).toContain('scope');
  });

  it('das Luftgewehr ist leise, die Schrotflinte trifft alle vorne', () => {
    const air = withHand(fight('airrifle', { pellets: 5 }), 'airshot');
    playCard(air, 0, air.foes[0].id);
    expect(air.shots).toBe(0);
    const sg = withHand(fight('shotgun', { shells: 2 }), 'buck');
    const before = sg.foes.map((f) => f.hp);
    playCard(sg, 0);
    sg.foes.forEach((f, i) => expect(f.hp).toBeLessThan(before[i]));
  });
});

describe('Munition und Lärm im Spiel', () => {
  function inFight(): PlayerState {
    let s = createPlayer('p', hero, T0);
    s = { ...s, inventory: { ...emptyInventory(), food: 5, water: 5 }, ammo: { pistol: 5 } };
    return applyAction(s, { type: 'testFight', at: AT, group: ['walker'] }, { now: T0, worldSeed: 'w' }).state;
  }

  it('eine gefundene Schusswaffe hat ein paar Schuss drin', () => {
    const s = createPlayer('p', hero, T0);
    const r = applyAction(s, { type: 'testGift', weapon: 'shotgun' }, { now: T0, worldSeed: 'w' });
    expect(r.state.weapons.some((w) => w.kind === 'shotgun')).toBe(true);
    expect(r.state.ammo.shells).toBe(WEAPONS.shotgun.loaded);
  });

  it('verschossene Munition ist weg, laute Schüsse locken Trupps zum Kampfort', () => {
    const s = inFight();
    expect(s.combat).toBeTruthy();
    const r = applyAction(s, { type: 'battleResult', outcome: 'won', health: 10, kills: 1, usedMedicine: 0, usedAmmo: { pistol: 2 }, shots: 2 }, { now: T0 + 60_000, worldSeed: 'w' });
    expect(r.state.ammo.pistol).toBe(3);
    expect(r.state.noise).toHaveLength(1);
    const n = r.state.noise[0];
    expect(n.until - n.from).toBe(NOISE.minutes * 60_000);
    // Ein paar Minuten später: ein Trupp ist unterwegs zum Kampfort
    const t = T0 + 5 * 60_000;
    const plans = patrolsAround('w', AT, 600, t, 'village', false, [], false, r.state.noise).filter((p) => p.id.startsWith('t:n:'));
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].target).toEqual(n.at);
    // Mit ihm kämpfen geht (die Regeln rechnen ihn aus dem gemerkten Lärm nach)
    const near = { lat: plans[0].anchor.lat, lon: plans[0].anchor.lon };
    const f = applyAction(r.state, { type: 'patrolFight', patrol: plans[0].id, at: near, accuracyM: 5, opening: 'spotted', region: 'village' }, { now: t + 10 * 60_000, worldSeed: 'w' });
    expect(f.events.some((e) => e.type === 'patrol')).toBe(true);
    // Nach der Zeit ist es vorbei
    expect(patrolsAround('w', AT, 600, n.until + 1, 'village', false, [], false, r.state.noise).filter((p) => p.id.startsWith('t:n:'))).toHaveLength(0);
  });

  it('ohne Munition nimmt das Spiel lieber eine andere Fernwaffe mit', () => {
    const s = { ...createPlayer('p', hero, T0), weapons: [gun('crowbar'), gun('golfclub'), gun('pistol')] };
    expect(battleWeapons({ ...s, ammo: { pistol: 2 } }).map((w) => w.kind)).toContain('pistol');
    expect(battleWeapons({ ...s, ammo: {} }).map((w) => w.kind)).toContain('golfclub');
    // Gar keine andere Fernwaffe: dann eben die leere Pistole (Kolbenschlag)
    expect(battleWeapons({ ...s, weapons: [gun('pistol')], ammo: {} }).map((w) => w.kind)).toEqual(['pistol']);
  });

  it('ohne laute Schüsse kein Lärm', () => {
    const r = applyAction(inFight(), { type: 'battleResult', outcome: 'won', health: 10, kills: 1, usedMedicine: 0 }, { now: T0 + 60_000, worldSeed: 'w' });
    expect(r.state.noise).toHaveLength(0);
  });

  it('alte Spielstände bekommen Munition und Lärm (Version 21)', () => {
    const old = { ...createPlayer('p', hero, T0), schema: 20 } as Record<string, unknown>;
    delete old.ammo;
    delete old.noise;
    const m = migrate(old)!;
    expect(m.schema).toBe(SCHEMA_VERSION);
    expect(m.ammo).toEqual({});
    expect(m.noise).toEqual([]);
  });
});
