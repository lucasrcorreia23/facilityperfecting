/**
 * O que a IA gerou × o que a equipe enviou: base da etapa "Revisão antes do envio"
 * da linha do tempo e do aviso na Criação. Puro (sem Deno), importado pelo front.
 *
 * As duas pontas usam as chaves do ProcessImportResult: `ai` é a resposta do
 * process-import; `sent` é o rascunho achatado por buildSentSnapshot.
 *
 * Sem imports de propósito: o front importa este arquivo, e o TypeScript do Next
 * não aceita caminho terminado em ".ts" (o Deno exige).
 */

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** JSON com chaves ordenadas: igualdade estrutural sem depender da ordem das chaves. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

type Seed = Record<string, unknown>;

export interface SentSnapshot {
  mode: "methodology" | "playbook";
  oferta_nome: string;
  oferta_descricao: string;
  perfil: string;
  personas_variacao: string;
  cenario_instrucoes: string;
  objetivo: string;
  habilidades: string;
  call_context_slug: string;
  dificuldade: string;
  objecoes: Seed[];
  guardrails: Seed[];
  dossie: unknown;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): Seed[] => (Array.isArray(v) ? (v as Seed[]) : []);

/**
 * O rascunho como ele foi para a conta. Aceita a linha do banco com os joins do
 * envio (`offers`, `contexts`) e o formulário da Criação, que monta o mesmo formato.
 */
export function buildSentSnapshot(draft: {
  scenario?: Record<string, unknown> | null;
  offers?: { offer_name?: string | null; general_description?: string | null } | null;
  contexts?: { target_notes?: string | null } | null;
}): SentSnapshot {
  const sc = draft.scenario ?? {};
  return {
    mode: sc.generation_mode === "playbook" ? "playbook" : "methodology",
    oferta_nome: str(draft.offers?.offer_name),
    oferta_descricao: str(draft.offers?.general_description),
    perfil: str(draft.contexts?.target_notes),
    personas_variacao: str(sc.persona_instructions),
    cenario_instrucoes: str(sc.aditional_instructions),
    objetivo: str(sc.objective),
    habilidades: str(sc.skill),
    call_context_slug: str(sc.call_context_slug),
    dificuldade: str(sc.difficulty),
    objecoes: list(sc.objections),
    guardrails: list(sc.guardrails),
    dossie: sc.dossier ?? null,
  };
}

export type DiffStatus = "same" | "edited" | "cleared" | "added";

export interface DiffItem {
  key: keyof Omit<SentSnapshot, "mode">;
  label: string;
  status: DiffStatus;
  /** Resumo curto da mudança ("+1.240 caracteres", "2 removidas, 1 nova"). */
  detail: string | null;
  ai: unknown;
  sent: unknown;
}

type Kind = "text" | "scalar" | "objections" | "guardrails" | "json";

/**
 * Campos comparados, na ordem da tela. `modes`: onde o campo chega à conta — no
 * playbook cenário, rubricas, tipo e nível vêm das etapas, e a variação de
 * personas só existe lá; mudar o que não chega não é edição que importe.
 */
const FIELDS: Array<{ key: DiffItem["key"]; label: string; kind: Kind; modes: SentSnapshot["mode"][] }> = [
  { key: "oferta_nome", label: "Nome da oferta", kind: "text", modes: ["methodology", "playbook"] },
  { key: "oferta_descricao", label: "Descrição da oferta", kind: "text", modes: ["methodology", "playbook"] },
  { key: "perfil", label: "Perfil do público", kind: "text", modes: ["methodology", "playbook"] },
  { key: "personas_variacao", label: "Variação das personas", kind: "text", modes: ["playbook"] },
  { key: "objecoes", label: "Objeções", kind: "objections", modes: ["methodology", "playbook"] },
  { key: "guardrails", label: "Regras", kind: "guardrails", modes: ["methodology", "playbook"] },
  { key: "cenario_instrucoes", label: "Instruções do cenário", kind: "text", modes: ["methodology"] },
  { key: "objetivo", label: "Objetivo", kind: "text", modes: ["methodology"] },
  { key: "habilidades", label: "Habilidades", kind: "text", modes: ["methodology"] },
  { key: "call_context_slug", label: "Tipo de chamada", kind: "scalar", modes: ["methodology"] },
  { key: "dificuldade", label: "Dificuldade", kind: "scalar", modes: ["methodology"] },
  { key: "dossie", label: "Dossiê do comprador", kind: "json", modes: ["methodology"] },
];

const isEmpty = (v: unknown) =>
  v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

const charDelta = (a: string, b: string) => {
  const d = b.length - a.length;
  if (d === 0) return "mesmo tamanho, texto diferente";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("pt-BR")} caracteres`;
};

/** Listas casadas pelo título: o que sumiu, o que entrou e o que mudou por dentro. */
function listDetail(ai: Seed[], sent: Seed[], titleKey: string, noun: [string, string]): string | null {
  const byTitle = (xs: Seed[]) => new Map(xs.map((x) => [normTitle(String(x[titleKey] ?? "")), x]));
  const a = byTitle(ai);
  const b = byTitle(sent);
  let removed = 0;
  let added = 0;
  let changed = 0;
  for (const [t, x] of a) {
    const y = b.get(t);
    if (!y) removed++;
    else if (stable(x) !== stable(y)) changed++;
  }
  for (const t of b.keys()) if (!a.has(t)) added++;
  const parts = [
    removed && `${removed} ${removed === 1 ? noun[0] : noun[1]} removida${removed === 1 ? "" : "s"}`,
    added && `${added} nova${added === 1 ? "" : "s"}`,
    changed && `${changed} alterada${changed === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")} (de ${ai.length})` : null;
}

/**
 * Compara campo a campo, só os que chegam à conta no modo enviado. null quando o
 * rascunho não passou pela IA (não há com o que comparar).
 */
export function diffGeneration(ai: Record<string, unknown> | null | undefined, sent: SentSnapshot): DiffItem[] | null {
  if (!ai) return null;
  const items: DiffItem[] = [];
  for (const f of FIELDS) {
    if (!f.modes.includes(sent.mode)) continue;
    const a = ai[f.key];
    const b = sent[f.key];
    let status: DiffStatus;
    let detail: string | null = null;
    if (isEmpty(a) && isEmpty(b)) status = "same";
    else if (isEmpty(a)) status = "added";
    else if (isEmpty(b)) status = "cleared";
    else if (f.kind === "text") {
      status = str(a) === str(b) ? "same" : "edited";
      if (status === "edited") detail = charDelta(str(a), str(b));
    } else if (f.kind === "objections" || f.kind === "guardrails") {
      detail = f.kind === "objections"
        ? listDetail(list(a), list(b), "titulo", ["objeção", "objeções"])
        : listDetail(list(a), list(b), "nome", ["regra", "regras"]);
      status = detail ? "edited" : "same";
    } else {
      status = stable(a) === stable(b) ? "same" : "edited";
      if (status === "edited" && f.kind === "scalar") detail = `${String(a)} → ${String(b)}`;
    }
    items.push({ key: f.key, label: f.label, status, detail, ai: a ?? null, sent: b });
  }
  return items;
}

/** Só o que mudou, para resumos ("3 campos editados à mão: …"). */
export const changedItems = (items: DiffItem[] | null) => (items ?? []).filter((i) => i.status !== "same");
