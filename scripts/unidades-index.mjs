// unidades-index.mjs — ÍNDICE ESTÁTICO das unidades. Fonte única de verdade para:
//   1) a lista em HTML no fim de /encontre-uma-loja
//   2) o bloco de unidades do /llms.txt
//
// POR QUE ISSO EXISTE (medido em 2026-08-18, com as 75 páginas já no ar):
// /encontre-uma-loja tinha **0** links estáticos para as unidades — o trilho de cards é
// montado por JS a partir do lojas.json. O Google executa JS e acha; GPTBot, ClaudeBot e
// PerplexityBot NÃO executam. Para eles o mapa é uma página vazia e as 75 unidades só
// existiam no sitemap. A malha unidade→unidade já era boa (4 links por página): o que
// faltava era a PORTA de entrada.
//
// Regra de dado: só entra unidade ABERTA — a mesma regra do gerador de páginas
// (/em breve/i sobre o nome). "Em breve" não tem página, então não pode ter link.

import fs from 'node:fs';
import path from 'node:path';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const E = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const aberta = (u) => !/em breve/i.test(`${u.nome} ${u.slug}`);

// Mesmo rótulo do gerador de páginas: "Salvador — Shopping Paralela".
// Duplicado de propósito? Não: build-lojas.mjs tem a sua cópia porque monta o <h1> e o
// schema; aqui só se rotula link. Se divergirem, o sintoma é rótulo diferente entre a
// lista e o <h1> da página — barato de ver, e o teste de coerência abaixo pega.
export function rotulo(u) {
  const nome = String(u.nome || '').trim();
  const cidade = String(u.cidade || '').trim();
  let d = null;
  if (nome && !norm(nome).includes(norm(cidade))) d = nome;
  else if (nome) {
    d = nome.split(/\s+[–—-]\s+/).slice(1).join(' — ')
      .replace(/\s*\|\s*/g, ' — ').replace(/\s+/g, ' ').trim() || null;
  }
  return d ? `${cidade} — ${d}` : cidade;
}

export function unidades(ROOT) {
  const lojas = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'encontre-uma-loja_assets', 'lojas.json'), 'utf8')
  );
  return lojas.filter(aberta)
    .filter((u) => u.slug && u.lat != null && u.lng != null)   // sem coordenada não há página
    .map((u) => ({ slug: u.slug, uf: u.estado, cidade: u.cidade, rot: rotulo(u) }))
    .sort((a, b) => (a.uf === b.uf
      ? a.rot.localeCompare(b.rot, 'pt-BR')
      : String(a.uf).localeCompare(String(b.uf), 'pt-BR')));
}

const porUf = (us) => us.reduce((m, u) => ((m[u.uf] = m[u.uf] || []).push(u), m), {});

// ---------- 1) lista em HTML ----------
export function html(us) {
  const g = porUf(us);
  const blocos = Object.keys(g).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((uf) => `
          <div class="unidades-uf">
            <h3>${E(uf)}</h3>
            <ul>
${g[uf].map((u) => `              <li><a href="/encontre-uma-loja/${E(u.slug)}">${E(u.rot)}</a></li>`).join('\n')}
            </ul>
          </div>`).join('');

  // <details> FECHADO por padrão: o operador achou a lista aberta feia e comprida.
  //
  // SEM CONTAGEM em lugar nenhum (decisão do operador 2026-08-18): o cadastro não tem
  // todas as lojas, então qualquer número publicado — total ou por estado — sai errado.
  // A copy do site diz "mais de 100 unidades", que é claim de faixa e não colide.
  //
  // POR QUE NÃO "só para o Google/IA": servir conteúdo ao robô e esconder do visitante é
  // cloaking — viola a diretriz do Google e o risco é penalidade no site inteiro, não um
  // ganho. Já <details> é legítimo e resolve os dois lados: o conteúdo ESTÁ no HTML (o
  // crawler lê sem clicar em nada, é a mesma resposta do servidor) e o visitante vê uma
  // linha só. O Google documenta que conteúdo em acordeão/aba é indexado normalmente.
  return `<section class="unidades-indice" aria-labelledby="todas-unidades">
      <div class="container">
        <details class="unidades-det">
          <summary id="todas-unidades">
            <span class="unidades-det__t">Todas as unidades, por estado</span>
            <span class="unidades-det__h">endereço, horário e WhatsApp de cada loja</span>
          </summary>
          <div class="unidades-grid">${blocos}
          </div>
        </details>
      </div>
    </section>`;
}

// ---------- 2) bloco do llms.txt ----------
export function llms(us, BASE) {
  const g = porUf(us);
  const linhas = Object.keys(g).sort((a, b) => a.localeCompare(b, 'pt-BR')).flatMap((uf) =>
    g[uf].map((u) => `- [A Fórmula ${u.rot} (${uf})](${BASE}/encontre-uma-loja/${u.slug}): ` +
      `endereço, horário de atendimento, telefone e WhatsApp da unidade de ${u.cidade}.`));
  // SEM contagem: o cadastro não tem todas as lojas, então número publicado é número errado
  return `## Unidades

` +
    `Cada unidade da rede tem página própria com endereço verbatim do cadastro, horário ` +
    `publicado no Perfil do Google da unidade (quando a unidade o publica), telefone e ` +
    `WhatsApp próprios.

` +
    linhas.join('\n') + '\n';
}

// Substitui o trecho entre marcadores. Idempotente: rodar N vezes dá o mesmo arquivo.
export function entreMarcadores(texto, ini, fim, novo) {
  const a = texto.indexOf(ini), b = texto.indexOf(fim);
  if (a < 0 || b < 0 || b < a) return null;
  return texto.slice(0, a + ini.length) + '\n' + novo + '\n' + texto.slice(b);
}
