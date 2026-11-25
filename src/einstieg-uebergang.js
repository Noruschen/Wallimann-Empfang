// Übergangs-Einstieg für die erste Veröffentlichung von Hand.
//
// Üblich ist, dass Cloudflare die Dateien aus dem Ordner «public» selbst ausliefert
// (siehe wrangler.jsonc, «assets»). Das geht nur mit dem Werkzeug wrangler oder über die
// automatische Veröffentlichung von GitHub aus. Solange die noch nicht eingerichtet ist,
// holt dieser Einstieg dieselben Dateien aus dem öffentlichen GitHub-Projekt, fest auf einen
// geprüften Stand, und reicht sie dem Server (src/worker.js) so weiter, als kämen sie von Cloudflare.
// Am Server selbst ändert sich nichts. Sobald die automatische Veröffentlichung läuft,
// wird diese Datei nicht mehr gebraucht.

import app from './worker.js';

// Die Kennung des geprüften Stands auf GitHub steht in der Einstellung STAND (kein Geheimnis).
// Nur eine vollständige Kennung wird angenommen, damit nie ein beliebiger Zweig ausgeliefert wird.
const PROJEKT = 'https://raw.githubusercontent.com/Noruschen/Wallimann-Empfang/';
const STAND_FORM = /^[a-f0-9]{40}$/;

const TYPEN = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  woff: 'font/woff',
  png: 'image/png',
};

// Nur diese Ordner und Dateiarten werden ausgeliefert. Alles andere gibt es nicht.
const ERLAUBT = /^\/(?:(?:anzeige|status|status\/schluessel|test|schrift|bild)\/)?[a-z0-9][a-z0-9.-]*\.(html|css|js|txt|woff|png)$/;
const ORDNER = ['/anzeige', '/status', '/status/schluessel', '/test'];

// Dieselben Kopfzeilen wie in public/_headers
const KOPF = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https://michelnews.ch data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function text(inhalt, status) {
  return new Response(inhalt, { status, headers: { ...KOPF, 'Content-Type': TYPEN.txt, 'Cache-Control': 'no-store' } });
}

async function holeDatei(request, stand) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return text('Nicht erlaubt', 405);
  if (!STAND_FORM.test(String(stand || ''))) return text('Im Moment nicht erreichbar.', 503);
  const QUELLE = PROJEKT + stand + '/public';
  const url = new URL(request.url);
  let pfad = url.pathname;
  if (ORDNER.includes(pfad)) {
    return new Response(null, { status: 307, headers: { ...KOPF, Location: pfad + '/' + url.search } });
  }
  if (pfad.endsWith('/')) pfad += 'index.html';
  const treffer = ERLAUBT.exec(pfad);
  if (!treffer) return text('Nicht gefunden', 404);
  let antwort;
  try {
    antwort = await fetch(QUELLE + pfad, { cf: { cacheTtl: 86400, cacheEverything: true } });
  } catch {
    antwort = null;
  }
  if (antwort && antwort.status === 404) return text('Nicht gefunden', 404);
  if (!antwort || !antwort.ok) return text('Im Moment nicht erreichbar. Bitte in einer Minute nochmals versuchen.', 503);
  const fest = pfad.startsWith('/schrift/');
  return new Response(request.method === 'HEAD' ? null : antwort.body, {
    headers: {
      ...KOPF,
      'Content-Type': TYPEN[treffer[1]],
      'Cache-Control': fest ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
  });
}

function mitDateien(env) {
  return { ...env, ASSETS: { fetch: (request) => holeDatei(request, env.STAND) } };
}

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, mitDateien(env), ctx);
  },
  scheduled(ereignis, env, ctx) {
    return app.scheduled(ereignis, mitDateien(env), ctx);
  },
};
