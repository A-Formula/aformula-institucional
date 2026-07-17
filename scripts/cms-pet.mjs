// CMS da página Pet — extração (seed) e aplicação (build).
// Modelo: o painel edita o doc Firestore pages/pet (semeado deste arquivo com o conteúdo
// atual do HTML commitado); a cada Publicar, applyPetCms() reaplica os valores sobre o
// pet.html PRISTINO do git (cirurgia determinística por data-dc-tpl e posição).
// O doc é autodescritivo (labels embutidos) — o painel renderiza sem mapa separado.
//
// Extrair seed:  node scripts/cms-pet.mjs --extract > pet-seed.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SECTIONS = [
  { key: 'hero',        tpl: '34',  label: 'Hero (topo da página)' },
  { key: 'beneficios',  tpl: '55',  label: 'Benefícios' },
  { key: 'formas',      tpl: '117', label: 'Formas farmacêuticas' },
  { key: 'sabores',     tpl: '196', label: 'Sabores' },
  { key: 'paraquem',    tpl: '281', label: 'Para quem é' },
  { key: 'depoimentos', tpl: '334', label: 'Depoimentos' },
  { key: 'universo',    tpl: '431', label: 'Universo pet (Instagram)' },
  { key: 'faq',         tpl: '455', label: 'Perguntas frequentes' },
];
const COLLECTIONS = {
  beneficios: { start: '<div[^>]*data-fade=""[^>]*class="pet-card"', tag: 'div',  label: 'Cards de benefício' },
  formas:     { start: '<div data-fade="" style="flex: 0 0 auto; width: clamp\\(140px', tag: 'div', label: 'Formas (círculos)' },
  sabores:    { start: '<span[^>]*class="pet-chip"', tag: 'span', label: 'Chips de sabor' },
  paraquem:   { start: '<div[^>]*class="pet-card quem-card"', tag: 'div', label: 'Cards de público' },
  faq:        { start: '<div[^>]*data-faq-item=""', tag: 'div', label: 'Perguntas' },
};
const TEXT_TAGS = ['h1', 'h2', 'h3', 'p'];

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

