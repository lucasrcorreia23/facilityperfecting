/**
 * Cliente da API Perfecting para o motor de export.
 *
 * ⚠️ Contrato VERIFICADO contra o código real da Perfecting (small-mvp):
 *  - login: POST {API}/auth/login  (x-www-form-urlencoded; remover prefixo "Bearer ")
 *  - offer/generate: corpo usa `offer_description` (NÃO general_description)
 *  - offer/create: corpo usa `general_description`; resposta traz `name` (= offer_name)
 *  - context/generate: `aditional_instructions` (typo real da API)
 *  - case setup generate: POST {API}/role_plays/generate  (NÃO /case_setup/generate)
 *  - case setup create:  POST {API}/role_plays/case_setup/create  (SEM ?generate_case_prompt)
 *  - call_context: backend espera `call_context_type_id` (int), resolvido de /role_plays/call_contexts
 *
 * Ambientes: HML e produção usam secrets pareados
 * (PERFECTING_HML_* / PERFECTING_PROD_*). O trio legado PERFECTING_*
 * ainda vale como fallback de HML.
 *
 * Create: produção usa o payload legado (spread + voice null). HML usa
 * builders estritos (Offer/Context/CaseSetup CRUD.Create.Input) e,
 * no export, cria persona via /persona/generate_from_context.
 */

export type PerfectingEnv = "hml" | "prod";

export interface PerfectingEnvConfig {
  api: string;
  email: string;
  password: string;
}

const DEFAULT_API: Record<PerfectingEnv, string> = {
  hml: "https://api-hml.perfecting.app",
  prod: "https://api.perfecting.app",
};

export function parsePerfectingEnv(value: unknown): PerfectingEnv {
  if (value === "hml" || value === "prod") return value;
  throw new PerfectingError(400, `environment inválido: ${String(value)}`);
}

/** Resolve API + superadmin do ambiente. Fallback legado: email/senha do trio
 *  PERFECTING_* para qualquer ambiente incompleto; API base legada só para HML. */
export function getEnvConfig(env: PerfectingEnv): PerfectingEnvConfig {
  const prefix = env === "hml" ? "PERFECTING_HML" : "PERFECTING_PROD";
  let api = (Deno.env.get(`${prefix}_API_BASE`) ?? "").trim();
  let email = (Deno.env.get(`${prefix}_SUPERADMIN_EMAIL`) ?? "").trim();
  let password = (Deno.env.get(`${prefix}_SUPERADMIN_PASSWORD`) ?? "").trim();

  const legacyEmail = (Deno.env.get("PERFECTING_SUPERADMIN_EMAIL") ?? "").trim();
  const legacyPassword = (Deno.env.get("PERFECTING_SUPERADMIN_PASSWORD") ?? "").trim();
  if (!email) email = legacyEmail;
  if (!password) password = legacyPassword;

  if (env === "hml" && !api) {
    api = (Deno.env.get("PERFECTING_API_BASE") ?? "").trim();
  }

  if (!api) api = DEFAULT_API[env];
  return { api: api.replace(/\/$/, ""), email, password };
}

/** True se email e senha do ambiente estão configurados. */
export function hasEnvConfig(env: PerfectingEnv): boolean {
  const { email, password } = getEnvConfig(env);
  return Boolean(email && password);
}

function apiBase(env: PerfectingEnv): string {
  return getEnvConfig(env).api;
}

function rp(env: PerfectingEnv): string {
  return `${apiBase(env)}/role_plays`;
}

const FETCH_TIMEOUT_MS = 180_000; // /generate levam minutos
const MAX_RETRIES = 2; // 2 retries (3 tentativas) em 5xx/timeout

export class PerfectingError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

