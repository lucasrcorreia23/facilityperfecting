/**
 * Slugs das etapas do playbook → ids NA CONTA DE DESTINO, resolvidos de uma vez.
 *
 * Antes o envio consultava `/call_contexts` a cada etapa e, quando o slug não existia
 * na conta (ou a consulta falhava), criava a etapa sem tipo de ligação em silêncio.
 * Sem metodologia, idem: o motor de implementação pode pular a etapa inteira. Aqui
 * tudo o que não resolveu vira aviso, para a tela mostrar antes de alguém implementar.
 *
 * Puro: recebe as listas já carregadas.
 */

export interface TaxonomyCallType {
  id: string;
  name: string;
  call_context_slug: string | null;
  methodology_slug: string | null;
}

export interface TaxonomyRef {
  id: number;
  slug: string;
}

export interface ResolvedCallTypeTaxonomy {
  callContextTypeId: number | null;
  methodologyId: number | null;
}

export interface PlaybookTaxonomy {
  byCallType: Record<string, ResolvedCallTypeTaxonomy>;
  warnings: string[];
}

/** Mesma normalização do `slugify` de perfecting.ts (nome → slug com "_"). */
function normSlug(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolvePlaybookTaxonomy(
  callTypes: readonly TaxonomyCallType[],
  callContexts: readonly TaxonomyRef[],
  methodologies: readonly TaxonomyRef[],
): PlaybookTaxonomy {
  const contextBySlug = new Map(callContexts.map((c) => [normSlug(c.slug), c.id]));
  const methodologyBySlug = new Map(methodologies.map((m) => [normSlug(m.slug), m.id]));
  const byCallType: Record<string, ResolvedCallTypeTaxonomy> = {};
  const warnings: string[] = [];

  callTypes.forEach((ct, i) => {
    const label = `Etapa ${i + 1} (${ct.name.trim() || "sem nome"})`;
    const contextSlug = (ct.call_context_slug ?? "").trim();
    const methodologySlug = (ct.methodology_slug ?? "").trim();
    const callContextTypeId = contextSlug ? contextBySlug.get(normSlug(contextSlug)) ?? null : null;
    const methodologyId = methodologySlug ? methodologyBySlug.get(normSlug(methodologySlug)) ?? null : null;

    if (!contextSlug) {
      warnings.push(`${label}: sem tipo de ligação — a etapa foi criada sem ele`);
    } else if (callContextTypeId == null) {
      warnings.push(`${label}: o tipo de ligação "${contextSlug}" não existe na conta de destino — a etapa foi criada sem ele`);
    }
    if (!methodologySlug) {
      warnings.push(`${label}: sem metodologia — a implementação pode pular esta etapa`);
    } else if (methodologyId == null) {
      warnings.push(`${label}: a metodologia "${methodologySlug}" não existe na conta de destino — a implementação pode pular esta etapa`);
    }
    byCallType[ct.id] = { callContextTypeId, methodologyId };
  });

  return { byCallType, warnings };
}
