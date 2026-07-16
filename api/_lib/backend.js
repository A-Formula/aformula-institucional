// Núcleo compartilhado das Vercel Functions — Firestore (firebase-admin) + notificação por e-mail.
// Env vars necessárias (Vercel → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  → JSON da service account (string única)
//   RESEND_API_KEY            → opcional; sem ela a notificação por e-mail é pulada
//   NOTIFY_EMAIL              → destino das notificações (default abaixo, provisório)
//   NOTIFY_FROM               → remetente verificado no Resend (ex.: site@aformulabr.com.br)
const admin = require("firebase-admin");

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "viniciusgayer@aformulabrasil.com.br";

function getDb() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return null;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
  }
  return admin.firestore();
}

async function notify(subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || "Site A Fórmula <onboarding@resend.dev>",
      to: [NOTIFY_EMAIL],
      subject,
      text,
    }),
  });
  return r.ok;
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

module.exports = { getDb, notify, guard, isEmail, FieldValue: admin.firestore.FieldValue };
