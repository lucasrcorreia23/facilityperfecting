# JSON de estruturação — Geração de Roleplays (Facility)

Documentação do contrato JSON usado pelo **Facility** na etapa de **Criação**: a partir de material bruto (texto, PDF, site, playbook, etc.), a IA extrai e devolve um JSON estruturado que preenche o formulário do roleplay.

Este documento é o handoff para quem for gerar / consumir o mesmo formato fora do Facility.

---

## 1. Contexto do fluxo

```
Material bruto (colar texto / PDF / DOCX / URL)
        │
        ▼
Edge Function `process-import`  (Claude + JSON Schema)
        │
        ▼
JSON estruturado (este contrato)
        │
        ▼
Formulário da tela Criação (editável pelo usuário)
        │
        ▼
Salvar rascunho → Biblioteca → Exportar para conta Perfecting
```

| Item | Valor |
|---|---|
| Edge Function | `supabase/functions/process-import` |
| Schema TypeScript | `ProcessImportResult` em `app/lib/types.ts` |
| Tela | `/criacao` |
| Modo | Não-interativo: a IA **nunca pergunta** — sempre devolve o JSON completo |
| Formato de saída | JSON estrito (`additionalProperties: false`, todos os campos obrigatórios) |

---

## 2. Os grupos da Perfecting

O JSON espelha a organização usada na Perfecting para montar um roleplay:

| Grupo | O que é | Campos no JSON |
|---|---|---|
| **Grupo 1 – Oferta** | Produto/serviço treinado | `oferta_nome` (+ material bruto vira `general_description` no save) |
| **Grupo 2 – Contexto / público-alvo** | De quem saem as personas | `perfil`, `personas_variacao` |
| **Grupo 2b – Conteúdo do contexto** | O que o comprador objeta e as regras que ele segue | `objecoes`, `guardrails` |
| **Grupo 3 – Cenário / comportamento** | Como a persona se comporta na call | `call_context_slug`, `dificuldade`, `cenario_instrucoes` |
| **Grupo 4 – Rubricas de treino** | O que o vendedor deve treinar | `objetivo`, `habilidades` |

Além disso, o campo `lacunas` lista o que ainda falta no material para um roleplay de alta qualidade (não vai para a Perfecting; serve de checklist no Facility).

### 2.1 ⚠️ O modo playbook usa só os grupos 1 e 2

O roleplay pode ser gerado de dois jeitos, e o usuário escolhe **depois** do processamento:

| Modo | O que acontece | Campos usados |
|---|---|---|
| **Playbook** | Cada etapa (`PlaybookCallType`) vira um roleplay. Tipo de chamada, comportamento e rubricas vêm das etapas | `oferta_nome`, `perfil`, `personas_variacao`, `objecoes`, `guardrails` — **os grupos 3 e 4 são ignorados** |
| **Metodologia** | Um roleplay só, montado a partir do material | todos |

No modo playbook o `implement-playbook` lê de `scenario` apenas `playbook_id`, `persona_count`, `persona_instructions` e `fixed_persona_call_type_ids`; `call_context_slug`, `dificuldade`, `cenario_instrucoes`, `objetivo` e `habilidades` são gravados no rascunho mas nunca lidos. Por isso o gerador do JSON **não deve inventar** cenário/rubricas sem base no material — e as `lacunas` devem marcar no `grupo` o que só vale fora do playbook.

---

## 3. Schema JSON completo

Todos os campos são **obrigatórios**. Não enviar propriedades extras.

```json
{
  "oferta_nome": "string",
  "perfil": "string",
  "personas_variacao": "string",
  "objecoes": [
    {
      "titulo": "string",
      "tipo": "preco",
      "fala_exemplo": "string",
      "detalhes": "string",
      "ceder_se": "string"
    }
  ],
  "guardrails": [
    {
      "nome": "string",
      "instrucao": "string"
    }
  ],
  "call_context_slug": "discovery",
  "dificuldade": "medium",
  "cenario_instrucoes": "string",
  "objetivo": "string",
  "habilidades": "string",
  "lacunas": [
    {
      "item": "string",
      "severidade": "critico",
      "grupo": "string"
    }
  ]
}
```

