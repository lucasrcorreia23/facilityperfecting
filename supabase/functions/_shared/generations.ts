/**
 * Registro "quem gerou o quê" (`roleplay_generations`, migration 0024): liga cada
 * roleplay criado na Perfecting ao manifesto do gerador que produziu o rascunho.
 * Fica fora do rascunho porque `roleplay_drafts` só é visível ao dono, e a
 * Calibração precisa mostrar a origem para a equipe toda — inclusive o que a IA
 * gerou e o que foi enviado, para a linha do tempo mostrar o que a equipe editou.
 */
import { EXPORT_VERSION } from "./generator-version.ts";
import { buildSentSnapshot } from "./generation-diff.ts";

/** Nunca derruba o envio: o roleplay já existe, falta só o registro. */
export async function recordGenerations(
  // deno-lint-ignore no-explicit-any
  db: any,
  draft: {
    id: string;
    connection_id: string | null;
    generator?: unknown;
    generation_output?: unknown;
    created_by?: string | null;
    scenario?: Record<string, unknown> | null;
    offers?: { offer_name?: string | null; general_description?: string | null } | null;
    contexts?: { target_notes?: string | null } | null;
  },
  caseSetupIds: number[],
): Promise<void> {
  if (!draft.connection_id || caseSetupIds.length === 0) return;
  const sent = buildSentSnapshot(draft);
  const rows = caseSetupIds.map((case_setup_id) => ({
    connection_id: draft.connection_id,
    case_setup_id,
    draft_id: draft.id,
    generator: draft.generator ?? null,
    ai_output: draft.generation_output ?? null,
    sent,
    export_version: EXPORT_VERSION,
    created_by: draft.created_by ?? null,
  }));
  const { error } = await db
    .from("roleplay_generations")
    .upsert(rows, { onConflict: "connection_id,case_setup_id" });
  if (error) console.error("origem do roleplay não registrada:", error.message);
}
