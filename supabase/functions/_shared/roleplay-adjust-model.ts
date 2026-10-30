/**
 * Modelo da tela "Ajustar roleplay" (roleplay já criado na Perfecting): o formato que
 * a tela edita e o plano de mudanças que cada aba vira na API.
 *
 * Sem imports de propósito: o front importa os tipos daqui, e a lógica é pura (o IO
 * mora em `roleplay-adjust.ts`). O que a API tem de traiçoeiro fica resolvido aqui:
 *  - uma objeção do material é UMA linha por nível de dificuldade (o prompt só usa a
 *    do nível do roleplay) — na tela é um item só, e o plano mexe nas três;
 *  - quando a persona tem objeções próprias, o backend ignora as sem persona — as
 *    novas nascem com `persona_id`;
 *  - o PATCH de conhecimento troca o dict inteiro — o patch leva sempre o dict todo;
 *  - nome de guardrail é único no banco inteiro — os novos levam o sufixo do contexto.
 */

export type AdjustSection =
  | "general"
  | "prior_knowledge"
  | "step_knowledge"
  | "objections"
  | "persona"
  | "guardrails";

export const ADJUST_SECTIONS: AdjustSection[] = [
  "general",
  "prior_knowledge",
  "step_knowledge",
  "objections",
  "persona",
  "guardrails",
];

export interface AdjustTopic {
  titulo: string;
  texto: string;
}

export interface AdjustGeneral {
  training_name: string;
  first_messages: string[];
  /** null = sem status (visível para todos). */
  role_play_status_id: number | null;
  difficulty_level_id: number | null;
}

export interface AdjustStepItem {
  id: number;
  title: string;
  /** Nome do bloco do playbook, quando o item é de bloco. */
  block_name: string | null;
  order: number;
  prior: string;
  facts: AdjustTopic[];
  briefing: AdjustTopic[];
  seller_instruction: string;
  first_messages: string[];
}

export type ObjectionStorage = "case_setup" | "context";

export interface AdjustObjection {
  /** Identidade do grupo carregado; null = objeção nova. */
  key: string | null;
  /** Onde mora: no roleplay ou no contexto (vale para todos os roleplays dele). */
  scope: ObjectionStorage;
  titulo: string;
  /** slug de `/objection_types`. */
  tipo: string;
  fala_exemplo: string;
  detalhes: string;
  ceder_se: string;
  /** Níveis de dificuldade em que existe (informativo; o salvar completa os três). */
  levels: number[];
}

export type RevealLevel = "surface" | "probed" | "hidden";

export interface AdjustPersonaPain {
  offer_pain_id: number;
  title: string;
  reveal_level: RevealLevel;
  detail: string;
}

export interface AdjustPersonaProduct {
  offer_product_id: number;
  name: string;
  stance: string;
}

export interface AdjustPersona {
  id: number;
  name: string;
  job_title: string;
  persona_prompt: string;
  /** null = o ambiente não tem dores × portfólio. */
  pains: AdjustPersonaPain[] | null;
  products: AdjustPersonaProduct[] | null;
}

export interface AdjustGuardrail {
  /** null = regra nova. */
  id: number | null;
  nome: string;
  instrucao: string;
}

export interface AdjustSections {
  general: AdjustGeneral;
  prior_knowledge: string[];
  step_knowledge: AdjustStepItem[];
  objections: AdjustObjection[];
  persona: AdjustPersona | null;
  guardrails: AdjustGuardrail[];
}

export interface AdjustSibling {
  case_setup_id: number;
  training_name: string;
  role_play_status_name: string | null;
  /** Ordem da etapa no playbook (só quando os dois são etapas do mesmo playbook). */
  stage_order: number | null;
  is_next_stage: boolean;
}

