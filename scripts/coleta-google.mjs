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
// 🔴 COMO A SEMANA INTEIRA SAI (não mudar sem reler):
// O Maps só entrega os 7 dias para sessão LOGADA em JANELA REAL. Medido:
//   headless novo, sem login          → "visualização limitada", 1 dia
//   headless + perfil logado          → "visualização limitada", 1 dia
//   headless:false + perfil logado    → LOGADO, 7 dias ✅
// Ou seja, headless é o que dispara a view limitada, não a falta de login.
// `google.com/search` devolve CAPTCHA e não é alternativa.
//
// ⚠️ Por isso este script abre uma JANELA VISÍVEL e usa o perfil do Playwright MCP.
// O navegador do MCP precisa estar FECHADO durante a execução (perfil é
// instância única) — senão dá "Browser is already in use".

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

  // 🔴 NÃO clicar no primeiro resultado: a lista traz ANÚNCIO ("Patrocinado") de
  // concorrente com nome parecido — o operador flagrou "Companhia da Fórmula
  // Alecrim - Farmácia de Manipulação" aparecendo na tela. Escolher pelo NOME.
  if (!/\/maps\/place\//.test(page.url())) {
    const alvo = await page.evaluate(() => {
      const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
      const links = [...document.querySelectorAll('a[href*="/maps/place/"]')];
      for (const a of links) {
        // texto do card que contém o link
        const card = a.closest('[jsaction], div');
        const rotulo = norm(a.getAttribute('aria-label') || card?.innerText || '');
        // descarta anúncio
        if (/patrocinado|sponsored|an[uú]ncio/.test(norm(card?.innerText || ''))) continue;
        // exige a marca no INÍCIO do nome
        if (/^a formula\b/.test(rotulo)) { a.setAttribute('data-alvo-af', '1'); return rotulo.slice(0, 70); }
      }
      return null;
    });
    if (alvo) {
      await page.click('a[data-alvo-af="1"]').catch(() => {});
      await sleep(4500);
    }
    // sem match de nome: NÃO clica em nada. Fica em "Resultados" e cai na trava.
  }

  // expandir o painel de horários (na view logada isso abre os 7 dias)
  for (const sel of ['[aria-label*="Mostrar horári" i]', '[jsaction*="openhours"]',
                     'button[data-item-id*="oh"]', '[aria-label*="Horário de funcionamento" i]']) {
    const el = await page.$(sel);
    if (el) { await el.click({ timeout: 3000 }).catch(() => {}); await sleep(1800); }
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

    // SEMANA INTEIRA (só sai em sessão logada + janela real)
    const semana = {};
    document.querySelectorAll('table tr').forEach((tr) => {
      const td = tr.querySelectorAll('td, th');
      if (td.length >= 2) {
        const d = clean(td[0].textContent), v = clean(td[1].textContent);
        if (d && v && /segunda|terça|quarta|quinta|sexta|sábado|domingo/i.test(d)) semana[d.toLowerCase()] = v;
      }
    });
    out.horarios = semana;
    out.diasCapturados = Object.keys(semana).length;
    out.viewLimitada = /visualização limitada/i.test(document.body.innerText) || undefined;

    // horário de hoje (fallback / conferência)
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
  // perfil logado + janela REAL: é a única combinação que entrega os 7 dias (ver topo)
  const PERFIL = 'C:/Users/aform/AppData/Local/ms-playwright-mcp/mcp-chrome-82f3a99';
  const ctx = await chromium.launchPersistentContext(PERFIL, {
    headless: false, channel: 'chrome',
    viewport: { width: 1400, height: 1000 }, locale: 'pt-BR',
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  let ok = 0, suspeitos = 0, falha = 0, pulados = 0;
  for (const u of alvo) {
    const f = path.join(OUT, `${u.slug}.json`);
    if (!has('--refazer') && fs.existsSync(f)) { pulados++; continue; }
    try {
      const d = await colhe(page, u);

      // 🔴 TRAVA — a versão anterior era FROUXA e mentia: exigia só "fórmula" +
      // "farmácia", o que ACEITA concorrente ("Companhia da Fórmula Alecrim -
      // Farmácia de Manipulação", flagrado pelo operador). Aferido nos 75 nomes
      // reais colhidos: 70/70 dos legítimos começam com "A Fórmula".
      // Regra: o nome tem de COMEÇAR com "a formula" (sem acento, minúsculo).
      const nomeN = String(d.nomeGoogle || '').normalize('NFD')
        .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      const confere = /^a formula\b/.test(nomeN);

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

  await ctx.close();
  console.log(`\n[coleta] ${ok} confirmadas · ${suspeitos} suspeitas (revisar) · ${falha} falha · ${pulados} ja tinham arquivo`);
}

main();
