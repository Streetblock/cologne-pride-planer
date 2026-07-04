# Cologne Pride Planer

Lokale Planungs-App fuer den Cologne Pride 2026: Startreihenfolge durchsuchen, Favoriten merken, Gruppen als "Jetzt da" markieren und daraus eine ETA-Prognose fuer kommende Favoriten ableiten.

Repository: `streetblock/cologne-pride-planer`

## Was die App macht

- Startreihenfolge mit 244 Gruppen anzeigen
- Suche nach Name, Nummer oder ID
- Favoriten lokal im Browser speichern
- "Jetzt da"-Marker lokal im Browser speichern
- ETA-Prognose aus den gesetzten Markern berechnen
- Als Progressive Web App installierbar, wenn sie ueber `https://` oder `localhost` ausgeliefert wird
- App-Shell und Gruppendaten per Service Worker cachen

Die App hat bewusst kein Backend und keine echten Live-Standortdaten. Alle Markierungen entstehen lokal auf dem eigenen Geraet.

## Lokal starten

Die App muss ueber einen lokalen Webserver laufen, weil `groups.json` per `fetch()` geladen wird und Service Worker nicht ueber `file://` funktionieren.

Mit Node.js:

```bash
npx serve .
```

Oder mit Python:

```bash
python -m http.server 8000
```

Dann im Browser `http://localhost:8000` oeffnen.

## Dateien

- `index.html` - HTML-Shell
- `style.css` - App-spezifische Styles
- `app.js` - UI, lokale Marker, Favoriten und ETA-Prognose
- `groups.json` - Gruppen- und Startreihenfolge-Daten
- `manifest.webmanifest` - PWA-Metadaten
- `sw.js` - Service Worker Cache
- `icon.svg`, `icon-192.png`, `icon-512.png` - App-Icons

## Prognose

Die Prognose startet pragmatisch mit zwei Markern, wenn diese mehr als fuenf Gruppen auseinander liegen. Sobald mehr Daten vorhanden sind, nutzt die App mehrere Abschnitte und filtert Ausreisser robuster heraus.
