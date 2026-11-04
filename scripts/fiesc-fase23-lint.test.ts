import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasBlockingIssue } from "../supabase/functions/_shared/buyer-text-lint.ts";
import { objectionTextPatch, type StageText, stageTextIssues } from "./fiesc-fase23-lint.ts";

type Spec = { contas: Array<{ key: string; fases: Record<string, StageText> }> };
const issuesOf = (spec: Spec) =>
  spec.contas.flatMap((c) => Object.entries(c.fases).flatMap(([st, f]) => stageTextIssues(f, `${c.key}.${st}`)));

describe("spec das Fases 2/3", () => {
  for (const file of ["fase23-spec.json", "fase23-spec.prod.json"]) {
    it(`${file} passa no lint de texto do comprador`, () => {
      const spec = JSON.parse(readFileSync(new URL(`../docs/FIESC-B2G/${file}`, import.meta.url), "utf8")) as Spec;
      expect(issuesOf(spec).filter((i) => i.nivel === "erro")).toEqual([]);
    });
  }

  it("o texto que criou 259/270/272 (30/10) seria barrado", () => {
    // Trechos do spec de 9f3d3de, inline para não depender do histórico do git.
    const old: Spec = {
      contas: [
        {
          key: "vila-serena",
          fases: {
            fase3: {
              previo: "Esta é uma reunião on-line para o representante do SESI apresentar a proposta.",
              fatos: {},
              abertura: ["Bom dia."],
              objecoes: [
                {
                  titulo: "O orçamento está comprometido",
                  fala_exemplo: "Esse valor eu não tenho na rubrica da Educação hoje.",
                  detalhes: "O orçamento do ano que vem está sendo fechado agora.",
                  ceder_se: "Se o vendedor perguntar como a rubrica é definida e quando fecha.",
                },
              ],
            },
          },
        },
        {
          key: "trico-vallery",
          fases: { fase3: { previo: "Você recebeu a proposta por e-mail.", fatos: {}, abertura: [], objecoes: [] } },
        },
      ],
    };
    const issues = issuesOf(old);
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues.some((i) => i.onde.includes("vila-serena.fase3 objeção") && i.motivo.includes("rubrica"))).toBe(true);
    // Sem ja_sabe, a cola ficaria vazia.
    expect(issues.some((i) => i.onde === "trico-vallery.fase3.ja_sabe")).toBe(true);
  });
});

describe("objectionTextPatch", () => {
  const o = { titulo: "Orçamento", fala_exemplo: "Não tenho no orçamento.", detalhes: "Fecha agora.", ceder_se: "Se ver dados." };

  it("só os campos que mudaram, no nome da API", () => {
    expect(
      objectionTextPatch({ description: "Não tenho na rubrica.", details: "Fecha agora.", to_give_in_if: " Se ver dados. " }, o),
    ).toEqual({ description: "Não tenho no orçamento." });
  });

  it("igual ao spec = nada a fazer", () => {
    expect(objectionTextPatch({ description: o.fala_exemplo, details: o.detalhes, to_give_in_if: o.ceder_se }, o)).toBeNull();
  });
});
