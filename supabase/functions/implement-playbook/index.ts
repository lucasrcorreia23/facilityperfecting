import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection, resolveOfferContext } from "../_shared/destination.ts";
import { sseEvents } from "../_shared/sse.ts";
import { applyBlockObjections } from "../_shared/block-objections.ts";
import {
  applyStepObjections,
  assignObjectionsToCallTypes,
  type ObjectionStepAssignment,
} from "../_shared/step-objections.ts";
import {
  type CallTypeState,
  type CaseSetupCheck,
  computeCallTypeStates,
  incompleteCallTypeWarnings,
} from "../_shared/call-type-states.ts";
import {
  applyContextContent,
  messageOf,
  type GuardrailSeed,
  type ObjectionSeed,
} from "../_shared/context-content.ts";
import {
  type CaseSetupRepairStep,
  countPlaybookCallBlockRubrics,
  DIFFICULTY_LEVEL_IDS,
  generatePlaybookCallTypeRubrics,
  generatePersonaFromContext,
  getCaseSetup,
  listCaseSetupIdsByContext,
  listPersonasByContext,
  listPlaybookCallBlocks,
  listPlaybookCallTypes,
  openPersonaBatchStream,
  openPlaybookImplementationStream,
  PerfectingError,
  type PerfectingEnv,
  runCaseSetupRepairStep,
  setCaseSetupPersona,
  setPlaybookCallTypePrecedent,
} from "../_shared/perfecting.ts";

/**
 * Envio no modo playbook: dispara o Engine de Implementação por Playbook, que
 * cria UM roleplay por etapa (PlaybookCallType) ancorado na oferta/contexto do
 * rascunho.
 *
 * Personas: quando `scenario.persona_count` (1..10, default 1) pede mais de uma,
 * um LOTE é gerado no contexto ANTES da implementação — o Ciclo Unitário embutido
 * no Engine faz fan-out de conteúdo por etapa/bloco para CADA persona já existente
 * no contexto quando ele roda, então criar as personas antes garante que todas
 * ganhem conteúdo próprio de graça (ver docs/fluxo_implementacao_role_play.md do
 * backend, §9/§5.9). Nesse caso os case_setups nascem SEM `persona_id` (genéricos):
 * o vendedor escolhe qual persona enfrentar na hora da call. Com
 * `persona_count <= 1` o comportamento é o de sempre: uma persona só, travada em
 * todas as etapas.
 *
 * Etapas marcadas em `scenario.fixed_persona_call_type_ids` são travadas na
 * persona principal depois da implementação (estágio "locking_personas").
 *
 *   stage "start"        → 202 imediato; o trabalho roda em waitUntil consumindo os SSE
 *   stage "poll"         → reconcilia (não reexecuta): compara personas/case_setups do
 *                          contexto com os snapshots tirados antes de abrir cada stream
 *   stage "add_personas" → lote avulso num rascunho já exportado (não mexe no status)
 *
 * Os streams (lote de personas e implementação) são só telemetria de progresso —
 * a fonte de verdade é sempre um diff contra um snapshot tirado antes de abrir
 * cada um, porque nenhum dos dois devolve de forma confiável tudo que criou se
 * cair no meio, e porque o job continua rodando no servidor mesmo se a Edge
 * Function morrer antes do fim.
 * ⚠️ Reabrir qualquer um dos dois streams recriaria trabalho (uma segunda leva de
 * personas, ou a jornada de roleplays inteira): o poll NUNCA reabre stream.
 *
 * ⚠️ Única exceção ao "o poll apenas LÊ": ele pode completar o travamento de
 * persona (`lockFixedPersonas`). Não é quebra da regra — aquele passo é um PUT
 * determinístico, sem IA, idempotente (escrever o mesmo persona_id duas vezes é
 * no-op) e que não cria recurso nenhum. Ver a docstring da função.
 */

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Run mais antigo que isto sem terminar = execução morta; o poll encerra em erro.
 * Alto o bastante para cobrir dois streams SSE longos em sequência (lote de
 * personas + implementação), cada um com minutos de IA por item.
 */
