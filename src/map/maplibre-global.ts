// Nur für den Vorschau-Build: MapLibre kommt dort als <script> vom CDN und liegt
// global auf window.maplibregl. Im normalen Build wird stattdessen das npm-Paket
// gebündelt (siehe vite.config.ts).
const maplibregl = (globalThis as unknown as { maplibregl: typeof import('maplibre-gl') }).maplibregl;
export default maplibregl;
