// POST /api/contato — substitui o mailto: do contato.html
// Body: { nome, telefone?, email, assunto, mensagem, website? (honeypot) }
const { getDb, notify, guard, isEmail, FieldValue } = require("./_lib/backend");

const ASSUNTOS = [
  "Dúvida sobre manipulação", "Acompanhamento de pedido", "Área do prescritor",
  "Seja um franqueado", "Trabalhe conosco", "Imprensa / parcerias", "Outro assunto",
];

module.exports = async (req, res) => {
  const body = guard(req, res);
  if (!body) return;

  const nome = String(body.nome || "").trim().slice(0, 200);
  const telefone = String(body.telefone || "").trim().slice(0, 40);
  const email = String(body.email || "").trim().slice(0, 200);
  const assunto = String(body.assunto || "").trim();
  const mensagem = String(body.mensagem || "").trim().slice(0, 5000);

  if (!nome || !isEmail(email) || !ASSUNTOS.includes(assunto) || !mensagem) {
    return res.status(400).json({ ok: false, error: "validation" });
  }

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  try {
    await db.collection("contact_messages").add({
      nome, telefone: telefone || null, email, assunto, mensagem,
      status: "new", createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[contato] gravação falhou:", e && e.message);
    return res.status(503).json({ ok: false, error: "database-error" });
  }

  await notify(
    `[Contato site] ${assunto}`,
    `Nome: ${nome}\nE-mail: ${email}\nTelefone: ${telefone || "—"}\nAssunto: ${assunto}\n\n${mensagem}`
  ).catch((e) => console.error("[contato] notify falhou:", e && e.message));

  return res.status(200).json({ ok: true });
};
