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

export interface EvaluationKpis {
  total: number;
  /** média dos overall (1..5), só roleplays avaliados; null se nenhum */
  scoreMedio: number | null;
  /** 0..1: fração de roleplays com ≥1 avaliação */
  pctAvaliados: number;
  /** roleplays sem nenhuma avaliação */
  pendencias: number;
  bloqueios: number;
}

export function computeEvaluationKpis(
  rows: { id: string; status: string }[],
  aggregates: Map<string, RoleplayAggregate>,
): EvaluationKpis {
  const total = rows.length;
  const avaliados = rows.filter((r) => (aggregates.get(r.id)?.evaluatorCount ?? 0) > 0);
  const overalls = avaliados
    .map((r) => aggregates.get(r.id)?.overall)
    .filter((v): v is number => typeof v === "number");
  return {
    total,
    scoreMedio: overalls.length
      ? overalls.reduce((a, b) => a + b, 0) / overalls.length
      : null,
    pctAvaliados: total ? avaliados.length / total : 0,
    pendencias: total - avaliados.length,
    bloqueios: rows.filter((r) => r.status === "bloqueado").length,
  };
}

/** Score 1..5 formatado em pt-BR (vírgula), ou "—" quando null. */
export function formatScore5(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1).replace(".", ",")} / ${SCORE_MAX}`;
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
