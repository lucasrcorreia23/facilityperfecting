import { describe, expect, it } from "vitest";
import {
  buildPersonaFromCaseSetup,
  MAX_API_TEXT_CHARS,
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
