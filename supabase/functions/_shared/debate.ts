/**
 * Roleplay de DEBATE: o aluno debate com uma oponente de IA da idade dele, a partir
 * de uma obra. Na Perfecting é o motor de prompt 3 (`prompt_builder/classes/debate.py`
 * no backend), que só lê:
 *  - a persona (nome, descrição, papel, personalidade e gênero, que dá a concordância);
 *  - o conteúdo por etapa da metodologia (regras de cada parte, primeiras falas, o que
 *    a oponente já sabe e o que o aluno lê antes de começar);
 *  - as objeções do roleplay e os guardrails do CONTEXTO.
 * Oferta, contexto, tipo de ligação e os campos de venda do case_setup existem só
 * porque o create exige; o motor de debate não os lê.
 *
 * Tudo aqui é puro (sem rede) e sem imports, porque o front importa este arquivo
 * direto (mesmo motivo do `buyer-text-lint.ts`): o envio está em `debate-export.ts`. Nasceu da montagem
 * à mão dos roleplays 266/267 (org 73, out/2026), quando o wizard "Criar roleplay"
 * gravava debate como venda (motor 1, sem persona, invisível na lista).
 */

export const DEBATE_ENGINE_ID = 3;

export type DebateSide = "contra" | "a_favor";
export type DebateGender = "feminino" | "masculino";

/** Tópico livre: vira uma entrada de dicionário na Perfecting (título → texto). */
export interface DebateTopic {
  titulo: string;
  texto: string;
}

export interface DebateStepDraft {
  /** Posição na metodologia de destino, a partir de 1. É ela que liga ao id da etapa. */
  ordem: number;
  /** Nome da etapa quando o material foi processado — só para conferir no envio. */
  nome: string;
  /** Como a oponente age nesta parte do debate (`knowledge_prompt_details`). */
  regras: DebateTopic[];
  /** O que o aluno deve mostrar nesta etapa (fecha o `prior_knowledge_user_instruction`). */
  foco_aluno: string;
  /** Falas com que a oponente abre esta etapa; o backend sorteia uma. */
  primeiras_falas: string[];
}

export interface DebateObjection {
  titulo: string;
  /** Como a oponente diz, em primeira pessoa. */
  fala_exemplo: string;
  /** Quando ela usa este contra-argumento (o que o aluno disse). */
  detalhes: string;
  /** Quando ela reconhece o ponto do aluno. */
  ceder_se: string;
}

export interface DebateGuardrail {
  nome: string;
  instrucao: string;
}

/** Módulos de avaliação do feedback (`feedback_processing_config.enabled_modules`). */
export const DEBATE_FEEDBACK_MODULES = [
  { key: "objections_evaluation", label: "Contra-argumentos" },
  { key: "seller_rubrics_evaluation", label: "Rubricas gerais" },
  { key: "methodology_rubrics_evaluation", label: "Metodologia" },
  { key: "offer_appropriateness_evaluation", label: "Oferta" },
  { key: "language_appropriateness_evaluation", label: "Linguagem" },
] as const;

export type DebateFeedbackModule = (typeof DEBATE_FEEDBACK_MODULES)[number]["key"];

/**
 * Debate não tem oferta para avaliar. Linguagem fica ligada: o módulo mede clareza e
 * vocabulário da fala, o que vale para o aluno. O 267 está com os cinco ligados; o
 * padrão aqui é a decisão de produto, editável no rascunho.
 */
export const DEFAULT_DEBATE_FEEDBACK: Record<DebateFeedbackModule, boolean> = {
  objections_evaluation: true,
  seller_rubrics_evaluation: true,
  methodology_rubrics_evaluation: true,
  offer_appropriateness_evaluation: false,
  language_appropriateness_evaluation: true,
};

/** O que o usuário fixa antes de processar: igual em todas as fatias da IA. */
export interface DebateAnchors {
  /** "Título", de Autor. */
  obra: string;
  tema: string;
  mocao: string;
  /** Lado do ALUNO: "contra" = ele contesta a moção; a oponente a sustenta. */
  lado_aluno: DebateSide;
  oponente_nome: string;
  oponente_idade: number;
  oponente_genero: DebateGender;
}

