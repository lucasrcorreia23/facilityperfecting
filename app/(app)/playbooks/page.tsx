"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToast } from "@heroui/react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { EmptyState } from "@/app/components/ui/empty-state";
import { LoadingView } from "@/app/components/ui/loading-view";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { EnvironmentBadge } from "@/app/components/ui/environment-badge";
import { deletePlaybookDraft, describeFunctionError, listPlaybookDrafts } from "@/app/lib/db";
import { connectionName } from "@/app/lib/connection-label";
import { playbookListStatus, type PlaybookListTone } from "@/app/lib/playbook-draft";
import { useConnections } from "@/app/lib/use-connections";
import type { Connection, PlaybookDraft } from "@/app/lib/types";

const TONE_CLS: Record<PlaybookListTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  running: "bg-blue-50 text-blue-700",
  ok: "bg-green-50 text-green-700",
  error: "bg-red-50 text-red-700",
};

function StatusChip({ playbook }: { playbook: PlaybookDraft }) {
  const { label, tone } = playbookListStatus(playbook);
  return (
    <span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${TONE_CLS[tone]}`}>
      {label}
    </span>
  );
}

/** Para qual conta o playbook foi (ou tentou ser) enviado. */
function Destination({
  playbook,
  connections,
}: {
  playbook: PlaybookDraft;
  connections: Connection[] | null;
}) {
  const connectionId = playbook.export_run?.connection_id;
  if (!connectionId) return <span className="text-slate-400">Ainda não enviado</span>;
  const connection = connections?.find((c) => c.id === connectionId) ?? null;
  const remoteId = playbook.export_run?.perfecting_playbook_id;
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        {connection && <EnvironmentBadge environment={connection.environment} />}
        <span className="text-slate-700">
          {connection
            ? connectionName(connection)
            : connections === null
              ? "Carregando conta…"
              : "Conta removida"}
        </span>
      </span>
      <span className="text-xs font-normal text-slate-500">
        {remoteId != null ? `Playbook ${remoteId} na conta` : "Envio não concluído"}
      </span>
    </span>
  );
}

export default function PlaybooksPage() {
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<PlaybookDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  // Só para dizer a conta de cada playbook enviado — falhar aqui não derruba a lista.
  const { connections } = useConnections();

  const refresh = useCallback(async () => {
    try {
      setPlaybooks(await listPlaybookDrafts());
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

  function askDelete(playbook: PlaybookDraft) {
    setConfirm({
      title: "Excluir playbook?",
      message: (
        <>
          O playbook <strong>{playbook.name}</strong> e suas etapas serão excluídos aqui. O que já
          foi enviado para a conta do cliente <b>não</b> é removido.
        </>
      ),
      confirmLabel: "Excluir",
      tone: "danger",
      onConfirm: () => {
        void (async () => {
          try {
            await deletePlaybookDraft(playbook.id);
            addToast({ title: "Playbook excluído", color: "success" });
            await refresh();
          } catch (err) {
            addToast({
              title: "Falha ao excluir",
              description: err instanceof Error ? err.message : String(err),
              color: "danger",
            });
          }
        })();
      },
    });
  }

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Playbooks"
        description="Estruture o playbook do cliente a partir do material dele e envie para a conta — os roleplays da jornada são gerados por cima dele na Criação."
        action={
          <Button
            onPress={() => router.push("/playbooks/novo")}
            startContent={<PlusIcon className="w-4 h-4" />}
          >
            Novo playbook
          </Button>
        }
      />

      {loading ? (
        <LoadingView label="Carregando playbooks…" />
      ) : loadError && playbooks.length === 0 ? (
        <EmptyState
          title="Não foi possível carregar os playbooks"
          description={loadError}
          action={
            <Button variant="secondary" onPress={() => void refresh()}>
              Tentar de novo
            </Button>
          }
        />
      ) : playbooks.length === 0 ? (
        <EmptyState
          title="Nenhum playbook ainda"
          description="Suba o playbook do cliente (PDF, apresentação, transcrição de treinamento) e a IA estrutura a jornada em etapas e subetapas."
          action={
            <Button
              onPress={() => router.push("/playbooks/novo")}
              startContent={<PlusIcon className="w-4 h-4" />}
            >
              Novo playbook
            </Button>
          }
        />
      ) : (
        <>
          {/* Abaixo de lg, um cartão por playbook: a tabela não cabe com a coluna da conta. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {playbooks.map((playbook) => (
              <li key={playbook.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/playbooks/${playbook.id}`}
                      className="min-w-0 break-words text-sm font-medium text-slate-800 hover:text-[var(--primary)] hover:underline"
                    >
                      {playbook.name}
                    </Link>
                    <StatusChip playbook={playbook} />
                  </div>
                  <div className="text-sm">
                    <Destination playbook={playbook} connections={connections} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Criado em {new Date(playbook.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/playbooks/${playbook.id}`}
                        className="inline-flex min-h-[44px] items-center rounded-sm px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                      >
                        Abrir
                      </Link>
                      <button
                        type="button"
                        onClick={() => askDelete(playbook)}
                        aria-label={`Excluir o playbook ${playbook.name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="px-4 py-2.5 text-left">Playbook</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-left">Conta</th>
                  <th className="px-4 py-2.5 text-left">Criado em</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {playbooks.map((playbook) => (
                  <tr
                    key={playbook.id}
                    className="border-b border-slate-100 text-sm font-medium text-slate-800 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/playbooks/${playbook.id}`}
                        className="hover:text-[var(--primary)] hover:underline"
                      >
                        {playbook.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip playbook={playbook} />
                    </td>
                    <td className="px-4 py-3">
                      <Destination playbook={playbook} connections={connections} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(playbook.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/playbooks/${playbook.id}`}
                          className="rounded-sm px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                        >
                          Abrir
                        </Link>
                        <button
                          type="button"
                          onClick={() => askDelete(playbook)}
                          title="Excluir playbook"
                          aria-label={`Excluir o playbook ${playbook.name}`}
                          className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
