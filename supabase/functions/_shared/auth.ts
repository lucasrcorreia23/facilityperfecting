import { createClient } from "jsr:@supabase/supabase-js@2";
import { json } from "./cors.ts";

/**
 * Exige um usuário logado no Facility (ou a própria função chamando outra).
 *
 * O `verify_jwt` do gateway aceita QUALQUER JWT do projeto — inclusive a chave anon,
 * que é pública (vai no bundle do front). Sem esta checagem, qualquer um com a chave e
 * um id de rascunho dispara envio, reparo ou geração com IA numa conta de cliente.
 * O cadastro é fechado (`enable_signup = false`), então "usuário logado" = equipe.
 *
 * Chamadas internas (uma função invocando outra) usam a service role key.
 * Devolve a Response de erro, ou null se autorizado.
 */
export async function requireUser(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "não autenticado" }, 401);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRoleKey && token === serviceRoleKey) return null;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return json({ ok: false, error: "sessão inválida" }, 401);
  return null;
}
