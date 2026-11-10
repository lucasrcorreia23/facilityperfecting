/**
 * Checagem de coerência entre o rascunho da Criação e o playbook da conta, antes
 * de implementar no modo playbook.
 *
 * Por que existe: na implementação o backend combina duas fontes que ninguém
 * compara. O comprador simulado age pelo RASCUNHO (oferta, perfil, personas,
 * objeções e regras — muitas vezes corrigido à mão com o que os documentos não
 * diziam); a nota cobra pelas rubricas geradas das SUBETAPAS do playbook, feito
 * dos documentos originais. Se as duas se contradizem, o representante é avaliado
 * contra algo que o comprador nega.
 *
 * Aqui mora só a parte pura: o que entra de cada lado (com corte de entradas
 * grandes), o prompt, o schema da resposta, a validação/ordenação e a assinatura
 * usada para não checar duas vezes a mesma coisa.
 *
 * Sem imports de propósito: o front importa este arquivo, e o TypeScript do Next
 * não aceita caminho terminado em ".ts" (o Deno exige). Mesma regra do
 * generation-diff.ts — a lista de campos é conferida contra ele em teste.
 */

// ── Rascunho ───────────────────────────────────────────────────────────────

export type CoherenceDraftField =
  | "oferta_nome"
  | "oferta_descricao"
  | "perfil"
  | "personas_variacao"
  | "objecoes"
  | "guardrails";

/**
 * Só o que chega à conta no modo playbook, na ordem da tela. Espelha os campos
 * com `modes: ["playbook"]` do FIELDS de generation-diff.ts.
 */
export const COHERENCE_DRAFT_FIELDS: Array<{ key: CoherenceDraftField; label: string }> = [
  { key: "oferta_nome", label: "Nome da oferta" },
  { key: "oferta_descricao", label: "Descrição da oferta" },
  { key: "perfil", label: "Perfil do público" },
  { key: "personas_variacao", label: "Variação das personas" },
  { key: "objecoes", label: "Objeções" },
  { key: "guardrails", label: "Regras" },
];

const FIELD_LABEL = new Map(COHERENCE_DRAFT_FIELDS.map((f) => [f.key, f.label]));
export const coherenceFieldLabel = (key: CoherenceDraftField) => FIELD_LABEL.get(key) ?? key;

type Seed = Record<string, unknown>;

/** O rascunho como vai para a conta — um SentSnapshot (generation-diff.ts) serve. */
export interface CoherenceDraftInput {
  oferta_nome: string;
  oferta_descricao: string;
  perfil: string;
  personas_variacao: string;
  objecoes: Seed[];
  guardrails: Seed[];
}

// ── Playbook ───────────────────────────────────────────────────────────────

export interface CoherenceBlockInput {
  id: number;
  name: string;
  description?: string | null;
  objective?: string | null;
  sample_questions?: string[];
  what_to_do?: string[];
  what_to_avoid?: string[];
  order?: number | null;
  parent_call_block_id?: number | null;
}

export interface CoherenceCallTypeInput {
  id: number;
  name: string;
  description?: string | null;
  order?: number | null;
  blocks: CoherenceBlockInput[];
}

export interface CoherencePlaybookInput {
  name: string;
  callTypes: CoherenceCallTypeInput[];
}

// ── Limites ────────────────────────────────────────────────────────────────

/**
 * Tetos de entrada. Descrição e perfil seguem o corte que o envio já aplica
 * (MAX_API_TEXT_CHARS = 12.000 em perfecting.ts): o que passa disso nem chega à
 * conta. Sem descrição própria, a "descrição" é o material inteiro.
 */
export const COHERENCE_LIMITS = {
  offerName: 300,
  longText: 12_000,
  personas: 3_000,
  listItems: 40,
  listItemField: 800,
  blockText: 1_200,
  blockListItems: 12,
  blockListItem: 400,
  /** Soma de todas as etapas e subetapas renderizadas. */
  playbookTotal: 80_000,
  /** Quantas divergências a tela mostra. */
  maxDivergences: 10,
  quote: 240,
  sentence: 400,
} as const;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : [];

