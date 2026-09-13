import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./perfecting.ts", () => ({
  listObjectionTypes: vi.fn(),
  listContextObjections: vi.fn(),
  createContextObjection: vi.fn(),
  listContextGuardrails: vi.fn(),
  createContextGuardrail: vi.fn(),
}));

import * as perfecting from "./perfecting.ts";
import { applyContextContent, type ObjectionSeed } from "./context-content.ts";

const api = vi.mocked(perfecting);

const objection = (titulo: string, tipo = "preco"): ObjectionSeed => ({
  titulo,
  tipo,
  fala_exemplo: "Está caro.",
  detalhes: "Orçamento do ano já comprometido.",
  ceder_se: "Mostrar parcelamento no próximo exercício.",
});

beforeEach(() => {
  vi.resetAllMocks();
  api.listObjectionTypes.mockResolvedValue([
    { id: 1, slug: "preco", name: "Preço" },
    { id: 2, slug: "timing", name: "Timing" },
  ]);
  api.listContextObjections.mockResolvedValue([]);
  api.createContextObjection.mockResolvedValue(1);
  api.listContextGuardrails.mockResolvedValue([]);
  api.createContextGuardrail.mockResolvedValue(1);
});

describe("applyContextContent — objeções", () => {
  it("cria cada objeção uma vez por nível, sempre com difficulty_level_id", async () => {
    const out = await applyContextContent("hml", "t", 35, [objection("Orçamento comprometido")], [], [1, 2, 3]);

    expect(out.objections_created).toBe(3);
    const levels = api.createContextObjection.mock.calls.map(([, , , input]) => input.difficulty_level_id);
    expect(levels).toEqual([1, 2, 3]);
    expect(api.createContextObjection.mock.calls[0][3]).toMatchObject({
      objection_type_id: 1,
      title: "Orçamento comprometido",
      to_give_in_if: "Mostrar parcelamento no próximo exercício.",
    });
  });

  it("pula só os níveis que já existem; linhas antigas sem nível não bloqueiam", async () => {
    api.listContextObjections.mockResolvedValue([
      { id: 10, title: "orçamento comprometido ", difficulty_level_id: null },
      { id: 11, title: "Orçamento comprometido", difficulty_level_id: 2 },
    ]);

    const out = await applyContextContent("hml", "t", 35, [objection("Orçamento comprometido")], [], [1, 2, 3]);

    expect(out).toMatchObject({ objections_created: 2, objections_skipped: 1 });
    const levels = api.createContextObjection.mock.calls.map(([, , , input]) => input.difficulty_level_id);
    expect(levels).toEqual([1, 3]);
  });

  it("usa o primeiro tipo quando o slug da IA não existe", async () => {
    await applyContextContent("hml", "t", 35, [objection("Não é prioridade", "inexistente")], [], [2]);
    expect(api.createContextObjection.mock.calls[0][3].objection_type_id).toBe(1);
  });

  it("não derruba o envio quando a criação falha: vira aviso", async () => {
    api.createContextObjection.mockRejectedValue(Object.assign(new Error("x"), { detail: "boom" }));

    const out = await applyContextContent("hml", "t", 35, [objection("Manda por e-mail")], [], [1]);

    expect(out.objections_created).toBe(0);
    expect(out.warnings).toEqual(['objeção "Manda por e-mail" (nível 1) não criada: boom']);
  });
});

describe("applyContextContent — guardrails", () => {
  it("casa por nome sem diferenciar maiúsculas e cria só os novos", async () => {
    api.listContextGuardrails.mockResolvedValue([{ id: 1, name: "Uma informação por vez" }]);

    const out = await applyContextContent(
      "hml",
      "t",
      35,
      [],
      [
        { nome: "uma informação por vez", instrucao: "Responda uma coisa por vez." },
        { nome: "Responder em português", instrucao: "Fale sempre em português." },
      ],
      [1, 2, 3],
    );

    expect(out).toMatchObject({ guardrails_created: 1, guardrails_skipped: 1 });
    expect(api.createContextGuardrail).toHaveBeenCalledWith("hml", "t", 35, {
      name: "Responder em português",
      prompt: "Fale sempre em português.",
    });
  });
});
