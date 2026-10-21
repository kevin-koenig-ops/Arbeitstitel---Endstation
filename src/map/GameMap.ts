// Die Spielkarte: MapLibre mit Endzeit-Stil, Spielerfigur, Suchradius und Fundstellen.

import maplibregl from 'maplibre-gl';
import type { GeoJSONFeature, GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import { circleRing, distanceM, offsetM } from '../core/geo';
import type { EnemyId, LatLon, Spot } from '../core/types';
import type { PoiCandidate } from '../core/world';
import { h, svgEl } from '../ui/dom';
import { icon, spotIcon } from '../ui/icons';
import { generateDecor, type DecorInput, type RawLine, type RawPolygon } from './decor';
import { FogOfWar } from './fogOfWar';
import demoWorld from './demoWorld.json';
import { patternImage } from './patterns';
import { buildStyle, DECOR_MINZOOM, loadRealSource } from './style';
import type { WalkInput } from './walkNet';

/** Umkreis der Detail-Ebene. Dahinter liegt ohnehin Nebel. */
const DECOR_RADIUS_M = 550;
/** Da läuft niemand: Autobahn, Gleise, Fähren, Seilbahnen. */
const NOT_WALKABLE = ['motorway', 'rail', 'transit', 'ferry', 'aerialway', 'raceway', 'bus_guideway', 'busway'];
const DRIVABLE = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'residential', 'unclassified', 'living_street'];

export type SpotState = 'ready' | 'cooldown' | 'inrange';
export interface SpotView {
  spot: Spot;
  state: SpotState;
  /** Gegner, der die Fundstelle bewacht, oder null. */
  guard: EnemyId | null;
  /** Liegengebliebene Händlerkiste? */
  cart?: boolean;
  /** Noch nie durchsucht (Erstfund-Bonus). */
  fresh?: boolean;
}

/** Ein Versteck-Suchkreis auf der Karte. */
export interface CacheView {
  id: string;
  center: LatLon;
  radiusM: number;
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
  onBaseTap?: () => void;
  onCacheTap?: (id: string) => void;
}

const ll = (p: LatLon): [number, number] => [p.lon, p.lat];

/** Körpergröße der Spielfigur in Metern: Sie steht maßstabsgetreu auf der Karte. */
const PERSON_M = 1.8;
/** So klein wird sie beim Herauszoomen höchstens, damit man sich noch findet. */
const FIGURE_MIN_PX = 11;
/** Start-Zoom: nah genug, dass die Figur in echter Größe gut zu sehen ist. */
export const PLAY_ZOOM = 18.7;

