/**
 * Monta em HML as Fases 2 (AVA, visita presencial) e 3 (proposta, negociação e
 * fechamento) da FIESC a partir de docs/FIESC-B2G/fase23-spec.json:
 *
 *   1 playbook com 2 etapas encadeadas (Fase 3 tem a Fase 2 como precedente),
 *   implementado uma vez por conta — contexto novo na oferta da Fase 1, persona
 *   travada com dores × produtos, guardrails no contexto, objeções por etapa,
 *   conhecimento por etapa reescrito, resumo da chamada anterior regenerado e
 *   1 container por conta.
 *
 * A Perfecting não tem "etapa desabilitada" e a implementação roda todas as etapas.
 * Por isso a Fase 3 é implementada junto e nasce escondida (role_play_status_id=1,
 * "Em desenvolvimento": só criador e admins veem). `--release-fase3` publica e a
 * coloca no container.
 *
 * Idempotente: os ids ficam em docs/FIESC-B2G/fase23-state.hml.json e cada passo
 * confere o que já existe antes de criar. Rodar de novo não duplica — exceto a
 * implementação, que só roda para conta sem case_setups no estado.
 *
 * Uso:
 *   deno run -A --env-file=.env.hml.local scripts/fiesc-fase23-hml.ts
 *     [--dry-run] [--only=vale-dourado] [--release-fase3] [--no-container]
 *
 * ⚠️ Cria dados reais na org do spec (14, Perfecting Demo). Nunca rode contra org de cliente.
 *
 * PROD (`--env=prod`, conta FIESC, org 52): o spec é o traduzido por
 * scripts/fiesc-fase23-map-prod.ts (fase23-spec.prod.json) e o estado é
 * fase23-state.prod.json. Em PROD:
 *   - `--as-user=<id>` é obrigatório: o criador é quem vê os roleplays em "Em
 *     desenvolvimento" (gestor só vê os que criou);
 *   - as DUAS etapas ficam em "Em desenvolvimento" (status 1). A implementação cria o
 *     roleplay sem status (NULL = visível a todos), então um verificador põe status 1 em
 *     todo roleplay novo do contexto a cada 3 s enquanto ela roda, e de novo no fim;
 *   - sem container, a não ser com `--container`.
 *
 *   deno run -A --env-file=.env.prod.local scripts/fiesc-fase23-hml.ts --env=prod \
 *     --as-user=269 [--dry-run] [--only=vale-dourado]
 */
import { applyContextContent, messageOf } from "../supabase/functions/_shared/context-content.ts";
import type { GuardrailSeed, ObjectionSeed } from "../supabase/functions/_shared/context-content.ts";
import { NO_INVENTED_NUMBERS } from "../supabase/functions/_shared/dossier.ts";
import { sseEvents } from "../supabase/functions/_shared/sse.ts";
import {
  addPlaybookCallTypeMethodology,
  countPlaybookCallBlockRubrics,
  createCaseSetupObjection,
  createContext,
  createPersonaCompany,
  createPlaybookCallBlock,
  DIFFICULTY_LEVEL_IDS,
  findManagerUserId,
  generateContext,
  generateDossierPersona,
  generatePlaybookCallTypeRubrics,
  getCaseSetup,
  getEnvConfig,
  getRolePlayPrompt,
  listCallContexts,
  listCaseSetupIdsByContext,
  listMethodologies,
  listMethodologySteps,
  listObjectionTypes,
  listPersonasByContext,
  listPlaybookCallBlocks,
  listStepKnowledgeItems,
  loginAsUser,
  loginSuperadmin,
  openPlaybookImplementationStream,
  patchCaseSetup,
  patchStepKnowledge,
  runCaseSetupRepairStep,
  setCaseSetupPriorKnowledge,
  setPersonaOfferProducts,
  setPersonaPains,
  truncateForApi,
  updatePersona,
} from "../supabase/functions/_shared/perfecting.ts";

