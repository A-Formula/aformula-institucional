// validar-lojas.mjs — conferência das páginas de /encontre-uma-loja/{slug}/
//
// Roda SOBRE O DISCO (não precisa de deploy). Cada check compara o HTML gerado com a
// fonte (_coleta-google/{slug}.json), e existe porque uma delas já falhou de verdade:
// horário genérico publicado, sameAs do prédio, aggregateRating de terceiro.
//
// Uso: node scripts/validar-lojas.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIA_EN = {
  'segunda-feira': 'Monday', 'terça-feira': 'Tuesday', 'quarta-feira': 'Wednesday',
  'quinta-feira': 'Thursday', 'sexta-feira': 'Friday', 'sábado': 'Saturday', 'domingo': 'Sunday',
};

const falhas = [];
const fail = (slug, msg) => falhas.push(`${slug}: ${msg}`);

const dir = path.join(ROOT, 'encontre-uma-loja');
const slugs = fs.readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

let comHora = 0, semHora = 0, comNota = 0, turnos = 0;

for (const slug of slugs) {
  const f = path.join(dir, slug, 'index.html');
  if (!fs.existsSync(f)) { fail(slug, 'index.html ausente'); continue; }
  const html = fs.readFileSync(f, 'utf8');
  if (html.length < 8000) fail(slug, `HTML curto demais (${html.length} b)`);

  // ---- JSON-LD tem de parsear ----
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) { fail(slug, 'sem bloco JSON-LD'); continue; }
  let g;
  try { g = JSON.parse(m[1]); } catch (e) { fail(slug, `JSON-LD inválido: ${e.message}`); continue; }
  const ph = g['@graph'].find((x) => x['@type'] === 'Pharmacy');
  if (!ph) { fail(slug, 'sem nó Pharmacy'); continue; }

  // ---- proibições absolutas ----
  // no grafo (é onde faria dano) E no texto cru (o checklist do operador é grep-based)
  if (JSON.stringify(g).includes('aggregateRating')) fail(slug, 'nota agregada no JSON-LD (a avaliação é do Google, não do site)');
  if (/aggregateRating/.test(html)) fail(slug, 'a string aparece no HTML cru');
  if (/lh3\.googleusercontent\.com/.test(html)) fail(slug, 'foto hotlinkada do Google');
  if (/place_id:/.test(JSON.stringify(ph.sameAs || ''))) fail(slug, 'sameAs montado do place_id');

  // ---- canonical ----
  const esperado = `https://www.aformulabr.com.br/encontre-uma-loja/${slug}`;
  if (!html.includes(`<link rel="canonical" href="${esperado}">`)) fail(slug, 'canonical errado/ausente');

  const cp = path.join(ROOT, '_coleta-google', `${slug}.json`);
  const coleta = fs.existsSync(cp) ? JSON.parse(fs.readFileSync(cp, 'utf8')) : null;
  if (!coleta) { fail(slug, 'sem _coleta-google/{slug}.json'); continue; }

  // ---- sameAs = perfil real ----
  if (coleta.confere === true && coleta.urlPerfil) {
    if (!(ph.sameAs || []).includes(coleta.urlPerfil)) fail(slug, 'sameAs != urlPerfil da coleta');
  } else if (ph.sameAs) {
    fail(slug, 'sameAs presente sem perfil conferido');
  }

  // ---- nota do Google: no HTML, com link, e NUNCA no schema ----
  if (coleta.nota && coleta.avaliacoes && coleta.urlPerfil) {
    const notaBr = parseFloat(coleta.nota).toFixed(1).replace('.', ',');
    if (!html.includes(`<strong>${notaBr}</strong> no Google`)) fail(slug, `nota ${notaBr} não exibida`);
    if (!html.includes(`${parseInt(coleta.avaliacoes, 10)} avaliações`)) fail(slug, 'contagem de avaliações não exibida');
    comNota++;
  }

  // ---- horário ----
  const temDado = coleta.confere === true && coleta.diasCapturados === 7;
  const ohs = ph.openingHoursSpecification;

  if (!temDado) {
    semHora++;
    if (ohs) fail(slug, 'openingHoursSpecification em unidade SEM horário no perfil');
    if (/Horário de atendimento/.test(html)) fail(slug, 'card de horário em unidade sem dado');
    if (/08:00/.test(html)) fail(slug, 'string "08:00" presente (horário genérico vazou)');
    // pela TAG, não pela classe: a classe também aparece no <style>, que existe sempre
    if (/<dl class="loja-horas">/.test(html)) fail(slug, 'tabela de horário renderizada sem dado');
    if (/Qual o horário de funcionamento/.test(html)) fail(slug, 'FAQ de horário presente sem dado');
    if (/\bAtende \w+ a \w+,/.test(html)) fail(slug, 'lead menciona horário sem dado');
    continue;
  }

  comHora++;
  if (!ohs) { fail(slug, 'sem openingHoursSpecification apesar de ter horário'); continue; }
  if (!/Horário de atendimento/.test(html)) fail(slug, 'card de horário ausente');
  if (!/Qual o horário de funcionamento/.test(html)) fail(slug, 'FAQ de horário ausente');

  // schema tem de reproduzir a coleta dia a dia, turno a turno
  for (const [chave, en] of Object.entries(DIA_EN)) {
    const bruto = coleta.horarios[chave];
    const faixas = /fechado/i.test(bruto || '')
      ? [] : [...String(bruto).matchAll(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/g)].map((x) => [x[1], x[2]]);
    if (faixas.length > 1) turnos++;
    const noSchema = ohs.filter((o) => o.dayOfWeek.includes(en))
      .map((o) => `${o.opens}-${o.closes}`).sort();
    const esperadas = faixas.map(([a, b]) => `${a}-${b}`).sort();
    if (noSchema.join('|') !== esperadas.join('|')) {
      fail(slug, `${chave}: schema=[${noSchema}] coleta=[${esperadas}]`);
    }
  }
}

console.log(`páginas: ${slugs.length} · com horário: ${comHora} · sem horário: ${semHora} · com nota: ${comNota}`);
console.log(`turnos duplos conferidos (dia×unidade): ${turnos}`);
if (falhas.length) {
  console.log(`\n❌ ${falhas.length} falha(s):`);
  for (const f of falhas) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n✅ todos os checks passaram');
