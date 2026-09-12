"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
  addToast,
} from "@heroui/react";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { BackButton } from "@/app/components/ui/back-button";
import {
  createTrailPlan,
  invokeGenerateTrailPlan,
  invokeIngestUrl,
  uploadAndExtract,
} from "@/app/lib/db";
import {
  DEFAULT_TRAIL_ANALYSIS_PROMPT,
  DEFAULT_TRAIL_PLAN_PROMPT,
  loadTrailPromptOverride,
  saveTrailPromptOverride,
} from "@/app/lib/trail-prompt";
import type { TrailInputFile } from "@/app/lib/types";

const ACCEPT =
  ".pdf,.docx,.md,.markdown,.txt,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,text/markdown";

function isSupported(file: File): boolean {
  return /\.(pdf|docx|md|markdown|txt|xlsx|xls|csv)$/i.test(file.name);
}

export default function NovoPlanoPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [clientName, setClientName] = useState("");
  const [methodology, setMethodology] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [sellerCount, setSellerCount] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [analysisDraft, setAnalysisDraft] = useState(DEFAULT_TRAIL_ANALYSIS_PROMPT);
  const [planDraft, setPlanDraft] = useState(DEFAULT_TRAIL_PLAN_PROMPT);

  // hash SHA-256 por arquivo adicionado — detecta cópias (ex.: "x.txt" e "x (1).txt")
  const fileHashes = useRef(new Map<File, string>());

  async function sha256(file: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const unsupported = incoming.filter((f) => !isSupported(f));
    if (unsupported.length > 0) {
      addToast({
        title: `Formato não suportado: ${unsupported.map((f) => f.name).join(", ")}`,
        description: "Envie PDF, DOCX, TXT, MD, XLSX ou CSV.",
        color: "warning",
      });
    }
    const accepted: File[] = [];
    const duplicated: string[] = [];
    for (const file of incoming.filter(isSupported)) {
      const hash = await sha256(file);
      const isDup = [...fileHashes.current.values()].includes(hash);
      if (isDup) {
        duplicated.push(file.name);
        continue;
      }
      fileHashes.current.set(file, hash);
      accepted.push(file);
    }
    if (duplicated.length > 0) {
      addToast({
        title: `Duplicado ignorado: ${duplicated.join(", ")}`,
        description:
          "O conteúdo é idêntico ao de um arquivo já adicionado — enviar duas vezes duplicaria o custo da análise.",
        color: "warning",
      });
    }
    setFiles((prev) => [...prev, ...accepted]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function openPromptEditor() {
    const override = loadTrailPromptOverride();
    setAnalysisDraft(override.analysis ?? DEFAULT_TRAIL_ANALYSIS_PROMPT);
    setPlanDraft(override.plan ?? DEFAULT_TRAIL_PLAN_PROMPT);
    setPromptModalOpen(true);
  }

  function savePrompt() {
    saveTrailPromptOverride({ analysis: analysisDraft, plan: planDraft });
    setPromptModalOpen(false);
    addToast({ title: "Prompt salvo neste navegador", color: "success" });
  }

  async function submit() {
    const name = clientName.trim();
    if (!name) {
      addToast({ title: "Informe o nome do cliente", color: "warning" });
      return;
    }
    if (files.length === 0 && !websiteUrl.trim()) {
      addToast({ title: "Envie ao menos um arquivo ou informe a URL do website", color: "warning" });
      return;
    }

    setSubmitting(true);
    try {
      const sections: string[] = [];
      const inputFiles: TrailInputFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Extraindo arquivo ${i + 1}/${files.length}: ${file.name}…`);
        const { text, filePath } = await uploadAndExtract(file);
        sections.push(`--- ${file.name} ---\n${text}`);
        inputFiles.push({ name: file.name, path: filePath, chars: text.length });
      }

      const site = websiteUrl.trim();
      if (site) {
        setProgress("Coletando o conteúdo do website…");
        try {
          const { text } = await invokeIngestUrl({ url: site });
          sections.push(`--- Website: ${site} ---\n${text}`);
          inputFiles.push({ name: `Website: ${site}`, path: null, chars: text.length });
        } catch (err) {
          addToast({
            title: "Não foi possível coletar o website — seguindo sem ele",
            description: err instanceof Error ? err.message : String(err),
            color: "warning",
          });
        }
      }

      if (sections.length === 0) throw new Error("Nenhum material pôde ser lido.");

      const override = loadTrailPromptOverride();
      const promptOverride =
        override.analysis || override.plan ? JSON.stringify(override) : null;

      setProgress("Criando o plano…");
      const parsedCount = parseInt(sellerCount, 10);
      const { planId } = await createTrailPlan({
        clientName: name,
        salesMethodology: methodology.trim() || null,
        additionalContext: additionalContext.trim() || null,
        sellerCount: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : null,
        websiteUrl: site || null,
        inputFiles,
        inputText: sections.join("\n\n"),
        promptOverride,
      });

      setProgress("Iniciando a análise…");
      await invokeGenerateTrailPlan(planId, "analysis");
      router.push(`/trilhas/${planId}`);
    } catch (err) {
      addToast({
        title: "Falha ao criar o plano",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="mb-4">
        <BackButton href="/trilhas" />
      </div>
      <PageHeader
        title="Novo plano de trilhas"
        description="Envie os materiais do cliente de uma só vez — a IA executa o intake, a análise Data-to-Skill e propõe as trilhas."
      />

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-sm font-semibold text-slate-800">Dados do cliente</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nome do cliente"
              labelPlacement="outside"
              placeholder="Ex.: SURI"
              isRequired
              value={clientName}
              onValueChange={setClientName}
              radius="sm"
              variant="bordered"
            />
            <Input
              label="Metodologia de vendas do cliente"
              labelPlacement="outside"
              placeholder="Ex.: SPICED"
              value={methodology}
              onValueChange={setMethodology}
              radius="sm"
              variant="bordered"
            />
            <Input
              label="Nº de vendedores (opcional)"
              labelPlacement="outside"
              placeholder="Detectado dos documentos se vazio"
              type="number"
              value={sellerCount}
              onValueChange={setSellerCount}
              radius="sm"
              variant="bordered"
            />
            <Input
              label="Website do cliente (opcional)"
              labelPlacement="outside"
              placeholder="https://…"
              value={websiteUrl}
              onValueChange={setWebsiteUrl}
              radius="sm"
              variant="bordered"
            />
          </div>
          <Textarea
            label="Contexto adicional (opcional)"
            labelPlacement="outside"
            placeholder="Orientações do time Perfecting para esta análise — ex.: foco em SDRs, próxima reunião de aprovação em duas semanas…"
            value={additionalContext}
            onValueChange={setAdditionalContext}
            radius="sm"
            variant="bordered"
            minRows={2}
          />
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Materiais do cliente</h2>
            <button
              type="button"
              onClick={openPromptEditor}
              title="Editar prompts de geração"
              className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <PencilSquareIcon className="w-3.5 h-3.5" /> Editar prompts
            </button>
          </div>
          <p className="text-sm text-slate-500">
            Scorecards de CLOSER/SDR, transcrições de calls, formulário de calibração de roleplay,
            oferta/pricing — PDF, DOCX, TXT, MD, XLSX e CSV. Em materiais muito grandes, o excedente é
            truncado do fim: envie scorecards e formulário primeiro e as transcrições por último.
          </p>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!submitting) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!submitting) addFiles(e.dataTransfer.files);
            }}
            disabled={submitting}
            className={`flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed px-6 py-10 text-center transition-colors disabled:opacity-60 ${
              dragging
                ? "border-blue-400 bg-blue-50"
                : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <ArrowUpTrayIcon
              className={`w-6 h-6 ${dragging ? "text-blue-500" : "text-slate-400"}`}
            />
            <span
              className={`text-sm font-medium ${dragging ? "text-blue-700" : "text-slate-600"}`}
            >
              {dragging
                ? "Solte os arquivos aqui"
                : "Arraste os arquivos aqui (vários de uma vez), ou clique para selecionar"}
            </span>
          </button>

          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {files.map((file, idx) => (
                <li
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-2 rounded-sm border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  <DocumentTextIcon className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 truncate">{file.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-400">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      fileHashes.current.delete(file);
                      setFiles((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    aria-label={`Remover ${file.name}`}
                    className="shrink-0 rounded-sm p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex items-center justify-end gap-3">
          {progress && <p className="text-sm text-slate-500">{progress}</p>}
          <Button onPress={submit} isLoading={submitting}>
            Criar plano e analisar
          </Button>
        </div>
      </div>

      <Modal isOpen={promptModalOpen} onOpenChange={setPromptModalOpen} radius="sm" size="3xl">
        <ModalContent>
          <ModalHeader>Editar prompts de geração</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              O app adiciona automaticamente a base de metodologia, os dados do cliente, a lista de
              tipos de chamada e o formato de saída — você não precisa incluí-los aqui. As variáveis{" "}
              <code className="rounded bg-slate-100 px-1">{"{{cliente}}"}</code>,{" "}
              <code className="rounded bg-slate-100 px-1">{"{{metodologia_vendas}}"}</code>,{" "}
              <code className="rounded bg-slate-100 px-1">{"{{contexto_adicional}}"}</code> e{" "}
              <code className="rounded bg-slate-100 px-1">{"{{numero_vendedores}}"}</code> são
              preenchidas com o formulário.
            </p>
            <Textarea
              label="Etapa 1 — Análise Data-to-Skill"
              labelPlacement="outside"
              value={analysisDraft}
              onValueChange={setAnalysisDraft}
              disableAutosize
              radius="sm"
              variant="bordered"
              classNames={{ input: "h-48 overflow-y-auto resize-y font-mono text-xs" }}
            />
            <Textarea
              label="Etapa 2 — Plano de trilhas"
              labelPlacement="outside"
              value={planDraft}
              onValueChange={setPlanDraft}
              disableAutosize
              radius="sm"
              variant="bordered"
              classNames={{ input: "h-48 overflow-y-auto resize-y font-mono text-xs" }}
            />
          </ModalBody>
          <ModalFooter className="justify-between">
            <button
              type="button"
              onClick={() => {
                setAnalysisDraft(DEFAULT_TRAIL_ANALYSIS_PROMPT);
                setPlanDraft(DEFAULT_TRAIL_PLAN_PROMPT);
              }}
              className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              <ArrowPathIcon className="w-4 h-4" /> Restaurar padrão
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={() => setPromptModalOpen(false)}>
                Cancelar
              </Button>
              <Button onPress={savePrompt}>Salvar prompts</Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
