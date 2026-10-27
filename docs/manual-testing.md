# Manuelle Backend-Tests — Fixture und Tic Tac Toe

Die Diagnoseoberfläche unterstützt seit Phase 6 die produktive Tic-Tac-Toe-Engine
und die getrennte lokale Fixture. Sie ist kein endgültiges Frontend. Die unten
beschriebenen Prüfungen verwenden lokale Server; es gibt kein Deployment und
keinen Frontend-Build. Automatische Cloudflare-Hibernation wird damit nicht
nachgewiesen. Für Tic Tac Toe siehe den eigenen Phase-6-Ablauf weiter unten.

Diese Anleitung betrifft die historische Diagnoseoberfläche. Das seit Phase 7
gebaute normale Frontend und die Phase-8-Nutzerbestätigungen sind separat in
[Tests](testing.md) und im eigenständigen [Prüfstand](../handoff/verification.md)
dokumentiert; die früheren offenen Fälle unten bleiben als damaliger Prüfstand
erhalten.

## Start und Isolation

Im Projekt-Hauptordner auf macOS mit zsh:

```zsh
cd /Users/joelhaldi/Documents/multiplayer-games
npm install
npm run dev:manual
```

Das Skript startet `tests/manual/wrangler.jsonc` mit Worker-Name
`multiplayer-games-manual`, ausschließlich auf `127.0.0.1:8788`, explizit im
lokalen Modus und mit Persistenz unter `.wrangler/manual/` im Hauptordner. Dieser
Ordner ist durch `.gitignore` ignoriert. Normales `npm run dev` bleibt unverändert
auf Port 8787 mit seiner bisherigen Persistenz. Automatisierte Tests verwenden
separate temporäre Miniflare-Instanzen. Der manuelle Worker importiert nur die
Fixture-Registry und die produktiven Klassen; seine GameRoom-Unterklasse ersetzt
nur die Registry. Keine künstliche Uhr, keine tick-/inspect-/fault-RPCs und keine
simulierten Statistikfehler. Uhr und Alarme laufen regulär.

In einem zweiten Terminal:

```zsh
open tests/manual/client/index.html
```

Optional explizit in Safari:

```zsh
open -a Safari tests/manual/client/index.html
```

Die Adresszeile muss `file:///…/tests/manual/client/index.html` zeigen. CSS und
klassisches Skript mit `defer` werden relativ geladen; es gibt keine Laufzeit-
Imports, lokalen fetch-Aufrufe oder Bibliotheken. HTTP-Anfragen gehen ausschließlich
an die editierbare öffentliche Backend-Adresse, standardmäßig
`http://127.0.0.1:8787` für Tic Tac Toe. Für den folgenden Fixture-Ablauf
explizit `http://127.0.0.1:8788` einstellen. HTTPS wird für WebSockets in WSS, HTTP in WS umgewandelt.
Die Adresse darf keine Zugangsdaten, Pfade, Query oder Fragmente enthalten.
Namen und Raumcodes werden für die URL kodiert und vom Backend normalisiert.

Keine Cookies, localStorage, sessionStorage oder Sitzungstokens. Jedes Fenster
hält seinen Zustand nur im Arbeitsspeicher. Beim Neuladen gehen Clientdaten
verloren; Serverdaten bleiben im lokalen Persistenzordner erhalten. Ein bekannter
normalisierter Name übernimmt seinen bisherigen Spielerplatz. Der Name ist die
bewusst einzige Identitätsprüfung.

## Fixture-Ablauf mit erwarteten Ergebnissen

1. **Server starten.** `npm run dev:manual` muss beide lokalen SQLite-Durable-
   Object-Bindings und `http://127.0.0.1:8788` melden. Mit Ctrl-C beenden. Die
   Testumgebung niemals mit einem Deploy-Befehl veröffentlichen.

2. **Datei öffnen.** Den obigen `open`-Befehl ausführen. Die Statistik wird beim
   Öffnen einmal abgerufen. In beiden Fenstern die Backend-Adresse auf
   `http://127.0.0.1:8788` ändern und die Statistik bei Bedarf erneut laden. Anfangs dürfen alle mutierenden WS-Schaltflächen
   deaktiviert sein; erst ein gültiges Welcome erlaubt passende Aktionen.

3. **Zwei unabhängige Fenster öffnen.** In Safari mit ⌘N ein zweites Fenster
   öffnen, mit ⌘L dieselbe vollständige `file://`-Adresse eingeben und Return
   drücken. In Fenster A `Joël`, in Fenster B `Ben` als Namen einstellen. Die
   Fenster teilen keinen Clientzustand. Standardraumcode: `JOEL-BEN`.

