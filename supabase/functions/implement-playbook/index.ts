import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { authenticateConnection, resolveOfferContext } from "../_shared/destination.ts";
import {
  generatePersonaFromContext,
  listCaseSetupIdsByContext,
  listPlaybookCallTypes,
  openPlaybookImplementationStream,
  PerfectingError,
} from "../_shared/perfecting.ts";

/**
 * Envio no modo playbook: dispara o Engine de Implementação por Playbook, que
 * cria UM roleplay por etapa (PlaybookCallType) ancorado na oferta/contexto/
 * persona extraídos do material do rascunho.
 *
 *   stage "start" → 202 imediato; o trabalho roda em waitUntil consumindo o SSE
 *   stage "poll"  → reconcilia (não reexecuta): compara os case_setups do
 *                   contexto com o snapshot tirado antes de abrir o stream.
 *
 * O stream é só telemetria de progresso — a fonte de verdade é o diff, porque
 * implementation_ready não devolve os case_setup_id e porque o job continua
 * rodando no servidor mesmo se a Edge Function morrer antes do fim.
 * ⚠️ Reabrir o stream criaria a jornada de novo: o poll apenas LÊ.
 */

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Run mais antigo que isto sem terminar = execução morta; o poll encerra em erro. */
const STALE_AFTER_MS = 45 * 60_000;
/** Janela em que um "start" é recusado por já haver run em andamento. */
const RUNNING_WINDOW_MS = 10 * 60_000;

interface PlaybookRun {
  playbook_id?: number;
  playbook_name?: string | null;
  job_id?: string | number | null;
  stage?: string;
  call_type_index?: number | null;
  call_type_total?: number | null;
  started_at?: string;
  finished_at?: string | null;
  context_id?: number;
  persona_id?: number | null;
  before_case_setup_ids?: number[];
  case_setup_ids?: number[];
  results?: unknown[];
}

const DRAFT_COLUMNS = "*, offers(*), contexts(*), connections(*)";

// deno-lint-ignore no-explicit-any
async function loadDraft(draftId: string): Promise<any> {
  const { data, error } = await db
    .from("roleplay_drafts")
    .select(DRAFT_COLUMNS)
    .eq("id", draftId)
    .single();
  if (error || !data) throw new PerfectingError(404, "rascunho não encontrado");
  return data;
}

function saveRun(draftId: string, run: PlaybookRun, patch: Record<string, unknown> = {}) {
  return db
    .from("roleplay_drafts")
    .update({ playbook_run: run, ...patch })
    .eq("id", draftId);
}

/** Parser de SSE: acumula o buffer e emite um evento por bloco separado por linha em branco. */
async function* sseEvents(res: Response): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const raw = dataLines.join("\n");
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* evento sem JSON (ex.: heartbeat) — mantém o texto cru */
      }
      yield { event, data };
    }
  }
}

/** Fecha o rascunho com os ids criados (diff contra o snapshot inicial). */
async function finish(
  draftId: string,
  run: PlaybookRun,
  createdIds: number[],
): Promise<void> {
  run.case_setup_ids = createdIds;
  run.finished_at = new Date().toISOString();
  run.stage = "done";
  await saveRun(draftId, run, {
    status: "exported",
    perfecting_case_setup_id: createdIds[0] ?? null,
    error_detail: null,
  });
}

async function fail(draftId: string, run: PlaybookRun, detail: unknown): Promise<void> {
  run.finished_at = new Date().toISOString();
  await saveRun(draftId, run, { status: "error", error_detail: detail });
}

