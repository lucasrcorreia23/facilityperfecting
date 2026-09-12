import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import {
  listCallContexts,
  listMethodologies,
  loginSuperadmin,
  PerfectingError,
} from "../_shared/perfecting.ts";

/**
 * Estrutura o playbook do cliente a partir do material bruto: etapas
 * (call_types) e suas subetapas (call_blocks), prontas para revisão na UI e
 * envio para a conta.
 *
 *   stage "generate" → 202 imediato; a chamada à Anthropic roda em waitUntil
 *   stage "poll"     → estado atual (destrava execução morta voltando p/ draft)
 *
 * Uma chamada de LLM só (sem Batch API, diferente de generate-trail-plan): o
 * volume é bem menor. O waitUntil existe para não esbarrar no wall clock da
 * Edge Function com um playbook de dezenas de páginas.
 */

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Geração presa há mais que isto = execução morta; o poll libera para retry. */
const STALE_AFTER_MS = 20 * 60_000;

const SYSTEM_BASE = `Você é um especialista em playbooks de vendas estruturando o playbook de um cliente para a plataforma Perfecting.

Sua tarefa: a partir do material fornecido (playbook em PDF, apresentações, transcrições de treinamento, anotações), EXTRAIR a jornada comercial e organizá-la em ETAPAS e SUBETAPAS. Você NÃO conversa e NÃO pergunta — sempre devolve o resultado estruturado.

ETAPAS (call types) = os tipos de conversa da jornada, na ordem em que acontecem (ex.: prospecção/cold call → diagnóstico → apresentação de proposta → negociação → fechamento). Cada etapa vira um roleplay depois.

SUBETAPAS (call blocks) = os momentos DENTRO de uma etapa (ex.: dentro do diagnóstico: abertura e rapport → mapeamento da dor → dimensionamento do impacto → próximos passos). Para cada subetapa descreva:
- objective: o que o vendedor precisa alcançar ali.
- sample_questions: perguntas reais que o vendedor faz nesse momento. Use as do material quando existirem, na íntegra.
- what_to_do: comportamentos e boas práticas esperadas.
- what_to_avoid: erros comuns e o que não fazer.

REGRAS:
- SEJA FIEL ao material: se o cliente já nomeia as etapas, use os nomes DELE (não troque por nomes genéricos de metodologia). Transcreva perguntas e exemplos existentes em vez de resumir.
- Só invente estrutura quando o material for omisso — e, nesse caso, mantenha coerência com o tipo de venda descrito.
- Ordene as etapas pela sequência real da jornada.
- Entre 3 e 8 etapas, cada uma com 2 a 6 subetapas.
- Para cada etapa escolha o call_context_slug mais adequado e a methodology_slug que melhor descreve o trabalho daquela etapa, sempre entre as opções fornecidas.
- Linguagem comercial em português do Brasil. Responda SEMPRE no formato estruturado pedido (JSON).`;

function buildSystem(
  contexts: Array<{ slug: string; name: string; stage?: string }>,
  methodologies: Array<{ slug: string; name: string; application_case: string }>,
  base: string,
): string {
  const ctxList = contexts
    .map((c) => `- ${c.slug} → ${c.name}${c.stage ? ` (${c.stage})` : ""}`)
    .join("\n");
  const methList = methodologies
    .map((m) => `- ${m.slug} → ${m.name}${m.application_case ? ` (${m.application_case})` : ""}`)
    .join("\n");
  return `${base}

CALL CONTEXTS DISPONÍVEIS (use exatamente um destes slugs em call_context_slug):
${ctxList}

METODOLOGIAS DISPONÍVEIS (use exatamente um destes slugs em methodology_slug):
${methList}`;
}

function buildSchema(callContextSlugs: string[], methodologySlugs: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", description: "Nome do playbook (use o nome do cliente/programa)." },
      call_types: {
        type: "array",
        description: "As etapas da jornada comercial, na ordem em que acontecem.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", description: "Nome da etapa, preferindo o nome usado pelo cliente." },
            description: { type: "string", description: "O que acontece nesta etapa e quando ela ocorre." },
            call_context_slug: { type: "string", enum: callContextSlugs },
            methodology_slug: { type: "string", enum: methodologySlugs },
            call_blocks: {
              type: "array",
              description: "Os momentos dentro da etapa, em ordem.",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  objective: { type: "string" },
                  sample_questions: { type: "array", items: { type: "string" } },
                  what_to_do: { type: "array", items: { type: "string" } },
                  what_to_avoid: { type: "array", items: { type: "string" } },
                },
                required: [
                  "name",
                  "description",
                  "objective",
                  "sample_questions",
                  "what_to_do",
                  "what_to_avoid",
                ],
              },
            },
          },
          required: ["name", "description", "call_context_slug", "methodology_slug", "call_blocks"],
        },
      },
    },
    required: ["name", "call_types"],
  };
}

interface GeneratedCallBlock {
  name: string;
  description: string;
  objective: string;
  sample_questions: string[];
  what_to_do: string[];
  what_to_avoid: string[];
}

interface GeneratedCallType {
  name: string;
  description: string;
  call_context_slug: string;
  methodology_slug: string;
  call_blocks: GeneratedCallBlock[];
}

function setPlaybook(playbookId: string, patch: Record<string, unknown>) {
  return db.from("playbooks").update(patch).eq("id", playbookId);
}

