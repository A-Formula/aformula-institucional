# Search Console — o que falta é 1 clique seu

Estado (verificado em 12/08/2026): domínio `www.aformulabr.com.br` no ar, `sitemap.xml`
(com imagens) e `robots.txt` corretos, GA4 `G-3GEYZT8XH5` instalado em todas as páginas.
**Só falta a verificação, que depende da sua conta Google.**

## Caminho A — 1 clique (se sua conta tem acesso ao GA4 da empresa)

1. Abrir https://search.google.com/search-console logado na conta que acessa o Google Analytics.
2. Adicionar propriedade → **Prefixo do URL** → `https://www.aformulabr.com.br/`.
3. O Google detecta o GA4 instalado → **Verificar**. Pronto.

## Caminho B — meta tag (se o A falhar)

1. Mesmo fluxo até a tela de verificação → escolher **Tag HTML**.
2. Me mandar SÓ o código que aparece (formato `google-site-verification: XXXXX...`
   — não é senha, pode colar no chat).
3. Eu insiro a meta em todas as páginas + template do blog, faço push, e você clica Verificar.

## Depois de verificado (30 segundos)

- Menu **Sitemaps** → enviar `sitemap.xml`.
- (opcional) repetir a propriedade para `https://aformulabr.com.br/` sem www.

> Por que importa: são 100+ páginas indexáveis no ar (site + 118 posts) e hoje ninguém
> mede o que o Google indexou nem que buscas trazem gente.
