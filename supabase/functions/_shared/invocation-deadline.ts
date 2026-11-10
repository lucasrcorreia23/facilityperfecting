/**
 * Prazo de uma etapa longa (chamada de IA) contado contra o relógio da
 * INVOCAÇÃO da Edge Function, não a partir do início da etapa.
 *
 * O Supabase encerra a função em ~150s sem deixar responder — o front recebe
 * só "Edge Function returned a non-2xx status code". Um prazo fixo por etapa
 * ignora o que já foi gasto antes dela (auth, login e catálogos na Perfecting,
 * que com o HML lento levam dezenas de segundos) e deixa a função morrer calada.
 */

/** Teto de uma etapa, mesmo com a invocação inteira livre. */
export const PART_MAX_MS = 120_000;
/** Até onde a invocação pode ir: sobra ~10s do teto de ~150s para responder. */
export const WALL_BUDGET_MS = 140_000;
/** Menos que isto não dá para uma chamada de IA terminar — melhor recusar já. */
export const MIN_PART_MS = 20_000;

export interface PartDeadlineInput {
  /** `Date.now()` no início do handler. */
  requestStartedAt: number;
  now: number;
  perPartMax?: number;
  wallBudget?: number;
}

/** max(0, min(perPartMax, wallBudget − tempo já gasto)). */
export function partDeadlineMs({
  requestStartedAt,
  now,
  perPartMax = PART_MAX_MS,
  wallBudget = WALL_BUDGET_MS,
}: PartDeadlineInput): number {
  const elapsed = Math.max(0, now - requestStartedAt);
  return Math.max(0, Math.min(perPartMax, wallBudget - elapsed));
}

/** O prazo que sobrou ainda comporta uma etapa? */
export function hasBudgetForPart(deadlineMs: number, minimum = MIN_PART_MS): boolean {
  return deadlineMs >= minimum;
}

export const PREPARATION_TOO_SLOW_MESSAGE =
  "A preparação demorou demais (Perfecting HML lenta); tente de novo.";
