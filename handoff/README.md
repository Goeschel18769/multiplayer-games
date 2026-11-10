# Technische Frontend-Übergabe — multiplayer-games

Stand: 10.11.2026 (Spielhub, Score-Korrektur, Tic-Tac-Toe-Modi, 4 Gewinnt und Schiffe versenken).
Dieses Paket beschreibt den tatsächlich vorhandenen Quellcode, unabhängig
vom bisherigen Projekt und Chat. Es ermöglicht, in einem
separaten Projekt ein kompatibles Frontend zu gestalten oder neu zu entwickeln.
Das Frontend verwendet warme Papieroptik, Hell-, Dunkel- und einen eigenständigen
Büro-Modus. Der kompakte Hub zeigt ohne Seitennamen oder Einleitung Spielkacheln
mit generierten Bildvorschauen. Tic Tac Toe öffnet die Spielmoduswahl;
4 Gewinnt führt direkt in seinen Standardraum und verwendet warme Brauntöne.
Schiffe versenken ergänzt eine dritte Bildkachel und den direkten Standardraum
`BEN-JOEL-SHIPS`, ebenfalls ohne Moduswahl. Die Spielseite verwendet deutliche
Wasserblau-Töne, detaillierte Militärschiffe in Draufsicht und eine entsprechende
Hub-Vorschau. Hell und Dunkel besitzen eigene blaue Flächen; Büro bleibt
zurückhaltend blaugrau. Rümpfe folgen exakt den bekannten belegten Feldern und
Drehungen, Treffer bleiben darüber sichtbar.
Die Spielerwahl erfolgt beim ersten Öffnen im Tab per
Ben-/Joël-Dialog. Im hervorgehobenen Score oben mittig öffnet der eigene Name die Wahl
erneut und die Zahlen den Editor. Eine kleine Lasche oben rechts verbirgt die
Darstellungsauswahl bis Hover, Fokus oder Antippen. Weitere Gestaltung kann darauf
aufbauen; der Backend-Vertrag bleibt erhalten.

Das öffentliche Backend ist ein Cloudflare Worker mit SQLite Durable Objects:
**https://multiplayer-games.haldimann-joel.workers.dev**.
Das gebaute Frontend wird lokal über `file://` geöffnet und verbindet sich über
HTTPS/WSS. Spieler benötigen Internet, einen Browser und den vollständigen
Release-Ordner, aber keine Installation und keinen lokalen Server.

Implementiert sind Raumerstellung, getrenntes Beitreten, stabile Spielerplätze,
Verbindungsübernahme, Heartbeat, fünf Minuten Leerraumfrist, Ready/Start,
Rematch, Abbruch und dauerhafte globale Siegestatistik. Produktiv registriert ist
**Tic Tac Toe**, ID `tic-tac-toe`, Version `1`, genau zwei Spieler:
Classic (3×3, drei in einer Reihe) und Fünf in einer Reihe (15×15, mindestens
fünf horizontal, vertikal oder diagonal, ohne Eröffnungs- oder Verbotsregeln).
Außerdem **4 Gewinnt**, ID `connect-four`, Version `1`, zwei Spieler,
7 Spalten × 6 Reihen mit Schwerkraft und mindestens vier gleichen Steinen
waagrecht, senkrecht oder diagonal. Config ist exakt `{}`; direkter Standardraum
`BEN-JOEL-C4`. Außerdem **Schiffe versenken**, ID `battleship`, Version `1`,
zwei Spieler, Config exakt `{}`: 10×10, ein L-Schiff aus fünf Feldern und gerade
Schiffe 4, 3, 3, 2. Berührung erlaubt, Überlappung nicht. Manuell setzen/drehen
oder zufällig platzieren, dann eigene Flotte bestätigen. Treffer behält den Zug;
Wasser wechselt ihn. Nur tatsächliche Schüsse werden markiert, keine Nachbarn.
Gegnerische Positionen bleiben bis zum Versenken bzw. regulären Sieg privat.
Siege aller Spiele zählen zusammen. Neue Engines benötigen ein
separates Backend-Deployment; ältere Backends lassen die Kachel deaktiviert.
Das Backend wurde am 10.11.2026 nach Freigabe veröffentlicht; die öffentliche
Spieleliste bestätigt nun alle drei produktiven Engines einschließlich beider
Tic-Tac-Toe-Modi. Aktuelle Worker-Version: `fd1b9517-76b7-4ce1-af96-36cb29572b0f`.
Healthcheck erfolgreich. Die lokale Schiffe-Regression umfasst 129 Unit- und
25 Workerd-Integrationstests; der vollständige Zweispielerablauf ist im Browser
geprüft (siehe verification.md). Das allgemeine
Raumframework ist nicht grundsätzlich auf zwei Spieler beschränkt.

