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
import { PlusIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  ReadinessStatusBadge,
  READINESS_STATUS_META,
} from "@/app/components/ui/readiness-status-badge";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { computeScore, computeKpis, formatScorePct } from "@/app/lib/readiness";
import {
  createReadiness,
  createTrackingClient,
  listReadiness,
  listTrackingClients,
  updateClientWeights,
  updateReadiness,
} from "@/app/lib/db";
import type { ReadinessStatus, RoleplayReadiness, TrackingClient } from "@/app/lib/types";

const SCORE_OPTIONS = [
  { key: "0", label: "Não feito" },
  { key: "0.5", label: "Parcial" },
  { key: "1", label: "OK" },
];
const STATUS_KEYS = Object.keys(READINESS_STATUS_META) as ReadinessStatus[];

// Critérios de análise: campo de nota + campo de observação ("o que falta") + rótulo.
const CRITERIA = [
  { score: "score_prompt", note: "note_prompt", label: "Prompt" },
  { score: "score_roteiro", note: "note_roteiro", label: "Roteiro/Falas" },
  { score: "score_teste", note: "note_teste", label: "Teste" },
] as const;

type CriterionScore = (typeof CRITERIA)[number]["score"];
type CriterionNote = (typeof CRITERIA)[number]["note"];

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
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);

  // pesos (edição)
  const [wPrompt, setWPrompt] = useState("30");
  const [wRoteiro, setWRoteiro] = useState("40");
  const [wTeste, setWTeste] = useState("30");
  const [savingWeights, setSavingWeights] = useState(false);

  // modais
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newRpOpen, setNewRpOpen] = useState(false);
  const [newRpName, setNewRpName] = useState("");
  const [newRpPersona, setNewRpPersona] = useState("");
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);

  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);

  // sincroniza os inputs de peso quando o cliente muda
  useEffect(() => {
    if (!client) return;
    setWPrompt(String(Math.round(client.weight_prompt * 100)));
    setWRoteiro(String(Math.round(client.weight_roteiro * 100)));
    setWTeste(String(Math.round(client.weight_teste * 100)));
  }, [client]);

  const loadRows = useCallback(async (id: string) => {
    setRowsLoading(true);
    try {
      setRows(await listReadiness(id));
    } finally {
      setRowsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const cs = await listTrackingClients();
      setClients(cs);
      const first = cs.find((c) => c.name === "RD") ?? cs[0];
      if (first) {
        setClientId(first.id);
        await loadRows(first.id);
      }
      setLoading(false);
    })();
  }, [loadRows]);

  async function selectClient(id: string) {
    setClientId(id);
    await loadRows(id);
  }

  /** Atualiza uma linha localmente (otimista) e persiste o patch. */
  async function patchRow(id: string, patch: Partial<RoleplayReadiness>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      await updateReadiness(id, patch);
    } catch (err) {
      addToast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
      void loadRows(clientId);
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
    void patchRow(row.id, { [scoreField]: value });
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

  async function saveNote() {
    if (!noteModal) return;
    const { rowId, noteField, value } = noteModal;
    setNoteModal(null);
    await patchRow(rowId, { [noteField]: value.trim() || null });
  }

  async function saveWeights() {
    const p = Number(wPrompt);
    const r = Number(wRoteiro);
    const t = Number(wTeste);
    if ([p, r, t].some((n) => Number.isNaN(n) || n < 0)) {
      addToast({ title: "Pesos inválidos", color: "warning" });
      return;
    }
    if (p + r + t !== 100) {
      addToast({ title: "Os pesos devem somar 100%", color: "warning" });
      return;
    }
    setSavingWeights(true);
    try {
      const weights = { weight_prompt: p / 100, weight_roteiro: r / 100, weight_teste: t / 100 };
      await updateClientWeights(clientId, weights);
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, ...weights } : c)));
      addToast({ title: "Pesos salvos", color: "success" });
    } catch (err) {
      addToast({
        title: "Erro ao salvar pesos",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSavingWeights(false);
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

  const kpis = useMemo(() => (client ? computeKpis(rows, client) : null), [rows, client]);

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

          {/* Pesos dos critérios */}
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Pesos dos critérios</h2>
              <span className="text-xs text-slate-500">Devem somar 100%</span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <WeightInput label="Prompt (%)" value={wPrompt} onChange={setWPrompt} />
              <WeightInput label="Roteiro/Falas (%)" value={wRoteiro} onChange={setWRoteiro} />
              <WeightInput label="Teste (%)" value={wTeste} onChange={setWTeste} />
              <Button onPress={saveWeights} isLoading={savingWeights}>
                Salvar pesos
              </Button>
            </div>
          </Card>

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
                    <th className="px-3 py-2.5 text-left">Prompt</th>
                    <th className="px-3 py-2.5 text-left">Roteiro/Falas</th>
                    <th className="px-3 py-2.5 text-left">Teste</th>
                    <th className="px-3 py-2.5 text-left">Score</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 align-middle text-sm text-slate-800"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium" title={r.persona ?? r.name}>
                          {(r.persona ?? r.name).split("—")[0].trim()}
                        </div>
                        {r.persona && <div className="text-xs text-slate-500">{r.name}</div>}
                      </td>
                      {CRITERIA.map(({ score, note, label }) => (
                        <td key={score} className="px-3 py-3">
                          <ScoreSelect
                            value={r[score]}
                            onChange={(v) => handleScoreChange(r, score, note, label, v)}
                            endContent={
                              r[score] === 0.5 ? (
                                <button
                                  type="button"
                                  aria-label="O que falta"
                                  title={r[note] ?? "Descrever o que falta"}
                                  className="flex shrink-0 items-center self-center text-blue-500 transition-colors hover:text-blue-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openNote(r, note, label);
                                  }}
                                >
                                  <InformationCircleIcon className="h-5 w-5" />
                                </button>
                              ) : undefined
                            }
                          />
                        </td>
                      ))}
                      <td className="px-3 py-3 font-semibold tabular-nums">
                        {formatScorePct(computeScore(r, client))}
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          aria-label="Status"
                          selectedKeys={[r.status]}
                          onSelectionChange={(k) =>
                            patchRow(r.id, {
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
              <div className="p-3">
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

function WeightInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      label={label}
      labelPlacement="outside"
      type="number"
      value={value}
      onValueChange={onChange}
      radius="sm"
      variant="bordered"
      className="w-36"
    />
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

