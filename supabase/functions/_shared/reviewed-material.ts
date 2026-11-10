/**
 * Bloco "Material revisado pelo operador" para o generate-playbook.
 *
 * Por que existe: o playbook era estruturado só a partir do material colado nele
 * (os documentos originais). O que o operador corrigiu no rascunho do roleplay —
 * oferta, perfil, objeções, regras, cenário — e o que respondeu às lacunas nunca
 * chegava ao playbook, e a nota passava a cobrar algo que o comprador nega. Este
 * bloco leva o revisado junto, somado ao material, como fonte que prevalece.
 *
 * Só a parte pura: o que entra de cada rascunho, os tetos e a regra do prompt.
 */

import { buildSentSnapshot } from "./generation-diff.ts";
import { type GapAnswer, renderGapAnswer, sanitizeGapAnswers } from "./gap-answers.ts";

type Seed = Record<string, unknown>;

/** O rascunho como vem do banco, com os joins do envio. */
export interface ReviewedDraftRow {
  id: string;
  title?: string | null;
  scenario?: Record<string, unknown> | null;
  /** Sem saída da IA o rascunho não foi processado: a "descrição" é o material cru. */
  generation_output?: unknown;
  offers?: { offer_name?: string | null; general_description?: string | null } | null;
  contexts?: { target_notes?: string | null } | null;
  /** Material cru do rascunho (sources.raw_text), para reconhecer descrição não processada. */
  raw_text?: string | null;
}

export const REVIEWED_LIMITS = {
  /** Mesmo corte que o envio aplica à descrição e ao perfil (MAX_API_TEXT_CHARS). */
  longText: 12_000,
  personas: 3_000,
  scenario: 8_000,
  listItems: 40,
  listItemField: 800,
  /** Um rascunho inteiro, com tudo. */
  perDraft: 36_000,
  /** O bloco inteiro — soma-se ao material do playbook numa chamada só. */
  total: 80_000,
  maxDrafts: 5,
} as const;

export const REVIEWED_MATERIAL_HEADING = "MATERIAL REVISADO PELO OPERADOR";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Corta no limite e diz que cortou — a IA não deve tratar o fim como lacuna. */
function clip(text: string, max: number, onCut: () => void): string {
  if (text.length <= max) return text;
  onCut();
  return `${text.slice(0, max).trim()} […cortado: o original tem ${text.length} caracteres]`;
}

export interface ReviewedMaterialBlock {
  /** "" quando nenhum rascunho tem conteúdo revisado. */
  text: string;
  /** O que foi cortado ou ficou de fora, em português, para a tela avisar. */
  truncated: string[];
  /** O que entrou, por rascunho — vira a rastreabilidade em `input_files`. */
  used: Array<{ draft_id: string; chars: number }>;
}

