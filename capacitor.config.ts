import type { CapacitorConfig } from '@capacitor/cli';

// Android-App: Capacitor packt die fertige Web-App (dist/) in eine echte App.
// Gebaut wird sie auf GitHub (.github/workflows/apk.yml), nicht auf dem eigenen Rechner.
const config: CapacitorConfig = {
  // Eindeutige Kennung der App. Nie mehr ändern, sonst gilt sie als neue App
  // (deshalb steht hier noch der alte Arbeitstitel drin).
  appId: 'io.github.kevinkoenigops.endstation',
  appName: 'Home',
  webDir: 'dist',
  backgroundColor: '#12110f',
  android: {
    // Erlaubt das Untersuchen der App über chrome://inspect (nur für Testversionen nötig)
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    // Vollbild: Statusleiste und Navigationsleiste ausblenden (Wischen vom Rand holt sie kurz zurück)
    SystemBars: { hidden: true },
  },
};

export default config;
