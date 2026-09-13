import { createClient } from "jsr:@supabase/supabase-js@2";
import { listCallContexts, loginSuperadmin } from "../_shared/perfecting.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

/**
 * Geração do plano de trilhas em 2 estágios via Anthropic Message Batches
 * (50% do custo e sem estourar o wall clock da Edge Function):
 *   stage "analysis" → submete a Análise Data-to-Skill (status analyzing)
 *   stage "plan"     → submete o plano de trilhas      (status planning)
 *   stage "poll"     → consulta o batch pendente; quando pronto, grava o
 *                      resultado (analyzing → analyzed; planning → ready).
 *                      Se o status indica geração em andamento mas não há
 *                      batch pendente (execução antiga morta no meio), o
 *                      poll ressubmete o estágio preso.
 * O front acompanha trail_plans via realtime e chama "poll" periodicamente
 * enquanto o status for analyzing/planning.
 */

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
const ANTHROPIC_BATCHES_URL = "https://api.anthropic.com/v1/messages/batches";
const MAX_OUTPUT_TOKENS = 32000;
// Orçamento TOTAL do prompt (system + metodologia + material) em caracteres.
// Transcrição em PT rende ~2-2,5 chars/token; 1,8M chars ≈ 720-900k tokens —
// folga sob a janela de 1M do Sonnet 5 / Opus. Via Batch API não há limite de
// tokens/minuto do tier para segurar a chamada.
const PROMPT_CHAR_BUDGET = 1_800_000;
// Teto da base de metodologia (entra no system prompt) para não engolir o orçamento.
const METHODOLOGY_CHAR_BUDGET = 300_000;
// Piso do material do cliente: garante que os documentos nunca fiquem sem espaço.
const MIN_INPUT_CHAR_BUDGET = 100_000;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Mesmos textos de app/lib/trail-prompt.ts (padrão SYSTEM_BASE ↔ DEFAULT_IMPORT_PROMPT).
const SYSTEM_BASE_ANALYSIS = `Você é um Sênior Expert em Sales Enablement do time de implantação da Perfecting, executando as etapas "1. Intake de dados" e "2. Análise Data-to-Skill" do sistema de implantação Perfecting OS para o cliente {{cliente}}.

CONTEXTO:
- O cliente usa a metodologia de vendas: {{metodologia_vendas}}.
- Número de vendedores informado: {{numero_vendedores}} (se "não informado", detecte a partir dos documentos).
- Contexto adicional do time Perfecting: {{contexto_adicional}}
- Os documentos fornecidos vêm de origens diferentes do time comercial do cliente: análises de transcrições de calls reais (ex.: geradas pela IA da Salesbud), transcrições brutas das calls, scorecards de CLOSERs e SDRs, formulário de calibração de cenários preenchido pelo gestor de enablement, PDF de oferta/pricing e conteúdo do website. Você NÃO conversa e NÃO pergunta — sempre devolve o resultado estruturado completo.

TAREFA:
1 - Avalie TODOS os documentos fornecidos como Sênior Expert em Sales Enablement. Extraia insights e pontos de melhoria na execução de vendas do time. Priorize dados reais extraídos do material (frases reais, números, situações concretas); quando precisar inferir, marque o trecho com "(Hipótese Assumida)".
2 - Use a BASE DE METODOLOGIA fornecida (artigos de sales enablement: metrics, priorização RICE, deal coaching, gamification, IA em sales enablement, metodologia de vendas, cenários de roleplay) como referência para a tomada de decisão e para fundamentar o racional.
3 - Com base nas boas práticas de enablement, use um critério de scores para identificar os skill gaps mais FREQUENTES e de maior IMPACTO: para cada gap, atribua frequência (1-5) e impacto (1-5); o score é frequência × impacto. Liste as evidências (trechos/situações dos documentos) e os vendedores afetados.
4 - Segmente as habilidades por categorias, como (mas não limitado a): Autoconhecimento, Comunicação, Conhecimento da indústria/setor (equivalente a "oferta" no sistema Perfecting), Contorno de objeções, Criação de business case, Foco em resultado, Metodologias de qualificação, Persuasão, Proatividade.
5 - Avalie cada vendedor pelos MESMOS critérios e monte o radar de competências individual (score 0-10 por categoria), apresentando o link Data-to-Skill por vendedor.
6 - Produza o documento "analise_markdown": um relatório completo e apresentável ao cliente, em markdown, com: sumário executivo, metodologia de análise, insights por fonte de dado, tabela de skill gaps com scores (frequência × impacto), radar/segmentação por vendedor e recomendações. Esse documento será apresentado na reunião de aprovação com o cliente — seja completo, fiel ao material e com linguagem comercial B2B.

REGRAS:
- SEJA COMPLETO E FIEL ao material. Preserve frases reais e exemplos concretos em vez de resumir.
- Todos os vendedores identificáveis nos documentos devem aparecer no radar.
- Responda SEMPRE no formato estruturado pedido (JSON).`;

