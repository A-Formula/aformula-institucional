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
  '@type': 'Organization',
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
};
const website = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  url: `${BASE}/`,
  name: 'A Fórmula',
  inLanguage: 'pt-BR',
  publisher: { '@id': ORG_ID },
};

// ---- Pharmacy×N a partir do lojas.json ----
const lojas = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets/lojas.json'), 'utf-8')
);
const clean = v => (v == null || String(v).trim() === '' ? undefined : String(v).trim());
const pharmacyItems = lojas.map((l, i) => {
  const tel = clean(l.telefone) || clean(l.celular);
  const item = {
    '@type': 'Pharmacy',
    name: `A Fórmula — ${clean(l.nome) || clean(l.cidade)}`,
    parentOrganization: { '@id': ORG_ID },
    image: `${BASE}/index_assets/a17.webp`,
    url: `${BASE}/encontre-uma-loja#${clean(l.slug) || l.id}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: clean(l.endereco),
      addressLocality: clean(l.cidade),
      addressRegion: clean(l.estado),
      addressCountry: 'BR',
    },
  };
  if (clean(l.cep)) item.address.postalCode = clean(l.cep);
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

// ---- Mapa página → blocos JSON-LD ----
const faqPet = faqPage('pet.html');
const faqReceita = faqPage('receita.html');

const pages = {
  'index.html': [{ '@context': CTX, '@graph': [organization, website] }],
  'sobre-nos.html': [crumb(INICIO, { name: 'Sobre nós', url: `${BASE}/sobre-nos.html` })],
  'contato.html': [crumb(INICIO, { name: 'Contato', url: `${BASE}/contato.html` })],
  'encontre-uma-loja.html': [
    pharmacyList,
    crumb(INICIO, { name: 'Encontre uma loja', url: `${BASE}/encontre-uma-loja.html` }),
  ],
  'area-do-prescritor.html': [crumb(INICIO, { name: 'Área do prescritor', url: `${BASE}/area-do-prescritor.html` })],
  'pet.html': [...(faqPet ? [faqPet] : []), crumb(INICIO, { name: 'A Fórmula Pet', url: `${BASE}/pet.html` })],
  'receita.html': [...(faqReceita ? [faqReceita] : []), crumb(INICIO, { name: 'Manipule sua receita', url: `${BASE}/receita.html` })],
  'blog.html': [crumb(INICIO, { name: 'Blog', url: `${BASE}/blog.html` })],
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
