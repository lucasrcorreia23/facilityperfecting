import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import {
  listMethodologies,
  listMethodologySteps,
  loginSuperadmin,
  PerfectingError,
} from "../_shared/perfecting.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Metodologias da Perfecting.
 *
 * Sem `connectionId`: a taxonomia do ambiente, para o seletor do editor de playbook
 * (token de superadmin em HML, como `list-call-contexts`).
 * Com `connectionId`: as metodologias que a org de destino enxerga (públicas + as
 * dela, como a PROVAR da org 73), pelo gestor-alvo da conexão. Com `methodologyId`
 * também, devolve as etapas na ordem — o modo debate gera conteúdo por etapa.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    const methodologyId = typeof body.methodologyId === "number" ? body.methodologyId : null;

    if (!connectionId) {
      const saToken = await loginSuperadmin("hml");
      const items = await listMethodologies("hml", saToken);
      return json({ ok: true, items });
    }

    const { data: connection, error } = await db
      .from("connections")
      .select("id, environment, org_id, target_user_id, default_user_group_id")
      .eq("id", connectionId)
      .single();
    if (error || !connection) return json({ ok: false, error: "conexão não encontrada" }, 404);

    const { env, token } = await authenticateConnection(connection);
    const items = await listMethodologies(env, token);
    const steps = methodologyId != null ? await listMethodologySteps(env, token, methodologyId) : null;
    return json({ ok: true, items, steps });
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
