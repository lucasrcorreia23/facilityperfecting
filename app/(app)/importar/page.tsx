"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Tabs,
  Tab,
  Textarea,
  Input,
  Select,
  SelectItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
} from "@heroui/react";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import {
  createDraftFromText,
  listCallContexts,
  listConnections,
  processImport,
  uploadAndExtract,
} from "@/app/lib/db";
import type { CallContextType, Connection, ImportGap } from "@/app/lib/types";

const GAP_STYLES: Record<ImportGap["severidade"], { label: string; cls: string }> = {
  critico: { label: "Crítico", cls: "bg-red-50 text-red-700" },
  importante: { label: "Importante", cls: "bg-amber-50 text-amber-700" },
  opcional: { label: "Opcional", cls: "bg-slate-100 text-slate-600" },
};

const DIFFICULTIES = [
  { key: "easy", label: "Fácil" },
  { key: "medium", label: "Médio" },
  { key: "hard", label: "Difícil" },
];

const PROMPT_STORAGE_KEY = "import_prompt";

/** Prompt padrão de processamento (instruções de extração). O app adiciona, depois,
 *  a lista de call_contexts disponíveis e o formato JSON automaticamente. */
const DEFAULT_IMPORT_PROMPT = `Você é um especialista em criação de Roleplays Comerciais para a plataforma Perfecting.

Sua tarefa: a partir de QUALQUER material fornecido (sites, PDFs, propostas, transcrições, playbooks, anotações), EXTRAIR e ORGANIZAR as informações para preencher um roleplay na Perfecting. Você NÃO conversa e NÃO pergunta — você sempre devolve o resultado estruturado.

ETAPA 1 — EXTRAÇÃO. Extraia tudo que conseguir sobre:
- Oferta: nome, produto/serviço, proposta de valor, problema principal resolvido, diferenciais competitivos, ticket médio, ciclo de vendas, concorrentes, casos de uso, ROI, público-alvo.
- Buyer Persona: cargo, área, responsabilidades, KPIs, metas, medos, motivações, critérios de decisão, influenciadores, nível de autoridade, estilo de comunicação, perfil comportamental (DISC quando possível).
- Cenário: tipo de conversa (cold call, discovery, demo, proposta, negociação, renovação, expansão), como o lead chegou, nível de consciência, momento da jornada, urgência, situação atual.
- Objeções: preço, timing, prioridade, concorrente, autoridade, implementação, integração, segurança, ROI, troca de fornecedor, falta de necessidade. Use frases reais quando houver.

ETAPA 2 — ORGANIZAÇÃO. Separe o conteúdo em blocos distintos, prontos para alimentar a Perfecting:
- perfil (Grupo 2 – Buyer Persona): cargo, empresa, estrutura, prioridades, consciência do problema/soluções, comportamento (DISC) e as objeções esperadas — com o MÁXIMO de detalhe e frases reais do material. Usado como instrução de contexto para gerar a persona.
- cenário (Grupo 3): tipo de chamada, dificuldade e as instruções de COMPORTAMENTO da persona durante a conversa — como reage, testes de fogo/objeções que aplica, critério de fechamento. Se o material já trouxer instruções ou prompts de comportamento prontos, PRESERVE-OS na íntegra (transcreva, não resuma).
- rubricas (Grupo 4): objetivo de treino e habilidades de venda a treinar.

ETAPA 3 — LACUNAS. Liste tudo que ainda falta para um roleplay de alta qualidade, classificando cada item como "critico", "importante" ou "opcional".

REGRAS:
- SEJA COMPLETO E FIEL ao material. Preserve o detalhe que o cliente preparou; transcreva instruções, exemplos e prompts existentes em vez de resumir. NÃO comprima conteúdo intencional — é melhor um bloco longo e fiel do que um resumo curto.
- Priorize dados reais extraídos do material. Quando precisar inferir, marque o trecho com "(Hipótese Assumida)".
- Escolha o call_context mais adequado entre os disponíveis e a dificuldade (easy/medium/hard) coerente com o cenário.
- Linguagem comercial B2B. Responda SEMPRE no formato estruturado pedido (JSON).`;

