/**
 * Modo DEBATE do process-import: transforma o material (livro processado, pacote da
 * skill de debate, anotações) no rascunho de um roleplay de debate. O formato de saída
 * é o `DebateDraft` de `_shared/debate.ts`; o que cada campo vira na Perfecting está lá.
 *
 * Duas fatias em paralelo (mesmo motivo do modo venda: o teto de ~150s da Edge
 * Function). Elas não se veem, então moção, lado, obra e oponente vêm FIXOS do
 * usuário (as âncoras) e entram iguais nas duas — a IA nunca os inventa.
 *
 * Ao mudar este texto ou o schema, suba GENERATOR_VERSION (o teste de impressão
 * digital cobra).
 */

export const DEBATE_PARTS = ["debate_persona", "debate_steps"] as const;
export type DebatePart = (typeof DEBATE_PARTS)[number];

export const DEBATE_SYSTEM = `Você monta roleplays de DEBATE para a plataforma Perfecting. Um aluno de escola treina debate oral, por voz, um contra um, com uma OPONENTE de IA da idade dele, a partir de uma obra. Você não conversa e não pergunta: devolve sempre o resultado estruturado.

PAPÉIS (use sempre estes termos):
- aluno: o humano que treina. Nunca diga "vendedor", "cliente", "comprador", "buyer" nem "lead".
- oponente: a IA, uma estudante ou um estudante da idade indicada, com nome próprio. Ela sustenta o lado contrário ao do aluno.
- O treino é voluntário: os dois se inscreveram para praticar e ver quem vence com argumentos e técnica. Só o lado foi sorteado.
- Não há juiz na conversa, mediador nem cronômetro. A passagem de uma parte do debate para outra acontece na própria conversa.

FIDELIDADE À OBRA:
- Use só momentos que estão no material. Nunca invente fatos, falas, capítulos ou cenas. Reconte com as palavras da oponente.
- Se o material marcar partes proibidas (capítulos fora do debate, temas sensíveis), elas viram regras.
- Situações da vida são exemplos do princípio, da idade do aluno (escola, turma, time, grupo, família, atividades), faladas como hipótese ("imagina…", "e se fosse…"). Nunca são fato sobre a obra.
- Se o material disser que ninguém cita página, crie a regra "Sem página neste debate" (a plataforma tem textos fixos que falam em página).

COMO A PLATAFORMA MONTA A OPONENTE (é por isso que cada campo existe):
- "Você é {nome}, {oponente_descricao}". Depois "Seu papel no debate: {oponente_papel}". Depois a {oponente_personalidade}.
- "O que você já sabe" = {conhecimento_previo}: a situação do treino, curta, igual em todas as etapas.
- "Em cada parte do debate" = as regras de cada etapa.
- "Seus contra-argumentos" = as objeções, no formato: título, fala de exemplo, quando ela usa, quando reconhece o ponto.
- "Regras" = os guardrails.
- A plataforma já põe, fixas: responder em português, linguagem da idade, não pedir dados pessoais, sair do personagem se o aluno indicar risco, dizer que é a oponente de treino se perguntarem se é IA, não avaliar o aluno, encerrar só no fim. Não repita essas.
- As falas da oponente são de quem fala em voz alta: frases curtas, coloquial, sem palavrão, números e páginas por extenso.

VOCABULÁRIO RESERVADO: "rubrica", "checklist", "playbook", "roleplay" e "critério de avaliação" são a avaliação da plataforma. Nunca os use em nada que a oponente diz ou sabe (personalidade, conhecimento prévio, regras de etapa, primeiras falas, contra-argumentos, guardrails). O envio é recusado se aparecerem. Também não cite nome de metodologia de debate na fala da oponente.

REGRAS:
- Preserve na íntegra o que o material já trouxer pronto para a oponente (personalidade, camadas de informação, gatilhos e reações, sequências de perguntas, mudança de tom, regras). Transcreva em vez de resumir.
- Quando o material trouxer o caso dela em camadas (o que fala de saída, o que revela com pergunta aberta, com aprofundamento, o argumento de reserva, o que admite com pergunta fechada, o que concede só com uma sequência sem saída), mantenha as camadas na personalidade.
- Nunca infira números nem datas.
- Responda SEMPRE no formato estruturado pedido (JSON).`;

