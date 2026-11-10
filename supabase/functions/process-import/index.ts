import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import {
  hasBudgetForPart,
  PART_MAX_MS,
  partDeadlineMs,
  PREPARATION_TOO_SLOW_MESSAGE,
} from "../_shared/invocation-deadline.ts";
import { buildSchema, buildSystem, PART_NOTES, PARTS_FOR_MODE, type SchemaPart } from "./schema.ts";
import { generatorFingerprint, SYSTEM_BASE } from "./prompt.ts";
import { GENERATOR_VERSION, type GeneratorManifest } from "../_shared/generator-version.ts";
import { guidelineRefs, loadGuidelines, renderGuidelinesBlock, selectGuidelines } from "../_shared/guidelines.ts";
import { readAnthropicStream } from "../_shared/anthropic.ts";
import { appendGapAnswers, buildGapAnswersBlock, GAP_ANSWERS_RULES } from "../_shared/gap-answers.ts";
import {
  buildDebateSchema,
  DEBATE_PART_NOTES,
  DEBATE_PARTS,
  DEBATE_SYSTEM,
  debateAnchorsBlock,
  parseDebateAnchors,
} from "./debate-prompt.ts";
import {
  listCallContexts,
  listObjectionTypes,
  loginSuperadmin,
  PerfectingError,
} from "../_shared/perfecting.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Falha de uma das metades — carrega o payload que vai no corpo do 502. */
class PartError extends Error {
  payload: unknown;
  constructor(payload: unknown) {
    super(typeof payload === "string" ? payload : "falha ao processar");
    this.payload = payload;
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);

/**
 * Prazo de cada fatia: no máximo PART_MAX_MS (120s), e nunca além do que sobra do
 * relógio da INVOCAÇÃO (140s contados do início do handler — ver
 * invocation-deadline.ts). O teto da Edge Function é ~150s; abortar antes dele é
 * o que permite devolver QUAL fatia estourou, em vez do "non-2xx" genérico que o
 * front recebe quando o Supabase mata a função. Contar só a partir do início da
 * fatia ignorava o tempo já gasto na preparação (login e catálogos no HML).
 *
 * Devolve o prazo efetivo em ms, ou lança PartError se já não cabe uma fatia.
 */
function partDeadlineOrThrow(requestStartedAt: number): number {
  const deadlineMs = partDeadlineMs({ requestStartedAt, now: Date.now() });
  if (!hasBudgetForPart(deadlineMs)) {
    console.warn(
      `process-import: só ${Math.round(deadlineMs / 1000)}s de orçamento depois de ${
        Math.round((Date.now() - requestStartedAt) / 1000)
      }s de preparação — não chamou a IA`,
    );
    throw new PartError(PREPARATION_TOO_SLOW_MESSAGE);
  }
  return deadlineMs;
}

/**
 * Teto das chamadas de preparação à Perfecting (login + catálogos) SÓ nesta função:
 * o padrão do cliente é 180s, que sozinho já passa do teto da invocação.
 */
const PREP_TIMEOUT_MS = 15_000;

const PART_LABELS: Record<SchemaPart, string> = {
  core: "oferta",
  profile: "perfil",
  objections: "objeções e guardrails",
  scenario: "cenário",
  dossier_buyer: "dossiê (comprador e dores)",
  dossier_context: "dossiê (conhecimento, abertura e rubricas)",
};



/** Uma chamada estruturada à Anthropic, com prazo. Usada pelo modo debate. */
async function askStructured(
  system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>,
  schema: unknown,
  text: string,
  label: string,
  requestStartedAt: number,
): Promise<{ parsed: Record<string, unknown>; usage: Record<string, unknown> | null | undefined }> {
  const deadlineMs = partDeadlineOrThrow(requestStartedAt);
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(deadlineMs);
  const timedOut = () =>
    new PartError(`A parte "${label}" passou do tempo (${Math.round(deadlineMs / 1000)}s). Tente de novo.`);
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      signal,
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 32000,
        stream: true,
        output_config: { format: { type: "json_schema", schema } },
        system,
        messages: [{ role: "user", content: text }],
      }),
    });
  } catch (e) {
    if (signal.aborted) throw timedOut();
    throw e;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new PartError({ status: res.status, detail: data?.error?.message ?? data?.error ?? data });
  }
  // O prazo também pode estourar no meio do stream, não só antes do primeiro byte.
  const { text: generated, stopReason, usage } = await readAnthropicStream(res).catch((e) => {
    if (signal.aborted) throw timedOut();
    throw e;
  });
  console.log(`process-import[${label}]: ${num(usage?.output_tokens)} tokens em ${Math.round((Date.now() - startedAt) / 1000)}s`);
  if (stopReason === "max_tokens") throw new PartError(`A parte "${label}" ficou grande demais. Reduza o material.`);
  try {
    return { parsed: JSON.parse(generated) as Record<string, unknown>, usage };
  } catch {
    throw new PartError(`A parte "${label}" voltou incompleta. Tente de novo.`);
  }
}

