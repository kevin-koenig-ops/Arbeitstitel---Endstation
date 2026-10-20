// Zentrale Einstellungen. Titel und Version an einer Stelle.

export const GAME_TITLE = 'Endstation'; // Arbeitstitel
export const GAME_VERSION = '0.1.0';

/** Bestimmt, wo in der Welt welche Fundstellen liegen. Ändern = neue Welt. */
export const WORLD_SEED = 'endstation-welt-1';

/** Vorschau-Build (eine HTML-Datei ohne GPS und ohne Kartenserver). */
export const IS_PREVIEW = import.meta.env.MODE === 'preview';

/** Radius, in dem Fundstellen angezeigt werden. */
export const VIEW_RADIUS_M = 650;

/** Startpunkt für "echte Karte + Simulation", falls noch kein GPS-Standort bekannt ist. */
export const FALLBACK_START = { lat: 52.5163, lon: 13.3777 };
