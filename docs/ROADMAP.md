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

## ✅ Iteration 1d: Die Endstation (Basisbau)

- Eigenen Ort festlegen (bleibt nur auf dem Gerät), bauen nur vor Ort
- 3D-Wartehalle mit Schutt, 20 Möbel- und Deko-Teile, Gemütlichkeit mit Stufen
- Baupläne an passenden Fundstellen, Licht nach echter Tageszeit

**Zu Hause testen:** Macht das Einrichten abends Spaß? Welche Teile fehlen? Ist die Halle zu klein oder zu groß?

## ✅ Iteration 1e: Großer Basisbau und Spielfigur

- Schauplätze: Busdepot, Bauernhof, Seeufer zum Start, Tankstelle und Schrebergarten als Lagepläne, jeweils mit eigener Umgebung
- Gelände 36 × 36 m, Abschnitte zurückerobern, Hindernisse wegräumen
- Frei bauen: Wände, Zäune, Türen, Fenster, Durchgänge, Böden, Dächer, Abreißen mit voller Rückgabe
- Räume mit Dach erkennen (Bonus-Gemütlichkeit), 36 Möbel, Wand-Deko
- Kamera: ein Finger schiebt, zwei zoomen, Drehen nur per Knopf
- Low-Poly-Spielfigur bei der Erstellung, auf der Karte und in der Basis (läuft per Antippen)
- Echtes Wetter auch in der Basis

**Zu Hause testen:** Wie fühlt sich das Bauen am Handy an? Ist das Gelände zu groß, zu klein? Welche Teile fehlen?

## Iteration 1f: Werkstätten und Wetter (als Nächstes)

- Möbel werden zu Werkstätten mit echten Wartezeiten: Werktisch, Holzofen, Lagerfeuer, Hochbeet, Apfelbaum
- Regentonne füllt sich bei echtem Regen, Solarpaneel bei Sonne, Windrad bei Wind
- Bus-Ausbauten und Basis zusammenführen
- Gemütlichkeit wirkt sich aus (z. B. schnellere Erholung)

## Iteration 2: Geschichte und Überlebende (Tiefe)

- Endziel „Die Linie 0 fährt wieder“: Bus-Teile an bestimmten echten Orten (Batterie, Reifen, Treibstoff …), am Ende die Fahrt zur Küste
- Erinnerungsstücke als zusammenhängende Geschichten (Sets)
- Funkaufträge zu echten Orten in der Nähe

## Iteration 2b: Überlebende (das Herzstück)

- Überlebende finden (seltenes Ereignis an Fundstellen oder durch Funksignale)
- Jede Figur mit Name, kurzer Geschichte, Fähigkeit, Bedürfnissen; sie wohnen sichtbar in der Endstation und wünschen sich bestimmte Möbel
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

## Vor einem öffentlichen Start (wichtig)

- **Sensible Orte ausschließen:** keine Fundstellen auf Friedhöfen, Gedenkstätten, Krankenhäusern, Schulen, Kitas und Privatgrundstücken (OSM-Flächen prüfen, Abstand halten). Pokémon Go hatte genau damit Ärger.
- **Kämpfe nur im Stehen:** Wer läuft, dessen Kampf pausiert (GPS-Geschwindigkeit). Niemand soll sich beim Spielen verletzen.

## Ideen-Sammlung für später

**Basis und Zuhause**
- Werkstätten mit echten Wartezeiten: Werktisch (Waffen ausbessern, Teile bauen), Ofen/Lagerfeuer (Eintopf), Hochbeet und Apfelbaum wachsen über Stunden. Fertiges wartet, nichts verdirbt.
- Wetter treibt die Basis an: Regentonne füllt sich bei echtem Regen, Solarpaneele erzeugen Strom bei Sonne, ein Windrad treibt die Werkbank bei Wind, bei Gewitter selten ein Blitz-Bauplan, Frost als Bonus (Eisblöcke, Kühlkeller), nachts macht das Lagerfeuer drinnen Stimmung.
- Die Basis erzählt die Abenteuer: Trophäen von harten Kämpfen, seltene Funde an der Wand, gerettete Überlebende wohnen dort.
- Heimkehr als Ritual: Musik wechselt, Licht wird warm, Beute wird ausgepackt.
- Haustiere, die mitlaufen und in der Basis leben.
- Basen besuchen (nur virtuell, über Freundesliste oder Code, nie mit echtem Ort).
- Grundsatz: Die Welt draußen ist gefährlich, die Basis nie. Keine Angriffe auf die Basis.

**Draußen**
- Rucksack mit Risiko: Beute ist erst sicher, wenn sie in der Basis ist. Eine Niederlage kostet einen Teil davon, nie alles.
- Jagd: zufällige Tiere auf der Karte, manchmal seltene.
- Echte Orte werden Spielorte: Supermarkt = Vorratslager, Apotheke = Medizin, Baumarkt = Baumaterial, Tankstelle = Treibstoff, Parks und Wälder = Holz und Kräuter, Gewässer = Wasser und Fische, Funkmasten fangen Signale (Quests), Bahnhöfe = Handelsposten mit wandernden Händlern.
- Zeit und Natur: Vollmond macht Mutanten stärker (seltenere Beute), Jahreszeiten (Pilze im Herbst, Schnee im Winter), echte Feiertage als Events (z. B. Halloween).
- Bewegung: Funkgerät entschlüsselt Nachrichten erst nach gelaufenen Kilometern, Aussichtspunkte und Anhöhen decken größere Bereiche auf.
- Quests aus der echten Welt mit echten Straßennamen („Bring Medizin aus der Apotheke in der Bahnhofstraße zu den Überlebenden im Stadtpark“), Sehenswürdigkeiten bekommen eine Endzeit-Geschichte, tägliche Patrouillen um das eigene Viertel.

**Gemeinschaft**
- Raids, aber zeitversetzt: einmal pro Woche, Zugang draußen erspielen, anmelden, Schaden machen, wann es passt, Belohnung nach Anteil.
- Verstecke: Vorräte an echten Orten zurücklassen, andere finden sie.
- Nachrichten an Orten aus vorgegebenen Bausteinen (wie bei Dark Souls), dadurch keine Moderation für freien Text nötig.
- Eine ganze Stadt befreit gemeinsam Stadtteile, ohne gleichzeitig online zu sein.

## Später vielleicht

- Native App (z. B. über Capacitor) für App Store / Play Store
- Smartwatch-Anzeige, Push-Nachrichten für Versorgungsabwürfe
- Saison-Events
