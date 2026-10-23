// Kampf als kurze Taktik mit Karten (Runde für Runde).
//
// Oben die 3D-Straßenecke mit deiner Figur und den Gegnern. Über jedem Gegner steht,
// was er als Nächstes vorhat. Unten deine Hand: Karte antippen (bei mehreren möglichen
// Zielen danach den Gegner). Jede Karte kostet Kraft, pro Runde gibt es 3. Darüber die
// Tasche mit Einmal-Karten: jederzeit spielbar, danach weg.
// „Runde beenden“: Die Gegner handeln, dann ziehst du neue Karten.
// Die Regeln stehen in core/tactics.ts; hier wird nur angezeigt und abgespielt.

import { WORLD_SEED } from '../../config';
import { CARDS, CLIMATE, FOE_TACTICS, KRAM, KRAM_ORDER, MAX_HEALTH, RESOURCE_ORDER, RESOURCES, TACTICS, WEAPONS, type CardId, gearArmor, gearSum } from '../../core/content';
import { isCold, isHot } from '../../core/terrain';
import { seasonOf } from '../../services/settings';
import { currentRegion } from './worldState';
import { aliveFoes, canHowl, createTactics, endTurn, flee, fleeCost, foeById, playable, playCard, playPouch, targetsFor, type Intent, type TacticsState, type TEvent } from '../../core/tactics';
import { battleWeapons, bestWeapon, cardKit, currentHealth } from '../../core/rules';
import { artUrl, CARD_ICON, cardEffect } from '../cards';
import type { DayPhase } from '../../core/sun';
import type { EnemyId, GameEvent, Inventory, KramBag, Spot } from '../../core/types';
import type { App } from '../app';
import { append, clear, h, reducedMotion, sleep, svgEl } from '../dom';
import { icon, resIcon } from '../icons';
import { faceEl } from '../portrait';
import { currentAmbience, walkerMood } from './ambience';
import type { ShownFoe, TacticsScene } from '../../base/CombatScene';
import { artStyle } from '../art';

export interface CombatEnd {
  outcome: 'won' | 'lost' | 'fled';
  spot: Spot;
  enemy: EnemyId;
  loot?: Extract<GameEvent, { type: 'loot' }>;
  dropped?: Partial<Inventory>;
  kills?: number;
  ambush?: boolean;
}


const STATUS_TEXT: Record<Extract<TEvent, { type: 'status' }>['status'], string> = {
  burn: 'Brennt!',
  blind: 'Geblendet!',
  slow: 'Verlangsamt',
  silence: 'Verstummt',
  interrupt: 'Unterbrochen!',
  steady: 'Lässt sich nicht betäuben',
};

const INTENT: Record<Intent['kind'], { icon: string; label: string; tone: string }> = {
  attack: { icon: 'sword', label: 'Angriff', tone: 'bad' },
  grab: { icon: 'grab', label: 'Packt zu', tone: 'grab' },
  windup: { icon: 'windup', label: 'Holt aus', tone: 'warn' },
  smash: { icon: 'smash', label: 'Wuchtschlag', tone: 'worst' },
  advance: { icon: 'advance', label: 'Kommt näher', tone: 'calm' },
  howl: { icon: 'howl', label: 'Ruft Hilfe', tone: 'warn' },
  lurk: { icon: 'shield', label: 'Duckt sich', tone: 'calm' },
  stunned: { icon: 'stun', label: 'Betäubt', tone: 'calm' },
  stare: { icon: 'eye', label: 'Starrt dich an', tone: 'grab' },
  fade: { icon: 'moon', label: 'Weicht ins Dunkel', tone: 'calm' },
  pounce: { icon: 'leap', label: 'Sprung', tone: 'worst' },
};

/** Der Teil des Zustands, den man sieht (hinkt beim Abspielen der Gegnerzüge kurz hinterher). */
interface Shown {
  hp: number;
  block: number;
  foes: Map<number, ShownFoe & { hp: number; maxHp: number; block: number; intent: Intent; acted: boolean }>;
}

