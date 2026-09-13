/**
 * Montagem do system prompt e do JSON Schema do `process-import`.
 *
 * Separado do handler de propósito: são funções puras (entram taxonomias, sai o
 * formato de saída) e ficam testáveis sem importar o módulo que chama Deno.serve.
 */

export function buildSystem(
  contexts: Array<{ slug: string; name: string; stage?: string }>,
  objectionTypes: Array<{ slug: string; name: string }>,
  base: string,
): string {
  const list = contexts
    .map((c) => `- ${c.slug} → ${c.name}${c.stage ? ` (${c.stage})` : ""}`)
    .join("\n");
  const objList = objectionTypes.map((o) => `- ${o.slug} → ${o.name}`).join("\n");
  return [
    base,
    `CALL CONTEXTS DISPONÍVEIS (use exatamente um destes slugs em call_context_slug):\n${list}`,
    `TIPOS DE OBJEÇÃO DISPONÍVEIS (use exatamente um destes slugs em objecoes[].tipo):\n${objList}`,
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
  core: ["oferta_nome", "perfil", "personas_variacao"],
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
} as const;

export type SchemaPart = keyof typeof SCHEMA_PARTS;

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
  methodology: ["core", "objections", "scenario"],
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
      perfil: {
        type: "string",
        description:
          "O CAMPO MAIS IMPORTANTE (markdown) — usado nos dois modos. NÃO é o retrato de uma pessoa: é a instrução com que a Perfecting monta o CONTEXTO, do qual saem uma ou várias personas. Cubra público-alvo (B2B ou B2C, conforme a oferta), gatilhos de urgência, prioridades, dores mensuráveis, estado futuro desejado, motivadores de compra, processo de decisão, aversão a risco, objeções e receios, consciência do problema, consciência das soluções e o que usam hoje.",
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
          "Objeções que o comprador levanta, extraídas do material. São criadas no CONTEXTO da Perfecting e herdadas por todos os roleplays — use as falas REAIS do material quando existirem, em vez de inventar. Array vazio se o material não trouxer objeções.",
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
              description: "O que está por trás da objeção: contexto, quando ela aparece na conversa, o que o comprador teme.",
            },
            ceder_se: {
              type: "string",
              description:
                "A condição que faz o comprador ceder. SEM isto ele repete a objeção indefinidamente e o treino não tem desfecho — sempre preencha.",
            },
          },
          required: ["titulo", "tipo", "fala_exemplo", "detalhes", "ceder_se"],
        },
      },
      }),
      guardrails: {
        type: "array",
        description:
          "Regras de comportamento do comprador simulado, quando o material as trouxer (o que ele nunca deve fazer, como reage a promessas indevidas, termos proibidos ao vendedor). Criadas no CONTEXTO. Array vazio se o material não definir regras.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            nome: { type: "string", description: "Nome curto da regra." },
            instrucao: {
              type: "string",
              description: "A regra em segunda pessoa, dirigida ao comprador simulado. Ex.: 'Se o vendedor prometer que a verba será aprovada, reaja com desconfiança e endureça pelo resto da conversa.'",
            },
          },
          required: ["nome", "instrucao"],
        },
      },
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
      "perfil",
      "personas_variacao",
      "call_context_slug",
      "dificuldade",
      "cenario_instrucoes",
      "objetivo",
      "habilidades",
      ...(withObjections ? ["objecoes"] : []),
      "guardrails",
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
