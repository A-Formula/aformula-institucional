// coleta-google.mjs — DOCUMENTA o perfil do Google de cada unidade.
//
// ⚠️ SOMENTE LEITURA. Não escreve no lojas.json, não regenera página, não muda
// nada no ar. Decisão do operador em 2026-08-17: "apenas documente o que está no
// google e o que está em live hoje, não mude nenhuma informação que está no ar".
//
// Uso:
//   node scripts/coleta-google.mjs --slug {slug}        1 unidade (debug)
//   node scripts/coleta-google.mjs --lote 1 --tam 10    lote
//   node scripts/coleta-google.mjs --todas              as 75 abertas
//   ... --refazer                                       reprocessa quem já tem arquivo
//
// Saída: _coleta-google/{slug}.json (um por unidade, retomável).
//
// 🔴 POR QUE NÃO ENTRA PELO place_id: o place_id do cadastro NÃO é o da loja em
// pelo menos um caso medido — em salvador-shopping-paralela ele aponta para o
// PRÉDIO ("Av. Luís Viana Filho, 8544", categoria Edifício), e colher dali traz a
// nota do SHOPPING (4,5 / 35.912 avaliações) no lugar da farmácia (4,2). Por isso
// a entrada é por BUSCA DE NOME + trava de validação (`confere`).
//
// ⚠️ LIMITE CONHECIDO: sem login, o Maps serve "visualização limitada" e expõe
// apenas o horário de HOJE — a semana inteira não abre (testado: botão de expandir
// não existe nessa view). O `google.com/search` devolve CAPTCHA. Para a semana
// completa o caminho é a API oficial do Places (chave + billing).
// Como toda a coleta roda no mesmo dia, o campo `horarioHoje` é comparável entre
// unidades — e já basta para provar divergência com o horário publicado.

import { chromium } from 'file:///C:/dev/chatgpt-img-bridge/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_coleta-google');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);
const aberta = (u) => !/em breve/i.test(`${u.nome} ${u.slug}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function colhe(page, u) {
  const query = `A Fórmula Farmácia de Manipulação ${u.endereco || ''} ${u.cidade} ${u.estado}`
    .replace(/\s+/g, ' ').trim();
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}/?hl=pt-BR`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);

  if (!/\/maps\/place\//.test(page.url())) {
    const first = await page.$('a[href*="/maps/place/"]');
    if (first) { await first.click().catch(() => {}); await sleep(4500); }
  }

  return await page.evaluate(() => {
    const out = {};
    const clean = (s) => (s ? String(s).replace(/\s+/g, ' ').trim() : null);

    out.nomeGoogle = clean(document.querySelector('h1')?.textContent);

    // aria-label dos botões do painel ("Endereço: ...", "Telefone: ...")
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const lab = el.getAttribute('aria-label') || '';
      return clean(lab.replace(/^[^:]*:\s*/, '')) || clean(el.textContent);
    };
    out.enderecoGoogle = pick('button[data-item-id="address"]');
    out.telefoneGoogle = pick('button[data-item-id^="phone"]');
    out.siteGoogle = pick('a[data-item-id="authority"]');
    out.plusCode = pick('button[data-item-id="oloc"]');

    const texto = document.body.innerText;

    // nota + total de avaliações
    const mNota = texto.match(/(\d,\d)\s*\(?\s*([\d.]+)?\s*\)?\s*(?:avaliaç|coment)/i);
    if (mNota) {
      out.nota = mNota[1].replace(',', '.');
      if (mNota[2]) out.avaliacoes = mNota[2].replace(/\./g, '');
    } else {
      const so = texto.match(/\n(\d,\d)\n/);
      if (so) out.nota = so[1].replace(',', '.');
    }

    // categoria (linha logo após a nota costuma ser "Farmácia·")
    const mCat = texto.match(/\n(Farmácia[^\n·]*)/i);
    out.categoria = mCat ? clean(mCat[1].replace(/·$/, '')) : null;

    // horário de HOJE (a view sem login só expõe este)
    const lab = [...document.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label'))
      .find((l) => l && /(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i.test(l) && /\d{1,2}:\d{2}/.test(l));
    if (lab) {
      const m = lab.match(/(segunda|terça|quarta|quinta|sexta|sábado|domingo)[^,]*,\s*([^,]+)/i);
      out.horarioHoje = m ? { dia: clean(m[1]), horas: clean(m[2]) } : { bruto: clean(lab) };
    }
    out.aberto = /Aberto agora|Aberto ·/i.test(texto) ? 'aberto'
      : (/Fechado/i.test(texto) ? 'fechado' : null);
    out.fechadoPermanente = /Fechado permanentemente|Encerrado permanentemente/i.test(texto) || undefined;

    // fotos (miniaturas; o sufixo de tamanho pode ser trocado por =w1600-h1200)
    const fotos = new Set();
    const push = (s) => { if (s && /googleusercontent|ggpht/.test(s) && !/=s\d{1,2}\b/.test(s)) fotos.add(s); };
    document.querySelectorAll('img').forEach((im) => push(im.src));
    document.querySelectorAll('*').forEach((el) => {
      const m = getComputedStyle(el).backgroundImage?.match(/url\("?(https:[^")]+)"?\)/);
      if (m) push(m[1]);
    });
    out.fotos = [...fotos].slice(0, 10);

    out.urlPerfil = location.href.split('/data=')[0];
    return out;
  });
}

