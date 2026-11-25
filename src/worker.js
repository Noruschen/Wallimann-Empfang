// Empfangsbildschirm Wallimann: der Server (Cloudflare Worker).
//
// Adressen:
//   /anzeige/                    die Anzeige für den Fernseher (Datei aus dem Ordner public)
//   /api/anzeige                 Daten für die Anzeige, nur mit dem geheimen Schlüssel
//   /newsbild/…                  zwischengespeicherte Bilder der News
//   /status/                     Statusseite (Datei aus dem Ordner public)
//   /api/status…                 Daten und Einstellungen der Statusseite, nur mit Passwort
//   /api/solar                   nimmt Solarwerte von einem Zusatzgerät an, nur mit Schlüssel
//   /test/                       Testseite für den Browser des Fernsehers
//
// Geheimnisse stehen in den geschützten Einstellungen von Cloudflare, nie im Code:
//   ANZEIGE_SCHLUESSEL  geheimer Teil des Links für den Fernseher
//   STATUS_PASSWORT     Passwort der Statusseite
//   KALENDER_URL        geheimer ICS-Link des Outlook.com-Kalenders
//   SOLAR_SCHLUESSEL    Schlüssel für ein Zusatzgerät, das Solarwerte schickt (freiwillig)

import { pruefeEinstellungen, fuerZeitlogik } from './einstellungen.js';
import { baueAnzeigeAntwort, solarFuerAnzeige } from './antwort.js';
import {
  gleich, schluesselBrauchbar, absenderKennung, BREMSE,
  erstelleSitzung, pruefeSitzung, leseCookie, SITZUNG_MS,
} from './schutz.js';
import {
  taktgeber, kalenderAbrufen, pruefeSolarWerte, pruefeAlarme, istBeispiel, tagesBeginn,
} from './aufgaben.js';
import { mailEingerichtet } from './mail.js';
import { BEISPIEL_NEWS, BEISPIEL_VORLAUF_MIN, BEISPIEL_NACHLAUF_MIN } from './beispiel.js';
import { formatZeit, formatDatum, inBetriebszeit } from './lib/zeit.js';
import * as speicher from './speicher.js';

const COOKIE = 'empfang_sitzung';
const KOPF = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(daten, status = 200, zusatz = {}) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...KOPF, ...zusatz },
  });
}

function version(env) {
  return (env.VERSION && env.VERSION.id) || 'lokal';
}

// Einstellungen, wie sie gerade gelten. In der Testversion mit Beispieldaten sind Begrüssung
// und Solar eingeschaltet und die Begrüssung dauert kürzer, damit man beim Testen alles sieht.
function wirksameEinstellungen(env, zustand) {
  const e = pruefeEinstellungen(zustand.einstellungen);
  if (istBeispiel(env)) {
    e.begruessungAn = true;
    e.vorlaufMin = BEISPIEL_VORLAUF_MIN;
    e.nachlaufMin = BEISPIEL_NACHLAUF_MIN;
    e.kalenderMinuten = 1;
    if (e.solarQuelle === 'aus') e.solarQuelle = 'beispiel';
    e.betriebTage = [1, 2, 3, 4, 5, 6, 7];
    e.betriebVon = '00:00';
    e.betriebBis = '24:00';
  }
  return e;
}

async function ladeAlles(env) {
  await speicher.stelleTabellenSicher(env.DB);
  const zustand = await speicher.ladeZustand(env.DB);
  return { zustand, e: wirksameEinstellungen(env, zustand) };
}

// Lokal gibt es keinen Taktgeber von Cloudflare. In der Testversion stossen darum die
// Abfragen der Anzeige und der Statusseite die Aufgaben an, sobald sie fällig sind.
async function beispielTakt(env, jetzt) {
  if (!istBeispiel(env)) return;
  const { e } = await ladeAlles(env);
  await taktgeber(env, e, jetzt, { warte: async () => {} });
}

// ---------- Anzeige ----------

