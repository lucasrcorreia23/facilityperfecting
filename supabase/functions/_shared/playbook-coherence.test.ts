import { describe, expect, it } from "vitest";
import { buildSentSnapshot, sentFieldsFor } from "./generation-diff.ts";
import {
  buildCoherencePayload,
  COHERENCE_DRAFT_FIELDS,
  COHERENCE_LIMITS,
  COHERENCE_SCHEMA,
  type CoherenceDraftInput,
  type CoherencePlaybookInput,
  coherenceSignature,
  countBySeverity,
  createCoherenceCache,
  parseCoherenceResponse,
  sortDivergences,
} from "./playbook-coherence.ts";

const objection = (titulo: string, over: Record<string, unknown> = {}) => ({
  titulo,
  tipo: "preco",
  fala_exemplo: "Está caro para o que entrega",
  detalhes: "Compara com o concorrente",
  ceder_se: "mostrar o retorno em 6 meses",
  ...over,
});

const draft = (over: Partial<CoherenceDraftInput> = {}): CoherenceDraftInput => ({
  oferta_nome: "Plano Empresa",
  oferta_descricao: "Assinatura anual de R$ 12.000, com implantação em 30 dias.",
  perfil: "Diretores de operações de indústrias médias.",
  personas_variacao: "Variar porte e maturidade digital.",
  objecoes: [objection("Preço alto")],
  guardrails: [{ nome: "Sem desconto", instrucao: "O comprador nunca pede desconto acima de 10%." }],
  ...over,
});

const block = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  description: `Descrição de ${name}`,
  objective: `Objetivo de ${name}`,
  sample_questions: ["Como vocês decidem hoje?"],
  what_to_do: ["Confirmar o orçamento"],
  what_to_avoid: ["Falar de preço antes da dor"],
  order: id,
  parent_call_block_id: null,
  ...over,
});

const playbook = (over: Partial<CoherencePlaybookInput> = {}): CoherencePlaybookInput => ({
  name: "Jornada B2B",
  callTypes: [
    { id: 20, name: "Fechamento", description: "Negociar e fechar", order: 2, blocks: [block(3, "Proposta")] },
    {
      id: 10,
      name: "Descoberta",
      description: "Entender a dor",
      order: 1,
      blocks: [block(2, "Orçamento", { order: 2 }), block(1, "Abertura", { order: 1 })],
    },
  ],
  ...over,
});

describe("campos do rascunho", () => {
  it("são exatamente os que chegam à conta no modo playbook", () => {
    expect(COHERENCE_DRAFT_FIELDS).toEqual(sentFieldsFor("playbook"));
  });

  it("o schema aceita só esses campos", () => {
    expect(COHERENCE_SCHEMA.properties.divergencias.items.properties.rascunho_campo.enum).toEqual(
      COHERENCE_DRAFT_FIELDS.map((f) => f.key),
    );
  });

  it("um SentSnapshot serve de entrada, e o que não chega no modo playbook fica de fora", () => {
    const snapshot = buildSentSnapshot({
      scenario: {
        generation_mode: "playbook",
        persona_instructions: "Variar porte",
        objective: "OBJETIVO-SECRETO",
        aditional_instructions: "CENARIO-SECRETO",
        skill: "HABILIDADE-SECRETA",
        objections: [objection("Preço alto")],
      },
      offers: { offer_name: "Plano Empresa", general_description: "Descrição" },
      contexts: { target_notes: "Perfil" },
    });
    const { text } = buildCoherencePayload(snapshot, playbook());
    expect(text).toContain("Variar porte");
    expect(text).toContain("Preço alto");
    expect(text).not.toMatch(/SECRET/);
  });
});

