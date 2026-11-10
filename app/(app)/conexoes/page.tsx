"use client";

import { useCallback, useEffect, useState } from "react";
import { addToast } from "@heroui/react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { EmptyState } from "@/app/components/ui/empty-state";
import { LoadingView } from "@/app/components/ui/loading-view";
import { EnvironmentBadge } from "@/app/components/ui/environment-badge";
import { describeFunctionError, invokeSyncOrgs, listConnections } from "@/app/lib/db";
import { connectionName } from "@/app/lib/connection-label";
import type { Connection } from "@/app/lib/types";

/** "Pronta" recebe envio; "Sem gestor" não — a Perfecting cria em nome do gestor. */
function ReadyChip({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="inline-flex rounded-sm bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      Pronta
    </span>
  ) : (
    <span
      className="inline-flex rounded-sm bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
      title="Sem gestor na conta, o envio é recusado. Crie um gestor na Perfecting e sincronize."
    >
      Sem gestor — não recebe envio
    </span>
  );
}

export default function ConexoesPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConnections(await listConnections());
      setLoadError(null);
    } catch (err) {
      setLoadError(describeFunctionError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await invokeSyncOrgs();
      if (res?.ok) {
        addToast({ title: `Sincronizado: ${res.synced}/${res.total} contas`, color: "success" });
        await refresh();
      } else {
        addToast({
          title: "Falha ao sincronizar",
          description: describeFunctionError(res?.error ?? res),
          color: "danger",
        });
      }
    } catch (err) {
      addToast({
        title: "Erro ao sincronizar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Contas"
        description="Contas da Perfecting, em Homolog e em Produção, que podem receber roleplays, playbooks e debates."
        action={
          <Button
            onPress={sync}
            isLoading={syncing}
            startContent={<ArrowPathIcon className="w-4 h-4" />}
          >
            Sincronizar contas
          </Button>
        }
      />

      {loading ? (
        <LoadingView label="Carregando contas…" />
      ) : loadError && connections.length === 0 ? (
        <EmptyState
          title="Não foi possível carregar as contas"
          description={loadError}
          action={
            <Button variant="secondary" onPress={() => void refresh()}>
              Tentar de novo
            </Button>
          }
        />
      ) : connections.length === 0 ? (
        <EmptyState
          title="Nenhuma conta sincronizada"
          description="Clique em “Sincronizar contas” para buscar as organizações da Perfecting."
        />
      ) : (
        <>
          {/* Abaixo de lg, um cartão por conta — a tabela cortava no celular. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {connections.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <EnvironmentBadge environment={c.environment} />
                    <span className="min-w-0 break-words text-sm font-medium text-slate-800">
                      {connectionName(c)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      Org {c.org_id} · gestor {c.target_user_id ?? "não encontrado"}
                    </span>
                    <ReadyChip ready={c.target_user_id != null} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5 text-left">Conta</th>
                  <th className="px-4 py-2.5 text-left">Ambiente</th>
                  <th className="px-4 py-2.5 text-left">Org</th>
                  <th className="px-4 py-2.5 text-left">Gestor</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id} className="text-sm font-medium text-slate-800">
                    <td className="px-4 py-4">{connectionName(c)}</td>
                    <td className="px-4 py-4">
                      <EnvironmentBadge environment={c.environment} />
                    </td>
                    <td className="px-4 py-4 text-slate-600">{c.org_id}</td>
                    <td className="px-4 py-4 text-slate-600">{c.target_user_id ?? "—"}</td>
                    <td className="px-4 py-4">
                      <ReadyChip ready={c.target_user_id != null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
