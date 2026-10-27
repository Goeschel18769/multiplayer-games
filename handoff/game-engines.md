# Bestehender Engine-Vertrag

Stand 23.10.2026. Diese Beschreibung definiert keine neue Schnittstelle. Für ein
reines neues Frontend reicht der [API-Vertrag](backend-api.md); eine neue Engine
ist nur bei einem späteren zusätzlichen Spiel nötig. Produktiv existiert allein
`tic-tac-toe`, Version `1`, `minPlayers: 2`, `maxPlayers: 2`, Config `{}`.

## Objekt und Funktionen

Eine Engine ist ein JavaScript-Objekt mit folgenden Pflichtfeldern. Alle
Funktionen werden synchron als Methoden der Engine aufgerufen, ohne Promises.

| Feld / Signatur | Vertrag und Rückgabe |
| --- | --- |
| `id` | String passend zu `^[a-z0-9-]+$`; eindeutig in der Registry. |
| `version` | Nichtleerer String, derzeit `"1"`. |
| `minPlayers` | Positive sichere Ganzzahl. |
| `maxPlayers` | Sichere Ganzzahl ≥ minPlayers; keine allgemeine Grenze auf zwei. |
| `validateConfig(config)` | Exakt `true` bei gültiger Konfiguration; `false`, Throw oder Promise führen zu INVALID_CONFIG. |
| `createInitialState(players, config, context)` | Neuer JSON-Zustand, dessen getStatus exakt running ergibt. |
| `handleAction(state, playerId, action)` | Neuer JSON-Zustand; ungültige Aktion durch Throw ablehnen. |
| `getPlayerView(state, playerId)` | JSON-Ansicht ausschliesslich für diesen Empfänger. |
| `getStatus(state)` | Exakt eines der unten gezeigten Statusobjekte. |

`players` ist die beim Start eingefrorene Teilnehmerliste mit jeweils
`playerId`, `displayName`, `nameKey`. `context` enthält exakt `matchId` und
`startingPlayerId`. Die IDs kommen vom Server, nie von einer frei behaupteten
Clientidentität. Config ist ein JSON-Objekt. Die Spiellogik darf Zustand und
Ansichten passend zum Spiel strukturieren; die Infrastruktur besitzt kein
universelles Brettschema.

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
status-Feld, die tatsächlich gesendete Ansicht dagegen nur die fünf in
backend-api.md beschriebenen Felder.

## Später ein Spiel ergänzen

Im Backend liegt die zentrale Registry in `backend/src/games/registry.js`.
Eine neue reine Engine unter `backend/src/games/` implementieren, importieren und
der bestehenden Liste `createRegistry([ticTacToe, weitereEngine])` hinzufügen.
assertEngine prüft Metadaten/Funktionen, doppelte IDs sind unzulässig.
registry.get(id) liefert die Engine oder UNKNOWN_GAME; list() veröffentlicht nur
id, version, minPlayers, maxPlayers über GET /api/games. Neue Regeln, Aktionen,
Config, Zustand und gefilterte Ansichten gehören in die neue Engine und ihre
Tests. Es gibt keinen HTTP-Endpunkt zum Hochladen oder dynamischen Registrieren.
Die Bereitstellung eines neuen Spiels benötigt später eine gesonderte Backend-
Veröffentlichung; das ist nicht Teil dieser Übergabe oder einer Designänderung.
Raumverwaltung, Transport, TTL, Rematch und Statistik sollen allgemein bleiben.

Das vorhandene Frontend registriert Darstellungen zentral in
`frontend/src/games/registry.js`: eine Map von gameId auf `{title, version, mount}`.
`supportedGame(game)` prüft ID und Versionsgleichheit. `mount(container, onAction)`
liefert `{render({snapshot, playerId, canMutate})}`. onAction erhält nur das
spielabhängige action-Objekt; der allgemeine Transport ergänzt v, type,
requestId, matchId und expectedRevision. Die Darstellung nutzt Serveransichten,
keinen Engine-Import und keine verbindliche lokale Regelauswertung. Ein neues
Spiel braucht eine passende Darstellung und gegebenenfalls Config-Eingaben sowie
ein neu gebautes Frontend. Ein separates Frontend darf seine interne Registry
anders organisieren; dies ist keine zusätzlich vorgeschriebene Backend-API.
