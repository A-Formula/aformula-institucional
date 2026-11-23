/* Sistema do prescritor — v3
   Entrada: AFPresc.mount(container, getToken, accessData). getToken() → Promise<ID token>.
   Dados: GET /api/prescritor-sistema (perfil + lâminas) e ?img=NN-P (páginas, webp).
   Receita = lista de CÓPIAS editáveis das fórmulas (o original da lâmina nunca muda).
   Privacidade: nada do paciente sai do navegador; receituário (logo, rodapé, farmácia) e a receita
   em andamento ficam só neste navegador (localStorage). Nenhuma escrita no Firestore. */
(function () {
  "use strict";
  var esc = function (s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var norm = function (s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var LS_CFG = "afp-receituario-v1", LS_RX = "afp-receita-v1";
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }

  var S = { laminas: [], perfil: {}, lojas: [], tab: "formulas", q: "", esp: null, rx: [], imgCache: {}, open: null, paciente: "" };

  var ICON = {
    formulas: '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.5V3"/><path d="M7.5 15h9"/>',
    laminas: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    prescrever: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    receituario: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M8 16c.8-1.6 2.2-2.4 4-2.4s3.2.8 4 2.4"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    mais: '<path d="M12 5v14M5 12h14"/>', ok: '<path d="m5 12 5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    doses: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
    escudo: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    voltar: '<path d="M15 18l-6-6 6-6"/>', loja: '<path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9h18M9 20v-6h6v6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'
  };
  function ic(n, sz) { return '<svg class="afp-ic" width="' + (sz || 20) + '" height="' + (sz || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + "</svg>"; }

  /* Formas farmacêuticas da manipulação — ícone + nome (o nome sempre aparece). via = sugestão automática. */
  var P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  var FI = {
    capsula: '<g transform="rotate(-40 16 16)"><rect x="5" y="11" width="22" height="10" rx="5"/><path d="M16 11v10"/></g>',
    gastro: '<g transform="rotate(-40 16 16)"><rect x="5" y="11" width="22" height="10" rx="5"/><path d="M16 11v10"/></g><path d="M24 19.5l4 1.5v3c0 2.4-1.7 4.2-4 4.8-2.3-.6-4-2.4-4-4.8v-3z"/>',
    vegetal: '<g transform="rotate(-40 16 16)"><rect x="5" y="11" width="22" height="10" rx="5"/><path d="M16 11v10"/></g><path d="M21 28c0-4 3-7 7-7 0 4-3 7-7 7zM21 28l4-4"/>',
    softgel: '<ellipse cx="16" cy="16" rx="11" ry="7" transform="rotate(-30 16 16)"/><path d="M12 17c0-2 2-4 2-4s2 2 2 4a2 2 0 0 1-4 0z"/>',
    comprimido: '<circle cx="16" cy="16" r="10"/><path d="M9 16h14"/>',
    sublingual: '<circle cx="16" cy="12" r="6"/><path d="M6 22c3 4 7 6 10 6s7-2 10-6"/><path d="M11 22c2 2 3.5 2.5 5 2.5s3-.5 5-2.5"/>',
    po: '<path d="M6 14h14l-2 12H8z"/><path d="M20 16l7-5"/><path d="M11 10l1-2M15 9l.5-3M9 6l.5 1"/>',
    sache: '<path d="M8 7l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"/><path d="M12 15h8M12 19h5"/>',
    goma: '<circle cx="11" cy="9" r="3"/><circle cx="21" cy="9" r="3"/><path d="M9 13c-1.5 2-2 4-1 6l-1 5c0 2 2 3 4 2l2-1h6l2 1c2 1 4 0 4-2l-1-5c1-2 .5-4-1-6-2-2-4-3-7-3s-5 1-7 3z"/>',
    pirulito: '<circle cx="13" cy="12" r="8"/><path d="M13 12c0-2.5 2-4 4-3M13 12c0 2.5-2.5 4-4.5 3"/><path d="M19 18l8 9"/>',
    chocolate: '<rect x="6" y="5" width="20" height="22" rx="2"/><path d="M6 12h20M6 19h20M13 5v22M19 5v22"/>',
    strip: '<rect x="4" y="11" width="24" height="10" rx="2" transform="rotate(-12 16 16)"/><path d="M9 15l14-3" opacity=".5"/>',
    cafe: '<path d="M6 12h16v7a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z"/><path d="M22 14h2a3 3 0 0 1 0 6h-2"/><path d="M11 4c-1 2 1 3 0 5M16 4c-1 2 1 3 0 5"/>',
    gotas: '<path d="M16 4c5 6 8 10 8 14a8 8 0 0 1-16 0c0-4 3-8 8-14z"/><path d="M12 19a4 4 0 0 0 4 4"/>',
    xarope: '<path d="M13 4h6v4l3 3v15a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V11l3-3z"/><path d="M10 17h12"/>',
    shot: '<path d="M12 4h8M13 4v5l-2 3v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V12l-2-3V4"/><path d="M11 18h10"/>',
    creme: '<rect x="6" y="14" width="20" height="13" rx="3"/><rect x="8" y="9" width="16" height="5" rx="1.5"/><path d="M11 20h10"/>',
    gel: '<path d="M9 5h14l-2 18h-10z"/><path d="M13 23h6v3h-6z"/><path d="M11 10h10"/>',
    locao: '<path d="M14 4h6M17 4v4M12 8h10v3l2 3v12a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V14l2-3z"/><path d="M20 4v-1h4"/>',
    serum: '<path d="M14 3h4v5h-4z"/><path d="M12 8h8v2l2 3v13a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V13l2-3z"/><path d="M16 15v6"/><circle cx="16" cy="23" r="1"/>',
    shampoo: '<path d="M12 6h8v4l3 4v12a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V14l3-4z"/><path d="M14 3h4v3h-4z"/><path d="M13 18c2-2 4 2 6 0"/>',
    transdermico: '<path d="M8 20V11a2 2 0 0 1 4 0v6M12 15V8a2 2 0 0 1 4 0v8M16 12V9a2 2 0 0 1 4 0v8M20 14a2 2 0 0 1 4 0v4c0 5-3 9-8 9-3 0-5-1-7-4l-3-4a2 2 0 0 1 3-2l2 2"/>',
    stick: '<rect x="11" y="13" width="10" height="15" rx="2"/><path d="M12 13V8c0-2 1.5-4 4-4s4 2 4 4v5"/><path d="M11 18h10"/>',
    spray: '<path d="M12 12h8v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/><path d="M13 12V8h6v4M19 8h3M25 6h.01M25 9h.01M27 7.5h.01"/>',
    ovulo: '<path d="M16 4c5 0 8 7 8 13a8 8 0 0 1-16 0c0-6 3-13 8-13z"/><path d="M12 15c1-3 2-5 4-6"/>',
    colirio: '<path d="M14 4h4v4l3 3v6H11v-6l3-3z"/><path d="M11 17h10v7a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2z"/><path d="M16 28v2"/>',
    outra: '<circle cx="16" cy="16" r="11"/><path d="M11 16h.01M16 16h.01M21 16h.01"/>'
  };
  var FOTO = { capsula: "produto-capsulas", gastro: "produto-capsulas", vegetal: "produto-capsulas", goma: "forma-goma", pirulito: "forma-pirulito",
    chocolate: "forma-chocolate", strip: "forma-filme", gel: "forma-gel", gotas: "forma-gotas", sache: "forma-sache", shot: "forma-shot",
    spray: "forma-spray", sublingual: "forma-sublingual", xarope: "forma-xarope", cafe: "produto-cafe", creme: "derma-jar-2", comprimido: "forma-pastilha" };
  function foto(n, sz) {
    if (!FOTO[n]) return '<span class="afp-ph afp-ph-ic" style="width:' + sz + 'px;height:' + sz + 'px">' + fic(n, Math.round(sz * .55)) + "</span>";
    return '<span class="afp-ph" style="width:' + sz + 'px;height:' + sz + 'px"><img alt="" src="/index_assets/' + FOTO[n] + '-thumb.webp"></span>';
  }
  function fic(n, sz) { return '<svg class="afp-ic" width="' + (sz || 30) + '" height="' + (sz || 30) + '" viewBox="0 0 32 32" ' + P + ' aria-hidden="true">' + (FI[n] || FI.outra) + "</svg>"; }
  var FORMAS = [
    { g: "Cápsulas e comprimidos", itens: [
      ["capsula", "Cápsula", "oral"], ["gastro", "Cápsula gastrorresistente", "oral"], ["vegetal", "Cápsula vegetal", "oral"],
      ["softgel", "Cápsula oleosa (softgel)", "oral"], ["comprimido", "Comprimido", "oral"], ["sublingual", "Comprimido sublingual", "sublingual"]] },
    { g: "Formas diferenciadas", itens: [
      ["goma", "Goma (gummy)", "oral"], ["pirulito", "Pirulito", "oral"], ["chocolate", "Chocolate funcional", "oral"],
      ["strip", "Strip oral (filme)", "oral"], ["cafe", "Café funcional", "oral"], ["sache", "Sachê", "oral"], ["po", "Pó", "oral"]] },
    { g: "Líquidos", itens: [
      ["gotas", "Gotas", "oral"], ["xarope", "Xarope / solução oral", "oral"], ["shot", "Shot / flaconete", "oral"]] },
    { g: "Uso tópico", itens: [
      ["creme", "Creme", "tópica"], ["gel", "Gel", "tópica"], ["locao", "Loção", "tópica"], ["serum", "Sérum", "tópica"],
      ["shampoo", "Shampoo", "tópica"], ["stick", "Stick", "tópica"], ["spray", "Spray", "tópica"], ["transdermico", "Gel transdérmico", "transdérmica"]] },
    { g: "Outras vias", itens: [
      ["ovulo", "Óvulo vaginal", "vaginal"], ["colirio", "Colírio", "oftálmica"]] }
  ];
  var FORMA_LIST = []; FORMAS.forEach(function (g) { g.itens.forEach(function (i) { FORMA_LIST.push({ id: i[0], nome: i[1], via: i[2] }); }); });
  // reconhece a forma escrita na lâmina ("cápsula gastrorresistente", "creme vaginal"…) — a mais específica vence
  function formaDe(txt) {
    var t = norm(txt); if (!t) return null;
    var regras = [["gastro", /gastro/], ["vegetal", /vegetal|veg\b/], ["softgel", /oleos|softgel/], ["sublingual", /sublingual/], ["goma", /goma|gummy|gomin/],
      ["pirulito", /pirulito/], ["chocolate", /chocolate/], ["strip", /strip|filme/], ["cafe", /cafe/], ["sache", /sache/], ["ovulo", /ovulo/],
      ["transdermico", /transderm|pentravan|plo/], ["shampoo", /shampoo/], ["serum", /serum/], ["locao", /locao/], ["spray", /spray/], ["stick", /stick/],
      ["colirio", /colirio/], ["gotas", /gota/], ["xarope", /xarope|solucao oral|suspens/], ["shot", /shot|flaconete/], ["gel", /\bgel\b/],
      ["creme", /creme|pomada/], ["comprimido", /comprimido/], ["po", /\bpo\b/], ["capsula", /capsula/]];
    for (var i = 0; i < regras.length; i++) if (regras[i][1].test(t)) return regras[i][0];
    return null;
  }

  function api(qs) {
    return S.getToken().then(function (t) { return fetch("/api/prescritor-sistema" + (qs || ""), { headers: { Authorization: "Bearer " + t } }); });
  }

  /* ---------- montagem ---------- */
  function mount(el, getToken, access) {
    S.el = el; S.getToken = getToken; S.access = access || {};
    el.innerHTML = "";
    // TRAVA: fora do piloto (403) ou com qualquer erro, o sistema some e a página fica exatamente como antes.
    function sair() { if (el.parentNode) el.parentNode.removeChild(el); }
    Promise.all([
      api().then(function (r) { if (!r.ok) throw new Error("api " + r.status); return r.json(); }),
      fetch("/encontre-uma-loja_assets/lojas.json").then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
    ]).then(function (x) {
      S.laminas = x[0].laminas || []; S.lojas = x[1] || [];
      aplicarPerfil(x[0].perfil || {});
      S.rx = lsGet(LS_RX, []);
      if (!S.perfil.consultorioCompleto) return viewConsultorio(false);   // 2ª etapa obrigatória
      render();
    }).catch(function (e) {
      if (window.console) console.warn("[area-prescritor] sistema desligado:", e && e.message);
      sair();
    });
  }
  // Identificação e rodapé vêm do CADASTRO (não editáveis no receituário). Neste navegador só: logo e farmácia.
  function aplicarPerfil(p) {
    S.perfil = p;
    var salvo = lsGet(LS_CFG, {}), cid = p.cidadeConsultorio || p.cidade, uf = p.ufEndereco || p.uf;
    var linha1 = [[p.endereco, p.numero, p.complemento].filter(Boolean).join(", "), p.bairro, [cid, uf].filter(Boolean).join("/"), p.cep ? "CEP " + p.cep : ""].filter(Boolean).join(" — ");
    var linha2 = [p.telConsultorio || p.telefone, p.emailReceita || p.email].filter(Boolean).join(" · ");
    S.cfg = {
      nome: p.nome || S.access.nome || "",
      registro: [p.conselho, p.registroNumero].filter(Boolean).join(" ") + (p.uf ? "/" + p.uf : ""),
      especialidade: p.especialidade || "",
      rodape: [linha1, linha2].filter(Boolean).join("\n"),
      logo: salvo.logo || "", farmaciaOn: !!salvo.farmaciaOn, farmaciaId: salvo.farmaciaId || ""
    };
    // Região: sem farmácia escolhida, sugere a unidade da mesma cidade do consultório (ou do mesmo estado)
    if (!S.cfg.farmaciaId && S.lojas.length) {
      var mc = S.lojas.filter(function (l) { return norm(l.cidade) === norm(cid) && (!uf || l.estado === uf); })[0];
      var me = S.lojas.filter(function (l) { return uf && l.estado === uf; })[0];
      if (mc || me) S.cfg.farmaciaId = String((mc || me).id);
    }
  }

  /* ---------- 2ª etapa do cadastro: consultório (obrigatória antes de usar) ---------- */
  var UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
  function viewConsultorio(editando) {
    var p = S.perfil, el = S.el;
    function fld(id, rotulo, val, extra) { return '<label class="afp-full"><span>' + rotulo + '</span><input class="afp-in" id="' + id + '" value="' + esc(val || "") + '" ' + (extra || "") + "></label>"; }
    el.innerHTML = '<div class="afp-onb"><div class="afp-onb-card">' +
      (editando ? '<button class="afp-link afp-back" data-voltar>' + ic("voltar", 16) + " Voltar</button>" : "") +
      '<span class="afp-onb-ic">' + ic("receituario", 26) + "</span>" +
      "<h2>" + (editando ? "Dados do consultório" : "Falta pouco: complete seu cadastro") + "</h2>" +
      "<p>" + (editando ? "Esses dados aparecem no rodapé da sua receita." : "Para liberar as formulações, as lâminas e o receituário, informe o consultório. Esses dados aparecem no rodapé da sua receita.") + "</p>" +
      '<div class="afp-onb-id">' + ic("escudo", 16) + "<span><b>" + esc(S.cfg.nome) + "</b> · " + esc(S.cfg.registro) + (S.cfg.especialidade ? " · " + esc(S.cfg.especialidade) : "") + "</span></div>" +
      '<form id="afp-cons" novalidate>' +
      '<div class="afp-onb-g"><div class="afp-g-cep">' + fld("c-cep", "CEP *", p.cep, 'inputmode="numeric" autocomplete="postal-code" placeholder="00000-000"') + "</div>" +
      '<div class="afp-g-end">' + fld("c-end", "Endereço *", p.endereco, 'autocomplete="address-line1" placeholder="Rua, avenida"') + "</div>" +
      '<div class="afp-g-num">' + fld("c-num", "Número *", p.numero, 'placeholder="123"') + "</div>" +
      '<div class="afp-g-comp">' + fld("c-comp", "Complemento", p.complemento, 'placeholder="Sala, andar"') + "</div>" +
      '<div class="afp-g-bai">' + fld("c-bai", "Bairro *", p.bairro) + "</div>" +
      '<div class="afp-g-cid">' + fld("c-cid", "Cidade *", p.cidadeConsultorio || p.cidade) + "</div>" +
      '<div class="afp-g-uf"><label class="afp-full"><span>Estado *</span><select class="afp-in" id="c-uf"><option value="">UF</option>' +
      UFS.map(function (u) { return '<option' + ((p.ufEndereco || p.uf) === u ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="afp-g-tel">' + fld("c-tel", "Telefone do consultório *", p.telConsultorio || p.telefone, 'type="tel" placeholder="(11) 3000-0000"') + "</div>" +
      '<div class="afp-g-mail">' + fld("c-mail", "E-mail na receita", p.emailReceita, 'type="email" placeholder="Opcional — se diferente do e-mail de acesso"') + "</div></div>" +
      '<p class="afp-msg" id="c-msg"></p>' +
      '<button class="afp-btn afp-btn-lg" type="submit">' + ic("ok", 18) + (editando ? " Salvar" : " Concluir cadastro e entrar") + "</button></form></div></div>";
    var f = el.querySelector("#afp-cons"), msgEl = el.querySelector("#c-msg"), g = function (id) { return el.querySelector("#" + id); };
    var vb = el.querySelector("[data-voltar]"); if (vb) vb.addEventListener("click", function () { S.tab = "receituario"; render(); });
    // CEP → preenche endereço (ViaCEP; só o CEP sai do navegador)
    g("c-cep").addEventListener("input", function () {
      var d = this.value.replace(/\D/g, "").slice(0, 8);
      this.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
      if (d.length !== 8) return;
      fetch("https://viacep.com.br/ws/" + d + "/json/").then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.erro) return;
        if (!g("c-end").value) g("c-end").value = j.logradouro || "";
        if (!g("c-bai").value) g("c-bai").value = j.bairro || "";
        g("c-cid").value = j.localidade || g("c-cid").value; g("c-uf").value = j.uf || g("c-uf").value;
        (g("c-end").value ? g("c-num") : g("c-end")).focus();
      }).catch(function () {});
    });
    f.addEventListener("input", function (e) { e.target.classList && e.target.classList.remove("afp-bad"); });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var c = { cep: g("c-cep").value.trim(), endereco: g("c-end").value.trim(), numero: g("c-num").value.trim(), complemento: g("c-comp").value.trim(),
        bairro: g("c-bai").value.trim(), cidadeConsultorio: g("c-cid").value.trim(), ufEndereco: g("c-uf").value, telConsultorio: g("c-tel").value.trim(), emailReceita: g("c-mail").value.trim() };
      var regras = [["c-cep", c.cep.replace(/\D/g, "").length === 8], ["c-end", !!c.endereco], ["c-num", !!c.numero], ["c-bai", !!c.bairro], ["c-cid", !!c.cidadeConsultorio],
        ["c-uf", !!c.ufEndereco], ["c-tel", c.telConsultorio.replace(/\D/g, "").length >= 10], ["c-mail", !c.emailReceita || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.emailReceita)]];
      var ruim = regras.filter(function (r) { g(r[0]).classList.toggle("afp-bad", !r[1]); return !r[1]; });
      if (ruim.length) { msgEl.className = "afp-msg on"; msgEl.textContent = "Confira os campos destacados."; g(ruim[0][0]).focus(); return; }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true; msgEl.className = "afp-msg";
      S.getToken().then(function (t) {
        return fetch("/api/prescritor-sistema", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ consultorio: c }) });
      }).then(function (r) { if (!r.ok) throw r.status; return r.json(); }).then(function () {
        var np = Object.assign({}, S.perfil, c, { consultorioCompleto: true }); aplicarPerfil(np);
        if (!editando) S.tab = "formulas";
        render(); toast(editando ? "Dados do consultório atualizados" : "Cadastro concluído");
      }).catch(function () { btn.disabled = false; msgEl.className = "afp-msg on"; msgEl.textContent = "Não foi possível salvar agora. Tente de novo em instantes."; });
    });
    g(p.cep ? "c-num" : "c-cep").focus();
  }
  function saveRx() { lsSet(LS_RX, S.rx); }

  function render() {
    var nav = [
      ["formulas", "formulas", "Formulações", "Fórmulas por condição"],
      ["laminas", "laminas", "Lâminas técnicas", "Material completo"],
      ["prescrever", "prescrever", "Prescrever", S.rx.length ? S.rx.length + " na receita" : "Monte a receita"],
      ["receituario", "receituario", "Meu receituário", "Logo, dados e rodapé"]
    ];
    var nome = (S.cfg && S.cfg.nome) || S.access.nome || "";
    var top = '<header class="afp-top"><div><p class="afp-eyebrow">Área do prescritor</p><h1>Olá, <em>' + esc(nome.split(" ").slice(0, 2).join(" ")) + "</em></h1>" +
      '<p class="afp-top-sub">' + esc([S.cfg && S.cfg.registro, S.cfg && S.cfg.especialidade].filter(Boolean).join(" · ")) + "</p></div>" +
      '<button class="afp-ghost afp-sair" data-sair>Sair</button></header>';
    S.el.innerHTML = top + '<div class="afp-shell"><aside class="afp-side"><nav>' + nav.map(function (t) {
      return '<button class="afp-nav" aria-current="' + (S.tab === t[0]) + '" data-tab="' + t[0] + '"><span class="afp-navic">' + ic(t[1]) + "</span>" +
        "<span><b>" + esc(t[2]) + "</b><small>" + esc(t[3]) + "</small></span>" +
        (t[0] === "prescrever" && S.rx.length ? '<i class="afp-badge">' + S.rx.length + "</i>" : "") + "</button>";
    }).join("") + '</nav><p class="afp-aviso">' + ic("escudo", 16) + "<span>Material exclusivo para prescritores habilitados (RDC 67/2007, item 5.14).</span></p></aside>" +
      '<section class="afp-main" id="afp-view"></section></div>';
    S.el.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { S.tab = b.getAttribute("data-tab"); S.open = null; render(); window.scrollTo({ top: S.el.getBoundingClientRect().top + scrollY - 90, behavior: "smooth" }); });
    });
    var sair = S.el.querySelector("[data-sair]"); if (sair) sair.addEventListener("click", function () { var b = document.getElementById("pa-sair"); if (b) b.click(); });
    var v = S.el.querySelector("#afp-view");
    ({ formulas: viewFormulas, laminas: viewLaminas, prescrever: viewPrescrever, receituario: viewReceituario })[S.tab](v);
  }
  function head(t, p, extra) { t = t.replace(/\*(.+?)\*/g, "<em>$1</em>"); return '<header class="afp-vh"><div><h2>' + t + "</h2>" + (p ? "<p>" + p + "</p>" : "") + "</div>" + (extra || "") + "</header>"; }

  /* ---------- helpers de fórmula ---------- */
  function lamina(n) { return S.laminas.filter(function (x) { return x.n === n; })[0]; }
  function original(key) { var p = key.split(":"), l = lamina(p[0]); return l ? { l: l, f: l.formulas[+p[1]] } : null; }
  function isBase(a) { return /^(excipiente|base\b|ve[ií]culo)/i.test(a || "") || /qsp/i.test(a || ""); }
  function ativos(f) { return (f.componentes || []).filter(function (c) { return !isBase(c.ativo); }).map(function (c) { return (c.ativo || "").replace(/\s*\(.*?\)/g, "").trim(); }); }
  function doses(f) {
    var q = f.quantidade || "", m = q.match(/(\d+)\s*(doses?|c[áa]psulas?|sach[êe]s?|unidades?)/i);
    if (m) return m[1] + " " + m[2].toLowerCase();
    m = q.match(/(\d+[.,]?\d*\s*(g|ml|mL))\b/); return m ? m[1] : "";
  }
  function viaLabel(f) { return f.via ? "Uso " + f.via.toLowerCase().replace(/(ic|ér|érm)a\b/, "$1o").replace(/ica\b/, "ico") : ""; }
  function copia(key) {
    var o = original(key).f;
    var fq = (o.quantidade || "").match(/\(([^)]+)\)/), forma = o.forma || (fq && formaDe(fq[1]) ? fq[1] : "");
    return { src: key, nome: o.nome, forma: forma, via: o.via || "", componentes: (o.componentes || []).map(function (c) { return { ativo: c.ativo, dose: c.dose }; }), quantidade: o.quantidade || "", posologia: o.posologia || "" };
  }
  function naReceita(key) { return S.rx.some(function (r) { return r.src === key; }); }

  /* ---------- editor (pop-up) ---------- */
  function editor(item, idx) {
    // item = cópia editável; idx = posição na receita (null = novo)
    var src = original(item.src), l = src && src.l, f = JSON.parse(JSON.stringify(item));
    var d = document.createElement("div"); d.className = "afp-modal";
    function rows() {
      return f.componentes.map(function (c, i) {
        return '<div class="afp-row"><input class="afp-in" data-k="ativo" data-i="' + i + '" value="' + esc(c.ativo) + '" aria-label="Ativo">' +
          '<input class="afp-in afp-in-dose" data-k="dose" data-i="' + i + '" value="' + esc(c.dose) + '" aria-label="Dose">' +
          '<button class="afp-icbtn" data-rm="' + i + '" aria-label="Remover ativo">' + ic("x", 16) + "</button></div>";
      }).join("");
    }
    d.innerHTML = '<div class="afp-dlg" role="dialog" aria-modal="true" aria-label="Editar fórmula">' +
      '<header class="afp-dlg-h"><div><span class="afp-tag">' + esc(l ? l.titulo : "") + '</span><input class="afp-title-in" data-f="nome" value="' + esc(f.nome) + '" aria-label="Nome da fórmula"></div>' +
      '<button class="afp-icbtn" data-close aria-label="Fechar">' + ic("x") + "</button></header>" +
      '<div class="afp-dlg-b">' +
      (src && src.f.indicacao ? '<p class="afp-ind">' + esc(src.f.indicacao) + "</p>" : "") +
      '<div class="afp-forma" id="afp-forma"></div>' +
      '<div class="afp-comp-h"><span>Ativo</span><span>Dose</span></div><div id="afp-rows">' + rows() + "</div>" +
      '<button class="afp-ghost" data-addrow>' + ic("mais", 16) + " Adicionar ativo</button>" +
      '<label class="afp-full"><span>Quantidade</span><input class="afp-in" data-f="quantidade" value="' + esc(f.quantidade) + '" placeholder="ex.: Fazer 30 doses"></label>' +
      '<label class="afp-full"><span>Posologia</span><textarea class="afp-in" data-f="posologia" rows="2">' + esc(f.posologia) + "</textarea></label>" +
      (src && src.f.observacoes ? '<p class="afp-obs">' + esc(src.f.observacoes) + "</p>" : "") +
      (src ? (function () {
        var o = src.f, chips = [];
        tagsUso(o).forEach(function (t) { chips.push('<button type="button" class="afp-tagchip" data-tag="' + esc(t) + '">' + esc(t) + "</button>"); });
        ativos(o).forEach(function (t) { chips.push('<button type="button" class="afp-tagchip afp-tag-at" data-tag="' + esc(t) + '">' + esc(t) + "</button>"); });
        var rel = relacionadas(item.src, 4);
        return '<div class="afp-relbox"><p class="afp-fg">Relacionado a</p><div class="afp-tags">' + chips.join("") +
          '<button type="button" class="afp-tagchip afp-tag-lam" data-lamtag>' + esc(src.l.titulo) + "</button></div>" +
          (rel.length ? '<p class="afp-fg">Fórmulas relacionadas</p><div class="afp-rel">' + rel.map(function (r) {
            return '<button type="button" class="afp-relit" data-relk="' + r.key + '"><b>' + esc(r.f.nome) + "</b><small>" + esc(r.l.titulo) + "</small></button>";
          }).join("") + "</div>" : "") + "</div>";
      })() : "") +
      "</div>" +
      '<footer class="afp-dlg-f">' + (l ? '<button class="afp-link" data-lam>' + ic("laminas", 16) + " Ver lâmina</button>" : "<span></span>") +
      '<div class="afp-dlg-fa">' + '<button class="afp-ghost" data-reset title="Voltar ativos, doses, forma e posologia para o que está na lâmina">Redefinir fórmula</button>' +
      '<button class="afp-btn" data-save>' + ic(idx != null ? "ok" : "mais", 18) + (idx != null ? " Salvar alterações" : " Adicionar à receita") + "</button></div></footer></div>";
    document.body.appendChild(d); document.body.classList.add("afp-lock");
    function close() { d.remove(); document.body.classList.remove("afp-lock"); document.removeEventListener("keydown", k); }
    function k(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", k);
    function wireRows() {
      d.querySelectorAll("[data-i]").forEach(function (inp) { inp.addEventListener("input", function () { f.componentes[+inp.getAttribute("data-i")][inp.getAttribute("data-k")] = inp.value; }); });
      d.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { f.componentes.splice(+b.getAttribute("data-rm"), 1); d.querySelector("#afp-rows").innerHTML = rows(); wireRows(); }); });
    }
    wireRows();
    // seletor de forma farmacêutica — fechado por padrão; mantém a forma que vem da fórmula
    var aberto = false, sug = copia(f.src);
    function mudou() { return (f.forma || "") !== (sug.forma || "") || (f.via || "") !== (sug.via || ""); }
    function formaUI() {
      var cur = formaDe(f.forma), box = d.querySelector("#afp-forma");
      box.innerHTML = '<div class="afp-forma-cur">' + foto(cur || "outra", 46) +
        '<div class="afp-forma-txt"><small>Forma farmacêutica</small><b>' + (esc(f.forma) || "Não informada na lâmina") + "</b>" + (f.via ? "<span>" + esc(viaLabel(f)) + "</span>" : "") + "</div>" +
        (mudou() ? '<button type="button" class="afp-link afp-reset" data-freset title="Voltar para a forma sugerida na lâmina">Redefinir</button>' : "") + '<button type="button" class="afp-ghost" data-ftog>' + (aberto ? "Fechar" : f.forma ? "Alterar" : "Escolher forma") + "</button></div>" +
        (aberto ? '<div class="afp-forma-pick"><div class="afp-two"><label><span>Forma (escreva ou escolha abaixo)</span><input class="afp-in" data-f2="forma" value="' + esc(f.forma) + '"></label>' +
          '<label><span>Via</span><input class="afp-in" data-f2="via" value="' + esc(f.via) + '" placeholder="oral"></label></div>' +
          FORMAS.map(function (g) {
            return '<p class="afp-fg">' + esc(g.g) + '</p><div class="afp-fgrid">' + g.itens.map(function (i) {
              return '<button type="button" class="afp-fopt" aria-pressed="' + (cur === i[0]) + '" data-fo="' + i[0] + '">' + foto(i[0], 52) + "<span>" + esc(i[1]) + "</span></button>";
            }).join("") + "</div>";
          }).join("") + "</div>" : "");
      var fr = box.querySelector("[data-freset]"); if (fr) fr.addEventListener("click", function () { f.forma = sug.forma; f.via = sug.via; aberto = false; formaUI(); });
      box.querySelector("[data-ftog]").addEventListener("click", function () { aberto = !aberto; formaUI(); });
      box.querySelectorAll("[data-f2]").forEach(function (inp) { inp.addEventListener("change", function () { f[inp.getAttribute("data-f2")] = inp.value; formaUI(); }); });
      box.querySelectorAll("[data-fo]").forEach(function (b) { b.addEventListener("click", function () {
        var it = FORMA_LIST.filter(function (x) { return x.id === b.getAttribute("data-fo"); })[0];
        f.forma = it.nome.replace(/\s*\(.*?\)/, ""); f.via = it.via; aberto = false; formaUI();
      }); });
    }
    formaUI();
    d.querySelectorAll("[data-f]").forEach(function (inp) { inp.addEventListener("input", function () { f[inp.getAttribute("data-f")] = inp.value; }); });
    d.querySelector("[data-addrow]").addEventListener("click", function () { f.componentes.push({ ativo: "", dose: "" }); d.querySelector("#afp-rows").innerHTML = rows(); wireRows(); var ins = d.querySelectorAll('[data-k="ativo"]'); ins[ins.length - 1].focus(); });
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-close]")) close(); });
    d.querySelector("[data-save]").addEventListener("click", function () {
      f.componentes = f.componentes.filter(function (c) { return (c.ativo || "").trim(); });
      if (idx != null) S.rx[idx] = f; else S.rx.push(f);
      saveRx(); close(); render(); toast(idx != null ? "Fórmula atualizada" : "Adicionada à receita");
    });
    wireTags(d, close);
    var lt = d.querySelector("[data-lamtag]"); if (lt) lt.addEventListener("click", function () { close(); S.tab = "laminas"; S.open = src.l.n; render(); });
    d.querySelectorAll("[data-relk]").forEach(function (b) { b.addEventListener("click", function () { close(); editor(copia(b.getAttribute("data-relk")), null); }); });
    var rs = d.querySelector("[data-reset]"); if (rs) rs.addEventListener("click", function () { close(); editor(copia(item.src), idx); });
    var lm = d.querySelector("[data-lam]"); if (lm) lm.addEventListener("click", function () { close(); S.tab = "laminas"; S.open = l.n; render(); });
    d.querySelector(".afp-title-in").focus();
  }
  function toast(t) {
    var n = document.createElement("div"); n.className = "afp-toast"; n.innerHTML = ic("ok", 16) + esc(t);
    document.body.appendChild(n); setTimeout(function () { n.classList.add("out"); }, 1800); setTimeout(function () { n.remove(); }, 2200);
  }

  /* ---------- tags ---------- */
  function tagsUso(f) { return f.tags || []; }
  function buscarTag(t) { S.q = t; S.esp = null; S.tab = "formulas"; render(); var n = S.el.querySelector(".afp-search input"); if (n) n.focus(); }
  function relacionadas(key, n) {
    var o = original(key); if (!o) return [];
    var tg = tagsUso(o.f).map(norm), at = ativos(o.f).map(norm);
    return todas().filter(function (it) { return it.key !== key; }).map(function (it) {
      var sc = 0;
      tagsUso(it.f).forEach(function (t) { if (tg.indexOf(norm(t)) > -1) sc += 2; });
      ativos(it.f).forEach(function (a) { if (at.indexOf(norm(a)) > -1) sc += 1; });
      return { it: it, sc: sc };
    }).filter(function (x) { return x.sc >= 3; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, n || 4).map(function (x) { return x.it; });
  }

  /* ---------- formulações ---------- */
  function todas() {
    var out = [];
    S.laminas.forEach(function (l) { (l.formulas || []).forEach(function (f, i) { out.push({ l: l, f: f, key: l.n + ":" + i }); }); });
    return out;
  }
  function card(it) {
    var f = it.f, on = naReceita(it.key), at = ativos(f), ds = doses(f);
    return '<article class="afp-card' + (on ? " on" : "") + '" data-det="' + it.key + '" tabindex="0">' +
      '<span class="afp-tag">' + esc(it.l.especialidade || "") + "</span>" +
      "<h3>" + esc(f.nome) + "</h3>" +
      (f.indicacao ? '<p class="afp-ind">' + esc(f.indicacao) + "</p>" : "") +
      (tagsUso(f).length ? '<div class="afp-tags">' + tagsUso(f).slice(0, 3).map(function (t) { return '<button type="button" class="afp-tagchip" data-tag="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" : "") +
      (at.length ? '<p class="afp-at">' + esc(at.slice(0, 3).join(" · ")) + (at.length > 3 ? " <span>+" + (at.length - 3) + "</span>" : "") + "</p>" : "") +
      '<div class="afp-foot"><span class="afp-meta">' + (formaDe(f.forma) || formaDe(f.quantidade) ? '<span class="afp-fbadge" title="' + esc(f.forma || "") + '">' + foto(formaDe(f.forma) || formaDe(f.quantidade), 30) + "</span>" : "") + (ds ? '<span class="afp-dose">' + esc(ds) + "</span>" : "") + "</span>" +
      '<span class="afp-cta">' + (on ? ic("ok", 16) + "Na receita" : ic("mais", 16) + "Prescrever") + "</span></div></article>";
  }
  function wireTags(root, after) {
    root.querySelectorAll("[data-tag]").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); if (after) after(); buscarTag(b.getAttribute("data-tag")); }); });
  }
  function wireCards(root) {
    wireTags(root);
    root.querySelectorAll("[data-det]").forEach(function (c) {
      var go = function () { editor(copia(c.getAttribute("data-det")), null); };
      c.addEventListener("click", go);
      c.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    });
  }
  function viewFormulas(v) {
    var esps = []; S.laminas.forEach(function (l) { var e = l.especialidade || "Outras"; if (esps.indexOf(e) < 0) esps.push(e); }); esps.sort();
    var q = norm(S.q);
    var itens = todas().filter(function (it) {
      if (S.esp && (it.l.especialidade || "Outras") !== S.esp) return false;
      if (!q) return true;
      return norm([it.f.nome, it.f.indicacao, it.l.titulo, tagsUso(it.f).join(" "), (it.l.condicoes || []).join(" "), (it.f.componentes || []).map(function (c) { return c.ativo; }).join(" ")].join(" ")).indexOf(q) > -1;
    });
    v.innerHTML = head("Fórmulas por *condição*", "Encontre por condição, ativo ou especialidade. Clique numa fórmula para ajustar e prescrever.") +
      '<div class="afp-tools"><label class="afp-search">' + ic("busca", 18) + '<input type="search" placeholder="Buscar: artrite, enxaqueca, cúrcuma…" value="' + esc(S.q) + '"></label>' +
      '<div class="afp-chips"><button class="afp-chip" aria-pressed="' + !S.esp + '" data-e="">Todas</button>' +
      esps.map(function (e) { return '<button class="afp-chip" aria-pressed="' + (S.esp === e) + '" data-e="' + esc(e) + '">' + esc(e) + "</button>"; }).join("") + "</div></div>" +
      '<p class="afp-count">' + itens.length + " fórmula" + (itens.length === 1 ? "" : "s") + "</p>" +
      '<div class="afp-grid">' + (itens.map(card).join("") || '<p class="afp-empty">Nenhuma fórmula encontrada para essa busca.</p>') + "</div>";
    var inp = v.querySelector(".afp-search input");
    inp.addEventListener("input", function () { S.q = inp.value; var p = inp.selectionStart; render(); var n = S.el.querySelector(".afp-search input"); n.focus(); n.setSelectionRange(p, p); });
    v.querySelectorAll("[data-e]").forEach(function (b) { b.addEventListener("click", function () { S.esp = b.getAttribute("data-e") || null; render(); }); });
    wireCards(v);
  }

  /* ---------- lâminas ---------- */
  function pagina(n, p) {
    var k = n + "-" + p;
    if (S.imgCache[k]) return Promise.resolve(S.imgCache[k]);
    return api("?img=" + k).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) { return (S.imgCache[k] = URL.createObjectURL(b)); });
  }
  function viewLaminas(v) {
    var l = S.open && lamina(S.open);
    if (l) {
      v.innerHTML = '<button class="afp-link afp-back" data-back>' + ic("voltar", 16) + " Todas as lâminas</button>" +
        head(esc(l.titulo), esc(l.resumo || "")) +
        '<div class="afp-lgrid"><div class="afp-pages">' +
        Array.from({ length: l.paginas || 0 }, function (_, i) { return '<figure class="afp-page" data-p="' + (i + 1) + '"><span>Página ' + (i + 1) + "</span></figure>"; }).join("") +
        '</div><aside class="afp-lside"><h3>Fórmulas desta lâmina <small>' + (l.formulas || []).length + "</small></h3>" +
        '<div class="afp-list">' + (l.formulas || []).map(function (f, i) {
          var k = l.n + ":" + i, ds = doses(f);
          return '<button class="afp-li' + (naReceita(k) ? " on" : "") + '" data-det="' + k + '"><span><b>' + esc(f.nome) + "</b><small>" + esc(ativos(f).slice(0, 3).join(" · ")) + (ds ? " — " + esc(ds) : "") + "</small></span>" + ic(naReceita(k) ? "ok" : "mais", 18) + "</button>";
        }).join("") + "</div>" +
        (l.contraindicacoes ? '<p class="afp-obs"><b>Contraindicações.</b> ' + esc(l.contraindicacoes) + "</p>" : "") + "</aside></div>";
      v.querySelector("[data-back]").addEventListener("click", function () { S.open = null; render(); });
      v.querySelectorAll(".afp-page").forEach(function (fig) {
        pagina(l.n, fig.getAttribute("data-p")).then(function (u) { fig.innerHTML = '<img alt="' + esc(l.titulo) + " — página " + fig.getAttribute("data-p") + '" src="' + u + '">'; })
          .catch(function () { fig.innerHTML = "<span>Página indisponível</span>"; });
      });
      wireCards(v);
      return;
    }
    v.innerHTML = head("Lâminas *técnicas*", "O material completo de cada linha, do jeito que foi aprovado.") +
      '<div class="afp-lcards">' + S.laminas.map(function (l) {
        return '<button class="afp-lcard" data-l="' + l.n + '"><figure data-thumb="' + l.n + '"></figure><span class="afp-tag">' + esc(l.especialidade || "") + "</span><b>" + esc(l.titulo) + "</b><small>" + (l.formulas || []).length + " fórmulas · " + (l.paginas || 0) + " páginas</small></button>";
      }).join("") + "</div>";
    v.querySelectorAll("[data-l]").forEach(function (b) { b.addEventListener("click", function () { S.open = b.getAttribute("data-l"); render(); }); });
    v.querySelectorAll("[data-thumb]").forEach(function (fig) { pagina(fig.getAttribute("data-thumb"), 1).then(function (u) { fig.innerHTML = '<img alt="" src="' + u + '">'; }).catch(function () {}); });
  }

  /* ---------- receita (A4) ---------- */
  function loja() { return S.lojas.filter(function (x) { return String(x.id) === String(S.cfg.farmaciaId); })[0]; }
  function hoje() { return new Date().toLocaleDateString("pt-BR"); }
  /* Receita A4 paginada: cada fórmula fica inteira numa página; se não couber, abre página nova.
     Mede numa folha real (794×1123 px = A4 a 96 dpi) fora da tela. Cabeçalho e rodapé em toda página. */
  function posLabel(p) {
    p = (p || "").trim(); if (!p) return "";
    var m = p.match(/^(posologia|modo de uso|modo de usar|uso|aplica[çc][ãa]o)\s*:?\s*/i);
    return m ? "<b>" + esc(p.slice(0, m[0].length).replace(/\s*:?\s*$/, "")) + ":</b> " + esc(p.slice(m[0].length))
             : "<b>Posologia:</b> " + esc(p.charAt(0).toUpperCase() + p.slice(1));
  }
  function itemHTML(f, n) {
    return '<li value="' + n + '">' + (viaLabel(f) ? '<div class="rx-via">' + esc(viaLabel(f)) + "</div>" : "") +
      '<div class="rx-fn">' + esc(f.nome) + (f.forma ? " — " + esc(f.forma) : "") + "</div>" +
      '<table class="rx-comp">' + (f.componentes || []).map(function (x) { return "<tr><td>" + esc(x.ativo) + "</td><td>" + esc(x.dose) + "</td></tr>"; }).join("") + "</table>" +
      (f.quantidade ? '<div class="rx-qsp">' + esc(f.quantidade) + "</div>" : "") +
      (f.posologia ? '<div class="rx-pos">' + posLabel(f.posologia) + "</div>" : "") + "</li>";
  }
  function folha(paciente, itens) {
    var c = S.cfg, lj = c.farmaciaOn ? loja() : null;
    itens = itens || S.rx;
    var head = '<header class="rx-head"><div><div class="rx-nome">' + esc(c.nome) + '</div><div class="rx-reg">' + esc([c.registro, c.especialidade].filter(Boolean).join(" · ")) + "</div></div>" +
      (c.logo ? '<img class="rx-logo" alt="" src="' + c.logo + '">' : "") + "</header>" +
      '<div class="rx-pac"><span>Paciente: <b>' + (esc(paciente) || "&nbsp;") + "</b></span><span>" + hoje() + "</span></div>";
    var fim = '<div class="rx-end"><div class="rx-sign"><div class="rx-qr" title="Reservado para o QR de validação da assinatura digital">' + ic("qr", 34) + "<small>QR de validação<br>assinatura digital</small></div>" +
      '<div class="rx-ass"><div class="rx-linha"></div><span>' + esc(c.nome) + (c.registro ? " · " + esc(c.registro) : "") + "</span></div></div>" +
      (lj ? '<div class="rx-farm"><b>Sugestão de farmácia de manipulação:</b> A Fórmula ' + esc(lj.nome) + " — " + esc(lj.endereco || "") + (lj.telefone ? " · " + esc(lj.telefone) : "") +
        "<br><small>Sugestão do prescritor. O paciente pode manipular esta receita na farmácia de sua escolha.</small></div>" : "") + "</div>";
    var foot = '<footer class="rx-foot"><span>' + esc(c.rodape) + '</span><span class="rx-pg"></span></footer>';
    function pagina() { var p = document.createElement("div"); p.className = "rx-sheet"; p.innerHTML = head + '<div class="rx-body"><ol class="rx-list"></ol></div>' + foot; return p; }

    var m = document.createElement("div"); m.className = "rx-measure"; document.body.appendChild(m);
    var pages = [pagina()]; m.appendChild(pages[0]);
    function cheia(p) { var b = p.querySelector(".rx-body"); return b.scrollHeight > b.clientHeight + 1; }
    itens.forEach(function (f, i) {
      var p = pages[pages.length - 1], ol = p.querySelector(".rx-list");
      ol.insertAdjacentHTML("beforeend", itemHTML(f, i + 1));
      if (cheia(p) && ol.children.length > 1) {          // não cabe: leva a fórmula inteira para a próxima página
        var li = ol.lastElementChild; ol.removeChild(li);
        var np = pagina(); m.appendChild(np); pages.push(np); np.querySelector(".rx-list").appendChild(li);
      }
    });
    var last = pages[pages.length - 1]; last.querySelector(".rx-body").insertAdjacentHTML("beforeend", fim);
    if (cheia(last) && last.querySelector(".rx-list").children.length) {   // assinatura não coube: vai para página própria
      last.querySelector(".rx-end").remove();
      var np2 = pagina(); m.appendChild(np2); pages.push(np2); np2.querySelector(".rx-body").insertAdjacentHTML("beforeend", fim);
    }
    pages.forEach(function (p, i) { p.querySelector(".rx-pg").textContent = pages.length > 1 ? "Página " + (i + 1) + "/" + pages.length : ""; });
    var html = '<div class="rx-pages">' + pages.map(function (p) { return p.outerHTML; }).join("") + "</div>";
    m.remove();
    requestAnimationFrame(ajustarPrevias);
    return html;
  }
  // a folha é sempre 794 px; na tela ela é reduzida para caber na coluna
  function ajustarPrevias() {
    document.querySelectorAll(".afp-rxprev").forEach(function (el) {
      var p = el.querySelector(".rx-pages"); if (!p) return;
      var w = el.clientWidth - 56; p.style.zoom = Math.min(1, w / 794).toFixed(3);
    });
  }
  window.addEventListener("resize", function () { requestAnimationFrame(ajustarPrevias); });

  /* ---------- prescrever (carrinho) ---------- */
  // Impressão: a regra que esconde o resto da página e o @page A4 só valem durante a impressão da receita.
  function imprimir() {
    var st = document.createElement("style"); st.id = "afp-page"; st.textContent = "@page{size:A4;margin:0}";
    document.head.appendChild(st); document.body.classList.add("afp-printing");
    var fim = function () { document.body.classList.remove("afp-printing"); st.remove(); window.removeEventListener("afterprint", fim); };
    window.addEventListener("afterprint", fim); window.print(); setTimeout(fim, 1500);
  }
  function viewPrescrever(v) {
    if (!S.rx.length) {
      v.innerHTML = head("Monte a *receita*", "Monte a receita com as fórmulas que escolher.") +
        '<div class="afp-emptybox">' + ic("prescrever", 34) + "<b>Sua receita está vazia</b><p>Escolha fórmulas em Formulações ou dentro de uma lâmina. Você pode ajustar ativos e doses antes de adicionar.</p>" +
        '<button class="afp-btn" data-go>' + ic("formulas", 18) + " Ver formulações</button></div>";
      v.querySelector("[data-go]").addEventListener("click", function () { S.tab = "formulas"; render(); });
      return;
    }
    var lojas = S.lojas.slice().sort(function (a, b) { return (a.estado + a.nome).localeCompare(b.estado + b.nome); });
    v.innerHTML = head("Monte a *receita*", "Revise as fórmulas, preencha o paciente e gere a receita.", '<button class="afp-ghost" data-clear>' + ic("lixo", 16) + " Limpar receita</button>") +
      '<div class="afp-rxgrid"><div class="afp-rxctl">' +
      '<section class="afp-panel"><label class="afp-full"><span>Paciente</span><input class="afp-in" id="afp-pac" autocomplete="off" placeholder="Nome do paciente" value="' + esc(S.paciente) + '"></label>' +
      '<p class="afp-hint">' + ic("escudo", 14) + "O nome do paciente não é salvo nem enviado.</p></section>" +
      '<section class="afp-panel"><h3>Fórmulas <small>' + S.rx.length + "</small></h3><ul class=\"afp-cart\">" + S.rx.map(function (f, i) {
        var ds = doses(f);
        return '<li><button class="afp-cart-main" data-edit="' + i + '"><b>' + esc(f.nome) + "</b><small>" + esc(ativos(f).slice(0, 3).join(" · ")) + (ds ? " — " + esc(ds) : "") + "</small></button>" +
          '<button class="afp-icbtn" data-edit="' + i + '" aria-label="Editar">' + ic("editar", 17) + '</button><button class="afp-icbtn" data-rm="' + i + '" aria-label="Remover">' + ic("lixo", 17) + "</button></li>";
      }).join("") + '</ul><button class="afp-ghost" data-more>' + ic("mais", 16) + " Adicionar fórmula</button></section>" +
      '<section class="afp-panel"><label class="afp-switch"><input type="checkbox" id="afp-farm"' + (S.cfg.farmaciaOn ? " checked" : "") + "><span></span>Sugerir farmácia A Fórmula</label>" +
      '<select class="afp-in" id="afp-loja"' + (S.cfg.farmaciaOn ? "" : " disabled") + '><option value="">Escolha a unidade</option>' +
      lojas.map(function (x) { return '<option value="' + x.id + '"' + (String(x.id) === String(S.cfg.farmaciaId) ? " selected" : "") + ">" + esc(x.estado + " — " + x.nome) + "</option>"; }).join("") + "</select>" +
      '<p class="afp-hint">A receita informa que o paciente pode manipular onde preferir.</p></section>' +
      '<section class="afp-panel afp-sign"><div>' + ic("qr", 22) + '<span><b>Assinatura digital com QR</b><small>Em integração — a validação ICP-Brasil entra aqui.</small></span></div><button class="afp-ghost" disabled>Assinar</button></section>' +
      '<p class="afp-hint">Substâncias sujeitas a controle especial exigem receituário próprio (Portaria SVS/MS 344/98). Revise doses e posologia antes de emitir.</p>' +
      '<button class="afp-btn afp-btn-lg" id="afp-print">' + ic("print", 18) + " Imprimir / salvar PDF</button>" +
      '</div><div class="afp-rxprev" id="afp-prev">' + folha(S.paciente) + "</div></div>";
    var pac = v.querySelector("#afp-pac"), prev = v.querySelector("#afp-prev");
    pac.addEventListener("input", function () { S.paciente = pac.value; prev.innerHTML = folha(S.paciente); });
    v.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { var i = +b.getAttribute("data-edit"); editor(S.rx[i], i); }); });
    v.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { S.rx.splice(+b.getAttribute("data-rm"), 1); saveRx(); render(); }); });
    v.querySelector("[data-more]").addEventListener("click", function () { S.tab = "formulas"; render(); });
    v.querySelector("[data-clear]").addEventListener("click", function () { if (confirm("Remover todas as fórmulas da receita?")) { S.rx = []; saveRx(); render(); } });
    var chk = v.querySelector("#afp-farm"), sel = v.querySelector("#afp-loja");
    chk.addEventListener("change", function () { S.cfg.farmaciaOn = chk.checked; lsSet(LS_CFG, S.cfg); render(); });
    sel.addEventListener("change", function () { S.cfg.farmaciaId = sel.value; lsSet(LS_CFG, S.cfg); prev.innerHTML = folha(S.paciente); });
    v.querySelector("#afp-print").addEventListener("click", function () {
      var w = document.getElementById("afp-print-root") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "afp-print-root" }));
      w.innerHTML = folha(S.paciente); imprimir();
    });
  }

  /* ---------- meu receituário ---------- */
  // Logo: aceita qualquer imagem; reduz no navegador (máx. 600 px, PNG) para caber no armazenamento local.
  function lerLogo(file) {
    return new Promise(function (ok, erro) {
      if (!file || !/^image\//.test(file.type)) return erro("Escolha um arquivo de imagem (PNG, JPG, SVG ou WebP).");
      if (file.size > 8 * 1024 * 1024) return erro("Imagem muito grande (máx. 8 MB).");
      var r = new FileReader();
      r.onerror = function () { erro("Não foi possível ler o arquivo."); };
      r.onload = function () {
        var img = new Image();
        img.onerror = function () { erro("Não foi possível abrir essa imagem."); };
        img.onload = function () {
          var w = img.naturalWidth || 600, h = img.naturalHeight || 300, k = Math.min(1, 600 / Math.max(w, h));
          var cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          ok(cv.toDataURL("image/png"));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  function viewReceituario(v) {
    var c = S.cfg, p = S.perfil;
    var exemplo = S.rx.length ? null : [{ nome: "Fórmula de exemplo", forma: "cápsula", via: "oral", componentes: [{ ativo: "Ativo A", dose: "100 mg" }, { ativo: "Ativo B", dose: "50 mg" }], quantidade: "Fazer 30 doses", posologia: "Tomar 1 dose ao dia." }];
    function linha(r, val) { return '<div class="afp-kv"><span>' + r + "</span><b>" + (esc(val) || "<i>não informado</i>") + "</b></div>"; }
    v.innerHTML = head("Meu *receituário*", "É assim que sua receita sai. Os dados vêm do seu cadastro; aqui você só personaliza o logo.") +
      '<div class="afp-rxgrid"><div class="afp-rxctl">' +
      '<section class="afp-panel"><h3>Logo</h3><div class="afp-logo">' + (c.logo ? '<img alt="Seu logo" src="' + c.logo + '">' : ic("upload", 26)) +
      '<div><button type="button" class="afp-ghost" id="afp-lbtn">' + ic("upload", 16) + (c.logo ? " Trocar logo" : " Enviar logo") + "</button>" +
      '<input type="file" id="afp-l" accept="image/*" style="display:none">' +
      (c.logo ? '<button type="button" class="afp-link" id="afp-lrm">Remover</button>' : "") +
      '<small>PNG, JPG, SVG ou WebP. Sai no canto superior direito da receita.</small><p class="afp-msg" id="afp-msg"></p></div></div></section>' +
      '<section class="afp-panel"><h3>Identificação ' + ic("escudo", 14) + "</h3>" +
      linha("Nome", c.nome) + linha("Registro", c.registro) + linha("Especialidade", c.especialidade) + "</section>" +
      '<section class="afp-panel"><h3>Consultório e rodapé</h3>' +
      linha("Endereço", [[p.endereco, p.numero, p.complemento].filter(Boolean).join(", "), p.bairro].filter(Boolean).join(" — ")) +
      linha("Região", [p.cidadeConsultorio || p.cidade, p.ufEndereco || p.uf].filter(Boolean).join("/") + (p.cep ? " · CEP " + p.cep : "")) +
      linha("Contato", [p.telConsultorio || p.telefone, p.emailReceita || p.email].filter(Boolean).join(" · ")) +
      '<button type="button" class="afp-ghost" id="afp-editcons">' + ic("editar", 16) + " Editar dados do consultório</button></section>" +
      '<p class="afp-hint">' + ic("escudo", 14) + "Para corrigir nome ou registro, fale com sac@aformulabr.com.br — esses dados são validados no cadastro.</p>" +
      '</div><div class="afp-rxprev" id="afp-prev2"></div></div>';
    var prev = v.querySelector("#afp-prev2"), msgEl = v.querySelector("#afp-msg");
    function aviso(t) { msgEl.className = "afp-msg on"; msgEl.textContent = t; }
    function upd() { prev.innerHTML = folha("Nome do paciente", exemplo || S.rx); }
    function save() {
      var keep = { logo: S.cfg.logo, farmaciaOn: S.cfg.farmaciaOn, farmaciaId: S.cfg.farmaciaId };
      if (!lsSet(LS_CFG, keep)) aviso("Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).");
      upd();
    }
    v.querySelector("#afp-editcons").addEventListener("click", function () { viewConsultorio(true); });
    var inp = v.querySelector("#afp-l");
    v.querySelector("#afp-lbtn").addEventListener("click", function () { inp.value = ""; inp.click(); });
    inp.addEventListener("change", function () {
      lerLogo(inp.files[0]).then(function (url) { S.cfg.logo = url; save(); render(); toast("Logo atualizado"); }).catch(aviso);
    });
    var rm = v.querySelector("#afp-lrm"); if (rm) rm.addEventListener("click", function () { S.cfg.logo = ""; save(); render(); });
    upd();
  }

  window.AFPresc = { mount: mount };
})();
