# Prüfstand und Grenzen

Stand: 10.11.2026; ältere Prüfungen bleiben mit ihrem damaligen Stand dokumentiert. Der Backend-Vertrag wurde aus Worker-Routing, HTTP-Helfern,
Nachrichtenvalidatoren, Fehlerdefinitionen, Einstellungen, Namensnormalisierung,
Raum-/Match-Verwaltung, Statistik, produktiver Registry und Tic-Tac-Toe-Engine
abgeleitet. Frontend-Konfiguration, Transport, Darstellung und Build wurden
ebenfalls mitgelesen. Frühere Architekturpläne sind keine API-Quelle.

## Durch Tests und vorhandene Prüfberichte belegt

Die aktuelle Regression umfasst 110 Unit-Tests und 24 Workerd-Integrationstests.
Sie prüft unter anderem:

- Striktes Routing, HTTP-/WS-Validierung, CORS mit Origin null, Namens- und
  Raumcode-Normalisierung, Byte-/Ratenlimits und Fehler.
- Echte SQLite-Durable-Objects, WebSocket-Paare, Attachments und RPC in der
  lokalen Workerd-Laufzeit: Create/Join, stabile Plätze, Verbindungsaustausch,
  ignorierte alte Ereignisse, Ready/Start, Aktionen, Rematch und Rotation.
- ROOM_LOCKED nach Sieg, Draw und Abort mit einer 2–4-Spieler-Fixture, bekannte
  Reconnects und erneute Aufnahme nach Raumablauf/Neuanlage.
- Leerraumfrist und Liveness mit kontrollierter Testuhr, auch verzögerte Alarme,
  unbetretene Räume, Fristgrenzen und neue Raumgeneration. Dies ist kein echtes
  fünfminütiges Warten und keine Messung automatischer Plattform-Alarmzustellung.
- Gefilterte private Ansichten, View-Fehler ohne Rohzustand, dauerhafte Outbox
  über logische Raumlöschung, Retry und matchId-Deduplizierung bei verlorener
  Bestätigung, parallele Siege und keine Siege für Draw/Abort/Disconnect.
- Produktive Tic-Tac-Toe-Regeln, alle Gewinnlinien, Draw, Sieg im neunten Zug,
  ungültige Aktionen, Unveränderlichkeit und Ansichten. Voller produktiver
  HTTP-/WebSocket-Ablauf in Workerd ohne Fixture-Engine.
- Clientlogik mit DOM-/Transport-Doubles, Pending/Reconnect und kein zweiter
  Create nach gescheitertem Join; diese Tests sind keine Browsertests.
- Build mit drei Dateien, relativen Assets, klassischem Bundle ohne
  Laufzeit-Imports oder Backend-Quellen, unabhängig herauskopierbarer Ausgabe
  und getrennter lokaler Testkonfiguration.

Historisch dokumentierte echte Browserprüfungen vom 23.10.2026:

- Phase 6: zwei unabhängige Safari-Fenster der technischen Diagnoseoberfläche
  über file:// gegen das lokale produktive Backend: Tic-Tac-Toe-Sieg, Statistik,
  Rematch und Abbruch. Keine Aussage über Safari mit dem späteren Release-Frontend.
- Phase 7: Google Chrome 155.0.8059.85 auf macOS, zwei unabhängige Fenster einer
  ausserhalb des Projekts kopierten lokalen Testausgabe über file://. Gegen den
  isolierten lokalen Server: Create/Join, Ready/Start, synchronisierte Züge,
  manuelles Reconnect mit erhaltenem Brett, Sieg/Statistik, Rematch mit neuem
  Startspieler und Abort mit gesperrten Feldern. Screenshot-Kontrolle der Ansicht.
  Danach Clients getrennt, lokalen Server beendet und öffentliche Release-
  Konfiguration wieder gebaut. Dabei keine öffentlichen Siege erzeugt.

Frühere Wrangler-Dry-Runs waren erfolgreich, ohne Deployment. Ein erfolgreicher
Dry-Run belegt Bundle/Konfiguration, keine Live-Verfügbarkeit oder Online-Partie.

## Vom Nutzer bestätigt

Der Nutzer bestätigt ausdrücklich:

