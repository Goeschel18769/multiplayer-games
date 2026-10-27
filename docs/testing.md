# Tests und lokale Prüfung

## Voraussetzungen und Befehle

Im Hauptordner, mit macOS/zsh und einer von Wrangler unterstützten Node-Version
(mindestens 22), zuerst `npm install` ausführen. Die Tests verwenden Node-Test-
Runner, esbuild und Miniflare 5.20261019.2-beta (passend zum installierten Wrangler
4.152.0). Miniflare startet die echte Workerd-Laufzeit. Miniflare und esbuild sind
direkte Entwicklungsabhängigkeiten; sie waren bereits Bestandteile des
Wrangler-Abhängigkeitsbaums. Keine zusätzlichen Laufzeitabhängigkeiten.

```sh
npm test
npm run test:unit
npm run test:integration
npm run check:deploy
```

`npm test` führt Unit- und Integrationstests nacheinander aus. Die Integrationstests
benötigen das Starten von Workerd und lokale Loopback-Verbindungen. Eine
restriktive Sandbox kann diese blockieren. Kein Cloudflare-Konto oder Login
ist nötig. `check:deploy` führt ausschließlich
`wrangler deploy --dry-run --config backend/wrangler.jsonc` aus; kein Upload,
keine Änderung von Kontoeinstellungen. Wrangler darf lokale Logs und lokale
Entwicklungsdaten schreiben.

## Unit-Tests

`tests/unit/foundation.test.js` prüft NFC, Groß-/Kleinschreibung, Codepoint-Längen,
unzulässige Namen/Raumcodes, die zentralen Fristen, die Produktionsregistry mit Tic Tac Toe ohne Fixture,
alle Client-Nachrichtentypen, zusätzliche Felder, Byte-Limits, Engine-Definitionen,
JSON-Serialisierbarkeit, Initialzustand, Kopien bei fehlgeschlagenen Aktionen,
Gewinnerzugehörigkeit und private Ansichten.

## Workerd-Integrationstests

`tests/integration/backend.test.js` bündelt zwei getrennte Worker in-memory:

- Den echten Produktions-Einstiegspunkt aus `backend/src/worker.js`.
- `tests/fixtures/worker.js` mit ausschließlich dort registrierter deterministischer
  Fixture-Engine, testinternen RPCs, kontrollierter Uhr und Statistikfehlern.

Beide nutzen die SQLite-`exports` und Bindings aus `backend/wrangler.jsonc`.
Echte Durable Objects, SQL-Transaktionen, WebSocket-Paare, Attachments und
RPC-Aufrufe laufen in Workerd, ohne selbstgebaute Storage-/WebSocket-Mocks.
Es gibt keine öffentlich gerouteten Cheat-Endpunkte. Das Produktionsbundle wird
zusätzlich auf fehlende Fixture-/Test-Uhr-Inhalte und seine Tic-Tac-Toe-Registry
geprüft. Ein eigener Miniflare-HTTP-Einstieg führt außerdem den produktiven
Tic-Tac-Toe-Ablauf mit echten WebSockets aus, ohne die Fixture-Unterklasse.

Die Tests prüfen:

- HTTP, Healthcheck, Fehler, CORS einschließlich Origin `null`, Preflight, Methoden
  und tatsächliche UTF-8-Body-Limits.
- Einheitliche Namens-/Raumcode-Normalisierung und genau einen Erfolg bei
  gleichzeitiger Raumanlage.
- Stabile Plätze und Spielzustand bei Reconnect sowie wirkungslose späte Message-,
  Close- und Error-Ereignisse einer ersetzten Verbindung.
- Konstruktor-Neuaufbau aus echtem SQLite und echten Attachments; Nachrichtenlimit
  bleibt bestehen.
- Sofortige fünf Minuten Frist für neue leere Räume, Grenzen vor/nach Ablauf,
  verspäteten Join ohne Alarm, Raumcode-Wiederverwendung und wiederholte Alarme.
- Liveness nach 120 Sekunden, unveränderten Partiestatus beim Disconnect und
  Aufhebung der Leerraumfrist bei rechtzeitigem Reconnect.
- Ungültige, doppelte, veraltete und Identität vortäuschende Aktionen sowie
  Binärnachrichten und WebSocket-Byte-Limits.
- Vier Spieler, Platzgrenzen, verbundene/bereite Teilnehmer, serverseitige Startwahl,
  Rematch-Rotation und verbrauchte Zustimmungen.
