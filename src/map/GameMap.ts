// Die Spielkarte: MapLibre mit Endzeit-Stil, Spielerfigur, Suchradius und Fundstellen.

import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import { circleRing } from '../core/geo';
import type { LatLon, Spot } from '../core/types';
import type { PoiCandidate } from '../core/world';
import { h, svgEl } from '../ui/dom';
import { icon, spotIcon } from '../ui/icons';
import demoWorld from './demoWorld.json';
import { patternImage } from './patterns';
import { buildStyle, loadRealSource } from './style';

export type SpotState = 'ready' | 'cooldown' | 'inrange';
export interface SpotView {
  spot: Spot;
  state: SpotState;
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

    let idleTimer = 0;
    this.map.on('idle', () => {
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => this.opts.onDataChanged(), 250);
    });

    await new Promise<void>((resolve) => this.map.once('load', () => resolve()));
    this.loaded = true;

    this.map.addSource('range', { type: 'geojson', data: emptyFc() });
    this.map.addLayer({ id: 'range-fill', type: 'fill', source: 'range', paint: { 'fill-color': '#ffb22e', 'fill-opacity': 0.07 } });
    this.map.addLayer({
      id: 'range-line',
      type: 'line',
      source: 'range',
      paint: { 'line-color': '#ffb22e', 'line-width': 2, 'line-opacity': 0.75, 'line-dasharray': [2, 2] },
    });
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

  setSpots(views: SpotView[]) {
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
      if (m.state !== v.state) {
        m.el.dataset.state = v.state;
        m.state = v.state;
      }
    }
    for (const [id, m] of this.markers) {
      if (!seen.has(id)) {
        m.marker.remove();
        this.markers.delete(id);
      }
    }
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
    this.markers.forEach((m) => m.marker.remove());
    this.markers.clear();
    this.map?.remove();
  }
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
