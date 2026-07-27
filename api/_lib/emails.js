// Templates dos e-mails enviados ao público. Copy da régua institucional v1 —
// spec e racional em APLICAÇÕES/clientes/a-formula/email/EMAILS-INSTITUCIONAL-v1.md
//   welcomeNewsletter()                          → N1 (opt-in na newsletter)
//   welcomePrescriber(nome, dados)               → P1 (cadastro de prescritor recebido)
//   approvalPrescriber(nome, resetLink, dados)   → P2 (aprovado — carrega o link de senha)
// Objetivo além de acolher: pedir que a pessoa ADICIONE o remetente aos contatos — melhora a
// entregabilidade de todos os e-mails futuros (aprovação de prescritor, avisos, novidades).
// Cada função retorna { subject, text, html } pro sendMail(to, subject, text, html, replyTo).
const SENDER = "no_reply@aformulabrasil.com.br";
const SAC = "sac@aformulabr.com.br";
const SITE = "https://www.aformulabr.com.br";
const AREA_URL = `${SITE}/area-do-prescritor`;
const TEAL = "#008896";
const DARK = "#052c32";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── Descadastro ──
// Mora aqui, e não em flows.js, porque este arquivo é o de baixo na hierarquia: flows.js importa
// emails.js, então colocar do outro lado criaria require circular.
// Token = HMAC do e-mail → link não adivinhável e ninguém descadastra terceiro.
function unsubToken(email) {
  const secret = process.env.UNSUB_SECRET || process.env.RESEND_API_KEY || "";
  if (!secret) return "";
  return require("crypto").createHmac("sha256", secret)
    .update(String(email).toLowerCase()).digest("hex").slice(0, 32);
}
function unsubUrl(email) {
  const t = unsubToken(email);
  if (!t) return "";
  return `${SITE}/api/descadastro?e=${encodeURIComponent(String(email).toLowerCase())}&t=${t}`;
}
// Rodapé de saída, em HTML e texto. Usado por todo e-mail de lista.
const unsubHtml = (url) => url
  ? `<p style="margin:18px 0 0;font-size:12px;color:#9aabab;">Não quer mais receber estes e-mails?
     <a href="${url}" style="color:#9aabab;text-decoration:underline;">Descadastrar</a>.</p>` : "";
const unsubText = (url) => url ? `\n\n---\nNão quer mais receber? ${url}` : "";

// Imagens do e-mail. PNG e JPG de propósito: o WebP do site não renderiza no Outlook.
// URL absoluta e no domínio oficial — caminho relativo não existe dentro de cliente de e-mail.
const IMG = `${SITE}/assets`;
const HEROS = {
  boasvindas: { src: `${IMG}/email-hero-boasvindas.jpg`, alt: "Chá, cápsulas e eucalipto sobre bancada de mármore" },
  formula:    { src: `${IMG}/email-hero-formula.jpg`,    alt: "Cápsulas manipuladas e vidraria de laboratório" },
  receita:    { src: `${IMG}/email-hero-receita.jpg`,    alt: "Cápsulas, água e frutas cítricas sobre mármore" },
  unidade:    { src: `${IMG}/email-hero-unidade.jpg`,    alt: "Prateleiras de uma unidade A Fórmula" },
};

