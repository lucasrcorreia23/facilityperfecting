import { describe, expect, it } from "vitest";
import { buildSentSnapshot, changedItems, diffGeneration } from "./generation-diff.ts";

const obj = (titulo: string, fala = "fala") => ({ titulo, tipo: "preco", fala_exemplo: fala, detalhes: "", ceder_se: "x" });

const ai = {
  oferta_nome: "Curso Técnico",
  oferta_descricao: "Descrição da IA",
  perfil: "Perfil da IA",
  personas_variacao: "Variar cargos",
  objecoes: [obj("Preço alto"), obj("Sem tempo"), obj("Já tenho fornecedor")],
  guardrails: [{ nome: "Não prometer", instrucao: "..." }],
  cenario_instrucoes: "Cenário",
  objetivo: "Objetivo",
  habilidades: "Habilidades",
  call_context_slug: "discovery",
  dificuldade: "medium",
  lacunas: [],
};

const draft = (scenario: Record<string, unknown>, over: { desc?: string; perfil?: string } = {}) => ({
  scenario: {
    generation_mode: "methodology",
    aditional_instructions: "Cenário",
    objective: "Objetivo",
    skill: "Habilidades",
    call_context_slug: "discovery",
    difficulty: "medium",
    objections: ai.objecoes,
    guardrails: ai.guardrails,
    ...scenario,
  },
  offers: { offer_name: "Curso Técnico", general_description: over.desc ?? "Descrição da IA" },
  contexts: { target_notes: over.perfil ?? "Perfil da IA" },
});

describe("diffGeneration", () => {
  it("sem saída da IA não há com o que comparar", () => {
    expect(diffGeneration(null, buildSentSnapshot(draft({})))).toBeNull();
  });

  it("nada editado: tudo igual", () => {
    expect(changedItems(diffGeneration(ai, buildSentSnapshot(draft({}))))).toEqual([]);
  });

  it("texto editado traz a diferença de tamanho; apagado vira cleared", () => {
    const items = changedItems(diffGeneration(ai, buildSentSnapshot(draft({ objective: "" }, { perfil: "Perfil da IA, revisado" }))));
    expect(items.map((i) => [i.key, i.status, i.detail])).toEqual([
      ["perfil", "edited", "+10 caracteres"],
      ["objetivo", "cleared", null],
    ]);
  });

  it("objeções casadas pelo título: removida, nova e alterada", () => {
    const sent = [obj("preço  ALTO", "outra fala"), obj("Sem tempo"), obj("Autoridade")];
    const [item] = changedItems(diffGeneration(ai, buildSentSnapshot(draft({ objections: sent }))));
    expect(item.key).toBe("objecoes");
    expect(item.detail).toBe("1 objeção removida, 1 nova, 1 alterada (de 3)");
  });

  it("no playbook ignora o que vem das etapas e compara a variação de personas", () => {
    const items = diffGeneration(
      ai,
      buildSentSnapshot(draft({ generation_mode: "playbook", difficulty: "hard", persona_instructions: "" })),
    )!;
    expect(items.map((i) => i.key)).not.toContain("dificuldade");
    expect(changedItems(items).map((i) => [i.key, i.status])).toEqual([["personas_variacao", "cleared"]]);
  });

  it("tipo de chamada mostra de → para", () => {
    const [item] = changedItems(diffGeneration(ai, buildSentSnapshot(draft({ call_context_slug: "cold_call" }))));
    expect(item.detail).toBe("discovery → cold_call");
  });
});
