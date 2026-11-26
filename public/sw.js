/*
  Offline-Speicher der Anzeige (Service Worker).
  Er legt die Anzeige samt Schriften, Logo und News-Bildern im Browser ab.
  So startet die Anzeige auch ohne Internet, zum Beispiel nach einem Neuladen.
  Daten von Besuchen werden hier nie gespeichert: Alles unter /api/ geht immer direkt ins Netz.
*/
var SPEICHER = 'empfang-v2';
var BILDER = 'empfang-bilder-v1';
var GRUNDDATEIEN = [
  '/anzeige/',
  '/anzeige/anzeige.css',
  '/anzeige/anzeige.js',
  '/anzeige/demo.js',
  '/bild/logo-wallimann.png',
  '/bild/michelnews-m.png',
  '/schrift/besley-400.woff',
  '/schrift/besley-600.woff',
  '/schrift/inter-400.woff',
  '/schrift/inter-600.woff',
  '/schrift/nunito-700.woff',
  '/schrift/nunito-800.woff',
  '/schrift/nunito-900.woff',
  '/schrift/figtree-400.woff',
  '/schrift/figtree-500.woff',
  '/schrift/figtree-600.woff',
  '/schrift/figtree-700.woff',
  '/schrift/architects-daughter-400.woff'
];
var MAX_BILDER = 40;

self.addEventListener('install', function (ereignis) {
  ereignis.waitUntil(
    caches.open(SPEICHER).then(function (c) { return c.addAll(GRUNDDATEIEN); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ereignis) {
  ereignis.waitUntil(
    caches.keys().then(function (namen) {
      return Promise.all(namen.map(function (n) {
        if (n !== SPEICHER && n !== BILDER) { return caches.delete(n); }
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function kuerzeBilder(c) {
  return c.keys().then(function (eintraege) {
    if (eintraege.length <= MAX_BILDER) { return null; }
    return Promise.all(eintraege.slice(0, eintraege.length - MAX_BILDER).map(function (e) { return c.delete(e); }));
  });
}

self.addEventListener('fetch', function (ereignis) {
  var anfrage = ereignis.request;
  if (anfrage.method !== 'GET') { return; }
  var url = new URL(anfrage.url);
  if (url.origin !== self.location.origin) { return; }
  if (url.pathname.indexOf('/api/') === 0) { return; }             // nie zwischenspeichern
  if (url.pathname.indexOf('/status') === 0) { return; }
  if (url.pathname.indexOf('/test') === 0) { return; }

  // Bilder der News: zuerst aus dem Speicher, sonst aus dem Netz holen und ablegen
  if (url.pathname.indexOf('/newsbild/') === 0) {
    ereignis.respondWith(
      caches.open(BILDER).then(function (c) {
        return c.match(anfrage).then(function (treffer) {
          if (treffer) { return treffer; }
          return fetch(anfrage).then(function (antwort) {
            if (antwort && antwort.ok) { c.put(anfrage, antwort.clone()); kuerzeBilder(c); }
            return antwort;
          });
        });
      })
    );
    return;
  }

  // Alles andere: zuerst aus dem Netz (damit Änderungen sofort ankommen), ohne Netz aus dem Speicher
  var schluessel = url.pathname;
  ereignis.respondWith(
    fetch(anfrage).then(function (antwort) {
      if (antwort && antwort.ok) {
        var kopie = antwort.clone();
        caches.open(SPEICHER).then(function (c) { c.put(schluessel, kopie); });
      }
      return antwort;
    }).catch(function () {
      return caches.open(SPEICHER).then(function (c) {
        return c.match(schluessel).then(function (treffer) {
          return treffer || new Response('', { status: 503 });
        });
      });
    })
  );
});
