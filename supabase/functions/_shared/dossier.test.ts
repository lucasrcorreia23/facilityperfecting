import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./perfecting.ts", () => ({
  createCaseSetupRubric: vi.fn(),
  createOfferPain: vi.fn(),
  createOfferProduct: vi.fn(),
  createPersonaCompany: vi.fn(),
  deleteCaseSetupRubric: vi.fn(),
  generateDossierPersona: vi.fn(),
  listCaseSetupRubricsFull: vi.fn(),
  listFeedbackRubricTypes: vi.fn(),
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
  hasDossier,
  painsAsPromptText,
  personaPainLinks,
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
  it("troca as rubricas do vendedor e reescreve o conhecimento de todas as etapas", async () => {
    mocked.listFeedbackRubricTypes.mockResolvedValue([
      { id: 1, name: "seller_rubric" },
      { id: 2, name: "roleplay_rubric" },
    ]);
    mocked.listCaseSetupRubricsFull.mockResolvedValue([
      { id: 100, feedback_rubric_type_id: 1, statement: "gerada" },
      { id: 101, feedback_rubric_type_id: 2, statement: "do comprador" },
    ]);
    mocked.listStepKnowledgeItems.mockResolvedValue([
      { id: 7, title: "Situation", persona_id: 5 },
      { id: 8, title: "Problem", persona_id: 5 },
    ]);
    const { warnings } = await applyDossierToCaseSetup("hml", "t", 99, 5, makeDossier());
    expect(warnings).toEqual([]);
    expect(mocked.patchCaseSetup.mock.calls[0][3]).toMatchObject({
      buyer_agent_first_messages: ["Oi, tudo bem?"],
    });
    expect(mocked.deleteCaseSetupRubric).toHaveBeenCalledTimes(1);
    expect(mocked.deleteCaseSetupRubric).toHaveBeenCalledWith("hml", "t", 99, 100);
    expect(mocked.createCaseSetupRubric).toHaveBeenCalledTimes(1);
    expect(mocked.patchStepKnowledge).toHaveBeenCalledTimes(2);
    const patch = mocked.patchStepKnowledge.mock.calls[0][4] as Record<string, unknown>;
    expect(patch.prior_knowledge_prompt).toBe("Retorno da visita.");
    expect(patch.knowledge_prompt_details).toMatchObject({ Propostas: "NR-13 parada." });
  });
});
