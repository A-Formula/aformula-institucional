// Motor CMS multi-página — extração (seed) e aplicação (build), genérico por página.
// Generaliza o antigo cms-pet.mjs: cada página tem uma config (arquivo, doc Firestore,
// atributo-âncora, seções e coleções). O painel edita o doc pages/{doc} (semeado deste motor
// com o conteúdo commitado); a cada Publicar, applyPageCms() reaplica os valores sobre o
// HTML PRISTINO do git por cirurgia determinística (âncora + posição).
// O doc é autodescritivo (labels embutidos) — mesmo formato para todas as páginas.
//
// Extrair seed:  node scripts/cms-pages.mjs --extract {pet|sobre|home} > seed.json
//
// REGRAS DE OURO (provadas no pet, preservadas aqui):
//  1) edição só de conteúdo → aplica IN-PLACE, estrutura (fileiras/wrappers) intocada;
//  2) reordenar/ocultar item → remonta a região dos itens (coleção normal);
//  3) nada mudou → saída byte-idêntica;
//  4) seção ancorada no HTML que o doc não conhece → failsafe, CMS se desativa.
// Extensões multi-página:
//  - `anchor` configurável (data-dc-tpl nas páginas DC, data-cms-id na home);
//  - coleção `fixedOrder:true` → NUNCA remonta a região (só edita conteúdo in-place) —
//    para itens que não são irmãos contíguos num único container (ex.: cards em 3 grupos);
//  - `sectionBound:'self'` (home) → cada seção é delimitada pelo próprio </section> e as
//    seções NÃO-ancoradas entre elas (ex.: diferenciais, blog) são preservadas como "mobília";
//    default `'nextMark'` (pet/sobre) → seções contíguas, delimitadas pela próxima âncora/footer.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TEXT_TAGS = ['h1', 'h2', 'h3', 'p'];
const DEFAULT_ITEM_TAGS = ['h3', 'p', 'span'];

// ---------- CONFIG DAS PÁGINAS ----------
export const PAGES = {
  pet: {
    file: 'pet.html', doc: 'pet', anchor: 'data-dc-tpl', sectionBound: 'nextMark',
    sections: [
      { key: 'hero',        tpl: '34',  label: 'Hero (topo da página)' },
      { key: 'beneficios',  tpl: '55',  label: 'Benefícios' },
      { key: 'formas',      tpl: '117', label: 'Formas farmacêuticas' },
      { key: 'sabores',     tpl: '196', label: 'Sabores' },
      { key: 'paraquem',    tpl: '281', label: 'Para quem é' },
      { key: 'depoimentos', tpl: '334', label: 'Depoimentos' },
      { key: 'universo',    tpl: '431', label: 'Universo pet (Instagram)' },
      { key: 'faq',         tpl: '455', label: 'Perguntas frequentes' },
    ],
    collections: {
      beneficios: { start: '<div[^>]*data-fade=""[^>]*class="pet-card"', tag: 'div',  label: 'Cards de benefício', selector: '.pet-card[data-fade]' },
      formas:     { start: '<div data-fade="" style="flex: 0 0 auto; width: clamp\\(140px', tag: 'div', label: 'Formas (círculos)', selector: '[data-formas-track] > div' },
      sabores:    { start: '<span[^>]*class="pet-chip"', tag: 'span', label: 'Chips de sabor', selector: '.pet-chip' },
      paraquem:   { start: '<div[^>]*class="pet-card quem-card"', tag: 'div', label: 'Cards de público', selector: '.pet-card.quem-card' },
      faq:        { start: '<div[^>]*data-faq-item=""', tag: 'div', label: 'Perguntas', selector: '[data-faq-item]' },
    },
  },
  sobre: {
    file: 'sobre-nos.html', doc: 'sobre', anchor: 'data-dc-tpl', sectionBound: 'nextMark',
    sections: [
      { key: 'hero',         tpl: '6',   label: 'Hero / estatísticas' },
      { key: 'timeline',     tpl: '45',  label: 'A nossa história (timeline)' },
      { key: 'diferenciais', tpl: '121', label: 'Nossos diferenciais' },
      { key: 'essencia',     tpl: '244', label: 'Nossa essência (missão/visão/valores)' },
    ],
    collections: {
      // 8 marcos irmãos contíguos dentro de data-spine-wrap → coleção normal (reordenável).
      // ano+título vivem em <div data-reveal>, texto em <p> → itemTextTags inclui 'div'.
      timeline:     { start: '<div[^>]*data-milestone=""', tag: 'div', label: 'Marcos da timeline', selector: '[data-milestone]', itemTextTags: ['div', 'p'] },
      // 9 cards em 3 grupos data-dif-group (não são irmãos contíguos) → fixedOrder (só conteúdo).
      diferenciais: { start: '<div[^>]*class="dc-card"', tag: 'div', label: 'Cards de diferenciais', selector: '.dc-card', fixedOrder: true },
    },
  },
  home: {
    file: 'index.html', doc: 'home', anchor: 'data-cms-id', sectionBound: 'self', sectionTag: 'section',
    sections: [
      { key: 'hero',     tpl: 'hero',     label: 'Hero (imagem de fundo)' },
      { key: 'empresas', tpl: 'empresas', label: 'Uma das maiores empresas / pilares' },
      { key: 'anos',     tpl: 'anos',     label: 'Há 37 anos' },
      { key: 'news',     tpl: 'news',     label: 'Newsletter' },
    ],
    collections: {
      // chaveada pela key da seção ('empresas'), como no pet
      empresas: { start: '<article[^>]*class="pillar reveal"', tag: 'article', label: 'Pilares', selector: '.empresas__grid .pillar' },
    },
  },
};