function renderDraft(row: ReviewedDraftRow, index: number, cut: (what: string) => void): string {
  const L = REVIEWED_LIMITS;
  const snap = buildSentSnapshot(row);
  const title = str(row.title) || snap.oferta_nome || "sem título";
  const where = `Rascunho "${title}"`;
  const sections: string[] = [];
  const section = (heading: string, body: string) => {
    if (body) sections.push(`### ${heading}\n${body}`);
  };
  const text = (heading: string, value: string, max: number) =>
    section(heading, clip(value, max, () => cut(`${where}: ${heading}`)));

  // Rascunho salvo sem processar guarda o material cru no lugar da descrição: isso
  // não é conteúdo revisado, e o playbook já tem o material dele.
  const rawDescription =
    !row.generation_output || (str(row.raw_text) !== "" && str(row.raw_text) === snap.oferta_descricao);
  if (snap.oferta_nome) section("Oferta", snap.oferta_nome);
  if (!rawDescription) text("Descrição da oferta", snap.oferta_descricao, L.longText);
  text("Perfil do público (quem compra)", snap.perfil, L.longText);
  text("Variação das personas", snap.personas_variacao, L.personas);

  const field = (label: string, value: unknown, what: string) => {
    const v = clip(str(value), L.listItemField, () => cut(`${where}: ${what}`));
    return v ? `   ${label}: ${v}` : null;
  };
  const items = (xs: Seed[], what: string) => {
    if (xs.length > L.listItems) cut(`${where}: ${what} (só as ${L.listItems} primeiras de ${xs.length})`);
    return xs.slice(0, L.listItems);
  };
  section(
    "Objeções do comprador",
    items(snap.objecoes, "Objeções")
      .map((o, i) =>
        [
          `${i + 1}. ${str(o.titulo) || "(sem título)"}`,
          field("Fala do comprador", o.fala_exemplo, "Objeções"),
          field("Detalhes", o.detalhes, "Objeções"),
          field("O comprador cede se", o.ceder_se, "Objeções"),
        ].filter(Boolean).join("\n")
      )
      .join("\n"),
  );
  section(
    "Regras de comportamento do comprador",
    items(snap.guardrails, "Regras")
      .map((g, i) =>
        [`${i + 1}. ${str(g.nome) || "(sem nome)"}`, field("Instrução", g.instrucao, "Regras")]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n"),
  );
  // No modo playbook o cenário vem das etapas — o campo do rascunho nem é usado.
  if (snap.mode === "methodology") {
    text("Comportamento do cenário", snap.cenario_instrucoes, L.scenario);
  }
  const answers: GapAnswer[] = sanitizeGapAnswers(row.scenario?.gap_answers);
  section("Respostas do operador às lacunas dos documentos", answers.map(renderGapAnswer).join("\n"));

  if (sections.length === 0) return "";
  const body = sections.join("\n\n");
  return `## Rascunho ${index + 1}: ${title}\n\n${clip(body, L.perDraft, () => cut(`${where} (fim cortado)`))}`;
}

/**
 * Monta o bloco a partir dos rascunhos escolhidos, na ordem dada. Respeita o teto
 * total deixando de fora os rascunhos do fim (inteiros), e avisa.
 */
export function buildReviewedMaterialBlock(rows: ReviewedDraftRow[]): ReviewedMaterialBlock {
  const L = REVIEWED_LIMITS;
  const truncated: string[] = [];
  const cut = (what: string) => {
    if (!truncated.includes(what)) truncated.push(what);
  };
  const used: ReviewedMaterialBlock["used"] = [];
  const parts: string[] = [];
  let total = 0;
  let list = rows;
  if (list.length > L.maxDrafts) {
    cut(`Material revisado (só os ${L.maxDrafts} primeiros rascunhos de ${list.length})`);
    list = list.slice(0, L.maxDrafts);
  }
  for (const row of list) {
    const rendered = renderDraft(row, parts.length, cut);
    const name = `Rascunho "${str(row.title) || "sem título"}"`;
    if (!rendered) {
      cut(`${name} (sem conteúdo revisado para incluir)`);
      continue;
    }
    if (total + rendered.length > L.total) {
      cut(`${name} (ficou de fora: o material revisado passou do tamanho máximo)`);
      continue;
    }
    total += rendered.length;
    parts.push(rendered);
    used.push({ draft_id: row.id, chars: rendered.length });
  }
  if (parts.length === 0) return { text: "", truncated, used };
  const header =
    `=== ${REVIEWED_MATERIAL_HEADING} — prevalece sobre os documentos quando conflitar ===\n` +
    "Conteúdo de rascunho(s) de roleplay desta conta, já revisado à mão pela equipe, mais as respostas dela ao que faltava nos documentos.";
  return { text: `${header}\n\n${parts.join("\n\n")}`, truncated, used };
}

/** Material do playbook + bloco revisado, como vai na mensagem de usuário. */
export function appendReviewedMaterial(material: string, block: ReviewedMaterialBlock): string {
  return block.text ? `${material.trim()}\n\n${block.text}` : material;
}

/**
 * Regra do generate-playbook para o bloco acima. Vai FORA da base do prompt, como
 * os limites: `prompt_override` substitui a base inteira.
 */
export const REVIEWED_MATERIAL_RULES = `${REVIEWED_MATERIAL_HEADING}. Depois do material vem um bloco com esse título: é o conteúdo de rascunho(s) de roleplay que a equipe já revisou à mão (oferta, perfil de quem compra, objeções e regras do comprador, cenário) e as respostas dela ao que faltava nos documentos.
- Em conflito com os documentos, o REVISADO PREVALECE: preço, prazo, condições, produto, escopo, público e processo de decisão. Nenhuma pergunta de exemplo, orientação ou descrição de etapa pode contradizer o revisado.
- Use o revisado para corrigir e tornar preciso o CONTEÚDO das etapas e subetapas que os documentos sustentam. NÃO crie etapa nem subetapa só porque o revisado menciona um assunto — a jornada continua sendo a dos documentos. A única exceção é o revisado dizer explicitamente que aquela etapa ou momento existe na jornada.
- O revisado descreve o COMPRADOR e a oferta; o playbook descreve o que o VENDEDOR faz. Não copie perfil, objeção ou regra do comprador como texto de subetapa: traduza em orientação ao vendedor (a objeção vira o que fazer quando ela aparece, coerente com a condição em que o comprador cede).
- "Não se aplica" numa resposta encerra o assunto: não cobre isso do vendedor.
- Os limites da plataforma acima continuam valendo: tamanho de nome e de descrição, e número de subetapas por etapa.`;
