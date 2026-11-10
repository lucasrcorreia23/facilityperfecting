/**
 * Regras puras da tela do playbook (autoria local): de que tipo é o erro em
 * tela, quando excluir pede confirmação e como nomear uma etapa nova.
 */

/** Só o que estas regras leem — os tipos completos estão em `types.ts`. */
interface PlaybookErrorSource {
  status: string;
  error_detail: Record<string, unknown> | null;
  export_run: { error?: unknown } | null;
}

export type PlaybookFailure =
  | { kind: "send"; error: unknown }
  | { kind: "generation"; message: string | null }
  | null;

/**
 * Separa erro de ENVIO de erro de GERAÇÃO. O envio grava em `export_run.error`
 * e devolve o playbook a "ready". Playbooks que falharam ANTES dessa mudança
 * ficaram com `status: "error"` e o erro de envio em `error_detail`, no formato
 * `{ status: <http>, detail }` — a geração só grava `{ message }`. Sem reconhecer
 * esse legado, eles continuariam oferecendo "Retomar geração".
 */
export function classifyPlaybookFailure(playbook: PlaybookErrorSource): PlaybookFailure {
  const sendError = playbook.export_run?.error;
  if (sendError != null) return { kind: "send", error: sendError };
  if (playbook.status !== "error") return null;
  const detail = playbook.error_detail;
  if (detail && typeof detail.status === "number") return { kind: "send", error: detail };
  return {
    kind: "generation",
    message: typeof detail?.message === "string" ? detail.message : null,
  };
}

interface BlockContent {
  description: string | null;
  objective: string | null;
  sample_questions: string[] | null;
  what_to_do: string[] | null;
  what_to_avoid: string[] | null;
}

/** Subetapa com algo escrito além do nome — excluir sem perguntar perderia trabalho. */
export function blockHasContent(block: BlockContent): boolean {
  return Boolean(
    block.description?.trim() ||
      block.objective?.trim() ||
      block.sample_questions?.length ||
      block.what_to_do?.length ||
      block.what_to_avoid?.length,
  );
}

const normalize = (name: string) => name.trim().toLocaleLowerCase("pt-BR");

/**
 * Nome padrão que ainda não existe na lista: "Nova etapa", "Nova etapa 2"…
 * A Perfecting recusa nome de etapa repetido no mesmo playbook — e recusa com
 * um 500 genérico. Compara sem maiúsculas e sem espaços nas pontas.
 */
export function nextDefaultName(base: string, existing: string[]): string {
  const taken = new Set(existing.map(normalize));
  if (!taken.has(normalize(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(normalize(candidate))) return candidate;
  }
}
