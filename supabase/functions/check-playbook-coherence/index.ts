import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import { askStructured } from "../_shared/anthropic.ts";
import {
  hasBudgetForPart,
  partDeadlineMs,
  PREPARATION_TOO_SLOW_MESSAGE,
} from "../_shared/invocation-deadline.ts";
import {
  listPlaybookCallBlocks,
  listPlaybookCallTypes,
  PerfectingError,
} from "../_shared/perfecting.ts";
import {
  buildCoherencePayload,
  COHERENCE_SCHEMA,
  COHERENCE_SYSTEM,
  type CoherenceCheckResult,
  type CoherenceDraftInput,
  type CoherencePlaybookInput,
  parseCoherenceResponse,
} from "../_shared/playbook-coherence.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Teto da leitura do playbook na conta (login + etapas + subetapas). O padrão do
 * cliente da Perfecting é 180s por chamada, que sozinho passa do teto da
 * invocação; aqui a preparação inteira corre contra um relógio só.
 */
const PREP_BUDGET_MS = 30_000;
/** Cada GET da preparação: abaixo do orçamento, para o erro ser o da chamada. */
const PREP_REQUEST_TIMEOUT_MS = 20_000;
/**
 * Teto da chamada de IA: a saída é curta (até 10 itens) e o operador espera num
 * modal — 90s é folga para o playbook grande, não a duração esperada.
 */
const AI_MAX_MS = 90_000;
/**
 * Dez itens cheios (duas citações, explicação e sugestão) passam de 3 mil tokens e
 * o schema não limita a quantidade: com folga, resposta cortada não vira "não foi
 * possível checar" justo no rascunho com mais conflitos. Quem limita a 10 é o parser.
 */
const MAX_OUTPUT_TOKENS = 8_000;

class PrepTimeout extends Error {}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const seeds = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    : [];

/**
 * Checagem de coerência rascunho × playbook, antes de implementar (modo playbook).
 *
 * Só LÊ a conta (login, etapas e subetapas) e faz UMA chamada de IA. Não grava
 * nada, nem aqui nem lá: o rascunho chega no corpo (a Criação ainda não o salvou)
 * e o resultado volta para a tela, que decide se envia mesmo assim.
 *
 * Função própria, e não uma op de outra: `list-playbooks` é leitura barata,
 * `implement-playbook` é o caminho de escrita e `process-import` gasta o relógio
 * com a preparação de superadmin no HML. Aqui o relógio (~150s) é só da checagem.
 *
 * Custo na Perfecting: 2 logins + 1 GET de etapas + 1 GET de subetapas POR etapa
 * (em paralelo). A API não tem leitura agregada do playbook — `GET /playbook_{id}`
 * devolve só a linha do playbook. O nome do playbook vem da tela, que já o tem.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Relógio da invocação: auth, leitura da conta e IA contam contra ele.
  const requestStartedAt = Date.now();
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY não configurada nos secrets" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    const playbookId = typeof body.playbookId === "number" ? body.playbookId : null;
    if (!connectionId || playbookId == null) {
      return json({ ok: false, error: "connectionId e playbookId são obrigatórios" }, 400);
    }
    const playbookName = text(body.playbookName).trim() || `Playbook ${playbookId}`;
    const d = (body.draft ?? {}) as Record<string, unknown>;
    const draft: CoherenceDraftInput = {
      oferta_nome: text(d.oferta_nome),
      oferta_descricao: text(d.oferta_descricao),
      perfil: text(d.perfil),
      personas_variacao: text(d.personas_variacao),
      objecoes: seeds(d.objecoes),
      guardrails: seeds(d.guardrails),
    };

    const { data: connection, error } = await db
      .from("connections")
      .select("id, environment, org_id, target_user_id, default_user_group_id")
      .eq("id", connectionId)
      .single();
    if (error || !connection) return json({ ok: false, error: "conexão não encontrada" }, 404);

    const prep = { timeoutMs: PREP_REQUEST_TIMEOUT_MS };
    const readPlaybook = async (): Promise<CoherencePlaybookInput> => {
      const { env, token } = await authenticateConnection(connection);
      const callTypes = await listPlaybookCallTypes(env, token, playbookId, prep);
      const blocks = await Promise.all(
        callTypes.map((ct) => listPlaybookCallBlocks(env, token, playbookId, ct.id, prep)),
      );
      return {
        name: playbookName,
        callTypes: callTypes.map((ct, i) => ({ ...ct, blocks: blocks[i] })),
      };
    };

    let playbook: CoherencePlaybookInput;
    let prepTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      playbook = await Promise.race([
        readPlaybook(),
        new Promise<never>((_, reject) => {
          prepTimer = setTimeout(() => reject(new PrepTimeout()), PREP_BUDGET_MS);
        }),
      ]);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      if (e instanceof PrepTimeout || aborted) {
        console.warn(`check-playbook-coherence: leitura do playbook ${playbookId} passou do tempo`);
        return json({ ok: false, error: PREPARATION_TOO_SLOW_MESSAGE }, 504);
      }
      throw e;
    } finally {
      clearTimeout(prepTimer);
    }
    if (playbook.callTypes.length === 0) {
      return json({ ok: false, error: "o playbook não tem etapas para comparar" }, 422);
    }

    const payload = buildCoherencePayload(draft, playbook);

    const deadlineMs = partDeadlineMs({ requestStartedAt, now: Date.now(), perPartMax: AI_MAX_MS });
    if (!hasBudgetForPart(deadlineMs)) {
      return json({ ok: false, error: PREPARATION_TOO_SLOW_MESSAGE }, 504);
    }
    const signal = AbortSignal.timeout(deadlineMs);
    const aiStartedAt = Date.now();
    let raw: unknown;
    try {
      raw = await askStructured<unknown>({
        system: COHERENCE_SYSTEM,
        user: payload.text,
        schema: COHERENCE_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: MAX_OUTPUT_TOKENS,
        what: "ao checar a coerência com o playbook",
        signal,
      });
    } catch (e) {
      // O prazo pode estourar antes do primeiro byte ou no meio do stream.
      if (signal.aborted) {
        const seconds = Math.round(deadlineMs / 1000);
        console.warn(`check-playbook-coherence: a IA passou de ${seconds}s`);
        return json({ ok: false, error: `A checagem passou do tempo (${seconds}s).` }, 504);
      }
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
    }

    let divergences;
    try {
      divergences = parseCoherenceResponse(raw);
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
    }
    console.log(
      `check-playbook-coherence: playbook ${playbookId}, ${payload.stats.callTypes} etapas, ${payload.stats.blocks} subetapas, ` +
        `${payload.text.length} caracteres → ${divergences.length} divergência(s) em ${
          Math.round((Date.now() - aiStartedAt) / 1000)
        }s de IA (${Math.round((Date.now() - requestStartedAt) / 1000)}s no total)`,
    );
    const result: CoherenceCheckResult = {
      divergences,
      truncated: payload.truncated,
      stats: payload.stats,
    };
    return json({ ok: true, ...result });
  } catch (e) {
    const detail = e instanceof PerfectingError
      ? { status: e.status, detail: e.detail }
      : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
