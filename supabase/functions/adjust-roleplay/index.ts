import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requestUserId, requireUser } from "../_shared/auth.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import { getRolePlayPrompt, PerfectingError } from "../_shared/perfecting.ts";
import {
  AdjustConflictError,
  listRoleplays,
  loadAdjustState,
  regenerate,
  type RegenerateWhat,
  saveAdjustSection,
} from "../_shared/roleplay-adjust.ts";
import { ADJUST_SECTIONS, type AdjustSection, AdjustValidationError } from "../_shared/roleplay-adjust-model.ts";

/**
 * Tela "Ajustar roleplay": lê e altera um roleplay que JÁ está na Perfecting
 * (enviado pelo facility ou montado por script), aba por aba.
 *
 *   op=list        roleplays da org da conexão
 *   op=load        estado da tela para um roleplay
 *   op=save        aplica uma aba (recusa com 409 se ela mudou desde o load)
 *   op=regenerate  ações com IA: comportamento, ou resumo da etapa seguinte
 *   op=preview     prompt que o comprador recebe hoje (+ checagem)
 *
 * Toda escrita vira uma linha em `roleplay_adjustments` (antes/depois). Em conexão
 * de produção, escrever exige `confirmProd: true` — a tela pede confirmação.
 */

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function loadConnection(connectionId: string) {
  const { data, error } = await db
    .from("connections")
    .select("id, environment, org_id, org_name, target_user_id, default_user_group_id")
    .eq("id", connectionId)
    .single();
  if (error || !data) throw new PerfectingError(404, "conexão não encontrada");
  return data;
}

async function audit(row: {
  connection_id: string;
  case_setup_id: number;
  section: string;
  before: unknown;
  after: unknown;
  summary: string[];
  created_by: string | null;
}) {
  const { error } = await db.from("roleplay_adjustments").insert(row);
  if (error) console.error("histórico não gravado:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "corpo inválido" }, 400);
  }
  const op = typeof body.op === "string" ? body.op : "";
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
  if (!connectionId) return json({ ok: false, error: "nenhuma conexão" }, 400);

  try {
    const connection = await loadConnection(connectionId);
    const { env, token } = await authenticateConnection(connection);
    const meta = { environment: connection.environment, org_id: connection.org_id, org_name: connection.org_name };

    if (op === "list") {
      return json({ ok: true, connection: meta, roleplays: await listRoleplays(env, token) });
    }

    const caseSetupId = Number(body.caseSetupId);
    if (!Number.isInteger(caseSetupId) || caseSetupId <= 0) {
      return json({ ok: false, error: "id de roleplay inválido" }, 400);
    }

    if (op === "load") {
      return json({ ok: true, connection: meta, state: await loadAdjustState(env, token, caseSetupId) });
    }

    if (op === "preview") {
      return json({ ok: true, gate: await getRolePlayPrompt(env, token, caseSetupId) });
    }

    // Daqui para baixo, escrita.
    if (connection.environment === "prod" && body.confirmProd !== true) {
      return json({ ok: false, error: "alteração em produção precisa de confirmação" }, 428);
    }
    const userId = await requestUserId(req);

    if (op === "save") {
      const section = body.section as AdjustSection;
      if (!ADJUST_SECTIONS.includes(section)) return json({ ok: false, error: "aba inválida" }, 400);
      const baseHash = typeof body.baseHash === "string" ? body.baseHash : "";
      const res = await saveAdjustSection(env, token, caseSetupId, section, body.value, baseHash);
      if (res.summary.length > 0) {
        await audit({
          connection_id: connectionId,
          case_setup_id: caseSetupId,
          section,
          before: res.before,
          after: res.after,
          summary: res.summary,
          created_by: userId,
        });
      }
      return json({ ok: true, state: res.state, summary: res.summary });
    }

    if (op === "regenerate") {
      const what = body.what as RegenerateWhat;
      if (what !== "behavior" && what !== "next_stage_summary") {
        return json({ ok: false, error: "regeneração inválida" }, 400);
      }
      const res = await regenerate(env, token, caseSetupId, what);
      await audit({
        connection_id: connectionId,
        case_setup_id: caseSetupId,
        section: "regenerate",
        before: null,
        after: { what },
        summary: res.summary,
        created_by: userId,
      });
      return json({ ok: true, summary: res.summary, state: await loadAdjustState(env, token, caseSetupId) });
    }

    return json({ ok: false, error: `op desconhecida: ${op}` }, 400);
  } catch (e) {
    if (e instanceof AdjustValidationError) return json({ ok: false, error: e.message }, 422);
    if (e instanceof AdjustConflictError) return json({ ok: false, error: e.message, conflict: true }, 409);
    const detail = e instanceof PerfectingError
      ? { status: e.status, detail: e.detail }
      : { message: String(e instanceof Error ? e.message : e) };
    console.error("adjust-roleplay falhou:", JSON.stringify(detail));
    return json({ ok: false, error: detail }, e instanceof PerfectingError && e.status === 404 ? 404 : 500);
  }
});
