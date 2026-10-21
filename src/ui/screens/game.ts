// Der Spielbildschirm: Karte, Standort, Fundstellen, HUD und Overlays.

import { FALLBACK_START, IS_PREVIEW, VIEW_RADIUS_M } from '../../config';
import { ENEMIES, MAX_HEALTH, RESOURCE_ORDER, RESOURCES, SURVIVAL_ORDER } from '../../core/content';
import { ExploredView, SECTOR_LEVELS, sectorOf } from '../../core/explore';
import { bearingDeg, distanceM } from '../../core/geo';
import { currentHealth, dayNumber, packCount, pendingHarvest, readyAt, readyParts, searchRangeM } from '../../core/rules';
import type { LatLon, Resource, Spot } from '../../core/types';
import { DEMO, GameMap, type SpotView } from '../../map/GameMap';
import {
  AnchoredLocation,
  GpsLocation,
  SimulatedLocation,
  type Fix,
  type LocationErrorCode,
  type LocationProvider,
} from '../../services/location';
import type { App, Screen } from '../app';
import { avatarSvg } from '../avatar';
import { faceEl, loadPortraits } from '../portrait';
import { Joystick, useButton } from '../joystick';
import { append, clear, h, svgEl } from '../dom';
import { openPackPanel, type PackTab } from '../game/packPanel';
import { getBasePlace } from '../../services/basePlace';
import { openBattle } from '../game/battle';
import { AmbienceController, ambienceEffects, currentAmbience, guardSightM, PHASE_NAMES, WEATHER_NAMES, type Ambience } from '../game/ambience';
import { Particles } from '../game/dust';
import { SpotSheet } from '../game/spotSheet';
import { icon } from '../icons';
import { settingsPanel } from '../settingsPanel';
import { REJECT_TEXT } from '../texts';

