// Réguas de e-mail da A Fórmula institucional — os 18 e-mails que dependem de agendamento.
// Copy e racional: APLICAÇÕES/clientes/a-formula/email/EMAILS-INSTITUCIONAL-v1.md
// Os 3 de gatilho imediato (N1/P1/P2) vivem em _lib/emails.js.
//
// Réguas: CA (contato com receita) · CB (contato com sintoma) · P (prescritores) ·
//         T (trabalhe conosco) · N (newsletter).
//
// CTA de conversão dos e-mails de PACIENTE e de CANDIDATO = o localizador de lojas
// (decisão do operador 2026-07-27): a página resolve a unidade mais próxima e joga a pessoa no
// WhatsApp dela (76 das 87 unidades têm celular). Isso também elimina a variável {LINK_WHATSAPP},
// que não existia em lugar nenhum — não há um WhatsApp único da rede.
// A régua P é a exceção: prescritor vai pra Área do Prescritor, não pro balcão.
const crypto = require("crypto");
const {
  layout, btn, ps, esc, firstName, assinaturaText, assinaturaHtml,
  SENDER, SITE, AREA_URL, TEAL, DARK,
} = require("./emails");

const LOJAS_URL = `${SITE}/encontre-uma-loja`;

// ── Descadastro ──────────────────────────────────────────────────────────────
// Todo e-mail de classe "marketing" carrega link de saída — exigência de LGPD e o que separa
// régua de spam. Token = HMAC do e-mail, então o link não é adivinhável nem enumerável.
function unsubToken(email) {
  const secret = process.env.UNSUB_SECRET || process.env.RESEND_API_KEY || "";
  if (!secret) return "";
  return crypto.createHmac("sha256", secret)
    .update(String(email).toLowerCase()).digest("hex").slice(0, 32);
}
function unsubUrl(email) {
  const t = unsubToken(email);
  if (!t) return "";
  return `${SITE}/api/descadastro?e=${encodeURIComponent(String(email).toLowerCase())}&t=${t}`;
}

// ── Composição ───────────────────────────────────────────────────────────────
// Um e-mail é uma lista de blocos. O mesmo array gera texto puro e HTML, então as duas versões
// nunca divergem — divergir é como e-mail vira "vi o texto, cadê o botão".
// Blocos: {p} parágrafo · {ul:[...]} lista · {ol:[...]} numerada · {cta:{href,label}} · {sig:true}
// Ênfase: **negrito** funciona nos dois formatos.
const boldText = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1");
const boldHtml = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

// `subject` cai no h1 quando não é passado (na maioria dos e-mails são a mesma frase, e manter
// as duas iguais evita a incoerência de abrir um e-mail e achar outro assunto dentro).
// `pre` é o preheader: o texto que o Gmail mostra ao lado do assunto. Ele COMPLEMENTA o assunto,
// nunca repete — é a segunda chance de ganhar a abertura, e ficar vazio faz o cliente de e-mail
// pescar a primeira frase do corpo ("Olá, Maria."), que desperdiça o espaço.
function compose({ h1, subject, pre, blocks, psText, email, classe }) {
  const unsub = classe === "marketing" ? unsubUrl(email) : "";
  const cta = blocks.find((b) => b.cta);

  const text = blocks.map((b) => {
    if (b.p) return boldText(b.p);
    if (b.ul) return b.ul.map((i) => `  - ${boldText(i)}`).join("\n");
    if (b.ol) return b.ol.map((i, n) => `  ${n + 1}. ${boldText(i)}`).join("\n");
    if (b.cta) return `>> ${b.cta.label.toUpperCase()}:\n   ${b.cta.href}`;
    if (b.sig) return assinaturaText();
    return "";
  }).filter(Boolean).join("\n\n")
    + `\n\nPS: ${boldText(psText)}`
    + (unsub ? `\n\n---\nNão quer mais receber? ${unsub}` : "")
    + `\n\nA Fórmula — farmácia de manipulação em 87 cidades.`;

  const html = layout(
    // Preheader oculto: lido pelo cliente de e-mail, invisível na renderização.
    (pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(pre)}</div>` : "")
    + `<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${DARK};">${esc(h1)}</h1>`
    + blocks.map((b) => {
      if (b.p) return `<p style="margin:0 0 14px;">${boldHtml(b.p)}</p>`;
      if (b.ul) return `<ul style="margin:0 0 14px;padding-left:20px;">`
        + b.ul.map((i) => `<li style="margin-bottom:7px;">${boldHtml(i)}</li>`).join("") + `</ul>`;
      if (b.ol) return `<ol style="margin:0 0 14px;padding-left:20px;">`
        + b.ol.map((i) => `<li style="margin-bottom:9px;">${boldHtml(i)}</li>`).join("") + `</ol>`;
      if (b.cta) return btn(b.cta.href, b.cta.label);
      if (b.sig) return assinaturaHtml();
      return "";
    }).join("")
    // CTA repetido no fim: em e-mail longo, quem rolou até aqui já decidiu e não vai voltar.
    + (cta && blocks.filter((b) => b.p).length >= 5 ? btn(cta.cta.href, cta.cta.label) : "")
    + ps(boldHtml(psText))
    + (unsub ? `<p style="margin:18px 0 0;font-size:12px;color:#9aabab;">
        Não quer mais receber estes e-mails?
        <a href="${unsub}" style="color:#9aabab;text-decoration:underline;">Descadastrar</a>.</p>` : "")
  );
  return { subject: subject || h1, text, html };
}

