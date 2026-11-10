import { describe, expect, it } from "vitest";
import { leavesCurrentPage } from "./unsaved-guard";

const currentUrl = "https://facility.example/criacao?x=1";

describe("leavesCurrentPage", () => {
  it("link interno para outra rota sai da tela", () => {
    expect(leavesCurrentPage({ href: "/biblioteca", currentUrl })).toBe(true);
    expect(leavesCurrentPage({ href: "https://facility.example/playbooks/1", currentUrl })).toBe(true);
    expect(leavesCurrentPage({ href: "../trilhas", currentUrl: "https://facility.example/a/b" })).toBe(true);
  });

  it("âncora e query da própria rota não saem", () => {
    expect(leavesCurrentPage({ href: "#topo", currentUrl })).toBe(false);
    expect(leavesCurrentPage({ href: "/criacao?y=2", currentUrl })).toBe(false);
  });

  it("nova aba, download e clique modificado não saem desta aba", () => {
    expect(leavesCurrentPage({ href: "/biblioteca", target: "_blank", currentUrl })).toBe(false);
    expect(leavesCurrentPage({ href: "/arquivo.md", download: true, currentUrl })).toBe(false);
    expect(leavesCurrentPage({ href: "/biblioteca", modified: true, currentUrl })).toBe(false);
    expect(leavesCurrentPage({ href: "/biblioteca", button: 1, currentUrl })).toBe(false);
  });

  it("link externo fica com o beforeunload", () => {
    expect(leavesCurrentPage({ href: "https://app.perfecting.com.br/roleplays", currentUrl })).toBe(false);
  });

  it("href ausente, inválido ou não-http não conta", () => {
    expect(leavesCurrentPage({ href: null, currentUrl })).toBe(false);
    expect(leavesCurrentPage({ href: "mailto:a@b.c", currentUrl })).toBe(false);
    expect(leavesCurrentPage({ href: "/x", currentUrl: "nao-e-url" })).toBe(false);
  });
});