// ---------- HELPERS ----------
// fecha um bloco balanceado da tag a partir de startIdx (índice do '<tag')
function tagBlockEnd(src, startIdx, tag) {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = startIdx;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    if (m[0][1] !== '/') depth++;
    else { depth--; if (depth === 0) return m.index + m[0].length; }
  }
  return -1;
}

// Localiza as seções ancoradas. Dois modos:
//  - nextMark: <section {anchor}="val"> contíguas, fim = próxima âncora ou <footer>.
//  - self:     <section ...{anchor}="val"...> em qualquer posição do tag, fim = próprio </section>.
function findSections(html, cfg) {
  const footIdx = html.indexOf('<footer');
  if (cfg.sectionBound === 'self') {
    const re = new RegExp(`<section\\b[^>]*\\s${cfg.anchor}="([^"]+)"`, 'g');
    const marks = []; let m;
    while ((m = re.exec(html))) {
      const end = tagBlockEnd(html, m.index, 'section');
      if (end < 0) break;
      marks.push({ tpl: m[1], start: m.index, end });
      re.lastIndex = end;
    }
    return { marks, footIdx };
  }
  const re = new RegExp(`<section ${cfg.anchor}="([^"]+)"`, 'g');
  const marks = []; let m;
  while ((m = re.exec(html))) marks.push({ tpl: m[1], start: m.index });
  marks.forEach((s, i) => { s.end = i + 1 < marks.length ? marks[i + 1].start : footIdx; });
  return { marks, footIdx };
}

function findItems(block, colDef) {
  const re = new RegExp(colDef.start, 'g');
  const items = []; let m;
  while ((m = re.exec(block))) {
    const end = tagBlockEnd(block, m.index, colDef.tag);
    if (end < 0) break;
    items.push({ start: m.index, end });
    re.lastIndex = end;
  }
  return items;
}

const inRanges = (idx, ranges) => ranges.some(r => idx >= r.start && idx < r.end);

