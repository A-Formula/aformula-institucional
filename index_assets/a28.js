/* A Fórmula — site institucional v2 */
(function(){
  "use strict";

  /* ---- Mobile nav ---- */
  var toggle = document.getElementById("navToggle");
  if (toggle) {
    toggle.addEventListener("click", function(){
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll("#mainNav a, .nav-cta a").forEach(function(a){
      a.addEventListener("click", function(){
        document.body.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded","false");
      });
    });
  }

  /* ---- Header background on scroll ---- */
  var header = document.getElementById("header");
  function onScroll(){
    if (!header) return;
    if (window.scrollY > 40) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
  }
  window.addEventListener("scroll", onScroll, {passive:true});
  onScroll();

  /* ---- Scroll reveal ---- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting){ e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, {threshold:.12, rootMargin:"0px 0px -8% 0px"});
    reveals.forEach(function(el){ io.observe(el); });
  } else {
    reveals.forEach(function(el){ el.classList.add("is-in"); });
  }

  /* ---- Blog carousel ---- */
  var track = document.getElementById("blogTrack");
  var prev = document.getElementById("blogPrev");
  var next = document.getElementById("blogNext");
  if (track && prev && next) {
    function step(){
      var card = track.querySelector(".post");
      return card ? card.getBoundingClientRect().width + 22 : 300;
    }
    next.addEventListener("click", function(){ track.scrollBy({left:step(), behavior:"smooth"}); });
    prev.addEventListener("click", function(){ track.scrollBy({left:-step(), behavior:"smooth"}); });
  }

  /* ---- Newsletter form ---- */
  var form = document.getElementById("newsForm");
  if (form) {
    form.addEventListener("submit", function(e){
      e.preventDefault();
      var btn = form.querySelector("button");
      var old = btn.textContent;
      btn.textContent = "Inscrito! ✓";
      form.querySelector("input").value = "";
      setTimeout(function(){ btn.textContent = old; }, 2600);
    });
  }

  /* ---- Botão flutuante de mensagem → página de contato ----
     Injetado aqui (padrão da casa, como o aviso de cookies) pra valer em toda página que
     carrega este script. Na própria /contato não aparece. z-index 99998: abaixo do aviso
     de cookies (99999), que é temporário e tem prioridade. */
  if (!/\/contato(\.html)?\/?$/i.test(location.pathname)) {   /* cleanUrls: em produção é /contato */
    var fabCss = document.createElement("style");
    fabCss.textContent = '.af-fab{position:fixed;right:22px;bottom:22px;z-index:99998;display:inline-flex;align-items:center;gap:9px;height:48px;padding:0 20px 0 16px;border-radius:999px;background:#008896;color:#fff;font-family:inherit;font-weight:700;font-size:14px;letter-spacing:.02em;text-decoration:none;box-shadow:0 10px 28px rgba(0,18,26,.28);transition:transform .25s,box-shadow .25s,background .25s}.af-fab:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(0,18,26,.36);background:#00525d}.af-fab:focus-visible{outline:3px solid #063237;outline-offset:2px}.af-fab svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}@media(prefers-reduced-motion:reduce){.af-fab{transition:none}}@media(max-width:767px){.af-fab{right:14px;bottom:calc(14px + env(safe-area-inset-bottom));height:52px;width:52px;padding:0;justify-content:center}.af-fab span{display:none}}';
    document.head.appendChild(fabCss);
    var fab = document.createElement("a");
    fab.href = "contato.html";
    fab.className = "af-fab";
    fab.setAttribute("aria-label", "Fale conosco — página de contato");
    fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20l1-4.9a8.38 8.38 0 0 1-.5-3.6 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 9 8.5z"/></svg><span>Fale conosco</span>';
    document.body.appendChild(fab);
  }
})();
