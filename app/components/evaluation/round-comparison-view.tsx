import { EVALUATION_CRITERIA } from "@/app/lib/evaluation-criteria";
import { formatScore5, type RoleplayAggregate } from "@/app/lib/evaluation";
import { cn } from "@/app/lib/cn";

export interface RoundPoint {
  roundId: string;
  roundName: string;
  position: number;
  status: "aberto" | "fechado";
  /** este é o round do roleplay aberto no modal */
  current: boolean;
  agg: RoleplayAggregate;
}

/** Delta entre dois scores (1..5): "+0,4" / "−0,2" / "—". */
function formatDelta(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return "—";
  const d = curr - prev;
  if (Math.abs(d) < 0.05) return "=";
  const sign = d > 0 ? "+" : "−";
  return `${sign}${Math.abs(d).toFixed(1).replace(".", ",")}`;
}

function deltaTone(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return "text-slate-400";
  const d = curr - prev;
  if (Math.abs(d) < 0.05) return "text-slate-400";
  return d > 0 ? "text-green-600" : "text-red-600";
}

/**
 * Evolução do mesmo roleplay (linhagem) ao longo dos rounds. Mostra o score
 * geral de cada round + variação vs. o round anterior, e o detalhe por critério.
 */
export function RoundComparisonView({ points }: { points: RoundPoint[] | null }) {
  if (points === null) {
    return <p className="py-6 text-center text-sm text-slate-400">Carregando evolução…</p>;
  }
  if (points.length <= 1) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        Este roleplay só existe em um round. Crie um novo round para comparar a evolução.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Score geral por round */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Score geral por round
        </div>
        {points.map((p, i) => {
          const prev = i > 0 ? points[i - 1].agg.overall : null;
          return (
            <div
              key={p.roundId}
              className={cn(
                "flex items-center justify-between gap-3 rounded-sm border px-3 py-2.5",
                p.current ? "border-[var(--primary)] bg-blue-50/40" : "border-slate-200 bg-white",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {p.roundName}
                  {p.status === "fechado" && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      fechado
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {p.agg.evaluatorCount > 0
                    ? `${p.agg.evaluatorCount} ${p.agg.evaluatorCount === 1 ? "avaliação" : "avaliações"}`
                    : "sem avaliações"}
                </p>
              </div>
              {i > 0 && (
                <span className={cn("shrink-0 text-xs font-medium tabular-nums", deltaTone(p.agg.overall, prev))}>
                  {formatDelta(p.agg.overall, prev)}
                </span>
              )}
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                {formatScore5(p.agg.overall)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Detalhe por critério × round */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Médias por critério × round
        </div>
        <div className="overflow-x-auto rounded-sm border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs font-semibold text-slate-500">
                <th className="px-3 py-2 text-left">Critério</th>
                {points.map((p) => (
                  <th key={p.roundId} className="px-3 py-2 text-right whitespace-nowrap">
                    {p.roundName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVALUATION_CRITERIA.map((c) => (
                <tr key={c.key} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{c.label}</td>
                  {points.map((p) => {
                    const pc = p.agg.perCriterion.find((x) => x.key === c.key);
                    const has = pc !== undefined && pc.average !== null;
                    return (
                      <td
                        key={p.roundId}
                        className="px-3 py-2 text-right tabular-nums text-slate-700"
                      >
                        {has ? pc!.average!.toFixed(1).replace(".", ",") : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