/** Corta no limite e diz que cortou — a IA não deve tratar o fim como lacuna. */
function clip(text: string, max: number, onCut: () => void): string {
  if (text.length <= max) return text;
  onCut();
  return `${text.slice(0, max).trim()} […cortado: o original tem ${text.length} caracteres]`;
}

const byOrder = <T extends { order?: number | null; id: number }>(a: T, b: T) =>
  (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;

export interface CoherencePayload {
  /** Mensagem de usuário para a IA: rascunho e playbook lado a lado. */
  text: string;
  /** O que foi cortado para caber, em português, para a tela avisar. */
  truncated: string[];
  stats: { callTypes: number; blocks: number; objections: number; guardrails: number };
}

function renderDraft(draft: CoherenceDraftInput, cut: (what: string) => void): string {
  const L = COHERENCE_LIMITS;
  const out: string[] = ["# RASCUNHO — o que o comprador simulado vai seguir"];
  const section = (key: CoherenceDraftField, body: string) =>
    out.push(`## ${coherenceFieldLabel(key)} [campo: ${key}]\n${body || "(vazio)"}`);

  const text = (key: CoherenceDraftField, value: unknown, max: number) =>
    section(key, clip(str(value), max, () => cut(coherenceFieldLabel(key))));

  text("oferta_nome", draft.oferta_nome, L.offerName);
  text("oferta_descricao", draft.oferta_descricao, L.longText);
  text("perfil", draft.perfil, L.longText);
  text("personas_variacao", draft.personas_variacao, L.personas);

  const field = (label: string, value: unknown, what: string) => {
    const v = clip(str(value), L.listItemField, () => cut(what));
    return v ? `   ${label}: ${v}` : null;
  };
  const items = <T,>(xs: T[], what: string) => {
    if (xs.length > L.listItems) cut(`${what} (só as ${L.listItems} primeiras de ${xs.length})`);
    return xs.slice(0, L.listItems);
  };

  const objections = Array.isArray(draft.objecoes) ? draft.objecoes : [];
  section(
    "objecoes",
    items(objections, "Objeções")
      .map((o, i) =>
        [
          `${i + 1}. ${str(o.titulo) || "(sem título)"}${str(o.tipo) ? ` (tipo: ${str(o.tipo)})` : ""}`,
          field("Fala do comprador", o.fala_exemplo, "Objeções"),
          field("Detalhes", o.detalhes, "Objeções"),
          field("O comprador cede se", o.ceder_se, "Objeções"),
        ].filter(Boolean).join("\n")
      )
      .join("\n"),
  );

  const guardrails = Array.isArray(draft.guardrails) ? draft.guardrails : [];
  section(
    "guardrails",
    items(guardrails, "Regras")
      .map((g, i) =>
        [`${i + 1}. ${str(g.nome) || "(sem nome)"}`, field("Instrução", g.instrucao, "Regras")]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n"),
  );

  return out.join("\n\n");
}

function renderBlock(
  block: CoherenceBlockInput,
  index: string,
  parentName: string | null,
  cut: () => void,
): string {
  const L = COHERENCE_LIMITS;
  const lines = [`### Subetapa ${index}: ${str(block.name) || `Bloco ${block.id}`}${parentName ? ` (dentro de "${parentName}")` : ""}`];
  const text = (label: string, value: unknown) => {
    const v = clip(str(value), L.blockText, cut);
    if (v) lines.push(`${label}: ${v}`);
  };
  const list = (label: string, value: unknown) => {
    const all = strList(value);
    if (all.length === 0) return;
    if (all.length > L.blockListItems) cut();
    lines.push(
      `${label}:\n${all.slice(0, L.blockListItems).map((x) => `- ${clip(x, L.blockListItem, cut)}`).join("\n")}`,
    );
  };
  text("Descrição", block.description);
  text("Objetivo", block.objective);
  list("Perguntas de exemplo", block.sample_questions);
  list("O que fazer", block.what_to_do);
  list("O que evitar", block.what_to_avoid);
  return lines.join("\n");
}

function renderPlaybook(playbook: CoherencePlaybookInput, cut: (what: string) => void): string {
  const L = COHERENCE_LIMITS;
  const out: string[] = [
    `# PLAYBOOK "${str(playbook.name) || "sem nome"}" — o que a nota cobra do representante`,
  ];
  let used = 0;
  let overBudget = false;
  const callTypes = [...playbook.callTypes].sort(byOrder);
  callTypes.forEach((ct, i) => {
    const name = str(ct.name) || `Etapa ${ct.id}`;
    const cutHere = () => cut(`Etapa "${name}"`);
    const description = clip(str(ct.description), L.blockText, cutHere);
    out.push(`## Etapa ${i + 1}: ${name}${description ? `\n${description}` : ""}`);
    const blocks = [...(ct.blocks ?? [])].sort(byOrder);
    const names = new Map(blocks.map((b) => [b.id, str(b.name)]));
    if (blocks.length === 0) out.push("(etapa sem subetapas — a nota desta etapa não tem rubricas de subetapa)");
    blocks.forEach((b, j) => {
      const index = `${i + 1}.${j + 1}`;
      const parent = b.parent_call_block_id != null ? names.get(b.parent_call_block_id) || null : null;
      if (overBudget) {
        // Depois do teto fica só o nome: a IA ainda sabe que a subetapa existe.
        out.push(`### Subetapa ${index}: ${str(b.name) || `Bloco ${b.id}`} (detalhe omitido por limite de tamanho)`);
        return;
      }
      const rendered = renderBlock(b, index, parent, cutHere);
      used += rendered.length;
      out.push(rendered);
      if (used > L.playbookTotal) {
        overBudget = true;
        cut("Playbook (subetapas do fim só com o nome)");
      }
    });
  });
  return out.join("\n\n");
}

/** O que a IA recebe: só os campos que chegam à conta, e o playbook inteiro. */
export function buildCoherencePayload(
  draft: CoherenceDraftInput,
  playbook: CoherencePlaybookInput,
): CoherencePayload {
  const truncated: string[] = [];
  const cut = (what: string) => {
    if (!truncated.includes(what)) truncated.push(what);
  };
  const text = [renderDraft(draft, cut), renderPlaybook(playbook, cut)].join("\n\n────────\n\n");
  return {
    text,
    truncated,
    stats: {
      callTypes: playbook.callTypes.length,
      blocks: playbook.callTypes.reduce((n, ct) => n + (ct.blocks?.length ?? 0), 0),
      objections: Array.isArray(draft.objecoes) ? draft.objecoes.length : 0,
      guardrails: Array.isArray(draft.guardrails) ? draft.guardrails.length : 0,
    },
  };
}

// ── Prompt e schema ────────────────────────────────────────────────────────

export const COHERENCE_SYSTEM = `Você revisa a coerência entre duas fontes que vão alimentar roleplays de treino de vendas na Perfecting, antes de eles serem criados.

AS DUAS FONTES
- RASCUNHO: oferta, perfil do público, variação das personas, objeções e regras. É o que o COMPRADOR simulado vai seguir na chamada. Foi gerado por IA a partir do material do cliente e depois corrigido à mão — pode trazer coisas que os documentos originais não diziam.
- PLAYBOOK: etapas e subetapas (objetivo, perguntas de exemplo, o que fazer, o que evitar). É de onde saem as rubricas, ou seja, o que a NOTA cobra do representante. Foi gerado a partir dos documentos originais.

O RISCO QUE VOCÊ PROCURA
O representante ser avaliado contra algo que o comprador contradiz ou torna impossível de cumprir.

O QUE É DIVERGÊNCIA
- "conflito": as duas fontes falam do MESMO assunto e dizem coisas incompatíveis. Exemplos: preço, prazo ou condição comercial diferente; produto ou escopo diferente; sequência do processo de venda diferente; resposta esperada a uma objeção diferente da condição em que o comprador cede; uma regra do rascunho que proíbe o comprador de fazer o que a subetapa exige que aconteça.
- "atencao": uma fonte traz algo que a outra não cobre, E essa lacuna pode desalinhar a nota. Exemplos: a subetapa cobra que o representante trate um tema que o rascunho não dá ao comprador nenhuma base para responder; o rascunho tem uma objeção central que nenhuma subetapa prepara o representante para tratar.

O QUE NÃO É DIVERGÊNCIA — não liste
- Diferença de redação, de nível de detalhe, de tom ou de ordem do texto.
- Informação que só uma fonte traz e que não muda o que a nota cobra.
- O playbook ser genérico e o rascunho específico (ou o contrário) sem contradição.
- Assuntos diferentes que apenas se parecem. Na dúvida se é o mesmo assunto, não liste.
- Trecho marcado como "[…cortado…]" ou "detalhe omitido": o texto foi encurtado para caber, não é lacuna.

COMO RESPONDER
- No máximo 10 itens, os mais graves primeiro: todos os "conflito" antes dos "atencao". Se houver mais, fique com os que mais afetam a nota.
- Não repita a mesma divergência em itens diferentes; se ela aparece em várias subetapas, cite a mais clara.
- rascunho_campo: a chave do campo do rascunho, exatamente como aparece em "[campo: …]".
- rascunho_trecho e playbook_trecho: citação LITERAL e curta (até 200 caracteres) do trecho que sustenta a divergência. Quando a divergência é a ausência do assunto numa fonte, deixe o trecho dessa fonte vazio.
- playbook_etapa e playbook_subetapa: os nomes como aparecem no playbook, sem a numeração. Se a divergência é com a etapa inteira, deixe playbook_subetapa vazio.
- explicacao: UMA frase dizendo o que é incompatível e por que isso afeta a avaliação.
- corrigir_em: "rascunho" se o mais provável é o rascunho estar errado ou incompleto; "playbook" se o rascunho traz a informação mais recente ou correta e o playbook precisa acompanhar.
- sugestao: UMA frase dizendo o que ajustar e onde.
- Sem divergência real, devolva a lista vazia. Lista vazia é uma resposta correta e esperada — não invente itens.
- Tudo em português do Brasil.`;

export type CoherenceSeverity = "conflito" | "atencao";
export type CoherenceFixTarget = "rascunho" | "playbook";

export const COHERENCE_SEVERITY_LABEL: Record<CoherenceSeverity, string> = {
  conflito: "Conflito",
  atencao: "Atenção",
};

export const COHERENCE_FIX_LABEL: Record<CoherenceFixTarget, string> = {
  rascunho: "no rascunho",
  playbook: "no editor do playbook",
};

export const COHERENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["divergencias"],
  properties: {
    divergencias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "severidade",
          "rascunho_campo",
          "rascunho_trecho",
          "playbook_etapa",
          "playbook_subetapa",
          "playbook_trecho",
          "explicacao",
          "corrigir_em",
          "sugestao",
        ],
        properties: {
          severidade: { type: "string", enum: ["conflito", "atencao"] },
          rascunho_campo: { type: "string", enum: COHERENCE_DRAFT_FIELDS.map((f) => f.key) },
          rascunho_trecho: { type: "string" },
          playbook_etapa: { type: "string" },
          playbook_subetapa: { type: "string" },
          playbook_trecho: { type: "string" },
          explicacao: { type: "string" },
          corrigir_em: { type: "string", enum: ["rascunho", "playbook"] },
          sugestao: { type: "string" },
        },
      },
    },
  },
} as const;

