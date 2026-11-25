/*
  Empfangsbildschirm Wallimann, Steuerung der Anzeige.

  Bewusst in altem JavaScript (ES5) geschrieben: kein fetch, keine Pfeilfunktionen,
  kein let oder const. So läuft die Seite auch in älteren Browsern von Fernsehern.

  Ablauf:
  1. Jede Minute holt die Seite neue Daten vom Server (Adresse /api/anzeige).
  2. Der Server sagt, wer begrüsst wird. Die Seite zeigt eine Begrüssung nur,
     wenn sie in den letzten 2 Minuten Daten vom Server bekommen hat.
  3. Ohne Begrüssung wechseln News und Solarstrom ab.
  4. Fällt das Internet aus, laufen die zuletzt gespeicherten News weiter.

  Aufruf: /anzeige/#k=GEHEIMER-SCHLUESSEL
  Vorschau ohne Server: /anzeige/?demo=news (oder begruessung, solar, standard, alles)
*/
(function () {
  'use strict';

  var ABFRAGE_MS = 60 * 1000;          // jede Minute neue Daten holen
  var FRISCH_MS = 2 * 60 * 1000;       // Begrüssung nur mit Daten, die jünger sind als 2 Minuten
  var SOLAR_MAX_ALTER_MS = 10 * 60 * 1000;
  var ABFRAGE_TIMEOUT_MS = 15 * 1000;
  var VERSCHIEBEN_MS = 4 * 60 * 1000;  // feste Elemente leicht verschieben, gegen Einbrennen
  var BILD_MAX_VERGROESSERN = 1.3;     // kleine Bilder höchstens so stark vergrössern
  var SPEICHER = 'empfang.';

  var STANDARD = {
    dauerAnsichtSek: 12,
    dauerBesuchSek: 10,
    solarNachArtikeln: 3,
    design: 1,
    drehung: 0,
    betrieb: { tage: [1, 2, 3, 4, 5], von: '06:30', bis: '18:00' }
  };

  var WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var VERSCHIEBUNGEN = [[0, 0], [6, 4], [-6, 4], [-6, -4], [6, -4], [0, 6], [8, 0], [0, -6], [-8, 0]];

  // ---------- kleine Helfer ----------

  function el(id) { return document.getElementById(id); }

  function zwei(n) { return n < 10 ? '0' + n : '' + n; }

  function text(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Zahl mit Schweizer Tausendertrennung, zum Beispiel 1'920
  function zahl(n, stellen) {
    if (typeof n !== 'number' || isNaN(n)) { return ''; }
    var fest = n.toFixed(stellen || 0).split('.');
    var ganz = fest[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\'');
    return fest.length > 1 ? ganz + '.' + fest[1] : ganz;
  }

  function merke(name, wert) {
    try { window.localStorage.setItem(SPEICHER + name, JSON.stringify(wert)); } catch (e) { /* Speicher voll oder gesperrt */ }
  }
  function lies(name) {
    try {
      var s = window.localStorage.getItem(SPEICHER + name);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  // Zeit, die nicht springt, wenn jemand die Uhr des Geräts verstellt
  function laufzeit() {
    if (window.performance && typeof window.performance.now === 'function') { return window.performance.now(); }
    return new Date().getTime();
  }

  function parameter(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ---------- Zustand ----------

  var schluessel = null;       // geheimer Schlüssel aus dem Link
  var demo = parameter('demo');
  var halt = parameter('halt') === '1';
  var designWunsch = parseInt(parameter('design'), 10) || 0;
  var drehungWunsch = parameter('drehung') === null ? null : (parseInt(parameter('drehung'), 10) || 0);
  var hochkant = false;        // true: Bühne 1'080 x 1'920
  var letzteLage = '';         // zuletzt gesetzte Lage der Bühne, damit sie nicht jede Sekunde neu gesetzt wird

  var daten = null;            // letzte Antwort des Servers (ohne Begrüssungen aus dem Speicher)
  var begruessungen = [];      // nur im Arbeitsspeicher, nie auf dem Gerät gespeichert
  var letzterErfolg = null;    // Laufzeit beim letzten erfolgreichen Abruf
  var zeitAnker = null;        // { server: Millisekunden, laufzeit: Wert von laufzeit() }
  var geladeneVersion = null;
  var gesperrt = false;        // Server hat den Schlüssel abgelehnt

  var modus = '';              // 'begruessung', 'inhalt', 'schwarz'
  var folien = [];             // aktuelle Abspielliste
  var folienSchluessel = '';
  var position = -1;
  var naechsterWechsel = 0;
  var obenA = true;            // welche Ebene gerade sichtbar ist
  var letzterTakt = laufzeit();
  var verschiebung = 0;

  // ---------- Zeit ----------

  function serverJetzt() {
    if (zeitAnker) { return zeitAnker.server + (laufzeit() - zeitAnker.laufzeit); }
    return new Date().getTime(); // nur ganz ohne Serverkontakt: Uhr des Geräts
  }

  // Versatz der Zürcher Zeit zu UTC in Minuten, vom Server mitgeliefert
  function versatzMin(jetzt) {
    var z = daten && daten.zone;
    if (!z) { return 60; }
    if (z.wechsel && jetzt >= z.wechsel.zeit) { return z.wechsel.versatzMin; }
    return z.versatzMin;
  }

  // Zürcher Ortszeit als Date, dessen UTC-Felder die Ortszeit enthalten
  function ortszeit(jetzt) {
    return new Date(jetzt + versatzMin(jetzt) * 60000);
  }

  function zeigeUhr() {
    var o = ortszeit(serverJetzt());
    el('datum').innerHTML = WOCHENTAGE[o.getUTCDay()] + ', ' + zwei(o.getUTCDate()) + '.' + zwei(o.getUTCMonth() + 1) + '.' + o.getUTCFullYear();
    el('zeit').innerHTML = zwei(o.getUTCHours()) + ':' + zwei(o.getUTCMinutes());
  }

  function inBetriebszeit(jetzt) {
    var b = einstellungen().betrieb || STANDARD.betrieb;
    var o = ortszeit(jetzt);
    var tag = o.getUTCDay() === 0 ? 7 : o.getUTCDay();
    var drin = false;
    for (var i = 0; i < b.tage.length; i++) { if (b.tage[i] === tag) { drin = true; } }
    if (!drin) { return false; }
    var minuten = o.getUTCHours() * 60 + o.getUTCMinutes();
    var von = String(b.von).split(':');
    var bis = String(b.bis).split(':');
    return minuten >= (+von[0]) * 60 + (+von[1]) && minuten < (+bis[0]) * 60 + (+bis[1]);
  }

  function einstellungen() {
    var e = (daten && daten.einstellungen) || {};
    var aus = {};
    for (var k in STANDARD) { if (STANDARD.hasOwnProperty(k)) { aus[k] = e[k] !== undefined && e[k] !== null ? e[k] : STANDARD[k]; } }
    aus.dauerAnsichtSek = Math.min(15, Math.max(10, +aus.dauerAnsichtSek || 12));
    aus.dauerBesuchSek = Math.min(30, Math.max(5, +aus.dauerBesuchSek || 10));
    aus.solarNachArtikeln = Math.max(1, +aus.solarNachArtikeln || 3);
    return aus;
  }

  // ---------- Grösse und Design ----------

  // Ausrichtung: Die Bühne ist quer 1'920 x 1'080 oder hochkant 1'080 x 1'920.
  // Hochkant gilt in zwei Fällen:
  //   1. Das Fenster selbst ist höher als breit (das Gerät dreht das Bild schon selbst).
  //   2. Auf der Statusseite ist eine Drehung eingestellt. Ein gewöhnlicher Fernseher, der hochkant
  //      an der Wand hängt, zeigt sein Bild weiter quer. Dann dreht die Seite ihren Inhalt um 90 Grad.
  function drehung() {
    var d = drehungWunsch !== null ? drehungWunsch : (+einstellungen().drehung || 0);
    return d === 90 || d === 270 ? d : 0;
  }

  function passeGroesseAn() {
    var b = window.innerWidth || document.documentElement.clientWidth || 1920;
    var h = window.innerHeight || document.documentElement.clientHeight || 1080;
    var dreh = drehung();
    var hoch = dreh ? true : h > b;
    var bb = hoch ? 1080 : 1920;   // Breite der Bühne
    var bh = hoch ? 1920 : 1080;   // Höhe der Bühne
    // Nach einer Drehung liegt die Breite der Bühne entlang der Höhe des Fensters
    var f = dreh ? Math.min(h / bb, b / bh) : Math.min(b / bb, h / bh);
    // Von rechts nach links gelesen: Bühne auf ihre Mitte setzen, skalieren, drehen, in die Fenstermitte schieben
    var t = 'translate(' + Math.round(b / 2) + 'px,' + Math.round(h / 2) + 'px) rotate(' + dreh + 'deg) scale(' + f + ') translate(' + (-bb / 2) + 'px,' + (-bh / 2) + 'px)';
    if (t !== letzteLage) {
      var s = el('buehne').style;
      s.webkitTransform = t;
      s.transform = t;
      letzteLage = t;
    }
    if (hoch !== hochkant) {
      hochkant = hoch;
      setzeDesign();
      // Die laufende Ansicht für die neue Ausrichtung neu aufbauen
      if (modus && modus !== 'schwarz' && folien[position]) { zeigeFolie(); }
    }
  }

  function setzeDesign() {
    var d = designWunsch || einstellungen().design || 1;
    if (d < 1 || d > 4) { d = 1; }
    var k = 'd' + d + (hochkant ? ' hoch' : '');
    if (document.body.className !== k) { document.body.className = k; }
  }

  function verschiebe() {
    verschiebung = (verschiebung + 1) % VERSCHIEBUNGEN.length;
    var v = VERSCHIEBUNGEN[verschiebung];
    var t = 'translate(' + v[0] + 'px,' + v[1] + 'px)';
    var s = el('rahmen').style;
    s.webkitTransform = t;
    s.transform = t;
  }

  // ---------- Ansichten bauen ----------

  function htmlBegruessung(b) {
    var h = '<div class="ansicht begruessung"><div class="mitte">';
    h += '<div class="gruss">Herzlich willkommen</div>';
    h += '<div class="firma passend" data-min="84">' + text(b.firma) + '</div>';
    if (b.name) { h += '<div class="besuch">' + text(b.name) + '</div>'; }
    h += '</div>';
    h += '<div class="stoerer"><span>Wir freuen<br>uns auf Sie!</span></div>';
    h += '</div>';
    return h;
  }

  function htmlNews(n) {
    var meta = [];
    if (n.ort) { meta.push(text(n.ort)); }
    if (n.datum) { meta.push(text(n.datum)); }
    var h = '<div class="ansicht news' + (n.bild ? '' : ' ohnebild') + '">';
    h += '<div class="bildfeld"><div class="bild"></div></div>';
    h += '<div class="text">';
    if (n.rubrik) { h += '<div class="rubrik">' + text(n.rubrik) + '</div>'; }
    h += '<div class="titel passend" data-min="50">' + text(n.titel) + '</div>';
    h += '<div class="meta">' + meta.join(' · ') + '</div>';
    h += '<div class="quelle">michelnews.ch</div>';
    h += '</div></div>';
    return h;
  }

  function htmlSolar(s) {
    var leistung = typeof s.leistungKw === 'number' ? zahl(s.leistungKw, s.leistungKw < 100 ? 1 : 0) : '';
    var ertrag = typeof s.tagesertragKwh === 'number' ? zahl(s.tagesertragKwh, s.tagesertragKwh < 100 ? 1 : 0) : '';
    var h = '<div class="ansicht solar">';
    h += '<div class="sonne"></div>';
    h += '<div class="stitel">Unser Solarstrom</div>';
    h += '<div class="suntertitel">So viel Strom liefert unsere Anlage gerade</div>';
    if (s.beispiel) { h += '<div class="beispiel">Beispieldaten</div>'; }
    h += '<div class="wert eins"><div class="zahl">' + leistung + '<span>kW</span></div><div class="label">aktuelle Leistung</div></div>';
    h += '<div class="wert zwei"><div class="zahl">' + ertrag + '<span>kWh</span></div><div class="label">heute produziert</div></div>';
    var zusatz = [];
    if (typeof s.gesamtMwh === 'number') { zusatz.push('Seit Inbetriebnahme: <b>' + zahl(s.gesamtMwh, 0) + ' MWh</b>'); }
    if (typeof s.eigenverbrauchProzent === 'number') { zusatz.push('Eigenverbrauch: <b>' + zahl(s.eigenverbrauchProzent, 0) + ' %</b>'); }
    if (typeof s.co2Tonnen === 'number') { zusatz.push('Eingespartes CO<sub>2</sub>: <b>' + zahl(s.co2Tonnen, 0) + ' t</b>'); }
    if (zusatz.length) { h += '<div class="zusatz">' + zusatz.join(' &nbsp;·&nbsp; ') + '</div>'; }
    h += '</div>';
    return h;
  }

  function htmlStandard() {
    return '<div class="ansicht standard"><img class="gross" src="/bild/logo-wallimann.png" alt="Wallimann"></div>';
  }

  // Schrift verkleinern, bis der Text in sein Feld passt
  function passeTextAn(ebene) {
    var teile = ebene.querySelectorAll('.passend');
    for (var i = 0; i < teile.length; i++) {
      var t = teile[i];
      var min = parseInt(t.getAttribute('data-min'), 10) || 40;
      var maxHoehe;
      if (t.className.indexOf('titel') >= 0) {
        var feld = t.parentNode;
        var rubrik = feld.querySelector('.rubrik');
        maxHoehe = feld.clientHeight - 150 - (rubrik ? rubrik.offsetHeight + 34 : 0);
      } else {
        maxHoehe = hochkant ? 660 : 380;
      }
      var groesse = parseInt(window.getComputedStyle(t).fontSize, 10) || 100;
      var runden = 0;
      // Zuerst: Das längste Wort soll auf eine Zeile passen, damit kein Wort mitten drin umbricht.
      // Dafür kurz das Umbrechen im Wort ausschalten und messen, ob der Text über das Feld hinausragt.
      t.style.wordWrap = 'normal';
      t.style.overflowWrap = 'normal';
      while (t.scrollWidth > t.clientWidth + 1 && groesse > min && runden < 40) {
        groesse -= 4;
        t.style.fontSize = groesse + 'px';
        runden++;
      }
      t.style.wordWrap = '';
      t.style.overflowWrap = '';
      while (t.offsetHeight > maxHoehe && groesse > min && runden < 60) {
        groesse -= 4;
        t.style.fontSize = groesse + 'px';
        runden++;
      }
      // Begrüssung: Der ganze Block (Gruss, Firma, Name) muss auf den Bildschirm passen
      if (t.className.indexOf('firma') >= 0) {
        var block = t.parentNode;
        var ansicht = block.parentNode;
        var platz = hochkant ? 1250 : ansicht.clientHeight - 170;
        while (block.offsetHeight > platz && groesse > min && runden < 80) {
          groesse -= 4;
          t.style.fontSize = groesse + 'px';
          runden++;
        }
        var besuch = block.querySelector('.besuch');
        var klein = besuch ? (parseInt(window.getComputedStyle(besuch).fontSize, 10) || 92) : 0;
        while (besuch && block.offsetHeight > platz && klein > 56 && runden < 100) {
          klein -= 4;
          besuch.style.fontSize = klein + 'px';
          runden++;
        }
      }
    }
  }

  // Der runde Störer «Wir freuen uns auf Sie!» verschwindet, wenn Firma oder Name so lang sind,
  // dass sie ihn berühren würden.
  function pruefeStoerer(ebene) {
    var stoerer = ebene.querySelector('.stoerer');
    if (!stoerer || !stoerer.getBoundingClientRect || !document.createRange) { return; }
    var s = stoerer.getBoundingClientRect();
    // Der Störer ist ein Kreis, um 8 Grad gedreht. Sein umschliessendes Rechteck ist darum
    // etwas grösser als der Kreis selbst (Faktor 1.129).
    var mx = (s.left + s.right) / 2, my = (s.top + s.bottom) / 2;
    var radius = (s.right - s.left) / 2 / 1.129;
    var teile = ebene.querySelectorAll('.firma, .besuch');
    for (var i = 0; i < teile.length; i++) {
      var bereich = document.createRange();
      bereich.selectNodeContents(teile[i]);
      // Jede Textzeile einzeln messen, nicht den ganzen Block
      var zeilen = bereich.getClientRects ? bereich.getClientRects() : [bereich.getBoundingClientRect()];
      for (var z = 0; z < zeilen.length; z++) {
        var t = zeilen[z];
        // Die Zeile ist höher als die Buchstaben selbst: oben und unten je 15 Prozent abziehen
        var rand = (t.bottom - t.top) * 0.15;
        var dx = mx - Math.max(t.left, Math.min(mx, t.right));
        var dy = my - Math.max(t.top + rand, Math.min(my, t.bottom - rand));
        if (dx * dx + dy * dy < radius * radius * 1.12) {
          stoerer.style.display = 'none';
          return;
        }
      }
    }
  }

  // Bild ins Feld setzen: grosse Bilder füllen das Feld, kleine bleiben klein
  function setzeBild(ebene, folie, bild) {
    var feld = ebene.querySelector('.bildfeld');
    var div = ebene.querySelector('.bild');
    if (!feld || !div) { return; }
    var fb = feld.clientWidth, fh = feld.clientHeight;
    var b = bild.naturalWidth || bild.width || folie.daten.bildBreite || 0;
    var h = bild.naturalHeight || bild.height || folie.daten.bildHoehe || 0;
    div.style.backgroundImage = 'url("' + folie.daten.bild + '")';
    if (!b || !h) { return; }
    var fuellen = Math.max(fb / b, fh / h);       // Faktor, damit das Bild das Feld füllt
    if (fuellen <= BILD_MAX_VERGROESSERN) { return; } // gross genug: Feld füllen (cover)
    var f = Math.min(BILD_MAX_VERGROESSERN, fb / b, fh / h);
    div.className = 'bild klein';
    div.style.backgroundSize = Math.round(b * f) + 'px ' + Math.round(h * f) + 'px';
  }

  function zeigeEbene(html, folie) {
    var neu = obenA ? el('ebeneB') : el('ebeneA');
    var alt = obenA ? el('ebeneA') : el('ebeneB');
    neu.innerHTML = html;
    try { passeTextAn(neu); pruefeStoerer(neu); } catch (e) { /* alter Browser: Text bleibt in Standardgrösse */ }

    function einblenden() {
      neu.className = 'ebene sichtbar';
      alt.className = 'ebene';
      obenA = !obenA;
      window.setTimeout(function () { if (alt.className === 'ebene') { alt.innerHTML = ''; } }, 1500);
    }

    if (folie && folie.art === 'news' && folie.daten.bild) {
      var fertig = false;
      var bild = new Image();
      var weiter = function (ok) {
        if (fertig) { return; }
        fertig = true;
        if (ok) {
          try { setzeBild(neu, folie, bild); } catch (e) { /* egal */ }
        } else {
          var a = neu.querySelector('.ansicht');
          if (a) { a.className = 'ansicht news ohnebild'; try { passeTextAn(neu); } catch (e) { /* egal */ } }
        }
        einblenden();
      };
      bild.onload = function () { weiter(true); };
      bild.onerror = function () { weiter(false); };
      window.setTimeout(function () { weiter(false); }, 4000);
      bild.src = folie.daten.bild;
    } else {
      einblenden();
    }
  }

  function zeigePunkte() {
    var h = '';
    if (modus === 'inhalt' && folien.length > 1) {
      for (var i = 0; i < folien.length; i++) {
        h += '<span class="punkt' + (folien[i].art === 'solar' ? ' solar' : '') + (i === position ? ' aktiv' : '') + '"></span>';
      }
    } else if (modus === 'begruessung' && folien.length > 1) {
      for (var j = 0; j < folien.length; j++) {
        h += '<span class="punkt' + (j === position ? ' aktiv' : '') + '"></span>';
      }
    }
    el('punkte').innerHTML = h;
  }

  // ---------- Abspielliste ----------

  function aktiveBegruessungen(jetzt) {
    if (demo) { return begruessungen; }
    if (letzterErfolg === null || laufzeit() - letzterErfolg > FRISCH_MS) { return []; }
    var aus = [];
    for (var i = 0; i < begruessungen.length; i++) {
      var b = begruessungen[i];
      if (jetzt >= b.von && jetzt < b.bis) { aus.push(b); }
    }
    return aus;
  }

  function solarGueltig(jetzt) {
    var s = daten && daten.solar;
    if (!s) { return null; }
    if (demo) { return s; }
    if (typeof s.zeit !== 'number' || jetzt - s.zeit > SOLAR_MAX_ALTER_MS) { return null; }
    return s;
  }

  function baueFolien(jetzt) {
    var liste = [];
    var begr = aktiveBegruessungen(jetzt);
    var neuerModus;
    var i;
    if (begr.length) {
      neuerModus = 'begruessung';
      for (i = 0; i < begr.length; i++) { liste.push({ art: 'begruessung', id: 'b' + i + '|' + begr[i].firma + '|' + (begr[i].name || ''), daten: begr[i] }); }
    } else if (demo || inBetriebszeit(jetzt)) {
      neuerModus = 'inhalt';
      var news = (daten && daten.news) || [];
      var solar = solarGueltig(jetzt);
      var nach = einstellungen().solarNachArtikeln;
      for (i = 0; i < news.length; i++) {
        liste.push({ art: 'news', id: 'n' + news[i].id, daten: news[i] });
        if (solar && (i + 1) % nach === 0) { liste.push({ art: 'solar', id: 's' + i, daten: solar }); }
      }
      if (solar && news.length < nach) { liste.push({ art: 'solar', id: 's', daten: solar }); }
      if (!liste.length) { liste.push({ art: 'standard', id: 'standard', daten: null }); }
    } else {
      neuerModus = 'schwarz';
    }
    return { modus: neuerModus, liste: liste };
  }

  function kennung(liste) {
    var s = [];
    for (var i = 0; i < liste.length; i++) { s.push(liste[i].id); }
    return s.join(',');
  }

  function zeigeFolie() {
    var f = folien[position];
    if (!f) { return; }
    var html;
    if (f.art === 'begruessung') { html = htmlBegruessung(f.daten); }
    else if (f.art === 'news') { html = htmlNews(f.daten); }
    else if (f.art === 'solar') { html = htmlSolar(f.daten); }
    else { html = htmlStandard(); }
    zeigeEbene(html, f);
    zeigePunkte();
    var dauer = f.art === 'begruessung' ? einstellungen().dauerBesuchSek : einstellungen().dauerAnsichtSek;
    naechsterWechsel = laufzeit() + dauer * 1000;
  }

  function takt() {
    letzterTakt = laufzeit();
    var jetzt = serverJetzt();
    zeigeUhr();
    setzeDesign();
    passeGroesseAn();

    var plan = baueFolien(jetzt);
    var neu = kennung(plan.liste);

    if (plan.modus !== modus) {
      modus = plan.modus;
      el('schwarz').className = modus === 'schwarz' ? 'schwarz an' : 'schwarz';
      folien = plan.liste;
      folienSchluessel = neu;
      position = 0;
      if (modus !== 'schwarz') { zeigeFolie(); }
      return;
    }
    if (modus === 'schwarz') { return; }

    if (modus === 'begruessung' && neu !== folienSchluessel) {
      // Besuch dazugekommen oder weggefallen: sofort neu aufbauen
      folien = plan.liste;
      folienSchluessel = neu;
      position = 0;
      zeigeFolie();
      return;
    }

    if (folien.length === 1 && folien[0].art === 'standard' && neu !== folienSchluessel) {
      // Bisher gab es nichts zu zeigen, jetzt sind Inhalte da: sofort wechseln
      folien = plan.liste;
      folienSchluessel = neu;
      position = 0;
      zeigeFolie();
      return;
    }

    if (halt) { return; }
    if (laufzeit() < naechsterWechsel) { return; }

    if (neu !== folienSchluessel) {
      // Neue Inhalte: Liste übernehmen, an derselben Stelle weiterfahren
      folien = plan.liste;
      folienSchluessel = neu;
      if (position >= folien.length) { position = -1; }
    }
    if (folien.length <= 1) {
      if (position !== 0) { position = 0; zeigeFolie(); }
      else { naechsterWechsel = laufzeit() + 5000; }
      return;
    }
    position = (position + 1) % folien.length;
    zeigeFolie();
  }

  // ---------- Daten holen ----------

  function uebernimm(antwort, vomSpeicher) {
    daten = {
      zone: antwort.zone || (daten && daten.zone) || null,
      news: antwort.news || [],
      solar: antwort.solar || null,
      einstellungen: antwort.einstellungen || (daten && daten.einstellungen) || null
    };
    if (!vomSpeicher) {
      begruessungen = antwort.begruessungen || [];
      zeitAnker = { server: antwort.zeit, laufzeit: laufzeit() };
      letzterErfolg = laufzeit();
      // Auf dem Gerät gespeichert werden nur News, Solar und Einstellungen, nie Namen von Besuchen
      merke('daten', { zone: daten.zone, news: daten.news, solar: daten.solar, einstellungen: daten.einstellungen });
      pruefeVersion(antwort.version);
    }
  }

  function hole() {
    if (demo || !schluessel || gesperrt) { return; }
    var x = new XMLHttpRequest();
    var erledigt = false;
    var uhr = window.setTimeout(function () {
      if (!erledigt) { erledigt = true; try { x.abort(); } catch (e) { /* egal */ } }
    }, ABFRAGE_TIMEOUT_MS);
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || erledigt) { return; }
      erledigt = true;
      window.clearTimeout(uhr);
      if (x.status === 200) {
        try {
          var a = JSON.parse(x.responseText);
          if (a && a.ok) { uebernimm(a, false); }
        } catch (e) { /* kaputte Antwort: alte Daten behalten */ }
      } else if (x.status === 401 || x.status === 403) {
        // Schlüssel falsch oder gewechselt: nichts mehr zeigen ausser dem Logo
        gesperrt = true;
        daten = null;
        begruessungen = [];
        merke('daten', null);
        window.setTimeout(function () { gesperrt = false; }, 10 * 60 * 1000);
      }
    };
    try {
      x.open('GET', '/api/anzeige?t=' + new Date().getTime(), true);
      x.setRequestHeader('X-Anzeige-Schluessel', schluessel);
      x.send(null);
    } catch (e) { erledigt = true; window.clearTimeout(uhr); }
  }

  // ---------- Selbstheilung ----------

  // Merkt sich, wann zuletzt neu geladen wurde. Der Fenstername (window.name) übersteht ein Neuladen
  // auch in Browsern ohne Speicher. So kann die Anzeige nie in eine Schleife von Neuladen geraten.
  function liesNeuladen() {
    var aus = {};
    try {
      var roh = String(window.name || '');
      if (roh.indexOf('empfang:') === 0) { aus = JSON.parse(roh.substring(8)) || {}; }
    } catch (e) { aus = {}; }
    return aus;
  }

  function darfNeuLaden(grund, abstandMs) {
    var jetzt = new Date().getTime();
    var gemerkt = liesNeuladen();
    var letzte = Math.max(+gemerkt[grund] || 0, +lies('neuladen.' + grund) || 0);
    if (jetzt - letzte < abstandMs && jetzt >= letzte) { return false; }
    // Zusätzlich: höchstens ein Neuladen pro Minute, egal aus welchem Grund
    var irgendeins = Math.max(+gemerkt.alle || 0, +lies('neuladen.alle') || 0);
    if (jetzt - irgendeins < 60000 && jetzt >= irgendeins) { return false; }
    gemerkt[grund] = jetzt;
    gemerkt.alle = jetzt;
    try { window.name = 'empfang:' + JSON.stringify(gemerkt); } catch (e) { /* egal */ }
    merke('neuladen.' + grund, jetzt);
    merke('neuladen.alle', jetzt);
    return true;
  }

  function ladeNeu(grund, abstandMs) {
    if (demo) { return; }
    if (!darfNeuLaden(grund, abstandMs)) { return; }
    try { window.location.reload(); } catch (e) { /* egal */ }
  }

  function pruefeVersion(version) {
    if (!version) { return; }
    if (geladeneVersion === null) { geladeneVersion = version; return; }
    if (version !== geladeneVersion) {
      // Neue Fassung veröffentlicht: Seite holt sie von selbst
      ladeNeu('version', 10 * 60 * 1000);
    }
  }

  function wache() {
    // Hängt der Takt länger als 90 Sekunden, lädt sich die Seite neu
    if (laufzeit() - letzterTakt > 90 * 1000) { ladeNeu('haenger', 5 * 60 * 1000); return; }
    // Einmal pro Nacht frisch laden, aber nur wenn die Verbindung steht
    var o = ortszeit(serverJetzt());
    if (o.getUTCHours() === 3 && o.getUTCMinutes() >= 30 && o.getUTCMinutes() < 35 &&
        letzterErfolg !== null && laufzeit() - letzterErfolg < FRISCH_MS) {
      ladeNeu('nacht', 6 * 60 * 60 * 1000);
    }
  }

  window.onerror = function () {
    window.setTimeout(function () { ladeNeu('fehler', 5 * 60 * 1000); }, 15000);
    return true; // keine Fehlermeldung auf dem Bildschirm
  };

  // ---------- Vollbild ----------

  // Ein Druck auf OK an der Fernbedienung (oder ein Klick) schaltet auf Vollbild, falls der Browser das kann.
  // Von selbst darf eine Seite das nicht, der Browser verlangt dafür eine Eingabe.
  function vollbild() {
    try {
      var d = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) { return; }
      var f = d.requestFullscreen || d.webkitRequestFullscreen || d.webkitRequestFullScreen || d.mozRequestFullScreen;
      if (!f) { return; }
      var zusage = f.call(d);
      if (zusage && zusage['catch']) { zusage['catch'](function () { /* abgelehnt: egal */ }); }
    } catch (e) { /* alter Browser */ }
  }

  // ---------- Start ----------

  function leseSchluessel() {
    var h = window.location.hash || '';
    var m = /[#&]k=([^&]+)/.exec(h);
    var k = m ? decodeURIComponent(m[1]) : (h.length > 12 && h.indexOf('=') < 0 ? h.substring(1) : null);
    if (k) { merke('schluessel', k); return k; }
    return lies('schluessel');
  }

  function start() {
    // Nie unverschlüsselt: Sonst ginge der geheime Schlüssel offen übers Netz. Ausnahme: lokales Testen.
    var ort = window.location;
    if (ort.protocol === 'http:' && ort.hostname !== 'localhost' && ort.hostname !== '127.0.0.1') {
      ort.replace('https://' + ort.host + ort.pathname + ort.search + ort.hash);
      return;
    }
    passeGroesseAn();
    window.onresize = passeGroesseAn;

    if (demo && typeof window.EMPFANG_DEMO === 'function') {
      var d = window.EMPFANG_DEMO(demo);
      daten = { zone: d.zone, news: d.news, solar: d.solar, einstellungen: d.einstellungen };
      begruessungen = d.begruessungen;
      zeitAnker = { server: d.zeit, laufzeit: laufzeit() };
    } else {
      schluessel = leseSchluessel();
      var alt = lies('daten');
      if (alt) { uebernimm(alt, true); }
    }

    if (document.addEventListener) {
      document.addEventListener('click', vollbild, false);
      document.addEventListener('keydown', vollbild, false);
    }

    takt();
    // Sobald die Schriften geladen sind, die erste Ansicht neu zeichnen: Erst dann stimmen die Masse
    // für das Einpassen langer Texte.
    var neuZeichnen = function () { if (modus && modus !== 'schwarz' && folien[position]) { zeigeFolie(); } };
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(neuZeichnen);
    } else {
      window.setTimeout(neuZeichnen, 2500);
    }
    window.setInterval(takt, 1000);
    window.setInterval(hole, ABFRAGE_MS);
    window.setInterval(wache, 20000);
    if (!halt) { window.setInterval(verschiebe, VERSCHIEBEN_MS); }
    hole();

    // Offline-Speicher: Die Seite legt sich selbst im Browser ab, wenn er das kann
    if (!demo && 'serviceWorker' in navigator) {
      try { navigator.serviceWorker.register('/sw.js'); } catch (e) { /* alter Browser */ }
    }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
  else { start(); }
})();
