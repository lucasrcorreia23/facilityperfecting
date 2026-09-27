import { describe, expect, it } from "vitest";
import { buildSchema, buildSystem, PART_NOTES, PARTS_FOR_MODE } from "./schema.ts";

describe("buildSystem", () => {
  it("acrescenta a data de hoje mesmo com prompt personalizado", () => {
    const system = buildSystem([], [], "prompt do usuário", new Date("2026-09-13T12:00:00Z"));
    expect(system.startsWith("prompt do usuário")).toBe(true);
    expect(system).toContain("DATA DE HOJE: 13/09/2026");
  });
});

describe("buildSchema", () => {
  it("pede oferta_descricao na fatia core, que roda nos dois modos", () => {
    const core = buildSchema(["cold_call"], ["preco"], "core");
    expect(core.required).toContain("oferta_descricao");
    expect(Object.keys(core.properties)).toContain("oferta_descricao");
    expect(PARTS_FOR_MODE.playbook).toContain("core");
  });
});

describe("fatia do dossiê", () => {
  it("só roda por metodologia e traz a nota que libera o lado do vendedor", () => {
    expect(PARTS_FOR_MODE.methodology).toContain("dossier_buyer");
    expect(PARTS_FOR_MODE.methodology).toContain("dossier_context");
    expect(PARTS_FOR_MODE.playbook).not.toContain("dossier_buyer");
    const schema = buildSchema(["cold_call"], ["preco"], "dossier_buyer");
    expect(Object.keys(schema.properties)).toEqual(["dossie"]);
    expect(PART_NOTES.dossier_buyer).toContain("lado do vendedor");
    expect(PART_NOTES.dossier_context).toContain("lado do vendedor");
  });
});

describe("dossiê: cada dado no lado certo", () => {
  const buyer = (buildSchema(["cold_call"], ["preco"], "dossier_buyer").properties as Record<string, any>).dossie;
  const context = (buildSchema(["cold_call"], ["preco"], "dossier_context").properties as Record<string, any>).dossie;
  const dossie = { properties: { ...buyer.properties, ...context.properties } };
  const persona = dossie.properties.persona.properties;

  it("faturamento vai para o briefing do vendedor, nunca para o perfil da empresa", () => {
    expect(persona.empresa_perfil.description).toContain("NUNCA faturamento");
    expect(dossie.properties.conhecimento.properties.briefing.description).toContain("faturamento");
  });

  it("o prompt do comprador não leva o resultado do vendedor", () => {
    expect(persona.prompt.description).toContain("PROIBIDO");
    expect(persona.prompt.description).toContain("'vitória'");
    expect(PART_NOTES.dossier_buyer).toContain("vitória");
  });

  it("dor em 3ª pessoa, fatos com etapa e rubrica de oferta só quando cabe", () => {
    expect(persona.dores.items.properties.detalhe.description).toContain("3ª pessoa");
    const fato = dossie.properties.conhecimento.properties.fatos.items;
    expect(fato.required).toContain("etapa");
    expect(dossie.properties.rubricas.description).toContain("NÃO cobre oferta");
  });
});

describe("fatias", () => {
  const all = (mode: "playbook" | "methodology") =>
    PARTS_FOR_MODE[mode].flatMap((p) => Object.keys(buildSchema(["cold_call"], ["preco"], p).properties));

  it("o perfil tem fatia própria e continua nos dois modos", () => {
    expect(PARTS_FOR_MODE.playbook).toContain("profile");
    expect(Object.keys(buildSchema(["cold_call"], ["preco"], "profile").properties)).toEqual(["perfil"]);
  });

  it("dividir não perde campo: as fatias da metodologia cobrem o schema inteiro", () => {
    const full = Object.keys(buildSchema(["cold_call"], ["preco"]).properties);
    expect(new Set(all("methodology"))).toEqual(new Set(full));
  });

  it("as metades do dossiê juntas são o dossiê inteiro, e o que se referencia fica junto", () => {
    const half = (p: "dossier_buyer" | "dossier_context") =>
      (buildSchema(["cold_call"], ["preco"], p).properties as Record<string, any>).dossie;
    const whole = (buildSchema(["cold_call"], ["preco"]).properties as Record<string, any>).dossie;
    expect([...half("dossier_buyer").required, ...half("dossier_context").required].sort())
      .toEqual([...whole.required].sort());
    expect(half("dossier_buyer").required).toEqual(["produtos", "dores", "persona"]);
  });
});
