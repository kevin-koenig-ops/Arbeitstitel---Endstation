// Die Schnittstelle zwischen Oberfläche und Spiellogik.
//
// Die Oberfläche (src/ui) verändert den Spielstand nie selbst. Sie schickt Aktionen
// an ein GameBackend und zeigt die Ereignisse an, die zurückkommen.
//
//   Heute:  LocalBackend  -> Regeln laufen im Browser, Speicher = localStorage
//   Später: RemoteBackend -> Aktionen gehen an einen Server, der dieselben Regeln
//                            (src/core) ausführt und den Spielstand in einer
//                            Datenbank hält. Die Oberfläche bleibt unverändert.

import { distanceM } from '../core/geo';
import { applyAction, cartOf, createPlayer, guardOf } from '../core/rules';
import { migrate } from '../core/save';
import type { Action, ActionResult, Character, EnemyId, GameEvent, LatLon, PlayerState, RegionId, Spot, WorldEvent } from '../core/types';
import { patrolsAround, type PatrolPlan } from '../core/patrols';
import { eventsAround } from '../core/worldEvents';
import { gridSpotsAround, gridSpotUntil, poiSpots, specialPlacesAround, type PoiCandidate } from '../core/world';
import type { AuthProvider } from './auth';
import { readJson, removeKey, writeJson } from './storage';

export interface GameBackend {
  readonly kind: 'local' | 'remote';
  /** Vorhandenen Spielstand laden, falls es einen gibt. */
  load(): Promise<PlayerState | null>;
  newGame(character: Character): Promise<PlayerState>;
  dispatch(action: Action): Promise<ActionResult>;
  current(): PlayerState | null;
  deleteSave(): Promise<void>;
  /** Fundstellen in der Nähe. Im Mehrspieler kommen sie vom Server. */
  spotsNear(center: LatLon, radiusM: number, pois: PoiCandidate[]): Promise<Spot[]>;
  /** Besondere Orte im Umkreis (auch weit weg, für die Hinweise am Horizont). */
  specialsNear(center: LatLon, radiusM: number): Spot[];
  /** Wer bewacht diese Fundstelle gerade? Im Mehrspieler weiß das der Server. */
  guardFor(spot: Spot): EnemyId | null;
  /** Steht hier gerade eine Händlerkiste (und bis wann)? */
  cartFor(spot: Spot): { until: number } | null;
  /** Bis wann eine wandernde Fundstelle noch liegt (null: bleibt). */
  spotUntil(spot: Spot): number | null;
  /** Wo nichts liegen darf (aus den Kartendaten); gilt für neue Verstecke. */
  setPlaceFilter(fn: ((p: LatLon) => boolean) | null): void;
  /** Nur zum Testen: Bauen ohne Bauzeit (Einstellungen > Testen). */
  setInstantBuild(on: boolean): void;
  /** Nach jedem Schritt: was passiert ist. Für Hinweise, die überall gelten (z. B. „Baustelle fertig“). Gibt das Abmelden zurück. */
  onEvents(fn: (events: GameEvent[], state: PlayerState) => void): () => void;
  /** Wo keine besonderen Orte liegen sollen (bebaut, Gärten, Höfe): sie liegen draußen im Offenen. */
  setSpecialFilter(fn: ((p: LatLon) => boolean) | null): void;
  /** Weltereignisse im Umkreis (laufende und die, die in soonMs beginnen). Im Mehrspieler vom Server. */
  eventsNear(center: LatLon, radiusM: number, soonMs?: number): WorldEvent[];
  /** Trupps, die gerade im Umkreis unterwegs sind. */
  patrolsNear(center: LatLon, radiusM: number, region: RegionId, night: boolean, events: WorldEvent[], frost?: boolean): PatrolPlan[];
  /** Weltstartwert (für Zufall, den alle Spieler gleich sehen, z. B. die Strecken der Trupps). */
  readonly seed: string;
  now(): number;
}

