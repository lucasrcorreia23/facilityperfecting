import { EVALUATION_CRITERIA } from "@/app/lib/evaluation-criteria";
import { formatScore5, type RoleplayAggregate } from "@/app/lib/evaluation";

function peopleEvaluatedLabel(count: number): string {
  if (count === 1) return "1 pessoa avaliou este critério";
  return `${count} pessoas avaliaram este critério`;
}

function overallEvaluationsLabel(count: number): string {
  if (count === 1) return "Média ponderada de 1 avaliação";
  return `Média ponderada de ${count} avaliações`;
}

export function ConsolidatedView({ agg }: { agg: RoleplayAggregate | null }) {
  const evaluatorCount = agg?.evaluatorCount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-sm bg-slate-50 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-slate-600">Qualidade geral</span>
          {evaluatorCount > 0 ? (
            <span className="text-xs text-slate-400">
              {overallEvaluationsLabel(evaluatorCount)}
            </span>
          ) : (
            <span className="text-xs italic text-slate-400">Ninguém avaliou ainda</span>
          )}
        </div>
        <span className="text-lg font-semibold tabular-nums text-slate-800">
          {formatScore5(agg?.overall ?? null)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Médias por critério
        </div>

        {EVALUATION_CRITERIA.map((c) => {
          const pc = agg?.perCriterion.find((p) => p.key === c.key);
          const hasAverage = pc !== undefined && pc.average !== null;

          return (
            <div
              key={c.key}
              className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{c.label}</div>
                {hasAverage ? (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {peopleEvaluatedLabel(pc.count)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs italic text-slate-400">
                    Ninguém avaliou este critério
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                {hasAverage ? formatScore5(pc.average) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
