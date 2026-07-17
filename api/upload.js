// POST /api/upload?filename=foto.webp&type=image/webp — upload de mídia do painel (Vercel Blob).
// Auth: Bearer ID token de admin. Body: binário cru com Content-Type: application/octet-stream
// (o runtime da Vercel entrega req.body como Buffer nesse tipo; o tipo real da mídia vem em ?type=).
// Limites: 4 MB (teto de request da Vercel é 4,5 MB) · só imagem ou PDF.
// Retorna { ok, url } — URL pública permanente (*.public.blob.vercel-storage.com).
const { put } = require("@vercel/blob");
const { verifyAdmin } = require("./_lib/backend");

// SVG removido do allowlist: SVG hospedado no domínio do Blob pode carregar <script> (XSS armazenado).
const ALLOWED = /^(image\/(webp|jpeg|png|gif|avif)|application\/pdf)$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ ok: false, error: "not-configured" });

  const adminEmail = await verifyAdmin(req);
  if (!adminEmail) return res.status(403).json({ ok: false, error: "not-admin" });

  const contentType = String(req.query.type || "").split(";")[0].trim();
  if (!ALLOWED.test(contentType)) return res.status(415).json({ ok: false, error: "type" });

  let body = req.body;
  if (!Buffer.isBuffer(body)) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }
  if (!body || !body.length) return res.status(400).json({ ok: false, error: "empty" });
  if (body.length > 4 * 1024 * 1024) return res.status(413).json({ ok: false, error: "too-large" });

  const filename = String(req.query.filename || "arquivo")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "arquivo";

  const blob = await put(`cms/${filename}`, body, {
    access: "public", contentType, addRandomSuffix: true,
  });
  return res.status(200).json({ ok: true, url: blob.url });
};
