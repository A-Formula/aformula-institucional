// build-fichas-sb.mjs — ficha cadastral de cada unidade no Second Brain
//
// Destino: ../Second-Brain/TRABALHO/a-formula/unidades/{slug}.md  (+ MOC-unidades.md)
// Fonte:   encontre-uma-loja_assets/lojas.json
//
// A ficha é o ESPELHO do que alimenta /encontre-uma-loja/{slug}. O que está
// preenchido veio do cadastro; o que está em branco é o que falta coletar —
// a mesma lista que vai no e-mail e no formulário.
//
// IDEMPOTENTE COM CUIDADO: se a nota já existe, só reescreve o bloco entre
// <!-- AUTO:INICIO --> e <!-- AUTO:FIM -->. Tudo que o operador escreveu fora
// desse bloco é preservado. Nota nova nasce com o esqueleto completo.
//
// Uso: node scripts/build-fichas-sb.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
// path-agnostic: o vault é irmão da pasta OCTO
const VAULT = path.resolve(ROOT, '..', '..', '..', '..', '..', 'Second-Brain');
const DEST = path.join(VAULT, 'TRABALHO', 'a-formula', 'unidades');
const HOJE = '2026-08-17';
const SITE = 'https://www.aformulabr.com.br';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const aberta = (u) => !/em breve/i.test(`${u.nome} ${u.slug}`);

function distintivo(u) {
  const nome = String(u.nome || '').trim();
  const cidade = String(u.cidade || '').trim();
  if (!nome) return null;
  if (!norm(nome).includes(norm(cidade))) return nome;
  const resto = nome.split(/\s+[–—-]\s+/).slice(1).join(' — ')
    .replace(/\s*\|\s*/g, ' — ').replace(/\s+/g, ' ').trim();
  return resto || null;
}
const rotulo = (u) => { const d = distintivo(u); return d ? `${u.cidade} — ${d}` : u.cidade; };

const val = (v) => (v == null || v === '' ? '' : String(v).trim());
const cel = (v) => (val(v) ? val(v) : '—');

// Campos que o GOOGLE já respondeu (coleta 2026-08-17) — falta só CONFIRMAR com a
// unidade, não levantar do zero. Marcados na ficha conforme a coleta trouxe ou não.
const DO_GOOGLE = [
  ['Horário de funcionamento', 'semana completa', (g) => g?.diasCapturados === 7],
  ['Telefone da loja', 'o Google costuma trazer o fixo; o cadastro traz o call center', (g) => !!g?.telefoneGoogle],
  ['Endereço conferido', 'com bairro e CEP', (g) => !!g?.enderecoGoogle],
  ['Link do Perfil do Google', 'endereço do perfil', (g) => !!g?.urlPerfil],
  ['Foto da unidade', 'fotos existem no perfil (URLs registradas, nada baixado)', (g) => (g?.fotos || []).length > 0],
];

// Campos que SÓ a unidade tem. Esta lista é a fonte única do e-mail e do formulário.
const PEDIDOS = [
  ['Farmacêutico(a) responsável', 'nome completo + número do CRF (exigência de conteúdo de saúde no Google)'],
  ['Confirmar o horário', 'o do Google pode estar desatualizado — e feriados nunca aparecem lá'],
  ['WhatsApp que atende', 'o cadastro traz o call center do grupo; confirmar se é por ele que o cliente deve falar'],
  ['Ponto de referência', 'ex.: "em frente ao Shopping X", "ao lado da agência Y"'],
  ['Manipulação veterinária (Pet)', 'esta unidade atende? sim/não'],
  ['Entrega / retirada', 'faz entrega? em quais bairros ou cidades?'],
  ['Formas de pagamento', 'cartão, PIX, parcelamento'],
  ['Estacionamento e acessibilidade', 'tem estacionamento? acesso para cadeirante?'],
  ['Instagram da unidade', 'se a loja tiver perfil próprio'],
  ['Data de inauguração', 'para a linha do tempo da rede'],
  ['Franqueado(a) responsável', 'nome e contato interno'],
];

