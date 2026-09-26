import { describe, expect, it } from "vitest";
import {
  applyCaseSetupExtras,
  buildPersonaFromCaseSetup,
  difficultyLevelIdFor,
  matchMethodologySlug,
  MAX_API_TEXT_CHARS,
  type Methodology,
  personaPromptFromCasePrompt,
  truncateForApi,
} from "./perfecting.ts";

describe("truncateForApi", () => {
  it("devolve o texto intacto até o limite", () => {
    const text = "a".repeat(MAX_API_TEXT_CHARS);
    expect(truncateForApi(text)).toBe(text);
  });

  it("corta acima do limite e informa o tamanho original", () => {
    const text = "b".repeat(55_167);
    const out = truncateForApi(text);
    expect(out.startsWith("b".repeat(MAX_API_TEXT_CHARS))).toBe(true);
    expect(out).toContain("o original tem 55167 caracteres");
    expect(out.length).toBeLessThan(MAX_API_TEXT_CHARS + 100);
  });
});

describe("personaPromptFromCasePrompt", () => {
  it("corta no marcador de uso interno e tira o {{ref_token}}", () => {
    const casePrompt =
      "\nVocê é Marcos Oliveira, founder.\n\n### USO INTERNO (NÃO REVELAR AO USUÁRIO) ###\n{{ref_token}}";
    expect(personaPromptFromCasePrompt(casePrompt)).toBe("Você é Marcos Oliveira, founder.");
  });

  it("tira placeholders soltos no corpo", () => {
    expect(personaPromptFromCasePrompt("Olá {{nome_vendedor}}, tudo bem?")).toBe("Olá , tudo bem?");
  });

  it("devolve vazio sem case_prompt", () => {
    expect(personaPromptFromCasePrompt(null)).toBe("");
    expect(personaPromptFromCasePrompt("### USO INTERNO (NÃO REVELAR AO USUÁRIO) ###\n{{ref_token}}")).toBe("");
  });
});

describe("buildPersonaFromCaseSetup", () => {
  const caseSetup = {
    case_prompt: "Você é Marcos.\n\n### USO INTERNO (NÃO REVELAR AO USUÁRIO) ###\n{{ref_token}}",
    persona_profile: { name: " Marcos Oliveira ", job_title: "Founder", description: "Startup de tecnologia" },
    persona_voice_id: 2,
  };

  it("copia o comprador, sem voz, com o case_prompt como persona_prompt", () => {
    expect(buildPersonaFromCaseSetup(caseSetup, 160)).toEqual({
      context_id: 160,
      name: "Marcos Oliveira",
      job_title: "Founder",
      department: null,
      description: "Startup de tecnologia",
      persona_prompt: "Você é Marcos.",
      voice_id: null,
    });
  });

  it("aceita persona_profile serializado como string", () => {
    const out = buildPersonaFromCaseSetup(
      { ...caseSetup, persona_profile: JSON.stringify(caseSetup.persona_profile) },
      160,
    );
    expect(out?.name).toBe("Marcos Oliveira");
  });

  it("não monta persona sem case_prompt", () => {
    expect(buildPersonaFromCaseSetup({ ...caseSetup, case_prompt: null }, 160)).toBeNull();
  });
});

describe("difficultyLevelIdFor", () => {
  it("mapeia os três níveis legados", () => {
    expect(difficultyLevelIdFor("easy")).toBe(1);
    expect(difficultyLevelIdFor("medium")).toBe(2);
    expect(difficultyLevelIdFor("hard")).toBe(3);
  });

  it("ignora caixa e espaço", () => {
    expect(difficultyLevelIdFor(" Hard ")).toBe(3);
  });

  it("devolve undefined no desconhecido (melhor omitir que mandar id errado)", () => {
    expect(difficultyLevelIdFor("impossible")).toBeUndefined();
    expect(difficultyLevelIdFor(null)).toBeUndefined();
  });
});

describe("matchMethodologySlug", () => {
  const items: Methodology[] = [
    { id: 4, name: "SPIN Selling", slug: "spin_selling", description: "", application_case: "" },
    { id: 9, name: "Venda Consultiva", slug: "venda_consultiva", description: "", application_case: "" },
  ];

  it("acha pelo slug", () => {
    expect(matchMethodologySlug(items, "spin_selling")?.id).toBe(4);
  });

  it("normaliza acento e caixa (o slug vem do nome)", () => {
    expect(matchMethodologySlug(items, "Venda Consultiva")?.id).toBe(9);
  });

  it("slug de outro ambiente não casa — undefined, nunca um id qualquer", () => {
    expect(matchMethodologySlug(items, "challenger")).toBeUndefined();
    expect(matchMethodologySlug(items, "")).toBeUndefined();
  });
});

describe("applyCaseSetupExtras", () => {
  const base = { context_id: 12, training_name: "Ligação fria" };

  it("acrescenta metodologia e nível quando existem", () => {
    expect(applyCaseSetupExtras(base, { methodologyIds: [7], difficultyLevelId: 2 })).toEqual({
      ...base,
      methodology_ids: [7],
      difficulty_level_id: 2,
    });
  });

  it("omite as chaves quando não há o que mandar", () => {
    expect(applyCaseSetupExtras(base, {})).toEqual(base);
    expect(applyCaseSetupExtras(base, { methodologyIds: [] })).toEqual(base);
  });

  it("não deixa generateCasePrompt vazar para o payload", () => {
    expect(applyCaseSetupExtras(base, { generateCasePrompt: false })).toEqual(base);
  });
});
