import { messageOf } from "./context-content.ts";
import {
  createCaseSetupRubric,
  createOfferPain,
  createOfferProduct,
  createPersonaCompany,
  deleteCaseSetupRubric,
  generateDossierPersona,
  listCaseSetupRubricsFull,
  listFeedbackRubricTypes,
  listOfferPains,
  listOfferProducts,
  listStepKnowledgeItems,
  patchCaseSetup,
  patchStepKnowledge,
  type PerfectingEnv,
  type PersonaPainLinkInput,
  type PersonaProductLinkInput,
  setPersonaOfferProducts,
  setPersonaPains,
  updatePersona,
} from "./perfecting.ts";

/**
 * Dossiê do comprador: o material de UM roleplay avulso quando ele descreve uma conta
 * concreta — dores em camadas, as ofertas que resolvem cada dor e o que o comprador
 * sabe. É o formato do "dores × portfólio" do backend (offer_products, offer_pains,
 * persona_pains com camada de revelação).
 *
 * Por que existe: sem ele o backend gera persona, conhecimento por etapa, objeções e
 * rubricas sozinho, e inventa números, datas e uma "ligação anterior" que o material
 * não tem. Com ele, o que o cliente escreveu é o que chega ao comprador e à avaliação.
 *
 * Os campos ficam em português, como o resto do rascunho (ObjectionSeed etc.).
 */

export type RevealLevel = "superficie" | "sondada" | "oculta";

export interface DossierProduct {
  nome: string;
  descricao: string;
  problema_resolvido: string;
  beneficios: string;
}

export interface DossierPain {
  titulo: string;
  descricao: string;
  /** Nome do produto principal que resolve a dor; "" = dor sem produto. */
  produto: string;
}

export interface DossierPersonaPain {
  /** Título da dor em `dores`. */
  dor: string;
  revelacao: RevealLevel;
  /** Como a dor aparece para ESTE comprador (fala, quando revela). */
  detalhe: string;
}

export interface DossierPersonaProduct {
  produto: string;
  /** Postura do comprador diante desse TIPO de solução — sem nome de produto. */
  postura: string;
}

export interface DossierTopic {
  titulo: string;
  texto: string;
}

export interface DossierRubric {
  criterio: string;
  descricao: string;
  dica: string;
}

export interface RoleplayDossier {
  produtos: DossierProduct[];
  dores: DossierPain[];
  persona: {
    nome: string;
    genero: "masculino" | "feminino" | "";
    cargo: string;
    area: string;
    empresa_nome: string;
    empresa_perfil: string;
    /** Quem é, momento da conversa, o que sabe, tom e reações. Vira o persona_prompt. */
    prompt: string;
    dores: DossierPersonaPain[];
    produtos: DossierPersonaProduct[];
  };
  conhecimento: {
    /** O que o comprador já sabe ao atender (igual em todas as etapas da metodologia). */
    previo: string;
    /** Fatos que ele revela se perguntado. */
    fatos: DossierTopic[];
    /** O que o vendedor vê antes da call (dados de CRM). Nada de dor escondida. */
    briefing: DossierTopic[];
  };
  abertura: string[];
  rubricas: DossierRubric[];
}

export const REVEAL_TO_API: Record<RevealLevel, PersonaPainLinkInput["reveal_level"]> = {
  superficie: "surface",
  sondada: "probed",
  oculta: "hidden",
};

const norm = (s: string) => s.trim().toLowerCase();

/** Dossiê com o mínimo para valer a pena: um comprador e ao menos uma dor dele. */
export function hasDossier(d: RoleplayDossier | null | undefined): d is RoleplayDossier {
  return Boolean(d?.persona?.prompt?.trim()) && (d?.persona?.dores?.length ?? 0) > 0;
}

/** Regra que acompanha os fatos: o backend tende a completar com número inventado. */
export const NO_INVENTED_NUMBERS =
  "Se o vendedor pedir números que não estão aqui, diga que não tem esse dado de cabeça. Nunca invente valores, percentuais ou datas.";

