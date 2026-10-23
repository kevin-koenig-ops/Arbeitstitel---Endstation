// Balancing-Labor: Der Autopilot kämpft tausende Kämpfe und ganze Ausflüge.
// Aufruf: npm run balance (dauert etwa eine Minute). Ausgabe als Tabellen.
//
// Teil 1: Einzelkämpfe je Ausrüstungsstand und Gegnergruppe (volle Gesundheit).
// Teil 2: Ausflüge (eine Stunde draußen): mehrere Kämpfe hintereinander, Erholung,
//         Heilen mit Medizin, Medizin finden. Zeigt, ob Gesundheit und Medizin knapp sind.

import { ENEMY_WEIGHTS, GRID_KIND_WEIGHTS, HEAL_AMOUNT, HEALTH_REGEN_MIN, MAX_HEALTH, MIN_HEALTH_TO_FIGHT, NIGHT_ENEMY_WEIGHTS, NIGHT_GUARD_FACTOR, GUARD_CHANCE, GUARD_LOOT_FACTOR, REGIONS, SPOT_KINDS, WEAPONS, type CardId } from '../src/core/content';
import { autopilotFight, type AutopilotOptions } from '../src/core/autopilot';
import { encounter } from '../src/core/rules';
import { rngFrom, pickWeighted } from '../src/core/rng';
import { createTactics, type CardKit } from '../src/core/tactics';
import type { FoeKind, RegionId, SpotKind, WeaponId } from '../src/core/types';

const args = new Set(process.argv.slice(2));
const QUICK = args.has('--schnell');
const N_FIGHT = QUICK ? 150 : 400;
const N_TRIP = QUICK ? 300 : 1000;
/** Einmal-Karten: klug (Standard), nur im Notfall (--sparsam) oder nie (--ohne-tasche). */
const POUCH: AutopilotOptions['pouch'] = args.has('--ohne-tasche') ? 'never' : args.has('--sparsam') ? 'emergency' : 'smart';

interface Stage {
  name: string;
  weapons: WeaponId[];
  medicine: number;
  pouch: Partial<Record<CardId, number>>;
  skills: Partial<Record<CardId, number>>;
}

