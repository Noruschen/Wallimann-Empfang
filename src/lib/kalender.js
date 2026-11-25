/**
 * Baustein «Kalender» für den Empfangsbildschirm.
 *
 * Liest den ICS-Text eines veröffentlichten Outlook.com-Kalenders und liefert
 * die Besuche, die der Bildschirm am Empfang begrüssen soll. Es wird so wenig
 * wie möglich weitergegeben: Firma, Name des Besuchs, Ansprechperson, Start,
 * Ende und eine Uid. Beschreibung, Ort, Teilnehmende und E-Mail-Adressen
 * werden gar nicht erst gelesen.
 *
 * Reines JavaScript ohne Abhängigkeiten und ohne Node-APIs (nur Standard-JS
 * und Intl), damit der Baustein auch in einem Cloudflare Worker läuft. Die
 * Zeitzone des Rechners hat keinen Einfluss: Es werden nur UTC-Methoden von
 * Date und Intl.DateTimeFormat mit ausdrücklicher Zeitzone verwendet.
 */

const STANDARD_ZONE = 'Europe/Zurich';
const TAG_MS = 86400000;
const STUNDE_MS = 3600000;
// Sicherheitsrand für die Vorauswahl in Ortszeit: Kein Versatz zu UTC ist grösser als 14 Stunden.
const RAND_MS = 15 * STUNDE_MS;

/** Gründe, aus denen ein Termin nicht angezeigt wird (für die Statusseite). */
export const GRUENDE = Object.freeze({
  UNVOLLSTAENDIG: 'Termin unvollständig (Datei abgeschnitten)',
  FEHLERHAFT: 'Termin fehlerhaft',
  START: 'Startzeit fehlt oder ungültig',
  GANZTAEGIG: 'Ganztägiger Termin',
  ABGESAGT: 'Abgesagter Termin',
  PRIVAT: 'Privater Termin',
  ORGANISATOR_FEHLT: 'Organisator fehlt',
  ORGANISATOR_FREMD: 'Organisator nicht aus erlaubter Domain',
  FIRMA_LEER: 'Firma leer nach Bereinigung',
  REGEL: 'Serienregel nicht unterstützt',
  ZU_LANG: 'Serie überschreitet maxWiederholungen',
  DOPPELT: 'Doppelte UID',
});
const GRUND_REIHENFOLGE = Object.values(GRUENDE);

/** Fehler für Eingaben, die gar kein Kalender sind (ungültiger Link). */
export class KalenderFehler extends Error {
  constructor(meldung) {
    super(meldung);
    this.name = 'KalenderFehler';
  }
}

/**
 * Windows-Zeitzonennamen (so schreibt sie Outlook in TZID) zu IANA.
 * Schlüssel in Kleinschreibung.
 */
const WINDOWS_ZONEN = {
  'w. europe standard time': 'Europe/Zurich',
  'central europe standard time': 'Europe/Budapest',
  'central european standard time': 'Europe/Warsaw',
  'romance standard time': 'Europe/Paris',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'utc': 'UTC',
  'coordinated universal time': 'UTC',
  'e. europe standard time': 'Europe/Chisinau',
  'fle standard time': 'Europe/Helsinki',
  'gtb standard time': 'Europe/Bucharest',
  'turkey standard time': 'Europe/Istanbul',
  'russian standard time': 'Europe/Moscow',
  'belarus standard time': 'Europe/Minsk',
  'kaliningrad standard time': 'Europe/Kaliningrad',
  'eastern standard time': 'America/New_York',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles',
  'alaskan standard time': 'America/Anchorage',
  'hawaiian standard time': 'Pacific/Honolulu',
  'us mountain standard time': 'America/Phoenix',
  'us eastern standard time': 'America/Indianapolis',
  'atlantic standard time': 'America/Halifax',
  'canada central standard time': 'America/Regina',
  'central standard time (mexico)': 'America/Mexico_City',
  'sa pacific standard time': 'America/Bogota',
  'argentina standard time': 'America/Buenos_Aires',
  'e. south america standard time': 'America/Sao_Paulo',
  'india standard time': 'Asia/Kolkata',
  'sri lanka standard time': 'Asia/Colombo',
  'pakistan standard time': 'Asia/Karachi',
  'bangladesh standard time': 'Asia/Dhaka',
  'se asia standard time': 'Asia/Bangkok',
  'china standard time': 'Asia/Shanghai',
  'taipei standard time': 'Asia/Taipei',
  'korea standard time': 'Asia/Seoul',
  'tokyo standard time': 'Asia/Tokyo',
  'singapore standard time': 'Asia/Singapore',
  'w. australia standard time': 'Australia/Perth',
  'cen. australia standard time': 'Australia/Adelaide',
  'e. australia standard time': 'Australia/Brisbane',
  'aus eastern standard time': 'Australia/Sydney',
  'new zealand standard time': 'Pacific/Auckland',
  'arabian standard time': 'Asia/Dubai',
  'arab standard time': 'Asia/Riyadh',
  'arabic standard time': 'Asia/Baghdad',
  'iran standard time': 'Asia/Tehran',
  'israel standard time': 'Asia/Jerusalem',
  'jordan standard time': 'Asia/Amman',
  'middle east standard time': 'Asia/Beirut',
  'egypt standard time': 'Africa/Cairo',
  'south africa standard time': 'Africa/Johannesburg',
  'w. central africa standard time': 'Africa/Lagos',
  'e. africa standard time': 'Africa/Nairobi',
  'morocco standard time': 'Africa/Casablanca',
  'azores standard time': 'Atlantic/Azores',
  'caucasus standard time': 'Asia/Yerevan',
  'georgian standard time': 'Asia/Tbilisi',
  'azerbaijan standard time': 'Asia/Baku',
  'west asia standard time': 'Asia/Tashkent',
  'central asia standard time': 'Asia/Almaty',
  'ekaterinburg standard time': 'Asia/Yekaterinburg',
};

