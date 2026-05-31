import { corsHeaders, json } from "../_shared/cors.ts";
import { listCallContexts, loginSuperadmin, PerfectingError } from "../_shared/perfecting.ts";

/**
 * Lista os tipos de call_context da Perfecting (taxonomia do ambiente),
 * para alimentar o seletor da tela Importar. Usa o token de superadmin.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const saToken = await loginSuperadmin();
    const items = await listCallContexts(saToken);
    return json({ ok: true, items });
  } catch (e) {
    const detail = e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
