// Musik: spielt je nach Ort (Hauptmenü, Zuhause, Karte) die passenden Stücke.
// Zwei Arten: Dauerschleife (ein Stück nach dem anderen) oder „ab und zu“
// (ein Stück, dann ein paar Minuten Stille, dann das nächste).
//
// Browser spielen Ton erst nach dem ersten Antippen. Bis dahin wartet die Musik.
// Geht die App in den Hintergrund, verstummt sie und spielt danach weiter.

import type { SettingsStore } from './settings';

export type MusicPlace = 'menu' | 'home' | 'map' | 'none';
export type MusicMode = 'loop' | 'sometimes' | 'off';
type Place = Exclude<MusicPlace, 'none'>;

/** Stücke je Ort (Dateien liegen in public/music/). */
const PLAYLISTS: Record<Place, string[]> = {
  menu: ['menu'],
  home: ['zuhause-1', 'zuhause-2'],
  // Alle Karten-Stücke laufen überall, zu jeder Zeit und bei jedem Wetter.
  // Ein Suno-Prompt gibt zwei Lieder: karte-3.1 und karte-3.2 gehören zusammen.
  map: ['karte-1', 'karte-2', 'karte-3.1', 'karte-3.2', 'karte-4.1', 'karte-4.2', 'karte-5.1', 'karte-5.2'],
};

/** Stille zwischen zwei Stücken im Modus „ab und zu“ (Sekunden). */
const REST_S: [number, number] = [90, 240];
/** Überblenden beim Ortswechsel und Einblenden am Anfang (Sekunden). */
const FADE_OUT_S = 2.2;
const FADE_IN_S = 2.5;

interface Track {
  name: string;
  el: HTMLAudioElement;
  gain: GainNode | null;
  /** Aktuelle Lautstärke dieses Stücks (0–1), ohne die Gesamtlautstärke. */
  level: number;
  target: number;
  /** Änderung je Sekunde beim Ein- und Ausblenden. */
  speed: number;
  broken: boolean;
}

class MusicPlayer {
  private mode: MusicMode = 'off';
  private volume = 0.8;
  private place: MusicPlace = 'none';
  private tracks = new Map<string, Track>();
  /** Das Stück, das gerade läuft oder laufen soll. */
  private current: Track | null = null;
  /** Stück, das an einem Ort zuletzt lief (beim Zurückkommen geht es dort weiter). */
  private paused: Partial<Record<Place, Track>> = {};
  /** Was je Ort in dieser Runde noch kommt (zufällige Reihenfolge). */
  private queue: Partial<Record<Place, string[]>> = {};
  /** Zuletzt gespieltes Stück je Ort. */
  private lastName: Partial<Record<Place, string>> = {};
  private restTimer = 0;
  private fadeTimer = 0;
  private lastTick = 0;
  /** Browser hat das Abspielen noch nicht erlaubt (erst nach Antippen). */
  private blocked = false;
  private audio: AudioContext | null = null;
  /** Kann der Browser die Lautstärke direkt setzen? (iPhone nicht, dort über Web Audio) */
  private volumeWorks = true;
  private attached = false;

