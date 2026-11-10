/**
 * Respostas do operador às lacunas que a IA apontou no process-import.
 *
 * Por que existe: o operador conhece o cliente e fecha as lacunas com informação
 * que os documentos não têm. Antes isso virava 2ª, 3ª, 4ª rodada de prompt e
 * edição à mão campo a campo. Aqui a resposta vira dado: vai junto no
 * reprocessamento como fonte de verdade, fica gravada no rascunho
 * (`scenario.gap_answers`) e segue com ele para o playbook (reviewed-material.ts).
 *
 * Puro e sem imports de propósito: o front importa este arquivo, e o TypeScript do
 * Next não aceita caminho terminado em ".ts" (o Deno exige).
 */

export type GapSeverity = "critico" | "importante" | "opcional";

export interface GapLike {
  item: string;
  grupo: string;
  severidade: GapSeverity;
}

/**
 * Uma lacuna respondida. Guarda o texto da lacuna, e não um id: `lacunas` é
 * regerado a cada rodada, então a resposta precisa se explicar sozinha.
 */
export interface GapAnswer extends GapLike {
  /** Vazio quando `nao_se_aplica`. */
  resposta: string;
  /** A informação não existe ou não importa neste roleplay: não reabrir. */
  nao_se_aplica: boolean;
  answered_at?: string;
}

export const GAP_ANSWER_LIMITS = {
  /** Texto da lacuna (vem da IA; raramente passa de uma frase). */
  item: 400,
  group: 80,
  /** Uma resposta: cabe um parágrafo com números e condições. */
  answer: 1_500,
  maxAnswers: 40,
  /** O bloco inteiro: ~4k tokens a mais em cada fatia paralela, sem chamada extra. */
  total: 16_000,
} as const;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Identidade de uma lacuna entre rodadas: só o texto, normalizado. O grupo fica de
 * fora porque a IA o troca de uma rodada para a outra ("Oferta" → "Contexto").
 */
export const gapKey = (gap: { item: string }) => norm(gap.item);

const SEVERITIES: GapSeverity[] = ["critico", "importante", "opcional"];

/**
 * Valida o que veio da tela ou do banco: descarta item sem lacuna ou sem resposta,
 * corta nos limites e fica com a ÚLTIMA resposta de cada lacuna.
 */
export function sanitizeGapAnswers(raw: unknown): GapAnswer[] {
  if (!Array.isArray(raw)) return [];
  const L = GAP_ANSWER_LIMITS;
  const byKey = new Map<string, GapAnswer>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const item = str(e.item).slice(0, L.item);
    const na = e.nao_se_aplica === true;
    const resposta = na ? "" : str(e.resposta).slice(0, L.answer);
    if (!item || (!na && !resposta)) continue;
    const key = gapKey({ item });
    if (!key) continue;
    const severidade = SEVERITIES.includes(e.severidade as GapSeverity)
      ? (e.severidade as GapSeverity)
      : "importante";
    // Reinsere para a última resposta também ficar por último na ordem.
    byKey.delete(key);
    byKey.set(key, {
      item,
      grupo: str(e.grupo).slice(0, L.group),
      severidade,
      resposta,
      nao_se_aplica: na,
      ...(str(e.answered_at) ? { answered_at: str(e.answered_at) } : {}),
    });
  }
  return [...byKey.values()];
}

/** Junta respostas antigas e novas; em lacuna repetida vale a mais nova. */
export function mergeGapAnswers(previous: unknown, next: unknown): GapAnswer[] {
  return sanitizeGapAnswers([
    ...(Array.isArray(previous) ? previous : []),
    ...(Array.isArray(next) ? next : []),
  ]);
}

