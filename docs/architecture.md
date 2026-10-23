# Architektur

## Aktueller Stand — Phase 2

Implementiert sind die Projektstruktur, ein minimaler Cloudflare Worker und eine
statische Frontend-Platzhalterseite. Der Worker beantwortet `GET /health` mit
`{"ok":true}`, andere Methoden auf `/health` mit HTTP 405 und `Allow: GET` und
andere Pfade mit HTTP 404 und `{"error":"NOT_FOUND"}`.

Es gibt ein npm-Projekt im Hauptordner mit einer gemeinsamen `package.json` und
Lockdatei. Backend und Frontend haben keine eigenen npm-Projekte. JavaScript wird
mit ES-Modulen entwickelt; das Frontend nutzt HTML, CSS und Vanilla JavaScript.
Leere Verzeichnisse werden mit `.gitkeep` in Git erfassbar gemacht.

## Verantwortung der Verzeichnisse

Die folgenden Zuständigkeiten beschreiben die vorgesehene Aufteilung. Außer dem
Healthcheck und der statischen Platzhalterseite sind diese Funktionen noch nicht
implementiert.

| Verzeichnis | Verantwortung |
| --- | --- |
| `backend/` | Worker-Konfiguration und Backend-Quellcode. |
| `backend/src/` | Worker-Einstiegspunkt und spätere Backend-Module. |
| `backend/src/rooms/` | Geplante Raumverwaltung und Raum-Durable-Objects. |
| `backend/src/core/` | Geplante spielübergreifende Abläufe und Engine-Registry. |
| `backend/src/protocol/` | Geplantes Nachrichtenprotokoll und serverseitige Validierung. |
| `backend/src/stats/` | Geplante dauerhafte globale Statistik. |
| `backend/src/games/` | Geplante Engines mit Regeln und Zustandsübergängen je Spiel. |
| `frontend/` | Statische HTML-Seite und Styles. |
| `frontend/src/` | Platzhalter für Anwendungseinstieg und öffentliche Konfiguration. |
| `frontend/src/core/` | Geplante gemeinsame Oberfläche und Backend-Kommunikation. |
| `frontend/src/games/` | Geplante spielabhängige Oberflächen. |
| `shared/` | Geplante gemeinsame Protokollwerte und Normalisierungsfunktionen. |
| `scripts/` | Geplante Entwicklungs- und Build-Skripte. |
| `tests/unit/` | Platz für spätere isolierte Tests von Regeln und Hilfsfunktionen. |
| `tests/integration/` | Platz für spätere Tests des Zusammenspiels von Backend-Komponenten. |
| `docs/` | Architektur und weitere Projektdokumentation. |
| `release/` | Geplante generierte Frontend-Ausgabe; wird noch nicht erzeugt und nicht versioniert. |

## Geplante Architektur — noch nicht implementiert

### Räume, Persistenz und Statistik

Das Backend soll auf Cloudflare Workers und SQLite Durable Objects aufbauen.
Je normalisiertem Raumcode soll genau ein Durable Object zuständig sein. Ein
separates dauerhaftes Durable Object soll die globale Statistik verwalten,
unabhängig vom Lebenszyklus einzelner Räume.

Spielernamen und daraus abgeleitete Statistikschlüssel sollen eine gemeinsame,
zentral definierte Normalisierung verwenden. Die verbindliche Validierung und
Normalisierung erfolgt auf dem Server, damit unterschiedliche Schreibweisen
nicht zu widersprüchlichen Identitäten führen.

### Spielzustand und Engines

Der Server soll die einzige Autorität über Spielzustand und Spielregeln sein.
Clients übermitteln Aktionen; die jeweilige Engine prüft diese und berechnet
gültige Zustandsübergänge. Für verdeckte Informationen soll der Server für jeden
Spieler eine eigene Ansicht erzeugen und nur die jeweils erlaubten Informationen
übertragen.

Eine Engine-Registry soll die verfügbaren Spiele einschließlich ihrer jeweiligen
Mindest- und Maximalspielerzahl beschreiben. Die Infrastruktur soll grundsätzlich
nicht auf zwei Spieler beschränkt sein; die zulässige Spielerzahl hängt vom
gewählten Spiel ab.

### Frontend und Konfiguration

Ein späterer Frontend-Build soll eine Ausgabe in `release/` mit einem klassischen
JavaScript-Bundle erzeugen. Diese Ausgabe soll ohne Laufzeit-Imports und ohne
lokale `fetch`-Aufrufe zum Nachladen von Dateien oder Konfiguration auskommen.
Build-Werkzeuge und Build-Skripte sind noch nicht eingerichtet.

Öffentliche Backend-Konfiguration, etwa eine Backend-URL, soll getrennt von
Zugangsdaten bleiben. `frontend/src/config.js` ist dafür bislang nur ein
kommentierter Platzhalter. Zugangsdaten gehören weder in Frontend-Dateien noch
in öffentliche `.example`-Vorlagen. Die aktuelle Seite bindet kein JavaScript
ein und führt keine Netzwerkaufrufe aus Anwendungscode aus.

Durable-Object-Bindings, Klassendeklarationen, Remote-Bindings, Spielräume,
Statistik und Multiplayer sind in dieser Phase nicht eingerichtet. Es erfolgt
kein Deployment.
