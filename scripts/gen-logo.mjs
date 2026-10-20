// Erzeugt das Platzhalter-Logo im Stil einer Bus-Zielanzeige (LED-Punktmatrix)
// und das App-Icon. Dein echtes Logo ersetzt später einfach src/assets/logo.svg.
//
// Aufruf: npm run gen:logo

import { writeFileSync } from 'node:fs';

const TITLE = 'ENDSTATION';
const LINE = '0';

// 5×7-Punktschrift
const F = {
  A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
  C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '],
  D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'],
  F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
  G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ####'],
  H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
  I: [' ### ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'],
  N: ['#   #', '#   #', '##  #', '# # #', '#  ##', '#   #', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
  R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
  S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #'],
  Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
  0: [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
};

function matrix(text) {
  const rows = Array.from({ length: 7 }, () => '');
  [...text].forEach((ch, i) => {
    const g = F[ch] ?? F[' '];
    for (let r = 0; r < 7; r++) rows[r] += (i ? ' ' : '') + g[r];
  });
  return rows;
}

function dots({ rows, cols, lit, pitch, ox, oy, r }) {
  let off = '';
  let on = '';
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const cx = (ox + x * pitch + pitch / 2).toFixed(1);
      const cy = (oy + y * pitch + pitch / 2).toFixed(1);
      if (lit(x, y)) on += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
      else off += `<circle cx="${cx}" cy="${cy}" r="${r * 0.82}"/>`;
    }
  return { off, on };
}

// --- Logo ---
{
  const line = matrix(LINE);
  const text = matrix(TITLE);
  const pad = 1;
  const lineCols = line[0].length;
  const gap = 4;
  const cols = pad + lineCols + gap + text[0].length + pad;
  const rows = 9;
  const pitch = 10;
  const frame = 22;
  const W = cols * pitch + frame * 2;
  const H = rows * pitch + frame * 2;
  const divider = pad + lineCols + 2;
  const lit = (x, y) => {
    const ry = y - 1;
    if (ry < 0 || ry > 6) return false;
    const lx = x - pad;
    if (lx >= 0 && lx < lineCols) return line[ry][lx] === '#';
    const tx = x - (pad + lineCols + gap);
    return tx >= 0 && tx < text[0].length && text[ry][tx] === '#';
  };
  const d = dots({ rows, cols, lit, pitch, ox: frame, oy: frame, r: 3.6 });
  const bolt = (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="#2c2a26" stroke="#11100e" stroke-width="1.5"/><path d="M${x - 2.5} ${y}h5" stroke="#11100e" stroke-width="1.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<title>${TITLE}</title>
<defs><filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter></defs>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="#1a1916" stroke="#3a362f" stroke-width="2"/>
<rect x="${frame - 8}" y="${frame - 8}" width="${W - frame * 2 + 16}" height="${H - frame * 2 + 16}" rx="5" fill="#0b0a09"/>
<g fill="#3a2a10">${d.off}</g>
<rect x="${frame + divider * pitch - 1}" y="${frame + 4}" width="2" height="${rows * pitch - 8}" fill="#2a2620"/>
<g fill="#ff9d1a" filter="url(#glow)" opacity="0.85">${d.on}</g>
<g fill="#ffc35a">${d.on}</g>
${bolt(9, 9)}${bolt(W - 9, 9)}${bolt(9, H - 9)}${bolt(W - 9, H - 9)}
</svg>`;
  writeFileSync(new URL('../src/assets/logo.svg', import.meta.url), svg);
  console.log(`logo.svg ${W}×${H}`);
}

// --- App-Icon ---
{
  const g = F.E;
  const cols = 9;
  const rows = 11;
  const pitch = 40;
  const S = 512;
  const ox = (S - cols * pitch) / 2;
  const oy = (S - rows * pitch) / 2;
  const lit = (x, y) => y >= 2 && y < 9 && x >= 2 && x < 7 && g[y - 2][x - 2] === '#';
  const d = dots({ rows, cols, lit, pitch, ox, oy, r: 14 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs><filter id="glow"><feGaussianBlur stdDeviation="12"/></filter></defs>
<rect width="${S}" height="${S}" rx="96" fill="#12110f"/>
<g fill="#3a2a10">${d.off}</g>
<g fill="#ff9d1a" filter="url(#glow)" opacity="0.8">${d.on}</g>
<g fill="#ffc35a">${d.on}</g>
</svg>`;
  writeFileSync(new URL('../public/icon.svg', import.meta.url), svg);
  console.log('icon.svg');
}
