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
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
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
// Envia um e-mail avulso. Retorna true/false, nunca lança — o chamador decide o que fazer.
async function sendMail(to, subject, text) {
  const from = mailFrom();
  const t = mailer();
  if (t) {
    try { await t.sendMail({ from, to, subject, text }); return true; }
    catch (e) { console.error("[sendMail] SMTP falhou:", e && e.message); /* cai pro Resend abaixo */ }
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return r.ok;
  } catch (e) { console.error("[sendMail] Resend falhou:", e && e.message); return false; }
}
async function notify(subject, text) {
  return sendMail(await notifyTo(), subject, text);
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
  getDb, notify, sendMail, guard, isEmail, isBlockedEmail, verifyCaptcha, verifyAdmin,
  BLOCKED_EMAIL_DOMAINS, FieldValue: admin.firestore.FieldValue, admin,
};
