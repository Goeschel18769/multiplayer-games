# Synchroner Engine-Vertrag

Der seit Phase 3 bestehende Vertrag wird in Phase 6 von der ersten produktiven
Engine `backend/src/games/tic-tac-toe.js` erfüllt. Die separate Test-Engine liegt
in `tests/fixtures/engine.js`. `backend/src/games/registry.js` ist die einzige
produktive Registrierungsstelle und enthält Tic Tac Toe, keine Fixture. Neue
Spiele werden dort registriert; Raumverwaltung und Transport benötigen keine
Spiel-Sonderfälle.

```js
{
  id: 'game-id',           // nichtleerer Bezeichner: [a-z0-9-]+
  version: '1',            // nichtleere Zeichenkette
  minPlayers: 2,           // positive sichere Ganzzahl
  maxPlayers: 4,           // sichere Ganzzahl >= minPlayers
  validateConfig(config), // exakt true für gültige Config, sonst false/throw
  createInitialState(players, config, context), // JSON-Zustand
  handleAction(state, playerId, action),        // neuer JSON-Zustand oder throw
  getPlayerView(state, playerId),               // nur erlaubte JSON-Spieleransicht
  getStatus(state),                            // eines der Ergebnisse unten
}
```

Alle Funktionen sind synchron und rein: keine Netzwerk-, Storage- oder
Timer-Abhängigkeiten. Promise-Rückgaben sind keine gültigen Ergebnisse. Die
Infrastruktur gibt Kopien hinein und prüft Ausgaben. Config und State müssen
verlustfrei JSON-serialisierbar sein: keine Zyklen, `undefined`, `NaN`, Infinity,
Promises, Klasseninstanzen oder Arrays mit Lücken. `validateConfig` prüft eine
Kopie und verändert nicht die tatsächlich gespeicherte Config.

`players` ist die je Partie eingefrorene Liste
`[{playerId, displayName, nameKey}, ...]`. `context` enthält ausschließlich
serverseitige Werte: `{matchId, startingPlayerId}`. Die Initialisierung muss
einen Zustand mit Status `running` liefern.

Exakte `getStatus`-Ergebnisse:

```json
{"type":"running"}
```

```json
{"type":"won","winnerPlayerId":"player-id"}
```

```json
{"type":"draw"}
```

```json
{"type":"aborted"}
```

Zusätzliche Statusfelder sind unzulässig. Ein Gewinner muss der eingefrorenen
Teilnehmerliste angehören. Erst nach validiertem Ergebnis werden Zustand,
Revision, Deduplizierung und gegebenenfalls Statistik-Outbox atomar gespeichert.
Eine geworfene Aktion liefert `INVALID_ACTION`; fehlerhafte Engine-Ergebnisse
liefern `INTERNAL_ERROR`. Beide lassen den gespeicherten Zustand unverändert.

`getPlayerView` erhält eine Kopie des vollständigen Zustands und die
serverseitig zugeordnete Identität. Die Engine ist verantwortlich für die
Filterung ihrer verdeckten Informationen. Niemals fremde Geheimnisse in die
Ansicht aufnehmen. Der Transport sendet ausschließlich das Ergebnis dieser
Funktion, auch bei Welcome und Reconnect. Ein Ansichtsfehler wird isoliert als
`INTERNAL_ERROR` gemeldet, ohne Rohzustand oder interne Fehlermeldung.

Die Infrastruktur verwaltet Bereitschaft, Verbindungen und den Partiestatus in
öffentlichen Metadaten. Ein explizites `abort` setzt diesen maßgeblichen Status
auf `aborted` und erhöht die Revision, ohne eine spielabhängige Engine-Aktion zu
erfinden. Der interne Engine-Zustand bleibt dabei erhalten; Clients müssen den
öffentlichen Partiestatus beachten. Es wird kein Sieg registriert.

Erster Start: Engine-Spielerzahl, alle vorhandenen Teilnehmer verbunden und
bereit. Der erste Startplatz wird serverseitig gewählt. Alle Folgepartien
rotieren in der eingefrorenen Teilnehmerreihenfolge um einen Platz. Eine neue
`matchId` und Revision 0 markieren jede Partie. Nach `won`, `draw` oder `aborted`
können alle bisherigen Teilnehmer einem Rematch zustimmen; beim tatsächlichen
Start müssen sie verbunden sein. Ready ist dann nicht zusätzlich nötig.
Verbrauchte Zustimmung wird zurückgesetzt. Ab dem ersten Start stehen die
Teilnehmer für die gesamte Rauminstanz fest, auch nach Partieende. Neue Namen
werden mit `ROOM_LOCKED` abgelehnt; bekannte Namen können ihren Platz weiterhin
übernehmen. Erst eine neu angelegte Rauminstanz nimmt wieder neue Namen auf.

