import { cn } from "@/app/lib/cn";
import { environmentKind, environmentLabel } from "@/app/lib/connection-label";

const STYLES = {
  // Produção é o único selo cheio da tela: não pode ser confundido com o resto.
  prod: "bg-red-600 text-white",
  hml: "border border-slate-200 bg-slate-100 text-slate-600",
  other: "border border-amber-200 bg-amber-50 text-amber-800",
} as const;

/** Selo do ambiente da conta: "Produção" (vermelho cheio) ou "Homolog" (neutro). */
export function EnvironmentBadge({
  environment,
  className,
}: {
  environment: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-xs font-semibold",
        STYLES[environmentKind(environment)],
        className,
      )}
    >
      {environmentLabel(environment)}
    </span>
  );
}
