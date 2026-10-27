# Technische Frontend-Übergabe — multiplayer-games

Stand: 23.10.2026, Phase 8. Dieses Paket beschreibt den tatsächlich vorhandenen
Quellcode, unabhängig vom bisherigen Projekt und Chat. Es ermöglicht, in einem
separaten Projekt ein kompatibles Frontend zu gestalten oder neu zu entwickeln.
Eine Designrichtung ist nicht vorgegeben. Design und Frontend-Struktur dürfen
frei geändert werden, solange der Backend-Vertrag erhalten bleibt.

Das öffentliche Backend ist ein Cloudflare Worker mit SQLite Durable Objects:
**https://multiplayer-games.haldimann-joel.workers.dev**.
Das gebaute Frontend wird lokal über `file://` geöffnet und verbindet sich über
HTTPS/WSS. Spieler benötigen Internet, einen Browser und den vollständigen
Release-Ordner, aber keine Installation und keinen lokalen Server.

Implementiert sind Raumerstellung, getrenntes Beitreten, stabile Spielerplätze,
Verbindungsübernahme, Heartbeat, fünf Minuten Leerraumfrist, Ready/Start,
Rematch, Abbruch und dauerhafte globale Siegestatistik. Das einzige produktive
Spiel ist **Tic Tac Toe 3 × 3**, ID `tic-tac-toe`, Version `1`, genau zwei Spieler.
Weitere Spiele sind geplant, aber nicht implementiert. Das allgemeine
Raumframework ist nicht grundsätzlich auf zwei Spieler beschränkt.

Technik: HTML, CSS und Vanilla JavaScript mit ES-Modulen in den Quellen, kein
TypeScript. Für `file://` werden die Quellen in ein klassisches JavaScript-Bundle
gebündelt. Es gibt keine Konten, Passwörter oder Sitzungstokens. Der normalisierte
Name ist bewusst eine übernehmbare Identität: Wer denselben Namen eingibt, darf
den Platz übernehmen und die alte Verbindung ersetzen. IDs sind keine Secrets.

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
deployten Quellstands mit dem lokalen Code wurde für diese Übergabe nicht
vorgenommen. Prüfbelege und Nutzerbestätigungen sind in `verification.md` getrennt.
