// Núcleo compartilhado das Vercel Functions — Firestore (firebase-admin) + notificação por e-mail.
// Env vars necessárias (Vercel → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  → JSON da service account (string única)
//   RESEND_API_KEY            → opcional; sem ela a notificação por e-mail é pulada
//   NOTIFY_EMAIL              → destino das notificações (default abaixo, provisório)
//   E-mail (SMTP, preferencial): SMTP_HOST, SMTP_PORT (465 SSL), SMTP_USER, SMTP_PASS (senha de app), NOTIFY_FROM
//   RESEND_API_KEY            → fallback opcional (Resend HTTP) se o SMTP não estiver configurado
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "viniciusgayer@aformulabrasil.com.br";

// Destinatário: settings/global.notifyEmail (editável no painel) > env NOTIFY_EMAIL > default.
// Cache de 5 min por instância pra não custar uma leitura de Firestore por submissão.
let notifyCache = { v: null, t: 0 };
async function notifyTo() {
  if (notifyCache.v && Date.now() - notifyCache.t < 5 * 60 * 1000) return notifyCache.v;
  try {
    const db = getDb();
    if (db) {
      const d = await db.collection("settings").doc("global").get();
      const v = d.exists ? d.data().notifyEmail : null;
      if (isEmail(v)) {
        notifyCache = { v, t: Date.now() };
        return v;
      }
    }
  } catch (_) { /* fallback abaixo */ }
  return NOTIFY_EMAIL;
}

function getDb() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return null;
  if (!admin.apps.length) {
    // JSON.parse ECOA O INPUT na mensagem de erro — um SA malformado imprimiria a chave privada
    // inteira no stack trace do log da Vercel (foi assim que a chave vazou em 2026-07-28).
    // O catch troca o erro por uma mensagem sem conteúdo do segredo.
    let cred;
    try {
      cred = JSON.parse(sa);
    } catch (_) {
      console.error("[backend] FIREBASE_SERVICE_ACCOUNT não é um JSON válido (conteúdo omitido de propósito)");
      return null;
    }
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
  return admin.firestore();
}

// Envio de e-mail. Preferência: SMTP (Gmail/Workspace via nodemailer). Fallback: Resend HTTP.
let _mailer;
function mailer() {
  if (_mailer !== undefined) return _mailer;
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) { _mailer = null; return null; }
  const port = parseInt(process.env.SMTP_PORT) || 465;
  _mailer = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return _mailer;
}
function mailFrom() {
  return process.env.NOTIFY_FROM ||
    (process.env.SMTP_USER ? `Site A Fórmula <${process.env.SMTP_USER}>` : "Site A Fórmula <onboarding@resend.dev>");
}
// Remetente das réguas de MARKETING. Faixa separada do transacional de propósito: reputação de
// e-mail é por domínio, então marketing sai de um subdomínio dedicado (ex.:
// "A Fórmula <ola@envio.aformulabr.com.br>"). Se a régua um dia tomar reclamação, o domínio que
// carrega o e-mail corporativo e o link de acesso do prescritor não vai junto.
// Sem MAIL_FROM_MARKETING configurado, cai no remetente normal — nada quebra.
function mailFromMarketing() {
  return process.env.MAIL_FROM_MARKETING || mailFrom();
}
// Caixas que RECEBEM as respostas. O From é no_reply@, então sem Reply-To toda resposta do
// público morre — e vários e-mails da régua pedem resposta explicitamente (P4/P5/P6/N1/N2).
// Duas caixas de propósito: sac@ é quem atende, webmaster@ é o operador vigiando SE estão
// respondendo. Pra tirar o webmaster depois, basta setar MAIL_REPLY_TO na Vercel com só o sac@
// — sem deploy. Reply-To aceita lista (RFC 5322 §3.6.2); o cliente do leitor põe as duas no "Para".
function mailReplyTo() {
  return process.env.MAIL_REPLY_TO ||
    "sac@aformulabr.com.br, webmaster@aformulabrasil.com.br";
}
// ── Envio ────────────────────────────────────────────────────────────────────
// DUAS FAIXAS, de propósito:
//   sendMail() → TRANSACIONAL. SMTP do Workspace primeiro (é o remetente que o cliente já
//                conhece), Resend como rede de segurança. Aqui entra o link de senha do
//                prescritor, a confirmação de cadastro e as notificações internas.
//   sendBulk() → MARKETING (as réguas). Resend PRIMEIRO, com o remetente do subdomínio de envio.
//                Motivo: reputação de e-mail é por domínio. Marketing saindo de subdomínio próprio
//                protege o domínio corporativo, e é o Resend que dá webhook de abertura/clique/
//                bounce — sem isso as metas da régua são imensuráveis.
// Enquanto MAIL_FROM_MARKETING não existir, sendBulk se comporta igual ao sendMail: nada quebra
// antes de o domínio estar verificado.

// Monta e dispara pelo Resend. Devolve false (sem lançar) pro chamador decidir o fallback.
async function viaResend({ from, to, subject, text, html, replyTo, headers }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [to], subject, text,
        ...(html ? { html } : {}),
        // Resend quer LISTA quando há mais de um endereço; nodemailer aceita a string com vírgula.
        ...(replyTo ? { reply_to: String(replyTo).split(",").map((s) => s.trim()).filter(Boolean) } : {}),
        ...(headers ? { headers } : {}),
      }),
    });
    if (!r.ok) console.error("[resend] recusou:", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) { console.error("[resend] falhou:", e && e.message); return false; }
}

