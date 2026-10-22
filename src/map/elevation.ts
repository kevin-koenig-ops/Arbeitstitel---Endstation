// Höhen aus denselben Höhenkacheln, mit denen die Karte Hügel schattiert (Terrarium-Format:
// Höhe = R·256 + G + B/256 − 32768). Für die Art der Gegend (Berge?) und die Aussicht von oben.
// Nur mit der echten Karte; im Demo-Dorf ist alles flach.

import { offsetM, toTile } from '../core/geo';
import type { LatLon } from '../core/types';

const Z = 12;
const URL = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const tiles = new Map<string, Promise<Uint8ClampedArray | null>>();

function loadTile(x: number, y: number, z = Z): Promise<Uint8ClampedArray | null> {
  const key = `${z}/${x}/${y}`;
  let p = tiles.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(URL(z, x, y));
        if (!res.ok) throw new Error(String(res.status));
        const bmp = await createImageBitmap(await res.blob());
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      } catch {
        // Fehlgeschlagen (z. B. offline): in einer Minute nochmal versuchen
        setTimeout(() => tiles.delete(key), 60_000);
        return null;
      }
    })();
    tiles.set(key, p);
    // Nicht endlos sammeln
    if (tiles.size > 40) tiles.delete(tiles.keys().next().value as string);
  }
  return p;
}

/** Höhe in Metern an einem Punkt (oder null, wenn die Kachel fehlt). zoom 14 ist genauer (für die Anzeige). */
export async function elevationAt(p: LatLon, zoom = Z): Promise<number | null> {
  const t = toTile(p, zoom);
  const tx = Math.floor(t.x);
  const ty = Math.floor(t.y);
  const data = await loadTile(tx, ty, zoom);
  if (!data) return null;
  const px = Math.min(255, Math.max(0, Math.floor((t.x - tx) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((t.y - ty) * 256)));
  const i = (py * 256 + px) * 4;
  return data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
}

export interface Relief {
  /** Höhe hier. */
  here: number;
  /** Höhenunterschied im Umkreis. */
  relief: number;
  /** So viele Meter liegt der Punkt über der mittleren Höhe drumherum. */
  above: number;
}

/** Höhen rund um einen Punkt: Stichproben auf zwei Ringen. */
export async function reliefAround(c: LatLon, radiusM: number): Promise<Relief | null> {
  const pts: LatLon[] = [c];
  for (const r of [radiusM * 0.5, radiusM])
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      pts.push(offsetM(c, Math.sin(a) * r, Math.cos(a) * r));
    }
  const hs = (await Promise.all(pts.map(elevationAt))).filter((v): v is number => v !== null);
  if (hs.length < 6) return null;
  const here = (await elevationAt(c)) ?? hs[0];
  const sorted = [...hs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { here, relief: sorted[sorted.length - 1] - sorted[0], above: here - median };
}
