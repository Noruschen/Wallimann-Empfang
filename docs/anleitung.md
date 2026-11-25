# Empfangsbildschirm Wallimann: Anleitung für Alexander

Stand: 25.11.2026

## Kurz erklärt

Am Empfang der Wallimann Druck AG hängt ein Fernseher im Querformat. Er zeigt im Vollbild eine Website. Die Website wechselt zwischen drei Ansichten: Begrüssung von Besuch, die neusten Artikel von michelnews.ch und Solarstrom der eigenen Anlage. Die Website läuft bei Cloudflare (ein Dienst, der Websites betreibt) und ihr Code liegt auf GitHub (eine Plattform für Programmdateien). Den Besuch holt die Website aus einem eigenen Outlook.com-Kalender: Mitarbeitende laden die Adresse `empfang.wallimann@outlook.com` zum Termin ein. Heute läuft die Testversion nur bei dir lokal, mit Beispieldaten. Die Website ist seit dem 25.11.2026 unter `https://empfang.wallimann.workers.dev` veröffentlicht. Ohne geheimen Schlüssel und ohne Passwort gibt sie nichts heraus. Die Begrüssung und die Solar-Ansicht sind in den Einstellungen noch ausgeschaltet. Du betreust das Ganze. Programmieren musst du nichts: Claude führt dich durch alle Schritte.

## Lokal ansehen am Mac

Voraussetzung: Node.js (ein Programm, das den Code ausführt) ab Version 22 ist auf dem Mac installiert.

1. Öffne das Programm «Terminal» und wechsle in den Projektordner «Wallimann-Empfang».
2. Beim allerersten Mal: `npm install` eingeben und mit der Eingabetaste bestätigen. Das holt die Hilfsprogramme.
3. Starten: `npm start`. Das Terminal bleibt offen, solange die Seite läuft.
4. Anzeige ansehen: im Browser `http://localhost:8787/anzeige/#k=beispiel-schluessel-nur-lokal` öffnen.
5. Statusseite ansehen: `http://localhost:8787/status/` öffnen. Das Passwort lokal ist `beispiel`.
6. Die Tests laufen lassen (optional): `npm test`.

Am iPhone geht das nicht. Dort zeigt dir Claude Bildschirmfotos.

Eine Vorschau ohne Server gibt es auch: `/anzeige/?demo=alles`. Weitere Möglichkeiten sind `?demo=begruessung`, `?demo=news` und `?demo=solar`. Mit dem Zusatz `&design=1` bis `&design=4` siehst du die vier Designs.

## Statusseite

Die Statusseite ist deine Kontrollstelle. Sie ist mit einem Passwort geschützt. Adresse: `https://empfang.wallimann.workers.dev/status/` (sie funktioniert erst, wenn die Website veröffentlicht ist).

### Was sie zeigt

- Wann Kalender, News und Solar zuletzt erfolgreich geladen wurden.
- Wann die Anzeige am Fernseher zuletzt Daten abgeholt hat.
- Wie viele Besuche heute anstehen.
- Die Besuche von heute und morgen, so wie die Website sie liest.
- Wie viele Termine aus welchem Grund nicht angezeigt werden.
- Hinweise und Störungen.

### Die Knöpfe

| Knopf | Wofür |
|---|---|
| Aktualisieren | Lädt die Anzeige der Statusseite neu. |
| Kalender jetzt abrufen | Holt den Kalender sofort. Praktisch beim Testen von Einladungen. |
| Abmelden | Beendet deine Anmeldung. Sie gilt sonst 12 Stunden. |

### Die Einstellungen

Der Fernseher übernimmt Änderungen innert einer Minute.