// Monta e dispara pelo SMTP. Mesmo contrato do viaResend.
async function viaSmtp({ from, to, subject, text, html, replyTo, headers }) {
  const t = mailer();
  if (!t) return false;
  try {
    await t.sendMail({
      from, to, subject, text,
      ...(html ? { html } : {}), ...(replyTo ? { replyTo } : {}), ...(headers ? { headers } : {}),
    });
    return true;
  } catch (e) { console.error("[smtp] falhou:", e && e.message); return false; }
}

// TRANSACIONAL. replyTo null desliga a caixa de resposta; headers alimenta o List-Unsubscribe.
async function sendMail(to, subject, text, html, replyTo, headers) {
  const msg = {
    from: mailFrom(), to, subject, text, html,
    replyTo: replyTo === null ? null : (replyTo || mailReplyTo()),
    headers: headers && Object.keys(headers).length ? headers : null,
  };
  return (await viaSmtp(msg)) || (await viaResend(msg));
}

// MARKETING. Mesma assinatura do sendMail — só invertem a ordem dos transportes e o remetente.
async function sendBulk(to, subject, text, html, replyTo, headers) {
  const msg = {
    from: mailFromMarketing(), to, subject, text, html,
    replyTo: replyTo === null ? null : (replyTo || mailReplyTo()),
    headers: headers && Object.keys(headers).length ? headers : null,
  };
  if (await viaResend(msg)) return true;
  // Fallback pro SMTP: mas com o remetente transacional, porque o From de marketing pode não
  // estar autorizado no SPF do Workspace — mandar assim falharia autenticação em vez de entregar.
  return viaSmtp({ ...msg, from: mailFrom() });
}

async function notify(subject, text) {
  // Notificação interna: sem Reply-To, pra responder ao lead continuar sendo ato deliberado.
  return sendMail(await notifyTo(), subject, text, null, null);
}

// Adiciona um e-mail à base de mailing (coleção "newsletter"), idempotente. Usado pelo
// opt-in de marketing dos formulários (contato / trabalhe conosco). Best-effort — nunca lança.
async function addToMailing(email, source) {
  const db = getDb();
  if (!db || !isEmail(email)) return false;
  try {
    const ref = db.collection("newsletter").doc(String(email).toLowerCase());
    const exists = (await ref.get()).exists;
    const data = {
      email: String(email).toLowerCase(), source: source || "site", consent: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!exists) data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(data, { merge: true });
    return true;
  } catch (e) { console.error("[mailing] falhou:", e && e.message); return false; }
}

// Rate limit simples por IP (memória da instância — suficiente contra spam casual)
const hits = new Map();
function rateLimited(ip, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

function guard(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method" });
    return null;
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (body.website) { // honeypot
    res.status(200).json({ ok: true });
    return null;
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (rateLimited(ip)) {
    res.status(429).json({ ok: false, error: "rate" });
    return null;
  }
  return body;
}

const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v || "");

// Domínios de concorrentes (farmácias de manipulação) — cadastro de prescritor recusa
// e-mails corporativos destes grupos. Pesquisa 2026-07-16 (maiores redes/players do país).
// NUNCA incluir aformulabr.com.br / aformulabrasil.com.br (são nossos).
const BLOCKED_EMAIL_DOMAINS = [
  "pharmapele.com.br",                                             // Pharmapele (130+ lojas)
  "farmaciaroval.com.br", "roval.com.br", "rovalpet.com.br", "rovalfranchising.com.br", // Roval (NE, 100+ un.)
  "farmaciaartesanal.com.br",                                      // Farmácia Artesanal (GO/MG/PA/TO)
  "manifarma.com.br", "manipharma.com.br",                         // Grupo Manifarma (SP)
  "buenosayres.com.br",                                            // Laboratório Buenos Ayres (SP)
  "farmaformula.com.br",                                           // Farmafórmula (160+ lojas)
  "phitofarma.com.br",                                             // Phitofarma
  "essentia.com.br", "essentiapharma.com.br", "essentia.far.br",   // Essentia Pharma
  "oficialfarma.com.br",                                           // Oficialfarma
  "purissima.com.br",                                              // Puríssima
  "tecnopharma.com.br",                                            // Tecnopharma
  "biofase.com.br",                                                // Biofase
  "biostevi.com.br",                                               // Biostévi
  "manipulae.com.br",                                              // Manipulaê (marketplace)
  "ciadaformula.com.br",                                           // Cia da Fórmula (RN/CE/SE — nome parecido, é concorrente)
  "rdsaude.com.br", "raiadrogasil.com.br", "drogaraia.com.br",     // RD Saúde (manipulação própria)
];
function isBlockedEmail(email) {
  const dom = String(email || "").toLowerCase().split("@")[1] || "";
  return BLOCKED_EMAIL_DOMAINS.some((b) => dom === b || dom.endsWith("." + b));
}

// reCAPTCHA v2: só exige quando RECAPTCHA_SECRET estiver setada (ativável sem mudar código).
async function verifyCaptcha(token, ip) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // captcha ainda não configurado → não bloqueia
  if (!token) return false;
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip || "")}`,
    });
    const j = await r.json();
    return !!j.success;
  } catch (_) { return false; }
}

// Verifica ID token do Firebase e allowlist admins/{email}. Retorna e-mail do admin ou null.
async function verifyAdmin(req) {
  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return null;
  try {
    const db = getDb();
    if (!db) return null;
    const decoded = await admin.auth().verifyIdToken(token);
    const email = (decoded.email || "").toLowerCase();
    const snap = await db.collection("admins").doc(email).get();
    return snap.exists ? email : null;
  } catch (_) { return null; }
}

module.exports = {
  getDb, notify, sendMail, sendBulk, addToMailing, guard, isEmail, isBlockedEmail, verifyCaptcha, verifyAdmin,
  BLOCKED_EMAIL_DOMAINS, FieldValue: admin.firestore.FieldValue, admin,
};
