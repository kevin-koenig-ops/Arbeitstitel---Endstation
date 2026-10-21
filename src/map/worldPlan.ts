// Plan für die 3D-Welt auf der Karte: welches Haus wie aussieht (Wände, Dach, Zustand),
// wo Bäume, Autowracks, Laternen und Kram am Straßenrand stehen.
//
// Reine Funktion ohne Browser und ohne three.js: bekommt dieselben Kartengeometrien wie
// die einfache Detail-Ebene (decor.ts) und liefert Beschreibungen in Metern um die Mitte.
// Alles ist deterministisch (Zufall aus der Lage), damit nichts springt, wenn man weiterläuft.

import { rngFrom, type Rng } from '../core/rng';
import type { LatLon } from '../core/types';
import { bbox, centroid, distToSeg, Grid, inPolygon, inRing, Proj, ringArea, type DecorInput, type Pt, type RawPolygon, type Ring } from './decor';

export type RoofKind = 'flat' | 'gable' | 'hip' | 'none';
export type HouseState = 'intact' | 'burnt' | 'ruin';

export interface PlanHouse {
  /** Grundriss in Metern (x Osten, y Norden), gegen den Uhrzeigersinn, nicht geschlossen. */
  ring: Ring;
  base: number;
  wallTop: number;
  roof: RoofKind;
  pitch: number;
  /** Bei Satteldach: Richtung des Firsts (Winkel in der Ebene). */
  ridge: number;
  wall: string;
  roofColor: string;
  state: HouseState;
  seed: number;
  /** Fläche in m² (große Häuser: Flachdach, Läden unten) */
  area: number;
}

export interface PlanTree {
  p: Pt;
  s: number;
  kind: 'leaf' | 'conifer' | 'dead';
  color: string;
  rot: number;
}

/** Ein Ding mit Lage und Drehung (Winkel in der Ebene, 0 = Osten, gegen den Uhrzeigersinn). */
export interface PlanThing {
  p: Pt;
  ang: number;
  kind: string;
  /** Abstand zur Mitte in Metern (fürs Ausdünnen nach Entfernung) */
  d: number;
  seed: number;
}

export interface PlanRubble {
  p: Pt;
  r: number;
  h: number;
  color: string;
}

export interface WorldPlan {
  center: LatLon;
  houses: PlanHouse[];
  trees: PlanTree[];
  cars: PlanThing[];
  props: PlanThing[];
  lamps: PlanThing[];
  poles: PlanThing[];
  rubble: PlanRubble[];
}

export const WORLD_LIMITS = { trees: 3200, cars: 90, props: 260, lamps: 70, poles: 200, propRadius: 260, carRadius: 340 };

// Farben: gedeckt, staubig (passen zur Karte)
const WALLS = ['#8a8172', '#958b76', '#7b7770', '#86604c', '#a09683', '#6f6b62', '#86765e', '#8d8170', '#9a8f7c', '#7d6a58'];
const SOOT = ['#3a3530', '#45403a', '#3d3833'];
const ROOFS = ['#7d4636', '#6a3e31', '#4a4c51', '#5a5d4c', '#6e6156', '#7a4a37', '#55504a'];
const FLAT_ROOF = ['#5d5a53', '#67625a', '#545149'];
const LEAF = ['#4f5c35', '#46532f', '#56663a', '#4a5a33', '#5f6537', '#566635', '#6c6538', '#7a5c38'];
const CONIFER = ['#34432f', '#3b4a32', '#2f3b2a'];
const RUBBLE = ['#5a5246', '#4a443c', '#615848', '#3f3a33'];

const pick = <T>(r: Rng, a: readonly T[]) => a[Math.floor(r() * a.length)];

/** Gegen den Uhrzeigersinn, ohne doppelten Endpunkt. */
function ccw(ring: Ring): Ring {
  const r = ring.slice();
  const a = r[0];
  const b = r[r.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) r.pop();
  // ringArea ist für gegen den Uhrzeigersinn negativ
  return ringArea([...r, r[0]]) > 0 ? r.reverse() : r;
}

/** Ist das Viereck fast ein Rechteck? Dann Winkel der langen Seite, sonst null. */
function rectRidge(r: Ring): number | null {
  if (r.length !== 4) return null;
  const e = r.map((p, i) => {
    const q = r[(i + 1) % 4];
    return [q[0] - p[0], q[1] - p[1]] as Pt;
  });
  for (let i = 0; i < 4; i++) {
    const a = e[i];
    const b = e[(i + 1) % 4];
    const cos = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
    if (Math.abs(cos) > 0.17) return null;
  }
  const l0 = Math.hypot(...e[0]);
  const l1 = Math.hypot(...e[1]);
  const long = l0 >= l1 ? e[0] : e[1];
  return Math.atan2(long[1], long[0]);
}

