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

## 2. Os 4 grupos da Perfecting

O JSON espelha a organização usada na Perfecting para montar um roleplay:

| Grupo | O que é | Campos no JSON |
|---|---|---|
| **Grupo 1 – Oferta** | Produto/serviço treinado | `oferta_nome` (+ material bruto vira `general_description` no save) |
| **Grupo 2 – Buyer Persona / Contexto** | Quem é o comprador | `perfil` |
| **Grupo 3 – Cenário / comportamento** | Como a persona se comporta na call | `call_context_slug`, `dificuldade`, `cenario_instrucoes` |
| **Grupo 4 – Rubricas de treino** | O que o vendedor deve treinar | `objetivo`, `habilidades` |

Além disso, o campo `lacunas` lista o que ainda falta no material para um roleplay de alta qualidade (não vai para a Perfecting; serve de checklist no Facility).

---

## 3. Schema JSON completo

Todos os campos são **obrigatórios**. Não enviar propriedades extras.

```json
{
  "oferta_nome": "string",
  "perfil": "string",
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

**Grupo 2 – Buyer Persona.** Alimenta o contexto/persona na Perfecting.

Deve cobrir, com o máximo de detalhe e frases reais do material:

- Cargo, área, empresa, estrutura
- Responsabilidades, KPIs, metas
- Prioridades e dores
- Consciência do problema / das soluções
- Critérios de decisão, influenciadores, autoridade
- Estilo de comunicação / perfil comportamental (DISC quando possível)
- Objeções esperadas (com frases reais quando houver)

Quando precisar inferir algo que não está no material, marque com `(Hipótese Assumida)`.

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
| `perfil` | `contexts.target_notes` (`contextNotes`) | Gera / alimenta o Context (persona) |
| `call_context_slug` | `roleplay_drafts.scenario.call_context_slug` | Tipo de chamada do case setup |
| `dificuldade` | `roleplay_drafts.scenario.difficulty` | `scenario_difficulty_level` |
| `objetivo` | `roleplay_drafts.scenario.objective` | Objetivo de treino |
| `habilidades` | `roleplay_drafts.scenario.skill` | Skills alvo |
| `cenario_instrucoes` | `roleplay_drafts.scenario.aditional_instructions` | Instruções adicionais do cenário *(typo histórico: `aditional`)* |
| `lacunas` | só UI (não persiste no draft) | — |

> Nota: no banco o campo de instruções se chama `aditional_instructions` (com typo). No JSON de geração o nome correto é `cenario_instrucoes`.

---

## 6. Regras da IA (prompt)

1. **Não conversar / não perguntar** — sempre devolver o JSON completo.
2. **Ser completo e fiel** ao material; preferir bloco longo e fiel a resumo curto.
3. **Preservar** instruções, exemplos e prompts já prontos no material (transcrever).
4. Priorizar dados reais; marcar inferências com `(Hipótese Assumida)`.
5. Escolher `call_context_slug` e `dificuldade` coerentes com o cenário.
6. Linguagem comercial B2B.
7. Responder **sempre** no formato JSON do schema.

### Extração esperada (antes de organizar no JSON)

- **Oferta:** nome, proposta de valor, problema, diferenciais, ticket, ciclo, concorrentes, ROI, público-alvo
- **Buyer Persona:** cargo, KPIs, medos, motivações, critérios, autoridade, DISC
- **Cenário:** tipo de conversa, origem do lead, consciência, urgência, momento da jornada
- **Objeções:** preço, timing, prioridade, concorrente, autoridade, implementação, ROI, etc. — com frases reais

---

## 7. Exemplo completo

```json
{
  "oferta_nome": "RD Station Marketing — Expansão Multiproduto",
  "perfil": "## Buyer Persona\n\n**Nome:** Rodrigo Martins\n**Cargo:** Diretor Comercial e Marketing\n**Empresa:** Conecta Saúde Corporativa (~220 funcionários)\n\n### Prioridades\n- Previsibilidade de pipeline\n- Reduzir fragmentação entre Marketing, Conversas e CRM\n\n### Consciência\n- Já usa RD Station Marketing\n- Avalia expansão multiproduto; tem concorrente na mesa\n\n### Comportamento\n- Direto, estratégico, exige ROI e tese de adoção\n- Perde paciência com pitch genérico\n\n### Objeções esperadas\n- \"Parece que vocês estão empilhando produto.\"\n- \"Não sei se meu time vai conseguir usar tudo isso.\"\n- \"Antes de entrar em produto, eu preciso entender como isso se paga.\"",
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

- [ ] Todos os 8 campos de topo presentes (`oferta_nome` … `lacunas`)
- [ ] `dificuldade` ∈ `easy` | `medium` | `hard`
- [ ] `call_context_slug` é um slug **real** da Perfecting
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
