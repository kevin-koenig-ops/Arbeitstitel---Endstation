# Fahrplan

Alle geplanten Features an einer Stelle: erst was für Version 1.0 noch fehlt, dann die Versionen danach, zum Schluss was schon erledigt ist. Dieselbe Planung steht übersichtlich im [Konzeptplan](https://claude.ai/artifact/3VZUUmEiEVBDWWdwN9EpCT). Neue Ideen kommen in die passende Version oder unter „Ideen für irgendwann“.

## Version 1.0: was noch fehlt

Version 1.0 ist fertig, wenn der ganze Kreislauf ohne Lücken läuft: rausgehen, finden, heimkommen, auspacken, bauen. Pakete 1–3 (Bus raus, Rucksack und Lager, Fundbuch) sind erledigt.

4. **Anlagen mit Nutzen** (jede einmal, aufrüstbar): Regentonne und Hochbeet sammeln schon von selbst. Es fehlen Holzofen (Eintopf: Nahrung und Gesundheit), Sanitätsschrank (stellt Medizin her) und Funkgerät (Hinweise auf Verstecke).
5. **Mehr Spaß beim Erkunden:** Neu entdeckte Fundorte geben beim ersten Mal doppelt, Hinweise führen zu Verstecken mit seltenen Sachen, seltene Ereignisse auf der Karte (z. B. ein Versorgungsabwurf, der Stunden bleibt).
6. **Kampf gut genug:** eine Steuerung festlegen, ausbalancieren, klares Feedback. Die Gegner heißen und wirken wie in der Lore: Wandler, Kriecher, Borkenmann, Heuler.
7. **Einstieg:** die ersten 10 Minuten geführt: erste Fundstelle, Endstation errichten, erstes Bauen, erster Werktisch-Auftrag.
8. **Klang:** Geräusche für Fund, Bauen, Kampf und Heimkehr.
9. **Draußen-Test und Fehlerrunde:** eine Woche echt spielen, dann alles Hakelige reparieren. Dazu der Taschenmodus: Bildschirm schwarz, GPS läuft weiter, Vibration bei Fundstellen.

**Noch offen (nach dem Testen entscheiden):** Kampfsteuerung (Tasten oder Gesten), Grafikstil (Polygon, Comic, Gemalt oder 2D mit gemalten Bildern), Endziel (Vorschlag aus der Lore: „Die Linie 0 fährt wieder“, mit deinen Leuten zur Küste).

## Version 1.1: Geschichte und Bewohner

- **Überlebende ziehen ein:** Menschen mit Name, Geschichte und Fähigkeit wohnen sichtbar in der Endstation, wünschen sich Möbel und geben kleine Aufträge. Gut versorgt helfen sie mehr; niemand stirbt, wenn du mal nicht spielst.
- **Quests mit Witcher-Anspruch:** wenige, aber gute Aufträge, die in Stadt und Dorf funktionieren, gern mit echten Straßennamen („Bring Medizin aus der Apotheke in der Bahnhofstraße zum Stadtpark“).
- **Funk:** Aufträge zu echten Orten in der Nähe, dazu Nachrichten, die das Funkgerät erst nach gelaufenen Kilometern entschlüsselt.
- **Geschichte in Häppchen:** Erinnerungsstücke werden zu zusammenhängenden Kapiteln, dazu Laborzettel, Archivnotizen und Funksprüche aus der Lore. Die Biologie wird nie erklärt.
- **Hund als Begleiter:** erschnüffelt draußen Verstecke, schläft zu Hause am Lagerfeuer.
- **Vom Neuling zum Streifer:** Wer oft genug lebend heimkommt, wird Streifer (ein Ruf statt Level).

## Version 1.2: Kampf und Gefahr

- **Kampf gründlich überarbeiten:** Steuerung, Gefühl, Treffer-Feedback; kurze Kämpfe, nur im Stehen.
- **Mehr Kreaturen aus der Lore:** Varianten von Wandlern und Heulern, Wurzelnester, die man ausbrennt.
- **Rote Zonen:** erfundene Orte (Bunker, Tunnel, verschlossene Hallen), nur mit Atemschutz und nur kurz, dafür seltene Beute.
- **Schusswaffen:** Pistole, Schrotflinte, Gewehr als seltene Funde. Munition ist knapp, Schüsse sind laut und locken Gegner an.
- **Gefahrenstufe pro Ausflug:** vorher wählen, mehr Risiko bringt bessere Beute.
- **Horden auf echten Straßen:** umgehen, durchschleichen oder kämpfen. Lärm beim Durchsuchen lockt an, Stammwege werden mit der Zeit sicher.
- **Überlebende kämpfen mit** und bringen eigene Aktionen mit (heilen, Falle stellen).
- **Jagd:** Tiere auf der Karte, manchmal seltene.
- **Vollmond** macht Gegner stärker, dafür gibt es seltenere Beute.

## Version 1.3: Zuhause, Wetter und Jahreszeiten

- **Wetter treibt Anlagen an:** Regentonne füllt sich bei echtem Regen, Solarpaneel bei Sonne, Windrad bei Wind, bei Gewitter selten ein Blitz-Bauplan.
- **Mehr Anlagen in Stufen:** Lagerfeuer, Apfelbaum und Beete wachsen über Stunden.
- **Gemütlichkeit wirkt sich aus,** z. B. schnellere Erholung.
- **Museum der alten Welt:** Sammelstücke ausstellen, wie das Museum bei Animal Crossing.
- **Trophäen an der Wand** von harten Kämpfen und seltenen Funden.
- **Heimkehr mit Musik und warmem Licht.**
- **Fotomodus** ohne Bedienelemente, zum Teilen.
- **Jahreszeiten und Feiertage:** Pilze im Herbst, Schnee im Winter, Halloween.

## Version 2.0: Konten und Gemeinschaft

- **Konto** (z. B. Google-Login, Server in der EU): Spielstand auf mehreren Geräten, der Gast-Spielstand wird übernommen. Der Server rechnet mit denselben Spielregeln (`src/core`).
- **Spuren anderer Spieler:** Notizen aus vorgegebenen Bausteinen (wie bei Dark Souls, kein freier Text), Vorratskisten, Warnschilder, Verstecke.
- **Basen besuchen:** nur virtuell über Freundesliste oder Code, nie mit echtem Ort.
- **Zeitversetzte Raids:** einmal pro Woche ein Nest (z. B. ein befallener Supermarkt). Jeder macht Schaden, wann es passt, die Belohnung gibt es nach Anteil.
- **Tauschen per Funk:** Pakete brauchen echte Stunden, je nach Entfernung. Dörfer liefern Nahrung, Städte Medizin und Technik.
- **Gemeinsam eine Stadt befreien,** Stadtteil für Stadtteil, ohne gleichzeitig online zu sein.

## Vor einem öffentlichen Start (Pflicht)

- **Sensible Orte ausschließen:** keine Fundstellen und keine Roten Zonen auf Friedhöfen, Gedenkstätten, Krankenhäusern, Schulen, Kitas und Privatgrundstücken (OSM-Flächen prüfen, Abstand halten).
- **Kämpfe nur im Stehen:** Wer läuft, dessen Kampf pausiert (GPS-Geschwindigkeit). Niemand soll sich beim Spielen verletzen.

## Technik nebenher

- **Offline-Modus:** Karte der Umgebung zwischenspeichern (Service Worker).
- **Echte App** für App Store und Play Store (z. B. Capacitor): Schritte und Kilometer im Hintergrund über Apple Health / Health Connect (nur Kilometer, keine Orte), optional Hintergrund-GPS.
- **Benachrichtigungen:** freundlich und abschaltbar („Dein Eintopf ist fertig“), nie Druck.
- **Smartwatch-Anzeige.**

## Ideen für irgendwann

- Weitere Haustiere, die mitlaufen und in der Basis wohnen
- Bahnhöfe als Handelsposten mit wandernden Händlern
- Aussichtspunkte und Anhöhen decken größere Bereiche der Karte auf
- Fundstellen passend zur Landschaft: im Wald eher Hochsitze, im Feld eher Scheunen
- Mehr Endzeit-Details auf der Karte: Autowracks auf Straßen, Brandflecken, überwucherte Flächen
- Elysis-Felder aus der Lore: Pflanzen, die wie perfekte Nutzpflanzen aussehen. Machen satt, aber sind sie sicher?
- Saison-Events

## Erledigt

### ✅ Iteration 1: Prototyp

Logo, Hauptmenü, Einstellungen, Charaktererstellung, Endzeit-Karte (echt + Demo-Dorf), GPS + Simulation, Fundstellen (überall + echte Orte), Durchsuchen mit Abklingzeit, Bus-Ausbau, Erinnerungsstücke, Rückkehr-Bonus, lokales Speichern.

**Jetzt wichtig: draußen testen.**
- Wie fühlt sich die Dichte der Fundstellen an? Zu viele, zu wenige?
- Passt der Suchradius von 45 m zur GPS-Genauigkeit?
- Wird die echte Karte schön dargestellt? Fehlen Ebenen oder sieht etwas komisch aus?
- Wie lange hält der Akku?

### ✅ Iteration 1b: Kartenoptik und Kampf

- 3D-Bäume, abwechslungsreiche Häuser, Autowracks, Strommasten, warmer Dunst, Tiefenunschärfe
- Bewachte Fundstellen, Rundenkampf mit Timing, Gesundheit, Waffen aus der Werkbank

**Draußen testen:** Fühlt sich der Kampf gut an? Mehr Action oder mehr Taktik? Sind die Gegner zu stark oder zu schwach?

### ✅ Iteration 1c: Karte freilaufen, Tageszeit, Wetter

- Kartennebel, dauerhaft aufgedeckte Wege, Sektoren mit Belohnungen
- Tag/Dämmerung/Nacht aus dem Sonnenstand, Nacht mit mehr Gefahr und mehr Beute
- Echtes Wetter mit Regen, Schnee, Nebel, Gewitter

### ✅ Iteration 1d: Die Endstation (Basisbau)

- Eigenen Ort festlegen (bleibt nur auf dem Gerät), bauen nur vor Ort
- 3D-Wartehalle mit Schutt, 20 Möbel- und Deko-Teile, Gemütlichkeit mit Stufen
- Baupläne an passenden Fundstellen, Licht nach echter Tageszeit

**Zu Hause testen:** Macht das Einrichten abends Spaß? Welche Teile fehlen? Ist die Halle zu klein oder zu groß?

### ✅ Iteration 1e: Großer Basisbau und Spielfigur

- Schauplätze: Busdepot, Bauernhof, Seeufer zum Start, Tankstelle und Schrebergarten als Lagepläne, jeweils mit eigener Umgebung
- Gelände 36 × 36 m, Abschnitte zurückerobern, Hindernisse wegräumen
- Frei bauen: Wände, Zäune, Türen, Fenster, Durchgänge, Böden, Dächer, Abreißen mit voller Rückgabe
- Räume mit Dach erkennen (Bonus-Gemütlichkeit), 36 Möbel, Wand-Deko
- Kamera: ein Finger schiebt, zwei zoomen, Drehen nur per Knopf
- Low-Poly-Spielfigur bei der Erstellung, auf der Karte und in der Basis (läuft per Antippen)
- Echtes Wetter auch in der Basis

**Zu Hause testen:** Wie fühlt sich das Bauen am Handy an? Ist das Gelände zu groß, zu klein? Welche Teile fehlen?

### ✅ Iteration 1f: Querformat und Steuerung

- Alle Bildschirme im Querformat, Dreh-Hinweis hochkant, Vollbild/Querformat-Sperre wo möglich
- Steuerung wählbar: Antippen oder Joystick mit Benutzen-Taste (Basis und Simulation)
- Baumodus an/aus mit Seitenleiste, feinere Polygone, Laterne an der Figur bei Nacht

### ✅ Iteration 1g: Kampf 2.0 (Prototyp)

- Tab-Targeting in 3D: Ziel antippen, automatisch angreifen, Wuchtschlag, Ausweichen, Stoß, Verbinden
- Angekündigte Angriffe mit perfektem Ausweichen und Konter, Kreischer ruft Verstärkung
- Treffer-Feedback (Zahlen, Stopp, Rückstoß, Zeitlupe), deterministische Simulation mit Tests

- Zweite Steuerung „Gesten“ zum Vergleichen: Tippen = Schlag/Kombo, Halten = Aufladen, Wischen = Ausweichrolle

**Testen:** Macht es Spaß? Tasten oder Gesten? Zu leicht, zu schwer? Zu lang, zu kurz? Wird Aufladen zu oft unterbrochen?

### ✅ Zwischenschritt: Feinschliff Steuerung und Bauen

- Figur in echter Größe auf der Karte (zoomt mit), Gangart passend zum Tempo
- Steuerung: Umstellen wirkt sofort, flüssiges Laufen ohne Ruckeln, Joystick mit großer Griff-Fläche, Benutzen-Taste reagiert beim Drücken, Kamera folgt nach dem Umschauen wieder
- Baumodus: Leiste fährt beim Auswählen weg, flache Aktionszeile unten

### ✅ Iteration 1h (Teil 1): Rohstoffe, Fundstücke, Werktisch

- „Material“ aufgeteilt in neun Rohstoffe (Holz, Metall, Stein, Stoff, Kunststoff, Glas, Kleber, Schrauben, Elektronik), alle Kosten und Fundorte neu
- 22 Fundstücke mit 3D-Modell: als Deko aufstellen oder am Werktisch zerlegen
- Werktisch zerlegt in echter Zeit, Fertiges wartet, drei Ausbaustufen; Werktisch, Ofen, Solarpaneel, Regentonne nur einmal
- Rucksack-Ansicht, Fundstücke auf dem Fundbeleg, Hinweis am Endstation-Knopf, Spielstand Version 6

**Testen:** Reicht die Menge an Rohstoffen? Was fehlt am häufigsten? Sind die Wartezeiten angenehm?

### ✅ Zwischenschritt: Grafikstil Comic zum Vergleichen

- Umschaltbar in den Einstellungen: Polygon oder Comic (Cel-Shading mit Umrissen)
- **Testen:** Was gefällt besser? Läuft Comic am Handy flüssig?

### ✅ Zwischenschritt: Größeres Gelände

- Gelände 72 × 72 m statt 36 × 36 m, Startfläche 24 × 24 m statt 12 × 12 m, Abschnitte 12 m
- Alte Spielstände: Gebautes rückt in die Mitte, schon Freies bleibt frei (Version 7)

### ✅ Version 1.0, Paket 1–3: Bus raus, Rucksack und Lager, Kram und Sammelstücke

- Der Bus ist kein Ausbau-Ort mehr. Alte Bus-Ausbauten werden zu Rohstoffen, die Regentonne steht jetzt in der Endstation
- Rucksack unterwegs, Lager zu Hause: Auspacken in der Endstation, gebaut wird aus dem Lager, eine Niederlage kostet nur etwas aus dem Rucksack
- Kram (18 Sorten, mehrfach) zum Zerlegen, mit sichtbarem Inhalt wie bei Fallout; 9 neue 3D-Modelle
- Sammelstücke (13, jedes nur einmal) fürs Fundbuch und als Deko; vier Sets mit Bauplan und Rohstoffen als Belohnung
- Fundbuch mit Umrissen und Fundort-Hinweisen, Fundbeleg zeigt „Neu im Fundbuch“ und den Set-Fortschritt
- Anlagen produzieren selbst (Regentonne, Hochbeet), Abholen direkt in der Endstation
- Werktisch baut jetzt auch Waffen; Lager als Seitenleiste (hochkant als Blatt von unten)
- Spielstand Version 8

**Testen:** Ist Auspacken zu Hause ein schöner Moment oder lästig? Findet man genug Sammelstücke? Ist klar, was im Rucksack und was im Lager ist?

### ✅ Zwischenschritt: Stilprobe „Gemalt“

- Dritter Grafikstil zum Vergleichen: weiche, abgerundete Formen, Oberflächen mit Pinselstruktur (Holz, Stein, Rost, Gras, Laub), feine braune Linien, weiche Schatten in Ecken, Leuchten um Feuer und Lampen, warmes Licht
- Gilt für Endstation, Kampf, Figur und Vorschaubilder; die Karte bekommt nur einen wärmeren Farbton
- **Testen:** Polygon, Comic oder Gemalt? Läuft „Gemalt“ am Handy flüssig? Wenn ja: als Nächstes detailliertere Modelle (Ruinen ringsum, Efeu, Fensterrahmen, rundere Figur)
