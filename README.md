# A Fórmula — Site Institucional

Site institucional multipágina exportado do **Claude Design**. Cinco páginas HTML self-contained (imagens, fontes e scripts embutidos no próprio arquivo — sem build, sem assets externos).

## Páginas

| Arquivo | Rota | Conteúdo |
|---------|------|----------|
| `index.html` | `/` | Home institucional |
| `sobre-nos.html` | `/sobre-nos.html` | Sobre nós |
| `blog.html` | `/blog.html` | Blog |
| `area-do-prescritor.html` | `/area-do-prescritor.html` | Área do prescritor (login) |
| `pet.html` | `/pet.html` | A Fórmula Pet |

## Navegação

Navbar cabeada entre todas as páginas: logo → Home, e os links **Sobre nós · Blog · Área do prescritor · A Fórmula Pet** apontam para cada página. Links sem página dedicada (Encontre uma loja, Contato, Seja um franqueado) ficam em `#`.

## Stack

HTML/CSS/JS exportado pelo Claude Design. Cada página é um bundle self-contained que se descompacta no cliente (runtime do bundler embutido). Único ref externo: preconnect ao Google Fonts.

## Deploy

Autodeploy Vercel (projeto `aformula-institucional`) na branch `main`. Root do repo = root do site.

## Pendências

- **Peso / SEO:** os arquivos são bundles pesados (home ~6 MB) que renderizam via JavaScript no cliente — ruim para SEO, performance e preview social. Uma versão anterior desempacotava o bundle em HTML estático (~81 KB). Reavaliar se vale reempacotar.
- Páginas para links ainda em `#`: Encontre uma loja, Contato, Seja um franqueado.
- CTA "Manipule sua receita" (em Blog/Sobre/Prescritor) aponta para `uploads/v3_ZIP/receita.html`, que não está publicado.
