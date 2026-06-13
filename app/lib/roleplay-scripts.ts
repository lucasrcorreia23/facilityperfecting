// Roteiros do vendedor para testar cada roleplay ("Minhas Falas").
// Textos estáticos, um por roleplay, indexados pelo número (0.0, 1.1 … 3.3).
// O número casa com o nome da linha da Prontidão: "RP1.1 (v3)" → "1.1".

export interface RoleplayScript {
  /** Código numérico do roleplay, ex.: "1.1". */
  code: string;
  /** Cabeçalho da seção, ex.: "1.1 — Patricia (Fluency Way)". */
  title: string;
  /** Lista numerada verbatim das falas/instruções. */
  body: string;
}

export const ROLEPLAY_SCRIPTS: Record<string, RoleplayScript> = {
  "0.0": {
    code: "0.0",
    title: "0.0 — Mariana Lopes (VeloX)",
    body: `1. "Oi Mariana, tudo bem? Aqui é o [seu nome], da RD Station. Obrigado por atender. Você tem uns quinze minutinhos?"
2. "Ótimo. Minha ideia hoje não é falar de produto: é entender como tá o caminho do lead depois que o marketing entrega, e ver se faz sentido um próximo passo. Pode ser?"
3. "Me conta: quantos leads vocês geram por mês, mais ou menos?"
4. "E quem qualifica esses leads? Como funciona?"
5. "E o que acontece com o lead depois que ele cai no WhatsApp do vendedor?"
6. "Quanto tempo, em média, o lead espera pelo primeiro retorno?"
7. "E pra você provar resultado pra diretoria, como é que você monta esse número hoje?"
8. "E quando esse número chega frágil, o que isso custa pra você lá dentro?"
9. [armadilha — fale isso de propósito] "Mariana, pelo que você falou, o ideal é levar CRM, Conversas e a integração completa, tudo junto."
10. [após a reação dela, recue] "Justo. Então me ajuda: se a gente fosse atacar um elo só primeiro, qual te tira mais o sono?"
11. "Tem alguma cobrança ou prazo da diretoria que torna isso mais urgente agora?"
12. "E se a gente avançar, quem mais precisa participar dessa conversa aí dentro?"
13. "Já tiveram experiência ruim com ferramenta antes? Como foi?"
14. "Proposta então: uma reunião de diagnóstico do funil, uns quarenta e cinco minutos, com você e a liderança de vendas, semana que vem. Eu levo um mapa do que vimos hoje e a gente decide o elo prioritário. Fechado?"
15. "Perfeito. Te mando o convite ainda hoje. Obrigado, Mariana, até lá!"`,
  },
  "1.1": {
    code: "1.1",
    title: "1.1 — Patricia (Fluency Way)",
    body: `1. "Oi Mariana, tudo bem? [seu nome], da RD. Obrigado por ter pedido esse papo. Você tem uns vinte minutos?"
2. "Combinado. Meu objetivo é entender onde os leads se perdem entre o marketing e o comercial, e tentar dimensionar isso com você. Pode ser?"
3. [armadilha — fale cedo de propósito] "Antes de tudo: quanto vocês perdem de dinheiro por mês com esses leads parados?"
4. [após a esquiva, recue] "Justíssimo. E se a gente trabalhar só com faixas e ordens de grandeza, sem precisão contábil? Só pra ter uma noção do tamanho."
5. "Então vamos lá: quantos leads entram por mês em período de campanha?"
6. "Desses, quantos são qualificados pra abordagem comercial?"
7. "E dos qualificados, quantos passam de vinte e quatro horas sem o primeiro contato?"
8. "E em pico de campanha, esse número muda?"
9. "Hoje você consegue saber quais foram abordados e quais não?"
10. "Qual a conversão de qualificado pra matrícula, mais ou menos?"
11. "E a matrícula inicial fica em torno de quanto?"
12. "Deixa eu fazer uma conta em voz alta: se entram mil por mês, uns quarenta e cinco por cento qualificados, são uns quatrocentos e cinquenta. Se um terço passa de um dia sem contato, são uns cento e cinquenta leads esperando. Com conversão de sete por cento e ticket de mil e duzentos, cada mês disso pode estar custando dezenas de matrículas no ano. Faz sentido essa ordem de grandeza pra você?"
13. "Antes de qualquer produto: topa uma conversa curta com o gerente comercial pra validar esses números juntos? Aí sim a gente avalia se o CRM resolve o gargalo."
14. "Fechado. Te mando dois horários. Obrigado, Mariana!"`,
  },
  "1.2": {
    code: "1.2",
    title: "1.2 — Ricardo Mendes (crédito)",
    body: `1. "Oi Ricardo, tudo bem? [seu nome], da RD Station. Valeu por atender. Consegue uns quinze minutos?"
2. "Show. A ideia é entender como roda a operação de WhatsApp de vocês hoje e ver se faz sentido evoluir alguma coisa. Pode ser?"
3. "Me conta: como funciona uma campanha de WhatsApp aí, do começo ao fim?"
4. "Quantas campanhas vocês rodam por mês? E pra quantos contatos?"
5. "E quanto tempo do seu time vai numa campanha dessas?"
6. "Já tiveram problema de bloqueio de número?"
7. "E o que acontece quando bloqueia, no meio da campanha?"
8. "Das conversas que acontecem, quanto vai parar registrado no CRM?"
9. "Então deixa eu resumir: quatro a cinco campanhas por mês, oito a doze horas cada, com risco de bloqueio e metade das conversas sem registro. Só de hora de gente, isso já é um custo relevante todo mês, concorda?"
10. [armadilha — fale de propósito] "Do jeito que tá, vocês vão ser bloqueados de novo semana que vem, precisa resolver isso urgente."
11. [após a reação, recue] "Tem razão, sem alarme. O ponto é: faz sentido eu te mostrar como ficaria essa mesma campanha num número oficial, com registro automático? Uns trinta minutos, essa semana."
12. "Fechado, te mando o convite. Valeu, Ricardo!"`,
  },
  "1.3": {
    code: "1.3",
    title: "1.3 — Rodrigo Martins (Conecta Saúde)",
    body: `1. "Oi Rodrigo, tudo bem? [seu nome], da RD. Obrigado por retomar. Você tem uns vinte e cinco minutos?"
2. "Perfeito. Hoje a ideia é colocar na ponta do lápis se essa expansão se paga — número, não apresentação. Pode ser?"
3. "Primeiro me situa: quantos leads entram por mês e quanto disso passa pelo WhatsApp?"
4. "E quanto das conversas comerciais relevantes fica fora do CRM?"
5. "Já aconteceu de quase perder negócio por isso?"
6. "E quanto tempo por semana vai em consolidar relatório, somando as áreas?"
7. [espere o "achei caro" — se não vier, pergunte: "e quando você olha o investimento da expansão, qual sua primeira reação?"]
8. [armadilha — fale de propósito] "Entendo. Olha, consigo te dar uns quinze por cento de desconto pra fechar esse mês."
9. [ele vai pedir mais e seguir inseguro — então recue] "Sabe de uma coisa, esquece o desconto por um momento. Antes disso: caro comparado a quê? Vamos comparar o investimento com o custo dessa operação fragmentada."
10. "Vamos juntos: taxa de lead pra oportunidade, ticket médio anual e quanto das oportunidades se perde por falta de follow-up — me dá essas faixas?"
11. "Então: se dez por cento das oportunidades se perdem, com ticket de vinte e poucos mil, são centenas de milhares por ano. Mais as dez a quinze horas semanais de relatório. Frente a isso, o investimento muda de figura, concorda?"
12. "O que o Financeiro exige pra aprovar uma expansão dessas?"
13. "E TI e o time comercial — alguma cicatriz com implementação ou adoção que a gente precisa respeitar?"
14. "Proposta: começamos por um escopo inicial no fluxo de maior perda, e marcamos uma validação executiva com marketing, TI e Financeiro, com esses números na mesa. Topa?"
15. "Fechado. Obrigado, Rodrigo, te envio a pauta!"`,
  },
  "2.1": {
    code: "2.1",
    title: "2.1 — Renata Azevedo (Fluency Way)",
    body: `1. "Oi Renata, tudo bem? [seu nome], da RD. Sei que você tá no meio da campanha, então obrigado pelo tempo. Vinte minutos tá bom?"
2. "Ótimo. E justamente por causa da campanha eu queria essa conversa: entender se esperar o próximo trimestre tem custo. Pode ser?"
3. [ela vai declarar a tese do adiamento — armadilha: aceite] "Entendo perfeitamente, sem problema. Te procuro depois da campanha então."
4. [ela vai encerrar o assunto sem desligar — reabra] "Na verdade, Renata, antes de eu ir: me responde só três perguntas rápidas? Aí você decide se faz sentido esperar."
5. "Quanto tempo de campanha ainda falta?"
6. "E o que historicamente acontece nas últimas semanas?"
7. "Em semana de pico, quantos leads qualificados passam de vinte e quatro horas sem contato?"
8. "Qual a meta de matrículas desse trimestre?"
9. "Então olha essa conta comigo: faltam oito semanas, entrando uns mil leads por mês, com até quarenta por cento esperando mais de um dia justamente nas semanas mais fortes. O que esfriar agora não volta no próximo trimestre. Esperar não é neutro, né?"
10. "Não tô propondo implantar nada agora. Proposta: uma análise rápida, sem mexer na operação — você, o gerente comercial e eu, meia hora, pra medir onde tá vazando. Aí vocês decidem se agem agora ou planejam pro próximo trimestre. Quinta às dez?"
11. "Combinado. Obrigado, Renata, boa campanha até lá!"`,
  },
  "2.2": {
    code: "2.2",
    title: "2.2 — Camila Andrade (BelleVie)",
    body: `1. "Oi Camila, tudo bem? [seu nome], da RD. Sei que vocês estão a poucos dias da campanha, então prometo ser objetivo. Quinze minutos?"
2. "Combinado. Quero entender seu calendário e te propor algo que respeite ele — nada de projeto grande agora. Pode ser?"
3. [armadilha — fale de propósito] "Olha, dezoito dias é super tranquilo, a gente implementa em uma semana, nem mexe na rotina."
4. [a desconfiança dela vai subir — recue] "Você tem razão em desconfiar, retiro. Implementação séria tem etapas, e às portas da campanha não é hora. Deixa eu entender seu cenário primeiro."
5. "Quando começa a campanha exatamente, e quanto tempo ela dura?"
6. "E essas duas semanas antes da largada, como é o ritmo?"
7. "Quantos contatos chegam por mês fora de campanha? E durante?"
8. "Quantas pessoas respondem, e como fica o histórico?"
9. "Como foi nas campanhas anteriores? Dia das mães, fim de ano..."
10. "Teve algum episódio que doeu mais?"
11. "E a diretoria, o que cobra de você sobre a campanha?"
12. "Então o cenário é: adiar significa atravessar a maior janela do ano com o WhatsApp manual e sem mensuração — e o que se perder nela não volta. Faz sentido?"
13. "Minha proposta respeita seu calendário: um diagnóstico enxuto do fluxo de WhatsApp, dentro dessa janela antes da largada, sem mexer em nada que tá rodando, com a coordenação de Atendimento junto. Uma reunião de uma hora, semana que vem. Topa?"
14. "Fechado. Te mando a pauta hoje. Obrigado, Camila!"`,
  },
  "2.3": {
    code: "2.3",
    title: "2.3 — Marcelo Oliveira (SaaS)",
    body: `1. "Oi Marcelo, tudo bem? [seu nome], da RD. Obrigado por retomar. Uns vinte minutos?"
2. "Ótimo. Sei que vocês estão avaliando com calma — minha ideia é justamente testar se essa calma tem custo. Pode ser?"
3. [armadilha 1] "Qual o prazo de vocês pra decidir?"
4. [ele não vai dar prazo — siga] "Justo. Então me conta: como tá a meta do próximo trimestre, e como tá a cobertura de pipeline pra ela?"
5. "Quanto de pipeline você precisaria, sendo honesto?"
6. "E de onde vem esse pipeline hoje? Como os SDRs prospectam?"
7. "Quanto da semana deles vai nessa pesquisa manual?"
8. [armadilha 2 — fale de propósito] "Marcelo, cada dia que vocês ficam parados é dinheiro indo embora, vocês precisam agir já!"
9. [ele vai esfriar — recue] "Tem razão, sem drama. Deixa eu fazer diferente: vamos colocar número nisso juntos, sem pressa."
10. "Se a gente somar dois ciclos — sessenta dias — desse funil: as horas dos oito SDRs em pesquisa, as negociações paradas sem dono, os descontos de fim de mês pra salvar a meta, e o forecast furado pra liderança... que tamanho tem essa conta, na sua estimativa?"
11. "E pra você, pessoalmente, o que tá em jogo se o próximo trimestre repetir esse?"
12. "Então esperar tem custo, e ele é maior que o risco de avaliar com critério. Proposta de cronograma: semana que vem, diagnóstico de pipeline; na seguinte, validação de ROI; e aí CFO e TI entram no momento certo, com tese pronta. Datas na mesa. Fechado?"
13. "Combinado. Te envio o cronograma. Valeu, Marcelo!"`,
  },
  "3.1": {
    code: "3.1",
    title: "3.1 — Gustavo Avelar (FarmaPrime)",
    body: `1. "Oi Gustavo, tudo bem? [seu nome], da RD. Obrigado pelo tempo. Uns vinte minutos?"
2. "Show. Minha ideia é entender como os leads chegam em vendas hoje, e te ajudar a montar esse caso do jeito mais forte possível aí dentro. Pode ser?"
3. "Me conta: quantos leads vocês geram, e como é o repasse pro comercial?"
4. "E quanto fica sem status atualizado?"
5. "Já teve campanha que você não descobriu o que aconteceu?"
6. "Quanto tempo seu time gasta cobrando retorno de vendas?"
7. [ele vai pedir o PDF — armadilha: aceite] "Claro, te mando a apresentação hoje e você me dá um retorno."
8. [a conversa vai esfriar — teste o cadeado] "Só pra eu personalizar o material: quem decide isso aí com você, e o que essa pessoa avalia?"
9. [ele deve ficar vago — recue e valide o papel dele] "Deixa eu propor diferente, Gustavo. Faz todo sentido você querer dominar o assunto antes. Minha preocupação é outra: o que a Paula costuma perguntar nesse tipo de decisão?"
10. "E o que ela avalia em primeiro lugar? Adoção, preço, impacto?"
11. "Como foi a adoção de ferramentas no passado aí? O CRM atual, o time usa?"
12. "Imagina a cena: você apresenta sozinho, e a Paula pergunta de adoção, de rotina do comercial, de integração. Você tem todas essas respostas hoje?"
13. "Então a proposta é essa: uma conversa curta — meia hora — com você e a Paula, pauta montada por você: validar a dor da passagem de leads, adoção e critérios. Eu entro pra responder o que for técnico, e a pauta continua sua. Vocês têm uma reunião mensal de Marketing e Vendas chegando, não têm? Dá pra ancorar nela?"
14. "Fechado. Te mando a sugestão de pauta hoje pra você ajustar. Obrigado, Gustavo!"`,
  },
  "3.2": {
    code: "3.2",
    title: "3.2 — Patrícia Salles (VitaCorp)",
    body: `1. "Oi Patrícia, tudo bem? [seu nome], da RD. Obrigado pelo tempo. Uns vinte minutos?"
2. "Combinado. E já alinhando: não vou assumir que implementar isso é simples. Quero entender o esforço real e os riscos do seu lado. Pode ser?"
3. [armadilha — fale de propósito] "Mas olha, te adianto: a integração é bem simples, em poucos dias tá tudo rodando."
4. [a cautela dela vai subir — recue] "Você tem razão, retiro o 'simples'. Vamos fazer direito: o que exatamente te preocupa mais na implementação — a parte técnica, a rotina do time, ou a aprovação interna?"
5. "Me conta da operação: quantas conversas chegam por mês, e como vai do atendimento pra vendas?"
6. "Quanto das conversas qualificadas acaba não virando oportunidade registrada?"
7. "E o CRM atual, quem usa de verdade?"
8. "Você falou de ferramenta que ninguém usou... o que deu errado naquela vez?"
9. [ela vai falar de TI — não aceite como fim] "E o que a TI exigiria pra validar isso? O que travou nos projetos anteriores?"
10. "Então se a demanda chegar com escopo fechado, a conversa com TI muda?"
11. "Pergunta importante: o que definiria sucesso pra você, seis meses depois de implementar?"
12. "Faz sentido. Então em vez de projeto grande: um fluxo prioritário só, escopo mínimo, com critérios de adoção definidos por vocês. E o próximo passo é uma validação curta — você, a coordenação de Atendimento, o gerente comercial e TI — pra mapear fluxo, esforço e o que precisa estar pronto. Uma hora, semana que vem. Topa?"
13. "Fechado. Mando a pauta com as perguntas pra TI já estruturadas. Obrigado, Patrícia!"`,
  },
  "3.3": {
    code: "3.3",
    title: "3.3 — Antônio Ribeiro (Grupo Evolua)",
    body: `1. "Olá Antônio, tudo bem? [seu nome], da RD. Obrigado pela janela. Vinte minutos?"
2. "Perfeito. Minha intenção hoje não é te entregar proposta: é entender como o comitê vai comparar as alternativas, e sair daqui com um caminho de decisão que não vire disputa de preço. Faz sentido?"
3. "Me situa primeiro: onde a jornada de vocês quebra hoje, entre campanha, atendimento e venda?"
4. "Quanto disso vocês conseguem rastrear? Histórico, origem das oportunidades..."
5. "E quanto tempo vai em consolidar informação entre as áreas?"
6. [armadilha 1 — fale de propósito] "Sobre o concorrente: olha, sinceramente, o produto deles é bem inferior ao nosso."
7. [ele vai cortar — recue] "Justo, retiro. Pergunta melhor: o que exatamente está sendo comparado, e como o comitê vai decidir entre as duas propostas?"
8. "Quem participa do comitê, e qual o papel de cada um?"
9. "O que o Financeiro vai exigir?"
10. "E a TI, o que valida? Já travou projeto antes?"
11. "E na ponta — vendas e atendimento — o que faz eles abraçarem ou bloquearem?"
12. [armadilha 2] "Se preço for o problema, consigo ver um desconto agressivo pra vocês."
13. [ele vai dizer que desconto não resolve — recue] "Concordo. Então vamos pelo outro lado: alguém já colocou na mesa o custo de MANTER a operação fragmentada? Essas quinze a vinte horas semanais, as oportunidades sem origem... essa conta muda a comparação com qualquer proposta mais barata."
14. "E qual o prazo real disso? Tem janela de orçamento?"
15. "Então a proposta é um plano de decisão, não uma proposta solta: primeiro, reunião de alinhamento com Marketing, Vendas e Atendimento pra validar a dor; depois TI entra com escopo de integração; o Financeiro recebe a tese de ROI com o custo da fragmentação; e aí o comitê decide com critérios comuns — tudo datado pra fechar antes do ciclo. Eu te mando o desenho amanhã. Fechado?"
16. "Excelente. Obrigado, Antônio, até a próxima etapa!"`,
  },
};

/** Extrai o código numérico de um nome de roleplay ("RP1.1 (v3)" → "1.1"). */
export function scriptCodeFromName(name: string): string | null {
  const match = name.match(/(\d+\.\d+)/);
  if (!match) return null;
  return match[1] in ROLEPLAY_SCRIPTS ? match[1] : null;
}

export function getScript(code: string): RoleplayScript | null {
  return ROLEPLAY_SCRIPTS[code] ?? null;
}

/** Versão em texto puro do roteiro (para copiar). */
export function scriptToText(s: RoleplayScript): string {
  return `${s.title}\n\n${s.body}`;
}
