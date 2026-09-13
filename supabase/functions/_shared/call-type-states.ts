/**
 * Situação de cada etapa de um playbook implementado na Perfecting — regra pura (sem
 * chamadas de API), usada pelo `implement-playbook` para decidir quando o envio acabou.
 *
 * Por que é preciso: o worker da Perfecting monta um roleplay por etapa, em sequência
 * (cria o case_setup, conteúdo por persona, comportamento, objeções, prompt, agente de
 * voz). Se um passo falha, ele marca a etapa como pulada, NÃO apaga o case_setup já
 * criado e segue para a próxima. Contar case_setups não basta: um roleplay pela metade
 * conta igual. E não há endpoint para ler o resultado por etapa do job.
 *
 * - completa: o roleplay tem agente de voz (último passo do ciclo);
 * - falhou: sem agente (ou sem roleplay) e uma etapa POSTERIOR já tem roleplay — o
 *   worker é sequencial, então já passou dela;
 * - pendente: ainda pode estar sendo montada. `treatPendingAsFailed` para quando não há
 *   mais o que esperar (stream concluído ou tempo esgotado).
 */

export interface CaseSetupCheck {
  call_type_id: number | null;
  has_agent: boolean;
}

export interface CallTypeState {
  call_type_id: number;
  name: string;
  case_setup_id: number | null;
  state: "complete" | "failed" | "pending";
}

/** `callTypes` na ordem do playbook; `checks` indexado por case_setup_id (string). */
export function computeCallTypeStates(
  callTypes: Array<{ id: number; name: string }>,
  caseSetupIds: number[],
  checks: Record<string, CaseSetupCheck>,
  { treatPendingAsFailed = false }: { treatPendingAsFailed?: boolean } = {},
): CallTypeState[] {
  const byCallType = new Map<number, { id: number; hasAgent: boolean }>();
  for (const id of caseSetupIds) {
    const check = checks[String(id)];
    if (!check || check.call_type_id == null) continue;
    const current = byCallType.get(check.call_type_id);
    // Duas tentativas na mesma etapa: vale a que terminou.
    if (!current || (!current.hasAgent && check.has_agent)) {
      byCallType.set(check.call_type_id, { id, hasAgent: check.has_agent });
    }
  }

  let lastWithCaseSetup = -1;
  callTypes.forEach((ct, i) => {
    if (byCallType.has(ct.id)) lastWithCaseSetup = i;
  });

  return callTypes.map((ct, i) => {
    const cs = byCallType.get(ct.id);
    const state: CallTypeState["state"] = cs?.hasAgent
      ? "complete"
      : i < lastWithCaseSetup || treatPendingAsFailed
        ? "failed"
        : "pending";
    return { call_type_id: ct.id, name: ct.name, case_setup_id: cs?.id ?? null, state };
  });
}

/** Um aviso por etapa que falhou — aparece na Biblioteca ("N aviso(s)" e no modal). */
export function incompleteCallTypeWarnings(states: CallTypeState[]): string[] {
  return states
    .filter((st) => st.state === "failed")
    .map((st) =>
      st.case_setup_id != null
        ? `etapa "${st.name}" (roleplay ${st.case_setup_id}) não terminou de ser montada na Perfecting: sem comportamento, prompt ou agente de voz`
        : `etapa "${st.name}" não gerou roleplay na Perfecting`,
    );
}