const STAGES: Stage[] = [
  { name: 'Tag 1', weapons: ['crowbar'], medicine: 0, pouch: {}, skills: {} },
  { name: 'Woche 1', weapons: ['crowbar', 'golfclub'], medicine: 2, pouch: { molotov: 2, pepper: 1 }, skills: { counter: 1, breath: 1 } },
  { name: 'Gut ausgerüstet', weapons: ['axe', 'crossbow'], medicine: 3, pouch: { molotov: 3, smoke: 2, grenade: 1 }, skills: { counter: 2, sweep: 1, steady: 1, secondwind: 1 } },
];
// Spielstile zum Vergleich (--stile): gleich starke Ausrüstung wie Woche 1 bzw. gut ausgerüstet
if (args.has('--stile')) {
  STAGES.length = 0;
  STAGES.push(
    { name: 'Woche 1', weapons: ['crowbar', 'golfclub'], medicine: 2, pouch: { molotov: 2, pepper: 1 }, skills: { counter: 1, breath: 1 } },
    { name: 'Woche 1 Fallen', weapons: ['pitchfork', 'golfclub'], medicine: 2, pouch: { tripwire: 2, alarm: 1 }, skills: { trapper: 1, distract: 1 } },
    { name: 'Woche 1 Feuer', weapons: ['crowbar', 'golfclub'], medicine: 2, pouch: { molotov: 2, tinder: 1 }, skills: { spark: 1, embers: 1 } },
    { name: 'Später Fallen', weapons: ['pitchfork', 'bow'], medicine: 3, pouch: { tripwire: 3, caltrops: 2, alarm: 1 }, skills: { trapper: 2, distract: 1, pitcher: 1, steady: 1 } },
    { name: 'Später Feuer', weapons: ['crowbar', 'crossbow'], medicine: 3, pouch: { molotov: 3, oilcan: 1, tinder: 2 }, skills: { spark: 2, embers: 1, wildfire: 1, counter: 1 } },
    { name: 'Woche 1 Schwung', weapons: ['machete', 'golfclub'], medicine: 2, pouch: { adrenaline: 1, molotov: 1 }, skills: { followup: 1, sweep: 1 } },
    { name: 'Später Schwung', weapons: ['sledgehammer', 'nailgun'], medicine: 3, pouch: { adrenaline: 2, grenade: 1 }, skills: { followup: 2, rage: 1, sweep: 1, counter: 1 } },
    { name: 'Woche 1 Schutz', weapons: ['lid', 'golfclub'], medicine: 2, pouch: { painkiller: 1, smoke: 1 }, skills: { headbutt: 1, cover: 1 } },
    { name: 'Woche 1 Tüftler', weapons: ['crowbar', 'golfclub'], medicine: 2, pouch: { fencer: 1, motionlamp: 1, boombox: 1 }, skills: { charger: 1, tinkerbox: 1 } },
    { name: 'Woche 1 Raubbau', weapons: ['pipewrench', 'golfclub'], medicine: 2, pouch: { tape: 1, lath: 1 }, skills: { fullforce: 1, toolroll: 1 } },
    { name: 'Woche 1 Kleinkram', weapons: ['crowbar', 'slingshot'], medicine: 2, pouch: { marblesack: 2 }, skills: { pockets: 1, pitcher: 1 } },
    { name: 'Woche 1 Ruhe/Wut', weapons: ['crowbar', 'golfclub'], medicine: 2, pouch: { pepper: 1, molotov: 1 }, skills: { breathe: 1, grit: 1 } },
    { name: 'Später Schutz', weapons: ['extinguisher', 'crossbow'], medicine: 3, pouch: { painkiller: 2, fireworks: 1 }, skills: { headbutt: 2, roll: 1, retaliate: 1, firstaid: 1 } },
  );
}

const GROUPS: FoeKind[][] = [
  ['walker'],
  ['walker', 'walker'],
  ['crawler', 'crawler'],
  ['crawler', 'walker'],
  ['walker', 'screamer'],
  ['walker', 'walker', 'screamer'],
  ['brute'],
  ['brute', 'walker'],
  ['watcher'],
];

const NAMES: Record<FoeKind, string> = { walker: 'Wandler', crawler: 'Kriecher', brute: 'Borkenmann', screamer: 'Heuler', watcher: 'Wächter' } as Record<FoeKind, string>;
const groupName = (g: FoeKind[]) => g.map((k) => NAMES[k]).join(' + ');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const f1 = (x: number) => x.toFixed(1).replace('.', ',');

function fight(stage: Stage, group: FoeKind[], seed: string, o: { hp: number; medicine: number; pouch: Partial<Record<CardId, number>>; opening?: 'surprise' | 'spotted' }, ap: AutopilotOptions) {
  const kit: CardKit = { pouch: o.pouch, skills: stage.skills, lastStand: false };
  const st = createTactics({
    seed,
    group,
    weapons: stage.weapons.map((k) => ({ kind: k, dur: WEAPONS[k].dur })),
    medicine: o.medicine,
    health: o.hp,
    maxHealth: MAX_HEALTH,
    opening: o.opening,
    kit,
  });
  autopilotFight(st, ap);
  return st;
}

// --- Teil 1: Einzelkämpfe ---------------------------------------------------------------

function table(head: string[], rows: string[][]) {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`| ${head.map(() => '---').join(' | ')} |`);
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
  console.log('');
}

