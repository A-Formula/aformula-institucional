// POST /api/publish — dispara a republicação do site (admin autenticado).
// Verifica o ID token do Firebase (precisa ser admin) e aciona o Deploy Hook da Vercel,
// que roda o buildCommand (regenera o site a partir do Firestore).
// Env: FIREBASE_SERVICE_ACCOUNT (verificação do token) + DEPLOY_HOOK_URL (gatilho de deploy).
const admin = require("firebase-admin");

function initAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const hook = process.env.DEPLOY_HOOK_URL;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa || !hook) return res.status(503).json({ ok: false, error: "not-configured" });

  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "no-token" });

  try {
    initAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    const snap = await admin.firestore().collection("admins").doc(email).get();
    if (!snap.exists) return res.status(403).json({ ok: false, error: "not-admin" });
  } catch (e) {
    return res.status(401).json({ ok: false, error: "invalid-token" });
  }

  try {
    const r = await fetch(hook, { method: "POST" });
    if (!r.ok) throw new Error("hook " + r.status);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "hook-failed" });
  }
};