const envArg = Deno.args.find((a) => a.startsWith("--env="));
const ENV = (envArg ? envArg.slice("--env=".length) : "hml") as "hml" | "prod";
if (ENV !== "hml" && ENV !== "prod") throw new Error(`--env inválido: ${ENV}`);
const IS_PROD = ENV === "prod";
const ROOT = new URL("..", import.meta.url);
const SPEC_PATH = new URL(`docs/FIESC-B2G/fase23-spec${IS_PROD ? ".prod" : ""}.json`, ROOT);
const STATE_PATH = new URL(`docs/FIESC-B2G/fase23-state.${ENV}.json`, ROOT);

// ── Spec ───────────────────────────────────────────────────────────────────
type StageKey = "fase2" | "fase3";

interface BlockSpec {
  name: string;
  description: string;
  objective: string;
  sample_questions: string[];
  what_to_do: string[];
  what_to_avoid: string[];
}

interface CallTypeSpec {
  key: StageKey;
  name: string;
  description: string;
  call_context_slug: string;
  pain_offer_stage: "discovery" | "negotiation";
  hidden_until_release?: boolean;
  blocks: BlockSpec[];
}

interface StageContent {
  training_name: string;
  previo: string;
  briefing: Record<string, string>;
  fatos: Record<string, string>;
  abertura: string[];
  objecoes: ObjectionSeed[];
}

interface AccountSpec {
  key: string;
  rotulo: string;
  fase1_case_setup_id: number;
  offer_id: number;
  context: { name: string; instructions: string };
  persona: {
    nome: string;
    genero: string;
    cargo: string;
    area: string;
    empresa_nome: string;
    empresa_perfil: string;
    instrucoes_geracao: string;
    prompt: string;
    dores: Array<{ offer_pain_id: number; revelacao: "surface" | "probed" | "hidden"; detalhe: string }>;
    produtos: Array<{ offer_product_id: number; postura: string }>;
  };
  guardrails: GuardrailSeed[];
  fases: Record<StageKey, StageContent>;
  container: { title: string; description: string };
}

interface Spec {
  org_id: number;
  methodology_slug: string;
  difficulty_level_id: number;
  playbook: { name: string; call_types: CallTypeSpec[] };
  contas: AccountSpec[];
}

// ── Estado ─────────────────────────────────────────────────────────────────
interface AccountState {
  context_id?: number;
  company_id?: number;
  persona_id?: number;
  case_setups?: Partial<Record<StageKey, number>>;
  container_id?: number;
  released_fase3?: boolean;
}

interface State {
  playbook_id?: number;
  call_types?: Partial<Record<StageKey, number>>;
  blocks?: Partial<Record<StageKey, number[]>>;
  contas?: Record<string, AccountState>;
}

const args = new Set(Deno.args);
const DRY = args.has("--dry-run");
const RELEASE = args.has("--release-fase3");
const WITH_CONTAINER = IS_PROD ? args.has("--container") : !args.has("--no-container");
const asUserArg = Deno.args.find((a) => a.startsWith("--as-user="));
const AS_USER = asUserArg ? Number(asUserArg.slice("--as-user=".length)) : null;
if (IS_PROD && (AS_USER == null || !Number.isFinite(AS_USER))) {
  throw new Error("--as-user=<id> é obrigatório em PROD (sem ele o criador seria um gestor do cliente)");
}
/** PROD: as duas etapas nascem e ficam em "Em desenvolvimento". */
const HIDE_ALL = IS_PROD;
const onlyArg = Deno.args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length) : null;

const spec: Spec = JSON.parse(await Deno.readTextFile(SPEC_PATH));
const state: State = await Deno.readTextFile(STATE_PATH).then(JSON.parse).catch(() => ({}));
const warnings: string[] = [];

