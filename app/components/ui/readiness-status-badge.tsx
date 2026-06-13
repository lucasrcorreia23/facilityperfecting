import { cn } from "@/app/lib/cn";
import type { ReadinessStatus } from "@/app/lib/types";

export const READINESS_STATUS_META: Record<ReadinessStatus, { label: string; cls: string }> = {
  nao_iniciado: { label: "Não iniciado", cls: "bg-slate-100 text-slate-600" },
  em_andamento: { label: "Em andamento", cls: "bg-blue-50 text-blue-700" },
  bloqueado: { label: "Bloqueado", cls: "bg-red-50 text-red-700" },
  pronto: { label: "Pronto", cls: "bg-green-50 text-green-700" },
};

export function ReadinessStatusBadge({ status }: { status: ReadinessStatus }) {
  const { label, cls } = READINESS_STATUS_META[status] ?? READINESS_STATUS_META.nao_iniciado;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {label}
    </span>
  );
}
