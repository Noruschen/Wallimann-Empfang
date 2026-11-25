import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  zuerichTeile,
  zuerichZuUtc,
  STANDARD_EINSTELLUNGEN,
  begruessungAktiv,
  aktiveBesuche,
  inBetriebszeit,
  anzeigeModus,
  istAbgelaufen,
  formatDatum,
  formatZeit,
  wochentagName,
} from '../src/lib/zeit.js';

const iso = (d) => d.toISOString();

// Termin am Mittwoch, 11.11.2026, 14:30 Zürcher Zeit (Winterzeit, UTC+1) = 13:30 UTC
const START = '2026-11-11T13:30:00Z';
const vorher = (min, sek = 0) => new Date(Date.parse(START) - (min * 60 + sek) * 1000);
const nachher = (min, sek = 0) => new Date(Date.parse(START) + (min * 60 + sek) * 1000);

test('zuerichTeile: Winterzeit und Sommerzeit', () => {
  assert.deepEqual(zuerichTeile('2026-11-11T13:30:00Z'), {
    jahr: 2026, monat: 11, tag: 11, stunde: 14, minute: 30, sekunde: 0, wochentag: 3,
  });
  assert.deepEqual(zuerichTeile(new Date('2026-07-15T12:05:09Z')), {
    jahr: 2026, monat: 7, tag: 15, stunde: 14, minute: 5, sekunde: 9, wochentag: 3,
  });
});

test('zuerichTeile: Wochentag 1 = Montag bis 7 = Sonntag', () => {
  assert.equal(zuerichTeile('2026-11-09T12:00:00Z').wochentag, 1);
  assert.equal(zuerichTeile('2026-11-14T12:00:00Z').wochentag, 6);
  assert.equal(zuerichTeile('2026-11-15T12:00:00Z').wochentag, 7);
});

test('zuerichTeile: Mitternacht ist Stunde 0, nicht 24', () => {
  const t = zuerichTeile('2026-11-11T23:00:00Z');
  assert.equal(t.stunde, 0);
  assert.equal(t.tag, 12);
});

test('Begrüssung: 31 Minuten vorher nein', () => {
  assert.equal(begruessungAktiv({ start: START }, vorher(31)), false);
});

test('Begrüssung: 30 Minuten vorher ja (Beginn einschliesslich)', () => {
  assert.equal(begruessungAktiv({ start: START }, vorher(30)), true);
});

test('Begrüssung: 29 Minuten vorher ja', () => {
  assert.equal(begruessungAktiv({ start: START }, vorher(29)), true);
});

test('Begrüssung: 14 Minuten 59 Sekunden nach Beginn ja', () => {
  assert.equal(begruessungAktiv({ start: START }, nachher(14, 59)), true);
});

test('Begrüssung: genau 15 Minuten nach Beginn nein (Ende ausschliesslich)', () => {
  assert.equal(begruessungAktiv({ start: START }, nachher(15)), false);
});

test('Begrüssung: Start als Date-Objekt und als ISO-String gleichwertig', () => {
  assert.equal(begruessungAktiv({ start: new Date(START) }, vorher(30)), true);
  assert.equal(begruessungAktiv({ start: START }, vorher(30).toISOString()), true);
});

test('Begrüssung: eigene Werte für vorlaufMin und nachlaufMin', () => {
  const e = { vorlaufMin: 10, nachlaufMin: 5 };
  const b = { start: START };
  assert.equal(begruessungAktiv(b, vorher(11), e), false);
  assert.equal(begruessungAktiv(b, vorher(10), e), true);
  assert.equal(begruessungAktiv(b, nachher(4, 59), e), true);
  assert.equal(begruessungAktiv(b, nachher(5), e), false);
  // Mit den Standardwerten wäre 20 Minuten nachher ebenfalls nein, 12 Minuten vorher ja
  assert.equal(begruessungAktiv(b, vorher(12)), true);
  assert.equal(begruessungAktiv(b, vorher(12), e), false);
});

