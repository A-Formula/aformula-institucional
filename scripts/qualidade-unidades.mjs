// qualidade-unidades.mjs — classifica cada unidade pelo que tem e pelo que falta.
// Só lê. Cruza lojas.json (o que está no ar) com _coleta-google (o que o Google publica).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const val = v => v!=null && String(v).trim()!=='';
const aberta = u => !/em breve/i.test(`${u.nome} ${u.slug}`);
function rot(u){const n=String(u.nome||'').trim(),c=String(u.cidade||'').trim();
  let d=null; if(n&&!norm(n).includes(norm(c)))d=n;
  else if(n)d=n.split(/\s+[–—-]\s+/).slice(1).join(' — ').replace(/\s*\|\s*/g,' — ').trim()||null;
  return `${c}${d?` — ${d}`:''} (${u.estado})`;}
// nº do logradouro. Tira o CEP ANTES, senão ele é confundido com o número
// (bug medido: "Belo Jardim, 307A ... 55150-005" devolvia 55150 porque o \b
// não casa entre "307" e "A").
const num = s => {
  const t = String(s || '')
    .replace(/\b\d{5}-?\d{3}\b/g, ' ')          // CEP
    .replace(/\bkm\s*\d+/gi, ' ');              // "BR-316, Km 01"
  const m = t.match(/,\s*(?:n[ºo]\.?\s*)?(\d{1,5})\s*[a-z]?\b/i) || t.match(/\b(\d{1,5})\s*[a-z]?\b/);
  return m ? m[1] : null;
};

const lojas = JSON.parse(fs.readFileSync(path.join(ROOT,'encontre-uma-loja_assets','lojas.json'),'utf8'));
const g = s => { const f=path.join(ROOT,'_coleta-google',`${s}.json`);
  return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null; };

const out = [];
for (const u of lojas.filter(aberta)) {
  const c = g(u.slug);
  const falta = [], grave = [];
  if (!c || !c.confere) grave.push('perfil do Google não confirmado');
  else if (c.diasCapturados !== 7) grave.push('perfil sem horário publicado');
  if (!val(u.cep)) falta.push('CEP');
  if (!val(u.email)) falta.push('e-mail');
  if (!val(u.telefone) && !val(u.celular)) grave.push('sem telefone');
  if (c && c.confere && !(c.fotos||[]).length) falta.push('sem foto no perfil');
  if (c && c.confere) { const a=num(c.enderecoGoogle), b=num(u.endereco);
    if (a && b && a !== b) falta.push(`nº do endereço difere (cadastro ${b} × Google ${a})`); }
  if (c && c.confere && !c.nota) falta.push('sem nota no Google');
  out.push({ u, c, rot: rot(u), grave, falta,
    nota: c?.nota||null, aval: c?.avaliacoes||null });
}
const criticas = out.filter(o=>o.grave.length);
const parciais = out.filter(o=>!o.grave.length && o.falta.length);
const boas     = out.filter(o=>!o.grave.length && !o.falta.length);

const p = (t,a)=>{console.log(`\n=== ${t} (${a.length}) ===`);
  a.sort((x,y)=>x.rot.localeCompare(y.rot,'pt-BR'))
   .forEach(o=>console.log(`  ${o.rot}${o.nota?` · ${o.nota}★`:''}${[...o.grave,...o.falta].length?` → ${[...o.grave,...o.falta].join(' · ')}`:''}`));};
p('BOAS — nada faltando', boas);
p('PARCIAIS — dá pra publicar, mas falta detalhe', parciais);
p('CRÍTICAS — não publicar sem resolver', criticas);
console.log(`\nem breve (fora da conta): ${lojas.filter(u=>!aberta(u)).length}`);
