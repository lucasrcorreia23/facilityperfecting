// Critérios de avaliação de qualidade de um roleplay (persona de vendas).
// Baseados em frameworks de avaliação de simulação conversacional (Eval4Sim,
// CoReflect) + rubricas de sales roleplay. As `key`s são a fonte de verdade e
// batem 1:1 com as chaves de `app_settings.eval_weights` e de scores/comments.

export interface EvaluationCriterion {
  /** chave estável usada em scores/comments/eval_weights */
  key: string;
  label: string;
  description: string;
  /** peso padrão (%); a soma dos 7 = 100 */
  defaultWeight: number;
}

export const EVALUATION_CRITERIA: readonly EvaluationCriterion[] = [
  {
    key: "verossimilhanca",
    label: "Verossimilhança da persona",
    description:
      "A persona se comporta de forma crível e coerente com o cenário (cargo, empresa, dores)? Linguagem natural, não robótica.",
    defaultWeight: 20,
  },
  {
    key: "memoria",
    label: "Coerência de memória",
    description:
      "Lembra e referencia o que foi dito antes, sem se contradizer ao longo da conversa.",
    defaultWeight: 20,
  },
  {
    key: "realismo_fala",
    label: "Realismo da fala",
    description:
      "O diálogo soa natural e espontâneo em pt-BR (pausas, hesitações, turnos), sem respostas excessivamente polidas ou scriptadas.",
    defaultWeight: 15,
  },
  {
    key: "dificuldade",
    label: "Dificuldade e objeções",
    description:
      "Levanta objeções realistas no momento certo (orçamento, timing, concorrência), com dificuldade progressiva e valor de treino.",
    defaultWeight: 15,
  },
  {
    key: "consistencia",
    label: "Consistência comportamental",
    description:
      "Personalidade, tom e nível de engajamento se mantêm estáveis e alinhados à persona durante a conversa.",
    defaultWeight: 15,
  },
  {
    key: "engajamento",
    label: "Envolvimento e engajamento",
    description:
      "Responde de forma significativa e mantém o diálogo de mão dupla, em vez de respostas curtas ou desinteressadas.",
    defaultWeight: 10,
  },
  {
    key: "valor_pedagogico",
    label: "Valor pedagógico",
    description:
      "Treina a habilidade pretendida (descoberta, contorno de objeção, comunicação de valor): recompensa boa técnica e expõe lacunas.",
    defaultWeight: 5,
  },
] as const;

export const CRITERION_KEYS = EVALUATION_CRITERIA.map((c) => c.key);
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/** Pesos padrão como mapa key→peso (somam 100). */
export function defaultEvalWeights(): Record<string, number> {
  return Object.fromEntries(EVALUATION_CRITERIA.map((c) => [c.key, c.defaultWeight]));
}

export function criterionLabel(key: string): string {
  return EVALUATION_CRITERIA.find((c) => c.key === key)?.label ?? key;
}
