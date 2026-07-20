// Templates dos e-mails de BOAS-VINDAS enviados ao público (newsletter + cadastro de prescritor).
// Objetivo além de acolher: pedir que a pessoa ADICIONE o remetente aos contatos — melhora a
// entregabilidade de todos os e-mails futuros (aprovação de prescritor, avisos, novidades).
// Cada função retorna { subject, text, html } pro sendMail(to, subject, text, html).
const SENDER = "no_reply@aformulabrasil.com.br";
const SAC = "sac@aformulabr.com.br";
const TEAL = "#008896";
const DARK = "#052c32";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Casca comum: card branco 600px, faixa teal com o wordmark em texto (sem imagens —
// imagem quebrada em cliente de e-mail piora spam score e a URL do site ainda vai mudar no corte).
function layout(bodyHtml) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f2f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3eaea;">
        <tr><td style="background:${TEAL};padding:22px 32px;">
          <span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:.5px;">a fórmula</span>
          <span style="color:#bfe6e2;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding-left:10px;">Farmácia de Manipulação</span>
        </td></tr>
        <tr><td style="padding:32px;color:${DARK};font-size:15px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 32px 26px;border-top:1px solid #edf2f2;color:#7a8c8c;font-size:12px;line-height:1.6;">
          Este é um e-mail automático enviado por <strong>${SENDER}</strong>.<br>
          Dúvidas ou atendimento: <a href="mailto:${SAC}" style="color:${TEAL};">${SAC}</a> ·
          <a href="https://www.instagram.com/aformulafarmacia" style="color:${TEAL};">@aformulafarmacia</a><br>
          A Fórmula — há mais de 37 anos cuidando da sua saúde.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Bloco reutilizável: instrução de adicionar o remetente aos contatos (anti-spam).
const addContactHtml = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="background:#eef7f6;border-left:4px solid ${TEAL};border-radius:6px;padding:16px 18px;font-size:14px;color:${DARK};">
      <strong>📥 Importante — garanta que nossos e-mails cheguem até você:</strong><br>
      adicione <strong>${SENDER}</strong> aos seus contatos (ou marque este e-mail como
      "Não é spam" / arraste para a caixa <em>Principal</em>). Assim nossos próximos avisos
      não caem na pasta de spam ou promoções.
    </td></tr>
  </table>`;
const addContactText =
  `IMPORTANTE — garanta que nossos e-mails cheguem até você:\n` +
  `adicione ${SENDER} aos seus contatos (ou marque este e-mail como "Não é spam").\n` +
  `Assim nossos próximos avisos não caem na pasta de spam.`;

// ── Boas-vindas: NEWSLETTER ──
function welcomeNewsletter() {
  const subject = "Inscrição confirmada — bem-vindo(a) à A Fórmula";
  const text =
    `Olá!\n\n` +
    `Sua inscrição na newsletter da A Fórmula foi confirmada. A partir de agora você recebe ` +
    `em primeira mão nossos conteúdos de saúde e bem-estar, novidades e lançamentos.\n\n` +
    `${addContactText}\n\n` +
    `Enquanto isso, visite nosso blog e conheça nossas linhas em aformulabr.com.br.\n\n` +
    `Se você não fez esta inscrição ou não quer mais receber, escreva para ${SAC}.\n\n` +
    `A Fórmula — há mais de 37 anos cuidando da sua saúde.`;
  const html = layout(`
    <h1 style="margin:0 0 14px;font-size:21px;color:${DARK};">Inscrição confirmada 💚</h1>
    <p style="margin:0 0 14px;">Olá!</p>
    <p style="margin:0 0 14px;">Sua inscrição na newsletter da <strong>A Fórmula</strong> foi confirmada.
      A partir de agora você recebe em primeira mão nossos conteúdos de saúde e bem-estar,
      novidades e lançamentos.</p>
    ${addContactHtml}
    <p style="margin:0 0 14px;">Enquanto isso, visite nosso blog e conheça nossas linhas em
      <a href="https://aformulabr.com.br" style="color:${TEAL};font-weight:bold;">aformulabr.com.br</a>.</p>
    <p style="margin:0;color:#7a8c8c;font-size:13px;">Se você não fez esta inscrição ou não quer mais
      receber, escreva para <a href="mailto:${SAC}" style="color:${TEAL};">${SAC}</a>.</p>`);
  return { subject, text, html };
}

// Primeiro nome pra saudação, pulando títulos (Dr., Dra., Prof.…) que muitos prescritores põem no início.
function firstName(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const isTitle = (w) => /^(dr|dra|prof|profa|sr|sra|dr\.|dra\.)\.?$/i.test(w);
  const first = parts.find((w) => !isTitle(w));
  return first || parts[0] || "prescritor(a)";
}

// ── Boas-vindas: CADASTRO DE PRESCRITOR (recebido, em análise) ──
function welcomePrescriber(nome) {
  const primeiro = firstName(nome);
  const subject = "Recebemos seu cadastro — Área do Prescritor A Fórmula";
  const text =
    `Olá, ${primeiro}!\n\n` +
    `Recebemos seu cadastro na Área do Prescritor da A Fórmula. Nossa equipe vai analisar ` +
    `seus dados e, assim que o acesso for aprovado, você recebe NESTE E-MAIL o link para ` +
    `definir sua senha e entrar.\n\n` +
    `${addContactText}\n` +
    `O e-mail de aprovação é o passo mais importante — não deixe que ele se perca.\n\n` +
    `Na Área do Prescritor você encontra conteúdo científico, sugestões de fórmulas e ` +
    `materiais exclusivos para a sua prática.\n\n` +
    `Dúvidas? Escreva para ${SAC}.\n\n` +
    `A Fórmula — há mais de 37 anos cuidando da sua saúde.`;
  const html = layout(`
    <h1 style="margin:0 0 14px;font-size:21px;color:${DARK};">Cadastro recebido ✓</h1>
    <p style="margin:0 0 14px;">Olá, <strong>${esc(primeiro)}</strong>!</p>
    <p style="margin:0 0 14px;">Recebemos seu cadastro na <strong>Área do Prescritor</strong> da A Fórmula.
      Nossa equipe vai analisar seus dados e, assim que o acesso for aprovado, você recebe
      <strong>neste e-mail</strong> o link para definir sua senha e entrar.</p>
    ${addContactHtml}
    <p style="margin:0 0 14px;">O e-mail de aprovação é o passo mais importante — não deixe que ele se perca.</p>
    <p style="margin:0 0 14px;">Na Área do Prescritor você encontra conteúdo científico, sugestões de
      fórmulas e materiais exclusivos para a sua prática.</p>
    <p style="margin:0;color:#7a8c8c;font-size:13px;">Dúvidas? Escreva para
      <a href="mailto:${SAC}" style="color:${TEAL};">${SAC}</a>.</p>`);
  return { subject, text, html };
}

module.exports = { welcomeNewsletter, welcomePrescriber };
