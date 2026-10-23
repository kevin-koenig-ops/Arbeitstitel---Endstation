// Dein Zuhause: Gelände ansehen, einrichten, frei bauen und zurückerobern.
//
// Bedienung: ein Finger schiebt die Ansicht, zwei Finger zoomen. Mit einem Bau-Werkzeug
// zieht ein Finger Wände, Böden oder Dächer auf (dann schieben zwei Finger die Ansicht).
// Gedreht wird nur mit den Knöpfen rechts.

import {
  BLUEPRINT_SOURCES,
  canReclaim,
  cellKey,
  furnitureMs,
  lineEdges,
  obstacleMs,
  OBSTACLES,
  pendingSections,
  pieceMs,
  sectionMs,
  PIECE_ORDER,
  PIECES,
  planDemolish,
  planOpening,
  planPaint,
  planWalls,
  plotComfort,
  reclaimCost,
  rectCells,
  roomEdges,
  SECTIONS,
  SITES,
  type BlueprintId,
  type BuildPlan,
  type FloorId,
  type OpeningId,
  type PieceGroup,
  type PieceId,
  type RoofId,
  type WallId,
  PLOT,
  SECTION,
} from '../../core/building';
import { COOK, MATERIAL_ORDER, RADIO_LINES, RESOURCE_ORDER, RESOURCES, TIER_PERKS } from '../../core/content';
import { CATEGORY_NAMES, footprint, FURNITURE, FURNITURE_ORDER, isCollectible, type FurnitureCategory, type FurnitureId } from '../../core/furniture';
import { distanceM, formatDistance } from '../../core/geo';
import { activePlot, baseTier, canAfford, collectiblePlaced, comfortTier, isFed, itemYield, knowsBlueprint, packCount, pendingHarvest, placementProblem, plotIndexOf, radioReadyIn, readyParts } from '../../core/rules';
import { formatWait } from '../game/spotSheet';
import type { DayPhase } from '../../core/sun';
import type { WeatherKind } from '../../services/weather';
import type { Action, Inventory, PlayerState, SpotKind } from '../../core/types';
import { BaseScene, type Hit } from '../../base/BaseScene';
import { WALL_H } from '../../base/structures';
import { thumbnails } from '../../base/thumbs';
import { atBase, getBasePlace, setBasePlace } from '../../services/basePlace';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { append, clear, h, svgEl } from '../dom';
import { costChips, itemsLine, missingText } from '../game/chips';
import { icon, resIcon } from '../icons';
import { REJECT_TEXT } from '../texts';
import { Joystick, useButton } from '../joystick';
import { openSitePicker } from './sitePicker';
import { openWorkshop } from './workshop';
import { openLager, unpack } from './lager';
import { durationText, jobOf, jobProgress, leftText } from './buildTime';

export { openSitePicker };

/** Merkt sich auf diesem Gerät, ob das Lager oben aufgeklappt ist. */
const LAGER_OPEN_KEY = 'endstation.lagerOpen';

/** Bunte gefaltete Karte mit Stecknadel für das Schild „Zur Karte“. */
const MAP_ART =
  '<svg viewBox="0 0 48 42" width="44" height="38" aria-hidden="true">' +
  '<path d="M3 9.5l13-5 15 5 14-5v28l-14 5-15-5-13 5z" fill="#2a1a0e"/>' +
  '<path d="M5 10.8l11-4.2v26.5L5 37.3z" fill="#8fc6df"/>' +
  '<path d="M16 6.6l15 5v26.5l-15-5z" fill="#efe1b4"/>' +
  '<path d="M31 11.6l12-4.3v26.5l-12 4.3z" fill="#86b863"/>' +
  '<path d="M7 18c3 1 5-1 8 0M18 15l11 5M19 27c4-2 7 1 10 0M33 21c3-1 5 1 8-1" fill="none" stroke="#fff6dc" stroke-width="1.3" stroke-linecap="round" opacity="0.85"/>' +
  '<path d="M33 1.5c-4.2 0-7.3 3.1-7.3 7 0 4.9 7.3 12.3 7.3 12.3s7.3-7.4 7.3-12.3c0-3.9-3.1-7-7.3-7z" fill="#e2412b" stroke="#2a1a0e" stroke-width="1.4"/>' +
  '<circle cx="33" cy="8.4" r="2.6" fill="#fff3df"/>' +
  '</svg>';

const SOURCE_NAMES: Partial<Record<SpotKind, string>> = {
  stop: 'Bushaltestellen',
  hardware: 'Baumärkten',
  market: 'Supermärkten',
  pharmacy: 'Apotheken',
  fuel: 'Tankstellen',
  shed: 'Gartenlauben',
  container: 'Containern',
  parcel: 'Paketschränke',
  hide: 'Hochsitzen',
  backpack: 'Rucksäcken',
};

function whereToFind(id: BlueprintId): string {
  const places = (Object.entries(BLUEPRINT_SOURCES) as [SpotKind, BlueprintId[]][])
    .filter(([, list]) => list.includes(id))
    .map(([k]) => SOURCE_NAMES[k])
    .filter(Boolean);
  return places.length ? `Bauplan an ${places.slice(0, 2).join(' oder ')}` : 'Bauplan fehlt';
}

type Top = 'furnish' | 'build' | 'land';
type BuildTab = 'walls' | 'fences' | 'openings' | 'floors' | 'roofs';
type Layer = 'walls' | 'openings' | 'floors' | 'roofs';

const BUILD_TABS: Record<BuildTab, { name: string; icon: string; group: PieceGroup; layer: Layer }> = {
  walls: { name: 'Wände', icon: 'wall', group: 'wall', layer: 'walls' },
  fences: { name: 'Zäune', icon: 'fence', group: 'fence', layer: 'walls' },
  openings: { name: 'Türen', icon: 'door', group: 'opening', layer: 'openings' },
  floors: { name: 'Böden', icon: 'floor', group: 'floor', layer: 'floors' },
  roofs: { name: 'Dächer', icon: 'roof', group: 'roof', layer: 'roofs' },
};
const BUILD_ORDER = Object.keys(BUILD_TABS) as BuildTab[];

type Pt = { x: number; y: number };
interface ToolMode {
  kind: 'tool';
  tab: BuildTab;
  /** null = Abreißen */
  piece: PieceId | null;
  shape: 'line' | 'room';
  a: Pt | null;
  b: Pt | null;
  /** Gezogen und wartet auf Bestätigung */
  pending: boolean;
}
type Mode =
  | { kind: 'browse' }
  | { kind: 'place'; item: FurnitureId; x: number; y: number; rot: number; uid?: number }
  | { kind: 'selected'; uid: number }
  | { kind: 'obstacle'; id: string }
  | ToolMode
  | { kind: 'section'; sx: number; sy: number };

interface Opts {
  getFix: () => Fix | null;
  phase: () => DayPhase;
  weather: () => WeatherKind;
  onClose: () => void;
  onChanged: () => void;
}

const COLORS = { ok: '#a8e08a', bad: '#e8735a', erase: '#ff7a5a', amber: '#ffb22e' };

function netCost(plan: BuildPlan): { pay: Partial<Inventory>; back: Partial<Inventory> } {
  const pay: Partial<Inventory> = {};
  const back: Partial<Inventory> = {};
  for (const r of RESOURCE_ORDER) {
    const v = (plan.cost[r] ?? 0) - (plan.refund[r] ?? 0);
    if (v > 0) pay[r] = v;
    else if (v < 0) back[r] = -v;
  }
  return { pay, back };
}

/** Kleiner Schließen-Knopf links in der schwebenden Leiste. */
function ctxClose(label: string, onClick: () => void): HTMLElement {
  return h('button', { class: 'iconbtn small ctx-close', type: 'button', 'aria-label': label, title: label, onclick: onClick }, svgEl(icon('close', 16)));
}

