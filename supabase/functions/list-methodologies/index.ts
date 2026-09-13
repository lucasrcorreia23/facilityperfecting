import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { listMethodologies, loginSuperadmin, PerfectingError } from "../_shared/perfecting.ts";

/**
 * Metodologias da Perfecting (taxonomia do ambiente), para o seletor do editor
 * de playbook. Mesmo padrão de `list-call-contexts`: token de superadmin em HML,
 * já que a lista é praticamente a mesma nos dois ambientes.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    const saToken = await loginSuperadmin("hml");
    const items = await listMethodologies("hml", saToken);
    return json({ ok: true, items });
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
