// /api/prescritor-sistema — área logada do prescritor (lâminas, fórmulas, perfil, consultório).
// Entrada: header Authorization: Bearer <Firebase ID token> (prescritor aprovado ou admin).
//   GET  ?img=NN-P → página P da lâmina NN (webp).
//   GET           → JSON { ok, perfil, laminas }. perfil.consultorioCompleto diz se o 2º cadastro foi feito.
//   POST {consultorio:{...}} → grava os dados do consultório (2ª etapa do cadastro, feita dentro da ferramenta).
// Erros: 401 token ausente/inválido · 403 sem acesso · 400 dados inválidos · 404 imagem inexistente.
// Gravação: só no PRÓPRIO cadastro (prescribers/{prescriberId}); admin sem cadastro grava em
// prescriber_profiles/{email}. O conteúdo técnico vem de arquivos do deploy, nunca de URL pública
// (fórmula manipulada não pode ficar aberta ao público — RDC 67/2007, 5.14).
const { getDb, admin, FieldValue } = require("./backend");

// Conteúdo técnico no Firestore (o repositório é PÚBLICO — fórmula e lâmina nunca vão para o git):
//   prescriber_laminas/{NN}     → lâmina com fórmulas e tags   (coleção fechada nas rules; só admin SDK lê)
//   prescriber_paginas/{NN-P}   → página da lâmina em webp base64
// Cache em memória por instância (10 min) para economizar leituras.
let CACHE = { t: 0, laminas: null };
async function laminas(db) {
  if (CACHE.laminas && Date.now() - CACHE.t < 10 * 60 * 1000) return CACHE.laminas;
  const snap = await db.collection("prescriber_laminas").get();
  const out = snap.docs.map((d) => d.data()).sort((a, b) => String(a.n).localeCompare(String(b.n)));
  CACHE = { t: Date.now(), laminas: out };
  return out;
}
const CAMPOS = ["cep", "endereco", "numero", "complemento", "bairro", "cidadeConsultorio", "ufEndereco", "telConsultorio", "emailReceita"];

async function quem(req) {
  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { code: 401 };
  const db = getDb();
  if (!db) return { code: 500 };
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(token); } catch (_) { return { code: 401 }; }
  const email = (decoded.email || "").toLowerCase();
  const [acc, adm] = await Promise.all([
    db.collection("prescriber_access").doc(email).get(),
    db.collection("admins").doc(email).get(),
  ]);
  if (!acc.exists && !adm.exists) return { code: 403 };
  // TRAVA DO PILOTO: o sistema só liga para admins do site ou e-mails em PRESCRITOR_PILOTO (separados por vírgula).
  // Todo o resto recebe 403 "piloto" e a página mostra a área do prescritor exatamente como era antes.
  const piloto = String(process.env.PRESCRITOR_PILOTO || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (!adm.exists && piloto.indexOf(email) < 0) return { code: 403, piloto: true };
  const access = acc.exists ? acc.data() || {} : {};
  const ref = access.prescriberId ? db.collection("prescribers").doc(access.prescriberId) : db.collection("prescriber_profiles").doc(email);
  return { code: 200, db, email, access, ref };
}

function limpar(c) {
  const t = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const o = {
    cep: t(c.cep, 9).replace(/[^0-9-]/g, ""), endereco: t(c.endereco, 200), numero: t(c.numero, 20), complemento: t(c.complemento, 120),
    bairro: t(c.bairro, 120), cidadeConsultorio: t(c.cidadeConsultorio, 120), ufEndereco: t(c.ufEndereco, 2).toUpperCase(),
    telConsultorio: t(c.telConsultorio, 40), emailReceita: t(c.emailReceita, 200).toLowerCase(),
  };
  const ok = o.cep.replace(/\D/g, "").length === 8 && o.endereco && o.numero && o.bairro && o.cidadeConsultorio && /^[A-Z]{2}$/.test(o.ufEndereco) &&
    o.telConsultorio.replace(/\D/g, "").length >= 10 && (!o.emailReceita || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.emailReceita));
  return ok ? o : null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const q = await quem(req);
  if (q.code !== 200) return res.status(q.code).json({ ok: false, error: q.piloto ? "piloto" : "auth" });

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const c = limpar(body.consultorio || {});
    if (!c) return res.status(400).json({ ok: false, error: "validation" });
    await q.ref.set({ ...c, consultorioEm: FieldValue.serverTimestamp() }, { merge: true });
    return res.status(200).json({ ok: true });
  }

  const img = String((req.query && req.query.img) || "");
  if (img) {
    if (!/^\d{2}-\d{1,2}$/.test(img)) return res.status(404).end();
    const pg = await q.db.collection("prescriber_paginas").doc(img).get();
    if (!pg.exists || !pg.data().b64) return res.status(404).end();
    res.setHeader("Content-Type", "image/webp");
    return res.status(200).send(Buffer.from(pg.data().b64, "base64"));
  }

  // Perfil: cadastro aprovado (coleção só-admin; lida aqui pelo servidor) + consultório.
  let d = {};
  try { const p = await q.ref.get(); if (p.exists) d = p.data() || {}; } catch (_) { /* perfil mínimo */ }
  const perfil = {
    nome: d.nome || q.access.nome || "", email: q.email,
    conselho: d.conselho || "", registroNumero: d.conselhoNumero || "", uf: d.uf || "", especialidade: d.especialidade || "",
    cidade: d.cidade || "", telefone: d.telefone || "",
  };
  CAMPOS.forEach((k) => { perfil[k] = d[k] || ""; });
  perfil.consultorioCompleto = !!(d.cep && d.endereco && d.numero && d.cidadeConsultorio);
  return res.status(200).json({ ok: true, perfil, laminas: await laminas(q.db) });
};
