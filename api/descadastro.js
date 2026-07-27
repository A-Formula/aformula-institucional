// GET/POST /api/descadastro?e={email}&t={token} — saída das réguas de marketing.
// Exigência de LGPD e do Gmail (One-Click desde 2024). Token = HMAC do e-mail, então o link não
// é adivinhável e ninguém descadastra terceiro.
//
// GET  → página de confirmação com botão. NÃO descadastra, de propósito: cliente de e-mail e
//        antivírus fazem prefetch de link, e prefetch não pode cancelar a inscrição de ninguém.
// POST → executa. É também o que o cabeçalho List-Unsubscribe-Post: One-Click chama.
const crypto = require("crypto");
const { getDb, FieldValue } = require("./_lib/backend");
const { unsubToken } = require("./_lib/flows");

const TEAL = "#008896";
const DARK = "#052c32";

function pagina(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} — A Fórmula</title>
<meta name="robots" content="noindex"></head>
<body style="margin:0;font-family:system-ui,-apple-system,Arial,sans-serif;background:#f2f5f5;color:${DARK};">
<div style="max-width:560px;margin:12vh auto;padding:36px 32px;background:#fff;border:1px solid #e3eaea;border-radius:14px;">
  <div style="font-size:20px;font-weight:700;color:${TEAL};margin-bottom:22px;">a fórmula</div>
  ${corpo}
</div></body></html>`;
}

// Comparação de tokens em tempo constante — evita que a resposta vaze quanto do token está certo.
function tokenOk(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const email = String(q.e || "").trim().toLowerCase().slice(0, 200);
  const token = String(q.t || "").trim();

  if (!email || !token || !tokenOk(token, unsubToken(email))) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(400).send(pagina("Link inválido", `
      <h1 style="font-size:20px;margin:0 0 12px;">Este link não é válido</h1>
      <p style="line-height:1.6;margin:0 0 14px;">Ele pode ter sido cortado pelo seu programa de
        e-mail. Encaminhe o e-mail que você recebeu para
        <a href="mailto:sac@aformulabr.com.br" style="color:${TEAL};">sac@aformulabr.com.br</a>
        pedindo o descadastro e a gente resolve na mão.</p>`));
  }

  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(pagina("Descadastrar", `
      <h1 style="font-size:20px;margin:0 0 12px;">Parar de receber nossos e-mails?</h1>
      <p style="line-height:1.6;margin:0 0 8px;">Vamos remover <strong>${email}</strong> da lista de
        conteúdos e novidades.</p>
      <p style="line-height:1.6;margin:0 0 22px;color:#5b7276;font-size:14px;">Você continua recebendo
        e-mails sobre pedidos e solicitações que você mesmo fizer — esses não são propaganda.</p>
      <form method="POST" action="/api/descadastro?e=${encodeURIComponent(email)}&t=${token}">
        <button type="submit" style="background:${TEAL};color:#fff;border:0;border-radius:8px;
          padding:14px 26px;font-size:15px;font-weight:700;cursor:pointer;">
          Confirmar descadastro</button>
      </form>`));
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  try {
    // A coleção `newsletter` é o registro de consentimento de todo o site — marcar aqui vale
    // pra todas as réguas, inclusive as de optout (o cron consulta este mesmo doc).
    await db.collection("newsletter").doc(email).set({
      email, consent: false, unsubscribed: true,
      unsubscribedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Cancela o que ainda estava na fila — senão a pessoa recebe o próximo antes do cron reavaliar.
    const pend = await db.collection("email_jobs")
      .where("email", "==", email).where("status", "==", "pending").get();
    for (const d of pend.docs) {
      await d.ref.update({ status: "cancelled", reason: "descadastro" }).catch(() => {});
    }
  } catch (e) {
    console.error("[descadastro] falhou:", e && e.message);
    return res.status(503).json({ ok: false, error: "database-error" });
  }

  // One-Click do Gmail espera 200 sem exigir HTML; navegador humano vê a página.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(pagina("Descadastrado", `
    <h1 style="font-size:20px;margin:0 0 12px;">Pronto, você saiu da lista</h1>
    <p style="line-height:1.6;margin:0 0 14px;">Não vamos mais mandar conteúdos e novidades para
      <strong>${email}</strong>. Pode levar algumas horas para os envios já em fila pararem.</p>
    <p style="line-height:1.6;margin:0;color:#5b7276;font-size:14px;">Mudou de ideia? Assine de novo
      em <a href="https://www.aformulabr.com.br" style="color:${TEAL};">aformulabr.com.br</a>.</p>`));
};