const DIAS = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
// "08:00–12:0014:00–18:00" → "08:00–12:00 e 14:00–18:00"
const legivel = (h) => String(h || '—').replace(/(\d{2}:\d{2})(\d{2}:\d{2})/g, '$1 e $2');

function leColeta(slug) {
  const f = path.join(ROOT, '_coleta-google', `${slug}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function ficha(u) {
  const rot = rotulo(u);
  const slug = u.slug;
  const ativa = aberta(u);
  const pagina = ativa ? `${SITE}/encontre-uma-loja/${slug}` : null;

  const tags = ['a-formula', 'unidade', 'ficha-cadastral', norm(u.estado)]
    .filter(Boolean).join(', ');

  const aliases = [...new Set([u.nome, `A Fórmula ${rot}`, rot].filter(Boolean))]
    .map((a) => `"${a.replace(/"/g, "'")}"`).join(', ');

  const g = leColeta(slug);
  const pedidos = PEDIDOS.map(([campo, det]) => `- [ ] **${campo}** — ${det}`).join('\n');
  const doGoogle = DO_GOOGLE.map(([campo, det, tem]) =>
    `- [${tem(g) ? 'x' : ' '}] **${campo}** — ${tem(g) ? `coletado do Google em ${g.coletadoEm}` : '❌ não veio na coleta'} · ${det}`
  ).join('\n');

  // bloco do que o Google publica hoje
  let blocoGoogle;
  if (!g) {
    blocoGoogle = '_Sem coleta do Google para esta unidade._';
  } else if (!g.confere) {
    blocoGoogle = `⚠️ **Coleta rejeitada pela trava de nome em ${g.coletadoEm}.** A busca no Maps não
chegou num perfil cujo nome comece com "A Fórmula" (devolveu: \`${g.nomeGoogle || '—'}\`),
então **nada foi aproveitado**. A trava é estrita de propósito: a versão frouxa aceitaria
concorrente ("Companhia da Fórmula Alecrim — Farmácia de Manipulação").
**Esta unidade precisa de conferência manual no Google.**`;
  } else {
    const semana = g.diasCapturados === 7
      ? `| Dia | Horário |\n|---|---|\n${DIAS.map((d) => `| ${d} | ${legivel(g.horarios[d])} |`).join('\n')}`
      : '_O perfil desta unidade **não publica horário** no Google._';
    const telDif = g.telefoneGoogle && cel(u.celular || u.telefone) !== '—' &&
      String(g.telefoneGoogle).replace(/\D/g, '') !== String(u.celular || u.telefone).replace(/\D/g, '');
    blocoGoogle = `Perfil: ${g.urlPerfil || '—'}
Coletado em **${g.coletadoEm}** · nota **${g.nota || '—'}**${g.avaliacoes ? ` de ${g.avaliacoes} avaliações` : ''} · ${(g.fotos || []).length} foto(s) no perfil.

**Nome no Google:** ${g.nomeGoogle || '—'}
**Endereço no Google:** ${g.enderecoGoogle || '—'}
**Telefone no Google:** ${g.telefoneGoogle || '—'}${telDif ? ` ⚠️ diferente do cadastro (${u.celular || u.telefone}) — o cadastro traz o **call center do grupo**, o Google traz o fixo da loja. Não é erro; é decisão de qual canal publicar.` : ''}

**Horário de funcionamento no Google:**

${semana}`;
  }

  const auto = `<!-- AUTO:INICIO — bloco gerado por scripts/build-fichas-sb.mjs. Editar FORA daqui. -->

## Dados no cadastro hoje

Origem: \`encontre-uma-loja_assets/lojas.json\` (o mesmo que alimenta o mapa e a página da unidade).

| Campo | Valor |
|---|---|
| Nome no cadastro | ${cel(u.nome)} |
| Cidade / Estado | ${cel(u.cidade)} — ${cel(u.estado)} |
| Endereço | ${cel(u.endereco)} |
| CEP | ${cel(u.cep)} |
| Telefone | ${cel(u.telefone)} |
| Celular / WhatsApp | ${cel(u.celular)} |
| E-mail | ${cel(u.email)} |
| Coordenada | ${u.lat != null ? `${u.lat}, ${u.lng}` : '—'} |
| Google place_id | ${cel(u.place_id)} |
| ID interno | ${cel(u.id)} |
| Situação | ${ativa ? 'Em operação' : '🚧 Em breve (não tem página no site)'} |

## Página no site

${pagina
    ? `${pagina}\n\nGerada por \`scripts/build-lojas.mjs\` no [[site-institucional]]. Ao completar os dados abaixo, rodar o gerador de novo e a página se atualiza sozinha.`
    : 'Ainda **não tem página** — unidades "em breve" não geram página, porque sem atendimento a página mentiria o horário e ofereceria WhatsApp. Quando inaugurar, tirar o "em breve" do cadastro e gerar.'}