| Einstellung | Bedeutung | Standardwert |
|---|---|---|
| Begrüssung am Fernseher eingeschaltet | Schaltet die Begrüssung ein oder aus. | Aus, bis der Kalender mit echten Einladungen getestet ist |
| Beginn vor dem Termin | Wie viele Minuten vor Terminbeginn die Begrüssung startet. | 30 Minuten |
| Ende nach Terminbeginn | Wie viele Minuten nach Terminbeginn sie endet. | 15 Minuten |
| Wechsel bei mehreren Besuchen | Sekunden pro Besuch, wenn mehrere gleichzeitig da sind. | 10 Sekunden |
| Erlaubte Adressen der Organisatoren | Nur Termine von Personen mit dieser Domain (Teil der E-Mail-Adresse nach dem @) erscheinen. | `wallimann.ch` (von dir bestätigt am 25.11.2026) |
| Kalender holen alle | Wie oft die Website den Kalender holt. | 5 Minuten |
| Anzahl Artikel | Wie viele News-Artikel gezeigt werden. | 10 |
| Nur diese Gemeinden | Filter nach Gemeinde. Leer heisst alle. | Leer (alle) |
| Nur diese Rubriken | Filter nach Rubrik. Leer heisst alle. | Leer (alle) |
| Adresse des RSS-Feeds | Sobald eingetragen, nimmt die Website den Feed statt der Startseite von michelnews.ch. | Leer (Startseite auslesen) |
| News holen um | Zu diesen Uhrzeiten holt die Website jeden Tag die Artikelliste von michelnews.ch. Beim ersten Start holt sie sofort. Scheitert ein Abruf, versucht sie es alle 15 Minuten nochmals. | 08:00 und 13:00 |
| Nur ohne Uhrzeiten: News holen alle | Gilt nur, wenn das Feld mit den Uhrzeiten leer ist. Dann holt die Website im Abstand, mindestens alle 15 Minuten. | 15 Minuten |
| Quelle (Solar) | «ausgeschaltet», «Beispieldaten» oder «Werte von einem Zusatzgerät». | Ausgeschaltet |
| Solar-Ansicht nach jedem wievielten Artikel | Wie oft die Solar-Ansicht dazwischen kommt. | Nach jedem 3. Artikel |
| Sekunden pro Ansicht | Wie lange jede Ansicht steht (10 bis 15). | 12 Sekunden |
| Design | 1 Papier, 2 Rot, 3 Dunkel, 4 Sprechblase. | 1 Papier |
| Ausrichtung des Fernsehers | «quer» oder «hochkant» mit gedrehtem Inhalt. Hängt der Fernseher hochkant, dreht er sein Bild meist nicht selbst. Dann dreht die Seite ihren Inhalt um 90 Grad, im oder gegen den Uhrzeigersinn. Dreht das Gerät sein Bild selbst, stellt sich die Seite von allein auf hochkant um. | quer |
| Betriebstage und Betriebszeiten | Wann der Bildschirm etwas zeigt. Sonst bleibt er schwarz. | Montag bis Freitag, 06:30 bis 18:00 |
| Empfänger und Absender der Warn-E-Mails | Adressen für Warnungen per E-Mail. | Noch nicht eingerichtet, siehe «Was noch nicht getestet ist» |

### Die Bremse bei falschem Passwort

Nach 5 falschen Versuchen innert 15 Minuten ist der betreffende Absender (der Internetanschluss, von dem aus es versucht wurde) 15 Minuten gesperrt. Die Sperre gilt nur für diesen Absender. Andere können sich weiter anmelden. Warte einfach 15 Minuten und versuche es dann mit dem richtigen Passwort. Gespeichert wird nur ein unkenntlich gemachter Wert des Absenders, keine IP-Adresse.

## Besuch testen

Wichtig: Der Kalender-Link ist noch nicht getestet. Ob alles so funktioniert, wie es gebaut ist, zeigt erst dieser Test mit echten Einladungen. Darum ist die Begrüssung bis dahin ausgeschaltet.

