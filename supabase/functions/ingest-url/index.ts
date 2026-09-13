import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseHTML } from "npm:linkedom@0.18.5";
import { corsHeaders, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Sites de conteúdo bloqueiam UA de bot (mesmo aprendizado do WAF da Perfecting):
// apresentar-se como navegador real.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
};

const FETCH_TIMEOUT_MS = 20_000;

/** Baixa a URL e extrai texto legível do HTML (linkedom). */
async function fetchAsText(url: string): Promise<{ text: string; title: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(
      `site respondeu ${res.status} — pode ter bloqueado a coleta; cole o conteúdo manualmente`,
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!contentType.includes("html")) {
    // texto puro, markdown, etc. — usa direto
    return { text: body.trim(), title: url };
  }

  const { document } = parseHTML(body);
  for (const sel of ["script", "style", "noscript", "nav", "footer", "header", "iframe", "svg", "form"]) {
    document.querySelectorAll(sel).forEach((el: { remove(): void }) => el.remove());
  }
  const root = document.querySelector("main, article") ?? document.body;
  const text = (root?.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("não foi possível extrair texto da página");
  return { text, title: (document.title ?? "").trim() || url };
}

/**
 * Coleta o conteúdo de uma URL.
 * - { url }      → retorna { ok, text, title } (ex.: website do cliente).
 * - { sourceId } → coleta a URL da methodology_source e grava content/status.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireUser(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";

    if (sourceId) {
      const { data: source, error } = await db
        .from("methodology_sources")
        .select("id, url")
        .eq("id", sourceId)
        .single();
      if (error || !source) return json({ ok: false, error: "fonte não encontrada" }, 404);

      try {
        const { text, title } = await fetchAsText(source.url);
        await db
          .from("methodology_sources")
          .update({
            content: text,
            status: "fetched",
            error_detail: null,
            fetched_at: new Date().toISOString(),
          })
          .eq("id", sourceId);
        return json({ ok: true, text, title });
      } catch (e) {
        await db
          .from("methodology_sources")
          .update({ status: "error", error_detail: String(e instanceof Error ? e.message : e) })
          .eq("id", sourceId);
        return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
      }
    }

    if (!url) return json({ ok: false, error: "informe url ou sourceId" }, 400);
    if (!/^https?:\/\//i.test(url)) return json({ ok: false, error: "URL inválida" }, 400);

    const { text, title } = await fetchAsText(url);
    return json({ ok: true, text, title });
  } catch (e) {
    return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
