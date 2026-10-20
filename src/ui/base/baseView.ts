// Die Endstation einrichten: 3D-Ansicht, Bauleiste, Platzieren, Umstellen, Einlagern.

import { RESOURCE_ORDER, RESOURCES } from '../../core/content';
import { distanceM, formatDistance } from '../../core/geo';
import {
  BLUEPRINT_SOURCES,
  CATEGORY_NAMES,
  footprint,
  FURNITURE,
  FURNITURE_ORDER,
  HALL_D,
  HALL_W,
  RUBBLE,
  RUBBLE_REWARD,
  type FurnitureCategory,
  type FurnitureId,
} from '../../core/furniture';
import { canAfford, comfort, comfortTier, knowsBlueprint, placementProblem } from '../../core/rules';
import type { DayPhase } from '../../core/sun';
import type { Action, SpotKind } from '../../core/types';
import { BaseScene, renderThumbnails } from '../../base/BaseScene';
import { atBase, getBasePlace, setBasePlace } from '../../services/basePlace';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { append, clear, h, svgEl } from '../dom';
import { costChips } from '../game/busPanel';
import { icon, resIcon } from '../icons';
import { REJECT_TEXT } from '../texts';

const SOURCE_NAMES: Partial<Record<SpotKind, string>> = {
  stop: 'Bushaltestellen',
  hardware: 'Baumärkten und Werkstätten',
  market: 'Supermärkten',
  pharmacy: 'Apotheken',
  fuel: 'Tankstellen',
  shed: 'Gartenlauben',
  container: 'Containern',
  parcel: 'Packstationen',
};

function whereToFind(kind: FurnitureId): string {
  const places = (Object.entries(BLUEPRINT_SOURCES) as [SpotKind, FurnitureId[]][])
    .filter(([, list]) => list.includes(kind))
    .map(([k]) => SOURCE_NAMES[k])
    .filter(Boolean);
  return places.length ? `Bauplan an ${places.join(' oder ')}` : 'Bauplan fehlt';
}

let thumbs: Record<string, string> | null = null;

type Mode =
  | { kind: 'browse' }
  | { kind: 'place'; item: FurnitureId; x: number; y: number; rot: number; uid?: number }
  | { kind: 'selected'; uid: number }
  | { kind: 'rubble'; id: string };

interface Opts {
  getFix: () => Fix | null;
  phase: () => DayPhase;
  onClose: () => void;
  onChanged: () => void;
}