async function saveState() {
  if (DRY) return;
  await Deno.writeTextFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

const log = (msg: string) => console.log(msg);
const warn = (msg: string) => {
  warnings.push(msg);
  console.warn(`  ⚠️  ${msg}`);
};
const norm = (s: string) => s.trim().toLowerCase();

/** Rotas sem helper nas Edge Functions (só este script usa). */
async function api<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getEnvConfig(ENV).api}/role_plays${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${raw.slice(0, 500)}`);
  return (raw ? JSON.parse(raw) : {}) as T;
}

const items = (data: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(data) ? data : ((data as { items?: unknown[] })?.items ?? [])) as Array<Record<string, unknown>>;

// ── 0) Auth e catálogos ────────────────────────────────────────────────────
log(`Ambiente: ${getEnvConfig(ENV).api} · org ${spec.org_id}${DRY ? " · DRY RUN" : ""}${ONLY ? ` · só ${ONLY}` : ""}`);
const saToken = await loginSuperadmin(ENV);
const userId = AS_USER ?? (await findManagerUserId(ENV, saToken, spec.org_id));
if (userId == null) throw new Error(`nenhum usuário na org ${spec.org_id}`);
const token = await loginAsUser(ENV, saToken, userId, spec.org_id);
log(`✓ login como usuário ${userId}`);

const methodology = (await listMethodologies(ENV, token)).find((m) => m.slug === spec.methodology_slug);
if (!methodology) throw new Error(`metodologia ${spec.methodology_slug} não encontrada`);
const callContexts = await listCallContexts(ENV, token);
const callContextId = (slug: string) => {
  const found = callContexts.find((c) => c.slug === slug);
  if (!found) throw new Error(`tipo de chamada ${slug} não encontrado em /call_contexts`);
  return found.id;
};
const objectionTypes = await listObjectionTypes(ENV, token);
const objectionTypeId = (slug: string) =>
  objectionTypes.find((t) => t.slug === slug)?.id ?? objectionTypes[0]?.id;
const methodologyStepOrder = new Map(
  (await listMethodologySteps(ENV, token, methodology.id)).map((s) => [s.id, s.order ?? 0]),
);
log(`✓ metodologia ${methodology.name} (${methodology.id})`);

// ── 1) Playbook: 2 etapas encadeadas, blocos, metodologia e rubricas ──────
if (state.playbook_id == null) {
  const existing = items(await api<unknown>("GET", "/playbook/list", token)).find(
    (p) => p.name === spec.playbook.name,
  );
  if (existing) {
    state.playbook_id = existing.id as number;
  } else if (DRY) {
    log(`· criaria o playbook "${spec.playbook.name}"`);
  } else {
    state.playbook_id = (await api<{ id: number }>("POST", "/playbook/create", token, {
      name: spec.playbook.name,
    })).id;
  }
  await saveState();
}
const playbookId = state.playbook_id;
if (playbookId != null) log(`✓ playbook ${playbookId}`);

state.call_types ??= {};
state.blocks ??= {};
let previousCallTypeId: number | null = null;
for (const [order, ct] of spec.playbook.call_types.entries()) {
  if (playbookId == null) {
    log(`· criaria a etapa "${ct.name}" com ${ct.blocks.length} blocos`);
    continue;
  }
  if (state.call_types[ct.key] == null) {
    if (DRY) {
      log(`· criaria a etapa "${ct.name}" com ${ct.blocks.length} blocos`);
      continue;
    }
    state.call_types[ct.key] = (await api<{ id: number }>("POST", `/playbook_${playbookId}/call_types`, token, {
      name: ct.name,
      description: ct.description,
      call_context_type_id: callContextId(ct.call_context_slug),
      order,
      pain_offer_stage: ct.pain_offer_stage,
      ...(previousCallTypeId != null && { precedent_call_type_id: previousCallTypeId }),
    })).id;
    await saveState();
    await addPlaybookCallTypeMethodology(ENV, token, playbookId, state.call_types[ct.key]!, methodology.id);
  }
  const callTypeId = state.call_types[ct.key]!;
  previousCallTypeId = callTypeId;

  // Blocos: confere pelo nome o que já existe (a API não tem upsert).
  const existingBlocks = await listPlaybookCallBlocks(ENV, token, playbookId, callTypeId);
  const blockIds: number[] = [];
  for (const [i, b] of ct.blocks.entries()) {
    const found = existingBlocks.find((e) => norm(e.name) === norm(b.name));
    if (found) {
      blockIds.push(found.id);
      continue;
    }
    if (DRY) continue;
    blockIds.push(
      await createPlaybookCallBlock(ENV, token, playbookId, callTypeId, { ...b, order: i }),
    );
  }
  state.blocks[ct.key] = blockIds;
  await saveState();

  // Rubricas por bloco (IA): é nelas que a avaliação da sessão de playbook se apoia.
  if (!DRY) {
    const withRubrics = await Promise.all(
      blockIds.map((id) => countPlaybookCallBlockRubrics(ENV, token, playbookId, callTypeId, id)),
    );
    if (withRubrics.some((n) => n === 0)) {
      log(`… gerando rubricas dos blocos de "${ct.name}"`);
      try {
        await generatePlaybookCallTypeRubrics(ENV, token, playbookId, callTypeId);
      } catch (e) {
        warn(`rubricas de "${ct.name}": ${messageOf(e)} (pode ter continuado no servidor)`);
      }
    }
  }
  log(`✓ etapa "${ct.name}" (${callTypeId}): ${blockIds.length} blocos`);
}

// ── 2) Contas ──────────────────────────────────────────────────────────────
state.contas ??= {};
for (const conta of spec.contas) {
  if (ONLY && conta.key !== ONLY) continue;
  log(`\n━━ ${conta.rotulo} ━━`);
  const st: AccountState = (state.contas[conta.key] ??= {});

  // 2a) Contexto novo na oferta da Fase 1 (o da Fase 1 tem objeções e guardrails
  // de cold call, que vazariam para estas etapas).
  if (st.context_id == null) {
    if (DRY) {
      log(`· criaria o contexto "${conta.context.name}" na oferta ${conta.offer_id}`);
    } else {
      log(`… gerando o contexto "${conta.context.name}"`);
      const generated = await generateContext(ENV, token, conta.offer_id, truncateForApi(conta.context.instructions));
      generated.name = conta.context.name;
      st.context_id = await createContext(ENV, token, generated, conta.offer_id);
      await saveState();
    }
  }
  const contextId = st.context_id;
  if (contextId != null) log(`✓ contexto ${contextId}`);

  // 2b) Persona com dores × produtos da oferta, travada nas duas etapas.
  const p = conta.persona;
  const pains = p.dores.map((d) => ({
    offer_pain_id: d.offer_pain_id,
    reveal_level: d.revelacao,
    persona_specific_detail: d.detalhe,
  }));
  const products = p.produtos.map((x) => ({ offer_product_id: x.offer_product_id, buyer_product_stance: x.postura }));
  if (contextId != null && st.persona_id == null) {
    const found = (await listPersonasByContext(ENV, token, contextId)).find((e) => e.name === p.nome);
    if (found) {
      st.persona_id = found.id;
    } else if (!DRY) {
      log(`… gerando a persona ${p.nome}`);
      try {
        st.company_id ??= await createPersonaCompany(ENV, token, {
          slug: `fiesc-f23-${conta.key}-${contextId}`,
          name: p.empresa_nome,
          context_id: contextId,
          company_profile: p.empresa_perfil,
        });
      } catch (e) {
        warn(`empresa de ${p.nome} não criada: ${messageOf(e)}`);
      }
      const created = await generateDossierPersona(ENV, token, {
        context_id: contextId,
        persona_company_id: st.company_id ?? null,
        persona_name: p.nome,
        additional_instructions: `${p.instrucoes_geracao} Gênero: ${p.genero}.`,
        pains,
        products,
      });
      st.persona_id = created.id;
    }
    await saveState();
  }
  const personaId = st.persona_id;
  if (personaId != null && !DRY) {
    // O spec sempre por cima do que a IA gerou (reaplicar é inofensivo).
    await updatePersona(ENV, token, personaId, {
      name: p.nome,
      job_title: p.cargo,
      department: p.area,
      persona_prompt: p.prompt,
    });
    await setPersonaPains(ENV, token, personaId, pains);
    await setPersonaOfferProducts(ENV, token, personaId, products);
    log(`✓ persona ${p.nome} (${personaId}): ${pains.length} dores, ${products.length} produtos`);
  } else {
    log(`· criaria a persona ${p.nome} (${p.cargo})`);
  }

  // 2c) Guardrails do contexto (valem para as duas etapas).
  if (!DRY && contextId != null) {
    // Nome de guardrail é único no banco inteiro: sufixo do contexto.
    const guardrails = conta.guardrails.map((g) => ({ ...g, nome: `${g.nome} · ctx ${contextId}` }));
    const g = await applyContextContent(ENV, token, contextId, [], guardrails, DIFFICULTY_LEVEL_IDS);
    log(`✓ guardrails: ${g.guardrails_created} criados, ${g.guardrails_skipped} já existiam`);
    g.warnings.forEach(warn);
  }

  // 2d) Implementação: as duas etapas de uma vez, persona travada.
  st.case_setups ??= {};
  if (DRY || playbookId == null || contextId == null || personaId == null) {
    log("· implementaria o playbook neste contexto (2 roleplays)");
    continue;
  }
  if (st.case_setups.fase2 == null || st.case_setups.fase3 == null) {
    const before = new Set(await listCaseSetupIdsByContext(ENV, token, contextId));
    // PROD: o roleplay nasce sem status (visível a todos). Esconde cada um que aparecer,
    // em todo tick (o pipeline continua gravando a linha), até a implementação acabar.
    const seenNew = new Set<number>();
    let hiding = false;
    const hideTick = async () => {
      if (hiding) return;
      hiding = true;
      try {
        for (const id of await listCaseSetupIdsByContext(ENV, token, contextId)) {
          if (before.has(id)) continue;
          if (!seenNew.has(id)) log(`  ⤷ roleplay ${id} apareceu: Em desenvolvimento`);
          seenNew.add(id);
          await patchCaseSetup(ENV, token, id, { role_play_status_id: 1 });
        }
      } catch (e) {
        warn(`verificador de status: ${messageOf(e)}`);
      } finally {
        hiding = false;
      }
    };
    const hider = HIDE_ALL ? setInterval(hideTick, 3000) : null;
    log("… implementando o playbook (demora vários minutos)");
    const res = await openPlaybookImplementationStream(ENV, token, playbookId, contextId, personaId);
    try {
    for await (const { event, data } of sseEvents(res)) {
      if (event === "heartbeat") continue;
      const payload = (data ?? {}) as Record<string, unknown>;
      if (event === "stage_update") {
        log(`  ${payload.stage ?? ""} ${payload.call_type_index ?? ""}/${payload.call_type_total ?? ""}`);
      } else if (event === "implementation_ready") {
        log(`  pronto: ${JSON.stringify(payload.results ?? []).slice(0, 400)}`);
        break;
      } else if (event === "error") {
        throw new Error(`implementação falhou: ${JSON.stringify(payload).slice(0, 500)}`);
      }
    }
    } finally {
      if (hider != null) {
        clearInterval(hider);
        while (hiding) await new Promise((r) => setTimeout(r, 200));
        await hideTick();
      }
    }
    const created = (await listCaseSetupIdsByContext(ENV, token, contextId)).filter((id) => !before.has(id));
    for (const id of created) {
      const cs = await getCaseSetup(ENV, token, id);
      const key = (Object.entries(state.call_types!) as Array<[StageKey, number]>).find(
        ([, ctId]) => ctId === cs.playbook_call_type_id,
      )?.[0];
      if (key) st.case_setups[key] = id;
    }
    await saveState();
  }
  const cs2 = st.case_setups.fase2;
  const cs3 = st.case_setups.fase3;
  if (cs2 == null || cs3 == null) {
    // A Fase 3 nasce visível: esconde já, mesmo com a implementação pela metade.
    if (cs3 != null && !st.released_fase3) await patchCaseSetup(ENV, token, cs3, { role_play_status_id: 1 });
    if (cs2 != null && HIDE_ALL) await patchCaseSetup(ENV, token, cs2, { role_play_status_id: 1 });
    warn(
      `implementação incompleta: ${JSON.stringify(st.case_setups)}. Para refazer sem duplicar, ` +
        "apague o roleplay criado (DELETE /case_setup_{id}), limpe case_setups da conta no estado e rode de novo.",
    );
    continue;
  }
  log(`✓ roleplays: Fase 2 = ${cs2}, Fase 3 = ${cs3}`);

  // 2e) Conteúdo de cada etapa: nome, abertura, prévio, objeções, conhecimento.
  for (const stage of ["fase2", "fase3"] as const) {
    const csId = st.case_setups[stage]!;
    const c = conta.fases[stage];
    const cs = await getCaseSetup(ENV, token, csId);
    if (cs.persona_id !== personaId) warn(`${stage} (${csId}) travado na persona ${cs.persona_id}, esperado ${personaId}`);

    await patchCaseSetup(ENV, token, csId, {
      training_name: c.training_name,
      buyer_agent_first_messages: c.abertura,
      difficulty_level_id: spec.difficulty_level_id,
    });
    await setCaseSetupPriorKnowledge(ENV, token, csId, [c.previo]);

    // Objeções: as do spec por etapa, com persona_id (o backend usa SÓ as da persona
    // quando ela tem alguma — as geradas pela IA saem, no roleplay e no contexto).
    const specTitles = new Set(c.objecoes.map((o) => norm(o.titulo)));
    const allSpecTitles = new Set(
      (Object.values(conta.fases) as StageContent[]).flatMap((f) => f.objecoes.map((o) => norm(o.titulo))),
    );
    const csObjections = items(await api<unknown>("GET", `/case_setup_${csId}/objections`, token));
    for (const o of csObjections) {
      if (!specTitles.has(norm(String(o.title ?? "")))) {
        await api("DELETE", `/case_setup_${csId}/objections/${o.id}`, token);
      }
    }
    const ctxObjections = items(await api<unknown>("GET", `/context_${contextId}/objections`, token));
    for (const o of ctxObjections) {
      if (o.case_setup_id == null && !allSpecTitles.has(norm(String(o.title ?? "")))) {
        await api("DELETE", `/context_${contextId}/objections/${o.id}`, token);
      }
    }
    const seen = new Set(
      csObjections
        .filter((o) => specTitles.has(norm(String(o.title ?? ""))))
        .map((o) => `${norm(String(o.title))}|${o.difficulty_level_id}`),
    );
    let createdObjections = 0;
    for (const o of c.objecoes) {
      const typeId = objectionTypeId(o.tipo);
      if (typeId == null) continue;
      for (const level of DIFFICULTY_LEVEL_IDS) {
        if (seen.has(`${norm(o.titulo)}|${level}`)) continue;
        await createCaseSetupObjection(ENV, token, csId, {
          objection_type_id: typeId,
          difficulty_level_id: level,
          title: o.titulo.trim(),
          description: o.fala_exemplo,
          details: o.detalhes,
          to_give_in_if: o.ceder_se,
          persona_id: personaId,
        });
        createdObjections++;
      }
    }
    log(`✓ ${stage}: ${c.objecoes.length} objeções (${createdObjections} linhas novas)`);

    // Conhecimento por etapa: o prévio e a abertura só na 1ª (nas outras a conversa
    // já está em andamento); fatos e briefing em todas, sem os números inventados.
    const skItems = (await listStepKnowledgeItems(ENV, token, csId, personaId)).filter(
      (it) => it.persona_id === personaId,
    );
    const orderOf = (it: (typeof skItems)[number]) => {
      const orders = it.methodology_step_ids
        .map((id) => methodologyStepOrder.get(id))
        .filter((n): n is number => n != null);
      return orders.length > 0 ? Math.min(...orders) : 1e9;
    };
    const sorted = [...skItems].sort((a, b) => orderOf(a) - orderOf(b) || a.id - b.id);
    for (const [i, it] of sorted.entries()) {
      await patchStepKnowledge(ENV, token, csId, it.id, {
        prior_knowledge_prompt: i === 0 ? c.previo : "",
        knowledge_prompt_details: { ...c.fatos, Regra: NO_INVENTED_NUMBERS },
        prior_knowledge_user_briefing: c.briefing,
        ...(i === 0 && { buyer_agent_first_messages: c.abertura }),
      });
    }
    log(`✓ ${stage}: ${sorted.length} blocos de conhecimento reescritos`);
    if (sorted.length === 0) warn(`${stage} (${csId}) ficou sem conhecimento por etapa`);
  }

  // 2f) Fase 3: resumo da chamada anterior a partir da Fase 2 já corrigida.
  try {
    await api("POST", `/case_setup_${cs3}/playbook_last_call_info/regenerate`, token, {});
    log("✓ fase3: resumo da chamada anterior regenerado");
  } catch (e) {
    warn(`resumo da chamada anterior da Fase 3: ${messageOf(e)}`);
  }

  // 2g) Comportamento e prompt, depois de todo o conteúdo final.
  for (const csId of [cs2, cs3]) {
    await runCaseSetupRepairStep(ENV, token, csId, "behavior_guidance");
    await runCaseSetupRepairStep(ENV, token, csId, "update_prompt");
  }
  log("✓ comportamento e prompt");

  // 2h) Fase 3 escondida até a liberação.
  if (RELEASE) {
    await patchCaseSetup(ENV, token, cs3, { role_play_status_id: 3 });
    st.released_fase3 = true;
    log("✓ fase3 publicada");
  } else if (!st.released_fase3) {
    await patchCaseSetup(ENV, token, cs3, { role_play_status_id: 1 });
    log("✓ fase3 escondida (Em desenvolvimento)");
  }
  if (HIDE_ALL) {
    await patchCaseSetup(ENV, token, cs2, { role_play_status_id: 1 });
    log("✓ fase2 escondida (Em desenvolvimento)");
  }
  await saveState();

  // 2i) Container da conta: Fase 2 (e a Fase 3 depois da liberação). Os roleplays da
  // Fase 1 ficam no container 9 — um roleplay só pertence a um container.
  if (WITH_CONTAINER) {
    try {
      if (st.container_id == null) {
        const found = items(await api<unknown>("GET", "/containers/list", token)).find(
          (c) => c.title === conta.container.title,
        );
        st.container_id =
          (found?.id as number | undefined) ??
          (await api<{ id: number }>("POST", "/containers/create", token, conta.container)).id;
        await saveState();
      }
      const order = st.released_fase3 ? [cs2, cs3] : [cs2];
      for (const [i, id] of order.entries()) {
        await api("POST", `/containers/${st.container_id}/role_plays/assign`, token, {
          case_setup_id: id,
          container_order: i + 1,
        });
      }
      log(`✓ container ${st.container_id}: ${order.join(" → ")}`);
    } catch (e) {
      warn(`container não montado: ${messageOf(e)}`);
    }
  }

  // 2j) Gate: o prompt remontado de cada etapa.
  for (const stage of ["fase2", "fase3"] as const) {
    const csId = st.case_setups[stage]!;
    const gate = await getRolePlayPrompt(ENV, token, csId);
    const flags = ["has_persona", "has_behavior_guidance", "has_knowledge_blocks", "has_objections", "has_difficulty_level"] as const;
    const missing = flags.filter((f) => !gate[f]);
    log(`  gate ${stage} (${csId}): ${missing.length === 0 ? "ok" : `faltou ${missing.join(", ")}`}`);
    if (missing.length > 0) warn(`${conta.key} ${stage}: faltou ${missing.join(", ")}`);
    if (!gate.prompt || String(gate.prompt).trim().length === 0) warn(`${conta.key} ${stage}: prompt do comprador vazio`);
    if (HIDE_ALL) {
      // O token do login-como é superadmin e vê tudo: a prova de "escondido" é o dado.
      const raw = await api<Record<string, unknown>>("GET", `/case_setup_${csId}`, token);
      const status = raw.role_play_status_id;
      const creatorId = raw.created_by_user_id;
      log(`  visibilidade ${stage} (${csId}): status ${String(status)}, criador ${String(creatorId)}`);
      if (status !== 1) warn(`${conta.key} ${stage} (${csId}): status ${String(status)}, esperado 1`);
      if (creatorId !== undefined && creatorId !== AS_USER) {
        warn(`${conta.key} ${stage} (${csId}): criador ${String(creatorId)}, esperado ${AS_USER}`);
      }
    }
    await Deno.writeTextFile(
      new URL(`docs/FIESC-B2G/fase23-prompt-${conta.key}-${stage}.${ENV}.md`, ROOT),
      `<!-- prompt remontado por /role_play_prompt em ${new Date().toISOString()} -->\n\n${gate.prompt}\n`,
    );
  }
}

log(`\nIds: ${JSON.stringify(state)}`);
if (warnings.length > 0) {
  log(`\n${warnings.length} aviso(s):`);
  warnings.forEach((w) => log(`  - ${w}`));
}
