// Passt das von Capacitor erzeugte Android-Projekt an Endstation an.
// Läuft auf GitHub nach `npx cap add android` (siehe .github/workflows/apk.yml).
//
//  - eigenes Icon und Startbild (aus native/android/res)
//  - Standort-Rechte für das GPS
//  - immer Querformat
//  - Versionsnummer, damit neue APKs die alte App einfach aktualisieren
//
// Aufruf: node scripts/android-prepare.mjs [Build-Nummer]

import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APP = join(ROOT, 'android/app');
const RES = join(APP, 'src/main/res');
const build = Math.max(1, Number(process.argv[2] ?? process.env.APP_BUILD ?? 1) || 1);
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

if (!existsSync(RES)) {
  console.error('Kein Android-Projekt gefunden. Erst `npx cap add android` ausführen.');
  process.exit(1);
}

/** Ersetzt genau eine Stelle und bricht ab, wenn sie fehlt (Vorlage hat sich geändert). */
function patch(file, find, replace) {
  const text = readFileSync(file, 'utf8');
  if (text.includes(replace)) return;
  if (!text.includes(find)) throw new Error(`Stelle nicht gefunden in ${file}: ${find}`);
  writeFileSync(file, text.replace(find, replace));
}

// 1. Capacitor-Startbilder entfernen (sonst gibt es splash.png und splash.xml doppelt)
for (const dir of readdirSync(RES)) {
  if (dir.startsWith('drawable')) rmSync(join(RES, dir, 'splash.png'), { force: true });
}

// 2. Eigene Icons, Farben und Startbild darüberkopieren
cpSync(join(ROOT, 'native/android/res'), RES, { recursive: true });

// 3. Rechte: Standort (fürs GPS) und Querformat
const manifest = join(APP, 'src/main/AndroidManifest.xml');
patch(
  manifest,
  '<uses-permission android:name="android.permission.INTERNET" />',
  [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />',
  ].join('\n'),
);
patch(manifest, 'android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"');

// 4. Dunkler Hintergrund beim Start (Android 12 und neuer)
patch(
  join(RES, 'values/styles.xml'),
  '<item name="android:background">@drawable/splash</item>',
  '<item name="android:background">@drawable/splash</item>\n        <item name="windowSplashScreenBackground">#12110F</item>',
);

// 5. Versionsnummer: jede neue APK hat eine höhere Nummer
const gradle = join(APP, 'build.gradle');
const g = readFileSync(gradle, 'utf8');
writeFileSync(gradle, g.replace(/versionCode \d+/, `versionCode ${build}`).replace(/versionName "[^"]*"/, `versionName "${version}-${build}"`));

console.log(`Android-Projekt angepasst (Version ${version}-${build}).`);
