/** Parseia um bloco SSE (linhas `event:`/`data:` já separadas do resto do buffer). */
function parseBlock(chunk: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* evento sem JSON (ex.: heartbeat) — mantém o texto cru */
  }
  return { event, data };
}

/**
 * Parser de SSE: acumula o buffer e emite um evento por bloco separado por
 * linha em branco. Serve tanto o stream do Engine de Implementação da
 * Perfecting quanto o streaming da Anthropic — o formato do wire é o mesmo.
 *
 * ⚠️ Faz flush do que sobrar no buffer quando o stream fecha: alguns backends
 * (ex.: o lote de personas) encerram a conexão logo após o último evento, sem
 * mandar a linha em branco de término — sem isto o último evento (muitas vezes
 * o que fecha o job, tipo `batch_ready`) fica preso no buffer e nunca é emitido.
 */
export async function* sseEvents(
  res: Response,
): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseBlock(chunk);
      if (parsed) yield parsed;
    }
  }
  if (buffer.trim()) {
    const parsed = parseBlock(buffer);
    if (parsed) yield parsed;
  }
}