function convex(r: Ring): boolean {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const c = r[(i + 2) % r.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-6) continue;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

export function planWorld(input: DecorInput, center: LatLon, radiusM: number): WorldPlan {
  const P = new Proj(center);
  const plan: WorldPlan = { center, houses: [], trees: [], cars: [], props: [], lamps: [], poles: [], rubble: [] };
  const r2 = radiusM * radiusM;
  const near = (p: Pt, extra = 0) => p[0] * p[0] + p[1] * p[1] <= (radiusM + extra) ** 2;
  const roughlyNear = (rings: Ring[]) => {
    const b = bbox(rings[0].map(P.toM));
    const dx = Math.max(b.x0, 0, -b.x1);
    const dy = Math.max(b.y0, 0, -b.y1);
    return dx * dx + dy * dy <= r2;
  };

  // Häuser -------------------------------------------------------------------------
  const seenB = new Set<string>();
  const bGrid = new Grid<Ring>(40);
  for (const b of input.buildings) {
    if (!roughlyNear(b.rings)) continue;
    const ring = ccw(b.rings[0].map(P.toM));
    if (ring.length < 3) continue;
    const area = Math.abs(ringArea([...ring, ring[0]]));
    if (area < 6) continue;
    const c = centroid([...ring, ring[0]]);
    if (!near(c)) continue;
    const ll = P.toLL(c);
    const key = `${ll[0].toFixed(5)}:${ll[1].toFixed(5)}`;
    if (seenB.has(key)) continue;
    seenB.add(key);
    bGrid.addBox(bbox(ring), [...ring, ring[0]]);

    const r = rngFrom('haus', key);
    const roll = r();
    const state: HouseState = roll < 0.16 ? 'ruin' : roll < 0.26 ? 'burnt' : 'intact';
    const h0 = Math.min(40, Math.max(3, b.height ?? 6));
    const k = state === 'ruin' ? 0.45 + 0.25 * r() : state === 'burnt' ? 0.75 : 0.85 + 0.15 * r();
    // Mindestens ein Stockwerk, sonst wie in den Kartendaten
    const wallTop = Math.max(2.8, h0 * k);
    const base = (b.minHeight ?? 0) * k;
    const ridge = rectRidge(ring);
    const small = area < 420;
    let roof: RoofKind = 'flat';
    if (state === 'ruin' || base > 0) roof = 'none';
    else if (small && ridge !== null) roof = 'gable';
    else if (small && ring.length <= 8 && convex(ring)) roof = 'hip';
    const span = Math.sqrt(area);
    const house: PlanHouse = {
      ring,
      base,
      wallTop,
      roof,
      pitch: roof === 'flat' || roof === 'none' ? 0 : Math.min(5.5, 1.6 + span * 0.32),
      ridge: ridge ?? 0,
      wall: state === 'burnt' ? pick(r, SOOT) : pick(r, WALLS),
      roofColor: roof === 'flat' ? pick(r, FLAT_ROOF) : pick(r, ROOFS),
      state,
      seed: Math.floor(r() * 9973),
      area,
    };
    if (state === 'burnt' && roof !== 'none' && r() < 0.5) house.roof = 'none';
    plan.houses.push(house);
    if (state === 'ruin') {
      const piles = 2 + Math.floor(r() * 4);
      for (let i = 0; i < piles; i++) {
        const v = ring[Math.floor(r() * ring.length)];
        const px = v[0] + (v[0] - c[0]) * (0.12 + r() * 0.2) + (r() - 0.5) * 2;
        const py = v[1] + (v[1] - c[1]) * (0.12 + r() * 0.2) + (r() - 0.5) * 2;
        plan.rubble.push({ p: [px, py], r: 0.7 + r() * 1.1, h: 0.3 + r() * 0.7, color: pick(r, RUBBLE) });
      }
    }
  }

  // Straßen (für Abstände, Autos, Laternen, Kram) --------------------------------------
  const roadGrid = new Grid<[Pt, Pt]>(40);
  const drivable: Ring[] = [];
  for (const l of input.roads) {
    if (l.coords.length < 2) continue;
    const m = l.coords.map(P.toM);
    const b = bbox(m);
    if (b.x0 > radiusM + 50 || b.x1 < -radiusM - 50 || b.y0 > radiusM + 50 || b.y1 < -radiusM - 50) continue;
    if (l.drivable) drivable.push(m);
    for (let i = 0; i < m.length - 1; i++) {
      const sb = bbox([m[i], m[i + 1]]);
      roadGrid.addBox({ x0: sb.x0 - 8, y0: sb.y0 - 8, x1: sb.x1 + 8, y1: sb.y1 + 8 }, [m[i], m[i + 1]]);
    }
  }
  const inHouse = (p: Pt) => bGrid.near(p).some((ring) => inRing(p, ring));
  const nearHouse = (p: Pt, m: number) => bGrid.near(p).some((ring) => inRing(p, ring) || ring.some((q, i) => i > 0 && distToSeg(p, ring[i - 1], q) < m));
  const freeSpot = (p: Pt) => !nearHouse(p, 3.5) && roadGrid.near(p).every(([a, b]) => distToSeg(p, a, b) >= 7);
  const offPath = (p: Pt) => roadGrid.near(p).every(([a, b]) => distToSeg(p, a, b) >= 4);

  // Bäume (Raster in Grad, damit sie beim Weiterlaufen stehen bleiben) ----------------
  const latRef = Math.round(center.lat);
  const degLat = 1 / 111320;
  const degLon = 1 / (111320 * Math.cos((latRef * Math.PI) / 180));
  const seenT = new Set<string>();
  const trees: { p: Pt; key: string; forest: boolean; d: number }[] = [];
  const scatter = (polys: RawPolygon[], spacing: number, prob: number, tag: string, forest: boolean, ok?: (p: Pt) => boolean) => {
    const sLat = spacing * degLat;
    const sLon = spacing * degLon;
    for (const poly of polys) {
      if (!roughlyNear(poly.rings)) continue;
      const rings = poly.rings.map((rr) => rr.map(P.toM));
      const llb = bbox(poly.rings[0]);
      for (let gx = Math.floor(llb.x0 / sLon); gx <= Math.ceil(llb.x1 / sLon); gx++)
        for (let gy = Math.floor(llb.y0 / sLat); gy <= Math.ceil(llb.y1 / sLat); gy++) {
          const key = `${tag}:${gx}:${gy}`;
          if (seenT.has(key)) continue;
          const r = rngFrom('baum', key);
          if (r() > prob) continue;
          const p = P.toM([(gx + 0.1 + 0.8 * r()) * sLon, (gy + 0.1 + 0.8 * r()) * sLat]);
          if (!near(p) || !inPolygon(p, rings) || (ok && !ok(p))) continue;
          seenT.add(key);
          trees.push({ p, key, forest, d: Math.hypot(p[0], p[1]) });
        }
    }
  };
  scatter(input.forests, 9, 0.86, 'w', true, offPath);
  scatter(input.greens, 20, 0.45, 'g', false, freeSpot);
  scatter(input.meadows, 40, 0.22, 'm', false, freeSpot);
  scatter(input.residential, 21, 0.42, 'r', false, freeSpot);
  trees.sort((a, b) => a.d - b.d);
  if (trees.length > WORLD_LIMITS.trees) trees.length = WORLD_LIMITS.trees;
  for (const t of trees) {
    const r = rngFrom('form', t.key);
    const roll = r();
    const kind = roll < 0.1 ? 'dead' : roll < (t.forest ? 0.6 : 0.3) ? 'conifer' : 'leaf';
    plan.trees.push({ p: t.p, s: 0.8 + r() * 0.55, kind, color: kind === 'conifer' ? pick(r, CONIFER) : pick(r, LEAF), rot: r() * Math.PI * 2 });
  }

  // Entlang der Fahrbahnen: je Rasterzelle die Stelle, die einem Zufallspunkt am nächsten ist
  const alongRoads = (cellM: number, step: number, salt: string, chance: number, maxR: number, cb: (p: Pt, ang: number, key: string, r: Rng) => void) => {
    const best = new Map<string, { d: number; p: Pt; ang: number }>();
    for (const m of drivable)
      for (let i = 0; i < m.length - 1; i++) {
        const a = m[i];
        const b = m[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.5) continue;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let t = 0; t < len; t += step) {
          const p: Pt = [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len];
          if (p[0] * p[0] + p[1] * p[1] > maxR * maxR) continue;
          const ll = P.toLL(p);
          const gx = Math.floor(ll[0] / (cellM * degLon));
          const gy = Math.floor(ll[1] / (cellM * degLat));
          const key = `${gx}:${gy}`;
          const r = rngFrom(salt, key);
          if (r() > chance) continue;
          const target = P.toM([(gx + r()) * cellM * degLon, (gy + r()) * cellM * degLat]);
          const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
          const cur = best.get(key);
          if (!cur || d < cur.d) best.set(key, { d, p, ang });
        }
      }
    for (const [key, v] of best) cb(v.p, v.ang, key, rngFrom(salt + 'form', key));
  };
  const side = (p: Pt, ang: number, off: number): Pt => [p[0] - Math.sin(ang) * off, p[1] + Math.cos(ang) * off];
  const dist = (p: Pt) => Math.hypot(p[0], p[1]);

  // Autowracks
  alongRoads(70, 10, 'auto', 0.42, WORLD_LIMITS.carRadius, (p, ang, _key, r) => {
    const crashed = r() < 0.22;
    const off = crashed ? (r() - 0.5) * 2 : (r() < 0.5 ? -1 : 1) * (2.4 + r() * 0.9);
    const q = side(p, ang, off);
    if (inHouse(q)) return;
    const a = ang + (crashed ? (r() - 0.5) * 2.4 : (r() - 0.5) * 0.3) + (r() < 0.5 ? Math.PI : 0);
    const roll = r();
    plan.cars.push({ p: q, ang: a, kind: roll < 0.45 ? 'sportsCar' : roll < 0.8 ? 'pickup' : 'van', d: dist(q), seed: Math.floor(r() * 9973) });
  });

  // Laternen an größeren Straßen, abwechselnd links und rechts
  alongRoads(38, 6, 'laterne', 0.75, 300, (p, ang, _key, r) => {
    const s = r() < 0.5 ? -1 : 1;
    const q = side(p, ang, s * (4.6 + r() * 0.6));
    if (nearHouse(q, 0.8)) return;
    plan.lamps.push({ p: q, ang: ang + (s > 0 ? -Math.PI / 2 : Math.PI / 2), kind: 'streetLight', d: dist(q), seed: Math.floor(r() * 9973) });
  });

  // Kram am Straßenrand: kleine Gruppen
  const GROUPS: string[][] = [
    ['barrel', 'barrel'],
    ['trashBag', 'trashBags'],
    ['trashBags', 'trashBag', 'trashBag'],
    ['cone', 'cone', 'barrierDrum'],
    ['roadBarrier'],
    ['plasticBarrier', 'plasticBarrier'],
    ['tires'],
    ['pallet', 'palletBroken'],
    ['barrel', 'tires'],
    ['couch'],
    ['crate', 'pallet'],
    ['cinderBlock', 'cinderBlock', 'palletBroken'],
  ];
  alongRoads(24, 5, 'kram', 0.55, WORLD_LIMITS.propRadius, (p, ang, _key, r) => {
    const g = pick(r, GROUPS);
    const s = r() < 0.5 ? -1 : 1;
    const base = side(p, ang, s * (3.6 + r() * 1.2));
    g.forEach((kind, i) => {
      const along = (i - (g.length - 1) / 2) * (0.9 + r() * 0.5);
      const q: Pt = [base[0] + Math.cos(ang) * along + (r() - 0.5) * 0.4, base[1] + Math.sin(ang) * along + (r() - 0.5) * 0.4];
      if (inHouse(q)) return;
      // Absperrungen längs am Straßenrand, Sofas mit der Lehne zum Haus
      const turn = kind === 'roadBarrier' || kind === 'plasticBarrier' ? Math.PI / 2 : kind === 'couch' ? (s > 0 ? Math.PI : 0) : r() * Math.PI * 2;
      plan.props.push({ p: q, ang: ang + turn, kind, d: dist(q), seed: Math.floor(r() * 9973) });
    });
  });

  // Holzmasten (Dörfer, Vororte)
  alongRoads(45, 8, 'mast', 0.5, radiusM, (p, ang, _key, r) => {
    const q = side(p, ang, (r() < 0.5 ? -1 : 1) * (5.4 + r()));
    if (nearHouse(q, 0.6)) return;
    plan.poles.push({ p: q, ang, kind: 'pole', d: dist(q), seed: Math.floor(r() * 9973) });
  });

  const byDist = (a: PlanThing, b: PlanThing) => a.d - b.d;
  for (const [list, max] of [
    [plan.cars, WORLD_LIMITS.cars],
    [plan.props, WORLD_LIMITS.props],
    [plan.lamps, WORLD_LIMITS.lamps],
    [plan.poles, WORLD_LIMITS.poles],
  ] as const) {
    list.sort(byDist);
    if (list.length > max) list.length = max;
  }
  return plan;
}