### 3.1 Enums

**`dificuldade`**

| Valor | Uso |
|---|---|
| `easy` | Persona colaborativa, poucas objeções, cenário introdutório |
| `medium` | Resistência moderada, testes de fogo equilibrados |
| `hard` | Persona exigente, várias objeções, cenário avançado |

**`lacunas[].severidade`**

| Valor | Significado |
|---|---|
| `critico` | Impede um roleplay bom; precisa ser preenchido |
| `importante` | Melhora muito a qualidade; recomendado preencher |
| `opcional` | Nice-to-have |

**`call_context_slug`**

Deve ser **exatamente** um slug válido da Perfecting (lista dinâmica via API). Exemplos comuns:

- `cold-call`
- `discovery`
- `demo`
- `negociacao`
- `fechamento`

No Facility, a lista real é injetada no prompt em tempo de execução (`CALL CONTEXTS DISPONÍVEIS`). Se o slug não existir, o export quebra.

---

## 4. Campos em detalhe

### `oferta_nome` (string)

Nome curto da oferta/produto.

- Ex.: `"RD Station Marketing"`, `"Curso Técnico SENAI"`, `"MBI Prefeitura"`
- No save vira `offers.offer_name` e o título do draft.

### `perfil` (string, markdown)

**O campo mais importante — é o único usado nos dois modos.**

Não é o retrato de uma pessoa: vira `aditional_instructions` do `POST /context/generate`, ou seja, é a instrução com que a Perfecting monta o **contexto** — e é do contexto que saem **uma ou várias personas**. Quanto mais raso, mais genéricas e parecidas as personas.

A Perfecting expande este texto em 13 campos obrigatórios do contexto. Cubra, com subtítulos, tudo que o material permitir:

| Dimensão | Vira, na Perfecting |
|---|---|
| Público-alvo (empresa/segmento se B2B; pessoa se B2C) | `target_description` |
| Gatilhos de urgência | `compelling_events` |
| Prioridades e objetivos | `strategic_priorities` |
| Dores mensuráveis (números, prazos, custos) | `quantifiable_pain_points` |
| Estado futuro desejado | `desired_future_state` |
| O que motiva a compra | `primary_value_drivers` |
| Processo de decisão (quem decide, etapas, prazo) | `typical_decision_making_process` |
| Aversão a risco | `risk_aversion_level` |
| Objeções e receios (frases reais) | `persona_objections_and_concerns` |
| Consciência do problema | `persona_awareness_of_the_problem` |
| Consciência das soluções | `persona_awareness_of_the_solutions` |
| O que usam hoje e por que não basta | `persona_existing_solutions` |

Se o material indicar cargos ou áreas típicas, cite-os como **exemplos do espectro** — não feche numa pessoa só, porque as personas nascem daqui.

Quando precisar inferir algo que não está no material, marque com `(Hipótese Assumida)`.

### `personas_variacao` (string)

Como as personas devem **variar entre si** quando o usuário pedir mais de uma: cargos e áreas diferentes, senioridade, estilos de comunicação, graus de consciência e de resistência.

Vira `scenario.persona_instructions` no rascunho e, no envio, o `additional_instructions` do `GET /persona/generate_batch/sse` — o grounding de todo o lote de personas. Só o que o material sustentar; **string vazia** quando não houver base. Sem efeito quando o usuário pede 1 persona só.

### `objecoes` (array) e `guardrails` (array)

**Usados nos dois modos.** São criados **no contexto** da Perfecting
(`POST /context_{id}/objections` e `/guardrails`), e todo roleplay daquele `context_id`
os herda — então valem para todas as etapas do playbook de uma vez, sem competir com o
conteúdo que cada etapa gera.

Existem porque a implementação gera objeções sozinha, mas genéricas. Quando o material
traz a fala real do comprador, mandar a do cliente é o que separa um roleplay verossímil
de um plausível.

Cada objeção:

| Campo | Vira, na API | Observação |
|---|---|---|
| `titulo` | `title` | Também é a chave de deduplicação no reenvio |
| `tipo` | `objection_type_id` | Slug de `/objection_types`, injetado no prompt como enum |
| `fala_exemplo` | `description` | A frase do comprador — transcreva do material |
| `detalhes` | `details` | Contexto: quando aparece, o que ele teme |
| `ceder_se` | `to_give_in_if` | **Crítico.** Sem isto o comprador repete a objeção até o fim e o treino não tem desfecho |

Cada guardrail tem `nome` (→ `name`) e `instrucao` (→ `prompt`), a regra escrita em
segunda pessoa, dirigida ao comprador simulado.

Na tela de Criação os dois são **editáveis antes do envio** — é conteúdo que vai direto
para a conta do cliente. A aplicação é idempotente (casa por título/nome), então reenvio
e contexto reusado não duplicam; e uma falha aqui vira aviso, nunca derruba o envio.

### `call_context_slug` (string, enum)

Tipo de chamada mais adequado ao cenário (ver enums acima).

### `dificuldade` (string, enum)

`easy` | `medium` | `hard` — coerente com o nível de resistência da persona e a complexidade do cenário.

### `cenario_instrucoes` (string, markdown)

**Grupo 3 – Comportamento do cenário.** Alimenta as instruções do case setup na Perfecting.

Deve descrever:

- Como a persona se comporta durante a conversa
- Testes de fogo / objeções que ela aplica (frases reais quando houver)
- Critério de fechamento / êxito da conversa
- Momento da jornada, urgência, como o lead chegou (quando relevante)

**Regra importante:** se o material já trouxer instruções ou prompts de comportamento prontos, **preserve na íntegra** (transcreva, não resuma).

### `objetivo` (string)

**Grupo 4.** Objetivo de treino do roleplay — o que o vendedor precisa praticar/atingir.

- Ex.: `"Qualificar dor e fechar um próximo passo com critérios claros"`

### `habilidades` (string)

**Grupo 4.** Habilidades de venda a treinar (texto livre).

- Ex.: `"Discovery, SPICED, Contorno de objeções de preço"`

### `lacunas` (array)

Lista de informações faltantes. Cada item:

| Campo | Tipo | Descrição |
|---|---|---|
| `item` | string | O que falta |
| `severidade` | enum | `critico` \| `importante` \| `opcional` |
| `grupo` | string | Agrupamento livre (ex.: `"Oferta"`, `"Persona"`, `"Cenário"`, `"Objeções"`) |

Pode ser array vazio `[]` se o material estiver completo.

---

## 5. Mapeamento Facility → armazenamento → Perfecting

Quando o usuário salva o rascunho na Criação:

| Campo JSON | Onde fica no Facility | Uso no export Perfecting |
|---|---|---|
| `oferta_nome` | `offers.offer_name` | Nome da offer |
| material bruto (input) | `offers.general_description` | Texto-base da offer |
| `perfil` | `contexts.target_notes` (`contextNotes`) | `aditional_instructions` do `POST /context/generate` — **usado nos dois modos** |
| `personas_variacao` | `roleplay_drafts.scenario.persona_instructions` | `additional_instructions` do lote de personas — **usado nos dois modos** |
| `objecoes` | `roleplay_drafts.scenario.objections` | `POST /context_{id}/objections` — **usado nos dois modos** |
| `guardrails` | `roleplay_drafts.scenario.guardrails` | `POST /context_{id}/guardrails` — **usado nos dois modos** |
| `call_context_slug` | `roleplay_drafts.scenario.call_context_slug` | Tipo de chamada do case setup — *ignorado no playbook* |
| `dificuldade` | `roleplay_drafts.scenario.difficulty` | `scenario_difficulty_level` — *ignorado no playbook* |
| `objetivo` | `roleplay_drafts.scenario.objective` | Objetivo de treino — *ignorado no playbook* |
| `habilidades` | `roleplay_drafts.scenario.skill` | Skills alvo — *ignorado no playbook* |
| `cenario_instrucoes` | `roleplay_drafts.scenario.aditional_instructions` | Instruções adicionais do cenário *(typo histórico: `aditional`)* — *ignorado no playbook* |
| `lacunas` | só UI (não persiste no draft) | — |