4. **Spiele laden und Raum erstellen.** In Fenster A „Spieleliste laden“ wählen;
   `fixture · v1 · 2–4 Spieler (Test)` muss verfügbar sein. „Raum erstellen
   (ohne Beitritt)“ wählen. Erwartet: HTTP 201 mit normalisiertem Code, neuer
   `roomInstanceId` und relativem WS-Pfad. Das Fenster ist noch nicht verbunden.
   Falls der Code aus einem früheren Test belegt ist, erhält man konkret
   `ROOM_EXISTS`; einen neuen Code in beiden Fenstern verwenden oder den Ablauf
   der bestehenden Instanz abwarten. Es wird nicht automatisch ein anderer Raum
   angelegt. Die fünf Minuten Leerraumfrist laufen bereits ab Erstellung.

5. **Separat beitreten.** In A und B „Raum beitreten / erneut verbinden“ wählen.
   Erwartet: gültiges Welcome, unterschiedliche `playerId`/`connectionId`, gleiche
   `roomInstanceId`, noch keine `matchId`, Revision 0. Die Tabelle zeigt beide
   Plätze. Kein Beitrittsfehler führt zu einer automatischen Raumerstellung.

6. **Bereit und Start.** In beiden Fenstern „Bereit“ wählen, dann in A „Erste
   Partie starten“. Erwartet: gleiche neue `matchId`, Revision 0 und Status
   `running`; beide sind Teilnehmer. Der erste Startspieler wird vom produktiven
   Backend zufällig gewählt. Die UI zeigt ausstehende Requests und verhindert
   weitere Mutationen bis Ack und passender State-Antwort. Ready wird beim Start
   zurückgesetzt.

7. **Eigene private Ansichten vergleichen.** Jede Ansicht enthält `moves: 0` und
   ein anderes `secret` im Format `PRIVATE-…-playerId`. Jedes Fenster darf nur
   seine eigene Information erhalten — auch in Welcome, Reconnect und dem
   aufklappbaren Nachrichtenprotokoll. Kein Gesamtzustand wird abgerufen.

8. **Schritt und Synchronisierung.** In A „Fixture-Testaktion: step“ wählen.
   Beide Ansichten müssen `moves: 1` und dieselbe erhöhte Revision zeigen.
   Die privaten Informationen bleiben unterschiedlich.

9. **Ungültige Aktion.** In B „Fixture-Testaktion: invalid“ wählen. Erwartet:
   `INVALID_ACTION` mit neutraler Meldung. Revision, `moves` und Status bleiben
   unverändert. Danach sind passende Aktionsschaltflächen wieder verfügbar.

10. **Disconnect und Reconnect.** Joëls `playerId`, `matchId` und eigene Ansicht
    notieren. In A bewusst trennen und gleich wieder verbinden. Erwartet:
    dieselbe `playerId`, dieselbe Partie und derselbe Zustand, neue
    `connectionId`. Es gibt keine automatische Wiederverbindung.

11. **Platzübernahme.** Ein drittes unabhängiges Fenster mit derselben Datei
    öffnen, Name `Joël` (auch `JOËL` normalisiert gleich) und denselben Raumcode
    eingeben und beitreten. Erwartet: Platzübernahme, gleiche `playerId`, neue
    `connectionId`. Das bisherige Fenster A zeigt Close-Code 4001 und exakt:
    „Diese Verbindung wurde durch eine andere Verbindung mit gleichem Namen
    ersetzt.“ Es darf sich nicht selbst zurückverbinden. Für die folgenden
    Schritte das dritte Fenster als aktuelles Joël-Fenster verwenden.

12. **Regulärer Fixture-Sieg.** Statistikstand für `joël` notieren. Im aktuellen
    Joël-Fenster „Fixture-Testaktion: Sieg (win)“ wählen. Erwartet: Status `won`
    mit Joëls `playerId` als Gewinner, Revision +1. Die Statistik wird einmal
    automatisch abgerufen; wegen asynchroner Outbox-Zustellung kann dieser erste
    Abruf noch den alten Stand zeigen. Bei Bedarf „Statistik aktualisieren“
    wählen. Der Zähler steigt insgesamt genau um eins. Wiederholtes Lesen zählt
    keinen weiteren Sieg. Ein zuvor nicht vorhandener Schlüssel beginnt mit 1.