async function anzeige(request, env, ctx) {
  const erwartet = env.ANZEIGE_SCHLUESSEL;
  const erhalten = request.headers.get('X-Anzeige-Schluessel') || '';
  // Ohne gültigen Schlüssel gibt es keine Daten, auch keine News.
  if (!schluesselBrauchbar(erwartet) || !(await gleich(erhalten, erwartet))) {
    return json({ ok: false, fehler: 'Kein Zugriff' }, 401);
  }
  const jetzt = Date.now();
  await beispielTakt(env, jetzt);
  const { zustand, e } = await ladeAlles(env);
  const beispiel = istBeispiel(env);

  const [besuche, news] = await Promise.all([
    e.begruessungAn
      ? speicher.ladeBesuche(env.DB, jetzt - (e.nachlaufMin + 1) * 60000, jetzt + (e.vorlaufMin + 5) * 60000)
      : [],
    beispiel ? BEISPIEL_NEWS.slice(0, e.newsAnzahl) : speicher.ladeNews(env.DB, e.newsAnzahl),
  ]);

  const antwort = baueAnzeigeAntwort({
    jetzt,
    einstellungen: e,
    besuche,
    news,
    solar: zustand.solar,
    kalenderErfolg: zustand.kalender && zustand.kalender.letzterErfolg,
    version: version(env),
  });

  // Lebenszeichen der Anzeige merken (höchstens einmal pro Minute schreiben)
  const zuletzt = zustand.anzeige && zustand.anzeige.zuletzt;
  if (typeof zuletzt !== 'number' || jetzt - zuletzt > 50000) {
    ctx.waitUntil(speicher.setzeZustand(env.DB, { anzeige: { zuletzt: jetzt } }).catch(() => {}));
  }
  return json(antwort);
}