> Nota: no banco o campo de instruções se chama `aditional_instructions` (com typo). No JSON de geração o nome correto é `cenario_instrucoes`.

> ⚠️ **Reenvio não regenera o contexto.** `resolveOfferContext` reusa o `context_id` pela ponte `context_perfecting_ids`, então melhorar o `perfil` de um rascunho **já exportado** não tem efeito — vale para envios novos.

---

## 6. Regras da IA (prompt)

1. **Não conversar / não perguntar** — sempre devolver o JSON completo.
2. **Ser completo e fiel** ao material; preferir bloco longo e fiel a resumo curto.
3. **Preservar** instruções, exemplos e prompts já prontos no material (transcrever).
4. Priorizar dados reais; marcar inferências com `(Hipótese Assumida)`.
5. Escolher `call_context_slug` e `dificuldade` coerentes com o cenário.
6. **B2B ou B2C: inferir da oferta, nunca assumir B2B por padrão.** Um curso vendido a interessados individuais tem como público-alvo a **pessoa física** que quer se qualificar, não a instituição que oferece o curso. (É o que a própria API pede, na descrição de quase todo campo do contexto.)
7. Concentrar esforço no `perfil` — é o único campo que chega à plataforma nos dois modos. Não inventar cenário/rubricas sem base no material.
8. Responder **sempre** no formato JSON do schema.

### Extração esperada (antes de organizar no JSON)

- **Oferta:** nome, proposta de valor, problema, diferenciais, ticket, ciclo, concorrentes, ROI, público-alvo
- **Quem compra:** cargos/perfis, KPIs, medos, motivações, critérios, autoridade, estilos de comunicação
- **Cenário:** tipo de conversa, origem do lead, consciência, urgência, momento da jornada
- **Objeções:** preço, timing, prioridade, concorrente, autoridade, implementação, ROI, etc. — com frases reais

---

## 7. Exemplo completo

