// Warnungen per E-Mail über den E-Mail-Dienst von Cloudflare.
// Voraussetzung: eine eigene Domain im Cloudflare-Konto, die für den Versand eingerichtet ist,
// die Bindung EMAIL in wrangler.jsonc und auf der Statusseite Absender und Empfänger.
// Solange etwas davon fehlt, wird nichts verschickt. Die Störung steht dann nur auf der Statusseite.

export function mailEingerichtet(env, e) {
  return Boolean(env.EMAIL && e.alarmEmail && e.alarmAbsender);
}

export async function sendeMail(env, e, betreff, text) {
  if (!mailEingerichtet(env, e)) return { gesendet: false, grund: 'E-Mail ist nicht eingerichtet' };
  try {
    await env.EMAIL.send({
      to: e.alarmEmail,
      from: { email: e.alarmAbsender, name: 'Empfangsbildschirm Wallimann' },
      subject: betreff,
      text: text + '\n\nDiese Nachricht kommt automatisch vom Empfangsbildschirm. Details stehen auf der Statusseite.',
    });
    return { gesendet: true };
  } catch (fehler) {
    return { gesendet: false, grund: String((fehler && fehler.code) || 'Versand fehlgeschlagen') };
  }
}
