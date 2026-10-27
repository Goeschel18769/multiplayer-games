# Implementierter Backend-Vertrag v1

Stand 23.10.2026, aus dem lokalen Implementierungsstand abgeleitet. Öffentliche
Basis-URL: **https://multiplayer-games.haldimann-joel.workers.dev**.
Alle Beispiele sind illustrative Daten, keine Live-Antworten und keine Zusage
über bestehende öffentliche Räume oder Zählerstände. Die Beispielpartie am Ende
ist in sich konsistent. Sie setzt einen freien Raumcode und leere Statistik voraus.

## HTTP

| Methode und Pfad | Erfolg / Body | Spezifische Fehler |
| --- | --- | --- |
| GET /health | 200, `{"ok":true}` | Interner Fehler 500 möglich. |
| GET /api/games | 200, Array mit id, version, minPlayers, maxPlayers | 500 |
| GET /api/stats | 200, Array mit nameKey, displayName, wins | 500, falls Statistik nicht erreichbar. |
| POST /api/rooms | 201, roomCode, roomInstanceId, webSocketPath | 400 Eingabe/Spiel/Config, 413 Body, 409 ROOM_EXISTS, 500 |
| GET /api/rooms/:code/ws?name=… | 101 WebSocket-Upgrade, kein JSON-Body | 400 Name/Code, 426 ohne Upgrade, 404 ROOM_NOT_FOUND, 409 ROOM_FULL/ROOM_LOCKED, 500 |
| OPTIONS auf jedem obigen Pfad | 204 ohne Body, Allow mit GET bzw. POST und OPTIONS | Kein Raum-/Name-/Body-Abgleich beim Preflight. |

Pfade sind exakt, ohne abschliessenden Slash. Andere Pfade (auch `/`, eine
Raumliste oder einzelne Raum-GETs) liefern 404 NOT_FOUND, auch mit OPTIONS.
Andere Methoden auf bekannten Pfaden liefern 405 METHOD_NOT_ALLOWED und
`Allow: GET` oder `Allow: POST` ohne OPTIONS. Es gibt keine öffentlichen
Statistik-Schreib-, Raum-Lösch-, Login-, Sitzungs- oder Debug-Endpunkte.
Queryparameter definieren keine weiteren Endpunkte; beim Join wird name gelesen.

Alle HTTP-JSON-Antworten, auch Fehler, verwenden Content-Type application/json
und diese Header; OPTIONS enthält dieselben CORS-/Cache-Header:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Cache-Control: no-store
```

Es gibt kein Access-Control-Allow-Credentials, keine Login-Cookies und keine
Authentifizierungsheader. HTTP im Browser mit `credentials: 'omit'` senden.
`Origin: null` von file:// ist erlaubt; auch der WS-Handshake akzeptiert diesen
Origin. CORS ist keine Authentifizierung oder Zugriffssperre. Die erfolgreiche
101-Antwort wird separat als WebSocket zurückgegeben, ohne HTTP-JSON/CORS-Hülle.

POST verlangt Content-Type application/json (Parameter wie charset=utf-8 sind
erlaubt), gültiges UTF-8 und JSON mit **exakt** roomCode, gameId und config:

```json
{"roomCode":" joel-ben ","gameId":"tic-tac-toe","config":{}}
```

roomCode muss ein gültiger String sein; gameId ist ein String einer registrierten
Engine; config ein Objekt, kein Array/null. Tic Tac Toe akzeptiert ausschliesslich
das leere Objekt. Fehlende/zusätzliche Felder oder ungültiges JSON ergeben
INVALID_MESSAGE. Die Engine-Prüfung ungültiger Config ergibt INVALID_CONFIG,
eine unbekannte ID UNKNOWN_GAME. Maximal 16384 tatsächliche Body-Bytes werden
gelesen, unabhängig von Content-Length. Erstellen verbindet noch keinen Spieler.

Spieleliste derzeit:

```json
[{"id":"tic-tac-toe","version":"1","minPlayers":2,"maxPlayers":2}]
```

Statistik ist ein Array, bei fehlenden Einträgen leer. Jeder Eintrag enthält
nameKey (normalisierter Namensschlüssel), displayName (Anzeigeform des letzten
angenommenen Sieges dieses Schlüssels) und wins (positive Ganzzahl). Sortierung:
wins absteigend, dann nameKey aufsteigend nach SQLite COLLATE BINARY.

### macOS / zsh

Beispielbefehle, nicht automatisch ausführen. Die POST-Anfrage legt tatsächlich
einen Raum an, wenn der Code frei ist. Lokal stattdessen
`API_BASE='http://localhost:8787'` bei laufendem lokalen Backend verwenden.

```zsh
API_BASE='https://multiplayer-games.haldimann-joel.workers.dev'
curl -i "$API_BASE/health"
curl -i "$API_BASE/api/games"
curl -i "$API_BASE/api/stats"
curl -i -X OPTIONS "$API_BASE/api/rooms" \
  -H 'Origin: null' -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
