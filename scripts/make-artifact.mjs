// Macht aus dem Vorschau-Build (dist-preview/index.html) eine HTML-Datei ohne
// eigenes <html>/<head>/<body>-Gerüst, wie sie die Claude-Vorschau erwartet.

import { readFileSync, writeFileSync } from 'node:fs';

const src = new URL('../dist-preview/index.html', import.meta.url);
const html = readFileSync(src, 'utf8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
const body = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';

const keep = head
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<meta name="(apple-mobile-web-app-capable|mobile-web-app-capable|theme-color)"[^>]*>\s*/gi, '');

// <title> zuerst, Module-Skripte ans Ende (nach #app)
const title = /<title>[\s\S]*?<\/title>/i.exec(keep)?.[0] ?? '<title>Projekt Heimweg</title>';
const rest = keep.replace(title, '');
const moduleScripts = [...rest.matchAll(/<script type="module"[\s\S]*?<\/script>/gi)].map((m) => m[0]);
const headWithoutModules = moduleScripts.reduce((s, m) => s.replace(m, ''), rest);

const out = `${title}\n${headWithoutModules.trim()}\n${body.trim()}\n${moduleScripts.join('\n')}\n`;
const dest = new URL('../dist-preview/heimweg-vorschau.html', import.meta.url);
writeFileSync(dest, out);
console.log(`Vorschau: ${(out.length / 1024).toFixed(0)} KB -> dist-preview/heimweg-vorschau.html`);
