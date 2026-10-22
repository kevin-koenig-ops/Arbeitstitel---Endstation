import { describe, expect, it } from 'vitest';
import { GEAR, GEAR_ORDER, gearArmor, START_GEAR } from '../src/core/content';
import { applyAction, createPlayer, SCHEMA_VERSION } from '../src/core/rules';
import { migrate } from '../src/core/save';
import type { RuleContext } from '../src/core/types';

// Ausrüstung am Körper: Startausrüstung, an- und ablegen, Umzug alter Spielstände.
describe('Ausrüstung', () => {
  const ctx: RuleContext = { now: Date.parse('2026-10-22T10:00:00Z'), worldSeed: 'gear-test' };
  const fresh = () => createPlayer('p1', { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' }, ctx.now);

  it('fängt mit Startausrüstung an, angezogen', () => {
    const s = fresh();
    for (const id of START_GEAR) {
      expect(s.gear.owned[id]).toBeDefined();
      expect(s.gear.worn[GEAR[id].slot]).toBe(id);
    }
  });

  it('legt nur Gefundenes an und tauscht am selben Platz', () => {
    const s = fresh();
    const denied = applyAction(s, { type: 'equip', gear: 'hardHat' }, ctx);
    expect(denied.events[0]).toEqual({ type: 'rejected', reason: 'no_gear' });
    s.gear.owned.hardHat = ctx.now;
    const ok = applyAction(s, { type: 'equip', gear: 'hardHat' }, ctx);
    expect(ok.state.gear.worn.head).toBe('hardHat');
    expect(gearArmor(ok.state.gear.worn)).toBe(2);
    const off = applyAction(ok.state, { type: 'unequip', slot: 'head' }, ctx);
    expect(off.state.gear.worn.head).toBeUndefined();
  });

  it('jedes Teil hat einen gültigen Platz und Fundorte (außer dem Start-Rucksack)', () => {
    for (const id of GEAR_ORDER) {
      expect(GEAR[id].name.length).toBeGreaterThan(2);
      if (id !== 'oldBackpack') expect(GEAR[id].findAt.length).toBeGreaterThan(0);
    }
  });

  it('alte Spielstände bekommen die Startausrüstung', () => {
    const s = fresh() as unknown as Record<string, unknown>;
    delete s.gear;
    s.schema = 12;
    const m = migrate(s)!;
    expect(m.schema).toBe(SCHEMA_VERSION);
    expect(m.gear.worn.body).toBe('rainJacket');
  });
});