const REVEAL_TEXT: Record<RevealLevel, string> = {
  superficie: "você comenta logo no início",
  sondada: "só admite quando o vendedor pergunta diretamente sobre o assunto",
  oculta:
    "você esconde; na primeira pergunta desconversa, e só admite depois que o vendedor aprofundar em causa ou consequência",
};

/**
 * As dores em texto, para o ambiente que ainda não tem as rotas de portfólio (PROD).
 * Sem nome de produto: o comprador não conhece o que o vendedor vende.
 */
export function painsAsPromptText(d: RoleplayDossier): string {
  const lines = d.persona.dores
    .filter((p) => p.dor.trim())
    .map((p) => {
      const pain = d.dores.find((x) => norm(x.titulo) === norm(p.dor));
      const what = [pain?.descricao, p.detalhe].filter((s) => s?.trim()).join(" ");
      return `- ${p.dor}: ${what} (${REVEAL_TEXT[p.revelacao] ?? REVEAL_TEXT.sondada})`;
    });
  if (lines.length === 0) return "";
  return `\n\n# Suas dores\nNunca liste suas dores de uma vez nem diga que solução resolveria cada uma.\n${lines.join("\n")}`;
}

/** Instruções para a geração da persona: o prompt do dossiê manda, a IA só completa o perfil. */
export function personaGenerationInstructions(d: RoleplayDossier): string {
  const p = d.persona;
  const head = [
    p.genero && `Gênero: ${p.genero}.`,
    p.cargo && `Cargo: ${p.cargo}.`,
    "Use exatamente estas informações, sem inventar números, datas ou pessoas:",
  ].filter(Boolean);
  return `${head.join(" ")}\n\n${p.prompt}`;
}

