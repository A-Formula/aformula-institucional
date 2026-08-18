/* A Fórmula — botão flutuante de contato + métrica de cliques.
   Vive SEPARADO do a28.js de propósito: `receita.html` e `pet.html` têm script próprio de nav e
   scroll-reveal, então carregar o a28 inteiro nelas duplicaria o toggle do menu (dois toggles no
   mesmo clique = menu que não abre). Isolando só o que é universal, este arquivo entra em TODA
   página sem risco de conflito — e as duas que estavam sem FAB passam a ter.
   Nome versionado (.v1) para que uma troca futura nunca dependa de expirar cache do visitante. */
(function () {
  "use strict";

  /* ---- Métrica de cliques (agregada, sem PII) ----
     O painel precisa do VOLUME de cliques, não só dos leads que fecham o formulário: sem isso não
     dá pra separar "ninguém clica" de "todo mundo clica e ninguém converte" — problemas opostos.
     GA4 sozinho não resolve: só conta quem aceitou cookie e o número não chega ao painel.
     Grava contador próprio E dispara o evento GA4. Sem cookie, sem IP, sem identificador. */
  function enviarClique(evento, rotulo) {
    var dados = {
      evento: evento,
      rotulo: (rotulo || "").slice(0, 80),
      pagina: location.pathname.slice(0, 120),
    };
    try {
      var corpo = JSON.stringify(dados);
      // sendBeacon sobrevive à navegação que o próprio clique dispara; um fetch comum seria
      // cancelado no meio — e o caso rastreado é justamente o de sair da página.
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([corpo], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, keepalive: true });
      }
    } catch (e) { /* métrica nunca pode atrapalhar a navegação */ }
    try { if (window.gtag) gtag("event", evento, { rotulo: dados.rotulo, pagina: dados.pagina }); } catch (e) {}
  }
  window.afTrack = enviarClique;   // outros scripts do site podem marcar eventos próprios

  /* Nome da unidade quando o clique nasce num card/popup da Encontre uma loja: é o que dá sentido
     ao número — "WhatsApp: 300" não diz nada, "WhatsApp da unidade X: 300" diz. */
  function unidadeDoClique(el) {
    /* 1º) o atributo que o gerador de páginas já escreve no link (data-unidade="{slug}").
       Sem isto, na PÁGINA de unidade o rótulo saía "Falar no WhatsApp" — o texto do botão —
       porque não existe `.railcard` ali: os ancestrais de card só existem no mapa. O `pagina`
       salvava o dado, mas o relatório ficava ilegível ("Falar no WhatsApp: 300" não diz loja). */
    if (el.dataset && el.dataset.unidade) return el.dataset.unidade;
    var card = el.closest && (el.closest(".railcard") || el.closest(".af-pop__in"));
    if (card) {
      var t = card.querySelector("h3, strong");
      if (t) return t.textContent.trim();
    }
    // 3º) numa página de unidade sem o atributo, o H1 identifica a loja
    var h1 = document.querySelector(".loja-hero h1");
    return h1 ? h1.textContent.trim() : "";
  }

  /* Delegado no document, em captura: pega também os links que o mapa cria depois do load
     (popups e cards do trilho), que um listener por elemento não alcançaria. */
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    /* O botão flutuante tem listener PRÓPRIO. Sem esta linha, na página de unidade — onde ele
       aponta pra wa.me — um clique só gerava DOIS eventos (clique_whatsapp + clique_fab_whatsapp)
       e o número de contatos aparecia dobrado no painel. Medido antes de publicar. */
    if (a.classList.contains("af-fab")) return;
    var href = a.getAttribute("href") || "";
    if (/(?:wa\.me|api\.whatsapp\.com)/i.test(href)) {
      enviarClique("clique_whatsapp", unidadeDoClique(a) || a.textContent.trim());
    } else if (/^tel:/i.test(href)) {
      enviarClique("clique_telefone", unidadeDoClique(a) || href.replace(/^tel:/i, ""));
    } else if (a.hasAttribute("data-track")) {
      enviarClique("clique_cta", a.getAttribute("data-track"));
    }
  }, true);

  /* ---- Botão flutuante "Fale conosco" → /contato ----
     Injetado por JS (padrão da casa, igual ao aviso de cookies) pra valer em qualquer página que
     carregue este arquivo. Na própria /contato não aparece (seria redundante).
     z-index 99998: abaixo do aviso de cookies (99999), que é temporário e tem prioridade. */
  if (/\/contato(\.html)?\/?$/i.test(location.pathname)) return;   // cleanUrls: em produção é /contato
  if (document.querySelector(".af-fab")) return;                   // trava contra dupla inclusão

  var css = document.createElement("style");
  /* Identidade OFICIAL do WhatsApp no botão inteiro (pedido do operador 2026-08-18: "deve ser
     sempre o oficial do whatsapp"): verde #25D366 — o mesmo que os cards do mapa já usam — e
     o glifo oficial (telefone dentro do balão), preenchido, nunca de contorno.
     O ícone é `fill`, não `stroke`: o glifo do WhatsApp é uma forma cheia, e desenhá-lo com
     traço deixa o telefone chapado e a marca errada. */
  css.textContent = '.af-fab{position:fixed;right:22px;bottom:22px;z-index:99998;display:inline-flex;align-items:center;gap:9px;height:48px;padding:0 20px 0 16px;border-radius:999px;background:#25D366;color:#fff;font-family:inherit;font-weight:700;font-size:14px;letter-spacing:.02em;text-decoration:none;box-shadow:0 10px 28px rgba(37,211,102,.32);transition:transform .25s,box-shadow .25s,background .25s}.af-fab:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(37,211,102,.4);background:#1DA851}.af-fab:focus-visible{outline:3px solid #075E54;outline-offset:2px}.af-fab svg{width:22px;height:22px;fill:#fff;stroke:none}@media(prefers-reduced-motion:reduce){.af-fab{transition:none}}@media(max-width:767px){.af-fab{right:14px;bottom:calc(14px + env(safe-area-inset-bottom));height:52px;width:52px;padding:0;justify-content:center}.af-fab span{display:none}.af-fab svg{width:26px;height:26px}}';
  document.head.appendChild(css);

  var fab = document.createElement("a");

  /* v2 (2026-08-18, pedido do operador: "coloque um botão de whatsapp").
     Numa PÁGINA DE UNIDADE o botão vira o WhatsApp DAQUELA loja — e o número não é
     inventado nem embutido aqui: sai do próprio link da página (.loja-wa), que veio do
     cadastro. Assim um número corrigido no lojas.json chega no FAB sem tocar neste arquivo.
     Nas outras páginas não existe número: o site NÃO tem WhatsApp central (medido — nem a
     home nem a /contato têm `wa.me` ou `tel:`), e o atendimento é por unidade. Então lá o
     botão segue "Fale conosco" → /contato até o operador decidir. */
  var waUnidade = document.querySelector("a.loja-wa[href]");

  /* Glifo OFICIAL do WhatsApp — o mesmo path que o mapa (finder3d) já usa nos cards, para o
     site inteiro falar a mesma língua visual. Forma cheia, `fill`. */
  var GLIFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  fab.className = "af-fab";     // a identidade do WhatsApp é a MESMA em todo o site

  if (waUnidade) {
    // Página de unidade: abre o WhatsApp DAQUELA loja. O número sai do próprio link da
    // página (.loja-wa), que veio do cadastro — corrigir o lojas.json corrige o FAB.
    fab.href = waUnidade.getAttribute("href");
    fab.target = "_blank";
    fab.rel = "noopener";
    fab.setAttribute("aria-label", "Falar no WhatsApp desta unidade");
    // MESMO rótulo do botão do card (o slug da unidade): dois nomes para a mesma loja
    // obrigam a somar duas linhas à mão no relatório.
    var slug = waUnidade.getAttribute("data-unidade") || "";
    fab.addEventListener("click", function () {
      enviarClique("clique_fab_whatsapp", slug || document.title.slice(0, 60));
    });
    fab.innerHTML = GLIFO + '<span>WhatsApp</span>';
  } else {
    /* Demais páginas: MESMO desenho, link inalterado → /contato (decisão do operador:
       "mantendo a mesma lógica e link, apenas mude o design"). O site não tem WhatsApp
       central — medido, não há `wa.me` nem `tel:` na home nem na /contato.
       ⚠️ Consequência a saber: o botão veste a marca do WhatsApp e abre um formulário.
       Quem clica esperando conversa encontra campo pra preencher. Resolve com um número
       central de verdade, ou mandando pra /encontre-uma-loja (o atendimento é por unidade).

       Href ABSOLUTO, nunca relativo: em /blog/{categoria}/{slug} um "contato.html" resolvia
       pra /blog/{categoria}/contato.html → 404. Eram os 118 posts do blog mandando o CTA
       principal pra página de erro (medido em produção em 2026-08-13). */
    fab.href = "/contato";
    fab.setAttribute("aria-label", "Fale conosco — página de contato");
    fab.addEventListener("click", function () { enviarClique("clique_fab_contato", document.title.slice(0, 60)); });
    fab.innerHTML = GLIFO + '<span>Fale conosco</span>';
  }

  if (document.body) document.body.appendChild(fab);
  else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(fab); });
})();
