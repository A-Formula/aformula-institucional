/* A Fórmula — Encontre uma loja (experiência 3D)
   Motor: MapLibre GL v5 (WebGL, vendorizado) + tiles vetoriais OpenFreeMap (grátis, sem key).
   Vida: abre no globo → voo cinematográfico até o Brasil; pins pulsantes; flyTo inclinado
   (pitch 58° + rotação) ao focar loja; prédios 3D a partir do zoom 14; geolocalização nativa.
   Busca por CEP: ViaCEP (valida) + Nominatim/OSM (geocodifica) → Haversine → 12 mais próximas. */
(function () {
  "use strict";

  var mapEl = document.getElementById("map");
  var railEl = document.getElementById("rail");
  var stateSel = document.getElementById("stateFilter");
  var citySel = document.getElementById("cityFilter");
  var form = document.getElementById("cepForm");
  var cepInput = document.getElementById("cepInput");
  var statusEl = document.getElementById("status");
  var countEl = document.getElementById("count");
  var clearBtn = document.getElementById("clearBtn");
  var geoBtn = document.getElementById("geoBtn");
  if (!mapEl || !railEl || typeof maplibregl === "undefined") return;

  var STORES = [], userMarker = null, activeId = null, introDone = false;

  /* ---------- helpers ---------- */
  function onlyGeo(a) { return a.filter(function (s) { return s.lat && s.lng; }); }
  function haversine(a, b, c, d) {
    var R = 6371, dLat = (c - a) * Math.PI / 180, dLon = (d - b) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function digits(s) { return (s || "").replace(/\D/g, ""); }
  function waLink(s) {
    var n = digits(s.celular || s.telefone);
    if (!n) return null;
    if (n.length <= 11) n = "55" + n;
    return "https://wa.me/" + n;
  }
  function mapsLink(s) {
    if (s.place_id) return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.nome + " A Fórmula") + "&query_place_id=" + s.place_id;
    return "https://www.google.com/maps/search/?api=1&query=" + s.lat + "," + s.lng;
  }
  function status(msg, err) {
    statusEl.textContent = msg || "";
    statusEl.className = "mapx__status" + (err ? " is-error" : "");
  }
  function fmtDist(d) { return d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km"; }
  function isSoon(s) { return /em breve/i.test(s.nome || ""); }
  function shareText(s) {
    return "A Fórmula — " + s.nome +
      (s.endereco ? "\n" + s.endereco : "") +
      (waDisplay(s) ? "\nWhatsApp: " + waDisplay(s) + " — " + waLink(s) : "") +
      (s.lat && s.lng ? "\nComo chegar: " + mapsLink(s) : "");
  }
  /* número exibível (primeiro da lista, sem sobras) */
  function waDisplay(s) {
    var raw = s.celular || s.telefone;
    if (!raw) return null;
    return String(raw).split("|")[0].trim();
  }
  /* título do card: nome + sigla do estado (sem duplicar quando o nome já traz) */
  function cardTitle(s) {
    if (!s.estado || new RegExp("\\b" + s.estado + "\\b").test(s.nome || "")) return s.nome;
    return s.nome + " - " + s.estado;
  }
  var WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
  /* linha de WhatsApp (ícone + número) no lugar da antiga cidade · UF */
  function phoneLine(s) {
    var num = waDisplay(s), wa = waLink(s);
    if (!num) return s.cidade ? '<p class="railcard__loc">' + s.cidade + (s.estado ? " · " + s.estado : "") + "</p>" : "";
    var inner = WA_ICON + num;
    return '<p class="railcard__loc">' +
      (wa
        ? '<a class="railcard__wanum" href="' + wa + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + inner + "</a>"
        : '<span class="railcard__wanum">' + inner + "</span>") + "</p>";
  }
  var shareBtn = function (s) {
    return '<button type="button" class="railcard__share" title="Compartilhar unidade" aria-label="Compartilhar unidade" onclick="event.stopPropagation();window.__afShare(' + s.id + ',this)">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg></button>';
  };
  window.__afShare = function (id, btn) {
    var s = STORES.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var txt = shareText(s);
    /* desktop: copiar direto (feedback "Copiado ✓") — share nativo só no mobile */
    var mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || "");
    if (mobile && navigator.share) { navigator.share({ title: "A Fórmula — " + s.nome, text: txt }).catch(function () {}); return; }
    function done() { if (!btn) return; btn.classList.add("is-copied"); setTimeout(function () { btn.classList.remove("is-copied"); }, 1900); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done, done); }
    else { var t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (_) {} document.body.removeChild(t); done(); }
  };

  /* Raio do cluster de unidades enquadrado junto com a mais próxima (ver rankNearest). */
  var RAIO_CLUSTER_KM = 2;

  /* Todas as unidades são no Brasil — o mapa não sai daqui: abre enquadrado no país e
     nem o zoom-out nem o arrasto mostram o resto do mundo. */
  var BRASIL_BOUNDS = [[-75.5, -34.5], [-32.0, 6.5]];
  var BRASIL_CENTER = [-52.5, -14.8];
  var BRASIL_ZOOM = 3.55;

  /* ---------- mapa ---------- */
  var map = new maplibregl.Map({
    container: mapEl,
    style: "https://tiles.openfreemap.org/styles/positron",
    bounds: BRASIL_BOUNDS,       // já nasce enquadrado no país, sem passar pelo mundo
    fitBoundsOptions: { padding: 24 },
    maxBounds: BRASIL_BOUNDS,
    pitch: 0,
    attributionControl: { compact: true },
    cooperativeGestures: true,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + scroll para dar zoom no mapa",
      "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + scroll para dar zoom no mapa",
      "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa",
      "NavigationControl.ZoomIn": "Aproximar",
      "NavigationControl.ZoomOut": "Afastar",
      "NavigationControl.ResetBearing": "Redefinir orientação para o norte",
      "GeolocateControl.FindMyLocation": "Usar minha localização",
      "GeolocateControl.LocationNotAvailable": "Localização indisponível"
    }
  });
  window.__afMap = map; // debug/inspeção
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  var geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, showUserLocation: true });
  map.addControl(geo, "bottom-right");
  geo.on("geolocate", function (e) {
    rankNearest(e.coords.latitude, e.coords.longitude, "sua localização");
  });
  geo.on("error", function () {
    status("Não conseguimos acessar sua localização. Autorize no navegador ou busque pelo CEP.", true);
  });
  if (geoBtn) geoBtn.addEventListener("click", function () {
    status("Localizando você…");
    try { geo.trigger(); } catch (_) { status("Não conseguimos acessar sua localização. Autorize no navegador ou busque pelo CEP.", true); }
  });

  map.on("style.load", function () {
    try { map.setProjection({ type: "globe" }); } catch (_) {}
    try {
      map.setSky({
        "sky-color": "#0b3a44", "horizon-color": "#9fd4d9", "fog-color": "#eef6f6",
        "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.35, 9, 0]
      });
    } catch (_) {}
    /* água em teal da marca — o positron cru é cinza demais */
    try {
      map.getStyle().layers.forEach(function (l) {
        if (l.type === "fill" && /water/i.test(l.id)) map.setPaintProperty(l.id, "fill-color", "#a7dade");
        if (l.type === "line" && /water/i.test(l.id)) map.setPaintProperty(l.id, "line-color", "#8fcdd3");
      });
      map.setPaintProperty("background", "background-color", "#f4f6f4");
    } catch (_) {}
    /* prédios 3D — tinta teal sutil, entra no zoom 14 */
    try {
      var srcId = null, st = map.getStyle();
      Object.keys(st.sources).forEach(function (k) { if (st.sources[k].type === "vector") srcId = srcId || k; });
      if (srcId) {
        map.addLayer({
          id: "af-3d-buildings", source: srcId, "source-layer": "building",
          type: "fill-extrusion", minzoom: 13.5,
          paint: {
            "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#e2ecec", 60, "#a8ccd0", 160, "#7fb4ba"],
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15, ["coalesce", ["get", "render_height"], 10]],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.78
          }
        });
      }
    } catch (_) {}
    /* SÓ O BRASIL no mapa: tudo que não é território nacional vira água.
       Pedido do operador em 11/08. A máscara retangular anterior (flancos + teto norte)
       resolvia a África no quadro, mas deixava Peru, Bolívia, Colômbia e Argentina
       desenhados; aqui o recorte é a própria fronteira.
       Por que fronteira de verdade e não retângulo mais fechado: o BRASIL_BOUNDS é quase
       quadrado (aspect 1,004) e a tela não é, então sempre sobra longitude — 16,7° de cada
       lado em 16:9, 30° em 21:9. Fechar o zoom até a largura mandar cortaria 56% da altura
       do país, e maxBounds limita arrasto, não enquadramento. Recortar no polígono é a única
       saída que não corta o Brasil nem deixa vizinho aparecendo.
       Malha oficial do IBGE (v3/malhas/paises/BR), arredondada a 4 decimais (~11 m):
       21 polígonos, ~3.400 vértices, 64 KB — inclui Fernando de Noronha (-32,41) e as
       ilhas oceânicas, que um retângulo em -32,0 apagaria. */
    fetch("encontre-uma-loja_assets/brasil-fronteira.geojson")
      .then(function (r) { return r.json(); })
      .then(function (br) {
        if (!br || !br.coordinates || !br.coordinates.length) return;
        /* Inverso do país: um anel do mundo com cada polígono do Brasil como BURACO.
           Vértices a cada 5° no anel externo — 4 cantos deformam na projeção globo.
           Só o anel externo de cada polígono (ring[0]) entra como buraco: lagoa interna
           do IBGE continua água de verdade, que é o que ela é. */
        var mundo = [], s = 5, x, y;
        for (x = -180; x < 180; x += s) mundo.push([x, -85]);
        for (y = -85; y < 85; y += s) mundo.push([180, y]);
        for (x = 180; x > -180; x -= s) mundo.push([x, 85]);
        for (y = 85; y > -85; y -= s) mundo.push([-180, y]);
        mundo.push([-180, -85]);
        var recorte = [mundo];
        br.coordinates.forEach(function (poly) { recorte.push(poly[0]); });

        map.addSource("af-fora-do-brasil", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: recorte } }
        });
        /* ⚠️ beforeId obrigatório: este bloco é assíncrono (fetch) e pode chegar DEPOIS do
           load das lojas — sem ele a máscara entra no topo e cobre as unidades. */
        var antes = map.getLayer("af-pin-halo") ? "af-pin-halo" : undefined;
        map.addLayer({
          id: "af-mascara-oceano", type: "fill", source: "af-fora-do-brasil",
          /* opacidade 0.999 de propósito: fill 100% opaco vai pra passada "opaque" e os
             rótulos (passada translucent, sem depth test) atravessam por cima — os nomes
             dos países ficavam visíveis sobre a máscara. Abaixo de 1 o fill entra na mesma
             passada dos símbolos, onde a ordem do estilo é respeitada. */
          paint: { "fill-color": "#a7dade", "fill-opacity": 0.999 }
        }, antes);
        /* ...e os RÓTULOS ainda passam por cima: símbolo é desenhado sem depth test, então
           "Peru", "Lima" e "Bolivia" flutuavam na água mesmo com o país coberto. `within`
           na fronteira é o que de fato resolve — e agora o critério é "está no Brasil",
           não "está na janela". Só nas layers de PONTO (país/estado/cidade/aeroporto/nome
           de água): as de linha (rodovia, curso de água) cruzam a fronteira e `within` as
           apagaria inteiras. */
        var BR_POLY = { type: "MultiPolygon", coordinates: br.coordinates };
        map.getStyle().layers.forEach(function (l) {
          if (l.type !== "symbol") return;
          if (!/^(label_|water_name|airport)/.test(l.id)) return;
          try {
            var f = map.getFilter(l.id);
            map.setFilter(l.id, f ? ["all", f, ["within", BR_POLY]] : ["within", BR_POLY]);
          } catch (_) {}
        });
      })
      .catch(function () { /* sem máscara o mapa ainda funciona: degrada, não quebra */ });
  });

  /* voo de abertura: aproximação DENTRO do Brasil (não parte mais do globo do mundo).
     No fim, o zoom do enquadramento vira o piso: afastar não devolve o resto do mundo.
     O piso é calculado (não fixo) porque depende da altura do mapa — no celular ele é
     empilhado com ~60svh e o mesmo zoom não caberia. */
  function padBrasil() {
    /* padding proporcional: no mobile o mapa é uma faixa e padding fixo de desktop
       espremia o enquadramento a ponto de devolver o globo inteiro */
    var c = map.getContainer();
    var flutua = c.clientWidth > 760; // desktop = painel e trilho sobrepõem o mapa
    var v = Math.min(80, Math.round(c.clientHeight * 0.08));
    var h = Math.min(60, Math.round(c.clientWidth * 0.05));
    return { top: v, bottom: flutua ? Math.min(180, Math.round(c.clientHeight * 0.2)) : v, left: h, right: h };
  }
  /* Câmera do país NESTE contêiner. Substitui o BRASIL_ZOOM fixo, que era largo demais em
     desktop: 3,55 abria de lon -128 a +20,5 — Cuba e Bahamas no quadro, o Brasil em ~20% da
     tela e os pins do Nordeste empilhados. O zoom certo depende da largura E da altura, então
     tem que ser calculado (~4,15 em 1920x1080, ~4,55 em 3440x1440, mais fechado no mobile).
     ⚠️ Antes daqui o fit era calculado e logo descartado por um `setZoom(z)` que restaurava o
     zoom largo — o fit só servia pra derivar o piso. Agora ele é o enquadramento de verdade. */
  function camBrasil() {
    var cam = null;
    try { cam = map.cameraForBounds(BRASIL_BOUNDS, { padding: padBrasil() }); } catch (_) {}
    return cam && isFinite(cam.zoom) ? cam : { center: BRASIL_CENTER, zoom: BRASIL_ZOOM };
  }
  function travarNoBrasil() {
    var cam = camBrasil();
    map.jumpTo({ center: cam.center, zoom: cam.zoom });
    map.setMinZoom(cam.zoom - 0.05); // o enquadramento vira o piso: afastar não devolve o mundo
  }
  function intro() {
    if (introDone) return; introDone = true;
    var cam = camBrasil();
    map.flyTo({ center: cam.center, zoom: cam.zoom, pitch: 0, bearing: 0, duration: 3000, essential: true });
    map.once("moveend", function () { travarNoBrasil(); window.__mapReady = true; });
  }
  map.on("load", function () { setTimeout(intro, 650); });
  /* o pulso dos pins repinta o mapa continuamente e pode segurar o evento "load" —
     fallback garante o voo de abertura mesmo assim */
  setTimeout(intro, 3000);

  /* ---------- pins (WebGL circle layers — projetam perfeito no globo e no 3D) ---------- */
  var styleReady = false, pinsReady = false;
  map.on("style.load", function () { styleReady = true; tryPins(); });

  function pinGeojson(arr) {
    return {
      type: "FeatureCollection",
      features: onlyGeo(arr).map(function (s) {
        return { type: "Feature", geometry: { type: "Point", coordinates: [s.lng, s.lat] }, properties: { id: s.id } };
      })
    };
  }

  function tryPins() {
    if (pinsReady || !styleReady || !STORES.length) return;
    pinsReady = true;
    map.addSource("af-stores", { type: "geojson", data: pinGeojson(STORES) });
    map.addLayer({
      id: "af-pin-halo", source: "af-stores", type: "circle",
      paint: { "circle-radius": 8, "circle-color": "#008896", "circle-opacity": 0.35, "circle-pitch-alignment": "map" }
    });
    map.addLayer({
      id: "af-pin-dot", source: "af-stores", type: "circle",
      paint: {
        "circle-radius": 9, "circle-color": "#008896",
        "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff",
        "circle-pitch-alignment": "viewport"
      }
    });
    /* folha A Fórmula dentro de cada pin */
    map.loadImage("encontre-uma-loja_assets/folha-af.webp").then(function (res) {
      if (!map.hasImage("af-leaf")) map.addImage("af-leaf", res.data, { pixelRatio: 2 });
      map.addLayer({
        id: "af-pin-leaf", source: "af-stores", type: "symbol",
        layout: {
          "icon-image": "af-leaf", "icon-size": 0.48,
          "icon-allow-overlap": true, "icon-ignore-placement": true,
          "icon-pitch-alignment": "viewport", "icon-rotation-alignment": "viewport"
        }
      });
      if (leafFilter) map.setFilter("af-pin-leaf", leafFilter);
    }).catch(function () {});
    ["af-pin-dot", "af-pin-leaf"].forEach(function (layer) {
      map.on("click", layer, function (e) {
        var id = e.features[0].properties.id;
        var s = STORES.filter(function (x) { return x.id === id; })[0];
        if (s) focusStore(s, true);
      });
      map.on("mouseenter", layer, function () { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, function () { map.getCanvas().style.cursor = ""; });
    });
    requestAnimationFrame(pulse);
  }

  /* pulso contínuo do halo — a "respiração" do mapa */
  function pulse(now) {
    if (pinsReady) {
      var t = (now % 2400) / 2400;
      try {
        map.setPaintProperty("af-pin-halo", "circle-radius", 7 + t * 20);
        map.setPaintProperty("af-pin-halo", "circle-opacity", 0.5 * (1 - t));
      } catch (_) {}
    }
    requestAnimationFrame(pulse);
  }

  function paintActive() {
    if (!pinsReady) return;
    var col = activeId != null
      ? ["case", ["==", ["get", "id"], activeId], "#4FB6C0", "#008896"] : "#008896";
    var rad = activeId != null
      ? ["case", ["==", ["get", "id"], activeId], 12, 9] : 9;
    map.setPaintProperty("af-pin-dot", "circle-color", col);
    map.setPaintProperty("af-pin-dot", "circle-radius", rad);
    if (map.getLayer("af-pin-leaf")) {
      var sz = activeId != null
        ? ["case", ["==", ["get", "id"], activeId], 0.64, 0.48] : 0.48;
      map.setLayoutProperty("af-pin-leaf", "icon-size", sz);
    }
  }

  function popupFor(s, dist) {
    var wa = waLink(s);
    return new maplibregl.Popup({ offset: 22, closeButton: true, className: "af-pop", maxWidth: "290px" })
      .setLngLat([s.lng, s.lat])
      .setHTML(
        '<div class="af-pop__in"><strong>' + cardTitle(s) + "</strong>" +
        '<span class="af-pop__loc">' + (s.cidade || "") + (dist != null ? " — " + fmtDist(dist) : "") + "</span>" +
        phoneLine(s) +
        (s.endereco ? "<p>" + s.endereco + "</p>" : "") +
        '<div class="af-pop__acts">' +
        (isSoon(s)
          ? '<span class="railcard__soon">Em breve</span>' +
            (wa ? '<a class="wa" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : "")
          : '<a href="' + mapsLink(s) + '" target="_blank" rel="noopener">Como chegar</a>' +
            (wa ? '<a class="wa" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : "") +
            shareBtn(s)) + "</div></div>"
      );
  }

  var openPopup = null;
  function focusStore(s, fly) {
    activeId = s.id;
    paintActive();
    document.querySelectorAll(".railcard.is-active").forEach(function (c) { c.classList.remove("is-active"); });
    var card = railEl.querySelector('[data-id="' + s.id + '"]');
    if (card) { card.classList.add("is-active"); card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }
    if (openPopup) openPopup.remove();
    var dist = card && card.getAttribute("data-dist") ? parseFloat(card.getAttribute("data-dist")) : null;
    openPopup = popupFor(s, dist).addTo(map);
    if (fly !== false) {
      map.flyTo({
        center: [s.lng, s.lat], zoom: 15.6, pitch: 58,
        bearing: (s.id % 2 ? -24 : 24),
        duration: 2600, essential: true
      });
    }
  }

  /* ---------- trilho de cards ---------- */
  function railCard(s, dist) {
    var wa = waLink(s);
    var el = document.createElement("article");
    el.className = "railcard";
    el.setAttribute("data-id", s.id);
    if (dist != null) el.setAttribute("data-dist", dist);
    el.innerHTML =
      '<div class="railcard__top"><h3>' + cardTitle(s) + "</h3>" +
      (dist != null ? '<span class="railcard__dist">' + fmtDist(dist) + "</span>" : "") + "</div>" +
      phoneLine(s) +
      (s.endereco ? '<p class="railcard__addr">' + s.endereco + "</p>" : "") +
      '<div class="railcard__acts">' +
      (isSoon(s)
        ? '<span class="railcard__soon">Em breve</span>' +
          (wa ? '<a class="wa" href="' + wa + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp</a>' : "")
        : '<a href="' + mapsLink(s) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Como chegar</a>' +
          (wa ? '<a class="wa" href="' + wa + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp</a>' : "") +
          shareBtn(s)) +
      "</div>";
    el.addEventListener("click", function () { focusStore(s, true); });
    return el;
  }

  function renderRail(arr, dists) {
    railEl.innerHTML = "";
    arr.forEach(function (s, i) { railEl.appendChild(railCard(s, dists ? dists[i] : null)); });
    railEl.scrollLeft = 0;
    countEl.textContent = (STORES.length && arr.length === STORES.length) ? "" : arr.length + (arr.length === 1 ? " unidade" : " unidades");
  }

  var leafFilter = null;
  function setVisibleMarkers(arr) {
    if (!pinsReady) return;
    var ids = onlyGeo(arr).map(function (s) { return s.id; });
    var f = ["in", ["get", "id"], ["literal", ids]];
    map.setFilter("af-pin-halo", f);
    map.setFilter("af-pin-dot", f);
    leafFilter = f;
    if (map.getLayer("af-pin-leaf")) map.setFilter("af-pin-leaf", f);
  }

  function fitTo(arr, opts) {
    var pts = onlyGeo(arr);
    if (!pts.length) return;
    if (pts.length === 1) { map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 14.5, pitch: 45, duration: 2200 }); return; }
    var b = new maplibregl.LngLatBounds();
    pts.forEach(function (s) { b.extend([s.lng, s.lat]); });
    map.fitBounds(b, Object.assign({ padding: { top: 130, bottom: 240, left: 60, right: 60 }, pitch: 0, bearing: 0, maxZoom: 12.5, duration: 2000 }, opts || {}));
  }

  /* ---------- filtros ---------- */
  function currentFilter() {
    var st = stateSel.value, ci = citySel.value;
    return STORES.filter(function (s) { return (!st || s.estado === st) && (!ci || s.cidade === ci); });
  }
  function populateCities() {
    var st = stateSel.value, seen = {};
    STORES.forEach(function (s) { if ((!st || s.estado === st) && s.cidade) seen[s.cidade] = 1; });
    var list = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "pt"); });
    citySel.innerHTML = '<option value="">Todas as cidades</option>';
    list.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; citySel.appendChild(o); });
    citySel.disabled = !list.length;
  }
  function applyFilter() {
    var arr = currentFilter();
    renderRail(arr);
    setVisibleMarkers(arr);
    fitTo(arr);
    status("");
  }
  stateSel.addEventListener("change", function () { populateCities(); applyFilter(); });
  citySel.addEventListener("change", applyFilter);
  clearBtn.addEventListener("click", function () {
    stateSel.value = ""; populateCities(); citySel.value = ""; cepInput.value = "";
    if (userMarker) { userMarker.remove(); userMarker = null; }
    if (openPopup) { openPopup.remove(); openPopup = null; }
    applyFilter();
    /* volta pro MESMO enquadramento da abertura — com o zoom fixo, "Limpar" devolvia o quadro
       largo mesmo depois de a abertura ter sido corrigida */
    var cam = camBrasil();
    map.flyTo({ center: cam.center, zoom: cam.zoom, pitch: 0, bearing: 0, duration: 2400 });
  });

  /* ---------- mais próximas (CEP ou geolocalização) ---------- */
  function rankNearest(lat, lng, label, opts) {
    var uf = opts && opts.uf;
    var pool = onlyGeo(STORES);
    if (uf) {
      var inState = pool.filter(function (s) { return s.estado === uf; });
      if (inState.length) { pool = inState; }  // só as unidades do estado do CEP
      else { uf = null; }                       // estado sem unidade → cai pro geral
    }
    var ranked = pool.map(function (s) { return { s: s, d: haversine(lat, lng, s.lat, s.lng) }; })
      .sort(function (a, b) { return a.d - b.d; });
    if (!uf) { ranked = ranked.slice(0, 12); }  // sem filtro de estado: 12 mais próximas
    stateSel.value = uf || ""; citySel.value = ""; populateCities();
    renderRail(ranked.map(function (r) { return r.s; }), ranked.map(function (r) { return r.d; }));
    setVisibleMarkers(ranked.map(function (r) { return r.s; }));
    if (userMarker) userMarker.remove();
    var uel = document.createElement("div");
    uel.className = "upin";
    uel.innerHTML = '<span class="upin__pulse"></span><span class="upin__dot"></span>';
    userMarker = new maplibregl.Marker({ element: uel, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    if (opts && opts.exact) {
      /* CEP: enquadra o ponto do CEP JUNTO com a unidade mais próxima.
         Antes era flyTo(zoom 15.4) no ponto exato — e o quadro final não tinha loja
         nenhuma: com a unidade a 3,5 km, o mapa parava numa rua vazia (medido em
         07/08/2026, CEP 01310-100: 0 lojas visíveis no fim do voo). O maxZoom mantém o
         nível de rua quando a loja é pertinho; quando é longe, abre o suficiente p/ caber. */
      var bx = new maplibregl.LngLatBounds().extend([lng, lat]);
      var maisProxima = ranked[0];
      var noQuadro = [];
      if (maisProxima) {
        /* A mais próxima sempre entra. Depois, até 4 vizinhas — mas só as que estiverem
           dentro do RAIO_CLUSTER_KM DELA (não do CEP): é o cluster ao redor da loja, não
           as 5 mais próximas de você. Sem esse corte, uma unidade a 40 km entraria no
           quadro e obrigaria o mapa a abrir demais, escondendo a rua que interessa.

           Por que 2 km e não 1: medindo as 85 unidades, só 2 têm vizinha a ≤1 km (o par
           de Brasília, e uma delas é "Em Breve"). A 2 km entram Feira de Santana (1,43) e
           as 5 de Maceió (1,49–1,89) — 10% da rede, nas cidades onde a pessoa de fato
           escolhe entre unidades. Medido em 07/08/2026 sobre encontre-uma-loja_assets/lojas.json. */
        noQuadro.push(maisProxima);
        for (var k = 1; k < ranked.length && noQuadro.length < 5; k++) {
          var dCluster = haversine(maisProxima.s.lat, maisProxima.s.lng, ranked[k].s.lat, ranked[k].s.lng);
          if (dCluster <= RAIO_CLUSTER_KM) noQuadro.push(ranked[k]);
        }
        noQuadro.forEach(function (r) { bx.extend([r.s.lng, r.s.lat]); });
      }
      var estreito = window.matchMedia && window.matchMedia("(max-width:760px)").matches;
      map.fitBounds(bx, {
        padding: estreito
          ? { top: 90, bottom: 90, left: 40, right: 40 }
          : { top: 140, bottom: 250, left: 70, right: 70 },
        maxZoom: 15.4, pitch: 48, bearing: 0, duration: 4600, essential: true
      });
    } else {
      var b = new maplibregl.LngLatBounds().extend([lng, lat]);
      ranked.slice(0, 4).forEach(function (r) { b.extend([r.s.lng, r.s.lat]); });
      map.fitBounds(b, { padding: { top: 140, bottom: 250, left: 70, right: 70 }, pitch: 38, bearing: -12, maxZoom: 13.5, duration: 2800 });
    }
    status(uf
      ? "Mostrando as " + ranked.length + " unidade(s) de " + uf + ", mais próximas de " + label + "."
      : "Mostrando as " + ranked.length + " unidades mais próximas de " + label + ".");
    revelarLista();
  }

  /* Mobile (≤760px, onde o rail vira position:relative e cai ABAIXO do mapa): depois de
     buscar por CEP ou geolocalização, traz a lista pro campo de visão. Sem isso a pessoa
     digita o CEP, o mapa voa, e o resultado — as lojas e as distâncias — fica fora da tela.
     No desktop o rail já é overlay sobre o mapa, então não faz nada. */
  function revelarLista() {
    if (!window.matchMedia || !window.matchMedia("(max-width:760px)").matches) return;
    var alvo = (railEl && railEl.closest && railEl.closest(".mapx__railwrap")) || railEl;
    if (!alvo) return;
    var suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // block:"end" e não "start": o rail é uma faixa horizontal baixa (~190px). Alinhado ao
    // topo, ele fica espremido sob o header fixo e o resto da tela vira rodapé. Alinhado ao
    // fim, o mapa continua visível em cima e a lista entra embaixo — leitura de app de mapa.
    setTimeout(function () {
      try { alvo.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "end" }); }
      catch (_) { alvo.scrollIntoView(); }
    }, 450);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var cep = digits(cepInput.value);
    if (cep.length !== 8) { status("Digite um CEP válido com 8 dígitos.", true); return; }
    status("Localizando você no mapa…");
    /* 1) AwesomeAPI: coordenada precisa (nível de rua) direto do CEP */
    fetch("https://cep.awesomeapi.com.br/json/" + cep)
      .then(function (r) { return r.json(); })
      .then(function (a) {
        var lat = parseFloat(a && a.lat), lng = parseFloat(a && a.lng);
        if (isFinite(lat) && isFinite(lng) && lat !== 0 && lng !== 0) {
          rankNearest(lat, lng, a.city || "você", { exact: true, uf: a.state });
          return;
        }
        throw new Error("sem-coords");
      })
      .catch(function () {
        /* 2) fallback: ViaCEP (valida) + Nominatim (geocodifica) */
        fetch("https://viacep.com.br/ws/" + cep + "/json/")
          .then(function (r) { return r.json(); })
          .then(function (via) {
            if (via.erro) throw new Error("cep");
            var q = [via.logradouro, via.bairro, via.localidade, via.uf, "Brasil"].filter(Boolean).join(", ");
            return fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=" + encodeURIComponent(q))
              .then(function (r) { return r.json(); })
              .then(function (geo) {
                if (geo.length) return { geo: geo, via: via };
                return fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=" + encodeURIComponent(via.localidade + ", " + via.uf + ", Brasil"))
                  .then(function (r) { return r.json(); }).then(function (g2) { return { geo: g2, via: via }; });
              });
          })
          .then(function (res) {
            if (!res.geo || !res.geo.length) throw new Error("geo");
            rankNearest(parseFloat(res.geo[0].lat), parseFloat(res.geo[0].lon), res.via.localidade || "você", { exact: true, uf: res.via.uf });
          })
          .catch(function () { status("Não conseguimos localizar esse CEP agora. Tente filtrar por estado e cidade.", true); });
      });
  });

  /* ---------- boot ---------- */
  fetch("encontre-uma-loja_assets/lojas.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      STORES = data;
      var states = {};
      STORES.forEach(function (s) { if (s.estado) states[s.estado] = 1; });
      Object.keys(states).sort().forEach(function (st) {
        var o = document.createElement("option"); o.value = st; o.textContent = st; stateSel.appendChild(o);
      });
      populateCities();
      tryPins();
      renderRail(STORES);
    })
    .catch(function () { railEl.innerHTML = '<p class="mapx__empty">Não foi possível carregar as unidades.</p>'; });
})();
