import { sseEvents } from "./sse.ts";

/**
 * Consome o streaming da Anthropic acumulando os text_delta. O JSON estruturado
 * chega como texto normal — o `output_config.format` só garante o formato.
 *
 * ⚠️ Com max_tokens alto, a chamada à Anthropic precisa ser SEMPRE streaming: uma
 * requisição não-streaming fica minutos sem receber byte nenhum e morre no caminho
 * (gateway/proxy derrubam a conexão ociosa antes de a resposta ficar pronta).
 */
export async function readAnthropicStream(res: Response): Promise<{
  text: string;
  stopReason: string | null;
  usage: Record<string, unknown> | null;
}> {
  let text = "";
  let stopReason: string | null = null;
  let usage: Record<string, unknown> | null = null;

  for await (const { event, data } of sseEvents(res)) {
    // deno-lint-ignore no-explicit-any
    const payload = (data ?? {}) as Record<string, any>;
    switch (event) {
      case "error":
        throw new Error(
          String(payload?.error?.message ?? "a Anthropic interrompeu o stream"),
        );
      case "message_start":
        usage = payload?.message?.usage ?? null;
        break;
      case "content_block_delta":
        if (payload?.delta?.type === "text_delta") text += payload.delta.text ?? "";
        break;
      case "message_delta":
        // stop_reason e os output_tokens finais só chegam aqui.
        stopReason = payload?.delta?.stop_reason ?? stopReason;
        if (payload?.usage) usage = { ...(usage ?? {}), ...payload.usage };
        break;
    }
  }
  return { text, stopReason, usage };
}

/**
 * Chamada curta com saída JSON garantida por schema. `what` descreve a tarefa nas
 * mensagens de erro ("ao distribuir objeções").
 */
export async function askStructured<T>({
  system,
  user,
  schema,
  maxTokens,
  what,
}: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  what: string;
}): Promise<T> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5",
      max_tokens: maxTokens,
      stream: true,
      output_config: { format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`IA falhou ${what} (${res.status}): ${data?.error?.message ?? "sem detalhe"}`);
  }
  const { text, stopReason } = await readAnthropicStream(res);
  if (stopReason === "max_tokens") throw new Error(`resposta da IA cortada ${what}`);
  return JSON.parse(text) as T;
}
