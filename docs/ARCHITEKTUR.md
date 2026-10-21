# Architektur

Ziel: Heute Einzelspieler im Browser, später Mehrspieler mit Konten, **ohne die Spiellogik oder die Oberfläche neu zu schreiben**.

## Die drei Schichten

```
 ui/  (Bildschirme, Karte)
   │  schickt Aktionen, zeigt Ereignisse
   ▼
 services/GameBackend  ── heute: LocalBackend   (Browser + localStorage)
   │                      später: RemoteBackend (Server + Datenbank)
   ▼
 core/  (reine Spielregeln, kein Browser, keine Uhr, kein Netzwerk)
```

### 1. `core/`: Spielregeln als reine Funktion

```ts
applyAction(spielstand, aktion, { now, worldSeed }) → { spielstand, ereignisse }
```

- Keine Zugriffe auf `Date.now()`, `localStorage`, `fetch` oder den DOM. Die Zeit wird übergeben.
- Dadurch läuft genau dieser Code später auf dem Server (Node/Deno). Der Server entscheidet, ob man nah genug war und was man findet. **Schummeln per manipuliertem Client bringt dann nichts.**
- Getestet in `tests/core.test.ts`.

### 2. `services/`: austauschbare Dienste

| Schnittstelle | Heute | Später |
|---|---|---|
| `GameBackend` | `LocalBackend`: Regeln im Browser, Speicher lokal | `RemoteBackend`: Aktionen per HTTP an den Server |
| `AuthProvider` | `GuestAuth`: zufällige ID auf dem Gerät | `GoogleAuth` (z. B. Supabase oder Firebase), Gast-Spielstand wird übernommen |
| `LocationProvider` | GPS, Simulation, GPS-im-Demo-Dorf | unverändert |

Die Oberfläche kennt nur die Schnittstellen. Der Wechsel passiert an **einer** Stelle: `src/ui/app.ts`.

### 3. `ui/`: Bildschirme

Ohne Framework, kleine Hilfsfunktion `h()` in `ui/dom.ts`. Jeder Bildschirm ist eine Funktion, die `{ el, mount, destroy }` liefert.

## Warum Mehrspieler später einfach wird

**Die Welt ist deterministisch.** Fundstellen werden nicht gespeichert, sondern aus `(Welt-Seed, Kartenkachel)` berechnet (`core/world.ts`). Alle Geräte und der Server berechnen dieselben Fundstellen. Der Server muss keine Millionen Kisten in einer Datenbank halten.

**Fundstellen-IDs sind prüfbar.** Eine Grid-Fundstelle `g:17:x:y:i` kann jeder aus der ID nachrechnen. Die Regeln prüfen das schon heute (`verifySpot`).

**Beute ist reproduzierbar.** Was man findet, hängt von `(Seed, Spieler, Fundstelle, Zeitfenster)` ab. Der Server rechnet dasselbe.

**Aktionen statt Zustandsänderungen.** Der Client sagt „ich durchsuche X an Position P“, nicht „ich habe jetzt 5 Wasser“. Genau das wird später zur API.

**Grafikstil.** Alle 3D-Ansichten zeichnen über `StyledRenderer` (`base/comic.ts`). Im Comic-Stil werden die Materialien gegen Toon-Materialien getauscht (Farben bleiben verknüpft) und ein zweiter Schritt zieht Umrisse aus Tiefensprüngen und starken Farbwechseln. Polygon zeichnet wie bisher direkt. Der Stil „Gemalt“ (`base/painted.ts`) tauscht auf weich schattierte Materialien mit Oberflächen aus dem Shader (Pinselstruktur, Holz, Stein, Rost, Gras, Laub; welche Art, steht im Attribut `pat` der verschmolzenen Meshes bzw. in `material.userData.pat`). Danach folgen feine braune Linien, weiche Verschattung in Ecken, Leuchten um Lampen und Feuer und eine warme Farbstimmung. Quader bekommen dort abgerundete Kanten (`base/softBox.ts`), auf freiem Boden wachsen Grasbüschel.

**Werktisch mit echten Wartezeiten.** Ein Auftrag speichert nur, wann er fertig ist (`endsAt`, aus `ctx.now`). Was fertig ist, rechnet `readyParts` beim Abholen aus. Kein Hintergrund-Timer nötig, die App darf zu sein, und ein Server kann es genauso nachrechnen.

**Rucksack und Lager.** Was unterwegs gefunden wird, landet in `pack` (Rohstoffe) und `packKram`. Die Aktion `unpack` legt es ins Lager (`inventory`, `kram`). Ob man dafür zu Hause ist, prüft wie beim Bauen nur das Gerät. Vorräte (Nahrung, Wasser, Medizin) liegen immer in `inventory`. Anlagen (`FURNITURE.produces`) merken sich nur, seit wann sie sammeln (`PlacedItem.at`), den Ertrag rechnet `itemYield` aus.

