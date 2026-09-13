"use client";

import { createClient } from "@/app/lib/supabase/client";
import type {
  CallContextType,
  CaseSetupPersonas,
  Connection,
  CriteriaWeights,
  DraftRow,
  EvalWeights,
  GenerationMode,
  EvaluationRound,
  Methodology,
  MethodologySource,
  Playbook,
  PlaybookCallType,
  PlaybookDraft,
  PlaybookDraftCallBlock,
  PlaybookDraftCallType,
  PlaybookDraftDetail,
  ProcessImportResult,
  Profile,
  RoleplayEvaluation,
  RoleplayReadiness,
  RoundStatus,
  ScenarioConfig,
  TrackingClient,
  Trail,
  TrailInputFile,
  TrailItem,
  TrailPlan,
  TrailPlanDetail,
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
    .order("environment", { ascending: true })
    .order("org_name", { ascending: true });
  if (error) throw error;
  return data as Connection[];
}

export async function listDrafts(): Promise<DraftRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roleplay_drafts")
    .select("*, offer:offers(id, offer_name), connection:connections(id, org_name, org_id, environment)")
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

/**
 * Mescla campos no scenario (jsonb) de um rascunho — usado quando o modo
 * (metodologia/playbook) só é decidido depois da criação, ex.: no modal de
 * "Conta de destino" da Biblioteca, para rascunhos salvos sem conta.
 */
export async function updateDraftScenario(draftId: string, patch: Partial<ScenarioConfig>) {
  const supabase = createClient();
  const { data: current, error: readErr } = await supabase
    .from("roleplay_drafts")
    .select("scenario")
    .eq("id", draftId)
    .single();
  if (readErr) throw readErr;
  const merged = { ...(current?.scenario ?? {}), ...patch };
  const { error } = await supabase
    .from("roleplay_drafts")
    .update({ scenario: merged })
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
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao exportar"));
  return data;
}

