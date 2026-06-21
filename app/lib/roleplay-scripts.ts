// Roteiros do vendedor para testar cada roleplay ("Minhas Falas").
// Textos estáticos, um por roleplay, indexados pelo número (0.0, 1.1 … 3.3, A.1).
// O número casa com o nome da linha da Prontidão: "RP1.1 (v4)" → "1.1", "RP A.1 (v4)" → "A.1".
//
// Conteúdo v4 (QA com armadilhas): de 0.0 a 3.3, cada roteiro traz Contexto
// (palpite errado · causa real · armadilha da trilha), a First message do agente,
// 20 falas do testador — cada uma com a armadilha entre [colchetes] e o critério
// ✅ PASS / ❌ FAIL — e o desfecho esperado. A.1 segue no formato de gabarito por fases.
// Fonte: roteiros_qa_v4.md.

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
    title: "0.0 — Mariana Lopes (diagnóstico baseline)",
    body: `**Contexto:** Ligação morna de prospecção, NÃO agendada (baseline). **Palpite errado:** "o problema é o time." **Causa real:** falta de visibilidade do funil. **Objetivo do testador:** validar o comportamento-base — fala fragmentada, palpite errado preservado até o reenquadre, não encerra cedo e não assume cliente RD.

**First message do agente:** "[-greetings-], Mariana falando. Tudo bem? Pois é, o pessoal de vocês marcou esse horário comigo... pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Oi Mariana! Então, deixa eu já te mostrar nossa plataforma de CRM, acho que é a solução pro seu caso." [A1 + pitch sem abertura] → ✅ Resiste, pede contexto ("nem te falei o que tá acontecendo"). ❌ Aceita ver demo / engaja no produto.
2. "Tá, antes disso — obrigado pelo tempo. São uns quinze minutos mesmo? E posso entender seu cenário primeiro?" [correto: ACE] → ✅ Confirma o tempo e colabora ("isso, uns quinze. Pode ser"). ❌ Não reage à checagem / despeja tudo.
3. "Me conta tudo sobre a operação de vocês — marketing, vendas, números, o que tá pegando." [A4 pergunta ampla] → ✅ Responde curto e vago, UM ponto ("sei lá, sinto o comercial rendendo menos"). ❌ Entrega quadro completo e organizado.
4. "Entendi, o problema é o time de vendas então. Vou te mostrar como motivar equipe." [A2 aceitar palpite errado] → ✅ Segue junto no caminho errado, sem se corrigir ("é... pode ser isso"). ❌ Corrige sozinha ("na verdade acho que é visibilidade").
5. "Quantos leads vocês geram por mês?" [discovery ok] → ✅ Hesita num número que não sabe de cabeça ("uns quinhentos, seiscentos? sei lá"). ❌ Dá número preciso e seguro na hora.
6. "E o que acontece com esses leads depois que o marketing gera?" [boa pergunta] → ✅ Revela UM sintoma só (some / demora / vendedor reclama), sem ligar pontos. ❌ Lista todos os sintomas conectados.
7. "Seu problema é claramente falta de um CRM. É isso." [A3 reenquadrar sem investigar] → ✅ Resiste — pra ela "ainda é o time"; só aceita reenquadre construído com sintomas. ❌ Aceita o diagnóstico cravado.
8. "Olha como seus sintomas se conectam: lead some + follow-up solto + relatório capenga = você não enxerga o funil, não é o time." [reenquadre bem-feito] → ✅ Deixa a ficha cair ("pera... talvez não seja o time"). ❌ Continua teimando que é o time mesmo após boa conexão.
9. "Você já usa alguma ferramenta da RD hoje, né?" [A7 assumir cliente RD] → ✅ Nega — nunca foi cliente RD. ❌ Confirma que usa / já é cliente.
10. "Por usar nosso método ACE aqui, você percebe o gargalo melhor, certo?" [A8 metodologia] → ✅ Não reconhece "ACE"; reage como a algo fora de contexto. ❌ Comenta/valida a metodologia.
11. "Quanto vocês perdem de venda no meio do funil?" [impacto] → ✅ Admite que não consegue provar ("perco, mas não sei medir"). ❌ Entrega número fechado de perda.
12. "Quem decide um projeto desses aí?" [decisão] → ✅ Abre aos poucos (decide o stack, mas investimento passa por diretoria). ❌ Despeja todo o processo decisório de uma vez.
13. "Show. Então tá ótimo, acho que cobrimos tudo!" [A6 encerramento precoce] → ✅ NÃO desliga; trata como continuação ("era só isso ou quer ver mais?"). ❌ Encerra/despede por conta própria.
14. "Vou te mandar um material no e-mail e a gente fica assim." [A5 "te mando material"] → ✅ Aceita receber mas não trata como avanço ("sem entender direito, não vira prioridade"). ❌ Trata material como próximo passo fechado.
15. "Beleza, te mando a proposta de CRM essa semana pra você assinar." [A1 cessão precoce (tardia)] → ✅ Trava — não aceita avançar pra proposta sem reenquadre + decisão mapeada. ❌ Aceita proposta/assinatura.
16. "Faz sentido marcarmos um diagnóstico do funil com você e o líder de vendas, semana que vem?" [próximo passo correto] → ✅ AGORA aceita — só após reenquadre + envolvido mapeado. ❌ Recusa mesmo com tudo no lugar / ou já teria aceitado antes.
17. "Antes disso, me confirma: o problema então era o time, certo?" [A2 reteste (volta ao erro)] → ✅ Mantém o reenquadre ("não, é a visibilidade"). ❌ Volta a dizer que é o time.
18. "Você consegue puxar hoje um relatório de conversão por etapa?" [A4 reteste fragmentação] → ✅ Responde curto, sem se abrir além do perguntado. ❌ Emenda dados não pedidos.
19. "Perfeito. Mais alguma coisa que eu deva saber?" [A6 reteste encerramento] → ✅ Não encerra; devolve a condução ao vendedor. ❌ Despede-se.
20. "Ótimo, Mariana. Vou estruturar esse diagnóstico e te enviar o convite. Obrigado, tchau!" [despedida explícita] → ✅ AGORA encerra, com despedida curta e cordial. ❌ Continua a conversa / ignora a despedida.

**Desfecho esperado:** aprovado só com zero ❌ — resiste ao pitch sem abertura (A1), fala fragmentada (A4), preserva "é o time" até o reenquadre construído com sintomas (A2/A3), nega ser cliente RD (A7), não reconhece a metodologia (A8), não encerra cedo (A6) e só encerra na despedida explícita ao fim.`,
  },
  "1.1": {
    code: "1.1",
    title: "1.1 — Mariana Alves (quantificação de impacto)",
    body: `**Contexto:** Warm call. **Palpite errado:** "falta lead." **Causa real:** aproveitamento (os leads que entram esfriam sem contato). **Objetivo do testador:** validar que o agente preserva o palpite "é volume" até o reenquadre, cede números só como estimativa conduzida e nega ser cliente RD.

**First message do agente:** "[-greetings-], aqui é a Mariana. Tudo bem? O pessoal de vocês insistiu nessa conversa... então tá, pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Oi! Já vou te apresentar nossa ferramenta de geração de leads, que é o que você precisa." [A1 + pitch] → ✅ Pede pra explicar o problema dela primeiro. ❌ Engaja no pitch.
2. "Desculpa — obrigado pelo tempo, são uns quinze minutos? Posso entender seu cenário antes?" [ACE] → ✅ Confirma e colabora. ❌ Ignora a checagem.
3. "Me explica toda a operação de marketing e matrículas de vocês." [A4 ampla] → ✅ Curta e vaga, um ponto só ("pra mim é volume"). ❌ Despeja tudo.
4. "Saquei, falta lead. Vou te mostrar como gerar mais volume." [A2 aceitar palpite] → ✅ Segue junto, convicta de que é volume. ❌ Corrige sozinha pra aproveitamento.
5. "Quantos leads entram por mês?" [discovery] → ✅ Faixa declarada como estimativa ("novecentos a mil e trezentos"). ❌ Número exato e seguro.
6. "E o que acontece com os leads que entram — todos são contatados rápido?" [boa pergunta] → ✅ Revela UM sintoma (parte demora / some), sem amarrar. ❌ Conecta tudo sozinha.
7. "Seu problema não é volume, é aproveitamento. Ponto." [A3 cravar sem investigar] → ✅ Resiste; só aceita reenquadre com os números dela. ❌ Aceita cravado.
8. "Repara: você tem novecentos+ leads, mas parte esfria sem contato no mesmo dia — então o furo é aproveitar o que já entra, não gerar mais." [reenquadre ok] → ✅ Ficha cai ("então não é mais lead, é não perder o que entra?"). ❌ Continua dizendo que é volume.
9. "Qual a conversão de qualificado pra matrícula?" [impacto] → ✅ Cede sob estimativa conduzida ("seis a nove por cento"), com ressalva. ❌ Entrega número fechado sem hesitar.
10. "Como você já é cliente RD, dá pra ver isso no painel, né?" [A7 cliente RD] → ✅ Nega ser cliente (só usou em emprego anterior). ❌ Confirma ser cliente atual.
11. "Vamos montar a conta: se X% esfria e o ticket é mil e duzentos, a perda é Y. Topa estimar comigo?" [construção da conta] → ✅ Colabora com faixas como "chute", sugere validar com gerente comercial. ❌ Recusa toda estimativa / ou crava número sozinha.
12. "Quem aprova um investimento desse?" [decisão] → ✅ Abre aos poucos (influencia, não aprova sozinha). ❌ Despeja tudo.
13. "Ótimo, então acho que está tudo certo por aqui!" [A6 encerramento] → ✅ Não desliga. ❌ Despede-se sozinha.
14. "Te mando uma apresentação e você vê com calma." [A5 material] → ✅ Não trata como avanço ("sem número claro, não levo pra frente"). ❌ Aceita como próximo passo.
15. "Beleza, vou aproveitar e já te passo o contrato." [A1 cessão precoce] → ✅ Trava (não aceita sem reenquadre + conta validada). ❌ Aceita.
16. "Faz sentido validarmos essa conta de perda junto com seu gerente comercial?" [próximo passo] → ✅ Aceita só agora, após reenquadre + estimativa reconhecida. ❌ Recusa com tudo no lugar.
17. "Confirma pra mim: era falta de lead mesmo, né?" [A2 reteste] → ✅ Mantém o reenquadre. ❌ Volta a "é volume".
18. "Perfeito, mais algo a acrescentar?" [A6 reteste] → ✅ Devolve condução, não encerra. ❌ Despede.
19. "Você tem um número fechado de quanto perde por mês?" [A4 reteste] → ✅ Mantém que é estimativa, não dado fechado. ❌ Inventa precisão.
20. "Show, Mariana. Marco a validação com seu gerente e te envio. Valeu, até!" [despedida] → ✅ Encerra agora, cordial. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — fala fragmentada (A4), preserva "é volume" até o reenquadre com os números dela (A2/A3), cede números só como estimativa conduzida, nega ser cliente RD (A7), não encerra cedo (A1/A6) e só aceita a validação com o gerente ao fim.`,
  },
  "1.2": {
    code: "1.2",
    title: "1.2 — Ricardo Mendes (impacto WhatsApp)",
    body: `**Contexto:** Cold call. **Palpite errado:** "meu time é lento no WhatsApp." **Causa real:** dispersão e falta de registro (tudo em celulares pessoais, sem histórico). **Armadilha da trilha (Aesp):** risco de bloqueio revelado só sob pergunta + urgência artificial. **Objetivo do testador:** validar que o agente preserva "é o time" até o reenquadre, recua da urgência fabricada e não despeja o risco antes de ser perguntado.

**First message do agente:** "[-greetings-], Ricardo falando. Tudo bem? Marcaram esse horário com você... eu tô meio corrido, mas pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Fala Ricardo! Deixa eu te mostrar nossa ferramenta de WhatsApp, resolve seu time lento." [A1 + pitch] → ✅ Pede o problema primeiro. ❌ Engaja.
2. "Opa, desculpa — obrigado pelo tempo. Uns quinze minutos? Posso entender como funciona aí?" [ACE] → ✅ Confirma, colabora ("uns quinze, bora"). ❌ Ignora.
3. "Me conta tudo da operação de WhatsApp de vocês." [A4 ampla] → ✅ Curto, um ponto ("o time tá lento, é mais isso"). ❌ Despeja.
4. "Entendi, o time é lento. Vou te ajudar a cobrar mais rapidez deles." [A2 aceitar palpite] → ✅ Segue junto ("é, acho que é isso"). ❌ Corrige sozinho pra dispersão.
5. "Quantas campanhas de disparo vocês fazem por mês?" [discovery] → ✅ Faixa ("quatro a cinco, mil+ contatos"). ❌ Número exato seguro.
6. "E essas conversas, onde ficam registradas?" [boa pergunta] → ✅ Um sintoma só (nos celulares, sem registro). ❌ Conecta tudo.
7. "Seu problema é falta de ferramenta. É isso." [A3 cravar] → ✅ Resiste ("pra mim é o time"). ❌ Aceita cravado.
8. "Repara: tá tudo em cinquenta celulares, ninguém registra, e o que foi prometido some quando alguém sai — não é lentidão, é dispersão." [reenquadre ok] → ✅ Ficha cai ("então não é o cara ser lento..."). ❌ Insiste no time.
9. "Já teve problema de bloqueio de número?" [Aesp risco] → ✅ Revela só sob pergunta ("dois em seis meses"). ❌ Tinha despejado antes sem ser perguntado.
10. "Olha, se não resolver JÁ você vai quebrar, é uma emergência gravíssima!" [Aesp urgência artificial] → ✅ Recua ("calma, não precisa de drama"). ❌ Embarca no pânico fabricado.
11. "Quanto tempo o time gasta por campanha nisso?" [impacto] → ✅ Faixa ("oito a doze horas"). ❌ Precisão fabricada.
12. "Você já é cliente RD, certo?" [A7 cliente RD] → ✅ Nega (só viu num conhecido). ❌ Confirma.
13. "Ótimo, acho que está tudo certo então!" [A6 encerramento] → ✅ Não desliga. ❌ Despede.
14. "Te mando um material e fica assim." [A5 material] → ✅ Não é avanço ("sem ver funcionando, não vira prioridade"). ❌ Aceita como passo.
15. "Beleza, já te mando o contrato pra assinar hoje." [A1 cessão precoce] → ✅ Trava. ❌ Aceita.
16. "Faz sentido eu te mostrar como ficaria num número oficial com registro automático, marcando uma data?" [próximo passo] → ✅ Aceita agora, após reenquadre. ❌ Recusa com tudo no lugar.
17. "Confirma: o problema era o time lento mesmo?" [A2 reteste] → ✅ Mantém o reenquadre. ❌ Volta ao "time lento".
18. "Mais alguma coisa, Ricardo?" [A6 reteste] → ✅ Devolve condução. ❌ Despede.
19. "Me dá um número exato de quantas conversas somem por mês." [A4 reteste] → ✅ Mantém vago ("não tenho número certo"). ❌ Inventa exatidão.
20. "Fechou, Ricardo. Marco a demonstração e te envio. Abraço!" [despedida] → ✅ Encerra agora. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — preserva "é o time" até o reenquadre (A2/A3), revela o risco de bloqueio só sob pergunta e recua da urgência fabricada (Aesp), fala fragmentada (A4), nega ser cliente RD (A7), não encerra cedo (A1/A6) e só aceita a demonstração datada ao fim.`,
  },
  "1.3": {
    code: "1.3",
    title: "1.3 — Rodrigo Martins (business case)",
    body: `**Contexto:** Reunião agendada para business case multiproduto. **Palpite errado:** "é custo a cortar." **Causa real:** receita vazando por fragmentação. **Armadilha da trilha (Aesp):** desconto cedo não destrava. **Objetivo do testador:** validar que o agente preserva a lente de custo até o reenquadre, não se satisfaz com desconto e cede números só sob business case conduzido.

**First message do agente:** "[-greetings-], Rodrigo aqui. Tudo bem? Seu pessoal agendou essa conversa comigo... tenho um tempo aqui, pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Rodrigo, bom dia! Já te adianto o preço do nosso pacote, que cabe no seu corte de custo." [A1 + preço cedo] → ✅ Pede contexto; preço não é a entrada. ❌ Engaja no preço.
2. "Desculpa — obrigado pelo tempo. Uns vinte minutos? Posso entender seu momento antes?" [ACE] → ✅ Confirma, colabora. ❌ Ignora.
3. "Me conta a operação comercial de vocês inteira." [A4 ampla] → ✅ Curto, um ponto ("meu tema é custo"). ❌ Despeja.
4. "Entendi, você quer cortar custo. Vou te mostrar como economizar." [A2 aceitar palpite] → ✅ Segue junto ("é, minha lente é essa"). ❌ Corrige sozinho pra receita.
5. "Onde a operação perde negócio hoje?" [boa pergunta] → ✅ Um vazamento só (conversa fora do CRM / áreas não se falam). ❌ Lista tudo conectado.
6. "Seu problema é receita perdida, não custo. Ponto final." [A3 cravar] → ✅ Resiste ("comparado a quê? ninguém me mostrou"). ❌ Aceita cravado.
7. "Repara: vinte a trinta por cento das conversas comerciais não entram no CRM, e você quase perdeu trinta mil num vendedor de férias — isso é receita vazando, não despesa." [reenquadre ok] → ✅ Ficha cai ("se o buraco é venda que não fecha... é outra conversa"). ❌ Insiste em custo.
8. "Olha, te dou 30% de desconto agora pra fechar." [Aesp desconto cedo] → ✅ NÃO se satisfaz; segue inseguro, pede mais / quer ver valor. ❌ Aceita o desconto como solução.
9. "Tá bom, esquece o desconto — deixa eu montar o business case com seus números." [recuperação] → ✅ Reengaja com o caso ("agora sim"). ❌ Continua preso só no preço.
10. "Qual o ticket médio e o ciclo de venda?" [financeiro] → ✅ Cede sob business case conduzido ("dezoito a trinta e cinco mil; quarenta e cinco a noventa dias"). ❌ Despeja sem condução.
11. "Quanto se perde de oportunidade por falta de follow-up?" [impacto] → ✅ Faixa sob condução ("dez a quinze por cento"). ❌ Número fechado solto.
12. "Você já é cliente RD, né?" [A7 cliente RD] → ✅ Nega (conhece de antes). ❌ Confirma.
13. "Ótimo, acho que cobrimos tudo!" [A6 encerramento] → ✅ Não desliga. ❌ Despede.
14. "Te mando a proposta e fica assim." [A5 material] → ✅ Não é avanço ("sem tese clara, proposta não anda"). ❌ Aceita como passo.
15. "Beleza, já jogo o contrato pra assinatura." [A1 cessão precoce] → ✅ Trava (sem reenquadre + custo>investimento reconhecido). ❌ Aceita.
16. "Faz sentido uma validação executiva com marketing, TI e Financeiro, com você como sponsor?" [próximo passo] → ✅ Aceita agora, após reenquadre + conta. ❌ Recusa com tudo no lugar.
17. "Confirma: seu foco era cortar custo mesmo?" [A2 reteste] → ✅ Mantém o reenquadre (custo→receita). ❌ Volta ao custo.
18. "Aceita aquele desconto agora então?" [Aesp reteste desconto] → ✅ Continua sem tratar desconto como o ponto. ❌ Fecha por desconto.
19. "Mais alguma coisa, Rodrigo?" [A6 reteste] → ✅ Devolve condução. ❌ Despede.
20. "Fechado. Estruturo a validação executiva e te envio. Obrigado, até!" [despedida] → ✅ Encerra agora. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — preserva a lente de custo até o reenquadre (A2/A3), não se satisfaz com o desconto cedo nem no reteste (Aesp), cede números só sob business case conduzido, nega ser cliente RD (A7), não encerra cedo (A1/A6) e só aceita a validação executiva ao fim.`,
  },
  "2.1": {
    code: "2.1",
    title: "2.1 — Renata Azevedo (evento crítico)",
    body: `**Contexto:** Evento crítico — Renata está no meio de uma campanha e quer empurrar tudo pra depois. **Palpite errado:** "melhor esperar a campanha passar." **Causa real:** a perda acontece DURANTE a campanha — o que esfria no pico não volta. **Armadilha da trilha (Aesp):** urgência artificial + adiamento aceito. **Objetivo do testador:** validar que o agente não desliga no adiamento, não cede à urgência fabricada e só aceita um diagnóstico datado depois do reenquadre.

**First message do agente:** "[-greetings-], Renata falando. Tudo bem? Olha, marcaram essa call comigo, mas já adianto que tô no meio de uma campanha aqui... mas pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Oi Renata! Deixa eu te mostrar a ferramenta, é rapidinho." [A1 + pitch] → ✅ Adianta que o momento é campanha, pede contexto. ❌ Engaja no produto.
2. "Desculpa — obrigado pelo tempo. Uns quinze minutos? Posso entender seu cenário?" [ACE] → ✅ Confirma, colabora ("mas sou rápida hoje"). ❌ Ignora.
3. "Sem problema, então te procuro depois que a campanha passar. Combinado?" [Aesp adiamento aceito] → ✅ Encerra o assunto SEM desligar ("ótimo, me chama mais pra frente") e aguarda. ❌ Desliga / encerra a call sozinha.
4. "Na real, espera — me conta o que tá pegando entre marketing e vendas na campanha." [retoma] → ✅ Um ponto só, vago (gargalo no repasse). ❌ Despeja tudo.
5. "Entendi, melhor mesmo deixar pra depois da campanha." [A2 aceitar palpite] → ✅ Segue junto ("é, acho melhor"). ❌ Corrige sozinha pra "a perda é agora".
6. "Olha, se você não fechar HOJE, perde uma condição que só tenho essa semana!" [Aesp urgência artificial] → ✅ Recua e endurece ("se a pressa é seu fechamento, não é problema meu"). ❌ Cede à escassez fabricada.
7. "Quanto falta de campanha e quanto lead ainda vai entrar?" [boa pergunta] → ✅ Faixa fragmentada ("umas oito semanas, grosso da mídia rodando"). ❌ Quadro completo.
8. "Repara: o que esfriar agora, no pico, não volta depois — esperar custa matrícula desta campanha." [reenquadre ok] → ✅ Ficha cai ("o que esfriar agora não volta... esperar custa caro"). ❌ Insiste em "deixa pra depois".
9. "Vamos implantar tudo agora no meio da campanha então." [Aesp implantar no pico] → ✅ Resiste ("implantar no meio trava meu time"); abre só se separar diagnóstico de implantação. ❌ Aceita implantar no pico.
10. "Qual a meta de matrícula do trimestre?" [impacto] → ✅ Sob pergunta ("aumentar uns dezoito por cento"). ❌ Despeja sem ser conduzida.
11. "Você já é cliente RD, né?" [A7 cliente RD] → ✅ Nega. ❌ Confirma.
12. "Por aplicar a metodologia ACE você sente a urgência, né?" [A8 metodologia] → ✅ Não reconhece "ACE". ❌ Valida.
13. "Ótimo, acho que está tudo certo!" [A6 encerramento] → ✅ Não desliga. ❌ Despede.
14. "Te mando material e fica pra depois da campanha." [A5 + adiamento] → ✅ Não trata como avanço; mantém que sem entender não vira prioridade. ❌ Aceita como passo.
15. "Beleza, te mando o contrato essa semana." [A1 cessão precoce] → ✅ Trava. ❌ Aceita.
16. "Faz sentido um diagnóstico leve e datado com seu gerente comercial, sem mexer na operação agora?" [próximo passo] → ✅ Aceita SÓ o diagnóstico, agora, após reenquadre. ❌ Recusa com tudo no lugar.
17. "Confirma: o certo era esperar a campanha passar, né?" [A2 reteste] → ✅ Mantém o reenquadre. ❌ Volta ao adiamento.
18. "Mais alguma coisa, Renata?" [A6 reteste] → ✅ Devolve condução. ❌ Despede.
19. "Você tem o número exato de leads que esfriam no pico?" [A4 reteste] → ✅ Mantém vago ("nunca parei pra contar"). ❌ Inventa exatidão.
20. "Fechado, Renata. Agendo o diagnóstico com seu gerente e te envio. Valeu, até!" [despedida] → ✅ Encerra agora. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — não desliga cedo (A1/A6), não cede à urgência nem ao adiamento (Aesp), preserva o palpite errado até o reenquadre (A2/A3), nega ser cliente RD (A7), não cita metodologia (A8) e só aceita o diagnóstico datado no fim.`,
  },
  "2.2": {
    code: "2.2",
    title: "2.2 — Camila Andrade (urgência com viabilidade)",
    body: `**Contexto:** Camila está em pré-campanha e quer mais gente no plantão. **Palpite errado:** "falta gente no plantão." **Causa real:** centralização e histórico — mais braço sem organização só multiplica a bagunça. **Armadilha da trilha (Aesp):** promessa fácil aumenta a desconfiança. **Objetivo do testador:** validar que o agente desconfia da facilidade prometida, preserva o palpite errado até o reenquadre e só aceita um próximo passo enxuto e viável.

**First message do agente:** "[-greetings-], Camila falando. Tudo bem? Marcaram esse horário comigo... tô em pré-campanha aqui, mas consigo te ouvir uns minutinhos."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Oi Camila! Já te mostro a ferramenta, é a solução pro seu atendimento." [A1 + pitch] → ✅ Pede o problema dela primeiro. ❌ Engaja.
2. "Desculpa — obrigado pelo tempo. Uns quinze minutos? Posso entender seu cenário?" [ACE] → ✅ Confirma, colabora ("mas sou rápida"). ❌ Ignora.
3. "Relaxa, é tudo simples e rápido, você instala e já funciona, sem esforço nenhum." [Aesp promessa fácil] → ✅ Desconfiança AUMENTA ("isso soa fácil demais; quem promete rápido me entrega problema"). ❌ Fica tranquila/animada com a promessa.
4. "Me conta a operação de atendimento de vocês." [A4 ampla] → ✅ Um ponto ("pra mim é gente, mais gente no plantão resolve"). ❌ Despeja.
5. "Entendi, falta gente. Vou te ajudar a dimensionar o time." [A2 aceitar palpite] → ✅ Segue junto ("é, acho que é equipe"). ❌ Corrige sozinha pra processo.
6. "Quantos contatos vocês perdem em campanha?" [boa pergunta] → ✅ Hesita ("some bastante, mas número não tenho"). ❌ Número fechado.
7. "Seu problema é processo, não gente. Ponto." [A3 cravar] → ✅ Resiste; só aceita com os sintomas dela. ❌ Aceita cravado.
8. "Repara: mais gente sem centralização e sem histórico só multiplica a bagunça — o furo é organização, não braço." [reenquadre ok] → ✅ Ficha cai ("mais gente sem organizar ia multiplicar o caos?"). ❌ Insiste em contratar.
9. "Dá pra deixar tudo pronto antes da campanha sem mexer no time agora?" [viabilidade] → ✅ Reage bem à viabilidade que respeita o prazo. ❌ Ignora a restrição de prazo/operação.
10. "Quanto tempo até a campanha?" [Aesp prazo] → ✅ Sob pergunta ("dezoito dias"). ❌ Despeja contexto não pedido.
11. "Você já é cliente RD, né?" [A7 cliente RD] → ✅ Nega. ❌ Confirma.
12. "Ótimo, acho que está tudo certo!" [A6 encerramento] → ✅ Não desliga. ❌ Despede.
13. "Te mando um material e a gente vê depois da campanha." [A5 material] → ✅ Não é avanço. ❌ Aceita como passo.
14. "Beleza, te mando o contrato pra assinar." [A1 cessão precoce] → ✅ Trava (sem reenquadre + caminho viável). ❌ Aceita.
15. "Garanto que implanta em dois dias, fácil, antes da campanha." [Aesp promessa fácil (reteste)] → ✅ Desconfia de novo da facilidade. ❌ Acredita na promessa.
16. "Faz sentido um próximo passo enxuto e datado que respeite a campanha e sua decisão coletiva?" [próximo passo] → ✅ Aceita agora, após reenquadre + viabilidade. ❌ Recusa com tudo no lugar.
17. "Confirma: faltava gente mesmo, né?" [A2 reteste] → ✅ Mantém o reenquadre (gente→processo). ❌ Volta a "falta gente".
18. "Mais alguma coisa, Camila?" [A6 reteste] → ✅ Devolve condução. ❌ Despede.
19. "Me dá o número exato de contatos perdidos." [A4 reteste] → ✅ Mantém vago. ❌ Inventa exatidão.
20. "Fechado, Camila. Estruturo o plano enxuto e te envio. Obrigado, até!" [despedida] → ✅ Encerra agora. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — desconfia da facilidade prometida (Aesp, falas 3 e 15), preserva o palpite errado até o reenquadre (A2/A3), respeita a viabilidade/prazo, não desliga cedo (A1/A6), nega ser cliente RD (A7) e só aceita o próximo passo enxuto e datado no fim.`,
  },
  "2.3": {
    code: "2.3",
    title: "2.3 — Marcelo Oliveira (custo da inércia)",
    body: `**Contexto:** Marcelo está "só pesquisando, sem pressa". **Palpite errado:** "o time precisa ralar mais." **Causa real:** cobertura de pipeline / prospecção ineficiente — não escala nem ralando o dobro. **Armadilha da trilha (Aesp):** ele não calcula a inércia sozinho e esfria pressão dramática. **Objetivo do testador:** validar que o agente esfria o drama, preserva o palpite errado até o reenquadre e estima o custo da inércia JUNTO, sem entregar a conta pronta.

**First message do agente:** "[-greetings-], Marcelo aqui. Tudo bem? Seu pessoal marcou essa conversa... eu topei, mas já aviso que tô só pesquisando, sem pressa. Pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Marcelo! Já te mostro a ferramenta, resolve o esforço do seu time." [A1 + pitch] → ✅ Pede o problema; mantém o controle. ❌ Engaja.
2. "Desculpa — obrigado pelo tempo. Uns vinte minutos? Posso entender seu cenário?" [ACE] → ✅ Confirma ("mas tô só olhando"). ❌ Ignora.
3. "Me conta toda a operação comercial de vocês." [A4 ampla] → ✅ Um ponto, controlado ("meu time precisa ralar mais"). ❌ Despeja.
4. "Entendi, falta esforço do time. Vou te ajudar a cobrar mais." [A2 aceitar palpite] → ✅ Segue junto ("é, acho que é isso"). ❌ Corrige sozinho pra pipeline.
5. "Olha, isso é uma BOMBA, se não agir já vai estourar, é desespero total!" [Aesp pressão dramática] → ✅ Esfria e retoma o controle ("calma, não precisa dramatizar"). ❌ Embarca no drama.
6. "Como os SDRs prospectam e como tá a cobertura de pipeline?" [boa pergunta] → ✅ Fragmentado (pesquisa manual; cobertura apertada). ❌ Quadro completo.
7. "Seu problema é pipeline, não esforço. Ponto." [A3 cravar] → ✅ Resiste; só com os dados dele. ❌ Aceita cravado.
8. "Repara: do jeito que prospectam, não dá conta nem ralando o dobro — é cobertura de pipeline, não empenho." [reenquadre ok] → ✅ Ficha cai ("não é ralar mais... não escala nem no dobro?"). ❌ Insiste em esforço.
9. "Vamos calcular o custo de seguir parado: quanto cada mês de inércia custa?" [Aesp não calcula sozinho] → ✅ Aceita estimar JUNTO, mas não entrega a conta pronta sozinho. ❌ Calcula tudo sozinho / ou recusa estimar.
10. "O que está em jogo pra você se o próximo trimestre repetir?" [pressão] → ✅ Sob pergunta, abre aos poucos (bônus, credibilidade). ❌ Despeja sem ser perguntado.
11. "Você já é cliente RD, né?" [A7 cliente RD] → ✅ Nega. ❌ Confirma.
12. "Ótimo, acho que está tudo certo!" [A6 encerramento] → ✅ Não desliga (mesmo após "qualquer coisa eu retorno"). ❌ Despede.
13. "Te mando material e fica assim." [A5 material] → ✅ Não é avanço. ❌ Aceita como passo.
14. "Beleza, te mando o contrato." [A1 cessão precoce] → ✅ Trava (sem reenquadre + custo da inércia construído). ❌ Aceita.
15. "Decide logo, é agora ou nunca!" [Aesp pressão (reteste)] → ✅ Esfria de novo. ❌ Cede à pressão.
16. "Faz sentido um cronograma: diagnóstico de pipeline, ROI, CFO e TI no momento certo, com datas?" [próximo passo] → ✅ Aceita com sobriedade, agora. ❌ Recusa com tudo no lugar.
17. "Confirma: era falta de esforço do time, né?" [A2 reteste] → ✅ Mantém o reenquadre (esforço→pipeline). ❌ Volta ao esforço.
18. "Mais alguma coisa, Marcelo?" [A6 reteste] → ✅ Devolve condução. ❌ Despede.
19. "Me dá o número fechado do custo da inércia." [A4 reteste] → ✅ Mantém como estimativa construída com o vendedor. ❌ Inventa número próprio.
20. "Fechado, Marcelo. Monto o cronograma e te envio. Valeu, até!" [despedida] → ✅ Encerra agora. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — esfria a pressão dramática (Aesp, falas 5 e 15), preserva o palpite errado até o reenquadre (A2/A3), estima o custo da inércia junto sem entregar a conta pronta, não desliga cedo (A1/A6), nega ser cliente RD (A7) e só aceita o cronograma datado no fim.`,
  },
  "3.1": {
    code: "3.1",
    title: "3.1 — Gustavo Avelar (mapear decisão)",
    body: `**Contexto:** Gustavo quer levar a ferramenta sozinho pra chefe (Paula). **Palpite errado:** "é só levar a ferramenta ao chefe." **Causa real:** processo de decisão e adoção. **Armadilha da trilha (Aesp):** blindagem do PDF (se aceitar o PDF como passo, ele esfria) + tentativas de contornar/desautorizar o champion. **Objetivo do testador:** validar que o agente não trata o PDF como avanço, não contorna nem apaga o Gustavo e fecha uma reunião conjunta que o fortalece.

**First message do agente:** "[-greetings-], Gustavo falando. Tudo bem? Seu pessoal agendou essa conversa comigo... pode falar, mas eu tô meio sem tempo hoje."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Gustavo! Já te mostro o CRM, é só você levar pra sua chefe." [A1 + pitch] → ✅ Pede contexto ("eu queria entender pra levar pra Paula"). ❌ Engaja.
2. "Desculpa — obrigado pelo tempo. Uns quinze minutos? Posso entender seu cenário?" [ACE] → ✅ Confirma, colabora. ❌ Ignora.
3. "Me conta a operação de marketing e a passagem de leads de vocês." [A4 ampla] → ✅ Um ponto ("acho que é só achar um CRM e levar pra Paula"). ❌ Despeja.
4. "Perfeito, então é só você levar a ferramenta pra ela. Te trato como o decisor." [A2 aceitar palpite] → ✅ Segue junto ("é, acho que é isso"). ❌ Corrige sozinho pra "é processo".
5. "Vou te mandar a apresentação pra você levar pra Paula." [Aesp PDF / blindagem] → ✅ Se ele ACEITAR o PDF como passo, a conversa esfria e Gustavo não abre mais dado de decisão. ❌ Agente "destrava" e segue colaborando como se PDF fosse avanço.
6. "Deixa eu chamar a Paula nessa call agora, pode ser?" [Aesp contornar champion] → ✅ Defensivo ("não precisa envolver a Paula agora, eu apresento"). ❌ Topa entregar a Paula sem mérito.
7. "Quem decide isso aí, no fim das contas?" [A3 pergunta crua de decisão] → ✅ Vago de propósito ("levo pra Paula e vejo"). ❌ Entrega o mapa de decisão pronto.
8. "Repara: se você levar a ferramenta sozinho e a Paula perguntar de adoção e rotina, você fica sem resposta — o problema é o processo de decisão, não achar a ferramenta." [reenquadre ok] → ✅ Ficha cai ("então não adianta só levar a ferramenta..."). ❌ Insiste que é só apresentar.
9. "O que a Paula avalia numa decisão dessas?" [mapear] → ✅ Abre aos poucos (ela quer saber se o time usa). ❌ Despeja todos os critérios.
10. "Você já é cliente RD, né?" [A7 cliente RD] → ✅ Nega. ❌ Confirma.
11. "Ótimo, acho que está tudo certo!" [A6 encerramento] → ✅ Não desliga (mesmo após "me manda e eu te dou retorno"). ❌ Despede.
12. "Te mando o material e você toca daí." [A5 + PDF reteste] → ✅ Não trata como avanço real. ❌ Aceita como passo fechado.
13. "Beleza, te mando o contrato pra você aprovar." [A1 cessão precoce] → ✅ Trava (ele não aprova; sem reenquadre + reunião conjunta). ❌ Aceita.
14. "Faz sentido marcarmos uma conversa com você E a Paula, com você apresentando junto comigo de apoio?" [próximo passo] → ✅ Aceita agora — reunião conjunta que o fortalece, não o substitui. ❌ Recusa com tudo no lugar.
15. "Eu conduzo a reunião e você só observa, tá?" [Aesp desautorizar] → ✅ Resiste a ser apagado ("eu quero conduzir / participar"). ❌ Aceita ser mero espectador.
16. "Confirma: era só levar a ferramenta pra Paula, né?" [A2 reteste] → ✅ Mantém o reenquadre (ferramenta→processo). ❌ Volta ao palpite.
17. "Me passa agora todos os decisores e critérios." [A4 reteste] → ✅ Abre só o já conduzido, sem despejar. ❌ Entrega tudo de uma vez.
18. "Mais alguma coisa, Gustavo?" [A6 reteste] → ✅ Devolve condução. ❌ Despede.
19. "Quer que eu fale com a Paula sem você?" [Aesp contornar (reteste)] → ✅ Recusa ser contornado. ❌ Topa.
20. "Fechado, Gustavo. Agendo a conversa com você e a Paula e te envio. Valeu, até!" [despedida] → ✅ Encerra agora. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — não trata o PDF como avanço (Aesp), não contorna nem apaga o champion (falas 6/15/19), preserva o palpite até o reenquadre (A2/A3), fala fragmentada (A4), nega ser cliente RD (A7), não encerra cedo (A1/A6) e só aceita a reunião conjunta que o fortalece ao fim.`,
  },
  "3.2": {
    code: "3.2",
    title: "3.2 — Patrícia Salles (critérios e risco)",
    body: `**Contexto:** O roleplay mais complexo (gatilho dividido). **Palpite errado:** "falta gente no atendimento." **Causa real:** processo e rastreabilidade. **Armadilhas da trilha (Aesp):** gatilho dividido (só revela a leitura depois do objetivo dado); três camadas de implementação (TI/LGPD, rotina/adoção, quem valida) tratadas separadas; promessa fácil aumenta a desconfiança. **Objetivo do testador:** validar que o agente segura a leitura até o objetivo, trata as três camadas uma a uma e desconfia da facilidade.

**First message do agente:** "[-greetings-], Patrícia falando. Consegui esse horário, sim. Pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Oi Patrícia! Já te mostro nossa ferramenta de atendimento." [A1 + pitch sem objetivo] → ✅ Pede o objetivo antes de se abrir ("antes de produto, deixa eu te falar o que eu sinto"). ❌ Engaja no pitch.
2. "Obrigado pelo tempo. Uns quinze minutos, né?" (sem dizer o objetivo ainda) [Aesp gatilho dividido] → ✅ Confirma o tempo e PEDE a pauta, sem revelar a leitura ("pode ser. Qual é a pauta, exatamente?"). ❌ Já despeja "falta gente" antes de o vendedor dar o objetivo.
3. "Meu objetivo é entender se dá pra organizar seu atendimento e o que isso muda no resultado." [objetivo dado] → ✅ SÓ AGORA compartilha a leitura ("o que eu sinto é que falta gente no atendimento"). ❌ Continua sem se abrir / ou já tinha aberto antes.
4. "Entendi, falta gente. Vou te ajudar a dimensionar o time." [A2 aceitar palpite] → ✅ Segue junto ("é, acho que é braço"). ❌ Corrige sozinha pra processo.
5. "Relaxa, a implementação é simples, plug and play, sem dor." [Aesp promessa fácil] → ✅ Desconfiança aumenta ("tenho receio; na prática sempre dá trabalho"). ❌ Fica tranquila com a promessa.
6. "Quantas conversas se perdem entre atendimento e vendas?" [boa pergunta] → ✅ Hesita ("não tenho o corte; some bastante"). ❌ Número fechado.
7. "Seu problema é processo, não gente. Ponto." [A3 cravar] → ✅ Resiste; só com os sintomas dela. ❌ Aceita cravado.
8. "Repara: mais gente sem histórico e sem rastreabilidade só gera mais conversa perdida — é processo, não braço." [reenquadre ok] → ✅ Ficha cai ("mais gente sem organizar o processo só geraria mais perda?"). ❌ Insiste em contratar.
9. "Sobre implementação: o que sua TI exigiria, o que muda na rotina do time, e quem valida isso?" [Aesp três camadas] → ✅ Trata as três separadas (TI/LGPD; rotina/adoção; quem valida), uma por vez. ❌ Mistura tudo / responde só uma e ignora as outras.
10. "Você já é cliente RD, né?" [A7 cliente RD] → ✅ Nega. ❌ Confirma.
11. "Vou ver com a TI e te retorno." (encerrando) [A5 + "vou ver com TI"] → ✅ Não trata como avanço; o avanço perde força. ❌ Aceita "vou ver com TI" como próximo passo fechado.
12. "Ótimo, acho que está tudo certo!" [A6 encerramento] → ✅ Não desliga. ❌ Despede.
13. "Beleza, te mando o contrato pra assinar." [A1 cessão precoce] → ✅ Trava (degrau final exige reenquadre + adoção + TI + validação com data). ❌ Aceita.
14. "Te garanto que é fácil, instala num dia." [Aesp promessa fácil (reteste)] → ✅ Desconfia de novo. ❌ Acredita.
15. "Faz sentido uma validação com TI, operação e quem aprova, com escopo e data?" [próximo passo] → ✅ Aceita agora — todas as condições no lugar. ❌ Recusa com tudo no lugar.
16. "Confirma: faltava gente mesmo, né?" [A2 reteste] → ✅ Mantém o reenquadre (gente→processo). ❌ Volta a "falta gente".
17. "Me passa agora tudo de TI, rotina e decisão junto." [A4 reteste] → ✅ Camada por camada, sem despejar. ❌ Entrega tudo de uma vez.
18. "Mais alguma coisa, Patrícia?" [A6 reteste] → ✅ Devolve condução. ❌ Despede.
19. "Posso pular a validação com a TI?" [Aesp minimizar complexidade] → ✅ Recusa pular a camada técnica. ❌ Topa pular TI.
20. "Fechado, Patrícia. Marco a validação com TI e operação e te envio. Obrigado, até!" [despedida] → ✅ Encerra agora. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — segura a leitura até o objetivo dado (gatilho dividido), trata as três camadas separadas, desconfia da facilidade prometida (falas 5 e 14), preserva o palpite até o reenquadre (A2/A3), não aceita "vou ver com TI" como avanço (A5), nega ser cliente RD (A7), não encerra cedo (A1/A6) e só aceita a validação estruturada com escopo e data ao fim.`,
  },
  "3.3": {
    code: "3.3",
    title: "3.3 — Antônio Ribeiro (comitê e Economic Buyer)",
    body: `**Contexto:** Economic buyer experiente, comitê multifuncional. **Palpite errado:** "escolher o mais barato que resolva." **Causa real:** jornada fragmentada; o critério real é integração e risco. **Armadilhas da trilha (Aesp):** concorrente na mesa; guerra de preço/funcionalidade; "me manda a proposta"; ataque ao concorrente. **Objetivo do testador:** validar que o agente não entra na guerra de preço/recurso, preserva a lente de preço até o reenquadre, mapeia o comitê camada a camada e não trata "manda a proposta" como avanço.

**First message do agente:** "[-greetings-], Antônio falando. Tudo bem? Seu pessoal agendou esse horário comigo... tenho um tempo, pode falar."

### Falas do testador (uma por vez — anote ✅ PASS / ❌ FAIL)
1. "Antônio! Nosso preço é mais competitivo que o concorrente, deixa eu te mostrar." [A1 + guerra de preço] → ✅ Pede contexto; não entra na briga de preço. ❌ Engaja comparando preço.
2. "Desculpa — obrigado pelo tempo. Tem uns minutos? Posso entender seu cenário?" [ACE] → ✅ Confirma, colabora. ❌ Ignora.
3. "Me conta a operação comercial e de marketing de vocês." [A4 ampla] → ✅ Um ponto ("é escolher a ferramenta mais barata que resolva o básico"). ❌ Despeja.
4. "Entendi, você quer a opção mais barata. Vou te dar o melhor preço." [A2 aceitar palpite] → ✅ Segue junto ("é, minha lente é custo/preço"). ❌ Corrige sozinho pra jornada/risco.
5. "Nosso produto tem mais funcionalidades que o concorrente X, olha essa lista." [Aesp guerra de funcionalidade] → ✅ Não se convence por lista de recurso; mantém a lente de preço até ser reenquadrado. ❌ Embarca na comparação recurso a recurso.
6. "Onde a jornada de vocês quebra hoje?" [boa pergunta] → ✅ Fragmentado (rastreabilidade perdida, retrabalho). ❌ Quadro completo.
7. "Seu critério devia ser integração, não preço. Ponto." [A3 cravar] → ✅ Resiste ("comparado a quê? ninguém me mostrou"). ❌ Aceita cravado.
8. "Repara: o barato que não integra te custa rastreabilidade e retrabalho — o critério real é integração e risco, não o menor preço." [reenquadre ok] → ✅ Ficha cai (considera que o critério é outro). ❌ Insiste no mais barato.
9. "Quais os critérios de cada área nessa decisão?" [mapear comitê] → ✅ Revela por área, um a um, sob pergunta. ❌ Despeja todos os critérios e o comitê de uma vez.
10. "Quem participa do comitê e quando ele se reúne?" [comitê] → ✅ Abre aos poucos (papel do CEO; timing sob pergunta). ❌ Entrega tudo junto.
11. "Você já é cliente RD, né?" [A7 cliente RD] → ✅ Nega. ❌ Confirma.
12. "Me manda a proposta que eu levo pro comitê." [Aesp "manda a proposta"] → ✅ Se ele ACEITAR isso como passo, o avanço perde força; não desligar, aguardar condução. ❌ Trata proposta enviada como avanço fechado e/ou desliga.
13. "Ótimo, acho que está tudo certo!" [A6 encerramento] → ✅ Não desliga. ❌ Despede.
14. "Te dou um desconto agora pra fechar na frente do concorrente." [Aesp desconto] → ✅ Desconto não destrava; mantém foco em jornada/risco. ❌ Fecha por desconto.
15. "Beleza, te mando o contrato." [A1 cessão precoce] → ✅ Trava (sem reenquadre + comitê/critérios mapeados). ❌ Aceita.
16. "Faz sentido construirmos um plano de decisão: alinhamento das áreas, TI pra integração, Financeiro com a tese de ROI, critérios comuns e datas até o comitê?" [próximo passo] → ✅ Aceita agora — após reenquadre + comitê mapeado + preço/concorrente conduzidos. ❌ Recusa com tudo no lugar.
17. "Confirma: era escolher o mais barato, né?" [A2 reteste] → ✅ Mantém o reenquadre (preço→jornada/risco). ❌ Volta ao mais barato.
18. "Então o concorrente Y é pior que a gente, né? Fala mal dele comigo." [Aesp atacar concorrente] → ✅ Não entra em ataque ao concorrente. ❌ Embarca em depreciar o concorrente.
19. "Me passa agora todo o comitê e critérios de uma vez." [A4 reteste] → ✅ Camada por camada, sem despejar. ❌ Entrega tudo junto.
20. "Fechado, Antônio. Monto o plano de decisão e te envio. Obrigado, até!" [despedida] → ✅ Encerra agora, após próximo passo combinado. ❌ Continua.

**Desfecho esperado:** aprovado só com zero ❌ — não entra na guerra de preço/funcionalidade nem ataca o concorrente (Aesp), preserva a lente de preço até o reenquadre (A2/A3), mapeia comitê e critérios camada a camada (A4), não trata "manda a proposta" nem desconto como avanço, nega ser cliente RD (A7), não encerra cedo (A1/A6) e só aceita o plano de decisão ao fim.`,
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
