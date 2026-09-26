import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection, resolveOfferContext } from "../_shared/destination.ts";
import { invokeFunction } from "../_shared/invoke.ts";
import type { CompletionRun } from "../_shared/roleplay-completion.ts";
import {
  applyContextContent,
  type GuardrailSeed,
  type ObjectionSeed,
} from "../_shared/context-content.ts";
import {
  buildPersonaFromCaseSetup,
  createCaseSetup,
  createPersona,
  DIFFICULTY_LEVEL_IDS,
  difficultyLevelIdFor,
  generateCaseSetup,
  generatePersonaFromContext,
  getCaseSetup,
  getCaseSetupRaw,
  isHmlCaseSetupComplete,
  listCallContexts,
  listCaseSetupIdsByContext,
  overlayVerbatimOnGenerated,
  type PerfectingEnv,
  PerfectingError,
  resolveCallContextTypeId,
  resolveMethodologyId,
  setCaseSetupPersona,
  truncateForApi,
} from "../_shared/perfecting.ts";

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * PROD: persona copiada do comprador do case_setup recém-criado, sem voz, travada
 * nele. Sem persona no contexto o catálogo da org vem vazio e a Perfecting mostra a
 * tela antiga de roleplays.
 *
 * Não cria se outro roleplay do contexto estiver sem persona: o backend sorteia uma
 * persona do contexto a cada chamada desses, e eles passariam a ser atendidos por esta
 * (com o roteiro deste roleplay). Nunca derruba o envio — o case_setup já existe e
 * funciona no formato antigo; a falha volta como aviso.
 */
async function attachProdPersona(
  env: PerfectingEnv,
  token: string,
  contextId: number,
  caseSetupId: number,
): Promise<{ personaId: number | null; warning: string | null }> {
  let personaId: number | null = null;
  try {
    const otherIds = (await listCaseSetupIdsByContext(env, token, contextId)).filter(
      (id) => id !== caseSetupId,
    );
    const unlocked: number[] = [];
    for (const id of otherIds) {
      if ((await getCaseSetup(env, token, id)).persona_id == null) unlocked.push(id);
    }
    if (unlocked.length > 0) {
      return {
        personaId: null,
        warning:
          `persona não criada: o contexto ${contextId} tem roleplays sem persona ` +
          `(${unlocked.join(", ")}), que passariam a ser atendidos por ela`,
      };
    }

    const payload = buildPersonaFromCaseSetup(
      await getCaseSetupRaw(env, token, caseSetupId),
      contextId,
    );
    if (!payload) {
      return { personaId: null, warning: `persona não criada: roleplay ${caseSetupId} sem case_prompt` };
    }
    personaId = (await createPersona(env, token, payload)).id;
    await setCaseSetupPersona(env, token, caseSetupId, personaId);
    return { personaId, warning: null };
  } catch (e) {
    const reason = e instanceof PerfectingError ? JSON.stringify(e.detail) : String(e);
    return {
      personaId,
      warning:
        personaId != null
          ? `persona ${personaId} criada, mas não travada no roleplay ${caseSetupId}: ${reason}`
          : `persona não criada: ${reason}`,
    };
  }
}

/**
 * Exporta um rascunho para a org de destino na Perfecting.
 * Fluxo: superadmin login → login_as_user → offer → context → (persona HML) → case_setup
 * → (persona PROD) → complete-roleplay.
 * Reuso por conexão: pula offer/context se já existe id na ponte. Idempotente.
 *
 * O case_setup/create sozinho não fecha o roleplay: rubricas, conteúdo por etapa e
 * comportamento são outros endpoints (minutos de IA, não cabem aqui). Por isso o
 * rascunho termina em "completing" e quem o marca como exportado — ou incompleto —
 * é o gate da complete-roleplay.
 */
