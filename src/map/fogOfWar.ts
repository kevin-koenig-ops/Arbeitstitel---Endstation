// Kartennebel: Unbekanntes Gebiet liegt unter Nebel. Aufgedeckte Zellen und der
// aktuelle Sichtkreis um die Spielfigur sind frei.
//
// Gezeichnet auf ein eigenes Canvas, das zwischen Karte und Markern liegt:
// Fundstellen leuchten also auch durch den Nebel und locken hinein.

import type { Map as MLMap } from 'maplibre-gl';
import { CELL_Z, ExploredView, type Explored } from '../core/explore';
import { fromTile, offsetM, toTile } from '../core/geo';
import { rngFrom } from '../core/rng';
import type { LatLon } from '../core/types';

/** Was du gerade siehst, ist immer frei. */
const SIGHT_RADIUS_M = 100;
/** Unterhalb dieser Zoomstufe (ganzes Land) gibt es keinen Nebel mehr. */
const MIN_ZOOM = 8;
/** Größe einer Kachel der Nebeltextur in Weltpixeln bei Zoom 16 (sie wandert mit der Karte mit). */
const TEX_WORLD = 640;
/** Kleinere Zellen als das (Bildpunkte) werden beim Herauszoomen zu Blöcken zusammengefasst. */
const MIN_CELL_PX = 4;

export class FogOfWar {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private brush: HTMLCanvasElement;
  private texture: CanvasPattern | null = null;
  private view = new ExploredView({});
  private player: LatLon | null = null;
  private raf = 0;
  private enabled = true;

  constructor(private map: MLMap) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fow';
    const container = map.getCanvasContainer();
    container.insertBefore(this.canvas, map.getCanvas().nextSibling);
    this.ctx = this.canvas.getContext('2d')!;
    this.brush = makeBrush();
    this.texture = makeTexture(this.ctx);
    const schedule = () => this.schedule();
    map.on('move', schedule);
    map.on('resize', schedule);
    this.schedule();
  }

  setExplored(data: Explored) {
    this.view = new ExploredView(data);
    this.schedule();
  }

  setPlayer(p: LatLon) {
    this.player = p;
    this.schedule();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.canvas.hidden = !on;
    this.schedule();
  }

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw() {
    const { map, ctx, canvas } = this;
    const w = map.getCanvas().clientWidth;
    const h = map.getCanvas().clientHeight;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.enabled || map.getZoom() < MIN_ZOOM) return;

    // Nebel über alles: gemalte Wolkentextur, die mit der Karte mitwandert (nicht am Bildschirm klebt)
    ctx.globalCompositeOperation = 'source-over';
    const zoom = map.getZoom();
    if (this.texture) {
      const center = map.getCenter();
      const scale = Math.min(2.5, Math.max(0.45, 2 ** (zoom - 16)));
      const tile = TEX_WORLD * scale;
      const world = 512 * 2 ** zoom;
      const wx = ((center.lng + 180) / 360) * world;
      const s = Math.sin((center.lat * Math.PI) / 180);
      const wy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
      const ox = w / 2 - (((wx % tile) + tile) % tile);
      const oy = h / 2 - (((wy % tile) + tile) % tile);
      this.texture.setTransform(new DOMMatrix().translate(ox, oy).scale(tile / TEX_SIZE));
      ctx.fillStyle = this.texture;
    } else ctx.fillStyle = 'rgba(214, 210, 198, 0.9)';
    ctx.fillRect(0, 0, w, h);

    // Aufgedeckte Zellen und Sichtkreis weich ausstanzen
    ctx.globalCompositeOperation = 'destination-out';
    const b = map.getBounds();
    const pad = 0.002;
    const t0 = toTile({ lat: b.getNorth() + pad, lon: b.getWest() - pad }, CELL_Z);
    const t1 = toTile({ lat: b.getSouth() - pad, lon: b.getEast() + pad }, CELL_Z);
    const x0 = Math.floor(t0.x);
    const x1 = Math.ceil(t1.x);
    const y0 = Math.floor(t0.y);
    const y1 = Math.ceil(t1.y);
    // Wie groß ist eine Zelle gerade auf dem Bildschirm? Weit draußen werden Zellen zu Blöcken zusammengefasst.
    const cellPx = 2 ** (zoom - CELL_Z) * 512;
    const group = cellPx >= MIN_CELL_PX ? 1 : 2 ** Math.ceil(Math.log2(MIN_CELL_PX / cellPx));
    if (group === 1 && (x1 - x0) * (y1 - y0) <= 40000) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!this.view.has(x, y)) continue;
          const c = fromTile(x + 0.5, y + 0.5, CELL_Z);
          const e = fromTile(x + 1.5, y + 0.5, CELL_Z);
          const n = fromTile(x + 0.5, y - 0.5, CELL_Z);
          this.stamp(c, e, n, 1.7);
        }
      }
    } else {
      // Nur die Blöcke durchgehen, in denen es überhaupt Aufgedecktes gibt
      const blocks = this.view.cellsIn(x0, y0, x1, y1, Math.max(1, group));
      const g = Math.max(1, group);
      for (const [bx, by] of blocks) {
        const c = fromTile(bx + g / 2, by + g / 2, CELL_Z);
        const e = fromTile(bx + g * 1.5, by + g / 2, CELL_Z);
        const n = fromTile(bx + g / 2, by - g / 2, CELL_Z);
        this.stamp(c, e, n, 1.5);
      }
    }
    if (this.player) {
      const r = SIGHT_RADIUS_M;
      this.stamp(this.player, offsetM(this.player, r, 0), offsetM(this.player, 0, r), 1.25);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Weichen Pinsel an eine Kartenposition setzen; Ellipse folgt der Kameraneigung. */
  private stamp(c: LatLon, east: LatLon, north: LatLon, scale: number) {
    const pc = this.map.project([c.lon, c.lat]);
    const pe = this.map.project([east.lon, east.lat]);
    const pn = this.map.project([north.lon, north.lat]);
    const rx = Math.hypot(pe.x - pc.x, pe.y - pc.y) * scale;
    const ry = Math.hypot(pn.x - pc.x, pn.y - pc.y) * scale;
    if (pc.x < -rx || pc.y < -ry || pc.x > this.canvas.width + rx || pc.y > this.canvas.height + ry) return;
    this.ctx.drawImage(this.brush, pc.x - rx, pc.y - ry, rx * 2, ry * 2);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }
}

