import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./perfecting.ts", () => ({
  listObjectionTypes: vi.fn(),
  listCaseSetupObjections: vi.fn(),
  createCaseSetupObjection: vi.fn(),
  listPlaybookCallTypes: vi.fn(),
  listPlaybookCallBlocks: vi.fn(),
}));
vi.mock("./anthropic.ts", () => ({ askStructured: vi.fn() }));

import * as perfecting from "./perfecting.ts";
import * as anthropic from "./anthropic.ts";
import type { ObjectionSeed } from "./context-content.ts";
import {
  applyStepObjections,
  assignObjectionsToCallTypes,
  type ObjectionStepAssignment,
} from "./step-objections.ts";

const api = vi.mocked(perfecting);
const ai = vi.mocked(anthropic);

const objection = (titulo: string, tipo = "preco"): ObjectionSeed => ({
  titulo,
  tipo,
  fala_exemplo: "Está caro.",
  detalhes: "Orçamento do ano já comprometido.",
  ceder_se: "Ver o parcelamento no próximo exercício.",
});

const assignment = (callTypes: Record<string, string[]>): ObjectionStepAssignment => ({
  playbook_id: 9,
  call_types: callTypes,
  assigned_at: "2026-09-13T00:00:00.000Z",
});

beforeEach(() => {
  vi.resetAllMocks();
  api.listObjectionTypes.mockResolvedValue([
    { id: 1, slug: "preco", name: "Preço" },
    { id: 2, slug: "timing", name: "Timing" },
  ]);
  api.listCaseSetupObjections.mockResolvedValue([]);
  api.createCaseSetupObjection.mockResolvedValue(1);
});

describe("applyStepObjections", () => {
  it("cria cada objeção só no roleplay das etapas encaixadas, uma vez por nível", async () => {
    const out = await applyStepObjections(
      "hml",
      "t",
      assignment({ "101": [], "102": ["Orçamento comprometido"] }),
      { "101": 501, "102": 502 },
      [objection("Orçamento comprometido")],
      [1, 2, 3],
    );

    expect(out.objections_created).toBe(3);
    const targets = api.createCaseSetupObjection.mock.calls.map(([, , id]) => id);
    expect(targets).toEqual([502, 502, 502]);
    const levels = api.createCaseSetupObjection.mock.calls.map(([, , , input]) => input.difficulty_level_id);
    expect(levels).toEqual([1, 2, 3]);
    expect(api.listCaseSetupObjections).toHaveBeenCalledTimes(1);
  });

  it("não duplica: pula título + nível que o roleplay já tem", async () => {
    api.listCaseSetupObjections.mockResolvedValue([
      { id: 10, title: "orçamento comprometido ", difficulty_level_id: 2 },
      { id: 11, title: "Orçamento comprometido", difficulty_level_id: null },
    ]);

    const out = await applyStepObjections(
      "hml",
      "t",
      assignment({ "102": ["Orçamento comprometido"] }),
      { "102": 502 },
      [objection("Orçamento comprometido")],
      [1, 2, 3],
    );

    expect(out).toMatchObject({ objections_created: 2, objections_skipped: 1 });
  });

  it("lista objeção sem etapa e avisa etapa sem roleplay, sem lançar", async () => {
    const out = await applyStepObjections(
      "hml",
      "t",
      assignment({ "101": ["Sem tempo agora"] }),
      {},
      [objection("Sem tempo agora", "timing"), objection("Orçamento comprometido")],
      [1],
    );

    expect(out.unassigned).toEqual(["Orçamento comprometido"]);
    expect(out.warnings).toEqual(["etapa 101: roleplay não encontrado, objeções não aplicadas"]);
    expect(api.createCaseSetupObjection).not.toHaveBeenCalled();
  });

  it("ignora título do encaixe que saiu do rascunho e usa o 1º tipo para slug inválido", async () => {
    const out = await applyStepObjections(
      "hml",
      "t",
      assignment({ "102": ["Removida depois", "Não é prioridade"] }),
      { "102": 502 },
      [objection("Não é prioridade", "inexistente")],
      [2],
    );

    expect(out.objections_created).toBe(1);
    expect(api.createCaseSetupObjection.mock.calls[0][3]).toMatchObject({
      objection_type_id: 1,
      title: "Não é prioridade",
      to_give_in_if: "Ver o parcelamento no próximo exercício.",
    });
  });

  it("falha na criação vira aviso", async () => {
    api.createCaseSetupObjection.mockRejectedValue(Object.assign(new Error("x"), { detail: "boom" }));

    const out = await applyStepObjections(
      "hml",
      "t",
      assignment({ "102": ["Manda por e-mail"] }),
      { "102": 502 },
      [objection("Manda por e-mail")],
      [1],
    );

    expect(out.objections_created).toBe(0);
    expect(out.warnings).toEqual(['roleplay 502: objeção "Manda por e-mail" (nível 1) não criada: boom']);
  });
});

describe("assignObjectionsToCallTypes", () => {
  it("traduz os índices da IA em títulos e mantém as etapas sem objeção", async () => {
    api.listPlaybookCallTypes.mockResolvedValue([
      { id: 101, name: "Descoberta", description: null, order: 1, call_context_type_id: null },
      { id: 102, name: "Proposta", description: null, order: 2, call_context_type_id: null },
    ]);
    api.listPlaybookCallBlocks.mockResolvedValue([]);
    ai.askStructured.mockResolvedValue({
      etapas: [
        { call_type_id: 101, objecoes: [1] },
        { call_type_id: 102, objecoes: [0, 0] },
      ],
    });

    const out = await assignObjectionsToCallTypes("hml", "t", 9, [
      objection("Orçamento comprometido"),
      objection("Sem tempo agora", "timing"),
    ]);

    expect(out.playbook_id).toBe(9);
    expect(out.call_types).toEqual({
      "101": ["Sem tempo agora"],
      "102": ["Orçamento comprometido"],
    });
  });

  it("sem objeções não chama a IA", async () => {
    api.listPlaybookCallTypes.mockResolvedValue([
      { id: 101, name: "Descoberta", description: null, order: 1, call_context_type_id: null },
    ]);

    const out = await assignObjectionsToCallTypes("hml", "t", 9, []);

    expect(out.call_types).toEqual({ "101": [] });
    expect(ai.askStructured).not.toHaveBeenCalled();
  });
});
