// Tests der Anzeige in einem echten Browser (Chromium über Playwright).
// Sie prüfen, was sich nur im Browser zeigt: Ausfall des Internets, Neuladen ohne Internet,
// Wechsel der Ansichten, Schwarz ausserhalb der Betriebszeiten.
//
// Aufruf: zuerst «npm start» in einem zweiten Fenster, dann «node test/browser/anzeige.mjs».
// Playwright gehört bewusst nicht zu den Abhängigkeiten des Projekts. Fehlt es, bricht der Test mit einem Hinweis ab.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('Playwright ist nicht installiert. Dieser Test wird übersprungen.');
  process.exit(0);
}

const BASIS = process.env.BASIS || 'http://127.0.0.1:8787';
const SCHLUESSEL = 'beispiel-schluessel-nur-lokal';
const MIN = 60000;
// Mittwoch, 25.11.2026, 09:00 Zürcher Zeit
const START = Date.UTC(2026, 10, 25, 8, 0, 0);

const ergebnisse = [];
function pruefe(name, bedingung, detail = '') {
  ergebnisse.push({ name, ok: Boolean(bedingung), detail });
  console.log((bedingung ? 'ok      ' : 'FEHLER  ') + name + (bedingung || !detail ? '' : '  -> ' + detail));
}

const NEWS = [
  { id: 'a', titel: 'Erster Artikel aus Beromünster', ort: 'Beromünster', rubrik: 'Kultur', datum: '25.11.2026', bild: null },
  { id: 'b', titel: 'Zweiter Artikel aus Rickenbach', ort: 'Rickenbach', rubrik: 'Sport', datum: '25.11.2026', bild: null },
  { id: 'c', titel: 'Dritter Artikel aus Gunzwil', ort: 'Gunzwil', rubrik: 'Politik', datum: '24.11.2026', bild: null },
  { id: 'd', titel: 'Vierter Artikel aus Neudorf', ort: 'Neudorf', rubrik: 'Vereinsleben', datum: '24.11.2026', bild: null },
];

function antwort(zeit, zusatz = {}) {
  return {
    ok: true, zeit, zone: { versatzMin: 60, wechsel: null }, begruessungen: [], news: NEWS, solar: null, version: 'v1',
    einstellungen: { dauerAnsichtSek: 12, dauerBesuchSek: 10, solarNachArtikeln: 3, design: 1, betrieb: { tage: [1, 2, 3, 4, 5], von: '06:30', bis: '18:00' } },
    ...zusatz,
  };
}

const besuch = (zeit, firma, name = null) => ({ von: zeit - 10 * MIN, bis: zeit + 30 * MIN, firma, name });

async function neueSeite(browser, { zeit = START, liefert, mitSchluessel = true, breite = 1920, hoehe = 1080 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe } });
  const seite = await ctx.newPage();
  const fehler = [];
  seite.on('pageerror', (e) => fehler.push(String(e)));
  await seite.clock.install({ time: new Date(zeit) });
  const zustand = { liefert, aufrufe: 0, status: 200, offline: false };
  await ctx.route('**/api/anzeige*', async (route) => {
    zustand.aufrufe++;
    if (zustand.offline) return route.abort('internetdisconnected');
    if (zustand.status !== 200) return route.fulfill({ status: zustand.status, contentType: 'application/json', body: '{"ok":false}' });
    const jetzt = await seite.evaluate(() => Date.now());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(zustand.liefert(jetzt)) });
  });
  await seite.goto(BASIS + '/anzeige/' + (mitSchluessel ? '#k=' + SCHLUESSEL : ''));
  await vor(seite, 2500);
  return { ctx, seite, zustand, fehler };
}

// Stellt die Uhr im Browser vor. Danach bekommt der Browser kurz echte Zeit, damit
// Antworten des Servers ankommen, und die Uhr läuft noch gut eine Sekunde weiter.
async function vor(seite, ms) {
  await seite.clock.runFor(ms);
  await seite.waitForTimeout(250);
  await seite.clock.runFor(1200);
  await seite.waitForTimeout(100);
}

const sicht = (seite) => seite.evaluate(() => {
  const e = document.querySelector('.ebene.sichtbar .ansicht');
  return {
    art: e ? e.className.replace('ansicht ', '') : null,
    text: e ? e.innerText.replace(/\s+/g, ' ').trim() : '',
    schwarz: document.getElementById('schwarz').className.includes('an'),
    uhr: document.getElementById('zeit').innerText,
    datum: document.getElementById('datum').innerText,
  };
});

