// Build da Vercel: regenera o blog a partir do Firestore (posts + categorias).
// Roda no deploy (buildCommand). FAILSAFE: qualquer erro → mantém os arquivos commitados (exit 0).
// Fonte de dados: FIREBASE_SERVICE_ACCOUNT (env). Sem a env, não faz nada (mantém commitado).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PAGES, applyPageCms } from './cms-pages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://www.aformulabr.com.br';
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const dataPt = iso => { const [y,m,d]=iso.slice(0,10).split('-'); return `${String(+d).padStart(2,'0')} de ${MESES[+m-1]}, ${y}`; };
const E = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Remove construtos perigosos de HTML autoral (contentHTML) SEM reserializar — byte-idêntico
// em conteúdo limpo; barra <script>/<iframe>/handlers on*/javascript: em conteúdo malicioso.
const stripDangerous = h => (h==null?'':String(h))
  .replace(/<\s*(script|iframe|object|embed|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,'')
  .replace(/<\s*(script|iframe|object|embed|base|link|meta)\b[^>]*\/?>/gi,'')
  .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi,'')
  .replace(/\son[a-z]+\s*=\s*'[^']*'/gi,'')
  .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi,'')
  .replace(/((?:href|src)\s*=\s*["']?)\s*javascript:[^"'>\s]*/gi,'$1#');
const FALLBACK = {saude:'blog_assets/a36.webp',dicas:'blog_assets/a38.webp','cuidados-com-o-corpo':'blog_assets/a35.webp',novidades:'blog_assets/a33.webp',mercado:'blog_assets/a39.webp',beleza:'blog_assets/a37.webp',ativos:'blog_assets/a40.webp','cuidados-com-o-cabelo':'blog_assets/a34.webp','sem-categoria':'blog_assets/a38.webp'};
const imgOf = p => p.cover || FALLBACK[p.categorySlug] || 'blog_assets/a38.jpg';

async function loadFirestore() {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) { console.log('[build] sem FIREBASE_SERVICE_ACCOUNT — mantendo arquivos commitados'); return null; }
  const admin = (await import('firebase-admin')).default;
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saRaw)) });
  const db = admin.firestore();
  const [postsSnap, catsSnap, bannerSnap, settingsSnap, petSnap, sobreSnap, homeSnap] = await Promise.all([
    db.collection('posts').get(), db.collection('categories').get(),
    db.collection('banners').doc('home-hero').get(),
    db.collection('settings').doc('global').get(),
    db.collection('pages').doc('pet').get(),
    db.collection('pages').doc('sobre').get(),
    db.collection('pages').doc('home').get(),
  ]);
  let posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.status !== 'draft');
  posts.sort((a,b)=> (b.publishedAt||'').localeCompare(a.publishedAt||''));
  const cats = catsSnap.docs.map(d => ({ slug: d.id, ...d.data() })).sort((a,b)=>(a.order||0)-(b.order||0));
  const banner = bannerSnap.exists ? bannerSnap.data() : null;
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const petCms = petSnap.exists ? petSnap.data() : null;
  const sobreCms = sobreSnap.exists ? sobreSnap.data() : null;
  const homeCms = homeSnap.exists ? homeSnap.data() : null;
  return { posts, cats, banner, settings, petCms, sobreCms, homeCms };
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
  youtube:   '"https://www.youtube.com/@aformulafarmacia6374"',
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
    const title = p.title.length <= 84 ? p.title : p.title.slice(0,81).trimEnd() + '…';
    return `<a class="fcard" href="${p.path}"><img src="${p.cover}" alt="${E(p.coverAlt||p.title)}"${imgTail}><span class="fcard__t">${E(title)}</span></a>`;
  });
  return src;
}

const ART_CSS = fs.readFileSync(path.join(__dirname, 'article.css.html'), 'utf8');

