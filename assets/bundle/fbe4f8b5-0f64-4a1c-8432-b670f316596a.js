/* A Fórmula — Diferenciais: mostra 6 cards por vez; os demais entram
   trocando de lugar aleatoriamente, com fade suave. Pausa no hover.
   Respeita prefers-reduced-motion. */
(function () {
  "use strict";
  var grid = document.querySelector(".dif__grid");
  if (!grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".dcard"));
  var N = cards.length;
  var SLOTS = 6;
  if (N <= SLOTS) return;

  var data = cards.map(function (c) { return c.innerHTML; });
  var slots = cards.slice(0, SLOTS);
  for (var i = SLOTS; i < N; i++) { cards[i].parentNode.removeChild(cards[i]); }

  var shown = [];
  for (var s = 0; s < SLOTS; s++) shown.push(s);
  var pool = [];
  for (var k = SLOTS; k < N; k++) pool.push(k);

  if (window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches) return;

  var timer = null;

  function swap() {
    if (!pool.length) return;
    if (grid.matches(":hover")) return;            // não troca enquanto a pessoa interage
    var slotIdx = Math.floor(Math.random() * SLOTS);
    var el = slots[slotIdx];
    if (el.matches(":hover")) return;
    var poolPos = Math.floor(Math.random() * pool.length);
    var incoming = pool[poolPos];
    var outgoing = shown[slotIdx];
    el.classList.add("is-swapping");
    setTimeout(function () {
      el.innerHTML = data[incoming];
      el.classList.remove("is-swapping");
      pool[poolPos] = outgoing;
      shown[slotIdx] = incoming;
    }, 480);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { if (!timer) timer = setInterval(swap, 3600); }
        else { clearInterval(timer); timer = null; }
      });
    }, { threshold: 0.15 });
    io.observe(grid);
  } else {
    timer = setInterval(swap, 3600);
  }
})();
