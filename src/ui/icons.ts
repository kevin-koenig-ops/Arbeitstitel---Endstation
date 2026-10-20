// Strich-Icons (24×24). Farbe kommt über currentColor aus dem CSS.

import type { Resource, SpotKind } from '../core/types';

const P: Record<string, string> = {
  // Ressourcen
  food: '<path d="M6 6.5h12V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><ellipse cx="12" cy="6.5" rx="6" ry="2"/><path d="M6 11h12M6 15.5h12"/>',
  water: '<path d="M10 2.5h4V5l2 3v12a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V8l2-3z"/><path d="M8 12.5h8M8 16.5h8"/>',
  medicine: '<rect x="3" y="6.5" width="18" height="13.5" rx="1.5"/><path d="M9 6.5V4h6v2.5M12 10v6.5M8.75 13.25h6.5"/>',
  material: '<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><circle cx="12" cy="12" r="3.4"/>',
  // Fundstellen
  car: '<path d="M3 16.5v-4.2L5.2 7h13.6l2.2 5.3v4.2z"/><circle cx="7.5" cy="16.8" r="1.9"/><circle cx="16.5" cy="16.8" r="1.9"/><path d="M3.2 12.3h17.6"/>',
  backpack: '<path d="M7 9a5 5 0 0 1 10 0v11.5H7z"/><path d="M9.5 5.2V3h5v2.2M7 13.5h10M10 16.5h4"/>',
  shed: '<path d="M3 11.5l9-7.5 9 7.5"/><path d="M5 10v10.5h14V10"/><path d="M10 20.5V15h4v5.5"/>',
  container: '<path d="M4 8.5h16l-1.6 12H5.6z"/><path d="M3 8.5l2-3.5h14l2 3.5M9.5 11.5v6M14.5 11.5v6"/>',
  hide: '<path d="M7 3.5h10v6.5H7z"/><path d="M5 3.5L12 2l7 1.5"/><path d="M8 10l-3 12M16 10l3 12M6.6 16h10.8"/>',
  barrel: '<path d="M6 3.5h12M6 20.5h12"/><path d="M6 3.5c-1.2 5.5-1.2 11.5 0 17M18 3.5c1.2 5.5 1.2 11.5 0 17"/><path d="M5.3 9h13.4M5.3 15h13.4"/>',
  parcel: '<path d="M3 7.2l9-4.2 9 4.2v9.6L12 21l-9-4.2z"/><path d="M3 7.2l9 4.2 9-4.2M12 11.4V21M7.5 5.1l9 4.2"/>',
  market: '<path d="M2 4h3l2.6 11.2h11.2L21 7.2H6"/><circle cx="9" cy="19.2" r="1.5"/><circle cx="17" cy="19.2" r="1.5"/>',
  pharmacy: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  hardware: '<path d="M4 4.5h9.5l3 3H20v4h-3.5l-2-2H4z"/><path d="M9.5 9.5V21"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12M4 10h10"/><path d="M14 8h2l2 2v7a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  well: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>',
  stop: '<circle cx="12" cy="8.5" r="6"/><path d="M10 6v5M14 6v5M10 8.5h4M12 14.5V22"/>',
  // Oberfläche
  bus: '<rect x="3" y="3.5" width="18" height="14" rx="2.5"/><path d="M3 11h18M7 17.5v2.5M17 17.5v2.5M8 3.5v7.5M16 3.5v7.5"/><circle cx="7" cy="14.3" r="1"/><circle cx="17" cy="14.3" r="1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  locate: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  memento: '<rect x="4.5" y="3" width="15" height="18" rx="1"/><rect x="7" y="5.5" width="10" height="9.5"/>',
  gps: '<path d="M4.5 12a7.5 7.5 0 0 1 15 0M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1.6"/><path d="M12 13.6V20"/>',
  tap: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="8" stroke-dasharray="2.2 3"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  sunset: '<path d="M7 16a5 5 0 0 1 10 0M3 16h18M5 20h14M12 4v4M5.6 9.6l1.6 1.6M18.4 9.6l-1.6 1.6"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.7 1.2A3.5 3.5 0 0 0 7 18.5z"/>',
  clear: '<circle cx="12" cy="12" r="4.2"/>',
  cloudy: '<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.7 1.2A3.5 3.5 0 0 0 7 18.5z"/>',
  rain: '<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.7 1.2A3.5 3.5 0 0 0 7 14.5z"/><path d="M8 17.5l-1 3M12 17.5l-1 3M16 17.5l-1 3"/>',
  snow: '<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.7 1.2A3.5 3.5 0 0 0 7 14.5z"/><path d="M8 18.5h.01M12 20.5h.01M16 18.5h.01M10 21.5h.01M14 22h.01" stroke-width="2.4"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14M7 21h10"/>',
  storm: '<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.7 1.2A3.5 3.5 0 0 0 7 14.5z"/><path d="M12.5 15.5l-2.5 4h3l-2 3.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  wrench: '<path d="M15 3.5a5 5 0 0 0-4.8 6.4L3.5 16.6l3.9 3.9 6.7-6.7A5 5 0 0 0 20.5 9l-3 3-3.5-3.5 3-3a5 5 0 0 0-2-2z"/>',
};

export function icon(name: string, size = 22): string {
  const body = P[name] ?? P.parcel;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const resIcon = (r: Resource, size?: number) => icon(r, size);
export const spotIcon = (k: SpotKind, size?: number) => icon(k, size);
