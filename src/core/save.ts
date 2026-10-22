// Spielstände tragen eine Schema-Version. Ändert sich das Format, kommt hier eine
// Migration dazu, damit alte Spielstände weiter funktionieren (auch beim späteren
// Umzug vom Gerät in ein Konto).

import { cellIndex, PLOT, SECTION, sectionObstacles, START_SECTIONS, type SiteId } from './building';
import { COLLECTIBLES, KRAM, MAX_HEALTH, RESOURCE_ORDER, START_WEAPONS } from './content';
import { FURNITURE, type FurnitureId } from './furniture';
import { checkSets, SCHEMA_VERSION, startGear } from './rules';
import type { PlayerState } from './types';

type Raw = Record<string, unknown> & { schema?: number };

const MIGRATIONS: Record<number, (s: Raw) => void> = {
  // Version 12 -> 13: Ausrüstung am Körper. Alle bekommen die Startausrüstung, angezogen.
  12: (s) => {
    s.gear = startGear(Number(s.lastActiveAt) || 0);
  },
  // Version 11 -> 12: neue Bauteile wie bei Fallout (Gummi, Federn, Kupfer …), anfangs 0
  11: (s) => {
    const inv = (s.inventory ?? {}) as Record<string, number>;
    for (const r of RESOURCE_ORDER) inv[r] = inv[r] ?? 0;
    s.inventory = inv;
  },
  // Version 10 -> 11: Fundbuch der Ortstypen, entdeckte besondere Orte.
  10: (s) => {
    s.places = {};
    s.discovered = {};
  },
  // Version 9 -> 10: Begegnungen im Unterholz (Abkühlzeit).
  9: (s) => {
    s.wildAt = 0;
  },
  // Version 1 -> 2: Kampf kam dazu (Gesundheit, Waffen, laufender Kampf, Statistik)
  1: (s) => {
    s.health = MAX_HEALTH;
    s.healthAt = s.lastActiveAt;
    s.weapons = START_WEAPONS.map((w) => ({ ...w }));
    s.combat = null;
    s.stats = { kills: 0, ...(s.stats as object) };
  },
  // Version 2 -> 3: Erkundung (Kartennebel) kam dazu
  2: (s) => {
    s.explored = {};
    s.sectors = {};
  },
  // Version 3 -> 4: Basisbau (Zuhause, früher „Endstation“) und Baupläne
  3: (s) => {
    s.base = { items: [], rubble: [], nextUid: 1 };
    s.blueprints = {};
  },
  // Version 4 -> 5: großes Gelände, freies Bauen, Schauplätze.
  // Die alte Wartehalle gibt es nicht mehr: aufgestellte Möbel gehen als Material zurück.
  4: (s) => {
    const old = s.base as { items?: { kind: string }[] } | undefined;
    const inv = s.inventory as Record<string, number>;
    for (const it of old?.items ?? []) {
      const def = FURNITURE[it.kind as FurnitureId];
      if (!def) continue;
      for (const [k, v] of Object.entries(def.cost)) inv[k] = (inv[k] ?? 0) + (v ?? 0);
    }
    s.base = { active: null, plots: {}, found: {} };
  },
  // Version 5 -> 6: „Material“ wird zu echten Rohstoffen (Holz, Metall, …),
  // dazu Fundstücke und der Werktisch. Altes Material wird halb Holz, halb Metall.
  5: (s) => {
    const inv = s.inventory as Record<string, number>;
    const m = Math.max(0, inv.material ?? 0);
    delete inv.material;
    for (const r of RESOURCE_ORDER) inv[r] = Math.max(0, inv[r] ?? 0);
    inv.wood += Math.ceil(m / 2);
    inv.metal += Math.floor(m / 2);
    s.junk = {};
    s.workshop = { level: 1, jobs: [] };
  },
  // Version 8 -> 9: Fortschritt (Zielleiste, mehr Zähler), Wühlen, Erstfunde, Verstecke.
  8: (s) => {
    const st = (s.stats ?? {}) as Record<string, number>;
    s.stats = { searches: st.searches ?? 0, kills: st.kills ?? 0, unpacks: st.unpacks ?? 0, dismantled: st.dismantled ?? 0, crafted: st.crafted ?? 0, caches: 0, cooked: 0 };
    s.goals = {};
    // Kampf jetzt mit Gruppe (rundenbasiert); laufendes Wühlen gibt es noch nicht
    const c = s.combat as { spot?: unknown; enemy?: string; window?: number } | null | undefined;
    s.combat = c && c.spot && c.enemy ? { spot: c.spot, enemy: c.enemy, group: [c.enemy], window: c.window ?? 0 } : null;
    s.dig = null;
    s.seen = [];
    s.caches = [];
    s.radioAt = 0;
    s.fedUntil = 0;
    // Der Sanitätsschrank erzeugt jetzt Medizin: ab jetzt zählen
    const now9 = Number(s.lastActiveAt) || 0;
    const plots9 = (s.base as { plots?: Record<string, { items: { kind: string; at?: number }[] }> } | undefined)?.plots ?? {};
    for (const plot of Object.values(plots9)) for (const it of plot.items) if (it.kind === 'medCabinet' && it.at === undefined) it.at = now9;
  },
  // Version 7 -> 8: Der Bus fällt weg (Ausbauten kommen als Rohstoffe zurück), Rucksack und Lager
  // werden getrennt, Fundstücke werden zu Kram (zerlegen) und Sammelstücken (einmalig, fürs Fundbuch).
  7: (s) => {
    const now = Number(s.lastActiveAt) || 0;
    const inv = s.inventory as Record<string, number>;
    const add = (items: Record<string, number> | undefined, f = 1) => {
      for (const [k, v] of Object.entries(items ?? {})) inv[k] = (inv[k] ?? 0) + v * f;
    };
    // Bus
    const bus = s.bus as { modules?: Record<string, { lastHarvestAt?: number }> } | undefined;
    for (const [id, m] of Object.entries(bus?.modules ?? {})) {
      add(OLD_MODULE_COST[id]);
      const prod = OLD_PRODUCTION[id];
      if (prod && m) add({ [prod.res]: Math.min(prod.cap, Math.floor((now - (m.lastHarvestAt ?? now)) / (prod.everyH * 3600_000))) });
    }
    delete s.bus;
    // Fundstücke aufteilen
    const kram: Record<string, number> = {};
    const found: Record<string, number> = {};
    for (const [id, n] of Object.entries((s.junk ?? {}) as Record<string, number>)) {
      if (id in KRAM) kram[id] = (kram[id] ?? 0) + n;
      else if (id in COLLECTIBLES) {
        found[id] = now;
        add(LEGACY_PARTS[id], n - 1);
      }
    }
    delete s.junk;
    // Aufgestellter Kram kommt ins Lager, aufgestellte Sammelstücke gelten als gefunden (doppelte werden zu Rohstoffen)
    const placed = new Set<string>();
    const base = s.base as { plots?: Record<string, { items: { kind: string; at?: number }[] }> };
    for (const plot of Object.values(base?.plots ?? {})) {
      plot.items = plot.items.filter((it) => {
        if (it.kind in KRAM) {
          kram[it.kind] = (kram[it.kind] ?? 0) + 1;
          return false;
        }
        if (it.kind in COLLECTIBLES) {
          found[it.kind] ??= now;
          if (placed.has(it.kind)) {
            add(LEGACY_PARTS[it.kind]);
            return false;
          }
          placed.add(it.kind);
        }
        // Anlagen laufen ab jetzt
        if (FURNITURE[it.kind as FurnitureId]?.produces) it.at = now;
        return true;
      });
    }
    // Werktisch: Kram bleibt in Arbeit, Sammelstücke werden gleich zu Rohstoffen
    const ws = s.workshop as { jobs?: { junk?: string; kram?: string; endsAt: number }[] } | undefined;
    if (ws?.jobs)
      ws.jobs = ws.jobs.flatMap((j) => {
        const id = j.kram ?? j.junk ?? '';
        if (id in KRAM) return [{ kram: id, endsAt: j.endsAt }];
        add(LEGACY_PARTS[id]);
        return [];
      });
    s.kram = kram;
    s.collectibles = found;
    s.sets = {};
    s.pack = {};
    s.packKram = {};
    checkSets(s as unknown as PlayerState, now);
  },
  // Version 6 -> 7: Das Gelände ist doppelt so groß (72 × 72 m statt 36 × 36 m, Abschnitte 12 m).
  // Alles Gebaute rückt in die Mitte, frei Gewesenes bleibt frei und aufgeräumt.
  6: (s) => {
    const base = s.base as { plots: Record<string, OldPlot> };
    for (const [site, plot] of Object.entries(base.plots ?? {})) base.plots[site] = growPlot(String(s.playerId), site as SiteId, plot);
  },
};

