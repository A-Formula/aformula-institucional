// GET /api/gone — 410 Gone para conteúdo removido de propósito (arquivamento Google Ads, 05/10/2026).
// Chega aqui por rewrite no vercel.json; a página estática já não existe (post em `draft` no Firestore
// + pasta fora do git), então o filesystem não responde antes do rewrite. 410 em vez de 404: diz ao
// Google que a remoção é definitiva, e em vez de 301: não há página equivalente pra onde mandar.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(410).send(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
    '<title>Conteúdo removido — A Fórmula</title></head><body style="font-family:system-ui;margin:3rem auto;max-width:36rem;padding:0 1rem">' +
    '<h1>Este conteúdo foi removido</h1><p>O artigo não está mais disponível. Veja outros conteúdos no <a href="/blog">blog da A Fórmula</a>.</p>' +
    '</body></html>'
  );
};