// enumera slots de texto: h1-h3/p com o atributo-âncora + spans-folha com o atributo-âncora
function enumTexts(block, excludeRanges, anchor) {
  const out = [];
  for (const tag of TEXT_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*${anchor}="([^"]+)"[^>]*>`, 'g');
    let m;
    while ((m = re.exec(block))) {
      if (inRanges(m.index, excludeRanges)) continue;
      const close = block.indexOf(`</${tag}>`, re.lastIndex);
      if (close < 0) continue;
      const val = block.slice(re.lastIndex, close);
      if (/<(svg|img|div|button)\b/.test(val)) continue; // markup estrutural — não é slot de texto
      out.push({ kind: 'id', id: m[1], tag, start: re.lastIndex, end: close, val });
    }
  }
  const hpRanges = out.map(t => ({ start: t.start, end: t.end }));
  const re = new RegExp(`<span\\b[^>]*${anchor}="([^"]+)"[^>]*>`, 'g');
  let m;
  while ((m = re.exec(block))) {
    if (inRanges(m.index, excludeRanges) || inRanges(m.index, hpRanges)) continue;
    const close = block.indexOf('</span>', re.lastIndex);
    if (close < 0) continue;
    const val = block.slice(re.lastIndex, close);
    if (!val.trim() || val.includes('<')) continue;
    out.push({ kind: 'id', id: m[1], tag: 'span', start: re.lastIndex, end: close, val });
  }
  return out.sort((a, b) => a.start - b.start);
}

// textos POSICIONAIS dentro de um item de coleção (sem depender de âncora).
// Visita TODO open-tag (não pula conteúdo) — captura folhas mesmo aninhadas (ex.: ano/título
// da timeline vivem em <div> irmãos dentro de uma célula); containers têm '<' no innerHTML → pulados.
function enumItemTexts(block, itemTags = DEFAULT_ITEM_TAGS) {
  const out = [];
  for (const tag of itemTags) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, 'g');
    let n = 0, m;
    while ((m = re.exec(block))) {
      const innerStart = re.lastIndex;
      const close = block.indexOf(`</${tag}>`, innerStart);
      if (close < 0) { n++; continue; }
      const val = block.slice(innerStart, close);
      // folha = sem markup estrutural (permite inline: br/em/span/strong); container tem '<div>' etc → pulado
      if (!val.trim() || /<(svg|img|div|button)\b/.test(val)) { n++; continue; }
      out.push({ key: `${tag}-${n}`, tag, n, start: m.index, innerStart, end: close, val });
      n++;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function enumImgs(block, excludeRanges) {
  const out = []; const re = /<img\b[^>]*>/g;
  let idx = 0, m;
  while ((m = re.exec(block))) {
    if (excludeRanges && inRanges(m.index, excludeRanges)) continue;
    const src = (m[0].match(/src="([^"]*)"/) || [])[1] || '';
    out.push({ idx, start: m.index, tagStr: m[0], src });
    idx++;
  }
  return out;
}

const short = s => { const t = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > 48 ? t.slice(0, 45) + '…' : t; };

// ---------- EXTRAÇÃO (seed) ----------
export function extractPage(html, cfg) {
  const { marks } = findSections(html, cfg);
  const byTpl = Object.fromEntries(marks.map(s => [s.tpl, html.slice(s.start, s.end)]));
  const sections = [];
  for (const def of cfg.sections) {
    const block = byTpl[def.tpl];
    if (block == null) continue;
    const sec = { key: def.key, tpl: def.tpl, label: def.label, v: true, texts: {}, imgs: {} };
    const col = cfg.collections && cfg.collections[def.key];
    const itemRanges = col ? findItems(block, col) : [];
    for (const t of enumTexts(block, itemRanges, cfg.anchor))
      sec.texts[t.id] = { label: `Texto: “${short(t.val)}”`, val: t.val };
    for (const im of enumImgs(block, itemRanges))
      sec.imgs[String(im.idx)] = { label: `Imagem ${im.idx + 1}`, val: im.src };
    if (col) {
      sec.itemsLabel = col.label;
      sec.items = itemRanges.map((r, i) => {
        const ib = block.slice(r.start, r.end);
        const it = { i, v: true, texts: {}, imgs: {} };
        for (const t of enumItemTexts(ib, col.itemTextTags)) it.texts[t.key] = { label: short(t.val), val: t.val };
        for (const im of enumImgs(ib, [])) it.imgs[String(im.idx)] = { label: `Imagem`, val: im.src };
        const tail = ib.match(/(<img[^>]*>\s*)([^<]+)(<\/span>\s*)$/);
        if (tail && !Object.keys(it.texts).length) it.tail = { label: short(tail[2]), val: tail[2] };
        it.name = it.texts['h3-0']?.val || it.tail?.val || Object.values(it.texts)[0]?.val || `Item ${i + 1}`;
        return it;
      });
    }
    sections.push(sec);
  }
  return { sections };
}

// ---------- APLICAÇÃO (build) ----------
// Escapa valor vindo do painel (Firestore) antes de reinjetar no HTML — mata XSS armazenado.
const E = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function applyEdits(block, edits) {
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) block = block.slice(0, e.start) + e.rep + block.slice(e.end);
  return block;
}

