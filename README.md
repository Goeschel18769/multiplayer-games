# multiplayer-games

Private modulare Multiplayer-Spielplattform mit JavaScript-ES-Modulen, Cloudflare
Workers, SQLite Durable Objects und nativen WebSockets mit Hibernation API.
Das Frontend bleibt HTML, CSS und Vanilla JavaScript.

## Voraussetzungen

- macOS mit zsh
- Node.js und npm in einer von Wrangler unterstützten Version (Node.js mindestens 22)
- Lokale Loopback-Verbindungen und das Ausführen von Workerd für Integrationstests

Ein einziges npm-Projekt im Hauptordner; dort ausführen:

```sh
npm install
npm run dev
```

## Repository verwenden

Nach dem Klonen des GitHub-Repositories in dessen Hauptordner wechseln.
Die versionierte `package-lock.json` erlaubt eine reproduzierbare Installation:

```sh
git clone https://github.com/Goeschel18769/multiplayer-games.git
cd multiplayer-games
npm ci
npm test
npm run check:deploy
npm run build
```

Das [Repository](https://github.com/Goeschel18769/multiplayer-games) ist privat;
zum Klonen und Pushen ist ein berechtigtes GitHub-Konto erforderlich.

`npm run dev` startet das Backend lokal. Für die Entwicklung bleiben alle
Quellen, Tests und die Dokumentation im Repository. `node_modules/`, lokale
Wrangler-Daten, `.env`-/`.dev.vars`-Dateien und die erzeugte `release/`-Ausgabe
werden nicht eingecheckt. Öffentliche `.example`-Vorlagen dürfen versioniert
werden und enthalten keine Zugangsdaten.

Für Spieler den mit `npm run build` erzeugten vollständigen `release/`-Ordner
weitergeben. Ein GitHub-Quellcode-Download ist noch keine gebaute Spielausgabe.
Die [technische Übergabe](handoff/README.md) liegt zusätzlich als
[handoff.zip](handoff.zip) im Repository; das ZIP ist eine Momentaufnahme der
sechs Dateien in `handoff/` und muss bei deren Änderung aktualisiert werden.
Der Diagnoseclient wird als Quelle unter `tests/manual/client/` versioniert;
eine lokale `tests/manual/client.zip`-Kopie gehört nicht zum Repository.

Ein Git-Push veröffentlicht den Quellstand im gewählten Repository. Er führt
kein Cloudflare-Deployment aus und aktualisiert das öffentliche Backend nicht.

## Lokales Backend

Wrangler startet den lokalen Worker standardmäßig auf Port 8787. Für den lokalen
Betrieb sind weder Cloudflare-Login noch Zugangsdaten erforderlich.

```sh
curl http://localhost:8787/health
curl http://localhost:8787/api/games
curl http://localhost:8787/api/stats
```

Healthcheck: HTTP 200 mit `{"ok":true}`. Andere Methoden auf `/health` liefern
405 mit `Allow: GET`. Der Root-Pfad `/` liefert absichtlich 404. HTTP-Fehler
verwenden konsistent `{code,message}` und enthalten CORS-Header.

## Aktueller Stand — Phase 8: technische Frontend-Übergabe

Implementiert sind Projektstruktur, Healthcheck, HTTP-API, wiederverwendbares
Raumframework, Reconnect, Heartbeat, fünf Minuten Leerraumfrist, gemeinsamer
Alarm-Scheduler, Engine-Vertrag, individuelle Spieleransichten und zuverlässige
globale Siegestatistik mit persistenter Outbox und Deduplizierung.

Die produktive Registry enthält `tic-tac-toe` (Version 1, genau zwei Spieler).
Die reine Engine implementiert alle Regeln für ein 3×3-Brett, individuelle
Spieleransichten und strikte Zugprüfung. Reguläre Siege werden durch die
bestehende Statistik-Outbox gezählt. Raum-/Transportkern und Fünf-Minuten-Frist
bleiben unverändert. Die 2–4-Spieler-Fixture ist nur in Testkonfigurationen aktiv.

Die modulare Spieloberfläche liegt in `frontend/`. Der Worker liefert keine
Frontend-Dateien aus. `npm run build` erzeugt eine eigenständige Ausgabe in
`release/`, die direkt über `file://` funktioniert. Die technische
Diagnoseoberfläche bleibt getrennt in `tests/manual/client/` erhalten.

## Tests und Konfigurationsprüfung

```sh
npm test
npm run test:unit
npm run test:integration
npm run check:deploy
```

`check:deploy` ist ausschließlich ein Wrangler-Deployment-Dry-Run mit dem
Konfigurationspfad `backend/wrangler.jsonc`. Kein Deployment und keine
Cloudflare-Kontoeinstellungen ändern. Die Konfiguration verwendet SQLite-
`exports`, keine konkurrierenden Migrationsdeklarationen oder Remote-Bindings.

Miniflare und esbuild sind direkte Entwicklungsabhängigkeiten für die Tests;
keine zusätzlichen Laufzeitabhängigkeiten. Details zur echten Workerd-Laufzeit,
kontrollierten Uhr und den Grenzen der lokalen Hibernation-Simulation stehen in
[Tests](docs/testing.md).

## Verhalten und Dokumentation

Clients senden etwa alle 25 Sekunden `ping`; nach 120 Sekunden ohne gültige
Aktivität trennt der Server die Verbindung. Hintergrundtabs können deshalb eine
Wiederverbindung benötigen. Neue leere Räume und Räume ohne lebende Verbindung
laufen nach fünf Minuten ab. Der Name ist die einzige Identitätsprüfung: dieselbe
normalisierte Schreibweise übernimmt denselben Spielerplatz. Es gibt keine
Konten, Passwörter oder Sitzungstokens.

- [Architektur und zentrale Einstellungen](docs/architecture.md)
- [HTTP-Endpunkte, Nachrichtenschemas und Fehlercodes](docs/protocol.md)
- [Synchroner Engine-Vertrag](docs/game-engine.md)
- [Tests, kontrollierte Zeit und lokale Einschränkungen](docs/testing.md)

Öffentliche Backend-Konfiguration bleibt getrennt von Zugangsdaten. Öffentliche
`.example`-Vorlagen dürfen ohne Geheimnisse versioniert werden. Es gibt kein
Deployment oder weitere Spiele in dieser Phase. Die eigenständig weitergebbare
[Frontend-Übergabe](handoff/README.md) beschreibt den implementierten Vertrag;
`handoff.zip` enthält dieselben sechs Übergabedateien.

## Spieloberfläche bauen und weitergeben

Für Entwickler im Projekt-Hauptordner:

```sh
npm install
npm run build
open release/index.html
```

Der Build verwendet das vorhandene esbuild und erzeugt genau:

```text
release/index.html
release/app.js
release/style.css
```

Spieler öffnen `release/index.html` per Doppelklick. Sie benötigen keine
Installation, kein Node.js und keinen lokalen Webserver, aber eine
Internetverbindung zum Backend. **Immer den ganzen `release/`-Ordner weitergeben,
nicht nur `index.html`.** Er kann unabhängig vom Projekt auf einen anderen
Computer kopiert oder verschoben werden. Keine Dateien außerhalb dieses Ordners
werden benötigt.

Die Quellen verwenden ES-Module. Der Build bündelt sie als klassisches Skript
mit `defer`, ohne Laufzeit-Imports, nachgeladene Chunks, CDN, externe Schriftarten,
lokale fetch-Aufrufe oder Service Worker. Der generierte Ordner ist in Git
ignoriert und wird vor jedem Build gezielt bereinigt. Backend, Tests und
.env-Dateien werden nicht mitgeliefert.

## Öffentliche Konfiguration

`frontend/src/config.js` enthält nur öffentliche Werte:

```js
backendUrl: 'https://multiplayer-games.haldimann-joel.workers.dev'
protocolVersion: 1
```

**Nach Änderungen dieser Quellkonfiguration erneut `npm run build` ausführen.**
Keine Zugangsdaten oder Cloudflare-Schlüssel eintragen. Die ausgelieferte
Oberfläche benötigt keine Konfigurationsdatei zur Laufzeit. Die eigenständige
[Frontend-Übergabedokumentation](handoff/README.md) liegt in `handoff/`.

## Spielen und Wiederverbinden

Name und Raumcode eingeben, Tic Tac Toe auswählen und „Raum erstellen & beitreten“
wählen. Mitspieler wählen „Bestehendem Raum beitreten“. Alle Teilnehmer setzen
sich bereit; danach kann die erste Partie gestartet werden. Nur der aktuelle
Spieler kann ein leeres Feld wählen. Brett und Ergebnisse stammen vom Server.

Falls die Anlage erfolgreich war, aber der Beitritt scheitert, bleibt der Code
erhalten. „Erneut verbinden“ versucht nur den Beitritt, ohne einen weiteren Raum
anzulegen. Es gibt keine automatische Wiederverbindung und keine automatische
Wiederholung unklar bestätigter Aktionen. Eine andere Verbindung mit gleichem
Namen kann den Platz übernehmen; das bisherige Fenster zeigt einen Hinweis.

„Raum verlassen“ trennt nur die Verbindung. Der Platz bleibt reserviert, und erst
wenn alle getrennt sind, beginnt die Fünf-Minuten-Frist. Name und Raumcode bleiben
nur im Arbeitsspeicher bis zum Neuladen erhalten, ohne Cookies oder Browserspeicher.
Die Statistik wird unabhängig vom Spiel geladen, nach Sieg bei Bedarf höchstens
dreimal abgerufen und kann manuell aktualisiert werden.

## Spieloberfläche und Diagnoseoberfläche

- `release/index.html`: normale Spieloberfläche ohne technische IDs, Roh-JSON
  oder Fixture-Aktionen; unterstützt derzeit Tic Tac Toe.
- `tests/manual/client/index.html`: separate technische Diagnoseoberfläche für
  HTTP/WS, IDs und Nachrichten. Sie kann den normalen lokalen Server auf Port
  8787 oder den getrennten Fixture-Server (`npm run dev:manual`) auf Port 8788
  bedienen. Ihre Dateien bleiben unverändert erhalten.

Für Spieltests am lokalen Backend gibt es eine isolierte Test-Build-Konfiguration
auf Port 8789. Befehle und tatsächliche Prüfergebnisse stehen in
[Tests](docs/testing.md#phase-7-spieloberfläche-und-build). Siege werden nicht
ungefragt automatisiert gegen das öffentliche Backend getestet.