export function openBaseView(app: App, host: HTMLElement, opts: Opts): HTMLElement {
  const stage = h('div', { class: 'base-stage' });
  const comfortEl = h('div', { class: 'comfort' });
  const resEl = h('div', { class: 'base-res' });
  const away = h('div', { class: 'base-away', hidden: true });
  const bottom = h('div', { class: 'base-bottom' });
  let tab: FurnitureCategory | 'all' = 'all';
  let mode: Mode = { kind: 'browse' };

  const el = h(
    'div',
    { class: 'overlay base-view', role: 'dialog', 'aria-label': 'Die Endstation' },
    stage,
    h(
      'header',
      { class: 'base-head' },
      h('div', { class: 'base-title-row' }, h('h1', { class: 'sign-title' }, 'Endstation'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: () => close() }, svgEl(icon('close')))),
      h('div', { class: 'base-info' }, comfortEl, resEl),
      away,
    ),
    h(
      'div',
      { class: 'base-cam' },
      h('button', { class: 'iconbtn small', type: 'button', 'aria-label': 'Nach links drehen', onclick: () => scene.rotate(-Math.PI / 4) }, svgEl(icon('rotl', 18))),
      h('button', { class: 'iconbtn small', type: 'button', 'aria-label': 'Nach rechts drehen', onclick: () => scene.rotate(Math.PI / 4) }, svgEl(icon('rotr', 18))),
    ),
    bottom,
  );
  host.append(el);

  const scene = new BaseScene(stage);
  scene.setPhase(opts.phase());
  el.dataset.phase = opts.phase();
  if (!thumbs) {
    try {
      thumbs = renderThumbnails(FURNITURE_ORDER);
    } catch {
      thumbs = {};
    }
  }

  const state = () => app.backend.current()!;
  const here = () => {
    const f = opts.getFix();
    return atBase(getBasePlace(), f?.pos ?? null, f?.accuracyM ?? 0);
  };

  // --- Kopfzeile ------------------------------------------------------------------------
  const renderHead = () => {
    const s = state();
    const c = comfort(s);
    const tier = comfortTier(c);
    clear(comfortEl);
    comfortEl.append(
      h('span', { class: 'comfort-label' }, 'Gemütlichkeit'),
      h('b', null, String(c)),
      h('span', { class: 'comfort-tier' }, tier.name),
      h('span', { class: 'mini-bar' }, h('span', { style: `width:${tier.next ? Math.min(100, (c / tier.next) * 100) : 100}%` })),
    );
    clear(resEl);
    for (const r of RESOURCE_ORDER) resEl.append(h('span', { class: 'cost-chip', title: RESOURCES[r].name }, svgEl(resIcon(r, 14)), String(s.inventory[r])));
    const f = opts.getFix();
    const place = getBasePlace();
    if (here()) {
      away.hidden = true;
    } else {
      away.hidden = false;
      clear(away);
      const dist = place && f ? distanceM(place.pos, f.pos) : null;
      const moveBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Hierher umziehen');
      moveBtn.addEventListener('click', () => {
        if (!f) return;
        if (moveBtn.dataset.armed) {
          setBasePlace(f.pos);
          app.toast('Die Endstation ist umgezogen. Die Einrichtung kommt mit.', 'good');
          render();
          return;
        }
        moveBtn.dataset.armed = '1';
        moveBtn.textContent = 'Wirklich? Nochmal tippen';
      });
      append(away, [
        h('span', null, dist !== null ? `Du bist ${formatDistance(dist)} entfernt. Ansehen geht immer, bauen nur vor Ort.` : 'Ohne Standort kannst du nur ansehen.'),
        f ? moveBtn : null,
      ]);
    }
  };

  // --- Unterer Bereich: Bauleiste oder Kontextleiste -----------------------------------
  const render = () => {
    renderHead();
    scene.setState(state());
    clear(bottom);
    if (mode.kind === 'browse') renderDrawer();
    else if (mode.kind === 'place') renderPlaceBar();
    else if (mode.kind === 'selected') renderSelectedBar();
    else renderRubbleBar();
  };

  const renderDrawer = () => {
    scene.hideGhost();
    scene.unmark();
    scene.onDragCell = null;
    const s = state();
    const cats: (FurnitureCategory | 'all')[] = ['all', 'moebel', 'licht', 'deko', 'garten'];
    const tabs = h(
      'div',
      { class: 'drawer-tabs', role: 'tablist' },
      cats.map((c) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === c), onclick: () => ((tab = c), render()) }, c === 'all' ? 'Alles' : CATEGORY_NAMES[c]),
      ),
    );
    const kinds = FURNITURE_ORDER.filter((k) => tab === 'all' || FURNITURE[k].category === tab).sort(
      (a, b) => Number(knowsBlueprint(s, b)) - Number(knowsBlueprint(s, a)),
    );
    const list = h(
      'div',
      { class: 'drawer-list' },
      kinds.map((k) => {
        const def = FURNITURE[k];
        const known = knowsBlueprint(s, k);
        const afford = canAfford(s.inventory, def.cost);
        return h(
          'button',
          {
            class: 'fcard' + (known ? '' : ' locked') + (known && !afford ? ' poor' : ''),
            type: 'button',
            onclick: () => startPlace(k),
            'aria-label': `${def.name}${known ? '' : ', Bauplan fehlt'}`,
          },
          h('span', { class: 'fthumb' }, thumbs?.[k] ? h('img', { src: thumbs[k], alt: '' }) : null, known ? null : svgEl(icon('lock', 16), 'flock')),
          h('span', { class: 'fname' }, def.name),
          known ? costChips(def.cost, s.inventory) : h('span', { class: 'fhint' }, whereToFind(k)),
        );
      }),
    );
    append(bottom, [
      tabs,
      list,
      state().base.rubble.length ? h('p', { class: 'drawer-hint' }, 'Tipp: Räum zuerst den Schutt weg. Tippe ihn an.') : null,
    ]);
  };

  const firstFree = (k: FurnitureId, rot: number) => {
    const s = state();
    const f = footprint(k, rot);
    const cx = Math.floor((HALL_W - f.w) / 2);
    const cy = Math.floor((HALL_D - f.d) / 2);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = 0; y + f.d <= HALL_D; y++)
      for (let x = 0; x + f.w <= HALL_W; x++) {
        if (placementProblem(s, k, x, y, rot)) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bestD) (bestD = d), (best = { x, y });
      }
    return best ?? { x: cx, y: cy };
  };

  const startPlace = (k: FurnitureId) => {
    const s = state();
    const def = FURNITURE[k];
    if (!knowsBlueprint(s, k)) {
      app.toast(`${def.name}: ${whereToFind(k)}.`);
      return;
    }
    if (!canAfford(s.inventory, def.cost)) {
      app.toast(`Für ${def.name} fehlt dir Material.`, 'warn');
      return;
    }
    if (!here()) {
      app.toast('Bauen geht nur an deiner Endstation.', 'warn');
      return;
    }
    const pos = firstFree(k, 0);
    mode = { kind: 'place', item: k, x: pos.x, y: pos.y, rot: 0 };
    render();
  };

  const updateGhost = () => {
    if (mode.kind !== 'place') return;
    const ok = !placementProblem(state(), mode.item, mode.x, mode.y, mode.rot, mode.uid);
    scene.showGhost(mode.item, mode.x, mode.y, mode.rot, ok);
    const confirm = bottom.querySelector<HTMLButtonElement>('.confirm-place');
    if (confirm) confirm.disabled = !ok;
  };

  const renderPlaceBar = () => {
    if (mode.kind !== 'place') return;
    const m = mode;
    if (m.uid !== undefined) scene.setItemHidden(m.uid, true);
    scene.onDragCell = (fx, fz) => {
      const f = footprint(m.item, m.rot);
      m.x = Math.max(0, Math.min(HALL_W - f.w, Math.round(fx - f.w / 2)));
      m.y = Math.max(0, Math.min(HALL_D - f.d, Math.round(fz - f.d / 2)));
      updateGhost();
    };
    bottom.append(
      h(
        'div',
        { class: 'ctx-bar' },
        h('div', { class: 'ctx-title' }, FURNITURE[m.item].name, h('small', null, 'Zieh es an seinen Platz')),
        h(
          'div',
          { class: 'ctx-actions' },
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => cancelPlace() }, 'Abbrechen'),
          h(
            'button',
            {
              class: 'btn ghost small',
              type: 'button',
              onclick: () => {
                m.rot = (m.rot + 1) % 4;
                const f = footprint(m.item, m.rot);
                m.x = Math.min(m.x, HALL_W - f.w);
                m.y = Math.min(m.y, HALL_D - f.d);
                updateGhost();
              },
            },
            svgEl(icon('rotr', 16)),
            'Drehen',
          ),
          h('button', { class: 'btn small confirm-place', type: 'button', onclick: () => confirmPlace() }, svgEl(icon('check', 16)), 'Hinstellen'),
        ),
      ),
    );
    updateGhost();
  };

  const cancelPlace = () => {
    if (mode.kind === 'place' && mode.uid !== undefined) scene.setItemHidden(mode.uid, false);
    mode = { kind: 'browse' };
    render();
  };

  const dispatch = async (a: Action) => {
    const res = await app.backend.dispatch(a);
    const rej = res.events.find((e) => e.type === 'rejected');
    if (rej && rej.type === 'rejected') {
      app.toast(REJECT_TEXT[rej.reason], 'warn');
      return false;
    }
    opts.onChanged();
    return res;
  };

  const confirmPlace = async () => {
    if (mode.kind !== 'place') return;
    const m = mode;
    const res =
      m.uid !== undefined
        ? await dispatch({ type: 'move', uid: m.uid, x: m.x, y: m.y, rot: m.rot })
        : await dispatch({ type: 'place', kind: m.item, x: m.x, y: m.y, rot: m.rot });
    if (!res) return;
    if (m.uid !== undefined) scene.setItemHidden(m.uid, false);
    mode = { kind: 'browse' };
    render();
  };

  const renderSelectedBar = () => {
    if (mode.kind !== 'selected') return;
    const uid = mode.uid;
    const it = state().base.items.find((i) => i.uid === uid);
    if (!it) {
      mode = { kind: 'browse' };
      return render();
    }
    scene.onDragCell = null;
    scene.mark(it.kind, it.x, it.y, it.rot);
    const def = FURNITURE[it.kind];
    const canBuild = here();
    bottom.append(
      h(
        'div',
        { class: 'ctx-bar' },
        h('div', { class: 'ctx-title' }, def.name, h('small', null, `${def.desc} Gemütlichkeit +${def.comfort}`)),
        h(
          'div',
          { class: 'ctx-actions' },
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => ((mode = { kind: 'browse' }), render()) }, 'Fertig'),
          h(
            'button',
            { class: 'btn ghost small', type: 'button', disabled: !canBuild, onclick: () => ((mode = { kind: 'place', item: it.kind, x: it.x, y: it.y, rot: it.rot, uid }), render()) },
            'Umstellen',
          ),
          h(
            'button',
            {
              class: 'btn ghost small',
              type: 'button',
              disabled: !canBuild,
              onclick: async () => {
                if (await dispatch({ type: 'store', uid })) {
                  app.toast(`${def.name} eingelagert. Material zurück.`);
                  mode = { kind: 'browse' };
                  render();
                }
              },
            },
            'Einlagern',
          ),
        ),
      ),
    );
  };

  const renderRubbleBar = () => {
    if (mode.kind !== 'rubble') return;
    const id = mode.id;
    const r = RUBBLE.find((x) => x.id === id)!;
    scene.mark(null, r.x, r.y, 0, '#ffb22e', r.w, r.d);
    bottom.append(
      h(
        'div',
        { class: 'ctx-bar' },
        h('div', { class: 'ctx-title' }, 'Schutt', h('small', null, 'Weg damit, dann ist hier Platz. Darin steckt noch brauchbares Material.')),
        h(
          'div',
          { class: 'ctx-actions' },
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => ((mode = { kind: 'browse' }), render()) }, 'Abbrechen'),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              disabled: !here(),
              onclick: async () => {
                if (await dispatch({ type: 'clearRubble', id })) {
                  app.toast(`Weggeräumt: +${RUBBLE_REWARD.material} Material`, 'good');
                  mode = { kind: 'browse' };
                  render();
                }
              },
            },
            `Wegräumen (+${RUBBLE_REWARD.material} Material)`,
          ),
        ),
      ),
    );
  };

  scene.onTap = (p) => {
    if (mode.kind === 'place') {
      if (p?.type === 'floor') {
        const f = footprint(mode.item, mode.rot);
        mode.x = Math.max(0, Math.min(HALL_W - f.w, p.x - Math.floor(f.w / 2)));
        mode.y = Math.max(0, Math.min(HALL_D - f.d, p.y - Math.floor(f.d / 2)));
        updateGhost();
      }
      return;
    }
    if (p?.type === 'item') mode = { kind: 'selected', uid: p.uid };
    else if (p?.type === 'rubble') mode = { kind: 'rubble', id: p.id };
    else mode = { kind: 'browse' };
    render();
  };

  const tick = window.setInterval(renderHead, 5000);
  const close = () => {
    clearInterval(tick);
    scene.dispose();
    el.remove();
    opts.onClose();
  };

  render();
  return el;
}

