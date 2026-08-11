// Resolve CEP → unidade A Fórmula mais próxima, no servidor.
//
// Por quê existe: o formulário de contato já fazia isso no navegador pra abrir o WhatsApp
// (contato.html), mas a RÉGUA de e-mail não tinha essa informação — enfileirava `cidade: null`
// e o CEP sem uso, então os 6 passos que personalizam por cidade caíam no texto genérico e todo
// CTA apontava pro localizador. Com o CEP obrigatório (05/08/2026), isto vale pra 100% dos leads.
//
// Contrato: NUNCA lança e NUNCA trava o fluxo. Falha de rede/CEP inexistente → devolve null,
// e quem chama volta ao comportamento antigo (localizador genérico). É melhoria de conversão,
// não caminho crítico.
const { SITE } = require("./emails");

const LOJAS_URL = `${SITE}/encontre-uma-loja_assets/lojas.json`;
const TIMEOUT_MS = 4000;

// Acima disto a "unidade mais próxima" deixa de ser próxima e o e-mail passaria a afirmar algo
// falso (medido: CEP de Curitiba → Florianópolis, 251 km). Nesses casos vale mais o localizador,
// onde a pessoa escolhe — inclusive porque a rede manipula e entrega em outra cidade.
const RAIO_MAX_KM = 150;

const digits = (s) => String(s || "").replace(/\D/g, "");

// O Nominatim responde 403 pra requisição sem User-Agent identificável — no navegador isso passa
// batido (o browser manda o dele), no servidor não. Sem este header, CEP que precisa do fallback
// (ex.: 69900000, Rio Branco/AC) devolvia null e o lead perdia a unidade.
async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "aformulabr-site/1.0 (+https://www.aformulabr.com.br)" },
    });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// Mesma cadeia do front: awesomeapi (já traz lat/lng) → viacep + nominatim como reserva.
