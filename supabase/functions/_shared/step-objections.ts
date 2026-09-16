import { askStructured } from "./anthropic.ts";
import { messageOf, type ObjectionSeed } from "./context-content.ts";
import {
  createCaseSetupObjection,
  listCaseSetupObjections,
  listObjectionTypes,
  listPlaybookCallBlocks,
  listPlaybookCallTypes,
  type PerfectingEnv,
} from "./perfecting.ts";

/**
 * Objeções do material, no modo playbook, entram só nas etapas em que o comprador as
 * levantaria — criadas no case_setup de cada etapa, não no contexto.
 *
 * Por que não context-wide: a objeção de contexto entra no prompt do comprador de TODAS
 * as etapas (o backend não filtra por etapa), e ele passa a levantar objeção de preço
 * numa ligação de descoberta. A de case_setup só entra na ligação daquela etapa.
 *
 * Duas fases, porque os case_setups só existem minutos depois do envio:
 *  1. `assignObjectionsToCallTypes` — IA, no envio, numa invocação separada. Só precisa
 *     das etapas do playbook. O resultado fica em `scenario.objection_steps`.
 *  2. `applyStepObjections` — sem IA e idempotente (casa título + nível com o que o
 *     case_setup já tem), quando a implementação fecha. Pode rodar de novo sem duplicar.
 */

/** Encaixe salvo no rascunho: etapa (playbook_call_type_id) → títulos das objeções. */
export interface ObjectionStepAssignment {
  playbook_id: number;
  /** Chave = playbook_call_type_id em string (jsonb). Etapa sem objeção fica com []. */
  call_types: Record<string, string[]>;
  assigned_at: string;
}

export interface StepObjectionsResult {
  objections_created: number;
  objections_skipped: number;
  /** Objeções que a IA não encaixou em etapa nenhuma — não chegam a roleplay nenhum. */
  unassigned: string[];
  warnings: string[];
}

const SYSTEM = `Você decide em quais etapas de um playbook de vendas o comprador levanta cada objeção.

Cada etapa é uma ligação separada da jornada (ex.: prospecção, descoberta, apresentação, proposta, negociação). A objeção que você colocar numa etapa entra no roteiro do comprador simulado daquela ligação — e só dela.

Para cada etapa recebida, escolha as objeções que o comprador plausivelmente levanta NAQUELE momento da jornada, considerando o nome, a descrição e os blocos da etapa:
- Objeção de preço, condição comercial ou contrato só cabe quando já existe proposta ou valor na conversa.
- Objeção de falta de tempo, de interesse ou de prioridade cabe nas etapas iniciais.
- A mesma objeção pode ir para mais de uma etapa quando o comprador de fato a repetiria.
- Uma etapa pode ficar sem objeção, e uma objeção pode ficar sem etapa, quando não couber.

Responda com todas as etapas recebidas, cada uma uma vez.`;

const norm = (s: string) => s.trim().toLowerCase();

export async function assignObjectionsToCallTypes(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  objections: ObjectionSeed[],
): Promise<ObjectionStepAssignment> {
  const seeds = objections.filter((o) => o.titulo?.trim());
  const callTypes = await listPlaybookCallTypes(env, token, playbookId);
  const assignment: ObjectionStepAssignment = {
    playbook_id: playbookId,
    call_types: Object.fromEntries(callTypes.map((ct) => [String(ct.id), []])),
    assigned_at: new Date().toISOString(),
  };
  if (seeds.length === 0 || callTypes.length === 0) return assignment;

  const blocks = await Promise.all(
    callTypes.map((ct) => listPlaybookCallBlocks(env, token, playbookId, ct.id)),
  );
  const payload = {
    etapas: callTypes.map((ct, i) => ({
      call_type_id: ct.id,
      ordem: i + 1,
      etapa: ct.name,
      descricao: ct.description,
      blocos: blocks[i].map((b) => ({ bloco: b.name, objetivo: b.objective })),
    })),
    objecoes: seeds.map((o, i) => ({
      indice: i,
      titulo: o.titulo,
      tipo: o.tipo,
      fala_do_comprador: o.fala_exemplo,
      detalhes: o.detalhes,
    })),
  };
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["etapas"],
    properties: {
      etapas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["call_type_id", "objecoes"],
          properties: {
            call_type_id: { type: "integer", enum: callTypes.map((ct) => ct.id) },
            objecoes: { type: "array", items: { type: "integer", enum: seeds.map((_, i) => i) } },
          },
        },
      },
    },
  };

  const parsed = await askStructured<{ etapas: Array<{ call_type_id: number; objecoes: number[] }> }>({
    system: SYSTEM,
    user: JSON.stringify(payload),
    schema,
    maxTokens: 8000,
    what: "ao encaixar objeções nas etapas",
  });
  for (const e of parsed.etapas ?? []) {
    const titles = Array.from(new Set(e.objecoes ?? []))
      .map((i) => seeds[i]?.titulo.trim())
      .filter((t): t is string => Boolean(t));
    assignment.call_types[String(e.call_type_id)] = titles;
  }
  return assignment;
}

