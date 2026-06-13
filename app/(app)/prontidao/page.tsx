"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Textarea,
  addToast,
} from "@heroui/react";
import {
  PlusIcon,
  TrashIcon,
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  PencilSquareIcon,
  StarIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import {
  ReadinessStatusBadge,
  READINESS_STATUS_META,
} from "@/app/components/ui/readiness-status-badge";
import { ScriptView } from "@/app/components/roleplay-script-view";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { cn } from "@/app/lib/cn";
import {
  aggregateRoleplay,
  computeEvaluationKpis,
  displayNameFor,
  formatPct,
  formatScore5,
  initialsFor,
  type RoleplayAggregate,
} from "@/app/lib/evaluation";
import { EVALUATION_CRITERIA, SCORE_MAX, SCORE_MIN } from "@/app/lib/evaluation-criteria";
import { resolveRoteiro, scriptToText } from "@/app/lib/roleplay-scripts";
import { createClient } from "@/app/lib/supabase/client";
import {
  createReadiness,
  createTrackingClient,
  deleteOwnEvaluation,
  deleteReadiness,
  getEvalWeights,
  listEvaluations,
  listProfiles,
  listReadiness,
  listTrackingClients,
  updateReadiness,
  upsertEvaluation,
  upsertOwnProfile,
} from "@/app/lib/db";
import type {
  EvalWeights,
  Profile,
  ReadinessStatus,
  RoleplayEvaluation,
  RoleplayReadiness,
  TrackingClient,
} from "@/app/lib/types";

const STATUS_KEYS = Object.keys(READINESS_STATUS_META) as ReadinessStatus[];

export default function ProntidaoPage() {
  const [clients, setClients] = useState<TrackingClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [rows, setRows] = useState<RoleplayReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  // avaliação
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [evals, setEvals] = useState<RoleplayEvaluation[]>([]);
  const [evalWeights, setEvalWeights] = useState<EvalWeights>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // modais
  const [scriptRowId, setScriptRowId] = useState<string | null>(null);
  const [scriptEditing, setScriptEditing] = useState(false);
  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptSaving, setScriptSaving] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newRpOpen, setNewRpOpen] = useState(false);
  const [newRpName, setNewRpName] = useState("");
  const [newRpPersona, setNewRpPersona] = useState("");

  // modal de avaliação
  const [evalRowId, setEvalRowId] = useState<string | null>(null);
  const [evalTab, setEvalTab] = useState<"minha" | "consolidado">("minha");
  const [myScores, setMyScores] = useState<Record<string, number>>({});
  const [myComments, setMyComments] = useState<Record<string, string>>({});
  const [myOverall, setMyOverall] = useState("");
  const [evalSaving, setEvalSaving] = useState(false);

  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const loadRows = useCallback(async (id: string) => {
    setRowsLoading(true);
    try {
      const data = await listReadiness(id);
      setRows(data);
      setEvals(await listEvaluations(data.map((r) => r.id)));
    } finally {
      setRowsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
      await upsertOwnProfile().catch(() => {});
      const [cs, w, ps] = await Promise.all([
        listTrackingClients(),
        getEvalWeights(),
        listProfiles(),
      ]);
      setClients(cs);
      setEvalWeights(w);
      setProfiles(ps);
      const first = cs.find((c) => c.name === "RD") ?? cs[0];
      if (first) {
        setClientId(first.id);
        await loadRows(first.id);
      }
      setLoading(false);
    })();
  }, [loadRows]);

  async function selectClient(id: string) {
    if (id === clientId) return;
    setClientId(id);
    await loadRows(id);
  }

  // Agregados por roleplay e KPIs do conjunto.
  const aggregates = useMemo(() => {
    const byRow = new Map<string, RoleplayEvaluation[]>();
    for (const e of evals) {
      const arr = byRow.get(e.readiness_id);
      if (arr) arr.push(e);
      else byRow.set(e.readiness_id, [e]);
    }
    const m = new Map<string, RoleplayAggregate>();
    for (const r of rows) m.set(r.id, aggregateRoleplay(r.id, byRow.get(r.id) ?? [], evalWeights));
    return m;
  }, [rows, evals, evalWeights]);

  const kpis = useMemo(() => computeEvaluationKpis(rows, aggregates), [rows, aggregates]);

  /** Salva o status direto (sem lote), com update otimista. */
  async function changeStatus(row: RoleplayReadiness, status: ReadinessStatus) {
    if (status === row.status) return;
    const prev = row.status;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r)));
    try {
      await updateReadiness(row.id, { status });
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: prev } : r)));
      addToast({
        title: "Erro ao salvar status",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  async function removeRow(id: string) {
    try {
      await deleteReadiness(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setEvals((prev) => prev.filter((e) => e.readiness_id !== id));
    } catch (err) {
      addToast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  /** Abre o modal de roteiro de um roleplay (modo leitura). */
  function openScript(row: RoleplayReadiness) {
    setScriptRowId(row.id);
    setScriptEditing(false);
  }

  async function saveRoteiro() {
    if (!scriptRowId) return;
    const value = scriptDraft.trim() || null;
    setScriptSaving(true);
    try {
      await updateReadiness(scriptRowId, { roteiro: value });
      setRows((prev) => prev.map((r) => (r.id === scriptRowId ? { ...r, roteiro: value } : r)));
      setScriptEditing(false);
      addToast({ title: "Roteiro salvo", color: "success" });
    } catch (err) {
      addToast({
        title: "Erro ao salvar roteiro",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setScriptSaving(false);
    }
  }

  /** Abre o modal de avaliação, pré-preenchendo a avaliação do usuário atual. */
  function openEval(row: RoleplayReadiness) {
    const mine = evals.find((e) => e.readiness_id === row.id && e.evaluator_id === currentUserId);
    setMyScores(mine?.scores ?? {});
    setMyComments(mine?.comments ?? {});
    setMyOverall(mine?.overall_comment ?? "");
    setEvalTab("minha");
    setEvalRowId(row.id);
  }

  function setScore(key: string, n: number) {
    setMyScores((prev) => {
      const next = { ...prev };
      if (next[key] === n) delete next[key];
      else next[key] = n;
      return next;
    });
  }

  async function saveEval() {
    if (!evalRowId) return;
    const scores: Record<string, number> = {};
    const comments: Record<string, string> = {};
    for (const c of EVALUATION_CRITERIA) {
      const v = myScores[c.key];
      if (typeof v === "number" && v >= SCORE_MIN && v <= SCORE_MAX) scores[c.key] = v;
      const note = (myComments[c.key] ?? "").trim();
      if (note) comments[c.key] = note;
    }
    setEvalSaving(true);
    try {
      const saved = await upsertEvaluation({
        readinessId: evalRowId,
        scores,
        comments,
        overallComment: myOverall.trim() || null,
      });
      setEvals((prev) => [
        ...prev.filter(
          (e) => !(e.readiness_id === saved.readiness_id && e.evaluator_id === saved.evaluator_id),
        ),
        saved,
      ]);
      addToast({ title: "Avaliação salva", color: "success" });
    } catch (err) {
      addToast({
        title: "Erro ao salvar avaliação",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setEvalSaving(false);
    }
  }

  async function removeMyEval() {
    if (!evalRowId) return;
    try {
      await deleteOwnEvaluation(evalRowId);
      setEvals((prev) =>
        prev.filter((e) => !(e.readiness_id === evalRowId && e.evaluator_id === currentUserId)),
      );
      setMyScores({});
      setMyComments({});
      setMyOverall("");
      addToast({ title: "Avaliação removida", color: "success" });
    } catch (err) {
      addToast({
        title: "Erro ao remover avaliação",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  async function addClient() {
    const name = newClientName.trim();
    if (!name) return;
    try {
      const { id } = await createTrackingClient(name);
      const cs = await listTrackingClients();
      setClients(cs);
      setNewClientOpen(false);
      setNewClientName("");
      await selectClient(id);
    } catch (err) {
      addToast({
        title: "Erro ao criar cliente",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  async function addRoleplay() {
    const name = newRpName.trim();
    if (!name) return;
    try {
      const position = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
      const row = await createReadiness({
        clientId,
        name,
        persona: newRpPersona.trim() || null,
        position,
      });
      setRows((prev) => [...prev, row]);
      setNewRpOpen(false);
      setNewRpName("");
      setNewRpPersona("");
    } catch (err) {
      addToast({
        title: "Erro ao adicionar roleplay",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  if (loading) return <LoadingView label="Carregando prontidão…" />;

  const evalRow = evalRowId ? rows.find((r) => r.id === evalRowId) ?? null : null;
  const evalAgg = evalRowId ? aggregates.get(evalRowId) ?? null : null;
  const evalRowEvals = evalRowId ? evals.filter((e) => e.readiness_id === evalRowId) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prontidão dos Roleplays"
        description="Cada pessoa avalia a qualidade de cada roleplay em vários critérios; o score é a média ponderada das avaliações."
        action={
          <div className="flex items-end gap-2">
            <Select
              label="Cliente"
              labelPlacement="outside"
              selectedKeys={clientId ? [clientId] : []}
              onSelectionChange={(k) => {
                const id = String(Array.from(k)[0] ?? "");
                if (id) void selectClient(id);
              }}
              radius="sm"
              variant="bordered"
              className="min-w-[180px]"
              classNames={managerSelectClassNames}
            >
              {clients.map((c) => (
                <SelectItem key={c.id} textValue={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </Select>
            <Button
              variant="secondary"
              onPress={() => setNewClientOpen(true)}
              className="shrink-0 whitespace-nowrap px-4"
            >
              Novo cliente
            </Button>
          </div>
        }
      />

      {client && (
        <>
          {/* KPIs do conjunto */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="Score médio" value={formatScore5(kpis.scoreMedio)} />
            <Kpi label="% avaliados" value={formatPct(kpis.pctAvaliados)} />
            <Kpi label="Pendências" value={String(kpis.pendencias)} />
            <Kpi label="Bloqueios" value={String(kpis.bloqueios)} />
            <Kpi label="Total" value={String(kpis.total)} />
          </div>

          {/* Tabela */}
          {rows.length === 0 && !rowsLoading ? (
            <EmptyState
              title="Nenhum roleplay neste cliente"
              description="Adicione o primeiro roleplay para começar o acompanhamento."
              action={<Button onPress={() => setNewRpOpen(true)}>Adicionar roleplay</Button>}
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-4 py-2.5 text-left">Roleplay</th>
                    <th className="px-3 py-2.5 text-left">Qualidade</th>
                    <th className="px-3 py-2.5 text-left">Avaliações</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const agg = aggregates.get(r.id);
                    const raterCount = agg?.evaluatorCount ?? 0;
                    const iRated =
                      !!currentUserId &&
                      evals.some(
                        (e) => e.readiness_id === r.id && e.evaluator_id === currentUserId,
                      );
                    return (
                      <tr
                        key={r.id}
                        className="group border-b border-slate-100 align-middle text-sm text-slate-800"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <div className="font-medium" title={r.persona ?? r.name}>
                                {(r.persona ?? r.name).split("—")[0].trim()}
                              </div>
                              {r.persona && <div className="text-xs text-slate-500">{r.name}</div>}
                            </div>
                            <button
                              type="button"
                              aria-label="Ver roteiro"
                              title="Ver roteiro do roleplay"
                              className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-blue-600 focus-visible:opacity-100 group-hover:opacity-100"
                              onClick={() => openScript(r)}
                            >
                              <DocumentTextIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Excluir roleplay"
                              title="Excluir roleplay"
                              className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                              onClick={() =>
                                setConfirm({
                                  title: "Excluir roleplay?",
                                  message: (
                                    <>
                                      Excluir <b>{r.name}</b> do acompanhamento. Esta ação não pode
                                      ser desfeita.
                                    </>
                                  ),
                                  confirmLabel: "Excluir",
                                  onConfirm: () => void removeRow(r.id),
                                })
                              }
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-semibold tabular-nums">
                            {formatScore5(agg?.overall ?? null)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => openEval(r)}
                            className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-slate-50"
                            title="Avaliar / ver consolidado"
                          >
                            {raterCount > 0 ? (
                              <span className="flex -space-x-1.5">
                                {agg!.evaluatorIds.slice(0, 4).map((id) => {
                                  const p = profileById.get(id);
                                  return (
                                    <InitialChip
                                      key={id}
                                      text={p ? initialsFor(p) : "?"}
                                      title={p ? displayNameFor(p) : "Avaliador"}
                                    />
                                  );
                                })}
                              </span>
                            ) : (
                              <StarIcon className="h-4 w-4 text-slate-400" />
                            )}
                            <span className="text-xs text-slate-500">
                              {raterCount}/{profiles.length} avaliaram
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <Select
                            aria-label="Status"
                            selectedKeys={[r.status]}
                            onSelectionChange={(k) =>
                              void changeStatus(
                                r,
                                String(Array.from(k)[0] ?? r.status) as ReadinessStatus,
                              )
                            }
                            radius="sm"
                            variant="bordered"
                            size="sm"
                            className="min-w-[140px]"
                            classNames={managerSelectClassNames}
                            renderValue={() => <ReadinessStatusBadge status={r.status} />}
                          >
                            {STATUS_KEYS.map((s) => (
                              <SelectItem key={s} textValue={READINESS_STATUS_META[s].label}>
                                {READINESS_STATUS_META[s].label}
                              </SelectItem>
                            ))}
                          </Select>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {iRated ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="border-green-200 text-green-700 data-[hover=true]:bg-green-50"
                              onPress={() => openEval(r)}
                            >
                              Avaliado
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              startContent={<BookOpenIcon className="h-4 w-4" />}
                              onPress={() => openEval(r)}
                            >
                              Avaliar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-2 p-3">
                <Button
                  variant="secondary"
                  size="sm"
                  startContent={<PlusIcon className="h-4 w-4" />}
                  onPress={() => setNewRpOpen(true)}
                >
                  Adicionar roleplay
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Modal: novo cliente */}
      <Modal isOpen={newClientOpen} onOpenChange={setNewClientOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Novo cliente</ModalHeader>
          <ModalBody>
            <Input
              label="Nome do cliente"
              labelPlacement="outside"
              placeholder="ex.: RD"
              value={newClientName}
              onValueChange={setNewClientName}
              radius="sm"
              variant="bordered"
              autoFocus
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setNewClientOpen(false)}>
              Cancelar
            </Button>
            <Button onPress={addClient}>Criar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: novo roleplay */}
      <Modal isOpen={newRpOpen} onOpenChange={setNewRpOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Adicionar roleplay</ModalHeader>
          <ModalBody className="gap-4">
            <Input
              label="Nome do roleplay"
              labelPlacement="outside"
              placeholder="ex.: RP1.1 (v3)"
              value={newRpName}
              onValueChange={setNewRpName}
              radius="sm"
              variant="bordered"
              autoFocus
            />
            <Input
              label="Persona (opcional)"
              labelPlacement="outside"
              placeholder="ex.: Antônio Ribeiro — Diretor Executivo"
              value={newRpPersona}
              onValueChange={setNewRpPersona}
              radius="sm"
              variant="bordered"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setNewRpOpen(false)}>
              Cancelar
            </Button>
            <Button onPress={addRoleplay}>Adicionar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal: avaliação */}
      <Modal
        isOpen={evalRowId !== null}
        onOpenChange={(open) => {
          if (!open) setEvalRowId(null);
        }}
        radius="sm"
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {evalRow && (
            <>
              <ModalHeader className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Avaliar roleplay
                </span>
                <span>{evalRow.persona ?? evalRow.name}</span>
              </ModalHeader>
              <ModalBody className="gap-4 pb-2">
                <div className="flex gap-1 rounded-sm bg-slate-100 p-1 text-sm">
                  <TabButton active={evalTab === "minha"} onClick={() => setEvalTab("minha")}>
                    Minha avaliação
                  </TabButton>
                  <TabButton
                    active={evalTab === "consolidado"}
                    onClick={() => setEvalTab("consolidado")}
                  >
                    Consolidado ({evalAgg?.evaluatorCount ?? 0})
                  </TabButton>
                </div>

                {evalTab === "minha" ? (
                  <div className="flex flex-col gap-5">
                    {EVALUATION_CRITERIA.map((c) => (
                      <div key={c.key} className="flex flex-col gap-2">
                        <div>
                          <div className="text-sm font-medium text-slate-800">{c.label}</div>
                          <div className="text-xs text-slate-500">{c.description}</div>
                        </div>
                        <ScoreButtons value={myScores[c.key]} onChange={(n) => setScore(c.key, n)} />
                        <Textarea
                          aria-label={`Comentário — ${c.label}`}
                          placeholder="Comentário (opcional)"
                          value={myComments[c.key] ?? ""}
                          onValueChange={(v) =>
                            setMyComments((prev) => ({ ...prev, [c.key]: v }))
                          }
                          minRows={1}
                          radius="sm"
                          variant="bordered"
                        />
                      </div>
                    ))}
                    <Textarea
                      label="Comentário geral (opcional)"
                      labelPlacement="outside"
                      placeholder="Impressão geral, contexto da rodada avaliada, etc."
                      value={myOverall}
                      onValueChange={setMyOverall}
                      minRows={2}
                      radius="sm"
                      variant="bordered"
                    />
                    <p className="text-xs text-slate-400">
                      Clique na nota de novo para desmarcá-la. Você pode avaliar apenas alguns
                      critérios — o score considera só os que receberam nota.
                    </p>
                  </div>
                ) : (
                  <ConsolidatedView
                    agg={evalAgg}
                    evals={evalRowEvals}
                    profiles={profiles}
                    profileById={profileById}
                    weights={evalWeights}
                  />
                )}
              </ModalBody>
              <ModalFooter className="justify-between">
                {evalTab === "minha" &&
                evals.some(
                  (e) => e.readiness_id === evalRowId && e.evaluator_id === currentUserId,
                ) ? (
                  <Button variant="secondary" onPress={removeMyEval} isDisabled={evalSaving}>
                    Remover minha avaliação
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onPress={() => setEvalRowId(null)}>
                    Fechar
                  </Button>
                  {evalTab === "minha" && (
                    <Button onPress={saveEval} isLoading={evalSaving}>
                      Salvar avaliação
                    </Button>
                  )}
                </div>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Modal: roteiro do roleplay */}
      <Modal
        isOpen={scriptRowId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setScriptRowId(null);
            setScriptEditing(false);
            setScriptDraft("");
          }
        }}
        radius="sm"
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(() => {
            const row = scriptRowId ? rows.find((r) => r.id === scriptRowId) ?? null : null;
            if (!row) return null;
            const { title, body } = resolveRoteiro(row.name, row.roteiro);
            return (
              <>
                <ModalHeader className="flex flex-col items-start gap-0.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Roteiro do vendedor
                  </span>
                  <span>{title}</span>
                </ModalHeader>
                {scriptEditing ? (
                  <>
                    <ModalBody className="gap-2 pb-2">
                      <Textarea
                        aria-label="Roteiro"
                        value={scriptDraft}
                        onValueChange={setScriptDraft}
                        minRows={16}
                        radius="sm"
                        variant="bordered"
                        autoFocus
                      />
                      <p className="text-xs text-slate-400">
                        Aceita markdown (títulos #, **negrito**, listas). Deixe em branco e salve
                        para voltar ao roteiro padrão.
                      </p>
                    </ModalBody>
                    <ModalFooter>
                      <Button
                        variant="secondary"
                        onPress={() => setScriptEditing(false)}
                        isDisabled={scriptSaving}
                      >
                        Cancelar
                      </Button>
                      <Button onPress={saveRoteiro} isLoading={scriptSaving}>
                        Salvar
                      </Button>
                    </ModalFooter>
                  </>
                ) : (
                  <>
                    <ModalBody className="gap-4 pb-2">
                      {body ? (
                        <ScriptView markdown={body} />
                      ) : (
                        <p className="text-sm text-slate-500">
                          Este roleplay ainda não tem roteiro. Clique em “Editar” para adicionar.
                        </p>
                      )}
                    </ModalBody>
                    <ModalFooter className="justify-between">
                      <Button
                        variant="secondary"
                        startContent={<ClipboardDocumentIcon className="h-4 w-4" />}
                        isDisabled={!body}
                        onPress={async () => {
                          try {
                            await navigator.clipboard.writeText(scriptToText(title, body));
                            addToast({ title: "Roteiro copiado", color: "success" });
                          } catch {
                            addToast({ title: "Não foi possível copiar", color: "danger" });
                          }
                        }}
                      >
                        Copiar
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          startContent={<PencilSquareIcon className="h-4 w-4" />}
                          onPress={() => {
                            setScriptDraft(body);
                            setScriptEditing(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="secondary"
                          startContent={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                          isDisabled={!body}
                          onPress={() => window.open(`/roteiro/${row.id}`, "_blank")}
                        >
                          Abrir em nova aba
                        </Button>
                        <Button onPress={() => setScriptRowId(null)}>Fechar</Button>
                      </div>
                    </ModalFooter>
                  </>
                )}
              </>
            );
          })()}
        </ModalContent>
      </Modal>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-slate-800">{value}</span>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-sm px-3 py-1.5 font-medium transition-colors",
        active ? "bg-white text-slate-800 shadow-[var(--shadow-sm)]" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

function ScoreButtons({
  value,
  onChange,
}: {
  value?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={cn(
            "h-9 w-9 rounded-sm border text-sm font-medium tabular-nums transition-colors",
            value === n
              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
              : "border-slate-200 text-slate-600 hover:bg-slate-50",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function InitialChip({ text, title, muted }: { text: string; title?: string; muted?: boolean }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border border-white text-[10px] font-semibold ring-1 ring-slate-200",
        muted ? "bg-slate-100 text-slate-400" : "bg-blue-100 text-blue-700",
      )}
    >
      {text}
    </span>
  );
}

function ConsolidatedView({
  agg,
  evals,
  profiles,
  profileById,
  weights,
}: {
  agg: RoleplayAggregate | null;
  evals: RoleplayEvaluation[];
  profiles: Profile[];
  profileById: Map<string, Profile>;
  weights: EvalWeights;
}) {
  const ratedIds = new Set(agg?.evaluatorIds ?? []);
  const pendentes = profiles.filter((p) => !ratedIds.has(p.id));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between rounded-sm bg-slate-50 px-4 py-3">
        <span className="text-sm font-medium text-slate-600">Qualidade geral</span>
        <span className="text-lg font-semibold tabular-nums text-slate-800">
          {formatScore5(agg?.overall ?? null)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Médias por critério
        </div>
        {EVALUATION_CRITERIA.map((c) => {
          const pc = agg?.perCriterion.find((p) => p.key === c.key);
          return (
            <div
              key={c.key}
              className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm"
            >
              <span className="text-slate-700">{c.label}</span>
              <span className="tabular-nums text-slate-500">
                {pc && pc.average !== null ? (
                  <>
                    <span className="font-semibold text-slate-800">
                      {pc.average.toFixed(1).replace(".", ",")}
                    </span>{" "}
                    / {SCORE_MAX} · {pc.count}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Quem avaliou
        </div>
        {evals.length === 0 ? (
          <p className="text-sm text-slate-500">Ninguém avaliou ainda.</p>
        ) : (
          evals.map((e) => {
            const p = profileById.get(e.evaluator_id);
            const overall = aggregateRoleplay(e.readiness_id, [e], weights).overall;
            return (
              <div key={e.id} className="flex items-center justify-between py-1 text-sm">
                <span className="flex items-center gap-2">
                  <InitialChip text={p ? initialsFor(p) : "?"} />
                  <span className="text-slate-700">{p ? displayNameFor(p) : "Avaliador"}</span>
                </span>
                <span className="font-semibold tabular-nums text-slate-800">
                  {formatScore5(overall)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {pendentes.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pendentes
          </div>
          <div className="flex flex-wrap gap-2">
            {pendentes.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
              >
                <InitialChip text={initialsFor(p)} muted />
                {displayNameFor(p)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
