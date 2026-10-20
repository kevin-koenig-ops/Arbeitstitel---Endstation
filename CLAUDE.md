# Hinweise für Claude

Endzeit-Erkundungsspiel auf der echten Karte (Arbeitstitel „Endstation“). Web-App mit Vite + TypeScript + MapLibre, ohne UI-Framework. Konzept: `docs/KONZEPT.md`, Architektur: `docs/ARCHITEKTUR.md`, nächste Schritte: `docs/ROADMAP.md`.

## Regeln

- `src/core/` bleibt frei von Browser-APIs, `Date.now()`, Netzwerk und DOM. Zeit kommt über `RuleContext.now`. Dieser Code soll später auf dem Server laufen.
- Die UI ändert den Spielstand nie direkt, sondern schickt `Action`s an `GameBackend.dispatch`.
- Spielinhalte (Fundstellen, Beute, Module, Erinnerungsstücke) gehören als Daten nach `src/core/content.ts`.
- Spielstand-Format geändert → `SCHEMA_VERSION` erhöhen und Migration in `src/core/save.ts`.
- Grundsatz „kein Zwang“: Wegbleiben darf nie bestraft werden.
- UI-Texte auf Deutsch, Code-Bezeichner auf Englisch, Kommentare auf Deutsch.
- Der Nutzer ist kein Profi-Entwickler: Erklärungen kurz und verständlich halten.

## Befehle

- `npm run dev`: Entwicklungsserver
- `npm test`: Tests der Spiellogik (müssen grün sein)
- `npm run build`: Typprüfung + Build nach `dist/`
- `npm run build:preview`: Einzeldatei-Vorschau nach `dist-preview/endstation-vorschau.html`
- `npm run gen:world` / `npm run gen:logo`: Demo-Dorf bzw. Platzhalter-Logo neu erzeugen