13. **Rematch.** Beide aktuellen Teilnehmer wählen „Rematch zustimmen“.
    Erwartet: nach der ersten Stimme nur eine Zustimmung, nach beiden neue
    `matchId`, Revision 0, `moves: 0`, Status `running`, leere Zustimmungen und
    zyklisch gewechselter Startspieler. `playerId`s bleiben gleich. Ready ist
    für Rematch nicht zusätzlich erforderlich.

14. **Unentschieden und Abbruch.** „Fixture-Testaktion: Unentschieden (draw)“
    wählen: Status `draw`, keine zusätzlichen Siege. Danach erneut beide
    Rematch-Stimmen abgeben, dann „Partie abbrechen“ wählen: Status `aborted`,
    ebenfalls keine zusätzlichen Siege. Statistik manuell vergleichen.

15. **Neue Namen bleiben gesperrt.** In einem getrennten Fenster den neuen
    Namen `Alice` versuchen. Nach dem ersten Start muss dies sowohl während
    `running` als auch nach `won`, `draw` und `aborted` scheitern. Im Netzwerk-Tab
    ist HTTP 409 / `ROOM_LOCKED` zu erwarten. JavaScript zeigt nur den allgemeinen
    Handshake-Fehler (siehe unten). Bekannte Namen dürfen weiterhin übernehmen.
    Vor dem ersten Start könnten bis zu vier Plätze beitreten; eine volle Lobby
    liefert `ROOM_FULL`.

16. **Leeren Raum kurz verlassen.** Beide aktuell verbundenen Teilnehmer bewusst
    trennen. Weniger als fünf Minuten später beide mit denselben Namen erneut
    verbinden. Erwartet: ursprüngliche `roomInstanceId`, Plätze und letzter
    Partiezustand. Wiederbeitritt hebt die Leerraumfrist auf. Ersetzte Fenster
    bleiben getrennt und dürfen nicht versehentlich wieder beitreten.

17. **Leerraumablauf.** Beide wieder bewusst trennen. Mehr als fünf Minuten nach
    der letzten lebenden Verbindung warten, mit Reserve für Alarmverzögerungen.
    Beitritt zum alten Raum muss scheitern (`ROOM_NOT_FOUND` im Handshake).
    Create/Join prüfen abgelaufene Fristen zusätzlich selbst. Es gibt keine
    sekundengenaue Zusage für die Ausführung eines Alarms.

18. **Code wiederverwenden.** Mit geladenem Fixture-Spiel denselben Raumcode
    erneut erstellen. Erwartet: neue `roomInstanceId`; danach können Joël, Ben
    oder ein neuer Name wie Alice wieder beitreten. Die Statistik von vorher
    bleibt erhalten, weil globale Statistik und Raumlebensdauer getrennt sind.

19. **Heartbeat/Liveness separat testen.** Zwei Teilnehmer mit Heartbeat an
    verbinden. Dann in beiden aktuellen Fenstern Heartbeat ausschalten und keine
    Ready-/Spiel-/Rematch-/Ping-Nachricht senden. Nach ungefähr 120 Sekunden seit
    der jeweils letzten gültigen Nachricht werden die Verbindungen mit
    Aktivitätstimeout (4002) getrennt. Erst nach Erkennung der letzten stillen
    Verbindung beginnt die weitere Fünf-Minuten-Leerraumfrist. Andere gültige
    WS-Nachrichten würden die Aktivität erneuern — darauf weist die Oberfläche
    auch bei ausgeschaltetem Heartbeat hin. Hintergrundtabs und Browser-/Alarm-
    Verzögerungen berücksichtigen, Fristen nicht verkürzen und keine
    sekundengenaue Garantie erwarten. HTTP-Statistikabfragen halten keine
    Raum-WebSocket-Verbindung am Leben.

20. **Diagnoseprotokoll prüfen.** Zeit, Richtung und Nachrichtentyp sind sichtbar;
    jeder Eintrag lässt sich für JSON aufklappen. Maximal 200 Einträge bleiben im
    DOM. Ein Ack bestätigt nur einen Request und setzt niemals neuere angezeigte
    Match-IDs oder Revisionen zurück. Bei ausbleibender Bestätigung bleibt die
    Aktion sichtbar ausstehend; bewusst trennen und erneut verbinden statt
    unkontrolliert weitere Mutationen abzusenden.

## Gescheiterter WebSocket-Handshake

