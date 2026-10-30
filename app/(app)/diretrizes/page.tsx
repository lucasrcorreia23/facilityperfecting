"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  Textarea,
  addToast,
} from "@heroui/react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import {
  addGuidelineVersion,
  createGuideline,
  listConnections,
  listGuidelines,
  listGuidelineVersions,
  listProfiles,
  updateGuidelineMeta,
} from "@/app/lib/db";
import type { Connection, GeneratorGuideline, GuidelineScope, GuidelineVersion, Profile } from "@/app/lib/types";

/** Mesmo teto do servidor (`_shared/guidelines.ts`): somando as que valem num processamento. */
const MAX_GUIDELINES_CHARS = 12_000;

const SCOPES: Array<{ key: GuidelineScope; label: string; hint: string }> = [
  { key: "global", label: "Global", hint: "Vale para todo processamento." },
  { key: "mode", label: "Modo", hint: "Só por metodologia ou só por playbook." },
  { key: "connection", label: "Conta", hint: "Só quando a conta de destino é escolhida antes de processar." },
];

const MODES = [
  { key: "methodology", label: "Por metodologia" },
  { key: "playbook", label: "Por playbook" },
];

const connectionLabel = (c: Connection) => `${c.org_name ?? `Org ${c.org_id}`} (${c.environment})`;

interface EditorState {
  /** null = diretriz nova. */
  id: string | null;
  title: string;
  scopeType: GuidelineScope;
  scopeKeys: string[];
  body: string;
  note: string;
  /** Texto da versão vigente, para saber se o salvar cria versão nova. */
  originalBody: string;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: "",
  scopeType: "global",
  scopeKeys: [],
  body: "",
  note: "",
  originalBody: "",
};

