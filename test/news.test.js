import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  leseStartseite,
  leseAgenda,
  leseArtikelBild,
  leseFeed,
  filtereNews,
  holeNews,
  bildDarstellung,
} from '../src/lib/news.js';

const lade = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const startseite = lade('michelnews-startseite.html');
const artikelSeite = lade('michelnews-artikel.html');
const feedXml = lade('news-feed-beispiel.xml');

const antwort = (text, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => text });

test('Startseite liefert genau 13 Artikel', () => {
  assert.equal(leseStartseite(startseite).length, 13);
});

test('Aufmacher: Titel, Ort, Rubrik, Datum, bezahlt und Link stimmen', () => {
  const a = leseStartseite(startseite)[0];
  assert.equal(a.titel, '6000 Franken für zwei Vereine aus Gunzwil');
  assert.equal(a.ort, 'Gunzwil');
  assert.equal(a.rubrik, 'Mosaik');
  assert.equal(a.datum, '2026-11-25');
  assert.equal(a.bezahlt, true);
  assert.equal(a.link, 'https://michelnews.ch/news/6000-franken-gunzwil');
  assert.match(a.bildUrl, /^https:\/\/michelnews\.ch\/fileadmin\/_processed_\//);
});

test('Unbezahlter Artikel «Erfolgreiches Pilotprojekt geht zu Ende»', () => {
  const a = leseStartseite(startseite).find((x) => x.titel === 'Erfolgreiches Pilotprojekt geht zu Ende');
  assert.ok(a);
  assert.equal(a.rubrik, 'Aus der Gemeinde');
  assert.equal(a.bezahlt, false);
});

test('Keine Artikel aus Meistgelesen, Leserbildern oder Inseraten', () => {
  const ersterTeil = startseite.slice(0, startseite.indexOf('news-list-view template-leserbilder'));
  const ausgeschlossen = startseite.slice(startseite.indexOf('news-list-view template-leserbilder'));
  const links = new Set(leseStartseite(startseite).map((a) => a.link));
  // Links, die nur im ausgeschlossenen Teil vorkommen, dürfen nicht auftauchen.
  const nurAusgeschlossen = [...ausgeschlossen.matchAll(/href="(\/news\/[^"]+)"/g)]
    .map((m) => `https://michelnews.ch${m[1]}`)
    .filter((l) => !ersterTeil.includes(l.replace('https://michelnews.ch', '')));
  assert.ok(nurAusgeschlossen.length > 0);
  for (const l of nurAusgeschlossen) assert.ok(!links.has(l), `unerwartet: ${l}`);
});

test('Kein Bild zeigt auf paid.svg, alle Bilder sind absolut', () => {
  for (const a of leseStartseite(startseite)) {
    assert.ok(a.bildUrl, `Bild fehlt: ${a.titel}`);
    assert.ok(!a.bildUrl.includes('paid.svg'));
    assert.match(a.bildUrl, /^https:\/\//);
  }
});

test('Daten im Format JJJJ-MM-TT und absteigend sortiert', () => {
  const daten = leseStartseite(startseite).map((a) => a.datum);
  for (const d of daten) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(daten, [...daten].sort().reverse());
});

test('Keine doppelten Links', () => {
  const links = leseStartseite(startseite).map((a) => a.link);
  assert.equal(new Set(links).size, links.length);
});

test('Leerer oder fremder HTML-Text ergibt eine leere Liste', () => {
  assert.deepEqual(leseStartseite(''), []);
  assert.deepEqual(leseStartseite('<html><body>Nichts</body></html>'), []);
});

test('Entities werden aufgelöst und Leerraum zusammengezogen', () => {
  const html = `<div class="news-list-view template-top"><div class="news-list-item">
    <img class="img-fluid" src="/b.jpg"><h3 itemprop="headline"><a href="/news/x">  Tom &amp;
    Jerry &laquo;live&raquo; </a></h3>
    <div class="news-meta"> Ober&auml;geri -  01.02.27 </div></div></div>`;
  const [a] = leseStartseite(html);
  assert.equal(a.titel, 'Tom & Jerry «live»');
  assert.equal(a.ort, 'Oberägeri');
  assert.equal(a.datum, '2027-02-01');
  assert.equal(a.rubrik, null);
});

test('leseArtikelBild liefert 721 mal 554', () => {
  assert.deepEqual(leseArtikelBild(artikelSeite), {
    bildUrl: 'https://michelnews.ch/fileadmin/_processed_/a/f/csm_KathrinBecker_6338_1f1a52f9f1.jpg',
    breite: 721,
    hoehe: 554,
  });
});

test('leseArtikelBild ohne og:image ergibt null', () => {
  assert.equal(leseArtikelBild('<html><head></head></html>'), null);
});

test('Feed-Beispiel wird gelesen, sortiert und mit Bildmassen versehen', () => {
  const feed = leseFeed(feedXml);
  assert.equal(feed.length, 3);
  assert.deepEqual(feed.map((a) => a.datum), ['2026-11-25', '2026-11-25', '2026-11-24']);
  // Gleiches Datum: Reihenfolge der Quelle (Turnverein steht vor Chorkonzert).
  assert.equal(feed[0].titel, 'Turnverein Beispielhausen gewinnt & feiert');
  assert.equal(feed[0].rubrik, 'Sport');
  assert.equal(feed[0].ort, 'Beispielhausen');
  assert.equal(feed[0].bildUrl, 'https://beispiel.example/bilder/turnverein.jpg');
  assert.equal(feed[0].bildBreite, 1600);
  assert.equal(feed[0].bildHoehe, 900);
  assert.equal(feed[1].titel, 'Chorkonzert in der Kirche Testingen');
  assert.equal(feed[1].rubrik, 'Kultur');
  assert.equal(feed[1].ort, 'Testingen');
  assert.equal(feed[1].bildUrl, null);
  assert.equal(feed[2].titel, 'Neuer Dorfladen eröffnet in Musterwil');
  assert.equal(feed[2].bildUrl, 'https://beispiel.example/bilder/dorfladen.jpg');
  assert.equal(feed[2].bildBreite, undefined);
  assert.equal(feed[2].bezahlt, false);
});

test('Filter nach Ort und Rubrik ohne Gross-/Kleinschreibung', () => {
  const feed = leseFeed(feedXml);
  assert.equal(filtereNews(feed).length, 3);
  assert.equal(filtereNews(feed, { orte: [], rubriken: [] }).length, 3);
  assert.deepEqual(filtereNews(feed, { orte: ['MUSTERWIL'] }).map((a) => a.ort), ['Musterwil']);
  assert.deepEqual(filtereNews(feed, { rubriken: ['sport', 'kultur'] }).length, 2);
  assert.equal(filtereNews(feed, { orte: ['Musterwil'], rubriken: ['Sport'] }).length, 0);
});

test('holeNews mit Feed liest den Feed und begrenzt auf max', async () => {
  let abgerufen;
  const abruf = async (url) => {
    abgerufen = url;
    return antwort(feedXml)();
  };
  const r = await holeNews({ feedUrl: 'https://beispiel.example/feed.xml', abruf, max: 2 });
  assert.equal(abgerufen, 'https://beispiel.example/feed.xml');
  assert.equal(r.length, 2);
  assert.equal(r[0].datum, '2026-11-25');
});

test('holeNews mit Startseite liefert höchstens 10 Artikel, Filter wirkt vor der Begrenzung', async () => {
  const r = await holeNews({ abruf: antwort(startseite) });
  assert.equal(r.length, 10);
  const sport = await holeNews({ abruf: antwort(startseite), filter: { rubriken: ['sport'] } });
  assert.ok(sport.length > 0 && sport.every((a) => a.rubrik === 'Sport'));
});

test('holeNews wirft bei leerem HTML eine deutsche Meldung', async () => {
  await assert.rejects(holeNews({ abruf: antwort('<html></html>') }), /Keine Artikel.*gefunden/);
});

test('holeNews wirft bei HTTP 500 eine deutsche Meldung', async () => {
  await assert.rejects(holeNews({ abruf: antwort('Fehler', 500) }), /nicht geladen.*500/);
});

test('holeNews wirft, wenn der Abruf selbst scheitert', async () => {
  const abruf = async () => {
    throw new Error('Netz weg');
  };
  await assert.rejects(holeNews({ abruf }), /nicht geladen.*Netz weg/);
});

test('bildDarstellung: 721 klein, 1920 gross, unbekannt klein', () => {
  assert.equal(bildDarstellung(721, 554), 'klein');
  assert.equal(bildDarstellung(1920, 1080), 'gross');
  assert.equal(bildDarstellung(1152, 700), 'gross');
  assert.equal(bildDarstellung(1151, 700), 'klein');
  assert.equal(bildDarstellung(undefined, undefined), 'klein');
  assert.equal(bildDarstellung(null), 'klein');
});

test('Laufzeit von leseStartseite (Mittel aus 50 Läufen)', () => {
  leseStartseite(startseite);
  const n = 50;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) leseStartseite(startseite);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  console.log(`Mittlere Laufzeit leseStartseite: ${ms.toFixed(2)} ms`);
  assert.ok(ms < 50);
});

// ---------------- Agenda ----------------

test('Agenda: die Startseite liefert 10 Veranstaltungen in der Reihenfolge der Seite', () => {
  const a = leseAgenda(startseite);
  assert.equal(a.length, 10);
  assert.deepEqual(a.slice(0, 4).map((x) => x.titel), [
    'Lesung mit Laura Vogt aus «Das Jahr des Kalks»', 'Christmas in Beromünster', 'Adventsmarkt', 'Adventskonzert 2026',
  ]);
});

test('Agenda: Titel, Link, Datum, Rubrik, Ort und Bild des ersten Eintrags stimmen', () => {
  assert.deepEqual(leseAgenda(startseite)[0], {
    titel: 'Lesung mit Laura Vogt aus «Das Jahr des Kalks»',
    link: 'https://michelnews.ch/agenda/event/lesung-mit-laura-vogt-aus-das-jahr-des-kalks-40877',
    von: '2026-11-26',
    bis: '2026-11-26',
    rubrik: 'Kultur',
    ort: 'Beromünster',
    bildUrl: 'https://michelnews.ch/fileadmin/_processed_/9/e/csm_laura-vogt_hannes_thalmann_bb147cb56e.jpeg',
    bildBreite: 360,
    bildHoehe: 272,
  });
});

test('Agenda: ein Zeitraum «10.10.2026 - 29.11.2026» ergibt Beginn und Ende', () => {
  const lang = leseAgenda(startseite).find((x) => x.von !== x.bis);
  assert.equal(lang.titel, 'Geboren werden');
  assert.equal(lang.von, '2026-10-10');
  assert.equal(lang.bis, '2026-11-29');
});

test('Agenda: der auskommentierte Ort zählt nicht, der sichtbare schon', () => {
  const html = '<div class="row event-slider"><div class="event-list-item"><div class="event-startdate">01.12.2026</div>'
    + '<h3 class="event-title"><a href="/agenda/event/a-1">Test &amp; Probe <b>fett</b></a></h3>'
    + '<!-- <div class="event-list-value event-location"><a href="#">Falsch</a></div> -->'
    + '<div class="event-list-value event-location"><a href="#">Richtig</a></div></div></div>';
  const [e] = leseAgenda(html);
  assert.equal(e.ort, 'Richtig');
  assert.equal(e.titel, 'Test & Probe fett');
  assert.equal(e.bildUrl, null);
  assert.equal(e.rubrik, null);
});

test('Agenda: Einträge ohne Datum, ohne Titel oder mit fremdartigem Link fallen weg', () => {
  const eintrag = (datum, link, titel) => '<div class="event-list-item"><div class="event-startdate">' + datum + '</div>'
    + '<h3 class="event-title"><a href="' + link + '">' + titel + '</a></h3></div>';
  const html = '<div class="event-slider">' + eintrag('', '/agenda/event/a', 'Ohne Datum') + eintrag('02.12.2026', '/agenda/event/b', '')
    + eintrag('02.12.2026', 'javascript:alert(1)', 'Böser Link') + eintrag('03.12.2026', '/agenda/event/c', 'Gut') + '</div>';
  assert.deepEqual(leseAgenda(html).map((x) => x.titel), ['Gut']);
});

test('Agenda: leere oder fremde Eingaben ergeben eine leere Liste', () => {
  assert.deepEqual(leseAgenda(''), []);
  assert.deepEqual(leseAgenda(null), []);
  assert.deepEqual(leseAgenda('<html><body>Keine Agenda</body></html>'), []);
});

test('Datum der News mit vierstelligem Jahr wird nicht als 2020 gelesen', () => {
  const html = '<div class="news-list-view template-top"><div class="news-list-item"><h3 itemprop="headline"><a href="/news/x">Titel</a></h3>'
    + '<div class="news-meta">Gunzwil - 25.11.2026</div></div></div>';
  assert.equal(leseStartseite(html)[0].datum, '2026-11-25');
});