// Eco do que a pessoa escreveu, curto. Mensagem vazia/ilegível → some, em vez de virar aspas vazias.
function resumo(mensagem) {
  const m = String(mensagem || "").replace(/\s+/g, " ").trim();
  if (m.length < 3) return "";
  return m.length <= 90 ? m : m.slice(0, 88).replace(/\s\S*$/, "") + "…";
}

// ═══════════════════════════════════════════════════════════════════════════════
// CA — CONTATO · tem receita ou nomeia a substância (MOST AWARE)
// 3 e-mails, 3 dias. O único trabalho da régua é EXTRAIR A RECEITA. Zero educação.
// ═══════════════════════════════════════════════════════════════════════════════

function CA1(d) {
  const r = resumo(d.mensagem);
  return compose({
    email: d.email, classe: "servico",
    h1: "Já está na mão do farmacêutico",
    pre: "Pra fechar o orçamento falta só a foto da receita.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      ...(r ? [{ p: `Você escreveu pra gente: "${r}"` }] : []),
      { p: `Isso já está com a nossa equipe. Pra fechar o orçamento, o farmacêutico precisa ver a receita — é ela que diz a dose, a forma e a quantidade. Sem esse papel, qualquer número que eu te desse seria chute.` },
      { p: `Então o próximo passo é um só: mandar a foto.` },
      { cta: { href: LOJAS_URL, label: "Enviar a receita no WhatsApp" } },
      { p: `O link abre o localizador: escolhe a unidade mais perto de você e fala direto com ela no WhatsApp. Uma foto tirada do celular resolve — não precisa escanear, não precisa estar reta. Precisa dar pra ler.` },
      { p: `Quem confere é o farmacêutico responsável da unidade, a mesma pessoa que vai assinar a fórmula. Se você quiser falar com ele antes de decidir qualquer coisa, é só pedir.` },
      { sig: true },
    ],
    psText: `Receita de outra cidade não é problema. A gente manipula e você retira na unidade mais perto de você — são 87 cidades.`,
  });
}

function CA2(d) {
  return compose({
    email: d.email, classe: "servico",
    h1: "Falta a receita pro orçamento sair",
    pre: "Foto de celular serve. Torta serve. Só precisa dar pra ler.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Seu pedido continua aberto aqui, parado no mesmo ponto: falta a receita.` },
      { p: `Eu sei que soa burocrático. Não é. A receita é o que autoriza o farmacêutico a manipular e o que diz exatamente quanto de cada ativo entra na fórmula. É o documento que separa manipulação de chute.` },
      { p: `E mandar é mais simples do que parece:` },
      { ul: [
        `foto de celular serve;`,
        `torta serve;`,
        `não precisa escanear nem imprimir;`,
        `amassada serve, desde que dê pra ler o ativo, a dose e a assinatura de quem prescreveu.`,
      ] },
      { cta: { href: LOJAS_URL, label: "Mandar a foto agora" } },
      { p: `Perdeu a receita? Quem prescreveu quase sempre reemite por mensagem, sem nova consulta. Está vencida? Aí precisa de uma nova — receita de manipulado tem prazo, e a gente não manipula fora dele.` },
    ],
    psText: `Não sabe se a sua ainda vale? Manda assim mesmo. O farmacêutico confere a validade e te responde. Leva um minuto e evita você ir até a unidade à toa.`,
  });
}

