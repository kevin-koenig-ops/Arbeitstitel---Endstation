# Fahrplan

## ✅ Iteration 1: Prototyp (dieser Stand)

Logo, Hauptmenü, Einstellungen, Charaktererstellung, Endzeit-Karte (echt + Demo-Dorf), GPS + Simulation, Fundstellen (überall + echte Orte), Durchsuchen mit Abklingzeit, Bus-Ausbau, Erinnerungsstücke, Rückkehr-Bonus, lokales Speichern.

**Jetzt wichtig: draußen testen.**
- Wie fühlt sich die Dichte der Fundstellen an? Zu viele, zu wenige?
- Passt der Suchradius von 45 m zur GPS-Genauigkeit?
- Wird die echte Karte schön dargestellt? Fehlen Ebenen oder sieht etwas komisch aus?
- Wie lange hält der Akku?

## Iteration 2: Überlebende (das Herzstück)

- Überlebende finden (seltenes Ereignis an Fundstellen oder durch Funksignale)
- Jede Figur mit Name, kurzer Geschichte, Fähigkeit, Bedürfnissen
- Versorgen statt Pflicht: Wer gut versorgt ist, hilft mehr; niemand stirbt, wenn man mal nicht spielt
- Erste Story-Kapitel, die an Erinnerungsstücke anknüpfen
- Sanitätsecke bekommt ihre Funktion

## Iteration 3: Feinschliff & App-Gefühl

- Offline-Modus (Service Worker), Karte für die Umgebung zwischenspeichern
- Mehr Endzeit-Details auf der Karte (Autowracks auf Straßen, Brandflecken, überwucherte Flächen)
- Soundeffekte (optional), bessere Animationen
- Echtes Logo und Grafiken einbauen
- Landschaftsabhängige Fundstellen (im Wald eher Hochsitze, im Feld eher Scheunen)

## Iteration 4: Konten

- Google-Login (Supabase oder Firebase, EU-Region)
- Gast-Spielstand ins Konto übernehmen
- Spielstand auf mehreren Geräten

## Iteration 5: Gemeinschaft

- Server mit denselben Spielregeln (`src/core`), `RemoteBackend`
- Spuren anderer Spieler: Notizen, Vorratskisten, Warnschilder
- Funknetz: Tauschen über Entfernung, Pakete brauchen echte Stunden
- Stadt-Land-Austausch

## Später vielleicht

- Native App (z. B. über Capacitor) für App Store / Play Store
- Smartwatch-Anzeige, Push-Nachrichten für Versorgungsabwürfe
- Saison-Events
