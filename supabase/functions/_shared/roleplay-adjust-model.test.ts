import { describe, expect, it } from "vitest";
import {
  type AdjustObjection,
  type AdjustPersona,
  type AdjustStepItem,
  AdjustValidationError,
  dictFromTopics,
  displayGuardrailName,
  groupObjections,
  type ObjectionRow,
  planGeneralPatch,
  planGuardrailChanges,
  planObjectionChanges,
  planPersonaChanges,
  planStepKnowledgePatches,
  stableHash,
  topicsFromDict,
} from "./roleplay-adjust-model.ts";

const row = (over: Partial<ObjectionRow>): ObjectionRow => ({
  id: 1,
  scope: "case_setup",
  title: "Está caro",
  objection_type_id: 7,
  description: "Achei caro.",
  details: "",
  to_give_in_if: "Se mostrar valor.",
  difficulty_level_id: 1,
  persona_id: 50,
  ...over,
});

const types = new Map([
  ["preco-orcamento", 7],
  ["autoridade-decisao", 10],
]);
const slugs = new Map([
  [7, "preco-orcamento"],
  [10, "autoridade-decisao"],
]);
const opts = { personaId: 50, levels: [1, 2, 3] as const, typeIdBySlug: types };

describe("stableHash", () => {
  it("ignora a ordem das chaves e muda com o conteúdo", () => {
    expect(stableHash({ a: 1, b: [1, 2] })).toBe(stableHash({ b: [1, 2], a: 1 }));
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });
});

describe("tópicos ↔ dict", () => {
  it("vai e volta, descartando título vazio", () => {
    const topics = topicsFromDict({ Regra: "não invente", Operação: "turnos" });
    expect(topics).toEqual([
      { titulo: "Regra", texto: "não invente" },
      { titulo: "Operação", texto: "turnos" },
    ]);
    expect(dictFromTopics([...topics, { titulo: " ", texto: "x" }], "fatos")).toEqual({
      Regra: "não invente",
      Operação: "turnos",
    });
  });

  it("recusa título repetido (sobrescreveria o outro)", () => {
    expect(() =>
      dictFromTopics([
        { titulo: "A", texto: "1" },
        { titulo: "A ", texto: "2" },
      ], "fatos"),
    ).toThrow(AdjustValidationError);
  });
});

describe("planGeneralPatch", () => {
  const loaded = { training_name: "Fase 2", first_messages: ["Oi"], role_play_status_id: null, difficulty_level_id: 2 };

  it("só manda o que mudou", () => {
    expect(planGeneralPatch(loaded, { ...loaded })).toEqual({});
    expect(planGeneralPatch(loaded, { ...loaded, role_play_status_id: 1, first_messages: ["Oi", " "] })).toEqual({
      role_play_status_id: 1,
    });
  });

  it("publicar = voltar a null também é mudança", () => {
    expect(planGeneralPatch({ ...loaded, role_play_status_id: 1 }, loaded)).toEqual({ role_play_status_id: null });
  });

  it("nome vazio é erro", () => {
    expect(() => planGeneralPatch(loaded, { ...loaded, training_name: "  " })).toThrow(AdjustValidationError);
  });
});

describe("planStepKnowledgePatches", () => {
  const item: AdjustStepItem = {
    id: 9,
    title: "Abertura",
    block_name: "Abertura",
    order: 0,
    prior: "visita presencial",
    facts: [
      { titulo: "Regra", texto: "não invente" },
      { titulo: "Operação", texto: "turnos" },
    ],
    briefing: [{ titulo: "Fase 1", texto: "ligação" }],
    seller_instruction: "",
    first_messages: ["Pode entrar"],
  };

  it("sem mudança, sem patch", () => {
    expect(planStepKnowledgePatches([item], [structuredClone(item)])).toEqual([]);
  });

  it("mudar um fato manda o dict INTEIRO (a API substitui)", () => {
    const changed = structuredClone(item);
    changed.facts[1].texto = "turnos e safra";
    expect(planStepKnowledgePatches([item], [changed])).toEqual([
      { id: 9, patch: { knowledge_prompt_details: { Regra: "não invente", Operação: "turnos e safra" } } },
    ]);
  });

  it("bloco que sumiu é erro (recarregar)", () => {
    expect(() => planStepKnowledgePatches([], [item])).toThrow(AdjustValidationError);
  });
});

