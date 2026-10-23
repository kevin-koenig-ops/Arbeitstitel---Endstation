// Der Werktisch: Kram in echter Zeit zerlegen, Fertiges abholen, Waffen bauen, aufrüsten.
// Es läuft weiter, auch wenn die App zu ist. Fertiges wartet, nichts verdirbt.

import { CARDS, KRAM, KRAM_ORDER, ONCE_CARDS, WEAPON_ORDER, WEAPONS, WORKBENCH_LEVELS } from '../../core/content';
import { CARD_ICON } from '../cards';
import { canAfford, dismantleMs, readyParts, workbenchLevel, workbenchSlots } from '../../core/rules';
import type { Action, KramId, PlayerState } from '../../core/types';
import type { App } from '../app';
import { clear, h, svgEl } from '../dom';
import { icon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { costChips, itemsLine, thingThumb } from '../game/chips';

interface Opts {
  /** Ist man gerade zu Hause? (Zerlegen nur vor Ort, wie Bauen) */
  needHere: () => boolean;
  onChanged: () => void;
  onClose: () => void;
}

/** "noch 3 Min." / "noch 40 s" */
function left(ms: number): string {
  if (ms <= 0) return 'fertig';
  if (ms < 60_000) return `noch ${Math.ceil(ms / 1000)} s`;
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `noch ${min} Min.`;
  const hrs = Math.floor(min / 60);
  return `noch ${hrs} Std. ${min % 60} Min.`;
}

function duration(ms: number): string {
  const min = ms / 60_000;
  return min < 1 ? `${Math.round(ms / 1000)} s` : `${Math.round(min)} Min.`;
}

export function openWorkshop(app: App, host: HTMLElement, opts: Opts): { el: HTMLElement; close: () => void } {
  const body = h('div', { class: 'ws-body' });
  const title = h('div', { class: 'ws-title' });
  const el = h(
    'aside',
    { class: 'workshop', role: 'dialog', 'aria-label': 'Werktisch' },
    h('div', { class: 'ws-head' }, title, h('button', { class: 'iconbtn small', type: 'button', 'aria-label': 'Schließen', onclick: () => close() }, svgEl(icon('close', 18)))),
    body,
  );
  host.append(el);

  const st = (): PlayerState => app.backend.current()!;
  const dispatch = async (a: Action) => {
    if (!opts.needHere()) return null;
    const res = await app.backend.dispatch(a);
    const rej = res.events.find((e) => e.type === 'rejected');
    if (rej && rej.type === 'rejected') {
      app.toast(REJECT_TEXT[rej.reason], 'warn');
      return null;
    }
    opts.onChanged();
    return res;
  };

  // Laufende Anzeigen, die jede Sekunde aktualisiert werden
  let live: { endsAt: number; start: number; bar: HTMLElement; label: HTMLElement }[] = [];
  let readyCount = 0;

  const render = () => {
    const s = st();
    const now = app.backend.now();
    const lvl = workbenchLevel(s);
    // Plätze: Ausbaustufe plus Bonus durch die Gemütlichkeit
    const slots = workbenchSlots(s);
    const bonus = slots - lvl.slots;
    const ws = s.workshop;
    clear(title);
    title.append(svgEl(icon('wrench', 20)), h('b', null, lvl.name), h('small', null, `Stufe ${ws.level} · ${ws.jobs.length} von ${slots} Plätzen${bonus > 0 ? ` (+${bonus} durch Gemütlichkeit)` : ''}`));
    clear(body);
    live = [];

    // --- Auf dem Tisch ---
    const ready = readyParts(s, now);
    readyCount = ready.count;
    const jobs = h('ul', { class: 'ws-jobs' });
    let prevEnd = 0;
    for (const job of ws.jobs) {
      const total = dismantleMs(s, job.kram);
      const start = Math.max(prevEnd, job.endsAt - total);
      prevEnd = job.endsAt;
      const done = job.endsAt <= now;
      const bar = h('span', { class: 'ws-bar' });
      const label = h('span', { class: 'ws-left' }, left(job.endsAt - now));
      jobs.append(
        h(
          'li',
          { class: done ? 'done' : '' },
          thingThumb(job.kram, 40),
          h('div', { class: 'ws-job-main' }, h('b', null, KRAM[job.kram].name), h('span', { class: 'ws-progress' }, bar), label),
          done ? svgEl(icon('check', 18), 'ws-check') : null,
        ),
      );
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, (now - start) / Math.max(1, job.endsAt - start))) * 100)}%`;
      if (!done) live.push({ endsAt: job.endsAt, start, bar, label });
    }
    for (let i = ws.jobs.length; i < slots; i++) jobs.append(h('li', { class: 'free' }, h('span', { class: 'ws-free' }, 'Freier Platz')));
    body.append(h('h3', { class: 'ws-sec' }, 'Auf dem Tisch'), jobs);
    if (ready.count)
      body.append(
        h(
            'button',
            {
              class: 'btn small ws-collect',
              type: 'button',
              onclick: async () => {
                const res = await dispatch({ type: 'collect' });
                const ev = res?.events[0];
                if (ev?.type === 'collected') app.toast(`Abgeholt: ${itemsLine(ev.items)}`, 'good');
                render();
              },
            },
            svgEl(icon('check', 16)),
            `Abholen: ${itemsLine(ready.items)}`,
          ),
      );

    // --- Aus dem Lager ---
    const owned = KRAM_ORDER.filter((j) => (s.kram[j] ?? 0) > 0);
    const full = ws.jobs.length >= slots;
    body.append(h('h3', { class: 'ws-sec' }, 'Zerlegen', h('small', null, full ? 'Der Tisch ist voll' : 'Eins nach dem anderen, in echter Zeit')));
    if (!owned.length) body.append(h('p', { class: 'ws-empty' }, s.packKram && Object.keys(s.packKram).length ? 'Kein Kram im Lager. Pack erst deinen Rucksack aus.' : 'Kein Kram im Lager. Draußen in Autos, Containern und Packstationen findest du welchen.'));
    else
      body.append(
        h(
          'ul',
          { class: 'ws-junk' },
          owned.map((j: KramId) =>
            h(
              'li',
              null,
              thingThumb(j, 44),
              h(
                'div',
                { class: 'ws-junk-main' },
                h('b', null, KRAM[j].name, (s.kram[j] ?? 0) > 1 ? h('span', { class: 'junk-n' }, ` ×${s.kram[j]}`) : null),
                h('span', { class: 'ws-junk-parts' }, costChips(KRAM[j].parts), h('small', null, svgEl(icon('clock', 13)), duration(dismantleMs(s, j)))),
              ),
              h(
                'button',
                {
                  class: 'btn small ghost',
                  type: 'button',
                  disabled: full,
                  onclick: async () => {
                    const res = await dispatch({ type: 'dismantle', kram: j });
                    if (res) app.toast(`${KRAM[j].name} liegt auf dem Werktisch.`);
                    render();
                  },
                },
                'Zerlegen',
              ),
            ),
          ),
        ),
      );

    // --- Waffen bauen ---
    body.append(h('h3', { class: 'ws-sec' }, 'Waffen bauen', h('small', null, 'Sofort fertig, aus dem Lager')));
    body.append(
      h(
        'ul',
        { class: 'ws-junk ws-weapons' },
        WEAPON_ORDER.map((id) => {
          const def = WEAPONS[id];
          const locked = def.level > ws.level;
          const have = s.weapons.filter((w) => w.kind === id).length;
          return h(
            'li',
            null,
            h(
              'div',
              { class: 'ws-junk-main' },
              h('b', null, def.name, have ? h('span', { class: 'junk-n' }, ` (hast du ${have > 1 ? `${have}×` : ''})`) : null),
              h('small', { class: 'ws-weapon-desc' }, `${def.desc} Schaden ${def.dmg}, hält ${def.dur} Schläge.`),
              locked ? h('small', { class: 'ws-weapon-desc' }, svgEl(icon('lock', 12)), ` Braucht Werktisch Stufe ${def.level}`) : costChips(def.cost, s.inventory),
            ),
            h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                disabled: locked || !canAfford(s.inventory, def.cost),
                onclick: async () => {
                  const res = await dispatch({ type: 'craft', weapon: id });
                  if (res?.events[0].type === 'crafted') app.toast(`${def.name} gebaut.`, 'good');
                  render();
                },
              },
              'Bauen',
            ),
          );
        }),
      ),
    );

    // --- Einmal-Karten bauen (Brandflasche, Rauchdose, Krähenfüße) ---
    const craftable = ONCE_CARDS.filter((id) => CARDS[id].craft);
    body.append(h('h3', { class: 'ws-sec' }, 'Für den Kampf', h('small', null, 'Einmal-Karten, sofort fertig')));
    body.append(
      h(
        'ul',
        { class: 'ws-junk ws-weapons' },
        craftable.map((id) => {
          const def = CARDS[id];
          const have = (s.packCards[id] ?? 0) + (s.stash[id] ?? 0);
          return h(
            'li',
            null,
            h('span', { class: `ws-card-ico rar-${def.rarity ?? 'common'}` }, svgEl(icon(CARD_ICON[id], 24))),
            h(
              'div',
              { class: 'ws-junk-main' },
              h('b', null, def.name, have ? h('span', { class: 'junk-n' }, ` (hast du ${have})`) : null),
              h('small', { class: 'ws-weapon-desc' }, def.desc),
              costChips(def.craft!, s.inventory),
            ),
            h(
              'button',
              {
                class: 'btn small ghost',
                type: 'button',
                disabled: !canAfford(s.inventory, def.craft!),
                onclick: async () => {
                  const res = await dispatch({ type: 'craftCard', card: id });
                  if (res?.events[0].type === 'crafted') app.toast(`${def.name} gebaut. Ist die Sorte in deiner Tasche, packst du bis zu 3 ein.`, 'good');
                  render();
                },
              },
              'Bauen',
            ),
          );
        }),
      ),
    );

    // --- Aufrüsten ---
    const next = WORKBENCH_LEVELS[ws.level];
    if (next) {
      const faster = Math.round((1 - next.speed / lvl.speed) * 100);
      body.append(
        h('h3', { class: 'ws-sec' }, 'Aufrüsten'),
        h(
          'div',
          { class: 'ws-upgrade' },
          h('div', null, h('b', null, next.name), h('small', null, `${next.slots} Plätze statt ${lvl.slots}, ${faster} % schneller`)),
          costChips(next.cost, s.inventory),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              disabled: !canAfford(s.inventory, next.cost),
              onclick: async () => {
                const res = await dispatch({ type: 'upgradeWorkbench' });
                if (res) app.toast(`Aufgerüstet: ${next.name}`, 'good');
                render();
              },
            },
            svgEl(icon('upgrade', 16)),
            'Aufrüsten',
          ),
        ),
      );
    } else body.append(h('p', { class: 'ws-empty' }, 'Voll ausgebaut. Mehr geht nicht.'));
  };

  const tick = window.setInterval(() => {
    const now = app.backend.now();
    // Fertig geworden? Dann alles neu (Abholen-Knopf erscheint)
    if (readyParts(st(), now).count !== readyCount) return render();
    for (const l of live) {
      l.label.textContent = left(l.endsAt - now);
      l.bar.style.width = `${Math.round(Math.min(1, Math.max(0, (now - l.start) / Math.max(1, l.endsAt - l.start))) * 100)}%`;
    }
  }, 1000);

  const close = () => {
    clearInterval(tick);
    el.remove();
    opts.onClose();
  };

  render();
  return { el, close };
}