function stripBearer(token: unknown): string {
  const t = String(token ?? "");
  return t.toLowerCase().startsWith("bearer ") ? t.slice(7).trim() : t.trim();
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** POST JSON com retries/backoff em 5xx/timeout. NUNCA retenta 422 (validação). */
async function postJson<T = unknown>(url: string, token: string, body: unknown): Promise<T> {
  let attempt = 0;
  // deno-lint-ignore no-explicit-any
  let lastErr: any;
  while (attempt <= MAX_RETRIES) {
    attempt++;
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      // Lê o corpo como texto primeiro e tenta JSON — assim um 500 com corpo
      // não-JSON (ou vazio) ainda preserva o conteúdo bruto no error_detail.
      const raw = await res.text().catch(() => "");
      let data: unknown = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { raw };
        }
      }
      if (res.ok) return data as T;
      // Extrai um detalhe útil: usa `.detail` quando existe e não é vazio;
      // senão cai pro corpo bruto (evita o inútil {"detail":{}}).
      const detailOf = (d: unknown): unknown => {
        const det = (d as { detail?: unknown })?.detail;
        const empty =
          det == null ||
          (typeof det === "object" && det !== null && Object.keys(det).length === 0) ||
          (typeof det === "string" && det.trim() === "");
        return empty ? raw || d : det;
      };
      // 422 = validação → não retenta
      if (res.status === 422) {
        throw new PerfectingError(422, detailOf(data));
      }
      // 5xx → retenta
      if (res.status >= 500 && attempt <= MAX_RETRIES) {
        lastErr = new PerfectingError(res.status, detailOf(data));
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      throw new PerfectingError(res.status, detailOf(data));
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === "AbortError";
      if (isAbort && attempt <= MAX_RETRIES) {
        lastErr = new PerfectingError(408, "timeout");
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      if (e instanceof PerfectingError) throw e;
      if (attempt > MAX_RETRIES) throw lastErr ?? e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw lastErr;
}

// ── Auth ────────────────────────────────────────────────────────────────
export async function loginSuperadmin(env: PerfectingEnv): Promise<string> {
  const { api, email, password } = getEnvConfig(env);
  if (!email || !password) {
    throw new PerfectingError(500, `credenciais Perfecting ausentes para ${env}`);
  }
  const form = new URLSearchParams({
    grant_type: "password",
    username: email,
    password,
  });
  const res = await fetchWithTimeout(`${api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PerfectingError(res.status, (data as { detail?: unknown })?.detail ?? data);
  return stripBearer((data as { access_token?: string }).access_token);
}

export async function loginAsUser(
  env: PerfectingEnv,
  saToken: string,
  targetUserId: number,
  targetOrgId: number,
): Promise<string> {
  const { api, password } = getEnvConfig(env);
  const data = await postJson<{ access_token?: string }>(
    `${api}/superadmin/login_as_user`,
    saToken,
    {
      target_user_id: targetUserId,
      target_organization_id: targetOrgId,
      password_confirmation: password,
    },
  );
  return stripBearer(data.access_token);
}

// ── Superadmin: orgs + users (para list-orgs) ─────────────────────────────
export async function listOrganizations(
  env: PerfectingEnv,
  saToken: string,
): Promise<Array<{ id: number; name: string }>> {
  const res = await fetchWithTimeout(`${apiBase(env)}/superadmin/organizations`, {
    method: "GET",
    headers: { Authorization: `Bearer ${saToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PerfectingError(res.status, data);
  return (data as { items?: Array<{ id: number; name: string }> }).items ?? [];
}

export async function findManagerUserId(
  env: PerfectingEnv,
  saToken: string,
  orgId: number,
): Promise<number | null> {
  const res = await fetchWithTimeout(
    `${apiBase(env)}/superadmin/users?organization_id=${orgId}`,
    { method: "GET", headers: { Authorization: `Bearer ${saToken}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PerfectingError(res.status, data);
  const items =
    (data as { items?: Array<{ id: number; is_active?: boolean }> }).items ?? [];
  const active = items.find((u) => u.is_active !== false) ?? items[0];
  return active?.id ?? null;
}

// ── call_context_type_slug → id ───────────────────────────────────────────
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function resolveCallContextTypeId(
  env: PerfectingEnv,
  token: string,
  slug: string | null | undefined,
): Promise<number | undefined> {
  if (!slug || !slug.trim() || /^\d+$/.test(slug.trim())) return undefined;
  const res = await fetchWithTimeout(`${rp(env)}/call_contexts`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return undefined;
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return undefined;
  const target = slug.trim().toLowerCase();
  for (const group of data as Array<{ call_context_types?: Array<{ id: number; name: string }> }>) {
    for (const ctx of group.call_context_types ?? []) {
      if (typeof ctx?.id === "number" && typeof ctx?.name === "string") {
        if (slugify(ctx.name) === target) return ctx.id;
      }
    }
  }
  return undefined;
}

export interface CallContextType {
  id: number;
  name: string;
  slug: string;
  group: string;
  stage?: string;
}

/** Lista os tipos de call_context (achatados) para alimentar a UI/fallback. */
export async function listCallContexts(
  env: PerfectingEnv,
  token: string,
): Promise<CallContextType[]> {
  const res = await fetchWithTimeout(`${rp(env)}/call_contexts`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new PerfectingError(res.status, await res.text().catch(() => ""));
  const data = await res.json().catch(() => []);
  const out: CallContextType[] = [];
  for (const group of (Array.isArray(data) ? data : []) as Array<{
    name?: string;
    call_context_types?: Array<{ id: number; name: string; stage?: string }>;
  }>) {
    for (const ctx of group.call_context_types ?? []) {
      if (typeof ctx?.id === "number" && typeof ctx?.name === "string") {
        out.push({
          id: ctx.id,
          name: ctx.name,
          slug: slugify(ctx.name),
          group: group.name ?? "",
          stage: ctx.stage,
        });
      }
    }
  }
  return out;
}

// ── Cadeia generate/create ────────────────────────────────────────────────
export interface GeneratedOffer {
  [k: string]: unknown;
  offer_name?: string;
  general_description?: string;
}

export async function generateOffer(
  env: PerfectingEnv,
  token: string,
  offerName: string,
  description: string,
): Promise<GeneratedOffer> {
  // ⚠️ campo é offer_description no generate
  return postJson<GeneratedOffer>(`${rp(env)}/offer/generate`, token, {
    offer_name: offerName,
    offer_description: description,
    infer: true,
  });
}

const HML_OFFER_CREATE_REQUIRED = [
  "offer_name",
  "general_description",
  "target_audience_description",
  "target_industries_or_domains",
  "primary_problem_solved",
  "core_value_proposition",
  "key_features_and_benefits",
  "unique_selling_points",
  "competitive_differentiation",
  "delivery_method",
  "implementation_onboarding_process",
  "customer_support_model",
  "pricing_details_summary",
] as const;

function buildProdOfferCreate(
  generated: GeneratedOffer,
  offerName: string,
  description: string,
  url: string,
): Record<string, unknown> {
  return {
    ...generated,
    offer_name: generated.offer_name ?? offerName,
    general_description: generated.general_description ?? description,
    url,
  };
}

function buildHmlOfferCreate(
  generated: GeneratedOffer,
  offerName: string,
  description: string,
  url: string,
): Record<string, unknown> {
  const src: Record<string, unknown> = {
    ...generated,
    offer_name: generated.offer_name ?? offerName,
    general_description: generated.general_description ?? description,
  };
  const missing: string[] = [];
  const payload: Record<string, unknown> = {
    url: typeof url === "string" ? url : "",
  };
  for (const key of HML_OFFER_CREATE_REQUIRED) {
    const value = src[key];
    if (typeof value !== "string") missing.push(key);
    else payload[key] = value;
  }
  if (missing.length) {
    throw new PerfectingError(422, `offer/create HML sem campos: ${missing.join(", ")}`);
  }
  return payload;
}

export async function createOffer(
  env: PerfectingEnv,
  token: string,
  generated: GeneratedOffer,
  offerName: string,
  description: string,
  url: string,
): Promise<number> {
  // ⚠️ create usa general_description; resposta traz `name`
  const payload =
    env === "hml"
      ? buildHmlOfferCreate(generated, offerName, description, url)
      : buildProdOfferCreate(generated, offerName, description, url);
  const data = await postJson<{ id?: number; offer_id?: number }>(
    `${rp(env)}/offer/create`,
    token,
    payload,
  );
  const id = typeof data.id === "number" ? data.id : data.offer_id;
  if (typeof id !== "number") throw new PerfectingError(502, "offer/create sem id");
  return id;
}

export async function generateContext(
  env: PerfectingEnv,
  token: string,
  offerId: number,
  additionalInstructions: string,
): Promise<Record<string, unknown>> {
  return postJson(`${rp(env)}/context/generate`, token, {
    offer_id: offerId,
    aditional_instructions: additionalInstructions, // typo real da API
    infer: true,
  });
}

const HML_CONTEXT_CREATE_REQUIRED = [
  "name",
  "target_description",
  "compelling_events",
  "strategic_priorities",
  "quantifiable_pain_points",
  "desired_future_state",
  "primary_value_drivers",
  "typical_decision_making_process",
  "risk_aversion_level",
  "persona_objections_and_concerns",
  "persona_awareness_of_the_problem",
  "persona_awareness_of_the_solutions",
  "persona_existing_solutions",
] as const;

function buildProdContextCreate(
  generated: Record<string, unknown>,
  offerId: number,
): Record<string, unknown> {
  return { ...generated, offer_id: offerId };
}

function buildHmlContextCreate(
  generated: Record<string, unknown>,
  offerId: number,
): Record<string, unknown> {
  const missing: string[] = [];
  const payload: Record<string, unknown> = { offer_id: offerId };
  for (const key of HML_CONTEXT_CREATE_REQUIRED) {
    const value = generated[key];
    if (typeof value !== "string") missing.push(key);
    else payload[key] = value;
  }
  if (missing.length) {
    throw new PerfectingError(422, `context/create HML sem campos: ${missing.join(", ")}`);
  }
  return payload;
}

export async function createContext(
  env: PerfectingEnv,
  token: string,
  generated: Record<string, unknown>,
  offerId: number,
): Promise<number> {
  const payload =
    env === "hml"
      ? buildHmlContextCreate(generated, offerId)
      : buildProdContextCreate(generated, offerId);
  const data = await postJson<{ id?: number }>(`${rp(env)}/context/create`, token, payload);
  if (typeof data.id !== "number") throw new PerfectingError(502, "context/create sem id");
  return data.id;
}

export async function generatePersonaFromContext(
  env: PerfectingEnv,
  token: string,
  contextId: number,
): Promise<{ id: number; name: string | null }> {
  const data = await postJson<{
    persona?: { id?: number; name?: string | null };
  }>(`${rp(env)}/persona/generate_from_context`, token, { context_id: contextId });
  const id = data.persona?.id;
  if (typeof id !== "number") {
    throw new PerfectingError(502, "persona/generate_from_context sem persona.id");
  }
  return { id, name: data.persona?.name ?? null };
}

export interface ScenarioInput {
  call_context_type_id?: number;
  scenario_difficulty_level?: string;
  training_objective?: string;
  training_targeted_sales_skills?: string;
  aditional_instructions?: string;
}

export async function generateCaseSetup(
  env: PerfectingEnv,
  token: string,
  contextId: number,
  scenario: ScenarioInput,
): Promise<Record<string, unknown>> {
  // ⚠️ é /role_plays/generate, NÃO /case_setup/generate
  return postJson(`${rp(env)}/generate`, token, {
    context_id: contextId,
    ...(scenario.call_context_type_id != null && {
      call_context_type_id: scenario.call_context_type_id,
    }),
    ...(scenario.scenario_difficulty_level && {
      scenario_difficulty_level: scenario.scenario_difficulty_level,
    }),
    ...(scenario.training_objective && { training_objective: scenario.training_objective }),
    ...(scenario.training_targeted_sales_skills && {
      training_targeted_sales_skills: scenario.training_targeted_sales_skills,
    }),
    ...(scenario.aditional_instructions && {
      aditional_instructions: scenario.aditional_instructions,
    }),
    infer: true,
  });
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter((s) => s.length > 0);
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* verbatim às vezes chega string solta */
    }
  }
  return null;
}

function normalizeBuyerInstructions(value: unknown): Array<Record<string, unknown>> {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      return {
        trigger_conditions: asStringList(row.trigger_conditions),
        instructions: asStringList(row.instructions),
        tone_and_mood: typeof row.tone_and_mood === "string" ? row.tone_and_mood : "",
        desired_behaviors: asStringList(row.desired_behaviors),
        undesired_behaviors: asStringList(row.undesired_behaviors),
      };
    }
    if (typeof item === "string" && item.trim()) {
      return {
        trigger_conditions: [],
        instructions: [item],
        tone_and_mood: "",
        desired_behaviors: [],
        undesired_behaviors: [],
      };
    }
    return {
      trigger_conditions: [],
      instructions: [],
      tone_and_mood: "",
      desired_behaviors: [],
      undesired_behaviors: [],
    };
  });
}

/** Verbatim HML só vai cru se já tiver profiles objeto e voice model. */
export function isHmlCaseSetupComplete(payload: Record<string, unknown>): boolean {
  const model = payload.persona_voice_model_id;
  return (
    asObject(payload.company_profile) != null &&
    asObject(payload.persona_profile) != null &&
    typeof model === "string" &&
    model.trim().length > 0
  );
}

const VERBATIM_OVERLAY_KEYS = [
  "training_name",
  "training_description",
  "training_keywords",
  "training_objective",
  "training_targeted_sales_skills",
  "buyer_agent_instructions",
  "buyer_prior_knowledge",
  "buyer_agent_initial_tone_and_mood",
  "buyer_agent_first_messages",
  "buyer_agent_success_criteria",
  "salesperson_instructions",
  "salesperson_desired_tone_and_mood",
  "salesperson_desired_behaviors",
  "salesperson_undesired_behaviors",
  "salesperson_success_criteria",
  "salesperson_evaluation_rubric_criteria",
] as const;

/** Completa um verbatim incompleto com /generate e sobrescreve training_* / instruções. */
export function overlayVerbatimOnGenerated(
  generated: Record<string, unknown>,
  verbatim: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...generated };
  for (const key of VERBATIM_OVERLAY_KEYS) {
    if (verbatim[key] != null) out[key] = verbatim[key];
  }
  return out;
}

/** Monta o payload do case_setup/create (contrato legado de produção). */
function buildProdCaseSetupCreate(
  g: Record<string, unknown>,
  contextId: number,
  callContextTypeId: number | undefined,
  userGroupId: number | null,
): Record<string, unknown> {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const voiceRaw = Number(g.persona_voice_id);
  const persona_voice_id = Number.isInteger(voiceRaw) && voiceRaw > 0 ? voiceRaw : 1;

  return {
    context_id: contextId,
    ...(callContextTypeId != null && { call_context_type_id: callContextTypeId }),
    training_name: g.training_name,
    training_description: g.training_description,
    training_keywords: str(g.training_keywords),
    training_objective: g.training_objective,
    training_targeted_sales_skills: g.training_targeted_sales_skills ?? [],
    scenario_difficulty_level: g.scenario_difficulty_level,
    buyer_agent_instructions: arr(g.buyer_agent_instructions),
    buyer_prior_knowledge: arr(g.buyer_prior_knowledge),
    buyer_agent_initial_tone_and_mood: str(g.buyer_agent_initial_tone_and_mood),
    buyer_agent_first_messages: arr(g.buyer_agent_first_messages),
    buyer_agent_success_criteria: arr(g.buyer_agent_success_criteria),
    salesperson_instructions: arr(g.salesperson_instructions),
    salesperson_desired_tone_and_mood: str(g.salesperson_desired_tone_and_mood),
    salesperson_desired_behaviors: arr(g.salesperson_desired_behaviors),
    salesperson_undesired_behaviors: arr(g.salesperson_undesired_behaviors),
    salesperson_success_criteria: arr(g.salesperson_success_criteria),
    salesperson_evaluation_rubric_criteria: arr(g.salesperson_evaluation_rubric_criteria),
    company_profile: g.company_profile,
    persona_profile: g.persona_profile,
    persona_voice_id,
    persona_voice_model_id: g.persona_voice_model_id ?? null,
    successful_sale_dialogues_examples: arr(g.successful_sale_dialogues_examples),
    unsuccessful_sale_dialogues_examples: arr(g.unsuccessful_sale_dialogues_examples),
    ...(userGroupId != null ? { user_group_id: userGroupId } : {}),
  };
}

function buildHmlCaseSetupCreate(
  g: Record<string, unknown>,
  contextId: number,
  callContextTypeId: number | undefined,
  userGroupId: number | null,
): Record<string, unknown> {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const resolvedCallContext =
    typeof callContextTypeId === "number"
      ? callContextTypeId
      : typeof g.call_context_type_id === "number"
        ? g.call_context_type_id
        : null;
  if (resolvedCallContext == null) {
    throw new PerfectingError(422, "case_setup/create HML exige call_context_type_id");
  }

  const voiceRaw = Number(g.persona_voice_id);
  if (!Number.isInteger(voiceRaw) || voiceRaw <= 0) {
    throw new PerfectingError(422, "case_setup/create HML exige persona_voice_id");
  }

  const model =
    typeof g.persona_voice_model_id === "string" ? g.persona_voice_model_id.trim() : "";
  if (!model) {
    throw new PerfectingError(422, "case_setup/create HML exige persona_voice_model_id");
  }

  const company_profile = asObject(g.company_profile);
  const persona_profile = asObject(g.persona_profile);
  if (!company_profile) {
    throw new PerfectingError(422, "case_setup/create HML exige company_profile objeto");
  }
  if (!persona_profile) {
    throw new PerfectingError(422, "case_setup/create HML exige persona_profile objeto");
  }

  return {
    context_id: contextId,
    call_context_type_id: resolvedCallContext,
    training_name: g.training_name,
    training_description: g.training_description,
    training_keywords: str(g.training_keywords),
    training_objective: g.training_objective,
    training_targeted_sales_skills: asStringList(g.training_targeted_sales_skills),
    scenario_difficulty_level: g.scenario_difficulty_level,
    buyer_agent_instructions: normalizeBuyerInstructions(g.buyer_agent_instructions),
    buyer_prior_knowledge: asStringList(g.buyer_prior_knowledge),
    buyer_agent_initial_tone_and_mood: str(g.buyer_agent_initial_tone_and_mood),
    buyer_agent_first_messages: asStringList(g.buyer_agent_first_messages),
    buyer_agent_success_criteria: asStringList(g.buyer_agent_success_criteria),
    salesperson_instructions: asStringList(g.salesperson_instructions),
    salesperson_desired_tone_and_mood: str(g.salesperson_desired_tone_and_mood),
    salesperson_desired_behaviors: asStringList(g.salesperson_desired_behaviors),
    salesperson_undesired_behaviors: asStringList(g.salesperson_undesired_behaviors),
    salesperson_success_criteria: asStringList(g.salesperson_success_criteria),
    salesperson_evaluation_rubric_criteria: asStringList(g.salesperson_evaluation_rubric_criteria),
    company_profile,
    persona_profile,
    persona_voice_id: voiceRaw,
    persona_voice_model_id: model,
    ...(userGroupId != null ? { user_group_id: userGroupId } : {}),
  };
}

export async function createCaseSetup(
  env: PerfectingEnv,
  token: string,
  generated: Record<string, unknown>,
  contextId: number,
  callContextTypeId: number | undefined,
  userGroupId: number | null,
  generateCasePrompt?: boolean,
): Promise<{ id: number; elevenlabs_agent_id: string | null }> {
  const payload =
    env === "hml"
      ? buildHmlCaseSetupCreate(generated, contextId, callContextTypeId, userGroupId)
      : buildProdCaseSetupCreate(generated, contextId, callContextTypeId, userGroupId);
  // undefined → omite o param (API usa default = true), igual aos exports normais.
  // true/false → envia explícito (usado p/ isolar o crash de geração de prompt).
  const url =
    generateCasePrompt === undefined
      ? `${rp(env)}/case_setup/create`
      : `${rp(env)}/case_setup/create?generate_case_prompt=${generateCasePrompt}`;
  const data = await postJson<{ id?: number; elevenlabs_agent_id?: string }>(
    url,
    token,
    payload,
  );
  if (typeof data.id !== "number") throw new PerfectingError(502, "case_setup/create sem id");
  return { id: data.id, elevenlabs_agent_id: data.elevenlabs_agent_id ?? null };
}

// ── Playbooks ─────────────────────────────────────────────────────────────

export interface Playbook {
  id: number;
  name: string;
  playbook_status_id: number | null;
}

export interface PlaybookCallType {
  id: number;
  name: string;
  description: string | null;
  order: number | null;
  call_context_type_id: number | null;
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await res.text().catch(() => "");
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }
  if (!res.ok) throw new PerfectingError(res.status, data ?? raw);
  return data as T;
}

/** Playbooks da org do token (sem organization_id: o gestor só enxerga a própria). */
export async function listPlaybooks(env: PerfectingEnv, token: string): Promise<Playbook[]> {
  const data = await getJson<unknown>(`${rp(env)}/playbook/list`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .filter((p) => typeof p.id === "number")
    .map((p) => ({
      id: p.id as number,
      name: typeof p.name === "string" ? p.name : `Playbook ${p.id}`,
      playbook_status_id:
        typeof p.playbook_status_id === "number" ? p.playbook_status_id : null,
    }));
}

/** Etapas do playbook — cada uma vira UM roleplay na implementação. Ordenadas. */
export async function listPlaybookCallTypes(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
): Promise<PlaybookCallType[]> {
  const data = await getJson<unknown>(`${rp(env)}/playbook_${playbookId}/call_types`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .filter((c) => typeof c.id === "number")
    .map((c) => ({
      id: c.id as number,
      name: typeof c.name === "string" ? c.name : `Etapa ${c.id}`,
      description: typeof c.description === "string" ? c.description : null,
      order: typeof c.order === "number" ? c.order : null,
      call_context_type_id:
        typeof c.call_context_type_id === "number" ? c.call_context_type_id : null,
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Ids dos case_setups de um contexto. Usado para o diff antes/depois da
 * implementação por playbook: o evento `implementation_ready` traz o resultado
 * por etapa, mas NÃO os case_setup_id criados.
 */
export async function listCaseSetupIdsByContext(
  env: PerfectingEnv,
  token: string,
  contextId: number,
): Promise<number[]> {
  const data = await getJson<unknown>(`${rp(env)}/case_setup/context_${contextId}/list`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .map((c) => (c as { id?: unknown })?.id)
    .filter((id): id is number => typeof id === "number");
}

export interface Methodology {
  id: number;
  name: string;
  slug: string;
  description: string;
  application_case: string;
}

/** Metodologias disponíveis (públicas + da org). `slug` é derivado do nome, como em call_contexts. */
export async function listMethodologies(
  env: PerfectingEnv,
  token: string,
): Promise<Methodology[]> {
  const data = await getJson<unknown>(`${rp(env)}/methodologies?only_active=true`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
    .filter((m) => typeof m.id === "number" && typeof m.name === "string")
    .map((m) => ({
      id: m.id as number,
      name: m.name as string,
      slug: slugify(m.name as string),
      description: typeof m.description === "string" ? m.description : "",
      application_case: typeof m.application_case === "string" ? m.application_case : "",
    }));
}

// ── Criação da definição de um playbook na conta de destino ────────────────

export async function createPlaybook(
  env: PerfectingEnv,
  token: string,
  name: string,
): Promise<number> {
  const data = await postJson<{ id?: number }>(`${rp(env)}/playbook/create`, token, { name });
  if (typeof data.id !== "number") throw new PerfectingError(502, "playbook/create sem id");
  return data.id;
}

export interface PlaybookCallTypeInput {
  name: string;
  description: string; // obrigatório na API
  call_context_type_id?: number | null;
  order?: number | null;
}

export async function createPlaybookCallType(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  input: PlaybookCallTypeInput,
): Promise<number> {
  const data = await postJson<{ id?: number }>(
    `${rp(env)}/playbook_${playbookId}/call_types`,
    token,
    {
      name: input.name,
      description: input.description,
      ...(input.call_context_type_id != null && {
        call_context_type_id: input.call_context_type_id,
      }),
      ...(input.order != null && { order: input.order }),
    },
  );
  if (typeof data.id !== "number") throw new PerfectingError(502, "call_types sem id");
  return data.id;
}

/**
 * Vincula uma metodologia à etapa. Sem isso o Engine de Implementação pode
 * pular a etapa em `validating_methodologies` e a jornada sai vazia.
 */
export async function addPlaybookCallTypeMethodology(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
  methodologyId: number,
): Promise<void> {
  await postJson(
    `${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}/methodologies/${methodologyId}`,
    token,
    {},
  );
}

export interface PlaybookCallBlockInput {
  name: string;
  description: string; // obrigatório na API
  order?: number | null;
  objective?: string | null;
  sample_questions?: string[];
  what_to_do?: string[];
  what_to_avoid?: string[];
}

export async function createPlaybookCallBlock(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
  input: PlaybookCallBlockInput,
): Promise<number> {
  const data = await postJson<{ id?: number }>(
    `${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}/call_blocks`,
    token,
    {
      name: input.name,
      description: input.description,
      ...(input.order != null && { order: input.order }),
      ...(input.objective && { objective: input.objective }),
      ...(input.sample_questions?.length && { sample_questions: input.sample_questions }),
      ...(input.what_to_do?.length && { what_to_do: input.what_to_do }),
      ...(input.what_to_avoid?.length && { what_to_avoid: input.what_to_avoid }),
    },
  );
  if (typeof data.id !== "number") throw new PerfectingError(502, "call_blocks sem id");
  return data.id;
}

/**
 * Abre o stream SSE do Engine de Implementação por Playbook: cria UM case_setup
 * por PlaybookCallType do playbook, ancorado em context_id/persona_id.
 *
 * ⚠️ De propósito fora de postJson/fetchWithTimeout: o job leva minutos (o
 * timeout de 180s mataria o stream) e um retry recriaria a jornada inteira de
 * roleplays. Quem chama trata a queda do stream reconciliando por
 * listCaseSetupIdsByContext — nunca reabrindo.
 *
 * `organization_id` é omitido: a API exige que gestor omita ou informe a própria.
 */
export async function openPlaybookImplementationStream(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  contextId: number,
  personaId?: number | null,
): Promise<Response> {
  const url = new URL(`${rp(env)}/playbook_${playbookId}/implementation/sse`);
  url.searchParams.set("context_id", String(contextId));
  if (personaId != null) url.searchParams.set("persona_id", String(personaId));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new PerfectingError(res.status, detail || "implementation/sse sem corpo");
  }
  return res;
}