function CA3(d) {
  return compose({
    email: d.email, classe: "servico",
    h1: "Prefere resolver no balcão?",
    pre: "São 87 cidades e nenhuma delas exige agendamento.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Mandar foto por mensagem é o caminho mais rápido pra maioria das pessoas.` },
      { p: `Mas tem gente que prefere entregar a receita na mão de alguém, ouvir a resposta olhando pra pessoa e sair de lá com o prazo anotado. Se você é assim, não tem problema nenhum: é só chegar.` },
      { p: `São 87 cidades — o localizador acha a mais próxima de você, com endereço, telefone e mapa.` },
      { cta: { href: LOJAS_URL, label: "Ver a unidade mais perto de mim" } },
      { p: `Leve a receita. O farmacêutico confere na hora e você já sai sabendo o valor e o prazo. Não precisa agendar.` },
      { p: `Este é o último e-mail sobre este orçamento — não vou insistir. Se resolver mais pra frente, é só responder aqui: seu pedido fica registrado.` },
    ],
    psText: `Se preferir, ligue antes e peça pra falar com o farmacêutico. Ele diz por telefone se a fórmula é viável, antes de você sair de casa.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CB — CONTATO · descreve sintoma ou objetivo (PROBLEM AWARE)
// 4 e-mails, 7 dias. 🔴 Ele descreveu uma queixa: sugerir que existe fórmula que resolve aquilo
// é promessa terapêutica. A conversão é ACESSO ao farmacêutico, nunca solução.
// ═══════════════════════════════════════════════════════════════════════════════

function CB1(d) {
  const r = resumo(d.mensagem);
  return compose({
    email: d.email, classe: "servico",
    h1: "Recebemos sua dúvida",
    pre: "E já respondo a pergunta que vem antes de todas.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      ...(r ? [{ p: `Você nos escreveu: "${r}"` }] : []),
      { p: `Vou ser direto, porque economiza o seu tempo: manipulado é medicamento e sai por receita. Então eu não posso te dizer "toma isso" — nem eu, nem farmácia nenhuma. Quem decide o que você deve tomar é quem te examina.` },
      { p: `O que a gente pode fazer, e faz todo dia:` },
      { ul: [
        `explicar se o que você precisa é manipulável;`,
        `dizer o que perguntar pro seu médico ou nutricionista;`,
        `conferir uma receita que você já tenha e orçar.`,
      ] },
      { p: `Isso é conversa de farmacêutico, e ela não custa nada.` },
      { cta: { href: LOJAS_URL, label: "Falar com o farmacêutico" } },
      { p: `Quem responde é o farmacêutico responsável da unidade. Não é chat, não é robô, não é atendimento lendo script.` },
    ],
    psText: `Se você já tem receita e só quer saber o preço, responde este e-mail com a foto dela. Isso resolve hoje, sem conversa nenhuma.`,
  });
}

function CB2(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "A dose de prateleira não serve",
    pre: "Por que o mesmo comprimido serve pra um e não pro outro.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Remédio de prateleira é feito pra uma pessoa que não existe: a média.` },
      { p: `A fábrica escolhe uma dose que atende a maior parte da população e produz milhões iguais. Faz todo sentido pra ela. O problema aparece quando você não é a média — e quase ninguém é exatamente a média em peso, idade, tolerância ou rotina.` },
      { p: `Três situações que chegam no balcão toda semana:` },
      { ol: [
        `A receita pede metade da dose que existe pronta. Partir comprimido não resolve: a camada que controla a liberação quebra junto.`,
        `A pessoa não tolera algo que vem junto no comprimido — lactose, corante, glúten. O ativo servia; o acompanhamento, não.`,
        `Alguém toma cinco cápsulas de manhã que poderiam ser uma só, quando a receita permite associar.`,
      ] },
      { p: `Repare: nenhum dos três é sobre doença. São casos de **dose e de formato**. É exatamente aí que a manipulação entra.` },
      { cta: { href: LOJAS_URL, label: "Falar com a unidade mais perto de mim" } },
    ],
    psText: `Nada disso é diagnóstico nem recomendação. É o mapa do que dá pra fazer quando existe uma receita que permita — e só.`,
  });
}

function CB3(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "Dá pra falar com quem manipula?",
    pre: "Em farmácia, sim. Em plataforma de pedido, não existe nem quem chamar.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Toda farmácia de manipulação diz que é personalizada. É verdade — e por isso não quer dizer nada. Personalizar é o mínimo do ofício.` },
      { p: `E toda fórmula manipulada, por lei, tem que ser conferida e assinada por um farmacêutico responsável com registro ativo no conselho. Isso também não é diferencial de ninguém: é obrigação.` },
      { p: `O que muda de um lugar pro outro é uma coisa só. **Você consegue falar com essa pessoa?**` },
      { p: `Na maior parte dos lugares, não. Você fala com atendimento, com chat, com formulário — com alguém que repassa. E em plataforma que só intermedeia pedido não existe nem farmacêutico pra chamar: quem te vendeu não teve contato nenhum com o que você vai tomar.` },
      { p: `Aqui o farmacêutico da unidade atende. É ele quem:` },
      { ul: [
        `lê a sua receita e confere se a dose faz sentido;`,
        `decide o que pode e o que não pode ser associado na mesma cápsula;`,
        `acompanha o lote que virou o seu pote;`,
        `responde se alguma coisa sair diferente do esperado.`,
      ] },
      { cta: { href: LOJAS_URL, label: "Falar com o farmacêutico da minha unidade" } },
    ],
    psText: `Guarda essa pergunta pra qualquer farmácia de manipulação que você for usar, inclusive a nossa: "eu consigo falar com o farmacêutico responsável?". Se a resposta demorar, você já ficou sabendo bastante.`,
  });
}