const browser = await chromium.launch();

// ---------- 1. Begrüssung und Wechsel ----------
{
  const { ctx, seite, fehler } = await neueSeite(browser, { liefert: (z) => antwort(z, { begruessungen: [besuch(START, 'Muster Verpackungen AG', 'Frau Anna Beispiel')] }) });
  let s = await sicht(seite);
  pruefe('Begrüssung erscheint mit Firma und Name, ohne Ansprechperson', s.art === 'begruessung' && s.text.includes('Herzlich willkommen') && s.text.includes('Muster Verpackungen AG') && s.text.includes('Frau Anna Beispiel') && !s.text.includes('Ansprechperson'), s.text);
  pruefe('Datum und Uhrzeit kommen vom Server (Zürcher Zeit)', s.datum === 'Mittwoch, 25.11.2026' && s.uhr === '09:00', s.datum + ' ' + s.uhr);
  await vor(seite, 40000);
  s = await sicht(seite);
  pruefe('während der Begrüssung laufen keine News', s.art === 'begruessung', s.art);
  const gespeichert = await seite.evaluate(() => JSON.stringify(Object.assign({}, window.localStorage)));
  pruefe('Namen von Besuchen werden nicht auf dem Gerät gespeichert', !gespeichert.includes('Muster Verpackungen') && !gespeichert.includes('Beispiel'), gespeichert.slice(0, 200));
  pruefe('keine Skriptfehler', fehler.length === 0, fehler.join(' | '));
  await ctx.close();
}

// ---------- 2. Zwei Besuche wechseln alle 10 Sekunden ----------
{
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => antwort(z, { begruessungen: [besuch(START, 'Erste Firma AG'), besuch(START, 'Zweite Firma GmbH')] }) });
  const gesehen = [];
  for (let i = 0; i < 5; i++) { gesehen.push((await sicht(seite)).text.includes('Erste Firma') ? 1 : 2); await vor(seite, 8800); }
  pruefe('zwei Besuche gleichzeitig wechseln sich alle 10 Sekunden ab', gesehen.join('') === '12121' || gesehen.join('') === '21212', gesehen.join(''));
  await ctx.close();
}

// ---------- 3. Fremder Text wird nie als HTML ausgeführt ----------
{
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => antwort(z, { begruessungen: [besuch(START, '<img src=x onerror="window.gehackt=1"> Firma', '<script>window.gehackt=1</script>')] }) });
  await vor(seite, 3000);
  const r = await seite.evaluate(() => ({ gehackt: window.gehackt === 1, bilder: document.querySelectorAll('.begruessung img').length }));
  pruefe('Text aus dem Kalender wird nie als HTML ausgeführt', !r.gehackt && r.bilder === 0, JSON.stringify(r));
  await ctx.close();
}

// ---------- 4. News und Solar wechseln, Solar nach jedem dritten Artikel ----------
{
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => antwort(z, { solar: { zeit: z, leistungKw: 42.5, tagesertragKwh: 180, beispiel: true } }) });
  const folge = [];
  for (let i = 0; i < 6; i++) { const s = await sicht(seite); folge.push(s.art === 'solar' ? 'S' : s.text.split(' ').find((w) => /Erster|Zweiter|Dritter|Vierter/.test(w))?.[0] || '?'); await vor(seite, 10800); }
  pruefe('News wechseln alle 12 Sekunden, Solar kommt nach dem dritten Artikel', folge.join('') === 'EZDSVE', folge.join(''));
  await ctx.close();
}

