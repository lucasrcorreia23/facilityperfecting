"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, addToast } from "@heroui/react";
import { ArrowUpTrayIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { createPlaybookDraft, invokeGeneratePlaybook, uploadAndExtract } from "@/app/lib/db";
import type { TrailInputFile } from "@/app/lib/types";

export default function NovoPlaybookPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<TrailInputFile[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const isSupported = (f: File) =>
    /\.(pdf|docx|md|markdown|txt)$/i.test(f.name) ||
    f.type.includes("pdf") ||
    f.type.includes("word") ||
    f.type.includes("officedocument") ||
    f.type.includes("markdown") ||
    f.type.includes("text");

  /** Extrai o texto dos arquivos e concatena tudo — o material é um só. */
  async function ingestFiles(selected: File[]) {
    const supported = selected.filter(isSupported);
    if (supported.length === 0) {
      addToast({
        title: "Formato não suportado",
        description: "Envie PDF, DOCX, Markdown ou TXT.",
        color: "warning",
      });
      return;
    }
    setExtracting(true);
    try {
      for (const file of supported) {
        const { text: extracted, filePath, suggestedOfferName } = await uploadAndExtract(file);
        setFiles((prev) => [
          ...prev,
          { name: file.name, path: filePath, chars: extracted.length },
        ]);
        setText((prev) =>
          prev.trim() ? `${prev.trim()}\n\n--- ${file.name} ---\n${extracted}` : extracted,
        );
        setName((prev) => prev || suggestedOfferName);
      }
      addToast({ title: `${supported.length} arquivo(s) extraído(s)`, color: "success" });
    } catch (err) {
      addToast({
        title: "Falha ao extrair",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setExtracting(false);
    }
  }

  async function submit() {
    if (!name.trim()) {
      addToast({ title: "Dê um nome ao playbook", color: "warning" });
      return;
    }
    if (!text.trim()) {
      addToast({ title: "Cole ou suba o material do playbook", color: "warning" });
      return;
    }
    setSubmitting(true);
    try {
      const { playbookId } = await createPlaybookDraft({
        name: name.trim(),
        inputText: text.trim(),
        inputFiles: files,
      });
      // A estruturação roda em background; a tela de detalhe acompanha o status.
      await invokeGeneratePlaybook(playbookId).catch((err) => {
        addToast({
          title: "Playbook criado, mas a estruturação não iniciou",
          description: err instanceof Error ? err.message : String(err),
          color: "warning",
        });
      });
      router.push(`/playbooks/${playbookId}`);
    } catch (err) {
      addToast({
        title: "Falha ao criar o playbook",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        backHref="/playbooks"
        title="Novo playbook"
        description="Suba o playbook do cliente e a IA estrutura a jornada em etapas e subetapas para você revisar."
      />

      <Card className="flex flex-col gap-6 p-5">
        <Input
          label="Nome do playbook"
          labelPlacement="outside"
          placeholder="Ex.: Jornada Comercial B2B — Cliente X"
          value={name}
          onValueChange={setName}
          radius="sm"
          variant="bordered"
          isRequired
        />

        <div className="flex flex-col gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files ? Array.from(e.target.files) : [];
              if (selected.length) void ingestFiles(selected);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!extracting) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
              if (dropped.length) void ingestFiles(dropped);
            }}
            disabled={extracting}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-sm border border-dashed px-4 py-8 text-sm transition-colors disabled:opacity-60 ${
              dragging
                ? "border-blue-400 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <ArrowUpTrayIcon
              className={`w-6 h-6 ${dragging ? "text-blue-500" : "text-slate-400"}`}
            />
            {extracting
              ? "Extraindo texto…"
              : dragging
                ? "Solte os arquivos aqui"
                : "Arraste o playbook aqui (PDF/DOCX/MD/TXT), ou clique para selecionar"}
          </button>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                >
                  {f.name}
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remover ${f.name}`}
                    className="text-slate-400 transition-colors hover:text-red-600"
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Textarea
          label="Material do playbook"
          labelPlacement="outside"
          placeholder="Cole aqui o playbook do cliente: etapas da jornada, perguntas de cada momento, boas práticas, erros comuns…"
          disableAutosize
          value={text}
          onValueChange={setText}
          radius="sm"
          variant="bordered"
          classNames={{ input: "h-72 overflow-y-auto resize-y" }}
          description="Quanto mais fiel o material, menos a IA precisa inventar estrutura."
        />

        <div className="flex justify-end">
          <Button
            onPress={submit}
            isLoading={submitting}
            isDisabled={extracting}
            startContent={<SparklesIcon className="w-4 h-4" />}
          >
            Estruturar com IA
          </Button>
        </div>
      </Card>
    </div>
  );
}
