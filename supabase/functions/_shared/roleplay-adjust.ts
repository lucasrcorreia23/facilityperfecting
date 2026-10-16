/**
 * IO da tela "Ajustar roleplay": lê um roleplay já criado na Perfecting no formato
 * da tela (`roleplay-adjust-model.ts`) e aplica as mudanças de uma aba.
 *
 * A chamada remonta o prompt na hora (nunca lê `case_prompt`), então o que é salvo
 * aqui vale a partir da próxima chamada. Cada salvar relê o estado e recusa se a aba
 * mudou desde a leitura da tela (outra pessoa, ou um script).
 */
import {
  type AdjustGuardrail,
  type AdjustObjection,
  type AdjustPersona,
  type AdjustSection,
  type AdjustSections,
  type AdjustSibling,
  type AdjustState,
  type AdjustStepItem,
  ADJUST_SECTIONS,
  AdjustValidationError,
  displayGuardrailName,
  groupObjections,
  type ObjectionRow,
  planGeneralPatch,
  planGuardrailChanges,
  planObjectionChanges,
  planPersonaChanges,
  planStepKnowledgePatches,
  type RevealLevel,
  stableHash,
  toObjectionRow,
  topicsFromDict,
} from "./roleplay-adjust-model.ts";
import {
  createCaseSetupObjection,
  createContextGuardrail,
  createContextObjection,
  deleteContextGuardrail,
  deleteObjection,
  DIFFICULTY_LEVEL_IDS,
  getCaseSetupCallPanel,
  getCaseSetupRaw,
  getPersona,
  getPersonaOfferProducts,
  getPersonaPains,
  listCaseSetupObjectionsFull,
  listCaseSetupsByContextFull,
  listContextGuardrailsFull,
  listContextObjectionsFull,
  listObjectionTypes,
  listOfferPainsFull,
  listOfferProductsFull,
  listOrganizationCaseSetups,
  listStepKnowledgeFull,
  patchCaseSetup,
  patchContextGuardrail,
  patchObjection,
  patchStepKnowledge,
  type PerfectingEnv,
  PerfectingError,
  runCaseSetupRepairStep,
  setCaseSetupPriorKnowledge,
  setPersonaOfferProducts,
  setPersonaPains,
  updatePersona,
} from "./perfecting.ts";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : null);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const REVEALS: RevealLevel[] = ["surface", "probed", "hidden"];

/** A aba mudou desde que a tela leu: quem salva precisa recarregar. */
export class AdjustConflictError extends Error {}

export interface RoleplayListItem {
  id: number;
  training_name: string;
  context_id: number | null;
  call_context_type_name: string | null;
  role_play_status_name: string | null;
  updated_at: string | null;
}

/** Roleplays da org da conexão, mais recentes primeiro. */
export async function listRoleplays(env: PerfectingEnv, token: string): Promise<RoleplayListItem[]> {
  const rows = await listOrganizationCaseSetups(env, token);
  return rows
    .filter((r) => typeof r.id === "number")
    .map((r) => ({
      id: r.id as number,
      training_name: str(r.training_name) || `Roleplay ${r.id}`,
      context_id: num(r.context_id),
      call_context_type_name: str(r.call_context_type_name) || null,
      role_play_status_name: str(r.role_play_status_name) || null,
      updated_at: str(r.updated_at) || str(r.created_at) || null,
    }))
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "") || b.id - a.id);
}

