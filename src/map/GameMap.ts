// Die Spielkarte: MapLibre mit Endzeit-Stil, Spielerfigur, Suchradius und Fundstellen.

import maplibregl from 'maplibre-gl';
import type { GeoJSONFeature, GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import { circleRing, distanceM } from '../core/geo';
import type { EnemyId, LatLon, Spot } from '../core/types';
import type { PoiCandidate } from '../core/world';
import { h, svgEl } from '../ui/dom';
import { icon, spotIcon } from '../ui/icons';
import { generateDecor, type DecorInput, type RawLine, type RawPolygon } from './decor';
import demoWorld from './demoWorld.json';
import { patternImage } from './patterns';
import { buildStyle, DECOR_MINZOOM, loadRealSource } from './style';

/** Umkreis der Detail-Ebene. Dahinter liegt ohnehin Nebel. */
const DECOR_RADIUS_M = 550;
const DRIVABLE = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'residential', 'unclassified', 'living_street'];

export type SpotState = 'ready' | 'cooldown' | 'inrange';
export interface SpotView {
  spot: Spot;
  state: SpotState;
  /** Gegner, der die Fundstelle bewacht, oder null. */
  guard: EnemyId | null;
}

export const DEMO = demoWorld as unknown as {
  name: string;
  center: LatLon;
  start: LatLon;
  bounds: [[number, number], [number, number]];
  geojson: GeoJSON.FeatureCollection;
};

interface Options {
  mode: 'real' | 'demo';
  start: LatLon;
  onTap: (p: LatLon) => void;
  onSpotTap: (id: string) => void;
  onFollowChange: (follow: boolean) => void;
  onCameraMove: () => void;
  onDataChanged: () => void;
  onError: (msg: string) => void;
}

const ll = (p: LatLon): [number, number] => [p.lon, p.lat];

export class GameMap {
  map!: MLMap;
  follow = true;
  private markers = new Map<string, { marker: Marker; el: HTMLElement; state: string }>();
  private player: Marker | null = null;
  private playerEl: HTMLElement | null = null;
  private target: Marker | null = null;
  private lastMarkerTap = 0;
  private loaded = false;
  private errorShown = false;
  private pendingRange: { c: LatLon; r: number } | null = null;
  private decorCenter: LatLon | null = null;
  private tilesDirty = true;
  private decorTimer = 0;

  constructor(
    private container: HTMLElement,
    private opts: Options,
  ) {}

