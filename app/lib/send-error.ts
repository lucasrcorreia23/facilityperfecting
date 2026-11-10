/**
 * Traduz um erro de envio / Edge Function em algo que a pessoa consegue ler e
 * agir: título, mensagem, lista do que corrigir e se vale tentar de novo.
 *
 * Puro e sem imports de propósito: é usado pelo `db.ts`, pelos modais e pelos
 * testes. O detalhe cru nunca vai para a mensagem — fica em `technical`, que a
 * UI mostra recolhido em "Detalhes técnicos".
 *
 * Formas entendidas:
 *  - `{ status, detail }` — PerfectingError serializado pelas Edge Functions.
 *    `detail` pode ser string (400/409), `{ message, issues }` (422 do portão),
 *    a lista de validação do FastAPI, ou `{ endpoint, apiDetail, raw }` (5xx).
 *  - `{ message, issues? }`, string pura e `Error`.
 */

export interface HumanizedError {
  title: string;
  message: string;
  /** O que corrigir, um item por linha (422). Vazio quando não há lista. */
  issues: string[];
  /** Só `true` quando repetir o MESMO pedido pode dar certo. */
  retryable: boolean;
  /** Payload cru, para investigação. `null` quando não acrescenta nada. */
  technical: string | null;
}

/** Erro já humanizado — o `db.ts` lança este para a UI não perder `retryable`. */
export class SendError extends Error {
  info: HumanizedError;
  constructor(info: HumanizedError) {
    super(formatHumanizedError(info));
    this.name = "SendError";
    this.info = info;
  }
}

/** Uma linha só: mensagem + lista de issues (formato histórico do `describeFunctionError`). */
export function formatHumanizedError(info: HumanizedError): string {
  return info.issues.length > 0 ? `${info.message}: ${info.issues.join("; ")}` : info.message;
}

/**
 * Função encerrada pelo Supabase (546 / 504) sem responder. Neutra de propósito:
 * num ENVIO, parte do trabalho pode já ter sido criada na conta.
 */
export const FUNCTION_TIMEOUT_MESSAGE =
  "A função passou do tempo limite do servidor (~150s) e foi encerrada antes de responder. Parte do trabalho pode ter sido feita: recarregue a tela e confira o estado antes de repetir.";

/** Mesma situação em funções que só processam (process-import): nada é gravado. */
export const PROCESSING_TIMEOUT_MESSAGE =
  "A função passou do tempo limite do servidor (~150s) e foi encerrada. Nada foi salvo; tente de novo — se repetir, o material é grande demais para uma vez.";

const GENERIC_500 = /^\s*internal server error\.?\s*$/i;
const NETWORK_TEXT = /failed to fetch|fetch failed|network|falha de rede|connection (reset|refused|closed)|error sending request|ECONN/i;
const TIMEOUT_TEXT = /^\s*timeout\s*$|timed out|tempo limite/i;

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function issueToString(issue: unknown): string {
  if (typeof issue === "string") return issue;
  if (isRecord(issue)) {
    const msg = text(issue.message) ?? text(issue.msg);
    if (msg) {
      // Item de validação do FastAPI: { loc: ["body","description"], msg }
      const loc = Array.isArray(issue.loc)
        ? issue.loc.filter((p) => p !== "body").map(String).join(".")
        : "";
      return loc ? `${loc}: ${msg}` : msg;
    }
    return JSON.stringify(issue);
  }
  return String(issue);
}

interface Parsed {
  status: number | null;
  text: string | null;
  issues: string[];
  endpoint: string | null;
}

function parse(error: unknown): Parsed {
  const out: Parsed = { status: null, text: null, issues: [], endpoint: null };
  if (typeof error === "string") {
    out.text = text(error);
    return out;
  }
  if (Array.isArray(error)) {
    out.issues = error.map(issueToString);
    return out;
  }
  if (!isRecord(error)) return out;

  // Resposta inteira da função ({ ok:false, error }) — desce para o erro.
  if (error.ok === false && error.error != null) return parse(error.error);

  if (typeof error.status === "number") out.status = error.status;
  const detail = error.detail;
  if (typeof detail === "string") {
    out.text = text(detail);
  } else if (Array.isArray(detail)) {
    out.issues = detail.map(issueToString);
  } else if (isRecord(detail)) {
    out.endpoint = text(detail.endpoint);
    out.text = text(detail.message) ?? text(detail.apiDetail) ?? text(detail.detail);
    if (Array.isArray(detail.issues)) out.issues = detail.issues.map(issueToString);
  }
  out.text ??= text(error.message) ?? text(error.error);
  if (out.issues.length === 0 && Array.isArray(error.issues)) {
    out.issues = error.issues.map(issueToString);
  }
  return out;
}

function technicalOf(original: unknown, message: string): string | null {
  if (original == null) return null;
  if (typeof original === "string") return original.trim() === message ? null : original;
  try {
    return JSON.stringify(original, null, 2);
  } catch {
    return String(original);
  }
}

