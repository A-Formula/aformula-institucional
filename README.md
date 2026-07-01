# A Fórmula — Site Institucional

Site institucional multipágina originado do **Claude Design** e **desempacotado** em HTML estático limpo. Cada página traz o conteúdo real inline (bom para SEO/perf/preview social) com imagens, fontes e scripts servidos de uma pasta `*_assets/` própria.

## Páginas

| Arquivo | Rota | Conteúdo | HTML |
|---------|------|----------|------|
| `index.html` | `/` | Home institucional | 83 KB |
| `sobre-nos.html` | `/sobre-nos.html` | Sobre nós | 85 KB |
| `blog.html` | `/blog.html` | Blog | 82 KB |
| `area-do-prescritor.html` | `/area-do-prescritor.html` | Área do prescritor (login) | 39 KB |
| `pet.html` | `/pet.html` | A Fórmula Pet | 118 KB |
| `receita.html` | `/receita.html` | Manipule sua receita | 55 KB |

Cada página tem uma pasta `<nome>_assets/` com suas imagens, fontes (woff2) e scripts.

## Navegação

Navbar cabeada entre todas as páginas: logo → Home; **Sobre nós · Blog · Área do prescritor · A Fórmula Pet** apontam para cada página; o CTA **"Manipule sua receita"** vai para `receita.html`. Links sem página dedicada (Encontre uma loja, Contato, Seja um franqueado) ficam em `#`.

## Origem / build

Exportado do Claude Design como bundles self-contained que se descompactavam no cliente (home original ~6 MB, ruim para SEO). Foram renderizados em headless (Playwright), o DOM final serializado como HTML estático e os assets externalizados — mesmo render, sem runtime de unpacking. O widget "Tweaks" (editor de tema do Claude Design) foi removido.

## Deploy

Autodeploy Vercel (projeto `aformula-institucional`) na branch `main`. Root do repo = root do site.

## Pendências

- Links ainda em `#` (sem página): Encontre uma loja, Contato, Seja um franqueado.
- Imagens compartilhadas estão duplicadas entre as pastas `*_assets/` (cada página é independente). Dá para deduplicar num passo futuro.
