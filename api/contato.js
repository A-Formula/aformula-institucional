// POST /api/contato — substitui o mailto: do contato.html
// Body: { nome, telefone?, email, assunto, mensagem, website? (honeypot) }
const { getDb, notify, guard, isEmail, addToMailing, FieldValue } = require("./_lib/backend");
const { FLOWS, fluxoPorAssunto } = require("./_lib/flows");
const { enqueueFlow } = require("./_lib/queue");
const { resolverUnidade, analisarCep, lojaPorNome, LOJA_PROPRIA } = require("./_lib/unidade");

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

  // ------- ROTEAMENTO DO LEAD (interno, não aparece pro visitante) -------
  // Fora do raio de 150 km o lead antes se perdia no localizador. Agora vai pra loja PRÓPRIA
  // (Brooklin). Salvaguarda: da 3ª ocorrência do MESMO e-mail em diante, vai pra unidade mais
  // próxima do CEP mesmo longe — repetição é sinal de teste, e a loja própria não deve virar
  // depósito de lead falso. Lojas "em breve" já ficam fora do cálculo de proximidade, então a
  // "mais próxima" nunca é uma que ainda não abriu.
  const dentroDoRaio = await resolverUnidade(cep, analise);
  let rota = dentroDoRaio, rotaMotivo = dentroDoRaio ? "raio" : null;

  if (!dentroDoRaio && analise.foraDeRaio === true) {
    let anteriores = 0;
    try {
      // Só igualdade num campo: não exige índice composto. E-mail tem poucos docs.
      const s = await db.collection("contact_messages").where("email", "==", email).limit(50).get();
      anteriores = s.docs.filter((d) => d.data().foraDeRaio === true).length;
    } catch (e) {
      // Falha de leitura NÃO pode virar "manda pra loja própria": na dúvida, trata como repetido,
      // que é o caminho conservador (a loja própria fica protegida).
      console.error("[contato] contagem de repetições falhou:", e && e.message);
      anteriores = 2;
    }
    if (anteriores >= 2) {
      rota = { nome: analise.unidade, cidade: analise.unidadeCidade, estado: analise.unidadeUf,
               waUrl: analise._waUrl, distanciaKm: analise.distanciaKm };
      rotaMotivo = "repetido";
    } else {
      const propria = await lojaPorNome(LOJA_PROPRIA);
      if (propria) { rota = propria; rotaMotivo = "propria"; }
    }
  }

  try {
    await db.collection("contact_messages").add({
      nome, telefone: telefone || null, email, assunto, mensagem, cep, marketing,
      // localização do lead (cepUf é offline, então vem sempre) + unidade que atende
      cepUf: analise.cepUf, cepCidade: analise.cepCidade,
      cepLat: analise.cepLat, cepLng: analise.cepLng,
      // Verdade GEOGRÁFICA — não é tocada pelo roteamento. É o que sustenta o mapa de expansão do
      // painel: se `unidade` virasse Brooklin, o lead de Curitiba deixaria de contar como demanda
      // descoberta e o insight sumiria.
      unidade: analise.unidade, unidadeSlug: analise.unidadeSlug,
      unidadeCidade: analise.unidadeCidade, unidadeUf: analise.unidadeUf,
      distanciaKm: analise.distanciaKm, foraDeRaio: analise.foraDeRaio,
      // Quem de fato recebeu o lead + por quê (raio | propria | repetido).
      rotaUnidade: rota ? rota.nome : null, rotaMotivo,
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
    // ATENÇÃO — aqui vai `dentroDoRaio`, NÃO `rota`. A copy da régua afirma "a mais perto do CEP
    // que você informou" e "a mais perto de você é a A Fórmula {unidade}". Injetar a loja de
    // roteamento nessas frases faria o e-mail AFIRMAR uma falsidade a quem está a 400 km dela.
    // O lead fora de raio é atribuído ao Brooklin internamente (`rotaUnidade` + notificação da
    // equipe) e o e-mail dele cai no localizador genérico, que não promete proximidade nenhuma.
    const unidade = dentroDoRaio;
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

  // A notificação interna é onde a equipe descobre quem atende — é ela que faz o roteamento
  // acontecer na prática, já que o e-mail do visitante não menciona nada disso.
  const ROTA_TXT = {
    raio: (r) => `Atender: ${r.nome} (a ${r.distanciaKm} km do CEP)`,
    propria: (r) => `Atender: ${r.nome} — nenhuma unidade em 150 km do CEP`,
    repetido: (r) => `Atender: ${r.nome} (a ${r.distanciaKm} km) — 3ª ocorrência fora de raio deste e-mail`,
  };
  await notify(
    `[Contato site] ${assunto}`,
    `Nome: ${nome}\nE-mail: ${email}\nTelefone: ${telefone || "—"}\nAssunto: ${assunto}` +
    `${cep ? `\nCEP: ${cep}${analise.cepCidade ? ` (${analise.cepCidade}${analise.cepUf ? "/" + analise.cepUf : ""})` : ""}` : ""}` +
    `${rota && ROTA_TXT[rotaMotivo] ? `\n${ROTA_TXT[rotaMotivo](rota)}` : ""}` +
    `\nAceita marketing: ${marketing ? "sim" : "não"}\n\n${mensagem}`
  ).catch((e) => console.error("[contato] notify falhou:", e && e.message));

  return res.status(200).json({ ok: true });
};
