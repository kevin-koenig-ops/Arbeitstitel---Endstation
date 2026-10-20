// Kampfbildschirm: Runden mit Aktion + kurzem Timing-Moment.
//
// Ablauf pro Runde: Aktion wählen -> (Timing-Balken) -> Ergebnis anzeigen -> nächste Runde.
// Die Oberfläche entscheidet nichts selbst: Sie schickt { move, quality } an das
// Backend, die Spielregeln rechnen Schaden und Ausgang aus.

import { ENEMIES, MAX_HEALTH, RESOURCE_ORDER, RESOURCES, WEAPONS } from '../../core/content';
import { bestWeapon } from '../../core/rules';
import type { CombatMove, EnemyId, GameEvent, Inventory, Quality, Spot } from '../../core/types';
import type { App } from '../app';
import { avatarSvg } from '../avatar';
import { clear, h, sleep, svgEl } from '../dom';
import { icon, resIcon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { timingFactor } from './ambience';
import { enemySvg } from '../zombies';

type LootEvent = Extract<GameEvent, { type: 'loot' }>;

export interface CombatEnd {
  outcome: 'won' | 'lost' | 'fled';
  spot: Spot;
  enemy: EnemyId;
  loot?: LootEvent;
  dropped?: Partial<Inventory>;
}

const MOVES: { move: CombatMove; label: string; hint: string; timing: boolean }[] = [
  { move: 'strike', label: 'Zuschlagen', hint: 'Schaden mit deiner Waffe', timing: true },
  { move: 'dodge', label: 'Ausweichen', hint: 'Kein Treffer, gut getimt öffnet er sich', timing: true },
  { move: 'distract', label: 'Ablenken', hint: '1 Material werfen, er greift nicht an', timing: true },
  { move: 'heal', label: 'Verbinden', hint: '1 Medizin, +3 Gesundheit', timing: false },
];

const vibrate = (app: App, pattern: number | number[]) => {
  if (!app.settings.get().vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* nicht unterstützt */
  }
};

export function openCombat(app: App, host: HTMLElement, onEnd: (end: CombatEnd) => void): HTMLElement {
  const start = app.backend.current()!.combat!;
  const enemy = start.enemy;
  const def = ENEMIES[enemy];
  const spot = start.spot;

  const art = h('div', { class: 'enemy' }, svgEl(enemySvg(enemy)));
  const enemyBar = h('div', { class: 'hp-bar enemy-hp' });
  const log = h('div', { class: 'combat-log', 'aria-live': 'polite' });
  const panel = h('div', { class: 'combat-panel' });
  const meBar = h('div', { class: 'hp-bar me-hp' });
  const weaponChip = h('div', { class: 'weapon-chip' });
  const flash = h('div', { class: 'combat-flash' });

  const el = h(
    'div',
    { class: 'overlay combat', role: 'dialog', 'aria-label': `Kampf gegen ${def.name}` },
    flash,
    h(
      'div',
      { class: 'combat-inner' },
      h('header', { class: 'combat-head' }, h('div', { class: 'combat-title' }, def.name), h('div', { class: 'combat-sub' }, def.desc), h('div', { class: 'combat-place' }, spot.name)),
      h('div', { class: 'combat-stage' }, art, enemyBar),
      log,
      panel,
      h(
        'footer',
        { class: 'combat-me' },
        svgEl(avatarSvg(app.backend.current()!.character.look, 40), 'combat-face'),
        h('div', { class: 'combat-me-main' }, meBar, weaponChip),
      ),
    ),
  );

  const bar = (target: HTMLElement, value: number, max: number) => {
    clear(target);
    for (let i = 0; i < max; i++) target.append(h('span', { class: i < value ? 'on' : '' }));
    target.setAttribute('aria-label', `${value} von ${max}`);
  };

  const renderStatus = () => {
    const s = app.backend.current()!;
    bar(enemyBar, s.combat?.enemyHp ?? 0, def.hp);
    bar(meBar, s.health, MAX_HEALTH);
    const w = bestWeapon(s);
    clear(weaponChip);
    weaponChip.append(svgEl(icon('wrench', 14)), w ? `${WEAPONS[w.kind].name} · noch ${w.dur} Schläge` : 'Fäuste');
  };

  const say = (text: string, tone: 'neutral' | 'good' | 'bad' = 'neutral') => {
    log.textContent = text;
    log.dataset.tone = tone;
  };

  // --- Aktionen wählen -------------------------------------------------------------
  const choose = () => {
    const s = app.backend.current()!;
    clear(panel);
    panel.append(
      h(
        'div',
        { class: 'moves' },
        MOVES.map((m) => {
          const disabled = (m.move === 'heal' && s.inventory.medicine < 1) || (m.move === 'distract' && s.inventory.material < 1);
          return h(
            'button',
            { class: 'move', type: 'button', disabled, onclick: () => act(m.move, m.timing) },
            h('span', { class: 'move-label' }, m.label),
            h('span', { class: 'move-hint' }, m.hint),
          );
        }),
      ),
      h('button', { class: 'btn ghost small flee', type: 'button', onclick: () => act('flee', false) }, 'Fliehen'),
    );
  };

  // --- Timing-Balken -----------------------------------------------------------------
  const timing = (label: string): Promise<Quality> =>
    new Promise((resolve) => {
      clear(panel);
      const goodW = 0.26;
      const perfectW = 0.08;
      const zoneStart = 0.12 + Math.random() * (0.88 - goodW - 0.12);
      const needle = h('div', { class: 'needle' });
      const zone = h('div', { class: 'zone', style: `left:${zoneStart * 100}%;width:${goodW * 100}%` }, h('div', { class: 'zone-perfect', style: `left:${((goodW - perfectW) / 2 / goodW) * 100}%;width:${(perfectW / goodW) * 100}%` }));
      const track = h('div', { class: 'track' }, zone, needle);
      let pos = 0;
      let dir = 1;
      let last = performance.now();
      let raf = 0;
      let done = false;
      const speed = 0.85 * def.speed * timingFactor(); // Balkenlängen pro Sekunde
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        clearTimeout(timeout);
        const center = zoneStart + goodW / 2;
        const q: Quality = Math.abs(pos - center) <= perfectW / 2 ? 'perfect' : pos >= zoneStart && pos <= zoneStart + goodW ? 'good' : 'miss';
        needle.classList.add('stopped', `q-${q}`);
        setTimeout(() => resolve(q), 260);
      };
      const step = (t: number) => {
        pos += ((t - last) / 1000) * speed * dir;
        last = t;
        if (pos >= 1) (pos = 1), (dir = -1);
        if (pos <= 0) (pos = 0), (dir = 1);
        needle.style.left = `${pos * 100}%`;
        raf = requestAnimationFrame(step);
      };
      const timeout = window.setTimeout(finish, 3800);
      raf = requestAnimationFrame(step);
      panel.append(
        h('div', { class: 'timing-label' }, label),
        h('div', { class: 'timing', onpointerdown: finish }, track),
        h('button', { class: 'btn wide now', type: 'button', onclick: finish }, 'Jetzt!'),
      );
    });

  // --- Eine Runde ----------------------------------------------------------------------
  let busy = false;
  const act = async (move: CombatMove, needsTiming: boolean) => {
    if (busy) return;
    busy = true;
    const labels: Record<CombatMove, string> = {
      strike: 'Tippe, wenn die Nadel im Feld ist',
      dodge: 'Im richtigen Moment zur Seite',
      distract: 'Werfen, wenn die Nadel im Feld ist',
      heal: '',
      flee: '',
    };
    const quality: Quality = needsTiming ? await timing(labels[move]) : 'good';
    clear(panel);
    const res = await app.backend.dispatch({ type: 'fight', move, quality });
    const evs = res.events;
    const rej = evs.find((e) => e.type === 'rejected');
    if (rej && rej.type === 'rejected') {
      say(REJECT_TEXT[rej.reason], 'bad');
      busy = false;
      choose();
      return;
    }
    if (evs.some((e) => e.type === 'fled')) {
      end({ outcome: 'fled', spot, enemy });
      return;
    }
    const round = evs.find((e) => e.type === 'round');
    if (round && round.type === 'round') await showRound(round);
    const won = evs.find((e) => e.type === 'combatWon');
    const lost = evs.find((e) => e.type === 'combatLost');
    const loot = evs.find((e) => e.type === 'loot') as LootEvent | undefined;
    if (won) {
      art.classList.add('defeated');
      say(`${def.name} erledigt!`, 'good');
      vibrate(app, [40, 60, 120]);
      await sleep(1100);
      end({ outcome: 'won', spot, enemy, loot });
      return;
    }
    if (lost && lost.type === 'combatLost') {
      showLost(lost.dropped);
      return;
    }
    busy = false;
    choose();
  };

  const showRound = async (r: Extract<GameEvent, { type: 'round' }>) => {
    renderStatus();
    // Eigene Aktion
    if (r.move === 'strike') {
      if (r.dealt > 0) {
        art.classList.remove('hit');
        void art.offsetWidth;
        art.classList.add('hit');
        vibrate(app, 30);
      }
      say(
        r.dealt === 0 ? 'Daneben!' : r.quality === 'perfect' ? `Volltreffer! ${r.dealt} Schaden` : r.quality === 'good' ? `Treffer: ${r.dealt} Schaden` : `Gestreift: ${r.dealt} Schaden`,
        r.dealt > 0 ? 'good' : 'neutral',
      );
    } else if (r.move === 'dodge') {
      say(r.dodged ? (r.quality === 'perfect' ? 'Perfekt ausgewichen! Er ist offen.' : 'Ausgewichen.') : 'Zu spät!', r.dodged ? 'good' : 'bad');
    } else if (r.move === 'distract') {
      say(r.stunned ? 'Er dreht sich zum Geräusch um.' : 'Er lässt sich nicht ablenken.', r.stunned ? 'good' : 'bad');
    } else if (r.move === 'heal') {
      say(`Verbunden: +${r.healed} Gesundheit`, 'good');
    }
    if (r.weaponBroke) {
      await sleep(700);
      say(`${WEAPONS[r.weaponBroke].name} zerbrochen!`, 'bad');
    }
    await sleep(750);
    // Gegenangriff
    if (r.taken > 0) {
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      vibrate(app, [80, 40, 80]);
      say(`${def.name} erwischt dich: −${r.taken}`, 'bad');
      await sleep(800);
    } else if (r.dodged || r.stunned) {
      await sleep(200);
    }
  };

  const showLost = (dropped: Partial<Inventory>) => {
    clear(panel);
    const lostList = RESOURCE_ORDER.filter((k) => dropped[k]);
    say('Du schaffst es gerade so weg.', 'bad');
    panel.append(
      h(
        'div',
        { class: 'combat-result' },
        h('p', null, lostList.length ? 'Auf der Flucht fallen dir ein paar Sachen aus dem Rucksack:' : 'Du hast nichts verloren.'),
        lostList.length
          ? h('ul', { class: 'dropped' }, lostList.map((k) => h('li', null, svgEl(resIcon(k, 16)), `${dropped[k]} ${RESOURCES[k].name}`)))
          : null,
        h('p', { class: 'note' }, 'Deine Gesundheit kommt von selbst zurück, schneller geht es mit Medizin.'),
        h('button', { class: 'btn wide', type: 'button', onclick: () => end({ outcome: 'lost', spot, enemy, dropped }) }, 'Zurück zur Karte'),
      ),
    );
  };

  const end = (e: CombatEnd) => {
    el.remove();
    onEnd(e);
  };

  host.append(el);
  renderStatus();
  say(`Ein ${def.name} versperrt dir den Weg.`);
  choose();
  return el;
}
