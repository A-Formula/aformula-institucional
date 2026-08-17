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

// Os campos que FALTAM. Esta lista é a fonte única: alimenta a ficha,
// o e-mail e o formulário de cadastro. Mudou aqui, mudou nos três.
const PEDIDOS = [
  ['Horário de funcionamento', 'segunda a sexta, sábado, domingo e feriados — hoje o site usa um horário genérico de referência'],
  ['Farmacêutico(a) responsável', 'nome completo + número do CRF (exigência de conteúdo de saúde no Google)'],
  ['Foto da fachada', 'foto atual, de dia, mostrando o letreiro'],
  ['Foto do interior', 'balcão ou área de atendimento'],
  ['Link do Perfil do Google', 'o endereço do perfil da unidade no Google Meu Negócio'],
  ['WhatsApp oficial', 'confirmar se o número do cadastro é o que atende hoje'],
  ['Endereço conferido', 'com bairro e complemento (sala, piso, quadra)'],
  ['CEP', 'confirmar'],
  ['Ponto de referência', 'ex.: "em frente ao Shopping X", "ao lado da agência Y"'],
  ['Manipulação veterinária (Pet)', 'esta unidade atende? sim/não'],
  ['Entrega / retirada', 'faz entrega? em quais bairros ou cidades?'],
  ['Formas de pagamento', 'cartão, PIX, parcelamento'],
  ['Estacionamento e acessibilidade', 'tem estacionamento? acesso para cadeirante?'],
  ['Instagram da unidade', 'se a loja tiver perfil próprio'],
  ['Data de inauguração', 'para a linha do tempo da rede'],
  ['Franqueado(a) responsável', 'nome e contato interno'],
];

function ficha(u) {
  const rot = rotulo(u);
  const slug = u.slug;
  const ativa = aberta(u);
  const pagina = ativa ? `${SITE}/encontre-uma-loja/${slug}` : null;

  const tags = ['a-formula', 'unidade', 'ficha-cadastral', norm(u.estado)]
    .filter(Boolean).join(', ');

  const aliases = [...new Set([u.nome, `A Fórmula ${rot}`, rot].filter(Boolean))]
    .map((a) => `"${a.replace(/"/g, "'")}"`).join(', ');

  const pedidos = PEDIDOS.map(([campo, det]) => `- [ ] **${campo}** — ${det}`).join('\n');

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

## ⬜ O que falta para a ficha ficar completa

${pedidos}

<!-- AUTO:FIM -->`;

  return `---
date: ${HOJE}
tags: [${tags}]
aliases: [${aliases}]
status: ${ativa ? 'ativo' : 'em-breve'}
cidade: ${u.cidade || ''}
estado: ${u.estado || ''}
slug: ${slug}
cadastro: incompleto
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

function atualiza(existente, nova) {
  const ini = '<!-- AUTO:INICIO';
  const fim = '<!-- AUTO:FIM -->';
  const a1 = existente.indexOf(ini), a2 = existente.indexOf(fim);
  const b1 = nova.indexOf(ini), b2 = nova.indexOf(fim);
  if (a1 === -1 || a2 === -1) return null; // nota sem bloco: não mexe
  return existente.slice(0, a1) + nova.slice(b1, b2 + fim.length) + existente.slice(a2 + fim.length);
}

function moc(lojas) {
  const porEstado = {};
  for (const u of lojas) (porEstado[u.estado] = porEstado[u.estado] || []).push(u);
  const estados = Object.keys(porEstado).sort();
  const blocos = estados.map((uf) => {
    const linhas = porEstado[uf]
      .sort((a, b) => rotulo(a).localeCompare(rotulo(b), 'pt-BR'))
      .map((u) => `| [[${u.slug}\\|${rotulo(u)}]] | ${aberta(u) ? '✅' : '🚧 em breve'} | ${cel(u.celular || u.telefone)} | ${u.cep ? '✅' : '⬜'} |`)
      .join('\n');
    return `### ${uf} (${porEstado[uf].length})\n\n| Unidade | Situação | WhatsApp | CEP |\n|---|---|---|---|\n${linhas}`;
  }).join('\n\n');

  const abertas = lojas.filter(aberta).length;
  return `---
date: ${HOJE}
tags: [a-formula, unidade, moc, ficha-cadastral]
aliases: ["Unidades A Fórmula", "MOC Unidades"]
status: ativo
---
# MOC — Unidades A Fórmula

> Índice das ${lojas.length} unidades do cadastro: **${abertas} em operação** e
> **${lojas.length - abertas} em breve**. Cada ficha espelha o que alimenta a página
> da unidade no site. Parte de [[a-formula-farmacia]] · site em [[site-institucional]].

## Cobertura do cadastro hoje

| Campo | Preenchido |
|---|---|
| Endereço e coordenada | ${lojas.filter((u) => u.endereco && u.lat != null).length}/${lojas.length} |
| WhatsApp (celular) | ${lojas.filter((u) => val(u.celular)).length}/${lojas.length} |
| Telefone fixo | ${lojas.filter((u) => val(u.telefone)).length}/${lojas.length} |
| E-mail | ${lojas.filter((u) => val(u.email)).length}/${lojas.length} |
| CEP | ${lojas.filter((u) => val(u.cep)).length}/${lojas.length} |
| Google place_id | ${lojas.filter((u) => val(u.place_id)).length}/${lojas.length} |
| **Horário de funcionamento** | **0/${lojas.length}** |
| **Farmacêutico responsável** | **0/${lojas.length}** |
| **Foto da unidade** | **0/${lojas.length}** |

Os três últimos são o que trava a página de unidade de virar ativo de busca:
horário alimenta o painel do Google, farmacêutico é exigência de conteúdo de saúde,
e foto é o que o Google mais favorece em resultado local.

## Unidades por estado

${blocos}

## Log

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
