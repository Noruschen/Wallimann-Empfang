# Empfangsbildschirm: Übersicht für die GL

Stand: 25.11.2026

## Was die Website kann

Am Empfang der Wallimann Druck AG hängt ein Fernseher im Querformat. Er zeigt eine Website im Vollbild. Sie wechselt zwischen drei Ansichten:

- **Begrüssung von Besuch:** Firma und, falls angegeben, Name des Besuchs, ab 30 Minuten vor bis 15 Minuten nach Terminbeginn. Die Termine kommen aus einem Outlook-Kalender.
- **News:** die 10 neusten Artikel von michelnews.ch mit Bild, Überschrift, Rubrik, Ort und Datum, ohne Artikeltext und ohne Werbung.
- **Solarstrom:** aktuelle Leistung und Tagesertrag der Fronius-Anlage.

Immer sichtbar sind Logo, Datum und Uhrzeit. Ausserhalb der Betriebszeiten (Montag bis Freitag, 07:00 bis 19:00) bleibt der Bildschirm schwarz, ausser bei einer Begrüssung. Der Bildschirm zeigt nie eine Fehlermeldung. Fällt eine Quelle aus, laufen die zuletzt gespeicherten News weiter.

## Wo die Daten liegen

- **Cloudflare:** Die Website läuft bei Cloudflare. Die Datenbank wird beim Einrichten auf den Speicherort EU festgelegt. Das Serverprogramm läuft im weltweiten Netz von Cloudflare und verarbeitet die Daten dort kurzzeitig.
- **Outlook.com:** Die Termine liegen in einem eigenen Outlook.com-Konto bei Microsoft, ausserhalb des Firmen-Outlooks. Dort bleiben sie, solange sie im Kalender stehen.
- **Was gespeichert wird:** Firma, Name des Besuchs und Zeit der Besuche von heute und morgen. Dazu News-Titel und Bilder, Zeitpunkte der letzten Abrufe und Einstellungen. Besuchsdaten werden am Tag nach dem Termin gelöscht. Auf dem Fernseher selbst werden keine Namen gespeichert. Zu beachten: Cloudflare hält von der Datenbank automatisch Sicherungen, in der Gratis-Stufe für 7 Tage (Funktion «Time Travel», Quelle: https://developers.cloudflare.com/d1/reference/time-travel/). Gelöschte Besuche sind darin so lange noch enthalten.
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
- **Was auf den Bildschirm kommt:** Jeder Termin im Kalender des Empfangskontos, ausser er ist privat, abgesagt oder ganztägig. Vom Betreff kommt nur bereinigter Text auf den Bildschirm: Firma und Name, keine Links, keine Bilder, je höchstens 60 Zeichen, und nur im Zeitfenster des Termins.
- **Grenzen:** Der Kalender-Link von Outlook.com liefert nicht mit, wer einen Termin angelegt hat (getestet am 25.11.2026). Die Website kann darum nicht prüfen, ob eine Einladung von einer Wallimann-Adresse stammt. Wer die Adresse des Empfangskontos kennt, kann eine Einladung schicken. Ob Outlook.com Einladungen fremder Absender von selbst in den Kalender stellt, ist noch nicht getestet. Zusätzlich möglich und noch zu testen: in Outlook.com nur sichere Absender zulassen. Wer den geheimen Link kennt, kann die Anzeige sehen.

## Stand

Die Website ist seit dem 25.11.2026 unter `https://empfang.wallimann.workers.dev` veröffentlicht. Ohne geheimen Schlüssel und ohne Passwort gibt sie nichts heraus. Die Adresse der Website ist `https://empfang.wallimann.workers.dev`. Die Begrüssung ist noch nicht in Betrieb: Der Kalender ist seit dem 25.11.2026 angebunden und mit einer Testeinladung geprüft, der Test am Fernseher am Empfang steht noch aus. Die Solar-Ansicht ist ausgeschaltet, bis der Zugang zu den Solardaten geklärt ist. Welches Gerät die Website am Fernseher anzeigt, ist offen.

## Was die GL entscheiden muss

1. Ist die GL mit der Speicherung bei Cloudflare und Outlook.com einverstanden, nach Prüfung des Vertrags zur Auftragsbearbeitung?
2. Dürfen die Konten vorerst privat auf Alexander Fischer laufen, oder sollen sie auf die Firma umziehen?
3. Wo werden die Zugangsdaten hinterlegt?
4. Ist die GL einverstanden, dass jeder Termin im Kalender des Empfangskontos erscheint, ohne Prüfung, wer eingeladen hat? Der Kalender-Link von Outlook.com lässt diese Prüfung nicht zu. Die Alternative ist ein Zugang über eine Anmeldung bei Microsoft (mehr Aufwand, noch nicht gebaut).
5. Soll später auf ein Postfach im Firmen-Outlook umgestiegen werden?
6. Soll für Warn-E-Mails eine Domain zu Cloudflare genommen werden (grob CHF 10 bis 20 pro Jahr), oder reicht die Statusseite?
7. Passt das Logo «wallimann medien und kommunikation» am Empfang, oder soll das Logo der Wallimann Druck AG geliefert werden?
