// relatorio-google.mjs — compara o perfil do Google com o que está NO AR hoje.
// Só lê. Gera RELATORIO-GOOGLE-vs-LIVE.md. Não altera cadastro nem página.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '_coleta-google');

// o que a página de unidade publica hoje (build-lojas.mjs → HORARIO)
const PUB = { semana: '08:00–18:00', sabado: '08:00–13:00', domingo: 'Fechado' };
const DIAS = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];

const so = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

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

const numero = (s) => {
  const m = String(s || '').match(/,\s*(\d{1,6})\b/) || String(s || '').match(/\b(\d{2,6})\b/);
  return m ? m[1] : null;
};

// "08:00–12:0014:00–18:00" → "08:00–12:00 e 14:00–18:00"
const legivel = (h) => String(h || '—').replace(/(\d{2}:\d{2})(\d{2}:\d{2})/g, '$1 e $2');

const igualPublicado = (h) => {
  if (!h) return false;
  const semana = DIAS.slice(0, 5).every((d) => (h[d] || '').replace(/\s/g, '') === PUB.semana);
  const sab = (h['sábado'] || '').replace(/\s/g, '') === PUB.sabado;
  const dom = /fechado/i.test(h['domingo'] || '');
  return semana && sab && dom;
};

function main() {
  const regs = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))
    .sort((a, b) => `${a.estado}${a.cidade}`.localeCompare(`${b.estado}${b.cidade}`, 'pt-BR'));

  const conf = regs.filter((r) => r.confere);
  const susp = regs.filter((r) => !r.confere);
  const comSemana = conf.filter((r) => r.diasCapturados === 7);
  const semHora = conf.filter((r) => !r.diasCapturados);

  const batem = comSemana.filter((r) => igualPublicado(r.horarios));
  const domingo = comSemana.filter((r) => !/fechado/i.test(r.horarios['domingo'] || 'Fechado'));
  const cedo = comSemana.filter((r) => { const m = (r.horarios['segunda-feira'] || '').match(/^(\d{1,2}):/); return m && +m[1] < 8; });
  const almoco = comSemana.filter((r) => /\d{2}:\d{2}\d{2}:\d{2}/.test(r.horarios['segunda-feira'] || ''));

  // padrões distintos
  const pad = {};
  for (const r of comSemana) {
    const k = DIAS.map((d) => (r.horarios[d] || '?').replace(/\s/g, '')).join(' | ');
    (pad[k] = pad[k] || []).push(r);
  }
  const padroes = Object.entries(pad).sort((a, b) => b[1].length - a[1].length);

  // telefone repetido no cadastro (esperado: call center de grupo)
  const dupTel = {};
  for (const r of regs) {
    const d = so(r.cadastro?.celular || r.cadastro?.telefone);
    if (d) (dupTel[d] = dupTel[d] || []).push(r);
  }
  const grupos = Object.entries(dupTel).filter(([, a]) => a.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  const divTel = conf.filter((r) => {
    const tg = so(r.telefoneGoogle), tc = so(r.cadastro?.celular), tf = so(r.cadastro?.telefone);
    return tg && (tc || tf) && tg !== tc && tg !== tf;
  });
  const divEnd = conf.filter((r) => {
    const a = numero(r.enderecoGoogle), b = numero(r.cadastro?.endereco);
    return a && b && a !== b;
  });
  const notas = conf.filter((r) => r.nota).map((r) => parseFloat(r.nota));
  const media = notas.length ? (notas.reduce((x, y) => x + y, 0) / notas.length).toFixed(2) : '—';

  const md = `# Google × o que está no ar — unidades A Fórmula

> Coletado em ${regs[0]?.coletadoEm || '—'} · **documento de leitura. Nada foi alterado**
> no cadastro, nas páginas ou no ar.
> Fonte: perfil público de cada unidade no Google Maps (sessão logada, janela real —
> é a única combinação que entrega os 7 dias).
> "No ar" = \`lojas.json\`, que alimenta o mapa e os cards do /encontre-uma-loja.

## Resumo

| | |
|---|---|
| Unidades em operação consultadas | ${regs.length} |
| Perfil confirmado como A Fórmula | **${conf.length}** |
| Rejeitadas pela trava de nome | ${susp.length} |
| **Com a semana completa de horários** | **${comSemana.length}** |
| Sem horário publicado no perfil | ${semHora.length} |
| Nota média no Google | **${media}** (${notas.length} unidades) |
| Com foto no perfil | ${conf.filter((r) => (r.fotos || []).length).length} |

## 🔴 O horário publicado hoje não representa a rede

A página de unidade publica **${PUB.semana}** de segunda a sexta, **${PUB.sabado}** no sábado
e domingo fechado. Das ${comSemana.length} unidades com semana completa, **apenas ${batem.length} têm exatamente esse horário**.

Existem **${padroes.length} padrões semanais distintos** em ${comSemana.length} unidades — ou seja, não há horário de rede.

| Fato | Unidades |
|---|---|
| Abrem **antes das 8h** | ${cedo.length} |
| Abrem **no domingo** | ${domingo.length} |
| **Fecham para almoço** (dois turnos) | ${almoco.length} |
| Batem com o publicado | ${batem.length} |

${almoco.length ? `⚠️ As ${almoco.length} de dois turnos não cabem no formato publicado hoje, que assume horário corrido: ${almoco.map((r) => rotulo(r)).join('; ')}.` : ''}

### Padrões mais comuns

| Unidades | Seg–Sex | Sábado | Domingo |
|---|---|---|---|
${padroes.slice(0, 10).map(([, a]) => {
    const r = a[0];
    return `| ${a.length} | ${legivel(r.horarios['segunda-feira'])} | ${legivel(r.horarios['sábado'])} | ${legivel(r.horarios['domingo'])} |`;
  }).join('\n')}

### Horário real, unidade por unidade

| Unidade | Seg | Ter | Qua | Qui | Sex | Sáb | Dom |
|---|---|---|---|---|---|---|---|
${comSemana.map((r) => `| ${esc(rotulo(r))} | ${DIAS.map((d) => legivel(r.horarios[d])).join(' | ')} |`).join('\n')}

${semHora.length ? `**Sem horário no perfil do Google (${semHora.length}):** ${semHora.map((r) => esc(rotulo(r))).join(', ')}. Só o franqueado informa.` : ''}

## 🔴 O \`place_id\` do cadastro não é confiável

Medido em \`salvador-shopping-paralela\`: o \`place_id\` do cadastro aponta para o
**prédio** (\`Av. Luís Viana Filho, 8544\`, categoria *Edifício*), não para a loja.
Colher por ele traz a nota do **Shopping Paralela** (4,5 / 35.912 avaliações) no lugar
da farmácia (**4,2**).

Consequência no que está no ar: o \`sameAs\` da página de unidade, montado a partir
desse \`place_id\`, **aponta para o shopping** — ou seja, diz ao Google que a loja é
outro lugar. Documentado, **não alterado**.

## Telefone

**Telefone repetido entre unidades é esperado** — lojas do mesmo grupo usam o mesmo
call center (confirmado pelo operador em 17/08). Não é erro de cadastro.

| Número no cadastro | Unidades do grupo |
|---|---|
${grupos.map(([d, a]) => `| ${d} | **${a.length}** — ${a.map((r) => esc(rotulo(r))).join(', ')} |`).join('\n')}

### Onde o Google difere do cadastro (${divTel.length})

Não é contradição: o cadastro traz o número do **call center**, e o Google costuma
trazer o **fixo da loja**. São canais diferentes. Qual deve aparecer na página de
unidade é decisão do operador — **nada foi alterado**.

| Unidade | No ar (cadastro) | No Google |
|---|---|---|
${divTel.map((r) => `| ${esc(rotulo(r))} | ${esc(r.cadastro?.celular || r.cadastro?.telefone || '—')} | ${esc(r.telefoneGoogle)} |`).join('\n')}

## Endereço — número do logradouro diferente (${divEnd.length})

Comparado **só pelo número**: o Google reescreve bairro, abrevia logradouro e acrescenta
CEP, então comparar a string inteira dá falso positivo (48 de 70 "divergiam" só por
formatação). Número diferente é sinal forte.

${divEnd.length ? `| Unidade | No ar (cadastro) | No Google |
|---|---|---|
${divEnd.map((r) => `| ${esc(rotulo(r))} | ${esc(r.cadastro?.endereco || '—')} | ${esc(r.enderecoGoogle)} |`).join('\n')}` : '_(nenhuma)_'}

## Nota e avaliações — ativo que o site não usa

Nenhuma dessas avaliações aparece no site hoje. Nota média da rede: **${media}**.

| Unidade | Nota | Avaliações | Fotos no perfil |
|---|---|---|---|
${conf.filter((r) => r.nota).sort((a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0))
    .map((r) => `| ${esc(rotulo(r))} | ${r.nota} | ${r.avaliacoes || '—'} | ${(r.fotos || []).length} |`).join('\n')}

${susp.length ? `## ⚠️ Rejeitadas pela trava de nome (${susp.length})

A busca não chegou num perfil cujo nome comece com "A Fórmula", então **nada foi
gravado**. Precisam de conferência manual.

${susp.map((r) => `- ${esc(rotulo(r))} \`${r.slug}\``).join('\n')}

A trava é estrita de propósito: a versão anterior exigia só "fórmula" + "farmácia" e
**aceitaria concorrente** — o operador flagrou "Companhia da Fórmula Alecrim — Farmácia
de Manipulação" (anúncio patrocinado) aparecendo na busca.` : ''}

## Como foi coletado

- Entrada por **busca de nome**, não por \`place_id\` (que aponta para o prédio).
- O script **não clica no primeiro resultado**: procura o card cujo nome começa com
  "A Fórmula" e descarta card marcado como *Patrocinado*. Sem match, não clica.
- **Sessão logada em janela real.** Medido: headless (com ou sem login) recebe
  "visualização limitada" e só 1 dia; \`google.com/search\` devolve CAPTCHA.
- Fotos: só URLs registradas. **Nenhuma baixada ou usada.**
- Nota e nº de avaliações mudam sozinhos; valem para o dia da coleta.
`;

  const f = path.join(ROOT, 'RELATORIO-GOOGLE-vs-LIVE.md');
  fs.writeFileSync(f, md);
  console.log('escrito:', f);
  console.log(`${conf.length} confirmadas · ${comSemana.length} com semana completa · ${batem.length} batem com o publicado · ${padroes.length} padroes distintos · ${domingo.length} abrem domingo · ${almoco.length} fecham pra almoco`);
}

main();
