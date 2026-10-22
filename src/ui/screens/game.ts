// Der Spielbildschirm: Karte, Standort, Fundstellen, HUD und Overlays.

import { FALLBACK_START, IS_PREVIEW, VIEW_RADIUS_M } from '../../config';
import { CACHE, ENEMIES, FOE_TACTICS, GEAR, HINT_NAMES, MAX_HEALTH, PATROL, REGIONS, RESOURCE_ORDER, RESOURCES, SIGHT, SPECIAL, SPECIAL_HINT, SURVIVAL_ORDER, TIER, WILD_SPOT_MIN_M, WORLD_EVENT, WORLD_EVENTS } from '../../core/content';
import { ExploredView, SECTOR_LEVELS, sectorOf } from '../../core/explore';
import { bearingDeg, distanceM, formatDistance, offsetM } from '../../core/geo';
import { rankOf } from '../../core/progress';
import { baseTier, currentHealth, dayNumber, packCount, pendingHarvest, readyAt, readyParts, regionTier, searchRangeM, spotKey } from '../../core/rules';
import type { Cache, FoeKind, LatLon, Opening, RegionId, Spot, WorldEvent } from '../../core/types';
import { classifyRegion, hearRangeM, sightRangeM } from '../../core/terrain';
import { dropSpot, eventCenter } from '../../core/worldEvents';
import { PatrolControl, type LivePatrol } from '../game/patrolControl';
import { currentRegion, setCurrentRegion } from '../game/worldState';
import { reliefAround } from '../../map/elevation';
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
import { seasonOf } from '../../services/settings';
import { openBattle } from '../game/battle';
import { AmbienceController, ambienceEffects, currentAmbience, guardSightM, PHASE_NAMES, WEATHER_NAMES, type Ambience } from '../game/ambience';
import { Particles } from '../game/dust';
import { compassWord, SpotSheet } from '../game/spotSheet';
import { Pointers, type PointerTarget } from '../../map/pointers';
import { goalChip, openProgressPanel } from '../game/progressPanel';
import { icon } from '../icons';
import { settingsPanel } from '../settingsPanel';
import { menuItem } from './menu';
import { LOADING_TIPS, REJECT_TEXT } from '../texts';
import { artStyle, LOADING_ART } from '../art';

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
  // Neuland: wo du kaum warst, ist die Beute besser
  const tierChip = h('button', { class: 'env-chip tier-chip', type: 'button', hidden: true, onclick: () => explainTier() });
  // Kompass: Nadel zeigt nach Norden. Antippen: Karte nach Norden, nochmal: Karte dreht sich mit deiner Blickrichtung
  const needle = h('span', { class: 'compass-needle', 'aria-hidden': 'true' }, h('i', null, 'N'));
  const compassBtn = h('button', { class: 'iconbtn compass', type: 'button', 'aria-label': 'Kompass', onclick: () => toggleCompass() }, needle);
  const envChip = h('button', { class: 'env-chip', type: 'button', onclick: () => app.toast(`${ambienceEffects(currentAmbience())} Gegend: ${REGIONS[currentRegion()].name}. ${REGIONS[currentRegion()].desc}`) });
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
  const packBtn = h('button', { class: 'pack-btn', type: 'button', 'aria-label': 'Charakter und Rucksack', onclick: () => openPack('pack') }, svgEl(icon('backpack', 28)), packBadge);
  let lastLoot = -1;
  const banners = h('div', { class: 'banners' });
  // Kurzer Hinweis unten (Simulation, GPS sucht noch). Gutes GPS zeigt nur ein Punkt am Zentrieren-Knopf.
  const locChip = h('div', { class: 'loc-chip', hidden: true });
  let locHintUntil = 0;
  const locateBtn = h('button', { class: 'iconbtn locate', type: 'button', 'aria-label': 'Auf mich zentrieren', onclick: () => recenter() }, svgEl(icon('locate')));
  const homeBadge = h('span', { class: 'home-badge', hidden: true }, '+');
  const homeBtn = h('button', { class: 'iconbtn home', type: 'button', 'aria-label': 'Dein Zuhause', onclick: () => void openBase() }, svgEl(icon('home')), homeBadge);
  // Laufen per Tippen: schnell über die Straßen oder leise durch Deckung
  const gaitBtn = h('button', { class: 'gait-btn', type: 'button', hidden: true, onclick: () => toggleGait() });
  // Weltereignis in der Nähe (Staubsturm, Horde, Sperrgebiet, Hilfsabwurf)
  const eventChip = h('button', { class: 'env-chip event-chip', type: 'button', hidden: true });
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
        eventChip,
        cacheChip,
        tierChip,
        sectorChip,
        envChip,
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Menü', onclick: () => openPause() }, svgEl(icon('menu', 20))),
      ),
    ),
    compassBtn,
    banners,
    packBtn,
    h('div', { class: 'hud-bottom' }, locChip, homeBtn, gaitBtn, locateBtn),
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
  let zoneTimer = 0;
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

  // Zum Testen: wo steht die Figur gerade? Und: an eine Stelle springen (nur Simulation)
  if (localStorage.getItem('endstation.debug')) {
    const w = window as unknown as { __fix?: () => unknown; __tp?: (lat: number, lon: number) => void };
    w.__fix = () => fix;
    (window as unknown as { __events?: () => unknown }).__events = () => worldEvents.map((e) => ({ ...e, now: eventCenter(e, app.backend.now()) }));
    w.__tp = (lat, lon) => {
      if (provider instanceof SimulatedLocation) provider.moveTo({ lat, lon });
    };
  }

  // Zum Testen: die Karte von außen steuern (Ausschnitt, Neigung)
  if (localStorage.getItem('endstation.debug')) (window as unknown as { __map?: () => unknown }).__map = () => gm?.map;

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
    renderTierChip();
  };

  // Hinweise oben: einer für GPS, einer für die Karte. So verdrängen sie sich nicht.
  const bannerEls: Partial<Record<'gps' | 'map' | 'patrol', HTMLElement>> = {};
  const showBanner = (key: 'gps' | 'map' | 'patrol', title: string, text: string, actions: [string, () => void][]) => {
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
  const hideBanner = (key: 'gps' | 'map' | 'patrol') => {
    bannerEls[key]?.remove();
    delete bannerEls[key];
  };

  // --- Karte & Fundstellen -------------------------------------------------------
  const updateFog = () => {
    if (!gm || !fix) return;
    const p = gm.project(fix.pos);
    // Sicht: klar bis ~150 m, dann Dunst, ab ~500 m fast nur noch Nebel.
    const px = (m: number) => Math.max(m / 2.2, gm!.metersToPixels(m * Math.sqrt(viewBonus), fix!.pos));
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
    // Keine Fundstellen auf Friedhöfen, an Schulen, Krankenhäusern, Gedenkstätten, in Gebäuden oder im Wasser
    const sensitive = gm.sensitiveCheck();
    app.backend.setPlaceFilter((p) => sensitive(p, true));
    app.backend.setSpecialFilter(gm.builtCheck());
    filtersReady = true;
    const list = await app.backend.spotsNear(fix.pos, VIEW_RADIUS_M, gm.poiCandidates());
    if (destroyed || !gm) return;
    // Hilfsabwürfe: eine Kiste, solange das Ereignis läuft
    const now = app.backend.now();
    const drops = worldEvents.filter((e) => e.kind === 'drop' && now >= e.from && now < e.until).map(dropSpot);
    for (const d of drops) if (distanceM(fix.pos, d.pos) <= VIEW_RADIUS_M) list.push(d);
    // Besondere Orte weiter weg: für die Hinweise am Horizont
    specials = [...app.backend.specialsNear(fix.pos, SPECIAL.hintM), ...drops];
    // Pilzstellen nur im Wald, Hochsitze und Jagdhütten nur weit draußen
    const forest = gm.forestCheck();
    const nearTown = gm.builtCheck(WILD_SPOT_MIN_M);
    spots = new Map(list.filter((s) => !sensitive(s.pos, s.source === 'grid') && (s.biome !== 'forest' || forest(s.pos)) && (s.biome !== 'wild' || !nearTown(s.pos))).map((s) => [s.id, s]));
    updateSpots();
  };

  /** So weit sieht man gerade Kleines auf der Karte (Tageszeit, Wetter, Staub, Gegend, Aussicht). */
  const sightM = () => {
    const a = currentAmbience();
    const dust = patrols?.conditions().dust ?? false;
    return SIGHT.baseM * REGIONS[currentRegion()].view * viewBonus * (a.phase === 'night' ? SIGHT.nightFactor : 1) * (a.weather === 'fog' || dust ? SIGHT.fogFactor : 1);
  };

  const updateSpots = () => {
    const s = app.backend.current();
    if (!gm || !s) return;
    const now = app.backend.now();
    const range = searchRangeM(s);
    const sight = sightM();
    const views: SpotView[] = [];
    for (const spot of spots.values()) {
      const wait = readyAt(s, spot) - now;
      const d = fix ? distanceM(fix.pos, spot.pos) : Infinity;
      // Kleines (Pilze, Rucksack, Fass …) taucht erst auf, wenn man nah genug ist
      const small = SIGHT.smallKinds.includes(spot.kind);
      if (small && d > Math.max(sight, range)) continue;
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
      const unknown = spot.source === 'special' && !s.discovered[spot.id] && st !== 'inrange' ? SPECIAL_HINT[spot.kind] : undefined;
      views.push({ spot, state: st, guard, cart: !!cart, fresh: !seenSet(s).has(spotKey(spot.id)), unknown, pop: small });
    }
    gm.setSpots(views);
    updatePointers();
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

  // --- Erkunden: Hinweise am Horizont, Pfeile zu Verstecken, Neuland, Kompass ---------
  let specials: Spot[] = [];
  let pointers: Pointers | null = null;
  const notifiedSpecials = new Set<string>();
  const updatePointers = () => {
    const s = app.backend.current();
    if (!pointers || !s || !fix) return;
    const here = fix.pos;
    const targets: PointerTarget[] = [];
    // Die drei nächsten unbekannten besonderen Orte (liegen sie im Bild, zeigt die Karte das Fragezeichen selbst)
    const range = searchRangeM(s);
    const hidden = specials
      .filter((sp) => !s.discovered[sp.id])
      .map((sp) => ({ sp, d: distanceM(here, sp.pos) }))
      .filter((x) => x.d > range && x.d <= SPECIAL.hintM)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    for (const { sp, d } of hidden) {
      const hint = SPECIAL_HINT[sp.kind] ?? 'smoke';
      targets.push({
        id: sp.id,
        pos: sp.pos,
        icon: hint,
        label: HINT_NAMES[hint],
        hideInside: d <= VIEW_RADIUS_M,
        onTap: () => {
          app.toast(`${HINT_NAMES[hint]}: ${formatDistance(d)} Richtung ${compassWord(bearingDeg(here, sp.pos))}. Was es ist, siehst du erst vor Ort.`);
          // Im Testmodus gleich hinlaufen
          if (provider?.kind === 'sim' && !joy) walkTo(sp.pos);
        },
      });
    }
    // Verstecke, deren Suchkreis noch nicht im Bild ist
    for (const c of s.caches) {
      if (distanceM(here, c.center) <= (c.areaM ?? CACHE.areaM) + 25) continue;
      targets.push({ id: c.id, pos: c.center, icon: c.via === 'tracks' ? 'steps' : c.via === 'radio' ? 'radioSet' : 'chalk', label: 'Versteck', tone: 'cache', hideInside: true, onTap: () => sheet.showCache(c) });
    }
    pointers.set(targets);
    pointers.setPlayer(here);
    // Erstes Mal in der Nähe eines unbekannten Ortes: kurzer Hinweis
    for (const sp of specials) {
      if (s.discovered[sp.id] || notifiedSpecials.has(sp.id) || distanceM(here, sp.pos) > SPECIAL.nearM) continue;
      notifiedSpecials.add(sp.id);
      const hint = SPECIAL_HINT[sp.kind] ?? 'smoke';
      app.toast(`${HINT_NAMES[hint]}, ganz nah. Sieh nach, was dort ist!`, 'good');
    }
  };

  const renderTierChip = () => {
    const s = app.backend.current();
    if (!s || !fix) return;
    const t = regionTier(s, fix.pos);
    tierChip.hidden = t === 0;
    if (t === 0) return;
    clear(tierChip);
    tierChip.dataset.tier = String(t);
    tierChip.setAttribute('aria-label', `${TIER.names[t]}: bessere Beute`);
    tierChip.append(svgEl(icon('sparkle', 15)), TIER.names[t]);
  };
  const explainTier = () => {
    const s = app.backend.current();
    if (!s || !fix) return;
    const t = regionTier(s, fix.pos);
    app.toast(
      t === 2
        ? `Fernes Land: Weit und breit warst du noch nie. Hier ist die Beute ${Math.round((TIER.lootFactor[2] - 1) * 100)} % besser, und du findest öfter Seltenes.`
        : `Neuland: Diese Gegend kennst du noch kaum. Die Beute ist ${Math.round((TIER.lootFactor[1] - 1) * 100)} % besser, und du findest öfter Seltenes. Je weiter weg von deinen gewohnten Wegen, desto mehr.`,
    );
  };

  // Kompass: north = Karte nach Norden; heading = Karte dreht sich mit dem Handy
  let compassMode: 'north' | 'heading' = 'north';
  let headingOff: (() => void) | null = null;
  const renderNeedle = () => {
    if (!gm) return;
    needle.style.transform = `rotate(${-gm.bearing}deg)`;
    compassBtn.dataset.mode = compassMode;
    compassBtn.setAttribute('aria-label', compassMode === 'heading' ? 'Kompass: Karte dreht mit. Antippen: Norden oben' : 'Kompass: Norden. Antippen: Karte dreht mit deiner Blickrichtung');
  };
  const stopHeading = () => {
    headingOff?.();
    headingOff = null;
  };
  const toggleCompass = async () => {
    if (!gm) return;
    if (compassMode === 'heading' || Math.abs(gm.bearing) > 1) {
      compassMode = 'north';
      stopHeading();
      gm.map.easeTo({ bearing: 0, duration: 500 });
      renderNeedle();
      return;
    }
    // Blickrichtung vom Handy (Android: absolute Ausrichtung; iPhone: braucht eine Erlaubnis)
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try {
      if (DOE?.requestPermission && (await DOE.requestPermission()) !== 'granted') throw new Error('nein');
    } catch {
      app.toast('Ohne Zugriff auf den Kompass bleibt Norden oben.');
      return;
    }
    let got = false;
    let last = 0;
    const onOri = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const heading = e.webkitCompassHeading ?? (e.absolute && e.alpha !== null ? 360 - e.alpha : null);
      if (heading === null || heading === undefined || !gm) return;
      got = true;
      const t = performance.now();
      if (t - last < 120) return;
      last = t;
      gm.map.easeTo({ bearing: heading, duration: 150 });
    };
    const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, onOri as EventListener);
    headingOff = () => window.removeEventListener(evName, onOri as EventListener);
    compassMode = 'heading';
    renderNeedle();
    window.setTimeout(() => {
      if (!got && compassMode === 'heading') {
        compassMode = 'north';
        stopHeading();
        renderNeedle();
        app.toast('Dieses Gerät liefert keinen Kompass. Norden bleibt oben, die Nadel zeigt ihn.');
      }
    }, 2500);
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
  let netZones = '';
  /** Neue Kartendaten sind da: Wegenetz beim nächsten Mal neu bauen. */
  let netDirty = false;
  let routeOff: boolean[] = [];
  let snapHintAt = -Infinity;
  /** Wegenetz rund um p, bei Bedarf neu aus den geladenen Kartendaten gebaut. */
  const walkNet = (p: LatLon, needM = 0): WalkNet | null => {
    if (!gm) return null;
    const now = performance.now();
    const stale = !net || netZones !== zoneSig || netDirty || distanceM(net.center, p) + needM > 450 || (!net.wayCount && now - netAt > 3000);
    if (stale) {
      try {
        const s = app.backend.current();
        const t = app.backend.now();
        const noGo = worldEvents.filter((e) => e.kind === 'quarantine' && t >= e.from && t < e.until).map((e) => ({ center: eventCenter(e, t), radiusM: e.radiusM }));
        netZones = zoneSig;
        netDirty = false;
        net = new WalkNet(gm.walkInput(p, Math.max(700, needM + 300), { noGo, season: seasonOf(app.settings.get()), wade: !!s && Object.values(s.gear.worn).some((g) => g && GEAR[g].wade) }));
        netAt = now;
      } catch {
        net = null;
      }
    }
    return net;
  };

  // Wegenetz für die Trupps: Mitte an einem festen Raster (~550 m), damit alle Spieler
  // in der Gegend dieselben Strecken berechnen. Nur neu, wenn man in ein anderes Feld kommt.
  let pNet: { key: string; net: WalkNet; at: number } | null = null;
  const patrolNet = (p: LatLon): WalkNet | null => {
    if (!gm) return null;
    const gy = Math.round(p.lat / 0.005);
    const gx = Math.round(p.lon / 0.008);
    const key = `${gy}:${gx}`;
    const now = performance.now();
    if (!pNet || pNet.key !== key || (!pNet.net.wayCount && now - pNet.at > 3000)) {
      try {
        pNet = { key, net: new WalkNet(gm.walkInput({ lat: gy * 0.005, lon: gx * 0.008 }, 1100, {}, { patrol: true })), at: now };
      } catch {
        return null;
      }
    }
    return pNet.net;
  };

  const walkTo = (p: LatLon) => {
    if (!(provider instanceof SimulatedLocation)) return;
    const from = provider.position;
    const n = walkNet(from, distanceM(from, p));
    const gait = app.settings.get().gait;
    const r = n?.wayCount ? n.route(from, p, gait) : null;
    if (r) {
      // Leise gehen ist etwas langsamer
      provider.walkPath(r.path, gait === 'quiet' ? r.speeds.map((v) => v * 0.8) : r.speeds);
      routeOff = r.offroad;
      gm?.setRoute(r.path, r.offroad);
      gm?.setTarget(r.end);
      if (r.snapped && performance.now() - snapHintAt > 30000) {
        snapHintAt = performance.now();
        app.toast('Dort kommst du nicht hin (Haus, Wasser oder Sperrgebiet). Du läufst so nah wie möglich heran.');
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
  let forestHintAt = -Infinity;
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

  // --- Gegend, Weltereignisse, Trupps ---------------------------------------------------
  let worldEvents: WorldEvent[] = [];
  let filtersReady = false;
  /** Nur im Testmodus: von Hand ausgelöste Ereignisse (nur Anzeige, die Regeln kennen sie nicht). */
  let testEvents: WorldEvent[] = [];
  let zoneSig = '';
  let dropSig = '';
  /** Von oben (Hügel) siehst du weiter. */
  let viewBonus = 1;
  let patrols: PatrolControl | null = null;
  let regionAt: LatLon | null = null;
  let regionKnown = false;
  let eventsAt: LatLon | null = null;
  let eventsTime = 0;
  const newsSeen = new Set<string>();
  let hiddenHintShown = false;

  /** Art der Gegend aus den Kartendaten (alle 150 m neu), dazu die Höhe für die Aussicht. */
  let regionRetryAt = 0;
  const updateRegion = (f: Fix) => {
    if (!gm || (regionAt && distanceM(regionAt, f.pos) < 150)) return;
    if (!regionAt && performance.now() < regionRetryAt) return;
    regionAt = f.pos;
    const stats = gm.regionStats(f.pos, 600);
    // Nichts erkannt (Daten fehlen noch, oder freies Land): in 10 Sekunden nochmal
    if (stats.houses + stats.forest + stats.farm + stats.water === 0) {
      regionAt = null;
      regionRetryAt = performance.now() + 10_000;
    }
    const apply = (relief: { relief: number; above: number } | null) => {
      if (destroyed) return;
      stats.relief = relief?.relief ?? null;
      const r: RegionId = classifyRegion(stats);
      const before = currentRegion();
      setCurrentRegion(r);
      if (regionAt && (!regionKnown || r !== before)) {
        regionKnown = true;
        app.toast(`Gegend: ${REGIONS[r].name}. ${REGIONS[r].desc}`);
      }
      const nb = relief && relief.above >= 25 ? 1.6 : 1;
      if (nb > viewBonus) app.toast('Aussicht: Von hier oben siehst du weiter, auch Trupps schon von Weitem.', 'good');
      viewBonus = nb;
      updateFog();
    };
    if (mapMode === 'real') void reliefAround(f.pos, 600).then(apply);
    else apply(null);
  };

  const remaining = (e: WorldEvent) => {
    const m = Math.max(1, Math.round((e.until - app.backend.now()) / 60_000));
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h` : `${m} min`;
  };

  /** Weltereignisse in der Gegend: neu einlesen, Funkmeldung bei neuen, Zonen zeichnen. */
  const refreshEvents = (f: Fix, force = false) => {
    // Erst wenn die Karte weiß, wo heikle Orte sind (sonst läge ein Abwurf vielleicht auf einem Friedhof)
    if (!filtersReady) return;
    const t = performance.now();
    if (!force && eventsAt && distanceM(eventsAt, f.pos) < 150 && t - eventsTime < 30_000) return;
    eventsAt = f.pos;
    eventsTime = t;
    const now = app.backend.now();
    testEvents = testEvents.filter((e) => e.until > now);
    worldEvents = [...app.backend.eventsNear(f.pos, WORLD_EVENT.newsM, 30 * 60_000), ...testEvents];
    for (const e of worldEvents) {
      if (newsSeen.has(e.id) || now < e.from || now >= e.until) continue;
      newsSeen.add(e.id);
      const c = eventCenter(e, now);
      const d = distanceM(f.pos, c);
      const where = e.radiusM && d <= e.radiusM ? 'genau hier' : `${formatDistance(d)} Richtung ${compassWord(bearingDeg(f.pos, c))}`;
      app.toast(`Funk: ${WORLD_EVENTS[e.kind].name}, ${where}. Noch ${remaining(e)}. Antippen oben für mehr.`, e.kind === 'drop' ? 'good' : 'warn');
    }
    const drops = worldEvents.filter((e) => e.kind === 'drop' && now >= e.from && now < e.until).map((e) => e.id).join('|');
    if (drops !== dropSig) {
      dropSig = drops;
      void refreshSpots(true);
    }
    updateZones();
  };

  const updateZones = () => {
    if (!gm) return;
    const now = app.backend.now();
    const active = worldEvents.filter((e) => now >= e.from && now < e.until);
    gm.setZones(active.map((e) => ({ id: e.id, kind: e.kind, center: eventCenter(e, now), radiusM: e.radiusM })));
    zoneSig = active
      .filter((e) => e.kind === 'quarantine')
      .map((e) => e.id)
      .join('|');
    // Im Staubsturm: braune Luft
    el.classList.toggle('in-dust', !!fix && active.some((e) => e.kind === 'dust' && distanceM(fix!.pos, eventCenter(e, now)) <= e.radiusM));
    renderEventChip(active);
  };

  const EVENT_ICON = { dust: 'dust', horde: 'patrol', quarantine: 'barrier', drop: 'airdrop' } as const;
  const renderEventChip = (active: WorldEvent[]) => {
    if (!fix) return;
    const here = fix.pos;
    const now = app.backend.now();
    const best = active.map((e) => ({ e, d: Math.max(0, distanceM(here, eventCenter(e, now)) - e.radiusM) })).sort((a, b) => a.d - b.d)[0];
    eventChip.hidden = !best;
    if (!best) return;
    const { e, d } = best;
    const def = WORLD_EVENTS[e.kind];
    const inside = d === 0 && e.radiusM > 0;
    clear(eventChip);
    eventChip.dataset.kind = e.kind;
    eventChip.dataset.inside = String(inside);
    eventChip.append(svgEl(icon(EVENT_ICON[e.kind], 15)), inside ? def.name : `${def.name} · ${formatDistance(d)}`);
    eventChip.setAttribute('aria-label', `${def.name}${inside ? ', du bist mittendrin' : `, ${formatDistance(d)} entfernt`}. Antippen für mehr`);
    eventChip.onclick = () =>
      app.toast(`${def.name}${inside ? ' (du bist mittendrin)' : ` (${formatDistance(d)} Richtung ${compassWord(bearingDeg(here, eventCenter(e, now)))})`}: ${def.desc} Noch ${remaining(e)}.`);
  };

  const patrolLabel = (group: FoeKind[]) => {
    const n = new Map<string, number>();
    for (const k of group) n.set(FOE_TACTICS[k].name, (n.get(FOE_TACTICS[k].name) ?? 0) + 1);
    return [...n].map(([name, c]) => `${c} ${name}`).join(', ');
  };

  const startPatrolFight = async (id: string, opening: Opening) => {
    const f = fix;
    if (!f) return;
    if (id.includes(':test')) {
      hideBanner('patrol');
      patrols?.release(id);
      app.toast('Testereignis: nur Anzeige, diese Gegner kämpfen nicht.');
      return;
    }
    const res = await app.backend.dispatch({ type: 'patrolFight', patrol: id, at: f.pos, accuracyM: f.accuracyM, opening, region: currentRegion() });
    const ev = res.events[0];
    hideBanner('patrol');
    if (ev.type === 'rejected') {
      patrols?.release(id);
      if (ev.reason !== 'nothing') app.toast(REJECT_TEXT[ev.reason], 'warn');
      return;
    }
    if (provider instanceof SimulatedLocation) provider.halt();
    gm?.setRoute(null);
    gm?.setTarget(null);
    openFight();
  };

  const vibrateWarn = () => {
    if (!app.settings.get().vibration) return;
    try {
      navigator.vibrate?.([120, 80, 120]);
    } catch {
      /* egal */
    }
  };

  /** Ein Trupp hat dich entdeckt. Beim Laufen per Tippen geht es gleich los, mit GPS erst, wenn du stehst und kämpfen willst. */
  const onSpotted = (p: LivePatrol) => {
    vibrateWarn();
    if (provider?.kind === 'sim') {
      if (provider instanceof SimulatedLocation) provider.halt();
      gm?.setRoute(null);
      gm?.setTarget(null);
      sheet.close();
      app.toast('Entdeckt! Der Trupp kommt auf dich zu.', 'warn');
      window.setTimeout(() => !destroyed && !overlay && void startPatrolFight(p.plan.id, 'spotted'), 800);
      return;
    }
    showBanner(
      'patrol',
      'Entdeckt!',
      `${p.plan.horde ? 'Ein Teil der Horde' : 'Ein Trupp'} (${patrolLabel(p.plan.group)}) hat dich gesehen und kommt auf dich zu. Bleib stehen und kämpfe, oder geh weg, bis du ${PATROL.escapeM} m Abstand hast.`,
      [
        [
          'Kämpfen',
          () => {
            if (!standing()) app.toast('Bleib erst stehen. Gekämpft wird nur im Stehen.', 'warn');
            else void startPatrolFight(p.plan.id, 'spotted');
          },
        ],
      ],
    );
  };

  /** Mit GPS: Stehst du gerade (seit ein paar Sekunden)? Gekämpft wird nur im Stehen. */
  const standing = () => provider?.kind === 'sim' || performance.now() - gpsMovedAt > 4000;

  /** Kampf beginnen: beim Laufen per Tippen sofort, mit GPS nur im Stehen und nach Bestätigung. */
  const confirmPatrolFight = (id: string, opening: Opening) => {
    if (provider?.kind === 'sim') {
      if (opening === 'surprise') app.toast('Überraschungsangriff!', 'good');
      void startPatrolFight(id, opening);
      return;
    }
    if (!standing()) {
      app.toast('Bleib erst stehen. Gekämpft wird nur im Stehen.', 'warn');
      return;
    }
    const p = patrols?.get(id);
    if (!p) return;
    showBanner(
      'patrol',
      opening === 'surprise' ? 'Überraschungsangriff?' : 'Kämpfen?',
      `${p.plan.horde ? 'Teil der Horde' : 'Trupp'}: ${patrolLabel(p.plan.group)}, ${formatDistance(p.distM)} entfernt.${opening === 'surprise' ? ' Er hat dich noch nicht bemerkt: Die Gegner setzen die erste Runde aus.' : ''} Bleib stehen, solange der Kampf läuft.`,
      [
        [
          opening === 'surprise' ? 'Angreifen' : 'Kämpfen',
          () => {
            const q = patrols?.get(id);
            if (!standing()) app.toast('Bleib erst stehen. Gekämpft wird nur im Stehen.', 'warn');
            else if (opening === 'surprise' && q && (q.awareness >= 0.5 || q.distM > PATROL.surpriseM)) {
              hideBanner('patrol');
              app.toast('Zu spät, er hat dich bemerkt oder ist zu weit weg.', 'warn');
            } else void startPatrolFight(id, opening);
          },
        ],
        ['Lieber nicht', () => hideBanner('patrol')],
      ],
    );
  };

  const onPatrolTap = (id: string) => {
    const p = patrols?.get(id);
    if (!p || !fix || !patrols) return;
    const names = patrolLabel(p.plan.group);
    if (p.spotted) {
      if (p.distM <= PATROL.fightM) confirmPatrolFight(id, 'spotted');
      else app.toast(`Der Trupp (${names}) hat dich entdeckt und folgt dir. Kämpfen oder Abstand gewinnen (${PATROL.escapeM} m).`, 'warn');
      return;
    }
    if (p.distM <= PATROL.surpriseM && p.awareness < 0.5) {
      confirmPatrolFight(id, 'surprise');
      return;
    }
    // Lässt er dich gerade in Ruhe (blendet eben aus)? Dann sag warum
    const why = patrols.calmReason;
    if (why) {
      app.toast(
        `${p.plan.horde ? 'Horde' : 'Trupp'}: ${names}. Gerade lässt er dich in Ruhe: ${
          why === 'home' ? `rund um dein Zuhause (${PATROL.homeSafeM} m) bist du sicher` : why === 'tired' ? 'du bist erschöpft, ruh dich erst aus' : 'du hattest eben erst einen Kampf, ein paar Minuten ist Ruhe'
        }.`,
      );
      return;
    }
    const cond = patrols.conditions();
    const exp = patrols.exposure();
    const sight = Math.round(sightRangeM(p.plan.group, cond, exp));
    const hear = Math.round(hearRangeM(p.plan.group, cond, exp));
    app.toast(
      `${p.plan.horde ? 'Horde' : 'Trupp'}: ${names}, ${formatDistance(p.distM)} entfernt. Im Blickfeld sieht er dich auf etwa ${sight} m (nicht durch Häuser), hören tut er dich auf ${hear} m. Schleich dich von hinten an (näher als ${PATROL.surpriseM} m) und tipp ihn an: Überraschungsangriff, die Gegner setzen die erste Runde aus.`,
    );
  };

  const onHidden = (on: boolean) => {
    gm?.setHidden(on);
    if (on && !hiddenHintShown) {
      hiddenHintShown = true;
      app.toast('Versteckt: Still in Deckung sehen dich die Trupps kaum.', 'good');
    }
  };

  // Gangart beim Laufen per Tippen
  const renderGait = () => {
    const sim = provider?.kind === 'sim' && !joy;
    gaitBtn.hidden = !sim;
    if (!sim) return;
    const g = app.settings.get().gait;
    clear(gaitBtn);
    gaitBtn.dataset.gait = g;
    gaitBtn.append(svgEl(icon(g === 'quiet' ? 'quiet' : 'fast', 18)), h('span', null, g === 'quiet' ? 'Leise' : 'Schnell'));
    gaitBtn.setAttribute('aria-label', g === 'quiet' ? 'Gangart: leise durch Deckung. Antippen für schnell' : 'Gangart: schnell über die Straßen. Antippen für leise');
  };
  const toggleGait = () => {
    const g = app.settings.get().gait === 'quiet' ? 'fast' : 'quiet';
    app.settings.set({ gait: g });
    renderGait();
    app.toast(
      g === 'quiet'
        ? 'Leise: Du gehst durch Deckung (Wald, Gärten, Hecken, im Sommer das Korn) und etwas langsamer. Trupps sehen und hören dich später.'
        : 'Schnell: Du nimmst den schnellsten Weg, meist über die Straßen. Dort sieht man dich aber.',
    );
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
    if (!(provider instanceof SimulatedLocation) || app.settings.get().control !== 'joystick') {
      renderGait();
      return renderLocChip();
    }
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
    renderGait();
    renderLocChip();
  };
  // Steuerung oder Grafik in den Einstellungen umgestellt: sofort übernehmen
  let lastControl = app.settings.get().control;
  const offSettings = app.settings.onChange((st) => {
    gm?.setWaterMotion(st.waterMotion);
    void gm?.setSeason(seasonOf(st));
    if (st.control === lastControl) return;
    lastControl = st.control;
    if (provider) setupJoystick();
  });

  // --- Standort ------------------------------------------------------------------
  let heavyAt = 0;
  // Mit GPS: wann zuletzt ein Stück gegangen (für „Kampf nur im Stehen“)
  let gpsMovePos: LatLon | null = null;
  let gpsMovedAt = 0;
  let heavyTimer = 0;
  const onFix = (f: Fix) => {
    const first = !fix;
    fix = f;
    if (!f.simulated && (!gpsMovePos || distanceM(gpsMovePos, f.pos) > 6)) {
      gpsMovePos = f.pos;
      gpsMovedAt = performance.now();
    }
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
    updateRegion(f);
    refreshEvents(f);
    void explore(f);
    if (first) renderSectorChip();
    renderTierChip();
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
      hideBanner('patrol');
      const pid = end.spot.id.startsWith('w:t:') ? end.spot.id.slice(2) : null;
      if (pid) patrols?.release(pid);
      if (end.outcome === 'won' && end.loot)
        sheet.showLoot(
          end.spot,
          end.loot,
          pid
            ? `${pid.startsWith('t:h:') ? 'Teil der Horde' : 'Trupp'} besiegt. Das hatten sie dabei.`
            : end.spot.id.startsWith('w:test')
              ? 'Testkampf gewonnen.'
              : end.spot.id.startsWith('w:')
                ? 'Begegnung im Unterholz überstanden.'
                : end.ambush
                  ? 'Überfall abgewehrt. Mehr war hier nicht mehr zu holen.'
                  : end.kills && end.kills > 1
                    ? `${end.kills} Gegner erledigt`
                    : `${ENEMIES[end.enemy].name} erledigt`,
        );
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
    const st = app.backend.current();
    gm?.setBase(place?.pos ?? null, st ? baseTier(st) : 0);
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
    gm.setCaches(s.caches.map((c) => ({ id: c.id, center: c.center, radiusM: c.areaM ?? CACHE.areaM, trail: c.trail })));
    // Das nächste Versteck, in dessen Suchkreis (mit etwas Rand) du stehst
    let best: { c: Cache; d: number } | null = null;
    if (fix) {
      for (const c of s.caches) {
        if (distanceM(fix.pos, c.center) > (c.areaM ?? CACHE.areaM) + 30) continue;
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
          provider?.kind === 'sim' ? menuItem('Test: Angriff', 'Nur im Testmodus: Kampf gegen Gegner nach Wahl', showTestFight) : null,
          provider?.kind === 'sim' ? menuItem('Test: Ereignis', 'Nur im Testmodus: Staubsturm, Horde, Sperrgebiet oder Hilfsabwurf gleich nebenan', showTestEvent) : null,
          menuItem('Hauptmenü', 'Dein Spielstand ist gespeichert', () => app.go('menu')),
        ),
      );
    };
    // Testmodus: einen Angriff auslösen, egal wo und wann
    const showTestFight = () => {
      clear(body);
      const groups: [string, FoeKind[]][] = [
        ['Bleicher Wächter', ['watcher']],
        ['Wandler', ['walker']],
        ['Kriecher', ['crawler', 'crawler']],
        ['Borkenmann', ['brute']],
        ['Wandler mit Heuler', ['walker', 'walker', 'screamer']],
        ['Alles auf einmal', ['watcher', 'brute', 'screamer']],
      ];
      body.append(
        h('button', { class: 'btn ghost small back-link', type: 'button', onclick: showMain }, svgEl(icon('back', 16)), 'Zurück'),
        h(
          'ol',
          { class: 'menu-list compact' },
          groups.map(([label, group]) =>
            menuItem(label, null, async () => {
              const at = fix?.pos ?? (provider instanceof SimulatedLocation ? provider.position : null);
              if (!at) return;
              const res = await app.backend.dispatch({ type: 'testFight', at, group });
              if (res.events.some((e) => e.type === 'wild')) {
                closeOverlay();
                openFight();
              }
            }),
          ),
        ),
      );
    };
    // Testmodus: ein Weltereignis gleich nebenan (nur Anzeige)
    const showTestEvent = () => {
      clear(body);
      const kinds: WorldEvent['kind'][] = ['dust', 'horde', 'quarantine', 'drop'];
      body.append(
        h('button', { class: 'btn ghost small back-link', type: 'button', onclick: showMain }, svgEl(icon('back', 16)), 'Zurück'),
        h(
          'ol',
          { class: 'menu-list compact' },
          kinds.map((k) =>
            menuItem(WORLD_EVENTS[k].name, k === 'drop' ? 'Nur Anzeige: die Kiste lässt sich nicht öffnen' : 'Nur Anzeige: die Regeln kennen es nicht', () => {
              if (!fix) return;
              const now = app.backend.now();
              const r = (WORLD_EVENTS[k].radiusM[0] + WORLD_EVENTS[k].radiusM[1]) / 2;
              const center = offsetM(fix.pos, 0, k === 'drop' ? 60 : r * 0.6);
              testEvents.push({ id: `x:test:${testEvents.length + 1}`, kind: k, center, radiusM: k === 'drop' ? 0 : r, from: now, until: now + 20 * 60_000 });
              closeOverlay();
              refreshEvents(fix, true);
            }),
          ),
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

      // Ladebildschirm, bis die Karte das erste Mal fertig gezeichnet ist
      const loadArt = LOADING_ART[Math.floor(Math.random() * LOADING_ART.length)];
      const loadingEl = h(
        'div',
        { class: 'loading-screen has-art', style: artStyle(loadArt), 'aria-live': 'polite' },
        h('div', { class: 'loading-box' }, h('b', null, 'Die Karte lädt …'), h('p', null, LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)])),
      );
      el.append(loadingEl);
      const shownAt = performance.now();
      let loadingDone = false;
      const hideLoading = () => {
        if (loadingDone) return;
        loadingDone = true;
        window.setTimeout(() => {
          loadingEl.classList.add('gone');
          window.setTimeout(() => loadingEl.remove(), 600);
        }, Math.max(0, 1400 - (performance.now() - shownAt)));
      };
      window.setTimeout(hideLoading, 9000);

      const start = mapMode === 'demo' ? DEMO.start : (initial.lastPos ?? FALLBACK_START);
      gm = new GameMap(mapEl, {
        mode: mapMode,
        start,
        waterMotion: app.settings.get().waterMotion,
        season: seasonOf(app.settings.get()),
        onTap: (p) => {
          sheet.close();
          if (provider?.kind === 'sim' && !joy) walkTo(p);
        },
        onSpotTap: (id) => sheet.open(id),
        onBaseTap: () => void openBase(),
        onCacheTap: (id) => showCacheHint(id),
        onPatrolTap: (id) => onPatrolTap(id),
        onFollowChange: (f) => locateBtn.classList.toggle('lost', !f),
        onCameraMove: updateFog,
        onDataChanged: () => {
          if (mapMode === 'real') {
            netDirty = true;
            void refreshSpots(true);
          }
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
        gm.map.once('idle', hideLoading);
      } catch (err) {
        hideLoading();
        console.error(err);
        showBanner('map', 'Karte konnte nicht starten', 'Dein Browser unterstützt vermutlich kein WebGL.', []);
        return;
      }
      if (destroyed) return;
      gm.fog?.setExplored(app.backend.current()?.explored ?? {});
      refreshBaseMarker();
      pointers = new Pointers(gm.map);
      el.insertBefore(pointers.host, hud);
      gm.map.on('rotate', renderNeedle);
      renderNeedle();
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

      patrols = new PatrolControl({
        app,
        map: () => gm,
        fix: () => fix,
        isSim: () => provider?.kind === 'sim',
        net: (p) => walkNet(p),
        patrolNet: (p) => patrolNet(p),
        sneaking: () => app.settings.get().gait === 'quiet',
        season: () => seasonOf(app.settings.get()),
        region: () => currentRegion(),
        events: () => worldEvents,
        home: () => getBasePlace()?.pos ?? null,
        busy: () => !!overlay,
        viewBonus: () => viewBonus,
        snowy: () => {
          const st = app.settings.get();
          const a = currentAmbience();
          return a.weather === 'snow' || currentRegion() === 'snow' || (seasonOf(st) === 'winter' && (st.testSeason === 'winter' || (a.tempC !== null && a.tempC <= 1)));
        },
        onSpotted,
        onTrack: () => app.toast('Ein Trupp hat deine Spur im Schnee gefunden und folgt ihr!', 'warn'),
        onLost: (_p, quiet) => {
          if (patrols?.chased) return;
          hideBanner('patrol');
          if (!quiet) app.toast('Abgehängt. Der Trupp hat aufgegeben.', 'good');
        },
        onHidden,
      });
      // Der Staubsturm zieht weiter: Zonen regelmäßig nachziehen
      zoneTimer = window.setInterval(() => !document.hidden && updateZones(), 5000);

      ticker = window.setInterval(() => {
        renderHud();
        // Ist eine Fundstelle weitergewandert? Dann die Gegend neu einlesen.
        const now = app.backend.now();
        if ([...spots.values()].some((sp) => (app.backend.spotUntil(sp) ?? Infinity) <= now)) void refreshSpots(true);
        else updateSpots();
        if (fix) refreshEvents(fix);
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
      stopHeading();
      pointers?.destroy();
      offSettings();
      clearInterval(ticker);
      clearInterval(zoneTimer);
      patrols?.destroy();
      document.removeEventListener('visibilitychange', onVisible);
      provider?.stop();
      app.backend.setPlaceFilter(null);
      app.backend.setSpecialFilter(null);
      gm?.destroy();
    },
  };
}
