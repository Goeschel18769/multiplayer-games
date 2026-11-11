**Zum Spielen:** `multiplayer-games.zip` unter Assets herunterladen und vollständig entpacken. Danach `index.html` per Doppelklick öffnen.

Das ZIP enthält ausschließlich:

- `index.html`
- `app.js`
- `style.css`
- `img/` mit den drei Vorschaubildern

Die drei Hauptdateien und den Ordner `img/` zusammenlassen. Die Hauptdateien stehen zusätzlich einzeln unter Assets bereit; dafür auch `img.zip` herunterladen und daneben entpacken. Node.js, eine Installation oder ein lokaler Webserver sind zum Spielen nicht erforderlich; eine Internetverbindung zum gemeinsamen Backend wird benötigt.

Die Bilder liegen als normale PNG-Dateien im Bildordner; `app.js` enthält keine eingebetteten Base64-Bilder mehr.

Die verfügbare Modusauswahl richtet sich nach dem angeschlossenen Backend. Dieses Release veröffentlicht die lokale Spieloberfläche; das Cloudflare-Backend wird separat aktualisiert.

Enthaltene Spiele: Tic Tac Toe (3×3 und 15×15), 4 Gewinnt und Schiffe versenken.
Schiffe versenken bietet das blaue 10×10-Brett mit detaillierten Militärschiffen, drehbarem L-Schiff, manueller und zufälliger Platzierung. Treffer erlauben einen weiteren Schuss; nur tatsächliche Schüsse werden markiert.
