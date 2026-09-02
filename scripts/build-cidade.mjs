// build-cidade.mjs — pagina-CIDADE que agrega as unidades de uma cidade com mais de uma loja.
//
// POR QUE EXISTE: em Salvador as 4 paginas de bairro competem entre si pelo termo generico
// "farmacia de manipulacao em salvador" (2.631 exibicoes, posicao 7,1 no Search Console).
// A pagina-cidade e o PAI: ela responde o termo generico e distribui o clique para a filha
// certa. As paginas de unidade seguem intocadas, cada uma com o seu proprio canonical.
//
// DECISOES DE DADO (as mesmas do scripts/build-lojas.mjs):
//   - Endereco, telefone e e-mail vem VERBATIM do encontre-uma-loja_assets/lojas.json.
//   - Nada de horario aqui: horario e por unidade e vive na pagina da unidade.
//   - Nada de aggregateRating: a nota e do Google, nao deste site.
//   - Nada de CRF, CNPJ ou farmaceutico responsavel: dado regulado, so entra com a fonte.
//   - Zero afirmacao terapeutica: sem associar ativo a indicacao clinica (setor ANVISA).
//   - O CSS e EXTRAIDO da pagina de unidade ja publicada, nao reescrito — garante que a
//     cidade e a unidade nunca divirjam visualmente.
//
// Uso: node scripts/build-cidade.mjs salvador
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.aformulabr.com.br';

// Cidades habilitadas. Uma entrada por cidade — NAO ha rollout automatico: cada cidade
// entra por decisao explicita, porque cada uma tem um numero de unidades e um termo proprio.
const CIDADES = {
  salvador: { cidade: 'Salvador', estado: 'BA', slugPagina: 'salvador' },
};

const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const so = (s) => String(s || '').replace(/\D/g, '');
const aberta = (u) => !/em breve/i.test(`${u.nome} ${u.slug}`);

const waNumero = (tel) => {
  const d = so(tel);
  if (!d) return null;
  if (d.length === 11 || d.length === 10) return `55${d}`;
  if (d.length === 13 && d.startsWith('55')) return d;
  return null;
};

// "Salvador — Shopping Paralela" -> "Shopping Paralela". Mesmo criterio do build-lojas.
const distintivo = (u) => {
  const m = String(u.nome || '').split(/\s+[—–-]\s+/);
  return m.length > 1 ? m.slice(1).join(' — ').trim() : '';
};