export function renderArticle(p, related, parts) {
  const ogImg = p.cover ? `<meta property="og:image" content="${BASE}${E(p.cover)}">` : '';
  const titleBlock = `<title>${E(p.title)} — Blog A Fórmula</title>
<meta name="description" content="${E(p.excerpt)}">
<link rel="canonical" href="${BASE}${E(p.path)}">
<meta property="og:site_name" content="A Fórmula">
<meta property="og:type" content="article">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${E(p.title)}">
<meta property="og:description" content="${E(p.excerpt)}">
<meta property="og:url" content="${BASE}${E(p.path)}">
${ogImg}
<meta name="twitter:card" content="summary_large_image">
<meta property="article:published_time" content="${p.publishedAt}">
<meta property="article:modified_time" content="${p.modifiedAt||p.publishedAt}">`;
  const ld = JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:p.title,description:p.excerpt,datePublished:p.publishedAt,dateModified:p.modifiedAt||p.publishedAt,author:{'@type':'Organization',name:'A Fórmula'},publisher:{'@type':'Organization',name:'A Fórmula'},mainEntityOfPage:BASE+p.path,...(p.cover?{image:BASE+p.cover}:{})});
  // BreadcrumbList: Início > Blog > Categoria > Artigo
  const crumbLd = JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'Início',item:BASE+'/'},
    {'@type':'ListItem',position:2,name:'Blog',item:BASE+'/blog.html'},
    {'@type':'ListItem',position:3,name:p.categoryLabel,item:`${BASE}/blog.html?cat=${p.categorySlug}`},
    {'@type':'ListItem',position:4,name:p.title,item:BASE+p.path},
  ]}).replace(/<\//g,'<\\/');
  // FAQPage JSON-LD derivado da seção "Perguntas frequentes" do contentHTML (h3 pergunta + p resposta).
  // contentHTML não pode carregar <script> (stripDangerous), então o schema nasce aqui no build.
  const faqLd = (() => {
    const after = String(p.contentHTML||'').split(/<h2[^>]*>\s*Perguntas [Ff]requentes\s*<\/h2>/)[1];
    if (!after) return '';
    const section = after.split(/<h2[\s>]/)[0];
    const strip = s => s.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    const pairs = [...section.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map(m2 => ({q: strip(m2[1]), a: strip(m2[2])})).filter(x => x.q && x.a).slice(0,8);
    if (!pairs.length) return '';
    const json = JSON.stringify({'@context':'https://schema.org','@type':'FAQPage',
      mainEntity: pairs.map(x => ({'@type':'Question',name:x.q,acceptedAnswer:{'@type':'Answer',text:x.a}}))}).replace(/<\//g,'<\\/');
    return `\n<script type="application/ld+json">${json}</script>`;
  })();
  const heroOpen = p.cover
    ? `<section class="art-hero art-hero--img" role="img" aria-label="${E(p.coverAlt||p.title)}"><div class="art-hero__bg" style="background-image:url(${E(p.cover)})"></div><div class="art-hero__scrim"></div>`
    : '<section class="art-hero">';
  const relCards = related.map(r=>`<a class="rel-card" href="${E(r.path)}"><span class="rel-cat">${E(r.categoryLabel)}</span><span class="rel-title">${E(r.title)}</span><span class="rel-meta">${dataPt(r.publishedAt)} · ${r.readTime} min de leitura</span></a>`).join('\n');
  const relHtml = related.length ? `<section class="art-rel"><div class="container"><h2>Continue lendo</h2><div class="art-rel-grid">${relCards}</div></div></section>` : '';
  const head = parts.head.replace('{{TITLE_BLOCK}}', titleBlock);
  const crumb = `<nav class="art-crumb" aria-label="breadcrumb"><a href="/index.html">Início</a> <span>/</span> <a href="/blog.html">Blog</a> <span>/</span> <span>${E(p.categoryLabel)}</span></nav>`;
  const shareUrl = BASE + p.path, shTxt = encodeURIComponent(p.title + ' — ' + shareUrl), shU = encodeURIComponent(shareUrl);
  const shareBar = `<div class="art-share">
    <span class="art-share__lbl">Compartilhar:</span>
    <a class="wa" href="https://wa.me/?text=${shTxt}" target="_blank" rel="noopener" aria-label="Compartilhar no WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.13c-.24.68-1.4 1.3-1.93 1.38-.53.08-1.04.29-3.5-.73-2.95-1.22-4.83-4.27-4.98-4.47-.15-.2-1.2-1.6-1.2-3.05s.76-2.16 1.03-2.46c.27-.3.59-.37.79-.37.2 0 .39.01.56.01.18.01.42-.07.66.5.24.58.82 2.01.89 2.16.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.12.64-.07.17-.2.73-.86.93-1.15.2-.3.39-.24.66-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.12.07.7-.17 1.38z"/></svg>WhatsApp</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${shU}" target="_blank" rel="noopener" aria-label="Compartilhar no Facebook"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951z"/></svg>Facebook</a>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shU}" target="_blank" rel="noopener" aria-label="Compartilhar no LinkedIn"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.401z"/></svg>LinkedIn</a>
    <button type="button" class="art-copy" data-copy="${E(shareUrl)}" aria-label="Copiar link do artigo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Copiar link</button>
    <span class="art-share__ok" id="art-copy-ok" hidden>Link copiado ✓</span>
  </div>`;
  return `${head}
${ART_CSS}
<script type="application/ld+json">${ld}</script>
<script type="application/ld+json">${crumbLd}</script>${faqLd}
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
        <a class="chip" href="/blog.html?cat=${E(p.categorySlug)}">${E(p.categoryLabel)}</a>
        <span>${dataPt(p.publishedAt)}</span><span>·</span><span>${p.readTime} min de leitura</span>
      </div>
    </div>
  </section>
  <article class="art-wrap"><div class="art-body">
${stripDangerous(p.contentHTML)}
  </div>
  ${shareBar}
  <a class="art-back" href="/blog.html">← Voltar ao blog</a>
  </article>
  ${relHtml}
</main>
${parts.footer}
<script id="art-copy-js">(function(){var b=document.querySelector(".art-copy");if(!b)return;b.addEventListener("click",function(){var u=b.getAttribute("data-copy"),ok=document.getElementById("art-copy-ok");function done(){if(ok){ok.hidden=false;setTimeout(function(){ok.hidden=true;},2600);}}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(done).catch(done);}else{var t=document.createElement("textarea");t.value=u;document.body.appendChild(t);t.select();try{document.execCommand("copy");}catch(_){}document.body.removeChild(t);done();}});})();</script>
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
  // "Em alta": curadoria manual dos temas de maior tráfego/clique (RANKING-125 Onda 1).
  // Ordem = ordem de exibição no carrossel. Fallback auto por categoria se algum slug sumir.
  const TREND_SLUGS = [
    'alternativas-naturais-ao-ozempic-e-mounjaro-para-controle-de-peso',
    'os-analogos-de-glp-1-e-como-podem-ser-aliados-para-o-emagrecimento-saudavel-e-responsavel',
    'beneficios-da-creatina-na-vida-da-mulher-muito-alem-da-academia',
    'o-papel-da-suplementacao-na-saude-hormonal-masculina',
    'feminite-equilibrio-hormonal-e-bem-estar-na-menopausa',
    'beneficios-dos-suplementos-manipulados-para-o-estresse-e-ansiedade',
    'conheca-os-suplementos-que-combatem-a-queda-de-cabelo',
    'nad-e-longevidade-o-que-e-e-como-a-manipulacao-personalizada-pode-ajudar',
  ];
  const bySlug = Object.fromEntries(posts.map(p=>[p.slug,p]));
  let trend = TREND_SLUGS.map(s=>bySlug[s]).filter(p=>p&&p.cover);
  if (trend.length < 4) { // failsafe: completa por categoria (comportamento antigo)
    const seen=new Set(trend.map(p=>p.categorySlug));
    for (const p of rest.slice(4)) { if(p.cover&&!seen.has(p.categorySlug)&&!trend.includes(p)){trend.push(p);seen.add(p.categorySlug);} if(trend.length>=8)break; }
  }

  // destaque
  src = setTplText(src,40,E(featured.title),'h2');
  src = setTplText(src,41,E(featured.excerpt.slice(0,140)),'p');
  src = setTplAttr(src,42,'href',E(featured.path),'a');
  src = setTplAttr(src,47,'src',E(imgOf(featured)),'img');
  src = setTplAttr(src,47,'alt',E(featured.coverAlt||featured.title),'img');
  // recentes
  const CARD=[{art:135,img:137,cat:139,h3:140,p:141,date:143,read:145,a:146},{art:150,img:152,cat:154,h3:155,p:156,date:158,read:160,a:161},{art:165,img:167,cat:169,h3:170,p:171,date:173,read:175,a:176},{art:180,img:182,cat:184,h3:185,p:186,date:188,read:190,a:191}];
  recent4.forEach((p,i)=>{const t=CARD[i];
    src=setTplAttr(src,t.art,'data-cat',E(p.categorySlug),'article');
    src=setTplAttr(src,t.img,'src',E(imgOf(p)),'img');
    src=setTplAttr(src,t.img,'alt',E(p.coverAlt||p.title),'img');
    src=setTplText(src,t.cat,E(p.categoryLabel),'span');
    src=setTplText(src,t.h3,E(p.title),'h3');
    src=setTplText(src,t.p,E(p.excerpt.slice(0,120)),'p');
    src=setTplText(src,t.date,dataPt(p.publishedAt),'span');
    src=setTplText(src,t.read,`${p.readTime} min de leitura`,'span');
    src=setTplAttr(src,t.a,'href',E(p.path),'a');});
  // em alta — renderiza a lista curada (N cards) substituindo o miolo do trilho [data-trend-row]
  const trendCard = p => `      <a href="${E(p.path)}" data-tcard="" style="scroll-snap-align: start; position: relative; border-radius: 18px; overflow: hidden; aspect-ratio: 3 / 4.1; display: block;">
        <img src="${E(imgOf(p))}" alt="${E(p.coverAlt||p.title)}" style="position: absolute; inset: 0px; width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);" loading="lazy" decoding="async">
        <div style="position: absolute; inset: 0px; background: linear-gradient(rgba(6, 50, 55, 0) 0%, rgba(6, 50, 55, 0.38) 44%, rgba(6, 50, 55, 0.97) 100%);"></div>
        <div style="position: absolute; left: 0px; right: 0px; bottom: 0px; padding: 24px;">
          <span style="font-family: Avenir, sans-serif; font-weight: 900; font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: rgb(79, 182, 192);">${E(p.categoryLabel)}</span>
          <h3 style="margin-top: 10px; font-family: &quot;Playfair Display&quot;, Georgia, serif; font-weight: 500; font-size: 19px; line-height: 1.2; color: rgb(255, 255, 255);">${E(p.title)}</h3>
          <span style="margin-top: 14px; display: inline-flex; align-items: center; gap: 7px; font-family: Avenir, sans-serif; font-weight: 900; font-size: 12px; color: rgb(255, 255, 255); border-bottom: 1px solid rgba(255, 255, 255, 0.5); padding-bottom: 2px;">Ler artigo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg></span>
        </div>
      </a>`;
  src = src.replace(
    /(<div data-dc-tpl="212" data-trend-row="" style="[^"]*">)[\s\S]*?<\/div>\s*<\/div><\/section>/,
    (_m, open) => `${open}\n${trend.map(trendCard).join('\n')}\n    </div>\n  </div></section>`
  );
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
  const { posts, banner, settings, petCms, sobreCms, homeCms } = data;
  console.log(`[build] ${posts.length} posts do Firestore`);

  // 0) settings/global + rodapé → template dos artigos + páginas que o build não reescreve
  const applyAll = (src) => applySettings(applyFooter(src, settings.footer), settings);
  for (const k of Object.keys(parts)) parts[k] = applyAll(parts[k]);
  for (const pg of ['contato.html','receita.html','area-do-prescritor.html','encontre-uma-loja.html','lgpd.html','404.html']) {
    const f = path.join(ROOT, pg);
    fs.writeFileSync(f, applyAll(fs.readFileSync(f,'utf8')));
  }
  // 0b) pet.html: CMS da página (pages/pet) + settings/rodapé
  const petPath = path.join(ROOT, 'pet.html');
  fs.writeFileSync(petPath, applyAll(applyPageCms(fs.readFileSync(petPath,'utf8'), PAGES.pet, petCms)));
  if (petCms) console.log('[build] pet regenerado do CMS');
  // 0c) sobre-nos.html: CMS da página (pages/sobre) + settings/rodapé
  const sobrePath = path.join(ROOT, 'sobre-nos.html');
  fs.writeFileSync(sobrePath, applyAll(applyPageCms(fs.readFileSync(sobrePath,'utf8'), PAGES.sobre, sobreCms)));
  if (sobreCms) console.log('[build] sobre regenerado do CMS');

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
  // 2b) index.html: banner + galeria (buildIndexHtml) → CMS da home (pages/home) → settings/rodapé.
  //     Ordem importa: o CMS roda DEPOIS do buildIndexHtml (que só troca hero-text/galeria por
  //     regex e não colide com as âncoras data-cms-id) e ANTES do applyAll.
  const idxPath = path.join(ROOT,'index.html');
  fs.writeFileSync(idxPath, applyAll(applyPageCms(buildIndexHtml(fs.readFileSync(idxPath,'utf8'), posts, banner), PAGES.home, homeCms)));
  if (homeCms) console.log('[build] home regenerado do CMS');
  // 3) sitemap
  const urls = posts.map(p=>`<url><loc>${BASE}${p.path}</loc><lastmod>${(p.modifiedAt||p.publishedAt).slice(0,10)}</lastmod></url>`);
  ['/','/sobre-nos.html','/blog.html','/area-do-prescritor.html','/encontre-uma-loja.html','/contato.html','/pet.html','/receita.html'].reverse().forEach(pg=>urls.unshift(`<url><loc>${BASE}${pg}</loc></url>`));
  fs.writeFileSync(path.join(ROOT,'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.join('\n')+'\n</urlset>');

  // 4) rss.xml (fresco do Firestore — mesmo formato do scripts/gen-feeds.mjs)
  const rfc822 = iso => { try { return new Date(iso).toUTCString(); } catch { return ''; } };
  const rssItems = posts.slice(0,50).map(p=>`    <item>
      <title>${E(p.title)}</title>
      <link>${BASE}${p.path}</link>
      <guid isPermaLink="true">${BASE}${p.path}</guid>
      <category>${E(p.categoryLabel)}</category>
      <pubDate>${rfc822(p.publishedAt)}</pubDate>
      <description>${E(p.excerpt||'')}</description>
    </item>`).join('\n');
  fs.writeFileSync(path.join(ROOT,'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog A Fórmula</title>
    <link>${BASE}/blog.html</link>
    <atom:link href="${BASE}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Saúde, manipulação, suplementação, beleza e bem-estar — por A Fórmula.</description>
    <language>pt-BR</language>
${rssItems}
  </channel>
</rss>`);

  // 5) llms.txt (mapa p/ LLMs — páginas fixas + posts recentes)
  const INST = [['Início','/','Farmácia de manipulação A Fórmula — visão geral da rede.'],['Sobre nós','/sobre-nos.html','História, propósito e diferenciais.'],['Manipule sua receita','/receita.html','Como enviar sua receita para manipulação.'],['Encontre uma loja','/encontre-uma-loja.html','Localizador das unidades por cidade.'],['Área do prescritor','/area-do-prescritor.html','Espaço para médicos e prescritores.'],['A Fórmula Pet','/pet.html','Manipulados veterinários.'],['Contato','/contato.html','Fale com a A Fórmula.'],['Blog','/blog.html','Artigos sobre saúde e manipulação.']];
  fs.writeFileSync(path.join(ROOT,'llms.txt'), `# A Fórmula — Farmácia de Manipulação

> Rede de farmácias de manipulação A Fórmula: medicamentos manipulados, dermocosméticos, suplementos e linha pet, com unidades em todo o Brasil. Este arquivo orienta modelos de linguagem sobre o conteúdo do site.

## Páginas principais
${INST.map(([n,u,d])=>`- [${n}](${BASE}${u}): ${d}`).join('\n')}

## Blog — artigos recentes
${posts.slice(0,30).map(p=>`- [${p.title}](${BASE}${p.path})${p.excerpt?`: ${p.excerpt}`:''}`).join('\n')}

## Recursos
- [Sitemap](${BASE}/sitemap.xml)
- [Feed RSS](${BASE}/rss.xml)
`);

  // 6) IndexNow — só em produção, avisa Bing/Yandex das URLs atualizadas (failsafe)
  if (process.env.VERCEL_ENV === 'production') {
    try {
      const KEY = 'a4c6b619d39cf0f49cdae9fdb7c740e7';
      const urlList = ['/','/blog.html', ...posts.map(p=>p.path)].map(u=>BASE+u);
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ host:'www.aformulabr.com.br', key:KEY, keyLocation:`${BASE}/${KEY}.txt`, urlList })
      });
      console.log(`[indexnow] ${res.status} — ${urlList.length} URLs enviadas`);
    } catch (e) { console.log('[indexnow] falhou (ignorado):', e.message); }
  }
  console.log(`[build] OK — ${posts.length} artigos + blog.html + sitemap + rss + llms regenerados`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error('[build] ERRO (mantendo arquivos commitados):', err.message); process.exit(0); });
}