test('Begrüssung: eigene Werte mit grösserem Fenster', () => {
  const e = { vorlaufMin: 60, nachlaufMin: 45 };
  assert.equal(begruessungAktiv({ start: START }, vorher(60), e), true);
  assert.equal(begruessungAktiv({ start: START }, vorher(61), e), false);
  assert.equal(begruessungAktiv({ start: START }, nachher(44, 59), e), true);
  assert.equal(begruessungAktiv({ start: START }, nachher(45), e), false);
});

test('Standardeinstellungen haben die vorgegebenen Werte', () => {
  assert.deepEqual(STANDARD_EINSTELLUNGEN, {
    vorlaufMin: 30,
    nachlaufMin: 15,
    betriebszeiten: { tage: [1, 2, 3, 4, 5], von: '06:30', bis: '18:00' },
  });
});

test('aktiveBesuche: zwei Besuche gleichzeitig, sortiert nach Firma bei gleichem Start', () => {
  const besuche = [
    { firma: 'Zeta AG', start: START },
    { firma: 'Alpha GmbH', start: START },
    { firma: 'Spät AG', start: '2026-11-11T20:00:00Z' },
  ];
  const aktiv = aktiveBesuche(besuche, vorher(10));
  assert.deepEqual(aktiv.map((b) => b.firma), ['Alpha GmbH', 'Zeta AG']);
});

test('aktiveBesuche: sortiert nach Start vor Firma', () => {
  const besuche = [
    { firma: 'Alpha GmbH', start: '2026-11-11T13:40:00Z' },
    { firma: 'Zeta AG', start: START },
  ];
  const aktiv = aktiveBesuche(besuche, vorher(5));
  assert.deepEqual(aktiv.map((b) => b.firma), ['Zeta AG', 'Alpha GmbH']);
});

test('aktiveBesuche: leere Liste, wenn keiner aktiv', () => {
  assert.deepEqual(aktiveBesuche([{ firma: 'X', start: START }], vorher(40)), []);
});

test('Zeitumstellung Frühling 2026: 08:00 Zürcher Zeit am 28.03., 29.03. und 30.03.', () => {
  assert.equal(iso(zuerichZuUtc(2026, 3, 28, 8, 0)), '2026-03-28T07:00:00.000Z'); // Winterzeit
  assert.equal(iso(zuerichZuUtc(2026, 3, 29, 8, 0)), '2026-03-29T06:00:00.000Z'); // Sommerzeit
  assert.equal(iso(zuerichZuUtc(2026, 3, 30, 8, 0)), '2026-03-30T06:00:00.000Z');
});

test('Zeitumstellung Herbst 2026: 08:00 Zürcher Zeit am 24.10., 25.10. und 26.10.', () => {
  assert.equal(iso(zuerichZuUtc(2026, 10, 24, 8, 0)), '2026-10-24T06:00:00.000Z'); // Sommerzeit
  assert.equal(iso(zuerichZuUtc(2026, 10, 25, 8, 0)), '2026-10-25T07:00:00.000Z'); // Winterzeit
  assert.equal(iso(zuerichZuUtc(2026, 10, 26, 8, 0)), '2026-10-26T07:00:00.000Z');
});

test('Zeitumstellung Frühling: nicht existierende Zeit 02:30 wird nach vorne geschoben', () => {
  const d = zuerichZuUtc(2026, 3, 29, 2, 30);
  assert.equal(iso(d), '2026-03-29T01:30:00.000Z');
  const t = zuerichTeile(d);
  assert.equal(t.stunde, 3);
  assert.equal(t.minute, 30);
  // Die Zeit liegt nicht vor der Lücke
  assert.ok(d.getTime() > zuerichZuUtc(2026, 3, 29, 1, 59).getTime());
});

test('Zeitumstellung Herbst: doppelte Zeit 02:30 nimmt das erste Vorkommen', () => {
  const d = zuerichZuUtc(2026, 10, 25, 2, 30);
  assert.equal(iso(d), '2026-10-25T00:30:00.000Z'); // 02:30 Sommerzeit
  assert.equal(zuerichTeile(d).stunde, 2);
});

