/* Statusseite des Empfangsbildschirms */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var formular = $('einstellungen');
  var formularGefuellt = false;

  function zeige(id, an) { $(id).classList.toggle('versteckt', !an); }

  function anfrage(methode, pfad, daten) {
    return fetch(pfad, {
      method: methode,
      credentials: 'same-origin',
      headers: daten ? { 'Content-Type': 'application/json' } : {},
      body: daten ? JSON.stringify(daten) : undefined
    }).then(function (antwort) {
      return antwort.json().catch(function () { return {}; }).then(function (inhalt) {
        return { status: antwort.status, inhalt: inhalt };
      });
    });
  }

  function zeile(tabelle, zellen, klassen) {
    var tr = document.createElement('tr');
    zellen.forEach(function (text, i) {
      var td = document.createElement(i === 0 && tabelle.id === 'uebersicht' ? 'th' : 'td');
      td.textContent = text === null || text === undefined || text === '' ? '' : String(text);
      if (klassen && klassen[i]) { td.className = klassen[i]; }
      tr.appendChild(td);
    });
    tabelle.appendChild(tr);
  }

  function vor(a) {
    if (!a) { return 'noch nie'; }
    if (a.vorMin < 1) { return 'gerade eben (' + a.text + ')'; }
    if (a.vorMin < 120) { return 'vor ' + a.vorMin + ' Minuten (' + a.text + ')'; }
    return a.text;
  }

  var endeWar24 = false;

  function fuelleFormular(e) {
    var f = formular.elements;
    f.begruessungAn.checked = !!e.begruessungAn;
    f.organisatorPflicht.checked = !!e.organisatorPflicht;
    ['vorlaufMin', 'nachlaufMin', 'dauerBesuchSek', 'kalenderMinuten', 'newsAnzahl', 'newsMinuten',
      'agendaNachArtikeln', 'agendaAnzahl', 'dauerAgendaSek', 'solarNachArtikeln', 'dauerAnsichtSek', 'feedUrl', 'betriebVon', 'betriebBis', 'alarmEmail', 'alarmAbsender'
    ].forEach(function (name) { f[name].value = e[name] === undefined || e[name] === null ? '' : e[name]; });
    f.domains.value = (e.domains || []).join(', ');
    f.newsOrte.value = (e.newsOrte || []).join(', ');
    f.newsRubriken.value = (e.newsRubriken || []).join(', ');
    f.newsZeiten.value = (e.newsZeiten || []).join(', ');
    f.solarQuelle.value = e.solarQuelle;
    f.design.value = String(e.design);
    f.drehung.value = String(e.drehung || 0);
    // 24:00 kennt das Zeitfeld nicht, darum zeigt es 23:59. Beim Speichern wird daraus wieder 24:00,
    // solange das Feld nicht geändert wurde.
    endeWar24 = e.betriebBis === '24:00';
    if (endeWar24) { f.betriebBis.value = '23:59'; }
    Array.prototype.forEach.call(formular.querySelectorAll('input[name="tag"]'), function (feld) {
      feld.checked = (e.betriebTage || []).indexOf(Number(feld.value)) >= 0;
    });
    formularGefuellt = true;
  }

  function leseFormular() {
    var f = formular.elements;
    var tage = [];
    Array.prototype.forEach.call(formular.querySelectorAll('input[name="tag"]'), function (feld) {
      if (feld.checked) { tage.push(Number(feld.value)); }
    });
    return {
      begruessungAn: f.begruessungAn.checked,
      organisatorPflicht: f.organisatorPflicht.checked,
      vorlaufMin: Number(f.vorlaufMin.value),
      nachlaufMin: Number(f.nachlaufMin.value),
      dauerBesuchSek: Number(f.dauerBesuchSek.value),
      domains: f.domains.value,
      kalenderMinuten: Number(f.kalenderMinuten.value),
      newsAnzahl: Number(f.newsAnzahl.value),
      newsZeiten: f.newsZeiten.value,
      newsMinuten: Number(f.newsMinuten.value),
      newsOrte: f.newsOrte.value,
      newsRubriken: f.newsRubriken.value,
      feedUrl: f.feedUrl.value,
      solarQuelle: f.solarQuelle.value,
      agendaNachArtikeln: Number(f.agendaNachArtikeln.value),
      agendaAnzahl: Number(f.agendaAnzahl.value),
      dauerAgendaSek: Number(f.dauerAgendaSek.value),
      solarNachArtikeln: Number(f.solarNachArtikeln.value),
      dauerAnsichtSek: Number(f.dauerAnsichtSek.value),
      design: Number(f.design.value),
      drehung: Number(f.drehung.value),
      betriebTage: tage,
      betriebVon: f.betriebVon.value,
      betriebBis: (endeWar24 && f.betriebBis.value === '23:59') ? '24:00' : f.betriebBis.value,
      alarmEmail: f.alarmEmail.value,
      alarmAbsender: f.alarmAbsender.value
    };
  }

  function zeigeStatus(s) {
    zeige('anmeldung', false);
    zeige('inhalt', true);

    $('stand').textContent = s.zeit;
    $('fassung').textContent = s.version;

    var liste = $('hinweise');
    liste.textContent = '';
    (s.hinweise.length ? s.hinweise : ['Alles in Ordnung.']).forEach(function (h) {
      var li = document.createElement('li');
      li.textContent = h;
      if (h.indexOf('Störung') === 0) { li.className = 'stoerung'; }
      liste.appendChild(li);
    });

    var t = $('uebersicht');
    t.textContent = '';
    var k = s.kalender;
    zeile(t, ['Kalender zuletzt geladen', k.eingerichtet ? vor(k.letzterErfolg) : 'nicht eingerichtet'],
      [null, !k.eingerichtet || k.fehler || !k.letzterErfolg || k.letzterErfolg.vorMin > 15 ? 'schlecht' : 'gut']);
    zeile(t, ['Besuche heute', String(s.besucheHeute)]);
    zeile(t, ['News zuletzt geladen', (s.beispiel ? '' : vor(s.news.letzterErfolg) + ', ') + s.news.anzahl + ' Artikel, Quelle: ' + s.news.quelle],
      [null, s.news.fehler ? 'schlecht' : (s.news.letzterErfolg || s.beispiel ? 'gut' : '')]);
    if (s.news.naechsterAbruf) {
      zeile(t, ['News: nächster Abruf', s.news.naechsterAbruf.vorMin >= 0 ? 'in der nächsten Minute' : s.news.naechsterAbruf.text]);
    }
    zeile(t, ['Bilder noch ausstehend', String(s.news.bilderOffen)]);
    if (s.agenda) {
      var naechste = s.agenda.eintraege.map(function (a) { return a.von.split('-').reverse().join('.') + ' ' + a.titel; }).join(' / ');
      var agendaText = !s.agenda.an ? 'ausgeschaltet'
        : (s.beispiel ? '' : vor(s.agenda.letzterErfolg) + ', ') + s.agenda.eintraege.length + ' kommende Einträge' + (naechste ? ': ' + naechste : '');
      zeile(t, ['Agenda zuletzt geladen', agendaText],
        [null, !s.agenda.an ? '' : (s.agenda.fehler ? 'schlecht' : (s.agenda.eintraege.length ? 'gut' : ''))]);
    }
    var solarText = { aus: 'ausgeschaltet', beispiel: 'Beispieldaten', empfang: 'Zusatzgerät' }[s.solar.quelle] || s.solar.quelle;
    zeile(t, ['Solar', solarText + (s.solar.quelle !== 'aus' ? ', zuletzt ' + vor(s.solar.letzterEmpfang) : '')],
      [null, s.solar.quelle === 'aus' ? '' : (s.solar.werte ? 'gut' : 'schlecht')]);
    zeile(t, ['Anzeige am Empfang hat zuletzt Daten geholt', vor(s.anzeige.zuletzt)],
      [null, s.anzeige.zuletzt && s.anzeige.zuletzt.vorMin <= 5 ? 'gut' : (s.inBetrieb ? 'schlecht' : '')]);
    if (s.anzeigeExtern) {
      zeile(t, ['Externe Anzeige (nur News und Agenda)', s.anzeigeExtern.eingerichtet ? 'Schlüssel eingerichtet, zuletzt Daten geholt: ' + vor(s.anzeigeExtern.zuletzt) : 'kein Schlüssel eingerichtet']);
    }
    zeile(t, ['Jetzt in der Betriebszeit', s.inBetrieb ? 'ja' : 'nein']);
    zeile(t, ['Warnungen per E-Mail', s.mailEingerichtet ? 'eingerichtet' : 'nicht eingerichtet']);

    var b = $('besuche');
    b.textContent = '';
    b.parentNode.className = 'tabelle besuchstabelle';
    if (!s.besuche.length) { zeile(b, ['Keine Besuche eingetragen.', '', '']); }
    s.besuche.forEach(function (x) { zeile(b, [x.tag + ', ' + x.zeit, x.firma, x.name || '']); });

    var v = $('verworfen');
    v.textContent = '';
    (k.verworfen || []).forEach(function (x) {
      var li = document.createElement('li');
      li.textContent = x.grund + ': ' + x.anzahl;
      v.appendChild(li);
    });
    zeige('verworfenBlock', (k.verworfen || []).length > 0);

    if (!formularGefuellt) { fuelleFormular(s.einstellungen); }
  }

  function lade() {
    return anfrage('GET', '/api/status').then(function (r) {
      if (r.status === 200 && r.inhalt.ok) { zeigeStatus(r.inhalt); return; }
      zeige('inhalt', false);
      zeige('anmeldung', true);
    }).catch(function () {
      $('anmeldefehler').textContent = 'Keine Verbindung zum Server.';
      zeige('anmeldung', true);
    });
  }

  $('anmeldeformular').addEventListener('submit', function (ereignis) {
    ereignis.preventDefault();
    $('anmeldefehler').textContent = '';
    anfrage('POST', '/api/status/anmelden', { passwort: $('passwort').value }).then(function (r) {
      $('passwort').value = '';
      if (r.status === 200 && r.inhalt.ok) { lade(); }
      else { $('anmeldefehler').textContent = r.inhalt.fehler || 'Anmeldung fehlgeschlagen.'; }
    }).catch(function () { $('anmeldefehler').textContent = 'Keine Verbindung zum Server.'; });
  });

  formular.addEventListener('submit', function (ereignis) {
    ereignis.preventDefault();
    $('gespeichert').textContent = 'Speichere …';
    anfrage('POST', '/api/status/einstellungen', leseFormular()).then(function (r) {
      if (r.status === 200 && r.inhalt.ok) {
        fuelleFormular(r.inhalt.einstellungen);
        $('gespeichert').textContent = 'Gespeichert. Der Fernseher übernimmt die Änderung innert einer Minute.';
        lade();
      } else if (r.status === 401) { lade(); }
      else { $('gespeichert').textContent = r.inhalt.fehler || 'Speichern fehlgeschlagen.'; }
    }).catch(function () { $('gespeichert').textContent = 'Keine Verbindung zum Server.'; });
  });

  $('neuLaden').addEventListener('click', lade);

  $('kalenderJetzt').addEventListener('click', function () {
    var knopf = $('kalenderJetzt');
    knopf.disabled = true;
    anfrage('POST', '/api/status/kalender-jetzt', {}).then(function (r) {
      knopf.disabled = false;
      if (r.status === 200 && r.inhalt.ok) { zeigeStatus(r.inhalt); } else { lade(); }
    }).catch(function () { knopf.disabled = false; });
  });

  $('abmelden').addEventListener('click', function () {
    anfrage('POST', '/api/status/abmelden', {}).then(function () { formularGefuellt = false; lade(); });
  });

  lade();
  window.setInterval(function () { if (!$('inhalt').classList.contains('versteckt')) { lade(); } }, 30000);
})();
