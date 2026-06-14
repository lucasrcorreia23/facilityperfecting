import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { EvaluationReadView } from "@/app/components/evaluation/evaluation-read-view";
import { cn } from "@/app/lib/cn";
import {
  aggregateRoleplay,
  displayNameFor,
  formatScore5,
  initialsFor,
} from "@/app/lib/evaluation";
import type { EvalWeights, Profile, RoleplayEvaluation } from "@/app/lib/types";

function InitialChip({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border border-white text-[10px] font-semibold ring-1 ring-slate-200",
        muted ? "bg-slate-100 text-slate-400" : "bg-blue-100 text-blue-700",
      )}
    >
      {text}
    </span>
  );
}

export function EvaluatorRow({
  evaluation,
  profile,
  weights,
  expanded,
  onToggle,
  isCurrentUser,
}: {
  evaluation: RoleplayEvaluation | undefined;
  profile: Profile;
  weights: EvalWeights;
  expanded: boolean;
  onToggle: () => void;
  isCurrentUser?: boolean;
}) {
  const name = displayNameFor(profile);
  const hasEvaluated = evaluation !== undefined;

  if (!hasEvaluated) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-sm border border-transparent px-2 py-2 text-sm",
          isCurrentUser && "border-slate-100 bg-slate-50/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <InitialChip text={initialsFor(profile)} muted />
          <span className="truncate text-slate-500">
            {name}
            {isCurrentUser && (
              <span className="ml-1.5 text-xs font-medium text-slate-400">Você</span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-slate-400">Pendente</span>
      </div>
    );
  }

  const overall = aggregateRoleplay(evaluation.readiness_id, [evaluation], weights).overall;
  const detailId = `eval-detail-${evaluation.id}`;

  return (
    <div
      className={cn(
        "rounded-sm border transition-colors",
        expanded ? "border-slate-200 bg-white" : "border-transparent",
        isCurrentUser && !expanded && "border-blue-100 bg-blue-50/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-2 py-2 text-sm transition-colors",
          "rounded-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          expanded && "hover:bg-transparent",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <InitialChip text={initialsFor(profile)} />
          <span className="truncate text-slate-700">
            {name}
            {isCurrentUser && (
              <span className="ml-1.5 text-xs font-medium text-blue-600">Você</span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-semibold tabular-nums text-slate-800">
            {formatScore5(overall)}
          </span>
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 text-slate-400 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>
      {expanded && (
        <div id={detailId} className="border-t border-slate-100 bg-slate-50/80 px-2 py-3">
          <EvaluationReadView evaluation={evaluation} />
        </div>
      )}
    </div>
  );
}
