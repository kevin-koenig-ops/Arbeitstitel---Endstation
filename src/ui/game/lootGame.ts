// Kleine Geschicklichkeitsspiele beim Durchsuchen (je 2–3 Sekunden):
// - Schloss knacken: Der Zeiger kreist, im grünen Feld antippen (gold = perfekt).
// - Aufhebeln: Halten, bis der Balken im grünen Bereich ist, dann loslassen. Zu viel: abgerutscht.
// - Wühlen: Schnell allen Schutt wegtippen, bevor die Zeit um ist.
// Ergebnis: daneben, gut oder perfekt. Das entscheidet über die Menge der Beute.

import type { Quality, SpotKind } from '../../core/types';
import { h, reducedMotion, sleep, svgEl } from '../dom';
import { icon } from '../icons';

export type LootGameKind = 'lock' | 'pry' | 'rummage';

export const GAME_FOR: Record<SpotKind, LootGameKind> = {
  car: 'lock',
  parcel: 'lock',
  fuel: 'lock',
  stop: 'lock',
  container: 'rummage',
  mushrooms: 'rummage',
  backpack: 'rummage',
  market: 'rummage',
  barrel: 'rummage',
  shed: 'pry',
  hide: 'pry',
  pharmacy: 'pry',
  hardware: 'pry',
  well: 'pry',
  heli: 'pry',
  convoy: 'pry',
  bunker: 'lock',
  camp: 'rummage',
  mast: 'pry',
  airdrop: 'pry',
};

const TITLE: Record<LootGameKind, string> = { lock: 'Schloss knacken', pry: 'Aufhebeln', rummage: 'Durchwühlen' };
const HINT: Record<LootGameKind, string> = {
  lock: 'Tippe, wenn der Zeiger im grünen Feld ist. Gold ist perfekt.',
  pry: 'Halten, bis der Balken grün ist, dann loslassen. Nicht zu weit!',
  rummage: 'Tippe schnell allen Schutt weg.',
};
export const VERDICT: Record<Quality, string> = { perfect: 'Perfekt!', good: 'Geschafft', miss: 'Daneben' };

/** Ein Spiel abspielen. `el` ist der Platz dafür (wird geleert). */
export function playLootGame(el: HTMLElement, kind: LootGameKind, rng: () => number = Math.random): Promise<Quality> {
  el.replaceChildren();
  const body = h('div', { class: `lg lg-${kind}` });
  const verdict = h('div', { class: 'lg-verdict', 'aria-live': 'polite' });
  el.append(h('div', { class: 'lg-head' }, h('b', null, TITLE[kind]), h('small', null, HINT[kind])), body, verdict);
  const slow = reducedMotion() ? 1.6 : 1;
  const done = async (q: Quality, text?: string) => {
    verdict.textContent = text ?? VERDICT[q];
    verdict.dataset.q = q;
    body.classList.add('over');
    try {
      navigator.vibrate?.(q === 'perfect' ? [20, 30, 40] : q === 'good' ? 25 : 60);
    } catch {
      /* egal */
    }
    await sleep(650);
    return q;
  };
  if (kind === 'lock') return lockGame(body, done, rng, slow);
  if (kind === 'pry') return pryGame(body, done, rng, slow);
  return rummageGame(body, done, rng, slow);
}

type Done = (q: Quality, text?: string) => Promise<Quality>;

