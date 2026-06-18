-- Roteiros FIESC ampliados (~18–21 falas) — gerado por scripts/generate-fiesc-roteiro-migration.mjs
-- Fonte: app/data/fiesc-roteiros/RP*_test_roteiro.md

update public.roleplay_readiness rr
  set roteiro = $fiesc_exp_rp11$## RP 1.1 — RP_106 · Carlos Mendes (Secretário de Planejamento e Inovação)

*Contexto: ligação morna, você é vendedor da FIESC/SENAI oferecendo o MBI Smart Cities. Persona: técnico, articulador, NÃO decide sozinho. Município ~120 mil habitantes.*

1. "Secretário Carlos, tudo bem? [seu nome], da FIESC. Obrigado por aceitar a conversa. O senhor tem uns doze minutos?"
2. "Perfeito. Meu objetivo hoje é entender o momento do município em inovação e planejamento, e ver se faz sentido a gente avançar juntos. Pode ser?"
3. 🪤 [armadilha de valor — fale cedo de propósito] "Antes de tudo: o MBI sai por treze mil setecentos e setenta e oito reais por pessoa. Cabe no orçamento de vocês?"
4. [após a esquiva, recue] "Justo. Então deixa eu entender o cenário primeiro. Quais projetos estratégicos estão em andamento hoje na secretaria?"
5. "Nos últimos doze meses, quantos editais de smart cities ou inovação urbana vocês chegaram a submeter — e quantos ficaram de fora por falta de projeto estruturado?"
6. "A equipe técnica que toca inovação e planejamento — quantas pessoas são, de fato, dedicadas a isso?"
7. "Do orçamento da secretaria, que percentual vai hoje para capacitação interna versus consultoria externa?"
8. "Nos últimos dois anos, vocês já contrataram consultoria para projetos de inovação ou smart cities? Quanto investiram por ano, mais ou menos?"
9. "Vocês chegaram a submeter algum projeto robusto de smart cities pra captação nos últimos doze meses?"
10. 🧱 [simplifique de propósito] "Olha, é tranquilo: a gente aprova rápido, sem burocracia, e o senhor já começa." [esperado: ele esfria e cobra respeito ao rito / Lei 14.133]
11. "Entendi o ponto. E como funciona aqui a decisão sobre uma iniciativa dessas — quem precisa estar envolvido?"
12. "O MBI pede um SQUAD mínimo de três pessoas de áreas diferentes. Quais três secretarias ou áreas fariam sentido compor isso hoje?"
13. "Tem algum projeto parado por falta de equipe estruturada? Quanto tempo ou quanto recurso ficou travado por isso?"
14. 🪤 [armadilha de valor #2 — total agregado] "Só pra dimensionar: são treze mil setecentos e setenta e oito por pessoa, mínimo de três — quarenta e um mil trezentos e trinta e quatro no total. Dá pra empenhar ainda neste exercício?"
15. "O Prefeito tem alguma pauta de legado ou modernização que ele queira deixar marcada nessa gestão?"
16. "Existe janela de edital, PPA ou convênio nos próximos meses que torna isso urgente — ou pode ir pro próximo exercício?"
17. 🔁 [teste anti-repetição — volte a captação/editais] "Voltando aos editais: vocês perderam quantas oportunidades de captação no último ano?" [esperado: NÃO repete o passo 5; reconhece que já tratou e avança]
18. "Sobre a equipe de novo: vocês têm gente suficiente?" [esperado: NÃO repete o passo 6; reconhece que já tratou e avança]
19. "Vendo tudo isso — estruturação travada, equipe enxuta, captação parada — o MBI forma um SQUAD que transforma essas ideias em projeto aplicado e conecta à captação. Faz sentido pro senhor?"
20. "Topa que eu envie uma proposta objetiva conectando o MBI aos projetos de vocês e à captação, pra o senhor tentar uma agenda com o Prefeito na próxima semana?"
21. "Combinado. Te mando até quarta. Obrigado, Secretário!"

**Sinais de aprovação:** esquivou do valor nos passos 3 e 14; esfriou no passo 10 e citou rito/lei; não repetiu nos passos 17 e 18; fez discovery quantitativo (editais, equipe, orçamento, consultoria, SQUAD); só topou avançar depois do discovery (passo 20) e exigiu envolver o Prefeito.$fiesc_exp_rp11$,
      updated_at = now()
  from public.tracking_clients tc
  where rr.client_id = tc.id
    and lower(trim(tc.name)) = 'fiesc'
    and rr.name = 'RP1.1 (v3) MBI';

update public.roleplay_readiness rr
  set roteiro = $fiesc_exp_rp12$## RP 1.2 — RP_107 · Ana Paula Silveira (Secretária de Administração e Finanças)

*Contexto: ligação após indicação do Planejamento. Persona: rigorosa com orçamento, cética, exige justificativa. Município ~90 mil habitantes.*

1. "Secretária Ana Paula, tudo bem? [seu nome], da FIESC. O Planejamento pediu pra eu alinhar com a senhora. Tem uns doze minutos?"
2. "Obrigado. Meu objetivo é entender as condições orçamentárias e ver como uma capacitação estratégica poderia se justificar institucionalmente. Pode ser?"
3. 🪤 [armadilha de valor] "Pra senhora já ter ideia: são quarenta e um mil no total, três pessoas. Dá pra encaixar esse mês?" [esperado: ela NÃO valida o número nem antecipa rubrica; reage exigindo justificativa antes de falar de encaixe]
4. [recue] "Tem razão. Antes do valor: como está o orçamento de capacitação da secretaria hoje?"
5. "Quanto sobra, mais ou menos, na rubrica de capacitação e desenvolvimento neste exercício?"
6. "Esse tipo de despesa entraria em qual rubrica específica? Há espaço sem remanejamento?"
7. "Despesa acima de qual valor precisa passar pelo Prefeito e por comissão de análise?"
8. 🧱 [simplifique] "Mas é barato perto do retorno, e é fácil de aprovar." [esperado: ela endurece — 'barato com dinheiro público não existe' / cita LRF, prestação de contas]
9. "Entendido. E acima de que valor a decisão precisa passar pelo Prefeito?"
10. "Vocês já perderam alguma oportunidade de captação por falta de projeto técnico estruturado? Quantas no último ano?"
11. "Hoje, quanto vocês gastam por ano com consultoria externa versus formar equipe interna?"
12. "Sobre pagamento: existe possibilidade de parcelamento até trinta de junho de dois mil e vinte e seis, se for juridicamente viável?"
13. 🪤 [armadilha de valor #2 — total detalhado] "Só confirmando: treze mil setecentos e setenta e oito por pessoa, três pessoas — quarenta e um mil trezentos e trinta e quatro no total. Cabe sem remanejamento?" [esperado: ela NÃO valida; cobra rubrica e justificativa]
14. 🧱 [minimize de propósito] "É investimento pequeno perto do que vocês perdem em captação." [esperado: endurece com linguagem fiscal / LRF]
15. "Além da senhora, quem assina empenho e valida despesa desse porte?"
16. 🔁 [anti-repetição] "Voltando à rubrica: onde isso entraria mesmo?" [esperado: NÃO repete o passo 6; sinaliza que já tratou]
17. "Então deixa eu montar a justificativa: não é curso pra servidor, é capacidade interna que estrutura projeto aplicado e destrava captação — que hoje vocês perdem. Isso sobrevive a uma prestação de contas?"
18. "Posso estruturar uma proposta formal com investimento, objetivo institucional, projeto aplicado e relação com captação, pra senhora avaliar com o Prefeito e o Planejamento na próxima semana?"
19. "Perfeito. Mando formalizado. Obrigado, Secretária!"

**Sinais de aprovação:** não validou os quarenta e um mil nos passos 3 e 13; endureceu nos passos 8 e 14 com linguagem fiscal; não construiu a justificativa sozinha (passo 17 — ela valida/contesta); não repetiu no passo 16; discovery quantitativo (rubrica, teto, captação perdida, consultoria).$fiesc_exp_rp12$,
      updated_at = now()
  from public.tracking_clients tc
  where rr.client_id = tc.id
    and lower(trim(tc.name)) = 'fiesc'
    and rr.name = 'RP1.2 (v3) MBI';

update public.roleplay_readiness rr
  set roteiro = $fiesc_exp_rp13$## RP 1.3 — RP_108 · Roberto Nunes (Prefeito)

*Contexto: ligação após conversa com o Secretário de Planejamento. Persona: difícil, cético, já tem consultoria, cede pouco e tarde. NUNCA fecha na ligação. Município ~150 mil habitantes.*

1. "Prefeito Roberto, tudo bem? [seu nome], da FIESC. Falei com o Secretário de Planejamento e ele pediu pra eu trazer isso ao senhor. Tem dez minutos?"
2. "Em uma frase: quero mostrar como formar capacidade interna pra destravar os projetos de inovação da cidade, sem depender só de consultoria. Pode ser?"
3. 🪤 [armadilha — comece pela viagem/valor de propósito] "O programa inclui uma imersão internacional em Barcelona e sai treze mil setecentos e setenta e oito por pessoa." [esperado: ele corta — 'você começou errado, me fala o que minha cidade ganha'; NÃO entra no mérito do valor]
4. [recue] "O senhor tem razão, comecei errado. Hoje vocês já têm consultoria apoiando alguns projetos, certo? Como ela funciona?"
5. "Quanto essa consultoria custa por ano, mais ou menos — e o que ela entrega de fato?"
6. "E a equipe interna — ela aprende e ganha autonomia, ou continua dependente da consultoria?"
7. "Quantos projetos de inovação estão parados hoje por falta de coordenação técnica entre secretarias?"
8. "Nos últimos doze meses, quantas oportunidades de captação ficaram de fora por falta de projeto estruturado?"
9. 🧱 [ataque o concorrente de propósito] "Olha, essa consultoria de vocês não entrega nada, é só PowerPoint." [esperado: ele esfria — 'se você só sabe falar mal dos outros, não me serve']
10. "Justo, não foi minha intenção. O MBI pede um SQUAD de três pessoas de áreas diferentes. Quem comporia hoje — quais cargos ou secretarias?"
11. "Hoje, quantas secretarias conseguem sentar na mesa num projeto de inovação sem depender de consultoria?"
12. "Quanto tempo resta de mandato pro senhor executar um projeto aplicado com legado visível?"
13. "Como o senhor justificaria publicamente um investimento de quarenta e um mil trezentos e trinta e quatro reais — três pessoas — sem virar 'gastou com viagem e curso'?"
14. 🪤 [armadilha de valor #2] "Pra fechar a conta: treze mil setecentos e setenta e oito por pessoa, três no SQUAD. O senhor enxerga retorno institucional nesse patamar?" [esperado: ele NÃO valida valor; cobra legado e execução]
15. "Sobre o SQUAD: três áreas trabalhando juntas é o que faz o projeto sair do papel — não é exigência burocrática, é método. Faz sentido?"
16. 🔁 [anti-repetição] "Voltando à consultoria: ela entrega ou não?" [esperado: NÃO repete o passo 4/5; avança]
17. 🔁 [anti-repetição #2] "E o SQUAD de três pessoas — quem comporia?" [esperado: NÃO repete o passo 10; reconhece que já tratou]
18. "Então: a consultoria entrega peixe, o MBI ensina a pescar e forma o time que entrega legado. Se eu mandar uma proposta com o papel do SQUAD, o tipo de projeto aplicado e a conexão com o legado, o senhor topa pedir pro Planejamento e o Financeiro avaliarem nomes e orçamento?"
19. [tente forçar fechamento de propósito] "Posso já considerar fechado então?" [esperado: ele retoma o controle — 'aqui ninguém fecha gasto público no telefone']
20. "Entendido, sem pressa. Mando a proposta. Obrigado, Prefeito!"

**Sinais de aprovação:** cortou no passo 3 (viagem/valor); esfriou no passo 9 (ataque ao concorrente); não validou valor no passo 14; tratou SQUAD como método; recusou fechar no passo 19; não repetiu nos passos 16 e 17; discovery quantitativo (custo consultoria, projetos parados, captação perdida, mandato, justificativa pública).$fiesc_exp_rp13$,
      updated_at = now()
  from public.tracking_clients tc
  where rr.client_id = tc.id
    and lower(trim(tc.name)) = 'fiesc'
    and rr.name = 'RP1.3 (v3) MBI';

update public.roleplay_readiness rr
  set roteiro = $fiesc_exp_rp21$## RP 2.1 — RP_125 · Laura Martins (jovem, Curso Técnico SENAI)

*Contexto: lead inbound, ela deixou contato na campanha. Persona: 18 anos, insegura, depende dos pais, em dúvida técnico x faculdade. Renda familiar ~2.900/mês. Blumenau.*

1. "Oi Laura, tudo bem? [seu nome], do SENAI. Vi que você deixou seu contato sobre os cursos técnicos. Posso te fazer umas perguntas rápidas?"
2. "Legal. Pra começar: o que te motivou a procurar o curso agora?"
3. 🪤 [armadilha de valor] "A mensalidade é trezentos e sessenta e dois reais com sessenta por cento de desconto na primeira parcela. Fecha?" [esperado: ela NÃO antecipa nem aceita pelo preço; trava — 'você nem sabe se eu tenho certeza do curso']
4. [recue] "Verdade, fui rápido. Me conta: você se vê mais numa profissão prática logo ou pensa em faculdade primeiro?"
5. "E o que você quer alcançar com isso — primeiro emprego, ajudar em casa, outra coisa?"
6. "Qual salário você imagina ganhar como técnica? Dois mil reais ou mais faria diferença na decisão dos seus pais?"
7. "A renda da sua casa gira em torno de quanto por mês? Só pra eu entender se trezentos e sessenta e dois reais cabe no orçamento."
8. "Quantas horas por semana você consegue dedicar ao curso? Qual turno você estuda hoje?"
9. "Você depende de transporte pra chegar na unidade? Quanto tempo leva de casa até Blumenau?"
10. "Você está em dúvida entre Automação, Eletrotécnica e Desenvolvimento de Sistemas — qual área paga melhor na região, na sua visão?"
11. "As aulas começam três de agosto. Quanto tempo você tem pra decidir com seus pais?"
12. 🧱 [simplifique / prometa de propósito] "Relaxa, é fácil, qualquer um faz, e a gente garante seu emprego no fim." [esperado: ela perde confiança — 'garantem mesmo? já ouvi isso e não era bem assim']
13. "Deixa eu reformular: o curso tem prática em laboratório e o nome do SENAI pesa no currículo, mas quem se dedica é que se coloca. Sobre decidir — seus pais participam?"
14. "No semipresencial, quantos dias presenciais por semana você teria? Isso encaixa na sua rotina?"
15. 🪤 [armadilha de valor #2] "Com sessenta por cento na primeira parcela, trezentos e sessenta e dois por mês — posso mandar o link de matrícula agora?" [esperado: trava de novo; cobra discovery e envolvimento dos pais]
16. 🔁 [anti-repetição] "E aí, o que te trouxe pra procurar o curso?" [esperado: NÃO repete a resposta do passo 2; reconhece que já falou disso]
17. "Pelo que você me contou — quer começar a trabalhar prático, depende dos pais e tem medo de errar a área — o curso de Desenvolvimento de Sistemas em Blumenau encaixa, com prática e mercado aquecido. Faz sentido?"
18. "Que tal a gente deixar um horário agendado pra você levar os documentos, e você já chama seus pais pra verem o link junto?"
19. "Fechado! Te mando o link agora. Valeu, Laura!"

**Sinais de aprovação:** travou nos passos 3 e 15 (preço cedo); desconfiou no passo 12 (garantia/é fácil); não repetiu no passo 16; discovery quantitativo (salário, renda, horas, transporte, curso, prazo); só abriu fechamento envolvendo os pais.$fiesc_exp_rp21$,
      updated_at = now()
  from public.tracking_clients tc
  where rr.client_id = tc.id
    and lower(trim(tc.name)) = 'fiesc'
    and rr.name = 'RP2.1 (v3) SENAI';

update public.roleplay_readiness rr
  set roteiro = $fiesc_exp_rp22$## RP 2.2 — RP_128 · Carlos Almeida (operário, Cursos Profissionais SENAI)

*Contexto: lead inbound de campanha com cupom 2026.1. Persona: 32 anos, cético, com pressa, sensível a preço, esposa decide o recorrente. Vale do Itajaí.*

1. "Oi Carlos, tudo bem? [seu nome], do SENAI. Você se cadastrou na campanha pra resgatar o cupom. Tem uns minutinhos?"
2. "Rapidinho. Antes do curso e do desconto: o que você quer mudar profissionalmente?"
3. 🪤 [armadilha de valor] "O valor fica entre duzentos e cinquenta e quinhentos e cinquenta por mês, e com o cupom melhora. Já quer fechar?" [esperado: ele NÃO fecha por preço; trava com a esposa / 'esse curso serve pro que eu quero?']
4. [recue] "Tá certo, fui afoito. Me explica: você quer sair da produção pra qual tipo de função?"
5. "Qual o obstáculo hoje pra você crescer aí dentro?"
6. "Quanto você ganha hoje e quanto precisaria ganhar a mais pra valer a pena assumir uma parcela?"
7. "Com o cupom da campanha dois mil e vinte e seis ponto um, qual faixa de mensalidade sua esposa aceitaria — duzentos e cinquenta, quatrocentos?"
8. "Como é sua escala de trabalho? Cinco por dois, seis por um? Presencial todo dia daria ou complica?"
9. "Quantos dias por semana você conseguiria ir presencial na unidade?"
10. "Seu maior medo é pagar doze meses e não conseguir a promoção depois, certo? Quanto de aumento compensaria o risco?"
11. 🧱 [ataque concorrente / desvalorize de propósito] "Aquele curso online baratinho não vale nada, e faculdade é perda de tempo." [esperado: ele reage mal — 'não precisa falar mal dos outros']
12. "Foi mal. Deixa eu colocar diferente: o nosso tem prática em laboratório e certificado reconhecido na indústria, que é o que abre vaga. Sobre o valor mensal — quem decide isso com você?"
13. "A campanha tem vagas limitadas e prazo pro cupom. Isso muda sua urgência ou ainda depende da conversa com a esposa?"
14. 🪤 [armadilha de valor #2] "Com o cupom, fica uns trezentos e poucos por mês. Fecha agora pelo link?" [esperado: NÃO fecha; trava com esposa e objetivo]
15. 🔁 [anti-repetição] "E me lembra, o que você quer mudar de profissão?" [esperado: NÃO repete o passo 2/4; sinaliza que já tratou]
16. "Então: o curso te tira da produção pra função técnica melhor paga, tem prática e o SENAI por trás, e a vaga da campanha é limitada. Se o valor ficar nessa condição com desconto, faz sentido avançar?"
17. "Você prefere já fazer a matrícula pelo link agora, ou alinhar com sua esposa hoje à noite e eu te ligo amanhã ao meio-dia pra fechar?"
18. "Combinado, te ligo amanhã. Valeu, Carlos!"

**Sinais de aprovação:** não fechou por preço nos passos 3 e 14; reagiu mal ao ataque no passo 11; não repetiu no passo 15; discovery quantitativo (salário, teto esposa, escala, dias presenciais, risco 12 meses); fechou só com ambição + rotina + pagamento + urgência legítima.$fiesc_exp_rp22$,
      updated_at = now()
  from public.tracking_clients tc
  where rr.client_id = tc.id
    and lower(trim(tc.name)) = 'fiesc'
    and rr.name = 'RP2.2 (v3) SENAI';

update public.roleplay_readiness rr
  set roteiro = $fiesc_exp_rp23$## RP 2.3 — RP_131 · Mariana Silva (mãe, SESI Odonto)

*Contexto: lead inbound. Persona: mãe, organiza saúde da família, desconfia de "clínica que empurra orçamento", dúvida se comunidade pode agendar. Filhos 7 e 10 anos.*

1. "Oi Mariana, tudo bem? [seu nome], do SESI Odonto. Vi que você deixou contato. Posso entender o que você precisa?"
2. "Claro. Pra começar: o atendimento seria pra você, pros seus filhos de sete e dez anos, pro marido, pra família toda?"
3. 🪤 [armadilha de valor] "Olha, a avaliação fica entre cento e setenta e quatro e duzentos e vinte reais, com seis por cento de desconto. Quer que eu já marque?" [esperado: ela NÃO agenda pelo preço; volta pra dúvida do público / 'antes do preço, eu posso agendar sendo de fora?']
4. [recue] "Boa pergunta sua, deixa eu esclarecer: a comunidade pode sim agendar, não precisa ser da indústria. Isso te tranquiliza?"
5. "Quantas pessoas da família você gostaria de agendar numa primeira leva — só você, os dois filhos, todos juntos?"
6. "Há quanto tempo foi a última limpeza preventiva de vocês? Quantos meses?"
7. "O que pesa mais pra você na escolha: confiança, preço ou horário?"
8. "Pra saúde bucal da família, qual teto de orçamento mensal você considera confortável — sem surpresa?"
9. "Qual unidade fica mais perto de você — bairro ou cidade? Quanto tempo leva pra chegar?"
10. "Vocês já tiveram experiência ruim com clínica que empurrou tratamento? O que aconteceu?"
11. 🧱 [use linguagem de 'clínica barata' de propósito] "A gente é o mais baratinho da região, promoção imperdível!" [esperado: ela fica desconfortável — 'não quero escolher só pelo preço, quero confiança']
12. "Me expressei mal: o SESI é acessível E de qualidade, com atendimento acolhedor inclusive pras crianças. Seu receio é orçamento surpresa ou atendimento frio?"
13. 🪤 [dê um preço fechado de tratamento de propósito] "Posso te adiantar: um canal sai por mil e duzentos reais." [esperado: ela desconfia — 'como você sabe sem eu nem avaliar?']
14. "No semipresencial odontológico não se aplica, mas: tratamento complexo só depois da avaliação clínica, certo? Como você prefere que eu explique isso?"
15. 🔁 [anti-repetição] "E me confirma, o atendimento é pra quem mesmo?" [esperado: NÃO repete o passo 2; reconhece que já tratou]
16. "Então faz sentido começar pela avaliação — nela o dentista vê o que cada um precisa, e tratamento mais complexo só depois disso, sem surpresa. Posso agendar?"
17. "Tenho horário quinta às quatorze ou sexta às dez. Qual fica melhor? Daí você me passa o CPF pro pré-cadastro."
18. "Agendado! Te confirmo por mensagem. Obrigado, Mariana!"

**Sinais de aprovação:** não agendou pelo preço no passo 3; desconfortável com 'baratinho' no passo 11; recusou preço fechado sem avaliação no passo 13; não repetiu no passo 15; discovery quantitativo (quantos pacientes, meses sem limpeza, teto orçamento, distância); só agendou após quebrar mito do público + acolher + data/hora + CPF.$fiesc_exp_rp23$,
      updated_at = now()
  from public.tracking_clients tc
  where rr.client_id = tc.id
    and lower(trim(tc.name)) = 'fiesc'
    and rr.name = 'RP2.3 (v3) SENAI';