export function gameScreen(app: App): Screen {
  const initial = app.settings.get();
  const mapMode = IS_PREVIEW ? 'demo' : initial.map;
  const locMode = IS_PREVIEW ? 'sim' : initial.location;
  const state0 = app.backend.current();
  if (!state0) {
    // Ohne Spielstand gibt es nichts zu spielen.
    queueMicrotask(() => app.go('menu'));
    return { el: h('div', { class: 'screen' }) };
  }
  const avatar = avatarSvg(state0.character.look, 64);
  const whoFace = svgEl(avatar, 'who-face');
  // 3D-Spielfigur auf der Karte (wird nachgeladen)
  let figure: import('../../base/figureView').FigureView | null = null;
  let figPos: LatLon | null = null;
  let heading = 180;
  let walkTimer = 0;
  let figT = 0;
  const applyFigureYaw = () => {
    if (!figure || !gm) return;
    const rel = ((heading - gm.bearing) * Math.PI) / 180;
    figure.setYaw(Math.PI - rel);
  };
  const updateFigure = (f: Fix) => {
    if (!figure) return;
    const now = performance.now();
    if (!figPos) {
      figPos = f.pos;
      figT = now;
    }
    const d = distanceM(figPos, f.pos);
    if (d > 1.2) {
      // Gangart nach Tempo: gehen, joggen, rennen
      const speed = d / Math.max(0.05, (now - figT) / 1000);
      heading = bearingDeg(figPos, f.pos);
      figPos = f.pos;
      figT = now;
      figure.setMoving(Math.min(3, Math.max(0.6, speed / 1.7)));
      clearTimeout(walkTimer);
      walkTimer = window.setTimeout(() => figure?.setMoving(0), f.simulated ? 350 : 2500);
    } else if (!f.simulated && now - figT > 2500) figT = now - 2500;
    applyFigureYaw();
  };
  const loadFigure = async () => {
    let fv: typeof import('../../base/figureView');
    try {
      fv = await import('../../base/figureView');
    } catch {
      return;
    }
    if (destroyed || !gm) return;
    try {
      const look = app.backend.current()!.character.look;
      figure = new fv.FigureView({ mode: 'marker', width: 72, height: 96 });
      figure.setLook(look);
      gm.setPlayerFigure(figure.canvas, figure.anchorY(), 96, figure.figureHeightPx());
      applyFigureYaw();
      figure.start();
      gm.map.on('rotate', applyFigureYaw);
      await loadPortraits();
      whoFace.replaceWith(faceEl(look, 64, 'who-face'));
    } catch {
      figure = null;
    }
  };

  // --- DOM ---------------------------------------------------------------------
  const mapEl = h('div', { class: 'map' });
  const fog = h('div', { class: 'fog', 'aria-hidden': 'true' });
  const tilt = h('div', { class: 'tilt', 'aria-hidden': 'true' });
  const dust = h('canvas', { class: 'dust', 'aria-hidden': 'true' });
  const tint = h('div', { class: 'tint', 'aria-hidden': 'true' });
  const wfog = h('div', { class: 'wfog', 'aria-hidden': 'true' });
  const bolt = h('div', { class: 'bolt', 'aria-hidden': 'true' });
  let particles: Particles | null = null;
  let ambience: AmbienceController | null = null;
  const sectorChip = h('button', { class: 'env-chip sector-chip', type: 'button', onclick: () => explainSector() });
  const envChip = h('button', { class: 'env-chip', type: 'button', onclick: () => app.toast(ambienceEffects(currentAmbience())) });
  const overlayHost = h('div', { class: 'overlay-host' });
  const sheetHost = h('div', { class: 'sheet-host' });

  const dayEl = h('span', { class: 'who-day' });
  const hpEl = h('span', { class: 'who-hp', 'aria-label': 'Gesundheit' });
  // Oben: Vorräte zum Überleben einzeln, dazu wie voll der Rucksack ist.
  // Antippen öffnet den Rucksack.
  type ChipKey = Resource | 'pack';
  const chips = {} as Record<ChipKey, { el: HTMLElement; num: HTMLElement; last: number }>;
  const chip = (k: ChipKey, title: string, ic: string) => {
    const num = h('b', null, '0');
    const el = h('span', { class: 'res-chip' + (k === 'pack' ? ' sum' : ''), title }, svgEl(icon(ic, 18)), num);
    chips[k] = { el, num, last: -1 };
    return el;
  };
  const resBar = h(
    'button',
    { class: 'res-bar', type: 'button', 'aria-label': 'Rucksack öffnen', onclick: () => openPack('pack') },
    SURVIVAL_ORDER.map((r) => chip(r, RESOURCES[r].name, r)),
    chip('pack', 'Im Rucksack (Rohstoffe und Kram)', 'backpack'),
  );
  const banners = h('div', { class: 'banners' });
  const locChip = h('div', { class: 'loc-chip' });
  const locateBtn = h('button', { class: 'iconbtn locate', type: 'button', 'aria-label': 'Auf mich zentrieren', onclick: () => recenter() }, svgEl(icon('locate')));
  const homeBadge = h('span', { class: 'home-badge', hidden: true }, '+');
  const homeBtn = h('button', { class: 'iconbtn home', type: 'button', 'aria-label': 'Deine Endstation', onclick: () => void openBase() }, svgEl(icon('home')), homeBadge);
  const hud = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-top' },
      h(
        'button',
        { class: 'who', type: 'button', 'aria-label': 'Gesundheit und Waffen', onclick: () => openPack('gear') },
        whoFace,
        h('span', { class: 'who-text' }, h('span', { class: 'who-name' }, state0.character.name), dayEl, hpEl),
      ),
      resBar,
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Pause', onclick: () => openPause() }, svgEl(icon('menu'))),
      h('div', { class: 'hud-chips' }, sectorChip, envChip),
    ),
    banners,
    h(
      'div',
      { class: 'hud-bottom' },
      locChip,
      homeBtn,
      h('button', { class: 'pack-btn', type: 'button', onclick: () => openPack('pack') }, svgEl(icon('backpack', 26)), h('span', null, 'Rucksack')),
      locateBtn,
    ),
  );
  const el = h('div', { class: 'screen game' }, mapEl, tilt, fog, tint, wfog, dust, bolt, hud, sheetHost, overlayHost);

  // --- Zustand -------------------------------------------------------------------
  let gm: GameMap | null = null;
  let provider: LocationProvider | null = null;
  let fix: Fix | null = null;
  let spots = new Map<string, Spot>();
  let lastRefreshPos: LatLon | null = null;
  let lastSheetRefresh = 0;
  let lastNotify = 0;
  const notified = new Set<string>();
  let ticker = 0;
  let overlay: HTMLElement | null = null;
  let destroyed = false;
  let lastExplorePos: LatLon | null = null;

  const sheet = new SpotSheet({
    app,
    host: sheetHost,
    getSpot: (id) => spots.get(id),
    getFix: () => fix,
    isSim: () => provider?.kind === 'sim',
    walkTo: (p) => walkTo(p),
    onFight: (spot) => startFight(spot),
    onChanged: () => {
      renderHud();
      updateSpots();
    },
  });

  // Zum Testen: einen Fundbeleg zeigen, ohne hinzulaufen
  if (localStorage.getItem('endstation.debug'))
    (window as unknown as { __loot?: unknown }).__loot = (ev: Parameters<SpotSheet['showLoot']>[1]) => {
      const sp = [...spots.values()][0];
      if (sp) sheet.showLoot(sp, { ...ev, spotId: sp.id });
    };

  // --- HUD -----------------------------------------------------------------------
  const renderHud = () => {
    const s = app.backend.current();
    if (!s) return;
    dayEl.textContent = `Tag ${dayNumber(s, app.backend.now())}`;
    const hp = currentHealth(s, app.backend.now());
    if (hpEl.childElementCount !== MAX_HEALTH) {
      clear(hpEl);
      for (let i = 0; i < MAX_HEALTH; i++) hpEl.append(h('i'));
    }
    [...hpEl.children].forEach((c, i) => c.classList.toggle('on', i < hp));
    hpEl.dataset.low = String(hp <= 3);
    hpEl.setAttribute('aria-label', `Gesundheit ${hp} von ${MAX_HEALTH}`);
    const totals: [ChipKey, number][] = [
      ...SURVIVAL_ORDER.map((r): [ChipKey, number] => [r, s.inventory[r]]),
      ['pack', packCount(s)],
    ];
    for (const [k, v] of totals) {
      const c = chips[k];
      if (c.last >= 0 && v > c.last) {
        c.el.classList.remove('bump');
        void c.el.offsetWidth;
        c.el.classList.add('bump');
      }
      c.last = v;
      c.num.textContent = String(v);
    }
    // Zu Hause wartet etwas (Werktisch fertig, Regentonne voll): kleines Zeichen am Endstation-Knopf
    if (getBasePlace()) {
      const now = app.backend.now();
      const ready = readyParts(s, now).count + Object.values(pendingHarvest(s, now)).reduce((a, b) => a + (b ?? 0), 0);
      homeBadge.hidden = ready === 0;
      homeBadge.textContent = String(ready);
      homeBadge.classList.add('ready');
      homeBtn.setAttribute('aria-label', ready ? `Deine Endstation: ${ready} Sachen zum Abholen` : 'Deine Endstation');
    }
  };

  const renderLocChip = () => {
    clear(locChip);
    if (provider?.kind === 'sim') {
      locChip.append(svgEl(icon('tap', 16)), joy ? 'Simulation: mit dem Joystick laufen' : 'Tippe auf die Karte zum Laufen');
      locChip.dataset.q = 'sim';
    } else if (fix) {
      const acc = Math.round(fix.accuracyM);
      locChip.append(svgEl(icon('gps', 16)), `GPS ±${acc} m${mapMode === 'demo' ? ' · Demo-Dorf' : ''}`);
      locChip.dataset.q = acc <= 20 ? 'good' : acc <= 50 ? 'ok' : 'bad';
    } else {
      locChip.append(svgEl(icon('gps', 16)), 'Suche GPS …');
      locChip.dataset.q = 'bad';
    }
  };

  // --- Erkundung & Stimmung ----------------------------------------------------------
  const sectorInfo = () => {
    const s = app.backend.current();
    if (!s || !fix) return null;
    const { sx, sy, key } = sectorOf(fix.pos);
    return { pct: new ExploredView(s.explored).sectorProgress(sx, sy), level: s.sectors[key] ?? 0 };
  };

  const renderSectorChip = () => {
    const info = sectorInfo();
    clear(sectorChip);
    if (!info) return;
    const pct = Math.round(info.pct * 100);
    sectorChip.dataset.level = String(info.level);
    sectorChip.append(svgEl(icon('compass', 15)), `Sektor ${pct} %`, h('span', { class: 'mini-bar' }, h('span', { style: `width:${Math.min(100, pct * 2)}%` })));
  };

  const explainSector = () => {
    const info = sectorInfo();
    if (!info) return;
    const pct = Math.round(info.pct * 100);
    const next = SECTOR_LEVELS[info.level];
    app.toast(
      next
        ? `Dieser Sektor ist zu ${pct} % erkundet. Ab ${Math.round(next.pct * 100)} % gilt er als ${next.name} und es gibt eine Belohnung.`
        : `Dieser Sektor ist gesichert (${pct} %). Such dir den nächsten!`,
    );
  };

  const renderEnvChip = (a: Ambience) => {
    clear(envChip);
    const ic = a.weather !== 'clear' && a.weather !== 'cloudy' ? a.weather : a.phase === 'night' ? 'moon' : a.phase === 'dusk' ? 'sunset' : a.weather === 'cloudy' ? 'cloud' : 'sun';
    const label = a.weather === 'clear' || a.weather === 'cloudy' ? PHASE_NAMES[a.phase] : `${a.phase === 'day' ? '' : PHASE_NAMES[a.phase] + ', '}${WEATHER_NAMES[a.weather]}`;
    envChip.dataset.phase = a.phase;
    append(envChip, [svgEl(icon(ic, 15)), label, a.tempC !== null ? h('span', { class: 'temp' }, `${Math.round(a.tempC)}°`) : null]);
  };

  const explore = async (f: Fix) => {
    if (lastExplorePos && distanceM(lastExplorePos, f.pos) < 12) return;
    lastExplorePos = f.pos;
    const res = await app.backend.dispatch({ type: 'explore', at: f.pos, accuracyM: f.accuracyM });
    if (!res.events.length || destroyed) return;
    gm?.fog?.setExplored(res.state.explored);
    for (const e of res.events) {
      if (e.type !== 'sector') continue;
      const lvl = SECTOR_LEVELS[e.level - 1];
      const reward = RESOURCE_ORDER.filter((k) => e.reward[k]).map((k) => `${e.reward[k]} ${RESOURCES[k].name}`).join(', ');
      app.toast(`Sektor ${lvl.name}! Belohnung: ${reward}`, 'good');
      if (app.settings.get().vibration) {
        try {
          navigator.vibrate?.([40, 50, 40, 50, 120]);
        } catch {
          /* egal */
        }
      }
      renderHud();
    }
    renderSectorChip();
  };

  // Hinweise oben: einer für GPS, einer für die Karte. So verdrängen sie sich nicht.
  const bannerEls: Partial<Record<'gps' | 'map', HTMLElement>> = {};
  const showBanner = (key: 'gps' | 'map', title: string, text: string, actions: [string, () => void][]) => {
    let b = bannerEls[key];
    if (!b) {
      b = bannerEls[key] = h('div', { class: 'banner' });
      banners.append(b);
    }
    clear(b);
    append(b, [
      h('div', { class: 'banner-title' }, title),
      h('p', null, text),
      actions.length ? h('div', { class: 'row' }, actions.map(([label, fn], i) => h('button', { class: 'btn small' + (i ? ' ghost' : ''), type: 'button', onclick: fn }, label))) : null,
    ]);
  };
  const hideBanner = (key: 'gps' | 'map') => {
    bannerEls[key]?.remove();
    delete bannerEls[key];
  };

  // --- Karte & Fundstellen -------------------------------------------------------
  const updateFog = () => {
    if (!gm || !fix) return;
    const p = gm.project(fix.pos);
    // Sicht: klar bis ~150 m, dann Dunst, ab ~500 m fast nur noch Nebel.
    const px = (m: number) => Math.max(m / 2.2, gm!.metersToPixels(m, fix!.pos));
    el.style.setProperty('--px', `${p.x}px`);
    el.style.setProperty('--py', `${p.y}px`);
    el.style.setProperty('--r1', `${px(150)}px`);
    el.style.setProperty('--r2', `${px(300)}px`);
    el.style.setProperty('--r3', `${px(520)}px`);
  };

  const refreshSpots = async (force = false) => {
    if (!gm || !fix) return;
    if (!force && lastRefreshPos && distanceM(lastRefreshPos, fix.pos) < 60) return;
    lastRefreshPos = fix.pos;
    const list = await app.backend.spotsNear(fix.pos, VIEW_RADIUS_M, gm.poiCandidates());
    if (destroyed) return;
    spots = new Map(list.map((s) => [s.id, s]));
    updateSpots();
  };

  const updateSpots = () => {
    const s = app.backend.current();
    if (!gm || !s) return;
    const now = app.backend.now();
    const range = searchRangeM(s);
    const views: SpotView[] = [];
    for (const spot of spots.values()) {
      const wait = readyAt(s, spot) - now;
      const d = fix ? distanceM(fix.pos, spot.pos) : Infinity;
      const st = wait > 0 ? 'cooldown' : d <= range ? 'inrange' : 'ready';
      // Bei Nebel sieht man Wächter erst aus der Nähe
      const guard = wait > 0 || d > guardSightM() ? null : app.backend.guardFor(spot);
      if (st === 'inrange') {
        if (!notified.has(spot.id)) {
          notified.add(spot.id);
          notifyNear(spot);
        }
      } else if (d > range + 15) notified.delete(spot.id);
      views.push({ spot, state: st, guard });
    }
    gm.setSpots(views);
    const t = performance.now();
    if (t - lastSheetRefresh > 400) {
      lastSheetRefresh = t;
      sheet.refresh();
    }
  };

  const notifyNear = (spot: Spot) => {
    const t = Date.now();
    if (t - lastNotify < 4000 || sheet.openId === spot.id) return;
    lastNotify = t;
    if (app.settings.get().vibration) {
      try {
        navigator.vibrate?.([70, 90, 70]);
      } catch {
        /* nicht unterstützt */
      }
    }
    app.toast(`In Reichweite: ${spot.name}`);
  };

  const recenter = () => {
    if (!gm || !fix) return;
    gm.setFollow(true, fix.pos);
    locateBtn.classList.remove('lost');
  };

  const walkTo = (p: LatLon) => {
    if (provider instanceof SimulatedLocation) {
      provider.walkTo(p);
      gm?.setTarget(p);
      if (gm && !gm.follow) recenter();
    }
  };

  // --- Joystick (nur in der Simulation; mit GPS läufst du selbst) ---------------------
  let joy: Joystick | null = null;
  let joyRaf = 0;
  let joyLabelTimer = 0;
  const nearestSpot = (): Spot | null => {
    const s = app.backend.current();
    if (!fix || !s) return null;
    const range = searchRangeM(s) + Math.min(fix.accuracyM, 25);
    let best: Spot | null = null;
    let bd = Infinity;
    for (const sp of spots.values()) {
      const d = distanceM(fix.pos, sp.pos);
      if (d <= range && d < bd) {
        bd = d;
        best = sp;
      }
    }
    return best;
  };
  let joyEl: HTMLElement | null = null;
  const teardownJoystick = () => {
    cancelAnimationFrame(joyRaf);
    clearInterval(joyLabelTimer);
    joyEl?.remove();
    joyEl = null;
    joy = null;
  };
  const setupJoystick = () => {
    teardownJoystick();
    if (!(provider instanceof SimulatedLocation) || app.settings.get().control !== 'joystick') return renderLocChip();
    const j = new Joystick();
    joy = j;
    const use = useButton(() => {
      const sp = nearestSpot();
      if (sp) sheet.open(sp.id);
      else app.toast('Keine Fundstelle in Reichweite. Lauf näher ran.');
    });
    joyEl = h('div', { class: 'map-controls' }, j.el, use.el);
    hud.append(joyEl);
    joyLabelTimer = window.setInterval(() => use.setLabel(nearestSpot() ? 'Durchsuchen' : null), 300);
    let last = performance.now();
    const loop = (t: number) => {
      joyRaf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (!j.active || !(provider instanceof SimulatedLocation) || !gm) return;
      const v = j.value;
      const len = Math.hypot(v.x, v.y);
      // Richtung relativ zur gedrehten Karte; Tempo wie beim Antippen (rennen)
      const ang = (gm.bearing * Math.PI) / 180 + Math.atan2(v.x, -v.y);
      const dist = provider.speed * len * dt;
      if (!gm.follow) recenter();
      gm.setTarget(null);
      provider.nudge(Math.sin(ang) * dist, Math.cos(ang) * dist);
    };
    joyRaf = requestAnimationFrame(loop);
    renderLocChip();
  };
  // Steuerung oder Grafik in den Einstellungen umgestellt: sofort übernehmen
  let lastControl = app.settings.get().control;
  const offSettings = app.settings.onChange((st) => {
    gm?.setComic(st.graphics === 'comic');
    if (st.control === lastControl) return;
    lastControl = st.control;
    if (provider) setupJoystick();
  });

  // --- Standort ------------------------------------------------------------------
  let heavyAt = 0;
  let heavyTimer = 0;
  const onFix = (f: Fix) => {
    const first = !fix;
    fix = f;
    const s = app.backend.current();
    if (!gm || !s) return;
    hideBanner('gps');
    // Leicht und flüssig: Figur und Kamera
    gm.setPlayer(f.pos, avatar);
    updateFigure(f);
    if (first) gm.centerOn(f.pos, false);
    else if (gm.follow) gm.centerOn(f.pos, !f.simulated);
    if (provider instanceof SimulatedLocation && !provider.moving) gm.setTarget(null);
    // Der Rest (Suchradius, Fundstellen, Nebel) höchstens ein paar Mal pro Sekunde
    const now = performance.now();
    clearTimeout(heavyTimer);
    if (first || !f.simulated || now - heavyAt > 200) {
      heavyAt = now;
      onFixHeavy(f, first);
    } else
      heavyTimer = window.setTimeout(() => {
        heavyAt = performance.now();
        if (fix) onFixHeavy(fix, false);
      }, 220);
  };
  const onFixHeavy = (f: Fix, first: boolean) => {
    const s = app.backend.current();
    if (!gm || !s || destroyed) return;
    gm.setRange(f.pos, searchRangeM(s));
    if (!f.simulated && mapMode === 'real') {
      const last = app.settings.get().lastPos;
      if (!last || distanceM(last, f.pos) > 300) app.settings.set({ lastPos: f.pos });
    }
    if (first || !f.simulated) renderLocChip();
    ambience?.setPosition(f.pos);
    void explore(f);
    if (first) renderSectorChip();
    updateFog();
    void refreshSpots(first);
    updateSpots();
  };

  const useSimulation = () => {
    app.settings.set({ location: 'sim' });
    app.go('game');
  };

  const onLocError = (code: LocationErrorCode) => {
    if (code === 'denied' || code === 'unsupported') {
      showBanner(
        'gps',
        code === 'denied' ? 'Kein Zugriff auf deinen Standort' : 'Kein GPS verfügbar',
        code === 'denied'
          ? 'Erlaube den Standortzugriff in den Browser-Einstellungen. Oder teste erst mal mit Tippen-zum-Laufen.'
          : 'Dieses Gerät oder dieser Browser liefert keinen Standort. Du kannst mit Tippen-zum-Laufen spielen.',
        [['Simulation nutzen', useSimulation]],
      );
    } else if (!fix) {
      showBanner('gps', 'Kein GPS-Signal', 'Draußen klappt es meist besser. Das Spiel sucht weiter.', [['Simulation nutzen', useSimulation]]);
    }
  };

  // --- Overlays ------------------------------------------------------------------
  const closeOverlay = () => {
    overlay?.remove();
    overlay = null;
  };

  // --- Kampf ------------------------------------------------------------------------
  const openFight = () => {
    sheet.close();
    closeOverlay();
    overlay = openBattle(app, overlayHost, currentAmbience().phase, (end) => {
      overlay = null;
      renderHud();
      updateSpots();
      if (end.outcome === 'won' && end.loot) sheet.showLoot(end.spot, end.loot, end.kills && end.kills > 1 ? `${end.kills} Zombies erledigt` : `${ENEMIES[end.enemy].name} erledigt`);
      else if (end.outcome === 'fled') app.toast('Du hast dich zurückgezogen.');
    });
  };

  const startFight = async (spot: Spot) => {
    if (!fix) return;
    const res = await app.backend.dispatch({ type: 'engage', spot, at: fix.pos, accuracyM: fix.accuracyM });
    const ev = res.events[0];
    if (ev.type === 'rejected') {
      app.toast(REJECT_TEXT[ev.reason], 'warn');
      updateSpots();
      return;
    }
    openFight();
  };

  // --- Endstation -------------------------------------------------------------------
  const refreshBaseMarker = () => {
    const place = getBasePlace();
    gm?.setBase(place?.pos ?? null);
    homeBadge.hidden = !!place;
    if (!place) {
      homeBadge.textContent = '+';
      homeBadge.classList.remove('ready');
    } else renderHud();
  };

  // Die 3D-Halle (three.js) wird erst beim ersten Öffnen nachgeladen,
  // damit die Karte beim Start schneller da ist.
  let baseLoading = false;
  const openBase = async () => {
    if (baseLoading) return;
    baseLoading = true;
    let mod: typeof import('../base/baseView');
    try {
      mod = await import('../base/baseView');
    } catch {
      app.toast('Die Endstation konnte nicht geladen werden. Prüfe die Verbindung.', 'warn');
      return;
    } finally {
      baseLoading = false;
    }
    const { openBaseView, openSetBase, openSitePicker } = mod;
    sheet.close();
    closeOverlay();
    if (!getBasePlace()) {
      overlay = openSetBase(app, overlayHost, () => fix, (set) => {
        overlay = null;
        refreshBaseMarker();
        if (set) void openBase();
      });
      return;
    }
    if (!app.backend.current()!.base.active) {
      // Erster Besuch: Schauplatz aussuchen
      overlay = openSitePicker(app, overlayHost, {
        first: true,
        onChosen: async (site) => {
          overlay = null;
          await app.backend.dispatch({ type: 'chooseSite', site });
          app.toast('Deine Endstation steht. Räum erst mal auf, darin steckt Material!', 'good');
          void openBase();
        },
      });
      return;
    }
    overlay = openBaseView(app, overlayHost, {
      getFix: () => fix,
      phase: () => currentAmbience().phase,
      weather: () => currentAmbience().weather,
      onClose: () => {
        overlay = null;
        refreshBaseMarker();
      },
      onChanged: () => {
        renderHud();
        refreshBaseMarker();
      },
    });
  };

  const openPack = (tab: PackTab = 'pack') => {
    sheet.close();
    closeOverlay();
    overlay = openPackPanel(
      app,
      overlayHost,
      closeOverlay,
      () => {
        renderHud();
        updateSpots();
      },
      tab,
    );
  };

  const openPause = () => {
    sheet.close();
    closeOverlay();
    const before = { ...app.settings.get() };
    const body = h('div', { class: 'pause-body' });
    const close = () => {
      const now = app.settings.get();
      closeOverlay();
      if (now.map !== before.map || now.location !== before.location) app.go('game');
    };
    const showMain = () => {
      clear(body);
      body.append(
        h(
          'ol',
          { class: 'route compact' },
          h('li', { class: 'primary' }, h('button', { type: 'button', onclick: close }, h('span', { class: 'stop-dot' }), h('span', { class: 'stop-text' }, 'Weiterspielen'))),
          h('li', null, h('button', { type: 'button', onclick: showSettings }, h('span', { class: 'stop-dot' }), h('span', { class: 'stop-text' }, 'Einstellungen'))),
          h('li', null, h('button', { type: 'button', onclick: () => app.go('menu') }, h('span', { class: 'stop-dot' }), h('span', { class: 'stop-text' }, 'Hauptmenü', h('small', null, 'Dein Spielstand ist gespeichert')))),
        ),
      );
    };
    const showSettings = () => {
      clear(body);
      body.append(
        h('button', { class: 'btn ghost small back-link', type: 'button', onclick: showMain }, svgEl(icon('back', 16)), 'Zurück'),
        settingsPanel(app, { onDeleted: () => app.go('menu') }),
      );
    };
    overlay = h(
      'div',
      { class: 'overlay pause', role: 'dialog', 'aria-label': 'Pause' },
      h(
        'div',
        { class: 'overlay-inner' },
        h('header', { class: 'topbar' }, h('h1', { class: 'sign-title' }, 'Pause'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: close }, svgEl(icon('close')))),
        body,
      ),
    );
    showMain();
    overlayHost.append(overlay);
  };

  const onVisible = async () => {
    if (document.visibilityState !== 'visible' || !app.backend.current()) return;
    const res = await app.backend.dispatch({ type: 'session' });
    if (res.events.some((e) => e.type === 'returnBonus')) app.toast('Willkommen zurück! Deine nächste Suche bringt doppelt so viel.', 'good');
    renderHud();
    updateSpots();
  };

  return {
    el,
    async mount() {
      renderHud();
      renderLocChip();
      void onVisible();
      // Ein laufender Kampf geht nach dem Neuladen weiter.
      if (app.backend.current()?.combat) openFight();
      document.addEventListener('visibilitychange', onVisible);

      const start = mapMode === 'demo' ? DEMO.start : (initial.lastPos ?? FALLBACK_START);
      gm = new GameMap(mapEl, {
        mode: mapMode,
        start,
        onTap: (p) => {
          sheet.close();
          if (provider?.kind === 'sim' && !joy) walkTo(p);
        },
        onSpotTap: (id) => sheet.open(id),
        onBaseTap: () => void openBase(),
        onFollowChange: (f) => locateBtn.classList.toggle('lost', !f),
        onCameraMove: updateFog,
        onDataChanged: () => {
          if (mapMode === 'real') void refreshSpots(true);
        },
        onError: (msg) =>
          showBanner('map', 'Karte nicht verfügbar', msg, [
            [
              'Demo-Dorf nutzen',
              () => {
                app.settings.set({ map: 'demo' });
                app.go('game');
              },
            ],
          ]),
      });
      gm.setComic(app.settings.get().graphics === 'comic');
      try {
        await gm.init();
      } catch (err) {
        console.error(err);
        showBanner('map', 'Karte konnte nicht starten', 'Dein Browser unterstützt vermutlich kein WebGL.', []);
        return;
      }
      if (destroyed) return;
      gm.fog?.setExplored(app.backend.current()?.explored ?? {});
      refreshBaseMarker();
      particles = new Particles(dust);
      ambience = new AmbienceController(app, el, gm.map, gm.fog?.canvas ?? null, particles, bolt);
      ambience.onChange((a) => {
        renderEnvChip(a);
        updateSpots();
      });
      ambience.refresh();

      if (locMode === 'sim') provider = new SimulatedLocation(start);
      else if (mapMode === 'demo') provider = new AnchoredLocation(new GpsLocation(), DEMO.start);
      else provider = new GpsLocation();
      if (locMode === 'gps') showBanner('gps', 'Suche GPS-Signal …', 'Einen Moment. Draußen geht es schneller.', []);
      provider.start(onFix, onLocError);
      setupJoystick();
      renderLocChip();
      void loadFigure();

      ticker = window.setInterval(() => {
        renderHud();
        updateSpots();
      }, 15000);
    },
    destroy() {
      destroyed = true;
      particles?.destroy();
      ambience?.destroy();
      figure?.dispose();
      clearTimeout(walkTimer);
      clearTimeout(heavyTimer);
      teardownJoystick();
      offSettings();
      clearInterval(ticker);
      document.removeEventListener('visibilitychange', onVisible);
      provider?.stop();
      gm?.destroy();
    },
  };
}