## O que o Google publica hoje

${blocoGoogle}

## ✅ Já coletado do Google — falta confirmar com a unidade

${doGoogle}

## ⬜ Só a unidade tem — pedido por e-mail em ${HOJE}

${pedidos}

<!-- AUTO:FIM -->`;

  const estadoCadastro = !ativa ? 'nao-se-aplica'
    : (g && g.confere ? (g.diasCapturados === 7 ? 'parcial-com-google' : 'parcial-sem-horario')
      : 'sem-coleta');

  return `---
date: ${HOJE}
tags: [${tags}]
aliases: [${aliases}]
status: ${ativa ? 'ativo' : 'em-breve'}
cidade: ${u.cidade || ''}
estado: ${u.estado || ''}
slug: ${slug}
cadastro: ${estadoCadastro}
coleta_google: ${g ? (g.confere ? g.coletadoEm : `${g.coletadoEm} (rejeitada)`) : '-'}
horario_google: ${g && g.diasCapturados === 7 ? 'completo' : (g && g.confere ? 'ausente-no-perfil' : '-')}
---
# A Fórmula — ${rot}

> Ficha cadastral da unidade. É a fonte do que aparece na página dela no site
> institucional. Faz parte de [[a-formula-farmacia]] · índice em [[MOC-unidades]] ·
> site em [[site-institucional]].

${auto}

## Observações

_(espaço livre — o que for anotado aqui é preservado quando a ficha for regerada)_

## Log

- ${HOJE} — ficha criada a partir do \`lojas.json\`; dados que faltam levantados e enviados por e-mail.
`;
}

// Chaves de frontmatter que ESTE script controla. Qualquer outra que o operador
// tenha acrescentado à mão é preservada.
const CHAVES_AUTO = ['status', 'cadastro', 'coleta_google', 'horario_google', 'tags', 'aliases'];

function fm(txt) {
  const m = txt.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const linhas = m[1].split('\n');
  return { bruto: m[0], corpo: txt.slice(m[0].length), linhas };
}

function mesclaFrontmatter(existente, nova) {
  const a = fm(existente), b = fm(nova);
  if (!a || !b) return existente;
  const chave = (l) => (l.match(/^([a-z_]+):/i) || [])[1];
  const novasPorChave = {};
  for (const l of b.linhas) { const k = chave(l); if (k) novasPorChave[k] = l; }
  const saida = [];
  const vistas = new Set();
  for (const l of a.linhas) {
    const k = chave(l);
    if (k && CHAVES_AUTO.includes(k) && novasPorChave[k]) { saida.push(novasPorChave[k]); vistas.add(k); }
    else { saida.push(l); if (k) vistas.add(k); }
  }
  // chaves novas que a versão antiga não tinha
  for (const k of CHAVES_AUTO) if (!vistas.has(k) && novasPorChave[k]) saida.push(novasPorChave[k]);
  return `---\n${saida.join('\n')}\n---\n${a.corpo}`;
}

