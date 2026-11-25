// Einstellungen des Empfangsbildschirms.
// Hier stehen die Standardwerte. Geänderte Werte liegen in der Datenbank
// und werden auf der Statusseite bearbeitet. Geheimnisse (Passwort, geheimer
// Link, Kalender-Link) stehen NIE hier, sondern in den geschützten
// Einstellungen von Cloudflare.

export const STANDARD = Object.freeze({
  // Begrüssung
  begruessungAn: false,        // bleibt aus, bis der Kalender mit echten Einladungen getestet ist
  vorlaufMin: 30,              // Begrüssung beginnt so viele Minuten vor dem Termin
  nachlaufMin: 15,             // und endet so viele Minuten nach Terminbeginn
  dauerBesuchSek: 10,          // Wechsel bei mehreren Besuchen gleichzeitig
  domains: ['wallimann.ch'],   // nur Termine von Organisatoren mit dieser Adresse
  kalenderMinuten: 5,          // Kalender alle 5 Minuten holen

  // News
  newsAnzahl: 10,
  newsZeiten: ['08:00', '13:00'], // News jeden Tag zu diesen Uhrzeiten holen (Zürcher Zeit)
  newsMinuten: 15,             // nur ohne Uhrzeiten: Abstand in Minuten, mindestens 15
  newsOrte: [],                // leer bedeutet alle Gemeinden
  newsRubriken: [],            // leer bedeutet alle Rubriken
  feedUrl: '',                 // Adresse des RSS-Feeds, sobald es ihn gibt

  // Solar
  solarQuelle: 'aus',          // 'aus', 'beispiel' oder 'empfang' (Werte kommen von einem Zusatzgerät)
  solarNachArtikeln: 3,        // Solar-Ansicht nach jedem dritten Artikel

  // Anzeige
  dauerAnsichtSek: 12,         // Sekunden pro News- oder Solar-Ansicht
  design: 1,                   // 1 Papier, 2 Rot, 3 Dunkel, 4 Sprechblase
  betriebTage: [1, 2, 3, 4, 5],// 1 = Montag bis 7 = Sonntag
  betriebVon: '06:30',
  betriebBis: '18:00',

  // Warnungen per E-Mail
  alarmEmail: '',              // Empfänger
  alarmAbsender: '',           // Absender (Adresse einer Domain, die bei Cloudflare liegt)
});

const SOLAR_QUELLEN = ['aus', 'beispiel', 'empfang'];

function ganzzahl(wert, min, max, ersatz) {
  const n = Math.round(Number(wert));
  if (!Number.isFinite(n)) return ersatz;
  return Math.min(max, Math.max(min, n));
}

function uhrzeit(wert, ersatz) {
  // Erlaubt sind 08:00 und die Schweizer Schreibweise 08.00
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(wert ?? '').trim());
  if (!m) return ersatz;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return ersatz;
  return String(h).padStart(2, '0') + ':' + m[2];
}

function liste(wert, maxEintraege, maxLaenge) {
  const roh = Array.isArray(wert) ? wert : String(wert ?? '').split(/[,;\n]/);
  const aus = [];
  for (const eintrag of roh) {
    const t = String(eintrag).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, maxLaenge);
    if (t && !aus.includes(t)) aus.push(t);
    if (aus.length >= maxEintraege) break;
  }
  return aus;
}

// Liste von Uhrzeiten, sortiert und ohne Doppelte. Ungültige Einträge fallen weg.
function zeitListe(wert) {
  const roh = Array.isArray(wert) ? wert : String(wert ?? '').split(/[,;\s]+/);
  const aus = [];
  for (const eintrag of roh) {
    const z = uhrzeit(eintrag, null);
    if (z && z !== '24:00' && !aus.includes(z)) aus.push(z);
    if (aus.length >= 6) break;
  }
  return aus.sort();
}

function domainListe(wert) {
  return liste(wert, 10, 100)
    .map((d) => d.toLowerCase().replace(/^@/, ''))
    .filter((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d));
}

function email(wert) {
  const t = String(wert ?? '').trim().slice(0, 200);
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(t) ? t : '';
}

function httpsAdresse(wert) {
  const t = String(wert ?? '').trim().slice(0, 500);
  if (!t) return '';
  try {
    const u = new URL(t);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

// Macht aus beliebigen Eingaben gültige Einstellungen. Unbekannte Felder fallen weg,
// ungültige Werte werden durch den Standard ersetzt oder in den erlaubten Bereich geholt.
export function pruefeEinstellungen(roh) {
  const r = roh && typeof roh === 'object' ? roh : {};
  const s = STANDARD;
  const tage = (Array.isArray(r.betriebTage) ? r.betriebTage : s.betriebTage)
    .map((t) => Math.round(Number(t)))
    .filter((t, i, alle) => t >= 1 && t <= 7 && alle.indexOf(t) === i)
    .sort((a, b) => a - b);
  const domains = r.domains === undefined ? [...s.domains] : domainListe(r.domains);
  return {
    begruessungAn: r.begruessungAn === undefined ? s.begruessungAn : r.begruessungAn === true || r.begruessungAn === 'true',
    vorlaufMin: ganzzahl(r.vorlaufMin, 0, 240, s.vorlaufMin),
    nachlaufMin: ganzzahl(r.nachlaufMin, 0, 240, s.nachlaufMin),
    dauerBesuchSek: ganzzahl(r.dauerBesuchSek, 5, 30, s.dauerBesuchSek),
    domains: domains.length ? domains : [...s.domains],
    kalenderMinuten: ganzzahl(r.kalenderMinuten, 1, 60, s.kalenderMinuten),
    newsAnzahl: ganzzahl(r.newsAnzahl, 1, 20, s.newsAnzahl),
    newsZeiten: r.newsZeiten === undefined ? [...s.newsZeiten] : zeitListe(r.newsZeiten),
    newsMinuten: ganzzahl(r.newsMinuten, 15, 240, s.newsMinuten),
    newsOrte: liste(r.newsOrte ?? s.newsOrte, 30, 60),
    newsRubriken: liste(r.newsRubriken ?? s.newsRubriken, 30, 60),
    feedUrl: httpsAdresse(r.feedUrl),
    solarQuelle: SOLAR_QUELLEN.includes(r.solarQuelle) ? r.solarQuelle : s.solarQuelle,
    solarNachArtikeln: ganzzahl(r.solarNachArtikeln, 1, 10, s.solarNachArtikeln),
    dauerAnsichtSek: ganzzahl(r.dauerAnsichtSek, 10, 15, s.dauerAnsichtSek),
    design: ganzzahl(r.design, 1, 4, s.design),
    betriebTage: tage,
    betriebVon: uhrzeit(r.betriebVon, s.betriebVon),
    betriebBis: uhrzeit(r.betriebBis, s.betriebBis),
    alarmEmail: email(r.alarmEmail),
    alarmAbsender: email(r.alarmAbsender),
  };
}

// Form, wie sie die Zeitlogik in src/lib/zeit.js erwartet
export function fuerZeitlogik(e) {
  return {
    vorlaufMin: e.vorlaufMin,
    nachlaufMin: e.nachlaufMin,
    betriebszeiten: { tage: e.betriebTage, von: e.betriebVon, bis: e.betriebBis },
  };
}