/** Erklär-Dialog: Endstation an diesem Ort errichten. */
export function openSetBase(app: App, host: HTMLElement, getFix: () => Fix | null, onDone: (set: boolean) => void): HTMLElement {
  const f = getFix();
  const ok = !!f && f.accuracyM <= 80;
  const el = h(
    'div',
    { class: 'overlay set-base', role: 'dialog', 'aria-label': 'Endstation festlegen' },
    h(
      'div',
      { class: 'overlay-inner narrow-box' },
      h('div', { class: 'sign' }, h('span', null, 'Endstation')),
      h('p', { class: 'set-base-lead' }, 'Wähle einen Ort für deine Basis, zum Beispiel dein Zuhause. Dort richtest du die alte Wartehalle ein.'),
      h(
        'ul',
        { class: 'intro-how' },
        h('li', null, h('b', null, 'Nur du weißt, wo sie liegt.'), ' Der Ort bleibt auf diesem Gerät und wird nie geteilt.'),
        h('li', null, h('b', null, 'Bauen geht nur vor Ort'), ' (Umkreis etwa 150 m). Ansehen geht überall.'),
        h('li', null, h('b', null, 'Umziehen'), ' kannst du jederzeit, die Einrichtung kommt mit.'),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => (el.remove(), onDone(false)) }, 'Später'),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            disabled: !ok,
            onclick: () => {
              const fix = getFix();
              if (!fix) return;
              setBasePlace(fix.pos);
              el.remove();
              app.toast('Deine Endstation steht. Jetzt erst mal den Schutt wegräumen!', 'good');
              onDone(true);
            },
          },
          ok ? 'Hier errichten' : 'Warte auf genaues GPS …',
        ),
      ),
    ),
  );
  host.append(el);
  return el;
}
