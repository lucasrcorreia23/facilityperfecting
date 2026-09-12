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
import { deletePlaybookDraft, listPlaybookDrafts } from "@/app/lib/db";
import type { PlaybookDraft, PlaybookDraftStatus } from "@/app/lib/types";

const STATUS_CHIP: Record<PlaybookDraftStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-slate-100 text-slate-600" },
  generating: { label: "Estruturando…", cls: "bg-blue-50 text-blue-700" },
  ready: { label: "Pronto", cls: "bg-green-50 text-green-700" },
  exporting: { label: "Enviando…", cls: "bg-blue-50 text-blue-700" },
  exported: { label: "Enviado", cls: "bg-green-50 text-green-700" },
  error: { label: "Erro", cls: "bg-red-50 text-red-700" },
};

export default function PlaybooksPage() {
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<PlaybookDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const refresh = useCallback(async () => {
    setPlaybooks(await listPlaybookDrafts());
    setLoading(false);
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
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-2.5 text-left">Playbook</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="hidden px-4 py-2.5 text-left sm:table-cell">Criado em</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {playbooks.map((playbook) => {
                const chip = STATUS_CHIP[playbook.status] ?? STATUS_CHIP.draft;
                return (
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
                      <span
                        className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
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
                          className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