/** Estado completo da tela para um roleplay. */
export async function loadAdjustState(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
): Promise<AdjustState> {
  const warnings: string[] = [];
  const cs = await getCaseSetupRaw(env, token, caseSetupId);
  const contextId = num(cs.context_id);
  const offerId = num(cs.offer_id);
  const personaId = num(cs.persona_id);

  const [panel, stepRows, caseObjections, contextObjections, guardrailRows, types, siblingsRows] =
    await Promise.all([
      getCaseSetupCallPanel(env, token, caseSetupId, personaId).catch(() => ({}) as Record<string, unknown>),
      listStepKnowledgeFull(env, token, caseSetupId, personaId),
      listCaseSetupObjectionsFull(env, token, caseSetupId),
      contextId != null ? listContextObjectionsFull(env, token, contextId) : Promise.resolve([]),
      contextId != null ? listContextGuardrailsFull(env, token, contextId) : Promise.resolve([]),
      listObjectionTypes(env, token),
      contextId != null ? listCaseSetupsByContextFull(env, token, contextId) : Promise.resolve([]),
    ]);

  // Playbook: nomes dos blocos e etapas irmãs (do painel da chamada).
  const playbookPanel = (panel as { playbook?: Record<string, unknown> }).playbook ?? null;
  const blockNames = new Map<number, { name: string; order: number }>();
  const walk = (blocks: unknown) => {
    for (const b of Array.isArray(blocks) ? blocks : []) {
      if (b && typeof b === "object" && typeof (b as { id?: unknown }).id === "number") {
        const bb = b as { id: number; name?: unknown; order?: unknown; children?: unknown };
        blockNames.set(bb.id, { name: str(bb.name), order: num(bb.order) ?? 0 });
        walk(bb.children);
      }
    }
  };
  walk(playbookPanel?.blocks);
  const stageSiblings = (Array.isArray(playbookPanel?.siblings) ? playbookPanel!.siblings : []) as Array<
    Record<string, unknown>
  >;
  const myStage = stageSiblings.find((s) => s.case_setup_id === caseSetupId);
  const myOrder = num(myStage?.order);
  const lastCall = playbookPanel?.last_call_info as Record<string, unknown> | undefined;

  // Conhecimento: só os itens da persona do roleplay (ou os sem persona, se não travada).
  const stepItems: AdjustStepItem[] = stepRows
    .filter((r) => typeof r.id === "number")
    .filter((r) => (personaId == null ? true : num(r.persona_id) === personaId))
    .map((r) => {
      const block = num(r.playbook_call_block_id);
      const info = block != null ? blockNames.get(block) : undefined;
      return {
        id: r.id as number,
        title: str(r.title),
        block_name: info?.name ?? null,
        order: info?.order ?? Number.MAX_SAFE_INTEGER,
        prior: str(r.prior_knowledge_prompt),
        facts: topicsFromDict(r.knowledge_prompt_details),
        briefing: topicsFromDict(r.prior_knowledge_user_briefing),
        seller_instruction: str(r.prior_knowledge_user_instruction),
        first_messages: strList(r.buyer_agent_first_messages),
      };
    })
    .sort((a, b) => a.order - b.order || a.id - b.id);
  if (personaId == null && stepItems.length > 0) {
    warnings.push("roleplay sem persona travada: o conhecimento mostrado é de todas as personas do contexto");
  }

  // Objeções: as do roleplay + as do contexto que valem para esta persona.
  const slugByTypeId = new Map(types.map((t) => [t.id, t.slug]));
  const rows = objectionRows(caseObjections, contextObjections, personaId);
  const objections = groupObjections(rows, slugByTypeId).sort((a, b) =>
    a.scope === b.scope ? a.titulo.localeCompare(b.titulo) : a.scope === "case_setup" ? -1 : 1,
  );
  if (personaId != null && rows.some((r) => r.persona_id === personaId)) {
    const ignored = [...caseObjections, ...contextObjections].filter((o) => o.persona_id == null).length;
    if (ignored > 0) {
      warnings.push(
        `${ignored} objeção(ões) sem persona não entram neste roleplay: a persona tem objeções próprias e o backend usa só elas`,
      );
    }
  }

  // Persona, dores e produtos.
  let persona: AdjustPersona | null = null;
  let offerPains: AdjustState["catalog"]["offer_pains"] = null;
  let offerProducts: AdjustState["catalog"]["offer_products"] = null;
  if (personaId != null) {
    const [p, pains, products, catalogPains, catalogProducts] = await Promise.all([
      getPersona(env, token, personaId),
      getPersonaPains(env, token, personaId),
      getPersonaOfferProducts(env, token, personaId),
      offerId != null ? listOfferPainsFull(env, token, offerId) : Promise.resolve(null),
      offerId != null ? listOfferProductsFull(env, token, offerId) : Promise.resolve(null),
    ]);
    persona = {
      id: personaId,
      name: str(p.name),
      job_title: str(p.job_title),
      persona_prompt: str(p.persona_prompt),
      pains: pains?.map((x) => ({
        offer_pain_id: num(x.offer_pain_id) ?? 0,
        title: str(x.title),
        reveal_level: REVEALS.includes(x.reveal_level as RevealLevel) ? (x.reveal_level as RevealLevel) : "probed",
        detail: str(x.persona_specific_detail),
      })) ?? null,
      products: products?.map((x) => ({
        offer_product_id: num(x.offer_product_id) ?? 0,
        name: str(x.name),
        stance: str(x.buyer_product_stance),
      })) ?? null,
    };
    offerPains = catalogPains?.map((x) => ({ id: num(x.id) ?? 0, title: str(x.title), description: str(x.description) })) ?? null;
    offerProducts = catalogProducts?.map((x) => ({ id: num(x.id) ?? 0, name: str(x.name) })) ?? null;
  } else {
    warnings.push("roleplay sem persona travada: a aba Persona fica indisponível");
  }

  const guardrails: AdjustGuardrail[] = guardrailRows
    .filter((g) => typeof g.id === "number")
    .map((g) => ({
      id: g.id as number,
      nome: contextId != null ? displayGuardrailName(str(g.name), contextId) : str(g.name),
      instrucao: str(g.prompt),
    }));

  const sections: AdjustSections = {
    general: {
      training_name: str(cs.training_name),
      first_messages: strList(cs.buyer_agent_first_messages),
      role_play_status_id: num(cs.role_play_status_id),
      difficulty_level_id: num(cs.difficulty_level_id),
    },
    prior_knowledge: strList(cs.buyer_prior_knowledge),
    step_knowledge: stepItems,
    objections,
    persona,
    guardrails,
  };

  const orderByCaseSetup = new Map(
    stageSiblings
      .filter((s) => typeof s.case_setup_id === "number")
      .map((s) => [s.case_setup_id as number, num(s.order)]),
  );
  const siblings: AdjustSibling[] = siblingsRows
    .filter((r) => typeof r.id === "number" && r.id !== caseSetupId)
    .map((r) => {
      const order = orderByCaseSetup.get(r.id as number) ?? null;
      return {
        case_setup_id: r.id as number,
        training_name: str(r.training_name) || `Roleplay ${r.id}`,
        role_play_status_name: str(r.role_play_status_name) || null,
        stage_order: order,
        is_next_stage: order != null && myOrder != null && order === myOrder + 1,
      };
    });

  return {
    case_setup: {
      id: caseSetupId,
      training_name: str(cs.training_name),
      context_id: contextId,
      offer_id: offerId,
      persona_id: personaId,
      playbook_call_type_id: num(cs.playbook_call_type_id),
    },
    sections,
    hashes: hashSections(sections),
    catalog: { objection_types: types.map((t) => ({ slug: t.slug, name: t.name })), offer_pains: offerPains, offer_products: offerProducts },
    playbook: playbookPanel
      ? { call_type_name: str(playbookPanel.call_type_name), stage_order: myOrder }
      : null,
    last_call_info: lastCall && str(lastCall.content)
      ? { title: str(lastCall.title), content: str(lastCall.content) }
      : null,
    siblings,
    warnings,
  };
}

