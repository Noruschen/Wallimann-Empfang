// Baustein «News»: liest die neusten Artikel von michelnews.ch (Startseite oder RSS-Feed).
// Reines ES-Modul ohne Abhängigkeiten, läuft in Node 22 und in Cloudflare Workers.
// Rechenzeit: Die Startseite wird mit indexOf in Abschnitte und Artikel zerlegt,
// reguläre Ausdrücke laufen nur auf kurzen Ausschnitten.

const STANDARD_BASIS = 'https://michelnews.ch';

// Die drei Bereiche mit echten Artikeln. Leserbilder, Meistgelesen, Agenda usw. fehlen absichtlich.
const BEREICHE = ['template-top', 'template-second', 'template-list'];

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ss', eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ccedil: 'ç',
  laquo: '«', raquo: '»', ndash: '-', mdash: '-', hellip: '...',
  lsquo: '’', rsquo: '’', ldquo: '«', rdquo: '»', bdquo: '«',
};

function entitiesAufloesen(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (voll, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (!Number.isFinite(code) || code > 0x10ffff) return voll;
      const zeichen = String.fromCodePoint(code);
      return zeichen === '\u00df' ? 'ss' : zeichen;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : voll;
  });
}

// Entfernt Tags, löst Entities auf, zieht Leerraum zusammen. Leer ergibt null.
function bereinigen(text) {
  if (text == null) return null;
  const ohneTags = text.replace(/<[^>]*>/g, ' ');
  const sauber = entitiesAufloesen(ohneTags).replace(/\s+/g, ' ').trim();
  return sauber === '' ? null : sauber;
}

function absolut(url, basis) {
  if (!url) return null;
  try {
    return new URL(url.trim(), basis).href;
  } catch {
    return null;
  }
}

function attribut(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  if (!m) return null;
  return entitiesAufloesen(m[1] ?? m[2]);
}

// Gibt das ganze Start-Tag ab Position von (inklusive «>») zurück.
function startTag(html, von) {
  const ende = html.indexOf('>', von);
  return ende === -1 ? html.slice(von) : html.slice(von, ende + 1);
}

function datumAusKurzform(text) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/.exec(text);
  if (!m) return null;
  const jahr = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${jahr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Stabil: bei gleichem Datum bleibt die Reihenfolge der Quelle. Ohne Datum ans Ende.
function nachDatumAbsteigend(liste) {
  return liste
    .map((a, i) => [a, i])
    .sort((x, y) => {
      const dx = x[0].datum ?? '';
      const dy = y[0].datum ?? '';
      if (dx !== dy) return dx < dy ? 1 : -1;
      return x[1] - y[1];
    })
    .map(([a]) => a);
}

function ohneDoppelte(liste) {
  const gesehen = new Set();
  return liste.filter((a) => {
    if (gesehen.has(a.link)) return false;
    gesehen.add(a.link);
    return true;
  });
}

function leseStartseitenArtikel(chunk, basis) {
  const kopf = chunk.indexOf('itemprop="headline"');
  if (kopf === -1) return null;
  const aStart = chunk.indexOf('<a', kopf);
  const aEnde = chunk.indexOf('</a>', aStart);
  if (aStart === -1 || aEnde === -1) return null;
  const aTag = startTag(chunk, aStart);
  const link = absolut(attribut(aTag, 'href'), basis);
  const titel = bereinigen(chunk.slice(aStart + aTag.length, aEnde)) ?? bereinigen(attribut(aTag, 'title'));
  if (!link || !titel) return null;

  // Bild: erstes img, das nicht das Bezahl-Symbol ist.
  let bildUrl = null;
  let bezahlt = false;
  let pos = 0;
  while ((pos = chunk.indexOf('<img', pos)) !== -1) {
    const tag = startTag(chunk, pos);
    pos += 4;
    const klasse = attribut(tag, 'class') ?? '';
    const src = attribut(tag, 'src') ?? '';
    if (klasse.includes('paid-marker') || src.includes('paid.svg')) {
      bezahlt = true;
    } else if (bildUrl === null && src) {
      bildUrl = absolut(src, basis);
    }
  }

  // Rubrik: normal in span.cat-name, beim Aufmacher in div.cat-tag.
  let rubrik = null;
  const cat = chunk.indexOf('class="cat-name"');
  if (cat !== -1) {
    const von = chunk.indexOf('>', cat) + 1;
    rubrik = bereinigen(chunk.slice(von, chunk.indexOf('</span>', von)));
  } else {
    const tag = chunk.indexOf('class="cat-tag"');
    if (tag !== -1) {
      const span = chunk.indexOf('<span', tag);
      if (span !== -1) {
        const von = chunk.indexOf('>', span) + 1;
        rubrik = bereinigen(chunk.slice(von, chunk.indexOf('</span>', von)));
      }
    }
  }

  // Ort und Datum: news-meta nach der Überschrift, Form «Ort - 25.11.26».
  let ort = null;
  let datum = null;
  const meta = chunk.indexOf('class="news-meta"', aEnde);
  if (meta !== -1) {
    const von = chunk.indexOf('>', meta) + 1;
    const text = bereinigen(chunk.slice(von, chunk.indexOf('</div>', von))) ?? '';
    datum = datumAusKurzform(text);
    const rest = datum ? text.replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/, '') : text;
    ort = bereinigen(rest.replace(/[\s-]+$/, '').replace(/^[\s-]+/, ''));
  }

  return { titel, link, ort, rubrik, datum, bildUrl, bezahlt };
}

