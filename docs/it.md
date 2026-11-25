# Empfangsbildschirm Wallimann: Anleitung für die IT

Stand: 25.11.2026

## Worum es geht

Am Empfang der Wallimann Druck AG in Beromünster hängt ein Fernseher im Querformat (Full HD). Er zeigt im Vollbild eine Website. Sie wechselt zwischen der Begrüssung von Besuch, den neusten Artikeln von michelnews.ch und dem Solarstrom der eigenen Anlage (Fronius). Alexander Fischer, Stv. Leiter Druck, betreut das Ganze. Er ist kein Programmierer.

Die Website läuft bei Cloudflare (ein Dienst, der Websites betreibt), der Code liegt auf GitHub. Der Fernseher braucht nur einen Browser und eine Internetverbindung. Noch ist nichts veröffentlicht, die Testversion läuft lokal mit Beispieldaten.

Von euch brauchen wir den Fernseher richtig eingerichtet, Auskünfte zum Netzwerk und Hilfe bei den Konten.

## Fernseher einrichten

Marke und Modell des Fernsehers sind noch nicht bekannt. Darum steht hier alles allgemein. Bitte prüft jeden Punkt am Gerät.

1. **Testseite öffnen und Code melden.** Öffnet im Browser des Fernsehers die Adresse `BEISPIEL-ADRESSE/test/`. Die echte Adresse ist erst nach dem Einrichten bei Cloudflare bekannt, Alexander oder Claude geben sie euch. Die Testseite zeigt die Auflösung, die Schriften und was der Browser kann. Unten steht ein Code, zum Beispiel `1920x1080-11111111111`. Diesen Code meldet Alexander an Claude. Die Seite enthält keine Besuchsdaten.
2. **Anzeige-Adresse eintragen.** Die Adresse lautet `BEISPIEL-ADRESSE/anzeige/#k=GEHEIMER-SCHLUESSEL`. Der geheime Teil ist lang. Gebt ihn mit der Fernbedienung ein oder speichert die Adresse als Lesezeichen oder als Startseite. Ohne gültigen Schlüssel zeigt die Anzeige nur das Logo. Den echten Schlüssel gibt euch Alexander, er steht nirgends im Projekt. Schickt ihn nicht per E-Mail an Unbeteiligte.
3. **Energiesparen und Abschalten ausschalten.** Schaltet Energiesparen, automatisches Abschalten, den Bildschirmschoner und «Abschalten bei Inaktivität» aus. Die Bezeichnungen unterscheiden sich je nach Gerät.
4. **Timer stellen.** Stellt den Ein- und Aus-Timer passend zu den Betriebszeiten: einschalten kurz vor 06:30, ausschalten nach 18:00. Die Betriebszeiten sind Montag bis Freitag. Ausserhalb zeigt die Seite ein schwarzes Bild. Eine Begrüssung hat Vorrang und erscheint auch ausserhalb der Betriebszeiten, sofern der Fernseher dann eingeschaltet ist.
5. **Verhalten nach Stromausfall prüfen.** Schaltet der Fernseher von selbst wieder ein, und öffnet er die Anzeige wieder? Oft gibt es dafür eine Einstellung wie «Einschalten nach Stromausfall» oder ähnlich. Nicht bei allen Geräten ist sie vorhanden.
6. **Kann der Fernseher etwas nicht?** Die wichtigste Frage: Kann der Browser nach dem Einschalten von selbst eine Adresse öffnen? Viele TV-Browser können das nicht. Dann müsste nach jedem Einschalten und nach jedem Stromausfall jemand den Link von Hand starten. Das ist im Alltag nicht tragbar. Gleiches gilt, wenn die Testseite zeigt, dass der Browser zu wenig kann, oder wenn sich die Energiespar- und Abschaltfunktionen nicht ausschalten lassen. In allen diesen Fällen braucht es das Zusatzgerät, siehe unten. Meldet das bitte Alexander.

Die Anzeige ist in einfachem HTML, CSS und altem JavaScript geschrieben, damit sie auch in älteren TV-Browsern läuft. Ob der Browser des Fernsehers reicht, zeigt die Testseite. Zur Information: Gegen Einbrennen verschieben sich alle Inhalte alle 4 Minuten um wenige Pixel. Datum und Uhrzeit kommen vom Server (Zeitzone Europe/Zurich), die Uhr des Fernsehers hat keinen Einfluss.

## Zusatzgerät, falls der Browser des Fernsehers nicht reicht

Zuerst wird der Browser des Smart-TV ausprobiert. Reicht er nicht, kommt ein Zusatzgerät dazu.

- Empfehlung: ein Raspberry Pi 5 (ein kleiner Computer) mit dem Browser Chromium im Kioskmodus. Kioskmodus heisst: Der Browser startet nach dem Einschalten von selbst und zeigt die Adresse im Vollbild.
- Es kann zusätzlich die Solarwerte aus dem Firmennetz holen und an die Website schicken.
- Ein Mini-PC ist ebenfalls denkbar.
- Der Preis hängt vom Gerät ab und ist nicht abgeklärt.
- Die Einrichtung des Zusatzgeräts ist noch nicht beschrieben. Sie wird erst festgelegt, wenn klar ist, ob es gebraucht wird.

## Netzwerk

Das Gerät am Fernseher braucht nur ausgehende Verbindungen ins Internet über HTTPS (verschlüsselte Verbindung, Port 443). Eingehende Verbindungen braucht es nicht.

