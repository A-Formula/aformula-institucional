// gen-person.mjs — schema Person do farmaceutico responsavel (E-E-A-T em pagina YMYL).
//
// ESTADO: PRONTO E BLOQUEADO. O CRF nao esta no repo e nao pode ser deduzido, entao este
// script NAO roda no build (nao esta no buildCommand do vercel.json) e, se rodado sem o
// dado, sai com codigo 1 sem tocar arquivo nenhum. Nada de placeholder em producao.
//
// COMO DESTRAVAR:
//   1) preencher scripts/farmaceutico-responsavel.json (campos obrigatorios no proprio arquivo)
//   2) node scripts/gen-person.mjs            -> so valida e imprime o JSON-LD (dry-run)
//   3) node scripts/gen-person.mjs --aplicar  -> injeta em sobre-nos.html (idempotente)
//   4) conferir em https://search.google.com/test/rich-results antes do commit
//
// ESCOPO — a regra que importa: farmacia de manipulacao tem um Responsavel Tecnico POR
// UNIDADE. Declarar um unico Person como responsavel das 75 lojas seria falso. Por isso o
// campo `escopo`: o site institucional so pode afirmar o RT da MATRIZ (a pessoa que
// responde pela A FORMULA SERVICOS E FRANCHISE LTDA). RT de loja pertence a pagina daquela
// loja — e as 75 paginas de unidade estao congeladas nesta etapa.
//
// POR QUE sobre-nos: e a pagina de autoridade institucional e a unica candidata que NAO
// esta congelada. O `reviewedBy` dos 118 artigos do blog seria o ganho maior de E-E-A-T,
// mas mexer no schema dos posts esta fora desta etapa.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.aformulabr.com.br';
const PAGINA = 'sobre-nos.html';
const URL_PAGINA = `${BASE}/sobre-nos`;
const MARCA_INI = '<script type="application/ld+json" id="ld-farmaceutico">';
const MARCA_FIM = '</script>';

const pendente = (v) =>
  v === null || v === undefined ||
  (typeof v === 'string' && (v.trim() === '' || /PENDENTE/i.test(v)));

function valida(d) {
  const faltam = [];
  if (pendente(d.escopo)) faltam.push('escopo');
  if (pendente(d.nome)) faltam.push('nome');
  if (pendente(d.crf?.uf)) faltam.push('crf.uf');
  if (pendente(d.crf?.numero)) faltam.push('crf.numero');
  if (pendente(d.cargo)) faltam.push('cargo');

  if (!faltam.length) {
    // O escopo tem que ser afirmavel por ESTA pagina.
    if (!/^matriz$/i.test(String(d.escopo).trim())) {
      faltam.push(`escopo="${d.escopo}" — sobre-nos so pode declarar o RT da matriz; `
        + `RT de unidade pertence a pagina da unidade (congelada nesta etapa)`);
    }
    // UF de conselho e sigla de 2 letras; numero e digito. Formato errado = dado errado.
    if (!/^[A-Z]{2}$/.test(String(d.crf?.uf).trim().toUpperCase())) faltam.push('crf.uf fora do formato (ex.: SP)');
    if (!/\d/.test(String(d.crf?.numero))) faltam.push('crf.numero sem digito');
  }
  return faltam;
}

function grafo(d) {
  const uf = String(d.crf.uf).trim().toUpperCase();
  const num = String(d.crf.numero).trim();
  const registro = `CRF-${uf} ${num}`;
  const idPessoa = `${URL_PAGINA}#farmaceutico-responsavel`;

  const pessoa = {
    '@type': 'Person',
    '@id': idPessoa,
    name: String(d.nome).trim(),
    jobTitle: String(d.cargo).trim(),
    // identifier em PropertyValue e o jeito de declarar registro profissional sem
    // fingir que e um campo nativo do schema.org.
    identifier: {
      '@type': 'PropertyValue',
      propertyID: 'CRF',
      name: `Conselho Regional de Farmácia - ${uf}`,
      value: registro,
    },
    worksFor: { '@id': `${BASE}/#organizacao` },
    ...(d.formacao && !pendente(d.formacao.instituicao) ? {
      alumniOf: {
        '@type': 'EducationalOrganization',
        name: String(d.formacao.instituicao).trim(),
      },
      ...(pendente(d.formacao.curso) ? {} : { hasCredential: {
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'degree',
        name: String(d.formacao.curso).trim(),
      } }),
    } : {}),
    ...(Array.isArray(d.especializacao) && d.especializacao.length
      ? { knowsAbout: d.especializacao.map((s) => String(s).trim()).filter(Boolean) } : {}),
    ...(Array.isArray(d.sameAs) && d.sameAs.length
      ? { sameAs: d.sameAs.map((s) => String(s).trim()).filter(Boolean) } : {}),
    ...(pendente(d.foto) ? {} : { image: /^https?:/i.test(d.foto) ? d.foto : `${BASE}${d.foto}` }),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      pessoa,
      // Liga a pessoa a Organization e a pagina, reusando os @id que o resto do site
      // ja publica (BASE/#organizacao, BASE/#site) — o grafo funde, nao duplica.
      { '@type': 'Organization', '@id': `${BASE}/#organizacao`, employee: { '@id': idPessoa } },
      { '@type': 'WebPage', '@id': `${URL_PAGINA}#pagina`, url: URL_PAGINA, reviewedBy: { '@id': idPessoa } },
    ],
  };
}

function aplica(json) {
  const p = path.join(ROOT, PAGINA);
  let html = fs.readFileSync(p, 'utf8');
  const bloco = `${MARCA_INI}${JSON.stringify(json)}${MARCA_FIM}`;
  const re = new RegExp(`${MARCA_INI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARCA_FIM}`);
  html = re.test(html)
    ? html.replace(re, bloco)                       // idempotente: substitui o proprio bloco
    : html.replace(/<\/head>/i, `${bloco}\n</head>`);
  fs.writeFileSync(p, html);
  console.log(`[person] bloco injetado em ${PAGINA} (id="ld-farmaceutico")`);
}

function main() {
  const arq = path.join(__dirname, 'farmaceutico-responsavel.json');
  const d = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const faltam = valida(d);

  if (faltam.length) {
    console.error('[person] BLOQUEADO — dado regulado ausente ou invalido:');
    faltam.forEach((f) => console.error(`  - ${f}`));
    console.error(`\n  preencha ${path.relative(ROOT, arq)} e rode de novo.`);
    console.error('  NADA foi escrito. Nenhum placeholder vai para producao.');
    process.exit(1);
  }

  const json = grafo(d);
  if (process.argv.includes('--aplicar')) aplica(json);
  else {
    console.log('[person] validado. JSON-LD que seria injetado:\n');
    console.log(JSON.stringify(json, null, 2));
    console.log('\n[person] dry-run: nada escrito. Use --aplicar para injetar em sobre-nos.html.');
  }
}

main();
