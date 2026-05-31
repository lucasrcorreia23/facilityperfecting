import { corsHeaders, json } from "../_shared/cors.ts";
import { listCallContexts, loginSuperadmin, PerfectingError } from "../_shared/perfecting.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Pré-prompt mestre de ingestão (adaptado do GPT do CEO para modo NÃO-interativo):
 * extrai → organiza nos 4 grupos da Perfecting → aponta lacunas. Nunca pergunta;
 * sempre devolve o JSON estruturado. Marca "Hipótese Assumida" quando inferir.
 */
const SYSTEM_BASE = `Você é um especialista em criação de Roleplays Comerciais para a plataforma Perfecting.

Sua tarefa: a partir de QUALQUER material fornecido (sites, PDFs, propostas, transcrições, playbooks, anotações), EXTRAIR e ORGANIZAR as informações para preencher um roleplay na Perfecting. Você NÃO conversa e NÃO pergunta — você sempre devolve o resultado estruturado.

ETAPA 1 — EXTRAÇÃO. Extraia tudo que conseguir sobre:
- Oferta: nome, produto/serviço, proposta de valor, problema principal resolvido, diferenciais competitivos, ticket médio, ciclo de vendas, concorrentes, casos de uso, ROI, público-alvo.
- Buyer Persona: cargo, área, responsabilidades, KPIs, metas, medos, motivações, critérios de decisão, influenciadores, nível de autoridade, estilo de comunicação, perfil comportamental (DISC quando possível).
- Cenário: tipo de conversa (cold call, discovery, demo, proposta, negociação, renovação, expansão), como o lead chegou, nível de consciência, momento da jornada, urgência, situação atual.
- Objeções: preço, timing, prioridade, concorrente, autoridade, implementação, integração, segurança, ROI, troca de fornecedor, falta de necessidade. Use frases reais quando houver.

ETAPA 2 — ORGANIZAÇÃO. Separe o conteúdo em blocos distintos, prontos para alimentar a Perfecting:
- perfil (Grupo 2 – Buyer Persona): cargo, empresa, estrutura, prioridades, consciência do problema/soluções, comportamento (DISC) e as objeções esperadas — com o MÁXIMO de detalhe e frases reais do material. Usado como instrução de contexto para gerar a persona.
- cenário (Grupo 3): tipo de chamada, dificuldade e as instruções de COMPORTAMENTO da persona durante a conversa — como reage, testes de fogo/objeções que aplica, critério de fechamento. Se o material já trouxer instruções ou prompts de comportamento prontos, PRESERVE-OS na íntegra (transcreva, não resuma).
- rubricas (Grupo 4): objetivo de treino e habilidades de venda a treinar.

ETAPA 3 — LACUNAS. Liste tudo que ainda falta para um roleplay de alta qualidade, classificando cada item como "critico", "importante" ou "opcional".

REGRAS:
- SEJA COMPLETO E FIEL ao material. Preserve o detalhe que o cliente preparou; transcreva instruções, exemplos e prompts existentes em vez de resumir. NÃO comprima conteúdo intencional — é melhor um bloco longo e fiel do que um resumo curto.
- Priorize dados reais extraídos do material. Quando precisar inferir, marque o trecho com "(Hipótese Assumida)".
- Escolha o call_context mais adequado entre os disponíveis e a dificuldade (easy/medium/hard) coerente com o cenário.
- Linguagem comercial B2B. Responda SEMPRE no formato estruturado pedido (JSON).`;

function buildSystem(
  contexts: Array<{ slug: string; name: string; stage?: string }>,
  base: string,
): string {
  const list = contexts
    .map((c) => `- ${c.slug} → ${c.name}${c.stage ? ` (${c.stage})` : ""}`)
    .join("\n");
  return `${base}\n\nCALL CONTEXTS DISPONÍVEIS (use exatamente um destes slugs em call_context_slug):\n${list}`;
}

function buildSchema(slugs: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      oferta_nome: { type: "string", description: "Nome curto da oferta/produto." },
      perfil: {
        type: "string",
        description:
          "Grupo 2 – Buyer Persona (markdown): cargo, empresa, prioridades, consciência do problema/soluções, comportamento e objeções esperadas. Alimenta a etapa de CONTEXTO/persona na Perfecting.",
      },
      call_context_slug: {
        type: "string",
        enum: slugs,
        description: "O tipo de chamada mais adequado, dentre os slugs disponíveis.",
      },
      dificuldade: { type: "string", enum: ["easy", "medium", "hard"] },
      cenario_instrucoes: {
        type: "string",
        description:
          "Grupo 3 – Comportamento do cenário (markdown): como a persona deve se comportar na conversa, testes de fogo/objeções a aplicar e critério de fechamento. Alimenta as instruções do case setup (comportamento ideal do roleplay).",
      },
      objetivo: { type: "string", description: "Grupo 4 – Objetivo de treino do roleplay." },
      habilidades: { type: "string", description: "Grupo 4 – Habilidades de venda a treinar." },
      lacunas: {
        type: "array",
        description: "Informações faltantes para um roleplay de alta qualidade.",
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
      "call_context_slug",
      "dificuldade",
      "cenario_instrucoes",
      "objetivo",
      "habilidades",
      "lacunas",
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY não configurada nos secrets" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ ok: false, error: "texto vazio" }, 400);
    // Prompt customizável pelo usuário (cai no padrão se não vier).
    const base = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : SYSTEM_BASE;

    // call_contexts válidos da Perfecting (para o modelo escolher um slug real)
    const saToken = await loginSuperadmin();
    const contexts = await listCallContexts(saToken);
    if (contexts.length === 0) {
      return json({ ok: false, error: "nenhum call_context disponível na Perfecting" }, 502);
    }
    const slugs = contexts.map((c) => c.slug);

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        // Sem thinking: a saída JSON é garantida pelo schema (output_config.format),
        // então não pagamos tokens de raciocínio (os caros). Extração estruturada
        // não precisa de thinking. Custo ~5x menor que Opus + adaptive thinking.
        output_config: { format: { type: "json_schema", schema: buildSchema(slugs) } },
        system: [
          { type: "text", text: buildSystem(contexts, base), cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: text }],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        res.status === 429
          ? "Limite de tokens por minuto da Anthropic atingido. O material é grande demais para o tier atual da conta — reduza o conteúdo, processe em partes, ou aumente o tier no console da Anthropic."
          : (data?.error?.message ?? data?.error ?? data);
      return json({ ok: false, error: { status: res.status, detail: msg } }, 502);
    }

    // Saída cortada por max_tokens → JSON incompleto. Avisa de forma clara.
    if (data.stop_reason === "max_tokens") {
      return json(
        {
          ok: false,
          error:
            "O material é muito extenso para ser estruturado em uma única resposta. Reduza o conteúdo (ou processe em partes) e tente de novo.",
        },
        502,
      );
    }

    // Com structured outputs, o bloco de texto final é o JSON do schema.
    const textBlock = (data.content ?? []).find((b: { type?: string }) => b?.type === "text");
    if (!textBlock?.text) {
      return json({ ok: false, error: "resposta sem conteúdo estruturado" }, 502);
    }
    let result: unknown;
    try {
      result = JSON.parse(textBlock.text);
    } catch {
      return json(
        { ok: false, error: "A IA retornou um resultado incompleto. Tente reduzir o material." },
        502,
      );
    }
    return json({ ok: true, result, usage: data.usage });
  } catch (e) {
    const detail = e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
