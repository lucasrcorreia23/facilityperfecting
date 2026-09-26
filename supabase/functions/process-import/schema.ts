/**
 * Montagem do system prompt e do JSON Schema do `process-import`.
 *
 * Separado do handler de propósito: são funções puras (entram taxonomias, sai o
 * formato de saída) e ficam testáveis sem importar o módulo que chama Deno.serve.
 */

/**
 * `today` entra pelo código, e não pelo texto base, para valer também com prompt
 * personalizado: sem ele o modelo copia prazos vencidos do material como vigentes.
 */
export function buildSystem(
  contexts: Array<{ slug: string; name: string; stage?: string }>,
  objectionTypes: Array<{ slug: string; name: string }>,
  base: string,
  today: Date = new Date(),
): string {
  const list = contexts
    .map((c) => `- ${c.slug} → ${c.name}${c.stage ? ` (${c.stage})` : ""}`)
    .join("\n");
  const objList = objectionTypes.map((o) => `- ${o.slug} → ${o.name}`).join("\n");
  const date = today.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [
    base,
    `CALL CONTEXTS DISPONÍVEIS (use exatamente um destes slugs em call_context_slug):\n${list}`,
    `TIPOS DE OBJEÇÃO DISPONÍVEIS (use exatamente um destes slugs em objecoes[].tipo):\n${objList}`,
    `DATA DE HOJE: ${date}. Prazos e condições do material anteriores a esta data já venceram.`,
  ].join("\n\n");
}

/**
 * As três fatias em que o schema é pedido, escolhidas para equilibrar o VOLUME DE
 * SAÍDA de cada uma (o que domina o tempo), não por afinidade temática:
 *  - core      → o perfil sozinho é o maior bloco de texto
 *  - objections→ 9-10 objeções com fala e condição de cedência pesam tanto quanto
 *  - scenario  → cenário (que pode ser transcrição integral) e rubricas
 */
export const SCHEMA_PARTS = {
  core: ["oferta_nome", "oferta_descricao", "perfil", "personas_variacao"],
  // `lacunas` mora aqui, e não em `scenario`, porque vale nos dois modos — é o
  // checklist do que falta no material, e `scenario` é pulável (ver PARTS_FOR_MODE).
  objections: ["objecoes", "guardrails", "lacunas"],
  scenario: [
    "call_context_slug",
    "dificuldade",
    "cenario_instrucoes",
    "objetivo",
    "habilidades",
  ],
  // Só por metodologia: um roleplay = uma conta concreta com um comprador.
  dossier: ["dossie"],
} as const;

export type SchemaPart = keyof typeof SCHEMA_PARTS;

/**
 * Instrução extra por fatia, fora do prompt base (que é editável pelo usuário e tem
 * cópia no front). O dossiê precisa dela porque contraria a regra geral do base: ele
 * também extrai o LADO DO VENDEDOR, que fica separado e nunca chega ao comprador.
 */
export const PART_NOTES: Partial<Record<SchemaPart, string>> = {
  dossier: `NESTA RESPOSTA você preenche só o "dossie". Exceção à regra "QUEM LÊ ISTO É O COMPRADOR": aqui os campos "produtos", "dores[].produto" e "rubricas" SÃO do lado do vendedor e devem ser extraídos (as soluções que o vendedor deveria conectar a cada dor e os critérios de sucesso da conversa). O envio os guarda separados — o comprador só recebe "persona" (sem nomes de produto) e as dores dele. Todo o resto continua valendo: fidelidade ao material, nenhum número, data ou pessoa inventados, e o que o material marca como construção de personagem pode ser usado como fato do personagem.`,
};

const topic = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string", description: "Rótulo curto do tópico." },
    texto: { type: "string" },
  },
  required: ["titulo", "texto"],
};

/**
 * Dossiê do comprador — só no modo metodologia (um roleplay = uma conta concreta).
 * Diferente do resto do schema, parte dele é do LADO DO VENDEDOR (produtos, qual
 * produto resolve cada dor, rubricas): fica separado e o envio garante que nunca
 * chegue ao comprador.
 */