// Casca comum: card branco 600px, logo real no topo, banner opcional.
// Regras de e-mail que o código respeita: tabela em vez de flex/grid, largura em atributo além do
// CSS, `display:block` na imagem (senão o Outlook deixa um vão embaixo) e ALT descritivo —
// metade dos clientes bloqueia imagem por padrão, e o e-mail tem que funcionar assim.
function layout(bodyHtml, opts) {
  const o = opts || {};
  const hero = o.hero && HEROS[o.hero] ? HEROS[o.hero] : null;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#eef2f2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f2;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e0e8e8;">

        <tr><td style="padding:26px 32px 20px;background:#ffffff;">
          <img src="${IMG}/email-logo.png" width="168" height="43" alt="A Fórmula — Farmácia de Manipulação"
            style="display:block;border:0;outline:none;text-decoration:none;width:168px;height:auto;
            color:${TEAL};font-size:20px;font-weight:bold;">
        </td></tr>
        <tr><td style="height:3px;background:${TEAL};line-height:3px;font-size:0;">&nbsp;</td></tr>

        ${hero ? `<tr><td style="padding:0;">
          <img src="${hero.src}" width="600" height="250" alt="${esc(hero.alt)}"
            style="display:block;border:0;width:100%;max-width:600px;height:auto;">
        </td></tr>` : ""}

        <tr><td style="padding:32px;color:${DARK};font-size:15px;line-height:1.65;">
          ${bodyHtml}
        </td></tr>

        ${rodape(o.unsub)}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Rodapé ───────────────────────────────────────────────────────────────────
// Enxuto de propósito (2ª rodada de ajuste do operador): saiu a tagline e saiu o bloco de
// navegação inteiro. Sobrou o essencial — as redes, o canal de atendimento e o que a lei pede.
//
// Ícones: PNG rasterizado dos SVGs OFICIAIS de cada marca (simple-icons, CC0), renderizados a
// 88px pelo próprio Chromium. Não são desenhados à mão — a primeira tentativa foi e ficou
// amadora. Ícone em e-mail TEM que ser imagem: cliente de e-mail não renderiza SVG, não carrega
// webfont e não aplica background-image. Compositados no fundo do rodapé, sem canal alfa, porque
// cliente que achata PNG transparente contra BRANCO faria o glifo branco desaparecer.
const FOOT_BG = "#063e47";
const F_CLARO = "#cfe9e9";
const F_LEGAL = "#9dbfc4";   // bloco legal — legível, não decorativo
const F_LINHA = "#0f5763";

const REDES = [
  ["instagram", "https://www.instagram.com/aformulafarmacia/", "Instagram"],
  ["facebook", "https://www.facebook.com/aformulafarmacia", "Facebook"],
  ["youtube", "https://www.youtube.com/@aformulafarmacia6374", "YouTube"],
  ["linkedin", "https://www.linkedin.com/company/aformulafarmacia/", "LinkedIn"],
];

function rodape(unsub) {
  const ico = ([n, href, nome]) =>
    `<td style="padding-right:16px;"><a href="${href}" style="text-decoration:none;">
       <img src="${IMG}/email-ico-${n}.png" width="24" height="24" alt="${nome}"
         style="display:block;border:0;width:24px;height:24px;"></a></td>`;

  return `<tr><td style="padding:28px 32px 26px;background:${FOOT_BG};">

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      <tr>${REDES.map(ico).join("")}</tr>
    </table>

    <p style="margin:0 0 20px;color:${F_CLARO};font-size:13px;line-height:1.7;">
      <a href="mailto:${SAC}" style="color:#ffffff;text-decoration:underline;">${SAC}</a>
      &nbsp;·&nbsp; ou responda este e-mail
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td style="height:1px;background:${F_LINHA};line-height:1px;font-size:0;">&nbsp;</td></tr>
    </table>

    <p style="margin:0;color:${F_LEGAL};font-size:11px;line-height:1.8;">
      Você recebeu este e-mail porque se cadastrou em
      <a href="${SITE}" style="color:#cfe9e9;text-decoration:none;">aformulabr.com.br</a>.${unsub ? `
      <a href="${unsub}" style="color:#cfe9e9;text-decoration:underline;">Não quero mais receber</a>.` : ""}
      <a href="${SITE}/lgpd" style="color:#cfe9e9;text-decoration:none;">Privacidade</a>.<br>
      A Fórmula Serviços e Franchise Ltda &nbsp;·&nbsp; CNPJ 10.760.350/0001-00<br>
      Rua Tabapuã, 627 — Itaim Bibi, São Paulo/SP &nbsp;·&nbsp; © 2026
    </p>
  </td></tr>`;
}

// Botão de CTA único (a régua proíbe CTA concorrente no mesmo e-mail).
function btn(href, label) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background:${TEAL};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

// Bloco reutilizável: instrução de adicionar o remetente aos contatos (anti-spam).
const addContactHtml = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="background:#eef7f6;border-left:4px solid ${TEAL};border-radius:6px;padding:16px 18px;font-size:14px;color:${DARK};">
      <strong>Um pedido prático:</strong> adicione <strong>${SENDER}</strong> aos seus contatos, ou
      arraste este e-mail pra caixa <em>Principal</em>. É o que impede que o próximo caia em
      promoções ou spam.
    </td></tr>
  </table>`;

// PS — segunda seção mais lida depois do assunto. Nunca repete o CTA: acrescenta razão nova.
const ps = (t) => `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #edf2f2;font-size:14px;color:${DARK};"><strong>PS:</strong> ${t}</p>`;

// ── N1 · Boas-vindas da NEWSLETTER ──
// A coleção guarda só {email, source, consent} → esta régua NÃO tem primeiro nome disponível.
// 🔴 Decisão do operador 2026-07-27: SEM pedir escolha de tema. Quem se inscreveu já autorizou;
// pedir de novo é fricção, e "responda com o tema" gera trabalho manual que ninguém faz.
// O e-mail agora faz três coisas e para: confirma, combina a frequência e oferece o único
// próximo passo que converte — falar com a unidade mais perto.
function welcomeNewsletter(email) {
  const subject = "Bem-vindo à A Fórmula";
  const pre = "Uma edição por semana. E o WhatsApp da unidade mais perto de você.";
  const lojas = `${SITE}/encontre-uma-loja`;
  // O PS promete que o link de saída está no pé de todas — então tem que estar no pé desta também.
  const unsub = email ? unsubUrl(email) : "";
  const text =
    `Olá!

` +
    `Sua inscrição está confirmada. Bem-vindo.

` +
    `O combinado, pra você não ter surpresa: uma edição por semana, sempre no mesmo dia. ` +
    `Nada de e-mail diário e nada de promoção disfarçada de conteúdo.

` +
    `O que vem: o que a gente aprende no balcão. Por que a mesma dose serve pra um e não pro ` +
    `outro, o que dá e o que não dá pra manipular, o que perguntar pro seu médico. Escrito por ` +
    `quem tem CRF, sem alarmismo e sem promessa de milagre.

` +
    `E se você já precisa de alguma fórmula manipulada, não precisa esperar a próxima edição: ` +
    `a unidade mais perto de você atende no WhatsApp.

` +
    `>> ENCONTRAR MINHA UNIDADE:
   ${lojas}

` +
    `Um pedido prático: adicione ${SENDER} aos seus contatos, ou arraste este e-mail pra caixa ` +
    `Principal. É o que impede que o próximo caia em promoções.

` +
    `PS: Tem uma dúvida de saúde que você nunca conseguiu resposta direta? Responde este e-mail. ` +
    `Eu levo pro farmacêutico e a resposta pode virar a próxima edição — sem citar seu nome.` +
    unsubText(unsub) + `

` +
    `A Fórmula — farmácia de manipulação em 87 cidades.`;
  const html = layout(`
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(pre)}</div>
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${DARK};">Bem-vindo à A Fórmula</h1>
    <p style="margin:0 0 14px;">Sua inscrição está confirmada.</p>
    <p style="margin:0 0 14px;">O combinado, pra você não ter surpresa: <strong>uma edição por
      semana</strong>, sempre no mesmo dia. Nada de e-mail diário e nada de promoção disfarçada
      de conteúdo.</p>
    <p style="margin:0 0 14px;">O que vem é o que a gente aprende no balcão: por que a mesma dose
      serve pra um e não pro outro, o que dá e o que não dá pra manipular, o que perguntar pro seu
      médico. Escrito por quem tem CRF — sem alarmismo e sem promessa de milagre.</p>
    <p style="margin:0 0 14px;">E se você já precisa de alguma fórmula manipulada, não precisa
      esperar a próxima edição: a unidade mais perto de você atende no WhatsApp.</p>
    ${btn(lojas, "Encontrar minha unidade")}
    ${addContactHtml}
    ${ps(`Tem uma dúvida de saúde que você nunca conseguiu resposta direta? Responde este e-mail.
      Eu levo pro farmacêutico e a resposta pode virar a próxima edição — sem citar seu nome.`)}
`, { hero: "boasvindas", unsub });
  return { subject, text, html, unsub };
}

// Primeiro nome pra saudação, pulando títulos (Dr., Dra., Prof.…) que muitos prescritores põem no início.
function firstName(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const isTitle = (w) => /^(dr|dra|prof|profa|sr|sra|dr\.|dra\.)\.?$/i.test(w);
  const first = parts.find((w) => !isTitle(w));
  return first || parts[0] || "prescritor(a)";
}

// "CRM 12345/SP" a partir do que o cadastro coletou. Vazio se não vier nada — a copy se adapta.
function registro(d) {
  const { conselho, conselhoNumero, uf } = d || {};
  if (!conselho || !conselhoNumero) return "";
  return `${conselho} ${conselhoNumero}${uf ? `/${uf}` : ""}`;
}

// Assinatura institucional, sem nome e sem CRF individual (decisão do operador 2026-07-27:
// nada que exponha uma pessoa específica ou que precise de manutenção quando alguém sai).
// O diferencial que a copy explora não é a IDENTIDADE do farmacêutico — é o ACESSO a ele:
// assinar a fórmula é obrigação legal de qualquer farmácia; deixar você falar com quem assina, não.
const ASSINATURA_LINHA =
  "Toda fórmula manipulada é conferida e assinada pelo farmacêutico responsável da unidade.";

function assinaturaText() {
  return `Equipe A Fórmula\n${ASSINATURA_LINHA}`;
}
function assinaturaHtml() {
  return `<p style="margin:22px 0 0;font-size:14px;line-height:1.5;"><strong>Equipe A Fórmula</strong><br>
       <span style="color:#5b7276;">${ASSINATURA_LINHA}</span></p>`;
}

// ── P1 · CADASTRO DE PRESCRITOR recebido (em análise) ──
// Jargão técnico é OBRIGATÓRIO nesta régua: é par falando com par, e copy de paciente
// reaproveitada queima credibilidade na primeira linha.
function welcomePrescriber(nome, dados) {
  const primeiro = firstName(nome);
  const reg = registro(dados);
  const conselho = (dados && dados.conselho) || "conselho";
  const subject = "Cadastro em análise";
  const text =
    `Dr(a). ${primeiro},\n\n` +
    `Recebemos seu cadastro na Área do Prescritor. Antes de liberar o acesso conferimos o ` +
    `registro no conselho${reg ? ` — ${reg}, no seu caso` : ""}. É por isso que não é automático: ` +
    `o conteúdo de lá é técnico e restrito a quem prescreve.\n\n` +
    `Prazo: até 3 dias úteis. O link pra definir a senha chega neste mesmo e-mail.\n\n` +
    `O que fica disponível depois da aprovação:\n` +
    `- ativos com faixas de dose usuais e limites de manipulação;\n` +
    `- formas farmacêuticas disponíveis: cápsula, sachê, gel, creme, solução, cápsula de liberação modificada;\n` +
    `- modelo de receituário magistral;\n` +
    `- contato direto do farmacêutico responsável, sem central no meio.\n\n` +
    `Um pedido prático: adicione ${SENDER} aos seus contatos. O e-mail de aprovação é o que ` +
    `carrega o link de acesso, e ele não pode cair em spam.\n\n` +
    `${assinaturaText()}\n\n` +
    `PS: Passou de três dias úteis e nada chegou? Responde este e-mail que eu verifico na hora. ` +
    `Quase sempre é divergência de grafia entre o nome do cadastro e o do ${conselho}.`;
  const html = layout(`
    <h1 style="margin:0 0 14px;font-size:21px;color:${DARK};">Cadastro em análise</h1>
    <p style="margin:0 0 14px;">Dr(a). <strong>${esc(primeiro)}</strong>,</p>
    <p style="margin:0 0 14px;">Recebemos seu cadastro na <strong>Área do Prescritor</strong>. Antes de
      liberar o acesso conferimos o registro no conselho${reg ? ` — <strong>${esc(reg)}</strong>, no seu caso` : ""}.
      É por isso que não é automático: o conteúdo de lá é técnico e restrito a quem prescreve.</p>
    <p style="margin:0 0 14px;"><strong>Prazo: até 3 dias úteis.</strong> O link pra definir a senha
      chega neste mesmo e-mail.</p>
    <p style="margin:0 0 8px;">O que fica disponível depois da aprovação:</p>
    <ul style="margin:0 0 14px;padding-left:20px;">
      <li style="margin-bottom:6px;">ativos com faixas de dose usuais e limites de manipulação;</li>
      <li style="margin-bottom:6px;">formas farmacêuticas disponíveis — cápsula, sachê, gel, creme, solução, cápsula de liberação modificada;</li>
      <li style="margin-bottom:6px;">modelo de receituário magistral;</li>
      <li>contato direto do farmacêutico responsável, sem central no meio.</li>
    </ul>
    ${addContactHtml}
    <p style="margin:0;">O e-mail de aprovação é o que carrega o link de acesso — é o único que você
      realmente não pode perder.</p>
    ${assinaturaHtml()}
    ${ps(`Passou de três dias úteis e nada chegou? Responde este e-mail que eu verifico na hora.
      Quase sempre é divergência de grafia entre o nome do cadastro e o do ${esc(conselho)}.`)}`,
    { hero: "formula" });
  return { subject, text, html };
}

// ── P2 · CADASTRO APROVADO ──
// 🔴 O resetLink é a FUNÇÃO deste e-mail: vem primeiro, antes de qualquer conteúdo.
// É daqui que P3–P6 contam o offset (evento de aprovação, não de cadastro).
function approvalPrescriber(nome, resetLink, dados) {
  const primeiro = firstName(nome);
  const reg = registro(dados);
  const subject = `Acesso liberado, Dr(a). ${primeiro}`;
  const text =
    `Dr(a). ${primeiro},\n\n` +
    `Cadastro aprovado.${reg ? ` Registro conferido: ${reg}.` : ""}\n\n` +
    `Defina sua senha de acesso neste link:\n${resetLink}\n\n` +
    `Depois é só entrar em ${AREA_URL} com o seu e-mail e a senha que você criar.\n\n` +
    `Prescrever magistral exige saber o que a farmácia consegue executar: faixa de dose viável, ` +
    `forma farmacêutica compatível com o ativo, o que estabiliza e o que não estabiliza. Essa ` +
    `informação normalmente fica atrás do balcão. Aqui ela está aberta:\n` +
    `- ativos com faixas usuais e limites de manipulação;\n` +
    `- formas farmacêuticas disponíveis e as incompatibilidades comuns;\n` +
    `- modelo de receituário magistral;\n` +
    `- telefone direto do farmacêutico responsável.\n\n` +
    `${assinaturaText()}\n\n` +
    `PS: O telefone que está lá dentro não é 0800. É o ramal do farmacêutico. Se precisar discutir ` +
    `a viabilidade de uma fórmula antes de prescrever, é pra lá que se liga.`;
  const html = layout(`
    <h1 style="margin:0 0 14px;font-size:21px;color:${DARK};">Acesso liberado</h1>
    <p style="margin:0 0 14px;">Dr(a). <strong>${esc(primeiro)}</strong>,</p>
    <p style="margin:0 0 14px;">Cadastro aprovado.${reg ? ` Registro conferido: <strong>${esc(reg)}</strong>.` : ""}</p>
    <p style="margin:0 0 4px;">Defina sua senha de acesso:</p>
    ${btn(resetLink, "Definir minha senha")}
    <p style="margin:0 0 18px;font-size:13px;color:#5b7276;">Se o botão não funcionar, copie e cole
      este endereço no navegador:<br><span style="word-break:break-all;">${esc(resetLink)}</span></p>
    <p style="margin:0 0 14px;">Depois é só entrar na
      <a href="${AREA_URL}" style="color:${TEAL};">Área do Prescritor</a> com o seu e-mail e a
      senha que você criar.</p>
    <p style="margin:0 0 14px;">Prescrever magistral exige saber o que a farmácia consegue executar:
      faixa de dose viável, forma farmacêutica compatível com o ativo, o que estabiliza e o que não
      estabiliza. Essa informação normalmente fica atrás do balcão. Aqui ela está aberta:</p>
    <ul style="margin:0 0 14px;padding-left:20px;">
      <li style="margin-bottom:6px;">ativos com faixas usuais e limites de manipulação;</li>
      <li style="margin-bottom:6px;">formas farmacêuticas disponíveis e as incompatibilidades comuns;</li>
      <li style="margin-bottom:6px;">modelo de receituário magistral;</li>
      <li>telefone direto do farmacêutico responsável.</li>
    </ul>
    ${assinaturaHtml()}
    ${ps(`O telefone que está lá dentro não é 0800. É o ramal do farmacêutico. Se precisar discutir
      a viabilidade de uma fórmula antes de prescrever, é pra lá que se liga.`)}`,
    { hero: "formula" });
  return { subject, text, html };
}

module.exports = {
  welcomeNewsletter, welcomePrescriber, approvalPrescriber,
  // Reaproveitados por _lib/flows.js (os 18 e-mails das réguas) — casca e voz únicas.
  layout, btn, ps, esc, firstName, assinaturaText, assinaturaHtml, addContactHtml,
  unsubToken, unsubUrl, unsubHtml, unsubText,
  SENDER, SAC, SITE, AREA_URL, TEAL, DARK,
};
