// Gera uma página local pra revisar os 21 e-mails das réguas de uma vez, no navegador.
// Usa as URLs REAIS das imagens (o site já serve os assets), então o que aparece aqui é
// exatamente o que chega na caixa. Uso:
//   node scripts/gerar-preview-reguas.mjs "<pasta de saída>"
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = process.argv[2] || join(RAIZ, "_preview-reguas");
process.env.UNSUB_SECRET ||= "preview";

const em = require(join(RAIZ, "api/_lib/emails.js"));
const { FLOWS } = require(join(RAIZ, "api/_lib/flows.js"));

const leads = {
  CA: { nome: "Maria Souza", email: "maria@exemplo.com", mensagem: "Ácido folico 4cmg, queria orçamento" },
  CB: { nome: "João Pedro", email: "joao@exemplo.com", mensagem: "queria emagrecer, o que vocês têm" },
  P: { nome: "Dra. Marina Alves", email: "marina@exemplo.com", conselho: "CRM", conselhoNumero: "123456", uf: "SP", especialidade: "Endocrinologia", cidade: "Campinas" },
  T: { nome: "Ana Clara Reis", email: "ana@exemplo.com", cidade: "Jequié", area: "Atendimento" },
  N: { email: "leitor@exemplo.com" },
};
const REGUA = {
  CA: "CONTATO · tem receita (MOST AWARE)",
  CB: "CONTATO · descreve sintoma (PROBLEM AWARE)",
  P: "PRESCRITORES (SOLUTION AWARE)",
  T: "TRABALHE CONOSCO",
  N: "NEWSLETTER",
};
const OFFSET = (o) => (o === 0 ? "T+0 (na hora)" : `T+${o} dia${o > 1 ? "s" : ""}`);

mkdirSync(SAIDA, { recursive: true });

const itens = [];
// Os 3 de gatilho imediato
itens.push({ regua: "N", step: "N1", quando: "T+0 — na inscrição", classe: "transacional", ...em.welcomeNewsletter("leitor@exemplo.com") });
itens.push({ regua: "P", step: "P1", quando: "T+0 — no cadastro", classe: "transacional", ...em.welcomePrescriber(leads.P.nome, leads.P) });
itens.push({ regua: "P", step: "P2", quando: "evento — na aprovação", classe: "transacional", ...em.approvalPrescriber(leads.P.nome, "https://exemplo.com/definir-senha", leads.P) });
// Os 18 agendados
for (const [regua, passos] of Object.entries(FLOWS)) {
  for (const s of passos) {
    const m = s.render({ ...leads[regua] });
    itens.push({ regua, step: s.step, quando: OFFSET(s.offset), classe: s.classe, ...m });
  }
}
// Ordem de leitura: régua por régua
const ORDEM = ["CA", "CB", "P", "T", "N"];
itens.sort((a, b) => ORDEM.indexOf(a.regua) - ORDEM.indexOf(b.regua) || a.step.localeCompare(b.step));

for (const it of itens) {
  const corpo = it.html || `<pre style="font:14px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;
    background:#fff;padding:32px;margin:0;color:#052c32;">${it.text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>`;
  writeFileSync(join(SAIDA, `mail-${it.step}.html`), corpo, "utf-8");
}

const cartao = (it) => `
  <section id="${it.step}" style="margin:0 0 46px;">
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;margin:0 0 12px;">
      <strong style="font-size:19px;color:#052c32;">${it.step}</strong>
      <span style="font-size:13px;color:#5b7276;">${it.quando}</span>
      <span style="font-size:11px;letter-spacing:.5px;text-transform:uppercase;padding:3px 9px;border-radius:99px;
        background:${it.classe === "marketing" ? "#fdf1e3" : "#e6f4f4"};color:${it.classe === "marketing" ? "#8a5a1a" : "#0a5e6b"};">${it.classe}</span>
      ${it.html ? "" : `<span style="font-size:11px;padding:3px 9px;border-radius:99px;background:#eee;color:#555;">texto puro</span>`}
    </div>
    <div style="font-size:15px;color:#052c32;margin:0 0 4px;"><b>Assunto:</b> ${it.subject} <span style="color:#8aa;">(${it.subject.length} car.)</span></div>
    <iframe src="mail-${it.step}.html" style="width:100%;max-width:640px;height:900px;border:1px solid #dbe6e6;
      border-radius:10px;background:#eef2f2;" loading="lazy"></iframe>
  </section>`;

const indice = ORDEM.map((r) => {
  const doGrupo = itens.filter((i) => i.regua === r);
  return `<div style="margin:0 0 10px;"><strong style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#0a5e6b;">${r} — ${REGUA[r]}</strong><br>
    ${doGrupo.map((i) => `<a href="#${i.step}" style="color:#0a5e6b;">${i.step}</a>`).join(" · ")}</div>`;
}).join("");

writeFileSync(join(SAIDA, "index.html"), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Réguas de e-mail — A Fórmula (${itens.length} e-mails)</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f7f7;font-family:system-ui,-apple-system,Arial,sans-serif;color:#052c32;">
<div style="max-width:760px;margin:0 auto;padding:40px 24px 80px;">
  <h1 style="font-size:26px;margin:0 0 6px;">Réguas de e-mail — A Fórmula institucional</h1>
  <p style="margin:0 0 26px;color:#5b7276;font-size:15px;line-height:1.6;">
    ${itens.length} e-mails, renderizados com as imagens reais do site. É exatamente o que chega na caixa.
    Os dados são de exemplo (nome, cidade, especialidade).</p>
  <div style="background:#fff;border:1px solid #dbe6e6;border-radius:12px;padding:20px 22px;margin:0 0 40px;">${indice}</div>
  ${ORDEM.map((r) => `<h2 style="font-size:14px;letter-spacing:1.5px;text-transform:uppercase;color:#0a5e6b;
      border-top:2px solid #0a5e6b;padding-top:12px;margin:44px 0 22px;">${r} — ${REGUA[r]}</h2>
    ${itens.filter((i) => i.regua === r).map(cartao).join("")}`).join("")}
</div></body></html>`, "utf-8");

console.log(`${itens.length} e-mails · abra: ${join(SAIDA, "index.html")}`);
