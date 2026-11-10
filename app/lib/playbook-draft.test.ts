import { describe, expect, it } from "vitest";
import {
  blockHasContent,
  classifyPlaybookFailure,
  nextDefaultName,
  playbookEmptyState,
  playbookListStatus,
} from "./playbook-draft";

describe("classifyPlaybookFailure", () => {
  it("sem erro", () => {
    expect(classifyPlaybookFailure({ status: "ready", error_detail: null, export_run: null })).toBeNull();
    expect(
      classifyPlaybookFailure({ status: "exported", error_detail: null, export_run: { error: null } }),
    ).toBeNull();
  });

  it("erro de envio gravado em export_run.error (playbook segue ready)", () => {
    const error = { status: 500, detail: { endpoint: "/role_plays/playbook_3/call_types" } };
    expect(
      classifyPlaybookFailure({ status: "ready", error_detail: null, export_run: { error } }),
    ).toEqual({ kind: "send", error });
  });

  it("legado: status error com error_detail no formato do envio é erro de ENVIO", () => {
    const detail = {
      status: 500,
      detail: { endpoint: "/role_plays/playbook_3/call_types", apiDetail: "Internal server error." },
    };
    expect(
      classifyPlaybookFailure({ status: "error", error_detail: detail, export_run: {} }),
    ).toEqual({ kind: "send", error: detail });
  });

  it("status error com { message } é erro de geração", () => {
    expect(
      classifyPlaybookFailure({
        status: "error",
        error_detail: { message: "a geração não terminou — tente novamente" },
        export_run: null,
      }),
    ).toEqual({ kind: "generation", message: "a geração não terminou — tente novamente" });
    expect(
      classifyPlaybookFailure({ status: "error", error_detail: null, export_run: null }),
    ).toEqual({ kind: "generation", message: null });
  });
});

describe("blockHasContent", () => {
  const empty = {
    description: null,
    objective: null,
    sample_questions: [],
    what_to_do: [],
    what_to_avoid: [],
  };
  it("subetapa recém-criada não tem conteúdo", () => {
    expect(blockHasContent(empty)).toBe(false);
    expect(blockHasContent({ ...empty, description: "   ", sample_questions: null })).toBe(false);
  });
  it("qualquer campo preenchido conta", () => {
    expect(blockHasContent({ ...empty, objective: "Mapear a dor" })).toBe(true);
    expect(blockHasContent({ ...empty, what_to_avoid: ["Falar de preço"] })).toBe(true);
  });
});

describe("nextDefaultName", () => {
  it("usa a base quando está livre", () => {
    expect(nextDefaultName("Nova etapa", ["Prospecção"])).toBe("Nova etapa");
  });
  it("numera a partir de 2 e pula os ocupados", () => {
    expect(nextDefaultName("Nova etapa", ["Nova etapa"])).toBe("Nova etapa 2");
    expect(nextDefaultName("Nova etapa", ["nova ETAPA ", "Nova etapa 2"])).toBe("Nova etapa 3");
  });
});

describe("playbookEmptyState", () => {
  const base = { error_detail: null, export_run: null };

  it("com etapas não há estado vazio", () => {
    expect(playbookEmptyState({ ...base, status: "ready" }, 3)).toBeNull();
  });

  it("enquanto roda, quem fala é o aviso de progresso", () => {
    expect(playbookEmptyState({ ...base, status: "generating" }, 0)).toBeNull();
    expect(playbookEmptyState({ ...base, status: "exporting" }, 0)).toBeNull();
  });

  it("rascunho nunca estruturado", () => {
    expect(playbookEmptyState({ ...base, status: "draft" }, 0)).toBe("never_ran");
  });

  it("geração que falhou não é 'não chegou a rodar'", () => {
    expect(
      playbookEmptyState({ status: "error", error_detail: { message: "IA fora do ar" }, export_run: null }, 0),
    ).toBe("generation_failed");
    expect(playbookEmptyState({ ...base, status: "error" }, 0)).toBe("generation_failed");
  });

  it("estruturado e sem etapas (excluídas à mão, ou erro de envio) segue editável", () => {
    expect(playbookEmptyState({ ...base, status: "ready" }, 0)).toBe("no_steps");
    expect(
      playbookEmptyState({ status: "ready", error_detail: null, export_run: { error: { status: 500 } } }, 0),
    ).toBe("no_steps");
  });
});

describe("playbookListStatus", () => {
  const base = { error_detail: null, export_run: null };

  it("status simples", () => {
    expect(playbookListStatus({ ...base, status: "draft" })).toEqual({ label: "Rascunho", tone: "neutral" });
    expect(playbookListStatus({ ...base, status: "exported" })).toEqual({ label: "Enviado", tone: "ok" });
    expect(playbookListStatus({ ...base, status: "desconhecido" }).label).toBe("Rascunho");
  });

  it("envio que falhou aparece mesmo com o playbook de volta a 'ready'", () => {
    expect(
      playbookListStatus({ status: "ready", error_detail: null, export_run: { error: { status: 500 } } }),
    ).toEqual({ label: "Erro no envio", tone: "error" });
  });

  it("distingue erro de geração de erro de envio no status 'error'", () => {
    expect(
      playbookListStatus({ status: "error", error_detail: { message: "x" }, export_run: null }),
    ).toEqual({ label: "Erro na geração", tone: "error" });
    expect(
      playbookListStatus({ status: "error", error_detail: { status: 500, detail: {} }, export_run: {} }),
    ).toEqual({ label: "Erro no envio", tone: "error" });
  });

  it("durante um reenvio, o erro antigo não aparece", () => {
    expect(
      playbookListStatus({ status: "exporting", error_detail: null, export_run: { error: { status: 500 } } }),
    ).toEqual({ label: "Enviando…", tone: "running" });
  });
});
