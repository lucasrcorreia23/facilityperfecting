/**
 * Texto do comprador que não pode chegar à Perfecting do jeito que está.
 *
 * Dois defeitos reais (FIESC Fase 3, PROD, 04/11/2026):
 *
 * 1. **Palavra que no produto quer dizer outra coisa.** A objeção da Cláudia dizia
 *    "Esse valor eu não tenho na rubrica da Educação" — jargão correto de orçamento
 *    público. Na chamada ela soltou "deixa eu ver minhas rubricas", e quem treinava
 *    ouviu a personagem falando da própria avaliação. Tudo que o comprador lê como
 *    seu (prompt, prévio, fatos, dores, abertura, objeções inteiras) passa por aqui.
 *
 * 2. **O que o representante vê na cola escrito como instrução ao comprador.** O
 *    `buyer_prior_knowledge` do roleplay é o rodapé "O que {persona} já sabe" da cola
 *    da chamada (`resolveCallSheetKnowledge` no front). O gerador copiava para lá o
 *    "Conhecimento Prévio" do comprador ("Esta é uma reunião on-line… Você recebeu…"),
 *    e alguém completou à mão com "Você tem interesse mas apresenta hesitação…". Em
 *    PROD esse campo só chega ao comprador quando o bloco não tem texto próprio, então
 *    a direção de atuação nem funcionava. São fatos curtos e neutros: servem à cola e,
 *    se um dia o backend os somar ao prompt, ao comprador.
 *
 * `erro` barra o envio; `aviso` só aparece. Sem imports de propósito: o front
 * (DossierEditor) importa este arquivo direto.
 */

export type BuyerTextLevel = "erro" | "aviso";

export interface BuyerTextIssue {
  /** Onde está: "ja_sabe[2]", "objeção \"Orçamento\" (fala_exemplo)", "persona.prompt"… */
  onde: string;
  nivel: BuyerTextLevel;
  motivo: string;
  trecho: string;
}

