"use client";

import { createClient } from "@/app/lib/supabase/client";
import type {
  CallContextType,
  Connection,
  CriteriaWeights,
  DraftRow,
  EvalWeights,
  EvaluationRound,
  ProcessImportResult,
  Profile,
  RoleplayEvaluation,
  RoleplayReadiness,
  RoundStatus,
  ScenarioConfig,
  TrackingClient,
} from "@/app/lib/types";
import { defaultEvalWeights } from "@/app/lib/evaluation-criteria";

const DEFAULT_WEIGHTS: CriteriaWeights = {
  weight_prompt: 0.3,
  weight_roteiro: 0.4,
  weight_teste: 0.3,
};

/** Cria source + offer + draft a partir de um texto importado. */
export async function createDraftFromText(params: {
  text: string;
  offerName: string;
  sourceType: "paste" | "file";
  filePath?: string | null;
  meta?: Record<string, unknown>;
  connectionId?: string | null;
  scenario?: ScenarioConfig;
  /** Notas de buyer persona (Grupo 2) → vira um contexto explícito ligado ao draft. */
  contextNotes?: string | null;
}): Promise<{ draftId: string }> {
  const supabase = createClient();

  const { data: source, error: srcErr } = await supabase
    .from("sources")
    .insert({
      type: params.sourceType,
      raw_text: params.text,
      file_path: params.filePath ?? null,
      meta: params.meta ?? {},
    })
    .select("id")
    .single();
  if (srcErr) throw srcErr;

  const { data: offer, error: offErr } = await supabase
    .from("offers")
    .insert({
      offer_name: params.offerName,
      general_description: params.text,
      source_id: source.id,
    })
    .select("id")
    .single();
  if (offErr) throw offErr;

  // Contexto explícito (buyer persona) — só quando há notas de perfil.
  let contextId: string | null = null;
  if (params.contextNotes?.trim()) {
    const { data: context, error: ctxErr } = await supabase
      .from("contexts")
      .insert({
        offer_id: offer.id,
        name: `${params.offerName} — perfil`,
        target_notes: params.contextNotes.trim(),
      })
      .select("id")
      .single();
    if (ctxErr) throw ctxErr;
    contextId = context.id;
  }

  const { data: draft, error: drftErr } = await supabase
    .from("roleplay_drafts")
    .insert({
      offer_id: offer.id,
      context_id: contextId,
      connection_id: params.connectionId ?? null,
      scenario: params.scenario ?? {},
      title: params.offerName,
    })
    .select("id")
    .single();
  if (drftErr) throw drftErr;

  return { draftId: draft.id };
}

/** Novo cenário (draft) reusando uma offer existente (reuso). */
export async function createScenarioFromOffer(params: {
  offerId: string;
  connectionId?: string | null;
  scenario?: ScenarioConfig;
  title: string;
}): Promise<{ draftId: string }> {
  const supabase = createClient();
  const { data: draft, error } = await supabase
    .from("roleplay_drafts")
    .insert({
      offer_id: params.offerId,
      connection_id: params.connectionId ?? null,
      scenario: params.scenario ?? {},
      title: params.title,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { draftId: draft.id };
}

export async function listConnections(): Promise<Connection[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .order("org_name", { ascending: true });
  if (error) throw error;
  return data as Connection[];
}

export async function listDrafts(): Promise<DraftRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roleplay_drafts")
    .select("*, offer:offers(id, offer_name), connection:connections(id, org_name, org_id)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as DraftRow[];
}

export async function setDraftConnection(draftId: string, connectionId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("roleplay_drafts")
    .update({ connection_id: connectionId })
    .eq("id", draftId);
  if (error) throw error;
}

export async function deleteDraft(draftId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("roleplay_drafts").delete().eq("id", draftId);
  if (error) throw error;
}

/** Invoca a Edge Function de export (individual ou lote). */
export async function invokeExport(draftIds: string[]) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("export-roleplay", {
    body: { draftIds },
  });
  if (error) throw error;
  return data;
}

export async function invokeSyncOrgs() {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("list-orgs", { body: {} });
  if (error) throw error;
  return data;
}

// ── Prontidão (IPR) ────────────────────────────────────────────────────────

export async function listTrackingClients(): Promise<TrackingClient[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tracking_clients")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as TrackingClient[];
}

export async function createTrackingClient(name: string): Promise<{ id: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tracking_clients")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id };
}

/** Pesos globais (por usuário) dos critérios do IPR; default 30/40/30. */
export async function getAppWeights(): Promise<CriteriaWeights> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("weight_prompt, weight_roteiro, weight_teste")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_WEIGHTS };
  return {
    weight_prompt: Number(data.weight_prompt ?? DEFAULT_WEIGHTS.weight_prompt),
    weight_roteiro: Number(data.weight_roteiro ?? DEFAULT_WEIGHTS.weight_roteiro),
    weight_teste: Number(data.weight_teste ?? DEFAULT_WEIGHTS.weight_teste),
  };
}

