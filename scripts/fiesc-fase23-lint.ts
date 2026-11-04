/**
 * Lint e diff puros do spec das Fases 2/3 da FIESC (fiesc-fase23-hml.ts e
 * fiesc-fase23-fix-texto.ts). Separado para ter teste sem rede.
 */
import {
  type BuyerTextIssue,
  findReservedTerms,
  lintPriorFacts,
  type ObjectionText,
  objectionTexts,
} from "../supabase/functions/_shared/buyer-text-lint.ts";

export interface StageText {
  previo: string;
  ja_sabe?: string[];
  fatos: Record<string, string>;
  abertura: string[];
  objecoes: ObjectionText[];
}

/** Tudo da etapa que o comprador lê como seu, mais a forma do "já sabe" da cola. */
export function stageTextIssues(c: StageText, prefix: string): BuyerTextIssue[] {
  return [
    ...findReservedTerms([
      { onde: `${prefix}.previo`, text: c.previo },
      ...(c.ja_sabe ?? []).map((t, i) => ({ onde: `${prefix}.ja_sabe[${i}]`, text: t })),
      ...Object.entries(c.fatos).map(([k, v]) => ({ onde: `${prefix}.fatos "${k}"`, text: `${k} ${v}` })),
      ...c.abertura.map((t, i) => ({ onde: `${prefix}.abertura[${i}]`, text: t })),
      ...objectionTexts(c.objecoes, `${prefix} objeção`),
    ]),
    ...lintPriorFacts(c.ja_sabe ?? [], `${prefix}.ja_sabe`),
  ];
}

/**
 * Campos de texto da linha de objeção que divergem do spec, já no formato da API
 * (`description` = fala de exemplo). `null` = nada a mudar.
 */
export function objectionTextPatch(
  row: Record<string, unknown>,
  o: ObjectionText,
): Record<string, string> | null {
  const want: Record<string, string> = {
    description: o.fala_exemplo,
    details: o.detalhes,
    to_give_in_if: o.ceder_se,
  };
  const patch: Record<string, string> = {};
  for (const [k, v] of Object.entries(want)) {
    if (String(row[k] ?? "").trim() !== v.trim()) patch[k] = v;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