/** As lacunas que continuam abertas: tira as que já têm resposta. */
export function openGaps<T extends { item: string }>(gaps: T[] | null | undefined, answers: GapAnswer[]): T[] {
  const answered = new Set(answers.map(gapKey));
  const seen = new Set<string>();
  return (gaps ?? []).filter((g) => {
    const key = gapKey(g);
    if (!key || answered.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const GAP_ANSWERS_HEADING = "RESPOSTAS DO OPERADOR ÀS LACUNAS";

const NOT_APPLICABLE_LINE =
  "NÃO SE APLICA — esta informação não existe ou não importa para este roleplay. Não reabra como lacuna e não invente um valor.";

/** Uma resposta, do jeito que a IA lê (usado aqui e no bloco de material revisado). */
export function renderGapAnswer(answer: GapAnswer, index: number): string {
  const group = answer.grupo ? `[${answer.grupo}] ` : "";
  return `${index + 1}. ${group}Lacuna: ${answer.item}\n   Resposta do operador: ${
    answer.nao_se_aplica ? NOT_APPLICABLE_LINE : answer.resposta
  }`;
}

export interface GapAnswersBlock {
  /** "" quando não há resposta. */
  text: string;
  /** Quantas respostas entraram no bloco. */
  count: number;
  /** O que ficou de fora por limite, em português, para a tela avisar. */
  truncated: string[];
}

/**
 * Bloco que vai DEPOIS do material, na mensagem de usuário: todas as fatias
 * paralelas o leem, e o system cacheado não muda. Respeita o teto total cortando
 * as respostas mais antigas (as do começo), nunca uma resposta ao meio.
 */
export function buildGapAnswersBlock(raw: unknown): GapAnswersBlock {
  const L = GAP_ANSWER_LIMITS;
  const all = sanitizeGapAnswers(raw);
  const truncated: string[] = [];
  if (all.length === 0) return { text: "", count: 0, truncated };

  let kept = all;
  if (kept.length > L.maxAnswers) {
    truncated.push(`Respostas às lacunas (só as ${L.maxAnswers} mais recentes de ${kept.length})`);
    kept = kept.slice(-L.maxAnswers);
  }
  const header =
    `=== ${GAP_ANSWERS_HEADING} ===\n` +
    "Fonte de verdade revisada por quem conhece o cliente. Prevalece sobre o material acima quando conflitar.";
  // Do mais novo para o mais antigo até encher; depois volta à ordem original.
  const lines: string[] = [];
  let used = header.length;
  let dropped = 0;
  for (let i = kept.length - 1; i >= 0; i--) {
    const line = renderGapAnswer(kept[i], 0);
    if (used + line.length + 2 > L.total) {
      dropped = i + 1;
      break;
    }
    used += line.length + 2;
    lines.unshift(line);
  }
  if (dropped > 0) {
    truncated.push(`Respostas às lacunas (${dropped} das mais antigas ficaram de fora por tamanho)`);
    kept = kept.slice(dropped);
  }
  if (kept.length === 0) return { text: "", count: 0, truncated };
  return {
    text: `${header}\n\n${kept.map(renderGapAnswer).join("\n")}`,
    count: kept.length,
    truncated,
  };
}

/** Material + bloco de respostas, como vai na mensagem de usuário. */
export function appendGapAnswers(material: string, block: GapAnswersBlock): string {
  return block.count > 0 ? `${material.trim()}\n\n${block.text}` : material;
}

/**
 * Regra fixa do gerador para o bloco acima. Entra como texto de system só quando
 * há respostas (não quebra o cache do prompt base) e faz parte da impressão
 * digital do gerador (prompt.ts).
 */
export const GAP_ANSWERS_RULES = `${GAP_ANSWERS_HEADING}. Depois do material vem um bloco com esse título: são as respostas de quem opera a conta ao que você (ou uma rodada anterior) apontou como faltando.
- São fonte de verdade. Trate cada resposta como fato do material e, quando ela conflitar com o material, a RESPOSTA prevalece — o material pode estar desatualizado ou incompleto.
- Leve cada resposta para o campo a que ela pertence (preço e condições → oferta_descricao; quem decide, dores e receios → perfil; objeção → objecoes; e assim por diante), reescrita como o resto do campo. Valem as mesmas regras de sempre: lado do comprador, vocabulário reservado, mesmos valores em todos os campos.
- Números, preços, prazos e datas ditos pelo operador são dados reais: use-os e não os marque como "(Hipótese Assumida)".
- A resposta é a voz do operador, não a do comprador: não a transcreva como fala do comprador, a menos que ela seja claramente uma frase dele.
- NÃO liste em "lacunas" o que já foi respondido, nem o mesmo ponto com outras palavras. "Não se aplica" encerra o assunto: não reabra e não invente um valor para preencher.
- Em "lacunas" entra só o que CONTINUA faltando depois das respostas — inclusive o que uma resposta deixou em aberto.`;
