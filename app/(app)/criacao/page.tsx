"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Checkbox,
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
import { SendStatusModal, type SendStatus } from "@/app/components/ui/send-status-modal";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import {
  createDraftFromText,
  invokeExport,
  invokeExportPlaybook,
  listCallContexts,
  listConnections,
  listPlaybookCallTypes,
  listPlaybooks,
  processImport,
  uploadAndExtract,
} from "@/app/lib/db";
import type {
  CallContextType,
  Connection,
  GenerationMode,
  GuardrailSeed,
  ImportGap,
  ObjectionSeed,
  Playbook,
  PlaybookCallType,
} from "@/app/lib/types";

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

/** Quantidade de personas no modo playbook. 1 = comportamento antigo (persona única). */
const PERSONA_COUNTS = Array.from({ length: 10 }, (_, i) => String(i + 1));

const PROMPT_STORAGE_KEY = "import_prompt";
const PROMPT_VERSION_KEY = "import_prompt_version";
/** Avisa a própria aba: o evento "storage" do navegador só dispara nas OUTRAS abas. */
const PROMPT_CHANGE_EVENT = "import-prompt-change";

function subscribeSavedPrompt(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PROMPT_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PROMPT_CHANGE_EVENT, onChange);
  };
}

/** Snapshot em string (o useSyncExternalStore compara por ===): [prompt, versão]. */
function readSavedPrompt(): string {
  try {
    return JSON.stringify([
      localStorage.getItem(PROMPT_STORAGE_KEY) ?? "",
      localStorage.getItem(PROMPT_VERSION_KEY) ?? "",
    ]);
  } catch {
    return '["",""]'; // localStorage indisponível — usa o prompt padrão
  }
}
/**
 * Suba a cada mudança no DEFAULT_IMPORT_PROMPT. Um prompt personalizado fica no
 * localStorage e continua valendo depois do deploy — sem isto, quem personalizou
 * seguiria com um prompt velho sem saber que o padrão evoluiu.
 * v2: realinhado ao modo playbook, às 13 dimensões do contexto e ao B2B/B2C.
 * v3: extrai objeções (com "Ceda se") e guardrails do material.
 * v4: separa o lado do comprador do material do vendedor, gera "oferta_descricao",
 *     regras de datas/valores e guardrails sem encerrar a ligação.
 */
const PROMPT_VERSION = 4;

/** Prompt padrão de processamento (instruções de extração). O app adiciona, depois,
 *  a lista de call_contexts disponíveis e o formato JSON automaticamente. */
