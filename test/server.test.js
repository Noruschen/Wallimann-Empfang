// Tests für den Server: Schutz, Kalender-Ablauf, News, Solar, Ausfälle.
// Sie laufen gegen eine echte lokale Datenbank (D1) und einen echten lokalen Bildspeicher (KV),
// wie sie das Werkzeug wrangler bereitstellt. Ins Internet geht dabei nichts:
// Alle Abrufe (Kalender, michelnews.ch) sind durch Attrappen ersetzt.

import { test, describe, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';

import worker from '../src/worker.js';
import { taktgeber, alarmeVerarbeiten, pruefeAlarme, bildSchritt } from '../src/aufgaben.js';
import { pruefeEinstellungen } from '../src/einstellungen.js';
import { zoneInfo } from '../src/antwort.js';
import * as speicher from '../src/speicher.js';

const SCHLUESSEL = 'test-schluessel-mit-genug-zeichen';
const PASSWORT = 'test-passwort-lang';
const SOLAR = 'test-solar-schluessel-lang-genug';
const BASIS = 'https://empfang.test';

// Mittwoch, 25.11.2026, 09:00 Zürcher Zeit (Winterzeit)
const START = Date.UTC(2026, 10, 25, 8, 0, 0);
const MIN = 60000;

const STARTSEITE = readFileSync(new URL('./fixtures/michelnews-startseite.html', import.meta.url), 'utf8');
const ARTIKEL = readFileSync(new URL('./fixtures/michelnews-artikel.html', import.meta.url), 'utf8');

let plattform;
let env;
let wartend = [];
const ctx = { waitUntil: (p) => wartend.push(p) };

function setzeZeit(ms) { mock.timers.setTime(ms); }
function jetzt() { return Date.now(); }

async function rufe(pfad, { methode = 'GET', kopf = {}, daten, umgebung } = {}) {
  const antwort = await worker.fetch(new Request(BASIS + pfad, {
    method: methode,
    headers: { ...(daten ? { 'Content-Type': 'application/json' } : {}), ...kopf },
    body: daten ? JSON.stringify(daten) : undefined,
  }), umgebung || env, ctx);
  await Promise.all(wartend.splice(0));
  let inhalt = null;
  const typ = antwort.headers.get('content-type') || '';
  if (typ.includes('json')) inhalt = await antwort.json();
  return { status: antwort.status, inhalt, antwort };
}

const anzeige = (umgebung) => rufe('/api/anzeige', { kopf: { 'X-Anzeige-Schluessel': SCHLUESSEL }, umgebung });

async function anmelden(passwort, ip = '203.0.113.10', umgebung) {
  return rufe('/api/status/anmelden', { methode: 'POST', kopf: { 'CF-Connecting-IP': ip }, daten: { passwort }, umgebung });
}

async function sitzung(ip) {
  const r = await anmelden(PASSWORT, ip);
  assert.equal(r.status, 200);
  return r.antwort.headers.get('set-cookie').split(';')[0];
}

async function setzeEinstellungen(werte) {
  await speicher.setzeZustand(env.DB, { einstellungen: pruefeEinstellungen(werte) });
}

async function wirksam() {
  return pruefeEinstellungen((await speicher.ladeZustand(env.DB)).einstellungen);
}

function icsZeit(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function ics(termine) {
  const zeilen = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN'];
  for (const t of termine) {
    zeilen.push('BEGIN:VEVENT', `UID:${t.uid}`, `DTSTART:${icsZeit(t.start)}`, `DTEND:${icsZeit(t.start + 60 * MIN)}`,
      `SUMMARY:${t.betreff}`, `ORGANIZER;CN=${t.cn || 'Petra Muster'}:mailto:${t.von || 'petra.muster@wallimann.ch'}`);
    if (t.zusatz) zeilen.push(t.zusatz);
    zeilen.push('END:VEVENT');
  }
  zeilen.push('END:VCALENDAR');
  return zeilen.join('\r\n');
}

// Attrappe für Abrufe ins Internet: liefert je Adresse eine vorbereitete Antwort
function attrappe(antworten) {
  const aufrufe = [];
  const abruf = async (url) => {
    aufrufe.push(String(url));
    for (const [muster, wert] of antworten) {
      if (String(url).includes(muster)) {
        const w = typeof wert === 'function' ? wert() : wert;
        if (w instanceof Response) return w.clone();
        return new Response(w, { status: 200 });
      }
    }
    return new Response('nicht gefunden', { status: 404 });
  };
  abruf.aufrufe = aufrufe;
  return abruf;
}

const takt = async (abruf) => taktgeber(env, await wirksam(), jetzt(), { abruf, warte: async () => {} });

before(async () => {
  plattform = await getPlatformProxy({ persist: { path: mkdtempSync(join(tmpdir(), 'empfang-test-')) } });
  env = { ...plattform.env, ANZEIGE_SCHLUESSEL: SCHLUESSEL, STATUS_PASSWORT: PASSWORT, SOLAR_SCHLUESSEL: SOLAR, KALENDER_URL: 'https://kalender.invalid/geheim.ics' };
  env.ASSETS = { fetch: async () => new Response('Datei', { status: 200 }) };
  await speicher.stelleTabellenSicher(env.DB);
  mock.timers.enable({ apis: ['Date'], now: START });
});

after(async () => {
  mock.timers.reset();
  await plattform.dispose();
});

beforeEach(async () => {
  setzeZeit(START);
  await env.DB.batch(['besuche', 'news', 'zustand', 'versuche'].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});

// ---------------------------------------------------------------------------

describe('Schutz der Anzeige', () => {
  test('ohne geheimen Schlüssel kommen keine Daten', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    await takt(attrappe([['kalender.invalid', ics([{ uid: 'a', start: START + 10 * MIN, betreff: 'Muster AG | Anna Beispiel' }])]]));
    const r = await rufe('/api/anzeige');
    assert.equal(r.status, 401);
    assert.deepEqual(Object.keys(r.inhalt).sort(), ['fehler', 'ok']);
    assert.ok(!JSON.stringify(r.inhalt).includes('Muster'));
  });

  test('falscher Schlüssel wird abgelehnt, auch als Teil der Adresse', async () => {
    assert.equal((await rufe('/api/anzeige', { kopf: { 'X-Anzeige-Schluessel': SCHLUESSEL + 'x' } })).status, 401);
    assert.equal((await rufe('/api/anzeige?k=' + SCHLUESSEL)).status, 401);
  });

  test('ein zu kurzer oder fehlender Schlüssel in den Einstellungen öffnet nichts', async () => {
    for (const wert of [undefined, '', 'kurz']) {
      const r = await rufe('/api/anzeige', { kopf: { 'X-Anzeige-Schluessel': wert || '' }, umgebung: { ...env, ANZEIGE_SCHLUESSEL: wert } });
      assert.equal(r.status, 401);
    }
  });

  test('mit richtigem Schlüssel kommt die Antwort, bei leerer Datenbank ohne Fehler', async () => {
    const r = await anzeige();
    assert.equal(r.status, 200);
    assert.equal(r.inhalt.ok, true);
    assert.deepEqual(r.inhalt.begruessungen, []);
    assert.deepEqual(r.inhalt.news, []);
    assert.equal(r.inhalt.solar, null);
    assert.equal(r.inhalt.zeit, START);
    assert.equal(r.inhalt.zone.versatzMin, 60);
    assert.equal(r.antwort.headers.get('cache-control'), 'no-store');
    assert.match(r.antwort.headers.get('x-robots-tag'), /noindex/);
  });

  test('unbekannte Adressen unter /api/ geben nichts heraus', async () => {
    assert.equal((await rufe('/api/besuche')).status, 404);
    assert.equal((await rufe('/api/status/besuche')).status, 401);
  });
});

describe('Schutz der Statusseite', () => {
  test('ohne Anmeldung bleibt die Statusseite zu', async () => {
    assert.equal((await rufe('/api/status')).status, 401);
    assert.equal((await rufe('/api/status/einstellungen', { methode: 'POST', daten: { begruessungAn: true } })).status, 401);
    assert.equal((await rufe('/api/status/kalender-jetzt', { methode: 'POST', daten: {} })).status, 401);
    assert.equal((await wirksam()).begruessungAn, false);
  });

  test('mit Passwort kommt der Status, ein gefälschtes Sitzungszeichen wird abgelehnt', async () => {
    const cookie = await sitzung();
    const r = await rufe('/api/status', { kopf: { Cookie: cookie } });
    assert.equal(r.status, 200);
    assert.equal(r.inhalt.besucheHeute, 0);
    const gefaelscht = cookie.replace(/.$/, (z) => (z === 'a' ? 'b' : 'a'));
    assert.equal((await rufe('/api/status', { kopf: { Cookie: gefaelscht } })).status, 401);
    assert.equal((await rufe('/api/status', { kopf: { Cookie: 'empfang_sitzung=9999999999999.abc' } })).status, 401);
  });

  test('die Anmeldung läuft nach 12 Stunden ab', async () => {
    const cookie = await sitzung();
    setzeZeit(START + 12 * 60 * MIN + 1000);
    assert.equal((await rufe('/api/status', { kopf: { Cookie: cookie } })).status, 401);
  });

  test('nach einem Passwortwechsel sind alte Anmeldungen ungültig', async () => {
    const cookie = await sitzung();
    const neu = { ...env, STATUS_PASSWORT: 'ein-ganz-neues-passwort' };
    assert.equal((await rufe('/api/status', { kopf: { Cookie: cookie }, umgebung: neu })).status, 401);
  });

  test('die Bremse greift nach 5 falschen Versuchen und nur beim betroffenen Absender', async () => {
    const boese = '198.51.100.7';
    for (let i = 0; i < 5; i++) assert.equal((await anmelden('falsch' + i, boese)).status, 401);
    // Jetzt ist dieser Absender gesperrt, auch mit dem richtigen Passwort
    const gesperrt = await anmelden(PASSWORT, boese);
    assert.equal(gesperrt.status, 429);
    assert.ok(Number(gesperrt.antwort.headers.get('retry-after')) > 0);
    // Ein anderer Absender kann sich weiter anmelden
    assert.equal((await anmelden(PASSWORT, '203.0.113.99')).status, 200);
    // Nach 15 Minuten ist die Sperre vorbei
    setzeZeit(START + 16 * MIN);
    assert.equal((await anmelden(PASSWORT, boese)).status, 200);
  });

  test('vier falsche Versuche sperren noch nicht, ein Erfolg setzt den Zähler zurück', async () => {
    const ip = '198.51.100.8';
    for (let i = 0; i < 4; i++) assert.equal((await anmelden('falsch', ip)).status, 401);
    assert.equal((await anmelden(PASSWORT, ip)).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await anmelden('falsch', ip)).status, 401);
    assert.equal((await anmelden(PASSWORT, ip)).status, 200);
  });

  test('in der Datenbank steht keine IP-Adresse', async () => {
    await anmelden('falsch', '198.51.100.9');
    const { results } = await env.DB.prepare('SELECT absender FROM versuche').all();
    assert.equal(results.length, 1);
    assert.ok(!results[0].absender.includes('198.51'));
    assert.match(results[0].absender, /^[a-f0-9]{32}$/);
  });

  test('ein zu kurzes Passwort in den Einstellungen wird nie angenommen', async () => {
    const r = await anmelden('kurz', '203.0.113.1', { ...env, STATUS_PASSWORT: 'kurz' });
    assert.equal(r.status, 503);
  });

  test('Einstellungen von einer fremden Website werden abgelehnt', async () => {
    const cookie = await sitzung();
    const r = await rufe('/api/status/einstellungen', { methode: 'POST', kopf: { Cookie: cookie, Origin: 'https://boese.example' }, daten: { begruessungAn: true } });
    assert.equal(r.status, 403);
  });

  test('Einstellungen werden gespeichert und in den erlaubten Bereich geholt', async () => {
    const cookie = await sitzung();
    const r = await rufe('/api/status/einstellungen', {
      methode: 'POST', kopf: { Cookie: cookie, Origin: BASIS },
      daten: { dauerAnsichtSek: 99, design: 7, vorlaufMin: 45, newsMinuten: 1, betriebVon: '25:99', domains: 'Wallimann.ch, <script>', solarQuelle: 'irgendwas', feedUrl: 'http://unsicher.example/feed' },
    });
    assert.equal(r.status, 200);
    const e = await wirksam();
    assert.equal(e.dauerAnsichtSek, 15);
    assert.equal(e.design, 4);
    assert.equal(e.vorlaufMin, 45);
    assert.equal(e.newsMinuten, 15);
    assert.equal(e.betriebVon, '06:30');
    assert.deepEqual(e.domains, ['wallimann.ch']);
    assert.equal(e.solarQuelle, 'aus');
    assert.equal(e.feedUrl, '');
  });
});

describe('Besuche aus dem Kalender', () => {
  const kalender = (termine) => attrappe([['kalender.invalid', () => ics(termine)]]);

  test('die Begrüssung ist ausgeschaltet, bis sie auf der Statusseite eingeschaltet wird', async () => {
    await takt(kalender([{ uid: 'a', start: START + 10 * MIN, betreff: 'Muster AG | Anna Beispiel' }]));
    assert.deepEqual((await anzeige()).inhalt.begruessungen, []);
    await setzeEinstellungen({ begruessungAn: true });
    assert.equal((await anzeige()).inhalt.begruessungen.length, 1);
  });

  test('Begrüssung mit Firma, Name, Ansprechperson und Zeitfenster', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    await takt(kalender([{ uid: 'a', start: START + 20 * MIN, betreff: 'Muster Verpackungen AG | Frau Anna Beispiel', cn: 'Alexander Fischer', von: 'alexander.fischer@wallimann.ch' }]));
    const b = (await anzeige()).inhalt.begruessungen;
    assert.deepEqual(b, [{ von: START - 10 * MIN, bis: START + 35 * MIN, firma: 'Muster Verpackungen AG', name: 'Frau Anna Beispiel', ansprechperson: 'Alexander Fischer' }]);
  });

  test('ein Besuch wird erst kurz vor dem Fenster herausgegeben', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    await takt(kalender([{ uid: 'a', start: START + 120 * MIN, betreff: 'Spätere Firma AG' }]));
    assert.deepEqual((await anzeige()).inhalt.begruessungen, []);
    assert.ok(!JSON.stringify((await anzeige()).inhalt).includes('Spätere'));
    // 88 Minuten später: Das Fenster (ab 30 Minuten vorher) beginnt in 2 Minuten
    setzeZeit(START + 88 * MIN);
    await takt(kalender([{ uid: 'a', start: START + 120 * MIN, betreff: 'Spätere Firma AG' }]));
    assert.equal((await anzeige()).inhalt.begruessungen.length, 1);
  });

  test('fremde, private, abgesagte und ganztägige Termine erscheinen nicht, die Statusseite zählt sie', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    await takt(kalender([
      { uid: 'gut', start: START + 10 * MIN, betreff: 'Gute Firma AG' },
      { uid: 'fremd', start: START + 10 * MIN, betreff: 'Fremde Werbung https://boese.example', von: 'jemand@example.com' },
      { uid: 'taeuschung', start: START + 10 * MIN, betreff: 'Täuschung AG', von: 'x@wallimann.ch.example.com' },
      { uid: 'privat', start: START + 10 * MIN, betreff: 'Zahnarzt', zusatz: 'CLASS:PRIVATE' },
      { uid: 'abgesagt', start: START + 10 * MIN, betreff: 'Abgesagt: Alte Firma AG' },
    ]));
    const b = (await anzeige()).inhalt.begruessungen;
    assert.deepEqual(b.map((x) => x.firma), ['Gute Firma AG']);
    const cookie = await sitzung();
    const s = (await rufe('/api/status', { kopf: { Cookie: cookie } })).inhalt;
    assert.equal(s.besucheHeute, 1);
    const verworfen = Object.fromEntries(s.kalender.verworfen.map((v) => [v.grund, v.anzahl]));
    assert.equal(verworfen['Organisator nicht aus erlaubter Domain'], 2);
    assert.equal(verworfen['Privater Termin'], 1);
    assert.equal(verworfen['Abgesagter Termin'], 1);
    assert.ok(!JSON.stringify(s).includes('Zahnarzt'));
  });

  test('ein abgesagter Besuch verschwindet beim nächsten Abruf', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    await takt(kalender([{ uid: 'a', start: START + 10 * MIN, betreff: 'Muster AG' }]));
    assert.equal((await anzeige()).inhalt.begruessungen.length, 1);
    setzeZeit(START + 5 * MIN);
    await takt(kalender([{ uid: 'a', start: START + 10 * MIN, betreff: 'Muster AG', zusatz: 'STATUS:CANCELLED' }]));
    assert.deepEqual((await anzeige()).inhalt.begruessungen, []);
  });

  test('der Kalender wird nur im eingestellten Abstand geholt', async () => {
    const abruf = kalender([]);
    await takt(abruf);
    setzeZeit(START + 2 * MIN);
    await takt(abruf);
    assert.equal(abruf.aufrufe.filter((u) => u.includes('kalender.invalid')).length, 1);
    setzeZeit(START + 5 * MIN);
    await takt(abruf);
    assert.equal(abruf.aufrufe.filter((u) => u.includes('kalender.invalid')).length, 2);
  });

  test('Kalender nicht erreichbar: nach 15 Minuten keine Begrüssung mehr, News laufen weiter', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    const gut = attrappe([['kalender.invalid', () => ics([{ uid: 'a', start: START + 40 * MIN, betreff: 'Muster AG' }])], ['michelnews.ch', STARTSEITE]]);
    await takt(gut);
    const kaputt = attrappe([['kalender.invalid', new Response('Fehler', { status: 500 })], ['michelnews.ch', STARTSEITE]]);
    setzeZeit(START + 12 * MIN);
    await takt(kaputt);
    // 12 Minuten nach dem letzten Erfolg: Begrüssung noch erlaubt
    assert.equal((await anzeige()).inhalt.begruessungen.length, 1);
    setzeZeit(START + 17 * MIN);
    await takt(kaputt);
    const r = (await anzeige()).inhalt;
    assert.deepEqual(r.begruessungen, []);
    assert.equal(r.news.length, 10);
    const cookie = await sitzung();
    const s = (await rufe('/api/status', { kopf: { Cookie: cookie } })).inhalt;
    assert.ok(s.hinweise.some((h) => h.includes('Fehler 500')));
    assert.ok(s.hinweise.some((h) => h.includes('älter als 15 Minuten')));
    // Der geheime Link taucht nirgends auf
    assert.ok(!JSON.stringify(s).includes('kalender.invalid'));
  });

  test('ungültiger Kalender-Link (Fehlerseite statt Kalender): Statusseite meldet es', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    await takt(attrappe([['kalender.invalid', '<html><body>Diese Seite gibt es nicht</body></html>']]));
    const cookie = await sitzung();
    const s = (await rufe('/api/status', { kopf: { Cookie: cookie } })).inhalt;
    assert.ok(s.kalender.fehler.includes('keinen gültigen Kalender'));
    assert.equal(s.kalender.letzterErfolg, null);
    assert.deepEqual((await anzeige()).inhalt.begruessungen, []);
  });

  test('Kalender über eine Stunde nicht erreichbar: eine E-Mail, keine Wiederholung, danach Entwarnung', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    const gesendet = [];
    const senden = async (e, einst, betreff, text) => { gesendet.push({ betreff, text }); return { gesendet: true }; };
    const lauf = async () => alarmeVerarbeiten(env, env.DB, await wirksam(), await speicher.ladeZustand(env.DB), jetzt(), senden);
    await takt(attrappe([['kalender.invalid', () => ics([])]]));
    const kaputt = attrappe([['kalender.invalid', new Response('weg', { status: 404 })]]);
    setzeZeit(START + 31 * MIN); await takt(kaputt); await lauf();
    assert.equal(gesendet.length, 0);
    setzeZeit(START + 66 * MIN); await takt(kaputt); await lauf();
    assert.equal(gesendet.length, 1);
    assert.match(gesendet[0].betreff, /Störung \(Kalender\)/);
    assert.ok(!gesendet[0].text.includes('kalender.invalid'));
    setzeZeit(START + 71 * MIN); await takt(kaputt); await lauf();
    assert.equal(gesendet.length, 1);
    setzeZeit(START + 76 * MIN); await takt(attrappe([['kalender.invalid', () => ics([])]])); await lauf();
    assert.equal(gesendet.length, 2);
    assert.match(gesendet[1].betreff, /wieder in Ordnung/);
  });

  test('Besuche von gestern werden gelöscht', async () => {
    await setzeEinstellungen({ begruessungAn: true });
    await takt(kalender([{ uid: 'a', start: START + 10 * MIN, betreff: 'Muster AG' }]));
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM besuche').first()).n, 1);
    // Am nächsten Tag liefert der Kalender-Link nichts mehr: Der Abruf scheitert, das Aufräumen löscht trotzdem
    const morgen = START + 24 * 60 * MIN + 7 * MIN; // Minute 7 der Stunde: Aufräumen läuft
    setzeZeit(morgen);
    await takt(attrappe([['kalender.invalid', new Response('weg', { status: 500 })]]));
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM besuche').first()).n, 0);
  });
});

