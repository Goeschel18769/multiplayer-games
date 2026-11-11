# Startprompt für den separaten Frontend-Chat

Den folgenden Text direkt als Auftrag verwenden und die sechs genannten Dateien
anhängen. Eine optionale bestehende Release-Ausgabe ist nur Referenz.

---

Entwickle oder überarbeite das Frontend von multiplayer-games. Die beigefügten
Dateien README.md, backend-api.md, game-engines.md,
frontend-config.example.js und verification.md sowie dieser Startprompt bilden
die eigenständige technische Übergabe. Lies sie zuerst. Das bestehende Backend
ist unter https://multiplayer-games.haldimann-joel.workers.dev erreichbar.

Baue auf dem kompakten Spielhub auf: warme Papieroptik, erdige Grün-/Beige-/Brauntöne,
Hell-, Dunkel- und eigenständiger zurückhaltender Büro-Modus. Kein Seitenname,
keine Einleitung und keine dauerhafte Spielerwahl im Hub. Ben und Joël werden
beim ersten Öffnen im Tab per Dialog gewählt; der eigene Name im Score öffnet die Wahl
erneut. Ein Wechsel im Spiel trennt die Verbindung und führt zum Hub zurück.
Jeder Klick auf die Tic-Tac-Toe-Kachel öffnet zuerst die Moduswahl: Classic (3×3, drei in einer
Reihe) oder Fünf in einer Reihe (15×15, mindestens fünf horizontal, vertikal oder
entlang beider Diagonalen, ohne Eröffnungs- oder Verbotsregeln). Classic verwendet
BEN-JOEL-TTT, 15×15 BEN-JOEL-TTT-15; derselbe Modus führt beide zusammen, die Modi
bleiben getrennt. Die Kachel hat eine generierte Bildvorschau im gleichen Stil.
Der hervorgehobene Score steht oben mittig: dunkle Fläche und helle
Schrift im Hellmodus, umgekehrt im Dunkelmodus. Zahlen öffnen den Score-Editor;
der eigene Name ist dezent markiert. Verberge die Darstellungsmodi hinter einer kleinen
Lasche oben rechts mit Hover-, Fokus- und Tippbedienung. Ergänze dezente Hover-,
Druck- und Lichteffekte mit Unterstützung für reduzierte Bewegung.
Kläre weitergehende Designwünsche vor einer neuen Designrichtung. Du darfst die Frontend-Struktur
frei gestalten und ein separates Repository verwenden. Der dokumentierte
Backend-Vertrag bleibt erhalten. Die zweite Kachel ist 4 Gewinnt: klassisch
7 Spalten × 6 Reihen, Steine fallen nach unten, mindestens vier waagrecht,
senkrecht oder diagonal gewinnen. Mehr Braun statt Grün, Umbra und Terrakotta,
Spaltenvorschau und dezente Fallanimation nur für neue bestätigte Steine.
Direkter Einstieg nach BEN-JOEL-C4 ohne Moduswahl; Config exakt {},
gameId connect-four, Version "1". Keine lokalen Steine vor Serverbestätigung.
Aktion {kind:'drop',column:0}, Spaltenindex 0–6. Die Spieleransicht und Farben
sind in backend-api.md beschrieben. Nur bei passender Backend-Metadatenversion
freischalten; ältere Backends zeigen eine deaktivierte Kachel.

Die dritte Kachel ist Schiffe versenken, gameId battleship, Version "1", Config
exakt {}, Standardraum BEN-JOEL-SHIPS, kein Modusdialog. 10×10 Felder, L-Schiff
mit fünf Feldern (XXX / X.. / X..) und gerade Schiffe 4, 3, 3, 2. Vier Drehungen,
Berührung erlaubt, keine Überlappung. Eigene Platzierung plus Zufallsplatzierung,
Flotte bestätigen, dann Schussphase. Treffer behält den Zug; Wasser wechselt ihn.
Nur tatsächliche Treffer/Fehlschüsse markieren, keine Nachbarn. Eigene Flotte
und Gegner am Desktop nebeneinander, mobil umschaltbar. Gegnerische Positionen
nur entsprechend der privaten Serveransicht anzeigen; keine fremden Flotten
im Browser speichern. Eigene Entwürfe dürfen im RAM je Raum/Match/Spieler einen
Reconnect überstehen; neue Matches beginnen leer. Aktionen placeFleet und fire
sowie genaue Views sind in backend-api.md beschrieben. Erste eigene
Flottenbestätigung darf eine ältere Revision verwenden, alle Schüsse bleiben
strikt. Detaillierte Militärschiffe von oben mit Stahlrumpf, Deck, Brücke, Radar
und Geschützen folgen den belegten Feldern und allen Drehungen, auch beim
L-Schiff. Getrennte Rümpfe halten berührende bekannte Schiffe erkennbar.
Verwende deutliches Wasserblau für Bretter, Rahmen und Akzente dieser Spielseite,
mit eigenen Hell-/Dunkelwerten und zurückhaltendem Blaugrau im Büro-Modus.
Treffer liegen über den Rümpfen; der Grafiklayer fängt keine Eingaben ab. Tastatur:
Pfeile/Home/End über Felder, R zum Drehen. Dritte PNG-Vorschau im lokalen Bildordner mitliefern.

