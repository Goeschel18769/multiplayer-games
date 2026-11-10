# multiplayer-games

Modulare Multiplayer-Spielplattform mit JavaScript-ES-Modulen, Cloudflare
Workers, SQLite Durable Objects und nativen WebSockets mit Hibernation API.
Das Frontend bleibt HTML, CSS und Vanilla JavaScript.

## Spiel herunterladen

Unter [GitHub Releases](https://github.com/Goeschel18769/multiplayer-games/releases/latest)
das Asset **`multiplayer-games.zip`** herunterladen und vollständig entpacken.
Es enthält ausschließlich `index.html`, `app.js` und `style.css`. Alle drei Dateien
im selben Ordner lassen und `index.html` per Doppelklick öffnen. Spieler benötigen
weder Node.js noch einen lokalen Webserver; eine Internetverbindung zum Backend
ist erforderlich. Der Download enthält die fertig gebaute Spieloberfläche.

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

Das [Repository](https://github.com/Goeschel18769/multiplayer-games) ist öffentlich;
zum Pushen ist ein Konto mit Schreibzugriff erforderlich.

`npm run dev` startet das Backend lokal. Für die Entwicklung bleiben alle
Quellen, Tests und die Dokumentation im Repository. `node_modules/`, lokale
Wrangler-Daten, `.env`-/`.dev.vars`-Dateien und die erzeugte `release/`-Ausgabe
werden nicht eingecheckt. Öffentliche `.example`-Vorlagen dürfen versioniert
werden und enthalten keine Zugangsdaten.

Für Spieler eine gebaute Ausgabe als GitHub-Release bereitstellen. Das passende
Download-Archiv entsteht mit `npm run package:release` in `dist/multiplayer-games.zip`.
Ein GitHub-Quellcode-Download ist noch keine gebaute Spielausgabe.
Die [technische Übergabe](handoff/README.md) liegt zusätzlich als
[handoff.zip](handoff.zip) im Repository; das ZIP ist eine Momentaufnahme der
sechs Dateien in `handoff/` und muss bei deren Änderung aktualisiert werden.
Der Diagnoseclient wird als Quelle unter `tests/manual/client/` versioniert;
eine lokale `tests/manual/client.zip`-Kopie gehört nicht zum Repository.

Ein Git-Push veröffentlicht den Quellstand im gewählten Repository. Er führt
kein Cloudflare-Deployment aus und aktualisiert das öffentliche Backend nicht.

### Automatische Spiel-Releases

Jeder Push auf `main` startet den [Release-Workflow](.github/workflows/release.yml).
Nach `npm ci`, den vollständigen Tests und dem Backend-Dry-Run baut er die
öffentliche Spielausgabe und veröffentlicht ein GitHub-Release mit
`multiplayer-games.zip` sowie den drei Einzeldateien. Bei fehlgeschlagenen
Prüfungen bleibt die vorherige Ausgabe unter
[Neueste Spielausgabe](https://github.com/Goeschel18769/multiplayer-games/releases/latest)
erhalten. Releases können außerdem auf `main` über Actions manuell gestartet werden.

Die erste Version ist `v1.0.0` (aus `package.json`); weitere Versionen zählen
automatisch die Patchnummer des höchsten vorhandenen stabilen Versionstags hoch.
Ein erneuter Lauf für denselben Commit verwendet dessen bestehenden Tag.
Der Workflow veröffentlicht erst nach dem vollständigen Upload aller vier Assets.
Es werden keine Cloudflare-Schlüssel benötigt und kein Backend deployt.

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

## Aktueller Stand: Spielhub für Ben und Joël

Implementiert sind Projektstruktur, Healthcheck, HTTP-API, wiederverwendbares
Raumframework, Reconnect, Heartbeat, fünf Minuten Leerraumfrist, gemeinsamer
Alarm-Scheduler, Engine-Vertrag, individuelle Spieleransichten und zuverlässige
globale Siegestatistik mit persistenter Outbox und Deduplizierung.

Die produktive Registry enthält `tic-tac-toe` und `connect-four`
(je Version 1, genau zwei Spieler).
Die reine Engine bietet Classic (3×3, drei in einer Reihe) und Fünf in einer
Reihe (15×15, mindestens fünf horizontal, vertikal oder diagonal), individuelle
Spieleransichten und strikte Zugprüfung. Es gelten keine besonderen Eröffnungs-
oder Verbotsregeln. Reguläre Siege beider Modi werden gemeinsam durch die
bestehende Statistik-Outbox gezählt. Raum-/Transportkern und Fünf-Minuten-Frist
bleiben unverändert. Die 2–4-Spieler-Fixture ist nur in Testkonfigurationen aktiv.

4 Gewinnt verwendet das klassische Brett mit sieben Spalten und sechs Reihen.
Ein Stein fällt auf den tiefsten freien Platz; mindestens vier gleiche Steine
waagrecht, senkrecht oder diagonal gewinnen. Volle Spalten sind gesperrt.
Das Spiel hat eine eigene Kachel und führt direkt in `BEN-JOEL-C4`, ohne Moduswahl.
Die Darstellung verwendet warme Braun- und Terrakottatöne, Spaltenvorschau und
eine dezente Fallanimation für neu bestätigte Züge. Alle Spiele zählen Siege
in denselben Namenszeilen.

Der kompakte Hub zeigt Spielkacheln mit generierten Bildvorschauen in warmer
Papieroptik, ohne Seitennamen oder Begrüßungstexte. Der hervorgehobene globale
Siegestand steht oben mittig: Zahlen öffnen Bearbeiten und Reset, Namen die
Spielerwahl. Beim ersten Öffnen im Tab wird Ben oder Joël in einem Dialog gewählt.
Hell-, Dunkel- und der eigens gestaltete Büro-Modus sind über eine kleine Lasche
oben rechts per Hover, Tastaturfokus oder Antippen erreichbar. Dezente Hover-
und Druckeffekte beachten die Einstellung für reduzierte Bewegung.
Jeder Klick auf die Tic-Tac-Toe-Kachel öffnet zuerst die Moduswahl. Das große Brett
bleibt über einen scrollbaren Ausschnitt mit ausreichend großen Touchfeldern
sowie Pfeiltasten und Home/End bedienbar. Nur der Server entscheidet Spielregeln
und Ergebnisse.

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
`.example`-Vorlagen dürfen ohne Geheimnisse versioniert werden. Die eigenständig weitergebbare
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
Die PNG-Vorschau wird per esbuild als Data-URL in `app.js` eingebettet; es bleibt
bei genau drei Release-Dateien ohne separate Bilddatei zur Laufzeit.

Für ein Download-Archiv zusätzlich Python 3 installieren und ausführen:

```sh
npm run package:release
```

Der Befehl baut immer erneut mit der öffentlichen Backend-Konfiguration, prüft
die drei Ausgabedateien und erzeugt `dist/multiplayer-games.zip`. Im ZIP liegen
`index.html`, `app.js` und `style.css` direkt an der Wurzel, ohne Quellcode,
Backend oder Unterordner. Auch nach einem lokalen Test-Build wird damit keine
`127.0.0.1`-Konfiguration ausgeliefert. `dist/` ist wie `release/` in Git ignoriert.

Die [Bildquelle](frontend/src/assets/tic-tac-toe-preview.png) wurde mit dem
integrierten Bildgenerator `imagegen` erzeugt (1536×1024 Pixel, rund 2,83 MiB).
Der [verwendete Prompt](frontend/src/assets/tic-tac-toe-preview.prompt.txt)
liegt neben der PNG-Datei.
Die Vorschau für 4 Gewinnt wurde ebenfalls mit dem eingebauten Imagegen-Werkzeug
erzeugt: [Bildquelle](frontend/src/assets/connect-four-preview.png) und
[verwendeter Prompt](frontend/src/assets/connect-four-preview.prompt.txt).
Beide Bilder bleiben in `app.js` eingebettet.

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

Ben oder Joël auswählen, die Tic-Tac-Toe-Kachel anklicken und einen Modus wählen.
Classic verwendet den gemeinsamen Raum `BEN-JOEL-TTT`, Fünf in einer Reihe
`BEN-JOEL-TTT-15`. Derselbe Modus führt beide in denselben Raum; die Modi bleiben
getrennt. Die Oberfläche versucht dessen
Anlage; ausschließlich `ROOM_EXISTS` führt stattdessen zum Beitritt in den
bestehenden Raum. Parallele Klicks erzeugen dadurch keine getrennten Räume.
Weitere Spiele erhalten später jeweils ihren eigenen festen Raumcode in der
Frontend-Registry. Es gibt keine zufälligen Ausweichräume, die beide Spieler
unbemerkt trennen könnten.
4 Gewinnt führt direkt über seine Kachel nach `BEN-JOEL-C4`; auch hier gilt
Create und ausschließlich bei `ROOM_EXISTS` Join, ohne automatischen Create-Replay.

In der Spielansicht öffnet eine unauffällige Raumsteuerung einen Dialog mit dem
aktuellen Code sowie getrennten Aktionen für Erstellen und Beitreten. Manuelle
Raumanlage übernimmt den gewählten Modus; ein Beitritt verwendet den tatsächlichen
Modus des Servers. Manuelle Raumwahl gilt nur für diese Spielansicht; der nächste
Tic-Tac-Toe-Einstieg aus dem Hub fragt erneut nach dem Modus und nutzt dessen Standardraum.
Reconnect behält den aktuellen Code und legt keinen Raum an. Rematches behalten
die Raumkonfiguration, Siege zählen über beide Modi gemeinsam nach Namen.

Alle Teilnehmer setzen sich bereit; danach kann die erste Runde gestartet
werden. Brett, Zugrecht und Ergebnisse stammen weiterhin ausschließlich vom
Server. „← Spiele“ trennt die Verbindung und führt zum Hub zurück; der Spielerplatz bleibt bis
zum Raumablauf reserviert. Nach fünf Minuten ohne lebende Verbindungen läuft
der Raum ab. Eine neue Verbindung mit demselben Namen übernimmt den Platz.
„Erneut verbinden“ versucht nur den Beitritt und erzeugt keinen weiteren Raum.
Es gibt keine automatische Wiederholung unklar bestätigter Spielaktionen.

Die Spielerwahl wird optional mit `sessionStorage` unter `multiplayer-player`
für den aktuellen Tab gemerkt; bei blockiertem Speicher erscheint sie nach jedem
Neuladen. Ein Klick auf den eigenen Namen im Score öffnet die Wahl erneut. Ein Wechsel
während einer Partie trennt die Verbindung und führt zum Hub zurück. Die
Darstellung wird ebenfalls optional im Browserspeicher gemerkt; blockierter
Speicher verhindert keine Nutzung über `file://`. Keine Cookies, Konten oder
Sitzungstokens.

Die Statistik wird beim Öffnen, bei Fensterfokus, bei Rückkehr zum Hub und nach
Siegen mit begrenzten Wiederholungen geladen. Im Score-Dialog lässt sie sich
manuell aktualisieren. Änderungen und „Auf 0“ bleiben bis „Speichern“ ein Entwurf.
`PUT /api/stats` speichert alle gewählten Werte atomar und prüft `expectedWins`:
ein zwischenzeitlicher Sieg oder eine andere Korrektur führt zu `STATS_CONFLICT`
anstatt zum Überschreiben. Die Deduplizierung bereits gezählter Partien bleibt
bei einem Reset erhalten. Noch nicht zugestellte Siege können danach eintreffen.

**Die neue Score-Bearbeitung benötigt das aktualisierte Backend.** Ein lokaler
Frontend-Build stellt dieses nicht bereit. Solange das öffentliche Backend die
neue API nicht unterstützt, zeigt der Dialog eine verständliche Fehlermeldung;
es werden keine nur lokal vorgetäuschten Score-Änderungen gespeichert.

**15×15 benötigt ebenfalls das erweiterte Backend.** Die Spielmetadaten liefern
dafür optional `modes`; ohne diese Angabe bietet das Frontend ausschließlich
Classic an. Die Moduserweiterung bleibt bei `tic-tac-toe`, Version `1`, und
Protokoll v1. Ein Deployment ist nicht Teil dieser Änderung.

**4 Gewinnt benötigt die neue Backend-Registry.** Die Kachel ist erst spielbar,
wenn `/api/games` `connect-four`, Version `1`, meldet. Ein GitHub-Release
aktualisiert den Cloudflare-Worker nicht; dessen Deployment bleibt getrennt.

## Spieloberfläche und Diagnoseoberfläche

- `release/index.html`: normale Spieloberfläche ohne technische IDs, Roh-JSON
  oder Fixture-Aktionen; unterstützt Tic Tac Toe und 4 Gewinnt.
- `tests/manual/client/index.html`: separate technische Diagnoseoberfläche für
  HTTP/WS, IDs und Nachrichten. Sie kann den normalen lokalen Server auf Port
  8787 oder den getrennten Fixture-Server (`npm run dev:manual`) auf Port 8788
  bedienen. Ihre Dateien bleiben unverändert erhalten.

Für Spieltests am lokalen Backend gibt es eine isolierte Test-Build-Konfiguration
auf Port 8789. Befehle und tatsächliche Prüfergebnisse stehen in
[Tests](docs/testing.md#phase-7-spieloberfläche-und-build). Siege werden nicht
ungefragt automatisiert gegen das öffentliche Backend getestet.
