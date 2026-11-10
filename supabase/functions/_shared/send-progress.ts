/**
 * O que um envio de roleplay já criou na conta — gravado no rascunho ENQUANTO o envio
 * roda (`error_detail.created`), e não só no fim.
 *
 * Por quê: o `case_setup/create` da Perfecting grava o roleplay e só depois monta o
 * prompt e o agente de voz. Se ele falha (ou a nossa função é encerrada) depois da
 * gravação, o roleplay existe lá e nós não temos o id. Sem registro, o reenvio cria
 * outro. Com o registro, o reenvio de um envio que NÃO terminou continua no mesmo
 * roleplay; e quem precisar desfazer à mão sabe quais ids apagar.
 *
 * Puro e sem imports.
 */

export interface PendingCaseSetup {
  context_id: number;
  /** Nome enviado ao create. É a chave de busca: `(context_id, training_name)` é único lá. */
  training_name: string;
}

export interface SendCreated {
  offer_id?: number;
  context_id?: number;
  persona_id?: number;
  case_setup_id?: number;
  /** Create disparado, resposta ainda não recebida. */
  pending_case_setup?: PendingCaseSetup;
  /** Debate: o que tentativas anteriores deixaram na conta (não há retomada). */
  previous_attempts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * O que a tentativa anterior deixou registrado — só quando ela não terminou (rascunho
 * em erro, ou preso em "exporting" além do prazo). Rascunho já exportado que alguém
 * reenvia de propósito NÃO retoma: é um roleplay novo.
 */
export function previousCreated(
  draft: { status?: string | null; error_detail?: unknown },
  staleExporting: boolean,
): SendCreated | null {
  const unfinished = draft.status === "error" || (draft.status === "exporting" && staleExporting);
  if (!unfinished || !isRecord(draft.error_detail)) return null;
  const created = draft.error_detail.created;
  return isRecord(created) && Object.keys(created).length > 0 ? (created as SendCreated) : null;
}

/**
 * Ponto de partida do registro desta tentativa. Venda retoma, então herda o anterior
 * (e vai sobrescrevendo). Debate cria tudo de novo: o anterior vira histórico, para
 * ninguém perder os ids do que ficou órfão na conta.
 */
export function startCreated(previous: SendCreated | null, mode: "sale" | "debate"): SendCreated {
  if (!previous) return {};
  if (mode === "sale") return { ...previous };
  const { previous_attempts, ...last } = previous;
  return { previous_attempts: [...(previous_attempts ?? []), last] };
}

/** Junta o registro ao detalhe de erro/aviso que vai para o rascunho. */
export function withCreated<T extends Record<string, unknown>>(
  detail: T,
  created: SendCreated,
): T & { created?: SendCreated } {
  return Object.keys(created).length > 0 ? { ...detail, created } : detail;
}

/**
 * O que derruba o `case_setup/create` DEPOIS de gravar o roleplay: o backend lê
 * `buyer_agent_first_messages[0]` para criar o agente de voz, já com a linha commitada.
 * Sem primeira fala, o roleplay nasce pela metade e a resposta é um 500 genérico.
 */
export function caseSetupPayloadIssues(payload: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const name = payload.training_name;
  if (typeof name !== "string" || !name.trim()) issues.push("o roleplay está sem nome (training_name)");
  const first = payload.buyer_agent_first_messages;
  const firstMessage = Array.isArray(first) ? first[0] : undefined;
  if (typeof firstMessage !== "string" || !firstMessage.trim()) {
    issues.push(
      "o roleplay está sem primeira fala do comprador (buyer_agent_first_messages): sem ela a Perfecting cria o roleplay e falha ao criar o agente de voz",
    );
  }
  return issues;
}

export interface RemoteCaseSetupRef {
  id: number;
  training_name: string;
}

/** Roleplays do contexto, do formato cru da listagem para o que a retomada usa. */
export function toCaseSetupRefs(items: ReadonlyArray<Record<string, unknown>>): RemoteCaseSetupRef[] {
  return items
    .filter((c) => typeof c.id === "number")
    .map((c) => ({ id: c.id as number, training_name: typeof c.training_name === "string" ? c.training_name : "" }));
}

/** Mesmo nome no contexto (a unicidade do banco é exata; aqui só tira espaço das pontas). */
export function findCaseSetupByName(
  list: readonly RemoteCaseSetupRef[],
  trainingName: string,
): RemoteCaseSetupRef | undefined {
  const target = trainingName.trim();
  if (!target) return undefined;
  return list.find((c) => c.training_name.trim() === target);
}

/**
 * Roleplay da tentativa anterior que ainda existe neste contexto: pelo id registrado
 * ou, se o create não chegou a responder, pelo nome que tinha sido enviado.
 */
export function adoptableCaseSetup(
  previous: SendCreated | null,
  contextId: number,
  list: readonly RemoteCaseSetupRef[],
): RemoteCaseSetupRef | null {
  if (!previous) return null;
  if (typeof previous.case_setup_id === "number") {
    const byId = list.find((c) => c.id === previous.case_setup_id);
    if (byId) return byId;
  }
  const pending = previous.pending_case_setup;
  if (pending && pending.context_id === contextId) {
    return findCaseSetupByName(list, pending.training_name) ?? null;
  }
  return null;
}