/** Playbooks da org de destino (para o seletor de modo na Criação). */
export async function listPlaybooks(connectionId: string): Promise<Playbook[]> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("list-playbooks", {
    body: { connectionId },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao listar os playbooks"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return (data.playbooks ?? []) as Playbook[];
}

/** Etapas do playbook — quantos/quais roleplays a implementação vai criar. */
export async function listPlaybookCallTypes(
  connectionId: string,
  playbookId: number,
): Promise<PlaybookCallType[]> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("list-playbooks", {
    body: { connectionId, playbookId },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao listar as etapas"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return (data.callTypes ?? []) as PlaybookCallType[];
}

/**
 * Dispara a implementação por playbook (202 imediato). O progresso chega por
 * realtime em roleplay_drafts; `pollPlaybookRun` reconcilia periodicamente.
 */
export async function invokeExportPlaybook(draftId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("implement-playbook", {
    body: { draftId },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao iniciar a implementação"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return data;
}

/** Consulta/reconcilia a implementação em andamento (nunca reexecuta). */
export async function pollPlaybookRun(
  draftId: string,
): Promise<{ done?: boolean; created?: number; total?: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("implement-playbook", {
    body: { draftId, stage: "poll" },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao consultar a implementação"));
  return data ?? {};
}

/**
 * Acrescenta personas ao contexto de um rascunho já exportado (202 imediato).
 * O lote também gera o conteúdo por etapa das personas novas nos roleplays que
 * já existem — é a única forma correta de adicionar persona depois do envio.
 * O progresso chega por realtime em `playbook_run.persona_topup`.
 */
export async function invokeAddPersonas(draftId: string, quantity: number) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("implement-playbook", {
    body: { draftId, stage: "add_personas", quantity },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao iniciar o lote de personas"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return data;
}

/** Quais personas cada roleplay do rascunho aceita (o que o vendedor vai ver). */
export async function listPersonaCatalog(draftId: string): Promise<{
  available: boolean;
  items: CaseSetupPersonas[];
}> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("list-persona-catalog", {
    body: { draftId },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao ler o catálogo de personas"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return { available: Boolean(data.available), items: data.items ?? [] };
}

export async function invokeSyncOrgs() {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("list-orgs", { body: {} });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao sincronizar as contas"));
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
  if (error)
    throw new Error(await functionErrorMessage(error, "Falha ao listar os tipos de call"));
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
  /** "playbook" pula a extração de cenário/rubricas — que o playbook descarta. */
  mode?: GenerationMode | null,
): Promise<ProcessImportResult> {
  const supabase = createClient();
  const body: Record<string, unknown> = { text };
  if (customPrompt?.trim()) body.prompt = customPrompt.trim();
  if (mode) body.mode = mode;
  const { data, error } = await supabase.functions.invoke("process-import", { body });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao processar"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return data.result as ProcessImportResult;
}

// ── Playbooks (autoria local → envio para a conta) ─────────────────────────

export async function listMethodologies(): Promise<Methodology[]> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("list-methodologies", { body: {} });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao listar as metodologias"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return (data.items ?? []) as Methodology[];
}

export async function listPlaybookDrafts(): Promise<PlaybookDraft[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("playbooks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PlaybookDraft[];
}

export async function createPlaybookDraft(params: {
  name: string;
  inputText: string;
  inputFiles: TrailInputFile[];
  promptOverride?: string | null;
}): Promise<{ playbookId: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      name: params.name,
      input_text: params.inputText,
      input_files: params.inputFiles,
      prompt_override: params.promptOverride ?? null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { playbookId: data.id };
}

/** Playbook com etapas + subetapas, ordenados por position. */
export async function getPlaybookDraft(playbookId: string): Promise<PlaybookDraftDetail> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("playbooks")
    .select("*, playbook_call_types(*, playbook_call_blocks(*))")
    .eq("id", playbookId)
    .single();
  if (error) throw error;
  const playbook = data as unknown as PlaybookDraftDetail;
  playbook.playbook_call_types = (playbook.playbook_call_types ?? [])
    .sort((a, b) => a.position - b.position)
    .map((ct) => ({
      ...ct,
      playbook_call_blocks: (ct.playbook_call_blocks ?? []).sort((a, b) => a.position - b.position),
    }));
  return playbook;
}

export async function deletePlaybookDraft(playbookId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("playbooks").delete().eq("id", playbookId);
  if (error) throw error;
}

export async function updatePlaybookDraft(
  id: string,
  patch: Partial<Pick<PlaybookDraft, "name" | "status">>,
) {
  const supabase = createClient();
  const { error } = await supabase.from("playbooks").update(patch).eq("id", id);
  if (error) throw error;
}

export async function createPlaybookCallType(params: {
  playbookId: string;
  position: number;
  name: string;
}): Promise<PlaybookDraftCallType> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("playbook_call_types")
    .insert({ playbook_id: params.playbookId, position: params.position, name: params.name })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlaybookDraftCallType;
}

export async function updatePlaybookCallType(
  id: string,
  patch: Partial<
    Pick<PlaybookDraftCallType, "name" | "description" | "call_context_slug" | "methodology_slug">
  >,
) {
  const supabase = createClient();
  const { error } = await supabase.from("playbook_call_types").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePlaybookCallType(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("playbook_call_types").delete().eq("id", id);
  if (error) throw error;
}

export async function createPlaybookCallBlock(params: {
  callTypeId: string;
  position: number;
  name: string;
}): Promise<PlaybookDraftCallBlock> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("playbook_call_blocks")
    .insert({ call_type_id: params.callTypeId, position: params.position, name: params.name })
    .select("*")
    .single();
  if (error) throw error;
  return data as PlaybookDraftCallBlock;
}

export async function updatePlaybookCallBlock(
  id: string,
  patch: Partial<
    Pick<
      PlaybookDraftCallBlock,
      "name" | "description" | "objective" | "sample_questions" | "what_to_do" | "what_to_avoid"
    >
  >,
) {
  const supabase = createClient();
  const { error } = await supabase.from("playbook_call_blocks").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePlaybookCallBlock(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("playbook_call_blocks").delete().eq("id", id);
  if (error) throw error;
}

/** Persiste a nova ordem (position = índice), como reorderTrailItems. */
export async function reorderPlaybookCallTypes(items: { id: string; position: number }[]) {
  const supabase = createClient();
  for (const item of items) {
    const { error } = await supabase
      .from("playbook_call_types")
      .update({ position: item.position })
      .eq("id", item.id);
    if (error) throw error;
  }
}

export async function reorderPlaybookCallBlocks(items: { id: string; position: number }[]) {
  const supabase = createClient();
  for (const item of items) {
    const { error } = await supabase
      .from("playbook_call_blocks")
      .update({ position: item.position })
      .eq("id", item.id);
    if (error) throw error;
  }
}

/** Dispara a estruturação por IA (202 imediato; acompanha por realtime/poll). */
export async function invokeGeneratePlaybook(playbookId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("generate-playbook", {
    body: { playbookId },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao iniciar a geração"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return data;
}

export async function pollPlaybookGeneration(
  playbookId: string,
): Promise<{ done?: boolean; status?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("generate-playbook", {
    body: { playbookId, stage: "poll" },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao consultar a geração"));
  return data ?? {};
}

/** Cria o playbook (etapas + subetapas) na conta de destino. */
export async function invokeSendPlaybook(playbookId: string, connectionId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("export-playbook", {
    body: { playbookId, connectionId },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao enviar o playbook"));
  if (!data?.ok) throw new Error(JSON.stringify(data?.error ?? data));
  return data;
}

// ── Trilhas (planos de trilhas de roleplay) ────────────────────────────────

export async function listMethodologySources(): Promise<MethodologySource[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("methodology_sources")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return data as MethodologySource[];
}

export async function updateMethodologySource(
  id: string,
  patch: Partial<
    Pick<MethodologySource, "title" | "url" | "content" | "enabled" | "status" | "fetched_at">
  >,
) {
  const supabase = createClient();
  const { error } = await supabase.from("methodology_sources").update(patch).eq("id", id);
  if (error) throw error;
}

/** Coleta o conteúdo de uma URL (website do cliente) ou re-coleta uma fonte da base. */
export async function invokeIngestUrl(
  params: { url: string } | { sourceId: string },
): Promise<{ text: string; title: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("ingest-url", { body: params });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao coletar a URL"));
  if (!data?.ok) throw new Error(String(data?.error ?? "Falha ao coletar a URL"));
  return { text: data.text, title: data.title };
}

export async function listTrailPlans(): Promise<TrailPlan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trail_plans")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as TrailPlan[];
}

export async function createTrailPlan(params: {
  clientName: string;
  salesMethodology?: string | null;
  additionalContext?: string | null;
  sellerCount?: number | null;
  websiteUrl?: string | null;
  inputFiles: TrailInputFile[];
  inputText: string;
  promptOverride?: string | null;
}): Promise<{ planId: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trail_plans")
    .insert({
      client_name: params.clientName,
      sales_methodology: params.salesMethodology ?? null,
      additional_context: params.additionalContext ?? null,
      seller_count: params.sellerCount ?? null,
      website_url: params.websiteUrl ?? null,
      input_files: params.inputFiles,
      input_text: params.inputText,
      prompt_override: params.promptOverride ?? null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { planId: data.id };
}

/** Plano com trilhas + itens + status dos drafts, ordenados por position. */
export async function getTrailPlan(planId: string): Promise<TrailPlanDetail> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trail_plans")
    .select(
      "*, trails(*, items:trail_items(*, draft:roleplay_drafts(id, status, connection_id, error_detail)))",
    )
    .eq("id", planId)
    .single();
  if (error) throw error;
  const plan = data as unknown as TrailPlanDetail;
  plan.trails = (plan.trails ?? [])
    .sort((a, b) => a.position - b.position)
    .map((t) => ({ ...t, items: (t.items ?? []).sort((a, b) => a.position - b.position) }));
  return plan;
}

export async function deleteTrailPlan(planId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("trail_plans").delete().eq("id", planId);
  if (error) throw error;
}

/** Dispara um estágio da geração (analysis → analyzed; plan → ready). Retorna 202 imediato. */
export async function invokeGenerateTrailPlan(planId: string, stage: "analysis" | "plan") {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("generate-trail-plan", {
    body: { planId, stage },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao iniciar a geração"));
  if (!data?.ok) throw new Error(String(data?.error ?? "Falha ao iniciar a geração"));
  return data;
}

/**
 * Consulta o batch pendente da geração (Anthropic Batch API). Quando o resultado
 * fica pronto, a própria função grava e o status muda via realtime. Se o plano
 * ficou preso em analyzing/planning sem batch (execução antiga morta), a função
 * ressubmete o estágio automaticamente.
 */
export async function pollTrailPlanGeneration(planId: string): Promise<{ done?: boolean }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("generate-trail-plan", {
    body: { planId, stage: "poll" },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Falha ao consultar a geração"));
  return data ?? {};
}

export async function updateTrail(
  id: string,
  patch: Partial<Pick<Trail, "name" | "description" | "skill_gaps_alvo" | "vendedores_alvo">>,
) {
  const supabase = createClient();
  const { error } = await supabase.from("trails").update(patch).eq("id", id);
  if (error) throw error;
}

export async function createTrailItem(params: {
  trailId: string;
  position: number;
  titulo: string;
}): Promise<TrailItem> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("trail_items")
    .insert({ trail_id: params.trailId, position: params.position, titulo: params.titulo })
    .select("*")
    .single();
  if (error) throw error;
  return data as TrailItem;
}

export async function updateTrailItem(
  id: string,
  patch: Partial<
    Pick<
      TrailItem,
      "titulo" | "objetivo" | "skill" | "call_context_slug" | "difficulty" | "instrucoes_cenario"
    >
  >,
) {
  const supabase = createClient();
  const { error } = await supabase.from("trail_items").update(patch).eq("id", id);
  if (error) throw error;
}

/** Persiste a nova ordem dos itens de uma trilha (position = índice). */
export async function reorderTrailItems(items: { id: string; position: number }[]) {
  const supabase = createClient();
  for (const item of items) {
    const { error } = await supabase
      .from("trail_items")
      .update({ position: item.position })
      .eq("id", item.id);
    if (error) throw error;
  }
}

export async function deleteTrailItem(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("trail_items").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Gera roleplay_drafts para os itens ainda sem draft (todos, ou só das trilhas
 * informadas). Cria UMA offer por plano (materiais do cliente) e a reusa em
 * todos os drafts — padrão "Novo cenário desta oferta"; o export reusa a offer
 * por conexão via offer_perfecting_ids.
 */
export async function generateTrailDrafts(
  planId: string,
  trailIds?: string[],
): Promise<{ created: number }> {
  const supabase = createClient();

  const { data: plan, error: planErr } = await supabase
    .from("trail_plans")
    .select("id, client_name, input_text, input_files, offer_id")
    .eq("id", planId)
    .single();
  if (planErr) throw planErr;

  // Offer única do plano (criada sob demanda na 1ª geração).
  let offerId: string | null = plan.offer_id;
  if (!offerId) {
    const inputText: string = plan.input_text ?? "";
    const { data: source, error: srcErr } = await supabase
      .from("sources")
      .insert({
        type: "file",
        raw_text: inputText,
        meta: { origin: "trail_plan", plan_id: planId, files: plan.input_files ?? [] },
      })
      .select("id")
      .single();
    if (srcErr) throw srcErr;

    const { data: offer, error: offErr } = await supabase
      .from("offers")
      .insert({
        offer_name: plan.client_name,
        general_description: inputText,
        source_id: source.id,
      })
      .select("id")
      .single();
    if (offErr) throw offErr;
    offerId = offer.id;

    const { error: linkErr } = await supabase
      .from("trail_plans")
      .update({ offer_id: offerId })
      .eq("id", planId);
    if (linkErr) throw linkErr;
  }

  let trailsQuery = supabase.from("trails").select("id, name").eq("plan_id", planId);
  if (trailIds && trailIds.length > 0) trailsQuery = trailsQuery.in("id", trailIds);
  const { data: trails, error: trailsErr } = await trailsQuery;
  if (trailsErr) throw trailsErr;
  if (!trails || trails.length === 0) return { created: 0 };

  const trailNames = new Map(trails.map((t) => [t.id, t.name]));
  const { data: items, error: itemsErr } = await supabase
    .from("trail_items")
    .select("*")
    .in("trail_id", trails.map((t) => t.id))
    .is("draft_id", null)
    .order("position", { ascending: true });
  if (itemsErr) throw itemsErr;

  let created = 0;
  for (const item of (items ?? []) as TrailItem[]) {
    const trailName = trailNames.get(item.trail_id) ?? "Trilha";
    const { data: draft, error: draftErr } = await supabase
      .from("roleplay_drafts")
      .insert({
        offer_id: offerId,
        scenario: {
          call_context_slug: item.call_context_slug,
          difficulty: item.difficulty,
          skill: item.skill,
          objective: item.objetivo,
          aditional_instructions: item.instrucoes_cenario,
        },
        title: `${trailName} — ${item.position + 1}. ${item.titulo}`,
      })
      .select("id")
      .single();
    if (draftErr) throw draftErr;

    const { error: linkErr } = await supabase
      .from("trail_items")
      .update({ draft_id: draft.id })
      .eq("id", item.id);
    if (linkErr) throw linkErr;
    created += 1;
  }

  return { created };
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
  if (error)
    throw new Error(
      `${file.name}: ${await functionErrorMessage(error, "falha ao extrair o texto")}`,
    );
  if (!data?.ok) throw new Error(`${file.name}: ${data?.error ?? "falha ao extrair o texto"}`);
  return { text: data.text, suggestedOfferName: data.suggestedOfferName, filePath: path };
}
