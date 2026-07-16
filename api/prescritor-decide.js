// POST /api/prescritor-decide — aprovar/recusar cadastro de prescritor (admin autenticado).
// approve: cria usuário no Firebase Auth + prescriber_access/{email} (gate das rules) +
//          e-mail via Resend com link pra definir a senha. Sempre devolve o link ao painel
//          (fallback: enquanto o domínio não estiver verificado no Resend, o envio a terceiros
//          falha — o admin copia o link e manda por WhatsApp/e-mail).
// reject:  marca rejected, desativa o usuário (se existir) e remove o prescriber_access.
const { getDb, verifyAdmin, admin, FieldValue } = require("./_lib/backend");

async function sendApprovalEmail(to, nome, resetLink) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || "Site A Fórmula <onboarding@resend.dev>",
      to: [to],
      subject: "Cadastro aprovado — Área do Prescritor A Fórmula",
      text:
        `Olá, ${nome}!\n\nSeu cadastro na Área do Prescritor da A Fórmula foi aprovado.\n\n` +
        `Defina sua senha de acesso neste link:\n${resetLink}\n\n` +
        `Depois é só entrar em https://aformula-institucional.vercel.app/area-do-prescritor com seu e-mail e a senha criada.\n\n` +
        `Equipe A Fórmula`,
    }),
  });
  return r.ok;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const adminEmail = await verifyAdmin(req);
  if (!adminEmail) return res.status(403).json({ ok: false, error: "not-admin" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const id = String(body.id || "");
  const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
  if (!id || !action) return res.status(400).json({ ok: false, error: "validation" });

  const db = getDb();
  const ref = db.collection("prescribers").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ ok: false, error: "not-found" });
  const p = snap.data();

  if (action === "reject") {
    await ref.update({ status: "rejected", decidedBy: adminEmail, decidedAt: FieldValue.serverTimestamp() });
    await db.collection("prescriber_access").doc(p.email).delete().catch(() => {});
    try {
      const u = await admin.auth().getUserByEmail(p.email);
      await admin.auth().updateUser(u.uid, { disabled: true });
    } catch (_) { /* usuário nunca criado — ok */ }
    return res.status(200).json({ ok: true, status: "rejected" });
  }

  // approve
  let user;
  try { user = await admin.auth().getUserByEmail(p.email); }
  catch (_) {
    const tempPw = "Af!" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8).toUpperCase();
    user = await admin.auth().createUser({ email: p.email, displayName: p.nome, password: tempPw });
  }
  if (user.disabled) await admin.auth().updateUser(user.uid, { disabled: false });

  await db.collection("prescriber_access").doc(p.email).set({
    uid: user.uid, prescriberId: id, nome: p.nome,
    approvedBy: adminEmail, approvedAt: FieldValue.serverTimestamp(),
  });
  await ref.update({ status: "approved", uid: user.uid, decidedBy: adminEmail, decidedAt: FieldValue.serverTimestamp() });

  const resetLink = await admin.auth().generatePasswordResetLink(p.email);
  const emailSent = await sendApprovalEmail(p.email, p.nome, resetLink).catch(() => false);

  return res.status(200).json({ ok: true, status: "approved", emailSent, resetLink });
};