export class LocalBackend implements GameBackend {
  readonly kind = 'local' as const;
  private state: PlayerState | null = null;
  private placeFilter: ((p: LatLon) => boolean) | null = null;
  private listeners = new Set<(events: GameEvent[], state: PlayerState) => void>();
  private instantBuild = false;

  constructor(
    private auth: AuthProvider,
    private worldSeed: string,
    private clock: () => number = Date.now,
  ) {}

  now() {
    return this.clock();
  }

  private async key() {
    const user = await this.auth.currentUser();
    return `endstation.save.${user.id}`;
  }

  async load() {
    this.state = migrate(readJson(await this.key()));
    return this.state;
  }

  async newGame(character: Character) {
    const user = await this.auth.currentUser();
    this.state = createPlayer(user.id, character, this.clock());
    writeJson(await this.key(), this.state);
    return this.state;
  }

  async dispatch(action: Action): Promise<ActionResult> {
    if (!this.state) throw new Error('Kein Spielstand geladen');
    const result = applyAction(this.state, action, { now: this.clock(), worldSeed: this.worldSeed, blocked: this.placeFilter ?? undefined, instantBuild: this.instantBuild || undefined });
    if (result.state !== this.state) {
      this.state = result.state;
      writeJson(await this.key(), this.state);
    }
    const st = this.state;
    this.listeners.forEach((l) => l(result.events, st));
    return result;
  }

  setInstantBuild(on: boolean) {
    this.instantBuild = on;
  }

  onEvents(fn: (events: GameEvent[], state: PlayerState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  current() {
    return this.state;
  }

  async deleteSave() {
    removeKey(await this.key());
    this.state = null;
  }

  guardFor(spot: Spot) {
    return guardOf(this.worldSeed, spot, this.clock());
  }

  setPlaceFilter(fn: ((p: LatLon) => boolean) | null) {
    this.placeFilter = fn;
  }

  private specialFilter: ((p: LatLon) => boolean) | null = null;
  setSpecialFilter(fn: ((p: LatLon) => boolean) | null) {
    this.specialFilter = fn;
  }

  cartFor(spot: Spot) {
    return cartOf(this.worldSeed, spot, this.clock());
  }

  /** Bis wann eine wandernde Fundstelle noch liegt (null: bleibt). */
  spotUntil(spot: Spot) {
    return spot.source === 'grid' ? gridSpotUntil(this.worldSeed, spot.id) : null;
  }

  async spotsNear(center: LatLon, radiusM: number, pois: PoiCandidate[]) {
    const nearPois = poiSpots(this.worldSeed, pois).filter((s) => distanceM(center, s.pos) <= radiusM);
    return [...nearPois, ...gridSpotsAround(this.worldSeed, center, radiusM, this.clock()), ...this.specialsNear(center, radiusM)];
  }

  get seed() {
    return this.worldSeed;
  }

  eventsNear(center: LatLon, radiusM: number, soonMs = 0) {
    const a = this.placeFilter;
    const b = this.specialFilter;
    // Hilfsabwürfe wie besondere Orte: nie an heiklen Orten, nie in Gärten, auf Höfen oder Privatgrund
    const drop = a || b ? (p: LatLon) => !!(a?.(p) || b?.(p)) : undefined;
    return eventsAround(this.worldSeed, center, radiusM, this.clock(), a ?? undefined, soonMs, drop);
  }

  patrolsNear(center: LatLon, radiusM: number, region: RegionId, night: boolean, events: WorldEvent[], frost = false) {
    return patrolsAround(this.worldSeed, center, radiusM, this.clock(), region, night, events, frost, this.state?.noise ?? []);
  }

  specialsNear(center: LatLon, radiusM: number) {
    const a = this.placeFilter;
    const b = this.specialFilter;
    return specialPlacesAround(this.worldSeed, center, radiusM, a || b ? (p) => !!(a?.(p) || b?.(p)) : undefined);
  }
}
