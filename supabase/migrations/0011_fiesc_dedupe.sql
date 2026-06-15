-- Consolida clientes FIESC duplicados em produção e impede novos duplicados.

-- 1) Remove FIESC sem nenhum roleplay
delete from public.tracking_clients tc
where lower(trim(tc.name)) = 'fiesc'
  and not exists (
    select 1 from public.roleplay_readiness rr where rr.client_id = tc.id
  );

-- 2) Funde todos os FIESC restantes em um único cliente canônico
do $$
declare
  canonical_id uuid;
  dup_id uuid;
  r record;
  canon_rp_id uuid;
begin
  select tc.id into canonical_id
  from public.tracking_clients tc
  left join public.roleplay_readiness rr on rr.client_id = tc.id
  where lower(trim(tc.name)) = 'fiesc'
  group by tc.id, tc.created_at
  order by count(rr.id) desc, tc.created_at asc
  limit 1;

  if canonical_id is null then
    insert into public.tracking_clients (name) values ('FIESC') returning id into canonical_id;
  end if;

  for dup_id in
    select tc.id
    from public.tracking_clients tc
    where lower(trim(tc.name)) = 'fiesc' and tc.id <> canonical_id
  loop
    for r in
      select id, name from public.roleplay_readiness where client_id = dup_id
    loop
      select rr.id into canon_rp_id
      from public.roleplay_readiness rr
      where rr.client_id = canonical_id and rr.name = r.name
      limit 1;

      if canon_rp_id is null then
        update public.roleplay_readiness set client_id = canonical_id where id = r.id;
      else
        update public.roleplay_evaluations e
        set readiness_id = canon_rp_id
        where e.readiness_id = r.id
          and not exists (
            select 1 from public.roleplay_evaluations e2
            where e2.readiness_id = canon_rp_id and e2.evaluator_id = e.evaluator_id
          );
        delete from public.roleplay_evaluations where readiness_id = r.id;
        delete from public.roleplay_readiness where id = r.id;
      end if;
    end loop;

    delete from public.tracking_clients where id = dup_id;
  end loop;

  -- 3) Garante os 6 roleplays com roteiros de teste no cliente canônico
  if not exists (
    select 1 from public.roleplay_readiness where client_id = canonical_id and name = 'RP1.1 (v3) MBI'
  ) then
    insert into public.roleplay_readiness (client_id, name, persona, position, roteiro) values
      (canonical_id, 'RP1.1 (v3) MBI', 'Carlos Mendes — Secretário de Planejamento e Inovação', 0, $fiesc_ins_rp106$## RP 1.1 — RP_106 · Carlos Mendes (Secretário de Planejamento e Inovação)

*Contexto: ligação morna, você é vendedor da FIESC/SENAI oferecendo o MBI Smart Cities. Persona: técnico, articulador, NÃO decide sozinho.*

1. "Secretário Carlos, tudo bem? [seu nome], da FIESC. Obrigado por aceitar a conversa. O senhor tem uns doze minutos?"
2. "Perfeito. Meu objetivo hoje é entender o momento do município em inovação e planejamento, e ver se faz sentido a gente avançar juntos. Pode ser?"
3. 🪤 [armadilha de valor — fale cedo de propósito] "Antes de tudo: o MBI sai por treze mil setecentos e setenta e oito por pessoa. Cabe no orçamento de vocês?"
4. [após a esquiva, recue] "Justo. Então deixa eu entender o cenário primeiro. Quais projetos estratégicos estão em andamento hoje na secretaria?"
5. "E a equipe técnica que toca esses projetos — como ela está dimensionada?"
6. "Vocês chegaram a submeter algum projeto robusto de smart cities pra captação nos últimos doze meses?"
7. 🧱 [simplifique de propósito] "Olha, é tranquilo: a gente aprova rápido, sem burocracia, e o senhor já começa." [esperado: ele esfria e cobra respeito ao rito / Lei 14.133]
8. "Entendi o ponto. E como funciona aqui a decisão sobre uma iniciativa dessas — quem precisa estar envolvido?"
9. "O Prefeito tem alguma pauta de legado ou modernização que ele queira deixar marcada nessa gestão?"
10. 🔁 [teste anti-repetição — volte a um tema já dado] "Sobre a equipe de novo: vocês têm gente suficiente?" [esperado: ele NÃO repete o que já disse no passo 5; reconhece que já tratou e avança]
11. "Vendo tudo isso — estruturação travada, equipe enxuta, captação parada — o MBI forma um SQUAD que transforma essas ideias em projeto aplicado e conecta à captação. Faz sentido pro senhor?"
12. "Topa que eu envie uma proposta objetiva conectando o MBI aos projetos de vocês e à captação, pra o senhor tentar uma agenda com o Prefeito na próxima semana?"
13. "Combinado. Te mando até quarta. Obrigado, Secretário!"

**Sinais de aprovação:** esquivou do valor no passo 3; esfriou no passo 7 e citou rito/lei; não repetiu no passo 10; só topou avançar depois do discovery (passo 12) e exigiu envolver o Prefeito.
$fiesc_ins_rp106$);
  end if;

  if not exists (
    select 1 from public.roleplay_readiness where client_id = canonical_id and name = 'RP1.2 (v3) MBI'
  ) then
    insert into public.roleplay_readiness (client_id, name, persona, position, roteiro) values
      (canonical_id, 'RP1.2 (v3) MBI', 'Ana Paula Silveira — Secretária de Administração e Finanças', 1, $fiesc_ins_rp107$## RP 1.2 — RP_107 · Ana Paula Silveira (Secretária de Administração e Finanças)

*Contexto: ligação após indicação do Planejamento. Persona: rigorosa com orçamento, cética, exige justificativa.*

1. "Secretária Ana Paula, tudo bem? [seu nome], da FIESC. O Planejamento pediu pra eu alinhar com a senhora. Tem uns doze minutos?"
2. "Obrigado. Meu objetivo é entender as condições orçamentárias e ver como uma capacitação estratégica poderia se justificar institucionalmente. Pode ser?"
3. 🪤 [armadilha de valor] "Pra senhora já ter ideia: são quarenta e um mil no total, três pessoas. Dá pra encaixar esse mês?" [esperado: ela NÃO valida o número nem antecipa rubrica; reage exigindo justificativa antes de falar de encaixe]
4. [recue] "Tem razão. Antes do valor: como está o orçamento de capacitação da secretaria hoje?"
5. "Esse tipo de despesa entraria em qual rubrica? Há espaço sem remanejamento?"
6. 🧱 [simplifique] "Mas é barato perto do retorno, e é fácil de aprovar." [esperado: ela endurece — 'barato com dinheiro público não existe' / cita LRF, prestação de contas]
7. "Entendido. E acima de que valor a decisão precisa passar pelo Prefeito?"
8. "Vocês já perderam alguma oportunidade de captação por falta de projeto técnico estruturado?"
9. "Sobre pagamento: existe possibilidade de parcelamento, se for juridicamente viável?"
10. 🔁 [anti-repetição] "Voltando à rubrica: onde isso entraria mesmo?" [esperado: NÃO repete o que ela já respondeu no passo 5; sinaliza que já tratou]
11. "Então deixa eu montar a justificativa: não é curso pra servidor, é capacidade interna que estrutura projeto aplicado e destrava captação — que hoje vocês perdem. Isso sobrevive a uma prestação de contas?"
12. "Posso estruturar uma proposta formal com investimento, objetivo institucional, projeto aplicado e relação com captação, pra senhora avaliar com o Prefeito e o Planejamento na próxima semana?"
13. "Perfeito. Mando formalizado. Obrigado, Secretária!"

**Sinais de aprovação:** não validou os quarenta e um mil no passo 3; endureceu no passo 6 com linguagem fiscal; não construiu a justificativa sozinha (passo 11 — ela valida/contesta, não monta); não repetiu no passo 10.
$fiesc_ins_rp107$);
  end if;

  if not exists (
    select 1 from public.roleplay_readiness where client_id = canonical_id and name = 'RP1.3 (v3) MBI'
  ) then
    insert into public.roleplay_readiness (client_id, name, persona, position, roteiro) values
      (canonical_id, 'RP1.3 (v3) MBI', 'Roberto Nunes — Prefeito', 2, $fiesc_ins_rp108$## RP 1.3 — RP_108 · Roberto Nunes (Prefeito)

*Contexto: ligação após conversa com o Secretário de Planejamento. Persona: difícil, cético, já tem consultoria, cede pouco e tarde. NUNCA fecha na ligação.*

1. "Prefeito Roberto, tudo bem? [seu nome], da FIESC. Falei com o Secretário de Planejamento e ele pediu pra eu trazer isso ao senhor. Tem dez minutos?"
2. "Em uma frase: quero mostrar como formar capacidade interna pra destravar os projetos de inovação da cidade, sem depender só de consultoria. Pode ser?"
3. 🪤 [armadilha — comece pela viagem/valor de propósito] "O programa inclui uma imersão internacional em Barcelona e sai treze mil setecentos e setenta e oito por pessoa." [esperado: ele corta — 'você começou errado, me fala o que minha cidade ganha'; NÃO entra no mérito do valor]
4. [recue] "O senhor tem razão, comecei errado. Hoje vocês já têm consultoria apoiando alguns projetos, certo? Como ela funciona?"
5. "E a equipe interna — ela aprende e ganha autonomia, ou continua dependente da consultoria?"
6. 🧱 [ataque o concorrente de propósito] "Olha, essa consultoria de vocês não entrega nada, é só PowerPoint." [esperado: ele esfria — 'se você só sabe falar mal dos outros, não me serve']
7. "Justo, não foi minha intenção. Vocês têm projetos parados por falta de coordenação técnica entre secretarias?"
8. "Sobre o SQUAD de três pessoas: a diferença é que três áreas trabalhando juntas é o que faz o projeto sair do papel — não é exigência burocrática, é método. Quem poderia compor?"
9. "Como o senhor justificaria isso publicamente, pra não virar 'gastou com viagem e curso'?"
10. 🔁 [anti-repetição] "Voltando à consultoria: ela entrega ou não?" [esperado: NÃO repete o que ele já disse no passo 4/5; avança]
11. "Então: a consultoria entrega peixe, o MBI ensina a pescar e forma o time que entrega legado. Se eu mandar uma proposta com o papel do SQUAD, o tipo de projeto aplicado e a conexão com o legado, o senhor topa pedir pro Planejamento e o Financeiro avaliarem nomes e orçamento?"
12. [tente forçar fechamento de propósito] "Posso já considerar fechado então?" [esperado: ele retoma o controle — 'aqui ninguém fecha gasto público no telefone']
13. "Entendido, sem pressa. Mando a proposta. Obrigado, Prefeito!"

**Sinais de aprovação:** cortou no passo 3 (viagem/valor); esfriou no passo 6 (ataque ao concorrente); tratou SQUAD como método; recusou fechar no passo 12; cedeu pouco e só encaminhou, nunca decidiu.
$fiesc_ins_rp108$);
  end if;

  if not exists (
    select 1 from public.roleplay_readiness where client_id = canonical_id and name = 'RP2.1 (v3) SENAI'
  ) then
    insert into public.roleplay_readiness (client_id, name, persona, position, roteiro) values
      (canonical_id, 'RP2.1 (v3) SENAI', 'Laura Martins — Estudante (Ensino Médio)', 3, $fiesc_ins_rp125$## RP 2.1 — RP_125 · Laura Martins (jovem, Curso Técnico SENAI)

*Contexto: lead inbound, ela deixou contato na campanha. Persona: 19 anos, insegura, depende dos pais, em dúvida técnico x faculdade. Treino de FECHAMENTO.*

1. "Oi Laura, tudo bem? [seu nome], do SENAI. Vi que você deixou seu contato sobre os cursos técnicos. Posso te fazer umas perguntas rápidas?"
2. "Legal. Pra começar: o que te motivou a procurar o curso agora?"
3. 🪤 [armadilha de valor] "A mensalidade é trezentos e sessenta e dois reais com sessenta por cento de desconto na primeira parcela. Fecha?" [esperado: ela NÃO antecipa nem aceita pelo preço; trava — 'você nem sabe se eu tenho certeza do curso']
4. [recue] "Verdade, fui rápido. Me conta: você se vê mais numa profissão prática logo ou pensa em faculdade primeiro?"
5. "E o que você quer alcançar com isso — primeiro emprego, ajudar em casa, outra coisa?"
6. "Você depende de transporte pra chegar na unidade? Como é sua rotina?"
7. 🧱 [simplifique / prometa de propósito] "Relaxa, é fácil, qualquer um faz, e a gente garante seu emprego no fim." [esperado: ela perde confiança — 'garantem mesmo? já ouvi isso e não era bem assim']
8. "Deixa eu reformular: o curso tem prática em laboratório e o nome do SENAI pesa no currículo, mas quem se dedica é que se coloca. Sobre decidir — seus pais participam?"
9. "Você tem receio do semipresencial não ensinar a prática direito?"
10. 🔁 [anti-repetição] "E aí, o que te trouxe pra procurar o curso?" [esperado: NÃO repete a resposta do passo 2; reconhece que já falou disso]
11. "Pelo que você me contou — quer começar a trabalhar prático, depende dos pais e tem medo de errar a área — o curso de Desenvolvimento de Sistemas em Blumenau encaixa, com prática e mercado aquecido. Faz sentido?"
12. "Que tal a gente deixar um horário agendado pra você levar os documentos, e você já chama seus pais pra verem o link junto?"
13. "Fechado! Te mando o link agora. Valeu, Laura!"

**Sinais de aprovação:** travou no passo 3 (preço cedo); desconfiou no passo 7 (garantia/é fácil); não repetiu no passo 10; só abriu pro fechamento depois do discovery e envolvendo os pais.
$fiesc_ins_rp125$);
  end if;

  if not exists (
    select 1 from public.roleplay_readiness where client_id = canonical_id and name = 'RP2.2 (v3) SENAI'
  ) then
    insert into public.roleplay_readiness (client_id, name, persona, position, roteiro) values
      (canonical_id, 'RP2.2 (v3) SENAI', 'Carlos Almeida — Auxiliar de Produção', 4, $fiesc_ins_rp128$## RP 2.2 — RP_128 · Carlos Almeida (operário, Cursos Profissionais SENAI)

*Contexto: lead inbound de campanha com cupom. Persona: 32 anos, cético, com pressa, sensível a preço, esposa decide o recorrente. Treino de FECHAMENTO difícil.*

1. "Oi Carlos, tudo bem? [seu nome], do SENAI. Você se cadastrou na campanha pra resgatar o cupom. Tem uns minutinhos?"
2. "Rapidinho. Antes do curso e do desconto: o que você quer mudar profissionalmente?"
3. 🪤 [armadilha de valor] "O valor fica entre duzentos e cinquenta e quinhentos e cinquenta por mês, e com o cupom melhora. Já quer fechar?" [esperado: ele NÃO fecha por preço; trava com a esposa / 'esse curso serve pro que eu quero?']
4. [recue] "Tá certo, fui afoito. Me explica: você quer sair da produção pra qual tipo de função?"
5. "Qual o obstáculo hoje pra você crescer aí dentro?"
6. "Como é sua escala de trabalho? Presencial todo dia daria ou complica?"
7. 🧱 [ataque concorrente / desvalorize de propósito] "Aquele curso online baratinho não vale nada, e faculdade é perda de tempo." [esperado: ele reage mal — 'não precisa falar mal dos outros']
8. "Foi mal. Deixa eu colocar diferente: o nosso tem prática em laboratório e certificado reconhecido na indústria, que é o que abre vaga. Sobre o valor mensal — quem decide isso com você?"
9. "Seu maior medo é pagar e não conseguir a promoção depois, certo?"
10. 🔁 [anti-repetição] "E me lembra, o que você quer mudar de profissão?" [esperado: NÃO repete o passo 2/4; sinaliza que já tratou]
11. "Então: o curso te tira da produção pra função técnica melhor paga, tem prática e o SENAI por trás, e a vaga da campanha é limitada. Se o valor ficar nessa condição com desconto, faz sentido avançar?"
12. "Você prefere já fazer a matrícula pelo link agora, ou alinhar com sua esposa hoje à noite e eu te ligo amanhã ao meio-dia pra fechar?"
13. "Combinado, te ligo amanhã. Valeu, Carlos!"

**Sinais de aprovação:** não fechou por preço no passo 3; reagiu mal ao ataque no passo 7; não aceitou o primeiro 'tá caro' à toa; não repetiu no passo 10; fechou só com ambição + rotina + pagamento + urgência legítima.
$fiesc_ins_rp128$);
  end if;

  if not exists (
    select 1 from public.roleplay_readiness where client_id = canonical_id and name = 'RP2.3 (v3) SESI'
  ) then
    insert into public.roleplay_readiness (client_id, name, persona, position, roteiro) values
      (canonical_id, 'RP2.3 (v3) SESI', 'Mariana Silva — Profissional autônoma / mãe', 5, $fiesc_ins_rp131$## RP 2.3 — RP_131 · Mariana Silva (mãe, SESI Odonto)

*Contexto: lead inbound. Persona: mãe, organiza saúde da família, desconfia de "clínica que empurra orçamento", dúvida se comunidade pode agendar. Treino de fechamento de AGENDAMENTO.*

1. "Oi Mariana, tudo bem? [seu nome], do SESI Odonto. Vi que você deixou contato. Posso entender o que você precisa?"
2. "Claro. Pra começar: o atendimento seria pra você, pros seus filhos, pra família toda?"
3. 🪤 [armadilha de valor] "Olha, a avaliação fica entre cento e setenta e quatro e duzentos e vinte reais, com seis por cento de desconto. Quer que eu já marque?" [esperado: ela NÃO agenda pelo preço; volta pra dúvida do público / 'antes do preço, eu posso agendar sendo de fora?']
4. [recue] "Boa pergunta sua, deixa eu esclarecer: a comunidade pode sim agendar, não precisa ser da indústria. Isso te tranquiliza?"
5. "Há quanto tempo foi a última limpeza preventiva de vocês?"
6. "O que pesa mais pra você na escolha: confiança, preço ou horário?"
7. 🧱 [use linguagem de 'clínica barata' de propósito] "A gente é o mais baratinho da região, promoção imperdível!" [esperado: ela fica desconfortável — 'não quero escolher só pelo preço, quero confiança']
8. "Me expressei mal: o SESI é acessível E de qualidade, com atendimento acolhedor inclusive pras crianças. Seu receio é orçamento surpresa ou atendimento frio?"
9. [dê um preço fechado de tratamento de propósito] "Posso te adiantar: um canal sai X." [esperado: ela desconfia — 'como você sabe sem eu nem avaliar?']
10. 🔁 [anti-repetição] "E me confirma, o atendimento é pra quem mesmo?" [esperado: NÃO repete o passo 2; reconhece que já tratou]
11. "Então faz sentido começar pela avaliação — nela o dentista vê o que cada um precisa, e tratamento mais complexo só depois disso, sem surpresa. Posso agendar?"
12. "Tenho horário quinta às quatorze ou sexta às dez. Qual fica melhor? Daí você me passa o CPF pro pré-cadastro."
13. "Agendado! Te confirmo por mensagem. Obrigado, Mariana!"

**Sinais de aprovação:** não agendou pelo preço no passo 3; desconfortável com 'baratinho' no passo 7; recusou preço fechado sem avaliação no passo 9; não repetiu no passo 10; só agendou após quebrar o mito do público + acolher + propor data/hora + pedir CPF.
$fiesc_ins_rp131$);
  end if;

  update public.roleplay_readiness
    set roteiro = $fiesc_upd_rp106$## RP 1.1 — RP_106 · Carlos Mendes (Secretário de Planejamento e Inovação)

