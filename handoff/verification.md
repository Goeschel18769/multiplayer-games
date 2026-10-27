# Prüfstand und Grenzen

Stand: 23.10.2026. Der Backend-Vertrag wurde aus Worker-Routing, HTTP-Helfern,
Nachrichtenvalidatoren, Fehlerdefinitionen, Einstellungen, Namensnormalisierung,
Raum-/Match-Verwaltung, Statistik, produktiver Registry und Tic-Tac-Toe-Engine
abgeleitet. Frontend-Konfiguration, Transport, Darstellung und Build wurden
ebenfalls mitgelesen. Frühere Architekturpläne sind keine API-Quelle.

## Durch Tests und vorhandene Prüfberichte belegt

Die vorhandene Regression umfasst 35 Unit-Tests und 20 Workerd-Integrationstests.
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
