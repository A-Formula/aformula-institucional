// Build da Vercel: regenera o blog a partir do Firestore (posts + categorias).
// Roda no deploy (buildCommand). FAILSAFE: qualquer erro → mantém os arquivos commitados (exit 0).
// Fonte de dados: FIREBASE_SERVICE_ACCOUNT (env). Sem a env, não faz nada (mantém commitado).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyPetCms } from './cms-pet.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://aformula-institucional.vercel.app';
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const dataPt = iso => { const [y,m,d]=iso.slice(0,10).split('-'); return `${String(+d).padStart(2,'0')} de ${MESES[+m-1]}, ${y}`; };
const E = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const FALLBACK = {saude:'blog_assets/a36.jpg',dicas:'blog_assets/a38.jpg','cuidados-com-o-corpo':'blog_assets/a35.jpg',novidades:'blog_assets/a33.jpg',mercado:'blog_assets/a39.jpg',beleza:'blog_assets/a37.jpg',ativos:'blog_assets/a40.jpg','cuidados-com-o-cabelo':'blog_assets/a34.jpg','sem-categoria':'blog_assets/a38.jpg'};
const imgOf = p => p.cover || FALLBACK[p.categorySlug] || 'blog_assets/a38.jpg';

async function loadFirestore() {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) { console.log('[build] sem FIREBASE_SERVICE_ACCOUNT — mantendo arquivos commitados'); return null; }
  const admin = (await import('firebase-admin')).default;
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saRaw)) });
  const db = admin.firestore();
  const [postsSnap, catsSnap, bannerSnap, settingsSnap, petSnap] = await Promise.all([
    db.collection('posts').get(), db.collection('categories').get(),
    db.collection('banners').doc('home-hero').get(),
    db.collection('settings').doc('global').get(),
    db.collection('pages').doc('pet').get(),
  ]);
  let posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.status !== 'draft');
  posts.sort((a,b)=> (b.publishedAt||'').localeCompare(a.publishedAt||''));
  const cats = catsSnap.docs.map(d => ({ slug: d.id, ...d.data() })).sort((a,b)=>(a.order||0)-(b.order||0));
  const banner = bannerSnap.exists ? bannerSnap.data() : null;
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const petCms = petSnap.exists ? petSnap.data() : null;
  return { posts, cats, banner, settings, petCms };
}

// ---- rodapé editável (settings/global.footer) — só dentro de <footer>…</footer> ----
const FOOTER_LINKS = { sobrenos: 'Sobre nós', blog: 'Blog', prescritor: 'Área do prescritor', lgpd: 'LGPD', loja: 'Encontre uma loja' };
const FOOTER_TEXTS = {
  brand: 'Há 37 anos transformando manipulação em ciência, cuidado e inovação.',
  copyright: '© A Fórmula 2026',
  legal1: 'A FÓRMULA SERVIÇOS E FRANCHISE LTDA — CNPJ: 10.760.350/0001-00',
  legal2: 'Rua Tabapuã, 627 — Itaim Bibi, São Paulo - SP',
};
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const okHref = v => typeof v === 'string' && /^(https?:\/\/|\/|mailto:)\S+$/.test(v);
export function applyFooter(src, f) {
  if (!f) return src;
  return src.replace(/<footer[\s\S]*?<\/footer>/g, (block) => {
    for (const [k, defLabel] of Object.entries(FOOTER_LINKS)) {
      const cfg = f.links && f.links[k];
      if (!cfg || (!cfg.label && !cfg.href)) continue;
      const re = new RegExp(`(<a\\b[^>]*href=")([^"]*)("[^>]*>\\s*)${reEsc(defLabel)}(\\s*</a>)`, 'g');
      block = block.replace(re, (m, a, href, b, c) =>
        a + (okHref(cfg.href) ? cfg.href : href) + b + (cfg.label && cfg.label.trim() ? E(cfg.label.trim()) : defLabel) + c);
    }
    for (const [k, def] of Object.entries(FOOTER_TEXTS)) {
      const v = f[k];
      if (typeof v === 'string' && v.trim() && v.trim() !== def) block = block.replaceAll(def, E(v.trim()));
    }
    return block;
  });
}