export function openBaseView(app: App, host: HTMLElement, opts: Opts): HTMLElement {
  const stage = h('div', { class: 'base-stage' });
  const titleEl = h('div', { class: 'base-title' });
  // Antippen: was die Stufe bringt und was die nächste bringen würde
  const comfortEl = h('button', {
    class: 'comfort',
    type: 'button',
    onclick: () => {
      const t = baseTier(st());
      const have = TIER_PERKS.slice(1, t + 1).map((p) => p.desc);
      const next = TIER_PERKS[t + 1];
      app.toast(`${have.length ? `Deine Vorteile: ${have.join(' ')}` : 'Noch keine Vorteile.'}${next ? ` Nächste Stufe: ${next.desc}` : ''}`);
    },
  });
  // Lager: zugeklappt nur das Schild, aufgeklappt alle Rohstoffe. Die Zahlen antippen öffnet das Lager.
  const resToggle = h('button', { class: 'base-res-label', type: 'button', onclick: () => setLager(!lagerOpen) });
  // Eine Zeile zum Wischen (kein <button>, darin scrollt es nicht überall); Antippen öffnet das Lager
  const resChips = h('div', {
    class: 'base-res-chips',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Lager öffnen',
    title: 'Lager öffnen',
    onclick: () => openStore(),
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') openStore();
    },
  });
  const resEl = h('div', { class: 'base-res' }, resToggle, resChips);
  let lagerOpen = false;
  try {
    lagerOpen = localStorage.getItem(LAGER_OPEN_KEY) === '1';
  } catch {
    // Kein Speicher (privates Fenster): bleibt zu
  }
  const setLager = (open: boolean) => {
    lagerOpen = open;
    resEl.dataset.open = String(open);
    resToggle.setAttribute('aria-expanded', String(open));
    resToggle.setAttribute('aria-label', open ? 'Lager zuklappen' : 'Lager aufklappen');
    try {
      localStorage.setItem(LAGER_OPEN_KEY, open ? '1' : '0');
    } catch {
      // egal, dann eben nur für jetzt
    }
  };
  setLager(lagerOpen);
  const workChip = h('button', { class: 'work-chip', type: 'button', hidden: true, onclick: () => openWork() });
  const harvestChip = h('button', { class: 'work-chip ready', type: 'button', hidden: true, onclick: () => void harvestAll() });
  // Bauliste: was gerade gebaut wird (läuft in echter Zeit, auch ohne Spielen)
  const buildChip = h('button', { class: 'work-chip build-chip', type: 'button', hidden: true, onclick: () => toggleBuildList() });
  let buildList: HTMLElement | null = null;
  const packCard = h('button', { class: 'pack-card', type: 'button', hidden: true, onclick: () => void doUnpack() });
  const away = h('div', { class: 'base-away', hidden: true });
  const head = h(
    'header',
    { class: 'base-head' },
    h('div', { class: 'base-title-row' }, titleEl, h('button', { class: 'base-exit', type: 'button', onclick: () => close() }, svgEl(MAP_ART, 'exit-art'), h('span', null, 'Zur Karte'))),
    h('div', { class: 'base-info' }, comfortEl, resEl, workChip, buildChip, harvestChip),
    packCard,
    away,
  );
  // Seitenleiste im Baumodus und schwebende Leiste für Auswahl/Bestätigung
  const panelBody = h('div', { class: 'panel-body' });
  const panel = h(
    'aside',
    { class: 'base-panel', 'aria-label': 'Baumodus' },
    h('div', { class: 'panel-head' }, h('b', null, svgEl(icon('hammer', 18)), 'Baumodus'), h('button', { class: 'btn small', type: 'button', onclick: () => setBuilding(false) }, svgEl(icon('check', 16)), 'Fertig')),
    panelBody,
  );
  const ctx = h('div', { class: 'base-ctx' });
  const buildToggle = h('button', { class: 'build-toggle', type: 'button', onclick: () => setBuilding(true) }, svgEl(icon('hammer', 22)), h('span', null, 'Bauen'));
  const controls = h('div', { class: 'base-controls' });
  // Ansicht: farbige runde Knöpfe mit Beschriftung, unten links
  const camBtn = (color: string, ic: string, label: string, aria: string, onClick?: () => void) =>
    h('button', { class: `cam-btn ${color}`, type: 'button', 'aria-label': aria, title: aria, onclick: onClick }, h('span', { class: 'cam-disc' }, svgEl(icon(ic, 22))), h('span', { class: 'cam-label' }, label));
  const roofBtn = camBtn('c-orange', 'roof', 'Dächer', 'Dächer zeigen');
  roofBtn.setAttribute('aria-pressed', 'false');
  const wallBtn = camBtn('c-rose', 'cutaway', 'Wände', 'Wände: Ausschnitt');
  const cam = h(
    'div',
    { class: 'base-cam' },
    camBtn('c-red', 'rotl', 'Links drehen', 'Ansicht nach links drehen', () => scene.rotateStep(-1)),
    camBtn('c-blue', 'rotr', 'Rechts drehen', 'Ansicht nach rechts drehen', () => scene.rotateStep(1)),
    roofBtn,
    wallBtn,
    camBtn('c-green', 'fit', 'Übersicht', 'Ganzes Gelände zeigen', () => scene.fitPlot()),
  );
  const el = h('div', { class: 'overlay base-view', role: 'dialog', 'aria-label': 'Dein Zuhause' }, stage, head, cam, controls, buildToggle, ctx, panel);
  host.append(el);

  let top: Top = 'furnish';
  let furnTab: FurnitureCategory | 'all' = 'all';
  let buildTab: BuildTab = 'walls';
  let mode: Mode = { kind: 'browse' };
  let roofs = false;
  let wallView: 'cut' | 'full' | 'low' = 'cut';
  let building = false;
  const control = app.settings.get().control;
  el.dataset.control = control;

  const scene = new BaseScene(stage);
  scene.setWaterMotion(app.settings.get().waterMotion);
  const offSettings = app.settings.onChange((st) => scene.setWaterMotion(st.waterMotion));
  // Zum Testen: die Szene von außen erreichbar machen (nur mit Debug-Schalter)
  if (localStorage.getItem('endstation.debug')) (window as unknown as { __baseScene?: BaseScene }).__baseScene = scene;
  scene.setPhase(opts.phase());
  scene.setWeather(opts.weather());
  el.dataset.phase = opts.phase();

  const st = (): PlayerState => app.backend.current()!;
  let idxCache: { s: PlayerState; idx: ReturnType<typeof plotIndexOf> } | null = null;
  const idx = () => {
    const s = st();
    if (!idxCache || idxCache.s !== s) idxCache = { s, idx: plotIndexOf(s) };
    return idxCache.idx!;
  };
  const plot = () => activePlot(st())!;
  const here = () => {
    const f = opts.getFix();
    return atBase(getBasePlace(), f?.pos ?? null, f?.accuracyM ?? 0);
  };
  const needHere = () => {
    if (here()) return true;
    app.toast('Bauen geht nur bei dir zu Hause. Ansehen geht überall.', 'warn');
    return false;
  };

  roofBtn.addEventListener('click', () => {
    roofs = !roofs;
    roofBtn.setAttribute('aria-pressed', String(roofs));
    roofBtn.setAttribute('aria-label', roofs ? 'Dächer ausblenden' : 'Dächer zeigen');
    scene.setRoofsVisible(roofs);
  });
  wallBtn.addEventListener('click', () => {
    wallView = wallView === 'cut' ? 'low' : wallView === 'low' ? 'full' : 'cut';
    const names = { cut: 'Ausschnitt', low: 'niedrig', full: 'hoch' };
    wallBtn.setAttribute('aria-label', `Wände: ${names[wallView]}`);
    wallBtn.dataset.view = wallView;
    scene.setWallView(wallView);
    app.toast(`Wände: ${names[wallView]}`);
  });

  // --- Daten an die Szene ------------------------------------------------------------------
  const sync = () => {
    const s = st();
    const p = activePlot(s);
    if (!p || !s.base.active) return;
    scene.setLook(s.character.look);
    scene.setData({ seed: s.playerId, site: s.base.active, plot: p, idx: idx() });
  };

  // --- Kopfzeile -------------------------------------------------------------------------
  const renderHead = () => {
    const s = st();
    const site = s.base.active ? SITES[s.base.active] : null;
    clear(titleEl);
    titleEl.append(h('h1', { class: 'sign-title' }, 'Zuhause'), site ? h('span', { class: 'base-site' }, `${site.name} · ${site.where}`) : '');
    const c = plotComfort(plot());
    const tier = comfortTier(c.value);
    clear(comfortEl);
    append(comfortEl, [
      h('span', { class: 'comfort-label' }, 'Gemütlichkeit'),
      h('b', null, String(c.value)),
      h('span', { class: 'comfort-tier' }, tier.name),
      svgEl(icon('flame', 18), 'comfort-flame'),
      h('span', { class: 'mini-bar' }, h('span', { style: `width:${tier.next ? Math.min(100, (c.value / tier.next) * 100) : 100}%` })),
      c.rooms ? h('span', { class: 'comfort-rooms' }, `${c.rooms} ${c.rooms === 1 ? 'Raum' : 'Räume'}`) : null,
    ]);
    clear(resToggle);
    resToggle.append(svgEl(icon('home', 16)), h('span', null, 'Lager'), svgEl(icon('chevron', 16), 'res-chevron'));
    clear(resChips);
    // In Sechsergruppen: Grundstoffe, Bauteile, Seltenes
    MATERIAL_ORDER.forEach((r, i) => {
      if (i && i % 6 === 0) resChips.append(h('span', { class: 'res-sep', 'aria-hidden': 'true' }));
      resChips.append(h('span', { class: 'cost-chip' + (s.inventory[r] ? '' : ' zero'), title: RESOURCES[r].name }, svgEl(resIcon(r, 16)), String(s.inventory[r])));
    });
    const ready = readyParts(s, app.backend.now()).count;
    const running = s.workshop.jobs.length - ready;
    workChip.hidden = !s.workshop.jobs.length;
    clear(workChip);
    workChip.classList.toggle('ready', ready > 0);
    workChip.append(svgEl(icon('wrench', 15)), ready ? `${ready} fertig` : `${running} in Arbeit`);
    const jobs = plot().jobs ?? [];
    buildChip.hidden = !jobs.length;
    clear(buildChip);
    if (jobs.length) {
      const first = jobs[0];
      buildChip.append(svgEl(icon('hammer', 15)), `${jobs.length === 1 ? (first.keys.length > 1 ? `${first.keys.length} × ${first.label}` : first.label) : `${jobs.length} Baustellen`} · ${leftText(first.endsAt - app.backend.now())}`);
    }
    renderBuildList();
    const harvest = pendingHarvest(s, app.backend.now());
    harvestChip.hidden = !Object.keys(harvest).length;
    clear(harvestChip);
    harvestChip.append(svgEl(icon('check', 15)), `Abholen: ${itemsLine(harvest)}`);
    const n = packCount(s);
    packCard.hidden = !(n > 0 && here());
    clear(packCard);
    packCard.append(svgEl(icon('backpack', 22)), h('span', null, h('b', null, 'Rucksack auspacken'), h('small', null, `${n} ${n === 1 ? 'Sache' : 'Sachen'} kommen ins Lager`)));
    const f = opts.getFix();
    const place = getBasePlace();
    if (here()) {
      away.hidden = true;
      return;
    }
    away.hidden = false;
    clear(away);
    const dist = place && f ? distanceM(place.pos, f.pos) : null;
    const moveBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Hierher umziehen');
    moveBtn.addEventListener('click', () => {
      if (!f) return;
      if (moveBtn.dataset.armed) {
        setBasePlace(f.pos);
        app.toast('Dein Zuhause ist umgezogen. Alles kommt mit.', 'good');
        render();
        return;
      }
      moveBtn.dataset.armed = '1';
      moveBtn.textContent = 'Wirklich? Nochmal tippen';
    });
    append(away, [h('span', null, dist !== null ? `Du bist ${formatDistance(dist)} entfernt. Ansehen geht immer, bauen nur vor Ort.` : 'Ohne Standort kannst du nur ansehen.'), f ? moveBtn : null]);
  };

  // --- Bauliste ----------------------------------------------------------------------------
  const toggleBuildList = () => {
    if (buildList) {
      buildList.remove();
      buildList = null;
      return;
    }
    buildList = h('div', { class: 'build-list', role: 'dialog', 'aria-label': 'Bauliste' });
    el.append(buildList);
    renderBuildList();
  };

  const renderBuildList = () => {
    if (!buildList) return;
    const jobs = plot().jobs ?? [];
    if (!jobs.length) {
      buildList.remove();
      buildList = null;
      return;
    }
    const now = app.backend.now();
    const test = app.settings.get().location === 'sim';
    clear(buildList);
    append(buildList, [
      h('div', { class: 'build-list-head' }, svgEl(icon('hammer', 18)), h('b', null, 'Bauliste'), h('button', { class: 'iconbtn small', type: 'button', 'aria-label': 'Schließen', onclick: () => toggleBuildList() }, svgEl(icon('close', 16)))),
      h('p', { class: 'build-list-note' }, 'Eins nach dem anderen, in echter Zeit. Läuft weiter, auch wenn du nicht spielst. Abreißen gibt alles zurück.'),
      h(
        'ul',
        null,
        jobs.map((j, i) =>
          h(
            'li',
            null,
            h('div', { class: 'build-list-main' }, h('b', null, j.keys.length > 1 ? `${j.keys.length} × ${j.label}` : j.label), h('small', null, i === 0 || j.startsAt <= now ? leftText(j.endsAt - now) : `wartet · fertig in ${durationText(j.endsAt - now)}`)),
            h('span', { class: 'ws-progress' }, h('span', { class: 'ws-bar', style: `width:${Math.round(jobProgress(j, now) * 100)}%` })),
          ),
        ),
      ),
      test
        ? h(
            'button',
            {
              class: 'btn small ghost',
              type: 'button',
              onclick: async () => {
                await dispatch({ type: 'testFinishBuilds' });
                render();
              },
            },
            'Alles sofort fertig (Test)',
          )
        : null,
    ]);
  };

  /** Meldung nach dem Bauen: wann es fertig ist (und ob es erst noch wartet). */
  const buildStarted = (key: string) => {
    const p = plot();
    const j = jobOf(p, key);
    if (!j) return;
    const now = app.backend.now();
    const waits = j.startsAt > now;
    app.toast(`${j.keys.length > 1 ? `${j.keys.length} × ` : ''}${j.label}: fertig in ${durationText(j.endsAt - now)}${waits ? ' (wartet in der Bauliste)' : ''}.`);
  };

  // --- Unterer Bereich -------------------------------------------------------------------
  const setBuilding = (on: boolean) => {
    if (on && !needHere()) return;
    if (on) work?.close();
    building = on;
    mode = { kind: 'browse' };
    render();
  };

  const render = () => {
    renderHead();
    sync();
    clear(panelBody);
    clear(ctx);
    if (mode.kind === 'place' || mode.kind === 'tool') building = true;
    el.dataset.build = building ? 'on' : 'off';
    // Etwas ausgewählt: Seitenleiste weg, damit der ganze Bildschirm zum Bauen frei ist
    const focus = building && mode.kind !== 'browse';
    el.dataset.focus = focus ? 'on' : 'off';
    scene.toolCapture = null;
    scene.hideGhost();
    scene.unmark();
    scene.clearPreview();
    scene.setHiddenItem(mode.kind === 'place' && mode.uid !== undefined ? mode.uid : null);
    scene.setGridVisible(building);
    renderSections();
    if (building) {
      panelBody.append(topTabs());
      if (top === 'furnish') renderFurnish();
      else if (top === 'build') renderBuild();
      else renderLand();
    }
    if (mode.kind === 'place') renderPlaceBar(mode);
    else if (mode.kind === 'selected') renderSelectedBar(mode.uid);
    else if (mode.kind === 'obstacle') renderObstacleBar(mode.id);
    else if (mode.kind === 'section') renderSectionBar(mode.sx, mode.sy);
    renderControls();
    requestAnimationFrame(() => {
      const w = el.clientWidth || 1;
      if (work) return shiftForSide();
      scene.setViewShift(0, building && !focus ? panel.getBoundingClientRect().width / (2 * w) : 0);
    });
  };

  /** Seitenleiste (Werktisch, Lager) offen: Ansicht so verschieben, dass das Gelände frei bleibt.
   *  Hochkant liegt die Leiste unten, sonst rechts. */
  const shiftForSide = () => {
    const w = el.clientWidth || 1;
    const hh = el.clientHeight || 1;
    if (!work) return scene.setViewShift(0, 0);
    // getBoundingClientRect: echte Bildschirmgröße, auch wenn die Oberfläche verkleinert ist
    const r = work.el.getBoundingClientRect();
    if (hh > w) scene.setViewShift(r.height / (2 * hh), 0);
    else scene.setViewShift(0, r.width / (2 * w));
  };

  // --- Werktisch ----------------------------------------------------------------------------
  let work: (ReturnType<typeof openWorkshop> & { kind?: 'store' }) | null = null;
  const openWork = () => {
    if (work && !work.kind) return;
    const bench = plot().items.find((i) => i.kind === 'workbench');
    if (!bench) return app.toast('Stell zuerst einen Werktisch auf (Baumodus, Einrichten).');
    work?.close();
    building = false;
    mode = { kind: 'browse' };
    el.dataset.workshop = 'on';
    render();
    const f = footprint(bench.kind, bench.rot);
    scene.focus(bench.x + f.w / 2, bench.y + f.d / 2);
    work = openWorkshop(app, el, {
      needHere,
      onChanged: () => {
        opts.onChanged();
        renderHead();
      },
      onClose: () => {
        work = null;
        el.dataset.workshop = 'off';
        render();
      },
    });
    requestAnimationFrame(shiftForSide);
  };

  // --- Lager ---------------------------------------------------------------------------------
  const openStore = () => {
    if (work?.kind === 'store') return;
    work?.close();
    building = false;
    mode = { kind: 'browse' };
    el.dataset.workshop = 'on';
    render();
    const panel = openLager(app, el, {
      needHere,
      onChanged: () => {
        opts.onChanged();
        renderHead();
      },
      onClose: () => {
        work = null;
        el.dataset.workshop = 'off';
        render();
      },
      place: (id) => {
        work?.close();
        startPlace(id);
      },
      openWorkshop: () => openWork(),
    });
    work = { ...panel, kind: 'store' };
    requestAnimationFrame(shiftForSide);
  };

  const doUnpack = async () => {
    if (!needHere()) return;
    const msg = await unpack(app);
    if (msg) app.toast(`Ausgepackt: ${msg}. Liegt jetzt im Lager.`, 'good');
    opts.onChanged();
    render();
  };

  /** Alle Anlagen leeren (Regentonne, Hochbeet). */
  const harvestAll = async () => {
    if (!needHere()) return;
    const got: Partial<Inventory> = {};
    for (const it of plot().items.filter((i) => itemYield(i, app.backend.now()) > 0)) {
      const res = await app.backend.dispatch({ type: 'harvest', uid: it.uid });
      const ev = res.events[0];
      if (ev.type === 'harvested') for (const r of RESOURCE_ORDER) if (ev.items[r]) got[r] = (got[r] ?? 0) + (ev.items[r] ?? 0);
    }
    if (Object.keys(got).length) app.toast(`Abgeholt: ${itemsLine(got)}`, 'good');
    opts.onChanged();
    render();
  };

  // --- Steuerung im Ansichtsmodus: Joystick und Benutzen ---------------------------------
  let joy: Joystick | null = null;
  let use: ReturnType<typeof useButton> | null = null;
  let useTimer = 0;
  const doUse = async () => {
    const t = scene.findInteract();
    if (!t) return;
    if (t.kind === 'item') {
      const it = plot().items.find((i) => i.uid === t.uid);
      if (it?.kind === 'workbench') return openWork();
      if (it && itemYield(it, app.backend.now()) > 0 && here()) {
        const res = await app.backend.dispatch({ type: 'harvest', uid: it.uid });
        const ev = res.events[0];
        if (ev.type === 'harvested') app.toast(`Abgeholt: ${itemsLine(ev.items)}`, 'good');
        opts.onChanged();
        return render();
      }
      mode = { kind: 'selected', uid: t.uid };
      return render();
    }
    const o = idx().obstacles.find((x) => x.id === t.id);
    if (!o || !needHere()) return;
    const def = OBSTACLES[o.kind];
    if (await dispatch({ type: 'clearObstacle', id: o.id })) {
      app.toast(`${def.verb}: +${itemsLine(def.reward)}`, 'good');
      render();
    }
  };
  const renderControls = () => {
    const show = control === 'joystick' && !building;
    scene.followCharacter = show;
    if (!show) {
      clear(controls);
      joy = null;
      use = null;
      scene.driveSource = null;
      clearInterval(useTimer);
      return;
    }
    if (joy) return;
    joy = new Joystick();
    use = useButton(() => void doUse());
    controls.append(joy.el, use.el);
    const j = joy;
    scene.driveSource = () => j.value;
    const refreshUse = () => {
      const t = scene.findInteract();
      if (!t) return use?.setLabel(null);
      if (t.kind === 'item') {
        const it = plot().items.find((i) => i.uid === t.uid);
        return use?.setLabel(it?.kind === 'workbench' ? 'Werktisch' : it && itemYield(it, app.backend.now()) > 0 ? 'Abholen' : 'Ansehen');
      }
      const o = idx().obstacles.find((x) => x.id === t.id);
      use?.setLabel(o ? OBSTACLES[o.kind].verb : null);
    };
    refreshUse();
    clearInterval(useTimer);
    useTimer = window.setInterval(refreshUse, 250);
  };

  const topTabs = () =>
    h(
      'div',
      { class: 'base-modes', role: 'tablist' },
      (
        [
          ['furnish', 'Einrichten', 'sofa'],
          ['build', 'Bauen', 'hammer'],
          ['land', 'Gelände', 'land'],
        ] as [Top, string, string][]
      ).map(([id, name, ic]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': String(top === id),
            onclick: () => {
              top = id;
              mode = { kind: 'browse' };
              render();
            },
          },
          svgEl(icon(ic, 18)),
          name,
        ),
      ),
    );

  // --- Einrichten ------------------------------------------------------------------------
  const renderFurnish = () => {
    const s = st();
    // Sammelstücke nur zeigen, wenn man sie gefunden hat und sie noch im Lager liegen
    const visible = FURNITURE_ORDER.filter((k) => !isCollectible(k) || (s.collectibles[k] && !collectiblePlaced(s, k)));
    const cats: (FurnitureCategory | 'all')[] = ['all', 'moebel', 'licht', 'deko', 'garten', 'fund'];
    const tabs = h(
      'div',
      { class: 'drawer-tabs', role: 'tablist' },
      cats.map((c) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(furnTab === c), onclick: () => ((furnTab = c), render()) }, c === 'all' ? 'Alles' : CATEGORY_NAMES[c])),
    );
    const kinds = visible.filter((k) => furnTab === 'all' || FURNITURE[k].category === furnTab).sort((a, b) => Number(knowsBlueprint(s, b)) - Number(knowsBlueprint(s, a)));
    const thumbs = thumbnails(kinds, []);
    const list = h(
      'div',
      { class: 'drawer-list' },
      kinds.map((k) => {
        const def = FURNITURE[k];
        const known = knowsBlueprint(s, k);
        const afford = canAfford(s.inventory, def.cost);
        return h(
          'button',
          { class: 'fcard' + (known ? '' : ' locked') + (known && !afford ? ' poor' : '') + (isCollectible(k) ? ' found' : ''), type: 'button', onclick: () => startPlace(k), 'aria-label': `${def.name}${known ? '' : ', Bauplan fehlt'}` },
          h('span', { class: 'fthumb' }, thumbs[`f:${k}`] ? h('img', { src: thumbs[`f:${k}`], alt: '' }) : null, known ? null : svgEl(icon('lock', 16), 'flock')),
          h('span', { class: 'fname' }, def.name),
          isCollectible(k) ? h('span', { class: 'fhint found' }, 'Sammelstück') : known ? costChips(def.cost, s.inventory) : h('span', { class: 'fhint' }, whereToFind(k)),
          known ? h('span', { class: 'ftime' }, svgEl(icon('clock', 12)), durationText(furnitureMs(k))) : null,
        );
      }),
    );
    const left = idx().obstacles.length;
    const hint =
      furnTab === 'fund' && !kinds.length
        ? 'Keine Sammelstücke im Lager. Draußen findest du Teddys, Uhren, Gitarren und mehr, jedes nur einmal.'
        : left && plot().items.length < 2
          ? 'Tipp: Räum Schutt und Gestrüpp weg, dann ist Platz.'
          : 'Tippe ein Teil an, dann stellst du es auf.';
    append(panelBody, [tabs, list, tipLine(hint)]);
  };

  /** Hinweis unter der Liste: „Tipp:“ hervorgehoben, mit Glühbirne. */
  const tipLine = (text: string) =>
    text.startsWith('Tipp: ')
      ? h('p', { class: 'drawer-hint tip' }, h('b', null, 'Tipp:'), ` ${text.slice(6)} `, svgEl(icon('bulb', 17)))
      : h('p', { class: 'drawer-hint' }, text);

  const startPlace = (k: FurnitureId) => {
    const s = st();
    const def = FURNITURE[k];
    if (!knowsBlueprint(s, k)) return app.toast(`${def.name}: ${whereToFind(k)}.`);
    if (isCollectible(k) && (!s.collectibles[k] || collectiblePlaced(s, k))) return app.toast(`${def.name} steht schon.`, 'warn');
    if (!canAfford(s.inventory, def.cost)) return app.toast(`${def.name}: ${missingText(def.cost, s.inventory)}`, 'warn');
    if (!needHere()) return;
    const c = scene.characterCell();
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let r = 0; r < 12 && !best; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = c.x + dx;
          const y = c.y + dy + 1;
          if (placementProblem(s, k, x, y, 0)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) (bestD = d), (best = { x, y });
        }
    const pos = best ?? { x: c.x, y: c.y + 1 };
    mode = { kind: 'place', item: k, x: pos.x, y: pos.y, rot: FURNITURE[k].layer === 'wall' ? 0 : 0 };
    render();
  };

  const updateGhost = () => {
    if (mode.kind !== 'place') return;
    const problem = placementProblem(st(), mode.item, mode.x, mode.y, mode.rot, mode.uid);
    scene.showGhost(mode.item, mode.x, mode.y, mode.rot, !problem);
    const confirm = ctx.querySelector<HTMLButtonElement>('.confirm-place');
    if (confirm) confirm.disabled = !!problem;
    const hint = ctx.querySelector('.ctx-title small');
    const time = mode.kind === 'place' && mode.uid === undefined ? ` · Bauzeit ${durationText(furnitureMs(mode.item))}` : '';
    if (hint) hint.textContent = problem === 'no_wall' ? 'Braucht eine Wand im Rücken. Drehen hilft.' : problem ? 'Hier ist kein Platz.' : `Ziehen oder Feld antippen${time}`;
  };

  /** Angetipptes Feld liegt im Teil (bei geraden Breiten links/oben davon). */
  const placeAtCell = (m: Extract<Mode, { kind: 'place' }>, cx: number, cy: number) => {
    const f = footprint(m.item, m.rot);
    m.x = cx - Math.floor((f.w - 1) / 2);
    m.y = cy - Math.floor((f.d - 1) / 2);
    updateGhost();
  };

  const renderPlaceBar = (m: Extract<Mode, { kind: 'place' }>) => {
    const moveTo = (cx: number, cy: number) => {
      const f = footprint(m.item, m.rot);
      m.x = Math.round(cx - f.w / 2);
      m.y = Math.round(cy - f.d / 2);
      updateGhost();
    };
    let dragged = false;
    scene.toolCapture = (hit) => {
      if (!hit.cell) return false;
      const f = footprint(m.item, m.rot);
      dragged = false;
      return hit.cell.x >= m.x - 1 && hit.cell.x <= m.x + f.w && hit.cell.y >= m.y - 1 && hit.cell.y <= m.y + f.d;
    };
    scene.onToolMove = (hit) => {
      dragged = true;
      if (hit.point) moveTo(hit.point.x, hit.point.y);
    };
    // Nur angetippt (ohne Ziehen): dorthin setzen
    scene.onToolEnd = (hit) => {
      if (!dragged && hit.cell) placeAtCell(m, hit.cell.x, hit.cell.y);
    };
    ctx.append(
      h(
        'div',
        { class: 'ctx-bar' },
        ctxClose('Abbrechen', () => ((mode = { kind: 'browse' }), render())),
        h('div', { class: 'ctx-title' }, FURNITURE[m.item].name, h('small', null, m.uid !== undefined ? 'Umstellen geht sofort' : `Bauzeit ${durationText(furnitureMs(m.item))}`)),
        h(
          'div',
          { class: 'ctx-actions' },
          h(
            'button',
            {
              class: 'btn ghost small',
              type: 'button',
              onclick: () => {
                m.rot = (m.rot + 1) % 4;
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

  const dispatch = async (a: Action) => {
    const before = baseTier(st());
    const res = await app.backend.dispatch(a);
    const rej = res.events.find((e) => e.type === 'rejected');
    if (rej && rej.type === 'rejected') {
      app.toast(rej.reason === 'cost' && 'kind' in a && a.kind && a.kind in FURNITURE ? missingText(FURNITURE[a.kind as FurnitureId].cost, st().inventory) : REJECT_TEXT[rej.reason], 'warn');
      return null;
    }
    const after = baseTier(res.state);
    if (after > before) {
      app.toast(`Neue Stufe: ${comfortTier(plotComfort(plot()).value).name}! ${TIER_PERKS[after]?.desc ?? ''}`, 'good');
      scene.wave();
      try {
        if (app.settings.get().vibration) navigator.vibrate?.([40, 50, 40, 50, 140]);
      } catch {
        /* egal */
      }
    }
    opts.onChanged();
    return res;
  };

  // --- Anlagen: Holzofen und Funkgerät -------------------------------------------------------
  const cook = async () => {
    if (!needHere()) return;
    const res = await dispatch({ type: 'cook' });
    const ev = res?.events[0];
    if (ev?.type === 'cooked') {
      app.toast(`Eintopf! ${ev.healed > 0 ? `+${ev.healed} Gesundheit, ` : ''}3 Stunden satt: ${Math.round(COOK.lootBonus * 100)} % mehr Beute.`, 'good');
      scene.wave();
    }
    render();
  };

  const listen = async () => {
    if (!needHere()) return;
    const f = opts.getFix();
    if (!f) return app.toast('Ohne Standort empfängt das Funkgerät nichts.', 'warn');
    const res = await dispatch({ type: 'listenRadio', at: f.pos });
    const ev = res?.events[0];
    if (ev?.type !== 'radio') return render();
    const c = ev.cache ? st().caches.find((x) => x.id === ev.cache) : undefined;
    const card = h(
      'div',
      { class: 'radio-card', role: 'dialog', 'aria-label': 'Funkspruch' },
      h('div', { class: 'memento-kicker' }, svgEl(icon('radioSet', 16)), 'Kanal 4'),
      h('p', { class: 'radio-line' }, RADIO_LINES[ev.line] ?? ''),
      c
        ? h(
            'p',
            { class: 'radio-clue' },
            svgEl(icon('chalk', 18)),
            `Dazwischen ein Hinweis: Vorräte, etwa ${Math.round(distanceM(c.fromPos, c.spot.pos) / 50) * 50} m von hier, bei: ${c.spot.name}. Der Suchkreis ist auf der Karte markiert.`,
          )
        : h('p', { class: 'radio-clue none' }, 'Diesmal kein Hinweis auf ein Versteck.'),
      h('button', { class: 'btn wide', type: 'button', onclick: () => card.remove() }, 'Gehört'),
    );
    el.append(card);
    render();
  };

  const confirmPlace = async () => {
    if (mode.kind !== 'place') return;
    const m = mode;
    const res = m.uid !== undefined ? await dispatch({ type: 'move', uid: m.uid, x: m.x, y: m.y, rot: m.rot }) : await dispatch({ type: 'place', kind: m.item, x: m.x, y: m.y, rot: m.rot });
    if (!res) return;
    const placed = res.events[0];
    if (placed.type === 'placed') buildStarted(`i:${placed.uid}`);
    scene.wave();
    mode = { kind: 'browse' };
    render();
  };

  const renderSelectedBar = (uid: number) => {
    const it = plot().items.find((i) => i.uid === uid);
    if (!it) {
      mode = { kind: 'browse' };
      return render();
    }
    const f = footprint(it.kind, it.rot);
    scene.mark(it.x, it.y, f.w, f.d);
    const def = FURNITURE[it.kind];
    const prod = def.produces;
    const ready = itemYield(it, app.backend.now());
    const now = app.backend.now();
    const sub =
      it.kind === 'workbench'
        ? 'Zerlegt Kram in Rohstoffe'
        : it.kind === 'stove'
          ? isFed(st(), now)
            ? `Du bist satt: noch ${formatWait(st().fedUntil - now)} mehr Beute`
            : 'Eintopf: heilt ganz, 3 Stunden mehr Beute'
          : it.kind === 'radioSet'
            ? radioReadyIn(st(), now) > 0
              ? `Nächster Funkspruch in ${formatWait(radioReadyIn(st(), now))}`
              : 'Ein neuer Funkspruch wartet'
        : prod
          ? ready
            ? `${ready} ${RESOURCES[prod.res].name} bereit`
            : `Alle ${prod.everyH} Std. 1 ${RESOURCES[prod.res].name}, sammelt bis ${prod.cap}`
          : isCollectible(it.kind)
            ? `Sammelstück · Gemütlichkeit +${def.comfort}`
            : `Gemütlichkeit +${def.comfort}`;
    const inBuild = jobOf(plot(), `i:${uid}`);
    ctx.append(
      h(
        'div',
        { class: 'ctx-bar' },
        ctxClose('Fertig', () => ((mode = { kind: 'browse' }), render())),
        h('div', { class: 'ctx-title', title: def.desc }, def.name, h('small', null, inBuild ? `Im Bau · ${inBuild.startsAt > now ? `wartet, fertig in ${durationText(inBuild.endsAt - now)}` : leftText(inBuild.endsAt - now)}` : sub)),
        h(
          'div',
          { class: 'ctx-actions' },
          it.kind === 'workbench' && !inBuild ? h('button', { class: 'btn small', type: 'button', onclick: () => openWork() }, svgEl(icon('wrench', 16)), 'Werktisch') : null,
          it.kind === 'stove' && !inBuild
            ? h(
                'button',
                { class: 'btn small', type: 'button', disabled: !canAfford(st().inventory, COOK.cost), onclick: () => void cook() },
                svgEl(icon('stew', 16)),
                'Eintopf kochen',
                costChips(COOK.cost, st().inventory),
              )
            : null,
          it.kind === 'radioSet' && !inBuild
            ? h('button', { class: 'btn small', type: 'button', disabled: radioReadyIn(st(), now) > 0, onclick: () => void listen() }, svgEl(icon('radioSet', 16)), 'Funk abhören')
            : null,
          prod && ready
            ? h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  onclick: async () => {
                    if (!needHere()) return;
                    const res = await dispatch({ type: 'harvest', uid });
                    const ev = res?.events[0];
                    if (ev?.type === 'harvested') app.toast(`Abgeholt: ${itemsLine(ev.items)}`, 'good');
                    render();
                  },
                },
                svgEl(resIcon(prod.res, 16)),
                'Abholen',
              )
            : null,
          h(
            'button',
            { class: 'btn ghost small', type: 'button', onclick: () => needHere() && ((mode = { kind: 'place', item: it.kind, x: it.x, y: it.y, rot: it.rot, uid }), render()) },
            'Umstellen',
          ),
          h(
            'button',
            {
              class: 'btn ghost small',
              type: 'button',
              onclick: async () => {
                if (!needHere()) return;
                if (await dispatch({ type: 'store', uid })) {
                  app.toast(isCollectible(it.kind) ? `${def.name} liegt wieder im Lager.` : `${def.name} eingelagert. Rohstoffe zurück.`);
                  mode = { kind: 'browse' };
                  render();
                }
              },
            },
            inBuild ? 'Abbrechen' : isCollectible(it.kind) ? 'Ins Lager' : 'Einlagern',
          ),
        ),
      ),
    );
  };

  const renderObstacleBar = (id: string) => {
    const o = idx().obstacles.find((x) => x.id === id);
    if (!o) {
      mode = { kind: 'browse' };
      return render();
    }
    const def = OBSTACLES[o.kind];
    scene.mark(o.x, o.y, o.w, o.d);
    const keep = o.kind === 'tree' ? ' Du kannst ihn auch stehen lassen und drumherum bauen.' : '';
    const clearing = jobOf(plot(), `c:${o.id}`);
    if (clearing) {
      const now = app.backend.now();
      ctx.append(
        h(
          'div',
          { class: 'ctx-bar' },
          ctxClose('Fertig', () => ((mode = { kind: 'browse' }), render())),
          h('div', { class: 'ctx-title' }, def.name, h('small', null, `Wird weggeräumt · ${clearing.startsAt > now ? `wartet, fertig in ${durationText(clearing.endsAt - now)}` : leftText(clearing.endsAt - now)}`)),
        ),
      );
      return;
    }
    ctx.append(
      h(
        'div',
        { class: 'ctx-bar' },
        ctxClose('Abbrechen', () => ((mode = { kind: 'browse' }), render())),
        h('div', { class: 'ctx-title' }, def.name, h('small', null, keep ? 'Darf auch stehen bleiben.' : `Bringt ${itemsLine(def.reward)}`)),
        h(
          'div',
          { class: 'ctx-actions' },
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onclick: async () => {
                if (!needHere()) return;
                if (await dispatch({ type: 'clearObstacle', id })) {
                  const j = jobOf(plot(), `c:${id}`);
                  app.toast(`${def.verb}: +${itemsLine(def.reward)}.${j ? ` Weg in ${durationText(j.endsAt - app.backend.now())}.` : ''}`, 'good');
                  mode = { kind: 'browse' };
                  render();
                }
              },
            },
            `${def.verb} (+${itemsLine(def.reward)}) · ${durationText(obstacleMs(o.kind))}`,
          ),
        ),
      ),
    );
  };

  // --- Bauen -----------------------------------------------------------------------------
  const renderBuild = () => {
    const s = st();
    const tabs = h(
      'div',
      { class: 'drawer-tabs', role: 'tablist' },
      BUILD_ORDER.map((t) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': String(buildTab === t),
            onclick: () => {
              buildTab = t;
              mode = { kind: 'browse' };
              render();
            },
          },
          svgEl(icon(BUILD_TABS[t].icon, 16)),
          BUILD_TABS[t].name,
        ),
      ),
    );
    const group = BUILD_TABS[buildTab].group;
    const pieces = PIECE_ORDER.filter((p) => PIECES[p].group === group).sort((a, b) => Number(knowsBlueprint(s, b)) - Number(knowsBlueprint(s, a)));
    const thumbs = thumbnails([], pieces);
    const tool = mode.kind === 'tool' ? mode : null;
    const card = (piece: PieceId | null) => {
      const selected = tool && tool.piece === piece;
      if (!piece)
        return h(
          'button',
          { class: 'fcard erase' + (selected ? ' selected' : ''), type: 'button', onclick: () => startTool(null) },
          h('span', { class: 'fthumb' }, svgEl(icon('eraser', 34))),
          h('span', { class: 'fname' }, 'Abreißen'),
          h('span', { class: 'fhint' }, 'Alles zurück'),
        );
      const def = PIECES[piece];
      const known = knowsBlueprint(s, piece);
      return h(
        'button',
        { class: 'fcard' + (known ? '' : ' locked') + (selected ? ' selected' : ''), type: 'button', onclick: () => startTool(piece), 'aria-label': `${def.name}${known ? '' : ', Bauplan fehlt'}` },
        h('span', { class: 'fthumb' }, thumbs[`p:${piece}`] ? h('img', { src: thumbs[`p:${piece}`], alt: '' }) : null, known ? null : svgEl(icon('lock', 16), 'flock')),
        h('span', { class: 'fname' }, def.name),
        known ? (Object.keys(def.cost).length ? costChips(def.cost, s.inventory) : h('span', { class: 'fhint' }, 'kostenlos')) : h('span', { class: 'fhint' }, whereToFind(piece)),
        known ? h('span', { class: 'ftime' }, svgEl(icon('clock', 12)), `${durationText(pieceMs(piece))} je ${def.group === 'floor' || def.group === 'roof' ? 'Feld' : 'Stück'}`) : null,
      );
    };
    const list = h('div', { class: 'drawer-list' }, [...pieces.map(card), card(null)]);
    append(panelBody, [tabs, list]);
    if (tool) renderToolRow(tool);
    else panelBody.append(h('p', { class: 'drawer-hint' }, 'Wähle ein Bauteil. Dann ziehst du mit einem Finger, zwei Finger schieben die Ansicht.'));
  };

  const startTool = (piece: PieceId | null) => {
    if (piece && !knowsBlueprint(st(), piece)) return app.toast(`${PIECES[piece].name}: ${whereToFind(piece)}.`);
    if (!needHere()) return;
    const prev = mode.kind === 'tool' ? mode : null;
    mode = { kind: 'tool', tab: buildTab, piece, shape: prev?.shape ?? 'line', a: null, b: null, pending: false };
    render();
  };

  const edgeLayer = (t: ToolMode) => BUILD_TABS[t.tab].layer === 'walls' || BUILD_TABS[t.tab].layer === 'openings';

  const toolPlan = (t: ToolMode): BuildPlan | null => {
    if (!t.a || !t.b) return null;
    const layer = BUILD_TABS[t.tab].layer;
    const p = plot();
    const ix = idx();
    if (layer === 'walls' || layer === 'openings') {
      const edges = layer === 'walls' && t.shape === 'room' ? roomEdges(t.a.x, t.a.y, t.b.x, t.b.y) : lineEdges(t.a.x, t.a.y, t.b.x, t.b.y);
      if (!t.piece) return planDemolish(ix, p, layer, edges);
      return layer === 'walls' ? planWalls(ix, p, t.piece as WallId, edges) : planOpening(ix, p, t.piece as OpeningId, edges);
    }
    const cells = rectCells(t.a.x, t.a.y, t.b.x, t.b.y);
    if (!t.piece) return planDemolish(ix, p, layer, cells.map(([x, y]) => cellKey(x, y)));
    return planPaint(ix, p, layer, t.piece as FloorId | RoofId, cells);
  };

  const showToolPreview = (t: ToolMode) => {
    const plan = toolPlan(t);
    scene.clearPreview();
    if (!plan) return;
    const color = t.piece ? COLORS.ok : COLORS.erase;
    if (edgeLayer(t)) {
      const hgt = t.piece && PIECES[t.piece].group === 'fence' ? 1.7 : t.piece && PIECES[t.piece].group === 'opening' ? WALL_H + 0.05 : WALL_H;
      scene.showEdges([...plan.keys.map((edge) => ({ edge, color, h: hgt })), ...plan.blocked.map((edge) => ({ edge, color: COLORS.bad, h: 0.5 }))]);
    } else {
      const y = BUILD_TABS[t.tab].layer === 'roofs' ? WALL_H + 0.12 : 0.07;
      const cell = (k: string) => {
        const [x, yy] = k.split(',').map(Number);
        return { x, y: yy };
      };
      scene.showCells([...plan.keys.map((k) => ({ ...cell(k), color })), ...plan.blocked.map((k) => ({ ...cell(k), color: COLORS.bad }))], y);
    }
  };

  const renderToolRow = (t: ToolMode) => {
    const layer = BUILD_TABS[t.tab].layer;
    const isEdge = edgeLayer(t);
    // Werkzeug am Bildschirm: ein Finger zieht
    scene.toolCapture = (hit) => {
      const p = isEdge ? hit.corner : hit.cell;
      if (!p) return false;
      t.a = { ...p };
      t.b = { ...p };
      t.pending = false;
      showToolPreview(t);
      return true;
    };
    scene.onToolMove = (hit) => {
      const p = isEdge ? hit.corner : hit.cell;
      if (!p || !t.a) return;
      if (isEdge && !(layer === 'walls' && t.shape === 'room')) {
        // Linie: an der Hauptrichtung einrasten
        t.b = Math.abs(p.x - t.a.x) >= Math.abs(p.y - t.a.y) ? { x: p.x, y: t.a.y } : { x: t.a.x, y: p.y };
      } else t.b = { ...p };
      showToolPreview(t);
    };
    scene.onToolEnd = (hit) => {
      if (!t.a || !t.b) return;
      if (isEdge && t.a.x === t.b.x && t.a.y === t.b.y) {
        // Nur angetippt: die Kante unter dem Finger
        const e = hit.edge;
        if (!e) return cancelDraft(t);
        const o = e[0];
        const [x, y] = e.slice(1).split(',').map(Number);
        t.a = { x, y };
        t.b = o === 'h' ? { x: x + 1, y } : { x, y: y + 1 };
      }
      const plan = toolPlan(t);
      if (!plan || (!plan.keys.length && !plan.blocked.length)) return cancelDraft(t);
      t.pending = true;
      showToolPreview(t);
      render();
    };
    scene.onToolCancel = () => cancelDraft(t);

    const name = t.piece ? PIECES[t.piece].name : 'Abreißen';
    if (t.pending) {
      const plan = toolPlan(t)!;
      showToolPreview(t);
      const { pay, back } = netCost(plan);
      const blockedHard = plan.blocked.length > 0 && isEdge && !!t.piece;
      const afford = RESOURCE_ORDER.every((r) => st().inventory[r] >= (pay[r] ?? 0));
      const n = plan.keys.length;
      const what = isEdge ? (n === 1 ? 'Stück' : 'Stücke') : n === 1 ? 'Feld' : 'Felder';
      ctx.append(
        h(
          'div',
          { class: 'ctx-bar' },
          ctxClose('Verwerfen', () => cancelDraft(t)),
          h(
            'div',
            { class: 'ctx-title' },
            `${name}: ${n} ${what}`,
            h(
              'small',
              null,
              blockedHard
                ? 'Rot: da geht es nicht'
                : plan.blocked.length && !isEdge
                  ? 'Gesperrtes wird ausgelassen'
                  : t.piece
                    ? `Bauzeit ${durationText(n * pieceMs(t.piece))}`
                    : 'Du bekommst alles zurück',
            ),
          ),
          h(
            'div',
            { class: 'ctx-cost' },
            Object.keys(pay).length ? costChips(pay, st().inventory) : null,
            Object.keys(back).length ? h('span', { class: 'refund' }, '+', costChips(back)) : null,
          ),
          h(
            'div',
            { class: 'ctx-actions' },
            h(
              'button',
              {
                class: 'btn small' + (t.piece ? '' : ' danger'),
                type: 'button',
                disabled: blockedHard || !n || !afford,
                onclick: () => commitTool(t),
              },
              svgEl(icon(t.piece ? 'check' : 'eraser', 16)),
              t.piece ? 'Bauen' : 'Abreißen',
            ),
          ),
        ),
      );
      return;
    }
    const hint = !t.piece
      ? 'Markiere, was weg soll'
      : layer === 'openings'
        ? 'Wand antippen oder entlang ziehen'
        : isEdge
          ? t.shape === 'room'
            ? 'Rechteck aufziehen: 4 Wände'
            : 'Von Ecke zu Ecke ziehen'
          : 'Feld antippen oder Rechteck ziehen';
    ctx.append(
      h(
        'div',
        { class: 'ctx-bar tool-row' },
        ctxClose('Fertig', () => ((mode = { kind: 'browse' }), render())),
        h('div', { class: 'ctx-title' }, name, h('small', null, `${hint} · zwei Finger: Ansicht`)),
        layer === 'walls'
          ? h(
              'div',
              { class: 'seg', role: 'group', 'aria-label': 'Form' },
              (
                [
                  ['line', 'Linie'],
                  ['room', 'Raum'],
                ] as ['line' | 'room', string][]
              ).map(([id, label]) => h('button', { type: 'button', 'aria-pressed': String(t.shape === id), onclick: () => ((t.shape = id), render()) }, label)),
            )
          : null,
      ),
    );
  };

  const cancelDraft = (t: ToolMode) => {
    t.a = t.b = null;
    t.pending = false;
    scene.clearPreview();
    render();
  };

  const commitTool = async (t: ToolMode) => {
    if (!t.a || !t.b || !needHere()) return;
    const layer = BUILD_TABS[t.tab].layer;
    const { x: x1, y: y1 } = t.a;
    const { x: x2, y: y2 } = t.b;
    let action: Action;
    if (!t.piece) action = { type: 'demolish', layer, shape: layer === 'walls' ? t.shape : layer === 'openings' ? 'line' : 'rect', x1, y1, x2, y2 };
    else if (layer === 'walls') action = { type: 'buildWalls', piece: t.piece as WallId, shape: t.shape, x1, y1, x2, y2 };
    else if (layer === 'openings') action = { type: 'setOpening', piece: t.piece as OpeningId, x1, y1, x2, y2 };
    else action = { type: 'paint', layer, piece: t.piece as FloorId | RoofId, x1, y1, x2, y2 };
    const res = await dispatch(action);
    if (!res) return;
    const ev = res.events[0];
    if (ev.type === 'constructed' || ev.type === 'demolished') {
      if (ev.stored) app.toast(`${ev.stored} ${ev.stored === 1 ? 'Teil' : 'Teile'} von der Wand ins Lager gelegt (Material zurück).`);
      if (ev.type === 'constructed' && layer === 'roofs' && !roofs) app.toast('Dach im Bau. Mit dem Dach-Knopf rechts kannst du es anzeigen.');
      if (ev.type === 'constructed') {
        const last = (plot().jobs ?? []).at(-1);
        if (last) buildStarted(last.keys[0]);
      }
    }
    t.a = t.b = null;
    t.pending = false;
    scene.clearPreview();
    render();
  };

  // --- Gelände ---------------------------------------------------------------------------
  const reclaimable = () => {
    const p = plot();
    const out: { sx: number; sy: number }[] = [];
    for (let sy = 0; sy < SECTIONS; sy++) for (let sx = 0; sx < SECTIONS; sx++) if (canReclaim(p, sx, sy)) out.push({ sx, sy });
    return out;
  };

  const renderSections = () => {
    // Abschnitte, die gerade zurückerobert werden, schimmern grün (immer sichtbar)
    const busy = pendingSections(plot()).map((k) => {
      const [sx, sy] = k.split(',').map(Number);
      return { sx, sy, color: '#9fd27a' };
    });
    if (top !== 'land' && mode.kind !== 'section') return scene.showSections(busy);
    const sel = mode.kind === 'section' ? mode : null;
    scene.showSections([...busy, ...reclaimable().map((s) => ({ ...s, color: sel && sel.sx === s.sx && sel.sy === s.sy ? '#ffe08a' : COLORS.amber }))]);
  };

  const renderLand = () => {
    const s = st();
    const p = plot();
    const cost = reclaimCost(p);
    const left = idx().obstacles.length;
    const total = SECTIONS * SECTIONS;
    panelBody.append(
      h(
        'div',
        { class: 'land-panel' },
        h(
          'div',
          { class: 'land-row' },
          h('div', null, h('b', null, `${p.sections.length} von ${total} Abschnitten`), h('small', null, (p.jobs ?? []).some((j) => j.keys.some((k) => k.startsWith('s:'))) ? 'Ein Abschnitt wird gerade zurückerobert (siehe Bauliste).' : 'Tippe einen gelben Abschnitt an, um ihn zurückzuerobern.')),
          h('div', { class: 'land-cost' }, h('small', null, 'Nächster'), costChips(cost, s.inventory)),
        ),
        h('div', { class: 'land-row' }, h('div', null, h('b', null, left ? `${left} Hindernisse` : 'Alles aufgeräumt'), h('small', null, left ? 'Schutt, Wracks, Gestrüpp: antippen und wegräumen.' : 'Jeder neue Abschnitt bringt neue Fundstücke.'))),
        h(
          'button',
          { class: 'btn ghost small site-btn', type: 'button', onclick: () => openSites() },
          svgEl(icon('map', 16)),
          `Schauplätze (${Object.keys(s.base.plots).length + Object.keys(s.base.found).filter((k) => !s.base.plots[k as keyof typeof s.base.plots]).length})`,
        ),
      ),
    );
  };

  const renderSectionBar = (sx: number, sy: number) => {
    const s = st();
    const cost = reclaimCost(plot());
    ctx.append(
      h(
        'div',
        { class: 'ctx-bar' },
        ctxClose('Abbrechen', () => ((mode = { kind: 'browse' }), render())),
        h('div', { class: 'ctx-title' }, 'Abschnitt zurückerobern', h('small', null, `${SECTION} × ${SECTION} m, danach bebaubar · Bauzeit ${durationText(sectionMs(plot()))}`)),
        h('div', { class: 'ctx-cost' }, costChips(cost, s.inventory)),
        h(
          'div',
          { class: 'ctx-actions' },
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              disabled: !canAfford(s.inventory, cost),
              onclick: async () => {
                if (!needHere()) return;
                if (await dispatch({ type: 'reclaim', sx, sy })) {
                  const j = jobOf(plot(), `s:${sx},${sy}`);
                  app.toast(j ? `Du eroberst den Abschnitt zurück: fertig in ${durationText(j.endsAt - app.backend.now())}. Darin liegt noch einiges herum.` : 'Abschnitt zurückerobert! Darin liegt noch einiges herum.', 'good');
                  mode = { kind: 'browse' };
                  render();
                }
              },
            },
            'Zurückerobern',
          ),
        ),
      ),
    );
  };

  const openSites = () => {
    openSitePicker(app, el, {
      first: false,
      onChosen: async (site) => {
        if (site === st().base.active) return;
        if (await dispatch({ type: 'chooseSite', site })) {
          app.toast(`Willkommen: ${SITES[site].name}.`, 'good');
          mode = { kind: 'browse' };
          top = 'furnish';
          render();
          scene.fitPlot();
        }
      },
    });
  };

  // --- Antippen ---------------------------------------------------------------------------
  scene.onTap = (hit: Hit) => {
    if (mode.kind === 'place') {
      if (hit.cell) placeAtCell(mode, hit.cell.x, hit.cell.y);
      return;
    }
    if (building && top === 'land' && hit.section && reclaimable().some((s) => s.sx === hit.section!.sx && s.sy === hit.section!.sy)) {
      mode = { kind: 'section', sx: hit.section.sx, sy: hit.section.sy };
      return render();
    }
    if (hit.character) {
      scene.wave();
      return;
    }
    if (hit.item !== null) mode = { kind: 'selected', uid: hit.item };
    else if (hit.obstacle) mode = { kind: 'obstacle', id: hit.obstacle };
    else {
      const wasBrowsing = mode.kind === 'browse';
      mode = { kind: 'browse' };
      const walk = control === 'tap' || building;
      if (hit.cell && walk && !scene.walkTo(hit.cell.x, hit.cell.y) && wasBrowsing && idx().unlocked[hit.cell.y * PLOT + hit.cell.x] === 0 && !(building && top === 'land'))
        app.toast('Dieser Teil ist noch zugewuchert. Im Baumodus unter „Gelände“ kannst du ihn zurückerobern.');
    }
    render();
  };

  // Tageszeit und Wetter laufen mit, solange das Zuhause offen ist
  const tick = window.setInterval(() => {
    renderHead();
    if (el.dataset.phase !== opts.phase()) {
      el.dataset.phase = opts.phase();
      scene.setPhase(opts.phase());
    }
    if (el.dataset.weather !== opts.weather()) {
      el.dataset.weather = opts.weather();
      scene.setWeather(opts.weather());
    }
  }, 5000);
  el.dataset.weather = opts.weather();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (work) work.close();
      else if (mode.kind !== 'browse') {
        mode = { kind: 'browse' };
        render();
      } else if (building) setBuilding(false);
      else close();
    }
    if (e.key === 'b' || e.key === 'B') setBuilding(!building);
    if (e.key === 'q' || e.key === 'Q') scene.rotateStep(-1);
    if (e.key === 'e' || e.key === 'E') scene.rotateStep(1);
  };
  window.addEventListener('keydown', onKey);
  // Baustelle fertig geworden (die Spielansicht schaut zur rechten Zeit nach): neu zeichnen
  const offBuilt = app.backend.onEvents((evs) => {
    if (evs.some((e) => e.type === 'built')) render();
  });
  const close = () => {
    work?.close();
    offBuilt();
    clearInterval(tick);
    clearInterval(useTimer);
    window.removeEventListener('keydown', onKey);
    offSettings();
    scene.dispose();
    el.remove();
    opts.onClose();
  };

  render();
  scene.fitPlot();
  // Testhilfe: nur mit gesetztem Schalter im Gerätespeicher
  try {
    if (localStorage.getItem('endstation.debug'))
      (window as unknown as { __base: unknown }).__base = {
        project: (x: number, y: number, hh = 0) => scene.projectPoint(x, y, hh),
        idx,
        plot,
        problem: (k: FurnitureId, x: number, y: number, r: number) => placementProblem(st(), k, x, y, r),
        mode: () => mode,
        select: (uid: number) => {
          mode = { kind: 'selected', uid };
          render();
        },
      };
  } catch {
    // egal
  }
  return el;
}

/** Erklär-Dialog: Zuhause an diesem Ort einrichten. */
export function openSetBase(_app: App, host: HTMLElement, getFix: () => Fix | null, onDone: (set: boolean) => void): HTMLElement {
  const f = getFix();
  const ok = !!f && f.accuracyM <= 80;
  const el = h(
    'div',
    { class: 'overlay set-base', role: 'dialog', 'aria-label': 'Zuhause festlegen' },
    h(
      'div',
      { class: 'overlay-inner narrow-box' },
      h('div', { class: 'sign' }, h('span', null, 'Zuhause')),
      h('p', { class: 'set-base-lead' }, 'Wähle einen Ort für deine Basis, zum Beispiel dein Zuhause. Dort baust du dir dein eigenes Gelände auf.'),
      h(
        'ul',
        { class: 'intro-how' },
        h('li', null, h('b', null, 'Nur du weißt, wo sie liegt.'), ' Der Ort bleibt auf diesem Gerät und wird nie geteilt.'),
        h('li', null, h('b', null, 'Bauen geht nur vor Ort'), ' (Umkreis etwa 150 m). Ansehen geht überall.'),
        h('li', null, h('b', null, 'Umziehen'), ' kannst du jederzeit, alles kommt mit.'),
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
