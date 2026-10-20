// Kampf 2.0: Echtzeit mit Zielwahl (Tab-Targeting) in 3D.
//
// Bedienung: Zombie antippen = Ziel. Deine Figur schlägt automatisch zu.
// Ausweichen, wenn der rote Kreis hell aufleuchtet: Konter! Dazu Wuchtschlag, Stoß
// und Verbinden. Am Rechner: Tab = nächstes Ziel, Leertaste = Ausweichen, 1–3 = Fähigkeiten.

import { WORLD_SEED } from '../../config';
import { alive, createBattle, foeById, healthAfter, nextTarget, stepBattle, windupLeft, type BattleEvent, type BattleInput, type BattleState } from '../../core/battle';
import { ABILITIES, ABILITY_ORDER, FOES, MAX_HEALTH, RESOURCE_ORDER, RESOURCES, WEAPONS, type Ability } from '../../core/content';
import { bestWeapon } from '../../core/rules';
import type { DayPhase } from '../../core/sun';
import type { EnemyId, GameEvent, Inventory, Spot } from '../../core/types';
import type { App } from '../app';
import { clear, h, svgEl } from '../dom';
import { icon, resIcon } from '../icons';
import { faceEl } from '../portrait';
import { timingFactor } from './ambience';

export interface CombatEnd {
  outcome: 'won' | 'lost' | 'fled';
  spot: Spot;
  enemy: EnemyId;
  loot?: Extract<GameEvent, { type: 'loot' }>;
  dropped?: Partial<Inventory>;
  kills?: number;
}

const ICONS: Record<Ability, string> = { power: 'hammer', dodge: 'dodge', shove: 'shove', bandage: 'medicine' };
const KEYS: Record<Ability, string> = { power: '1', dodge: '␣', shove: '2', bandage: '3' };