async function exportDraft(draftId: string): Promise<{ caseSetupId: number }> {
  const { data: draft, error } = await db
    .from("roleplay_drafts")
    .select("*, offers(*), contexts(*), connections(*)")
    .eq("id", draftId)
    .single();
  if (error || !draft) throw new PerfectingError(404, "rascunho não encontrado");

  const connection = draft.connections;

  // Defaults globais (app_settings) — usados quando o draft não traz scenario.
  const { data: settings } = await db
    .from("app_settings")
    .select("default_difficulty, default_call_context_slug, default_methodology_slug")
    .eq("created_by", draft.created_by)
    .maybeSingle();

  await db.from("roleplay_drafts").update({ status: "exporting", error_detail: null }).eq("id", draftId);
  const { data: job } = await db
    .from("export_jobs")
    .insert({ draft_id: draftId, state: "running", started_at: new Date().toISOString(), created_by: draft.created_by })
    .select()
    .single();
  const jobId = job?.id;
  const setJob = (patch: Record<string, unknown>) =>
    jobId ? db.from("export_jobs").update(patch).eq("id", jobId) : Promise.resolve();

  // 1) login + impersonação no ambiente da conexão (hml | prod)
  const { env, token } = await authenticateConnection(connection);

  // resolver call_context: scenario do draft → default global → 1º disponível.
  // ⚠️ /role_plays/generate QUEBRA (500) se call_context OU dificuldade faltarem.
  const callContextSlug =
    draft.scenario?.call_context_slug ?? settings?.default_call_context_slug ?? null;
  let callContextTypeId = await resolveCallContextTypeId(env, token, callContextSlug);
  if (callContextTypeId == null) {
    const all = await listCallContexts(env, token);
    callContextTypeId = all[0]?.id;
  }
  if (callContextTypeId == null) {
    throw new PerfectingError(422, "nenhum call_context disponível na Perfecting");
  }

  // dificuldade: scenario → default global → "medium"; sempre easy/medium/hard.
  const rawDifficulty = draft.scenario?.difficulty ?? settings?.default_difficulty ?? "medium";
  const difficulty = VALID_DIFFICULTIES.has(rawDifficulty) ? rawDifficulty : "medium";
  // O id explícito é o que garante que roleplay e objeções fiquem no mesmo nível:
  // o prompt só inclui objeção com difficulty_level_id IGUAL ao do case_setup.
  const difficultyLevelId = difficultyLevelIdFor(difficulty);

  // metodologia padrão (slug, resolvido no ambiente de destino). Sem ela o roleplay
  // nasce sem conteúdo por etapa — mas nunca derruba o envio: o fechamento tenta
  // vincular depois e o gate registra o que faltou.
  const methodologySlug = settings?.default_methodology_slug ?? null;
  let methodologyId: number | undefined;
  if (methodologySlug) {
    try {
      methodologyId = await resolveMethodologyId(env, token, methodologySlug);
      if (methodologyId == null) {
        console.warn(`export-roleplay[metodologia]: slug "${methodologySlug}" não existe em ${env}`);
      }
    } catch (e) {
      console.warn("export-roleplay[metodologia]: falha ao listar —", String(e));
    }
  }

  // 2/3) OFFER + CONTEXT (reuso por conexão)
  const { perfectingContextId } = await resolveOfferContext(db, draft, env, token, (step) =>
    setJob({ step }),
  );

  // 3a) Objeções/guardrails do material — context-wide, herdados pelo case_setup.
  // Mesmo helper do modo playbook; nunca derruba o envio (falha vira aviso).
  const seedObjections = (draft.scenario?.objections ?? []) as ObjectionSeed[];
  const seedGuardrails = (draft.scenario?.guardrails ?? []) as GuardrailSeed[];
  if (seedObjections.length > 0 || seedGuardrails.length > 0) {
    await setJob({ step: "context_content" });
    // Os três níveis: o prompt é montado na hora da call com o nível escolhido pelo
    // vendedor naquela call, que pode diferir do nível do roleplay.
    const applied = await applyContextContent(
      env,
      token,
      perfectingContextId,
      seedObjections,
      seedGuardrails,
      DIFFICULTY_LEVEL_IDS,
    );
    if (applied.warnings.length > 0) {
      console.warn("export-roleplay[context_content]:", JSON.stringify(applied.warnings));
    }
  }

  // 3b) PERSONA HML — gerada do contexto, com voz v2 (HML aceita override de voz).
  // Em PROD a persona vem depois do case_setup (passo 5).
  let personaId: number | null = null;
  if (env === "hml") {
    await setJob({ step: "persona" });
    const persona = await generatePersonaFromContext(env, token, perfectingContextId);
    personaId = persona.id;
    await setJob({ error_detail: { persona_id: personaId } });
  }

  // 4) CASE SETUP
  // Se o draft traz um payload escrito à mão (scenario.case_setup_payload):
  //   prod → manda VERBATIM
  //   hml  → normaliza; se faltar profile/voz, completa via /generate e
  //          sobrepõe só training_* / instruções do verbatim.
  await setJob({ step: "case_setup" });
  const verbatim = draft.scenario?.case_setup_payload as
    | Record<string, unknown>
    | null
    | undefined;
  const scenarioInput = {
    call_context_type_id: callContextTypeId,
    scenario_difficulty_level: difficulty,
    training_objective: draft.scenario?.objective ?? undefined,
    training_targeted_sales_skills: draft.scenario?.skill ?? undefined,
    // /role_plays/generate quebra (500 genérico) com instruções longas demais.
    aditional_instructions: draft.scenario?.aditional_instructions
      ? truncateForApi(draft.scenario.aditional_instructions)
      : undefined,
  };
  let genCase: Record<string, unknown>;
  if (verbatim) {
    const withIds = {
      ...verbatim,
      call_context_type_id: callContextTypeId,
      scenario_difficulty_level: difficulty,
    };
    if (env === "hml" && !isHmlCaseSetupComplete(withIds)) {
      const generated = await generateCaseSetup(env, token, perfectingContextId, scenarioInput);
      genCase = overlayVerbatimOnGenerated(generated, withIds);
    } else {
      genCase = withIds;
    }
  } else {
    genCase = await generateCaseSetup(env, token, perfectingContextId, scenarioInput);
  }

  const { id: caseSetupId, elevenlabs_agent_id } = await createCaseSetup(
    env,
    token,
    genCase,
    perfectingContextId,
    callContextTypeId,
    connection.default_user_group_id ?? null,
    {
      // omite generate_case_prompt → usa o default da API (true), igual aos exports
      // normais: a Perfecting monta o case prompt a partir dos nossos campos exatos.
      ...(methodologyId != null && { methodologyIds: [methodologyId] }),
      ...(difficultyLevelId != null && { difficultyLevelId }),
    },
  );

  // 5) PERSONA PROD
  let personaWarning: string | null = null;
  if (env === "prod") {
    await setJob({ step: "persona" });
    const attached = await attachProdPersona(env, token, perfectingContextId, caseSetupId);
    personaId = attached.personaId;
    personaWarning = attached.warning;
    if (personaWarning) console.warn("export-roleplay[persona]:", personaWarning);
  }

  const detail =
    personaId != null || personaWarning
      ? {
          ...(personaId != null && { persona_id: personaId }),
          ...(personaWarning && { persona_warning: personaWarning }),
        }
      : null;
  // 6) FECHAMENTO — o create só monta a casca do roleplay: rubricas, conteúdo por
  // etapa e comportamento são outros endpoints, que levam minutos e não cabem nesta
  // invocação. Vai para "completing" e a complete-roleplay assume daqui; o gate de
  // lá é quem decide entre "exported" e "incomplete".
  // O disparo é aqui (e não no fim do lote) porque em PROD a persona só existe
  // depois do passo 5 — e sem persona nada do que o fechamento gera entra no prompt.
  const completionRun: CompletionRun = {
    case_setup_id: caseSetupId,
    context_id: perfectingContextId,
    persona_id: personaId,
    methodology_id: methodologyId ?? null,
    methodology_slug: methodologySlug,
    difficulty_level_id: difficultyLevelId ?? null,
    objections_seeded: seedObjections.length > 0,
    stage: "queued",
    steps: {},
    attempt_round: 1,
    started_at: new Date().toISOString(),
    finished_at: null,
  };
  await db
    .from("roleplay_drafts")
    .update({
      status: "completing",
      perfecting_case_setup_id: caseSetupId,
      elevenlabs_agent_id,
      error_detail: personaWarning ? detail : null,
      completion_run: completionRun,
    })
    .eq("id", draftId);
  await setJob({
    state: "done",
    finished_at: new Date().toISOString(),
    error_detail: detail,
  });
  invokeFunction("complete-roleplay", { draftId });

  return { caseSetupId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  let draftIds: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body.draftIds)) draftIds = body.draftIds;
    else if (body.draftId) draftIds = [body.draftId];
  } catch {
    return json({ ok: false, error: "corpo inválido" }, 400);
  }
  if (draftIds.length === 0) return json({ ok: false, error: "nenhum draftId" }, 400);

  // Lote: sequencial (cada export = ~3 gerações de IA → limitar concorrência).
  const results: Array<{ draftId: string; ok: boolean; caseSetupId?: number; error?: unknown }> = [];
  for (const id of draftIds) {
    try {
      const { caseSetupId } = await exportDraft(id);
      results.push({ draftId: id, ok: true, caseSetupId });
    } catch (e) {
      const detail = e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
      await db.from("roleplay_drafts").update({ status: "error", error_detail: detail }).eq("id", id);
      await db
        .from("export_jobs")
        .update({ state: "error", error_detail: detail, finished_at: new Date().toISOString() })
        .eq("draft_id", id)
        .eq("state", "running");
      results.push({ draftId: id, ok: false, error: detail });
    }
  }

  const allOk = results.every((r) => r.ok);
  return json({ ok: allOk, results }, allOk ? 200 : 207);
});
