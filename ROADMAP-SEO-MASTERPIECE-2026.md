# ROADMAP — Site Institucional A Fórmula · SOTA 2026 Masterpiece

> Objetivo: transformar o site institucional num ativo de **aquisição orgânica**, bem posicionado
> no Google e nas buscas por IA (GEO), com **rastreabilidade total** de conversão.
> Base: auditoria técnica 2026-07-22. Comparativo derivado da proposta Domatech (recusar site, avaliar SEO).

---

## 0. ESTADO ATUAL — o que já é forte (não mexer, só evoluir)

- Stack: estático + Vercel Functions + Firebase/Firestore (JAMstack). Zero manutenção, seguro.
- Segurança: CSP completa, HSTS preload, X-Frame-Options, nosniff, Permissions-Policy. **Acima de um WP padrão.**
- Formulários funcionando: contato, newsletter, prescritor (+ reCAPTCHA + Nodemailer + Firestore).
- CMS visual próprio (`admin/editor.html`) com edição por bloco/coleção — à prova de desconfigurar layout.
- SEO base: meta (title/desc/OG/canonical) em 100% das páginas · sitemap 133 URLs c/ lastmod ·
  robots.txt · **23 redirects 301** (blog já consolidado) · schema Article/Org **só no blog**.
- Blog: 118 posts SEO+GEO, 8 categorias, imagens 263 webp.
- Semrush: ~7,2k KW, ~40,3k visitas org/mês, 499 domínios ref, 1,7k backlinks. 71,9% informativo / 7,4% transacional.

---

## 1. GAPS AUDITADOS (achados concretos 2026-07-22)

| Sev | Gap | Evidência |
|-----|-----|-----------|
| 🔴 | **Nenhum analytics/tracking** (sem GA4, GTM, GSC, pixel) — site cego | grep em index/contato/receita = 0 |
| 🟠 | **Zero JSON-LD nas 9 páginas institucionais** (schema só no blog) | audit @type por página |
| 🟠 | **Sem desambiguação de entidade** (legalName, CNPJ, sameAs, taxID) — existe outro "A Fórmula" | — |
| 🟠 | **87 unidades sem LocalBusiness/Pharmacy schema** (dados prontos em lojas.json) | lojas.json = 87 |
| 🟡 | Google Fonts carregado além de fonts self-hosted (render-blocking + LGPD) | index.html |
| 🟡 | 54 jpg + 16 png convertíveis a webp/avif (CWV) | find formatos |
| 🟡 | Sitemap único, sem divisão nem image-sitemap; clusters desbalanceados (saúde 68 × ativos 4) | sitemap |
| 🟡 | Sem llms.txt, RSS, 404 custom, security.txt, IndexNow | ls |
| 🟡 | LGPD é rascunho (aguarda DPO Luiz Gomes) | handoff |
| 🟡 | Área do prescritor a popular | handoff |
| 🟢 | 2 alt vazios na home; Twitter Card incompleto; "sem-categoria" (2 posts) | audit |
| 🟢 | Sem E-E-A-T formal (autoria farmacêutica/CRF, "revisado por") — crítico em YMYL saúde | — |
| 🟢 | Sem páginas-pilar/cluster nem landing pages por cidade (87 cidades) | blog flat |

---

## 2. ROADMAP EM CAMADAS

### Camada A — Rastreabilidade (medir antes de otimizar) 🔴
- GA4 + Google Search Console + Bing Webmaster.
- GTM com **Consent Mode v2** (LGPD) + eventos das 7 ações de conversão:
  enviar receita · achar loja · WhatsApp · loja virtual · área prescritor · franquia · contato.
- Dashboard Looker Studio (GSC + GA4). Governança de UTM.
- *Dep.: ID GA4 (criar conta) + verificação GSC (DNS/Valbert).*

### Camada B — Dados estruturados & entidade 🟠 (o que a Domatech cobraria)
- ✅ **FEITO 2026-07-22** (`scripts/gen-schema.mjs`, idempotente, NÃO deployado ainda):
  - Home: `Organization` (@id) + `WebSite` (@id, publisher→org) com `legalName` "A FORMULA SERVICOS E FRANCHISE LTDA.",
    `taxID` 10.760.350/0002-90, endereço sede (Tabapuã 627), `sameAs` (IG/FB/LinkedIn/YT), logo.
  - Localizador: `ItemList` com **87 `Pharmacy`** (nome, endereço, geo lat/lng, telefone, email) gerados do lojas.json.
  - Injetado só no `<head>` → layout intacto (git: 2.441 inserções, 0 deleções). JSON-LD validado (parse OK).
