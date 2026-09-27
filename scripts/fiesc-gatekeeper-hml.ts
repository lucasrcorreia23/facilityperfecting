/**
 * Monta em HML o roleplay de gatekeeper da FIESC a partir de
 * docs/FIESC-B2G/gatekeeper-spec.json: 1 contexto, 3 personas (uma por conta),
 * 1 case_setup sem persona travada (o vendedor escolhe a conta na hora da call),
 * objeções por persona, guardrails do contexto, conhecimento por persona e
 * rubricas do vendedor. Reaproveita os helpers das Edge Functions.
 *
 * Idempotente: os ids ficam em docs/FIESC-B2G/gatekeeper-state.hml.json e cada
 * passo confere o que já existe antes de criar. Rodar de novo não duplica.
 *
 * Uso:
 *   PERFECTING_HML_SUPERADMIN_EMAIL=... PERFECTING_HML_SUPERADMIN_PASSWORD=... \
 *   deno run -A scripts/fiesc-gatekeeper-hml.ts [--dry-run] [--call-type-id=N] [--no-container]
 *     [--state=docs/FIESC-B2G/outro-estado.json]   (estado novo = contexto e roleplay novos)
 *
 * O tipo "Ligação para Ultrapassar o Gatekeeper" existe no seed mas está inativo,
 * então não aparece em /call_contexts. O create aceita o id mesmo assim (não
 * checa is_active). Sem --call-type-id o id é inferido pela ordem do seed
 * (Cold Call + 4) e conferido no texto que o /generate devolve antes do create.
 *
 * ⚠️ Cria dados reais na org do spec (14, Perfecting Demo). Nunca rode contra org de cliente.
 */
import { applyContextContent, messageOf } from "../supabase/functions/_shared/context-content.ts";
import { NO_INVENTED_NUMBERS } from "../supabase/functions/_shared/dossier.ts";
import {
  createCaseSetup,
  createCaseSetupRubric,
  createContext,
  deleteCaseSetupRubric,
  findManagerUserId,
  generateCaseSetup,
  generateCaseSetupRubrics,
  generateContext,
  generateDossierPersona,
  generateStepKnowledge,
  getCaseSetup,
  getEnvConfig,
  getRolePlayPrompt,
  listCallContexts,
  listCaseSetupMethodologies,
  listCaseSetupRubrics,
  listCaseSetupRubricsFull,
  listContextObjections,
  listFeedbackRubricTypes,
  listPersonasByContext,
  listStepKnowledge,
  listStepKnowledgeItems,
  loginAsUser,
  loginSuperadmin,
  patchCaseSetup,
  patchStepKnowledge,
  createPersonaCompany,
  DIFFICULTY_LEVEL_IDS,
  runCaseSetupRepairStep,
  setCaseSetupMethodologies,
  truncateForApi,
  updatePersona,
} from "../supabase/functions/_shared/perfecting.ts";
import type { GuardrailSeed, ObjectionSeed } from "../supabase/functions/_shared/context-content.ts";

const ENV = "hml" as const;
const ROOT = new URL("..", import.meta.url);
const SPEC_PATH = new URL("docs/FIESC-B2G/gatekeeper-spec.json", ROOT);
// --state=<caminho relativo à raiz>: outro estado = outro roleplay (contexto novo).
const stateArg = Deno.args.find((a) => a.startsWith("--state="));
const STATE_PATH = new URL(
  stateArg ? stateArg.slice("--state=".length) : "docs/FIESC-B2G/gatekeeper-state.hml.json",
  ROOT,
);
const GATEKEEPER_SLUG = "ligacao_para_ultrapassar_o_gatekeeper";
/** Ordem do seed: Cold Call é o 1º tipo de Prospecção e o Gatekeeper o 5º. */
const GATEKEEPER_OFFSET_FROM_COLD_CALL = 4;

interface Rubric {
  criterio: string;
  descricao: string;
  dica: string;
}

interface PersonaSpec {
  key: string;
  nome: string;
  cargo: string;
  area: string;
  genero: string;
  empresa_nome: string;
  empresa_perfil: string;
  instrucoes_geracao: string;
  prompt: string;
  abertura: string[];
  conhecimento: { previo: string; fatos: Record<string, string>; briefing: Record<string, string> };
  objecoes: ObjectionSeed[];
}

