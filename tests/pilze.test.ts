import { describe, expect, it } from 'vitest';
import { guardOf } from '../src/core/rules';
import { gridSpotsAround, resolveGridSpot } from '../src/core/world';

// Pilzstellen: wandern wie die anderen Fundstellen, liegen nur im Wald, im Herbst am meisten.
describe('Pilzstellen', () => {
  const seed = 'pilz-test';
  const center = { lat: 51.6, lon: 10.2 };
  const mushrooms = (iso: string) => gridSpotsAround(seed, center, 1500, Date.parse(iso)).filter((s) => s.kind === 'mushrooms');

  it('gibt es im Herbst viel öfter als im Winter', () => {
    const oct = mushrooms('2026-10-15T12:00:00Z').length;
    const jan = mushrooms('2026-01-15T12:00:00Z').length;
    expect(oct).toBeGreaterThan(jan * 4);
    expect(jan).toBeGreaterThan(0);
  });

  it('sind als Wald-Fundstellen markiert und echt prüfbar', () => {
    const list = mushrooms('2026-10-15T12:00:00Z');
    expect(list.length).toBeGreaterThan(10);
    for (const s of list) {
      expect(s.biome).toBe('forest');
      expect(resolveGridSpot(seed, s.id)).toEqual(s);
    }
  });

  it('werden nie bewacht', () => {
    const now = Date.parse('2026-10-15T23:00:00Z');
    for (const s of mushrooms('2026-10-15T23:00:00Z')) expect(guardOf(seed, s, now)).toBeNull();
  });
});