function lockGame(body: HTMLElement, done: Done, rng: () => number, slow: number): Promise<Quality> {
  // Grünes Feld (60°) mit goldener Mitte (16°) an zufälliger Stelle; der Zeiger dreht sich
  const R = 64;
  const center = 60 + rng() * 240;
  const green = 30;
  const gold = 8;
  const arc = (a0: number, a1: number, r: number) => {
    const p = (a: number) => [80 + r * Math.sin((a * Math.PI) / 180), 80 - r * Math.cos((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const svg = `<svg viewBox="0 0 160 160" width="150" height="150" aria-hidden="true">
    <circle cx="80" cy="80" r="${R}" fill="#1e1c18" stroke="#3a362f" stroke-width="14"/>
    <path d="${arc(center - green, center + green, R)}" stroke="#6fa04a" stroke-width="14" fill="none"/>
    <path d="${arc(center - gold, center + gold, R)}" stroke="#ffc861" stroke-width="14" fill="none"/>
    <circle cx="80" cy="80" r="16" fill="#2a2622" stroke="#6a6357" stroke-width="2"/>
    <rect x="76" y="74" width="8" height="12" rx="2" fill="#6a6357"/>
    <g class="lg-needle"><line x1="80" y1="80" x2="80" y2="${80 - R - 6}" stroke="#e8dec8" stroke-width="4" stroke-linecap="round"/></g>
  </svg>`;
  const dial = svgEl(svg, 'lg-dial');
  const btn = h('button', { class: 'btn lg-btn', type: 'button' }, 'Jetzt!');
  body.append(dial, btn);
  const needle = dial.querySelector('.lg-needle') as SVGGElement;
  const period = 1500 * slow;
  return new Promise((resolve) => {
    const t0 = performance.now();
    let raf = 0;
    let angle = 0;
    let over = false;
    const tick = (t: number) => {
      angle = (((t - t0) / period) * 360) % 360;
      needle.setAttribute('transform', `rotate(${angle.toFixed(1)} 80 80)`);
      if (t - t0 > 4 * period) return finish(true);
      raf = requestAnimationFrame(tick);
    };
    const finish = (timeout = false) => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      const d = Math.abs(((angle - center + 540) % 360) - 180);
      const q: Quality = timeout ? 'miss' : d <= gold ? 'perfect' : d <= green ? 'good' : 'miss';
      void done(q, timeout ? 'Zu lange gezögert' : undefined).then(resolve);
    };
    btn.addEventListener('pointerdown', () => finish());
    dial.addEventListener('pointerdown', () => finish());
    raf = requestAnimationFrame(tick);
  });
}

function pryGame(body: HTMLElement, done: Done, rng: () => number, slow: number): Promise<Quality> {
  // Grüner Bereich irgendwo zwischen 55 und 90 %; Gold in der Mitte
  const lo = 0.55 + rng() * 0.15;
  const hi = lo + 0.2;
  const g0 = lo + 0.07;
  const g1 = hi - 0.07;
  const fill = h('span', { class: 'lg-fill' });
  const bar = h(
    'div',
    { class: 'lg-bar' },
    h('span', { class: 'lg-zone', style: `bottom:${lo * 100}%;height:${(hi - lo) * 100}%` }),
    h('span', { class: 'lg-zone gold', style: `bottom:${g0 * 100}%;height:${(g1 - g0) * 100}%` }),
    fill,
  );
  const btn = h('button', { class: 'btn lg-btn hold', type: 'button' }, svgEl(icon('crowbar', 20)), 'Halten');
  body.append(bar, btn);
  const fillMs = 1300 * slow;
  return new Promise((resolve) => {
    let t0 = 0;
    let raf = 0;
    let v = 0;
    let over = false;
    let started = false;
    const tick = (t: number) => {
      v = (t - t0) / fillMs;
      fill.style.height = `${Math.min(100, v * 100)}%`;
      if (v >= 1.05) return finish('slip');
      raf = requestAnimationFrame(tick);
    };
    const finish = (why?: 'slip' | 'timeout') => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      if (why === 'slip') return void done('miss', 'Abgerutscht!').then(resolve);
      if (why === 'timeout') return void done('miss', 'Zu lange gezögert').then(resolve);
      const q: Quality = v >= g0 && v <= g1 ? 'perfect' : v >= lo && v <= hi ? 'good' : 'miss';
      void done(q, q === 'miss' ? (v < lo ? 'Zu schwach' : 'Zu viel Kraft') : undefined).then(resolve);
    };
    btn.addEventListener('pointerdown', (e) => {
      if (started || over) return;
      started = true;
      btn.setPointerCapture?.(e.pointerId);
      btn.classList.add('down');
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    });
    const up = () => {
      if (started) finish();
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    // Wer gar nicht drückt, versucht es nach ein paar Sekunden eben halbherzig
    setTimeout(() => {
      if (!started) finish('timeout');
    }, 5000 * slow);
  });
}

function rummageGame(body: HTMLElement, done: Done, rng: () => number, slow: number): Promise<Quality> {
  const N = 5;
  const ms = 2600 * slow;
  const timer = h('span', { class: 'lg-timer' }, h('span'));
  const field = h('div', { class: 'lg-field' });
  body.append(field, timer);
  const icons = ['junk', 'stone', 'wood', 'cloth', 'plastic', 'metal'];
  let left = N;
  return new Promise((resolve) => {
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      clearTimeout(to);
      const cleared = N - left;
      const q: Quality = cleared >= N ? 'perfect' : cleared >= 3 ? 'good' : 'miss';
      void done(q).then(resolve);
    };
    for (let i = 0; i < N; i++) {
      const b = h(
        'button',
        { class: 'lg-chunk', type: 'button', style: `left:${8 + ((i * 19 + rng() * 10) % 80)}%;top:${10 + rng() * 62}%;--r:${Math.round(rng() * 60 - 30)}deg`, 'aria-label': 'Schutt wegräumen' },
        svgEl(icon(icons[i % icons.length], 26)),
      );
      b.addEventListener('pointerdown', () => {
        if (over || b.classList.contains('gone')) return;
        b.classList.add('gone');
        left -= 1;
        if (left === 0) finish();
      });
      field.append(b);
    }
    const bar = timer.firstChild as HTMLElement;
    bar.style.transitionDuration = `${ms}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('run')));
    const to = setTimeout(finish, ms);
  });
}