- Lokale Multiplayer-Abläufe und die Fünf-Minuten-Frist.
- Tic Tac Toe einschliesslich Unentschieden.
- Eine Online-Partie mit Ben über das öffentliche Backend.
- Die Funktion des gebauten Frontends.

Diese Berichte werden als Nutzerbestätigung geführt, nicht als vom Agenten neu
durchgeführte oder gemessene Prüfung. Dafür sind keine konkreten Browser,
Geräte, Netzwerkbedingungen oder gemessenen Zeitabweichungen angegeben.
Sie ergänzen die historischen lokalen Prüfberichte, ohne deren damaligen
Prüfumfang rückwirkend zu erweitern.

## Noch nicht nachgewiesen

- Tatsächliche automatische Cloudflare-Hibernation, Eviction und Wiederaufwachen
  wurden nicht gemessen. Verwendung von acceptWebSocket/getWebSockets,
  Hibernation-Handlern und persistenten Attachments ist durch Code und lokale
  Tests belegt; das beweist keine automatische Plattform-Hibernation.
- Ein lokaler Versuch mit unsafeEvictDurableObject und hibernate blieb früher
  hängen und wurde abgebrochen. Die regulären Tests bauen stattdessen
  kontrolliert eine neue Klasseninstanz mit echtem Context/SQLite/Attachments
  auf. Das ist ein Wiederherstellungstest, kein Hibernation-Nachweis.
- Reale Ausfälle, Browser-Hintergrunddrosselung und sekundengenaue Cloudflare-
  Alarmzustellung sind nicht systematisch gemessen. Keine sekundengenaue
  Timeout-/Löschgarantie und keine Last-/Missbrauchsschutz-Zusage.
- Kein systematischer Browser-/Mobilgerätevergleich. Edge war für die frühere
  Phase-7-Prüfung nicht verfügbar; Safari wurde dort nicht am neuen Frontend
  geprüft. Kein dokumentierter physischer Transfer auf einen anderen Computer.
- Für Phase 8 kein Abgleich des aktuell öffentlich deployten Bundles mit dem
  lokalen Quellstand, kein neuer Browser-/Online-Spieltest und kein Deployment.
  Die fiktiven API-Beispiele sind keine Live-Mitschnitte.

## In Phase 8 tatsächlich ausgeführte Prüfungen

- `npm test`: 35 Unit-Tests und 20 Workerd-Integrationstests erfolgreich,
  keine Fehler oder übersprungenen Tests. Der erste Sandbox-Lauf konnte nach
  erfolgreichen Unit-Tests wegen `listen EPERM 127.0.0.1` keine Integration
  starten. Der anschliessend freigegebene vollständige Lauf bestand.
- `npm run build`: erfolgreich; normale Ausgabe mit öffentlicher Backend-URL,
  kein lokaler Test-Build. Der vorhandene Build-Test prüft den Release-Vertrag.
- `npm run check:deploy`: Wrangler-Dry-Run erfolgreich, beide SQLite-Bindings
  erkannt, kein Upload. Zunächst war nur das Schreiben des Wrangler-Logs ausserhalb
  des Projekts blockiert (trotz Exit 0); erneuter Lauf mit WRANGLER_LOG_PATH in
  einem beschreibbaren temporären Verzeichnis war ohne diese Meldung erfolgreich.
- 70 JSON-Codeblöcke in Übergabe und bestehender Projektdokumentation mit
  JSON.parse geprüft. Alle 16 Clientnachrichten-Beispiele der Übergabe zusätzlich
  durch den echten Nachrichtenvalidator geprüft. Fehlercode-Tabelle und
  welcome.settings mit den tatsächlichen Definitionen verglichen.
- Beispielpartie mit der vorhandenen Match-Logik und Engine erneut ausgeführt:
  10 Mutationen und 9 dokumentierte Snapshots verglichen, einschliesslich
  Spieleransichten, Revisionen, Sieg, Siegereignis und Rematch-Startrotation.
  Beispiel-UUIDs wurden für reproduzierbare Darstellung gesetzt; dies testet
  keine Live-Raumanlage oder zufällige Startverteilung.
- Eigenständige Konfigurationsvorlage importiert; öffentliche URL,
  Protokollversion und WSS-/Unicode-URL-Ableitung geprüft.
