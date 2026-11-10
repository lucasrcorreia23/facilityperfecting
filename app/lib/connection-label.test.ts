import { describe, expect, it } from "vitest";
import {
  connectionBlockReason,
  connectionLabel,
  connectionName,
  countLabel,
  destinationLabel,
  environmentKind,
  environmentLabel,
  filterConnections,
  isProduction,
  matchesConnectionQuery,
  summarizeDestinations,
} from "./connection-label";

const prod = { id: "p", environment: "prod", org_id: 52, org_name: "FIESC", target_user_id: 9 };
const hml = { id: "h", environment: "hml", org_id: 7, org_name: "FIESC", target_user_id: 3 };
const semNome = { id: "s", environment: "hml", org_id: 73, org_name: null, target_user_id: null };

describe("ambiente", () => {
  it("reconhece produção e homolog em qualquer grafia", () => {
    expect(environmentKind("prod")).toBe("prod");
    expect(environmentKind(" PROD ")).toBe("prod");
    expect(environmentKind("hml")).toBe("hml");
    expect(environmentKind("homolog")).toBe("hml");
    expect(environmentKind("dev")).toBe("other");
    expect(environmentKind(null)).toBe("other");
  });

  it("dá o rótulo por extenso e não esconde ambiente desconhecido", () => {
    expect(environmentLabel("prod")).toBe("Produção");
    expect(environmentLabel("hml")).toBe("Homolog");
    expect(environmentLabel("dev")).toBe("dev");
    expect(environmentLabel(undefined)).toBe("Ambiente desconhecido");
  });

  it("isProduction só é verdadeiro em produção", () => {
    expect(isProduction(prod)).toBe(true);
    expect(isProduction(hml)).toBe(false);
    expect(isProduction(null)).toBe(false);
  });
});

describe("rótulos da conta", () => {
  it("usa o nome da org, ou o id quando não há nome", () => {
    expect(connectionName(prod)).toBe("FIESC");
    expect(connectionName(semNome)).toBe("Org 73");
    expect(connectionName({ org_name: "  " })).toBe("Conta sem nome");
  });

  it("lista com o nome na frente e destino com o ambiente na frente", () => {
    expect(connectionLabel(prod)).toBe("FIESC · Produção");
    expect(destinationLabel(prod)).toBe("Produção · FIESC");
    expect(destinationLabel(semNome)).toBe("Homolog · Org 73");
    expect(destinationLabel(null)).toBe("Conta não escolhida");
  });

  it("bloqueia conta sem gestor e diz por quê", () => {
    expect(connectionBlockReason(prod)).toBeNull();
    expect(connectionBlockReason(semNome)).toMatch(/Sem gestor/);
  });
});

describe("busca", () => {
  it("casa nome sem acento, id da org e ambiente", () => {
    expect(matchesConnectionQuery(prod, "fiesc")).toBe(true);
    expect(matchesConnectionQuery(prod, "52")).toBe(true);
    expect(matchesConnectionQuery(prod, "producao")).toBe(true);
    expect(matchesConnectionQuery(prod, "fiesc prod")).toBe(true);
    expect(matchesConnectionQuery(prod, "fiesc homolog")).toBe(false);
    expect(matchesConnectionQuery(prod, "  ")).toBe(true);
  });

  it("mantém a conta escolhida mesmo quando a busca não casa", () => {
    const all = [prod, hml, semNome];
    expect(filterConnections(all, "73").map((c) => c.id)).toEqual(["s"]);
    expect(filterConnections(all, "73", "p").map((c) => c.id)).toEqual(["p", "s"]);
    expect(filterConnections(all, "")).toHaveLength(3);
  });
});

describe("resumo de destinos do lote", () => {
  it("agrupa por conta, com produção primeiro", () => {
    expect(summarizeDestinations([hml, prod, hml, prod, prod])).toEqual([
      { label: "Produção · FIESC", count: 3, production: true },
      { label: "Homolog · FIESC", count: 2, production: false },
    ]);
  });

  it("não esconde item sem conta", () => {
    expect(summarizeDestinations([null, hml])).toEqual([
      { label: "Conta não escolhida", count: 1, production: false },
      { label: "Homolog · FIESC", count: 1, production: false },
    ]);
  });

  it("lote vazio não tem grupos", () => {
    expect(summarizeDestinations([])).toEqual([]);
  });
});

describe("countLabel", () => {
  it("concorda em número", () => {
    expect(countLabel(1, "roleplay", "roleplays")).toBe("1 roleplay");
    expect(countLabel(4, "roleplay", "roleplays")).toBe("4 roleplays");
    expect(countLabel(0, "roleplay", "roleplays")).toBe("0 roleplays");
  });
});
