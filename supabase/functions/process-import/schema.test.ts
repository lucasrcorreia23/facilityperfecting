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
    expect(PARTS_FOR_MODE.methodology).toContain("dossier");
    expect(PARTS_FOR_MODE.playbook).not.toContain("dossier");
    const schema = buildSchema(["cold_call"], ["preco"], "dossier");
    expect(Object.keys(schema.properties)).toEqual(["dossie"]);
    expect(PART_NOTES.dossier).toContain("lado do vendedor");
  });
});
