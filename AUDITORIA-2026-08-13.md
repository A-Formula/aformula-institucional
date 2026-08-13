# Auditoria do site institucional — 13/08/2026

> Escopo pedido pelo operador: botão flutuante do WhatsApp, velocidade, bugs, e medição de
> cliques no painel. Tudo abaixo foi **medido em produção** (`www.aformulabr.com.br`) ou em
> browser real contra o código local — nada é estimativa.

---

## Resumo

| | Antes | Depois | Como foi medido |
|---|---|---|---|
| Botão flutuante no blog | leva a **404** | leva a `/contato` (200) | clique real em post, Playwright |
| Botão flutuante para visitante recorrente | **nunca aparece** | aparece | comparação cache × servidor |
| Páginas sem botão flutuante | `/receita`, `/pet` | nenhuma | varredura nos 129 HTML |
| Peso da home | ~1,9 MB | **506 KB** | `performance.getEntriesByType` |
| Peso da /pet | ~1,75 MB | **1,26 MB** | idem |
| Cliques medidos no painel | nenhum | WhatsApp, telefone, FAB, CTA | aba nova `📊 Cliques` |

Nenhum asset quebrado em produção (varri 8 páginas + 1 post: **0 links 404**), brotli ativo em
todo texto, headers de segurança e cache corretos. O site está bem construído — os problemas
achados são pontuais, mas dois deles anulavam silenciosamente o CTA principal.

---

## 🔴 Bug 1 — O JavaScript do site fica congelado por até 1 ano no navegador de quem já visitou

**O mais grave, e explica por que você não estava vendo o botão.**

O `vercel.json` marcava tudo em `*_assets/` como `max-age=31536000, immutable` — "não pergunte de
novo por um ano". Isso está certo para imagem e fonte, cujo nome nunca muda de conteúdo. Mas
`a28.js`…`a32.js` **mudam de conteúdo mantendo o mesmo nome**. Resultado: quem visitou o site
antes de 12/08 continua rodando o JavaScript velho, e vai continuar por até 12 meses.

Medido no navegador, na home de produção:

```
cache do navegador : 2439 bytes — SEM o botão flutuante
servidor entrega   : 4328 bytes — COM o botão flutuante
```

O botão "Fale conosco" foi ao ar em 12/08 e **é invisível para todo visitante recorrente**. Vale
para qualquer correção de JS já enviada e para as futuras.

**Corrigido** (`vercel.json`): a regra `immutable` passou a valer só para mídia e fonte
(`webp|avif|jpg|jpeg|png|gif|svg|ico|woff2|woff|ttf|mp4|webm`); `js|css|json|map` passaram a
`max-age=0, must-revalidate` — o navegador confirma a cada visita e recebe `304` (algumas centenas
de bytes) quando nada mudou.

> ⚠️ **Regra que fica:** trocar uma **imagem** mantendo o nome tem o mesmo problema (o `immutable`
> continua lá, e deve continuar). Imagem nova = **nome novo**.

---

## 🔴 Bug 2 — O botão flutuante levava a 404 nos 118 posts do blog

`index_assets/a28.js` montava o botão com `href` **relativo**:

```js
fab.href = "contato.html";
```

Em `/blog/saude/{slug}` isso resolve para `/blog/saude/contato.html` → `308` → `/blog/saude/contato`
→ **404**. Confirmado em produção. O blog é a maior superfície de tráfego orgânico do site (118
posts indexados), e o CTA principal dele apontava para a página de erro.

**Corrigido:** `fab.href = "/contato"` (absoluto). Verificado com clique real num post: agora
navega para `/contato`, status 200.

---

## 🟠 Bug 3 — `/receita` e `/pet` nunca tiveram o botão

O handoff de 12/08 registrou o FAB como presente em "todas as páginas". Varrendo os arquivos:
`receita.html` e `pet.html` **não carregam** `a28.js`, então nunca tiveram botão nenhum.
`/receita` ("como manipular sua receita") é justamente uma página de alta intenção de compra.

Não dava para simplesmente incluir o `a28.js` nelas: as duas têm script próprio de menu e
scroll-reveal, e o `a28` faria o *toggle* do menu mobile duas vezes por clique (menu que não abre).

**Corrigido** extraindo o que é universal para `index_assets/af-contato.v1.js` (botão + medição),
agora incluído em **todas as 129 páginas** (11 na raiz + 118 posts) e no template do blog, com
trava contra dupla inclusão. Verificado que o menu mobile de `/receita` continua abrindo e
fechando corretamente.

---

