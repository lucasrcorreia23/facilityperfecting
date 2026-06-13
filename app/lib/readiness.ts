import type { RoleplayReadiness, TrackingClient } from "@/app/lib/types";

/** Score ponderado (0–1) de um roleplay, usando os pesos do cliente. */
export function computeScore(row: RoleplayReadiness, client: TrackingClient): number {
  return (
    row.score_prompt * client.weight_prompt +
    row.score_roteiro * client.weight_roteiro +
    row.score_teste * client.weight_teste
  );
}

/** Score formatado como percentual inteiro (ex.: 0.85 → "85%"). */
export function formatScorePct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export interface ReadinessKpis {
  total: number;
  scoreMedio: number; // 0–1
  pctProntos: number; // 0–1
  pctTestados: number; // 0–1
  bloqueios: number;
}

/** KPIs do conjunto, espelhando o rodapé da planilha. */
export function computeKpis(rows: RoleplayReadiness[], client: TrackingClient): ReadinessKpis {
  const total = rows.length;
  if (total === 0) {
    return { total: 0, scoreMedio: 0, pctProntos: 0, pctTestados: 0, bloqueios: 0 };
  }
  const somaScore = rows.reduce((acc, r) => acc + computeScore(r, client), 0);
  const prontos = rows.filter((r) => r.status === "pronto").length;
  const testados = rows.filter((r) => r.score_teste === 1).length;
  const bloqueios = rows.filter((r) => r.status === "bloqueado").length;
  return {
    total,
    scoreMedio: somaScore / total,
    pctProntos: prontos / total,
    pctTestados: testados / total,
    bloqueios,
  };
}
