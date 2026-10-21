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

**Werktisch mit echten Wartezeiten.** Ein Auftrag speichert nur, wann er fertig ist (`endsAt`, aus `ctx.now`). Was fertig ist, rechnet `readyParts` beim Abholen aus. Kein Hintergrund-Timer nötig, die App darf zu sein, und ein Server kann es genauso nachrechnen.

**Spielstand mit Versionsnummer.** `schema` im Spielstand plus `core/save.ts` für Migrationen. Wichtig, wenn Spielstände vom Gerät ins Konto umziehen. Beispiel: Version 1 → 2 hat Gesundheit, Waffen und Kampf ergänzt, 3 → 4 die Endstation, 4 → 5 das große Gelände (die alte Wartehalle wurde dabei zu Material), 5 → 6 die Rohstoffe (altes Material wird halb Holz, halb Metall), Fundstücke und den Werktisch.

**Erkundung ist serverfähig.** Aufgedeckte Zellen (Zoom 19, ~50 m) liegen als Bitfelder pro Block (Zoom 13, 64×64 Zellen) im Spielstand (`core/explore.ts`), wenige Kilobyte auch nach viel Herumlaufen. Die Tageszeit rechnet `core/sun.ts` aus dem Sonnenstand, ohne Netzwerk, also kann der Server sie genauso bestimmen. Das Wetter ist nur Optik und Timing auf dem Gerät.

**Die Endstation verrät keinen Ort.** Wo sie steht, liegt nur im Gerätespeicher (`services/basePlace.ts`, eigener Schlüssel, nicht im Spielstand). Die Bau-Aktionen (`chooseSite`, `reclaim`, `clearObstacle`, `buildWalls`, `setOpening`, `paint`, `demolish`, `place`, `move`, `store`) enthalten keine Position, nur Rasterkoordinaten auf dem eigenen Gelände. Ob du gerade „zu Hause“ bist, prüft allein das Gerät. Später sieht der Server also nur die Einrichtung, nie die Adresse.

**Bauen ist serverfähig.** `core/building.ts` enthält Gelände, Abschnitte, Hindernisse (deterministisch aus Spieler-ID, Schauplatz und Abschnitt), Bauteile, Kanten-Logik, Raumerkennung und Gemütlichkeit. Die Oberfläche rechnet die Vorschau mit denselben Funktionen (`planWalls`, `planPaint` …), die Regeln wenden sie an. Wände liegen auf Kanten zwischen Feldern (`h3,4` / `v3,4`), Böden und Dächer auf Feldern. Möbel stehen in `core/furniture.ts`.

**Kampf 2.0 ist nachrechenbar.** `core/battle.ts` simuliert den Echtzeitkampf in festen Zeitschritten mit eigenem Zufallszustand. Gleiche Eingaben zur gleichen Kampfzeit ergeben denselben Ausgang. Heute meldet das Gerät das Ergebnis (`battleResult`), später kann der Server es aus der Eingabeliste nachrechnen. Die 3D-Anzeige steht in `src/base/CombatScene.ts` und `zombie.ts`, die Bedienung in `src/ui/game/battle.ts`.

**Kampf ist ebenfalls serverfähig.** Wer eine Fundstelle bewacht, berechnet `guardOf(Seed, Fundstelle, Zeitfenster)`. Der Client schickt pro Runde nur `{ move, quality }`; Schaden, Gegenangriff und Ausgang würfeln die Regeln. Die Timing-Qualität kommt vom Client und lässt sich nicht prüfen, deshalb wirkt sie bewusst begrenzt (höchstens ×1,5).

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

## Zwei Build-Ziele

- `npm run build`: normale Web-App für GitHub Pages (MapLibre gebündelt, PWA-Manifest).
- `npm run build:preview`: eine einzige HTML-Datei für die Vorschau in Claude (MapLibre per CDN, nur Demo-Dorf und Simulation).

## 3D-Endstation und Spielfigur

- `src/base/BaseScene.ts`: Szene, Kamera (ein Finger schiebt, zwei zoomen, Drehen per Knopf), Antippen über Strahl und Raster, Vorschau, Wetter.
- `src/base/models.ts`, `structures.ts`, `environment.ts`: alle Modelle aus einfachen Formen (Low-Poly, keine Bilddateien).
- `src/base/bake.ts`: verschmilzt alles zu wenigen großen Meshes mit Farben pro Ecke. Ein Gelände mit Hunderten Teilen braucht so nur eine Handvoll Zeichenaufrufe.
- `src/base/character.ts`: die Spielfigur, `figureView.ts` zeigt sie bei der Erstellung, auf der Karte und als Porträt.
- `src/base/path.ts`: Wegfindung der Figur (Wände sperren, Türen lassen durch).
- Oberfläche: `src/ui/base/baseView.ts`, `sitePicker.ts`.

three.js wird erst nachgeladen, wenn es gebraucht wird (Figur, Endstation), damit die Karte schnell startet.
