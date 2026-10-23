// Sammelkarten in der Oberfläche: Bild (sobald Kevin es gemalt hat, sonst ein Symbol), Rahmen
// nach Seltenheit, Wirkung in kurzen Worten. Gebraucht im Kampf, im Sammelbuch und beim Fund.

import {
  CARDS,
  cardStat,
  FOUND_WEAPONS,
  ONCE_CARDS,
  RARITY_NAMES,
  SKILL_CARDS,
  LEVEL_COPIES,
  maxLevel,
  skillLevel,
  STYLE_NAMES,
  styleOf,
  WEAPON_STYLE,
  type CardStyle,
  WEAPON_CARDS,
  WEAPONS,
  type CardId,
  type CardRarity,
} from '../core/content';
import type { WeaponId } from '../core/types';
import { h, svgEl } from './dom';
import { icon } from './icons';

// Kartenbilder: src/assets/cards/karte-<art>.webp (kommen nach und nach)
const ART = import.meta.glob<string>('../assets/cards/karte-*.webp', { eager: true, import: 'default' });
export const artUrl = (art?: string): string | null => (art ? (ART[`../assets/cards/karte-${art}.webp`] ?? null) : null);

export const CARD_ICON: Record<CardId, string> = {
  punch: 'fist',
  throw: 'throwStone',
  dodge: 'shield',
  kick: 'shove',
  pry: 'crowbar',
  swing: 'bat',
  homerun: 'smash',
  bolt: 'bolt',
  aim: 'aim',
  bandage: 'medicine',
  spade: 'shovel',
  chop: 'axe',
  drive: 'golfclub',
  pellet: 'slingshot',
  nail: 'nailgun',
  salvo: 'salvo',
  cleave: 'axe',
  wrenchhit: 'pipewrench',
  marble: 'marble',
  pebble: 'pebble',
  lathhit: 'lath',
  lidup: 'lid',
  lidbash: 'shove',
  foam: 'smoke',
  extbash: 'extinguisher',
  hack: 'machete',
  swath: 'sweep',
  sledge: 'sledgehammer',
  heave: 'momentum',
  prong: 'pitchfork',
  fend: 'shove',
  arrow: 'arrow',
  drawbow: 'bow',
  molotov: 'molotov',
  smoke: 'smoke',
  caltrops: 'caltrops',
  firecracker: 'firecracker',
  lure: 'lure',
  pepper: 'pepper',
  tinder: 'tinder',
  oilcan: 'oilcan',
  painkiller: 'painkiller',
  fireworks: 'fireworks',
  tripwire: 'tripwire',
  alarm: 'alarm',
  lath: 'lath',
  marblesack: 'marble',
  motionlamp: 'lamp',
  boombox: 'boombox',
  tape: 'tape',
  fencer: 'fence',
  dressing: 'dressing',
  adrenaline: 'adrenaline',
  flare: 'flare',
  flashbang: 'flashbang',
  grenade: 'grenade',
  counter: 'counter',
  steady: 'steady',
  breath: 'breath',
  spark: 'spark',
  embers: 'embers',
  wildfire: 'wildfire',
  pitcher: 'pitcher',
  followup: 'followup',
  headbutt: 'headbutt',
  pockets: 'hands',
  pickstones: 'pebble',
  breathe: 'breath',
  grit: 'fist2',
  fullforce: 'smash',
  charger: 'charger',
  tinkerbox: 'toolbox',
  toolroll: 'wrench',
  trueaim: 'bottle',
  unleash: 'pulse',
  innercalm: 'moon',
  laststrike: 'crack',
  frenzy: 'rage',
  cover: 'cover',
  roll: 'roll',
  retaliate: 'retaliate',
  firstaid: 'firstaid',
  rage: 'rage',
  trapper: 'trapper',
  distract: 'distract',
  sweep: 'sweep',
  sneak: 'sneak',
  scavenger: 'scavenger',
  radio: 'radioSet',
  secondwind: 'secondwind',
  packleader: 'packleader',
  laststand: 'laststand',
  flamewall: 'flame',
  waylay: 'tripwire',
  onslaught: 'momentum',
  mower: 'toolbox',
  secondlife: 'tape',
  stonehail: 'pebble',
  bulwark: 'shield',
  airshot: 'longgun',
  shot: 'pistol',
  doubletap: 'pistol',
  revshot: 'revolver',
  fan: 'revolver',
  buck: 'spread',
  rifleshot: 'longgun',
  scope: 'aim',
  buttstroke: 'fist',
};

