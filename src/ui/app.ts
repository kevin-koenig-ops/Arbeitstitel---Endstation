// App-Rahmen: hält Backend und Einstellungen, wechselt zwischen Bildschirmen, zeigt Hinweise.

import { WORLD_SEED } from '../config';
import { GuestAuth } from '../services/auth';
import { LocalBackend, type GameBackend } from '../services/backend';
import { SettingsStore } from '../services/settings';
import { setGraphicsStyle } from '../base/gfxStyle';
import { h, reducedMotion } from './dom';
import { characterScreen } from './screens/character';
import { gameScreen } from './screens/game';
import { introScreen } from './screens/intro';
import { menuScreen } from './screens/menu';
import { settingsScreen } from './screens/settingsScreen';
import { splashScreen } from './screens/splash';

export interface Screen {
  el: HTMLElement;
  mount?: () => void | Promise<void>;
  destroy?: () => void;
}

export type ScreenName = 'splash' | 'menu' | 'character' | 'intro' | 'game' | 'settings';

export interface App {
  backend: GameBackend;
  settings: SettingsStore;
  go(name: ScreenName): void;
  toast(msg: string, kind?: 'info' | 'good' | 'warn'): void;
}

const SCREENS: Record<ScreenName, (app: App) => Screen> = {
  splash: splashScreen,
  menu: menuScreen,
  character: characterScreen,
  intro: introScreen,
  game: gameScreen,
  settings: settingsScreen,
};

export async function createApp(root: HTMLElement) {
  const stage = h('div', { class: 'stage' });
  const toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  // Das Spiel läuft im Querformat. Hochkant gibt es einen Hinweis zum Drehen.
  const rotate = h(
    'div',
    { class: 'rotate-hint', role: 'alert' },
    h('div', { class: 'rotate-phone', 'aria-hidden': 'true' }),
    h('p', null, 'Bitte dreh dein Handy ins Querformat.'),
    h('small', null, 'Endstation spielt sich quer, wie ein richtiges Spiel.'),
  );
  root.append(stage, toasts, rotate);
  installGrain(root);

  let current: Screen | null = null;

  const settings = new SettingsStore();
  // Grafikstil gilt sofort für alle 3D-Ansichten
  const applyGfx = () => {
    setGraphicsStyle(settings.get().graphics);
    root.dataset.gfx = settings.get().graphics;
  };
  applyGfx();
  settings.onChange(applyGfx);

  const app: App = {
    backend: new LocalBackend(new GuestAuth(), WORLD_SEED),
    settings,
    go(name) {
      const prev = current;
      const next = SCREENS[name](app);
      current = next;
      next.el.classList.add('screen-enter');
      stage.append(next.el);
      prev?.destroy?.();
      if (prev) {
        prev.el.classList.add('screen-leave');
        setTimeout(() => prev.el.remove(), reducedMotion() ? 0 : 260);
      }
      requestAnimationFrame(() => next.el.classList.remove('screen-enter'));
      void next.mount?.();
    },
    toast(msg, kind = 'info') {
      const t = h('div', { class: `toast toast-${kind}` }, msg);
      toasts.append(t);
      while (toasts.children.length > 3) toasts.firstElementChild?.remove();
      setTimeout(() => t.classList.add('toast-out'), 3200);
      setTimeout(() => t.remove(), 3600);
    },
  };

  // Am Handy beim ersten Antippen ins Vollbild und Querformat (wo der Browser das erlaubt)
  const coarse = () => {
    try {
      return matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  };
  const goLandscape = () => {
    if (!app.settings.get().fullscreen || !coarse() || document.fullscreenElement) return;
    const el = document.documentElement as HTMLElement & { requestFullscreen?: (o?: FullscreenOptions) => Promise<void> };
    el.requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {
        /* Browser erlaubt es nicht: dann bleibt der Dreh-Hinweis */
      });
  };
  root.addEventListener('pointerup', goLandscape);

  await app.backend.load();
  app.go('splash');
}

/** Feines Filmkorn über allem, einmal zur Laufzeit erzeugt. */
function installGrain(root: HTMLElement) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    root.style.setProperty('--grain', `url(${c.toDataURL()})`);
  } catch {
    /* ohne Korn */
  }
}
