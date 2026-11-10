# Bestehender Engine-Vertrag

Stand 10.11.2026. Diese Beschreibung dokumentiert den lokalen Vertrag. Für ein
reines neues Frontend reicht der [API-Vertrag](backend-api.md); eine neue Engine
ist nur bei einem späteren zusätzlichen Spiel nötig. Produktiv existieren
`tic-tac-toe`, `connect-four` und `battleship`, je Version `1`, `minPlayers: 2`, `maxPlayers: 2`.
Für Tic Tac Toe gilt: Config `{}` oder
exakt `{"mode":"classic"}` wählt Classic (3×3, Gewinnlänge 3); exakt
`{"mode":"five"}` wählt 15×15 mit mindestens fünf in einer Reihe. Keine
zusätzlichen Config-Schlüssel, Eröffnungs- oder Verbotsregeln. Beide Modi zählen
Siege gemeinsam nach Namen und behalten die Config bei Rematches.

## Objekt und Funktionen

Eine Engine ist ein JavaScript-Objekt mit den folgenden Feldern (`modes` und
`canApplyStaleAction` sind optional, die übrigen sind Pflichtfelder). Alle
Funktionen werden synchron als Methoden der Engine aufgerufen, ohne Promises.

| Feld / Signatur | Vertrag und Rückgabe |
| --- | --- |
| `id` | String passend zu `^[a-z0-9-]+$`; eindeutig in der Registry. |
| `version` | Nichtleerer String, derzeit `"1"`. |
| `minPlayers` | Positive sichere Ganzzahl. |
| `maxPlayers` | Sichere Ganzzahl ≥ minPlayers; keine allgemeine Grenze auf zwei. |
| `modes` (optional) | Öffentliche Modusliste; für Tic Tac Toe `[{id:'classic',boardSize:3,winLength:3},{id:'five',boardSize:15,winLength:5}]`. |
| `validateConfig(config)` | Exakt `true` bei gültiger Konfiguration; `false`, Throw oder Promise führen zu INVALID_CONFIG. |
| `createInitialState(players, config, context)` | Neuer JSON-Zustand, dessen getStatus exakt running ergibt. |
| `handleAction(state, playerId, action)` | Neuer JSON-Zustand; ungültige Aktion durch Throw ablehnen. |
| `getPlayerView(state, playerId)` | JSON-Ansicht ausschliesslich für diesen Empfänger. |
| `getStatus(state)` | Exakt eines der unten gezeigten Statusobjekte. |
| `canApplyStaleAction(state, playerId, action)` (optional) | Exakt `true` erlaubt eine ältere Revision für eine unabhängige Aktion; Details unten. |

`players` ist die beim Start eingefrorene Teilnehmerliste mit jeweils
`playerId`, `displayName`, `nameKey`. `context` enthält exakt `matchId` und
`startingPlayerId`. Die IDs kommen vom Server, nie von einer frei behaupteten
Clientidentität. Config ist ein JSON-Objekt. Die Spiellogik darf Zustand und
Ansichten passend zum Spiel strukturieren; die Infrastruktur besitzt kein
universelles Brettschema. Die validierte Config wird als öffentliche
`room.config` schon in der Lobby übertragen und darf keine Geheimnisse enthalten.

Alle Funktionen müssen rein sein und ihre Eingaben unverändert lassen: keine
Netzwerk-, Storage-, Timer-, Uhr- oder Zufallszugriffe. Die Infrastruktur übergibt
Kopien und prüft Ausgaben. JSON-Daten bestehen aus null, Strings, Booleans,
endlichen Zahlen, dichten Arrays und einfachen Objekten; keine Zyklen,
undefined, NaN, Infinity, Promises oder Klasseninstanzen. Config-Prüfung erhält
ebenfalls eine Kopie. Kein Zustand mit versteckten JS-Laufzeitabhängigkeiten.

Zulässige Statusobjekte (jede Zeile der Tabelle ist ein eigenes Ergebnis):

