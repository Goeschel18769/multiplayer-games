# Architektur

## Implementierter Stand — Phase 8

Ein npm-Projekt im Hauptordner verwaltet Backend, Frontend und Tests mit einer
`package.json` und einer Lockdatei. Der Code verwendet JavaScript-ES-Module, kein
TypeScript. Das Frontend besteht aus HTML, CSS und modularen Vanilla-JavaScript-
Quellen; esbuild erzeugt einen portablen `release/`-Ordner mit drei Dateien.
Tic Tac Toe ist als produktive Engine implementiert und über die Spieloberfläche
bedienbar. Die technische Diagnoseoberfläche bleibt separat erhalten.

Das Backend besteht aus einem Cloudflare Worker, SQLite-basierten Durable Objects
und nativen WebSockets mit der WebSocket Hibernation API. Die normale
Engine-Registry enthält `tic-tac-toe` (Version 1, genau zwei Spieler).
Unbekannte Engines liefern `UNKNOWN_GAME`. Die produktive Engine wird ebenso
wie das allgemeine Framework mit echten Workerd-Integrationstests geprüft.
Die getrennte 2–4-Spieler-Fixture bleibt ausschließlich in Testkonfigurationen.

## Verantwortung der Verzeichnisse

| Verzeichnis | Verantwortung |
| --- | --- |
| `backend/` | Wrangler-Konfiguration, Backend-Quellcode. |
| `backend/src/` | `worker.js`: HTTP-Routing, Eingabeprüfung, CORS und Weiterleitung. |
| `backend/src/rooms/` | `GameRoom`: persistente Spielerplätze, Verbindungen, Raumlebensdauer und gemeinsamer Alarm-Scheduler. |
| `backend/src/core/` | Allgemeiner Spielablauf, synchroner Engine-Vertrag, JSON-Prüfung, sichere Zustandsübergänge und individuelle Ansichten. |
| `backend/src/protocol/` | Strikte Nachrichtenschemas, Fehlercodes, HTTP-Antworten und begrenztes Body-Lesen. |
| `backend/src/stats/` | `GlobalStats`: dauerhafte globale Siege und Ergebnis-Deduplizierung in SQLite. |
| `backend/src/games/` | Einzige zentrale Engine-Registry und reine produktive Tic-Tac-Toe-Engine. |
| `frontend/` | HTML-Vorlage und Styles der normalen deutschsprachigen Spieloberfläche. |
| `frontend/src/` | ES-Modul-Einstieg und öffentliche Backend-/Protokollkonfiguration. |
| `frontend/src/core/` | HTTP, allgemeiner Raum-/Verbindungszustand, Protokollprüfung und unabhängige Statistikabrufe. |
| `frontend/src/games/` | Zentrale Darstellungs-Registry und Tic-Tac-Toe-Ansicht ohne Engine-Import oder Regelberechnung. |
| `shared/` | Gemeinsame Einstellungen, Namens- und Raumcode-Normalisierung. |
| `scripts/` | Frontend-Build mit esbuild und festem Ausgabeverzeichnis. |
| `tests/unit/` | Node-Tests für Normalisierung, Protokoll und Engine-Vertrag. |
| `tests/integration/` | Miniflare/Workerd-Tests mit echten SQLite-Durable-Objects und WebSockets. |
| `tests/fixtures/` | Deterministische Test-Engine und separater Test-Worker mit kontrollierter Uhr und Fehler-Injektion. |
| `docs/` | Architektur, Protokoll, Engine-Vertrag und Testanleitung. |
| `handoff/` | Eigenständige deutsche Frontend-Übergabe mit API-Vertrag, Engine-Vertrag, öffentlicher Konfigurationsvorlage und Prüfgrenzen; zusätzlich als handoff.zip. |
| `release/` | Generierte, nicht versionierte Ausgabe: index.html, klassisches app.js und style.css. |

Leere Platzhalterverzeichnisse bleiben durch `.gitkeep` in Git erfassbar.

## Routing und Identitäten

Es gibt genau ein `GameRoom` pro normalisiertem Raumcode:
`env.GAME_ROOMS.getByName(normalizedRoomCode)`. Kein weiteres Raumverzeichnis,
keine öffentliche Raumliste. Die zentrale Statistik liegt ausschließlich in
`env.GLOBAL_STATS.getByName("global")`.