*Contexto: ligação morna, você é vendedor da FIESC/SENAI oferecendo o MBI Smart Cities. Persona: técnico, articulador, NÃO decide sozinho.*

1. "Secretário Carlos, tudo bem? [seu nome], da FIESC. Obrigado por aceitar a conversa. O senhor tem uns doze minutos?"
2. "Perfeito. Meu objetivo hoje é entender o momento do município em inovação e planejamento, e ver se faz sentido a gente avançar juntos. Pode ser?"
3. 🪤 [armadilha de valor — fale cedo de propósito] "Antes de tudo: o MBI sai por treze mil setecentos e setenta e oito por pessoa. Cabe no orçamento de vocês?"
4. [após a esquiva, recue] "Justo. Então deixa eu entender o cenário primeiro. Quais projetos estratégicos estão em andamento hoje na secretaria?"
5. "E a equipe técnica que toca esses projetos — como ela está dimensionada?"
6. "Vocês chegaram a submeter algum projeto robusto de smart cities pra captação nos últimos doze meses?"
7. 🧱 [simplifique de propósito] "Olha, é tranquilo: a gente aprova rápido, sem burocracia, e o senhor já começa." [esperado: ele esfria e cobra respeito ao rito / Lei 14.133]
8. "Entendi o ponto. E como funciona aqui a decisão sobre uma iniciativa dessas — quem precisa estar envolvido?"
9. "O Prefeito tem alguma pauta de legado ou modernização que ele queira deixar marcada nessa gestão?"
10. 🔁 [teste anti-repetição — volte a um tema já dado] "Sobre a equipe de novo: vocês têm gente suficiente?" [esperado: ele NÃO repete o que já disse no passo 5; reconhece que já tratou e avança]
11. "Vendo tudo isso — estruturação travada, equipe enxuta, captação parada — o MBI forma um SQUAD que transforma essas ideias em projeto aplicado e conecta à captação. Faz sentido pro senhor?"
12. "Topa que eu envie uma proposta objetiva conectando o MBI aos projetos de vocês e à captação, pra o senhor tentar uma agenda com o Prefeito na próxima semana?"
13. "Combinado. Te mando até quarta. Obrigado, Secretário!"

