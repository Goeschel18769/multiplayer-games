# HTTP- und WebSocket-Protokoll v1

Alle Pfade sind relativ zur Backend-URL. Kein Login, keine Cookies, keine
Credentials und keine persistenten Sitzungstokens. Ein Spielername ist die einzige
Identitätsprüfung; derselbe normalisierte Name darf einen Platz übernehmen.
Technische UUIDs authentifizieren niemanden.

## HTTP

| Methode und Pfad | Ergebnis |
| --- | --- |
| `GET /health` | 200, `{"ok":true}` |
| `GET /api/games` | 200, Array aus `{id,version,minPlayers,maxPlayers}` mit optionalem `modes`; Produktion: `tic-tac-toe`, `connect-four` und `battleship`, je Version `1`, 2–2 Spieler |
| `GET /api/stats` | 200, Array aus `{nameKey,displayName,wins}` |
| `PUT /api/stats` | 200, aktualisiertes Statistik-Array; atomare Korrektur, siehe unten |
| `POST /api/rooms` | 201, neuer Raum, siehe unten |
| `GET /api/rooms/:code/ws?name=...` | 101 bei WebSocket-Upgrade; sonst 426 |
| `OPTIONS` auf bekannten Pfaden | 204, ohne Body |

`/` liefert absichtlich 404. Unbekannte Pfade liefern 404; andere Methoden auf
bekannten Pfaden 405 und `Allow: GET`, `Allow: GET, PUT` (Statistik) beziehungsweise `Allow: POST`. Preflight
liefert zusätzlich `Allow` einschließlich OPTIONS. HTTP-Fehler haben immer das
Schema `{"code":"CODE","message":"neutrale Beschreibung"}`.

Alle HTTP-JSON-Antworten einschließlich Fehler sowie Preflight enthalten:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS
Access-Control-Allow-Headers: Content-Type
Cache-Control: no-store
```

Keine Credentials-/Cookie-Header. CORS ist keine Authentifizierung. Der
WebSocket-Handshake akzeptiert insbesondere `Origin: null` eines später über
`file://` geöffneten Frontends. Der erfolgreiche Upgrade ist kein HTTP-JSON-Body.

Raum anlegen (`Content-Type: application/json` erforderlich):

```json
{"roomCode":" joel-ben ","gameId":"tic-tac-toe","config":{}}
```

Exakt diese drei Felder sind erforderlich; Config muss ein Objekt sein und die
Engine-Prüfung bestehen. Maximal 16384 tatsächliche Body-Bytes, unabhängig von
Content-Length. Beispiel einer erfolgreichen Antwort:

```json
{"roomCode":"JOEL-BEN","roomInstanceId":"uuid","webSocketPath":"/api/rooms/JOEL-BEN/ws"}
```

Der Ersteller verbindet sich anschließend separat, etwa über
`/api/rooms/JOEL-BEN/ws?name=Ben`. Namen müssen URL-kodiert werden. Raumcode:
trimmen, Großbuchstaben, dann `^[A-Z0-9][A-Z0-9-]{2,31}$`. Spielername: Unicode
NFC, trimmen, 1–32 Codepoints aus Buchstaben, kombinierenden Zeichen, Zahlen,
normalem Leerzeichen, `-` und `_`. Steuerzeichen sind unzulässig. Der
Identitätsschlüssel ist die Anzeigeform mit `toLowerCase()`.

Ein aktiver Raum liefert bei erneuter Anlage 409 `ROOM_EXISTS`. Auch parallele
Anlagen werden im Raum eindeutig entschieden. Fehlendes oder abgelaufenes Ziel
beim Join liefert `ROOM_NOT_FOUND` und erzeugt keinen Raum. Tic Tac Toe erlaubt
`{}` (Classic), exakt `{"mode":"classic"}` oder exakt `{"mode":"five"}`; weitere
Config-Felder sind ungültig. Die Config bleibt über Rematches unverändert.
Die Fixture bleibt ausschließlich in getrennten Testkonfigurationen.

Statistik: Siege absteigend, bei Gleichstand normalisierte Schlüssel aufsteigend
in SQLite-BINARY-Reihenfolge. Beispiel:

```json
[{"nameKey":"ben","displayName":"Ben","wins":3}]
```

### Siegestand bearbeiten oder zurücksetzen

`PUT /api/stats`, `Content-Type: application/json`, maximal 16384 Body-Bytes:

```json
{"scores":[{"displayName":"Ben","wins":4,"expectedWins":3},{"displayName":"Joël","wins":0,"expectedWins":2}]}
```

Exakt `scores` mit 1–16 Einträgen, jeweils exakt `displayName`, `wins` und
`expectedWins`. Beide Zahlen müssen nichtnegative sichere Ganzzahlen sein;
Namensnormalisierung wie beim Beitritt, doppelte normalisierte Namen unzulässig.
Ein fehlender Statistik-Eintrag entspricht `expectedWins: 0`. Alle Erwartungen
werden vor allen Änderungen in derselben SQLite-Transaktion geprüft. Ein
abweichender aktueller Wert ergibt HTTP 409 `STATS_CONFLICT` ohne Teiländerung.
Erfolg liefert die vollständige neue Liste einschließlich Einträgen mit null
Siegen; nicht übermittelte Spieler bleiben unverändert. Der Anzeigename entspricht
dem letzten Sieg oder der letzten Korrektur.

Reset ist eine Korrektur auf `wins: 0`. `processed_matches` bleibt erhalten;
bereits gezählte Siege erhöhen den Wert bei Wiederholung nicht erneut. Ein noch
nicht zugestellter Sieg zählt nach seiner Zustellung weiter. Bei unklarer
Bestätigung zuerst neu lesen, nicht automatisch erneut schreiben.

Der Schreib-Endpunkt ist wie der bestehende Namenszugang bewusst ohne Login
zugänglich. Es gibt kein Echtzeit-Abonnement. Diese API-Erweiterung ist lokal
implementiert; ihre öffentliche Verfügbarkeit erfordert ein Backend-Deployment.

## Clientnachrichten — exakte Schemas

Nur JSON-Text, maximal 16384 UTF-8-Bytes. Binärnachrichten werden abgelehnt.
Alle unten gezeigten Felder sind erforderlich; zusätzliche Felder werden
abgelehnt. `v` ist exakt 1. `requestId` und `matchId` sind Zeichenketten mit
1–64 Zeichen aus `[A-Za-z0-9_-]`; echte Match-IDs sind serverseitige UUIDs.
`expectedRevision` ist eine nichtnegative sichere Ganzzahl. `action` ist ein
spielabhängiges JSON-Objekt. Normalerweise muss die Revision exakt passen; die
erste eigene Flottenbestätigung bei Schiffe versenken erlaubt als unabhängige
Aktion eine ältere Revision (siehe unten). Eine `playerId` im Client-Payload ist unzulässig.
Die Identität kommt ausschließlich aus der aktuellen Verbindung.

```json
{"v":1,"type":"ping"}
```

```json
{"v":1,"type":"ready","requestId":"r1","ready":true}
```

```json
{"v":1,"type":"start","requestId":"r2"}
```

```json
{"v":1,"type":"action","requestId":"r3","matchId":"match-uuid","expectedRevision":0,"action":{"kind":"engine-defined"}}
```

```json
{"v":1,"type":"rematch","requestId":"r4","matchId":"match-uuid"}
```

```json
{"v":1,"type":"abort","requestId":"r5","matchId":"match-uuid"}
```

- `ping`: ungefähr alle 25000 ms; Antwort `pong`.
- `ready`: Bereitschaft auf den Boolean setzen; während einer laufenden Partie abgelehnt.
- `start`: nur die erste Partie, bei gültiger Engine-Spielerzahl, allen Plätzen verbunden und bereit.
- `action`: aktuelle Partie, laufender Status, Teilnehmeridentität und exakte Revision erforderlich.
- `rematch`: Zustimmung nach Abschluss; alle bisherigen Teilnehmer müssen zustimmen und beim Start verbunden sein. Erzeugt neue Match-ID, Rotation und verbraucht Zustimmungen.
- `abort`: jeder Teilnehmer darf eine laufende Partie abbrechen; keine Siegeswertung.

Erfolgreiche mutierende Requests werden persistent nach Spieler, Scope (`matchId`
oder Raum für ready/start) und Request-ID dedupliziert. Pro Spieler bleiben die
letzten 64 erfolgreichen Einträge über alle Scopes erhalten. Eine identische
Wiederholung bestätigt das gespeicherte ursprüngliche Ack; dieselbe ID mit
anderem Inhalt liefert `INVALID_MESSAGE`. Clients sollen eindeutige IDs verwenden
und Wiederholungen bytegleich senden. Außerhalb dieses begrenzten Fensters gelten
weiterhin Match-/Revisions-/Statusprüfungen; eine Ready-Wiederholung setzt nur den
Boolean. Keine unbegrenzte Exactly-once-Zusage für beliebig alte Request-IDs.