export function openBattle(app: App, host: HTMLElement, phase: DayPhase, onEnd: (end: CombatEnd) => void): HTMLElement {
  const s0 = app.backend.current()!;
  const combat = s0.combat!;
  const spot = combat.spot;
  const now0 = app.backend.now();
  const weapon = bestWeapon(s0)?.kind ?? null;
  const mood = walkerMood();
  // Kälte ohne warme Sachen, Hitze ohne Wasser (echtes Wetter oder die Gegend)
  const amb = currentAmbience();
  const region = currentRegion();
  const cold = isCold({ tempC: amb.tempC, region, season: seasonOf(app.settings.get()), phase: amb.phase }) && gearSum(s0.gear.worn, 'warmth') < CLIMATE.warmthNeeded;
  const thirst = isHot({ tempC: amb.tempC, region, phase: amb.phase }) && s0.inventory.water <= 0;
  const opening = combat.opening;
  const st: TacticsState = createTactics({
    seed: `${WORLD_SEED}|${s0.playerId}|${spot.id}|${combat.window}|${combat.ambush ? 'u' : 'w'}`,
    group: combat.group?.length ? combat.group : [combat.enemy],
    // Je eine Nahkampf- und Fernkampfwaffe (zu Hause gewählt, sonst die stärkste)
    weapons: battleWeapons(s0),
    medicine: s0.inventory.medicine,
    health: currentHealth(s0, now0),
    maxHealth: MAX_HEALTH,
    mood,
    armor: gearArmor(s0.gear.worn),
    opening,
    cold,
    thirst,
    // Die Tasche (Einmal-Karten) und die zu Hause gewählten Fähigkeiten
    kit: cardKit(s0, now0),
  });
  const firstFight = s0.stats.kills === 0;
  const fast = reducedMotion();
  const wait = (ms: number) => sleep(fast ? Math.min(ms, 80) : ms);

  // --- Anzeige-Zustand ----------------------------------------------------------------------
  const shown: Shown = { hp: st.hp, block: 0, foes: new Map() };
  const syncShown = () => {
    shown.hp = st.hp;
    shown.block = st.block;
    for (const f of st.foes) {
      shown.foes.set(f.id, { id: f.id, kind: f.kind, row: f.row, alive: f.hp > 0, stunned: f.stunned, raised: f.intent.kind === 'smash', hp: f.hp, maxHp: f.maxHp, block: f.block, intent: f.intent, acted: false });
    }
  };
  syncShown();
  const shownList = () => [...shown.foes.values()];

  // --- Oberfläche ---------------------------------------------------------------------------
  const stage = h('div', { class: 'battle-stage' });
  const meHp = h('span', { class: 'bar-fill' });
  const meHpText = h('span', { class: 'bar-text' });
  const meBlock = h('span', { class: 't-block', hidden: true });
  const meFocus = h('span', { class: 't-focus', hidden: true });
  const meTrap = h('span', { class: 't-focus t-trap', hidden: true, title: 'Gelegte Fallen' });
  const weaponLine = h('small', { class: 't-weapon' });
  const meFrame = h(
    'div',
    { class: 'battle-me' },
    faceEl(s0.character.look, 44, 'battle-face'),
    h('div', { class: 'battle-me-main' }, h('b', null, s0.character.name, meBlock, meFocus, meTrap), h('div', { class: 'bar me' }, meHp, meHpText), weaponLine),
  );
  const fleeBtn = h('button', { class: 'btn ghost small battle-flee', type: 'button' }, svgEl(icon('flee', 16)), 'Fliehen');
  const helpBtn = h('button', { class: 'iconbtn small t-help-btn', type: 'button', 'aria-label': 'So geht der Kampf' }, '?');
  const floats = h('div', { class: 'battle-floats', 'aria-hidden': 'true' });
  const foeLayer = h('div', { class: 't-foes' });
  const callout = h('div', { class: 'battle-callout', 'aria-live': 'polite' });
  const energyEl = h('div', { class: 't-energy', 'aria-label': 'Kraft' });
  const info = h('div', { class: 't-info', 'aria-live': 'polite' });
  const endBtn = h('button', { class: 'btn t-end', type: 'button' }, 'Runde beenden');
  const pileEl = h('span', { class: 't-pile' });
  const handEl = h('div', { class: 't-hand' });
  const pouchEl = h('div', { class: 't-pouch', role: 'group', 'aria-label': 'Tasche' });
  const loading = h('div', { class: 'battle-loading has-art', style: artStyle('battle') }, 'Achtung …');
  const el = h(
    'div',
    { class: 'overlay battle tactics', role: 'dialog', 'aria-label': `Kampf an: ${spot.name}` },
    stage,
    foeLayer,
    floats,
    h('div', { class: 'battle-top' }, meFrame, h('div', { class: 't-top-right' }, helpBtn, fleeBtn)),
    callout,
    h('div', { class: 't-bottom' }, h('div', { class: 't-bar' }, energyEl, info, pileEl, endBtn), pouchEl, handEl),
    loading,
  );
  host.append(el);

  // Nur zum Testen: Kampfzustand von außen ansehen
  try {
    if (localStorage.getItem('endstation.debug')) (window as unknown as { __battle?: () => TacticsState }).__battle = () => st;
  } catch {
    /* egal */
  }

  // --- Rückmeldungen ------------------------------------------------------------------------
  let calloutTimer = 0;
  const say = (text: string, tone: 'good' | 'bad' | 'gold' = 'good', ms = 1400) => {
    callout.textContent = text;
    callout.dataset.tone = tone;
    callout.classList.remove('pop');
    void callout.offsetWidth;
    callout.classList.add('pop');
    clearTimeout(calloutTimer);
    calloutTimer = window.setTimeout(() => (callout.textContent = ''), ms);
  };
  const floatAt = (id: number, text: string, cls: string) => {
    if (!scene) return;
    const p = scene.anchor(id, id < 0 ? 0.1 : 0.1);
    if (!p.visible) return;
    const f = h('span', { class: `float ${cls}`, style: `left:${p.x + (Math.random() - 0.5) * 24}px;top:${p.y}px` }, text);
    floats.append(f);
    setTimeout(() => f.remove(), 1000);
  };
  const vibrate = (ms: number | number[]) => {
    try {
      if (app.settings.get().vibration) navigator.vibrate?.(ms);
    } catch {
      /* nicht unterstützt */
    }
  };
  /** Kurzer Effekt über dem ganzen Kampf (Feuer, Rauch, Blitz …). */
  const fx = (kind: string) => {
    if (fast) return;
    const f = h('div', { class: `t-fx fx-${kind}`, 'aria-hidden': 'true' });
    el.append(f);
    setTimeout(() => f.remove(), 900);
  };
  const shake = (node: Element) => {
    node.classList.remove('shake');
    void (node as HTMLElement).offsetWidth;
    node.classList.add('shake');
  };

  // --- Eingaben -----------------------------------------------------------------------------
  let busy = false;
  // Karte, die auf ein Ziel wartet: von der Hand (Index) oder aus der Tasche
  type Sel = { hand: number } | { pouch: CardId };
  let selected: Sel | null = null;
  const selCard = (sel = selected): CardId | undefined => (!sel ? undefined : 'hand' in sel ? st.hand[sel.hand] : sel.pouch);
  const sameSel = (a: Sel | null, b: Sel) => !!a && ('hand' in a ? 'hand' in b && a.hand === b.hand : 'pouch' in b && a.pouch === b.pouch);
  let locked: number | null = null; // Anvisierter Gegner: Karten treffen ihn, bis man einen anderen antippt

  const lockOn = (id: number | null) => {
    locked = id;
    scene?.setLocked(id);
    for (const [fid, v] of foeEls) v.el.classList.toggle('locked', fid === id);
  };
  let ended = false;
  let fleeArmed = false;

  const defaultInfo = () => {
    const foes = aliveFoes(st);
    if (firstFight && st.turn === 1) return 'Tippe eine Karte an. Jede kostet Kraft (⚡), pro Runde hast du 3. Tippst du einen Gegner an, treffen ihn deine Karten, bis du wechselst.';
    if (st.turn === 1 && opening === 'surprise') return 'Überraschung! Die Gegner setzen diese Runde aus, und du hast 1 Kraft mehr.';
    if (st.turn === 1 && opening === 'spotted') return `Entdeckt: In der ersten Runde hast du 1 Kraft weniger.${cold ? ' Und kalte Finger: eine Karte weniger.' : ''}`;
    if (st.turn === 1 && cold) return `Kalt: Ohne warme Sachen (Wärme ${CLIMATE.warmthNeeded}) hast du in der ersten Runde eine Karte weniger.`;
    if (st.turn === 1 && thirst) return 'Hitze und kein Wasser dabei: In der ersten Runde hast du 1 Kraft weniger.';
    if (foes.some((f) => f.row === 'near' && f.intent.kind === 'smash')) return 'Achtung, Wuchtschlag! Ausweichen oder ihn wegtreten.';
    if (st.turn === 1 && mood && foes.some((f) => f.kind === 'walker')) return mood === 'strong' ? 'Nacht, Nebel oder Regen: Die Wandler sind zäher als sonst.' : 'Pralle Sonne: Die Wandler sind träge.';
    if (foes.some((f) => f.kind === 'screamer')) return 'Der Heuler ruft Verstärkung. Erst ihn ausschalten, mit Wurf oder Bolzen.';
    if (st.energy === 0) return 'Keine Kraft mehr: Runde beenden.';
    return `Runde ${st.turn}`;
  };
  const setInfo = (text?: string) => (info.textContent = text ?? defaultInfo());

  const cancelSelect = () => {
    selected = null;
    scene?.setTargets(null);
    renderHand();
    renderPouch();
    setInfo();
  };

  const tryCard = (i: number) => tryPlay({ hand: i });
  const tryPouch = (card: CardId) => tryPlay({ pouch: card });
  const tryPlay = (sel: Sel) => {
    if (busy || st.over) return;
    const card = 'hand' in sel ? st.hand[sel.hand] : (st.pouch[sel.pouch] ?? 0) > 0 ? sel.pouch : undefined;
    if (!card) return;
    if (sameSel(selected, sel)) return cancelSelect();
    const def = CARDS[card];
    const btn = 'hand' in sel ? handEl.children[sel.hand] : pouchEl.querySelector(`[data-card="${card}"]`);
    if (def.cost > st.energy) {
      if (btn) shake(btn);
      return setInfo('Nicht genug Kraft. Runde beenden für neue.');
    }
    if (def.medicine && st.medicine < 1) {
      if (btn) shake(btn);
      return setInfo('Keine Medizin mehr dabei.');
    }
    if (def.heal && !def.gain && st.hp >= st.maxHp) {
      if (btn) shake(btn);
      return setInfo('Du bist unverletzt. Heb dir das Verbandszeug auf.');
    }
    if (def.perTurn && (st.turnPlays[card] ?? 0) >= def.perTurn) {
      if (btn) shake(btn);
      return setInfo(`${def.name}: nur einmal pro Runde.`);
    }
    if (def.target === 'self') return void doPlay(sel);
    const options = targetsFor(st, card);
    if (!options.length) {
      if (btn) shake(btn);
      return setInfo(def.target === 'near' ? 'Vorne steht niemand. Diese Karte trifft nur Gegner vorne.' : 'Kein Ziel.');
    }
    // Anvisierter Gegner ist ein gültiges Ziel: gleich auf ihn
    if (locked !== null && options.some((f) => f.id === locked)) return void doPlay(sel, locked);
    if (options.length === 1) return void doPlay(sel, options[0].id);
    selected = sel;
    scene?.setTargets(options.map((f) => f.id));
    renderHand();
    renderPouch();
    setInfo(`${def.name}: Wähle ein Ziel.`);
  };

  const tapFoe = (id: number) => {
    if (busy || st.over) return;
    if (selected !== null) {
      const card = selCard();
      if (card && targetsFor(st, card).some((f) => f.id === id)) {
        // Wer ein Ziel wählt, visiert es gleich für die nächsten Karten an
        lockOn(id);
        return void doPlay(selected, id);
      }
      return setInfo(card && CARDS[card].target === 'near' ? 'Der steht hinten. Diese Karte trifft nur vorne.' : 'Kein gültiges Ziel.');
    }
    const f = foeById(st, id);
    if (!f || f.hp <= 0) return;
    const def = FOE_TACTICS[f.kind];
    const fresh = locked !== id;
    lockOn(id);
    setInfo(`${fresh ? 'Anvisiert: ' : ''}${def.name} (${f.hp}/${f.maxHp}${def.armor ? `, Rüstung ${def.armor}` : ''}): ${def.desc}`);
  };

  // --- Abspielen ------------------------------------------------------------------------------
  const sfoe = (id: number) => shown.foes.get(id);

  const animate = async (events: TEvent[], enemyPhase: boolean) => {
    for (const e of events) {
      switch (e.type) {
        case 'play': {
          const id = e.target;
          const c = e.card;
          const def = CARDS[c];
          if (def.kind === 'once') say(def.name, def.rarity === 'legendary' || def.rarity === 'epic' ? 'gold' : 'good', 900);
          if (c === 'throw' || c === 'bolt' || c === 'arrow' || c === 'pellet' || c === 'drive' || c === 'lure' || c === 'flare' || c === 'tinder') {
            if (id !== undefined) scene?.shoot(id, c === 'bolt' || c === 'arrow' ? 'bolt' : 'stone');
            if (c === 'flare') fx('flare');
            if (c === 'tinder') fx('fire');
            await wait(c === 'bolt' ? 160 : 300);
          } else if (c === 'dodge' || c === 'counter') scene?.shieldUp();
          else if (c === 'bandage' || c === 'dressing' || c === 'adrenaline' || c === 'secondwind') scene?.heal();
          else if (c === 'aim' || c === 'steady' || c === 'drawbow') scene?.focus();
          else if (c === 'tripwire') await wait(160);
          else if (c === 'alarm') {
            fx('spark');
            vibrate([20, 20, 20, 20, 20]);
            await wait(300);
          }
          else if (c === 'molotov' || c === 'oilcan' || c === 'grenade' || c === 'flashbang' || c === 'smoke' || c === 'firecracker' || c === 'caltrops' || c === 'radio') {
            fx(c === 'molotov' || c === 'oilcan' ? 'fire' : c === 'grenade' ? 'blast' : c === 'flashbang' ? 'flash' : c === 'smoke' ? 'smoke' : c === 'firecracker' ? 'spark' : c === 'radio' ? 'radio' : 'dust');
            vibrate(c === 'grenade' ? [40, 30, 90] : 30);
            await wait(c === 'grenade' ? 420 : 300);
          } else if (c === 'breath' || c === 'packleader') {
            await wait(120);
          } else {
            if (c === 'pepper') fx('smoke');
            if (c === 'spark' || c === 'salvo') fx('spark');
            scene?.act(c === 'homerun' || c === 'chop' || c === 'sweep' || c === 'salvo' ? 'power' : c === 'kick' || c === 'spade' || c === 'pepper' || c === 'fend' || c === 'distract' ? 'shove' : 'swing', id);
            await wait(c === 'homerun' || c === 'chop' ? 260 : 150);
          }
          break;
        }
        case 'burn':
        case 'thorns':
        case 'ally': {
          const f = sfoe(e.id);
          if (f) {
            f.hp = Math.max(0, f.hp - e.dmg);
            if (e.kill) f.alive = false;
          }
          scene?.hitFoe(e.id, e.dmg, e.kill, false);
          floatAt(e.id, e.type === 'burn' ? `🔥${e.dmg}` : e.type === 'ally' ? `Hund ${e.dmg}` : `Konter ${e.dmg}`, e.type === 'burn' ? 'power' : 'dmg');
          if (e.kill) {
            vibrate(40);
            scene?.setFoes(shownList());
            await wait(300);
          } else await wait(e.type === 'ally' ? 260 : 160);
          break;
        }
        case 'trapSet':
          floatAt(-1, `Falle gelegt (${e.count})`, 'power');
          break;
        case 'pulled': {
          const f = sfoe(e.id);
          if (f) {
            f.row = 'near';
            f.intent = foeById(st, e.id)?.intent ?? f.intent;
          }
          scene?.setFoes(shownList());
          floatAt(e.id, 'Kommt her!', 'crit');
          await wait(420);
          break;
        }
        case 'trap':
          floatAt(e.id, 'Gestolpert!', 'crit');
          vibrate(40);
          await wait(220);
          break;
        case 'spread':
          floatAt(e.id, 'Fängt Feuer!', 'power');
          await wait(260);
          break;
        case 'status':
          floatAt(e.id, STATUS_TEXT[e.status], e.status === 'burn' ? 'power' : 'crit');
          if (e.status === 'interrupt') {
            const f = sfoe(e.id);
            if (f) {
              f.raised = false;
              f.intent = foeById(st, e.id)?.intent ?? f.intent;
            }
            scene?.setFoes(shownList());
          }
          await wait(140);
          break;
        case 'miss': {
          const f = sfoe(e.id);
          if (f) f.acted = true;
          scene?.blocked(e.id);
          floatAt(e.id, 'Daneben!', 'miss');
          await wait(420);
          break;
        }
        case 'allyIn':
          say(`Ein Hund springt dir bei! (${e.rounds} Runden)`, 'gold', 1800);
          vibrate([20, 40, 20]);
          await wait(300);
          break;
        case 'draw':
          floatAt(-1, `+${e.n} Karten`, 'heal');
          break;
        case 'gain':
          floatAt(-1, `+${e.amount} Kraft`, 'power');
          break;
        case 'secondWind':
          shown.hp = Math.min(st.maxHp, shown.hp + e.amount);
          say(`Zweiter Atem! +${e.amount}`, 'gold', 1600);
          scene?.heal();
          vibrate([30, 30, 60]);
          await wait(400);
          break;
        case 'lastStand':
          shown.hp = 1;
          say('Letztes Gefecht! Du bleibst stehen.', 'gold', 2000);
          vibrate([80, 40, 80]);
          await wait(500);
          break;
        case 'hit': {
          const f = sfoe(e.id);
          if (f) {
            f.hp = Math.max(0, f.hp - e.dmg);
            f.block = Math.max(0, f.block - e.absorbed);
            if (e.kill) f.alive = false;
          }
          scene?.hitFoe(e.id, e.dmg, e.kill, e.dmg >= 5);
          if (e.dmg > 0) floatAt(e.id, String(e.dmg), e.dmg >= 5 ? 'crit' : e.dmg >= 3 ? 'power' : 'dmg');
          if (e.absorbed > 0) floatAt(e.id, `${e.absorbed} abgewehrt`, 'miss');
          if (e.dmg === 0 && e.absorbed === 0) floatAt(e.id, 'Rüstung', 'miss');
          if (e.kill) {
            vibrate(40);
            scene?.setFoes(shownList());
            await wait(320);
          } else await wait(120);
          break;
        }
        case 'push': {
          const f = sfoe(e.id);
          if (f) {
            f.row = 'far';
            f.raised = false;
            f.intent = foeById(st, e.id)?.intent ?? f.intent;
          }
          scene?.setFoes(shownList());
          scene?.pushed(e.id);
          floatAt(e.id, 'Weggetreten!', 'power');
          await wait(250);
          break;
        }
        case 'stun': {
          const f = sfoe(e.id);
          if (f) {
            f.stunned = true;
            f.intent = { kind: 'stunned' };
          }
          scene?.setFoes(shownList());
          floatAt(e.id, 'Betäubt!', 'crit');
          break;
        }
        case 'block':
          shown.block += e.amount;
          floatAt(-1, `+${e.amount} Schutz`, 'heal');
          break;
        case 'heal':
          shown.hp = Math.min(st.maxHp, shown.hp + e.amount);
          floatAt(-1, `+${e.amount}`, 'heal');
          break;
        case 'focus':
          floatAt(-1, `Zielen +${e.amount}`, 'power');
          break;
        case 'weaponBroke':
          say(`${WEAPONS[e.weapon].name} zerbrochen!`, 'bad');
          vibrate([30, 40, 30]);
          break;
        case 'advance': {
          const f = sfoe(e.id);
          if (f) {
            f.row = 'near';
            f.acted = true;
          }
          scene?.setFoes(shownList());
          await wait(520);
          break;
        }
        case 'hurt': {
          const f = sfoe(e.by);
          if (f) {
            f.acted = true;
            f.raised = false;
          }
          scene?.setFoes(shownList());
          shown.block = Math.max(0, shown.block - e.absorbed);
          shown.hp = Math.max(0, shown.hp - e.dmg);
          if (e.dmg > 0) {
            scene?.hurt(e.by, e.dmg);
            floatAt(-1, `-${e.dmg}`, 'hurt');
            el.classList.remove('hurt');
            void el.offsetWidth;
            el.classList.add('hurt');
            vibrate(e.dmg >= 5 ? [60, 40, 80] : 50);
          } else scene?.blocked(e.by);
          if (e.absorbed > 0) floatAt(-1, `${e.absorbed} geblockt`, 'miss');
          renderHud();
          await wait(560);
          break;
        }
        case 'grabbed':
          floatAt(-1, 'Gepackt! −1 Kraft', 'hurt');
          await wait(260);
          break;
        case 'stare': {
          const f = sfoe(e.by);
          if (f) f.acted = true;
          scene?.setFoes(shownList());
          floatAt(e.by, 'Starrt dich an …', 'crit');
          floatAt(-1, 'Wie gelähmt: −1 Karte, −1 Kraft', 'hurt');
          vibrate([60]);
          await wait(620);
          break;
        }
        case 'fade': {
          const f = sfoe(e.id);
          if (f) {
            f.acted = true;
            f.row = 'far';
            f.block = 2;
          }
          scene?.setFoes(shownList());
          floatAt(e.id, 'Weicht ins Dunkel', 'miss');
          await wait(520);
          break;
        }
        case 'pounce': {
          const f = sfoe(e.id);
          if (f) {
            f.acted = true;
            f.row = 'near';
            f.block = 0;
          }
          scene?.setFoes(shownList());
          floatAt(e.id, 'Springt dich an!', 'crit');
          await wait(360);
          break;
        }
        case 'windup': {
          const f = sfoe(e.id);
          if (f) {
            f.acted = true;
            f.raised = true;
          }
          scene?.setFoes(shownList());
          floatAt(e.id, 'Holt aus!', 'crit');
          await wait(480);
          break;
        }
        case 'lurk': {
          const f = sfoe(e.id);
          if (f) {
            f.acted = true;
            f.block = e.block;
          }
          floatAt(e.id, 'Duckt sich', 'miss');
          await wait(360);
          break;
        }
        case 'summon': {
          const by = sfoe(e.by);
          if (by) by.acted = true;
          const nf = foeById(st, e.id);
          if (nf) shown.foes.set(nf.id, { id: nf.id, kind: nf.kind, row: 'far', alive: nf.hp > 0, stunned: false, raised: false, hp: nf.hp, maxHp: nf.maxHp, block: 0, intent: nf.intent, acted: true });
          scene?.howl(e.by);
          scene?.setFoes(shownList(), [e.id]);
          say('Der Heuler ruft einen Wandler!', 'bad');
          vibrate([20, 30, 20, 30, 20]);
          await wait(800);
          break;
        }
        case 'turn':
          syncShown();
          scene?.setFoes(shownList());
          break;
        default:
          break;
      }
      renderHud();
      if (enemyPhase && st.over === 'lost' && shown.hp <= 0) break;
    }
  };

  const doPlay = async (sel: Sel, target?: number) => {
    if (busy) return;
    busy = true;
    selected = null;
    scene?.setTargets(null);
    const events = 'hand' in sel ? playCard(st, sel.hand, target) : playPouch(st, sel.pouch, target);
    if (events[0]?.type === 'denied') {
      busy = false;
      renderHand();
      renderPouch();
      const btn = 'hand' in sel ? handEl.children[sel.hand] : pouchEl.querySelector(`[data-card="${sel.pouch}"]`);
      if (btn) shake(btn);
      if (events[0].reason === 'target') setInfo('Da steht gerade niemand, den diese Karte trifft.');
      return;
    }
    renderHand();
    renderPouch();
    await animate(events, false);
    syncShown();
    scene?.setFoes(shownList());
    busy = false;
    renderAll();
    if (st.over) void finish();
  };

  const doEndTurn = async () => {
    if (busy || st.over) return;
    busy = true;
    selected = null;
    scene?.setTargets(null);
    handEl.classList.add('away');
    renderBar();
    await wait(220);
    const events = endTurn(st);
    await animate(events, true);
    handEl.classList.remove('away');
    busy = false;
    renderAll(true);
    if (st.over) void finish();
    else if (events.some((e) => e.type === 'stare')) setInfo('Wie gelähmt: diese Runde 1 Karte und 1 Kraft weniger.');
    else if (st.grabbed === 0 && st.energy < TACTICS.energy) setInfo('Gepackt: diese Runde 1 Kraft weniger.');
  };

  endBtn.addEventListener('click', () => void doEndTurn());
  fleeBtn.addEventListener('click', () => {
    if (busy || st.over) return;
    if (!fleeArmed) {
      fleeArmed = true;
      // Was Fliehen kostet: Wer vorne steht, schlägt noch einmal zu
      const cost = Math.min(fleeCost(st), Math.max(0, st.hp - 1));
      fleeBtn.lastChild!.textContent = cost ? `Wirklich? −${cost}` : 'Wirklich?';
      setInfo(cost ? `Beim Weglaufen schlagen die Gegner vorne noch einmal zu: ${cost} Schaden. Du kommst aber sicher davon.` : 'Vorne steht niemand: Du kommst ohne Treffer davon.');
      setTimeout(() => {
        fleeArmed = false;
        if (fleeBtn.lastChild) fleeBtn.lastChild.textContent = 'Fliehen';
      }, 2500);
      return;
    }
    busy = true;
    const events = flee(st);
    void animate(events, true).then(() => void finish());
  });
  helpBtn.addEventListener('click', () => showHelp());

  const onKey = (e: KeyboardEvent) => {
    if (e.key >= '1' && e.key <= '9') tryCard(Number(e.key) - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void doEndTurn();
    } else if (e.key === 'Escape') {
      if (selected !== null) cancelSelect();
    }
  };
  window.addEventListener('keydown', onKey);

  stage.addEventListener('pointerdown', (e) => {
    if (!scene || busy) return;
    const id = scene.pickFoe(e.clientX, e.clientY);
    if (id !== null) tapFoe(id);
    else if (selected !== null) cancelSelect();
  });

  // --- Anzeige ------------------------------------------------------------------------------
  const renderHud = () => {
    const pct = (shown.hp / st.maxHp) * 100;
    meHp.style.width = `${Math.max(0, pct)}%`;
    meHp.dataset.low = String(pct < 35);
    meHpText.textContent = `${Math.max(0, Math.ceil(shown.hp))} / ${st.maxHp}`;
    meBlock.hidden = shown.block <= 0;
    clear(meBlock);
    meBlock.append(svgEl(icon('shield', 13)), String(shown.block));
    meFocus.hidden = st.focus <= 0;
    clear(meFocus);
    meFocus.append(svgEl(icon('aim', 13)), `+${st.focus}`);
    meTrap.hidden = st.traps.length <= 0;
    clear(meTrap);
    meTrap.append(svgEl(icon('tripwire', 13)), String(st.traps.length));
    const kinds = (Object.keys(st.weaponDur) as (keyof typeof WEAPONS)[]).filter((k) => (st.weaponDur[k] ?? 0) > 0);
    weaponLine.textContent = kinds.length ? kinds.map((k) => `${WEAPONS[k].name} ${st.weaponDur[k]}`).join(' · ') : 'Keine Waffe: Fäuste und Steine';
  };

  const foeEls = new Map<number, { el: HTMLElement; intent: HTMLElement; hp: HTMLElement; hpText: HTMLElement; block: HTMLElement; row: HTMLElement; status: HTMLElement; key: string; skey: string }>();
  const renderFoeOverlays = () => {
    for (const f of shown.foes.values()) {
      let v = foeEls.get(f.id);
      if (!v) {
        const intentEl = h('span', { class: 't-intent' });
        const hp = h('span', { class: 'bar-fill' });
        const hpText = h('span', { class: 't-hp-text' });
        const block = h('span', { class: 't-fblock', hidden: true });
        const rowTag = h('small', { class: 't-row' });
        const statusEl = h('span', { class: 't-status' });
        const node = h(
          'button',
          { class: 't-foe', type: 'button', 'data-kind': f.kind, onclick: () => tapFoe(f.id) },
          intentEl,
          h('span', { class: 't-foe-name' }, h('span', { class: 't-lock', 'aria-label': 'anvisiert' }, svgEl(icon('aim', 12))), FOE_TACTICS[f.kind].name, rowTag, block),
          h('span', { class: 'bar foe' }, hp, hpText),
          statusEl,
        );
        foeLayer.append(node);
        v = { el: node, intent: intentEl, hp, hpText, block, row: rowTag, status: statusEl, key: '', skey: '' };
        foeEls.set(f.id, v);
      }
      v.el.hidden = !f.alive;
      v.el.dataset.row = f.row;
      v.row.textContent = f.row === 'far' ? 'hinten' : '';
      v.hp.style.width = `${(f.hp / f.maxHp) * 100}%`;
      v.hpText.textContent = `${f.hp}/${f.maxHp}`;
      v.block.hidden = f.block <= 0;
      v.block.textContent = `🛡${f.block}`;
      // Zustände (Brennt, Geblendet, Verlangsamt, Still) aus dem echten Kampfzustand
      const live = foeById(st, f.id);
      const sts: [string, string][] = [];
      if (live?.burn) sts.push(['burn', `Brennt ${live.burn}`]);
      if (live?.blind) sts.push(['blind', 'Geblendet']);
      if (live?.slow) sts.push(['slow', `Langsam ${live.slow}`]);
      if (live?.silence && canHowl(live.kind)) sts.push(['silence', 'Still']);
      const skey = sts.map((x) => x[1]).join('|');
      if (skey !== v.skey) {
        v.skey = skey;
        clear(v.status);
        for (const [k, t] of sts) v.status.append(h('small', { class: `t-st st-${k}` }, t));
      }
      const it = INTENT[f.intent.kind];
      const key = `${f.intent.kind}|${f.intent.dmg ?? ''}|${f.acted}`;
      if (key !== v.key) {
        v.key = key;
        clear(v.intent);
        v.intent.dataset.tone = it.tone;
        v.intent.classList.toggle('done', f.acted);
        // Bei einem normalen Angriff reicht die Zahl, alles andere bekommt ein Wort dazu
        append(v.intent, [svgEl(icon(it.icon, 16)), f.intent.dmg ? h('b', null, String(f.intent.dmg)) : null, f.intent.kind === 'attack' ? null : h('small', null, it.label)]);
        v.intent.title = it.label;
        v.intent.classList.remove('pop');
        void v.intent.offsetWidth;
        v.intent.classList.add('pop');
      }
      const sc = selCard();
      const targetable = sc ? targetsFor(st, sc).some((x) => x.id === f.id) : false;
      v.el.classList.toggle('targetable', targetable);
      // Anvisierter Gegner gefallen: Markierung weg
      if (locked === f.id && !f.alive) lockOn(null);
      v.el.classList.toggle('locked', locked === f.id);
    }
  };
  const placeFoeOverlays = () => {
    if (!scene) return;
    for (const [id, v] of foeEls) {
      if (v.el.hidden) continue;
      // Hintere Gegner etwas höher beschriften, damit sich die Schilder nicht überdecken
      const p = scene.anchor(id, v.el.dataset.row === 'far' ? 0.55 : 0.15);
      v.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      v.el.style.visibility = p.visible ? '' : 'hidden';
    }
  };

  const renderBar = () => {
    clear(energyEl);
    for (let i = 0; i < Math.max(TACTICS.energy, st.energy); i++) energyEl.append(h('span', { class: 'orb' + (i < st.energy ? ' on' : '') }, svgEl(icon('energy', 14))));
    energyEl.setAttribute('aria-label', `Kraft ${st.energy} von ${TACTICS.energy}`);
    endBtn.disabled = busy || !!st.over;
    endBtn.classList.toggle('glow', !busy && !st.over && st.hand.every((c) => !playable(st, c)));
    pileEl.textContent = `Stapel ${st.draw.length}`;
    pileEl.title = `Noch ${st.draw.length} Karten im Stapel, ${st.discard.length} abgelegt`;
  };

  const renderHand = (deal = false) => {
    clear(handEl);
    st.hand.forEach((card, i) => {
      const def = CARDS[card];
      const eff = cardEffect(card, st.levels[card] ?? 1);
      const ok = playable(st, card);
      let pressTimer = 0;
      let longPressed = false;
      const btn = h(
        'button',
        {
          class: `t-card kind-${def.kind}${def.target === 'self' ? ' self' : ''}${def.kind === 'once' || def.kind === 'skill' ? ` collect rar-${def.rarity ?? 'common'}` : ''}${ok ? '' : ' off'}${sameSel(selected, { hand: i }) ? ' picked' : ''}${deal ? ' deal' : ''}`,
          type: 'button',
          style: `--i:${i}`,
          'aria-label': `${def.name}, kostet ${def.cost} Kraft: ${def.desc}`,
          onpointerdown: () => {
            longPressed = false;
            pressTimer = window.setTimeout(() => {
              longPressed = true;
              setInfo(`${def.name}: ${def.desc}`);
            }, 450);
          },
          onpointerup: () => clearTimeout(pressTimer),
          onpointerleave: () => clearTimeout(pressTimer),
          onclick: () => {
            if (longPressed) return;
            tryCard(i);
          },
        },
        h('span', { class: 't-cost' }, String(def.cost)),
        // Gemaltes Kartenbild, sobald es eins gibt, sonst das Symbol
        artUrl(def.art) ? h('img', { class: 't-card-art', src: artUrl(def.art)!, alt: '', draggable: 'false' }) : svgEl(icon(CARD_ICON[card], 26), 't-card-icon'),
        h('b', { class: 't-card-name' }, def.name),
        h('span', { class: 't-card-eff' }, eff.main),
        eff.tag ? h('small', { class: 't-card-tag' }, eff.tag) : null,
        h('kbd', null, String(i + 1)),
      );
      handEl.append(btn);
    });
  };

  /** Die Tasche: Einmal-Karten, jederzeit spielbar. Aufgebrauchte Sorten bleiben als „leer“ stehen. */
  const renderPouch = () => {
    clear(pouchEl);
    const ids = Object.keys(st.pouch) as CardId[];
    pouchEl.hidden = !ids.length;
    if (!ids.length) return;
    pouchEl.append(h('small', { class: 't-pouch-label' }, svgEl(icon('backpack', 14)), 'Tasche'));
    for (const id of ids) {
      const def = CARDS[id];
      const n = st.pouch[id] ?? 0;
      const ok = n > 0 && playable(st, id);
      let pressTimer = 0;
      let longPressed = false;
      pouchEl.append(
        h(
          'button',
          {
            class: `t-pc rar-${def.rarity ?? 'common'}${ok ? '' : ' off'}${n ? '' : ' empty'}${sameSel(selected, { pouch: id }) ? ' picked' : ''}`,
            type: 'button',
            'data-card': id,
            disabled: !n,
            'aria-label': `${def.name}, noch ${n}, kostet ${def.cost} Kraft: ${def.desc}`,
            onpointerdown: () => {
              longPressed = false;
              pressTimer = window.setTimeout(() => {
                longPressed = true;
                setInfo(`${def.name}: ${def.desc}`);
              }, 450);
            },
            onpointerup: () => clearTimeout(pressTimer),
            onpointerleave: () => clearTimeout(pressTimer),
            onclick: () => {
              if (longPressed) return;
              tryPouch(id);
            },
          },
          h('span', { class: 't-pc-cost' }, String(def.cost)),
          artUrl(def.art) ? h('img', { class: 't-pc-art', src: artUrl(def.art)!, alt: '', draggable: 'false' }) : svgEl(icon(CARD_ICON[id], 20), 't-pc-icon'),
          h('b', null, def.name),
          h('small', null, n ? `×${n}` : 'leer'),
        ),
      );
    }
  };

  const renderAll = (deal = false) => {
    renderHud();
    renderBar();
    renderPouch();
    renderHand(deal);
    renderFoeOverlays();
    setInfo();
  };

  // --- Hilfe ---------------------------------------------------------------------------------
  const showHelp = () => {
    const box = h(
      'div',
      { class: 't-help', role: 'dialog', 'aria-label': 'So geht der Kampf' },
      h('h2', null, 'So geht der Kampf'),
      h(
        'ul',
        null,
        h('li', null, h('b', null, 'Karten spielen: '), 'Antippen. Jede Karte kostet Kraft (⚡), pro Runde hast du 3.'),
        h('li', null, h('b', null, 'Über jedem Gegner '), 'steht, was er als Nächstes tut. Plane danach.'),
        h('li', null, h('b', null, 'Vorne und hinten: '), 'Schläge treffen nur Gegner vorne. Würfe und Bolzen auch hinten.'),
        h('li', null, h('b', null, 'Holt einer aus, '), 'kommt ein Wuchtschlag: ausweichen oder wegtreten.'),
        h('li', null, h('b', null, 'Runde beenden: '), 'Die Gegner handeln, dann ziehst du 4 neue Karten.'),
        h('li', null, h('b', null, 'Tasche: '), 'Einmal-Karten liegen über deiner Hand. Du kannst sie jederzeit spielen, danach sind sie weg.'),
        h('li', null, h('b', null, 'Fliehen '), 'geht immer und rettet dich. Aber wer vorne steht, schlägt beim Weglaufen noch einmal zu.'),
      ),
      h('button', { class: 'btn wide', type: 'button', onclick: () => box.remove() }, 'Los geht’s'),
    );
    el.append(box);
  };

  // --- Schleife ------------------------------------------------------------------------------
  let scene: TacticsScene | null = null;
  let raf = 0;
  let last = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    // Der erste Bild-Zeitstempel kann vor „last“ liegen: nie rückwärts rechnen
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (!scene) return;
    scene.update(now / 1000, dt);
    scene.render();
    renderFoeOverlays();
    placeFoeOverlays();
  };

  // --- Ende ----------------------------------------------------------------------------------
  const finish = async () => {
    if (ended) return;
    ended = true;
    busy = true;
    renderBar();
    const outcome = st.over ?? 'fled';
    const banner = h('div', { class: `battle-banner ${outcome}` }, outcome === 'won' ? 'Sieg!' : outcome === 'lost' ? 'Niedergeschlagen' : 'Rückzug');
    el.append(banner);
    if (outcome === 'won') vibrate([30, 40, 60]);
    const res = await app.backend.dispatch({ type: 'battleResult', outcome, health: st.hp, kills: st.kills, usedMedicine: st.usedMedicine, wear: st.wear, used: st.used, lastStand: st.lastStandUsed || undefined });
    const loot = res.events.find((e) => e.type === 'loot');
    const lost = res.events.find((e) => e.type === 'combatLost');
    const broke = res.events.map((e) => ('weaponBroke' in e ? e.weaponBroke : undefined)).find(Boolean);
    if (broke) app.toast(`${WEAPONS[broke].name} ist zerbrochen. Am Werktisch baust du eine neue.`, 'warn');
    if (outcome === 'lost' && lost?.type === 'combatLost') {
      setTimeout(() => showLost(lost.dropped, lost.droppedKram, lost.droppedCards ?? {}), 900);
      return;
    }
    setTimeout(
      () => {
        close();
        onEnd({ outcome, spot, enemy: combat.enemy, loot: loot?.type === 'loot' ? loot : undefined, kills: st.kills, ambush: combat.ambush });
      },
      outcome === 'won' ? 1300 : 600,
    );
  };

  const showLost = (dropped: Partial<Inventory>, droppedKram: KramBag, droppedCards: Partial<Record<CardId, number>>) => {
    const list = RESOURCE_ORDER.filter((k) => dropped[k]);
    const kram = KRAM_ORDER.filter((k) => droppedKram[k]);
    const cards = (Object.keys(droppedCards) as CardId[]).filter((k) => droppedCards[k]);
    const nothing = !list.length && !kram.length && !cards.length;
    el.append(
      h(
        'div',
        { class: 'battle-result' },
        h('h2', null, 'Niedergeschlagen.'),
        h('p', null, nothing ? 'Dein Rucksack war leer, du hast nichts verloren. Du kommst zu Hause wieder zu dir.' : 'Du kommst zu Hause wieder zu dir. Alles aus dem Rucksack ist weg:'),
        nothing
          ? null
          : h('ul', { class: 'dropped' }, [
              ...list.map((k) => h('li', null, svgEl(resIcon(k, 16)), `${dropped[k]} ${RESOURCES[k].name}`)),
              ...kram.map((k) => h('li', null, `${droppedKram[k]} × ${KRAM[k].name}`)),
              ...cards.map((k) => h('li', null, svgEl(icon(CARD_ICON[k], 16)), `${droppedCards[k]} × ${CARDS[k].name}`)),
            ]),
        h('p', { class: 'note' }, 'Dein Lager zu Hause, deine Waffen und deine Ausrüstung hast du noch. Die Gesundheit kommt von selbst zurück, schneller mit Medizin oder einem Eintopf. Tipp: Bring Gutes öfter nach Hause, bevor du dich mit einem Trupp anlegst.'),
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
          'Nach Hause',
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
  renderAll(true);
  void import('../../base/CombatScene')
    .then((mod) => {
      if (!el.isConnected) return;
      scene = new mod.TacticsScene(stage, s0.character.look, weapon, phase, app.settings.get().battleView);
      scene.setFoes(shownList(), shownList().map((f) => f.id));
      try {
        if (localStorage.getItem('endstation.debug')) {
          const w = window as unknown as { __cam?: unknown; __scene?: unknown };
          w.__cam = (p: Record<string, number>) => scene?.tuneCamera(p);
          w.__scene = () => scene;
        }
      } catch {
        /* egal */
      }
      loading.remove();
      last = performance.now();
      raf = requestAnimationFrame(loop);
      const n = aliveFoes(st).length;
      if (opening === 'surprise') say('Überraschungsangriff!', 'gold', 1800);
      else if (opening === 'spotted') say(combat.patrol?.startsWith('t:h:') ? 'Die Horde hat dich entdeckt!' : 'Entdeckt!', 'bad');
      else say(combat.wild ? 'Aus dem Unterholz!' : combat.ambush ? 'Überfall! Zu viel Lärm gemacht.' : n > 1 ? `${n} Gegner!` : `Ein ${FOE_TACTICS[aliveFoes(st)[0].kind].name}!`, 'bad');
      if (firstFight) showHelp();
    })
    .catch(() => {
      clear(loading);
      loading.append('Der Kampf konnte nicht geladen werden.');
      // ohne 3D: zurückziehen, ohne Treffer
      flee(st, true);
      void finish();
    });

  return el;
}