function processSection(block, sec, colDef, anchor) {
  const itemRanges = colDef ? findItems(block, colDef) : [];
  const edits = [];
  if (sec.texts) for (const t of enumTexts(block, itemRanges, anchor)) {
    const stored = sec.texts[t.id];
    if (stored && typeof stored.val === 'string' && stored.val !== t.val)
      edits.push({ start: t.start, end: t.end, rep: E(stored.val) });
  }
  if (sec.imgs) for (const im of enumImgs(block, itemRanges)) {
    const stored = sec.imgs[String(im.idx)];
    if (stored && stored.val && stored.val !== im.src)
      edits.push({ start: im.start, end: im.start + im.tagStr.length, rep: im.tagStr.replace(/src="[^"]*"/, `src="${E(stored.val)}"`) });
  }
  if (colDef && Array.isArray(sec.items) && itemRanges.length) {
    const editsFor = (it, ib) => {
      const iEdits = [];
      if (it.texts) for (const t of enumItemTexts(ib, colDef.itemTextTags)) {
        const stored = it.texts[t.key];
        if (stored && typeof stored.val === 'string' && stored.val !== t.val)
          iEdits.push({ start: t.innerStart, end: t.end, rep: E(stored.val) });
      }
      if (it.imgs) for (const im of enumImgs(ib, [])) {
        const stored = it.imgs[String(im.idx)];
        if (stored && stored.val && stored.val !== im.src)
          iEdits.push({ start: im.start, end: im.start + im.tagStr.length, rep: im.tagStr.replace(/src="[^"]*"/, `src="${E(stored.val)}"`) });
      }
      if (it.tail && it.tail.val) {
        const m = ib.match(/(<img[^>]*>\s*)([^<]+)(<\/span>\s*)$/);
        if (m && m[2] !== it.tail.val) {
          const start = m.index + m[1].length;
          iEdits.push({ start, end: start + m[2].length, rep: E(it.tail.val) });
        }
      }
      return iEdits;
    };
    // fixedOrder: NUNCA remonta (itens não são irmãos contíguos) — só edição de conteúdo in-place.
    const structChanged = !colDef.fixedOrder
      && (sec.items.length !== itemRanges.length || sec.items.some((it, idx) => it.i !== idx || it.v === false));
    if (!structChanged) {
      for (const it of sec.items) {
        const r = itemRanges[it.i];
        if (!r) continue;
        for (const e of editsFor(it, block.slice(r.start, r.end)))
          edits.push({ start: r.start + e.start, end: r.start + e.end, rep: e.rep });
      }
    } else {
      const pristine = itemRanges.map(r => block.slice(r.start, r.end));
      const rendered = [];
      for (const it of sec.items) {
        if (it.v === false) continue;
        const ib = pristine[it.i];
        if (ib == null) continue;
        rendered.push(applyEdits(ib, editsFor(it, ib)));
      }
      edits.push({ start: itemRanges[0].start, end: itemRanges[itemRanges.length - 1].end, rep: rendered.join('\n') });
    }
  }
  return applyEdits(block, edits);
}

// aplicação para páginas nextMark (pet/sobre) — comportamento original
function applyNextMark(html, cfg, data) {
  const { marks, footIdx } = findSections(html, cfg);
  if (!marks.length || footIdx < 0) return html;
  const byTpl = Object.fromEntries(marks.map(s => [s.tpl, html.slice(s.start, s.end)]));
  const known = new Set(data.sections.map(s => s.tpl));
  if (marks.some(s => !known.has(s.tpl))) { console.warn(`[cms:${cfg.doc}] seção desconhecida no HTML — CMS pulado`); return html; }
  const visible = data.sections.filter(s => s.v !== false);
  const orderChanged = visible.length !== marks.length || visible.some((s, i) => s.tpl !== marks[i].tpl);
  if (!orderChanged) {
    const edits = [];
    for (const sec of data.sections) {
      const mark = marks.find(m => m.tpl === sec.tpl);
      if (!mark) continue;
      const processed = processSection(byTpl[sec.tpl], sec, cfg.collections[sec.key], cfg.anchor);
      if (processed !== byTpl[sec.tpl]) edits.push({ start: mark.start, end: mark.end, rep: processed });
    }
    return applyEdits(html, edits);
  }
  const out = [];
  for (const sec of data.sections) {
    if (sec.v === false) continue;
    const block = byTpl[sec.tpl];
    if (block == null) continue;
    out.push(processSection(block, sec, cfg.collections[sec.key], cfg.anchor));
  }
  return html.slice(0, marks[0].start) + out.join('\n') + html.slice(footIdx);
}

// aplicação para páginas self (home) — seções auto-delimitadas; seções não-ancoradas
// entre as âncoras (diferenciais, blog) viram "mobília" fixa (gaps) e são preservadas.
function applySelf(html, cfg, data) {
  const { marks } = findSections(html, cfg);
  if (!marks.length) return html;
  const known = new Set(data.sections.map(s => s.tpl));
  if (marks.some(s => !known.has(s.tpl))) { console.warn(`[cms:${cfg.doc}] seção desconhecida no HTML — CMS pulado`); return html; }
  const byTpl = Object.fromEntries(marks.map(s => [s.tpl, html.slice(s.start, s.end)]));
  const visible = data.sections.filter(s => s.v !== false && byTpl[s.tpl] != null);
  const orderChanged = visible.length !== marks.length || visible.some((s, i) => s.tpl !== marks[i].tpl);
  if (!orderChanged) {
    const edits = [];
    for (const sec of data.sections) {
      const mark = marks.find(m => m.tpl === sec.tpl);
      if (!mark) continue;
      const processed = processSection(byTpl[sec.tpl], sec, cfg.collections[sec.key], cfg.anchor);
      if (processed !== byTpl[sec.tpl]) edits.push({ start: mark.start, end: mark.end, rep: processed });
    }
    return applyEdits(html, edits);
  }
  // remonta por slots com gaps fixos: prefixo + slot0 + gap01 + slot1 + ... + sufixo
  const gaps = [html.slice(0, marks[0].start)];
  for (let i = 0; i < marks.length - 1; i++) gaps.push(html.slice(marks[i].end, marks[i + 1].start));
  const suffix = html.slice(marks[marks.length - 1].end);
  const secByTpl = Object.fromEntries(data.sections.map(s => [s.tpl, s]));
  const contents = visible.map(s => processSection(byTpl[s.tpl], secByTpl[s.tpl], cfg.collections[s.key], cfg.anchor));
  let out = gaps[0];
  for (let i = 0; i < marks.length; i++) {
    if (i < contents.length) out += contents[i];
    if (i < marks.length - 1) out += gaps[i + 1];
  }
  return out + suffix;
}

export function applyPageCms(html, cfg, data) {
  if (!data || !Array.isArray(data.sections) || !data.sections.length) return html;
  return cfg.sectionBound === 'self' ? applySelf(html, cfg, data) : applyNextMark(html, cfg, data);
}

// ---------- COMPAT (pet) ----------
export const extractPet = html => extractPage(html, PAGES.pet);
export const applyPetCms = (html, data) => applyPageCms(html, PAGES.pet, data);

// ---------- CLI ----------
// node scripts/cms-pages.mjs --extract {pet|sobre|home}
if (process.argv.includes('--extract')) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const key = process.argv[process.argv.indexOf('--extract') + 1] || 'pet';
  const cfg = PAGES[key];
  if (!cfg) { console.error(`página desconhecida: ${key} (use pet|sobre|home)`); process.exit(1); }
  const html = fs.readFileSync(path.join(__dirname, '..', cfg.file), 'utf8');
  process.stdout.write(JSON.stringify(extractPage(html, cfg), null, 1));
}
