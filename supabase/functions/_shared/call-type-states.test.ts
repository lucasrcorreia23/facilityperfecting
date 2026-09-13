import { describe, expect, it } from "vitest";
import {
  type CaseSetupCheck,
  computeCallTypeStates,
  incompleteCallTypeWarnings,
} from "./call-type-states.ts";

// Etapas do playbook "Fiesc", na ordem.
const CALL_TYPES = [
  { id: 7, name: "Prospecção" },
  { id: 8, name: "Qualificação" },
  { id: 9, name: "Proposta" },
  { id: 10, name: "Follow-up" },
  { id: 11, name: "Fechamento" },
  { id: 12, name: "Perda e Recontato" },
];

const check = (callTypeId: number | null, hasAgent: boolean): CaseSetupCheck => ({
  call_type_id: callTypeId,
  has_agent: hasAgent,
});

describe("computeCallTypeStates", () => {
  it("marca como falha a etapa sem agente quando o worker já passou para as seguintes", () => {
    const checks = {
      "96": check(7, true),
      "97": check(8, true),
      "98": check(9, true),
      "99": check(10, false),
      "100": check(11, true),
      "101": check(12, true),
    };
    const states = computeCallTypeStates(CALL_TYPES, [96, 97, 98, 99, 100, 101], checks);
    expect(states.map((s) => s.state)).toEqual([
      "complete",
      "complete",
      "complete",
      "failed",
      "complete",
      "complete",
    ]);
    expect(states[3]).toMatchObject({ name: "Follow-up", case_setup_id: 99 });
  });

  it("deixa pendente a última etapa que ainda está sendo montada", () => {
    const checks = {
      "96": check(7, true),
      "97": check(8, true),
      "98": check(9, false),
    };
    const states = computeCallTypeStates(CALL_TYPES, [96, 97, 98], checks);
    expect(states.map((s) => s.state)).toEqual([
      "complete",
      "complete",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("marca falha sem roleplay quando uma etapa não gerou case_setup e as seguintes geraram", () => {
    const checks = {
      "96": check(7, true),
      "98": check(9, true),
    };
    const states = computeCallTypeStates(CALL_TYPES, [96, 98], checks);
    expect(states[1]).toEqual({
      call_type_id: 8,
      name: "Qualificação",
      case_setup_id: null,
      state: "failed",
    });
  });

  it("trata pendentes como falha quando não há mais o que esperar", () => {
    const checks = { "96": check(7, true), "97": check(8, false) };
    const states = computeCallTypeStates(CALL_TYPES, [96, 97], checks, {
      treatPendingAsFailed: true,
    });
    expect(states.map((s) => s.state)).toEqual([
      "complete",
      "failed",
      "failed",
      "failed",
      "failed",
      "failed",
    ]);
  });

  it("com dois roleplays na mesma etapa, vale o que terminou", () => {
    const checks = { "96": check(7, false), "120": check(7, true) };
    const [first] = computeCallTypeStates(CALL_TYPES.slice(0, 1), [96, 120], checks);
    expect(first).toMatchObject({ case_setup_id: 120, state: "complete" });
  });

  it("ignora roleplays sem etapa ou ainda não consultados", () => {
    const checks = { "96": check(null, true) };
    const states = computeCallTypeStates(CALL_TYPES, [96, 97], checks);
    expect(states.every((s) => s.state === "pending" && s.case_setup_id === null)).toBe(true);
  });
});

describe("incompleteCallTypeWarnings", () => {
  it("gera um aviso por etapa com falha, com e sem roleplay", () => {
    const warnings = incompleteCallTypeWarnings([
      { call_type_id: 7, name: "Prospecção", case_setup_id: 96, state: "complete" },
      { call_type_id: 10, name: "Follow-up", case_setup_id: 99, state: "failed" },
      { call_type_id: 11, name: "Fechamento", case_setup_id: null, state: "failed" },
      { call_type_id: 12, name: "Perda e Recontato", case_setup_id: null, state: "pending" },
    ]);
    expect(warnings).toEqual([
      'etapa "Follow-up" (roleplay 99) não terminou de ser montada na Perfecting: sem comportamento, prompt ou agente de voz',
      'etapa "Fechamento" não gerou roleplay na Perfecting',
    ]);
  });
});
