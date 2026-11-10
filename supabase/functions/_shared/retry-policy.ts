/**
 * Quando o cliente da Perfecting repete uma chamada que falhou. Puro, para ter
 * teste em tabela — o laço mora em `sendJson` (perfecting.ts).
 *
 * A regra separa "a chamada não chegou / o servidor estava fora" (repetir é
 * seguro) de "a aplicação respondeu que deu errado" (repetir dá o mesmo erro):
 *
 *  - HTTP 500: NUNCA. No backend da Perfecting é erro determinístico de aplicação
 *    (ex.: texto acima do limite da coluna vira 500 genérico). Repetir só triplica
 *    o tempo até o erro aparecer. Exceção explícita por chamada:
 *    `retryServerError`, só para geração com IA que NÃO grava nada.
 *  - HTTP 502/503/504: sempre — gateway/deploy em curso, a aplicação não rodou.
 *  - Falha de rede (conexão não completou): sempre.
 *  - Timeout: só em GET/PUT (idempotentes). Num POST o servidor pode ter criado
 *    o registro e só a resposta se perdeu — repetir duplicaria.
 *  - 4xx: nunca.
 */

export type RetryFailureKind = "http" | "timeout" | "network";

export interface RetryDecisionInput {
  method: string;
  /** Status HTTP quando `kind === "http"`. */
  status?: number;
  kind: RetryFailureKind;
  /** Tentativa que acabou de falhar (1 = a primeira). */
  attempt: number;
  /** Quantas repetições são permitidas além da primeira tentativa. */
  maxRetries: number;
  /** Opt-in por chamada: repetir também em HTTP 500. Ver o comentário do arquivo. */
  retryServerError?: boolean;
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "PUT"]);

export function shouldRetry(input: RetryDecisionInput): boolean {
  if (input.attempt > input.maxRetries) return false;
  switch (input.kind) {
    case "network":
      return true;
    case "timeout":
      return IDEMPOTENT_METHODS.has(input.method.toUpperCase());
    case "http": {
      const status = input.status ?? 0;
      if (GATEWAY_STATUSES.has(status)) return true;
      if (status === 500) return input.retryServerError === true;
      return false;
    }
  }
}

/** Espera antes da próxima tentativa (linear, como sempre foi). */
export function retryDelayMs(attempt: number): number {
  return 1200 * attempt;
}
