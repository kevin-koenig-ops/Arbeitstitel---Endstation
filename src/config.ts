// Zentrale Einstellungen. Titel und Version an einer Stelle.

export const GAME_TITLE = 'Home'; // Spieltitel (seit 22.10., vorher „Nachhall“)
export const GAME_VERSION = '0.1.0';

declare const __BUILD_STAMP__: string;
/** Wann gebaut (Datum, Uhrzeit, Git-Stand), z. B. „22.10., 09:20 · 135467a“. */
export const BUILD_STAMP: string = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '';

/** Bestimmt, wo in der Welt welche Fundstellen liegen. Ändern = neue Welt. */
export const WORLD_SEED = 'endstation-welt-1';

/** Vorschau-Build (eine HTML-Datei ohne GPS und ohne Kartenserver). */
export const IS_PREVIEW = import.meta.env.MODE === 'preview';

/** Radius, in dem Fundstellen angezeigt werden. */
export const VIEW_RADIUS_M = 650;

/** Startpunkt für "echte Karte + Simulation", falls noch kein GPS-Standort bekannt ist. */
export const FALLBACK_START = { lat: 52.5163, lon: 13.3777 };
