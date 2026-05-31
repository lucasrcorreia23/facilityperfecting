import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText as extractPdf, getDocumentProxy } from "npm:unpdf@0.12.1";
import mammoth from "npm:mammoth@1.8.0";
import { corsHeaders, json } from "../_shared/cors.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Sugere offer_name a partir do nome do arquivo ou 1ª linha do texto. */
function suggestOfferName(filename: string | undefined, text: string): string {
  const fromText = text.split("\n").map((l) => l.trim()).find((l) => l.length > 3);
  if (fromText) return fromText.slice(0, 120);
  if (filename) return filename.replace(/\.[^.]+$/, "");
  return "Nova oferta";
}

/**
 * Extrai texto de um arquivo no Storage (bucket 'imports').
 * PDF → unpdf; DOCX → mammoth. Retorna texto + sugestão de offer_name.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { filePath, filename, mime } = await req.json();
    if (!filePath) return json({ ok: false, error: "filePath obrigatório" }, 400);

    const { data: file, error } = await db.storage.from("imports").download(filePath);
    if (error || !file) return json({ ok: false, error: "arquivo não encontrado" }, 404);

    const buf = new Uint8Array(await file.arrayBuffer());
    const name: string = filename ?? filePath.split("/").pop() ?? "";
    const isPdf = (mime ?? "").includes("pdf") || name.toLowerCase().endsWith(".pdf");
    const isDocx =
      (mime ?? "").includes("word") ||
      name.toLowerCase().endsWith(".docx");

    let text = "";
    if (isPdf) {
      const pdf = await getDocumentProxy(buf);
      const { text: t } = await extractPdf(pdf, { mergePages: true });
      text = Array.isArray(t) ? t.join("\n") : t;
    } else if (isDocx) {
      const { value } = await mammoth.extractRawText({ arrayBuffer: buf.buffer });
      text = value;
    } else {
      // fallback: tratar como texto puro
      text = new TextDecoder().decode(buf);
    }

    text = text.replace(/\n{3,}/g, "\n\n").trim();
    return json({ ok: true, text, suggestedOfferName: suggestOfferName(name, text) });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
