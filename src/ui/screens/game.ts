// Der Spielbildschirm: Karte, Standort, Fundstellen, HUD und Overlays.

import { FALLBACK_START, IS_PREVIEW, VIEW_RADIUS_M } from '../../config';
import { CACHE, ENEMIES, MAX_HEALTH, RESOURCE_ORDER, RESOURCES, SURVIVAL_ORDER } from '../../core/content';
import { ExploredView, SECTOR_LEVELS, sectorOf } from '../../core/explore';
import { bearingDeg, distanceM, formatDistance, offsetM } from '../../core/geo';
import { rankOf } from '../../core/progress';
import { currentHealth, dayNumber, packCount, pendingHarvest, readyAt, readyParts, searchRangeM, spotKey } from '../../core/rules';
import type { Cache, LatLon, Spot } from '../../core/types';
import { DEMO, GameMap, type SpotView } from '../../map/GameMap';
import { WalkNet } from '../../map/walkNet';
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
import { goalChip, openProgressPanel } from '../game/progressPanel';
import { icon } from '../icons';
import { settingsPanel } from '../settingsPanel';
import { menuItem } from './menu';
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
  const goals = goalChip(app, () => openProgress());
  // Versteck in der Nähe: kalt, warm, heiß (und dann ausgraben)
  const cacheChip = h('button', { class: 'env-chip cache-chip', type: 'button', hidden: true });
  const overlayHost = h('div', { class: 'overlay-host' });
  const sheetHost = h('div', { class: 'sheet-host' });

  // HUD nach dem Vorbild der bewährten Karten-Spiele (Pokémon Go, Monster Hunter Now):
  // Die Karte ist die Bühne. Oben nur kleine Anzeigen, unten drei Knöpfe, ein Hauptknopf in der Mitte.
  // Alles Weitere (Vorräte, Name, Tag) gibt es beim Antippen.
  const HP_R = 19.5;
  const HP_C = 2 * Math.PI * HP_R;
  const hpRing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hpRing.setAttribute('class', 'who-ring');
  hpRing.setAttribute('viewBox', '0 0 44 44');
  hpRing.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < MAX_HEALTH; i++) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const seg = HP_C / MAX_HEALTH;
    c.setAttribute('cx', '22');
    c.setAttribute('cy', '22');
    c.setAttribute('r', String(HP_R));
    c.setAttribute('stroke-dasharray', `${seg - 2.2} ${HP_C - seg + 2.2}`);
    c.setAttribute('stroke-dashoffset', String(-i * seg));
    hpRing.append(c);
  }
  const whoBtn = h('button', { class: 'who', type: 'button', 'aria-label': 'Gesundheit und Waffen', onclick: () => openPack('gear') }, whoFace, hpRing);
  // Rucksack: Hauptknopf. Die Zahl zeigt, was du gerade nach Hause trägst.
  const packBadge = h('span', { class: 'pack-badge', hidden: true });
  const packBtn = h('button', { class: 'pack-btn', type: 'button', 'aria-label': 'Rucksack', onclick: () => openPack('pack') }, svgEl(icon('backpack', 28)), packBadge);
  let lastLoot = -1;
  const banners = h('div', { class: 'banners' });
  // Kurzer Hinweis unten (Simulation, GPS sucht noch). Gutes GPS zeigt nur ein Punkt am Zentrieren-Knopf.
  const locChip = h('div', { class: 'loc-chip', hidden: true });
  let locHintUntil = 0;
  const locateBtn = h('button', { class: 'iconbtn locate', type: 'button', 'aria-label': 'Auf mich zentrieren', onclick: () => recenter() }, svgEl(icon('locate')));
  const homeBadge = h('span', { class: 'home-badge', hidden: true }, '+');
  const homeBtn = h('button', { class: 'iconbtn home', type: 'button', 'aria-label': 'Dein Zuhause', onclick: () => void openBase() }, svgEl(icon('home')), homeBadge);
  const hud = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-top' },
      h('div', { class: 'hud-tl' }, whoBtn, goals.el),
      h(
        'div',
        { class: 'hud-tr' },
        cacheChip,
        sectorChip,
        envChip,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Menü', onclick: () => openPause() }, svgEl(icon('menu', 20))),
      ),
    ),
    banners,
    h('div', { class: 'hud-bottom' }, locChip, homeBtn, packBtn, locateBtn),
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
  const notifiedCarts = new Set<string>();
  const cartNews: Spot[] = [];
  // Erstfund: Die Kurz-Kennungen der schon besuchten Fundstellen (wie im Regelwerk)
  let seenCache: { list: number[]; set: Set<number> } | null = null;
  const seenSet = (st: { seen: number[] }) => {
    if (!seenCache || seenCache.list !== st.seen) seenCache = { list: st.seen, set: new Set(st.seen) };
    return seenCache.set;
  };
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
    onAmbush: () => openFight(),
    flyTarget: () => packBtn,
    onChanged: () => {
      renderHud();
      updateSpots();
    },
  });

  // Zum Testen: im Simulationsmodus zu einem Punkt laufen (Meter östlich/nördlich vom Start)
  if (localStorage.getItem('endstation.debug'))
    (window as unknown as { __walk?: unknown }).__walk = (dx: number, dy: number) => {
      if (!(provider instanceof SimulatedLocation)) return null;
      const s0 = mapMode === 'demo' ? DEMO.start : provider.position;
      walkTo(offsetM(s0, dx, dy));
      return { ways: net?.wayCount ?? 0, legs: routeOff.length, off: routeOff.filter(Boolean).length };
    };

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
    goals.render();
    const hp = currentHealth(s, app.backend.now());
    [...hpRing.children].forEach((c, i) => c.classList.toggle('on', i < hp));
    hpRing.dataset.low = String(hp <= 3);
    whoBtn.setAttribute('aria-label', `${s.character.name}, ${rankOf(s).name}, Tag ${dayNumber(s, app.backend.now())}. Gesundheit ${hp} von ${MAX_HEALTH}. Ausrüstung öffnen`);
    // Rucksack: Zahl = was du nach Hause trägst; kurzes Aufleuchten, wenn etwas dazukommt
    const carried = packCount(s);
    const loot = carried + SURVIVAL_ORDER.reduce((a, r) => a + s.inventory[r], 0);
    if (lastLoot >= 0 && loot > lastLoot) {
      packBtn.classList.remove('bump');
      void packBtn.offsetWidth;
      packBtn.classList.add('bump');
    }
    lastLoot = loot;
    packBadge.hidden = carried === 0;
    packBadge.textContent = String(carried);
    packBtn.setAttribute('aria-label', carried ? `Rucksack, ${carried} Sachen zum Heimbringen` : 'Rucksack');
    // Zu Hause wartet etwas (Werktisch fertig, Regentonne voll): kleines Zeichen am Haus-Knopf
    if (getBasePlace()) {
      const now = app.backend.now();
      const ready = readyParts(s, now).count + Object.values(pendingHarvest(s, now)).reduce((a, b) => a + (b ?? 0), 0);
      homeBadge.hidden = ready === 0;
      homeBadge.textContent = String(ready);
      homeBadge.classList.add('ready');
      homeBtn.setAttribute('aria-label', ready ? `Dein Zuhause: ${ready} Sachen zum Abholen` : 'Dein Zuhause');
    }
  };

  const renderLocChip = () => {
    clear(locChip);
    let q: string;
    let text: string;
    let show: boolean;
    if (provider?.kind === 'sim') {
      q = 'sim';
      text = joy ? 'Simulation: mit dem Joystick laufen' : 'Tippe auf die Karte zum Laufen';
      // Nur am Anfang kurz zeigen, danach weiß man es
      if (!locHintUntil) locHintUntil = performance.now() + 6000;
      show = performance.now() < locHintUntil;
    } else if (fix) {
      const acc = Math.round(fix.accuracyM);
      q = acc <= 20 ? 'good' : acc <= 50 ? 'ok' : 'bad';
      text = `GPS ungenau (±${acc} m)`;
      show = q === 'bad';
    } else {
      q = 'bad';
      text = 'Suche GPS …';
      show = true;
    }
    locChip.dataset.q = q;
    locChip.append(svgEl(icon(q === 'sim' ? 'tap' : 'gps', 15)), text);
    locChip.hidden = !show;
    locateBtn.dataset.q = q;
    const accTxt = fix && provider?.kind !== 'sim' ? `, GPS ±${Math.round(fix.accuracyM)} m${mapMode === 'demo' ? ', Demo-Dorf' : ''}` : '';
    locateBtn.setAttribute('aria-label', `Auf mich zentrieren${accTxt}`);
    if (show && q === 'sim') window.setTimeout(() => !destroyed && renderLocChip(), locHintUntil - performance.now() + 50);
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
    sectorChip.setAttribute('aria-label', `Sektor zu ${pct} % erkundet`);
    sectorChip.append(svgEl(icon('compass', 15)), `${pct} %`);
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
    envChip.setAttribute('aria-label', `${label}${a.tempC !== null ? `, ${Math.round(a.tempC)} Grad` : ''}`);
    envChip.title = label;
    // Nur Symbol und Temperatur; den Namen gibt es beim Antippen
    append(envChip, [svgEl(icon(ic, 16)), a.tempC !== null ? h('span', { class: 'temp' }, `${Math.round(a.tempC)}°`) : null]);
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
    if (destroyed || !gm) return;
    // Keine Fundstellen auf Friedhöfen, an Schulen, Krankenhäusern, Gedenkstätten oder in Gebäuden
    const sensitive = gm.sensitiveCheck();
    app.backend.setPlaceFilter((p) => sensitive(p, true));
    spots = new Map(list.filter((s) => !sensitive(s.pos, s.source === 'grid')).map((s) => [s.id, s]));
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
      const cart = wait > 0 ? null : app.backend.cartFor(spot);
      if (cart && !notifiedCarts.has(spot.id) && d < 600) {
        notifiedCarts.add(spot.id);
        cartNews.push(spot);
      }
      if (st === 'inrange') {
        if (!notified.has(spot.id)) {
          notified.add(spot.id);
          notifyNear(spot);
        }
      } else if (d > range + 15) notified.delete(spot.id);
      views.push({ spot, state: st, guard, cart: !!cart, fresh: !seenSet(s).has(spotKey(spot.id)) });
    }
    gm.setSpots(views);
    if (cartNews.length) {
      const sp = cartNews.splice(0)[0];
      app.toast(`Funkspruch: Bei „${sp.name}“ ist ein Händlerkarren liegen geblieben. ${fix ? formatDistance(distanceM(fix.pos, sp.pos)) + ' entfernt.' : ''}`, 'good');
    }
    updateCaches();
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

  // --- Wegenetz (nur Testmodus): im Ort über Straßen und Wege, draußen auch quer ------------
  let net: WalkNet | null = null;
  let netAt = 0;
  let routeOff: boolean[] = [];
  let snapHintAt = 0;
  /** Wegenetz rund um p, bei Bedarf neu aus den geladenen Kartendaten gebaut. */
  const walkNet = (p: LatLon, needM = 0): WalkNet | null => {
    if (!gm) return null;
    const now = performance.now();
    const stale = !net || distanceM(net.center, p) + needM > 450 || now - netAt > (net.wayCount ? 20000 : 3000);
    if (stale) {
      try {
        net = new WalkNet(gm.walkInput(p, Math.max(700, needM + 300)));
        netAt = now;
      } catch {
        net = null;
      }
    }
    return net;
  };

  const walkTo = (p: LatLon) => {
    if (!(provider instanceof SimulatedLocation)) return;
    const from = provider.position;
    const n = walkNet(from, distanceM(from, p));
    const r = n?.wayCount ? n.route(from, p) : null;
    if (r) {
      provider.walkPath(r.path, r.speeds);
      routeOff = r.offroad;
      gm?.setRoute(r.path, r.offroad);
      gm?.setTarget(r.end);
      if (r.snapped && performance.now() - snapHintAt > 30000) {
        snapHintAt = performance.now();
        app.toast('Im Ort geht es nur über Straßen und Wege.');
      }
    } else {
      provider.walkTo(p);
      routeOff = [];
      gm?.setRoute(null);
      gm?.setTarget(p);
    }
    if (gm && !gm.follow) recenter();
  };

  // Quer durchs Unterholz: langsamer, und manchmal kommt dir etwas entgegen
  let roamFrom: LatLon | null = null;
  let roamM = 0;
  let roamBusy = false;
  let wasForest = false;
  let forestHintAt = 0;
  const checkRoam = (f: Fix) => {
    const prev = roamFrom;
    roamFrom = f.pos;
    if (provider?.kind !== 'sim' || !net || !prev) return;
    const d = distanceM(prev, f.pos);
    if (d < 0.5 || d > 80) return;
    const forest = net.terrainAt(f.pos) === 'forest';
    if (forest && !wasForest && performance.now() - forestHintAt > 90000) {
      forestHintAt = performance.now();
      app.toast('Unterholz: Hier kommst du nur langsam voran, und es kann dir etwas begegnen.');
    }
    wasForest = forest;
    if (!forest) return;
    roamM += d;
    if (roamM < 25 || roamBusy || overlay) return;
    const meters = roamM;
    roamM = 0;
    roamBusy = true;
    void app.backend
      .dispatch({ type: 'roam', at: f.pos, accuracyM: f.accuracyM, meters, terrain: 'forest' })
      .then((res) => {
        if (destroyed || !res.events.some((e) => e.type === 'wild')) return;
        if (provider instanceof SimulatedLocation) provider.halt();
        gm?.setRoute(null);
        gm?.setTarget(null);
        sheet.close();
        app.toast('Im Unterholz bewegt sich etwas …', 'warn');
        window.setTimeout(() => !destroyed && openFight(), 900);
      })
      .finally(() => (roamBusy = false));
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
      const dt = Math.max(0, Math.min(0.1, (t - last) / 1000));
      last = t;
      if (!j.active || !(provider instanceof SimulatedLocation) || !gm) return;
      const v = j.value;
      const len = Math.hypot(v.x, v.y);
      // Richtung relativ zur gedrehten Karte; Tempo wie beim Antippen (rennen)
      const ang = (gm.bearing * Math.PI) / 180 + Math.atan2(v.x, -v.y);
      const from = provider.position;
      const n = walkNet(from);
      // Im Wald abseits der Wege langsamer; im Ort rutscht die Figur zurück auf die Straße
      const dist = provider.speed * len * dt * (n?.wayCount ? n.speedAt(from) : 1);
      if (!gm.follow) recenter();
      gm.setTarget(null);
      gm.setRoute(null);
      const to = offsetM(from, Math.sin(ang) * dist, Math.cos(ang) * dist);
      provider.moveTo(n?.wayCount ? n.step(from, to) : to);
    };
    joyRaf = requestAnimationFrame(loop);
    renderLocChip();
  };
  // Steuerung oder Grafik in den Einstellungen umgestellt: sofort übernehmen
  let lastControl = app.settings.get().control;
  const offSettings = app.settings.onChange((st) => {
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
    if (provider instanceof SimulatedLocation && !provider.moving) {
      gm.setTarget(null);
      if (routeOff.length) {
        gm.setRoute(null);
        routeOff = [];
      }
    }
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
    // Reststrecke nachziehen, Unterholz prüfen
    if (provider instanceof SimulatedLocation && provider.moving && routeOff.length) gm.setRoute(provider.remaining, routeOff.slice(provider.leg));
    checkRoam(f);
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
      if (end.outcome === 'won' && end.loot) sheet.showLoot(end.spot, end.loot, end.spot.id.startsWith('w:') ? 'Begegnung im Unterholz überstanden.' : end.ambush ? 'Überfall abgewehrt. Mehr war hier nicht mehr zu holen.' : end.kills && end.kills > 1 ? `${end.kills} Gegner erledigt` : `${ENEMIES[end.enemy].name} erledigt`);
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

  // --- Zuhause -------------------------------------------------------------------
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
      app.toast('Dein Zuhause konnte nicht geladen werden. Prüfe die Verbindung.', 'warn');
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
          app.toast('Dein Zuhause steht. Räum erst mal auf, darin steckt Material!', 'good');
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

  const openProgress = () => {
    sheet.close();
    closeOverlay();
    overlay = openProgressPanel(app, overlayHost, closeOverlay, () => renderHud());
  };

  // --- Verstecke -------------------------------------------------------------------
  let lastHeat = '';
  const updateCaches = () => {
    const s = app.backend.current();
    if (!gm || !s) return;
    gm.setCaches(s.caches.map((c) => ({ id: c.id, center: c.center, radiusM: CACHE.areaM })));
    // Das nächste Versteck, in dessen Suchkreis (mit etwas Rand) du stehst
    let best: { c: Cache; d: number } | null = null;
    if (fix) {
      for (const c of s.caches) {
        if (distanceM(fix.pos, c.center) > CACHE.areaM + 30) continue;
        const d = distanceM(fix.pos, c.spot.pos);
        if (!best || d < best.d) best = { c, d };
      }
    }
    if (!best || !fix) {
      cacheChip.hidden = true;
      lastHeat = '';
      return;
    }
    const target = best.c;
    const hot = best.d <= CACHE.digM + Math.min(fix.accuracyM, 20);
    const heat = hot ? 'hot' : best.d <= 35 ? 'warm' : best.d <= 60 ? 'lukewarm' : 'cold';
    const label = { hot: 'Heiß! Hier graben', warm: 'Warm', lukewarm: 'Lauwarm', cold: 'Kalt' }[heat];
    cacheChip.hidden = false;
    cacheChip.dataset.heat = heat;
    clear(cacheChip);
    cacheChip.append(svgEl(icon('chalk', 15)), `Versteck: ${label}`);
    cacheChip.onclick = () => (hot ? void digCache(target) : app.toast('Lauf im Kreis herum. Je wärmer, desto näher.'));
    if (heat !== lastHeat) {
      if (heat === 'hot' && app.settings.get().vibration) {
        try {
          navigator.vibrate?.([40, 60, 40, 60, 120]);
        } catch {
          /* egal */
        }
      }
      lastHeat = heat;
    }
  };

  const digCache = async (c: Cache) => {
    if (!fix) return;
    const res = await app.backend.dispatch({ type: 'openCache', id: c.id, at: fix.pos, accuracyM: fix.accuracyM });
    const ev = res.events[0];
    if (ev.type === 'rejected') {
      app.toast(REJECT_TEXT[ev.reason], 'warn');
      return;
    }
    if (ev.type === 'cacheOpened') {
      sheet.showCacheFind(c, ev);
      renderHud();
      updateSpots();
    }
  };

  const showCacheHint = (id: string) => {
    const c = app.backend.current()?.caches.find((x) => x.id === id);
    if (!c) return;
    sheet.showCache(c);
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
          { class: 'menu-list compact' },
          menuItem('Weiterspielen', null, close, true),
          menuItem('Einstellungen', null, showSettings),
          menuItem('Hauptmenü', 'Dein Spielstand ist gespeichert', () => app.go('menu')),
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
        onCacheTap: (id) => showCacheHint(id),
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
      app.backend.setPlaceFilter(null);
      gm?.destroy();
    },
  };
}
