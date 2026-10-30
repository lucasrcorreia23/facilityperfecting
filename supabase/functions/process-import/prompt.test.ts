import { describe, expect, it } from "vitest";
import { generatorFingerprint } from "./prompt.ts";
import { GENERATOR_VERSION } from "../_shared/generator-version.ts";

describe("impressão digital do gerador", () => {
  it("é determinística e muda com o modelo", async () => {
    const a = await generatorFingerprint("claude-sonnet-5");
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(await generatorFingerprint("claude-sonnet-5")).toBe(a);
    expect(await generatorFingerprint("outro-modelo")).not.toBe(a);
  });

  it("anda junto com GENERATOR_VERSION", async () => {
    // Falhou? O prompt base, o schema ou as notas de fatia mudaram: suba
    // GENERATOR_VERSION em _shared/generator-version.ts e atualize os dois valores aqui.
    expect({ version: GENERATOR_VERSION, fingerprint: await generatorFingerprint("claude-sonnet-5") }).toEqual({
      version: "5",
      fingerprint: "1f0b0fd8",
    });
  });
});
