/**
 * Limites do backend da Perfecting para playbook, espelhados aqui para validar
 * ANTES do envio. O backend não valida tamanho: estoura no banco e devolve um
 * 500 genérico ("Internal server error."), sem dizer qual campo.
 *
 * Fonte (backend, conferido em 2026-11-10):
 *  - src/data/main_db/models/role_plays.py — PlaybookModel.name,
 *    PlaybookCallTypeModel.name/description e PlaybookCallBlockModel.name/description
 *    são String(255); UniqueConstraint('name', 'playbook_id') nas etapas.
 *  - src/application/services/role_plays/s37_playbook_crud.py —
 *    _MAX_ROOT_CALL_BLOCKS_PER_CALL_TYPE = 6.
 *
 * Sem imports de propósito: o editor (Next) e as Edge Functions (Deno) usam o
 * mesmo arquivo.
 */

export const PLAYBOOK_NAME_MAX = 255;
export const CALL_TYPE_NAME_MAX = 255;
export const CALL_TYPE_DESCRIPTION_MAX = 255;
export const CALL_BLOCK_NAME_MAX = 255;
export const CALL_BLOCK_DESCRIPTION_MAX = 255;
/** Subetapas raiz por etapa (a facility só cria subetapas raiz). */
export const MAX_CALL_BLOCKS_PER_CALL_TYPE = 6;

/** Alvos pedidos à IA — abaixo do teto, para sobrar folga de edição. */
export const GENERATED_NAME_TARGET = 120;
export const GENERATED_DESCRIPTION_TARGET = 250;

/**
 * Trecho do prompt do generate-playbook. Vai FORA do prompt base (que o
 * `prompt_override` substitui), para valer sempre.
 */
export const PLAYBOOK_GENERATION_LIMITS_PROMPT = `LIMITES DA PLATAFORMA (obrigatórios — acima disso o envio é recusado):
- name de etapa e de subetapa: no máximo ${GENERATED_NAME_TARGET} caracteres.
- description de etapa e de subetapa: no máximo ${GENERATED_DESCRIPTION_TARGET} caracteres, contando espaços. Uma ou duas frases; o detalhe vai em objective, sample_questions, what_to_do e what_to_avoid, que não têm esse limite.
- No máximo ${MAX_CALL_BLOCKS_PER_CALL_TYPE} subetapas por etapa.
- Nomes de etapa não se repetem dentro do playbook.`;

export interface PlaybookExportBlockInput {
  name: string;
  description?: string | null;
}

export interface PlaybookExportCallTypeInput {
  name: string;
  description?: string | null;
  blocks?: PlaybookExportBlockInput[];
}

export interface PlaybookExportInput {
  name: string;
  callTypes: PlaybookExportCallTypeInput[];
}

export type PlaybookExportIssueKind =
  | "too_long"
  | "empty"
  | "too_many_blocks"
  | "duplicate_name";

export interface PlaybookExportIssue {
  kind: PlaybookExportIssueKind;
  /** Posição (1-based) e nome da etapa; `null` quando o problema é do playbook. */
  callTypeIndex: number | null;
  callType: string | null;
  /** Posição (1-based) e nome da subetapa, quando o problema é dela. */
  callBlockIndex: number | null;
  callBlock: string | null;
  field: "name" | "description" | "call_blocks";
  limit: number | null;
  actual: number | null;
  /** Frase pronta para a tela. */
  message: string;
}

/** Comparação de nomes: sem maiúsculas e sem espaços nas pontas. */
export function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("pt-BR");
}

const FIELD_LABEL = { name: "nome", description: "descrição" } as const;

