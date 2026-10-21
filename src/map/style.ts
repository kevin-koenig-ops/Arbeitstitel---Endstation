// Der Endzeit-Kartenstil.
//
// Funktioniert für zwei Datenquellen:
//  - 'real': OpenStreetMap-Vektorkacheln von OpenFreeMap (OpenMapTiles-Schema)
//  - 'demo': das eingebaute Demo-Dorf (GeoJSON mit denselben Ebenen-/Klassennamen)

import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';

export const MAP_COLORS = {
  ground: '#4b4538',
  residential: '#48423a',
  industrial: '#4d4136',
  water: '#1f2b29',
  waterEdge: '#52625a',
  casing: '#24221e',
  roadMajor: '#8d8574',
  roadMinor: '#766f61',
  track: '#6f6655',
  marking: '#b0965e',
  building: '#38332d',
  buildingTop: '#4a433a',
  label: '#d9ccb0',
  labelHalo: '#1d1b17',
};

type Mode = 'real' | 'demo';

/** Ab dieser Zoomstufe zeigt die Karte die Detail-Ebene (Bäume, Häuser mit Dach, Autowracks). */
export const DECOR_MINZOOM = 15;

export interface RealSource {
  source: SourceSpecification;
  glyphs?: string;
}

const z = (stops: [number, number][], base = 1.6): ExpressionSpecification =>
  ['interpolate', ['exponential', base], ['zoom'], ...stops.flat()] as ExpressionSpecification;

const cls = (...values: string[]): FilterSpecification => ['in', ['get', 'class'], ['literal', values]] as FilterSpecification;