**Spielstand mit Versionsnummer.** `schema` im Spielstand plus `core/save.ts` für Migrationen. Wichtig, wenn Spielstände vom Gerät ins Konto umziehen. Beispiel: Version 1 → 2 hat Gesundheit, Waffen und Kampf ergänzt, 3 → 4 die Endstation, 4 → 5 das große Gelände (die alte Wartehalle wurde dabei zu Material), 5 → 6 die Rohstoffe (altes Material wird halb Holz, halb Metall), Fundstücke und den Werktisch, 6 → 7 das doppelt so große Gelände (alles Gebaute rückt um 18 m in die Mitte), 7 → 8 „Bus raus“: Ausbauten werden zu Rohstoffen, Fundstücke werden zu Kram oder Sammelstücken, dazu Rucksack (`pack`, `packKram`), Lager (`inventory`, `kram`), Fundbuch (`collectibles`, `sets`), 8 → 9 Kern-Gameplay: Statistik, Ziele, Erstfunde (`seen`), Wühlen (`dig`), Verstecke (`caches`), Funkgerät (`radioAt`), satt (`fedUntil`), Kampf mit Gruppe (`combat.group`).

**Erkundung ist serverfähig.** Aufgedeckte Zellen (Zoom 19, ~50 m) liegen als Bitfelder pro Block (Zoom 13, 64×64 Zellen) im Spielstand (`core/explore.ts`), wenige Kilobyte auch nach viel Herumlaufen. Die Tageszeit rechnet `core/sun.ts` aus dem Sonnenstand, ohne Netzwerk, also kann der Server sie genauso bestimmen. Das Wetter ist nur Optik und Timing auf dem Gerät.

**Die Endstation verrät keinen Ort.** Wo sie steht, liegt nur im Gerätespeicher (`services/basePlace.ts`, eigener Schlüssel, nicht im Spielstand). Die Bau-Aktionen (`chooseSite`, `reclaim`, `clearObstacle`, `buildWalls`, `setOpening`, `paint`, `demolish`, `place`, `move`, `store`) enthalten keine Position, nur Rasterkoordinaten auf dem eigenen Gelände. Ob du gerade „zu Hause“ bist, prüft allein das Gerät. Später sieht der Server also nur die Einrichtung, nie die Adresse.

**Bauen ist serverfähig.** `core/building.ts` enthält Gelände, Abschnitte, Hindernisse (deterministisch aus Spieler-ID, Schauplatz und Abschnitt), Bauteile, Kanten-Logik, Raumerkennung und Gemütlichkeit. Die Oberfläche rechnet die Vorschau mit denselben Funktionen (`planWalls`, `planPaint` …), die Regeln wenden sie an. Wände liegen auf Kanten zwischen Feldern (`h3,4` / `v3,4`), Böden und Dächer auf Feldern. Möbel stehen in `core/furniture.ts`.

**Der Kampf ist nachrechenbar.** `core/tactics.ts` enthält den Karten-Kampf (Runden, Kraft, Absichten der Gegner) mit eigenem Zufallszustand. Gleiche Karten in gleicher Reihenfolge ergeben denselben Ausgang. Heute meldet das Gerät das Ergebnis (`battleResult` mit Abnutzung der Waffen), später kann der Server es aus der Liste der gespielten Karten nachrechnen. Die Gruppe der Gegner würfeln die Regeln beim `engage` (`encounter`). Die 3D-Anzeige steht in `src/base/CombatScene.ts` (Seitenansicht) und `zombie.ts`, die Bedienung in `src/ui/game/battle.ts`.

**Fortschritt wird berechnet, nicht gespeichert.** `core/progress.ts` enthält die Ziele, den Ruf und rechnet alles aus dem Spielstand; gespeichert wird nur, welche Ziele abgeholt sind (`goals`). Die Stufen-Vorteile stehen in `content.ts` (`TIER_PERKS`), angewendet in `rules.ts` (`basePerks`).

**Looten und Draußen.** Die Minispiele laufen nur in der Oberfläche (`src/ui/game/lootGame.ts`) und schicken ihr Ergebnis als `quality` mit (begrenzt auf ×0,7 bis ×1,35). Erstfunde merkt sich der Spielstand als Kurz-Kennungen (`seen`). Weiter wühlen ist eine Sitzung (`dig`) mit verstecktem Lärm-Limit. Händlerkisten berechnet `cartOf(Seed, Fundstelle, Zeitfenster)` wie die Wachen. Verstecke (`caches`) zeigen auf eine Grid-Fundstelle; welche Orte tabu sind (Friedhöfe, Schulen, Gebäude …), liefert die Karte als `RuleContext.blocked`.

**Wachen sind serverfähig.** Wer eine Fundstelle bewacht, berechnet `guardOf(Seed, Fundstelle, Zeitfenster)`.

## Was für Mehrspieler noch fehlt

