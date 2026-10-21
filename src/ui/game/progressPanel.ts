// Fortschritt auf einen Blick: Ziele (mit Belohnung zum Abholen), die Stufe der
// Endstation mit ihren Vorteilen und dein Ruf als Streifer.

import { COMFORT_TIERS } from '../../core/building';
import { RANK_POINTS, RANKS, TIER_PERKS } from '../../core/content';
import { claimableGoals, rankOf, visibleGoals } from '../../core/progress';
import { baseTier, comfort } from '../../core/rules';
import { blueprintName } from '../../core/building';
import type { App } from '../app';
import { append, clear, h, svgEl } from '../dom';
import { icon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { costChips, itemsLine } from './chips';

/** Kleine Zielleiste auf der Karte: das nächste Ziel, oder wie viele Belohnungen warten. */
export function goalChip(app: App, onOpen: () => void) {
  const el = h('button', { class: 'env-chip goal-chip', type: 'button', onclick: onOpen });
  const render = () => {
    const s = app.backend.current();
    clear(el);
    if (!s) return;
    const ready = claimableGoals(s);
    const next = visibleGoals(s, 1)[0];
    el.dataset.ready = String(ready > 0);
    if (ready > 0) {
      append(el, [svgEl(icon('star', 15)), h('span', { class: 'goal-title' }, ready === 1 ? 'Belohnung abholen' : `${ready} Belohnungen abholen`)]);
      el.setAttribute('aria-label', 'Belohnungen abholen');
    } else if (next) {
      append(el, [svgEl(icon('flag', 15)), h('span', { class: 'goal-title' }, next.goal.title), h('b', null, `${next.have}/${next.need}`), h('span', { class: 'mini-bar' }, h('span', { style: `width:${(next.have / next.need) * 100}%` }))]);
      el.setAttribute('aria-label', `Nächstes Ziel: ${next.goal.title}`);
    } else append(el, [svgEl(icon('star', 15)), h('span', { class: 'goal-title' }, 'Alle Ziele geschafft')]);
  };
  render();
  return { el, render };
}

export function openProgressPanel(app: App, host: HTMLElement, onClose: () => void, onChanged: () => void) {
  const body = h('div', { class: 'pack-body progress-body' });

  const render = () => {
    const s = app.backend.current()!;
    clear(body);

    // --- Ziele ---
    const goals = visibleGoals(s, 4);
    body.append(
      h('h3', { class: 'gear-head' }, 'Ziele'),
      h(
        'ul',
        { class: 'goal-list' },
        goals.map((g) =>
          h(
            'li',
            { class: 'goal' + (g.done ? ' done' : '') },
            h('span', { class: 'goal-icon' }, svgEl(icon(g.done ? 'star' : 'flag', 20))),
            h(
              'div',
              { class: 'goal-main' },
              h('b', null, g.goal.title),
              h('small', null, g.goal.hint),
              h('span', { class: 'goal-progress' }, h('span', { class: 'mini-bar' }, h('span', { style: `width:${(g.have / g.need) * 100}%` })), `${g.have} / ${g.need}`),
            ),
            h(
              'div',
              { class: 'goal-reward' },
              costChips(g.goal.reward),
              g.goal.blueprint ? h('small', { class: 'goal-bp' }, svgEl(icon('blueprint', 13)), blueprintName(g.goal.blueprint)) : null,
              g.done
                ? h(
                    'button',
                    {
                      class: 'btn small',
                      type: 'button',
                      onclick: async () => {
                        const res = await app.backend.dispatch({ type: 'claimGoal', goal: g.goal.id });
                        const ev = res.events[0];
                        if (ev.type === 'goalClaimed') {
                          app.toast(`Belohnung: ${itemsLine(ev.items)}${ev.blueprint ? ` und Bauplan ${blueprintName(ev.blueprint)}` : ''}. Liegt im Lager.`, 'good');
                          try {
                            if (app.settings.get().vibration) navigator.vibrate?.([30, 40, 60]);
                          } catch {
                            /* egal */
                          }
                        } else if (ev.type === 'rejected') app.toast(REJECT_TEXT[ev.reason], 'warn');
                        onChanged();
                        render();
                      },
                    },
                    'Abholen',
                  )
                : null,
            ),
          ),
        ),
      ),
    );
    if (!goals.length) body.append(h('p', { class: 'mod-desc' }, 'Alle Ziele geschafft. Respekt!'));

    // --- Endstation ---
    const tier = baseTier(s);
    const value = comfort(s);
    const next = COMFORT_TIERS[tier + 1];
    body.append(
      h('h3', { class: 'gear-head' }, 'Deine Endstation'),
      s.base.active
        ? h(
            'div',
            { class: 'tier-box' },
            h('div', { class: 'tier-now' }, h('b', null, COMFORT_TIERS[tier][1]), h('span', null, `Gemütlichkeit ${value}`), next ? h('small', null, `Nächste Stufe „${next[1]}“ ab ${next[0]}`) : h('small', null, 'Höchste Stufe erreicht')),
            next ? h('span', { class: 'mini-bar wide' }, h('span', { style: `width:${Math.min(100, ((value - COMFORT_TIERS[tier][0]) / (next[0] - COMFORT_TIERS[tier][0])) * 100)}%` })) : null,
            h(
              'ul',
              { class: 'perk-list' },
              TIER_PERKS.slice(1).map((p, i) =>
                h('li', { class: i + 1 <= tier ? 'have' : i + 1 === tier + 1 ? 'next' : '' }, svgEl(icon(i + 1 <= tier ? 'check' : 'lock', 15)), h('b', null, COMFORT_TIERS[i + 1][1]), h('span', null, p.desc)),
              ),
            ),
          )
        : h('p', { class: 'mod-desc' }, 'Noch keine Endstation. Tippe auf der Karte unten links auf das Haus.'),
    );

    // --- Streifer-Ruf ---
    const r = rankOf(s);
    body.append(
      h('h3', { class: 'gear-head' }, 'Dein Ruf'),
      h(
        'div',
        { class: 'tier-box rank-box' },
        h('div', { class: 'tier-now' }, h('b', null, r.name), h('span', null, `${r.points} Punkte`), r.next ? h('small', null, `„${r.next.name}“ ab ${r.next.min}`) : h('small', null, 'Höchster Rang')),
        r.next ? h('span', { class: 'mini-bar wide' }, h('span', { style: `width:${Math.min(100, ((r.points - r.from) / (r.next.min - r.from)) * 100)}%` })) : null,
        h('p', { class: 'mod-desc' }, 'Streifer ist kein Amt, sondern ein Ruf: Wer oft genug lebend heimkommt, wird so genannt.'),
        h(
          'p',
          { class: 'mod-desc small' },
          `Punkte gibt es fürs Durchsuchen (${RANK_POINTS.search}), Gegner (${RANK_POINTS.kill}), erkundete Sektoren (${RANK_POINTS.sector}), gesicherte Sektoren (${RANK_POINTS.secured}), Sammelstücke (${RANK_POINTS.collectible}), volle Sets (${RANK_POINTS.set}), Erinnerungsstücke (${RANK_POINTS.memento}) und Verstecke (${RANK_POINTS.cache}).`,
        ),
        h('div', { class: 'rank-steps' }, RANKS.map((x, i) => h('span', { class: i <= r.index ? 'have' : '' }, x.name))),
      ),
    );
  };

  const panel = h(
    'div',
    { class: 'overlay pack-panel progress-panel', role: 'dialog', 'aria-label': 'Fortschritt' },
    h(
      'div',
      { class: 'overlay-inner' },
      h('header', { class: 'topbar' }, h('h1', { class: 'sign-title' }, 'Fortschritt'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: onClose }, svgEl(icon('close')))),
      body,
    ),
  );
  host.append(panel);
  render();
  return panel;
}
