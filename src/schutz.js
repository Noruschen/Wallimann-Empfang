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

// Absender für die Bremse: Die IP-Adresse wird nicht gespeichert, nur ein Hashwert davon.
export async function absenderKennung(ip, salz) {
  return (await sha256(String(salz) + '|' + String(ip || 'unbekannt'))).slice(0, 32);
}

// ---------- Bremse bei falschen Passwörtern (pro Absender) ----------

export const BREMSE = Object.freeze({
  maxVersuche: 5,                // so viele falsche Versuche sind frei
  fensterMs: 15 * 60 * 1000,     // innerhalb dieser Zeit
  sperreMs: 15 * 60 * 1000,      // danach so lange gesperrt
});

// eintrag: { anzahl, erster, gesperrtBis } oder null
export function istGesperrt(eintrag, jetzt) {
  if (!eintrag || !eintrag.gesperrtBis) return { gesperrt: false, wartenSek: 0 };
  if (jetzt >= eintrag.gesperrtBis) return { gesperrt: false, wartenSek: 0 };
  return { gesperrt: true, wartenSek: Math.ceil((eintrag.gesperrtBis - jetzt) / 1000) };
}

export function nachFehlversuch(eintrag, jetzt) {
  let e = eintrag;
  // Fenster abgelaufen oder alte Sperre vorbei: von vorne zählen
  if (!e || jetzt - e.erster > BREMSE.fensterMs || (e.gesperrtBis && jetzt >= e.gesperrtBis)) {
    e = { anzahl: 0, erster: jetzt, gesperrtBis: 0 };
  }
  const anzahl = e.anzahl + 1;
  return {
    anzahl,
    erster: e.erster,
    gesperrtBis: anzahl >= BREMSE.maxVersuche ? jetzt + BREMSE.sperreMs : 0,
  };
}

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