test('Rundreise zuerichTeile(zuerichZuUtc(...)) an normalen Tagen und an den Umstellungstagen', () => {
  const faelle = [
    [2026, 11, 11, 14, 30],
    [2026, 7, 15, 0, 0],
    [2026, 3, 29, 1, 59],
    [2026, 3, 29, 3, 0],
    [2026, 3, 29, 8, 0],
    [2026, 10, 25, 1, 59],
    [2026, 10, 25, 2, 30], // doppelt: erstes Vorkommen
    [2026, 10, 25, 3, 0],
    [2026, 10, 25, 8, 0],
  ];
  for (const [j, m, t, h, mi] of faelle) {
    const teile = zuerichTeile(zuerichZuUtc(j, m, t, h, mi));
    assert.deepEqual(
      [teile.jahr, teile.monat, teile.tag, teile.stunde, teile.minute, teile.sekunde],
      [j, m, t, h, mi, 0],
      `Rundreise für ${j}-${m}-${t} ${h}:${mi}`,
    );
  }
});

test('Rundreise in der Lücke: 02:30 kommt als 03:30 zurück', () => {
  const t = zuerichTeile(zuerichZuUtc(2026, 3, 29, 2, 30));
  assert.deepEqual([t.tag, t.stunde, t.minute], [29, 3, 30]);
});

test('Begrüssung an der Zeitumstellung: Termin 08:00 am 29.03.2026 beginnt 07:30 Zürcher Zeit', () => {
  const b = { start: zuerichZuUtc(2026, 3, 29, 8, 0) };
  assert.equal(begruessungAktiv(b, zuerichZuUtc(2026, 3, 29, 7, 29)), false);
  assert.equal(begruessungAktiv(b, zuerichZuUtc(2026, 3, 29, 7, 30)), true);
});

test('Betriebszeit: Freitag 06:29 nein, 06:30 ja, 17:59 ja, 18:00 nein (Winterzeit)', () => {
  // Freitag, 13.11.2026
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 13, 6, 29)), false);
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 13, 6, 30)), true);
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 13, 17, 59)), true);
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 13, 18, 0)), false);
});

test('Betriebszeit: gleiche Grenzen in der Sommerzeit (Freitag, 17.07.2026)', () => {
  assert.equal(inBetriebszeit('2026-07-17T04:29:00Z'), false); // 06:29
  assert.equal(inBetriebszeit('2026-07-17T04:30:00Z'), true); // 06:30
  assert.equal(inBetriebszeit('2026-07-17T15:59:00Z'), true); // 17:59
  assert.equal(inBetriebszeit('2026-07-17T16:00:00Z'), false); // 18:00
});

test('Betriebszeit: Samstag und Sonntag nein', () => {
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 14, 10, 0)), false); // Samstag
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 15, 10, 0)), false); // Sonntag
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 16, 10, 0)), true); // Montag
});

test('Betriebszeit: eigene Einstellungen mit Samstag', () => {
  const e = { betriebszeiten: { tage: [6], von: '08:00', bis: '12:00' } };
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 14, 10, 0), e), true);
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 13, 10, 0), e), false);
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 14, 12, 0), e), false);
});

test('Betriebszeit richtet sich nach Zürcher Ortszeit, nicht nach UTC', () => {
  // Freitag 06:30 Zürcher Zeit ist noch Freitag 05:30 UTC; Samstag 00:30 Zürcher Zeit ist Freitag 23:30 UTC
  assert.equal(inBetriebszeit('2026-11-13T05:30:00Z'), true);
  assert.equal(inBetriebszeit('2026-11-13T23:30:00Z'), false);
});

test('Anzeigemodus: Inhalt innerhalb der Betriebszeit ohne Besuch', () => {
  assert.equal(anzeigeModus([], zuerichZuUtc(2026, 11, 11, 10, 0)), 'inhalt');
});

test('Anzeigemodus: schwarz ausserhalb der Betriebszeit ohne Besuch', () => {
  assert.equal(anzeigeModus([], zuerichZuUtc(2026, 11, 11, 20, 0)), 'schwarz');
  assert.equal(anzeigeModus([], zuerichZuUtc(2026, 11, 14, 10, 0)), 'schwarz');
});

