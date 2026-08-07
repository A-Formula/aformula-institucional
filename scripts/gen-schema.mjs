// gen-schema.mjs — gera JSON-LD das páginas INSTITUCIONAIS (o build NÃO as reescreve do zero,
// só faz patch cirúrgico; então o schema no <head> persiste). Artigos do blog têm schema próprio
// gerado em build-site.mjs (Article + FAQPage + BreadcrumbList).
// Idempotente: injeta entre <!-- SCHEMA:START --> e <!-- SCHEMA:END --> no <head>.
// Uso: node scripts/gen-schema.mjs   (não altera layout — JSON-LD é invisível)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://www.aformulabr.com.br';
const ORG_ID = `${BASE}/#organization`;
const SITE_ID = `${BASE}/#website`;
const CTX = 'https://schema.org';

// ---- Entidade oficial (CNPJ 10.760.350/0002-90) ----
const organization = {
  // Multi-tipo: é a entidade jurídica (Organization) E um negócio de saúde (MedicalBusiness).
  // Sem MedicalBusiness o Google lê a rede como empresa genérica, não como farmácia.
  '@type': ['Organization', 'MedicalBusiness'],
  '@id': ORG_ID,
  name: 'A Fórmula',
  legalName: 'A FORMULA SERVICOS E FRANCHISE LTDA.',
  url: `${BASE}/`,
  logo: { '@type': 'ImageObject', url: `${BASE}/index_assets/a17.webp` },
  image: `${BASE}/index_assets/a17.webp`,
  taxID: '10.760.350/0002-90',
  description:
    'Rede de farmácias de manipulação A Fórmula: medicamentos manipulados, dermocosméticos, suplementos e linha pet, com unidades em todo o Brasil.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'R. Tabapuã, 627, Sala 92 e 93',
    addressLocality: 'São Paulo',
    addressRegion: 'SP',
    postalCode: '04533-903',
    addressCountry: 'BR',
  },
  sameAs: [
    'https://www.instagram.com/aformulafarmacia/',
    'https://www.facebook.com/aformulafarmacia',
    'https://www.linkedin.com/company/aformulafarmacia/',
    'https://www.youtube.com/@aformulafarmacia6374',
  ],
  alternateName: ['A Fórmula Farmácia de Manipulação', 'A Fórmula Farmácia'],
  slogan: 'A ciência da personalização',
  knowsAbout: [
    'farmácia de manipulação',
    'medicamentos manipulados',
    'prescrição magistral',
    'manipulação veterinária',
    'dermocosméticos',
    'suplementação personalizada',
  ],
  areaServed: { '@type': 'Country', name: 'Brasil' },
};
const website = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  url: `${BASE}/`,
  name: 'A Fórmula',
  alternateName: ['aformulabr', 'A Fórmula Farmácia de Manipulação'],
  inLanguage: 'pt-BR',
  publisher: { '@id': ORG_ID },
  // Sem potentialAction/SearchAction: o Google removeu o sitelinks search box da busca em
  // 21/11/2024 (e o relatório do Search Console junto). A marcação virou peso morto.
};

// ---- Navegação prioritária (rotas de conversão primeiro) ----
const siteNav = {
  '@context': CTX,
  '@type': 'ItemList',
  name: 'Navegação principal — A Fórmula',
  itemListElement: [
    ['Manipule sua receita', '/receita', 'Envie sua receita e receba o orçamento pelo WhatsApp da unidade.'],
    ['Encontre uma loja', '/encontre-uma-loja', 'Localize a unidade A Fórmula mais próxima por CEP ou localização.'],
    ['Contato', '/contato', 'Fale com o SAC da A Fórmula.'],
    ['Seja um franqueado', 'https://franquia.aformulabr.com.br/seja-um-franqueado/', 'Invista em uma franquia A Fórmula.'],
    ['Área do prescritor', '/area-do-prescritor', 'Suporte técnico e conteúdo científico para prescritores.'],
    ['A Fórmula Pet', '/pet', 'Manipulação veterinária personalizada.'],
    ['Sobre nós', '/sobre-nos', 'História, propósito e diferenciais da rede.'],
    ['Blog', '/blog', 'Saúde, ciência e bem-estar.'],
  ].map(([name, url, description], i) => ({
    '@type': 'SiteNavigationElement',
    position: i + 1,
    name,
    description,
    url: url.startsWith('http') ? url : `${BASE}${url}`,
  })),
};

