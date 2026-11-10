import { describe, expect, it } from "vitest";
import { blockHasContent, classifyPlaybookFailure, nextDefaultName } from "./playbook-draft";

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