- Feste Teilnehmer ab dem ersten Start: `ROOM_LOCKED` für neue Namen nach Sieg,
  Unentschieden und Abbruch; bekannte Namen können Verbindungen ersetzen und
  wiederverbinden, Rematches funktionieren. Nach fünf Minuten Leerraumfrist und
  Neuanlage desselben Raumcodes werden neue Namen wieder aufgenommen.
- Individuelle private Ansichten und isolierte View-Fehler ohne Rohzustand-Fallback.
- Siege aus parallelen Räumen, idempotente RPC-Wiederholung, verlorene Bestätigung,
  widersprüchliche Ergebnisse und einen weiteren Sieg nach Rematch.
- Statistikausfall und spätere Zustellung, Outbox über Raumlöschung und neue
  Raumgeneration hinweg, begrenzten Backoff und den gemeinsamen Scheduler.
- Keine Siege bei Unentschieden, Abbruch, Disconnect oder Raumlöschung.
- Konkurrierende Starts, doppelte Abschlüsse und Rematch-Stimmen sowie
  Statistik-Normalisierung und deterministische Sortierung.

Die kontrollierte Uhr wird nur in der Test-Unterklasse in SQLite gespeichert.
`tick(ms)` verstellt sie und ruft den echten Anwendungs-Alarmhandler auf;
`tick(ms, false)` simuliert einen verspäteten Alarm. Damit werden fünf Minuten
nicht real abgewartet. Der tatsächlich gespeicherte Plattform-Alarm wird ebenfalls
abgefragt. Die automatischen Plattform-Zustellzeiten sind damit nicht getestet.

## Hibernation-Grenze

Die Serverarchitektur verwendet die Hibernation API. Der lokale Test erzeugt
kontrolliert eine neue Klasseninstanz mit dem echten Durable-Object-Context,
echten SQLite-Daten und den weiterbestehenden Attachments und prüft den
wiederhergestellten Inhalt sowie weitere Nachrichten und Limits. Er behauptet
keine echte automatische Hibernation durch Cloudflares Infrastruktur.

Ein versuchter lokaler `unsafeEvictDurableObject(..., {webSockets: "hibernate"})`-
Aufruf blieb mit der installierten Miniflare-/Workerd-Version hängen und wurde
abgebrochen. Deshalb gehört dieser nicht reproduzierbare Aufruf nicht zur
regulären Testsuite. Automatische Eviction, Aufwachen, Hintergrundtab-Verhalten
und reale Netzwerkausfälle müssen später zusätzlich auf Cloudflare geprüft werden.
In Phase 3 wird dafür ausdrücklich nicht deployt.

## Manueller lokaler Produktionscheck

```sh
npm run dev
curl -i http://localhost:8787/health
curl -i http://localhost:8787/
curl -i http://localhost:8787/api/games
curl -i http://localhost:8787/api/stats
curl -i -X POST http://localhost:8787/health
```

Erwartet: 200 mit `{"ok":true}`, 404 mit `NOT_FOUND`, 200 mit genau Tic Tac Toe
(Version 1, minPlayers/maxPlayers 2), 200 mit Statistik-Array und 405 mit
`Allow: GET`. Raumerstellung mit einer erfundenen Spiel-ID liefert `UNKNOWN_GAME`.

## Historisches Ergebnis der Phase-3-Prüfung

Am 23.10.2026 erfolgreich ausgeführt:

- `npm test`: 6 Unit-Tests und 19 Workerd-Integrationstests, keine Fehler oder übersprungenen Tests.
- `npm run check:deploy`: Exit 0; beide SQLite-Durable-Object-Bindings erkannt, kein Upload.
- `npm run dev` und die fünf oben dokumentierten curl-Prüfungen: alle erwarteten Statuscodes, Bodies und Header erhalten; Server danach beendet.
- `git diff --check`: keine Whitespace-Fehler.

Dies ist keine Zusage über künftig geänderte Versionen oder noch nicht
durchgeführte Produktionsprüfungen. Die Hibernation-Grenze oben bleibt bestehen.

## Lokale manuelle Diagnose — Phase 4

`npm run dev:manual` startet einen getrennten lokalen Fixture-Worker auf
`127.0.0.1:8788` mit Persistenz unter `.wrangler/manual/`. Die Diagnoseoberfläche
liegt in `tests/manual/client/index.html` und kann direkt über `file://` geöffnet
werden. Sie nutzt die produktiven Klassen mit echter Uhr und regulären Alarmen,
ohne die RPC-Hilfen des automatisierten Fixture-Workers. Die produktive Registry
enthält seit Phase 6 ausschließlich Tic Tac Toe; der manuelle Server bleibt Fixture-only. Startbefehle und nummerierte Schritte mit erwarteten Ergebnissen:
[Manuelle Testanleitung](manual-testing.md).

