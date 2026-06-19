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
})();
