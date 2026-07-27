// POST /api/trabalhe-conosco — mini-currículo do "Trabalhe conosco" (triagem de talentos)
// Body: { nome, email, telefone?, cidade, cep?, formacao, experiencia, area?, linkedin?, marketing?, website? (honeypot) }
const { getDb, notify, guard, isEmail, addToMailing, FieldValue } = require("./_lib/backend");
const { FLOWS } = require("./_lib/flows");
const { enqueueFlow } = require("./_lib/queue");

module.exports = async (req, res) => {
  const body = guard(req, res);
  if (!body) return;

  const nome = String(body.nome || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 200);
  const telefone = String(body.telefone || "").trim().slice(0, 40);
  const cidade = String(body.cidade || "").trim().slice(0, 120);
  const cep = String(body.cep || "").replace(/\D/g, "").slice(0, 8) || null;
  const formacao = String(body.formacao || "").trim().slice(0, 2000);
  const experiencia = String(body.experiencia || "").trim().slice(0, 4000);
  const area = String(body.area || "").trim().slice(0, 200);
  const linkedin = String(body.linkedin || "").trim().slice(0, 300);
  const marketing = body.marketing === true;

  if (!nome || !isEmail(email) || !cidade || !formacao || !experiencia) {
    return res.status(400).json({ ok: false, error: "validation" });
  }

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  try {
    await db.collection("career_applications").add({
      nome, email, telefone: telefone || null, cidade, cep,
      formacao, experiencia, area: area || null, linkedin: linkedin || null, marketing,
      status: "new", createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[trabalhe-conosco] gravação falhou:", e && e.message);
    return res.status(503).json({ ok: false, error: "database-error" });
  }

  if (marketing) await addToMailing(email, "trabalhe-conosco").catch(() => {});

  // Régua T (RH, nunca produto). T1 é serviço — responde ao que a pessoa fez — e T2/T3 exigem
  // o opt-in de marketing, que aqui é o mesmo checkbox do formulário.
  await enqueueFlow(db, {
    flow: "T", steps: FLOWS.T, email,
    dados: { nome, email, cidade, area: area || null },
    startAt: new Date(),
  }).catch((e) => console.error("[trabalhe-conosco] enqueue falhou:", e && e.message));

  await notify(
    `[Trabalhe conosco] ${nome} — ${cidade}`,
    `Nome: ${nome}\nE-mail: ${email}\nTelefone: ${telefone || "—"}\nCidade: ${cidade}` +
    `${cep ? ` (CEP ${cep})` : ""}\nÁrea de interesse: ${area || "—"}\nLinkedIn: ${linkedin || "—"}` +
    `\n\nFormação:\n${formacao}\n\nExperiência:\n${experiencia}\n\nAceita marketing: ${marketing ? "sim" : "não"}`
  ).catch((e) => console.error("[trabalhe-conosco] notify falhou:", e && e.message));

  return res.status(200).json({ ok: true });
};
