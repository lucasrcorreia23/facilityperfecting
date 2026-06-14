import { EVALUATION_CRITERIA } from "@/app/lib/evaluation-criteria";
import { formatCriterionScore } from "@/app/lib/evaluation";
import { cn } from "@/app/lib/cn";
import type { RoleplayEvaluation } from "@/app/lib/types";

function ScoreBadge({ score }: { score: unknown }) {
  const formatted = formatCriterionScore(score);
  const hasScore = formatted !== "—";

  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border px-2.5 py-1 text-sm font-semibold tabular-nums",
        hasScore
          ? "border-[var(--primary)]/20 bg-[var(--primary)]/5 text-slate-900"
          : "border-slate-200 bg-slate-50 text-xs font-medium text-slate-400",
      )}
    >
      {hasScore ? formatted : "Sem nota"}
    </span>
  );
}

function CommentBox({
  label,
  text,
  emptyLabel,
}: {
  label?: string;
  text?: string | null;
  emptyLabel: string;
}) {
  const content = text?.trim();

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      )}
      <div
        className={cn(
          "rounded-sm border px-3 py-2 text-sm leading-relaxed",
          content
            ? "border-slate-200 bg-white text-slate-700"
            : "border-dashed border-slate-200 bg-white/60 text-slate-400",
        )}
      >
        {content ? content : <span className="italic">{emptyLabel}</span>}
      </div>
    </div>
  );
}

export function EvaluationReadView({
  evaluation,
}: {
  evaluation: Pick<RoleplayEvaluation, "scores" | "comments" | "overall_comment">;
}) {
  const { scores, comments, overall_comment } = evaluation;

  return (
    <div className="flex flex-col gap-3">
      {EVALUATION_CRITERIA.map((c) => {
        const comment = comments?.[c.key];
        return (
          <div
            key={c.key}
            className="flex flex-col gap-3 rounded-sm border border-slate-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{c.label}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.description}</p>
              </div>
              <ScoreBadge score={scores?.[c.key]} />
            </div>
            <CommentBox text={comment} emptyLabel="Sem comentário" label="Comentário" />
          </div>
        );
      })}

      <div className="rounded-sm border border-slate-200 bg-slate-100/70 p-3">
        <CommentBox
          label="Comentário geral"
          text={overall_comment}
          emptyLabel="Sem comentário geral"
        />
      </div>
    </div>
  );
}
