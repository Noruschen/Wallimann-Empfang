// Schutz: Vergleich von Geheimnissen, Bremse bei falschen Passwörtern, Sitzung der Statusseite.
// Läuft im Cloudflare Worker und in Node 22 (beide kennen crypto.subtle).

const kodierer = new TextEncoder();

function hex(puffer) {
  return [...new Uint8Array(puffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', kodierer.encode(String(text))));
}

// Vergleicht zwei Geheimnisse, ohne über die Rechenzeit etwas zu verraten.
// Beide Seiten werden zuerst gehasht, dann Zeichen für Zeichen ohne Abbruch verglichen.
export async function gleich(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let unterschied = 0;
  for (let i = 0; i < ha.length; i++) unterschied |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return unterschied === 0;
}

// Ein geheimer Schlüssel gilt nur, wenn er lang genug ist. So kann eine leere oder
// vergessene Einstellung die Anzeige nie versehentlich für alle öffnen.
export const MIN_LAENGE_SCHLUESSEL = 20;
export function schluesselBrauchbar(s) {
  return typeof s === 'string' && s.length >= MIN_LAENGE_SCHLUESSEL;
}

// Bei IPv6 hat ein einzelner Anschluss sehr viele Adressen. Darum zählt dort das Netz
// (die ersten vier Blöcke der Adresse), nicht die einzelne Adresse.
export function absenderNetz(ip) {
  let t = String(ip || 'unbekannt').trim().toLowerCase();
  // IPv4-Adresse in IPv6-Schreibweise (::ffff:203.0.113.5): Es zählt die IPv4-Adresse
  const eingebettet = /^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (eingebettet) t = eingebettet[1];
  if (!t.includes(':')) return t;
  const [vorn, hinten] = t.split('::');
  const a = vorn ? vorn.split(':') : [];
  const b = hinten !== undefined && hinten ? hinten.split(':') : [];
  const fehlend = hinten !== undefined ? Math.max(0, 8 - a.length - b.length) : 0;
  const alle = [...a, ...Array(fehlend).fill('0'), ...b].map((g) => g.replace(/^0+(?=.)/, ''));
  return alle.slice(0, 4).join(':') + '::/64';
}

// Absender für die Bremse: Die IP-Adresse wird nicht gespeichert, nur ein Hashwert davon.
export async function absenderKennung(ip, salz) {
  return (await sha256(String(salz) + '|' + absenderNetz(ip))).slice(0, 32);
}

// ---------- Bremse bei falschen Passwörtern (pro Absender) ----------

export const BREMSE = Object.freeze({
  maxVersuche: 5,                // so viele falsche Versuche sind frei
  fensterMs: 15 * 60 * 1000,     // innerhalb dieser Zeit
  sperreMs: 15 * 60 * 1000,      // danach so lange gesperrt
});

// Gezählt wird in der Datenbank in einem einzigen Schritt (siehe speicher.js, zaehleVersuch).
// So gehen auch bei vielen gleichzeitigen Versuchen keine Zählungen verloren.

// ---------- Sitzung der Statusseite ----------

async function signiere(text, geheimnis) {
  const schluessel = await crypto.subtle.importKey(
    'raw', kodierer.encode(geheimnis), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', schluessel, kodierer.encode(text)));
}

export const SITZUNG_MS = 12 * 60 * 60 * 1000;

// Das Sitzungszeichen besteht aus Ablaufzeit und Unterschrift. Die Unterschrift hängt vom
// Passwort ab: Wird das Passwort gewechselt, sind alle alten Sitzungen sofort ungültig.
export async function erstelleSitzung(geheimnis, jetzt, dauerMs = SITZUNG_MS) {
  const ablauf = String(jetzt + dauerMs);
  return ablauf + '.' + (await signiere('sitzung|' + ablauf, geheimnis));
}

export async function pruefeSitzung(zeichen, geheimnis, jetzt) {
  if (typeof zeichen !== 'string' || !geheimnis) return false;
  const punkt = zeichen.indexOf('.');
  if (punkt < 1) return false;
  const ablauf = zeichen.slice(0, punkt);
  if (!/^\d{10,16}$/.test(ablauf) || Number(ablauf) <= jetzt) return false;
  const erwartet = await signiere('sitzung|' + ablauf, geheimnis);
  return gleich(zeichen.slice(punkt + 1), erwartet);
}

export function leseCookie(kopfzeile, name) {
  for (const teil of String(kopfzeile || '').split(';')) {
    const i = teil.indexOf('=');
    if (i > 0 && teil.slice(0, i).trim() === name) return teil.slice(i + 1).trim();
  }
  return null;
}