function atualiza(existente, nova) {
  const ini = '<!-- AUTO:INICIO';
  const fim = '<!-- AUTO:FIM -->';
  const a1 = existente.indexOf(ini), a2 = existente.indexOf(fim);
  const b1 = nova.indexOf(ini), b2 = nova.indexOf(fim);
  if (a1 === -1 || a2 === -1) return null; // nota sem bloco: não mexe
  const comBloco = existente.slice(0, a1) + nova.slice(b1, b2 + fim.length) + existente.slice(a2 + fim.length);
  return mesclaFrontmatter(comBloco, nova);
}

function moc(lojas) {
  const abertas = lojas.filter(aberta);
  const breve = lojas.filter((u) => !aberta(u));
  const cols = lojas.map((u) => ({ u, g: leColeta(u.slug) }));
  const comColeta = cols.filter((c) => c.g && c.g.confere);
  const rejeitadas = cols.filter((c) => c.g && !c.g.confere);
  const semColeta = cols.filter((c) => aberta(c.u) && !c.g);
  const comSemana = comColeta.filter((c) => c.g.diasCapturados === 7);
  const semHorario = comColeta.filter((c) => c.g.diasCapturados !== 7);

  const marca = (c) => {
    if (!aberta(c.u)) return '🚧 em breve';
    if (!c.g) return '⬜ sem coleta';
    if (!c.g.confere) return '⚠️ conferir à mão';
    return c.g.diasCapturados === 7 ? '✅ horário completo' : '🕒 perfil sem horário';
  };

  const porEstado = {};
  for (const c of cols) (porEstado[c.u.estado] = porEstado[c.u.estado] || []).push(c);
  const blocos = Object.keys(porEstado).sort().map((uf) => {
    const linhas = porEstado[uf]
      .sort((a, b) => rotulo(a.u).localeCompare(rotulo(b.u), 'pt-BR'))
      .map((c) => `| [[${c.u.slug}\\|${rotulo(c.u)}]] | ${marca(c)} | ${c.g?.nota || '—'} | ${(c.g?.fotos || []).length || '—'} | ${c.u.cep ? '✅' : '⬜'} |`)
      .join('\n');
    return `### ${uf} (${porEstado[uf].length})\n\n| Unidade | Mapeamento | Nota Google | Fotos | CEP |\n|---|---|---|---|---|\n${linhas}`;
  }).join('\n\n');

  const lista = (arr) => arr.length ? arr.map((c) => `[[${c.u.slug}\\|${rotulo(c.u)}]]`).join(' · ') : '_(nenhuma)_';

  return `---
date: ${HOJE}
tags: [a-formula, unidade, moc, ficha-cadastral]
aliases: ["Unidades A Fórmula", "MOC Unidades"]
status: ativo
coleta_google: ${HOJE}
---
# MOC — Unidades A Fórmula

> Índice das ${lojas.length} unidades do cadastro: **${abertas.length} em operação** e
> **${breve.length} em breve**. Cada ficha espelha o que alimenta a página da unidade
> no site. Parte de [[a-formula-farmacia]] · site em [[site-institucional]].

## Onde o mapeamento está — ${HOJE}

| | Unidades |
|---|---|
| No cadastro | **${lojas.length}** |
| Em operação (viram página) | **${abertas.length}** |
| Em breve (não viram página) | ${breve.length} |
| **Perfil do Google confirmado** | **${comColeta.length}** de ${abertas.length} |
| ↳ com **semana completa de horário** | **${comSemana.length}** |
| ↳ perfil **sem horário publicado** | ${semHorario.length} |
| Coleta rejeitada — conferir à mão | ${rejeitadas.length} |
| Ainda sem nenhuma coleta | ${semColeta.length} |
| Com foto no perfil do Google | ${comColeta.filter((c) => (c.g.fotos || []).length).length} |

## O que ainda falta

**⚠️ Conferência manual no Google (${rejeitadas.length}):** a busca não chegou num perfil cujo
nome comece com "A Fórmula", então nada foi aproveitado.
${lista(rejeitadas)}

**🕒 Perfil sem horário publicado (${semHorario.length}):** só o franqueado informa.
${lista(semHorario)}

${semColeta.length ? `**⬜ Sem coleta (${semColeta.length}):**\n${lista(semColeta)}\n` : ''}
**👤 Farmacêutico responsável: 0 de ${abertas.length}.** Nenhuma unidade tem. É exigência do Google
para conteúdo de saúde (YMYL) e não existe em fonte pública — só a unidade informa.

**📸 Foto própria: 0 de ${abertas.length} baixadas.** ${comColeta.filter((c) => (c.g.fotos || []).length).length} unidades **têm** foto no perfil do Google,
mas só as URLs foram registradas — nenhuma imagem foi baixada nem usada.

## Cobertura do cadastro (\`lojas.json\`)

| Campo | Preenchido |
|---|---|
| Endereço e coordenada | ${lojas.filter((u) => u.endereco && u.lat != null).length}/${lojas.length} |
| WhatsApp (celular) | ${lojas.filter((u) => val(u.celular)).length}/${lojas.length} |
| Telefone fixo | ${lojas.filter((u) => val(u.telefone)).length}/${lojas.length} |
| E-mail | ${lojas.filter((u) => val(u.email)).length}/${lojas.length} |
| CEP | ${lojas.filter((u) => val(u.cep)).length}/${lojas.length} |
| Google place_id | ${lojas.filter((u) => val(u.place_id)).length}/${lojas.length} ⚠️ **não confiável** |
| **Horário de funcionamento** | **0/${lojas.length}** |
| **Farmacêutico responsável** | **0/${lojas.length}** |

⚠️ O \`place_id\` do cadastro **não é da loja** em pelo menos um caso medido
(\`salvador-shopping-paralela\` aponta para o prédio, e traz a nota do shopping).
Por isso a coleta entra por busca de nome, não por ele.

## Unidades por estado

${blocos}

## Log

- ${HOJE} — **coleta do Google dobrada nas fichas**: ${comColeta.length} perfis confirmados,
  ${comSemana.length} com semana completa de horário. Relatório comparativo em
  \`site-institucional/RELATORIO-GOOGLE-vs-LIVE.md\`. Nada alterado no ar.
- ${HOJE} — MOC e ${lojas.length} fichas criadas a partir do \`lojas.json\`.
`;
}