async function newsbild(pfad, env) {
  const schluessel = pfad.slice('/newsbild/'.length);
  if (!/^[a-f0-9]{24}$/.test(schluessel)) return new Response('Nicht gefunden', { status: 404, headers: KOPF });
  const eintrag = await env.BILDER.getWithMetadata(schluessel, { type: 'arrayBuffer' });
  if (!eintrag || !eintrag.value) return new Response('Nicht gefunden', { status: 404, headers: KOPF });
  const typ = (eintrag.metadata && eintrag.metadata.typ) || 'image/jpeg';
  return new Response(eintrag.value, {
    headers: {
      'Content-Type': typ,
      'Cache-Control': 'public, max-age=604800, immutable',
      'X-Robots-Tag': KOPF['X-Robots-Tag'],
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ---------- Solarwerte von einem Zusatzgerät ----------

async function solarEmpfang(request, env) {
  const erwartet = env.SOLAR_SCHLUESSEL;
  const erhalten = request.headers.get('X-Solar-Schluessel') || '';
  if (!schluesselBrauchbar(erwartet) || !(await gleich(erhalten, erwartet))) {
    return json({ ok: false, fehler: 'Kein Zugriff' }, 401);
  }
  const { e } = await ladeAlles(env);
  if (e.solarQuelle !== 'empfang') return json({ ok: false, fehler: 'Solar-Empfang ist nicht eingeschaltet' }, 409);
  let roh;
  try { roh = await request.json(); } catch { roh = null; }
  const werte = pruefeSolarWerte(roh, Date.now());
  if (!werte) return json({ ok: false, fehler: 'Ungültige Werte' }, 400);
  await speicher.setzeZustand(env.DB, { solar: werte });
  return json({ ok: true });
}

// ---------- Statusseite ----------

function gleicheHerkunft(request) {
  const herkunft = request.headers.get('Origin');
  if (!herkunft) return true; // ältere Browser schicken bei gleicher Herkunft nichts
  try { return new URL(herkunft).host === new URL(request.url).host; } catch { return false; }
}

// Das Passwort der Statusseite muss mindestens 12 Zeichen haben (Ausnahme: lokale Testversion).
const MIN_LAENGE_PASSWORT = 12;
function passwortBrauchbar(env) {
  const p = env.STATUS_PASSWORT;
  if (typeof p !== 'string' || !p) return false;
  return p.length >= MIN_LAENGE_PASSWORT || istBeispiel(env);
}

async function angemeldet(request, env) {
  if (!passwortBrauchbar(env)) return false;
  return pruefeSitzung(leseCookie(request.headers.get('Cookie'), COOKIE), env.STATUS_PASSWORT, Date.now());
}

function sitzungsCookie(request, wert, maxAlterSek) {
  const sicher = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${wert}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAlterSek}${sicher}`;
}

async function anmelden(request, env) {
  if (!gleicheHerkunft(request)) return json({ ok: false, fehler: 'Kein Zugriff' }, 403);
  const jetzt = Date.now();
  const passwort = env.STATUS_PASSWORT;
  // Ein zu kurzes Passwort wird nie angenommen (Ausnahme: lokale Testversion).
  if (!passwortBrauchbar(env)) {
    return json({ ok: false, fehler: 'Die Statusseite ist noch nicht eingerichtet (Passwort fehlt oder ist zu kurz).' }, 503);
  }
  await speicher.stelleTabellenSicher(env.DB);
  const absender = await absenderKennung(request.headers.get('CF-Connecting-IP'), passwort);
  // Zuerst zählen, dann prüfen: So lassen sich auch mit vielen gleichzeitigen Anfragen
  // nicht mehr als 5 Passwörter in 15 Minuten durchprobieren.
  const versuch = await speicher.zaehleVersuch(env.DB, absender, jetzt, BREMSE.fensterMs);
  const abweisen = (bis) => {
    const wartenSek = Math.max(1, Math.ceil((bis - jetzt) / 1000));
    return json({ ok: false, fehler: `Zu viele falsche Versuche. Bitte in ${Math.ceil(wartenSek / 60)} Minuten nochmals versuchen.` },
      429, { 'Retry-After': String(wartenSek) });
  };
  if (versuch.gesperrtBis > jetzt) return abweisen(versuch.gesperrtBis);
  if (versuch.anzahl > BREMSE.maxVersuche) {
    await speicher.sperreAbsender(env.DB, absender, jetzt + BREMSE.sperreMs);
    return abweisen(jetzt + BREMSE.sperreMs);
  }
  let eingabe = '';
  try { eingabe = String((await request.json()).passwort || ''); } catch { eingabe = ''; }
  if (!(await gleich(eingabe, passwort))) {
    if (versuch.anzahl >= BREMSE.maxVersuche) await speicher.sperreAbsender(env.DB, absender, jetzt + BREMSE.sperreMs);
    return json({ ok: false, fehler: 'Das Passwort stimmt nicht.' }, 401);
  }
  await speicher.loescheVersuch(env.DB, absender);
  const zeichen = await erstelleSitzung(passwort, jetzt);
  return json({ ok: true }, 200, { 'Set-Cookie': sitzungsCookie(request, zeichen, Math.floor(SITZUNG_MS / 1000)) });
}

function alter(ms, jetzt) {
  return typeof ms === 'number' ? { zeit: ms, text: `${formatDatum(new Date(ms))}, ${formatZeit(new Date(ms))}`, vorMin: Math.floor((jetzt - ms) / 60000) } : null;
}

async function statusDaten(env) {
  const jetzt = Date.now();
  await beispielTakt(env, jetzt);
  const { zustand, e } = await ladeAlles(env);
  const beispiel = istBeispiel(env);
  const heute = tagesBeginn(jetzt);
  const [besuche, bilderOffen] = await Promise.all([
    speicher.ladeBesuche(env.DB, heute, heute + 50 * 60 * 60 * 1000),
    speicher.zaehleOffeneBilder(env.DB),
  ]);
  const morgen = tagesBeginn(heute + 26 * 60 * 60 * 1000);
  const k = zustand.kalender || {};
  const n = zustand.news || {};
  const stoerungen = pruefeAlarme({ jetzt, e, zustand, beispiel });
  const hinweise = [];
  if (beispiel) hinweise.push('Testversion mit Beispieldaten: Besuche, News und Solarwerte sind erfunden.');
  if (!beispiel && !k.eingerichtet) hinweise.push('Der Kalender-Link ist noch nicht eingetragen. Es gibt keine Begrüssungen.');
  if (!beispiel && k.eingerichtet && k.fehler) hinweise.push('Kalender: ' + k.fehler);
  if (!e.begruessungAn) hinweise.push('Die Begrüssung ist ausgeschaltet. Am Fernseher erscheinen keine Namen.');
  if (e.begruessungAn && typeof k.letzterErfolg === 'number' && jetzt - k.letzterErfolg > 15 * 60000) {
    hinweise.push('Der letzte erfolgreiche Abruf des Kalenders ist älter als 15 Minuten. Bis zum nächsten erfolgreichen Abruf erscheinen keine Begrüssungen.');
  }
  if (n.fehler) hinweise.push('News: ' + n.fehler + ' Die zuletzt gespeicherten Artikel laufen weiter.');
  if (!beispiel && !n.fehler && typeof n.letzterErfolg === 'number' && (n.anzahl ?? 0) === 0) {
    hinweise.push('Zum eingestellten Filter passt im Moment kein Artikel. Es laufen keine News.');
  }
  if (e.solarQuelle === 'aus') hinweise.push('Die Solar-Ansicht ist ausgeschaltet.');
  if (e.solarQuelle === 'beispiel') hinweise.push('Die Solar-Ansicht zeigt Beispieldaten.');
  if (e.solarQuelle !== 'aus' && !solarFuerAnzeige(zustand.solar, jetzt, e)) {
    hinweise.push('Es gibt keine aktuellen Solarwerte (älter als 10 Minuten oder noch keine). Die Solar-Ansicht wird ausgelassen.');
  }
  if (!mailEingerichtet(env, e)) hinweise.push('Warnungen per E-Mail sind noch nicht eingerichtet. Störungen stehen nur hier.');
  for (const art of Object.keys(stoerungen)) hinweise.push('Störung: ' + stoerungen[art]);

  return {
    ok: true,
    zeit: `${formatDatum(new Date(jetzt))}, ${formatZeit(new Date(jetzt))}`,
    beispiel,
    version: version(env),
    inBetrieb: inBetriebszeit(new Date(jetzt), fuerZeitlogik(e)),
    kalender: {
      eingerichtet: beispiel || Boolean(k.eingerichtet),
      letzterErfolg: alter(k.letzterErfolg, jetzt),
      letzterVersuch: alter(k.letzterVersuch, jetzt),
      fehler: k.fehler || null,
      verworfen: k.verworfen || [],
    },
    news: {
      quelle: beispiel ? 'Beispieldaten' : (n.quelle || (e.feedUrl ? 'Feed' : 'Startseite')),
      letzterErfolg: alter(n.letzterErfolg, jetzt),
      letzterVersuch: alter(n.letzterVersuch, jetzt),
      fehler: n.fehler || null,
      anzahl: beispiel ? BEISPIEL_NEWS.length : (n.anzahl ?? 0),
      bilderOffen,
    },
    solar: {
      quelle: e.solarQuelle,
      letzterEmpfang: alter(zustand.solar && zustand.solar.zeit, jetzt),
      werte: solarFuerAnzeige(zustand.solar, jetzt, e),
    },
    anzeige: { zuletzt: alter(zustand.anzeige && zustand.anzeige.zuletzt, jetzt) },
    besuche: besuche.map((b) => ({
      tag: b.start < morgen ? 'heute' : 'morgen',
      zeit: formatZeit(new Date(b.start)),
      firma: b.firma,
      name: b.name,
      ansprechperson: b.ansprechperson,
    })),
    besucheHeute: besuche.filter((b) => b.start < morgen).length,
    mailEingerichtet: mailEingerichtet(env, e),
    hinweise,
    einstellungen: pruefeEinstellungen(zustand.einstellungen),
  };
}

async function status(request, env, pfad) {
  if (pfad === '/api/status/anmelden' && request.method === 'POST') return anmelden(request, env);
  if (pfad === '/api/status/abmelden' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': sitzungsCookie(request, 'aus', 0) });
  }
  if (!(await angemeldet(request, env))) return json({ ok: false, fehler: 'Bitte anmelden' }, 401);

  if (pfad === '/api/status' && request.method === 'GET') return json(await statusDaten(env));

  if (request.method === 'POST') {
    if (!gleicheHerkunft(request)) return json({ ok: false, fehler: 'Kein Zugriff' }, 403);
    if (pfad === '/api/status/einstellungen') {
      let roh;
      try { roh = await request.json(); } catch { return json({ ok: false, fehler: 'Ungültige Eingabe' }, 400); }
      await speicher.stelleTabellenSicher(env.DB);
      const neu = pruefeEinstellungen(roh);
      await speicher.setzeZustand(env.DB, { einstellungen: neu });
      return json({ ok: true, einstellungen: neu });
    }
    if (pfad === '/api/status/kalender-jetzt') {
      const { zustand, e } = await ladeAlles(env);
      await kalenderAbrufen(env, env.DB, e, zustand, Date.now());
      return json(await statusDaten(env));
    }
  }
  return json({ ok: false, fehler: 'Nicht gefunden' }, 404);
}

// ---------- Einstieg ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pfad = url.pathname;
    try {
      if (pfad === '/api/anzeige' && request.method === 'GET') return await anzeige(request, env, ctx);
      if (pfad.startsWith('/newsbild/') && request.method === 'GET') return await newsbild(pfad, env);
      if (pfad === '/api/solar' && request.method === 'POST') return await solarEmpfang(request, env);
      if (pfad === '/api/status' || pfad.startsWith('/api/status/')) return await status(request, env, pfad);
      if (pfad.startsWith('/api/')) return json({ ok: false, fehler: 'Nicht gefunden' }, 404);
    } catch (fehler) {
      // Nie Einzelheiten nach aussen geben
      console.log('Fehler bei', pfad, fehler && fehler.name);
      return json({ ok: false, fehler: 'Interner Fehler' }, 500);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(ereignis, env, ctx) {
    ctx.waitUntil((async () => {
      const { e } = await ladeAlles(env);
      await taktgeber(env, e, Date.now());
    })());
  },
};
