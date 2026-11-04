import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

  it("a versão de 30/10 (a que criou 259/270/272) seria barrada", () => {
    const old = execSync("git show 9f3d3de:docs/FIESC-B2G/fase23-spec.prod.json", {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    });
    const issues = issuesOf(JSON.parse(old) as Spec);
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues.some((i) => i.onde.includes("vila-serena.fase3 objeção") && i.motivo.includes("rubrica"))).toBe(true);
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