interface Spec {
  org_id: number;
  offer_id: number;
  methodology_id: number;
  difficulty: string;
  difficulty_level_id: number;
  call_type_name: string;
  training_name: string;
  context: { name: string; instructions: string };
  case_setup: {
    training_objective: string;
    training_targeted_sales_skills: string;
    aditional_instructions: string;
    first_messages: string[];
    rubricas: Rubric[];
  };
  guardrails: GuardrailSeed[];
  personas: PersonaSpec[];
  container: { title: string; description: string; then_case_setup_ids: number[] };
}

interface State {
  context_id?: number;
  call_context_type_id?: number;
  personas?: Record<string, number>;
  case_setup_id?: number;
  container_id?: number;
}

const args = new Set(Deno.args);
const DRY = args.has("--dry-run");
const WITH_CONTAINER = !args.has("--no-container");
const callTypeArg = Deno.args.find((a) => a.startsWith("--call-type-id="));
const CALL_TYPE_OVERRIDE = callTypeArg ? Number(callTypeArg.split("=")[1]) : undefined;

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Containers: sem helper nas Edge Functions (só este script usa) ─────────
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

// ── 0) Auth ────────────────────────────────────────────────────────────────
log(`Ambiente: ${getEnvConfig(ENV).api} · org ${spec.org_id}${DRY ? " · DRY RUN" : ""}`);
const saToken = await loginSuperadmin(ENV);
const userId = await findManagerUserId(ENV, saToken, spec.org_id);
if (userId == null) throw new Error(`nenhum usuário na org ${spec.org_id}`);
const token = await loginAsUser(ENV, saToken, userId, spec.org_id);
log(`✓ login como usuário ${userId}`);

// ── 1) Tipo de ligação ─────────────────────────────────────────────────────
const callContexts = await listCallContexts(ENV, token);
const activeGatekeeper = callContexts.find((c) => c.slug === GATEKEEPER_SLUG);
const coldCall = callContexts.find((c) => c.slug.endsWith("cold_call"));
let callTypeId: number | undefined =
  CALL_TYPE_OVERRIDE ?? state.call_context_type_id ?? activeGatekeeper?.id;
let callTypeInferred = false;
if (callTypeId == null) {
  if (!coldCall) throw new Error("Cold Call não encontrado em /call_contexts; passe --call-type-id=N");
  callTypeId = coldCall.id + GATEKEEPER_OFFSET_FROM_COLD_CALL;
  callTypeInferred = true;
}
log(
  `✓ tipo de ligação ${callTypeId} (${
    CALL_TYPE_OVERRIDE != null
      ? "--call-type-id"
      : activeGatekeeper
        ? "ativo em /call_contexts"
        : callTypeInferred
          ? `inferido: Cold Call ${coldCall!.id} + ${GATEKEEPER_OFFSET_FROM_COLD_CALL}, conferido no /generate`
          : "do estado"
  })`,
);

// ── 2) Contexto ────────────────────────────────────────────────────────────
if (state.context_id == null) {
  if (DRY) {
    log(`· criaria o contexto "${spec.context.name}" na oferta ${spec.offer_id}`);
  } else {
    log(`… gerando o contexto "${spec.context.name}"`);
    const generated = await generateContext(ENV, token, spec.offer_id, truncateForApi(spec.context.instructions));
    generated.name = spec.context.name;
    state.context_id = await createContext(ENV, token, generated, spec.offer_id);
    await saveState();
    log(`✓ contexto ${state.context_id}`);
  }
} else {
  log(`✓ contexto ${state.context_id} (do estado)`);
}
const contextId = state.context_id;

