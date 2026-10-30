/**
 * Diretrizes da equipe para o gerador (tabelas da migration 0024).
 *
 * O prompt base do código continua sendo a regra; as diretrizes ACRESCENTAM
 * orientação sem deploy: globais, por modo ou por conta. Entram num bloco próprio,
 * depois do bloco cacheado (base + taxonomias + data), para o cache não mudar entre
 * clientes. Funções puras aqui; a leitura do banco fica em loadGuidelines.
 */
import type { GuidelineRef } from "./generator-version.ts";

export type GuidelineTarget = "roleplay_import" | "playbook";

/** Linha de `generator_guidelines_current`. */
export interface GuidelineRow {
  id: string;
  target: GuidelineTarget;
  scope_type: "global" | "mode" | "connection";
  scope_keys: string[];
  title: string;
  position: number;
  active: boolean;
  version_id: string;
  version_no: number;
  body: string;
}

/** Teto do bloco: diretriz é ajuste fino, não um segundo prompt. */
export const MAX_GUIDELINES_CHARS = 12_000;

const SCOPE_ORDER = { global: 0, mode: 1, connection: 2 } as const;
const SCOPE_LABEL = { global: "Global", mode: "Modo", connection: "Conta" } as const;

/**
 * As diretrizes que valem para um processamento, na ordem global → modo → conta
 * (a mais específica por último, onde pesa mais). Corta no teto sem partir uma
 * diretriz ao meio: as que não cabem ficam de fora e voltam em `skipped`.
 */
export function selectGuidelines(
  rows: GuidelineRow[],
  opts: { target: GuidelineTarget; mode: string; connectionId: string | null },
): { selected: GuidelineRow[]; skipped: GuidelineRow[] } {
  const applies = (r: GuidelineRow) => {
    if (!r.active || r.target !== opts.target || !r.body.trim()) return false;
    if (r.scope_type === "global") return true;
    if (r.scope_type === "mode") return r.scope_keys.includes(opts.mode);
    return opts.connectionId != null && r.scope_keys.includes(opts.connectionId);
  };
  const ordered = rows
    .filter(applies)
    .sort((a, b) => SCOPE_ORDER[a.scope_type] - SCOPE_ORDER[b.scope_type] || a.position - b.position);
  const selected: GuidelineRow[] = [];
  const skipped: GuidelineRow[] = [];
  let used = 0;
  for (const r of ordered) {
    const size = r.body.trim().length;
    if (used + size > MAX_GUIDELINES_CHARS) {
      skipped.push(r);
      continue;
    }
    used += size;
    selected.push(r);
  }
  return { selected, skipped };
}

/** Bloco de texto que vai no system, ou null quando nenhuma diretriz vale. */
export function renderGuidelinesBlock(selected: GuidelineRow[]): string | null {
  if (selected.length === 0) return null;
  const items = selected.map(
    (r) => `## [${SCOPE_LABEL[r.scope_type]} · v${r.version_no}] ${r.title.trim()}\n${r.body.trim()}`,
  );
  return [
    "DIRETRIZES DA EQUIPE — complementam as instruções acima. Em conflito com uma REGRA acima (fidelidade ao material, nada de números ou datas inventados, o lado do vendedor fora do comprador), a regra acima prevalece.",
    ...items,
  ].join("\n\n");
}

export function guidelineRefs(selected: GuidelineRow[]): GuidelineRef[] {
  return selected.map((r) => ({
    guideline_id: r.id,
    version_id: r.version_id,
    version_no: r.version_no,
    scope_type: r.scope_type,
    title: r.title,
  }));
}

// deno-lint-ignore no-explicit-any
export async function loadGuidelines(db: any, target: GuidelineTarget): Promise<GuidelineRow[]> {
  const { data, error } = await db
    .from("generator_guidelines_current")
    .select("id, target, scope_type, scope_keys, title, position, active, version_id, version_no, body")
    .eq("target", target)
    .eq("active", true);
  if (error) throw new Error(`diretrizes não carregadas: ${error.message}`);
  return (data ?? []) as GuidelineRow[];
}