describe("buildCoherencePayload", () => {
  it("leva os seis campos do rascunho com a chave que a IA deve devolver", () => {
    const { text, truncated, stats } = buildCoherencePayload(draft(), playbook());
    for (const { key, label } of COHERENCE_DRAFT_FIELDS) {
      expect(text).toContain(`## ${label} [campo: ${key}]`);
    }
    expect(text).toContain("R$ 12.000");
    expect(text).toContain("1. Preço alto (tipo: preco)");
    expect(text).toContain("O comprador cede se: mostrar o retorno em 6 meses");
    expect(text).toContain("1. Sem desconto");
    expect(text).toContain("Instrução: O comprador nunca pede desconto acima de 10%.");
    expect(truncated).toEqual([]);
    expect(stats).toEqual({ callTypes: 2, blocks: 3, objections: 1, guardrails: 1 });
  });

  it("leva etapas e subetapas na ordem do playbook, com tudo o que a nota cobra", () => {
    const { text } = buildCoherencePayload(draft(), playbook());
    expect(text).toContain('# PLAYBOOK "Jornada B2B"');
    const at = (s: string) => {
      const i = text.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    expect(at("## Etapa 1: Descoberta")).toBeLessThan(at("### Subetapa 1.1: Abertura"));
    expect(at("### Subetapa 1.1: Abertura")).toBeLessThan(at("### Subetapa 1.2: Orçamento"));
    expect(at("### Subetapa 1.2: Orçamento")).toBeLessThan(at("## Etapa 2: Fechamento"));
    expect(text).toContain("Objetivo: Objetivo de Proposta");
    expect(text).toContain("Perguntas de exemplo:\n- Como vocês decidem hoje?");
    expect(text).toContain("O que fazer:\n- Confirmar o orçamento");
    expect(text).toContain("O que evitar:\n- Falar de preço antes da dor");
  });

  it("marca a subetapa que mora dentro de outra", () => {
    const pb = playbook({
      callTypes: [
        {
          id: 1,
          name: "Descoberta",
          blocks: [block(1, "Abertura"), block(2, "Quebra-gelo", { parent_call_block_id: 1 })],
        },
      ],
    });
    expect(buildCoherencePayload(draft(), pb).text).toContain(
      '### Subetapa 1.2: Quebra-gelo (dentro de "Abertura")',
    );
  });

  it("campo vazio e etapa sem subetapas ficam explícitos", () => {
    const pb = playbook({ callTypes: [{ id: 1, name: "Descoberta", description: null, blocks: [] }] });
    const { text } = buildCoherencePayload(draft({ personas_variacao: "", objecoes: [], guardrails: [] }), pb);
    expect(text).toContain("## Variação das personas [campo: personas_variacao]\n(vazio)");
    expect(text).toContain("## Objeções [campo: objecoes]\n(vazio)");
    expect(text).toContain("(etapa sem subetapas");
  });

  it("corta a descrição grande (o material inteiro) e avisa", () => {
    const big = "x".repeat(COHERENCE_LIMITS.longText + 5_000);
    const { text, truncated } = buildCoherencePayload(draft({ oferta_descricao: big }), playbook());
    expect(truncated).toEqual(["Descrição da oferta"]);
    expect(text).toContain(`[…cortado: o original tem ${big.length} caracteres]`);
    expect(text).not.toContain("x".repeat(COHERENCE_LIMITS.longText + 1));
  });

  it("limita a quantidade de objeções e o tamanho de cada campo", () => {
    const many = Array.from({ length: COHERENCE_LIMITS.listItems + 3 }, (_, i) => objection(`Objeção ${i + 1}`));
    many[0] = objection("Longa", { detalhes: "d".repeat(COHERENCE_LIMITS.listItemField + 1) });
    const { text, truncated } = buildCoherencePayload(draft({ objecoes: many }), playbook());
    expect(text).toContain(`${COHERENCE_LIMITS.listItems}. Objeção ${COHERENCE_LIMITS.listItems}`);
    expect(text).not.toContain(`Objeção ${COHERENCE_LIMITS.listItems + 1}`);
    expect(truncated).toEqual([
      `Objeções (só as ${COHERENCE_LIMITS.listItems} primeiras de ${many.length})`,
      "Objeções",
    ]);
  });

  it("playbook acima do teto: as subetapas do fim ficam só com o nome", () => {
    const fat = (id: number) =>
      block(id, `Bloco ${id}`, {
        description: "a".repeat(COHERENCE_LIMITS.blockText),
        objective: "b".repeat(COHERENCE_LIMITS.blockText),
        what_to_do: Array.from({ length: COHERENCE_LIMITS.blockListItems }, () => "c".repeat(COHERENCE_LIMITS.blockListItem)),
      });
    const count = 20;
    const pb = playbook({
      callTypes: [{ id: 1, name: "Longa", blocks: Array.from({ length: count }, (_, i) => fat(i + 1)) }],
    });
    const { text, truncated, stats } = buildCoherencePayload(draft(), pb);
    expect(stats.blocks).toBe(count);
    expect(truncated).toContain("Playbook (subetapas do fim só com o nome)");
    expect(text).toContain(`### Subetapa 1.${count}: Bloco ${count} (detalhe omitido por limite de tamanho)`);
    expect(text).toContain("### Subetapa 1.1: Bloco 1\nDescrição:");
    // Teto + no máximo uma subetapa de folga + o rascunho.
    expect(text.length).toBeLessThan(COHERENCE_LIMITS.playbookTotal + 20_000);
  });

  it("lista longa de uma subetapa é cortada e a etapa aparece no aviso", () => {
    const pb = playbook({
      callTypes: [
        {
          id: 1,
          name: "Descoberta",
          blocks: [
            block(1, "Abertura", {
              sample_questions: Array.from({ length: COHERENCE_LIMITS.blockListItems + 2 }, (_, i) => `Pergunta ${i + 1}?`),
            }),
          ],
        },
      ],
    });
    const { text, truncated } = buildCoherencePayload(draft(), pb);
    expect(text).toContain(`Pergunta ${COHERENCE_LIMITS.blockListItems}?`);
    expect(text).not.toContain(`Pergunta ${COHERENCE_LIMITS.blockListItems + 1}?`);
    expect(truncated).toEqual(['Etapa "Descoberta"']);
  });
});

const item = (over: Record<string, unknown> = {}) => ({
  severidade: "conflito",
  rascunho_campo: "oferta_descricao",
  rascunho_trecho: "Assinatura anual de R$ 12.000",
  playbook_etapa: "Fechamento",
  playbook_subetapa: "Proposta",
  playbook_trecho: "Apresentar o plano de R$ 9.000",
  explicacao: "O preço do rascunho é diferente do preço que a subetapa manda apresentar.",
  corrigir_em: "playbook",
  sugestao: "Atualizar o valor na subetapa Proposta.",
  ...over,
});

describe("parseCoherenceResponse", () => {
  it("lê a resposta (texto ou objeto) no formato da tela", () => {
    const expected = [
      {
        severity: "conflito",
        draft: { field: "oferta_descricao", label: "Descrição da oferta", quote: "Assinatura anual de R$ 12.000" },
        playbook: { callType: "Fechamento", block: "Proposta", quote: "Apresentar o plano de R$ 9.000" },
        explanation: "O preço do rascunho é diferente do preço que a subetapa manda apresentar.",
        fixIn: "playbook",
        suggestion: "Atualizar o valor na subetapa Proposta.",
      },
    ];
    expect(parseCoherenceResponse({ divergencias: [item()] })).toEqual(expected);
    expect(parseCoherenceResponse(JSON.stringify({ divergencias: [item()] }))).toEqual(expected);
  });

  it("lista vazia é 'sem divergência', não erro", () => {
    expect(parseCoherenceResponse({ divergencias: [] })).toEqual([]);
  });

  it("resposta fora do formato é falha da checagem", () => {
    expect(() => parseCoherenceResponse('{"divergencias": [')).toThrow("incompleta");
    expect(() => parseCoherenceResponse({})).toThrow("sem a lista");
    expect(() => parseCoherenceResponse(null)).toThrow("sem a lista");
    expect(() => parseCoherenceResponse({ divergencias: "nenhuma" })).toThrow("sem a lista");
  });

  it("descarta item sem severidade válida, sem campo conhecido ou sem explicação", () => {
    const out = parseCoherenceResponse({
      divergencias: [
        item({ severidade: "grave" }),
        item({ rascunho_campo: "objetivo" }),
        item({ explicacao: "  " }),
        null,
        "texto",
        item({ explicacao: "Válido." }),
      ],
    });
    expect(out.map((d) => d.explanation)).toEqual(["Válido."]);
  });

  it("aceita 'Atenção' com acento e caixa; corrigir_em desconhecido cai no rascunho", () => {
    const [d] = parseCoherenceResponse({ divergencias: [item({ severidade: "Atenção", corrigir_em: "ambos" })] });
    expect(d.severity).toBe("atencao");
    expect(d.fixIn).toBe("rascunho");
  });

  it("ordena conflito antes de atenção, mantendo a ordem da IA em cada grupo", () => {
    const out = parseCoherenceResponse({
      divergencias: [
        item({ severidade: "atencao", explicacao: "A1" }),
        item({ severidade: "conflito", explicacao: "C1" }),
        item({ severidade: "atencao", explicacao: "A2" }),
        item({ severidade: "conflito", explicacao: "C2" }),
      ],
    });
    expect(out.map((d) => d.explanation)).toEqual(["C1", "C2", "A1", "A2"]);
    expect(countBySeverity(out)).toEqual({ conflito: 2, atencao: 2 });
  });

  it("fica com no máximo 10, e o corte nunca tira conflito para deixar atenção", () => {
    const list = [
      ...Array.from({ length: 9 }, (_, i) => item({ severidade: "atencao", explicacao: `A${i}` })),
      ...Array.from({ length: 4 }, (_, i) => item({ severidade: "conflito", explicacao: `C${i}` })),
    ];
    const out = parseCoherenceResponse({ divergencias: list });
    expect(out).toHaveLength(COHERENCE_LIMITS.maxDivergences);
    expect(countBySeverity(out)).toEqual({ conflito: 4, atencao: 6 });
  });

  it("encurta citação longa, tira as aspas da IA e remove item repetido", () => {
    const long = "p".repeat(COHERENCE_LIMITS.quote + 50);
    const out = parseCoherenceResponse({
      divergencias: [item({ rascunho_trecho: `"${long}"`, playbook_trecho: "“Apresentar o plano”" }), item()],
    });
    expect(out).toHaveLength(1);
    expect(out[0].draft.quote).toHaveLength(COHERENCE_LIMITS.quote);
    expect(out[0].draft.quote.endsWith("…")).toBe(true);
    expect(out[0].draft.quote.startsWith("p")).toBe(true);
    expect(out[0].playbook.quote).toBe("Apresentar o plano");
  });

  it("lacuna: trecho e subetapa vazios são válidos", () => {
    const [d] = parseCoherenceResponse({
      divergencias: [item({ severidade: "atencao", rascunho_trecho: "", playbook_subetapa: "" })],
    });
    expect(d.draft.quote).toBe("");
    expect(d.playbook.block).toBe("");
  });
});

describe("sortDivergences", () => {
  it("não muda a lista de entrada", () => {
    const input = parseCoherenceResponse({ divergencias: [item({ severidade: "atencao" })] });
    const copy = [...input];
    sortDivergences(input);
    expect(input).toEqual(copy);
  });
});

describe("coherenceSignature", () => {
  const base = { connectionId: "c1", playbookId: 7, draft: draft() };

  it("é a mesma para o mesmo rascunho, ignorando espaço nas pontas e chaves extras", () => {
    const same = coherenceSignature({
      ...base,
      draft: {
        ...draft({ perfil: "  Diretores de operações de indústrias médias.  " }),
        objecoes: [{ ...objection("Preço alto"), id: "local-1" }],
        // Campos que não chegam à conta no modo playbook não contam.
        ...({ objetivo: "outro", cenario_instrucoes: "outro" } as object),
      },
    });
    expect(same).toBe(coherenceSignature(base));
  });

  it.each([
    ["conta", { connectionId: "c2" }],
    ["playbook", { playbookId: 8 }],
    ["descrição", { draft: draft({ oferta_descricao: "Assinatura anual de R$ 15.000." }) }],
    ["objeção editada", { draft: draft({ objecoes: [objection("Preço alto", { ceder_se: "desconto de 20%" })] }) }],
    ["objeção removida", { draft: draft({ objecoes: [] }) }],
    ["regra editada", { draft: draft({ guardrails: [{ nome: "Sem desconto", instrucao: "Pode pedir 15%." }] }) }],
  ])("muda quando muda %s", (_, over) => {
    expect(coherenceSignature({ ...base, ...over })).not.toBe(coherenceSignature(base));
  });
});

describe("createCoherenceCache", () => {
  const result = { divergences: [], truncated: [], stats: { callTypes: 1, blocks: 1, objections: 0, guardrails: 0 } };

  it("devolve o resultado da mesma assinatura dentro do prazo", () => {
    let t = 0;
    const cache = createCoherenceCache(1_000, () => t);
    expect(cache.get("a")).toBeNull();
    cache.set("a", result);
    t = 999;
    expect(cache.get("a")).toBe(result);
  });

  it("não reusa depois do prazo nem para outra assinatura", () => {
    let t = 0;
    const cache = createCoherenceCache(1_000, () => t);
    cache.set("a", result);
    expect(cache.get("b")).toBeNull();
    t = 1_000;
    expect(cache.get("a")).toBeNull();
  });

  it("guarda só a checagem mais recente", () => {
    const cache = createCoherenceCache(1_000, () => 0);
    cache.set("a", result);
    cache.set("b", result);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe(result);
  });
});