- ✅ **FEITO 2026-07-22 (2ª leva):** `BreadcrumbList` em todas as páginas institucionais + nos artigos
  (build, Início>Blog>Categoria>Post); `FAQPage` no pet (5 Q&A). Receita tem só 1 pergunta → sem FAQPage.
- ⬜ **FALTA:** `Person` (autores/E-E-A-T), Organization sitewide via @id, validar no Rich Results Test pós-deploy.
- ⬜ Reforço da desambiguação: nº alternativos, domínios de franquia, vínculo rede↔unidades.
- *Nota: taxID usa o CNPJ da entidade de franchise (filial 0002-90). Confirmar se prefere o da matriz 0001.*

### Camada C — Performance / Core Web Vitals SOTA 🟡
- ✅ **FEITO 2026-07-22:**
  - **Hero/LCP** (`a18.jpg`→`a18.webp`, 93K→43K): `<source webp>` no `<picture>`, **removido `loading="lazy"`
    do LCP** (era anti-padrão), `<link rel="preload">` responsivo (mobile/desktop) no `<head>`.
  - Fallbacks do blog `a33–a40.jpg`→`.webp` (1.2M→679K) + mapa `FALLBACK` do build atualizado.
  - Fontes já eram 100% self-hosted; **"Google Fonts render-blocking" não existia** (só 2 `preconnect`
    mortos — mantidos por terem âncoras `data-dc-tpl`/JS; risco > ganho nulo).
- ⬜ **FALTA:** imagens do pet (CMS-managed — converter exige cuidado c/ Firestore); `srcset` multi-resolução
  nos cards do blog; critical CSS; Lighthouse CI no build; converter demais jpg/png órfãos referenciados.

### Camada D — Descoberta & indexação 🟡
- ✅ **FEITO 2026-07-22:** `rss.xml` (50 itens, gerado do blog) + `<link rel="alternate">` em index/blog;
  **IndexNow** configurado (chave `a4c6b619d39cf0f49cdae9fdb7c740e7.txt` na raiz; ping a Bing/Yandex
  no build **só em produção**, `VERCEL_ENV=production`). RSS+llms regeneram frescos do Firestore no deploy
  (`scripts/gen-feeds.mjs` p/ snapshot local; lógica espelhada em `build-site.mjs`).
- ⬜ **FALTA:** sitemaps divididos (páginas/blog/imagens) + image-sitemap; `404.html` custom;
  `.well-known/security.txt`; submeter sitemap ao GSC (após verificação — dep. Valbert).
- ⚠️ **Achado:** arquivos de artigo commitados têm `canonical` do domínio de preview
  (`aformula-institucional.vercel.app`). São regenerados com o domínio de produção no deploy
  (BASE já = www.aformulabr.com.br), mas o repo tem snapshots antigos. Baixo risco; corrige no próximo build.

### Camada E — GEO / AI Search (a fronteira 2026) 🟡
- ✅ **FEITO 2026-07-22:** `llms.txt` na raiz (páginas principais + 30 posts recentes + sitemap/RSS),
  regenerado no build. FAQPage no pet (5 Q&A) e nos posts (já existia).
- ⬜ **FALTA:** reestruturar corpo dos artigos p/ extração IA (TL;DR, "principais pontos", tabelas);
  `Speakable` schema; expandir FAQ nas páginas de conversão.

### Camada F — E-E-A-T (YMYL / saúde = padrão máximo do Google) 🟢
- Páginas de autor (`Person` + CRF) do farmacêutico responsável.
- Byline "escrito por / revisado por [farmacêutico]" nos posts de saúde.
- Página "política editorial" + referências/fontes nos artigos de saúde.
- Reforçar Sobre (38 anos, CNPJ, responsável técnico).
- *Dep.: nomes + CRF reais dos profissionais (A Fórmula).*

### Camada G — Local SEO (87 unidades = maior oportunidade) 🟢
- **Landing pages por cidade** ("farmácia de manipulação em {cidade}") — captura busca local massiva.
- Google Business Profile por unidade (offline, matriz) + NAP consistente.
- `Pharmacy` schema + mapa + horário por unidade.

### Camada H — Arquitetura de conteúdo & clusters 🟡
- Páginas-pilar por tema prioritário (ativos, emagrecimento, imunidade, beleza/cabelo,
  saúde da mulher, longevidade, pet) + artigos de apoio linkando pro pilar.
- Rebalancear clusters (saúde 68 × ativos 4). Limpar "sem-categoria".
- Links internos editorial → conversão (receita / loja / prescritor). Related posts.

