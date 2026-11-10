import { describe, expect, it } from "vitest";
import {
  CALL_TYPE_DESCRIPTION_MAX,
  debateLengthChecks,
  duplicatedCallTypeNames,
  ENTITY_TEXT_MAX,
  exportIssuesMessage,
  GUARDRAIL_NAME_MAX,
  lengthIssues,
  lengthIssuesMessage,
  MAX_CALL_BLOCKS_PER_CALL_TYPE,
  PLAYBOOK_GENERATION_LIMITS_PROMPT,
  saleLengthChecks,
  validatePlaybookForExport,
} from "./perfecting-limits.ts";

/** Descrição real da etapa que derrubou o envio (Sentry PYTHON-FASTAPI-3J). Não normalizar. */
const INCIDENT_DESCRIPTION =
  "Primeira etapa da trilha combinada com a FIESC (16/09/2026): o agente de mercado liga para um lead B2B ou B2G com o objetivo de agendar uma visita técnica. É a etapa mais praticada em produção (roleplay 250 · Cold Call RH Têxtil), usando a metodologia SPIN.";

const block = (name: string, description: string | null = "ok") => ({ name, description });
const callType = (name: string, description: string | null = "ok", blocks = [block("Abertura")]) => ({
  name,
  description,
  blocks,
});

describe("validatePlaybookForExport", () => {
  it("playbook dentro dos limites não tem issues", () => {
    expect(
      validatePlaybookForExport({
        name: "Playbook FIESC",
        callTypes: [callType("Prospecção"), callType("Diagnóstico")],
      }),
    ).toEqual([]);
  });

  it("255 caracteres passa, 256 vira issue — em todos os campos com limite", () => {
    const ok = "a".repeat(255);
    const over = "a".repeat(256);
    expect(
      validatePlaybookForExport({
        name: ok,
        callTypes: [callType(ok, ok, [block(ok, ok)])],
      }),
    ).toEqual([]);

    const issues = validatePlaybookForExport({
      name: over,
      callTypes: [callType(over, over, [block(over, over)])],
    });
    expect(issues.map((i) => [i.callTypeIndex, i.callBlockIndex, i.field, i.actual, i.limit])).toEqual([
      [null, null, "name", 256, 255],
      [1, null, "name", 256, 255],
      [1, null, "description", 256, 255],
      [1, 1, "name", 256, 255],
      [1, 1, "description", 256, 255],
    ]);
    expect(issues.every((i) => i.kind === "too_long")).toBe(true);
  });

  it("a descrição real do incidente é barrada, com mensagem legível", () => {
    expect(INCIDENT_DESCRIPTION.length).toBeGreaterThan(CALL_TYPE_DESCRIPTION_MAX);
    const issues = validatePlaybookForExport({
      name: "Trilha FIESC",
      callTypes: [callType("Cold Call", INCIDENT_DESCRIPTION)],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "too_long",
      callTypeIndex: 1,
      callType: "Cold Call",
      callBlock: null,
      field: "description",
      limit: 255,
      actual: INCIDENT_DESCRIPTION.length,
    });
    expect(issues[0].message).toBe(
      `Etapa 1 (Cold Call): descrição com ${INCIDENT_DESCRIPTION.length} caracteres — o limite é 255 (corte ${INCIDENT_DESCRIPTION.length - 255}).`,
    );
  });

  it("sem descrição, valida o que é enviado no lugar (o nome)", () => {
    expect(validatePlaybookForExport({ name: "P", callTypes: [callType("Etapa", null)] })).toEqual([]);
  });

  it("7 subetapas passa do limite de 6; 6 passa", () => {
    const blocks = (n: number) => Array.from({ length: n }, (_, i) => block(`Momento ${i + 1}`));
    expect(
      validatePlaybookForExport({ name: "P", callTypes: [callType("Diagnóstico", "ok", blocks(6))] }),
    ).toEqual([]);
    const issues = validatePlaybookForExport({
      name: "P",
      callTypes: [callType("Diagnóstico", "ok", blocks(7))],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "too_many_blocks",
      field: "call_blocks",
      limit: MAX_CALL_BLOCKS_PER_CALL_TYPE,
      actual: 7,
    });
    expect(issues[0].message).toContain("7 subetapas — o limite é 6 por etapa");
  });

  it("duas etapas \"Nova etapa\" (sem diferenciar maiúsculas nem espaços)", () => {
    const issues = validatePlaybookForExport({
      name: "P",
      callTypes: [callType("Nova etapa"), callType("Diagnóstico"), callType("  nova ETAPA ")],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "duplicate_name", callTypeIndex: 3, field: "name" });
    expect(issues[0].message).toContain("mesmo nome da etapa 1");
  });

  it("subetapas com o mesmo nome são permitidas (não há unicidade no backend)", () => {
    expect(
      validatePlaybookForExport({
        name: "P",
        callTypes: [callType("Etapa", "ok", [block("Abertura"), block("Abertura")])],
      }),
    ).toEqual([]);
  });

  it("nomes vazios", () => {
    const issues = validatePlaybookForExport({
      name: "  ",
      callTypes: [callType(" ", "ok", [block("")])],
    });
    expect(issues.map((i) => i.kind)).toEqual(["empty", "empty", "empty"]);
  });
});

