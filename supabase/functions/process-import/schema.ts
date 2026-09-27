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
 * As fatias em que o schema é pedido, escolhidas para equilibrar o VOLUME DE SAÍDA
 * de cada uma (o que domina o tempo), não por afinidade temática. Cada fatia é UMA
 * chamada ao Claude, e ela precisa terminar antes do teto de ~150s da Edge Function
 * (plano Free: vale também para trabalho em segundo plano). Material rico e todo do
 * lado do comprador chegou a 16,8k tokens numa fatia só (148,7s). Dividir não perde
 * nada: o schema final é o mesmo, só chega por mais chamadas em paralelo.
 *  - core      → oferta e variação das personas
 *  - profile   → o perfil sozinho, o maior bloco de texto (transcrição fiel)
 *  - objections→ 9-10 objeções com fala e condição de cedência pesam tanto quanto
 *  - scenario  → cenário (que pode ser transcrição integral) e rubricas
 *  - dossier_*  → o dossiê em duas metades (ver DOSSIER_PARTS)
 */
export const SCHEMA_PARTS = {
  core: ["oferta_nome", "oferta_descricao", "personas_variacao"],
  profile: ["perfil"],
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
  dossier_buyer: ["dossie"],
  dossier_context: ["dossie"],
} as const;

/**
 * Metade do dossiê que cada fatia pede. A 1ª fica com tudo que se referencia pelo
 * nome (dores[].produto → produtos[].nome, persona.dores[].dor → dores[].titulo,
 * persona.produtos[].produto → produtos[].nome): separado em chamadas que não se
 * veem, os nomes deixariam de bater. A 2ª só depende do material.
 */
export const DOSSIER_PARTS: Record<"dossier_buyer" | "dossier_context", readonly string[]> = {
  dossier_buyer: ["produtos", "dores", "persona"],
  dossier_context: ["conhecimento", "abertura", "rubricas"],
};

export type SchemaPart = keyof typeof SCHEMA_PARTS;

/**
 * Instrução extra por fatia, fora do prompt base (que é editável pelo usuário e tem
 * cópia no front). O dossiê precisa dela porque contraria a regra geral do base: ele
 * também extrai o LADO DO VENDEDOR, que fica separado e nunca chega ao comprador.
 */
const DOSSIER_NOTE = `NESTA RESPOSTA você preenche só o "dossie" (ou a parte dele indicada abaixo). Exceção à regra "QUEM LÊ ISTO É O COMPRADOR": aqui os campos "produtos", "dores[].produto" e "rubricas" SÃO do lado do vendedor e devem ser extraídos (as soluções que o vendedor deveria conectar a cada dor e os critérios de sucesso da conversa). O envio os guarda separados — o comprador só recebe "persona" (sem nomes de produto) e as dores dele. Por isso o critério de resultado do vendedor (o que o material chama de vitória, parcial, avança/trava, meta da ligação) vai em "rubricas", nunca em "persona.prompt"; e faturamento, histórico de compras e relação comercial com o vendedor vão em "conhecimento.briefing", nunca em "persona.empresa_perfil". Todo o resto continua valendo: fidelidade ao material, nenhum número, data ou pessoa inventados, e o que o material marca como construção de personagem pode ser usado como fato do personagem.`;

