// build-lojas.mjs — gera as páginas de unidade em /encontre-uma-loja/{slug}/
//
// Fonte de dados: encontre-uma-loja_assets/lojas.json (mesma que alimenta o mapa).
// Molde: scripts/template-parts.json (head/anim/header/footer) — o mesmo do blog,
// então a página herda navbar, rodapé e CSS do site sem duplicar nada.
//
// PILOTO: por padrão gera só os slugs listados em SLUGS. Para gerar todas,
// rodar com --todas (decisão do operador; ver HANDOFF-2026-08-17-404-redirects.md).
//
// ⚠️ Quem existir aqui precisa sair do catch-all de redirect no vercel.json,
// senão o redirect roda ANTES do filesystem e a página nunca aparece.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.aformulabr.com.br';

const SLUGS = ['salvador-shopping-paralela']; // piloto

const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// (71) 99968-5469 → 5571999685469
const waNumero = (tel) => {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('55') ? d : '55' + d;
};

const CSS = `<style id="loja-css">
.loja-hero{background:var(--dark);color:#fff;padding:104px 0 56px}
.loja-crumb{font-size:13px;letter-spacing:.02em;margin-bottom:18px;color:rgba(255,255,255,.62)}
.loja-crumb a{color:rgba(255,255,255,.62);text-decoration:none}
.loja-crumb a:hover{color:#fff;text-decoration:underline}
.loja-crumb span{margin:0 7px}
.loja-kicker{font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--brand-tint);margin:0 0 10px}
.loja-hero h1{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:clamp(32px,4.4vw,54px);line-height:1.1;margin:0 0 14px}
.loja-hero__end{font-size:17px;line-height:1.6;color:rgba(255,255,255,.82);max-width:46ch;margin:0}

.loja-wrap{padding:56px 0 88px;background:var(--paper)}
.loja-grid{display:grid;grid-template-columns:1fr;gap:32px}
@media(min-width:900px){.loja-grid{grid-template-columns:1fr 1fr;gap:44px;align-items:start}}

.loja-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:30px 28px}
.loja-card h2{font-size:13px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 22px}
.loja-dl{margin:0}
.loja-dl>div{display:flex;gap:14px;padding:15px 0;border-top:1px solid var(--line)}
.loja-dl>div:first-child{border-top:0;padding-top:0}
.loja-dl svg{flex:0 0 20px;width:20px;height:20px;color:var(--brand);margin-top:2px}
.loja-dl dt{font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 3px}
.loja-dl dd{margin:0;font-size:16px;line-height:1.55;color:var(--ink)}
.loja-dl dd a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line)}
.loja-dl dd a:hover{color:var(--brand);border-color:var(--brand)}

.loja-cta{margin-top:28px;display:grid;gap:12px}
.loja-wa{display:flex;align-items:center;justify-content:center;gap:12px;
  background:#1faf54;color:#fff;font-size:19px;font-weight:900;letter-spacing:.01em;
  text-decoration:none;padding:22px 26px;border-radius:14px;line-height:1.2;
  box-shadow:0 8px 22px rgba(31,175,84,.26);transition:background .18s ease,transform .18s ease,box-shadow .18s ease}
.loja-wa:hover{background:#18994a;transform:translateY(-2px);box-shadow:0 12px 28px rgba(31,175,84,.32)}
.loja-wa svg{width:27px;height:27px;flex:0 0 27px}
.loja-rota{display:flex;align-items:center;justify-content:center;gap:10px;
  background:#fff;color:var(--dark);border:1.5px solid var(--dark);font-size:16px;font-weight:900;
  text-decoration:none;padding:17px 24px;border-radius:14px;transition:background .18s ease,color .18s ease}
.loja-rota:hover{background:var(--dark);color:#fff}
.loja-rota svg{width:19px;height:19px;flex:0 0 19px}

.loja-mapa{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#e8eeee}
.loja-mapa iframe{display:block;width:100%;height:420px;border:0}
@media(min-width:900px){.loja-mapa iframe{height:100%;min-height:560px}}

.loja-volta{display:inline-flex;align-items:center;gap:8px;margin-top:40px;
  font-size:15px;font-weight:700;color:var(--brand-deep);text-decoration:none}
.loja-volta:hover{text-decoration:underline}
</style>`;

const ICO = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  fone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.8a2 2 0 0 1 1.7 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.13c-.24.68-1.4 1.3-1.93 1.38-.53.08-1.04.29-3.5-.73-2.95-1.22-4.83-4.27-4.98-4.47-.15-.2-1.2-1.6-1.2-3.05s.76-2.16 1.03-2.46c.27-.3.59-.37.79-.37.2 0 .39.01.56.01.18.01.42-.07.66.5.24.58.82 2.01.89 2.16.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.12.64-.07.17-.2.73-.86.93-1.15.2-.3.39-.24.66-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.12.07.7-.17 1.38z"/></svg>',
  rota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
};

