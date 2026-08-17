// build-lojas.mjs — páginas de unidade em /encontre-uma-loja/{slug}/
//
// Fonte: encontre-uma-loja_assets/lojas.json (a mesma que alimenta o mapa).
// Molde: scripts/template-parts.json (head/anim/header/footer) — o mesmo do blog,
// então herda navbar, rodapé e CSS do site sem duplicar nada.
//
// Uso:  node scripts/build-lojas.mjs           → só os slugs de SLUGS (piloto)
//       node scripts/build-lojas.mjs --todas    → as 75 unidades ABERTAS
//
// ⚠️ Roda À MÃO. Não está no buildCommand da Vercel — as páginas vão commitadas.
// ⚠️ Todo slug gerado precisa sair do catch-all de redirect no vercel.json:
//    na Vercel o redirect roda ANTES do filesystem e engole a página real.
//
// DECISÕES DE DADO (não mexer sem ler):
// - "em breve" (10 unidades) NÃO gera página: sem horário e sem CTA de WhatsApp
//   a página mentiria que a loja atende.
// - O BAIRRO não é extraído do endereço. Tentei: falha em 20/85 e, pior, acerta
//   errado (macapa-amapa → "AP"; maceio-hiper-galeria → "Av. Fernandes Lima"),
//   porque o cadastro não tem separador consistente. O diferenciador de unidade
//   vem do `nome`, que é dado curado pela matriz (validado: as 8 cidades com 2+
//   unidades têm rótulo único).
// - O endereço aparece SEMPRE verbatim, nunca recomposto.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.aformulabr.com.br';

const SLUGS = ['salvador-shopping-paralela']; // piloto

// ⚠️ HORÁRIO GENÉRICO — decisão do operador 2026-08-17, na falta do dado real
// (cobertura 0% no lojas.json). A página declara que é referência e manda
// confirmar pelo WhatsApp. Quando vier o horário por unidade, trocar aqui
// (ou passar a ler u.horario, se o campo for criado no cadastro).
const HORARIO = {
  semana: { abre: '08:00', fecha: '18:00', rotulo: 'Segunda a sexta' },
  sabado: { abre: '08:00', fecha: '13:00', rotulo: 'Sábado' },
  domingoFechado: true,
};

// '08:00' → '8h' · '13:30' → '13h30' (sem zero à esquerda, como se escreve em pt-BR)
const hm = (s) => String(s).replace(/^0/, '').replace(':', 'h').replace(/h00$/, 'h');

const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const aberta = (u) => !/em breve/i.test(`${u.nome} ${u.slug}`);

// (71) 99968-5469 → 5571999685469
const waNumero = (tel) => {
  const d = String(tel || '').replace(/\D/g, '');
  return d ? (d.startsWith('55') ? d : '55' + d) : null;
};

// Diferenciador da unidade dentro da cidade. Vem do nome, não do endereço.
function distintivo(u) {
  const nome = String(u.nome || '').trim();
  const cidade = String(u.cidade || '').trim();
  if (!nome) return null;
  if (!norm(nome).includes(norm(cidade))) return nome;      // ex.: "Brooklin"
  // `|` aparece no cadastro (ex.: "Shopping Barra | Bahia"). Ruido de dado: normalizo
  // apenas para exibicao, sem tocar no lojas.json.
  const resto = nome.split(/\s+[–—-]\s+/).slice(1).join(' — ')
    .replace(/\s*\|\s*/g, ' — ').replace(/\s+/g, ' ').trim();
  return resto || null;                                      // ex.: "Shopping Paralela"
}

const rotulo = (u) => {
  const d = distintivo(u);
  return d ? `${u.cidade} — ${d}` : u.cidade;
};

function distanciaKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fmtKm = (k) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(1).replace('.', ',')} km`);

const CSS = `<style id="loja-css">
.loja-hero{background:var(--dark);color:#fff;padding:104px 0 60px}
.loja-crumb{font-size:13px;margin-bottom:18px;color:rgba(255,255,255,.6)}
.loja-crumb a{color:rgba(255,255,255,.6);text-decoration:none}
.loja-crumb a:hover{color:#fff;text-decoration:underline}
.loja-crumb span{margin:0 7px}
.loja-kicker{font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--brand-tint);margin:0 0 10px}
.loja-hero h1{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:clamp(30px,4.1vw,50px);line-height:1.12;margin:0 0 16px;max-width:22ch}
.loja-lead{font-size:17px;line-height:1.65;color:rgba(255,255,255,.85);max-width:58ch;margin:0}

.loja-wrap{padding:0 0 88px;background:var(--paper)}
.loja-cols{display:grid;grid-template-columns:1fr;gap:34px;padding-top:44px}
@media(min-width:960px){.loja-cols{grid-template-columns:1.05fr .95fr;gap:44px;align-items:start}}

.loja-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:30px 28px;margin-bottom:24px}
.loja-card>h2{font-size:13px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 22px}

.loja-dl{margin:0}
.loja-dl>div{display:flex;gap:14px;padding:15px 0;border-top:1px solid var(--line)}
.loja-dl>div:first-child{border-top:0;padding-top:0}
.loja-dl svg{flex:0 0 20px;width:20px;height:20px;color:var(--brand);margin-top:2px}
.loja-dl dt{font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 3px}
.loja-dl dd{margin:0;font-size:16px;line-height:1.55;color:var(--ink)}
.loja-dl dd a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--line)}
.loja-dl dd a:hover{color:var(--brand);border-color:var(--brand)}

.loja-cta{margin-top:26px;display:grid;gap:12px}
.loja-wa{display:flex;align-items:center;justify-content:center;gap:12px;background:#1faf54;color:#fff;
  font-size:19px;font-weight:900;text-decoration:none;padding:22px 26px;border-radius:14px;line-height:1.2;
  box-shadow:0 8px 22px rgba(31,175,84,.26);transition:background .18s,transform .18s,box-shadow .18s}
