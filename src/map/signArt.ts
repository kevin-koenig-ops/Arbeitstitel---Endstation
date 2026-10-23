// Schilder für die Wahrzeichen auf der Karte, auf eine Leinwand gemalt.
// Schlüssel: "TEXT|Hintergrund|Schrift" (Text-Schild, Seitenverhältnis wie SIGN_RATIO)
// oder "@A" (Apotheken-A), "@cross" (grünes Kreuz), "@H" (Haltestelle), "@fuel|Farbe" (Preismast),
// "@brezel", "@schwein", "@zahn" (runde Ausleger), "@eis", "@tafel" (Kundenstopper).

import { SIGN_RATIO } from './landmarks';

const FONT = "'Barlow Semi Condensed', 'Arial Narrow', 'Roboto Condensed', sans-serif";

/** Ein paar dunkle Flecken: alles hier ist ein paar Jahre nicht geputzt worden. */
function grime(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = (0.04 + rnd() * 0.12) * h;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(40, 30, 20, 0.22)');
    grad.addColorStop(1, 'rgba(40, 30, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function hash(s: string) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h + 1;
}

export function drawSign(key: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  if (key === '@A' || key === '@cross') {
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f6f4ef';
    g.fillRect(0, 0, 256, 256);
    if (key === '@A') {
      g.strokeStyle = '#c8102e';
      g.lineWidth = 14;
      g.strokeRect(14, 14, 228, 228);
      g.fillStyle = '#c8102e';
      g.font = "bold 200px Georgia, 'Times New Roman', serif";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('A', 128, 142);
    } else {
      g.fillStyle = '#1f9a4e';
      g.fillRect(96, 40, 64, 176);
      g.fillRect(40, 96, 176, 64);
    }
    grime(g, 256, 256, hash(key));
    return c;
  }
  if (key === '@clock') {
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.fillStyle = '#2b2620';
    g.fill();
    g.beginPath();
    g.arc(128, 128, 108, 0, Math.PI * 2);
    g.fillStyle = '#efe8d6';
    g.fill();
    g.fillStyle = '#2b2620';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillRect(128 + Math.sin(a) * 88 - 5, 128 - Math.cos(a) * 88 - 5, 10, 10);
    }
    // Stehengeblieben, irgendwann vor sieben Jahren
    g.strokeStyle = '#2b2620';
    g.lineCap = 'round';
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.sin(-1.1) * 52, 128 - Math.cos(-1.1) * 52);
    g.stroke();
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.sin(2.4) * 80, 128 - Math.cos(2.4) * 80);
    g.stroke();
    grime(g, 256, 256, hash(key));
    return c;
  }
  if (key === '@hosp') {
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1f4f9a';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.strokeRect(14, 14, 228, 228);
    g.fillStyle = '#ffffff';
    g.font = `800 170px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', 128, 138);
    grime(g, 256, 256, hash(key));
    return c;
  }
  // Ausleger-Schilder (rund) und Kundenstopper der Läden
  if (key === '@brezel' || key === '@schwein' || key === '@zahn') {
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const [ring, fill] = key === '@brezel' ? ['#c9a24a', '#2e4a32'] : key === '@schwein' ? ['#b8322a', '#f4efe6'] : ['#e8eef4', '#2f5f9a'];
    g.beginPath();
    g.arc(128, 128, 122, 0, Math.PI * 2);
    g.fillStyle = ring;
    g.fill();
    g.beginPath();
    g.arc(128, 128, 104, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (key === '@brezel') {
      // Brezel: zwei Schlaufen und gekreuzte Enden, goldbraun
      g.strokeStyle = '#d49a3a';
      g.lineWidth = 26;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(92, 180);
      g.bezierCurveTo(40, 150, 46, 70, 100, 70);
      g.bezierCurveTo(140, 70, 150, 120, 128, 140);
      g.bezierCurveTo(106, 120, 116, 70, 156, 70);
      g.bezierCurveTo(210, 70, 216, 150, 164, 180);
      g.stroke();
      g.beginPath();
      g.moveTo(128, 140);
      g.lineTo(96, 186);
      g.moveTo(128, 140);
      g.lineTo(160, 186);
      g.stroke();
      g.fillStyle = '#f6efe0';
      for (const [x, y] of [[80, 112], [118, 92], [150, 100], [182, 128], [100, 160], [160, 156]]) g.fillRect(x, y, 6, 4);
    } else if (key === '@schwein') {
      // Schwein im Profil: Körper, Kopf, Ohr, Rüssel, Beine
      g.fillStyle = '#e8a0a0';
      g.beginPath();
      g.ellipse(120, 136, 62, 40, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(184, 120, 28, 0, Math.PI * 2);
      g.fill();
      g.fillRect(204, 116, 18, 18);
      g.beginPath();
      g.moveTo(176, 96);
      g.lineTo(196, 78);
      g.lineTo(198, 104);
      g.fill();
      for (const x of [76, 100, 140, 160]) g.fillRect(x, 160, 14, 30);
      g.fillStyle = '#3a2a24';
      g.beginPath();
      g.arc(190, 112, 4, 0, Math.PI * 2);
      g.fill();
    } else {
      // Zahn
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(80, 92);
      g.bezierCurveTo(80, 50, 120, 60, 128, 72);
      g.bezierCurveTo(136, 60, 176, 50, 176, 92);
      g.bezierCurveTo(176, 130, 164, 150, 160, 196);
      g.bezierCurveTo(156, 210, 140, 206, 138, 190);
      g.lineTo(130, 156);
      g.lineTo(124, 156);
      g.lineTo(118, 190);
      g.bezierCurveTo(116, 206, 100, 210, 96, 196);
      g.bezierCurveTo(92, 150, 80, 130, 80, 92);
      g.fill();
    }
    grime(g, 256, 256, hash(key));
    return c;
  }
  if (key === '@eis' || key === '@tafel') {
    c.width = 200;
    c.height = 320;
    const g = c.getContext('2d')!;
    g.fillStyle = '#6a4a2e';
    g.fillRect(0, 0, 200, 320);
    if (key === '@eis') {
      g.fillStyle = '#f3ecdc';
      g.fillRect(14, 14, 172, 292);
      // Eistüte mit zwei Kugeln
      g.fillStyle = '#d9a45a';
      g.beginPath();
      g.moveTo(64, 170);
      g.lineTo(136, 170);
      g.lineTo(100, 280);
      g.fill();
      g.strokeStyle = '#b07a38';
      g.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(70 + i * 18, 172);
        g.lineTo(100, 270);
        g.stroke();
      }
      g.fillStyle = '#f2a8b8';
      g.beginPath();
      g.arc(80, 150, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#9ad0a0';
      g.beginPath();
      g.arc(120, 150, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f6e7c2';
      g.beginPath();
      g.arc(100, 112, 30, 0, Math.PI * 2);
      g.fill();
    } else {
      // Kreidetafel mit ein paar Zeilen, nicht zu lesen
      g.fillStyle = '#22302a';
      g.fillRect(14, 14, 172, 292);
      g.strokeStyle = 'rgba(240, 236, 226, 0.85)';
      g.lineCap = 'round';
      g.lineWidth = 7;
      let s = hash(key);
      const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let y = 60; y < 280; y += 42) {
        let x = 34;
        while (x < 160) {
          const w = 14 + rnd() * 30;
          g.beginPath();
          g.moveTo(x, y + rnd() * 4);
          g.lineTo(Math.min(166, x + w), y + rnd() * 4);
          g.stroke();
          x += w + 10;
        }
      }
    }
    grime(g, 200, 320, hash(key));
    return c;
  }
  if (key === '@H') {
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fillStyle = '#1f7a3e';
    g.fill();
    g.beginPath();
    g.arc(128, 128, 104, 0, Math.PI * 2);
    g.fillStyle = '#f2c230';
    g.fill();
    g.fillStyle = '#1f7a3e';
    g.font = `800 150px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', 128, 136);
    return c;
  }
  if (key.startsWith('@fuel')) {
    const accent = key.split('|')[1] ?? '#d23a2a';
    c.width = 256;
    c.height = 400;
    const g = c.getContext('2d')!;
    g.fillStyle = accent;
    g.fillRect(0, 0, 256, 400);
    // Zapfsäule als Bildzeichen
    g.fillStyle = '#ffffff';
    g.fillRect(84, 26, 64, 92);
    g.fillStyle = accent;
    g.fillRect(96, 38, 40, 26);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(148, 50);
    g.lineTo(172, 66);
    g.lineTo(172, 104);
    g.stroke();
    // Preistafel: leer, seit Jahren
    g.fillStyle = '#1b1c1e';
    g.fillRect(16, 140, 224, 240);
    g.font = `700 30px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const rows = ['SUPER', 'DIESEL', 'E10'];
    rows.forEach((label, i) => {
      const y = 180 + i * 74;
      g.fillStyle = '#d9d4c8';
      g.fillText(label, 30, y);
      g.fillStyle = '#ff9a2a';
      g.font = `700 44px ${FONT}`;
      g.fillText('-,--', 140, y + 2);
      g.font = `700 30px ${FONT}`;
    });
    grime(g, 256, 400, hash(key));
    return c;
  }
  // Text-Schild
  const [text, bg, fg] = key.split('|');
  const H = 128;
  const W = Math.round(H * SIGN_RATIO);
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = bg || '#f1e6cf';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, W - 8, H - 8);
  let fs = 92;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  do {
    g.font = `800 ${fs}px ${FONT}`;
    fs -= 4;
  } while (g.measureText(text).width > W * 0.88 && fs > 20);
  g.fillStyle = fg || '#222222';
  g.fillText(text, W / 2, H / 2 + 5);
  grime(g, W, H, hash(key));
  return c;
}
