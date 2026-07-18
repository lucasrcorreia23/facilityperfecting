"use client";

import { Spinner } from "@heroui/react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";
import type { TrailPlanStatus } from "@/app/lib/types";

const RUNNING_LABEL: Partial<Record<TrailPlanStatus, string>> = {
  extracting: "Extraindo o material enviado…",
  analyzing: "Etapa 1/2 — Analisando os materiais e mapeando skill gaps (pode levar alguns minutos)…",
  analyzed: "Etapa 1/2 concluída — iniciando o plano de trilhas…",
  planning: "Etapa 2/2 — Montando as trilhas e os roleplays (pode levar alguns minutos)…",
};

/** Estado da geração do plano (realtime). Em erro, oferece retomar o estágio pendente. */
export function PlanStatusBanner({
  status,
  errorMessage,
  onRetry,
  retrying,
}: {
  status: TrailPlanStatus;
  errorMessage?: string | null;
  onRetry: () => void;
  retrying?: boolean;
}) {
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2.5 rounded-sm border border-green-200 bg-green-50 px-4 py-3">
        <CheckCircleIcon className="w-5 h-5 shrink-0 text-green-600" />
        <p className="text-sm font-medium text-green-800">
          Plano de trilhas pronto. Revise as trilhas abaixo antes de gerar os roleplays.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-3 rounded-sm border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <XCircleIcon className="w-5 h-5 shrink-0 text-red-600" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-red-800">A geração falhou</p>
            {errorMessage && (
              <p className="text-sm leading-relaxed text-red-700 break-words">{errorMessage}</p>
            )}
          </div>
        </div>
        <Button variant="secondary" onPress={onRetry} isLoading={retrying} className="shrink-0">
          Retomar geração
        </Button>
      </div>
    );
  }

  const label = RUNNING_LABEL[status];
  if (!label) return null;
  return (
    <div className="flex items-center gap-3 rounded-sm border border-blue-200 bg-blue-50 px-4 py-3">
      <Spinner size="sm" color="primary" />
      <p className="text-sm font-medium text-blue-800">{label}</p>
    </div>
  );
}