// ── 3) Personas ────────────────────────────────────────────────────────────
state.personas ??= {};
const existingPersonas = contextId != null ? await listPersonasByContext(ENV, token, contextId) : [];
for (const p of spec.personas) {
  const byState = state.personas[p.key];
  const found = existingPersonas.find((e) => e.id === byState || e.name === p.nome);
  if (found) {
    state.personas[p.key] = found.id;
    log(`✓ persona ${p.nome} (${found.id}, já existia)`);
  } else if (DRY || contextId == null) {
    log(`· criaria a persona ${p.nome} (${p.cargo}, ${p.empresa_nome})`);
    continue;
  } else {
    log(`… gerando a persona ${p.nome}`);
    let companyId: number | null = null;
    try {
      companyId = await createPersonaCompany(ENV, token, {
        slug: `fiesc-gk-${p.key}-${contextId}`,
        name: p.empresa_nome,
        context_id: contextId,
        company_profile: p.empresa_perfil,
      });
    } catch (e) {
      warn(`empresa de ${p.nome} não criada: ${messageOf(e)}`);
    }
    // generate_from_context escolhe gênero e voz a partir do nome e das instruções.
    const created = await generateDossierPersona(ENV, token, {
      context_id: contextId,
      persona_company_id: companyId,
      persona_name: p.nome,
      additional_instructions: `${p.instrucoes_geracao} Gênero: ${p.genero}. Esta pessoa NÃO é o comprador: é quem atende a ligação e filtra o acesso ao decisor.`,
    });
    state.personas[p.key] = created.id;
    await saveState();
    log(`✓ persona ${p.nome} (${created.id})`);
  }
  // O prompt do spec sempre por cima do que a IA gerou (reaplicar é inofensivo).
  if (!DRY) {
    await updatePersona(ENV, token, state.personas[p.key], {
      name: p.nome,
      job_title: p.cargo,
      department: p.area,
      persona_prompt: p.prompt,
    });
  }
}

// ── 4) Guardrails do contexto + objeções por persona ───────────────────────
if (!DRY && contextId != null) {
  // Os três níveis: o prompt usa só objeções do nível escolhido naquela call.
  const levels = DIFFICULTY_LEVEL_IDS;
  const g = await applyContextContent(ENV, token, contextId, [], spec.guardrails, levels);
  log(`✓ guardrails: ${g.guardrails_created} criados, ${g.guardrails_skipped} já existiam`);
  g.warnings.forEach(warn);
  for (const p of spec.personas) {
    const personaId = state.personas[p.key];
    const o = await applyContextContent(ENV, token, contextId, p.objecoes, [], levels, personaId);
    log(`✓ objeções de ${p.nome}: ${o.objections_created} criadas, ${o.objections_skipped} já existiam`);
    o.warnings.forEach(warn);
  }
} else {
  log(`· criaria ${spec.guardrails.length} guardrails e ${spec.personas.map((p) => p.objecoes.length).join("+")} objeções`);
}

// ── 5) Case_setup ──────────────────────────────────────────────────────────
if (state.case_setup_id == null) {
  if (DRY || contextId == null) {
    log(`· geraria e criaria o case_setup "${spec.training_name}" (tipo ${callTypeId}, sem persona travada)`);
  } else {
    log("… gerando o case_setup (/role_plays/generate)");
    const generated = await generateCaseSetup(ENV, token, contextId, {
      call_context_type_id: callTypeId,
      scenario_difficulty_level: spec.difficulty,
      training_objective: spec.case_setup.training_objective,
      training_targeted_sales_skills: spec.case_setup.training_targeted_sales_skills,
      aditional_instructions: truncateForApi(spec.case_setup.aditional_instructions),
    });
    // Id inferido: o /generate lê o tipo pelo id; se o texto não fala de triagem, o id
    // pegou outro tipo — melhor parar antes de criar do que ter um roleplay errado.
    if (callTypeInferred && !/gatekeeper|decisor|secret[aá]ri|triagem/i.test(JSON.stringify(generated))) {
      throw new Error(
        `o id ${callTypeId} não parece ser o tipo Gatekeeper (o /generate não fala de triagem). ` +
          "Descubra o id no banco de HML e rode de novo com --call-type-id=N.",
      );
    }
    generated.training_name = spec.training_name;
    const created = await createCaseSetup(ENV, token, generated, contextId, callTypeId, null, {
      methodologyIds: [spec.methodology_id],
      difficultyLevelId: spec.difficulty_level_id,
    });
    state.case_setup_id = created.id;
    state.call_context_type_id = callTypeId;
    await saveState();
    log(`✓ case_setup ${created.id} (agente ${created.elevenlabs_agent_id ?? "—"})`);
  }
} else {
  log(`✓ case_setup ${state.case_setup_id} (do estado)`);
}
const caseSetupId = state.case_setup_id;

if (DRY || caseSetupId == null || contextId == null) {
  log("\nDry run: nada foi escrito.");
  Deno.exit(0);
}

// O case_setup não pode travar persona: é o que deixa o vendedor escolher a conta.
const cs = await getCaseSetup(ENV, token, caseSetupId);
if (cs.persona_id != null) warn(`case_setup ${caseSetupId} está travado na persona ${cs.persona_id}`);

