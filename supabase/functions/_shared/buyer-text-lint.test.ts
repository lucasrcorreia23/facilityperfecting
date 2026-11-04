import { describe, expect, it } from "vitest";
import {
  dossierBuyerTextIssues,
  findReservedTerms,
  hasBlockingIssue,
  lintPriorFacts,
  objectionTexts,
  priorFactsOf,
} from "./buyer-text-lint.ts";

// Texto real da cola do 259 (FIESC Fase 3, PROD, 04/11/2026): o prévio do comprador
// copiado para o campo do representante, mais a frase escrita à mão.
const PREVIO_259 =
  "Esta é uma reunião on-line para o vendedor apresentar a proposta. Na visita presencial vocês chegaram juntos à conclusão de que o que mais pesa é a falta. Você recebeu a proposta por e-mail e quer ouvir o vendedor antes de levar adiante.";
const HESITACAO = "Você tem interesse na oferta mas apresenta hesitação pois precisa entender a narrativa de valor";

describe("findReservedTerms", () => {
  it("acusa a rubrica da objeção da Cláudia (jargão de orçamento, soa como avaliação)", () => {
    const issues = findReservedTerms(
      objectionTexts([
        {
          titulo: "O orçamento está comprometido",
          fala_exemplo: "Esse valor eu não tenho na rubrica da Educação hoje.",
          detalhes: "",
          ceder_se: "Se o vendedor perguntar como a rubrica é definida",
        },
      ]),
    );
    expect(issues.map((i) => i.onde)).toEqual([
      'objeção "O orçamento está comprometido" (fala_exemplo)',
      'objeção "O orçamento está comprometido" (ceder_se)',
    ]);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("casa sem acento e no plural; não confunde palavras comuns", () => {
    expect(findReservedTerms([{ onde: "x", text: "Deixa eu ver minhas RUBRICAS" }])).toHaveLength(1);
    const edital = findReservedTerms([{ onde: "x", text: "Critérios de Avaliação do edital" }]);
    expect(edital).toHaveLength(1);
    // Vocabulário de licitação: só avisa.
    expect(hasBlockingIssue(edital)).toBe(false);
    expect(
      findReservedTerms([
        { onde: "x", text: "Pagamento 30 dias após a nota fiscal; a avaliação dos alunos e o critério da prefeitura; na etapa seguinte" },
      ]),
    ).toEqual([]);
  });

  it("feedback e pontuação só avisam", () => {
    const issues = findReservedTerms([{ onde: "x", text: "Quero um feedback dos pais" }]);
    expect(issues).toHaveLength(1);
    expect(hasBlockingIssue(issues)).toBe(false);
  });
});

describe("lintPriorFacts", () => {
  it("barra o prévio do comprador e a direção de atuação", () => {
    const issues = lintPriorFacts([PREVIO_259, HESITACAO]);
    expect(hasBlockingIssue(issues)).toBe(true);
    const motivos = issues.map((i) => i.motivo).join(" | ");
    expect(motivos).toContain("você");
    expect(motivos).toContain("descreve a cena");
    expect(motivos).toContain("direção de atuação");
    expect(motivos).toContain("caracteres");
  });

  it("aceita fatos curtos e neutros, inclusive com nunca/deve", () => {
    expect(
      lintPriorFacts([
        "Na visita, concordou que o que mais pesa são as faltas",
        "Os exames atrasados já foram encaminhados",
        "Nunca contratou consultoria externa",
        "O orçamento deve fechar em novembro",
      ]),
    ).toEqual([]);
  });

  it("vazio é erro na criação, mas pode na edição", () => {
    expect(hasBlockingIssue(lintPriorFacts(["", "  "]))).toBe(true);
    expect(lintPriorFacts([], "x", { allowEmpty: true })).toEqual([]);
  });

  it("não barra fatos que parecem regra (revisão de 04/11)", () => {
    expect(
      lintPriorFacts([
        "A licitação não deve sair antes de março",
        "Essa é uma conta estratégica da regional",
        "Tem interesse em expandir para o Nordeste",
      ]),
    ).toEqual([]);
    expect(hasBlockingIssue(lintPriorFacts(["Tem interesse na proposta, mas quer prazo"]))).toBe(true);
  });

  it("mais de 6 itens só avisa", () => {
    const issues = lintPriorFacts(Array.from({ length: 7 }, (_, i) => `Fato ${i}`));
    expect(issues).toHaveLength(1);
    expect(issues[0].nivel).toBe("aviso");
  });
});

const dossier = (conhecimento: { previo: string; ja_sabe?: string[] }) => ({
  dores: [],
  persona: { prompt: "Gerente de RH.", dores: [] },
  conhecimento: { ...conhecimento, fatos: [] },
  abertura: ["Bom dia."],
});

describe("priorFactsOf", () => {
  it("usa o ja_sabe quando existe", () => {
    expect(priorFactsOf(dossier({ previo: PREVIO_259, ja_sabe: [" Recebeu a proposta ", ""] }))).toEqual([
      "Recebeu a proposta",
    ]);
  });

  it("rascunho antigo: o prévio só passa se já for fato neutro", () => {
    expect(priorFactsOf(dossier({ previo: PREVIO_259 }))).toEqual([]);
    expect(priorFactsOf(dossier({ previo: "Recebeu o e-mail de resumo" }))).toEqual(["Recebeu o e-mail de resumo"]);
  });

  it("dossiê antigo com prévio na voz do comprador é barrado", () => {
    expect(hasBlockingIssue(dossierBuyerTextIssues(dossier({ previo: PREVIO_259 })))).toBe(true);
    expect(dossierBuyerTextIssues(dossier({ previo: PREVIO_259, ja_sabe: ["Recebeu a proposta"] }))).toEqual([]);
  });
});