### Camada I — Autoridade / off-page (único item que só terceiro resolve bem) ✅ terceirizar
- Backlinks, digital PR, HARO, estudos/dados próprios, parcerias com associações do setor,
  citações locais, transformar menções sem link em backlinks, corrigir menções ao domínio errado.

### Camada J — Migração de domínio (em curso com Valbert) 🔴 supervisão
- Planilha DE-PARA 301 completa (não só os 23 atuais), sem cadeias/loops.
- Preservar 40k visitas: crawl antes/depois, GSC change of address, monitorar 30-90 dias.

---

## 3. MATRIZ: FÁCIL (faço já) × SUPERVISÃO/TERCEIROS

### ✅ FÁCIL — executo agora, no repo, reversível, sem credencial externa
- Schema JSON-LD todas as páginas + Pharmacy×87 (de lojas.json) [Camada B, exceto CNPJ]
- Conversão de imagens + srcset + self-host fontes + preload/CWV [C]
- Sitemaps divididos + image-sitemap + IndexNow + RSS + 404 custom + security.txt [D]
- llms.txt + reestruturar conteúdo pra extração IA + Speakable [E]
- Páginas-pilar (estrutura) + rebalanceamento de clusters + links internos + related [H]
- Correções: alt vazios, Twitter Card, "sem-categoria" [gaps 🟢]
- Código de GA4/GTM/Consent Mode instalado [A — falta só o ID]
- Scaffolding de páginas de autor / política editorial [F — falta os dados dos profissionais]

### 🤝 PRECISA SUPERVISÃO / DADOS DE TERCEIROS
| Item | De quem depende |
|------|-----------------|
| Migração 301 do domínio + GSC change of address | **Valbert (TI A Fórmula)** — em curso |
| Verificação GSC/Bing + criar/acessar conta GA4 | Valbert / você |
| Razão social + CNPJ da REDE + canais oficiais (entidade) | Matriz / Valbert |
| Google Business Profile ×87 + NAP | Matriz / unidades (offline) |
| Nomes + CRF do farmacêutico responsável (E-E-A-T) | A Fórmula |
| LGPD final | DPO Luiz Gomes |
| Aprovar landing pages por cidade (arquitetura + conteúdo) | Matriz |
| Backlinks / PR / autoridade (recorrente) | Terceiro (Domatech) ou esforço in-house |
| Produção de conteúdo em volume | Decisão: quem escreve + revisão médica |

---

## 4. CADÊNCIA DE CONTEÚDO — pra virar autoridade

Nicho saúde/manipulação é **competitivo e YMYL** (padrão máximo de E-E-A-T). Base já em 40k visitas.

| Nível | Novos/mês | Refresh/mês | Pilares | Resultado esperado |
|-------|:---------:|:-----------:|:-------:|--------------------|
| Mínimo p/ não decair | 4 | 2 | 1/trimestre | mantém posição |
| **Recomendado (alvo)** | **8** (2/sem) | **4** | **1/mês** | crescimento consistente |
| SOTA agressivo | 12–16 | 6 | 2/mês | domínio de nicho |

- **Refresh vale tanto quanto o novo**: atualizar os 118 posts existentes combate content decay (ROI alto).
- Cada peça: E-E-A-T (revisão farmacêutica), ângulo original, estruturada pra IA, links internos → conversão.
- Horizonte: movimento em **3–6 meses**, ganho composto em **6–12 meses**.
- Distribuição: todo post → newsletter + social (amplia sinais + tráfego).

---

## 5. MÉTRICAS DE SUCESSO (definir baseline após GA4/GSC)

- Tráfego orgânico total + **% transacional** (hoje 7,4% → meta subir).
- Conversões rastreadas: receitas enviadas, cliques WhatsApp, achar-loja, prescritor, franquia.
- KW no top 3 / top 10; KW não-marca; visibilidade local por cidade.
- Backlinks / domínios de referência (499 → crescer qualificado).
- Core Web Vitals (LCP/INP/CLS) verdes.
- Presença em AI Overviews / citações por LLM.

---

## 6. ORDEM DE ATAQUE SUGERIDA

1. **Camada A (tracking)** — parar de estar cego. Baseline.
2. **Camada B (schema/entidade)** — maior ganho SEO imediato, quase tudo faço já.
3. **Camada C+D (CWV + descoberta)** — técnico, rápido.
4. **Camada E (GEO/IA)** — diferencial 2026.
5. **Camada H+F (clusters + E-E-A-T)** — conteúdo/autoridade on-page.
6. **Camada G (local/cidades)** + **I (backlinks)** — escala, com matriz/terceiro.
7. **Camada J (migração)** — coordenado com Valbert, com rede de segurança.

> Fonte da verdade deste plano: este arquivo. Atualizar conforme execução.