// ---- settings/global → páginas (F3.1) ----
// Substitui os valores-default commitados no HTML pelos do Firestore. Idempotente por
// construção: o deploy sempre parte dos arquivos do git. Valor inválido → ignorado (site nunca quebra).
const isHttp = v => typeof v === 'string' && /^https?:\/\/\S+$/.test(v);
const isMail = v => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const SOCIAL_DEFAULTS = {
  instagram: '"https://www.instagram.com/aformulafarmacia/"',
  facebook:  '"https://www.facebook.com/aformulafarmacia"',
  youtube:   '"https://www.youtube.com/@aformulafarmacia"',
  linkedin:  '"https://www.linkedin.com/company/aformulafarmacia/"',
};
const FRANCHISE_DEFAULT = 'https://franquia.aformulabr.com.br/seja-um-franqueado/';
export function applySettings(src, s) {
  if (!s) return src;
  const y = String(s.years ?? '').trim();
  if (/^\d{2,3}$/.test(y) && y !== '37') {
    src = src.replace(/\b(HÁ|Há|há)\s+37\b/g, (_,a)=>`${a} ${y}`);
    src = src.replace(/\b37\s+(anos|ANOS)\b/g, (_,a)=>`${y} ${a}`);
    src = src.replace(/(data-dc-tpl="37"[^>]*>)37(<\/span>)/, (_,a,b)=>a+y+b); // stat "anos de história" (sobre-nós)
  }
  if (isMail(s.sacEmail)) src = src.replaceAll('sac@aformulabr.com.br', s.sacEmail);
  if (isMail(s.petEmail)) src = src.replaceAll('pet@aformulabr.com.br', s.petEmail);
  if (isHttp(s.franchiseUrl)) src = src.replaceAll(FRANCHISE_DEFAULT, s.franchiseUrl);
  for (const [k, def] of Object.entries(SOCIAL_DEFAULTS))
    if (isHttp(s[k])) src = src.replaceAll(def, `"${s[k]}"`);
  return src;
}

// index.html: banner do hero + galeria de blog (5 posts com capa)
const DEFAULT_HEADLINE = 'A ciência da personalização';
function buildIndexHtml(src, posts, banner) {
  if (banner) {
    if (banner.lead) src = src.replace(/(<p class="hero__lead" data-cms-lead>)[\s\S]*?(<\/p>)/, (_,a,b)=>a+E(banner.lead)+b);
    if (banner.body) src = src.replace(/(<p class="hero__text" data-cms-body>)[\s\S]*?(<\/p>)/, (_,a,b)=>a+E(banner.body)+b);
    if (banner.headline && banner.headline.trim() !== DEFAULT_HEADLINE)
      src = src.replace(/(<h1 class="hero__title" data-cms-headline>)[\s\S]*?(<\/h1>)/, (_,a,b)=>a+E(banner.headline)+b);
  }
  // galeria de blog: 5 posts com capa mais recentes
  const gal = posts.filter(p=>p.cover).slice(0,5);
  let i = 0;
  src = src.replace(/<a class="fcard" href="[^"]*"><img src="[^"]*" alt="[^"]*"([^>]*)><span class="fcard__t">[^<]*<\/span><\/a>/g, (m, imgTail) => {
    const p = gal[i++]; if (!p) return m;
    const title = p.title.length <= 42 ? p.title : p.title.slice(0,39).trimEnd() + '…';
    return `<a class="fcard" href="${p.path}"><img src="${p.cover}" alt="${E(p.coverAlt||p.title)}"${imgTail}><span class="fcard__t">${E(title)}</span></a>`;
  });
  return src;
}

const ART_CSS = fs.readFileSync(path.join(__dirname, 'article.css.html'), 'utf8');

