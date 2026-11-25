// Zeitlogik für den Empfangsbildschirm.
// Alle Rechnungen laufen in der Zeitzone Europe/Zurich über Intl.DateTimeFormat.
// Die Uhr und die Zeitzone des Geräts haben keinen Einfluss.

const ZONE = 'Europe/Zurich';
const MINUTE_MS = 60_000;
const TAG_MS = 86_400_000;

const teileFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

const WOCHENTAGE = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];

export const STANDARD_EINSTELLUNGEN = {
  vorlaufMin: 30,
  nachlaufMin: 15,
  betriebszeiten: { tage: [1, 2, 3, 4, 5], von: '06:30', bis: '18:00' },
};

// Nimmt Date oder ISO-String entgegen und liefert ein gültiges Date.
function alsDate(wert) {
  const d = wert instanceof Date ? wert : new Date(wert);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError('Ungültiger Zeitpunkt: ' + String(wert));
  }
  return d;
}

// Ergänzt fehlende Einstellungen mit den Standardwerten.
function mitStandard(einstellungen) {
  const e = einstellungen ?? {};
  return {
    vorlaufMin: e.vorlaufMin ?? STANDARD_EINSTELLUNGEN.vorlaufMin,
    nachlaufMin: e.nachlaufMin ?? STANDARD_EINSTELLUNGEN.nachlaufMin,
    betriebszeiten: {
      ...STANDARD_EINSTELLUNGEN.betriebszeiten,
      ...(e.betriebszeiten ?? {}),
    },
  };
}

/**
 * Zerlegt einen Zeitpunkt in Zürcher Ortszeit.
 * wochentag: 1 = Montag bis 7 = Sonntag.
 */
export function zuerichTeile(datum) {
  const d = alsDate(datum);
  const t = {};
  for (const { type, value } of teileFormat.formatToParts(d)) {
    if (type !== 'literal') t[type] = Number(value);
  }
  const jsTag = new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay();
  return {
    jahr: t.year,
    monat: t.month,
    tag: t.day,
    stunde: t.hour,
    minute: t.minute,
    sekunde: t.second,
    wochentag: jsTag === 0 ? 7 : jsTag,
  };
}

// Versatz Zürich minus UTC in Millisekunden zum gegebenen Zeitpunkt.
function versatzMs(ms) {
  const t = zuerichTeile(new Date(ms));
  const wand = Date.UTC(t.jahr, t.monat - 1, t.tag, t.stunde, t.minute, t.sekunde);
  return wand - Math.floor(ms / 1000) * 1000;
}

/**
 * Wandelt eine Zürcher Ortszeit in einen UTC-Zeitpunkt.
 * Nicht existierende Zeit (Frühling): wird um die Lücke nach vorne geschoben,
 * also 02:30 wird 03:30. Doppelte Zeit (Herbst): erstes Vorkommen.
 */
export function zuerichZuUtc(jahr, monat, tag, stunde = 0, minute = 0) {
  const wand = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const vor = versatzMs(wand - TAG_MS);
  const nach = versatzMs(wand + TAG_MS);
  const kandidaten = [...new Set([vor, nach])]
    .map((v) => ({ v, ms: wand - v }))
    .filter(({ v, ms }) => versatzMs(ms) === v)
    .map(({ ms }) => ms);
  if (kandidaten.length > 0) return new Date(Math.min(...kandidaten));
  // Lücke bei der Umstellung auf Sommerzeit: mit dem Winterversatz rechnen.
  return new Date(wand - vor);
}

/**
 * Ist die Begrüssung für diesen Besuch aktiv?
 * Fenster: start minus vorlaufMin (einschliesslich) bis start plus nachlaufMin (ausschliesslich).
 */
export function begruessungAktiv(besuch, jetzt, einstellungen) {
  const e = mitStandard(einstellungen);
  const start = alsDate(besuch.start).getTime();
  const j = alsDate(jetzt).getTime();
  return j >= start - e.vorlaufMin * MINUTE_MS && j < start + e.nachlaufMin * MINUTE_MS;
}

/**
 * Aktive Besuche, sortiert nach Start, bei gleichem Start nach Firma.
 */
export function aktiveBesuche(besuche, jetzt, einstellungen) {
  return besuche
    .filter((b) => begruessungAktiv(b, jetzt, einstellungen))
    .sort((a, b) => {
      const diff = alsDate(a.start).getTime() - alsDate(b.start).getTime();
      if (diff !== 0) return diff;
      return String(a.firma ?? '').localeCompare(String(b.firma ?? ''), 'de');
    });
}

// «HH:MM» in Minuten seit Mitternacht.
function minutenVonUhrzeit(text) {
  const [h, m] = String(text).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Liegt der Zeitpunkt in der Betriebszeit (Zürcher Ortszeit)?
 * von einschliesslich, bis ausschliesslich, nur an den Wochentagen in tage.
 */
export function inBetriebszeit(jetzt, einstellungen) {
  const { betriebszeiten } = mitStandard(einstellungen);
  const t = zuerichTeile(jetzt);
  if (!betriebszeiten.tage.includes(t.wochentag)) return false;
  const minuten = t.stunde * 60 + t.minute;
  return (
    minuten >= minutenVonUhrzeit(betriebszeiten.von) &&
    minuten < minutenVonUhrzeit(betriebszeiten.bis)
  );
}

/**
 * 'begruessung' hat Vorrang (auch ausserhalb der Betriebszeit),
 * sonst 'inhalt' in der Betriebszeit, sonst 'schwarz'.
 */
export function anzeigeModus(besuche, jetzt, einstellungen) {
  if (aktiveBesuche(besuche, jetzt, einstellungen).length > 0) return 'begruessung';
  return inBetriebszeit(jetzt, einstellungen) ? 'inhalt' : 'schwarz';
}

/**
 * Ist der Zürcher Kalendertag des Terminbeginns vor dem heutigen Zürcher Kalendertag?
 */
export function istAbgelaufen(besuch, jetzt) {
  const a = zuerichTeile(besuch.start);
  const h = zuerichTeile(jetzt);
  const schluessel = (t) => t.jahr * 10000 + t.monat * 100 + t.tag;
  return schluessel(a) < schluessel(h);
}

const zweistellig = (n) => String(n).padStart(2, '0');

/** '11.11.2026' in Zürcher Zeit. */
export function formatDatum(datum) {
  const t = zuerichTeile(datum);
  return `${zweistellig(t.tag)}.${zweistellig(t.monat)}.${t.jahr}`;
}

/** '14:30' in Zürcher Zeit. */
export function formatZeit(datum) {
  const t = zuerichTeile(datum);
  return `${zweistellig(t.stunde)}:${zweistellig(t.minute)}`;
}

/** 'Mittwoch' in Zürcher Zeit. */
export function wochentagName(datum) {
  return WOCHENTAGE[zuerichTeile(datum).wochentag - 1];
}
