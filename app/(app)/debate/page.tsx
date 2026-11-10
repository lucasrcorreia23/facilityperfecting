"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Checkbox, Input, Select, SelectItem, Textarea, addToast } from "@heroui/react";
import { ArrowUpTrayIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { SendStatusModal, type SendStatus } from "@/app/components/ui/send-status-modal";
import { SectionTitle, TopicList } from "@/app/components/creation/dossier-editor";
import { ObjectionListEditor } from "@/app/components/content/objection-list-editor";
import { GuardrailListEditor } from "@/app/components/content/guardrail-list-editor";
import { ConnectionPicker } from "@/app/components/ui/connection-picker";
import { DestinationSummary } from "@/app/components/ui/destination-summary";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { useConnections } from "@/app/lib/use-connections";
import { useUnsavedGuard } from "@/app/lib/use-unsaved-guard";
import { isProduction } from "@/app/lib/connection-label";
import {
  createDraftFromText,
  invokeExport,
  listDestinationMethodologies,
  processDebateImport,
  uploadAndExtract,
} from "@/app/lib/db";
import type { GeneratorManifest, Methodology } from "@/app/lib/types";
import { ROLE_PLAY_STATUSES } from "@/supabase/functions/_shared/roleplay-adjust-model";
import {
  DEBATE_FEEDBACK_MODULES,
  type DebateAnchors,
  type DebateDraft,
  debateBuyerTexts,
  debateDraftIssues,
  emptyDebateDraft,
  mergeDebateAiResult,
  type MethodologyStepRef,
  sortSteps,
} from "@/supabase/functions/_shared/debate";
import { describeBuyerTextIssue, findReservedTerms } from "@/supabase/functions/_shared/buyer-text-lint";

const DIFFICULTIES = [
  { key: "easy", label: "Fácil" },
  { key: "medium", label: "Médio" },
  { key: "hard", label: "Difícil" },
];
const NO_STATUS = "__none__";
const field = { inputWrapper: "bg-white" };

const EMPTY_ANCHORS: DebateAnchors = {
  obra: "",
  tema: "",
  mocao: "",
  lado_aluno: "contra",
  oponente_nome: "",
  oponente_idade: 14,
  oponente_genero: "feminino",
};

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

/**
 * Debate: o aluno debate com uma oponente de IA a partir de uma obra. Vai para a
 * Perfecting no motor de debate, com persona, conteúdo por etapa, contra-argumentos e
 * regras gravados como estão aqui (ver `_shared/debate.ts`). O "+ Criar roleplay" da
 * Perfecting grava debate como venda — por isso este caminho existe.
 */
export default function DebatePage() {
  const { connections, error: connectionsError, reload: reloadConnections } = useConnections();
  const [connectionId, setConnectionId] = useState("");
  const [methodologies, setMethodologies] = useState<Methodology[]>([]);
  const [methodologyId, setMethodologyId] = useState("");
  const [steps, setSteps] = useState<MethodologyStepRef[]>([]);
  const [loadingDest, setLoadingDest] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [status, setStatus] = useState("1");
  const [anchors, setAnchors] = useState<DebateAnchors>(EMPTY_ANCHORS);
  const [text, setText] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [draft, setDraft] = useState<DebateDraft | null>(null);
  const [generator, setGenerator] = useState<GeneratorManifest | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>("sending");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentCaseSetup, setSentCaseSetup] = useState<number | null>(null);
  /** Assinatura do debate que já foi enviado: editar depois volta a contar como não salvo. */
  const [sentSig, setSentSig] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Rascunho já gravado para este conteúdo: "Tentar de novo" reenvia o mesmo, sem duplicar. */
  const sentDraftRef = useRef<{ sig: string; id: string } | null>(null);

  async function changeConnection(id: string) {
    setConnectionId(id);
    setMethodologies([]);
    setMethodologyId("");
    setSteps([]);
    setDraft(null);
    if (!id) return;
    setLoadingDest(true);
    try {
      setMethodologies((await listDestinationMethodologies(id)).items);
    } catch (e) {
      addToast({ title: "Falha ao listar as metodologias da conta", description: String(e), color: "danger" });
    } finally {
      setLoadingDest(false);
    }
  }

  async function changeMethodology(id: string) {
    setMethodologyId(id);
    setSteps([]);
    setDraft(null);
    if (!id || !connectionId) return;
    setLoadingDest(true);
    try {
      setSteps(sortSteps((await listDestinationMethodologies(connectionId, Number(id))).steps ?? []));
    } catch (e) {
      addToast({ title: "Falha ao listar as etapas", description: String(e), color: "danger" });
    } finally {
      setLoadingDest(false);
    }
  }

  async function ingestFiles(files: File[]) {
    setExtracting(true);
    try {
      let combined = "";
      for (const f of files) {
        const { text: extracted, filePath: path } = await uploadAndExtract(f);
        combined += (combined ? "\n\n" : "") + (files.length > 1 ? `--- ${f.name} ---\n${extracted}` : extracted);
        setFilePath(files.length === 1 ? path : null);
      }
      setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${combined}` : combined));
      setFileNames((prev) => [...prev, ...files.map((f) => f.name)]);
    } catch (e) {
      addToast({ title: "Falha ao extrair", description: e instanceof Error ? e.message : String(e), color: "danger" });
    } finally {
      setExtracting(false);
    }
  }

  const anchorsReady =
    anchors.obra.trim() && anchors.tema.trim() && anchors.mocao.trim() && anchors.oponente_nome.trim() &&
    Number.isInteger(anchors.oponente_idade) && anchors.oponente_idade >= 8;
  const canProcess = Boolean(connectionId && steps.length > 0 && anchorsReady && text.trim());

  async function handleProcess() {
    if (!canProcess) return;
    setProcessing(true);
    try {
      const { result, generator: g, warnings } = await processDebateImport({ text, anchors, steps, connectionId });
      setDraft(mergeDebateAiResult(emptyDebateDraft(anchors, steps), result));
      setGenerator(g);
      for (const w of warnings) addToast({ title: "Aviso", description: w, color: "warning" });
    } catch (e) {
      addToast({ title: "Falha ao processar", description: e instanceof Error ? e.message : String(e), color: "danger" });
    } finally {
      setProcessing(false);
    }
  }

  /** Âncora editada depois de processar vale também no rascunho. */
  function updateAnchors(patch: Partial<DebateAnchors>) {
    setAnchors((a) => ({ ...a, ...patch }));
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  const update = (patch: Partial<DebateDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const issues = useMemo(() => (draft ? debateDraftIssues(draft, steps) : []), [draft, steps]);
  const lint = useMemo(() => (draft ? findReservedTerms(debateBuyerTexts(draft)) : []), [draft]);
  const lintErrors = lint.filter((i) => i.nivel === "erro");
  const canSend = Boolean(draft) && issues.length === 0 && lintErrors.length === 0;
  const methodology = methodologies.find((m) => String(m.id) === methodologyId) ?? null;
  const connection = connections?.find((c) => c.id === connectionId) ?? null;

  // Fechar a aba ou sair pelo menu com o debate na tela perdia tudo: nada aqui é
  // gravado antes do envio.
  const draftSig = useMemo(() => (draft ? JSON.stringify(draft) : null), [draft]);
  const hasContent = Boolean(
    text.trim() || draft || anchors.obra.trim() || anchors.tema.trim() || anchors.mocao.trim(),
  );
  useUnsavedGuard(hasContent && !(sentSig !== null && sentSig === draftSig));

  async function runSend() {
    if (!draft || !methodology) return;
    setSendOpen(true);
    setSendStatus("sending");
    setSendError(null);
    try {
      const sig = JSON.stringify({ draft, difficulty, status, connectionId, methodologyId });
      const draftId =
        sentDraftRef.current?.sig === sig ? sentDraftRef.current.id : (await createDraftFromText({
        text,
        offerName: draft.titulo.trim() || `Debate · ${draft.tema}`,
        sourceType: filePath ? "file" : "paste",
        filePath,
        meta: fileNames.length ? { files: fileNames } : {},
        connectionId,
        scenario: {
          generation_mode: "debate",
          debate: draft,
          difficulty,
          methodology_slug: methodology.slug,
          role_play_status_id: status === NO_STATUS ? null : Number(status),
        },
        generator,
        generationOutput: null,
      })).draftId;
      sentDraftRef.current = { sig, id: draftId };
      const res = await invokeExport([draftId]);
      if (res.failures.length > 0) throw new Error(res.failures.join("\n"));
      const caseSetupId = (res.results?.[0]?.caseSetupId ?? null) as number | null;
      setSentCaseSetup(caseSetupId);
      setSentSig(JSON.stringify(draft));
      setSendStatus("success");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
      setSendStatus("error");
    }
  }

  function askSend() {
    setConfirm({
      title: "Criar 1 roleplay de debate nesta conta?",
      message: (
        <span className="flex flex-col gap-3">
          <DestinationSummary destinations={[{ connection }]} />
          <span>
            Será criado <b>1 roleplay de debate</b> ({draft?.titulo.trim() || draft?.tema}): oferta, contexto,
            persona, {draft?.etapas.length} etapa(s), {(draft?.objecoes.length ?? 0) * 3} contra-argumento(s) nos
            três níveis e {draft?.guardrails.length} regra(s).
          </span>
        </span>
      ),
      confirmLabel: isProduction(connection) ? "Criar em produção" : "Criar debate",
      onConfirm: () => void runSend(),
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <PageHeader
        title="Debate"
        description="Roleplay de debate: o aluno debate com uma oponente de IA a partir de uma obra. Vai para a conta no motor de debate, com persona, conteúdo por etapa, contra-argumentos e regras."
      />

      <Card className="p-4 sm:p-6 flex flex-col gap-5">
        <SectionTitle title="Destino" hint="A metodologia é da conta: o conteúdo é gerado por etapa dela." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConnectionPicker
            connections={connections}
            value={connectionId}
            onChange={(id) => void changeConnection(id)}
            loadError={connectionsError}
            onRetry={reloadConnections}
            isRequired
          />
          <Select
            label="Metodologia"
            labelPlacement="outside-top"
            placeholder={connectionId ? (loadingDest ? "Carregando…" : "Escolha a metodologia") : "Escolha a conta antes"}
            isDisabled={!connectionId || methodologies.length === 0}
            selectedKeys={methodologyId ? [methodologyId] : []}
            onSelectionChange={(k) => void changeMethodology(String(Array.from(k)[0] ?? ""))}
            radius="sm"
            variant="bordered"
            classNames={managerSelectClassNames}
            description={steps.length > 0 ? `Etapas: ${steps.map((s) => s.name).join(" · ")}` : undefined}
          >
            {methodologies.map((m) => (
              <SelectItem key={String(m.id)} textValue={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </Select>
          <Select
            label="Dificuldade"
            labelPlacement="outside-top"
            selectedKeys={[difficulty]}
            onSelectionChange={(k) => setDifficulty(String(Array.from(k)[0] ?? "medium"))}
            radius="sm"
            variant="bordered"
            classNames={managerSelectClassNames}
          >
            {DIFFICULTIES.map((d) => (
              <SelectItem key={d.key}>{d.label}</SelectItem>
            ))}
          </Select>
          <Select
            label="Status na conta"
            labelPlacement="outside-top"
            selectedKeys={[status]}
            onSelectionChange={(k) => setStatus(String(Array.from(k)[0] ?? NO_STATUS))}
            radius="sm"
            variant="bordered"
            classNames={managerSelectClassNames}
          >
            {ROLE_PLAY_STATUSES.map((s) => (
              <SelectItem key={s.id == null ? NO_STATUS : String(s.id)} textValue={`${s.label} — ${s.hint}`} description={s.hint}>
                {s.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="p-4 sm:p-6 flex flex-col gap-5">
        <SectionTitle
          title="O debate"
          hint="Fixos: a IA usa exatamente estes valores em todas as partes, e nunca os inventa."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Obra" labelPlacement="outside" placeholder='"Título", de Autor' value={anchors.obra}
            onValueChange={(v) => updateAnchors({ obra: v })} radius="sm" variant="bordered" classNames={field} />
          <Input label="Tema" labelPlacement="outside" placeholder="Ex.: Terceirização da culpa" value={anchors.tema}
            onValueChange={(v) => updateAnchors({ tema: v })} radius="sm" variant="bordered" classNames={field} />
        </div>
        <Input label="Moção" labelPlacement="outside" placeholder="A frase que um lado sustenta e o outro contesta"
          value={anchors.mocao} onValueChange={(v) => updateAnchors({ mocao: v })} radius="sm" variant="bordered" classNames={field} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            label="Lado do aluno"
            labelPlacement="outside-top"
            selectedKeys={[anchors.lado_aluno]}
            onSelectionChange={(k) => updateAnchors({ lado_aluno: String(Array.from(k)[0]) === "a_favor" ? "a_favor" : "contra" })}
            radius="sm"
            variant="bordered"
            classNames={managerSelectClassNames}
            className="md:col-span-2"
          >
            <SelectItem key="contra">Contesta a moção</SelectItem>
            <SelectItem key="a_favor">Sustenta a moção</SelectItem>
          </Select>
          <Input label="Nome da oponente" labelPlacement="outside" value={anchors.oponente_nome}
            onValueChange={(v) => updateAnchors({ oponente_nome: v })} radius="sm" variant="bordered" classNames={field} />
          <Input label="Idade" labelPlacement="outside" type="number" value={String(anchors.oponente_idade)}
            onValueChange={(v) => updateAnchors({ oponente_idade: Number(v) })} radius="sm" variant="bordered" classNames={field} />
        </div>
        <Select
          label="Gênero da oponente"
          labelPlacement="outside-top"
          selectedKeys={[anchors.oponente_genero]}
          onSelectionChange={(k) => updateAnchors({ oponente_genero: String(Array.from(k)[0]) === "masculino" ? "masculino" : "feminino" })}
          radius="sm"
          variant="bordered"
          classNames={managerSelectClassNames}
          className="md:w-1/2"
          description="Dá a concordância das falas e escolhe a voz e o avatar da faixa de idade."
        >
          <SelectItem key="feminino">Feminino</SelectItem>
          <SelectItem key="masculino">Masculino</SelectItem>
        </Select>
      </Card>

      <Card className="p-4 sm:p-6 flex flex-col gap-4">
        <SectionTitle title="Material" hint="A obra processada, o pacote do debate ou anotações. PDF, DOCX ou texto colado." />
        <Textarea value={text} onValueChange={setText} minRows={8} radius="sm" variant="bordered"
          placeholder="Cole o material aqui" classNames={{ input: "h-72 overflow-y-auto resize-y" }} />
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.md" className="hidden"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length) void ingestFiles(files);
              e.target.value = "";
            }} />
          <Button variant="secondary" onPress={() => fileInput.current?.click()} isLoading={extracting}
            startContent={!extracting ? <ArrowUpTrayIcon className="w-4 h-4" /> : undefined}>
            Enviar arquivo
          </Button>
          {fileNames.length > 0 && <span className="text-xs text-slate-500">{fileNames.join(", ")}</span>}
          <div className="flex-1" />
          <Button onPress={() => void handleProcess()} isDisabled={!canProcess} isLoading={processing}
            startContent={!processing ? <SparklesIcon className="w-4 h-4" /> : undefined}>
            {draft ? "Processar de novo" : "Processar com IA"}
          </Button>
        </div>
        {!canProcess && !processing && (
          <p className="text-xs text-slate-500">
            Para processar: conta, metodologia, os campos do debate e o material.
          </p>
        )}
      </Card>

      {draft && (
        <>
          <Card className="p-4 sm:p-6 flex flex-col gap-4">
            <SectionTitle title="Roleplay" hint="O que o aluno vê no card e no fim da chamada." />
            <Input label="Título" labelPlacement="outside" value={draft.titulo} onValueChange={(v) => update({ titulo: v })}
              radius="sm" variant="bordered" classNames={field} />
            <Textarea label="Descrição para o aluno" labelPlacement="outside" value={draft.descricao}
              onValueChange={(v) => update({ descricao: v })} minRows={4} radius="sm" variant="bordered" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Objetivo" labelPlacement="outside" value={draft.objetivo} onValueChange={(v) => update({ objetivo: v })}
                radius="sm" variant="bordered" classNames={field} />
              <Input label="Palavras-chave" labelPlacement="outside" value={draft.palavras_chave}
                onValueChange={(v) => update({ palavras_chave: v })} radius="sm" variant="bordered" classNames={field} />
            </div>
            <Textarea label="Critérios de sucesso (um por linha)" labelPlacement="outside" value={draft.criterios_sucesso.join("\n")}
              onValueChange={(v) => update({ criterios_sucesso: lines(v) })} minRows={3} radius="sm" variant="bordered" />
          </Card>

          <Card className="p-4 sm:p-6 flex flex-col gap-4">
            <SectionTitle title={`Oponente: ${draft.oponente_nome}`} hint={`Entra no prompt como "Você é ${draft.oponente_nome}, {descrição}".`} />
            <Input label="Descrição" labelPlacement="outside" value={draft.oponente_descricao}
              onValueChange={(v) => update({ oponente_descricao: v })} radius="sm" variant="bordered" classNames={field} />
            <Input label="Papel no debate" labelPlacement="outside" value={draft.oponente_papel}
              onValueChange={(v) => update({ oponente_papel: v })} radius="sm" variant="bordered" classNames={field} />
            <Textarea label="Personalidade, caso e camadas" labelPlacement="outside" value={draft.oponente_personalidade}
              onValueChange={(v) => update({ oponente_personalidade: v })} minRows={12} radius="sm" variant="bordered"
              classNames={{ input: "h-96 overflow-y-auto resize-y" }} />
            <Textarea label="O que ela já sabe antes de começar" labelPlacement="outside" value={draft.conhecimento_previo}
              onValueChange={(v) => update({ conhecimento_previo: v })} minRows={3} radius="sm" variant="bordered" />
            <Checkbox isSelected={Boolean(draft.sem_voz)} onValueChange={(v) => update({ sem_voz: v })} size="sm">
              Sem voz própria (o agente usa a voz padrão do roleplay)
            </Checkbox>
          </Card>

          <Card className="p-4 sm:p-6 flex flex-col gap-4">
            <SectionTitle title="O que o aluno lê antes de começar" hint="A instrução vale para todas as etapas; cada etapa acrescenta o foco." />
            <Textarea label="Instrução ao aluno" labelPlacement="outside" value={draft.instrucao_aluno}
              onValueChange={(v) => update({ instrucao_aluno: v })} minRows={2} radius="sm" variant="bordered" />
            <TopicList label="Cartão do aluno" items={draft.briefing} onChange={(briefing) => update({ briefing })} />
          </Card>

          <Card className="p-4 sm:p-6 flex flex-col gap-6">
            <SectionTitle title="Etapas" hint="Cada etapa é um debate inteiro com foco num critério da metodologia." />
            {draft.etapas.map((e, i) => (
              <div key={e.ordem} className="flex flex-col gap-3 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
                <p className="text-base font-medium text-slate-800">{e.ordem}. {e.nome}</p>
                <TopicList
                  label={`Regras da oponente, etapa ${e.ordem}`}
                  items={e.regras}
                  onChange={(regras) => update({ etapas: draft.etapas.map((x, j) => (j === i ? { ...x, regras } : x)) })}
                />
                <Input label="Foco do aluno" labelPlacement="outside" value={e.foco_aluno}
                  onValueChange={(v) => update({ etapas: draft.etapas.map((x, j) => (j === i ? { ...x, foco_aluno: v } : x)) })}
                  radius="sm" variant="bordered" classNames={field} />
                <Textarea label="Primeiras falas (uma por linha; sorteia uma)" labelPlacement="outside" value={e.primeiras_falas.join("\n")}
                  onValueChange={(v) => update({ etapas: draft.etapas.map((x, j) => (j === i ? { ...x, primeiras_falas: lines(v) } : x)) })}
                  minRows={3} radius="sm" variant="bordered" />
              </div>
            ))}
          </Card>

          <Card className="p-4 sm:p-6 flex flex-col gap-4">
            <SectionTitle title="Contra-argumentos" hint="Entram nos três níveis. Quando ceder é só da oponente: nunca é dito ao aluno." />
            <ObjectionListEditor
              items={draft.objecoes.map((o) => ({ ...o, tipo: "" }))}
              onChange={(next) => update({ objecoes: next.map((o) => ({ titulo: o.titulo, fala_exemplo: o.fala_exemplo, detalhes: o.detalhes, ceder_se: o.ceder_se })) })}
              showDetails
              newItem={() => ({ titulo: "", tipo: "", fala_exemplo: "", detalhes: "", ceder_se: "" })}
            />
          </Card>

          <Card className="p-4 sm:p-6 flex flex-col gap-4">
            <SectionTitle title="Regras" hint="Valem o debate inteiro. As de segurança e idade a plataforma já põe." />
            <GuardrailListEditor items={draft.guardrails} onChange={(guardrails) => update({ guardrails })} editableNames
              newItem={() => ({ nome: "", instrucao: "" })} />
          </Card>

          <Card className="p-4 sm:p-6 flex flex-col gap-3">
            <SectionTitle title="Avaliação no feedback" hint="Módulos que entram na nota deste roleplay." />
            <div className="flex flex-wrap gap-4">
              {DEBATE_FEEDBACK_MODULES.map((m) => (
                <Checkbox key={m.key} size="sm" isSelected={draft.feedback_modulos[m.key]}
                  onValueChange={(v) => update({ feedback_modulos: { ...draft.feedback_modulos, [m.key]: v } })}>
                  {m.label}
                </Checkbox>
              ))}
            </div>
          </Card>

          {(issues.length > 0 || lint.length > 0) && (
            <div className="flex flex-col gap-1 rounded-sm bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">Antes de enviar</p>
              {issues.map((i, k) => <p key={`i${k}`}>{i}</p>)}
              {lint.map((i, k) => (
                <p key={`l${k}`} className={i.nivel === "aviso" ? "text-amber-800" : undefined}>
                  {i.nivel === "aviso" ? "Aviso: " : ""}{describeBuyerTextIssue(i)}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-4">
            <Button onPress={askSend} isDisabled={!canSend}>Enviar debate</Button>
          </div>
        </>
      )}

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      <SendStatusModal
        open={sendOpen}
        status={sendStatus}
        errorMessage={sendError}
        onRetry={() => void runSend()}
        onClose={() => setSendOpen(false)}
        sendingLabel="Criando o debate na conta de destino…"
        successTitle={sentCaseSetup ? `Debate criado: roleplay ${sentCaseSetup}` : "Debate criado"}
        successHint="O rascunho está na Biblioteca."
      />
      {sendStatus === "success" && !sendOpen && (
        <p className="text-sm text-slate-600">
          Enviado. Veja na <Link href="/biblioteca" className="text-[#2E63CD] hover:underline">Biblioteca</Link>.
        </p>
      )}
    </div>
  );
}