function CB4(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "10 minutos com o farmacêutico?",
    pre: "Sem custo e sem compromisso. Só pra clarear o caminho.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Dá pra pesquisar tudo isso na internet. Muita gente pesquisa — e sai mais confusa do que entrou, porque a internet responde pra todo mundo ao mesmo tempo.` },
      { p: `O que a internet não faz é olhar a sua situação.` },
      { p: `Por isso eu ofereço dez minutos com o farmacêutico. Presencial na unidade, por telefone ou por mensagem, como for melhor pra você.` },
      { p: `O que cabe nesses dez minutos:` },
      { ul: [
        `se o que você precisa é manipulável;`,
        `o que levar e o que perguntar pra quem vai prescrever;`,
        `quanto tempo leva e como funciona a retirada.`,
      ] },
      { p: `O que **não** cabe: diagnóstico e indicação de tratamento. Isso é do médico, e a gente não passa por cima disso — nem quando o cliente pede.` },
      { cta: { href: LOJAS_URL, label: "Falar com a minha unidade" } },
    ],
    psText: `Este é o último e-mail desta sequência. Se quiser continuar por perto sem compromisso, a newsletter sai uma vez por semana e não exige receita, só curiosidade.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// P — PRESCRITORES (SOLUTION AWARE) · 4 e-mails a partir da APROVAÇÃO
// 🔴 Jargão técnico é OBRIGATÓRIO: é par falando com par. Copy de paciente reaproveitada
// queima credibilidade na primeira linha. CTA nunca vai pro balcão — vai pra Área do Prescritor.
// ═══════════════════════════════════════════════════════════════════════════════

function P3(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "De onde vem o ativo que você prescreve",
    pre: "Qualificação de fornecedor, laudo por lote e rastreabilidade.",
    blocks: [
      { p: `Dr(a). ${firstName(d.nome)},` },
      { p: `A fórmula que você desenha vale o que vale a matéria-prima que entra nela. Dois insumos com o mesmo nome no rótulo podem ter teor, granulometria e perfil de impureza diferentes — e o resultado clínico vai junto.` },
      { p: `Nem todo laboratório mostra de onde vem o insumo. Aqui o caminho é aberto:` },
      { ul: [
        `**Qualificação de fornecedor.** Fornecedor aprovado mediante documentação e histórico; troca não acontece no silêncio.`,
        `**Laudo por lote.** Cada lote de matéria-prima entra com laudo de análise do fabricante, com teor e identificação.`,
        `**Controle em processo.** Conferência de pesagem e dupla checagem na manipulação — onde mora a maior parte do erro humano.`,
        `**Rastreabilidade.** Do pote na mão do seu paciente é possível voltar até o lote do insumo e até quem manipulou.`,
      ] },
      { cta: { href: AREA_URL, label: "Ver o guia de formas farmacêuticas" } },
    ],
    psText: `Quer conferir com os próprios olhos? A unidade recebe visita de prescritor no laboratório. É só marcar — e é o tipo de coisa que vale mais fazer uma vez do que ler dez vezes.`,
  });
}

function P4(d) {
  const esp = d.especialidade;
  return compose({
    email: d.email, classe: "marketing",
    h1: `As formulações mais prescritas em ${esp}`,
    // Assunto separado do h1: "Ginecologia e Obstetrícia" no h1 estouraria os 50 caracteres.
    subject: `As mais prescritas em ${esp}`.length <= 50
      ? `As mais prescritas em ${esp}` : "As mais prescritas na sua área",
    pre: "Com faixa de dose usual e forma farmacêutica sugerida.",
    blocks: [
      { p: `Dr(a). ${firstName(d.nome)},` },
      { p: `Material genérico de farmácia não ajuda ninguém: metade não se aplica à sua prática e a outra metade você já sabe.` },
      { p: `Então separei o que é da sua área. Na Área do Prescritor estão as formulações mais prescritas em **${esp}** entre os prescritores que atendemos, com faixa de dose usual, forma farmacêutica sugerida e as observações de manipulação que costumam aparecer.` },
      { p: `Duas ressalvas honestas: faixa usual é referência de **viabilidade**, não recomendação de dose; e o que aparece ali reflete o que passa pelo nosso laboratório, não literatura.` },
      { cta: { href: AREA_URL, label: `Ver as formulações de ${esp}` } },
    ],
    psText: `Prescreve algo que não está na lista? Responde este e-mail com a fórmula que eu verifico viabilidade, faixa de dose e forma farmacêutica, e te respondo. Se não der pra fazer com segurança, eu digo isso também.`,
  });
}

function P5(d) {
  const cidade = d.cidade;
  return compose({
    email: d.email, classe: "marketing",
    h1: "O que o seu paciente encontra aqui",
    pre: "Da receita à retirada — e as unidades da sua cidade.",
    blocks: [
      { p: `Dr(a). ${firstName(d.nome)},` },
      { p: `Você prescreve e o paciente some da sua vista até a próxima consulta. O que acontece nesse intervalo é caixa-preta pro prescritor — e é lá que a sua prescrição dá certo ou vira reclamação.` },
      { p: `Então: o que o seu paciente vive aqui.` },
      { p: `Ele chega com a receita, no balcão ou por mensagem. O farmacêutico confere a prescrição antes de qualquer coisa: dose, compatibilidade, forma farmacêutica. **Se alguma coisa não fecha, a gente liga pra você.** Não improvisa, não substitui por conta própria.` },
      { p: `Orçamento na hora. Ele é avisado quando fica pronto e retira na unidade, ou recebe em casa. E a receita não fica presa a uma unidade: ele manipula em qualquer uma da rede.` },
      { cta: { href: LOJAS_URL, label: cidade ? `Ver as unidades de ${cidade}` : "Ver as unidades da rede" } },
    ],
    psText: `Se um paciente seu tiver qualquer problema — atraso, dúvida na retirada, divergência na fórmula — eu quero saber direto de você. Responde este e-mail. É mais rápido que passar pelo SAC, e eu resolvo pessoalmente.`,
  });
}

// P6 é o único e-mail da régua inteira SEM casca HTML: texto puro, quatro linhas, sem banner.
// Converte porque é pessoa falando com pessoa. Aplicar template aqui destrói o e-mail.
function P6(d) {
  const subject = "Posso te ligar 10 minutos?";
  const text =
    `Dr(a). ${firstName(d.nome)},\n\n` +
    `A gente pode te mandar material pra sempre. Só que material não me diz o que está faltando ` +
    `na sua prática — e é isso que eu preciso saber pra essa relação valer alguma coisa pros dois lados.\n\n` +
    `Me dá dez minutos por telefone? Quero entender o que você prescreve com frequência, o que já ` +
    `deu trabalho pra manipular e o que você gostaria de ter e não tem.\n\n` +
    `Se preferir, responde este e-mail em duas linhas. Também serve.\n\n` +
    `Equipe A Fórmula\n` +
    `Farmacêutico responsável — A Fórmula${d.cidade ? ` ${d.cidade}` : ""}\n\n` +
    `PS: Se for mais fácil no WhatsApp, é só dizer que a gente te chama.` +
    (unsubUrl(d.email) ? `\n\n---\nNão quer mais receber: ${unsubUrl(d.email)}` : "");
  return { subject, text, html: "" }; // html vazio de propósito → sendMail manda só texto
}

// ═══════════════════════════════════════════════════════════════════════════════
// T — TRABALHE CONOSCO · 3 e-mails, 30 dias. RH, nunca produto.
// CTA no localizador porque vaga de farmácia abre POR UNIDADE e currículo entregue na mão
// da unidade mais próxima é como isso funciona de verdade.
// ═══════════════════════════════════════════════════════════════════════════════

function T1(d) {
  const cidade = d.cidade;
  return compose({
    email: d.email, classe: "servico",
    h1: "Currículo recebido",
    pre: "O que acontece agora — e o prazo real, sem enrolação.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Seu currículo chegou e já está no nosso banco de talentos.` },
      { p: `Agora a parte honesta: nem toda unidade tem vaga aberta o tempo todo, e ${cidade ? cidade : "a sua cidade"} pode estar num período sem nenhuma. Se for o caso, seu cadastro não é descartado — ele fica ativo e é consultado toda vez que abre uma posição na sua região.` },
      { p: `Como funciona daqui pra frente:` },
      { ul: [
        `havendo vaga compatível agora, alguém da coordenação entra em contato por telefone ou e-mail;`,
        `não havendo, seu cadastro fica ativo e é consultado quando abrir;`,
        `não existe prazo fixo pra isso, e eu prefiro te dizer isso do que inventar um.`,
      ] },
      { p: `Uma coisa que acelera: vaga de farmácia abre **por unidade**. Saber qual é a mais perto de você — e aparecer lá — costuma valer mais que qualquer cadastro.` },
      { cta: { href: LOJAS_URL, label: "Ver as unidades perto de mim" } },
    ],
    psText: `Quando abre vaga na cidade, quem está no banco é avisado antes do anúncio ir pro site. É a vantagem real de ter se cadastrado.`,
  });
}

