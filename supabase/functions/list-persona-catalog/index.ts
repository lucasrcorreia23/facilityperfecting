import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import { listCaseSetupPersonas, PerfectingError } from "../_shared/perfecting.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Quais personas cada roleplay de um rascunho exportado aceita.
 *
 * Serve para a Biblioteca PROVAR o que o modo multi-persona fez: sem isto o
 * usuário só tem a nossa palavra de que a etapa ficou genérica. Lê o mesmo
 * `/persona/catalog` que a pré-chamada da Perfecting usa para montar o seletor de
 * persona — então o que aparece aqui é o que o vendedor vai ver.
 *
 * `context_id` e a conexão saem do próprio rascunho (playbook_run.context_id), e
 * não do corpo: o catálogo é por contexto e quem manda é o que foi exportado.
 *
 * Catálogo indisponível NÃO é erro: `/persona/catalog` não existe na API de
 * produção (some junto com o resto do modo playbook). Devolve
 * `{ ok: true, available: false }` e a UI esconde a seção, em vez de mostrar
 * falha para o usuário.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    if (!draftId) return json({ ok: false, error: "draftId é obrigatório" }, 400);

    // Conexão lida em separado (como em list-playbooks) em vez de embed: o embed
    // `connections(*)` vem tipado como array e não casa com DestinationConnection.
    const { data: draft, error } = await db
      .from("roleplay_drafts")
      .select("id, playbook_run, connection_id")
      .eq("id", draftId)
      .single();
    if (error || !draft) return json({ ok: false, error: "rascunho não encontrado" }, 404);

    const contextId = (draft.playbook_run as { context_id?: number } | null)?.context_id;
    if (typeof contextId !== "number" || !draft.connection_id) {
      return json({ ok: true, available: false, items: [] });
    }

    const { data: connection, error: connError } = await db
      .from("connections")
      .select("id, environment, org_id, target_user_id, default_user_group_id")
      .eq("id", draft.connection_id)
      .single();
    if (connError || !connection) {
      return json({ ok: false, error: "conexão não encontrada" }, 404);
    }

    const { env, token } = await authenticateConnection(connection);
    try {
      const items = await listCaseSetupPersonas(env, token, contextId);
      return json({ ok: true, available: true, items });
    } catch (e) {
      // 404 = endpoint não existe naquele ambiente (prod). Degrada, não quebra.
      const status = e instanceof PerfectingError ? e.status : 0;
      if (status === 404 || status === 405) {
        return json({ ok: true, available: false, items: [] });
      }
      throw e;
    }
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