describe("apoio", () => {
  it("duplicatedCallTypeNames devolve as chaves normalizadas repetidas", () => {
    expect([...duplicatedCallTypeNames(["Nova etapa", "nova etapa ", "Outra", ""])]).toEqual(["nova etapa"]);
  });

  it("exportIssuesMessage concorda em número", () => {
    const [one] = validatePlaybookForExport({ name: "", callTypes: [] });
    expect(exportIssuesMessage([one])).toContain("1 pendência ");
    expect(exportIssuesMessage([one, one])).toContain("2 pendências ");
  });

  it("o prompt da geração leva os alvos e o teto de subetapas", () => {
    expect(PLAYBOOK_GENERATION_LIMITS_PROMPT).toContain("no máximo 120 caracteres");
    expect(PLAYBOOK_GENERATION_LIMITS_PROMPT).toContain("no máximo 250 caracteres");
    expect(PLAYBOOK_GENERATION_LIMITS_PROMPT).toContain("No máximo 6 subetapas");
  });
});

describe("limites de roleplay (colunas de 255)", () => {
  it("nada estourando = sem pendência", () => {
    expect(
      lengthIssues(
        saleLengthChecks({
          offerName: "Oferta",
          offerUrl: "https://exemplo.com",
          objections: [{ titulo: "Preço alto" }],
          guardrails: [{ nome: "Não dar desconto" }],
        }),
      ),
    ).toEqual([]);
  });

  it("aponta o campo, o tamanho e quanto cortar", () => {
    const issues = lengthIssues(
      saleLengthChecks({
        offerName: "o".repeat(260),
        objections: [{ titulo: "t".repeat(256) }],
      }),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toBe("nome da oferta com 260 caracteres — o limite é 255 (corte 5)");
    expect(issues[1]).toMatch(/^objeção ".{37}…": título com 256 caracteres/);
  });

  it("nome de regra reserva a folga do sufixo de unicidade", () => {
    const nome = "r".repeat(GUARDRAIL_NAME_MAX + 1);
    expect(lengthIssues(saleLengthChecks({ guardrails: [{ nome }] }))).toHaveLength(1);
    expect(lengthIssues(saleLengthChecks({ guardrails: [{ nome: nome.slice(1) }] }))).toEqual([]);
    expect(GUARDRAIL_NAME_MAX).toBe(ENTITY_TEXT_MAX - 20);
  });

  it("confere os campos do dossiê", () => {
    const long = "x".repeat(300);
    const issues = lengthIssues(
      saleLengthChecks({
        dossier: {
          produtos: [{ nome: long }],
          dores: [{ titulo: long }],
          persona: { nome: long, cargo: long, area: long, empresa_nome: long },
        },
      }),
    );
    expect(issues).toHaveLength(6);
  });

  it("espaço nas pontas não conta", () => {
    expect(lengthIssues([{ label: "x", value: ` ${"a".repeat(255)}  `, limit: 255 }])).toEqual([]);
  });

  it("debate: confere oponente, contra-argumentos, regras e o título por etapa", () => {
    const d = {
      oponente_nome: "n".repeat(250),
      oponente_papel: "p".repeat(256),
      objecoes: [{ titulo: "ok" }],
      guardrails: [{ nome: "g".repeat(240) }],
    };
    const issues = lengthIssues(debateLengthChecks(d, ["Abertura"]));
    expect(issues).toHaveLength(3);
    expect(issues.join("\n")).toContain("papel da oponente");
    expect(issues.join("\n")).toContain("regra");
    expect(issues.join("\n")).toContain('etapa "Abertura"');
  });

  it("mensagem do 422 concorda em número", () => {
    expect(lengthIssuesMessage(["a"])).toContain("1 texto ");
    expect(lengthIssuesMessage(["a", "b"])).toContain("2 textos ");
  });
});
