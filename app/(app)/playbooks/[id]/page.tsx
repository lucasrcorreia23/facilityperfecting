"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, addToast } from "@heroui/react";
import { ArrowPathIcon, PaperAirplaneIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { EmptyState } from "@/app/components/ui/empty-state";
import { LoadingView } from "@/app/components/ui/loading-view";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { SendStatusModal, type SendStatus } from "@/app/components/ui/send-status-modal";
import { PlanStatusBanner } from "@/app/components/trilhas/plan-status-banner";
import { PlaybookEditor } from "@/app/components/playbooks/playbook-editor";
import { ReviewedDraftPicker, useLibraryDrafts } from "@/app/components/playbooks/reviewed-draft-picker";
import { ConnectionPicker } from "@/app/components/ui/connection-picker";
import { DestinationSummary } from "@/app/components/ui/destination-summary";
import { SaveIndicator } from "@/app/components/ui/save-indicator";
import { useConnections } from "@/app/lib/use-connections";
import { createSaveTracker } from "@/app/lib/save-tracker";
import { countLabel, isProduction } from "@/app/lib/connection-label";
import { createClient } from "@/app/lib/supabase/client";
import { classifyPlaybookFailure, playbookEmptyState } from "@/app/lib/playbook-draft";
import { humanizeSendError, type HumanizedError } from "@/app/lib/send-error";
import { validatePlaybookForExport } from "@/supabase/functions/_shared/perfecting-limits";
import { reviewedDraftRefs, withReviewedDrafts } from "@/supabase/functions/_shared/reviewed-draft-refs";
import {
  describeFunctionError,
  getPlaybookDraft,
  invokeGeneratePlaybook,
  invokeSendPlaybook,
  listCallContexts,
  listMethodologies,
  pollPlaybookGeneration,
  pollSendPlaybook,
  updatePlaybookInputFiles,
} from "@/app/lib/db";
import type {
  CallContextType,
  Methodology,
  PlaybookDraftDetail,
} from "@/app/lib/types";

const RUNNING_LABELS = {
  generating: "Estruturando o playbook em etapas e subetapas…",
  exporting: "Criando o playbook na conta de destino…",
};

function PlaybookDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  // `?rascunho=<id>`: veio da checagem de coerência da Criação — abre a regeração
  // já com o rascunho de lá escolhido como material revisado.
  const fromDraft = useSearchParams().get("rascunho");
  const [regenOpen, setRegenOpen] = useState(Boolean(fromDraft));
  /** null = ainda não mexeu: vale o que o playbook já usa (+ o rascunho de origem). */
  const [regenIds, setRegenIds] = useState<string[] | null>(null);
  // A Biblioteca só é lida quando a regeração é aberta pela primeira vez.
  const [draftsWanted, setDraftsWanted] = useState(Boolean(fromDraft));
  const { drafts, error: draftsError } = useLibraryDrafts(draftsWanted);
  const [playbook, setPlaybook] = useState<PlaybookDraftDetail | null>(null);
  const [callContexts, setCallContexts] = useState<CallContextType[]>([]);
  const [methodologies, setMethodologies] = useState<Methodology[]>([]);
  const { connections, error: connectionsError, reload: reloadConnections } = useConnections();
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  /** Gravações do editor (salva no blur): alimenta o indicador e segura o envio. */
  const [saves] = useState(createSaveTracker);
  const [openingPicker, setOpeningPicker] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerConn, setPickerConn] = useState("");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>("sending");
  const [sendError, setSendError] = useState<HumanizedError | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPlaybook(await getPlaybookDraft(id));
      setLoadError(null);
    } catch (err) {
      // Sem isto a tela ficava em "Carregando playbook…" para sempre.
      setLoadError(describeFunctionError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    // Sem estes catálogos os seletores de cada etapa ficam vazios — a tela diz por quê.
    listCallContexts()
      .then(setCallContexts)
      .catch((err) =>
        addToast({
          title: "Não foi possível carregar os tipos de chamada",
          description: `O seletor “Tipo de chamada” das etapas fica vazio. ${describeFunctionError(err)}`,
          color: "warning",
        }),
      );
    listMethodologies()
      .then(setMethodologies)
      .catch((err) =>
        addToast({
          title: "Não foi possível carregar as metodologias",
          description: `O seletor “Metodologia” das etapas fica vazio. ${describeFunctionError(err)}`,
          color: "warning",
        }),
      );

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

  // Idem para o envio: função encerrada no meio deixava o playbook em "Enviando…"
  // para sempre. O poll devolve a "pronto" com o erro de envio, e o reenvio retoma.
  const exporting = playbook?.status === "exporting";
  useEffect(() => {
    if (!exporting) return;
    const timer = setInterval(() => {
      void (async () => {
        await pollSendPlaybook(id).catch(() => {});
        await refresh();
      })();
    }, 20_000);
    return () => clearInterval(timer);
  }, [exporting, id, refresh]);

  /**
   * Toda geração passa por aqui: é onde se escolhe o material revisado e, com
   * etapas na tela, onde se confirma que regerar as substitui (foi assim que um
   * erro de ENVIO virou perda das etapas editadas).
   */
  function requestGeneration() {
    setDraftsWanted(true);
    setRegenOpen(true);
  }

  /** Grava de quais rascunhos vem o material revisado e dispara a geração. */
  async function confirmGeneration(selectedIds: string[]) {
    setRegenOpen(false);
    setRetrying(true);
    try {
      // Sem a lista da Biblioteca não dá para montar as referências: mantém as que o
      // playbook já tem, em vez de apagar a escolha anterior.
      if (drafts && playbook) {
        await updatePlaybookInputFiles(
          id,
          withReviewedDrafts(
            playbook.input_files,
            selectedIds.flatMap((draftId) => drafts.find((d) => d.id === draftId) ?? []),
          ),
        );
      }
      await invokeGeneratePlaybook(id);
      setRegenIds(null);
      await refresh();
    } catch (err) {
      addToast({
        title: "Falha ao iniciar a estruturação",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setRetrying(false);
    }
  }

  /**
   * Clicar em "Enviar" com um campo em foco dispara o blur (que grava) e o clique
   * em sequência: espera a gravação terminar e relê o playbook antes de seguir.
   */
  async function openPicker() {
    if (openingPicker) return;
    setOpeningPicker(true);
    try {
      const { ok } = await saves.whenIdle();
      if (!ok) {
        addToast({
          title: "Há uma alteração que não foi salva",
          description: "Use “Tentar salvar de novo”, ao lado do botão de enviar, antes de enviar.",
          color: "warning",
        });
        return;
      }
      await refresh();
      setPickerConn(playbook?.export_run?.connection_id ?? "");
      setPickerOpen(true);
    } finally {
      setOpeningPicker(false);
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
      setSendError(humanizeSendError(err));
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
    const connection = connections?.find((c) => c.id === connectionId) ?? null;
    const callTypeCount = playbook?.playbook_call_types.length ?? 0;
    const blockCount = (playbook?.playbook_call_types ?? []).reduce(
      (sum, ct) => sum + ct.playbook_call_blocks.length,
      0,
    );
    const alreadySent =
      playbook?.export_run?.connection_id === connectionId &&
      playbook?.export_run?.perfecting_playbook_id != null;

    setConfirm({
      title: alreadySent ? "Continuar o envio para esta conta?" : "Criar o playbook nesta conta?",
      message: (
        <span className="flex flex-col gap-3">
          <DestinationSummary destinations={[{ connection }]} />
          {alreadySent ? (
            <span>
              Este playbook já foi enviado para esta conta. O envio vai{" "}
              <b>completar o que faltou</b> (etapas e subetapas ainda não criadas), sem duplicar o
              que já existe.
            </span>
          ) : (
            <span>
              Será criado <b>1 playbook</b> com{" "}
              <b>{countLabel(callTypeCount, "etapa", "etapas")}</b> e{" "}
              <b>{countLabel(blockCount, "subetapa", "subetapas")}</b>. Depois disso, a Criação
              consegue gerar os roleplays da jornada por cima dele.
            </span>
          )}
        </span>
      ),
      confirmLabel: alreadySent
        ? "Continuar envio"
        : isProduction(connection)
          ? "Criar em produção"
          : "Criar playbook",
      onConfirm: () => {
        void runSend(connectionId);
      },
    });
  }

  if (!playbook && loadError) {
    return (
      <div className="flex flex-col gap-0">
        <PageHeader backHref="/playbooks" title="Não foi possível abrir o playbook" />
        <EmptyState
          title="A leitura do playbook falhou"
          description={loadError}
          action={
            <Button variant="secondary" onPress={() => void refresh()}>
              Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }
  if (loading || !playbook) return <LoadingView label="Carregando playbook…" />;

  const callTypes = playbook.playbook_call_types;
  // Erro de envio ≠ erro de geração: só o segundo oferece "Retomar geração".
  const failure = classifyPlaybookFailure(playbook);
  const emptyState = playbookEmptyState(playbook, callTypes.length);
  const sendFailure = failure?.kind === "send" ? humanizeSendError(failure.error) : null;
  const errorMessage = failure?.kind === "generation" ? failure.message : null;
  // Playbook antigo que ficou em "error" por causa de um envio: a estrutura está pronta.
  const bannerStatus = sendFailure && playbook.status === "error" ? "ready" : playbook.status;
  const busy = playbook.status === "generating" || playbook.status === "exporting";
  // Mesma checagem que o envio faz no servidor — aqui só para avisar antes do clique.
  const exportIssues = validatePlaybookForExport({
    name: playbook.name,
    callTypes: callTypes.map((ct) => ({
      name: ct.name,
      description: ct.description,
      blocks: ct.playbook_call_blocks.map((b) => ({ name: b.name, description: b.description })),
    })),
  });
  const canSend = callTypes.length > 0 && playbook.status !== "generating";
  // Material revisado: o que o playbook já aponta e o que entrou na última geração.
  const reviewedRefs = reviewedDraftRefs(playbook.input_files);
  const reviewedUsed = reviewedRefs.filter((r) => r.used_at && !r.missing);
  const reviewedInfo = (playbook.usage?.reviewed_material ?? null) as {
    truncated?: string[];
    missing?: string[];
  } | null;
  const regenSelection =
    regenIds ??
    Array.from(
      new Set([...reviewedRefs.filter((r) => !r.missing).map((r) => r.draft_id), ...(fromDraft ? [fromDraft] : [])]),
    );
  const blockCount = callTypes.reduce((sum, ct) => sum + ct.playbook_call_blocks.length, 0);
  const remotePlaybookId = playbook.export_run?.perfecting_playbook_id;
  // Slugs de tipo de ligação/metodologia que não existem na conta de destino.
  const sendWarnings = playbook.export_run?.perfecting_playbook_id != null
    ? playbook.export_run?.warnings ?? []
    : [];

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        backHref="/playbooks"
        title={playbook.name}
        description="Revise as etapas e subetapas antes de criar o playbook na conta do cliente."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <SaveIndicator tracker={saves} />
            {callTypes.length > 0 && (
              <Button
                variant="secondary"
                onPress={requestGeneration}
                isDisabled={busy}
                isLoading={retrying}
                startContent={!retrying ? <ArrowPathIcon className="w-4 h-4" /> : undefined}
              >
                Regerar com IA
              </Button>
            )}
            <Button
              onPress={() => void openPicker()}
              isDisabled={!canSend}
              isLoading={openingPicker}
              startContent={!openingPicker ? <PaperAirplaneIcon className="w-4 h-4" /> : undefined}
            >
              Enviar para conta
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        <PlanStatusBanner
          status={bannerStatus}
          errorMessage={errorMessage}
          onRetry={requestGeneration}
          retrying={retrying}
          readyLabel="Playbook estruturado. Revise as etapas abaixo antes de enviar para a conta."
          runningLabels={RUNNING_LABELS}
        />

        {reviewedRefs.length > 0 && !busy && (
          <div className="flex flex-col gap-1 rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <p className="break-words leading-relaxed">
              <span className="font-medium text-slate-700">Material revisado:</span>{" "}
              {reviewedUsed.length > 0
                ? `a última estruturação usou ${reviewedUsed
                    .map((r) => r.name.replace(/^Rascunho revisado: /, "“") + "”")
                    .join(", ")}, além dos documentos.`
                : "há rascunho escolhido, mas ele ainda não entrou numa estruturação."}
            </p>
            {(reviewedInfo?.missing?.length ?? 0) > 0 && (
              <p className="break-words leading-relaxed text-amber-700">
                Não encontrado na última estruturação (apagado da Biblioteca):{" "}
                {reviewedInfo!.missing!.join(", ")}.
              </p>
            )}
            {(reviewedInfo?.truncated?.length ?? 0) > 0 && (
              <p className="break-words leading-relaxed text-amber-700">
                Encurtado para caber: {reviewedInfo!.truncated!.join("; ")}.
              </p>
            )}
          </div>
        )}

        {sendFailure && !busy && (
          <div className="flex flex-col gap-3 rounded-sm border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <XCircleIcon className="w-5 h-5 shrink-0 text-red-600" />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm font-medium text-red-800">O envio falhou</p>
                <p className="text-sm leading-relaxed text-red-700 break-words">
                  {sendFailure.message}
                </p>
                {sendFailure.issues.length > 0 && (
                  <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm leading-relaxed text-red-700">
                    {sendFailure.issues.map((issue, i) => (
                      <li key={i} className="break-words">
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm leading-relaxed text-red-700">
                  As etapas abaixo continuam salvas. Ajuste o que for preciso e reenvie — o que já
                  foi criado na conta não é duplicado.
                </p>
                {sendFailure.technical && (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-red-700 hover:text-red-900">
                      Detalhes técnicos
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-red-200 bg-white p-3 text-xs text-slate-600">
                      {sendFailure.technical}
                    </pre>
                  </details>
                )}
              </div>
            </div>
            <Button variant="secondary" onPress={() => void openPicker()} className="shrink-0">
              Reenviar
            </Button>
          </div>
        )}

        {exportIssues.length > 0 && !busy && (
          <div className="flex flex-col gap-1 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              {exportIssues.length === 1
                ? "1 pendência antes de enviar"
                : `${exportIssues.length} pendências antes de enviar`}{" "}
              — a Perfecting recusaria este conteúdo.
            </p>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm leading-relaxed text-amber-800">
              {exportIssues.slice(0, 6).map((issue, i) => (
                <li key={i} className="break-words">
                  {issue.message}
                </li>
              ))}
              {exportIssues.length > 6 && <li>e mais {exportIssues.length - 6}…</li>}
            </ul>
          </div>
        )}

        {playbook.status === "exported" && (
          <div className="rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            Playbook criado na conta (id {playbook.export_run?.perfecting_playbook_id}). Agora é só
            ir na Criação, escolher essa conta e gerar os roleplays pelo playbook.
          </div>
        )}

        {sendWarnings.length > 0 && !busy && (
          <div className="flex flex-col gap-1 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              {sendWarnings.length === 1 ? "1 aviso do envio" : `${sendWarnings.length} avisos do envio`}{" "}
              — confira na conta antes de gerar os roleplays.
            </p>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm leading-relaxed text-amber-800">
              {sendWarnings.map((warning, i) => (
                <li key={i} className="break-words">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {callTypes.length === 0 && playbook.status !== "generating" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-4 rounded-sm border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              {emptyState === "never_ran" ? (
                <>
                  <p className="max-w-md text-sm text-slate-600">
                    Este playbook ainda não foi estruturado: a IA não leu o material para montar
                    as etapas.
                  </p>
                  <Button onPress={requestGeneration} isLoading={retrying}>
                    Estruturar playbook
                  </Button>
                </>
              ) : emptyState === "generation_failed" ? (
                <>
                  <p className="max-w-md text-sm text-slate-600">
                    A estruturação falhou antes de criar as etapas — o motivo está no aviso acima.
                    O material enviado continua salvo.
                  </p>
                  <Button variant="secondary" onPress={requestGeneration} isLoading={retrying}>
                    Tentar estruturar de novo
                  </Button>
                </>
              ) : (
                <>
                  <p className="max-w-md text-sm text-slate-600">
                    Este playbook está sem etapas. Adicione à mão, logo abaixo, ou estruture de
                    novo a partir do material.
                  </p>
                  <Button variant="secondary" onPress={requestGeneration} isLoading={retrying}>
                    Estruturar de novo
                  </Button>
                </>
              )}
            </div>
            {emptyState !== "never_ran" && emptyState !== "generation_failed" && (
              <PlaybookEditor
                playbookId={playbook.id}
                callTypes={callTypes}
                callContexts={callContexts}
                methodologies={methodologies}
                saves={saves}
                onChanged={refresh}
              />
            )}
          </div>
        ) : (
          <PlaybookEditor
            playbookId={playbook.id}
            callTypes={callTypes}
            callContexts={callContexts}
            methodologies={methodologies}
            saves={saves}
            onChanged={refresh}
          />
        )}
      </div>

      <Modal isOpen={pickerOpen} onOpenChange={setPickerOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Conta de destino</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Onde o playbook será criado. Antes de enviar, a próxima tela confirma conta e
              ambiente.
            </p>
            <ConnectionPicker
              connections={connections}
              value={pickerConn}
              onChange={setPickerConn}
              label="Conta"
              loadError={connectionsError}
              onRetry={reloadConnections}
              isRequired
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setPickerOpen(false)}>
              Cancelar
            </Button>
            <Button onPress={confirmPickerAndSend} isDisabled={!pickerConn}>
              Continuar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={regenOpen} onOpenChange={setRegenOpen} radius="sm" size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>
            {callTypes.length > 0 ? "Regerar o playbook do zero?" : "Estruturar o playbook com IA"}
          </ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4 text-sm leading-relaxed text-slate-600">
              {callTypes.length > 0 ? (
                <p className="rounded-sm bg-red-50 px-3 py-2 text-red-800">
                  Regerar <b>substitui as {callTypes.length} etapa(s) e {blockCount} subetapa(s)</b>{" "}
                  que estão na tela, com todas as edições feitas à mão, e estrutura o playbook de
                  novo. Não dá para desfazer.
                </p>
              ) : (
                <p>A IA lê o material do playbook e monta as etapas e subetapas para você revisar.</p>
              )}
              {callTypes.length > 0 && remotePlaybookId != null && (
                <p>
                  Este playbook já foi criado na conta (id {remotePlaybookId}) e <b>continua lá</b>:
                  a versão regerada é enviada como um playbook novo. Exclua o antigo na Perfecting
                  antes de reenviar — com ele lá, o envio é recusado por nome repetido.
                </p>
              )}
              <ReviewedDraftPicker
                drafts={drafts}
                error={draftsError}
                value={regenSelection}
                onChange={setRegenIds}
                preferConnectionId={playbook.export_run?.connection_id ?? null}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setRegenOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={callTypes.length > 0 ? "danger" : "primary"}
              onPress={() => void confirmGeneration(regenSelection)}
              // Sem a lista da Biblioteca a escolha não pode ser gravada: espera carregar.
              isDisabled={busy || retrying || (drafts == null && !draftsError)}
            >
              {callTypes.length > 0 ? "Substituir etapas e regerar" : "Estruturar"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />

      <SendStatusModal
        open={sendModalOpen}
        status={sendStatus}
        errorMessage={sendError?.message}
        errorTitle={sendError?.title}
        errorIssues={sendError?.issues}
        errorDetails={sendError?.technical}
        retryable={sendError?.retryable ?? true}
        onRetry={() => void runSend(pickerConn)}
        onClose={() => setSendModalOpen(false)}
        sendingLabel="Criando o playbook na conta de destino…"
        successTitle="Playbook criado na conta!"
        successHint="Agora dá para gerar os roleplays por ele na Criação."
      />
    </div>
  );
}

export default function PlaybookDetailPage() {
  return (
    <Suspense fallback={<LoadingView label="Carregando playbook…" />}>
      <PlaybookDetail />
    </Suspense>
  );
}