export function openBattle(app: App, host: HTMLElement, phase: DayPhase, onEnd: (end: CombatEnd) => void): HTMLElement {
  const s0 = app.backend.current()!;
  const combat = s0.combat!;
  const spot = combat.spot;
  const weapon = bestWeapon(s0)?.kind ?? null;
  const battle: BattleState = createBattle({
    seed: `${WORLD_SEED}|${s0.playerId}|${spot.id}|${combat.window}`,
    guard: combat.enemy,
    weapon,
    health: s0.health,
    maxHealth: MAX_HEALTH,
    medicine: s0.inventory.medicine,
    foeSpeed: timingFactor(),
  });

  // --- Oberfläche --------------------------------------------------------------------------
  const stage = h('div', { class: 'battle-stage' });
  const meHp = h('span', { class: 'bar-fill' });
  const meHpText = h('span', { class: 'bar-text' });
  const counterBadge = h('span', { class: 'counter-badge', hidden: true }, 'Konter bereit');
  const meFrame = h(
    'div',
    { class: 'battle-me' },
    faceEl(s0.character.look, 44, 'battle-face'),
    h(
      'div',
      { class: 'battle-me-main' },
      h('b', null, s0.character.name),
      h('div', { class: 'bar me' }, meHp, meHpText),
      h('small', null, weapon ? WEAPONS[weapon].name : 'Fäuste', counterBadge),
    ),
  );
  const tName = h('b');
  const tHp = h('span', { class: 'bar-fill' });
  const tDesc = h('small');
  const targetFrame = h('div', { class: 'battle-target' }, h('div', { class: 'battle-target-head' }, svgEl(icon('locate', 16)), tName), h('div', { class: 'bar foe' }, tHp), tDesc);
  const fleeBtn = h('button', { class: 'btn ghost small battle-flee', type: 'button', onclick: () => queue({ type: 'flee' }) }, 'Fliehen');
  const callout = h('div', { class: 'battle-callout', 'aria-live': 'polite' });
  const floats = h('div', { class: 'battle-floats', 'aria-hidden': 'true' });
  const abilityBtns = {} as Record<Ability, { el: HTMLButtonElement; cd: HTMLElement; extra?: HTMLElement }>;
  const abilities = h(
    'div',
    { class: 'battle-abilities' },
    ABILITY_ORDER.map((a) => {
      const cd = h('span', { class: 'cd' });
      const extra = a === 'bandage' ? h('span', { class: 'ab-count' }) : undefined;
      const el = h(
        'button',
        { class: `ab ab-${a}`, type: 'button', 'aria-label': `${ABILITIES[a].name}: ${ABILITIES[a].desc}`, onclick: () => queue({ type: 'ability', ability: a }) },
        svgEl(icon(ICONS[a], a === 'dodge' ? 30 : 24)),
        h('span', { class: 'ab-name' }, ABILITIES[a].name),
        h('kbd', null, KEYS[a]),
        cd,
        extra,
      );
      abilityBtns[a] = { el, cd, extra };
      return el;
    }),
  );
  const switchBtn = h('button', { class: 'btn ghost small battle-switch', type: 'button', onclick: () => cycleTarget() }, svgEl(icon('locate', 16)), 'Ziel wechseln');
  const hint = h('div', { class: 'battle-hint' }, 'Tippe einen Zombie an. Deine Figur greift an. ', h('b', null, 'Leuchtet der Kreis hell: Ausweichen!'));
  const loading = h('div', { class: 'battle-loading' }, 'Achtung …');
  const el = h(
    'div',
    { class: 'overlay battle', role: 'dialog', 'aria-label': `Kampf an: ${spot.name}` },
    stage,
    floats,
    h('div', { class: 'battle-top' }, meFrame, targetFrame, fleeBtn),
    callout,
    hint,
    switchBtn,
    abilities,
    loading,
  );
  host.append(el);

  // --- Eingaben ----------------------------------------------------------------------------
  const inputs: BattleInput[] = [];
  const queue = (i: BattleInput) => {
    if (!battle.over) inputs.push(i);
  };
  const cycleTarget = () => {
    const id = nextTarget(battle, true);
    if (id !== null) queue({ type: 'target', id });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      cycleTarget();
    } else if (e.key === ' ') {
      e.preventDefault();
      queue({ type: 'ability', ability: 'dodge' });
    } else if (e.key === '1') queue({ type: 'ability', ability: 'power' });
    else if (e.key === '2') queue({ type: 'ability', ability: 'shove' });
    else if (e.key === '3') queue({ type: 'ability', ability: 'bandage' });
    else if (e.key === 'Escape') queue({ type: 'flee' });
  };
  window.addEventListener('keydown', onKey);

  // --- Rückmeldungen -----------------------------------------------------------------------
  let calloutTimer = 0;
  const say = (text: string, tone: 'good' | 'bad' | 'gold' = 'good') => {
    callout.textContent = text;
    callout.dataset.tone = tone;
    callout.classList.remove('pop');
    void callout.offsetWidth;
    callout.classList.add('pop');
    clearTimeout(calloutTimer);
    calloutTimer = window.setTimeout(() => (callout.textContent = ''), 1300);
  };
  const floatAt = (x: number, y: number, z: number, text: string, cls: string) => {
    if (!scene) return;
    const p = scene.project(x, y, z);
    if (!p.visible) return;
    const f = h('span', { class: `float ${cls}`, style: `left:${p.x + (Math.random() - 0.5) * 30}px;top:${p.y}px` }, text);
    floats.append(f);
    setTimeout(() => f.remove(), 950);
  };
  const vibrate = (ms: number | number[]) => {
    try {
      if (app.settings.get().vibration) navigator.vibrate?.(ms);
    } catch {
      /* nicht unterstützt */
    }
  };

  // Zeitlupe und Treffer-Stopp machen Treffer spürbar
  let slow = 0;
  let stop = 0;
  const react = (events: BattleEvent[]) => {
    for (const e of events) {
      if (e.type === 'hit') {
        const f = foeById(battle, e.id);
        if (!f) continue;
        floatAt(f.x, (scene?.foeHeight(f.id) ?? 2) + 0.2, f.z, e.counter ? `${e.dmg}!` : String(e.dmg), e.counter ? 'counter' : e.crit ? 'crit' : e.power ? 'power' : 'dmg');
        if (e.counter) {
          say('KONTER!', 'gold');
          stop = 0.09;
        } else if (e.crit) stop = Math.max(stop, 0.05);
        if (e.kill) {
          stop = Math.max(stop, 0.07);
          vibrate(40);
          if (!alive(battle).length) slow = 1.1;
        }
      } else if (e.type === 'hurt') {
        floatAt(battle.x, 2.1, battle.z, `-${e.dmg}`, 'hurt');
        el.classList.remove('hurt');
        void el.offsetWidth;
        el.classList.add('hurt');
        vibrate(60);
      } else if (e.type === 'dodged' && e.perfect) {
        say('Perfekt ausgewichen!', 'gold');
        slow = Math.max(slow, 0.5);
        vibrate([20, 30, 20]);
      } else if (e.type === 'dodged') floatAt(battle.x, 2, battle.z, 'Verfehlt', 'miss');
      else if (e.type === 'summon') say('Der Kreischer ruft Verstärkung!', 'bad');
      else if (e.type === 'heal') floatAt(battle.x, 2.1, battle.z, `+${e.amount}`, 'heal');
      else if (e.type === 'bandage') say('Verbinden …', 'good');
      else if (e.type === 'denied') {
        const b = abilityBtns[e.ability].el;
        b.classList.remove('shake');
        void b.offsetWidth;
        b.classList.add('shake');
        if (e.reason === 'no_target') say('Kein Ziel in Reichweite', 'bad');
        if (e.reason === 'no_medicine') say('Keine Medizin dabei', 'bad');
        if (e.reason === 'full') say('Du bist unverletzt', 'bad');
      }
    }
    if (events.some((e) => e.type === 'dodge')) hint.hidden = true;
  };

  // --- Anzeige -----------------------------------------------------------------------------
  const foeBars = new Map<number, HTMLElement>();
  const renderHud = () => {
    const pct = (battle.hp / battle.maxHp) * 100;
    meHp.style.width = `${pct}%`;
    meHp.dataset.low = String(pct < 35);
    meHpText.textContent = `${Math.ceil(battle.hp)} / ${battle.maxHp}`;
    counterBadge.hidden = battle.counter <= 0;
    const t = foeById(battle, battle.target);
    targetFrame.hidden = !t || t.mode === 'dead';
    if (t) {
      tName.textContent = FOES[t.kind].name;
      tHp.style.width = `${(t.hp / t.maxHp) * 100}%`;
      tDesc.textContent = FOES[t.kind].desc;
    }
    for (const a of ABILITY_ORDER) {
      const b = abilityBtns[a];
      const left = battle.cds[a];
      b.cd.style.setProperty('--p', String(left > 0 ? left / ABILITIES[a].cd : 0));
      b.cd.textContent = left > 0.05 && a !== 'dodge' ? String(Math.ceil(left)) : '';
      b.el.classList.toggle('cooling', left > 0);
      if (b.extra) b.extra.textContent = `×${battle.medicine}`;
      if (a === 'bandage') b.el.classList.toggle('empty', battle.medicine < 1);
    }
    // Die Ausweichen-Taste leuchtet, wenn gleich ein Treffer kommt
    const danger = alive(battle).some((f) => windupLeft(f, battle) <= 0.4);
    abilityBtns.dodge.el.classList.toggle('now', danger);
    // Kleine Lebensbalken über den Zombies
    if (!scene) return;
    for (const f of battle.foes) {
      let bar = foeBars.get(f.id);
      if (!bar) {
        bar = h('span', { class: 'foe-bar' }, h('span'));
        floats.append(bar);
        foeBars.set(f.id, bar);
      }
      const p = scene.project(f.x, scene.foeHeight(f.id) + 0.05, f.z);
      bar.hidden = f.mode === 'dead' || !p.visible;
      bar.style.transform = `translate(${p.x - 22}px, ${p.y}px)`;
      (bar.firstChild as HTMLElement).style.width = `${(f.hp / f.maxHp) * 100}%`;
      bar.classList.toggle('is-target', f.id === battle.target);
    }
  };

  // --- Schleife ----------------------------------------------------------------------------
  let scene: import('../../base/CombatScene').CombatScene | null = null;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let ended = false;
  const STEP = 1 / 60;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!scene) return;
    let scale = 1;
    if (stop > 0) {
      stop -= real;
      scale = 0;
    } else if (slow > 0) {
      slow -= real;
      scale = 0.3;
    }
    const dt = real * scale;
    acc += dt;
    let events: BattleEvent[] = [];
    let first = true;
    while (acc >= STEP) {
      acc -= STEP;
      const ev = stepBattle(battle, STEP, first ? inputs.splice(0) : []);
      first = false;
      events = events.concat(ev);
      if (battle.over) break;
    }
    if (first && inputs.length && !battle.over) events = stepBattle(battle, 0, inputs.splice(0));
    if (events.length) {
      scene.handle(battle, events);
      react(events);
    }
    scene.sync(battle, now / 1000, real * (scale || 0.0001));
    scene.render();
    renderHud();
    if (battle.over && !ended) {
      ended = true;
      void finish();
    }
  };

  const pointer = (e: PointerEvent) => {
    if (!scene || battle.over) return;
    const id = scene.pickFoe(battle, e.clientX, e.clientY);
    if (id !== null) {
      queue({ type: 'target', id });
      hint.hidden = true;
    }
  };
  stage.addEventListener('pointerdown', pointer);

  const used = () => battle.usedMedicine;
  const finish = async () => {
    const outcome = battle.over!;
    const banner = h('div', { class: `battle-banner ${outcome}` }, outcome === 'won' ? 'Sieg!' : outcome === 'lost' ? 'Niedergeschlagen' : 'Rückzug');
    el.append(banner);
    if (outcome === 'won') vibrate([30, 40, 60]);
    const res = await app.backend.dispatch({ type: 'battleResult', outcome, health: healthAfter(battle), kills: battle.kills, usedMedicine: used() });
    const loot = res.events.find((e) => e.type === 'loot');
    const lost = res.events.find((e) => e.type === 'combatLost');
    const broke = res.events.map((e) => ('weaponBroke' in e ? e.weaponBroke : undefined)).find(Boolean);
    if (broke) app.toast(`${WEAPONS[broke].name} zerbrochen!`, 'warn');
    if (outcome === 'lost' && lost?.type === 'combatLost') {
      setTimeout(() => showLost(lost.dropped), 900);
      return;
    }
    setTimeout(
      () => {
        close();
        onEnd({ outcome, spot, enemy: combat.enemy, loot: loot?.type === 'loot' ? loot : undefined, kills: battle.kills });
      },
      outcome === 'won' ? 1500 : 700,
    );
  };

  const showLost = (dropped: Partial<Inventory>) => {
    const list = RESOURCE_ORDER.filter((k) => dropped[k]);
    el.append(
      h(
        'div',
        { class: 'battle-result' },
        h('h2', null, 'Das war knapp.'),
        h('p', null, list.length ? 'Auf der Flucht fallen dir ein paar Sachen aus dem Rucksack:' : 'Du hast nichts verloren.'),
        list.length ? h('ul', { class: 'dropped' }, list.map((k) => h('li', null, svgEl(resIcon(k, 16)), `${dropped[k]} ${RESOURCES[k].name}`))) : null,
        h('p', { class: 'note' }, 'Deine Gesundheit kommt von selbst zurück, schneller geht es mit Medizin. Tipp: Weich aus, wenn der Kreis hell aufleuchtet.'),
        h(
          'button',
          {
            class: 'btn wide',
            type: 'button',
            onclick: () => {
              close();
              onEnd({ outcome: 'lost', spot, enemy: combat.enemy, dropped });
            },
          },
          'Zurück zur Karte',
        ),
      ),
    );
  };

  const close = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    clearTimeout(calloutTimer);
    scene?.dispose();
    scene = null;
    el.remove();
  };

  // 3D nachladen und los
  void import('../../base/CombatScene')
    .then((mod) => {
      if (!el.isConnected) return;
      scene = new mod.CombatScene(stage, s0.character.look, weapon, phase);
      loading.remove();
      last = performance.now();
      raf = requestAnimationFrame(loop);
      const first = battle.foes[0];
      if (first) say(`${alive(battle).length} Zombies!`, 'bad');
      setTimeout(() => (hint.hidden = true), 7000);
    })
    .catch(() => {
      clear(loading);
      loading.append('Der Kampf konnte nicht geladen werden.', h('button', { class: 'btn small', type: 'button', onclick: () => queue({ type: 'flee' }) }, 'Zurück'));
      // ohne 3D: sofort zurückziehen
      battle.over = 'fled';
      void finish();
    });

  return el;
}