Ergänzende Unit-Tests in `tests/unit/manual-client.test.js` prüfen die
Clientlogik für Welcome/Ack/State, Request-IDs, URL-Kodierung und WSS, ausstehende
Aktionen, alte Socket-Callbacks, Heartbeat-Timer, die 200-Einträge-Grenze,
Textdarstellung, Statistikabrufe und generische Handshake-Fehler. Sie verwenden
DOM-/Transport-Doubles und sind ausdrücklich keine Browserprüfung.


## Phase 6: Tic Tac Toe

`tests/unit/tic-tac-toe.test.js` prüft beide Startspieler, Config, Symbolzuordnung,
Zugwechsel, alle acht Gewinnlinien, Siege mit X und O, Unentschieden, Sieg im
neunten Zug, sämtliche ungültigen Aktionen, Eingabe-Unveränderlichkeit und
kopierte Spieleransichten einschließlich der Ablehnung unbekannter Spieler.
Die Diagnoseclient-Tests prüfen zusätzlich Engine-Spielergrenzen, produktive
Spielauswahl, fehlende optimistische Brettmutation, Pending-/Zug-Sperren und
`room.status` als Autorität beim Abbruch.

Der produktive Workerd-Test erstellt einen echten Tic-Tac-Toe-Raum, verbindet
zwei Spieler, prüft Ready/Start, synchronisierte Bretter, falschen Spieler,
belegtes Feld, Reconnect, Sieg, doppelte Abschluss-Anfrage, Statistik genau einmal,
Rematch mit Startrotation, Draw und Abort ohne weitere Siege. Die Fixture-freie
Produktionsbundle-Prüfung bleibt erhalten. Core, Räume, Protokolltransport,
GlobalStats, Outbox und Fünf-Minuten-Frist wurden dafür nicht verändert.