// ── 6) Fechamento: metodologia → rubricas → conhecimento por etapa ────────
if ((await listCaseSetupMethodologies(ENV, token, caseSetupId)).length === 0) {
  await setCaseSetupMethodologies(ENV, token, caseSetupId, [spec.methodology_id]);
  log(`✓ metodologia ${spec.methodology_id} vinculada`);
}

if ((await listCaseSetupRubrics(ENV, token, caseSetupId)).length === 0) {
  log("… gerando rubricas");
  await generateCaseSetupRubrics(ENV, token, caseSetupId);
}

// Conteúdo por etapa: nº de personas × (etapas + 1) chamadas de IA em série. Passa
// do timeout do fetch (180s) e o backend continua trabalhando: espera estabilizar.
const expectedPerPersona = new Map<number, number>();
if ((await listStepKnowledge(ENV, token, caseSetupId)).length === 0) {
  log("… gerando conhecimento por etapa (demora vários minutos)");
  try {
    const r = await generateStepKnowledge(ENV, token, [caseSetupId]);
    if (r.items_generated === 0) warn(`step_knowledge não gerou nada: ${r.results[0]?.skip_reason ?? "?"}`);
  } catch (e) {
    log(`  (a chamada caiu: ${messageOf(e)}; acompanhando pela listagem)`);
  }
}
let lastCounts = "";
for (let i = 0; i < 60; i++) {
  const counts: number[] = [];
  try {
    for (const p of spec.personas) {
      counts.push((await listStepKnowledgeItems(ENV, token, caseSetupId, state.personas[p.key])).length);
    }
  } catch (e) {
    // A HML chega a devolver 502 enquanto a geração pesa no servidor: só espera.
    log(`  (listagem falhou: ${messageOf(e)}; tentando de novo)`);
    await sleep(20_000);
    continue;
  }
  const key = counts.join(",");
  if (counts.every((c) => c > 0) && key === lastCounts) break;
  lastCounts = key;
  log(`  conhecimento por persona: ${key}`);
  await sleep(20_000);
}
spec.personas.forEach((p, i) => expectedPerPersona.set(state.personas![p.key], Number(lastCounts.split(",")[i])));

// ── 7) Troca o que a IA inventou pelo spec ─────────────────────────────────
await patchCaseSetup(ENV, token, caseSetupId, {
  training_name: spec.training_name,
  buyer_agent_first_messages: spec.case_setup.first_messages,
  salesperson_evaluation_rubric_criteria: spec.case_setup.rubricas.map((r) => `${r.criterio} — ${r.descricao}`),
});

const types = await listFeedbackRubricTypes(ENV, token);
const sellerType = types.find((t) => t.name === "seller_rubric")?.id;
if (sellerType == null) {
  warn("tipo seller_rubric não encontrado: rubricas do vendedor não trocadas");
} else {
  const existing = await listCaseSetupRubricsFull(ENV, token, caseSetupId);
  const seller = existing.filter((r) => r.feedback_rubric_type_id === sellerType);
  const wanted = spec.case_setup.rubricas.map((r) => r.criterio.trim());
  const alreadyApplied =
    seller.length === wanted.length && seller.every((r) => wanted.includes(r.statement.trim()));
  if (!alreadyApplied) {
    for (const r of seller) await deleteCaseSetupRubric(ENV, token, caseSetupId, r.id);
    for (const r of spec.case_setup.rubricas) {
      await createCaseSetupRubric(ENV, token, caseSetupId, {
        feedback_rubric_type_id: sellerType,
        statement: r.criterio.trim(),
        description: r.descricao,
        tips: r.dica,
      });
    }
  }
  log(`✓ rubricas do vendedor: ${wanted.length}${alreadyApplied ? " (já aplicadas)" : ""}`);
}

for (const p of spec.personas) {
  const personaId = state.personas[p.key];
  const items = (await listStepKnowledgeItems(ENV, token, caseSetupId, personaId)).filter(
    (it) => it.persona_id === personaId,
  );
  for (const it of items) {
    await patchStepKnowledge(ENV, token, caseSetupId, it.id, {
      prior_knowledge_prompt: p.conhecimento.previo,
      knowledge_prompt_details: { ...p.conhecimento.fatos, Regra: NO_INVENTED_NUMBERS },
      prior_knowledge_user_briefing: p.conhecimento.briefing,
      buyer_agent_first_messages: p.abertura,
    });
  }
  log(`✓ conhecimento de ${p.nome}: ${items.length} blocos reescritos`);
  if (items.length === 0) warn(`${p.nome} ficou sem conhecimento por etapa`);
}

