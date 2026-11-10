import { describe, expect, it } from "vitest";
import {
  hasBudgetForPart,
  MIN_PART_MS,
  PART_MAX_MS,
  partDeadlineMs,
  WALL_BUDGET_MS,
} from "./invocation-deadline.ts";

const T0 = 1_700_000_000_000;

describe("partDeadlineMs", () => {
  it.each([
    // [segundos já gastos, prazo esperado em ms, cabe uma parte?]
    [0, 120_000, true],
    [5, 120_000, true],
    [20, 120_000, true], // 140 − 20 = 120: ainda o teto por parte
    [21, 119_000, true], // daqui em diante quem manda é o relógio da invocação
    [60, 80_000, true],
    [120, 20_000, true], // exatamente o mínimo
    [121, 19_000, false],
    [139, 1_000, false],
    [140, 0, false],
    [200, 0, false], // nunca negativo
  ])("%is gastos → %ims", (elapsedSec, expected, fits) => {
    const ms = partDeadlineMs({ requestStartedAt: T0, now: T0 + elapsedSec * 1000 });
    expect(ms).toBe(expected);
    expect(hasBudgetForPart(ms)).toBe(fits);
  });

  it("os padrões são 120s por parte e 140s de invocação, com mínimo de 20s", () => {
    expect([PART_MAX_MS, WALL_BUDGET_MS, MIN_PART_MS]).toEqual([120_000, 140_000, 20_000]);
  });

  it("aceita teto e orçamento próprios", () => {
    expect(
      partDeadlineMs({ requestStartedAt: T0, now: T0 + 10_000, perPartMax: 30_000, wallBudget: 35_000 }),
    ).toBe(25_000);
  });

  it("relógio que andou para trás não aumenta o prazo", () => {
    expect(partDeadlineMs({ requestStartedAt: T0, now: T0 - 5_000 })).toBe(PART_MAX_MS);
  });
});