curl -i -X POST "$API_BASE/api/rooms" \
  -H 'Origin: null' -H 'Content-Type: application/json' \
  --data '{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","config":{}}'
curl -i "$API_BASE/"
curl -i -X POST "$API_BASE/health"
curl -i "$API_BASE/api/rooms/JOEL-BEN/ws?name=Jo%C3%ABl"
```

Die letzten drei zeigen absichtlich 404, 405/Allow GET und 426 (gültiger Code/Name,
aber kein Upgrade). curl ersetzt hier keinen WebSocket-Spielclient.
Beispiel HTTP-Fehler:

```json
{"code":"ROOM_LOCKED","message":"Teilnehmer dieser Rauminstanz stehen bereits fest."}
```

## Namen, Plätze und Raumidentität

Raumcode: String, `trim()`, `toUpperCase()`, danach Regex
`^[A-Z0-9][A-Z0-9-]{2,31}$`: 3–32 ASCII-Zeichen, zuerst Buchstabe/Ziffer,
danach auch Bindestriche. Keine automatische Entfernung ungültiger Zeichen.

Spielername: String; **vor** dem Trimmen jegliche Unicode-Steuerzeichen
(`\p{Cc}`) ablehnen. Dann Unicode NFC und trim(), danach 1–32 Unicode-Codepoints,
Regex `^[\p{L}\p{M}\p{N} _-]+$` mit Unicode-Flag. Erlaubt sind Buchstaben,
kombinierende Zeichen, Zahlen, normales Leerzeichen, Unterstrich und Bindestrich.
Keine Emoji, Tabs, Zeilenumbrüche oder inneren Sonderleerzeichen. Innere normale
Leerzeichen werden nicht zusammengezogen. displayName ist diese Anzeigeform,
nameKey exakt `displayName.toLowerCase()` (kein sprachabhängiges Case-Folding).
Ben, ben und BEN haben denselben Schlüssel; Joël und Joel bleiben verschieden.

Ein neuer Name erhält einen stabilen playerId-Platz. Disconnect entfernt keinen
Platz. Ein bekannter nameKey übernimmt seinen bisherigen Platz, aktualisiert die
Anzeigeform und erhält eine neue connectionId. Eine noch bestehende Verbindung
wird mit 4001 ersetzt; ihre späten Ereignisse sind wirkungslos. Kein Passwort,
Token oder Nachweis des früheren Besitzes ist nötig. Automatische gegenseitige
Rückübernahme vermeiden. Die beim jeweiligen Partiestart eingefrorenen Namen
werden für deren Siegerereignis verwendet.

Neue Namen dürfen nur vor dem ersten Start beitreten (intern room.match null).
Ist diese Lobby bis maxPlayers belegt, gilt ROOM_FULL / HTTP 409, auch bei
getrennten Plätzen. Ab erstem Start bleiben Teilnehmer für die gesamte
Rauminstanz fest: neue Namen immer ROOM_LOCKED / 409, auch nach won, draw und
aborted sowie bei theoretisch freien Plätzen. Bekannte Namen können weiterhin
verbinden. Es gibt keine Zuschauerplätze oder Spielerentfernung.

## WebSocket-Handshake und IDs

Nach erfolgreicher separater Raumanlage (oder zu einem bestehenden Raum):

```text
wss://multiplayer-games.haldimann-joel.workers.dev/api/rooms/JOEL-BEN/ws?name=Jo%C3%ABl
```

Das einzelne normalisierte Code-Pfadsegment mit encodeURIComponent kodieren,
den Namen mit URLSearchParams setzen. HTTPS wird WSS, lokales HTTP wird WS.
Kein WS-Subprotokoll und kein Auth-Token erforderlich. Ein normaler GET ist kein
Join; Upgrade: websocket ist erforderlich. Fehlendes/abgelaufenes Ziel wird
niemals automatisch erstellt. Der Browser erzeugt die Upgrade-Header selbst.
Eine [eigenständige URL-Vorlage](frontend-config.example.js) ist beigefügt.

Bei fehlgeschlagenem Browser-WebSocket-Handshake kann JavaScript weder dessen
HTTP-Status noch JSON-Fehlerbody auslesen. error/close daher allgemein erklären;
Browser-Netzwerkdiagnose kann je nach Browser mehr zeigen. Keine konkrete
ROOM_LOCKED-Meldung allein aus einem generischen error-Event ableiten. Nach
erfolgreichem Upgrade kommen Fehler als Protokollnachricht, ohne neuen HTTP-Status.

| Feld | Bedeutung |
| --- | --- |
| roomInstanceId | Server-UUID einer logischen Raumgeneration; Code-Wiederverwendung erzeugt neue ID. |
| playerId | Server-UUID eines Platzes; über Reconnect/Rematch derselben Rauminstanz stabil. |
| connectionId | Server-UUID der aktuellen Verbindung, bei jedem Join neu; nur welcome enthält sie. |
| matchId | Server-UUID pro Partie; vor erstem Start null; Rematch erzeugt neue ID. |
| revision | Nichtnegative sichere Ganzzahl pro Partie; Start 0, erfolgreiche Aktion oder abort +1; Ready/Stimmen/Verbindungen erhöhen sie nicht. |
| requestId | Clientkennung für eine mutierende Anfrage und deren ack/error; frische eindeutige ID verwenden. |

IDs sind technische Zuordnungen, keine Zugangsdaten. Die Verbindung bestimmt
den handelnden Spieler; Clientnachrichten dürfen keine playerId behaupten.

## Clientnachrichten: exakter Validator

Nur JSON-Textframes mit maximal 16384 UTF-8-Bytes; Binärframes werden abgelehnt.
Jede Nachricht ist ein Objekt. Alle in der Tabelle aufgeführten Felder sind
Pflichtfelder; zusätzliche Felder werden abgelehnt. v ist die Zahl **1**.
requestId und matchId: Strings mit 1–64 Zeichen, Regex `^[A-Za-z0-9_-]{1,64}$`.
Aktuelle echte matchId aus dem Server übernehmen. expectedRevision: nichtnegative
sichere Ganzzahl. action: spielabhängiges Objekt, weder null noch Array.

| type | Exakte Felder zusätzlich zu v und type |
| --- | --- |
| ping | Keine. |
| ready | requestId, ready (Boolean, true oder false). |
| start | requestId. |
| action | requestId, matchId, expectedRevision, action. |
| rematch | requestId, matchId. |
| abort | requestId, matchId. |

Vollständige Beispiele, je Objekt ein eigener Frame:

```json
{"v":1,"type":"ping"}
```

```json
{"v":1,"type":"ready","requestId":"ready-joel-1","ready":true}
```

```json
{"v":1,"type":"start","requestId":"start-1"}
```

```json
{"v":1,"type":"action","requestId":"move-1","matchId":"66666666-6666-4666-8666-666666666666","expectedRevision":0,"action":{"kind":"place","cell":0}}
```

```json
{"v":1,"type":"rematch","requestId":"rematch-joel-1","matchId":"66666666-6666-4666-8666-666666666666"}
```

```json
{"v":1,"type":"abort","requestId":"abort-example","matchId":"66666666-6666-4666-8666-666666666666"}
```

### Mutationen und Deduplizierung

ready setzt den Boolean ausser während running (dann NOT_READY). Auch nach
Abschluss ist ready technisch erlaubt; für Rematch ist es nicht erforderlich.
start gilt ausschliesslich für die erste Partie: noch kein Match, sämtliche
Plätze bereit und verbunden, Spielerzahl zwischen Engine-Minimum und -Maximum.
Jeder verbundene Spieler kann start auslösen, es gibt keinen besonderen Host.
Start setzt alle ready-Felder auf false und friert die Teilnehmer ein.

action/rematch/abort verlangen zunächst die aktuelle matchId, sonst STALE_MATCH,
und einen Teilnehmer. action und abort verlangen running, sonst
MATCH_NOT_RUNNING. action zusätzlich exakte expectedRevision, sonst
STALE_REVISION, und gültige Engine-Aktion. Jeder Teilnehmer darf abort senden;
es braucht weder Zustimmung aller noch expectedRevision. abort erhöht Revision,
setzt room.status auf aborted und zählt keinen Sieg.

rematch verlangt won/draw/aborted, während running NOT_READY. Eine Stimme je
Teilnehmer; alle eingefrorenen Teilnehmer müssen zustimmen. Mit letzter Stimme
startet sofort eine neue Partie, sofern alle verbunden und die Grenzen erfüllt
sind; sonst NOT_READY und diese letzte Mutation wird nicht gespeichert. Frühere
Stimmen bleiben erhalten. Kein zusätzliches ready/start nötig. Neue matchId,
Revision 0, leere Stimmen und ready false; Startplatz rotiert zyklisch um einen
Teilnehmer. Die erste Position wird serverseitig gewählt, nicht vom Frontend.
Disconnect ist weder Abbruch noch Niederlage, auch nicht während running.

Erfolgreiche Mutationen werden persistent nach **playerId + Scope + requestId**
gespeichert. Scope ist mitgesendete matchId oder `room` für ready/start. Pro
Spieler bleiben nur die letzten 64 erfolgreichen Einträge über alle Scopes.
Eine Wiederholung mit gleichem JSON.stringify-Ergebnis liefert das ursprünglich
gespeicherte ack, ohne erneute Mutation oder State-Broadcast. Gleicher Schlüssel
mit anderem Inhalt ergibt INVALID_MESSAGE. Auch Objektfeldreihenfolge kann den
Fingerprint ändern; Wiederholungen bytegleich senden. Fehler werden nicht als
erfolgreiche Requests gespeichert. Reconnect erhält den Cache, Raumablauf löscht
ihn. Keine unbegrenzte Exactly-once-Zusage: nach Verdrängung greifen weiterhin
Match-/Revisions-/Statusprüfungen; ready bleibt ein Boolean-Setter.

Ein ack kann deshalb eine inzwischen alte matchId/revision enthalten. Acks
bestätigen Requests und ersetzen niemals einen aktuelleren Snapshot. Neue
Aktionen sollen auf aktuellem state/welcome basieren. Bei unklarem Ausgang
nicht blind mit neuer requestId wiederholen; manuell neu verbinden und Stand
laden. Alte Socket-Callbacks/Timer anhand lokaler Verbindungsgeneration ignorieren.

## Servernachrichten und Datenformen

Jede Servernachricht enthält die Pflichtfelder v:1, type, roomInstanceId,
matchId (String oder null) und revision. Bei Lobby matchId null und revision 0.

| type | Zusätzliche Pflichtfelder | Optional |
| --- | --- | --- |
| welcome | room, view, playerId, connectionId, settings | Keine. |
| state | room, view | Keine. |
| ack | requestId | Keine. |
| pong | Keine. | Keine. |
| error | code, message | requestId nur bei bereits vollständig validierter Clientnachricht. |

welcome wird beim Join zuerst an den neuen Client gesendet, danach state an
alle aktuellen Verbindungen. Erfolgreiche Mutation: ack an den Absender, dann
individueller state an alle. Auch Join/Disconnect und Alarme können state ohne
neue Spielrevision senden. Ein View-Fehler liefert stattdessen nur ein neutrales
error, nie den internen Zustand. ready/rematch-Stimmen ändern Metadaten ohne
Revisionserhöhung, deshalb gleich hohe Revisionen nicht pauschal verwerfen.

room hat exakt diese Felder:

| Feld | Form |
| --- | --- |
| roomCode, gameId | Strings. |
| players | Array von exakt {playerId: String, displayName: String, ready: Boolean, connected: Boolean}. |
| status | Exakt {type:"lobby"}, {type:"running"}, {type:"draw"}, {type:"aborted"} oder {type:"won",winnerPlayerId: String}. |
| participants | Array der eingefrorenen playerIds; Lobby []. |
| startingPlayerId | Startspieler-ID, Lobby null. |
| rematchVotes | Array der bereits zustimmenden playerIds; anfangs []. |

view ist in der Lobby null, sonst ausschliesslich die persönliche Engine-Ansicht.
room enthält weder Config noch nameKey noch rohen Engine-Zustand.
Vollständige welcome/state-Beispiele stehen in der Beispielpartie. Weitere
vollständige Serverframes (hier nach dem ersten Zug dieser Beispielpartie):

```json
{"v":1,"type":"ack","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":1,"requestId":"move-1"}
```

```json
{"v":1,"type":"pong","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":1}
```

```json
{"v":1,"type":"error","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":1,"requestId":"stale-example","code":"STALE_REVISION","message":"Spielstand ist nicht aktuell."}
```

```json
{"v":1,"type":"error","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":1,"code":"INVALID_MESSAGE","message":"Ungültige Nachricht."}
```

### welcome.settings und Lebensdauer

settings enthält derzeit exakt die folgenden Zahlenwerte. Dies ist der
dokumentierte Serverstand; im Frontend keine unabhängige verbindliche Kopie
pflegen, sondern welcome.settings verwenden, insbesondere für den Heartbeat.

```json
{"emptyRoomTtlMs":300000,"heartbeatIntervalMs":25000,"connectionTimeoutMs":120000,"maxMessageBytes":16384,"maxHttpBodyBytes":16384,"rateWindowMs":10000,"maxMessagesPerWindow":60,"dedupeEntriesPerPlayer":64,"statsRetryBaseMs":1000,"statsRetryMaxMs":60000}
```

Zeitwerte in Millisekunden, Grössen in Bytes, andere Werte Anzahlen. Client sendet
ping ungefähr alle heartbeatIntervalMs; pong hat keine requestId. Jede strukturell
gültige Nachricht innerhalb des Limits aktualisiert lastSeen, auch eine später
regelbedingt abgelehnte Aktion. Ungültige Nachrichten zählen zum Limit, erneuern
die Aktivität aber nicht. 60 Nachrichten je Verbindung in einem festen
10-Sekunden-Fenster; darüber RATE_LIMITED vor dem Parser, deshalb ohne requestId.
Reconnect erhält ein neues Budget. Kein globaler Missbrauchsschutz.

Nach 120000 ms ohne gültige Aktivität erkennt die Wartung eine Verbindung als
still und trennt sie. Ein neuer unbetretener Raum hat sofort fünf Minuten
Leerraumfrist. Sobald keine aktuelle lebende Verbindung mehr erkannt wird,
beginnen ebenfalls 300000 ms Frist. Mindestens eine aktuelle lebende Verbindung
hebt die Leerraumfrist auf. Rechtzeitiger bekannter Wiederbeitritt erhält Plätze,
Match und roomInstanceId. Nach Ablauf gilt ROOM_NOT_FOUND; Join erstellt nichts.
Erneutes POST kann denselben Code mit neuer roomInstanceId und leerer Lobby
anlegen, dann sind wieder neue Namen erlaubt. Globale Siege bleiben erhalten.

Create/Join prüfen Ablauf selbst, auch wenn ein Alarm verspätet kommt. Bei
unerkanntem Netzwerkausfall beginnt die Leerraumfrist erst mit der Erkennung,
nicht rückwirkend zum physischen Ausfall. Hintergrundtabs oder pausierte Timer
können den Heartbeat aussetzen. Plattformalarme und Netzerkennung sind nicht
sekundengenau; kein sekundengenaues Löschversprechen. HTTP-Statistikabrufe halten
keinen Raum-WebSocket am Leben. Keine automatische Niederlage bei Timeout.

### Fehlerdefinitionen und Schliesscodes

HTTP-Fehler: exakt {code,message}, ohne v/requestId. Nach dem Upgrade error-Frame
wie oben, kein weiterer HTTP-Status. Die Tabelle ordnet auch WS-Fachfehler ihrer
internen HTTP-Kategorie zu; nicht alle Fehler entstehen an HTTP-Endpunkten.
message ist ein neutraler deutscher Text, keine Payloads/Stacktraces.

| Code | HTTP-Kategorie | Exakte message |
| --- | ---: | --- |
| INVALID_MESSAGE | 400 | Ungültige Nachricht. |
| MESSAGE_TOO_LARGE | 413 | Nachricht zu groß. |
| INVALID_NAME | 400 | Ungültiger Spielername. |
| INVALID_ROOM_CODE | 400 | Ungültiger Raumcode. |
| ROOM_EXISTS | 409 | Raum existiert bereits. |
| ROOM_NOT_FOUND | 404 | Raum existiert nicht oder ist abgelaufen. |
| ROOM_FULL | 409 | Alle Spielerplätze sind belegt. |
| ROOM_LOCKED | 409 | Teilnehmer dieser Rauminstanz stehen bereits fest. |
| UNKNOWN_GAME | 400 | Unbekanntes Spiel. |
| INVALID_CONFIG | 400 | Ungültige Spielkonfiguration. |
| NOT_READY | 409 | Teilnehmer sind noch nicht startbereit. |
| MATCH_NOT_RUNNING | 409 | Keine laufende Partie. |
| STALE_MATCH | 409 | Partiekennung ist nicht aktuell. |
| STALE_REVISION | 409 | Spielstand ist nicht aktuell. |
| INVALID_ACTION | 400 | Ungültige Spielaktion. |
| RATE_LIMITED | 429 | Nachrichtenlimit erreicht. |
| INTERNAL_ERROR | 500 | Interner Fehler. |
| NOT_FOUND | 404 | Pfad nicht gefunden. |
| METHOD_NOT_ALLOWED | 405 | Methode nicht erlaubt. |
| UPGRADE_REQUIRED | 426 | WebSocket-Upgrade erforderlich. |
| RESULT_CONFLICT | 409 | Widersprüchliches Partieergebnis. |

RESULT_CONFLICT ist ausschliesslich interner Statistik-RPC-Fehler, keine
öffentliche Schreib-API. Parse-/Grössen-/Rate-Fehler ohne vollständig validierte
Nachricht haben keine requestId. Ein View-Fehler ebenfalls nicht.

| Close-Code | Servergrund / Einordnung |
| --- | --- |
| 4001 | Connection replaced — andere Verbindung übernimmt denselben Platz. |
| 4002 | Activity timeout — keine gültige Aktivität innerhalb der Frist. |
| 4003 | Für EXPIRED reserviert; derzeit kein aktiver Sendepfad, da ein ablaufender Raum keine lebende Verbindung hat. |
| 1011 | Connection error — serverseitiger WebSocket-Fehlerhandler. |

1000 kann bei bewusstem Client-Disconnect auftreten; 1006 ist eine vom Browser
gemeldete abnormale Trennung, kein vom Backend versendeter Fachcode. Nicht jede
Unterbrechung liefert zuverlässig einen der Anwendungscodes an den Browser.

## Globale Statistik

Alle regulären Siege aller registrierten Spiele werden gemeinsam nach demselben
normalisierten Namensschlüssel gezählt, ohne Spielspalte. Aktuell gibt es nur
Tic Tac Toe. Draw, abort, Disconnect und Raumlöschung erzeugen keinen Sieg.
Der Server speichert den running→won-Abschluss und ein Ereignis mit matchId und
eingefrorenem Gewinnernamen atomar. Eine persistente Outbox liefert an ein
separates dauerhaftes GlobalStats-Durable-Object. Sie überlebt logischen
Raumablauf und Code-Wiederverwendung. Bei Fehlern weiter versuchen, exponentieller
Backoff ab 1 s bis maximal 60 s Abstand, ohne feste maximale Versuchszahl.

GlobalStats dedupliziert dauerhaft nach matchId: identisches Ergebnis zählt
einmal, widersprüchliches Ergebnis wird abgelehnt. Verlorene RPC-Bestätigung
führt nicht zu Doppelzählung. GET /api/stats kann unmittelbar nach dem Sieg noch
den alten Stand zeigen; bei Störung ist auch längere Verzögerung möglich.
Begrenzt nachladen und manuelle Aktualisierung anbieten, keine unendliche
Vordergrundschleife. Kein Live-Abonnement und keine öffentliche Schreib-API.
Lokales Backend und öffentliche Cloudflare-Instanz haben getrennte Datenbestände.

## Tic Tac Toe 3 × 3

gameId tic-tac-toe, Version als String "1", exakt zwei Spieler, nur Config {}.
action hat exakt zwei Felder: kind gleich "place", cell ganzzahlig 0–8.
Indizes zeilenweise:

```text
0 1 2
3 4 5
6 7 8
```

Die Person mit room.startingPlayerId erhält X und beginnt, die andere O.
Ansicht nach Start hat **exakt** diese fünf Felder:

| Feld | Wert / Schema |
| --- | --- |
| board | Array Länge 9, jeder Eintrag null, "X" oder "O". |
| symbols | Array Länge 2, je {playerId: String, symbol: "X" oder "O"}; X-Spieler zuerst. |
| yourSymbol | "X" oder "O", für den jeweiligen Empfänger. |
| currentPlayerId | Zugspieler-ID, bei regulärem Sieg/Draw null. |
| winningLine | null oder die drei Indizes der erkannten Gewinnlinie. |

Beide Spieler sehen dasselbe Brett/Symbole/Zugrecht/Gewinnlinie, aber ihr eigenes
yourSymbol. Es gibt kein status-Feld innerhalb dieser gesendeten view.
Nur der aktuelle Teilnehmer kann ein freies Feld setzen. Falscher Spieler,
belegtes Feld, ungültiger Index/Typ und zusätzliche Aktionsfelder ergeben
INVALID_ACTION. Kein lokales Brett vor der Serverantwort verbindlich verändern.
Revisionen zählen erfolgreiche Züge; fehlgeschlagene Züge verändern nichts.

Drei gleiche Symbole in einer der acht Reihen/Spalten/Diagonalen gewinnen.
Gewinnlinie folgt der Reihenfolge [0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7],
[2,5,8], [0,4,8], [2,4,6]. Siegprüfung hat Vorrang vor Draw, auch beim neunten
Zug. Ohne Sieg und bei vollem Brett draw. Sonst wechselt der Zugspieler.

**room.status ist verbindlich**, insbesondere nach abort: Der interne
Engine-Zustand und damit view.currentPlayerId können unverändert bleiben,
während room.status.type bereits aborted ist. Dann alle Züge sperren. Gewinner
und Statistik niemals clientseitig festlegen. UI-Hinweise und deaktivierte
Buttons dienen der Bedienung; die verbindliche Prüfung bleibt auf dem Server.

## Vollständiger Beispielablauf: Joël und Ben

Alle folgenden Daten sind **fiktive Beispiele**, keine protokollierte Online-Partie.
Zur Lesbarkeit zeigen wir je Schritt die relevanten Frames, nicht jeden identischen
Broadcast oder zwischenzeitlichen Ping. Jedes JSON-Objekt in einem Frame-Block
ist vollständig. Empfangene IDs müssen im echten Client aus den Antworten
übernommen werden; diese festen Beispiel-UUIDs nicht fest einprogrammieren.
Die erste serverseitige Startwahl fällt hier auf Joël; sie kann real anders ausfallen.

### 1. Raum erstellen

POST /api/rooms mit Content-Type application/json:

```json
{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","config":{}}
```

HTTP 201:

```json
{"roomCode":"JOEL-BEN","roomInstanceId":"11111111-1111-4111-8111-111111111111","webSocketPath":"/api/rooms/JOEL-BEN/ws"}
```

### 2. Joël und Ben getrennt verbinden

Joël öffnet wss://multiplayer-games.haldimann-joel.workers.dev/api/rooms/JOEL-BEN/ws?name=Jo%C3%ABl und erhält welcome:

```json
{"v":1,"type":"welcome","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":null,"revision":0,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true}],"status":{"type":"lobby"},"participants":[],"startingPlayerId":null,"rematchVotes":[]},"view":null,"playerId":"22222222-2222-4222-8222-222222222222","connectionId":"44444444-4444-4444-8444-444444444444","settings":{"emptyRoomTtlMs":300000,"heartbeatIntervalMs":25000,"connectionTimeoutMs":120000,"maxMessageBytes":16384,"maxHttpBodyBytes":16384,"rateWindowMs":10000,"maxMessagesPerWindow":60,"dedupeEntriesPerPlayer":64,"statsRetryBaseMs":1000,"statsRetryMaxMs":60000}}
```

Ben öffnet wss://multiplayer-games.haldimann-joel.workers.dev/api/rooms/JOEL-BEN/ws?name=Ben und erhält:

```json
{"v":1,"type":"welcome","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":null,"revision":0,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"lobby"},"participants":[],"startingPlayerId":null,"rematchVotes":[]},"view":null,"playerId":"33333333-3333-4333-8333-333333333333","connectionId":"55555555-5555-4555-8555-555555555555","settings":{"emptyRoomTtlMs":300000,"heartbeatIntervalMs":25000,"connectionTimeoutMs":120000,"maxMessageBytes":16384,"maxHttpBodyBytes":16384,"rateWindowMs":10000,"maxMessagesPerWindow":60,"dedupeEntriesPerPlayer":64,"statsRetryBaseMs":1000,"statsRetryMaxMs":60000}}
```

Der anschliessende state an beide enthält diese beiden Spieler; view bleibt null. Joëls eigene playerId bleibt die aus seinem welcome.

### 3. Beide bereit, dann erste Partie starten

Joël sendet, erhält ack; Broadcast setzt seine Bereitschaft:

```json
{"v":1,"type":"ready","requestId":"ready-joel-1","ready":true}
```

```json
{"v":1,"type":"ack","requestId":"ready-joel-1","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":null,"revision":0}
```

Ben sendet, erhält ack; danach state für beide:

```json
{"v":1,"type":"ready","requestId":"ready-ben-1","ready":true}
```

```json
{"v":1,"type":"ack","requestId":"ready-ben-1","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":null,"revision":0}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":null,"revision":0,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":true,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":true,"connected":true}],"status":{"type":"lobby"},"participants":[],"startingPlayerId":null,"rematchVotes":[]},"view":null}
```

Joël startet, bekommt ack der neuen Partie und danach state:

```json
{"v":1,"type":"start","requestId":"start-1"}
```

```json
{"v":1,"type":"ack","requestId":"start-1","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":0}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":0,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"running"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"22222222-2222-4222-8222-222222222222","rematchVotes":[]},"view":{"board":[null,null,null,null,null,null,null,null,null],"symbols":[{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"X"},{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"O"}],"yourSymbol":"X","currentPlayerId":"22222222-2222-4222-8222-222222222222","winningLine":null}}
```

Bens state ist identisch bis auf view.yourSymbol: "O". Beide Ready-Werte sind nun false.

### 4. Fünf Züge bis zum Sieg

Zug 1: Joël setzt X auf Feld 0. Clientframe, ack und resultierender state für Joël:

```json
{"v":1,"type":"action","requestId":"move-1","matchId":"66666666-6666-4666-8666-666666666666","expectedRevision":0,"action":{"kind":"place","cell":0}}
```

```json
{"v":1,"type":"ack","requestId":"move-1","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":1}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":1,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"running"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"22222222-2222-4222-8222-222222222222","rematchVotes":[]},"view":{"board":["X",null,null,null,null,null,null,null,null],"symbols":[{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"X"},{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"O"}],"yourSymbol":"X","currentPlayerId":"33333333-3333-4333-8333-333333333333","winningLine":null}}
```

Zug 2: Ben setzt O auf Feld 3. Clientframe, ack und resultierender state für Joël:

```json
{"v":1,"type":"action","requestId":"move-2","matchId":"66666666-6666-4666-8666-666666666666","expectedRevision":1,"action":{"kind":"place","cell":3}}
```

```json
{"v":1,"type":"ack","requestId":"move-2","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":2}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":2,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"running"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"22222222-2222-4222-8222-222222222222","rematchVotes":[]},"view":{"board":["X",null,null,"O",null,null,null,null,null],"symbols":[{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"X"},{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"O"}],"yourSymbol":"X","currentPlayerId":"22222222-2222-4222-8222-222222222222","winningLine":null}}
```

Zug 3: Joël setzt X auf Feld 1. Clientframe, ack und resultierender state für Joël:

```json
{"v":1,"type":"action","requestId":"move-3","matchId":"66666666-6666-4666-8666-666666666666","expectedRevision":2,"action":{"kind":"place","cell":1}}
```

```json
{"v":1,"type":"ack","requestId":"move-3","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":3}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":3,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"running"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"22222222-2222-4222-8222-222222222222","rematchVotes":[]},"view":{"board":["X","X",null,"O",null,null,null,null,null],"symbols":[{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"X"},{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"O"}],"yourSymbol":"X","currentPlayerId":"33333333-3333-4333-8333-333333333333","winningLine":null}}
```

Zug 4: Ben setzt O auf Feld 4. Clientframe, ack und resultierender state für Joël:

```json
{"v":1,"type":"action","requestId":"move-4","matchId":"66666666-6666-4666-8666-666666666666","expectedRevision":3,"action":{"kind":"place","cell":4}}
```

```json
{"v":1,"type":"ack","requestId":"move-4","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":4}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":4,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"running"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"22222222-2222-4222-8222-222222222222","rematchVotes":[]},"view":{"board":["X","X",null,"O","O",null,null,null,null],"symbols":[{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"X"},{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"O"}],"yourSymbol":"X","currentPlayerId":"22222222-2222-4222-8222-222222222222","winningLine":null}}
```

Zug 5: Joël setzt X auf Feld 2. Clientframe, ack und resultierender state für Joël:

```json
{"v":1,"type":"action","requestId":"move-5","matchId":"66666666-6666-4666-8666-666666666666","expectedRevision":4,"action":{"kind":"place","cell":2}}
```

```json
{"v":1,"type":"ack","requestId":"move-5","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":5}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":5,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"won","winnerPlayerId":"22222222-2222-4222-8222-222222222222"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"22222222-2222-4222-8222-222222222222","rematchVotes":[]},"view":{"board":["X","X","X","O","O",null,null,null,null],"symbols":[{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"X"},{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"O"}],"yourSymbol":"X","currentPlayerId":null,"winningLine":[0,1,2]}}
```

Die Revision ist jetzt 5, Gewinner Joël, Gewinnlinie [0,1,2]. Auch Ben erhält won und dieselbe Gewinner-ID; sein yourSymbol bleibt O.

### 5. Statistik lesen

GET /api/stats liefert bei anfangs leerer Statistik nach Outbox-Zustellung HTTP 200:

```json
[{"nameKey":"joël","displayName":"Joël","wins":1}]
```

Direkt zuvor wäre noch [] zulässig. Ein erneuter GET erhöht keinen Zähler. In einer echten globalen Statistik können weitere Spieler und frühere Siege enthalten sein.

### 6. Beide stimmen einem Rematch zu

Joëls Zustimmung, ack und state:

```json
{"v":1,"type":"rematch","requestId":"rematch-joel-1","matchId":"66666666-6666-4666-8666-666666666666"}
```

```json
{"v":1,"type":"ack","requestId":"rematch-joel-1","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":5}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"66666666-6666-4666-8666-666666666666","revision":5,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"won","winnerPlayerId":"22222222-2222-4222-8222-222222222222"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"22222222-2222-4222-8222-222222222222","rematchVotes":["22222222-2222-4222-8222-222222222222"]},"view":{"board":["X","X","X","O","O",null,null,null,null],"symbols":[{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"X"},{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"O"}],"yourSymbol":"X","currentPlayerId":null,"winningLine":[0,1,2]}}
```

Ben stimmt derselben alten Partie zu. Sein ack bestätigt bereits die neue Partie, danach kommt deren state:

```json
{"v":1,"type":"rematch","requestId":"rematch-ben-1","matchId":"66666666-6666-4666-8666-666666666666"}
```

```json
{"v":1,"type":"ack","requestId":"rematch-ben-1","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"77777777-7777-4777-8777-777777777777","revision":0}
```

```json
{"v":1,"type":"state","roomInstanceId":"11111111-1111-4111-8111-111111111111","matchId":"77777777-7777-4777-8777-777777777777","revision":0,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"22222222-2222-4222-8222-222222222222","displayName":"Joël","ready":false,"connected":true},{"playerId":"33333333-3333-4333-8333-333333333333","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"running"},"participants":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"startingPlayerId":"33333333-3333-4333-8333-333333333333","rematchVotes":[]},"view":{"board":[null,null,null,null,null,null,null,null,null],"symbols":[{"playerId":"33333333-3333-4333-8333-333333333333","symbol":"X"},{"playerId":"22222222-2222-4222-8222-222222222222","symbol":"O"}],"yourSymbol":"O","currentPlayerId":"33333333-3333-4333-8333-333333333333","winningLine":null}}
```

Die Rauminstanz und playerIds bleiben gleich. Ben ist jetzt Startspieler und X, Joël O. Neue matchId, Revision 0 und leere Stimmen. Bens Ansicht hat yourSymbol X. Ein erneutes ready oder start ist nicht erforderlich; die Statistik bleibt bei einem Sieg.
