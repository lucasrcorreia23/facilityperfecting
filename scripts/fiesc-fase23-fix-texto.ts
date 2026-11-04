/**
 * Reaplica do spec, nos roleplays JÁ criados das Fases 2/3 da FIESC, só o texto que o
 * lint de texto do comprador cobre:
 *   - `buyer_prior_knowledge` ← `ja_sabe` (o "O que {persona} já sabe" da cola);
 *   - fala de exemplo, detalhes e condição de ceder das objeções do roleplay, casadas
 *     pelo título, SÓ nas linhas cujo texto vivo tem termo reservado (as outras
 *     diferenças são ajuste à mão e ficam).
 *
 * Não reexecuta o fiesc-fase23-hml.ts porque ele também reaplica status, guardrails,
 * conhecimento por etapa e o resumo da chamada anterior — em PROD isso esconderia
 * roleplay publicado e desfaria ajuste feito à mão.
 *
 * O Conhecimento Prévio do 1º bloco (o que o comprador LÊ) só é comparado, nunca
 * escrito: se divergir do `previo` do spec, alguém o editou à mão e quem decide é o
 * Lucas.
 *
 * Simulação por padrão; `--apply` escreve. Backup do estado lido em
 * ~/Desktop/Perfecting/backups/fiesc-fase23-fix-texto-<env>-<data>.json.
 *
 * Uso:
 *   deno run -A --env-file=.env.prod.local scripts/fiesc-fase23-fix-texto.ts --env=prod --as-user=269 [--apply] [--only=vila-serena]
 */
import {
  describeBuyerTextIssue,
  findReservedTerms,
  objectionTexts,
} from "../supabase/functions/_shared/buyer-text-lint.ts";
import {
  getCaseSetupRaw,
  getEnvConfig,
  loginAsUser,
  loginSuperadmin,
  setCaseSetupPriorKnowledge,
} from "../supabase/functions/_shared/perfecting.ts";
import { objectionTextPatch, type StageText, stageTextIssues } from "./fiesc-fase23-lint.ts";

const envArg = Deno.args.find((a) => a.startsWith("--env="));
const ENV = (envArg ? envArg.slice("--env=".length) : "hml") as "hml" | "prod";
const IS_PROD = ENV === "prod";
const APPLY = Deno.args.includes("--apply");
const asUserArg = Deno.args.find((a) => a.startsWith("--as-user="));
const AS_USER = asUserArg ? Number(asUserArg.slice("--as-user=".length)) : NaN;
if (!Number.isFinite(AS_USER)) throw new Error("--as-user=<id> é obrigatório");
const onlyArg = Deno.args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length) : null;

const ROOT = new URL("..", import.meta.url);
const spec = JSON.parse(
  await Deno.readTextFile(new URL(`docs/FIESC-B2G/fase23-spec${IS_PROD ? ".prod" : ""}.json`, ROOT)),
) as {
  org_id: number;
  contas: Array<{ key: string; fases: Record<string, StageText & { objecoes: Array<{ titulo: string; fala_exemplo: string; detalhes: string; ceder_se: string }> }> }>;
};
const state = JSON.parse(
  await Deno.readTextFile(new URL(`docs/FIESC-B2G/fase23-state.${ENV}.json`, ROOT)),
) as { contas: Record<string, { persona_id: number; case_setups: Record<string, number> }> };

// Lint primeiro: spec errado não chega à Perfecting.
const issues = spec.contas.flatMap((c) =>
  Object.entries(c.fases).flatMap(([stage, f]) => stageTextIssues(f, `${c.key}.${stage}`)),
);
const errors = issues.filter((i) => i.nivel === "erro");
for (const i of issues) console[i.nivel === "erro" ? "error" : "warn"](`  ${i.nivel === "erro" ? "✗" : "⚠️ "} ${describeBuyerTextIssue(i)}`);
if (errors.length > 0) throw new Error(`spec com ${errors.length} problema(s): corrija antes`);

