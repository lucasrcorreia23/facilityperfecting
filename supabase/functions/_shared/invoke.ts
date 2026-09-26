declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

/**
 * Dispara outra Edge Function sem esperar a resposta.
 *
 * Serve para dar wall clock novo a um trecho caro: cada invocação tem o seu
 * próprio limite (~150s), então uma cadeia de invocações roda o que não cabe
 * numa só. Generaliza o invokeSelf do implement-playbook.
 *
 * Nunca lança: falhar em disparar não pode derrubar quem chamou. Quando o
 * disparo se perde, quem reconcilia é o poll do fluxo correspondente.
 */
export function invokeFunction(name: string, body: Record<string, unknown>): void {
  const label = `${name}[${String(body.stage ?? "start")}]`;
  const run = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
    .then((r) => r.ok || console.error(`${label} não disparou:`, r.status))
    .catch((e) => console.error(`${label} não disparou:`, String(e)));

  // waitUntil mantém o fetch vivo depois da resposta desta invocação.
  EdgeRuntime.waitUntil(run);
}