/** Substitui a estrutura inteira: regerar é sempre "do zero". */
async function persist(
  playbookId: string,
  createdBy: string | null,
  result: { name?: string; call_types?: GeneratedCallType[] },
): Promise<void> {
  const { data: existing } = await db
    .from("playbook_call_types")
    .select("id")
    .eq("playbook_id", playbookId);
  if (existing?.length) {
    // call_blocks caem por cascade
    await db
      .from("playbook_call_types")
      .delete()
      .in("id", existing.map((c: { id: string }) => c.id));
  }

  const callTypes = result.call_types ?? [];
  for (let i = 0; i < callTypes.length; i++) {
    const ct = callTypes[i];
    const { data: row, error } = await db
      .from("playbook_call_types")
      .insert({
        playbook_id: playbookId,
        position: i,
        name: ct.name,
        description: ct.description ?? null,
        call_context_slug: ct.call_context_slug ?? null,
        methodology_slug: ct.methodology_slug ?? null,
        created_by: createdBy,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(`falha ao gravar a etapa "${ct.name}": ${error?.message}`);

    const blocks = ct.call_blocks ?? [];
    if (blocks.length === 0) continue;
    const { error: blocksErr } = await db.from("playbook_call_blocks").insert(
      blocks.map((b, j) => ({
        call_type_id: row.id,
        position: j,
        name: b.name,
        description: b.description ?? null,
        objective: b.objective ?? null,
        sample_questions: b.sample_questions ?? [],
        what_to_do: b.what_to_do ?? [],
        what_to_avoid: b.what_to_avoid ?? [],
        created_by: createdBy,
      })),
    );
    if (blocksErr) throw new Error(`falha ao gravar as subetapas de "${ct.name}": ${blocksErr.message}`);
  }
}

async function run(playbookId: string): Promise<void> {
  try {
    const { data: playbook, error } = await db
      .from("playbooks")
      .select("id, name, input_text, prompt_override, created_by")
      .eq("id", playbookId)
      .single();
    if (error || !playbook) throw new Error("playbook não encontrado");
    const text = (playbook.input_text ?? "").trim();
    if (!text) throw new Error("material vazio");

    // Slugs reais para o modelo escolher (mesmo padrão de process-import).
    const saToken = await loginSuperadmin("hml");
    const [contexts, methodologies] = await Promise.all([
      listCallContexts("hml", saToken),
      listMethodologies("hml", saToken),
    ]);
    if (contexts.length === 0) throw new Error("nenhum call_context disponível na Perfecting");
    if (methodologies.length === 0) throw new Error("nenhuma metodologia disponível na Perfecting");

    const base = playbook.prompt_override?.trim() || SYSTEM_BASE;
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 32000,
        output_config: {
          format: {
            type: "json_schema",
            schema: buildSchema(
              contexts.map((c) => c.slug),
              methodologies.map((m) => m.slug),
            ),
          },
        },
        system: [
          {
            type: "text",
            text: buildSystem(contexts, methodologies, base),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: text }],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        res.status === 429
          ? "Limite de tokens por minuto da Anthropic atingido. O material é grande demais para o tier atual da conta — reduza o conteúdo ou aumente o tier."
          : String(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`),
      );
    }
    if (data.stop_reason === "max_tokens") {
      throw new Error(
        "O material é muito extenso para ser estruturado em uma única resposta. Reduza o conteúdo e tente de novo.",
      );
    }

    const textBlock = (data.content ?? []).find((b: { type?: string }) => b?.type === "text");
    if (!textBlock?.text) throw new Error("resposta sem conteúdo estruturado");
    let result: { name?: string; call_types?: GeneratedCallType[] };
    try {
      result = JSON.parse(textBlock.text);
    } catch {
      throw new Error("A IA retornou um resultado incompleto. Tente reduzir o material.");
    }

    await persist(playbookId, playbook.created_by ?? null, result);
    await setPlaybook(playbookId, {
      status: "ready",
      error_detail: null,
      usage: data.usage ?? null,
      // Só assume o nome sugerido se o usuário não escreveu um.
      ...(result.name && !playbook.name?.trim() ? { name: result.name } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("generate-playbook falhou:", message);
    await setPlaybook(playbookId, { status: "error", error_detail: { message } }).catch(() => {});
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY não configurada nos secrets" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const playbookId = typeof body.playbookId === "string" ? body.playbookId : "";
    const stage = body.stage === "poll" ? "poll" : "generate";
    if (!playbookId) return json({ ok: false, error: "playbookId é obrigatório" }, 400);

    const { data: playbook, error } = await db
      .from("playbooks")
      .select("id, status, updated_at")
      .eq("id", playbookId)
      .single();
    if (error || !playbook) return json({ ok: false, error: "playbook não encontrado" }, 404);

    if (stage === "poll") {
      if (playbook.status !== "generating") {
        return json({ ok: true, done: playbook.status === "ready", status: playbook.status }, 200);
      }
      // Preso há tempo demais sem terminar = execução morta; libera para retry.
      const since = Date.parse(playbook.updated_at ?? "");
      if (Number.isFinite(since) && Date.now() - since > STALE_AFTER_MS) {
        await setPlaybook(playbookId, {
          status: "error",
          error_detail: { message: "a geração não terminou — tente novamente" },
        });
        return json({ ok: true, done: true, status: "error" }, 200);
      }
      return json({ ok: true, done: false, status: playbook.status }, 200);
    }

    if (playbook.status === "generating") {
      return json({ ok: false, error: "geração já em andamento para este playbook" }, 409);
    }

    await setPlaybook(playbookId, { status: "generating", error_detail: null });
    EdgeRuntime.waitUntil(run(playbookId));
    return json({ ok: true, playbookId }, 202);
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e instanceof Error ? e.message : e) };
    return json({ ok: false, error: detail }, 500);
  }
});