// ---------- 5. Internet fällt aus ----------
{
  const { ctx, seite, zustand } = await neueSeite(browser, {
    liefert: (z) => antwort(z, { begruessungen: [besuch(START, 'Muster Verpackungen AG')], solar: { zeit: z, leistungKw: 42.5, tagesertragKwh: 180, beispiel: false } }),
  });
  pruefe('vor dem Ausfall läuft die Begrüssung', (await sicht(seite)).art === 'begruessung');
  zustand.offline = true;
  await vor(seite, 100 * 1000);
  pruefe('100 Sekunden ohne Internet: Begrüssung bleibt noch (Grenze 2 Minuten)', (await sicht(seite)).art === 'begruessung');
  await vor(seite, 60 * 1000);
  let s = await sicht(seite);
  pruefe('nach 2 Minuten ohne Internet verschwindet die Begrüssung, News und Solar laufen', (s.art.startsWith('news') || s.art === 'solar') && !s.text.includes('Muster'), s.art + ' ' + s.text);
  pruefe('die Uhr läuft ohne Internet weiter', s.uhr === '09:02', s.uhr);
  const arten = new Set();
  for (let i = 0; i < 6; i++) { arten.add((await sicht(seite)).art); await vor(seite, 12000); }
  pruefe('Solar läuft kurz nach dem Ausfall noch mit (Werte jünger als 10 Minuten)', arten.has('solar'), [...arten].join(','));
  await vor(seite, 9 * MIN);
  const spaeter = new Set();
  for (let i = 0; i < 8; i++) { const x = await sicht(seite); spaeter.add(x.art); await vor(seite, 12000); }
  pruefe('10 Minuten alte Solarwerte werden ausgelassen, News laufen weiter', !spaeter.has('solar') && [...spaeter].every((a) => a.startsWith('news')), [...spaeter].join(','));
  pruefe('es erscheint nie eine Fehlermeldung', !(await seite.evaluate(() => document.body.innerText)).match(/fehler|error|offline/i));
  // Internet kommt zurück
  zustand.offline = false;
  await vor(seite, 65 * 1000);
  s = await sicht(seite);
  pruefe('sobald das Internet zurück ist, erscheint die Begrüssung wieder', s.art === 'begruessung', s.art);
  await ctx.close();
}

// ---------- 6. Neuladen ohne Internet (Offline-Speicher) ----------
{
  const { ctx, seite, zustand } = await neueSeite(browser, { liefert: (z) => antwort(z, { begruessungen: [besuch(START, 'Muster Verpackungen AG')] }) });
  // Warten, bis der Offline-Speicher bereit ist
  await seite.evaluate(() => navigator.serviceWorker.ready);
  await vor(seite, 3000);
  zustand.offline = true;
  await ctx.setOffline(true);
  let geladen = true;
  try { await seite.reload({ waitUntil: 'domcontentloaded' }); } catch { geladen = false; }
  await seite.clock.install({ time: new Date(START + 5 * MIN) }).catch(() => {});
  await seite.waitForTimeout(1500);
  await vor(seite, 3000);
  const s = geladen ? await sicht(seite) : { art: null, text: '' };
  pruefe('Neuladen ohne Internet: die Anzeige startet aus dem Offline-Speicher', geladen && s.art !== null, String(s.art));
  pruefe('nach dem Neuladen ohne Internet laufen die gespeicherten News, ohne Begrüssung', geladen && s.art.startsWith('news') && !s.text.includes('Muster'), s.art + ' ' + s.text);
  await ctx.close();
}

// ---------- 7. Ohne oder mit falschem Schlüssel ----------
{
  const { ctx, seite, zustand } = await neueSeite(browser, { liefert: (z) => antwort(z), mitSchluessel: false });
  const s = await sicht(seite);
  pruefe('ohne geheimen Schlüssel: nur das Logo, keine Abfrage beim Server', s.art === 'standard' && zustand.aufrufe === 0, s.art + ' ' + zustand.aufrufe);
  await ctx.close();
}
{
  const { ctx, seite, zustand } = await neueSeite(browser, { liefert: (z) => antwort(z, { begruessungen: [besuch(START, 'Muster Verpackungen AG')] }) });
  zustand.status = 401;
  await vor(seite, 65 * 1000);
  const s = await sicht(seite);
  const gespeichert = await seite.evaluate(() => window.localStorage.getItem('empfang.daten'));
  pruefe('Server lehnt den Schlüssel ab (gewechselt): nur noch das Logo, gespeicherte Inhalte sind gelöscht', s.art === 'standard' && gespeichert === 'null', s.art + ' ' + gespeichert);
  await ctx.close();
}

