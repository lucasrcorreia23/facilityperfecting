import { Spinner } from "@heroui/react";

/** Spinner + frase amigável (extração/transcrição/export podem demorar). */
export function LoadingView({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
      <Spinner color="primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