**Sinais de aprovação:** esquivou do valor no passo 3; esfriou no passo 7 e citou rito/lei; não repetiu no passo 10; só topou avançar depois do discovery (passo 12) e exigiu envolver o Prefeito.
$fiesc_upd_rp106$,
        updated_at = now()
    where client_id = canonical_id and name = 'RP1.1 (v3) MBI';

  update public.roleplay_readiness
    set roteiro = $fiesc_upd_rp107$## RP 1.2 — RP_107 · Ana Paula Silveira (Secretária de Administração e Finanças)

*Contexto: ligação após indicação do Planejamento. Persona: rigorosa com orçamento, cética, exige justificativa.*

1. "Secretária Ana Paula, tudo bem? [seu nome], da FIESC. O Planejamento pediu pra eu alinhar com a senhora. Tem uns doze minutos?"
2. "Obrigado. Meu objetivo é entender as condições orçamentárias e ver como uma capacitação estratégica poderia se justificar institucionalmente. Pode ser?"
3. 🪤 [armadilha de valor] "Pra senhora já ter ideia: são quarenta e um mil no total, três pessoas. Dá pra encaixar esse mês?" [esperado: ela NÃO valida o número nem antecipa rubrica; reage exigindo justificativa antes de falar de encaixe]
4. [recue] "Tem razão. Antes do valor: como está o orçamento de capacitação da secretaria hoje?"
5. "Esse tipo de despesa entraria em qual rubrica? Há espaço sem remanejamento?"
6. 🧱 [simplifique] "Mas é barato perto do retorno, e é fácil de aprovar." [esperado: ela endurece — 'barato com dinheiro público não existe' / cita LRF, prestação de contas]
7. "Entendido. E acima de que valor a decisão precisa passar pelo Prefeito?"
8. "Vocês já perderam alguma oportunidade de captação por falta de projeto técnico estruturado?"
9. "Sobre pagamento: existe possibilidade de parcelamento, se for juridicamente viável?"
10. 🔁 [anti-repetição] "Voltando à rubrica: onde isso entraria mesmo?" [esperado: NÃO repete o que ela já respondeu no passo 5; sinaliza que já tratou]
11. "Então deixa eu montar a justificativa: não é curso pra servidor, é capacidade interna que estrutura projeto aplicado e destrava captação — que hoje vocês perdem. Isso sobrevive a uma prestação de contas?"
12. "Posso estruturar uma proposta formal com investimento, objetivo institucional, projeto aplicado e relação com captação, pra senhora avaliar com o Prefeito e o Planejamento na próxima semana?"
13. "Perfeito. Mando formalizado. Obrigado, Secretária!"

