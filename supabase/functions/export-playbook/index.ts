import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { authenticateConnection } from "../_shared/destination.ts";
import {
  addPlaybookCallTypeMethodology,
  createPlaybook,
  createPlaybookCallBlock,
  createPlaybookCallType,
  generatePlaybookCallTypeRubrics,
  listCallContexts,
  listMethodologies,
  PerfectingError,
  perfectingPlaybookExists,
} from "../_shared/perfecting.ts";
import { exportIssuesMessage, validatePlaybookForExport } from "../_shared/perfecting-limits.ts";
import { resolvePlaybookTaxonomy } from "../_shared/playbook-taxonomy.ts";
import {
  isStaleSend,
  PLAYBOOK_SEND_STALE_MS,
  SEND_IN_PROGRESS_MESSAGE,
  staleSendError,
} from "../_shared/send-staleness.ts";

/**
 * Envia a DEFINIÇÃO do playbook (etapas + subetapas) para a conta de destino.
 * Não confundir com `implement-playbook`, que roda o motor da Perfecting em
 * cima de um playbook JÁ existente na conta para gerar os roleplays.
 *
 * Síncrono de propósito: são ~25 POSTs de CRUD sem IA — segundos, não minutos. A única
 * parte com IA (rubricas dos blocos) é disparada em invocações separadas no fim.
 *
 * Idempotência: cada id criado é gravado em `playbooks.export_run` ANTES do
 * passo seguinte. Um retry depois de falha no meio pula o que já existe — a
 * API não tem upsert, então sem isso o reenvio duplicaria etapas.
 */

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface ExportRun {
  connection_id?: string;
  perfecting_playbook_id?: number;
  call_types?: Record<string, number>;
  call_blocks?: Record<string, number>;
  /** Etapa local → metodologia já vinculada na conta (a retomada vincula as que faltam). */
  call_type_methodologies?: Record<string, number>;
  /** Slugs que não existem na conta de destino (a tela mostra). */
  warnings?: string[];
  finished_at?: string | null;
  /** Erro do último envio — fica AQUI, nunca em status/error_detail (que são da geração). */
  error?: unknown;
  failed_at?: string | null;
}

interface CallBlockRow {
  id: string;
  position: number;
  name: string;
  description: string | null;
  objective: string | null;
  sample_questions: string[] | null;
  what_to_do: string[] | null;
  what_to_avoid: string[] | null;
}

interface CallTypeRow {
  id: string;
  position: number;
  name: string;
  description: string | null;
  call_context_slug: string | null;
  methodology_slug: string | null;
  playbook_call_blocks: CallBlockRow[];
}

function saveRun(playbookId: string, run: ExportRun, patch: Record<string, unknown> = {}) {
  return db
    .from("playbooks")
    .update({ export_run: run, ...patch })
    .eq("id", playbookId);
}

/**
 * Grava o run depois de criar algo na conta. É o registro que faz o reenvio pular o
 * que já existe: se ele se perde, o próximo envio duplica. Por isso a falha não é
 * ignorada — tenta de novo uma vez e, se persistir, para o envio dizendo o que acabou
 * de ser criado e não foi registrado.
 */
async function saveRunOrThrow(
  playbookId: string,
  run: ExportRun,
  justCreated: string,
  patch: Record<string, unknown> = {},
): Promise<void> {
  let { error } = await saveRun(playbookId, run, patch);
  if (error) {
    console.error(`export-playbook: falha ao gravar o run (${justCreated}):`, error.message);
    ({ error } = await saveRun(playbookId, run, patch));
  }
  if (error) {
    console.error(`export-playbook: run NÃO gravado (${justCreated}):`, error.message);
    throw new PerfectingError(500, {
      message:
        `${justCreated} na conta, mas o registro local do envio falhou (${error.message}). ` +
        "Não reenvie antes de conferir a conta: o reenvio criaria de novo o que já existe",
      export_run: run,
    });
  }
}