interface OldPlot {
  sections: string[];
  cleared: string[];
  walls: Record<string, unknown>;
  floors: Record<string, unknown>;
  roofs: Record<string, unknown>;
  items: { x: number; y: number }[];
  nextUid: number;
}

/** Altes 36-m-Gelände in die Mitte des neuen 72-m-Geländes setzen. */
function growPlot(seed: string, site: SiteId, old: OldPlot): OldPlot {
  const OLD_SECTION = 6;
  const shift = (PLOT - 36) / 2;
  const moveKey = (k: string) => {
    const m = /^([hv]?)(\d+),(\d+)$/.exec(k);
    if (!m) return k;
    return `${m[1]}${Number(m[2]) + shift},${Number(m[3]) + shift}`;
  };
  const moveMap = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec ?? {}).map(([k, v]) => [moveKey(k), v]));
  // Welche Felder waren schon frei?
  const wasFree = new Uint8Array(PLOT * PLOT);
  const sections = new Set(START_SECTIONS);
  for (const key of old.sections ?? []) {
    const [sx, sy] = key.split(',').map(Number);
    for (let y = sy * OLD_SECTION; y < (sy + 1) * OLD_SECTION; y++) for (let x = sx * OLD_SECTION; x < (sx + 1) * OLD_SECTION; x++) wasFree[cellIndex(x + shift, y + shift)] = 1;
    sections.add(`${Math.floor((sx * OLD_SECTION + shift) / SECTION)},${Math.floor((sy * OLD_SECTION + shift) / SECTION)}`);
  }
  // Hindernisse dort, wo schon frei war, gelten als weggeräumt (sonst lägen sie unter Gebautem)
  const cleared: string[] = [];
  for (const key of sections) {
    const [sx, sy] = key.split(',').map(Number);
    for (const o of sectionObstacles(seed, site, sx, sy)) {
      let hit = false;
      for (let y = o.y; y < o.y + o.d && !hit; y++) for (let x = o.x; x < o.x + o.w; x++) if (wasFree[cellIndex(x, y)]) hit = true;
      if (hit) cleared.push(o.id);
    }
  }
  return {
    sections: [...sections],
    cleared,
    walls: moveMap(old.walls),
    floors: moveMap(old.floors),
    roofs: moveMap(old.roofs),
    items: (old.items ?? []).map((it) => ({ ...it, x: it.x + shift, y: it.y + shift })),
    nextUid: old.nextUid ?? 1,
  };
}