1. **Server** mit denselben `core/`-Dateien. Vorschlag: Supabase (Postgres, Auth mit Google, Edge Functions in TypeScript) in der EU-Region, wegen DSGVO.
2. **`RemoteBackend`**: implementiert `GameBackend`, schickt Aktionen an den Server.
3. **POI-Liste auf dem Server.** Echte Orte kommen heute aus den Kartenkacheln im Browser. Der Server braucht dieselben OSM-Daten (z. B. per Overpass-Abfrage pro Kachel, zwischengespeichert), um POI-Fundstellen zu prüfen.
4. **Geteilter Weltzustand** für Gemeinschaftsfunktionen: Spuren, Notizen, Vorratskisten anderer Spieler. Neue Tabelle, neue Aktionen (`leaveNote`, `dropCrate` …).
5. **Plausibilitätsprüfung für GPS:** maximale Geschwindigkeit zwischen zwei Aktionen, damit niemand „teleportiert“.

## Karte

- **Echte Karte:** Vektorkacheln von OpenFreeMap (OpenMapTiles-Schema, Daten von OpenStreetMap), kostenlos und ohne API-Schlüssel. Der Endzeit-Stil steckt in `map/style.ts`, die Texturen (Wald, Felder, Schutt, Boden) werden in `map/patterns.ts` zur Laufzeit gezeichnet.
- **Demo-Dorf:** `map/demoWorld.json`, erzeugt von `scripts/gen-demo-world.mjs`. Gleiche Ebenen- und Klassennamen wie die echten Kacheln, deshalb gilt derselbe Stil.
- **Echte Orte:** `GameMap.poiCandidates()` liest Supermärkte, Apotheken, Haltestellen usw. aus den geladenen Kacheln. Welche OSM-Werte zu welcher Fundstelle werden, steht in `core/content.ts` (`POI_KINDS`).
- **3D-Welt auf der Karte:** `map/worldPlan.ts` plant aus den Kartendaten (ohne three.js), wie jedes Haus aussieht (Grundriss, Stockwerke, Sattel-, Walm- oder Flachdach, intakt, ausgebrannt oder Ruine) und wo Bäume, Autowracks, Laternen, Masten und Kram am Straßenrand stehen. `map/world3d.ts` baut daraus eine eigene MapLibre-Ebene mit three.js: Häuser als eine Form mit Fassaden-Shader (Fenster, Läden, Ruß, Ziegel), alles andere per Instancing. Einstellung „Häuser auf der Karte“: *Detailreich* (Standard), *Stadt-Bausatz* (die nächsten Häuser bekommen Wände aus Quaternius-Bauteilen) oder *Einfach* (die alten Blöcke aus `map/decor.ts`).

## Zwei Build-Ziele

- `npm run build`: normale Web-App für GitHub Pages (MapLibre gebündelt, PWA-Manifest).
- `npm run build:preview`: eine einzige HTML-Datei für die Vorschau in Claude (MapLibre per CDN, nur Demo-Dorf und Simulation).

## 3D-Endstation und Spielfigur

- `src/base/BaseScene.ts`: Szene, Kamera (ein Finger schiebt, zwei zoomen, Drehen per Knopf), Antippen über Strahl und Raster, Vorschau, Wetter.
- `src/base/models.ts`, `structures.ts`, `environment.ts`: alle Modelle aus einfachen Formen (Low-Poly, keine Bilddateien).
- `src/base/bake.ts`: verschmilzt alles zu wenigen großen Meshes mit Farben pro Ecke. Ein Gelände mit Hunderten Teilen braucht so nur eine Handvoll Zeichenaufrufe.
- `src/base/character.ts`: die Spielfigur, `figureView.ts` zeigt sie bei der Erstellung, auf der Karte und als Porträt.
- `src/base/path.ts`: Wegfindung der Figur (Wände sperren, Türen lassen durch).
- `src/base/modelPack.ts`: die zentrale Liste für fertige Modelle (Stilprobe). Welche Datei welche Rolle spielt (Spielfigur je Frisur, Gegner, Kulisse, Möbel, Hindernisse), Laden, Einpassen in Grundflächen und Figuren mit Bewegungsabläufen. Ein anderes Paket = andere Dateien und diese Liste anpassen. Umgewandelt werden die Pakete mit `scripts/import-models.mjs` (Zombie-Kit), `import-interior.mjs` (Möbel) und `import-citykit.mjs` (Fassaden). Einstellung „Figuren und Kulisse“: Modellpaket oder Eigenbau.
- `src/ui/art.ts`: gemalte Hintergrundbilder (Hauptmenü, Start, Charaktererstellung, Einstieg, Kampf, Schauplätze).
- Oberfläche: `src/ui/base/baseView.ts`, `sitePicker.ts`.

three.js wird erst nachgeladen, wenn es gebraucht wird (Figur, Endstation), damit die Karte schnell startet.
