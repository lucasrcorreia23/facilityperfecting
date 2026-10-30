import { describe, expect, it } from "vitest";
import { guidelineRefs, type GuidelineRow, MAX_GUIDELINES_CHARS, renderGuidelinesBlock, selectGuidelines } from "./guidelines.ts";

const row = (over: Partial<GuidelineRow>): GuidelineRow => ({
  id: "g",
  target: "roleplay_import",
  scope_type: "global",
  scope_keys: [],
  title: "Título",
  position: 0,
  active: true,
  version_id: "v",
  version_no: 1,
  body: "texto",
  ...over,
});

const opts = { target: "roleplay_import" as const, mode: "methodology", connectionId: "c1" };

describe("selectGuidelines", () => {
  it("ordena global → modo → conta e respeita a posição dentro do escopo", () => {
    const rows = [
      row({ id: "conta", scope_type: "connection", scope_keys: ["c1"] }),
      row({ id: "modo", scope_type: "mode", scope_keys: ["methodology"] }),
      row({ id: "g2", position: 2 }),
      row({ id: "g1", position: 1 }),
    ];
    expect(selectGuidelines(rows, opts).selected.map((r) => r.id)).toEqual(["g1", "g2", "modo", "conta"]);
  });

  it("deixa de fora inativa, de outro alvo, de outro modo, de outra conta e vazia", () => {
    const rows = [
      row({ id: "inativa", active: false }),
      row({ id: "playbook", target: "playbook" }),
      row({ id: "outro-modo", scope_type: "mode", scope_keys: ["playbook"] }),
      row({ id: "outra-conta", scope_type: "connection", scope_keys: ["c2"] }),
      row({ id: "vazia", body: "   " }),
      row({ id: "ok" }),
    ];
    expect(selectGuidelines(rows, opts).selected.map((r) => r.id)).toEqual(["ok"]);
  });

  it("sem conta escolhida, nenhuma diretriz de conta vale", () => {
    const rows = [row({ id: "conta", scope_type: "connection", scope_keys: ["c1"] })];
    expect(selectGuidelines(rows, { ...opts, connectionId: null }).selected).toEqual([]);
  });

  it("corta no teto sem partir diretriz e devolve as que ficaram de fora", () => {
    const big = "x".repeat(MAX_GUIDELINES_CHARS - 10);
    const rows = [row({ id: "grande", body: big }), row({ id: "nao-cabe", position: 1, body: "y".repeat(20) })];
    const { selected, skipped } = selectGuidelines(rows, opts);
    expect(selected.map((r) => r.id)).toEqual(["grande"]);
    expect(skipped.map((r) => r.id)).toEqual(["nao-cabe"]);
  });
});

describe("renderGuidelinesBlock", () => {
  it("é null sem diretrizes, para o system ficar igual ao de antes", () => {
    expect(renderGuidelinesBlock([])).toBeNull();
  });

  it("abre com a precedência das regras fixas e marca escopo e versão", () => {
    const block = renderGuidelinesBlock([row({ scope_type: "connection", scope_keys: ["c1"], version_no: 3, title: "FIESC" })])!;
    expect(block.startsWith("DIRETRIZES DA EQUIPE")).toBe(true);
    expect(block).toContain("a regra acima prevalece");
    expect(block).toContain("## [Conta · v3] FIESC\ntexto");
  });
});

describe("guidelineRefs", () => {
  it("registra exatamente a versão usada", () => {
    expect(guidelineRefs([row({ id: "g", version_id: "v9", version_no: 9 })])).toEqual([
      { guideline_id: "g", version_id: "v9", version_no: 9, scope_type: "global", title: "Título" },
    ]);
  });
});