export async function updateAppWeights(weights: CriteriaWeights) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada");
  const { error } = await supabase
    .from("app_settings")
    .upsert({ created_by: user.id, ...weights }, { onConflict: "created_by" });
  if (error) throw error;
}

// ── Rounds (rodadas de avaliação) ───────────────────────────────────────────

export async function listRounds(clientId: string): Promise<EvaluationRound[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("evaluation_rounds")
    .select("*")
    .eq("client_id", clientId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data as EvaluationRound[];
}

export async function createRound(params: {
  clientId: string;
  name: string;
  position: number;
}): Promise<EvaluationRound> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("evaluation_rounds")
    .insert({
      client_id: params.clientId,
      name: params.name,
      position: params.position,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as EvaluationRound;
}

export async function setRoundStatus(id: string, status: RoundStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("evaluation_rounds").update({ status }).eq("id", id);
  if (error) throw error;
}

/**
 * Cria um novo round clonando os roleplays do round origem (copia
 * name/persona/roteiro/status/position). NÃO copia avaliações — o round novo
 * começa zerado. origin_readiness_id de cada cópia aponta para a raiz da
 * linhagem, para comparação entre rounds.
 */
export async function cloneRound(params: {
  sourceRoundId: string;
  name: string;
}): Promise<EvaluationRound> {
  const supabase = createClient();

  const { data: source, error: srcErr } = await supabase
    .from("evaluation_rounds")
    .select("client_id, position")
    .eq("id", params.sourceRoundId)
    .single();
  if (srcErr) throw srcErr;

  const round = await createRound({
    clientId: source.client_id,
    name: params.name,
    position: Number(source.position ?? 0) + 1,
  });

  const { data: srcRows, error: rowsErr } = await supabase
    .from("roleplay_readiness")
    .select("id, name, persona, roteiro, status, position, origin_readiness_id")
    .eq("round_id", params.sourceRoundId)
    .order("position", { ascending: true });
  if (rowsErr) throw rowsErr;

  if (srcRows && srcRows.length > 0) {
    const clones = srcRows.map((r) => ({
      client_id: source.client_id,
      round_id: round.id,
      origin_readiness_id: r.origin_readiness_id ?? r.id,
      name: r.name,
      persona: r.persona,
      roteiro: r.roteiro,
      status: r.status,
      position: r.position,
    }));
    const { error: insErr } = await supabase.from("roleplay_readiness").insert(clones);
    if (insErr) throw insErr;
  }

  return round;
}

export async function listReadiness(roundId: string): Promise<RoleplayReadiness[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roleplay_readiness")
    .select("*")
    .eq("round_id", roundId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data as RoleplayReadiness[];
}

/**
 * Linhagem de um roleplay entre rounds: a linha raiz (id = lineageKey) + todas
 * as cópias (origin_readiness_id = lineageKey), em todos os rounds do cliente.
 * Usado para comparar a evolução do mesmo roleplay round a round.
 */
export async function listLineageReadiness(
  clientId: string,
  lineageKey: string,
): Promise<RoleplayReadiness[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roleplay_readiness")
    .select("*")
    .eq("client_id", clientId)
    .or(`id.eq.${lineageKey},origin_readiness_id.eq.${lineageKey}`);
  if (error) throw error;
  return data as RoleplayReadiness[];
}

export async function createReadiness(params: {
  clientId: string;
  roundId: string;
  name: string;
  persona?: string | null;
  position: number;
}): Promise<RoleplayReadiness> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roleplay_readiness")
    .insert({
      client_id: params.clientId,
      round_id: params.roundId,
      name: params.name,
      persona: params.persona ?? null,
      position: params.position,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as RoleplayReadiness;
}

export async function updateReadiness(id: string, patch: Partial<RoleplayReadiness>) {
  const supabase = createClient();
  const { error } = await supabase.from("roleplay_readiness").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteReadiness(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("roleplay_readiness").delete().eq("id", id);
  if (error) throw error;
}

// ── Avaliação de qualidade (profiles, evaluations, pesos) ───────────────────

/** Roster de avaliadores (todos os usuários do app). */
export async function listProfiles(): Promise<Profile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .order("email", { ascending: true });
  if (error) throw error;
  return data as Profile[];
}

/** Rede de segurança: garante que o usuário logado exista no roster. */
export async function upsertOwnProfile(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada");
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email ?? null }, { onConflict: "id" });
  if (error) throw error;
}

export async function listEvaluations(readinessIds: string[]): Promise<RoleplayEvaluation[]> {
  if (readinessIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roleplay_evaluations")
    .select("*")
    .in("readiness_id", readinessIds);
  if (error) throw error;
  return data as RoleplayEvaluation[];
}

export async function upsertEvaluation(params: {
  readinessId: string;
  scores: Record<string, number>;
  comments: Record<string, string>;
  overallComment: string | null;
}): Promise<RoleplayEvaluation> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada");
  const { data, error } = await supabase
    .from("roleplay_evaluations")
    .upsert(
      {
        readiness_id: params.readinessId,
        evaluator_id: user.id,
        scores: params.scores,
        comments: params.comments,
        overall_comment: params.overallComment,
      },
      { onConflict: "readiness_id,evaluator_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as RoleplayEvaluation;
}

export async function deleteOwnEvaluation(readinessId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada");
  const { error } = await supabase
    .from("roleplay_evaluations")
    .delete()
    .eq("readiness_id", readinessId)
    .eq("evaluator_id", user.id);
  if (error) throw error;
}

export async function getEvalWeights(): Promise<EvalWeights> {
  const supabase = createClient();
  const { data, error } = await supabase.from("app_settings").select("eval_weights").maybeSingle();
  if (error) throw error;
  const w = (data?.eval_weights ?? null) as EvalWeights | null;
  return w && Object.keys(w).length ? w : defaultEvalWeights();
}

export async function updateEvalWeights(weights: EvalWeights): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada");
  const { error } = await supabase
    .from("app_settings")
    .upsert({ created_by: user.id, eval_weights: weights }, { onConflict: "created_by" });
  if (error) throw error;
}

/** Lista os tipos de call_context da Perfecting (para o seletor da Criação). */
export async function listCallContexts(): Promise<CallContextType[]> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("list-call-contexts", { body: {} });
  if (error) throw error;
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return (data.items ?? []) as CallContextType[];
}

/** Extrai a mensagem real do corpo de uma FunctionsHttpError (em vez do genérico "non-2xx"). */
async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      const e = body?.error;
      if (typeof e === "string") return e;
      if (e?.detail?.message) return e.detail.message;
      if (e?.message) return e.message;
      if (e) return JSON.stringify(e);
    }
  } catch {
    // sem corpo legível — usa o fallback
  }
  return error instanceof Error ? error.message : fallback;
}

/** Processa o texto importado com IA (Claude) → briefing estruturado + cenário + lacunas. */
export async function processImport(
  text: string,
  customPrompt?: string | null,
): Promise<ProcessImportResult> {
  const supabase = createClient();
  const body: Record<string, unknown> = { text };
  if (customPrompt?.trim()) body.prompt = customPrompt.trim();
  const { data, error } = await supabase.functions.invoke("process-import", { body });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao processar"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return data.result as ProcessImportResult;
}

export async function uploadAndExtract(file: File): Promise<{
  text: string;
  suggestedOfferName: string;
  filePath: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada");

  // Storage keys não aceitam acentos, espaços nem símbolos (ex.: "—") → higieniza.
  const safeName = file.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120) || "arquivo";
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from("imports").upload(path, file);
  if (upErr) throw upErr;

  const { data, error } = await supabase.functions.invoke("extract-text", {
    body: { filePath: path, filename: file.name, mime: file.type },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "Falha ao extrair texto");
  return { text: data.text, suggestedOfferName: data.suggestedOfferName, filePath: path };
}
