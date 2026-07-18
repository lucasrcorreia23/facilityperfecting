"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToast } from "@heroui/react";
import { BookOpenIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { EmptyState } from "@/app/components/ui/empty-state";
import { LoadingView } from "@/app/components/ui/loading-view";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { deleteTrailPlan, listTrailPlans } from "@/app/lib/db";
import type { TrailPlan, TrailPlanStatus } from "@/app/lib/types";

const STATUS_CHIP: Record<TrailPlanStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-slate-100 text-slate-600" },
  extracting: { label: "Extraindo…", cls: "bg-blue-50 text-blue-700" },
  analyzing: { label: "Analisando…", cls: "bg-blue-50 text-blue-700" },
  analyzed: { label: "Análise pronta", cls: "bg-blue-50 text-blue-700" },
  planning: { label: "Montando trilhas…", cls: "bg-blue-50 text-blue-700" },
  ready: { label: "Pronto", cls: "bg-green-50 text-green-700" },
  error: { label: "Erro", cls: "bg-red-50 text-red-700" },
};

export default function TrilhasPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<TrailPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const refresh = useCallback(async () => {
    setPlans(await listTrailPlans());
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  function askDelete(plan: TrailPlan) {
    setConfirm({
      title: "Excluir plano de trilhas?",
      message: (
        <>
          O plano de <strong>{plan.client_name}</strong> e suas trilhas serão excluídos. Rascunhos já
          gerados na Biblioteca são mantidos.
        </>
      ),
      confirmLabel: "Excluir",
      onConfirm: () => {
        void (async () => {
          try {
            await deleteTrailPlan(plan.id);
            addToast({ title: "Plano excluído", color: "success" });
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
        title="Trilhas"
        description="Planos de trilhas de roleplay gerados a partir dos materiais do cliente (Data-to-Skill)."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onPress={() => router.push("/trilhas/base")}
              startContent={<BookOpenIcon className="w-4 h-4" />}
            >
              Base de metodologia
            </Button>
            <Button
              onPress={() => router.push("/trilhas/novo")}
              startContent={<PlusIcon className="w-4 h-4" />}
            >
              Novo plano
            </Button>
          </div>
        }
      />

      {loading ? (
        <LoadingView label="Carregando planos…" />
      ) : plans.length === 0 ? (
        <EmptyState
          title="Nenhum plano de trilhas ainda"
          description="Crie um novo plano enviando os materiais do cliente (scorecards, transcrições, formulário de calibração, oferta e website)."
          action={
            <Button onPress={() => router.push("/trilhas/novo")} startContent={<PlusIcon className="w-4 h-4" />}>
              Novo plano
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-2.5 text-left">Cliente</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Metodologia</th>
                <th className="px-4 py-2.5 text-left">Criado em</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const chip = STATUS_CHIP[plan.status] ?? STATUS_CHIP.draft;
                return (
                  <tr
                    key={plan.id}
                    className="border-b border-slate-100 text-sm font-medium text-slate-800 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/trilhas/${plan.id}`} className="hover:text-[var(--primary)] hover:underline">
                        {plan.client_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-sm px-2 py-0.5 text-xs font-medium ${chip.cls}`}>
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{plan.sales_methodology ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(plan.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/trilhas/${plan.id}`}
                          className="rounded-sm px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                        >
                          Abrir
                        </Link>
                        <button
                          type="button"
                          onClick={() => askDelete(plan)}
                          title="Excluir plano"
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
