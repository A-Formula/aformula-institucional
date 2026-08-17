// relatorio-google.mjs — compara o perfil do Google com o que está NO AR hoje.
// Só lê. Gera RELATORIO-GOOGLE-vs-LIVE.md. Não altera cadastro nem página.
//
// "No ar hoje" = o `lojas.json`, que alimenta o mapa do /encontre-uma-loja e os
// cards com telefone e endereço; + o horário genérico publicado na página de
// unidade (hoje só a de Salvador existe).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '_coleta-google');

// o que a página de unidade publica hoje (build-lojas.mjs → HORARIO)
const PUBLICADO = { semana: '08:00 a 18:00', sabado: '08:00 a 13:00' };

const so = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// Rótulo que distingue lojas da MESMA cidade (Salvador/Maceió/Belém têm 3+).
// Mesma regra do build-lojas.mjs: o diferenciador vem do nome, curado pela matriz.
function rotulo(r) {
  const nome = String(r.nomeCadastro || '').trim();
  const cidade = String(r.cidade || '').trim();
  let d = null;
  if (nome && !norm(nome).includes(norm(cidade))) d = nome;
  else if (nome) {
    d = nome.split(/\s+[–—-]\s+/).slice(1).join(' — ')
      .replace(/\s*\|\s*/g, ' — ').replace(/\s+/g, ' ').trim() || null;
  }
  return `${cidade}${d ? ` — ${d}` : ''} (${r.estado})`;
}

// Nº do logradouro: é o sinal FORTE de divergência de endereço.
// Comparar a string inteira dá falso positivo demais (o Google reescreve bairro,
// abrevia logradouro e acrescenta CEP) — 48/70 "divergiam" só por formatação.
const numero = (s) => {
  const m = String(s || '').match(/,\s*(\d{1,6})\b/) || String(s || '').match(/\b(\d{2,6})\b/);
  return m ? m[1] : null;
};