- Relative Dateilinks einschliesslich vorhandener Abschnittsanker geprüft;
  Übergabe-Links bleiben vollständig innerhalb des handoff-Ordners.
- ZIP auf genau die sechs Übergabedateien, fehlerfreies Entpacken und identische
  Dateiinhalte geprüft. Keine Backend-Dateien oder Zugangsdaten enthalten.
- Prüfsummenvergleich von 41 vorhandenen Implementierungs-/Konfigurationsdateien
  bestätigt unveränderte Inhalte; `git diff --check` ohne Whitespace-Fehler.

In Phase 8 wurden keine neuen Browserprüfungen, öffentlichen Matches oder
Netzwerkausfall-Messungen durchgeführt. Dokumentationsvalidierung verwendet
vorhandene Node-/Python-Werkzeuge, ohne neues Testframework oder Abhängigkeiten.


## Phase 9 — 07.11.2026: Hub und Score-Bearbeitung

- 40 Unit-Tests erfolgreich: feste Namen, gleicher Raum bei ROOM_EXISTS,
  kein Create-Replay bei Reconnect, Abbruch eines ausstehenden Hub-Einstiegs,
  alle drei Modi auch ohne Browserspeicher, Score-Editor und Fehler ohne
  Scheinspeicherung, nicht vorhandene HTML-IDs und verspätete Statistikantworten.
- 22 Workerd-Integrationstests erfolgreich, inklusive vollständiger bisheriger
  Backend-Regression, HTTP-PUT, CORS, strikter Eingabeprüfung, atomarer
  Korrekturen, konkurrierender Editoren und Reset mit erhaltener Deduplizierung.
  Der erste Sandboxversuch konnte wegen Loopback-EPERM nicht starten;
  der anschliessend freigegebene Lauf bestand.
- Tatsächliche Browserprüfung in Google Chrome auf macOS: unabhängig kopierter
  lokaler Test-Build über file://, isoliertes Backend auf 127.0.0.1:8789,
  zwei unabhängige Tabs für Ben und Joël. Gemeinsamer Einstieg ohne Codeeingabe,
  Ready/Start, synchronisierte Züge und Joël-Sieg mit Score-Erhöhung geprüft.
  Score-Korrektur 4:2 gespeichert; nach dem Sieg stand Joël auf 3; über den
  versteckten Editor auf 0 zurückgesetzt. Rückkehr zum Hub geprüft.
- Hell, Dunkel, eigenständiger Büro-Modus und Score-Dialog visuell per
  Screenshot geprüft. Ein beim Browserstart gefundener HTML-ID-Fehler wurde
  behoben und durch eine Prüfung gegen das echte HTML im App-Test abgedeckt.
- Keine öffentlichen Siege, öffentlichen Score-Korrekturen oder Deployments.
  Physische Mobilgeräte, andere Browser und Remote-Geräte bleiben ungeprüft.

- Abschluss: öffentlicher Release-Build mit genau drei Dateien, ohne lokale
  Testadresse; Deployment-Dry-Run erfolgreich, kein Upload. Handoff-ZIP
  erneut mit den sechs aktuellen Dateien synchronisiert.


## Verdichteter Hub — 07.11.2026

- `npm test`: 49 Unit-Tests und 22 Workerd-Integrationstests erfolgreich.
  Der App-Test enthält 14 Fälle für verpflichtende Spielerwahl, Speicherung pro
  Tab, blockierten Speicher, sicheren Spielerwechsel, Standardraum/Reconnect,
  Theme-Lasche mit Hover/Touch/Fokus/Escape, manuelle Create-/Join-Abläufe,
  verworfene späte Antworten, erhaltene Verbindungen bei Create-Fehlern und
  Score-Editor. Eingabemethoden der Lasche sind dabei mit DOM-Doubles geprüft.
- Der abschliessend angepasste Lobby-Status wurde mit den 14 App-Tests erneut
  geprüft. Keine Änderung am Backend oder am Protokoll in dieser Verfeinerung.
