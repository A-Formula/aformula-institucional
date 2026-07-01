/* A Fórmula — fios do infográfico dos Diferenciais (v2)
   Linhas que saem de cada card, com cotovelo, e convergem para o centro do
   pote, ocultas atrás dele (z-index). Recalculadas a cada frame enquanto a
   seção está visível → acompanham scroll, reveal e a flutuação do pote. */
(function(){
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var layout, svg, bottleImg, nodes = [], lastSize = "";

  function el(tag){ return document.createElementNS(NS, tag); }

  function ensure(){
    layout = document.querySelector(".dif2__layout");
    if (!layout) return false;
    bottleImg = layout.querySelector(".dif2__bottle img");
    if (!bottleImg) return false;
    svg = layout.querySelector(".dif2__wires");
    if (!svg){
      svg = el("svg");
      svg.setAttribute("class", "dif2__wires");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("preserveAspectRatio", "none");
      layout.insertBefore(svg, layout.firstChild);
    }
    var feats = layout.querySelectorAll(".dif2feat");
    nodes = [];
    svg.textContent = "";
    for (var i = 0; i < feats.length; i++){
      var p = el("path"), c = el("circle");
      c.setAttribute("r", "3.4");
      svg.appendChild(p); svg.appendChild(c);
      nodes.push({ feat: feats[i], path: p, dot: c });
    }
    return true;
  }

  function draw(){
    if (!layout || !svg) return;
    if (window.innerWidth <= 860){ svg.style.display = "none"; return; }
    svg.style.display = "";

    var lr = layout.getBoundingClientRect();
    if (lr.width < 10) return;
    var br = bottleImg.getBoundingClientRect();
    var bcx = br.left + br.width / 2 - lr.left;
    var bcy = br.top + br.height / 2 - lr.top;

    var w = Math.round(lr.width), h = Math.round(lr.height);
    var size = w + "x" + h;
    if (size !== lastSize){
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      svg.setAttribute("width", w);
      svg.setAttribute("height", h);
      lastSize = size;
    }

    for (var i = 0; i < nodes.length; i++){
      var n = nodes[i];
      var isLeft = !!n.feat.closest(".dif2__col--left");
      var fr = n.feat.getBoundingClientRect();
      var ic = n.feat.querySelector(".dif2feat__icon").getBoundingClientRect();
      var ay = ic.top + ic.height / 2 - lr.top;
      var dotX = (isLeft ? fr.right + 7 : fr.left - 7) - lr.left;
      var railX = isLeft ? (br.left - lr.left - 5) : (br.right - lr.left + 5);
      n.path.setAttribute("d",
        "M" + dotX.toFixed(1) + "," + ay.toFixed(1) +
        " H" + railX.toFixed(1) +
        " L" + bcx.toFixed(1) + "," + bcy.toFixed(1));
      n.dot.setAttribute("cx", dotX.toFixed(1));
      n.dot.setAttribute("cy", ay.toFixed(1));
    }
  }

  function inView(){
    var r = layout.getBoundingClientRect();
    return r.bottom > -160 && r.top < (window.innerHeight || 800) + 160;
  }

  function loop(){
    if (layout && inView()) draw();
    requestAnimationFrame(loop);
  }

  function init(){
    if (!ensure()) return;
    draw();
    requestAnimationFrame(loop);
    window.addEventListener("resize", function(){ lastSize = ""; draw(); }, { passive: true });
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