function T2(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "Como é o dia numa unidade",
    pre: "Metade do serviço não acontece no balcão.",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Quem olha de fora acha que trabalhar em farmácia de manipulação é atender balcão. É metade da história.` },
      { p: `A outra metade acontece no laboratório: pesagem, conferência, manipulação, envase, controle. É trabalho de precisão, com procedimento escrito pra quase tudo, porque a margem de erro em dose é pequena e o impacto é real.` },
      { p: `O que a gente cobra de quem entra:` },
      { ul: [
        `atenção a detalhe acima da média — é a competência número um, na frente de experiência;`,
        `seguir procedimento mesmo quando parece exagero;`,
        `explicar as coisas com paciência, porque boa parte de quem chega no balcão está insegura.`,
      ] },
      { p: `O que a gente oferece: formação interna e caminho. Muita gente que hoje coordena começou no atendimento.` },
      { cta: { href: LOJAS_URL, label: "Conhecer a unidade mais perto de mim" } },
    ],
    psText: `Não precisa ser farmacêutico pra trabalhar aqui — boa parte do time não é. Precisa gostar de detalhe. Se você se descartou por causa da formação, reconsidera.`,
  });
}

function T3(d) {
  const cidade = d.cidade;
  return compose({
    email: d.email, classe: "marketing",
    h1: "Seu currículo continua aqui",
    pre: "Quer ser avisado quando abrir vaga na sua região?",
    blocks: [
      { p: `Olá, ${firstName(d.nome)}.` },
      { p: `Faz um mês que você se cadastrou. Um recado curto, só pra você não ficar no escuro: seu currículo continua ativo no banco.` },
      { p: `O que eu não posso prometer é frequência. A gente não abre vaga todo mês em toda cidade, e ${cidade ? cidade : "a sua região"} pode passar um tempo sem nenhuma.` },
      { p: `O que eu posso fazer é te avisar quando abrir — se você quiser. **Responde este e-mail com "quero vagas"** e eu te coloco na lista de alerta da sua região.` },
      { p: `Se não responder, não recebe nada — e seu currículo segue no banco do mesmo jeito.` },
      { cta: { href: LOJAS_URL, label: "Ver as unidades da minha região" } },
    ],
    psText: `Isso vale só pra vaga. Você não vai receber propaganda de produto nem newsletter por causa disso. São listas separadas, e é assim que tem que ser.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// N — NEWSLETTER · ciclo 3 valor + 1 comercial, semanal.
// ⚠️ A base NÃO tem nome (a coleção guarda só email/source/consent) → nenhum e-mail usa nome.
// ═══════════════════════════════════════════════════════════════════════════════

function N2(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "O que mais perguntam no balcão",
    pre: "Três dúvidas que aparecem toda semana, respondidas por quem tem CRF.",
    blocks: [
      { p: `Toda semana as mesmas perguntas chegam no balcão. Parecem básicas, mas quase ninguém responde direito na internet — porque na internet a resposta é pra todo mundo, e essas dependem do caso.` },
      { p: `**"Manipulado é mais fraco que o de farmácia?"** Não. É a mesma substância, na dose que a receita pediu. A diferença é que o industrializado vem numa dose fixa escolhida pela fábrica e o manipulado vem na dose que o prescritor escreveu. Mais forte ou mais fraco depende do que está na receita, não de onde foi feito.` },
      { p: `**"Posso manipular sem receita?"** Depende do que é. Ativo que exige prescrição, não — e farmácia que faz isso está errada. Alguns produtos isentos de prescrição podem ser manipulados sem receita; o farmacêutico diz qual é qual.` },
      { p: `**"Por que demora alguns dias?"** Porque a fórmula não existe antes de você pedir. Ela é pesada, manipulada, envasada e conferida depois que a receita chega. É literalmente feita pra você, e isso leva tempo.` },
      { cta: { href: LOJAS_URL, label: "Perguntar pro farmacêutico da minha unidade" } },
    ],
    psText: `Tem uma dúvida que não está aqui? Responde este e-mail. Eu levo pro farmacêutico e a resposta vira a próxima edição — sem citar seu nome.`,
  });
}

