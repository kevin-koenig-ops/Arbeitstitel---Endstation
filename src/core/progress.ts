// Fortschritt: die Zielleiste (immer ein paar nächste Ziele mit kleiner Belohnung)
// und der Streifer-Ruf (ein Rang aus allem, was du draußen schaffst).
// Alles wird aus dem Spielstand berechnet. Gespeichert wird nur, welche Ziele abgeholt sind.

import { COMFORT_TIERS, plotComfort, type BlueprintId } from './building';
import { RANK_POINTS, RANKS } from './content';
import { activePlot, comfort, hasWorkbench } from './rules';
import type { GoalId, Inventory, PlayerState } from './types';

export interface GoalDef {
  id: GoalId;
  title: string;
  /** Wie man es schafft (kurz). */
  hint: string;
  progress: (s: PlayerState) => { have: number; need: number };
  reward: Partial<Inventory>;
  blueprint?: BlueprintId;
}

const count = (o: object) => Object.keys(o).length;
const sectorsAt = (s: PlayerState, level: number) => Object.values(s.sectors).filter((l) => l >= level).length;
const items = (s: PlayerState) => activePlot(s)?.items ?? [];
const tierGoal = (id: GoalId, tier: number, reward: Partial<Inventory>, blueprint?: BlueprintId): GoalDef => ({
  id,
  title: `Erreiche die Stufe „${COMFORT_TIERS[tier][1]}“`,
  hint: 'Möbel, Sammelstücke und Räume mit Dach machen dein Zuhause gemütlicher.',
  progress: (s) => ({ have: Math.min(comfort(s), COMFORT_TIERS[tier][0]), need: COMFORT_TIERS[tier][0] }),
  reward,
  blueprint,
});

/** In dieser Reihenfolge erscheinen die Ziele. Die ersten führen durch den Einstieg. */
export const GOALS: GoalDef[] = [
  { id: 'search3', title: 'Durchsuche 3 Fundstellen', hint: 'Geh zu einem leuchtenden Punkt auf der Karte und tippe ihn an.', progress: (s) => ({ have: Math.min(3, s.stats.searches), need: 3 }), reward: { food: 1, water: 1 } },
  { id: 'site', title: 'Richte dein Zuhause ein', hint: 'Tippe unten links auf das Haus. Es entsteht dort, wo du gerade bist.', progress: (s) => ({ have: s.base.active ? 1 : 0, need: 1 }), reward: { wood: 3, metal: 2 } },
  { id: 'unpack', title: 'Pack zu Hause deinen Rucksack aus', hint: 'Zu Hause leuchtet „Rucksack auspacken“. Dann liegt alles sicher im Lager.', progress: (s) => ({ have: Math.min(1, s.stats.unpacks), need: 1 }), reward: { screws: 2 } },
  { id: 'clear3', title: 'Räume 3 Hindernisse weg', hint: 'Schutt, Wracks und Gestrüpp auf deinem Gelände antippen. Darin steckt Material.', progress: (s) => ({ have: Math.min(3, activePlot(s)?.cleared.length ?? 0), need: 3 }), reward: { stone: 2, wood: 2 } },
  { id: 'workbench', title: 'Stell einen Werktisch auf', hint: 'Bauen, Einrichten, Werktisch.', progress: (s) => ({ have: hasWorkbench(s) ? 1 : 0, need: 1 }), reward: { metal: 2, screws: 2 } },
  { id: 'dismantle', title: 'Zerlege Kram am Werktisch', hint: 'Kram aus dem Lager auf den Werktisch legen und Fertiges abholen.', progress: (s) => ({ have: Math.min(1, s.stats.dismantled), need: 1 }), reward: { electronics: 1, glue: 1 } },
  { id: 'room', title: 'Bau einen Raum mit Dach', hint: 'Wände rundherum, dann ein Dach darüber. Räume zählen extra für die Gemütlichkeit.', progress: (s) => { const p = activePlot(s); return { have: p && plotComfort(p).rooms > 0 ? 1 : 0, need: 1 }; }, reward: { glass: 2 }, blueprint: 'lamp' },
  tierGoal('tier1', 1, { cloth: 3 }),
  { id: 'collectible', title: 'Finde ein Sammelstück', hint: 'Teddys, Uhren, Gitarren … Jedes gibt es nur einmal. Paketschränke und Schuppen sind gute Orte.', progress: (s) => ({ have: Math.min(1, count(s.collectibles)), need: 1 }), reward: { plastic: 2 } },
  { id: 'win', title: 'Gewinne einen Kampf', hint: 'Bewachte Fundstellen haben einen roten Rand. Wer gewinnt, findet mehr.', progress: (s) => ({ have: Math.min(1, s.stats.kills), need: 1 }), reward: { medicine: 1 } },
  { id: 'sector', title: 'Erkunde einen Sektor', hint: 'Lauf herum: Der Nebel weicht, der Sektor oben links füllt sich.', progress: (s) => ({ have: Math.min(1, sectorsAt(s, 1)), need: 1 }), reward: { wood: 3, stone: 2 }, blueprint: 'radioSet' },
  { id: 'barrel', title: 'Stell eine Regentonne auf', hint: 'Sie sammelt von selbst Wasser, du holst es ab.', progress: (s) => ({ have: items(s).some((i) => i.kind === 'rainBarrel') ? 1 : 0, need: 1 }), reward: { plastic: 2, metal: 1 } },
  tierGoal('tier2', 2, { glass: 2, screws: 2 }, 'stove'),
  { id: 'weapon', title: 'Bau eine Waffe am Werktisch', hint: 'Werktisch öffnen, „Waffen bauen“.', progress: (s) => ({ have: Math.min(1, s.stats.crafted), need: 1 }), reward: { metal: 3 } },
  { id: 'cook', title: 'Koch einen Eintopf', hint: 'Holzofen zu Hause antippen. Macht satt: 3 Stunden mehr Beute.', progress: (s) => ({ have: Math.min(1, s.stats.cooked), need: 1 }), reward: { food: 2, water: 2 } },
  { id: 'set', title: 'Vervollständige ein Set im Fundbuch', hint: 'Das Fundbuch im Rucksack zeigt, was noch fehlt und wo es liegen könnte.', progress: (s) => ({ have: Math.min(1, count(s.sets)), need: 1 }), reward: { electronics: 2 } },
  { id: 'cache', title: 'Grab ein Versteck aus', hint: 'Hinweise findest du beim Durchsuchen oder per Funkgerät. Dann im Suchkreis nach „warm“ und „heiß“ gehen.', progress: (s) => ({ have: Math.min(1, s.stats.caches), need: 1 }), reward: { electronics: 1, screws: 2 } },
  tierGoal('tier3', 3, { glue: 2, glass: 2 }, 'brickWall'),
  { id: 'upgrade', title: 'Rüste den Werktisch auf', hint: 'Im Werktisch ganz unten: Aufrüsten.', progress: (s) => ({ have: Math.min(2, s.workshop.level), need: 2 }), reward: { screws: 3, electronics: 1 }, blueprint: 'solarPanel' },
  { id: 'secure', title: 'Sichere einen Sektor', hint: 'Einen Sektor fast ganz ablaufen.', progress: (s) => ({ have: Math.min(1, sectorsAt(s, 2)), need: 1 }), reward: { medicine: 2 }, blueprint: 'medCabinet' },
  tierGoal('tier4', 4, { cloth: 4, glass: 3 }, 'fairyLights'),
  { id: 'collect6', title: 'Finde 6 Sammelstücke', hint: 'Je seltener der Ort, desto besser die Chance.', progress: (s) => ({ have: Math.min(6, count(s.collectibles)), need: 6 }), reward: { electronics: 2, glue: 2 } },
  { id: 'crossbow', title: 'Bau die Armbrust', hint: 'Braucht den Werktisch auf Stufe 2.', progress: (s) => ({ have: s.weapons.some((w) => w.kind === 'crossbow') ? 1 : 0, need: 1 }), reward: { metal: 4, screws: 3 } },
  tierGoal('tier5', 5, { glass: 4, electronics: 3 }),
  { id: 'allSets', title: 'Vervollständige alle Sets', hint: 'Alle 13 Sammelstücke finden.', progress: (s) => ({ have: count(s.sets), need: 4 }), reward: { electronics: 4, glue: 4 } },
  tierGoal('tier6', 6, { wood: 10, metal: 10, glass: 5, electronics: 5 }),
];