function main() {
  if (!fs.existsSync(DIR)) { console.error('sem coleta'); process.exit(1); }
  const regs = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))
    .sort((a, b) => `${a.estado}${a.cidade}`.localeCompare(`${b.estado}${b.cidade}`, 'pt-BR'));

  const conf = regs.filter((r) => r.confere);
  const susp = regs.filter((r) => !r.confere);

  // divergências
  const divTel = [], divEnd = [], semHorario = [], horarios = [];
  for (const r of conf) {
    const tg = so(r.telefoneGoogle), tc = so(r.cadastro?.celular), tf = so(r.cadastro?.telefone);
    if (tg && (tc || tf) && tg !== tc && tg !== tf) divTel.push(r);
    const ng = numero(r.enderecoGoogle), nc = numero(r.cadastro?.endereco);
    if (ng && nc && ng !== nc) divEnd.push(r);
    const h = r.horarioHoje?.horas;
    if (!h) semHorario.push(r); else horarios.push({ r, h });
  }

  // telefone repetido entre unidades (no cadastro, não no Google)
  const dupTel = {};
  for (const r of regs) {
    const d = so(r.cadastro?.celular || r.cadastro?.telefone);
    if (d) (dupTel[d] = dupTel[d] || []).push(r.slug);
  }

  const bateComPublicado = horarios.filter((x) => so(x.h).startsWith('0800') && /18[:.]?00/.test(x.h));
  const notas = conf.filter((r) => r.nota).map((r) => parseFloat(r.nota));
  const media = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2) : '—';

  const linha = (r) => {
    const tg = r.telefoneGoogle || '—';
    const tc = r.cadastro?.celular || r.cadastro?.telefone || '—';
    const bate = so(tg) && so(tg) === (so(r.cadastro?.celular) || so(r.cadastro?.telefone)) ? '=' : '≠';
    return `| ${rotulo(r)} | ${r.nota || '—'}${r.avaliacoes ? ` (${r.avaliacoes})` : ''} | ${r.horarioHoje?.horas || '—'} | ${tc} | ${tg} | ${bate} | ${(r.fotos || []).length} |`;
  };

  const md = `# Google × o que está no ar — unidades A Fórmula

> Coletado em ${regs[0]?.coletadoEm || '—'} · **documento de leitura, nada foi alterado.**
> Fonte: perfil público de cada unidade no Google Maps. "No ar" = \`lojas.json\`,
> que alimenta o mapa e os cards do /encontre-uma-loja.

## Resumo

| | |
|---|---|
| Unidades consultadas | ${regs.length} |
| Perfil confirmado como A Fórmula | **${conf.length}** |
| Não confirmado (revisar à mão) | ${susp.length} |
| Nota média no Google | **${media}** (de ${notas.length} unidades com nota) |
| Telefone do Google ≠ cadastro | **${divTel.length}** |
| Nº do logradouro diverge do cadastro | ${divEnd.length} |
| Com foto disponível no perfil | ${conf.filter((r) => (r.fotos || []).length).length} |

## 🔴 O horário publicado não corresponde à realidade

A página de unidade publica hoje **${PUBLICADO.semana}** de segunda a sexta.
Das ${horarios.length} unidades com horário legível no Google, **apenas ${bateComPublicado.length}** abrem
nesse intervalo.

| Unidade | Horário hoje (Google) |
|---|---|
${horarios.map((x) => `| ${rotulo(x.r)} | ${x.h} |`).join('\n')}

${semHorario.length ? `Sem horário legível: ${semHorario.map((r) => r.slug).join(', ')}.` : ''}

## 🔴 O \`place_id\` do cadastro não é confiável

Medido em \`salvador-shopping-paralela\`: o \`place_id\` do cadastro aponta para o
**prédio** (\`Av. Luís Viana Filho, 8544\`, categoria *Edifício*), não para a loja.
Colher por ele traz a nota do **Shopping Paralela** (4,5 / 35.912 avaliações) no lugar
da farmácia (**4,2**). Por isso esta coleta entra por **busca de nome**, com trava de
validação — e por isso o \`sameAs\` que a página de unidade publica hoje, montado a
partir desse \`place_id\`, **aponta para o lugar errado**.

## Divergência de telefone (${divTel.length})

⚠️ Documentado a pedido do operador. **Nada foi alterado.**

${divTel.length ? `| Unidade | No ar (cadastro) | No Google |
|---|---|---|
${divTel.map((r) => `| ${rotulo(r)} | ${r.cadastro?.celular || r.cadastro?.telefone || '—'} | ${r.telefoneGoogle} |`).join('\n')}` : '_(nenhuma)_'}

## 🔴 Um mesmo telefone serve várias unidades no cadastro

Nenhum número é malformado — todos formam número BR válido. O problema é outro:
**${Object.values(dupTel).filter((a) => a.length > 1).reduce((n, a) => n + a.length, 0)} das ${conf.length + susp.length} unidades dividem o telefone com outra loja**, enquanto no Google cada
uma tem o seu. Ou seja, o botão de WhatsApp que o mapa publica hoje manda o cliente de
várias cidades para o mesmo número — e a página de unidade herdaria isso.

| Número no cadastro | Unidades que o usam |
|---|---|
${Object.entries(dupTel).filter(([, a]) => a.length > 1)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([d, a]) => `| ${d} | **${a.length}** — ${a.join(', ')} |`).join('\n')}

## Endereço — número do logradouro diferente (${divEnd.length})

Comparado **só pelo número**: o Google reescreve bairro, abrevia logradouro e acrescenta
CEP, então comparar a string inteira dá falso positivo (na 1ª versão, 48 de 70 "divergiam"
só por formatação). Número diferente é sinal forte.

${divEnd.length ? `| Unidade | No ar (cadastro) | No Google |
|---|---|---|
${divEnd.map((r) => `| ${rotulo(r)} | ${r.cadastro?.endereco || '—'} | ${r.enderecoGoogle} |`).join('\n')}` : '_(nenhuma)_'}

## Tabela completa

| Unidade | Nota (avaliações) | Horário hoje | Telefone no ar | Telefone no Google | | Fotos |
|---|---|---|---|---|---|---|
${conf.map(linha).join('\n')}

${susp.length ? `## ⚠️ Não confirmadas — a busca não caiu no perfil da loja

Precisam de conferência manual antes de qualquer uso.

| Unidade | O que o Google devolveu |
|---|---|
${susp.map((r) => `| ${r.cidade} — ${r.estado} (\`${r.slug}\`) | ${(r.nomeGoogle || '—').slice(0, 60)} |`).join('\n')}` : ''}

## Limites desta coleta

- **Só o horário de HOJE.** Sem login, o Maps serve "visualização limitada" e não abre
  a semana; \`google.com/search\` devolve CAPTCHA. Como tudo foi colhido no mesmo dia,
  os valores são comparáveis entre si — mas **não substituem a semana completa**.
  Para isso o caminho é a **API oficial do Places** (chave + billing) ou o próprio
  franqueado no formulário.
- **Fotos**: só as URLs foram registradas, em miniatura. Nenhuma foi baixada nem usada.
- Nota e nº de avaliações são do dia da coleta e mudam sozinhos.
`;

  const f = path.join(ROOT, 'RELATORIO-GOOGLE-vs-LIVE.md');
  fs.writeFileSync(f, md);
  console.log('escrito:', f);
  console.log(`${conf.length} confirmadas · ${susp.length} suspeitas · ${divTel.length} divergencias de telefone · ${bateComPublicado.length}/${horarios.length} batem com o horario publicado`);
}

main();
