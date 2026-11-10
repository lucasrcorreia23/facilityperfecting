import { describe, expect, it } from "vitest";
import {
  findReusableCompany,
  guardrailKey,
  guardrailRemoteName,
  personaCompanySlug,
  pickFreeName,
  withNameMark,
} from "./remote-names.ts";

describe("guardrailRemoteName", () => {
  it("acrescenta o sufixo do contexto", () => {
    expect(guardrailRemoteName(" Sem página neste debate ", 412)).toBe("Sem página neste debate · ctx 412");
  });

  it("nunca passa de 255: corta o nome, não o sufixo", () => {
    const out = guardrailRemoteName("x".repeat(300), 99999);
    expect(out).toHaveLength(255);
    expect(out.endsWith(" · ctx 99999")).toBe(true);
  });
});

describe("guardrailKey", () => {
  it("casa o nome antigo (sem sufixo) com o novo (com sufixo) do mesmo contexto", () => {
    expect(guardrailKey("Não dar desconto", 35)).toBe(guardrailKey("não dar desconto · ctx 35", 35));
  });

  it("sufixo de outro contexto não é removido", () => {
    expect(guardrailKey("Não dar desconto · ctx 36", 35)).toBe("não dar desconto · ctx 36");
  });
});

describe("personaCompanySlug", () => {
  it("slug sem acento com o contexto no fim", () => {
    expect(personaCompanySlug("Cooperativa Vale Dourado Ltda.", 35)).toBe("cooperativa-vale-dourado-ltda-35");
  });

  it("cabe em 255 e sobrevive a nome sem letras", () => {
    expect(personaCompanySlug("a".repeat(400), 35).length).toBeLessThanOrEqual(255);
    expect(personaCompanySlug("???", 35)).toBe("empresa-35");
  });
});

describe("findReusableCompany", () => {
  const companies = [
    { id: 1, slug: "outra-35", name: "Outra" },
    { id: 2, slug: "antigo-formato", name: "Cooperativa Vale Dourado" },
  ];

  it("reusa pelo slug", () => {
    expect(findReusableCompany(companies, "Qualquer", "outra-35")?.id).toBe(1);
  });

  it("reusa pelo nome, sem caixa", () => {
    expect(findReusableCompany(companies, " cooperativa vale dourado ", "cooperativa-vale-dourado-35")?.id).toBe(2);
  });

  it("sem igual, não reusa", () => {
    expect(findReusableCompany(companies, "Nova", "nova-35")).toBeUndefined();
  });
});

describe("pickFreeName", () => {
  it("usa a base quando está livre", () => {
    expect(pickFreeName("Debate · Amizade", ["Outra"], "a1b2c3")).toBe("Debate · Amizade");
  });

  it("desambigua com a marca, e numera se a marca também já existe", () => {
    expect(pickFreeName("Debate · Amizade", ["debate · amizade"], "a1b2c3")).toBe("Debate · Amizade (a1b2c3)");
    expect(
      pickFreeName("Debate · Amizade", ["Debate · Amizade", "Debate · Amizade (a1b2c3)"], "a1b2c3"),
    ).toBe("Debate · Amizade (a1b2c3 2)");
  });

  it("respeita o teto cortando a base", () => {
    const out = pickFreeName("n".repeat(130), ["n".repeat(120)], "a1b2c3", 120);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(" (a1b2c3)")).toBe(true);
  });
});

describe("withNameMark", () => {
  it("corta a base para a marca caber", () => {
    const out = withNameMark("o".repeat(255), "abc123");
    expect(out).toHaveLength(255);
    expect(out.endsWith(" (abc123)")).toBe(true);
  });
});
