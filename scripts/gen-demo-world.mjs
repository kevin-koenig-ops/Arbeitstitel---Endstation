// Erzeugt das fiktive Demo-Dorf "Altenbrück" als GeoJSON.
// Die Features benutzen dieselben Ebenen- und Klassennamen wie OpenStreetMap-
// Vektorkacheln (OpenMapTiles-Schema). Dadurch stylt derselbe Kartenstil
// Demo-Dorf und echte Karte.
//
// Aufruf: npm run gen:world

import { writeFileSync } from 'node:fs';

const CENTER = { lat: 51.6, lon: 10.2 };
let seed = 20261020;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const toLL = ([x, y]) => {
  const lat = CENTER.lat + y / 111320;
  const lon = CENTER.lon + x / (111320 * Math.cos((CENTER.lat * Math.PI) / 180));
  return [Number(lon.toFixed(7)), Number(lat.toFixed(7))];
};

const features = [];
const add = (layer, props, type, coords) =>
  features.push({ type: 'Feature', properties: { _layer: layer, ...props }, geometry: { type, coordinates: coords } });
const poly = (layer, props, ring) => add(layer, props, 'Polygon', [[...ring, ring[0]].map(toLL)]);
const line = (layer, props, pts) => add(layer, props, 'LineString', pts.map(toLL));
const point = (layer, props, p) => add(layer, props, 'Point', toLL(p));

function blob(cx, cy, r, n = 30, rough = 0.28) {
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rough * (0.5 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.2 * Math.sin(a * 5 + ph[2]));
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  return pts;
}

function rect(cx, cy, w, d, angle, cut = 0) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let local = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  if (cut) {
    // Eine Ecke "eingestürzt"
    local = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2 - cut], [w / 2 - cut * 1.3, d / 2], [-w / 2, d / 2]];
  }
  return local.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

// --- Straßen ---------------------------------------------------------------------
const roads = [
  { cls: 'secondary', pts: [[-950, -170], [-600, -110], [-380, -60], [-150, -10], [60, 20], [260, 60], [460, 140], [700, 250], [980, 340]] },
  { cls: 'minor', pts: [[-150, -10], [-130, 120], [-100, 240], [-60, 360]] },
  { cls: 'minor', pts: [[-100, 240], [60, 262], [220, 240], [340, 190], [460, 140]] },
  { cls: 'minor', pts: [[60, 20], [80, -120], [120, -250], [200, -360]] },
  { cls: 'minor', pts: [[-380, -60], [-400, -200], [-330, -330]] },
  { cls: 'minor', pts: [[-130, 120], [-300, 150], [-440, 115]] },
  { cls: 'minor', pts: [[80, -120], [250, -105], [380, -50], [460, 140]] },
  { cls: 'service', pts: [[460, 140], [560, 40], [660, -30]] },
  { cls: 'track', pts: [[200, -360], [420, -420], [700, -380], [900, -250]] },
  { cls: 'track', pts: [[220, 240], [300, 420], [430, 620]] },
  { cls: 'path', pts: [[-60, 360], [-220, 470], [-450, 455], [-620, 300], [-650, 120]] },
  { cls: 'path', pts: [[-330, -330], [-500, -420], [-720, -390]] },
];
const creek = [[-950, 280], [-660, 190], [-470, 80], [-290, 52], [-235, 20], [-190, -90], [-120, -300], [-70, -620], [-40, -900]];

// --- Flächen (zuerst, damit sie unten liegen) -----------------------------------
poly('landuse', { class: 'residential' }, [[-500, -170], [-430, -330], [-150, -360], [220, -330], [430, -140], [540, 120], [470, 280], [200, 340], [-90, 430], [-400, 260], [-520, 60]]);
poly('landuse', { class: 'industrial' }, [[480, 150], [470, 40], [560, -120], [720, -100], [730, 120], [600, 190]]);

const fields = [
  [[150, -460], [420, -470], [450, -720], [140, -720]],
  [[460, -460], [720, -420], [760, -720], [480, -730]],
  [[760, -400], [940, -280], [1040, -330], [1040, -700], [800, -720]],
  [[740, -60], [1040, -40], [1040, 260], [760, 210]],
  [[480, 420], [760, 330], [1040, 400], [1040, 800], [520, 800]],
  [[60, 460], [270, 430], [400, 640], [380, 800], [40, 800]],
  [[-1000, -150], [-640, -130], [-560, -260], [-1000, -260]],
];
fields.forEach((f, i) => poly('landcover', { class: i % 3 === 2 ? 'grass' : 'farmland' }, f));

[[-600, 420, 280], [-660, -470, 260], [400, 380, 85], [-860, 40, 120], [880, -560, 110]].forEach(([x, y, r]) =>
  poly('landcover', { class: 'wood' }, blob(x, y, r)),
);
poly('landcover', { class: 'grass' }, [[-330, 10], [-170, 15], [-160, 105], [-320, 120]]); // Dorfplatz
poly('landuse', { class: 'pitch' }, rect(280, -220, 95, 60, -0.15));
poly('landuse', { class: 'cemetery' }, [[-40, 285], [70, 280], [80, 380], [-25, 395]]);
poly('water', { class: 'pond' }, blob(-255, 58, 30, 24, 0.2));
line('waterway', { class: 'stream' }, creek);