export function migrate(raw: unknown): PlayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Raw;
  if (typeof s.schema !== 'number' || !s.playerId || !s.character) return null;
  while (s.schema < SCHEMA_VERSION) {
    const step = MIGRATIONS[s.schema];
    if (!step) return null;
    step(s);
    s.schema += 1;
  }
  if (s.schema !== SCHEMA_VERSION) return null;
  return s as unknown as PlayerState;
}

/** Kosten der alten Bus-Ausbauten (zum Zurückgeben beim Umzug in Version 8). */
const OLD_MODULE_COST: Record<string, Record<string, number>> = {
  rainBarrel: { metal: 3, plastic: 2 },
  workbench: { wood: 6, metal: 4, screws: 2 },
  roofGarden: { wood: 6, plastic: 2, water: 4 },
  medBay: { wood: 4, cloth: 3, glass: 1, medicine: 3 },
  radio: { metal: 6, electronics: 3, plastic: 2 },
};
const OLD_PRODUCTION: Record<string, { res: string; everyH: number; cap: number }> = {
  rainBarrel: { res: 'water', everyH: 3, cap: 6 },
  roofGarden: { res: 'food', everyH: 4, cap: 6 },
};
/** Was frühere Fundstücke (jetzt Sammelstücke) beim Zerlegen gebracht hätten. */
const LEGACY_PARTS: Record<string, Record<string, number>> = {
  teddy: { cloth: 2, plastic: 1 },
  wallClock: { wood: 1, glass: 1, screws: 1 },
  tv: { glass: 2, electronics: 2, plastic: 1, screws: 1 },
  phone: { plastic: 2, electronics: 1 },
  typewriter: { metal: 3, screws: 2 },
  guitar: { wood: 2, metal: 1, glue: 1 },
  globe: { plastic: 1, metal: 1, glue: 1 },
  vase: { glass: 2 },
  mirror: { glass: 2, wood: 1 },
  bike: { metal: 3, plastic: 1, screws: 1 },
  rubberDuck: { plastic: 1 },
  painting: { wood: 1, cloth: 1, glue: 1 },
  sewingMachine: { metal: 2, screws: 2, wood: 1 },
};