export interface AdjustState {
  case_setup: {
    id: number;
    training_name: string;
    context_id: number | null;
    offer_id: number | null;
    persona_id: number | null;
    playbook_call_type_id: number | null;
  };
  sections: AdjustSections;
  /** Versão de cada aba no momento da leitura — o salvar recusa se mudou no meio. */
  hashes: Record<AdjustSection, string>;
  catalog: {
    objection_types: Array<{ slug: string; name: string }>;
    offer_pains: Array<{ id: number; title: string; description: string }> | null;
    offer_products: Array<{ id: number; name: string }> | null;
  };
  playbook: { call_type_name: string; stage_order: number | null } | null;
  /** Resumo da chamada anterior que o vendedor vê (etapa de playbook). */
  last_call_info: { title: string; content: string } | null;
  siblings: AdjustSibling[];
  warnings: string[];
}

export const ROLE_PLAY_STATUSES: Array<{ id: number | null; label: string; hint: string }> = [
  { id: null, label: "Sem status", hint: "visível para todos" },
  { id: 1, label: "Em desenvolvimento", hint: "só quem criou e admins" },
  { id: 2, label: "Homologação", hint: "gestores e admins" },
  { id: 3, label: "Publicado", hint: "visível para todos" },
];

export const DIFFICULTY_LEVELS: Array<{ id: number; label: string }> = [
  { id: 1, label: "Fácil" },
  { id: 2, label: "Moderado" },
  { id: 3, label: "Difícil" },
];

export class AdjustValidationError extends Error {}

// ── utilidades ─────────────────────────────────────────────────────────────

export const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Hash curto e estável (FNV-1a 32) — só para detectar mudança, não é segurança. */
export function stableHash(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function topicsFromDict(dict: unknown): AdjustTopic[] {
  if (!dict || typeof dict !== "object" || Array.isArray(dict)) return [];
  return Object.entries(dict as Record<string, unknown>).map(([titulo, texto]) => ({
    titulo,
    texto: typeof texto === "string" ? texto : JSON.stringify(texto),
  }));
}

/** Tópicos → dict. Título vazio é descartado; título repetido é erro (sobrescreveria). */
export function dictFromTopics(topics: AdjustTopic[], label: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of topics) {
    const k = t.titulo.trim();
    if (!k) continue;
    if (k in out) throw new AdjustValidationError(`${label}: o título "${k}" aparece duas vezes`);
    out[k] = t.texto.trim();
  }
  return out;
}

const cleanList = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ── Geral ──────────────────────────────────────────────────────────────────

export function planGeneralPatch(loaded: AdjustGeneral, desired: AdjustGeneral): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const name = desired.training_name.trim();
  if (!name) throw new AdjustValidationError("o nome do treino não pode ficar vazio");
  if (name !== loaded.training_name) patch.training_name = name;
  const first = cleanList(desired.first_messages);
  if (!sameList(first, loaded.first_messages)) patch.buyer_agent_first_messages = first;
  if (desired.role_play_status_id !== loaded.role_play_status_id) {
    patch.role_play_status_id = desired.role_play_status_id;
  }
  if (desired.difficulty_level_id != null && desired.difficulty_level_id !== loaded.difficulty_level_id) {
    patch.difficulty_level_id = desired.difficulty_level_id;
  }
  return patch;
}

// ── Conhecimento por bloco ─────────────────────────────────────────────────

export function planStepKnowledgePatches(
  loaded: AdjustStepItem[],
  desired: AdjustStepItem[],
): Array<{ id: number; patch: Record<string, unknown> }> {
  const byId = new Map(loaded.map((it) => [it.id, it]));
  const out: Array<{ id: number; patch: Record<string, unknown> }> = [];
  for (const d of desired) {
    const l = byId.get(d.id);
    if (!l) throw new AdjustValidationError(`bloco de conhecimento ${d.id} não existe mais — recarregue`);
    const patch: Record<string, unknown> = {};
    if (d.prior.trim() !== l.prior.trim()) patch.prior_knowledge_prompt = d.prior.trim();
    const facts = dictFromTopics(d.facts, `Fatos de "${d.block_name ?? d.title}"`);
    if (stableHash(facts) !== stableHash(dictFromTopics(l.facts, "fatos"))) {
      patch.knowledge_prompt_details = facts; // dict inteiro: a API substitui
    }
    const briefing = dictFromTopics(d.briefing, `Briefing de "${d.block_name ?? d.title}"`);
    if (stableHash(briefing) !== stableHash(dictFromTopics(l.briefing, "briefing"))) {
      patch.prior_knowledge_user_briefing = briefing;
    }
    if (d.seller_instruction.trim() !== l.seller_instruction.trim()) {
      patch.prior_knowledge_user_instruction = d.seller_instruction.trim();
    }
    const first = cleanList(d.first_messages);
    if (!sameList(first, l.first_messages)) patch.buyer_agent_first_messages = first;
    if (Object.keys(patch).length > 0) out.push({ id: d.id, patch });
  }
  return out;
}

