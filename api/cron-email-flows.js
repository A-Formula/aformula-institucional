// GET/POST /api/cron-email-flows — motor das réguas de e-mail. Roda 1×/dia pelo cron da Vercel
// (vercel.json → crons). Varre `email_jobs` vencidos, aplica consentimento e supressão, envia.
//
// Autenticação: Bearer CRON_SECRET (o cron da Vercel manda esse header) OU admin autenticado,
// pra permitir rodada manual pelo painel. `?dry=1` simula sem enviar nada — é o modo de teste.
//
// Por que os offsets são em DIAS e o cron é diário: o plano é Hobby (1 execução/dia) e a régua
// inteira é medida em dias (T+1, T+3, T+7…). Um cron diário entrega a régua como especificada;
// hora exata não é requisito de nenhum e-mail.
const { getDb, sendMail, sendBulk, verifyAdmin, FieldValue } = require("./_lib/backend");
const { FLOWS, CONSENT_MODEL, unsubUrl, flowsAtivas } = require("./_lib/flows");

const LOTE = 200;              // teto por execução — protege o limite de tempo da função
const MAX_TENTATIVAS = 3;

function autorizado(req) {
  const s = process.env.CRON_SECRET;
  const h = String(req.headers.authorization || "");
  // Vercel cron manda "Bearer <CRON_SECRET>" quando a env existe.
  if (s && h === `Bearer ${s}`) return true;
  // Fallback: a Vercel sobrescreve cabeçalhos `x-vercel-*` que venham de fora, então a presença
  // deste header significa que a chamada é do cron dela. Sem este fallback, um projeto SEM
  // CRON_SECRET configurado responderia 403 ao próprio cron e a régua nunca rodaria — falha
  // silenciosa e difícil de notar. Ainda assim, configurar CRON_SECRET é o certo.
  if (!s && req.headers["x-vercel-cron"]) return true;
  return false;
}

// Consentimento. A coleção `newsletter` é o registro único de opt-in do site: os formulários de
// contato e de trabalhe-conosco alimentam ela via addToMailing() quando a caixinha vem marcada.
// `unsubscribed` é setado por /api/descadastro e vale pra tudo — inclusive optout.
async function podeEnviar(db, job) {
  if (job.classe !== "marketing") return { ok: true };
  const snap = await db.collection("newsletter").doc(job.email).get();
  const d = snap.exists ? snap.data() : null;
  if (d && d.unsubscribed === true) return { ok: false, reason: "descadastrado" };
  if (CONSENT_MODEL[job.flow] === "optout") return { ok: true };
  if (d && d.consent === true) return { ok: true };
  return { ok: false, reason: "sem-optin" };
}

// Supressão: no máximo 1 e-mail por pessoa por dia. Régua que soma em vez de pausar é como se
// descadastra uma base — alguém em CB e na newsletter receberia dois no mesmo dia.
async function jaRecebeuHoje(db, email, vistos) {
  if (vistos.has(email)) return true;
  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
  const snap = await db.collection("email_jobs")
    .where("email", "==", email).where("status", "==", "sent")
    .where("sentAt", ">=", inicioDoDia).limit(1).get();
  return !snap.empty;
}

module.exports = async (req, res) => {
  const admin = autorizado(req) ? "cron" : await verifyAdmin(req);
  if (!admin) return res.status(403).json({ ok: false, error: "not-authorized" });

  // Interruptor geral (flows.js). Roda antes de tudo: a fila fica intacta em `pending` e volta a
  // andar quando religar. `?dry=1` continua liberado — é como inspecionar sem enviar.
  const dry = String(req.query && req.query.dry || "") === "1";
  if (!flowsAtivas() && !dry) {
    console.log("[cron-email-flows] pausado — EMAIL_FLOWS_ON não está ligado");
    return res.status(200).json({ ok: true, paused: true, enviados: 0 });
  }

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  const agora = new Date();
  const snap = await db.collection("email_jobs")
    .where("status", "==", "pending").where("sendAt", "<=", agora)
    .orderBy("sendAt", "asc").limit(LOTE).get();

  const r = { vencidos: snap.size, enviados: 0, pulados: 0, adiados: 0, erros: 0, dry, detalhe: [] };
  const vistos = new Set();

  for (const doc of snap.docs) {
    const job = doc.data();
    const passo = (FLOWS[job.flow] || []).find((s) => s.step === job.step);
    if (!passo) {
      r.erros++;
      if (!dry) await doc.ref.update({ status: "error", reason: "passo-inexistente" });
      r.detalhe.push(`${job.step} ${job.email}: passo não existe mais na régua`);
      continue;
    }

    const consent = await podeEnviar(db, job);
    if (!consent.ok) {
      r.pulados++;
      if (!dry) await doc.ref.update({ status: "skipped", reason: consent.reason, decidedAt: FieldValue.serverTimestamp() });
      r.detalhe.push(`${job.step} ${job.email}: pulado (${consent.reason})`);
      continue;
    }

    if (await jaRecebeuHoje(db, job.email, vistos)) {
      r.adiados++;
      // Adia 1 dia em vez de somar. A régua estica, não atropela.
      if (!dry) await doc.ref.update({ sendAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      r.detalhe.push(`${job.step} ${job.email}: adiado (já recebeu hoje)`);
      continue;
    }

    const dados = { ...(job.dados || {}), email: job.email };
    let msg;
    try { msg = passo.render(dados); }
    catch (e) {
      r.erros++;
      if (!dry) await doc.ref.update({ status: "error", reason: `render: ${e && e.message}` });
      r.detalhe.push(`${job.step} ${job.email}: erro de render`);
      continue;
    }

    const unsub = unsubUrl(job.email);
    const headers = job.classe === "marketing" && unsub
      ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined;
    const replyTo = job.flow === "P" ? process.env.REPLY_TO_PRESCRITOR : undefined;

    if (dry) {
      r.enviados++; vistos.add(job.email);
      r.detalhe.push(`${job.step} ${job.email}: ENVIARIA — "${msg.subject}"`);
      continue;
    }

    // Marketing sai pela faixa de volume (Resend + subdomínio de envio); serviço e transacional
    // saem pelo remetente que o cliente já conhece. Ver as duas faixas em _lib/backend.js.
    const enviar = job.classe === "marketing" ? sendBulk : sendMail;
    const ok = await enviar(job.email, msg.subject, msg.text, msg.html || undefined, replyTo, headers)
      .catch(() => false);
    if (ok) {
      r.enviados++; vistos.add(job.email);
      await doc.ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), subject: msg.subject });
    } else {
      const tentativas = (job.attempts || 0) + 1;
      r.erros++;
      await doc.ref.update({
        attempts: tentativas,
        // Esgotou as tentativas → para. Reenvio infinito contra caixa inexistente queima o domínio.
        ...(tentativas >= MAX_TENTATIVAS
          ? { status: "error", reason: "envio-falhou" }
          : { sendAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
      });
      r.detalhe.push(`${job.step} ${job.email}: envio falhou (tentativa ${tentativas})`);
    }
  }

  // Log auditável — sem isto, "a régua está rodando?" só se responde abrindo o Firestore.
  if (!dry && (r.enviados || r.erros)) {
    await db.collection("email_runs").add({
      at: FieldValue.serverTimestamp(), por: admin,
      vencidos: r.vencidos, enviados: r.enviados, pulados: r.pulados, adiados: r.adiados, erros: r.erros,
    }).catch(() => {});
  }

  console.log("[cron-email-flows]", JSON.stringify({ ...r, detalhe: r.detalhe.length }));
  return res.status(200).json({ ok: true, ...r });
};
