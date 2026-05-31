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
  Textarea,
  addToast,
} from "@heroui/react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
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
  invokeExport,
  listConnections,
  listDrafts,
  setDraftConnection,
} from "@/app/lib/db";
import type { Connection, DraftRow } from "@/app/lib/types";

const PERFECTING_HML = "https://app-hml.perfecting.app";

export default function BibliotecaPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // modal de escolha de conta antes do envio
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerConn, setPickerConn] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  // modal de "ver texto"
  const [viewText, setViewText] = useState<string | null>(null);

  // modal de confirmação (envio)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

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
      setPickerOpen(true);
    } else {
      const sendIds = ids;
      setConfirm({
        title: `Enviar ${sendIds.length} roleplay(s) para a Perfecting?`,
        message: (
          <>
            Isso vai <b>criar o(s) roleplay(s) na conta de destino, em produção</b> — conteúdo real
            na conta do cliente. Confira a conta antes de continuar.
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
    setPickerOpen(false);
    // preenche a conta nos drafts sem destino
    for (const id of pendingIds) {
      const d = drafts.find((x) => x.id === id);
      if (!d?.connection_id) await setDraftConnection(id, pickerConn);
    }
    await runExport(pendingIds);
  }

  async function runExport(ids: string[]) {
    setSending(true);
    try {
      await invokeExport(ids);
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

  const selectedArr = useMemo(() => Array.from(selected), [selected]);

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
                    {d.status === "exported" && d.perfecting_case_setup_id ? (
                      <a
                        href={`${PERFECTING_HML}/roleplays/${d.perfecting_case_setup_id}/details`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex"
                        title="Abrir na Perfecting"
                      >
                        <StatusBadge status={d.status} />
                      </a>
                    ) : (
                      <span title={d.status === "error" ? JSON.stringify(d.error_detail) : undefined}>
                        <StatusBadge status={d.status} />
                      </span>
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

      {/* Modal: escolher conta de destino */}
      <Modal isOpen={pickerOpen} onOpenChange={setPickerOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Conta de destino</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Escolha a org da Perfecting onde os roleplays serão criados. O envio cria{" "}
              <b>conteúdo real na conta do cliente, em produção</b>.
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

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