describe('News', () => {
  const bildDaten = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const news = () => attrappe([
    ['kalender.invalid', () => ics([])],
    ['/fileadmin/', () => new Response(bildDaten, { status: 200, headers: { 'content-type': 'image/jpeg' } })],
    ['/news/', ARTIKEL],
    ['michelnews.ch', STARTSEITE],
  ]);

  test('die 10 neusten Artikel aus der gespeicherten Startseite, neuster zuerst', async () => {
    await takt(news());
    const n = (await anzeige()).inhalt.news;
    assert.equal(n.length, 10);
    assert.equal(n[0].titel, '6000 Franken für zwei Vereine aus Gunzwil');
    assert.equal(n[0].ort, 'Gunzwil');
    assert.equal(n[0].rubrik, 'Mosaik');
    assert.equal(n[0].datum, '25.11.2026');
    assert.equal(n[0].bild, null); // Bild wird erst nachgeladen
  });

  test('Bilder werden einzeln nachgeladen: zuerst die Artikelseite, dann das grösste Bild', async () => {
    const abruf = news();
    await takt(abruf);
    assert.equal(await bildSchritt(env, env.DB, abruf), true); // Artikelseite
    assert.equal((await anzeige()).inhalt.news[0].bild, null);
    assert.equal(await bildSchritt(env, env.DB, abruf), true); // Bild
    const erster = (await anzeige()).inhalt.news[0];
    assert.match(erster.bild, /^\/newsbild\/[a-f0-9]{24}$/);
    assert.equal(erster.bildBreite, 721);
    assert.equal(erster.bildHoehe, 554);
    const bild = await rufe(erster.bild);
    assert.equal(bild.status, 200);
    assert.equal(bild.antwort.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await bild.antwort.arrayBuffer()), bildDaten);
    assert.equal((await rufe('/newsbild/nichtda')).status, 404);
  });

  test('zwischen zwei Abrufen der Liste lädt der Taktgeber höchstens drei Schritte pro Minute', async () => {
    const abruf = news();
    await takt(abruf);
    const vorher = abruf.aufrufe.length;
    setzeZeit(START + 1 * MIN);
    await takt(abruf);
    assert.equal(abruf.aufrufe.length - vorher, 3);
  });

  test('was kein Bild ist, wird nicht gespeichert', async () => {
    const abruf = attrappe([
      ['kalender.invalid', () => ics([])],
      ['/fileadmin/', () => new Response('<html>kein Bild</html>', { status: 200, headers: { 'content-type': 'text/html' } })],
      ['/news/', ARTIKEL],
      ['michelnews.ch', STARTSEITE],
    ]);
    await takt(abruf);
    for (let i = 0; i < 6; i++) await bildSchritt(env, env.DB, abruf);
    assert.equal((await anzeige()).inhalt.news[0].bild, null);
  });

  test('michelnews.ch nicht erreichbar: die gespeicherten Artikel laufen weiter', async () => {
    await takt(news());
    setzeZeit(START + 15 * MIN);
    await takt(attrappe([['kalender.invalid', () => ics([])], ['michelnews.ch', new Response('weg', { status: 503 })]]));
    const r = (await anzeige()).inhalt;
    assert.equal(r.news.length, 10);
    const cookie = await sitzung();
    const s = (await rufe('/api/status', { kopf: { Cookie: cookie } })).inhalt;
    assert.ok(s.news.fehler);
    assert.ok(s.hinweise.some((h) => h.includes('laufen weiter')));
  });

  test('Redesign der Startseite (keine Artikel gefunden): Fehler auf der Statusseite, alte Artikel bleiben', async () => {
    await takt(news());
    setzeZeit(START + 15 * MIN);
    await takt(attrappe([['kalender.invalid', () => ics([])], ['michelnews.ch', '<html><body><h1>Neues Design</h1></body></html>']]));
    assert.equal((await anzeige()).inhalt.news.length, 10);
    const cookie = await sitzung();
    const s = (await rufe('/api/status', { kopf: { Cookie: cookie } })).inhalt;
    assert.match(s.news.fehler, /Keine Artikel/);
  });

  test('Filter nach Gemeinde und Anzahl', async () => {
    await setzeEinstellungen({ newsOrte: ['Rickenbach'], newsAnzahl: 3 });
    await takt(news());
    const n = (await anzeige()).inhalt.news;
    assert.ok(n.length >= 1 && n.length <= 3);
    assert.ok(n.every((a) => a.ort === 'Rickenbach'));
  });

  test('mit Adresse eines Feeds wird der Feed gelesen statt der Startseite', async () => {
    const feed = readFileSync(new URL('./fixtures/news-feed-beispiel.xml', import.meta.url), 'utf8');
    await setzeEinstellungen({ feedUrl: 'https://feed.example/michelnews.xml' });
    const abruf = attrappe([['kalender.invalid', () => ics([])], ['feed.example', feed]]);
    await takt(abruf);
    assert.ok(abruf.aufrufe.some((u) => u.includes('feed.example')));
    assert.ok(!abruf.aufrufe.some((u) => u.includes('michelnews.ch/')));
    assert.equal((await anzeige()).inhalt.news.length, 3);
  });
});

