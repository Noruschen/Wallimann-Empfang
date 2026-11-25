# Empfangsbildschirm Wallimann

Eine kleine Website für den Fernseher am Empfang der Wallimann Druck AG. Sie läuft im Vollbild und wechselt zwischen drei Ansichten: Begrüssung von Besuch, die neusten Artikel von michelnews.ch und der Solarstrom der eigenen Anlage.

**Stand 25.11.2026:** Testversion mit Beispieldaten. Im Internet stehen nur die Testseite für den Fernseher (`https://empfang.wallimann.workers.dev/test/`) und eine Vorschau der Anzeige mit Beispieldaten (`https://empfang.wallimann.workers.dev/vorschau`). Beide enthalten keine Besuchsdaten. Die eigentliche Website ist noch nicht veröffentlicht. Die Begrüssung und die Solar-Ansicht sind ausgeschaltet, bis ihre Zugänge getestet sind.

Dieses Projekt ist öffentlich einsehbar. Es enthält darum keine Geheimnisse und keine echten Kundennamen. Alle Firmen und Personen in Beispielen und Tests sind erfunden.

## Ansehen am Mac

Voraussetzung: Node.js ab Version 22.

```
npm install     (nur beim ersten Mal)
npm start
```

Danach im Browser:

- Anzeige: `http://localhost:8787/anzeige/#k=beispiel-schluessel-nur-lokal`
- Statusseite: `http://localhost:8787/status/` (Passwort lokal: `beispiel`)
- Testseite für den Fernseher: `http://localhost:8787/test/`
- Vorschau der vier Designs: `http://localhost:8787/anzeige/?demo=alles&design=1` (bis `design=4`)

In der Testversion wechseln Begrüssung und News alle 10 Minuten ab, damit man beides sieht.

## Tests

```
npm test
```

181 Tests prüfen Zeitlogik, Kalender, News, Solar, Schutz und Ausfälle. Sie brauchen kein Internet.

Zusätzlich gibt es Prüfungen im echten Browser (Ausfall des Internets, Neuladen ohne Internet, Wechsel der Ansichten). Sie brauchen das Werkzeug Playwright, das bewusst nicht zum Projekt gehört: zuerst `npm start`, dann in einem zweiten Fenster `node test/browser/anzeige.mjs`.

## Dokumente

| Dokument | Für wen |
|---|---|
| [docs/anleitung.md](docs/anleitung.md) | Alexander: Statusseite, Passwort und Link wechseln, veröffentlichen, Störungen |
| [docs/mitarbeitende.md](docs/mitarbeitende.md) | Mitarbeitende: Besuch über Outlook anmelden |
| [docs/it.md](docs/it.md) | IT: Fernseher einrichten, Konto absichern, Umstieg auf Firmenpostfach |
| [docs/gl.md](docs/gl.md) | Geschäftsleitung: Daten, Kosten, Konten, Entscheide |
| [docs/rss-bestellung.md](docs/rss-bestellung.md) | Text für die Bestellung des RSS-Feeds bei Wallimann Medien |
| [docs/offene-punkte.md](docs/offene-punkte.md) | Was noch offen ist und wer am Zug ist |

## Aufbau

| Ordner oder Datei | Inhalt |
|---|---|
| `public/anzeige/` | Die Anzeige für den Fernseher (HTML, CSS, altes JavaScript für ältere TV-Browser) |
| `public/status/` | Statusseite mit Einstellungen, Hilfsseite für zufällige Schlüssel |
| `public/test/` | Testseite für den Browser des Fernsehers, ohne Besuchsdaten |
| `public/sw.js` | Offline-Speicher: Die Anzeige startet auch ohne Internet |
| `src/worker.js` | Der Server bei Cloudflare: gibt Daten nur mit Schlüssel oder Passwort heraus |
| `src/aufgaben.js` | Zeitgesteuerte Abrufe: Kalender, News, Bilder, Aufräumen, Warnungen |
| `src/lib/kalender.js` | Liest den Kalender (ICS) und wendet die Regeln für Besuche an |
| `src/lib/news.js` | Die eine Funktion für News: Feed oder Auslesen der Startseite |
| `src/lib/zeit.js` | Zeitlogik in der Zeitzone Europe/Zurich |
| `src/einstellungen.js` | Standardwerte aller Einstellungen |
| `test/` | Tests und gespeicherte Kopien (Startseite von michelnews.ch, Beispielkalender) |
| `wrangler.jsonc` | Einstellungen für Cloudflare, ohne Geheimnisse |