export const DEBATE_PART_NOTES: Record<DebatePart, string> = {
  debate_persona: `NESTA PARTE, devolva quem é a oponente, o que ela já sabe, o que o aluno lê e as regras:
- titulo: nome curto do roleplay (tema e lado do aluno).
- descricao: o card que o ALUNO lê, falando com ele ("você"): quem é a oponente, a missão dele, o que vai treinar, como funciona. Sem mediador nem tempo.
- objetivo: o que o aluno pratica, numa frase.
- palavras_chave: separadas por vírgula.
- oponente_descricao: continua a frase "Você é {nome}, …" (ex.: "uma aluna de 14 anos do 9º ano numa escola de Salvador, que sustenta a moção num treino voluntário de debate sobre a vida a partir do livro X, de Y.").
- oponente_papel: curto (ex.: "Debatedora que sustenta a moção").
- oponente_personalidade: em segunda pessoa ("Você…"), em blocos com título em caixa alta: a vida dela; o jeito; uma história da vida dela que explica a régua (exemplo de vida, nunca fato da obra); O DEBATE (moção, lados, caso da obra); COMO VOCÊ FALA; COMO O DEBATE ANDA (abre com a régua e os pontos de abertura; ouve e responde; na vez dela, pergunta; resposta final sem ponto novo; síntese generosa e despedida); O QUE VOCÊ REVELA, EM CAMADAS; MOMENTOS DA OBRA QUE VOCÊ CONHECE (lista: os únicos que ela usa); SUAS PERGUNTAS (sequências de perguntas fechadas, uma por vez); COMO O SEU TOM MUDA; SILÊNCIO E TRAVADAS (espera, não completa a frase, não dá dica).
- conhecimento_previo: 3 a 5 frases na voz de quem instrui a oponente: treino voluntário, obra e tema, lado sorteado, o que vale como exemplo, como ela abre.
- instrucao_aluno: uma frase ao aluno, comum a todas as etapas ("Você contesta a moção. Mostre, com …, que …, e responda aos pontos da oponente.").
- briefing: o cartão do aluno, com os tópicos "Moção", "Seu lado", "A oponente" e "Caso do livro" (uma ou duas frases cada).
- criterios_sucesso: 4 a 6 critérios do que o aluno precisa fazer, falando com ele.
- guardrails: as regras da oponente que valem o debate inteiro (nome curto + instrução em segunda pessoa). Inclua as partes da obra fora do debate, temas sensíveis, como tratar a vida do aluno e a dela, humor, respeito e "só o que foi dito". Não repita as fixas da plataforma.`,
  debate_steps: `NESTA PARTE, devolva o conteúdo de CADA etapa da metodologia e os contra-argumentos.
Cada etapa é um critério que o aluno escolhe treinar; escolher uma etapa abre um debate novo, inteiro, com foco naquele critério. Para cada etapa listada no fim destas instruções (use a mesma "ordem"):
- regras: 1 a 3 tópicos (título curto + texto) de como a oponente age para testar o aluno NESSE critério (ex.: na prova, aceitar momento fiel como fato e puxar livro↔vida; no raciocínio, aceitar o fato e contestar a ligação; na arguição, as perguntas fechadas dela). Em segunda pessoa, dirigido à oponente.
- foco_aluno: o que o aluno deve mostrar nessa etapa, uma frase falando com ele.
- primeiras_falas: 3 variações de como a oponente abre o debate nessa etapa, faladas em voz alta: se apresenta pelo nome, diz a régua ou quantos pontos tem, e termina pedindo para começar ("Posso começar?" ou parecido). Nada que só faça sentido no meio do debate.
contra_argumentos (campo "objecoes"): os gatilhos de CONTEÚDO do material (o que o aluno diz e como ela reage). Para cada um:
- titulo: curto.
- fala_exemplo: a reação dela, em primeira pessoa, como está no material.
- detalhes: quando ela usa (o que o aluno disse).
- ceder_se: quando ela reconhece o ponto do aluno, do ponto de vista dela (sempre com desfecho possível). Sem regra própria no material, use: uma sequência de perguntas fechadas mostra, sem saída, que a régua dela aplicada ao caso leva à conclusão do aluno.
Gatilhos de COMPORTAMENTO (silêncio, pergunta pessoal, parte que ela não reconhece, assunto fora do debate) não são contra-argumentos: ficam na personalidade e nas regras da outra parte.`,
};

const str = (description: string) => ({ type: "string", description });
const topics = (description: string) => ({
  type: "array",
  description,
  items: {
    type: "object",
    additionalProperties: false,
    properties: { titulo: { type: "string" }, texto: { type: "string" } },
    required: ["titulo", "texto"],
  },
});

