import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { buildSchema, buildSystem, PART_NOTES, PARTS_FOR_MODE, type SchemaPart } from "./schema.ts";
import { readAnthropicStream } from "../_shared/anthropic.ts";
import {
  listCallContexts,
  listObjectionTypes,
  loginSuperadmin,
  PerfectingError,
} from "../_shared/perfecting.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Falha de uma das metades — carrega o payload que vai no corpo do 502. */
class PartError extends Error {
  payload: unknown;
  constructor(payload: unknown) {
    super(typeof payload === "string" ? payload : "falha ao processar");
    this.payload = payload;
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : 0);

/**
 * Pré-prompt mestre de ingestão (modo NÃO-interativo): extrai → organiza nos blocos
 * que a Perfecting consome → aponta lacunas. Nunca pergunta; sempre devolve o JSON
 * estruturado. Marca "Hipótese Assumida" quando inferir.
 *
 * ⚠️ Cópia byte-idêntica em `app/(app)/criacao/page.tsx` (DEFAULT_IMPORT_PROMPT), que
 * é o texto aberto no editor da tela. Alterar SEMPRE as duas no mesmo commit: o front
 * decide "é prompt customizado?" comparando com a cópia dele, então uma divergência
 * faz quem abrir e salvar o editor fixar a versão antiga por cima desta, em silêncio.
 * Ao mudar o texto, subir PROMPT_VERSION no front (avisa quem tem prompt salvo).
 *
 * O que NÃO vai aqui, porque o código acrescenta: a lista de call_contexts válidos
 * (buildSystem) e o formato de saída (buildSchema, via structured outputs).
 */
const SYSTEM_BASE = `Você é um especialista em criação de Roleplays Comerciais para a plataforma Perfecting.

Sua tarefa: a partir de QUALQUER material fornecido (sites, PDFs, propostas, transcrições, playbooks, anotações), EXTRAIR e ORGANIZAR as informações para preencher um roleplay na Perfecting. Você NÃO conversa e NÃO pergunta — você sempre devolve o resultado estruturado.

COMO O RESULTADO É USADO. O roleplay pode ser gerado de dois jeitos, e o usuário só escolhe DEPOIS de você processar — então preencha todos os campos, mas saiba onde cada um pesa:
- Pelo PLAYBOOK da conta: cada etapa do playbook vira um roleplay. Tipo de chamada, comportamento e rubricas vêm das etapas, então "call_context_slug", "dificuldade", "cenario_instrucoes", "objetivo" e "habilidades" são IGNORADOS. Chegam à plataforma: "oferta_nome", "oferta_descricao", "perfil", "personas_variacao", "objecoes" e "guardrails".
- Por METODOLOGIA: um roleplay só, e aí todos os campos são usados.
"oferta_descricao", "perfil", "personas_variacao", "objecoes" e "guardrails" alimentam o roleplay nos DOIS modos — são eles que carregam o material do cliente até a plataforma. Priorize-os.

QUEM LÊ ISTO É O COMPRADOR. Tudo que chega à plataforma vira conhecimento do comprador simulado: ele "sabe" o que estiver nesses campos. O material costuma misturar dois lados:
- Lado do comprador (USE): quem ele é, a empresa e o segmento dele, dores, prioridades, orçamento, processo de decisão, o que usa hoje, receios, as frases que ele diz, e o que a oferta mostra publicamente.
- Lado do vendedor (NÃO TRANSCREVA): metodologia e etapas de venda, playbook, roteiro e perguntas que o vendedor deve fazer, o que o vendedor deve ou não deve fazer, critérios de avaliação e rubricas, campos e rotinas de CRM, metas da equipe comercial, documentos e processos internos da empresa que vende.
Use o lado do vendedor só para INFERIR o comprador — se o roteiro manda perguntar sobre orçamento, descreva a situação de orçamento do comprador, não a pergunta. Um comprador que conhece o método do vendedor ensina o método e conduz a venda no lugar dele, e o treino perde o sentido.

ETAPA 1 — EXTRAÇÃO. Extraia tudo que conseguir sobre:
- Oferta: nome, produto/serviço, proposta de valor, problema principal resolvido, diferenciais competitivos, ticket médio, ciclo de vendas, concorrentes, casos de uso, ROI, público-alvo.
- Quem compra: cargos/perfis, responsabilidades, KPIs, metas, medos, motivações, critérios de decisão, influenciadores, nível de autoridade, estilos de comunicação.
- Cenário: tipo de conversa (cold call, discovery, demo, proposta, negociação, renovação, expansão), como o lead chegou, nível de consciência, momento da jornada, urgência, situação atual.
- Objeções: preço, timing, prioridade, concorrente, autoridade, implementação, integração, segurança, ROI, troca de fornecedor, falta de necessidade. Use frases reais quando houver.

ETAPA 2 — ORGANIZAÇÃO. Separe o conteúdo nos blocos abaixo.

oferta_descricao (markdown curto) — USADO NOS DOIS MODOS. Vira a descrição da oferta na Perfecting. O que é vendido e para quem: produto/serviço, proposta de valor, problema resolvido, diferenciais, formato, e preço e condições VIGENTES quando o material trouxer. Escreva como a oferta se apresenta ao mercado — sem metodologia de venda, roteiro, argumentos que o vendedor deve usar, CRM ou processo interno.

perfil (markdown) — O CAMPO MAIS IMPORTANTE. Não é o retrato de uma pessoa: é a instrução com que a Perfecting monta o CONTEXTO, e é do contexto que saem uma ou várias personas. Use subtítulos e cubra tudo que o material permitir:
- Público-alvo: quem compra (empresa/segmento se B2B; perfil de pessoa se B2C)
- Gatilhos de urgência: o que faz agir agora, e não daqui a seis meses
- Prioridades e objetivos do período
- Dores mensuráveis: com números, prazos ou custos quando houver
- Estado futuro desejado: como é o "depois" que eles querem
- O que de fato motiva a compra (receita, risco, segurança, reconhecimento…)
- Processo de decisão: quem decide, quem influencia, quantas etapas, prazo típico
- Aversão a risco: o quanto temem mudar, o que preferem manter como está
- Objeções e receios — com frases reais quando houver
- Consciência do problema: sabem que têm? subestimam? que sintomas percebem?
- Consciência das soluções: já pesquisaram? o que acham do que existe no mercado?
- O que usam hoje para resolver isso e por que não basta
Se o material indicar cargos ou áreas típicas, cite-os como EXEMPLOS do espectro — não feche numa pessoa só, porque as personas são geradas a partir deste texto.
Descreva o comprador, não a venda: nada de etapas do playbook, perguntas do vendedor ou método.

personas_variacao (texto curto) — como as personas devem variar entre si quando o usuário pedir mais de uma: cargos e áreas diferentes, senioridade, estilos de comunicação, graus de consciência e de resistência. Só o que o material sustentar; sem base, devolva "".

objecoes (lista) — USADO NOS DOIS MODOS. As objeções que o comprador levanta. No modo playbook, cada uma vai só para as etapas em que o comprador a levantaria; por metodologia, vale para o roleplay inteiro. Para cada uma:
- "titulo": nome curto (ex.: "Orçamento comprometido")
- "tipo": um dos slugs disponíveis
- "fala_exemplo": como o comprador diz isso, na primeira pessoa — TRANSCREVA a frase real do material quando houver, em vez de reescrever
- "detalhes": o que está por trás, o que ele teme
- "ceder_se": a condição que faz o comprador ceder, do ponto de vista dele — o que ele precisa ouvir, ver ou receber (ex.: "Ver um caso de empresa do mesmo porte, com o retorno em números"). Não descreva técnica, etapa ou método do vendedor. SEMPRE preencha: sem ela o comprador repete a objeção até o fim e o treino não tem desfecho possível
Extraia todas as que o material trouxer, sem inventar. Lista vazia se não houver nenhuma.

guardrails (lista) — USADO NOS DOIS MODOS. Regras de comportamento do comprador simulado, quando o material as definir: o que ele nunca deve fazer, como reagir a promessa indevida ou a termo proibido ao vendedor. Valem em TODAS as etapas e em qualquer momento da conversa, então: nada que só faça sentido numa etapa (ex.: regras de fechamento ou de negociação); nunca mande o comprador encerrar, desligar ou abandonar a ligação — ele reage (desconfia, pede prova, resiste), mas continua na conversa; e nada que seja critério de avaliação do vendedor. Cada item tem "nome" (curto) e "instrucao" (a regra em segunda pessoa, dirigida ao comprador — ex.: "Se o vendedor prometer que a verba será aprovada, desconfie e peça que ele mostre como isso seria garantido"). Lista vazia se o material não definir regras.

cenario_instrucoes (markdown) — IGNORADO no modo playbook. Comportamento da persona durante a conversa: como reage, testes de fogo/objeções que aplica, critério de fechamento. Se o material já trouxer instruções ou prompts de comportamento prontos, PRESERVE-OS na íntegra (transcreva, não resuma). Sem base no material, seja breve em vez de inventar.

objetivo e habilidades — IGNORADOS no modo playbook (as rubricas vêm das etapas). Objetivo de treino do roleplay e habilidades de venda a treinar.

call_context_slug e dificuldade — IGNORADOS no modo playbook. Escolha o slug mais adequado entre os disponíveis e a dificuldade (easy/medium/hard) coerente com o cenário.

ETAPA 3 — LACUNAS. Liste o que ainda falta para um roleplay de alta qualidade, classificando cada item como "critico", "importante" ou "opcional". Use o campo "grupo" para separar o que vale sempre ("Oferta", "Contexto", "Personas") do que só importa fora do playbook ("Cenário (sem playbook)", "Rubricas (sem playbook)") — assim quem usa playbook não persegue lacuna que as etapas já resolvem.

REGRAS:
- SEJA COMPLETO E FIEL ao lado do comprador no material. Preserve o detalhe que o cliente preparou sobre ele; transcreva falas, exemplos e instruções de comportamento do comprador em vez de resumir. NÃO comprima esse conteúdo — é melhor um bloco longo e fiel do que um resumo curto. Isso não vale para o lado do vendedor (ver QUEM LÊ ISTO É O COMPRADOR).
- Priorize dados reais extraídos do material. Quando precisar inferir algo qualitativo, marque o trecho com "(Hipótese Assumida)". Nunca infira números nem datas.
- DATAS: a data de hoje vem no fim destas instruções. Prazo, condição comercial, campanha ou evento do material com data já passada NÃO é fato vigente — omita, ou reescreva sem a data. Não invente datas absolutas; quando precisar situar algo no tempo, use termos relativos ("no próximo trimestre", "há dois meses").
- VALORES: preços, orçamentos, percentuais e quantidades só quando estiverem no material, e sempre os mesmos em todos os campos. Os campos são gerados em partes que não se veem — um número inventado num campo vai contradizer outro.
- B2B ou B2C: infira da oferta e NUNCA assuma B2B por padrão. Um curso vendido a interessados individuais tem como público-alvo a PESSOA FÍSICA que quer se qualificar, não a instituição que oferece o curso. Linguagem e exemplos seguem o que a oferta realmente vende.
- Responda SEMPRE no formato estruturado pedido (JSON).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY não configurada nos secrets" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return json({ ok: false, error: "texto vazio" }, 400);
    // No modo playbook, cenário e rubricas vêm das etapas — não vale gerá-los.
    const mode = body.mode === "playbook" ? "playbook" : "methodology";
    // Prompt customizável pelo usuário (cai no padrão se não vier).
    const base = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : SYSTEM_BASE;

    // Taxonomias válidas da Perfecting, para o modelo escolher slugs reais.
    const saToken = await loginSuperadmin("hml");
    const contexts = await listCallContexts("hml", saToken);
    if (contexts.length === 0) {
      return json({ ok: false, error: "nenhum call_context disponível na Perfecting" }, 502);
    }
    const slugs = contexts.map((c) => c.slug);
    // Tipos de objeção: sem eles o modelo não tem enum para `objecoes[].tipo`, então
    // a extração de objeções é desligada em vez de gerar slug inválido (o enum não
    // aceita array vazio, e uma objeção com tipo errado não é criável na API).
    const objectionTypes = await listObjectionTypes("hml", saToken).catch(() => []);
    const objectionSlugs = objectionTypes.map((o) => o.slug);

    const system = buildSystem(contexts, objectionTypes, base);

    /** Uma metade do schema, pedida à Anthropic. Ver buildSchema() sobre o porquê. */
    const askFor = async (part: SchemaPart) => {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 32000,
          // ⚠️ SEMPRE streaming: com max_tokens alto a requisição não-streaming fica
          // minutos sem receber byte e morre no caminho. Mesmo helper do generate-playbook.
          stream: true,
          // Sem thinking: a saída JSON é garantida pelo schema (output_config.format),
          // então não pagamos tokens de raciocínio (os caros). Extração estruturada
          // não precisa de thinking. Custo ~5x menor que Opus + adaptive thinking.
          output_config: {
            format: { type: "json_schema", schema: buildSchema(slugs, objectionSlugs, part) },
          },
          system: [
            { type: "text", text: system, cache_control: { type: "ephemeral" } },
            ...(PART_NOTES[part] ? [{ type: "text", text: PART_NOTES[part] }] : []),
          ],
          messages: [{ role: "user", content: text }],
        }),
      });
      // Erro de HTTP chega antes de o stream abrir: aí o corpo ainda é JSON.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          res.status === 429
            ? "Limite de tokens por minuto da Anthropic atingido. O material é grande demais para o tier atual da conta — reduza o conteúdo, processe em partes, ou aumente o tier no console da Anthropic."
            : (data?.error?.message ?? data?.error ?? data);
        throw new PartError({ status: res.status, detail: msg });
      }
      const { text: generated, stopReason, usage } = await readAnthropicStream(res);
      if (stopReason === "max_tokens") {
        throw new PartError(
          "O material é muito extenso para ser estruturado em uma única resposta. Reduza o conteúdo (ou processe em partes) e tente de novo.",
        );
      }
      if (!generated.trim()) throw new PartError("resposta sem conteúdo estruturado");
      try {
        return { parsed: JSON.parse(generated) as Record<string, unknown>, usage };
      } catch {
        throw new PartError("A IA retornou um resultado incompleto. Tente reduzir o material.");
      }
    };

    // Em paralelo: o tempo total é o da fatia mais lenta, não a soma. É o que
    // mantém a função abaixo do teto de ~150s do gateway com material grande.
    let parts;
    try {
      parts = await Promise.all(
        PARTS_FOR_MODE[mode].map((p: SchemaPart) =>
          // O dossiê é opcional: se ele falhar, o resto do processamento vale igual.
          p === "dossier"
            ? askFor(p).catch((e) => {
              console.warn("process-import[dossie]:", e instanceof PartError ? JSON.stringify(e.payload) : String(e));
              return { parsed: {} as Record<string, unknown>, usage: undefined };
            })
            : askFor(p)
        ),
      );
    } catch (e) {
      if (e instanceof PartError) return json({ ok: false, error: e.payload }, 502);
      throw e;
    }

    const result = Object.assign({}, ...parts.map((p) => p.parsed));
    const usage = {
      input_tokens: parts.reduce((t, p) => t + num(p.usage?.input_tokens), 0),
      output_tokens: parts.reduce((t, p) => t + num(p.usage?.output_tokens), 0),
    };
    return json({ ok: true, result, usage, mode });
  } catch (e) {
    const detail = e instanceof PerfectingError ? { status: e.status, detail: e.detail } : { message: String(e) };
    return json({ ok: false, error: detail }, 500);
  }
});
