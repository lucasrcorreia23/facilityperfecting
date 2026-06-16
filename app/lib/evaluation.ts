import { CRITERION_KEYS, SCORE_MAX, SCORE_MIN } from "@/app/lib/evaluation-criteria";
import type { EvalWeights, Profile, RoleplayEvaluation } from "@/app/lib/types";

export interface CriterionAggregate {
  key: string;
  /** média entre avaliadores que deram nota válida; null se ninguém */
  average: number | null;
  count: number;
}

export interface RoleplayAggregate {
  readinessId: string;
  perCriterion: CriterionAggregate[];
  /** média ponderada das médias por critério (1..5); null se ninguém avaliou */
  overall: number | null;
  evaluatorCount: number;
  evaluatorIds: string[];
}

/** Nota é válida apenas se inteira dentro de [SCORE_MIN, SCORE_MAX]. */
function validScore(v: unknown): v is number {
  return typeof v === "number" && v >= SCORE_MIN && v <= SCORE_MAX;
}

/**
 * Agrega as avaliações de UM roleplay. Para cada critério, faz a média das notas
 * válidas; o overall é a média ponderada dessas médias, renormalizando os pesos
 * pelos critérios que têm ao menos uma nota (assim um critério não avaliado não
 * derruba o score). Retorna overall null quando não há nenhuma nota.
 */
export function aggregateRoleplay(
  readinessId: string,
  evals: RoleplayEvaluation[],
  weights: EvalWeights,
): RoleplayAggregate {
  const perCriterion: CriterionAggregate[] = CRITERION_KEYS.map((key) => {
    const notes = evals.map((e) => e.scores?.[key]).filter(validScore);
    const average = notes.length
      ? notes.reduce((a, b) => a + b, 0) / notes.length
      : null;
    return { key, average, count: notes.length };
  });

  let weightedSum = 0;
  let weightTotal = 0;
  for (const c of perCriterion) {
    if (c.average === null) continue;
    const w = Number(weights?.[c.key] ?? 0);
    if (w <= 0) continue;
    weightedSum += c.average * w;
    weightTotal += w;
  }
  const overall = weightTotal > 0 ? weightedSum / weightTotal : null;

  const evaluatorIds = evals.map((e) => e.evaluator_id);
  return {
    readinessId,
    perCriterion,
    overall,
    evaluatorCount: evaluatorIds.length,
    evaluatorIds,
  };
}

export const REQUIRED_EVALUATIONS_PER_ROLEPLAY = 4;

export interface EvaluationKpis {
  total: number;
  /** média dos overall (1..5), só roleplays avaliados; null se nenhum */
  scoreMedio: number | null;
  /** 0..1: fração das avaliações feitas vs. meta (4 por roleplay) */
  pctAvaliados: number;
  /** slots de avaliação ainda faltando (meta 4 × roleplays − já feitas) */
  pendencias: number;
  bloqueios: number;
}

export function computeEvaluationKpis(
  rows: { id: string; status: string }[],
  aggregates: Map<string, RoleplayAggregate>,
  requiredPerRoleplay: number = REQUIRED_EVALUATIONS_PER_ROLEPLAY,
): EvaluationKpis {
  const total = rows.length;
  const meta = total * requiredPerRoleplay;
  let feitas = 0;
  for (const r of rows) {
    const count = aggregates.get(r.id)?.evaluatorCount ?? 0;
    feitas += Math.min(count, requiredPerRoleplay);
  }

  const avaliados = rows.filter((r) => (aggregates.get(r.id)?.evaluatorCount ?? 0) > 0);
  const overalls = avaliados
    .map((r) => aggregates.get(r.id)?.overall)
    .filter((v): v is number => typeof v === "number");
  return {
    total,
    scoreMedio: overalls.length
      ? overalls.reduce((a, b) => a + b, 0) / overalls.length
      : null,
    pctAvaliados: meta ? feitas / meta : 0,
    pendencias: meta - feitas,
    bloqueios: rows.filter((r) => r.status === "bloqueado").length,
  };
}

/** Score 1..5 formatado em pt-BR (vírgula), ou "—" quando null. */
export function formatScore5(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1).replace(".", ",")} / ${SCORE_MAX}`;
}

/** Nota inteira de um critério (1..5) ou "—" quando inválida/ausente. */
export function formatCriterionScore(n: unknown): string {
  if (!validScore(n)) return "—";
  return `${n} / ${SCORE_MAX}`;
}

/** Percentual inteiro a partir de uma fração 0..1 (ex.: 0.5 → "50%"). */
export function formatPct(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}

/** Iniciais (1–2 letras) a partir do display_name ou do email. */
export function initialsFor(p: Pick<Profile, "display_name" | "email">): string {
  const source = (p.display_name?.trim() || p.email?.split("@")[0] || "?").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

/** Nome curto para exibição: display_name ou parte antes do @ do email. */
export function displayNameFor(p: Pick<Profile, "display_name" | "email">): string {
  return p.display_name?.trim() || p.email?.split("@")[0] || "Usuário";
}
