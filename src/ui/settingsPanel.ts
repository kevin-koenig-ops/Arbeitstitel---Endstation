// Einstellungen. Wird als eigener Bildschirm (aus dem Menü) und als Overlay (im Spiel) benutzt.

import { GAME_VERSION, IS_PREVIEW } from '../config';
import type { Settings } from '../services/settings';
import type { App } from './app';
import { h } from './dom';

export function settingsPanel(app: App, opts: { onDeleted?: () => void } = {}): HTMLElement {
  const s = app.settings;

  const segmented = <K extends keyof Settings>(key: K, id: string, options: [Settings[K], string][], disabled = false) => {
    const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': id });
    const paint = () => [...group.children].forEach((c, i) => c.setAttribute('aria-checked', String(options[i][0] === s.get()[key])));
    for (const [value, label] of options) {
      group.append(
        h('button', { type: 'button', role: 'radio', disabled, onclick: () => (s.set({ [key]: value } as Partial<Settings>), paint()) }, label),
      );
    }
    paint();
    return group;
  };

  const vib = h('input', {
    id: 'set-vibration',
    type: 'checkbox',
    class: 'toggle',
    onchange: () => s.set({ vibration: vib.checked }),
  });
  vib.checked = s.get().vibration;

  const fullToggle = h('input', { id: 'set-full', type: 'checkbox', class: 'toggle', onchange: () => s.set({ fullscreen: fullToggle.checked }) });
  fullToggle.checked = s.get().fullscreen;

  const weatherToggle = h('input', { id: 'set-weather', type: 'checkbox', class: 'toggle', onchange: () => s.set({ realWeather: weatherToggle.checked }) });
  weatherToggle.checked = s.get().realWeather;

  const select = <K extends 'testPhase' | 'testWeather'>(key: K, id: string, options: [Settings[K], string][]) => {
    const sel = h('select', { id, class: 'select', onchange: () => s.set({ [key]: sel.value } as Partial<Settings>) }, options.map(([v, label]) => h('option', { value: String(v) }, label)));
    sel.value = String(s.get()[key]);
    return sel;
  };
  const phaseSelect = select('testPhase', 'set-phase', [
    ['auto', 'Echt (Sonnenstand)'],
    ['day', 'Tag'],
    ['dusk', 'Dämmerung'],
    ['night', 'Nacht'],
  ]);
  const weatherSelect = select('testWeather', 'set-wx', [
    ['auto', 'Echt'],
    ['clear', 'Klar'],
    ['cloudy', 'Bewölkt'],
    ['rain', 'Regen'],
    ['storm', 'Gewitter'],
    ['snow', 'Schnee'],
    ['fog', 'Nebel'],
  ]);

  let armed = false;
  let armTimer = 0;
  const del = h('button', { class: 'btn ghost danger-text', type: 'button' }, 'Spielstand löschen');
  del.addEventListener('click', async () => {
    if (!app.backend.current()) {
      app.toast('Es gibt keinen Spielstand.');
      return;
    }
    if (!armed) {
      armed = true;
      del.textContent = 'Wirklich löschen? Nochmal tippen';
      del.classList.add('armed');
      armTimer = window.setTimeout(() => {
        armed = false;
        del.textContent = 'Spielstand löschen';
        del.classList.remove('armed');
      }, 4000);
      return;
    }
    clearTimeout(armTimer);
    await app.backend.deleteSave();
    app.toast('Spielstand gelöscht.');
    del.textContent = 'Spielstand löschen';
    del.classList.remove('armed');
    armed = false;
    opts.onDeleted?.();
  });

  const previewNote = IS_PREVIEW
    ? h('p', { class: 'note' }, 'In dieser Vorschau gibt es nur das Demo-Dorf und Tippen-zum-Laufen. Echte Karte und GPS laufen in der App-Version auf dem Handy.')
    : null;

  return h(
    'div',
    { class: 'settings' },
    h(
      'section',
      { class: 'set-group' },
      h('h2', null, 'Karte & Standort'),
      h('div', { class: 'set-row' }, h('div', { class: 'set-label', id: 'lbl-map' }, 'Karte', h('small', null, 'Echte Umgebung oder das fiktive Dorf Altenbrück')), segmented('map', 'lbl-map', [['real', 'Echt'], ['demo', 'Demo-Dorf']], IS_PREVIEW)),
      h('div', { class: 'set-row' }, h('div', { class: 'set-label', id: 'lbl-loc' }, 'Standort', h('small', null, 'GPS draußen, Simulation zum Testen drinnen')), segmented('location', 'lbl-loc', [['gps', 'GPS'], ['sim', 'Simulation']], IS_PREVIEW)),
      previewNote,
      h('div', { class: 'set-row' }, h('label', { class: 'set-label', for: 'set-vibration' }, 'Vibration', h('small', null, 'Kurz vibrieren, wenn eine Fundstelle in Reichweite ist')), vib),
      h('div', { class: 'set-row' }, h('label', { class: 'set-label', for: 'set-weather' }, 'Echtes Wetter', h('small', null, 'Regen, Schnee und Nebel wie draußen. Dafür geht dein Standort, auf etwa 10 km gerundet, an Open-Meteo.')), weatherToggle),
    ),
    h(
      'section',
      { class: 'set-group' },
      h('h2', null, 'Steuerung'),
      h(
        'div',
        { class: 'set-row' },
        h('div', { class: 'set-label', id: 'lbl-ctrl' }, 'Figur bewegen', h('small', null, 'Antippen: Figur läuft zur Stelle, wie bei Die Sims. Joystick: selbst steuern, mit Benutzen-Taste. Gilt in der Endstation und in der Simulation.')),
        segmented('control', 'lbl-ctrl', [
          ['tap', 'Antippen'],
          ['joystick', 'Joystick'],
        ]),
      ),
      h(
        'div',
        { class: 'set-row' },
        h('div', { class: 'set-label', id: 'lbl-lgames' }, 'Minispiele beim Durchsuchen', h('small', null, 'Schloss knacken, aufhebeln, wühlen: Wer es gut macht, findet mehr. Aus: immer ein normales Ergebnis.')),
        segmented('lootGames', 'lbl-lgames', [
          ['on', 'An'],
          ['off', 'Aus'],
        ]),
      ),
      h('div', { class: 'set-row' }, h('label', { class: 'set-label', for: 'set-full' }, 'Vollbild', h('small', null, 'Am Handy beim Spielen ins Vollbild und im Querformat bleiben (geht nicht in jedem Browser).')), fullToggle),
    ),
    h(
      'section',
      { class: 'set-group' },
      h('h2', null, 'Grafik'),
      h(
        'div',
        { class: 'set-row' },
        h('div', { class: 'set-label', id: 'lbl-gfx' }, 'Grafikstil', h('small', null, 'Polygon: kantig, mit weichem Licht. Comic: flächige Farben und dunkle Umrisse wie im Zeichentrick. Gemalt: weiche Formen, Pinselstruktur und warmes Licht (Stilprobe).')),
        segmented('graphics', 'lbl-gfx', [
          ['poly', 'Polygon'],
          ['comic', 'Comic'],
          ['painted', 'Gemalt'],
        ]),
      ),
    ),
    h(
      'section',
      { class: 'set-group' },
      h('h2', null, 'Zum Ausprobieren'),
      h('p', { class: 'note' }, 'Tageszeit und Wetter erzwingen, um die Stimmungen zu sehen. Ändert nur die Optik, nicht Beute oder Gegner.'),
      h('div', { class: 'set-row' }, h('label', { class: 'set-label', for: 'set-phase' }, 'Tageszeit'), phaseSelect),
      h('div', { class: 'set-row' }, h('label', { class: 'set-label', for: 'set-wx' }, 'Wetter'), weatherSelect),
    ),
    h(
      'section',
      { class: 'set-group' },
      h('h2', null, 'Konto'),
      h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Gast auf diesem Gerät', h('small', null, 'Dein Spielstand liegt nur auf diesem Gerät.')), h('button', { class: 'btn ghost small', type: 'button', disabled: true }, 'Google · bald')),
    ),
    h(
      'section',
      { class: 'set-group' },
      h('h2', null, 'Datenschutz'),
      h('p', { class: 'note' }, 'Dein genauer Standort verlässt dein Gerät nicht. Für die echte Karte lädt die App Kartenkacheln von OpenFreeMap; dabei sieht der Kartenserver nur, welcher Kartenausschnitt geladen wird. Für echtes Wetter geht ein auf etwa 10 km gerundeter Ort an Open-Meteo. Das kannst du oben ausschalten. Den Ort deiner Endstation speichert nur dieses Gerät; andere Spieler sehen ihn nie.'),
    ),
    h('section', { class: 'set-group' }, h('h2', null, 'Spielstand'), del),
    h('p', { class: 'version' }, `Version ${GAME_VERSION} · Kartendaten © OpenStreetMap-Mitwirkende`),
  );
}