export interface DebateDraft extends DebateAnchors {
  titulo: string;
  /** O que o aluno lê no card do roleplay. */
  descricao: string;
  objetivo: string;
  palavras_chave: string;
  /** "uma aluna de 14 anos do 9º ano…" — entra como "Você é {nome}, {descrição}". */
  oponente_descricao: string;
  /** "Debatedora que sustenta a moção" — vira "Seu papel no debate". */
  oponente_papel: string;
  /** Vida, régua, caso, argumentos, pontos fracos e como o tom muda. */
  oponente_personalidade: string;
  /** O que a oponente já sabe antes de começar (igual em todas as etapas). */
  conhecimento_previo: string;
  /** Instrução ao aluno, comum a todas as etapas; cada etapa acrescenta o foco. */
  instrucao_aluno: string;
  /** Cartão que o aluno lê antes de começar (Moção, Seu lado, A oponente, Caso do livro). */
  briefing: DebateTopic[];
  criterios_sucesso: string[];
  etapas: DebateStepDraft[];
  objecoes: DebateObjection[];
  guardrails: DebateGuardrail[];
  feedback_modulos: Record<DebateFeedbackModule, boolean>;
  /** true = sem voz própria (o agente fala com a voz padrão do roleplay). */
  sem_voz?: boolean;
}

export interface MethodologyStepRef {
  id: number;
  name: string;
  order: number | null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Etapas do destino na ordem da conversa (ordem do catálogo; empate pelo id). */
export function sortSteps(steps: readonly MethodologyStepRef[]): MethodologyStepRef[] {
  return [...steps].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id) || a.id - b.id);
}

export function topicsToRecord(topics: readonly DebateTopic[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of topics) {
    const k = text(t.titulo);
    const v = text(t.texto);
    if (k && v) out[k] = v;
  }
  return out;
}

const cleanList = (items: readonly string[]) => items.map(text).filter(Boolean);

/**
 * O que impede o envio. Vazio = pode enviar. Mensagens em português, prontas para a
 * tela e para o 422 do envio.
 */
export function debateDraftIssues(d: DebateDraft, steps?: readonly MethodologyStepRef[]): string[] {
  const issues: string[] = [];
  const required: Array<[string, unknown]> = [
    ["obra", d.obra],
    ["tema", d.tema],
    ["moção", d.mocao],
    ["nome da oponente", d.oponente_nome],
    ["título", d.titulo],
    ["descrição da oponente", d.oponente_descricao],
    ["personalidade da oponente", d.oponente_personalidade],
    ["o que a oponente já sabe", d.conhecimento_previo],
  ];
  for (const [label, value] of required) if (!text(value)) issues.push(`falta ${label}`);
  if (!Number.isInteger(d.oponente_idade) || d.oponente_idade < 8 || d.oponente_idade > 99) {
    issues.push("idade da oponente inválida");
  }
  if (d.etapas.length === 0) issues.push("nenhuma etapa: processe o material com a metodologia escolhida");
  for (const e of d.etapas) {
    const label = `etapa ${e.ordem} (${e.nome || "sem nome"})`;
    if (Object.keys(topicsToRecord(e.regras)).length === 0) issues.push(`${label}: sem regra da oponente`);
    if (cleanList(e.primeiras_falas).length === 0) issues.push(`${label}: sem primeira fala`);
  }
  const ordens = d.etapas.map((e) => e.ordem);
  if (new Set(ordens).size !== ordens.length) issues.push("duas etapas com a mesma ordem");
  if (steps) {
    const sorted = sortSteps(steps);
    if (sorted.length !== d.etapas.length) {
      issues.push(
        `a metodologia no destino tem ${sorted.length} etapa(s) e o rascunho tem ${d.etapas.length}: processe de novo`,
      );
    }
    for (const e of d.etapas) {
      if (e.ordem < 1 || e.ordem > sorted.length) issues.push(`etapa ${e.ordem} não existe no destino`);
    }
  }
  d.objecoes.forEach((o, i) => {
    if (!text(o.titulo) || !text(o.fala_exemplo) || !text(o.ceder_se)) {
      issues.push(`contra-argumento ${i + 1}: precisa de título, fala e quando ceder`);
    }
  });
  d.guardrails.forEach((g, i) => {
    if (!text(g.nome) || !text(g.instrucao)) issues.push(`regra ${i + 1}: precisa de nome e instrução`);
  });
  return issues;
}

export const genderIdFor = (g: DebateGender) => (g === "feminino" ? 2 : 1);

/** "a favor"/"contra" na voz de quem sustenta. */
export function opponentSideLabel(d: DebateAnchors): string {
  return d.lado_aluno === "contra" ? "sustenta a moção" : "contesta a moção";
}

/**
 * Oferta da Perfecting. O motor de debate não lê a oferta, mas o create exige os
 * campos (HML valida cada um como string). Texto curto e verdadeiro, montado sem IA.
 */