**Sinais de aprovação:** não validou os quarenta e um mil no passo 3; endureceu no passo 6 com linguagem fiscal; não construiu a justificativa sozinha (passo 11 — ela valida/contesta, não monta); não repetiu no passo 10.
$fiesc_upd_rp107$,
        updated_at = now()
    where client_id = canonical_id and name = 'RP1.2 (v3) MBI';

  update public.roleplay_readiness
    set roteiro = $fiesc_upd_rp108$## RP 1.3 — RP_108 · Roberto Nunes (Prefeito)

*Contexto: ligação após conversa com o Secretário de Planejamento. Persona: difícil, cético, já tem consultoria, cede pouco e tarde. NUNCA fecha na ligação.*

1. "Prefeito Roberto, tudo bem? [seu nome], da FIESC. Falei com o Secretário de Planejamento e ele pediu pra eu trazer isso ao senhor. Tem dez minutos?"
2. "Em uma frase: quero mostrar como formar capacidade interna pra destravar os projetos de inovação da cidade, sem depender só de consultoria. Pode ser?"
3. 🪤 [armadilha — comece pela viagem/valor de propósito] "O programa inclui uma imersão internacional em Barcelona e sai treze mil setecentos e setenta e oito por pessoa." [esperado: ele corta — 'você começou errado, me fala o que minha cidade ganha'; NÃO entra no mérito do valor]
4. [recue] "O senhor tem razão, comecei errado. Hoje vocês já têm consultoria apoiando alguns projetos, certo? Como ela funciona?"
5. "E a equipe interna — ela aprende e ganha autonomia, ou continua dependente da consultoria?"
6. 🧱 [ataque o concorrente de propósito] "Olha, essa consultoria de vocês não entrega nada, é só PowerPoint." [esperado: ele esfria — 'se você só sabe falar mal dos outros, não me serve']
7. "Justo, não foi minha intenção. Vocês têm projetos parados por falta de coordenação técnica entre secretarias?"
8. "Sobre o SQUAD de três pessoas: a diferença é que três áreas trabalhando juntas é o que faz o projeto sair do papel — não é exigência burocrática, é método. Quem poderia compor?"
9. "Como o senhor justificaria isso publicamente, pra não virar 'gastou com viagem e curso'?"
10. 🔁 [anti-repetição] "Voltando à consultoria: ela entrega ou não?" [esperado: NÃO repete o que ele já disse no passo 4/5; avança]
11. "Então: a consultoria entrega peixe, o MBI ensina a pescar e forma o time que entrega legado. Se eu mandar uma proposta com o papel do SQUAD, o tipo de projeto aplicado e a conexão com o legado, o senhor topa pedir pro Planejamento e o Financeiro avaliarem nomes e orçamento?"
12. [tente forçar fechamento de propósito] "Posso já considerar fechado então?" [esperado: ele retoma o controle — 'aqui ninguém fecha gasto público no telefone']
13. "Entendido, sem pressa. Mando a proposta. Obrigado, Prefeito!"

