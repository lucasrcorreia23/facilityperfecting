import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import { invokeFunction } from "../_shared/invoke.ts";
import { getRolePlayPrompt, PerfectingError } from "../_shared/perfecting.ts";
import {
  addCompletionWarning,
  type CompletionRun,
  COMPLETION_STEPS,
  finalStatusFor,
  lastCompletionActivity,
  nextCompletionStep,
  runCompletionGate,
  runCompletionStep,
} from "../_shared/roleplay-completion.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Quanto desta invocação gastar antes de passar a bola para a próxima (~150s de teto). */
const INVOCATION_BUDGET_MS = 90_000;
/** Fechamento parado há mais que isto = invocação morta; o poll fecha no que tem. */
const COMPLETION_STALE_MS = 30 * 60_000;
/** Janela em que um "start" é recusado por já haver fechamento em andamento. */
const RUNNING_WINDOW_MS = 15 * 60_000;
/**
 * Silêncio mínimo antes de o poll retomar a cadeia. Entre dois passos existe um
 * instante sem nada marcado como `running` — retomar ali dispararia a mesma
 * geração de IA duas vezes.
 */
const RESUME_AFTER_MS = 3 * 60_000;

// deno-lint-ignore no-explicit-any
async function loadDraft(draftId: string): Promise<any> {
  const { data, error } = await db
    .from("roleplay_drafts")
    .select("*, connections(*)")
    .eq("id", draftId)
    .single();
  if (error || !data) throw new PerfectingError(404, "rascunho não encontrado");
  return data;
}

function saveRun(draftId: string, run: CompletionRun, patch: Record<string, unknown> = {}) {
  return db
    .from("roleplay_drafts")
    .update({ completion_run: run, ...patch })
    .eq("id", draftId);
}

/**
 * Fecha o rascunho com o veredito do gate. "incomplete" não é erro: o roleplay
 * existe e é utilizável — só está pior do que o envio prometeu.
 */
async function finish(draftId: string, run: CompletionRun, status: string): Promise<void> {
  run.stage = "done";
  run.finished_at = new Date().toISOString();
  await saveRun(draftId, run, { status });
}

/**
 * Roda os passos que faltam até o orçamento desta invocação acabar; então
 * reencadeia. Quando todos terminam, roda o gate e fecha o rascunho.
 */
async function runSteps(draftId: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const draft = await loadDraft(draftId);
    const run: CompletionRun = draft.completion_run;
    if (!run?.case_setup_id) return;
    const { env, token } = await authenticateConnection(draft.connections);

    while (true) {
      const decision = nextCompletionStep(run);

      if (decision.kind === "gate") {
        const verdict = await runCompletionGate(env, token, run);
        await finish(draftId, run, finalStatusFor(verdict));
        return;
      }
      if (decision.kind === "wait") {
        // Outra invocação está com este passo; ela (ou o poll) continua.
        await saveRun(draftId, run);
        return;
      }
      if (decision.kind === "give_up") {
        run.steps[decision.step] = {
          ...run.steps[decision.step]!,
          status: "failed",
          finished_at: new Date().toISOString(),
        };
        addCompletionWarning(run, `${decision.step}: sem resposta depois de 2 tentativas`);
        await saveRun(draftId, run);
        continue;
      }

      await runCompletionStep(env, token, run, decision.step, () => saveRun(draftId, run));

      if (Date.now() - startedAt > INVOCATION_BUDGET_MS) {
        invokeFunction("complete-roleplay", { draftId, stage: "step" });
        return;
      }
    }
  } catch (e) {
    // Nunca derruba o rascunho: o roleplay já existe na conta do cliente.
    console.error("complete-roleplay[steps]:", String(e));
  }
}

/**
 * Reconciliador. NUNCA reexecuta às cegas: quem decide é o nextCompletionStep
 * (que só volta a um passo `running` depois de stale) e, dentro do passo, a
 * leitura do artefato na Perfecting.
 */
async function runPoll(draftId: string): Promise<Record<string, unknown>> {
  const draft = await loadDraft(draftId);
  const run: CompletionRun = draft.completion_run;
  if (!run?.case_setup_id) return { ok: true, done: true, status: draft.status };
  if (draft.status !== "completing") {
    return { ok: true, done: true, status: draft.status, missing: run.missing ?? [] };
  }

  const startedAt = run.started_at ? Date.parse(run.started_at) : NaN;
  const dead = Number.isFinite(startedAt) && Date.now() - startedAt > COMPLETION_STALE_MS;
  const decision = nextCompletionStep(run);

  if (decision.kind === "wait" && !dead) {
    return { ok: true, done: false, stage: run.stage, step: decision.step };
  }

  const { env, token } = await authenticateConnection(draft.connections);

  if (decision.kind === "gate" || (dead && decision.kind !== "run")) {
    if (dead && decision.kind !== "gate") {
      addCompletionWarning(run, "fechamento interrompido: o veredito saiu com o que havia");
    }
    const verdict = await runCompletionGate(env, token, run);
    const status = finalStatusFor(verdict);
    await finish(draftId, run, status);
    return { ok: true, done: true, status, missing: verdict.missing };
  }

  // Há passo a rodar (pendente, ou running que já morreu). Só retoma se o
  // fechamento estiver realmente parado: a cadeia pode estar entre dois passos.
  const idleSince = lastCompletionActivity(run);
  if (Number.isFinite(idleSince) && Date.now() - idleSince < RESUME_AFTER_MS) {
    return { ok: true, done: false, stage: run.stage, step: decision.step };
  }
  EdgeRuntime.waitUntil(runSteps(draftId));
  return { ok: true, done: false, stage: run.stage, resumed: true };
}