export function debateOfferPayload(d: DebateDraft): Record<string, string> {
  const obra = text(d.obra);
  const tema = text(d.tema);
  const general = `Treino de debate oral, um contra um, sobre ${obra}, no tema "${tema}". Moção: ${text(d.mocao)}`;
  return {
    offer_name: `Debate · ${tema}`.slice(0, 120),
    general_description: general,
    target_audience_description: `Alunos que leram ${obra} e treinam debate.`,
    target_industries_or_domains: "Educação · debate literário",
    primary_problem_solved: "Praticar argumentação oral com prova da obra e da vida.",
    core_value_proposition: "Debater com uma oponente da mesma idade que exige exemplo e reconhece o bom argumento.",
    key_features_and_benefits: "Uma rodada por critério da metodologia, com feedback no fim.",
    unique_selling_points: "Oponente de IA fiel à obra.",
    competitive_differentiation: "Treino individual, sem mediador.",
    delivery_method: "Conversa por voz na plataforma.",
    implementation_onboarding_process: "O aluno escolhe a etapa e começa.",
    customer_support_model: "Professor responsável pela turma.",
    pricing_details_summary: "Não se aplica.",
    url: "",
  };
}

/** Contexto da Perfecting: idem oferta (o create exige; o motor de debate não lê). */
export function debateContextPayload(d: DebateDraft, offerId: number): Record<string, unknown> {
  const nome = text(d.oponente_nome);
  return {
    offer_id: offerId,
    name: `${nome} · ${text(d.tema)}`.slice(0, 120),
    target_description: `${nome}, ${text(d.oponente_descricao)}`,
    compelling_events: `Inscreveu-se como voluntária num treino de debate sobre ${text(d.obra)}.`,
    strategic_priorities: `Manter de pé o lado que ${opponentSideLabel(d)}: ${text(d.mocao)}`,
    quantifiable_pain_points: "Não se aplica: é um debate, não uma compra.",
    desired_future_state: "Terminar o debate com os seus argumentos de pé, reconhecendo o que não conseguir rebater.",
    primary_value_drivers: "Exemplos fiéis da obra e situações da vida.",
    typical_decision_making_process: "Reconhece um ponto quando não tem mais contra-argumento.",
    risk_aversion_level: "Médio.",
    persona_objections_and_concerns: d.objecoes.map((o) => text(o.titulo)).filter(Boolean).join("; ") || "—",
    persona_awareness_of_the_problem: "Alta: leu a obra.",
    persona_awareness_of_the_solutions: "Não se aplica.",
    persona_existing_solutions: "Não se aplica.",
  };
}

export interface DebateVoice {
  /** persona_voices_v2.id — a voz da persona. */
  voiceId: number | null;
  avatarId: number | null;
}

/** Persona da Perfecting: é ela que o motor de debate lê. */
export function debatePersonaPayload(
  d: DebateDraft,
  contextId: number,
  voice: DebateVoice,
): Record<string, unknown> {
  return {
    context_id: contextId,
    name: text(d.oponente_nome),
    description: text(d.oponente_descricao),
    job_title: text(d.oponente_papel) || `Debatedora que ${opponentSideLabel(d)}`,
    persona_prompt: text(d.oponente_personalidade),
    gender_id: genderIdFor(d.oponente_genero),
    // 1 = child no catálogo (`public.age_group`): é a faixa das vozes e avatares
    // adolescentes. Acima de 17 anos, young.
    age_group_id: d.oponente_idade <= 17 ? 1 : 2,
    voice_id: d.sem_voz ? null : voice.voiceId,
    ...(voice.avatarId != null && !d.sem_voz ? { persona_avatar_id: voice.avatarId } : {}),
  };
}

export interface VoiceV1 {
  id: number;
  gender_id: number | null;
  voice_model_id: string;
}

/** Voz v1 do case_setup (o create exige; HML recusa sem `persona_voice_model_id`). */
export function pickVoiceV1(voices: readonly VoiceV1[], gender: DebateGender): VoiceV1 | null {
  const genderId = genderIdFor(gender);
  return voices.find((v) => v.gender_id === genderId) ?? voices[0] ?? null;
}

export interface VoiceV2 {
  id: number;
  gender_id: number | null;
  age_group_id: number | null;
}
export interface AvatarRef {
  id: number;
  gender_id: number | null;
  age_group_id: number | null;
  is_active: boolean;
}
export interface AvatarVoiceLink {
  persona_avatar_id: number;
  persona_voice_v2_id: number;
}