async function run(draftId: string): Promise<void> {
  const draft = await loadDraft(draftId).catch(() => null);
  if (!draft) return;
  const playbookRun: PlaybookRun = { ...(draft.playbook_run ?? {}) };

  try {
    const playbookId = playbookRun.playbook_id;
    if (typeof playbookId !== "number") {
      throw new PerfectingError(400, "rascunho sem playbook_id");
    }

    const { env, token } = await authenticateConnection(draft.connections);

    // Total de etapas antes de começar: alimenta o progresso na UI e o poll.
    const callTypes = await listPlaybookCallTypes(env, token, playbookId);
    if (callTypes.length === 0) {
      throw new PerfectingError(422, "playbook sem etapas (call types) configuradas");
    }
    playbookRun.call_type_total = callTypes.length;
    playbookRun.stage = "offer";
    await saveRun(draftId, playbookRun);

    const { perfectingContextId } = await resolveOfferContext(
      db,
      draft,
      env,
      token,
      async (step) => {
        playbookRun.stage = step;
        await saveRun(draftId, playbookRun);
      },
    );
    playbookRun.context_id = perfectingContextId;

    // Persona SEMPRE (nos dois ambientes): é o grounding da jornada inteira.
    // Sem persona_id a API sorteia uma do contexto — que pode não existir.
    playbookRun.stage = "persona";
    await saveRun(draftId, playbookRun);
    const persona = await generatePersonaFromContext(env, token, perfectingContextId);
    playbookRun.persona_id = persona.id;

    // Snapshot ANTES de abrir o stream — é o que identifica os roleplays novos.
    playbookRun.before_case_setup_ids = await listCaseSetupIdsByContext(
      env,
      token,
      perfectingContextId,
    );
    playbookRun.stage = "implementing";
    await saveRun(draftId, playbookRun);

    const res = await openPlaybookImplementationStream(
      env,
      token,
      playbookId,
      perfectingContextId,
      persona.id,
    );

    for await (const { event, data } of sseEvents(res)) {
      if (event === "heartbeat") continue;
      const payload = (data ?? {}) as Record<string, unknown>;

      if (event === "implementation_started") {
        playbookRun.job_id = (payload.job_id as string | number) ?? null;
        await saveRun(draftId, playbookRun);
      } else if (event === "stage_update") {
        playbookRun.stage = typeof payload.stage === "string" ? payload.stage : playbookRun.stage;
        if (typeof payload.call_type_index === "number") {
          playbookRun.call_type_index = payload.call_type_index;
        }
        if (typeof payload.call_type_total === "number") {
          playbookRun.call_type_total = payload.call_type_total;
        }
        await saveRun(draftId, playbookRun);
      } else if (event === "implementation_ready") {
        playbookRun.results = Array.isArray(payload.results) ? payload.results : [];
        break;
      } else if (event === "error") {
        throw new PerfectingError(502, payload);
      }
    }

    const after = await listCaseSetupIdsByContext(env, token, perfectingContextId);
    const before = new Set(playbookRun.before_case_setup_ids ?? []);
    const created = after.filter((id) => !before.has(id));
    // Stream terminou sem criar nada (ex.: todas as etapas puladas) — não é sucesso.
    if (created.length === 0) {
      throw new PerfectingError(502, {
        message: "a implementação não criou nenhum roleplay",
        results: playbookRun.results ?? [],
      });
    }
    await finish(draftId, playbookRun, created);
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e) };
    console.error("export-playbook falhou:", JSON.stringify(detail));
    await fail(draftId, playbookRun, detail).catch(() => {});
  }
}

/**
 * Reconcilia sem reexecutar: se já existe um case_setup novo por etapa, fecha o
 * rascunho. Cobre o caso da Edge Function morrer com o job seguindo no servidor.
 */
async function runPoll(draftId: string): Promise<{ done: boolean; created?: number; total?: number }> {
  const draft = await loadDraft(draftId);
  if (draft.status !== "exporting") return { done: draft.status === "exported" };

  const playbookRun: PlaybookRun = { ...(draft.playbook_run ?? {}) };
  const contextId = playbookRun.context_id;
  // Ainda nem chegou a criar o contexto: só o run em andamento pode avançar.
  if (typeof contextId !== "number") return { done: false };

  const { env, token } = await authenticateConnection(draft.connections);
  const after = await listCaseSetupIdsByContext(env, token, contextId);
  const before = new Set(playbookRun.before_case_setup_ids ?? []);
  const created = after.filter((id) => !before.has(id));
  const total = playbookRun.call_type_total ?? 0;

  if (total > 0 && created.length >= total) {
    await finish(draftId, playbookRun, created);
    return { done: true, created: created.length, total };
  }

  const startedAt = playbookRun.started_at ? Date.parse(playbookRun.started_at) : NaN;
  if (Number.isFinite(startedAt) && Date.now() - startedAt > STALE_AFTER_MS) {
    await fail(draftId, playbookRun, {
      message: `implementação não concluiu: ${created.length} de ${total} roleplay(s) criados`,
      case_setup_ids: created,
    });
    return { done: true, created: created.length, total };
  }

  return { done: false, created: created.length, total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    const stage = body.stage === "poll" ? "poll" : "start";
    if (!draftId) return json({ ok: false, error: "draftId é obrigatório" }, 400);

    if (stage === "poll") {
      try {
        const result = await runPoll(draftId);
        return json({ ok: true, ...result }, 200);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("export-playbook[poll] falhou:", message);
        return json({ ok: false, error: message }, 200);
      }
    }

    const draft = await loadDraft(draftId);
    const playbookId = draft.scenario?.playbook_id;
    if (typeof playbookId !== "number") {
      return json({ ok: false, error: "rascunho sem playbook selecionado" }, 400);
    }

    const current: PlaybookRun = draft.playbook_run ?? {};
    const startedAt = current.started_at ? Date.parse(current.started_at) : NaN;
    if (
      draft.status === "exporting" &&
      Number.isFinite(startedAt) &&
      Date.now() - startedAt < RUNNING_WINDOW_MS
    ) {
      return json({ ok: false, error: "implementação já em andamento para este rascunho" }, 409);
    }

    const playbookRun: PlaybookRun = {
      playbook_id: playbookId,
      playbook_name: draft.scenario?.playbook_name ?? null,
      stage: "starting",
      started_at: new Date().toISOString(),
      finished_at: null,
      call_type_index: null,
      call_type_total: null,
      case_setup_ids: [],
    };
    await saveRun(draftId, playbookRun, { status: "exporting", error_detail: null });

    EdgeRuntime.waitUntil(run(draftId));
    return json({ ok: true, draftId, playbookId }, 202);
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e instanceof Error ? e.message : e) };
    return json({ ok: false, error: detail }, 500);
  }
});