  async init() {
    const { mode, start } = this.opts;
    const style = mode === 'real' ? buildStyle('real', await loadRealSource()) : buildStyle('demo');
    if (mode === 'demo') style.sources.demo = { type: 'geojson', data: DEMO.geojson };

    this.map = new maplibregl.Map({
      container: this.container,
      style,
      center: ll(start),
      zoom: 17.2,
      pitch: 52,
      maxPitch: 62,
      minZoom: mode === 'demo' ? 14.5 : 11,
      maxZoom: 19.5,
      maxBounds: mode === 'demo' ? DEMO.bounds : undefined,
      attributionControl: mode === 'real' ? { compact: true } : false,
      fadeDuration: 0,
    });

    this.map.on('styleimagemissing', (e) => {
      const img = patternImage(e.id);
      if (img && !this.map.hasImage(e.id)) this.map.addImage(e.id, img.data, { pixelRatio: img.pixelRatio });
    });

    this.map.on('click', (e) => {
      if (Date.now() - this.lastMarkerTap < 400) return;
      this.opts.onTap({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    const breakFollow = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && this.follow) {
        this.follow = false;
        this.opts.onFollowChange(false);
      }
    };
    this.map.on('dragstart', breakFollow);
    this.map.on('move', () => this.opts.onCameraMove());

    this.map.on('error', (e) => {
      console.warn('[Karte]', e.error);
      if (mode === 'real' && !this.errorShown && /fetch|load|tile|NetworkError|Failed/i.test(String(e.error?.message ?? ''))) {
        this.errorShown = true;
        this.opts.onError('Kartendaten konnten nicht geladen werden. Prüfe deine Internetverbindung.');
      }
    });

    const dataSource = mode === 'real' ? 'omt' : 'demo';
    this.map.on('sourcedata', (e) => {
      if (e.sourceId === dataSource && (e.tile || e.isSourceLoaded)) this.tilesDirty = true;
    });

    let idleTimer = 0;
    this.map.on('idle', () => {
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => this.opts.onDataChanged(), 250);
      this.scheduleDecor();
    });

    await new Promise<void>((resolve) => this.map.once('load', () => resolve()));
    this.loaded = true;
    if (this.pendingRange) this.setRange(this.pendingRange.c, this.pendingRange.r);
  }

  setPlayer(pos: LatLon, avatarSvg: string) {
    if (!this.player) {
      this.playerEl = h('div', { class: 'player' }, h('div', { class: 'player-ring' }), svgEl(avatarSvg, 'player-face'));
      this.player = new maplibregl.Marker({ element: this.playerEl, anchor: 'center', pitchAlignment: 'viewport' })
        .setLngLat(ll(pos))
        .addTo(this.map);
    } else {
      this.player.setLngLat(ll(pos));
    }
  }

  setRange(c: LatLon, radiusM: number) {
    if (!this.loaded) {
      this.pendingRange = { c, r: radiusM };
      return;
    }
    (this.map.getSource('range') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(c, radiusM)] } }],
    });
  }

  setTarget(p: LatLon | null) {
    if (!p) {
      this.target?.remove();
      this.target = null;
      return;
    }
    if (!this.target) {
      this.target = new maplibregl.Marker({ element: svgEl(icon('close', 18), 'walk-target'), anchor: 'center' }).setLngLat(ll(p)).addTo(this.map);
    } else this.target.setLngLat(ll(p));
  }

  centerOn(p: LatLon, smooth: boolean) {
    if (smooth) this.map.easeTo({ center: ll(p), duration: 900 });
    else this.map.jumpTo({ center: ll(p) });
  }

  setFollow(on: boolean, p?: LatLon) {
    this.follow = on;
    if (on && p) this.map.easeTo({ center: ll(p), zoom: Math.max(this.map.getZoom(), 16.5), pitch: 52, duration: 700 });
  }

  project(p: LatLon) {
    return this.map.project(ll(p));
  }

  metersToPixels(m: number, at: LatLon) {
    const mpp = (156543.03392 * Math.cos((at.lat * Math.PI) / 180)) / 2 ** this.map.getZoom();
    return m / mpp;
  }

  private glowSig = '';

  setSpots(views: SpotView[]) {
    // Bodenleuchten nur neu setzen, wenn sich Fundstellen oder ihr Zustand ändern
    const sig = views.map((v) => v.spot.id + v.state + (v.guard ?? '')).join('|');
    if (sig !== this.glowSig && this.loaded) {
      this.glowSig = sig;
      (this.map.getSource('glow') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: views.map((v) => ({
          type: 'Feature',
          properties: { s: v.state, src: v.spot.source, g: v.guard ? 1 : 0 },
          geometry: { type: 'Point', coordinates: ll(v.spot.pos) },
        })),
      });
    }
    const seen = new Set<string>();
    for (const v of views) {
      seen.add(v.spot.id);
      let m = this.markers.get(v.spot.id);
      if (!m) {
        const el = h(
          'button',
          { class: 'spot', type: 'button', 'aria-label': v.spot.name, 'data-source': v.spot.source },
          h('span', { class: 'spot-badge' }, svgEl(spotIcon(v.spot.kind, 19))),
          h('span', { class: 'spot-stake' }),
          h('span', { class: 'spot-guard', 'aria-hidden': 'true' }),
        );
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.lastMarkerTap = Date.now();
          this.opts.onSpotTap(v.spot.id);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(ll(v.spot.pos)).addTo(this.map);
        m = { marker, el, state: '' };
        this.markers.set(v.spot.id, m);
      }
      const st = v.state + (v.guard ? ':g' : '');
      if (m.state !== st) {
        m.el.dataset.state = v.state;
        m.el.dataset.guard = v.guard ? '1' : '0';
        m.el.setAttribute('aria-label', v.guard ? `${v.spot.name} (bewacht)` : v.spot.name);
        m.state = st;
      }
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.marker.remove();
        this.markers.delete(id);
      }
    }
  }

  // --- Detail-Ebene ---------------------------------------------------------------

  /** Nach Kamerabewegung oder neu geladenen Kacheln die Details neu aufbauen (wenn nötig). */
  private scheduleDecor() {
    if (!this.loaded || this.map.getZoom() < DECOR_MINZOOM - 0.5) return;
    const c = this.map.getCenter();
    const center = { lat: c.lat, lon: c.lng };
    const moved = !this.decorCenter || distanceM(this.decorCenter, center) > 150;
    if (!moved && !this.tilesDirty) return;
    this.tilesDirty = false;
    clearTimeout(this.decorTimer);
    this.decorTimer = window.setTimeout(() => this.buildDecor(center), 30);
  }

  private buildDecor(center: LatLon) {
    const t0 = performance.now();
    try {
      const res = generateDecor(this.collectDecorInput(center, DECOR_RADIUS_M + 250), center, DECOR_RADIUS_M);
      (this.map.getSource('decor') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: res.parts.map((p) => ({
          type: 'Feature',
          properties: { b: p.base, t: p.top, c: p.color },
          geometry: { type: 'Polygon', coordinates: [p.ring] },
        })),
      });
      this.decorCenter = center;
      this.container.dataset.decor = JSON.stringify({ ...res.counts, parts: res.parts.length, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      console.warn('[Details]', err);
    }
  }

  private collectDecorInput(center: LatLon, maxDist: number): DecorInput {
    const real = this.opts.mode === 'real';
    const kx = 111320 * Math.cos((center.lat * Math.PI) / 180);
    const ky = 111320;
    const query = (layer: string) =>
      this.map.querySourceFeatures(real ? 'omt' : 'demo', real ? { sourceLayer: layer } : { filter: ['==', ['get', '_layer'], layer] });
    const nearBox = (ring: number[][]) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [lon, lat] of ring) {
        const x = (lon - center.lon) * kx;
        const y = (lat - center.lat) * ky;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      const dx = Math.max(x0, 0, -x1);
      const dy = Math.max(y0, 0, -y1);
      return dx * dx + dy * dy <= maxDist * maxDist;
    };
    const cls = (f: { properties: Record<string, unknown> | null }) => String(f.properties?.class ?? '');
    const polys = (features: GeoJSONFeature[], classes?: string[]): RawPolygon[] => {
      const out: RawPolygon[] = [];
      for (const f of features) {
        if (classes && !classes.includes(cls(f))) continue;
        const g = f.geometry;
        const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const rings of list) {
          if (!rings[0] || rings[0].length < 4 || !nearBox(rings[0])) continue;
          out.push({
            rings: rings as [number, number][][],
            height: Number(f.properties?.render_height ?? 6),
            minHeight: Number(f.properties?.render_min_height ?? 0),
          });
        }
      }
      return out;
    };
    const lines = (features: GeoJSONFeature[]): RawLine[] => {
      const out: RawLine[] = [];
      for (const f of features) {
        if (f.properties?.brunnel === 'tunnel') continue;
        const g = f.geometry;
        const list = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const coords of list) if (coords.length > 1 && nearBox(coords)) out.push({ coords: coords as [number, number][], drivable: DRIVABLE.includes(cls(f)) });
      }
      return out;
    };
    const landcover = query('landcover');
    const landuse = query('landuse');
    return {
      buildings: polys(query('building')),
      forests: polys(landcover, ['wood', 'forest']),
      greens: [...polys(landuse, ['park', 'cemetery', 'village_green', 'garden', 'allotments']), ...(real ? polys(query('park'), ['park']) : [])],
      meadows: polys(landcover, ['grass', 'meadow', 'scrub']),
      residential: polys(landuse, ['residential']),
      roads: lines(query('transportation')),
    };
  }

  /** Echte Orte (Supermarkt, Apotheke, Haltestelle …) aus den geladenen Kartendaten. */
  poiCandidates(): PoiCandidate[] {
    if (this.opts.mode === 'demo') {
      return DEMO.geojson.features
        .filter((f) => f.properties?._layer === 'poi' && f.geometry.type === 'Point')
        .map((f) => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          return { pos: { lat, lon }, cls: f.properties?.class, subclass: f.properties?.subclass };
        });
    }
    if (!this.loaded || !this.map.getSource('omt')) return [];
    try {
      return this.map
        .querySourceFeatures('omt', { sourceLayer: 'poi' })
        .filter((f) => f.geometry.type === 'Point')
        .map((f) => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          return { id: f.id ?? undefined, pos: { lat, lon }, cls: f.properties?.class, subclass: f.properties?.subclass };
        });
    } catch {
      return [];
    }
  }

  destroy() {
    clearTimeout(this.decorTimer);
    this.markers.forEach((m) => m.marker.remove());
    this.markers.clear();
    this.map?.remove();
  }
}
