// POST /api/newsletter — inscrição (home + área do prescritor)
// Body: { email, source?, website? (honeypot) }
const { getDb, guard, isEmail, sendMail, FieldValue } = require("./_lib/backend");
const { welcomeNewsletter } = require("./_lib/emails");
const { FLOWS } = require("./_lib/flows");
const { enqueueFlow } = require("./_lib/queue");

module.exports = async (req, res) => {
  const body = guard(req, res);
  if (!body) return;

  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const source = String(body.source || "site").trim().slice(0, 60);
  if (!isEmail(email)) return res.status(400).json({ ok: false, error: "validation" });

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  // doc id = e-mail → inscrição idempotente (re-inscrever não duplica)
  let isNew = false;
  try {
    const ref = db.collection("newsletter").doc(email);
    isNew = !(await ref.get()).exists;
    await ref.set({
      email, source, consent: true, createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error("[newsletter] gravação falhou:", e && e.message);
    return res.status(503).json({ ok: false, error: "database-error" });
  }

  // Boas-vindas só na PRIMEIRA inscrição (re-subscribe não reenvia). Best effort:
  // falha de e-mail não derruba a inscrição (o Firestore já é a fonte de verdade).
  if (isNew) {
    const m = welcomeNewsletter();
    await sendMail(email, m.subject, m.text, m.html)
      .catch((e) => console.error("[newsletter] boas-vindas falhou:", e && e.message));

    // Ciclo semanal (N2 valor → N3 valor → N4 valor → N5 comercial), a partir de 7 dias.
    // Só na primeira inscrição: re-inscrever não reinicia a régua nem duplica (a fila é idempotente).
    await enqueueFlow(db, { flow: "N", steps: FLOWS.N, email, dados: { email }, startAt: new Date() })
      .catch((e) => console.error("[newsletter] enqueue falhou:", e && e.message));
  }

  return res.status(200).json({ ok: true });
};
