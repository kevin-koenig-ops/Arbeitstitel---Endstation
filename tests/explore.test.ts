import { describe, expect, it } from 'vitest';
import { decodeBits, encodeBits } from '../src/core/bits';
import { ExploredView, exploredStats, revealAround, sectorOf } from '../src/core/explore';
import { offsetM } from '../src/core/geo';
import { applyAction, createPlayer, guardOf } from '../src/core/rules';
import { dayPhase, sunElevation } from '../src/core/sun';
import type { Character } from '../src/core/types';
import { gridSpotsAround } from '../src/core/world';

const HOME = { lat: 51.6, lon: 10.2 };
const SEED = 'test-seed';
const hero: Character = { name: 'Kim', look: { hair: 0, color: 0, skin: 0 }, background: 'workshop' };

describe('Sonnenstand', () => {
  it('kennt Mittag, Abend und Nacht', () => {
    expect(sunElevation(HOME, Date.UTC(2026, 5, 21, 11, 10))).toBeGreaterThan(55); // Sommermittag
    expect(dayPhase(HOME, Date.UTC(2026, 5, 21, 11))).toBe('day');
    expect(dayPhase(HOME, Date.UTC(2026, 9, 20, 16, 15))).toBe('dusk'); // Oktober, kurz vor Sonnenuntergang
    expect(dayPhase(HOME, Date.UTC(2026, 9, 20, 22))).toBe('night');
  });
});

describe('Bitfelder', () => {
  it('speichern und laden verlustfrei', () => {
    const b = new Uint8Array(512).map((_, i) => (i * 37) % 256);
    expect(decodeBits(encodeBits(b), 512)).toEqual(b);
  });
});

describe('Erkundung', () => {
  it('deckt den Umkreis auf und zählt nichts doppelt', () => {
    const a = revealAround({}, HOME);
    expect(a.added).toBeGreaterThan(3);
    const again = revealAround(a.explored, HOME);
    expect(again.added).toBe(0);
    const moved = revealAround(a.explored, offsetM(HOME, 120, 0));
    expect(moved.added).toBeGreaterThan(3);
    expect(exploredStats(moved.explored).km2).toBeGreaterThan(0.01);
  });

  it('belohnt Sektoren bei 25 % und 50 % genau einmal', () => {
    let st = createPlayer('p', hero, Date.UTC(2026, 9, 20, 12));
    const { key, sx, sy } = sectorOf(HOME);
    const rewards: number[] = [];
    // Den Sektor in Bahnen ablaufen
    for (let dy = -400; dy <= 400; dy += 60)
      for (let dx = -400; dx <= 400; dx += 40) {
        const at = offsetM(HOME, dx, dy);
        if (sectorOf(at).key !== key) continue;
        const r = applyAction(st, { type: 'explore', at, accuracyM: 8 }, { now: Date.UTC(2026, 9, 20, 12), worldSeed: SEED });
        st = r.state;
        for (const e of r.events) if (e.type === 'sector' && e.key === key) rewards.push(e.level);
      }
    expect(new ExploredView(st.explored).sectorProgress(sx, sy)).toBeGreaterThan(0.5);
    expect(rewards).toEqual([1, 2]);
    expect(st.sectors[key]).toBe(2);
    expect(st.inventory.medicine).toBe(1);
  });

  it('ignoriert ungenaue GPS-Positionen', () => {
    const st = createPlayer('p', hero, 0);
    expect(applyAction(st, { type: 'explore', at: HOME, accuracyM: 200 }, { now: 0, worldSeed: SEED }).events).toEqual([]);
  });
});

describe('Nacht', () => {
  it('mehr Wächter nachts', () => {
    const spots = gridSpotsAround(SEED, HOME, 2500, Date.UTC(2026, 9, 20, 12));
    const day = Date.UTC(2026, 9, 20, 11);
    const night = Date.UTC(2026, 9, 20, 23);
    const count = (t: number) => spots.filter((s) => guardOf(SEED, s, t)).length;
    expect(count(night)).toBeGreaterThan(count(day) * 1.2);
  });
});
