import { describe, expect, it } from "vitest";
import { resolvePlaybookTaxonomy } from "./playbook-taxonomy.ts";

const contexts = [
  { id: 1, slug: "cold_call" },
  { id: 2, slug: "discovery" },
];
const methodologies = [{ id: 10, slug: "spin_selling" }];

describe("resolvePlaybookTaxonomy", () => {
  it("resolve os slugs para os ids da conta, sem aviso", () => {
    const out = resolvePlaybookTaxonomy(
      [{ id: "a", name: "Prospecção", call_context_slug: "cold_call", methodology_slug: "spin_selling" }],
      contexts,
      methodologies,
    );
    expect(out.byCallType.a).toEqual({ callContextTypeId: 1, methodologyId: 10 });
    expect(out.warnings).toEqual([]);
  });

  it("aceita hífen, caixa e acento no slug guardado", () => {
    const out = resolvePlaybookTaxonomy(
      [{ id: "a", name: "Prospecção", call_context_slug: "Cold-Call", methodology_slug: "SPIN Selling" }],
      contexts,
      methodologies,
    );
    expect(out.byCallType.a).toEqual({ callContextTypeId: 1, methodologyId: 10 });
  });

  it("slug que não existe na conta vira aviso com a etapa e o slug", () => {
    const out = resolvePlaybookTaxonomy(
      [{ id: "a", name: "Fechamento", call_context_slug: "fechamento", methodology_slug: "meddic" }],
      contexts,
      methodologies,
    );
    expect(out.byCallType.a).toEqual({ callContextTypeId: null, methodologyId: null });
    expect(out.warnings).toHaveLength(2);
    expect(out.warnings[0]).toContain('Etapa 1 (Fechamento)');
    expect(out.warnings[0]).toContain('"fechamento"');
    expect(out.warnings[1]).toContain('"meddic"');
  });

  it("etapa sem slug também avisa", () => {
    const out = resolvePlaybookTaxonomy(
      [{ id: "a", name: "Demo", call_context_slug: null, methodology_slug: "" }],
      contexts,
      methodologies,
    );
    expect(out.warnings).toEqual([
      "Etapa 1 (Demo): sem tipo de ligação — a etapa foi criada sem ele",
      "Etapa 1 (Demo): sem metodologia — a implementação pode pular esta etapa",
    ]);
  });
});