/**
 * Voz e avatar da oponente: avatar ativo da faixa e do gênero dela que tenha voz
 * vinculada (a foto vem do vínculo); sem avatar, só uma voz da faixa e do gênero;
 * sem nenhum dos dois, sem voz (o agente usa a voz padrão do roleplay).
 * `links` = vínculos dos avatares candidatos, na ordem em que foram consultados.
 */
export function pickDebateVoice(
  d: Pick<DebateDraft, "oponente_genero" | "oponente_idade">,
  avatars: readonly AvatarRef[],
  links: readonly AvatarVoiceLink[],
  voices: readonly VoiceV2[],
): DebateVoice {
  const genderId = genderIdFor(d.oponente_genero);
  const voiceOk = (id: number) => voices.some((v) => v.id === id && v.gender_id === genderId);
  for (const a of debateAvatarCandidates(d, avatars)) {
    const link = links.find((l) => l.persona_avatar_id === a.id && voiceOk(l.persona_voice_v2_id));
    if (link) return { voiceId: link.persona_voice_v2_id, avatarId: a.id };
  }
  for (const ageGroup of debateAgeGroups(d.oponente_idade)) {
    const voice = voices.find((v) => v.gender_id === genderId && v.age_group_id === ageGroup);
    if (voice) return { voiceId: voice.id, avatarId: null };
  }
  return { voiceId: null, avatarId: null };
}

/**
 * Faixas de idade aceitas, na ordem de preferência. Adolescente aceita child (1) e,
 * na falta, young (2): a Manuela dos roleplays 267/273 usa a Keren, que é young.
 */
export function debateAgeGroups(idade: number): number[] {
  return idade <= 17 ? [1, 2] : [2, 3];
}

/** Avatares que valem a consulta de vínculo (ativos, do gênero, da faixa preferida antes). */
export function debateAvatarCandidates(
  d: Pick<DebateDraft, "oponente_genero" | "oponente_idade">,
  avatars: readonly AvatarRef[],
): AvatarRef[] {
  const genderId = genderIdFor(d.oponente_genero);
  return debateAgeGroups(d.oponente_idade).flatMap((ageGroup) =>
    avatars.filter((a) => a.is_active && a.gender_id === genderId && a.age_group_id === ageGroup),
  );
}

/**
 * Payload do `case_setup/create`. Vai com `?generate_case_prompt=false`: o prompt de
 * debate só existe depois do motor 3, da persona e do conteúdo por etapa, e quem o
 * monta é o `unitary_cycle/update_case_prompt` no fim do envio. Os campos de venda
 * vão vazios porque o create os exige e o motor de debate não os lê.
 */
export function debateCaseSetupPayload(
  d: DebateDraft,
  args: {
    contextId: number;
    callContextTypeId: number;
    difficulty: "easy" | "medium" | "hard";
    difficultyLevelId: number;
    methodologyId: number;
    voiceV1: VoiceV1 | null;
    userGroupId: number | null;
  },
): Record<string, unknown> {
  const firstStep = [...d.etapas].sort((a, b) => a.ordem - b.ordem)[0];
  return {
    context_id: args.contextId,
    call_context_type_id: args.callContextTypeId,
    training_name: text(d.titulo),
    training_description: text(d.descricao),
    training_keywords: text(d.palavras_chave),
    training_objective: text(d.objetivo),
    training_targeted_sales_skills: ["argumentação", "uso de exemplos da obra", "escuta ativa"],
    scenario_difficulty_level: args.difficulty,
    difficulty_level_id: args.difficultyLevelId,
    methodology_ids: [args.methodologyId],
    buyer_agent_instructions: [],
    buyer_prior_knowledge: text(d.conhecimento_previo) ? [text(d.conhecimento_previo)] : [],
    buyer_agent_initial_tone_and_mood: "",
    // O agente da ElevenLabs nasce com a primeira destas como exemplo de abertura.
    buyer_agent_first_messages: cleanList(firstStep?.primeiras_falas ?? []),
    buyer_agent_success_criteria: [],
    salesperson_instructions: text(d.instrucao_aluno) ? [text(d.instrucao_aluno)] : [],
    salesperson_desired_tone_and_mood: "",
    salesperson_desired_behaviors: [],
    salesperson_undesired_behaviors: [],
    salesperson_success_criteria: cleanList(d.criterios_sucesso),
    salesperson_evaluation_rubric_criteria: [],
    company_profile: { name: text(d.obra), description: `Debate sobre ${text(d.obra)}, tema "${text(d.tema)}".` },
    persona_profile: {
      name: text(d.oponente_nome),
      age: d.oponente_idade,
      gender_id: genderIdFor(d.oponente_genero),
      job_title: text(d.oponente_papel),
      description: text(d.oponente_descricao),
    },
    persona_voice_id: args.voiceV1?.id ?? 1,
    persona_voice_model_id: args.voiceV1?.voice_model_id ?? null,
    successful_sale_dialogues_examples: [],
    unsuccessful_sale_dialogues_examples: [],
    ...(args.userGroupId != null ? { user_group_id: args.userGroupId } : {}),
  };
}