Verwende HTML, CSS und Vanilla JavaScript, kein TypeScript. Die Entwicklungsquellen
sollen ES-Module verwenden. Erzeuge einen eigenständigen Release-Ordner mit
relativen lokalen Assets und einem klassischen gebündelten JavaScript-Skript
(beispielsweise IIFE). Keine Laufzeit-Imports, Module im Release, nachgeladenen
Chunks oder lokalen fetch-Aufrufe, auch nicht für JSON-Konfiguration. Spieler
müssen index.html per Doppelklick über file:// starten können, ohne Installation
oder lokalen Server. Ein Buildwerkzeug für die Entwicklung ist davon getrennt.
Die App benötigt Internet und spricht über HTTPS/WSS mit dem bestehenden Backend.
Die drei PNG-Vorschauen über esbuild als Dateien mit assetNames img/[name]
ausgeben. release/ enthält index.html, app.js, style.css und img/ mit den drei
verwendeten Bildern. JavaScript enthält nur relative Bildpfade, keine Base64-
Bilddaten. Den gesamten Ordner ins Download-ZIP aufnehmen. Zusätzlich img.zip
mit dem img/-Ordner für die Einzeldateien auf GitHub bereitstellen. Alle Assets
müssen auch nach Kopieren und direkt über file:// ohne lokalen Server laden.

Halte öffentliche Konfiguration von Zugangsdaten getrennt. Nutze Protokoll v1
und welcome.settings, insbesondere für den Heartbeat; erfinde keine eigenen
verbindlichen Serverfristen. Kein notwendiger Browserspeicher und keine Login-
oder Sitzungstokens. Merke die Spielerwahl optional im sessionStorage unter
multiplayer-player für den aktuellen Tab; bei blockiertem Speicher frage nach
jedem Neuladen erneut. Die aktuelle Raumwahl bleibt im Arbeitsspeicher.
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

Nach der Moduswahl nutzt der normale Einstieg Create und nur bei ROOM_EXISTS den
vorhandenen Raum. Die ID tic-tac-toe und Version "1" bleiben gleich. Config {} oder
exakt {mode:'classic'} ist Classic, exakt {mode:'five'} ist 15×15; keine weiteren
Config-Schlüssel. Die optionale modes-Liste aus GET /api/games nennt id,
boardSize und winLength. Ohne diese Fähigkeit auf älteren Backends nur Classic
anbieten, keinen lokalen 15×15-Modus vortäuschen.
In der Spielansicht öffnet room-toggle einen versteckten Raumdialog mit aktuellem
Code und getrennten Aktionen für Erstellen und Beitreten. Erstellen verwendet
den gewählten Modus, Beitreten übernimmt den tatsächlichen Servermodus aus der
öffentlichen room.config, schon in der Lobby. Manuelle Raumwahl gilt nur für
diese Spielansicht. Bei Tic Tac Toe fragt der nächste Kacheleinstieg erneut den
Modus ab; 4 Gewinnt und Schiffe versenken öffnen direkt ihren Standardraum. Reconnect behält den aktuellen Code und wiederholt
keinen Create-POST; Rematch behält die Raumconfig. Die Statistik zählt beide Modi
zusammen nach Namen.

Der Server allein entscheidet Regeln, Zugrecht, Gewinner und Statistik.
Rendere nur die empfangenen individuellen Ansichten; keine Backend-Engine ins
Frontend kopieren. Die Ansichten ergänzen mode, boardSize, winLength und lastMove
(null oder letzter ganzzahliger Zellindex). Alte gespeicherte Classic-Zustände
und Antworten ohne diese Angaben bleiben unterstützt. room.status ist
massgeblich, besonders bei aborted. Keine
lokale Gewinnerberechnung. Score-Korrekturen ausschließlich bewusst über
PUT /api/stats mit expectedWins und atomarer Konfliktbehandlung; kein lokales
Vortäuschen einer erfolgreichen Speicherung. Die Score-API und die 15×15-
Erweiterung sowie alle drei Engines sind am 10.11.2026 nach Freigabe deployt worden. Fehlende Unterstützung
verständlich anzeigen. Statistikfehler
dürfen eine Partie nicht blockieren; verzögerte Siege mit begrenzten erneuten
Abrufen und manueller Aktualisierung behandeln. Spielauswahl und Darstellung
modular über gameId/version registrieren, unbekannte Spiele verständlich melden.

Sorge für echte Tastaturbedienung, sichtbaren Fokus, verständliche Beschriftungen,
zugängliche Statusmeldungen und ein responsives Layout.
Das 15×15-Brett benötigt einen responsiven Scrollbereich mit ausreichend großen
Touchfeldern sowie Pfeiltasten und Home/End für die Tastatur. Rendere Namen und
Servertexte sicher als Text. Prüfe den gebauten, aus dem Projekt herauskopierten
Ordner mit zwei unabhängigen Browserfenstern. Verwende für automatisierte Siege
ein lokales Testbackend; verändere nicht ungefragt die öffentliche Statistik.
Unterscheide im Prüfbericht automatisierte Tests, tatsächliche Browserprüfungen
und offene Fälle; übernimm keine unbewiesenen Hibernation-Behauptungen.

Kein Deployment, keine neuen Spiele und kein Backend-Umbau allein für Design.
Falls der API-Vertrag nicht ausreicht, beschreibe die konkrete Lücke, bevor du
eine Änderung vorschlägst. Ein optional beigefügter vollständiger release/-Ordner
ist visuelle und funktionale Referenz, keine verpflichtende Designvorgabe.