function render(u, parts) {
  const url = `${BASE}/encontre-uma-loja/${u.slug}`;
  const wa = waNumero(u.celular || u.telefone);
  const waMsg = encodeURIComponent(
    `Olá! Vim pelo site da A Fórmula e gostaria de falar com a unidade ${u.nome}.`
  );
  const desc = `A Fórmula em ${u.cidade} (${u.estado}): ${u.endereco}. Fale pelo WhatsApp, veja o endereço no mapa e trace a rota até a farmácia de manipulação mais perto de você.`;

  const titleBlock = `<title>A Fórmula ${E(u.cidade)} — ${E(u.nome)} | Farmácia de Manipulação</title>
<meta name="description" content="${E(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="A Fórmula">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="A Fórmula ${E(u.cidade)} — ${E(u.nome)}">
<meta property="og:description" content="${E(desc)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">`;

  // Endereço vem numa string só. Separo o logradouro do resto sem inventar campo:
  // "Av. Luís Viana Filho, 8544 - Paralela, Salvador - Bahia, Brasil"
  const rua = String(u.endereco || '').split(' - ')[0].trim() || u.endereco;

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    name: `A Fórmula — ${u.nome}`,
    url,
    ...(u.telefone ? { telephone: u.telefone } : {}),
    ...(u.email ? { email: u.email } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: rua,
      addressLocality: u.cidade,
      addressRegion: u.estado,
      ...(u.cep ? { postalCode: u.cep } : {}),
      addressCountry: 'BR',
    },
    ...(u.lat && u.lng
      ? { geo: { '@type': 'GeoCoordinates', latitude: u.lat, longitude: u.lng } }
      : {}),
    ...(u.lat && u.lng
      ? { hasMap: `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}` }
      : {}),
    parentOrganization: { '@type': 'Organization', name: 'A Fórmula', url: BASE },
  });

  const crumbLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Encontre uma loja', item: BASE + '/encontre-uma-loja' },
      { '@type': 'ListItem', position: 3, name: u.nome, item: url },
    ],
  });

  const rotaHref = u.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}&query_place_id=${encodeURIComponent(u.place_id)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.endereco)}`;

  const mapaSrc = `https://maps.google.com/maps?q=${u.lat},${u.lng}&hl=pt-BR&z=16&output=embed`;

  const linha = (icone, rotulo, valorHtml) =>
    `<div>${icone}<div><dt>${rotulo}</dt><dd>${valorHtml}</dd></div></div>`;

  const dados = [
    linha(ICO.pin, 'Endereço',
      `${E(u.endereco)}${u.cep ? `<br>CEP ${E(u.cep)}` : ''}`),
    u.telefone ? linha(ICO.fone, 'Telefone',
      `<a href="tel:+${waNumero(u.telefone)}">${E(u.telefone)}</a>`) : '',
    u.email ? linha(ICO.mail, 'E-mail',
      `<a href="mailto:${E(u.email)}">${E(u.email)}</a>`) : '',
  ].filter(Boolean).join('\n        ');

  const head = parts.head.replace('{{TITLE_BLOCK}}', titleBlock);

  // O molde do header vem do blog, com aria-current no link do Blog.
  // Numa página de unidade a página atual é "Encontre uma loja".
  const header = parts.header
    .replace(' aria-current="page"', '')
    .replace('<a href="/encontre-uma-loja.html">', '<a href="/encontre-uma-loja.html" aria-current="page">');

  return `${head}
${CSS}
<script type="application/ld+json">${ld}</script>
<script type="application/ld+json">${crumbLd}</script>
${parts.anim}
</head>
<body>
${header}
<main id="loja">
  <section class="loja-hero">
    <div class="container">
      <nav class="loja-crumb" aria-label="breadcrumb">
        <a href="/index.html">Início</a> <span>/</span>
        <a href="/encontre-uma-loja.html">Encontre uma loja</a> <span>/</span>
        <span>${E(u.cidade)}</span>
      </nav>
      <p class="loja-kicker">Unidade ${E(u.cidade)} — ${E(u.estado)}</p>
      <h1>${E(u.nome)}</h1>
      <p class="loja-hero__end">Farmácia de manipulação em ${E(u.cidade)}. Fale com a unidade
        pelo WhatsApp, trace a rota ou tire dúvidas sobre a sua fórmula.</p>
    </div>
  </section>

  <div class="loja-wrap">
    <div class="container">
      <div class="loja-grid">

        <div class="loja-card">
          <h2>Dados da unidade</h2>
          <dl class="loja-dl">
        ${dados}
          </dl>

          <div class="loja-cta">
            ${wa ? `<a class="loja-wa" href="https://wa.me/${wa}?text=${waMsg}" target="_blank" rel="noopener"
               data-evt="wa-unidade" data-unidade="${E(u.slug)}">
              ${ICO.wa}<span>Falar no WhatsApp</span>
            </a>` : ''}
            <a class="loja-rota" href="${rotaHref}" target="_blank" rel="noopener"
               data-evt="rota-unidade" data-unidade="${E(u.slug)}">
              ${ICO.rota}<span>Como chegar</span>
            </a>
          </div>
        </div>

        <div class="loja-mapa">
          <iframe src="${mapaSrc}" title="Mapa — ${E(u.nome)}"
                  loading="lazy" referrerpolicy="no-referrer-when-downgrade"
                  allowfullscreen></iframe>
        </div>

      </div>

      <a class="loja-volta" href="/encontre-uma-loja.html">← Ver todas as unidades</a>
    </div>
  </div>
</main>
${parts.footer}
<script src="/index_assets/a28.js"></script>
<script src="/index_assets/a31.js"></script>
</body></html>`;
}

function main() {
  const todas = process.argv.includes('--todas');
  const lojas = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets', 'lojas.json'), 'utf8')
  );
  const parts = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'template-parts.json'), 'utf8')
  );

  const alvo = todas ? lojas : lojas.filter((u) => SLUGS.includes(u.slug));
  if (!alvo.length) {
    console.error('[lojas] nenhuma unidade casou com SLUGS:', SLUGS.join(', '));
    process.exit(1);
  }

  for (const u of alvo) {
    if (!u.slug || u.lat == null || u.lng == null) {
      console.warn(`[lojas] pulada (sem slug/coordenada): ${u.nome}`);
      continue;
    }
    const dir = path.join(ROOT, 'encontre-uma-loja', u.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(u, parts));
    console.log(`[lojas] /encontre-uma-loja/${u.slug}`);
  }
  console.log(`[lojas] ${alvo.length} pagina(s) gerada(s)`);
}

main();