export function hashSections(sections: AdjustSections): Record<AdjustSection, string> {
  return Object.fromEntries(ADJUST_SECTIONS.map((s) => [s, stableHash(sections[s])])) as Record<
    AdjustSection,
    string
  >;
}

/** As objeções que valem para o roleplay, nas duas moradas. */
export function objectionRows(
  caseObjections: Array<Record<string, unknown>>,
  contextObjections: Array<Record<string, unknown>>,
  personaId: number | null,
): ObjectionRow[] {
  const caseRows = caseObjections
    .map((r) => toObjectionRow(r, "case_setup"))
    .filter((r): r is ObjectionRow => r != null);
  const ctxRows = contextObjections
    .filter((r) => r.case_setup_id == null)
    .map((r) => toObjectionRow(r, "context"))
    .filter((r): r is ObjectionRow => r != null);
  // O backend: com persona, usa SÓ as da persona se ela tiver alguma; senão as sem persona.
  const all = [...caseRows, ...ctxRows];
  if (personaId != null && all.some((r) => r.persona_id === personaId)) {
    return all.filter((r) => r.persona_id === personaId);
  }
  return all.filter((r) => r.persona_id == null);
}

export interface SaveResult {
  before: unknown;
  after: unknown;
  state: AdjustState;
  /** O que foi feito, em linguagem de gente (vai para o histórico). */
  summary: string[];
}

