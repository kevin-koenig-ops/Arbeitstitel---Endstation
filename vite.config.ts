/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// Zwei Ziele aus demselben Code:
//  - normal (`npm run build`): echte Web-App für GitHub Pages, MapLibre gebündelt.
//  - preview (`npm run build:preview`): eine einzige HTML-Datei für die Vorschau,
//    MapLibre kommt per CDN-Skript (die Vorschau erlaubt keine anderen Server).
const MAPLIBRE_CDN = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js';

function previewHtml(): Plugin {
  return {
    name: 'endstation-preview-html',
    transformIndexHtml(html) {
      return html
        .replace(/<link rel="manifest"[^>]*>\s*/, '')
        .replace(/<link rel="icon"[^>]*>\s*/, '')
        .replace('<!--maplibre-cdn-->', `<script src="${MAPLIBRE_CDN}"></script>`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const preview = mode === 'preview';
  return {
    base: './',
    plugins: preview ? [previewHtml(), viteSingleFile()] : [],
    resolve: {
      alias: preview
        ? [{ find: /^maplibre-gl$/, replacement: fileURLToPath(new URL('./src/map/maplibre-global.ts', import.meta.url)) }]
        : [],
    },
    build: {
      outDir: preview ? 'dist-preview' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
    },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