async function geocode(cep) {
  const c = digits(cep);
  if (c.length !== 8) return null;
  const a = await get(`https://cep.awesomeapi.com.br/json/${c}`);
  if (a && a.lat && a.lng) return { lat: +a.lat, lng: +a.lng, cidade: a.city || null, uf: a.state || null };
  const v = await get(`https://viacep.com.br/ws/${c}/json/`);
  if (!v || v.erro) return null;
  const q = encodeURIComponent(`${v.logradouro ? v.logradouro + ", " : ""}${v.localidade || ""} ${v.uf || ""} Brasil`);
  const n = await get(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
  if (!n || !n[0]) return null;
  return { lat: +n[0].lat, lng: +n[0].lon, cidade: v.localidade || null, uf: v.uf || null };
}

// Faixas oficiais de CEP por UF. Existe porque o mapa de leads não pode depender de rede: CEP
// antigo/inexistente ou geocode fora do ar deixaria o lead sem localização nenhuma. Com isto, UF
// é 100% offline e determinística — a cidade e a loja é que dependem do geocode.
const FAIXAS_UF = [
  [1000, 19999, "SP"], [20000, 28999, "RJ"], [29000, 29999, "ES"], [30000, 39999, "MG"],
  [40000, 48999, "BA"], [49000, 49999, "SE"], [50000, 56999, "PE"], [57000, 57999, "AL"],
  [58000, 58999, "PB"], [59000, 59999, "RN"], [60000, 63999, "CE"], [64000, 64999, "PI"],
  [65000, 65999, "MA"], [66000, 68899, "PA"], [68900, 68999, "AP"], [69000, 69299, "AM"],
  [69300, 69399, "RR"], [69400, 69899, "AM"], [69900, 69999, "AC"], [70000, 72799, "DF"],
  [72800, 72999, "GO"], [73000, 73699, "DF"], [73700, 76799, "GO"], [76800, 76999, "RO"],
  [77000, 77999, "TO"], [78000, 78899, "MT"], [78900, 78999, "RO"], [79000, 79999, "MS"],
  [80000, 87999, "PR"], [88000, 89999, "SC"], [90000, 99999, "RS"],
];

function ufDoCep(cep) {
  const c = digits(cep);
  if (c.length !== 8) return null;
  const p = +c.slice(0, 5);
  for (const [ini, fim, uf] of FAIXAS_UF) if (p >= ini && p <= fim) return uf;
  return null;
}

function haversine(a, b, c, d) {
  const R = 6371, p = Math.PI / 180, dLat = (c - a) * p, dLon = (d - b) * p;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// wa.me exige DDI. Os números do lojas.json vêm como "(11) 99999-9999" → 10 ou 11 dígitos.
function waUrl(loja) {
  let n = digits(loja.celular || loja.telefone);
  if (!n) return null;
  if (n.length <= 11) n = `55${n}`;
  return `https://wa.me/${n}`;
}

/**
 * Análise completa do CEP — é o que o PAINEL grava e usa pro mapa de leads.
 *
 * Diferença de contrato vs. resolverUnidade(): aqui a unidade mais próxima vem SEMPRE, com a
 * distância e o flag `foraDeRaio`. Por quê: pro e-mail, "251 km" é longe demais pra afirmar
 * "sua unidade" (daí o null lá); pro mapa, é justo o dado mais valioso — mostra demanda em
 * praça que a rede ainda não cobre. Descartar isso é apagar o mapa de expansão.
 *
 * @returns {Promise<{cepUf,cepCidade,unidade,unidadeSlug,unidadeCidade,unidadeUf,distanciaKm,foraDeRaio}>}
 *   Nunca lança. Campos não resolvidos vêm null — `cepUf` é offline, então quase nunca falha.
 */
async function analisarCep(cep) {
  const vazio = {
    cepUf: ufDoCep(cep), cepCidade: null, cepLat: null, cepLng: null,
    unidade: null, unidadeSlug: null,
    unidadeCidade: null, unidadeUf: null, distanciaKm: null, foraDeRaio: null,
  };
  try {
    const loc = await geocode(cep);
    if (!loc) return vazio;
    vazio.cepCidade = loc.cidade || null;
    vazio.cepUf = vazio.cepUf || loc.uf || null;
    // Coordenada do CEP: alimenta o mapa de bolhas do painel. Não expõe nada novo — o CEP de 8
    // dígitos já está gravado e é MAIS preciso que isto; e o mapa só mostra o agregado por cidade.
    vazio.cepLat = loc.lat; vazio.cepLng = loc.lng;
    const lista = await get(LOJAS_URL);
    if (!Array.isArray(lista)) return vazio;
    // "em breve" = unidade anunciada que ainda não atende; contá-la como receptora do lead é furo.
    const geo = lista.filter((s) => s.lat && s.lng && !/em breve/i.test(s.nome || "") && waUrl(s));
    if (!geo.length) return vazio;
    let melhor = null;
    for (const s of geo) {
      const d = haversine(loc.lat, loc.lng, s.lat, s.lng);
      if (!melhor || d < melhor.d) melhor = { s, d };
    }
    return {
      ...vazio,
      unidade: melhor.s.nome || null,
      unidadeSlug: melhor.s.slug || null,
      unidadeCidade: melhor.s.cidade || null,
      unidadeUf: melhor.s.estado || null,
      distanciaKm: Math.round(melhor.d),
      foraDeRaio: melhor.d > RAIO_MAX_KM,
      _waUrl: waUrl(melhor.s),
    };
  } catch (e) {
    console.error("[unidade] análise falhou:", e && e.message);
    return vazio;
  }
}

/**
 * @returns {Promise<null|{nome,cidade,estado,waUrl,distanciaKm}>}
 *   null = não deu pra resolver (CEP ruim, rede) OU a mais próxima está fora do raio —
 *   nesse caso quem chama cai no localizador genérico, que é o comportamento correto.
 */
async function resolverUnidade(cep, analise) {
  const a = analise || (await analisarCep(cep));
  if (!a.unidade || a.foraDeRaio) {
    if (a.distanciaKm != null) {
      console.log(`[unidade] mais próxima a ${a.distanciaKm}km (> ${RAIO_MAX_KM}) — usando localizador`);
    }
    return null;
  }
  return {
    nome: a.unidade,
    cidade: a.unidadeCidade || a.cepCidade || null,
    estado: a.unidadeUf || a.cepUf || null,
    waUrl: a._waUrl || null,
    distanciaKm: a.distanciaKm,
  };
}

module.exports = {
  resolverUnidade, analisarCep, ufDoCep,
  cidadeDoCep: async (cep) => (await geocode(cep))?.cidade || null,
};
