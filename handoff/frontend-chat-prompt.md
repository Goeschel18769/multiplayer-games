# Startprompt für den separaten Frontend-Chat

Den folgenden Text direkt als Auftrag verwenden und die sechs genannten Dateien
anhängen. Eine optionale bestehende Release-Ausgabe ist nur Referenz.

---

Entwickle oder überarbeite das Frontend von multiplayer-games. Die beigefügten
Dateien README.md, backend-api.md, game-engines.md,
frontend-config.example.js und verification.md sowie dieser Startprompt bilden
die eigenständige technische Übergabe. Lies sie zuerst. Das bestehende Backend
ist unter https://multiplayer-games.haldimann-joel.workers.dev erreichbar.

Kläre zuerst meine Designwünsche, etwa Stil, Farben, Anordnung und Zielgeräte.
Lege noch keine konkrete Designrichtung fest. Du darfst die Frontend-Struktur
frei gestalten und ein separates Repository verwenden. Der dokumentierte
Backend-Vertrag bleibt erhalten. Aktuell gibt es nur Tic Tac Toe 3 × 3.

Verwende HTML, CSS und Vanilla JavaScript, kein TypeScript. Die Entwicklungsquellen
sollen ES-Module verwenden. Erzeuge einen eigenständigen Release-Ordner mit
relativen lokalen Assets und einem klassischen gebündelten JavaScript-Skript
(beispielsweise IIFE). Keine Laufzeit-Imports, Module im Release, nachgeladenen
Chunks oder lokalen fetch-Aufrufe, auch nicht für JSON-Konfiguration. Spieler
müssen index.html per Doppelklick über file:// starten können, ohne Installation
oder lokalen Server. Ein Buildwerkzeug für die Entwicklung ist davon getrennt.
Die App benötigt Internet und spricht über HTTPS/WSS mit dem bestehenden Backend.

Halte öffentliche Konfiguration von Zugangsdaten getrennt. Nutze Protokoll v1
und welcome.settings, insbesondere für den Heartbeat; erfinde keine eigenen
verbindlichen Serverfristen. Kein notwendiges localStorage und keine Login- oder
Sitzungstokens. Namen und Raumcodes können nur im Arbeitsspeicher bleiben.
Der Name ist bewusst übernehmbare Identität. Bei Verbindungsaustausch (4001)
verständlich informieren und keine automatische Übernahmeschleife starten.

Trenne Raum erstellen von anschliessendem WebSocket-Beitritt. Ein gescheiterter
Join darf keinen Raum automatisch anlegen. Behandle HTTP-Fehler konkret und
gescheiterte Browser-WebSocket-Handshakes ehrlich allgemein: deren HTTP-Fehlerbody
ist für JavaScript nicht auslesbar. Zeige Ladezustände, Pending-Aktionen und
Reconnect verständlich an. Ignoriere alte Socket-Callbacks/Timer und veraltete
Acks; unklare Aktionen nicht blind erneut senden. Eine manuelle Wiederverbindung
übernimmt den aktuellen Serverstand. ROOM_FULL, ROOM_LOCKED, Raumablauf und neue
roomInstanceId müssen im Zustandsmodell berücksichtigt sein.

Der Server allein entscheidet Regeln, Zugrecht, Gewinner und Statistik.
Rendere nur die empfangenen individuellen Ansichten; keine Backend-Engine ins
Frontend kopieren. room.status ist massgeblich, besonders bei aborted. Keine
lokale Gewinnerberechnung und keine Statistik-Schreibversuche. Statistikfehler
dürfen eine Partie nicht blockieren; verzögerte Siege mit begrenzten erneuten
Abrufen und manueller Aktualisierung behandeln. Spielauswahl und Darstellung
modular über gameId/version registrieren, unbekannte Spiele verständlich melden.

Sorge für echte Tastaturbedienung, sichtbaren Fokus, verständliche Beschriftungen,
zugängliche Statusmeldungen und ein responsives Layout. Rendere Namen und
Servertexte sicher als Text. Prüfe den gebauten, aus dem Projekt herauskopierten
Ordner mit zwei unabhängigen Browserfenstern. Verwende für automatisierte Siege
ein lokales Testbackend; verändere nicht ungefragt die öffentliche Statistik.
Unterscheide im Prüfbericht automatisierte Tests, tatsächliche Browserprüfungen
und offene Fälle; übernimm keine unbewiesenen Hibernation-Behauptungen.

Kein Deployment, keine neuen Spiele und kein Backend-Umbau allein für Design.
Falls der API-Vertrag nicht ausreicht, beschreibe die konkrete Lücke, bevor du
eine Änderung vorschlägst. Ein optional beigefügter vollständiger release/-Ordner
ist visuelle und funktionale Referenz, keine verpflichtende Designvorgabe.
