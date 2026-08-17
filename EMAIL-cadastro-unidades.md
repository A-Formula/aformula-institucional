# E-mail — coleta do cadastro das unidades

> 2026-08-17 · Rascunho criado também no Gmail (sem destinatário — decidir quem envia
> e para quem). Os campos aqui são os MESMOS de `scripts/build-fichas-sb.mjs` (`PEDIDOS`)
> e das fichas em `Second-Brain/TRABALHO/a-formula/unidades/`. Mudou um, mudar os três.

---

**Assunto:** Cadastro da sua unidade no site — 5 minutos, e a loja passa a aparecer no Google da sua cidade

---

Olá,

Cada unidade da A Fórmula agora tem **página própria no site**, com endereço, mapa,
horário e botão de WhatsApp que abre direto na conversa da loja.

Veja como ficou a de Salvador — Shopping Paralela:
https://www.aformulabr.com.br/encontre-uma-loja/salvador-shopping-paralela

Essa página é o que faz a sua loja aparecer quando alguém pesquisa
"farmácia de manipulação em [sua cidade]" — no Google e também nas respostas de
inteligência artificial, que hoje já respondem esse tipo de pergunta.

**Para a página da sua unidade ficar completa, precisamos de algumas informações
que não estão no nosso cadastro.** É rápido e é uma vez só.

👉 **Preencha aqui: [LINK DO FORMULÁRIO]**

Prazo: **[DATA]**

---

**O que vamos perguntar** (vale reunir antes de abrir o formulário):

**Atendimento**
1. Horário de funcionamento — segunda a sexta, sábado, domingo e feriados
   *(hoje o site mostra um horário genérico; se o da sua loja for diferente, o cliente
   chega na porta fechada)*
2. WhatsApp que atende hoje — confirmar se ainda é o número que temos
3. Telefone fixo, se houver
4. E-mail da unidade

**Endereço**
5. Endereço completo conferido — com bairro e complemento (sala, piso, quadra)
6. CEP
7. Ponto de referência — ex.: "em frente ao Shopping X", "ao lado da agência Y"
8. Link do Perfil do Google da unidade (Google Meu Negócio)

**Responsável técnico**
9. Farmacêutico(a) responsável — nome completo e número do CRF
   *(o Google exige profissional identificável em conteúdo de saúde; sem isso a página
   tem alcance limitado)*

**Fotos**
10. Foto da fachada — atual, de dia, mostrando o letreiro
11. Foto do interior — balcão ou área de atendimento

**Serviços da unidade**
12. A loja faz manipulação veterinária (A Fórmula Pet)?
13. Faz entrega? Em quais bairros ou cidades?
14. Formas de pagamento aceitas
15. Tem estacionamento? O acesso é adaptado para cadeirante?

**Complementares**
16. Instagram próprio da unidade, se tiver
17. Data de inauguração
18. Franqueado(a) responsável — nome e contato

---

Qualquer dúvida, é só responder este e-mail.

Obrigado,
Vinícius Gayer
A Fórmula

---

## Notas internas (não enviar)

- **Trocar antes de mandar:** `[LINK DO FORMULÁRIO]` e `[DATA]`.
- **Destinatário:** decidir entre (a) matriz/franchising distribuir para a rede,
  ou (b) envio direto às 75 unidades em operação. As 10 "em breve" só entram quando
  inaugurarem.
- **Fotos por formulário:** o Google Forms aceita upload, mas exige que quem responde
  esteja logado em conta Google. Se for barreira, pedir foto por WhatsApp em paralelo.
- **Ao receber as respostas:** preencher a ficha da unidade em
  `Second-Brain/TRABALHO/a-formula/unidades/{slug}.md` (fora do bloco AUTO),
  atualizar `encontre-uma-loja_assets/lojas.json` e rodar
  `node scripts/build-lojas.mjs --todas` — as páginas se atualizam sozinhas.
- **Horário:** enquanto não chegar, o site publica seg–sex 8h–18h e sáb 8h–13h como
  **referência declarada**. Está num único ponto do `build-lojas.mjs` (`HORARIO`).
