// Beispieldaten für die Testversion. Sie werden nur verwendet, wenn die Einstellung
// BEISPIELDATEN auf "1" steht (beim lokalen Start mit «npm start»).
// Alle Firmen und Personen sind erfunden.

import { zuerichTeile } from './lib/zeit.js';

function icsZeit(ms) {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}T${z(d.getUTCHours())}${z(d.getUTCMinutes())}00Z`;
}

function termin(uid, startMs, betreff, organisator, zusatz = '') {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${icsZeit(startMs)}`,
    `DTEND:${icsZeit(startMs + 60 * 60000)}`,
    `SUMMARY:${betreff}`,
    `ORGANIZER;CN=${organisator.name}:mailto:${organisator.adresse}`,
    zusatz,
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

// Ein Kalender im Format von Outlook mit Terminen rund um «jetzt».
// Er durchläuft denselben Weg wie später der echte Kalender-Link.
export function beispielKalender(jetzt) {
  const min = 60000;
  const fischer = { name: 'Alexander Fischer', adresse: 'alexander.fischer@wallimann.ch' };
  const muster = { name: 'Petra Muster', adresse: 'petra.muster@wallimann.ch' };
  // Alle 20 Minuten beginnt ein neuer Beispielbesuch, damit Begrüssung und News im Test abwechseln:
  // 10 Minuten Begrüssung (Vorlauf und Nachlauf sind im Beispiel verkürzt), dann 10 Minuten News.
  const block = Math.floor(jetzt / (20 * min)) * 20 * min;
  const termine = [
    termin('beispiel-1@empfang', block + 5 * min, 'Muster Verpackungen AG | Frau Anna Beispiel', fischer),
    termin('beispiel-2@empfang', block + 5 * min, 'Beispiel Handwerk GmbH', muster),
    termin('beispiel-3@empfang', block + 25 * min, 'Beispiel Treuhand GmbH | Herr Peter Probe', fischer),
    termin('beispiel-fremd@empfang', block + 5 * min, 'Fremde Firma https://example.com', { name: 'Unbekannt', adresse: 'jemand@example.com' }),
    termin('beispiel-privat@empfang', block + 5 * min, 'Zahnarzt', fischer, 'CLASS:PRIVATE'),
    termin('beispiel-abgesagt@empfang', block + 5 * min, 'Abgesagt: Muster Druck AG', muster, 'STATUS:CANCELLED'),
  ];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Empfang Wallimann//Beispiel//DE', ...termine, 'END:VCALENDAR'].join('\r\n');
}

// Im Beispiel dauert die Begrüssung kürzer, damit man beim Testen beides sieht.
export const BEISPIEL_VORLAUF_MIN = 5;
export const BEISPIEL_NACHLAUF_MIN = 5;

const BILD = 'https://michelnews.ch/fileadmin/_processed_/';

// Beispielartikel von michelnews.ch vom 25.11.2026. Die Bilder werden direkt von dort geladen.
export const BEISPIEL_NEWS = [
  { link: 'https://michelnews.ch/news/zauberhafte-stimmung-am-raebeliechtli-umzug', titel: 'Zauberhafte Stimmung am Räbeliechtli-Umzug', ort: 'Beromünster', rubrik: 'Vereinsleben', datum: '2026-11-24',
    bild: BILD + 'a/1/csm_Zauberhafte_Stimmung_am_R%C3%A4beliechtli-Umzug_R%C3%A4beliechtli_26_c4423418e9.jpeg', bild_breite: 1200, bild_hoehe: 900 },
  { link: 'https://michelnews.ch/news/unangemeldete-brandschutzkontrollen', titel: 'Unangemeldete Brandschutzkontrollen', ort: 'Kanton Luzern', rubrik: 'Blaulicht', datum: '2026-11-25',
    bild: BILD + '8/7/csm_Unangemeldete_Brandschutzkontrollen__Rettungszeichen_Feuerl%C3%B6scher_5aff5e55ae.png', bild_breite: 1200, bild_hoehe: 800 },
  { link: 'https://michelnews.ch/news/maennerriege-rickenbach-feiert-turniersieg', titel: 'Männerriege Rickenbach feiert Turniersieg', ort: 'Rickenbach', rubrik: 'Sport', datum: '2026-11-24',
    bild: BILD + '5/4/csm_01_8a140bf472.jpg', bild_breite: 1200, bild_hoehe: 730 },
  { link: 'https://michelnews.ch/news/messerspitze-safran', titel: '«Eine Messerspitze Safran» mit Michelsämter Note', ort: 'Beromünster', rubrik: 'Kultur', datum: '2026-11-24',
    bild: BILD + 'a/f/csm_Arancini_039_8ccb1cf1a4.jpg', bild_breite: 720, bild_hoehe: 600 },
  { link: 'https://michelnews.ch/news/erfolgreiches-pilotprojekt-geht-zu-ende', titel: 'Erfolgreiches Pilotprojekt geht zu Ende', ort: 'Eich', rubrik: 'Aus der Gemeinde', datum: '2026-11-24',
    bild: BILD + '1/8/csm_20250527_095538_c2ac6fd049.jpg', bild_breite: 1200, bild_hoehe: 555 },
];

// Erfundene Solarwerte, die dem Tagesverlauf folgen: nachts 0, mittags am höchsten.
export function beispielSolar(jetzt) {
  const t = zuerichTeile(new Date(jetzt));
  const stunde = t.stunde + t.minute / 60;
  const spitzeKw = 95;
  const auf = 7.5;
  const unter = 17.5;
  let leistung = 0;
  let ertrag = 0;
  const tagesSumme = (spitzeKw * (unter - auf) * 2) / Math.PI; // Fläche unter der Sinuskurve
  if (stunde > auf && stunde < unter) {
    const anteil = (stunde - auf) / (unter - auf);
    leistung = spitzeKw * Math.sin(Math.PI * anteil);
    ertrag = (tagesSumme * (1 - Math.cos(Math.PI * anteil))) / 2;
  } else if (stunde >= unter) {
    ertrag = tagesSumme;
  }
  return {
    zeit: jetzt,
    leistungKw: Math.round(leistung * 10) / 10,
    tagesertragKwh: Math.round(ertrag),
    gesamtMwh: 1284,
  };
}