function N3(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "Por que 5 comprimidos virariam 1",
    pre: "O que a manipulação resolve e a farmácia comum não.",
    blocks: [
      { p: `Tem gente que toma cinco cápsulas de manhã.` },
      { p: `Boa parte disso não é exigência do tratamento: é limitação de fábrica. Cada produto industrializado existe sozinho, com a sua dose e a sua embalagem, porque foi assim que foi registrado. Quem toma cinco coisas compra cinco caixas e engole cinco vezes.` },
      { p: `Quando a receita permite, dá pra associar ativos compatíveis numa cápsula só.` },
      { p: `O ganho não é estético, é de **adesão**. Quanto mais simples o esquema, menos gente esquece, pula ou abandona no meio — e esquema complicado é uma das razões mais comuns pra tratamento não funcionar, sem ter nada a ver com o remédio em si.` },
      { p: `Duas coisas que essa conversa **não** é:` },
      { ul: [
        `**Não é toda associação que pode.** Alguns ativos brigam entre si, outros precisam de horários diferentes, outros precisam de revestimento que a associação inviabiliza.`,
        `**Não é decisão de quem toma.** Quem decide o que entra junto é o prescritor, com o farmacêutico avaliando a viabilidade técnica.`,
      ] },
      { cta: { href: LOJAS_URL, label: "Falar com o farmacêutico da minha unidade" } },
    ],
    psText: `"Quando a receita permite" não é ressalva jurídica pra se proteger. É o farmacêutico dizendo que existe uma checagem antes — e você quer que exista.`,
  });
}

