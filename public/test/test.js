/*
  Testseite für den Browser des Fernsehers, in altem JavaScript (ES5).
  Jede Prüfung ergibt 1 (geht) oder 0 (geht nicht). Die Ziffern bilden den Code.
*/
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function zeile(tabelle, name, wert, klasse) {
    var tr = document.createElement('tr');
    var a = document.createElement('td');
    var b = document.createElement('td');
    a.appendChild(document.createTextNode(name));
    b.appendChild(document.createTextNode(wert));
    if (klasse) { b.className = klasse; }
    tr.appendChild(a);
    tr.appendChild(b);
    tabelle.appendChild(tr);
  }

  var ergebnisse = [];
  function pruefung(name, wichtig, test) {
    var ok = false;
    try { ok = !!test(); } catch (e) { ok = false; }
    ergebnisse.push(ok ? '1' : '0');
    zeile(el('pruefungen'), name + (wichtig ? ' (nötig)' : ''), ok ? 'ja' : 'nein', ok ? 'ja' : 'nein');
    return ok;
  }

  function stilKann(eigenschaften) {
    var s = document.createElement('div').style;
    for (var i = 0; i < eigenschaften.length; i++) { if (eigenschaften[i] in s) { return true; } }
    return false;
  }

  // ---------- Bildschirm ----------
  var b = el('bildschirm');
  var breite = window.innerWidth || document.documentElement.clientWidth;
  var hoehe = window.innerHeight || document.documentElement.clientHeight;
  zeile(b, 'Fenster des Browsers', breite + ' x ' + hoehe);
  zeile(b, 'Bildschirm laut Gerät', (window.screen ? screen.width + ' x ' + screen.height : 'unbekannt'));
  zeile(b, 'Pixelverhältnis', String(window.devicePixelRatio || 1));
  var verhaeltnis = breite / hoehe;
  zeile(b, 'Format', Math.abs(verhaeltnis - 16 / 9) < 0.03 ? '16:9, passt' : 'nicht genau 16:9 (' + verhaeltnis.toFixed(2) + '), vermutlich sind Leisten des Browsers sichtbar',
    Math.abs(verhaeltnis - 16 / 9) < 0.03 ? 'ja' : 'nein');

  // ---------- Fähigkeiten ----------
  pruefung('1 Daten nachladen (XMLHttpRequest)', true, function () { return typeof XMLHttpRequest !== 'undefined'; });
  pruefung('2 JSON lesen', true, function () { return JSON.parse('{"a":1}').a === 1; });
  pruefung('3 Skalieren und Verschieben (transform)', true, function () { return stilKann(['transform', 'webkitTransform']); });
  pruefung('4 Weicher Übergang (transition)', false, function () { return stilKann(['transition', 'webkitTransition']); });
  pruefung('5 Bilder beschneiden (background-size)', true, function () { return stilKann(['backgroundSize']); });
  pruefung('6 Runde Ecken', false, function () { return stilKann(['borderRadius']); });
  pruefung('7 Daten im Browser merken (localStorage)', false, function () {
    window.localStorage.setItem('empfang.test', '1');
    var ok = window.localStorage.getItem('empfang.test') === '1';
    window.localStorage.removeItem('empfang.test');
    return ok;
  });
  pruefung('8 Offline-Speicher (Service Worker)', false, function () { return 'serviceWorker' in navigator && 'caches' in window; });
  pruefung('9 Vollbild per Skript', false, function () {
    var d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen || d.webkitRequestFullScreen || d.mozRequestFullScreen);
  });
  pruefung('10 Genaue Laufzeit (performance.now)', false, function () { return typeof window.performance.now() === 'number'; });
  pruefung('11 Eigene Schriften (WOFF)', false, function () {
    // Breite eines Probetextes mit und ohne Schrift vergleichen
    var s = document.createElement('span');
    s.style.cssText = 'position:absolute;left:-9999px;font-size:60px;font-family:monospace';
    s.appendChild(document.createTextNode('Willkommen mmmm'));
    document.body.appendChild(s);
    var ohne = s.offsetWidth;
    s.style.fontFamily = '"Nunito", monospace';
    var mit = s.offsetWidth;
    document.body.removeChild(s);
    return mit !== ohne;
  });

  function zeigeCode() {
    el('code').innerHTML = breite + 'x' + hoehe + '-' + ergebnisse.join('');
  }
  zeigeCode();
  el('agent').appendChild(document.createTextNode('Browser: ' + navigator.userAgent));

  // Schriften laden verzögert: Prüfung 11 nach 3 Sekunden wiederholen
  window.setTimeout(function () {
    var s = document.createElement('span');
    s.style.cssText = 'position:absolute;left:-9999px;font-size:60px;font-family:monospace';
    s.appendChild(document.createTextNode('Willkommen mmmm'));
    document.body.appendChild(s);
    var ohne = s.offsetWidth;
    s.style.fontFamily = '"Nunito", monospace';
    var mit = s.offsetWidth;
    document.body.removeChild(s);
    if (mit !== ohne && ergebnisse[10] === '0') {
      ergebnisse[10] = '1';
      var zellen = el('pruefungen').getElementsByTagName('tr')[10].getElementsByTagName('td');
      zellen[1].className = 'ja';
      zellen[1].innerHTML = 'ja';
      zeigeCode();
    }
  }, 3000);

  // ---------- Bewegung und Uhr: zeigt, ob der Browser ruckelt oder einschläft ----------
  var start = new Date().getTime();
  var balken = document.querySelector ? document.querySelector('.balken') : null;
  window.setInterval(function () {
    var t = (new Date().getTime() - start) / 1000;
    el('sekunden').innerHTML = String(Math.floor(t));
    if (balken) {
      var p = (t % 8) / 8;                      // 8 Sekunden für hin und zurück
      var x = p < 0.5 ? p * 2 : (1 - p) * 2;
      balken.style.left = (x * 88) + '%';
    }
  }, 100);
})();