## Servernachrichten — exakte Schemas

Alle Nachrichten enthalten `v:1`, `type`, `roomInstanceId`, `matchId` und
`revision`. `matchId` ist vor dem ersten Start `null`, Revision dann 0.
Revision zählt erfolgreiche Aktionen und Abbruch innerhalb einer Partie; sie
zählt keine Ready- oder Rematch-Stimmen. Ein wiederholtes Request erhält sein
ursprüngliches Ack, auch wenn inzwischen eine neuere Partie existiert.

`state` enthält zusätzlich `room` und `view`. `welcome` enthält dieselben Felder
sowie `playerId`, `connectionId` und `settings` (die dokumentierten zentralen
Einstellungen aus `shared/settings.js`). `view` ist in der Lobby `null`, danach
ausschließlich das JSON-Ergebnis von `getPlayerView` für den Empfänger.

Das exakte Schema von `room`:

```js
{
  roomCode: string,
  gameId: string,
  config: object,               // öffentliche, bei Raumanlage validierte Config
  players: [{ playerId: string, displayName: string, ready: boolean, connected: boolean }],
  status: { type: 'lobby' | 'running' | 'draw' | 'aborted' },
          // oder exakt {type:'won', winnerPlayerId:string}
  participants: string[],        // eingefrorene playerIds; Lobby: []
  startingPlayerId: string | null,
  rematchVotes: string[]          // playerIds
}
```

Beispiel `welcome` in der Lobby (UUIDs hier verkürzt):

```json
{"v":1,"type":"welcome","roomInstanceId":"room-uuid","matchId":null,"revision":0,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"p1","displayName":"Ben","ready":false,"connected":true}],"status":{"type":"lobby"},"participants":[],"startingPlayerId":null,"rematchVotes":[],"config":{}},"view":null,"playerId":"p1","connectionId":"c1","settings":{"emptyRoomTtlMs":300000,"heartbeatIntervalMs":25000,"connectionTimeoutMs":120000,"maxMessageBytes":16384,"maxHttpBodyBytes":16384,"rateWindowMs":10000,"maxMessagesPerWindow":60,"dedupeEntriesPerPlayer":64,"statsRetryBaseMs":1000,"statsRetryMaxMs":60000}}
```

Beispiel `state` während einer Partie (Ansicht ist engineabhängig):

```json
{"v":1,"type":"state","roomInstanceId":"room-uuid","matchId":"match-uuid","revision":1,"room":{"roomCode":"JOEL-BEN","gameId":"tic-tac-toe","players":[{"playerId":"p1","displayName":"Ben","ready":false,"connected":true},{"playerId":"p2","displayName":"Joel","ready":false,"connected":true}],"status":{"type":"running"},"participants":["p1","p2"],"startingPlayerId":"p1","rematchVotes":[],"config":{}},"view":{"mode":"classic","boardSize":3,"winLength":3,"lastMove":0,"board":["X",null,null,null,null,null,null,null,null],"symbols":[{"playerId":"p1","symbol":"X"},{"playerId":"p2","symbol":"O"}],"yourSymbol":"X","currentPlayerId":"p2","winningLine":null}}
```

`ack` fügt ausschließlich `requestId` hinzu. `pong` hat nur die gemeinsamen Felder.
`error` fügt `code` und `message` hinzu; `requestId` nur dann, wenn die
Clientnachricht bereits vollständig validiert werden konnte. Keine Roh-Payloads,
Stacktraces, fremden Ansichten oder vollständigen Engine-Zustände in Fehlern.

```json
{"v":1,"type":"ack","requestId":"r3","roomInstanceId":"room-uuid","matchId":"match-uuid","revision":1}
```

```json
{"v":1,"type":"pong","roomInstanceId":"room-uuid","matchId":"match-uuid","revision":1}
```

```json
{"v":1,"type":"error","requestId":"r6","roomInstanceId":"room-uuid","matchId":"match-uuid","revision":1,"code":"STALE_REVISION","message":"Spielstand ist nicht aktuell."}
```