console.log(`## Einzelkämpfe (volle Gesundheit, ${N_FIGHT} Kämpfe je Feld, ohne Fliehen)\n`);
console.log('Je Feld: Siege · Gesundheit verloren (Ø, von 10) · Runden (Ø)\n');
{
  const rows: string[][] = [];
  for (const g of GROUPS) {
    const row = [groupName(g)];
    for (const stage of STAGES) {
      let won = 0;
      let lost = 0;
      let rounds = 0;
      for (let i = 0; i < N_FIGHT; i++) {
        const st = fight(stage, g, `lab|${stage.name}|${g.join('-')}|${i}`, { hp: MAX_HEALTH, medicine: stage.medicine, pouch: { ...stage.pouch } }, { pouch: POUCH, fleeAt: null });
        if (st.over === 'won') won++;
        lost += MAX_HEALTH - st.hp;
        rounds += st.turn;
      }
      row.push(`${pct(won / N_FIGHT)} · −${f1(lost / N_FIGHT)} · ${f1(rounds / N_FIGHT)}`);
    }
    rows.push(row);
  }
  table(['Gegner', ...STAGES.map((s) => s.name)], rows);
}

// --- Teil 2: Ausflüge -------------------------------------------------------------------

/** Medizin pro Durchsuchen im Schnitt (70 % Raster-Fundstellen, 30 % echte Orte). */
function medicinePerSearch(): number {
  const mean = (k: SpotKind) => SPOT_KINDS[k].loot.filter((l) => l.res === 'medicine').reduce((n, l) => n + l.chance * ((l.min + l.max) / 2), 0);
  const gw = GRID_KIND_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  const grid = GRID_KIND_WEIGHTS.reduce((a, [k, w]) => a + mean(k) * w, 0) / gw;
  const pois: SpotKind[] = ['market', 'pharmacy', 'hardware', 'fuel'];
  const poi = pois.reduce((a, k) => a + mean(k), 0) / pois.length;
  return grid * 0.7 + poi * 0.3;
}
const MED_PER_SEARCH = medicinePerSearch();
const SEARCHES_PER_HOUR = 8;

interface TripResult {
  fights: number;
  defeated: boolean;
  fled: number;
  skipped: number;
  startHp: number[];
  medUsed: number;
  medFound: number;
  onceUsed: number;
}

function trip(stage: Stage, region: RegionId, night: boolean, seed: string): TripResult {
  const r = rngFrom(seed);
  const reg = REGIONS[region];
  const res: TripResult = { fights: 0, defeated: false, fled: 0, skipped: 0, startHp: [], medUsed: 0, medFound: 0, onceUsed: 0 };
  let hp = MAX_HEALTH;
  let med = stage.medicine;
  const pouch = { ...stage.pouch };
  // Ereignisse über die Stunde: Durchsuchen und Trupps
  const events: { t: number; kind: 'search' | 'patrol' }[] = [];
  for (let i = 0; i < SEARCHES_PER_HOUR; i++) events.push({ t: r() * 60, kind: 'search' });
  const patrols = reg.patrolChance * 1.5;
  for (let i = 0; i < Math.floor(patrols) + (r() < patrols % 1 ? 1 : 0); i++) events.push({ t: r() * 60, kind: 'patrol' });
  events.sort((a, b) => a.t - b.t);
  let lastT = 0;
  let regenAcc = 0;
  for (const e of events) {
    regenAcc += e.t - lastT;
    lastT = e.t;
    while (regenAcc >= HEALTH_REGEN_MIN) {
      regenAcc -= HEALTH_REGEN_MIN;
      hp = Math.min(MAX_HEALTH, hp + 1);
    }
    // Draußen heilen, wenn es knapp wird
    while (hp <= 5 && med > 0) {
      hp = Math.min(MAX_HEALTH, hp + HEAL_AMOUNT);
      med--;
      res.medUsed++;
    }
    let group: FoeKind[] | null = null;
    let opening: 'surprise' | 'spotted' | undefined;
    let guarded = false;
    if (e.kind === 'search') {
      const poi = r() < 0.3;
      const chance = Math.min(0.75, (poi ? GUARD_CHANCE.poi : GUARD_CHANCE.grid) * (night ? NIGHT_GUARD_FACTOR : 1));
      if (r() < chance) {
        const enemy = pickWeighted(r, night ? NIGHT_ENEMY_WEIGHTS : ENEMY_WEIGHTS);
        group = encounter(seed, 'lab', { id: `${seed}:${e.t}`, kind: 'car', source: poi ? 'poi' : 'grid', pos: { lat: 0, lon: 0 }, name: '' }, Math.floor(e.t), enemy, night);
        guarded = true;
      }
    } else {
      group = pickWeighted(r, reg.groups as unknown as (readonly [FoeKind[], number])[]);
      opening = r() < 0.5 ? 'surprise' : 'spotted';
    }
    if (group) {
      if (hp < MIN_HEALTH_TO_FIGHT) {
        res.skipped++;
        continue;
      }
      res.fights++;
      res.startHp.push(hp);
      const st = fight(stage, group, `${seed}|${e.t}`, { hp, medicine: med, pouch, opening }, { pouch: POUCH, fleeAt: 5 });
      med -= st.usedMedicine;
      res.medUsed += st.usedMedicine;
      for (const [k, n] of Object.entries(st.used) as [CardId, number][]) {
        pouch[k] = Math.max(0, (pouch[k] ?? 0) - n);
        res.onceUsed += n;
      }
      hp = st.hp;
      if (st.over === 'lost') {
        res.defeated = true;
        return res;
      }
      if (st.over === 'fled') {
        res.fled++;
        continue;
      }
    }
    // Beute: Medizin (bewachte Fundstellen bringen mehr)
    if (e.kind === 'search') {
      const m = MED_PER_SEARCH * (guarded ? GUARD_LOOT_FACTOR : 1);
      const got = Math.floor(m) + (r() < m % 1 ? 1 : 0);
      med += got;
      res.medFound += got;
    }
  }
  return res;
}

