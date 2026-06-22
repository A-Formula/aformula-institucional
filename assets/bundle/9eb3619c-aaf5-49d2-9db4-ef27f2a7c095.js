/* A Fórmula — parallax de fundo + movimento no scroll
   Complementa o scroll-reveal (.reveal) já tratado em main.js.
   Respeita prefers-reduced-motion: não anima se o usuário pedir menos movimento. */
(function(){
  "use strict";

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion:reduce)") : null;
  if (mq && mq.matches) return;

  /* Camadas de parallax: seletor + velocidade (px de deslocamento total aprox.) */
  var defs = [
    { sel: ".anos__img",   speed: 84 },   /* imagem full-bleed do bloco "37 anos" */
    { sel: ".news__media", speed: 64 }    /* arte decorativa da newsletter */
  ];

  var layers = [];
  defs.forEach(function(d){
    document.querySelectorAll(d.sel).forEach(function(el){
      layers.push({ el: el, speed: d.speed });
    });
  });
  if (!layers.length) return;

  var vh = window.innerHeight || document.documentElement.clientHeight;
  var ticking = false;

  function update(){
    for (var i = 0; i < layers.length; i++){
      var L = layers[i];
      var r = L.el.getBoundingClientRect();
      /* só calcula quando perto/dentro da viewport */
      if (r.bottom < -240 || r.top > vh + 240) continue;
      var center = r.top + r.height / 2;
      var prog = (vh / 2 - center) / vh;        /* ~ -0.7 .. 0.7 conforme passa */
      var y = (prog * L.speed).toFixed(1);
      L.el.style.transform = "translate3d(0," + y + "px,0)";
    }
    ticking = false;
  }

  function onScroll(){
    if (!ticking){ ticking = true; requestAnimationFrame(update); }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function(){
    vh = window.innerHeight || document.documentElement.clientHeight;
    onScroll();
  }, { passive: true });

  update();
})();
