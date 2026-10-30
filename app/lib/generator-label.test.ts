import { describe, expect, it } from "vitest";
import { generatorLabel } from "./generator-label";
import type { GeneratorManifest } from "./types";

const manifest = (over: Partial<GeneratorManifest> = {}): GeneratorManifest => ({
  version: "5",
  fingerprint: "1f0b0fd8",
  model: "claude-sonnet-5",
  mode: "methodology",
  guidelines: [],
  connection_id: null,
  processed_at: "2026-10-30T12:00:00Z",
  ...over,
});

describe("generatorLabel", () => {
  it("sem manifesto diz que a origem não foi registrada", () => {
    expect(generatorLabel(null)).toBe("origem não registrada");
  });

  it("mostra versão, impressão digital e diretrizes com escopo", () => {
    const m = manifest({
      guidelines: [
        { guideline_id: "a", version_id: "x", version_no: 3, scope_type: "global", title: "Datas" },
        { guideline_id: "b", version_id: "y", version_no: 2, scope_type: "connection", title: "FIESC" },
      ],
    });
    expect(generatorLabel(m)).toBe("Gerador v5 · 1f0b0fd8 · diretrizes: Datas v3, Conta: FIESC v2");
  });

  it("sem diretrizes diz nenhuma", () => {
    expect(generatorLabel(manifest())).toBe("Gerador v5 · 1f0b0fd8 · diretrizes: nenhuma");
  });
});
