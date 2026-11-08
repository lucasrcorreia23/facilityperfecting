import { describe, expect, it } from "vitest";
import {
  type DebateDraft,
  debateBuyerTexts,
  debateCaseSetupPayload,
  debateContextPayload,
  debateDraftIssues,
  debateFeedbackConfig,
  debateObjectionInputs,
  debateOfferPayload,
  debatePersonaPayload,
  debateStepKnowledgeInputs,
  emptyDebateDraft,
  mergeDebateAiResult,
  pickDebateCallContextId,
  pickDebateVoice,
  pickObjectionTypeId,
  pickVoiceV1,
  sortSteps,
} from "./debate.ts";
import { findReservedTerms } from "./buyer-text-lint.ts";

const STEPS = [
  { id: 1304, name: "Oposição", order: 3 },
  { id: 1302, name: "Prova do livro", order: 1 },
  { id: 1303, name: "Raciocínio", order: 2 },
];

const ANCHORS = {
  obra: "Filhos do Sol e o prisma de diamante, de Theo Orosco",
  tema: "Terceirização da culpa",
  mocao: "Quem culpa os outros pelos próprios fracassos não consegue melhorar.",
  lado_aluno: "contra" as const,
  oponente_nome: "Manuela Rocha",
  oponente_idade: 14,
  oponente_genero: "feminino" as const,
};

function fullDraft(): DebateDraft {
  const d = emptyDebateDraft(ANCHORS, STEPS);
  return {
    ...d,
    titulo: "Terceirização da culpa · contesta",
    oponente_descricao: "uma aluna de 14 anos do 9º ano",
    oponente_papel: "Debatedora que sustenta a moção",
    oponente_personalidade: "Você mora com os pais.",
    conhecimento_previo: "É um treino voluntário de debate.",
    instrucao_aluno: "Você contesta a moção.",
    briefing: [{ titulo: "Moção", texto: ANCHORS.mocao }, { titulo: "", texto: "ignorado" }],
    etapas: d.etapas.map((e) => ({
      ...e,
      regras: [{ titulo: "Regra", texto: `regra ${e.ordem}` }],
      foco_aluno: `foco ${e.ordem}`,
      primeiras_falas: [`Oi, etapa ${e.ordem}. Posso começar?`, " "],
    })),
    objecoes: [{ titulo: "Sem exemplo", fala_exemplo: "Me dá um exemplo?", detalhes: "afirma sem exemplo", ceder_se: "conta um momento fiel" }],
    guardrails: [{ nome: "Oponente, não juíza", instrucao: "Nunca avalie o colega." }],
  };
}

describe("rascunho de debate", () => {
  it("ordena as etapas do destino pela ordem do catálogo", () => {
    expect(sortSteps(STEPS).map((s) => s.id)).toEqual([1302, 1303, 1304]);
    expect(emptyDebateDraft(ANCHORS, STEPS).etapas.map((e) => [e.ordem, e.nome])).toEqual([
      [1, "Prova do livro"],
      [2, "Raciocínio"],
      [3, "Oposição"],
    ]);
  });

  it("um rascunho completo não tem pendência", () => {
    expect(debateDraftIssues(fullDraft(), STEPS)).toEqual([]);
  });

  it("aponta o que falta e a metodologia que mudou de tamanho", () => {
    const d = { ...fullDraft(), oponente_personalidade: " ", objecoes: [{ titulo: "x", fala_exemplo: "", detalhes: "", ceder_se: "" }] };
    const issues = debateDraftIssues(d, STEPS.slice(0, 2));
    expect(issues).toContain("falta personalidade da oponente");
    expect(issues.some((i) => i.includes("contra-argumento 1"))).toBe(true);
    expect(issues.some((i) => i.includes("tem 2 etapa(s) e o rascunho tem 3"))).toBe(true);
  });

  it("etapa sem regra ou sem fala barra o envio", () => {
    const d = fullDraft();
    d.etapas[1] = { ...d.etapas[1], regras: [], primeiras_falas: [" "] };
    const issues = debateDraftIssues(d);
    expect(issues).toContain("etapa 2 (Raciocínio): sem regra da oponente");
    expect(issues).toContain("etapa 2 (Raciocínio): sem primeira fala");
  });
});

