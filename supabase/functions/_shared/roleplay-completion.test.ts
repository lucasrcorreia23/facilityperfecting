import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./perfecting.ts", () => ({
  // A classe precisa nascer aqui dentro: vi.mock é içado para o topo do arquivo.
  PerfectingError: class extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`HTTP ${status}`);
    }
  },
  generateCaseSetupRubrics: vi.fn(),
  generateStepKnowledge: vi.fn(),
  getRolePlayPrompt: vi.fn(),
  listCaseSetupMethodologies: vi.fn(),
  listCaseSetupRubrics: vi.fn(),
  listStepKnowledge: vi.fn(),
  runCaseSetupRepairStep: vi.fn(),
  setCaseSetupMethodologies: vi.fn(),
}));

import * as perfecting from "./perfecting.ts";
import {
  type CompletionRun,
  evaluateGate,
  finalStatusFor,
  MAX_STEP_ATTEMPTS,
  nextCompletionStep,
  runCompletionStep,
} from "./roleplay-completion.ts";
import type { RolePlayPromptGate } from "./perfecting.ts";

const api = vi.mocked(perfecting);
const save = () => Promise.resolve();

function makeRun(overrides: Partial<CompletionRun> = {}): CompletionRun {
  return {
    case_setup_id: 160,
    methodology_id: 7,
    objections_seeded: true,
    steps: {},
    started_at: "2026-09-20T12:00:00.000Z",
    ...overrides,
  };
}