1. Lege in Outlook einen Termin an und lade zusätzlich `empfang.wallimann@outlook.com` ein.
2. Schreibe den Betreff so: `Firmenname` oder `Firmenname | Name des Besuchs`. Das Zeichen `|` ist der senkrechte Strich. Beispiel: `Muster Verpackungen AG | Frau Anna Beispiel`. Der Name erscheint nur, wenn er im Betreff steht.
3. Outlook zeigt beim Einladen vielleicht einen Hinweis auf eine externe Adresse. Das ist richtig so.
4. Öffne die Statusseite und drücke «Kalender jetzt abrufen».
5. Prüfe in der Liste der Besuche, ob dein Termin mit der richtigen Firma, dem Namen und der Ansprechperson erscheint. Ansprechperson ist die Person, die den Termin angelegt hat.
6. Schalte erst «Begrüssung am Fernseher eingeschaltet» ein, wenn alles stimmt.

Was du beim Test genau beobachten sollst:

- Landet die Einladung von selbst im Kalender? Erledigt: Ja, eine Testeinladung aus dem Firmen-Outlook stand am 25.11.2026 von selbst im Kalender des Empfangskontos, nach etwa 30 Sekunden bis 1 Minute.
- Landet eine Einladung einmal im Junk-Ordner statt im Kalender?
- Wie schnell erscheinen neue, geänderte und abgesagte Termine? Dauert es länger als 10 Minuten, taugt dieser Weg nicht und Claude schlägt einen anderen vor.
- Erscheint der Organisator mit E-Mail-Adresse? Fehlt er, zeigt die Website den Termin aus Sicherheitsgründen nicht an.
- Funktioniert die Markierung «privat»? Zum Teil erledigt: Ein als «privat» versendeter Termin stand am 25.11.2026 nach etwa 30 Sekunden als privat im Kalender des Empfangskontos. Noch offen: ob die Markierung auch im veröffentlichten Kalender-Link steht. Das zeigt erst der Test mit der Website.
- Bleiben abgesagte Termine als «Abgesagt: …» stehen? Erledigt: Ja, getestet am 25.11.2026. Die Website erkennt das und zeigt solche Termine nicht an.
- Zieht der Kalender nach, wenn ein Termin verschoben wird? Erledigt: Ja, getestet am 25.11.2026.
- Wie schnell klappt ein Spontanbesuch? Die Begrüssung beginnt frühestens beim nächsten Abruf des Kalenders (alle 5 Minuten).

Nicht angezeigt werden: abgesagte Termine, als «privat» markierte Termine, ganztägige Termine, Termine von Organisatoren ohne Adresse der erlaubten Domain und Termine ohne Organisator. Soll ein Termin nicht erscheinen (zum Beispiel ein vertraulicher Besuch), lade `empfang.wallimann@outlook.com` am sichersten gar nicht ein. Ein als «privat» markierter Termin erscheint ebenfalls nicht.

## Passwort und geheimen Link wechseln

Es gibt zwei Geheimnisse, die du wechseln kannst: den geheimen Teil der Adresse für den Fernseher (`ANZEIGE_SCHLUESSEL`, mindestens 20 Zeichen) und das Passwort der Statusseite (`STATUS_PASSWORT`, mindestens 12 Zeichen). Nichts davon darf im Chat oder auf GitHub stehen, denn das GitHub-Projekt ist öffentlich einsehbar.

1. Öffne die Hilfsseite `https://empfang.wallimann.workers.dev/status/schluessel/` (lokal: `http://localhost:8787/status/schluessel/`). Sie erzeugt in deinem Browser einen zufälligen Schlüssel und ein zufälliges Passwort. Nichts davon wird gesendet oder gespeichert.
2. Kopiere die neuen Werte an einen sicheren Ort, zum Beispiel in deinen Passwortmanager.
3. Melde dich im Cloudflare-Konto an und öffne den Worker «empfang» (so heisst das Serverprogramm). Gehe zu «Settings», dann «Variables and Secrets».
4. Trage den neuen Wert beim gleichen Namen als «Secret» ein, also `ANZEIGE_SCHLUESSEL` oder `STATUS_PASSWORT`, und speichere («Deploy»).
5. Nach einem Wechsel von `STATUS_PASSWORT` sind alle Anmeldungen an der Statusseite sofort ungültig. Melde dich mit dem neuen Passwort neu an.
6. Nach einem Wechsel von `ANZEIGE_SCHLUESSEL` zeigt der Fernseher nur noch das Logo, bis die neue Adresse eingetragen ist. Die neue Adresse lautet `https://empfang.wallimann.workers.dev/anzeige/#k=GEHEIMER-SCHLUESSEL`, mit deinem neuen Schlüssel statt GEHEIMER-SCHLUESSEL.
7. Trage die neue Adresse am Fernseher ein (mit der Fernbedienung, als Lesezeichen oder als Startseite). Ist ein Zusatzgerät am Fernseher, trägst du sie dort ein. Die IT hilft dabei.
8. Prüfe, ob der Fernseher wieder Inhalte zeigt.