.loja-wa:hover{background:#18994a;transform:translateY(-2px);box-shadow:0 12px 28px rgba(31,175,84,.32)}
.loja-wa svg{width:27px;height:27px;flex:0 0 27px}
.loja-rota{display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:var(--dark);
  border:1.5px solid var(--dark);font-size:16px;font-weight:900;text-decoration:none;padding:17px 24px;
  border-radius:14px;transition:background .18s,color .18s}
.loja-rota:hover{background:var(--dark);color:#fff}
.loja-rota svg{width:19px;height:19px;flex:0 0 19px}

.loja-horas{margin:0;border-top:1px solid var(--line)}
.loja-horas>div{display:flex;justify-content:space-between;gap:16px;padding:13px 0;border-bottom:1px solid var(--line);font-size:16px}
.loja-horas dt{color:var(--ink);margin:0}
.loja-horas dd{margin:0;font-weight:700;color:var(--ink);white-space:nowrap}
.loja-horas .fechado{color:var(--muted);font-weight:400}
.loja-nota{font-size:13.5px;line-height:1.6;color:var(--muted);margin:16px 0 0}

.loja-mapa{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#e8eeee;margin-bottom:24px}
.loja-mapa iframe{display:block;width:100%;height:380px;border:0}

.loja-prosa{font-size:16.5px;line-height:1.72;color:var(--ink)}
.loja-prosa p{margin:0 0 15px}
.loja-prosa p:last-child{margin-bottom:0}
.loja-prosa a{color:var(--brand-deep);font-weight:700}

.loja-faz{list-style:none;margin:0;padding:0}
.loja-faz li{display:flex;gap:12px;padding:13px 0;border-top:1px solid var(--line);font-size:16px;line-height:1.55;color:var(--ink)}
.loja-faz li:first-child{border-top:0;padding-top:0}
.loja-faz svg{flex:0 0 19px;width:19px;height:19px;color:var(--brand);margin-top:3px}

.loja-perto{list-style:none;margin:0;padding:0}
.loja-perto li{border-top:1px solid var(--line)}
.loja-perto li:first-child{border-top:0}
.loja-perto a{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:15px 0;text-decoration:none}
.loja-perto strong{font-size:16px;font-weight:700;color:var(--ink)}
.loja-perto a:hover strong{color:var(--brand)}
.loja-perto span{font-size:14px;color:var(--muted);white-space:nowrap}

.loja-faq{margin-top:8px}
.loja-faq details{border-top:1px solid var(--line)}
.loja-faq details:last-of-type{border-bottom:1px solid var(--line)}
.loja-faq summary{cursor:pointer;list-style:none;padding:19px 34px 19px 0;position:relative;
  font-size:16.5px;font-weight:700;color:var(--ink);line-height:1.45}
.loja-faq summary::-webkit-details-marker{display:none}
.loja-faq summary::after{content:"";position:absolute;right:6px;top:26px;width:9px;height:9px;
  border-right:2px solid var(--brand);border-bottom:2px solid var(--brand);
  transform:rotate(45deg);transition:transform .2s}
.loja-faq details[open] summary::after{transform:rotate(225deg)}
.loja-faq .resp{padding:0 0 20px;font-size:16px;line-height:1.7;color:var(--muted);max-width:70ch}
.loja-faq .resp a{color:var(--brand-deep);font-weight:700}

.loja-volta{display:inline-flex;align-items:center;gap:8px;margin-top:38px;font-size:15px;font-weight:700;
  color:var(--brand-deep);text-decoration:none}
.loja-volta:hover{text-decoration:underline}
</style>`;

const I = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  fone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.8a2 2 0 0 1 1.7 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.13c-.24.68-1.4 1.3-1.93 1.38-.53.08-1.04.29-3.5-.73-2.95-1.22-4.83-4.27-4.98-4.47-.15-.2-1.2-1.6-1.2-3.05s.76-2.16 1.03-2.46c.27-.3.59-.37.79-.37.2 0 .39.01.56.01.18.01.42-.07.66.5.24.58.82 2.01.89 2.16.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.12.64-.07.17-.2.73-.86.93-1.15.2-.3.39-.24.66-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.12.07.7-.17 1.38z"/></svg>',
  rota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
};

function render(u, todas, parts) {
  const url = `${BASE}/encontre-uma-loja/${u.slug}`;
  const rot = rotulo(u);                 // "Salvador — Shopping Paralela"
  const dist = distintivo(u);            // "Shopping Paralela"
  const nomeCompleto = `A Fórmula ${rot}`;
  const tel = u.celular || u.telefone || null;
  const wa = waNumero(tel);
  const irmas = todas.filter((o) => o.cidade === u.cidade && o.slug !== u.slug && aberta(o));

  const horaSemana = `${hm(HORARIO.semana.abre)} às ${hm(HORARIO.semana.fecha)}`;
  const horaSabado = `${hm(HORARIO.sabado.abre)} às ${hm(HORARIO.sabado.fecha)}`;

  // ---------- meta ----------
  const title = dist
    ? `Farmácia de Manipulação em ${u.cidade} — ${dist} | A Fórmula`
    : `Farmácia de Manipulação em ${u.cidade} | A Fórmula`;
  const desc = `A Fórmula em ${u.cidade} (${u.estado}): ${u.endereco}. ` +
    `${HORARIO.semana.rotulo} de ${horaSemana}, sábado de ${horaSabado}. ` +
    `Envie a receita pelo WhatsApp e receba o orçamento.`;

  const titleBlock = `<title>${E(title)}</title>
<meta name="description" content="${E(desc)}">
<link rel="canonical" href="${url}">
<meta name="geo.position" content="${u.lat};${u.lng}">
<meta name="geo.placename" content="${E(`${u.cidade} - ${u.estado}`)}">
<meta name="geo.region" content="BR-${E(u.estado)}">
<meta name="ICBM" content="${u.lat}, ${u.lng}">
<meta property="og:site_name" content="A Fórmula">
<meta property="og:type" content="business.business">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${E(nomeCompleto)} — Farmácia de Manipulação">
<meta property="og:description" content="${E(desc)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">`;

  // ---------- perguntas (respostas AUTOSSUFICIENTES: cada uma repete o sujeito,
  // porque LLM extrai a frase isolada e sem o sujeito ela não serve de citação) ----------
  const confirme = tel ? ` confirme com a unidade pelo WhatsApp: ${tel}.` : ' confirme com a unidade.';
  const faq = [];
  faq.push({
    q: `Qual o horário de funcionamento da ${nomeCompleto}?`,
    a: `${nomeCompleto} atende de segunda a sexta, de ${horaSemana}, e no sábado, de ${horaSabado}. ` +
       `Não abre no domingo. Este é o horário de referência da rede — em feriados e datas especiais ` +
       `pode mudar, então${confirme}`,
  });
  faq.push({
    q: `Onde fica a ${nomeCompleto}?`,
    a: `${nomeCompleto} fica em ${u.endereco}${u.cep ? `, CEP ${u.cep}` : ''}. ` +
       `Nesta página você abre a rota direto no Google Maps.`,
  });
  if (tel) faq.push({
    q: `Qual o telefone e o WhatsApp da ${nomeCompleto}?`,
    a: `O contato da unidade ${rot} (${u.estado}) é ${tel} — o mesmo número atende ` +
       `no WhatsApp. Você envia a foto da receita e a equipe da unidade responde com o orçamento.`,
  });
  faq.push({
    q: `Preciso de receita para manipular um medicamento na A Fórmula?`,
    a: `Sim. Medicamentos manipulados são preparados exclusivamente mediante prescrição — é o que ` +
       `garante a dose correta e a segurança do tratamento. Isso vale para a unidade ${rot} e para ` +
       `todas as unidades da rede.`,
  });
  faq.push({
    q: `Como envio a minha receita para a ${nomeCompleto}?`,
    a: `Tire uma foto da receita e envie no WhatsApp da unidade ${rot}${tel ? `: ${tel}` : ''}. ` +
       `A unidade analisa a prescrição e responde com o orçamento e os próximos passos. Leva menos ` +
       `de um minuto. O passo a passo completo está em <a href="/receita">Como manipular sua receita</a>.`,
  });
  faq.push({
    q: `Quanto tempo leva para a fórmula ficar pronta?`,
    a: `O prazo varia conforme a fórmula e a forma farmacêutica. ${nomeCompleto} informa a previsão ` +
       `junto com o orçamento, logo após analisar a receita.`,
  });
  if (irmas.length) faq.push({
    q: `A Fórmula tem outras unidades em ${u.cidade}?`,
    a: `Sim. Além da unidade ${dist || u.cidade}, a A Fórmula tem ${irmas.length === 1 ? 'mais uma unidade' : `mais ${irmas.length} unidades`} ` +
       `em ${u.cidade}: ${irmas.map((o) => distintivo(o) || o.cidade).join(', ')}. ` +
       `Todas aparecem em <a href="/encontre-uma-loja">Encontre uma loja</a>.`,
  });

  const faqHtml = faq.map((f) => `        <details>
          <summary>${E(f.q)}</summary>
          <div class="resp">${f.a}</div>
        </details>`).join('\n');

  // ---------- unidades mais próximas (malha interna real, única por página) ----------
  const perto = todas
    .filter((o) => o.slug !== u.slug && aberta(o) && o.lat != null && o.lng != null)
    .map((o) => ({ u: o, km: distanciaKm(u, o) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 4);

  const pertoHtml = perto.map((p) =>
    `          <li><a href="/encontre-uma-loja/${E(p.u.slug)}">
            <strong>${E(rotulo(p.u))}</strong><span>${fmtKm(p.km)}</span>
          </a></li>`).join('\n');

  // ---------- dados estruturados ----------
  const gbp = u.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${u.place_id}`
    : null;

  const pharmacy = {
    '@type': 'Pharmacy',
    '@id': `${url}#unidade`,
    name: nomeCompleto,
    url,
    ...(tel ? { telephone: tel } : {}),
    ...(u.email ? { email: u.email } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: u.endereco,
      addressLocality: u.cidade,
      addressRegion: u.estado,
      ...(u.cep ? { postalCode: u.cep } : {}),
      addressCountry: 'BR',
    },
    geo: { '@type': 'GeoCoordinates', latitude: u.lat, longitude: u.lng },
    hasMap: `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}`,
    ...(gbp ? { sameAs: [gbp] } : {}),
    areaServed: { '@type': 'City', name: u.cidade },
    currenciesAccepted: 'BRL',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: HORARIO.semana.abre, closes: HORARIO.semana.fecha,
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday'],
        opens: HORARIO.sabado.abre, closes: HORARIO.sabado.fecha,
      },
    ],
    parentOrganization: { '@id': `${BASE}/#organizacao` },
  };

  const grafo = {
    '@context': 'https://schema.org',
    '@graph': [
      pharmacy,
      {
        '@type': 'Organization',
        '@id': `${BASE}/#organizacao`,
        name: 'A Fórmula',
        url: BASE + '/',
        description: 'Rede de farmácias de manipulação com 37 anos de atuação no Brasil.',
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#pagina`,
        url,
        name: title,
        description: desc,
        inLanguage: 'pt-BR',
        isPartOf: { '@id': `${BASE}/#site` },
        about: { '@id': `${url}#unidade` },
        primaryTopic: { '@id': `${url}#unidade` },
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
          { '@type': 'ListItem', position: 3, name: rot, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        isPartOf: { '@id': `${url}#pagina` },
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') },
        })),
      },
    ],
  };

  const rotaHref = u.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}&query_place_id=${encodeURIComponent(u.place_id)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.endereco)}`;
  const mapaSrc = `https://maps.google.com/maps?q=${u.lat},${u.lng}&hl=pt-BR&z=16&output=embed`;
  const waMsg = encodeURIComponent(`Olá! Vim pelo site da A Fórmula e gostaria de falar com a unidade ${rot}.`);

  const linha = (ico, dt, dd) => `<div>${ico}<div><dt>${dt}</dt><dd>${dd}</dd></div></div>`;
  const dados = [
    linha(I.pin, 'Endereço', `${E(u.endereco)}${u.cep ? `<br>CEP ${E(u.cep)}` : ''}`),
    tel ? linha(I.fone, 'Telefone e WhatsApp', `<a href="tel:+${wa}">${E(tel)}</a>`) : '',
    u.email ? linha(I.mail, 'E-mail', `<a href="mailto:${E(u.email)}">${E(u.email)}</a>`) : '',
    linha(I.relogio, 'Horário', `${HORARIO.semana.rotulo}, ${horaSemana}<br>${HORARIO.sabado.rotulo}, ${horaSabado}`),
  ].filter(Boolean).join('\n            ');

  const head = parts.head.replace('{{TITLE_BLOCK}}', titleBlock);

  // O molde do header vem do blog, com aria-current no Blog.
  const header = parts.header
    .replace(' aria-current="page"', '')
    .replace('<a href="/encontre-uma-loja.html">', '<a href="/encontre-uma-loja.html" aria-current="page">');

  return `${head}
${CSS}
<script type="application/ld+json">${JSON.stringify(grafo)}</script>
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
        <span>${E(rot)}</span>
      </nav>
      <p class="loja-kicker">Unidade ${E(u.cidade)} — ${E(u.estado)}</p>
      <h1>Farmácia de manipulação em ${E(u.cidade)}${dist ? ` — ${E(dist)}` : ''}</h1>
      <p class="loja-lead">${E(nomeCompleto)} fica em ${E(u.endereco)}.
        Atende de ${E(HORARIO.semana.rotulo.toLowerCase())} de ${E(horaSemana)} e no sábado de ${E(horaSabado)}.
        Envie a foto da sua receita pelo WhatsApp e receba o orçamento da unidade.</p>
    </div>
  </section>

  <div class="loja-wrap">
    <div class="container">
      <div class="loja-cols">

        <div>
          <div class="loja-card">
            <h2>Dados da unidade</h2>
            <dl class="loja-dl">
            ${dados}
            </dl>
            <div class="loja-cta">
              ${wa ? `<a class="loja-wa" href="https://wa.me/${wa}?text=${waMsg}" target="_blank" rel="noopener"
                 data-evt="wa-unidade" data-unidade="${E(u.slug)}">
                ${I.wa}<span>Falar no WhatsApp</span>
              </a>` : ''}
              <a class="loja-rota" href="${rotaHref}" target="_blank" rel="noopener"
                 data-evt="rota-unidade" data-unidade="${E(u.slug)}">
                ${I.rota}<span>Como chegar</span>
              </a>
            </div>
          </div>

          <div class="loja-card">
            <h2>Horário de atendimento</h2>
            <dl class="loja-horas">
              <div><dt>${E(HORARIO.semana.rotulo)}</dt><dd>${E(horaSemana)}</dd></div>
              <div><dt>${E(HORARIO.sabado.rotulo)}</dt><dd>${E(horaSabado)}</dd></div>
              <div><dt>Domingo</dt><dd class="fechado">Fechado</dd></div>
            </dl>
            <p class="loja-nota">Horário de referência da rede. Em feriados e datas especiais pode
              mudar — vale confirmar com a unidade${tel ? ` pelo WhatsApp: ${E(tel)}` : ''} antes de ir.</p>
          </div>

          <div class="loja-card">
            <h2>O que você resolve nesta unidade</h2>
            <ul class="loja-faz">
              <li>${I.check}<span>Enviar a foto da sua receita e receber o orçamento pelo WhatsApp,
                sem sair de casa.</span></li>
              <li>${I.check}<span>Manipular medicamentos sob prescrição, na dose e na forma
                farmacêutica que o seu médico indicou.</span></li>
              <li>${I.check}<span>Retirar a fórmula pronta no balcão da unidade, em ${E(u.cidade)}.</span></li>
              <li>${I.check}<span>Tirar dúvidas sobre a prescrição com a equipe da própria loja.</span></li>
            </ul>
          </div>
        </div>

        <div>
          <div class="loja-mapa">
            <iframe src="${mapaSrc}" title="Mapa — ${E(nomeCompleto)}"
                    loading="lazy" referrerpolicy="no-referrer-when-downgrade"
                    allowfullscreen></iframe>
          </div>

          <div class="loja-card">
            <h2>Como chegar</h2>
            <div class="loja-prosa">
              <p>${E(nomeCompleto)} está em ${E(u.endereco)}${u.cep ? `, CEP ${E(u.cep)}` : ''}.</p>
              <p><a href="${rotaHref}" target="_blank" rel="noopener">Abrir a rota no Google Maps →</a></p>
            </div>
          </div>

          ${perto.length ? `<div class="loja-card">
            <h2>Unidades mais próximas</h2>
            <ul class="loja-perto">
