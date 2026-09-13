import { describe, expect, it } from "vitest";
import { MAX_API_TEXT_CHARS, truncateForApi } from "./perfecting.ts";

describe("truncateForApi", () => {
  it("devolve o texto intacto até o limite", () => {
    const text = "a".repeat(MAX_API_TEXT_CHARS);
    expect(truncateForApi(text)).toBe(text);
  });

  it("corta acima do limite e informa o tamanho original", () => {
    const text = "b".repeat(55_167);
    const out = truncateForApi(text);
    expect(out.startsWith("b".repeat(MAX_API_TEXT_CHARS))).toBe(true);
    expect(out).toContain("o original tem 55167 caracteres");
    expect(out.length).toBeLessThan(MAX_API_TEXT_CHARS + 100);
  });
});
