import { describe, expect, it } from "vitest";
import { retryDelayMs, type RetryDecisionInput, shouldRetry } from "./retry-policy.ts";

type Row = [string, Omit<RetryDecisionInput, "attempt" | "maxRetries">, boolean];

const TABLE: Row[] = [
  // 500 = erro de aplicação determinístico: nunca, em método nenhum
  ["POST 500", { method: "POST", kind: "http", status: 500 }, false],
  ["PUT 500", { method: "PUT", kind: "http", status: 500 }, false],
  ["PATCH 500", { method: "PATCH", kind: "http", status: 500 }, false],
  ["GET 500", { method: "GET", kind: "http", status: 500 }, false],
  // …salvo opt-in explícito (geração com IA que não grava)
  ["POST 500 com opt-in", { method: "POST", kind: "http", status: 500, retryServerError: true }, true],
  // gateway fora: sempre
  ["POST 502", { method: "POST", kind: "http", status: 502 }, true],
  ["POST 503", { method: "POST", kind: "http", status: 503 }, true],
  ["POST 504", { method: "POST", kind: "http", status: 504 }, true],
  ["PATCH 503", { method: "PATCH", kind: "http", status: 503 }, true],
  ["GET 502", { method: "GET", kind: "http", status: 502 }, true],
  // outros 5xx não são "gateway fora"
  ["POST 501", { method: "POST", kind: "http", status: 501 }, false],
  ["POST 507", { method: "POST", kind: "http", status: 507 }, false],
  // 4xx: nunca, nem com opt-in
  ["POST 400", { method: "POST", kind: "http", status: 400 }, false],
  ["POST 401", { method: "POST", kind: "http", status: 401 }, false],
  ["POST 404", { method: "POST", kind: "http", status: 404 }, false],
  ["POST 409", { method: "POST", kind: "http", status: 409 }, false],
  ["POST 422", { method: "POST", kind: "http", status: 422 }, false],
  ["POST 422 com opt-in", { method: "POST", kind: "http", status: 422, retryServerError: true }, false],
  ["POST 429", { method: "POST", kind: "http", status: 429 }, false],
  // rede: sempre
  ["POST rede", { method: "POST", kind: "network" }, true],
  ["PUT rede", { method: "PUT", kind: "network" }, true],
  ["PATCH rede", { method: "PATCH", kind: "network" }, true],
  // timeout: só idempotentes
  ["GET timeout", { method: "GET", kind: "timeout" }, true],
  ["PUT timeout", { method: "PUT", kind: "timeout" }, true],
  ["put timeout (minúsculas)", { method: "put", kind: "timeout" }, true],
  ["POST timeout", { method: "POST", kind: "timeout" }, false],
  ["POST timeout com opt-in de 500", { method: "POST", kind: "timeout", retryServerError: true }, false],
  ["PATCH timeout", { method: "PATCH", kind: "timeout" }, false],
];

describe("shouldRetry", () => {
  it.each(TABLE)("%s", (_label, input, expected) => {
    expect(shouldRetry({ ...input, attempt: 1, maxRetries: 2 })).toBe(expected);
  });

  it("respeita o teto de tentativas", () => {
    const base = { method: "POST", kind: "http" as const, status: 503 };
    expect(shouldRetry({ ...base, attempt: 1, maxRetries: 2 })).toBe(true);
    expect(shouldRetry({ ...base, attempt: 2, maxRetries: 2 })).toBe(true);
    expect(shouldRetry({ ...base, attempt: 3, maxRetries: 2 })).toBe(false);
  });

  it("maxRetries 0 nunca repete (criação sem dedupe)", () => {
    expect(shouldRetry({ method: "POST", kind: "http", status: 503, attempt: 1, maxRetries: 0 })).toBe(false);
    expect(shouldRetry({ method: "POST", kind: "network", attempt: 1, maxRetries: 0 })).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("cresce com a tentativa", () => {
    expect(retryDelayMs(1)).toBe(1200);
    expect(retryDelayMs(2)).toBe(2400);
  });
});