// ---- Pharmacy×N a partir do lojas.json ----
const lojas = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets/lojas.json'), 'utf-8')
);
const clean = v => (v == null || String(v).trim() === '' ? undefined : String(v).trim());
// lojas.json usa "Cidade | Bairro" no campo cidade (é o NOME da unidade, não a localidade).
// addressLocality precisa da cidade pura, senão o Google não casa a unidade com a cidade.
const localidade = v => { const c = clean(v); return c ? clean(c.split('|')[0]) : undefined; };
const pharmacyItems = lojas.map((l, i) => {
  const tel = clean(l.telefone) || clean(l.celular);
  // Unidade "(Em Breve)" ainda não atende: declarar streetAddress/CEP seria afirmar ao Google
  // um endereço que não opera. Fica só cidade/estado (as coords dessas são centro de cidade).
  // Exceção: se já tem telefone/WhatsApp, ela JÁ vende (parceria com outra loja) → entra completa.
  // Decisão do operador 2026-07-31.
  const preAbertura = /\(em breve\)/i.test(String(l.nome || '')) && !tel;
  const item = {
    '@type': 'Pharmacy',
    name: `A Fórmula — ${clean(l.nome) || clean(l.cidade)}`,
    parentOrganization: { '@id': ORG_ID },
    image: `${BASE}/index_assets/a17.webp`,
    url: `${BASE}/encontre-uma-loja#${clean(l.slug) || l.id}`,
    address: {
      '@type': 'PostalAddress',
      ...(preAbertura ? {} : { streetAddress: clean(l.endereco) }),
      addressLocality: localidade(l.cidade),
      addressRegion: clean(l.estado),
      addressCountry: 'BR',
    },
  };
  if (clean(l.cep) && !preAbertura) item.address.postalCode = clean(l.cep);
  if (tel) item.telephone = tel;
  if (l.lat != null && l.lng != null) item.geo = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng };
  if (clean(l.email)) item.email = clean(l.email);
  return { '@type': 'ListItem', position: i + 1, item };
});
const pharmacyList = {
  '@context': CTX,
  '@type': 'ItemList',
  name: 'Unidades A Fórmula',
  description: 'Farmácias de manipulação da rede A Fórmula por cidade.',
  numberOfItems: pharmacyItems.length,
  itemListElement: pharmacyItems,
};

// ---- BreadcrumbList ----
const crumb = (...trail) => ({
  '@context': CTX,
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: t.url })),
});
const INICIO = { name: 'Início', url: `${BASE}/` };

// ---- FAQPage (extrai data-faq-item: h3=pergunta em [data-faq-q], p=resposta em [data-faq-a]) ----
const stripTags = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function extractFaq(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf-8');
  const items = [];
  // Ancora em [data-faq-q]<h3>PERGUNTA</h3> … [data-faq-a]<p>RESPOSTA</p></div>.
  // Exigir <h3> após data-faq-q ignora os seletores CSS ([data-faq-q]{…}) do <style>.
  const re = /data-faq-q[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?data-faq-a[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const q = stripTags(m[1]);
    const a = stripTags(m[2]);
    if (q && a) items.push({ q, a });
  }
  return items;
}
function faqPage(file) {
  const items = extractFaq(file);
  if (!items.length) return null;
  return {
    '@context': CTX,
    '@type': 'FAQPage',
    mainEntity: items.map(x => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a },
    })),
  };
}

// NÃO usar Speakable: é beta, só vale para usuários nos EUA com Google Home em inglês e
// conteúdo publicado em inglês (docs Google, atualizado 2025-12-10). Em pt-BR, ganho zero.

// ---- Mapa página → blocos JSON-LD ----
// FAQPage: o rich result foi EXTINTO no Google em 07/05/2026 — a marcação não gera mais
// nenhuma aparência na busca. Fica só onde há FAQ visível que serve ao visitante
// (o Google segue lendo a marcação para entender a página, e LLMs extraem Q&A dela).
const faqPet = faqPage('pet.html');
const faqReceita = faqPage('receita.html');

const pages = {
  'index.html': [{ '@context': CTX, '@graph': [organization, website] }, siteNav],
  'sobre-nos.html': [crumb(INICIO, { name: 'Sobre nós', url: `${BASE}/sobre-nos` })],
  'contato.html': [crumb(INICIO, { name: 'Contato', url: `${BASE}/contato` })],
  'encontre-uma-loja.html': [
    pharmacyList,
    crumb(INICIO, { name: 'Encontre uma loja', url: `${BASE}/encontre-uma-loja` }),
  ],
  'area-do-prescritor.html': [crumb(INICIO, { name: 'Área do prescritor', url: `${BASE}/area-do-prescritor` })],
  'pet.html': [...(faqPet ? [faqPet] : []), crumb(INICIO, { name: 'A Fórmula Pet', url: `${BASE}/pet` })],
  'receita.html': [...(faqReceita ? [faqReceita] : []), crumb(INICIO, { name: 'Manipule sua receita', url: `${BASE}/receita` })],
  'blog.html': [crumb(INICIO, { name: 'Blog', url: `${BASE}/blog` })],
  'lgpd.html': [crumb(INICIO, { name: 'Política de Privacidade e LGPD', url: `${BASE}/lgpd` })],
};

// ---- Injeção idempotente no <head> ----
function inject(file, jsonObjects) {
  const abs = path.join(ROOT, file);
  let html = fs.readFileSync(abs, 'utf-8');
  const payload = jsonObjects
    .map(o => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`)
    .join('\n');
  const block = `<!-- SCHEMA:START (gen-schema.mjs — não editar à mão) -->\n${payload}\n<!-- SCHEMA:END -->`;
  const re = /<!-- SCHEMA:START[\s\S]*?<!-- SCHEMA:END -->/;
  html = re.test(html) ? html.replace(re, block) : html.replace(/<\/head>/i, `${block}\n</head>`);
  fs.writeFileSync(abs, html);
  return jsonObjects.length;
}

for (const [file, objs] of Object.entries(pages)) {
  const n = inject(file, objs);
  const types = objs.map(o => o['@graph'] ? o['@graph'].map(g => g['@type']).join('+') : o['@type']).join(', ');
  console.log(`[schema] ${file.padEnd(24)} → ${n} bloco(s): ${types}`);
}
console.log(`[schema] OK — ${pharmacyItems.length} Pharmacy | FAQ pet:${faqPet?.mainEntity.length||0} receita:${faqReceita?.mainEntity.length||0}`);