// Wo eine Straße den Bach kreuzt, führt eine Brücke darüber (16 m lang)
function crossing(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const q = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}
roads.forEach((r) => {
  let pts = [r.pts[0]];
  for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i];
    const b = r.pts[i + 1];
    let t = null;
    for (let k = 0; k < creek.length - 1 && t === null; k++) t = crossing(a, b, creek[k], creek[k + 1]);
    if (t === null) {
      pts.push(b);
      continue;
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const at = (d) => [a[0] + (b[0] - a[0]) * (t + d / len), a[1] + (b[1] - a[1]) * (t + d / len)];
    pts.push(at(-8));
    line('transportation', { class: r.cls }, pts);
    line('transportation', { class: r.cls, brunnel: 'bridge' }, [at(-8), at(8)]);
    pts = [at(8), b];
  }
  line('transportation', { class: r.cls }, pts);
});

// --- Besondere Gebäude & echte Orte --------------------------------------------
const specials = [];
function special(x, y, w, d, angle, h, poi) {
  specials.push({ x, y, r: Math.max(w, d) / 2 + 8 });
  poly('building', { render_height: h }, rect(x, y, w, d, angle));
  if (poi) point('poi', poi, [x, y]);
}
special(15, 330, 14, 30, 0.05, 15, { class: 'place_of_worship', subclass: 'place_of_worship' });
special(15, 352, 7, 7, 0.05, 30);
special(600, 92, 46, 28, -0.6, 7, { class: 'grocery', subclass: 'supermarket' });
special(575, -55, 56, 34, -0.6, 9, { class: 'shop', subclass: 'doityourself' });
special(700, 212, 22, 14, 0.42, 5, { class: 'fuel', subclass: 'fuel' });
special(-25, 34, 14, 15, 0.14, 8, { class: 'pharmacy', subclass: 'pharmacy' });
special(190, 82, 13, 16, 0.2, 9, { class: 'doctors', subclass: 'doctors' });
special(-255, -14, 12, 12, 0.2, 7, { class: 'bakery', subclass: 'bakery' });
special(160, -205, 42, 20, 0.3, 10, { class: 'school', subclass: 'school' });
special(-470, -95, 18, 12, 0.25, 6, { class: 'car', subclass: 'car_repair' });
// Öffentliche Gebäude (nur Optik: Rathaus, Polizei, Feuerwehr)
special(-185, 80, 18, 13, 0.1, 11, { class: 'town_hall', subclass: 'town_hall' });
special(240, 120, 16, 12, 0.35, 8, { class: 'police', subclass: 'police' });
special(-62, 64, 22, 15, 0.12, 7, { class: 'fire_station', subclass: 'fire_station' });

const pois = [
  [{ class: 'bus', subclass: 'bus_stop' }, [-300, -62]],
  [{ class: 'bus', subclass: 'bus_stop' }, [40, 2]],
  [{ class: 'bus', subclass: 'bus_stop' }, [330, 78]],
  [{ class: 'bus', subclass: 'bus_stop' }, [112, -236]],
  [{ class: 'bus', subclass: 'bus_stop' }, [-112, 232]],
  [{ class: 'drinking_water', subclass: 'fountain' }, [-185, 42]],
];
pois.forEach(([p, xy]) => {
  point('poi', p, xy);
  specials.push({ x: xy[0], y: xy[1], r: 9 });
});

// --- Wohnhäuser entlang der Straßen ----------------------------------------------
function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}
const allLines = [...roads.map((r) => r.pts), creek];
const houses = [];
const inCore = ([x, y]) => x > -500 && x < 520 && y > -340 && y < 420 && !(x > 460 && y < 160 && y > -130);

for (const road of roads) {
  if (!['secondary', 'minor'].includes(road.cls)) continue;
  const pts = road.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const angle = Math.atan2(uy, ux);
    for (let t = 14; t < len - 10; t += 24 + rand() * 12) {
      for (const side of [-1, 1]) {
        if (rand() < 0.2) continue;
        const off = 15 + rand() * 5;
        const c = [ax + ux * t - uy * side * off, ay + uy * t + ux * side * off];
        if (!inCore(c)) continue;
        if (allLines.some((l) => distToPolyline(c, l) < 11.5)) continue;
        if (houses.some((h) => Math.hypot(h[0] - c[0], h[1] - c[1]) < 14)) continue;
        if (specials.some((s) => Math.hypot(s.x - c[0], s.y - c[1]) < s.r + 7)) continue;
        houses.push(c);
        const w = 8 + rand() * 5;
        const d = 9 + rand() * 4;
        const cut = rand() < 0.3 ? 2 + rand() * 3 : 0;
        const h = rand() < 0.15 ? 2.5 : 4 + rand() * 4.5; // manche Häuser sind nur noch Grundmauern
        poly('building', { render_height: Number(h.toFixed(1)) }, rect(c[0], c[1], w, d, angle + (rand() - 0.5) * 0.12, cut));
        // Gartenhütte hinter manchen Häusern
        if (rand() < 0.25) {
          const g = [c[0] - uy * side * 13, c[1] + ux * side * 13];
          if (!allLines.some((l) => distToPolyline(g, l) < 6) && !houses.some((hh) => hh !== c && Math.hypot(hh[0] - g[0], hh[1] - g[1]) < 10)) {
            poly('building', { render_height: 2.4 }, rect(g[0], g[1], 4, 4, angle));
          }
        }
      }
    }
  }
}

const world = {
  name: 'Altenbrück',
  center: CENTER,
  bounds: [toLL([-1000, -800]), toLL([1050, 820])],
  start: toLL([-140, 40]).reverse(),
  geojson: { type: 'FeatureCollection', features },
};
// start als {lat, lon}
world.start = { lat: world.start[0], lon: world.start[1] };

writeFileSync(new URL('../src/map/demoWorld.json', import.meta.url), JSON.stringify(world));
console.log(`Demo-Welt: ${features.length} Features, ${houses.length} Wohnhäuser`);