/**
 * Conteúdo por etapa, um por etapa do destino. A etapa liga pela ORDEM, não pelo id:
 * id de etapa é por ambiente, e o rascunho pode ir para outra conta.
 */
export function debateStepKnowledgeInputs(
  d: DebateDraft,
  steps: readonly MethodologyStepRef[],
  personaId: number,
): Array<Record<string, unknown> & { methodology_step_ids: number[] }> {
  const sorted = sortSteps(steps);
  const briefing = topicsToRecord(d.briefing);
  return [...d.etapas]
    .sort((a, b) => a.ordem - b.ordem)
    .filter((e) => e.ordem >= 1 && e.ordem <= sorted.length)
    .map((e) => {
      const step = sorted[e.ordem - 1];
      const foco = text(e.foco_aluno);
      const base = text(d.instrucao_aluno);
      return {
        title: `${step.name} — ${text(d.oponente_nome)}`,
        persona_id: personaId,
        methodology_step_ids: [step.id],
        prior_knowledge_prompt: text(d.conhecimento_previo) || null,
        knowledge_prompt_details: topicsToRecord(e.regras),
        prior_knowledge_user_instruction:
          [base, foco ? `Foco desta etapa: ${foco}` : ""].filter(Boolean).join(" ") || null,
        prior_knowledge_user_briefing: Object.keys(briefing).length > 0 ? briefing : null,
        buyer_agent_first_messages: cleanList(e.primeiras_falas),
      };
    });
}

/**
 * Objeções do roleplay nos três níveis: o prompt só traz a objeção com o MESMO nível da
 * chamada, e o aluno escolhe o nível na pré-chamada. Escopo do case_setup (não do
 * contexto), sem persona e sem metodologia, como no 267.
 */
export function debateObjectionInputs(
  d: DebateDraft,
  objectionTypeId: number,
  difficultyLevelIds: readonly number[],
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const level of difficultyLevelIds) {
    for (const o of d.objecoes) {
      out.push({
        title: text(o.titulo),
        description: text(o.fala_exemplo),
        details: text(o.detalhes),
        to_give_in_if: text(o.ceder_se),
        objection_type_id: objectionTypeId,
        difficulty_level_id: level,
        methodology_id: null,
        persona_id: null,
      });
    }
  }
  return out;
}

/** Tipo de objeção do debate: "Confiança / Credibilidade" (pedir prova), senão o primeiro. */
export function pickObjectionTypeId(types: ReadonlyArray<{ id: number; slug: string }>): number | null {
  return (types.find((t) => t.slug === "confianca-credibilidade") ?? types[0])?.id ?? null;
}

/** Tipo de ligação: o motor de debate ignora, o create exige. Discovery, senão o primeiro. */
export function pickDebateCallContextId(
  contexts: ReadonlyArray<{ id: number; slug: string }>,
): number | null {
  const preferred = contexts.find((c) => /discovery|qualificacao/.test(c.slug));
  return (preferred ?? contexts[0])?.id ?? null;
}

export function debateFeedbackConfig(d: DebateDraft): { enabled_modules: Record<string, boolean> } {
  return { enabled_modules: { ...DEFAULT_DEBATE_FEEDBACK, ...(d.feedback_modulos ?? {}) } };
}

/** Rascunho vazio a partir das âncoras e das etapas do destino. */
export function emptyDebateDraft(a: DebateAnchors, steps: readonly MethodologyStepRef[]): DebateDraft {
  return {
    ...a,
    titulo: "",
    descricao: "",
    objetivo: "",
    palavras_chave: "",
    oponente_descricao: "",
    oponente_papel: "",
    oponente_personalidade: "",
    conhecimento_previo: "",
    instrucao_aluno: "",
    briefing: [],
    criterios_sucesso: [],
    etapas: sortSteps(steps).map((s, i) => ({
      ordem: i + 1,
      nome: s.name,
      regras: [],
      foco_aluno: "",
      primeiras_falas: [],
    })),
    objecoes: [],
    guardrails: [],
    feedback_modulos: { ...DEFAULT_DEBATE_FEEDBACK },
  };
}

