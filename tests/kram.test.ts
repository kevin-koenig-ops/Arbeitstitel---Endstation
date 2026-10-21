import { describe, expect, it } from 'vitest';
import { KRAM, KRAM_ORDER, MATERIAL_ORDER, SPOT_KINDS, WEAPONS, WORKBENCH_LEVELS } from '../src/core/content';
import { FURNITURE } from '../src/core/furniture';
import type { Material, SpotKind } from '../src/core/types';

// Kram wie bei Fallout: viele Sorten, jedes Bauteil steckt irgendwo drin und wird irgendwo gebraucht.
describe('Kram und Bauteile', () => {
  it('gibt es in vielen Sorten, jede an mindestens einem Ort', () => {
    expect(KRAM_ORDER.length).toBeGreaterThanOrEqual(150);
    const found = new Set(Object.values(SPOT_KINDS).flatMap((d) => d.kram.map(([k]) => k)));
    for (const k of KRAM_ORDER) expect(found.has(k), k).toBe(true);
  });

  it('jedes Bauteil steckt in Kram', () => {
    for (const m of MATERIAL_ORDER) {
      if (m === 'stone') continue; // Stein kommt aus Schutt und Felsen
      expect(KRAM_ORDER.some((k) => (KRAM[k].parts[m] ?? 0) > 0), m).toBe(true);
    }
  });

  it('jedes neue Bauteil wird in einem Rezept gebraucht', () => {
    const costs = [...Object.values(FURNITURE).map((f) => f.cost), ...Object.values(WEAPONS).map((w) => w.cost), ...WORKBENCH_LEVELS.map((l) => l.cost)];
    const fresh: Material[] = ['rubber', 'leather', 'springs', 'gears', 'copper', 'oil', 'cells', 'antiseptic', 'phosphate'];
    for (const m of fresh) expect(costs.some((c) => (c as Partial<Record<Material, number>>)[m]), m).toBe(true);
  });

  it('jeder Ort hat eigenen Kram', () => {
    const kinds: SpotKind[] = ['car', 'shed', 'pharmacy', 'market', 'hardware'];
    const sets = kinds.map((k) => new Set(SPOT_KINDS[k].kram.map(([id]) => id)));
    // Apotheke und Baumarkt teilen sich höchstens wenig
    const shared = [...sets[2]].filter((k) => sets[4].has(k));
    expect(shared.length).toBeLessThanOrEqual(1);
  });
});