describe("payloads da Perfecting", () => {
  it("persona com gênero e faixa de idade (o motor tira a concordância do gênero)", () => {
    const p = debatePersonaPayload(fullDraft(), 198, { voiceId: 17, avatarId: 19 });
    expect(p).toMatchObject({ context_id: 198, name: "Manuela Rocha", gender_id: 2, age_group_id: 1, voice_id: 17, persona_avatar_id: 19 });
    const semVoz = debatePersonaPayload({ ...fullDraft(), sem_voz: true }, 198, { voiceId: 17, avatarId: 19 });
    expect(semVoz.voice_id).toBeNull();
    expect(semVoz).not.toHaveProperty("persona_avatar_id");
  });

  it("oferta e contexto trazem todo campo que o create do HML exige", () => {
    const offer = debateOfferPayload(fullDraft());
    for (const k of ["offer_name", "general_description", "target_audience_description", "pricing_details_summary"]) {
      expect(typeof offer[k]).toBe("string");
      expect(offer[k].length).toBeGreaterThan(0);
    }
    const ctx = debateContextPayload(fullDraft(), 213);
    for (const k of [
      "name", "target_description", "compelling_events", "strategic_priorities", "quantifiable_pain_points",
      "desired_future_state", "primary_value_drivers", "typical_decision_making_process", "risk_aversion_level",
      "persona_objections_and_concerns", "persona_awareness_of_the_problem", "persona_awareness_of_the_solutions",
      "persona_existing_solutions",
    ]) {
      expect(typeof ctx[k]).toBe("string");
    }
    expect(ctx.offer_id).toBe(213);
  });

  it("case_setup leva a metodologia, o nível e as falas da primeira etapa", () => {
    const p = debateCaseSetupPayload(fullDraft(), {
      contextId: 198, callContextTypeId: 11, difficulty: "medium", difficultyLevelId: 2,
      methodologyId: 5159, voiceV1: { id: 1, gender_id: 2, voice_model_id: "abc" }, userGroupId: null,
    });
    expect(p).toMatchObject({
      context_id: 198, call_context_type_id: 11, methodology_ids: [5159], difficulty_level_id: 2,
      persona_voice_id: 1, persona_voice_model_id: "abc",
      buyer_agent_first_messages: ["Oi, etapa 1. Posso começar?"],
    });
    expect(p).not.toHaveProperty("user_group_id");
  });

  it("conteúdo por etapa liga pela ORDEM ao id do destino", () => {
    const rows = debateStepKnowledgeInputs(fullDraft(), STEPS, 99);
    expect(rows.map((r) => r.methodology_step_ids[0])).toEqual([1302, 1303, 1304]);
    expect(rows[1]).toMatchObject({
      title: "Raciocínio — Manuela Rocha",
      persona_id: 99,
      knowledge_prompt_details: { Regra: "regra 2" },
      prior_knowledge_user_instruction: "Você contesta a moção. Foco desta etapa: foco 2",
      prior_knowledge_user_briefing: { "Moção": ANCHORS.mocao },
      buyer_agent_first_messages: ["Oi, etapa 2. Posso começar?"],
    });
  });

  it("contra-argumentos nos três níveis, sem persona e sem metodologia", () => {
    const rows = debateObjectionInputs(fullDraft(), 2, [1, 2, 3]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.difficulty_level_id)).toEqual([1, 2, 3]);
    expect(rows[0]).toMatchObject({ title: "Sem exemplo", description: "Me dá um exemplo?", to_give_in_if: "conta um momento fiel", objection_type_id: 2, persona_id: null, methodology_id: null });
  });

  it("feedback desliga Oferta por padrão e respeita a escolha do rascunho", () => {
    expect(debateFeedbackConfig(fullDraft()).enabled_modules.offer_appropriateness_evaluation).toBe(false);
    const d = { ...fullDraft(), feedback_modulos: { ...fullDraft().feedback_modulos, language_appropriateness_evaluation: false } };
    expect(debateFeedbackConfig(d).enabled_modules.language_appropriateness_evaluation).toBe(false);
  });
});

