// gen-feeds.mjs — gera rss.xml (snapshot dos artigos commitados) + llms.txt (mapa p/ LLMs)
// e injeta o <link rel="alternate"> de RSS no <head> de index/blog (idempotente).
// O build-site.mjs regenera rss.xml fresco do Firestore no deploy; este script garante que o
// arquivo exista já no repo e sirva mesmo se um build falhar (failsafe mantém o commitado).
// Uso: node scripts/gen-feeds.mjs   (não altera layout visível)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://www.aformulabr.com.br';
const E = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const attr = (html, re) => (html.match(re) || [])[1] || '';

// ---- 1) coletar posts dos arquivos de artigo commitados ----
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name === 'index.html') out.push(p);
  }
  return out;
}
const blogDir = path.join(ROOT, 'blog');
const files = fs.existsSync(blogDir) ? walk(blogDir) : [];
const posts = files.map(f => {
  const h = fs.readFileSync(f, 'utf-8');
  const title = attr(h, /<title>([\s\S]*?)<\/title>/).replace(/\s*—\s*Blog A Fórmula\s*$/, '').trim();
  // Normaliza para o domínio de produção (arquivos commitados podem ter canonical de preview).
  const link = BASE + attr(h, /rel="canonical"\s+href="([^"]+)"/).replace(/^https?:\/\/[^/]+/, '');
  const desc = attr(h, /name="description"\s+content="([^"]*)"/);
  const pub = attr(h, /property="article:published_time"\s+content="([^"]*)"/);
  const cat = attr(h, /class="chip"[^>]*>([^<]*)<\/a>/);
  return { title, link, desc, pub, cat };
}).filter(p => p.title && p.link);
posts.sort((a, b) => (b.pub || '').localeCompare(a.pub || ''));

// ---- 2) rss.xml ----
const rfc822 = iso => { try { return new Date(iso).toUTCString(); } catch { return ''; } };
const rssItems = posts.slice(0, 50).map(p => `    <item>
      <title>${E(p.title)}</title>
      <link>${E(p.link)}</link>
      <guid isPermaLink="true">${E(p.link)}</guid>${p.cat ? `\n      <category>${E(p.cat)}</category>` : ''}${p.pub ? `\n      <pubDate>${rfc822(p.pub)}</pubDate>` : ''}
      <description>${E(p.desc)}</description>
    </item>`).join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog A Fórmula</title>
    <link>${BASE}/blog.html</link>
    <atom:link href="${BASE}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Saúde, manipulação, suplementação, beleza e bem-estar — por A Fórmula.</description>
    <language>pt-BR</language>
${rssItems}
  </channel>
</rss>`;
fs.writeFileSync(path.join(ROOT, 'rss.xml'), rss);

// ---- 3) llms.txt ----
const INST = [
  ['Início', `${BASE}/`, 'Farmácia de manipulação A Fórmula — visão geral da rede.'],
  ['Sobre nós', `${BASE}/sobre-nos.html`, 'História, propósito e diferenciais da rede.'],
  ['Manipule sua receita', `${BASE}/receita.html`, 'Como enviar sua receita para manipulação.'],
  ['Encontre uma loja', `${BASE}/encontre-uma-loja.html`, 'Localizador das unidades A Fórmula por cidade.'],
  ['Área do prescritor', `${BASE}/area-do-prescritor.html`, 'Espaço para médicos e prescritores.'],
  ['A Fórmula Pet', `${BASE}/pet.html`, 'Manipulados veterinários para animais.'],
  ['Contato', `${BASE}/contato.html`, 'Fale com a A Fórmula.'],
  ['Blog', `${BASE}/blog.html`, 'Artigos sobre saúde, manipulação e bem-estar.'],
];
const llms = `# A Fórmula — Farmácia de Manipulação

> Rede de farmácias de manipulação A Fórmula: medicamentos manipulados, dermocosméticos, suplementos e linha pet, com unidades em todo o Brasil. Este arquivo orienta modelos de linguagem sobre o conteúdo do site.

## Páginas principais
${INST.map(([n, u, d]) => `- [${n}](${u}): ${d}`).join('\n')}

## Blog — artigos recentes
${posts.slice(0, 30).map(p => `- [${p.title}](${p.link})${p.desc ? `: ${p.desc}` : ''}`).join('\n')}

## Recursos
- [Sitemap](${BASE}/sitemap.xml)
- [Feed RSS](${BASE}/rss.xml)
`;
fs.writeFileSync(path.join(ROOT, 'llms.txt'), llms);

// ---- 4) <link rel="alternate"> de RSS no <head> (idempotente) ----
const RSS_LINK = `<link rel="alternate" type="application/rss+xml" title="Blog A Fórmula" href="${BASE}/rss.xml">`;
for (const file of ['index.html', 'blog.html']) {
  const abs = path.join(ROOT, file);
  let h = fs.readFileSync(abs, 'utf-8');
  if (h.includes('type="application/rss+xml"')) continue;
  h = h.replace(/<\/head>/i, `${RSS_LINK}\n</head>`);
  fs.writeFileSync(abs, h);
}

console.log(`[feeds] rss.xml: ${Math.min(posts.length, 50)} itens | llms.txt: ${posts.length} posts | RSS link em index/blog`);
