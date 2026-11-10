import { describe, expect, it } from "vitest";
import { caseSetupCreateIssues } from "./case-setup-contract.ts";
import { buildCaseSetupCreatePayload } from "./perfecting.ts";

/**
 * Payload completo, na forma do seed `scripts/seed-rp-a1-rd.mjs` (o
 * `scenario.case_setup_payload` de um rascunho verbatim), reduzido no texto.
 */
function seedVerbatim(): Record<string, unknown> {
  return {
    training_name: "A1 — RD Station CRM: Diagnóstico com Gerente Comercial",
    training_description: "Reunião de diagnóstico com o gerente comercial.",
    training_keywords: "diagnóstico, CRM",
    training_objective: "Diagnosticar antes de apresentar.",
    training_targeted_sales_skills: ["Diagnóstico de dor"],
    company_profile: {
      name: "Nexen Logística e Distribuição",
      location: "Joinville, Santa Catarina, Brasil",
      description: "Distribuidora B2B.",
      industry_slug: "consultoria-e-servicos",
      annual_revenue: 90,
      specialization: "Distribuição B2B",
      financial_model: "Receita recorrente.",
      cultural_profile: "Cultura comercial pragmática.",
      annual_revenue_unit: "milhões de reais",
      number_of_employees: 140,
      technology_portfolio: "ERP e planilhas.",
      strategic_focus_areas: "Profissionalizar a operação comercial.",
    },
    persona_profile: {
      age: 44,
      name: "Eduardo Ramos",
      gender_id: 1,
      job_title: "Gerente Comercial",
      department: "Comercial",
      career_path: "Subiu de vendedor a gerente.",
      description: "Gerente comercial da Nexen.",
      main_desires: "Previsibilidade de pipeline.",
      main_concerns: "Que o time não adote a ferramenta.",
      point_of_view: "A operação já funciona.",
      main_objections: "Já tenho meu controle em planilha.",
      hobbies_and_interests: "Futebol.",
      communication_style_id: 2,
      years_in_current_position: 6,
      decision_making_role_description: "Decisor da operação comercial.",
      previous_professional_experience: "Vendas B2B.",
      main_current_problems_frustrations_and_evidence: "Pipeline vive na cabeça dele.",
    },
    buyer_agent_instructions: [
      {
        instructions: ["Defenda a planilha"],
        tone_and_mood: "Confiante",
        desired_behaviors: ["Exigir prova"],
        trigger_conditions: ["Se o vendedor pular o entendimento"],
        undesired_behaviors: ["Aceitar trocar de processo"],
      },
    ],
    buyer_prior_knowledge: ["Tem 16 vendedores."],
    buyer_agent_initial_tone_and_mood: "Cético",
    buyer_agent_first_messages: ["Alô, Eduardo falando."],
    buyer_agent_success_criteria: ["Aceitar um próximo passo"],
    salesperson_instructions: ["Investigue antes de apresentar"],
    salesperson_desired_tone_and_mood: "Consultivo",
    salesperson_desired_behaviors: ["Perguntar"],
    salesperson_undesired_behaviors: ["Despejar funcionalidade"],
    salesperson_success_criteria: ["Agendar a demonstração"],
    salesperson_evaluation_rubric_criteria: [],
    persona_voice_id: 2,
    persona_voice_model_id: "6OQ4sAE2Nc046rmN5Tmf",
    // Fora do Input de PROD: rascunhos antigos trazem, a API ignora.
    successful_sale_dialogues_examples: [],
    unsuccessful_sale_dialogues_examples: [],
  };
}

const prodPayload = (verbatim: Record<string, unknown>) =>
  buildCaseSetupCreatePayload(
    "prod",
    { ...verbatim, scenario_difficulty_level: "medium" },
    196,
    11,
    null,
    { methodologyIds: [5159], difficultyLevelId: 2 },
  );

/**
 * O que o envio de debate mandava até 10/11/2026 (`debateCaseSetupPayload` em
 * main @ 51305c8): company_profile com 2 dos 12 campos e persona_profile com 5 dos 17.
 * PROD recusava com 422 depois de oferta, contexto e persona já criados.
 */
const OLD_DEBATE_PAYLOAD = {
  context_id: 198,
  call_context_type_id: 11,
  training_name: "Terceirização da culpa · contesta",
  training_description: "",
  training_keywords: "",
  training_objective: "",
  training_targeted_sales_skills: ["argumentação", "uso de exemplos da obra", "escuta ativa"],
  scenario_difficulty_level: "medium",
  difficulty_level_id: 2,
  methodology_ids: [5159],
  buyer_agent_instructions: [],
  buyer_prior_knowledge: ["É um treino voluntário de debate."],
  buyer_agent_initial_tone_and_mood: "",
  buyer_agent_first_messages: ["Oi, etapa 1. Posso começar?"],
  buyer_agent_success_criteria: [],
  salesperson_instructions: ["Você contesta a moção."],
  salesperson_desired_tone_and_mood: "",
  salesperson_desired_behaviors: [],
  salesperson_undesired_behaviors: [],
  salesperson_success_criteria: [],
  salesperson_evaluation_rubric_criteria: [],
  company_profile: {
    name: "Filhos do Sol e o prisma de diamante, de Theo Orosco",
    description: 'Debate sobre Filhos do Sol e o prisma de diamante, de Theo Orosco, tema "Terceirização da culpa".',
  },
  persona_profile: {
    name: "Manuela Rocha",
    age: 14,
    gender_id: 2,
    job_title: "Debatedora que sustenta a moção",
    description: "uma aluna de 14 anos do 9º ano",
  },
  persona_voice_id: 1,
  persona_voice_model_id: "abc",
  successful_sale_dialogues_examples: [],
  unsuccessful_sale_dialogues_examples: [],
};

