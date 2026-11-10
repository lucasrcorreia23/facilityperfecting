import { EnvironmentBadge } from "@/app/components/ui/environment-badge";
import {
  connectionName,
  isProduction,
  type ConnectionLike,
} from "@/app/lib/connection-label";
import { cn } from "@/app/lib/cn";

/**
 * "Para onde vai" de uma confirmação de envio: selo do ambiente + nome da conta,
 * e a contagem quando o lote se divide entre contas. Em produção o quadro fica
 * vermelho — é a última chance de perceber a conta errada.
 */
export function DestinationSummary({
  destinations,
  unit = ["item", "itens"],
}: {
  destinations: Array<{ connection: ConnectionLike | null | undefined; count?: number }>;
  /** Como chamar o que é contado em cada conta: ["rascunho", "rascunhos"]. */
  unit?: [singular: string, plural: string];
}) {
  const anyProduction = destinations.some((d) => isProduction(d.connection));
  return (
    <span
      className={cn(
        "flex flex-col gap-2 rounded-sm border px-3 py-2.5",
        anyProduction ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50",
      )}
    >
      {destinations.map((d, i) => (
        <span key={i} className="flex min-w-0 flex-wrap items-center gap-2">
          {d.connection ? (
            <EnvironmentBadge environment={d.connection.environment} />
          ) : null}
          <span className="min-w-0 break-words text-sm font-semibold text-slate-800">
            {d.connection ? connectionName(d.connection) : "Conta não escolhida"}
          </span>
          {d.count != null && (
            <span className="text-sm text-slate-600">
              · {d.count} {d.count === 1 ? unit[0] : unit[1]}
            </span>
          )}
        </span>
      ))}
      {anyProduction && (
        <span className="text-xs font-medium text-red-700">
          Conta de produção: o que for criado aparece para o cliente.
        </span>
      )}
    </span>
  );
}