- Tatsächliche Browserprüfung in Chrome auf macOS: neuer unabhängig kopierter
  Test-Build `/private/tmp/hub-refinement.OMOqV0/` über file://, isoliertes lokales
  Backend auf Port 8789. Initialer Ben-/Joël-Dialog, Ben-Auswahl und Neuladen
  ohne erneuten Dialog, kompakter Hub ohne Namen/Begleittexte, Modus-Lasche
  per Klick sowie heller Score auf dunklem Hintergrund visuell geprüft.
- Zwei unabhängige Tabs: Ben erstellt über den versteckten Dialog
  `BEN-JOEL-ZWEIT`; Joël tritt per Code bei und sieht beide Spieler online.
  Nach Rückkehr zum Hub und erneutem Einstieg bestätigt der Raumdialog wieder
  `BEN-JOEL-TTT`. Gleichzeitig bestehende Räume und getrennte Create-/Join-Wege
  damit im Browser nachvollzogen.
- Responsive Chrome-Vorschau mit bestätigter Breite 320 CSS-Pixel per Screenshot
  geprüft: Score, Lasche und Kachel passen in die Ansicht. Dies ersetzt keinen
  Test auf einem physischen Touchgerät. Native Touch-Hardware, andere Browser
  und reale reduzierte Betriebssystem-Bewegungseinstellungen bleiben ungeprüft.
- Hover-Neigung und Lichtreflex stammen aus lokalem CSS/JavaScript, ohne externe
  Assets oder Animationsschleifen im Leerlauf. Reduzierte Bewegung verhindert
  Neigung, animierte Übergänge und Druckverschiebung; Büro verwendet schwächere
  Effekte und eigene Flächen statt eines Farbfilters.

- Abschluss der Verfeinerung: öffentlicher Release-Build erstellt, genau drei
  portable Dateien; Handoff-ZIP synchronisiert und bytegleich geprüft.
  Isolierten lokalen Testserver beendet, kein Deployment.

## Tic-Tac-Toe-Modi und Spielansicht — 07.11.2026

- Vollständige Regression: **85 Unit-Tests und 23 Workerd-Integrationstests**
  erfolgreich. Classic und 15×15 werden über dieselbe Spiel-ID/Version geprüft:
  Config und Metadaten, beide Diagonalrichtungen, längere Gewinnlinien,
  Altzustände sowie Moduswahl, getrennte Standardräume und Servermodus beim
  manuellen Join. Der produktive Workerd-Ablauf deckt 15×15 bis Sieg, Reconnect
  und Rematch ab. Nach dem anschließenden Ready-/Start-Anzeigefix wurden die
  **20 App-Tests** erneut erfolgreich ausgeführt.
- Deployment-Dry-Run erfolgreich, kein Deployment. Der Release-Build-Test prüft
  die PNG-Vorschau als eingebettete Data-URL und genau drei Dateien, ohne separate
  Bilddatei zur Laufzeit.
- Echte Browserprüfung in Google Chrome auf macOS: unabhängige Kopie
  `/private/tmp/ttt-modes.KhFhSv/` direkt über `file://`, isoliertes Backend auf
  Port 8789 mit Persistenz `.wrangler/ttt-modes-20261107/`. Zwei Tabs für Ben und
  Joël: Kachel öffnet die verpflichtende Moduswahl; gleiche Wahl führt zusammen.
- Classic: gemeinsamer Raum, Ready/Start, fünf synchronisierte Züge, Joël-Sieg,
  Score `0:1` und markierte Gewinnlinie visuell bestätigt.
- 15×15: gemeinsamer eigener Raum, Ready/Start, mittleres Feld 112 mit X und
  anschließender Zugwechsel bestätigt. Pfeil rechts bewegt den Brettfokus;
  `Ctrl+End` fokussiert Zeile 15/Spalte 15 und scrollt in den sichtbaren Bereich.
- Screenshots bei 320 CSS-Pixel Breite von Modusdialog, gewonnenem 3×3 und 15×15;
  Hell, Dunkel und Büro visuell geprüft. Büro zusätzlich als gewonnene 3×3-Ansicht
  und Hub bei 320 Pixeln: eigene Grauschiefer-Flächen, Linien und Zeichen sowie
  dezente Vorschau. In der Chrome-Konsole ausschließlich erwartete
  HTTP-409-Antworten `ROOM_EXISTS`, keine JavaScript-Ausnahmen.

