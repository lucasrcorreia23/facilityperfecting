/**
 * Nomes que o envio escreve em colunas com unicidade na Perfecting. Tudo o que colide
 * lá volta como 409 ou 500 genérico DEPOIS de parte do roleplay já existir, então o
 * nome nasce único aqui.
 *
 *  - guardrails.name: único entre todas as contas → sufixo do contexto.
 *  - personas_companies.slug: único entre todas as contas → sufixo do contexto, e a
 *    empresa do mesmo contexto é reusada.
 *  - offers (name, organization_id) → nome livre escolhido contra a lista da conta.
 *
 * Só o sufixo, que é nosso, pode cortar o texto; o que a pessoa escreveu acima do
 * limite é recusado antes (perfecting-limits.ts).
 */
import { ENTITY_TEXT_MAX } from "./perfecting-limits.ts";
import { displayGuardrailName, guardrailSuffix } from "./roleplay-adjust-model.ts";

const norm = (s: string) => s.trim().toLocaleLowerCase("pt-BR");

/** Nome do guardrail como vai para a conta: "<nome> · ctx <contexto>". */
export function guardrailRemoteName(name: string, contextId: number): string {
  const suffix = guardrailSuffix(contextId);
  return `${name.trim().slice(0, ENTITY_TEXT_MAX - suffix.length)}${suffix}`;
}

/**
 * Chave de comparação com o que já existe NO contexto: o nome sem o sufixo. Guardrail
 * antigo, criado sem sufixo, casa com o novo e não é duplicado.
 */
export function guardrailKey(name: string, contextId: number): string {
  return norm(displayGuardrailName(name.trim(), contextId));
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug da empresa da persona: "<empresa>-<contexto>", dentro de 255. */
export function personaCompanySlug(companyName: string, contextId: number): string {
  const suffix = `-${contextId}`;
  const base = (slugify(companyName) || "empresa").slice(0, ENTITY_TEXT_MAX - suffix.length).replace(/-+$/g, "");
  return `${base}${suffix}`;
}

/** Empresa do contexto com o mesmo slug ou o mesmo nome — reusa em vez de recriar. */
export function findReusableCompany<T extends { slug?: string | null; name?: string | null }>(
  companies: readonly T[],
  companyName: string,
  slug: string,
): T | undefined {
  return (
    companies.find((c) => (c.slug ?? "") === slug) ??
    companies.find((c) => norm(c.name ?? "") === norm(companyName) && norm(companyName) !== "")
  );
}

/** "<base> (<marca>)" dentro do limite; corta a base, nunca a marca. */
export function withNameMark(base: string, mark: string, max = ENTITY_TEXT_MAX): string {
  const suffix = ` (${mark})`;
  return `${base.trim().slice(0, Math.max(1, max - suffix.length)).trim()}${suffix}`;
}

/**
 * Primeiro nome livre entre: a base, "base (marca)", "base (marca 2)", "base (marca 3)"…
 * `taken` são os nomes que já existem no escopo da unicidade (ex.: ofertas da conta).
 */
export function pickFreeName(
  base: string,
  taken: readonly string[],
  mark: string,
  max = ENTITY_TEXT_MAX,
): string {
  const used = new Set(taken.map(norm));
  const first = base.trim().slice(0, max).trim();
  if (!used.has(norm(first))) return first;
  for (let n = 1; n <= 200; n++) {
    const candidate = withNameMark(base, n === 1 ? mark : `${mark} ${n}`, max);
    if (!used.has(norm(candidate))) return candidate;
  }
  return withNameMark(base, `${mark} ${Date.now()}`, max);
}