async function main() {
  const lojas = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets', 'lojas.json'), 'utf8')
  ).filter(aberta);

  let alvo;
  if (arg('--slug')) alvo = lojas.filter((u) => u.slug === arg('--slug'));
  else if (has('--todas')) alvo = lojas;
  else {
    const tam = parseInt(arg('--tam', '10'), 10);
    const lote = parseInt(arg('--lote', '1'), 10);
    alvo = lojas.slice((lote - 1) * tam, lote * tam);
  }
  if (!alvo.length) { console.error('[coleta] nada a fazer'); process.exit(1); }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 }, locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  let ok = 0, suspeitos = 0, falha = 0, pulados = 0;
  for (const u of alvo) {
    const f = path.join(OUT, `${u.slug}.json`);
    if (!has('--refazer') && fs.existsSync(f)) { pulados++; continue; }
    try {
      const d = await colhe(page, u);

      // TRAVA: o lugar encontrado precisa ser mesmo uma A Fórmula.
      const nome = (d.nomeGoogle || '').toLowerCase();
      const cat = (d.categoria || '').toLowerCase();
      const confere = /f[óo]rmula/.test(nome) && (/farm[áa]cia|drogaria|manipula/.test(nome + ' ' + cat));

      const rec = {
        slug: u.slug, cidade: u.cidade, estado: u.estado,
        nomeCadastro: u.nome,
        confere,                       // false => NÃO usar sem revisão humana
        coletadoEm: new Date().toISOString().slice(0, 10),
        ...d,
        // o que está no cadastro hoje, lado a lado, para o relatório
        cadastro: {
          endereco: u.endereco || null, telefone: u.telefone || null,
          celular: u.celular || null, cep: u.cep || null,
          place_id: u.place_id || null,
        },
      };
      fs.writeFileSync(f, JSON.stringify(rec, null, 1));
      if (confere) ok++; else suspeitos++;
      console.log(`${confere ? '✓' : '⚠'} ${u.slug} · ${d.nota || '—'}★ · ${d.horarioHoje?.horas || '—'} · fotos:${(d.fotos || []).length} · ${(d.nomeGoogle || '?').slice(0, 46)}`);
    } catch (e) {
      console.warn(`✗ ${u.slug} — ${e.message.slice(0, 70)}`);
      falha++;
    }
    await sleep(2600 + (Date.now() % 1700));
  }

  await browser.close();
  console.log(`\n[coleta] ${ok} confirmadas · ${suspeitos} suspeitas (revisar) · ${falha} falha · ${pulados} ja tinham arquivo`);
}

main();
