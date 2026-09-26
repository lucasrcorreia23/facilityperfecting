/**
 * Resolução da conta de destino na Perfecting, compartilhada pelos dois motores
 * de envio: `export-roleplay` (metodologia) e `export-playbook` (jornada).
 *
 * São duas funções, não uma, para preservar a ordem das chamadas do export
 * original: autenticar → resolver call_context → criar offer/context. Assim um
 * call_context inválido continua falhando ANTES de criar offer/context na org
 * de destino (sem deixar órfãos).
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  createContext,
  createOffer,
  generateContext,
  generateOffer,
  loginAsUser,
  loginSuperadmin,
  parsePerfectingEnv,
  type PerfectingEnv,
  perfectingEntityExists,
  PerfectingError,
  truncateForApi,
} from "./perfecting.ts";

export interface DestinationConnection {
  id: string;
  environment: string;
  org_id: number;
  target_user_id: number | null;
  default_user_group_id: number | null;
}

export interface DestinationDraft {
  offers: {
    id: string;
    offer_name: string;
    general_description: string;
    url?: string | null;
  };
  contexts?: { id: string; target_notes: string | null } | null;
  connections?: DestinationConnection | null;
}

/** Login de superadmin + impersonação do gestor-alvo da conexão. */
export async function authenticateConnection(
  connection: DestinationConnection | null | undefined,
): Promise<{ env: PerfectingEnv; token: string }> {
  if (!connection) throw new PerfectingError(400, "rascunho sem conexão de destino");
  if (connection.target_user_id == null) {
    throw new PerfectingError(400, "conexão sem gestor-alvo (target_user_id)");
  }
  const env = parsePerfectingEnv(connection.environment);
  const saToken = await loginSuperadmin(env);
  const token = await loginAsUser(env, saToken, connection.target_user_id, connection.org_id);
  return { env, token };
}

/**
 * Garante offer + context na org de destino, reusando por conexão via as pontes
 * `offer_perfecting_ids` / `context_perfecting_ids`. Idempotente.
 *
 * O id de uma ponte só é reusado se ainda existir na Perfecting: quem apaga o
 * roleplay lá pode levar a oferta junto, e reusar o id derruba o envio com 404.
 * Ponte vencida é apagada e a oferta/contexto é recriada; oferta recriada invalida
 * também a ponte do contexto (ele pertencia à oferta apagada).
 */
export async function resolveOfferContext(
  db: SupabaseClient,
  draft: DestinationDraft,
  env: PerfectingEnv,
  token: string,
  onStep?: (step: string) => Promise<unknown> | unknown,
): Promise<{ perfectingOfferId: number; perfectingContextId: number }> {
  const connection = draft.connections;
  if (!connection) throw new PerfectingError(400, "rascunho sem conexão de destino");
  const offer = draft.offers;
  const context = draft.contexts ?? null; // pode ser null → criamos via generate
  const connId = connection.id;

  // OFFER (reuso por conexão)
  await onStep?.("offer");
  let perfectingOfferId: number;
  const { data: offerBridge } = await db
    .from("offer_perfecting_ids")
    .select("perfecting_offer_id")
    .eq("offer_id", offer.id)
    .eq("connection_id", connId)
    .maybeSingle();
  const bridgedOfferId: number | null = offerBridge?.perfecting_offer_id ?? null;
  const offerAlive =
    bridgedOfferId != null && (await perfectingEntityExists(env, token, "offer", bridgedOfferId));
  if (bridgedOfferId != null && offerAlive) {
    perfectingOfferId = bridgedOfferId;
  } else {
    if (bridgedOfferId != null) {
      await db
        .from("offer_perfecting_ids")
        .delete()
        .eq("offer_id", offer.id)
        .eq("connection_id", connId);
    }
    // Material colado pode ter dezenas de milhares de caracteres — sem isso o
    // /offer/generate da Perfecting quebra com 500 genérico (ver truncateForApi).
    const description = truncateForApi(offer.general_description);
    const gen = await generateOffer(env, token, offer.offer_name, description);
    try {
      perfectingOfferId = await createOffer(
        env,
        token,
        gen,
        offer.offer_name,
        description,
        offer.url ?? "",
      );
    } catch (e) {
      // /offer/create responde 500 genérico (sem detalhe) quando já existe uma
      // oferta com esse nome exato na org — conflito de unicidade mal tratado do
      // lado da Perfecting. Não dá pra distinguir isso de outro erro pelo corpo
      // da resposta, então tenta 1x com o nome desambiguado antes de desistir.
      // `gen.offer_name` é sobrescrito explicitamente: o build do payload prioriza
      // esse campo (quando presente) sobre o `offerName` passado como argumento.
      if (!(e instanceof PerfectingError)) throw e;
      const retryName = `${offer.offer_name} (${offer.id.slice(0, 6)})`;
      perfectingOfferId = await createOffer(
        env,
        token,
        { ...gen, offer_name: retryName },
        retryName,
        description,
        offer.url ?? "",
      );
    }
    await db.from("offer_perfecting_ids").insert({
      offer_id: offer.id,
      connection_id: connId,
      perfecting_offer_id: perfectingOfferId,
    });
  }

  // CONTEXT (reuso por conexão)
  await onStep?.("context");
  let perfectingContextId: number;
  const localContextId = context?.id ?? null;
  const { data: ctxBridge } = localContextId
    ? await db
        .from("context_perfecting_ids")
        .select("perfecting_context_id")
        .eq("context_id", localContextId)
        .eq("connection_id", connId)
        .maybeSingle()
    : { data: null };
  const bridgedContextId: number | null = ctxBridge?.perfecting_context_id ?? null;
  const contextAlive =
    bridgedContextId != null &&
    offerAlive &&
    (await perfectingEntityExists(env, token, "context", bridgedContextId));
  if (bridgedContextId != null && contextAlive) {
    perfectingContextId = bridgedContextId;
  } else {
    if (bridgedContextId != null && localContextId) {
      await db
        .from("context_perfecting_ids")
        .delete()
        .eq("context_id", localContextId)
        .eq("connection_id", connId);
    }
    const gen = await generateContext(
      env,
      token,
      perfectingOfferId,
      truncateForApi(context?.target_notes ?? ""),
    );
    perfectingContextId = await createContext(env, token, gen, perfectingOfferId);
    if (localContextId) {
      await db.from("context_perfecting_ids").insert({
        context_id: localContextId,
        connection_id: connId,
        perfecting_context_id: perfectingContextId,
      });
    }
  }

  return { perfectingOfferId, perfectingContextId };
}