## 🟠 Bug 4 (meu, pego no teste) — colisão de nome em `a28.js`

Ao escrever a medição, nomeei a função `track()`. O arquivo **já tinha** `var track =
document.getElementById("blogTrack")` (o carrossel). A declaração de função é içada, o `var`
reatribui depois, e em toda página sem carrossel o valor virava `null` — `TypeError: track is not
a function` em cada clique. Só apareceu porque testei com clique real em vez de confiar na
sintaxe. Renomeado para `enviarClique`. Fica registrado porque o padrão pode se repetir: **esses
arquivos são IIFEs longas com escopo único e nomes genéricos**.

---

## ⚡ Performance

### Medição de produção (antes)

| Página | HTML | Assets | Total | Requests |
|---|---|---|---|---|
| `/` | 120 KB | 1.830 KB | **1.950 KB** | 18 |
| `/blog` | 159 KB | 1.961 KB | **2.120 KB** | 15 |
| `/pet` | 122 KB | 1.624 KB | **1.747 KB** | 37 |
| `/sobre-nos` | 92 KB | 895 KB | 987 KB | 13 |
| `/encontre-uma-loja` | 160 KB | 133 KB | 293 KB | 6 |
| `/contato` | 93 KB | 66 KB | 159 KB | 6 |

### Causa

As capas do blog estavam em **JPEG 2688×1536** (250–570 KB cada) e apareciam nos cards a **~300 px**
— arquivo **14× maior** que o exibido, ~200× em número de pixels. Cinco delas no carrossel da home
somavam **1,53 MB dos 1,83 MB** de assets da página.

### O que foi feito

Gerados dois derivados WebP por capa (ffmpeg, qualidade 80):

| | tamanho | uso |
|---|---|---|
| `{slug}.webp` | 1600 px | hero do artigo (largura total) |
| `{slug}-thumb.webp` | 800 px | cards da home e da listagem |

Total das 6 capas: **2.139 KB → 122 KB em thumb** (−94%). Mais 7 imagens da `/pet`
(`pet-benef-*`, `pet-depo-*`): **767 KB → 323 KB**.

O build **regenera** os cards a partir do Firestore, então editar só o HTML seria desfeito no
próximo deploy. Por isso a preferência pelo derivado foi colocada **no build**:

- `scripts/build-site.mjs` → `derivado()`, `capaCard()`, `capaHero()`
- `scripts/cms-pages.mjs` → `preferirWebp()` nos dois pontos onde o CMS reescreve `src` de imagem

Os dois só trocam quando o `.webp` **existe no disco** e caem no original quando não existe — capa
nova publicada pelo painel continua funcionando no mesmo dia, mesmo antes de alguém gerar os
derivados. Comando para gerar novos está comentado no `build-site.mjs`.

### Resultado medido (browser real)

| Página | Antes | Depois |
|---|---|---|
| `/` | ~1,9 MB | **506 KB** (−74%) |
| `/pet` | ~1,75 MB | **1,26 MB** (−28%) |

LCP da home em produção: 376 ms. CLS: 0,001.

### O que eu decidi NÃO fazer, e por quê

- **`width`/`height` nas imagens.** 37 imagens da `/pet` não têm dimensão declarada — o manual diz
  que isso causa layout shift. **Medi antes de mexer: CLS da `/pet` = 0,0002** (o limite do Google é
  0,1). O CSS já reserva as caixas. Mexer em 37 imagens resolveria um problema que não existe.
- **`defer` nos 5 scripts da home.** Eles já ficam no fim do `<body>`, então quase não bloqueiam. E
  há dependência de ordem documentada no próprio HTML (o `news-backend` precisa rodar **antes** do
  `a28.js`); `defer` mudaria essa ordem. Risco maior que o ganho.
- **`pet-hero-desktop.webp` (337 KB).** É hero em largura total e já está em WebP no tamanho certo;
  recomprimir arriscaria qualidade visível por pouco byte.

---

## 📊 Medição de cliques (novo)

Você pediu para medir **quantas pessoas clicam**, além dos leads. Agora existe.

### Por que não só GA4

O GA4 já está instalado com Consent Mode, mas (1) só conta quem aceita o cookie — subestima por um
fator desconhecido — e (2) o número não chega ao painel, que é onde a equipe olha. A solução grava
**contador próprio** e dispara **o evento GA4** também: as duas leituras.

### O que é capturado

