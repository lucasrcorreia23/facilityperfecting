import { describe, expect, it } from "vitest";
import {
  appendGapAnswers,
  buildGapAnswersBlock,
  GAP_ANSWER_LIMITS,
  GAP_ANSWERS_HEADING,
  gapKey,
  mergeGapAnswers,
  openGaps,
  sanitizeGapAnswers,
} from "./gap-answers.ts";

const answer = (item: string, resposta: string, extra: Record<string, unknown> = {}) => ({
  item,
  grupo: "Oferta",
  severidade: "critico",
  resposta,
  nao_se_aplica: false,
  ...extra,
});

describe("gapKey", () => {
  it("ignora caixa, acento e pontuação, e não depende do grupo", () => {
    expect(gapKey({ item: "Preço não informado." })).toBe(gapKey({ item: "  preco NAO informado" }));
    expect(gapKey({ item: "Preço" })).not.toBe(gapKey({ item: "Prazo" }));
  });
});

describe("sanitizeGapAnswers", () => {
  it("descarta o que não tem lacuna ou resposta", () => {
    expect(
      sanitizeGapAnswers([
        answer("", "x"),
        answer("Preço", "   "),
        null,
        "texto",
        answer("Prazo", "30 dias"),
      ]),
    ).toEqual([{ item: "Prazo", grupo: "Oferta", severidade: "critico", resposta: "30 dias", nao_se_aplica: false }]);
    expect(sanitizeGapAnswers("nada")).toEqual([]);
  });

  it("aceita 'não se aplica' sem texto e zera a resposta", () => {
    const [a] = sanitizeGapAnswers([answer("Concorrentes", "ignorado", { nao_se_aplica: true })]);
    expect(a).toMatchObject({ nao_se_aplica: true, resposta: "" });
  });

  it("fica com a última resposta de cada lacuna e corta nos limites", () => {
    const out = sanitizeGapAnswers([
      answer("Preço", "R$ 100"),
      answer("Prazo", "30 dias"),
      answer("preço.", "R$ 200"),
      answer("Longa", "x".repeat(GAP_ANSWER_LIMITS.answer + 50)),
    ]);
    expect(out.map((a) => a.resposta.slice(0, 6))).toEqual(["30 dia", "R$ 200", "xxxxxx"]);
    expect(out[2].resposta).toHaveLength(GAP_ANSWER_LIMITS.answer);
  });

  it("severidade desconhecida vira 'importante'", () => {
    expect(sanitizeGapAnswers([answer("Preço", "x", { severidade: "urgente" })])[0].severidade).toBe("importante");
  });
});

describe("mergeGapAnswers", () => {
  it("acumula entre rodadas e a resposta nova substitui a antiga", () => {
    const merged = mergeGapAnswers([answer("Preço", "R$ 100"), answer("Prazo", "30 dias")], [answer("Preço", "R$ 150")]);
    expect(merged.map((a) => `${a.item}=${a.resposta}`)).toEqual(["Prazo=30 dias", "Preço=R$ 150"]);
  });
});

describe("openGaps", () => {
  it("tira as respondidas (mesmo com outro grupo) e as repetidas", () => {
    const gaps = [
      { item: "Preço não informado", grupo: "Contexto", severidade: "critico" as const },
      { item: "Ciclo de venda", grupo: "Oferta", severidade: "opcional" as const },
      { item: "ciclo de venda.", grupo: "Oferta", severidade: "opcional" as const },
    ];
    expect(openGaps(gaps, sanitizeGapAnswers([answer("preço não informado", "R$ 100")]))).toEqual([gaps[1]]);
    expect(openGaps(null, [])).toEqual([]);
  });
});

describe("buildGapAnswersBlock", () => {
  it("sem resposta não gera bloco e o material segue intacto", () => {
    const block = buildGapAnswersBlock([]);
    expect(block).toEqual({ text: "", count: 0, truncated: [] });
    expect(appendGapAnswers("material", block)).toBe("material");
  });

  it("monta o bloco numerado, com grupo, resposta e 'não se aplica'", () => {
    const block = buildGapAnswersBlock([
      answer("Preço não informado", "R$ 1.200 por mês, contrato anual"),
      answer("Concorrentes", "", { grupo: "Contexto", nao_se_aplica: true }),
    ]);
    expect(block.count).toBe(2);
    expect(block.truncated).toEqual([]);
    expect(block.text).toContain(`=== ${GAP_ANSWERS_HEADING} ===`);
    expect(block.text).toContain("Prevalece sobre o material acima");
    expect(block.text).toContain("1. [Oferta] Lacuna: Preço não informado\n   Resposta do operador: R$ 1.200 por mês, contrato anual");
    expect(block.text).toContain("2. [Contexto] Lacuna: Concorrentes\n   Resposta do operador: NÃO SE APLICA");
    expect(appendGapAnswers("  material  ", block)).toBe(`material\n\n${block.text}`);
  });

  it("acima do número máximo fica com as mais recentes e avisa", () => {
    const many = Array.from({ length: GAP_ANSWER_LIMITS.maxAnswers + 3 }, (_, i) => answer(`Lacuna ${i}`, `r${i}`));
    const block = buildGapAnswersBlock(many);
    expect(block.count).toBe(GAP_ANSWER_LIMITS.maxAnswers);
    expect(block.text).not.toContain("Lacuna: Lacuna 2\n");
    expect(block.text).toContain("Lacuna: Lacuna 3\n");
    expect(block.truncated[0]).toContain(`só as ${GAP_ANSWER_LIMITS.maxAnswers} mais recentes`);
  });

  it("respeita o teto total cortando as mais antigas, nunca uma resposta ao meio", () => {
    const long = "y".repeat(GAP_ANSWER_LIMITS.answer);
    const many = Array.from({ length: 20 }, (_, i) => answer(`Ponto ${i}`, long));
    const block = buildGapAnswersBlock(many);
    expect(block.text.length).toBeLessThanOrEqual(GAP_ANSWER_LIMITS.total);
    expect(block.count).toBeLessThan(20);
    expect(block.count).toBeGreaterThan(0);
    // A mais nova fica; a mais antiga sai; as que ficam estão inteiras e renumeradas.
    expect(block.text).toContain("Lacuna: Ponto 19\n");
    expect(block.text).not.toContain("Lacuna: Ponto 0\n");
    expect(block.text).toContain(`1. [Oferta] Lacuna: Ponto ${20 - block.count}\n`);
    expect(block.text.endsWith(long)).toBe(true);
    expect(block.truncated[0]).toContain("ficaram de fora por tamanho");
  });
});
