"use client";

import { useCallback, useEffect, useState } from "react";
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
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { SendStatusModal, type SendStatus } from "@/app/components/ui/send-status-modal";
import { PlanStatusBanner } from "@/app/components/trilhas/plan-status-banner";
import { PlaybookEditor } from "@/app/components/playbooks/playbook-editor";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { createClient } from "@/app/lib/supabase/client";
import {
  getPlaybookDraft,
  invokeGeneratePlaybook,
  invokeSendPlaybook,
  listCallContexts,
  listConnections,
  listMethodologies,
  pollPlaybookGeneration,
} from "@/app/lib/db";
import type {
  CallContextType,
  Connection,
  Methodology,
  PlaybookDraftDetail,
} from "@/app/lib/types";

const RUNNING_LABELS = {
  generating: "Estruturando o playbook em etapas e subetapas…",
  exporting: "Criando o playbook na conta de destino…",
};

export default function PlaybookDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [playbook, setPlaybook] = useState<PlaybookDraftDetail | null>(null);
  const [callContexts, setCallContexts] = useState<CallContextType[]>([]);
  const [methodologies, setMethodologies] = useState<Methodology[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerConn, setPickerConn] = useState("");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>("sending");
  const [sendError, setSendError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPlaybook(await getPlaybookDraft(id));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    listCallContexts().then(setCallContexts).catch(() => {});
    listMethodologies().then(setMethodologies).catch(() => {});
    listConnections().then(setConnections).catch(() => {});

    const supabase = createClient();
    const channel = supabase
      .channel(`playbook-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "playbooks", filter: `id=eq.${id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refresh]);

  // Destrava execução morta: se a geração morreu no meio, o poll devolve ao erro.
  const generating = playbook?.status === "generating";
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => {
      void (async () => {
        await pollPlaybookGeneration(id).catch(() => {});
        await refresh();
      })();
    }, 20_000);
    return () => clearInterval(timer);
  }, [generating, id, refresh]);

  async function retryGeneration() {
    setRetrying(true);
    try {
      await invokeGeneratePlaybook(id);
      await refresh();
    } catch (err) {
      addToast({
        title: "Falha ao reiniciar a estruturação",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setRetrying(false);
    }
  }

  async function runSend(connectionId: string) {
    setSendStatus("sending");
    setSendError(null);
    setSendModalOpen(true);
    try {
      await invokeSendPlaybook(id, connectionId);
      setSendStatus("success");
      await refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
      setSendStatus("error");
      await refresh();
    }
  }

  function confirmPickerAndSend() {
    if (!pickerConn) {
      addToast({ title: "Escolha uma conta de destino", color: "warning" });
      return;
    }
    setPickerOpen(false);
    const connectionId = pickerConn;
    const connection = connections.find((c) => c.id === connectionId);
    const alreadySent =
      playbook?.export_run?.connection_id === connectionId &&
      playbook?.export_run?.perfecting_playbook_id != null;

    setConfirm({
      title: alreadySent ? "Continuar o envio para esta conta?" : "Criar o playbook nesta conta?",
      message: alreadySent ? (
        <>
          Este playbook já foi enviado para <b>{connection?.org_name ?? "esta conta"}</b>. O envio
          vai <b>completar o que faltou</b> (etapas e subetapas ainda não criadas), sem duplicar o
          que já existe.
        </>
      ) : (
        <>
          Serão criados <b>{playbook?.playbook_call_types.length ?? 0} etapa(s)</b> e suas subetapas
          na conta <b>{connection?.org_name ?? "selecionada"}</b> ({connection?.environment}). Depois
          disso, a Criação consegue gerar os roleplays da jornada por cima dele.
        </>
      ),
      confirmLabel: alreadySent ? "Continuar envio" : "Criar playbook",
      onConfirm: () => {
        void runSend(connectionId);
      },
    });
  }

  if (loading || !playbook) return <LoadingView label="Carregando playbook…" />;

  const callTypes = playbook.playbook_call_types;
  const errorMessage =
    typeof playbook.error_detail?.message === "string" ? playbook.error_detail.message : null;
  const canSend = callTypes.length > 0 && playbook.status !== "generating";

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        backHref="/playbooks"
        title={playbook.name}
        description="Revise as etapas e subetapas antes de criar o playbook na conta do cliente."
        action={
          <Button
            onPress={() => {
              setPickerConn(playbook.export_run?.connection_id ?? "");
              setPickerOpen(true);
            }}
            isDisabled={!canSend}
            startContent={<PaperAirplaneIcon className="w-4 h-4" />}
          >
            Enviar para conta
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <PlanStatusBanner
          status={playbook.status}
          errorMessage={errorMessage}
          onRetry={retryGeneration}
          retrying={retrying}
          readyLabel="Playbook estruturado. Revise as etapas abaixo antes de enviar para a conta."
          runningLabels={RUNNING_LABELS}
        />

        {playbook.status === "exported" && (
          <div className="rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            Playbook criado na conta (id {playbook.export_run?.perfecting_playbook_id}). Agora é só
            ir na Criação, escolher essa conta e gerar os roleplays pelo playbook.
          </div>
        )}

        {callTypes.length === 0 && playbook.status !== "generating" ? (
          <div className="flex flex-col items-center gap-4 rounded-sm border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm text-slate-600">
              Nenhuma etapa ainda — a estruturação não chegou a rodar.
            </p>
            <Button variant="secondary" onPress={retryGeneration} isLoading={retrying}>
              Retomar geração
            </Button>
          </div>
        ) : (
          <PlaybookEditor
            playbookId={playbook.id}
            callTypes={callTypes}
            callContexts={callContexts}
            methodologies={methodologies}
            onChanged={refresh}
          />
        )}
      </div>

      <Modal isOpen={pickerOpen} onOpenChange={setPickerOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Conta de destino</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Escolha a org da Perfecting onde o playbook será criado (HML ou produção). O envio cria{" "}
              <b>conteúdo real na conta do cliente</b>.
            </p>
            <Select
              label="Conta"
              labelPlacement="outside"
              selectedKeys={pickerConn ? [pickerConn] : []}
              onSelectionChange={(k) => setPickerConn(String(Array.from(k)[0] ?? ""))}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
            >
              {connections.map((c) => (
                <SelectItem
                  key={c.id}
                  textValue={`${c.org_name ?? `Org ${c.org_id}`} (${c.environment})`}
                >
                  {c.org_name ?? `Org ${c.org_id}`} ({c.environment})
                </SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setPickerOpen(false)}>
              Cancelar
            </Button>
            <Button onPress={confirmPickerAndSend}>Continuar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />

      <SendStatusModal
        open={sendModalOpen}
        status={sendStatus}
        errorMessage={sendError}
        onRetry={() => void runSend(pickerConn)}
        onClose={() => setSendModalOpen(false)}
        sendingLabel="Criando o playbook na conta de destino…"
        successTitle="Playbook criado na conta!"
        successHint="Agora dá para gerar os roleplays por ele na Criação."
      />
    </div>
  );
}