JavaScript kann beim gescheiterten `new WebSocket(...)` weder den HTTP-Status noch
den JSON-Fehlerbody zuverlässig auslesen. Die Oberfläche behauptet deshalb keinen
konkreten Backend-Fehler und verweist auf die Browserdiagnose.

In Safari bei Bedarf die Entwicklerwerkzeuge über die Safari-Einstellungen
aktivieren. Vor dem Beitrittsversuch Web-Inspector öffnen (⌥⌘I), im Netzwerk-Tab
den Verlauf erhalten und dann erneut beitreten. Den Request
`/api/rooms/…/ws?name=…` suchen, gegebenenfalls WS-/Alle-Filter wählen. HTTP-Status,
Request-URL, Origin und soweit vom Browser angezeigt die Response prüfen.
`ROOM_LOCKED`/`ROOM_FULL` liefern 409, fehlende Räume 404. Bei erfolgreichem
Upgrade zeigt die WS-Ansicht die ausgetauschten Frames. Normale HTTP-Aufrufe
(Raumerstellung, Spiele, Statistik) zeigen ihre JSON-Fehler dagegen konkret in
der Oberfläche und im begrenzten Log.

## Prüfungen

Automatisierte Regression und Produktions-Konfiguration:

```zsh
npm test
npm run check:deploy
```

HTTP-Smoke-Test bei laufendem manuellen Worker:

```zsh
curl -i http://127.0.0.1:8788/health
curl -i http://127.0.0.1:8788/api/games
curl -i http://127.0.0.1:8788/api/stats
curl -i -X OPTIONS http://127.0.0.1:8788/api/rooms
curl -i http://127.0.0.1:8788/
```

Erwartet: Health 200, Spieleliste mit genau `fixture`, Statistik-Array,
Preflight 204 mit CORS, Root absichtlich 404. Die konkreten während der
Implementierung ausgeführten Prüfungen werden im Abschlussbericht genannt;
die obige Anleitung ist keine Behauptung, dass alle Warte- und Browserfälle
bereits ausgeführt wurden. Automatische Cloudflare-Hibernation und reale
Produktions-Netzwerkausfälle bleiben ausdrücklich unbewiesen.

## Historische Phase-4-Prüfung am 23.10.2026

- `npm test`: 10 Unit-Tests (davon vier Client-Logiktests mit Doubles) und
  19 Workerd-Integrationstests erfolgreich, keine übersprungenen Tests.
- `npm run check:deploy`: Produktions-Dry-Run mit Exit 0, keine Veröffentlichung.
- `npm run dev:manual`: Server auf `127.0.0.1:8788` gestartet; beide Bindings lokal.
  Der eigene Persistenzpfad `.wrangler/manual/` wurde geprüft und ist ignoriert.
- Reale HTTP-Aufrufe mit Assertions: Health 200, exakt die Fixture in der
  Spieleliste, Statistik 200, Preflight/CORS mit Origin `null` 204, Root 404,
  Raumanlage 201 und erneute Anlage 409 `ROOM_EXISTS`.
- Zwei gleichzeitig verbundene echte Node-WebSocket-Clients am manuellen Server:
  Welcome, Ready, Start, unterschiedliche private Ansichten, Step-Synchronisierung,
  abgelehnte ungültige Aktion, Namensübernahme durch eine Ersatzverbindung mit
  Close 4001, Draw und Rematch mit neuer Match-ID und rotiertem Startspieler.
  Ausschließlich öffentliche HTTP-/WS-Endpunkte, keine Debug-RPCs. Dies war kein
  Browsertest. Angelegte Smoke-Test-Räume liegen nur in der isolierten manuellen
  Persistenz und unterliegen den regulären Fristen.
- JavaScript-Syntaxprüfungen und `git diff --check` erfolgreich.
- Der manuelle Server wurde anschließend beendet.

**Zum Abschluss von Phase 4 noch manuell ausstehend:** Öffnen über `file://` und Bedienung mit zwei echten
Browserfenstern, visuelle Darstellung und Browser-Netzwerk-Tab sowie die
Wartefälle mit echten 120 Sekunden und fünf Minuten. Safari war in der
App-Inventur vorhanden, konnte über das verfügbare Computerwerkzeug jedoch auch
nach erneutem Versuch nicht angesprochen werden (Timeout). Es gab keinen
steuerbaren Browser-Tab. Die Client-Logiktests und Node-WebSocket-Prüfungen werden
nicht als bestandene Browserprüfung gewertet. Automatische Cloudflare-Hibernation
bleibt ebenfalls unbewiesen.


