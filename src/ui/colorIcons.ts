// Farbige Icons (24×24) im Sticker-Look: kräftige Flächen, Licht und Schatten, dunkle Kontur.
// Für Rohstoffe, Essen, Wasser und Medizin. Die Kontur ist in jedem Element gesetzt
// (stroke im Wurzel-Element), Details ohne Kontur haben stroke="none".

const N = 'stroke="none"';

export const COLOR_ICONS: Record<string, string> = {
  // Essen: Konservendose mit rotem Etikett
  food: `<path d="M5.5 6.5h13V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" fill="#b9bec6"/>
    <path d="M5.5 10h13v6.5h-13z" fill="#d8473a"/><path d="M5.5 10h13v1.6h-13z" fill="#f07a5c" ${N}/>
    <path d="M15.5 6.5h3V19a2 2 0 0 1-2 2h-1z" fill="#000" opacity=".16" ${N}/>
    <ellipse cx="12" cy="6.5" rx="6.5" ry="2.3" fill="#e9ecf0"/><ellipse cx="12" cy="6.5" rx="4.2" ry="1.2" fill="none" stroke="#9aa1aa" stroke-width="1"/>
    <path d="M8 12.2c1-.9 2.2-.9 3 0 .8-.9 2-.9 3 0-1 1.6-2 2.4-3 2.6-1-.2-2-1-3-2.6z" fill="#ffe2a6" ${N}/>`,
  // Wasser: Flasche, halb voll
  water: `<path d="M10 2.5h4v2.3l2.3 3.2V20a1.5 1.5 0 0 1-1.5 1.5H9.2A1.5 1.5 0 0 1 7.7 20V8l2.3-3.2z" fill="#d9eef7"/>
    <path d="M7.7 11.5c1.4-.8 2.9-.8 4.3 0s2.9.8 4.3 0V20a1.5 1.5 0 0 1-1.5 1.5H9.2A1.5 1.5 0 0 1 7.7 20z" fill="#3f9ad8"/>
    <path d="M9.4 9v9.5" stroke="#fff" stroke-width="1.4" opacity=".75"/>
    <rect x="9.5" y="1.5" width="5" height="2.6" rx=".6" fill="#2f6fb5"/>`,
  // Medizin: roter Verbandskasten mit weißem Kreuz
  medicine: `<path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" fill="none"/>
    <rect x="3" y="6.5" width="18" height="14" rx="2" fill="#d8473a"/><path d="M3.8 7.4h16.4v3H3.8z" fill="#f07a5c" ${N}/>
    <path d="M10.3 9.6h3.4v3h3v3.4h-3v3h-3.4v-3h-3v-3.4h3z" fill="#fff"/>`,
  // Holz: zwei Stämme, gestapelt
  wood: `<path d="M3.5 13.5l12-4.2 5 2-12 4.3z" fill="#9a6337"/><path d="M8.5 15.6l12-4.3v3.2l-12 4.3z" fill="#7a4a26"/>
    <ellipse cx="6" cy="16.2" rx="2.6" ry="2.8" fill="#e4bb7c"/><ellipse cx="6" cy="16.2" rx="1.2" ry="1.3" fill="none" stroke="#b07f45" stroke-width="1"/>
    <path d="M5.5 7.8l12-4.3 4 1.6-12 4.3z" fill="#a86d3c"/><path d="M9.5 9.4l12-4.3v3l-12 4.4z" fill="#82502a"/>
    <ellipse cx="7.3" cy="10" rx="2.4" ry="2.6" fill="#ecc68a"/><ellipse cx="7.3" cy="10" rx="1.1" ry="1.2" fill="none" stroke="#b07f45" stroke-width="1"/>`,
  // Metall: zwei Stahlträger
  metal: `<path d="M3 15l12-3 6 2-12 3.2z" fill="#c9d3dc"/><path d="M3 15v3l6 2.2v-3zM9 17.2v3L21 17v-3z" fill="#7d8b99"/>
    <path d="M3 9l12-3 6 2-12 3.2z" fill="#d6dee6"/><path d="M3 9v3l6 2.2v-3zM9 11.2v3L21 11V8z" fill="#8d9aa8"/>
    <path d="M6 9.2l8.5-2.1" stroke="#fff" stroke-width="1.1" opacity=".8"/>`,
  // Stein: Brocken mit hellen und dunklen Flächen
  stone: `<path d="M3.5 18.5l2.2-7.3 5.3-4.4 6.3 1.4 3.7 5.3-2.2 5z" fill="#a39b90"/>
    <path d="M11 6.8l1.6 5.4-6.9-1z" fill="#c9c2b6" ${N}/><path d="M12.6 12.2l5.7 1.4 2.7-.3-3.7-5.3-6.3-1.2z" fill="#bab3a7" ${N}/>
    <path d="M12.6 12.2l-9.1 6.3h15.3l2.2-5-2.4.1z" fill="#857d71" ${N}/>
    <path d="M3.5 18.5l2.2-7.3 5.3-4.4 6.3 1.4 3.7 5.3-2.2 5z" fill="none"/><path d="M11 6.8l1.6 5.4 5.7 1.4M12.6 12.2l-6.9-1M12.6 12.2l-3.6 6.3" fill="none" stroke-width="1"/>`,
  // Stoff: T-Shirt
  cloth: `<path d="M8 3.5L3.5 6.2v5l2.8-1v10.3h11.4V10.2l2.8 1v-5L16 3.5c-.6 1.7-2.1 2.6-4 2.6s-3.4-.9-4-2.6z" fill="#4f86c6"/>
    <path d="M6.3 10.2v10.3h3.2V8.6z" fill="#fff" opacity=".18" ${N}/><path d="M14.5 13.5h3.2v7h-3.2z" fill="#000" opacity=".15" ${N}/>
    <path d="M9.6 4.4c.7 1 1.5 1.5 2.4 1.5s1.7-.5 2.4-1.5" fill="none" stroke="#2d5c94" stroke-width="1.1"/>`,
  // Plastik: grüner Kanister mit Griff
  plastic: `<path d="M7 7.5h3.2l1-3h4l1.3 3H18a1.5 1.5 0 0 1 1.5 1.5v10.5A1.5 1.5 0 0 1 18 21H7a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 7 7.5z" fill="#4caf6a"/>
    <path d="M12.4 6h2.4l.6 1.5h-3.6z" fill="#e8f5e6" ${N}/><rect x="8" y="11" width="9" height="6" rx="1" fill="#f3f7ee"/>
    <path d="M9.5 13h6M9.5 15h4" stroke="#4caf6a" stroke-width="1"/><path d="M7.2 9.5v9.5" stroke="#fff" stroke-width="1.2" opacity=".6"/>`,
  // Glas: Einmachglas
  glass: `<rect x="7.5" y="3" width="9" height="3" rx=".8" fill="#c7a052"/>
    <path d="M7 6h10a1.5 1.5 0 0 1 1.5 1.5v11.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V7.5A1.5 1.5 0 0 1 7 6z" fill="#bfe7ef"/>
    <path d="M14.5 6.5H17a1.5 1.5 0 0 1 1.5 1.5v11a2 2 0 0 1-2 2h-2z" fill="#8fcfdd" ${N}/>
    <path d="M8.3 8.5v8" stroke="#fff" stroke-width="1.6"/><path d="M10.3 8.5v2.5" stroke="#fff" stroke-width="1.2"/>`,
  // Kleber: Tube
  glue: `<path d="M7.5 9.5h9l-1 10.5a1.5 1.5 0 0 1-1.5 1.4h-4a1.5 1.5 0 0 1-1.5-1.4z" fill="#f4f1e8"/>
    <path d="M8.1 13h7.8l-.4 4.5H8.5z" fill="#f2a93b"/><path d="M8.2 10.5h1.6v10" stroke="#fff" stroke-width="1" opacity=".8"/>
    <path d="M9 9.5V7h6v2.5z" fill="#e45a2e"/><path d="M11 7l1-4.5 1 4.5z" fill="#e45a2e"/>`,
  // Schrauben: zwei Schrauben, gekreuzt
  screws: `<g transform="rotate(-28 12 12)"><path d="M9 3.5h6l-.8 2.8H9.8z" fill="#d7dde3"/><path d="M10.6 6.3h2.8v12.2L12 21l-1.4-2.5z" fill="#aeb8c2"/>
    <path d="M10.6 8.5l2.8 1M10.6 11l2.8 1M10.6 13.5l2.8 1M10.6 16l2.8 1" stroke-width="1"/></g>
    <g transform="rotate(32 13 13)"><path d="M10 6h6l-.8 2.6h-4.4z" fill="#e3b54a"/><path d="M11.6 8.6h2.8v9.4L13 20.3 11.6 18z" fill="#c9962e"/>
    <path d="M11.6 10.6l2.8 1M11.6 13l2.8 1M11.6 15.4l2.8 1" stroke-width="1"/></g>`,
  // Elektronik: grüne Platine mit Chip
  electronics: `<rect x="3" y="5" width="18" height="14" rx="1.5" fill="#3f9a5a"/>
    <path d="M5 8h4l2 2M5 16h3l2-2M19 9h-3l-1.5 1.5M19 15h-2" stroke="#9fe0a8" stroke-width="1" fill="none"/>
    <rect x="9" y="8.5" width="6.5" height="7" rx=".8" fill="#2e3036"/><path d="M10.5 10h3.5" stroke="#6b6f78" stroke-width="1"/>
    <circle cx="5.5" cy="12" r="1" fill="#f2c94c"/><circle cx="18" cy="12" r="1" fill="#f2c94c"/>`,
  // Gummi: Reifen
  rubber: `<circle cx="12" cy="12" r="9" fill="#3a3b40"/><circle cx="12" cy="12" r="4.3" fill="#a9b0b8"/>
    <circle cx="12" cy="12" r="1.5" fill="#6e757d"/><path d="M5.6 7.5a8 8 0 0 1 4-3.3" stroke="#6b6d75" stroke-width="1.6" fill="none"/>
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" stroke="#1d1e22" stroke-width="1.2"/>`,
  // Leder: Lederstück mit Naht
  leather: `<path d="M7 4c1.5 1 3.5 1 5 0 1.5 1 3.5 1 5 0l1.5 4-1 3.5 1 4-2 4.5c-1.5-.8-3-.8-4.5 0-1.5-.8-3-.8-4.5 0l-2-4.5 1-4-1-3.5z" fill="#a8622e"/>
    <path d="M8 6.5c1.2.6 2.6.6 4 0 1.4.6 2.8.6 4 0l.8 2-.8 3 .8 3.5-1.3 3" fill="none" stroke="#f0c48a" stroke-width="1" stroke-dasharray="1.4 1.2"/>
    <path d="M7.5 9.5l.7 2.2-.7 3.6" stroke="#fff" stroke-width="1" opacity=".35" fill="none"/>`,
  // Federn: Spiralfeder
  springs: `<path d="M7 4h10M7 20h10" stroke-width="2.2"/><path d="M7 4h10M7 20h10" stroke="#b9c3cd" stroke-width="1"/>
    <path d="M8 4.5l8 2.4-8 2.4 8 2.4-8 2.4 8 2.4-8 2.4" fill="none" stroke-width="2.6"/>
    <path d="M8 4.5l8 2.4-8 2.4 8 2.4-8 2.4 8 2.4-8 2.4" fill="none" stroke="#c6d0da" stroke-width="1.2"/>`,
  // Zahnräder: Messing
  gears: `<path d="M10.6 2.5h2.8l.5 2.4 1.9.8 2-1.4 2 2-1.4 2 .8 1.9 2.4.5v2.8l-2.4.5-.8 1.9 1.4 2-2 2-2-1.4-1.9.8-.5 2.4h-2.8l-.5-2.4-1.9-.8-2 1.4-2-2 1.4-2-.8-1.9-2.4-.5v-2.8l2.4-.5.8-1.9-1.4-2 2-2 2 1.4 1.9-.8z" fill="#d6a640"/>
    <circle cx="12" cy="12" r="4.6" fill="#f1cb6a" ${N}/><circle cx="12" cy="12" r="2.4" fill="#5a4320"/>
    <path d="M8.2 9.3a4.6 4.6 0 0 1 2.3-1.6" stroke="#fff" stroke-width="1.1" opacity=".7" fill="none"/>`,
  // Kupfer: Drahtrolle
  copper: `<path d="M5 4.5h14l-1.5 2.5h-11zM5 19.5h14l-1.5-2.5h-11z" fill="#5d4a3a"/>
    <rect x="6.5" y="7" width="11" height="10" fill="#d47a3a"/>
    <path d="M6.5 9h11M6.5 11h11M6.5 13h11M6.5 15h11" stroke="#9a4e1e" stroke-width=".9"/>
    <path d="M8 7.5v9" stroke="#ffc08a" stroke-width="1.2" opacity=".85"/><path d="M17.5 12c2 0 2.5 2 3.5 3.5" fill="none" stroke="#d47a3a" stroke-width="1.6"/>`,
  // Öl: dunkler Tropfen mit Glanz
  oil: `<path d="M12 2.8c3.2 4.6 6.3 7.8 6.3 11.5a6.3 6.3 0 0 1-12.6 0c0-3.7 3.1-6.9 6.3-11.5z" fill="#3b2b1f"/>
    <path d="M12 6.5c1.8 2.8 3.6 5 3.6 7.6" stroke="#8a6a3e" stroke-width="1.2" fill="none"/>
    <path d="M9.2 14.6a2.8 2.8 0 0 0 2.8 2.8" stroke="#f4d58a" stroke-width="1.5" fill="none"/>`,
  // Zellen: Batterie
  cells: `<rect x="10" y="2.5" width="4" height="2.5" rx=".5" fill="#c9ccd1"/>
    <rect x="6.5" y="5" width="11" height="16" rx="1.8" fill="#2f3238"/><path d="M6.5 5h11v6h-11z" fill="#f2b632"/>
    <path d="M12 6.8v3M10.5 8.3h3" stroke="#2f3238" stroke-width="1.2"/><path d="M8.2 6v13.5" stroke="#fff" stroke-width="1.1" opacity=".45"/>
    <path d="M11.5 14l-1.5 3h2.2l-1 3 3-4h-2.2l1-2z" fill="#f2b632" ${N}/>`,
  // Desinfektion: Sprühflasche
  antiseptic: `<path d="M9 8.5h6v12a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" fill="#e9f4fb"/>
    <path d="M10 8.5V6h4v2.5z" fill="#3a7bd5"/><path d="M14 6h4.5l.8 2.2h-5.3z" fill="#3a7bd5"/><path d="M10 6V4h3v2" fill="#2c5ea6"/>
    <path d="M9 12h6v6H9z" fill="#3a7bd5"/><path d="M12 13.2v3.6M10.2 15h3.6" stroke="#fff" stroke-width="1.3"/>`,
  // Phosphat: Düngersack mit grünem Blatt
  phosphate: `<path d="M6.5 6c1.6 1 9.4 1 11 0l1.6 13a2 2 0 0 1-2 2.3H6.9a2 2 0 0 1-2-2.3z" fill="#dcc48d"/>
    <path d="M6.5 6c1.6 1 9.4 1 11 0l-.3-1.8c-1.6.7-8.8.7-10.4 0z" fill="#c4a96c"/>
    <path d="M12 18.5c-3-1-4-4-2.5-7 3.2.3 5 2.5 4.6 5.7" fill="#5aa34a"/><path d="M12 18.5c0-2.4-.8-4.2-2.3-5.6" stroke-width="1" fill="none"/>
    <path d="M15.3 9.5l.8 9" stroke="#000" stroke-width="1" opacity=".15"/>`,
};

/** Farbiges Icon als SVG-Text, oder null, wenn es keins gibt. */
export function colorIcon(name: string, size = 22): string | null {
  const body = COLOR_ICONS[name];
  if (!body) return null;
  return `<svg class="cicon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#2a1d14" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