function N4(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "Tem uma unidade perto de você?",
    pre: "87 cidades. Veja o que a mais próxima manipula.",
    blocks: [
      { p: `Manipulado tem fama de coisa de capital. Muita gente descobre tarde que tem uma farmácia de manipulação a dez minutos de casa.` },
      { p: `A rede tem unidades em 87 cidades, boa parte fora de capital — interior, cidade média, região onde a alternativa costuma ser pedir pela internet e esperar.` },
      { p: `Vale saber onde fica a sua por três razões práticas:` },
      { ul: [
        `receita entregue na mão é conferida na hora, e você sai sabendo valor e prazo;`,
        `dúvida sobre uma fórmula que você já toma se resolve em cinco minutos de conversa;`,
        `retirada local não depende de transporte, que é onde produto sensível mais sofre.`,
      ] },
      { cta: { href: LOJAS_URL, label: "Encontrar minha unidade" } },
    ],
    psText: `Não tem na sua cidade? A gente manipula e envia. Responde este e-mail que eu explico como funciona o envio na sua região, inclusive o que muda pra fórmula que precisa de refrigeração.`,
  });
}

function N5(d) {
  return compose({
    email: d.email, classe: "marketing",
    h1: "Tem receita parada em casa?",
    pre: "Manda a foto: o farmacêutico confere se ainda vale.",
    blocks: [
      { p: `Existe uma gaveta em quase toda casa com uma receita dentro.` },
      { p: `A pessoa saiu do consultório decidida, a semana virou, e o papel ficou. Não é preguiça: é que resolver exige um passo a mais, e esse passo nunca parece urgente.` },
      { p: `Só que receita de manipulado tem **prazo de validade**. Passou, não dá pra manipular — precisa de uma nova, e aí o passo a mais virou uma consulta a mais.` },
      { p: `Se você tem uma parada, este é um bom momento. Uma foto encerra o assunto:` },
      { cta: { href: LOJAS_URL, label: "Enviar a receita no WhatsApp" } },
      { p: `O farmacêutico confere a validade, calcula e responde com valor e prazo. Se estiver vencida, ele te diz — e você fica sabendo agora, não daqui a três meses.` },
    ],
    psText: `Não sabe se a sua ainda vale? Manda assim mesmo. Conferir não custa nada e não compromete você a nada.`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Definição das réguas
// offset = dias a partir do gatilho · classe governa o gate de consentimento:
//   transacional → sempre envia · servico → sempre envia (resposta ao pedido do titular,
//   LGPD art. 7º V) · marketing → exige consentimento explícito.
// `skipIf` mata o e-mail quando o dado que ele consome não existe (P4 sem especialidade).
// ═══════════════════════════════════════════════════════════════════════════════

const FLOWS = {
  CA: [
    { step: "CA1", offset: 0, classe: "servico", render: CA1 },
    { step: "CA2", offset: 1, classe: "servico", render: CA2 },
    { step: "CA3", offset: 3, classe: "servico", render: CA3 },
  ],
  CB: [
    { step: "CB1", offset: 0, classe: "servico", render: CB1 },
    { step: "CB2", offset: 1, classe: "marketing", render: CB2 },
    { step: "CB3", offset: 3, classe: "marketing", render: CB3 },
    { step: "CB4", offset: 7, classe: "marketing", render: CB4 },
  ],
  // Conta da APROVAÇÃO (P1 sai no cadastro e P2 no evento de aprovação — ambos em _lib/emails.js).
  P: [
    { step: "P3", offset: 3, classe: "marketing", render: P3 },
    { step: "P4", offset: 7, classe: "marketing", render: P4, skipIf: (d) => !d.especialidade },
    { step: "P5", offset: 14, classe: "marketing", render: P5 },
    { step: "P6", offset: 21, classe: "marketing", render: P6 },
  ],
  T: [
    { step: "T1", offset: 0, classe: "servico", render: T1 },
    { step: "T2", offset: 3, classe: "marketing", render: T2 },
    { step: "T3", offset: 30, classe: "marketing", render: T3 },
  ],
  // N1 sai na inscrição (_lib/emails.js). O ciclo semanal começa 7 dias depois.
  N: [
    { step: "N2", offset: 7, classe: "marketing", render: N2 },
    { step: "N3", offset: 14, classe: "marketing", render: N3 },
    { step: "N4", offset: 21, classe: "marketing", render: N4 },
    { step: "N5", offset: 28, classe: "marketing", render: N5 },
  ],
};

// Triagem CA × CB. O formulário não pergunta "você tem receita?", então o sinal está no texto.
// Regra do brief: **na dúvida, CB** — CB nunca promete nada, CA pressupõe uma receita que pode
// não existir. Errar pra CA é mandar "manda a foto da receita" pra quem não tem receita.
const SINAIS_CA = [
  /or[çc]amento/i, /pre[çc]o|quanto custa|valor/i, /receita/i, /manipular?\s+(esse|essa|este|esta|o|a)\b/i,
  // Dose escrita. Tolera o que as pessoas realmente digitam: "4mg", "500 mg", "0,5g" e o típico
  // "4cmg" (verbatim real da caixa) — daí os 0–2 caracteres de lixo antes da unidade.
  // O "%" sai da alternância com \b: não existe fronteira de palavra depois de "%", então
  // "minoxidil 5%" escapava do detector se o % ficasse junto das outras unidades.
  /\b[\d.,]+\s*[a-z]{0,2}(?:(?:mg|mcg|ug|g|gr|ml|ui|iu)\b|%)/i,
  /\b(dr|dra|m[eé]dic[oa]|nutricionista|dentista|veterin[aá]ri[oa])\b/i, // citou quem prescreveu
  /\bf[oó]rmula\s+(abaixo|anexa|em anexo)\b/i,
];

// Palavras que denunciam DÚVIDA — bloqueiam a regra de fragmento curto abaixo.
const SINAIS_DUVIDA = /d[uú]vida|ajuda|informa[çc]|como\b|onde\b|quero saber|gostaria de saber|\?/i;

function triarContato(mensagem, assunto) {
  const m = `${assunto || ""} ${mensagem || ""}`;
  if (SINAIS_CA.some((re) => re.test(m))) return "CA";

  // Fragmento curto sem pergunta = quem já sabe o que quer e só digitou o nome da coisa
  // ("Ácido folico", "Orcamento"). Os verbatims da caixa mostram que este é o padrão do
  // Most Aware — ele não escreve frase, escreve o nome da substância.
  const palavras = String(mensagem || "").trim().split(/\s+/).filter(Boolean);
  if (palavras.length > 0 && palavras.length <= 3 && !SINAIS_DUVIDA.test(mensagem || "")) return "CA";

  return "CB"; // regra do brief: na dúvida, CB — ele nunca promete nada.
}

// Mapa assunto → régua. O form tem lista FECHADA de 7 valores (api/contato.js), então isto é
// determinístico — e três assuntos deliberadamente NÃO entram em régua nenhuma.
function fluxoPorAssunto(assunto, mensagem) {
  switch (String(assunto || "").trim()) {
    case "Dúvida sobre manipulação":
    case "Outro assunto":
      return triarContato(mensagem, assunto);
    case "Trabalhe conosco": return "T";
    case "Área do prescritor": return null;   // cadastro próprio dispara a régua P
    case "Acompanhamento de pedido": return null; // cliente atrás de pedido → atendimento
    case "Seja um franqueado": return null;   // régua F não existe (lacuna sinalizada no doc)
    case "Imprensa / parcerias": return null; // manual
    default: return null;
  }
}

// Modelo de consentimento, aplicado só aos passos de classe "marketing".
//   optin  → exige consentimento explícito (a caixinha do formulário / a inscrição na newsletter)
//   optout → legítimo interesse: envia até a pessoa pedir pra sair
// Prescritor é optout de propósito: conteúdo técnico B2B pra profissional identificado por
// conselho, com descadastro em todo e-mail. ⚠️ Base legal a ratificar com o DPO (Luiz Gomes) —
// está registrado como pendência no doc da régua. Pra exigir opt-in também no P, trocar aqui.
const CONSENT_MODEL = { CA: "optin", CB: "optin", P: "optout", T: "optin", N: "optin" };

module.exports = {
  FLOWS, CONSENT_MODEL, fluxoPorAssunto, triarContato, unsubToken, unsubUrl, LOJAS_URL,
};