/** Aplica uma aba. `baseHash` = versão que a tela leu (409 se mudou). */
export async function saveAdjustSection(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  section: AdjustSection,
  value: unknown,
  baseHash: string,
): Promise<SaveResult> {
  const current = await loadAdjustState(env, token, caseSetupId);
  if (current.hashes[section] !== baseHash) {
    throw new AdjustConflictError("este trecho mudou desde que você abriu a tela — recarregue antes de salvar");
  }
  const { context_id: contextId, persona_id: personaId } = current.case_setup;
  const summary: string[] = [];

  switch (section) {
    case "general": {
      const patch = planGeneralPatch(current.sections.general, value as AdjustSections["general"]);
      if (Object.keys(patch).length > 0) {
        await patchCaseSetup(env, token, caseSetupId, patch);
        summary.push(`campos alterados: ${Object.keys(patch).join(", ")}`);
      }
      break;
    }
    case "prior_knowledge": {
      const next = (value as string[]).map((s) => s.trim()).filter(Boolean);
      if (stableHash(next) !== stableHash(current.sections.prior_knowledge)) {
        await setCaseSetupPriorKnowledge(env, token, caseSetupId, next);
        summary.push(`${next.length} item(ns) no que o comprador já sabe`);
      }
      break;
    }
    case "step_knowledge": {
      const patches = planStepKnowledgePatches(current.sections.step_knowledge, value as AdjustStepItem[]);
      for (const p of patches) await patchStepKnowledge(env, token, caseSetupId, p.id, p.patch);
      if (patches.length > 0) summary.push(`${patches.length} bloco(s) de conhecimento alterado(s)`);
      break;
    }
    case "objections": {
      const types = await listObjectionTypes(env, token);
      const caseObj = await listCaseSetupObjectionsFull(env, token, caseSetupId);
      const ctxObj = contextId != null ? await listContextObjectionsFull(env, token, contextId) : [];
      const plan = planObjectionChanges(objectionRows(caseObj, ctxObj, personaId), value as AdjustObjection[], {
        personaId,
        levels: DIFFICULTY_LEVEL_IDS,
        typeIdBySlug: new Map(types.map((t) => [t.slug, t.id])),
      });
      const scopeOf = (s: "case_setup" | "context") => {
        if (s === "context") {
          if (contextId == null) throw new AdjustValidationError("roleplay sem contexto");
          return { contextId };
        }
        return { caseSetupId };
      };
      for (const d of plan.deletes) await deleteObjection(env, token, scopeOf(d.scope), d.id);
      for (const p of plan.patches) await patchObjection(env, token, scopeOf(p.scope), p.id, p.patch);
      for (const c of plan.creates) {
        // deno-lint-ignore no-explicit-any
        const input = c.input as any;
        if (c.scope === "context") await createContextObjection(env, token, contextId!, input);
        else await createCaseSetupObjection(env, token, caseSetupId, input);
      }
      if (plan.deletes.length + plan.patches.length + plan.creates.length > 0) {
        summary.push(
          `objeções: ${plan.creates.length} linha(s) criada(s), ${plan.patches.length} alterada(s), ${plan.deletes.length} apagada(s)`,
        );
      }
      break;
    }
    case "persona": {
      const loaded = current.sections.persona;
      if (!loaded) throw new AdjustValidationError("roleplay sem persona travada");
      const plan = planPersonaChanges(loaded, value as AdjustPersona);
      if (plan.persona) {
        await updatePersona(env, token, loaded.id, plan.persona);
        summary.push(`persona: ${Object.keys(plan.persona).join(", ")}`);
      }
      if (plan.pains) {
        await setPersonaPains(env, token, loaded.id, plan.pains);
        summary.push(`${plan.pains.length} dor(es) ligadas à persona`);
      }
      if (plan.products) {
        await setPersonaOfferProducts(env, token, loaded.id, plan.products);
        summary.push(`${plan.products.length} postura(s) diante dos produtos`);
      }
      break;
    }
    case "guardrails": {
      if (contextId == null) throw new AdjustValidationError("roleplay sem contexto");
      const existing = (await listContextGuardrailsFull(env, token, contextId))
        .filter((g) => typeof g.id === "number")
        .map((g) => ({ id: g.id as number, name: str(g.name), prompt: str(g.prompt) }));
      const plan = planGuardrailChanges(existing, value as AdjustGuardrail[], contextId);
      for (const id of plan.deletes) await deleteContextGuardrail(env, token, contextId, id);
      for (const p of plan.patches) await patchContextGuardrail(env, token, contextId, p.id, p.patch);
      for (const c of plan.creates) await createContextGuardrail(env, token, contextId, c);
      if (plan.deletes.length + plan.patches.length + plan.creates.length > 0) {
        summary.push(
          `regras: ${plan.creates.length} criada(s), ${plan.patches.length} alterada(s), ${plan.deletes.length} apagada(s)`,
        );
      }
      break;
    }
    default:
      throw new AdjustValidationError(`aba desconhecida: ${section}`);
  }

  const state = await loadAdjustState(env, token, caseSetupId);
  return { before: current.sections[section], after: state.sections[section], state, summary };
}

export type RegenerateWhat = "behavior" | "next_stage_summary";

/** Ações com IA, opcionais: regenerar o comportamento, ou o resumo da etapa seguinte. */
export async function regenerate(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  what: RegenerateWhat,
): Promise<{ summary: string[] }> {
  if (what === "behavior") {
    await runCaseSetupRepairStep(env, token, caseSetupId, "behavior_guidance");
    await runCaseSetupRepairStep(env, token, caseSetupId, "update_prompt");
    return { summary: ["comportamento regenerado com IA"] };
  }
  const state = await loadAdjustState(env, token, caseSetupId);
  const next = state.siblings.filter((s) => s.is_next_stage);
  if (next.length === 0) throw new PerfectingError(400, "este roleplay não tem etapa seguinte no playbook");
  for (const s of next) await runCaseSetupRepairStep(env, token, s.case_setup_id, "last_call_info");
  return { summary: next.map((s) => `resumo da chamada anterior regenerado no roleplay ${s.case_setup_id}`) };
}