const completeGate: RolePlayPromptGate = {
  case_setup_id: 160,
  prompt: "# Personalidade\nVocê é Marcos.",
  has_persona: true,
  has_persona_company: true,
  has_tone: true,
  has_behavior_guidance: true,
  has_prior_knowledge: true,
  has_conversation_history: false,
  has_knowledge_blocks: true,
  has_objections: true,
  has_difficulty_level: true,
  persona_randomly_selected: false,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("nextCompletionStep", () => {
  it("começa pelo vínculo da metodologia", () => {
    expect(nextCompletionStep(makeRun())).toEqual({ kind: "run", step: "methodology" });
  });

  it("pula passos terminais e vai para o próximo pendente", () => {
    const run = makeRun({
      steps: {
        methodology: { status: "done", attempts: 1 },
        rubrics: { status: "failed", attempts: 1 },
        step_knowledge: { status: "skipped", attempts: 1 },
      },
    });
    expect(nextCompletionStep(run)).toEqual({ kind: "run", step: "behavior_guidance" });
  });

  it("manda para o gate quando todos terminaram", () => {
    const run = makeRun({
      steps: {
        methodology: { status: "done", attempts: 1 },
        rubrics: { status: "done", attempts: 1 },
        step_knowledge: { status: "done", attempts: 1 },
        behavior_guidance: { status: "done", attempts: 1 },
        update_prompt: { status: "done", attempts: 1 },
      },
    });
    expect(nextCompletionStep(run)).toEqual({ kind: "gate" });
  });

  it("espera um passo running dentro da janela (a Perfecting ainda pode estar gerando)", () => {
    const now = Date.parse("2026-09-20T12:05:00.000Z");
    const run = makeRun({
      steps: {
        methodology: { status: "done", attempts: 1 },
        rubrics: { status: "done", attempts: 1 },
        step_knowledge: {
          status: "running",
          attempts: 1,
          started_at: "2026-09-20T12:00:00.000Z",
        },
      },
    });
    expect(nextCompletionStep(run, now)).toEqual({ kind: "wait", step: "step_knowledge" });
  });

  it("retoma um passo running que morreu (stale) enquanto houver tentativa", () => {
    const now = Date.parse("2026-09-20T12:20:00.000Z");
    const run = makeRun({
      steps: {
        methodology: { status: "done", attempts: 1 },
        rubrics: { status: "done", attempts: 1 },
        step_knowledge: {
          status: "running",
          attempts: 1,
          started_at: "2026-09-20T12:00:00.000Z",
        },
      },
    });
    expect(nextCompletionStep(run, now)).toEqual({ kind: "run", step: "step_knowledge" });
  });

  it("desiste do passo depois do teto de tentativas", () => {
    const now = Date.parse("2026-09-20T12:20:00.000Z");
    const run = makeRun({
      steps: {
        methodology: { status: "done", attempts: 1 },
        rubrics: { status: "done", attempts: 1 },
        step_knowledge: {
          status: "running",
          attempts: MAX_STEP_ATTEMPTS,
          started_at: "2026-09-20T12:00:00.000Z",
        },
      },
    });
    expect(nextCompletionStep(run, now)).toEqual({ kind: "give_up", step: "step_knowledge" });
  });
});

describe("runCompletionStep — metodologia", () => {
  it("sem metodologia padrão e nada vinculado, pula e aponta as Configurações", async () => {
    api.listCaseSetupMethodologies.mockResolvedValue([]);
    const run = makeRun({ methodology_id: null });
    await runCompletionStep("hml", "t", run, "methodology", save);
    expect(run.steps.methodology?.status).toBe("skipped");
    expect(api.setCaseSetupMethodologies).not.toHaveBeenCalled();
    expect(run.warnings?.join()).toContain("Configurações");
  });

  it("vale o que está na Perfecting: vinculada no create, sem id no run, é feito", async () => {
    api.listCaseSetupMethodologies.mockResolvedValue([{ id: 7, name: "SPIN" }]);
    const run = makeRun({ methodology_id: null });
    await runCompletionStep("hml", "t", run, "methodology", save);
    expect(run.steps.methodology?.status).toBe("done");
    expect(run.warnings ?? []).toHaveLength(0);
    // e, por consequência, o conteúdo por etapa não fica bloqueado
    expect(nextCompletionStep(run)).toEqual({ kind: "run", step: "rubrics" });
  });

  it("já vinculada no create: não chama o PUT", async () => {
    api.listCaseSetupMethodologies.mockResolvedValue([{ id: 7, name: "SPIN" }]);
    const run = makeRun();
    await runCompletionStep("hml", "t", run, "methodology", save);
    expect(run.steps.methodology?.status).toBe("done");
    expect(api.setCaseSetupMethodologies).not.toHaveBeenCalled();
  });

  it("avisa quando o roleplay tinha outra metodologia", async () => {
    api.listCaseSetupMethodologies.mockResolvedValue([{ id: 9, name: "Outra" }]);
    const run = makeRun();
    await runCompletionStep("hml", "t", run, "methodology", save);
    expect(run.steps.methodology?.status).toBe("done");
    expect(run.warnings?.join()).toContain("outra metodologia");
  });

  it("vincula quando não há nenhuma", async () => {
    api.listCaseSetupMethodologies.mockResolvedValue([]);
    api.setCaseSetupMethodologies.mockResolvedValue(undefined);
    const run = makeRun();
    await runCompletionStep("hml", "t", run, "methodology", save);
    expect(api.setCaseSetupMethodologies).toHaveBeenCalledWith("hml", "t", 160, [7]);
    expect(run.steps.methodology?.status).toBe("done");
    expect(run.steps.methodology?.attempts).toBe(1);
  });
});

describe("runCompletionStep — conteúdo por etapa", () => {
  const linked = { methodology: { status: "done" as const, attempts: 1 } };

  it("sem metodologia vinculada, nem tenta gerar", async () => {
    const run = makeRun({ steps: { methodology: { status: "skipped", attempts: 0 } } });
    await runCompletionStep("hml", "t", run, "step_knowledge", save);
    expect(run.steps.step_knowledge?.status).toBe("skipped");
    expect(api.generateStepKnowledge).not.toHaveBeenCalled();
  });

  it("conteúdo já existe: fecha pela leitura, sem gastar IA", async () => {
    api.listStepKnowledge.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const run = makeRun({ steps: { ...linked } });
    await runCompletionStep("hml", "t", run, "step_knowledge", save);
    expect(run.steps.step_knowledge?.status).toBe("done");
    expect(api.generateStepKnowledge).not.toHaveBeenCalled();
  });

  it("gera quando não há nada", async () => {
    api.listStepKnowledge.mockResolvedValue([]);
    api.generateStepKnowledge.mockResolvedValue({
      case_setups_processed: 1,
      case_setups_skipped: 0,
      items_generated: 6,
      results: [{ case_setup_id: 160, status: "processed", skip_reason: null, items_created: 6 }],
    });
    const run = makeRun({ steps: { ...linked } });
    await runCompletionStep("hml", "t", run, "step_knowledge", save);
    expect(api.generateStepKnowledge).toHaveBeenCalledWith("hml", "t", [160]);
    expect(run.steps.step_knowledge?.status).toBe("done");
  });

  it("already_has_items conta como feito", async () => {
    api.listStepKnowledge.mockResolvedValue([]);
    api.generateStepKnowledge.mockResolvedValue({
      case_setups_processed: 0,
      case_setups_skipped: 1,
      items_generated: 0,
      results: [
        { case_setup_id: 160, status: "skipped", skip_reason: "already_has_items", items_created: 0 },
      ],
    });
    const run = makeRun({ steps: { ...linked } });
    await runCompletionStep("hml", "t", run, "step_knowledge", save);
    expect(run.steps.step_knowledge?.status).toBe("done");
    expect(run.warnings ?? []).toHaveLength(0);
  });

  it("sucesso vazio vira skipped com o motivo do backend (rechamar daria o mesmo)", async () => {
    api.listStepKnowledge.mockResolvedValue([]);
    api.generateStepKnowledge.mockResolvedValue({
      case_setups_processed: 1,
      case_setups_skipped: 0,
      items_generated: 0,
      results: [
        { case_setup_id: 160, status: "processed", skip_reason: "no_personas", items_created: 0 },
      ],
    });
    const run = makeRun({ steps: { ...linked } });
    await runCompletionStep("hml", "t", run, "step_knowledge", save);
    expect(run.steps.step_knowledge?.status).toBe("skipped");
    expect(run.warnings?.join()).toContain("no_personas");
  });

  it("erro da API vira failed com aviso, sem derrubar o fechamento", async () => {
    api.listStepKnowledge.mockResolvedValue([]);
    api.generateStepKnowledge.mockRejectedValue(new perfecting.PerfectingError(500, "boom"));
    const run = makeRun({ steps: { ...linked } });
    await expect(runCompletionStep("hml", "t", run, "step_knowledge", save)).resolves
      .toBeUndefined();
    expect(run.steps.step_knowledge?.status).toBe("failed");
    expect(run.warnings?.join()).toContain("falhou");
  });
});

describe("runCompletionStep — comportamento", () => {
  const done = {
    methodology: { status: "done" as const, attempts: 1 },
    rubrics: { status: "done" as const, attempts: 1 },
    step_knowledge: { status: "done" as const, attempts: 1 },
  };

  it("na primeira passada não gasta um GET de gate", async () => {
    api.runCaseSetupRepairStep.mockResolvedValue({ items_created: 3 });
    const run = makeRun({ steps: { ...done } });
    await runCompletionStep("hml", "t", run, "behavior_guidance", save);
    expect(api.getRolePlayPrompt).not.toHaveBeenCalled();
    expect(api.runCaseSetupRepairStep).toHaveBeenCalledWith("hml", "t", 160, "behavior_guidance");
  });

  it("na repetição, confere o gate antes de regenerar (3 chamadas de IA)", async () => {
    api.getRolePlayPrompt.mockResolvedValue(completeGate);
    const run = makeRun({
      steps: {
        ...done,
        behavior_guidance: {
          status: "running",
          attempts: 1,
          started_at: "2026-09-20T12:00:00.000Z",
        },
      },
    });
    await runCompletionStep("hml", "t", run, "behavior_guidance", save);
    expect(run.steps.behavior_guidance?.status).toBe("done");
    expect(api.runCaseSetupRepairStep).not.toHaveBeenCalled();
  });
});

describe("evaluateGate", () => {
  const ctx = { methodologyLinked: true, objectionsSeeded: true, env: "hml" as const };

  it("tudo no prompt = completo", () => {
    expect(evaluateGate(completeGate, ctx)).toEqual({
      complete: true,
      missing: [],
      warnings: [],
    });
  });

  it("sem comportamento e sem conhecimento, aponta as duas seções", () => {
    const verdict = evaluateGate(
      { ...completeGate, has_behavior_guidance: false, has_knowledge_blocks: false },
      ctx,
    );
    expect(verdict.complete).toBe(false);
    expect(verdict.missing).toContain("# Comportamento");
    expect(verdict.missing).toContain("# Conhecimento de Background");
  });

  it("metodologia não vinculada bloqueia", () => {
    const verdict = evaluateGate(completeGate, { ...ctx, methodologyLinked: false });
    expect(verdict.missing).toContain("metodologia vinculada");
  });

  it("material sem objeção não é defeito", () => {
    const verdict = evaluateGate(
      { ...completeGate, has_objections: false },
      { ...ctx, objectionsSeeded: false },
    );
    expect(verdict.complete).toBe(true);
    expect(verdict.warnings).toHaveLength(0);
  });

  it("objeção do material que não entrou vira aviso, não bloqueio", () => {
    const verdict = evaluateGate({ ...completeGate, has_objections: false }, ctx);
    expect(verdict.complete).toBe(true);
    expect(verdict.warnings.join()).toContain("objeções do material");
  });

  it("sem persona, bloqueia", () => {
    const verdict = evaluateGate({ ...completeGate, has_persona: false }, ctx);
    expect(verdict.missing).toContain("persona");
  });

  it("persona sorteada a cada call só é problema em produção", () => {
    const flagged = { ...completeGate, persona_randomly_selected: true };
    expect(evaluateGate(flagged, ctx).warnings).toHaveLength(0);
    expect(evaluateGate(flagged, { ...ctx, env: "prod" }).warnings.join()).toContain(
      "não está travada",
    );
  });
});

describe("finalStatusFor", () => {
  it("completo vira exported; faltando vira incomplete", () => {
    expect(finalStatusFor({ complete: true, missing: [], warnings: [] })).toBe("exported");
    expect(finalStatusFor({ complete: false, missing: ["persona"], warnings: [] })).toBe(
      "incomplete",
    );
  });
});