const DOSSIE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  description:
    "Dossiê do comprador, para quando o material descreve UMA conta/um comprador concreto (nome, empresa, histórico, dores). Se o material for genérico (um público, sem um comprador específico), devolva listas vazias e textos vazios. Nunca invente números, datas ou pessoas que o material não traz.",
  properties: {
    produtos: {
      type: "array",
      description:
        "LADO DO VENDEDOR: as ofertas/soluções que o material diz que o vendedor deveria conectar às dores deste comprador (inclusive as secundárias). Nunca chegam ao comprador.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string", description: "Nome do produto/solução como no material." },
          descricao: { type: "string" },
          problema_resolvido: { type: "string" },
          beneficios: { type: "string", description: "Formatos e argumentos do material (ex.: sob demanda, in company)." },
        },
        required: ["nome", "descricao", "problema_resolvido", "beneficios"],
      },
    },
    dores: {
      type: "array",
      description:
        "Todas as dores do comprador, inclusive a de superfície e as que nenhum produto resolve (ex.: decisão travada, motivo real escondido).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          titulo: { type: "string", description: "Nome curto e genérico da dor, reaproveitável entre compradores. Ex.: 'Falta de mão de obra qualificada'." },
          descricao: { type: "string" },
          produto: {
            type: "string",
            description: "Nome EXATO (igual a produtos[].nome) do produto principal que resolve a dor; string vazia se nenhum resolve.",
          },
        },
        required: ["titulo", "descricao", "produto"],
      },
    },
    persona: {
      type: "object",
      additionalProperties: false,
      properties: {
        nome: { type: "string", description: "Nome do comprador; se o material deixar a definir, escolha um nome plausível." },
        genero: { type: "string", enum: ["masculino", "feminino", ""] },
        cargo: { type: "string" },
        area: { type: "string" },
        empresa_nome: { type: "string" },
        empresa_perfil: { type: "string", description: "Fatos da empresa/conta: segmento, porte, fundação, relação e faturamento com o vendedor." },
        prompt: {
          type: "string",
          description:
            "Prompt do comprador, em segunda pessoa ('Você é…'): quem é, o momento da conversa (quem liga para quem, primeira conversa ou retorno), o que ele sabe e lembra do histórico, pessoas que pode citar, personalidade e tom, e como reage ao que o vendedor faz (o 'avança/trava' do material escrito como reação dele). Inclua o 'segredo do cenário' quando houver, dizendo quando revelar. Sem nome de produto do vendedor, sem critérios de avaliação, sem as dores (elas vão em 'dores').",
        },
        dores: {
          type: "array",
          description: "As dores deste comprador, em camadas.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              dor: { type: "string", description: "Igual a dores[].titulo." },
              revelacao: {
                type: "string",
                enum: ["superficie", "sondada", "oculta"],
                description:
                  "superficie = diz logo no início; sondada = revela se o vendedor perguntar sobre o assunto; oculta = só com pergunta direta e aprofundamento (ex.: 'revela só se…'). Atenção: as sondadas aparecem na ficha do vendedor; o que ele precisa descobrir de verdade (motivo real, segredo) é oculta.",
              },
              detalhe: { type: "string", description: "Como a dor aparece para ESTE comprador, com a fala do material quando houver." },
            },
            required: ["dor", "revelacao", "detalhe"],
          },
        },
        produtos: {
          type: "array",
          description: "Produtos relacionados a este comprador, com a postura dele.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              produto: { type: "string", description: "Igual a produtos[].nome." },
              postura: {
                type: "string",
                description: "Como o comprador vê esse TIPO de solução, em uma frase, SEM citar o nome do produto.",
              },
            },
            required: ["produto", "postura"],
          },
        },
      },
      required: ["nome", "genero", "cargo", "area", "empresa_nome", "empresa_perfil", "prompt", "dores", "produtos"],
    },
    conhecimento: {
      type: "object",
      additionalProperties: false,
      properties: {
        previo: { type: "string", description: "O que o comprador já sabe ao atender, em 2-4 frases. Diga se é a primeira conversa." },
        fatos: { type: "array", description: "Fatos que o comprador revela se perguntado (histórico, operação, pessoas, propostas). Só do material.", items: topic },
        briefing: {
          type: "array",
          description: "O que o VENDEDOR sabe antes da call (dados de CRM da conta). Nada do que o comprador esconde.",
          items: topic,
        },
      },
      required: ["previo", "fatos", "briefing"],
    },
    abertura: {
      type: "array",
      description: "3 variações da primeira fala do comprador, coerentes com o momento (quem ligou, primeiro contato ou retorno).",
      items: { type: "string" },
    },
    rubricas: {
      type: "array",
      description:
        "LADO DO VENDEDOR: critérios de avaliação do material (critérios de sucesso). Inclua um de conexão dor → ofertas que liste, por dor, as ofertas que o material manda conectar.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          criterio: { type: "string" },
          descricao: { type: "string" },
          dica: { type: "string" },
        },
        required: ["criterio", "descricao", "dica"],
      },
    },
  },
  required: ["produtos", "dores", "persona", "conhecimento", "abertura", "rubricas"],
};

