// POST /api/prescritor-decide — aprovar/recusar cadastro de prescritor (admin autenticado).
// approve: cria usuário no Firebase Auth + prescriber_access/{email} (gate das rules) +
//          e-mail via Resend com link pra definir a senha. Sempre devolve o link ao painel
//          (fallback: enquanto o domínio não estiver verificado no Resend, o envio a terceiros
//          falha — o admin copia o link e manda por WhatsApp/e-mail).
// reject:  marca rejected, desativa o usuário (se existir) e remove o prescriber_access.
const crypto = require("crypto");
const { getDb, verifyAdmin, sendMail, admin, FieldValue } = require("./_lib/backend");

const AREA_URL = "https://aformula-institucional.vercel.app/area-do-prescritor";

function sendApprovalEmail(to, nome, resetLink) {
  return sendMail(
    to,
    "Cadastro aprovado — Área do Prescritor A Fórmula",
    `Olá, ${nome}!\n\nSeu cadastro na Área do Prescritor da A Fórmula foi aprovado.\n\n` +
    `Defina sua senha de acesso neste link:\n${resetLink}\n\n` +
    `Depois é só entrar em ${AREA_URL} com seu e-mail e a senha criada.\n\n` +
    `Equipe A Fórmula`
  );
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
  if (!p.email) return res.status(422).json({ ok: false, error: "missing-email" });

  if (action === "reject") {
    await ref.update({ status: "rejected", decidedBy: adminEmail, decidedAt: FieldValue.serverTimestamp() });
    await db.collection("prescriber_access").doc(p.email).delete().catch(() => {});
    try {
      const u = await admin.auth().getUserByEmail(p.email);
      await admin.auth().updateUser(u.uid, { disabled: true });
      // Invalida os ID tokens já emitidos — sem isso, um prescritor logado seguiria válido por até 1h.
      await admin.auth().revokeRefreshTokens(u.uid);
    } catch (_) { /* usuário nunca criado — ok */ }
    return res.status(200).json({ ok: true, status: "rejected" });
  }

  // approve
  let user;
  try { user = await admin.auth().getUserByEmail(p.email); }
  catch (_) {
    // Senha temporária aleatória (nunca exibida — o acesso é sempre via link de reset). crypto p/ material de credencial.
    const tempPw = "Af!" + crypto.randomBytes(18).toString("base64url");
    try {
      user = await admin.auth().createUser({ email: p.email, displayName: p.nome, password: tempPw });
    } catch (e) {
      // Corrida (dois approve simultâneos): o outro já criou → segue idempotente.
      if (e.code === "auth/email-already-exists") user = await admin.auth().getUserByEmail(p.email);
      else throw e;
    }
  }
  if (user.disabled) await admin.auth().updateUser(user.uid, { disabled: false });

  await db.collection("prescriber_access").doc(p.email).set({
    uid: user.uid, prescriberId: id, nome: p.nome,
    approvedBy: adminEmail, approvedAt: FieldValue.serverTimestamp(),
  });
  await ref.update({ status: "approved", uid: user.uid, decidedBy: adminEmail, decidedAt: FieldValue.serverTimestamp() });

  // continueUrl → depois de definir a senha, o prescritor volta pra área do site. Só funciona se o
  // domínio estiver nos "Authorized domains" do Firebase; se não estiver, cai pro link padrão (que funciona).
  let resetLink;
  try { resetLink = await admin.auth().generatePasswordResetLink(p.email, { url: AREA_URL }); }
  catch (e) {
    console.error("[decide] resetLink com continueUrl falhou (dominio nao autorizado?):", e && e.code);
    resetLink = await admin.auth().generatePasswordResetLink(p.email);
  }
  const emailSent = await sendApprovalEmail(p.email, p.nome, resetLink).catch(() => false);

  return res.status(200).json({ ok: true, status: "approved", emailSent, resetLink });
};
