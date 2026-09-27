/**
 * Dor escondida que vazou para o que o comprador sabe de saída.
 *
 * Uma dor "sondada" ou "oculta" já chega ao comprador com a regra de quando revelar.
 * Se ela também está no conhecimento prévio ou nos fatos, ele a solta na primeira
 * pergunta e o vendedor não precisa descobrir nada. A checagem é heurística
 * (sobreposição de termos), por isso só avisa: quem decide é quem revisa o dossiê.
 *
 * Sem imports de propósito: o front (DossierEditor) importa este arquivo direto.
 */

export interface PainLeakInput {
  dores: Array<{ titulo: string; descricao: string }>;
  persona: { dores: Array<{ dor: string; revelacao: string; detalhe: string }> };
  conhecimento: { previo: string; fatos: Array<{ titulo: string; texto: string }> };
}

export interface PainLeak {
  dor: string;
  revelacao: string;
  /** "previo" ou o título do fato. */
  onde: string;
  /** Índice do fato em conhecimento.fatos; null = prévio. */
  fato: number | null;
  termos: string[];
}

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas " +
    "para pra com sem sob sobre entre ate e ou mas que se nao sim ja mais menos muito muita " +
    "muitos muitas pouco pouca seu sua seus suas ele ela eles elas voce voces isso isto esse " +
    "essa esses essas este esta estes estas aquele aquela ao aos como quando onde porque " +
    "ser estar ter tem tinha foi sao era esta estao fica ficou vai vem cada todo toda todos " +
    "todas outro outra outros outras mesmo mesma tambem ainda so apenas empresa comprador " +
    "vendedor sente reclama receio acha"
  ).split(" "),
);

function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    // Radical grosseiro: "atrasados"/"atraso" e "rotatividade"/"rotativo" se encontram.
    out.add(w.slice(0, 6));
  }
  return out;
}

/** Termos em comum a partir dos quais o trecho parece repetir a dor. */
export const LEAK_MIN_SHARED = 3;
/** E a fração mínima dos termos da dor que aparecem no trecho. */
export const LEAK_MIN_RATIO = 0.3;

const norm = (s: string) => s.trim().toLowerCase();

export function findHiddenPainLeaks(d: PainLeakInput): PainLeak[] {
  const leaks: PainLeak[] = [];
  const targets = [
    { onde: "previo", fato: null as number | null, text: d.conhecimento.previo },
    ...d.conhecimento.fatos.map((f, i) => ({ onde: f.titulo, fato: i as number | null, text: f.texto })),
  ].map((t) => ({ ...t, terms: terms(t.text) }));

  for (const p of d.persona.dores) {
    if (p.revelacao !== "sondada" && p.revelacao !== "oculta") continue;
    const pain = d.dores.find((x) => norm(x.titulo) === norm(p.dor));
    const painTerms = terms([p.dor, pain?.descricao ?? "", p.detalhe].join(" "));
    if (painTerms.size === 0) continue;
    for (const t of targets) {
      const shared = [...painTerms].filter((w) => t.terms.has(w));
      if (shared.length >= LEAK_MIN_SHARED && shared.length / painTerms.size >= LEAK_MIN_RATIO) {
        leaks.push({ dor: p.dor, revelacao: p.revelacao, onde: t.onde, fato: t.fato, termos: shared });
      }
    }
  }
  return leaks;
}

export function describeLeak(l: PainLeak): string {
  const where = l.fato == null ? "no conhecimento prévio" : `no fato "${l.onde}"`;
  return `dor ${l.revelacao} "${l.dor}" parece repetida ${where} (${l.termos.join(", ")})`;
}