export default function DiretrizesPage() {
  const [items, setItems] = useState<GeneratorGuideline[] | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyOf, setHistoryOf] = useState<GeneratorGuideline | null>(null);
  const [versions, setVersions] = useState<GuidelineVersion[] | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await listGuidelines());
    } catch (err) {
      addToast({
        title: "Falha ao carregar as diretrizes",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
    listConnections()
      .then(setConnections)
      .catch(() => {});
    listProfiles()
      .then((people) => setProfiles(new Map(people.map((p) => [p.id, p]))))
      .catch(() => {});
  }, [reload]);

  const connectionsById = useMemo(() => new Map(connections.map((c) => [c.id, c])), [connections]);

  function who(id: string | null) {
    const p = id ? profiles.get(id) : undefined;
    return p?.display_name || p?.email || "—";
  }

  function scopeDetail(g: Pick<GeneratorGuideline, "scope_type" | "scope_keys">) {
    if (g.scope_type === "global") return "Todo processamento";
    if (g.scope_type === "mode") {
      return g.scope_keys.map((k) => MODES.find((m) => m.key === k)?.label ?? k).join(", ");
    }
    return g.scope_keys
      .map((k) => {
        const c = connectionsById.get(k);
        return c ? connectionLabel(c) : "conta removida";
      })
      .join(", ");
  }

  function openNew() {
    setEditor(EMPTY_EDITOR);
  }

  function openEdit(g: GeneratorGuideline) {
    setEditor({
      id: g.id,
      title: g.title,
      scopeType: g.scope_type,
      scopeKeys: g.scope_keys,
      body: g.body,
      note: "",
      originalBody: g.body,
    });
  }

  async function save() {
    if (!editor) return;
    const title = editor.title.trim();
    const body = editor.body.trim();
    if (!title || !body) {
      addToast({ title: "Preencha o título e o texto", color: "warning" });
      return;
    }
    if (editor.scopeType !== "global" && editor.scopeKeys.length === 0) {
      addToast({
        title: editor.scopeType === "mode" ? "Escolha o modo" : "Escolha a conta",
        color: "warning",
      });
      return;
    }
    setSaving(true);
    try {
      if (!editor.id) {
        await createGuideline({
          title,
          scopeType: editor.scopeType,
          scopeKeys: editor.scopeKeys,
          body,
          note: editor.note,
        });
      } else {
        await updateGuidelineMeta(editor.id, {
          title,
          scope_type: editor.scopeType,
          scope_keys: editor.scopeType === "global" ? [] : editor.scopeKeys,
        });
        if (body !== editor.originalBody.trim()) await addGuidelineVersion(editor.id, body, editor.note);
      }
      addToast({ title: "Diretriz salva", color: "success" });
      setEditor(null);
      await reload();
    } catch (err) {
      addToast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(g: GeneratorGuideline, active: boolean) {
    try {
      await updateGuidelineMeta(g.id, { active });
      await reload();
    } catch (err) {
      addToast({
        title: "Erro ao alterar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  async function openHistory(g: GeneratorGuideline) {
    setHistoryOf(g);
    setVersions(null);
    try {
      setVersions(await listGuidelineVersions(g.id));
    } catch (err) {
      addToast({
        title: "Falha ao carregar o histórico",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
      setHistoryOf(null);
    }
  }

  async function restore(v: GuidelineVersion) {
    if (!historyOf) return;
    try {
      await addGuidelineVersion(historyOf.id, v.body, `Restaurada da v${v.version_no}`, v.version_no);
      addToast({ title: `v${v.version_no} restaurada como versão nova`, color: "success" });
      setVersions(await listGuidelineVersions(historyOf.id));
      await reload();
    } catch (err) {
      addToast({
        title: "Erro ao restaurar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    }
  }

  if (!items) return <LoadingView />;

  const editorChars = editor?.body.trim().length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Diretrizes"
        description="O que a equipe acrescenta ao gerador, sem deploy. Entram depois do prompt base, que prevalece em conflito."
        action={
          <Button onPress={openNew} startContent={<PlusIcon className="w-4 h-4" />}>
            Nova diretriz
          </Button>
        }
      />

      {items.length === 0 && (
        <Card className="p-6 text-sm text-slate-500">
          Nenhuma diretriz ainda. Quando o mesmo ajuste aparecer na Calibração de dois ou mais
          roleplays, ele é um bom candidato a diretriz.
        </Card>
      )}

      {SCOPES.map((scope) => {
        const group = items.filter((g) => g.scope_type === scope.key);
        if (group.length === 0) return null;
        return (
          <section key={scope.key} className="flex flex-col gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">{scope.label}</h2>
              <p className="text-xs text-slate-500">{scope.hint}</p>
            </div>
            {group.map((g) => (
              <Card key={g.id} className={`flex flex-col gap-2 p-4 ${g.active ? "" : "opacity-60"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-medium text-slate-800">{g.title}</p>
                    <p className="text-xs text-slate-500">
                      {scopeDetail(g)} · v{g.version_no} ·{" "}
                      {new Date(g.version_created_at).toLocaleString("pt-BR")} · {who(g.version_created_by)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch size="sm" isSelected={g.active} onValueChange={(v) => toggleActive(g, v)}>
                      <span className="text-xs text-slate-600">{g.active ? "Ativa" : "Desligada"}</span>
                    </Switch>
                    <Button variant="secondary" onPress={() => openHistory(g)}>
                      Histórico
                    </Button>
                    <Button variant="secondary" onPress={() => openEdit(g)}>
                      Editar
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{g.body}</p>
              </Card>
            ))}
          </section>
        );
      })}

      <Modal isOpen={editor !== null} onOpenChange={(open) => !open && setEditor(null)} radius="sm" size="3xl">
        <ModalContent>
          <ModalHeader>{editor?.id ? "Editar diretriz" : "Nova diretriz"}</ModalHeader>
          {editor && (
            <ModalBody className="flex flex-col gap-4">
              <Input
                label="Título"
                labelPlacement="outside-top"
                placeholder="Ex.: Proposta comercial na negociação"
                value={editor.title}
                onValueChange={(title) => setEditor({ ...editor, title })}
                radius="sm"
                variant="bordered"
              />
              <Select
                label="Vale para"
                labelPlacement="outside-top"
                selectedKeys={[editor.scopeType]}
                onSelectionChange={(keys) => {
                  const scopeType = String(Array.from(keys)[0] ?? "global") as GuidelineScope;
                  setEditor({ ...editor, scopeType, scopeKeys: scopeType === editor.scopeType ? editor.scopeKeys : [] });
                }}
                radius="sm"
                variant="bordered"
                classNames={managerSelectClassNames}
                description={SCOPES.find((s) => s.key === editor.scopeType)?.hint}
              >
                {SCOPES.map((s) => (
                  <SelectItem key={s.key}>{s.label}</SelectItem>
                ))}
              </Select>
              {editor.scopeType === "mode" && (
                <Select
                  label="Modo"
                  labelPlacement="outside-top"
                  selectedKeys={editor.scopeKeys}
                  onSelectionChange={(keys) => setEditor({ ...editor, scopeKeys: Array.from(keys).map(String) })}
                  radius="sm"
                  variant="bordered"
                  classNames={managerSelectClassNames}
                >
                  {MODES.map((m) => (
                    <SelectItem key={m.key}>{m.label}</SelectItem>
                  ))}
                </Select>
              )}
              {editor.scopeType === "connection" && (
                <Select
                  label="Contas"
                  labelPlacement="outside-top"
                  selectionMode="multiple"
                  placeholder="Escolha uma ou mais"
                  selectedKeys={editor.scopeKeys}
                  onSelectionChange={(keys) => setEditor({ ...editor, scopeKeys: Array.from(keys).map(String) })}
                  radius="sm"
                  variant="bordered"
                  classNames={managerSelectClassNames}
                  description="Marque a conexão de HML e a de PROD do mesmo cliente para valer nos dois."
                >
                  {connections.map((c) => (
                    <SelectItem key={c.id} textValue={connectionLabel(c)}>
                      {connectionLabel(c)}
                    </SelectItem>
                  ))}
                </Select>
              )}
              <Textarea
                label="Texto"
                labelPlacement="outside-top"
                placeholder="Instrução para o gerador, escrita como as do prompt base."
                value={editor.body}
                onValueChange={(body) => setEditor({ ...editor, body })}
                disableAutosize
                radius="sm"
                variant="bordered"
                classNames={{ input: "h-64 overflow-y-auto resize-y" }}
                description={`${editorChars.toLocaleString("pt-BR")} caracteres · somadas, as diretrizes de um processamento cabem em ${MAX_GUIDELINES_CHARS.toLocaleString("pt-BR")}`}
                color={editorChars > MAX_GUIDELINES_CHARS ? "danger" : "default"}
              />
              {editor.id && (
                <Input
                  label="O que mudou (opcional)"
                  labelPlacement="outside-top"
                  placeholder="Ex.: a FIESC pediu objeções de preço só na negociação"
                  value={editor.note}
                  onValueChange={(note) => setEditor({ ...editor, note })}
                  radius="sm"
                  variant="bordered"
                  description="Mudar o texto cria uma versão nova; a anterior fica no histórico."
                />
              )}
            </ModalBody>
          )}
          <ModalFooter>
            <Button variant="secondary" onPress={() => setEditor(null)}>
              Cancelar
            </Button>
            <Button onPress={save} isLoading={saving}>
              Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={historyOf !== null} onOpenChange={(open) => !open && setHistoryOf(null)} radius="sm" size="3xl">
        <ModalContent>
          <ModalHeader>Histórico · {historyOf?.title}</ModalHeader>
          <ModalBody>
            {!versions ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : (
              <ul className="flex flex-col gap-3 pb-2">
                {versions.map((v, i) => (
                  <li key={v.id} className="flex flex-col gap-2 rounded-sm border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-medium text-slate-700">v{v.version_no}</span>
                      {i === 0 && (
                        <span className="rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          vigente
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(v.created_at).toLocaleString("pt-BR")} · {who(v.created_by)}
                      </span>
                      {i > 0 && (
                        <Button variant="link" className="ml-auto" onPress={() => restore(v)}>
                          Restaurar esta versão
                        </Button>
                      )}
                    </div>
                    {v.note && <p className="text-xs text-slate-500">{v.note}</p>}
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-sm bg-slate-50 p-2 text-xs text-slate-700">
                      {v.body}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
