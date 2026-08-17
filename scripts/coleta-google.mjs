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

// Abre, na lista de resultados, o card cujo nome contém o token da marca.
// 🔴 NUNCA clicar no primeiro: a lista traz ANÚNCIO ("Patrocinado") de concorrente
// com nome parecido — o operador flagrou "Companhia da Fórmula Alecrim - Farmácia
// de Manipulação". Sem match, não clica.
async function abrirCard(page, u) {
  // 🔴 Entre os candidatos, vence o MAIS PRÓXIMO da coordenada do cadastro — não o
  // primeiro. Em Feira de Santana (2 lojas) o 1º card era sempre o Ponto Central, e
  // a Maison herdava os dados da irmã: mesmo nome, mesmo telefone, mesma nota.
  // O href traz a coordenada em !3d{lat}!4d{lng}.
  const alvo = await page.evaluate(({ lat, lng }) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dist = (a, b) => {
      const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    const cands = [];
    for (const a of document.querySelectorAll('a[href*="/maps/place/"]')) {
      const card = a.closest('[jsaction]') || a.parentElement;
      if (/patrocinado|sponsored|an[uú]ncio/.test(norm(card?.innerText || ''))) continue;
      const href = String(a.getAttribute('href') || '');
      let rotulo = norm(a.getAttribute('aria-label') || '');
      if (!rotulo) {
        const m = href.match(/\/maps\/place\/([^/@]+)/);
        if (m) rotulo = norm(decodeURIComponent(m[1]).replace(/\+/g, ' '));
      }
      if (!/\ba formula\b/.test(rotulo)) continue;
      const mc = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const km = (mc && lat != null) ? dist({ lat, lng }, { lat: +mc[1], lng: +mc[2] }) : null;
      cands.push({ a, rotulo, km });
    }
    if (!cands.length) return null;
    const comKm = cands.filter((c) => c.km != null);
    const esc = comKm.length ? comKm.sort((x, y) => x.km - y.km)[0] : cands[0];
    esc.a.setAttribute('data-alvo-af', '1');
    return { nome: esc.rotulo.slice(0, 70), km: esc.km, candidatos: cands.length };
  }, { lat: u.lat, lng: u.lng });

  if (alvo) {
    await page.click('a[data-alvo-af="1"]').catch(() => {});
    await sleep(4500);
  }
  return alvo;
}