/** Semeia (ou re-semeia) o run a partir do rascunho — usado pelo botão "Completar". */
function seedRun(draft: { completion_run?: CompletionRun | null; [k: string]: unknown }): CompletionRun {
  const previous = draft.completion_run ?? null;
  const scenario = (draft.scenario ?? {}) as Record<string, unknown>;
  const objections = scenario.objections;
  return {
    case_setup_id: Number(draft.perfecting_case_setup_id),
    context_id: previous?.context_id ?? null,
    persona_id: previous?.persona_id ?? null,
    methodology_id: previous?.methodology_id ?? null,
    methodology_slug: previous?.methodology_slug ?? null,
    difficulty_level_id: previous?.difficulty_level_id ?? null,
    objections_seeded: previous?.objections_seeded ??
      (Array.isArray(objections) && objections.length > 0),
    stage: "queued",
    steps: {},
    gate: null,
    missing: [],
    warnings: [],
    attempt_round: (previous?.attempt_round ?? 0) + 1,
    started_at: new Date().toISOString(),
    finished_at: null,
  };
}

/**
 * Pre-gate: 1 leitura antes de gastar IA.
 *  - sem persona, TODAS as flags vêm false e nada do que geraríamos entraria no
 *    prompt — encerra já como incompleto;
 *  - o que já existe (reenvio, segunda rodada) entra como passo concluído.
 */
async function preGate(
  draftId: string,
  run: CompletionRun,
  connection: unknown,
): Promise<{ stop: boolean }> {
  run.stage = "pre_gate";
  const { env, token } = await authenticateConnection(
    connection as Parameters<typeof authenticateConnection>[0],
  );
  const gate = await getRolePlayPrompt(env, token, run.case_setup_id);
  run.gate = gate;

  if (!gate.has_persona) {
    run.missing = ["persona"];
    addCompletionWarning(
      run,
      "sem persona no roleplay: nada do que o fechamento gera entraria no prompt",
    );
    await finish(draftId, run, "incomplete");
    return { stop: true };
  }

  const now = new Date().toISOString();
  if (gate.has_behavior_guidance) {
    run.steps.behavior_guidance = { status: "done", attempts: 0, finished_at: now, detail: { source: "pre_gate" } };
  }
  if (gate.has_knowledge_blocks) {
    run.steps.step_knowledge = { status: "done", attempts: 0, finished_at: now, detail: { source: "pre_gate" } };
  }
  await saveRun(draftId, run);
  return { stop: false };
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
  const draftId = typeof body.draftId === "string" ? body.draftId : "";
  if (!draftId) return json({ ok: false, error: "nenhum draftId" }, 400);
  const stage = typeof body.stage === "string" ? body.stage : "start";

  try {
    if (stage === "poll") return json(await runPoll(draftId));

    if (stage === "step") {
      // Elo interno da cadeia: continua de onde a invocação anterior parou.
      EdgeRuntime.waitUntil(runSteps(draftId));
      return json({ ok: true, draftId, stage }, 202);
    }

    // start
    const draft = await loadDraft(draftId);
    if (!draft.perfecting_case_setup_id) {
      return json({ ok: false, error: "rascunho sem roleplay na Perfecting" }, 400);
    }
    // A recusa é por ORIGEM, não pelo modo escolhido: o que a implementação por
    // playbook cria já passa pelo ciclo completo da Perfecting. Um rascunho marcado
    // como playbook mas enviado pelo caminho avulso (sem playbook_run) precisa do
    // fechamento como qualquer outro — senão ficaria preso em "completing".
    if (draft.playbook_run != null) {
      return json({ ok: false, error: "roleplays de playbook já nascem do ciclo completo" }, 400);
    }

    const current: CompletionRun | null = draft.completion_run ?? null;
    const startedAt = current?.started_at ? Date.parse(current.started_at) : NaN;
    if (
      body.force !== true &&
      draft.status === "completing" &&
      Number.isFinite(startedAt) &&
      Date.now() - startedAt < RUNNING_WINDOW_MS
    ) {
      return json({ ok: false, error: "fechamento já em andamento para este rascunho" }, 409);
    }

    // Um run semeado pelo export (stage "queued", sem passo nenhum) é retomado como
    // está; qualquer outro caso recomeça do zero, preservando o que o pre-gate achar.
    const fresh = current && current.stage === "queued" && Object.keys(current.steps ?? {}).length === 0;
    const run = fresh ? current! : seedRun(draft);
    await saveRun(draftId, run, { status: "completing" });

    const { stop } = await preGate(draftId, run, draft.connections);
    if (stop) return json({ ok: true, draftId, status: "incomplete", missing: run.missing }, 200);

    EdgeRuntime.waitUntil(runSteps(draftId));
    return json({ ok: true, draftId, steps: COMPLETION_STEPS }, 202);
  } catch (e) {
    const detail = e instanceof PerfectingError
      ? { status: e.status, detail: e.detail }
      : { message: String(e instanceof Error ? e.message : e) };
    return json({ ok: false, error: detail }, 500);
  }
});
