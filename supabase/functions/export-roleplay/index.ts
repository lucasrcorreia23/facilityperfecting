import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import {
  createCaseSetup,
  createContext,
  createOffer,
  generateCaseSetup,
  generateContext,
  generateOffer,
  listCallContexts,
  loginAsUser,
  loginSuperadmin,
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
 * Fluxo: superadmin login → login_as_user → offer → context → case_setup.
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
  if (!connection) throw new PerfectingError(400, "rascunho sem conexão de destino");
  if (connection.target_user_id == null) {
    throw new PerfectingError(400, "conexão sem gestor-alvo (target_user_id)");
  }

  const offer = draft.offers;
  const context = draft.contexts; // pode ser null → criamos via generate
  const connId = connection.id;

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

  // 1) login + impersonação
  const saToken = await loginSuperadmin();
  const token = await loginAsUser(saToken, connection.target_user_id, connection.org_id);

  // resolver call_context: scenario do draft → default global → 1º disponível.
  // ⚠️ /role_plays/generate QUEBRA (500) se call_context OU dificuldade faltarem.
  const callContextSlug =
    draft.scenario?.call_context_slug ?? settings?.default_call_context_slug ?? null;
  let callContextTypeId = await resolveCallContextTypeId(token, callContextSlug);
  if (callContextTypeId == null) {
    const all = await listCallContexts(token);
    callContextTypeId = all[0]?.id;
  }
  if (callContextTypeId == null) {
    throw new PerfectingError(422, "nenhum call_context disponível na Perfecting");
  }

  // dificuldade: scenario → default global → "medium"; sempre easy/medium/hard.
  const rawDifficulty = draft.scenario?.difficulty ?? settings?.default_difficulty ?? "medium";
  const difficulty = VALID_DIFFICULTIES.has(rawDifficulty) ? rawDifficulty : "medium";

  // 2) OFFER (reuso por conexão)
  await setJob({ step: "offer" });
  let perfectingOfferId: number;
  const { data: offerBridge } = await db
    .from("offer_perfecting_ids")
    .select("perfecting_offer_id")
    .eq("offer_id", offer.id)
    .eq("connection_id", connId)
    .maybeSingle();
  if (offerBridge?.perfecting_offer_id) {
    perfectingOfferId = offerBridge.perfecting_offer_id;
  } else {
    const gen = await generateOffer(token, offer.offer_name, offer.general_description);
    perfectingOfferId = await createOffer(
      token,
      gen,
      offer.offer_name,
      offer.general_description,
      offer.url ?? "",
    );
    await db.from("offer_perfecting_ids").insert({
      offer_id: offer.id,
      connection_id: connId,
      perfecting_offer_id: perfectingOfferId,
    });
  }

  // 3) CONTEXT (reuso por conexão)
  await setJob({ step: "context" });
  let perfectingContextId: number;
  const localContextId = context?.id ?? null;
  const { data: ctxBridge } = localContextId
    ? await db
        .from("context_perfecting_ids")
        .select("perfecting_context_id")
        .eq("context_id", localContextId)
        .eq("connection_id", connId)
        .maybeSingle()
    : { data: null };
  if (ctxBridge?.perfecting_context_id) {
    perfectingContextId = ctxBridge.perfecting_context_id;
  } else {
    const gen = await generateContext(token, perfectingOfferId, context?.target_notes ?? "");
    perfectingContextId = await createContext(token, gen, perfectingOfferId);
    if (localContextId) {
      await db.from("context_perfecting_ids").insert({
        context_id: localContextId,
        connection_id: connId,
        perfecting_context_id: perfectingContextId,
      });
    }
  }

  // 4) CASE SETUP
  // Se o draft traz um payload escrito à mão (scenario.case_setup_payload), PULAMOS
  // o /role_plays/generate (IA) e mandamos os campos VERBATIM. Caso contrário, fluxo
  // normal: a IA gera o case setup a partir do contexto/cenário.
  await setJob({ step: "case_setup" });
  const verbatim = draft.scenario?.case_setup_payload as
    | Record<string, unknown>
    | null
    | undefined;
  const genCase = verbatim
    ? {
        // o conteúdo vem exatamente como escrito; só call_context/dificuldade
        // são reforçados pelo fluxo padrão (resolução de id + enum válido).
        ...verbatim,
        call_context_type_id: callContextTypeId,
        scenario_difficulty_level: difficulty,
      }
    : await generateCaseSetup(token, perfectingContextId, {
        call_context_type_id: callContextTypeId,
        scenario_difficulty_level: difficulty,
        training_objective: draft.scenario?.objective ?? undefined,
        training_targeted_sales_skills: draft.scenario?.skill ?? undefined,
        aditional_instructions: draft.scenario?.aditional_instructions ?? undefined,
      });

  const { id: caseSetupId, elevenlabs_agent_id } = await createCaseSetup(
    token,
    genCase,
    perfectingContextId,
    callContextTypeId,
    connection.default_user_group_id ?? null,
    // create simples (sem ?generate_case_prompt) — mesmo contrato dos exports que
    // já funcionam. Os campos verbatim bastam; a Perfecting monta o prompt server-side.
    false,
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
  await setJob({ state: "done", finished_at: new Date().toISOString() });

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