const STALE_AFTER_MS = 90 * 60_000;
/** Janela em que um "start" é recusado por já haver run em andamento. */
const RUNNING_WINDOW_MS = 30 * 60_000;

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
  /** @deprecated drafts anteriores ao modo multi-persona. Ver persona_ids. */
  persona_id?: number | null;
  /** Todas as personas do contexto ao final do estágio de personas (1 ou mais). */
  persona_ids?: number[];
  persona_names?: string[];
  /** Persona usada nas etapas marcadas como "persona fixa" (a 1ª do contexto). */
  primary_persona_id?: number | null;
  /** Quantas personas a Criação pediu (eco de scenario.persona_count). */
  personas_requested?: number | null;
  /** job_id do lote de personas (batch_started), telemetria. */
  persona_job_id?: string | number | null;
  /** Progresso do lote de personas — item i/N (empresa ou persona), não etapa. */
  item_index?: number | null;
  item_total?: number | null;
  before_case_setup_ids?: number[];
  case_setup_ids?: number[];
  /** Etapas que devem travar na persona principal (eco do scenario). */
  fixed_call_type_ids?: number[];
  /** playbook_call_type_id → case_setup_id criado. Sobrevive à queda do processo. */
  call_type_case_setups?: Record<string, number>;
  /** case_setups já travados — permite o poll retomar sem repetir. */
  locked_case_setup_ids?: number[];
  /** Avisos não-fatais (ex.: persona fixa não aplicada numa etapa). */
  warnings?: string[];
  /** Quantas objeções/guardrails do material foram criados no contexto. */
  context_content?: {
    objections_created: number;
    objections_skipped: number;
    guardrails_created: number;
    guardrails_skipped: number;
  };
  /**
   * Objeções do material criadas no case_setup de cada etapa (ver step-objections.ts).
   * "waiting_assignment" = a implementação fechou antes do encaixe da IA; quem termina o
   * encaixe aplica.
   */
  step_objections?: {
    state: "waiting_assignment" | "done";
    objections_created?: number;
    objections_skipped?: number;
    unassigned?: string[];
  };
  /** case_setup_id → etapa e se já tem agente de voz (cache da classificação). */
  case_setup_checks?: Record<string, CaseSetupCheck>;
  /** Situação de cada etapa na Perfecting (ver classifyCallTypes). */
  call_type_states?: CallTypeState[];
  /** Lote avulso de personas num rascunho já exportado. */
  persona_topup?: PersonaTopUp;
  results?: unknown[];
}

