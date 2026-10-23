// Fund aus einer Sichtung: Die Karte dreht sich um, Rahmen und Glanz nach Seltenheit.
// Darunter, was sie bringt (neu im Sammelbuch, Stufe erreicht, Waffe wieder heil …).

import { AMMO, CARDS, RARITY_NAMES, WEAPONS } from '../../core/content';
import type { GameEvent, PlayerState } from '../../core/types';
import { SIGHTING_NAMES, sightingById, type SightingKind } from '../../core/sightings';
import { bookItem, cardFace, levelProgress, ROMAN, type BookKey } from '../cards';
import { h, reducedMotion } from '../dom';

type Claimed = Extract<GameEvent, { type: 'sightingClaimed' }>;

export function showCardReveal(host: HTMLElement, ev: Claimed, state: PlayerState, worldSeed: string, onDone: () => void) {
  const key: BookKey = ev.card ?? (`w:${ev.weapon}` as BookKey);
  const it = bookItem(key);
  const entry = state.book[key];
  const n = entry?.n ?? 1;
  const kind: SightingKind | undefined = sightingById(worldSeed, ev.id)?.kind;
  const lines: string[] = [];
  if (n === 1) lines.push('Neu im Sammelbuch!');
  if (ev.weapon) lines.push(ev.repaired ? `Deine ${WEAPONS[ev.weapon].name} ist wieder wie neu.` : `${WEAPONS[ev.weapon].name}: ab jetzt im Kampf dabei.`);
  // Schusswaffe: ein paar Schuss stecken noch drin
  const gun = ev.weapon ? WEAPONS[ev.weapon] : undefined;
  if (gun?.ammo && gun.loaded) lines.push(`Darin: ${gun.loaded} ${AMMO[gun.ammo].name}. Mehr Munition findest du nur draußen.`);
  else if (ev.card && CARDS[ev.card].kind === 'once') lines.push('Steckt im Rucksack. Bis zu 3 davon nimmst du in jeden Kampf mit.');
  else if (ev.card && CARDS[ev.card].kind === 'skill') {
    const p = levelProgress(n, CARDS[ev.card].rarity);
    if (ev.levelUp) lines.push(`Stufe ${ROMAN[p.level]} erreicht!`);
    else if (n === 1) lines.push('Kommt ab jetzt in jedem Kampf mit.');
    if (p.next) lines.push(`${n} von ${p.next} für Stufe ${ROMAN[p.level + 1]}.`);
  }
  if (ev.pity) lines.push('Glück gehabt: Lange nichts Seltenes, jetzt aber.');

  const card = cardFace(key, { level: ev.level ?? 1, shiny: ev.shiny, big: true });
  const flip = h('div', { class: 'reveal-flip' + (reducedMotion() ? ' now' : '') }, h('div', { class: 'reveal-back', 'aria-hidden': 'true' }), card);
  const close = () => {
    el.remove();
    onDone();
  };
  const el = h(
    'div',
    { class: `overlay card-reveal rar-${ev.rarity}${ev.shiny ? ' shiny' : ''}`, role: 'dialog', 'aria-label': `Gefunden: ${it.name}` },
    h('div', { class: 'reveal-rays', 'aria-hidden': 'true' }),
    h('p', { class: 'reveal-kicker' }, kind ? SIGHTING_NAMES[kind] : 'Gefunden'),
    flip,
    h('p', { class: 'reveal-rarity' }, `${RARITY_NAMES[ev.rarity]}${ev.shiny ? ' · Glänzend!' : ''}`),
    h('div', { class: 'reveal-lines' }, lines.map((l) => h('p', null, l))),
    h('button', { class: 'btn wide', type: 'button', onclick: close }, 'Einstecken'),
  );
  host.append(el);
  // Erst die Rückseite, dann umdrehen
  requestAnimationFrame(() => requestAnimationFrame(() => flip.classList.add('open')));
  return el;
}
