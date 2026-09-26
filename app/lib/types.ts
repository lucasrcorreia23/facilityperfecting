/** Tipos do domínio do produto (espelham o schema Postgres em supabase/migrations). */

/**
 * "completing" = o roleplay existe na Perfecting, mas o fechamento (rubricas,
 * conteúdo por etapa, comportamento) ainda está rodando.
 * "incomplete" = fechou faltando algo no prompt do comprador. Não é erro: o
 * roleplay é utilizável, só está pior do que o envio prometeu.
 */
export type DraftStatus =
  | "draft"
  | "exporting"
  | "completing"
  | "exported"
  | "incomplete"
  | "error";
export type SourceType = "paste" | "file";
export type ExportJobState = "queued" | "running" | "done" | "error";
export type ExportStep = "offer" | "context" | "context_content" | "persona" | "case_setup";

export interface Connection {
  id: string;
  environment: string; // 'hml' | 'prod'
  org_id: number;
  org_name: string | null;
  target_user_id: number | null;
  default_user_group_id: number | null;
  created_at: string;
}

export interface Source {
  id: string;
  type: SourceType;
  raw_text: string | null;
  file_path: string | null;
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  offer_name: string;
  general_description: string;
  url: string | null;
  source_id: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Context {
  id: string;
  offer_id: string;
  name: string | null;
  target_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** "playbook" = a jornada inteira do playbook (1 roleplay por etapa). */
export type GenerationMode = "methodology" | "playbook";

export interface ScenarioConfig {
  call_context_slug?: string | null;
  difficulty?: string | null;
  skill?: string | null;
  objective?: string | null;
  aditional_instructions?: string | null;
  // Modo playbook: call_context/dificuldade/instruções acima não se aplicam —
  // vêm das etapas do playbook.
  generation_mode?: GenerationMode | null;
  playbook_id?: number | null;
  playbook_name?: string | null;
  // Modo playbook, múltiplas personas: 1..10 (default 1 = comportamento antigo,
  // uma persona travada em todas as etapas). > 1 gera um lote no contexto ANTES
  // da implementação e as etapas nascem genéricas (persona_id NULL) — o vendedor
  // escolhe qual enfrentar na hora da call.
  persona_count?: number | null;
  /** Grounding livre repassado ao lote (additional_instructions da API). */
  persona_instructions?: string | null;
  /**
   * PlaybookCallType.id das etapas que devem ficar travadas numa persona só (a
   * primeira do contexto). As não listadas ficam genéricas — aceitam qualquer
   * persona. Só tem efeito com persona_count > 1.
   */
  fixed_persona_call_type_ids?: number[] | null;
  /**
   * Objeções e guardrails do material, criados no contexto da Perfecting no envio.
   * Guardrails vão para o contexto nos dois modos. Objeções: no contexto por
   * metodologia; no modo playbook, no roleplay de cada etapa (ver objection_steps).
   */
  objections?: ObjectionSeed[] | null;
  guardrails?: GuardrailSeed[] | null;
  /**
   * Modo playbook: em quais etapas cada objeção entra, decidido pela IA no envio
   * (implement-playbook, estágio assign_objection_steps). Chave = playbook_call_type_id.
   */
  objection_steps?: {
    playbook_id: number;
    call_types: Record<string, string[]>;
    assigned_at: string;
  } | null;
  // Payload de case_setup escrito à mão. Em produção o export manda VERBATIM.
  // Em HML, se faltar company_profile/persona_profile/persona_voice_model_id,
  // completa via /generate e sobrepõe só training_* / instruções.
  case_setup_payload?: Record<string, unknown> | null;
  /** Modo metodologia: o comprador concreto do material (dores × portfólio). */
  dossier?: RoleplayDossier | null;
}

// ── Dossiê do comprador (espelha supabase/functions/_shared/dossier.ts) ──

export type DossierRevealLevel = "superficie" | "sondada" | "oculta";

export interface DossierProduct {
  nome: string;
  descricao: string;
  problema_resolvido: string;
  beneficios: string;
}

export interface DossierPain {
  titulo: string;
  descricao: string;
  /** Nome do produto principal que resolve a dor; "" = sem produto. */
  produto: string;
}

export interface DossierTopic {
  titulo: string;
  texto: string;
}

export interface RoleplayDossier {
  produtos: DossierProduct[];
  dores: DossierPain[];
  persona: {
    nome: string;
    genero: "masculino" | "feminino" | "";
    cargo: string;
    area: string;
    empresa_nome: string;
    empresa_perfil: string;
    prompt: string;
    dores: Array<{ dor: string; revelacao: DossierRevealLevel; detalhe: string }>;
    produtos: Array<{ produto: string; postura: string }>;
  };
  conhecimento: { previo: string; fatos: DossierTopic[]; briefing: DossierTopic[] };
  abertura: string[];
  rubricas: Array<{ criterio: string; descricao: string; dica: string }>;
}

export interface CallContextType {
  id: number;
  name: string;
  slug: string;
  group: string;
  stage?: string;
}

/** Playbook como existe NA CONTA da Perfecting (retornado por GET /playbook/list). */
export interface Playbook {
  id: number;
  name: string;
  playbook_status_id: number | null;
}

export interface Methodology {
  id: number;
  name: string;
  slug: string;
  description: string;
  application_case: string;
}

// ── Fechamento do roleplay avulso (espelha _shared/roleplay-completion.ts) ──

export type CompletionStepName =
  | "methodology"
  | "rubrics"
  | "step_knowledge"
  | "dossier"
  | "behavior_guidance"
  | "update_prompt";

export interface CompletionStepState {
  status: "pending" | "running" | "done" | "skipped" | "failed";
  attempts: number;
  started_at?: string | null;
  finished_at?: string | null;
  detail?: unknown;
}

/** Flags do prompt que o comprador vai usar, remontado pela Perfecting. */
export interface RolePlayPromptGate {
  case_setup_id: number;
  prompt: string;
  has_persona: boolean;
  has_persona_company: boolean;
  has_tone: boolean;
  has_behavior_guidance: boolean;
  has_prior_knowledge: boolean;
  has_conversation_history: boolean;
  has_knowledge_blocks: boolean;
  has_objections: boolean;
  has_difficulty_level: boolean;
  persona_randomly_selected: boolean;
}

export interface CompletionRun {
  case_setup_id: number;
  context_id?: number | null;
  persona_id?: number | null;
  methodology_id?: number | null;
  methodology_slug?: string | null;
  difficulty_level_id?: number | null;
  objections_seeded?: boolean;
  stage?: CompletionStepName | "queued" | "pre_gate" | "gate" | "done";
  steps: Partial<Record<CompletionStepName, CompletionStepState>>;
  gate?: RolePlayPromptGate | null;
  /** O que não entrou no prompt do comprador. Vazio = roleplay completo. */
  missing?: string[];
  warnings?: string[];
  attempt_round?: number;
  started_at: string;
  finished_at?: string | null;
}

/** Etapa do playbook — cada uma vira um roleplay na implementação. */
export interface PlaybookCallType {
  id: number;
  name: string;
  description: string | null;
  order: number | null;
  call_context_type_id: number | null;
}

/** Progresso e resultado da implementação por playbook (roleplay_drafts.playbook_run). */
export interface PlaybookRun {
  playbook_id?: number;
  playbook_name?: string | null;
  job_id?: string | number | null;
  stage?: string;
  call_type_index?: number | null;
  call_type_total?: number | null;
  started_at?: string;
  finished_at?: string | null;
  context_id?: number;
  /** @deprecated drafts anteriores ao modo multi-persona — leia via runPersonaIds(). */
  persona_id?: number | null;
  /** Todas as personas do contexto ao final do estágio de personas (1 ou mais). */
  persona_ids?: number[];
  persona_names?: string[];
  /** Persona usada nas etapas marcadas como "persona fixa" (a 1ª do contexto). */
  primary_persona_id?: number | null;
  /** Quantas personas a Criação pediu (eco de scenario.persona_count). */
  personas_requested?: number | null;
  /** job_id do lote de personas (batch_started), telemetria. */
  persona_job_id?: string | number | null;
  /** Progresso do lote de personas — item i/N (empresa ou persona), não etapa. */
  item_index?: number | null;
  item_total?: number | null;
  before_case_setup_ids?: number[];
  case_setup_ids?: number[];
  /** Etapas que devem travar na persona principal (eco do scenario). */
  fixed_call_type_ids?: number[];
  /** playbook_call_type_id → case_setup_id criado. Sobrevive à queda do processo. */
  call_type_case_setups?: Record<string, number>;
  /** case_setups já travados — permite o poll retomar sem repetir. */
  locked_case_setup_ids?: number[];
  /** Avisos não-fatais (ex.: persona fixa não aplicada numa etapa). */
  warnings?: string[];
  /** Quantas objeções/guardrails do material foram criados no contexto. */
  context_content?: {
    objections_created: number;
    objections_skipped: number;
    guardrails_created: number;
    guardrails_skipped: number;
  };
  /** Objeções do material criadas no roleplay de cada etapa (não no contexto). */
  step_objections?: {
    state: "waiting_assignment" | "done";
    objections_created?: number;
    objections_skipped?: number;
    /** Objeções que a IA não encaixou em etapa nenhuma. */
    unassigned?: string[];
  };
  /** Lote avulso de personas num rascunho já exportado (ação "Adicionar personas"). */
  persona_topup?: PersonaTopUp;
  results?: unknown[];
}

/**
 * Quais personas um roleplay aceita, lido de `GET /persona/catalog` (o mesmo que
 * a pré-chamada da Perfecting usa para montar o seletor de persona).
 */
export interface CaseSetupPersonas {
  case_setup_id: number;
  training_name: string | null;
  /** true = travado nesta persona só; false = genérico (aceita todas do contexto). */
  has_specific_persona: boolean;
  personas: Array<{ id: number; name: string | null }>;
}

/** Estado do lote avulso de personas disparado depois do envio. */
export interface PersonaTopUp {
  requested?: number;
  stage?: string;
  item_index?: number | null;
  item_total?: number | null;
  started_at?: string;
  finished_at?: string | null;
  error?: string | null;
}

/**
 * Ids de persona de um run, tolerante a drafts anteriores ao modo multi-persona
 * (jsonb livre, sem migration possível: `persona_id` singular convive com
 * `persona_ids` plural indefinidamente).
 */
export function runPersonaIds(run: PlaybookRun | null | undefined): number[] {
  if (!run) return [];
  if (run.persona_ids && run.persona_ids.length > 0) return run.persona_ids;
  return typeof run.persona_id === "number" ? [run.persona_id] : [];
}

// ── Playbooks autorados aqui (tabelas locais), antes de virarem playbook na conta ──

export type PlaybookDraftStatus =
  | "draft"
  | "generating"
  | "ready"
  | "exporting"
  | "exported"
  | "error";

/** O que já foi criado no destino — base da idempotência do reenvio. */
export interface PlaybookExportRun {
  connection_id?: string;
  perfecting_playbook_id?: number;
  call_types?: Record<string, number>;
  call_blocks?: Record<string, number>;
  finished_at?: string | null;
}

export interface PlaybookDraft {
  id: string;
  name: string;
  input_files: TrailInputFile[];
  input_text: string | null;
  prompt_override: string | null;
  status: PlaybookDraftStatus;
  error_detail: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  export_run: PlaybookExportRun | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Etapa da jornada — vira um PlaybookCallType na conta (e um roleplay depois). */
export interface PlaybookDraftCallType {
  id: string;
  playbook_id: string;
  position: number;
  name: string;
  description: string | null;
  call_context_slug: string | null;
  methodology_slug: string | null;
  created_at: string;
  updated_at: string;
}

/** Subetapa — vira um PlaybookCallBlock na conta. */
export interface PlaybookDraftCallBlock {
  id: string;
  call_type_id: string;
  position: number;
  name: string;
  description: string | null;
  objective: string | null;
  sample_questions: string[];
  what_to_do: string[];
  what_to_avoid: string[];
  created_at: string;
  updated_at: string;
}

export interface PlaybookDraftCallTypeWithBlocks extends PlaybookDraftCallType {
  playbook_call_blocks: PlaybookDraftCallBlock[];
}

export interface PlaybookDraftDetail extends PlaybookDraft {
  playbook_call_types: PlaybookDraftCallTypeWithBlocks[];
}

export interface ImportGap {
  item: string;
  severidade: "critico" | "importante" | "opcional";
  grupo: string;
}

/**
 * Objeção extraída do material — criada no CONTEXTO da Perfecting e herdada por todos
 * os roleplays daquele contexto. `ceder_se` é o que dá desfecho ao treino: sem ela o
 * comprador simulado repete a objeção indefinidamente.
 */
export interface ObjectionSeed {
  titulo: string;
  /** slug de `/objection_types` (preço, timing, autoridade…). */
  tipo: string;
  fala_exemplo: string;
  detalhes: string;
  ceder_se: string;
}

/** Regra de comportamento do comprador simulado, criada no contexto. */
export interface GuardrailSeed {
  nome: string;
  instrucao: string;
}

export interface ProcessImportResult {
  oferta_nome: string;
  /** Descrição da oferta só com o lado do comprador — vira `offers.general_description`. */
  oferta_descricao?: string;
  /** Instrução do CONTEXTO (não de uma persona): é dele que a Perfecting gera as personas. */
  perfil: string;
  /** Como as personas devem variar entre si — vira `scenario.persona_instructions`. */
  personas_variacao?: string;
  /** Objeções e guardrails do material — usados nos dois modos (context-wide). */
  objecoes?: ObjectionSeed[];
  guardrails?: GuardrailSeed[];
  lacunas: ImportGap[];
  /**
   * Ignorados no modo playbook (vêm das etapas) — e, por isso, nem são pedidos à
   * IA quando o processamento já sabe que o destino é playbook. Opcionais: vêm
   * ausentes nesse caso.
   */
  call_context_slug?: string;
  dificuldade?: string;
  cenario_instrucoes?: string;
  objetivo?: string;
  habilidades?: string;
  /** Só por metodologia; vazio quando o material não descreve um comprador concreto. */
  dossie?: RoleplayDossier;
}

export interface RoleplayDraft {
  id: string;
  offer_id: string;
  context_id: string | null;
  connection_id: string | null;
  scenario: ScenarioConfig;
  title: string | null;
  status: DraftStatus;
  perfecting_case_setup_id: number | null;
  elevenlabs_agent_id: string | null;
  // Modo playbook: N roleplays num rascunho só (perfecting_case_setup_id guarda
  // o primeiro, por compatibilidade; a lista completa fica aqui).
  playbook_run: PlaybookRun | null;
  /** Modo metodologia: progresso e veredito do fechamento (complete-roleplay). */
  completion_run: CompletionRun | null;
  error_detail: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Linha enriquecida para a Biblioteca (join com offer/connection). */
export interface DraftRow extends RoleplayDraft {
  offer: Pick<Offer, "id" | "offer_name"> | null;
  connection: Pick<Connection, "id" | "org_name" | "org_id" | "environment"> | null;
}

export interface ExportJob {
  id: string;
  draft_id: string;
  state: ExportJobState;
  step: ExportStep | null;
  attempts: number;
  error_detail: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface AppSettings {
  id: string;
  default_difficulty: string | null;
  default_call_context_slug: string | null;
  /** Metodologia padrão dos envios avulsos — slug, resolvido no ambiente de destino. */
  default_methodology_slug: string | null;
  environment: string;
  default_user_group_id: number | null;
  weight_prompt: number;
  weight_roteiro: number;
  weight_teste: number;
  eval_weights?: EvalWeights;
}

/** Pesos dos critérios do IPR (somam 1). */
export interface CriteriaWeights {
  weight_prompt: number;
  weight_roteiro: number;
  weight_teste: number;
}

// ── Prontidão (IPR) ────────────────────────────────────────────────────────
export type ReadinessStatus = "nao_iniciado" | "em_andamento" | "bloqueado" | "pronto";

export interface TrackingClient {
  id: string;
  name: string;
  weight_prompt: number;
  weight_roteiro: number;
  weight_teste: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RoundStatus = "aberto" | "fechado";

export interface EvaluationRound {
  id: string;
  client_id: string;
  name: string;
  position: number;
  status: RoundStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleplayReadiness {
  id: string;
  client_id: string;
  round_id: string;
  /** Linhagem entre rounds: aponta para o roleplay raiz (null nas linhas raiz). */
  origin_readiness_id: string | null;
  name: string;
  persona: string | null;
  score_prompt: number;
  score_roteiro: number;
  score_teste: number;
  note_prompt: string | null;
  note_roteiro: string | null;
  note_teste: string | null;
  status: ReadinessStatus;
  responsavel: string | null;
  observacoes: string | null;
  roteiro: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Trilhas (planos de trilhas de roleplay) ────────────────────────────────

export type MethodologySourceStatus = "pending" | "fetched" | "error";

export interface MethodologySource {
  id: string;
  title: string;
  url: string;
  content: string | null;
  status: MethodologySourceStatus;
  error_detail: string | null;
  fetched_at: string | null;
  enabled: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TrailPlanStatus =
  | "draft"
  | "extracting"
  | "analyzing"
  | "analyzed"
  | "planning"
  | "ready"
  | "error";

export interface TrailInputFile {
  name: string;
  path: string | null;
  chars: number;
}

/** Skill gap identificado na etapa 1 (frequência × impacto). */
export interface SkillGap {
  skill: string;
  categoria: string;
  frequencia: number; // 1..5
  impacto: number; // 1..5
  score: number; // frequencia × impacto
  evidencias: string[];
  vendedores_afetados: string[];
}

/** Radar de competências de um vendedor (etapa 1). */
export interface RadarEntry {
  vendedor: string;
  cargo: string;
  categorias: { nome: string; score: number }[]; // score 0..10
}

export interface TrailPlan {
  id: string;
  client_name: string;
  sales_methodology: string | null;
  additional_context: string | null;
  seller_count: number | null;
  website_url: string | null;
  input_files: TrailInputFile[];
  input_text: string | null;
  prompt_override: string | null;
  status: TrailPlanStatus;
  analysis_markdown: string | null;
  plan_markdown: string | null;
  skill_gaps: SkillGap[] | null;
  radar: RadarEntry[] | null;
  offer_id: string | null;
  error_detail: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Trail {
  id: string;
  plan_id: string;
  name: string;
  description: string | null;
  skill_gaps_alvo: string[];
  vendedores_alvo: string[];
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TrailItem {
  id: string;
  trail_id: string;
  position: number;
  titulo: string;
  objetivo: string | null;
  skill: string | null;
  call_context_slug: string | null;
  difficulty: string;
  instrucoes_cenario: string | null;
  draft_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Item enriquecido com o status do draft gerado (join). */
export interface TrailItemRow extends TrailItem {
  draft: Pick<RoleplayDraft, "id" | "status" | "connection_id" | "error_detail"> | null;
}

/** Trilha com itens aninhados (getTrailPlan). */
export interface TrailWithItems extends Trail {
  items: TrailItemRow[];
}

/** Plano com trilhas aninhadas (getTrailPlan). */
export interface TrailPlanDetail extends TrailPlan {
  trails: TrailWithItems[];
}

// ── Avaliação de qualidade (multi-avaliador) ────────────────────────────────

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
}

/** Pesos dos critérios de avaliação: key do critério → peso (%); somam 100. */
export type EvalWeights = Record<string, number>;

export interface RoleplayEvaluation {
  id: string;
  readiness_id: string;
  evaluator_id: string;
  scores: Record<string, number>; // key do critério → 1..5
  comments: Record<string, string>; // key do critério → texto
  overall_comment: string | null;
  created_at: string;
  updated_at: string;
}