Ein vollständiger 15×15-Sieg wurde automatisiert, jedoch nicht in dieser
Browserprüfung ausgespielt. Physische Touchgeräte und andere Browser bleiben offen.
Keine öffentlichen Matches, öffentlichen Score-Änderungen oder Deployments.

Abschluss: beide Testtabs geschlossen und lokalen Server beendet; normale
Release-Ausgabe mit öffentlicher Backend-Adresse, genau drei Dateien,
eingebettetem PNG und ohne lokale Testadresse oder Laufzeit-Imports geprüft.
Die sechs aktuellen Übergabedateien und `handoff.zip` sind bytegleich;
`git diff --check` erfolgreich.


## 4 Gewinnt — 10.11.2026

- `npm test`: **110 Unit-Tests und 24 Workerd-Integrationstests**, alle bestanden.
  Neue Regeln und Darstellung: Gravitation, volle Spalten, beide Spieler,
  waagrechte/senkrechte/beide diagonale Siege, komplette Gewinnreihen, 42 legale
  Züge bis Draw, Sieg auf dem letzten Feld, unveränderte Eingaben und kopierte
  JSON-Ansichten. Ungültige Config/Aktionen bleiben ohne Mutation.
- Produktives Workerd mit zwei echten WebSockets: Create/Join, Ready/Start,
  Fallposition bis zur vollen Spalte, abgelehnte Züge, Reconnect mit identischer
  Ansicht/Identität, Abort, Rematch-Startrotation, Sieg mit dedupliziertem Ergebnis,
  Draw und gemeinsam gezählte Siege derselben Namen aus einer separaten
  Tic-Tac-Toe-Partie. Raum-/Transport-/Statistik-Kern unverändert.
- App-/Renderer-Tests prüfen direkte Kachel ohne Modusdialog, gemeinsame
  Standardräume, getrennte manuelle Räume und Rückkehr zum Standard,
  spielübergreifenden Join mit anschließender Anlage für die tatsächliche Engine,
  fehlende Backend-Unterstützung, späte Antworten bei Spielerwechsel, Pending-
  und Zug-Sperren, zugängliche Spaltensteuerung sowie Fallanimation ohne
  optimistische Brettmutation oder Reconnect-Replay.
- Echte Chrome-Prüfung auf macOS über eine unabhängig kopierte lokale Ausgabe
  `/private/tmp/connect-four.bSJp1T/` direkt per file://, mit isoliertem Backend
  auf Port 8789 und Persistenz `.wrangler/connect-four-20261110/`. Zwei Tabs
  Ben/Joël betreten über die Kachel denselben Raum, Ready/Start, sieben
  synchronisierte Züge bis zu Bens senkrechtem Sieg, markierte vier Steine und
  globaler Score 1:0. Beidseitiger Rematch leert das Brett und wechselt den
  Startspieler zu Joël. Keine öffentlichen Spiele oder Statistikänderungen.
- Dunkle Braunansicht am Desktop und helle/büroartige Siegansicht bei bestätigten
  320 CSS-Pixeln per Screenshot geprüft. Das 7×6-Brett passt ohne horizontales
  Scrollen. Chrome-Konsole zeigt erwartetes HTTP 409 bei ROOM_EXISTS; keine
  JavaScript-Ausnahme beobachtet. Native Touchgeräte und andere Browser bleiben
  offen. Reduzierte Bewegung ist in CSS berücksichtigt, nicht per realer
  Betriebssystem-Einstellung getestet.
- `npm run check:deploy` erfolgreich (Dry-Run, beide unveränderten Bindings);
  `npm run package:release` erstellt öffentliche Ausgabe und ZIP mit genau
  index.html/app.js/style.css. Beide PNG-Vorschauen sind inline eingebettet.
  Lokale Browser-Tabs geschlossen, lokalen Testserver beendet. Kein Deployment.

Ein zusätzlicher read-only Abruf der öffentlichen Spieleliste aus dem lokalen
Prüfprozess lieferte HTTP 403. Dieser Abruf belegt daher keine aktuelle
öffentliche Engine-Verfügbarkeit. 4 Gewinnt benötigt das aktualisierte Backend;
eine neue Frontend-Ausgabe allein stellt die Engine nicht online bereit.
