// Teste do motor das réguas com Firestore em memória. Cobre: enfileiramento idempotente,
// gate de consentimento (optin x optout), supressão de 1/dia, descadastro e cancelamento.
const path = require("path");
const RAIZ = process.argv[2];
process.env.UNSUB_SECRET = "segredo-de-teste";

// firebase-admin/nodemailer não estão instalados aqui (o Drive não serve de workspace Node —
// symlinks quebram). Stub no carregador: o teste substitui getDb/sendMail depois, então estes
// só precisam existir pra o require de backend.js passar.
const Module = require("module");
const _load = Module._load;
const FieldValueFake = { serverTimestamp: () => new Date() };
Module._load = function (req, ...resto) {
  if (req === "firebase-admin") {
    const firestore = () => ({});
    firestore.FieldValue = FieldValueFake;
    return { apps: [], initializeApp() {}, credential: { cert: () => ({}) }, firestore, auth: () => ({}) };
  }
  if (req === "nodemailer") return { createTransport: () => null };
  if (req === "google-auth-library") return { JWT: class {} };
  return _load.call(this, req, ...resto);
};

// ── Firestore fake, só o que queue.js e o cron usam ──
class Snap {
  constructor(id, data) { this.id = id; this._d = data; this.exists = data !== undefined; }
  data() { return this._d; }
  get ref() { return this._ref; }
}
class Q {
  constructor(store, name, filtros = [], ordem = null, lim = 0) {
    Object.assign(this, { store, name, filtros, ordem, lim });
  }
  where(campo, op, valor) { return new Q(this.store, this.name, [...this.filtros, [campo, op, valor]], this.ordem, this.lim); }
  orderBy(campo) { return new Q(this.store, this.name, this.filtros, campo, this.lim); }
  limit(n) { return new Q(this.store, this.name, this.filtros, this.ordem, n); }
  async get() {
    const col = this.store[this.name] || {};
    let docs = Object.entries(col).filter(([, d]) => this.filtros.every(([c, op, v]) => {
      const x = d[c];
      if (op === "==") return x === v;
      if (op === "<=") return x !== undefined && x <= v;
      if (op === ">=") return x !== undefined && x >= v;
      return false;
    }));
    if (this.ordem) docs.sort((a, b) => (a[1][this.ordem] > b[1][this.ordem] ? 1 : -1));
    if (this.lim) docs = docs.slice(0, this.lim);
    const store = this.store, name = this.name;
    return {
      size: docs.length, empty: docs.length === 0,
      docs: docs.map(([id, d]) => {
        const s = new Snap(id, d);
        s._ref = {
          async update(patch) { Object.assign(store[name][id], patch); },
          async set(patch) { Object.assign(store[name][id], patch); },
        };
        return s;
      }),
    };
  }
}
function fakeDb() {
  const store = {};
  return {
    _store: store,
    collection(name) {
      store[name] = store[name] || {};
      const q = new Q(store, name);
      return {
        where: q.where.bind(q), orderBy: q.orderBy.bind(q), limit: q.limit.bind(q), get: q.get.bind(q),
        async add(d) { const id = "auto" + Object.keys(store[name]).length; store[name][id] = d; return { id }; },
        doc(id) {
          return {
            async create(d) {
              if (store[name][id] !== undefined) { const e = new Error("ALREADY_EXISTS"); e.code = 6; throw e; }
              store[name][id] = d;
            },
            async get() { return new Snap(id, store[name][id]); },
            async set(d, o) { store[name][id] = o && o.merge ? { ...(store[name][id] || {}), ...d } : d; },
            async update(d) { Object.assign(store[name][id], d); },
            async delete() { delete store[name][id]; },
          };
        },
      };
    },
  };
}

// ── Injeta o fake e captura os envios ──
const enviados = [];
const backendPath = require.resolve(path.join(RAIZ, "api/_lib/backend.js"));
const backend = require(backendPath);
const db = fakeDb();
backend.getDb = () => db;
// Captura as DUAS faixas: transacional (sendMail) e marketing (sendBulk). Registrar a faixa
// usada é parte do teste — marketing indo pelo transacional é justamente o defeito a evitar.
const capturar = (faixa) => async (to, subject, text, html, replyTo, headers) => {
  enviados.push({ to, subject, faixa, temHtml: Boolean(html), replyTo, headers });
  return true;
};
backend.sendMail = capturar("transacional");
backend.sendBulk = capturar("marketing");
backend.verifyAdmin = async () => "teste@admin";
backend.FieldValue = { serverTimestamp: () => new Date() };
require.cache[backendPath].exports = backend;

const { FLOWS } = require(path.join(RAIZ, "api/_lib/flows.js"));
const { enqueueFlow, cancelFlow } = require(path.join(RAIZ, "api/_lib/queue.js"));
const cron = require(path.join(RAIZ, "api/cron-email-flows.js"));

const DIA = 86400000;
const falhas = [];
const ok = (cond, msg) => { console.log(`  ${cond ? "ok" : "XX"} ${msg}`); if (!cond) falhas.push(msg); };

async function rodarCron({ dry = false } = {}) {
  enviados.length = 0;
  let out;
  await cron(
    { method: "GET", headers: { authorization: "Bearer x" }, query: dry ? { dry: "1" } : {} },
    { status() { return this; }, json(j) { out = j; return this; }, setHeader() { return this; }, send() { return this; } }
  );
  return out;
}
// Empurra o tempo: em vez de esperar 3 dias, envelhece os sendAt da fila.
function envelhecer(dias) {
  for (const j of Object.values(db._store.email_jobs || {})) {
    if (j.status === "pending") j.sendAt = new Date(j.sendAt.getTime() - dias * DIA);
  }
}