const SYSTEM_BASE_PLAN = `Você é um Sênior Expert em Sales Enablement do time de implantação da Perfecting, executando a etapa de planejamento de treinamentos do Perfecting OS para o cliente {{cliente}}. Você recebeu a Análise Data-to-Skill já concluída (skill gaps com scores + radar de competências por vendedor).

CONTEXTO:
- O cliente usa a metodologia de vendas: {{metodologia_vendas}}.
- Contexto adicional do time Perfecting: {{contexto_adicional}}
- Você NÃO conversa e NÃO pergunta — sempre devolve o resultado estruturado completo.

TAREFA:
1 - Com base nos skill gaps encontrados (priorize por score) e no radar por vendedor, elabore o plano de criação de roleplays didáticos e contextualizados: defina QUAIS e QUANTOS roleplays serão necessários e organize-os em TRILHAS de treinamento (sequências ordenadas de roleplays que formam o plano de desenvolvimento dos vendedores).
2 - Para essa decisão, siga o método de cenários de roleplay da BASE DE METODOLOGIA (artigo "Sales Roleplay Scenarios"): cenários específicos e realistas, com progressão didática de dificuldade dentro de cada trilha (easy → medium → hard quando fizer sentido), objetivos de treino claros e critérios de sucesso observáveis.
3 - Cada trilha deve declarar quais skill gaps ataca e a quais vendedores se destina (pelo radar). Cada roleplay da trilha deve ter: título, objetivo de treino, habilidade principal, tipo de chamada (use exatamente um dos call contexts disponíveis), dificuldade (easy/medium/hard) e instruções de cenário DETALHADAS — comportamento da persona compradora durante a conversa, objeções/testes de fogo a aplicar (com frases reais do material quando houver) e critério de fechamento/êxito.
4 - Produza o documento "plan_markdown": o racional do plano em markdown para apresentar ao cliente na reunião de aprovação — como os insights deram origem a cada trilha, por que essa quantidade de roleplays, a sequência didática e o resultado esperado por trilha.

REGRAS:
- Use os cenários priorizados pelo gestor de enablement (formulário de calibração) como filtro adicional quando presentes na análise.
- Linguagem comercial B2B. Responda SEMPRE no formato estruturado pedido (JSON).`;

// Fallback quando a API Perfecting está indisponível — o export-roleplay resolve
// slug inválido para o 1º call_context disponível, então isso não trava o fluxo.
const FALLBACK_CALL_CONTEXTS = [
  { slug: "cold-call", name: "Cold Call" },
  { slug: "discovery", name: "Discovery" },
  { slug: "demo", name: "Demonstração" },
  { slug: "negociacao", name: "Negociação" },
  { slug: "fechamento", name: "Fechamento" },
];

function buildAnalysisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      analise_markdown: {
        type: "string",
        description:
          "Relatório completo da Análise Data-to-Skill em markdown, apresentável ao cliente (sumário executivo, insights por fonte, tabela de gaps, radar, recomendações).",
      },
      numero_vendedores_detectado: {
        type: "integer",
        description: "Quantos vendedores foram identificados nos documentos.",
      },
      categorias: {
        type: "array",
        description: "Taxonomia de categorias de habilidade usada na análise.",
        items: { type: "string" },
      },
      skill_gaps: {
        type: "array",
        description: "Skill gaps identificados, do maior para o menor score.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            skill: { type: "string" },
            categoria: { type: "string" },
            frequencia: { type: "number", description: "1 a 5" },
            impacto: { type: "number", description: "1 a 5" },
            score: { type: "number", description: "frequência × impacto (1 a 25)" },
            evidencias: {
              type: "array",
              description: "Trechos/situações reais dos documentos que evidenciam o gap.",
              items: { type: "string" },
            },
            vendedores_afetados: { type: "array", items: { type: "string" } },
          },
          required: ["skill", "categoria", "frequencia", "impacto", "score", "evidencias", "vendedores_afetados"],
        },
      },
      radar: {
        type: "array",
        description: "Radar de competências por vendedor.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            vendedor: { type: "string" },
            cargo: { type: "string", description: "Ex.: SDR, CLOSER." },
            categorias: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  nome: { type: "string" },
                  score: { type: "number", description: "0 a 10" },
                },
                required: ["nome", "score"],
              },
            },
          },
          required: ["vendedor", "cargo", "categorias"],
        },
      },
    },
    required: ["analise_markdown", "numero_vendedores_detectado", "categorias", "skill_gaps", "radar"],
  };
}