function main() {
  const dry = process.argv.includes('--dry');
  const lojas = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets', 'lojas.json'), 'utf8')
  );

  if (!fs.existsSync(VAULT)) {
    console.error('[fichas] vault nao encontrado em:', VAULT);
    process.exit(1);
  }
  console.log('[fichas] destino:', DEST);
  if (!dry) fs.mkdirSync(DEST, { recursive: true });

  let novas = 0, atualizadas = 0, intactas = 0;
  for (const u of lojas) {
    if (!u.slug) { console.warn('[fichas] sem slug:', u.nome); continue; }
    const f = path.join(DEST, `${u.slug}.md`);
    const nova = ficha(u);
    if (fs.existsSync(f)) {
      const antiga = fs.readFileSync(f, 'utf8');
      const merged = atualiza(antiga, nova);
      if (merged == null) { intactas++; continue; }
      if (merged !== antiga) { if (!dry) fs.writeFileSync(f, merged); atualizadas++; }
      else intactas++;
    } else {
      if (!dry) fs.writeFileSync(f, nova);
      novas++;
    }
  }
  const fMoc = path.join(DEST, 'MOC-unidades.md');
  if (!dry) fs.writeFileSync(fMoc, moc(lojas));

  console.log(`[fichas] ${novas} nova(s) · ${atualizadas} atualizada(s) · ${intactas} intacta(s) · MOC-unidades.md`);
  if (dry) console.log('[fichas] --dry: nada foi escrito');
}

main();
