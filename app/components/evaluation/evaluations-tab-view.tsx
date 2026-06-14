"use client";

import { useEffect, useMemo, useState } from "react";
import { EvaluatorRow } from "@/app/components/evaluation/evaluator-row";
import { displayNameFor, formatScore5, type RoleplayAggregate } from "@/app/lib/evaluation";
import type { EvalWeights, Profile, RoleplayEvaluation } from "@/app/lib/types";

export function EvaluationsTabView({
  profiles,
  evals,
  weights,
  currentUserId,
  readinessId,
  agg,
}: {
  profiles: Profile[];
  evals: RoleplayEvaluation[];
  weights: EvalWeights;
  currentUserId: string | null;
  readinessId: string;
  agg: RoleplayAggregate | null;
}) {
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);

  const evalByProfileId = useMemo(
    () => new Map(evals.map((e) => [e.evaluator_id, e])),
    [evals],
  );

  const sortedProfiles = useMemo(
    () =>
      [...profiles].sort((a, b) =>
        displayNameFor(a).localeCompare(displayNameFor(b), "pt-BR"),
      ),
    [profiles],
  );

  useEffect(() => {
    setExpandedProfileId(null);
  }, [readinessId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-sm bg-slate-50 px-4 py-3">
        <span className="text-sm font-medium text-slate-600">
          Média das avaliações
          {agg && agg.evaluatorCount > 0 && (
            <span className="ml-1 font-normal text-slate-400">
              ({agg.evaluatorCount} de {profiles.length})
            </span>
          )}
        </span>
        <span className="text-lg font-semibold tabular-nums text-slate-800">
          {formatScore5(agg?.overall ?? null)}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
      {sortedProfiles.map((profile) => (
        <EvaluatorRow
          key={profile.id}
          profile={profile}
          evaluation={evalByProfileId.get(profile.id)}
          weights={weights}
          expanded={expandedProfileId === profile.id}
          onToggle={() =>
            setExpandedProfileId((prev) => (prev === profile.id ? null : profile.id))
          }
          isCurrentUser={currentUserId !== null && profile.id === currentUserId}
        />
        ))}
      </div>
    </div>
  );
}