function renderArticle(p, related, parts) {
  const ogImg = p.cover ? `<meta property="og:image" content="${BASE}${p.cover}">` : '';
  const titleBlock = `<title>${E(p.title)} — Blog A Fórmula</title>
<meta name="description" content="${E(p.excerpt)}">
<link rel="canonical" href="${BASE}${p.path}">
<meta property="og:site_name" content="A Fórmula">
<meta property="og:type" content="article">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${E(p.title)}">
<meta property="og:description" content="${E(p.excerpt)}">
<meta property="og:url" content="${BASE}${p.path}">
${ogImg}
<meta name="twitter:card" content="summary_large_image">
<meta property="article:published_time" content="${p.publishedAt}">
<meta property="article:modified_time" content="${p.modifiedAt||p.publishedAt}">`;
  const ld = JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:p.title,description:p.excerpt,datePublished:p.publishedAt,dateModified:p.modifiedAt||p.publishedAt,author:{'@type':'Organization',name:'A Fórmula'},publisher:{'@type':'Organization',name:'A Fórmula'},mainEntityOfPage:BASE+p.path,...(p.cover?{image:BASE+p.cover}:{})});
  const heroOpen = p.cover
    ? `<section class="art-hero art-hero--img" role="img" aria-label="${E(p.coverAlt||p.title)}"><div class="art-hero__bg" style="background-image:url(${p.cover})"></div><div class="art-hero__scrim"></div>`
    : '<section class="art-hero">';
  const relCards = related.map(r=>`<a class="rel-card" href="${r.path}"><span class="rel-cat">${E(r.categoryLabel)}</span><span class="rel-title">${E(r.title)}</span><span class="rel-meta">${dataPt(r.publishedAt)} · ${r.readTime} min de leitura</span></a>`).join('\n');
  const relHtml = related.length ? `<section class="art-rel"><div class="container"><h2>Continue lendo</h2><div class="art-rel-grid">${relCards}</div></div></section>` : '';
  const head = parts.head.replace('{{TITLE_BLOCK}}', titleBlock);
  const crumb = `<nav class="art-crumb" aria-label="breadcrumb"><a href="/index.html">Início</a> <span>/</span> <a href="/blog.html">Blog</a> <span>/</span> <span>${E(p.categoryLabel)}</span></nav>`;
  return `${head}
${ART_CSS}
<script type="application/ld+json">${ld}</script>
${parts.anim}
</head>
<body>
${parts.header}
<main id="artigo">
  ${heroOpen}
    <div class="container">
      ${crumb}
      <h1 class="art-title">${E(p.title)}</h1>
      <div class="art-meta">
        <a class="chip" href="/blog.html?cat=${p.categorySlug}">${E(p.categoryLabel)}</a>
        <span>${dataPt(p.publishedAt)}</span><span>·</span><span>${p.readTime} min de leitura</span>
      </div>
    </div>
  </section>
  <article class="art-wrap"><div class="art-body">
${p.contentHTML}
  </div>
  <a class="art-back" href="/blog.html">← Voltar ao blog</a>
  </article>
  ${relHtml}
</main>
${parts.footer}
<script src="/index_assets/a28.js"></script>
<script src="/index_assets/a31.js"></script>
</body></html>`;
}

// ---- blog.html surgery (idempotente) ----
function setTplText(s, tpl, text, tag){ const re=new RegExp(`(<${tag} data-dc-tpl="${tpl}"[^>]*>)[\\s\\S]*?(</${tag}>)`); return s.replace(re,(_,a,b)=>a+text+b); }
function setTplAttr(s, tpl, attr, val, tag){ const re=new RegExp(`(<${tag} data-dc-tpl="${tpl}"[^>]*?${attr}=")[^"]*(")`); return s.replace(re,(_,a,b)=>a+val+b); }

