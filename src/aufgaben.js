// Zeitgesteuerte Aufgaben: Kalender holen, News holen, Bilder nachladen, aufräumen, warnen.
// Cloudflare ruft den Taktgeber jede Minute auf. Jede Aufgabe entscheidet selbst,
// ob sie an der Reihe ist. Fällt eine Aufgabe aus, laufen die anderen trotzdem.

import { leseKalender } from './lib/kalender.js';
import { holeNews, leseArtikelBild } from './lib/news.js';
import { zuerichTeile, zuerichZuUtc, inBetriebszeit } from './lib/zeit.js';
import { fuerZeitlogik } from './einstellungen.js';
import { beispielKalender, beispielSolar } from './beispiel.js';
import { sha256 } from './schutz.js';
import { sendeMail } from './mail.js';
import * as speicher from './speicher.js';

const KENNUNG = 'Empfangsbildschirm Wallimann (liest Kalender und michelnews.ch)';
const MAX_KALENDER_BYTES = 3 * 1024 * 1024;
const MAX_BILD_BYTES = 6 * 1024 * 1024;
const BILD_AUFBEWAHREN_SEK = 40 * 24 * 60 * 60;
const ABSTAND_MICHELNEWS_MS = 11 * 1000; // michelnews.ch verlangt 10 Sekunden zwischen zwei Abrufen
export const ALARM_NACH_MS = 60 * 60 * 1000;

export function istBeispiel(env) {
  return env.BEISPIELDATEN === '1';
}

function faellig(letzter, minuten, jetzt) {
  return typeof letzter !== 'number' || jetzt - letzter >= minuten * 60000 - 20000;
}

