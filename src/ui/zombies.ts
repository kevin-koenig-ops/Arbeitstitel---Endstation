// Gegner-Grafiken als flache SVG-Figuren (Frontansicht), passend zum restlichen Look.

import type { EnemyId } from '../core/types';

const SKIN = '#8a9670';
const SKIN_DARK = '#76815e';
const EYE = '#f4e7b0';
const SOCKET = '#26261f';
const MOUTH = '#2a1d18';

function head(cx: number, cy: number, tilt: number, extra = '') {
  return `<g transform="rotate(${tilt} ${cx} ${cy})">
    <ellipse cx="${cx}" cy="${cy}" rx="24" ry="28" fill="${SKIN}"/>
    <path d="M${cx - 24} ${cy + 2}q4 22 24 26q-14-8-24-26z" fill="${SKIN_DARK}"/>
    <ellipse cx="${cx - 10}" cy="${cy - 4}" rx="6.5" ry="5.5" fill="${SOCKET}"/>
    <ellipse cx="${cx + 11}" cy="${cy - 5}" rx="6" ry="5" fill="${SOCKET}"/>
    <circle class="eye" cx="${cx - 9}" cy="${cy - 4}" r="2" fill="${EYE}"/>
    <circle class="eye" cx="${cx + 12}" cy="${cy - 5}" r="1.8" fill="${EYE}"/>
    <path d="M${cx - 11} ${cy + 13}q11 7 22 0l-2 8q-9 5-18 0z" fill="${MOUTH}"/>
    <path d="M${cx - 7} ${cy + 15}v3M${cx - 2} ${cy + 16}v3M${cx + 3} ${cy + 16}v3M${cx + 7} ${cy + 15}v3" stroke="#cfc6a8" stroke-width="1.6"/>
    ${extra}
  </g>`;
}

function hand(x: number, y: number, dir: number) {
  return `<path d="M${x} ${y}l${8 * dir} -6M${x} ${y}l${10 * dir} 0M${x} ${y}l${8 * dir} 6" stroke="${SKIN}" stroke-width="4" stroke-linecap="round"/>`;
}

const SHADOW = '<ellipse cx="100" cy="228" rx="60" ry="9" fill="#000" opacity=".4"/>';

const ART: Record<EnemyId, string> = {
  walker: `${SHADOW}
  <g transform="rotate(-5 100 150)">
    <path d="M80 150L72 222h15l9-62z" fill="#33363d"/>
    <path d="M104 158l8 64h15l-9-72z" fill="#2c2f35"/>
    <path d="M68 92Q100 80 134 90l-2 72-8-6-6 10-8-9-9 11-8-12-8 10-7-11-8 7z" fill="#59606b"/>
    <path d="M100 92v40" stroke="#4a505a" stroke-width="2"/>
    <path d="M108 116q9 6 5 17q-6-4-11 2q-2-11 6-19z" fill="#6e3b2c" opacity=".75"/>
    <path d="M72 97L46 122l-8 12" stroke="${SKIN}" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="M72 95L58 110" stroke="#59606b" stroke-width="15" stroke-linecap="round"/>
    ${hand(37, 135, -1)}
    <path d="M131 95l27 17 12-3" stroke="${SKIN}" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="M131 93l12 8" stroke="#59606b" stroke-width="15" stroke-linecap="round"/>
    ${hand(171, 108, 1)}
    <rect x="93" y="70" width="14" height="18" fill="${SKIN_DARK}"/>
    ${head(100, 52, 12, '<path d="M78 40q8-22 30-18q12 4 14 18q-6-8-14-6q-14-4-30 6z" fill="#3a332b"/>')}
  </g>`,

  brute: `${SHADOW}
  <g transform="rotate(3 100 150)">
    <path d="M70 156l-8 68h20l10-64z" fill="#2f3138"/>
    <path d="M108 160l8 64h20l-8-70z" fill="#292b31"/>
    <path d="M48 92Q100 70 152 92l-4 76H52z" fill="#4c5058"/>
    <path d="M56 92q20-8 30-8l-4 84H54zM144 92q-20-8-30-8l4 84h28z" fill="#c4772e"/>
    <path d="M55 132h31M114 132h32M55 146h30M115 146h31" stroke="#ddd5bb" stroke-width="5"/>
    <path d="M52 98L30 130l-6 22" stroke="${SKIN}" stroke-width="16" stroke-linecap="round" fill="none"/>
    <path d="M52 96L40 112" stroke="#c4772e" stroke-width="18" stroke-linecap="round"/>
    ${hand(22, 155, -1)}
    <path d="M148 98l22 30 6 22" stroke="${SKIN}" stroke-width="16" stroke-linecap="round" fill="none"/>
    <path d="M148 96l12 16" stroke="#c4772e" stroke-width="18" stroke-linecap="round"/>
    ${hand(178, 153, 1)}
    <rect x="90" y="68" width="20" height="18" fill="${SKIN_DARK}"/>
    ${head(100, 50, -6, '<path d="M74 40q2-26 26-26t26 26z" fill="#c9a23a"/><rect x="70" y="37" width="60" height="6" rx="3" fill="#b08a2c"/>')}
  </g>`,

  crawler: `<ellipse cx="100" cy="226" rx="78" ry="10" fill="#000" opacity=".4"/>
  <path d="M52 214Q100 120 148 214z" fill="#555c66"/>
  <path d="M60 212l10-14 8 12 8-16 9 14 9-18 8 16 9-14 8 12 9-10 6 18z" fill="#4a505a"/>
  <path d="M64 190L36 206l-12 18" stroke="${SKIN}" stroke-width="10" stroke-linecap="round" fill="none"/>
  ${hand(22, 226, -1)}
  <path d="M136 190l28 16 12 18" stroke="${SKIN}" stroke-width="10" stroke-linecap="round" fill="none"/>
  ${hand(178, 226, 1)}
  ${head(100, 178, 0, '<path d="M80 166q6-18 24-16q12 2 16 14q-8-6-16-4q-14-2-24 6z" fill="#3a332b"/>')}`,
};

export function enemySvg(id: EnemyId): string {
  return `<svg viewBox="0 0 200 240" class="enemy-art enemy-${id}" aria-hidden="true">${ART[id]}</svg>`;
}
