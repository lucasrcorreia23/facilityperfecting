/** Tipos do domínio do produto (espelham o schema Postgres em supabase/migrations). */

export type DraftStatus = "draft" | "exporting" | "exported" | "error";
export type SourceType = "paste" | "file";
export type ExportJobState = "queued" | "running" | "done" | "error";
export type ExportStep = "offer" | "context" | "case_setup";

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

export interface ScenarioConfig {
  call_context_slug?: string | null;
  difficulty?: string | null;
  skill?: string | null;
  objective?: string | null;
  aditional_instructions?: string | null;
  // Payload de case_setup escrito à mão. Quando presente, o export PULA o
  // /role_plays/generate (IA) e manda estes campos VERBATIM para a Perfecting.
  // Shape = saída de generateCaseSetup (company_profile, persona_profile,
  // buyer_*, salesperson_*, training_*, etc.). Ver buildCaseSetupCreate.
  case_setup_payload?: Record<string, unknown> | null;
}

export interface CallContextType {
  id: number;
  name: string;
  slug: string;
  group: string;
  stage?: string;
}

export interface ImportGap {
  item: string;
  severidade: "critico" | "importante" | "opcional";
  grupo: string;
}

export interface ProcessImportResult {
  oferta_nome: string;
  perfil: string;
  call_context_slug: string;
  dificuldade: string;
  cenario_instrucoes: string;
  objetivo: string;
  habilidades: string;
  lacunas: ImportGap[];
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
  error_detail: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Linha enriquecida para a Biblioteca (join com offer/connection). */
export interface DraftRow extends RoleplayDraft {
  offer: Pick<Offer, "id" | "offer_name"> | null;
  connection: Pick<Connection, "id" | "org_name" | "org_id"> | null;
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
