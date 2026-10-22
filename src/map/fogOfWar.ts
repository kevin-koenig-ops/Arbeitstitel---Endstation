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
const SIGHT_RADIUS_M = 140;
/** Unterhalb dieser Zoomstufe wird der Nebel ausgeblendet (zu viele Zellen). */
const MIN_ZOOM = 14.5;

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

    // Nebel über alles
    ctx.globalCompositeOperation = 'source-over';
    // Heller Nebel wie Wolken: Unbekanntes liegt im Dunst, nicht im Dunkeln. Dicht genug, dass
    // man nur ahnt, was darunter liegt (Fundstellen leuchten trotzdem durch).
    ctx.fillStyle = 'rgba(208, 208, 198, 0.88)';
    ctx.fillRect(0, 0, w, h);
    if (this.texture) {
      ctx.fillStyle = this.texture;
      ctx.fillRect(0, 0, w, h);
    }

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
    if ((x1 - x0) * (y1 - y0) <= 40000) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!this.view.has(x, y)) continue;
          const c = fromTile(x + 0.5, y + 0.5, CELL_Z);
          const e = fromTile(x + 1.5, y + 0.5, CELL_Z);
          const n = fromTile(x + 0.5, y - 0.5, CELL_Z);
          this.stamp(c, e, n, 1.7);
        }
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

/** Wolkige Nebeltextur aus weichen Flecken. */
function makeTexture(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rngFrom('nebel');
  for (let i = 0; i < 34; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 20 + r() * 60;
    const light = r() < 0.6;
    for (const dx of [-S, 0, S])
      for (const dy of [-S, 0, S]) {
        const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        grad.addColorStop(0, light ? 'rgba(250, 250, 244, 0.32)' : 'rgba(120, 124, 118, 0.18)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
  }
  return ctx.createPattern(c, 'repeat');
}