export const WEAPON_ICON: Record<WeaponId, string> = { crowbar: 'crowbar', bat: 'bat', crossbow: 'bolt', shovel: 'shovel', axe: 'axe', golfclub: 'golfclub', slingshot: 'slingshot', nailgun: 'nailgun', pitchfork: 'pitchfork', bow: 'bow', machete: 'machete', sledgehammer: 'sledgehammer', lid: 'lid', extinguisher: 'extinguisher', pipewrench: 'pipewrench', airrifle: 'longgun', pistol: 'pistol', revolver: 'revolver', shotgun: 'longgun', huntingrifle: 'longgun' };

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** Stil-Zeichen: Flamme, Draht, Schwung, Schild, Pfote. */
export const STYLE_ICON: Record<CardStyle, string> = { fire: 'flame', trap: 'tripwire', momentum: 'momentum', guard: 'shield', tinker: 'battery', wear: 'wrench', junk: 'marble', stance: 'pulse', pack: 'paw' };

/** Kleines Stil-Zeichen (oder null bei Karten ohne Stil). */
export function styleMark(style: CardStyle | undefined, cls: string, size = 12): HTMLElement | null {
  if (!style) return null;
  return h('span', { class: `${cls} st-${style}`, title: `Stil: ${STYLE_NAMES[style]}`, 'aria-label': `Stil: ${STYLE_NAMES[style]}` }, svgEl(icon(STYLE_ICON[style], size)));
}

/** Eintrag im Sammelbuch: eine Karte oder „w:Waffe“. */
export type BookKey = CardId | `w:${WeaponId}`;
export const BOOK_ORDER: BookKey[] = [...ONCE_CARDS, ...FOUND_WEAPONS.map((w) => `w:${w}` as const), ...SKILL_CARDS];

export type BookKind = 'once' | 'weapon' | 'skill';
export const BOOK_KIND_NAMES: Record<BookKind, string> = { once: 'Einmal-Karte', weapon: 'Waffe', skill: 'Fähigkeit' };

export interface BookItem {
  key: BookKey;
  kind: BookKind;
  name: string;
  rarity: CardRarity;
  where: string;
  desc: string;
  icon: string;
  art: string | null;
  card?: CardId;
  weapon?: WeaponId;
  style?: CardStyle;
}

export function bookItem(key: BookKey): BookItem {
  if (key.startsWith('w:')) {
    const w = key.slice(2) as WeaponId;
    const d = WEAPONS[w];
    const cards = WEAPON_CARDS[w] ?? [];
    return {
      key,
      kind: 'weapon',
      name: d.name,
      rarity: d.rarity ?? 'common',
      where: d.where ?? 'Irgendwo da draußen',
      desc: `${d.desc} Bringt im Kampf: ${cardCounts(cards)}.`,
      icon: WEAPON_ICON[w],
      art: artUrl(d.art),
      weapon: w,
      style: WEAPON_STYLE[w],
    };
  }
  const id = key as CardId;
  const c = CARDS[id];
  return {
    key,
    kind: c.kind === 'skill' ? 'skill' : 'once',
    name: c.name,
    rarity: c.rarity ?? 'common',
    where: c.where ?? 'Irgendwo da draußen',
    desc: c.desc,
    icon: CARD_ICON[id],
    art: artUrl(c.art),
    card: id,
    style: styleOf(id),
  };
}

/** „3× Hebelhieb, 2× Ausweichen“ */
export function cardCounts(cards: CardId[]): string {
  const n = new Map<CardId, number>();
  for (const c of cards) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n].map(([c, k]) => `${k}× ${CARDS[c].name}`).join(', ');
}

