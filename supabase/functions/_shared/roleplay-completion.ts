/**
 * Fechamento do roleplay avulso — o que o case_setup/create NÃO faz.
 *
 * O create grava a linha, monta o case_prompt legado e cria o agente de voz.
 * Quem gera rubricas, conteúdo por etapa e comportamento é o ciclo de montagem
 * da Perfecting, que são outros endpoints. Sem eles o comprador entra na call
 * sem "# Comportamento" e sem "# Conhecimento de Background".
 *
 * Regras que valem para todos os passos:
 *  - `attempts` é incrementado ANTES da chamada: a Edge Function morre em ~150s
 *    e a Perfecting continua trabalhando, então o registro tem que sobreviver.
 *  - antes de repetir um passo de IA, sempre uma LEITURA barata do artefato —
 *    nunca reexecutar às cegas.
 *  - nenhum passo derruba o fechamento: falha vira aviso e o gate dá o veredito.
 *
 * O agente da ElevenLabs NÃO é recriado aqui de propósito: a call remonta o
 * prompt do zero e nunca lê o case_prompt persistido, então um agente novo só
 * deixaria o antigo órfão.
 */
import {
  generateCaseSetupRubrics,
  generateStepKnowledge,
  getRolePlayPrompt,
  listCaseSetupMethodologies,
  listCaseSetupRubrics,
  listStepKnowledge,
  PerfectingError,
  type PerfectingEnv,
  type RolePlayPromptGate,
  runCaseSetupRepairStep,
  setCaseSetupMethodologies,
} from "./perfecting.ts";

export type CompletionStepName =
  | "methodology"
  | "rubrics"
  | "step_knowledge"
  | "behavior_guidance"
  | "update_prompt";

/** Ordem do ciclo: vínculo → rubricas → conteúdo → comportamento → prompt. */
export const COMPLETION_STEPS: CompletionStepName[] = [
  "methodology",
  "rubrics",
  "step_knowledge",
  "behavior_guidance",
  "update_prompt",
];

export const COMPLETION_STEP_LABELS: Record<CompletionStepName, string> = {
  methodology: "vinculando metodologia",
  rubrics: "gerando rubricas",
  step_knowledge: "gerando conteúdo por etapa",
  behavior_guidance: "gerando comportamento",
  update_prompt: "montando prompt",
};

export type CompletionStepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface CompletionStepState {
  status: CompletionStepStatus;
  attempts: number;
  started_at?: string | null;
  finished_at?: string | null;
  detail?: unknown;
}

export interface CompletionRun {
  case_setup_id: number;
  context_id?: number | null;
  persona_id?: number | null;
  methodology_id?: number | null;
  methodology_slug?: string | null;
  difficulty_level_id?: number | null;
  /** O material tinha objeções? Sem isso, "sem objeções" não é defeito. */
  objections_seeded?: boolean;
  stage?: CompletionStepName | "queued" | "pre_gate" | "gate" | "done";
  steps: Partial<Record<CompletionStepName, CompletionStepState>>;
  gate?: RolePlayPromptGate | null;
  missing?: string[];
  warnings?: string[];
  /** Quantas vezes o fechamento foi pedido (o botão "Completar" soma 1). */
  attempt_round?: number;
  started_at: string;
  finished_at?: string | null;
}

export const MAX_STEP_ATTEMPTS = 2;

/**
 * Quanto esperar antes de considerar que um passo `running` morreu junto com a
 * invocação. Folgado de propósito: o passo continua rodando no servidor deles.
 */
const STEP_STALE_MS: Record<CompletionStepName, number> = {
  methodology: 2 * 60_000,
  rubrics: 5 * 60_000,
  // nº de personas × (nº de etapas + 1) chamadas de IA em série.
  step_knowledge: 12 * 60_000,
  behavior_guidance: 5 * 60_000,
  update_prompt: 2 * 60_000,
};

const TERMINAL: CompletionStepStatus[] = ["done", "skipped", "failed"];

export type CompletionDecision =
  | { kind: "run"; step: CompletionStepName }
  | { kind: "wait"; step: CompletionStepName }
  | { kind: "give_up"; step: CompletionStepName }
  | { kind: "gate" };

/**
 * Qual o próximo movimento do fechamento. `wait` = a Perfecting ainda pode estar
 * trabalhando neste passo; `give_up` = estourou as tentativas e o gate decide
 * sem ele.
 */
export function nextCompletionStep(run: CompletionRun, now = Date.now()): CompletionDecision {
  for (const step of COMPLETION_STEPS) {
    const state = run.steps?.[step];
    if (!state || state.status === "pending") return { kind: "run", step };
    if (TERMINAL.includes(state.status)) continue;

    // running: só volta a rodar se morreu (stale) e ainda há tentativa.
    const startedAt = state.started_at ? Date.parse(state.started_at) : NaN;
    const stale = Number.isFinite(startedAt) && now - startedAt > STEP_STALE_MS[step];
    if (!stale) return { kind: "wait", step };
    if (state.attempts >= MAX_STEP_ATTEMPTS) return { kind: "give_up", step };
    return { kind: "run", step };
  }
  return { kind: "gate" };
}

