import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./perfecting.ts", () => ({
  createCaseSetupRubric: vi.fn(),
  createOfferPain: vi.fn(),
  createOfferProduct: vi.fn(),
  createPersonaCompany: vi.fn(),
  deleteCaseSetupRubric: vi.fn(),
  generateDossierPersona: vi.fn(),
  listCaseSetupMethodologies: vi.fn(),
  listCaseSetupRubricsFull: vi.fn(),
  listFeedbackRubricTypes: vi.fn(),
  listMethodologySteps: vi.fn(),
  listOfferPains: vi.fn(),
  listOfferProducts: vi.fn(),
  listStepKnowledgeItems: vi.fn(),
  patchCaseSetup: vi.fn(),
  patchStepKnowledge: vi.fn(),
  setPersonaOfferProducts: vi.fn(),
  setPersonaPains: vi.fn(),
  updatePersona: vi.fn(),
  // usados por context-content.ts (importado por dossier.ts)
  createContextGuardrail: vi.fn(),
  createContextObjection: vi.fn(),
  listContextGuardrails: vi.fn(),
  listContextObjections: vi.fn(),
  listObjectionTypes: vi.fn(),
}));

import * as api from "./perfecting.ts";
import {
  applyDossierToCaseSetup,
  applyDossierToPersona,
  applyPortfolio,
  dossierLeakWarnings,
  FACTS_IN_ALL_STEPS,
  hasDossier,
  painsAsPromptText,
  personaPainLinks,
  planStepKnowledge,
  type RoleplayDossier,
} from "./dossier.ts";

const mocked = vi.mocked(api);