| Status | Exaktes Objekt |
| --- | --- |
| Laufend | `{"type":"running"}` |
| Sieg | `{"type":"won","winnerPlayerId":"22222222-2222-4222-8222-222222222222"}` |
| Unentschieden | `{"type":"draw"}` |
| Abgebrochen | `{"type":"aborted"}` |

Keine zusätzlichen Statusfelder. Die Gewinner-ID muss einem Teilnehmer gehören.
Ein Throw in handleAction ergibt INVALID_ACTION, ein ungültiges zurückgegebenes
Ergebnis oder eine fehlerhafte Initialisierung INTERNAL_ERROR. Gespeicherter
Zustand bleibt bei Fehlschlag unverändert. Erfolgreicher Zustand, Revision,
Deduplizierung und gegebenenfalls Sieges-Outbox werden lokal atomar gespeichert.

## Start, Abbruch und geheime Informationen

Die Raumverwaltung prüft Spielerzahl, Verbindungen und Bereitschaft. Beim ersten
Start wählt der Server per Zufall einen Platz in der Teilnehmerreihenfolge; bei
Folgepartien rotiert er um einen Platz. Die Engine erhält dieses Ergebnis in
context.startingPlayerId und wählt nicht selbst. Jede Partie beginnt mit neuer
matchId und Revision 0. Die Test-Fixture für zwei bis vier Spieler gehört nicht
zur produktiven Registry.

Ein Infrastruktur-abort setzt den separaten Raumstatus auf aborted und erhöht
die Revision. Er ruft keine spezielle Engine-Aktion auf und verändert den
internen Engine-Zustand nicht. Deshalb ist immer room.status massgeblich.
Tic Tac Toe selbst produziert running, won oder draw; der allgemeine Vertrag
akzeptiert auch aborted. Nur ein Übergang von running zu won erzeugt ein
Statistikereignis; die Engine schreibt keine Statistik.

getPlayerView erhält eine Kopie des vollständigen Zustands und eine serverseitig
zugeordnete playerId. Die Engine muss verdeckte Informationen selbst filtern.
Nur die eigene Ansicht geht in welcome/state; **niemals den vollständigen
internen Zustand übertragen**. Auch bei Reconnect gilt dieser Weg. Ein Throw
oder nicht serialisierbares View-Ergebnis liefert nur INTERNAL_ERROR an diesen
Empfänger, ohne Rohzustand-Fallback oder Stacktrace. Öffentliche Raummetadaten
werden unabhängig zusammengestellt. Tic Tac Toes interne Daten enthalten ein
status-Feld, die gesendete Ansicht dagegen die in backend-api.md beschriebenen
Felder ohne status. Zu board, symbols, yourSymbol, currentPlayerId und winningLine
kommen mode, boardSize, winLength und lastMove (null oder letzter ganzzahliger
Zellindex). Alte gespeicherte Classic-Zustände ohne diese Angaben bleiben lesbar;
ein unbekannter letzter Zug wird als null ausgegeben. Classic-Gewinnlinien
behalten ihre drei Indizes, 15×15 liefert die vollständige zusammenhängende
Gewinnlinie mit mindestens fünf Feldern horizontal, vertikal oder diagonal.

## Später ein Spiel ergänzen

Im Backend liegt die zentrale Registry in `backend/src/games/registry.js`.
Eine neue reine Engine unter `backend/src/games/` implementieren, importieren und
der bestehenden Liste `createRegistry([ticTacToe, connectFour, battleship, weitereEngine])` hinzufügen.
assertEngine prüft Metadaten/Funktionen, doppelte IDs sind unzulässig.
registry.get(id) liefert die Engine oder UNKNOWN_GAME; list() veröffentlicht nur
id, version, minPlayers, maxPlayers und gegebenenfalls modes über GET /api/games.
Die Moduserweiterung von Tic Tac Toe bleibt unter derselben ID und Version;
ältere Backends ohne modes werden vom Frontend als Classic-only behandelt.
15×15 benötigt die neue Backend-Version, ein Deployment ist nicht Teil dieses
Pakets. Neue Regeln, Aktionen,
Config, Zustand und gefilterte Ansichten gehören in die neue Engine und ihre
Tests. Es gibt keinen HTTP-Endpunkt zum Hochladen oder dynamischen Registrieren.
Die Bereitstellung eines neuen Spiels benötigt später eine gesonderte Backend-
Veröffentlichung; das ist nicht Teil dieser Übergabe oder einer Designänderung.
Raumverwaltung, Transport, TTL, Rematch und Statistik sollen allgemein bleiben.