/** Estado do lote avulso de personas disparado depois do envio. */
interface PersonaTopUp {
  requested?: number;
  stage?: string;
  item_index?: number | null;
  item_total?: number | null;
  started_at?: string;
  finished_at?: string | null;
  error?: string | null;
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

/** Acrescenta um aviso não-fatal, sem repetir (o poll pode passar aqui de novo). */
function addWarning(run: PlaybookRun, message: string): void {
  if (!run.warnings) run.warnings = [];
  if (!run.warnings.includes(message)) run.warnings.push(message);
}

/** Busca o que falta dos roleplays e aplica a regra de `computeCallTypeStates`. */
async function classifyCallTypes(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  caseSetupIds: number[],
  run: PlaybookRun,
  options: { treatPendingAsFailed?: boolean } = {},
): Promise<CallTypeState[]> {
  const callTypes = await listPlaybookCallTypes(env, token, playbookId);
  const checks: Record<string, CaseSetupCheck> = { ...(run.case_setup_checks ?? {}) };
  for (const id of caseSetupIds) {
    // Roleplay completo não muda mais; os outros são relidos a cada rodada.
    if (checks[String(id)]?.has_agent) continue;
    const cs = await getCaseSetup(env, token, id);
    checks[String(id)] = {
      call_type_id: cs.playbook_call_type_id,
      has_agent: cs.elevenlabs_agent_id != null,
    };
  }

  const states = computeCallTypeStates(callTypes, caseSetupIds, checks, options);
  run.case_setup_checks = checks;
  run.call_type_states = states;
  const map: Record<string, number> = { ...(run.call_type_case_setups ?? {}) };
  for (const st of states) {
    if (st.case_setup_id != null) map[String(st.call_type_id)] = st.case_setup_id;
  }
  run.call_type_case_setups = map;
  return states;
}

function warnIncompleteCallTypes(run: PlaybookRun, states: CallTypeState[]): void {
  for (const message of incompleteCallTypeWarnings(states)) addWarning(run, message);
}

/**
 * Trava a persona principal nas etapas marcadas como "persona fixa"; as demais
 * ficam genéricas (aceitando todas as personas do contexto).
 *
 * Idempotente e sem IA: o PUT escreve o mesmo `persona_id` quantas vezes rodar, e
 * nenhuma das chamadas aqui cria recurso. É por isso que o poll PODE completar
 * este passo — diferente dos streams, que nunca podem ser reabertos.
 *
 * Falha aqui NÃO derruba o rascunho: os roleplays já existem e ficam utilizáveis
 * (genéricos). Travar é refinamento — vira warning, e o ajuste fino fica para a
 * Perfecting.
 */
async function lockFixedPersonas(
  env: PerfectingEnv,
  token: string,
  draftId: string,
  run: PlaybookRun,
  created: number[],
): Promise<void> {
  const fixed = run.fixed_call_type_ids ?? [];
  const primary = run.primary_persona_id ?? run.persona_ids?.[0] ?? null;
  if (fixed.length === 0 || primary == null) return;

  const locked = new Set(run.locked_case_setup_ids ?? []);
  const map: Record<string, number> = { ...(run.call_type_case_setups ?? {}) };

  // O diff devolve ids sem dizer de que etapa cada um veio — descobrir lendo o
  // playbook_call_type_id de volta. Casar por ordem seria frágil.
  const mapped = new Set(Object.values(map));
  const allFixedMapped = () => fixed.every((id) => map[String(id)] != null);
  for (const caseSetupId of created) {
    if (allFixedMapped()) break; // já achei as etapas fixas: não preciso ler o resto
    if (mapped.has(caseSetupId)) continue;
    try {
      const cs = await getCaseSetup(env, token, caseSetupId);
      if (cs.playbook_call_type_id != null) {
        map[String(cs.playbook_call_type_id)] = caseSetupId;
      }
    } catch {
      addWarning(run, `não foi possível ler o roleplay ${caseSetupId} para travar a persona`);
    }
  }
  run.call_type_case_setups = map;
  run.stage = "locking_personas";
  await saveRun(draftId, run);

  for (const callTypeId of fixed) {
    const caseSetupId = map[String(callTypeId)];
    if (caseSetupId == null) {
      addWarning(run, `etapa ${callTypeId}: roleplay não encontrado, persona fixa não aplicada`);
      continue;
    }
    if (locked.has(caseSetupId)) continue;
    try {
      await setCaseSetupPersona(env, token, caseSetupId, primary);
      locked.add(caseSetupId);
      run.locked_case_setup_ids = Array.from(locked);
      await saveRun(draftId, run);
    } catch {
      addWarning(run, `roleplay ${caseSetupId}: falha ao travar a persona fixa`);
    }
  }
}

/**
 * Cria as objeções do material no roleplay de cada etapa, conforme o encaixe salvo em
 * `scenario.objection_steps`. Relê o scenario do banco: o encaixe é gravado por outra
 * invocação, depois que este run começou.
 *
 * Sem IA e idempotente, então o poll pode completar este passo como faz com a persona
 * fixa. Falha nunca derruba o envio: vira aviso.
 */
async function applyObjectionsToSteps(
  env: PerfectingEnv,
  token: string,
  draftId: string,
  run: PlaybookRun,
): Promise<void> {
  const { data } = await db.from("roleplay_drafts").select("scenario").eq("id", draftId).single();
  const seeds = (data?.scenario?.objections ?? []) as ObjectionSeed[];
  if (seeds.length === 0) return;
  const assignment = data?.scenario?.objection_steps as ObjectionStepAssignment | undefined;
  if (!assignment || assignment.playbook_id !== run.playbook_id) {
    run.step_objections = { state: "waiting_assignment" };
    return;
  }

  run.stage = "step_objections";
  await saveRun(draftId, run);
  const applied = await applyStepObjections(
    env,
    token,
    assignment,
    run.call_type_case_setups ?? {},
    seeds,
    DIFFICULTY_LEVEL_IDS,
  );
  run.step_objections = {
    state: "done",
    objections_created: applied.objections_created,
    objections_skipped: applied.objections_skipped,
    unassigned: applied.unassigned,
  };
  for (const w of applied.warnings) addWarning(run, w);
  if (applied.unassigned.length > 0) {
    addWarning(
      run,
      `objeções sem etapa, não foram para nenhum roleplay: ${applied.unassigned.join(", ")}`,
    );
  }
  await saveRun(draftId, run);
}

/** Grava o encaixe objeção → etapa no scenario, sem tocar no resto do rascunho. */
async function saveObjectionSteps(draftId: string, assignment: ObjectionStepAssignment) {
  const { data, error } = await db
    .from("roleplay_drafts")
    .select("scenario")
    .eq("id", draftId)
    .single();
  if (error) throw error;
  await db
    .from("roleplay_drafts")
    .update({ scenario: { ...(data?.scenario ?? {}), objection_steps: assignment } })
    .eq("id", draftId);
}

/** Dispara outra invocação desta função, para a IA não gastar o limite de ~150s desta. */
function invokeSelf(body: Record<string, unknown>): void {
  const label = String(body.stage);
  EdgeRuntime.waitUntil(
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/implement-playbook`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
      .then((r) => r.ok || console.error(`${label}[auto] não disparou:`, r.status))
      .catch((e) => console.error(`${label}[auto] não disparou:`, String(e))),
  );
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

    // Guardrails do material, ANTES da implementação: são context-wide, então todo
    // roleplay criado a seguir já nasce com eles. Objeções NÃO vão para o contexto —
    // entrariam em todas as etapas; vão para o roleplay de cada etapa no fim (ver
    // applyObjectionsToSteps). Nunca derruba o envio — falha aqui vira aviso.
    const seedGuardrails = (draft.scenario?.guardrails ?? []) as GuardrailSeed[];
    if (seedGuardrails.length > 0) {
      playbookRun.stage = "context_content";
      await saveRun(draftId, playbookRun);
      const applied = await applyContextContent(
        env,
        token,
        perfectingContextId,
        [],
        seedGuardrails,
        DIFFICULTY_LEVEL_IDS,
      );
      playbookRun.context_content = applied;
      for (const w of applied.warnings) addWarning(playbookRun, w);
      await saveRun(draftId, playbookRun);
    }

    // Personas: 1..10, default 1 (comportamento de sempre). > 1 dispara o lote
    // ANTES da implementação — ver docstring do arquivo.
    const personaCount = Math.min(
      Math.max(Math.trunc(Number(draft.scenario?.persona_count)) || 1, 1),
      10,
    );
    const personaInstructions =
      typeof draft.scenario?.persona_instructions === "string"
        ? draft.scenario.persona_instructions.trim() || null
        : null;
    playbookRun.personas_requested = personaCount;
    // Travar etapa só faz sentido com pool: com 1 persona já está tudo travado nela.
    playbookRun.fixed_call_type_ids =
      personaCount > 1 && Array.isArray(draft.scenario?.fixed_persona_call_type_ids)
        ? (draft.scenario.fixed_persona_call_type_ids as unknown[]).filter(
            (id): id is number => typeof id === "number",
          )
        : [];

    let personaIdForStream: number | null;
    if (personaCount <= 1) {
      // Persona SEMPRE (nos dois ambientes): é o grounding da jornada inteira.
      // Sem persona_id a API sorteia uma do contexto — que pode não existir.
      playbookRun.stage = "persona";
      await saveRun(draftId, playbookRun);
      const persona = await generatePersonaFromContext(env, token, perfectingContextId);
      playbookRun.persona_id = persona.id;
      playbookRun.persona_ids = [persona.id];
      playbookRun.persona_names = [persona.name ?? `Persona ${persona.id}`];
      personaIdForStream = persona.id;
    } else {
      playbookRun.stage = "personas";
      await saveRun(draftId, playbookRun);

      // Reuso de contexto: não recriar o que um envio anterior já deixou lá —
      // qualquer persona do contexto entra no pool (a API oferece TODAS as
      // personas do context_id numa etapa genérica, não só as "pedidas" agora).
      const before = await listPersonasByContext(env, token, perfectingContextId);
      const missing = Math.max(0, personaCount - before.length);

      if (missing > 0) {
        const res = await openPersonaBatchStream(env, token, perfectingContextId, missing, {
          additionalInstructions: personaInstructions,
        });
        for await (const { event, data } of sseEvents(res)) {
          if (event === "heartbeat") continue;
          const payload = (data ?? {}) as Record<string, unknown>;
          if (event === "batch_started") {
            playbookRun.persona_job_id = (payload.job_id as string | number) ?? null;
            await saveRun(draftId, playbookRun);
          } else if (event === "stage_update") {
            if (typeof payload.stage === "string") playbookRun.stage = payload.stage;
            if (typeof payload.current === "number") playbookRun.item_index = payload.current;
            if (typeof payload.total === "number") playbookRun.item_total = payload.total;
            await saveRun(draftId, playbookRun);
          } else if (event === "batch_ready") {
            break;
          } else if (event === "error") {
            throw new PerfectingError(502, payload);
          }
        }
      }

      // Leitura autoritativa ao final (cobre tanto o caminho feliz quanto o
      // stream ter caído sem `batch_ready`): é ela, não o evento, que decide
      // quais personas existem — e captura os nomes para a Biblioteca.
      const after = await listPersonasByContext(env, token, perfectingContextId);
      playbookRun.persona_ids = after.map((p) => p.id);
      playbookRun.persona_names = after.map((p) => p.name ?? `Persona ${p.id}`);
      playbookRun.persona_id = playbookRun.persona_ids[0] ?? null; // compat com leitores antigos
      // "Principal" = a primeira do contexto; é nela que as etapas fixas travam.
      playbookRun.primary_persona_id = playbookRun.persona_ids[0] ?? null;
      if (playbookRun.persona_ids.length === 0) {
        throw new PerfectingError(502, "o lote não deixou nenhuma persona no contexto");
      }
      // Etapas nascem SEM persona_id (genéricas) — a API oferece o pool inteiro.
      personaIdForStream = null;
    }

    // Snapshot ANTES de abrir o stream de implementação — identifica os roleplays novos.
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
      personaIdForStream,
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
    // Stream concluído: nada mais está sendo montado, pendente = falhou.
    const states = await classifyCallTypes(env, token, playbookId, created, playbookRun, {
      treatPendingAsFailed: true,
    });
    warnIncompleteCallTypes(playbookRun, states);
    await lockFixedPersonas(env, token, draftId, playbookRun, created);
    await applyObjectionsToSteps(env, token, draftId, playbookRun).catch((e) =>
      addWarning(playbookRun, `objeções das etapas não aplicadas: ${messageOf(e)}`),
    );
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
 * Lote avulso de personas num rascunho JÁ exportado: acrescenta N personas ao
 * contexto que os roleplays daquele rascunho usam.
 *
 * É a forma correta de adicionar persona depois do envio: o S3 do próprio lote faz
 * backfill do conteúdo por etapa/bloco em cada case_setup que já existe no
 * contexto — repassar isso na mão, case_setup por case_setup, não funcionaria
 * (o `step_knowledge/generate` tem idempotência por case_setup inteiro, não por
 * persona, então pularia os que já têm conteúdo de outra persona).
 *
 * Nunca mexe em `status`: o rascunho segue "exported". O progresso vai para
 * `playbook_run.persona_topup` e chega na Biblioteca por realtime.
 */
async function runAddPersonas(draftId: string, quantity: number): Promise<void> {
  const draft = await loadDraft(draftId).catch(() => null);
  if (!draft) return;
  const playbookRun: PlaybookRun = { ...(draft.playbook_run ?? {}) };
  const contextId = playbookRun.context_id;
  const topup: PersonaTopUp = {
    requested: quantity,
    stage: "starting",
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
  };
  playbookRun.persona_topup = topup;

  try {
    if (typeof contextId !== "number") {
      throw new PerfectingError(400, "rascunho sem contexto na Perfecting");
    }
    const { env, token } = await authenticateConnection(draft.connections);
    await saveRun(draftId, playbookRun);

    const res = await openPersonaBatchStream(env, token, contextId, quantity);
    for await (const { event, data } of sseEvents(res)) {
      if (event === "heartbeat") continue;
      const payload = (data ?? {}) as Record<string, unknown>;
      if (event === "stage_update") {
        if (typeof payload.stage === "string") topup.stage = payload.stage;
        if (typeof payload.current === "number") topup.item_index = payload.current;
        if (typeof payload.total === "number") topup.item_total = payload.total;
        await saveRun(draftId, playbookRun);
      } else if (event === "batch_ready") {
        break;
      } else if (event === "error") {
        throw new PerfectingError(502, payload);
      }
    }

    // Leitura autoritativa: é ela que decide o pool final, não o evento.
    const personas = await listPersonasByContext(env, token, contextId);
    playbookRun.persona_ids = personas.map((p) => p.id);
    playbookRun.persona_names = personas.map((p) => p.name ?? `Persona ${p.id}`);
    topup.stage = "done";
    topup.finished_at = new Date().toISOString();
    await saveRun(draftId, playbookRun);
  } catch (e) {
    const detail = e instanceof PerfectingError ? e.detail : String(e);
    console.error("add_personas falhou:", JSON.stringify(detail));
    topup.error = typeof detail === "string" ? detail : JSON.stringify(detail);
    topup.stage = "error";
    topup.finished_at = new Date().toISOString();
    try {
      await saveRun(draftId, playbookRun);
    } catch {
      /* rascunho pode ter sido apagado no meio — nada a fazer */
    }
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

  // Contexto resolvido, mas o snapshot de case_setups ainda não foi tirado: o run
  // está parado no estágio de personas (lote SSE). Sem before_case_setup_ids não
  // dá para diferenciar "case_setup novo" de "já existia de um envio anterior" —
  // então só medimos staleness aqui. NUNCA reabrir o lote (sem chave de dedupe,
  // reabrir criaria uma segunda leva de personas).
  if (!Array.isArray(playbookRun.before_case_setup_ids)) {
    const personaStartedAt = playbookRun.started_at ? Date.parse(playbookRun.started_at) : NaN;
    if (Number.isFinite(personaStartedAt) && Date.now() - personaStartedAt > STALE_AFTER_MS) {
      await fail(draftId, playbookRun, { message: "geração de personas não concluiu" });
      return { done: true };
    }
    return { done: false };
  }

  const { env, token } = await authenticateConnection(draft.connections);
  const after = await listCaseSetupIdsByContext(env, token, contextId);
  const before = new Set(playbookRun.before_case_setup_ids ?? []);
  const created = after.filter((id) => !before.has(id));
  const total = playbookRun.call_type_total ?? 0;
  const startedAt = playbookRun.started_at ? Date.parse(playbookRun.started_at) : NaN;
  const stale = Number.isFinite(startedAt) && Date.now() - startedAt > STALE_AFTER_MS;

  // Só fecha quando nenhuma etapa está sendo montada. Ter um case_setup por etapa não
  // basta: o último pode estar no meio do ciclo, e um do meio pode ter falhado.
  let classified = false;
  if (
    typeof playbookRun.playbook_id === "number" &&
    created.length > 0 &&
    (created.length >= total || stale)
  ) {
    const states = await classifyCallTypes(
      env,
      token,
      playbookRun.playbook_id,
      created,
      playbookRun,
      { treatPendingAsFailed: stale },
    );
    classified = true;
    if (!states.some((st) => st.state === "pending")) {
      warnIncompleteCallTypes(playbookRun, states);
      // Idempotente e sem IA — completa o que o run não alcançou antes de morrer.
      await lockFixedPersonas(env, token, draftId, playbookRun, created).catch(() => {});
      await applyObjectionsToSteps(env, token, draftId, playbookRun).catch((e) =>
        addWarning(playbookRun, `objeções das etapas não aplicadas: ${messageOf(e)}`),
      );
      await finish(draftId, playbookRun, created);
      return { done: true, created: created.length, total };
    }
  }

  if (stale) {
    await fail(draftId, playbookRun, {
      message: `implementação não concluiu: ${created.length} de ${total} roleplay(s) criados`,
      case_setup_ids: created,
    });
    return { done: true, created: created.length, total };
  }

  // O run() é encerrado no limite de wall-clock da Edge Function (~150s), muito
  // antes da jornada acabar: o job segue na Perfecting, mas o SSE para de gravar
  // progresso. A partir daí a contagem de roleplays criados é a única fonte.
  // Só avança (nunca regride o que o SSE reportou) e o update exige status
  // "exporting", para não sobrescrever um finish() que tenha acabado de gravar.
  const inProgress = total > 0 ? Math.min(created.length + 1, total) : 0;
  const advanced = inProgress > (playbookRun.call_type_index ?? 0);
  if (advanced || classified) {
    if (advanced) playbookRun.call_type_index = inProgress;
    playbookRun.case_setup_ids = created;
    playbookRun.stage = "tracking_remote";
    await db
      .from("roleplay_drafts")
      .update({ playbook_run: playbookRun })
      .eq("id", draftId)
      .eq("status", "exporting");
  }

  return { done: false, created: created.length, total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    const stage =
      body.stage === "poll" ||
      body.stage === "add_personas" ||
      body.stage === "apply_context_content" ||
      body.stage === "apply_block_objections" ||
      body.stage === "assign_objection_steps" ||
      body.stage === "repair_run"
        ? body.stage
        : "start";
    if (!draftId) return json({ ok: false, error: "draftId é obrigatório" }, 400);

    // Manutenção de um envio já feito: uma operação por chamada (cada uma cabe nos ~150s)
    // e só sobre roleplays e etapas DESTE rascunho.
    if (stage === "repair_run") {
      const draft = await loadDraft(draftId);
      const current: PlaybookRun = { ...(draft.playbook_run ?? {}) };
      const playbookId = current.playbook_id ?? draft.scenario?.playbook_id;
      const caseSetupIds = current.case_setup_ids ?? [];
      if (typeof playbookId !== "number" || caseSetupIds.length === 0) {
        return json({ ok: false, error: "rascunho sem playbook ou sem roleplays criados" }, 400);
      }
      const { env, token } = await authenticateConnection(draft.connections);
      const op = String(body.op ?? "");

      if (op === "inspect") {
        const states = await classifyCallTypes(env, token, playbookId, caseSetupIds, current);
        return json({ ok: true, op, playbookId, states });
      }

      if (op === "set_precedence") {
        const callTypes = await listPlaybookCallTypes(env, token, playbookId);
        const chain = [];
        for (const [i, ct] of callTypes.entries()) {
          const precedent = i > 0 ? callTypes[i - 1] : null;
          await setPlaybookCallTypePrecedent(env, token, playbookId, ct.id, precedent?.id ?? null);
          chain.push({ call_type_id: ct.id, name: ct.name, precedent: precedent?.name ?? null });
        }
        return json({ ok: true, op, playbookId, chain });
      }

      if (op === "inspect_rubrics") {
        const callTypes = await listPlaybookCallTypes(env, token, playbookId);
        const report = await Promise.all(
          callTypes.map(async (ct) => {
            const blocks = await listPlaybookCallBlocks(env, token, playbookId, ct.id);
            return {
              call_type_id: ct.id,
              name: ct.name,
              blocks: await Promise.all(
                blocks.map(async (b) => ({
                  block_id: b.id,
                  name: b.name,
                  rubrics: await countPlaybookCallBlockRubrics(env, token, playbookId, ct.id, b.id),
                })),
              ),
            };
          }),
        );
        return json({ ok: true, op, playbookId, report });
      }

      if (op === "rubrics") {
        const callTypeId = Number(body.callTypeId);
        const callTypes = await listPlaybookCallTypes(env, token, playbookId);
        if (!callTypes.some((ct) => ct.id === callTypeId)) {
          return json({ ok: false, error: "etapa não pertence ao playbook deste rascunho" }, 400);
        }
        const result = await generatePlaybookCallTypeRubrics(env, token, playbookId, callTypeId);
        return json({ ok: true, op, callTypeId, result });
      }

      const caseSetupSteps: CaseSetupRepairStep[] = [
        "behavior_guidance",
        "objections",
        "update_prompt",
        "elevenlabs_agent",
        "last_call_info",
      ];
      if (caseSetupSteps.includes(op as CaseSetupRepairStep)) {
        const caseSetupId = Number(body.caseSetupId);
        if (!caseSetupIds.includes(caseSetupId)) {
          return json({ ok: false, error: "roleplay não pertence a este rascunho" }, 400);
        }
        const result = await runCaseSetupRepairStep(
          env,
          token,
          caseSetupId,
          op as CaseSetupRepairStep,
        );
        return json({ ok: true, op, caseSetupId, result });
      }

      return json({ ok: false, error: `op desconhecida: ${op}` }, 400);
    }

    // Preenche os blocos VAZIOS do playbook com as objeções do rascunho (IA escolhe o
    // encaixe). Escreve no catálogo do playbook, que vale para toda oferta que usar esse
    // playbook. `auto: true` é o disparo do envio: só age em playbook sem nenhuma objeção
    // em bloco, e responde 202 na hora (roda no waitUntil desta invocação).
    if (stage === "apply_block_objections") {
      const draft = await loadDraft(draftId);
      const playbookId = draft.scenario?.playbook_id;
      if (typeof playbookId !== "number") {
        return json({ ok: false, error: "rascunho sem playbook selecionado" }, 400);
      }
      const objections = (draft.scenario?.objections ?? []) as ObjectionSeed[];
      const apply = async () => {
        const { env, token } = await authenticateConnection(draft.connections);
        return applyBlockObjections(env, token, playbookId, objections, {
          onlyUntouchedPlaybook: body.auto === true,
        });
      };
      if (body.auto === true) {
        EdgeRuntime.waitUntil(
          apply()
            .then((r) => console.log("block_objections[auto]:", JSON.stringify(r)))
            .catch((e) => console.error("block_objections[auto] falhou:", messageOf(e))),
        );
        return json({ ok: true, playbookId }, 202);
      }
      return json({ ok: true, playbookId, ...(await apply()) }, 200);
    }

    // Encaixa as objeções do rascunho nas etapas do playbook (IA) e grava em
    // scenario.objection_steps. Se a implementação já fechou, aplica na hora — senão
    // quem fechar aplica. `auto: true` é o disparo do envio: responde 202 e reusa um
    // encaixe já feito para o mesmo playbook. Manual: `recompute: true` refaz o encaixe.
    if (stage === "assign_objection_steps") {
      const draft = await loadDraft(draftId);
      const playbookId = draft.scenario?.playbook_id;
      if (typeof playbookId !== "number") {
        return json({ ok: false, error: "rascunho sem playbook selecionado" }, 400);
      }
      const objections = (draft.scenario?.objections ?? []) as ObjectionSeed[];
      const work = async () => {
        const { env, token } = await authenticateConnection(draft.connections);
        const previous = draft.scenario?.objection_steps as ObjectionStepAssignment | undefined;
        let assignment = previous;
        if (!previous || previous.playbook_id !== playbookId || body.recompute === true) {
          assignment = await assignObjectionsToCallTypes(env, token, playbookId, objections);
          await saveObjectionSteps(draftId, assignment);
        }

        const fresh = await loadDraft(draftId);
        const run: PlaybookRun = { ...(fresh.playbook_run ?? {}) };
        if (fresh.status !== "exported" || (run.case_setup_ids ?? []).length === 0) {
          return { assignment, applied: null };
        }
        // Envio anterior à classificação por etapa: monta o mapa etapa → roleplay agora.
        if (Object.keys(run.call_type_case_setups ?? {}).length === 0) {
          await classifyCallTypes(env, token, playbookId, run.case_setup_ids ?? [], run);
        }
        await applyObjectionsToSteps(env, token, draftId, run);
        run.stage = "done";
        await saveRun(draftId, run);
        return { assignment, applied: run.step_objections ?? null };
      };
      if (body.auto === true) {
        EdgeRuntime.waitUntil(
          work()
            .then((r) => console.log("objection_steps[auto]:", JSON.stringify(r)))
            .catch((e) => console.error("objection_steps[auto] falhou:", messageOf(e))),
        );
        return json({ ok: true, playbookId }, 202);
      }
      return json({ ok: true, playbookId, ...(await work()) }, 200);
    }

    // Reaplica os guardrails do rascunho no contexto de um envio já feito — sem IA,
    // idempotente (pula o que já existe) e sem mexer em roleplays: o prompt é montado
    // na hora da call, então vale a partir da próxima. Objeções não vão para o contexto
    // no modo playbook: ver o estágio "assign_objection_steps".
    if (stage === "apply_context_content") {
      const draft = await loadDraft(draftId);
      const contextId = (draft.playbook_run as PlaybookRun | null)?.context_id;
      if (typeof contextId !== "number") {
        return json({ ok: false, error: "rascunho ainda sem contexto na Perfecting" }, 400);
      }
      const { env, token } = await authenticateConnection(draft.connections);
      const applied = await applyContextContent(
        env,
        token,
        contextId,
        [],
        (draft.scenario?.guardrails ?? []) as GuardrailSeed[],
        DIFFICULTY_LEVEL_IDS,
      );
      return json({ ok: true, contextId, ...applied }, 200);
    }

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

    if (stage === "add_personas") {
      const quantity = Math.min(Math.max(Math.trunc(Number(body.quantity)) || 0, 1), 10);
      const draft = await loadDraft(draftId);
      const current: PlaybookRun = draft.playbook_run ?? {};
      if (typeof current.context_id !== "number") {
        return json({ ok: false, error: "rascunho ainda sem contexto na Perfecting" }, 400);
      }
      // Lote concorrente duplicaria personas: não há chave de dedupe no endpoint.
      const topupStartedAt = current.persona_topup?.started_at
        ? Date.parse(current.persona_topup.started_at)
        : NaN;
      if (
        !current.persona_topup?.finished_at &&
        Number.isFinite(topupStartedAt) &&
        Date.now() - topupStartedAt < RUNNING_WINDOW_MS
      ) {
        return json({ ok: false, error: "já há um lote de personas em andamento" }, 409);
      }
      EdgeRuntime.waitUntil(runAddPersonas(draftId, quantity));
      return json({ ok: true, draftId, quantity }, 202);
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
    // Invocações separadas: a IA não pode consumir o limite de ~150s desta, que o
    // run() precisa para abrir o stream da implementação. Falha nelas nunca derruba o
    // envio. O encaixe nas etapas leva segundos; a implementação, minutos — então ele
    // quase sempre está pronto quando o run fecha.
    if (Array.isArray(draft.scenario?.objections) && draft.scenario.objections.length > 0) {
      invokeSelf({ draftId, stage: "assign_objection_steps", auto: true });
      invokeSelf({ draftId, stage: "apply_block_objections", auto: true });
    }
    return json({ ok: true, draftId, playbookId }, 202);
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e instanceof Error ? e.message : e) };
    return json({ ok: false, error: detail }, 500);
  }
});