console.log(`## Ausflüge (eine Stunde, ${SEARCHES_PER_HOUR}× durchsuchen, ${N_TRIP} Ausflüge je Feld, Flucht in Lebensgefahr ab 5 Gesundheit)\n`);
console.log(`Medizin pro Durchsuchen im Schnitt: ${MED_PER_SEARCH.toFixed(2).replace('.', ',')}\n`);
{
  const rows: string[][] = [];
  const cases: [RegionId, boolean][] = [
    ['village', false],
    ['town', false],
    ['city', false],
    ['wild', false],
    ['town', true],
  ];
  for (const stage of STAGES) {
    for (const [region, night] of cases) {
      let fights = 0;
      let defeats = 0;
      let fled = 0;
      let skipped = 0;
      let hpSum = 0;
      let hpN = 0;
      let medUsed = 0;
      let medFound = 0;
      let once = 0;
      for (let i = 0; i < N_TRIP; i++) {
        const t = trip(stage, region, night, `trip|${stage.name}|${region}|${night}|${i}`);
        fights += t.fights;
        defeats += t.defeated ? 1 : 0;
        fled += t.fled;
        skipped += t.skipped;
        hpSum += t.startHp.reduce((a, b) => a + b, 0);
        hpN += t.startHp.length;
        medUsed += t.medUsed;
        medFound += t.medFound;
        once += t.onceUsed;
      }
      rows.push([
        stage.name,
        `${REGIONS[region].name}${night ? ', nachts' : ''}`,
        f1(fights / N_TRIP),
        pct(defeats / N_TRIP),
        f1(fled / N_TRIP),
        f1(skipped / N_TRIP),
        f1(hpN ? hpSum / hpN : 0),
        f1(medUsed / N_TRIP),
        f1(medFound / N_TRIP),
        f1(once / N_TRIP),
      ]);
    }
  }
  table(['Stand', 'Gegend', 'Kämpfe', 'Niederlage', 'Fluchten', 'Zu schwach', 'Gesundheit vor Kampf', 'Medizin verbraucht', 'Medizin gefunden', 'Einmal-Karten'], rows);
}