(async () => {
  console.log("\n=== 1. Enfileiramento e idempotência ===");
  const lead = { nome: "Maria Souza", email: "maria@ex.com", mensagem: "Ácido folico 4cmg" };
  const n1 = await enqueueFlow(db, { flow: "CA", steps: FLOWS.CA, email: lead.email, dados: lead, startAt: new Date() });
  const n2 = await enqueueFlow(db, { flow: "CA", steps: FLOWS.CA, email: lead.email, dados: lead, startAt: new Date() });
  ok(n1 === 3, `enfileirou os 3 passos de CA (foi ${n1})`);
  ok(n2 === 0, `reenfileirar não duplica — o modo de falha mais caro (foi ${n2})`);

  console.log("\n=== 2. Só o que venceu é enviado ===");
  let r = await rodarCron();
  ok(r.enviados === 1 && enviados[0].subject === "Já está na mão do farmacêutico",
    `só o CA1 (T+0) saiu; CA2/CA3 seguem no futuro (enviados: ${r.enviados})`);

  console.log("\n=== 3. Supressão: no máximo 1 por dia ===");
  envelhecer(4);                                    // CA2 e CA3 vencem
  r = await rodarCron();
  ok(r.enviados === 0 && r.adiados >= 1, `já recebeu hoje → adiou em vez de somar (adiados: ${r.adiados})`);

  console.log("\n=== 4. Gate de consentimento (opt-in) ===");
  const cb = { nome: "João", email: "joao@ex.com", mensagem: "queria emagrecer" };
  await enqueueFlow(db, { flow: "CB", steps: FLOWS.CB, email: cb.email, dados: cb, startAt: new Date(Date.now() - 8 * DIA) });
  r = await rodarCron();
  const assuntos = enviados.map((e) => e.subject);
  ok(assuntos.includes("Recebemos sua dúvida"), "CB1 (serviço) enviado sem opt-in — é resposta ao pedido dele");
  ok(enviados.find((e) => e.subject === "Recebemos sua dúvida")?.faixa === "transacional",
    "CB1 (serviço) saiu pelo remetente que o cliente conhece, não pela faixa de marketing");
  ok(!assuntos.includes("A dose de prateleira não serve"), "CB2 (marketing) BLOQUEADO por falta de opt-in");
  ok(r.pulados >= 3, `os 3 de marketing do CB foram pulados (pulados: ${r.pulados})`);

  console.log("\n=== 5. Com opt-in, marketing passa ===");
  db._store.newsletter = { "ana@ex.com": { email: "ana@ex.com", consent: true } };
  await enqueueFlow(db, { flow: "CB", steps: FLOWS.CB, email: "ana@ex.com", dados: { nome: "Ana", email: "ana@ex.com", mensagem: "queria emagrecer" }, startAt: new Date(Date.now() - 2 * DIA) });
  r = await rodarCron();
  ok(enviados.some((e) => e.subject === "Recebemos sua dúvida" && e.to === "ana@ex.com"), "CB1 saiu pra quem tem opt-in");

  console.log("\n=== 6. Prescritor é optout: envia sem opt-in explícito ===");
  const p = { nome: "Dra. Marina", email: "marina@ex.com", conselho: "CRM", conselhoNumero: "123", uf: "SP", especialidade: "Endocrinologia", cidade: "Campinas" };
  await enqueueFlow(db, { flow: "P", steps: FLOWS.P, email: p.email, dados: p, startAt: new Date(Date.now() - 4 * DIA) });
  r = await rodarCron();
  const p3 = enviados.find((e) => e.to === "marina@ex.com");
  ok(Boolean(p3), "P3 saiu por legítimo interesse (B2B), sem caixinha marcada");
  ok(Boolean(p3 && p3.headers && p3.headers["List-Unsubscribe"]), "marketing carrega List-Unsubscribe (exigência do Gmail)");
  ok(p3 && p3.faixa === "marketing", "P3 saiu pela faixa de MARKETING (Resend + subdomínio), não pela transacional");

  console.log("\n=== 7. Descadastro derruba tudo ===");
  db._store.newsletter["ana@ex.com"] = { email: "ana@ex.com", consent: false, unsubscribed: true };
  envelhecer(30);
  r = await rodarCron();
  ok(!enviados.some((e) => e.to === "ana@ex.com"), "descadastrado não recebe mais nada, nem o que já estava na fila");

  console.log("\n=== 8. P4 pulado quando falta especialidade ===");
  const semEsp = { nome: "Dr. Paulo", email: "paulo@ex.com", conselho: "CRO", conselhoNumero: "9", uf: "BA", cidade: "Salvador" };
  const nP = await enqueueFlow(db, { flow: "P", steps: FLOWS.P, email: semEsp.email, dados: semEsp, startAt: new Date() });
  ok(nP === 3, `enfileirou 3 de 4 — P4 não existe sem especialidade (foi ${nP})`);

  console.log("\n=== 9. Recusa cancela a régua ===");
  const c = await cancelFlow(db, { flow: "P", email: "paulo@ex.com", motivo: "cadastro-recusado" });
  ok(c === 3, `cancelou os 3 pendentes do prescritor recusado (foi ${c})`);

  console.log("\n=== 10. dry-run não envia nada ===");
  await enqueueFlow(db, { flow: "T", steps: FLOWS.T, email: "cand@ex.com", dados: { nome: "Lu", email: "cand@ex.com", cidade: "Jequié" }, startAt: new Date() });
  r = await rodarCron({ dry: true });
  ok(enviados.length === 0 && r.dry === true, "dry=1 simula sem enviar — é o modo de teste seguro");

  console.log(falhas.length ? `\n*** ${falhas.length} FALHA(S) ***\n${falhas.join("\n")}` : "\n*** todos os 13 checks passaram ***");
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error("\nERRO:", e); process.exit(1); });