const DEFAULT_IMPORT_PROMPT = `Você é um especialista em criação de Roleplays Comerciais para a plataforma Perfecting.

Sua tarefa: a partir de QUALQUER material fornecido (sites, PDFs, propostas, transcrições, playbooks, anotações), EXTRAIR e ORGANIZAR as informações para preencher um roleplay na Perfecting. Você NÃO conversa e NÃO pergunta — você sempre devolve o resultado estruturado.

COMO O RESULTADO É USADO. O roleplay pode ser gerado de dois jeitos, e o usuário só escolhe DEPOIS de você processar — então preencha todos os campos, mas saiba onde cada um pesa:
- Pelo PLAYBOOK da conta: cada etapa do playbook vira um roleplay. Tipo de chamada, comportamento e rubricas vêm das etapas, então "call_context_slug", "dificuldade", "cenario_instrucoes", "objetivo" e "habilidades" são IGNORADOS. Chegam à plataforma: "oferta_nome", "oferta_descricao", "perfil", "personas_variacao", "objecoes" e "guardrails".
- Por METODOLOGIA: um roleplay só, e aí todos os campos são usados.
"oferta_descricao", "perfil", "personas_variacao", "objecoes" e "guardrails" alimentam o roleplay nos DOIS modos — são eles que carregam o material do cliente até a plataforma. Priorize-os.

QUEM LÊ ISTO É O COMPRADOR. Tudo que chega à plataforma vira conhecimento do comprador simulado: ele "sabe" o que estiver nesses campos. O material costuma misturar dois lados:
- Lado do comprador (USE): quem ele é, a empresa e o segmento dele, dores, prioridades, orçamento, processo de decisão, o que usa hoje, receios, as frases que ele diz, e o que a oferta mostra publicamente.
- Lado do vendedor (NÃO TRANSCREVA): metodologia e etapas de venda, playbook, roteiro e perguntas que o vendedor deve fazer, o que o vendedor deve ou não deve fazer, critérios de avaliação e rubricas, campos e rotinas de CRM, metas da equipe comercial, documentos e processos internos da empresa que vende.
Use o lado do vendedor só para INFERIR o comprador — se o roteiro manda perguntar sobre orçamento, descreva a situação de orçamento do comprador, não a pergunta. Um comprador que conhece o método do vendedor ensina o método e conduz a venda no lugar dele, e o treino perde o sentido.

ETAPA 1 — EXTRAÇÃO. Extraia tudo que conseguir sobre:
- Oferta: nome, produto/serviço, proposta de valor, problema principal resolvido, diferenciais competitivos, ticket médio, ciclo de vendas, concorrentes, casos de uso, ROI, público-alvo.
- Quem compra: cargos/perfis, responsabilidades, KPIs, metas, medos, motivações, critérios de decisão, influenciadores, nível de autoridade, estilos de comunicação.
- Cenário: tipo de conversa (cold call, discovery, demo, proposta, negociação, renovação, expansão), como o lead chegou, nível de consciência, momento da jornada, urgência, situação atual.
- Objeções: preço, timing, prioridade, concorrente, autoridade, implementação, integração, segurança, ROI, troca de fornecedor, falta de necessidade. Use frases reais quando houver.

ETAPA 2 — ORGANIZAÇÃO. Separe o conteúdo nos blocos abaixo.

oferta_descricao (markdown curto) — USADO NOS DOIS MODOS. Vira a descrição da oferta na Perfecting. O que é vendido e para quem: produto/serviço, proposta de valor, problema resolvido, diferenciais, formato, e preço e condições VIGENTES quando o material trouxer. Escreva como a oferta se apresenta ao mercado — sem metodologia de venda, roteiro, argumentos que o vendedor deve usar, CRM ou processo interno.

perfil (markdown) — O CAMPO MAIS IMPORTANTE. Não é o retrato de uma pessoa: é a instrução com que a Perfecting monta o CONTEXTO, e é do contexto que saem uma ou várias personas. Use subtítulos e cubra tudo que o material permitir:
- Público-alvo: quem compra (empresa/segmento se B2B; perfil de pessoa se B2C)
- Gatilhos de urgência: o que faz agir agora, e não daqui a seis meses
- Prioridades e objetivos do período
- Dores mensuráveis: com números, prazos ou custos quando houver
- Estado futuro desejado: como é o "depois" que eles querem
- O que de fato motiva a compra (receita, risco, segurança, reconhecimento…)
- Processo de decisão: quem decide, quem influencia, quantas etapas, prazo típico
- Aversão a risco: o quanto temem mudar, o que preferem manter como está
- Objeções e receios — com frases reais quando houver
- Consciência do problema: sabem que têm? subestimam? que sintomas percebem?
- Consciência das soluções: já pesquisaram? o que acham do que existe no mercado?
- O que usam hoje para resolver isso e por que não basta
Se o material indicar cargos ou áreas típicas, cite-os como EXEMPLOS do espectro — não feche numa pessoa só, porque as personas são geradas a partir deste texto.
Descreva o comprador, não a venda: nada de etapas do playbook, perguntas do vendedor ou método.

personas_variacao (texto curto) — como as personas devem variar entre si quando o usuário pedir mais de uma: cargos e áreas diferentes, senioridade, estilos de comunicação, graus de consciência e de resistência. Só o que o material sustentar; sem base, devolva "".

objecoes (lista) — USADO NOS DOIS MODOS. As objeções que o comprador levanta. No modo playbook, cada uma vai só para as etapas em que o comprador a levantaria; por metodologia, vale para o roleplay inteiro. Para cada uma:
- "titulo": nome curto (ex.: "Orçamento comprometido")
- "tipo": um dos slugs disponíveis
- "fala_exemplo": como o comprador diz isso, na primeira pessoa — TRANSCREVA a frase real do material quando houver, em vez de reescrever
- "detalhes": o que está por trás, o que ele teme
- "ceder_se": a condição que faz o comprador ceder, do ponto de vista dele — o que ele precisa ouvir, ver ou receber (ex.: "Ver um caso de empresa do mesmo porte, com o retorno em números"). Não descreva técnica, etapa ou método do vendedor. SEMPRE preencha: sem ela o comprador repete a objeção até o fim e o treino não tem desfecho possível
Extraia todas as que o material trouxer, sem inventar. Lista vazia se não houver nenhuma.

guardrails (lista) — USADO NOS DOIS MODOS. Regras de comportamento do comprador simulado, quando o material as definir: o que ele nunca deve fazer, como reagir a promessa indevida ou a termo proibido ao vendedor. Valem em TODAS as etapas e em qualquer momento da conversa, então: nada que só faça sentido numa etapa (ex.: regras de fechamento ou de negociação); nunca mande o comprador encerrar, desligar ou abandonar a ligação — ele reage (desconfia, pede prova, resiste), mas continua na conversa; e nada que seja critério de avaliação do vendedor. Cada item tem "nome" (curto) e "instrucao" (a regra em segunda pessoa, dirigida ao comprador — ex.: "Se o vendedor prometer que a verba será aprovada, desconfie e peça que ele mostre como isso seria garantido"). Lista vazia se o material não definir regras.

cenario_instrucoes (markdown) — IGNORADO no modo playbook. Comportamento da persona durante a conversa: como reage, testes de fogo/objeções que aplica, critério de fechamento. Se o material já trouxer instruções ou prompts de comportamento prontos, PRESERVE-OS na íntegra (transcreva, não resuma). Sem base no material, seja breve em vez de inventar.

objetivo e habilidades — IGNORADOS no modo playbook (as rubricas vêm das etapas). Objetivo de treino do roleplay e habilidades de venda a treinar.

call_context_slug e dificuldade — IGNORADOS no modo playbook. Escolha o slug mais adequado entre os disponíveis e a dificuldade (easy/medium/hard) coerente com o cenário.

ETAPA 3 — LACUNAS. Liste o que ainda falta para um roleplay de alta qualidade, classificando cada item como "critico", "importante" ou "opcional". Use o campo "grupo" para separar o que vale sempre ("Oferta", "Contexto", "Personas") do que só importa fora do playbook ("Cenário (sem playbook)", "Rubricas (sem playbook)") — assim quem usa playbook não persegue lacuna que as etapas já resolvem.

REGRAS:
- SEJA COMPLETO E FIEL ao lado do comprador no material. Preserve o detalhe que o cliente preparou sobre ele; transcreva falas, exemplos e instruções de comportamento do comprador em vez de resumir. NÃO comprima esse conteúdo — é melhor um bloco longo e fiel do que um resumo curto. Isso não vale para o lado do vendedor (ver QUEM LÊ ISTO É O COMPRADOR).
- Priorize dados reais extraídos do material. Quando precisar inferir algo qualitativo, marque o trecho com "(Hipótese Assumida)". Nunca infira números nem datas.
- DATAS: a data de hoje vem no fim destas instruções. Prazo, condição comercial, campanha ou evento do material com data já passada NÃO é fato vigente — omita, ou reescreva sem a data. Não invente datas absolutas; quando precisar situar algo no tempo, use termos relativos ("no próximo trimestre", "há dois meses").
- VALORES: preços, orçamentos, percentuais e quantidades só quando estiverem no material, e sempre os mesmos em todos os campos. Os campos são gerados em partes que não se veem — um número inventado num campo vai contradizer outro.
- B2B ou B2C: infira da oferta e NUNCA assuma B2B por padrão. Um curso vendido a interessados individuais tem como público-alvo a PESSOA FÍSICA que quer se qualificar, não a instituição que oferece o curso. Linguagem e exemplos seguem o que a oferta realmente vende.
- Responda SEMPRE no formato estruturado pedido (JSON).`;