export class GameMap {
  map!: MLMap;
  follow = true;
  fog: FogOfWar | null = null;
  private markers = new Map<string, { marker: Marker; el: HTMLElement; state: string }>();
  private cacheMarkers = new Map<string, Marker>();
  private pendingCaches: CacheView[] | null = null;
  private player: Marker | null = null;
  private playerEl: HTMLElement | null = null;
  private figure: { el: HTMLElement; anchorY: number; h: number; px: number } | null = null;
  private playerPos: LatLon | null = null;
  private figScale = 0;
  private target: Marker | null = null;
  private baseMarker: Marker | null = null;
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
      zoom: PLAY_ZOOM,
      pitch: 52,
      maxPitch: 62,
      minZoom: mode === 'demo' ? 14.5 : 11,
      maxZoom: 21,
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
    this.map.on('move', () => {
      this.scaleFigure();
      this.opts.onCameraMove();
    });

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
    this.fog = new FogOfWar(this.map);
    if (this.pendingRange) this.setRange(this.pendingRange.c, this.pendingRange.r);
    if (this.pendingCaches) this.setCaches(this.pendingCaches);
  }

  /** Suchkreise für Verstecke, mit einem Kreidezeichen in der Mitte. */
  setCaches(list: CacheView[]) {
    if (!this.loaded) {
      this.pendingCaches = list;
      return;
    }
    (this.map.getSource('caches') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: list.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(c.center, c.radiusM)] } })),
    });
    const ids = new Set(list.map((c) => c.id));
    for (const [id, m] of this.cacheMarkers) {
      if (!ids.has(id)) {
        m.remove();
        this.cacheMarkers.delete(id);
      }
    }
    for (const c of list) {
      if (this.cacheMarkers.has(c.id)) continue;
      const el = h('button', { class: 'cache-marker', type: 'button', 'aria-label': 'Versteck: Hinweis ansehen' }, svgEl(icon('chalk', 20)), h('span', null, '?'));
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.lastMarkerTap = Date.now();
        this.opts.onCacheTap?.(c.id);
      });
      this.cacheMarkers.set(c.id, new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll(c.center)).addTo(this.map));
    }
  }

  setPlayer(pos: LatLon, avatarSvg: string) {
    this.fog?.setPlayer(pos);
    this.playerPos = pos;
    if (!this.player) {
      this.playerEl = h('div', { class: 'player' }, h('div', { class: 'player-ring' }), svgEl(avatarSvg, 'player-face'));
      if (this.figure) this.attachFigure();
      this.player = new maplibregl.Marker({ element: this.playerEl, anchor: 'center', pitchAlignment: 'viewport' })
        .setLngLat(ll(pos))
        .addTo(this.map);
    } else {
      this.player.setLngLat(ll(pos));
    }
    this.scaleFigure();
  }

  /** 3D-Spielfigur statt des runden Gesichts. Die Füße stehen genau auf dem Standort. */
  setPlayerFigure(el: HTMLElement, anchorY: number, height: number, figurePx: number) {
    this.figure = { el, anchorY, h: height, px: figurePx };
    if (this.playerEl) this.attachFigure();
  }

  private attachFigure() {
    if (!this.playerEl || !this.figure) return;
    const f = this.figure;
    f.el.classList.add('player-figure');
    f.el.style.top = `${25 - f.anchorY * f.h}px`;
    // Skaliert wird um die Füße herum
    f.el.style.transformOrigin = `36px ${f.anchorY * f.h}px`;
    this.playerEl.classList.add('has-figure');
    this.playerEl.append(f.el);
    this.figScale = 0;
    this.scaleFigure();
  }

  /**
   * Figur in echter Größe: so hoch, wie ein Mensch an dieser Stelle der Karte wäre.
   * Gemessen wird quer zur Blickrichtung (dort verzerrt die Neigung nicht).
   */
  private scaleFigure() {
    const f = this.figure;
    const p = this.playerPos;
    if (!f || !p || !this.playerEl || !this.map) return;
    const az = ((this.map.getBearing() + 90) * Math.PI) / 180;
    const a = this.map.project(ll(p));
    const b = this.map.project(ll(offsetM(p, Math.sin(az) * 10, Math.cos(az) * 10)));
    const ppm = Math.hypot(b.x - a.x, b.y - a.y) / 10;
    const pitch = (this.map.getPitch() * Math.PI) / 180;
    const want = Math.max(FIGURE_MIN_PX, PERSON_M * ppm * Math.max(0.3, Math.sin(pitch)));
    const scale = Math.min(1.6, want / f.px);
    if (!isFinite(scale) || Math.abs(scale - this.figScale) < 0.003) return;
    this.figScale = scale;
    f.el.style.transform = `scale(${scale.toFixed(4)})`;
    // Der Ortungsring wächst mit, bleibt aber gut sichtbar
    const ring = this.playerEl.querySelector<HTMLElement>('.player-ring');
    if (ring) {
      const w = Math.max(26, Math.min(70, want * 1.3));
      ring.style.cssText = `inset:auto;left:${25 - w / 2}px;top:${25 - w / 4}px;width:${w}px;height:${w / 2}px;transform:none`;
    }
  }

  /** Drehung der Karte in Grad. */
  get bearing(): number {
    return this.map.getBearing();
  }

  /** Das eigene Zuhause auf der Karte (nur für dich sichtbar). */
  setBase(p: LatLon | null) {
    this.baseMarker?.remove();
    this.baseMarker = null;
    if (!p) return;
    const el = h('button', { class: 'base-marker', type: 'button', 'aria-label': 'Dein Zuhause' }, h('span', { class: 'base-sign' }, 'H'), h('span', { class: 'base-pole' }));
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.lastMarkerTap = Date.now();
      this.opts.onBaseTap?.();
    });
    this.baseMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(ll(p)).addTo(this.map);
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

  /** Geplante Strecke zeigen (Testmodus): offroad = Abschnitt quer durchs Gelände. */
  setRoute(path: LatLon[] | null, offroad: boolean[] = []) {
    if (!this.loaded) return;
    const features: GeoJSON.Feature[] = [];
    if (path && path.length > 1) {
      let cur: [number, number][] = [ll(path[0])];
      let off = offroad[0] ?? false;
      for (let i = 1; i < path.length; i++) {
        const o = offroad[i - 1] ?? false;
        if (o !== off) {
          features.push({ type: 'Feature', properties: { off }, geometry: { type: 'LineString', coordinates: cur } });
          cur = [ll(path[i - 1])];
          off = o;
        }
        cur.push(ll(path[i]));
      }
      features.push({ type: 'Feature', properties: { off }, geometry: { type: 'LineString', coordinates: cur } });
    }
    (this.map.getSource('route') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  /** Straßen, Wege, Häuser, Wasser, Ortsflächen und Wald rund um einen Punkt (für das Wegenetz). */
  walkInput(center: LatLon, radiusM: number): WalkInput {
    const real = this.opts.mode === 'real';
    const out: WalkInput = { center, ways: [], buildings: [], water: [], built: [], forest: [] };
    let feats: (layer: string) => { geometry: GeoJSON.Geometry; properties: Record<string, unknown> | null }[];
    if (real) {
      if (!this.loaded || !this.map.getSource('omt')) return out;
      feats = (layer) => this.map.querySourceFeatures('omt', { sourceLayer: layer });
    } else feats = (layer) => DEMO.geojson.features.filter((f) => f.properties?._layer === layer) as unknown as { geometry: GeoJSON.Geometry; properties: Record<string, unknown> | null }[];
    const kx = 111320 * Math.cos((center.lat * Math.PI) / 180);
    const near = (coords: number[][]) => {
      for (const [lon, lat] of coords) if (Math.hypot((lon - center.lon) * kx, (lat - center.lat) * 111320) <= radiusM) return true;
      // Große Flächen: Mittelpunkt liegt vielleicht außerhalb, aber sie überdecken uns
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [lon, lat] of coords) {
        x0 = Math.min(x0, lon);
        x1 = Math.max(x1, lon);
        y0 = Math.min(y0, lat);
        y1 = Math.max(y1, lat);
      }
      return center.lon >= x0 && center.lon <= x1 && center.lat >= y0 && center.lat <= y1;
    };
    const polys = (layer: string, classes: string[] | null, to: [number, number][][][]) => {
      for (const f of feats(layer)) {
        if (classes && !classes.includes(String(f.properties?.class ?? ''))) continue;
        const g = f.geometry;
        const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const rings of list) if (rings[0]?.length >= 4 && near(rings[0])) to.push(rings as [number, number][][]);
      }
    };
    try {
      for (const f of feats('transportation')) {
        if (NOT_WALKABLE.includes(String(f.properties?.class ?? ''))) continue;
        const g = f.geometry;
        const list = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const c of list) if (c.length > 1 && near(c)) out.ways.push(c as [number, number][]);
      }
      polys('building', null, out.buildings);
      polys('water', null, out.water);
      polys('landuse', ['residential', 'commercial', 'industrial', 'retail', 'garages', 'railway'], out.built);
      polys('landcover', ['wood', 'forest'], out.forest);
    } catch {
      /* ohne Kartendaten: freies Laufen */
    }
    return out;
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
    if (on && p) this.map.easeTo({ center: ll(p), zoom: Math.max(this.map.getZoom(), 17.5), pitch: 52, duration: 700 });
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
    const sig = views.map((v) => v.spot.id + v.state + (v.guard ?? '') + (v.cart ? 'c' : '')).join('|');
    if (sig !== this.glowSig && this.loaded) {
      this.glowSig = sig;
      (this.map.getSource('glow') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: views.map((v) => ({
          type: 'Feature',
          properties: { s: v.state, src: v.spot.source, g: v.guard ? 1 : 0, c: v.cart ? 1 : 0 },
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
      const st = v.state + (v.guard ? ':g' : '') + (v.cart ? ':c' : '') + (v.fresh ? ':f' : '');
      if (m.state !== st) {
        m.el.dataset.state = v.state;
        m.el.dataset.guard = v.guard ? '1' : '0';
        m.el.dataset.cart = v.cart ? '1' : '0';
        m.el.dataset.fresh = v.fresh ? '1' : '0';
        m.el.setAttribute('aria-label', v.cart ? `${v.spot.name} (Händlerkiste)` : v.guard ? `${v.spot.name} (bewacht)` : v.spot.name);
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

  /**
   * Orte, an denen keine Fundstellen liegen dürfen: Friedhöfe, Krankenhäuser, Schulen,
   * Kitas, Gedenkstätten, Kirchen, dazu das Innere von Gebäuden (Privatgrund).
   * Gibt eine Prüf-Funktion zurück. Später muss ein Server dasselbe prüfen.
   */
  sensitiveCheck(): (p: LatLon, grid?: boolean) => boolean {
    const AREA = ['cemetery', 'hospital', 'school', 'kindergarten', 'college', 'university', 'religious'];
    const POINT = ['cemetery', 'grave_yard', 'hospital', 'school', 'kindergarten', 'college', 'university', 'place_of_worship', 'memorial', 'monument'];
    const rings: [number, number][][] = [];
    const points: LatLon[] = [];
    const buildings: [number, number][][] = [];
    try {
      const real = this.opts.mode === 'real';
      const features = (layer: string): { geometry: GeoJSON.Geometry; properties: Record<string, unknown> | null }[] =>
        real
          ? this.loaded && this.map.getSource('omt')
            ? this.map.querySourceFeatures('omt', { sourceLayer: layer })
            : []
          : (DEMO.geojson.features.filter((f) => f.properties?._layer === layer) as unknown as { geometry: GeoJSON.Geometry; properties: Record<string, unknown> | null }[]);
      const addPolys = (g: GeoJSON.Geometry, to: [number, number][][]) => {
        const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const r of list) if (r[0]?.length >= 4) to.push(r[0] as [number, number][]);
      };
      for (const f of features('landuse')) if (AREA.includes(String(f.properties?.class ?? ''))) addPolys(f.geometry, rings);
      for (const f of features('building')) addPolys(f.geometry, buildings);
      for (const f of features('poi')) {
        const c = String(f.properties?.class ?? '');
        const sc = String(f.properties?.subclass ?? '');
        if (!POINT.includes(c) && !POINT.includes(sc)) continue;
        if (f.geometry.type === 'Point') points.push({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
        else addPolys(f.geometry, rings);
      }
    } catch {
      /* ohne Kartendaten: nichts ausschließen */
    }
    const inside = (p: LatLon, ring: [number, number][]) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    // Abstand zum Rand (in Metern, grob) – Fundstellen halten etwas Abstand zu sensiblen Flächen
    const nearEdge = (p: LatLon, ring: [number, number][], m: number) => {
      const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
      for (let i = 1; i < ring.length; i++) {
        const ax = (ring[i - 1][0] - p.lon) * kx;
        const ay = (ring[i - 1][1] - p.lat) * 111320;
        const bx = (ring[i][0] - p.lon) * kx;
        const by = (ring[i][1] - p.lat) * 111320;
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(ax + t * dx, ay + t * dy) < m) return true;
      }
      return false;
    };
    // Echte Läden liegen natürlich in Gebäuden; nur erfundene Fundstellen dürfen nicht in Häusern liegen
    return (p: LatLon, grid = true) =>
      rings.some((r) => inside(p, r) || nearEdge(p, r, 20)) || points.some((q) => distanceM(p, q) < 40) || (grid && buildings.some((r) => inside(p, r)));
  }

  destroy() {
    clearTimeout(this.decorTimer);
    this.fog?.destroy();
    this.markers.forEach((m) => m.marker.remove());
    this.markers.clear();
    this.map?.remove();
  }
}