describe("escolhas no destino", () => {
  it("voz: avatar da faixa e do gênero com voz vinculada; senão só a voz; senão nenhuma", () => {
    const avatars = [
      { id: 1, gender_id: 2, age_group_id: 3, is_active: true },
      { id: 19, gender_id: 2, age_group_id: 1, is_active: true },
      { id: 20, gender_id: 1, age_group_id: 1, is_active: true },
    ];
    const voices = [
      { id: 17, gender_id: 2, age_group_id: 1 },
      { id: 30, gender_id: 2, age_group_id: 1 },
    ];
    const links = [{ persona_avatar_id: 19, persona_voice_v2_id: 17 }];
    expect(pickDebateVoice(ANCHORS, avatars, links, voices)).toEqual({ voiceId: 17, avatarId: 19 });
    expect(pickDebateVoice(ANCHORS, avatars, [], voices)).toEqual({ voiceId: 17, avatarId: null });
    expect(pickDebateVoice({ ...ANCHORS, oponente_genero: "masculino" }, avatars, [], voices)).toEqual({ voiceId: null, avatarId: null });
  });

  it("adolescente sem voz child cai na young (a Keren dos roleplays 267/273)", () => {
    const avatars = [{ id: 19, gender_id: 2, age_group_id: 2, is_active: true }];
    const voices = [{ id: 17, gender_id: 2, age_group_id: 2 }];
    expect(pickDebateVoice(ANCHORS, avatars, [{ persona_avatar_id: 19, persona_voice_v2_id: 17 }], voices)).toEqual({ voiceId: 17, avatarId: 19 });
    expect(pickDebateVoice(ANCHORS, [], [], voices)).toEqual({ voiceId: 17, avatarId: null });
  });

  it("voz v1 pelo gênero, tipo de ligação discovery e objeção de credibilidade", () => {
    expect(pickVoiceV1([{ id: 2, gender_id: 1, voice_model_id: "m" }, { id: 1, gender_id: 2, voice_model_id: "f" }], "feminino")?.id).toBe(1);
    expect(pickDebateCallContextId([{ id: 20, slug: "negociacao" }, { id: 11, slug: "qualificacao_inicial_discovery_call" }])).toBe(11);
    expect(pickDebateCallContextId([{ id: 20, slug: "negociacao" }])).toBe(20);
    expect(pickObjectionTypeId([{ id: 1, slug: "preco-orcamento" }, { id: 2, slug: "confianca-credibilidade" }])).toBe(2);
  });
});

describe("saída da IA", () => {
  it("a IA não troca âncora nem cria etapa que não existe", () => {
    const base = emptyDebateDraft(ANCHORS, STEPS);
    const merged = mergeDebateAiResult(base, {
      oponente_nome: "Outra",
      titulo: "T",
      briefing: [{ titulo: "Moção", texto: "m" }],
      etapas: [
        { ordem: 2, regras: [{ titulo: "R", texto: "r" }], foco_aluno: "f", primeiras_falas: ["oi"] },
        { ordem: 9, regras: [], foco_aluno: "x", primeiras_falas: [] },
      ],
      objecoes: [{ titulo: "o", fala_exemplo: "f", detalhes: "d", ceder_se: "c" }],
    });
    expect(merged.oponente_nome).toBe("Manuela Rocha");
    expect(merged.titulo).toBe("T");
    expect(merged.etapas).toHaveLength(3);
    expect(merged.etapas[1]).toMatchObject({ nome: "Raciocínio", foco_aluno: "f", primeiras_falas: ["oi"] });
    expect(merged.etapas[0].regras).toEqual([]);
    expect(merged.objecoes).toHaveLength(1);
  });

  it("vocabulário reservado na fala da oponente é pego pelo portão", () => {
    const d = fullDraft();
    d.etapas[0].primeiras_falas = ["Vamos ver a rubrica do debate?"];
    const issues = findReservedTerms(debateBuyerTexts(d));
    expect(issues.some((i) => i.nivel === "erro" && i.onde === "etapa 1: primeira fala 1")).toBe(true);
  });
});