describe("caseSetupCreateIssues", () => {
  it("payload completo de venda em PROD passa, com chave a mais e listas vazias", () => {
    expect(caseSetupCreateIssues(prodPayload(seedVerbatim()))).toEqual([]);
  });

  it("o payload antigo do debate reprova: 10 campos da empresa e 12 da pessoa", () => {
    const issues = caseSetupCreateIssues(OLD_DEBATE_PAYLOAD);
    expect(issues.filter((i) => i.startsWith("falta company_profile."))).toHaveLength(10);
    expect(issues.filter((i) => i.startsWith("falta persona_profile."))).toHaveLength(12);
    expect(issues).toHaveLength(22);
    expect(issues).toContain("falta company_profile.industry_slug (obrigatório)");
    expect(issues).toContain("falta persona_profile.communication_style_id (obrigatório)");
  });

  it("acusa obrigatório de topo ausente e perfil que não é objeto", () => {
    const p = prodPayload(seedVerbatim());
    delete p.training_objective;
    delete p.buyer_agent_instructions;
    p.company_profile = "Nexen";
    delete p.persona_profile;
    expect(caseSetupCreateIssues(p)).toEqual([
      "falta training_objective (obrigatório)",
      "falta buyer_agent_instructions (obrigatório)",
      "company_profile deve ser um objeto (veio texto)",
      "falta persona_profile (obrigatório)",
    ]);
  });

  it("acusa tipo errado: número em texto, texto em inteiro, decimal, item de lista", () => {
    const p = prodPayload(seedVerbatim());
    p.training_name = 42;
    p.call_context_type_id = "nao-e-int";
    p.persona_voice_id = 1.5;
    p.buyer_agent_first_messages = ["oi", 3];
    p.methodology_ids = ["5159"];
    (p.persona_profile as Record<string, unknown>).age = "44";
    expect(caseSetupCreateIssues(p)).toEqual([
      "call_context_type_id deve ser número inteiro (veio texto)",
      "training_name deve ser texto (veio número)",
      "buyer_agent_first_messages deve ser lista de textos (veio lista)",
      "persona_voice_id deve ser número inteiro (veio número com casas decimais)",
      "methodology_ids deve ser lista de números inteiros (veio lista)",
      "persona_profile.age deve ser número inteiro (veio texto)",
    ]);
  });

  it("dificuldade fora do enum", () => {
    const p = prodPayload(seedVerbatim());
    p.scenario_difficulty_level = "impossible";
    expect(caseSetupCreateIssues(p)).toEqual([
      'scenario_difficulty_level deve ser easy, medium ou hard (veio "impossible")',
    ]);
  });

  it("persona_voice_model_id é obrigatório mas pode ser null; opcionais aceitam null", () => {
    const p = prodPayload(seedVerbatim());
    p.persona_voice_model_id = null;
    p.user_group_id = null;
    p.methodology_ids = null;
    p.difficulty_level_id = null;
    expect(caseSetupCreateIssues(p)).toEqual([]);
    delete p.persona_voice_model_id;
    expect(caseSetupCreateIssues(p)).toEqual(["falta persona_voice_model_id (obrigatório)"]);
  });

  it("confere cada item de buyer_agent_instructions", () => {
    const p = prodPayload(seedVerbatim());
    p.buyer_agent_instructions = [{ instructions: ["x"], tone_and_mood: "y", desired_behaviors: "z" }, "solto"];
    expect(caseSetupCreateIssues(p)).toEqual([
      "falta buyer_agent_instructions[0].trigger_conditions (obrigatório)",
      "buyer_agent_instructions[0].desired_behaviors deve ser lista de textos (veio texto)",
      "falta buyer_agent_instructions[0].undesired_behaviors (obrigatório)",
      "buyer_agent_instructions[1] deve ser um objeto (veio texto)",
    ]);
  });

  it("verbatim de venda sem os perfis reprova antes de qualquer escrita", () => {
    const v = seedVerbatim();
    delete v.company_profile;
    (v.persona_profile as Record<string, unknown>).communication_style_id = undefined;
    const issues = caseSetupCreateIssues(prodPayload(v));
    expect(issues).toEqual([
      "falta company_profile (obrigatório)",
      "falta persona_profile.communication_style_id (obrigatório)",
    ]);
  });

  it("payload que não é objeto", () => {
    expect(caseSetupCreateIssues(null)).toEqual(["o payload do roleplay deve ser um objeto"]);
  });
});