export default function CriacaoPage() {
  const router = useRouter();
  const [tab, setTab] = useState("texto");
  const [text, setText] = useState("");
  const [offerName, setOfferName] = useState("");
  /** Descrição da oferta gerada pela IA — sem ela, o envio cai no material cru. */
  const [offerDescription, setOfferDescription] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [callContexts, setCallContexts] = useState<CallContextType[]>([]);
  const [callContextSlug, setCallContextSlug] = useState<string>("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("methodology");
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [playbookId, setPlaybookId] = useState<string>("");
  const [playbookCallTypes, setPlaybookCallTypes] = useState<PlaybookCallType[]>([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(false);
  const [personaCount, setPersonaCount] = useState<string>("1");
  const [personaInstructions, setPersonaInstructions] = useState("");
  /** PlaybookCallType.id das etapas travadas na persona principal. */
  const [fixedCallTypeIds, setFixedCallTypeIds] = useState<Set<number>>(new Set());
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [perfil, setPerfil] = useState("");
  const [cenarioInstrucoes, setCenarioInstrucoes] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [habilidades, setHabilidades] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [gaps, setGaps] = useState<ImportGap[]>([]);
  /** Objeções/guardrails extraídos do material — vão para o contexto na Perfecting. */
  const [objections, setObjections] = useState<ObjectionSeed[]>([]);
  const [guardrails, setGuardrails] = useState<GuardrailSeed[]>([]);
  const [aiProcessed, setAiProcessed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [extractMsg, setExtractMsg] = useState("Extraindo texto…");
  const savedPromptSnapshot = useSyncExternalStore(
    subscribeSavedPrompt,
    readSavedPrompt,
    () => '["",""]',
  );
  const [customPrompt, savedPromptVersion] = JSON.parse(savedPromptSnapshot) as [string, string];
  /** Prompt salvo veio de uma versão anterior do padrão — vale avisar. */
  const promptOutdated = Boolean(customPrompt) && Number(savedPromptVersion || "1") < PROMPT_VERSION;
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendStatus, setSendStatus] = useState<SendStatus>("sending");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentDraftId, setSentDraftId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Assinatura do formulário no momento em que o rascunho foi criado. Se o
  // formulário mudar, o próximo envio cria um novo rascunho (evita reenviar
  // dados obsoletos); "Tentar novamente" sem edição reusa o mesmo (sem duplicar).
  const draftSigRef = useRef<string | null>(null);

  const isPlaybookMode = generationMode === "playbook";
  const selectedPlaybook = playbooks.find((p) => String(p.id) === playbookId) ?? null;

  /** Trocar de conta invalida os playbooks carregados (são por organização). */
  function handleConnectionChange(id: string) {
    setConnectionId(id);
    setPlaybooks([]);
    setPlaybookId("");
    setPlaybookCallTypes([]);
    setGenerationMode("methodology");
    setPersonaCount("1");
    setFixedCallTypeIds(new Set());
    // personaInstructions NÃO é resetado: ele descreve a variação de personas extraída
    // do MATERIAL (a IA preenche em handleProcess), não algo preso à conta/playbook.
    setLoadingPlaybooks(Boolean(id));
  }

  /** Edita um campo de uma objeção extraída, preservando as demais. */
  function updateObjection(index: number, patch: Partial<ObjectionSeed>) {
    setObjections((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  /** Marca/desmarca uma etapa como "persona fixa". */
  function toggleFixedCallType(callTypeId: number) {
    setFixedCallTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(callTypeId)) next.delete(callTypeId);
      else next.add(callTypeId);
      return next;
    });
  }

  useEffect(() => {
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

  // Playbook é por organização: só dá para listar depois de escolher o destino.
  useEffect(() => {
    if (!connectionId) return;
    let active = true;
    listPlaybooks(connectionId)
      .then((items) => {
        if (!active) return;
        setPlaybooks(items);
        if (items.length === 1) setPlaybookId(String(items[0].id));
      })
      .catch(() => {
        if (!active) return;
        addToast({
          title: "Não foi possível listar os playbooks desta conta",
          description: "A criação por metodologia segue disponível.",
          color: "warning",
        });
      })
      .finally(() => {
        if (active) setLoadingPlaybooks(false);
      });
    return () => {
      active = false;
    };
  }, [connectionId]);

  // As etapas do playbook são os roleplays que serão criados — mostradas antes do envio.
  useEffect(() => {
    if (!connectionId || !playbookId) return;
    let active = true;
    listPlaybookCallTypes(connectionId, Number(playbookId))
      .then((items) => {
        if (active) setPlaybookCallTypes(items);
      })
      .catch(() => {
        /* sem as etapas o envio ainda funciona — some só o preview */
      });
    return () => {
      active = false;
    };
  }, [connectionId, playbookId]);

  // Envio concluído com sucesso → mostra o estado por ~1,2s e vai à Biblioteca.
  useEffect(() => {
    if (sendStatus !== "success") return;
    const t = setTimeout(() => router.push("/biblioteca"), 1200);
    return () => clearTimeout(t);
  }, [sendStatus, router]);

  const isSupported = (f: File) =>
    /\.(pdf|docx|md|markdown)$/i.test(f.name) ||
    f.type.includes("pdf") ||
    f.type.includes("word") ||
    f.type.includes("officedocument") ||
    f.type.includes("markdown");

  /** Extrai o texto de 1+ arquivos e junta tudo (vários arquivos = um material). */
  async function ingestFiles(files: File[]) {
    const supported = files.filter(isSupported);
    const rejected = files.length - supported.length;
    if (supported.length === 0) {
      addToast({ title: "Formato não suportado", description: "Envie PDF, DOCX ou Markdown (.md).", color: "warning" });
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
    setFilePath(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Limpa o formulário inteiro para começar um novo roleplay do zero. */
  function clearAll() {
    setText("");
    setOfferName("");
    setOfferDescription("");
    handleConnectionChange("");
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
      const r = await processImport(text.trim(), customPrompt || null, generationMode);
      const fill = (cur: string, next: string) => (keep && cur.trim() ? cur : next || cur);
      // O material cru em "Dados para o Roleplay" fica salvo como fonte, mas não vai
      // para a Perfecting: ele mistura o lado do vendedor (método, CRM, roteiro), e o
      // que chega lá vira conhecimento do comprador. A IA preenche os blocos + lacunas.
      setOfferDescription((c) => fill(c, r.oferta_descricao || ""));
      setPerfil((c) => fill(c, r.perfil || ""));
      // Sugestão de variação das personas — só tem efeito no modo playbook com 2+.
      setPersonaInstructions((c) => fill(c, r.personas_variacao || ""));
      setCenarioInstrucoes((c) => fill(c, r.cenario_instrucoes || ""));
      setObjetivo((c) => fill(c, r.objetivo || ""));
      setHabilidades((c) => fill(c, r.habilidades || ""));
      setOfferName((c) => fill(c, r.oferta_nome || ""));
      setCallContextSlug((c) => (keep && c ? c : r.call_context_slug || c));
      if (!keep && r.dificuldade) setDifficulty(r.dificuldade);
      setGaps(r.lacunas ?? []);
      // Só substitui em "reset": em "merge" o que já foi revisado à mão permanece.
      if (!keep || objections.length === 0) setObjections(r.objecoes ?? []);
      if (!keep || guardrails.length === 0) setGuardrails(r.guardrails ?? []);
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
    try {
      if (isCustom) {
        localStorage.setItem(PROMPT_STORAGE_KEY, v);
        // Salvou agora: fica na versão atual do padrão (tira o aviso de desatualizado).
        localStorage.setItem(PROMPT_VERSION_KEY, String(PROMPT_VERSION));
      } else {
        localStorage.removeItem(PROMPT_STORAGE_KEY);
        localStorage.removeItem(PROMPT_VERSION_KEY);
      }
      window.dispatchEvent(new Event(PROMPT_CHANGE_EVENT));
    } catch {
      addToast({
        title: "Não foi possível salvar o prompt",
        description: "O armazenamento do navegador está indisponível.",
        color: "danger",
      });
      return;
    }
    setPromptModalOpen(false);
    addToast({
      title: isCustom ? "Prompt personalizado salvo" : "Prompt padrão restaurado",
      color: "success",
    });
  }

  /** Valida os campos obrigatórios do rascunho; mostra toast e retorna false se inválido. */
  function validateInputs(): boolean {
    if (!text.trim() || !offerName.trim()) {
      addToast({ title: "Preencha o texto e o nome da oferta", color: "warning" });
      return false;
    }
    // No modo playbook o tipo de chamada vem de cada etapa — o que é obrigatório
    // é a conta de destino (dona do playbook) e o playbook escolhido.
    if (isPlaybookMode) {
      if (!connectionId) {
        addToast({ title: "Selecione uma conta de destino", color: "warning" });
        return false;
      }
      if (!playbookId) {
        addToast({ title: "Escolha o playbook", color: "warning" });
        return false;
      }
      return true;
    }
    if (!callContextSlug) {
      addToast({ title: "Escolha o tipo de chamada", color: "warning" });
      return false;
    }
    return true;
  }

  /** Monta o payload do rascunho a partir do formulário atual. */
  function buildDraftPayload() {
    return {
      text: text.trim(),
      offerName: offerName.trim(),
      offerDescription: offerDescription.trim() || null,
      sourceType: (tab === "arquivo" ? "file" : "paste") as "file" | "paste",
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
        generation_mode: generationMode,
        playbook_id: isPlaybookMode ? Number(playbookId) : null,
        playbook_name: isPlaybookMode ? (selectedPlaybook?.name ?? null) : null,
        persona_count: isPlaybookMode ? Number(personaCount) : null,
        persona_instructions: isPlaybookMode ? personaInstructions.trim() || null : null,
        // Com 1 persona não há o que travar — zera para o rascunho não guardar
        // intenção incoerente se o usuário marcar etapas e depois voltar para 1.
        fixed_persona_call_type_ids:
          isPlaybookMode && Number(personaCount) > 1 ? Array.from(fixedCallTypeIds) : null,
        // Context-wide: valem nos dois modos, por isso sem condicional de modo.
        objections: objections.length > 0 ? objections : null,
        guardrails: guardrails.length > 0 ? guardrails : null,
      },
    };
  }

  async function handleSave() {
    if (!validateInputs()) return;
    setSaving(true);
    try {
      await createDraftFromText(buildDraftPayload());
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

  /** Extrai uma mensagem legível do erro retornado pela Edge Function de export. */
  function formatExportError(error: unknown): string | null {
    if (error == null) return null;
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      const e = error as { detail?: unknown; message?: unknown };
      if (typeof e.detail === "string") return e.detail;
      if (typeof e.message === "string") return e.message;
      try {
        return JSON.stringify(e.detail ?? e.message ?? error);
      } catch {
        return String(error);
      }
    }
    return String(error);
  }

  /** Salva o rascunho (se ainda não salvo) e dispara o envio para a conta de destino. */
  async function runSend() {
    setSendStatus("sending");
    setSendError(null);
    try {
      const payload = buildDraftPayload();
      const sig = JSON.stringify(payload);
      let draftId = sentDraftId;
      if (!draftId || draftSigRef.current !== sig) {
        const res = await createDraftFromText(payload);
        draftId = res.draftId;
        setSentDraftId(draftId);
        draftSigRef.current = sig;
      }
      // Playbook: job longo (1 roleplay por etapa). A função responde 202 assim
      // que inicia; o progresso é acompanhado na Biblioteca.
      if (isPlaybookMode) {
        await invokeExportPlaybook(draftId);
        setSendStatus("success");
        return;
      }
      const data = await invokeExport([draftId]);
      const result = data?.results?.[0];
      if (!data?.ok || !result?.ok) {
        throw new Error(formatExportError(result?.error) ?? "Falha ao enviar para o destino");
      }
      setSendStatus("success");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
      setSendStatus("error");
    }
  }

  async function handleSendToDestination() {
    if (!validateInputs()) return;
    if (!connectionId) {
      addToast({ title: "Selecione uma conta de destino", color: "warning" });
      return;
    }
    // Playbook cria vários roleplays de uma vez na conta do cliente — confirma antes.
    if (isPlaybookMode) {
      const total = playbookCallTypes.length;
      const personas = Number(personaCount) || 1;
      setConfirm({
        title: total
          ? `Criar ${total} roleplay(s)${personas > 1 ? ` e ${personas} personas` : ""} nesta conta?`
          : "Iniciar a implementação?",
        message: (
          <>
            A Perfecting vai criar <b>um roleplay por etapa</b> do playbook{" "}
            <b>{selectedPlaybook?.name ?? ""}</b>
            {total ? ` (${total} no total)` : ""}, usando a oferta e o contexto extraídos do
            material.{" "}
            {personas > 1 ? (
              <>
                Serão criadas <b>{personas} personas</b> nesse contexto — as etapas aceitam
                qualquer uma delas, e quem escolhe é o vendedor, na hora da call.
                {fixedCallTypeIds.size > 0 && (
                  <>
                    {" "}
                    <b>
                      {fixedCallTypeIds.size}{" "}
                      {fixedCallTypeIds.size === 1 ? "etapa" : "etapas"}
                    </b>{" "}
                    {fixedCallTypeIds.size === 1 ? "fica" : "ficam"} travada
                    {fixedCallTypeIds.size === 1 ? "" : "s"} na persona principal.
                  </>
                )}
              </>
            ) : (
              <>A persona também é extraída do material.</>
            )}{" "}
            {objections.length > 0 && (
              <>
                As <b>{objections.length} objeções</b> revisadas acima entram no contexto e valem
                para todas as etapas.{" "}
              </>
            )}
            Leva alguns minutos — dá para acompanhar na Biblioteca.
          </>
        ),
        confirmLabel: "Criar roleplays",
        onConfirm: async () => {
          setSendModalOpen(true);
          await runSend();
        },
      });
      return;
    }
    setSendModalOpen(true);
    await runSend();
  }

  return (
    <div className="flex flex-col gap-0">
      <PageHeader
        title="Criação express de roleplay"
        description="Tenha a criação de um roleplay em segundos."
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
              accept=".pdf,.docx,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown"
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
                    : "Arraste PDFs/DOCX/MD aqui (vários de uma vez), ou clique para selecionar"}
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
          placeholder="Insira todas as informações de oferta, cenário, perfil do comprador e demais informações relevantes para o roleplay."
          disableAutosize
          value={text}
          onValueChange={setText}
          radius="sm"
          variant="bordered"
          classNames={{ input: "h-72 overflow-y-auto resize-y" }}
        />

        <div className="flex flex-col items-end gap-2 -mt-5 sm:flex-row sm:items-center sm:justify-end">
          <p className="flex items-center gap-1.5 text-xs text-slate-500 sm:mr-auto">
            <span>
              {isPlaybookMode
                ? "A IA estrutura o material: oferta, perfil do público (base das personas), objeções e regras. Cenário e rubricas são pulados — vêm das etapas do playbook."
                : "A IA estrutura o material: oferta, perfil do público (base das personas), objeções, cenário e rubricas."}
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
              <span
                className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${
                  promptOutdated ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                }`}
                title={
                  promptOutdated
                    ? "O prompt padrão foi atualizado. O seu continua valendo — abra o editor e use 'Restaurar padrão' para adotar a versão nova."
                    : undefined
                }
              >
                {promptOutdated ? "prompt personalizado (padrão atualizado)" : "prompt personalizado"}
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

        {(objections.length > 0 || guardrails.length > 0) && (
          <div className="flex flex-col gap-3 rounded-sm border border-slate-200 p-4">
            <div>
              <p className="text-sm font-medium text-slate-700">
                Objeções e regras do comprador
              </p>
              <p className="text-xs text-slate-500">
                {isPlaybookMode ? (
                  <>
                    As objeções vão só para as etapas em que o comprador as levantaria (a IA
                    encaixa no envio); as regras valem para <b>todas</b> as etapas.
                  </>
                ) : (
                  <>
                    Vão para o contexto na Perfecting e valem para <b>todo</b> o roleplay.
                  </>
                )}{" "}
                Revise antes de enviar: é conteúdo que vai direto para a conta do cliente.
              </p>
            </div>

            {objections.map((o, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-sm bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Título da objeção ${i + 1}`}
                    value={o.titulo}
                    onValueChange={(v) => updateObjection(i, { titulo: v })}
                    radius="sm"
                    variant="bordered"
                    size="sm"
                    classNames={{ inputWrapper: "bg-white" }}
                  />
                  <span className="shrink-0 rounded-sm bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {o.tipo}
                  </span>
                  <button
                    type="button"
                    onClick={() => setObjections((prev) => prev.filter((_, j) => j !== i))}
                    title="Remover objeção"
                    aria-label="Remover objeção"
                    className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
                <Textarea
                  label="Como o comprador diz"
                  labelPlacement="outside"
                  value={o.fala_exemplo}
                  onValueChange={(v) => updateObjection(i, { fala_exemplo: v })}
                  radius="sm"
                  variant="bordered"
                  minRows={2}
                  classNames={{ inputWrapper: "bg-white" }}
                />
                <Textarea
                  label="Ceda se"
                  labelPlacement="outside"
                  value={o.ceder_se}
                  onValueChange={(v) => updateObjection(i, { ceder_se: v })}
                  radius="sm"
                  variant="bordered"
                  minRows={2}
                  description="Sem isto o comprador repete a objeção até o fim e o treino não fecha."
                  classNames={{ inputWrapper: "bg-white" }}
                />
              </div>
            ))}

            {guardrails.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-slate-700">
                  Regras de comportamento ({guardrails.length})
                </p>
                {guardrails.map((g, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Textarea
                      aria-label={`Regra ${i + 1}: ${g.nome}`}
                      label={g.nome}
                      labelPlacement="outside"
                      value={g.instrucao}
                      onValueChange={(v) =>
                        setGuardrails((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, instrucao: v } : x)),
                        )
                      }
                      radius="sm"
                      variant="bordered"
                      minRows={2}
                    />
                    <button
                      type="button"
                      onClick={() => setGuardrails((prev) => prev.filter((_, j) => j !== i))}
                      title="Remover regra"
                      aria-label="Remover regra"
                      className="mt-6 shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
            label="Descrição da oferta"
            labelPlacement="outside"
            placeholder="O que é vendido, para quem, diferenciais, preço e condições vigentes…"
            disableAutosize
            value={offerDescription}
            onValueChange={setOfferDescription}
            radius="sm"
            variant="bordered"
            description="Vai para a Perfecting no lugar do material cru. Deixe só o que o comprador pode saber da oferta — nada de método, roteiro ou CRM."
            classNames={{ input: "h-40 overflow-y-auto resize-y" }}
          />
        )}

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

        {/* Antes do modo: playbook é por organização, então depende do destino. */}
        <Select
          label={isPlaybookMode ? "Conta de destino" : "Conta de destino (opcional)"}
          labelPlacement="outside-top"
          placeholder="Definir depois, no envio"
          selectedKeys={connectionId ? [connectionId] : []}
          onSelectionChange={(keys) => handleConnectionChange(String(Array.from(keys)[0] ?? ""))}
          radius="sm"
          variant="bordered"
          classNames={managerSelectClassNames}
          description={
            loadingPlaybooks
              ? "Verificando se esta conta tem playbook…"
              : connectionId && playbooks.length === 0
                ? "Esta conta não tem playbook — a criação segue por metodologia."
                : undefined
          }
        >
          {connections.map((c) => (
            <SelectItem key={c.id} textValue={`${c.org_name ?? `Org ${c.org_id}`} (${c.environment})`}>
              {c.org_name ?? `Org ${c.org_id}`} ({c.environment})
            </SelectItem>
          ))}
        </Select>

        {playbooks.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">Como gerar o roleplay</p>
            <Tabs
              selectedKey={generationMode}
              onSelectionChange={(k) => setGenerationMode(String(k) as GenerationMode)}
              radius="sm"
              variant="bordered"
              classNames={{ tabList: "rounded-sm", tab: "rounded-sm" }}
            >
              <Tab key="methodology" title="Por metodologia" />
              <Tab key="playbook" title="Pelo playbook da conta" />
            </Tabs>
          </div>
        )}

        {isPlaybookMode ? (
          <div className="flex flex-col gap-3">
            <Select
              label="Playbook"
              labelPlacement="outside"
              placeholder="Escolha o playbook"
              selectedKeys={playbookId ? [playbookId] : []}
              onSelectionChange={(keys) => {
                setPlaybookCallTypes([]);
                setFixedCallTypeIds(new Set()); // etapas são outras: marcações não valem mais
                setPlaybookId(String(Array.from(keys)[0] ?? ""));
              }}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
              isRequired
            >
              {playbooks.map((p) => (
                <SelectItem key={String(p.id)} textValue={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </Select>
            <div className="flex flex-col gap-2 rounded-sm border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">
                {playbookCallTypes.length > 0
                  ? `Serão criados ${playbookCallTypes.length} roleplay(s) — um por etapa do playbook`
                  : "A jornada do playbook vira um roleplay por etapa"}
              </p>
              {playbookCallTypes.length > 0 && (
                <ol className="flex flex-col gap-1 text-sm text-slate-600">
                  {playbookCallTypes.map((ct, i) => (
                    <li key={ct.id} className="flex items-center justify-between gap-3">
                      <span>
                        <span className="text-slate-400">{i + 1}.</span> {ct.name}
                      </span>
                      {Number(personaCount) > 1 && (
                        <Checkbox
                          size="sm"
                          isSelected={fixedCallTypeIds.has(ct.id)}
                          onValueChange={() => toggleFixedCallType(ct.id)}
                          classNames={{ label: "text-xs text-slate-500" }}
                        >
                          persona fixa
                        </Checkbox>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-xs text-slate-500">
                O tipo de chamada, as rubricas e o comportamento vêm de cada etapa do playbook. O
                material acima é usado para a oferta e o contexto.
              </p>
              {Number(personaCount) > 1 && (
                <p className="text-xs text-slate-500">
                  Etapas sem marcação aceitam <b>qualquer uma das {personaCount} personas</b> — a
                  escolha acontece na hora da call. As marcadas ficam travadas na persona principal
                  (a primeira do contexto). Qual persona fica em cada etapa é ajustável depois, na
                  Perfecting.
                </p>
              )}
            </div>
            <Select
              label="Quantas personas?"
              labelPlacement="outside-top"
              selectedKeys={[personaCount]}
              onSelectionChange={(keys) => setPersonaCount(String(Array.from(keys)[0] ?? "1"))}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
              description={
                Number(personaCount) > 1
                  ? "O vendedor escolhe qual persona enfrentar na hora da call."
                  : "Uma persona só, travada em todas as etapas — comportamento de sempre."
              }
            >
              {PERSONA_COUNTS.map((n) => (
                <SelectItem key={n} textValue={n}>
                  {n}
                </SelectItem>
              ))}
            </Select>
            {Number(personaCount) > 1 && (
              <Textarea
                label="Instruções para as personas (opcional)"
                labelPlacement="outside"
                placeholder="Ex.: metade das personas mais cética, metade mais colaborativa"
                value={personaInstructions}
                onValueChange={setPersonaInstructions}
                radius="sm"
                variant="bordered"
                minRows={2}
              />
            )}
          </div>
        ) : (
          <>
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
          </>
        )}

        {aiProcessed && !isPlaybookMode && (
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

        <div className="flex justify-end gap-2">
          <Button
            variant="link"
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
            variant="secondary"
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
          <Button
            onPress={handleSendToDestination}
            isDisabled={
              !connectionId ||
              extracting ||
              saving ||
              processing ||
              (sendModalOpen && sendStatus === "sending")
            }
          >
            Enviar para destino
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
            {promptOutdated && (
              <p className="rounded-sm bg-amber-50 px-3 py-2 text-sm text-amber-800">
                O prompt padrão foi atualizado desde que você personalizou o seu — agora ele cobre o
                modo playbook, as dimensões que a Perfecting espera do contexto e a variação de
                personas. O seu texto continua valendo; para adotar o novo, use{" "}
                <b>Restaurar padrão</b> abaixo.
              </p>
            )}
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

      <SendStatusModal
        open={sendModalOpen}
        status={sendStatus}
        errorMessage={sendError}
        onRetry={runSend}
        onClose={() => setSendModalOpen(false)}
        {...(isPlaybookMode && {
          sendingLabel: "Iniciando a implementação do playbook…",
          successTitle: "Implementação iniciada!",
          successHint: "Acompanhe o progresso na Biblioteca…",
        })}
      />
    </div>
  );
}