// ── Resposta ───────────────────────────────────────────────────────────────

export interface CoherenceDivergence {
  severity: CoherenceSeverity;
  draft: { field: CoherenceDraftField; label: string; quote: string };
  playbook: { callType: string; block: string; quote: string };
  explanation: string;
  fixIn: CoherenceFixTarget;
  suggestion: string;
}

const SEVERITY_RANK: Record<CoherenceSeverity, number> = { conflito: 0, atencao: 1 };

/** A IA às vezes devolve a severidade com acento ou caixa diferente. */
function parseSeverity(v: unknown): CoherenceSeverity | null {
  const s = str(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s === "conflito" || s === "atencao" ? s : null;
}

const shorten = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/** Tira aspas que a IA põe em volta da citação — a tela já as desenha. */
const unquote = (text: string) => text.replace(/^["“”'«]+|["“”'»]+$/g, "").trim();

/** Conflitos antes de atenções; dentro de cada grupo, a ordem que a IA deu. */
export function sortDivergences(items: CoherenceDivergence[]): CoherenceDivergence[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] || a.i - b.i)
    .map(({ item }) => item);
}

/**
 * Valida a resposta da IA. O schema garante o formato, mas não o conteúdo: item
 * sem severidade válida, sem campo conhecido ou sem explicação é descartado (não
 * dá para mostrar "onde"), e a lista sai ordenada e limitada.
 *
 * Lança quando a resposta inteira não tem o formato — aí a checagem falhou, o que
 * é diferente de "nenhuma divergência".
 */
export function parseCoherenceResponse(raw: unknown): CoherenceDivergence[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("a checagem voltou incompleta");
    }
  }
  const list = (data as { divergencias?: unknown } | null)?.divergencias;
  if (!Array.isArray(list)) throw new Error("a checagem voltou sem a lista de divergências");

  const L = COHERENCE_LIMITS;
  const seen = new Set<string>();
  const items: CoherenceDivergence[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const severity = parseSeverity(e.severidade);
    const field = str(e.rascunho_campo) as CoherenceDraftField;
    const explanation = str(e.explicacao);
    if (!severity || !FIELD_LABEL.has(field) || !explanation) continue;
    const callType = shorten(str(e.playbook_etapa), L.quote);
    const block = shorten(str(e.playbook_subetapa), L.quote);
    const key = `${field}|${callType}|${block}|${explanation}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      severity,
      draft: { field, label: coherenceFieldLabel(field), quote: shorten(unquote(str(e.rascunho_trecho)), L.quote) },
      playbook: { callType, block, quote: shorten(unquote(str(e.playbook_trecho)), L.quote) },
      explanation: shorten(explanation, L.sentence),
      fixIn: str(e.corrigir_em) === "playbook" ? "playbook" : "rascunho",
      suggestion: shorten(str(e.sugestao), L.sentence),
    });
  }
  return sortDivergences(items).slice(0, L.maxDivergences);
}

export function countBySeverity(items: CoherenceDivergence[]): Record<CoherenceSeverity, number> {
  return {
    conflito: items.filter((d) => d.severity === "conflito").length,
    atencao: items.filter((d) => d.severity === "atencao").length,
  };
}

// ── Não checar duas vezes ──────────────────────────────────────────────────

/**
 * Chave de "é a mesma checagem": conta, playbook e os campos do rascunho que
 * entram, normalizados. É o texto canônico (não um hash): a comparação é exata e
 * vive só na memória da tela.
 *
 * O conteúdo do playbook NÃO entra — ele mora na conta e só a função o lê. Quem
 * guarda o resultado precisa dar prazo de validade e um "checar de novo".
 */
export function coherenceSignature(input: {
  connectionId: string;
  playbookId: number;
  draft: CoherenceDraftInput;
}): string {
  const d = input.draft;
  const objections = (Array.isArray(d.objecoes) ? d.objecoes : []).map((o) => [
    str(o.titulo),
    str(o.tipo),
    str(o.fala_exemplo),
    str(o.detalhes),
    str(o.ceder_se),
  ]);
  const guardrails = (Array.isArray(d.guardrails) ? d.guardrails : []).map((g) => [str(g.nome), str(g.instrucao)]);
  return JSON.stringify([
    input.connectionId,
    input.playbookId,
    str(d.oferta_nome),
    str(d.oferta_descricao),
    str(d.perfil),
    str(d.personas_variacao),
    objections,
    guardrails,
  ]);
}

/** Resposta da função `check-playbook-coherence` quando dá certo. */
export interface CoherenceCheckResult {
  divergences: CoherenceDivergence[];
  truncated: string[];
  stats: CoherencePayload["stats"];
}

/** Por quanto tempo um resultado guardado vale: o playbook pode mudar na conta. */
export const COHERENCE_CACHE_TTL_MS = 10 * 60_000;

/**
 * Guarda a última checagem que deu certo, na memória de quem cria (a tela). Um
 * resultado só: o que importa é não repetir a checagem do que está na tela agora.
 */
export function createCoherenceCache(ttlMs = COHERENCE_CACHE_TTL_MS, now: () => number = Date.now) {
  let entry: { signature: string; result: CoherenceCheckResult; at: number } | null = null;
  return {
    /** O resultado guardado, se for da mesma assinatura e ainda estiver no prazo. */
    get(signature: string): CoherenceCheckResult | null {
      if (!entry || entry.signature !== signature || now() - entry.at >= ttlMs) return null;
      return entry.result;
    },
    set(signature: string, result: CoherenceCheckResult): void {
      entry = { signature, result, at: now() };
    },
  };
}
