import { describe, expect, it } from "vitest";
import {
  describeInvokeError,
  formatHumanizedError,
  FUNCTION_TIMEOUT_MESSAGE,
  humanizeSendError,
  PROCESSING_TIMEOUT_MESSAGE,
  SendError,
} from "./send-error";

/** Payload real do incidente (Sentry PYTHON-FASTAPI-3J): descrição de etapa > 255. */
const INCIDENT = {
  status: 500,
  detail: {
    endpoint: "/role_plays/playbook_3/call_types",
    apiDetail: "Internal server error.",
    raw: '{"detail":"Internal server error."}',
  },
};

describe("humanizeSendError", () => {
  it("500 genérico do incidente: mensagem legível, sem retry, cru só no detalhe técnico", () => {
    const out = humanizeSendError(INCIDENT);
    expect(out.title).toBe("Erro na Perfecting ao gravar");
    expect(out.message).toContain("geralmente conteúdo fora do limite");
    expect(out.message).toContain("/role_plays/playbook_3/call_types");
    expect(out.message).not.toContain("{");
    expect(out.retryable).toBe(false);
    expect(out.technical).toContain("Internal server error.");
  });

  it("500 ao criar o playbook aponta nome repetido", () => {
    const out = humanizeSendError({
      status: 500,
      detail: { endpoint: "/role_plays/playbook/create", apiDetail: "Internal server error.", raw: "" },
    });
    expect(out.message).toContain("já existe um playbook com este nome");
    expect(out.retryable).toBe(false);
  });

  it("500 com mensagem própria mantém a mensagem", () => {
    const out = humanizeSendError({ status: 500, detail: "credenciais Perfecting ausentes para prod" });
    expect(out.message).toBe("credenciais Perfecting ausentes para prod");
    expect(out.retryable).toBe(false);
  });

  it("422 com { message, issues } lista o que corrigir", () => {
    const out = humanizeSendError({
      status: 422,
      detail: { message: "O playbook tem 2 pendências", issues: ["Etapa 1: descrição longa", { message: "Etapa 2: nome repetido" }] },
    });
    expect(out.title).toBe("Revise antes de enviar");
    expect(out.message).toBe("O playbook tem 2 pendências");
    expect(out.issues).toEqual(["Etapa 1: descrição longa", "Etapa 2: nome repetido"]);
    expect(out.retryable).toBe(false);
    expect(formatHumanizedError(out)).toBe(
      "O playbook tem 2 pendências: Etapa 1: descrição longa; Etapa 2: nome repetido",
    );
  });

  it("422 com { message, issues } no topo (sem status)", () => {
    const out = humanizeSendError({ message: "Texto do comprador reprovado", issues: ["usa 'rubrica'"] });
    expect(out.issues).toEqual(["usa 'rubrica'"]);
    expect(out.retryable).toBe(false);
  });

  it("422 do FastAPI (lista de validação) vira issues legíveis", () => {
    const out = humanizeSendError({
      status: 422,
      detail: [{ loc: ["body", "description"], msg: "String should have at most 255 characters" }],
    });
    expect(out.issues).toEqual(["description: String should have at most 255 characters"]);
    expect(out.message).toBe("A Perfecting recusou os dados enviados.");
  });

  it.each([400, 409, 404])("%i com detail string: mostra o texto e não retenta", (status) => {
    const out = humanizeSendError({ status, detail: "este playbook já foi enviado para esta conta" });
    expect(out.message).toBe("este playbook já foi enviado para esta conta");
    expect(out.retryable).toBe(false);
    expect(out.title).toBe("Pedido recusado");
  });

  it.each([502, 503, 504])("%i é retryable", (status) => {
    const out = humanizeSendError({ status, detail: { endpoint: "/x", apiDetail: "Bad Gateway", raw: "" } });
    expect(out.retryable).toBe(true);
    expect(out.title).toBe("Perfecting indisponível");
  });

  it("408 / timeout é retryable", () => {
    expect(humanizeSendError({ status: 408, detail: "timeout" }).retryable).toBe(true);
    expect(humanizeSendError("timeout").title).toBe("Tempo limite excedido");
  });

  it("falha de rede é retryable", () => {
    expect(humanizeSendError({ status: 0, detail: "falha de rede: connection reset" }).retryable).toBe(true);
    const out = humanizeSendError(new TypeError("Failed to fetch"));
    expect(out.title).toBe("Falha de conexão");
    expect(out.retryable).toBe(true);
  });

  it("string pura passa como mensagem, sem detalhe técnico duplicado", () => {
    const out = humanizeSendError("playbookId e connectionId são obrigatórios");
    expect(out.message).toBe("playbookId e connectionId são obrigatórios");
    expect(out.technical).toBeNull();
  });

  it("Error com JSON serializado (formato antigo do db.ts) é reaberto", () => {
    const out = humanizeSendError(new Error(JSON.stringify(INCIDENT)));
    expect(out.title).toBe("Erro na Perfecting ao gravar");
    expect(out.retryable).toBe(false);
  });

  it("{ message } simples e resposta inteira { ok:false, error }", () => {
    expect(humanizeSendError({ message: "playbook sem etapas" }).message).toBe("playbook sem etapas");
    expect(humanizeSendError({ ok: false, error: INCIDENT }).retryable).toBe(false);
  });

  it("null/indefinido não quebra", () => {
    expect(humanizeSendError(null).message).toBe("Erro inesperado, sem detalhe.");
    expect(humanizeSendError(undefined).technical).toBeNull();
  });

  it("SendError devolve o que já carregava", () => {
    const info = humanizeSendError(INCIDENT);
    expect(humanizeSendError(new SendError(info))).toBe(info);
  });
});