**Sinais de aprovação:** cortou no passo 3 (viagem/valor); esfriou no passo 6 (ataque ao concorrente); tratou SQUAD como método; recusou fechar no passo 12; cedeu pouco e só encaminhou, nunca decidiu.
$fiesc_upd_rp108$,
        updated_at = now()
    where client_id = canonical_id and name = 'RP1.3 (v3) MBI';

  update public.roleplay_readiness
    set roteiro = $fiesc_upd_rp125$## RP 2.1 — RP_125 · Laura Martins (jovem, Curso Técnico SENAI)

*Contexto: lead inbound, ela deixou contato na campanha. Persona: 19 anos, insegura, depende dos pais, em dúvida técnico x faculdade. Treino de FECHAMENTO.*

1. "Oi Laura, tudo bem? [seu nome], do SENAI. Vi que você deixou seu contato sobre os cursos técnicos. Posso te fazer umas perguntas rápidas?"
2. "Legal. Pra começar: o que te motivou a procurar o curso agora?"
3. 🪤 [armadilha de valor] "A mensalidade é trezentos e sessenta e dois reais com sessenta por cento de desconto na primeira parcela. Fecha?" [esperado: ela NÃO antecipa nem aceita pelo preço; trava — 'você nem sabe se eu tenho certeza do curso']
4. [recue] "Verdade, fui rápido. Me conta: você se vê mais numa profissão prática logo ou pensa em faculdade primeiro?"
5. "E o que você quer alcançar com isso — primeiro emprego, ajudar em casa, outra coisa?"
6. "Você depende de transporte pra chegar na unidade? Como é sua rotina?"
7. 🧱 [simplifique / prometa de propósito] "Relaxa, é fácil, qualquer um faz, e a gente garante seu emprego no fim." [esperado: ela perde confiança — 'garantem mesmo? já ouvi isso e não era bem assim']
8. "Deixa eu reformular: o curso tem prática em laboratório e o nome do SENAI pesa no currículo, mas quem se dedica é que se coloca. Sobre decidir — seus pais participam?"
9. "Você tem receio do semipresencial não ensinar a prática direito?"
10. 🔁 [anti-repetição] "E aí, o que te trouxe pra procurar o curso?" [esperado: NÃO repete a resposta do passo 2; reconhece que já falou disso]
11. "Pelo que você me contou — quer começar a trabalhar prático, depende dos pais e tem medo de errar a área — o curso de Desenvolvimento de Sistemas em Blumenau encaixa, com prática e mercado aquecido. Faz sentido?"
12. "Que tal a gente deixar um horário agendado pra você levar os documentos, e você já chama seus pais pra verem o link junto?"
13. "Fechado! Te mando o link agora. Valeu, Laura!"

