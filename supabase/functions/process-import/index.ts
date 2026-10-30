import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { buildSchema, buildSystem, PART_NOTES, PARTS_FOR_MODE, type SchemaPart } from "./schema.ts";
import { generatorFingerprint, SYSTEM_BASE } from "./prompt.ts";
import { GENERATOR_VERSION, type GeneratorManifest } from "../_shared/generator-version.ts";
import { guidelineRefs, loadGuidelines, renderGuidelinesBlock, selectGuidelines } from "../_shared/guidelines.ts";
import { readAnthropicStream } from "../_shared/anthropic.ts";
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
 * Prazo de cada fatia. O teto da Edge Function é ~150s (plano Free); abortar antes
 * dele é o que permite devolver QUAL fatia estourou, em vez do "Failed to send a
 * request" genérico que o front recebe quando o gateway derruba a conexão.
 */
const PART_DEADLINE_MS = 138_000;

const PART_LABELS: Record<SchemaPart, string> = {
  core: "oferta",
  profile: "perfil",
  objections: "objeções e guardrails",
  scenario: "cenário",
  dossier_buyer: "dossiê (comprador e dores)",
  dossier_context: "dossiê (conhecimento, abertura e rubricas)",
};



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

    // Taxonomias válidas da Perfecting, para o modelo escolher slugs reais.
    const saToken = await loginSuperadmin("hml");
    const contexts = await listCallContexts("hml", saToken);
    if (contexts.length === 0) {
      return json({ ok: false, error: "nenhum call_context disponível na Perfecting" }, 502);
    }
    const slugs = contexts.map((c) => c.slug);
    // Tipos de objeção: sem eles o modelo não tem enum para `objecoes[].tipo`, então
    // a extração de objeções é desligada em vez de gerar slug inválido (o enum não
    // aceita array vazio, e uma objeção com tipo errado não é criável na API).
    const objectionTypes = await listObjectionTypes("hml", saToken).catch(() => []);
    const objectionSlugs = objectionTypes.map((o) => o.slug);

    const system = buildSystem(contexts, objectionTypes, SYSTEM_BASE);

    /** Uma metade do schema, pedida à Anthropic. Ver buildSchema() sobre o porquê. */
    const askFor = async (part: SchemaPart) => {
      const startedAt = Date.now();
      const signal = AbortSignal.timeout(PART_DEADLINE_MS);
      try {
        return await askForUntil(part, signal, startedAt);
      } catch (e) {
        if (signal.aborted) {
          console.warn(`process-import[${part}]: passou de ${PART_DEADLINE_MS / 1000}s`);
          throw new PartError(
            `A parte "${PART_LABELS[part]}" passou do tempo (${Math.round(PART_DEADLINE_MS / 1000)}s). Nada foi descartado: tente de novo; se repetir, a parte precisa ser dividida.`,
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
            ...(PART_NOTES[part] ? [{ type: "text", text: PART_NOTES[part] }] : []),
          ],
          messages: [{ role: "user", content: text }],
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
    };
    return json({
      ok: true,
      result,
      usage,
      mode,
      generator,
      ...(skipped.length > 0 && {
        warnings: [`${skipped.length} diretriz(es) ficaram de fora por passar do limite de tamanho: ${skipped.map((g) => g.title).join(", ")}`],
      }),
    });
  } catch (e) {
    const detail = e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