// ---------- 8. Betriebszeiten ----------
{
  const abend = Date.UTC(2026, 10, 25, 19, 0, 0); // Mittwoch, 20:00 Zürcher Zeit
  const { ctx, seite, zustand } = await neueSeite(browser, { zeit: abend, liefert: (z) => antwort(z) });
  pruefe('ausserhalb der Betriebszeiten bleibt der Bildschirm schwarz', (await sicht(seite)).schwarz === true);
  zustand.liefert = (z) => antwort(z, { begruessungen: [besuch(abend, 'Abendbesuch AG')] });
  await vor(seite, 65 * 1000);
  const s = await sicht(seite);
  pruefe('eine Begrüssung hat Vorrang und erscheint auch ausserhalb der Betriebszeiten', !s.schwarz && s.art === 'begruessung' && s.text.includes('Abendbesuch'), JSON.stringify(s));
  await ctx.close();
}
{
  const samstag = Date.UTC(2026, 10, 28, 9, 0, 0);
  const { ctx, seite } = await neueSeite(browser, { zeit: samstag, liefert: (z) => antwort(z) });
  pruefe('am Samstag bleibt der Bildschirm schwarz', (await sicht(seite)).schwarz === true);
  await ctx.close();
}

// ---------- 9. Leere Daten, lange Texte, Fenster der Begrüssung ----------
{
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => antwort(z, { news: [] }) });
  pruefe('gibt es gar nichts, erscheint die ruhige Standardfolie mit Logo', (await sicht(seite)).art === 'standard');
  await ctx.close();
}
{
  const lang = 'Genossenschaft für nachhaltige Verpackungslösungen Zentralschweiz';
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => antwort(z, { begruessungen: [besuch(START, lang, 'Herr Dr. Maximilian von Beispielhausen')] }) });
  const m = await seite.evaluate(() => {
    const f = document.querySelector('.ebene.sichtbar .firma'); const r = f.getBoundingClientRect();
    const b = document.querySelector('.ebene.sichtbar .besuch').getBoundingClientRect();
    const skala = document.getElementById('buehne').getBoundingClientRect().width / 1920;
    return { rechts: r.right / skala, hoehe: r.height / skala, besuchUnten: b.bottom / skala, schrift: parseInt(getComputedStyle(f).fontSize, 10) };
  });
  pruefe('ein sehr langer Firmenname passt auf den Bildschirm (Schrift wird kleiner, nichts überlappt)', m.rechts <= 1830 && m.besuchUnten <= 1050 && m.schrift < 168 && m.schrift >= 84, JSON.stringify(m));
  await ctx.close();
}
{
  // Besuch um 10:00: Die Anzeige bekommt ihn kurz vorher und schaltet genau zur Fensterzeit um
  const termin = START + 60 * MIN;
  const { ctx, seite } = await neueSeite(browser, { zeit: START + 29 * MIN, liefert: (z) => antwort(z, { begruessungen: [{ von: termin - 30 * MIN, bis: termin + 15 * MIN, firma: 'Pünktlich AG', name: null }] }) });
  pruefe('31 Minuten vor dem Termin: noch News', (await sicht(seite)).art.startsWith('news'));
  await vor(seite, 62 * 1000);
  pruefe('30 Minuten vor dem Termin: Begrüssung', (await sicht(seite)).art === 'begruessung');
  await vor(seite, 44 * MIN);
  pruefe('14 Minuten nach Terminbeginn: Begrüssung läuft noch', (await sicht(seite)).art === 'begruessung');
  await vor(seite, 75 * 1000);
  pruefe('15 Minuten nach Terminbeginn: wieder News', (await sicht(seite)).art.startsWith('news'));
  await ctx.close();
}