// Objeções que a IA tenha criado por conta própria para estas personas.
const specTitles = new Set(spec.personas.flatMap((p) => p.objecoes.map((o) => o.titulo.trim().toLowerCase())));
const personaIds = new Set(Object.values(state.personas));
const extra = (await listContextObjections(ENV, token, contextId)).filter(
  (o) => o.persona_id != null && personaIds.has(o.persona_id) && !specTitles.has(o.title.trim().toLowerCase()),
);
if (extra.length > 0) {
  warn(`objeções fora do spec nas personas: ${extra.map((o) => `${o.id} "${o.title}"`).join(", ")}`);
}

// ── 8) Comportamento e prompt (depois das rubricas finais) ─────────────────
log("… regenerando comportamento");
await runCaseSetupRepairStep(ENV, token, caseSetupId, "behavior_guidance");
await runCaseSetupRepairStep(ENV, token, caseSetupId, "update_prompt");
log("✓ comportamento e prompt");

// ── 9) Sequência: gatekeeper → roleplays das contas ────────────────────────
if (WITH_CONTAINER) {
  try {
    if (state.container_id == null) {
      const list = await api<unknown>("GET", "/containers/list", token);
      const items = (Array.isArray(list) ? list : ((list as { items?: unknown[] }).items ?? [])) as Array<{
        id: number;
        title: string;
      }>;
      const found = items.find((c) => c.title === spec.container.title);
      state.container_id =
        found?.id ??
        (await api<{ id: number }>("POST", "/containers/create", token, {
          title: spec.container.title,
          description: spec.container.description,
        })).id;
      await saveState();
    }
    const order = [caseSetupId, ...spec.container.then_case_setup_ids];
    for (const [i, id] of order.entries()) {
      await api("POST", `/containers/${state.container_id}/role_plays/assign`, token, {
        case_setup_id: id,
        container_order: i + 1,
      });
    }
    log(`✓ container ${state.container_id}: ${order.join(" → ")}`);
  } catch (e) {
    warn(`container não montado: ${messageOf(e)}`);
  }
}

// ── 10) Gate: o prompt remontado de cada persona ───────────────────────────
// O endpoint sorteia a persona quando o case_setup não trava nenhuma: chama até
// ver as três e confere cada prompt.
const seen = new Map<string, Awaited<ReturnType<typeof getRolePlayPrompt>>>();
for (let i = 0; i < 15 && seen.size < spec.personas.length; i++) {
  const gate = await getRolePlayPrompt(ENV, token, caseSetupId);
  const p = spec.personas.find((p) => gate.prompt.includes(p.nome));
  if (p && !seen.has(p.key)) seen.set(p.key, gate);
}
log("\nGate por persona:");
for (const p of spec.personas) {
  const gate = seen.get(p.key);
  if (!gate) {
    warn(`${p.nome}: não apareceu no sorteio do gate`);
    continue;
  }
  const flags = ["has_persona", "has_behavior_guidance", "has_knowledge_blocks", "has_objections", "has_difficulty_level"] as const;
  const missing = flags.filter((f) => !gate[f]);
  const text = gate.prompt;
  const checks = {
    regra_de_passagem: text.includes("quatro coisas"),
    tipo_gatekeeper: /barreira|gatekeeper/i.test(text),
  };
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  log(`  ${p.nome}: ${missing.length === 0 && bad.length === 0 ? "ok" : `faltou ${[...missing, ...bad].join(", ")}`}`);
  if (missing.length > 0 || bad.length > 0) warn(`${p.nome}: faltou ${[...missing, ...bad].join(", ")}`);
  await Deno.writeTextFile(
    new URL(`docs/FIESC-B2G/gatekeeper-prompt-${p.key}.hml.md`, ROOT),
    `<!-- prompt remontado por /role_play_prompt em ${new Date().toISOString()} -->\n\n${text}\n`,
  );
}

log(`\nIds: ${JSON.stringify(state)}`);
if (warnings.length > 0) {
  log(`\n${warnings.length} aviso(s):`);
  warnings.forEach((w) => log(`  - ${w}`));
}