/** Nur für Tests: die Tabelle der Windows-Zeitzonen. */
export const WINDOWS_ZEITZONEN = Object.freeze({ ...WINDOWS_ZONEN });

// ---------------------------------------------------------------------------
// Zeitzonen und Umrechnung Ortszeit nach UTC
// ---------------------------------------------------------------------------

const formatierer = new Map();
const zonenCache = new Map();

function formatiererFuer(zone) {
  let f = formatierer.get(zone);
  if (!f) {
    // Wirft einen RangeError bei unbekannter Zeitzone.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatierer.set(zone, f);
  }
  return f;
}

function istGueltigeZone(name) {
  if (!name || !/^[A-Za-z0-9_+\-/]+$/.test(name)) return false;
  try {
    formatiererFuer(name);
    return true;
  } catch {
    return false;
  }
}

/** Bestimmt die IANA-Zone aus einem TZID-Wert. Unbekannt ergibt Europe/Zurich. */
function zoneAufloesen(tzid) {
  if (tzid == null) return STANDARD_ZONE;
  const name = String(tzid).trim();
  if (!name) return STANDARD_ZONE;
  const schluessel = name.toLowerCase();
  if (zonenCache.has(schluessel)) return zonenCache.get(schluessel);
  let ergebnis = WINDOWS_ZONEN[schluessel] || null;
  if (!ergebnis) {
    // IANA-Name, auch mit Präfix wie «/mozilla.org/20050126_1/Europe/Zurich».
    const teile = name.split('/').filter(Boolean);
    for (let i = 0; i < teile.length && !ergebnis; i++) {
      const kandidat = teile.slice(i).join('/');
      if (istGueltigeZone(kandidat)) ergebnis = kandidat;
    }
  }
  if (!ergebnis) ergebnis = STANDARD_ZONE;
  zonenCache.set(schluessel, ergebnis);
  return ergebnis;
}

// Zwischenspeicher für Versätze je Zone und Viertelstunde. Zeitumstellungen
// liegen auf vollen Viertelstunden, innerhalb einer Viertelstunde ist der
// Versatz also gleich.
const VIERTELSTUNDE_MS = 900000;
const versatzCache = new Map();

/** Versatz der Ortszeit gegenüber UTC in Millisekunden zum Zeitpunkt utcMs. */
function versatz(zone, utcMs) {
  if (zone === 'UTC') return 0;
  const fach = Math.floor(utcMs / VIERTELSTUNDE_MS);
  const schluessel = `${zone}|${fach}`;
  const bekannt = versatzCache.get(schluessel);
  if (bekannt !== undefined) return bekannt;
  const ergebnis = versatzBerechnen(zone, fach * VIERTELSTUNDE_MS);
  if (versatzCache.size > 20000) versatzCache.clear();
  versatzCache.set(schluessel, ergebnis);
  return ergebnis;
}

function versatzBerechnen(zone, utcMs) {
  const sekunden = Math.floor(utcMs / 1000) * 1000;
  const teile = formatiererFuer(zone).formatToParts(new Date(sekunden));
  let y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0;
  for (const t of teile) {
    switch (t.type) {
      case 'year': y = Number(t.value); break;
      case 'month': mo = Number(t.value); break;
      case 'day': d = Number(t.value); break;
      case 'hour': h = Number(t.value) % 24; break;
      case 'minute': mi = Number(t.value); break;
      case 'second': s = Number(t.value); break;
      default: break;
    }
  }
  return Date.UTC(y, mo - 1, d, h, mi, s) - sekunden;
}

/**
 * Rechnet eine Ortszeit (als «Wandzeit» in Millisekunden, mit Date.UTC aus den
 * Feldern gebildet) in einen UTC-Zeitpunkt um. Doppelte Stunde bei der
 * Umstellung auf Winterzeit: frühere Möglichkeit. Fehlende Stunde bei der
 * Umstellung auf Sommerzeit: Versatz vor der Umstellung (wie RFC 5545).
 */
function zuUtc(wand, zone) {
  if (zone === 'UTC') return wand;
  const vorher = versatz(zone, wand - TAG_MS);
  const nachher = versatz(zone, wand + TAG_MS);
  const t1 = wand - vorher;
  if (vorher === nachher) {
    if (versatz(zone, t1) === vorher) return t1;
  }
  const t2 = wand - nachher;
  const ok1 = versatz(zone, t1) === vorher;
  const ok2 = versatz(zone, t2) === nachher;
  if (ok1 && ok2) return Math.min(t1, t2);
  if (ok1) return t1;
  if (ok2) return t2;
  return t1;
}

/** Ortszeit (Wandzeit) zu einem UTC-Zeitpunkt. */
function zuWand(utc, zone) {
  return utc + versatz(zone, utc);
}

