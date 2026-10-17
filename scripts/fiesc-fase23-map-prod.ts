/**
 * Traduz o spec da Fase 2/3 da FIESC do HML (org 14) para PROD (org 52) e confere, só
 * lendo, tudo o que o fiesc-fase23.ts vai usar em PROD. Não escreve nada em nenhum
 * ambiente — só gera docs/FIESC-B2G/fase23-spec.prod.json.
 *
 *   - oferta: a do roleplay da Fase 1 em PROD (pares HML 122/123/124 = PROD 249/250/251,
 *     conferidos pelo nome do roleplay);
 *   - dores e produtos da persona: pelo título/nome na oferta de PROD;
 *   - dificuldades (1/2/3 fixos no facility), tipos de objeção, tipo de chamada,
 *     metodologia e o usuário criador (precisa estar ativo na org).
 *
 * Qualquer divergência aborta (exit 1) sem gerar o arquivo.
 *
 * Uso:
 *   deno run -A --env-file=.env.hml.local --env-file=.env.prod.local \
 *     scripts/fiesc-fase23-map-prod.ts --as-user=269
 */
import {
  DIFFICULTY_LEVEL_IDS,
  findManagerUserId,
  getEnvConfig,
  listCallContexts,
  listMethodologies,
  listObjectionTypes,
  listOfferPains,
  listOfferProducts,
  loginAsUser,
  loginSuperadmin,
  type PerfectingEnv,
} from "../supabase/functions/_shared/perfecting.ts";

const ROOT = new URL("..", import.meta.url);
const SPEC_HML = new URL("docs/FIESC-B2G/fase23-spec.json", ROOT);
const SPEC_PROD = new URL("docs/FIESC-B2G/fase23-spec.prod.json", ROOT);
const PROD_ORG = 52;
/** Pares da Fase 1: HML → PROD (migração de 01/10). Conferidos pelo nome abaixo. */
const FASE1_PAIRS: Record<number, number> = { 122: 249, 123: 250, 124: 251 };

const asUserArg = Deno.args.find((a) => a.startsWith("--as-user="));
if (!asUserArg) throw new Error("--as-user=<id> é obrigatório (criador dos roleplays em PROD)");
const AS_USER = Number(asUserArg.slice("--as-user=".length));

