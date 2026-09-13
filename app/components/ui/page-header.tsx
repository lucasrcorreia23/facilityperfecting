import { BackButton } from "@/app/components/ui/back-button";

/**
 * Cabeçalho padrão das páginas. Quando o fluxo tem para onde voltar, passe
 * `backHref`: a seta fica à esquerda do título/descrição, nunca acima.
 */
export function PageHeader({
  title,
  description,
  action,
  backHref,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  backHref?: string;
}) {
  return (
    <div className="flex flex-col mb-6 sm:mb-8 gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {backHref && <BackButton href={backHref} />}
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
