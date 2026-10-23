# multiplayer-games

Modulares Multiplayer-Projekt mit JavaScript-ES-Modulen, einem Cloudflare-Worker-
Backend und einem Frontend aus HTML, CSS und Vanilla JavaScript.

## Voraussetzungen

- macOS mit zsh
- Node.js und npm in einer Version, die das installierte Wrangler unterstützt
  (Node.js mindestens 22)

Alle npm-Befehle werden im Projekt-Hauptordner ausgeführt. Abhängigkeiten installieren:

```sh
npm install
```

## Lokal starten

```sh
npm run dev
```

Wrangler startet den lokalen Worker standardmäßig auf Port 8787. Für den lokalen
Healthcheck sind keine Zugangsdaten oder Backend-Bindings erforderlich.

```sh
curl http://localhost:8787/health
```

Erwartete Antwort: `{"ok":true}` mit HTTP 200. Andere Methoden auf `/health`
liefern HTTP 405 und `Allow: GET`. Andere Pfade liefern HTTP 404 mit
`{"error":"NOT_FOUND"}`. Der Root-Pfad `/` liefert absichtlich 404.

Die statische Platzhalterseite kann über `frontend/index.html` im Browser
geöffnet werden. Der Worker liefert derzeit keine Frontend-Dateien aus.

## Aktueller Stand

Phase 2 umfasst die Projektstruktur und den Healthcheck sowie eine schlichte
statische Frontend-Platzhalterseite. Multiplayer, Durable Objects, Spielräume,
Statistik und Frontend-Build sind noch nicht implementiert. Die Testverzeichnisse
sind Platzhalter; das bestehende `npm test`-Skript enthält noch keine Tests.
Es wurden keine weiteren Abhängigkeiten hinzugefügt. Ein Deployment ist nicht
Teil dieser Phase.

Die [Architekturdokumentation](docs/architecture.md) beschreibt die Zuständigkeiten
und die geplante Architektur für spätere Phasen.