describe('Solar', () => {
  const sende = (werte, schluessel = SOLAR) => rufe('/api/solar', { methode: 'POST', kopf: { 'X-Solar-Schluessel': schluessel }, daten: werte });

  test('ohne Schlüssel nimmt die Website keine Solarwerte an', async () => {
    await setzeEinstellungen({ solarQuelle: 'empfang' });
    assert.equal((await rufe('/api/solar', { methode: 'POST', daten: { leistungKw: 10 } })).status, 401);
    assert.equal((await sende({ leistungKw: 10 }, 'falscher-schluessel-der-lang-ist')).status, 401);
    assert.equal((await anzeige()).inhalt.solar, null);
  });

  test('Solar ist ausgeschaltet, bis die Quelle gewählt ist', async () => {
    assert.equal((await sende({ leistungKw: 10 })).status, 409);
    assert.equal((await anzeige()).inhalt.solar, null);
  });

  test('Werte von einem Zusatzgerät erscheinen, unsinnige Werte werden abgelehnt', async () => {
    await setzeEinstellungen({ solarQuelle: 'empfang' });
    assert.equal((await sende({ leistungKw: 'viel' })).status, 400);
    assert.equal((await sende({ leistungKw: -5 })).status, 400);
    assert.equal((await sende({ leistungKw: 42.5, tagesertragKwh: 180, zeit: 1 })).status, 200);
    const s = (await anzeige()).inhalt.solar;
    assert.deepEqual(s, { zeit: START, beispiel: false, leistungKw: 42.5, tagesertragKwh: 180 });
  });

  test('Werte älter als 10 Minuten: Solar-Ansicht wird ausgelassen', async () => {
    await setzeEinstellungen({ solarQuelle: 'empfang' });
    await sende({ leistungKw: 42.5, tagesertragKwh: 180 });
    setzeZeit(START + 10 * MIN);
    assert.ok((await anzeige()).inhalt.solar);
    setzeZeit(START + 10 * MIN + 1000);
    assert.equal((await anzeige()).inhalt.solar, null);
  });

  test('Beispieldaten sind als Beispiel markiert', async () => {
    await setzeEinstellungen({ solarQuelle: 'beispiel' });
    await takt(attrappe([['kalender.invalid', () => ics([])], ['michelnews.ch', STARTSEITE]]));
    const s = (await anzeige()).inhalt.solar;
    assert.equal(s.beispiel, true);
    assert.equal(typeof s.leistungKw, 'number');
  });
});

