import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { authenticateConnection, resolveOfferContext } from "../_shared/destination.ts";
import {
  createCaseSetup,
  generateCaseSetup,
  generatePersonaFromContext,
  isHmlCaseSetupComplete,
  listCallContexts,
  overlayVerbatimOnGenerated,
  PerfectingError,
  resolveCallContextTypeId,
} from "../_shared/perfecting.ts";

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Exporta um rascunho para a org de destino na Perfecting.
 * Fluxo: superadmin login → login_as_user → offer → context → (persona HML) → case_setup.
 * Reuso por conexão: pula offer/context se já existe id na ponte. Idempotente.
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
    .select("default_difficulty, default_call_context_slug")
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

  // 2/3) OFFER + CONTEXT (reuso por conexão)
  const { perfectingContextId } = await resolveOfferContext(db, draft, env, token, (step) =>
    setJob({ step }),
  );

  // 3b) PERSONA (só HML — a API persiste e o roleplay entra no catálogo novo)
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
    aditional_instructions: draft.scenario?.aditional_instructions ?? undefined,
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
    // omite generate_case_prompt → usa o default da API (true), igual aos exports
    // normais: a Perfecting monta o case prompt a partir dos nossos campos exatos.
  );

  await db
    .from("roleplay_drafts")
    .update({
      status: "exported",
      perfecting_case_setup_id: caseSetupId,
      elevenlabs_agent_id,
      error_detail: null,
    })
    .eq("id", draftId);
  await setJob({
    state: "done",
    finished_at: new Date().toISOString(),
    error_detail: personaId != null ? { persona_id: personaId } : null,
  });

  return { caseSetupId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
