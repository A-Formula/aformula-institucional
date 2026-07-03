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

  /* ---------- mapa ---------- */
  var map = new maplibregl.Map({
    container: mapEl,
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [-30, -10],          // Atlântico — visão de globo
    zoom: 1.1,
    pitch: 0,
    attributionControl: { compact: true },
    cooperativeGestures: true,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + scroll para dar zoom no mapa",
      "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + scroll para dar zoom no mapa",
      "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa"
    }
  });
  window.__afMap = map; // debug/inspeção
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  var geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, showUserLocation: true });
  map.addControl(geo, "bottom-right");
  geo.on("geolocate", function (e) {
    rankNearest(e.coords.latitude, e.coords.longitude, "sua localização");
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
  });

  /* voo de abertura: globo → Brasil */
  function intro() {
    if (introDone) return; introDone = true;
    map.flyTo({ center: [-52.5, -14.8], zoom: 3.55, pitch: 0, bearing: 0, duration: 4200, essential: true });
    map.once("moveend", function () { window.__mapReady = true; });
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
        '<div class="af-pop__in"><strong>' + s.nome + "</strong>" +
        '<span class="af-pop__loc">' + (s.cidade || "") + (s.estado ? " · " + s.estado : "") + (dist != null ? " — " + fmtDist(dist) : "") + "</span>" +
        (s.endereco ? "<p>" + s.endereco + "</p>" : "") +
        '<div class="af-pop__acts"><a href="' + mapsLink(s) + '" target="_blank" rel="noopener">Como chegar</a>' +
        (wa ? '<a class="wa" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : "") + "</div></div>"
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
      '<div class="railcard__top"><h3>' + s.nome + "</h3>" +
      (dist != null ? '<span class="railcard__dist">' + fmtDist(dist) + "</span>" : "") + "</div>" +
      '<p class="railcard__loc">' + (s.cidade || "") + (s.estado ? " · " + s.estado : "") + "</p>" +
      (s.endereco ? '<p class="railcard__addr">' + s.endereco + "</p>" : "") +
      '<div class="railcard__acts">' +
      '<a href="' + mapsLink(s) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Como chegar</a>' +
      (wa ? '<a class="wa" href="' + wa + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp</a>' : "") +
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
    map.flyTo({ center: [-52.5, -14.8], zoom: 3.55, pitch: 0, bearing: 0, duration: 2400 });
  });

  /* ---------- mais próximas (CEP ou geolocalização) ---------- */
  function rankNearest(lat, lng, label, opts) {
    var ranked = onlyGeo(STORES).map(function (s) { return { s: s, d: haversine(lat, lng, s.lat, s.lng) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 12);
    stateSel.value = ""; citySel.value = ""; populateCities();
    renderRail(ranked.map(function (r) { return r.s; }), ranked.map(function (r) { return r.d; }));
    setVisibleMarkers(ranked.map(function (r) { return r.s; }));
    if (userMarker) userMarker.remove();
    var uel = document.createElement("div");
    uel.className = "upin";
    uel.innerHTML = '<span class="upin__pulse"></span><span class="upin__dot"></span>';
    userMarker = new maplibregl.Marker({ element: uel, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
    if (opts && opts.exact) {
      /* CEP: voo com zoom contínuo até centralizar o ponto exato */
      map.flyTo({ center: [lng, lat], zoom: 15.4, pitch: 48, bearing: 0, curve: 1.55, duration: 4600, essential: true });
    } else {
      var b = new maplibregl.LngLatBounds().extend([lng, lat]);
      ranked.slice(0, 4).forEach(function (r) { b.extend([r.s.lng, r.s.lat]); });
      map.fitBounds(b, { padding: { top: 140, bottom: 250, left: 70, right: 70 }, pitch: 38, bearing: -12, maxZoom: 13.5, duration: 2800 });
    }
    status("Mostrando as " + ranked.length + " unidades mais próximas de " + label + ".");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var cep = digits(cepInput.value);
    if (cep.length !== 8) { status("Digite um CEP válido com 8 dígitos.", true); return; }
    status("Localizando você no mapa…");
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
        rankNearest(parseFloat(res.geo[0].lat), parseFloat(res.geo[0].lon), res.via.localidade || "você", { exact: true });
      })
      .catch(function () { status("Não conseguimos localizar esse CEP agora. Tente filtrar por estado e cidade.", true); });
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
