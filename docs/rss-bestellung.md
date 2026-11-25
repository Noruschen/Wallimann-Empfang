Für Alexander: Kopiere den Text unten und schicke ihn an Wallimann Medien (zuständig für die Website michelnews.ch). Ergänze die Antwort danach auf der Statusseite im Feld für die Adresse des RSS-Feeds.

---

Hallo zusammen

Am Empfang der Wallimann Druck AG läuft ein Bildschirm, der die neusten Artikel von michelnews.ch zeigt. Heute lesen wir dafür die Startseite aus. Das ist unschön, weil wir nur kleine Bilder bekommen und die Seite nicht für Maschinen gedacht ist. Darum bestellen wir einen RSS-Feed der Website (TYPO3).

Der Feed soll folgende Angaben liefern (RSS 2.0):

- Je Artikel `<title>`, `<link>` und `<pubDate>`
- Die Rubrik als `<category>`
- Den Ort als `<category domain="ort">`
- Das Bild als `<enclosure url="…" type="image/jpeg">` oder als `<media:content url="…" width="…" height="…">`
- Bild mindestens 1'920 Pixel breit, im Querformat (ideal 16:9 oder 4:3)
- Mindestens die 10 neusten Artikel
- Nur redaktionelle Artikel, keine Inserate und keine Abo-Hinweise
- Adresse über HTTPS erreichbar

So könnte ein Eintrag aussehen (der Artikel ist erfunden):

```xml
<item>
  <title>Neuer Dorfplatz wird eingeweiht</title>
  <link>https://www.michelnews.ch/beispiel-dorfplatz</link>
  <pubDate>Wed, 11 Nov 2026 14:30:00 +0100</pubDate>
  <category>Gemeinde</category>
  <category domain="ort">Beromünster</category>
  <enclosure url="https://www.michelnews.ch/bilder/dorfplatz.jpg" type="image/jpeg" />
</item>
```

Könnt ihr uns bitte die Adresse des Feeds mitteilen, sobald er läuft?

Danke und freundliche Grüsse
Alexander
