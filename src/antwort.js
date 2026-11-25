// Baut die Antwort, die sich die Anzeige jede Minute holt.
// Reine Rechenfunktionen ohne Datenbank, damit sie sich gut testen lassen.

import { zuerichTeile } from './lib/zeit.js';

export const SOLAR_MAX_ALTER_MS = 10 * 60 * 1000;
export const KALENDER_MAX_ALTER_MS = 15 * 60 * 1000;

// Versatz der Zürcher Zeit zu UTC in Minuten (Winter 60, Sommer 120)
export function versatzMin(ms) {
  const t = zuerichTeile(new Date(ms));
  const alsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.stunde, t.minute, t.sekunde);
  return Math.round((alsUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

// Zeitzonen-Angaben für die Anzeige: aktueller Versatz und die nächste Zeitumstellung
// innerhalb der kommenden 8 Tage. So stimmt die Uhr auch, wenn das Internet ausfällt.
export function zoneInfo(jetzt) {
  const jetztVersatz = versatzMin(jetzt);
  const spaeter = jetzt + 8 * 24 * 60 * 60 * 1000;
  const spaeterVersatz = versatzMin(spaeter);
  if (spaeterVersatz === jetztVersatz) return { versatzMin: jetztVersatz, wechsel: null };
  let unten = jetzt;
  let oben = spaeter;
  // Auf die Sekunde genau eingrenzen: «unten» liegt vor der Umstellung, «oben» danach
  unten = Math.floor(unten / 1000);
  oben = Math.ceil(oben / 1000);
  while (oben - unten > 1) {
    const mitte = Math.floor((unten + oben) / 2);
    if (versatzMin(mitte * 1000) === jetztVersatz) unten = mitte; else oben = mitte;
  }
  return { versatzMin: jetztVersatz, wechsel: { zeit: oben * 1000, versatzMin: spaeterVersatz } };
}

function datumSchweiz(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

function kurzKennung(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Begrüssungen, die jetzt laufen oder in den nächsten 3 Minuten beginnen.
// Mehr wird nicht herausgegeben: Die Anzeige erfährt einen Namen erst kurz vor der Begrüssung.
export function begruessungenFuerAnzeige(besuche, jetzt, e) {
  const aus = [];
  for (const b of besuche) {
    const von = b.start - e.vorlaufMin * 60000;
    const bis = b.start + e.nachlaufMin * 60000;
    if (bis > jetzt && von <= jetzt + 3 * 60000) {
      aus.push({ von, bis, firma: b.firma, name: b.name ?? null, ansprechperson: b.ansprechperson ?? null });
    }
  }
  return aus;
}

export function solarFuerAnzeige(solar, jetzt, e) {
  if (e.solarQuelle === 'aus' || !solar || typeof solar.zeit !== 'number') return null;
  if (jetzt - solar.zeit > SOLAR_MAX_ALTER_MS) return null; // lieber keine als alte Zahlen
  // Die Werte müssen zur gewählten Quelle passen: Beispielwerte erscheinen nie als echte Werte
  const sindBeispiel = solar.beispiel === true;
  if (sindBeispiel !== (e.solarQuelle === 'beispiel')) return null;
  const aus = { zeit: solar.zeit, beispiel: sindBeispiel };
  for (const feld of ['leistungKw', 'tagesertragKwh', 'gesamtMwh', 'eigenverbrauchProzent', 'co2Tonnen']) {
    if (typeof solar[feld] === 'number' && Number.isFinite(solar[feld])) aus[feld] = solar[feld];
  }
  if (typeof aus.leistungKw !== 'number') return null;
  return aus;
}

export function newsFuerAnzeige(zeilen) {
  return zeilen.map((n) => ({
    id: kurzKennung(n.link),
    titel: n.titel,
    ort: n.ort ?? null,
    rubrik: n.rubrik ?? null,
    datum: datumSchweiz(n.datum),
    bild: n.bild ? (/^https?:/.test(n.bild) ? n.bild : '/newsbild/' + n.bild) : null,
    bildBreite: n.bild_breite ?? null,
    bildHoehe: n.bild_hoehe ?? null,
  }));
}

export function baueAnzeigeAntwort({ jetzt, einstellungen: e, besuche, news, solar, kalenderErfolg, version }) {
  // Ist der letzte erfolgreiche Abruf des Kalenders älter als 15 Minuten, gibt es keine
  // Begrüssung: Ein abgesagter Besuch soll nicht stehen bleiben.
  const kalenderFrisch = typeof kalenderErfolg === 'number' && jetzt - kalenderErfolg <= KALENDER_MAX_ALTER_MS;
  return {
    ok: true,
    zeit: jetzt,
    zone: zoneInfo(jetzt),
    begruessungen: e.begruessungAn && kalenderFrisch ? begruessungenFuerAnzeige(besuche, jetzt, e) : [],
    news: newsFuerAnzeige(news),
    solar: solarFuerAnzeige(solar, jetzt, e),
    einstellungen: {
      dauerAnsichtSek: e.dauerAnsichtSek,
      dauerBesuchSek: e.dauerBesuchSek,
      solarNachArtikeln: e.solarNachArtikeln,
      design: e.design,
      drehung: e.drehung,
      betrieb: { tage: e.betriebTage, von: e.betriebVon, bis: e.betriebBis },
    },
    version: version || 'lokal',
  };
}
