/*
  Beispieldaten für die Vorschau der Anzeige ohne Server.
  Aufruf: /anzeige/?demo=begruessung, ?demo=news, ?demo=solar, ?demo=standard oder ?demo=alles
  Zusätze: &design=1 bis 4 (Design wählen), &halt=1 (erste Ansicht stehen lassen)

  Alle Firmen und Personen sind erfunden. Die Artikel sind Beispiele von michelnews.ch
  vom 25.11.2026, die Bilder werden direkt von dort geladen.
*/
window.EMPFANG_DEMO = function (art) {
  var bild = 'https://michelnews.ch/fileadmin/_processed_/';
  var news = [
    { id: 1, titel: 'Zauberhafte Stimmung am Räbeliechtli-Umzug', ort: 'Rickenbach', rubrik: 'Vereinsleben', datum: '25.11.2026',
      bild: bild + 'a/1/csm_Zauberhafte_Stimmung_am_R%C3%A4beliechtli-Umzug_R%C3%A4beliechtli_26_c4423418e9.jpeg', bildBreite: 1200, bildHoehe: 900 },
    { id: 2, titel: 'Unangemeldete Brandschutzkontrollen', ort: 'Kanton Luzern', rubrik: 'Blaulicht', datum: '25.11.2026',
      bild: bild + '8/7/csm_Unangemeldete_Brandschutzkontrollen__Rettungszeichen_Feuerl%C3%B6scher_5aff5e55ae.png', bildBreite: 1200, bildHoehe: 800 },
    { id: 3, titel: 'Männerriege Rickenbach feiert Turniersieg', ort: 'Rickenbach', rubrik: 'Sport', datum: '24.11.2026',
      bild: bild + '5/4/csm_01_8a140bf472.jpg', bildBreite: 1200, bildHoehe: 730 },
    { id: 4, titel: '«Eine Messerspitze Safran» mit Michelsämter Note', ort: 'Beromünster', rubrik: 'Kultur', datum: '24.11.2026',
      bild: bild + 'a/f/csm_Arancini_039_8ccb1cf1a4.jpg', bildBreite: 720, bildHoehe: 600 },
    { id: 5, titel: 'Erfolgreiches Pilotprojekt geht zu Ende', ort: 'Beromünster', rubrik: 'Aus der Gemeinde', datum: '24.11.2026',
      bild: bild + '1/8/csm_20250527_095538_c2ac6fd049.jpg', bildBreite: 1200, bildHoehe: 555 }
  ];
  var solar = { zeit: 0, leistungKw: 86.4, tagesertragKwh: 412, gesamtMwh: 1284, beispiel: true };
  var besuche = [
    { von: 0, bis: 9e15, firma: 'Muster Verpackungen AG', name: 'Frau Anna Beispiel', ansprechperson: 'Alexander Fischer' },
    { von: 0, bis: 9e15, firma: 'Beispiel Handwerk GmbH', name: null, ansprechperson: 'Petra Muster' }
  ];

  // Mittwoch, 25.11.2026, 09:42 Zürcher Zeit (Winterzeit, eine Stunde vor UTC)
  var d = {
    zeit: Date.UTC(2026, 10, 25, 8, 42, 0),
    zone: { versatzMin: 60, wechsel: null },
    einstellungen: { dauerAnsichtSek: 12, dauerBesuchSek: 10, solarNachArtikeln: 3, design: 1, betrieb: { tage: [1, 2, 3, 4, 5, 6, 7], von: '00:00', bis: '23:59' } },
    begruessungen: [],
    news: [],
    solar: null
  };
  if (art === 'begruessung') { d.begruessungen = [besuche[0]]; }
  else if (art === 'begruessung2') { d.begruessungen = besuche; }
  else if (art === 'begruessunglang') { d.begruessungen = [{ von: 0, bis: 9e15, firma: 'Genossenschaft für nachhaltige Verpackungslösungen Zentralschweiz', name: 'Herr Dr. Maximilian von Beispielhausen', ansprechperson: 'Alexander Fischer' }]; }
  else if (art === 'news') { d.news = news; }
  else if (art === 'newsklein') { d.news = [news[3]]; }
  else if (art === 'newsohnebild') { d.news = [{ id: 9, titel: 'Gemeindeversammlung genehmigt das Budget 2027 ohne Gegenstimme', ort: 'Beromünster', rubrik: 'Politik', datum: '25.11.2026', bild: null }]; }
  else if (art === 'solar') { d.solar = solar; }
  else if (art === 'standard') { /* nichts: ruhige Standardfolie */ }
  else { d.news = news; d.solar = solar; }
  return d;
};
