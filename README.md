# A Fórmula — Site Institucional v3

Versão atual e correta da Home institucional. Substitui o design anterior (réplica do Canva).

## Origem

Home exportada como bundle self-contained (`A Formula - Home.html`) e **desempacotada** em arquivos estáticos limpos:
- `index.html` — 81 KB, HTML/CSS/JS vanilla, inline (sem build).
- `assets/bundle/` — 31 assets self-hosted: imagens (jpg/png), fontes Playfair Display (woff2, todos os ranges) e 5 scripts.

O bundle original renderiza um único arquivo de 6 MB que se descompacta no cliente (ruim p/ SEO/perf/preview social). A versão desempacotada serve o HTML real direto — mesmo render, sem runtime de unpacking.

## Seções

Hero · "Uma das maiores empresas de manipulação do Brasil" (stats: todos os estados, ABF 9 anos, +1M atendimentos/ano) · 37 anos / Sobre · Nossos Diferenciais · Newsletter · Blog.

## Stack

HTML + CSS + JS vanilla, sem build. Fontes self-hosted. Único ref externo: preconnect ao Google Fonts (fontes também embutidas → funciona offline).

## Deploy

Servida pelo projeto Vercel `a-formula` (output = raiz do repo). Acessível em `/site-institucional/v3/`.

## Pendências

- Links reais (Área do prescritor, Encontre uma loja, Seja um franqueado, redes).
- Páginas internas não construídas (escopo = Home).

## Histórico

Assets do design v3 anterior movidos para `temp/_arquivar/v3-old-assets-20260622/` (recuperáveis via git).
