// Fonts liegen im Projekt (kein Google-Server, DSGVO-freundlich).
import '@fontsource/barlow-semi-condensed/latin-400.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-800.css';
import '@fontsource/covered-by-your-grace/latin-400.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createApp } from './ui/app';

void createApp(document.getElementById('app')!);