function makeDossier(): RoleplayDossier {
  return {
    produtos: [
      { nome: "Habilita Função", descricao: "", problema_resolvido: "", beneficios: "" },
      { nome: "Gestão de SST", descricao: "", problema_resolvido: "", beneficios: "" },
    ],
    dores: [
      { titulo: "Apagão de mão de obra", descricao: "Falta gente pronta.", produto: "Habilita Função" },
      { titulo: "Decisão travada", descricao: "A direção não decide.", produto: "" },
    ],
    persona: {
      nome: "André",
      genero: "masculino",
      cargo: "RH",
      area: "RH",
      empresa_nome: "Cooperativa Vale Dourado",
      empresa_perfil: "Arroz, 950 pessoas.",
      prompt: "Você é o André.",
      dores: [
        { dor: "Apagão de mão de obra", revelacao: "sondada", detalhe: "Quem é bom sai." },
        { dor: "Decisão travada", revelacao: "oculta", detalhe: "Ninguém bate o martelo." },
      ],
      produtos: [{ produto: "Habilita Função", postura: "Gosta de formar na função." }],
    },
    conhecimento: {
      previo: "Retorno da visita.",
      fatos: [{ titulo: "Propostas", texto: "NR-13 parada." }],
      briefing: [{ titulo: "Conta", texto: "R$ 35 mil em 2025." }],
    },
    abertura: ["Oi, tudo bem?", " "],
    rubricas: [{ criterio: "Agendamento", descricao: "Reunião com data.", dica: "" }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("hasDossier", () => {
  it("exige prompt do comprador e ao menos uma dor", () => {
    expect(hasDossier(makeDossier())).toBe(true);
    expect(hasDossier(null)).toBe(false);
    const semDor = makeDossier();
    semDor.persona.dores = [];
    expect(hasDossier(semDor)).toBe(false);
  });
});

describe("painsAsPromptText", () => {
  it("descreve as dores com a regra de revelação e sem nome de produto", () => {
    const text = painsAsPromptText(makeDossier());
    expect(text).toContain("Apagão de mão de obra");
    expect(text).toContain("desconversa");
    expect(text).not.toContain("Habilita");
  });
});

describe("applyPortfolio", () => {
  it("degrada quando o ambiente não tem as rotas de portfólio", async () => {
    mocked.listOfferProducts.mockResolvedValue(null);
    const ids = await applyPortfolio("prod", "t", 1, makeDossier());
    expect(ids.supported).toBe(false);
    expect(mocked.createOfferProduct).not.toHaveBeenCalled();
  });

  it("reusa o que já existe na oferta e liga a dor ao produto", async () => {
    mocked.listOfferProducts.mockResolvedValue([{ id: 10, name: "habilita função" }]);
    mocked.createOfferProduct.mockResolvedValue(11);
    mocked.listOfferPains.mockResolvedValue([]);
    mocked.createOfferPain.mockResolvedValueOnce(20).mockResolvedValueOnce(21);
    const ids = await applyPortfolio("hml", "t", 1, makeDossier());
    expect(mocked.createOfferProduct).toHaveBeenCalledTimes(1);
    expect(mocked.createOfferPain).toHaveBeenNthCalledWith(1, "hml", "t", 1, {
      title: "Apagão de mão de obra",
      description: "Falta gente pronta.",
      offer_product_id: 10,
    });
    expect(mocked.createOfferPain.mock.calls[1][3].offer_product_id).toBeNull();
    expect(personaPainLinks(makeDossier(), ids)).toEqual([
      { offer_pain_id: 20, reveal_level: "probed", persona_specific_detail: "Quem é bom sai." },
      { offer_pain_id: 21, reveal_level: "hidden", persona_specific_detail: "Ninguém bate o martelo." },
    ]);
  });
});

describe("applyDossierToPersona", () => {
  it("sem portfólio, leva as dores em texto no prompt", async () => {
    const ids = { supported: false, productIds: new Map(), painIds: new Map(), warnings: [] };
    await applyDossierToPersona("prod", "t", 5, makeDossier(), ids);
    const patch = mocked.updatePersona.mock.calls[0][3] as Record<string, string>;
    expect(patch.persona_prompt).toContain("# Suas dores");
    expect(mocked.setPersonaPains).not.toHaveBeenCalled();
  });
});

describe("applyDossierToCaseSetup", () => {
  it("troca as rubricas do vendedor e distribui o conhecimento pelas etapas", async () => {
    mocked.listFeedbackRubricTypes.mockResolvedValue([
      { id: 1, name: "seller_rubric" },
      { id: 2, name: "roleplay_rubric" },
    ]);
    mocked.listCaseSetupRubricsFull.mockResolvedValue([
      { id: 100, feedback_rubric_type_id: 1, statement: "gerada" },
      { id: 101, feedback_rubric_type_id: 2, statement: "do comprador" },
    ]);
    mocked.listStepKnowledgeItems.mockResolvedValue([
      { id: 8, title: "Problem", persona_id: 5, methodology_step_ids: [32] },
      { id: 7, title: "Situation", persona_id: 5, methodology_step_ids: [31] },
    ]);
    mocked.listMethodologySteps.mockResolvedValue([
      { id: 31, name: "Situation", order: 1 },
      { id: 32, name: "Problem", order: 2 },
    ]);
    const { warnings } = await applyDossierToCaseSetup("hml", "t", 99, 5, makeDossier(), 3);
    expect(warnings).toEqual([]);
    expect(mocked.patchCaseSetup.mock.calls[0][3]).toMatchObject({
      buyer_agent_first_messages: ["Oi, tudo bem?"],
    });
    expect(mocked.deleteCaseSetupRubric).toHaveBeenCalledTimes(1);
    expect(mocked.deleteCaseSetupRubric).toHaveBeenCalledWith("hml", "t", 99, 100);
    expect(mocked.createCaseSetupRubric).toHaveBeenCalledTimes(1);
    expect(mocked.listMethodologySteps).toHaveBeenCalledWith("hml", "t", 3);
    expect(mocked.patchStepKnowledge).toHaveBeenCalledTimes(2);
    const byItem = Object.fromEntries(
      mocked.patchStepKnowledge.mock.calls.map((c) => [c[3], c[4] as Record<string, unknown>]),
    );
    expect(byItem[7].prior_knowledge_prompt).toBe("Retorno da visita.");
    expect(byItem[8].prior_knowledge_prompt).toBe("");
    expect(byItem[7].knowledge_prompt_details).toMatchObject({ Propostas: "NR-13 parada." });
  });

  it("sem a ordem das etapas, volta a copiar tudo e avisa", async () => {
    mocked.listFeedbackRubricTypes.mockResolvedValue([{ id: 1, name: "seller_rubric" }]);
    mocked.listCaseSetupRubricsFull.mockResolvedValue([]);
    mocked.listCaseSetupMethodologies.mockRejectedValue(new Error("fora"));
    mocked.listStepKnowledgeItems.mockResolvedValue([
      { id: 7, title: "Situation", persona_id: 5, methodology_step_ids: [] },
      { id: 8, title: "Problem", persona_id: 5, methodology_step_ids: [] },
    ]);
    const { warnings } = await applyDossierToCaseSetup("hml", "t", 99, 5, makeDossier());
    expect(warnings).toEqual([
      "conhecimento por etapa: sem a ordem das etapas, prévio e fatos foram em todas",
    ]);
    for (const c of mocked.patchStepKnowledge.mock.calls) {
      expect((c[4] as Record<string, unknown>).prior_knowledge_prompt).toBe("Retorno da visita.");
    }
  });
});

describe("planStepKnowledge", () => {
  const steps = [
    { id: 31, order: 1 },
    { id: 32, order: 2 },
    { id: 33, order: 3 },
  ];
  const items = [
    { id: 1, title: "S", persona_id: 5, methodology_step_ids: [31] },
    { id: 2, title: "P", persona_id: 5, methodology_step_ids: [32] },
    { id: 3, title: "I", persona_id: 5, methodology_step_ids: [33] },
  ];

  it("sem FACTS_IN_ALL_STEPS: põe cada fato na sua etapa, os de etapa 0 em todas, e a abertura em todas", () => {
    const d = makeDossier();
    d.conhecimento.fatos = [
      { titulo: "Geral", texto: "Cooperativa com 3 unidades.", etapa: 0 },
      { titulo: "Atraso", texto: "Exames atrasados.", etapa: 2 },
      // etapa além da última cai na última
      { titulo: "Próximo passo", texto: "Reunião de diretoria mensal.", etapa: 4 },
    ];
    const { patches, ordered } = planStepKnowledge(d, items, steps, false);
    expect(ordered).toBe(true);
    const facts = patches.map((p) => Object.keys(p.patch.knowledge_prompt_details as object));
    expect(facts[0]).toEqual(["Geral", "Regra"]);
    expect(facts[1]).toEqual(["Geral", "Atraso", "Regra"]);
    expect(facts[2]).toEqual(["Geral", "Próximo passo", "Regra"]);
    expect(patches.every((p) => (p.patch.buyer_agent_first_messages as string[])[0] === "Oi, tudo bem?")).toBe(true);
    expect(patches[0].patch.prior_knowledge_user_briefing).toEqual({ Conta: "R$ 35 mil em 2025." });
  });

  it("com FACTS_IN_ALL_STEPS (padrão de hoje): todo fato em todas, prévio só na 1ª", () => {
    expect(FACTS_IN_ALL_STEPS).toBe(true);
    const d = makeDossier();
    d.conhecimento.fatos = [
      { titulo: "Geral", texto: "Cooperativa com 3 unidades.", etapa: 0 },
      { titulo: "Atraso", texto: "Exames atrasados.", etapa: 2 },
      { titulo: "Próximo passo", texto: "Reunião de diretoria mensal.", etapa: 4 },
    ];
    const { patches } = planStepKnowledge(d, items, steps);
    for (const p of patches) {
      expect(Object.keys(p.patch.knowledge_prompt_details as object)).toEqual([
        "Geral",
        "Atraso",
        "Próximo passo",
        "Regra",
      ]);
    }
    expect(patches.map((p) => p.patch.prior_knowledge_prompt)).toEqual(["Retorno da visita.", "", ""]);
  });

  it("item sem etapa vinculada (bug do backend) é reconhecido pelo título", () => {
    const named = [
      { id: 31, order: 1, name: "Situation (Situação)" },
      { id: 32, order: 2, name: "Problem (Problema)" },
      { id: 39, order: 3, name: "Need-Payoff (Necessidade de Solução)" },
    ];
    const withGap = [
      { id: 1, title: "Situation (Situação) — André", persona_id: 5, methodology_step_ids: [31] },
      { id: 2, title: "Problem (Problema) — André", persona_id: 5, methodology_step_ids: [32] },
      { id: 3, title: "Need-Payoff (Necessidade de Solução) — André", persona_id: 5, methodology_step_ids: [] },
    ];
    const { patches, ordered } = planStepKnowledge(makeDossier(), withGap, named);
    expect(ordered).toBe(true);
    expect(patches.map((p) => p.patch.prior_knowledge_prompt)).toEqual(["Retorno da visita.", "", ""]);
  });

  it("fato sem etapa (dossiê antigo) vale para todas", () => {
    const { patches } = planStepKnowledge(makeDossier(), items, steps);
    for (const p of patches) {
      expect(p.patch.knowledge_prompt_details).toMatchObject({ Propostas: "NR-13 parada." });
    }
  });
});

describe("dossierLeakWarnings", () => {
  it("avisa quando uma dor oculta está repetida no prévio", () => {
    const d = makeDossier();
    d.persona.dores[1].detalhe = "Sente que a diretoria nunca decide as propostas de capacitação paradas.";
    d.conhecimento.previo = "Sabe que a diretoria nunca decide as propostas de capacitação, que ficam paradas.";
    const warnings = dossierLeakWarnings(d);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Decisão travada");
    expect(warnings[0]).toContain("conhecimento prévio");
  });

  it("não avisa dor de superfície nem texto sem relação", () => {
    const d = makeDossier();
    d.persona.dores[0].revelacao = "superficie";
    d.conhecimento.previo = "Retorno da visita técnica de março, primeira conversa por telefone.";
    expect(dossierLeakWarnings(d)).toEqual([]);
  });
});
