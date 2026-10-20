# Fahrplan

## ✅ Iteration 1: Prototyp (dieser Stand)

Logo, Hauptmenü, Einstellungen, Charaktererstellung, Endzeit-Karte (echt + Demo-Dorf), GPS + Simulation, Fundstellen (überall + echte Orte), Durchsuchen mit Abklingzeit, Bus-Ausbau, Erinnerungsstücke, Rückkehr-Bonus, lokales Speichern.

**Jetzt wichtig: draußen testen.**
- Wie fühlt sich die Dichte der Fundstellen an? Zu viele, zu wenige?
- Passt der Suchradius von 45 m zur GPS-Genauigkeit?
- Wird die echte Karte schön dargestellt? Fehlen Ebenen oder sieht etwas komisch aus?
- Wie lange hält der Akku?

## ✅ Iteration 1b: Kartenoptik und Kampf

- 3D-Bäume, abwechslungsreiche Häuser, Autowracks, Strommasten, warmer Dunst, Tiefenunschärfe
- Bewachte Fundstellen, Rundenkampf mit Timing, Gesundheit, Waffen aus der Werkbank

**Draußen testen:** Fühlt sich der Kampf gut an? Mehr Action oder mehr Taktik? Sind die Gegner zu stark oder zu schwach?

## ✅ Iteration 1c: Karte freilaufen, Tageszeit, Wetter

- Kartennebel, dauerhaft aufgedeckte Wege, Sektoren mit Belohnungen
- Tag/Dämmerung/Nacht aus dem Sonnenstand, Nacht mit mehr Gefahr und mehr Beute
- Echtes Wetter mit Regen, Schnee, Nebel, Gewitter

## Iteration 2: Geschichte und Überlebende (Tiefe)

- Hauptziel „Fahrt zur Küste“: Bus-Teile an bestimmten echten Orten (Batterie, Reifen, Treibstoff …)
- Erinnerungsstücke als zusammenhängende Geschichten (Sets)
- Funkaufträge zu echten Orten in der Nähe

## Iteration 2b: Überlebende (das Herzstück)

- Überlebende finden (seltenes Ereignis an Fundstellen oder durch Funksignale)
- Jede Figur mit Name, kurzer Geschichte, Fähigkeit, Bedürfnissen
- Versorgen statt Pflicht: Wer gut versorgt ist, hilft mehr; niemand stirbt, wenn man mal nicht spielt
- Erste Story-Kapitel, die an Erinnerungsstücke anknüpfen
- Sanitätsecke bekommt ihre Funktion
- Überlebende kämpfen mit und bringen eigene Kampf-Aktionen mit (heilen, Falle stellen)

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

## Iteration 4b: Mehr Bedrohung

- Horden, die langsam durch echte Straßen ziehen (umgehen, durchschleichen oder kämpfen)
- Stammwege werden mit der Zeit gesichert
- Lärm beim Durchsuchen lockt Streuner an

## Iteration 5: Gemeinschaft

- Server mit denselben Spielregeln (`src/core`), `RemoteBackend`
- Spuren anderer Spieler: Notizen, Vorratskisten, Warnschilder
- Nester (befallene Supermärkte usw.) als Raids für mehrere Spieler
- Funknetz: Tauschen über Entfernung, Pakete brauchen echte Stunden
- Stadt-Land-Austausch

## Später vielleicht

- Native App (z. B. über Capacitor) für App Store / Play Store
- Smartwatch-Anzeige, Push-Nachrichten für Versorgungsabwürfe
- Saison-Events
