"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Checkbox,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Textarea,
  addToast,
} from "@heroui/react";
import { InformationCircleIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { StatusBadge } from "@/app/components/ui/status-badge";
import { EmptyState } from "@/app/components/ui/empty-state";
import { LoadingView } from "@/app/components/ui/loading-view";
import { DraftActions } from "@/app/components/library/draft-actions";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { createClient } from "@/app/lib/supabase/client";
import {
  deleteDraft,
  invokeAddPersonas,
  invokeExport,
  invokeExportPlaybook,
  listConnections,
  listDrafts,
  listPersonaCatalog,
  listPlaybooks,
  pollPlaybookRun,
  setDraftConnection,
  updateDraftScenario,
} from "@/app/lib/db";
import type {
  CaseSetupPersonas,
  Connection,
  DraftRow,
  GenerationMode,
  Playbook,
} from "@/app/lib/types";
import { perfectingRoleplayUrl } from "@/app/lib/perfecting-app";

const isPlaybookDraft = (d: DraftRow) => d.scenario?.generation_mode === "playbook";

/** Etapas do pipeline de implementação (as do meio vêm cruas da API). */
const PLAYBOOK_STAGE_LABELS: Record<string, string> = {
  starting: "iniciando",
  offer: "oferta",
  context: "contexto",
  persona: "persona", // drafts antigos (uma persona só)
  personas: "criando personas",
  creating_companies: "criando empresas",
  creating_personas: "criando personas",
  generating_step_knowledge: "conteúdo por persona",
  implementing: "implementando",
  validating_methodologies: "validando metodologias",
  creating_case_setup: "criando roleplay",
  generating_methodology_content: "gerando conteúdo",
  generating_behavior_guidance: "gerando comportamento",
  generating_objections: "gerando objeções",
  building_case_prompt: "montando prompt",
  creating_elevenlabs_agent: "criando agente de voz",
  generating_playbook_last_call_info: "resumo da etapa anterior",
  dispatching_cycle: "preparando etapa",
  deploying_tests: "publicando testes",
  call_type_completed: "etapa concluída",
  call_type_skipped: "etapa pulada",
  // O acompanhamento ao vivo caiu (limite da Edge Function); progresso vem da contagem.
  tracking_remote: "gerando na Perfecting",
  step_objections: "objeções por etapa",
  done: "concluído",
};

/** Estágios do lote de personas — usam progresso "persona i/N", não "etapa i/N". */
const PERSONA_STAGES = new Set([
  "personas",
  "persona",
  "creating_companies",
  "creating_personas",
  "generating_step_knowledge",
]);

/** Label pt-BR conhecido, ou o nome cru com "_" trocado por espaço — nunca some. */
function playbookStageLabel(stage: string): string {
  return PLAYBOOK_STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

/** Lote avulso de personas em andamento (começou e não terminou nem falhou). */
function isPersonaTopUpRunning(d: DraftRow): boolean {
  const t = d.playbook_run?.persona_topup;
  return Boolean(t?.started_at && !t.finished_at);
}

export default function BibliotecaPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // modal de escolha de conta (e modo) antes do envio
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerConn, setPickerConn] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [pickerMode, setPickerMode] = useState<GenerationMode>("methodology");
  const [pickerPlaybooks, setPickerPlaybooks] = useState<Playbook[]>([]);
  const [pickerPlaybookId, setPickerPlaybookId] = useState("");
  const [pickerPersonaCount, setPickerPersonaCount] = useState("1");
  const [pickerLoadingPlaybooks, setPickerLoadingPlaybooks] = useState(false);

  // modal de "ver texto"
  const [viewText, setViewText] = useState<string | null>(null);

  // modal de detalhes do envio (progresso/erro cru de um rascunho)
  const [detailDraftId, setDetailDraftId] = useState<string | null>(null);

  // modal de confirmação (envio)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  // modal de personas (quais cada roleplay aceita + adicionar mais)
  const [personaDraftId, setPersonaDraftId] = useState<string | null>(null);
  const [personaCatalog, setPersonaCatalog] = useState<{
    available: boolean;
    items: CaseSetupPersonas[];
  } | null>(null);
  const [personaCatalogError, setPersonaCatalogError] = useState<string | null>(null);
  const [addQuantity, setAddQuantity] = useState("1");
  const [addingPersonas, setAddingPersonas] = useState(false);

  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([listDrafts(), listConnections()]);
    setDrafts(d);
    setConnections(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    // realtime: atualizar status durante o export
    const supabase = createClient();
    const channel = supabase
      .channel("drafts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roleplay_drafts" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  /** Trocar a conta no modal invalida o playbook escolhido (é por organização). */
  function handlePickerConnChange(id: string) {
    setPickerConn(id);
    setPickerMode("methodology");
    setPickerPlaybookId("");
    setPickerPersonaCount("1");
    setPickerPlaybooks([]);
    setPickerLoadingPlaybooks(Boolean(id));
  }

  // Playbooks da conta escolhida no modal — só dá para saber depois de escolhê-la.
  useEffect(() => {
    if (!pickerConn) return;
    let active = true;
    listPlaybooks(pickerConn)
      .then((items) => {
        if (active) setPickerPlaybooks(items);
      })
      .catch(() => {
        if (active) setPickerPlaybooks([]);
      })
      .finally(() => {
        if (active) setPickerLoadingPlaybooks(false);
      });
    return () => {
      active = false;
    };
  }, [pickerConn]);

  const allSelected = drafts.length > 0 && selected.size === drafts.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(drafts.map((d) => d.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Inicia o envio: se algum draft não tem conta, pede uma no modal.
   * No lote (force=false) pula rascunhos já exportados ou em andamento —
   * evita duplicar roleplays na Perfecting sem querer. O reenvio individual
   * (force=true) já passa pela confirmação no menu do item.
   */
  function startSend(ids: string[], force = false) {
    if (ids.length === 0) return;
    if (!force) {
      const blocked = ids.filter((id) => {
        const s = drafts.find((x) => x.id === id)?.status;
        return s === "exported" || s === "exporting";
      });
      if (blocked.length > 0) {
        addToast({
          title: `${blocked.length} rascunho(s) já exportado(s) ou em envio — pulado(s)`,
          description: "Para duplicar de propósito, use “Reenviar” no menu do item.",
          color: "warning",
        });
      }
      ids = ids.filter((id) => !blocked.includes(id));
      if (ids.length === 0) return;
    }
    const missingConn = ids.some((id) => {
      const d = drafts.find((x) => x.id === id);
      return !d?.connection_id;
    });
    if (missingConn) {
      setPendingIds(ids);
      setPickerConn("");
      setPickerMode("methodology");
      setPickerPlaybookId("");
      setPickerPersonaCount("1");
      setPickerPlaybooks([]);
      setPickerOpen(true);
    } else {
      const sendIds = ids;
      setConfirm({
        title: `Enviar ${sendIds.length} roleplay(s) para a Perfecting?`,
        message: (
          <>
            Isso vai <b>criar o(s) roleplay(s) na conta de destino</b> (HML ou
            produção, conforme a conexão escolhida). Confira a conta antes de continuar.
          </>
        ),
        confirmLabel: "Enviar",
        onConfirm: () => {
          void runExport(sendIds);
        },
      });
    }
  }

  async function confirmPickerAndSend() {
    if (!pickerConn) {
      addToast({ title: "Escolha uma conta de destino", color: "warning" });
      return;
    }
    if (pickerMode === "playbook" && !pickerPlaybookId) {
      addToast({ title: "Escolha o playbook", color: "warning" });
      return;
    }
    setPickerOpen(false);
    const selectedPlaybook = pickerPlaybooks.find((p) => String(p.id) === pickerPlaybookId);
    // Preenche a conta (e o modo) nos drafts sem destino. Só eles: um rascunho sem
    // conta não pode ter passado pela escolha de modo na Criação (playbook exige
    // conta selecionada antes), então sobrescrever aqui é seguro.
    for (const id of pendingIds) {
      const d = drafts.find((x) => x.id === id);
      if (!d?.connection_id) {
        await setDraftConnection(id, pickerConn);
        await updateDraftScenario(id, {
          generation_mode: pickerMode,
          playbook_id: pickerMode === "playbook" ? Number(pickerPlaybookId) : null,
          playbook_name: pickerMode === "playbook" ? (selectedPlaybook?.name ?? null) : null,
          persona_count: pickerMode === "playbook" ? Number(pickerPersonaCount) : null,
        });
      }
    }
    await runExport(pendingIds);
  }

  async function runExport(ids: string[]) {
    setSending(true);
    try {
      // Busca os rascunhos direto do banco: logo após o modal de conta gravar o
      // modo (updateDraftScenario), o estado local "drafts" ainda está desatualizado.
      const freshDrafts = await listDrafts();
      // Playbook tem motor próprio (job longo, 1 roleplay por etapa) e responde
      // 202 — o resultado chega por realtime/poll, não na resposta.
      const playbookIds = ids.filter((id) => {
        const d = freshDrafts.find((x) => x.id === id);
        return d ? isPlaybookDraft(d) : false;
      });
      const methodologyIds = ids.filter((id) => !playbookIds.includes(id));
      if (methodologyIds.length > 0) await invokeExport(methodologyIds);
      for (const id of playbookIds) await invokeExportPlaybook(id);
      setSelected(new Set());
      await refresh();
    } catch (err) {
      addToast({
        title: "Falha no envio",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteDraft(id);
    await refresh();
  }

  /** Abre o modal de personas e busca o catálogo (o que o vendedor vai ver). */
  async function openPersonaModal(draftId: string) {
    setPersonaDraftId(draftId);
    setPersonaCatalog(null);
    setPersonaCatalogError(null);
    setAddQuantity("1");
    try {
      setPersonaCatalog(await listPersonaCatalog(draftId));
    } catch (err) {
      setPersonaCatalogError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddPersonas() {
    if (!personaDraftId) return;
    setAddingPersonas(true);
    try {
      await invokeAddPersonas(personaDraftId, Number(addQuantity));
      addToast({
        title: "Lote de personas iniciado",
        description:
          "As personas novas também ganham conteúdo nos roleplays que já existem — leva alguns minutos.",
        color: "success",
      });
      setPersonaDraftId(null);
      await refresh();
    } catch (err) {
      addToast({
        title: "Falha ao adicionar personas",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setAddingPersonas(false);
    }
  }

  const selectedArr = useMemo(() => Array.from(selected), [selected]);
  // Lido de "drafts" (não congelado no clique) — acompanha o progresso em tempo real.
  const detailDraft = detailDraftId ? (drafts.find((d) => d.id === detailDraftId) ?? null) : null;

  /** Duração entre dois timestamps fixos — nunca usa "agora" (evita recalcular a
   *  cada render enquanto o envio está em andamento; nesse caso mostra só o início). */
  function formatDuration(startIso: string, endIso: string): string | null {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  }

  // Chave estável: sem isso o realtime recria o intervalo a cada refresh e o poll nunca dispara.
  const runningPlaybookIds = useMemo(
    () =>
      drafts
        .filter((d) => d.status === "exporting" && isPlaybookDraft(d))
        .map((d) => d.id)
        .sort()
        .join(","),
    [drafts],
  );

  /** Reconcilia implementações em andamento (cobre stream que caiu no meio). */
  useEffect(() => {
    if (!runningPlaybookIds) return;
    const ids = runningPlaybookIds.split(",");
    const timer = setInterval(() => {
      void (async () => {
        for (const id of ids) await pollPlaybookRun(id).catch(() => {});
        await refresh();
      })();
    }, 20_000);
    return () => clearInterval(timer);
  }, [runningPlaybookIds, refresh]);

  if (loading) return <LoadingView label="Carregando biblioteca…" />;

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Biblioteca"
        description="Rascunhos importados. Envie para a Perfecting individualmente ou em lote."
        action={
          selected.size > 0 ? (
            <Button
              onPress={() => startSend(selectedArr)}
              isLoading={sending}
              startContent={<PaperAirplaneIcon className="w-4 h-4" />}
            >
              Enviar {selected.size} em lote
            </Button>
          ) : undefined
        }
      />

      {drafts.length === 0 ? (
        <EmptyState
          title="Nenhum rascunho ainda"
          description="Importe um texto ou arquivo para criar seu primeiro roleplay."
          action={
            <Button as="a" href="/criacao">
              Criação
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="w-10 px-4 py-2.5">
                  <Checkbox isSelected={allSelected} onValueChange={toggleAll} size="sm" />
                </th>
                <th className="px-4 py-2.5 text-left">Oferta</th>
                <th className="hidden px-4 py-2.5 text-left sm:table-cell">Conta destino</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Criado</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id} className="text-sm font-medium text-slate-800">
                  <td className="px-4 py-4">
                    <Checkbox
                      isSelected={selected.has(d.id)}
                      onValueChange={() => toggle(d.id)}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-4">{d.offer?.offer_name ?? d.title ?? "—"}</td>
                  <td className="hidden px-4 py-4 text-slate-600 sm:table-cell">
                    {d.connection?.org_name ?? "—"}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      {d.status === "exported" && d.perfecting_case_setup_id ? (
                        <a
                          href={perfectingRoleplayUrl(
                            d.connection?.environment,
                            d.perfecting_case_setup_id,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex"
                          title="Abrir na Perfecting"
                        >
                          <StatusBadge status={d.status} />
                        </a>
                      ) : (
                        <StatusBadge status={d.status} />
                      )}
                      {(d.playbook_run || d.error_detail) && (
                        <button
                          type="button"
                          onClick={() => setDetailDraftId(d.id)}
                          title="Detalhes do envio"
                          aria-label="Detalhes do envio"
                          className="inline-flex shrink-0 rounded-sm p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                          <InformationCircleIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {isPlaybookDraft(d) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {d.status === "exporting" ? (
                          <span>
                            {(() => {
                              const stage = d.playbook_run?.stage;
                              if (stage && PERSONA_STAGES.has(stage)) {
                                const total =
                                  d.playbook_run?.item_total ?? d.playbook_run?.personas_requested;
                                return total
                                  ? `persona ${d.playbook_run?.item_index ?? 0}/${total}`
                                  : "criando personas";
                              }
                              return d.playbook_run?.call_type_total
                                ? `etapa ${d.playbook_run.call_type_index ?? 0}/${d.playbook_run.call_type_total}`
                                : "preparando";
                            })()}
                            {d.playbook_run?.stage ? ` — ${playbookStageLabel(d.playbook_run.stage)}` : ""}
                          </span>
                        ) : (
                          (d.playbook_run?.case_setup_ids?.length ?? 0) > 0 && (
                            <div className="flex flex-col gap-0.5">
                              <span className="flex flex-wrap items-center gap-1">
                                {d.playbook_run!.case_setup_ids!.length} roleplays:
                                {d.playbook_run!.case_setup_ids!.map((id, i) => (
                                  <a
                                    key={id}
                                    href={perfectingRoleplayUrl(d.connection?.environment, id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline hover:text-slate-700"
                                    title={`Abrir roleplay ${id}`}
                                  >
                                    {i + 1}
                                  </a>
                                ))}
                              </span>
                              {(d.playbook_run?.persona_names?.length ?? 0) > 1 && (
                                <span>Personas: {d.playbook_run!.persona_names!.join(", ")}</span>
                              )}
                              {(d.playbook_run?.warnings?.length ?? 0) > 0 && (
                                <span
                                  className="text-amber-600"
                                  title={d.playbook_run!.warnings!.join("\n")}
                                >
                                  {d.playbook_run!.warnings!.length} aviso(s)
                                </span>
                              )}
                              {isPersonaTopUpRunning(d) ? (
                                <span>
                                  adicionando personas
                                  {d.playbook_run?.persona_topup?.item_total
                                    ? ` (${d.playbook_run.persona_topup.item_index ?? 0}/${d.playbook_run.persona_topup.item_total})`
                                    : "…"}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void openPersonaModal(d.id)}
                                  className="self-start underline hover:text-slate-700"
                                >
                                  ver personas
                                </button>
                              )}
                              {d.playbook_run?.persona_topup?.error && (
                                <span className="text-red-600" title={d.playbook_run.persona_topup.error}>
                                  falha no último lote de personas
                                </span>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-4 text-slate-500 md:table-cell">
                    {new Date(d.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <DraftActions
                      draft={d}
                      onSend={() => startSend([d.id], true)}
                      onViewText={async () => {
                        const supabase = createClient();
                        const { data } = await supabase
                          .from("offers")
                          .select("general_description")
                          .eq("id", d.offer_id)
                          .single();
                        setViewText(data?.general_description ?? "");
                      }}
                      onDelete={() => handleDelete(d.id)}
                      connections={connections}
                      onAfterNewScenario={refresh}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Modal: personas do rascunho — o que o vendedor vai ver, e adicionar mais */}
      <Modal
        isOpen={Boolean(personaDraftId)}
        onOpenChange={(open) => !open && setPersonaDraftId(null)}
        radius="sm"
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>Personas deste envio</ModalHeader>
          <ModalBody className="gap-4">
            {personaCatalogError ? (
              <p className="text-sm text-red-600">{personaCatalogError}</p>
            ) : !personaCatalog ? (
              <p className="text-sm text-slate-500">Carregando o catálogo…</p>
            ) : !personaCatalog.available ? (
              <p className="text-sm text-slate-500">
                Esta conta não expõe o catálogo de personas — é o caso da API de produção, onde o
                seletor de persona não existe. Em HML, o catálogo mostra quais personas cada
                roleplay aceita.
              </p>
            ) : personaCatalog.items.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum roleplay com persona vinculada foi encontrado neste contexto.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">
                  É o mesmo catálogo que a tela de pré-chamada da Perfecting usa: o vendedor vê o
                  seletor de persona quando o roleplay aceita mais de uma.
                </p>
                {personaCatalog.items.map((item) => (
                  <div
                    key={item.case_setup_id}
                    className="flex flex-col gap-1 rounded-sm border border-slate-200 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        {item.training_name ?? `Roleplay ${item.case_setup_id}`}
                      </span>
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-xs ${
                          item.has_specific_persona
                            ? "bg-slate-100 text-slate-600"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {item.has_specific_persona
                          ? "persona fixa"
                          : `o vendedor escolhe entre ${item.personas.length}`}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {item.personas.map((p) => p.name ?? `Persona ${p.id}`).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
              <p className="text-sm font-medium text-slate-700">Adicionar personas</p>
              <p className="text-xs text-slate-500">
                As personas novas entram no mesmo contexto e <b>também ganham conteúdo próprio nos
                roleplays que já existem</b> — é por isso que leva alguns minutos. Os roleplays com
                persona fixa não mudam.
              </p>
              <Select
                label="Quantas"
                labelPlacement="outside-top"
                selectedKeys={[addQuantity]}
                onSelectionChange={(k) => setAddQuantity(String(Array.from(k)[0] ?? "1"))}
                radius="sm"
                variant="bordered"
                classNames={managerSelectClassNames}
                className="max-w-32"
              >
                {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
                  <SelectItem key={n} textValue={n}>
                    {n}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setPersonaDraftId(null)}>
              Fechar
            </Button>
            <Button onPress={handleAddPersonas} isLoading={addingPersonas}>
              Adicionar {addQuantity} persona{Number(addQuantity) > 1 ? "s" : ""}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: escolher conta de destino (e modo, se a conta tiver playbook) */}
      <Modal isOpen={pickerOpen} onOpenChange={setPickerOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Conta de destino</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Escolha a org da Perfecting onde os roleplays serão criados (HML ou
              produção). O envio cria <b>conteúdo real na conta do cliente</b>.
            </p>
            <Select
              label="Conta"
              labelPlacement="outside"
              selectedKeys={pickerConn ? [pickerConn] : []}
              onSelectionChange={(k) => handlePickerConnChange(String(Array.from(k)[0] ?? ""))}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
              description={pickerLoadingPlaybooks ? "Verificando se esta conta tem playbook…" : undefined}
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

            {pickerConn && !pickerLoadingPlaybooks && pickerPlaybooks.length === 0 && (
              <p className="text-xs text-slate-500">
                Esta conta não tem playbook — o envio segue por metodologia.
              </p>
            )}

            {pickerPlaybooks.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-slate-700">Como gerar o(s) roleplay(s)</p>
                <Tabs
                  selectedKey={pickerMode}
                  onSelectionChange={(k) => setPickerMode(String(k) as GenerationMode)}
                  radius="sm"
                  variant="bordered"
                  classNames={{ tabList: "rounded-sm", tab: "rounded-sm" }}
                >
                  <Tab key="methodology" title="Por metodologia" />
                  <Tab key="playbook" title="Pelo playbook da conta" />
                </Tabs>
              </div>
            )}

            {pickerMode === "playbook" && pickerPlaybooks.length > 0 && (
              <>
                <Select
                  label="Playbook"
                  labelPlacement="outside"
                  placeholder="Escolha o playbook"
                  selectedKeys={pickerPlaybookId ? [pickerPlaybookId] : []}
                  onSelectionChange={(k) => setPickerPlaybookId(String(Array.from(k)[0] ?? ""))}
                  radius="sm"
                  variant="bordered"
                  classNames={managerSelectClassNames}
                  isRequired
                >
                  {pickerPlaybooks.map((p) => (
                    <SelectItem key={String(p.id)} textValue={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </Select>
                <Select
                  label="Quantas personas?"
                  labelPlacement="outside-top"
                  selectedKeys={[pickerPersonaCount]}
                  onSelectionChange={(k) => setPickerPersonaCount(String(Array.from(k)[0] ?? "1"))}
                  radius="sm"
                  variant="bordered"
                  classNames={managerSelectClassNames}
                  description={
                    Number(pickerPersonaCount) > 1
                      ? "O vendedor escolhe qual persona enfrentar na hora da call."
                      : "Uma persona só, travada em todas as etapas — comportamento de sempre."
                  }
                >
                  {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
                    <SelectItem key={n} textValue={n}>
                      {n}
                    </SelectItem>
                  ))}
                </Select>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setPickerOpen(false)}>
              Cancelar
            </Button>
            <Button onPress={confirmPickerAndSend} isLoading={sending}>
              Enviar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: ver texto */}
      <Modal isOpen={viewText !== null} onOpenChange={() => setViewText(null)} radius="sm" size="2xl">
        <ModalContent>
          <ModalHeader>Texto da oferta</ModalHeader>
          <ModalBody className="pb-6">
            <Textarea value={viewText ?? ""} minRows={12} isReadOnly radius="sm" variant="bordered" />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Modal: detalhes do envio (progresso do playbook_run e/ou erro cru) */}
      <Modal
        isOpen={detailDraftId !== null}
        onOpenChange={(open) => !open && setDetailDraftId(null)}
        radius="sm"
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col items-start gap-0.5">
            <span>Detalhes do envio</span>
            <span className="text-xs font-normal text-slate-500">
              {detailDraft?.offer?.offer_name ?? detailDraft?.title ?? ""}
            </span>
          </ModalHeader>
          <ModalBody className="gap-4 pb-6">
            {detailDraft && (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Status</dt>
                    <dd>
                      <StatusBadge status={detailDraft.status} />
                    </dd>
                  </div>
                  {detailDraft.playbook_run?.stage && (
                    <div>
                      <dt className="text-xs text-slate-500">Estágio atual</dt>
                      <dd className="text-slate-700">
                        {playbookStageLabel(detailDraft.playbook_run.stage)}
                      </dd>
                    </div>
                  )}
                  {detailDraft.playbook_run?.call_type_total != null && (
                    <div>
                      <dt className="text-xs text-slate-500">Etapas do playbook</dt>
                      <dd className="text-slate-700">
                        {detailDraft.playbook_run.call_type_index ?? 0} de{" "}
                        {detailDraft.playbook_run.call_type_total}
                      </dd>
                    </div>
                  )}
                  {detailDraft.playbook_run?.started_at && (
                    <div>
                      <dt className="text-xs text-slate-500">
                        {detailDraft.playbook_run.finished_at ? "Duração" : "Iniciado"}
                      </dt>
                      <dd className="text-slate-700">
                        {detailDraft.playbook_run.finished_at
                          ? (formatDuration(
                              detailDraft.playbook_run.started_at,
                              detailDraft.playbook_run.finished_at,
                            ) ?? "—")
                          : `${new Date(detailDraft.playbook_run.started_at).toLocaleTimeString("pt-BR")} (em andamento)`}
                      </dd>
                    </div>
                  )}
                  {(detailDraft.playbook_run?.persona_names?.length ?? 0) > 0 && (
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Personas</dt>
                      <dd className="text-slate-700">
                        {detailDraft.playbook_run!.persona_names!.join(", ")}
                      </dd>
                    </div>
                  )}
                  {detailDraft.playbook_run?.context_content && (
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Objeções/regras no contexto</dt>
                      <dd className="text-slate-700">
                        {detailDraft.playbook_run.context_content.objections_created} objeção(ões)
                        criada(s)
                        {detailDraft.playbook_run.context_content.objections_skipped > 0 &&
                          ` (${detailDraft.playbook_run.context_content.objections_skipped} já existiam)`}
                        {" · "}
                        {detailDraft.playbook_run.context_content.guardrails_created} regra(s)
                        criada(s)
                        {detailDraft.playbook_run.context_content.guardrails_skipped > 0 &&
                          ` (${detailDraft.playbook_run.context_content.guardrails_skipped} já existiam)`}
                      </dd>
                    </div>
                  )}
                  {detailDraft.playbook_run?.step_objections && (
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Objeções nas etapas</dt>
                      <dd className="text-slate-700">
                        {detailDraft.playbook_run.step_objections.state === "waiting_assignment"
                          ? "aguardando a IA encaixar as objeções nas etapas"
                          : `${detailDraft.playbook_run.step_objections.objections_created ?? 0} objeção(ões) criada(s)` +
                            ((detailDraft.playbook_run.step_objections.objections_skipped ?? 0) > 0
                              ? ` (${detailDraft.playbook_run.step_objections.objections_skipped} já existiam)`
                              : "")}
                      </dd>
                    </div>
                  )}
                  {(detailDraft.playbook_run?.case_setup_ids?.length ?? 0) > 0 && (
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Roleplays criados</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {detailDraft.playbook_run!.case_setup_ids!.map((id) => (
                          <a
                            key={id}
                            href={perfectingRoleplayUrl(detailDraft.connection?.environment, id)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-700 underline hover:text-slate-900"
                          >
                            {id}
                          </a>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>

                {(detailDraft.playbook_run?.warnings?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-1 rounded-sm bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-medium">Avisos</p>
                    <ul className="list-disc pl-4">
                      {detailDraft.playbook_run!.warnings!.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {detailDraft.error_detail != null && (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-red-700">Erro</p>
                    <Textarea
                      value={JSON.stringify(detailDraft.error_detail, null, 2)}
                      minRows={4}
                      isReadOnly
                      radius="sm"
                      variant="bordered"
                      classNames={{ input: "font-mono text-xs" }}
                    />
                  </div>
                )}

                {detailDraft.playbook_run && (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-slate-700">Dados brutos (playbook_run)</p>
                    <Textarea
                      value={JSON.stringify(detailDraft.playbook_run, null, 2)}
                      minRows={6}
                      isReadOnly
                      radius="sm"
                      variant="bordered"
                      classNames={{ input: "font-mono text-xs" }}
                    />
                  </div>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setDetailDraftId(null)}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