Der geheime Kalender-Link (`KALENDER_URL`) steht an derselben Stelle in Cloudflare. Du trägst ihn selbst ein und gibst ihn nie im Chat weiter.

## Eine Änderung veröffentlichen

Heute, im Übergang: Du sagst Claude, was sich ändern soll. Claude macht die Änderung, prüft sie, zeigt sie dir und spielt sie über den verbundenen Cloudflare-Konnektor auf die Website. Die Dateien für den Browser holt die Website dabei aus dem öffentlichen GitHub-Projekt, fest auf den geprüften Stand.

Später, sobald GitHub und Cloudflare verbunden sind:

1. Du sagst Claude, was sich ändern soll. Claude macht die Änderung, zeigt sie dir und legt sie nach deinem Einverständnis auf GitHub in den Hauptzweig («main»). Das ist die Hauptversion des Projekts.
2. Cloudflare bemerkt die Änderung und veröffentlicht sie automatisch. Du musst nichts tun. Die Funktion heisst «Workers Builds».
3. Die Anzeige am Fernseher lädt sich danach von selbst neu, innert etwa einer Minute.

Einstellungen auf der Statusseite brauchen das nicht. Sie gelten innert einer Minute.

## Stand der Einrichtung

| Schritt | Stand |
|---|---|
| Datenbank bei Cloudflare, Speicherort EU | erledigt am 25.11.2026 |
| Bildspeicher für die News-Bilder | erledigt am 25.11.2026 |
| Website veröffentlicht | erledigt am 25.11.2026, mit deiner Erlaubnis |
| News von michelnews.ch von Cloudflare aus holen | erledigt, getestet am 25.11.2026 |
| Geheimnisse `ANZEIGE_SCHLUESSEL` und `STATUS_PASSWORT` | vorläufige Testwerte gesetzt. Du ersetzt sie durch eigene, siehe «Passwort und geheimen Link wechseln» |
| Testseite am Fernseher des Empfangs öffnen und Code melden | offen. Adresse: `https://empfang.wallimann.workers.dev` |
| Kalender in Outlook.com als ICS-Link veröffentlichen (Berechtigung «Alle Details anzeigen») und als `KALENDER_URL` bei Cloudflare eintragen | offen. Die genauen Bezeichnungen in Outlook können abweichen |
| Mit echten Einladungen testen, siehe «Besuch testen» | zum Teil erledigt, siehe dort |
| Begrüssung auf der Statusseite einschalten | offen, erst nach dem Test |
| GitHub mit Cloudflare verbinden, damit Änderungen automatisch veröffentlicht werden | offen, am grossen Bildschirm |

## Was tun bei Störungen

