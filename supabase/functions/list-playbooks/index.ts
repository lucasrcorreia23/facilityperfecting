import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import {
  listPlaybookCallTypes,
  listPlaybooks,
  PerfectingError,
} from "../_shared/perfecting.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Playbooks da org de destino, para o seletor da Criação.
 *
 * Diferente de `list-call-contexts` (taxonomia global, token de superadmin em
 * HML), playbook é por organização: precisa do ambiente e do gestor-alvo da
 * conexão escolhida. Com `playbookId`, devolve também as etapas — é quantos
 * roleplays a implementação vai criar.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    const playbookId = typeof body.playbookId === "number" ? body.playbookId : null;
    if (!connectionId) return json({ ok: false, error: "connectionId é obrigatório" }, 400);

    const { data: connection, error } = await db
      .from("connections")
      .select("id, environment, org_id, target_user_id, default_user_group_id")
      .eq("id", connectionId)
      .single();
    if (error || !connection) return json({ ok: false, error: "conexão não encontrada" }, 404);

    const { env, token } = await authenticateConnection(connection);
    const playbooks = await listPlaybooks(env, token);
    const callTypes =
      playbookId != null ? await listPlaybookCallTypes(env, token, playbookId) : null;

    return json({ ok: true, playbooks, callTypes });
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