describe('Lebenszeichen der Anzeige und Warnung', () => {
  test('die Statusseite zeigt, wann die Anzeige zuletzt Daten geholt hat', async () => {
    await anzeige();
    const cookie = await sitzung();
    const s = (await rufe('/api/status', { kopf: { Cookie: cookie } })).inhalt;
    assert.equal(s.anzeige.zuletzt.zeit, START);
    assert.equal(s.anzeige.zuletzt.text, '25.11.2026, 09:00');
  });

  test('Anzeige holt während der Betriebszeit über eine Stunde keine Daten: Störung und E-Mail', async () => {
    await anzeige(); // Lebenszeichen um 09:00
    const e = await wirksam();
    const zustand = await speicher.ladeZustand(env.DB);
    assert.deepEqual(pruefeAlarme({ jetzt: START + 59 * MIN, e, zustand }), {});
    const spaeter = pruefeAlarme({ jetzt: START + 61 * MIN, e, zustand });
    assert.match(spaeter.anzeige, /seit über einer Stunde/);
    const gesendet = [];
    setzeZeit(START + 61 * MIN);
    await alarmeVerarbeiten(env, env.DB, e, zustand, jetzt(), async (a, b, betreff) => { gesendet.push(betreff); return { gesendet: true }; });
    assert.equal(gesendet.length, 1);
    const cookie = await sitzung();
    const s = (await rufe('/api/status', { kopf: { Cookie: cookie } })).inhalt;
    assert.ok(s.hinweise.some((h) => h.startsWith('Störung') && h.includes('Anzeige')));
  });

  test('ausserhalb der Betriebszeiten gibt es keine Warnung zur Anzeige', async () => {
    await anzeige(); // Lebenszeichen am Mittwoch um 09:00
    const e = await wirksam();
    const zustand = await speicher.ladeZustand(env.DB);
    const mittwochAbend = Date.UTC(2026, 10, 25, 19, 0, 0); // 20:00 Zürcher Zeit
    const donnerstagFrueh = Date.UTC(2026, 10, 26, 5, 45, 0); // 06:45: Betrieb läuft erst seit 15 Minuten
    const donnerstagSpaeter = Date.UTC(2026, 10, 26, 6, 45, 0); // 07:45
    assert.deepEqual(pruefeAlarme({ jetzt: mittwochAbend, e, zustand }), {});
    assert.deepEqual(pruefeAlarme({ jetzt: donnerstagFrueh, e, zustand }), {});
    assert.ok(pruefeAlarme({ jetzt: donnerstagSpaeter, e, zustand }).anzeige);
  });
});

