/* Erzeugt zufällige Geheimnisse im Browser. Nichts davon verlässt das Gerät. */
(function () {
  'use strict';
  // Ohne Zeichen, die sich leicht verwechseln lassen (0 und o, 1 und l)
  var ZEICHEN = 'abcdefghijkmnpqrstuvwxyz23456789';

  function zufall(laenge) {
    var werte = new Uint8Array(laenge);
    window.crypto.getRandomValues(werte);
    var aus = '';
    for (var i = 0; i < laenge; i++) { aus += ZEICHEN.charAt(werte[i] % ZEICHEN.length); }
    return aus;
  }

  function gruppen(text) { return text.replace(/(.{4})(?=.)/g, '$1-'); }

  function wuerfle() {
    var firma = zufall(28);
    var extern = zufall(28);
    while (extern === firma) { extern = zufall(28); } // die beiden Schlüssel sind nie gleich
    document.getElementById('schluessel').value = firma;
    document.getElementById('extern').value = extern;
    document.getElementById('passwort').value = gruppen(zufall(16));
    document.getElementById('solar').value = zufall(28);
  }

  document.getElementById('neu').addEventListener('click', wuerfle);
  wuerfle();
})();
