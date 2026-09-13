import { readAnthropicStream } from "./anthropic.ts";
import { messageOf, type ObjectionSeed } from "./context-content.ts";
import {
  createPlaybookCallBlockObjection,
  listObjectionTypes,
  listPlaybookCallBlockObjections,
  listPlaybookCallBlocks,
  listPlaybookCallTypes,
  type PerfectingEnv,
  type PlaybookCallBlock,
  type PlaybookCallType,
} from "./perfecting.ts";

/**
 * Preenche os blocos do playbook que ainda não têm objeção com as objeções extraídas do
 * material do cliente. A IA escolhe quais objeções cabem em cada bloco.
 *
 * Objeção de bloco é catálogo do playbook: aparece no painel do vendedor durante a call
 * (sub-opções de cada item do bloco) e vale para TODA implementação desse playbook, de
 * qualquer oferta. Por isso só blocos vazios são tocados — o que já foi curado na
 * Perfecting fica como está — e reexecutar não faz nada depois que os blocos têm objeção.
 * O que o comprador fala vem das objeções do contexto (ver context-content.ts).
 */

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface BlockObjectionsResult {
  blocks_total: number;
  blocks_empty: number;
  /** Preenchido quando nada foi feito de propósito (ex.: modo automático, playbook já curado). */
  skipped_reason: string | null;
  objections_created: number;
  /** Blocos preenchidos nesta execução, com os títulos criados. */
  filled: Array<{ etapa: string; bloco: string; objecoes: string[] }>;
  /** Blocos vazios em que nenhuma objeção do material fez sentido. */
  left_empty: Array<{ etapa: string; bloco: string }>;
  warnings: string[];
}

interface EmptyBlock {
  callType: PlaybookCallType;
  block: PlaybookCallBlock;
}

const SYSTEM = `Você distribui objeções de compradores pelos blocos de um playbook de vendas.

Cada etapa do playbook é uma call, dividida em blocos (ex.: abertura, diagnóstico, proposta). Durante a call, o vendedor vê em cada bloco as objeções que o comprador pode levantar ali e a condição para ele ceder.

Para cada bloco recebido, escolha de 1 a 3 objeções da lista — as que o comprador mais plausivelmente levanta naquele momento da conversa, considerando a etapa, o nome, a descrição, o objetivo e o que o vendedor faz no bloco. A mesma objeção pode ir para vários blocos. Deixe a lista vazia só quando nenhuma objeção fizer sentido naquele bloco.

Responda com todos os blocos recebidos, cada um uma vez.`;

async function assignObjections(
  blocks: EmptyBlock[],
  seeds: ObjectionSeed[],
): Promise<Map<number, number[]>> {
  const payload = {
    blocos: blocks.map(({ callType, block }) => ({
      bloco_id: block.id,
      etapa: callType.name,
      bloco: block.name,
      descricao: block.description,
      objetivo: block.objective,
      o_que_o_vendedor_faz: block.what_to_do,
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
    required: ["blocos"],
    properties: {
      blocos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["bloco_id", "objecoes"],
          properties: {
            bloco_id: { type: "integer", enum: blocks.map((b) => b.block.id) },
            objecoes: {
              type: "array",
              items: { type: "integer", enum: seeds.map((_, i) => i) },
            },
          },
        },
      },
    },
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      stream: true,
      output_config: { format: { type: "json_schema", schema } },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      `IA falhou ao distribuir objeções (${res.status}): ${data?.error?.message ?? "sem detalhe"}`,
    );
  }
  const { text, stopReason } = await readAnthropicStream(res);
  if (stopReason === "max_tokens") throw new Error("resposta da IA cortada ao distribuir objeções");
  const parsed = JSON.parse(text) as { blocos: Array<{ bloco_id: number; objecoes: number[] }> };

  const byBlock = new Map<number, number[]>();
  for (const b of parsed.blocos ?? []) {
    byBlock.set(b.bloco_id, Array.from(new Set(b.objecoes ?? [])));
  }
  return byBlock;
}

/**
 * `onlyUntouchedPlaybook`: modo do envio automático — só age se NENHUM bloco do playbook
 * tem objeção. Assim o primeiro envio de um playbook intocado o preenche, e depois disso
 * (ou se alguém já curou blocos na Perfecting) o envio não mexe mais nem chama a IA.
 */
export async function applyBlockObjections(
  env: PerfectingEnv,
  token: string,
  playbookId: number,
  objections: ObjectionSeed[],
  { onlyUntouchedPlaybook = false }: { onlyUntouchedPlaybook?: boolean } = {},
): Promise<BlockObjectionsResult> {
  const out: BlockObjectionsResult = {
    blocks_total: 0,
    blocks_empty: 0,
    skipped_reason: null,
    objections_created: 0,
    filled: [],
    left_empty: [],
    warnings: [],
  };
  const seeds = objections.filter((o) => o.titulo?.trim());
  if (seeds.length === 0) return out;

  const [types, callTypes] = await Promise.all([
    listObjectionTypes(env, token),
    listPlaybookCallTypes(env, token, playbookId),
  ]);

  const perCallType = await Promise.all(
    callTypes.map(async (callType) => {
      const blocks = await listPlaybookCallBlocks(env, token, playbookId, callType.id);
      return Promise.all(
        blocks.map(async (block) => ({
          callType,
          block,
          existing: await listPlaybookCallBlockObjections(
            env,
            token,
            playbookId,
            callType.id,
            block.id,
          ),
        })),
      );
    }),
  );
  const all = perCallType.flat();
  const empty: EmptyBlock[] = all.filter((b) => b.existing.length === 0);
  out.blocks_total = all.length;
  out.blocks_empty = empty.length;
  if (empty.length === 0) return out;
  if (onlyUntouchedPlaybook && empty.length < all.length) {
    out.skipped_reason = "o playbook já tem objeções em algum bloco";
    return out;
  }

  const assignment = await assignObjections(empty, seeds);
  const typeBySlug = new Map(types.map((t) => [t.slug.trim().toLowerCase(), t.id]));
  const fallbackTypeId = types[0]?.id;

  for (const { callType, block } of empty) {
    const created: string[] = [];
    for (const index of assignment.get(block.id) ?? []) {
      const o = seeds[index];
      if (!o) continue;
      const title = o.titulo.trim();
      const typeId = typeBySlug.get((o.tipo ?? "").trim().toLowerCase()) ?? fallbackTypeId;
      if (typeId == null) {
        out.warnings.push(`objeção "${title}": nenhum tipo de objeção disponível na API`);
        continue;
      }
      try {
        await createPlaybookCallBlockObjection(env, token, playbookId, callType.id, block.id, {
          objection_type_id: typeId,
          title,
          description: o.fala_exemplo?.trim() || null,
          details: o.detalhes?.trim() || null,
          to_give_in_if: o.ceder_se?.trim() || null,
        });
        created.push(title);
        out.objections_created++;
      } catch (e) {
        out.warnings.push(`bloco "${block.name}": objeção "${title}" não criada: ${messageOf(e)}`);
      }
    }
    if (created.length > 0) {
      out.filled.push({ etapa: callType.name, bloco: block.name, objecoes: created });
    } else {
      out.left_empty.push({ etapa: callType.name, bloco: block.name });
    }
  }
  return out;
}
