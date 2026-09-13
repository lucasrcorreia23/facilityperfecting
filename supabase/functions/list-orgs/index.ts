import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import {
  findManagerUserId,
  hasEnvConfig,
  listOrganizations,
  loginSuperadmin,
  PerfectingError,
  type PerfectingEnv,
} from "../_shared/perfecting.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ENVS: PerfectingEnv[] = ["hml", "prod"];

/**
 * Sincroniza as orgs da Perfecting → tabela `connections` (HML e produção).
 * Para cada org, resolve um gestor (target_user_id) para impersonação.
 * Ambiente sem secrets configurados é pulado (não falha o sync inteiro).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    let total = 0;
    let synced = 0;
    const skipped: PerfectingEnv[] = [];
    const errors: Array<{ environment: PerfectingEnv; error: unknown }> = [];

    for (const environment of ENVS) {
      if (!hasEnvConfig(environment)) {
        console.warn(`list-orgs: pulando ${environment} (secrets ausentes)`);
        skipped.push(environment);
        continue;
      }
      try {
        const saToken = await loginSuperadmin(environment);
        const orgs = await listOrganizations(environment, saToken);
        total += orgs.length;
        for (const org of orgs) {
          const targetUserId = await findManagerUserId(environment, saToken, org.id).catch(
            () => null,
          );
          const { error } = await db.from("connections").upsert(
            {
              environment,
              org_id: org.id,
              org_name: org.name,
              target_user_id: targetUserId,
            },
            { onConflict: "environment,org_id" },
          );
          if (!error) synced++;
        }
      } catch (e) {
        const detail =
          e instanceof PerfectingError
            ? { status: e.status, detail: e.detail }
            : { message: String(e) };
        console.error(`list-orgs[${environment}] falhou:`, detail);
        errors.push({ environment, error: detail });
      }
    }

    if (synced === 0) {
      if (skipped.length === ENVS.length) {
        return json(
          { ok: false, error: "nenhum ambiente Perfecting configurado (HML/PROD secrets)" },
          500,
        );
      }
      return json({ ok: false, error: errors[0]?.error ?? "falha ao sincronizar", skipped, errors }, 500);
    }

    return json({ ok: true, total, synced, skipped, errors: errors.length ? errors : undefined });
  } catch (e) {
    const detail =
      e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
