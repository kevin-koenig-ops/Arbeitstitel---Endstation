// Der Spielbildschirm: Karte, Standort, Fundstellen, HUD und Overlays.

import { FALLBACK_START, IS_PREVIEW, VIEW_RADIUS_M } from '../../config';
import { ENEMIES, MAX_HEALTH, RESOURCE_ORDER, RESOURCES } from '../../core/content';
import { distanceM } from '../../core/geo';
import { currentHealth, dayNumber, pendingHarvest, readyAt, searchRangeM } from '../../core/rules';
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
import { append, clear, h, svgEl } from '../dom';
import { openBusPanel } from '../game/busPanel';
import { openCombat } from '../game/combat';
import { mountDust } from '../game/dust';
import { SpotSheet } from '../game/spotSheet';
import { icon, resIcon } from '../icons';
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

  // --- DOM ---------------------------------------------------------------------
  const mapEl = h('div', { class: 'map' });
  const fog = h('div', { class: 'fog', 'aria-hidden': 'true' });
  const tilt = h('div', { class: 'tilt', 'aria-hidden': 'true' });
  const dust = h('canvas', { class: 'dust', 'aria-hidden': 'true' });
  let unmountDust = () => {};
  const overlayHost = h('div', { class: 'overlay-host' });
  const sheetHost = h('div', { class: 'sheet-host' });

  const dayEl = h('span', { class: 'who-day' });
  const hpEl = h('span', { class: 'who-hp', 'aria-label': 'Gesundheit' });
  const chips = {} as Record<Resource, { el: HTMLElement; num: HTMLElement; last: number }>;
  const resBar = h(
    'div',
    { class: 'res-bar' },
    RESOURCE_ORDER.map((r) => {
      const num = h('b', null, '0');
      const el = h('div', { class: 'res-chip', title: RESOURCES[r].name }, svgEl(resIcon(r, 18)), num);
      chips[r] = { el, num, last: -1 };
      return el;
    }),
  );
  const banners = h('div', { class: 'banners' });
  const locChip = h('div', { class: 'loc-chip' });
  const busBadge = h('span', { class: 'bus-badge', hidden: true });
  const locateBtn = h('button', { class: 'iconbtn locate', type: 'button', 'aria-label': 'Auf mich zentrieren', onclick: () => recenter() }, svgEl(icon('locate')));
  const hud = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-top' },
      h(
        'button',
        { class: 'who', type: 'button', 'aria-label': 'Bus und Vorräte öffnen', onclick: () => openBus() },
        svgEl(avatar, 'who-face'),
        h('span', { class: 'who-text' }, h('span', { class: 'who-name' }, state0.character.name), dayEl, hpEl),
      ),
      resBar,
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Pause', onclick: () => openPause() }, svgEl(icon('menu'))),
    ),
    banners,
    h(
      'div',
      { class: 'hud-bottom' },
      locChip,
      h('button', { class: 'bus-btn', type: 'button', onclick: () => openBus() }, svgEl(icon('bus', 26)), h('span', null, 'Bus'), busBadge),
      locateBtn,
    ),
  );
  const el = h('div', { class: 'screen game' }, mapEl, tilt, fog, dust, hud, sheetHost, overlayHost);

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
    for (const r of RESOURCE_ORDER) {
      const c = chips[r];
      const v = s.inventory[r];
      if (c.last >= 0 && v > c.last) {
        c.el.classList.remove('bump');
        void c.el.offsetWidth;
        c.el.classList.add('bump');
      }
      c.last = v;
      c.num.textContent = String(v);
    }
    const pending = Object.values(pendingHarvest(s, app.backend.now())).reduce((a, b) => a + (b ?? 0), 0);
    busBadge.hidden = pending === 0;
    busBadge.textContent = String(pending);
  };

  const renderLocChip = () => {
    clear(locChip);
    if (provider?.kind === 'sim') {
      locChip.append(svgEl(icon('tap', 16)), 'Tippe auf die Karte zum Laufen');
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
    fog.style.setProperty('--px', `${p.x}px`);
    fog.style.setProperty('--py', `${p.y}px`);
    fog.style.setProperty('--r1', `${px(150)}px`);
    fog.style.setProperty('--r2', `${px(300)}px`);
    fog.style.setProperty('--r3', `${px(520)}px`);
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
      const guard = wait > 0 ? null : app.backend.guardFor(spot);
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

  // --- Standort ------------------------------------------------------------------
  const onFix = (f: Fix) => {
    const first = !fix;
    fix = f;
    const s = app.backend.current();
    if (!gm || !s) return;
    hideBanner('gps');
    gm.setPlayer(f.pos, avatar);
    gm.setRange(f.pos, searchRangeM(s));
    if (first) gm.centerOn(f.pos, false);
    else if (gm.follow) gm.centerOn(f.pos, !f.simulated);
    if (provider instanceof SimulatedLocation && !provider.moving) gm.setTarget(null);
    if (!f.simulated && mapMode === 'real') {
      const last = app.settings.get().lastPos;
      if (!last || distanceM(last, f.pos) > 300) app.settings.set({ lastPos: f.pos });
    }
    if (first || !f.simulated) renderLocChip();
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
    overlay = openCombat(app, overlayHost, (end) => {
      overlay = null;
      renderHud();
      updateSpots();
      if (end.outcome === 'won' && end.loot) sheet.showLoot(end.spot, end.loot, `${ENEMIES[end.enemy].name} erledigt`);
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

  const openBus = () => {
    sheet.close();
    closeOverlay();
    overlay = openBusPanel(app, overlayHost, closeOverlay, () => {
      renderHud();
      updateSpots();
    });
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
      unmountDust = mountDust(dust);
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
          if (provider?.kind === 'sim') walkTo(p);
        },
        onSpotTap: (id) => sheet.open(id),
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
      try {
        await gm.init();
      } catch (err) {
        console.error(err);
        showBanner('map', 'Karte konnte nicht starten', 'Dein Browser unterstützt vermutlich kein WebGL.', []);
        return;
      }
      if (destroyed) return;

      if (locMode === 'sim') provider = new SimulatedLocation(start);
      else if (mapMode === 'demo') provider = new AnchoredLocation(new GpsLocation(), DEMO.start);
      else provider = new GpsLocation();
      if (locMode === 'gps') showBanner('gps', 'Suche GPS-Signal …', 'Einen Moment. Draußen geht es schneller.', []);
      provider.start(onFix, onLocError);
      renderLocChip();

      ticker = window.setInterval(() => {
        renderHud();
        updateSpots();
      }, 15000);
    },
    destroy() {
      destroyed = true;
      unmountDust();
      clearInterval(ticker);
      document.removeEventListener('visibilitychange', onVisible);
      provider?.stop();
      gm?.destroy();
    },
  };
}