Namen werden mit einer gemeinsamen Funktion für Raumidentität und Statistik
normalisiert: Unicode NFC, trimmen, 1–32 Unicode-Codepoints. Zulässig sind
Buchstaben, kombinierende Zeichen, Zahlen, normale Leerzeichen, Bindestrich und
Unterstrich. Steuerzeichen werden auch vor dem Trimmen abgelehnt. Der
Identitätsschlüssel ist die Anzeigeform mit `toLowerCase()`. `Ben`, `ben` und `BEN`
bezeichnen denselben Platz; beim Beitritt bleibt die neu gewählte Anzeigeform
bestehen. Das Partieergebnis verwendet die beim Partiestart eingefrorene Anzeigeform.

Raumcodes werden getrimmt und in Großbuchstaben umgewandelt; danach gilt
`^[A-Z0-9][A-Z0-9-]{2,31}$`. Unzulässige Zeichen werden abgelehnt.
Spieler erhalten zufällige stabile `playerId`s. Disconnect entfernt keinen Platz.
Eine neue Verbindung mit demselben Namensschlüssel ersetzt die bisherige.

Der Name ist absichtlich die einzige Identitätsprüfung. Es gibt keine Konten,
Passwörter, Login- oder persistenten Sitzungstokens. Eine andere Person darf
über denselben Namen den Platz übernehmen. `connectionId` und `roomInstanceId`
sind technische Generationen, keine Zugangsdaten.

## Konfiguration und Verbindungen

Die zentralen Einstellungen stehen in `shared/settings.js`:

| Einstellung | Wert |
| --- | ---: |
| `emptyRoomTtlMs` | 300000 (fünf Minuten) |
| `heartbeatIntervalMs` | 25000 |
| `connectionTimeoutMs` | 120000 |
| `maxMessageBytes` | 16384 |
| `maxHttpBodyBytes` | 16384 |
| Nachrichtenlimit je Verbindung | 60 pro festem Fenster von 10000 ms |
| Erfolgreiche Deduplizierungseinträge je Spieler | maximal 64 |
| Statistik-Retry | ab 1000 ms exponentiell, maximal 60000 ms Abstand |

Die Spielerzahl kommt ausschließlich aus der Engine-Registry. Die Infrastruktur
ist nicht grundsätzlich auf zwei Spieler beschränkt; die Fixture erlaubt zwei
bis vier Spieler.

Serverseitig werden nur `ctx.acceptWebSocket()`, `ctx.getWebSockets()` sowie
`webSocketMessage`, `webSocketClose` und `webSocketError` verwendet. Attachments
enthalten `roomInstanceId`, `playerId`, `connectionId`, `lastSeen`, `windowStart`
und `messageCount`. Der Raumzustand liegt in SQLite, Verbindungen werden aus den
Attachments und der aktuellen persistenten `connectionId` zugeordnet. Es gibt
keinen flüchtigen Verbindungs-Cache, den Hibernation verlieren könnte.

Ereignisse einer ersetzten oder früheren Raumverbindung sind wirkungslos. Die
Anwendungsschließcodes sind 4001 (ersetzt), 4002 (Aktivitätstimeout) und 4003
(für Raumablauf reserviert). Transportfehler werden mit 1011 geschlossen.

Clients sollen ungefähr alle 25 Sekunden `ping` senden; der Server antwortet
mit `pong`. Jede strukturell gültige Nachricht innerhalb des Limits aktualisiert
`lastSeen`, auch wenn ihre Spielaktion abgelehnt wird. Fehlerhafte Nachrichten
zählen zum Nachrichtenlimit, aktualisieren aber nicht die Aktivität. Zähler und
Fenster stehen im Attachment und überleben einen Konstruktor-Neuaufbau.
Hintergrundtabs können pausieren und nach 120 Sekunden Inaktivität eine
Wiederverbindung benötigen.

## Lebensdauer und Alarm-Scheduler

Ein neu angelegter leerer Raum erhält sofort `emptySince` und eine Frist von
fünf Minuten. Solange eine aktuelle lebende Verbindung existiert, gilt keine
Leerraumfrist. Beim Übergang auf null Verbindungen beginnt sie; ein Beitritt vor
Ablauf hebt sie auf. Nach Ablauf wird die Raumzeile einschließlich Spielzustand,
Spielerplätzen und Request-Deduplizierung logisch gelöscht.

Stille Verbindungen werden nach 120 Sekunden erkannt und getrennt. Bei einem
unerkannten Netzausfall beginnt die Leerraumfrist erst bei dessen Erkennung.
Der Server kennt den tatsächlichen Ausfallzeitpunkt nicht. Die Prüfungen laufen
auch bei Create und Join, sodass ein verspäteter Alarm keinen bereits
abgelaufenen Raum durch einen Beitritt wiederbeleben lässt.

