// Zugriff auf die Datenbank (Cloudflare D1).
// Gespeichert wird so wenig wie möglich:
//   besuche   Firma, Name und Zeit der Besuche von heute und morgen
//   news      Titel, Ort, Rubrik, Datum und Bildverweis der neusten Artikel
//   agenda    Titel, Ort, Rubrik, Datum und Bildverweis der nächsten Veranstaltungen von michelnews.ch
//   zustand   Zeitpunkte der letzten Abrufe, Einstellungen, Solarwerte
//   versuche  Zähler für falsche Passwörter (nur ein Hashwert des Absenders, keine IP-Adresse)

const TABELLEN = [
  `CREATE TABLE IF NOT EXISTS besuche (
     uid TEXT PRIMARY KEY, start INTEGER NOT NULL, ende INTEGER,
     firma TEXT NOT NULL, name TEXT, ansprechperson TEXT)`,
  `CREATE TABLE IF NOT EXISTS news (
     link TEXT PRIMARY KEY, titel TEXT NOT NULL, ort TEXT, rubrik TEXT, datum TEXT,
     rang INTEGER NOT NULL, gesehen INTEGER NOT NULL,
     quelle_bild TEXT, bild TEXT, bild_breite INTEGER, bild_hoehe INTEGER,
     artikel_geprueft INTEGER NOT NULL DEFAULT 0, fehlversuche INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS agenda (
     link TEXT PRIMARY KEY, titel TEXT NOT NULL, ort TEXT, rubrik TEXT, von TEXT NOT NULL, bis TEXT NOT NULL,
     rang INTEGER NOT NULL, gesehen INTEGER NOT NULL,
     quelle_bild TEXT, bild TEXT, bild_breite INTEGER, bild_hoehe INTEGER, bild_zeit INTEGER,
     fehlversuche INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS zustand (name TEXT PRIMARY KEY, wert TEXT)`,
  `CREATE TABLE IF NOT EXISTS versuche (
     absender TEXT PRIMARY KEY, anzahl INTEGER NOT NULL, erster INTEGER NOT NULL,
     gesperrt_bis INTEGER NOT NULL DEFAULT 0)`,
];

let tabellenBereit = false;

// Legt die Tabellen an, falls es sie noch nicht gibt. So braucht es keinen eigenen
// Einrichtungsschritt für die Datenbank, weder lokal noch bei Cloudflare.
export async function stelleTabellenSicher(db) {
  if (tabellenBereit) return;
  await db.batch(TABELLEN.map((sql) => db.prepare(sql)));
  tabellenBereit = true;
}

// ---------- Zustand und Einstellungen ----------

export async function ladeZustand(db) {
  const { results } = await db.prepare('SELECT name, wert FROM zustand').all();
  const z = {};
  for (const zeile of results) {
    try { z[zeile.name] = JSON.parse(zeile.wert); } catch { z[zeile.name] = null; }
  }
  return z;
}

export async function setzeZustand(db, eintraege) {
  const namen = Object.keys(eintraege);
  if (!namen.length) return;
  await db.batch(namen.map((name) => db
    .prepare('INSERT INTO zustand (name, wert) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET wert = ?2')
    .bind(name, JSON.stringify(eintraege[name]))));
}

// ---------- Besuche ----------