export interface BuyerText {
  onde: string;
  text: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Termos com sentido próprio na plataforma. Casam sobre o texto sem acento e em
 * minúsculas. Fora da lista de propósito: "nota" (nota fiscal), "etapa", "critério" e
 * "avaliação" soltos, comuns na fala de qualquer comprador.
 */
const RESERVED_TERMS: ReadonlyArray<{ re: RegExp; termo: string; nivel: BuyerTextLevel; troca: string }> = [
  { re: /\brubricas?\b/, termo: "rubrica", nivel: "erro", troca: "orçamento, verba, dotação" },
  { re: /\bchecklists?\b/, termo: "checklist", nivel: "erro", troca: "lista, conferência" },
  { re: /\bplaybooks?\b/, termo: "playbook", nivel: "erro", troca: "roteiro, processo" },
  { re: /\brole ?plays?\b/, termo: "roleplay", nivel: "erro", troca: "reunião, conversa" },
  { re: /\bcriterios? de avaliacao\b/, termo: "critério de avaliação", nivel: "erro", troca: "o que pesa na decisão" },
  { re: /\bfeedback\b/, termo: "feedback", nivel: "aviso", troca: "retorno, opinião" },
  { re: /\bpontuacao\b/, termo: "pontuação", nivel: "aviso", troca: "resultado" },
];

/** Trecho em volta do termo, para quem revisa achar a frase. */
function around(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export function findReservedTerms(texts: readonly BuyerText[]): BuyerTextIssue[] {
  const out: BuyerTextIssue[] = [];
  for (const { onde, text } of texts) {
    if (!text) continue;
    // O trecho sai do texto dobrado (sem acento), que é onde o índice vale.
    const folded = fold(text);
    for (const t of RESERVED_TERMS) {
      const m = t.re.exec(folded);
      if (!m) continue;
      out.push({
        onde,
        nivel: t.nivel,
        motivo: `"${t.termo}" na fala do comprador soa como a avaliação da plataforma; use ${t.troca}`,
        trecho: around(folded, m.index, m[0].length),
      });
    }
  }
  return out;
}

/** Teto por item do "O que {persona} já sabe": a cola é um rodapé, não um parágrafo. */
export const PRIOR_FACT_MAX_CHARS = 180;
/** Mais que isso e o rodapé vira página. */
export const PRIOR_FACTS_MAX_ITEMS = 6;

const PRIOR_FACT_RULES: ReadonlyArray<{ re: RegExp; motivo: string }> = [
  {
    re: /\bvoces?\b/,
    motivo: "fala com o comprador (\"você\"): a cola é lida pelo representante; escreva o fato sem sujeito",
  },
  {
    re: /^(esta|essa|este|esse|isto|isso) e (uma|um)\b/,
    motivo: "descreve a cena (\"Esta é uma reunião…\"): o tipo de ligação já diz isso; fique só com o fato",
  },
  {
    re: /\b(apresenta|demonstra|mostra|tem) (hesitacao|resistencia|interesse|desconfianca|ceticismo)\b/,
    motivo: "direção de atuação: postura do comprador vai no comportamento ou na dificuldade, não aqui",
  },
  {
    // Sem "nunca"/"sempre"/"deve" soltos: "Nunca contratou consultoria" e "o orçamento
    // deve fechar em novembro" são fatos.
    re: /\b(nao deve|mantenha|reaja|responda|aja como|finja)\b/,
    motivo: "instrução ao comprador: aqui vão só fatos que ele já conhece",
  },
];

/**
 * Lint do `buyer_prior_knowledge` ("O que {persona} já sabe" da cola). Lista vazia é
 * erro: o rodapé só lê este campo, e vazio a cola fica sem nada.
 */
export function lintPriorFacts(items: readonly string[], onde = "ja_sabe"): BuyerTextIssue[] {
  const facts = items.map((s) => s.trim()).filter(Boolean);
  if (facts.length === 0) {
    return [{ onde, nivel: "erro", motivo: "vazio: o \"O que o comprador já sabe\" da cola fica sem nada", trecho: "" }];
  }
  const out: BuyerTextIssue[] = [];
  if (facts.length > PRIOR_FACTS_MAX_ITEMS) {
    out.push({
      onde,
      nivel: "aviso",
      motivo: `${facts.length} itens: a cola mostra até ${PRIOR_FACTS_MAX_ITEMS} sem virar página; junte ou corte`,
      trecho: "",
    });
  }
  facts.forEach((fact, i) => {
    const where = `${onde}[${i}]`;
    const folded = fold(fact);
    if (fact.length > PRIOR_FACT_MAX_CHARS) {
      out.push({
        onde: where,
        nivel: "erro",
        motivo: `${fact.length} caracteres (teto ${PRIOR_FACT_MAX_CHARS}): um fato por item, em uma linha`,
        trecho: around(fact, 0, 60),
      });
    }
    for (const rule of PRIOR_FACT_RULES) {
      const m = rule.re.exec(folded);
      if (m) out.push({ onde: where, nivel: "erro", motivo: rule.motivo, trecho: around(folded, m.index, m[0].length) });
    }
  });
  return out;
}

export interface ObjectionText {
  titulo: string;
  fala_exemplo: string;
  detalhes: string;
  ceder_se: string;
}

/** Os quatro campos da objeção vão para o prompt do comprador. */
export function objectionTexts(objections: readonly ObjectionText[], prefix = "objeção"): BuyerText[] {
  return objections.flatMap((o) =>
    (["titulo", "fala_exemplo", "detalhes", "ceder_se"] as const).map((k) => ({
      onde: `${prefix} "${o.titulo}" (${k})`,
      text: o[k] ?? "",
    })),
  );
}

export const hasBlockingIssue = (issues: readonly BuyerTextIssue[]) => issues.some((i) => i.nivel === "erro");

export function describeBuyerTextIssue(i: BuyerTextIssue): string {
  return `${i.onde}: ${i.motivo}${i.trecho ? ` — "${i.trecho}"` : ""}`;
}

/** O pedaço do dossiê que o lint lê (estrutural, para o front importar sem o Deno). */
export interface BuyerTextDossier {
  dores: Array<{ titulo: string; descricao: string }>;
  persona: { prompt: string; dores: Array<{ dor: string; detalhe: string; impacto?: string }> };
  conhecimento: { previo: string; ja_sabe?: string[]; fatos: Array<{ titulo: string; texto: string }> };
  abertura: string[];
}

/**
 * O que vai para o `buyer_prior_knowledge` (a cola do representante). `ja_sabe` quando
 * o dossiê o traz; num rascunho antigo, o `previo` só se ele já for um fato neutro e
 * curto — o prévio escrito para o comprador ("Esta é uma reunião… Você recebeu…") era
 * exatamente o que aparecia comprido e estranho na cola.
 */
export function priorFactsOf(d: BuyerTextDossier): string[] {
  const facts = (d.conhecimento.ja_sabe ?? []).map((s) => s.trim()).filter(Boolean);
  if (facts.length > 0) return facts;
  const previo = d.conhecimento.previo.trim();
  return previo && !hasBlockingIssue(lintPriorFacts([previo])) ? [previo] : [];
}

/** Tudo do dossiê que o comprador lê como seu. */
export function dossierBuyerTexts(d: BuyerTextDossier): BuyerText[] {
  return [
    { onde: "persona.prompt", text: d.persona.prompt },
    { onde: "conhecimento.previo", text: d.conhecimento.previo },
    ...(d.conhecimento.ja_sabe ?? []).map((t, i) => ({ onde: `ja_sabe[${i}]`, text: t })),
    ...d.conhecimento.fatos.map((f) => ({ onde: `fato "${f.titulo}"`, text: `${f.titulo} ${f.texto}` })),
    ...d.dores.map((p) => ({ onde: `dor "${p.titulo}"`, text: `${p.titulo} ${p.descricao}` })),
    ...d.persona.dores.map((p) => ({ onde: `dor da persona "${p.dor}"`, text: `${p.detalhe} ${p.impacto ?? ""}` })),
    ...d.abertura.map((a, i) => ({ onde: `abertura[${i}]`, text: a })),
  ];
}

/** Termos reservados no dossiê e a forma do "já sabe" que a cola vai mostrar. */
export function dossierBuyerTextIssues(d: BuyerTextDossier): BuyerTextIssue[] {
  return [...findReservedTerms(dossierBuyerTexts(d)), ...lintPriorFacts(priorFactsOf(d))];
}
