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
  InformationCircleIcon,
  TrashIcon,
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  PencilSquareIcon,
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
import { computeScore, computeKpis, formatScorePct } from "@/app/lib/readiness";
import { resolveRoteiro, scriptToText } from "@/app/lib/roleplay-scripts";
import {
  createReadiness,
  createTrackingClient,
  deleteReadiness,
  getAppWeights,
  listReadiness,
  listTrackingClients,
  updateReadiness,
} from "@/app/lib/db";
import type {
  CriteriaWeights,
  ReadinessStatus,
  RoleplayReadiness,
  TrackingClient,
} from "@/app/lib/types";

const SCORE_OPTIONS = [
  { key: "0", label: "Não feito" },
  { key: "0.5", label: "Parcial" },
  { key: "1", label: "OK" },
];
const STATUS_KEYS = Object.keys(READINESS_STATUS_META) as ReadinessStatus[];

// Critérios de análise: campo de nota + campo de observação ("o que falta") + rótulo.
const CRITERIA = [
  { score: "score_prompt", note: "note_prompt", label: "Prompt Contextual" },
  { score: "score_roteiro", note: "note_roteiro", label: "Realismo da Fala" },
  { score: "score_teste", note: "note_teste", label: "Testes" },
] as const;

type CriterionScore = (typeof CRITERIA)[number]["score"];
type CriterionNote = (typeof CRITERIA)[number]["note"];

// Campos que entram no lote de edição (Salvar/Descartar alterações).
const EDITABLE_FIELDS = [
  "score_prompt",
  "score_roteiro",
  "score_teste",
  "note_prompt",
  "note_roteiro",
  "note_teste",
  "status",
] as const;

interface NoteModalState {
  rowId: string;
  noteField: CriterionNote;
  label: string;
  value: string;
  /** true = abriu pelo ícone de info (só consulta/edição); false = veio do select Parcial. */
  fromInfo: boolean;
}