export function humanizeSendError(error: unknown): HumanizedError {
  if (error instanceof SendError) return error.info;

  // Error e string podem carregar um JSON serializado (erros antigos do db.ts).
  let source: unknown = error instanceof Error ? error.message : error;
  if (typeof source === "string") {
    const parsed = tryParseJson(source);
    if (parsed !== undefined) source = parsed;
  }

  const { status, text: detailText, issues, endpoint } = parse(source);
  const done = (title: string, message: string, retryable: boolean): HumanizedError => ({
    title,
    message,
    issues,
    retryable,
    technical: technicalOf(source, message),
  });

  if (status === 546) return done("Tempo limite excedido", FUNCTION_TIMEOUT_MESSAGE, true);

  // 408 com texto próprio = envio destravado por tempo (send-staleness.ts): a mensagem
  // já diz o que aconteceu e que reenviar continua de onde parou.
  if (status === 408 && detailText && !/^\s*timeout\s*$/i.test(detailText)) {
    return done("Envio interrompido", detailText, true);
  }

  if (status === 408 || (status == null && detailText && TIMEOUT_TEXT.test(detailText))) {
    return done(
      "Tempo limite excedido",
      "A Perfecting demorou demais para responder. Tente de novo em instantes.",
      true,
    );
  }

  if (status === 0 || (status == null && detailText && NETWORK_TEXT.test(detailText))) {
    return done(
      "Falha de conexão",
      "Não foi possível falar com o servidor (falha de rede). Tente de novo.",
      true,
    );
  }

  if (status === 502 || status === 503 || status === 504) {
    // 502 também é o que as funções usam para "a API respondeu sem o que esperávamos".
    const own = detailText && !GENERIC_500.test(detailText) ? ` (${detailText})` : "";
    return done(
      "Perfecting indisponível",
      `A Perfecting está indisponível no momento — HTTP ${status}${own}. Tente de novo em alguns minutos.`,
      true,
    );
  }

  if (status != null && status >= 500) {
    if (detailText && !GENERIC_500.test(detailText)) {
      return done("Erro na Perfecting", detailText, false);
    }
    const where = endpoint ? ` Chamada: ${endpoint}.` : "";
    if (endpoint && /\/playbook\/create\/?$/.test(endpoint)) {
      return done(
        "Erro na Perfecting ao gravar",
        `Erro na Perfecting ao criar o playbook — geralmente já existe um playbook com este nome, ou o nome passa do limite. Renomeie o playbook (ou exclua o antigo na Perfecting) e envie de novo.${where}`,
        false,
      );
    }
    return done(
      "Erro na Perfecting ao gravar",
      `Erro na Perfecting ao gravar — geralmente conteúdo fora do limite (texto longo demais ou nome repetido). Revise o conteúdo e envie de novo; repetir sem mudar nada dá o mesmo erro.${where}`,
      false,
    );
  }

  if (status === 422 || (status == null && issues.length > 0)) {
    return done(
      "Revise antes de enviar",
      detailText ?? "A Perfecting recusou os dados enviados.",
      false,
    );
  }

  if (status === 401 || status === 403) {
    return done(
      "Sem permissão",
      detailText ?? "A conta de destino recusou o acesso. Confira a conexão e as credenciais.",
      false,
    );
  }

  if (status != null && status >= 400) {
    return done(
      "Pedido recusado",
      detailText ?? `A Perfecting recusou o pedido (HTTP ${status}).`,
      false,
    );
  }

  // Sem status: não dá para saber se é determinístico — deixa tentar de novo.
  return done("Algo deu errado", detailText ?? "Erro inesperado, sem detalhe.", true);
}

/**
 * Erro de `supabase.functions.invoke` (FunctionsHttpError traz a `Response` em
 * `context`). Lê o corpo UMA vez como texto: quando a função é encerrada pelo
 * Supabase (546 / 504 do gateway) o corpo não é o nosso `{ ok, error }`, e o
 * fallback antigo virava "Edge Function returned a non-2xx status code".
 */
export async function describeInvokeError(
  error: unknown,
  fallback: string,
  /** Texto para 546/504/408 — o padrão é o neutro; quem só processa passa o seu. */
  timeoutMessage: string = FUNCTION_TIMEOUT_MESSAGE,
): Promise<HumanizedError> {
  const ctx = (error as { context?: unknown } | null)?.context as
    | { status?: unknown; text?: () => Promise<string> }
    | undefined;

  if (ctx && typeof ctx.text === "function") {
    const status = typeof ctx.status === "number" ? ctx.status : null;
    let body = "";
    try {
      body = (await ctx.text()).trim();
    } catch {
      // corpo ilegível — segue só com o status
    }
    const parsed = body ? tryParseJson(body) : undefined;
    if (isRecord(parsed) && parsed.error != null) return humanizeSendError(parsed.error);

    const technical = [status != null ? `HTTP ${status}` : null, body.slice(0, 2000) || null]
      .filter(Boolean)
      .join("\n") || null;

    if (status === 546 || status === 504 || status === 408) {
      return {
        title: "Tempo limite excedido",
        message: timeoutMessage,
        issues: [],
        retryable: true,
        technical,
      };
    }
    const bodyMessage = isRecord(parsed) ? (text(parsed.message) ?? text(parsed.msg)) : null;
    const tail = bodyMessage ? ` — ${bodyMessage}` : " sem detalhe";
    return {
      title: "A função falhou",
      message: `${fallback}: o servidor respondeu HTTP ${status ?? "?"}${tail}.`,
      issues: [],
      retryable: status == null || status === 429 || status >= 500,
      technical,
    };
  }

  // Sem resposta nenhuma (FunctionsFetchError / relay): é rede.
  const message = error instanceof Error && error.message ? error.message : fallback;
  return {
    title: "Falha de conexão",
    message: `${fallback}: ${message}`.replace(`${fallback}: ${fallback}`, fallback),
    issues: [],
    retryable: true,
    technical: null,
  };
}