export const PART_NOTES: Partial<Record<SchemaPart, string>> = {
  dossier_buyer: `${DOSSIER_NOTE} Nesta resposta, do dossiê, só "produtos", "dores" e "persona"; o resto é pedido à parte.`,
  dossier_context: `${DOSSIER_NOTE} Nesta resposta, do dossiê, só "conhecimento", "abertura" e "rubricas"; o resto é pedido à parte.`,
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
 * Fato que o comprador revela, com o momento da conversa em que ele costuma surgir.
 * O envio usa `etapa` para gravar o fato só na etapa da metodologia correspondente
 * (pela ordem), em vez de repetir tudo em todas.
 */
const fact = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...topic.properties,
    etapa: {
      type: "integer",
      enum: [0, 1, 2, 3, 4],
      description:
        "Momento da conversa em que o fato costuma aparecer: 1 = contexto e situação atual; 2 = problemas e dificuldades; 3 = consequências e impacto; 4 = necessidade, solução, próximo passo; 0 = pode surgir em qualquer momento.",
    },
  },
  required: ["titulo", "texto", "etapa"],
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
        empresa_perfil: {
          type: "string",
          description:
            "Fatos da empresa como o próprio comprador a descreveria: segmento, porte, localização, fundação, operação. NUNCA faturamento, valores ou histórico de compras com o vendedor nem a relação comercial com ele — isso é dado de CRM e vai em conhecimento.briefing.",
        },
        prompt: {
          type: "string",
          description:
            "Prompt do comprador, em segunda pessoa ('Você é…'): quem é, o momento da conversa (quem liga para quem, primeira conversa ou retorno), o que ele sabe e lembra do histórico, pessoas que pode citar, personalidade e tom, e como reage ao que o vendedor faz, sempre do ponto de vista dele ('se o vendedor citar X, você se abre'; 'se falar de catálogo, você despacha'). Inclua o 'segredo do cenário' quando houver, dizendo quando revelar. PROIBIDO: resultado ou meta do vendedor ('vitória', 'parcial', 'avança', 'trava', 'objetivo do vendedor', o que conta como sucesso) — isso vai em 'rubricas'; faturamento ou valores de compra com o vendedor (vão em conhecimento.briefing); nome de produto do vendedor; critérios de avaliação; as dores (elas vão em 'dores').",
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
              detalhe: {
                type: "string",
                description:
                  "Como a dor aparece para ESTE comprador, parafraseada em 3ª pessoa ('sente que…', 'reclama de…', 'tem receio de…'). NUNCA fala em 1ª pessoa nem citação entre aspas: o comprador recitaria a frase pronta.",
              },
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
        previo: {
          type: "string",
          description:
            "O que o comprador já sabe ao atender, em 2-4 frases. Diga se é a primeira conversa. Sem dores 'sondada' ou 'oculta' (o comprador as diria logo no início).",
        },
        fatos: {
          type: "array",
          description:
            "Fatos que o comprador revela se perguntado (histórico, operação, pessoas, propostas). Só do material. Nada que repita uma dor 'sondada' ou 'oculta': ela já está em persona.dores com a regra de quando revelar, e repetida aqui o comprador a solta na primeira pergunta.",
          items: fact,
        },
        briefing: {
          type: "array",
          description:
            "O que o VENDEDOR sabe antes da call (dados de CRM da conta): faturamento e histórico de compras com o vendedor, propostas, contatos. Todo dado comercial da conta vai AQUI, não no perfil da empresa. Nada do que o comprador esconde.",
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
        "LADO DO VENDEDOR: critérios de avaliação do material (critérios de sucesso), incluindo o resultado esperado da ligação (o que o material chama de vitória/parcial). O tipo de conversa manda: em descoberta, apresentação, proposta ou retorno em que o vendedor deve oferecer solução, inclua um critério de conexão dor → ofertas que liste, por dor, as ofertas que o material manda conectar; em prospecção, ligação a frio ou triagem (quem atende não é o decisor), NÃO cobre oferta — use 'qualificou o decisor e quem participa da decisão' e 'saiu com próximo passo com data'.",
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
  playbook: ["core", "profile", "objections"],
  methodology: ["core", "profile", "objections", "scenario", "dossier_buyer", "dossier_context"],
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
  const properties: Record<string, unknown> = Object.fromEntries(
    Object.entries(full.properties).filter(([k]) => keep(k)),
  );
  if (part === "dossier_buyer" || part === "dossier_context") {
    const half = DOSSIER_PARTS[part];
    properties.dossie = {
      ...DOSSIE_SCHEMA,
      properties: Object.fromEntries(
        Object.entries(DOSSIE_SCHEMA.properties).filter(([k]) => half.includes(k)),
      ),
      required: DOSSIE_SCHEMA.required.filter((k) => half.includes(k)),
    };
  }
  return { ...full, properties, required: full.required.filter(keep) };
}