function tageImMonat(jahr, monat) {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Zeilen lesen
// ---------------------------------------------------------------------------

/** Löst die Zeilenfaltung auf und liefert die logischen Zeilen. */
function entfalte(text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

// Nur diese Eigenschaften werden überhaupt gelesen. Beschreibung, Ort und
// Teilnehmende bleiben ungelesen.
const BENOETIGT = new Set([
  'BEGIN', 'END', 'UID', 'DTSTART', 'DTEND', 'DURATION', 'SUMMARY', 'STATUS', 'CLASS', 'ORGANIZER',
  'RRULE', 'EXDATE', 'RECURRENCE-ID', 'SEQUENCE', 'X-MICROSOFT-CDO-ALLDAYEVENT', 'X-MICROSOFT-MSNCALENDAR-ALLDAYEVENT',
]);
const NAME = /^[ \t]*([A-Za-z0-9-]+)[ \t]*[;:]/;

/** Zerlegt eine Inhaltszeile in Name, Parameter und Wert. Kaputte Zeile ergibt null. */
function zerlegeZeile(zeile) {
  const doppelpunkt = zeile.indexOf(':');
  if (doppelpunkt < 0) return null;
  const anfuehrung = zeile.indexOf('"');
  if (anfuehrung >= 0 && anfuehrung < doppelpunkt) return zerlegeMitAnfuehrung(zeile);
  // Schneller Weg: keine Anführungszeichen vor dem Wert.
  const kopf = zeile.slice(0, doppelpunkt);
  const semikolon = kopf.indexOf(';');
  const name = (semikolon < 0 ? kopf : kopf.slice(0, semikolon)).trim().toUpperCase();
  if (!name) return null;
  const params = Object.create(null);
  if (semikolon >= 0) {
    for (const teil of kopf.slice(semikolon + 1).split(';')) {
      const gleich = teil.indexOf('=');
      const pName = (gleich < 0 ? teil : teil.slice(0, gleich)).trim().toUpperCase();
      if (pName) params[pName] = gleich < 0 ? '' : teil.slice(gleich + 1);
    }
  }
  return { name, params, wert: zeile.slice(doppelpunkt + 1) };
}

function zerlegeMitAnfuehrung(zeile) {
  const laenge = zeile.length;
  let i = 0;
  while (i < laenge && zeile[i] !== ';' && zeile[i] !== ':') i++;
  if (i >= laenge) return null;
  const name = zeile.slice(0, i).trim().toUpperCase();
  if (!name) return null;
  const params = Object.create(null);
  while (zeile[i] === ';') {
    i++;
    const beginn = i;
    while (i < laenge && zeile[i] !== '=' && zeile[i] !== ';' && zeile[i] !== ':') i++;
    const pName = zeile.slice(beginn, i).trim().toUpperCase();
    let pWert = '';
    if (zeile[i] === '=') {
      i++;
      while (i < laenge) {
        const z = zeile[i];
        if (z === '"') {
          const ende = zeile.indexOf('"', i + 1);
          if (ende < 0) return null; // Anführungszeichen nicht geschlossen
          pWert += zeile.slice(i + 1, ende);
          i = ende + 1;
        } else if (z === ';' || z === ':') {
          break;
        } else {
          const stopp = suchePosition(zeile, i);
          pWert += zeile.slice(i, stopp);
          i = stopp;
        }
      }
    }
    if (pName) params[pName] = pWert;
  }
  if (zeile[i] !== ':') return null;
  return { name, params, wert: zeile.slice(i + 1) };
}

function suchePosition(zeile, ab) {
  let i = ab;
  while (i < zeile.length) {
    const z = zeile[i];
    if (z === '"' || z === ';' || z === ':') break;
    i++;
  }
  return i;
}

/**
 * Sammelt die Eigenschaften aller VEVENT-Blöcke. Eigenschaften verschachtelter
 * Blöcke (VALARM) und andere Blöcke (VTIMEZONE) werden übergangen.
 */
function sammleTermine(zeilen) {
  const termine = [];
  let unvollstaendig = 0;
  let kalenderGefunden = false;
  const stapel = [];
  let aktuell = null;
  for (const roh of zeilen) {
    if (!roh) continue;
    const kurz = NAME.exec(roh);
    if (!kurz) continue;
    const kurzName = kurz[1].toUpperCase();
    if (!BENOETIGT.has(kurzName)) continue;
    if (!aktuell && kurzName !== 'BEGIN' && kurzName !== 'END') continue; // ausserhalb eines VEVENT nur Blockgrenzen
    const zeile = zerlegeZeile(roh);
    if (!zeile) continue;
    if (zeile.name === 'BEGIN') {
      const typ = zeile.wert.trim().toUpperCase();
      if (typ === 'VCALENDAR') kalenderGefunden = true;
      if (typ === 'VEVENT') {
        if (aktuell) unvollstaendig++; // neuer Termin, bevor der alte beendet wurde
        aktuell = Object.create(null);
        stapel.length = 0;
      }
      stapel.push(typ);
      continue;
    }
    if (zeile.name === 'END') {
      const typ = zeile.wert.trim().toUpperCase();
      const pos = stapel.lastIndexOf(typ);
      if (pos >= 0) stapel.length = pos;
      if (typ === 'VEVENT' && aktuell) {
        termine.push(aktuell);
        aktuell = null;
      }
      continue;
    }
    if (aktuell && stapel[stapel.length - 1] === 'VEVENT') {
      (aktuell[zeile.name] || (aktuell[zeile.name] = [])).push(zeile);
    }
  }
  if (aktuell) unvollstaendig++;
  return { termine, unvollstaendig, kalenderGefunden };
}

function erste(props, name) {
  const liste = props[name];
  return liste && liste.length ? liste[0] : null;
}

/** Löst die Text-Escapes von RFC 5545 auf. */
function textWert(prop) {
  if (!prop) return '';
  return prop.wert.replace(/\\([\\;,nN])/g, (_, z) => (z === 'n' || z === 'N' ? '\n' : z));
}

// ---------------------------------------------------------------------------
// Zeiten lesen
// ---------------------------------------------------------------------------

/**
 * Liest DTSTART, DTEND, EXDATE-Werte und Ähnliches.
 * Ergebnis: { wand, zone, datum, tag } oder null.
 */
function leseZeitwert(wertRoh, params) {
  const wert = wertRoh.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(wert);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > tageImMonat(y, mo)) return null;
  const datum = m[4] === undefined || String(params.VALUE || '').trim().toUpperCase() === 'DATE';
  let h = 0, mi = 0, s = 0;
  if (!datum) {
    h = Number(m[4]);
    mi = Number(m[5]);
    s = m[6] === undefined ? 0 : Math.min(Number(m[6]), 59);
    if (h > 23 || mi > 59) return null;
  }
  const zone = datum ? STANDARD_ZONE : m[7] ? 'UTC' : zoneAufloesen(params.TZID);
  const wand = Date.UTC(y, mo - 1, d, h, mi, s);
  return { wand, zone, datum, tag: Math.floor(wand / TAG_MS) };
}

function leseZeit(prop) {
  return prop ? leseZeitwert(prop.wert, prop.params) : null;
}

function leseDauer(wert) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(wert.trim());
  if (!m || m[1] === '-') return null;
  return (
    (Number(m[2] || 0) * 7 + Number(m[3] || 0)) * TAG_MS +
    Number(m[4] || 0) * STUNDE_MS +
    Number(m[5] || 0) * 60000 +
    Number(m[6] || 0) * 1000
  );
}

