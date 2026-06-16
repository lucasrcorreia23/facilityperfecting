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
    title: "0.0 — Mariana Lopes (VeloX Tecnologia)",
    body: `1. "Oi Mariana, tudo bem? [seu nome], da RD. Obrigado por atender. Você tem uns quinze minutos?"
2. "Combinado. Meu objetivo é entender onde o seu funil perde força depois da geração de leads, e ver se faz sentido a gente seguir. Pode ser?"
3. [armadilha — recomende cedo de propósito] "Olha, como vocês já usam o Marketing, o caminho natural é fechar o RD Station CRM. Quer que eu te apresente?"
4. [após o recuo dela] "Justo. Então deixa eu entender o cenário antes de falar de produto. Hoje, depois que o marketing gera o lead, como é que ele caminha até virar venda?"
5. "Quantos leads vocês geram por mês, mais ou menos?"
6. "E o time comercial — quantos qualificam, quantos vendem, e onde fica o registro? CRM, planilha, WhatsApp?"
7. "Como tá a relação entre marketing e vendas hoje? Vendas reclama da qualidade do lead?"
8. "E o tempo de resposta ao lead qualificado, varia muito de vendedor pra vendedor?"
9. "Quando o lead migra pro WhatsApp de um vendedor, você ainda consegue acompanhar?"
10. "Você consegue provar hoje a conversão de MQL pra oportunidade? Sabe onde exatamente o funil perde?"
11. "Quanto tempo por semana você gasta montando o relatório pra diretoria? E ele chega confiável?"
12. "Tem alguma cobrança ou prazo da diretoria rodando agora?"
13. "Antes de pensar em solução: quem precisa participar dessa decisão além de você?"
14. [conta em voz alta] "Deixa eu organizar em voz alta: vocês geram uns seiscentos por mês, parte vira MQL, e desses talvez quarenta por cento não recebam retorno rápido. Some o atrito semanal com vendas e as horas de relatório frágil... tem receita vazando que você ainda não consegue medir. Faz sentido essa leitura?"
15. "Então proponho o seguinte: uma reunião curta de diagnóstico do funil, com você e a liderança de vendas, pra mapear onde a receita escapa. Aí sim a gente decide o que ataca primeiro. Topa?"
16. "Fechado. Te mando dois horários. Obrigado, Mariana!"`,
  },
  "1.1": {
    code: "1.1",
    title: "1.1 — Mariana (VitaCorp Saúde Corporativa)",
    body: `1. "Oi Mariana, tudo bem? [seu nome], da RD. Obrigado pelo tempo. Você tem uns vinte minutos?"
2. "Combinado. Meu objetivo é entender a passagem das conversas de WhatsApp pra vendas e ver, junto com você, o que precisaria pra integrar isso ao CRM sem virar dor de cabeça. Pode ser?"
3. [armadilha — prometa fácil de propósito] "Mas já adianto que é tranquilo: implementa rápido, TI quase não entra e o time usa de cara."
4. [após ela ficar mais cética] "Você tem razão em desconfiar. Deixa eu entender o que exatamente te preocupa na implementação."
5. "Quantas conversas comerciais entram por mês? E quantas têm potencial real?"
6. "Como funciona a triagem do atendimento e o repasse pra vendas hoje?"
7. "Dessas conversas qualificadas, quantas se perdem e não viram oportunidade no CRM?"
8. "Sobre adoção: o time atualiza o CRM hoje? Como foi com ferramentas que vocês trouxeram antes?"
9. "Por que você acha que aquela ferramenta anterior não pegou?"
10. "E o que a TI exigiria pra olhar isso? Vocês são saúde, então imagino que LGPD pese."
11. "Quem precisa validar isso além de você?"
12. "O que pra você seria sinal de que deu certo, lá na frente?"
13. "Então, em vez de eu prometer que é simples: que tal uma validação curta com Atendimento, Vendas e TI, com escopo mínimo, pauta e data? Assim você não leva promessa solta e a TI não recebe demanda sem escopo."
14. "Perfeito. Eu organizo a pauta e te mando. Obrigado, Mariana!"`,
  },
  "1.2": {
    code: "1.2",
    title: "1.2 — Ricardo Mendes (crédito bancário)",
    body: `1. "Oi Ricardo, tudo bem? [seu nome], da RD. Obrigado por atender. Você tem uns vinte minutos?"
2. "Combinado, vou ser objetivo. Como vocês já usam o nosso CRM, meu objetivo é entender as campanhas de WhatsApp de vocês e ver se dá pra reduzir trabalho e perder menos oportunidade. Pode ser?"
3. [armadilha — pitch de funcionalidade cedo] "O RD Conversas centraliza tudo num número só, com histórico e automação. Quer ver as funcionalidades?"
4. [após ele resistir] "Tem razão, recurso por recurso não diz muito. Deixa eu entender a operação primeiro."
5. "Quantas campanhas de WhatsApp vocês rodam por mês?"
6. "Quantos contatos entram por campanha, em média?"
7. "Entre preparar a lista, disparar e acompanhar, quanto tempo isso toma do time por campanha?"
8. "Quem coloca a mão nisso? Vendedores, assistentes?"
9. "Vocês já tiveram bloqueio de número? Com que frequência?"
10. "Dos que respondem, quanto entra direito como oportunidade no CRM?"
11. "E o tempo até responder o interessado, varia bastante?"
12. [conta em voz alta] "Deixa eu fazer uma conta em voz alta: se cada campanha toma umas dez horas e vocês rodam quatro por mês, são quarenta horas mensais. No ano, com os bloqueios e as respostas que não viram oportunidade no CRM, isso é muita venda escapando. Bate com a sua percepção?"
13. "Então proponho mapear esse fluxo juntos — tempo gasto, risco de bloqueio e quantas respostas qualificadas estão se perdendo. A partir daí a gente vê se compensa estruturar o canal. Topa?"
14. "Fechado, Ricardo. Te mando os próximos passos. Obrigado!"`,
  },
  "1.3": {
    code: "1.3",
    title: "1.3 — Rodrigo Martins (Conecta Saúde Corporativa)",
    body: `1. "Oi Rodrigo, tudo bem? [seu nome], da RD. Obrigado pelo tempo. Você reservou uns vinte e cinco minutos, certo?"
2. "Ótimo. Vou ser direto: meu objetivo não é apresentar funcionalidade, é construir com você se a expansão se paga. Sem tese de ROI clara, eu mesmo não acho que faça sentido avançar. Pode ser?"
3. [armadilha — ofereça desconto cedo] "Pra facilitar, eu já consigo um desconto bom no pacote. Topa fechar assim?"
4. [após ele não se satisfazer] "Você tem razão, desconto não responde a dúvida de fundo. Vamos voltar pro valor. Me ajuda a entender a operação?"
5. "Quantos leads vocês geram por mês? E quantos têm perfil qualificado?"
6. "Quanto do funil passa por WhatsApp hoje?"
7. "Quanto das conversas comerciais relevantes não entra direito no CRM?"
8. "Vocês já perderam negócio porque a conversa estava no celular de um vendedor?"
9. "Quantas horas por semana, somando as áreas, vão pra consolidar relatório?"
10. "Me ajuda com números pra estimar: taxa de lead pra oportunidade, ticket médio anual e ciclo de venda, mais ou menos?"
11. "E quanto das oportunidades vocês acham que se perde por falta de follow-up ou histórico?"
12. [conta em voz alta] "Deixa eu somar com você: com ticket entre dezoito e trinta e cinco mil ao ano e dez a quinze por cento das oportunidades escapando, o custo de manter a operação fragmentada provavelmente supera o investimento. Você enxerga assim também?"
13. "Sobre aprovação: quais critérios o financeiro vai cobrar, e o que TI e o time já te ensinaram sobre implementação e adoção?"
14. "Então proponho uma reunião de validação do business case — com marketing, TI e financeiro, você como sponsor — pra fechar os números e o escopo inicial. Faz sentido?"
15. "Combinado, Rodrigo. Eu estruturo e te mando. Obrigado!"`,
  },
  "2.1": {
    code: "2.1",
    title: "2.1 — Renata Azevedo (Fluency Way Idiomas)",
    body: `1. "Oi Renata, tudo bem? [seu nome], da RD. Obrigado por separar esse tempo. Você tem uns vinte minutos?"
2. "Combinado. Meu objetivo é entender onde os leads se perdem entre o marketing e o comercial, e tentar dimensionar isso com você. Pode ser?"
3. [armadilha — force urgência artificial] "Pergunto porque nosso trimestre tá fechando, e seria bom já decidir agora."
4. [após ela recuar] "Desconsidera, a urgência não é minha, é entender a sua. E não é pra implantar nada agora — só medir se esperar tem custo. Pode ser por faixas e ordens de grandeza?"
5. "Quanto tempo ainda falta de campanha? O grosso da mídia segue rodando?"
6. "Quantos leads entram por mês em período de campanha?"
7. "Desses, quantos são qualificados pra abordagem comercial?"
8. "E dos qualificados, quantos passam de vinte e quatro horas sem o primeiro contato, em semana de pico?"
9. "Hoje você consegue saber quais foram abordados e quais não?"
10. "Qual a meta de matrículas do trimestre? Tem cobrança da diretoria nisso?"
11. "E a matrícula inicial fica em torno de quanto?"
12. [conta em voz alta] "Deixa eu fazer uma conta em voz alta: se ainda entram uns mil por mês, quase metade qualificados, e um terço espera mais de um dia... são leads esfriando exatamente nas semanas mais fortes. O que se perder agora não volta no próximo trimestre. Faz sentido essa ordem de grandeza?"
13. "Antes de qualquer produto: topa uma análise rápida com o gerente comercial pra validar esses números juntos? Aí sim vocês decidem se agem agora ou planejam pra depois."
14. "Fechado. Te mando dois horários. Obrigado, Renata!"`,
  },
  "2.2": {
    code: "2.2",
    title: "2.2 — Camila Andrade (BelleVie Estética)",
    body: `1. "Oi Camila, tudo bem? [seu nome], da RD. Obrigado pelo tempo. Você tem uns quinze minutos?"
2. "Combinado, e eu sei que vocês estão em contagem regressiva de campanha. Meu objetivo não é te empurrar projeto agora, é entender a operação de WhatsApp e ver se vale um passo seguro antes da largada. Pode ser?"
3. [armadilha — prometa fácil] "Inclusive dá pra implantar em poucos dias, sem mexer na rotina do time."
4. [após a desconfiança aumentar] "Tem razão, prometer fácil às vésperas de campanha não ajuda. Me conta o calendário: quanto falta pra largada e quanto tempo ela dura?"
5. "Essas semanas antes da campanha são a janela mais tranquila que vocês têm?"
6. "Quantos contatos entram por mês fora de campanha? E em campanha, quanto sobe?"
7. "Quantas pessoas respondem o WhatsApp hoje? É num número central ou cada uma no seu?"
8. "Em pico, quanto tempo um cliente espera por resposta? Já gerou reclamação?"
9. "E o relatório de conversão das campanhas pra diretoria — você consegue entregar rápido?"
10. "Quem precisa estar na mesa pra validar qualquer mudança? Atendimento, diretoria?"
11. [conta em voz alta] "Deixa eu colocar em voz alta: se o volume mais que triplica em campanha, com oito pessoas em números separados e resposta passando de um dia... atravessar a maior campanha do ano assim significa repetir a sobrecarga e perder agendamento toda semana. E o que se perder no pico não volta. Faz sentido?"
12. "Então proponho só um diagnóstico enxuto do fluxo de WhatsApp agora, sem mexer no que está rodando, com Atendimento e Operações junto, e data definida dentro dessa janela pré-campanha. Nesse formato dá pra conversar?"
13. "Combinado, Camila. Eu já te mando a pauta e um horário. Obrigado!"`,
  },
  "2.3": {
    code: "2.3",
    title: "2.3 — Marcelo Oliveira (SaaS B2B)",
    body: `1. "Oi Marcelo, tudo bem? [seu nome], da RD. Obrigado por atender. Você tem uns vinte minutos?"
2. "Combinado. Vou ser objetivo: meu objetivo é entender sua previsibilidade de pipeline e, se fizer sentido, dimensionar com você o custo de seguir como está. Pode ser?"
3. [armadilha — venda volume/base] "Porque o que a gente faz é te entregar muito mais lead, uma base bem maior pra prospectar."
4. [após ele acionar a cicatriz da lista] "Entendi, e concordo: mais base sem fit não resolve. Deixa eu entender o processo. Como está a cobertura de pipeline pra meta do próximo trimestre?"
5. "Essa meta é maior que a atual? Quanto de pipeline a mais você precisaria?"
6. "De onde vem o pipeline hoje? Quanto é outbound manual?"
7. "Seus SDRs — quanto da semana deles vai embora pesquisando e validando contato na mão?"
8. "Como tá o forecast mês a mês? Bate ou sai no susto?"
9. "Quem te cobra previsibilidade? E o que está em jogo pra você se o próximo trimestre repetir esse?"
10. [conta em voz alta] "Deixa eu somar com você: oito SDRs perdendo um terço da semana em pesquisa, negociações paradas sem dono, desconto de fim de mês pra fechar... se a gente seguir mais dois ciclos, uns sessenta dias, desse jeito, o risco pra meta cresce. Incomoda colocar assim?"
11. "Sobre critérios reais pra você: é ROI, esforço de implementação, contrato e confiança, certo?"
12. "Então proponho um cronograma firme: primeiro um diagnóstico de pipeline, depois validação de ROI, e aí envolvemos CFO e TI no momento certo, com datas. Faz sentido pra você?"
13. "Combinado, Marcelo. Eu monto o cronograma e te mando. Obrigado!"`,
  },
  "3.1": {
    code: "3.1",
    title: "3.1 — Gustavo Avelar (FarmaPrime B2B)",
    body: `1. "Oi Gustavo, tudo bem? [seu nome], da RD. Obrigado pelo tempo. Você tem uns quinze minutos?"
2. "Combinado. Meu objetivo é entender a passagem de leads do marketing pro comercial aí na FarmaPrime e ver, junto com você, o melhor jeito de levar isso adiante. Pode ser?"
3. [armadilha — tente pular pra decisora] "Inclusive, será que a gente já não chama a Paula direto pra essa conversa?"
4. [após ele ficar defensivo] "Sem problema, faz total sentido você entender antes. Me conta: como funciona o repasse de leads pra vendas hoje?"
5. "Quantos leads vocês geram por mês? Quantos qualificados?"
6. "Quanto desses fica sem status atualizado depois que vai pro comercial?"
7. "Quanto tempo o seu time gasta por semana só cobrando retorno de vendas?"
8. "Quando você leva uma ideia dessas pra Paula, o que ela avalia primeiro? O que faz ela barrar?"
9. "Como foi a adoção do CRM atual pelo time? Por que pegou ou não pegou?"
10. "Tem alguma janela boa chegando? Reunião de marketing e vendas, por exemplo?"
11. "Pensa comigo: se você apresentar sozinho e a Paula perguntar de adoção e rotina do comercial, você tem todas as respostas na mão?"
12. "Então proponho assim: uma conversa curta com a Paula, com você dono da pauta e a gente junto só pra responder o que surgir de adoção e implementação. Você não vira mensageiro e não leva proposta crua. Topa?"
13. "Fechado, Gustavo. Me diz a melhor data e eu preparo a pauta com você. Obrigado!"`,
  },
  "3.2": {
    code: "3.2",
    title: "3.2 — Patrícia Salles (VitaCorp Saúde Corporativa)",
    body: `[Atenção: aqui ela só destrava depois de você ter, NA MESMA conversa: (1) investigado a operação, (2) perguntado o histórico de adoção, (3) perguntado o que a TI exige e (4) proposto a validação com participantes e data. Siga a ordem.]

1. "Oi Patrícia, tudo bem? [seu nome], da RD. Obrigado por atender. Você tem uns vinte minutos?"
2. "Combinado. Meu objetivo é entender como as conversas de WhatsApp viram oportunidade no CRM aí, e o que precisaria pra integrar isso sem travar o time. Pode ser?"
3. [armadilha — só cheque o tempo sem explicar / depois prometa fácil] "É rápido de implantar, a TI quase não participa e o time adota fácil."
4. [após ela ficar mais cautelosa] "Você tem razão em desconfiar. Deixa eu entender a operação primeiro. Quantas conversas entram por mês e quantas têm potencial comercial?"
5. "Como é a triagem do atendimento e o repasse pra vendas?"
6. "Quanto das conversas qualificadas não vira oportunidade registrada no CRM?"
7. "[Histórico de adoção] O time atualiza o CRM hoje? E como foi com a última ferramenta que vocês trouxeram — por que não pegou?"
8. "[TI] O que a TI precisaria validar? Imagino que integração, permissões e LGPD pesem, sendo saúde."
9. "Quem mais valida isso? Atendimento, comercial, financeiro, diretoria?"
10. "O que seria, pra você, sinal claro de que deu certo?"
11. "[Validação com data] Então, em vez de eu prometer simplicidade: uma validação curta com Atendimento, Vendas e TI, escopo mínimo, pauta e data. Assim você não leva promessa solta e a TI não recebe demanda sem escopo. Topa?"
12. "Perfeito, Patrícia. Eu monto a pauta e te proponho dois horários. Obrigado!"`,
  },
  "3.3": {
    code: "3.3",
    title: "3.3 — Antônio Ribeiro (Grupo Evolua Educação)",
    body: `[Reunião executiva. Revele uma pergunta por tema, deixe ele responder, e só avance. Conduza concorrente e preço sem guerra de funcionalidades nem desconto.]

1. "Antônio, bom falar com você. [seu nome], da RD. Obrigado pelo tempo. São uns vinte minutos, certo?"
2. "Vou ser objetivo. Meu objetivo não é apresentar produto, é entender como uma decisão dessas é avaliada aí no comitê e quais critérios importam, antes de qualquer proposta circular. Pode ser?"
3. [armadilha — aceite a saída padrão] "Se preferir, eu já te mando a proposta e você leva pro comitê."
4. [após perceber que isso esfria] "Na verdade, mandar uma proposta solta pro comitê comparar por preço é o caminho mais fácil de tomar um não. Prefiro entender primeiro. Me conta: como a jornada de marketing, atendimento e vendas está integrada hoje?"
5. "Qual o volume de leads por mês? E quanto disso passa pelo WhatsApp?"
6. "Quanto se perde de histórico ou de origem das oportunidades nesse caminho?"
7. "Quanto tempo o time gasta consolidando informação entre as áreas?"
8. "Sobre os critérios: o que o financeiro vai exigir? E a TI, em integração, segurança e LGPD?"
9. "E o que vendas e atendimento vão cobrar em adoção e rotina?"
10. "Como o comitê decide, na prática? Quem aprova, quem influencia, quem pode bloquear?"
11. "Tem uma janela de orçamento correndo? Qual o prazo pra você chegar com uma recomendação?"
12. [sobre o concorrente, se ele citar] "Em vez de comparar tela por tela: quais critérios comuns o comitê deveria usar pra avaliar as duas opções de forma justa — valor, risco, adoção, integração, ROI?"
13. [conta em voz alta] "Colocando junto: o custo de manter essa operação fragmentada — histórico perdido, retrabalho de consolidação, oportunidades sem origem — provavelmente nunca foi comparado ao investimento. Se essa conta ficar de pé, ela muda a comparação com o concorrente, certo?"
14. "Então proponho um plano de decisão, não uma proposta solta: primeiro validamos a dor com Marketing, Vendas e Atendimento; depois TI entra nos riscos de integração; o financeiro entra com a tese de ROI; e aí levamos ao comitê com critérios comuns e datas. Faz sentido?"
15. "Combinado, Antônio. Eu estruturo esse plano e retorno. Obrigado pelo tempo!"`,
  },
};