function sectionMarks(html) {
  const re = /<section data-dc-tpl="(\d+)"/g;
  const marks = []; let m;
  while ((m = re.exec(html))) marks.push({ tpl: m[1], start: m.index });
  const footIdx = html.indexOf('<footer');
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

// enumera slots de texto: elementos h1-h3/p com data-dc-tpl (id) + spans-folha com data-dc-tpl
function enumTexts(block, excludeRanges) {
  const out = [];
  for (const tag of TEXT_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*data-dc-tpl="(\\d+)"[^>]*>`, 'g');
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
  const re = /<span\b[^>]*data-dc-tpl="(\d+)"[^>]*>/g;
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

// textos POSICIONAIS dentro de um item de coleção (h3/p/span-folha, sem depender de dc-tpl)
function enumItemTexts(block) {
  const out = [];
  for (const tag of ['h3', 'p', 'span']) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, 'g');
    let n = 0, m;
    while ((m = re.exec(block))) {
      const close = block.indexOf(`</${tag}>`, re.lastIndex);
      if (close < 0) break;
      const val = block.slice(re.lastIndex, close);
      re.lastIndex = close;
      if (!val.trim() || val.includes('<')) { n++; continue; }
      out.push({ key: `${tag}-${n}`, tag, n, start: m.index, innerStart: block.indexOf('>', m.index) + 1, end: close, val });
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
export function extractPet(html) {
  const { marks } = sectionMarks(html);
  const byTpl = Object.fromEntries(marks.map(s => [s.tpl, html.slice(s.start, s.end)]));
  const sections = [];
  for (const def of SECTIONS) {
    const block = byTpl[def.tpl];
    if (!block) continue;
    const sec = { key: def.key, tpl: def.tpl, label: def.label, v: true, texts: {}, imgs: {} };
    const col = COLLECTIONS[def.key];
    const itemRanges = col ? findItems(block, col) : [];
    for (const t of enumTexts(block, itemRanges))
      sec.texts[t.id] = { label: `Texto: “${short(t.val)}”`, val: t.val };
    for (const im of enumImgs(block, itemRanges))
      sec.imgs[String(im.idx)] = { label: `Imagem ${im.idx + 1}`, val: im.src };
    if (col) {
      sec.itemsLabel = col.label;
      sec.items = findItems(block, col).map((r, i) => {
        const ib = block.slice(r.start, r.end);
        const it = { i, v: true, texts: {}, imgs: {} };
        for (const t of enumItemTexts(ib)) it.texts[t.key] = { label: short(t.val), val: t.val };
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
function applyEdits(block, edits) {
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) block = block.slice(0, e.start) + e.rep + block.slice(e.end);
  return block;
}

function processSection(block, sec, colDef) {
  const itemRanges = colDef ? findItems(block, colDef) : [];
  const edits = [];
  if (sec.texts) for (const t of enumTexts(block, itemRanges)) {
    const stored = sec.texts[t.id];
    if (stored && typeof stored.val === 'string' && stored.val !== t.val)
      edits.push({ start: t.start, end: t.end, rep: stored.val });
  }
  if (sec.imgs) for (const im of enumImgs(block, itemRanges)) {
    const stored = sec.imgs[String(im.idx)];
    if (stored && stored.val && stored.val !== im.src)
      edits.push({ start: im.start, end: im.start + im.tagStr.length, rep: im.tagStr.replace(/src="[^"]*"/, `src="${stored.val}"`) });
  }
  if (colDef && Array.isArray(sec.items) && itemRanges.length) {
    const editsFor = (it, ib) => {
      const iEdits = [];
      if (it.texts) for (const t of enumItemTexts(ib)) {
        const stored = it.texts[t.key];
        if (stored && typeof stored.val === 'string' && stored.val !== t.val)
          iEdits.push({ start: t.innerStart, end: t.end, rep: stored.val });
      }
      if (it.imgs) for (const im of enumImgs(ib, [])) {
        const stored = it.imgs[String(im.idx)];
        if (stored && stored.val && stored.val !== im.src)
          iEdits.push({ start: im.start, end: im.start + im.tagStr.length, rep: im.tagStr.replace(/src="[^"]*"/, `src="${stored.val}"`) });
      }
      if (it.tail && it.tail.val) {
        const m = ib.match(/(<img[^>]*>\s*)([^<]+)(<\/span>\s*)$/);
        if (m && m[2] !== it.tail.val) {
          const start = m.index + m[1].length;
          iEdits.push({ start, end: start + m[2].length, rep: it.tail.val });
        }
      }
      return iEdits;
    };
    const structChanged = sec.items.length !== itemRanges.length
      || sec.items.some((it, idx) => it.i !== idx || it.v === false);
    if (!structChanged) {
      // só edição de conteúdo → in-place, estrutura (fileiras/wrappers) intocada
      for (const it of sec.items) {
        const r = itemRanges[it.i];
        for (const e of editsFor(it, block.slice(r.start, r.end)))
          edits.push({ start: r.start + e.start, end: r.start + e.end, rep: e.rep });
      }
    } else {
      // reordenar/ocultar → remonta a região dos itens (conteúdo entre itens é descartado)
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

export function applyPetCms(html, data) {
  if (!data || !Array.isArray(data.sections) || !data.sections.length) return html;
  const { marks, footIdx } = sectionMarks(html);
  if (!marks.length || footIdx < 0) return html;
  const byTpl = Object.fromEntries(marks.map(s => [s.tpl, html.slice(s.start, s.end)]));
  const known = new Set(data.sections.map(s => s.tpl));
  // seção nova no HTML que o doc não conhece → não arriscar (mantém página intacta)
  if (marks.some(s => !known.has(s.tpl))) { console.warn('[cms-pet] seção desconhecida no HTML — CMS pulado'); return html; }
  const visible = data.sections.filter(s => s.v !== false);
  const orderChanged = visible.length !== marks.length || visible.some((s, i) => s.tpl !== marks[i].tpl);
  if (!orderChanged) {
    // ordem original e tudo visível → splice in-place (byte-idêntico quando nada mudou)
    const edits = [];
    for (const sec of data.sections) {
      const mark = marks.find(m => m.tpl === sec.tpl);
      if (!mark) continue;
      const processed = processSection(byTpl[sec.tpl], sec, COLLECTIONS[sec.key]);
      if (processed !== byTpl[sec.tpl]) edits.push({ start: mark.start, end: mark.end, rep: processed });
    }
    return applyEdits(html, edits);
  }
  const out = [];
  for (const sec of data.sections) {
    if (sec.v === false) continue;
    const block = byTpl[sec.tpl];
    if (block == null) continue;
    out.push(processSection(block, sec, COLLECTIONS[sec.key]));
  }
  return html.slice(0, marks[0].start) + out.join('\n') + html.slice(footIdx);
}

// ---------- CLI ----------
if (process.argv.includes('--extract')) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const html = fs.readFileSync(path.join(__dirname, '..', 'pet.html'), 'utf8');
  process.stdout.write(JSON.stringify(extractPet(html), null, 1));
}