describe("objeções", () => {
  const rows = [
    row({ id: 1, difficulty_level_id: 1 }),
    row({ id: 2, difficulty_level_id: 2 }),
    row({ id: 3, difficulty_level_id: 3 }),
    row({ id: 4, title: "Preciso levar à diretoria", objection_type_id: 10, difficulty_level_id: 2 }),
  ];

  it("agrupa as linhas por título (uma por nível → um item)", () => {
    const grouped = groupObjections(rows, slugs);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ key: "case_setup:está caro", tipo: "preco-orcamento", levels: [1, 2, 3] });
    expect(grouped[1]).toMatchObject({ tipo: "autoridade-decisao", levels: [2] });
  });

  it("editar o texto altera as três linhas; completa os níveis que faltam", () => {
    const desired = groupObjections(rows, slugs).map((o) => ({ ...o, ceder_se: "Se propuser alternativa." }));
    const plan = planObjectionChanges(rows, desired, opts);
    expect(plan.deletes).toEqual([]);
    expect(plan.patches.map((p) => p.id).sort()).toEqual([1, 2, 3, 4]);
    expect(plan.patches[0].patch).toEqual({ to_give_in_if: "Se propuser alternativa." });
    // A da diretoria só existia no nível 2: ganha 1 e 3, com a persona dela.
    expect(plan.creates.map((c) => c.input.difficulty_level_id)).toEqual([1, 3]);
    expect(plan.creates.every((c) => c.input.persona_id === 50 && c.scope === "case_setup")).toBe(true);
  });

  it("objeção nova nasce nos três níveis e com a persona", () => {
    const novo: AdjustObjection = {
      key: null,
      scope: "case_setup",
      titulo: "Não é prioridade",
      tipo: "preco-orcamento",
      fala_exemplo: "",
      detalhes: "",
      ceder_se: "x",
      levels: [],
    };
    const plan = planObjectionChanges([], [novo], opts);
    expect(plan.creates).toHaveLength(3);
    expect(plan.creates[0].input).toMatchObject({ title: "Não é prioridade", persona_id: 50, description: null });
  });

  it("remover da lista apaga todas as linhas do grupo", () => {
    const desired = groupObjections(rows, slugs).filter((o) => o.titulo !== "Está caro");
    const plan = planObjectionChanges(rows, desired, opts);
    expect(plan.deletes.map((d) => d.id)).toEqual([1, 2, 3]);
  });

  it("renomear mantém o grupo (patch de título, não apagar e criar)", () => {
    const desired = groupObjections(rows, slugs).map((o) =>
      o.titulo === "Está caro" ? { ...o, titulo: "Está caro demais" } : o,
    );
    const plan = planObjectionChanges(rows, desired, opts);
    expect(plan.deletes).toEqual([]);
    expect(plan.patches.filter((p) => p.patch.title === "Está caro demais")).toHaveLength(3);
  });

  it("valida título, tipo e repetição", () => {
    const base: AdjustObjection = { ...groupObjections(rows, slugs)[0] };
    expect(() => planObjectionChanges(rows, [{ ...base, titulo: "" }], opts)).toThrow(AdjustValidationError);
    expect(() => planObjectionChanges(rows, [{ ...base, tipo: "xx" }], opts)).toThrow(AdjustValidationError);
    expect(() =>
      planObjectionChanges(rows, [base, { ...base, key: null }], opts),
    ).toThrow(AdjustValidationError);
  });

  it("objeção do contexto é alterada no contexto", () => {
    const ctx = [row({ id: 7, scope: "context", difficulty_level_id: 1 })];
    const desired = groupObjections(ctx, slugs).map((o) => ({ ...o, detalhes: "novo" }));
    const plan = planObjectionChanges(ctx, desired, opts);
    expect(plan.patches).toEqual([{ scope: "context", id: 7, patch: { details: "novo" } }]);
    expect(plan.creates.every((c) => c.scope === "context")).toBe(true);
  });
});

describe("planPersonaChanges", () => {
  const loaded: AdjustPersona = {
    id: 50,
    name: "Adalberto",
    job_title: "RT",
    persona_prompt: "Você é o Adalberto.",
    pains: [{ offer_pain_id: 14, title: "Dor", reveal_level: "surface", detail: "fala cedo" }],
    products: [{ offer_product_id: 19, name: "Produto", stance: "gosta" }],
  };

  it("sem mudança, nada", () => {
    expect(planPersonaChanges(loaded, structuredClone(loaded))).toEqual({ persona: null, pains: null, products: null });
  });

  it("mudar o nível de revelação manda a lista inteira de dores", () => {
    const d = structuredClone(loaded);
    d.pains![0].reveal_level = "hidden";
    expect(planPersonaChanges(loaded, d).pains).toEqual([
      { offer_pain_id: 14, reveal_level: "hidden", persona_specific_detail: "fala cedo" },
    ]);
  });

  it("dor repetida e prompt vazio são erro", () => {
    const d = structuredClone(loaded);
    d.pains!.push({ ...d.pains![0] });
    expect(() => planPersonaChanges(loaded, d)).toThrow(AdjustValidationError);
    expect(() => planPersonaChanges(loaded, { ...loaded, persona_prompt: " " })).toThrow(AdjustValidationError);
  });
});

describe("planGuardrailChanges", () => {
  const existing = [
    { id: 1, name: "Não inventar · ctx 58", prompt: "Nunca invente." },
    { id: 2, name: "Regra antiga sem sufixo", prompt: "x" },
  ];

  it("mostra o nome sem o sufixo técnico", () => {
    expect(displayGuardrailName(existing[0].name, 58)).toBe("Não inventar");
    expect(displayGuardrailName(existing[1].name, 58)).toBe("Regra antiga sem sufixo");
  });

  it("não renomeia o que não mudou; nova ganha sufixo; removida é apagada", () => {
    const plan = planGuardrailChanges(
      existing,
      [
        { id: 1, nome: "Não inventar", instrucao: "Nunca invente números." },
        { id: null, nome: "Formato", instrucao: "É presencial." },
      ],
      58,
    );
    expect(plan.patches).toEqual([{ id: 1, patch: { prompt: "Nunca invente números." } }]);
    expect(plan.creates).toEqual([{ name: "Formato · ctx 58", prompt: "É presencial." }]);
    expect(plan.deletes).toEqual([2]);
  });

  it("valida nome, instrução e repetição", () => {
    expect(() => planGuardrailChanges([], [{ id: null, nome: "", instrucao: "x" }], 1)).toThrow(AdjustValidationError);
    expect(() => planGuardrailChanges([], [{ id: null, nome: "a", instrucao: " " }], 1)).toThrow(AdjustValidationError);
    expect(() =>
      planGuardrailChanges([], [
        { id: null, nome: "A", instrucao: "x" },
        { id: null, nome: "a", instrucao: "y" },
      ], 1),
    ).toThrow(AdjustValidationError);
  });
});