/** Dauer des Termins in Millisekunden (aus DTEND oder DURATION). */
function terminDauer(props, start, startUtc) {
  const ende = leseZeit(erste(props, 'DTEND'));
  if (ende) {
    const endeUtc = zuUtc(ende.wand, ende.zone);
    return Math.max(0, endeUtc - startUtc);
  }
  const dauer = erste(props, 'DURATION');
  if (dauer) {
    const ms = leseDauer(dauer.wert);
    if (ms !== null) return ms;
  }
  return start.datum ? TAG_MS : 0;
}

function kompakt(utc) {
  return new Date(utc).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

// ---------------------------------------------------------------------------
// Betreff, Organisator und Prüfungen
// ---------------------------------------------------------------------------

const PRAEFIX = /^[\s\p{Cc}\p{Cf}]*(?:WG|AW|FWD?|RE|TR)\s*:/iu;
const ABSAGE = /^(?:abgesagt|canceled|cancelled|annulé|annule)\s*:/iu;

function entfernePraefixe(text) {
  let s = text;
  for (let i = 0; i < 50 && PRAEFIX.test(s); i++) s = s.replace(PRAEFIX, '');
  return s;
}

function istAbsageBetreff(betreff) {
  const s = betreff.normalize('NFC').replace(/^[\s\p{Cc}\p{Cf}]+/u, '');
  return ABSAGE.test(s) || ABSAGE.test(entfernePraefixe(s).replace(/^[\s\p{Cc}\p{Cf}]+/u, ''));
}

/** Gemeinsame Bereinigung für Betreff und Ansprechperson (ohne Teilen). */
function saeubere(text) {
  return text
    .normalize('NFC')
    // Bekannte HTML-Tags ganz entfernen, nicht nur ihre spitzen Klammern
    .replace(/<\/?(?:a|b|i|u|em|strong|span|div|p|br|font|h[1-6]|img|script|style|table|tr|td|ul|ol|li)\b[^<>]{0,200}>/gi, ' ')
    .replace(/(?:https?:\/\/|www\.)\S*/giu, ' ')
    .replace(/\S*@\S*/gu, ' ') // E-Mail-Adressen nie weitergeben
    .replace(/\s+/gu, ' ')
    .replace(/[^\p{L}\p{M}\p{Nd} .,\-&|]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1') // gestapelte Akzente begrenzen
    .replace(/ {2,}/g, ' ');
}

function randTrim(text) {
  return text.replace(/^[\s.,\-]+|[\s.,\-]+$/gu, '');
}

function kuerze(text, max) {
  const zeichen = Array.from(text);
  if (zeichen.length <= max) return text;
  return randTrim(zeichen.slice(0, max).join(''));
}

function bereinigeBetreff(roh, opt) {
  const s = saeubere(entfernePraefixe(roh));
  const trenner = s.indexOf('|');
  const firmaRoh = trenner < 0 ? s : s.slice(0, trenner);
  const nameRoh = trenner < 0 ? '' : s.slice(trenner + 1).replace(/\|/g, ' ').replace(/ {2,}/g, ' ');
  const firma = kuerze(randTrim(firmaRoh), opt.maxLaengeFirma);
  const name = kuerze(randTrim(nameRoh), opt.maxLaengeName);
  return { firma, name: name || null };
}

function bereinigePerson(cn, max) {
  if (cn == null) return null;
  const c = String(cn).trim();
  if (!c || c.includes('@')) return null;
  const s = kuerze(randTrim(saeubere(c).replace(/\|/g, ' ').replace(/ {2,}/g, ' ')), max);
  return s || null;
}

const ADRESSE = /^([A-Za-z0-9._+'\-]+)@([A-Za-z0-9.\-]+)$/;

function leseDomain(wert) {
  const s = wert.trim().replace(/^mailto:/i, '').trim();
  const m = ADRESSE.exec(s);
  return m ? m[2].toLowerCase() : null;
}

function istGanztaegig(props) {
  const dt = erste(props, 'DTSTART');
  if (dt) {
    if (String(dt.params.VALUE || '').trim().toUpperCase() === 'DATE') return true;
    if (/^\d{8}$/.test(dt.wert.trim())) return true;
  }
  for (const name of ['X-MICROSOFT-CDO-ALLDAYEVENT', 'X-MICROSOFT-MSNCALENDAR-ALLDAYEVENT']) {
    const p = erste(props, name);
    if (p && p.wert.trim().toUpperCase() === 'TRUE') return true;
  }
  return false;
}

/** Prüft einen Termin. Ergebnis: { grund } oder { firma, name, ansprechperson }. */
function pruefe(props, opt) {
  if (istGanztaegig(props)) return { grund: GRUENDE.GANZTAEGIG };
  const betreff = textWert(erste(props, 'SUMMARY'));
  const status = erste(props, 'STATUS');
  if ((status && status.wert.trim().toUpperCase() === 'CANCELLED') || istAbsageBetreff(betreff)) {
    return { grund: GRUENDE.ABGESAGT };
  }
  const klasse = erste(props, 'CLASS');
  const k = klasse ? klasse.wert.trim().toUpperCase() : '';
  if (k === 'PRIVATE' || k === 'CONFIDENTIAL') return { grund: GRUENDE.PRIVAT };
  const org = erste(props, 'ORGANIZER');
  let ansprechperson = null;
  if (!org || !org.wert.trim()) {
    if (opt.organisatorPflicht) return { grund: GRUENDE.ORGANISATOR_FEHLT };
  } else {
    const domain = leseDomain(org.wert);
    if (!domain || !opt.domains.includes(domain)) return { grund: GRUENDE.ORGANISATOR_FREMD };
    ansprechperson = bereinigePerson(org.params.CN, opt.maxLaengeName);
  }
  const { firma, name } = bereinigeBetreff(betreff, opt);
  if (!firma) return { grund: GRUENDE.FIRMA_LEER };
  return { firma, name, ansprechperson };
}

// ---------------------------------------------------------------------------
// Serienregeln
// ---------------------------------------------------------------------------

const WOCHENTAGE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function zahlenListe(wert, min, max, nullErlaubt) {
  const liste = [];
  for (const teil of wert.split(',')) {
    if (!/^[+-]?\d{1,3}$/.test(teil.trim())) return null;
    const n = Number(teil);
    if (Math.abs(n) < min || Math.abs(n) > max || (!nullErlaubt && n === 0)) return null;
    liste.push(n);
  }
  return liste.length ? liste : null;
}

/** Liest eine RRULE. Nicht unterstützte oder ungültige Regel ergibt null. */
function leseRegel(wert, zone) {
  const regel = {
    freq: null, interval: 1, count: null, until: null,
    byday: null, bymonthday: null, bymonth: null, bysetpos: null, wkst: 1,
  };
  const gesehen = new Set();
  for (const teilRoh of wert.split(';')) {
    const teil = teilRoh.trim();
    if (!teil) continue;
    const gleich = teil.indexOf('=');
    if (gleich < 0) return null;
    const schluessel = teil.slice(0, gleich).trim().toUpperCase();
    const v = teil.slice(gleich + 1).trim().toUpperCase();
    if (gesehen.has(schluessel) || !v) return null;
    gesehen.add(schluessel);
    switch (schluessel) {
      case 'FREQ':
        if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(v)) return null;
        regel.freq = v;
        break;
      case 'INTERVAL':
        if (!/^\d{1,4}$/.test(v) || Number(v) < 1) return null;
        regel.interval = Number(v);
        break;
      case 'COUNT':
        if (!/^\d{1,6}$/.test(v) || Number(v) < 1) return null;
        regel.count = Number(v);
        break;
      case 'UNTIL': {
        const m = /^(\d{8})(?:T(\d{6})(Z)?)?$/.exec(v);
        if (!m) return null;
        const z = leseZeitwert(v, Object.create(null));
        if (!z) return null;
        if (!m[2]) regel.until = { art: 'datum', wand: z.wand + TAG_MS - 1 };
        else if (m[3]) regel.until = { art: 'utc', utc: z.wand, wand: zuWand(z.wand, zone) };
        else regel.until = { art: 'lokal', wand: z.wand };
        break;
      }
      case 'BYDAY': {
        const liste = [];
        for (const eintrag of v.split(',')) {
          const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(eintrag.trim());
          if (!m) return null;
          const ord = m[1] === undefined ? 0 : Number(m[1]);
          if (m[1] !== undefined && (ord === 0 || Math.abs(ord) > 5)) return null;
          liste.push({ ord, tag: WOCHENTAGE[m[2]] });
        }
        regel.byday = liste;
        break;
      }
      case 'BYMONTHDAY':
        regel.bymonthday = zahlenListe(v, 1, 31, false);
        if (!regel.bymonthday) return null;
        break;
      case 'BYMONTH':
        regel.bymonth = zahlenListe(v, 1, 12, false);
        if (!regel.bymonth || regel.bymonth.some((n) => n < 0)) return null;
        break;
      case 'BYSETPOS':
        regel.bysetpos = zahlenListe(v, 1, 366, false);
        if (!regel.bysetpos) return null;
        break;
      case 'WKST':
        if (!(v in WOCHENTAGE)) return null;
        regel.wkst = WOCHENTAGE[v];
        break;
      default:
        // BYWEEKNO, BYYEARDAY, BYHOUR, BYMINUTE, BYSECOND, RSCALE und alles Unbekannte: nicht raten.
        return null;
    }
  }
  if (!regel.freq) return null;
  const mitOrdnung = regel.byday && regel.byday.some((e) => e.ord !== 0);
  if (mitOrdnung && (regel.freq === 'DAILY' || regel.freq === 'WEEKLY')) return null;
  if (regel.byday && regel.freq === 'YEARLY' && !regel.bymonth) return null;
  if (regel.bymonthday && regel.freq === 'WEEKLY') return null;
  if (regel.bysetpos) {
    if (regel.freq !== 'MONTHLY' && regel.freq !== 'YEARLY') return null;
    if (!regel.byday && !regel.bymonthday) return null;
  }
  return regel;
}

/** Tage (als Tagnummer) eines Monats, die zur Regel passen, aufsteigend. */
function monatsTage(jahr, monat, regel, standardTag) {
  const anzahl = tageImMonat(jahr, monat);
  const basis = Date.UTC(jahr, monat - 1, 1) / TAG_MS;
  if (!regel.byday && !regel.bymonthday) {
    return standardTag <= anzahl ? [basis + standardTag - 1] : [];
  }
  let tage = null;
  if (regel.bymonthday) {
    tage = new Set();
    for (const n of regel.bymonthday) {
      const t = n > 0 ? n : anzahl + n + 1;
      if (t >= 1 && t <= anzahl) tage.add(t);
    }
  }
  if (regel.byday) {
    const ersterWochentag = new Date(basis * TAG_MS).getUTCDay();
    const passend = new Set();
    for (const { ord, tag } of regel.byday) {
      const erster = 1 + ((tag - ersterWochentag + 7) % 7);
      const alle = [];
      for (let t = erster; t <= anzahl; t += 7) alle.push(t);
      if (ord === 0) alle.forEach((t) => passend.add(t));
      else {
        const t = ord > 0 ? alle[ord - 1] : alle[alle.length + ord];
        if (t !== undefined) passend.add(t);
      }
    }
    tage = tage ? new Set([...tage].filter((t) => passend.has(t))) : passend;
  }
  return [...tage].sort((a, b) => a - b).map((t) => basis + t - 1);
}

function wendeSetposAn(tage, setpos) {
  if (!setpos) return tage;
  const auswahl = new Set();
  for (const p of setpos) {
    const t = p > 0 ? tage[p - 1] : tage[tage.length + p];
    if (t !== undefined) auswahl.add(t);
  }
  return [...auswahl].sort((a, b) => a - b);
}

/**
 * Rechnet eine Serie in Einzeltermine um (nur jene mit Start im Fenster).
 * Die Wiederholung läuft in der Ortszeit des Termins; erst die Kandidaten nahe
 * am Fenster werden nach UTC umgerechnet.
 * Ergebnis: { starts: [utcMs], zuLang: boolean }.
 */
function expandiere(regel, start, opt, ausschlussUtc, ausschlussTag) {
  const sWand = start.wand;
  const sTag = start.tag;
  const zeitImTag = sWand - sTag * TAG_MS;
  const sDatum = new Date(sTag * TAG_MS);
  const sJahr = sDatum.getUTCFullYear();
  const sMonat = sDatum.getUTCMonth() + 1;
  const sTagImMonat = sDatum.getUTCDate();
  const sWochentag = sDatum.getUTCDay();
  const von = opt.von.getTime();
  const bis = opt.bis.getTime();
  const untereWand = von - RAND_MS;
  const obereWand = bis + RAND_MS;
  const untererTag = Math.floor(untereWand / TAG_MS);
  const iv = regel.interval;

  const wochenBeginn0 = sTag - ((sWochentag - regel.wkst + 7) % 7);
  const wochentage = regel.byday ? regel.byday.map((e) => e.tag) : [sWochentag];

  // Ohne COUNT darf direkt zur Periode kurz vor dem Fenster gesprungen werden.
  let k0 = 0;
  if (regel.count === null) {
    const u = new Date(untererTag * TAG_MS);
    if (regel.freq === 'DAILY') k0 = Math.floor((untererTag - sTag) / iv);
    else if (regel.freq === 'WEEKLY') k0 = Math.floor((untererTag - wochenBeginn0) / (7 * iv));
    else if (regel.freq === 'MONTHLY') {
      k0 = Math.floor((u.getUTCFullYear() * 12 + u.getUTCMonth() - (sJahr * 12 + sMonat - 1)) / iv);
    } else k0 = Math.floor((u.getUTCFullYear() - sJahr) / iv);
    if (k0 < 0) k0 = 0;
  }

  const periode = (k) => {
    if (regel.freq === 'DAILY') {
      const tag = sTag + k * iv;
      const d = new Date(tag * TAG_MS);
      const monat = d.getUTCMonth() + 1;
      let ok = true;
      if (regel.bymonth && !regel.bymonth.includes(monat)) ok = false;
      if (ok && regel.byday && !wochentage.includes(d.getUTCDay())) ok = false;
      if (ok && regel.bymonthday) {
        const dim = tageImMonat(d.getUTCFullYear(), monat);
        const t = d.getUTCDate();
        ok = regel.bymonthday.some((n) => (n > 0 ? n : dim + n + 1) === t);
      }
      return { beginn: tag, tage: ok ? [tag] : [] };
    }
    if (regel.freq === 'WEEKLY') {
      const beginn = wochenBeginn0 + k * 7 * iv;
      const tage = [];
      for (let t = beginn; t < beginn + 7; t++) {
        const d = new Date(t * TAG_MS);
        if (!wochentage.includes(d.getUTCDay())) continue;
        if (regel.bymonth && !regel.bymonth.includes(d.getUTCMonth() + 1)) continue;
        tage.push(t);
      }
      return { beginn, tage };
    }
    if (regel.freq === 'MONTHLY') {
      const index = sJahr * 12 + (sMonat - 1) + k * iv;
      const jahr = Math.floor(index / 12);
      const monat = (index % 12) + 1;
      const beginn = Date.UTC(jahr, monat - 1, 1) / TAG_MS;
      if (regel.bymonth && !regel.bymonth.includes(monat)) return { beginn, tage: [] };
      return { beginn, tage: wendeSetposAn(monatsTage(jahr, monat, regel, sTagImMonat), regel.bysetpos) };
    }
    const jahr = sJahr + k * iv;
    const beginn = Date.UTC(jahr, 0, 1) / TAG_MS;
    const monate = regel.bymonth
      ? [...regel.bymonth].sort((a, b) => a - b)
      : regel.bymonthday
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [sMonat];
    let tage = [];
    for (const monat of monate) tage = tage.concat(monatsTage(jahr, monat, regel, sTagImMonat));
    return { beginn, tage: wendeSetposAn(tage, regel.bysetpos) };
  };

  const starts = [];
  let anzahl = 0;
  let durchlaeufe = 0;
  for (let k = k0; ; k++) {
    if (++durchlaeufe > opt.maxWiederholungen) return { starts: [], zuLang: true };
    const { beginn, tage } = periode(k);
    if (beginn * TAG_MS > obereWand) break;
    for (const tag of tage) {
      const wand = tag * TAG_MS + zeitImTag;
      if (wand < sWand) continue;
      if (regel.until && wand > regel.until.wand) return { starts, zuLang: false };
      anzahl++;
      if (regel.count !== null && anzahl > regel.count) return { starts, zuLang: false };
      if (wand > obereWand) return { starts, zuLang: false };
      if (wand < untereWand) continue;
      const utc = zuUtc(wand, start.zone);
      if (regel.until && regel.until.art === 'utc' && utc > regel.until.utc) return { starts, zuLang: false };
      if (utc < von || utc >= bis) continue;
      if (ausschlussUtc.has(utc) || ausschlussTag.has(tag)) continue;
      starts.push(utc);
    }
  }
  return { starts, zuLang: false };
}

/** Sammelt EXDATE-Werte (mehrere Zeilen, mehrere Werte mit Komma). */
function sammleAusnahmen(props, ausschlussUtc, ausschlussTag) {
  for (const prop of props.EXDATE || []) {
    for (const wert of prop.wert.split(',')) {
      const z = leseZeitwert(wert, prop.params);
      if (!z) continue;
      if (z.datum) ausschlussTag.add(z.tag);
      else ausschlussUtc.add(zuUtc(z.wand, z.zone));
    }
  }
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

function pruefeOptionen(optionen) {
  const o = optionen || {};
  const istDatum = (d) => d instanceof Date && !Number.isNaN(d.getTime());
  if (!istDatum(o.von)) throw new TypeError('Option «von» muss ein gültiges Datum sein.');
  if (!istDatum(o.bis)) throw new TypeError('Option «bis» muss ein gültiges Datum sein.');
  const ganzzahl = (wert, standard) => (Number.isInteger(wert) && wert > 0 ? wert : standard);
  const domains = Array.isArray(o.domains) ? o.domains : ['wallimann.ch'];
  return {
    von: o.von,
    bis: o.bis,
    domains: domains.filter((d) => typeof d === 'string').map((d) => d.trim().toLowerCase()).filter(Boolean),
    organisatorPflicht: o.organisatorPflicht !== false,
    maxLaengeFirma: ganzzahl(o.maxLaengeFirma, 60),
    maxLaengeName: ganzzahl(o.maxLaengeName, 60),
    maxWiederholungen: ganzzahl(o.maxWiederholungen, 1000),
  };
}

/** Kurzer Prüfwert (FNV-1a, 32 Bit) für Uids, die nicht unverändert weitergegeben werden. */
function pruefwert(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Uid für die Rückgabe: ohne @ und ohne Sonderzeichen, sonst als Prüfwert. */
function uidFuerAusgabe(uid) {
  return /^[A-Za-z0-9._\-]{1,200}$/.test(uid) ? uid : `uid-${pruefwert(uid)}`;
}

function sequenz(props) {
  const p = erste(props, 'SEQUENCE');
  const n = p ? Number(p.wert.trim()) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Liest den ICS-Text und liefert die Besuche im Fenster.
 *
 * @param {string} icsText
 * @param {{von: Date, bis: Date, domains?: string[], organisatorPflicht?: boolean,
 *   maxLaengeFirma?: number, maxLaengeName?: number, maxWiederholungen?: number}} optionen
 * @returns {{besuche: Array<{uid: string, start: string, ende: string, firma: string,
 *   name: string|null, ansprechperson: string|null}>, verworfen: Array<{grund: string, anzahl: number}>}}
 */
export function leseKalender(icsText, optionen) {
  const opt = pruefeOptionen(optionen);
  if (typeof icsText !== 'string' || !icsText.trim()) {
    throw new KalenderFehler('Ungültiger Kalender: Der ICS-Link hat keinen Text geliefert.');
  }
  const { termine, unvollstaendig, kalenderGefunden } = sammleTermine(entfalte(icsText));
  if (!kalenderGefunden) {
    throw new KalenderFehler(
      'Ungültiger Kalender: «BEGIN:VCALENDAR» fehlt. Der ICS-Link liefert keinen Kalender, vermutlich ist er falsch oder nicht mehr veröffentlicht.',
    );
  }

  const von = opt.von.getTime();
  const bis = opt.bis.getTime();
  const zaehler = new Map();
  const verwirf = (grund, n = 1) => zaehler.set(grund, (zaehler.get(grund) || 0) + n);
  if (unvollstaendig) verwirf(GRUENDE.UNVOLLSTAENDIG, unvollstaendig);
  const besuche = [];
  const nimm = (uid, startUtc, dauer, ergebnis) => {
    if (ergebnis.grund) {
      verwirf(ergebnis.grund);
      return;
    }
    besuche.push({
      uid,
      start: new Date(startUtc).toISOString(),
      ende: new Date(startUtc + dauer).toISOString(),
      firma: ergebnis.firma,
      name: ergebnis.name,
      ansprechperson: ergebnis.ansprechperson,
    });
  };

  // 1. Vorbereiten: Serien und Einzeltermine von Ersatzterminen (RECURRENCE-ID) trennen.
  const haupttermine = new Map();
  const ersatztermine = new Map();
  termine.forEach((props, index) => {
    try {
      const start = leseZeit(erste(props, 'DTSTART'));
      if (!start) {
        verwirf(GRUENDE.START);
        return;
      }
      const uidProp = erste(props, 'UID');
      const uid = uidProp && uidProp.wert.trim() ? uidProp.wert.trim() : null;
      const ridProp = erste(props, 'RECURRENCE-ID');
      const eintrag = { props, start, uid: uid ?? `ohne-uid-${index}`, ohneUid: !uid, index };
      if (ridProp && uid) {
        const rid = leseZeit(ridProp);
        if (!rid) {
          verwirf(GRUENDE.FEHLERHAFT);
          return;
        }
        eintrag.rid = rid;
        eintrag.ridUtc = zuUtc(rid.wand, rid.zone);
        const schluessel = `${uid}\u0000${eintrag.ridUtc}`;
        const alt = ersatztermine.get(schluessel);
        if (alt && sequenz(alt.props) >= sequenz(props)) verwirf(GRUENDE.DOPPELT);
        else {
          if (alt) verwirf(GRUENDE.DOPPELT);
          ersatztermine.set(schluessel, eintrag);
        }
        return;
      }
      const schluessel = eintrag.ohneUid ? `\u0000${index}` : uid;
      const alt = haupttermine.get(schluessel);
      if (alt && sequenz(alt.props) >= sequenz(props)) verwirf(GRUENDE.DOPPELT);
      else {
        if (alt) verwirf(GRUENDE.DOPPELT);
        haupttermine.set(schluessel, eintrag);
      }
    } catch {
      verwirf(GRUENDE.FEHLERHAFT);
    }
  });

  // Ersetzte Einzeltermine je UID.
  const ersetzt = new Map();
  for (const e of ersatztermine.values()) {
    let a = ersetzt.get(e.uid);
    if (!a) ersetzt.set(e.uid, (a = { utc: new Set(), tag: new Set() }));
    if (e.rid.datum) a.tag.add(e.rid.tag);
    else a.utc.add(e.ridUtc);
  }

  // 2. Haupttermine und Serien.
  for (const e of haupttermine.values()) {
    try {
      const { props, start } = e;
      const regeln = props.RRULE || [];
      if (regeln.length === 0) {
        // Vorauswahl in Ortszeit, damit nur Termine nahe am Fenster umgerechnet werden.
        if (start.wand < von - RAND_MS || start.wand > bis + RAND_MS) continue;
        const startUtc = zuUtc(start.wand, start.zone);
        if (startUtc >= von && startUtc < bis) {
          nimm(uidFuerAusgabe(e.uid), startUtc, terminDauer(props, start, startUtc), pruefe(props, opt));
        }
        continue;
      }
      const regel = regeln.length === 1 ? leseRegel(regeln[0].wert, start.zone) : null;
      if (!regel) {
        if (start.wand < bis + RAND_MS) verwirf(GRUENDE.REGEL);
        continue;
      }
      const ausschlussUtc = new Set();
      const ausschlussTag = new Set();
      sammleAusnahmen(props, ausschlussUtc, ausschlussTag);
      const a = e.ohneUid ? null : ersetzt.get(e.uid);
      if (a) {
        a.utc.forEach((u) => ausschlussUtc.add(u));
        a.tag.forEach((t) => ausschlussTag.add(t));
      }
      const { starts, zuLang } = expandiere(regel, start, opt, ausschlussUtc, ausschlussTag);
      if (zuLang) {
        verwirf(GRUENDE.ZU_LANG);
        continue;
      }
      if (!starts.length) continue;
      const uidAus = uidFuerAusgabe(e.uid);
      const dauer = terminDauer(props, start, zuUtc(start.wand, start.zone));
      const ergebnis = pruefe(props, opt);
      for (const s of starts) nimm(`${uidAus}_${kompakt(s)}`, s, dauer, ergebnis);
    } catch {
      verwirf(GRUENDE.FEHLERHAFT);
    }
  }

  // 3. Ersatztermine (verschobene oder geänderte Einzeltermine einer Serie).
  for (const e of ersatztermine.values()) {
    try {
      const haupt = haupttermine.get(e.uid);
      let props = e.props;
      if (haupt) {
        // Fehlende Angaben erbt der Ersatztermin von der Serie.
        props = Object.assign(Object.create(null), e.props);
        for (const name of ['ORGANIZER', 'SUMMARY', 'CLASS', 'STATUS']) {
          if (!props[name] && haupt.props[name]) props[name] = haupt.props[name];
        }
      }
      if (e.start.wand < von - RAND_MS || e.start.wand > bis + RAND_MS) continue;
      const startUtc = zuUtc(e.start.wand, e.start.zone);
      if (startUtc < von || startUtc >= bis) continue;
      const dauer = terminDauer(props, e.start, startUtc);
      nimm(`${uidFuerAusgabe(e.uid)}_${kompakt(e.ridUtc)}`, startUtc, dauer, pruefe(props, opt));
    } catch {
      verwirf(GRUENDE.FEHLERHAFT);
    }
  }

  besuche.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  const verworfen = GRUND_REIHENFOLGE.filter((g) => zaehler.has(g)).map((grund) => ({ grund, anzahl: zaehler.get(grund) }));
  return { besuche, verworfen };
}