function makeBrush(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.95)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Seitenlänge der Nebeltextur in Pixeln. */
const TEX_SIZE = 384;

/**
 * Gemalter Nebel: weiche Wolken aus mehreren Lagen Rauschen (nahtlos kachelbar), warmes Hellgrau
 * mit cremigen Lichtern und etwas dunkleren Schlieren. Dicht genug, dass man nur ahnt, was darunter
 * liegt (Fundstellen leuchten trotzdem durch).
 */
function makeTexture(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const S = TEX_SIZE;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = rngFrom('nebel-2');
  // Rauschen mit Gitter je Lage; Ränder wiederholen sich, damit die Kachel nahtlos ist
  const layers = [
    { n: 3, amp: 0.42 },
    { n: 6, amp: 0.28 },
    { n: 12, amp: 0.17 },
    { n: 24, amp: 0.09 },
    { n: 48, amp: 0.04 },
  ].map((l) => ({ ...l, v: Float32Array.from({ length: l.n * l.n }, () => r()) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    let sum = 0;
    for (const l of layers) {
      const fx = (x / S) * l.n;
      const fy = (y / S) * l.n;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const at = (a: number, b: number) => l.v[((b % l.n) + l.n) % l.n * l.n + (((a % l.n) + l.n) % l.n)];
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
      const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      sum += (top + (bot - top) * ty) * l.amp;
    }
    return sum;
  };
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // Etwas verwirbelt, damit es nach Pinselstrichen statt nach Raster aussieht
      const wx = x + (noise(x + 97, y + 31) - 0.5) * 60;
      const wy = y + (noise(x + 11, y + 203) - 0.5) * 60;
      const n = Math.min(1, Math.max(0, (noise(wx, wy) - 0.5) * 1.6 + 0.5));
      const i = (y * S + x) * 4;
      // Schatten: warmes Grau, Lichter: Creme
      d[i] = 168 + n * 72;
      d[i + 1] = 164 + n * 70;
      d[i + 2] = 152 + n * 68;
      d[i + 3] = Math.round(255 * (0.84 + n * 0.12));
    }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}
