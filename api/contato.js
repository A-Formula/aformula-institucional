// POST /api/contato — substitui o mailto: do contato.html
// Body: { nome, telefone?, email, assunto, mensagem, website? (honeypot) }
const { getDb, notify, guard, isEmail, addToMailing, FieldValue } = require("./_lib/backend");
const { FLOWS, fluxoPorAssunto } = require("./_lib/flows");
const { enqueueFlow } = require("./_lib/queue");
const { resolverUnidade, analisarCep } = require("./_lib/unidade");

// "Acompanhamento de pedido" saiu do formulário (virou "Orçamento", 10/08/2026) mas continua
// aceito aqui: a lista é validação de entrada, e rejeitar o assunto antigo só quebraria quem
// tiver a página velha em cache.
const ASSUNTOS = [
  "Orçamento", "Dúvida sobre manipulação", "Acompanhamento de pedido", "Área do prescritor",
  "Seja um franqueado", "Trabalhe conosco", "Imprensa / parcerias", "Outro assunto",
];

module.exports = async (req, res) => {
  const body = guard(req, res);
  if (!body) return;

  const nome = String(body.nome || "").trim().slice(0, 200);
  const telefone = String(body.telefone || "").trim().slice(0, 40);
  const email = String(body.email || "").trim().slice(0, 200);
  const assunto = String(body.assunto || "").trim();
  const mensagem = String(body.mensagem || "").trim().slice(0, 5000);
  const cep = String(body.cep || "").replace(/\D/g, "").slice(0, 8) || null;
  const marketing = body.marketing === true;

  // CEP é obrigatório em TODOS os assuntos (decisão do operador 05/08/2026): é a chave de
  // filtro do lead e de qual unidade atende. Registro sem CEP fura o filtro, então barra aqui
  // também — o formulário já valida, isto cobre bot/bypass.
  if (!nome || !isEmail(email) || !ASSUNTOS.includes(assunto) || !mensagem || !cep || cep.length !== 8) {
    return res.status(400).json({ ok: false, error: "validation" });
  }

  const db = getDb();
  if (!db) return res.status(503).json({ ok: false, error: "backend-offline" });

  // Resolve o CEP ANTES de gravar (e para TODOS os assuntos, não só os que têm régua): é o que
  // permite ao painel saber qual unidade recebe cada lead e montar o mapa de concentração. Antes
  // disto o resultado era calculado só dentro do if da régua e jogado fora depois do e-mail.
  // Best-effort por contrato — campos null não travam o contato.
  const analise = await analisarCep(cep);

  try {
    await db.collection("contact_messages").add({
      nome, telefone: telefone || null, email, assunto, mensagem, cep, marketing,
      // localização do lead (cepUf é offline, então vem sempre) + unidade que atende
      cepUf: analise.cepUf, cepCidade: analise.cepCidade,
      unidade: analise.unidade, unidadeSlug: analise.unidadeSlug,
      unidadeCidade: analise.unidadeCidade, unidadeUf: analise.unidadeUf,
      distanciaKm: analise.distanciaKm, foraDeRaio: analise.foraDeRaio,
      status: "new", createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[contato] gravação falhou:", e && e.message);
    return res.status(503).json({ ok: false, error: "database-error" });
  }

  // opt-in de marketing → entra na base de mailing (best-effort, não derruba o contato)
  if (marketing) await addToMailing(email, "contato").catch(() => {});

  // Régua de e-mail. O `assunto` é lista fechada, então o roteamento é determinístico; dentro de
  // "Dúvida sobre manipulação"/"Outro assunto" a triagem CA×CB lê a mensagem (na dúvida → CB,
  // que nunca promete nada). Três assuntos não têm régua e retornam null de propósito:
  // acompanhamento de pedido (é atendimento), franqueado (régua não existe) e imprensa (manual).
  const fluxo = fluxoPorAssunto(assunto, mensagem);
  if (fluxo && FLOWS[fluxo]) {
    // Reaproveita a análise já feita acima (zero chamada de rede extra). Alimenta o CTA direto no
    // WhatsApp da unidade e a personalização por cidade. null (inclui fora do raio de 150 km) →
    // régua cai no localizador genérico, como antes.
    const unidade = await resolverUnidade(cep, analise);
    await enqueueFlow(db, {
      flow: fluxo, steps: FLOWS[fluxo], email,
      dados: {
        nome, email, mensagem, assunto, cep,
        cidade: unidade ? unidade.cidade : null,
        unidade: unidade ? unidade.nome : null,
        waUrl: unidade ? unidade.waUrl : null,
      },
      startAt: new Date(),
    }).catch((e) => console.error("[contato] enqueue falhou:", e && e.message));
  }

  await notify(
    `[Contato site] ${assunto}`,
    `Nome: ${nome}\nE-mail: ${email}\nTelefone: ${telefone || "—"}\nAssunto: ${assunto}` +
    `${cep ? `\nCEP: ${cep}` : ""}\nAceita marketing: ${marketing ? "sim" : "não"}\n\n${mensagem}`
  ).catch((e) => console.error("[contato] notify falhou:", e && e.message));

  return res.status(200).json({ ok: true });
};