## Entscheide und ihre Gründe

**Cloudflare Workers mit Datenbank D1 und Bildspeicher KV.** Die Website braucht einen Server, der den Kalender liest und Daten nur mit Schlüssel herausgibt, und die Gratis-Stufe deckt den erwarteten Betrieb. Die Datenbank lässt sich auf den Speicherort EU festlegen, und KV speichert die News-Bilder, ohne dass im Konto eine Zahlungsart nötig ist.

**Werkzeug Wrangler statt des neueren «cf».** Wrangler ist ausgereift und kommt mit einer einzigen Abhängigkeit aus. Das neuere Werkzeug hätte sieben Abhängigkeiten und einen zusätzlichen Bauschritt gebracht.

**Kein Framework, einfaches HTML, CSS und altes JavaScript für die Anzeige.** Browser in Fernsehern sind oft alt, und jede neuere Funktion ist dort ein Risiko. Die Anzeige rechnet mit einer festen Bühne von 1'920 × 1'080 Pixeln und skaliert sie, so sieht sie auf jedem Gerät gleich aus.

**Geheimer Schlüssel hinter dem Zeichen # im Link.** Dieser Teil der Adresse wird vom Browser nicht an den Server geschickt und steht darum in keinem Protokoll. Die Anzeige schickt den Schlüssel bei jeder Abfrage in einer Kopfzeile mit, ohne ihn gibt der Server nichts heraus.

**Besuche über einen veröffentlichten Kalender-Link (ICS).** Dafür braucht es keine Anmeldung, die ablaufen kann, und die Website kann nur lesen. Ob Outlook.com neue und abgesagte Termine schnell genug in den Link schreibt, zeigt erst der Test mit echten Einladungen.

**Begrüssung nur mit frischen Daten.** Der Server gibt einen Namen erst kurz vor dem Zeitfenster heraus und nur, wenn der Kalender in den letzten 15 Minuten geladen wurde. Die Anzeige zeigt ihn nur, wenn sie in den letzten 2 Minuten Kontakt zum Server hatte, und speichert Namen nie auf dem Gerät.

**News über eine einzige Funktion.** Heute liest sie jeden Tag um 08:00 und um 13:00 die Startseite von michelnews.ch aus und holt das grösste Bild von der Artikelseite. Sobald die Adresse eines RSS-Feeds eingetragen ist, nimmt dieselbe Funktion den Feed.

**Einstellungen auf der Statusseite statt im Code.** So lassen sich Zeiten, Filter und Design am iPhone ändern, ohne etwas zu veröffentlichen. Geheimnisse sind davon getrennt und stehen nur in den geschützten Einstellungen von Cloudflare.

**Design 1 «Papier» als Standard.** Es übernimmt Farben, Schriften und Formen der Vorschau der neuen Wallimann-Website. Drei weitere Designs sind eingebaut und auf der Statusseite umschaltbar.

## Kosten

| Posten | Kosten |
|---|---|
| Cloudflare, Gratis-Stufe | CHF 0, reicht voraussichtlich |
| Cloudflare «Workers Paid», falls die Rechenzeit der Gratis-Stufe nicht reicht | USD 5 pro Monat |
| GitHub, Outlook.com | CHF 0 |
| Eigene Domain für Warn-E-Mails (freiwillig) | grob CHF 10 bis 20 pro Jahr |
| Solardaten über Fronius Solar.web | offen |

## Was noch nicht getestet werden konnte

- Der echte Kalender-Link von Outlook.com mit echten Einladungen.
- Der Browser des Fernsehers.
- Ob michelnews.ch Abrufe von Cloudflare aus zulässt.
- Die Rechenzeit bei Cloudflare, der E-Mail-Versand und echte Solardaten.
