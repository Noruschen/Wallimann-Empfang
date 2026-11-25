# Empfangsbildschirm: Übersicht für die GL

Stand: 25.11.2026

## Was die Website kann

Am Empfang der Wallimann Druck AG hängt ein Fernseher im Querformat. Er zeigt eine Website im Vollbild. Sie wechselt zwischen drei Ansichten:

- **Begrüssung von Besuch:** Firma, Name und Ansprechperson, ab 30 Minuten vor bis 15 Minuten nach Terminbeginn. Die Termine kommen aus einem Outlook-Kalender.
- **News:** die 10 neusten Artikel von michelnews.ch mit Bild, Überschrift, Rubrik, Ort und Datum, ohne Artikeltext und ohne Werbung.
- **Solarstrom:** aktuelle Leistung und Tagesertrag der Fronius-Anlage.

Immer sichtbar sind Logo, Datum und Uhrzeit. Ausserhalb der Betriebszeiten (Montag bis Freitag, 06:30 bis 18:00) bleibt der Bildschirm schwarz, ausser bei einer Begrüssung. Der Bildschirm zeigt nie eine Fehlermeldung. Fällt eine Quelle aus, laufen die zuletzt gespeicherten News weiter.

## Wo die Daten liegen

- **Cloudflare:** Die Website läuft bei Cloudflare. Die Datenbank wird beim Einrichten auf den Speicherort EU festgelegt. Das Serverprogramm läuft im weltweiten Netz von Cloudflare und verarbeitet die Daten dort kurzzeitig.
- **Outlook.com:** Die Termine liegen in einem eigenen Outlook.com-Konto bei Microsoft, ausserhalb des Firmen-Outlooks. Dort bleiben sie, solange sie im Kalender stehen.
- **Was gespeichert wird:** Firma, Name des Besuchs, Ansprechperson und Zeit der Besuche von heute und morgen. Dazu News-Titel und Bilder, Zeitpunkte der letzten Abrufe und Einstellungen. Besuchsdaten werden am Tag nach dem Termin gelöscht. Auf dem Fernseher selbst werden keine Namen gespeichert. Zu beachten: Cloudflare hält von der Datenbank automatisch Sicherungen, in der Gratis-Stufe für 7 Tage (Funktion «Time Travel», Quelle: https://developers.cloudflare.com/d1/reference/time-travel/). Gelöschte Besuche sind darin so lange noch enthalten.
- **Vertrag zur Auftragsbearbeitung:** Cloudflare stellt einen Standardvertrag bereit (Data Processing Addendum, «DPA»). Er ist Teil der Nutzungsbedingungen: https://www.cloudflare.com/cloudflare-customer-dpa/. Die GL kann ihn prüfen. Zu klären: Er gilt für den Kontoinhaber, und das Konto läuft privat auf Alexander Fischer.
- Die Verbindung ist immer verschlüsselt. Alle Seiten sind für Suchmaschinen gesperrt.

## Wem die Konten gehören

Cloudflare und GitHub laufen auf eine Privatperson, nicht auf die Firma. Auch das Outlook.com-Konto ist kein Firmenkonto:

- **Cloudflare:** privates Konto von Alexander Fischer, Gratis-Stufe.
- **GitHub:** privates Konto «Noruschen», Projekt «Wallimann-Empfang». Das Projekt ist öffentlich einsehbar. Darum enthält es keine Geheimnisse und keine echten Kundennamen.
- **Outlook.com:** eigenes Konto «empfang.wallimann@outlook.com». Es ist nicht Teil des Firmen-Outlooks.

Offen ist, wie bei Abwesenheit oder Austritt der Zugang gesichert wird. Für das Outlook.com-Konto sind starkes Passwort, Anmeldung in zwei Schritten und eine Wallimann-Adresse zur Wiederherstellung vorgesehen. Die Zugangsdaten sollen bei der GL hinterlegt werden. Microsoft kann unbenutzte Konten nach längerer Zeit schliessen. Darum soll man sich mindestens einmal pro Jahr anmelden. Ein späterer Umstieg auf ein Postfach im Firmen-Outlook ist möglich. Dann bleiben die Besuchsdaten in der Firmenumgebung.

## Was sie kostet

| Posten | Kosten |
|---|---|
| Cloudflare Gratis-Stufe | CHF 0, reicht voraussichtlich |
| Cloudflare «Workers Paid», nur falls die Rechenzeit der Gratis-Stufe nicht reicht (Test: 3 bis 10 Millisekunden bei 10 erlaubten) | USD 5 pro Monat |
| GitHub | CHF 0 |
| Outlook.com | CHF 0 |
| Eigene Domain für Warn-E-Mails (freiwillig) | grob CHF 10 bis 20 pro Jahr |
| Solardaten über die Schnittstelle von Fronius Solar.web | offen. Eine Drittquelle nennt EUR 52 pro Monat, ungeprüft |
| Zusatzgerät am Fernseher, falls der TV-Browser nicht reicht | offen, einmalig, nicht abgeklärt |

## Schutz

- **Geheimer Link:** Die Anzeige am Fernseher öffnet sich nur mit einem geheimen Schlüssel im Link. Ohne gültigen Schlüssel zeigt sie nur das Logo und bekommt keine Daten.
- **Statusseite mit Passwort:** Nach 5 falschen Versuchen innert 15 Minuten wird der Absender 15 Minuten gesperrt. Die Anmeldung gilt 12 Stunden.
- **Nur Wallimann-Organisatoren:** Besuche erscheinen nur, wenn der Termin von einer Adresse der erlaubten Domain angelegt wurde (wallimann.ch, von Alexander Fischer am 25.11.2026 bestätigt).
- **Grenzen:** Der Organisator einer Einladung lässt sich fälschen. Die Regel schützt darum nicht vollständig. Zusätzlich möglich und noch zu testen: in Outlook.com nur sichere Absender zulassen. Wer den geheimen Link kennt, kann die Anzeige sehen.

## Stand

Die Testversion läuft lokal mit Beispieldaten. Im Internet stehen bisher nur die Testseite für den Fernseher und eine Vorschau der Anzeige mit Beispieldaten. Beide enthalten keine Besuchsdaten. Die Adresse der Website ist `https://empfang.wallimann.workers.dev`. Die Begrüssung ist ausgeschaltet, bis der Kalender mit echten Einladungen getestet ist. Die Solar-Ansicht ist ausgeschaltet, bis der Zugang zu den Solardaten geklärt ist. Welches Gerät die Website am Fernseher anzeigt, ist offen.

## Was die GL entscheiden muss

1. Ist die GL mit der Speicherung bei Cloudflare und Outlook.com einverstanden, nach Prüfung des Vertrags zur Auftragsbearbeitung?
2. Dürfen die Konten vorerst privat auf Alexander Fischer laufen, oder sollen sie auf die Firma umziehen?
3. Wo werden die Zugangsdaten hinterlegt?
4. Ist die GL einverstanden, dass nur Termine von Adressen mit wallimann.ch erscheinen (von Alexander Fischer so bestätigt)?
5. Soll später auf ein Postfach im Firmen-Outlook umgestiegen werden?
6. Soll für Warn-E-Mails eine Domain zu Cloudflare genommen werden (grob CHF 10 bis 20 pro Jahr), oder reicht die Statusseite?
7. Passt das Logo «wallimann medien und kommunikation» am Empfang, oder soll das Logo der Wallimann Druck AG geliefert werden?