const ICO = {
  pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  wa: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.5-5.9c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.6.7c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7 7 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.6-.6c.1-.2.2-.4.1-.6l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.3.3-.9 1-.9 2.2 0 1.3.9 2.5 1 2.7.1.2 1.7 2.7 4.2 3.7 2.1.8 2.5.7 2.9.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.2-.2-.4-.3z"/></svg>',
  seta: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

function cssDaUnidade(slugExemplo) {
  const p = path.join(ROOT, 'encontre-uma-loja', slugExemplo, 'index.html');
  const html = fs.readFileSync(p, 'utf8');
  const m = html.match(/<style id="loja-css">[\s\S]*?<\/style>/);
  if (!m) throw new Error(`[cidade] nao achei <style id="loja-css"> em ${p}`);
  return m[0];
}

const CSS_EXTRA = `<style id="cidade-css">
#cidade .cid-titulo{margin:4px 0 14px;font-size:1.15rem;line-height:1.3}
#cidade .cid-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
#cidade .cid-unidade h3{margin:0 0 6px;font-size:1.05rem;line-height:1.3}
#cidade .cid-unidade p{margin:0 0 10px}
#cidade .cid-acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}
#cidade .cid-unidade{display:flex;flex-direction:column}
/* min-height 44px: alvo de toque. Medido em 390px, o link nasceu com 26px de altura. */
#cidade .cid-ver{display:inline-flex;align-items:center;justify-content:center;gap:6px;
  font-weight:600;text-decoration:none;min-height:44px;padding:0 4px}
@media (max-width:420px){#cidade .cid-acoes .loja-wa,#cidade .cid-acoes .cid-ver{width:100%;justify-content:center}}
</style>`;

function render(cfg, unidades, parts, cssLoja) {
  const { cidade, estado, slugPagina } = cfg;
  const url = `${BASE}/${slugPagina}`;
  const n = unidades.length;

  const title = `Farmácia de Manipulação em ${cidade} — ${n} unidades | A Fórmula`;
  const bairros = unidades.map((u) => distintivo(u)).filter(Boolean);
  const desc = `A Fórmula tem ${n} unidades em ${cidade} (${estado})`
    + (bairros.length ? `: ${bairros.join(', ')}. ` : '. ')
    + `Veja endereço e telefone de cada uma e envie a foto da sua receita pelo WhatsApp da unidade mais perto de você.`;

  const titleBlock = `<title>${E(title)}</title>
<meta name="description" content="${E(desc)}">
<link rel="canonical" href="${url}">
<meta name="geo.placename" content="${E(`${cidade} - ${estado}`)}">
<meta name="geo.region" content="BR-${E(estado)}">
<meta property="og:site_name" content="A Fórmula">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${E(title)}">
<meta property="og:description" content="${E(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/index_assets/a18.jpg">
<meta property="og:image:width" content="1537">
<meta property="og:image:height" content="1023">
<meta property="og:image:alt" content="Farmacêutica da A Fórmula manipulando em laboratório">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${BASE}/index_assets/a18.jpg">`;

  // ---------- cards das unidades (cada card leva pra pagina FILHA) ----------
  const cards = unidades.map((u) => {
    const dist = distintivo(u);
    const nomeCompleto = `A Fórmula ${dist ? `${cidade} — ${dist}` : cidade}`;
    const tel = u.celular || u.telefone || null;
    const wa = waNumero(tel);
    const href = `/encontre-uma-loja/${u.slug}`;
    const waMsg = encodeURIComponent(
      `Olá! Vim pelo site da A Fórmula e gostaria de falar com a unidade ${dist || cidade}.`);
    return `        <div class="loja-card cid-unidade">
          <h3>${E(dist || cidade)}</h3>
          <p>${ICO.pin} ${E(String(u.endereco).trim())}${u.cep ? `<br>CEP ${E(u.cep)}` : ''}</p>
          ${tel ? `<p>${E(tel)}</p>` : ''}
          <div class="cid-acoes">
            <a class="cid-ver" href="${href}">Ver a unidade ${ICO.seta}</a>
            ${wa ? `<a class="loja-wa" href="https://wa.me/${wa}?text=${waMsg}" target="_blank" rel="noopener"
               data-evt="wa-unidade" data-unidade="${E(u.slug)}">${ICO.wa}<span>WhatsApp</span></a>` : ''}
          </div>
        </div>`;
  }).join('\n');

  // ---------- FAQ (institucional: conta unidade, endereco e como enviar receita.
  //            NENHUMA resposta associa ativo a indicacao clinica) ----------
  const faq = [
    {
      q: `Quantas unidades da A Fórmula existem em ${cidade}?`,
      a: `A A Fórmula tem ${n} unidades em ${cidade} (${estado})`
        + (bairros.length ? `: ${bairros.join(', ')}.` : '.')
        + ` Cada unidade tem a própria página, com endereço, telefone e horário.`,
    },
    {
      q: `Como enviar a receita para uma unidade da A Fórmula em ${cidade}?`,
      a: `Para enviar a receita a uma unidade da A Fórmula em ${cidade}, abra a página da`
        + ` unidade mais perto de você e fale no WhatsApp dela: você manda a foto da receita`
        + ` e a equipe da própria loja responde com o orçamento.`,
    },
    {
      q: `A A Fórmula de ${cidade} manipula medicamento sem receita?`,
      a: `Não. A A Fórmula em ${cidade} manipula medicamento sob prescrição: é a receita do`
        + ` seu médico que define o ativo, a dose e a forma farmacêutica.`,
    },
  ];
  const faqHtml = faq.map((f) => `        <details>
          <summary>${E(f.q)}</summary>
          <div class="loja-prosa"><p>${E(f.a)}</p></div>
        </details>`).join('\n');

  // ---------- dados estruturados ----------
  // A pagina-cidade NAO repete o Pharmacy das filhas: ela referencia o @id de cada uma
  // (`.../encontre-uma-loja/{slug}#unidade`). Duplicar o Pharmacy aqui criaria duas
  // entidades para a mesma loja e faria a cidade competir com a unidade — o oposto do
  // que esta pagina existe para resolver.
  const grafo = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#pagina`,
        url,
        name: title,
        description: desc,
        inLanguage: 'pt-BR',
        isPartOf: { '@id': `${BASE}/#site` },
        about: { '@id': `${url}#unidades` },
        primaryTopic: { '@id': `${url}#unidades` },
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.loja-hero h1', '.loja-lead'],
        },
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#unidades`,
        name: `Unidades da A Fórmula em ${cidade}`,
        numberOfItems: n,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: unidades.map((u, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `A Fórmula ${distintivo(u) ? `${cidade} — ${distintivo(u)}` : cidade}`,
          url: `${BASE}/encontre-uma-loja/${u.slug}`,
          item: { '@id': `${BASE}/encontre-uma-loja/${u.slug}#unidade` },
        })),
      },
      {
        '@type': 'Organization',
        '@id': `${BASE}/#organizacao`,
        name: 'A Fórmula',
        url: BASE + '/',
        logo: `${BASE}/index_assets/a27.webp`,
      },
      {
        '@type': 'WebSite',
        '@id': `${BASE}/#site`,
        url: BASE + '/',
        name: 'A Fórmula',
        inLanguage: 'pt-BR',
        publisher: { '@id': `${BASE}/#organizacao` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#trilha`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: BASE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Encontre uma loja', item: BASE + '/encontre-uma-loja' },
          { '@type': 'ListItem', position: 3, name: cidade, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        isPartOf: { '@id': `${url}#pagina` },
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  const head = parts.head.replace('{{TITLE_BLOCK}}', titleBlock);
  const header = parts.header
    .replace(' aria-current="page"', '')
    .replace('<a href="/encontre-uma-loja.html">', '<a href="/encontre-uma-loja.html" aria-current="page">');

  return `${head}
${cssLoja}
${CSS_EXTRA}
<script type="application/ld+json">${JSON.stringify(grafo)}</script>
${parts.anim}
</head>
<body>
${header}
<main id="cidade">

  <section class="loja-hero">
    <div class="container">
      <nav class="loja-crumb" aria-label="breadcrumb">
        <a href="/index.html">Início</a> <span>/</span>
        <a href="/encontre-uma-loja.html">Encontre uma loja</a> <span>/</span>
        <span>${E(cidade)}</span>
      </nav>
      <p class="loja-kicker">${E(cidade)} — ${E(estado)}</p>
      <h1>Farmácia de manipulação em ${E(cidade)}</h1>
      <p class="loja-lead">A Fórmula tem ${n} unidades em ${E(cidade)}${bairros.length ? `: ${E(bairros.join(', '))}` : ''}.
        Escolha a mais perto de você, envie a foto da sua receita pelo WhatsApp da unidade
        e receba o orçamento da própria loja.</p>
    </div>
  </section>

  <div class="loja-wrap">
    <div class="container">

      <h2 class="cid-titulo">As ${n} unidades da A Fórmula em ${E(cidade)}</h2>

      <div class="cid-grid">
${cards}
      </div>

      <div class="loja-card" style="margin-top:8px">
        <h2>O que você resolve em uma unidade da A Fórmula em ${E(cidade)}</h2>
        <div class="loja-prosa">
          <p>Em qualquer uma das ${n} unidades de ${E(cidade)} você envia a foto da receita e
          recebe o orçamento pelo WhatsApp da loja, manipula o medicamento na dose e na forma
          farmacêutica que o seu médico prescreveu, retira a fórmula pronta no balcão e tira
          dúvidas sobre a prescrição com a equipe da própria unidade.</p>
        </div>
      </div>

      <div class="loja-card loja-faq" style="margin-top:8px">
        <h2>Perguntas frequentes sobre a A Fórmula em ${E(cidade)}</h2>
${faqHtml}
      </div>

      <a class="loja-volta" href="/encontre-uma-loja.html">← Ver todas as unidades</a>
    </div>
  </div>
</main>
${parts.footer}
<script src="/index_assets/a28.js"></script>
<script src="/index_assets/a31.js"></script>
<script src="/index_assets/af-contato.v2.js"></script>
</body></html>`;
}

function main() {
  const alvo = process.argv[2];
  const cfg = CIDADES[alvo];
  if (!cfg) {
    console.error(`[cidade] uso: node scripts/build-cidade.mjs <${Object.keys(CIDADES).join('|')}>`);
    process.exit(1);
  }
  const lojas = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets', 'lojas.json'), 'utf8'));
  const parts = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'template-parts.json'), 'utf8'));

  const unidades = lojas
    .filter((u) => u.cidade === cfg.cidade && aberta(u))
    .filter((u) => {
      // So entra na pagina-cidade a unidade que TEM pagina propria publicada: o card
      // aponta pra filha, e card que aponta pro vazio e link morto.
      const ok = fs.existsSync(path.join(ROOT, 'encontre-uma-loja', u.slug, 'index.html'));
      if (!ok) console.warn(`[cidade] ${u.slug}: sem pagina publicada, fora da lista`);
      return ok;
    })
    .sort((a, b) => a.slug.localeCompare(b.slug, 'pt-BR'));

  if (!unidades.length) {
    console.error(`[cidade] nenhuma unidade publicada em ${cfg.cidade} — nada a gerar`);
    process.exit(1);
  }

  const cssLoja = cssDaUnidade(unidades[0].slug);
  const html = render(cfg, unidades, parts, cssLoja);
  const dir = path.join(ROOT, cfg.slugPagina);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);

  console.log(`[cidade] /${cfg.slugPagina} gerada — ${unidades.length} unidades: ${unidades.map((u) => u.slug).join(', ')}`);
  console.log(`[cidade] ${(html.length / 1024).toFixed(0)} KB`);
}

main();