export function leseStartseite(html, basisUrl = STANDARD_BASIS) {
  if (typeof html !== 'string' || html === '') return [];
  const artikel = [];
  for (const bereich of BEREICHE) {
    const start = html.indexOf(`news-list-view ${bereich}`);
    if (start === -1) continue;
    let ende = html.indexOf('news-list-view', start + 20);
    if (ende === -1) ende = html.length;
    let pos = html.indexOf('news-list-item', start);
    while (pos !== -1 && pos < ende) {
      let naechster = html.indexOf('news-list-item', pos + 14);
      if (naechster === -1 || naechster > ende) naechster = ende;
      const a = leseStartseitenArtikel(html.slice(pos, naechster), basisUrl);
      if (a) artikel.push(a);
      pos = naechster < ende ? naechster : -1;
    }
  }
  return nachDatumAbsteigend(ohneDoppelte(artikel));
}

// ---------------- Agenda ----------------

// Datum eines Agenda-Eintrags: «26.11.2026» oder ein Zeitraum «10.10.2026 - 29.11.2026».
function agendaDatum(text) {
  const alle = (text ?? '').match(/\d{1,2}\.\d{1,2}\.\d{4}/g) || [];
  const von = alle.length ? datumAusKurzform(alle[0]) : null;
  const bis = alle.length > 1 ? datumAusKurzform(alle[alle.length - 1]) : von;
  if (!von || !bis || bis < von) return von ? { von, bis: von } : null;
  return { von, bis };
}

function textNach(chunk, marke, endTag) {
  const pos = chunk.indexOf(marke);
  if (pos === -1) return null;
  const von = chunk.indexOf('>', pos) + 1;
  const bis = chunk.indexOf(endTag, von);
  if (von === 0 || bis === -1) return null;
  return bereinigen(chunk.slice(von, bis));
}