/**
 * Quando o fechamento deu sinal de vida pela última vez. O poll usa isto para não
 * atropelar a cadeia que ainda está rodando: entre um passo e outro existe um
 * instante em que nada está marcado como `running`.
 */
export function lastCompletionActivity(run: CompletionRun): number {
  const stamps = [
    run.started_at,
    ...Object.values(run.steps ?? {}).flatMap((s) => [s?.started_at, s?.finished_at]),
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => Date.parse(v))
    .filter((n) => Number.isFinite(n));
  return stamps.length > 0 ? Math.max(...stamps) : NaN;
}

export function addCompletionWarning(run: CompletionRun, message: string): void {
  if (!run.warnings) run.warnings = [];
  if (!run.warnings.includes(message)) run.warnings.push(message);
}

function setStep(
  run: CompletionRun,
  step: CompletionStepName,
  patch: Partial<CompletionStepState>,
): CompletionStepState {
  const current: CompletionStepState = run.steps[step] ?? { status: "pending", attempts: 0 };
  const next = { ...current, ...patch };
  run.steps[step] = next;
  return next;
}

function finishStep(
  run: CompletionRun,
  step: CompletionStepName,
  status: CompletionStepStatus,
  detail?: unknown,
): void {
  setStep(run, step, { status, detail, finished_at: new Date().toISOString() });
}

function reason(e: unknown): string {
  return e instanceof PerfectingError ? JSON.stringify(e.detail) : String(e);
}

/** Passos anteriores que, se não deram certo, tornam este inútil. */
function blockedBy(run: CompletionRun, step: CompletionStepName): string | null {
  if (step === "step_knowledge") {
    const methodology = run.steps.methodology?.status;
    if (methodology !== "done") return "sem metodologia vinculada";
  }
  return null;
}

/**
 * Roda um passo, gravando o estado antes e depois via `save` (para sobreviver à
 * morte da invocação). Nunca lança: erro vira `failed` + aviso.
 */
export async function runCompletionStep(
  env: PerfectingEnv,
  token: string,
  run: CompletionRun,
  step: CompletionStepName,
  save: () => PromiseLike<unknown>,
): Promise<void> {
  const blocked = blockedBy(run, step);
  if (blocked) {
    finishStep(run, step, "skipped", { skip_reason: blocked });
    addCompletionWarning(run, `${COMPLETION_STEP_LABELS[step]}: ${blocked}`);
    await save();
    return;
  }

  const previousAttempts = run.steps[step]?.attempts ?? 0;
  const caseSetupId = run.case_setup_id;

  try {
    // 1) leitura barata: o artefato já existe? (rechamada depois de um timeout)
    const skipped = await precheck(env, token, run, step, previousAttempts);
    if (skipped) {
      await save();
      return;
    }

    // 2) marca running ANTES da chamada — é o que o poll usa para não duplicar.
    run.stage = step;
    setStep(run, step, {
      status: "running",
      attempts: previousAttempts + 1,
      started_at: new Date().toISOString(),
      finished_at: null,
    });
    await save();

    await execute(env, token, run, step, caseSetupId);
  } catch (e) {
    finishStep(run, step, "failed", { error: reason(e) });
    addCompletionWarning(run, `${COMPLETION_STEP_LABELS[step]} falhou: ${reason(e)}`);
  }
  await save();
}

/** Devolve true quando o passo já pôde ser resolvido sem gastar IA. */
async function precheck(
  env: PerfectingEnv,
  token: string,
  run: CompletionRun,
  step: CompletionStepName,
  previousAttempts: number,
): Promise<boolean> {
  const caseSetupId = run.case_setup_id;

  if (step === "methodology") {
    // A verdade é o que está vinculado na Perfecting (o create já pode ter feito
    // isso), não o que o run carrega.
    const linked = await listCaseSetupMethodologies(env, token, caseSetupId);
    if (linked.length > 0) {
      finishStep(run, step, "done", { methodology_ids: linked.map((m) => m.id) });
      if (run.methodology_id != null && !linked.some((m) => m.id === run.methodology_id)) {
        addCompletionWarning(
          run,
          `o roleplay já tinha outra metodologia vinculada (${linked.map((m) => m.id).join(", ")})`,
        );
      }
      return true;
    }
    if (run.methodology_id == null) {
      finishStep(run, step, "skipped", { skip_reason: "sem metodologia padrão configurada" });
      addCompletionWarning(
        run,
        "metodologia não vinculada: defina a metodologia padrão em Configurações",
      );
      return true;
    }
    return false;
  }

  if (step === "rubrics") {
    const rubrics = await listCaseSetupRubrics(env, token, caseSetupId);
    if (rubrics.length > 0) {
      finishStep(run, step, "done", { rubrics: rubrics.length });
      return true;
    }
    return false;
  }

  if (step === "step_knowledge") {
    const blocks = await listStepKnowledge(env, token, caseSetupId);
    if (blocks.length > 0) {
      finishStep(run, step, "done", { blocks: blocks.length });
      return true;
    }
    return false;
  }

  // Comportamento só tem leitura pelo gate (1 GET, sem IA): vale a pena antes de
  // repetir as 3 gerações, não na primeira passada (o pre-gate já cobriu).
  if (step === "behavior_guidance" && previousAttempts > 0) {
    const gate = await getRolePlayPrompt(env, token, caseSetupId);
    run.gate = gate;
    if (gate.has_behavior_guidance) {
      finishStep(run, step, "done", { source: "gate" });
      return true;
    }
  }

  return false;
}

