/**
 * De quais rascunhos veio o material revisado de um playbook.
 *
 * Mora em `playbooks.input_files` (jsonb), junto dos arquivos do material — sem
 * coluna nova. É o único JSON do playbook que sobrevive à geração: `export_run` é
 * zerado na regeração, `usage` é sobrescrito e `error_detail` é limpo. Estar no
 * banco (e não só no corpo da chamada) é o que faz "Tentar estruturar de novo" e
 * "Retomar geração" levarem o material revisado junto.
 *
 * Puro e sem imports de propósito: o front importa este arquivo, e o TypeScript do
 * Next não aceita caminho terminado em ".ts" (o Deno exige).
 */

export const REVIEWED_DRAFT_KIND = "reviewed_draft";

/** Mais que isto não cabe no orçamento do bloco (reviewed-material.ts). */
export const MAX_REVIEWED_DRAFTS = 5;

/** Entrada de `input_files` que aponta para um rascunho, no formato dos arquivos. */
export interface ReviewedDraftRef {
  kind: typeof REVIEWED_DRAFT_KIND;
  draft_id: string;
  /** "Rascunho revisado: <título>" — legível onde `input_files` é listado. */
  name: string;
  path: null;
  /** Tamanho do trecho deste rascunho na última geração (0 = ainda não gerou). */
  chars: number;
  /** `updated_at` do rascunho quando foi escolhido. */
  draft_updated_at?: string | null;
  /** Quando entrou numa geração pela última vez. */
  used_at?: string | null;
  /** O rascunho não existia mais (ou não era do dono do playbook) na última geração. */
  missing?: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const isRef = (entry: unknown): entry is Record<string, unknown> =>
  Boolean(entry) &&
  typeof entry === "object" &&
  (entry as Record<string, unknown>).kind === REVIEWED_DRAFT_KIND &&
  Boolean(str((entry as Record<string, unknown>).draft_id));

export const reviewedDraftName = (title: string | null | undefined) =>
  `Rascunho revisado: ${str(title) || "sem título"}`;

/** Os rascunhos apontados por `input_files`, sem repetição, até o máximo. */
export function reviewedDraftRefs(inputFiles: unknown): ReviewedDraftRef[] {
  if (!Array.isArray(inputFiles)) return [];
  const seen = new Set<string>();
  const out: ReviewedDraftRef[] = [];
  for (const entry of inputFiles) {
    if (!isRef(entry)) continue;
    const id = str(entry.draft_id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      kind: REVIEWED_DRAFT_KIND,
      draft_id: id,
      name: str(entry.name) || reviewedDraftName(null),
      path: null,
      chars: typeof entry.chars === "number" ? entry.chars : 0,
      draft_updated_at: str(entry.draft_updated_at) || null,
      used_at: str(entry.used_at) || null,
      ...(entry.missing === true ? { missing: true } : {}),
    });
  }
  return out.slice(0, MAX_REVIEWED_DRAFTS);
}

/** Só os arquivos do material (tudo o que não é referência a rascunho). */
export function materialFiles<T = unknown>(inputFiles: unknown): T[] {
  return Array.isArray(inputFiles) ? (inputFiles.filter((e) => !isRef(e)) as T[]) : [];
}

/**
 * `input_files` com a seleção nova de rascunhos: mantém os arquivos, troca as
 * referências. Rascunho que já estava escolhido conserva o histórico (used_at).
 */
export function withReviewedDrafts(
  inputFiles: unknown,
  drafts: Array<{ id: string; title?: string | null; updated_at?: string | null }>,
): unknown[] {
  const previous = new Map(reviewedDraftRefs(inputFiles).map((r) => [r.draft_id, r]));
  const seen = new Set<string>();
  const refs: ReviewedDraftRef[] = [];
  for (const d of drafts) {
    if (!d.id || seen.has(d.id)) continue;
    seen.add(d.id);
    const old = previous.get(d.id);
    refs.push({
      kind: REVIEWED_DRAFT_KIND,
      draft_id: d.id,
      name: reviewedDraftName(d.title),
      path: null,
      chars: old?.chars ?? 0,
      draft_updated_at: d.updated_at ?? null,
      used_at: old?.used_at ?? null,
    });
  }
  return [...materialFiles(inputFiles), ...refs.slice(0, MAX_REVIEWED_DRAFTS)];
}

/**
 * Depois de uma geração: carimba o que entrou (tamanho e hora) e marca o que não
 * foi encontrado. Não remove nada — a escolha é do operador.
 */
export function markReviewedDraftsUsed(
  inputFiles: unknown,
  used: Array<{ draft_id: string; chars: number }>,
  now: string,
): unknown[] {
  if (!Array.isArray(inputFiles)) return [];
  const byId = new Map(used.map((u) => [u.draft_id, u]));
  return inputFiles.map((entry) => {
    if (!isRef(entry)) return entry;
    const hit = byId.get(str(entry.draft_id));
    const rest: Record<string, unknown> = { ...entry };
    delete rest.missing;
    return hit ? { ...rest, chars: hit.chars, used_at: now } : { ...rest, chars: 0, missing: true };
  });
}
