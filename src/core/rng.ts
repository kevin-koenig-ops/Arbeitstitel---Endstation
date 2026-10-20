// Deterministischer Zufall: gleiche Eingabe -> gleiches Ergebnis, auf jedem Gerät.
// Dadurch sehen später alle Spieler dieselben Fundstellen, ohne dass ein Server
// jede einzelne speichern muss.

/** cyrb53: schneller 53-bit-String-Hash. */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export type Rng = () => number;

/** mulberry32, geseedet aus beliebigen Teilen. Liefert Zahlen in [0, 1). */
export function rngFrom(...parts: (string | number)[]): Rng {
  let a = hashString(parts.join('|')) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(r: Rng, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1));
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}

export function pickWeighted<T>(r: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [item, w] of items) {
    x -= w;
    if (x < 0) return item;
  }
  return items[items.length - 1][0];
}