## Tic Tac Toe — Phase 6

Der normale Server bietet die echte produktive Engine an, der separate manuelle
Server weiterhin nur die Fixture. Keine künstliche Uhr in diesen Servern,
keine neuen Abhängigkeiten, keine Änderungen an der Raum-/Transportinfrastruktur.

```zsh
cd /Users/joelhaldi/Documents/multiplayer-games
npm run dev
# Zweites Terminal:
open -a Safari tests/manual/client/index.html
```

Backend-Adresse `http://127.0.0.1:8787` (neuer Standard). Die editierbare
Adressvorlage `https://multiplayer-games.haldimann-joel.workers.dev` steht ebenfalls
im Feld zur Auswahl; diese Phase ändert den dort veröffentlichten Stand nicht.
Für die beschriebenen Tests die lokale Adresse verwenden. Alle Daten werden
weiter ausschließlich über die öffentliche HTTP-/WS-API geladen. Kein
Release-Build, keine Laufzeit-Imports und keine lokalen fetch-Aufrufe.

1. Die Datei in zwei unabhängigen Safari-Fenstern über `file://` öffnen, Namen
   Joël und Ben eingeben. In beiden Fenstern Spieleliste laden. Erwartet: genau
   `tic-tac-toe · v1 · 2–2 Spieler`; keine Fixture. Auf Port 8788 bleibt stattdessen
   nur die Fixture sichtbar. Auch nach dem Beitritt kann die Spieleliste geladen
   werden, damit der Client minPlayers/maxPlayers kennt.
2. Joël erstellt einen freien Code, beispielsweise `TTT-MANUAL`; beide treten
   separat bei. Config ist automatisch `{}`. Vor dem ersten Start und mit nur
   einem Spieler bleibt Start gesperrt. Beide bereit setzen; mit genau zwei
   verbundenen, bereiten Spielern wird Start freigegeben.
3. Start drücken. Beide zeigen dieselbe neue Match-ID und Revision 0. Der vom
   Backend bestimmte Startspieler erhält X und beginnt, der andere O. Namen,
   Symbole und eigener Stein sind sichtbar. Das 3×3-Brett hat neun echte Buttons
   mit Indizes 0–8 zeilenweise. Fixture-Schaltflächen sind ausgeblendet. Nur die
   freien Felder des aktuellen Spielers sind aktiv.
4. Für einen Sieg wählen die jeweils angezeigten Zugspieler nacheinander
   **X: 0, O: 3, X: 1, O: 4, X: 2**. Nach jedem Zug müssen beide Bretter und
   Revisionen übereinstimmen. Während einer ausstehenden Mutation sind weitere
   Züge gesperrt; das Brett ändert sich erst nach empfangenem Serverzustand.
5. Nach X auf 2: Meldung „Sieg für …“, grüne Gewinnlinie `[0,1,2]`, keine weiteren
   Zugbuttons aktiv. `currentPlayerId` ist `null`. Statistik wird einmal geladen;
   gegebenenfalls wegen Outbox-Verzögerung manuell nachladen. Genau der Gewinner
   erhält einen weiteren Sieg; wiederholtes Lesen erhöht nichts.
6. Beide stimmen dem Rematch zu. Erwartet: neue Match-ID, Revision 0, leeres
   Brett, leere Zustimmungen und getauschter Startspieler. Der neue Startspieler
   erhält X. Plätze und Rauminstanz bleiben gleich.
7. Für ein Unentschieden in dieser neuen Partie nacheinander
   **X: 0, O: 1, X: 2, O: 4, X: 3, O: 5, X: 7, O: 6, X: 8** wählen.
   Erwartet: „Unentschieden“, volles Brett, `currentPlayerId: null`,
   `winningLine: null`, alle Züge gesperrt und unveränderte Statistik.
8. Nach erneutem Rematch einen Zug machen und „Partie abbrechen“ wählen.
   Beide zeigen „Partie abgebrochen“ und alle Felder sind gesperrt. Die empfangene
   Engine-Ansicht darf noch einen aktuellen Spieler enthalten: verbindlich ist
   `room.status.type === "aborted"`, nicht diese ältere Engine-Zuginformation.
   Keine weiteren Siege. Ein weiterer Rematch bleibt möglich.
