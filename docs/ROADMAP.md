# Fahrplan

Alle geplanten Features an einer Stelle: erst was für Version 1.0 noch fehlt, dann die Versionen danach, zum Schluss was schon erledigt ist. Dieselbe Planung steht übersichtlich im [Konzeptplan](https://claude.ai/artifact/3VZUUmEiEVBDWWdwN9EpCT). Alle Mechaniken mit Stand und der Weg zu 1.0 in neun Paketen: [Überblick aller Mechaniken](https://claude.ai/artifact/4pbh9xnuaXMgxENYvjNULE). Neue Ideen kommen in die passende Version oder unter „Ideen für irgendwann“.

## Version 1.0: was noch fehlt

Version 1.0 ist fertig, wenn der ganze Kreislauf ohne Lücken läuft: rausgehen, finden, heimkommen, auspacken, bauen. **Schwerpunkt seit 21.10.: erst ein rundes Kern-Gameplay, danach neue Features.** Pakete 1–9 (Bus raus bis Balancing) sind erledigt, siehe unten.

10. **Einstieg und langsamer Aufbau:** die ersten 10 Minuten geführt, über die Zielleiste. Spielteile schalten sich nach und nach frei (Werktisch, Kampf, Funkgerät, Lagerfeuer …), nichts überschwemmt einen am Anfang. Details im [Konzept](KONZEPT.md).
11. **Klang:** Geräusche für Fund, Bauen, Kampf und Heimkehr.
12. **Draußen-Test und Fehlerrunde:** eine Woche echt spielen, dann alles Hakelige reparieren. Dazu der Taschenmodus: Bildschirm schwarz, GPS läuft weiter, Vibration bei Fundstellen.
13. **Feinschliff nach dem Test:** Zahlen für Beute, Kämpfe und Stufen anhand echter Spielrunden nachstellen (das Rechenmodell dafür gibt es schon).
14. **Drinnen und draußen im Gleichgewicht:** Zu Hause muss es immer etwas zu tun geben, draußen das Besondere. Mehr Startmaterial, „Ums Haus streifen“ ein paarmal am Tag, Ziele auch für zu Hause, das Rechenmodell mit „Stubenhocker“ und „Läufer“. Details im [Konzept](KONZEPT.md).
15. **Grafikstil finden:** Kevin sucht eine Referenz für den gewünschten Comic-Look, danach bauen wir genau den. Ausprobiert und wieder entfernt: Comic- und Gemalt-Stil, Quaternius-Modellpakete, 3D-Karte mit Fassaden (liegt in Git, Commit 4cc884c). Gemalte Hintergrundbilder sind drin.
15b. **Handy-Oberfläche überarbeiten:** Die Karte ist umgebaut (21.10., nach dem Vorbild von Pokémon Go und Monster Hunter Now). Noch offen: Zuhause, Kampf und die Fenster (Rucksack, Fortschritt) genauso schlank machen.
16. **Wahrzeichen auf der Karte:** echte Apotheken, Supermärkte, Baumärkte, Tankstellen und Haltestellen als 3D-Gebäude aus dem echten Grundriss plus Modell-Teilen (Schild, vernagelte Fenster, Einkaufswagen). Nur in der Nähe geladen, nie an sensiblen Orten. Kommt nach der Entscheidung zur Stilprobe, damit es gleich im richtigen Stil ist. Details im [Konzept](KONZEPT.md).
17. **Gemütliche Rituale, erste Fassung:** Samstagabend am Lagerfeuer mit einem Lagerfeuerlied pro Woche, die Leiste „Heute zu Hause“ mit 2 bis 3 Überraschungen am Tag und „Willkommen zurück“ nach einer Pause. Braucht Klang (Punkt 11). Details im [Konzept](KONZEPT.md).

**Entschieden:** Kampf als kurze Taktik mit Karten statt Echtzeit. **Noch offen:** Grafikstil (Comic-Look nach Referenz), Endziel (Idee aus der Lore: mit deinen Leuten zur Küste aufbrechen), echter Spieltitel („Nachhall“ ist nur ein Platzhalter).

## Version 1.1: Karten, Klassen, Dungeons

Das Kartensystem wird zum Rückgrat. Erst mehr Karten, dann längere Kämpfe.

- **Kartensammlung:** Kniffe als seltene Funde, Werktisch-Gegenstände als Einmalkarten (Brandflasche, Krähenfüße, Rauchdose), Karten durch den Rang. Deck vor dem Rausgehen zusammenstellen.
- **Klassen:** Vorgeschichte mit 2 bis 3 eigenen Karten, ab dem Rang Streifer Land- oder Stadtstreifer. Höchstens ein Viertel des Decks, zu Hause wechselbar.
- **Rote Zonen als Dungeons:** 3 bis 5 Kämpfe hintereinander, der Atemschutz ist die Uhr, nur vor Ort, abbrechen geht immer.
- **Raids von zu Hause:** wöchentliches Nest über das Funkgerät, zuerst allein gegen einen großen Gegner mit Phasen, mit Konten (Version 2.0) dann für alle gemeinsam.

## Version 1.2: Geschichte und Bewohner

- **Überlebende ziehen ein:** Menschen mit Name, Geschichte und Fähigkeit wohnen sichtbar bei dir zu Hause, wünschen sich Möbel und geben kleine Aufträge. Gut versorgt helfen sie mehr; niemand stirbt, wenn du mal nicht spielst. Sie schreiben Briefe, haben Geburtstag und singen samstags am Lagerfeuer mit.
- **Tauschhändler mit Wochenkurs:** montags einkaufen, unter der Woche zu wechselnden Kursen tauschen (wie der Rübenmarkt bei Animal Crossing), nur mit Spiel-Rohstoffen.
- **Quests mit Witcher-Anspruch:** wenige, aber gute Aufträge, die in Stadt und Dorf funktionieren, gern mit echten Straßennamen („Bring Medizin aus der Apotheke in der Bahnhofstraße zum Stadtpark“).
- **Funk ausbauen:** Aufträge zu echten Orten in der Nähe, dazu Nachrichten, die das Funkgerät erst nach gelaufenen Kilometern entschlüsselt (das Funkgerät mit Funksprüchen und Versteck-Hinweisen gibt es schon).
- **Der rote Faden:** Kapitel-Reise mit sichtbarem Endziel, jeden Samstag eine neue Funk-Folge auf Kanal 4 (zum Nachhören). Details im [Konzept](KONZEPT.md).
- **Fälle und Rätsel:** Krimi-Fälle mit 3 bis 5 Hinweisen auf der Karte und einer Ermittlungstafel zu Hause (Logikrätsel: wer, wo, womit), dazu Geheimschrift, Funk-Codes und Zahlenschlösser. Falsch raten kostet nichts.
- **Geschichte in Häppchen:** Erinnerungsstücke werden zu zusammenhängenden Kapiteln, dazu Laborzettel, Archivnotizen und Funksprüche aus der Lore. Die Biologie wird nie erklärt.
- **Hund als Begleiter:** erschnüffelt draußen Verstecke, schläft zu Hause am Lagerfeuer. (Mitkämpfen erst als späteres Update, siehe „Ideen für irgendwann“.)

## Version 1.3: Kampf und Gefahr

- **Mehr Karten und Gegner:** neue Waffenkarten (z. B. Feuer gegen Wandler, schwere Schläge gegen die Kalkplatten des Borkenmanns), seltene Karten als Fund, Gegner-Varianten.
- **Statuseffekte und Lärm:** Brennt, Vereist, Geblendet, Verlangsamt, Blutet, Verwundbar, Schwach, Adrenalin. Dazu die Lärm-Leiste (laut lockt Heuler an), Kombos und bessere Treffer-Effekte (Anhalten beim Treffer, Zeitlupe beim letzten Kill). Details im [Konzept](KONZEPT.md).
- **Mehr Kreaturen aus der Lore:** Varianten von Wandlern und Heulern, Fiebergruben, die man ausbrennt. Vorschläge mit Lore und Bild-Prompts stehen im Überblick-Dokument (Seite Gegner).
- **Schusswaffen:** Pistole, Schrotflinte, Gewehr als seltene Funde. Munition ist knapp, Schüsse sind laut und locken Gegner an.
- **Gefahrenstufe pro Ausflug:** vorher wählen, mehr Risiko bringt bessere Beute.
- **Horden auf echten Straßen:** umgehen, durchschleichen oder kämpfen. Lärm beim Durchsuchen lockt an, Stammwege werden mit der Zeit sicher.
- **Jagd:** Tiere auf der Karte, manchmal seltene.
- **Vollmond** macht Gegner stärker, dafür gibt es seltenere Beute.

## Version 1.4: Zuhause, Wetter und Jahreszeiten

- **In die Höhe bauen:** zwei bis drei Stockwerke wie bei Die Sims, mit Treppe oder Leiter. Oben nur, wo unten etwas trägt. Das aktuelle Stockwerk ist scharf, darüber ausgeblendet, darunter abgedunkelt. Dach als Ausguck. Details im [Konzept](KONZEPT.md).

- **Wetter treibt Anlagen an:** Regentonne füllt sich bei echtem Regen, Solarpaneel bei Sonne, Windrad bei Wind, bei Gewitter selten ein Blitz-Bauplan.
- **Mehr Anlagen in Stufen:** Lagerfeuer, Apfelbaum und Beete wachsen über Stunden.
- **Gemütlichkeit wirkt sich aus,** z. B. schnellere Erholung.
- **Museum der alten Welt:** Sammelstücke ausstellen, wie das Museum bei Animal Crossing. Ein Archivar erzählt zu jedem Stück ein Stück Lore.
- **Trophäen an der Wand** von harten Kämpfen und seltenen Funden.
- **Heimkehr mit Musik und warmem Licht.**
- **Fotomodus** ohne Bedienelemente, zum Teilen.
- **Jahreszeiten und Feiertage:** Pilze im Herbst, Schnee im Winter, Halloween.

## Version 2.0: Konten und Gemeinschaft

- **Konto** (z. B. Google-Login): Spielstand auf mehreren Geräten, der Gast-Spielstand wird übernommen. Erste Stufe ohne eigenen Server: Spielstand im versteckten App-Ordner des eigenen Google Drive, bei zwei Geräten gewinnt der neuere Stand (mit Rückfrage). Für Mehrspieler (Raids für alle, Ranglisten) später ein Server in der EU, der mit denselben Spielregeln rechnet (`src/core`).
- **Spuren anderer Spieler:** Notizen aus vorgegebenen Bausteinen (wie bei Dark Souls, kein freier Text), Vorratskisten, Warnschilder, Verstecke.
- **Basen besuchen:** nur virtuell über Freundesliste oder Code, nie mit echtem Ort.
- **Saisons:** alle 8 bis 10 Wochen ein neues Kapitel mit neuer Kreatur und neuem Raid-Boss, alte Saisons bleiben spielbar. Nach dem Endziel öffnet sich „Linie 1“.
- **Zeitversetzte Raids für alle:** einmal pro Woche ein Nest (z. B. ein befallener Supermarkt) mit gemeinsamem Lebensbalken. Jeder macht Schaden, wann es passt, auch von zu Hause, die Belohnung gibt es nach Anteil.
- **Tauschen per Funk:** Pakete brauchen echte Stunden, je nach Entfernung. Dörfer liefern Nahrung, Städte Medizin und Technik.
- **Gemeinsam eine Stadt befreien,** Stadtteil für Stadtteil, ohne gleichzeitig online zu sein.

## Vor einem öffentlichen Start (Pflicht)

- **Sensible Orte ausschließen:** erste Fassung steht (keine Fundstellen und Verstecke auf Friedhöfen, Krankenhäusern, Schulen, Kitas, Kirchen und Gedenkstätten, erfundene Fundstellen nicht in Gebäuden). Noch offen: dasselbe auf dem Server prüfen, Gärten und Höfe besser erkennen, Rote Zonen.
- **Kämpfe nur im Stehen:** Durch die Runden ohne Zeitdruck schon entschärft. Noch offen: Wer läuft, dessen Kampf pausiert (GPS-Geschwindigkeit). Niemand soll sich beim Spielen verletzen.

## Technik nebenher

- **Offline-Modus:** Karte der Umgebung zwischenspeichern (Service Worker).
- **Echte App** (Capacitor): Android-APK zum Selbst-Installieren läuft, GitHub baut sie bei jedem Hochladen (Download: Releases, „endstation.apk“). Später Play Store (einmalig 25 $) und App Store (99 €/Jahr, braucht einen Mac). Schritte und Kilometer im Hintergrund über Apple Health / Health Connect (nur Kilometer, keine Orte), optional Hintergrund-GPS.
- **Benachrichtigungen:** freundlich und abschaltbar („Dein Eintopf ist fertig“), nie Druck.
- **Smartwatch-Anzeige.**

## Als Nächstes (Wunsch von Kevin, 21.10. abends)

1. **Reisescheine:** finden (besondere Orte, Ketten, Funk) oder jeden Tag einen geschenkt (höchstens 3 sammeln sich). Damit 30–60 Minuten an einen beliebigen Ort der Welt reisen und dort per Antippen über Straßen und Wege laufen, durchsuchen, kämpfen. Echtes Laufen bleibt besser (Neuland-Bonus, mehr Scheine).
2. **Bestiarium:** Eintrag pro Kreatur beim ersten Treffen (Bild, Lore, wo und wann, was hilft, wie viele erledigt), unbekannte als graue Umrisse.
3. **Tiere:** passend zu Gelände und Tageszeit auf der Karte (Hase, Fasan, Reh, Fuchs, Wildschwein; selten Luchs, ganz selten der weiße Hirsch). Jagen als kurzes Minispiel (Armbrust), bringt Nahrung, Leder, Trophäen. Sammlung zum Vervollständigen.
4. **Glossar:** Begriffe aus der Lore (das Weinen, Flux, Rote Zonen, Elysis, Streifer …), schalten sich frei, sobald sie vorkommen.
5. Jede Sammlung mit Zähler und Belohnung bei 100 %.

## Ideen für irgendwann

- **Tiere beobachten:** Vögel und andere Tiere tauchen zufällig auf (passend zu Gelände, Tageszeit, Jahreszeit), antippen und beobachten, Sammlung im Fundbuch (Details im [Konzept](KONZEPT.md)).
- **Weitere Sprachen:** Das Sprachmenü mit Fahnen steht in den Einstellungen; Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Polnisch, Portugiesisch, Türkisch und Ukrainisch kommen, sobald die Texte fertig sind.
- **Naturkunde und Kräutersammler:** Beim ersten Fund einer Pilz-, Kraut- oder Beerenart wird sie bestimmt (echter Name, wo und wann sie wirklich wächst, giftig oder essbar, Doppelgänger), dazu eine Sammlung übers Jahr. Der Beruf Kräutersammler bringt eine eigene Kartenansicht, die nur Kräuter, Beeren und Pilze zeigt. Mit klarem Hinweis: im echten Leben nie nach dem Spiel sammeln (Details und Startliste im [Konzept](KONZEPT.md)).
- **Legenden einmal im Jahr:** seltene Wesen wie Waldriese, Hungermann, Wolpertinger oder der weiße Hirsch, mit Gerüchten vorab, Spuren und einer Trophäe. Verpassen kostet nichts (Details im [Konzept](KONZEPT.md)).
- **Gelände aus echten Daten:** Höhe für das Spiel nutzen (entschieden 22.10.: ja; Aussicht von Hügeln, bergauf langsamer; sichtbar ist sie schon), Bodenfeuchte und Frost aus dem Wetterdienst, Untergrund aus der Karte (Wald, Acker, Sand, Moor, Schotterweg). Siehe Antwort vom 22.10.
- **Zuhause im echten Gebäude:** Beim Einrichten nimmt das Zuhause den echten Grundriss, die Stockwerke und das Grundstück des Gebäudes an dieser Stelle aus den Kartendaten (Low-Poly, nur auf dem Gerät). So kann man sich überall einrichten: in der Scheune am Dorfrand oder im leeren Laden um die Ecke. (Street View und Googles 3D-Städte gehen nicht: nur zum Anschauen erlaubt, kein Nachbauen, kostet pro Abruf.)
- **Begleiter kämpfen mit (großes Update):** Hund oder Bewohner stehen im Kampf neben dir und bringen eigene Karten ins Deck (heilen, Falle stellen, ablenken).
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

### ✅ Version 1.0, Paket 4–9: rundes Kern-Gameplay

- **Fortschritt:** Zielleiste auf der Karte mit Belohnungen zum Abholen (26 Ziele, führen durch den Einstieg), Fortschritts-Fenster (Ziele, Stufe der Endstation, Ruf). Jede Gemütlichkeits-Stufe bringt einen Vorteil (schnellere Erholung, Werktisch-Platz, Suchradius, Glück, mehr Beute). Streifer-Rang von Neuling bis Legende.
- **Looten:** drei kurze Geschicklichkeitsspiele je nach Fundort (Schloss knacken, Aufhebeln, Durchwühlen), Ergebnis daneben/gut/perfekt verändert die Beute; in den Einstellungen abschaltbar. Erstfund ×2 (grüner Punkt auf der Karte). „Weiter wühlen“ bis zu dreimal, mit Lärm-Anzeige und Überfall-Risiko. Seltenheitsfarben, Marken auf dem Fundbeleg, Funde fliegen in den Rucksack.
- **Kampf als Karten-Taktik:** Seitenansicht, Gegner zeigen ihre Absicht, 3 Kraft pro Runde, 4 Karten auf der Hand, vorne und hinten, Wegtreten unterbricht Ausholen, Waffen bringen eigene Karten und nutzen sich pro Einsatz ab. Gegner aus der Lore: Wandler, Kriecher, Borkenmann (mit Rinde), Heuler (ruft Wandler). Gruppen je nach Ort und Tageszeit.
- **Draußen:** Händlerkisten für zwei Stunden (×2,5 Beute), Verstecke über Kreidezeichen und Funksprüche mit Suchkreis und „kalt, warm, heiß“. Keine Fundstellen an sensiblen Orten.
- **Anlagen:** Holzofen (Eintopf: heilt ganz, 3 Stunden mehr Beute), Sanitätsschrank (Medizin), Funkgerät (Funksprüche aus der Lore, Hinweise auf Verstecke). Die Endstation sagt, was fehlt und wo es das gibt.
- **Balancing:** Rechenmodell über 14 Tage; Holz häufiger, Metall und Vorräte etwas knapper; Kampf-Zahlen mit simulierten Kämpfen abgestimmt.
- Spielstand Version 9

**Testen:** Machen die Minispiele Spaß oder nerven sie? Ist der Kampf verständlich? Lohnt sich das Weiterwühlen? Findet man Verstecke mit „warm und kalt“?

### ✅ 21.10. abends: Android-App, schlanke Karte, Abschied von der Endstation

- **Android-App:** GitHub baut bei jedem Push eine APK (Releases, „endstation.apk“), Vollbild, Querformat, Standort-Rechte
- **Karten-HUD schlank:** oben links Figur mit Gesundheitsring und nächstes Ziel, oben rechts Sektor, Wetter, Menü; unten Zuhause, runder Rucksack-Knopf, Zentrieren mit GPS-Punkt. Vorräte, Name und Tag erst beim Antippen
- **Bleicher Wächter:** neuer Gegner nur nachts, mit Kevins 3D-Modell (fürs Handy auf 260 KB verkleinert). Blick lähmt, weicht ins Dunkel zurück, springt an. Beute aus den Kellern und einmalig das Kellertagebuch
- **Testmodus:** Figur läuft im Ort nur über Straßen und Wege (Strecke als Linie, quer durchs Gelände gepunktet), im Wald abseits der Wege langsamer mit Begegnungen, „Test: Angriff“ im Menü. Spielstand Version 10
- **Erkunden:** besondere Orte (6 Arten, einmal pro Gegend), Hinweise am Horizont mit Pfeilen, Spuren und Zettel-Ketten, Neuland-Bonus, Fundbuch der Orte, Stimmungssätze, Kompass. Testmodus: im Ort nur Straßen, raus aufs Feld über den Ortsrand. Spielstand Version 11
- **Endstation-Geschichte raus:** keine Linie 0, kein eigener Bus, die Basis heißt jetzt „Zuhause“. Bus-Look raus (LED-Schrift, Linienplan-Menü, LED-Icon). Platzhalter-Titel „Nachhall“ mit neuem Icon
- **Charakterfenster:** Der Rucksack-Knopf sitzt jetzt rechts am Rand. Er öffnet links die Ausrüstung (Gesundheit, Waffen, Karten), in der Mitte die Figur in 3D mit der Waffe in der Hand (zum Drehen), rechts den Rucksack als Fächer; ein Fach antippen zeigt, was drinsteckt. Daneben das Fundbuch
- **Kram wie bei Fallout:** 250 Sorten Kram statt 18 (erst 150, dann noch 100 dazu, zum Beispiel Gartenzwerg, Diaprojektor, Geigerzähler, Rollator, Feldtelefon), je nach Ort (Autoradio im Auto, Blutdruckmessgerät in der Apotheke, Heckenschere im Schuppen …), jede mit Spruch und 3D-Bild. 9 neue Bauteile (Gummi, Leder, Federn, Zahnräder, Kupfer, Öl, Batteriezellen, Desinfektionsmittel, Phosphat), die in Rezepten gebraucht werden. Fundstellen geben öfter Kram. Fehlt ein Bauteil, sagt das Spiel, in welchem Kram es steckt. Spielstand Version 12
- **Startbild und Anmelden:** Kevins Bild mit dem Bleichen Wächter im Nebel, darüber ziehender Nebel und Niesel, „Zum Starten berühren“. Danach Anmelden: Gast geht, Google und Apple stehen als Platzhalter da. Im Hauptmenü unten „Abmelden“
- **Wandernde Fundstellen:** Die kleinen Fundstellen würfeln etwa einmal am Tag neu (Ort, Art, Anzahl), jede Ecke zu ihrer eigenen Uhrzeit. 20 Minuten Nachfrist, Erstfund zählt pro Ecke. Echte und besondere Orte bleiben
- **Bitte kurz lesen:** Bei jedem neuen Spiel erklärt ein Bildschirm, dass vieles bewusst erst nach und nach freigeschaltet wird, und zeigt als Vorgeschmack Raids, Berufe, Rote Zonen, Bewohner, Kanal 4 und Legenden
- **Schönere Karte:** 12 gemalte Untergründe von Kevin (Wiese, Waldboden, Rasen, Grundboden, Hof, Schutt, Sand, Fels, Sumpf, drei Sorten Acker), auch im Zuhause auf und um das Grundstück; freundlichere Farben, Ufer an Seen und Bächen. Bäume als echte 3D-Modelle (Laub, Nadel, Birke, tot, im Herbst bunt), dazu Büsche, Unterholz und Steine; kein Baum mehr im Wasser. Auf der echten Karte sieht man Hügel und Täler als Schattierung
- **Pilzstellen:** nur im Wald, wandern wie die anderen Fundstellen, im Herbst am meisten, im Winter kaum. Geben Nahrung, selten Heilkräuter, nie bewacht
- **Testmodus:** Die Figur läuft nicht mehr durch Flüsse, Bäche und Seen