${pertoHtml}
            </ul>
          </div>` : ''}
        </div>

      </div>

      <div class="loja-card loja-faq" style="margin-top:8px">
        <h2>Perguntas frequentes sobre a unidade</h2>
${faqHtml}
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
  const todasFlag = process.argv.includes('--todas');
  const lojas = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets', 'lojas.json'), 'utf8')
  );
  const parts = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'template-parts.json'), 'utf8')
  );

  const abertas = lojas.filter(aberta);
  const alvo = todasFlag ? abertas : abertas.filter((u) => SLUGS.includes(u.slug));

  if (!alvo.length) {
    console.error('[lojas] nenhuma unidade ABERTA casou com SLUGS:', SLUGS.join(', '));
    process.exit(1);
  }
  console.log(`[lojas] ${lojas.length} no cadastro · ${abertas.length} abertas · ${lojas.length - abertas.length} "em breve" (nao geram pagina)`);

  let n = 0;
  for (const u of alvo) {
    if (!u.slug || u.lat == null || u.lng == null) {
      console.warn(`[lojas] pulada (sem slug/coordenada): ${u.nome}`);
      continue;
    }
    const dir = path.join(ROOT, 'encontre-uma-loja', u.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(u, abertas, parts));
    console.log(`[lojas] /encontre-uma-loja/${u.slug}  (${rotulo(u)})`);
    n++;
  }
  console.log(`[lojas] ${n} pagina(s) gerada(s)`);
  if (n) console.log('[lojas] LEMBRAR: os slugs gerados precisam estar fora do catch-all de redirect no vercel.json');
}

main();