/**
 * Modo debate: âncoras (obra, tema, moção, lado, oponente) e etapas da metodologia vêm
 * da tela; a IA preenche o resto em duas fatias paralelas. Devolve a saída crua das
 * fatias — quem monta o rascunho é `mergeDebateAiResult` no front.
 */
async function processDebate(
  body: Record<string, unknown>,
  text: string,
  requestStartedAt: number,
): Promise<Response> {
  const anchors = parseDebateAnchors(body.anchors);
  if (!anchors) return json({ ok: false, error: "âncoras do debate incompletas (obra, tema, moção, lado, nome, idade e gênero da oponente)" }, 400);
  const steps = Array.isArray(body.steps)
    ? (body.steps as Array<Record<string, unknown>>).map((s) => ({ name: String(s?.name ?? "").trim() })).filter((s) => s.name)
    : [];
  if (steps.length === 0) return json({ ok: false, error: "escolha uma metodologia com etapas antes de processar" }, 400);
  const connectionId = typeof body.connection_id === "string" && body.connection_id ? body.connection_id : null;
  const { selected: guidelines, skipped } = selectGuidelines(await loadGuidelines(db, "roleplay_import"), {
    target: "roleplay_import",
    mode: "debate",
    connectionId,
  });
  const guidelinesBlock = renderGuidelinesBlock(guidelines);
  const anchorsBlock = debateAnchorsBlock(anchors, steps);
  let parts;
  try {
    parts = await Promise.all(
      DEBATE_PARTS.map((part) =>
        askStructured(
          [
            { type: "text", text: DEBATE_SYSTEM, cache_control: { type: "ephemeral" } },
            ...(guidelinesBlock ? [{ type: "text" as const, text: guidelinesBlock }] : []),
            { type: "text", text: DEBATE_PART_NOTES[part] },
            { type: "text", text: anchorsBlock },
          ],
          buildDebateSchema(part, steps.length),
          text,
          part,
          requestStartedAt,
        )
      ),
    );
  } catch (e) {
    if (e instanceof PartError) return json({ ok: false, error: e.payload }, 502);
    throw e;
  }
  const result: Record<string, unknown> = {};
  for (const { parsed } of parts) Object.assign(result, parsed);
  const generator: GeneratorManifest = {
    version: GENERATOR_VERSION,
    fingerprint: await generatorFingerprint(MODEL),
    model: MODEL,
    mode: "debate",
    guidelines: guidelineRefs(guidelines),
    connection_id: connectionId,
    processed_at: new Date().toISOString(),
  };
  return json({
    ok: true,
    result,
    mode: "debate",
    generator,
    usage: {
      input_tokens: parts.reduce((t, p) => t + num(p.usage?.input_tokens), 0),
      output_tokens: parts.reduce((t, p) => t + num(p.usage?.output_tokens), 0),
    },
    ...(skipped.length > 0 && {
      warnings: [`${skipped.length} diretriz(es) ficaram de fora por passar do limite de tamanho: ${skipped.map((g) => g.title).join(", ")}`],
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Relógio da invocação: tudo o que vem depois (auth, preparação, IA) conta contra ele.
  const requestStartedAt = Date.now();
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY não configurada nos secrets" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    // A tela "Ver prompt base" lê o texto daqui: não existe mais cópia no front.
    if (body.op === "info") {
      return json({
        ok: true,
        prompt: SYSTEM_BASE,
        version: GENERATOR_VERSION,
        fingerprint: await generatorFingerprint(MODEL),
        model: MODEL,
      });
    }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ ok: false, error: "texto vazio" }, 400);
    if (body.mode === "debate") return await processDebate(body, text, requestStartedAt);
    // No modo playbook, cenário e rubricas vêm das etapas — não vale gerá-los.
    const mode = body.mode === "playbook" ? "playbook" : "methodology";
    // Sem conta escolhida, valem só as diretrizes globais e do modo.
    const connectionId = typeof body.connection_id === "string" && body.connection_id ? body.connection_id : null;
    const { selected: guidelines, skipped } = selectGuidelines(await loadGuidelines(db, "roleplay_import"), {
      target: "roleplay_import",
      mode,
      connectionId,
    });
    const guidelinesBlock = renderGuidelinesBlock(guidelines);

    // Respostas do operador às lacunas de rodadas anteriores: entram depois do
    // material, na mensagem de usuário — todas as fatias paralelas as leem (as
    // lacunas só nascem numa delas) e não há chamada de IA a mais, então o
    // orçamento de tempo da invocação é o mesmo de um processamento comum.
    const gapAnswers = buildGapAnswersBlock(body.gap_answers);
    const userText = appendGapAnswers(text, gapAnswers);

    // Taxonomias válidas da Perfecting, para o modelo escolher slugs reais.
    const prep = { timeoutMs: PREP_TIMEOUT_MS };
    let saToken: string;
    let contexts: Awaited<ReturnType<typeof listCallContexts>>;
    try {
      saToken = await loginSuperadmin("hml", prep);
      contexts = await listCallContexts("hml", saToken, prep);
    } catch (e) {
      // Estourou os 15s da preparação: responde já, em vez de gastar o resto do relógio.
      if (e instanceof DOMException && e.name === "AbortError") {
        console.warn("process-import: preparação (login/call_contexts no HML) passou de 15s");
        return json({ ok: false, error: PREPARATION_TOO_SLOW_MESSAGE }, 504);
      }
      throw e;
    }
    if (contexts.length === 0) {
      return json({ ok: false, error: "nenhum call_context disponível na Perfecting" }, 502);
    }
    const slugs = contexts.map((c) => c.slug);
    // Tipos de objeção: sem eles o modelo não tem enum para `objecoes[].tipo`, então
    // a extração de objeções é desligada em vez de gerar slug inválido (o enum não
    // aceita array vazio, e uma objeção com tipo errado não é criável na API).
    const objectionTypes = await listObjectionTypes("hml", saToken, prep).catch(() => []);
    const objectionSlugs = objectionTypes.map((o) => o.slug);

    const system = buildSystem(contexts, objectionTypes, SYSTEM_BASE);

    /** Uma metade do schema, pedida à Anthropic. Ver buildSchema() sobre o porquê. */
    const askFor = async (part: SchemaPart) => {
      const deadlineMs = partDeadlineOrThrow(requestStartedAt);
      const startedAt = Date.now();
      const signal = AbortSignal.timeout(deadlineMs);
      try {
        return await askForUntil(part, signal, startedAt);
      } catch (e) {
        if (signal.aborted) {
          const seconds = Math.round(deadlineMs / 1000);
          console.warn(`process-import[${part}]: passou de ${seconds}s (teto por parte: ${PART_MAX_MS / 1000}s)`);
          throw new PartError(
            `A parte "${PART_LABELS[part]}" passou do tempo (${seconds}s). Nada foi descartado: tente de novo; se repetir, a parte precisa ser dividida.`,
          );
        }
        throw e;
      }
    };

    const askForUntil = async (part: SchemaPart, signal: AbortSignal, startedAt: number) => {
      const res = await fetch(ANTHROPIC_URL, {
        signal,
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 32000,
          // ⚠️ SEMPRE streaming: com max_tokens alto a requisição não-streaming fica
          // minutos sem receber byte e morre no caminho. Mesmo helper do generate-playbook.
          stream: true,
          // Sem thinking: a saída JSON é garantida pelo schema (output_config.format),
          // então não pagamos tokens de raciocínio (os caros). Extração estruturada
          // não precisa de thinking. Custo ~5x menor que Opus + adaptive thinking.
          output_config: {
            format: { type: "json_schema", schema: buildSchema(slugs, objectionSlugs, part) },
          },
          // O bloco cacheado é igual para todo mundo; as diretrizes, que variam por
          // conta, vêm depois dele para não quebrar o cache.
          system: [
            { type: "text", text: system, cache_control: { type: "ephemeral" } },
            ...(guidelinesBlock ? [{ type: "text", text: guidelinesBlock }] : []),
            ...(gapAnswers.count > 0 ? [{ type: "text", text: GAP_ANSWERS_RULES }] : []),
            ...(PART_NOTES[part] ? [{ type: "text", text: PART_NOTES[part] }] : []),
          ],
          messages: [{ role: "user", content: userText }],
        }),
      });
      // Erro de HTTP chega antes de o stream abrir: aí o corpo ainda é JSON.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          res.status === 429
            ? "Limite de tokens por minuto da Anthropic atingido. O material é grande demais para o tier atual da conta — reduza o conteúdo, processe em partes, ou aumente o tier no console da Anthropic."
            : (data?.error?.message ?? data?.error ?? data);
        throw new PartError({ status: res.status, detail: msg });
      }
      const { text: generated, stopReason, usage } = await readAnthropicStream(res);
      // Tamanho e tempo de cada fatia: é o que diz qual delas cresce e precisa dividir.
      console.log(
        `process-import[${part}]: ${num(usage?.output_tokens)} tokens de saída em ${
          Math.round((Date.now() - startedAt) / 1000)
        }s`,
      );
      if (stopReason === "max_tokens") {
        throw new PartError(
          "O material é muito extenso para ser estruturado em uma única resposta. Reduza o conteúdo (ou processe em partes) e tente de novo.",
        );
      }
      if (!generated.trim()) throw new PartError("resposta sem conteúdo estruturado");
      try {
        return { parsed: JSON.parse(generated) as Record<string, unknown>, usage };
      } catch {
        throw new PartError("A IA retornou um resultado incompleto. Tente reduzir o material.");
      }
    };

    // Em paralelo: o tempo total é o da fatia mais lenta, não a soma. É o que
    // mantém a função abaixo do teto de ~150s do gateway com material grande.
    let parts;
    try {
      // Todas as fatias são obrigatórias, o dossiê inclusive: uma que falhe derruba o
      // processamento com o motivo, em vez de devolver o material pela metade.
      parts = await Promise.all(PARTS_FOR_MODE[mode].map((p: SchemaPart) => askFor(p)));
    } catch (e) {
      if (e instanceof PartError) return json({ ok: false, error: e.payload }, 502);
      throw e;
    }

    // As metades do dossiê chegam cada uma com um `dossie` parcial: junta em vez de
    // deixar a segunda sobrescrever a primeira.
    const result: Record<string, unknown> = {};
    for (const { parsed } of parts) {
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = k === "dossie" && result.dossie
          ? { ...(result.dossie as object), ...(v as object) }
          : v;
      }
    }
    const usage = {
      input_tokens: parts.reduce((t, p) => t + num(p.usage?.input_tokens), 0),
      output_tokens: parts.reduce((t, p) => t + num(p.usage?.output_tokens), 0),
    };
    const generator: GeneratorManifest = {
      version: GENERATOR_VERSION,
      fingerprint: await generatorFingerprint(MODEL),
      model: MODEL,
      mode,
      guidelines: guidelineRefs(guidelines),
      connection_id: connectionId,
      processed_at: new Date().toISOString(),
      ...(gapAnswers.count > 0 && { gap_answers: gapAnswers.count }),
    };
    return json({
      ok: true,
      result,
      usage,
      mode,
      generator,
      // Sempre presente: é por ele que a tela sabe que esta versão da função trata
      // as respostas (uma versão antiga ignoraria o campo calada).
      gap_answers: { count: gapAnswers.count, truncated: gapAnswers.truncated },
      ...(skipped.length > 0 && {
        warnings: [`${skipped.length} diretriz(es) ficaram de fora por passar do limite de tamanho: ${skipped.map((g) => g.title).join(", ")}`],
      }),
    });
  } catch (e) {
    const detail = e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