/** Recusa que NÃO é falha do envio em curso: não pode passar pelo `recordSendFailure`. */
class SendInProgressError extends PerfectingError {
  constructor() {
    super(409, SEND_IN_PROGRESS_MESSAGE);
  }
}

/**
 * Playbook preso em "exporting": a invocação foi encerrada (limite de tempo) antes de
 * gravar sucesso ou erro. Volta para "ready" com o erro em `export_run.error` — os ids
 * já criados ficam no run, e o reenvio continua de onde parou.
 */
async function releaseStaleSend(playbookId: string, run: ExportRun | null): Promise<void> {
  const next: ExportRun = { ...(run ?? {}), error: staleSendError(), failed_at: new Date().toISOString() };
  const { error } = await saveRun(playbookId, next, { status: "ready", error_detail: null });
  if (error) console.error("export-playbook: falha ao destravar envio vencido:", error.message);
}

/**
 * Falha de ENVIO nunca vira `status: "error"`: esse estado é da geração, e a tela
 * oferece "Retomar geração" nele — que roda generate-playbook e apaga as etapas.
 * O playbook volta a "ready" e o erro fica em `export_run.error`, mesclado ao run
 * (os ids já criados continuam lá para o reenvio pular o que existe).
 *
 * Só mexe se o envio chegou a marcar "exporting": recusas anteriores a isso
 * (404, 409, 422 da pré-validação) não tocam em nada.
 */
async function recordSendFailure(playbookId: string, detail: unknown): Promise<void> {
  const { data: current } = await db
    .from("playbooks")
    .select("status, export_run")
    .eq("id", playbookId)
    .single();
  if (!current || current.status !== "exporting") return;
  const run: ExportRun = {
    ...(current.export_run ?? {}),
    error: detail,
    failed_at: new Date().toISOString(),
  };
  const { error } = await saveRun(playbookId, run, { status: "ready", error_detail: null });
  if (error) console.error("export-playbook: falha ao gravar o erro do envio:", error.message);
}

