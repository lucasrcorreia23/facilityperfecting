/**
 * Envio de um rascunho de DEBATE para a Perfecting (motor de prompt 3). O que é cada
 * campo e por que está aqui: `debate.ts`. Chamado pelo `export-roleplay` quando o
 * rascunho tem `scenario.generation_mode === "debate"`, depois do login.
 *
 * Tudo é escrito verbatim, sem IA da Perfecting (os geradores dela escrevem venda) e
 * sem o fechamento do `complete-roleplay` (que gravaria conteúdo por etapa de venda
 * por cima das regras do debate). Ordem:
 *   oferta → contexto → persona → case_setup (sem prompt, "Em desenvolvimento")
 *   → conteúdo por etapa → contra-argumentos (3 níveis) → regras do contexto
 *   → feedback → motor 3 + persona → status escolhido → prompt → agente da ElevenLabs.
 * Motor, prompt e agente vão por último: antes do conteúdo, o prompt montado seria o
 * de venda, e um roleplay visível pela metade abriria a chamada sem as regras.
 */
import { findReservedTerms, describeBuyerTextIssue } from "./buyer-text-lint.ts";
import {
  type DebateDraft,
  debateAvatarCandidates,
  debateBuyerTexts,
  debateCaseSetupPayload,
  debateContextPayload,
  debateDraftIssues,
  debateFeedbackConfig,
  debateObjectionInputs,
  debateOfferPayload,
  debatePersonaPayload,
  debateStepKnowledgeInputs,
  DEBATE_ENGINE_ID,
  type DebateVoice,
  pickDebateCallContextId,
  pickDebateVoice,
  pickObjectionTypeId,
  pickVoiceV1,
} from "./debate.ts";
import {
  applyRoleplayStatus,
  createCaseSetupRaw,
  createOnce,
  DIFFICULTY_LEVEL_IDS,
  difficultyLevelIdFor,
  getCaseSetupRaw,
  listAvatarVoiceLinks,
  listCallContexts,
  listMethodologySteps,
  listObjectionTypes,
  listPersonaAvatars,
  listPersonaVoicesV2,
  listStepKnowledgeLinks,
  listVoicesV1,
  patchCaseSetup,
  patchStepKnowledge,
  type PerfectingEnv,
  PerfectingError,
  putCaseSetupFeedbackConfig,
  putCaseSetupFields,
  resolveMethodologyId,
  roleplayStatusIdFrom,
  runCaseSetupRepairStep,
} from "./perfecting.ts";

const VALID = new Set(["easy", "medium", "hard"]);
/** `role_plays.role_play_status` 1 = Em desenvolvimento. */
const IN_DEVELOPMENT = 1;
/** Avatares consultados atrás de voz vinculada (cada um é um GET). */
const MAX_AVATAR_LOOKUPS = 8;

export interface DebateExportResult {
  caseSetupId: number;
  elevenlabsAgentId: string | null;
  personaId: number;
  warnings: string[];
  /** Ids criados, para desfazer à mão se o envio parar no meio. */
  created: Record<string, unknown>;
}

const reason = (e: unknown) => (e instanceof PerfectingError ? JSON.stringify(e.detail) : String(e));

/** O que barra o envio antes de qualquer escrita (422 com a lista). */
export function assertDebateReady(d: DebateDraft | null | undefined, steps?: Parameters<typeof debateDraftIssues>[1]) {
  if (!d) throw new PerfectingError(422, { message: "rascunho de debate sem conteúdo: processe o material" });
  const issues = debateDraftIssues(d, steps);
  const lint = findReservedTerms(debateBuyerTexts(d));
  issues.push(...lint.filter((i) => i.nivel === "erro").map(describeBuyerTextIssue));
  if (issues.length > 0) {
    throw new PerfectingError(422, {
      message: `rascunho de debate com ${issues.length} problema(s): corrija antes de enviar`,
      issues,
    });
  }
  return lint.filter((i) => i.nivel === "aviso").map((i) => `texto da oponente: ${describeBuyerTextIssue(i)}`);
}

