// POST /api/prescritor-cadastro — pré-cadastro da Área do Prescritor (decisão 2026-07-16):
// CNPJ obrigatório · grava no Firestore (status pending) · linha na planilha Google Sheets
// (fila de aprovação) · notificação p/ NOTIFY_EMAIL. Login só é liberado após aprovação.
// Env extra: GOOGLE_SHEET_ID (planilha compartilhada com o e-mail da service account)
const { getDb, notify, guard, isEmail, FieldValue } = require("./_lib/backend");
const { JWT } = require("google-auth-library");

function validCNPJ(v) {
  const c = String(v || "").replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base) => {
    let f = base.length - 7, s = 0;
    for (const d of base) { s += d * f--; if (f < 2) f = 9; }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === +c[12] && dv(c.slice(0, 13)) === +c[13];
}

async function appendToSheet(row) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT, sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sa || !sheetId) return false;
  const creds = JSON.parse(sa);
  const jwt = new JWT({
    email: creds.client_email, key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const { token } = await jwt.getAccessToken();
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:Z:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    }
  );
  return r.ok;
}

module.exports = async (req, res) => {
  const body = guard(req, res);
  if (!body) return;

  const nome = String(body.nome || "").trim().slice(0, 200);
  const cnpj = String(body.cnpj || "").replace(/\D/g, "");
  const conselho = String(body.conselho || "").trim().slice(0, 20);       // CRM/CRO/CRF/CRMV
  const conselhoNumero = String(body.conselhoNumero || "").trim().slice(0, 20);
  const uf = String(body.uf || "").trim().toUpperCase().slice(0, 2);
  const especialidade = String(body.especialidade || "").trim().slice(0, 120);
  const telefone = String(body.telefone || "").trim().slice(0, 40);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);

  if (!nome || !isEmail(email) || !validCNPJ(cnpj)) {
    return res.status(400).json({ ok: false, error: "validation" });
  }

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  const doc = {
    nome, cnpj, conselho, conselhoNumero, uf, especialidade, telefone, email,
    status: "pending", createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection("prescribers").add(doc);

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  await appendToSheet([stamp, nome, cnpj, `${conselho} ${conselhoNumero}/${uf}`.trim(),
    especialidade, telefone, email, "pending", ref.id]).catch(() => {});

  await notify(
    `[Prescritor] Novo cadastro: ${nome}`,
    `Nome: ${nome}\nCNPJ: ${cnpj}\nConselho: ${conselho} ${conselhoNumero}/${uf}\n` +
    `Especialidade: ${especialidade || "—"}\nTelefone: ${telefone || "—"}\nE-mail: ${email}\n\n` +
    `Status: pendente de aprovação (planilha atualizada).`
  ).catch(() => {});

  return res.status(200).json({ ok: true });
};
