import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./perfecting.ts", () => ({
  DIFFICULTY_LEVEL_IDS: [1, 2, 3],
  PerfectingError: class extends Error {},
  getCaseSetupRaw: vi.fn(),
  getCaseSetupCallPanel: vi.fn(),
  listStepKnowledgeFull: vi.fn(),
  listCaseSetupObjectionsFull: vi.fn(),
  listContextObjectionsFull: vi.fn(),
  listContextGuardrailsFull: vi.fn(),
  listObjectionTypes: vi.fn(),
  listCaseSetupsByContextFull: vi.fn(),
  getPersona: vi.fn(),
  getPersonaPains: vi.fn(),
  getPersonaOfferProducts: vi.fn(),
  listOfferPainsFull: vi.fn(),
  listOfferProductsFull: vi.fn(),
  patchCaseSetup: vi.fn(),
  createCaseSetupObjection: vi.fn(),
  createContextObjection: vi.fn(),
  patchObjection: vi.fn(),
  deleteObjection: vi.fn(),
}));

import * as perfecting from "./perfecting.ts";
import { AdjustConflictError, loadAdjustState, objectionRows, saveAdjustSection } from "./roleplay-adjust.ts";

const m = perfecting as unknown as Record<string, ReturnType<typeof vi.fn>>;

const objection = (over: Record<string, unknown>) => ({
  id: 1,
  objection_type_id: 7,
  title: "Caro",
  description: "",
  details: "",
  to_give_in_if: "",
  difficulty_level_id: 2,
  persona_id: null,
  case_setup_id: 126,
  ...over,
});

describe("objectionRows", () => {
  it("com objeções da persona, as sem persona ficam de fora (regra do backend)", () => {
    const rows = objectionRows(
      [objection({ id: 1, persona_id: 50 }), objection({ id: 2, persona_id: null })],
      [objection({ id: 3, case_setup_id: null, persona_id: null })],
      50,
    );
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it("sem objeção da persona, valem as sem persona — do roleplay e do contexto", () => {
    const rows = objectionRows(
      [objection({ id: 2 })],
      [objection({ id: 3, case_setup_id: null }), objection({ id: 4, case_setup_id: 999 })],
      50,
    );
    expect(rows.map((r) => [r.id, r.scope])).toEqual([
      [2, "case_setup"],
      [3, "context"],
    ]);
  });
});

describe("saveAdjustSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getCaseSetupRaw.mockResolvedValue({
      id: 126,
      context_id: 58,
      offer_id: 86,
      persona_id: null,
      training_name: "Fase 2",
      buyer_agent_first_messages: ["Oi"],
      role_play_status_id: null,
      difficulty_level_id: 2,
      buyer_prior_knowledge: [],
    });
    m.getCaseSetupCallPanel.mockResolvedValue({});
    m.listStepKnowledgeFull.mockResolvedValue([]);
    m.listCaseSetupObjectionsFull.mockResolvedValue([]);
    m.listContextObjectionsFull.mockResolvedValue([]);
    m.listContextGuardrailsFull.mockResolvedValue([]);
    m.listObjectionTypes.mockResolvedValue([{ id: 7, slug: "preco-orcamento", name: "Preço" }]);
    m.listCaseSetupsByContextFull.mockResolvedValue([]);
  });

  it("recusa quando a aba mudou desde a leitura", async () => {
    await expect(
      saveAdjustSection("hml", "t", 126, "general", {}, "versao-velha"),
    ).rejects.toBeInstanceOf(AdjustConflictError);
    expect(m.patchCaseSetup).not.toHaveBeenCalled();
  });

  it("salva só o que mudou e devolve antes/depois", async () => {
    const state = await loadAdjustState("hml", "t", 126);
    const desired = { ...state.sections.general, role_play_status_id: 1 };
    const res = await saveAdjustSection("hml", "t", 126, "general", desired, state.hashes.general);
    expect(m.patchCaseSetup).toHaveBeenCalledWith("hml", "t", 126, { role_play_status_id: 1 });
    expect(res.summary).toEqual(["campos alterados: role_play_status_id"]);
  });

  it("objeção nova vai para o roleplay nos três níveis", async () => {
    const state = await loadAdjustState("hml", "t", 126);
    await saveAdjustSection(
      "hml",
      "t",
      126,
      "objections",
      [{ key: null, scope: "case_setup", titulo: "Caro", tipo: "preco-orcamento", fala_exemplo: "", detalhes: "", ceder_se: "x", levels: [] }],
      state.hashes.objections,
    );
    expect(m.createCaseSetupObjection).toHaveBeenCalledTimes(3);
    expect(m.createContextObjection).not.toHaveBeenCalled();
  });
});