test('Anzeigemodus: Begrüssung hat Vorrang, auch ausserhalb der Betriebszeit', () => {
  // Samstag, 14.11.2026, 09:00 Termin, Jetzt 08:45
  const besuche = [{ firma: 'Muster AG', start: zuerichZuUtc(2026, 11, 14, 9, 0) }];
  assert.equal(inBetriebszeit(zuerichZuUtc(2026, 11, 14, 8, 45)), false);
  assert.equal(anzeigeModus(besuche, zuerichZuUtc(2026, 11, 14, 8, 45)), 'begruessung');
  // Termin um 06:45: Fenster beginnt vor der Betriebszeit
  const frueh = [{ firma: 'Früh AG', start: zuerichZuUtc(2026, 11, 13, 6, 45) }];
  assert.equal(anzeigeModus(frueh, zuerichZuUtc(2026, 11, 13, 6, 20)), 'begruessung');
});

test('Anzeigemodus: nach dem Fenster zurück zu Inhalt', () => {
  const besuche = [{ firma: 'Muster AG', start: START }];
  assert.equal(anzeigeModus(besuche, nachher(15)), 'inhalt');
});

test('istAbgelaufen Winter: kurz vor und kurz nach Mitternacht Zürcher Zeit', () => {
  const b = { start: '2026-11-11T13:30:00Z' }; // 11.11.2026, 14:30
  assert.equal(istAbgelaufen(b, '2026-11-11T22:59:59Z'), false); // 23:59:59 am 11.11.
  assert.equal(istAbgelaufen(b, '2026-11-11T23:00:00Z'), true); // 00:00:00 am 12.11.
  assert.equal(istAbgelaufen(b, '2026-11-11T23:00:01Z'), true);
});

test('istAbgelaufen Sommer: kurz vor und kurz nach Mitternacht Zürcher Zeit', () => {
  const b = { start: '2026-07-15T12:30:00Z' }; // 15.07.2026, 14:30
  assert.equal(istAbgelaufen(b, '2026-07-15T21:59:59Z'), false); // 23:59:59 am 15.07.
  assert.equal(istAbgelaufen(b, '2026-07-15T22:00:00Z'), true); // 00:00:00 am 16.07.
});

test('istAbgelaufen: Termin am selben Tag oder später ist nicht abgelaufen', () => {
  const b = { start: new Date('2026-11-11T05:30:00Z') }; // 06:30 am 11.11.
  assert.equal(istAbgelaufen(b, '2026-11-11T20:00:00Z'), false);
  assert.equal(istAbgelaufen({ start: '2026-11-20T10:00:00Z' }, '2026-11-11T10:00:00Z'), false);
});

test('istAbgelaufen: Jahreswechsel', () => {
  const b = { start: '2026-12-31T10:00:00Z' };
  assert.equal(istAbgelaufen(b, '2026-12-31T22:59:59Z'), false);
  assert.equal(istAbgelaufen(b, '2026-12-31T23:00:00Z'), true);
});

test('Formatierung: Datum, Zeit und Wochentag in Zürcher Zeit', () => {
  const d = '2026-11-11T13:30:00Z';
  assert.equal(formatDatum(d), '11.11.2026');
  assert.equal(formatZeit(d), '14:30');
  assert.equal(wochentagName(d), 'Mittwoch');
});

test('Formatierung: führende Nullen und Tageswechsel durch Zeitzone', () => {
  assert.equal(formatDatum(new Date('2026-03-05T08:05:00Z')), '05.03.2026');
  assert.equal(formatZeit(new Date('2026-03-05T08:05:00Z')), '09:05');
  // 23:30 UTC am Samstag ist in Zürich bereits Sonntag, 00:30
  assert.equal(formatDatum('2026-11-14T23:30:00Z'), '15.11.2026');
  assert.equal(formatZeit('2026-11-14T23:30:00Z'), '00:30');
  assert.equal(wochentagName('2026-11-14T23:30:00Z'), 'Sonntag');
});

test('Formatierung: alle Wochentagsnamen', () => {
  const erwartet = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  erwartet.forEach((name, i) => {
    assert.equal(wochentagName(zuerichZuUtc(2026, 11, 9 + i, 12, 0)), name);
  });
});

test('Ungültiger Zeitpunkt wirft einen Fehler', () => {
  assert.throws(() => zuerichTeile('kein Datum'), RangeError);
});
