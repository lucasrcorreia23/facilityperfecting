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