function shortName(name: string): string {
  const clean = name.trim() || "(sem nome)";
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

/**
 * O que o envio manda de fato: sem descrição, o export usa o nome no lugar
 * (a API exige `description`).
 */
function sentDescription(item: { name: string; description?: string | null }): string {
  return item.description ?? item.name;
}

/**
 * Confere o playbook contra os limites do backend. Lista vazia = pode enviar.
 * Não trunca nada: quem decide o que cortar é a pessoa, no editor.
 */
export function validatePlaybookForExport(input: PlaybookExportInput): PlaybookExportIssue[] {
  const issues: PlaybookExportIssue[] = [];

  const tooLong = (
    where: Pick<PlaybookExportIssue, "callTypeIndex" | "callType" | "callBlockIndex" | "callBlock">,
    label: string,
    field: "name" | "description",
    value: string,
    limit: number,
  ) => {
    if (value.length <= limit) return;
    issues.push({
      kind: "too_long",
      ...where,
      field,
      limit,
      actual: value.length,
      message: `${label}: ${FIELD_LABEL[field]} com ${value.length} caracteres — o limite é ${limit} (corte ${value.length - limit}).`,
    });
  };

  const playbookWhere = { callTypeIndex: null, callType: null, callBlockIndex: null, callBlock: null };
  if (!input.name.trim()) {
    issues.push({
      kind: "empty",
      ...playbookWhere,
      field: "name",
      limit: null,
      actual: 0,
      message: "Playbook: o nome está vazio.",
    });
  }
  tooLong(playbookWhere, "Playbook", "name", input.name, PLAYBOOK_NAME_MAX);

  const seen = new Map<string, number>();
  input.callTypes.forEach((ct, i) => {
    const index = i + 1;
    const label = `Etapa ${index} (${shortName(ct.name)})`;
    const where = { callTypeIndex: index, callType: ct.name, callBlockIndex: null, callBlock: null };

    if (!ct.name.trim()) {
      issues.push({
        kind: "empty",
        ...where,
        field: "name",
        limit: null,
        actual: 0,
        message: `Etapa ${index}: o nome está vazio.`,
      });
    } else {
      const key = normalizeName(ct.name);
      const first = seen.get(key);
      if (first != null) {
        issues.push({
          kind: "duplicate_name",
          ...where,
          field: "name",
          limit: null,
          actual: null,
          message: `${label}: mesmo nome da etapa ${first} — cada etapa do playbook precisa de um nome diferente.`,
        });
      } else {
        seen.set(key, index);
      }
    }
    tooLong(where, label, "name", ct.name, CALL_TYPE_NAME_MAX);
    tooLong(where, label, "description", sentDescription(ct), CALL_TYPE_DESCRIPTION_MAX);

    const blocks = ct.blocks ?? [];
    if (blocks.length > MAX_CALL_BLOCKS_PER_CALL_TYPE) {
      issues.push({
        kind: "too_many_blocks",
        ...where,
        field: "call_blocks",
        limit: MAX_CALL_BLOCKS_PER_CALL_TYPE,
        actual: blocks.length,
        message: `${label}: ${blocks.length} subetapas — o limite é ${MAX_CALL_BLOCKS_PER_CALL_TYPE} por etapa (junte ou exclua ${blocks.length - MAX_CALL_BLOCKS_PER_CALL_TYPE}).`,
      });
    }

    blocks.forEach((block, j) => {
      const blockIndex = j + 1;
      const blockLabel = `${label} › subetapa ${blockIndex} (${shortName(block.name)})`;
      const blockWhere = { ...where, callBlockIndex: blockIndex, callBlock: block.name };
      if (!block.name.trim()) {
        issues.push({
          kind: "empty",
          ...blockWhere,
          field: "name",
          limit: null,
          actual: 0,
          message: `${label} › subetapa ${blockIndex}: o nome está vazio.`,
        });
      }
      tooLong(blockWhere, blockLabel, "name", block.name, CALL_BLOCK_NAME_MAX);
      tooLong(blockWhere, blockLabel, "description", sentDescription(block), CALL_BLOCK_DESCRIPTION_MAX);
    });
  });

  return issues;
}

/** Nomes de etapa (normalizados) que aparecem mais de uma vez — para o aviso no editor. */
export function duplicatedCallTypeNames(names: string[]): Set<string> {
  const count = new Map<string, number>();
  for (const name of names) {
    const key = normalizeName(name);
    if (key) count.set(key, (count.get(key) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([key]) => key));
}

/** Resumo para o 422 do export: "O playbook tem N pendência(s)…". */
export function exportIssuesMessage(issues: PlaybookExportIssue[]): string {
  return issues.length === 1
    ? "O playbook tem 1 pendência que a Perfecting recusaria. Corrija no editor e envie de novo"
    : `O playbook tem ${issues.length} pendências que a Perfecting recusaria. Corrija no editor e envie de novo`;
}
