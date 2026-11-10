/**
 * Envio preso em "exporting": a Edge Function foi encerrada (limite de ~150s) antes
 * de gravar sucesso ou erro, e nada mais vai mexer no registro. Sem destravar por
 * tempo, o rascunho/playbook fica "Enviando…" para sempre e a tela bloqueia o reenvio.
 *
 * Puro e sem imports: as funções consultam (`stage: "poll"`) e o front só mostra.
 */

/**
 * Rascunho de roleplay em `exporting` (export-roleplay). Uma invocação vive no máximo
 * alguns minutos; 10 min sem nenhuma atualização do rascunho é execução morta.
 */
export const ROLEPLAY_SEND_STALE_MS = 10 * 60_000;

/**
 * Playbook em `exporting` (export-playbook). O envio é síncrono e grava o run a cada
 * id criado; 5 min sem gravação é execução morta (mesmo prazo do generate-playbook).
 */
export const PLAYBOOK_SEND_STALE_MS = 5 * 60_000;

/** `since` = última atualização do registro (ISO). Data inválida nunca é "vencido". */
export function isStaleSend(since: string | null | undefined, nowMs: number, staleAfterMs: number): boolean {
  const at = Date.parse(since ?? "");
  return Number.isFinite(at) && nowMs - at > staleAfterMs;
}

export const STALE_SEND_MESSAGE =
  "O envio não terminou: a função foi encerrada antes de responder. O que já foi criado na conta está registrado; envie de novo para continuar de onde parou";

/** Erro gravado quando o destravamento por tempo dispara (formato do PerfectingError serializado). */
export function staleSendError(): { status: number; detail: { message: string } } {
  return { status: 408, detail: { message: STALE_SEND_MESSAGE } };
}

export const SEND_IN_PROGRESS_MESSAGE =
  "Já existe um envio em andamento para este item. Aguarde terminar (ou alguns minutos, se ele travou) antes de enviar de novo";
