# Endstation (Arbeitstitel)

Ein Endzeit-Erkundungsspiel auf der echten Karte. Du gehst draußen herum, findest Vorräte an echten Orten und baust deinen alten Bus zum Zuhause aus. Kein Zwang, kein Stress: Wer eine Pause macht, verliert nichts.

**Stand:** Prototyp 0.1 (Einzelspieler, läuft im Handy-Browser)

## Was schon geht

- Startbildschirm mit Platzhalter-Logo, Hauptmenü, Einstellungen
- Charaktererstellung: Name, Frisur, Hautton, Jacke, Vorgeschichte (mit kleinem Vorteil)
- Echte Karte (OpenStreetMap) im Endzeit-Stil, alternativ das fiktive Demo-Dorf „Altenbrück“
- GPS-Standort oder Simulation (Tippen auf die Karte = hinlaufen)
- Fundstellen überall (Autos, Rucksäcke, Gartenlauben …) und an echten Orten (Supermarkt, Apotheke, Baumarkt, Tankstelle, Brunnen, Bushaltestelle)
- Durchsuchen, wenn man nah genug dran ist; Abklingzeit pro Fundstelle
- Bus-Ausbau (Regenfass, Werkbank, Dachgarten, Sanitätsecke, Funkgerät) mit passiver Produktion
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

## Eigenes Logo einbauen

Datei `src/assets/logo.svg` ersetzen (gern auch als PNG, dann den Import in `src/ui/screens/splash.ts` und `menu.ts` anpassen). App-Icons liegen in `public/`.

## Projektaufbau

```
src/
  core/        Reine Spiellogik, ohne Browser. Läuft später unverändert auf dem Server.
  services/    Austauschbare Dienste: Backend, Login, Standort, Speicher, Einstellungen
  map/         Karte, Endzeit-Kartenstil, Demo-Dorf
  ui/          Bildschirme und Bedienelemente
docs/          Konzept, Architektur, Fahrplan
scripts/       Generatoren für Demo-Dorf und Platzhalter-Logo
tests/         Tests der Spiellogik
```

Mehr dazu in [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), das Spielkonzept in [docs/KONZEPT.md](docs/KONZEPT.md), die nächsten Schritte in [docs/ROADMAP.md](docs/ROADMAP.md).

## Daten & Lizenzen

- Kartendaten © OpenStreetMap-Mitwirkende (ODbL), Kacheln von [OpenFreeMap](https://openfreemap.org) (kostenlos, ohne API-Schlüssel)
- Kartendarstellung mit [MapLibre GL JS](https://maplibre.org) (BSD-3)
- Schriften: Doto, Barlow Semi Condensed, Covered By Your Grace (SIL Open Font License), liegen im Projekt, kein Google-Server