export default function ImportarPage() {
  const router = useRouter();
  const [tab, setTab] = useState("texto");
  const [text, setText] = useState("");
  const [offerName, setOfferName] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [callContexts, setCallContexts] = useState<CallContextType[]>([]);
  const [callContextSlug, setCallContextSlug] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [perfil, setPerfil] = useState("");
  const [cenarioInstrucoes, setCenarioInstrucoes] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [habilidades, setHabilidades] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [gaps, setGaps] = useState<ImportGap[]>([]);
  const [aiProcessed, setAiProcessed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [extractMsg, setExtractMsg] = useState("Extraindo texto…");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROMPT_STORAGE_KEY);
      if (saved) setCustomPrompt(saved);
    } catch {
      // localStorage indisponível — usa o prompt padrão
    }
    listConnections().then(setConnections).catch(() => {});
    listCallContexts()
      .then(setCallContexts)
      .catch(() =>
        addToast({
          title: "Não foi possível carregar os tipos de chamada",
          description: "Verifique a conexão com a Perfecting (Conexões).",
          color: "warning",
        }),
      );
  }, []);

  const isSupported = (f: File) =>
    /\.(pdf|docx)$/i.test(f.name) ||
    f.type.includes("pdf") ||
    f.type.includes("word") ||
    f.type.includes("officedocument");

  /** Extrai o texto de 1+ arquivos e junta tudo (vários arquivos = um material). */
  async function ingestFiles(files: File[]) {
    const supported = files.filter(isSupported);
    const rejected = files.length - supported.length;
    if (supported.length === 0) {
      addToast({ title: "Formato não suportado", description: "Envie PDF ou DOCX.", color: "warning" });
      return;
    }
    setExtracting(true);
    const names: string[] = [];
    let lastPath: string | null = null;
    let combined = "";
    try {
      for (let i = 0; i < supported.length; i++) {
        const f = supported[i];
        setExtractMsg(
          supported.length > 1 ? `Extraindo ${i + 1}/${supported.length}…` : "Extraindo texto…",
        );
        const { text: extracted, suggestedOfferName, filePath: path } = await uploadAndExtract(f);
        names.push(f.name);
        lastPath = path;
        combined +=
          (combined ? "\n\n" : "") +
          (supported.length > 1 ? `--- ${f.name} ---\n${extracted}` : extracted);
        if (!offerName && i === 0) setOfferName(suggestedOfferName);
      }
      setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${combined}` : combined));
      setFileNames((prev) => [...prev, ...names]);
      setFileName(names.length === 1 ? names[0] : `${names.length} arquivos`);
      setFilePath(supported.length === 1 ? lastPath : null);
      addToast({
        title: supported.length > 1 ? `${supported.length} arquivos extraídos` : "Texto extraído",
        description: rejected ? `${rejected} arquivo(s) ignorado(s) (formato não suportado).` : undefined,
        color: "success",
      });
    } catch (err) {
      addToast({
        title: "Falha ao extrair",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setExtracting(false);
      setExtractMsg("Extraindo texto…");
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) void ingestFiles(files);
    e.target.value = ""; // permite re-selecionar os mesmos arquivos
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) void ingestFiles(files);
  }

  function clearFiles() {
    setFileNames([]);
    setFileName(null);
    setFilePath(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Limpa o formulário inteiro para começar um novo roleplay do zero. */
  function clearAll() {
    setText("");
    setOfferName("");
    setConnectionId("");
    setCallContextSlug("");
    setDifficulty("medium");
    setPerfil("");
    setCenarioInstrucoes("");
    setObjetivo("");
    setHabilidades("");
    setGaps([]);
    setAiProcessed(false);
    clearFiles();
  }

  /**
   * mode "reset": sobrescreve todos os blocos com a saída da IA (reprocessa do zero).
   * mode "merge": preenche apenas os campos que estão VAZIOS (preserva suas edições)
   *               e sempre recalcula as lacunas.
   */
  async function handleProcess(mode: "merge" | "reset" = "reset") {
    if (!text.trim()) {
      addToast({ title: "Cole ou extraia um texto primeiro", color: "warning" });
      return;
    }
    const keep = mode === "merge";
    setProcessing(true);
    try {
      const r = await processImport(text.trim(), customPrompt || null);
      const fill = (cur: string, next: string) => (keep && cur.trim() ? cur : next || cur);
      // O material cru em "Dados para o Roleplay" é preservado (vira a descrição da
      // oferta no envio). A IA preenche só os blocos derivados + lacunas.
      setPerfil((c) => fill(c, r.perfil || ""));
      setCenarioInstrucoes((c) => fill(c, r.cenario_instrucoes || ""));
      setObjetivo((c) => fill(c, r.objetivo || ""));
      setHabilidades((c) => fill(c, r.habilidades || ""));
      setOfferName((c) => fill(c, r.oferta_nome || ""));
      setCallContextSlug((c) => (keep && c ? c : r.call_context_slug || c));
      if (!keep && r.dificuldade) setDifficulty(r.dificuldade);
      setGaps(r.lacunas ?? []);
      const wasProcessed = aiProcessed;
      setAiProcessed(true);
      const criticos = (r.lacunas ?? []).filter((g) => g.severidade === "critico").length;
      addToast({
        title: !wasProcessed
          ? "Processado pela IA"
          : mode === "reset"
            ? "Reprocessado do zero"
            : "Reprocessado (campos vazios preenchidos)",
        description: criticos
          ? `${criticos} lacuna(s) crítica(s) — revise abaixo.`
          : "Blocos preenchidos.",
        color: criticos ? "warning" : "success",
      });
    } catch (err) {
      addToast({
        title: "Falha ao processar com IA",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setProcessing(false);
    }
  }

  function openPromptEditor() {
    setPromptDraft(customPrompt || DEFAULT_IMPORT_PROMPT);
    setPromptModalOpen(true);
  }

  function savePrompt() {
    const v = promptDraft.trim();
    const isCustom = v.length > 0 && v !== DEFAULT_IMPORT_PROMPT;
    setCustomPrompt(isCustom ? v : "");
    try {
      if (isCustom) localStorage.setItem(PROMPT_STORAGE_KEY, v);
      else localStorage.removeItem(PROMPT_STORAGE_KEY);
    } catch {
      // ignore
    }
    setPromptModalOpen(false);
    addToast({
      title: isCustom ? "Prompt personalizado salvo" : "Prompt padrão restaurado",
      color: "success",
    });
  }

  async function handleSave() {
    if (!text.trim() || !offerName.trim()) {
      addToast({ title: "Preencha o texto e o nome da oferta", color: "warning" });
      return;
    }
    if (!callContextSlug) {
      addToast({ title: "Escolha o tipo de chamada", color: "warning" });
      return;
    }
    setSaving(true);
    try {
      await createDraftFromText({
        text: text.trim(),
        offerName: offerName.trim(),
        sourceType: tab === "arquivo" ? "file" : "paste",
        filePath: tab === "arquivo" ? filePath : null,
        meta: fileNames.length ? { filenames: fileNames } : {},
        connectionId: connectionId || null,
        contextNotes: perfil.trim() || null,
        scenario: {
          call_context_slug: callContextSlug,
          difficulty,
          objective: objetivo.trim() || null,
          skill: habilidades.trim() || null,
          aditional_instructions: cenarioInstrucoes.trim() || null,
        },
      });
      addToast({ title: "Rascunho salvo", color: "success" });
      router.push("/biblioteca");
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

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Importar roleplay"
        description="Cole um texto ou suba um arquivo. A IA da Perfecting gera o resto no export."
      />

      <Card className="flex flex-col gap-8 p-5">
        <Tabs
          selectedKey={tab}
          onSelectionChange={(k) => setTab(String(k))}
          radius="sm"
          variant="bordered"
          classNames={{ tabList: "rounded-sm", tab: "rounded-sm" }}
        >
          <Tab
            key="texto"
            title={
              <span className="flex items-center gap-2">
                <DocumentTextIcon className="w-4 h-4" /> Texto
              </span>
            }
          />
          <Tab
            key="arquivo"
            title={
              <span className="flex items-center gap-2">
                <ArrowUpTrayIcon className="w-4 h-4" /> Arquivo
              </span>
            }
          />
        </Tabs>

        {tab === "arquivo" && (
          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!extracting) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
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
                ? extractMsg
                : dragging
                  ? "Solte os arquivos aqui"
                  : fileNames.length
                    ? `${fileNames.length} arquivo(s): ${fileNames.join(", ")}`
                    : "Arraste PDFs/DOCX aqui (vários de uma vez), ou clique para selecionar"}
            </button>
            {fileNames.length > 0 && !extracting && (
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: "Remover arquivos importados?",
                    message: (
                      <>
                        Os {fileNames.length} arquivo(s) importado(s) serão removidos da seleção. O
                        texto já extraído permanece na caixa “Dados para o Roleplay” — use “Limpar”
                        para apagar tudo.
                      </>
                    ),
                    confirmLabel: "Remover",
                    onConfirm: clearFiles,
                  })
                }
                className="inline-flex items-center gap-1 self-start text-xs font-medium text-slate-500 transition-colors hover:text-red-600"
              >
                <XMarkIcon className="w-3.5 h-3.5" /> Remover arquivo(s)
              </button>
            )}
          </div>
        )}

        <Textarea
          label="Dados para o Roleplay"
          labelPlacement="outside"
          placeholder="Cole aqui a descrição da oferta / material do cliente…"
          disableAutosize
          value={text}
          onValueChange={setText}
          radius="sm"
          variant="bordered"
          classNames={{ input: "h-72 overflow-y-auto resize-y" }}
        />

        <div className="flex flex-col items-end gap-2 -mt-1 sm:flex-row sm:items-center sm:justify-end">
          <p className="flex items-start gap-1.5 text-xs text-slate-500 sm:mr-auto">
            <span>
              A IA estrutura o material nos 4 grupos da Perfecting e sugere oferta, tipo de chamada e
              dificuldade.
            </span>
            <button
              type="button"
              onClick={openPromptEditor}
              title="Editar o prompt de processamento"
              aria-label="Editar o prompt de processamento"
              className="shrink-0 rounded-sm p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <PencilSquareIcon className="w-4 h-4" />
            </button>
            {customPrompt && (
              <span className="shrink-0 rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                prompt personalizado
              </span>
            )}
          </p>
          {aiProcessed && (
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: "Resetar e reprocessar do zero?",
                  message: (
                    <>
                      Isso vai <b>sobrescrever todos os blocos</b> (oferta, perfil, cenário) com uma
                      nova extração da IA. <b>Suas edições manuais serão perdidas.</b> Consome
                      créditos da Anthropic.
                    </>
                  ),
                  confirmLabel: "Resetar e reprocessar",
                  onConfirm: () => handleProcess("reset"),
                })
              }
              disabled={processing || extracting || !text.trim()}
              title="Reprocessar do zero (sobrescreve todas as suas edições)"
              className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              <ArrowPathIcon className="w-4 h-4" /> Resetar
            </button>
          )}
          <Button
            variant="secondary"
            onPress={() =>
              setConfirm(
                aiProcessed
                  ? {
                      title: "Reprocessar com IA?",
                      message: (
                        <>
                          A IA vai reler o material e <b>preencher apenas os campos vazios</b>,
                          preservando o que você já editou. Consome créditos da Anthropic (centavos
                          por processamento).
                        </>
                      ),
                      confirmLabel: "Reprocessar",
                      onConfirm: () => handleProcess("merge"),
                    }
                  : {
                      title: "Processar com IA?",
                      message: (
                        <>
                          A IA vai ler o material e preencher os blocos (oferta, perfil, cenário) e
                          listar as informações faltantes. Consome créditos da Anthropic (centavos
                          por processamento).
                        </>
                      ),
                      confirmLabel: "Processar",
                      onConfirm: () => handleProcess("reset"),
                    },
              )
            }
            isLoading={processing}
            isDisabled={extracting || !text.trim()}
            startContent={<SparklesIcon className="w-4 h-4" />}
          >
            {aiProcessed ? "Reprocessar com IA" : "Processar com IA"}
          </Button>
        </div>

        {gaps.length > 0 && (
          <div className="flex flex-col gap-2 rounded-sm border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">
              Informações faltantes ({gaps.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {gaps.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium ${GAP_STYLES[g.severidade].cls}`}
                  >
                    {GAP_STYLES[g.severidade].label}
                  </span>
                  <span>
                    <span className="text-slate-400">{g.grupo}:</span> {g.item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Input
          label="Nome da oferta"
          labelPlacement="outside"
          placeholder="Ex.: Plano Enterprise X"
          value={offerName}
          onValueChange={setOfferName}
          radius="sm"
          variant="bordered"
        />

        {aiProcessed && (
          <Textarea
            label="Perfil do comprador (buyer persona)"
            labelPlacement="outside"
            placeholder="Cargo, prioridades, consciência do problema, objeções…"
            disableAutosize
            value={perfil}
            onValueChange={setPerfil}
            radius="sm"
            variant="bordered"
            description="Alimenta a etapa de contexto/persona na Perfecting."
            classNames={{ input: "h-72 overflow-y-auto resize-y" }}
          />
        )}

        <Select
          label="Tipo de chamada (call context)"
          labelPlacement="outside"
          placeholder={callContexts.length ? "Escolha o tipo de chamada" : "Carregando…"}
          isDisabled={callContexts.length === 0}
          selectedKeys={callContextSlug ? [callContextSlug] : []}
          onSelectionChange={(keys) => setCallContextSlug(String(Array.from(keys)[0] ?? ""))}
          radius="sm"
          variant="bordered"
          classNames={managerSelectClassNames}
          isRequired
        >
          {callContexts.map((c) => (
            <SelectItem key={c.slug} textValue={c.name}>
              {c.name} — {c.group}
            </SelectItem>
          ))}
        </Select>

        <Select
          label="Dificuldade"
          labelPlacement="outside"
          selectedKeys={[difficulty]}
          onSelectionChange={(keys) => setDifficulty(String(Array.from(keys)[0] ?? "medium"))}
          radius="sm"
          variant="bordered"
          classNames={managerSelectClassNames}
        >
          {DIFFICULTIES.map((d) => (
            <SelectItem key={d.key}>{d.label}</SelectItem>
          ))}
        </Select>

        {aiProcessed && (
          <>
            <Textarea
              label="Comportamento do cenário"
              labelPlacement="outside"
              placeholder="Como a persona reage, testes de fogo/objeções, critério de fechamento…"
              disableAutosize
              value={cenarioInstrucoes}
              onValueChange={setCenarioInstrucoes}
              radius="sm"
              variant="bordered"
              description="Define o comportamento do roleplay (instruções do case setup)."
              classNames={{ input: "h-72 overflow-y-auto resize-y" }}
            />
            <Input
              label="Objetivo de treino"
              labelPlacement="outside"
              placeholder="Ex.: praticar abertura e qualificação por dor"
              value={objetivo}
              onValueChange={setObjetivo}
              radius="sm"
              variant="bordered"
            />
            <Input
              label="Habilidades a treinar"
              labelPlacement="outside"
              placeholder="Ex.: rapport, contorno de objeções, fechamento"
              value={habilidades}
              onValueChange={setHabilidades}
              radius="sm"
              variant="bordered"
            />
          </>
        )}

        <Select
          label="Conta de destino (opcional)"
          labelPlacement="outside"
          placeholder="Definir depois, no envio"
          selectedKeys={connectionId ? [connectionId] : []}
          onSelectionChange={(keys) => setConnectionId(String(Array.from(keys)[0] ?? ""))}
          radius="sm"
          variant="bordered"
          classNames={managerSelectClassNames}
        >
          {connections.map((c) => (
            <SelectItem key={c.id} textValue={`${c.org_name ?? `Org ${c.org_id}`} (${c.environment})`}>
              {c.org_name ?? `Org ${c.org_id}`} ({c.environment})
            </SelectItem>
          ))}
        </Select>

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onPress={() =>
              setConfirm({
                title: "Limpar tudo?",
                message: (
                  <>
                    Isso apaga <b>todo o formulário</b> — material, oferta, perfil, cenário, lacunas
                    e arquivos — para começar um roleplay do zero. Não dá para desfazer.
                  </>
                ),
                confirmLabel: "Limpar tudo",
                onConfirm: clearAll,
              })
            }
            isDisabled={saving || extracting || processing}
          >
            Limpar
          </Button>
          <Button
            onPress={() =>
              setConfirm({
                title: "Salvar roleplay na biblioteca?",
                message: (
                  <>
                    O roleplay será salvo como rascunho na <b>Biblioteca</b>, de onde você poderá
                    enviá-lo para a Perfecting. Ainda não cria nada na conta do cliente.
                  </>
                ),
                confirmLabel: "Salvar",
                onConfirm: handleSave,
              })
            }
            isLoading={saving}
            isDisabled={extracting}
          >
            Salvar roleplay na biblioteca
          </Button>
        </div>
      </Card>

      <Modal isOpen={promptModalOpen} onOpenChange={setPromptModalOpen} radius="sm" size="3xl">
        <ModalContent>
          <ModalHeader>Editar prompt de processamento</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Estas são as instruções que a IA segue ao estruturar o material. O app adiciona
              automaticamente a lista de tipos de chamada disponíveis e o formato de saída — você não
              precisa incluí-los aqui.
            </p>
            <Textarea
              value={promptDraft}
              onValueChange={setPromptDraft}
              disableAutosize
              radius="sm"
              variant="bordered"
              classNames={{ input: "h-96 overflow-y-auto resize-y font-mono text-xs" }}
            />
          </ModalBody>
          <ModalFooter className="justify-between">
            <button
              type="button"
              onClick={() => setPromptDraft(DEFAULT_IMPORT_PROMPT)}
              className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              <ArrowPathIcon className="w-4 h-4" /> Restaurar padrão
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={() => setPromptModalOpen(false)}>
                Cancelar
              </Button>
              <Button onPress={savePrompt}>Salvar prompt</Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