Technik: HTML, CSS und Vanilla JavaScript mit ES-Modulen in den Quellen, kein
TypeScript. Für `file://` werden die Quellen in ein klassisches JavaScript-Bundle
gebündelt. Es gibt keine Konten, Passwörter oder Sitzungstokens. Der normalisierte
Name ist bewusst eine übernehmbare Identität: Wer denselben Namen eingibt, darf
den Platz übernehmen und die alte Verbindung ersetzen. IDs sind keine Secrets.

Neu ist `PUT /api/stats` zur atomaren Score-Korrektur und zum Reset mit
`expectedWins` als Konfliktschutz. Der Endpunkt ist ebenfalls ohne Login.
Die lokale Implementierung und ein öffentliches Deployment sind getrennt;
die neue API wurde in Phase 9 nicht öffentlich deployt.
Die anschließende Hub-Vereinfachung änderte keine Backend-API und deployte nichts.

Nach der Moduswahl führt die Kachel beide Spieler desselben Modus in den
gemeinsamen Standardraum `BEN-JOEL-TTT` (Classic) oder `BEN-JOEL-TTT-15` (15×15).
In der Spielansicht ist manuelle Raumanlage und Beitritt über einen versteckten
Raumdialog möglich. Anlage behält die gewählte Config, Join übernimmt den
Servermodus; die Raumwahl gilt nur bis zur Rückkehr zum Hub. Tic Tac Toe fragt
beim nächsten Einstieg erneut nach dem Modus, 4 Gewinnt und Schiffe versenken öffnen direkt ihren Standardraum. Reconnect behält den aktuellen Raum ohne erneute
Anlage; Rematch behält dessen Config. Siege beider Modi zählen global pro Name.
Die Spielerwahl wird optional
per `sessionStorage` für den aktuellen Tab gemerkt; blockierter Speicher
verhindert die Nutzung nicht. Ein Spielerwechsel im Spiel trennt die Verbindung
und führt zum Hub zurück.

Die Moduserweiterung ist kompatibel zu Protokoll v1: optionales `modes` in der
Spieleliste, öffentliche `room.config` und zusätzliche Modus-/Brettangaben samt
`lastMove` in den Ansichten. Alte Classic-Zustände bleiben lesbar. Ohne diese
Metadaten bietet das Frontend auf einem älteren Backend nur Classic an; 15×15
benötigt die neue Backend-Version. Ein Deployment ist nicht Teil dieser Änderung.
Das große Brett bleibt scrollbar und mit Pfeiltasten/Home/End bedienbar. Die
PNG-Vorschau ist als Data-URL im Bundle enthalten, daher besteht `release/`
weiterhin aus genau `index.html`, `app.js` und `style.css`.

## Die sechs Dateien

| Datei | Zweck |
| --- | --- |
| [README.md](README.md) | Einstieg, Umfang und Weitergabe. |
| [backend-api.md](backend-api.md) | Verbindlicher HTTP-/WebSocket-Vertrag, Lebensdauer, Fehler und konsistente Beispielpartie. |
| [game-engines.md](game-engines.md) | Bestehender Engine-Vertrag und spätere Erweiterung um weitere Spiele. |
| [frontend-config.example.js](frontend-config.example.js) | Eigenständige öffentliche ES-Modul-Konfiguration und WS-URL-Ableitung. |
| [frontend-chat-prompt.md](frontend-chat-prompt.md) | Direkt kopierbarer Arbeitsauftrag für den neuen Frontend-Chat. |
| [verification.md](verification.md) | Tatsächliche Prüfungen, Nutzerberichte und verbleibende Nachweisgrenzen. |

## Weitergabe

Im neuen Chat **alle sechs oben genannten Dateien anhängen** und den Text aus
`frontend-chat-prompt.md` als Auftrag einfügen. Alternativ das ZIP entpacken und
diese sechs Dateien anhängen. Ein vorhandener vollständiger `release/`-Ordner
kann zusätzlich als visuelle und funktionale Referenz mitgegeben werden; er ist
zum Verständnis des Vertrags nicht erforderlich. Backend-Quellen, Zugangsdaten
und die bisherige Unterhaltung sind dafür nicht nötig.

Dieses Paket enthält Dokumentation und eine Konfigurationsvorlage, kein neues
Frontend. Die öffentliche Adresse ist vorgegeben; ein Vergleich des aktuell
deployten Bundles wurde für die ursprüngliche Phase-8-Übergabe nicht
vorgenommen. Am 10.11.2026 wurde das geprüfte Backend mit Schiffe versenken
veröffentlicht und die öffentliche Spieleliste lesend überprüft. Prüfbelege und Nutzerbestätigungen sind in `verification.md` getrennt.
