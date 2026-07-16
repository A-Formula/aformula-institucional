// POST /api/newsletter — inscrição (home + área do prescritor)
// Body: { email, source?, website? (honeypot) }
const { getDb, guard, isEmail, FieldValue } = require("./_lib/backend");

module.exports = async (req, res) => {
  const body = guard(req, res);
  if (!body) return;

  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const source = String(body.source || "site").trim().slice(0, 60);
  if (!isEmail(email)) return res.status(400).json({ ok: false, error: "validation" });

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  // doc id = e-mail → inscrição idempotente (re-inscrever não duplica)
  await db.collection("newsletter").doc(email).set({
    email, source, consent: true, createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return res.status(200).json({ ok: true });
};
