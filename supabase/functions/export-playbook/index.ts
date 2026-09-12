import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import {
  addPlaybookCallTypeMethodology,
  createPlaybook,
  createPlaybookCallBlock,
  createPlaybookCallType,
  listMethodologies,
  PerfectingError,
  resolveCallContextTypeId,
} from "../_shared/perfecting.ts";

/**
 * Envia a DEFINIÇÃO do playbook (etapas + subetapas) para a conta de destino.
 * Não confundir com `implement-playbook`, que roda o motor da Perfecting em
 * cima de um playbook JÁ existente na conta para gerar os roleplays.
 *
 * Síncrono de propósito: são ~25 POSTs de CRUD sem IA — segundos, não minutos.
 *
 * Idempotência: cada id criado é gravado em `playbooks.export_run` ANTES do
 * passo seguinte. Um retry depois de falha no meio pula o que já existe — a
 * API não tem upsert, então sem isso o reenvio duplicaria etapas.
 */

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface ExportRun {
  connection_id?: string;
  perfecting_playbook_id?: number;
  call_types?: Record<string, number>;
  call_blocks?: Record<string, number>;
  finished_at?: string | null;
}

interface CallBlockRow {
  id: string;
  position: number;
  name: string;
  description: string | null;
  objective: string | null;
  sample_questions: string[] | null;
  what_to_do: string[] | null;
  what_to_avoid: string[] | null;
}

interface CallTypeRow {
  id: string;
  position: number;
  name: string;
  description: string | null;
  call_context_slug: string | null;
  methodology_slug: string | null;
  playbook_call_blocks: CallBlockRow[];
}

function saveRun(playbookId: string, run: ExportRun, patch: Record<string, unknown> = {}) {
  return db
    .from("playbooks")
    .update({ export_run: run, ...patch })
    .eq("id", playbookId);
}

async function exportPlaybook(
  playbookId: string,
  connectionId: string,
): Promise<{ perfectingPlaybookId: number; callTypes: number; callBlocks: number }> {
  const { data: playbook, error } = await db
    .from("playbooks")
    .select("id, name, status, export_run")
    .eq("id", playbookId)
    .single();
  if (error || !playbook) throw new PerfectingError(404, "playbook não encontrado");

  const { data: connection, error: connErr } = await db
    .from("connections")
    .select("id, environment, org_id, target_user_id, default_user_group_id")
    .eq("id", connectionId)
    .single();
  if (connErr || !connection) throw new PerfectingError(404, "conexão não encontrada");

  const { data: callTypes, error: ctErr } = await db
    .from("playbook_call_types")
    .select("*, playbook_call_blocks(*)")
    .eq("playbook_id", playbookId)
    .order("position", { ascending: true });
  if (ctErr) throw new PerfectingError(500, ctErr.message);
  if (!callTypes || callTypes.length === 0) {
    throw new PerfectingError(422, "playbook sem etapas — gere a estrutura antes de enviar");
  }

  // Retoma um envio anterior para esta MESMA conexão; para outra conta, começa do zero.
  const previous: ExportRun = playbook.export_run ?? {};
  const resuming = previous.connection_id === connectionId;

  // export_run só guarda o último destino. Se esta conta já recebeu o playbook
  // mas o run atual é de OUTRA conta, não dá para saber o que já existe lá —
  // seguir criaria um playbook duplicado. Melhor recusar de forma explícita.
  if (!resuming) {
    const { data: bridge } = await db
      .from("playbook_perfecting_ids")
      .select("perfecting_playbook_id")
      .eq("playbook_id", playbookId)
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (bridge?.perfecting_playbook_id) {
      throw new PerfectingError(
        409,
        `este playbook já foi enviado para esta conta (playbook ${bridge.perfecting_playbook_id} lá). Exclua-o na Perfecting antes de reenviar, ou escolha outra conta.`,
      );
    }
  }

  const run: ExportRun = resuming
    ? { ...previous, finished_at: null }
    : { connection_id: connectionId, call_types: {}, call_blocks: {} };
  run.call_types ??= {};
  run.call_blocks ??= {};

  await saveRun(playbookId, run, { status: "exporting", error_detail: null });

  const { env, token } = await authenticateConnection(connection);

  // 1) o playbook em si
  if (run.perfecting_playbook_id == null) {
    run.perfecting_playbook_id = await createPlaybook(env, token, playbook.name);
    await saveRun(playbookId, run);
    await db.from("playbook_perfecting_ids").upsert(
      {
        playbook_id: playbookId,
        connection_id: connectionId,
        perfecting_playbook_id: run.perfecting_playbook_id,
      },
      { onConflict: "playbook_id,connection_id" },
    );
  }
  const remotePlaybookId = run.perfecting_playbook_id;

  const methodologies = await listMethodologies(env, token);
  let createdCallTypes = 0;
  let createdCallBlocks = 0;

  for (const ct of callTypes as CallTypeRow[]) {
    // 2) etapa
    let remoteCallTypeId = run.call_types[ct.id];
    if (remoteCallTypeId == null) {
      const callContextTypeId = await resolveCallContextTypeId(env, token, ct.call_context_slug);
      remoteCallTypeId = await createPlaybookCallType(env, token, remotePlaybookId, {
        name: ct.name,
        description: ct.description ?? ct.name,
        call_context_type_id: callContextTypeId ?? null,
        order: ct.position,
      });
      run.call_types[ct.id] = remoteCallTypeId;
      await saveRun(playbookId, run);
      createdCallTypes++;

      // 3) metodologia da etapa — sem ela o motor pode pular a etapa depois
      const methodology = methodologies.find((m) => m.slug === ct.methodology_slug);
      if (methodology) {
        await addPlaybookCallTypeMethodology(
          env,
          token,
          remotePlaybookId,
          remoteCallTypeId,
          methodology.id,
        );
      }
    }

    // 4) subetapas
    const blocks = [...(ct.playbook_call_blocks ?? [])].sort((a, b) => a.position - b.position);
    for (const block of blocks) {
      if (run.call_blocks[block.id] != null) continue;
      const remoteBlockId = await createPlaybookCallBlock(env, token, remotePlaybookId, remoteCallTypeId, {
        name: block.name,
        description: block.description ?? block.name,
        order: block.position,
        objective: block.objective,
        sample_questions: block.sample_questions ?? [],
        what_to_do: block.what_to_do ?? [],
        what_to_avoid: block.what_to_avoid ?? [],
      });
      run.call_blocks[block.id] = remoteBlockId;
      await saveRun(playbookId, run);
      createdCallBlocks++;
    }
  }

  run.finished_at = new Date().toISOString();
  await saveRun(playbookId, run, { status: "exported", error_detail: null });

  return {
    perfectingPlaybookId: remotePlaybookId,
    callTypes: createdCallTypes,
    callBlocks: createdCallBlocks,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let playbookId = "";
  try {
    const body = await req.json().catch(() => ({}));
    playbookId = typeof body.playbookId === "string" ? body.playbookId : "";
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    if (!playbookId || !connectionId) {
      return json({ ok: false, error: "playbookId e connectionId são obrigatórios" }, 400);
    }

    const result = await exportPlaybook(playbookId, connectionId);
    return json({ ok: true, ...result });
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e instanceof Error ? e.message : e) };
    if (playbookId) {
      await db.from("playbooks").update({ status: "error", error_detail: detail }).eq("id", playbookId);
    }
    return json({ ok: false, error: detail }, 500);
  }
});
