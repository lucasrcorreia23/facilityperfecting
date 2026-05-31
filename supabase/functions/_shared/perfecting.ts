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
 * Refs: small-mvp/app/api/login/route.ts,
 *       app/api/role_plays/(...)/route.ts,
 *       app/api/role_plays/call-context-normalizer.ts,
 *       app/components/agents/create-wizard/wizard-container.tsx (handleReviewComplete)
 */

const API = Deno.env.get("PERFECTING_API_BASE") ?? "https://api-hml.perfecting.app";
const SA_EMAIL = Deno.env.get("PERFECTING_SUPERADMIN_EMAIL") ?? "";
const SA_PASS = Deno.env.get("PERFECTING_SUPERADMIN_PASSWORD") ?? "";

const RP = `${API}/role_plays`;
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data as T;
      // 422 = validação → não retenta
      if (res.status === 422) {
        throw new PerfectingError(422, (data as { detail?: unknown })?.detail ?? data);
      }
      // 5xx → retenta
      if (res.status >= 500 && attempt <= MAX_RETRIES) {
        lastErr = new PerfectingError(res.status, (data as { detail?: unknown })?.detail ?? data);
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      throw new PerfectingError(res.status, (data as { detail?: unknown })?.detail ?? data);
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
export async function loginSuperadmin(): Promise<string> {
  const form = new URLSearchParams({
    grant_type: "password",
    username: SA_EMAIL,
    password: SA_PASS,
  });
  const res = await fetchWithTimeout(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PerfectingError(res.status, (data as { detail?: unknown })?.detail ?? data);
  return stripBearer((data as { access_token?: string }).access_token);
}

export async function loginAsUser(
  saToken: string,
  targetUserId: number,
  targetOrgId: number,
): Promise<string> {
  const data = await postJson<{ access_token?: string }>(
    `${API}/superadmin/login_as_user`,
    saToken,
    {
      target_user_id: targetUserId,
      target_organization_id: targetOrgId,
      password_confirmation: SA_PASS,
    },
  );
  return stripBearer(data.access_token);
}

// ── Superadmin: orgs + users (para list-orgs) ─────────────────────────────
export async function listOrganizations(saToken: string): Promise<
  Array<{ id: number; name: string }>
> {
  const res = await fetchWithTimeout(`${API}/superadmin/organizations`, {
    method: "GET",
    headers: { Authorization: `Bearer ${saToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PerfectingError(res.status, data);
  return (data as { items?: Array<{ id: number; name: string }> }).items ?? [];
}

export async function findManagerUserId(
  saToken: string,
  orgId: number,
): Promise<number | null> {
  const res = await fetchWithTimeout(
    `${API}/superadmin/users?organization_id=${orgId}`,
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
  token: string,
  slug: string | null | undefined,
): Promise<number | undefined> {
  if (!slug || !slug.trim() || /^\d+$/.test(slug.trim())) return undefined;
  const res = await fetchWithTimeout(`${RP}/call_contexts`, {
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
export async function listCallContexts(token: string): Promise<CallContextType[]> {
  const res = await fetchWithTimeout(`${RP}/call_contexts`, {
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
  token: string,
  offerName: string,
  description: string,
): Promise<GeneratedOffer> {
  // ⚠️ campo é offer_description no generate
  return postJson<GeneratedOffer>(`${RP}/offer/generate`, token, {
    offer_name: offerName,
    offer_description: description,
    infer: true,
  });
}

export async function createOffer(
  token: string,
  generated: GeneratedOffer,
  offerName: string,
  description: string,
  url: string,
): Promise<number> {
  // ⚠️ create usa general_description; resposta traz `name`
  const data = await postJson<{ id?: number; offer_id?: number }>(
    `${RP}/offer/create`,
    token,
    {
      ...generated,
      offer_name: generated.offer_name ?? offerName,
      general_description: generated.general_description ?? description,
      url,
    },
  );
  const id = typeof data.id === "number" ? data.id : data.offer_id;
  if (typeof id !== "number") throw new PerfectingError(502, "offer/create sem id");
  return id;
}

export async function generateContext(
  token: string,
  offerId: number,
  additionalInstructions: string,
): Promise<Record<string, unknown>> {
  return postJson(`${RP}/context/generate`, token, {
    offer_id: offerId,
    aditional_instructions: additionalInstructions, // typo real da API
    infer: true,
  });
}

export async function createContext(
  token: string,
  generated: Record<string, unknown>,
  offerId: number,
): Promise<number> {
  const data = await postJson<{ id?: number }>(`${RP}/context/create`, token, {
    ...generated,
    offer_id: offerId,
  });
  if (typeof data.id !== "number") throw new PerfectingError(502, "context/create sem id");
  return data.id;
}

export interface ScenarioInput {
  call_context_type_id?: number;
  scenario_difficulty_level?: string;
  training_objective?: string;
  training_targeted_sales_skills?: string;
  aditional_instructions?: string;
}

export async function generateCaseSetup(
  token: string,
  contextId: number,
  scenario: ScenarioInput,
): Promise<Record<string, unknown>> {
  // ⚠️ é /role_plays/generate, NÃO /case_setup/generate
  return postJson(`${RP}/generate`, token, {
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

/** Monta o payload do case_setup/create (espelha handleReviewComplete). */
function buildCaseSetupCreate(
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

export async function createCaseSetup(
  token: string,
  generated: Record<string, unknown>,
  contextId: number,
  callContextTypeId: number | undefined,
  userGroupId: number | null,
): Promise<{ id: number; elevenlabs_agent_id: string | null }> {
  const payload = buildCaseSetupCreate(generated, contextId, callContextTypeId, userGroupId);
  // ⚠️ SEM ?generate_case_prompt=true (o app real não usa)
  const data = await postJson<{ id?: number; elevenlabs_agent_id?: string }>(
    `${RP}/case_setup/create`,
    token,
    payload,
  );
  if (typeof data.id !== "number") throw new PerfectingError(502, "case_setup/create sem id");
  return { id: data.id, elevenlabs_agent_id: data.elevenlabs_agent_id ?? null };
}
