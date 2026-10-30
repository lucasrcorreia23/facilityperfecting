/**
 * Versão do gerador do facility: diz qual raciocínio produziu cada roleplay, para a
 * equipe saber se um defeito é de uma versão antiga ou da atual.
 *
 * Duas peças, de propósito:
 *  - GENERATOR_VERSION: número que a gente sobe ao mudar o prompt base, o schema ou
 *    as notas de fatia do process-import. É o que aparece na tela ("v5").
 *  - impressão digital: hash do texto que de fato vai para a IA. Pega a mudança que
 *    alguém esqueceu de versionar; o teste de snapshot obriga a subir os dois juntos.
 *
 * Histórico (herdado do PROMPT_VERSION que ficava no front):
 *  v2: realinhado ao modo playbook, às 13 dimensões do contexto e ao B2B/B2C.
 *  v3: extrai objeções (com "Ceda se") e guardrails do material.
 *  v4: separa o lado do comprador do material do vendedor, gera "oferta_descricao",
 *      regras de datas/valores e guardrails sem encerrar a ligação.
 *  v5: dossiê do comprador por metodologia; prompt base fixo no servidor e
 *      diretrizes da equipe por cima (sem prompt personalizado no navegador).
 */
export const GENERATOR_VERSION = "5";

/**
 * Versão do que o envio faz com o resultado (export-roleplay, implement-playbook,
 * dossiê, fechamento). Sobe quando muda como o conteúdo vira roleplay na Perfecting.
 */
export const EXPORT_VERSION = "1";

export interface GuidelineRef {
  guideline_id: string;
  version_id: string;
  version_no: number;
  scope_type: "global" | "mode" | "connection";
  title: string;
}

export interface GeneratorManifest {
  version: string;
  fingerprint: string;
  model: string;
  mode: "methodology" | "playbook";
  guidelines: GuidelineRef[];
  /** A conta já escolhida no processamento (sem ela, só valem global e modo). */
  connection_id: string | null;
  processed_at: string;
}

/** SHA-256 em hex, 8 primeiros caracteres: curto para a tela, longo para não colidir. */
export async function codeFingerprint(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}
