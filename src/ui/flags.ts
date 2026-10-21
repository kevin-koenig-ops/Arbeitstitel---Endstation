// Sprachen mit Fahnen fürs Sprachmenü. Die Fahnen sind schlicht gezeichnet (3 : 2),
// damit sie auf jedem Gerät gleich aussehen (Fahnen-Emojis fehlen z. B. unter Windows).

export type LangCode = 'de' | 'en' | 'fr' | 'es' | 'it' | 'nl' | 'pl' | 'pt' | 'tr' | 'uk';

export interface Language {
  code: LangCode;
  /** Name in der eigenen Sprache */
  name: string;
  /** Schon übersetzt? */
  ready: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'de', name: 'Deutsch', ready: true },
  { code: 'en', name: 'English', ready: false },
  { code: 'fr', name: 'Français', ready: false },
  { code: 'es', name: 'Español', ready: false },
  { code: 'it', name: 'Italiano', ready: false },
  { code: 'nl', name: 'Nederlands', ready: false },
  { code: 'pl', name: 'Polski', ready: false },
  { code: 'pt', name: 'Português', ready: false },
  { code: 'tr', name: 'Türkçe', ready: false },
  { code: 'uk', name: 'Українська', ready: false },
];

const stripesH = (...c: string[]) => c.map((col, i) => `<rect y="${(i * 20) / c.length}" width="30" height="${20 / c.length + 0.01}" fill="${col}"/>`).join('');
const stripesV = (...c: string[]) => c.map((col, i) => `<rect x="${(i * 30) / c.length}" width="${30 / c.length + 0.01}" height="20" fill="${col}"/>`).join('');

const FLAGS: Record<LangCode, string> = {
  de: stripesH('#000', '#dd0000', '#ffce00'),
  // Vereinigtes Königreich (vereinfacht)
  en:
    '<rect width="30" height="20" fill="#012169"/>' +
    '<path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/>' +
    '<path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.5"/>' +
    '<path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/>' +
    '<path d="M15 0V20M0 10H30" stroke="#c8102e" stroke-width="3.5"/>',
  fr: stripesV('#002395', '#fff', '#ed2939'),
  es: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  it: stripesV('#009246', '#fff', '#ce2b37'),
  nl: stripesH('#ae1c28', '#fff', '#21468b'),
  pl: stripesH('#fff', '#dc143c'),
  pt: '<rect width="30" height="20" fill="#da291c"/><rect width="12" height="20" fill="#046a38"/><circle cx="12" cy="10" r="3.6" fill="#ffe900"/>',
  tr:
    '<rect width="30" height="20" fill="#e30a17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.3" cy="10" r="4" fill="#e30a17"/>' +
    '<path d="M15.4 10l3.8-1.2-2.3 3.2V8l2.3 3.2z" fill="#fff"/>',
  uk: stripesH('#0057b7', '#ffd700'),
};

/** Fahne als SVG-Text (30 × 20). */
export function flagSvg(code: LangCode): string {
  return `<svg viewBox="0 0 30 20" class="flag" aria-hidden="true"><g>${FLAGS[code]}</g></svg>`;
}
