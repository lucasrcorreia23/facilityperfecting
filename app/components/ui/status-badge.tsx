import { cn } from "@/app/lib/cn";
import type { DraftStatus } from "@/app/lib/types";

const MAP: Record<DraftStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-slate-100 text-slate-600" },
  exporting: { label: "Enviando…", cls: "bg-blue-50 text-blue-700" },
  completing: { label: "Completando…", cls: "bg-blue-50 text-blue-700" },
  exported: { label: "Exportado", cls: "bg-green-50 text-green-700" },
  // Âmbar, não vermelho: o roleplay existe e roda — só está incompleto.
  incomplete: { label: "Incompleto", cls: "bg-amber-50 text-amber-700" },
  error: { label: "Erro", cls: "bg-red-50 text-red-700" },
};

export function StatusBadge({ status }: { status: DraftStatus }) {
  const { label, cls } = MAP[status] ?? MAP.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {(status === "exporting" || status === "completing") && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {label}
    </span>
  );
}
