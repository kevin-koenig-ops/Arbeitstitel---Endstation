# Home

Ein Endzeit-Erkundungsspiel auf der echten Karte. Tagsüber gehst du draußen herum, findest Vorräte und Baupläne an echten Orten. Abends baust du dein Zuhause aus: ein eigenes Gelände in 3D, das du Stück für Stück zurückeroberst. Kein Zwang, kein Stress: Wer eine Pause macht, verliert nichts.

**Stand:** Prototyp 0.1 (Einzelspieler, läuft im Handy-Browser und als Android-App)

## Was schon geht

- Startbild mit bewegtem Nebel und Niesel, „Zum Starten berühren“, Anmelden (Gast; Google und Apple als Platzhalter), Hauptmenü, Einstellungen
- Charaktererstellung: Name, Frisur, Hautton, Jacke, Vorgeschichte (mit kleinem Vorteil)
- Echte Karte (OpenStreetMap) im Endzeit-Stil, alternativ das fiktive Demo-Dorf „Altenbrück“
- GPS-Standort oder Simulation (Tippen auf die Karte = hinlaufen)
- Fundstellen überall (Autos, Rucksäcke, Gartenlauben …) und an echten Orten (Supermarkt, Apotheke, Baumarkt, Tankstelle, Brunnen, Bushaltestelle)
- Durchsuchen, wenn man nah genug dran ist; Abklingzeit pro Fundstelle
- Rucksack unterwegs, Lager zu Hause; Kram zum Zerlegen (Inhalt sichtbar), Sammelstücke fürs Fundbuch mit vier Sets
- Werktisch mit echten Wartezeiten, Anlagen mit eigener Produktion (Regentonne, Hochbeet)
- Kartennebel zum Freilaufen, Sektoren, echte Tageszeit und echtes Wetter
- Bewachte Fundstellen, Rundenkampf mit Timing, Waffen
- **Zuhause:** eigener Ort (bleibt auf dem Gerät), fünf Schauplätze mit eigener Umgebung, großes Gelände zum Zurückerobern, frei bauen (Wände, Türen, Fenster, Böden, Dächer), 36 Möbel, Räume, Gemütlichkeit, echtes Wetter
- **Low-Poly-Spielfigur** bei der Charaktererstellung, auf der Karte und in der Basis
- 12 Erinnerungsstücke zum Sammeln
- Rückkehr-Bonus nach einer Pause, Vibration bei Fundstellen in Reichweite
- Spielstand wird automatisch auf dem Gerät gespeichert

## Loslegen

```bash
npm install
npm run dev        # Entwicklungsserver, im WLAN auch vom Handy erreichbar
npm test           # Tests der Spiellogik
npm run build      # fertige Web-App nach dist/
```

Für GPS auf dem Handy braucht der Browser **HTTPS**. Am einfachsten über GitHub Pages (siehe unten). Zum Testen am Rechner: in den Einstellungen „Simulation“ wählen.

## Auf GitHub Pages veröffentlichen

1. Repo auf GitHub anlegen und den Code pushen.
2. Im Repo: **Settings → Pages → Source: GitHub Actions**.
3. Jeder Push auf `main` baut und veröffentlicht die App automatisch (`.github/workflows/deploy.yml`).
4. Die Adresse auf dem Handy öffnen und über „Zum Startbildschirm hinzufügen“ wie eine App installieren.

## Android-App

GitHub baut bei jedem Push eine APK zum Selbst-Installieren (`.github/workflows/apk.yml`). Download aufs Handy: [neueste APK](https://github.com/kevin-koenig-ops/Arbeitstitel---Endstation/releases/latest/download/endstation.apk).

## Eigenes Logo einbauen

Das Platzhalter-Logo ist Schrift und steht in `src/ui/logo.ts`; ein echtes Logo ersetzt nur diese Funktion. App-Icons liegen in `public/` (und für Android in `native/android/res`).

## Projektaufbau

```
src/
  core/        Reine Spiellogik, ohne Browser. Läuft später unverändert auf dem Server.
  services/    Austauschbare Dienste: Backend, Login, Standort, Speicher, Einstellungen
  map/         Karte, Endzeit-Kartenstil, Demo-Dorf
  base/        3D-Zuhause (three.js): Gelände, Möbel, Spielfigur, Kampf
  ui/          Bildschirme und Bedienelemente
docs/          Konzept, Architektur, Fahrplan
scripts/       Demo-Dorf-Generator, Android-Vorbereitung
tests/         Tests der Spiellogik
```

Mehr dazu in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), das Spielkonzept in [docs/KONZEPT.md](docs/KONZEPT.md), die nächsten Schritte in [docs/ROADMAP.md](docs/ROADMAP.md).

## Daten & Lizenzen

- Kartendaten © OpenStreetMap-Mitwirkende (ODbL), Kacheln von [OpenFreeMap](https://openfreemap.org) (kostenlos, ohne API-Schlüssel)
- Kartendarstellung mit [MapLibre GL JS](https://maplibre.org) (BSD-3)
- 3D-Zuhause mit [three.js](https://threejs.org) (MIT)
- Schriften: Barlow Semi Condensed, Covered By Your Grace (SIL Open Font License), liegen im Projekt, kein Google-Server
