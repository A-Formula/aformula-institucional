// POST /api/admin-delete — exclui um doc de uma coleção de leads (só admin autenticado).
// Body: { collection, id }. Whitelist evita apagar qualquer coleção.
const { getDb, verifyAdmin } = require("./_lib/backend");

const ALLOWED = ["contact_messages", "career_applications", "newsletter"];

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, error: "unauthorized" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const collection = String(body.collection || "");
  const id = String(body.id || "");
  if (!ALLOWED.includes(collection) || !id) {
    return res.status(400).json({ ok: false, error: "validation" });
  }

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  try {
    await db.collection(collection).doc(id).delete();
  } catch (e) {
    console.error("[admin-delete] falhou:", e && e.message);
    return res.status(503).json({ ok: false, error: "database-error" });
  }
  return res.status(200).json({ ok: true });
};
