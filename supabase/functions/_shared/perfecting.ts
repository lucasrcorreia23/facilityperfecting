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
 * no export, cria persona via /persona/generate_from_context. Produção
 * cria a persona depois, copiando o comprador (buildPersonaFromCaseSetup).
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

/** Mount das SESSÕES de roleplay — outro prefixo, não é `rp(env)`. É onde mora o
 *  endpoint que remonta o prompt da call (o gate de verificação do envio). */
function rps(env: PerfectingEnv): string {
  return `${apiBase(env)}/role_plays_session`;
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

/**
 * Teto de caracteres para texto livre mandado a endpoints de IA da Perfecting
 * (offer/generate, context/generate). Material colado pelo usuário pode ter
 * dezenas de milhares de caracteres — acima disso a API deles quebra com um
 * 500 genérico ("Internal server error.", sem detalhe) em vez de validar.
 * O texto completo continua salvo no nosso banco; só o payload de saída é cortado.
 */
export const MAX_API_TEXT_CHARS = 12_000;

export function truncateForApi(text: string, max = MAX_API_TEXT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}\n\n[...material truncado — o original tem ${text.length} caracteres]`;
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

/** POST/PUT JSON com retries/backoff em 5xx/timeout. NUNCA retenta 422 (validação). */
async function sendJson<T = unknown>(
  method: "POST" | "PUT" | "PATCH",
  url: string,
  token: string,
  body: unknown,
  /** 0 para operações que não podem repetir (ex.: criar agente, regenerar com IA). */
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let attempt = 0;
  // deno-lint-ignore no-explicit-any
  let lastErr: any;
  while (attempt <= maxRetries) {
    attempt++;
    try {
      const res = await fetchWithTimeout(url, {
        method,
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
      // Em 5xx o `.detail` costuma ser um genérico "Internal server error." sem
      // pista nenhuma — guarda também endpoint + corpo bruto pra dar pra investigar
      // qual chamada específica quebrou (offer/generate vs offer/create etc.).
      const detail5xx = (): unknown => ({
        endpoint: url.replace(/^https?:\/\/[^/]+/, ""),
        apiDetail: detailOf(data),
        raw: raw.slice(0, 4000),
      });
      // 422 = validação → não retenta
      if (res.status === 422) {
        throw new PerfectingError(422, detailOf(data));
      }
      // 5xx → retenta
      if (res.status >= 500 && attempt <= maxRetries) {
        lastErr = new PerfectingError(res.status, detail5xx());
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      throw new PerfectingError(res.status, res.status >= 500 ? detail5xx() : detailOf(data));
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === "AbortError";
      if (isAbort && attempt <= maxRetries) {
        lastErr = new PerfectingError(408, "timeout");
        await new Promise((r) => setTimeout(r, 1200 * attempt));
        continue;
      }
      if (e instanceof PerfectingError) throw e;
      if (attempt > maxRetries) throw lastErr ?? e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw lastErr;
}

function postJson<T = unknown>(url: string, token: string, body: unknown): Promise<T> {
  return sendJson<T>("POST", url, token, body);
}

/** PUT idempotente: mesma política de retry do POST (seguro em PUT). */
function putJson<T = unknown>(url: string, token: string, body: unknown): Promise<T> {
  return sendJson<T>("PUT", url, token, body);
}

function patchJson<T = unknown>(url: string, token: string, body: unknown): Promise<T> {
  return sendJson<T>("PATCH", url, token, body);
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

// ── Conteúdo context-wide: objeções e guardrails ──────────────────────────
//
// A IA da Perfecting gera objeções sozinha durante a implementação, mas genéricas.
// Quando o material do cliente já traz objeções reais (com a fala do comprador e a
// condição de cedência) ou regras de comportamento validadas, é muito melhor mandar
// as dele. O que é criado NO CONTEXTO vale para todo case_setup daquele context_id
// (`GET /case_setup_{id}/objections?include_context_wide=true`) — ou seja, para todas as
// etapas do playbook. Por isso, no modo playbook, objeção vai por case_setup (abaixo).

export interface ObjectionType {
  id: number;
  slug: string;
  name: string;
}

/** Tipos de objeção da plataforma (preço, timing, autoridade…), para resolver slug → id. */
export async function listObjectionTypes(
  env: PerfectingEnv,
  token: string,
): Promise<ObjectionType[]> {
  const data = await getJson<unknown>(`${rp(env)}/objection_types`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
    .filter((o) => typeof o.id === "number" && typeof o.slug === "string")
    .map((o) => ({
      id: o.id as number,
      slug: o.slug as string,
      name: typeof o.name === "string" ? o.name : (o.slug as string),
    }));
}

/** IDs de `role_plays.difficulty_level` na Perfecting (1=Fácil, 2=Moderado, 3=Difícil). */
export const DIFFICULTY_LEVEL_IDS = [1, 2, 3] as const;

/**
 * Dificuldade legada (easy|medium|hard) → `difficulty_level_id` do catálogo.
 *
 * A API deriva sozinha quando o create não manda o id, mas mandar explícito é o
 * que garante que o roleplay e as objeções fiquem no MESMO nível: o prompt só
 * inclui objeção cujo `difficulty_level_id` é igual ao do case_setup, e as
 * objeções do material são gravadas com DIFFICULTY_LEVEL_IDS (os três).
 */
export const DIFFICULTY_LEVEL_ID_BY_SLUG: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export function difficultyLevelIdFor(difficulty: string | null | undefined): number | undefined {
  if (!difficulty) return undefined;
  return DIFFICULTY_LEVEL_ID_BY_SLUG[difficulty.trim().toLowerCase()];
}

export interface ContextObjectionInput {
  objection_type_id: number;
  /**
   * Obrigatório na prática: o prompt do roleplay só inclui objeções com
   * `difficulty_level_id` IGUAL ao do case_setup — NULL nunca casa, e a objeção
   * fica cadastrada sem nunca chegar ao comprador.
   */
  difficulty_level_id: number;
  title: string;
  description?: string | null;
  details?: string | null;
  /** A condição de cedência ("Ceda se") — sem ela o comprador repete a objeção sem fim. */
  to_give_in_if?: string | null;
}

/** Objeções context-wide já cadastradas — base da idempotência (título + nível). */
export async function listContextObjections(
  env: PerfectingEnv,
  token: string,
  contextId: number,
): Promise<Array<{ id: number; title: string; difficulty_level_id: number | null }>> {
  const data = await getJson<unknown>(`${rp(env)}/context_${contextId}/objections`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
    .filter((o) => typeof o.id === "number")
    .map((o) => ({
      id: o.id as number,
      title: typeof o.title === "string" ? o.title : "",
      difficulty_level_id: typeof o.difficulty_level_id === "number" ? o.difficulty_level_id : null,
    }));
}

export async function createContextObjection(
  env: PerfectingEnv,
  token: string,
  contextId: number,
  input: ContextObjectionInput,
): Promise<number | null> {
  const data = await postJson<{ id?: number }>(
    `${rp(env)}/context_${contextId}/objections`,
    token,
    input,
  );
  return typeof data.id === "number" ? data.id : null;
}

// Objeções de UM case_setup (uma etapa do playbook). É o escopo certo para objeção que
// só faz sentido num momento da jornada: a context-wide entra no prompt de TODAS as
// etapas, e o comprador passa a levantar objeção de fechamento na descoberta.

/** Só as objeções específicas do case_setup (a API omite as context-wide por padrão). */
export async function listCaseSetupObjections(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
): Promise<Array<{ id: number; title: string; difficulty_level_id: number | null }>> {
  const data = await getJson<unknown>(`${rp(env)}/case_setup_${caseSetupId}/objections`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
    .filter((o) => typeof o.id === "number")
    .map((o) => ({
      id: o.id as number,
      title: typeof o.title === "string" ? o.title : "",
      difficulty_level_id: typeof o.difficulty_level_id === "number" ? o.difficulty_level_id : null,
    }));
}

export async function createCaseSetupObjection(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  input: ContextObjectionInput,
): Promise<number | null> {
  const data = await postJson<{ id?: number }>(
    `${rp(env)}/case_setup_${caseSetupId}/objections`,
    token,
    input,
  );
  return typeof data.id === "number" ? data.id : null;
}

export interface ContextGuardrailInput {
  name: string;
  prompt: string;
}

export async function listContextGuardrails(
  env: PerfectingEnv,
  token: string,
  contextId: number,
): Promise<Array<{ id: number; name: string }>> {
  const data = await getJson<unknown>(`${rp(env)}/context_${contextId}/guardrails`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === "object")
    .filter((g) => typeof g.id === "number")
    .map((g) => ({
      id: g.id as number,
      name: typeof g.name === "string" ? g.name : "",
    }));
}

export async function createContextGuardrail(
  env: PerfectingEnv,
  token: string,
  contextId: number,
  input: ContextGuardrailInput,
): Promise<number | null> {
  // `rubrics` é obrigatório no schema da API; vazio = o guardrail não pontua rubrica,
  // só orienta o comportamento do comprador.
  const data = await postJson<{ id?: number }>(
    `${rp(env)}/context_${contextId}/guardrails`,
    token,
    { name: input.name, prompt: input.prompt, rubrics: [] },
  );
  return typeof data.id === "number" ? data.id : null;
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
  let data: { id?: number; offer_id?: number };
  try {
    data = await postJson<{ id?: number; offer_id?: number }>(
      `${rp(env)}/offer/create`,
      token,
      payload,
    );
  } catch (e) {
    // 500 genérico aqui não diz nada — anexa o tamanho de cada campo do payload
    // que mandamos, pra achar qual campo (provavelmente vindo do /offer/generate
    // da própria Perfecting) está grande/estranho o suficiente pra quebrar o create.
    if (e instanceof PerfectingError) {
      const fieldLengths = Object.fromEntries(
        Object.entries(payload).map(([k, v]) => [
          k,
          typeof v === "string" ? v.length : typeof v,
        ]),
      );
      const base = typeof e.detail === "object" && e.detail !== null ? e.detail : { detail: e.detail };
      throw new PerfectingError(e.status, { ...base, payloadFieldLengths: fieldLengths });
    }
    throw e;
  }
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

/** Início do `PROMPT_INTERNAL_USE_MARKER` do backend: depois dele vem `{{ref_token}}`. */
const CASE_PROMPT_INTERNAL_MARKER = "### USO INTERNO";

/** persona_prompt a partir do case_prompt gravado: sem a parte de uso interno e sem `{{placeholders}}`. */
export function personaPromptFromCasePrompt(casePrompt: unknown): string {
  if (typeof casePrompt !== "string") return "";
  const cut = casePrompt.indexOf(CASE_PROMPT_INTERNAL_MARKER);
  const body = cut >= 0 ? casePrompt.slice(0, cut) : casePrompt;
  return body.replace(/\{\{[^}]*\}\}/g, "").trim();
}

/**
 * Payload do persona/create que copia o comprador de um case_setup já criado
 * (receita da migração da org 59 em PROD). O montador da chamada põe o
 * `persona_prompt` literalmente na seção de personalidade, então ele carrega o
 * case_prompt inteiro. Sem voz: os agentes de PROD recusam override de voz e a
 * chamada cai ao conectar (1008); sem voice_id a chamada usa a voz do próprio
 * agente, que é a do comprador. null quando o case_prompt ainda não existe.
 */
export function buildPersonaFromCaseSetup(
  caseSetup: Record<string, unknown>,
  contextId: number,
): Record<string, unknown> | null {
  const personaPrompt = personaPromptFromCasePrompt(caseSetup.case_prompt);
  if (!personaPrompt) return null;
  const profile = asObject(caseSetup.persona_profile) ?? {};
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    context_id: contextId,
    name: text(profile.name),
    job_title: text(profile.job_title),
    department: text(profile.department),
    description: text(profile.description),
    persona_prompt: personaPrompt,
    voice_id: null,
  };
}

/** Criação manual (sem IA). Sem retry: o endpoint não tem dedupe e duplicaria a persona. */
export async function createPersona(
  env: PerfectingEnv,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: number; name: string | null }> {
  const data = await sendJson<{ id?: number; name?: string | null }>(
    "POST",
    `${rp(env)}/persona/create`,
    token,
    payload,
    0,
  );
  if (typeof data.id !== "number") throw new PerfectingError(502, "persona/create sem id");
  return { id: data.id, name: data.name ?? null };
}

/** Se a oferta/contexto ainda existe: ids guardados nas pontes podem ter sido apagados na Perfecting. */
export async function perfectingEntityExists(
  env: PerfectingEnv,
  token: string,
  entity: "offer" | "context",
  id: number,
): Promise<boolean> {
  try {
    await getJson(`${rp(env)}/${entity}_${id}`, token);
    return true;
  } catch (e) {
    if (e instanceof PerfectingError && e.status === 404) return false;
    throw e;
  }
}

/** case_setup cru (todos os campos), para quem precisa do case_prompt/persona_profile. */
export function getCaseSetupRaw(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
): Promise<Record<string, unknown>> {
  return getJson<Record<string, unknown>>(`${rp(env)}/case_setup_${caseSetupId}`, token);
}

export interface PersonaSummary {
  id: number;
  name: string | null;
  job_title: string | null;
}

/**
 * Personas já existentes num contexto. Espelha listCaseSetupIdsByContext: é a
 * fonte de verdade quando o stream do lote (openPersonaBatchStream) cair antes
 * de emitir `batch_ready`, e também o que permite reusar um contexto sem
 * recriar personas que um envio anterior já deixou lá.
 */
export async function listPersonasByContext(
  env: PerfectingEnv,
  token: string,
  contextId: number,
): Promise<PersonaSummary[]> {
  const data = await getJson<unknown>(`${rp(env)}/persona/list?context_id=${contextId}`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .filter((p) => typeof p.id === "number")
    .map((p) => ({
      id: p.id as number,
      name: typeof p.name === "string" ? p.name : null,
      job_title: typeof p.job_title === "string" ? p.job_title : null,
    }));
}

export interface PersonaBatchOptions {
  companyCreationQuantity?: number;
  existingCompanyIds?: number[];
  genderIds?: number[];
  ageGroupIds?: number[];
  additionalInstructions?: string | null;
}

/**
 * Abre o stream SSE do lote de geração de personas (até 10 por chamada).
 *
 * ⚠️ De propósito FORA de postJson/fetchWithTimeout, mesmo motivo de
 * openPlaybookImplementationStream (mais abaixo neste arquivo): o job é longo — o
 * S3 do pipeline gera conteúdo de etapa/bloco para cada persona nova em CADA
 * case_setup já existente no contexto, então o tempo cresce com o histórico do
 * contexto, não só com a quantidade pedida — e um retry criaria um SEGUNDO
 * lote de N personas (não há chave de dedupe no endpoint). Quem chama
 * reconcilia por listPersonasByContext, nunca reabrindo o stream.
 */
export async function openPersonaBatchStream(
  env: PerfectingEnv,
  token: string,
  contextId: number,
  personaQuantity: number,
  options: PersonaBatchOptions = {},
): Promise<Response> {
  const url = new URL(`${rp(env)}/persona/generate_batch/sse`);
  url.searchParams.set("context_id", String(contextId));
  url.searchParams.set("persona_quantity", String(personaQuantity));
  if (options.companyCreationQuantity) {
    url.searchParams.set("company_creation_quantity", String(options.companyCreationQuantity));
  }
  for (const id of options.existingCompanyIds ?? []) {
    url.searchParams.append("existing_company_ids", String(id));
  }
  for (const id of options.genderIds ?? []) url.searchParams.append("gender_ids", String(id));
  for (const id of options.ageGroupIds ?? []) url.searchParams.append("age_group_ids", String(id));
  const instructions = options.additionalInstructions?.trim();
  if (instructions) url.searchParams.set("additional_instructions", instructions);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new PerfectingError(res.status, detail || "persona/generate_batch/sse sem corpo");
  }
  return res;
}

/**
 * Trava (personaId) ou destrava (null) a persona de um case_setup.
 *
 * ⚠️ `?generate_case_prompt=false` é OBRIGATÓRIO: com o default (true) a API
 * tenta regenerar o case_prompt na mesma chamada e quebra. O corpo é merge
 * parcial — mandar só `{ persona_id }` não apaga nenhum outro campo do
 * case_setup. A API NÃO valida se a persona pertence ao contexto do
 * case_setup; é responsabilidade de quem chama.
 */
export async function setCaseSetupPersona(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  personaId: number | null,
): Promise<void> {
  await putJson(
    `${rp(env)}/case_setup_${caseSetupId}?generate_case_prompt=false`,
    token,
    { persona_id: personaId },
  );
}

/** Quais personas um roleplay aceita, já resolvido da árvore do catálogo. */
export interface CaseSetupPersonas {
  case_setup_id: number;
  training_name: string | null;
  /** true = travado nesta persona só; false = genérico (aceita todas do contexto). */
  has_specific_persona: boolean;
  personas: Array<{ id: number; name: string | null }>;
}

/**
 * Personas que cada roleplay de um contexto aceita — o read-back honesto do modo
 * multi-persona: é o MESMO endpoint que a tela de pré-chamada da Perfecting usa
 * para montar o seletor de persona, então o que vem aqui é o que o vendedor vai
 * ver (ela mostra o seletor quando há mais de uma persona aplicável).
 *
 * A API devolve `offer → contexts → personas → case_setups`, com o case_setup
 * genérico REPLICADO sob todas as personas do contexto; aqui a árvore é invertida
 * para `case_setup → personas`, que é o que a UI precisa.
 *
 * ⚠️ `/persona/catalog` não existe na API de produção — some junto com o resto do
 * modo playbook. Quem chama trata a falha como "sem catálogo", não como erro.
 */
export async function listCaseSetupPersonas(
  env: PerfectingEnv,
  token: string,
  contextId: number,
): Promise<CaseSetupPersonas[]> {
  const data = await getJson<unknown>(
    `${rp(env)}/persona/catalog?context_id=${contextId}`,
    token,
  );
  const offers = Array.isArray(data) ? data : [];
  const byCaseSetup = new Map<number, CaseSetupPersonas>();

  for (const offer of offers) {
    const contexts = (offer as { contexts?: unknown[] })?.contexts ?? [];
    for (const context of contexts) {
      const personas = (context as { personas?: unknown[] })?.personas ?? [];
      for (const persona of personas) {
        const p = persona as {
          id?: unknown;
          name?: unknown;
          case_setups?: unknown[];
        };
        if (typeof p.id !== "number") continue;
        const personaRef = { id: p.id, name: typeof p.name === "string" ? p.name : null };
        for (const cs of p.case_setups ?? []) {
          const c = cs as {
            id?: unknown;
            training_name?: unknown;
            has_specific_persona?: unknown;
          };
          if (typeof c.id !== "number") continue;
          const entry = byCaseSetup.get(c.id) ?? {
            case_setup_id: c.id,
            training_name: typeof c.training_name === "string" ? c.training_name : null,
            has_specific_persona: c.has_specific_persona === true,
            personas: [],
          };
          entry.personas.push(personaRef);
          byCaseSetup.set(c.id, entry);
        }
      }
    }
  }
  return Array.from(byCaseSetup.values()).sort((a, b) => a.case_setup_id - b.case_setup_id);
}

/** Campos mínimos de um case_setup lido de volta — casar etapa↔roleplay e ver se terminou. */
export async function getCaseSetup(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
): Promise<{
  id: number;
  playbook_call_type_id: number | null;
  persona_id: number | null;
  /** Último passo do ciclo de montagem da Perfecting: null = ciclo não terminou (ou falhou). */
  elevenlabs_agent_id: string | null;
}> {
  const data = await getJson<Record<string, unknown>>(`${rp(env)}/case_setup_${caseSetupId}`, token);
  return {
    id: caseSetupId,
    playbook_call_type_id:
      typeof data.playbook_call_type_id === "number" ? data.playbook_call_type_id : null,
    persona_id: typeof data.persona_id === "number" ? data.persona_id : null,
    elevenlabs_agent_id:
      typeof data.elevenlabs_agent_id === "string" && data.elevenlabs_agent_id
        ? data.elevenlabs_agent_id
        : null,
  };
}

// Passos isolados do ciclo de montagem de um roleplay na Perfecting — para completar
// um roleplay cujo ciclo falhou no meio (o worker deles pula a etapa e segue). Sem
// retry: são gerações com IA ou criação de agente de voz, que não podem duplicar.

export type CaseSetupRepairStep =
  | "behavior_guidance"
  | "objections"
  | "update_prompt"
  | "elevenlabs_agent"
  | "last_call_info";

const CASE_SETUP_REPAIR_PATHS: Record<CaseSetupRepairStep, { path: string; body: unknown }> = {
  behavior_guidance: { path: "behavior_guidance/regenerate", body: {} },
  objections: { path: "objections/generate", body: { scope: "global", overwrite: false } },
  update_prompt: { path: "unitary_cycle/update_case_prompt", body: {} },
  elevenlabs_agent: { path: "unitary_cycle/create_elevenlabs_agent", body: {} },
  last_call_info: { path: "playbook_last_call_info/regenerate", body: {} },
};

export async function runCaseSetupRepairStep(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  step: CaseSetupRepairStep,
): Promise<unknown> {
  const { path, body } = CASE_SETUP_REPAIR_PATHS[step];
  return sendJson("POST", `${rp(env)}/case_setup_${caseSetupId}/${path}`, token, body, 0);
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

export interface CaseSetupCreateOptions {
  /** undefined → omite o param (API usa default = true). */
  generateCasePrompt?: boolean;
  /**
   * Metodologias a vincular no ato da criação. Sem vínculo, o conteúdo por
   * etapa sai vazio e o roleplay nasce sem "# Conhecimento de Background".
   * ⚠️ A API valida os ids ANTES de escrever: id inexistente = 404 e nenhum
   * roleplay criado. Por isso só entram ids resolvidos no próprio ambiente.
   */
  methodologyIds?: number[];
  /** Mesmo nível das objeções do material — senão elas nunca chegam ao comprador. */
  difficultyLevelId?: number;
}

/** Acrescenta ao payload do create o que o contrato legado aceita mas não exige. */
export function applyCaseSetupExtras(
  payload: Record<string, unknown>,
  options: CaseSetupCreateOptions,
): Record<string, unknown> {
  return {
    ...payload,
    ...(options.methodologyIds && options.methodologyIds.length > 0
      ? { methodology_ids: options.methodologyIds }
      : {}),
    ...(options.difficultyLevelId != null
      ? { difficulty_level_id: options.difficultyLevelId }
      : {}),
  };
}

export async function createCaseSetup(
  env: PerfectingEnv,
  token: string,
  generated: Record<string, unknown>,
  contextId: number,
  callContextTypeId: number | undefined,
  userGroupId: number | null,
  options: CaseSetupCreateOptions = {},
): Promise<{ id: number; elevenlabs_agent_id: string | null }> {
  const base =
    env === "hml"
      ? buildHmlCaseSetupCreate(generated, contextId, callContextTypeId, userGroupId)
      : buildProdCaseSetupCreate(generated, contextId, callContextTypeId, userGroupId);
  const payload = applyCaseSetupExtras(base, options);
  const { generateCasePrompt } = options;
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

/** Acha a metodologia pelo slug (derivado do nome, como em call_contexts). */
export function matchMethodologySlug(
  items: Methodology[],
  slug: string | null | undefined,
): Methodology | undefined {
  if (!slug || !slug.trim()) return undefined;
  const target = slugify(slug.trim());
  return items.find((m) => m.slug === target);
}

/**
 * Slug da metodologia → id NO AMBIENTE DE DESTINO.
 *
 * Guardamos slug e não id porque o id não é portável entre HML e PROD, e um id
 * inexistente derruba o case_setup/create inteiro com 404 (a API valida as
 * metodologias antes de escrever qualquer coisa). Não achou → undefined, e quem
 * chama segue sem vincular (o fechamento tenta de novo depois).
 */
export async function resolveMethodologyId(
  env: PerfectingEnv,
  token: string,
  slug: string | null | undefined,
): Promise<number | undefined> {
  if (!slug || !slug.trim()) return undefined;
  const items = await listMethodologies(env, token);
  return matchMethodologySlug(items, slug)?.id;
}

/** Metodologias já vinculadas a um roleplay. O gate não tem flag pra isso. */
export async function listCaseSetupMethodologies(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
): Promise<Array<{ id: number; name: string | null }>> {
  const data = await getJson<unknown>(`${rp(env)}/case_setup_${caseSetupId}/methodologies`, token);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
    .filter((m) => typeof m.id === "number")
    .map((m) => ({ id: m.id as number, name: typeof m.name === "string" ? m.name : null }));
}

/**
 * Vincula metodologias a um roleplay já criado. SUBSTITUI o conjunto inteiro
 * (manda os ids que devem ficar), e lista vazia é recusada pela API.
 * Determinístico, sem IA — por isso mantém o retry padrão.
 */
export async function setCaseSetupMethodologies(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  methodologyIds: number[],
): Promise<void> {
  if (methodologyIds.length === 0) {
    throw new PerfectingError(422, "methodologies PUT exige ao menos uma metodologia");
  }
  await putJson(`${rp(env)}/case_setup_${caseSetupId}/methodologies`, token, {
    methodology_ids: methodologyIds,
  });
}

// ── Fechamento do roleplay: rubricas, conteúdo por etapa e gate ────────────

/** Rubricas de avaliação já cadastradas no roleplay (leitura barata do fechamento). */
export async function listCaseSetupRubrics(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
): Promise<Array<{ id: number }>> {
  const data = await getJson<unknown>(
    `${rp(env)}/case_setup_${caseSetupId}/feedback_rubrics`,
    token,
  );
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.id === "number")
    .map((r) => ({ id: r.id as number }));
}

/**
 * Gera as rubricas do roleplay. São a primeira fonte do "# Comportamento" e do
 * feedback da call — o case_setup/create não cria nenhuma.
 * `overwrite: false` pula a categoria que já tem rubrica, então rechamar é barato.
 * Sem retry: é geração com IA.
 */
export function generateCaseSetupRubrics(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  opts: { rubricType?: "seller" | "roleplay" | "both"; overwrite?: boolean } = {},
): Promise<Record<string, unknown>> {
  return sendJson(
    "POST",
    `${rp(env)}/case_setup_${caseSetupId}/feedback_rubrics/generate`,
    token,
    { rubric_type: opts.rubricType ?? "both", overwrite: opts.overwrite ?? false },
    0,
  );
}

/** Blocos de conteúdo por etapa já gerados (o "# Conhecimento de Background"). */
export async function listStepKnowledge(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  personaId?: number | null,
): Promise<Array<{ id: number }>> {
  const qs = personaId != null ? `?persona_id=${personaId}` : "";
  const data = await getJson<unknown>(
    `${rp(env)}/case_setup_${caseSetupId}/step_knowledge${qs}`,
    token,
  );
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((k): k is Record<string, unknown> => Boolean(k) && typeof k === "object")
    .filter((k) => typeof k.id === "number")
    .map((k) => ({ id: k.id as number }));
}

export interface StepKnowledgeResult {
  case_setup_id: number | null;
  status: string | null;
  skip_reason: string | null;
  items_created: number;
}

export interface StepKnowledgeOutput {
  case_setups_processed: number;
  case_setups_skipped: number;
  items_generated: number;
  results: StepKnowledgeResult[];
}

/**
 * Conteúdo por etapa (equivale ao passo S3 do ciclo unitário da Perfecting).
 *
 * ⚠️ É o passo LENTO: roda `nº de personas do contexto × (nº de etapas + 1)`
 * chamadas de IA EM SÉRIE, sem paralelismo do lado deles — costuma estourar o
 * wall clock da Edge Function enquanto a Perfecting continua trabalhando. Por
 * isso: sem retry aqui, e quem chama reconcilia depois por listStepKnowledge.
 *
 * Só produz conteúdo com metodologia vinculada E persona no contexto; senão
 * devolve 200 com items_generated 0 (sucesso vazio) e o motivo em skip_reason.
 * Rechamar com conteúdo existente devolve `already_has_items` sem gastar IA.
 */
export async function generateStepKnowledge(
  env: PerfectingEnv,
  token: string,
  caseSetupIds: number[],
  opts: { overwrite?: boolean } = {},
): Promise<StepKnowledgeOutput> {
  const data = await sendJson<Record<string, unknown>>(
    "POST",
    `${rp(env)}/case_setup/step_knowledge/generate`,
    token,
    { case_setup_ids: caseSetupIds, overwrite: opts.overwrite ?? false },
    0,
  );
  const rawResults = Array.isArray(data.results) ? data.results : [];
  return {
    case_setups_processed: typeof data.case_setups_processed === "number"
      ? data.case_setups_processed
      : 0,
    case_setups_skipped: typeof data.case_setups_skipped === "number"
      ? data.case_setups_skipped
      : 0,
    items_generated: typeof data.items_generated === "number" ? data.items_generated : 0,
    results: rawResults
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((r) => ({
        case_setup_id: typeof r.case_setup_id === "number" ? r.case_setup_id : null,
        status: typeof r.status === "string" ? r.status : null,
        skip_reason: typeof r.skip_reason === "string" ? r.skip_reason : null,
        items_created: typeof r.items_created === "number" ? r.items_created : 0,
      })),
  };
}

/**
 * O prompt que o comprador vai usar, REMONTADO na hora pela Perfecting, com as
 * flags do que entrou nele. É o gate do envio: `cases_setup.case_prompt` (a
 * coluna persistida) não serve, porque a call nem a lê.
 *
 * ⚠️ Todas as flags (menos has_persona_company/has_tone) vêm false quando não há
 * persona resolvível — por isso has_persona é a primeira coisa a checar.
 */
export interface RolePlayPromptGate {
  case_setup_id: number;
  prompt: string;
  has_persona: boolean;
  has_persona_company: boolean;
  has_tone: boolean;
  has_behavior_guidance: boolean;
  has_prior_knowledge: boolean;
  has_conversation_history: boolean;
  has_knowledge_blocks: boolean;
  has_objections: boolean;
  has_difficulty_level: boolean;
  persona_randomly_selected: boolean;
}

export async function getRolePlayPrompt(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
): Promise<RolePlayPromptGate> {
  const data = await getJson<Record<string, unknown>>(
    `${rps(env)}/role_play_prompt?case_setup_id=${caseSetupId}`,
    token,
  );
  const flag = (key: string) => data[key] === true;
  return {
    case_setup_id: typeof data.case_setup_id === "number" ? data.case_setup_id : caseSetupId,
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    has_persona: flag("has_persona"),
    has_persona_company: flag("has_persona_company"),
    has_tone: flag("has_tone"),
    has_behavior_guidance: flag("has_behavior_guidance"),
    has_prior_knowledge: flag("has_prior_knowledge"),
    has_conversation_history: flag("has_conversation_history"),
    has_knowledge_blocks: flag("has_knowledge_blocks"),
    has_objections: flag("has_objections"),
    has_difficulty_level: flag("has_difficulty_level"),
    persona_randomly_selected: flag("persona_randomly_selected"),
  };
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
  /**
   * Etapa anterior da jornada. Sem ela a Perfecting não sabe o que veio antes e gera o
   * "resumo da chamada anterior" como uma história de primeiro contato inventada — o
   * backend não infere a sequência pela `order`.
   */
  precedent_call_type_id?: number | null;
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
      ...(input.precedent_call_type_id != null && {
        precedent_call_type_id: input.precedent_call_type_id,
      }),
    },
  );
  if (typeof data.id !== "number") throw new PerfectingError(502, "call_types sem id");
  return data.id;
}

/** Define (ou limpa, com null) a etapa anterior de uma etapa já criada. */
export async function setPlaybookCallTypePrecedent(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
  precedentCallTypeId: number | null,
): Promise<void> {
  await patchJson(`${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}`, token, {
    precedent_call_type_id: precedentCallTypeId,
  });
}

/**
 * Gera com IA as rubricas estruturadas dos blocos de uma etapa. É nelas que a avaliação
 * de uma sessão de playbook se apoia (lidas na hora da sessão, então valem também para
 * roleplays já criados). `overwrite: false` pula blocos que já têm rubrica. Sem retry:
 * é geração com IA e pode levar mais de um minuto.
 */
export async function generatePlaybookCallTypeRubrics(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
): Promise<unknown> {
  return sendJson(
    "POST",
    `${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}/feedback_rubrics/generate`,
    token,
    { overwrite: false },
    0,
  );
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

export interface PlaybookCallBlock {
  id: number;
  name: string;
  description: string | null;
  objective: string | null;
  what_to_do: string[];
  order: number | null;
}

export async function listPlaybookCallBlocks(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
): Promise<PlaybookCallBlock[]> {
  const data = await getJson<unknown>(
    `${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}/call_blocks`,
    token,
  );
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
    .filter((b) => typeof b.id === "number")
    .map((b) => ({
      id: b.id as number,
      name: typeof b.name === "string" ? b.name : `Bloco ${b.id}`,
      description: typeof b.description === "string" ? b.description : null,
      objective: typeof b.objective === "string" ? b.objective : null,
      what_to_do: Array.isArray(b.what_to_do)
        ? b.what_to_do.filter((w): w is string => typeof w === "string")
        : [],
      order: typeof b.order === "number" ? b.order : null,
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// Objeções do CATÁLOGO do playbook (por bloco). Diferente das context-wide: não vão
// para o prompt do comprador — aparecem no painel do vendedor durante a call, como
// sub-opções de cada item do bloco (ver AgentCallDataBuilder no backend). E valem para
// toda implementação desse playbook, de qualquer oferta.

export async function listPlaybookCallBlockObjections(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
  callBlockId: number,
): Promise<Array<{ id: number; title: string }>> {
  const data = await getJson<unknown>(
    `${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}/call_blocks/${callBlockId}/objections`,
    token,
  );
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
    .filter((o) => typeof o.id === "number")
    .map((o) => ({ id: o.id as number, title: typeof o.title === "string" ? o.title : "" }));
}

/** Quantas rubricas estruturadas o bloco tem (as que a avaliação da sessão usa). */
export async function countPlaybookCallBlockRubrics(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
  callBlockId: number,
): Promise<number> {
  const data = await getJson<unknown>(
    `${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}/call_blocks/${callBlockId}/feedback_rubrics`,
    token,
  );
  return Array.isArray(data) ? data.length : 0;
}

export interface PlaybookCallBlockObjectionInput {
  objection_type_id: number;
  title: string;
  description?: string | null;
  details?: string | null;
  to_give_in_if?: string | null;
}

export async function createPlaybookCallBlockObjection(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  callTypeId: number,
  callBlockId: number,
  input: PlaybookCallBlockObjectionInput,
): Promise<number | null> {
  // Sem difficulty_level_id: o painel do vendedor lista por bloco sem filtrar nível, e
  // uma cópia por nível apareceria triplicada ali.
  const data = await postJson<{ id?: number }>(
    `${rp(env)}/playbook_${playbookId}/call_types/${callTypeId}/call_blocks/${callBlockId}/objections`,
    token,
    input,
  );
  return typeof data.id === "number" ? data.id : null;
}

/**
 * Abre o stream SSE do Engine de Implementação por Playbook: cria UM case_setup
 * por PlaybookCallType do playbook, ancorado em context_id e, opcionalmente, numa
 * persona.
 *
 * `personaId`:
 *  - informado  → todo case_setup criado nasce travado nessa persona (comportamento
 *    de sempre, usado quando o contexto tem 1 persona só).
 *  - omitido/null → `cases_setup.persona_id` fica NULL em todos: etapa GENÉRICA,
 *    aplicável a qualquer persona do context_id — o vendedor escolhe na hora da
 *    call. É o caminho usado quando o contexto tem mais de uma persona (ver
 *    openPersonaBatchStream); o Ciclo Unitário embutido faz fan-out de conteúdo
 *    por etapa para CADA persona já existente no contexto, então elas precisam
 *    ter sido criadas ANTES de abrir este stream.
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