export function goalDone(s: PlayerState, g: GoalDef): boolean {
  const p = g.progress(s);
  return p.have >= p.need;
}

/** Was die Zielleiste zeigt: erst alles zum Abholen, dann die nächsten offenen (zusammen höchstens n). */
export function visibleGoals(s: PlayerState, n = 3): { goal: GoalDef; done: boolean; have: number; need: number }[] {
  const open = GOALS.filter((g) => !s.goals[g.id]).map((g) => ({ goal: g, ...g.progress(s) })).map((x) => ({ ...x, done: x.have >= x.need }));
  const ready = open.filter((x) => x.done);
  const rest = open.filter((x) => !x.done);
  return [...ready, ...rest].slice(0, Math.max(n, ready.length));
}

/** Wie viele Ziele gerade abgeholt werden können. */
export function claimableGoals(s: PlayerState): number {
  return GOALS.filter((g) => !s.goals[g.id] && goalDone(s, g)).length;
}

// --- Streifer-Ruf ------------------------------------------------------------------

export function rankPoints(s: PlayerState): number {
  const P = RANK_POINTS;
  return (
    s.stats.searches * P.search +
    s.stats.kills * P.kill +
    sectorsAt(s, 1) * P.sector +
    sectorsAt(s, 2) * P.secured +
    count(s.collectibles) * P.collectible +
    count(s.sets) * P.set +
    count(s.collection) * P.memento +
    s.stats.caches * P.cache
  );
}

export function rankOf(s: PlayerState): { points: number; index: number; name: string; next: { name: string; min: number } | null; from: number } {
  const points = rankPoints(s);
  let index = 0;
  RANKS.forEach((r, i) => {
    if (points >= r.min) index = i;
  });
  const next = RANKS[index + 1] ?? null;
  return { points, index, name: RANKS[index].name, next, from: RANKS[index].min };
}
