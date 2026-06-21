// Roteiros do vendedor para testar cada roleplay ("Minhas Falas").
// Textos estáticos, um por roleplay, indexados pelo número (0.0, 1.1 … 3.3, A.1).
// O número casa com o nome da linha da Prontidão: "RP1.1 (v4)" → "1.1", "RP A.1 (v4)" → "A.1".
//
// Conteúdo v4 (gabarito completo): cada roteiro traz Contexto, as 6 fases da call
// com ~22 perguntas do vendedor, a reação esperada do comprador (🟢 abre/avança ·
// 🟡 hesita · 🔴 resiste) e o desfecho esperado.
// Fonte: roteiros_venda_11_roleplays_v4.md.

export interface RoleplayScript {
  /** Código do roleplay, ex.: "1.1" ou "A.1". */
  code: string;
  /** Cabeçalho da seção, ex.: "1.1 — Renata Azevedo (Fluency Way Idiomas)". */
  title: string;
  /** Roteiro verbatim (gabarito por fases com reação do comprador). */
  body: string;
}

export const ROLEPLAY_SCRIPTS: Record<string, RoleplayScript> = {
  "0.0": {
    code: "0.0",
    title: "0.0 — Mariana Lopes (VeloX Tecnologia)",
    body: `**Contexto:** Head de Marketing & Vendas, tecnologia B2B, venda consultiva. Compradora experiente e pragmática, sob forte cobrança por resultado. **Ligação morna de prospecção, NÃO agendada.** **Foco:** diagnóstico consultivo de jornada de expansão multiproduto.

### Fase 1 — Abertura de ligação morna (não agendada)
1. "Mariana, eu não te avisei — me dá um minuto pra dizer por que liguei e você decide se vale seguir?" → 🟡 ocupada, dá pouco espaço.
2. "Você responde por demanda, pipeline e receita. Qual desses tá mais sob pressão hoje?" → 🟢 escolhe, abre prioridade (gosta de objetividade).
3. "O que, na operação atual, mais te atrapalha a entregar o número pra diretoria?" → 🟢 abre a dor de alto nível.

### Fase 2 — Discovery da jornada atual
4. "Como funciona hoje a jornada do lead, da geração até a receita?" → 🟡 descreve, apontando emendas.
5. "Em que etapa você sente que mais escapa valor?" → 🟢 aponta o gargalo.
6. "Quais ferramentas sustentam essa jornada hoje?" → 🟢 abre o stack atual.
7. "Onde essas ferramentas não conversam entre si?" → 🟢 revela a desintegração.

### Fase 3 — Aprofundamento multiproduto
8. "Da geração de demanda à qualificação, o que é manual e o que é automatizado?" → 🟡 mapeia o que é manual.
9. "No pipeline e no forecast, o quanto você confia nos dados?" → 🔴 admite fragilidade.
10. "Quando a diretoria cobra previsibilidade, você responde com dado ou com estimativa?" → 🟢 ponto sensível.
11. "Quanto tempo o time perde reconciliando informação entre as ferramentas?" → 🟢 reage ao desperdício.

### Fase 4 — Quantificação
12. "Qual o valor de um contrato médio na venda consultiva de vocês?" → 🟢 dá faixa.
13. "Quanto de pipeline você estima que escapa nas emendas da jornada?" → 🟡 estima.
14. "Esse vazamento, anualizado, contra o esforço de integrar — como fica?" → 🟢 enxerga o custo.

### Fase 5 — Construção de valor consultivo
15. "Se a jornada fosse integrada de ponta a ponta, o que mudaria no seu forecast?" → 🟢 valoriza previsibilidade.
16. "E na cobrança que você recebe, o que muda provar receita influenciada?" → 🟢 reage.
17. "Como compradora experiente, o que te faria confiar que não é só promessa?" → 🟢 pede prova concreta.

### Fase 6 — Decisão e próximos passos
18. "Quem decide uma expansão dessas com você?" → 🟡 abre estrutura de decisão.
19. "Qual a prova de retorno que destravaria internamente?" → 🟢 define critério.
20. "Faria sentido um diagnóstico da jornada atual, mapeando onde escapa valor, com seus dados?" → 🟢 considera.
21. "Marcamos esse diagnóstico consultivo de expansão, com dados reais e não estimativa?" → 🟢 **aceita o próximo passo.**
22. "Vale envolver alguém do seu time que vive a operação no diagnóstico?" → 🟢 alinha escopo.

**Desfecho esperado:** Mariana, pragmática e experiente, aceita um diagnóstico consultivo da jornada de expansão multiproduto, com a perda quantificada e a prova de retorno como critério — sem comprar promessa.`,
  },
  "1.1": {
    code: "1.1",
    title: "1.1 — Renata Azevedo (Fluency Way Idiomas)",
    body: `**Contexto:** Gerente de Marketing, escola de idiomas, 8 unidades. Warm call agendada. Já usa RD Station Marketing; avalia integrar com o CRM. **Tese de partida:** "tá funcionando, olho no próximo trimestre". **Objetivo do vendedor:** quebrar o adiamento mostrando o vazamento de leads entre marketing e vendas.

### Fase 1 — Abertura e contexto (alinhar antes de explorar)
1. "Obrigado pelo tempo, Renata. Você tem uns quinze minutos? Queria que fosse bem objetivo." → 🟢 confirma o tempo, pede objetividade.
2. "Antes de eu falar de qualquer coisa: como tá a operação de geração de leads de vocês hoje?" → 🟢 fala das campanhas para matrícula, time de cinco pessoas.
3. "E esses leads que o marketing gera, como eles chegam até os dezoito consultores?" → 🟡 começa a descrever a passagem, ainda genérica.

### Fase 2 — Discovery da dor (onde o lead esfria)
4. "Quanto tempo, em média, leva entre o lead preencher a landing page e um consultor falar com ele?" → 🟡 hesita, nunca mediu com precisão.
5. "Você consegue ver, hoje, quantos leads que o marketing entregou viraram matrícula?" → 🔴 admite que perde o rastro depois da entrega.
6. "Quando a diretoria te cobra resultado de campanha, você responde com o quê — leads gerados ou matrículas fechadas?" → 🟢 reconhece que reporta leads, não matrícula; ponto sensível.
7. "Em época de pico de matrícula, o time comercial dá conta do volume que vocês mandam?" → 🟡 conta que em pico entra muito lead e nem todos são abordados a tempo.
8. "Os leads que não são abordados rápido, o que acontece com eles?" → 🟢 reconhece que esfriam / somem.

### Fase 3 — Quantificação (construir o custo de adiar)
9. "Se a gente estimar: de cada cem leads quentes, quantos você acha que o consultor consegue retomar no mesmo dia?" → 🟡 chuta um número baixo, hesitando.
10. "E o ticket médio de uma matrícula, quanto é?" → 🟢 dá faixa por extenso.
11. "Então, se X leads quentes esfriam por mês porque ninguém retomou a tempo, isso é quanto de matrícula perdida?" → 🟢 reage à conta, surpresa contida.
12. "Esse vazamento muda de tamanho na temporada de matrícula, certo?" → 🟢 confirma que no pico é pior — gancho do "por que não no próximo trimestre".

### Fase 4 — Objeção principal (o adiamento)
13. "Você comentou que ia olhar isso no próximo trimestre — o que muda de lá pra cá?" → 🔴 defende o adiamento ("agora tá no meio da campanha").
14. "Se o problema é justamente na campanha, esperar o trimestre não é deixar passar o período em que mais dói?" → 🟡 começa a vacilar na tese de adiar.
15. "O que te preocuparia em mexer nisso agora, no meio da operação?" → 🟢 abre o medo real (esforço/implementação no pico).

### Fase 5 — Construção de valor (sem pitch de funcionalidade)
16. "Se você conseguisse ver cada lead da campanha do momento que ele entra até virar matrícula, o que isso mudaria no seu report pra diretoria?" → 🟢 reage ao valor (provar matrícula, não só lead).
17. "E pro consultor — o que mudaria ele saber qual lead acabou de ficar quente?" → 🟢 reconhece ganho de priorização.
18. "Hoje, quem garante que o lead quente não fica esperando? É processo ou é cada um lembrar?" → 🔴 admite que depende de cada um.

### Fase 6 — Decisão e próximos passos
19. "Pra avançar nisso, quem além de você precisa olhar — diretoria, comercial?" → 🟡 revela que a diretoria precisa ver impacto.
20. "Se eu te ajudasse a montar um diagnóstico rápido do vazamento atual, com seus próprios números, isso seria útil pra levar internamente?" → 🟢 considera.
21. "Faz sentido marcarmos esse diagnóstico ainda dentro dessa campanha, pra olhar dados reais e não estimativa?" → 🟢 **aceita o próximo passo datado** (critério de sucesso).
22. "Tem mais alguém do comercial que valeria estar nesse diagnóstico?" → 🟢 nomeia, fechando o escopo.

**Desfecho esperado:** Renata aceita um diagnóstico leve e datado durante a campanha. Não compra na hora. Sai com o vazamento quantificado e a urgência aceita (não imposta).`,
  },
  "1.2": {
    code: "1.2",
    title: "1.2 — Ricardo Mendes (crédito bancário)",
    body: `**Contexto:** Gerente Comercial, empresa de crédito. **Cold call / não agendada.** Usa RD Station CRM; faz campanhas de WhatsApp manual. **Objeção principal:** "o WhatsApp manual funciona, só dá trabalho". **Objetivo do vendedor:** quantificar o impacto operacional do processo manual.

### Fase 1 — Abertura de call fria (ganhar o direito de continuar)
1. "Ricardo, sei que não te avisei — me dá dois minutos pra eu dizer por que liguei, e você decide se continua?" → 🟡 cordial, ocupado, dá pouco tempo.
2. "Vocês usam o WhatsApp pra campanha hoje, certo? Como funciona esse processo aí?" → 🟢 confirma WhatsApp manual, diz que "funciona".
3. "Antes de eu falar de qualquer ferramenta: o que mais te incomoda nesse processo hoje?" → 🟢 admite que "dá trabalho".

### Fase 2 — Discovery do processo manual
4. "Quantas campanhas de WhatsApp vocês rodam por mês, mais ou menos?" → 🟡 dá faixa ("quatro ou cinco").
5. "E cada campanha, quantos contatos atinge?" → 🟢 fala que passa de mil.
6. "Quem prepara a lista, dispara e acompanha as respostas?" → 🟢 revela vendedores + dois assistentes.
7. "Quanto tempo isso consome do time, da preparação ao acompanhamento?" → 🟡 hesita, nunca contou ("oito a doze horas?").
8. "Já aconteceu de número ser bloqueado?" → 🟢 admite bloqueios ("dois nos últimos seis meses").

### Fase 3 — A objeção central
9. "Você disse que funciona e só dá trabalho — o que 'dá trabalho' custa, na prática, pro time?" → 🔴 resiste a tratar como perda, vê só como esforço.
10. "Das respostas que chegam pelo WhatsApp, quantas viram oportunidade registrada no CRM?" → 🟡 admite que "nem todas" entram.
11. "Quando uma resposta não entra no CRM, o que acontece com ela?" → 🟢 reconhece que fica na anotação do vendedor / se perde.

### Fase 4 — Quantificação do vazamento
12. "Qual a taxa de resposta média das campanhas?" → 🟢 dá faixa ("quinze a vinte e cinco por cento").
13. "E dessas respostas qualificadas, quanto entra certo no CRM?" → 🟢 abre que é só parte ("quarenta a sessenta por cento").
14. "Quanto tempo o interessado espera até alguém responder?" → 🟡 varia ("duas a doze horas").
15. "Quando a resposta demora, a chance de fechar cai?" → 🟢 concorda, ainda sem número fechado.
16. "Quanto tempo você, como gestor, gasta consolidando o resultado das campanhas?" → 🟢 revela "três a cinco horas por semana".

### Fase 5 — Construção de valor
17. "Se as respostas qualificadas caíssem direto no CRM que vocês já usam, o que mudaria no seu acompanhamento?" → 🟢 reage ao ganho.
18. "E o risco de bloqueio — como ele impacta a operação quando acontece?" → 🟢 conta que atrapalha muito.
19. "Botando tempo do time + respostas perdidas + bloqueio na conta, isso parece um problema de 'só dá trabalho' ou de oportunidade perdida?" → 🟢 **reconhece o reframe** (momento-chave).

### Fase 6 — Decisão e fechamento
20. "Quem além de você precisa enxergar esse impacto pra avançar?" → 🟡 revela diretoria/financeiro precisam de ROI.
21. "Faria sentido mapearmos juntos o fluxo atual e quanto se perde, antes de qualquer proposta?" → 🟢 considera.
22. "Topa marcarmos esse mapeamento de tempo, bloqueio e respostas que não viram oportunidade?" → 🟢 **aceita o próximo passo** (critério de sucesso).

**Desfecho esperado:** Ricardo aceita mapear fluxo, tempo, risco de bloqueio e respostas qualificadas que não viram oportunidade. O reframe de "trabalho" para "perda" foi aceito. Sem preço, sem compra.`,
  },
  "1.3": {
    code: "1.3",
    title: "1.3 — Rodrigo Martins (Conecta Saúde Corporativa)",
    body: `**Contexto:** Diretor Comercial e Marketing, saúde corporativa B2B. Reunião agendada (25 min). Avalia business case multiproduto. **Objeções:** preço e implementação. **Objetivo do vendedor:** sustentar um business case multiproduto sem ceder a desconto e tratando implementação sem minimizar.

### Fase 1 — Abertura executiva
1. "Rodrigo, você reservou vinte e cinco minutos — quer que eu vá direto ao business case ou prefere me contextualizar primeiro?" → 🟢 pede objetividade, gosta de conduzir.
2. "Você responde por demanda, performance e previsibilidade. Qual desses três te tira mais o sono hoje?" → 🟢 escolhe, abre prioridade.
3. "Como tá a previsibilidade de pipeline com o time atual de marketing, vendas e atendimento?" → 🟡 descreve operação grande, aponta gargalos.

### Fase 2 — Discovery multiárea
4. "Entre marketing gerar, atendimento triar e vendas fechar, onde mais escapa hoje?" → 🟢 aponta a costura entre as áreas.
5. "O atendimento que cuida do WhatsApp e triagem — como ele passa o lead pro comercial?" → 🟡 descreve handoff imperfeito.
6. "Você consegue medir performance ponta a ponta ou cada área tem seu número?" → 🔴 admite visão fragmentada.
7. "Quanto da sua previsibilidade hoje é dado e quanto é sensação?" → 🟢 reconhece fragilidade do forecast.

### Fase 3 — Construção do business case
8. "Se a gente somar o que escapa em cada handoff, qual o tamanho disso no seu pipeline?" → 🟡 hesita, mas engaja na conta.
9. "Quanto vale um contrato corporativo médio pra vocês?" → 🟢 dá faixa por extenso.
10. "Quantos negócios bons você estima que escapam por mês na costura entre áreas?" → 🟢 estima, reage ao tamanho.
11. "Esse custo de inação, anualizado, contra o investimento — como fica a conta?" → 🟢 começa a ver o business case.

### Fase 4 — Objeção de preço
12. "Quando você diz que é caro, é caro contra o quê — contra o orçamento ou contra o retorno?" → 🔴 mantém objeção de preço.
13. "Se o que escapa por ano paga o investimento várias vezes, o preço ainda é o ponto?" → 🟡 cede um pouco, desloca para implementação.
14. "O que faria esse investimento valer a pena de forma inquestionável pra você?" → 🟢 define seu critério de ROI.

### Fase 5 — Objeção de implementação (sem minimizar)
15. "Você já viu projeto desse tipo dar errado? O que falhou?" → 🟢 conta cicatriz de implementação.
16. "Com três áreas envolvidas, qual sua maior preocupação: técnica, adoção ou processo?" → 🟢 nomeia o medo real.
17. "Como você imagina a adoção pelos vinte e quatro vendedores e SDRs?" → 🟡 cético sobre adesão.
18. "Se a implementação fosse faseada por área, começando pela de maior dor, isso reduziria seu risco?" → 🟢 reage melhor a abordagem realista.

### Fase 6 — Decisão e próximos passos
19. "Quem mais decide isso com você — tem comitê, financeiro, diretoria?" → 🟡 revela que valida com outros.
20. "Qual o critério que faria você levar isso adiante internamente?" → 🟢 define critério.
21. "Faz sentido montarmos um business case com seus números e um plano de implementação faseado, pra você levar ao comitê?" → 🟢 considera.
22. "Marcamos uma sessão pra construir esse caso com dados reais e desenhar as fases?" → 🟢 **aceita o próximo passo estruturado.**

**Desfecho esperado:** Rodrigo aceita construir um business case quantificado + plano de implementação faseado, sem ter recebido desconto e com o risco de adoção reconhecido.`,
  },
  "2.1": {
    code: "2.1",
    title: "2.1 — Mariana Alves (VitaCorp Saúde Corporativa)",
    body: `**Contexto:** Gerente de Marketing & Vendas, saúde corporativa. **Dor central:** leads quentes do marketing esfriam porque vendas demora a abordar. **Objetivo do vendedor:** integração marketing-vendas, mostrando o custo do lead que esfria.

### Fase 1 — Abertura e contexto
1. "Mariana, obrigado pelo tempo. Como tá dividida sua operação entre marketing, atendimento e comercial hoje?" → 🟢 descreve as três frentes que lidera.
2. "Você fica na interface das três áreas — onde você sente mais atrito?" → 🟢 aponta a passagem marketing→vendas.
3. "Me conta como um lead quente caminha hoje, do marketing até o vendedor." → 🟡 descreve, já sinalizando demora.

### Fase 2 — Discovery da dor
4. "Quando o marketing marca um lead como quente, em quanto tempo o vendedor aborda?" → 🔴 admite que demora.
5. "O que faz o vendedor demorar — volume, prioridade, falta de aviso?" → 🟢 abre a causa.
6. "Como o vendedor sabe que um lead ficou quente? É automático ou alguém avisa?" → 🟡 revela processo manual/falho.
7. "Você consegue ver quais leads quentes não foram abordados a tempo?" → 🔴 admite que não tem essa visão.

### Fase 3 — Quantificação
8. "De cada dez leads quentes, quantos você acha que esfriam por demora?" → 🟡 estima, hesitando.
9. "Qual o valor de um contrato fechado pra vocês?" → 🟢 dá faixa.
10. "Esses leads quentes que esfriam, em volume por mês, representam quanto de receita?" → 🟢 reage à conta.
11. "E o trabalho do marketing pra gerar aquele lead quente, vira o quê quando ele esfria?" → 🟢 reconhece o desperdício do esforço.

### Fase 4 — Objeção / resistência
12. "O que já tentaram pra acelerar essa abordagem?" → 🟡 conta tentativas que não pegaram.
13. "Por que você acha que essas tentativas não resolveram?" → 🟢 abre a causa-raiz (processo, não esforço).
14. "Se o vendedor fosse avisado na hora que o lead esquentou, isso mudaria o tempo de abordagem?" → 🟢 reage ao valor.

### Fase 5 — Construção de valor
15. "O que mudaria pro seu report se você visse o lead do marketing até o fechamento em vendas?" → 🟢 valoriza a visão integrada.
16. "E pra cobrança que você recebe — provar geração ou provar receita influenciada?" → 🟢 ponto sensível, reage.
17. "Quem hoje é responsabilizado quando o lead quente esfria — marketing ou vendas?" → 🟡 revela a fricção política entre áreas.

### Fase 6 — Decisão e próximos passos
18. "Pra avançar, quem decide com você — diretoria, head de vendas?" → 🟡 abre estrutura de decisão.
19. "Qual seria a prova de que vale a pena integrar isso?" → 🟢 define critério.
20. "Faria sentido medirmos juntos quantos leads quentes esfriam hoje e o impacto disso?" → 🟢 considera.
21. "Marcamos um diagnóstico do tempo de abordagem e do lead que esfria, com dados reais?" → 🟢 **aceita o próximo passo.**
22. "Vale trazer alguém de vendas pra esse diagnóstico, já que a dor é compartilhada?" → 🟢 alinha escopo.

**Desfecho esperado:** Mariana aceita diagnosticar o tempo de abordagem e o vazamento de leads quentes, reconhecendo que é problema de processo entre áreas — não de esforço do marketing.`,
  },
  "2.2": {
    code: "2.2",
    title: "2.2 — Camila Andrade (Clínica BelleVie Estética)",
    body: `**Contexto:** Gerente de Marketing, rede premium de estética. Reunião agendada. **Tese de partida:** evento crítico — falta pouco para a maior campanha do ano, "não dá pra mexer agora". **Objetivo do vendedor:** criar urgência COM viabilidade, mostrando o custo de adiar sem desrespeitar a capacidade operacional.

### Fase 1 — Abertura sensível ao timing
1. "Camila, sei que vocês estão a poucas semanas da campanha — quanto tempo você tem agora?" → 🟢 confirma tempo curto, valoriza o reconhecimento.
2. "Como tá a preparação da campanha? O que mais consome o time hoje?" → 🟢 descreve correria pré-campanha.
3. "A diretoria cobra mensuração rápida do que cada campanha converte, certo? Como você entrega isso hoje?" → 🟡 admite dificuldade de mensurar rápido.

### Fase 2 — Discovery da dor sob pressão
4. "Na última campanha grande, você conseguiu ver em tempo real o que cada peça convertia?" → 🔴 admite visão atrasada.
5. "Quando a campanha tá rodando e algo não converte, em quanto tempo você descobre?" → 🟡 revela atraso que custa caro no pico.
6. "Os leads da campanha, como chegam até quem agenda os procedimentos?" → 🟢 descreve handoff.
7. "No pico, o volume de leads é absorvido pela equipe de agendamento a tempo?" → 🔴 admite que no pico escapa.

### Fase 3 — Quantificação no contexto do evento
8. "Quanto vale um procedimento médio na BelleVie?" → 🟢 dá faixa premium por extenso.
9. "Na última campanha, quantos leads você estima que esfriaram por demora no agendamento?" → 🟡 estima hesitando.
10. "Isso, em ticket premium, representa quanto de receita perdida na campanha?" → 🟢 reage ao tamanho (alto, por ser premium).
11. "Esse problema é maior fora ou dentro da campanha?" → 🟢 confirma que é justamente no pico — gancho da urgência.

### Fase 4 — Objeção do timing (o adiamento)
12. "Você comentou que não dá pra mexer agora. O que te preocupa em mexer perto da campanha?" → 🔴 medo de atrapalhar a operação no pior momento.
13. "Se o problema explode justamente na campanha, esperar não é deixar a maior perda acontecer de novo?" → 🟡 vacila na tese de adiar.
14. "Existe um caminho de preparar agora pra colher na campanha, sem virar a mesa no meio?" → 🟢 reage à viabilidade.

### Fase 5 — Construção de valor com viabilidade
15. "Se você visse a conversão de cada peça em tempo real durante a campanha, o que faria diferente?" → 🟢 valoriza.
16. "E pra diretoria, o que muda você provar conversão durante e não depois?" → 🟢 ponto sensível.
17. "O que daria pra deixar pronto antes da campanha sem sobrecarregar seu time agora?" → 🟢 co-constrói o caminho viável.

### Fase 6 — Decisão e próximos passos
18. "Quem decide isso com você — diretoria?" → 🟡 revela aprovação da diretoria.
19. "Qual seria a prova de que vale começar antes da campanha?" → 🟢 define critério.
20. "Faria sentido um diagnóstico rápido e leve agora, focado só no que dói na campanha?" → 🟢 considera.
21. "Marcamos esse diagnóstico enxuto, sem comprometer a preparação de vocês?" → 🟢 **aceita o próximo passo com viabilidade.**
22. "Quer que eu já desenhe o que dá pra deixar pronto antes do pico?" → 🟢 engaja no plano.

**Desfecho esperado:** Camila aceita um diagnóstico leve e viável antes da campanha, com urgência legítima aceita — sem sentir que o vendedor desrespeitou a operação no pico.`,
  },
  "2.3": {
    code: "2.3",
    title: "2.3 — Marcelo Oliveira (SaaS B2B em expansão)",
    body: `**Contexto:** Gerente Comercial, SaaS B2B, 22 pessoas no time, 8 SDRs prospectando manual. Forecast em planilha, CRM atual pouco confiável. **Tese de partida:** normaliza o problema e posterga ("sem pressa"). **Objetivo do vendedor:** criar urgência a partir de cobertura de pipeline e custo da inércia, separando dor de processo de dor de ferramenta.

### Fase 1 — Abertura
1. "Marcelo, obrigado pelo tempo. Como tá a saúde do pipeline de vocês hoje?" → 🟢 descreve, minimizando os problemas.
2. "Você mencionou que bate meta no susto — o que faz ser no susto?" → 🟡 abre a imprevisibilidade.
3. "O forecast que você reporta, quanto ele costuma errar de um mês pro outro?" → 🟢 admite variação grande.

### Fase 2 — Discovery do processo
4. "Os oito SDRs prospectam manualmente — como é esse processo hoje?" → 🟢 descreve pesquisa manual em listas, sites, LinkedIn.
5. "Quanto tempo um SDR gasta pesquisando contato versus falando com gente?" → 🟡 hesita, percebe o desperdício.
6. "O CRM atual — por que você diz que é pouco confiável?" → 🟢 abre as falhas (dados furados, baixa adoção).
7. "Se o CRM é furado, em que você confia pra montar o forecast?" → 🔴 admite que confia na planilha e na sensação.

### Fase 3 — Separar dor de processo de dor de ferramenta
8. "O problema é a ferramenta atual ou o processo que alimenta ela?" → 🟡 reflete, não tinha separado.
9. "Se trocasse só a ferramenta sem mudar o processo, o que aconteceria?" → 🟢 reconhece que o problema voltaria.
10. "Onde você acha que está a maior perda: na prospecção, no registro ou na previsão?" → 🟢 prioriza a dor real.

### Fase 4 — Quantificação e custo da inércia
11. "Qual o valor de um contrato médio fechado?" → 🟢 dá faixa.
12. "Com cobertura de pipeline imprevisível, quantas metas você arrisca não bater no semestre?" → 🟡 estima, desconfortável.
13. "Quanto tempo de SDR por mês vai embora em pesquisa manual?" → 🟢 reage ao volume.
14. "O 'sem pressa' de hoje custa quanto se o próximo trimestre vier com pipeline curto?" → 🟢 **enxerga o custo da inércia** (momento-chave).

### Fase 5 — Construção de valor (sem guerra de funcionalidades)
15. "Se o forecast fosse confiável, o que mudaria na sua relação com a liderança?" → 🟢 valoriza previsibilidade.
16. "E se o SDR gastasse o tempo de pesquisa falando com prospect, o que isso faria no pipeline?" → 🟢 reage ao ganho.
17. "Eu não quero te vender volume que não encaixa — o que de fato resolveria sua dor?" → 🟢 confia mais na abordagem consultiva.

### Fase 6 — Decisão e próximos passos
18. "Quem decide a troca/estruturação com você?" → 🟡 abre estrutura.
19. "Qual a prova de que vale mexer agora e não 'mais pra frente'?" → 🟢 define critério.
20. "Faria sentido medirmos a cobertura real de pipeline e o tempo perdido em prospecção?" → 🟢 considera.
21. "Marcamos um diagnóstico com cronograma firme, não 'quando der'?" → 🟢 **aceita o próximo passo datado** (anti-postergação).
22. "Quer que eu já estruture o que olharíamos nesse diagnóstico?" → 🟢 engaja.

**Desfecho esperado:** Marcelo troca o "sem pressa" por um diagnóstico datado, separando dor de processo de dor de ferramenta, sem guerra de funcionalidades nem venda de volume sem fit.`,
  },
  "3.1": {
    code: "3.1",
    title: "3.1 — João Silva (FarmaPrime B2B)",
    body: `**Contexto:** Coordenador de Marketing, farmacêutico B2B. **Foco de treino:** João é um champion que quer apresentar sozinho à gerente comercial (a decisora). O vendedor deve mapear o processo de decisão e conseguir uma reunião conjunta com a gerente SEM desautorizar João — transformando-o em aliado. Reunião comercial.

### Fase 1 — Abertura
1. "João, obrigado pelo tempo. Como o marketing e o comercial se conversam aí hoje?" → 🟢 descreve o cenário, posição-ponte.
2. "O que te motivou a trazer essa conversa pra dentro?" → 🟢 abre o interesse (ele é o champion).
3. "Você enxerga valor nisso — quem mais precisa enxergar pra acontecer?" → 🟡 menciona a gerente comercial.

### Fase 2 — Mapeamento da decisão
4. "A gerente comercial é quem decide ou ela também consulta alguém?" → 🟢 abre a alçada dela.
5. "O que é importante pra ela numa decisão dessas?" → 🟢 revela os critérios da decisora.
6. "Como ela costuma reagir a proposta nova trazida pelo marketing?" → 🟡 sinaliza possível resistência.
7. "Hoje, como você imaginava levar isso pra ela?" → 🔴 revela que quer apresentar sozinho.

### Fase 3 — Entender o porquê do "sozinho" (sem desautorizar)
8. "Faz sentido você levar — o que te faria preferir apresentar sozinho?" → 🟢 abre a motivação (protagonismo/controle).
9. "O que você ganharia conduzindo você mesmo essa conversa com ela?" → 🟢 valida o interesse dele.
10. "E qual seria o risco se faltasse uma resposta técnica que ela perguntasse na hora?" → 🟡 percebe o próprio risco.

### Fase 4 — Transformar o champion em aliado
11. "Se eu te preparar com tudo pra você brilhar na frente dela, isso te ajuda?" → 🟢 reage bem (mantém o protagonismo dele).
12. "E se eu estiver junto só pra cobrir as perguntas difíceis, com você conduzindo?" → 🟡 considera, ainda protege o espaço.
13. "Como a gente faria pra você continuar sendo o dono da iniciativa, com a minha presença sendo um reforço e não um atropelo?" → 🟢 abre à reunião conjunta.

### Fase 5 — Construção de valor que ELE leva
14. "Qual argumento, na boca dela, seria o mais forte pra aprovar?" → 🟢 co-constrói o pitch dele.
15. "Que número ou prova faria a gerente dizer sim?" → 🟢 define a evidência.
16. "O que eu posso te dar que faça você parecer ainda mais preparado pra ela?" → 🟢 engaja como aliado.

### Fase 6 — Conseguir a reunião conjunta
17. "Quando você pensa em levar pra ela, qual o prazo?" → 🟡 dá um horizonte.
18. "Faz mais sentido você apresentar e eu entrar só no fim pra dúvidas técnicas — topa?" → 🟢 abre a porta.
19. "Qual a agenda dela nas próximas semanas?" → 🟢 revela disponibilidade.
20. "Você apresenta a visão, eu fico de apoio — assim você lidera e tem retaguarda. Fechado assim?" → 🟢 concorda com formato.
21. "Marcamos essa conversa com a gerente, com você na condução?" → 🟢 **aceita a reunião conjunta** (critério de sucesso).
22. "Quer que eu te monte o material pra você abrir a reunião com força?" → 🟢 sela a aliança.

**Desfecho esperado:** João aceita uma reunião conjunta com a gerente comercial, com ele conduzindo e o vendedor de apoio — sentindo-se reforçado, não desautorizado. Champion virou aliado.`,
  },
  "3.2": {
    code: "3.2",
    title: "3.2 — Patrícia Salles (VitaCorp Saúde Corporativa)",
    body: `**Contexto:** Compradora difícil mas processável. **Foco de treino:** contornar a objeção de implementação SEM minimizar a complexidade, separando-a em três camadas — técnica (TI, integração, segurança, LGPD), operacional (rotina, campos, adoção) e política (quem valida, aprova, é cobrado). Converter "vou ver com TI" em validação estruturada. Pipeline de saúde B2B.

### Fase 1 — Abertura
1. "Obrigado pelo tempo. Antes de solução, quero entender seu cenário — pode ser?" → 🟢 aprova a abordagem.
2. "O que te fez aceitar essa conversa agora?" → 🟡 dá o contexto, já sinaliza cautela com implementação.
3. "Quando você pensa em adotar algo novo, o que historicamente trava por aí?" → 🟢 abre que implementação é o medo.

### Fase 2 — Camada técnica (TI, integração, segurança, LGPD)
4. "Do lado técnico, o que sua TI exigiria pra aprovar uma ferramenta nova?" → 🟢 abre requisitos de TI.
5. "Vocês têm exigências específicas de segurança ou LGPD por serem saúde?" → 🟢 detalha (dado sensível).
6. "Que integrações com os sistemas atuais seriam obrigatórias?" → 🟡 revela o ambiente técnico.
7. "O que já deu errado tecnicamente em implementações passadas?" → 🟢 conta cicatriz técnica.

### Fase 3 — Camada operacional (rotina, campos, adoção)
8. "No dia a dia, quem teria que mudar a rotina pra isso funcionar?" → 🟢 abre o impacto operacional.
9. "Como é a adesão do time a ferramentas novas hoje?" → 🔴 cética sobre adoção.
10. "O que faria o time usar de verdade, e não abandonar em dois meses?" → 🟢 define a condição de adoção.
11. "Quanto de configuração/campos vocês precisariam pra refletir o processo de vocês?" → 🟡 revela complexidade operacional.

### Fase 4 — Camada política (quem valida, aprova, é cobrado)
12. "Quem precisa validar tecnicamente além de você?" → 🟢 nomeia TI.
13. "Quem aprova o investimento?" → 🟡 abre a alçada.
14. "E quem é cobrado se a implementação não andar?" → 🟢 revela o dono político do risco.
15. "Essas pessoas concordam que isso é prioridade agora?" → 🟡 expõe o desalinhamento interno.

### Fase 5 — Contornar sem minimizar
16. "Eu não vou te dizer que é simples — é um projeto de três frentes. Faz sentido tratarmos as três separadas?" → 🟢 valoriza não minimizar.
17. "Se a técnica fosse validada com sua TI antes de qualquer compromisso, reduziria seu risco?" → 🟢 reage bem.
18. "E se a adoção tivesse um plano próprio, com responsável, não viraria 'mais uma ferramenta parada'?" → 🟢 abre confiança.

### Fase 6 — Converter "vou ver com TI" em validação estruturada
19. "Quando você diz 'vou ver com TI', como costuma ser essa conversa — solta ou com pauta?" → 🔴 admite que costuma ser solta (e morre).
20. "Faria sentido uma validação técnica COM sua TI, com escopo e perguntas definidas, em vez de você levar sozinha?" → 🟢 reage bem.
21. "Quais perguntas sua TI precisaria ver respondidas pra dar o aval?" → 🟢 co-define a pauta.
22. "Marcamos essa validação estruturada com TI, operação e quem aprova, cada um no seu critério?" → 🟢 **aceita a validação estruturada** (critério de sucesso).

**Desfecho esperado:** a compradora aceita uma validação estruturada com TI (escopo, perguntas, objetivo), com as três camadas tratadas separadamente e sem minimização. "Vou ver com TI" virou um passo concreto com pauta e participantes.`,
  },
  "3.3": {
    code: "3.3",
    title: "3.3 — Antônio Ribeiro (Grupo Evolua Educação)",
    body: `**Contexto:** Economic buyer experiente. Warm call. Expansão multiproduto. **Foco de treino:** processo de decisão avançado — mapear comitê multifuncional, levantar critérios, conduzir concorrente e preço sem guerra de funcionalidades, e converter "me manda a proposta" em plano de decisão. **Reunião executiva.**

### Fase 1 — Abertura executiva
1. "Antônio, você reservou esse tempo — prefere que eu apresente ou que eu entenda primeiro seu cenário?" → 🟢 pragmático, gosta de objetividade.
2. "Você responde por receita. Qual o resultado que essa avaliação precisaria destravar pra valer seu tempo?" → 🟢 abre o objetivo de alto nível.
3. "Hoje, o que te fez colocar essa avaliação na mesa agora?" → 🟡 dá o contexto, menciona que há proposta concorrente.

### Fase 2 — Mapeamento do comitê (o coração do roleplay)
4. "Numa decisão desse porte, além de você, quem aprova o investimento?" → 🟡 revela que há mais gente, aos poucos.
5. "Quem influencia a decisão mesmo sem assinar?" → 🟢 nomeia influenciadores.
6. "Quem vai usar no dia a dia e pode embarcar ou travar?" → 🟢 abre os usuários/operação.
7. "E quem poderia barrar — TI, financeiro, jurídico?" → 🟢 revela possíveis bloqueadores.
8. "Cada um desses olha por um critério diferente. Quais são os critérios de cada área?" → 🟢 abre os critérios por stakeholder (objetivo central).

### Fase 3 — Concorrente e diferenciação (sem guerra de funcionalidades)
9. "Você mencionou uma proposta concorrente. O que te atraiu nela?" → 🟡 abre o que valoriza.
10. "E o que ainda te deixa em dúvida nessa proposta?" → 🟢 revela a lacuna onde você pode entrar.
11. "Se as duas fizessem o básico igual, o que seria o critério de desempate pra você?" → 🟢 define o critério real de decisão.
12. "O que seria um risco maior: escolher errado ou demorar pra decidir?" → 🟢 abre o apetite a risco/urgência.

### Fase 4 — Preço sem desconto precoce
13. "Quando você pensa em investimento aqui, o que precisa estar na conta pra fazer sentido?" → 🔴 testa pedindo preço/desconto cedo.
14. "Antes de número: o retorno que você espera disso é em receita, eficiência ou previsibilidade?" → 🟡 desloca de preço pra valor.
15. "Se o caso de retorno fechar, o preço deixa de ser o ponto principal?" → 🟢 concorda que o ROI manda.

### Fase 5 — Implementação e risco
16. "Numa expansão multiproduto, qual seu maior receio de implementação?" → 🟢 nomeia o risco.
17. "Como vocês costumam medir se uma adoção desse tipo deu certo?" → 🟢 abre métrica de sucesso.
18. "O que precisaria estar garantido pra TI e operação não virarem gargalo?" → 🟢 revela pré-condições.

### Fase 6 — Converter "manda a proposta" em plano de decisão
19. "Se eu te mandar só uma proposta, ela passa pelo comitê sozinha ou precisa de você defendendo?" → 🟡 admite que precisa de sustentação.
20. "Em vez de só um PDF, faria sentido montarmos um plano de decisão com as etapas, critérios e quem precisa ver o quê?" → 🟢 reage bem.
21. "Quais datas o comitê tem nas próximas semanas pra encaixar isso?" → 🟢 abre o calendário.
22. "Topa a gente desenhar esse plano de decisão com stakeholders, critérios e datas, em vez de empurrar uma proposta solta?" → 🟢 **aceita o plano de decisão estruturado** (critério de sucesso).

**Desfecho esperado:** Antônio aceita um plano de decisão com etapas, critérios por stakeholder, mapa do comitê e datas — em vez de "me manda a proposta". Concorrente e preço conduzidos sem guerra de funcionalidades nem desconto precoce.`,
  },
  "A.1": {
    code: "A.1",
    title: "A.1 — Eduardo Ramos (Nexen Logística)",
    body: `**Contexto:** Gerente Comercial, distribuidora B2B. **Não usa NENHUM produto RD** — controla pipeline em planilha e WhatsApp pessoal. Reunião agendada por SDR. **Tese de partida:** "a planilha funciona e bate meta". **Foco:** aquisição/primeira adoção — discovery sem apoiar em produto prévio, custo da operação manual, sem cross-sell. Conduzir para avaliação, não compra.

### Fase 1 — Abertura (reunião agendada por SDR)
1. "Eduardo, obrigado pelo tempo. O SDR te passou o contexto ou prefere que eu situe?" → 🟢 confirma, postura "rodamos bem na planilha".
2. "Antes de qualquer coisa: me conta como a operação comercial roda hoje." → 🟢 descreve planilha + WhatsApp + reunião semanal.
3. "O que te fez topar essa conversa, já que hoje vocês batem meta?" → 🟡 admite a cobrança da diretoria por previsibilidade.

### Fase 2 — Discovery da operação manual (sem assumir ferramenta RD)
4. "Quantos vendedores e como cada um controla a própria carteira?" → 🟢 revela dezesseis, cada um do seu jeito.
5. "Como entra negócio novo — indicação, base, prospecção?" → 🟢 abre as fontes.
6. "O follow-up depende de processo ou de cada um lembrar?" → 🔴 admite que depende de lembrar.
7. "Quando um vendedor sai, o que acontece com a carteira dele?" → 🟢 abre a dor (vai na memória).

### Fase 3 — A objeção principal (a planilha)
8. "Você disse que a planilha funciona — onde ela te deixa na mão?" → 🔴 defende o método, resiste.
9. "Quando a diretoria pede forecast, de onde sai esse número?" → 🟡 admite que é planilha + sensação.
10. "Quanto esse forecast costuma errar?" → 🟢 reconhece a fragilidade.

### Fase 4 — Quantificação do custo de inação
11. "Já perdeu negócio bom por ninguém ter retomado a tempo?" → 🟢 conta o caso (uns oitenta mil).
12. "Quantos vendedores e qual o tamanho de um negócio médio?" → 🟢 dá os números por extenso.
13. "Se some um negócio assim por mês, quanto é isso no ano?" → 🟢 **reage à conta** (momento-chave).
14. "Esse custo, contra um sistema, ainda parece 'não vale a pena mudar'?" → 🟡 começa a ceder.

### Fase 5 — Objeção de adoção (o medo real)
15. "Você já viu sistema ser adotado e abandonado?" → 🟢 conta a cicatriz.
16. "O que fez o time abandonar da outra vez?" → 🟢 abre a causa (sem valor de uso, virou digitação).
17. "O que precisaria ser verdade pra o time usar de verdade dessa vez?" → 🟢 define a condição de adoção.
18. "Eu não vou te dizer que adotar é fácil — é justamente o ponto a resolver. Concorda?" → 🟢 valoriza não minimizar.

### Fase 6 — Decisão e próximo passo (avaliação, não compra)
19. "Quem decide isso com você? Custo recorrente passa pela diretoria?" → 🟡 abre a alçada.
20. "Qual seria a prova de que vale sair da planilha?" → 🟢 define critério.
21. "Faria sentido um diagnóstico da sua operação antes de qualquer decisão — pra olhar perda e adoção juntos?" → 🟢 considera.
22. "Marcamos esse diagnóstico pra mapear quanto escapa e como o time adotaria, sem compromisso de compra?" → 🟢 **aceita o diagnóstico** (critério de sucesso).

**Desfecho esperado:** Eduardo aceita um diagnóstico da operação (perda + adoção), com o custo da operação manual construído com os próprios números e o risco de adoção reconhecido. Sem cross-sell, sem assumir produto RD prévio, sem fechamento na hora.`,
  },
};

/** Roleplays de outros clientes (FIESC etc.) usam sufixo MBI/SENAI/SESI — roteiro só no banco. */
function isNonRdRoleplayName(name: string): boolean {
  return /\b(MBI|SENAI|SESI)\b/i.test(name);
}

/**
 * Extrai o código de um roleplay RD a partir do nome da linha da Prontidão:
 * "RP1.1 (v4)" → "1.1", "RP A.1 (v4)" → "A.1". Retorna null fora do mapa RD.
 */
export function scriptCodeFromName(name: string): string | null {
  if (isNonRdRoleplayName(name)) return null;
  // Código de aquisição alfanumérico, ex.: "RP A.1" → "A.1".
  const alpha = name.match(/\b([A-Za-z])\.(\d+)\b/);
  if (alpha) {
    const code = `${alpha[1].toUpperCase()}.${alpha[2]}`;
    if (code in ROLEPLAY_SCRIPTS) return code;
  }
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
