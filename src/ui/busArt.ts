// Seitenansicht des Busses. Gebaute Module sind sichtbar, offene nur als Schatten.

import type { ModuleId } from '../core/types';

export function busSvg(built: Partial<Record<ModuleId, unknown>>): string {
  const cls = (id: ModuleId) => `mod${built[id] ? '' : ' ghost'}`;
  const windows = [56, 101, 146, 191, 236]
    .map((x, i) =>
      i === 2
        ? ''
        : `<rect x="${x}" y="72" width="38" height="34" rx="3" fill="#1b1a17"/>` +
          (i === 1 ? `<path d="M${x + 6} 74l10 14-4 6 9 10" stroke="#3a3833" stroke-width="1.2" fill="none"/>` : '') +
          `<rect x="${x + 2}" y="74" width="12" height="4" rx="1" fill="#2c2b27"/>`,
    )
    .join('');

  return `<svg viewBox="0 0 380 180" class="bus-art" role="img" aria-label="Dein Bus">
  <ellipse cx="190" cy="166" rx="170" ry="8" fill="#0d0c0b"/>

  <g class="${cls('roofGarden')}">
    <rect x="62" y="50" width="34" height="12" rx="1" fill="#5b4632"/>
    <rect x="102" y="50" width="34" height="12" rx="1" fill="#5b4632"/>
    <rect x="142" y="50" width="34" height="12" rx="1" fill="#5b4632"/>
    <g fill="#6f8a45">
      <circle cx="70" cy="48" r="6"/><circle cx="82" cy="45" r="7"/><circle cx="91" cy="49" r="5"/>
      <circle cx="110" cy="47" r="6"/><circle cx="122" cy="43" r="8"/><circle cx="131" cy="48" r="5"/>
      <circle cx="150" cy="47" r="6"/><circle cx="160" cy="44" r="6"/><circle cx="170" cy="48" r="5"/>
    </g>
    <g fill="#8fa75a"><circle cx="80" cy="42" r="2.5"/><circle cx="121" cy="39" r="3"/><circle cx="159" cy="41" r="2.5"/></g>
  </g>

  <g class="${cls('workbench')}">
    <path d="M190 62v-10h80v10" stroke="#3b3934" stroke-width="2.5" fill="none"/>
    <rect x="194" y="44" width="58" height="5" fill="#8a6a45"/>
    <rect x="198" y="39" width="50" height="5" fill="#9c7a50"/>
    <rect x="254" y="40" width="14" height="10" rx="1.5" fill="#9b3d27"/>
    <rect x="258" y="37" width="6" height="3" rx="1" fill="#9b3d27"/>
  </g>

  <g class="${cls('radio')}">
    <path d="M318 62V12M310 24h16M312 36h12" stroke="#5a5750" stroke-width="2" fill="none"/>
    <path d="M300 30a14 14 0 0 1 10-12" stroke="#5a5750" stroke-width="2" fill="none"/>
    <circle cx="318" cy="10" r="2.5" fill="#ffb22e"/>
  </g>

  <g class="${cls('rainBarrel')}">
    <path d="M44 66h-10v62" stroke="#4a4f52" stroke-width="3" fill="none"/>
    <path d="M14 126c-2 10-2 22 0 32h28c2-10 2-22 0-32z" fill="#4f5a62"/>
    <path d="M13 136h30M13 148h30" stroke="#3a4248" stroke-width="2"/>
    <ellipse cx="28" cy="126" rx="14" ry="3" fill="#5f6b73"/>
  </g>

  <rect x="40" y="62" width="300" height="88" rx="10" fill="#a99d7d"/>
  <rect x="40" y="110" width="300" height="40" rx="0" fill="#7a6d55"/>
  <rect x="40" y="106" width="300" height="5" fill="#8f4b2b"/>
  <path d="M40 140h300v2a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8z" fill="#6a5e48"/>
  ${windows}
  <g class="${cls('medBay')}">
    <rect x="146" y="72" width="38" height="34" rx="3" fill="#d8d0bd"/>
    <path d="M165 78v22M154 89h22" stroke="#a63a2a" stroke-width="7"/>
  </g>
  <rect x="146" y="72" width="38" height="34" rx="3" fill="none" stroke="#2a2925" stroke-width="1"/>
  <rect x="284" y="72" width="28" height="74" rx="2" fill="#24231f"/>
  <path d="M298 72v74" stroke="#3a3833" stroke-width="1.5"/>
  <path d="M316 72h18a6 6 0 0 1 6 6v28h-24z" fill="#1b1a17"/>
  <rect x="282" y="63.5" width="56" height="8" rx="1" fill="#0b0a09"/>
  <text x="310" y="69.6" text-anchor="middle" font-family="Doto, monospace" font-weight="900" font-size="5.4" letter-spacing=".2" fill="#ffb22e">0 ENDSTATION</text>
  <ellipse cx="88" cy="128" rx="18" ry="9" fill="#5e4430" opacity=".55"/>
  <ellipse cx="248" cy="132" rx="12" ry="6" fill="#5e4430" opacity=".5"/>
  <path d="M70 150a25 25 0 0 1 50 0z" fill="#1a1916"/>
  <path d="M260 150a25 25 0 0 1 50 0z" fill="#1a1916"/>
  <g fill="#121110"><circle cx="95" cy="150" r="17"/><circle cx="285" cy="150" r="17"/></g>
  <g fill="#4a4741"><circle cx="95" cy="150" r="6"/><circle cx="285" cy="150" r="6"/></g>
  <rect x="334" y="122" width="8" height="6" rx="1" fill="#ffd27a" opacity=".85"/>
</svg>`;
}
