import { describe, expect, it } from "vitest";
import {
  adoptableCaseSetup,
  caseSetupPayloadIssues,
  findCaseSetupByName,
  previousCreated,
  startCreated,
  toCaseSetupRefs,
  withCreated,
} from "./send-progress.ts";

describe("previousCreated", () => {
  const detail = { status: 500, detail: "x", created: { case_setup_id: 9 } };

  it("retoma só envio que não terminou", () => {
    expect(previousCreated({ status: "error", error_detail: detail }, false)).toEqual({ case_setup_id: 9 });
    expect(previousCreated({ status: "exporting", error_detail: detail }, true)).toEqual({ case_setup_id: 9 });
  });

  it("exportado, incompleto ou envio vivo não retomam", () => {
    expect(previousCreated({ status: "exported", error_detail: detail }, false)).toBeNull();
    expect(previousCreated({ status: "incomplete", error_detail: detail }, false)).toBeNull();
    expect(previousCreated({ status: "exporting", error_detail: detail }, false)).toBeNull();
  });

  it("sem registro, nada a retomar", () => {
    expect(previousCreated({ status: "error", error_detail: null }, false)).toBeNull();
    expect(previousCreated({ status: "error", error_detail: { created: {} } }, false)).toBeNull();
    expect(previousCreated({ status: "error", error_detail: "texto" }, false)).toBeNull();
  });
});

describe("startCreated", () => {
  it("venda herda o registro anterior", () => {
    expect(startCreated({ persona_id: 3, context_id: 7 }, "sale")).toEqual({ persona_id: 3, context_id: 7 });
  });

  it("debate guarda as tentativas anteriores como histórico", () => {
    const first = startCreated({ offer_id: 1, context_id: 2 }, "debate");
    expect(first).toEqual({ previous_attempts: [{ offer_id: 1, context_id: 2 }] });
    const second = startCreated({ ...first, offer_id: 5 }, "debate");
    expect(second).toEqual({ previous_attempts: [{ offer_id: 1, context_id: 2 }, { offer_id: 5 }] });
  });

  it("debate: tentativa que não criou nada não entra no histórico", () => {
    const history = { previous_attempts: [{ offer_id: 1 }] };
    expect(startCreated(history, "debate")).toEqual(history);
    expect(startCreated({ previous_attempts: [] }, "debate")).toEqual({});
  });

  it("sem anterior começa vazio", () => {
    expect(startCreated(null, "sale")).toEqual({});
  });
});

describe("withCreated", () => {
  it("só acrescenta quando há algo criado", () => {
    expect(withCreated({ status: 500 }, {})).toEqual({ status: 500 });
    expect(withCreated({ status: 500 }, { offer_id: 1 })).toEqual({ status: 500, created: { offer_id: 1 } });
  });
});

describe("caseSetupPayloadIssues", () => {
  const ok = { training_name: "Cold call RH", buyer_agent_first_messages: ["Alô?"] };

  it("payload completo passa", () => {
    expect(caseSetupPayloadIssues(ok)).toEqual([]);
  });

  it("recusa sem primeira fala (ausente, vazia ou em branco)", () => {
    for (const first of [undefined, [], [""], ["   "], "Alô?"]) {
      const issues = caseSetupPayloadIssues({ ...ok, buyer_agent_first_messages: first });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("primeira fala");
    }
  });

  it("recusa sem nome", () => {
    expect(caseSetupPayloadIssues({ ...ok, training_name: " " })[0]).toContain("sem nome");
  });
});

describe("adoptableCaseSetup", () => {
  const list = toCaseSetupRefs([
    { id: 10, training_name: "Cold call RH" },
    { id: 11, training_name: "Negociação" },
    { training_name: "sem id" },
  ]);

  it("acha pelo id registrado", () => {
    expect(adoptableCaseSetup({ case_setup_id: 11 }, 7, list)?.id).toBe(11);
  });

  it("id que sumiu da conta não é adotado", () => {
    expect(adoptableCaseSetup({ case_setup_id: 99 }, 7, list)).toBeNull();
  });

  it("create sem resposta: acha pelo nome enviado, no mesmo contexto", () => {
    const pending = { context_id: 7, training_name: " Cold call RH " };
    expect(adoptableCaseSetup({ pending_case_setup: pending }, 7, list)?.id).toBe(10);
    expect(adoptableCaseSetup({ pending_case_setup: pending }, 8, list)).toBeNull();
    expect(adoptableCaseSetup({ pending_case_setup: { context_id: 7, training_name: "Outro" } }, 7, list)).toBeNull();
  });

  it("sem tentativa anterior, nada", () => {
    expect(adoptableCaseSetup(null, 7, list)).toBeNull();
  });
});

describe("findCaseSetupByName", () => {
  it("nome vazio nunca casa", () => {
    expect(findCaseSetupByName([{ id: 1, training_name: "" }], "  ")).toBeUndefined();
  });
});