| Zeichen | Wahrscheinliche Ursache | Was tun |
|---|---|---|
| Bildschirm schwarz | Ausserhalb der Betriebszeiten (Montag bis Freitag, 06:30 bis 18:00) oder Fernseher ausgeschaltet oder nach Stromausfall nicht wieder eingeschaltet. | Betriebszeiten auf der Statusseite prüfen. Fernseher einschalten. Bei wiederholtem Problem die IT fragen (Timer, Verhalten nach Stromausfall). |
| Nur Logo | Der geheime Schlüssel in der Adresse fehlt oder ist falsch, zum Beispiel nach einem Wechsel. Oder es gibt noch gar keine Daten. | Adresse am Fernseher prüfen: `https://empfang.wallimann.workers.dev/anzeige/#k=GEHEIMER-SCHLUESSEL`. Danach auf der Statusseite schauen, ob die Anzeige Daten abholt. |
| Keine Begrüssung | Begrüssung ausgeschaltet. Oder Termin nicht im Kalender oder nicht erlaubt (privat, ganztägig, abgesagt, fremde Domain, kein Organisator). Oder der letzte Kalenderabruf ist älter als 15 Minuten. Oder der Kalender-Link wurde zurückgesetzt. | Auf der Statusseite «Kalender jetzt abrufen» drücken und die Besuche und die Gründe für nicht angezeigte Termine ansehen. Einstellung «Begrüssung» prüfen. Ist der Link ungültig, meldet das die Statusseite: neuen Link veröffentlichen und eintragen. |
| Alte News | michelnews.ch war nicht erreichbar, dann laufen die zuletzt gespeicherten Artikel weiter. Oder der Fernseher hat kein Internet. | Auf der Statusseite ansehen, wann News zuletzt geladen wurden. Internet am Empfang prüfen. Meist erledigt sich das von selbst. |
| Keine Solar-Ansicht | Die Quelle ist ausgeschaltet, oder die Solarwerte sind älter als 10 Minuten. | Einstellung «Quelle» bei Solar prüfen. Echte Solardaten gibt es erst, wenn der Zugang geklärt ist. |
| Statusseite gesperrt | 5 falsche Passwörter innert 15 Minuten. | 15 Minuten warten, dann mit dem richtigen Passwort anmelden. |
| Fernseher zeigt etwas anderes | Der Fernseher hat eine andere Eingangsquelle oder eine andere Startseite gewählt. Oder eine Einstellung am Fernseher (Bildschirmschoner, Abschalten bei Inaktivität) greift ein. | Zuerst die Adresse am Fernseher prüfen und neu eintragen. Dann Energiespar- und Abschaltfunktionen prüfen. Im Zweifel die IT fragen. |

Der Bildschirm zeigt nie eine Fehlermeldung. Fällt das Internet am Empfang aus, laufen die zuletzt geladenen News weiter, aber ohne Begrüssung. Bei einem Hänger lädt sich die Anzeige selbst neu, zusätzlich einmal pro Nacht. Warn-E-Mails sind noch nicht eingerichtet: Störungen stehen vorerst nur auf der Statusseite.

## Was noch nicht getestet ist

- Der echte Kalender-Link von Outlook.com (siehe «Besuch testen»).
- Ob michelnews.ch den Abruf von einem Cloudflare-Server aus zulässt. Von hier aus ging es.
- Der Browser des Fernsehers. Marke und Modell sind noch nicht bekannt.
- Die Rechenzeit bei Cloudflare. Die Gratis-Stufe erlaubt 10 Millisekunden pro Aufruf, das Umrechnen des Kalenders lag im Test bei 3 bis 10 Millisekunden. Das ist knapp. Reicht es nicht, kostet die nächste Stufe USD 5 pro Monat.
- Der E-Mail-Versand für Warnungen. Dafür braucht es eine eigene Domain im Cloudflare-Konto, die es noch nicht gibt. Ob eine neue Domain (grob CHF 10 bis 20 pro Jahr) angeschafft wird, ist offen.
- Echte Solardaten. Der Zugang ist noch nicht geklärt.

Ein Hinweis zu den Konten: Cloudflare und GitHub laufen auf dich als Privatperson, nicht auf die Firma, und auch das Outlook.com-Konto ist kein Firmenkonto. Das muss die GL bestätigen. Melde dich zudem mindestens einmal pro Jahr im Outlook.com-Konto an, sonst kann Microsoft es schliessen.
