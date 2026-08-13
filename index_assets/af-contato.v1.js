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
    var card = el.closest && (el.closest(".railcard") || el.closest(".af-pop__in"));
    if (!card) return "";
    var t = card.querySelector("h3, strong");
    return t ? t.textContent.trim() : "";
  }

  /* Delegado no document, em captura: pega também os links que o mapa cria depois do load
     (popups e cards do trilho), que um listener por elemento não alcançaria. */
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
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
  css.textContent = '.af-fab{position:fixed;right:22px;bottom:22px;z-index:99998;display:inline-flex;align-items:center;gap:9px;height:48px;padding:0 20px 0 16px;border-radius:999px;background:#008896;color:#fff;font-family:inherit;font-weight:700;font-size:14px;letter-spacing:.02em;text-decoration:none;box-shadow:0 10px 28px rgba(0,18,26,.28);transition:transform .25s,box-shadow .25s,background .25s}.af-fab:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(0,18,26,.36);background:#00525d}.af-fab:focus-visible{outline:3px solid #063237;outline-offset:2px}.af-fab svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}@media(prefers-reduced-motion:reduce){.af-fab{transition:none}}@media(max-width:767px){.af-fab{right:14px;bottom:calc(14px + env(safe-area-inset-bottom));height:52px;width:52px;padding:0;justify-content:center}.af-fab span{display:none}}';
  document.head.appendChild(css);

  var fab = document.createElement("a");
  // ABSOLUTO, nunca relativo: em /blog/{categoria}/{slug} um "contato.html" resolvia pra
  // /blog/{categoria}/contato.html → 404. Eram os 118 posts do blog mandando o CTA principal
  // pra página de erro (medido em produção em 2026-08-13).
  fab.href = "/contato";
  fab.className = "af-fab";
  fab.setAttribute("aria-label", "Fale conosco — página de contato");
  fab.addEventListener("click", function () { enviarClique("clique_fab_contato", document.title.slice(0, 60)); });
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20l1-4.9a8.38 8.38 0 0 1-.5-3.6 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 9 8.5z"/></svg><span>Fale conosco</span>';

  if (document.body) document.body.appendChild(fab);
  else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(fab); });
})();