export default function ProntidaoPage() {
  const [clients, setClients] = useState<TrackingClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [rows, setRows] = useState<RoleplayReadiness[]>([]);
  const [baseline, setBaseline] = useState<RoleplayReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  // pesos globais dos critérios (editados em Configurações)
  const [weights, setWeights] = useState<CriteriaWeights>({
    weight_prompt: 0.3,
    weight_roteiro: 0.4,
    weight_teste: 0.3,
  });

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
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);

  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);

  const loadRows = useCallback(async (id: string) => {
    setRowsLoading(true);
    try {
      const data = await listReadiness(id);
      setRows(data);
      setBaseline(data);
    } finally {
      setRowsLoading(false);
    }
  }, []);

  // Linhas com edições pendentes (diferem do baseline nos campos editáveis).
  const dirtyIds = useMemo(() => {
    const base = new Map(baseline.map((r) => [r.id, r]));
    return rows
      .filter((r) => {
        const b = base.get(r.id);
        return !b || EDITABLE_FIELDS.some((f) => r[f] !== b[f]);
      })
      .map((r) => r.id);
  }, [rows, baseline]);
  const isDirty = dirtyIds.length > 0;

  useEffect(() => {
    void (async () => {
      const [cs, w] = await Promise.all([listTrackingClients(), getAppWeights()]);
      setClients(cs);
      setWeights(w);
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
    const go = async () => {
      setClientId(id);
      await loadRows(id);
    };
    if (isDirty) {
      setConfirm({
        title: "Descartar alterações não salvas?",
        message: "Você tem alterações não salvas neste cliente. Trocar de cliente vai descartá-las.",
        confirmLabel: "Descartar e trocar",
        onConfirm: () => void go(),
      });
      return;
    }
    await go();
  }

  /** Edita uma linha apenas localmente (entra no lote de Salvar/Descartar). */
  function editRow(id: string, patch: Partial<RoleplayReadiness>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveChanges() {
    setSaving(true);
    try {
      const dirtySet = new Set(dirtyIds);
      const toSave = rows.filter((r) => dirtySet.has(r.id));
      for (const r of toSave) {
        const patch = Object.fromEntries(
          EDITABLE_FIELDS.map((f) => [f, r[f]]),
        ) as Partial<RoleplayReadiness>;
        await updateReadiness(r.id, patch);
      }
      setBaseline(rows);
      addToast({ title: "Alterações salvas", color: "success" });
    } catch (err) {
      addToast({
        title: "Erro ao salvar alterações",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setRows(baseline);
  }

  async function removeRow(id: string) {
    try {
      await deleteReadiness(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setBaseline((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      addToast({
        title: "Erro ao excluir",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  /** Mudança de nota num critério; ao escolher "Parcial" abre o modal de "o que falta". */
  function handleScoreChange(
    row: RoleplayReadiness,
    scoreField: CriterionScore,
    noteField: CriterionNote,
    label: string,
    value: number,
  ) {
    editRow(row.id, { [scoreField]: value });
    if (value === 0.5) {
      setNoteModal({
        rowId: row.id,
        noteField,
        label,
        value: row[noteField] ?? "",
        fromInfo: false,
      });
    }
  }

  /** Abre o modal a partir do ícone de info (consulta/edição do que falta). */
  function openNote(row: RoleplayReadiness, noteField: CriterionNote, label: string) {
    setNoteModal({ rowId: row.id, noteField, label, value: row[noteField] ?? "", fromInfo: true });
  }

  function saveNote() {
    if (!noteModal) return;
    const { rowId, noteField, value } = noteModal;
    setNoteModal(null);
    editRow(rowId, { [noteField]: value.trim() || null });
  }

  /** Abre o modal de roteiro de um roleplay (modo leitura). */
  function openScript(row: RoleplayReadiness) {
    setScriptRowId(row.id);
    setScriptEditing(false);
  }

  /** Salva o roteiro editado direto na linha (fora do lote de edição). */
  async function saveRoteiro() {
    if (!scriptRowId) return;
    const value = scriptDraft.trim() || null;
    setScriptSaving(true);
    try {
      await updateReadiness(scriptRowId, { roteiro: value });
      const apply = (r: RoleplayReadiness) =>
        r.id === scriptRowId ? { ...r, roteiro: value } : r;
      setRows((prev) => prev.map(apply));
      setBaseline((prev) => prev.map(apply));
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
      setBaseline((prev) => [...prev, row]);
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

  const kpis = useMemo(() => (client ? computeKpis(rows, weights) : null), [rows, client, weights]);

  if (loading) return <LoadingView label="Carregando prontidão…" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prontidão dos Roleplays"
        description="Acompanhe o quanto cada roleplay já está pronto para ir ao ar — avalie cada etapa e veja a evolução por cliente."
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
            <Kpi label="Score médio" value={formatScorePct(kpis!.scoreMedio)} />
            <Kpi label="% prontos" value={formatScorePct(kpis!.pctProntos)} />
            <Kpi label="% testados" value={formatScorePct(kpis!.pctTestados)} />
            <Kpi label="Bloqueios" value={String(kpis!.bloqueios)} />
            <Kpi label="Total" value={String(kpis!.total)} />
          </div>

          {/* Tabela editável */}
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
                    <th className="px-3 py-2.5 text-left">Prompt Contextual</th>
                    <th className="px-3 py-2.5 text-left">Realismo da Fala</th>
                    <th className="px-3 py-2.5 text-left">Testes</th>
                    <th className="px-3 py-2.5 text-left">Score</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
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
                            {r.persona && (
                              <div className="text-xs text-slate-500">{r.name}</div>
                            )}
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
                      {CRITERIA.map(({ score, note, label }) => (
                        <td key={score} className="px-3 py-3">
                          <ScoreSelect
                            value={r[score]}
                            onChange={(v) => handleScoreChange(r, score, note, label, v)}
                            endContent={
                              r[score] === 0.5 ? (
                                // <span role="button"> em vez de <button>: o endContent fica
                                // dentro do <button> do trigger do Select (HTML não permite
                                // button aninhado).
                                <span
                                  role="button"
                                  tabIndex={0}
                                  aria-label="O que falta"
                                  title={r[note] ?? "Descrever o que falta"}
                                  className="flex shrink-0 cursor-pointer items-center self-center text-blue-500 transition-colors hover:text-blue-700"
                                  onPointerDown={(e) => {
                                    // impede o react-aria do Select de abrir o dropdown no pointer-down
                                    e.stopPropagation();
                                    e.preventDefault();
                                    openNote(r, note, label);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      openNote(r, note, label);
                                    }
                                  }}
                                >
                                  <InformationCircleIcon className="h-5 w-5" />
                                </span>
                              ) : undefined
                            }
                          />
                        </td>
                      ))}
                      <td className="px-3 py-3 font-semibold tabular-nums">
                        {formatScorePct(computeScore(r, weights))}
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          aria-label="Status"
                          selectedKeys={[r.status]}
                          onSelectionChange={(k) =>
                            editRow(r.id, {
                              status: String(Array.from(k)[0] ?? r.status) as ReadinessStatus,
                            })
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
                    </tr>
                  ))}
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
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={!isDirty || saving}
                    onPress={discardChanges}
                  >
                    Descartar alterações
                  </Button>
                  <Button
                    size="sm"
                    isDisabled={!isDirty}
                    isLoading={saving}
                    onPress={saveChanges}
                  >
                    Salvar alterações
                  </Button>
                </div>
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

      {/* Modal: o que falta (critério Parcial) */}
      <Modal isOpen={noteModal !== null} onOpenChange={() => setNoteModal(null)} radius="sm">
        <ModalContent>
          <ModalHeader>{noteModal?.label} — o que falta?</ModalHeader>
          <ModalBody>
            <Textarea
              label="Descreva o que ainda falta para ficar OK"
              labelPlacement="outside"
              placeholder="ex.: falas prontas, mas o prompt ainda precisa de ajuste."
              value={noteModal?.value ?? ""}
              onValueChange={(v) =>
                setNoteModal((prev) => (prev ? { ...prev, value: v } : prev))
              }
              minRows={4}
              radius="sm"
              variant="bordered"
              autoFocus
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setNoteModal(null)}>
              Cancelar
            </Button>
            <Button onPress={saveNote}>Salvar</Button>
          </ModalFooter>
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
                        Aceita markdown (títulos #, **negrito**, listas). Deixe em branco e
                        salve para voltar ao roteiro padrão.
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
                          Este roleplay ainda não tem roteiro. Clique em “Editar” para
                          adicionar.
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

function ScoreSelect({
  value,
  onChange,
  endContent,
}: {
  value: number;
  onChange: (v: number) => void;
  endContent?: React.ReactNode;
}) {
  return (
    <Select
      aria-label="Nota"
      selectedKeys={[String(value)]}
      onSelectionChange={(k) => onChange(Number(Array.from(k)[0] ?? value))}
      radius="sm"
      variant="bordered"
      size="sm"
      className="min-w-[140px]"
      classNames={{ ...managerSelectClassNames, innerWrapper: "items-center" }}
      endContent={endContent}
    >
      {SCORE_OPTIONS.map((o) => (
        <SelectItem key={o.key} textValue={o.label}>
          {o.label}
        </SelectItem>
      ))}
    </Select>
  );
}

