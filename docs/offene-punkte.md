# Offene Punkte

Stand: 25.11.2026

| Punkt | Wer ist am Zug | Was genau zu tun ist |
|---|---|---|
| Speicherung bei Cloudflare und Outlook.com | GL | Zustimmen und den Vertrag zur Auftragsbearbeitung (DPA) von Cloudflare prüfen. Er gilt für den Kontoinhaber, das Konto läuft privat auf Alexander. |
| Private Konten (Cloudflare, GitHub, Outlook.com) | GL | Bestätigen, dass die Konten vorerst privat laufen, oder später auf die Firma umziehen. Zugangsdaten bei der GL hinterlegen. |
| Erlaubte Domain der Organisatoren | erledigt | Alexander hat am 25.11.2026 bestätigt: wallimann.ch. |
| Test des Kalender-Links mit echten Einladungen | Alexander | Erster Teil erledigt am 25.11.2026: Eine Einladung aus dem Firmen-Outlook steht von selbst im Kalender des Empfangskontos, ein verschobener Termin zieht von selbst nach, ein abgesagter Termin bleibt als «Abgesagt: …» stehen (die Website lässt ihn weg), ein als «privat» versendeter Termin kommt als privat an. Die Termine erscheinen nach etwa 30 Sekunden bis 1 Minute. Noch offen: Kalender in Outlook.com veröffentlichen, Link eintragen, echte Einladungen schicken. Prüfen, wie schnell neue, geänderte und abgesagte Termine erscheinen, ob Organisator und «privat» im Link stehen und ob Einladungen im Junk-Ordner landen. Dauert es länger als 10 Minuten, taugt der Kalender-Link nicht. Dann entscheiden wir über den anderen Weg: Die Website liest den Kalender über eine Anmeldung bei Microsoft (mehr Aufwand, noch nicht gebaut). |
| Begrüssung einschalten | Alexander | Erst nach dem erfolgreichen Test, in den Einstellungen der Statusseite. |
| Umstieg auf ein Firmenpostfach | IT | Später allenfalls ein Raumpostfach oder geteiltes Postfach im Firmen-Outlook anlegen. |
| RSS-Feed von michelnews.ch | Wallimann Medien | Feed bereitstellen und die Adresse mitteilen. Alexander schickt dafür den Text aus «rss-bestellung.md». |
| Solar-Zugang und Modell des Wechselrichters | Installateur | Fragen unten beantworten. |
| Weg zu den Solardaten | GL | Entscheiden, sobald die Antworten und Preise vorliegen. |
| Abspielgerät am Fernseher | Alexander | Marke und Modell des Fernsehers klären, die Testseite am Fernseher öffnen und den Code an Claude melden. Entscheid: Smart-TV oder Zusatzgerät. |
| Einstellungen am Fernseher | IT | Energiesparen, Abschalten bei Inaktivität und Bildschirmschoner ausschalten. Ein- und Aus-Timer passend zu 06:30 und 18:00 stellen. Verhalten nach Stromausfall prüfen. |
| Warn-E-Mails | GL | Entscheiden: Domain zu Cloudflare nehmen (grob CHF 10 bis 20 pro Jahr) oder darauf verzichten. Bis dahin stehen Störungen nur auf der Statusseite. |
| Logo | Alexander | Prüfen, ob das Logo «wallimann medien und kommunikation» passt, sonst das Logo der Wallimann Druck AG liefern. |
| Erstes Veröffentlichen im Internet | Claude | Vorher Alexander ausdrücklich um Erlaubnis fragen. |

## Fragen an den Installateur der Solaranlage

1. Welches Modell hat der Wechselrichter (Symo oder GEN24)?
2. Welche IP-Adresse hat er im Firmennetz?
3. Ist die lokale Schnittstelle «Solar API» eingeschaltet, und wer darf sie einschalten?
4. Ist die Anlage in Fronius Solar.web registriert, und unter welchem Konto?
5. Ist Solar.web Premium vorhanden?
6. Was kostet die Solar.web Query API?

## Was nicht getestet werden konnte

- Der echte Kalender-Link von Outlook.com.
- Ob michelnews.ch den Abruf von einem Cloudflare-Server aus zulässt (von der Testumgebung aus ging es).
- Der Browser des Fernsehers.
- Die Rechenzeit bei Cloudflare.
- Der E-Mail-Versand.
- Echte Solardaten.