Jede Neuanlage erhält eine zufällige `roomInstanceId`, jede Partie eine eigene
zufällige `matchId`. Alarme werten ausschließlich die aktuelle persistente
Raumgeneration, Fristen und aktuellen Attachments aus. Ein früherer Alarm kann
daher keine neue aktive Rauminstanz löschen.

Ein gemeinsamer Scheduler plant immer das Minimum aus Leerraumfrist,
Aktivitätsfrist jeder aktuellen Verbindung und nächstem Outbox-Versuch. Es gibt
keine dauerhaften `setInterval`-Schleifen. Wiederholte oder verspätete Alarme sind
idempotent. Ohne Raum und ohne Outbox wird der Alarm entfernt.

## Spielablauf und verdeckte Informationen

Der Server ist die einzige Autorität über Zustand und Regeln. Der
[Engine-Vertrag](game-engine.md) prüft JSON-Daten, Ergebnisse und Gewinner. Die
Engine erhält Kopien; fehlgeschlagene Aktionen verändern den gespeicherten
Zustand nicht. Mit dem ersten Start stehen die Teilnehmer für die gesamte
Lebensdauer der Rauminstanz fest. Start verlangt die
Engine-Spielerzahl, verbundene Teilnehmer und deren Bereitschaft. Der erste
Startplatz wird serverseitig gewählt, Folgematches rotieren zyklisch.

Rematch verlangt ein abgeschlossenes Ergebnis und Zustimmung aller bisherigen
Teilnehmer. Die Zustimmungen werden beim Start verbraucht. Neue Namen dürfen
nur beitreten, solange `room.match` noch `null` ist. Eine volle Lobby liefert
`ROOM_FULL` (HTTP 409); nach dem ersten Start gilt für neue Namen `ROOM_LOCKED`
(HTTP 409), auch nach `won`, `draw` oder `aborted`. Bekannte normalisierte Namen
dürfen weiterhin ihren bisherigen Platz übernehmen und Verbindungen ersetzen.
Nach Ablauf und Neuanlage mit neuer `roomInstanceId` ist die Aufnahme neuer Namen
wieder möglich, auch bei gleichem Raumcode. Ein Teilnehmer darf
abbrechen; Disconnect wird nie als Niederlage oder Sieg gewertet.

Nur `engine.getPlayerView(state, playerId)` erzeugt Spielansichten. Öffentliche
Raummetadaten werden getrennt zusammengestellt. Auch Welcome und Reconnect
verwenden diesen Weg. Ein Ansichtsfehler erzeugt ausschließlich einen neutralen
Fehler für die betreffende Verbindung, niemals einen Fallback auf den
vollständigen Zustand. Anwendungscode protokolliert keine Namen, beliebigen
Payloads oder verdeckten Zustände.

## Atomarität und globale Statistik

Raumzustand und Outbox-Eintrag werden bei einem Sieg in einer synchronen lokalen
SQLite-Transaktion gespeichert, bevor ein RPC erfolgt. Erfolgreiche Requests
werden begrenzt nach Spieler, Request-ID und Raum-/Partie-Scope dedupliziert.
Match-ID und Revision verhindern zusätzlich alte Aktionen. Start, Rematch und
Abschluss laufen ohne asynchronen Unterbruch innerhalb dieser Mutation.

`GlobalStats` führt `wins` und `processed_matches`. Sieger-Normalisierung,
Ergebnis-Deduplizierung und Erhöhung sind atomar. Dieselbe `matchId` mit identischem
Ergebnis ist erfolgreich ohne erneutes Zählen; ein Widerspruch wird abgelehnt.
Nur `won` erzeugt ein Statistikereignis. Es gibt keinen HTTP-Endpunkt zum
Eintragen von Siegen und kein Statistik-Abonnement.

Die unabhängige `outbox`-Tabelle überlebt die logische Raumlöschung. Vor jedem
RPC wird die nächste Retry-Frist dauerhaft gesetzt. Nach bestätigtem `{ok:true}`
wird nur der zugehörige Outbox-Eintrag entfernt. Bei Fehlern bleibt er mit
begrenztem exponentiellem Backoff unbegrenzt erhalten. Eine verlorene Bestätigung
verursacht dank `processed_matches` keine doppelte Zählung. Widersprüchliche
Ergebnisse bleiben zur späteren Fehlerklärung ebenfalls ausstehend.