Nach erfolgreicher Mutation kommt Ack vor den individuellen State-Nachrichten.
Ein View-Fehler kann stattdessen eine einzelne neutrale Error-Nachricht liefern;
es gibt keinen Rohzustand-Fallback. Veraltete Verbindungsereignisse werden ignoriert.

## Grenzen, Heartbeat und Lebensdauer

60 Nachrichten je Verbindung in einem festen 10000-ms-Fenster, einschließlich
ungültiger Nachrichten. Darüber `RATE_LIMITED`. Der Zähler liegt im Attachment;
ein Reconnect erstellt absichtlich ein neues Verbindungsbudget. Dieses einfache
Limit ist kein globaler Missbrauchsschutz.

Ohne gültige Aktivität seit 120000 ms wird eine Verbindung getrennt. Auch
Hintergrundtabs können dadurch eine Wiederverbindung benötigen. Ein neuer leerer
Raum sowie jeder Übergang zu null lebenden Verbindungen erhalten fünf Minuten
(300000 ms) Frist. Vor Ablauf hebt Wiederverbindung die Frist auf; nach Ablauf
ist der Raum verschwunden. Bei unerkanntem Netzausfall beginnt diese Frist erst
bei dessen Erkennung. Ein Disconnect entfernt keinen Platz und wertet keine
Niederlage. Neue Namen dürfen ausschließlich vor dem ersten Start beitreten,
solange `room.match` noch `null` ist. Eine volle Lobby liefert `ROOM_FULL`.
Ab dem ersten Start stehen die Teilnehmer für die Lebensdauer der Rauminstanz
fest: Neue Namen erhalten HTTP 409 mit `ROOM_LOCKED`, auch nach `won`, `draw`
oder `aborted` und unabhängig von freien Plätzen. Bekannte normalisierte Namen
dürfen weiterhin ihren Platz übernehmen und bestehende Verbindungen ersetzen.
Nach Raumablauf und Neuanlage mit neuer `roomInstanceId` dürfen wieder neue
Namen beitreten, auch bei wiederverwendetem Raumcode.

Schließcodes: 4001 `Connection replaced`, 4002 `Activity timeout`; 4003 ist für
Raumablauf reserviert. Ein ablaufender Raum hat definitionsgemäß keine lebende
Verbindung mehr. Transportfehler: 1011 `Connection error`.

## Fehlercodes und HTTP-Zuordnung

| Code | HTTP-Status |
| --- | ---: |
| `INVALID_MESSAGE`, `INVALID_NAME`, `INVALID_ROOM_CODE`, `UNKNOWN_GAME`, `INVALID_CONFIG`, `INVALID_ACTION` | 400 |
| `ROOM_NOT_FOUND`, `NOT_FOUND` | 404 |
| `METHOD_NOT_ALLOWED` | 405 |
| `ROOM_EXISTS`, `ROOM_FULL`, `ROOM_LOCKED`, `NOT_READY`, `MATCH_NOT_RUNNING`, `STALE_MATCH`, `STALE_REVISION` | 409 |
| `MESSAGE_TOO_LARGE` | 413 |
| `UPGRADE_REQUIRED` | 426 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |

`RESULT_CONFLICT` (409) ist zusätzlich ein ausschließlich serverinterner
Statistikfehler bei widersprüchlichen Ergebnissen derselben Match-ID. Nach einem
WebSocket-Upgrade stehen Fehler als `error`-Nachricht im Protokoll; es gibt dann
keinen neuen HTTP-Status.


## Tic Tac Toe — produktive Aktion und Spieleransicht

`GET /api/games` liefert in der normalen Konfiguration:

```json
[{"id":"tic-tac-toe","version":"1","minPlayers":2,"maxPlayers":2,"modes":[{"id":"classic","boardSize":3,"winLength":3},{"id":"five","boardSize":15,"winLength":5}]},{"id":"connect-four","version":"1","minPlayers":2,"maxPlayers":2},{"id":"battleship","version":"1","minPlayers":2,"maxPlayers":2}]
```

Die Moduserweiterung bleibt bei derselben ID, Version `1` und Protokoll v1.
`modes` ist eine optionale öffentliche Fähigkeit der Engine; ältere Backends
liefern diese Liste nicht. Das Frontend bietet dann nur Classic an.

Raumanlage für Classic mit `{}` oder `{"mode":"classic"}`, für Fünf in einer
Reihe mit `{"mode":"five"}`. Das Config-Objekt darf keine weiteren Schlüssel
enthalten. Beispiel:

```json
{"roomCode":"BEN-JOEL-TTT-15","gameId":"tic-tac-toe","config":{"mode":"five"}}
```

Classic spielt auf 3×3 mit drei gleichen Zeichen. Fünf in einer Reihe spielt
auf 15×15 mit mindestens fünf gleichen Zeichen horizontal, vertikal oder entlang
beider Diagonalen. Keine besonderen Eröffnungs- oder Verbotsregeln. Bei vollem
Brett ohne Sieg gilt Unentschieden; Siegprüfung hat Vorrang. Die Config ist im
öffentlichen `room.config` auch vor Partiestart sichtbar und bleibt beim Rematch
erhalten. Das ist keine Übertragung interner Engine-Zustände; Config darf keine
Geheimnisse enthalten.

Der generische v1-Transport erhält keinen neuen Nachrichtentyp. Das exakte
`action`-Objekt ist `{"kind":"place","cell":0}`; Zellindex ganzzahlig 0–8
für Classic oder 0–224 für 15×15, keine zusätzlichen Felder.
Vollständige Clientnachricht:

```json
{"v":1,"type":"action","requestId":"ttt-1","matchId":"match-uuid","expectedRevision":0,"action":{"kind":"place","cell":0}}
```

Indizes zeilenweise:

```text
0 1 2
3 4 5
6 7 8
```

Bei 15×15 ist der Index `Zeile × 15 + Spalte` (beide ab null). `welcome.view`
und `state.view` enthalten nach Partiestart die bisherigen Felder und zusätzlich
`mode`, `boardSize`, `winLength` und `lastMove`, hier Classic nach dem ersten Zug:

```json
{"mode":"classic","boardSize":3,"winLength":3,"lastMove":0,"board":["X",null,null,null,null,null,null,null,null],"symbols":[{"playerId":"p1","symbol":"X"},{"playerId":"p2","symbol":"O"}],"yourSymbol":"X","currentPlayerId":"p2","winningLine":null}
```

`mode` ist `classic` oder `five`, `boardSize` 3 oder 15, `winLength` 3 oder 5.
Das zeilenweise Brett enthält entsprechend 9 oder 225 Felder. `lastMove` ist
der letzte ganzzahlige Zellindex oder `null` vor dem ersten Zug beziehungsweise
bei alten Zuständen ohne bekannte letzte Aktion. Alte persistierte Classic-
Zustände ohne die neuen Felder bleiben unterstützt. Ein Frontend kann alte
Classic-Antworten ohne `room.config` und neue Ansichtsangaben weiterhin lesen.

In der Lobby bleibt `view` `null`. Brettwerte sind ausschließlich `null`, `X`
oder `O`. `symbols` ordnet X und O den Teilnehmer-IDs zu; Namen stehen in
`room.players`. `yourSymbol` gilt für den Empfänger. `currentPlayerId` ist der
nächste Zugspieler oder nach regulärem Ende `null`. Bei Sieg enthält
`winningLine` bei Classic die drei Feldindizes (beispielsweise `[0,1,2]`). Bei
15×15 ist es die vollständige zusammenhängende Gewinnlinie von mindestens fünf
Feldindizes; sonst `null`.

Falscher Zugspieler, unbekannter Spieler, belegtes Feld und ungültige
Aktionsstruktur werden als `INVALID_ACTION` abgelehnt. Revision und Brett
bleiben unverändert. Stale-Match/-Revision-Prüfungen und Deduplizierung bleiben
unverändert. Nach Raum-Partieende werden weitere Aktionen bereits mit
`MATCH_NOT_RUNNING` abgelehnt.

`room.status` ist auch für Tic Tac Toe maßgeblich: Nach einem Infrastruktur-
Abbruch bleibt die Engine-Ansicht intern unverändert, aber `room.status.type`
ist `aborted`. Der Client darf dann trotz gesetzter `currentPlayerId` keinen
Zug mehr senden. Reguläre Siege werden über die bestehende Statistik-Outbox
einmalig gezählt, Draw und Abort nicht.

Der normale Hub fragt bei jedem Kachelaufruf nach dem Modus und verwendet
`BEN-JOEL-TTT` für Classic beziehungsweise `BEN-JOEL-TTT-15` für 15×15.
Manuelle Raumanlage verwendet den gewählten Modus, Beitritt den tatsächlichen
Servermodus; Reconnect erstellt keinen Raum neu. Beide Modi teilen dieselbe
globale Namensstatistik. Die 15×15-Erweiterung benötigt ein Backend-Deployment;
ein lokaler Frontend-Build veröffentlicht sie nicht.