export function topicsToRecord(topics: DossierTopic[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of topics) {
    const k = t.titulo.trim();
    const v = t.texto.trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface PortfolioIds {
  /** false = ambiente sem as rotas de portfólio; as dores vão em texto no prompt. */
  supported: boolean;
  productIds: Map<string, number>;
  painIds: Map<string, number>;
  warnings: string[];
}

/**
 * Garante produtos e dores do dossiê na oferta. Idempotente por nome/título (a oferta
 * é reusada entre roleplays do mesmo cliente). Nunca lança.
 */
export async function applyPortfolio(
  env: PerfectingEnv,
  token: string,
  offerId: number,
  d: RoleplayDossier,
): Promise<PortfolioIds> {
  const out: PortfolioIds = { supported: false, productIds: new Map(), painIds: new Map(), warnings: [] };
  try {
    const products = await listOfferProducts(env, token, offerId);
    if (products == null) {
      out.warnings.push("este ambiente ainda não tem dores × portfólio: as dores vão em texto no prompt");
      return out;
    }
    out.supported = true;
    for (const p of products) out.productIds.set(norm(p.name), p.id);
    for (const [i, p] of d.produtos.entries()) {
      const name = p.nome.trim();
      if (!name || out.productIds.has(norm(name))) continue;
      try {
        const id = await createOfferProduct(env, token, offerId, {
          name,
          description: p.descricao || null,
          problem_solved: p.problema_resolvido || null,
          key_benefits: p.beneficios || null,
          order: i + 1,
        });
        out.productIds.set(norm(name), id);
      } catch (e) {
        out.warnings.push(`produto "${name}" não criado: ${messageOf(e)}`);
      }
    }

    const pains = await listOfferPains(env, token, offerId);
    for (const p of pains) out.painIds.set(norm(p.title), p.id);
    for (const p of d.dores) {
      const title = p.titulo.trim();
      if (!title || out.painIds.has(norm(title))) continue;
      try {
        const id = await createOfferPain(env, token, offerId, {
          title,
          description: p.descricao || null,
          offer_product_id: p.produto ? out.productIds.get(norm(p.produto)) ?? null : null,
        });
        out.painIds.set(norm(title), id);
      } catch (e) {
        out.warnings.push(`dor "${title}" não criada: ${messageOf(e)}`);
      }
    }
  } catch (e) {
    out.warnings.push(`portfólio não aplicado: ${messageOf(e)}`);
  }
  return out;
}

export function personaPainLinks(d: RoleplayDossier, ids: PortfolioIds): PersonaPainLinkInput[] {
  return d.persona.dores.flatMap((p) => {
    const id = ids.painIds.get(norm(p.dor));
    if (id == null) return [];
    return [{
      offer_pain_id: id,
      reveal_level: REVEAL_TO_API[p.revelacao] ?? "probed",
      persona_specific_detail: p.detalhe || null,
    }];
  });
}

export function personaProductLinks(d: RoleplayDossier, ids: PortfolioIds): PersonaProductLinkInput[] {
  return d.persona.produtos.flatMap((p) => {
    const id = ids.productIds.get(norm(p.produto));
    if (id == null) return [];
    return [{ offer_product_id: id, buyer_product_stance: p.postura || null }];
  });
}

/**
 * Cria o comprador do dossiê no contexto (HML): empresa, persona com dores e produtos
 * ligados, e o prompt do dossiê por cima do que a IA gerou. Lança só se a persona não
 * puder ser criada — sem ela o roleplay não tem comprador.
 */
export async function createDossierPersona(
  env: PerfectingEnv,
  token: string,
  contextId: number,
  d: RoleplayDossier,
  ids: PortfolioIds,
): Promise<{ personaId: number; warnings: string[] }> {
  const warnings: string[] = [];
  let companyId: number | null = null;
  if (d.persona.empresa_nome.trim()) {
    try {
      companyId = await createPersonaCompany(env, token, {
        slug: `${slugify(d.persona.empresa_nome)}-${contextId}`,
        name: d.persona.empresa_nome.trim(),
        context_id: contextId,
        company_profile: d.persona.empresa_perfil,
      });
    } catch (e) {
      warnings.push(`empresa da persona não criada: ${messageOf(e)}`);
    }
  }
  const pains = ids.supported ? personaPainLinks(d, ids) : [];
  const products = ids.supported ? personaProductLinks(d, ids) : [];
  const persona = await generateDossierPersona(env, token, {
    context_id: contextId,
    persona_company_id: companyId,
    persona_name: d.persona.nome || null,
    additional_instructions: personaGenerationInstructions(d),
    ...(pains.length > 0 && { pains }),
    ...(products.length > 0 && { products }),
  });
  warnings.push(...(await applyDossierToPersona(env, token, persona.id, d, ids)));
  return { personaId: persona.id, warnings };
}

/**
 * Sobrescreve o que a IA gerou na persona com o dossiê: nome, cargo e prompt; e, com
 * portfólio, as ligações exatas de dores e produtos. Nunca lança.
 */
export async function applyDossierToPersona(
  env: PerfectingEnv,
  token: string,
  personaId: number,
  d: RoleplayDossier,
  ids: PortfolioIds,
): Promise<string[]> {
  const warnings: string[] = [];
  const prompt = ids.supported ? d.persona.prompt : `${d.persona.prompt}${painsAsPromptText(d)}`;
  try {
    await updatePersona(env, token, personaId, {
      ...(d.persona.nome && { name: d.persona.nome }),
      ...(d.persona.cargo && { job_title: d.persona.cargo }),
      ...(d.persona.area && { department: d.persona.area }),
      persona_prompt: prompt,
    });
  } catch (e) {
    warnings.push(`prompt da persona não aplicado: ${messageOf(e)}`);
  }
  if (!ids.supported) return warnings;
  try {
    await setPersonaPains(env, token, personaId, personaPainLinks(d, ids));
  } catch (e) {
    warnings.push(`dores da persona não ligadas: ${messageOf(e)}`);
  }
  try {
    await setPersonaOfferProducts(env, token, personaId, personaProductLinks(d, ids));
  } catch (e) {
    warnings.push(`produtos da persona não ligados: ${messageOf(e)}`);
  }
  return warnings;
}

/**
 * Depois do conteúdo gerado pelo backend: troca o que ele inventou pelo dossiê.
 *  - abertura e critérios de avaliação no case_setup;
 *  - rubricas do vendedor (as geradas saem, entram as do material);
 *  - conhecimento por etapa: mesmo "prévio" e mesmos fatos em todas as etapas (é uma
 *    call só), sem os números e a continuidade entre ligações que a IA inventa.
 * Idempotente. Devolve o que fez e os avisos; nunca lança.
 */
export async function applyDossierToCaseSetup(
  env: PerfectingEnv,
  token: string,
  caseSetupId: number,
  personaId: number | null,
  d: RoleplayDossier,
): Promise<{ detail: Record<string, unknown>; warnings: string[] }> {
  const warnings: string[] = [];
  const detail: Record<string, unknown> = {};
  const opening = d.abertura.map((s) => s.trim()).filter(Boolean);
  const rubrics = d.rubricas.filter((r) => r.criterio.trim());

  try {
    await patchCaseSetup(env, token, caseSetupId, {
      ...(opening.length > 0 && { buyer_agent_first_messages: opening }),
      ...(rubrics.length > 0 && {
        salesperson_evaluation_rubric_criteria: rubrics.map((r) => `${r.criterio} — ${r.descricao}`),
      }),
    });
    detail.case_setup = true;
  } catch (e) {
    warnings.push(`abertura/critérios não aplicados: ${messageOf(e)}`);
  }

  if (rubrics.length > 0) {
    try {
      const types = await listFeedbackRubricTypes(env, token);
      const sellerType = types.find((t) => t.name === "seller_rubric")?.id;
      if (sellerType == null) throw new Error("tipo seller_rubric não encontrado");
      const existing = await listCaseSetupRubricsFull(env, token, caseSetupId);
      for (const r of existing.filter((r) => r.feedback_rubric_type_id === sellerType)) {
        await deleteCaseSetupRubric(env, token, caseSetupId, r.id);
      }
      for (const r of rubrics) {
        await createCaseSetupRubric(env, token, caseSetupId, {
          feedback_rubric_type_id: sellerType,
          statement: r.criterio.trim(),
          description: r.descricao || null,
          tips: r.dica || null,
        });
      }
      detail.rubrics = rubrics.length;
    } catch (e) {
      warnings.push(`rubricas do material não aplicadas: ${messageOf(e)}`);
    }
  }

  const facts = topicsToRecord(d.conhecimento.fatos);
  if (d.conhecimento.previo.trim() || Object.keys(facts).length > 0) {
    try {
      const items = await listStepKnowledgeItems(env, token, caseSetupId, personaId);
      const briefing = topicsToRecord(d.conhecimento.briefing);
      for (const it of items) {
        await patchStepKnowledge(env, token, caseSetupId, it.id, {
          ...(d.conhecimento.previo.trim() && { prior_knowledge_prompt: d.conhecimento.previo.trim() }),
          ...(Object.keys(facts).length > 0 && {
            knowledge_prompt_details: { ...facts, Regra: NO_INVENTED_NUMBERS },
          }),
          ...(Object.keys(briefing).length > 0 && { prior_knowledge_user_briefing: briefing }),
          ...(opening.length > 0 && { buyer_agent_first_messages: opening }),
        });
      }
      detail.step_knowledge = items.length;
      if (items.length === 0) warnings.push("conhecimento por etapa: nada para reescrever");
    } catch (e) {
      warnings.push(`conhecimento por etapa não reescrito: ${messageOf(e)}`);
    }
  }

  return { detail, warnings };
}