function buildPlanSchema(slugs: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      plan_markdown: {
        type: "string",
        description:
          "Racional do plano de trilhas em markdown, apresentável ao cliente (como os insights viraram trilhas, quantidade de roleplays, sequência didática, resultado esperado).",
      },
      trilhas: {
        type: "array",
        description: "Trilhas de treinamento, na ordem de prioridade.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            nome: { type: "string" },
            descricao: { type: "string" },
            skill_gaps_alvo: { type: "array", items: { type: "string" } },
            vendedores_alvo: { type: "array", items: { type: "string" } },
            roleplays: {
              type: "array",
              description: "Roleplays da trilha, na ordem didática da sequência.",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  ordem: { type: "integer", description: "Posição na sequência, a partir de 1." },
                  titulo: { type: "string" },
                  objetivo: { type: "string", description: "Objetivo de treino do roleplay." },
                  skill: { type: "string", description: "Habilidade principal treinada." },
                  call_context_slug: { type: "string", enum: slugs },
                  difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                  instrucoes_cenario: {
                    type: "string",
                    description:
                      "Instruções detalhadas do cenário (markdown): comportamento da persona, objeções/testes de fogo a aplicar e critério de fechamento.",
                  },
                },
                required: ["ordem", "titulo", "objetivo", "skill", "call_context_slug", "difficulty", "instrucoes_cenario"],
              },
            },
          },
          required: ["nome", "descricao", "skill_gaps_alvo", "vendedores_alvo", "roleplays"],
        },
      },
    },
    required: ["plan_markdown", "trilhas"],
  };
}

