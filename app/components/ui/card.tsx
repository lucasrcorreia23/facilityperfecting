import { cn } from "@/app/lib/cn";

/** Superfície flat padrão: branco, borda fina slate, cantos 8px. */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("bg-white rounded-sm border border-slate-200", className)}>
      {children}
    </div>
  );
}