9. In einer laufenden Partie Brett, Spieler-ID und Revision notieren, bewusst
   trennen und erneut verbinden: gleiche `playerId`, gleicher Brettzustand,
   gleiche Partie, neue `connectionId`. Eine weitere Verbindung mit gleich
   normalisiertem Namen ersetzt die bisherige mit Close 4001, ohne Reconnect-
   Schleife. Für abgelehnte Handshakes gilt weiterhin die Netzwerk-Tab-Anleitung.
10. Optional Sieg auf dem letzten Feld prüfen: nach Rematch die Zugfolge
    **X: 0, O: 1, X: 4, O: 2, X: 5, O: 3, X: 6, O: 7, X: 8** spielen.
    Erwartet: Sieg für X über `[0,4,8]`, kein Draw trotz vollem Brett.
11. Fünf-Minuten-Frist, ROOM_LOCKED nach erstem Start, Heartbeat und Raumcode-
    Wiederverwendung gelten unverändert. Die Wartefälle aus dem Fixture-Ablauf
    lassen sich entsprechend mit Tic Tac Toe ausführen; Fristen nicht verkürzen.

Automatisiert werden zusätzlich abgelehnte Züge des falschen Spielers, belegte
Felder, ungültige Payloads und die Wiederholung derselben Abschluss-Request-ID
geprüft. Diese Fälle werden nicht durch zusätzliche Cheat-Schaltflächen in das
Tic-Tac-Toe-Brett eingebaut.

### Tatsächlich ausgeführte Phase-6-Prüfung am 23.10.2026

- `npm test`: **27 Unit-Tests und 20 Workerd-Integrationstests erfolgreich**,
  keine Fehler oder übersprungenen Tests.
- `npm run check:deploy`: Exit 0, produktives Bundle mit beiden Durable-Object-
  Bindings erstellt, kein Upload und kein echtes Deployment.
- `git diff --check` und JavaScript-Syntaxprüfungen erfolgreich.
- Normaler `npm run dev` auf Port 8787 mit produktiver Registry gestartet.
  Zwei unabhängige Safari-Fenster direkt mit derselben `file://`-Datei geöffnet.
  Joël und Ben haben Spieleliste, Raumanlage und getrennten Beitritt, Ready und
  Start, wechselweise Züge `0,3,1,4,2`, synchronisierte Bretter, korrekte
  Zugbuttons, Sieg für X und grüne Gewinnlinie geprüft. Die vorher leere lokale
  Statistik zeigte danach genau einen Sieg für Ben.
- In beiden Browserfenstern Rematch zugestimmt: neue Match-ID, leeres Brett,
  Revision 0 und gewechselter Startspieler (Joël erhielt danach X). Anschließend
  Abbruch ausgelöst; beide Fenster zeigten `aborted`, sämtliche Felder waren
  trotz weiterhin gesetzter Engine-`currentPlayerId` deaktiviert.
- Beide Browserclients bewusst getrennt und lokalen Server beendet. Das
  Browser-Testspiel liegt ausschließlich in der bisherigen lokalen Dev-Persistenz;
  es wurden keine Cloudflare-Kontoeinstellungen oder veröffentlichten Daten geändert.

Noch nicht in dieser Browserprüfung wiederholt: kompletter Draw-Ablauf,
Reconnect/Übernahme während Tic Tac Toe, Echtzeit-Wartefälle (120 Sekunden und
fünf Minuten), weitere Browser sowie Tests gegen die öffentliche Produktions-
adresse. Draw und Reconnect sind mit der produktiven Engine in Workerd getestet.
Automatische Cloudflare-Hibernation bleibt unbewiesen. Die frühere fehlende
Browserprüfung aus Phase 4 ist damit für die oben genannten Phase-6-Abläufe
nachgeholt; sie ist keine pauschale Zusage über alle Schritte der Anleitung.

### Dateien dieser Phase

- Neu: `backend/src/games/tic-tac-toe.js`, `tests/unit/tic-tac-toe.test.js`.
- Registrierung: `backend/src/games/registry.js`.
- Diagnoseoberfläche: `tests/manual/client/index.html`, `app.js`, `style.css`.
- Bestehende Tests: `tests/unit/foundation.test.js`,
  `tests/unit/manual-client.test.js`, `tests/integration/backend.test.js`.
- Dokumentation: `README.md`, `docs/game-engine.md`, `docs/protocol.md`,
  `docs/manual-testing.md`, `docs/testing.md`, `docs/architecture.md`.

Keine Änderungen an `GameRoom`, `GlobalStats`, `match-flow`, Transport-Schemas,
zentralen Fristen, Outbox oder Wrangler-Konfiguration; keine neuen Abhängigkeiten.