/** Schema de uma fatia. `stepCount` fixa as ordens válidas das etapas. */
export function buildDebateSchema(part: DebatePart, stepCount: number) {
  if (part === "debate_persona") {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        titulo: str("Nome curto do roleplay."),
        descricao: str("Card que o aluno lê."),
        objetivo: str("O que o aluno pratica."),
        palavras_chave: str("Separadas por vírgula."),
        oponente_descricao: str("Continua \"Você é {nome}, …\"."),
        oponente_papel: str("Papel no debate, curto."),
        oponente_personalidade: str("Personalidade completa em blocos (ver instruções)."),
        conhecimento_previo: str("O que a oponente já sabe antes de começar."),
        instrucao_aluno: str("Instrução ao aluno comum a todas as etapas."),
        briefing: topics("Cartão do aluno: Moção, Seu lado, A oponente, Caso do livro."),
        criterios_sucesso: { type: "array", items: { type: "string" } },
        guardrails: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { nome: { type: "string" }, instrucao: { type: "string" } },
            required: ["nome", "instrucao"],
          },
        },
      },
      required: [
        "titulo", "descricao", "objetivo", "palavras_chave", "oponente_descricao", "oponente_papel",
        "oponente_personalidade", "conhecimento_previo", "instrucao_aluno", "briefing", "criterios_sucesso",
        "guardrails",
      ],
    };
  }
  const ordens = Array.from({ length: Math.max(1, stepCount) }, (_, i) => i + 1);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      etapas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ordem: { type: "integer", enum: ordens },
            regras: topics("Como a oponente age nesta etapa."),
            foco_aluno: { type: "string" },
            primeiras_falas: { type: "array", items: { type: "string" } },
          },
          required: ["ordem", "regras", "foco_aluno", "primeiras_falas"],
        },
      },
      objecoes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            titulo: { type: "string" },
            fala_exemplo: { type: "string" },
            detalhes: { type: "string" },
            ceder_se: { type: "string" },
          },
          required: ["titulo", "fala_exemplo", "detalhes", "ceder_se"],
        },
      },
    },
    required: ["etapas", "objecoes"],
  };
}

export interface DebateAnchorsInput {
  obra: string;
  tema: string;
  mocao: string;
  lado_aluno: "contra" | "a_favor";
  oponente_nome: string;
  oponente_idade: number;
  oponente_genero: "feminino" | "masculino";
}

/** Bloco fixo com as âncoras e as etapas, igual nas duas fatias. */
export function debateAnchorsBlock(a: DebateAnchorsInput, steps: ReadonlyArray<{ name: string }>): string {
  const ladoAluno = a.lado_aluno === "contra" ? "CONTESTA a moção" : "SUSTENTA a moção";
  const ladoOponente = a.lado_aluno === "contra" ? "SUSTENTA a moção" : "CONTESTA a moção";
  const pessoa = a.oponente_genero === "feminino" ? "uma estudante" : "um estudante";
  return [
    "ÂNCORAS (fixas, use exatamente assim, não altere):",
    `- Obra: ${a.obra}`,
    `- Tema: ${a.tema}`,
    `- Moção: "${a.mocao}"`,
    `- O aluno ${ladoAluno}. A oponente ${ladoOponente}.`,
    `- Oponente: ${a.oponente_nome}, ${pessoa} de ${a.oponente_idade} anos (concordância no ${a.oponente_genero}).`,
    "",
    "ETAPAS DA METODOLOGIA (na ordem):",
    ...steps.map((s, i) => `${i + 1}. ${s.name}`),
  ].join("\n");
}

export function parseDebateAnchors(v: unknown): DebateAnchorsInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const t = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const idade = Number(o.oponente_idade);
  const lado = o.lado_aluno === "a_favor" ? "a_favor" : o.lado_aluno === "contra" ? "contra" : null;
  const genero = o.oponente_genero === "masculino" ? "masculino" : o.oponente_genero === "feminino" ? "feminino" : null;
  if (!t("obra") || !t("tema") || !t("mocao") || !t("oponente_nome") || !lado || !genero) return null;
  if (!Number.isInteger(idade) || idade < 8 || idade > 99) return null;
  return {
    obra: t("obra"),
    tema: t("tema"),
    mocao: t("mocao"),
    lado_aluno: lado,
    oponente_nome: t("oponente_nome"),
    oponente_idade: idade,
    oponente_genero: genero,
  };
}
