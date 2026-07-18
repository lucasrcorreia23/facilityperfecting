"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea,
  addToast,
} from "@heroui/react";
import { ArrowPathIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { BackButton } from "@/app/components/ui/back-button";
import { invokeIngestUrl, listMethodologySources, updateMethodologySource } from "@/app/lib/db";
import type { MethodologySource } from "@/app/lib/types";

function statusBadge(source: MethodologySource) {
  if (source.status === "fetched") {
    return (
      <span className="inline-flex rounded-sm bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        Coletada
      </span>
    );
  }
  if (source.status === "error") {
    return (
      <span className="inline-flex rounded-sm bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Erro
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-sm bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      Pendente
    </span>
  );
}

export default function BaseMetodologiaPage() {
  const [sources, setSources] = useState<MethodologySource[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [fetchingAll, setFetchingAll] = useState(false);
  const [editing, setEditing] = useState<MethodologySource | null>(null);
  const [contentDraft, setContentDraft] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  const refresh = useCallback(async () => {
    setSources(await listMethodologySources());
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  async function fetchOne(source: MethodologySource) {
    setFetchingIds((prev) => new Set(prev).add(source.id));
    try {
      await invokeIngestUrl({ sourceId: source.id });
      addToast({ title: `"${source.title}" coletada`, color: "success" });
    } catch (err) {
      addToast({
        title: `Falha ao coletar "${source.title}"`,
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
      await refresh();
    }
  }

  async function fetchAll() {
    setFetchingAll(true);
    for (const source of sources) {
      await fetchOne(source);
    }
    setFetchingAll(false);
  }

  async function toggleEnabled(source: MethodologySource, enabled: boolean) {
    try {
      await updateMethodologySource(source.id, { enabled });
      setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, enabled } : s)));
    } catch (err) {
      addToast({
        title: "Falha ao atualizar a fonte",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  function openEditor(source: MethodologySource) {
    setEditing(source);
    setContentDraft(source.content ?? "");
  }

  async function saveContent() {
    if (!editing) return;
    setSavingContent(true);
    try {
      // Conteúdo colado manualmente conta como fonte coletada.
      await updateMethodologySource(editing.id, {
        content: contentDraft,
        ...(contentDraft.trim()
          ? { status: "fetched" as const, fetched_at: new Date().toISOString() }
          : {}),
      });
      addToast({ title: "Conteúdo salvo", color: "success" });
      setEditing(null);
      await refresh();
    } catch (err) {
      addToast({
        title: "Falha ao salvar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSavingContent(false);
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="mb-4">
        <BackButton href="/trilhas" />
      </div>
      <PageHeader
        title="Base de metodologia"
        description="Conteúdo dos artigos de sales enablement usado como referência na geração dos planos de trilhas."
        action={
          <Button
            onPress={fetchAll}
            isLoading={fetchingAll}
            startContent={<ArrowPathIcon className="w-4 h-4" />}
          >
            Re-coletar todas
          </Button>
        }
      />

      {loading ? (
        <LoadingView label="Carregando fontes…" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-2.5 text-left">Fonte</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Coletada em</th>
                <th className="px-4 py-2.5 text-left">Usar</th>
                <th className="px-4 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-b border-slate-100 text-sm font-medium text-slate-800 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span>{source.title}</span>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="max-w-md truncate text-xs font-normal text-slate-400 hover:text-slate-600"
                      >
                        {source.url}
                      </a>
                      {source.status === "error" && source.error_detail && (
                        <span className="text-xs font-normal text-red-600">{source.error_detail}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(source)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {source.fetched_at ? new Date(source.fetched_at).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      size="sm"
                      isSelected={source.enabled}
                      onValueChange={(v) => void toggleEnabled(source, v)}
                      aria-label={`Usar ${source.title} na geração`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void fetchOne(source)}
                        disabled={fetchingIds.has(source.id)}
                        title="Re-coletar da URL"
                        className="rounded-sm p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                      >
                        <ArrowPathIcon
                          className={`w-4 h-4 ${fetchingIds.has(source.id) ? "animate-spin" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(source)}
                        title="Ver/editar conteúdo"
                        className="rounded-sm p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal isOpen={!!editing} onOpenChange={(open) => !open && setEditing(null)} radius="sm" size="3xl">
        <ModalContent>
          <ModalHeader>{editing?.title}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Este é o texto usado na geração. Se o site bloquear a coleta automática, cole o conteúdo
              do artigo aqui manualmente.
            </p>
            <Textarea
              value={contentDraft}
              onValueChange={setContentDraft}
              disableAutosize
              radius="sm"
              variant="bordered"
              classNames={{ input: "h-96 overflow-y-auto resize-y text-xs" }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onPress={saveContent} isLoading={savingContent}>
              Salvar conteúdo
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