```json
{
  "oferta_nome": "RD Station Marketing — Expansão Multiproduto",
  "perfil": "## Público-alvo\nDiretores comerciais e de marketing de empresas de serviços B2B com 150–400 funcionários, que já usam automação de marketing e avaliam consolidar a stack.\n\n### Gatilhos de urgência\n- Renovação de contrato de uma das ferramentas se aproximando\n- Meta de pipeline do semestre em risco\n\n### Prioridades\n- Previsibilidade de pipeline\n- Reduzir fragmentação entre Marketing, Conversas e CRM\n\n### Dores mensuráveis\n- Retrabalho de dados entre 3 ferramentas (Hipótese Assumida: ~6h/semana do time de ops)\n- Atribuição de origem inconsistente, o que trava a decisão de onde investir\n\n### Estado futuro desejado\nFunil único, atribuição confiável e time operando numa ferramenta só.\n\n### O que motiva a compra\nPrevisibilidade de receita e uma tese de ROI defensável diante da diretoria.\n\n### Processo de decisão\nDiretor comercial conduz; marketing valida adoção; CFO aprova acima de certo valor. 2 a 3 reuniões.\n\n### Aversão a risco\nAlta quanto à migração: teme parar a operação no meio do trimestre.\n\n### Objeções e receios\n- \"Parece que vocês estão empilhando produto.\"\n- \"Não sei se meu time vai conseguir usar tudo isso.\"\n- \"Antes de entrar em produto, eu preciso entender como isso se paga.\"\n\n### Consciência do problema\nSente a fragmentação, mas subestima o custo real do retrabalho.\n\n### Consciência das soluções\nJá pesquisou; tem concorrente na mesa e desconfia de promessa de plataforma única.\n\n### O que usam hoje\nRD Station Marketing + CRM de outro fornecedor + planilhas de atribuição — não basta porque os dados não se conversam.",
  "personas_variacao": "Varie entre Diretor Comercial (decisor, direto, cético com ROI), Gerente de Marketing (influenciador, preocupado com adoção do time) e Head de RevOps (técnico, foca em integração e qualidade de dados). Alterne consciência alta e média do problema, e resistência de moderada a alta.",
  "objecoes": [
    {
      "titulo": "Orçamento comprometido",
      "tipo": "preco",
      "fala_exemplo": "Nosso orçamento já está comprometido para este ano — não temos verba disponível agora.",
      "detalhes": "Aparece assim que o valor é mencionado. Teme aprovar despesa que seja questionada politicamente.",
      "ceder_se": "O vendedor reconectar ao custo de NÃO captar e explorar recursos de capacitação já previstos, sem prometer liberação de verba."
    }
  ],
  "guardrails": [
    {
      "nome": "Não aceitar encerramento sem data",
      "instrucao": "Se o vendedor disser que manda por e-mail e depois vocês falam, exija definição de dia e formato antes de encerrar."
    }
  ],
  "call_context_slug": "discovery",
  "dificuldade": "hard",
  "cenario_instrucoes": "## Comportamento na conversa\n\nVocê é Rodrigo, Diretor Comercial. Entra cordial mas vigilante. Colabora se o vendedor conduzir como decisão executiva; fecha se virar pitch.\n\n### Testes de fogo\n1. Se pular diagnóstico e ir para produto: \"Antes de entrar em produto, eu preciso entender como isso se paga.\"\n2. Se empilhar tudo de uma vez: \"Parece que vocês estão empilhando produto.\"\n3. Se ignorar adoção: \"Não sei se meu time vai conseguir usar tudo isso.\"\n\n### Critério de êxito\nAceita avançar só se houver abertura clara, investigação de situação/dor/impacto, ao menos um envolvido na decisão mapeado, e encaminhamento coerente (ex.: reunião de diagnóstico do funil).",
  "objetivo": "Treinar business case multiproduto: comparar custo da expansão RD com o custo da fragmentação atual, contornando objeções de preço, implementação e adoção sem conceder desconto prematuro.",
  "habilidades": "Discovery consultivo, Business case / ROI, Contorno de objeções, Mapeamento de comitê",
  "lacunas": [
    {
      "item": "Ticket médio / valores oficiais de plano não estão no material",
      "severidade": "importante",
      "grupo": "Oferta"
    },
    {
      "item": "Nome do concorrente em avaliação não foi informado",
      "severidade": "opcional",
      "grupo": "Cenário"
    }
  ]
}
```

---

## 8. Checklist para quem for gerar esse JSON

- [ ] Todos os 11 campos de topo presentes (`oferta_nome` … `lacunas`)
- [ ] Toda objeção tem `ceder_se` preenchido
- [ ] `objecoes[].tipo` é um slug real de `/objection_types`
- [ ] `perfil` cobre as 12 dimensões do contexto (§4), não um retrato de uma pessoa
- [ ] B2B ou B2C inferido da oferta — não assumido
- [ ] `dificuldade` ∈ `easy` | `medium` | `hard`
- [ ] `call_context_slug` é um slug **real** da Perfecting
- [ ] `personas_variacao` descreve variação real do material (ou string vazia)
- [ ] `perfil` e `cenario_instrucoes` em markdown, ricos em detalhe
- [ ] Frases reais de objeção preservadas quando existirem no material
- [ ] Inferências marcadas com `(Hipótese Assumida)`
- [ ] Cada lacuna tem `item`, `severidade` e `grupo`
- [ ] Sem campos extras fora do schema

---

## 9. O que este contrato NÃO é

- **Não** é o payload completo de case setup da Perfecting (`company_profile`, `persona_profile`, `buyer_agent_instructions`, diálogos, rubricas detalhadas, voz, etc.). Esse payload é gerado **depois**, no export, pela IA da Perfecting (ou pode ser injetado verbatim em `scenario.case_setup_payload`).
- **Não** é o JSON de **Trilhas** (plano com N trilhas × M roleplays). Trilhas usam outro schema (`generate-trail-plan`).

Este JSON é o **seed mínimo** que o Facility precisa para criar e editar um roleplay antes de exportar.