export function buildStyle(mode: Mode, real?: RealSource): StyleSpecification {
  const C = MAP_COLORS;

  // Liefert source/source-layer/filter passend zur Datenquelle.
  const from = (layer: string, filter?: FilterSpecification) => {
    if (mode === 'real') return { source: 'omt', 'source-layer': layer, ...(filter ? { filter } : {}) };
    const f = ['==', ['get', '_layer'], layer] as FilterSpecification;
    return { source: 'demo', filter: (filter ? ['all', f, filter] : f) as FilterSpecification };
  };

  const isLine = ['==', ['geometry-type'], 'LineString'] as FilterSpecification;
  const road = (classes: string[]): FilterSpecification => ['all', isLine, cls(...classes)] as FilterSpecification;

  const MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
  const MINOR = ['minor', 'service', 'residential', 'unclassified', 'living_street'];
  const wMajor = z([[12, 1.5], [15, 6], [17, 16], [19, 46], [21, 150]]);
  const wMinor = z([[13, 0.8], [15, 3], [17, 10], [19, 30], [21, 100]]);

  const layers: LayerSpecification[] = [
    { id: 'ground', type: 'background', paint: { 'background-pattern': 'pat-ground' } },

    { id: 'landuse-residential', type: 'fill', ...from('landuse', cls('residential', 'suburb', 'neighbourhood')), paint: { 'fill-color': C.residential, 'fill-opacity': 0.45 } },
    { id: 'landuse-industrial', type: 'fill', ...from('landuse', cls('industrial', 'commercial', 'retail', 'railway', 'garages', 'quarry')), paint: { 'fill-pattern': 'pat-rubble', 'fill-opacity': 0.9 } },
    { id: 'landcover-farm', type: 'fill', ...from('landcover', cls('farmland')), paint: { 'fill-pattern': 'pat-farm' } },
    { id: 'landcover-grass', type: 'fill', ...from('landcover', cls('grass', 'meadow')), paint: { 'fill-pattern': 'pat-grass' } },
    { id: 'landuse-green', type: 'fill', ...from('landuse', cls('pitch', 'playground', 'stadium', 'park', 'cemetery', 'school')), paint: { 'fill-color': '#47493a' } },
    { id: 'landuse-cemetery-edge', type: 'line', ...from('landuse', cls('cemetery')), paint: { 'line-color': '#5c5a4a', 'line-width': 1.2, 'line-dasharray': [2, 2] } },
    { id: 'landcover-sand', type: 'fill', ...from('landcover', cls('sand', 'rock')), paint: { 'fill-color': '#5f5644' } },
    { id: 'landcover-wetland', type: 'fill', ...from('landcover', cls('wetland')), paint: { 'fill-color': '#3a4236' } },
    {
      id: 'landcover-wood',
      type: 'fill',
      ...from('landcover', cls('wood', 'forest')),
      // Von weitem Baumkronen, nah dran Waldboden (die Bäume stehen dann in 3D darauf)
      paint: { 'fill-pattern': ['step', ['zoom'], 'pat-forest', DECOR_MINZOOM, 'pat-forest-floor'] },
    },
    { id: 'landcover-wood-edge', type: 'line', ...from('landcover', cls('wood', 'forest')), paint: { 'line-color': '#1c2217', 'line-width': 2, 'line-blur': 2 } },

    { id: 'water', type: 'fill', ...from('water'), paint: { 'fill-pattern': 'pat-water' } },
    { id: 'water-edge', type: 'line', ...from('water'), paint: { 'line-color': C.waterEdge, 'line-width': 1.4, 'line-opacity': 0.7 } },
    {
      id: 'waterway',
      type: 'line',
      ...from('waterway'),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.water, 'line-width': z([[13, 1], [17, 6], [20, 20]]) },
    },

    // Straßen: Kante, Belag, verblasste Mittellinie
    { id: 'road-path', type: 'line', ...from('transportation', road(['path', 'track', 'footway', 'cycleway', 'bridleway'])), layout: { 'line-cap': 'round' }, paint: { 'line-color': C.track, 'line-width': z([[14, 0.6], [17, 2.4], [20, 6]]), 'line-dasharray': [2, 1.4] } },
    { id: 'road-rail', type: 'line', ...from('transportation', road(['rail', 'transit'])), paint: { 'line-color': '#2f2c27', 'line-width': z([[13, 1], [18, 5]]), 'line-dasharray': [1, 1] } },
    { id: 'road-minor-casing', type: 'line', ...from('transportation', road(MINOR)), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.casing, 'line-width': z([[13, 1.4], [15, 4.6], [17, 13], [19, 36], [21, 112]]) } },
    { id: 'road-major-casing', type: 'line', ...from('transportation', road(MAJOR)), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.casing, 'line-width': z([[12, 2.4], [15, 8], [17, 20], [19, 54], [21, 164]]) } },
    { id: 'road-minor', type: 'line', ...from('transportation', road(MINOR)), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadMinor, 'line-width': wMinor } },
    { id: 'road-major', type: 'line', ...from('transportation', road(MAJOR)), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.roadMajor, 'line-width': wMajor } },
    {
      id: 'road-cracks',
      type: 'line',
      minzoom: 16.3,
      ...from('transportation', road([...MAJOR, ...MINOR])),
      layout: { 'line-join': 'round' },
      paint: {
        'line-pattern': 'pat-cracks',
        'line-opacity': 0.6,
        'line-width': [
          'interpolate', ['exponential', 1.6], ['zoom'],
          15, ['match', ['get', 'class'], MAJOR, 6, 3],
          17, ['match', ['get', 'class'], MAJOR, 16, 10],
          19, ['match', ['get', 'class'], MAJOR, 46, 30],
          21, ['match', ['get', 'class'], MAJOR, 150, 100],
        ] as ExpressionSpecification,
      },
    },
    { id: 'road-marking', type: 'line', minzoom: 16, ...from('transportation', road(MAJOR)), paint: { 'line-color': C.marking, 'line-opacity': 0.45, 'line-width': z([[16, 0.8], [19, 2.4]]), 'line-dasharray': [4, 6] } },

    // Suchradius liegt auf dem Boden, Häuser und Bäume verdecken ihn
    { id: 'range-fill', type: 'fill', source: 'range', paint: { 'fill-color': '#ffb22e', 'fill-opacity': 0.08 } },
    { id: 'range-line', type: 'line', source: 'range', paint: { 'line-color': '#ffb22e', 'line-width': 2, 'line-opacity': 0.8, 'line-dasharray': [2, 2] } },

    // Suchkreise von Verstecken: wie mit Kreide auf den Boden gemalt
    { id: 'cache-fill', type: 'fill', source: 'caches', paint: { 'fill-color': '#e8dec8', 'fill-opacity': 0.07 } },
    { id: 'cache-line', type: 'line', source: 'caches', paint: { 'line-color': '#e8dec8', 'line-width': 2.5, 'line-opacity': 0.75, 'line-dasharray': [1, 2.2] } },

    // Warmes Leuchten am Boden unter Fundstellen
    {
      id: 'spot-glow',
      type: 'circle',
      source: 'glow',
      paint: {
        'circle-pitch-alignment': 'map',
        'circle-pitch-scale': 'map',
        'circle-blur': 1,
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 15, 7, 17, 26, 19, 100],
        'circle-color': ['case', ['==', ['get', 'c'], 1], '#ffe070', ['==', ['get', 'g'], 1], '#d9482b', ['==', ['get', 's'], 'inrange'], '#ffd27a', ['==', ['get', 'src'], 'poi'], '#f1e2bd', '#ffb22e'],
        'circle-opacity': ['case', ['==', ['get', 's'], 'cooldown'], 0, ['==', ['get', 'c'], 1], 0.9, ['==', ['get', 's'], 'inrange'], 0.75, 0.5],
      },
    },

    // Weit weg (herausgezoomt): einfache 3D-Blöcke aus den Kartendaten
    {
      id: 'buildings',
      type: 'fill-extrusion',
      minzoom: 13,
      maxzoom: DECOR_MINZOOM,
      ...from('building'),
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 2, '#3a352e', 8, '#4a443b', 20, '#565046'],
        'fill-extrusion-height': ['*', 0.75, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['*', 0.75, ['coalesce', ['get', 'render_min_height'], 0]],
        'fill-extrusion-opacity': 0.94,
      },
    },
    // Nah dran: nur Grundrisse; die Häuser selbst kommen aus der Detail-Ebene
    { id: 'buildings-flat', type: 'fill', minzoom: DECOR_MINZOOM, ...from('building'), paint: { 'fill-color': '#2b2823' } },
    // Detail-Ebene (map/decor.ts): Häuser mit Dächern und Ruinen, Bäume, Autowracks
    {
      id: 'decor',
      type: 'fill-extrusion',
      source: 'decor',
      minzoom: DECOR_MINZOOM,
      paint: {
        'fill-extrusion-color': ['get', 'c'],
        'fill-extrusion-height': ['get', 't'],
        'fill-extrusion-base': ['get', 'b'],
        'fill-extrusion-opacity': 1,
      },
    },
  ];

  if (mode === 'real') {
    layers.push(
      {
        id: 'street-names',
        type: 'symbol',
        minzoom: 15,
        source: 'omt',
        'source-layer': 'transportation_name',
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': z([[15, 10], [18, 13]], 1.2),
          'text-letter-spacing': 0.08,
          'text-transform': 'uppercase',
        },
        paint: { 'text-color': C.label, 'text-opacity': 0.55, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-names',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        filter: cls('village', 'town', 'suburb', 'hamlet', 'city', 'quarter'),
        layout: {
          'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-letter-spacing': 0.25,
          'text-transform': 'uppercase',
        },
        paint: { 'text-color': C.label, 'text-opacity': 0.4, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.6 },
      },
    );
  }

  const empty: SourceSpecification = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  const sources: Record<string, SourceSpecification> = { range: empty, decor: { ...empty }, glow: { ...empty }, caches: { ...empty } };
  if (mode === 'real' && real) sources.omt = real.source;

  const style: StyleSpecification = {
    version: 8,
    sources,
    layers,
    light: { anchor: 'viewport', color: '#ffd7a0', intensity: 0.42, position: [1.3, 210, 40] },
    sky: {
      'sky-color': '#2a251f',
      'horizon-color': '#6d5a43',
      'fog-color': '#4b4538',
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.9,
      'fog-ground-blend': 0.75,
    },
  };
  if (mode === 'real' && real?.glyphs) style.glyphs = real.glyphs;
  return style;
}

// --- Echte Kartendaten -----------------------------------------------------------

const OFM_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const OFM_FALLBACK: RealSource = {
  source: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
};

/**
 * Holt die aktuelle Kachel-Adresse von OpenFreeMap (kostenlos, ohne API-Key,
 * Daten von OpenStreetMap). Fällt bei Problemen auf bekannte Adressen zurück.
 */
export async function loadRealSource(): Promise<RealSource> {
  try {
    const res = await fetch(OFM_STYLE);
    if (!res.ok) throw new Error(String(res.status));
    const s = (await res.json()) as StyleSpecification;
    const src = s.sources?.openmaptiles;
    if (!src) throw new Error('keine Quelle');
    return { source: src, glyphs: s.glyphs ?? OFM_FALLBACK.glyphs };
  } catch {
    return OFM_FALLBACK;
  }
}