Konkrete Browserabläufe und tatsächlich ausgeführte Phase-6-Prüfungen stehen in
[Manuelle Tests, Phase 6](manual-testing.md#tic-tac-toe--phase-6).

Abschlussprüfung Phase 6 am 23.10.2026: `npm test` mit 27 Unit- und
20 Workerd-Integrationstests erfolgreich; `npm run check:deploy` und
`git diff --check` erfolgreich. Zwei echte Safari-Fenster über `file://` wurden
lokal bis Sieg, Statistik, Rematch und Abbruch geprüft. Weitere manuelle Grenzen
und das genaue Prüfprotokoll stehen in der verlinkten Anleitung.

## Phase 7: Spieloberfläche und Build

`npm test` umfasst weiter die vollständige Backend-Regression. Neue Tests:

- `frontend-connection.test.js`: normalisierte Identität, Welcome/Ack/State,
  Request-/Match-/Revisionszuordnung, Sperre mehrfacher Mutationen, ignorierte alte
  Acks/Callbacks/Timer, Close 4001, Fehlerbehandlung, unklare Bestätigung ohne
  Replay sowie begrenzte Statistik-Wiederholungen und HTTP-Ziel/Credentials.
- `frontend-app.test.js`: tatsächlicher gebündelter App-Einstieg mit kontrolliertem
  DOM und Netzwerk: nach erfolgreichem Create und fehlgeschlagenem Join bleibt der
  Code erhalten; Reconnect erzeugt nur einen neuen Socket, keinen zweiten Create.
  Das ist ein Client-Logiktest, keine Browserprüfung.
- `frontend-build.test.js`: genau drei öffentliche Dateien, Bereinigung alter
  Build-Artefakte, keine externen JS-Imports/Chunks oder Backend-Eingaben,
  relative vollständige Assets aus einer Kopie außerhalb des Projekts,
  getrennte lokale Konfiguration und normale Ausgabe mit öffentlicher Adresse.

Normaler Build für die Weitergabe:

```zsh
npm run build
open release/index.html
```

Keine automatisierten Siegtests gegen das öffentliche Backend. Für lokale
Spielprüfungen in einem Terminal einen eigenen Server mit isolierter Persistenz
starten (Backendcode und reguläre Konfiguration unverändert):

```zsh
npm run dev -- --ip 127.0.0.1 --port 8789 --persist-to .wrangler/frontend-test
```

Im anderen Terminal die feste lokale Testkonfiguration bündeln und den ganzen
Ordner außerhalb des Projekts kopieren:

```zsh
node scripts/build-frontend.mjs --local-test
TEST_COPY_DIR=$(mktemp -d /private/tmp/multiplayer-frontend.XXXXXX)
cp -R release/. "$TEST_COPY_DIR/"
open -a 'Google Chrome' "$TEST_COPY_DIR/index.html"
```

Der Test-Build spricht ausschließlich `http://127.0.0.1:8789` an. In zwei
unabhängigen Fenstern derselben kopierten Datei Joël und Ben verbinden; Erstellen
mit anschließendem Join, Ready/Start, Züge, Sieg/Statistik, Rematch und manuelles
Reconnect prüfen. Bei neuem Build den kopierten Ordner beachten: er aktualisiert
sich absichtlich nicht mit dem Projekt. Diesen lokalen Test-Build nicht als
öffentliche Ausgabe weitergeben.

**Zum Abschluss immer `npm run build` ohne Test-Flag ausführen.** Dadurch zeigt
`release/app.js` wieder auf die öffentliche Cloudflare-Adresse. Kein Backend wird
hierdurch deployt oder verändert. Spieler benötigen anschließend nur den ganzen
`release/`-Ordner und einen Browser mit Internetverbindung. Die inzwischen
vorhandene eigenständige Übergabe steht in [handoff](../handoff/README.md).

### Tatsächlich ausgeführte Phase-7-Prüfung am 23.10.2026

- `npm test`: **35 Unit-Tests und 20 Workerd-Integrationstests**, alle erfolgreich,
  keine übersprungenen Tests. Die Backend-Regression ist enthalten.
- `npm run build`: erfolgreich. Abschließend genau `index.html`, `app.js` und
  `style.css` in `release/`; öffentliche Cloudflare-Adresse enthalten, lokale
  Test-Adresse nicht enthalten. `release/` bleibt von Git ignoriert.
- Build-Vertrag automatisch geprüft: keine Laufzeit-Imports/externen Chunks,
  nur Frontend-Quellen, vollständige relative Assets nach Kopie außerhalb des
  Projekts und keine nachgeladenen CSS-/Schriftdateien.
- Separater lokaler Test-Build in
  `/private/tmp/multiplayer-phase7-B3F6ul/` tatsächlich direkt über `file://`
  geöffnet. Diese Kopie enthält die lokale Testkonfiguration, ist keine
  öffentliche Ausgabe und wurde nach dem Kopieren unabhängig von `release/`
  betrieben. Server: Port 8789, Persistenz `.wrangler/frontend-test/`.
- **Google Chrome 155.0.8059.85 auf macOS**, zwei unabhängige Fenster der kopierten
  Datei: Raumerstellung mit anschließendem Join, Beitritt des zweiten Spielers,
  Ready/Start, synchronisierte Züge, manuelles Reconnect mit erhaltenem Brett,
  Sieg und ein Eintrag in der isolierten lokalen Statistik, markierte Gewinnlinie,
  Rematch mit leerem Brett und gewechseltem Startspieler sowie Abbruch mit
  gesperrten Feldern in beiden Fenstern. Darstellung per Screenshot geprüft.
- Beide Clients bewusst getrennt und lokalen Testserver beendet. Keine
  automatisierten oder manuellen Siege gegen das öffentliche Backend erzeugt.
- JavaScript-Syntaxprüfungen und `git diff --check` erfolgreich.

**Ungeprüft:** Edge war nicht verfügbar (auch per Bundle-ID nicht auffindbar).
Safari wurde für diese neue Spieloberfläche nicht geprüft; die Safari-Prüfung
oben betrifft ausschließlich die frühere Diagnoseoberfläche. Physisches Kopieren
auf einen anderen Computer, mobile Geräte, vollständige Draw-Partien im neuen
Browserclient und die Echtzeit-Wartefälle bleiben manuell offen. Die Regeln und
Fristen sind weiter automatisiert geprüft. Das öffentliche Backend wurde in
Phase 7 nicht verändert oder deployt; dessen Live-Verfügbarkeit ist durch die
lokalen Tests nicht nachgewiesen.

### Geänderte Dateien in Phase 7

- Spieloberfläche: `frontend/index.html`, `frontend/style.css`,
  `frontend/src/app.js`, `frontend/src/config.js`.
- Gemeinsame Clientmodule: `frontend/src/core/http.js`, `protocol.js`,
  `connection.js`, `statistics.js`.
- Spielansichten: `frontend/src/games/registry.js`, `tic-tac-toe.js`.
- Build: `scripts/build-frontend.mjs`, `package.json` (nur neues Build-Skript).
- Tests: `tests/unit/frontend-app.test.js`, `frontend-build.test.js`,
  `frontend-connection.test.js`, `tests/fixtures/frontend-local-config.js`.
- Dokumentation: `README.md`, `docs/architecture.md`, `docs/testing.md`.

Backend-Code, reguläre Wrangler-Konfiguration, Engine und Diagnoseoberfläche
wurden in dieser Phase nicht geändert. Keine zusätzlichen Abhängigkeiten,
keine weiteren Spiele, keine Phase-8-Übergabedokumentation und kein Deployment.

## Phase 8: eigenständige technische Übergabe

Die sechs Dateien unter [handoff](../handoff/README.md) und `handoff.zip`
beschreiben den vorhandenen Backend-Vertrag für einen separaten Frontend-Chat.
Backend, Frontend, Build, Tests und Abhängigkeiten wurden funktional nicht geändert.
Die [Prüfübersicht](../handoff/verification.md) trennt automatisierte Tests,
historische Browserprüfungen, aktuelle Nutzerberichte und offene Nachweise.

Am 23.10.2026 tatsächlich erneut ausgeführt:

- `npm test`: 35 Unit- und 20 Workerd-Integrationstests erfolgreich, keine
  übersprungenen Tests. Erster Sandbox-Versuch bei Integration durch Loopback-
  EPERM blockiert; anschliessender freigegebener vollständiger Lauf erfolgreich.
- `npm run build`: öffentliche normale Ausgabe erfolgreich erstellt.
- `npm run check:deploy`: erfolgreich, kein Deployment. Nach zunächst blockiertem
  externem Logpfad mit WRANGLER_LOG_PATH in `/private/tmp/` fehlerfrei wiederholt.
- 70 JSON-Blöcke geparst, 16 Übergabe-Clientframes mit dem echten Validator
  geprüft, Settings und Fehlerdefinitionen verglichen; Beispielpartie mit
  10 Mutationen und 9 Snapshots durch die echte Match-/Engine-Logik nachvollzogen.
- Konfigurationsvorlage importiert und URL-Kodierung/WSS geprüft; relative
  Dateilinks und ZIP-Inhalte geprüft; `git diff --check` erfolgreich.
- Prüfsummenvergleich bestätigt 41 unveränderte Implementierungs-/Konfigurationsdateien.

Neu als **Nutzerbericht**, nicht als eigene Phase-8-Browserprüfung, bestätigt:
lokale Multiplayer-Abläufe samt Fünf-Minuten-Frist, Tic Tac Toe einschliesslich
Unentschieden, Online-Partie mit Ben über das öffentliche Backend und Funktion
des gebauten Frontends. Dafür wurden keine konkreten Browser oder
Netzwerkbedingungen genannt. Die älteren offenen Browserfälle oben geben den
damaligen Agenten-Prüfstand wieder. Echte automatische Cloudflare-Hibernation
bleibt unbewiesen. In Phase 8 keine neuen öffentlichen Spiele oder Deployments.

## Prüfung vor dem GitHub-Upload — 27.10.2026

- `npm test`: 35 Unit-Tests und 20 Workerd-Integrationstests erfolgreich,
  keine übersprungenen Tests. Lokale Loopback-Verbindungen waren für Workerd erlaubt.
- `npm run build`: normale Ausgabe mit öffentlicher Backend-Konfiguration erstellt.
- `npm run check:deploy`: erfolgreicher Dry-Run mit beiden Durable-Object-Bindings,
  ohne Deployment; Wrangler-Log im temporären Verzeichnis.
- Relative Dateilinks und Gleichheit der sechs Übergabedateien mit `handoff.zip`
  geprüft. Git-Ignore-Regeln schliessen Build, Abhängigkeiten, lokale Wrangler-Daten
  und die zusätzliche lokale Diagnose-ZIP-Kopie aus.
- Musterprüfung der zu versionierenden Textdateien auf gängige Zugangsdatenformate
  ohne Treffer. Dies ist keine umfassende Sicherheitsprüfung.

Die README beschreibt das private Repository, die Installation mit `npm ci`
und den Unterschied zwischen versionierten Quellen und gebauter Spielausgabe.
Es wurden keine Spielfunktionen geändert und keine öffentlichen Spiele gestartet.