const problems: string[] = [];
const fail = (msg: string) => {
  problems.push(msg);
  console.error(`  ✗ ${msg}`);
};
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function get<T>(env: PerfectingEnv, path: string, token: string): Promise<T> {
  const res = await fetch(`${getEnvConfig(env).api}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const raw = await res.text();
  if (!res.ok) throw new Error(`GET ${path} (${env}) → ${res.status}: ${raw.slice(0, 300)}`);
  return (raw ? JSON.parse(raw) : {}) as T;
}
const list = (d: unknown) =>
  (Array.isArray(d) ? d : ((d as { items?: unknown[] })?.items ?? [])) as Array<Record<string, unknown>>;

// ── Logins (só leitura) ───────────────────────────────────────────────────
const spec = JSON.parse(await Deno.readTextFile(SPEC_HML));
const hmlSa = await loginSuperadmin("hml");
const hmlUser = await findManagerUserId("hml", hmlSa, spec.org_id);
if (hmlUser == null) throw new Error("HML: nenhum usuário na org do spec");
const hml = await loginAsUser("hml", hmlSa, hmlUser, spec.org_id);

const prodSa = await loginSuperadmin("prod");
const prodUsers = list(await get("prod", `/superadmin/users?organization_id=${PROD_ORG}`, prodSa));
const creator = prodUsers.find((u) => u.id === AS_USER);
if (!creator) throw new Error(`PROD: usuário ${AS_USER} não está na org ${PROD_ORG}`);
if (creator.is_active === false) throw new Error(`PROD: usuário ${AS_USER} está inativo`);
const prod = await loginAsUser("prod", prodSa, AS_USER, PROD_ORG);
console.log(`✓ login: HML org ${spec.org_id} (usuário ${hmlUser}) · PROD org ${PROD_ORG} como ${creator.name ?? AS_USER}`);

// ── Catálogos globais ─────────────────────────────────────────────────────
const diffs = async (env: PerfectingEnv, token: string) =>
  new Map(list(await get(env, "/role_plays/difficulty_levels", token)).map((d) => [d.id as number, norm(d.name)]));
const [dH, dP] = [await diffs("hml", hml), await diffs("prod", prod)];
for (const id of DIFFICULTY_LEVEL_IDS) {
  if (!dP.has(id)) fail(`dificuldade ${id} não existe em PROD`);
  else if (dH.get(id) !== dP.get(id)) fail(`dificuldade ${id}: HML "${dH.get(id)}" ≠ PROD "${dP.get(id)}"`);
}
if (!dP.has(spec.difficulty_level_id)) fail(`difficulty_level_id ${spec.difficulty_level_id} não existe em PROD`);
console.log(`✓ dificuldades PROD: ${[...dP].map(([k, v]) => `${k}=${v}`).join(", ")}`);

const objTypes = new Set((await listObjectionTypes("prod", prod)).map((t) => t.slug));
const usedTypes = new Set<string>();
for (const c of spec.contas) for (const f of Object.values(c.fases) as Array<{ objecoes: Array<{ tipo: string }> }>) {
  for (const o of f.objecoes) usedTypes.add(o.tipo);
}
for (const t of usedTypes) if (!objTypes.has(t)) fail(`tipo de objeção "${t}" não existe em PROD`);
console.log(`✓ tipos de objeção usados: ${[...usedTypes].join(", ")}`);

const ctxSlugs = new Set((await listCallContexts("prod", prod)).map((c) => c.slug));
for (const ct of spec.playbook.call_types) {
  if (!ctxSlugs.has(ct.call_context_slug)) fail(`tipo de chamada "${ct.call_context_slug}" não existe em PROD`);
}
console.log(`✓ tipos de chamada: ${spec.playbook.call_types.map((c: { call_context_slug: string }) => c.call_context_slug).join(", ")}`);

if (!(await listMethodologies("prod", prod)).some((m) => m.slug === spec.methodology_slug)) {
  fail(`metodologia ${spec.methodology_slug} não existe em PROD`);
}

const prodPlaybooks = list(await get("prod", "/role_plays/playbook/list", prod));
if (prodPlaybooks.some((p) => p.name === spec.playbook.name)) {
  fail(`já existe em PROD um playbook "${spec.playbook.name}" (rodada anterior?)`);
}

// ── Contas: oferta, dores e produtos ──────────────────────────────────────
const prodSpec = structuredClone(spec);
prodSpec.org_id = PROD_ORG;
prodSpec._comentario = `${spec._comentario} — PROD: gerado por scripts/fiesc-fase23-map-prod.ts em ${new Date().toISOString()}.`;

for (const conta of prodSpec.contas) {
  console.log(`\n━━ ${conta.rotulo}`);
  const hmlCs = await get<Record<string, unknown>>("hml", `/role_plays/case_setup_${conta.fase1_case_setup_id}`, hml);
  const prodCsId = FASE1_PAIRS[conta.fase1_case_setup_id];
  if (prodCsId == null) {
    fail(`${conta.key}: sem par em PROD para o roleplay ${conta.fase1_case_setup_id}`);
    continue;
  }
  const prodCs = await get<Record<string, unknown>>("prod", `/role_plays/case_setup_${prodCsId}`, prod);
  const nameOf = (cs: Record<string, unknown>) => norm(cs.training_name ?? cs.name);
  if (nameOf(hmlCs) !== nameOf(prodCs)) {
    fail(`${conta.key}: Fase 1 HML ${conta.fase1_case_setup_id} "${nameOf(hmlCs)}" ≠ PROD ${prodCsId} "${nameOf(prodCs)}"`);
  }
  const hmlOffer = Number(hmlCs.offer_id);
  if (hmlOffer !== conta.offer_id) fail(`${conta.key}: o roleplay HML está na oferta ${hmlOffer}, o spec diz ${conta.offer_id}`);
  const prodOffer = Number(prodCs.offer_id);
  if (!Number.isFinite(prodOffer) || prodOffer <= 0) {
    fail(`${conta.key}: o roleplay PROD ${prodCsId} não tem offer_id (${String(prodCs.offer_id)})`);
    continue;
  }

  const [hPains, pPains] = [await listOfferPains("hml", hml, hmlOffer), await listOfferPains("prod", prod, prodOffer)];
  const painMap = new Map<number, number>();
  for (const hp of hPains) {
    const match = pPains.filter((pp) => norm(pp.title) === norm(hp.title));
    if (match.length === 1) painMap.set(hp.id, match[0].id);
  }
  const [hProds, pProds] = [
    (await listOfferProducts("hml", hml, hmlOffer)) ?? [],
    (await listOfferProducts("prod", prod, prodOffer)) ?? [],
  ];
  const prodMap = new Map<number, number>();
  for (const hp of hProds) {
    const match = pProds.filter((pp) => norm(pp.name) === norm(hp.name));
    if (match.length === 1) prodMap.set(hp.id, match[0].id);
  }

  for (const d of conta.persona.dores) {
    const to = painMap.get(d.offer_pain_id);
    if (to == null) fail(`${conta.key}: dor ${d.offer_pain_id} sem par único em PROD (oferta ${prodOffer})`);
    else d.offer_pain_id = to;
  }
  for (const x of conta.persona.produtos) {
    const to = prodMap.get(x.offer_product_id);
    if (to == null) fail(`${conta.key}: produto ${x.offer_product_id} sem par único em PROD (oferta ${prodOffer})`);
    else x.offer_product_id = to;
  }
  console.log(
    `  oferta HML ${hmlOffer} → PROD ${prodOffer} · Fase 1 ${conta.fase1_case_setup_id} → ${prodCsId} · ` +
      `${conta.persona.dores.length} dores, ${conta.persona.produtos.length} produtos ` +
      `(PROD tem ${pPains.length} dores e ${pProds.length} produtos na oferta)`,
  );
  conta.offer_id = prodOffer;
  conta.fase1_case_setup_id = prodCsId;
}

if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} problema(s). Nada foi gerado.`);
  Deno.exit(1);
}
await Deno.writeTextFile(SPEC_PROD, JSON.stringify(prodSpec, null, 2) + "\n");
console.log(`\n✓ ${SPEC_PROD.pathname}`);