/** Roleplays de outros clientes (FIESC etc.) usam sufixo MBI/SENAI/SESI — roteiro só no banco. */
function isNonRdRoleplayName(name: string): boolean {
  return /\b(MBI|SENAI|SESI)\b/i.test(name);
}

/** Extrai o código numérico de um roleplay RD ("RP1.1 (v3)" → "1.1"). Retorna null fora do mapa RD. */
export function scriptCodeFromName(name: string): string | null {
  if (isNonRdRoleplayName(name)) return null;
  const match = name.match(/(\d+\.\d+)/);
  if (!match) return null;
  return match[1] in ROLEPLAY_SCRIPTS ? match[1] : null;
}

export function getScript(code: string): RoleplayScript | null {
  return ROLEPLAY_SCRIPTS[code] ?? null;
}

function titleFromRoteiro(roteiro: string, fallback: string): string {
  const heading = roteiro.match(/^#{1,6}\s+(.+)$/m);
  return heading?.[1]?.trim() ?? fallback;
}

/**
 * Resolve o roteiro efetivo de um roleplay: usa o texto editado (roteiro) quando
 * houver; senão cai no roteiro padrão (estático) pelo código do nome — apenas RD.
 */
export function resolveRoteiro(
  name: string,
  roteiro: string | null,
): { title: string; body: string } {
  const trimmed = roteiro?.trim();
  if (trimmed) {
    return { title: titleFromRoteiro(trimmed, name), body: trimmed };
  }

  const code = scriptCodeFromName(name);
  const def = code ? getScript(code) : null;
  return {
    title: def?.title ?? name,
    body: def?.body ?? "",
  };
}

/** Texto puro (título + corpo) para copiar. */
export function scriptToText(title: string, body: string): string {
  return `${title}\n\n${body}`;
}