/**
 * `callTypeCaseSetups`: playbook_call_type_id → case_setup_id criado (ver
 * `PlaybookRun.call_type_case_setups`). Etapa sem roleplay é pulada com aviso.
 *
 * Nunca lança: objeção que falha vira aviso, o roleplay continua utilizável.
 */
export async function applyStepObjections(
  env: PerfectingEnv,
  token: string,
  assignment: ObjectionStepAssignment,
  callTypeCaseSetups: Record<string, number>,
  objections: ObjectionSeed[],
  difficultyLevelIds: readonly number[],
): Promise<StepObjectionsResult> {
  const out: StepObjectionsResult = {
    objections_created: 0,
    objections_skipped: 0,
    unassigned: [],
    warnings: [],
  };
  const seedByTitle = new Map(
    objections.filter((o) => o.titulo?.trim()).map((o) => [norm(o.titulo), o]),
  );
  const assigned = new Set(Object.values(assignment.call_types).flat().map(norm));
  out.unassigned = Array.from(seedByTitle.values())
    .filter((o) => !assigned.has(norm(o.titulo)))
    .map((o) => o.titulo.trim());
  if (assigned.size === 0) return out;

  let types;
  try {
    types = await listObjectionTypes(env, token);
  } catch (e) {
    out.warnings.push(`objeções das etapas não aplicadas: ${messageOf(e)}`);
    return out;
  }
  const typeBySlug = new Map(types.map((t) => [norm(t.slug), t.id]));
  const fallbackTypeId = types[0]?.id;

  for (const [callTypeId, titles] of Object.entries(assignment.call_types)) {
    if (titles.length === 0) continue;
    const caseSetupId = callTypeCaseSetups[callTypeId];
    if (caseSetupId == null) {
      out.warnings.push(`etapa ${callTypeId}: roleplay não encontrado, objeções não aplicadas`);
      continue;
    }
    try {
      const existing = await listCaseSetupObjections(env, token, caseSetupId);
      // Título + nível, como no contexto: linha sem nível (NULL) não bloqueia as novas.
      const key = (title: string, levelId: number | null) => `${norm(title)}|${levelId}`;
      const seen = new Set(existing.map((o) => key(o.title, o.difficulty_level_id)));

      for (const title of titles) {
        const o = seedByTitle.get(norm(title));
        if (!o) continue; // objeção removida do rascunho depois do encaixe
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
            await createCaseSetupObjection(env, token, caseSetupId, {
              objection_type_id: typeId,
              difficulty_level_id: levelId,
              title: o.titulo.trim(),
              description: o.fala_exemplo?.trim() || null,
              details: o.detalhes?.trim() || null,
              to_give_in_if: o.ceder_se?.trim() || null,
            });
            seen.add(key(title, levelId));
            out.objections_created++;
          } catch (e) {
            out.warnings.push(
              `roleplay ${caseSetupId}: objeção "${title}" (nível ${levelId}) não criada: ${messageOf(e)}`,
            );
          }
        }
      }
    } catch (e) {
      out.warnings.push(`roleplay ${caseSetupId}: objeções não aplicadas: ${messageOf(e)}`);
    }
  }
  return out;
}
