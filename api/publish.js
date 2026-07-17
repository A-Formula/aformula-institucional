// POST /api/publish?target=preview|production — dispara a republicação (admin autenticado).
//   production (padrão) → DEPLOY_HOOK_URL         → rebuild do site no ar.
//   preview             → PREVIEW_DEPLOY_HOOK_URL → rebuild da branch `staging` (URL de preview),
//                                                   pra revisar as mudanças ANTES de ir pro ar.
// Ambos leem o mesmo Firestore; a diferença é só QUAL deploy é reconstruído.
// Env: FIREBASE_SERVICE_ACCOUNT (verificação do token) + DEPLOY_HOOK_URL (+ PREVIEW_DEPLOY_HOOK_URL).
const { verifyAdmin } = require("./_lib/backend");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const target = (req.query && req.query.target) === "preview" ? "preview" : "production";
  const hook = target === "preview" ? process.env.PREVIEW_DEPLOY_HOOK_URL : process.env.DEPLOY_HOOK_URL;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !hook) {
    return res.status(503).json({ ok: false, error: "not-configured", target });
  }

  const email = await verifyAdmin(req);
  if (!email) return res.status(401).json({ ok: false, error: "unauthorized" });

  try {
    const r = await fetch(hook, { method: "POST" });
    if (!r.ok) throw new Error("hook " + r.status);
    return res.status(200).json({ ok: true, target });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "hook-failed", target });
  }
};