Nach einem ausgehenden RPC wird ausschließlich die Outbox nach `matchId`
aktualisiert und der Scheduler aus aktuellen Daten neu berechnet. Kein früherer
Raumsnapshot wird zurückgeschrieben. Dadurch bleiben zwischenzeitliche
Reconnects, Raumlöschung und Wiederverwendung erhalten. Kein pauschales
`deleteAll()` löscht unbestätigte Ergebnisse oder deren Alarm.

## Wrangler und geprüfte offizielle Grundlagen

`backend/wrangler.jsonc` verwendet ausschließlich deklarative `exports` mit
`type: "durable-object"` und `storage: "sqlite"`, dazu lokale Bindings. Keine
konkurrierende `migrations`-Deklaration und keine Remote-Bindings. Geprüft gegen
das installierte Schema von Wrangler 4.152.0 und per Deployment-Dry-Run.
Es wird weder deployt noch eine Cloudflare-Kontoeinstellung geändert.

Am 23.10.2026 vor der Implementierung geprüft:

- [Getting started](https://developers.cloudflare.com/durable-objects/get-started/)
- [WebSockets und Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Durable Object class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)

## Implementiertes Frontend — Phase 7

Die Quellen in `frontend/src/` sind ES-Module. Ein kleines zentrales Registry-
Modul ordnet die `gameId` der passenden Darstellung zu. Transport und allgemeiner
Raumzustand enthalten keine Tic-Tac-Toe-Sonderfälle. Die Darstellung erhält nur
Serveransichten, übernimmt keine Backend-Engine und berechnet keine Spielregeln.
Unbekannte Spiele werden verständlich als nicht unterstützt angezeigt.

`RoomConnection` verwendet den bestehenden Welcome/Ack/State-Ablauf. Eine lokale
Generation schützt vor alten Socket-Callbacks und Heartbeat-Timern. Erfolgreiche
Mutationen warten auf Ack und passenden State. Bleibt eine Bestätigung unklar,
wird keine neue Aktion automatisch gesendet: manuelles Reconnect lädt den
verbindlichen Stand. Acks setzen keine aktuellen IDs/Revisionen zurück. Nach
Abbruch sperrt der maßgebliche `room.status` sämtliche Züge.

Die normale Oberfläche zeigt keine technischen IDs, keine Rohzustände und keine
Fixture-Schaltflächen. Namen und Servertexte werden als Text gerendert. Name und
Raumcode bleiben ausschließlich im Arbeitsspeicher. Verlassen trennt nur die
Verbindung, nicht den reservierten Spielerplatz. Die bestehende Fünf-Minuten-
Frist und die Statistik-Outbox werden im Backend nicht verändert.

`scripts/build-frontend.mjs` bereinigt ausschließlich den fest bestimmten
Projektordner `release/`. Es bündelt mit `platform: browser`, `format: iife` und
`splitting: false`, kopiert die HTML-Vorlage und CSS und liefert genau drei
Dateien. Relative Assets und ein klassisches Skript mit `defer` erlauben direktes
Öffnen über `file://` und das Verschieben des ganzen Ordners. Es gibt keine
Laufzeit-Imports, lokalen fetch-Aufrufe, externen Assets oder Konfigurationsabrufe.
HTTP-Anfragen gehen ausschließlich an das konfigurierte Backend; WS/WSS wird
daraus abgeleitet. CORS ist weiterhin keine Authentifizierung.

`frontend/src/config.js` enthält die öffentliche Cloudflare-Adresse und
Protokollversion 1. Änderungen brauchen einen neuen Build. Zugangsdaten bleiben
außerhalb der Browserdateien. Die lokale Test-Build-Konfiguration ist getrennt
in `tests/fixtures/frontend-local-config.js` und wird ausschließlich bei
`--local-test` eingebündelt. Die normale Ausgabe enthält sie nicht.

Statistikabrufe blockieren keine Partie. Nach einem regulären Sieg erfolgen
höchstens drei Abrufe mit begrenzten Pausen; ansonsten nur beim Öffnen und auf
manuelle Anforderung. Technische Diagnoseoberfläche, Backend und reguläre
Serverkonfigurationen bleiben unverändert. Die eigenständige
[Übergabedokumentation](../handoff/README.md) ist seit Phase 8 vorhanden.
Phase 8 ergänzt ausschliesslich Dokumentation und eine öffentliche
Konfigurationsvorlage, ohne Funktionsänderung, Designumbau oder Deployment.
