# O que coletar do cliente para ter roleplays perfeitos

> Levantamento de 2026-09-28. Cruza os aprendizados do lab do small-mvp (skill roleplay-lab, auditorias FIESC de 13/09, 21/09, 26–28/09), o código do backend (`backend-naturalidade`, commit 2836252f, pós-PR #76) e a facility (dossiê do comprador, `supabase/functions/_shared/dossier.ts`).
> Baseado em leitura de código e relatórios — **não houve chamada nova para confirmar**.

---

## 1. Resumo

- O conteúdo que precisamos do cliente está mapeado. Comparado com a primeira versão da lista, entram **6 informações novas**, saem 2 pedidos que a API não usa (clone de voz e abertura da ligação) e 2 são refeitos (falas de exemplo e limites do comprador).
- **Regra geral:** o material tem que vir **do ponto de vista do comprador**. Material do vendedor (pitch, apresentação comercial, dados de CRM) vazou para a boca do comprador na auditoria de 13/09. A rodada que funcionou (roleplays 122–125, 27/09) usou textos do comprador, com aprofundamento por dor e sem números inventados.
- **Contexto e oferta não entram no prompt do comprador.** Eles só alimentam a IA que gera a persona e o conteúdo das etapas (`prompt_builder/shared/sections.py:752-756`). Na chamada, o comprador recebe persona, dores, conhecimento da etapa, objeções, dificuldade e guardrails.
- **Maior risco:** a coleta não resolve tudo sozinha. Fatos e números do cliente só chegam ao comprador se a facility **sobrescrever o conhecimento por etapa**, que o backend gera por IA e no qual inventa números (ver §4).

---

## 2. Lista de coleta (versão final)

Legenda da origem: **Cliente** = o cliente fornece · **Catálogo** = nós escolhemos de uma lista pré-cadastrada · **Nós** = escrevemos a partir do que o cliente disse.

### 2.1 Como é a venda
| Coletar | Origem | Onde entra | Por quê |
|---|---|---|---|
| Etapas reais da venda (ex.: gatekeeper → prospecção → diagnóstico → proposta) | Cliente | playbook, até **6 blocos por tipo de chamada** | Estrutura dos roleplays |
| Em que etapa pode apresentar produto | Cliente | `playbook_call_type.pain_offer_stage` (discovery / negotiation) | O módulo de oferta cobrava pitch em prospecção (S-02/X-4) |
| Tipo de cada ligação: fria, já teve contato, tem interesse, gatekeeper, proposta, cliente | Cliente → Catálogo | `call_context_type` (slug) → "# Seu objetivo nesta ligação" | Com o tipo errado, o comprador presumia quem ligava |
| **Canal: ligação ou reunião presencial** *(novo)* | Cliente | tipo de chamada | Retorno de visita cadastrado como ligação fria e reunião presencial rodando como ligação falharam no lab |
| **Metodologia por tipo de chamada** *(novo)* | Cliente → Catálogo | metodologia | SPIN aplicado à triagem de gatekeeper deu errado |
| **Um público por contexto** (prefeitura ≠ indústria) *(novo)* | Nós | 1 contexto por público | Contexto com dois públicos gerou objeções para o público errado (N-10) |

### 2.2 Portfólio, pelo lado do problema
| Coletar | Onde entra | Limite |
|---|---|---|
| Por produto: nome, descrição, problema que resolve, benefícios | `offer_products` | nome único por oferta, até 255 caracteres. **Nunca chega ao comprador** |
| **Faixa de preço** *(novo)* | `offer_products.pricing_summary` | vai só para o feedback de oferta |
| Condições que o vendedor precisa saber (carga horária, modalidade, gratuidade, financiamento) | oferta e documentos | documentos: **4.000 caracteres cada, 12.000 no total**, só para o feedback |

### 2.3 Dores × produtos
| Coletar | Onde entra | Limite |
|---|---|---|
| Dores reais, com causa e consequência | `offer_pains` | título até 255 caracteres, único por oferta |
| **Impacto de cada dor em número real** *(novo)* | `offer_pains.quantified_impact` → "# Suas Dores" | se ficar vazio, a IA inventa |
| Qual produto resolve cada dor | `offer_pains.offer_product_id` | **1 produto por dor**: pedir o principal |

Pedir a dor **como fato, nunca como fala**. Texto escrito como citação ("No seu caso: sente que…", "versão oficial") foi lido em voz alta.

### 2.4 Um comprador concreto por roleplay
| Coletar | Origem | Onde entra |
|---|---|---|
| Nome fictício, cargo, área | Cliente | persona (`name`, `job_title`, `department`) |
| Gênero | Cliente → Catálogo | concordância em "# Como você fala" e sorteio da voz |
| **Faixa etária** *(novo)* | Cliente → Catálogo | `age_group_id`: a voz é sorteada por gênero **e idade** |
| Empresa ou órgão: nome, porte, setor, município | Cliente | `persona_company` → "# Ambiente". **Sem dado de CRM do vendedor** (X-6) |
| Como cada dor aparece para ele e em que camada: fala logo / só se perguntado / esconde | Cliente | `persona_pains.reveal_level` (surface / probed / hidden) |
| Postura diante do tipo de solução | Cliente | `buyer_product_stance`, **recusado se citar nome de produto** |
| O que já sabe quando atende | Cliente | conhecimento prévio (ver §4) |
| Temperamento e senioridade | Cliente descreve → **Catálogo** | `communication_style_id`, `seniority_id` |
| Expressões e jeito de falar | Cliente | `persona_prompt`, **só frases de moldura** (ver §3) |

**Garantir que a persona bate com o roleplay:** um roleplay escrito para "sócio" ganhou um diretor sem sócio (N-5).

### 2.5 Fatos e números do comprador
- Orçamento, número de funcionários, rotatividade, prazos, calendário (ex.: ciclo orçamentário).
- **Indicadores que o cargo tem obrigação de saber** *(novo)*: a secretária de educação não sabia o índice de alfabetização da própria rede.
- **Datas relativas** ("no mês passado"), não absolutas.
- O que o cliente não souber **fica sem número**. O comprador diz que não tem o dado de cabeça (regra `NO_INVENTED_NUMBERS` do dossiê).

### 2.6 Objeções reais
| Coletar | Limite da API |
|---|---|
| Objeção + fala de exemplo + o que faria ceder (`to_give_in_if`) | título até 255 caracteres |
| **Por persona** | se a persona tem objeções próprias, **as gerais são ignoradas** (substituição, não soma) |
| **Nível de dificuldade de cada uma** | objeção sem nível **nunca entra** no prompt |
| Por etapa | **no máximo 3 por chamada** (na chamada inteira, ~1 por grupo de etapa) |

### 2.7 Processo de decisão (essencial em B2G)
- Quem decide, quem influencia, quem barra (secretário, prefeito, jurídico, RH).
- Como a compra acontece: licitação, dispensa, adesão a ata, termo de cooperação.
- Gatekeeper: quem atende, o que filtra, o que faz a ligação passar, **nome da empresa ou do gabinete** (a primeira fala do gatekeeper é "{empresa}, [saudação].").

### 2.8 O que o vendedor vê antes da ligação
- Os dados de CRM que o consultor tem na mão, **sem a dor escondida**.
- Hoje o briefing chegava vazio na tela (X-3; ver §5).

### 2.9 O que é "bom" para eles
- Por etapa: o que o gestor considera resposta boa e ruim → rubricas (`statement`, `description`, `tips`, `weight`).
- O que **não** cobrar em cada etapa.
- Pesos dos módulos de feedback (rubricas do vendedor, metodologia, objeções, linguagem, oferta): **decisão nossa**, configurável por organização, tipo de chamada e roleplay.

### 2.10 Limites do comprador
- O que ele nunca diria (temas políticos, promessas) e quando encerra a ligação.
- **Nós escrevemos o guardrail.** O cliente não tem CRUD, o nome do guardrail é único no banco inteiro, e apagar um contexto transforma os guardrails dele em globais.

### 2.11 Se tiverem: gravações ou transcrições reais
- É a melhor fonte para jeito de falar (2.4), objeções (2.6) e processo de decisão (2.7).

### O que não pedir
- **Prompt pronto** ou "como a IA deve se comportar": tom e comportamento vêm do código e do catálogo.
- **Como o comprador atende o telefone:** a primeira fala é fixa no código ("[saudação], quem fala?"). Só o nome da empresa, para o gatekeeper.
- **Clone de voz:** fora do fluxo da API. A voz vem do catálogo v2, e a voz da persona sobrescreve a do painel da ElevenLabs. Clonar é trabalho manual e caso a caso.

---

## 3. Achados sobre naturalidade que afetam a coleta

- Um perfil de voz escrito à mão por persona levou a naturalidade de **2,5 para 3,8** no juiz cego (27/09).
- **Falas de exemplo fixas viram fala decorada:** 7 de 60 saíram quase literais. Não há campo que sorteie exemplos por chamada, então elas vão no `persona_prompt`, poucas e **só de moldura** (reação, hesitação), nunca de conteúdo.
- **Regras positivas:** nomear o proibido atrai o proibido.
- **Não ancorar a ligação no assunto:** conteúdo que dizia "você abre a ligação já falando disso" fazia o comprador puxar o assunto antes de o vendedor se apresentar.

---

## 4. Onde o dado do cliente se perde

O conhecimento por etapa (`content_step`) é **todo gerado por IA**, para cada persona e etapa:
- 4 a 8 tópicos, e a geração **inventa números, nomes, datas e cifras** (`generate_content_step_knowledge.py:241-249`).
- Pode inventar "conversa anterior" nas primeiras falas por etapa (`:412`).
- O `buyer_prior_knowledge` do case setup **só entra se não existir conteúdo gerado** para a etapa (`sections.py:417-437`).
- Campos legados do case setup (`buyer_agent_first_messages`, `persona_profile`, `company_profile`, `buyer_agent_instructions`) **não são lidos** pelo prompt da chamada.

**Consequência:** fatos e números do cliente chegam ao comprador por três caminhos:
1. A facility reescreve o `step_knowledge` (o que o dossiê já faz no modo metodologia).
2. As dores com `quantified_impact` e `persona_specific_detail`.
3. A base de conhecimento, só para fatos curtos do comprador, com escopo de um roleplay. No lab o comprador usou o fato só quando perguntado, mas **o efeito na ligação real, que usa override de prompt, não foi provado**.

---

## 5. O que pode falhar mesmo com o material certo

Estado nos relatórios de 26–28/09, em HML:

| Problema | Estado |
|---|---|
| Chamada inteira em modo metodologia: só o conhecimento da **etapa Situação** chega ao comprador (X-1) | persistia em 26/09 |
| Briefing e instruções do vendedor chegam vazios (X-3) | persistia em 26/09 |
| Módulo de oferta cobra pitch em prospecção (X-4 / S-02) | PR #68 entrou em 27/09; **sem reteste visto** |
| Feedback inventa fatos e placeholders ("[percentual de ROI]") (S-03) | persistia |
| Guardrail de outra oferta aparece em outros roleplays (N-9 / X-7) | persistia |
| Dor escondida entregue cedo (X-10) | persistia |
| Idioma `pt-br` e LLM `gemini-3.5-flash-lite` marcados no código como nunca testados contra a API | não confirmado |

**PROD é mais pobre:** não tem as rotas de produtos e dores. As dores entram como texto no `persona_prompt`, sem camadas de revelação, e a persona fica sem voz. A coleta é a mesma, mas o resultado é inferior.

---

## 6. Limites da API em uma tabela

| Item | Limite |
|---|---|
| Objeções por chamada | 3 (chamada inteira: ~1 por grupo de etapa) |
| Objeção sem nível de dificuldade | nunca entra |
| Objeções da persona × gerais | as da persona substituem as gerais |
| Produtos por dor | 1 |
| Postura do comprador | recusada se citar nome de produto |
| Blocos raiz no playbook | 6 por tipo de chamada |
| Personas / empresas por geração em lote | 10 / 10 |
| Documentos da oferta | 4.000 caracteres cada, 12.000 no total, só para o feedback |
| Campos de texto curto | 255 caracteres (`String(255)`) |
| Nome de guardrail | único no banco inteiro |
| Persona não travada no roleplay | sorteada a cada chamada entre as do contexto |

---

## 7. Fontes

- Backend: `~/Desktop/Perfecting/backend-naturalidade`
  - `src/application/engines/role_plays_sessions/prompt_builder/shared/sections.py`
  - `prompt_builder/shared/queries.py`
  - `src/application/services/role_plays_sessions/pipeline_pre_call/agent_call_data_builder.py`
  - `src/data/main_db/models/offer_portfolio.py`
  - `src/data/main_db/models/role_plays.py`
  - `src/core/prompts/prompts_repo/background_knowledge/generate_content_step_knowledge.py`
- small-mvp: `docs/api-*.md`, `docs/INTEGRACAO_GERADOR_EXTERNO_ROLEPLAYS.md`, `docs/auditoria-roleplays-fiesc.md`, `docs/auditoria-reteste-2026-09-21.md`
- Relatórios do lab: `.claude/skills/roleplay-lab/runs/` (2026-09-26-fiesc-prospeccao, 2026-09-26-fiesc-v2, 2026-09-27-naturalidade, 2026-09-28-warm-identidade)
- Facility: `supabase/functions/_shared/dossier.ts`
