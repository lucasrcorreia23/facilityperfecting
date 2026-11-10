/**
 * Quais rascunhos da Biblioteca servem de "material revisado" para um playbook, e
 * em que ordem aparecem no seletor.
 */

import { sanitizeGapAnswers } from "../../supabase/functions/_shared/gap-answers";

/** Só o que estas regras leem de um rascunho (DraftRow serve). */
export interface ReviewedDraftCandidate {
  id: string;
  title: string | null;
  connection_id: string | null;
  updated_at: string;
  scenario?: { generation_mode?: string | null; debate?: unknown; gap_answers?: unknown } | null;
  generation_output?: unknown;
  offer?: { offer_name?: string | null } | null;
  connection?: { org_name?: string | null; environment?: string | null } | null;
}

export interface ReviewedDraftOption {
  id: string;
  title: string;
  /** "Conta (ambiente)" ou "Sem conta". */
  account: string;
  updated_at: string;
  /** Respostas do operador às lacunas que vão junto. */
  answers: number;
  /** É da conta para onde o playbook já foi enviado. */
  sameAccount: boolean;
}

/**
 * Serve quem passou pela IA (tem campos revisados de verdade — sem isso a
 * "descrição" é o material cru) e não é debate (outro formato, sem oferta nem
 * perfil). Primeiro os da conta do playbook, quando ele já tem uma; depois os
 * mais recentes.
 */
export function reviewedDraftOptions(
  drafts: ReviewedDraftCandidate[],
  preferConnectionId?: string | null,
): ReviewedDraftOption[] {
  return drafts
    .filter((d) => d.generation_output != null && d.scenario?.generation_mode !== "debate" && !d.scenario?.debate)
    .map((d) => ({
      id: d.id,
      title: d.title?.trim() || d.offer?.offer_name?.trim() || "Rascunho sem título",
      account: d.connection?.org_name
        ? `${d.connection.org_name}${d.connection.environment ? ` (${d.connection.environment})` : ""}`
        : "Sem conta",
      updated_at: d.updated_at,
      answers: sanitizeGapAnswers(d.scenario?.gap_answers).length,
      sameAccount: Boolean(preferConnectionId) && d.connection_id === preferConnectionId,
    }))
    .sort(
      (a, b) =>
        Number(b.sameAccount) - Number(a.sameAccount) || (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0),
    );
}
