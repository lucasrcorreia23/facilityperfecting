"use client";

import { createClient } from "@/app/lib/supabase/client";
import type {
  CallContextType,
  Connection,
  DraftRow,
  ProcessImportResult,
  ScenarioConfig,
} from "@/app/lib/types";

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

/** Lista os tipos de call_context da Perfecting (para o seletor da Importar). */
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