## Eigenständige Übergabe — Phase 8

Der vollständig eigenständig lesbare [API-Vertrag](../handoff/backend-api.md)
enthält zusätzlich curl-Beispiele, vollständige Datenformen und eine
konsistente Beispielpartie. Browser können den HTTP-Fehlerbody eines
gescheiterten WebSocket-Handshakes nicht auslesen. Heartbeat-Werte aus
welcome.settings verwenden; Create/Join prüfen Ablauf unabhängig von verspäteten
Alarmen. Statistik-Outbox überlebt logischen Raumablauf, Zustellung kann verzögert
sein. Prüfbelege und Nutzerberichte stehen getrennt im
[Prüfstand](../handoff/verification.md).


## 4 Gewinnt — Aktion und Spieleransicht

`connect-four`, Version `1`, genau zwei Spieler. Config ist exakt `{}`;
zusätzliche Schlüssel oder abweichende Brettgrößen sind ungültig. Raumanlage:

```json
{"roomCode":"BEN-JOEL-C4","gameId":"connect-four","config":{}}
```

Das Brett hat sieben Spalten und sechs Reihen. Eine Aktion wählt ausschließlich
die Spalte; der Server setzt den Stein auf den tiefsten freien Platz.
Exakte Aktion (Spaltenindex als Ganzzahl von 0 bis 6):

```json
{"kind":"drop","column":0}
```

Weitere Aktionsfelder, volle Spalten, falscher Zugspieler und unbekannte Spieler
werden mit `INVALID_ACTION` abgelehnt, ohne Mutation. Nach einem Raumabschluss
liefert die Infrastruktur `MATCH_NOT_RUNNING`. Mindestens vier gleiche Steine
waagrecht, senkrecht oder diagonal gewinnen; ein volles Brett ohne Sieg ergibt
Unentschieden. Die Siegprüfung hat Vorrang vor Unentschieden.

Die Ansicht enthält das öffentliche Brett zeilenweise, Reihe 0 oben, Reihe 5
unten (Index = Reihe × 7 + Spalte, 0–41). Der Startspieler erhält `umber`,
der andere `clay`; die Zuordnung rotiert bei Rematches mit dem Startspieler.
Anzeigenamen kommen wie bisher aus `room.players`.

```json
{
  "rows": 6,
  "columns": 7,
  "winLength": 4,
  "board": [
    null, null, null, null, null, null, null,
    null, null, null, null, null, null, null,
    null, null, null, null, null, null, null,
    null, null, null, null, null, null, null,
    null, null, null, null, null, null, null,
    null, null, null, null, null, null, null
  ],
  "discs": [{"playerId":"p1","color":"umber"},{"playerId":"p2","color":"clay"}],
  "yourColor": "umber",
  "currentPlayerId": "p1",
  "winningLine": null,
  "lastMove": null
}
```

Belegte Felder sind `"umber"` oder `"clay"`. `lastMove` ist null oder der letzte
Zellindex. `winningLine` ist null oder die vollständige zusammenhängende
Gewinnreihe mit mindestens vier Indizes. Nach Sieg/Draw ist currentPlayerId null.
Ein Infrastruktur-Abbruch lässt den internen Engine-Zustand erhalten;
`room.status` bleibt maßgeblich, Eingaben sind gesperrt. Nur reguläre Siege
zählen über dieselbe Outbox global zu denselben Namenszeilen wie Tic Tac Toe.

Das Frontend öffnet die Kachel direkt, ohne Modusdialog. Es schaltet sie nur bei
passenden Spielemetadaten frei; die neue Engine muss daher separat im Backend
bereitgestellt werden. Versteckte manuelle Räume und Reconnect gelten weiterhin.
Ein manueller Join übernimmt die tatsächliche Engine des Zielraums; eine weitere
Raumanlage verwendet diese Engine und deren Config. Das nächste Betreten über
die Kachel verwendet wieder `BEN-JOEL-C4`.


## Schiffe versenken — Aktionen und Spieleransicht

`battleship`, Version `1`, genau zwei Spieler, Config exakt `{}`. Direkter
Standardraum `BEN-JOEL-SHIPS`, kein Modusdialog. Raumanlage:

```json
{"roomCode":"BEN-JOEL-SHIPS","gameId":"battleship","config":{}}
```

Nach dem allgemeinen Ready/Start beginnt die private Platzierungsphase auf
10×10 Feldern. Die Flotte besteht in fester Reihenfolge aus L-Schiff (5),
geradem 4er, geradem 3er I, geradem 3er II und geradem 2er. Die Grundform des
L-Schiffs ist `XXX / X.. / X..`: drei senkrechte Felder, vom oberen Eckfeld
zwei weitere nach rechts. Schiffe dürfen sich waagrecht, senkrecht und diagonal
berühren, aber nicht überlappen oder über den Rand ragen. Insgesamt 17 Felder.

Eine Platzierung besteht exakt aus `cell` (Ganzzahl 0–99, zeilenweise A1 bis J10)
und `rotation` (0–3 Vierteldrehungen im Uhrzeigersinn). `cell` verankert die
linke obere Ecke des umschließenden Rechtecks der gedrehten Form. Die ganze
Flotte wird einmalig bestätigt; die fünf Einträge entsprechen der obigen
Schiffsreihenfolge. Beispiel mit erlaubten Berührungen:

```json
{"kind":"placeFleet","ships":[{"cell":0,"rotation":0},{"cell":3,"rotation":0},{"cell":11,"rotation":0},{"cell":21,"rotation":0},{"cell":30,"rotation":0}]}
```

Beide Spieler dürfen ihre noch unbestätigte Flotte unabhängig abgeben, auch
wenn die andere Bestätigung inzwischen die Revision erhöht hat. Nur diese
Aktion darf eine ältere `expectedRevision` verwenden. Zukünftige Revisionen,
erneute Flottenbestätigung und sämtliche Schüsse haben keine solche Ausnahme.
Nach Bestätigung beider Flotten beginnt der vom Server bestimmte Startspieler.

```json
{"kind":"fire","cell":99}
```

Treffer und Versenken erlauben einen weiteren Schuss; Wasser wechselt den Zug.
Jedes Feld darf höchstens einmal beschossen werden. Alle fünf gegnerischen
Schiffe versenkt ergibt `won`, ohne Draw. Ungültige Aktionen, zusätzliche Felder,
falscher Spieler, falsche Phase und unzulässige Positionen werden ohne Mutation
abgelehnt. Die Aktionen liegen im unveränderten v1-`action`-Umschlag mit
`requestId`, aktueller `matchId` und `expectedRevision`.

| Feld in `view` | Inhalt |
| --- | --- |
| `boardSize`, `fleetSizes` | `10`, `[5,4,3,3,2]`. |
| `phase` | `placement`, `battle` oder `finished`. |
| `yourReady`, `opponentReady` | Boolean; jeweilige Flotte bestätigt. Getrennt von Lobby-Ready. |
| `ownBoard`, `targetBoard` | Je 100 Werte: `unknown`, `ship`, `miss`, `hit`, `sunk`. |
| `ownShips`, `opponentShips` | Arrays aus `{index,cells,sunk}`; Index 0–4, Zellindizes, Boolean. |
| `remaining` | `{you,opponent}`, je 0–5 noch nicht versenkte Schiffe; vor Bestätigung 5. |
| `currentPlayerId` | In der Schussphase die zugberechtigte ID; sonst `null`. |
| `lastShot` | `null` oder `{playerId,cell,result}` mit `miss`, `hit` oder `sunk`. |

Die eigene bestätigte Flotte ist vollständig sichtbar. Die gegnerische Ansicht
enthält vor regulärem Spielende ausschließlich tatsächliche Schüsse und bereits
versenkte Schiffe; `opponentShips` enthält bis dahin nur diese versenkten Schiffe.
Unbeschossene gegnerische Felder bleiben `unknown`. **Kein Nachbarfeld wird als
Wasser markiert**, weil Berührung erlaubt ist. Nach regulärem Sieg wird die
gegnerische Flotte vollständig sichtbar. Ein Infrastruktur-Abbruch lässt den
internen Zustand unverändert und deckt keine weiteren Positionen auf;
`room.status` sperrt dann alle Aktionen. Reconnect verwendet dieselbe gefilterte
Ansicht. Rematch beginnt mit neuer Match-ID und leeren Flotten, der Startspieler
rotiert. Siege laufen durch dieselbe deduplizierte Statistik-Outbox.