async function resolveVoice(env: PerfectingEnv, token: string, d: DebateDraft): Promise<{ voice: DebateVoice; warning: string | null }> {
  if (d.sem_voz) return { voice: { voiceId: null, avatarId: null }, warning: null };
  try {
    const [avatars, voices] = await Promise.all([listPersonaAvatars(env, token), listPersonaVoicesV2(env, token)]);
    const candidates = debateAvatarCandidates(d, avatars).slice(0, MAX_AVATAR_LOOKUPS);
    const links = (await Promise.all(candidates.map((a) => listAvatarVoiceLinks(env, token, a.id)))).flat();
    const voice = pickDebateVoice(d, avatars, links, voices);
    return {
      voice,
      warning: voice.voiceId == null ? "nenhuma voz da faixa e do gênero da oponente no catálogo: persona sem voz própria" : null,
    };
  } catch (e) {
    return { voice: { voiceId: null, avatarId: null }, warning: `voz não escolhida (${reason(e)}): persona sem voz própria` };
  }
}

export async function exportDebateDraft(
  env: PerfectingEnv,
  token: string,
  // deno-lint-ignore no-explicit-any
  draft: any,
  setStep: (step: string) => Promise<unknown> | unknown,
): Promise<DebateExportResult> {
  const d = draft.scenario?.debate as DebateDraft | undefined;
  const warnings = assertDebateReady(d);
  const debate = d as DebateDraft;
  const created: Record<string, unknown> = {};

  // Metodologia é obrigatória: o conteúdo é por etapa, e a etapa liga pela ordem.
  const methodologyId = await resolveMethodologyId(env, token, draft.scenario?.methodology_slug);
  if (methodologyId == null) {
    throw new PerfectingError(422, {
      message: `metodologia "${draft.scenario?.methodology_slug ?? ""}" não existe na conta de destino`,
    });
  }
  const steps = await listMethodologySteps(env, token, methodologyId);
  assertDebateReady(debate, steps);

  const callContextTypeId = pickDebateCallContextId(await listCallContexts(env, token));
  if (callContextTypeId == null) throw new PerfectingError(502, "nenhum tipo de ligação na conta de destino");
  const rawDifficulty = String(draft.scenario?.difficulty ?? "medium");
  const difficulty = (VALID.has(rawDifficulty) ? rawDifficulty : "medium") as "easy" | "medium" | "hard";
  const difficultyLevelId = difficultyLevelIdFor(difficulty) ?? 2;
  const objectionTypeId = pickObjectionTypeId(await listObjectionTypes(env, token));
  if (objectionTypeId == null && debate.objecoes.length > 0) {
    throw new PerfectingError(502, "nenhum tipo de objeção na conta de destino");
  }

  // Oferta e contexto próprios por debate: as regras moram no contexto, e a persona
  // de um debate não pode entrar no sorteio de outro.
  await setStep("offer");
  const offer = await createOnce(env, token, "/offer/create", debateOfferPayload(debate));
  const offerId = Number(offer.id);
  created.offer_id = offerId;
  await setStep("context");
  const context = await createOnce(env, token, "/context/create", debateContextPayload(debate, offerId));
  const contextId = Number(context.id);
  created.context_id = contextId;

  await setStep("persona");
  const { voice, warning: voiceWarning } = await resolveVoice(env, token, debate);
  if (voiceWarning) warnings.push(voiceWarning);
  const persona = await createOnce(env, token, "/persona/create", debatePersonaPayload(debate, contextId, voice));
  const personaId = Number(persona.id);
  created.persona_id = personaId;
  created.voice = voice;

  await setStep("case_setup");
  const voiceV1 = pickVoiceV1(await listVoicesV1(env, token), debate.oponente_genero);
  const caseSetupId = await createCaseSetupRaw(
    env,
    token,
    debateCaseSetupPayload(debate, {
      contextId,
      callContextTypeId,
      difficulty,
      difficultyLevelId,
      methodologyId,
      voiceV1,
      userGroupId: draft.connections?.default_user_group_id ?? null,
    }),
    false,
  );
  created.case_setup_id = caseSetupId;
  // Nasce "Em desenvolvimento" (só quem criou e admins veem): com persona no contexto o
  // roleplay já entra no catálogo, e até o fim do envio ele ainda está no motor de venda
  // e sem conteúdo. O status escolhido entra no fim. Se o envio cair no meio, fica
  // escondido (revisão do 273, 08/11/2026).
  warnings.push(...(await applyRoleplayStatus(env, token, [caseSetupId], IN_DEVELOPMENT)).warnings);

  await setStep("step_knowledge");
  const stepBodies = debateStepKnowledgeInputs(debate, steps, personaId);
  for (const body of stepBodies) await createOnce(env, token, `/case_setup_${caseSetupId}/step_knowledge`, body);
  // O POST já perdeu `methodology_step_ids` (267, 28/10/2026): confere e refaz pelo PATCH.
  const links = await listStepKnowledgeLinks(env, token, caseSetupId);
  for (const body of stepBodies) {
    const row = links.find((r) => r.title === body.title);
    if (!row) {
      warnings.push(`conteúdo da etapa "${body.title}" não apareceu depois de criado`);
      continue;
    }
    if (JSON.stringify(row.methodology_step_ids) !== JSON.stringify(body.methodology_step_ids)) {
      await patchStepKnowledge(env, token, caseSetupId, row.id, { methodology_step_ids: body.methodology_step_ids });
    }
  }

  await setStep("objections");
  const objectionBodies = objectionTypeId != null
    ? debateObjectionInputs(debate, objectionTypeId, DIFFICULTY_LEVEL_IDS)
    : [];
  for (const body of objectionBodies) await createOnce(env, token, `/case_setup_${caseSetupId}/objections`, body);

  await setStep("guardrails");
  for (const g of debate.guardrails) {
    await createOnce(env, token, `/context_${contextId}/guardrails`, {
      name: g.nome.trim(),
      prompt: g.instrucao.trim(),
      rubrics: [],
    });
  }

  await setStep("feedback");
  try {
    await putCaseSetupFeedbackConfig(env, token, caseSetupId, debateFeedbackConfig(debate));
  } catch (e) {
    warnings.push(`configuração de feedback não aplicada: ${reason(e)}`);
  }

  // Motor 3 e persona por último: só agora existe tudo o que o motor de debate lê.
  await putCaseSetupFields(env, token, caseSetupId, {
    prompt_builder_engine_id: DEBATE_ENGINE_ID,
    persona_id: personaId,
  });
  const statusId = roleplayStatusIdFrom(draft.scenario);
  if (statusId !== IN_DEVELOPMENT) {
    try {
      // null = sem status (visível para todos), escolha explícita do rascunho.
      await patchCaseSetup(env, token, caseSetupId, { role_play_status_id: statusId });
    } catch (e) {
      warnings.push(`roleplay ficou "Em desenvolvimento" (status escolhido não aplicado): ${reason(e)}`);
    }
  }

  await setStep("agent");
  await runCaseSetupRepairStep(env, token, caseSetupId, "update_prompt");
  let elevenlabsAgentId: string | null = null;
  try {
    await runCaseSetupRepairStep(env, token, caseSetupId, "elevenlabs_agent");
    const raw = await getCaseSetupRaw(env, token, caseSetupId);
    elevenlabsAgentId = typeof raw.elevenlabs_agent_id === "string" ? raw.elevenlabs_agent_id : null;
  } catch (e) {
    warnings.push(`agente de voz não criado: ${reason(e)}`);
  }
  if (!elevenlabsAgentId) warnings.push("roleplay sem agente de voz: a chamada não abre até ele ser criado");

  return { caseSetupId, elevenlabsAgentId, personaId, warnings, created };
}
