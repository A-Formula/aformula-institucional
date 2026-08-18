// Contador de cliques do site — agregado, anônimo, primeira parte.
//
// POR QUE EXISTE: o painel só enxergava o FIM do funil (o lead gravado). Sem o volume de cliques
// não dá pra distinguir "ninguém clica no WhatsApp" de "todo mundo clica e ninguém converte" —
// são dois problemas opostos com correções opostas. O GA4 não resolve porque (1) só conta quem
// aceitou o cookie, o que subestima o número por um fator desconhecido, e (2) o dado não entra
// no painel, onde a equipe realmente olha.
//
// PRIVACIDADE (LGPD): grava SÓ contador agregado — nome do evento, rótulo e path. Sem IP, sem
// cookie, sem identificador, sem user-agent. Não é dado pessoal, então não depende de consentimento
// e não há o que exportar ou apagar a pedido de titular. O IP é usado em memória apenas para o
// rate limit e nunca é persistido.
const { getDb, FieldValue } = require("./_lib/backend");

// Allowlist fechada: o endpoint é público (tem que ser — quem chama é o browser do visitante).
// Sem isso, qualquer um enche a coleção de eventos inventados e o painel vira lixo.
const EVENTOS = new Set([
  "clique_whatsapp",       // qualquer link wa.me/api.whatsapp.com, inclusive os da Encontre uma loja
  "clique_telefone",       // links tel:
  "clique_cta",            // links marcados com data-track no HTML
  "clique_fab_contato",    // botão flutuante "Fale conosco"
  "clique_fab_whatsapp",   // botão flutuante nas páginas de unidade (abre o wa.me da loja; rótulo = slug)
]);

// Rate limit por IP, em memória da instância (mesmo padrão do _lib/backend.js). Folgado de
// propósito: um visitante navegando de verdade clica em vários links: apertar aqui perderia
// clique legítimo, que é justamente o dado que queremos.
const hits = new Map();
function limitado(ip, max = 60, janelaMs = 10 * 60 * 1000) {
  const agora = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => agora - t < janelaMs);
  arr.push(agora);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();   // teto de memória da instância
  return arr.length > max;
}

// Dia no fuso de São Paulo. Sem isto, tudo depois das 21h cai no dia seguinte (a Vercel roda em
// UTC) e o relatório diário do painel fica deslocado em relação ao que a equipe viveu.
function diaSP() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());   // en-CA já formata YYYY-MM-DD
}

// Chave de mapa do Firestore: sem ponto, barra ou colchete, e curta.
const chave = (s) => (String(s || "—").trim().replace(/[.\/\[\]~*`]/g, "-").slice(0, 60) || "—");

module.exports = async (req, res) => {
  // Responde 204 em QUALQUER cenário de recusa. O cliente usa sendBeacon e ignora a resposta;
  // devolver erro só encheria o log da Vercel de ruído sem ninguém para ler.
  const fim = () => res.status(204).end();
  if (req.method !== "POST") return fim();

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (_) { return fim(); }

  const evento = String(body.evento || "");
  if (!EVENTOS.has(evento)) return fim();

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (limitado(ip)) return fim();

  const db = getDb();
  if (!db) return fim();

  const dia = diaSP();
  try {
    // Um doc por dia POR EVENTO (não um doc por dia com tudo dentro): o Firestore aguenta ~1
    // escrita/s por documento, então separar por evento distribui a contenção nos picos.
    await db.collection("clicks").doc(`${dia}__${evento}`).set({
      dia, evento,
      total: FieldValue.increment(1),
      // merge em mapa aninhado: o increment funciona sem precisar de FieldPath e sem apagar as
      // outras chaves já gravadas.
      rotulos: { [chave(body.rotulo)]: FieldValue.increment(1) },
      paginas: { [chave(body.pagina)]: FieldValue.increment(1) },
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error("[track] falhou:", e && e.message);
  }
  return fim();
};
