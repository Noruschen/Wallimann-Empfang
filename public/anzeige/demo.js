/*
  Beispieldaten für die Vorschau der Anzeige ohne Server.
  Aufruf: /anzeige/?demo=news, ?demo=begruessung, ?demo=solar, ?demo=standard oder ?demo=alles
  Zusätze: &design=1 bis 4 (Design wählen), &halt=1 (erste Ansicht stehen lassen),
           &drehung=90 oder 270 (Inhalt für einen hochkant montierten Fernseher drehen)

  Alle Firmen und Personen in den Begrüssungen sind erfunden. Die Artikel sind zehn Beispiele
  von michelnews.ch vom 24. und 25.11.2026, die Bilder werden direkt von dort geladen.
*/
window.EMPFANG_DEMO = function (art) {
  var b = 'https://michelnews.ch/fileadmin/';
  var p = b + '_processed_/';
  var news = [
    { id: 1, titel: '6000 Franken für zwei Vereine aus Gunzwil', ort: 'Gunzwil', rubrik: 'Mosaik', datum: '25.11.2026',
      bild: p + 'f/0/csm_VOI_Berom%C3%BCnster-SVKT-Gunzwil_a47b02465a.jpeg', bildBreite: 1200, bildHoehe: 900 },
    { id: 2, titel: 'Mit dem Chlaus-Höck das 90jährige Jubiläumsjahr abgeschlossen', ort: 'Rickenbach', rubrik: 'Vereinsleben', datum: '25.11.2026',
      bild: p + 'e/e/csm_Bild_1_9764b3892c.jpg', bildBreite: 1200, bildHoehe: 900 },
    { id: 3, titel: 'Neues Ehrenmitglied aus Beromünster', ort: 'Kanton Luzern', rubrik: 'Sport', datum: '25.11.2026',
      bild: p + 'a/f/csm_KathrinBecker_6338_1f1a52f9f1.jpg', bildBreite: 721, bildHoehe: 554 },
    { id: 4, titel: 'Einstimmigkeit an der Kirchgemeindeversammlung', ort: 'Beromünster', rubrik: 'Religion', datum: '25.11.2026',
      bild: b + 'user_upload/News-Artikel/2026/KW48/Einstimmigkeit_an_der_Kirchgemeindeversammlung/Budgetversammlung2026.jpg', bildBreite: 810, bildHoehe: 1080 },
    { id: 5, titel: 'Unangemeldete Brandschutzkontrollen', ort: 'Kanton Luzern', rubrik: 'Blaulicht', datum: '25.11.2026',
      bild: p + '8/7/csm_Unangemeldete_Brandschutzkontrollen__Rettungszeichen_Feuerl%C3%B6scher_5aff5e55ae.png', bildBreite: 1200, bildHoehe: 800 },
    { id: 6, titel: 'Zauberhafte Stimmung am Räbeliechtli-Umzug', ort: 'Beromünster', rubrik: 'Vereinsleben', datum: '24.11.2026',
      bild: p + 'a/1/csm_Zauberhafte_Stimmung_am_R%C3%A4beliechtli-Umzug_R%C3%A4beliechtli_26_c4423418e9.jpeg', bildBreite: 1200, bildHoehe: 900 },
    { id: 7, titel: 'Grenzenloses Abenteuer im Europapark erlebt', ort: 'Beromünster', rubrik: 'Sport', datum: '24.11.2026',
      bild: p + '3/e/csm_9S0A8586_f128202b52.jpg', bildBreite: 1200, bildHoehe: 800 },
    { id: 8, titel: 'Erfolgreiches Pilotprojekt geht zu Ende', ort: 'Eich', rubrik: 'Aus der Gemeinde', datum: '24.11.2026',
      bild: p + '1/8/csm_20250527_095538_c2ac6fd049.jpg', bildBreite: 1200, bildHoehe: 555 },
    { id: 9, titel: 'Männerriege Rickenbach feiert Turniersieg', ort: 'Rickenbach', rubrik: 'Sport', datum: '24.11.2026',
      bild: p + '5/4/csm_01_8a140bf472.jpg', bildBreite: 1200, bildHoehe: 730 },
    { id: 10, titel: '«Eine Messerspitze Safran» mit Michelsämter Note', ort: 'Beromünster', rubrik: 'Kultur', datum: '24.11.2026',
      bild: p + 'a/f/csm_Arancini_039_8ccb1cf1a4.jpg', bildBreite: 720, bildHoehe: 600 }
  ];
  var solar = { zeit: 0, leistungKw: 86.4, tagesertragKwh: 412, gesamtMwh: 1284, beispiel: true };
  var besuche = [
    { von: 0, bis: 9e15, firma: 'Muster Verpackungen AG', name: 'Frau Anna Beispiel' },
    { von: 0, bis: 9e15, firma: 'Beispiel Handwerk GmbH', name: null }
  ];

  // Mittwoch, 25.11.2026, 09:42 Zürcher Zeit (Winterzeit, eine Stunde vor UTC)
  var d = {
    zeit: Date.UTC(2026, 10, 25, 8, 42, 0),
    zone: { versatzMin: 60, wechsel: null },
    einstellungen: { dauerAnsichtSek: 12, dauerBesuchSek: 10, solarNachArtikeln: 3, design: 1, drehung: 0, betrieb: { tage: [1, 2, 3, 4, 5, 6, 7], von: '00:00', bis: '23:59' } },
    begruessungen: [],
    news: [],
    solar: null
  };
  if (art === 'begruessung') { d.begruessungen = [besuche[0]]; }
  else if (art === 'begruessung2') { d.begruessungen = besuche; }
  else if (art === 'begruessunglang') { d.begruessungen = [{ von: 0, bis: 9e15, firma: 'Genossenschaft für nachhaltige Verpackungslösungen Zentralschweiz', name: 'Herr Dr. Maximilian von Beispielhausen' }]; }
  else if (art === 'news') { d.news = news; }
  else if (art === 'newsklein') { d.news = [news[9]]; }
  else if (art === 'newshoch') { d.news = [news[3]]; }
  else if (art === 'newsohnebild') { d.news = [{ id: 99, titel: 'Gemeindeversammlung genehmigt das Budget 2027 ohne Gegenstimme', ort: 'Beromünster', rubrik: 'Politik', datum: '25.11.2026', bild: null }]; }
  else if (art === 'solar') { d.solar = solar; }
  else if (art === 'standard') { /* nichts: ruhige Standardfolie */ }
  else { d.news = news; d.solar = solar; }
  return d;
};