async function execute(
  env: PerfectingEnv,
  token: string,
  run: CompletionRun,
  step: CompletionStepName,
  caseSetupId: number,
): Promise<void> {
  if (step === "methodology") {
    await setCaseSetupMethodologies(env, token, caseSetupId, [run.methodology_id!]);
    finishStep(run, step, "done", { methodology_ids: [run.methodology_id] });
    return;
  }

  if (step === "rubrics") {
    const result = await generateCaseSetupRubrics(env, token, caseSetupId);
    finishStep(run, step, "done", result);
    return;
  }

  if (step === "step_knowledge") {
    const result = await generateStepKnowledge(env, token, [caseSetupId]);
    const first = result.results[0];
    if (result.items_generated > 0) {
      finishStep(run, step, "done", result);
      return;
    }
    // O conteúdo já estava lá (idempotência por case_setup do lado deles).
    if (first?.skip_reason === "already_has_items") {
      finishStep(run, step, "done", result);
      return;
    }
    // 200 com zero itens é sucesso vazio: rechamar dá o mesmo vazio.
    const skipReason = first?.skip_reason ?? "nenhum conteúdo gerado";
    finishStep(run, step, "skipped", { ...result, skip_reason: skipReason });
    addCompletionWarning(run, `conteúdo por etapa não gerado: ${skipReason}`);
    return;
  }

  if (step === "behavior_guidance") {
    const result = await runCaseSetupRepairStep(env, token, caseSetupId, "behavior_guidance");
    finishStep(run, step, "done", result);
    return;
  }

  // update_prompt: determinístico, sem IA — só deixa a coluna coerente.
  const result = await runCaseSetupRepairStep(env, token, caseSetupId, "update_prompt");
  finishStep(run, step, "done", result);
}

export interface GateContext {
  methodologyLinked: boolean;
  objectionsSeeded: boolean;
  env: PerfectingEnv;
}

export interface GateVerdict {
  complete: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Veredito do envio a partir do prompt que o comprador realmente vai usar.
 *
 * `missing` é o que torna o roleplay pior do que o prometido; `warnings` é o que
 * merece um olho mas não invalida (material sem objeção, por exemplo, não é
 * defeito do envio).
 */
export function evaluateGate(gate: RolePlayPromptGate, ctx: GateContext): GateVerdict {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!gate.has_persona) missing.push("persona");
  if (!ctx.methodologyLinked) missing.push("metodologia vinculada");
  if (!gate.has_behavior_guidance) missing.push("# Comportamento");
  if (!gate.has_knowledge_blocks) missing.push("# Conhecimento de Background");
  if (!gate.has_difficulty_level) missing.push("# Dificuldade");
  if (!gate.prompt.trim()) missing.push("prompt do comprador");

  if (ctx.objectionsSeeded && !gate.has_objections) {
    warnings.push("as objeções do material não entraram no prompt");
  }
  if (!gate.has_prior_knowledge) warnings.push("sem # Conhecimento Prévio");
  if (!gate.has_tone) warnings.push("sem # Tone");
  if (!gate.has_persona_company) warnings.push("sem # Ambiente (empresa da persona)");
  if (ctx.env === "prod" && gate.persona_randomly_selected) {
    warnings.push("a persona não está travada no roleplay (sorteio a cada call)");
  }

  return { complete: missing.length === 0, missing, warnings };
}

export function finalStatusFor(verdict: GateVerdict): "exported" | "incomplete" {
  return verdict.complete ? "exported" : "incomplete";
}

/** Lê o gate e grava o veredito no run. Erro de leitura não vira incompleto. */
export async function runCompletionGate(
  env: PerfectingEnv,
  token: string,
  run: CompletionRun,
): Promise<GateVerdict> {
  run.stage = "gate";
  const [gate, linked] = await Promise.all([
    getRolePlayPrompt(env, token, run.case_setup_id),
    listCaseSetupMethodologies(env, token, run.case_setup_id).catch(() => []),
  ]);
  run.gate = gate;
  const verdict = evaluateGate(gate, {
    methodologyLinked: linked.length > 0,
    objectionsSeeded: run.objections_seeded === true,
    env,
  });
  run.missing = verdict.missing;
  for (const w of verdict.warnings) addCompletionWarning(run, w);
  return verdict;
}