| Was | Wofür |
|---|---|
| Ausgehend per HTTPS zur Website bei Cloudflare | Anzeige und Daten. Die genaue Adresse steht erst nach dem Einrichten fest (`BEISPIEL-ADRESSE`). |
| Nur mit Zusatzgerät für Solar: Verbindung zum Wechselrichter im Firmennetz | Abfrage der Solarwerte. Der Wechselrichter braucht dafür eine feste IP-Adresse, siehe Abschnitt zu Solar. |

Hinweis: Welche Domains genau freigegeben werden müssen, ist noch offen, bis die Adresse bei Cloudflare bekannt ist. Die Seite holt die News und den Kalender nicht vom Fernseher, sondern von der Website bei Cloudflare.

## Konto empfang.wallimann@outlook.com absichern

Das Konto `empfang.wallimann@outlook.com` ist ein eigenes Outlook.com-Konto. Es gehört nicht zum Firmen-Outlook, liegt also bei Microsoft ausserhalb der Firmenumgebung. Mitarbeitende laden diese Adresse zu Terminen mit Besuch ein. Die Website liest daraus den Besuch.

Bitte helft sicherzustellen:

1. Starkes, einmaliges Passwort.
2. Anmeldung in zwei Schritten eingeschaltet.
3. Eine Wallimann-Adresse zur Wiederherstellung hinterlegt.
4. Zugangsdaten bei der Geschäftsleitung hinterlegt.
5. Mindestens einmal pro Jahr anmelden. Microsoft kann unbenutzte Konten nach längerer Zeit schliessen.
6. Zusätzlich möglich und noch zu testen: in Outlook.com unter «Junk-E-Mail» nur sichere Absender zulassen. Der Organisator einer Einladung lässt sich nämlich fälschen, die Regel «nur Wallimann-Adressen» schützt darum nicht vollständig.

Bekannt und offen: Die Konten bei Outlook.com, Cloudflare und GitHub laufen auf Alexander als Privatperson, nicht auf die Firma. Die Geschäftsleitung muss das bestätigen, oder die Konten ziehen später um.

## Späterer Umstieg auf ein Postfach im Firmen-Outlook

Ein Umstieg auf Microsoft 365 der Firma ist möglich. Vorteil: Die Besuchsdaten bleiben in der Firmenumgebung.

1. Die IT legt ein Raumpostfach oder ein geteiltes Postfach an.
2. Der Kalender wird dann über Microsoft Graph (die Schnittstelle von Microsoft für Kalender und Postfächer) mit einer App-Registrierung im Firmenverzeichnis gelesen. Dieser Weg ist noch nicht gebaut.
3. Falls die Firma es erlaubt, geht es auch mit einem veröffentlichten ICS-Link (eine geheime Kalenderadresse) wie heute.
4. In der Website ändert sich nur die Kalenderquelle.

Ob und wann ihr das wollt, ist offen.

## Solar: was wir vom Installateur brauchen

Die Anlage ist von Fronius. Das Modell des Wechselrichters ist unbekannt (Symo oder GEN24). Bitte fragt beim Installateur nach:

1. Modell des Wechselrichters.
2. Seine IP-Adresse im Firmennetz.
3. Ob die «Solar API» eingeschaltet ist und wer sie einschalten darf. Bei einem GEN24 muss diese lokale Schnittstelle zuerst im Wechselrichter eingeschaltet werden (Menü «Kommunikation»). Ein GEN24 liefert den Tagesertrag nicht direkt, er wird aus dem Gesamtzähler gerechnet.
4. Ob die Anlage in Solar.web registriert ist und unter welchem Konto.
5. Ob Solar.web Premium vorhanden ist.
6. Was die Solar.web Query API kostet. Laut Fronius gibt es sie nur für Firmenkunden mit Vertrag. Ein offizieller Preis ist nicht gefunden. Eine Drittquelle nennt EUR 52 pro Monat, das ist ungeprüft.

Die Wege zu echten Daten:

| Weg | Stand |
|---|---|
| Fronius Solar.web, Schnittstelle (Query API) | Nur mit Vertrag, Preis offen. |
| Fronius Solar.web, öffentliche Freigabe der Anlage | Kein offizieller Datenzugang. Nicht empfohlen. |
| Fronius «Public Display Mode» | Laut einer Quelle nur mit Solar.web Premium, im Fronius-Design statt in unserem. |
| Zusatzgerät im Firmennetz, das den Wechselrichter abfragt | Die Website ist vorbereitet (`/api/solar`, nur mit `SOLAR_SCHLUESSEL`). |

Bis der Zugang geklärt ist, bleibt die Solar-Ansicht ausgeschaltet.

## Offene Fragen an die IT

1. Marke und Modell des Fernsehers? Kann der Browser nach dem Einschalten von selbst eine Adresse öffnen? Gibt es «Einschalten nach Stromausfall»?
2. Netzwerkanschluss am Fernseher: WLAN oder Kabel? Welche Einschränkungen gelten (Firewall, Filter)?
3. Erlaubte Domain: Welche E-Mail-Domain haben Mitarbeitende, die Besuch anmelden dürfen? Angenommen ist `wallimann.ch`. Bitte bestätigen.
4. Wer sorgt für das Konto `empfang.wallimann@outlook.com` (Absicherung, Zugangsdaten bei der Geschäftsleitung)?
5. Wollt ihr später ein Postfach im Firmen-Outlook anlegen?
6. Welche Domains müssen im Firmennetz freigegeben werden, sobald die Adresse bei Cloudflare bekannt ist?