const api = getEnvConfig(ENV).api;
console.log(`${api} · org ${spec.org_id} · como ${AS_USER} · ${APPLY ? "APLICANDO" : "simulação"}`);
const token = await loginAsUser(ENV, await loginSuperadmin(ENV), AS_USER, spec.org_id);

async function rp<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${api}/role_plays${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${raw.slice(0, 300)}`);
  return (raw ? JSON.parse(raw) : {}) as T;
}
const rows = (d: unknown) =>
  (Array.isArray(d) ? d : ((d as { items?: unknown[] })?.items ?? [])) as Array<Record<string, unknown>>;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

const backup: Record<string, unknown> = {};
const drift: string[] = [];
let writes = 0;

for (const conta of spec.contas) {
  if (ONLY && conta.key !== ONLY) continue;
  const st = state.contas[conta.key];
  if (!st) continue;
  for (const [stage, f] of Object.entries(conta.fases)) {
    const csId = st.case_setups[stage];
    if (!csId) continue;
    const label = `${conta.key}.${stage} (cs ${csId})`;
    const cs = await getCaseSetupRaw(ENV, token, csId);
    const objections = rows(await rp(`GET`, `/case_setup_${csId}/objections`));
    const steps = rows(await rp(`GET`, `/case_setup_${csId}/step_knowledge?persona_id=${st.persona_id}`));
    backup[csId] = { buyer_prior_knowledge: cs.buyer_prior_knowledge, objections, step_knowledge: steps };

    // Conhecimento Prévio do comprador: só confere.
    const withPrior = steps.filter((s) => String(s.prior_knowledge_prompt ?? "").trim());
    const prior = withPrior.map((s) => String(s.prior_knowledge_prompt).trim());
    if (!prior.includes(f.previo.trim())) {
      drift.push(`${label}: Conhecimento Prévio do comprador difere do spec → ${JSON.stringify(prior)}`);
    }

    const current = Array.isArray(cs.buyer_prior_knowledge) ? cs.buyer_prior_knowledge.map(String) : [];
    const want = (f.ja_sabe ?? []).map((s) => s.trim()).filter(Boolean);
    if (JSON.stringify(current) !== JSON.stringify(want)) {
      console.log(`• ${label}: já sabe\n    antes: ${JSON.stringify(current)}\n    depois: ${JSON.stringify(want)}`);
      if (APPLY) await setCaseSetupPriorKnowledge(ENV, token, csId, want);
      writes++;
    }

    for (const row of objections) {
      const o = f.objecoes.find((x) => norm(x.titulo) === norm(row.title));
      if (!o) continue;
      const patch = objectionTextPatch(row, o);
      if (!patch) continue;
      // Só corrige linha que viola a regra: o resto do diff é ajuste feito à mão em PROD
      // (o spec ficou para trás) e reaplicar o spec desfaria a calibração do time.
      const live = { titulo: String(row.title ?? ""), fala_exemplo: String(row.description ?? ""), detalhes: String(row.details ?? ""), ceder_se: String(row.to_give_in_if ?? "") };
      if (!findReservedTerms(objectionTexts([live])).some((i) => i.nivel === "erro")) {
        drift.push(`${label}: objeção ${row.id} "${row.title}" (nível ${row.difficulty_level_id}) difere do spec, mantida`);
        continue;
      }
      console.log(`• ${label}: objeção ${row.id} "${row.title}" (nível ${row.difficulty_level_id}) → ${JSON.stringify(patch)}`);
      if (APPLY) await rp("PATCH", `/case_setup_${csId}/objections/${row.id}`, patch);
      writes++;
    }
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${Deno.env.get("HOME")}/Desktop/Perfecting/backups/fiesc-fase23-fix-texto-${ENV}-${stamp}.json`;
await Deno.writeTextFile(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nbackup: ${backupPath}`);
for (const d of drift) console.warn(`  ⚠️  ${d}`);
console.log(`${writes} escrita(s) ${APPLY ? "feitas" : "pendentes (rode com --apply)"}`);