Die Fixture erlaubt zwei bis vier Spieler, reproduzierbare Startpositionen,
private Daten pro Spieler, gültige Schritte, ungültige Aktionen, Sieg,
Unentschieden und Abbruch. Diese Steueraktionen, die deterministische Startwahl
und Fehler-Injektion existieren nur im Test-Bundle.


## Produktive Engine: Tic Tac Toe 3 × 3 — Phase 6

Export: `ticTacToe` aus `backend/src/games/tic-tac-toe.js`. ID `tic-tac-toe`,
Version `1`, genau zwei Spieler (`minPlayers: 2`, `maxPlayers: 2`). Nur die leere
Config `{}` ist gültig. Die produktive Registry liefert genau diese Engine.

Das Brett ist ein Array aus neun Feldern, zeilenweise mit Indizes 0–8.
Leere Felder sind `null`, belegte `"X"` oder `"O"`. Der durch die Infrastruktur
bestimmte `context.startingPlayerId` erhält X und beginnt; der andere Teilnehmer
spielt O. Die Engine wählt weder zufällig noch anhand einer Uhr einen Startspieler.

Exakte Engine-Aktion: `{"kind":"place","cell":0}`. Ein Zug setzt genau ein
leeres Feld und wechselt den Spieler, solange die Partie läuft. Falsche/zusätzliche
Felder, unbekannter Aktionstyp, nicht ganzzahliger oder außerhalb 0–8 liegender
Index, unbekannter Spieler, falscher Zugspieler, belegtes Feld und Aktionen nach
Partieende werden ohne Zustandsänderung abgelehnt (`INVALID_ACTION` durch die
Infrastruktur, nach abgeschlossenem Raumstatus `MATCH_NOT_RUNNING`).

Alle acht Reihen, Spalten und Diagonalen werden geprüft. Drei gleiche Zeichen
gewinnen; erst danach wird ein volles Brett als Unentschieden gewertet. Deshalb
kann auch der neunte Zug noch gewinnen. `getStatus` liefert exakt `running`,
`won` mit Gewinner-ID oder `draw` im oben beschriebenen Schema. Es gibt keine
Statistikaufrufe in der Engine; ein Sieg läuft durch die bestehende Outbox.

Interner Zustand: `{board,symbols,currentPlayerId,winningLine,status}`. Jede
Funktion lässt Eingaben unverändert. Zurückgegebene Arrays und Objekte werden
kopiert; State und Ansichten sind JSON-Daten. Netzwerk, Storage, Datum und Zufall
gehören nicht zu dieser Engine.

Exakte Spieleransicht:

```json
{
  "board": [null, null, null, null, null, null, null, null, null],
  "symbols": [{"playerId":"p1","symbol":"X"},{"playerId":"p2","symbol":"O"}],
  "yourSymbol": "X",
  "currentPlayerId": "p1",
  "winningLine": null
}
```

`symbols` ist in der Reihenfolge X, O. Anzeigenamen kommen aus öffentlichen
Raummetadaten und werden nicht in der Engine dupliziert. Beide Spieler sehen das
öffentliche Brett, aber `yourSymbol` gehört jeweils zum Empfänger. Unbekannte
Spieler-IDs erhalten keine Ansicht. Bei Sieg enthält `winningLine` die drei
Feldindizes, sonst `null`. Nach regulärem Sieg oder Unentschieden ist
`currentPlayerId` `null`.

Ein Infrastruktur-Abbruch schreibt den Engine-Zustand nicht um. Deshalb kann
`currentPlayerId` in dieser Ansicht nach `abort` noch gesetzt sein. Maßgeblich
bleibt `room.status.type === "aborted"`; die Diagnoseoberfläche sperrt dann alle
Brettbuttons. Rematch beginnt mit leerem Brett und neuer Match-ID; der rotierte
Startspieler erhält jeweils X. Raum-, Transport- und Statistik-Kern bleiben
unverändert, ebenso die fünf Minuten Leerraumfrist.
