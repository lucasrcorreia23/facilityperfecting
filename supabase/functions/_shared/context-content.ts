import {
  createContextGuardrail,
  createContextObjection,
  listContextGuardrails,
  listContextObjections,
  listObjectionTypes,
  type PerfectingEnv,
} from "./perfecting.ts";

/**
 * Injeta no contexto da Perfecting as objeções e os guardrails extraídos do material
 * do cliente.
 *
 * Por que context-wide e não por case_setup: um case_setup herda as objeções do seu
 * context_id, então uma passada aqui cobre TODAS as etapas do playbook — sem competir
 * com o conteúdo que cada etapa gera e sem multiplicar chamadas por roleplay.
 *
 * Por que existe: a implementação já gera objeções sozinha, mas genéricas. Quando o
 * material traz a fala real do comprador e a condição de cedência ("Ceda se"), mandar
 * as do cliente é o que separa um roleplay verossímil de um plausível. Sem
 * `to_give_in_if` o comprador simulado repete a objeção indefinidamente e o treino
 * fica sem desfecho possível.
 *
 * Idempotente: casa objeções por título+nível e guardrails por nome com o que já existe
 * no contexto, então reenvio e
 * contexto reusado não duplicam. Nunca lança — conteúdo extra que falha não pode
 * derrubar um envio cujo roleplay já seria criado; devolve avisos para o chamador.
 */

export interface ObjectionSeed {
  titulo: string;
  /** slug de `/objection_types` (a IA escolhe entre os válidos, injetados no prompt). */
  tipo: string;
  fala_exemplo: string;
  detalhes: string;
  ceder_se: string;
}

export interface GuardrailSeed {
  nome: string;
  instrucao: string;
}

export interface ContextContentResult {
  objections_created: number;
  objections_skipped: number;
  guardrails_created: number;
  guardrails_skipped: number;
  warnings: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * `difficultyLevelIds`: níveis em que cada objeção é criada (uma linha por nível). O
 * prompt da Perfecting é montado na hora da call e só usa objeções com nível IGUAL ao
 * escolhido para aquela call — sem nível a objeção nunca chega ao comprador.
 */
export async function applyContextContent(
  env: PerfectingEnv,
  token: string,
  contextId: number,
  objections: ObjectionSeed[],
  guardrails: GuardrailSeed[],
  difficultyLevelIds: readonly number[],
): Promise<ContextContentResult> {
  const out: ContextContentResult = {
    objections_created: 0,
    objections_skipped: 0,
    guardrails_created: 0,
    guardrails_skipped: 0,
    warnings: [],
  };

  if (objections.length > 0) {
    try {
      const [types, existing] = await Promise.all([
        listObjectionTypes(env, token),
        listContextObjections(env, token, contextId),
      ]);
      const typeBySlug = new Map(types.map((t) => [norm(t.slug), t.id]));
      // Chave título+nível: as linhas antigas sem nível (NULL) não bloqueiam as novas.
      const key = (title: string, levelId: number | null) => `${norm(title)}|${levelId}`;
      const seen = new Set(existing.map((o) => key(o.title, o.difficulty_level_id)));
      // Sem tipo resolvido não dá para criar (objection_type_id é obrigatório na API);
      // o primeiro tipo serve de fallback para não perder a objeção por um slug errado.
      const fallbackTypeId = types[0]?.id;

      for (const o of objections) {
        const title = o.titulo?.trim();
        if (!title) continue;
        const typeId = typeBySlug.get(norm(o.tipo ?? "")) ?? fallbackTypeId;
        if (typeId == null) {
          out.warnings.push(`objeção "${title}": nenhum tipo de objeção disponível na API`);
          continue;
        }
        for (const levelId of difficultyLevelIds) {
          if (seen.has(key(title, levelId))) {
            out.objections_skipped++;
            continue;
          }
          try {
            await createContextObjection(env, token, contextId, {
              objection_type_id: typeId,
              difficulty_level_id: levelId,
              title,
              description: o.fala_exemplo?.trim() || null,
              details: o.detalhes?.trim() || null,
              to_give_in_if: o.ceder_se?.trim() || null,
            });
            seen.add(key(title, levelId));
            out.objections_created++;
          } catch (e) {
            out.warnings.push(`objeção "${title}" (nível ${levelId}) não criada: ${messageOf(e)}`);
          }
        }
      }
    } catch (e) {
      out.warnings.push(`objeções do contexto não aplicadas: ${messageOf(e)}`);
    }
  }

  if (guardrails.length > 0) {
    try {
      const existing = await listContextGuardrails(env, token, contextId);
      const seen = new Set(existing.map((g) => norm(g.name)));
      for (const g of guardrails) {
        const name = g.nome?.trim();
        const prompt = g.instrucao?.trim();
        if (!name || !prompt) continue;
        if (seen.has(norm(name))) {
          out.guardrails_skipped++;
          continue;
        }
        try {
          await createContextGuardrail(env, token, contextId, { name, prompt });
          seen.add(norm(name));
          out.guardrails_created++;
        } catch (e) {
          out.warnings.push(`guardrail "${name}" não criado: ${messageOf(e)}`);
        }
      }
    } catch (e) {
      out.warnings.push(`guardrails do contexto não aplicados: ${messageOf(e)}`);
    }
  }

  return out;
}

export function messageOf(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const d = (e as { detail: unknown }).detail;
    return typeof d === "string" ? d : JSON.stringify(d);
  }
  return e instanceof Error ? e.message : String(e);
}