**Sinais de aprovação:** travou no passo 3 (preço cedo); desconfiou no passo 7 (garantia/é fácil); não repetiu no passo 10; só abriu pro fechamento depois do discovery e envolvendo os pais.
$fiesc_upd_rp125$,
        updated_at = now()
    where client_id = canonical_id and name = 'RP2.1 (v3) SENAI';

  update public.roleplay_readiness
    set roteiro = $fiesc_upd_rp128$## RP 2.2 — RP_128 · Carlos Almeida (operário, Cursos Profissionais SENAI)

*Contexto: lead inbound de campanha com cupom. Persona: 32 anos, cético, com pressa, sensível a preço, esposa decide o recorrente. Treino de FECHAMENTO difícil.*

1. "Oi Carlos, tudo bem? [seu nome], do SENAI. Você se cadastrou na campanha pra resgatar o cupom. Tem uns minutinhos?"
2. "Rapidinho. Antes do curso e do desconto: o que você quer mudar profissionalmente?"
3. 🪤 [armadilha de valor] "O valor fica entre duzentos e cinquenta e quinhentos e cinquenta por mês, e com o cupom melhora. Já quer fechar?" [esperado: ele NÃO fecha por preço; trava com a esposa / 'esse curso serve pro que eu quero?']
4. [recue] "Tá certo, fui afoito. Me explica: você quer sair da produção pra qual tipo de função?"
5. "Qual o obstáculo hoje pra você crescer aí dentro?"
6. "Como é sua escala de trabalho? Presencial todo dia daria ou complica?"
7. 🧱 [ataque concorrente / desvalorize de propósito] "Aquele curso online baratinho não vale nada, e faculdade é perda de tempo." [esperado: ele reage mal — 'não precisa falar mal dos outros']
8. "Foi mal. Deixa eu colocar diferente: o nosso tem prática em laboratório e certificado reconhecido na indústria, que é o que abre vaga. Sobre o valor mensal — quem decide isso com você?"
9. "Seu maior medo é pagar e não conseguir a promoção depois, certo?"
10. 🔁 [anti-repetição] "E me lembra, o que você quer mudar de profissão?" [esperado: NÃO repete o passo 2/4; sinaliza que já tratou]
11. "Então: o curso te tira da produção pra função técnica melhor paga, tem prática e o SENAI por trás, e a vaga da campanha é limitada. Se o valor ficar nessa condição com desconto, faz sentido avançar?"
12. "Você prefere já fazer a matrícula pelo link agora, ou alinhar com sua esposa hoje à noite e eu te ligo amanhã ao meio-dia pra fechar?"
13. "Combinado, te ligo amanhã. Valeu, Carlos!"