describe('Zeit für die Anzeige', () => {
  test('Winterzeit ohne nahe Umstellung', () => {
    assert.deepEqual(zoneInfo(START), { versatzMin: 60, wechsel: null });
  });

  test('die nächste Zeitumstellung wird mitgeliefert (28.03.2027, 02:00 wird 03:00)', () => {
    const z = zoneInfo(Date.UTC(2027, 2, 25, 12, 0, 0));
    assert.equal(z.versatzMin, 60);
    assert.deepEqual(z.wechsel, { zeit: Date.UTC(2027, 2, 28, 1, 0, 0), versatzMin: 120 });
  });

  test('Umstellung im Herbst (25.10.2026, 03:00 wird 02:00)', () => {
    const z = zoneInfo(Date.UTC(2026, 9, 24, 12, 0, 0));
    assert.equal(z.versatzMin, 120);
    assert.deepEqual(z.wechsel, { zeit: Date.UTC(2026, 9, 25, 1, 0, 0), versatzMin: 60 });
  });
});

describe('Testversion mit Beispieldaten', () => {
  test('liefert ohne Abrufe ins Internet Begrüssung, News und Solar', async () => {
    const beispiel = { ...env, BEISPIELDATEN: '1', KALENDER_URL: undefined };
    setzeZeit(Math.floor(START / (20 * MIN)) * 20 * MIN + 3 * MIN); // im Begrüssungsfenster des Beispiels
    const r = (await anzeige(beispiel)).inhalt;
    assert.deepEqual(r.begruessungen.map((b) => b.firma).sort(), ['Gemeinde Beromünster', 'Muster Verpackungen AG']);
    assert.equal(r.news.length, 5);
    assert.equal(r.solar.beispiel, true);
  });
});
