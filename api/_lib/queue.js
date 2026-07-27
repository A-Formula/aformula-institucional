// Fila de envio das réguas de e-mail. Substitui um ESP: o site já tem Firestore + SMTP, então
// o que faltava era só quem espera 1, 3, 7 dias e dispara. Cron diário em /api/cron-email-flows.
//
// Coleção `email_jobs`, doc id = `{flow}_{step}_{email}` → **idempotente por construção**:
// reenfileirar o mesmo passo pro mesmo lead não duplica, e nenhum reenvio acontece por acidente
// (é o modo de falha mais caro de régua de e-mail — o cliente recebe o mesmo e-mail 3×).
const { FieldValue } = require("./backend");

// Firestore proíbe "/" em doc id; e-mail não tem, mas normalizo o resto por segurança.
const jobId = (flow, step, email) =>
  `${flow}_${step}_${String(email).toLowerCase().replace(/[^\w@.+-]/g, "_")}`;

const DIA_MS = 24 * 60 * 60 * 1000;

// Enfileira todos os passos de uma régua de uma vez. `startAt` é o gatilho (cadastro, aprovação…).
// Passo com offset 0 também entra na fila em vez de sair na hora: um caminho só de envio significa
// um lugar só onde consentimento, supressão e log acontecem.
async function enqueueFlow(db, { flow, steps, email, dados, startAt }) {
  if (!db || !email || !steps || !steps.length) return 0;
  const base = startAt instanceof Date ? startAt.getTime() : Date.now();
  let n = 0;
  for (const s of steps) {
    if (s.skipIf && s.skipIf(dados || {})) continue;
    const ref = db.collection("email_jobs").doc(jobId(flow, s.step, email));
    try {
      // create() falha se já existe → é o que garante a idempotência.
      await ref.create({
        flow, step: s.step, classe: s.classe, email: String(email).toLowerCase(),
        dados: dados || {}, status: "pending", attempts: 0,
        sendAt: new Date(base + s.offset * DIA_MS),
        createdAt: FieldValue.serverTimestamp(),
      });
      n++;
    } catch (e) {
      if (e && e.code === 6) continue;              // ALREADY_EXISTS — esperado, segue em frente
      console.error("[queue] enqueue falhou:", s.step, e && e.message);
    }
  }
  return n;
}

// Cancela os passos ainda pendentes de uma régua. Usado quando o lead avança de estágio e a
// sequência antiga perdeu sentido (ex.: prescritor recusado não deve receber P3–P6).
async function cancelFlow(db, { flow, email, motivo }) {
  if (!db || !email) return 0;
  const snap = await db.collection("email_jobs")
    .where("email", "==", String(email).toLowerCase())
    .where("flow", "==", flow).where("status", "==", "pending").get();
  let n = 0;
  for (const doc of snap.docs) {
    await doc.ref.update({
      status: "cancelled", reason: motivo || "cancelado", decidedAt: FieldValue.serverTimestamp(),
    });
    n++;
  }
  return n;
}

module.exports = { enqueueFlow, cancelFlow, jobId, DIA_MS };
