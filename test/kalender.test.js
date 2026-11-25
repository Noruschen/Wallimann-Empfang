// Tests für den Baustein «Kalender» (src/lib/kalender.js).
// Alle Firmen, Namen und Adressen sind erfunden.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leseKalender, KalenderFehler, GRUENDE, WINDOWS_ZEITZONEN } from '../src/lib/kalender.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:W. Europe Standard Time',
  'BEGIN:STANDARD',
  'DTSTART:16010101T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:16010101T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

const WEZ = 'TZID=W. Europe Standard Time';
let zaehler = 0;

/** Baut einen VEVENT im Stil von Outlook. `ohne` entfernt Standardzeilen. */
function termin({
  uid = `040000008200E00074C5B7101A82E008${String(++zaehler).padStart(8, '0')}`,
  betreff = 'Muster Bau AG | Anna Beispiel',
  start = `DTSTART;${WEZ}:20261126T100000`,
  ende = `DTEND;${WEZ}:20261126T110000`,
  organisator = 'ORGANIZER;CN=Peter Keller:mailto:peter.keller@wallimann.ch',
  zusatz = [],
  ohne = [],
} = {}) {
  const basis = [
    'DESCRIPTION:Bitte Parkplatz reservieren. Kontakt: anna.beispiel@muster-bau.example',
    `UID:${uid}`,
    `SUMMARY;LANGUAGE=de-CH:${betreff}`,
    start,
    ende,
    'CLASS:PUBLIC',
    'LOCATION:Sitzungszimmer Pilatus',
    organisator,
    'ATTENDEE;ROLE=REQ-PARTICIPANT;CN=Empfang:mailto:empfang.wallimann@outlook.com',
  ].filter((z) => !ohne.some((o) => z.startsWith(o)));
  return ['BEGIN:VEVENT', ...basis, ...zusatz, 'END:VEVENT'];
}

