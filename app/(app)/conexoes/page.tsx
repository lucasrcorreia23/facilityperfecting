"use client";

import { useCallback, useEffect, useState } from "react";
import { addToast } from "@heroui/react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { EmptyState } from "@/app/components/ui/empty-state";
import { LoadingView } from "@/app/components/ui/loading-view";
import { invokeSyncOrgs, listConnections } from "@/app/lib/db";
import type { Connection } from "@/app/lib/types";

export default function ConexoesPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setConnections(await listConnections());
    setLoading(false);
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
          description: JSON.stringify(res?.error ?? res),
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
        title="Conexões"
        description="Contas (orgs) da Perfecting que podem receber roleplays."
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
        <LoadingView label="Carregando conexões…" />
      ) : connections.length === 0 ? (
        <EmptyState
          title="Nenhuma conta sincronizada"
          description="Clique em 'Sincronizar contas' para buscar as orgs da Perfecting via superadmin."
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-2.5 text-left">Org</th>
                <th className="px-4 py-2.5 text-left">Ambiente</th>
                <th className="px-4 py-2.5 text-left">Gestor-alvo</th>
                <th className="px-4 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="text-sm font-medium text-slate-800">
                  <td className="px-4 py-4">{c.org_name ?? `Org ${c.org_id}`}</td>
                  <td className="px-4 py-4 text-slate-600">{c.environment}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {c.target_user_id ?? "—"}
                  </td>
                  <td className="px-4 py-4">
                    {c.target_user_id ? (
                      <span className="inline-flex rounded-sm bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        Pronta
                      </span>
                    ) : (
                      <span className="inline-flex rounded-sm bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Sem gestor
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
