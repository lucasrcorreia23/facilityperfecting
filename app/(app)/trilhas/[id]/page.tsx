"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  addToast,
} from "@heroui/react";
import {
  ArrowDownTrayIcon,
  PaperAirplaneIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { BackButton } from "@/app/components/ui/back-button";
import { LoadingView } from "@/app/components/ui/loading-view";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { SendStatusModal, type SendStatus } from "@/app/components/ui/send-status-modal";
import { MarkdownView } from "@/app/components/ui/markdown-view";
import { PlanStatusBanner } from "@/app/components/trilhas/plan-status-banner";
import { RadarView } from "@/app/components/trilhas/radar-view";
import { TrailEditor } from "@/app/components/trilhas/trail-editor";
import { managerSelectClassNames, selectItemClassNames } from "@/app/lib/select-classnames";
import { createClient } from "@/app/lib/supabase/client";
import {
  generateTrailDrafts,
  getTrailPlan,
  invokeExport,
  invokeGenerateTrailPlan,
  listCallContexts,
  listConnections,
  setDraftConnection,
} from "@/app/lib/db";
import type { CallContextType, Connection, TrailPlanDetail } from "@/app/lib/types";

export default function PlanoTrilhasPage() {
  const params = useParams<{ id: string }>();
  const planId = params.id;

  const [plan, setPlan] = useState<TrailPlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [callContexts, setCallContexts] = useState<CallContextType[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [generatingTrail, setGeneratingTrail] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerConn, setPickerConn] = useState<string>("");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>("sending");
  const [sendError, setSendError] = useState<string | null>(null);

  const autoPlanInvoked = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setPlan(await getTrailPlan(planId));
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void refresh();
    void listCallContexts()
      .then(setCallContexts)
      .catch(() => setCallContexts([]));
    void listConnections()
      .then(setConnections)
      .catch(() => setConnections([]));

    // realtime: status da geração (trail_plans) + status dos drafts gerados
    const supabase = createClient();
    const channel = supabase
      .channel(`trail-plan-${planId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trail_plans", filter: `id=eq.${planId}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roleplay_drafts" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [planId, refresh]);

  // Encadeia o estágio 2 automaticamente quando a análise conclui.
  useEffect(() => {
    if (plan?.status === "analyzed" && !autoPlanInvoked.current) {
      autoPlanInvoked.current = true;
      void invokeGenerateTrailPlan(planId, "plan").catch((err) => {
        autoPlanInvoked.current = false;
        addToast({
          title: "Falha ao iniciar o plano de trilhas",
          description: err instanceof Error ? err.message : String(err),
          color: "danger",
        });
      });
    }
  }, [plan?.status, planId]);

  async function retry() {
    if (!plan) return;
    setRetrying(true);
    try {
      // Retoma o estágio pendente: sem análise → analysis; com análise → plan.
      const stage = plan.analysis_markdown ? "plan" : "analysis";
      autoPlanInvoked.current = stage === "plan";
      await invokeGenerateTrailPlan(planId, stage);
      await refresh();
    } catch (err) {
      addToast({
        title: "Falha ao retomar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setRetrying(false);
    }
  }

  async function generateDrafts(trailIds?: string[]) {
    try {
      const { created } = await generateTrailDrafts(planId, trailIds);
      addToast({
        title:
          created > 0
            ? `${created} roleplay(s) criados como rascunho — veja também na Biblioteca`
            : "Nenhum roleplay pendente de geração",
        color: created > 0 ? "success" : "warning",
      });
      await refresh();
    } catch (err) {
      addToast({
        title: "Falha ao gerar roleplays",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setGeneratingTrail(null);
    }
  }

  function askGenerateAll() {
    const pending = allItems.filter((it) => !it.draft_id).length;
    if (pending === 0) {
      addToast({ title: "Todos os roleplays já foram gerados", color: "warning" });
      return;
    }
    setConfirm({
      title: "Gerar todos os roleplays?",
      message: (
        <>
          Serão criados <strong>{pending}</strong> rascunhos de roleplay (um por item das trilhas),
          reusando a mesma oferta do plano. Eles ficam disponíveis aqui e na Biblioteca.
        </>
      ),
      confirmLabel: "Gerar",
      onConfirm: () => void generateDrafts(),
    });
  }

  const allItems = (plan?.trails ?? []).flatMap((t) => t.items);
  const sendableDrafts = allItems
    .filter((it) => it.draft && (it.draft.status === "draft" || it.draft.status === "error"))
    .map((it) => it.draft!.id);

  function openSendPicker() {
    if (sendableDrafts.length === 0) {
      addToast({
        title: "Nenhum rascunho pendente de envio",
        description: "Gere os roleplays primeiro (ou todos já foram enviados).",
        color: "warning",
      });
      return;
    }
    setPickerOpen(true);
  }

  async function runSend() {
    setSendStatus("sending");
    setSendError(null);
    setSendModalOpen(true);
    try {
      for (const draftId of sendableDrafts) {
        await setDraftConnection(draftId, pickerConn);
      }
      const res = await invokeExport(sendableDrafts);
      if (res?.ok === false) throw new Error(JSON.stringify(res?.error ?? res));
      setSendStatus("success");
      setTimeout(() => setSendModalOpen(false), 1800);
      await refresh();
    } catch (err) {
      setSendStatus("error");
      setSendError(err instanceof Error ? err.message : String(err));
    }
  }

  function downloadMarkdown() {
    if (!plan) return;
    const parts = [
      `# Plano de trilhas — ${plan.client_name}`,
      plan.analysis_markdown ? `## Análise Data-to-Skill\n\n${plan.analysis_markdown}` : null,
      plan.plan_markdown ? `## Plano de trilhas\n\n${plan.plan_markdown}` : null,
    ].filter(Boolean);
    const blob = new Blob([parts.join("\n\n---\n\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plano-trilhas-${plan.client_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <LoadingView label="Carregando plano…" />;
  }
  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton href="/trilhas" />
        <p className="text-sm text-slate-600">Plano não encontrado.</p>
      </div>
    );
  }

  const errorMessage =
    typeof plan.error_detail?.message === "string" ? (plan.error_detail.message as string) : null;

  return (
    <div className="flex flex-col gap-0">
      <div className="mb-4">
        <BackButton href="/trilhas" />
      </div>
      <PageHeader
        title={`Plano de trilhas — ${plan.client_name}`}
        description={
          plan.sales_methodology
            ? `Metodologia do cliente: ${plan.sales_methodology}`
            : "Análise Data-to-Skill e trilhas de treinamento propostas."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onPress={downloadMarkdown}
              isDisabled={!plan.analysis_markdown}
              startContent={<ArrowDownTrayIcon className="w-4 h-4" />}
            >
              Baixar .md
            </Button>
            <Button
              variant="secondary"
              onPress={askGenerateAll}
              isDisabled={plan.status !== "ready"}
              startContent={<SparklesIcon className="w-4 h-4" />}
            >
              Gerar roleplays
            </Button>
            <Button
              onPress={openSendPicker}
              isDisabled={sendableDrafts.length === 0}
              startContent={<PaperAirplaneIcon className="w-4 h-4" />}
            >
              Enviar para destino
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-5">
        <PlanStatusBanner
          status={plan.status}
          errorMessage={errorMessage}
          onRetry={retry}
          retrying={retrying}
        />

        {plan.radar && plan.radar.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Radar de competências</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plan.radar.map((entry) => (
                <RadarView key={entry.vendedor} entry={entry} />
              ))}
            </div>
          </section>
        )}

        {plan.analysis_markdown && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Análise Data-to-Skill</h2>
            <Card className="p-5">
              <MarkdownView markdown={plan.analysis_markdown} />
            </Card>
          </section>
        )}

        {plan.plan_markdown && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Racional do plano</h2>
            <Card className="p-5">
              <MarkdownView markdown={plan.plan_markdown} />
            </Card>
          </section>
        )}

        {plan.trails.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Trilhas ({plan.trails.length})
            </h2>
            <div className="flex flex-col gap-4">
              {plan.trails.map((trail) => (
                <TrailEditor
                  key={trail.id}
                  trail={trail}
                  callContexts={callContexts}
                  onChanged={() => void refresh()}
                  generating={generatingTrail === trail.id}
                  onGenerate={(trailId) => {
                    setGeneratingTrail(trailId);
                    void generateDrafts([trailId]);
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <Modal isOpen={pickerOpen} onOpenChange={setPickerOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Enviar para conta destino</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              {sendableDrafts.length} rascunho(s) serão enviados para a conta escolhida. A oferta é
              criada uma vez e reusada em todos os roleplays.
            </p>
            <Select
              label="Conta destino"
              labelPlacement="outside"
              placeholder="Escolha a org da Perfecting"
              selectedKeys={pickerConn ? [pickerConn] : []}
              onSelectionChange={(keys) => setPickerConn((Array.from(keys)[0] as string) ?? "")}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
            >
              {connections.map((c) => (
                <SelectItem key={c.id} classNames={selectItemClassNames}>
                  {`${c.org_name ?? `Org ${c.org_id}`} (${c.environment})`}
                </SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setPickerOpen(false)}>
              Cancelar
            </Button>
            <Button
              isDisabled={!pickerConn}
              onPress={() => {
                setPickerOpen(false);
                void runSend();
              }}
            >
              Enviar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />

      <SendStatusModal
        open={sendModalOpen}
        status={sendStatus}
        errorMessage={sendError}
        onRetry={() => void runSend()}
        onClose={() => setSendModalOpen(false)}
      />
    </div>
  );
}