// Ersetzt alle gespeicherten Besuche durch die frisch gelesenen. Abgesagte Termine
// verschwinden damit von selbst. Die Spalten «ende» und «ansprechperson» bleiben aus
// früheren Versionen bestehen und sind immer leer.
export async function ersetzeBesuche(db, besuche) {
  const schritte = [db.prepare('DELETE FROM besuche')];
  for (const b of besuche) {
    schritte.push(db
      .prepare('INSERT OR REPLACE INTO besuche (uid, start, ende, firma, name, ansprechperson) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(b.uid, Date.parse(b.start), null, b.firma, b.name ?? null, null));
  }
  await db.batch(schritte);
}

export async function ladeBesuche(db, vonMs, bisMs) {
  const { results } = await db
    .prepare('SELECT uid, start, ende, firma, name FROM besuche WHERE start >= ?1 AND start < ?2 ORDER BY start, firma')
    .bind(vonMs, bisMs).all();
  return results;
}

export async function loescheBesucheVor(db, grenzeMs) {
  await db.prepare('DELETE FROM besuche WHERE start < ?1').bind(grenzeMs).run();
}

// ---------- News ----------

// Übernimmt die frisch gelesene Liste. Bestehende Artikel behalten ihr gespeichertes Bild.
// Artikel, die nicht mehr in der Liste stehen, werden entfernt.
export async function ersetzeNewsListe(db, artikel, jetzt) {
  const schritte = [];
  artikel.forEach((a, rang) => {
    const ausFeed = a.ausFeed === true;
    schritte.push(db.prepare(
      `INSERT INTO news (link, titel, ort, rubrik, datum, rang, gesehen, quelle_bild, bild_breite, bild_hoehe, artikel_geprueft)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(link) DO UPDATE SET titel = ?2, ort = ?3, rubrik = ?4, datum = ?5, rang = ?6, gesehen = ?7`,
    ).bind(
      a.link, a.titel, a.ort ?? null, a.rubrik ?? null, a.datum ?? null, rang, jetzt,
      ausFeed ? (a.bildUrl ?? null) : null,
      ausFeed ? (a.bildBreite ?? null) : null,
      ausFeed ? (a.bildHoehe ?? null) : null,
      ausFeed ? 1 : 0,
    ));
  });
  schritte.push(db.prepare('DELETE FROM news WHERE gesehen < ?1').bind(jetzt));
  await db.batch(schritte);
}

export async function ladeNews(db, anzahl) {
  const { results } = await db
    .prepare('SELECT link, titel, ort, rubrik, datum, bild, bild_breite, bild_hoehe FROM news ORDER BY rang LIMIT ?1')
    .bind(anzahl).all();
  return results;
}

export async function zaehleOffeneBilder(db) {
  const zeile = await db
    .prepare(`SELECT
       (SELECT COUNT(*) FROM news WHERE bild IS NULL AND fehlversuche < 3 AND (artikel_geprueft = 0 OR quelle_bild IS NOT NULL))
       + (SELECT COUNT(*) FROM agenda WHERE bild IS NULL AND fehlversuche < 3 AND quelle_bild IS NOT NULL) AS n`)
    .first();
  return zeile ? zeile.n : 0;
}

// Der nächste Artikel, bei dem noch etwas fehlt: zuerst die Artikelseite prüfen, dann das Bild holen.
// Sind die News vollständig, kommen die Bilder der Agenda an die Reihe.
export async function naechsterBildSchritt(db) {
  const news = await db
    .prepare(`SELECT link, quelle_bild, artikel_geprueft FROM news
              WHERE bild IS NULL AND fehlversuche < 3 AND (artikel_geprueft = 0 OR quelle_bild IS NOT NULL)
              ORDER BY rang LIMIT 1`)
    .first();
  if (news) return news;
  const agenda = await db
    .prepare(`SELECT link, quelle_bild FROM agenda
              WHERE bild IS NULL AND fehlversuche < 3 AND quelle_bild IS NOT NULL
              ORDER BY rang LIMIT 1`)
    .first();
  return agenda ? { ...agenda, artikel_geprueft: 1, agenda: true } : null;
}

export async function merkeArtikelBild(db, link, quelle) {
  await db
    .prepare('UPDATE news SET artikel_geprueft = 1, fehlversuche = 0, quelle_bild = ?2, bild_breite = ?3, bild_hoehe = ?4 WHERE link = ?1')
    .bind(link, quelle ? quelle.bildUrl : null, quelle ? (quelle.breite ?? null) : null, quelle ? (quelle.hoehe ?? null) : null)
    .run();
}

export async function merkeGespeichertesBild(db, link, bildSchluessel) {
  await db.prepare('UPDATE news SET bild = ?2, fehlversuche = 0 WHERE link = ?1').bind(link, bildSchluessel).run();
}

export async function zaehleFehlversuch(db, link) {
  await db.prepare('UPDATE news SET fehlversuche = fehlversuche + 1 WHERE link = ?1').bind(link).run();
}

// ---------- Agenda ----------

// Übernimmt die frisch gelesene Agenda. Bestehende Einträge behalten ihr gespeichertes Bild,
// ausser die Quelle des Bildes hat gewechselt oder das Bild ist älter als bildMaxAlterMs
// (der Bildspeicher löscht Bilder nach 40 Tagen). Einträge, die fehlen, werden entfernt.
export async function ersetzeAgenda(db, eintraege, jetzt, bildMaxAlterMs) {
  const schritte = [];
  const grenze = jetzt - bildMaxAlterMs;
  eintraege.forEach((a, rang) => {
    schritte.push(db.prepare(
      `INSERT INTO agenda (link, titel, ort, rubrik, von, bis, rang, gesehen, quelle_bild, bild_breite, bild_hoehe)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(link) DO UPDATE SET titel = ?2, ort = ?3, rubrik = ?4, von = ?5, bis = ?6, rang = ?7, gesehen = ?8,
         bild = CASE WHEN quelle_bild IS ?9 AND bild_zeit >= ?12 THEN bild ELSE NULL END,
         fehlversuche = CASE WHEN quelle_bild IS ?9 AND bild_zeit >= ?12 THEN fehlversuche ELSE 0 END,
         quelle_bild = ?9, bild_breite = ?10, bild_hoehe = ?11`,
    ).bind(a.link, a.titel, a.ort ?? null, a.rubrik ?? null, a.von, a.bis, rang, jetzt,
      a.bildUrl ?? null, a.bildBreite ?? null, a.bildHoehe ?? null, grenze));
  });
  schritte.push(db.prepare('DELETE FROM agenda WHERE gesehen < ?1').bind(jetzt));
  await db.batch(schritte);
}

// Die nächsten Veranstaltungen: alles, was heute (Datum als JJJJ-MM-TT) noch nicht vorbei ist.
export async function ladeAgenda(db, heute, anzahl) {
  const { results } = await db
    .prepare(`SELECT link, titel, ort, rubrik, von, bis, bild, bild_breite, bild_hoehe FROM agenda
              WHERE bis >= ?1 ORDER BY rang LIMIT ?2`)
    .bind(heute, anzahl).all();
  return results;
}

export async function merkeAgendaBild(db, link, bildSchluessel, jetzt) {
  await db.prepare('UPDATE agenda SET bild = ?2, bild_zeit = ?3, fehlversuche = 0 WHERE link = ?1').bind(link, bildSchluessel, jetzt).run();
}

export async function zaehleAgendaFehlversuch(db, link) {
  await db.prepare('UPDATE agenda SET fehlversuche = fehlversuche + 1 WHERE link = ?1').bind(link).run();
}

// ---------- Bremse bei falschen Passwörtern ----------

// Zählt einen Anmeldeversuch, und zwar bevor das Passwort geprüft wird und in einem einzigen
// Schritt der Datenbank. Viele gleichzeitige Versuche bekommen so je eine eigene Nummer.
// Ist das Zeitfenster abgelaufen oder eine alte Sperre vorbei, beginnt die Zählung neu.
export async function zaehleVersuch(db, absender, jetzt, fensterMs) {
  const z = await db
    .prepare(`INSERT INTO versuche (absender, anzahl, erster, gesperrt_bis) VALUES (?1, 1, ?2, 0)
              ON CONFLICT(absender) DO UPDATE SET
                anzahl = CASE WHEN (?2 - erster > ?3) OR (gesperrt_bis > 0 AND gesperrt_bis <= ?2) THEN 1 ELSE anzahl + 1 END,
                erster = CASE WHEN (?2 - erster > ?3) OR (gesperrt_bis > 0 AND gesperrt_bis <= ?2) THEN ?2 ELSE erster END,
                gesperrt_bis = CASE WHEN gesperrt_bis > ?2 THEN gesperrt_bis ELSE 0 END
              RETURNING anzahl, gesperrt_bis`)
    .bind(absender, jetzt, fensterMs).first();
  return { anzahl: z.anzahl, gesperrtBis: z.gesperrt_bis };
}

export async function sperreAbsender(db, absender, bis) {
  await db.prepare('UPDATE versuche SET gesperrt_bis = ?2 WHERE absender = ?1 AND gesperrt_bis < ?2').bind(absender, bis).run();
}

export async function loescheVersuch(db, absender) {
  await db.prepare('DELETE FROM versuche WHERE absender = ?1').bind(absender).run();
}

export async function raeumeVersuche(db, grenzeMs) {
  await db.prepare('DELETE FROM versuche WHERE erster < ?1 AND gesperrt_bis < ?1').bind(grenzeMs).run();
}