async function colhe(page, u) {
  // DUAS consultas, em ordem. A 1ª (com endereço) acerta a maioria; quando ela
  // devolve LISTA em vez de perfil, a 2ª (só cidade+UF) costuma abrir o perfil
  // direto — foi assim que Rio Branco apareceu ("Farmácia de Manipulação - a
  // Fórmula", marca no fim do nome).
  const queries = [
    `A Fórmula Farmácia de Manipulação ${u.endereco || ''} ${u.cidade} ${u.estado}`,
    `A Fórmula Farmácia de Manipulação ${u.cidade} ${u.estado}`,
  ].map((q) => q.replace(/\s+/g, ' ').trim());

  for (const query of queries) {
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}/?hl=pt-BR`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(5000);
    if (/\/maps\/place\//.test(page.url())) break;
    await abrirCard(page, u);
    if (/\/maps\/place\//.test(page.url())) break;
  }

  // expandir o painel de horários (na view logada isso abre os 7 dias)
  for (const sel of ['[aria-label*="Mostrar horári" i]', '[jsaction*="openhours"]',
                     'button[data-item-id*="oh"]', '[aria-label*="Horário de funcionamento" i]']) {
    const el = await page.$(sel);
    if (el) { await el.click({ timeout: 3000 }).catch(() => {}); await sleep(1800); }
  }

  // 🔴 Se não chegou num PERFIL, não extrair nada: na lista de resultados a página
  // mostra nota e horário de um card qualquer — possivelmente concorrente — e isso
  // entraria no JSON como se fosse da loja. Melhor devolver vazio.
  if (!/\/maps\/place\//.test(page.url())) {
    return { nomeGoogle: null, naoAbriuPerfil: true, urlPerfil: page.url().split('/data=')[0], fotos: [] };
  }

  return await page.evaluate(() => {
    const out = {};
    const clean = (s) => (s ? String(s).replace(/\s+/g, ' ').trim() : null);

    // 🔴 O NOME VEM DA URL, não do h1. Quando a busca devolveu lista, o painel de
    // resultados fica no DOM e os primeiros h1 são "Resultados" e "Patrocinado" —
    // isso rejeitou 5 lojas legítimas que estavam no perfil CERTO (Rio Branco já
    // tinha os 7 dias colhidos). Perseguir h1 por exclusão é jogo perdido; o path
    // /maps/place/{Nome}/ é determinístico. h1 fica só como reserva.
    const mNome = location.pathname.match(/\/maps\/place\/([^/@]+)/);
    out.nomeGoogle = mNome
      ? clean(decodeURIComponent(mNome[1]).replace(/\+/g, ' '))
      : ([...document.querySelectorAll('h1')].map((h) => clean(h.textContent))
          .find((t) => t && !/^(resultados?|results?|patrocinado|sponsored)$/i.test(t)) || null);

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

      // 🔴 TRAVA — DOIS sinais independentes. Histórico de erros nos dois sentidos:
      //  v1 frouxa: exigia só "fórmula" + "farmácia" → ACEITAVA concorrente
      //             ("Companhia da Fórmula Alecrim", flagrado pelo operador).
      //  v2 estrita: exigia COMEÇAR com "A Fórmula" → REJEITAVA loja legítima
      //             (Rio Branco chama "Farmácia de Manipulação - a Fórmula").
      //  v3 (esta): token da marca em qualquer posição + PROXIMIDADE da coordenada
      //             do cadastro (lat/lng tem 85/85 de cobertura). Aferido: 70/75
      //             ficaram a <400m, o que confirma a coleta por nome.
      const nomeN = String(d.nomeGoogle || '').normalize('NFD')
        .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      const temMarca = /\ba formula\b/.test(nomeN);

      const mc = String(d.urlPerfil || '').match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      let km = null;
      if (mc && u.lat != null) {
        const R = 6371, rad = (x) => (x * Math.PI) / 180;
        const dLat = rad(+mc[1] - u.lat), dLng = rad(+mc[2] - u.lng);
        const h = Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(u.lat)) * Math.cos(rad(+mc[1])) * Math.sin(dLng / 2) ** 2;
        km = 2 * R * Math.asin(Math.sqrt(h));
      }
      d.kmDoCadastro = km == null ? null : Math.round(km * 1000) / 1000;
      const perto = km != null && km <= 0.6;

      // 2º sinal de identidade, para quando a COORDENADA DO CADASTRO é que está
      // errada: mesmo nº de logradouro + mesma rua. Medido em belo-jardim — perfil
      // correto (Av. Dep. José Mendonça Bezerra, 307A x cadastro 307) a 1,59 km da
      // coordenada cadastrada. Aceitar por endereço e SINALIZAR a coordenada.
      const soNum = (s) => {
        const t = String(s || '').replace(/\b\d{5}-?\d{3}\b/g, ' ').replace(/\bkm\s*\d+/gi, ' ');
        const m = t.match(/,\s*(?:n[ºo]\.?\s*)?(\d{1,5})\s*[a-z]?\b/i) || t.match(/\b(\d{1,5})\s*[a-z]?\b/);
        return m ? m[1] : null;
      };
      const palavras = (s) => new Set(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().match(/[a-z]{4,}/g) || []);
      const numIgual = soNum(d.enderecoGoogle) && soNum(d.enderecoGoogle) === soNum(u.endereco);
      const comuns = [...palavras(d.enderecoGoogle)].filter((w) => palavras(u.endereco).has(w)).length;
      const mesmoEndereco = !!numIgual && comuns >= 2;

      const confere = temMarca && (perto || mesmoEndereco);
      if (confere && !perto && km != null) d.coordenadaSuspeita = `cadastro a ${km.toFixed(2)} km do perfil`;
      d.motivoRejeicao = confere ? undefined
        : [!temMarca ? 'nome sem o token "a fórmula"' : null,
           !perto ? (km == null ? 'sem coordenada no resultado' : `a ${km.toFixed(2)} km do cadastro e endereço não bate`) : null]
          .filter(Boolean).join(' · ');

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