function leseAgendaEintrag(roh, basis) {
  // Die Seite enthält auskommentierte Varianten einzelner Felder. Sie zählen nicht.
  const chunk = roh.replace(/<!--[\s\S]*?-->/g, '');
  const kopf = chunk.indexOf('class="event-title"');
  if (kopf === -1) return null;
  const aStart = chunk.indexOf('<a', kopf);
  const aEnde = chunk.indexOf('</a>', aStart);
  if (aStart === -1 || aEnde === -1) return null;
  const aTag = startTag(chunk, aStart);
  const link = absolut(attribut(aTag, 'href'), basis);
  const titel = bereinigen(chunk.slice(aStart + aTag.length, aEnde));
  const datum = agendaDatum(textNach(chunk, 'event-startdate', '</div>'));
  if (!link || !/^https:\/\//.test(link) || !titel || !datum) return null;

  let bildUrl = null;
  let bildBreite = null;
  let bildHoehe = null;
  const bildfeld = chunk.indexOf('event-image');
  const img = bildfeld === -1 || bildfeld > kopf ? -1 : chunk.indexOf('<img', bildfeld);
  if (img !== -1 && img < kopf) {
    const tag = startTag(chunk, img);
    bildUrl = absolut(attribut(tag, 'src'), basis);
    bildBreite = zahlOderNull(attribut(tag, 'width'));
    bildHoehe = zahlOderNull(attribut(tag, 'height'));
  }
  return {
    titel,
    link,
    von: datum.von,
    bis: datum.bis,
    rubrik: textNach(chunk, 'class="event-category"', '</div>'),
    ort: textNach(chunk, 'event-location"', '</div>'),
    bildUrl,
    bildBreite,
    bildHoehe,
  };
}

// Liest die Agenda von der Startseite von michelnews.ch (Bereich «Agenda», höchstens 20 Einträge).
// Die Reihenfolge der Seite bleibt erhalten. Einträge ohne Datum oder Titel fallen weg.
export function leseAgenda(html, basisUrl = STANDARD_BASIS) {
  if (typeof html !== 'string' || html === '') return [];
  const start = html.indexOf('event-slider');
  if (start === -1) return [];
  const eintraege = [];
  const marke = 'class="event-list-item';
  let pos = html.indexOf(marke, start);
  while (pos !== -1 && eintraege.length < 20) {
    const naechster = html.indexOf(marke, pos + marke.length);
    const ende = naechster === -1 ? Math.min(html.length, pos + 8000) : Math.min(naechster, pos + 8000);
    const anfang = html.lastIndexOf('<', pos);
    const e = leseAgendaEintrag(html.slice(anfang === -1 ? pos : anfang, ende), basisUrl);
    if (e) eintraege.push(e);
    pos = naechster;
  }
  return ohneDoppelte(eintraege);
}

export function leseArtikelBild(html) {
  if (typeof html !== 'string') return null;
  let bildUrl = null;
  let breite = null;
  let hoehe = null;
  let pos = 0;
  while ((pos = html.indexOf('<meta', pos)) !== -1) {
    const tag = startTag(html, pos);
    pos += 5;
    const prop = attribut(tag, 'property');
    if (!prop || !prop.startsWith('og:image')) continue;
    const inhalt = attribut(tag, 'content');
    if (prop === 'og:image' && bildUrl === null) bildUrl = inhalt;
    else if (prop === 'og:image:width') breite = parseInt(inhalt, 10);
    else if (prop === 'og:image:height') hoehe = parseInt(inhalt, 10);
  }
  if (!bildUrl) return null;
  return {
    bildUrl,
    breite: Number.isFinite(breite) ? breite : null,
    hoehe: Number.isFinite(hoehe) ? hoehe : null,
  };
}

// Inhalt eines Elements, CDATA wird übernommen, sonst Entities aufgelöst.
function feldText(chunk, name) {
  const start = chunk.indexOf(`<${name}`);
  if (start === -1) return null;
  const nach = chunk[start + name.length + 1];
  if (nach !== '>' && nach !== ' ' && nach !== '/' && nach !== '\n' && nach !== '\t') return null;
  const von = chunk.indexOf('>', start) + 1;
  const ende = chunk.indexOf(`</${name}>`, von);
  if (ende === -1) return null;
  return elementInhalt(chunk.slice(von, ende));
}

function elementInhalt(roh) {
  const t = roh.trim();
  if (t.startsWith('<![CDATA[')) {
    const e = t.indexOf(']]>');
    return bereinigen(t.slice(9, e === -1 ? undefined : e));
  }
  return bereinigen(t);
}

const MONATE = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Datum so, wie es im Feed steht (ohne Zeitzonenumrechnung).
function feedDatum(text) {
  if (!text) return null;
  const rfc = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(text);
  if (rfc && MONATE[rfc[2].toLowerCase()]) {
    return `${rfc[3]}-${String(MONATE[rfc[2].toLowerCase()]).padStart(2, '0')}-${rfc[1].padStart(2, '0')}`;
  }
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function zahlOderNull(text) {
  const n = parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}

function leseFeedEintrag(chunk, basis) {
  const titel = feldText(chunk, 'title');
  const link = absolut(feldText(chunk, 'link'), basis);
  if (!titel || !link) return null;

  let rubrik = null;
  let ort = null;
  let pos = 0;
  while ((pos = chunk.indexOf('<category', pos)) !== -1) {
    const tag = startTag(chunk, pos);
    const ende = chunk.indexOf('</category>', pos);
    pos += 9;
    if (ende === -1) break;
    const text = elementInhalt(chunk.slice(pos - 9 + tag.length, ende));
    const domain = attribut(tag, 'domain');
    if (domain === null) {
      if (rubrik === null) rubrik = text;
    } else if (domain.toLowerCase() === 'ort' && ort === null) {
      ort = text;
    }
  }

  let bildUrl = null;
  let bildBreite = null;
  let bildHoehe = null;
  pos = 0;
  while (bildUrl === null && (pos = chunk.indexOf('<enclosure', pos)) !== -1) {
    const tag = startTag(chunk, pos);
    pos += 10;
    if ((attribut(tag, 'type') ?? '').toLowerCase().startsWith('image/')) {
      bildUrl = absolut(attribut(tag, 'url'), basis);
    }
  }
  pos = 0;
  while ((pos = chunk.indexOf('<media:content', pos)) !== -1) {
    const tag = startTag(chunk, pos);
    pos += 14;
    const typ = (attribut(tag, 'type') ?? 'image/').toLowerCase();
    const medium = (attribut(tag, 'medium') ?? 'image').toLowerCase();
    if (!typ.startsWith('image/') || medium !== 'image') continue;
    const url = absolut(attribut(tag, 'url'), basis);
    if (!url) continue;
    if (bildUrl === null || bildUrl === url) {
      bildUrl = url;
      bildBreite = zahlOderNull(attribut(tag, 'width'));
      bildHoehe = zahlOderNull(attribut(tag, 'height'));
      break;
    }
  }

  const a = { titel, link, ort, rubrik, datum: feedDatum(feldText(chunk, 'pubDate')), bildUrl, bezahlt: false };
  if (bildBreite !== null) a.bildBreite = bildBreite;
  if (bildHoehe !== null) a.bildHoehe = bildHoehe;
  return a;
}

export function leseFeed(xml, basisUrl = STANDARD_BASIS) {
  if (typeof xml !== 'string' || xml === '') return [];
  const artikel = [];
  let pos = 0;
  while ((pos = xml.indexOf('<item', pos)) !== -1) {
    const nach = xml[pos + 5];
    if (nach !== '>' && nach !== ' ' && nach !== '\n' && nach !== '\t' && nach !== '\r') {
      pos += 5;
      continue;
    }
    const ende = xml.indexOf('</item>', pos);
    if (ende === -1) break;
    const a = leseFeedEintrag(xml.slice(pos, ende), basisUrl);
    if (a) artikel.push(a);
    pos = ende + 7;
  }
  return nachDatumAbsteigend(ohneDoppelte(artikel));
}

export function filtereNews(artikel, { orte = [], rubriken = [] } = {}) {
  const klein = (liste) => new Set(liste.map((x) => String(x).trim().toLowerCase()));
  const o = klein(orte);
  const r = klein(rubriken);
  return artikel.filter(
    (a) =>
      (o.size === 0 || (a.ort != null && o.has(a.ort.toLowerCase()))) &&
      (r.size === 0 || (a.rubrik != null && r.has(a.rubrik.toLowerCase()))),
  );
}

export async function holeNews({
  feedUrl,
  startseiteUrl = 'https://michelnews.ch/',
  abruf = fetch,
  max = 10,
  filter,
  beiStartseite, // wird mit dem Text der Startseite aufgerufen, falls sie geladen wurde (für die Agenda)
} = {}) {
  const url = feedUrl || startseiteUrl;
  const quelle = feedUrl ? 'Feed' : 'Startseite';
  let text;
  try {
    const antwort = await abruf(url);
    if (!antwort.ok) {
      throw new Error(`HTTP-Status ${antwort.status}`);
    }
    text = await antwort.text();
  } catch (fehler) {
    throw new Error(`News konnten nicht geladen werden (${quelle} ${url}): ${fehler?.message ?? fehler}`);
  }
  if (!feedUrl && typeof beiStartseite === 'function') beiStartseite(text, url);
  let artikel = feedUrl ? leseFeed(text, url) : leseStartseite(text, url);
  if (artikel.length === 0) {
    throw new Error(
      `Keine Artikel in der ${quelle} gefunden (${url}). Vermutlich hat sich der Aufbau der Quelle geändert.`,
    );
  }
  if (filter) artikel = filtereNews(artikel, filter);
  return artikel.slice(0, max);
}

export function bildDarstellung(breite, hoehe, zielBreite = 1920) {
  return Number.isFinite(breite) && breite >= zielBreite * 0.6 ? 'gross' : 'klein';
}