// ── Objeções ───────────────────────────────────────────────────────────────

export interface ObjectionRow {
  id: number;
  scope: ObjectionStorage;
  title: string;
  objection_type_id: number;
  description: string;
  details: string;
  to_give_in_if: string;
  difficulty_level_id: number | null;
  persona_id: number | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function toObjectionRow(r: Record<string, unknown>, scope: ObjectionStorage): ObjectionRow | null {
  if (typeof r.id !== "number" || typeof r.objection_type_id !== "number") return null;
  return {
    id: r.id,
    scope,
    title: str(r.title),
    objection_type_id: r.objection_type_id,
    description: str(r.description),
    details: str(r.details),
    to_give_in_if: str(r.to_give_in_if),
    difficulty_level_id: typeof r.difficulty_level_id === "number" ? r.difficulty_level_id : null,
    persona_id: typeof r.persona_id === "number" ? r.persona_id : null,
  };
}

export const objectionKey = (scope: ObjectionStorage, title: string) => `${scope}:${normTitle(title)}`;

/** Linhas da API (uma por nível) → itens da tela (um por título). */
export function groupObjections(
  rows: ObjectionRow[],
  slugByTypeId: Map<number, string>,
): AdjustObjection[] {
  const groups = new Map<string, ObjectionRow[]>();
  for (const r of rows) {
    const k = objectionKey(r.scope, r.title);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => {
    // O conteúdo vem da linha do menor nível (todas costumam ser iguais).
    const first = [...rs].sort((a, b) => (a.difficulty_level_id ?? 99) - (b.difficulty_level_id ?? 99))[0];
    return {
      key,
      scope: first.scope,
      titulo: first.title,
      tipo: slugByTypeId.get(first.objection_type_id) ?? "",
      fala_exemplo: first.description,
      detalhes: first.details,
      ceder_se: first.to_give_in_if,
      levels: [...new Set(rs.map((r) => r.difficulty_level_id).filter((n): n is number => n != null))].sort(),
    };
  });
}

export interface ObjectionPlan {
  creates: Array<{ scope: ObjectionStorage; input: Record<string, unknown> }>;
  patches: Array<{ scope: ObjectionStorage; id: number; patch: Record<string, unknown> }>;
  deletes: Array<{ scope: ObjectionStorage; id: number }>;
}

export function planObjectionChanges(
  rows: ObjectionRow[],
  desired: AdjustObjection[],
  opts: { personaId: number | null; levels: readonly number[]; typeIdBySlug: Map<string, number> },
): ObjectionPlan {
  const plan: ObjectionPlan = { creates: [], patches: [], deletes: [] };
  const groups = new Map<string, ObjectionRow[]>();
  for (const r of rows) {
    const k = objectionKey(r.scope, r.title);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const seenTitles = new Set<string>();
  const kept = new Set<string>();
  for (const d of desired) {
    const titulo = d.titulo.trim();
    if (!titulo) throw new AdjustValidationError("toda objeção precisa de título");
    if (titulo.length > 255) throw new AdjustValidationError(`título longo demais (máx. 255): "${titulo.slice(0, 40)}…"`);
    const scopeTitle = `${d.key && groups.has(d.key) ? groups.get(d.key)![0].scope : "case_setup"}:${normTitle(titulo)}`;
    if (seenTitles.has(scopeTitle)) throw new AdjustValidationError(`objeção repetida: "${titulo}"`);
    seenTitles.add(scopeTitle);
    const typeId = opts.typeIdBySlug.get(d.tipo);
    if (typeId == null) throw new AdjustValidationError(`objeção "${titulo}" sem tipo válido`);
    const content = {
      title: titulo,
      objection_type_id: typeId,
      description: d.fala_exemplo.trim() || null,
      details: d.detalhes.trim() || null,
      to_give_in_if: d.ceder_se.trim() || null,
    };

    const group = d.key ? groups.get(d.key) : undefined;
    if (group) {
      kept.add(d.key!);
      for (const r of group) {
        const patch: Record<string, unknown> = {};
        if (r.title !== content.title) patch.title = content.title;
        if (r.objection_type_id !== content.objection_type_id) patch.objection_type_id = content.objection_type_id;
        if ((r.description || null) !== content.description) patch.description = content.description;
        if ((r.details || null) !== content.details) patch.details = content.details;
        if ((r.to_give_in_if || null) !== content.to_give_in_if) patch.to_give_in_if = content.to_give_in_if;
        if (Object.keys(patch).length > 0) plan.patches.push({ scope: r.scope, id: r.id, patch });
      }
      // Completa os níveis que faltam: sem a linha do nível do roleplay, ela não entra.
      const have = new Set(group.map((r) => r.difficulty_level_id));
      for (const level of opts.levels) {
        if (have.has(level)) continue;
        plan.creates.push({
          scope: group[0].scope,
          input: { ...content, difficulty_level_id: level, persona_id: group[0].persona_id },
        });
      }
    } else {
      for (const level of opts.levels) {
        plan.creates.push({
          scope: "case_setup",
          input: { ...content, difficulty_level_id: level, persona_id: opts.personaId },
        });
      }
    }
  }

  for (const [k, group] of groups) {
    if (kept.has(k)) continue;
    for (const r of group) plan.deletes.push({ scope: r.scope, id: r.id });
  }
  return plan;
}

// ── Persona e dores ────────────────────────────────────────────────────────

export interface PersonaPlan {
  persona: Record<string, unknown> | null;
  pains: Array<{ offer_pain_id: number; reveal_level: RevealLevel; persona_specific_detail: string }> | null;
  products: Array<{ offer_product_id: number; buyer_product_stance: string }> | null;
}

const REVEALS: RevealLevel[] = ["surface", "probed", "hidden"];

export function planPersonaChanges(loaded: AdjustPersona, desired: AdjustPersona): PersonaPlan {
  const plan: PersonaPlan = { persona: null, pains: null, products: null };
  const patch: Record<string, unknown> = {};
  const name = desired.name.trim();
  if (!name) throw new AdjustValidationError("a persona precisa de nome");
  if (name !== loaded.name) patch.name = name;
  if (desired.job_title.trim() !== loaded.job_title) patch.job_title = desired.job_title.trim();
  if (!desired.persona_prompt.trim()) throw new AdjustValidationError("o prompt da persona não pode ficar vazio");
  if (desired.persona_prompt.trim() !== loaded.persona_prompt.trim()) patch.persona_prompt = desired.persona_prompt.trim();
  if (Object.keys(patch).length > 0) plan.persona = patch;

  if (desired.pains && loaded.pains) {
    const ids = new Set<number>();
    const next = desired.pains.map((p) => {
      if (ids.has(p.offer_pain_id)) throw new AdjustValidationError(`dor "${p.title}" aparece duas vezes`);
      ids.add(p.offer_pain_id);
      if (!REVEALS.includes(p.reveal_level)) throw new AdjustValidationError(`dor "${p.title}" sem nível de revelação`);
      return { offer_pain_id: p.offer_pain_id, reveal_level: p.reveal_level, persona_specific_detail: p.detail.trim() };
    });
    const before = loaded.pains.map((p) => ({
      offer_pain_id: p.offer_pain_id,
      reveal_level: p.reveal_level,
      persona_specific_detail: p.detail.trim(),
    }));
    if (stableHash(next) !== stableHash(before)) plan.pains = next;
  }
  if (desired.products && loaded.products) {
    const next = desired.products.map((p) => ({ offer_product_id: p.offer_product_id, buyer_product_stance: p.stance.trim() }));
    const before = loaded.products.map((p) => ({ offer_product_id: p.offer_product_id, buyer_product_stance: p.stance.trim() }));
    if (stableHash(next) !== stableHash(before)) plan.products = next;
  }
  return plan;
}

// ── Guardrails ─────────────────────────────────────────────────────────────

export const guardrailSuffix = (contextId: number) => ` · ctx ${contextId}`;

/** Nome como a tela mostra: sem o sufixo técnico de unicidade. */
export const displayGuardrailName = (name: string, contextId: number) =>
  name.endsWith(guardrailSuffix(contextId)) ? name.slice(0, -guardrailSuffix(contextId).length) : name;

export interface GuardrailPlan {
  creates: Array<{ name: string; prompt: string }>;
  patches: Array<{ id: number; patch: { name?: string; prompt?: string } }>;
  deletes: number[];
}

export function planGuardrailChanges(
  existing: Array<{ id: number; name: string; prompt: string }>,
  desired: AdjustGuardrail[],
  contextId: number,
): GuardrailPlan {
  const plan: GuardrailPlan = { creates: [], patches: [], deletes: [] };
  const byId = new Map(existing.map((g) => [g.id, g]));
  const names = new Set<string>();
  const kept = new Set<number>();
  for (const d of desired) {
    const nome = d.nome.trim();
    const instrucao = d.instrucao.trim();
    if (!nome) throw new AdjustValidationError("toda regra precisa de nome");
    if (!instrucao) throw new AdjustValidationError(`a regra "${nome}" está sem instrução`);
    if (names.has(normTitle(nome))) throw new AdjustValidationError(`regra repetida: "${nome}"`);
    names.add(normTitle(nome));
    const fullName = `${nome}${guardrailSuffix(contextId)}`;
    if (fullName.length > 255) throw new AdjustValidationError(`nome de regra longo demais: "${nome.slice(0, 40)}…"`);
    const current = d.id != null ? byId.get(d.id) : undefined;
    if (current) {
      kept.add(current.id);
      const patch: { name?: string; prompt?: string } = {};
      if (displayGuardrailName(current.name, contextId) !== nome) patch.name = fullName;
      if (current.prompt.trim() !== instrucao) patch.prompt = instrucao;
      if (Object.keys(patch).length > 0) plan.patches.push({ id: current.id, patch });
    } else {
      plan.creates.push({ name: fullName, prompt: instrucao });
    }
  }
  for (const g of existing) if (!kept.has(g.id)) plan.deletes.push(g.id);
  return plan;
}

/** Por que uma calibração foi feita: o tipo é filtrável; o texto diz qual teste ou pedido. */
export const ADJUST_REASON_KINDS = [
  { id: "test_defect", label: "Defeito em teste" },
  { id: "client_request", label: "Pedido do cliente" },
  { id: "wrong_data", label: "Dado errado ou vencido" },
  { id: "polish", label: "Polimento" },
  { id: "other", label: "Outro" },
] as const;

export type AdjustReasonKind = (typeof ADJUST_REASON_KINDS)[number]["id"];

/**
 * Lê o motivo do corpo do pedido. Tolerante de propósito: a tela exige o tipo, mas
 * um front antigo (sem o campo) não pode deixar de salvar; aí o motivo fica null.
 */
export function parseAdjustReason(body: Record<string, unknown>): { reason_kind: AdjustReasonKind | null; reason: string | null } {
  const kind = ADJUST_REASON_KINDS.find((k) => k.id === body.reasonKind)?.id ?? null;
  const text = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  return { reason_kind: kind, reason: text || null };
}
