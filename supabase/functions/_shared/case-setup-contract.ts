/**
 * Contrato do `POST /role_plays/case_setup/create`, transcrito do OpenAPI de PROD
 * (`CaseSetupCRUD.Create.Input`, conferido em 10/11/2026). Serve para recusar ANTES da
 * primeira escrita o que o FastAPI recusaria com 422 no fim do envio — quando oferta,
 * contexto e persona já existem na conta.
 *
 * Confere só o que o FastAPI confere: campo obrigatório presente, tipo básico e enum.
 * De propósito NÃO acusa:
 *  - chave a mais (o pydantic ignora; rascunhos antigos trazem `*_dialogues_examples`);
 *  - texto ou lista vazios (a API aceita; o que falta de conteúdo é assunto de
 *    `caseSetupPayloadIssues`, em `send-progress.ts`);
 *  - id de catálogo inexistente (não é validação de corpo: só o ambiente sabe).
 *
 * Sem imports de propósito: lógica pura, testada no Vitest.
 */

type FieldType =
  | "string"
  | "integer"
  | "string[]"
  | "integer[]"
  /** Obrigatório mas aceita `null` (`persona_voice_model_id`). */
  | "string|null";

type Shape = Readonly<Record<string, FieldType>>;

/** `EmployerCompanyOutputSchema` — os 12 campos são obrigatórios. */
export const COMPANY_PROFILE_SHAPE: Shape = {
  name: "string",
  industry_slug: "string",
  specialization: "string",
  location: "string",
  number_of_employees: "integer",
  annual_revenue: "integer",
  annual_revenue_unit: "string",
  strategic_focus_areas: "string",
  technology_portfolio: "string",
  financial_model: "string",
  cultural_profile: "string",
  description: "string",
};

/** `PersonasOutputSchema` — os 17 campos são obrigatórios. */
export const PERSONA_PROFILE_SHAPE: Shape = {
  name: "string",
  age: "integer",
  gender_id: "integer",
  job_title: "string",
  department: "string",
  career_path: "string",
  years_in_current_position: "integer",
  previous_professional_experience: "string",
  communication_style_id: "integer",
  hobbies_and_interests: "string",
  description: "string",
  point_of_view: "string",
  decision_making_role_description: "string",
  main_current_problems_frustrations_and_evidence: "string",
  main_desires: "string",
  main_objections: "string",
  main_concerns: "string",
};

/** `AgentInstructionsOutputSchema` — cada item de `buyer_agent_instructions`. */
export const AGENT_INSTRUCTIONS_SHAPE: Shape = {
  trigger_conditions: "string[]",
  instructions: "string[]",
  tone_and_mood: "string",
  desired_behaviors: "string[]",
  undesired_behaviors: "string[]",
};

/** Campos de topo obrigatórios, fora os três aninhados (conferidos à parte). */
const REQUIRED_TOP: Shape = {
  context_id: "integer",
  call_context_type_id: "integer",
  training_name: "string",
  training_description: "string",
  training_keywords: "string",
  training_objective: "string",
  training_targeted_sales_skills: "string[]",
  scenario_difficulty_level: "string",
  buyer_prior_knowledge: "string[]",
  buyer_agent_initial_tone_and_mood: "string",
  buyer_agent_first_messages: "string[]",
  buyer_agent_success_criteria: "string[]",
  salesperson_instructions: "string[]",
  salesperson_desired_tone_and_mood: "string",
  salesperson_desired_behaviors: "string[]",
  salesperson_undesired_behaviors: "string[]",
  salesperson_success_criteria: "string[]",
  salesperson_evaluation_rubric_criteria: "string[]",
  persona_voice_id: "integer",
  persona_voice_model_id: "string|null",
};

/** Opcionais: ausente ou `null` passam; presente, o tipo tem de bater. */
const OPTIONAL_TOP: Shape = {
  user_group_id: "integer",
  methodology_ids: "integer[]",
  difficulty_level_id: "integer",
};

export const SCENARIO_DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v);

const TYPE_LABEL: Record<FieldType, string> = {
  string: "texto",
  integer: "número inteiro",
  "string[]": "lista de textos",
  "integer[]": "lista de números inteiros",
  "string|null": "texto ou null",
};

function matches(value: unknown, type: FieldType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "integer[]":
      return Array.isArray(value) && value.every((v) => typeof v === "number" && Number.isInteger(v));
    case "string|null":
      return value === null || typeof value === "string";
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "lista";
  if (typeof value === "number") return Number.isInteger(value) ? "número" : "número com casas decimais";
  if (typeof value === "string") return "texto";
  if (typeof value === "boolean") return "verdadeiro/falso";
  return "objeto";
}

function shapeIssues(value: unknown, shape: Shape, path: string): string[] {
  if (value === undefined) return [`falta ${path} (obrigatório)`];
  if (!isObject(value)) return [`${path} deve ser um objeto (veio ${describe(value)})`];
  const issues: string[] = [];
  for (const [key, type] of Object.entries(shape)) {
    const v = value[key];
    if (v === undefined) issues.push(`falta ${path}.${key} (obrigatório)`);
    else if (!matches(v, type)) issues.push(`${path}.${key} deve ser ${TYPE_LABEL[type]} (veio ${describe(v)})`);
  }
  return issues;
}

/**
 * O que o `case_setup/create` de PROD recusaria com 422 neste payload. Vazio = a forma
 * passa. Mensagens em português, prontas para o `issues` do 422 do envio.
 */
export function caseSetupCreateIssues(payload: unknown): string[] {
  if (!isObject(payload)) return ["o payload do roleplay deve ser um objeto"];
  const issues: string[] = [];

  for (const [key, type] of Object.entries(REQUIRED_TOP)) {
    const v = payload[key];
    if (v === undefined) issues.push(`falta ${key} (obrigatório)`);
    else if (!matches(v, type)) issues.push(`${key} deve ser ${TYPE_LABEL[type]} (veio ${describe(v)})`);
  }
  for (const [key, type] of Object.entries(OPTIONAL_TOP)) {
    const v = payload[key];
    if (v != null && !matches(v, type)) issues.push(`${key} deve ser ${TYPE_LABEL[type]} (veio ${describe(v)})`);
  }

  const level = payload.scenario_difficulty_level;
  if (typeof level === "string" && !(SCENARIO_DIFFICULTY_LEVELS as readonly string[]).includes(level)) {
    issues.push(`scenario_difficulty_level deve ser easy, medium ou hard (veio "${level}")`);
  }

  const instructions = payload.buyer_agent_instructions;
  if (instructions === undefined) {
    issues.push("falta buyer_agent_instructions (obrigatório)");
  } else if (!Array.isArray(instructions)) {
    issues.push(`buyer_agent_instructions deve ser uma lista (veio ${describe(instructions)})`);
  } else {
    instructions.forEach((item, i) => {
      issues.push(...shapeIssues(item, AGENT_INSTRUCTIONS_SHAPE, `buyer_agent_instructions[${i}]`));
    });
  }

  issues.push(...shapeIssues(payload.company_profile, COMPANY_PROFILE_SHAPE, "company_profile"));
  issues.push(...shapeIssues(payload.persona_profile, PERSONA_PROFILE_SHAPE, "persona_profile"));
  return issues;
}