/**
 * Quais fatias pedir, por modo de geração.
 *
 * No modo playbook, tipo de chamada, comportamento e rubricas vêm das etapas do
 * playbook — a fatia `scenario` seria gerada e descartada. E ela é cara: é onde o
 * prompt manda transcrever instruções na íntegra. Pulá-la corta ~35% do custo e
 * ~25% do tempo de um material grande, sem perder nada que o envio use.
 */
export const PARTS_FOR_MODE: Record<"playbook" | "methodology", readonly SchemaPart[]> = {
  playbook: ["core", "objections"],
  methodology: ["core", "objections", "scenario", "dossier"],
};

/**
 * O schema é montado em FATIAS, pedidas à Anthropic em paralelo (ver SCHEMA_PARTS).
 *
 * Não é microtimização: material rico (playbook + objeções + instruções a preservar)
 * gera ~16k tokens de saída, o que levava ~140s numa chamada só — e a Edge Function
 * morre com 504 no gateway aos ~150s. Em paralelo o custo é max(t1..tn) em vez da
 * soma, e cada fatia cabe com folga.
 *
 * `part` omitido = schema inteiro (usado em teste).
 */
export function buildSchema(
  slugs: string[],
  objectionSlugs: string[],
  part?: SchemaPart,
) {
  // Sem tipos de objeção não há enum válido (`enum: []` é schema inválido e um slug
  // inventado não seria criável na API): o campo sai do schema e a extração de
  // objeções fica desligada nessa execução, em vez de quebrar o processamento inteiro.
  const withObjections = objectionSlugs.length > 0;
  const full = {
    type: "object",
    additionalProperties: false,
    properties: {
      oferta_nome: { type: "string", description: "Nome curto da oferta/produto." },
      oferta_descricao: {
        type: "string",
        description:
          "Descrição da oferta (markdown curto) — usada nos dois modos, vira a descrição da oferta na Perfecting. O que é vendido e para quem, proposta de valor, problema resolvido, diferenciais, formato, preço e condições VIGENTES. Sem metodologia de venda, roteiro, argumentos do vendedor, CRM ou processo interno.",
      },
      perfil: {
        type: "string",
        description:
          "O CAMPO MAIS IMPORTANTE (markdown) — usado nos dois modos. NÃO é o retrato de uma pessoa: é a instrução com que a Perfecting monta o CONTEXTO, do qual saem uma ou várias personas. Cubra público-alvo (B2B ou B2C, conforme a oferta), gatilhos de urgência, prioridades, dores mensuráveis, estado futuro desejado, motivadores de compra, processo de decisão, aversão a risco, objeções e receios, consciência do problema, consciência das soluções e o que usam hoje. Só o lado do comprador: nada de método, roteiro, perguntas do vendedor ou CRM.",
      },
      personas_variacao: {
        type: "string",
        description:
          "Como as personas devem variar entre si quando o usuário pedir mais de uma (cargos/áreas, senioridade, estilos de comunicação, graus de consciência e resistência). Vira o grounding do lote de personas. Somente o que o material sustentar; string vazia se não houver base.",
      },
      call_context_slug: {
        type: "string",
        enum: slugs,
        description:
          "O tipo de chamada mais adequado, dentre os slugs disponíveis. IGNORADO no modo playbook (vem da etapa).",
      },
      dificuldade: {
        type: "string",
        enum: ["easy", "medium", "hard"],
        description: "IGNORADO no modo playbook.",
      },
      cenario_instrucoes: {
        type: "string",
        description:
          "Comportamento do cenário (markdown): como a persona se comporta na conversa, testes de fogo/objeções a aplicar e critério de fechamento. Alimenta as instruções do case setup. IGNORADO no modo playbook (o comportamento vem das etapas do playbook).",
      },
      objetivo: {
        type: "string",
        description: "Objetivo de treino do roleplay. IGNORADO no modo playbook (rubricas vêm das etapas).",
      },
      habilidades: {
        type: "string",
        description: "Habilidades de venda a treinar. IGNORADO no modo playbook (rubricas vêm das etapas).",
      },
      ...(withObjections && {
      objecoes: {
        type: "array",
        description:
          "Objeções que o comprador levanta, extraídas do material. No modo playbook vão só para as etapas em que o comprador as levantaria; por metodologia, valem para o roleplay inteiro. Use as falas REAIS do material quando existirem, em vez de inventar. Array vazio se o material não trouxer objeções.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            titulo: { type: "string", description: "Nome curto da objeção. Ex.: 'Orçamento comprometido'." },
            tipo: { type: "string", enum: objectionSlugs, description: "Slug do tipo, entre os disponíveis." },
            fala_exemplo: {
              type: "string",
              description: "Como o comprador diz isso, na primeira pessoa. Frase real do material quando houver.",
            },
            detalhes: {
              type: "string",
              description: "O que está por trás da objeção: contexto e o que o comprador teme.",
            },
            ceder_se: {
              type: "string",
              description:
                "A condição que faz o comprador ceder, do ponto de vista dele: o que ele precisa ouvir, ver ou receber. Sem técnica, etapa ou método do vendedor. SEM isto ele repete a objeção indefinidamente e o treino não tem desfecho — sempre preencha.",
            },
          },
          required: ["titulo", "tipo", "fala_exemplo", "detalhes", "ceder_se"],
        },
      },
      }),
      guardrails: {
        type: "array",
        description:
          "Regras de comportamento do comprador simulado, quando o material as trouxer (o que ele nunca deve fazer, como reage a promessas indevidas, termos proibidos ao vendedor). Criadas no CONTEXTO, valem em todas as etapas: nada específico de uma etapa e nunca mandar encerrar ou desligar a ligação. Array vazio se o material não definir regras.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            nome: { type: "string", description: "Nome curto da regra." },
            instrucao: {
              type: "string",
              description: "A regra em segunda pessoa, dirigida ao comprador simulado. Ex.: 'Se o vendedor prometer que a verba será aprovada, desconfie e peça que ele mostre como isso seria garantido.'",
            },
          },
          required: ["nome", "instrucao"],
        },
      },
      dossie: DOSSIE_SCHEMA,
      lacunas: {
        type: "array",
        description:
          "Informações faltantes para um roleplay de alta qualidade. Em `grupo`, separe o que vale sempre (\"Oferta\", \"Contexto\", \"Personas\") do que só importa fora do playbook (\"Cenário (sem playbook)\", \"Rubricas (sem playbook)\").",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            item: { type: "string" },
            severidade: { type: "string", enum: ["critico", "importante", "opcional"] },
            grupo: { type: "string" },
          },
          required: ["item", "severidade", "grupo"],
        },
      },
    },
    required: [
      "oferta_nome",
      "oferta_descricao",
      "perfil",
      "personas_variacao",
      "call_context_slug",
      "dificuldade",
      "cenario_instrucoes",
      "objetivo",
      "habilidades",
      ...(withObjections ? ["objecoes"] : []),
      "guardrails",
      "dossie",
      "lacunas",
    ],
  };

  if (!part) return full;

  const fields = SCHEMA_PARTS[part] as readonly string[];
  const keep = (k: string) => fields.includes(k);
  return {
    ...full,
    properties: Object.fromEntries(Object.entries(full.properties).filter(([k]) => keep(k))),
    required: full.required.filter(keep),
  };
}