| Evento | O que é |
|---|---|
| `clique_whatsapp` | qualquer link `wa.me`/`api.whatsapp.com` — inclusive **os cards da Encontre uma loja, com o nome da unidade** |
| `clique_telefone` | links `tel:` |
| `clique_fab_contato` | botão flutuante "Fale conosco" |
| `clique_cta` | qualquer link marcado com `data-track="nome"` no HTML |

O nome da unidade sai do card/popup clicado — é o que dá sentido ao número. "WhatsApp: 300" não
diz nada; "WhatsApp da unidade Curitiba - Batel: 300" diz. Testado: clique real num card devolveu
`clique_whatsapp / "Rio Branco - AC"`.

### Como funciona

- **Coleta:** `index_assets/af-contato.v1.js`, listener delegado em captura no `document` (pega
  também os links que o mapa cria depois do load). Envia por `sendBeacon`, que sobrevive à
  navegação que o próprio clique dispara.
- **Gravação:** `api/track.js` → Firestore, coleção `clicks`, **um doc por dia por evento**
  (`2026-08-13__clique_whatsapp`), com `total`, `rotulos{}` e `paginas{}` por `FieldValue.increment`.
  Allowlist fechada de eventos (o endpoint é público por necessidade), rate limit de 60/10 min por
  IP, e sempre responde `204`.
- **Leitura:** aba **`📊 Cliques`** no painel — total do período (7/30/90 dias), por canal, WhatsApp
  por unidade, páginas que mais geram clique, e exportação CSV.
- **Regras:** `firestore.rules` → `clicks` é leitura só de admin, escrita bloqueada no cliente (só
  a API escreve, via admin SDK).

### LGPD

Grava apenas contador agregado: nome do evento, um rótulo e o path. **Sem IP, sem cookie, sem
identificador, sem user-agent.** Não é dado pessoal — não depende de consentimento e não há o que
exportar ou apagar a pedido de titular. O IP é usado em memória só para o rate limit e nunca é
persistido.

A aba foi renderizada com dados simulados antes de entregar: somas conferidas, estado vazio
tratado, zero erro de JS.

---

## Higiene (sem ação urgente)

- **`a21.jpg`…`a25.jpg`** em `index_assets/` — 861 KB, **nenhuma referência em nenhum HTML**. São
  arquivos órfãos. Não pesam na rede (ninguém baixa), só no repositório. Não apaguei: deleção é
  irreversível e é sua chamada.
- **`Telas - Visao Geral (standalone).html`** — 19 MB no repositório. Verifiquei: **não está
  acessível em produção** (404). Só peso local.
- **CSS morto `.tw-fab`/`.tw-panel`** em 8 páginas — o painel de "tweaks" de tema (shape/densidade)
  foi removido do HTML, mas o CSS ficou. Poucos KB, dentro do HTML comprimido. Cosmético.
- **`aformula-site-institucional-2026-07-15.zip`** e **`ACESSOS.md`** — confirmei que **não são
  servidos** em produção (404). OK.

---

## Verificar depois do deploy

O único item que não dá para provar localmente é o cache, porque depende do header que a Vercel
emite. Depois de publicar:

```bash
# deve responder max-age=0, must-revalidate (e NÃO immutable)
curl -sI https://www.aformulabr.com.br/index_assets/af-contato.v1.js | grep -i cache-control
# imagem deve continuar immutable
curl -sI https://www.aformulabr.com.br/index_assets/a1.webp | grep -i cache-control
```

Depois disso, clicar no botão flutuante em produção e conferir se a aba `📊 Cliques` do painel sai
do zero.

---

## Arquivos alterados

| Arquivo | O quê |
|---|---|
| `vercel.json` | cache: `immutable` só para mídia; JS/CSS revalidam |
| `index_assets/af-contato.v1.js` | **novo** — botão flutuante + medição de cliques |
| `index_assets/a28.js` | bloco do FAB removido (foi para o arquivo acima) |
| `api/track.js` | **novo** — endpoint de contador |
| `firestore.rules` | coleção `clicks` (leitura de admin, escrita bloqueada) |
| `admin/index.html` | aba `📊 Cliques` + item no menu + rota |
| `scripts/build-site.mjs` | preferência por WebP nas capas + script no template do blog |
| `scripts/cms-pages.mjs` | `preferirWebp()` — impede o CMS de desfazer a otimização |
| `index.html`, `pet.html` | `src` das imagens para WebP |
| 129 HTML (11 raiz + 118 posts) | inclusão do `af-contato.v1.js` |
| `blog_assets/seo/*.webp` | **novos** — 12 derivados (6 hero + 6 thumb) |
| `pet_assets/pet-{benef,depo}-*.webp` | **novos** — 7 derivados |
