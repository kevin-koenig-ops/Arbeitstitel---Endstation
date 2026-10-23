// Zentrale Einstellungen. Titel und Version an einer Stelle.

export const GAME_TITLE = 'Projekt Heimweg'; // Spieltitel (seit 23.10., vorher „Home“, davor „Nachhall“)
/** Fürs Logo: kleine Zeile oben, großes Wort darunter. */
export const LOGO_PARTS = { kicker: 'Projekt', word: 'Heimweg' };
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

/**
 * Funksprüche auf der Karte (Sichtungen, Hinweise am Horizont, Händlerkarren, Weltereignisse in der Ferne).
 * Kevin 23.10.: erstmal raus, es ploppte zu viel auf. Was da ist, zeigen Radar und Ereignis-Anzeige oben still.
 */
export const RADIO_POPUPS = false;

/** Funk-Radar oben (Liste mit Richtung zu Sichtungen und Rauch am Horizont). Kevin 23.10.: raus, man soll suchen. */
export const RADAR_CHIP = false;

/** Startpunkt für "echte Karte + Simulation", falls noch kein GPS-Standort bekannt ist. */
export const FALLBACK_START = { lat: 52.5163, lon: 13.3777 };