function buildBlogHtml(src, posts) {
  const featured = posts.find(p=>p.cover) || posts[0];
  const rest = posts.filter(p=>p.slug!==featured.slug);
  const recent4 = rest.slice(0,4);
  const trend=[], seen=new Set();
  for (const p of rest.slice(4)) { if(p.cover && !seen.has(p.categorySlug)){trend.push(p);seen.add(p.categorySlug);} if(trend.length===4)break; }
  for (const p of rest.slice(4)) { if(trend.length===4)break; if(!trend.includes(p)&&p.cover)trend.push(p); }

  // destaque
  src = setTplText(src,40,E(featured.title),'h2');
  src = setTplText(src,41,E(featured.excerpt.slice(0,140)),'p');
  src = setTplAttr(src,42,'href',featured.path,'a');
  src = setTplAttr(src,47,'src',imgOf(featured),'img');
  src = setTplAttr(src,47,'alt',E(featured.coverAlt||featured.title),'img');
  // recentes
  const CARD=[{art:135,img:137,cat:139,h3:140,p:141,date:143,read:145,a:146},{art:150,img:152,cat:154,h3:155,p:156,date:158,read:160,a:161},{art:165,img:167,cat:169,h3:170,p:171,date:173,read:175,a:176},{art:180,img:182,cat:184,h3:185,p:186,date:188,read:190,a:191}];
  recent4.forEach((p,i)=>{const t=CARD[i];
    src=setTplAttr(src,t.art,'data-cat',p.categorySlug,'article');
    src=setTplAttr(src,t.img,'src',imgOf(p),'img');
    src=setTplAttr(src,t.img,'alt',E(p.coverAlt||p.title),'img');
    src=setTplText(src,t.cat,E(p.categoryLabel),'span');
    src=setTplText(src,t.h3,E(p.title),'h3');
    src=setTplText(src,t.p,E(p.excerpt.slice(0,120)),'p');
    src=setTplText(src,t.date,dataPt(p.publishedAt),'span');
    src=setTplText(src,t.read,`${p.readTime} min de leitura`,'span');
    src=setTplAttr(src,t.a,'href',p.path,'a');});
  // em alta
  const TR=[{a:213,img:214,cat:217,h3:218},{a:223,img:224,cat:227,h3:228},{a:233,img:234,cat:237,h3:238},{a:243,img:244,cat:247,h3:248}];
  trend.forEach((p,i)=>{const t=TR[i];
    src=setTplAttr(src,t.a,'href',p.path,'a');
    src=setTplAttr(src,t.img,'src',imgOf(p),'img');
    src=setTplAttr(src,t.img,'alt',E(p.coverAlt||p.title),'img');
    src=setTplText(src,t.cat,E(p.categoryLabel),'span');
    src=setTplText(src,t.h3,E(p.title),'h3');});
  // índice embutido (idempotente: remove antigo)
  const index = posts.map(p=>({t:p.title,c:p.categorySlug,cl:p.categoryLabel,x:(p.excerpt||'').slice(0,120),d:dataPt(p.publishedAt),r:`${p.readTime} min de leitura`,i:imgOf(p),h:p.path}));
  const indexJson = JSON.stringify(index).replace(/<\//g,'<\\/');
  const NEW_JS = fs.readFileSync(path.join(__dirname,'blog-filter.js.html'),'utf8').replace('__INDEX_JSON__', indexJson);
  src = src.replace(/<script id="af-posts-index"[^>]*>[\s\S]*?<\/script>\s*/,'');
  src = src.replace(/<script id="polish-filter">[\s\S]*?<\/script>/, NEW_JS);
  return src;
}

async function main() {
  const parts = JSON.parse(fs.readFileSync(path.join(__dirname,'template-parts.json'),'utf8'));
  const data = await loadFirestore();
  if (!data) return; // failsafe: mantém commitado
  const { posts, banner, settings, petCms } = data;
  console.log(`[build] ${posts.length} posts do Firestore`);

  // 0) settings/global + rodapé → template dos artigos + páginas que o build não reescreve
  const applyAll = (src) => applySettings(applyFooter(src, settings.footer), settings);
  for (const k of Object.keys(parts)) parts[k] = applyAll(parts[k]);
  for (const pg of ['sobre-nos.html','contato.html','receita.html','area-do-prescritor.html','encontre-uma-loja.html','lgpd.html']) {
    const f = path.join(ROOT, pg);
    fs.writeFileSync(f, applyAll(fs.readFileSync(f,'utf8')));
  }
  // 0b) pet.html: CMS da página (pages/pet) + settings/rodapé
  const petPath = path.join(ROOT, 'pet.html');
  fs.writeFileSync(petPath, applyAll(applyPetCms(fs.readFileSync(petPath,'utf8'), petCms)));
  if (petCms) console.log('[build] pet.html regenerado do CMS (pages/pet)');

  // 1) páginas de artigo
  for (const p of posts) {
    let same = posts.filter(r=>r.categorySlug===p.categorySlug && r.slug!==p.slug).slice(0,3);
    if (same.length<3) same = same.concat(posts.filter(r=>r.slug!==p.slug && !same.includes(r)).slice(0,3-same.length));
    const dir = path.join(ROOT, p.path.replace(/^\//,'').split('/').join(path.sep));
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'index.html'), renderArticle(p, same, parts));
  }
  // 2) blog.html
  const blogPath = path.join(ROOT,'blog.html');
  fs.writeFileSync(blogPath, applyAll(buildBlogHtml(fs.readFileSync(blogPath,'utf8'), posts)));
  // 2b) index.html (banner + galeria)
  const idxPath = path.join(ROOT,'index.html');
  fs.writeFileSync(idxPath, applyAll(buildIndexHtml(fs.readFileSync(idxPath,'utf8'), posts, banner)));
  // 3) sitemap
  const urls = posts.map(p=>`<url><loc>${BASE}${p.path}</loc><lastmod>${(p.modifiedAt||p.publishedAt).slice(0,10)}</lastmod></url>`);
  ['/','/sobre-nos.html','/blog.html','/area-do-prescritor.html','/encontre-uma-loja.html','/contato.html','/pet.html','/receita.html'].reverse().forEach(pg=>urls.unshift(`<url><loc>${BASE}${pg}</loc></url>`));
  fs.writeFileSync(path.join(ROOT,'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.join('\n')+'\n</urlset>');
  console.log(`[build] OK — ${posts.length} artigos + blog.html + sitemap regenerados`);
}

main().catch(err => { console.error('[build] ERRO (mantendo arquivos commitados):', err.message); process.exit(0); });