Das vorhandene Frontend registriert Darstellungen zentral in
`frontend/src/games/registry.js`: eine Map von gameId auf Darstellungsmetadaten und
`mount`.
`supportedGame(game)` prüft ID und Versionsgleichheit. `mount(container, onAction)`
liefert `{render({snapshot, playerId, canMutate})}`. onAction erhält nur das
spielabhängige action-Objekt; der allgemeine Transport ergänzt v, type,
requestId, matchId und expectedRevision. Die Darstellung nutzt Serveransichten,
keinen Engine-Import und keine verbindliche lokale Regelauswertung. Ein neues
Spiel braucht eine passende Darstellung und gegebenenfalls Config-Eingaben sowie
ein neu gebautes Frontend. Ein separates Frontend darf seine interne Registry
anders organisieren; dies ist keine zusätzlich vorgeschriebene Backend-API.


## Bestehende Engine: 4 Gewinnt

`connectFour` (`connect-four`, Version `1`) implementiert denselben reinen
synchronen Vertrag, Config exakt `{}`, zwei Spieler, sieben Spalten und sechs
Reihen. Aktion exakt `{kind:'drop',column:0}`, Spaltenindex 0–6. Der Server
bestimmt den tiefsten freien Platz, mindestens vier zusammenhängende gleiche
Steine in jeder der vier Richtungen und Draw auf vollem Brett ohne Sieg.
Startspieler `umber`, zweiter Spieler `clay`; Rematch rotiert die Zuordnung.
Das vollständige View-Schema und Grenzverhalten stehen in
[backend-api.md](backend-api.md#4-gewinnt--aktion-und-spieleransicht).
Die Ansicht berechnet keine Gewinner und setzt keine optimistischen Steine.


## Bestehende Engine: Schiffe versenken

Export `battleship` aus `backend/src/games/battleship.js`, ID `battleship`,
Version `1`, genau zwei Spieler und Config exakt `{}`. Reine private
10×10-Engine mit L-Schiff aus fünf Feldern und geraden Schiffen 4, 3, 3, 2.
Berührung ist erlaubt, Überlappung nicht. Beide bestätigen ihre Flotte; Treffer
behalten den Zug, Wasser wechselt ihn. Nur beschossene Felder werden markiert,
keine Nachbarfelder. Eigene Flotten und versenkte gegnerische Schiffe sind sichtbar;
ungetroffene gegnerische Positionen bleiben bis zum regulären Sieg privat, auch
bei Reconnect. Abbruch deckt keine Flotten auf. Rematch setzt alles zurück.
Aktionen und vollständiger View-Vertrag: [backend-api.md](backend-api.md#schiffe-versenken--aktionen-und-spieleransicht).


Optional ist `canApplyStaleAction(state, playerId, action)`: synchron und rein,
mit Kopien von Zustand und Aktion. Nur exakt `true` erlaubt eine ältere
`expectedRevision`; zukünftige Revisionen bleiben immer unzulässig. Danach wird
`handleAction` weiterhin vollständig geprüft. Ohne Hook gilt die bisherige
strikte Gleichheit. Schiffe versenken verwendet ihn ausschließlich für die erste
eigene, noch unbestätigte Flotte während `placement`. Die beiden unabhängigen
Bestätigungen können dadurch gleichzeitig ankommen. Schüsse sowie alle Aktionen
von Tic Tac Toe und 4 Gewinnt bleiben strikt revisionsgebunden.
