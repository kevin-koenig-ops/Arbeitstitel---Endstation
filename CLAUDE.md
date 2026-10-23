# Hinweise für Claude

Endzeit-Erkundungsspiel auf der echten Karte (Titel „Projekt Heimweg“, früher „Home“, „Nachhall“ und „Endstation“; die Basis im Spiel heißt „Zuhause“). Web-App mit Vite + TypeScript + MapLibre, ohne UI-Framework. Konzept: `docs/KONZEPT.md`, Architektur: `docs/ARCHITEKTUR.md`, nächste Schritte: `docs/ROADMAP.md`. Hintergrundgeschichte (Lore): `docs/LORE.md`.

## Regeln

- `src/core/` bleibt frei von Browser-APIs, `Date.now()`, Netzwerk und DOM. Zeit kommt über `RuleContext.now`. Dieser Code soll später auf dem Server laufen.
- Die UI ändert den Spielstand nie direkt, sondern schickt `Action`s an `GameBackend.dispatch`.
- Spielinhalte (Fundstellen, Beute, Module, Erinnerungsstücke) gehören als Daten nach `src/core/content.ts`.
- Spielstand-Format geändert → `SCHEMA_VERSION` erhöhen und Migration in `src/core/save.ts`.
- Grundsatz „kein Zwang“: Wegbleiben darf nie bestraft werden.
- Geschichte, Gegner, Erinnerungsstücke und Orte passen zur Lore in `docs/LORE.md` (Kevins Text, nur auf Wunsch ändern).
- UI-Texte auf Deutsch, Code-Bezeichner auf Englisch, Kommentare auf Deutsch.
- Der Nutzer ist kein Profi-Entwickler: Erklärungen kurz und verständlich halten.

## Befehle

- `npm run dev`: Entwicklungsserver
- `npm test`: Tests der Spiellogik (müssen grün sein)
- `npm run build`: Typprüfung + Build nach `dist/`
- `npm run build:preview`: Einzeldatei-Vorschau nach `dist-preview/heimweg-vorschau.html`
- `npm run gen:world`: Demo-Dorf neu erzeugen
- `npm run balance`: Balancing-Labor (Autopilot kämpft tausende Kämpfe und Ausflüge; `--schnell`, `--sparsam`, `--ohne-tasche`). Nach Änderungen an Karten, Gegnern oder Medizin laufen lassen.
- Android-APK: baut GitHub bei jedem Push (`.github/workflows/apk.yml`), Download unter Releases