/** Was eine Karte tut, kurz (Zahl groß, Stichworte klein). Fähigkeiten mit ihrer Stufe. */
export function cardEffect(id: CardId, level = 1): { main: string; tag: string } {
  const c = CARDS[id];
  const v = (s: Parameters<typeof cardStat>[1]) => cardStat(id, s, level);
  let main = '';
  if (c.passive) main = 'Wirkt von selbst';
  else if (v('dmg')) main = `${v('dmg')} Schaden`;
  else if (v('block')) main = `Blockt ${v('block')}`;
  else if (v('heal') && !c.gain) main = `Heilt ${v('heal')}`;
  else if (v('focus')) main = `+${v('focus')} Schaden`;
  else if (v('momentum')) main = `+${v('momentum')} Schwung`;
  else if (c.device) main = `Gerät, ${c.device.rounds} Runden`;
  else if (c.make) main = `+${c.make.n + Math.floor(v('bonus'))} ${CARDS[c.make.card].name}`;
  else if (c.repair) main = `+${c.repair} Haltbarkeit`;
  else if (c.overdrive) main = `+${v('bonus')} Wucht`;
  else if (c.charge) main = 'Geräte wirken';
  else if (c.stance) main = c.stance === 'calm' ? 'Ruhig' : 'Rasend';
  else if (c.gain) main = `+${v('gain')} Kraft`;
  else if (v('draw')) main = `${v('draw')} Karten`;
  else if (c.ally) main = `Hund ${v('allyDmg')} × ${c.ally.rounds}`;
  else if (c.burn) main = `Brennt ${v('burn')}`;
  else if (c.trap) main = `Falle ${c.trap}`;
  else if (c.pull) main = 'Holt nach vorn';
  else if (c.stun) main = 'Betäubt';
  else if (c.blind) main = 'Blendet';
  else if (c.slow) main = 'Bremst';
  else if (c.push) main = 'Stößt weg';
  else if (c.interrupt) main = 'Unterbricht';
  const tags: string[] = [];
  if (c.area === 'near') tags.push('alle vorne');
  else if (c.area === 'far') tags.push('alle hinten');
  else if (c.area === 'all') tags.push('alle');
  else if (c.target === 'near') tags.push('vorne');
  else if (c.target === 'any') tags.push('auch hinten');
  else if (c.target === 'far') tags.push('hinten');
  if (c.push && main !== 'Stößt weg') tags.push('stößt weg');
  if (c.trap) tags.push('setzt aus');
  if (c.stun && main !== 'Betäubt') tags.push('betäubt');
  if (c.stunIfWindup) tags.push('betäubt beim Ausholen');
  if (c.burn && !c.passive && !main.startsWith('Brennt')) tags.push(`brennt ${v('burn')}`);
  if (c.blind && main !== 'Blendet') tags.push('blendet');
  if (c.slow && main !== 'Bremst') tags.push('bremst');
  if (c.silence) tags.push('still');
  if (c.thorns) tags.push(`Konter ${v('thorns')}`);
  if (c.heal && c.gain) tags.push(`+${v('heal')} Gesundheit`);
  if (c.chain) tags.push('zwei Ziele');
  if (c.pierce) tags.push('durch Rüstung');
  if (c.farBonus) tags.push(`hinten +${c.farBonus}`);
  if (c.momentum && c.dmg) tags.push(`Schwung +${v('momentum')}`);
  if (c.perTurn) tags.push('1× pro Runde');
  if (c.focus) tags.push('nächster Wurf');
  if (c.medicine) tags.push('1 Medizin');
  if (c.stance && !main.startsWith(c.stance === 'calm' ? 'Ruhig' : 'Rasend')) tags.push(c.stance === 'calm' ? 'ruhig' : 'rasend');
  if (c.ethereal) tags.push('diese Runde');
  if (c.kind === 'once') tags.push('einmal');
  if (c.kind === 'skill') tags.push(`Stufe ${ROMAN[Math.max(1, Math.min(maxLevel(c.rarity), level))]}`);
  return { main, tag: tags.join(' · ') };
}

/** Wie weit bis zur nächsten Stufe (Fähigkeiten; seltene Karten steigen mit weniger Doppelten auf). */
export function levelProgress(copies: number, rarity: CardRarity = 'common'): { level: number; next: number | null } {
  const level = skillLevel(copies, rarity);
  return { level, next: LEVEL_COPIES[rarity][level] ?? null };
}

/**
 * Eine Sammelkarte als Bildchen. Unbekannte (locked) zeigen nur einen Umriss und wo es sie gibt.
 */
export function cardFace(key: BookKey, o: { level?: number; count?: number; shiny?: boolean; locked?: boolean; big?: boolean } = {}): HTMLElement {
  const it = bookItem(key);
  const locked = !!o.locked;
  const level = o.level ?? 1;
  const eff = it.card ? cardEffect(it.card, level) : { main: `${WEAPONS[it.weapon!].dur} Haltbarkeit`, tag: 'Waffe' };
  const cost = it.card && !CARDS[it.card].passive ? CARDS[it.card].cost : null;
  const art = !locked && it.art ? h('img', { class: 'cc-img', src: it.art, alt: '', draggable: 'false' }) : svgEl(icon(locked ? 'question' : it.icon, o.big ? 64 : 34), 'cc-ico');
  return h(
    'div',
    {
      class: `cc rar-${it.rarity} kind-${it.kind}${locked ? ' locked' : ''}${o.shiny && !locked ? ' shiny' : ''}${o.big ? ' big' : ''}`,
      'data-key': key,
    },
    h('span', { class: 'cc-art' }, art),
    cost !== null && !locked ? h('span', { class: 'cc-cost', title: 'Kraft' }, String(cost)) : null,
    it.kind === 'skill' && !locked && level > 0 ? h('span', { class: 'cc-level' }, ROMAN[Math.min(5, level)]) : null,
    o.count && o.count > 1 && !locked ? h('span', { class: 'cc-count' }, `×${o.count}`) : null,
    styleMark(it.style, 'cc-style', o.big ? 16 : 11),
    h('b', { class: 'cc-name' }, locked ? '???' : it.name),
    locked ? h('small', { class: 'cc-where' }, it.where) : h('span', { class: 'cc-eff' }, eff.main),
    o.big && !locked ? h('small', { class: 'cc-tag' }, eff.tag) : null,
    o.big && !locked ? h('p', { class: 'cc-desc' }, it.desc) : null,
    h('span', { class: 'cc-foot' }, o.big ? `${RARITY_NAMES[it.rarity]} · ${BOOK_KIND_NAMES[it.kind]}` : RARITY_NAMES[it.rarity]),
  );
}