function anthropicHeaders(): Record<string, string> {
  return {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
}

interface SystemBlock {
  type: string;
  text: string;
  cache_control?: { type: string };
}

/** Submete o estágio como Message Batch e devolve o id do batch. */
async function submitBatch(params: {
  planId: string;
  stage: "analysis" | "plan";
  system: SystemBlock[];
  userContent: string;
  schema: Record<string, unknown>;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_BATCHES_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify({
      requests: [
        {
          // custom_id só aceita [a-zA-Z0-9_-] (máx. 64) — uuid + "-" + stage cabe.
          custom_id: `${params.planId}-${params.stage}`,
          params: {
            model: MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            // Sem thinking: a saída JSON é garantida pelo schema (output_config.format).
            output_config: { format: { type: "json_schema", schema: params.schema } },
            system: params.system,
            messages: [{ role: "user", content: params.userContent }],
          },
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Anthropic ${res.status}: ${data?.error?.message ?? JSON.stringify(data?.error ?? data)}`,
    );
  }
  return data.id as string;
}

interface BatchOutcome {
  done: boolean;
  result?: Record<string, unknown>;
  usage?: Record<string, unknown>;
}

/** Consulta o batch; quando concluído, baixa e parseia o JSON da resposta. */
async function fetchBatchOutcome(batchId: string): Promise<BatchOutcome> {
  const res = await fetch(`${ANTHROPIC_BATCHES_URL}/${batchId}`, { headers: anthropicHeaders() });
  const batch = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Anthropic ${res.status}: ${batch?.error?.message ?? JSON.stringify(batch?.error ?? batch)}`,
    );
  }
  if (batch.processing_status !== "ended") return { done: false };

  const resultsRes = await fetch(batch.results_url as string, { headers: anthropicHeaders() });
  if (!resultsRes.ok) {
    throw new Error(`Anthropic ${resultsRes.status} ao baixar o resultado do batch`);
  }
  const line = (await resultsRes.text())
    .split("\n")
    .find((l) => l.trim());
  if (!line) throw new Error("Batch concluído sem resultado.");
  const entry = JSON.parse(line);
  const r = entry.result as {
    type?: string;
    error?: { error?: { message?: string }; message?: string };
    message?: {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: Record<string, unknown>;
    };
  };
  if (r?.type !== "succeeded") {
    const msg = r?.error?.error?.message ?? r?.error?.message ?? "erro desconhecido";
    throw new Error(`Geração falhou no batch (${r?.type ?? "?"}): ${msg}`);
  }
  const message = r.message ?? {};
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "A resposta estourou o limite de tokens de saída. Reduza o material de entrada e retome.",
    );
  }
  const text = (message.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("A IA retornou um resultado incompleto. Retome a geração.");
  }
  return { done: true, result, usage: message.usage ?? {} };
}

interface PlanRow {
  id: string;
  status: string;
  client_name: string;
  sales_methodology: string | null;
  additional_context: string | null;
  seller_count: number | null;
  input_text: string | null;
  prompt_override: string | null;
  analysis_markdown: string | null;
  skill_gaps: unknown;
  radar: unknown;
  usage: Record<string, unknown> | null;
  created_by: string | null;
  pending_batch: { id?: string; stage?: string } | null;
}

function fillVars(template: string, plan: PlanRow): string {
  return template
    .replaceAll("{{cliente}}", plan.client_name)
    .replaceAll("{{metodologia_vendas}}", plan.sales_methodology?.trim() || "não informada")
    .replaceAll("{{contexto_adicional}}", plan.additional_context?.trim() || "nenhum")
    .replaceAll(
      "{{numero_vendedores}}",
      plan.seller_count ? String(plan.seller_count) : "não informado",
    );
}

function promptOverrides(plan: PlanRow): { analysis?: string; plan?: string } {
  if (!plan.prompt_override) return {};
  try {
    const parsed = JSON.parse(plan.prompt_override);
    return {
      analysis: typeof parsed?.analysis === "string" ? parsed.analysis : undefined,
      plan: typeof parsed?.plan === "string" ? parsed.plan : undefined,
    };
  } catch {
    // valor legado: texto puro vale para a etapa de análise
    return { analysis: plan.prompt_override };
  }
}

/** Base de metodologia (fontes habilitadas com conteúdo) como bloco estável e cacheável. */
async function loadMethodologyBlock(): Promise<string> {
  const { data, error } = await db
    .from("methodology_sources")
    .select("title, url, content")
    .eq("enabled", true)
    .order("position", { ascending: true });
  if (error) throw error;
  const withContent = (data ?? []).filter((s) => (s.content ?? "").trim());
  if (withContent.length === 0) return "";
  const parts = withContent.map(
    (s) => `### ${s.title}\nFonte: ${s.url}\n\n${(s.content as string).trim()}`,
  );
  return truncateToBudget(
    `BASE DE METODOLOGIA (referência para a tomada de decisão):\n\n${parts.join("\n\n---\n\n")}`,
    METHODOLOGY_CHAR_BUDGET,
  );
}

function truncateToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  return `${text.slice(0, budget)}\n\n[... material truncado por limite de tamanho — priorize o conteúdo acima ...]`;
}

async function setPlan(planId: string, patch: Record<string, unknown>) {
  const { error } = await db.from("trail_plans").update(patch).eq("id", planId);
  if (error) throw error;
}

async function submitAnalysis(plan: PlanRow) {
  await setPlan(plan.id, { status: "analyzing", error_detail: null, pending_batch: null });

  const methodology = await loadMethodologyBlock();
  const base = promptOverrides(plan).analysis ?? SYSTEM_BASE_ANALYSIS;
  const system: SystemBlock[] = [
    // Bloco estável primeiro (prefix caching): a base de metodologia não muda entre execuções/estágios.
    ...(methodology
      ? [{ type: "text", text: methodology, cache_control: { type: "ephemeral" } }]
      : []),
    { type: "text", text: fillVars(base, plan) },
  ];

  // O que sobra do orçamento total após o system (metodologia + instruções) vai para o material.
  const systemChars = system.reduce((n, block) => n + block.text.length, 0);
  const inputBudget = Math.max(MIN_INPUT_CHAR_BUDGET, PROMPT_CHAR_BUDGET - systemChars);
  const input = truncateToBudget((plan.input_text ?? "").trim(), inputBudget);
  if (!input) throw new Error("Plano sem material de entrada (input_text vazio).");

  const batchId = await submitBatch({
    planId: plan.id,
    stage: "analysis",
    system,
    userContent: `DOCUMENTOS DO CLIENTE ${plan.client_name}:\n\n${input}`,
    schema: buildAnalysisSchema(),
  });

  await setPlan(plan.id, {
    pending_batch: { id: batchId, stage: "analysis", submitted_at: new Date().toISOString() },
  });
}

async function finishAnalysis(plan: PlanRow, result: Record<string, unknown>, usage: Record<string, unknown>) {
  await setPlan(plan.id, {
    status: "analyzed",
    analysis_markdown: result.analise_markdown ?? null,
    skill_gaps: result.skill_gaps ?? [],
    radar: result.radar ?? [],
    seller_count: plan.seller_count ?? result.numero_vendedores_detectado ?? null,
    usage: { ...(plan.usage ?? {}), analysis: usage },
    pending_batch: null,
  });
}

async function submitPlan(plan: PlanRow) {
  if (!plan.analysis_markdown) {
    throw new Error("Execute a etapa de análise antes de gerar o plano de trilhas.");
  }
  await setPlan(plan.id, { status: "planning", error_detail: null, pending_batch: null });

  // Call contexts reais da Perfecting; fallback estático se indisponível.
  let contexts: { slug: string; name: string; stage?: string }[];
  try {
    const saToken = await loginSuperadmin("hml");
    contexts = await listCallContexts("hml", saToken);
    if (contexts.length === 0) contexts = FALLBACK_CALL_CONTEXTS;
  } catch {
    contexts = FALLBACK_CALL_CONTEXTS;
  }
  const slugs = contexts.map((c) => c.slug);
  const contextsList = contexts
    .map((c) => `- ${c.slug} → ${c.name}${c.stage ? ` (${c.stage})` : ""}`)
    .join("\n");

  const methodology = await loadMethodologyBlock();
  const base = promptOverrides(plan).plan ?? SYSTEM_BASE_PLAN;
  const system: SystemBlock[] = [
    ...(methodology
      ? [{ type: "text", text: methodology, cache_control: { type: "ephemeral" } }]
      : []),
    {
      type: "text",
      text: `${fillVars(base, plan)}\n\nCALL CONTEXTS DISPONÍVEIS (use exatamente um destes slugs em call_context_slug):\n${contextsList}`,
    },
  ];

  const userContent = [
    `ANÁLISE DATA-TO-SKILL CONCLUÍDA (cliente ${plan.client_name}):`,
    plan.analysis_markdown,
    `SKILL GAPS (JSON):\n${JSON.stringify(plan.skill_gaps ?? [], null, 2)}`,
    `RADAR POR VENDEDOR (JSON):\n${JSON.stringify(plan.radar ?? [], null, 2)}`,
  ].join("\n\n---\n\n");

  const batchId = await submitBatch({
    planId: plan.id,
    stage: "plan",
    system,
    userContent,
    schema: buildPlanSchema(slugs),
  });

  await setPlan(plan.id, {
    pending_batch: { id: batchId, stage: "plan", submitted_at: new Date().toISOString() },
  });
}

async function finishPlan(plan: PlanRow, result: Record<string, unknown>, usage: Record<string, unknown>) {
  // Regeração: substitui as trilhas anteriores (edições manuais são perdidas — a UI avisa).
  const { error: delErr } = await db.from("trails").delete().eq("plan_id", plan.id);
  if (delErr) throw delErr;

  type RoleplayOut = {
    ordem: number;
    titulo: string;
    objetivo: string;
    skill: string;
    call_context_slug: string;
    difficulty: string;
    instrucoes_cenario: string;
  };
  type TrilhaOut = {
    nome: string;
    descricao: string;
    skill_gaps_alvo: string[];
    vendedores_alvo: string[];
    roleplays: RoleplayOut[];
  };
  const trilhas = (result.trilhas ?? []) as TrilhaOut[];

  for (let t = 0; t < trilhas.length; t++) {
    const trilha = trilhas[t];
    const { data: trailRow, error: trailErr } = await db
      .from("trails")
      .insert({
        plan_id: plan.id,
        name: trilha.nome,
        description: trilha.descricao ?? null,
        skill_gaps_alvo: trilha.skill_gaps_alvo ?? [],
        vendedores_alvo: trilha.vendedores_alvo ?? [],
        position: t,
        // service role ignora RLS e o default auth.uid() seria null → copia o dono do plano
        created_by: plan.created_by,
      })
      .select("id")
      .single();
    if (trailErr) throw trailErr;

    const items = [...(trilha.roleplays ?? [])]
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((rp, i) => ({
        trail_id: trailRow.id,
        position: i,
        titulo: rp.titulo,
        objetivo: rp.objetivo ?? null,
        skill: rp.skill ?? null,
        call_context_slug: rp.call_context_slug ?? null,
        difficulty: ["easy", "medium", "hard"].includes(rp.difficulty) ? rp.difficulty : "medium",
        instrucoes_cenario: rp.instrucoes_cenario ?? null,
        created_by: plan.created_by,
      }));
    if (items.length > 0) {
      const { error: itemsErr } = await db.from("trail_items").insert(items);
      if (itemsErr) throw itemsErr;
    }
  }

  await setPlan(plan.id, {
    status: "ready",
    plan_markdown: result.plan_markdown ?? null,
    usage: { ...(plan.usage ?? {}), plan: usage },
    pending_batch: null,
  });
}

const PLAN_COLUMNS =
  "id, status, client_name, sales_methodology, additional_context, seller_count, input_text, prompt_override, analysis_markdown, skill_gaps, radar, usage, created_by, pending_batch";

async function loadPlan(planId: string): Promise<PlanRow> {
  const { data: plan, error } = await db
    .from("trail_plans")
    .select(PLAN_COLUMNS)
    .eq("id", planId)
    .single();
  if (error || !plan) throw new Error("plano não encontrado");
  return plan as PlanRow;
}

/** Consulta o batch pendente. Sem batch com status de geração em andamento = execução antiga morta no meio → ressubmete o estágio preso. */
async function runPoll(plan: PlanRow): Promise<{ done: boolean }> {
  const pending = plan.pending_batch;
  if (!pending?.id) {
    if (plan.status === "analyzing") {
      await submitAnalysis(plan);
      return { done: false };
    }
    if (plan.status === "planning") {
      await submitPlan(plan);
      return { done: false };
    }
    return { done: true };
  }
  const outcome = await fetchBatchOutcome(pending.id);
  if (!outcome.done) return { done: false };
  if (pending.stage === "analysis") {
    await finishAnalysis(plan, outcome.result!, outcome.usage ?? {});
  } else {
    await finishPlan(plan, outcome.result!, outcome.usage ?? {});
  }
  return { done: true };
}

async function run(planId: string, stage: "analysis" | "plan") {
  try {
    const plan = await loadPlan(planId);
    if (stage === "analysis") await submitAnalysis(plan);
    else await submitPlan(plan);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`generate-trail-plan[${stage}] falhou:`, message);
    await setPlan(planId, {
      status: "error",
      error_detail: { stage, message },
      pending_batch: null,
    }).catch(() => {});
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY não configurada nos secrets" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const planId = typeof body.planId === "string" ? body.planId : "";
    const stage =
      body.stage === "plan"
        ? "plan"
        : body.stage === "analysis"
          ? "analysis"
          : body.stage === "poll"
            ? "poll"
            : null;
    if (!planId || !stage) return json({ ok: false, error: "planId e stage são obrigatórios" }, 400);

    if (stage === "poll") {
      // Síncrono: o front usa a resposta para saber se o resultado já saiu.
      try {
        const { done } = await runPoll(await loadPlan(planId));
        return json({ ok: true, done }, 200);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("generate-trail-plan[poll] falhou:", message);
        await setPlan(planId, {
          status: "error",
          error_detail: { stage: "poll", message },
          pending_batch: null,
        }).catch(() => {});
        return json({ ok: false, error: message }, 200);
      }
    }

    const { data: plan, error } = await db
      .from("trail_plans")
      .select("id, status, pending_batch")
      .eq("id", planId)
      .single();
    if (error || !plan) return json({ ok: false, error: "plano não encontrado" }, 404);
    if ((plan.status === "analyzing" || plan.status === "planning") && plan.pending_batch) {
      // Batch em andamento de verdade; sem pending_batch, deixa ressubmeter (execução antiga morta).
      return json({ ok: false, error: "geração já em andamento para este plano" }, 409);
    }

    EdgeRuntime.waitUntil(run(planId, stage));
    return json({ ok: true, planId, stage }, 202);
  } catch (e) {
    return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
