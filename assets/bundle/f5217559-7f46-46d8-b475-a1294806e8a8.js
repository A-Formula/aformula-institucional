/* A Fórmula — Carrossel circular do blog.
   Reproduz o efeito "CircularGallery" (arco curvo + drag + loop infinito + setas)
   com transforms CSS puros — sem WebGL e sem ES modules, então roda em file:// e http. */
(function () {
  "use strict";
  var el = document.getElementById("blogGallery");
  if (!el) return;

  var srcCards = Array.prototype.slice.call(el.querySelectorAll(".blog__fallback .fcard"));
  if (srcCards.length < 2) return;

  var items = srcCards.map(function (a) {
    var img = a.querySelector("img");
    var t = a.querySelector(".fcard__t");
    return {
      img: img ? img.getAttribute("src") : "",
      alt: img ? (img.getAttribute("alt") || "") : "",
      text: t ? t.textContent : "",
      href: a.getAttribute("href") || "#"
    };
  });
  var N = items.length;

  /* ---- DOM ---- */
  var stage = document.createElement("div");
  stage.className = "cgal__stage";
  var cards = items.map(function (it) {
    var card = document.createElement(it.href ? "a" : "div");
    if (it.href) card.setAttribute("href", it.href);
    card.className = "cgal__card";
    card.innerHTML =
      '<figure><span class="cgal__media"><img src="' + it.img + '" alt="' +
      it.alt.replace(/"/g, "&quot;") + '" draggable="false" loading="lazy"></span>' +
      '<figcaption class="cgal__cap">' + it.text + "</figcaption></figure>";
    stage.appendChild(card);
    return card;
  });
  el.appendChild(stage);

  function mkNav(cls, label, glyph) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cgal__nav " + cls;
    b.setAttribute("aria-label", label);
    b.innerHTML = glyph;
    el.appendChild(b);
    return b;
  }
  var prev = mkNav("cgal__nav--prev", "Artigo anterior", "&#8249;");
  var next = mkNav("cgal__nav--next", "Próximo artigo", "&#8250;");

  el.classList.add("cgal-ready");
  el.tabIndex = 0;

  /* ---- geometria ---- */
  var W, H, cardW, itemSpan, total, bend, R;
  function measure() {
    W = el.clientWidth || 1;
    H = W / 2;
    cardW = Math.max(168, Math.min(W * 0.46, 300));
    el.style.setProperty("--cgal-cw", cardW + "px");
    itemSpan = cardW + Math.max(28, W * 0.05);
    total = itemSpan * N;
    bend = Math.max(56, W * 0.085);
    R = (H * H + bend * bend) / (2 * bend);
  }
  measure();

  var scroll = { cur: 0, tgt: 0, ease: 0.08 };
  function snap() { scroll.tgt = Math.round(scroll.tgt / itemSpan) * itemSpan; }
  var DEG = 180 / Math.PI;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---- drag (pointer + touch) ---- */
  var down = false, sx = 0, sy = 0, sScroll = 0, moved = 0, horiz = false;
  el.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest(".cgal__nav")) return; // deixa as setas funcionarem
    down = true; horiz = false; moved = 0; sx = e.clientX; sy = e.clientY; sScroll = scroll.tgt;
    if (el.setPointerCapture) try { el.setPointerCapture(e.pointerId); } catch (_) {}
  });
  el.addEventListener("pointermove", function (e) {
    if (!down) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!horiz && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) horiz = true;
    if (horiz) { e.preventDefault(); scroll.tgt = sScroll - dx; moved = Math.abs(dx); }
  });
  function release() { if (!down) return; down = false; snap(); }
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  // bloqueia o clique do link logo após um arraste
  stage.addEventListener("click", function (e) { if (moved > 8) e.preventDefault(); }, true);

  prev.addEventListener("click", function () { scroll.tgt -= itemSpan; snap(); });
  next.addEventListener("click", function () { scroll.tgt += itemSpan; snap(); });
  el.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { scroll.tgt -= itemSpan; snap(); }
    else if (e.key === "ArrowRight") { scroll.tgt += itemSpan; snap(); }
  });

  /* ---- loop de animação ---- */
  function frame() {
    scroll.cur += (scroll.tgt - scroll.cur) * scroll.ease;
    if (Math.abs(scroll.tgt - scroll.cur) < 0.08) scroll.cur = scroll.tgt;
    for (var i = 0; i < N; i++) {
      var x = i * itemSpan - scroll.cur;
      x = ((x % total) + total) % total;
      if (x > total / 2) x -= total;
      var ax = Math.min(Math.abs(x), H);
      var arc = R - Math.sqrt(Math.max(0, R * R - ax * ax));
      var rot = clamp((x < 0 ? -1 : 1) * Math.asin(Math.min(ax / R, 1)) * DEG * 0.42, -11, 11);
      var dist = Math.min(Math.abs(x) / (H || 1), 1);
      var sc = 1 - dist * 0.16;
      var op = 1 - dist * 0.42;
      var c = cards[i];
      c.style.transform = "translate(-50%,-50%) translateX(" + x.toFixed(1) + "px) translateY(" +
        arc.toFixed(1) + "px) rotate(" + rot.toFixed(2) + "deg) scale(" + sc.toFixed(3) + ")";
      c.style.zIndex = String(1000 - Math.round(Math.abs(x)));
      c.style.opacity = op.toFixed(2);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var idx = Math.round(scroll.tgt / itemSpan);
      measure();
      scroll.tgt = idx * itemSpan;
      scroll.cur = scroll.tgt;
    }, 150);
  });
})();
