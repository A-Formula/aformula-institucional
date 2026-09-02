// auditar-seo-unidades.mjs — audita as páginas de unidade nas dimensões de SEO/AEO/GEO/LLMO.
//
// Roda contra QUALQUER origem: disco servido localmente ou o site no ar.
//   node scripts/auditar-seo-unidades.mjs                       (local, porta 9187)
//   node scripts/auditar-seo-unidades.mjs https://www.aformulabr.com.br
//
// Existe porque a auditoria de 18/08 achou, medindo, três coisas que ninguém tinha visto:
//   1) /encontre-uma-loja não tinha NENHUM link estático pras 75 unidades (os cards são
//      montados em JS, e crawler de LLM não executa JS) — as páginas eram inalcançáveis
//      para quem não roda JavaScript, só existiam no sitemap;
//   2) o llms.txt não citava nenhuma unidade;
//   3) `twitter:card: summary_large_image` sem og:image → card social em branco.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://127.0.0.1:9187';

const slugs = fs.readdirSync(path.join(ROOT, 'encontre-uma-loja'), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

const pega = async (u) => {
  const r = await fetch(BASE + u, { redirect: 'manual' });
  return { status: r.status, txt: r.status === 200 ? await r.text() : '' };
};

const falhas = [];
const F = (m) => falhas.push(m);
const ok = (cond, msg) => { if (!cond) F(msg); return !!cond; };

console.log(`auditando ${slugs.length} unidades em ${BASE}\n`);

// ---------- 1) DESCOBERTA: a porta de entrada existe em HTML puro? ----------
const mapa = await pega('/encontre-uma-loja');
const estaticos = new Set([...mapa.txt.matchAll(/href="\/encontre-uma-loja\/([a-z0-9-]+)"/g)].map((m) => m[1]));
console.log('DESCOBERTA (o que um crawler sem JS vê)');
console.log(`  links estáticos p/ unidades: ${estaticos.size}/${slugs.length}`);
ok(estaticos.size === slugs.length, `só ${estaticos.size} de ${slugs.length} unidades têm link estático`);
const faltando = slugs.filter((s) => !estaticos.has(s));
if (faltando.length) F(`sem link estático: ${faltando.slice(0, 6).join(', ')}`);

const llms = await pega('/llms.txt');
const noLlms = (llms.txt.match(/encontre-uma-loja\/[a-z0-9-]+/g) || []).length;
console.log(`  unidades citadas no llms.txt: ${noLlms}`);
ok(noLlms >= slugs.length, `llms.txt cita ${noLlms} unidades, esperado ${slugs.length}`);

const sm = await pega('/sitemap-unidades.xml');   // sitemap dividido: as unidades moram no filho
const noSitemap = (sm.txt.match(/encontre-uma-loja\/[a-z0-9-]+</g) || []).length;
console.log(`  unidades no sitemap: ${noSitemap}`);

// ---------- 2) por página ----------
let comOg = 0, comSpeakable = 0, comBairro = 0, comHora = 0, comNota = 0;
const boiler = new Map();

for (const s of slugs) {
  const { status, txt } = await pega(`/encontre-uma-loja/${s}`);
  if (status !== 200 || txt.length < 20000) { F(`${s}: ${status} / ${txt.length} bytes`); continue; }

  if (/property="og:image"/.test(txt)) comOg++; else F(`${s}: sem og:image`);
  // card grande sem imagem sai em branco — o par tem de ser coerente
  if (/summary_large_image/.test(txt) && !/property="og:image"/.test(txt)) F(`${s}: twitter card grande SEM imagem`);
  if (/aggregateRating/.test(txt)) F(`${s}: nota agregada (a avaliação é do Google)`);

  const ld = JSON.parse(txt.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const wp = ld['@graph'].find((x) => x['@type'] === 'WebPage');
  const org = ld['@graph'].find((x) => x['@type'] === 'Organization');
  const ph = ld['@graph'].find((x) => x['@type'] === 'Pharmacy');
  if (wp?.speakable) comSpeakable++;
  if (!org?.logo) F(`${s}: Organization sem logo`);
  if (ph?.image) F(`${s}: Pharmacy com image — só entra foto REAL da unidade`);
  if (ph?.openingHoursSpecification) comHora++;
  if (/no bairro /.test(txt)) comBairro++;
  // pela CLASSE do bloco, nao pelo texto: "no Google" casa com "Abrir a rota no Google Maps"
  if (/class="loja-google"/.test(txt)) comNota++;

  // boilerplate: frases longas repetidas
  const vis = txt.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  for (const f of new Set(vis.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 40))) {
    boiler.set(f, (boiler.get(f) || 0) + 1);
  }
}

const N = slugs.length;
const repetidas = [...boiler.values()].filter((n) => n >= N * 0.9).length;
const unicas = [...boiler.values()].filter((n) => n === 1).length;

console.log('\nPOR PÁGINA');
console.log(`  og:image: ${comOg}/${N} · speakable: ${comSpeakable}/${N}`);
console.log(`  horário estruturado: ${comHora}/${N} (as outras não publicam horário de propósito)`);
console.log(`  bairro citado: ${comBairro}/${N} · nota do Google exibida: ${comNota}/${N}`);
console.log(`\nCONTEÚDO`);
console.log(`  frases longas exclusivas de uma página: ${unicas}`);
console.log(`  frases repetidas em ≥90% das páginas: ${repetidas} (política e serviço — repetir é correto)`);

console.log(falhas.length ? `\n❌ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}` : '\n✅ nenhuma falha');
process.exit(falhas.length ? 1 : 0);