/** Mesma forma do FunctionsHttpError do supabase-js: a Response vem em `context`. */
function httpError(body: string | null, status: number) {
  return Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: new Response(body, { status }),
  });
}

describe("describeInvokeError", () => {
  it("546 (função encerrada pelo Supabase) com corpo que não é o nosso", async () => {
    const out = await describeInvokeError(
      httpError('{"code":"WORKER_LIMIT","message":"Function failed due to not having enough compute resources"}', 546),
      "Falha ao processar",
      PROCESSING_TIMEOUT_MESSAGE,
    );
    expect(out.message).toBe(PROCESSING_TIMEOUT_MESSAGE);
    expect(out.message).toContain("Nada foi salvo");
    expect(out.retryable).toBe(true);
    expect(out.technical).toContain("HTTP 546");
    expect(out.technical).toContain("WORKER_LIMIT");
  });

  it.each([546, 504, 408])("%i com corpo vazio", async (status) => {
    const out = await describeInvokeError(httpError(null, status), "Falha ao processar");
    expect(out.message).toBe(FUNCTION_TIMEOUT_MESSAGE);
    expect(out.retryable).toBe(true);
    expect(out.message).not.toContain("non-2xx");
  });

  it("num envio, o texto de tempo limite não promete que nada foi salvo", async () => {
    const out = await describeInvokeError(httpError(null, 546), "Falha ao enviar o playbook");
    expect(out.message).toBe(FUNCTION_TIMEOUT_MESSAGE);
    expect(out.message).not.toContain("Nada foi salvo");
    expect(out.message).toContain("confira o estado antes de repetir");
  });

  it("504 do gateway com HTML", async () => {
    const out = await describeInvokeError(httpError("<html>504 Gateway Time-out</html>", 504), "Falha");
    expect(out.message).toBe(FUNCTION_TIMEOUT_MESSAGE);
  });

  it("outro status sem corpo legível mostra o status", async () => {
    const out = await describeInvokeError(httpError("", 500), "Falha ao processar");
    expect(out.message).toBe("Falha ao processar: o servidor respondeu HTTP 500 sem detalhe.");
    const denied = await describeInvokeError(httpError('{"message":"Invalid JWT"}', 401), "Falha ao processar");
    expect(denied.message).toBe("Falha ao processar: o servidor respondeu HTTP 401 — Invalid JWT.");
    expect(denied.retryable).toBe(false);
  });

  it("corpo com { error } nosso passa pelo humanizeSendError", async () => {
    const out = await describeInvokeError(
      httpError(JSON.stringify({ ok: false, error: { status: 500, detail: INCIDENT.detail } }), 500),
      "Falha ao enviar o playbook",
    );
    expect(out.title).toBe("Erro na Perfecting ao gravar");
    expect(out.retryable).toBe(false);
  });

  it("sem Response (falha de rede do invoke)", async () => {
    const out = await describeInvokeError(new Error("Failed to send a request to the Edge Function"), "Falha ao enviar");
    expect(out.retryable).toBe(true);
    expect(out.message).toContain("Failed to send a request");
  });
});

describe("envio destravado por tempo", () => {
  it("408 com mensagem própria mostra a mensagem e deixa reenviar", () => {
    const info = humanizeSendError({
      status: 408,
      detail: { message: "O envio não terminou: a função foi encerrada antes de responder." },
    });
    expect(info.title).toBe("Envio interrompido");
    expect(info.message).toContain("não terminou");
    expect(info.retryable).toBe(true);
  });

  it("408 cru continua sendo demora da Perfecting", () => {
    const info = humanizeSendError({ status: 408, detail: "timeout" });
    expect(info.title).toBe("Tempo limite excedido");
  });
});

describe("erros do envio de roleplay com registro do que foi criado", () => {
  it("o campo created não atrapalha a mensagem", () => {
    const info = humanizeSendError({
      status: 409,
      detail: { message: "O roleplay 12 foi criado na conta por um envio anterior, mas está sem agente de voz." },
      created: { case_setup_id: 12, context_id: 3 },
    });
    expect(info.message).toContain("roleplay 12");
    expect(info.message).not.toContain("created");
  });

  it("422 de nome repetido traz a orientação como issue", () => {
    const info = humanizeSendError({
      status: 422,
      detail: {
        message: 'Já existe um roleplay chamado "Cold call" neste contexto da conta (roleplay 9)',
        issues: ["envie de novo (o nome é gerado a cada envio), ou apague o roleplay 9 na Perfecting"],
      },
    });
    expect(info.message).toContain("Já existe um roleplay");
    expect(info.issues).toEqual(["envie de novo (o nome é gerado a cada envio), ou apague o roleplay 9 na Perfecting"]);
  });

  it("envio em andamento (409 com texto) é legível", () => {
    const info = humanizeSendError({ status: 409, detail: "Já existe um envio em andamento para este item." });
    expect(info.message).toContain("envio em andamento");
  });
});