/**
 * Junta a saída das fatias da IA ao rascunho. A IA não decide âncora nem etapa: nome,
 * moção e lado vêm do usuário, e a etapa só entra se a ordem existir no rascunho.
 */
export function mergeDebateAiResult(base: DebateDraft, ai: Record<string, unknown>): DebateDraft {
  const str = (k: string, fallback: string) => (typeof ai[k] === "string" ? (ai[k] as string) : fallback);
  const topics = (v: unknown): DebateTopic[] =>
    Array.isArray(v)
      ? v
          .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
          .map((t) => ({ titulo: String(t.titulo ?? ""), texto: String(t.texto ?? "") }))
      : [];
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")) : []);
  const aiSteps = Array.isArray(ai.etapas)
    ? (ai.etapas as Array<Record<string, unknown>>).filter((s) => s && typeof s === "object")
    : [];
  const etapas = base.etapas.map((e) => {
    const got = aiSteps.find((s) => Number(s.ordem) === e.ordem);
    if (!got) return e;
    return {
      ...e,
      regras: topics(got.regras),
      foco_aluno: String(got.foco_aluno ?? ""),
      primeiras_falas: strings(got.primeiras_falas),
    };
  });
  const objecoes = Array.isArray(ai.objecoes)
    ? (ai.objecoes as Array<Record<string, unknown>>).map((o) => ({
        titulo: String(o.titulo ?? ""),
        fala_exemplo: String(o.fala_exemplo ?? ""),
        detalhes: String(o.detalhes ?? ""),
        ceder_se: String(o.ceder_se ?? ""),
      }))
    : base.objecoes;
  const guardrails = Array.isArray(ai.guardrails)
    ? (ai.guardrails as Array<Record<string, unknown>>).map((g) => ({
        nome: String(g.nome ?? ""),
        instrucao: String(g.instrucao ?? ""),
      }))
    : base.guardrails;
  return {
    ...base,
    titulo: str("titulo", base.titulo),
    descricao: str("descricao", base.descricao),
    objetivo: str("objetivo", base.objetivo),
    palavras_chave: str("palavras_chave", base.palavras_chave),
    oponente_descricao: str("oponente_descricao", base.oponente_descricao),
    oponente_papel: str("oponente_papel", base.oponente_papel),
    oponente_personalidade: str("oponente_personalidade", base.oponente_personalidade),
    conhecimento_previo: str("conhecimento_previo", base.conhecimento_previo),
    instrucao_aluno: str("instrucao_aluno", base.instrucao_aluno),
    briefing: "briefing" in ai ? topics(ai.briefing) : base.briefing,
    criterios_sucesso: "criterios_sucesso" in ai ? strings(ai.criterios_sucesso) : base.criterios_sucesso,
    etapas,
    objecoes,
    guardrails,
  };
}

/**
 * Todo texto que a oponente diz ou sabe, no formato do `buyer-text-lint` (`onde`,
 * `text`): quem chama passa por `findReservedTerms`. Os contra-argumentos entram
 * campo a campo, como o `objectionTexts` de lá.
 */
export function debateBuyerTexts(d: DebateDraft): Array<{ onde: string; text: string }> {
  const out: Array<{ onde: string; text: string }> = [
    { onde: "personalidade da oponente", text: d.oponente_personalidade },
    { onde: "descrição da oponente", text: d.oponente_descricao },
    { onde: "o que a oponente já sabe", text: d.conhecimento_previo },
  ];
  for (const e of d.etapas) {
    for (const r of e.regras) out.push({ onde: `etapa ${e.ordem}: ${r.titulo}`, text: r.texto });
    e.primeiras_falas.forEach((f, i) => out.push({ onde: `etapa ${e.ordem}: primeira fala ${i + 1}`, text: f }));
  }
  d.guardrails.forEach((g) => out.push({ onde: `regra "${g.nome}"`, text: g.instrucao }));
  for (const o of d.objecoes) {
    for (const k of ["titulo", "fala_exemplo", "detalhes", "ceder_se"] as const) {
      out.push({ onde: `contra-argumento "${o.titulo}" (${k})`, text: o[k] });
    }
  }
  return out.filter((t) => text(t.text));
}