function kalender(...termine) {
  return [
    'BEGIN:VCALENDAR',
    'METHOD:PUBLISH',
    'PRODID:Microsoft Exchange Server 2010',
    'VERSION:2.0',
    ...VTIMEZONE,
    ...termine.flat(),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// Standardfenster: 26.11.2026 00:00 bis 28.11.2026 00:00 Ortszeit Zürich.
const FENSTER = { von: new Date('2026-11-25T23:00:00Z'), bis: new Date('2026-11-27T23:00:00Z') };

function lies(ics, optionen = {}) {
  return leseKalender(ics, { ...FENSTER, domains: ['wallimann.ch'], ...optionen });
}

function einzig(ics, optionen) {
  const r = lies(ics, optionen);
  assert.equal(r.besuche.length, 1, `genau ein Besuch erwartet, erhalten: ${JSON.stringify(r)}`);
  return r.besuche[0];
}

function gruende(r) {
  return Object.fromEntries(r.verworfen.map((v) => [v.grund, v.anzahl]));
}

function verworfenAls(ics, grund, optionen) {
  const r = lies(ics, optionen);
  assert.equal(r.besuche.length, 0, `kein Besuch erwartet, erhalten: ${JSON.stringify(r.besuche)}`);
  assert.deepEqual(gruende(r), { [grund]: 1 });
}

function startzeiten(r) {
  return r.besuche.map((b) => b.start);
}

describe('Beispieldatei im Stil von Outlook', () => {
  test('liest Besuche, Serie mit verschobenem Einzeltermin und verwirft das Richtige', () => {
    const r = lies(fixture('kalender-outlook.ics'));
    assert.deepEqual(r.besuche, [
      {
        uid: '040000008200E00074C5B7101A82E00800000000A1B2C3D4E5F6A7B8000000000000000010000000AAAABBBBCCCCDDDDEEEEFFFF00001111',
        start: '2026-11-26T09:00:00.000Z',
        ende: '2026-11-26T10:00:00.000Z',
        firma: 'Muster Bau AG',
        name: 'Anna Beispiel',
      },
      {
        uid: '040000008200E00074C5B7101A82E00800000000SERIE0000000000000000000000001_20261126T073000Z',
        start: '2026-11-27T13:00:00.000Z',
        ende: '2026-11-27T14:00:00.000Z',
        firma: 'Beispiel Treuhand GmbH',
        name: 'Marco Test',
      },
      {
        uid: '040000008200E00074C5B7101A82E00800000000UTC0000000000000000000000001',
        start: '2026-11-27T15:00:00.000Z',
        ende: '2026-11-27T16:00:00.000Z',
        firma: 'Gamma Software AG',
        name: 'Lena Probst',
      },
    ]);
    assert.deepEqual(r.verworfen, [
      { grund: GRUENDE.GANZTAEGIG, anzahl: 1 },
      { grund: GRUENDE.ABGESAGT, anzahl: 1 },
      { grund: GRUENDE.PRIVAT, anzahl: 1 },
      { grund: GRUENDE.ORGANISATOR_FREMD, anzahl: 1 },
    ]);
  });

  test('gleiches Ergebnis mit CRLF-Zeilenenden und Tab als Faltung', () => {
    const lf = fixture('kalender-outlook.ics');
    const crlf = lf.replace(/\n/g, '\r\n').replace(/\r\n /g, '\r\n\t');
    assert.deepEqual(lies(crlf), lies(lf));
  });

  test('Rückgabe enthält keine E-Mail-Adresse, keine Beschreibung und keinen Ort', () => {
    const r = lies(fixture('kalender-outlook.ics'));
    const text = JSON.stringify(r);
    assert.doesNotMatch(text, /@/);
    assert.doesNotMatch(text, /mailto/i);
    assert.doesNotMatch(text, /Parkplatz|Rigi|outlook\.com|muster-bau/i);
    for (const b of r.besuche) {
      assert.deepEqual(Object.keys(b).sort(), ['ende', 'firma', 'name', 'start', 'uid']);
    }
    for (const v of r.verworfen) assert.deepEqual(Object.keys(v).sort(), ['anzahl', 'grund']);
    assert.doesNotMatch(JSON.stringify(r.verworfen), /Alpha|Arzttermin|Werbung|Jonas/);
  });
});

describe('Betreff bereinigen', () => {
  const firmaName = (betreff, optionen) => {
    const b = einzig(kalender(termin({ betreff })), optionen);
    return [b.firma, b.name];
  };

  test('Betreff mit Name', () => {
    assert.deepEqual(firmaName('Muster Bau AG | Anna Beispiel'), ['Muster Bau AG', 'Anna Beispiel']);
  });

  test('Betreff ohne Name oder mit leerem rechten Teil ergibt name null', () => {
    assert.deepEqual(firmaName('Muster Bau AG'), ['Muster Bau AG', null]);
    assert.deepEqual(firmaName('Muster Bau AG |  '), ['Muster Bau AG', null]);
    assert.deepEqual(firmaName('Muster Bau AG | 🎉 -'), ['Muster Bau AG', null]);
  });

  test('weitere «|» im Namen werden zu Leerzeichen', () => {
    assert.deepEqual(firmaName('Muster Bau AG | Anna | Beispiel'), ['Muster Bau AG', 'Anna Beispiel']);
  });

  test('Betreff mit Links', () => {
    assert.deepEqual(
      firmaName('Muster AG https://evil.example/x?y=1 | Anna www.boese.example/pfad Beispiel http://a.b'),
      ['Muster AG', 'Anna Beispiel'],
    );
    verworfenAls(kalender(termin({ betreff: 'HTTPS://evil.example | Anna' })), GRUENDE.FIRMA_LEER);
  });

  test('Betreff mit Sonderzeichen, Umlauten, Akzenten und Emoji', () => {
    assert.deepEqual(firmaName('Café <Façade> & Söhne AG 🎉 | José "Núñez" 😀\u0007'), [
      'Café Façade & Söhne AG',
      'José Núñez',
    ]);
    assert.deepEqual(firmaName('Müller-Bösch AG, Zürich | Zoë Brühl'), ['Müller-Bösch AG, Zürich', 'Zoë Brühl']);
    assert.deepEqual(firmaName('Łódź Ślusarz Sp. | Ærø Ørsted'), ['Łódź Ślusarz Sp', 'Ærø Ørsted']);
  });

  test('HTML-Tags: spitze Klammern und Schrägstrich verschwinden, kein Markup bleibt', () => {
    const [firma, name] = firmaName('<b>Alpha AG</b> | <script>alert(1)</script>Eva');
    assert.equal(firma, 'Alpha AG');
    assert.equal(name, 'alert1 Eva');
    assert.doesNotMatch(firma + name, /[<>/()"']/);
  });

  test('Steuerzeichen, Zeilenumbrüche, unsichtbare Zeichen und Text-Escapes', () => {
    assert.deepEqual(firmaName('Muster\\, Bau\\; AG\\nZweite\tZeile | Anna\\\\Beispiel'), [
      'Muster, Bau AG Zweite Zeile',
      'AnnaBeispiel',
    ]);
    assert.deepEqual(firmaName('Mus\u200Bter\u202E AG\u0000 | An\u00ADna'), ['Muster AG', 'Anna']);
  });

  test('gestapelte Akzente werden begrenzt', () => {
    const [firma] = firmaName('Ze\u0301\u0302\u0303\u0304\u0305bra AG');
    assert.equal(firma, 'Z\u00E9\u0302\u0303bra AG');
  });

  test('«WG: AW: Firma» und weitere Präfixe, auch mehrfach', () => {
    assert.deepEqual(firmaName('WG: AW: Muster Bau AG'), ['Muster Bau AG', null]);
    assert.deepEqual(firmaName('AW:WG: RE: Fwd: TR: FW: re: Muster Bau AG | Anna'), ['Muster Bau AG', 'Anna']);
    assert.deepEqual(firmaName('Rega AG | Trudi'), ['Rega AG', 'Trudi']);
  });

  test('Rand wird getrimmt, auch Punkt, Komma und Bindestrich', () => {
    assert.deepEqual(firmaName(' -- Muster Bau AG., | ,.Anna Beispiel - '), ['Muster Bau AG', 'Anna Beispiel']);
  });

  test('überlanger Betreff wird auf die Maximallänge gekürzt', () => {
    const lang = 'Ausserordentlich Lange Firmenbezeichnung Aktiengesellschaft Für Sehr Viele Dinge';
    const [firma, name] = firmaName(`${lang} | ${'Annemarie '.repeat(10)}`);
    assert.ok([...firma].length <= 60);
    assert.ok(lang.startsWith(firma));
    assert.ok([...name].length <= 60);
    assert.doesNotMatch(name, /^\s|\s$/);
    const [kurz, kurzName] = firmaName('Muster Bau AG | Anna Beispiel', { maxLaengeFirma: 6, maxLaengeName: 4 });
    assert.equal(kurz, 'Muster');
    assert.equal(kurzName, 'Anna');
  });

  test('E-Mail-Adresse im Betreff wird entfernt', () => {
    assert.deepEqual(firmaName('Muster AG | anna.beispiel@kunde.example'), ['Muster AG', null]);
  });

  test('leere Firma nach dem Bereinigen wird verworfen', () => {
    for (const betreff of ['🎉🎉 | Anna Beispiel', '', 'WG: ', 'https://boese.example', '<<>> | Anna']) {
      verworfenAls(kalender(termin({ betreff })), GRUENDE.FIRMA_LEER);
    }
    verworfenAls(kalender(termin({ ohne: ['SUMMARY'] })), GRUENDE.FIRMA_LEER);
  });
});

describe('Organisator', () => {
  const mit = (organisator, optionen) => lies(kalender(termin({ organisator })), optionen);

  test('der Name des Organisators (CN) wird nie weitergegeben, auch nicht in Anführungszeichen mit Komma', () => {
    const b = einzig(kalender(termin({ organisator: 'ORGANIZER;CN="Keller, Peter";SENT-BY="mailto:x@wallimann.ch":mailto:peter.keller@wallimann.ch' })));
    assert.ok(!('ansprechperson' in b));
    assert.ok(!JSON.stringify(b).includes('Keller'));
  });

  test('MAILTO in Grossbuchstaben, Domain ohne Gross-/Kleinschreibung, ohne CN', () => {
    const b = einzig(kalender(termin({ organisator: 'ORGANIZER:MAILTO:Peter.Keller@WALLIMANN.CH' })));
    assert.equal(b.firma, einzig(kalender(termin())).firma);
  });

  test('Einladung von fremder Adresse wird verworfen', () => {
    const r = mit('ORGANIZER;CN=Peter Keller:mailto:peter.keller@gmail.example');
    assert.deepEqual(gruende(r), { [GRUENDE.ORGANISATOR_FREMD]: 1 });
    assert.equal(r.besuche.length, 0);
  });

  test('Täuschungsfälle: wallimann.ch.evil.com und evilwallimann.ch', () => {
    for (const adresse of [
      'mailto:peter@wallimann.ch.evil.com',
      'mailto:x@evilwallimann.ch',
      'mailto:x@mail.wallimann.ch',
      'mailto:x@wallimann.ch.',
      'mailto:x@wallimann.ch@evil.com',
      'mailto:wallimann.ch',
      'mailto:x@wallimann.ch?cc=y',
      'mailto:"x@wallimann.ch"@evil.com',
      'mailto:x@wаllimann.ch', // kyrillisches а
      'evil.com',
    ]) {
      const r = mit(`ORGANIZER;CN=Peter Keller:${adresse}`);
      assert.equal(r.besuche.length, 0, adresse);
      assert.deepEqual(gruende(r), { [GRUENDE.ORGANISATOR_FREMD]: 1 }, adresse);
    }
  });

  test('mehrere erlaubte Domains', () => {
    const r = mit('ORGANIZER:mailto:a@wallimann-druck.ch', { domains: ['wallimann.ch', 'Wallimann-Druck.ch'] });
    assert.equal(r.besuche.length, 1);
  });

  test('fehlender Organisator', () => {
    verworfenAls(kalender(termin({ ohne: ['ORGANIZER'] })), GRUENDE.ORGANISATOR_FEHLT);
    verworfenAls(kalender(termin({ organisator: 'ORGANIZER;CN=Peter Keller:' })), GRUENDE.ORGANISATOR_FEHLT);
  });

  test('ohne Organisatorpflicht wird ein Termin ohne Organisator gezeigt, fremde Domain bleibt verboten', () => {
    const b = einzig(kalender(termin({ ohne: ['ORGANIZER'] })), { organisatorPflicht: false });
    assert.ok(b.firma);
    const r = mit('ORGANIZER:mailto:a@evil.example', { organisatorPflicht: false });
    assert.deepEqual(gruende(r), { [GRUENDE.ORGANISATOR_FREMD]: 1 });
  });
});

describe('Nicht anzeigen', () => {
  test('abgesagt über STATUS', () => {
    verworfenAls(kalender(termin({ zusatz: ['STATUS:CANCELLED'] })), GRUENDE.ABGESAGT);
  });

  test('abgesagt über Betreff, ohne Gross-/Kleinschreibung', () => {
    for (const betreff of [
      'Abgesagt: Muster Bau AG | Anna',
      'ABGESAGT:Muster Bau AG',
      'Canceled: Muster Bau AG',
      'cancelled: Muster Bau AG',
      'Annulé : Muster Bau AG',
      'ANNULÉ: Muster Bau AG',
      'WG: Abgesagt: Muster Bau AG',
      'Storniert: Muster Bau AG',
      'Annulliert: Muster Bau AG',
      'Annullato: Muster Bau AG',
    ]) {
      verworfenAls(kalender(termin({ betreff })), GRUENDE.ABGESAGT);
    }
  });

  test('ein Firmenname, der wie eine Absage beginnt, bleibt ein Besuch', () => {
    const b = einzig(kalender(termin({ betreff: 'Abgesagt GmbH | Anna Beispiel' })));
    assert.equal(b.firma, 'Abgesagt GmbH');
  });

  test('privat und vertraulich', () => {
    verworfenAls(kalender(termin({ zusatz: ['CLASS:PRIVATE'], ohne: ['CLASS'] })), GRUENDE.PRIVAT);
    verworfenAls(kalender(termin({ zusatz: ['CLASS:CONFIDENTIAL'], ohne: ['CLASS'] })), GRUENDE.PRIVAT);
  });

  test('Platzhalter für private Termine kommen nie auf den Bildschirm', () => {
    for (const betreff of ['Privater Termin', 'Private Appointment', 'PRIVAT']) {
      verworfenAls(kalender(termin({ betreff })), GRUENDE.PRIVAT);
    }
    // Eine Firma, die das Wort nur enthält, bleibt ein Besuch
    assert.equal(einzig(kalender(termin({ betreff: 'Privatbank Muster AG' }))).firma, 'Privatbank Muster AG');
  });

  test('ganztägig über VALUE=DATE', () => {
    verworfenAls(
      kalender(termin({ start: 'DTSTART;VALUE=DATE:20261126', ende: 'DTEND;VALUE=DATE:20261127' })),
      GRUENDE.GANZTAEGIG,
    );
  });

  test('ganztägig über X-MICROSOFT-CDO-ALLDAYEVENT', () => {
    verworfenAls(
      kalender(
        termin({
          start: `DTSTART;${WEZ}:20261126T000000`,
          ende: `DTEND;${WEZ}:20261127T000000`,
          zusatz: ['X-MICROSOFT-CDO-ALLDAYEVENT:TRUE'],
        }),
      ),
      GRUENDE.GANZTAEGIG,
    );
  });

  test('Termine ausserhalb des Fensters fehlen und werden nicht gezählt', () => {
    const r = lies(
      kalender(
        termin({ start: `DTSTART;${WEZ}:20261125T235959`, ende: `DTEND;${WEZ}:20261126T010000` }),
        termin({ start: `DTSTART;${WEZ}:20261126T000000`, ende: `DTEND;${WEZ}:20261126T010000` }),
        termin({ start: `DTSTART;${WEZ}:20261127T235900`, ende: `DTEND;${WEZ}:20261128T000000` }),
        termin({ start: `DTSTART;${WEZ}:20261128T000000`, ende: `DTEND;${WEZ}:20261128T010000` }),
        termin({ start: `DTSTART;${WEZ}:20261201T100000`, zusatz: ['CLASS:PRIVATE'], ohne: ['CLASS'] }),
      ),
    );
    assert.deepEqual(startzeiten(r), ['2026-11-25T23:00:00.000Z', '2026-11-27T22:59:00.000Z']);
    assert.deepEqual(r.verworfen, []);
  });

  test('Besuche sind nach Start sortiert', () => {
    const r = lies(
      kalender(
        termin({ start: `DTSTART;${WEZ}:20261127T150000`, betreff: 'C AG' }),
        termin({ start: `DTSTART;${WEZ}:20261126T080000`, betreff: 'A AG' }),
        termin({ start: 'DTSTART:20261126T090000Z', betreff: 'B AG' }),
      ),
    );
    assert.deepEqual(r.besuche.map((b) => b.firma), ['A AG', 'B AG', 'C AG']);
  });
});

describe('Zeiten und Zeitzonen', () => {
  const start = (zeile, ende = '') => einzig(kalender(termin({ start: zeile, ende: ende || 'X-LEER:1' })));

  test('UTC-Zeit', () => {
    const b = start('DTSTART:20261126T090000Z', 'DTEND:20261126T093000Z');
    assert.equal(b.start, '2026-11-26T09:00:00.000Z');
    assert.equal(b.ende, '2026-11-26T09:30:00.000Z');
  });

  test('IANA-Zeitzone, auch in Anführungszeichen', () => {
    assert.equal(start('DTSTART;TZID=Europe/Zurich:20261126T100000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID="Europe/Zurich":20261126T100000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=America/New_York:20261126T040000').start, '2026-11-26T09:00:00.000Z');
  });

  test('Windows-Zeitzonenname', () => {
    assert.equal(start(`DTSTART;${WEZ}:20261126T100000`).start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID="W. Europe Standard Time":20261126T100000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=w. europe standard time:20261126T100000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=Eastern Standard Time:20261126T040000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=Tokyo Standard Time:20261126T180000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=GMT Standard Time:20261126T090000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=India Standard Time:20261126T143000').start, '2026-11-26T09:00:00.000Z');
  });

  test('Windows-Zeitzone im Sommer', () => {
    const r = leseKalender(kalender(termin({ start: `DTSTART;${WEZ}:20260715T100000`, ende: 'X:1' })), {
      von: new Date('2026-07-15T00:00:00Z'),
      bis: new Date('2026-07-16T00:00:00Z'),
    });
    assert.deepEqual(startzeiten(r), ['2026-07-15T08:00:00.000Z']);
  });

  test('alle Windows-Zeitzonen der Tabelle sind gültige IANA-Zonen', () => {
    const pflicht = [
      'W. Europe', 'Central Europe', 'Central European', 'Romance', 'GMT', 'Greenwich', 'E. Europe', 'FLE', 'GTB',
      'Turkey', 'Russian', 'Eastern', 'Central', 'Mountain', 'Pacific', 'India', 'China', 'Tokyo', 'AUS Eastern',
      'Arabian', 'Israel', 'South Africa', 'E. South America', 'Singapore',
    ].map((n) => `${n} Standard Time`.toLowerCase());
    for (const n of [...pflicht, 'utc']) assert.ok(WINDOWS_ZEITZONEN[n], n);
    for (const [name, iana] of Object.entries(WINDOWS_ZEITZONEN)) {
      assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: iana }), name);
    }
  });

  test('Zeit ohne Zeitzone und unbekannte Zeitzone werden als Europe/Zurich gelesen', () => {
    assert.equal(start('DTSTART:20261126T100000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=Customized Time Zone:20261126T100000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID="(UTC+01:00) Amsterdam, Berlin, Bern":20261126T100000').start, '2026-11-26T09:00:00.000Z');
    assert.equal(start('DTSTART;TZID=/mozilla.org/20050126_1/Europe/London:20261126T090000').start, '2026-11-26T09:00:00.000Z');
  });

  test('Ende aus DURATION, fehlendes Ende ergibt Ende gleich Start', () => {
    const b = start(`DTSTART;${WEZ}:20261126T100000`, 'DURATION:PT1H30M');
    assert.equal(b.ende, '2026-11-26T10:30:00.000Z');
    const c = start(`DTSTART;${WEZ}:20261126T100000`);
    assert.equal(c.ende, c.start);
  });
});

/** Serie im Fenster `von` bis `bis` lesen und Startzeiten liefern. */
function serie(zusatz, startZeile, von, bis, weitere = []) {
  const r = leseKalender(kalender(termin({ uid: 'SERIE-1', start: startZeile, ende: 'X-LEER:1', zusatz }), ...weitere), {
    von: new Date(von),
    bis: new Date(bis),
  });
  return r;
}

describe('Serientermine', () => {
  test('wöchentliche Serie mit Einzeltermin im Fenster und eindeutiger Uid', () => {
    const r = serie(['RRULE:FREQ=WEEKLY;BYDAY=TH'], `DTSTART;${WEZ}:20260108T083000`, '2026-11-25T23:00:00Z', '2026-11-27T23:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-11-26T07:30:00.000Z']);
    assert.equal(r.besuche[0].uid, 'SERIE-1_20261126T073000Z');
  });

  test('wöchentlich mit INTERVAL, mehreren Tagen und WKST', () => {
    const r = serie(
      ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;WKST=MO'],
      `DTSTART;${WEZ}:20261102T090000`,
      '2026-11-01T00:00:00Z',
      '2026-12-01T00:00:00Z',
    );
    assert.deepEqual(startzeiten(r), [
      '2026-11-02T08:00:00.000Z', '2026-11-06T08:00:00.000Z',
      '2026-11-16T08:00:00.000Z', '2026-11-20T08:00:00.000Z',
      '2026-11-30T08:00:00.000Z',
    ]);
    // WKST=SU verschiebt die Wochen bei INTERVAL=2 und BYDAY=SU,TU (Beispiel aus RFC 5545).
    const mo = serie(['RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO'], 'DTSTART;TZID=America/New_York:19970805T090000', '1997-08-01T00:00:00Z', '1997-09-01T00:00:00Z');
    const su = serie(['RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU'], 'DTSTART;TZID=America/New_York:19970805T090000', '1997-08-01T00:00:00Z', '1997-09-01T00:00:00Z');
    assert.deepEqual(startzeiten(mo).map((s) => s.slice(0, 10)), ['1997-08-05', '1997-08-10', '1997-08-19', '1997-08-24']);
    assert.deepEqual(startzeiten(su).map((s) => s.slice(0, 10)), ['1997-08-05', '1997-08-17', '1997-08-19', '1997-08-31']);
  });

  test('Serie über die Zeitumstellung am 29.03.2026: 09:00 Ortszeit bleibt 09:00', () => {
    const r = serie(['RRULE:FREQ=WEEKLY;BYDAY=MO'], `DTSTART;${WEZ}:20260316T090000`, '2026-03-22T00:00:00Z', '2026-04-07T00:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-03-23T08:00:00.000Z', '2026-03-30T07:00:00.000Z', '2026-04-06T07:00:00.000Z']);
    const t = serie(['RRULE:FREQ=DAILY'], 'DTSTART;TZID=Europe/Zurich:20260327T090000', '2026-03-27T00:00:00Z', '2026-03-31T00:00:00Z');
    assert.deepEqual(startzeiten(t), ['2026-03-27T08:00:00.000Z', '2026-03-28T08:00:00.000Z', '2026-03-29T07:00:00.000Z', '2026-03-30T07:00:00.000Z']);
  });

  test('Serie über die Zeitumstellung am 25.10.2026: 09:00 Ortszeit bleibt 09:00', () => {
    const r = serie(['RRULE:FREQ=WEEKLY;BYDAY=MO'], `DTSTART;${WEZ}:20260119T090000`, '2026-10-18T00:00:00Z', '2026-11-03T00:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-10-19T07:00:00.000Z', '2026-10-26T08:00:00.000Z', '2026-11-02T08:00:00.000Z']);
  });

  test('Serie in UTC bleibt in UTC', () => {
    const r = serie(['RRULE:FREQ=WEEKLY;BYDAY=MO'], 'DTSTART:20260316T080000Z', '2026-03-22T00:00:00Z', '2026-04-01T00:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-03-23T08:00:00.000Z', '2026-03-30T08:00:00.000Z']);
  });

  test('Serie mit EXDATE (mehrere Werte und mehrere Zeilen, mit TZID und UTC)', () => {
    const r = serie(
      [
        'RRULE:FREQ=DAILY',
        `EXDATE;${WEZ}:20261123T100000,20261125T100000`,
        'EXDATE:20261126T090000Z',
      ],
      `DTSTART;${WEZ}:20261120T100000`,
      '2026-11-22T23:00:00Z',
      '2026-11-27T23:00:00Z',
    );
    assert.deepEqual(startzeiten(r), ['2026-11-24T09:00:00.000Z', '2026-11-27T09:00:00.000Z']);
  });

  test('verschobener Einzeltermin über RECURRENCE-ID: alter Zeitpunkt weg, neuer da', () => {
    const ersatz = termin({
      uid: 'SERIE-1',
      betreff: 'Beta Holz AG | Verena Neu',
      start: `DTSTART;${WEZ}:20261127T143000`,
      ende: `DTEND;${WEZ}:20261127T153000`,
      zusatz: [`RECURRENCE-ID;${WEZ}:20261126T100000`],
    });
    const r = serie(['RRULE:FREQ=DAILY;COUNT=30'], `DTSTART;${WEZ}:20261120T100000`, '2026-11-25T23:00:00Z', '2026-11-27T23:00:00Z', [ersatz]);
    assert.deepEqual(
      r.besuche.map((b) => [b.start, b.firma, b.name, b.uid]),
      [
        ['2026-11-27T09:00:00.000Z', 'Muster Bau AG', 'Anna Beispiel', 'SERIE-1_20261127T090000Z'],
        ['2026-11-27T13:30:00.000Z', 'Beta Holz AG', 'Verena Neu', 'SERIE-1_20261126T090000Z'],
      ],
    );
    assert.equal(new Set(r.besuche.map((b) => b.uid)).size, r.besuche.length);
  });

  test('Einzeltermin aus dem Fenster heraus verschoben fällt weg, in das Fenster hinein verschoben erscheint', () => {
    const weg = termin({ uid: 'SERIE-1', start: `DTSTART;${WEZ}:20261210T100000`, zusatz: [`RECURRENCE-ID;${WEZ}:20261126T100000`] });
    const her = termin({ uid: 'SERIE-1', start: `DTSTART;${WEZ}:20261127T080000`, zusatz: [`RECURRENCE-ID;${WEZ}:20261203T100000`] });
    const r = serie(['RRULE:FREQ=WEEKLY'], `DTSTART;${WEZ}:20261119T100000`, '2026-11-25T23:00:00Z', '2026-11-27T23:00:00Z', [weg, her]);
    assert.deepEqual(startzeiten(r), ['2026-11-27T07:00:00.000Z']);
  });

  test('abgesagter und privater Einzeltermin einer Serie: nur dieser fällt weg', () => {
    const abgesagt = termin({ uid: 'SERIE-1', zusatz: [`RECURRENCE-ID;${WEZ}:20261126T100000`, 'STATUS:CANCELLED'] });
    const privat = termin({
      uid: 'SERIE-1',
      start: `DTSTART;${WEZ}:20261127T100000`,
      zusatz: [`RECURRENCE-ID;${WEZ}:20261127T100000`, 'CLASS:PRIVATE'],
      ohne: ['CLASS'],
    });
    const r = serie(['RRULE:FREQ=DAILY'], `DTSTART;${WEZ}:20261120T100000`, '2026-11-25T23:00:00Z', '2026-11-28T23:00:00Z', [abgesagt, privat]);
    assert.deepEqual(startzeiten(r), ['2026-11-28T09:00:00.000Z']);
    assert.deepEqual(gruende(r), { [GRUENDE.ABGESAGT]: 1, [GRUENDE.PRIVAT]: 1 });
  });

  test('COUNT zählt ab dem ersten Termin, auch vor dem Fenster', () => {
    const r = serie(['RRULE:FREQ=DAILY;COUNT=7', `EXDATE;${WEZ}:20261121T100000`], `DTSTART;${WEZ}:20261120T100000`, '2026-11-25T23:00:00Z', '2026-11-27T23:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-11-26T09:00:00.000Z']);
    const w = serie(['RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=TH'], `DTSTART;${WEZ}:20261112T100000`, '2026-11-25T23:00:00Z', '2026-12-31T23:00:00Z');
    assert.deepEqual(startzeiten(w), ['2026-11-26T09:00:00.000Z']);
  });

  test('UNTIL in UTC, in Ortszeit und als Datum', () => {
    const fenster = ['2026-11-25T23:00:00Z', '2026-11-28T23:00:00Z'];
    const start = `DTSTART;${WEZ}:20261120T100000`;
    assert.deepEqual(startzeiten(serie(['RRULE:FREQ=DAILY;UNTIL=20261126T090000Z'], start, ...fenster)), ['2026-11-26T09:00:00.000Z']);
    assert.deepEqual(startzeiten(serie(['RRULE:FREQ=DAILY;UNTIL=20261126T085959Z'], start, ...fenster)), []);
    assert.deepEqual(startzeiten(serie(['RRULE:FREQ=DAILY;UNTIL=20261127T100000'], start, ...fenster)), ['2026-11-26T09:00:00.000Z', '2026-11-27T09:00:00.000Z']);
    assert.deepEqual(startzeiten(serie(['RRULE:FREQ=DAILY;UNTIL=20261127'], start, ...fenster)), ['2026-11-26T09:00:00.000Z', '2026-11-27T09:00:00.000Z']);
  });

  test('monatlich «zweiter Dienstag»', () => {
    const r = serie(['RRULE:FREQ=MONTHLY;BYDAY=2TU'], `DTSTART;${WEZ}:20260113T100000`, '2026-11-01T00:00:00Z', '2027-01-31T00:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-11-10T09:00:00.000Z', '2026-12-08T09:00:00.000Z', '2027-01-12T09:00:00.000Z']);
    // Outlook-Schreibweise mit BYSETPOS
    const s = serie(['RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2'], `DTSTART;${WEZ}:20260113T100000`, '2026-11-01T00:00:00Z', '2027-01-31T00:00:00Z');
    assert.deepEqual(startzeiten(s), startzeiten(r));
  });

  test('monatlich «letzter Freitag» und «letzter Werktag»', () => {
    const r = serie(['RRULE:FREQ=MONTHLY;BYDAY=-1FR'], `DTSTART;${WEZ}:20260130T160000`, '2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-10-30T15:00:00.000Z', '2026-11-27T15:00:00.000Z', '2026-12-25T15:00:00.000Z']);
    const w = serie(['RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'], `DTSTART;${WEZ}:20260130T160000`, '2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z');
    assert.deepEqual(startzeiten(w), ['2026-11-30T15:00:00.000Z', '2026-12-31T15:00:00.000Z']);
  });

  test('monatlich mit BYMONTHDAY, auch negativ, und Monate ohne den 31.', () => {
    const r = serie(['RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'], `DTSTART;${WEZ}:20260131T100000`, '2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z');
    assert.deepEqual(startzeiten(r).map((s) => s.slice(0, 10)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    const e = serie(['RRULE:FREQ=MONTHLY'], `DTSTART;${WEZ}:20260131T100000`, '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z');
    assert.deepEqual(startzeiten(e).map((s) => s.slice(0, 10)), ['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  test('jährlich mit BYMONTH, BYDAY und ohne', () => {
    const r = serie(['RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH'], `DTSTART;${WEZ}:20201126T100000`, '2026-01-01T00:00:00Z', '2028-01-01T00:00:00Z');
    assert.deepEqual(startzeiten(r).map((s) => s.slice(0, 10)), ['2026-11-26', '2027-11-25']);
    const j = serie(['RRULE:FREQ=YEARLY'], `DTSTART;${WEZ}:20200229T100000`, '2020-01-01T00:00:00Z', '2025-01-01T00:00:00Z');
    assert.deepEqual(startzeiten(j).map((s) => s.slice(0, 10)), ['2020-02-29', '2024-02-29']);
  });

  test('lange laufende Serie ohne Ende wird ohne Grenze gefunden', () => {
    const r = serie(['RRULE:FREQ=DAILY'], `DTSTART;${WEZ}:20100101T100000`, '2026-11-25T23:00:00Z', '2026-11-27T23:00:00Z');
    assert.deepEqual(startzeiten(r), ['2026-11-26T09:00:00.000Z', '2026-11-27T09:00:00.000Z']);
  });

  test('Schutz vor Endlosschleifen über maxWiederholungen', () => {
    const ics = kalender(termin({ start: `DTSTART;${WEZ}:20100101T100000`, zusatz: ['RRULE:FREQ=DAILY;COUNT=100000'] }));
    const r = lies(ics);
    assert.deepEqual(r.besuche, []);
    assert.deepEqual(gruende(r), { [GRUENDE.ZU_LANG]: 1 });
    const klein = lies(kalender(termin({ start: `DTSTART;${WEZ}:20261101T100000`, zusatz: ['RRULE:FREQ=DAILY;COUNT=100'] })), { maxWiederholungen: 10 });
    assert.deepEqual(gruende(klein), { [GRUENDE.ZU_LANG]: 1 });
    const nie = lies(kalender(termin({ zusatz: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=31;BYMONTH=2'] })));
    assert.deepEqual(nie, { besuche: [], verworfen: [] });
  });

  test('nicht unterstützte Regeln werden mit eigenem Grund verworfen', () => {
    for (const regel of [
      'FREQ=HOURLY',
      'FREQ=MINUTELY;INTERVAL=30',
      'FREQ=YEARLY;BYWEEKNO=20',
      'FREQ=YEARLY;BYYEARDAY=100',
      'FREQ=DAILY;BYHOUR=9,10',
      'FREQ=WEEKLY;BYDAY=2TU',
      'FREQ=YEARLY;BYDAY=20MO',
      'FREQ=WEEKLY;BYSETPOS=1;BYDAY=MO',
      'FREQ=DAILY;INTERVAL=0',
      'INTERVAL=2',
      'FREQ=DAILY;FREQ=WEEKLY',
      'FREQ=MONTHLY;BYDAY=XX',
      'kaputt',
    ]) {
      verworfenAls(kalender(termin({ zusatz: [`RRULE:${regel}`] })), GRUENDE.REGEL);
    }
  });
});

describe('Kaputte Eingaben', () => {
  test('leerer Text und fehlendes BEGIN:VCALENDAR werfen einen KalenderFehler mit deutscher Meldung', () => {
    for (const eingabe of ['', '   \r\n', 'Hallo Welt', fixture('kalender-fehlerseite.ics'), 'BEGIN:VEVENT\r\nEND:VEVENT', null, undefined, 42]) {
      assert.throws(
        () => lies(eingabe),
        (f) => f instanceof KalenderFehler && /Ungültiger Kalender/.test(f.message),
        String(eingabe).slice(0, 20),
      );
    }
    assert.throws(() => lies('<html>'), /BEGIN:VCALENDAR/);
  });

  test('fehlende oder ungültige Fensterangabe ist ein Programmierfehler mit klarer Meldung', () => {
    assert.throws(() => leseKalender(kalender(), {}), /Option «von»/);
    assert.throws(() => leseKalender(kalender(), { von: new Date(), bis: new Date('x') }), /Option «bis»/);
  });

  test('abgeschnittene Datei: vollständige Termine werden gelesen, der Rest verworfen', () => {
    const r = lies(fixture('kalender-abgeschnitten.ics'));
    assert.deepEqual(r.besuche.map((b) => b.firma), ['Muster Bau AG']);
    assert.deepEqual(gruende(r), { [GRUENDE.UNVOLLSTAENDIG]: 1 });
  });

  test('Termin ohne DTSTART oder mit ungültigem DTSTART wird verworfen, der Rest gelesen', () => {
    const r = lies(
      kalender(
        termin({ ohne: ['DTSTART'] }),
        termin({ start: 'DTSTART:morgen' }),
        termin({ start: 'DTSTART:20261131T100000' }),
        termin({ start: 'DTSTART:20261126T250000' }),
        termin({ betreff: 'Gute AG' }),
      ),
    );
    assert.deepEqual(r.besuche.map((b) => b.firma), ['Gute AG']);
    assert.deepEqual(gruende(r), { [GRUENDE.START]: 4 });
  });

  test('Unsinnzeilen, offene Anführungszeichen und verschachtelte Blöcke stürzen nicht ab', () => {
    const ics = kalender(
      ['Unsinn ohne Doppelpunkt', ';;;', ':nur Wert', 'X-A;B="offen:wert', 'END:VTODO', 'BEGIN:VTODO', 'SUMMARY:Aufgabe', 'END:VTODO'],
      termin({ zusatz: ['BEGIN:VALARM', 'SUMMARY:Falscher Betreff', 'ORGANIZER:mailto:x@evil.example', 'END:VALARM'] }),
      termin({ organisator: 'ORGANIZER;CN="Keller, Peter:mailto:p@wallimann.ch' }),
    );
    const r = lies(ics);
    assert.equal(r.besuche.length, 1);
    assert.equal(r.besuche[0].firma, 'Muster Bau AG');
    assert.deepEqual(gruende(r), { [GRUENDE.ORGANISATOR_FEHLT]: 1 });
  });

  test('jede abgeschnittene Fassung der Beispieldatei liefert Ergebnis oder KalenderFehler, nie einen Absturz', () => {
    const text = fixture('kalender-outlook.ics');
    for (let i = 0; i <= text.length; i += 7) {
      try {
        const r = lies(text.slice(0, i));
        assert.ok(Array.isArray(r.besuche) && Array.isArray(r.verworfen));
        assert.doesNotMatch(JSON.stringify(r), /@/);
      } catch (f) {
        assert.ok(f instanceof KalenderFehler, `Absturz bei Länge ${i}: ${f}`);
      }
    }
  });

  test('Uid mit E-Mail-Adresse oder Sonderzeichen wird als Prüfwert weitergegeben', () => {
    const b = einzig(kalender(termin({ uid: 'abc-123@kalender.example' })));
    assert.match(b.uid, /^uid-[0-9a-f]{8}$/);
    const c = einzig(kalender(termin({ ohne: ['UID'] })));
    assert.match(c.uid, /^[A-Za-z0-9._-]+$/);
  });

  test('doppelte UID: die höhere SEQUENCE gilt', () => {
    const r = lies(
      kalender(
        termin({ uid: 'DOPPELT', betreff: 'Alt AG', zusatz: ['SEQUENCE:1'] }),
        termin({ uid: 'DOPPELT', betreff: 'Neu AG', zusatz: ['SEQUENCE:2'] }),
      ),
    );
    assert.deepEqual(r.besuche.map((b) => b.firma), ['Neu AG']);
    assert.deepEqual(gruende(r), { [GRUENDE.DOPPELT]: 1 });
  });
});

describe('Laufzeit', () => {
  test('200 Termine, davon 20 Serien, Fenster 2 Tage, Mittel aus 50 Läufen', (t) => {
    const termine = [];
    for (let i = 0; i < 200; i++) {
      const tag = String(1 + (i % 28)).padStart(2, '0');
      const monat = String(1 + (i % 12)).padStart(2, '0');
      const zusatz = [];
      let start = `DTSTART;${WEZ}:2026${monat}${tag}T${String(8 + (i % 9)).padStart(2, '0')}0000`;
      if (i < 20) {
        start = `DTSTART;${WEZ}:20${String(15 + (i % 10)).padStart(2, '0')}0105T090000`;
        const regeln = [
          'FREQ=DAILY',
          'FREQ=WEEKLY;BYDAY=MO,WE,FR',
          'FREQ=MONTHLY;BYDAY=2TU',
          'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
          'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;COUNT=400',
        ];
        zusatz.push(`RRULE:${regeln[i % regeln.length]}`, `EXDATE;${WEZ}:20261126T090000`);
      }
      termine.push(
        termin({
          betreff: `WG: Firma ${i} AG <b>Gast</b> https://x.example | Person ${i} 🎉`,
          start,
          ende: start.replace('DTSTART', 'DTEND'),
          organisator: `ORGANIZER;CN="Muster, Person ${i}":mailto:p${i}@wallimann.ch`,
          zusatz,
        }),
      );
    }
    const ics = kalender(...termine);
    const fenster = { von: new Date('2026-11-25T23:00:00Z'), bis: new Date('2026-11-27T23:00:00Z') };
    const r = leseKalender(ics, fenster); // Aufwärmen
    assert.ok(r.besuche.length > 0);
    const laeufe = 50;
    const beginn = performance.now();
    for (let i = 0; i < laeufe; i++) leseKalender(ics, fenster);
    const mittel = (performance.now() - beginn) / laeufe;
    t.diagnostic(`Laufzeit: ${mittel.toFixed(2)} ms im Mittel (${laeufe} Läufe, ${(ics.length / 1024).toFixed(0)} KiB, ${r.besuche.length} Besuche)`);
    console.log(`# Laufzeit Kalender: ${mittel.toFixed(2)} ms im Mittel aus ${laeufe} Läufen`);
    assert.ok(mittel < 10, `zu langsam: ${mittel} ms`);
  });
});
