/**
 * "Reprocessar com as respostas" na Criação: o que a nova saída da IA pode
 * atualizar no formulário e o que fica como o operador deixou.
 *
 * Regra, campo a campo:
 *  - vazio no formulário            → preenche com a nova saída;
 *  - igual ao que a IA gerou antes  → ninguém mexeu: atualiza com a nova saída;
 *  - diferente do que a IA gerou    → edição manual: PRESERVA, e a nova versão
 *    fica como sugestão (a tela oferece "Usar a versão da IA").
 *
 * Listas (objeções, regras) e o dossiê contam como UM campo: casar item por título
 * duplicaria (a IA renomeia a cada rodada) e ressuscitaria item apagado à mão.
 * Campo que a rodada anterior não gerou (ex.: cenário, quando ela rodou no modo
 * playbook) não tem com o que comparar — conta como editado.
 *
 * Não reusa `diffGeneration`: ele filtra campos por modo e compara o que vai para a
 * conta (descrição vazia vira o material cru), não o que está no formulário.
 */

export const MERGE_FIELDS = [
  { key: "oferta_nome", label: "Nome da oferta" },
  { key: "oferta_descricao", label: "Descrição da oferta" },
  { key: "perfil", label: "Perfil do comprador" },
  { key: "personas_variacao", label: "Variação das personas" },
  { key: "objecoes", label: "Objeções" },
  { key: "guardrails", label: "Regras de comportamento" },
  { key: "cenario_instrucoes", label: "Comportamento do cenário" },
  { key: "objetivo", label: "Objetivo de treino" },
  { key: "habilidades", label: "Habilidades a treinar" },
  { key: "call_context_slug", label: "Tipo de chamada" },
  { key: "dificuldade", label: "Dificuldade" },
  { key: "dossie", label: "Dossiê do comprador" },
] as const;

export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];

/** O formulário (ou uma saída da IA) nas chaves do ProcessImportResult. */
export type MergeForm = Partial<Record<MergeFieldKey, unknown>>;

export type MergeOutcome = "filled" | "updated" | "preserved";

export interface MergeChange {
  key: MergeFieldKey;
  label: string;
  outcome: MergeOutcome;
}

export interface MergeResult {
  /** Só as chaves que mudam no formulário. */
  values: MergeForm;
  /** O que foi preenchido, atualizado ou preservado — o que não mudou fica de fora. */
  changes: MergeChange[];
  /** Nova versão da IA dos campos preservados, para o operador aceitar se quiser. */
  suggestions: MergeForm;
}

/** JSON com chaves ordenadas: igualdade estrutural sem depender da ordem das chaves. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(typeof value === "string" ? value.trim() : value) ?? "null";
}

const isEmpty = (v: unknown) =>
  v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

const same = (a: unknown, b: unknown) => (isEmpty(a) && isEmpty(b)) || stable(a) === stable(b);

/**
 * `previousAi` = a saída da rodada anterior (o que o formulário recebeu da IA);
 * `nextAi` = a saída desta rodada. As três pontas nas mesmas chaves.
 */
export function mergeWithAnswers(input: {
  current: MergeForm;
  previousAi: MergeForm | null | undefined;
  nextAi: MergeForm;
}): MergeResult {
  const { current, previousAi, nextAi } = input;
  const values: MergeForm = {};
  const suggestions: MergeForm = {};
  const changes: MergeChange[] = [];
  for (const { key, label } of MERGE_FIELDS) {
    const next = nextAi[key];
    // A IA não gerou este campo nesta rodada (modo playbook pula cenário e dossiê).
    if (isEmpty(next)) continue;
    const cur = current[key];
    if (same(cur, next)) continue;
    if (isEmpty(cur)) {
      values[key] = next;
      changes.push({ key, label, outcome: "filled" });
      continue;
    }
    const prev = previousAi?.[key];
    const untouched = previousAi != null && !isEmpty(prev) && same(cur, prev);
    if (untouched) {
      values[key] = next;
      changes.push({ key, label, outcome: "updated" });
    } else {
      suggestions[key] = next;
      changes.push({ key, label, outcome: "preserved" });
    }
  }
  return { values, changes, suggestions };
}

const labels = (changes: MergeChange[], outcome: MergeOutcome) =>
  changes.filter((c) => c.outcome === outcome).map((c) => c.label);

/** Resumo em uma linha para o aviso depois do reprocessamento. */
export function describeMerge(changes: MergeChange[]): string {
  const updated = [...labels(changes, "filled"), ...labels(changes, "updated")];
  const preserved = labels(changes, "preserved");
  const parts = [
    updated.length > 0 && `Atualizado: ${updated.join(", ")}.`,
    preserved.length > 0 && `Preservado (editado à mão): ${preserved.join(", ")}.`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Nenhum campo mudou com as respostas.";
}
