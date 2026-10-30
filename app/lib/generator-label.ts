import type { GeneratorManifest, GuidelineScope } from "@/app/lib/types";

const SCOPE_LABEL: Record<GuidelineScope, string> = { global: "Global", mode: "Modo", connection: "Conta" };

/** "v5 · 1f0b0fd8": versão do gerador e impressão digital do código. */
export function generatorVersionLabel(m: GeneratorManifest): string {
  return `v${m.version} · ${m.fingerprint}`;
}

/** "Global v3, Conta: FIESC v2" ou "nenhuma". */
export function guidelinesLabel(m: GeneratorManifest): string {
  if (m.guidelines.length === 0) return "nenhuma";
  return m.guidelines
    .map((g) => (g.scope_type === "global" ? `${g.title} v${g.version_no}` : `${SCOPE_LABEL[g.scope_type]}: ${g.title} v${g.version_no}`))
    .join(", ");
}

/** Linha única para cards e cabeçalhos; null vira o texto de "sem registro". */
export function generatorLabel(m: GeneratorManifest | null | undefined): string {
  if (!m) return "origem não registrada";
  return `Gerador ${generatorVersionLabel(m)} · diretrizes: ${guidelinesLabel(m)}`;
}
