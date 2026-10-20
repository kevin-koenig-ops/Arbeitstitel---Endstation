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

**Spielstand mit Versionsnummer.** `schema` im Spielstand plus `core/save.ts` für Migrationen. Wichtig, wenn Spielstände vom Gerät ins Konto umziehen. Beispiel: Version 1 → 2 hat Gesundheit, Waffen und Kampf ergänzt.

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
