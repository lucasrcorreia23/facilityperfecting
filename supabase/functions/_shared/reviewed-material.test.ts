import { describe, expect, it } from "vitest";
import {
  appendReviewedMaterial,
  buildReviewedMaterialBlock,
  REVIEWED_LIMITS,
  REVIEWED_MATERIAL_HEADING,
  REVIEWED_MATERIAL_RULES,
  type ReviewedDraftRow,
} from "./reviewed-material.ts";
import { GENERATED_DESCRIPTION_TARGET, PLAYBOOK_GENERATION_LIMITS_PROMPT } from "./perfecting-limits.ts";

const draft = (over: Partial<ReviewedDraftRow> = {}): ReviewedDraftRow => ({
  id: "d1",
  title: "Plano Enterprise",
  generation_output: { perfil: "x" },
  scenario: {
    generation_mode: "playbook",
    persona_instructions: "Metade cética",
    aditional_instructions: "Cenário que o playbook ignora",
    objections: [{ titulo: "Preço alto", tipo: "preco", fala_exemplo: "Está caro", detalhes: "Sem verba", ceder_se: "Ver ROI em 6 meses" }],
    guardrails: [{ nome: "Sem desconto", instrucao: "Não aceite desconto acima de 10%" }],
    gap_answers: [
      { item: "Preço não informado", grupo: "Oferta", severidade: "critico", resposta: "R$ 1.200/mês", nao_se_aplica: false },
      { item: "Concorrentes", grupo: "Contexto", severidade: "opcional", resposta: "", nao_se_aplica: true },
    ],
  },
  offers: { offer_name: "Plano Enterprise", general_description: "Software de gestão, R$ 1.200/mês" },
  contexts: { target_notes: "Diretores financeiros de indústrias" },
  raw_text: "material cru do cliente",
  ...over,
});

describe("buildReviewedMaterialBlock", () => {
  it("leva os campos revisados e as respostas às lacunas, com o aviso de que prevalece", () => {
    const block = buildReviewedMaterialBlock([draft()]);
    expect(block.text).toContain(`=== ${REVIEWED_MATERIAL_HEADING} — prevalece sobre os documentos quando conflitar ===`);
    expect(block.text).toContain("## Rascunho 1: Plano Enterprise");
    expect(block.text).toContain("### Descrição da oferta\nSoftware de gestão, R$ 1.200/mês");
    expect(block.text).toContain("### Perfil do público (quem compra)\nDiretores financeiros de indústrias");
    expect(block.text).toContain("### Variação das personas\nMetade cética");
    expect(block.text).toContain("1. Preço alto\n   Fala do comprador: Está caro\n   Detalhes: Sem verba\n   O comprador cede se: Ver ROI em 6 meses");
    expect(block.text).toContain("1. Sem desconto\n   Instrução: Não aceite desconto acima de 10%");
    expect(block.text).toContain("1. [Oferta] Lacuna: Preço não informado\n   Resposta do operador: R$ 1.200/mês");
    expect(block.text).toContain("2. [Contexto] Lacuna: Concorrentes\n   Resposta do operador: NÃO SE APLICA");
    expect(block.truncated).toEqual([]);
    expect(block.used).toEqual([{ draft_id: "d1", chars: expect.any(Number), title: "Plano Enterprise" }]);
    expect(appendReviewedMaterial(" documentos ", block)).toBe(`documentos\n\n${block.text}`);
  });

  it("cenário só entra quando o rascunho é por metodologia", () => {
    expect(buildReviewedMaterialBlock([draft()]).text).not.toContain("Comportamento do cenário");
    const methodology = draft({ scenario: { generation_mode: "methodology", aditional_instructions: "Resiste até ver prova" } });
    expect(buildReviewedMaterialBlock([methodology]).text).toContain("### Comportamento do cenário\nResiste até ver prova");
  });

  it("descrição que é o material cru (rascunho não processado) fica de fora", () => {
    const unprocessed = draft({ generation_output: null });
    expect(buildReviewedMaterialBlock([unprocessed]).text).not.toContain("Descrição da oferta");
    const sameAsRaw = draft({ offers: { offer_name: "X", general_description: "material cru do cliente" } });
    expect(buildReviewedMaterialBlock([sameAsRaw]).text).not.toContain("Descrição da oferta");
  });

  it("sem rascunho, ou rascunho vazio, não gera bloco e o material segue intacto", () => {
    expect(buildReviewedMaterialBlock([])).toEqual({ text: "", truncated: [], used: [] });
    const empty = buildReviewedMaterialBlock([{ id: "d9", title: "Vazio", scenario: {}, offers: null, contexts: null }]);
    expect(empty.text).toBe("");
    expect(empty.used).toEqual([]);
    expect(empty.truncated).toEqual(['Rascunho "Vazio" (sem conteúdo revisado para incluir)']);
    expect(appendReviewedMaterial("documentos", empty)).toBe("documentos");
  });

  it("corta campo longo e avisa qual", () => {
    const long = draft({ contexts: { target_notes: "p".repeat(REVIEWED_LIMITS.longText + 500) } });
    const block = buildReviewedMaterialBlock([long]);
    expect(block.text).toContain("[…cortado: o original tem 12500 caracteres]");
    expect(block.truncated).toEqual(['Rascunho "Plano Enterprise": Perfil do público (quem compra)']);
  });

  it("respeita o teto total deixando rascunhos inteiros de fora, e o número máximo", () => {
    const big = (id: string) =>
      draft({
        id,
        title: id,
        offers: { offer_name: id, general_description: "o".repeat(REVIEWED_LIMITS.longText) },
        contexts: { target_notes: "p".repeat(REVIEWED_LIMITS.longText) },
      });
    const rows = ["a", "b", "c", "d", "e", "f"].map(big);
    const block = buildReviewedMaterialBlock(rows);
    expect(block.text.length).toBeLessThanOrEqual(REVIEWED_LIMITS.total + 400);
    expect(block.used.map((u) => u.draft_id)).toEqual(["a", "b", "c"]);
    expect(block.truncated).toContain(`Material revisado (só os ${REVIEWED_LIMITS.maxDrafts} primeiros rascunhos de 6)`);
    expect(block.truncated).toContain('Rascunho "d" (ficou de fora: o material revisado passou do tamanho máximo)');
    expect(block.text).not.toContain("## Rascunho 4");
  });
});

describe("regra do prompt", () => {
  it("diz que o revisado prevalece, não vira etapa e mantém os limites", () => {
    expect(REVIEWED_MATERIAL_RULES).toContain("REVISADO PREVALECE");
    expect(REVIEWED_MATERIAL_RULES).toContain("NÃO crie etapa nem subetapa");
    expect(REVIEWED_MATERIAL_RULES).toContain("limites da plataforma acima continuam valendo");
    // Os limites vêm de perfecting-limits e seguem no prompt: a regra só os reafirma.
    expect(PLAYBOOK_GENERATION_LIMITS_PROMPT).toContain(String(GENERATED_DESCRIPTION_TARGET));
  });
});