  /** Einmal beim Start: Einstellungen lesen und auf Änderungen hören. */
  attach(settings: SettingsStore) {
    if (this.attached || typeof Audio === 'undefined') return;
    this.attached = true;
    try {
      const probe = new Audio();
      probe.volume = 0.5;
      this.volumeWorks = Math.abs(probe.volume - 0.5) < 0.01;
    } catch {
      this.volumeWorks = false;
    }
    const apply = () => {
      const s = settings.get();
      this.configure(s.music, s.musicVolume);
    };
    settings.onChange(apply);
    apply();
    const unlock = () => {
      if (this.audio?.state === 'suspended') void this.audio.resume();
      if (this.blocked) {
        this.blocked = false;
        if (this.current && this.current.target > 0) this.play(this.current);
      }
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  /** Ort wechseln: blendet das alte Stück aus und das passende neue ein. */
  setPlace(place: MusicPlace) {
    if (place === this.place) return;
    const old = this.place;
    this.place = place;
    this.stopRest();
    if (this.current) {
      // Merken, wo das Stück stand, damit es beim Zurückkommen weitergeht
      if (old !== 'none' && !this.nearEnd(this.current)) this.paused[old] = this.current;
      this.fadeTo(this.current, 0, FADE_OUT_S);
      this.current = null;
    }
    this.startHere();
  }

  private configure(mode: MusicMode, volume: number) {
    const v = Math.max(0, Math.min(1, volume));
    if (v !== this.volume) {
      this.volume = v;
      this.tracks.forEach((t) => this.applyLevel(t));
    }
    if (mode === this.mode) return;
    const was = this.mode;
    this.mode = mode;
    if (mode === 'off') {
      this.stopRest();
      if (this.current) this.fadeTo(this.current, 0, 1.2);
      this.current = null;
      this.paused = {};
      return;
    }
    // Von „aus“ an oder aus der Pause heraus auf Dauerschleife: gleich losspielen
    if (was === 'off' || (mode === 'loop' && !this.current)) {
      this.stopRest();
      this.startHere();
    }
  }

  /** Am aktuellen Ort ein Stück beginnen (oder das unterbrochene fortsetzen). */
  private startHere() {
    if (this.mode === 'off' || this.place === 'none') return;
    const place = this.place;
    const resume = this.paused[place];
    delete this.paused[place];
    const t = resume && !resume.broken ? resume : this.pickNext(place);
    if (!t) return;
    if (t !== resume) {
      // Neues Stück: von vorn und sanft einblenden
      t.el.currentTime = 0;
      t.level = 0;
      this.applyLevel(t);
    }
    this.current = t;
    this.fadeTo(t, 1, FADE_IN_S);
    this.play(t);
  }

  /**
   * Nächstes Stück: jede Runde in neuer zufälliger Reihenfolge, bis jedes einmal lief.
   * Dasselbe Stück kommt nie zweimal direkt hintereinander.
   */
  private pickNext(place: Place): Track | null {
    const list = PLAYLISTS[place];
    for (let i = 0; i < list.length * 2; i++) {
      let queue = this.queue[place];
      if (!queue?.length) {
        queue = shuffled(list);
        if (queue.length > 1 && queue[0] === this.lastName[place]) [queue[0], queue[1]] = [queue[1], queue[0]];
        this.queue[place] = queue;
      }
      const name = queue.shift()!;
      const t = this.track(name);
      if (t.broken) continue;
      this.lastName[place] = name;
      return t;
    }
    return null;
  }

  private track(name: string): Track {
    let t = this.tracks.get(name);
    if (t) return t;
    const el = new Audio();
    el.preload = 'auto';
    el.src = `${import.meta.env.BASE_URL}music/${name}.mp3`;
    const track: Track = { name, el, gain: null, level: 0, target: 0, speed: 1, broken: false };
    el.addEventListener('ended', () => this.onEnded(track));
    el.addEventListener('error', () => {
      // Datei fehlt oder geht nicht: überspringen (z. B. in der Einzeldatei-Vorschau)
      track.broken = true;
      if (this.current === track) {
        this.current = null;
        this.startHere();
      }
    });
    if (!this.volumeWorks) this.connectWebAudio(track);
    this.tracks.set(name, track);
    this.applyLevel(track);
    return track;
  }

  /** Nur wo sich die Lautstärke nicht direkt setzen lässt (iPhone): über Web Audio. */
  private connectWebAudio(t: Track) {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.audio ??= new AC();
      const src = this.audio.createMediaElementSource(t.el);
      t.gain = this.audio.createGain();
      src.connect(t.gain).connect(this.audio.destination);
    } catch {
      t.gain = null;
    }
  }

  private play(t: Track) {
    if (document.hidden || t.broken) return;
    if (this.audio?.state === 'suspended') void this.audio.resume().catch(() => {});
    const p = t.el.play();
    p?.catch((err: DOMException) => {
      // Noch nicht angetippt: beim ersten Antippen nochmal versuchen
      if (err?.name === 'NotAllowedError') this.blocked = true;
    });
  }

  private onEnded(t: Track) {
    if (t !== this.current) return;
    this.current = null;
    if (this.mode === 'loop') {
      this.startHere();
    } else if (this.mode === 'sometimes') {
      this.restTimer = window.setTimeout(() => {
        this.restTimer = 0;
        if (!this.current) this.startHere();
      }, rand(REST_S[0], REST_S[1]) * 1000);
    }
  }

  private stopRest() {
    if (this.restTimer) clearTimeout(this.restTimer);
    this.restTimer = 0;
  }

  private nearEnd(t: Track) {
    const d = t.el.duration;
    return t.el.ended || (Number.isFinite(d) && d - t.el.currentTime < 12);
  }

  private onVisibility() {
    if (document.hidden) {
      // Im Hintergrund sofort still (Timer laufen dort nicht zuverlässig)
      this.tracks.forEach((t) => {
        if (!t.el.paused) t.el.pause();
      });
      return;
    }
    if (this.audio?.state === 'suspended') void this.audio.resume().catch(() => {});
    const t = this.current;
    if (t && t.target > 0) {
      t.level = 0;
      this.applyLevel(t);
      this.fadeTo(t, 1, 1.5);
      this.play(t);
    } else if (!t && !this.restTimer && this.mode !== 'off') {
      // Pause lief im Hintergrund ab: jetzt weiter
      this.startHere();
    }
  }

  // --- Ein- und Ausblenden ---------------------------------------------------------

  private fadeTo(t: Track, target: number, seconds: number) {
    t.target = target;
    t.speed = Math.max(0.05, Math.abs(target - t.level) / Math.max(0.05, seconds));
    if (!this.fadeTimer) {
      this.lastTick = performance.now();
      this.fadeTimer = window.setInterval(() => this.tick(), 50);
    }
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    let busy = false;
    this.tracks.forEach((t) => {
      if (t.level === t.target) return;
      const step = t.speed * dt;
      t.level = t.level < t.target ? Math.min(t.target, t.level + step) : Math.max(t.target, t.level - step);
      this.applyLevel(t);
      if (t.level === 0 && t.target === 0) t.el.pause();
      if (t.level !== t.target) busy = true;
    });
    if (!busy) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = 0;
    }
  }

  private applyLevel(t: Track) {
    // Quadratisch: der Regler fühlt sich so gleichmäßiger an
    const out = Math.max(0, Math.min(1, t.level * this.volume * this.volume));
    if (t.gain) t.gain.gain.value = out;
    else if (this.volumeWorks) t.el.volume = out;
  }
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/** Die eine Musik für die ganze App. */
export const music = new MusicPlayer();

/** Kopie der Liste in zufälliger Reihenfolge. */
function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
