import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import {
  findManagerUserId,
  listOrganizations,
  loginSuperadmin,
  PerfectingError,
} from "../_shared/perfecting.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ENVIRONMENT = (Deno.env.get("PERFECTING_API_BASE") ?? "").includes("api-hml")
  ? "hml"
  : "prod";

/**
 * Sincroniza as orgs da Perfecting → tabela `connections`.
 * Para cada org, resolve um gestor (target_user_id) para impersonação.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const saToken = await loginSuperadmin();
    const orgs = await listOrganizations(saToken);

    let synced = 0;
    for (const org of orgs) {
      const targetUserId = await findManagerUserId(saToken, org.id).catch(() => null);
      const { error } = await db.from("connections").upsert(
        {
          environment: ENVIRONMENT,
          org_id: org.id,
          org_name: org.name,
          target_user_id: targetUserId,
        },
        { onConflict: "environment,org_id" },
      );
      if (!error) synced++;
    }

    return json({ ok: true, total: orgs.length, synced });
  } catch (e) {
    const detail = e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