async function exportPlaybook(
  playbookId: string,
  connectionId: string,
): Promise<{ perfectingPlaybookId: number; callTypes: number; callBlocks: number; warnings: string[] }> {
  const { data: playbook, error } = await db
    .from("playbooks")
    .select("id, name, status, export_run, updated_at")
    .eq("id", playbookId)
    .single();
  if (error || !playbook) throw new PerfectingError(404, "playbook não encontrado");

  const { data: connection, error: connErr } = await db
    .from("connections")
    .select("id, environment, org_id, target_user_id, default_user_group_id")
    .eq("id", connectionId)
    .single();
  if (connErr || !connection) throw new PerfectingError(404, "conexão não encontrada");

  const { data: callTypes, error: ctErr } = await db
    .from("playbook_call_types")
    .select("*, playbook_call_blocks(*)")
    .eq("playbook_id", playbookId)
    .order("position", { ascending: true });
  if (ctErr) throw new PerfectingError(500, ctErr.message);
  if (!callTypes || callTypes.length === 0) {
    throw new PerfectingError(422, "playbook sem etapas — gere a estrutura antes de enviar");
  }

  // Pré-validação contra os limites do backend, ANTES de qualquer POST e de marcar
  // "exporting": lá o estouro vira um 500 genérico no meio do envio, sem dizer o campo.
  const issues = validatePlaybookForExport({
    name: playbook.name ?? "",
    callTypes: (callTypes as CallTypeRow[]).map((ct) => ({
      name: ct.name,
      description: ct.description,
      blocks: [...(ct.playbook_call_blocks ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((b) => ({ name: b.name, description: b.description })),
    })),
  });
  if (issues.length > 0) {
    throw new PerfectingError(422, {
      message: exportIssuesMessage(issues),
      issues: issues.map((i) => i.message),
      fields: issues,
    });
  }

  // Envio vivo: outra invocação está criando etapas agora. Entrar junto duplicaria.
  // Preso além do prazo é execução morta — segue, retomando pelo run.
  if (playbook.status === "exporting" && !isStaleSend(playbook.updated_at, Date.now(), PLAYBOOK_SEND_STALE_MS)) {
    throw new SendInProgressError();
  }

  // Login, existência do playbook remoto e taxonomia ANTES de marcar "exporting" e de
  // qualquer POST: são só leituras, e o que falhar aqui não deixa nada pela metade.
  const { env, token } = await authenticateConnection(connection);

  // Retoma um envio anterior para esta MESMA conexão; para outra conta, começa do zero.
  const previous: ExportRun = playbook.export_run ?? {};
  let resuming = previous.connection_id === connectionId;

  const dropBridge = async () => {
    const { error: delErr } = await db
      .from("playbook_perfecting_ids")
      .delete()
      .eq("playbook_id", playbookId)
      .eq("connection_id", connectionId);
    if (delErr) console.error("export-playbook: falha ao apagar a ponte vencida:", delErr.message);
  };

  if (resuming && previous.perfecting_playbook_id != null) {
    // O run aponta para um playbook que pode ter sido apagado na Perfecting: retomar em
    // cima dele daria 404 em toda etapa. Some lá → zera run e ponte e recria do zero.
    if (!(await perfectingPlaybookExists(env, token, previous.perfecting_playbook_id))) {
      await dropBridge();
      resuming = false;
    }
  } else if (!resuming) {
    // export_run só guarda o último destino. Se esta conta já recebeu o playbook
    // mas o run atual é de OUTRA conta, não dá para saber o que já existe lá —
    // seguir criaria um playbook duplicado. Melhor recusar de forma explícita…
    const { data: bridge } = await db
      .from("playbook_perfecting_ids")
      .select("perfecting_playbook_id")
      .eq("playbook_id", playbookId)
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (bridge?.perfecting_playbook_id) {
      // …desde que ele ainda exista. Ponte de playbook apagado lá recusava para sempre.
      if (await perfectingPlaybookExists(env, token, bridge.perfecting_playbook_id)) {
        throw new PerfectingError(
          409,
          `este playbook já foi enviado para esta conta (playbook ${bridge.perfecting_playbook_id} lá). Exclua-o na Perfecting antes de reenviar, ou escolha outra conta.`,
        );
      }
      await dropBridge();
    }
  }

  // Taxonomia resolvida UMA vez (antes era um GET por etapa, e slug que não existia na
  // conta criava a etapa sem tipo de ligação em silêncio). Listagem que falha derruba o
  // envio aqui, antes de escrever.
  const [callContexts, methodologies] = await Promise.all([
    listCallContexts(env, token),
    listMethodologies(env, token),
  ]);
  const taxonomy = resolvePlaybookTaxonomy(callTypes as CallTypeRow[], callContexts, methodologies);

  const run: ExportRun = resuming
    ? { ...previous, finished_at: null }
    : { connection_id: connectionId, call_types: {}, call_blocks: {}, call_type_methodologies: {} };
  run.call_types ??= {};
  run.call_blocks ??= {};
  run.call_type_methodologies ??= {};
  run.warnings = taxonomy.warnings;
  // Envio novo começa sem o erro do anterior (o spread de `previous` o traria junto).
  delete run.error;
  delete run.failed_at;

  const { error: startErr } = await saveRun(playbookId, run, { status: "exporting", error_detail: null });
  if (startErr) {
    // Nada foi criado ainda: parar aqui é seguro, seguir sem registro não é.
    throw new PerfectingError(500, `não foi possível registrar o início do envio: ${startErr.message}`);
  }

  // 1) o playbook em si
  if (run.perfecting_playbook_id == null) {
    run.perfecting_playbook_id = await createPlaybook(env, token, playbook.name);
    await saveRunOrThrow(playbookId, run, `playbook ${run.perfecting_playbook_id} criado`);
    // A ponte só serve ao envio para OUTRA conta depois deste; o run acima já garante
    // a retomada. Falha aqui não para o envio, mas não fica mais em silêncio.
    const { error: bridgeErr } = await db.from("playbook_perfecting_ids").upsert(
      {
        playbook_id: playbookId,
        connection_id: connectionId,
        perfecting_playbook_id: run.perfecting_playbook_id,
      },
      { onConflict: "playbook_id,connection_id" },
    );
    if (bridgeErr) {
      console.error("export-playbook: falha ao gravar a ponte:", bridgeErr.message);
      run.warnings = [
        ...(run.warnings ?? []),
        `o vínculo deste playbook com a conta (playbook ${run.perfecting_playbook_id}) não foi gravado: se enviar para outra conta e depois voltar a esta, confira antes para não duplicar`,
      ];
    }
  }
  const remotePlaybookId = run.perfecting_playbook_id;

  let createdCallTypes = 0;
  let createdCallBlocks = 0;
  // Cadeia linear pela ordem: cada etapa aponta para a anterior (a primeira fica sem).
  let previousRemoteCallTypeId: number | null = null;

  for (const ct of callTypes as CallTypeRow[]) {
    const resolved = taxonomy.byCallType[ct.id];
    // 2) etapa
    let remoteCallTypeId = run.call_types[ct.id];
    if (remoteCallTypeId == null) {
      remoteCallTypeId = await createPlaybookCallType(env, token, remotePlaybookId, {
        name: ct.name,
        description: ct.description ?? ct.name,
        call_context_type_id: resolved?.callContextTypeId ?? null,
        order: ct.position,
        precedent_call_type_id: previousRemoteCallTypeId,
      });
      run.call_types[ct.id] = remoteCallTypeId;
      await saveRunOrThrow(playbookId, run, `etapa "${ct.name}" (${remoteCallTypeId}) criada`);
      createdCallTypes++;
    }

    // 3) metodologia da etapa — sem ela o motor pode pular a etapa depois. Fora do
    // `if` acima de propósito: o envio que caiu entre criar a etapa e vincular a
    // metodologia retomava pulando o vínculo. O POST é idempotente no backend
    // (s37_playbook_crud Add: só insere se o par não existe).
    const methodologyId = resolved?.methodologyId ?? null;
    if (methodologyId != null && run.call_type_methodologies[ct.id] !== methodologyId) {
      await addPlaybookCallTypeMethodology(env, token, remotePlaybookId, remoteCallTypeId, methodologyId);
      run.call_type_methodologies[ct.id] = methodologyId;
      await saveRunOrThrow(playbookId, run, `metodologia da etapa "${ct.name}" vinculada`);
    }

    // 4) subetapas
    const blocks = [...(ct.playbook_call_blocks ?? [])].sort((a, b) => a.position - b.position);
    for (const block of blocks) {
      if (run.call_blocks[block.id] != null) continue;
      const remoteBlockId = await createPlaybookCallBlock(env, token, remotePlaybookId, remoteCallTypeId, {
        name: block.name,
        description: block.description ?? block.name,
        order: block.position,
        objective: block.objective,
        sample_questions: block.sample_questions ?? [],
        what_to_do: block.what_to_do ?? [],
        what_to_avoid: block.what_to_avoid ?? [],
      });
      run.call_blocks[block.id] = remoteBlockId;
      await saveRunOrThrow(playbookId, run, `subetapa "${block.name}" (${remoteBlockId}) criada`);
      createdCallBlocks++;
    }
    previousRemoteCallTypeId = remoteCallTypeId;
  }

  // 5) rubricas dos blocos, com IA — uma invocação separada por etapa, porque a geração
  // leva minutos e esta função tem ~150s. Falha ali só vai para o log.
  for (const remoteCallTypeId of Object.values(run.call_types)) {
    EdgeRuntime.waitUntil(
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/export-playbook`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage: "generate_rubrics",
          playbookId,
          connectionId,
          callTypeId: remoteCallTypeId,
        }),
      })
        .then((r) => r.ok || console.error("rubrics não disparou:", r.status))
        .catch((e) => console.error("rubrics não disparou:", String(e))),
    );
  }

  run.finished_at = new Date().toISOString();
  await saveRunOrThrow(playbookId, run, "playbook enviado", { status: "exported", error_detail: null });

  return {
    perfectingPlaybookId: remotePlaybookId,
    callTypes: createdCallTypes,
    callBlocks: createdCallBlocks,
    warnings: run.warnings ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  let playbookId = "";
  try {
    const body = await req.json().catch(() => ({}));
    playbookId = typeof body.playbookId === "string" ? body.playbookId : "";
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    if (!playbookId || (!connectionId && body.stage !== "poll")) {
      return json({ ok: false, error: "playbookId e connectionId são obrigatórios" }, 400);
    }

    // Consulta do envio em andamento. Só destrava o que venceu: a tela chama isto
    // enquanto o playbook está "exporting" e nunca dispara um envio novo.
    if (body.stage === "poll") {
      const { data: current } = await db
        .from("playbooks")
        .select("status, export_run, updated_at")
        .eq("id", playbookId)
        .single();
      if (!current) return json({ ok: false, error: "playbook não encontrado" }, 404);
      if (current.status !== "exporting") {
        return json({ ok: true, done: true, status: current.status });
      }
      if (isStaleSend(current.updated_at, Date.now(), PLAYBOOK_SEND_STALE_MS)) {
        await releaseStaleSend(playbookId, current.export_run);
        return json({ ok: true, done: true, status: "ready", released: true });
      }
      return json({ ok: true, done: false, status: current.status });
    }

    // Rubricas de UMA etapa (disparada pelo export, ou manualmente para um playbook já
    // enviado). Só aceita etapas que este export criou nessa conta.
    if (body.stage === "generate_rubrics") {
      const callTypeId = Number(body.callTypeId);
      const { data: playbook } = await db
        .from("playbooks")
        .select("export_run")
        .eq("id", playbookId)
        .single();
      const run: ExportRun = playbook?.export_run ?? {};
      if (
        run.connection_id !== connectionId ||
        run.perfecting_playbook_id == null ||
        !Object.values(run.call_types ?? {}).includes(callTypeId)
      ) {
        return json({ ok: false, error: "etapa não pertence a este playbook exportado" }, 400);
      }
      const { data: connection } = await db
        .from("connections")
        .select("id, environment, org_id, target_user_id, default_user_group_id")
        .eq("id", connectionId)
        .single();
      const remotePlaybookId = run.perfecting_playbook_id;
      const generate = async () => {
        const { env, token } = await authenticateConnection(connection);
        return generatePlaybookCallTypeRubrics(env, token, remotePlaybookId, callTypeId);
      };
      if (body.wait === true) {
        // Erro aqui não pode cair no catch geral: o playbook já está exportado.
        try {
          return json({ ok: true, callTypeId, result: await generate() });
        } catch (e) {
          const detail =
            e instanceof PerfectingError ? { status: e.status, detail: e.detail } : String(e);
          return json({ ok: false, callTypeId, error: detail }, 502);
        }
      }
      EdgeRuntime.waitUntil(
        generate()
          .then((r) => console.log(`rubrics etapa ${callTypeId}:`, JSON.stringify(r)))
          .catch((e) => console.error(`rubrics etapa ${callTypeId} falhou:`, String(e))),
      );
      return json({ ok: true, callTypeId }, 202);
    }

    const result = await exportPlaybook(playbookId, connectionId);
    return json({ ok: true, ...result });
  } catch (e) {
    const detail =
      e instanceof PerfectingError
        ? { status: e.status, detail: e.detail }
        : { message: String(e instanceof Error ? e.message : e) };
    // Envio em andamento: o playbook está "exporting" por causa da OUTRA invocação.
    // Gravar falha aqui o devolveria a "ready" com o envio vivo ainda criando etapas.
    if (e instanceof SendInProgressError) return json({ ok: false, error: detail }, 409);
    if (playbookId) await recordSendFailure(playbookId, detail);
    // Validação devolve 422 de verdade; o resto segue 500 (o detalhe vai no corpo).
    return json({ ok: false, error: detail }, e instanceof PerfectingError && e.status === 422 ? 422 : 500);
  }
});
