import { describe, expect, it } from "vitest";
import { buildDebateSchema, debateAnchorsBlock, parseDebateAnchors } from "./debate-prompt.ts";

const RAW = {
  obra: " Filhos do Sol ",
  tema: "Terceirização da culpa",
  mocao: "Quem culpa os outros não melhora.",
  lado_aluno: "contra",
  oponente_nome: "Manuela",
  oponente_idade: 14,
  oponente_genero: "feminino",
};

describe("âncoras do debate", () => {
  it("aceita as âncoras completas e limpa espaços", () => {
    expect(parseDebateAnchors(RAW)).toMatchObject({ obra: "Filhos do Sol", lado_aluno: "contra", oponente_idade: 14 });
  });

  it("recusa âncora faltando ou inválida", () => {
    expect(parseDebateAnchors({ ...RAW, mocao: " " })).toBeNull();
    expect(parseDebateAnchors({ ...RAW, lado_aluno: "talvez" })).toBeNull();
    expect(parseDebateAnchors({ ...RAW, oponente_idade: 3 })).toBeNull();
    expect(parseDebateAnchors(null)).toBeNull();
  });

  it("o bloco fixo diz os dois lados e lista as etapas na ordem", () => {
    const block = debateAnchorsBlock(parseDebateAnchors(RAW)!, [{ name: "Prova" }, { name: "Raciocínio" }]);
    expect(block).toContain("O aluno CONTESTA a moção. A oponente SUSTENTA a moção.");
    expect(block).toContain("1. Prova\n2. Raciocínio");
    expect(block).toContain("uma estudante de 14 anos");
  });
});

describe("schema do debate", () => {
  it("a fatia de etapas só aceita as ordens que existem", () => {
    const schema = buildDebateSchema("debate_steps", 6) as {
      properties: { etapas: { items: { properties: { ordem: { enum: number[] } } } } };
    };
    expect(schema.properties.etapas.items.properties.ordem.enum).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