async function hole(abruf, url, zeitMs = 15000) {
  return abruf(url, {
    headers: { 'User-Agent': KENNUNG, Accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(zeitMs),
  });
}

// Fehlertext für die Statusseite. Adressen werden nie übernommen, weil der Kalender-Link geheim ist.
function kurzerFehler(fehler) {
  const name = fehler && fehler.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'Zeitüberschreitung beim Abruf';
  if (fehler && fehler.oeffentlich) return fehler.message;
  return 'Abruf fehlgeschlagen';
}

function oeffentlicherFehler(text) {
  const f = new Error(text);
  f.oeffentlich = true;
  return f;
}

// Beginn des heutigen Tages in Zürcher Zeit, als Millisekunden
export function tagesBeginn(jetzt) {
  const t = zuerichTeile(new Date(jetzt));
  return zuerichZuUtc(t.jahr, t.monat, t.tag, 0, 0).getTime();
}

// ---------- Kalender ----------

export async function kalenderAbrufen(env, db, e, zustand, jetzt, abruf = fetch) {
  const alt = zustand.kalender || {};
  const neu = { ...alt, letzterVersuch: jetzt };
  const beispiel = istBeispiel(env);
  if (!beispiel && !env.KALENDER_URL) {
    await speicher.setzeZustand(db, { kalender: { eingerichtet: false, letzterVersuch: jetzt } });
    return;
  }
  try {
    let text;
    if (beispiel) {
      text = beispielKalender(jetzt);
    } else {
      const antwort = await hole(abruf, env.KALENDER_URL);
      if (!antwort.ok) throw oeffentlicherFehler(`Der Kalender-Link antwortet mit Fehler ${antwort.status}. Vermutlich ist er ungültig oder wurde zurückgesetzt.`);
      text = await antwort.text();
      if (text.length > MAX_KALENDER_BYTES) throw oeffentlicherFehler('Der Kalender ist zu gross.');
    }
    const von = new Date(tagesBeginn(jetzt));
    const bis = new Date(von.getTime() + 50 * 60 * 60 * 1000); // heute und morgen
    let ergebnis;
    try {
      ergebnis = leseKalender(text, { von, bis, domains: e.domains });
    } catch {
      throw oeffentlicherFehler('Der Kalender-Link liefert keinen gültigen Kalender. Vermutlich ist er ungültig oder wurde zurückgesetzt.');
    }
    await speicher.ersetzeBesuche(db, ergebnis.besuche);
    neu.eingerichtet = true;
    neu.letzterErfolg = jetzt;
    neu.fehler = null;
    neu.anzahl = ergebnis.besuche.length;
    neu.verworfen = ergebnis.verworfen;
  } catch (fehler) {
    neu.eingerichtet = true;
    neu.fehler = kurzerFehler(fehler);
  }
  await speicher.setzeZustand(db, { kalender: neu });
}

// ---------- News ----------

export async function newsAbrufen(env, db, e, zustand, jetzt, abruf = fetch) {
  const neu = { ...(zustand.news || {}), letzterVersuch: jetzt, quelle: e.feedUrl ? 'Feed' : 'Startseite' };
  try {
    const artikel = await holeNews({
      feedUrl: e.feedUrl || undefined,
      abruf: (url) => hole(abruf, url),
      max: e.newsAnzahl,
      filter: { orte: e.newsOrte, rubriken: e.newsRubriken },
    });
    const ausFeed = Boolean(e.feedUrl);
    await speicher.ersetzeNewsListe(db, artikel.map((a) => ({ ...a, ausFeed })), jetzt);
    neu.letzterErfolg = jetzt;
    neu.fehler = null;
    neu.anzahl = artikel.length;
  } catch (fehler) {
    // Die zuletzt gespeicherten Artikel bleiben stehen und laufen weiter.
    neu.fehler = String((fehler && fehler.message) || 'Abruf fehlgeschlagen').slice(0, 300);
  }
  await speicher.setzeZustand(db, { news: neu });
}

// Ein Schritt beim Nachladen der Bilder: entweder die Artikelseite nach dem grössten Bild
// fragen oder ein Bild holen und speichern. Gibt true zurück, wenn es etwas zu tun gab.
export async function bildSchritt(env, db, abruf = fetch) {
  const zeile = await speicher.naechsterBildSchritt(db);
  if (!zeile) return false;
  try {
    if (!zeile.artikel_geprueft) {
      const antwort = await hole(abruf, zeile.link);
      if (!antwort.ok) throw new Error('Artikelseite nicht erreichbar');
      const bild = leseArtikelBild(await antwort.text());
      await speicher.merkeArtikelBild(db, zeile.link, bild && /^https:\/\//.test(bild.bildUrl) ? bild : null);
    } else {
      const antwort = await hole(abruf, zeile.quelle_bild, 20000);
      const typ = (antwort.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!antwort.ok || !/^image\/(jpeg|png|webp|gif)$/.test(typ)) throw new Error('kein Bild');
      const daten = await antwort.arrayBuffer();
      if (daten.byteLength === 0 || daten.byteLength > MAX_BILD_BYTES) throw new Error('Bild leer oder zu gross');
      const schluessel = (await sha256(zeile.quelle_bild)).slice(0, 24);
      await env.BILDER.put(schluessel, daten, { expirationTtl: BILD_AUFBEWAHREN_SEK, metadata: { typ } });
      await speicher.merkeGespeichertesBild(db, zeile.link, schluessel);
    }
  } catch {
    await speicher.zaehleFehlversuch(db, zeile.link);
  }
  return true;
}

// ---------- Solar ----------

export async function solarAktualisieren(env, db, e, jetzt) {
  // 'empfang': Die Werte schickt ein Zusatzgerät im Firmennetz an /api/solar, hier ist nichts zu tun.
  // Eine weitere Quelle (zum Beispiel Fronius Solar.web) kann später hier dazukommen.
  if (e.solarQuelle === 'beispiel') {
    await speicher.setzeZustand(db, { solar: beispielSolar(jetzt) });
  }
}

// Prüft Werte, die ein Zusatzgerät schickt. Gibt die bereinigten Werte oder null zurück.
export function pruefeSolarWerte(roh, jetzt) {
  if (!roh || typeof roh !== 'object') return null;
  const zahl = (w, min, max) => (typeof w === 'number' && Number.isFinite(w) && w >= min && w <= max ? w : undefined);
  const leistungKw = zahl(roh.leistungKw, 0, 100000);
  if (leistungKw === undefined) return null;
  const aus = { zeit: jetzt, leistungKw }; // Es zählt der Zeitpunkt, an dem die Werte hier angekommen sind.
  const felder = { tagesertragKwh: [0, 1e7], gesamtMwh: [0, 1e7], eigenverbrauchProzent: [0, 100], co2Tonnen: [0, 1e7] };
  for (const [feld, [min, max]] of Object.entries(felder)) {
    const w = zahl(roh[feld], min, max);
    if (w !== undefined) aus[feld] = w;
  }
  return aus;
}

// ---------- Aufräumen ----------

export async function aufraeumen(db, jetzt) {
  await speicher.loescheBesucheVor(db, tagesBeginn(jetzt)); // Besuche von gestern und älter
  await speicher.raeumeVersuche(db, jetzt - 24 * 60 * 60 * 1000);
}

// ---------- Warnungen ----------

// Stellt fest, welche Störungen gerade bestehen. Reine Rechenfunktion.
export function pruefeAlarme({ jetzt, e, zustand, beispiel = false }) {
  const stoerungen = {};
  const k = zustand.kalender;
  if (!beispiel && e.begruessungAn && k && k.eingerichtet) {
    const bezug = typeof k.letzterErfolg === 'number' ? k.letzterErfolg : k.ersterVersuch;
    if (typeof bezug === 'number' && jetzt - bezug > ALARM_NACH_MS) {
      stoerungen.kalender = 'Der Kalender konnte seit über einer Stunde nicht geladen werden. '
        + (k.fehler ? `Meldung: ${k.fehler} ` : '')
        + 'Solange erscheinen am Empfang keine Begrüssungen.';
    }
  }
  const a = zustand.anzeige;
  const zeitlogik = fuerZeitlogik(e);
  if (a && typeof a.zuletzt === 'number' && jetzt - a.zuletzt > ALARM_NACH_MS
      && inBetriebszeit(new Date(jetzt), zeitlogik) && inBetriebszeit(new Date(jetzt - ALARM_NACH_MS), zeitlogik)) {
    stoerungen.anzeige = 'Die Anzeige am Empfang hat seit über einer Stunde keine Daten mehr abgeholt. '
      + 'Bitte prüfen, ob der Fernseher läuft und Internet hat.';
  }
  return stoerungen;
}

export async function alarmeVerarbeiten(env, db, e, zustand, jetzt, senden = sendeMail) {
  const stoerungen = pruefeAlarme({ jetzt, e, zustand, beispiel: istBeispiel(env) });
  const gemeldet = { ...(zustand.alarme || {}) };
  let geaendert = false;
  for (const art of ['kalender', 'anzeige']) {
    if (stoerungen[art] && !gemeldet[art]) {
      const r = await senden(env, e, `Empfangsbildschirm: Störung (${art === 'kalender' ? 'Kalender' : 'Anzeige'})`, stoerungen[art]);
      gemeldet[art] = { seit: jetzt, gesendet: r.gesendet, text: stoerungen[art] };
      geaendert = true;
    } else if (!stoerungen[art] && gemeldet[art]) {
      if (gemeldet[art].gesendet) {
        await senden(env, e, `Empfangsbildschirm: wieder in Ordnung (${art === 'kalender' ? 'Kalender' : 'Anzeige'})`, 'Die gemeldete Störung ist behoben.');
      }
      delete gemeldet[art];
      geaendert = true;
    }
  }
  if (geaendert) await speicher.setzeZustand(db, { alarme: gemeldet });
}

// ---------- Taktgeber ----------

async function sicher(aufgabe) {
  try { await aufgabe(); } catch (fehler) { console.log('Aufgabe fehlgeschlagen:', fehler && fehler.name); }
}

export async function taktgeber(env, e, jetzt, { abruf = fetch, warte } = {}) {
  const db = env.DB;
  await speicher.stelleTabellenSicher(db);
  let zustand = await speicher.ladeZustand(db);
  const beispiel = istBeispiel(env);
  const pause = warte || ((ms) => new Promise((fertig) => setTimeout(fertig, ms)));

  if (faellig(zustand.kalender && zustand.kalender.letzterVersuch, e.kalenderMinuten, jetzt)) {
    if (zustand.kalender && !zustand.kalender.ersterVersuch) zustand.kalender.ersterVersuch = jetzt;
    if (!zustand.kalender) zustand.kalender = { ersterVersuch: jetzt };
    await sicher(() => kalenderAbrufen(env, db, e, zustand, jetzt, abruf));
  }

  if (!beispiel) {
    if (faellig(zustand.news && zustand.news.letzterVersuch, e.newsMinuten, jetzt)) {
      await sicher(() => newsAbrufen(env, db, e, zustand, jetzt, abruf));
    } else {
      // Zwischen den Abrufen der Liste: Bilder nachladen, höchstens drei Abrufe pro Minute
      await sicher(async () => {
        for (let i = 0; i < 3; i++) {
          if (!(await bildSchritt(env, db, abruf))) break;
          if (i < 2) await pause(ABSTAND_MICHELNEWS_MS);
        }
      });
    }
  }

  await sicher(() => solarAktualisieren(env, db, e, jetzt));

  const minute = Math.floor(jetzt / 60000);
  if (minute % 60 === 7) await sicher(() => aufraeumen(db, jetzt));
  if (minute % 5 === 0) {
    await sicher(async () => {
      zustand = await speicher.ladeZustand(db);
      await alarmeVerarbeiten(env, db, e, zustand, jetzt);
    });
  }
}