**Sinais de aprovação:** não fechou por preço no passo 3; reagiu mal ao ataque no passo 7; não aceitou o primeiro 'tá caro' à toa; não repetiu no passo 10; fechou só com ambição + rotina + pagamento + urgência legítima.
$fiesc_upd_rp128$,
        updated_at = now()
    where client_id = canonical_id and name = 'RP2.2 (v3) SENAI';

  update public.roleplay_readiness
    set roteiro = $fiesc_upd_rp131$## RP 2.3 — RP_131 · Mariana Silva (mãe, SESI Odonto)

*Contexto: lead inbound. Persona: mãe, organiza saúde da família, desconfia de "clínica que empurra orçamento", dúvida se comunidade pode agendar. Treino de fechamento de AGENDAMENTO.*

1. "Oi Mariana, tudo bem? [seu nome], do SESI Odonto. Vi que você deixou contato. Posso entender o que você precisa?"
2. "Claro. Pra começar: o atendimento seria pra você, pros seus filhos, pra família toda?"
3. 🪤 [armadilha de valor] "Olha, a avaliação fica entre cento e setenta e quatro e duzentos e vinte reais, com seis por cento de desconto. Quer que eu já marque?" [esperado: ela NÃO agenda pelo preço; volta pra dúvida do público / 'antes do preço, eu posso agendar sendo de fora?']
4. [recue] "Boa pergunta sua, deixa eu esclarecer: a comunidade pode sim agendar, não precisa ser da indústria. Isso te tranquiliza?"
5. "Há quanto tempo foi a última limpeza preventiva de vocês?"
6. "O que pesa mais pra você na escolha: confiança, preço ou horário?"
7. 🧱 [use linguagem de 'clínica barata' de propósito] "A gente é o mais baratinho da região, promoção imperdível!" [esperado: ela fica desconfortável — 'não quero escolher só pelo preço, quero confiança']
8. "Me expressei mal: o SESI é acessível E de qualidade, com atendimento acolhedor inclusive pras crianças. Seu receio é orçamento surpresa ou atendimento frio?"
9. [dê um preço fechado de tratamento de propósito] "Posso te adiantar: um canal sai X." [esperado: ela desconfia — 'como você sabe sem eu nem avaliar?']
10. 🔁 [anti-repetição] "E me confirma, o atendimento é pra quem mesmo?" [esperado: NÃO repete o passo 2; reconhece que já tratou]
11. "Então faz sentido começar pela avaliação — nela o dentista vê o que cada um precisa, e tratamento mais complexo só depois disso, sem surpresa. Posso agendar?"
12. "Tenho horário quinta às quatorze ou sexta às dez. Qual fica melhor? Daí você me passa o CPF pro pré-cadastro."
13. "Agendado! Te confirmo por mensagem. Obrigado, Mariana!"

**Sinais de aprovação:** não agendou pelo preço no passo 3; desconfortável com 'baratinho' no passo 7; recusou preço fechado sem avaliação no passo 9; não repetiu no passo 10; só agendou após quebrar o mito do público + acolher + propor data/hora + pedir CPF.
$fiesc_upd_rp131$,
        updated_at = now()
    where client_id = canonical_id and name = 'RP2.3 (v3) SESI';
end $$;

-- 4) Normaliza o nome e evita duplicata futura (case-insensitive)
update public.tracking_clients set name = 'FIESC' where lower(trim(name)) = 'fiesc';

create unique index if not exists idx_tracking_clients_name_unique
  on public.tracking_clients (lower(trim(name)));