// ---------- 10. News im Stil von michelnews.ch und Agenda ----------
// Ein kleines Bild als data-Adresse, damit die Prüfung kein Internet braucht
const BILD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==';
const AGENDA = [
  { id: 'v0', titel: 'Schon vorbei', ort: 'Beromünster', rubrik: 'Kultur', von: '2026-11-24', bis: '2026-11-24', bild: null },
  { id: 'v1', titel: 'Lesung im Gartensaal', ort: 'Beromünster', rubrik: 'Kultur', von: '2026-11-25', bis: '2026-11-25', bild: BILD },
  { id: 'v2', titel: 'Ausstellung im Stift', ort: 'Beromünster', rubrik: 'Kultur', von: '2026-10-10', bis: '2026-11-29', bild: null },
  { id: 'v3', titel: 'Adventsmarkt', ort: 'Rickenbach', rubrik: 'Sonstiges', von: '2026-11-28', bis: '2026-11-28', bild: BILD },
  { id: 'v4', titel: 'Heimrunde <img src=x onerror="window.gehackt=1">', ort: 'Gunzwil', rubrik: 'Sport', von: '2026-11-28', bis: '2026-11-29', bild: BILD },
  { id: 'v5', titel: 'Fünfter Eintrag', ort: 'Neudorf', rubrik: 'Musik', von: '2026-12-05', bis: '2026-12-05', bild: BILD },
];
const mitAgenda = (z, zusatz = {}) => {
  const a = antwort(z, { agenda: AGENDA, ...zusatz });
  a.einstellungen = { ...a.einstellungen, agendaNachArtikeln: 2, dauerAgendaSek: 20, ...(zusatz.einstellungen || {}) };
  return a;
};
const kopf = (seite) => seite.evaluate(() => ({
  rahmen: document.getElementById('rahmen').className,
  logo: window.getComputedStyle(document.querySelector('.logo')).opacity,
  punkte: window.getComputedStyle(document.getElementById('punkte')).display,
}));
{
  const { ctx, seite, fehler } = await neueSeite(browser, { liefert: (z) => mitAgenda(z) });
  // Alle 4 Sekunden nachsehen, was läuft. Gleiche Ansichten hintereinander zählen als eine.
  const proben = [];
  let agendaSicht = null;
  let agendaKopf = null;
  let newsKopf = null;
  for (let i = 0; i < 26; i++) {
    const s = await sicht(seite);
    if (s.art.startsWith('agenda') && !agendaSicht) { agendaSicht = s; agendaKopf = await kopf(seite); }
    // Das Ausblenden des Logos dauert 0.9 Sekunden echte Zeit, darum kurz warten
    if (s.art.startsWith('news') && i === 1) { await seite.waitForTimeout(1100); newsKopf = await kopf(seite); }
    proben.push(s.art.startsWith('agenda') ? 'A' : s.text.split(' ').find((w) => /Erster|Zweiter|Dritter|Vierter/.test(w))?.[0] || '?');
    await vor(seite, 2800);
  }
  const folge = proben.filter((x, i) => i === 0 || x !== proben[i - 1]).join('');
  const ersteAgenda = proben.indexOf('A');
  let dauerAgenda = 0;
  while (proben[ersteAgenda + dauerAgenda] === 'A') dauerAgenda++;
  pruefe('Reihenfolge: zwei News, Agenda, zwei News, Agenda, dann von vorn', folge.startsWith('EZADVAE'), folge + ' (' + proben.join('') + ')');
  pruefe('die Agenda bleibt 20 Sekunden stehen, ein Artikel 12', dauerAgenda >= 4 && dauerAgenda <= 6 && proben.filter((x) => x === 'E').length >= 3, proben.join(''));
  const t = agendaSicht ? agendaSicht.text : '';
  pruefe('Agenda zeigt die nächsten vier Veranstaltungen, vergangene und die fünfte fehlen',
    agendaSicht && agendaSicht.art === 'agenda n4' && t.includes('Agenda') && t.includes('Lesung im Gartensaal') && t.includes('Ausstellung im Stift')
    && t.includes('Adventsmarkt') && t.includes('Heimrunde') && !t.includes('Schon vorbei') && !t.includes('Fünfter Eintrag'), t);
  pruefe('Agenda schreibt das Datum aus: Heute, Wochentag, Zeitraum mit «bis»',
    t.includes('Heute, 25.11.2026') && t.includes('bis 29.11.2026') && t.includes('Sa, 28.11.2026') && t.includes('28.11. bis 29.11.2026'), t);
  pruefe('Kopfzeile über der Agenda: durchsichtig, ohne Logo, ohne Punkte', agendaKopf && agendaKopf.rahmen === 'rahmen voll vagenda' && agendaKopf.logo === '0' && agendaKopf.punkte === 'none', JSON.stringify(agendaKopf));
  pruefe('Kopfzeile über den News: durchsichtig, ohne Logo', newsKopf && newsKopf.rahmen === 'rahmen voll vnews' && newsKopf.logo === '0', JSON.stringify(newsKopf));
  const r = await seite.evaluate(() => ({ gehackt: window.gehackt === 1 }));
  pruefe('Text aus der Agenda wird nie als HTML ausgeführt', !r.gehackt, JSON.stringify(r));
  pruefe('keine Skriptfehler mit Agenda', fehler.length === 0, fehler.join(' | '));
  await ctx.close();
}
{
  // News mit Bild: Das Bild füllt den Bildschirm, der Text steht im Bild
  const news = [{ id: 'x', titel: 'Artikel mit Bild', ort: 'Gunzwil', rubrik: 'Mosaik', datum: '25.11.2026', bild: BILD, bildBreite: 1200, bildHoehe: 900 }];
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => antwort(z, { news }) });
  const m = await seite.evaluate(() => {
    const a = document.querySelector('.ebene.sichtbar .ansicht');
    const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
    return {
      klasse: a.className,
      bild: a.querySelector('.bild').style.backgroundImage.slice(0, 15),
      feld: r(a.querySelector('.bildfeld')),
      titel: r(a.querySelector('.titel')),
      meta: a.querySelector('.meta').innerText,
      rubrik: a.querySelector('.rubrik').innerText,
      zeichen: !!a.querySelector('.mzeichen'),
      schrift: window.getComputedStyle(a.querySelector('.titel')).fontFamily,
    };
  });
  pruefe('News mit Bild: Bild über den ganzen Bildschirm, Titel im Bild, Rubrik, Ort und Datum, Zeichen von michelnews',
    m.klasse === 'ansicht news' && m.bild.startsWith('url("data:') && m.feld.l <= 0 && m.feld.t <= 0 && m.feld.r >= 1920 && m.feld.b >= 1080
    && m.titel.t > 540 && m.titel.b < 1080 && m.meta === 'Gunzwil - 25.11.2026' && m.rubrik === 'Mosaik' && m.zeichen && m.schrift.includes('Besley'), JSON.stringify(m));
  await ctx.close();
}
{
  // Begrüssung behält die weisse Kopfzeile mit Logo
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => mitAgenda(z, { begruessungen: [besuch(START, 'Muster Verpackungen AG')] }) });
  const k = await kopf(seite);
  pruefe('Begrüssung: Kopfzeile mit Logo bleibt, auch wenn News und Agenda bereitstehen', (await sicht(seite)).art === 'begruessung' && k.rahmen === 'rahmen' && k.logo === '1', JSON.stringify(k));
  await ctx.close();
}
{
  // Agenda ausgeschaltet: nur News
  const { ctx, seite } = await neueSeite(browser, { liefert: (z) => mitAgenda(z, { einstellungen: { agendaNachArtikeln: 0 } }) });
  const arten = [];
  for (let i = 0; i < 5; i++) { arten.push((await sicht(seite)).art.split(' ')[0]); await vor(seite, 10800); }
  pruefe('Agenda ausgeschaltet (0): es laufen nur News', arten.every((a) => a === 'news'), arten.join(','));
  await ctx.close();
}
{
  // Hochkant: zwei Karten nebeneinander, zwei darunter, Titel passen in die Karte
  const { ctx, seite } = await neueSeite(browser, { breite: 1080, hoehe: 1920, liefert: (z) => { const a = mitAgenda(z); a.news = []; return a; } });
  const m = await seite.evaluate(() => {
    const k = Array.from(document.querySelectorAll('.ebene.sichtbar .karte')).map((e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; });
    const zuBreit = Array.from(document.querySelectorAll('.ebene.sichtbar .ktitel')).filter((e) => e.scrollWidth > e.clientWidth + 1).length;
    return { hoch: document.body.className.includes('hoch'), k, zuBreit };
  });
  pruefe('Agenda hochkant: zwei Karten oben, zwei unten, alles auf dem Bildschirm',
    m.hoch && m.k.length === 4 && m.k[0].t === m.k[1].t && m.k[2].t > m.k[0].b && m.k[2].t === m.k[3].t && m.k[1].l > m.k[0].r
    && m.k.every((x) => x.l >= 0 && x.r <= 1080 && x.b <= 1920) && m.zuBreit === 0, JSON.stringify(m));
  await ctx.close();
}

await browser.close();
const fehlgeschlagen = ergebnisse.filter((e) => !e.ok);
console.log(`\n${ergebnisse.length} Prüfungen, ${ergebnisse.length - fehlgeschlagen.length} in Ordnung, ${fehlgeschlagen.length} fehlgeschlagen`);
process.exit(fehlgeschlagen.length ? 1 : 0);
