# A Fórmula — Site Institucional v3 (premium polish)

Evolução da **v2** (réplica fiel do Canva). **Mesma estrutura, mesmas 10 seções, mesma copy** — elevação de design e imagens reais. A v2 permanece intacta como histórico.

## O que mudou da v2 → v3

### Imagens (geradas via chatgpt-bridge, refs oficiais da marca)
- **Hero** (`hero.jpg`) — antes era um **gradiente placeholder**. Agora: foto cinematográfica de farmacêutica em laboratório de manipulação (estética Aesop × Apple, cápsula teal). Sujeito à direita, lado esquerdo arejado p/ o overlay de texto.
- **Embalagem oficial** (`pote-marble.jpg`) — shot editorial do pote oficial A Fórmula (teal #008896, rótulo cinza "a fórmula" + folha branca) sobre mármore. Integrado na seção **Nossos Diferenciais** (substitui `capsules.jpg`).
- Otimizadas p/ web: hero 98 KB, pote 132 KB (JPG progressivo).

### Refino de design (CSS, sem mudar estrutura)
- **Acessibilidade:** anel de foco visível (`:focus-visible`) em toda a navegação por teclado.
- **Elevação:** escala de sombras teal em camadas (`--shadow-sm/-/-lg`) + hairlines sutis.
- **Hero:** overlay refinado + camada de glow; ken-burns lento no load (respeita `prefers-reduced-motion`); **scrim vertical mais forte no mobile** p/ legibilidade do texto branco sobre a foto.
- **Micro-interações:** lift nos cards (step, pillar, dcard), preenchimento do ícone no hover, press nos botões, zoom suave na figura, foco dourado no input da newsletter.

### Round 2 — correções + awwwards pass
- **Cores da marca:** removido o dourado off-brand (#d8b062/#ffbd59) → **accent mint/aqua** (#3fb9ad / #7fe3d4) em hero, stats, chips, nav, newsletter e footer. Site alinhado à identidade teal + mint + branco + cinza/prata.
- **Header legível:** scrim dedicado (`.site-header::before`) + drop-shadow no logo + text-shadow na nav → branco sempre legível sobre a foto.
- **Hero legível:** scrims topo/base/esquerda; no mobile scrim vertical reforçado.
- **Seção 37 anos:** `object-position:78%` → mostra as prateleiras + almofariz (antes cortava no vazio).
- **Pote refeito:** vidro teal **translúcido** com cápsulas visíveis (fiel ao `pote_capsulas_2026`), tampa prata, rótulo "a fórmula" + folha. Antes estava opaco/matte.
- **Blog = galeria circular (OGL/WebGL)** do componente ReactBits, em arco curvo, drag/scroll. **Requer ser servida por HTTP** (Vercel ou `python -m http.server`); em `file://` o Chrome bloqueia ES-modules/texturas e cai no fallback estático (carrossel com snap). 5 capas de blog **regeradas em alta** via bridge (eram ~300px).

## Stack
Idêntica à v2 — HTML + CSS + JS vanilla, sem build. Avenir self-hosted + Playfair Display.
Galeria circular = OGL self-hospedada (`assets/js/ogl.mjs`).

## Pendências (herdadas da v2)
- Links reais (Área do prescritor, Encontre uma loja, WhatsApp, redes).
- Fotos do blog ainda são as do design Canva — confirmar definitivas.
- Páginas internas não construídas (escopo = Home).

## Preview
Abrir `index.html` no navegador, ou servir a pasta `v3/`.
