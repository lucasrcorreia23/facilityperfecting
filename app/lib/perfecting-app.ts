/** Bases do app Perfecting (não a API) por ambiente. */
const APP_BASE: Record<"hml" | "prod", string> = {
  hml: "https://app-hml.perfecting.app",
  prod: "https://app.perfecting.app",
};

export type PerfectingAppEnv = keyof typeof APP_BASE;

export function perfectingAppBase(env: string | null | undefined): string {
  return env === "prod" ? APP_BASE.prod : APP_BASE.hml;
}

/** Link para o detalhe do roleplay na Perfecting do ambiente certo. */
export function perfectingRoleplayUrl(
  env: string | null | undefined,
  caseSetupId: number | string,
): string {
  return `${perfectingAppBase(env)}/roleplays/${caseSetupId}/details`;
}
